// Benchmark runner: menu, live HUD, soak and ramp tests, result output.
// Mirrors godot/scripts/main.gd; keep the two in sync when changing either.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { summarize } from './stats.js';

const PRESETS = [
  { label: 'Quick · 200 units · 2 min', mode: 'soak', units: 200, duration: 120 },
  { label: 'Soak · 200 units · 20 min', mode: 'soak', units: 200, duration: 1200 },
  { label: 'Soak · 400 units · 20 min', mode: 'soak', units: 400, duration: 1200 },
  { label: 'Ramp · find max units at cap', mode: 'ramp', units: 50, duration: 600 },
];
const MENU_UNITS = 200;
const WARMUP_S = 3;
const SOAK_WINDOW_S = 10;
const TREND_S = 120;
const RAMP_SETTLE_S = 1;
const RAMP_WINDOW_S = 3;
const RAMP_STEP = 50;
const RAMP_MAX_UNITS = 5000;

const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menu'), hud: $('hud'), stop: $('stop'), result: $('result'), resultText: $('result-text'),
  shadows: $('shadows'), bloom: $('bloom'), cap: $('cap'), scale: $('scale'), presets: $('presets'),
  device: $('device'), copy: $('copy'), back: $('back'),
};

// --- Renderer: HDR + 4x MSAA render target, optional bloom, ACES tone mapping (same chain as Godot) ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const world = new World();
world.setUnitCount(MENU_UNITS);

const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(world.scene, world.camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ratio = window.devicePixelRatio * Number(ui.scale.value);
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h);
  composer.setPixelRatio(ratio);
  composer.setSize(w, h);
  world.camera.aspect = w / h;
  world.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const capFps = () => Number(ui.cap.value);
const targetMs = () => 1000 / capFps();

function applyOptions() {
  world.light.castShadow = ui.shadows.checked;
  bloom.enabled = ui.bloom.checked;
  resize();
}
for (const el of [ui.shadows, ui.bloom, ui.cap, ui.scale]) el.addEventListener('change', applyOptions);

function deviceInfo() {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    userAgent: navigator.userAgent,
    gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    api: gl.getParameter(gl.VERSION),
    renderer: 'three.js r' + THREE.REVISION,
    resolution: `${renderer.domElement.width}x${renderer.domElement.height}`,
  };
}

// --- Bench state ---
let cfg = {};
let running = false;
let t0 = 0;
let elapsed = 0;
let windowDeltas = [];
let allDeltas = [];
let windows = [];
let windowStart = 0;
let rampBest = 0;
let rampFails = 0;
let wakeLock = null;

async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (running && document.visibilityState === 'visible') keepAwake();
});

async function start(preset) {
  cfg = { ...preset, cap: capFps(), shadows: ui.shadows.checked, bloom: ui.bloom.checked, scale: Number(ui.scale.value) };
  // Fullscreen + landscape + screen-on, to match the native app as closely as a browser allows.
  try {
    await document.documentElement.requestFullscreen?.();
    await screen.orientation?.lock?.('landscape');
  } catch {
    /* not supported everywhere; carry on */
  }
  await keepAwake();
  applyOptions();
  world.setUnitCount(cfg.units);
  windowDeltas = [];
  allDeltas = [];
  windows = [];
  windowStart = WARMUP_S;
  rampBest = 0;
  rampFails = 0;
  t0 = performance.now();
  elapsed = 0;
  running = true;
  ui.menu.hidden = true;
  ui.result.hidden = true;
  ui.stop.hidden = false;
  if (!wakeLock) console.warn('[bench] wake lock unavailable: keep the screen on manually');
  console.log('[bench] start', JSON.stringify(cfg));
}

function benchTick(dtMs) {
  // Skip the first seconds: shader compilation and startup hitches are not steady-state.
  if (elapsed < WARMUP_S) return;
  if (cfg.mode === 'soak') {
    windowDeltas.push(dtMs);
    allDeltas.push(dtMs);
    if (elapsed - windowStart >= SOAK_WINDOW_S) {
      closeWindow();
      windowStart = elapsed;
    }
    if (elapsed >= WARMUP_S + cfg.duration) finish();
    return;
  }
  // Ramp: after each unit-count change, let it settle, measure, then add more or stop.
  const since = elapsed - windowStart;
  if (since < RAMP_SETTLE_S) return;
  windowDeltas.push(dtMs);
  if (since >= RAMP_SETTLE_S + RAMP_WINDOW_S) {
    const s = closeWindow();
    const ok = s.avg_fps >= cfg.cap * 0.95 && s.jank <= s.frames * 0.02;
    windowStart = elapsed;
    if (ok) {
      rampBest = world.units.length;
      rampFails = 0;
      if (rampBest >= RAMP_MAX_UNITS) return finish();
      world.setUnitCount(rampBest + RAMP_STEP);
    } else if (++rampFails >= 2) {
      // One retry at the same count so a single hiccup doesn't end the test.
      return finish();
    }
  }
  if (elapsed >= WARMUP_S + cfg.duration) finish();
}

function closeWindow() {
  const s = summarize(windowDeltas, targetMs());
  s.t = Math.round(elapsed * 10) / 10;
  s.units = world.units.length;
  windows.push(s);
  windowDeltas = [];
  console.log('[bench] window', JSON.stringify(s));
  return s;
}

function avgFpsBetween(from, to) {
  let frames = 0;
  let secs = 0;
  for (const w of windows) {
    if (w.t > from && w.t <= to) {
      frames += w.frames;
      secs += w.frames / w.avg_fps;
    }
  }
  return secs > 0 ? frames / secs : 0;
}

function finish() {
  if (!running) return;
  running = false;
  if (cfg.mode === 'soak' && windowDeltas.length > 0) closeWindow();
  const result = {
    engine: 'web',
    device: deviceInfo(),
    config: cfg,
    duration_s: Math.round((elapsed - WARMUP_S) * 10) / 10,
    windows,
  };
  if (cfg.mode === 'soak') {
    result.overall = summarize(allDeltas, targetMs());
    const first = avgFpsBetween(0, WARMUP_S + TREND_S);
    const last = avgFpsBetween(elapsed - TREND_S, Infinity);
    result.first_2min_fps = first;
    result.last_2min_fps = last;
    // Below 100 means the phone slowed down over time, usually from heat.
    result.sustained_pct = first > 0 ? (100 * last) / first : 0;
  } else {
    result.max_units_at_cap = rampBest;
  }
  const json = JSON.stringify(result);
  console.log('[bench-result]', json);
  try {
    localStorage.setItem('bench-last-result', json);
  } catch {
    /* storage can be blocked; the console and copy button still have it */
  }
  ui.resultText.textContent = resultText(result);
  ui.copy.onclick = () => {
    const text = JSON.stringify(result, null, 2);
    const selectInstead = () => {
      ui.resultText.textContent = text;
      getSelection().selectAllChildren(ui.resultText);
    };
    navigator.clipboard?.writeText(text).then(() => (ui.copy.textContent = 'Copied'), selectInstead) ?? selectInstead();
  };
  ui.stop.hidden = true;
  ui.result.hidden = false;
  wakeLock?.release();
  wakeLock = null;
}

const on = (v) => (v ? 'on' : 'off');
const f1 = (v) => v.toFixed(1);

function resultText(r) {
  const c = r.config;
  const head = `${c.label} · cap ${c.cap} · shadows ${on(c.shadows)} · bloom ${on(c.bloom)} · scale ${Math.round(c.scale * 100)}%\n`;
  if (c.mode === 'ramp') return head + `Max units holding ${c.cap} fps: ${r.max_units_at_cap}`;
  const o = r.overall;
  return (
    head +
    `Avg ${f1(o.avg_fps)} fps · 1% low ${f1(o.low1_fps)} fps · p99 ${f1(o.p99_ms)} ms · janks ${o.jank} / ${o.frames} frames\n` +
    `First 2 min ${f1(r.first_2min_fps)} fps -> last 2 min ${f1(r.last_2min_fps)} fps (sustained ${r.sustained_pct.toFixed(0)}%)`
  );
}

// --- HUD ---
let hudFrames = [];
let hudNext = 0;
function hudTick(dtMs, now) {
  hudFrames.push(dtMs);
  if (now < hudNext) return;
  hudNext = now + 500;
  const s = summarize(hudFrames, targetMs());
  hudFrames = [];
  let line = `Web · ${s.avg_fps.toFixed(0)} fps · p99 ${f1(s.p99_ms)} ms · ${world.units.length} units`;
  if (running) {
    const phase = elapsed < WARMUP_S ? 'warm-up' : cfg.mode;
    line += `\n${phase} · ${Math.floor(elapsed)}s / ${cfg.duration}s`;
    if (cfg.mode === 'ramp') line += ` · best ${rampBest}`;
    if (!wakeLock) line += '\n⚠ no wake lock: keep screen on';
  }
  ui.hud.textContent = line;
}

// --- Main loop with a frame cap ---
// requestAnimationFrame runs at the display rate (often 90/120 Hz), so skip frames to honour the cap.
let last = 0;
let animTime = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const interval = targetMs();
  if (last && now - last < interval * 0.85) return;
  const dtMs = last ? now - last : interval;
  last = now;
  const dt = Math.min(dtMs / 1000, 0.1);
  animTime += dt;
  world.update(dt, animTime);
  composer.render();
  if (running) {
    elapsed = (performance.now() - t0) / 1000;
    benchTick(dtMs);
  }
  hudTick(dtMs, now);
}

// --- Menu ---
for (const p of PRESETS) {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.addEventListener('click', () => start(p));
  ui.presets.append(b);
}
ui.stop.addEventListener('click', finish);
ui.back.addEventListener('click', () => {
  ui.result.hidden = true;
  ui.menu.hidden = false;
  ui.copy.textContent = 'Copy JSON';
  world.setUnitCount(MENU_UNITS);
});

applyOptions();
const info = deviceInfo();
ui.device.textContent = `${info.gpu} · ${info.renderer}`;
console.log('[bench] device', JSON.stringify(info));
requestAnimationFrame(loop);

// Autostart for desktop/automated runs: ?preset=0&duration=30
const params = new URLSearchParams(location.search);
if (params.has('preset')) {
  const p = { ...PRESETS[Number(params.get('preset'))] };
  if (params.has('duration')) p.duration = Number(params.get('duration'));
  start(p);
}
