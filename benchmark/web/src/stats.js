// Frame-time statistics. Mirrors godot/scripts/stats.gd.
export function summarize(deltas, targetMs) {
  const n = deltas.length;
  if (n === 0) {
    return { frames: 0, avg_fps: 0, p50_ms: 0, p99_ms: 0, max_ms: 0, low1_fps: 0, jank: 0 };
  }
  const sorted = Float32Array.from(deltas).sort();
  let total = 0;
  let jank = 0;
  for (const d of deltas) {
    total += d;
    // A frame that took 1.5x the target is a visibly missed frame.
    if (d > targetMs * 1.5) jank++;
  }
  const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
  return {
    frames: n,
    avg_fps: (1000 * n) / total,
    p50_ms: sorted[Math.floor(n / 2)],
    p99_ms: p99,
    max_ms: sorted[n - 1],
    low1_fps: 1000 / p99,
    jank,
  };
}
