# Godot 4 vs web (three.js) benchmark

The same stylized, low-poly, top-down scene built twice, so you can compare **frame rate, frame-time consistency, heat and battery** on your own phones before choosing an engine.

```
benchmark/
  godot/   Godot 4.7 project (Mobile renderer, GDScript)
  web/     three.js + Vite, optionally wrapped as an Android app with Capacitor
  tools/   android_thermal_log.sh: logs phone temperature and battery over adb
```

## The scene (identical in both)

| | Setting |
|---|---|
| Layout | 64×40 field, 150 low-poly trees, 24 towers (base + rotating turret + glowing orb), N wandering units. Same seeded RNG in both builds, so every object is placed in the same spot. |
| Objects | One mesh instance per object, no instancing in either engine, so both make the same number of draw calls. |
| Camera | Perspective, 45° vertical FOV, fixed top-down angle |
| Lighting | One directional light with a single 2048² shadow map, plus flat ambient light |
| Materials | PBR (Godot `StandardMaterial3D` / three.js `MeshStandardMaterial`), roughness 0.8 |
| Post-processing | HDR, 4× MSAA, bloom (Godot glow / three.js `UnrealBloomPass`), ACES tone mapping |
| Frame cap | 60 (default) or 120 |
| Render scale | 100% of native pixels by default; 75% and 50% options |

The two builds look close but not pixel-identical. Light units and bloom shaders differ between engines; the rendering work is the same.

## Test modes

Both apps open on a menu with toggles (shadows, bloom, fps cap, render scale) and four presets:

- **Quick · 200 units · 2 min**: a sanity check.
- **Soak · 200 / 400 units · 20 min**: the heat test. Logs stats every 10 s. The **sustained %** compares the last 2 minutes with the first 2; below 100% means the phone throttled.
- **Ramp**: adds 50 units every few seconds until the phone can't hold the cap. Reports **max units at cap**, a measure of headroom.

Each run skips 3 s of warm-up, then reports average fps, 1% low fps, p99 frame time and **janks** (frames that took more than 1.5× the target time). Results go to:

- **Godot:** the on-screen summary, `adb logcat -s godot` (lines starting `[bench-result]`), and a JSON file in the app's `user://` folder.
- **Web:** the on-screen summary with a **Copy JSON** button, and the browser console (`chrome://inspect` on desktop Chrome).

## Running the Godot build

1. Install **Godot 4.7+** and open `benchmark/godot/project.godot`.
2. **Desktop check:** press F5. You can also autostart a preset from the command line: `godot --path benchmark/godot -- --preset=0 --duration=30`.
3. **Android:**
   - In Godot, go to Editor → Manage Export Templates and install the templates.
   - Go to Project → Export → Add → Android. Point Editor Settings → Export → Android at your Android SDK; Godot creates a debug keystore.
   - Turn on USB debugging on the phone, then click the **Remote Deploy** (Android) button in the top-right of the editor. It builds, installs and runs in one click.
4. **iOS:** Project → Export → iOS produces an Xcode project. This requires a Mac.

## Running the web build

```bash
cd benchmark/web
npm install
npm run build && npm run preview      # production build on http://localhost:4173
```

- **On an Android phone in Chrome:**
  - Connect over USB and run `adb reverse tcp:4173 tcp:4173`, then open `http://localhost:4173` on the phone. Using `localhost` matters: the screen wake lock and fullscreen only work on secure origins, and plain LAN `http://192.168…` isn't one.
  - Inspect the console from desktop Chrome at `chrome://inspect`.
- **As an installed app (the Capacitor route):** run `npx cap add android` once (needs Android Studio), then `npm run android` to build, sync and open Android Studio, and press Run. This measures the WebView inside an app, which is what you'd ship.
- **Autostart:** `http://localhost:4173/?preset=0&duration=30`.
- `npm run dev` gives hot reload while changing the scene. Use `preview` for real measurements.

## A fair test protocol

The heat result depends more on how you test than on the scene. For each engine, on the same phone:

1. **Same starting state:**
   - Let the phone cool for 15+ minutes until the battery temperature is back to its resting value.
   - Charge it above 50%.
   - Use airplane mode (Wi-Fi on only if needed for wireless adb) and the same screen brightness. Turn off auto-brightness.
2. **No charging cable.** USB charging adds heat. Use **wireless debugging** (Developer options → Wireless debugging, then `adb pair` / `adb connect`) for the logger.
3. **Start the heat logger, then the benchmark:**
   ```bash
   benchmark/tools/android_thermal_log.sh godot_200_soak.csv
   ```
   It records battery temperature, battery %, current draw (where the phone exposes it), Android's thermal status, and skin, CPU and GPU temperatures every 10 s.
4. **Run the same preset in both builds:**
   - `Soak · 200 units · 20 min` at the 60 fps cap is the main comparison.
   - Then `Ramp` for headroom.
   - Optionally repeat the soak at 120 fps.
5. **Compare:**
   - average fps and janks (smoothness)
   - sustained % (throttling)
   - temperature rise and battery % used over 20 minutes (heat and power)
   - max units at cap (headroom)
6. **Test at least one mid-range Android phone,** not only a flagship, and an iPhone if you will ship on iOS. On iOS, use Xcode's Energy and Thermal gauges instead of the adb script.

## Caveats

- **120 Hz screens:** at the 60 cap both builds skip frames to hold 60. On a 90 Hz screen, 60 can't divide evenly, so expect some judder in both.
- **Browser frame rate:** browsers can't exceed the display refresh rate, and some phones run Chrome at 60 Hz even on 120 Hz screens. Check the HUD.
- **CPU and GPU time:** neither build can split frame time into CPU and GPU parts. For that, use Android GPU Inspector or Perfetto on top of these runs.
- **Godot renderer:** these runs use Godot's **Mobile** renderer. On older or low-end Android, the **Compatibility** renderer (Project Settings → Rendering → Renderer) can be faster; it is worth a second run on low-end phones.
