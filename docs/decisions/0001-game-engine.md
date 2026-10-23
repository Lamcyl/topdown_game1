# 0001: Use Godot 4 as the game engine

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decision:** Build the game in **Godot 4** (Mobile renderer). The web route (three.js wrapped with Capacitor) is not pursued.

## Context

The game is a top-down 3D mobile game; gameplay is not decided yet. Requirements set at the start:

- **Look:** stylized, simple and elegant low-poly 3D, in the spirit of Tower Dominion.
- **Performance:** a steady 60 fps or better without overheating the phone.
- **Workflow:** quick to test on a real phone.
- **Business:** room for ads and in-app purchases.

## Options considered

| Option | Verdict |
|---|---|
| **Godot 4** | Shortlisted. Free (MIT), light, fast iteration, one-click deploy to Android, and its Mobile renderer handles this art style. |
| **Web: three.js / Babylon.js + Capacitor** | Shortlisted as the alternative. Fastest to iterate and can also be published to web game portals, but the browser adds runtime overhead. |
| Unity (URP) | Strong and the industry default for mobile, but closed source with a revenue-capped free tier and a history of disruptive pricing changes. Not preferred. |
| Unreal Engine 5 | Overkill for this style: heavy, slow builds, runs hot on phones. Rejected. |
| Cocos Creator | Light and mobile-focused, but a smaller English-speaking community and fewer 3D resources. Not pursued. |
| Defold | Mostly a 2D engine. Rejected for 3D. |
| Native code or Bevy | Far too much engine work for one game. Rejected. |

No published benchmark compares Godot 4 with web engines on phones for frame rate or heat. So both shortlisted options were measured directly; see the benchmark below.

## Monetization

Neither shortlisted option is plug-and-play like Unity, but Godot covers what this game needs:

- **Ads:** AdMob through community plugins (Poing Studios' plugin is the most used), including Google's consent dialog. Mediation through AdMob or AppLovin MAX is possible, with extra native setup.
- **Purchases:**
  - **Android:** Godot's official Google Play Billing plugin.
  - **iOS:** StoreKit through Godot's iOS plugins.
  - **RevenueCat:** has community Godot plugins.
- **Risk:** these plugins must keep up with Google and Apple SDK deadlines, and with new Godot releases.
- **Mitigation:** put ads and purchases behind one small interface in our own code (for example `Ads.show_rewarded()`), with a fake version for development, so a provider can be swapped without touching gameplay code.

The web route has better-maintained Capacitor plugins and can also earn on browser portals (Poki, CrazyGames). That advantage did not outweigh the performance results below.

## Benchmark

The same scene was built in both engines: [`benchmark/`](../../benchmark/README.md).

- **Scene:** 150 trees and 24 towers, each with a rotating turret and a glowing orb, plus N wandering units. Every object is placed identically by a shared seeded random number generator.
- **Rendering:** one mesh per object (no instancing), one directional light with a 2048 shadow map, 4× MSAA, bloom and ACES tone mapping.
- **Settings:** capped at 60 fps, full native resolution.
- **Builds:**
  - **Web:** three.js r186, run in Samsung Internet (Chromium 143, WebGL 2 on Vulkan through ANGLE).
  - **Godot:** Godot 4.7.1 with the Mobile renderer on Vulkan, release APK for arm64.

**Device:** Samsung SM-S947B, Xclipse 960 GPU, 3120×1440.

### Quick test: 200 units, 2 minutes

| | Web | Godot |
|---|---|---|
| Average fps | 60.0 | 60.0 |
| Dropped frames (over 1.5× target) | 0 | 0 |
| Median frame time | 16.7 ms | 16.7 ms |
| 99th-percentile frame time | 16.9 ms | 19.0 ms |
| Slowest frame | 17.9 ms | 21.4 ms |
| Slowdown over the run | none | none |

### Ramp test: add 50 units every 4 s until 60 fps can't be held

| | Web | Godot |
|---|---|---|
| Max units at 60 fps (passes while ≥95% of 60 fps and ≤2% dropped frames) | **2,250** | **4,700** |
| Last count with no repeated dropped frames | ~2,150 | ~3,400 |
| How it fails | Abruptly: 33 ms frames appear at 2,300 units | Gradually: from ~3,450 units, a few 33 ms frames every few seconds while the average stays near 59 fps |

### What the results show

- **Smoothness:** both engines are equally smooth at a normal load on this phone.
- **Headroom:** Godot holds about **1.5–2× more on-screen objects** at 60 fps.
  - Each unit is drawn separately, so this mostly measures per-object drawing overhead, which is higher in the browser.
  - A real game would batch identical objects (Godot `MultiMesh`), which narrows the gap.
  - The extra headroom also means less work per frame for the same scene. That should mean less heat and battery use, but it was not measured.
- **Frame-time wobble:** Godot's frame times vary by about 2 ms around the 16.7 ms target, and this does not grow with load. It points to frame pacing (Godot's `Engine.max_fps` limiter), not rendering cost. No frames were dropped because of it.

### Not measured

- **Heat and battery.** The 20-minute soak test was skipped by choice; the ramp result was enough to decide.
- **Mid-range and low-end Android phones.** Only one high-end phone was tested.
- **iPhone.** Testing needs a Mac with Xcode.

## Consequences and follow-ups

- **Project setup:** start the game as a Godot 4.7+ project using the **Mobile** renderer. Test on a mid-range Android phone early. Try the **Compatibility** renderer if low-end devices struggle.
- **Frame pacing:** don't cap frames with `Engine.max_fps`. Try Android frame pacing (`display/window/frame_pacing/android/*`) and V-Sync instead, and confirm the ~2 ms wobble disappears.
- **Many identical objects:** draw units, trees and projectiles with `MultiMesh` instancing.
- **Monetization:** add it late, behind the in-house interface described above.
- **Builds:** Android builds work without Android Studio (see `benchmark/README.md`). iOS builds will need a Mac.
- **Benchmark:** keep `benchmark/` in the repo, so the game's heavier scenes can be compared against these baselines.
