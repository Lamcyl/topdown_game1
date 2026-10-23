extends Node3D
## Benchmark runner: menu, live HUD, soak and ramp tests, result output.
## Mirrors web/src/main.js; keep the two in sync when changing either.

const World = preload("res://scripts/world.gd")
const Stats = preload("res://scripts/stats.gd")

const PRESETS := [
	{"label": "Quick · 200 units · 2 min", "mode": "soak", "units": 200, "duration": 120},
	{"label": "Soak · 200 units · 20 min", "mode": "soak", "units": 200, "duration": 1200},
	{"label": "Soak · 400 units · 20 min", "mode": "soak", "units": 400, "duration": 1200},
	{"label": "Ramp · find max units at cap", "mode": "ramp", "units": 50, "duration": 600},
]
const MENU_UNITS := 200
const WARMUP_S := 3.0
const SOAK_WINDOW_S := 10.0
const TREND_S := 120.0
const RAMP_SETTLE_S := 1.0
const RAMP_WINDOW_S := 3.0
const RAMP_STEP := 50
const RAMP_MAX_UNITS := 5000
const CAPS := [60, 120]
const SCALES := [1.0, 0.75, 0.5]

var world: World
var cfg := {}
var running := false

var _last_us := 0
var _t0_us := 0
var _elapsed := 0.0
var _anim_time := 0.0
var _window := PackedFloat32Array()
var _all := PackedFloat32Array()
var _windows: Array[Dictionary] = []
var _window_start := 0.0
var _ramp_best := 0
var _ramp_fails := 0
var _hud_frames := PackedFloat32Array()
var _hud_next := 0.0

var _menu: Control
var _hud: Label
var _stop_btn: Button
var _result: Control
var _result_label: Label
var _shadows: CheckButton
var _bloom: CheckButton
var _cap: OptionButton
var _scale: OptionButton


func _ready() -> void:
	world = World.new()
	add_child(world)
	world.build()
	world.set_unit_count(MENU_UNITS)
	_build_ui()
	_apply_options()
	print("[bench] device ", JSON.stringify(_device_info()))
	# Optional autostart for desktop runs: godot --path . -- --preset=0 [--duration=30]
	var args := {}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=")
		if kv.size() == 2:
			args[kv[0]] = kv[1]
	if args.has("preset"):
		var p: Dictionary = PRESETS[int(args.preset)].duplicate()
		if args.has("duration"):
			p.duration = int(args.duration)
		_start(p)


func _process(_delta: float) -> void:
	# Measure real frame-to-frame time ourselves; Godot's delta is smoothed by default.
	var now := Time.get_ticks_usec()
	var dt_ms := 1000.0 / _cap_fps() if _last_us == 0 else (now - _last_us) / 1000.0
	_last_us = now
	var dt := minf(dt_ms / 1000.0, 0.1)
	_anim_time += dt
	world.update(dt, _anim_time)
	if running:
		_elapsed = (now - _t0_us) / 1000000.0
		_bench_tick(dt_ms)
	_hud_tick(dt_ms)


func _cap_fps() -> int:
	return CAPS[_cap.selected] if _cap else 60


func _target_ms() -> float:
	return 1000.0 / _cap_fps()


func _apply_options() -> void:
	world.light.shadow_enabled = _shadows.button_pressed
	world.env.glow_enabled = _bloom.button_pressed
	Engine.max_fps = _cap_fps()
	get_viewport().scaling_3d_scale = SCALES[_scale.selected]


func _start(preset: Dictionary) -> void:
	cfg = preset.duplicate()
	cfg["cap"] = _cap_fps()
	cfg["shadows"] = _shadows.button_pressed
	cfg["bloom"] = _bloom.button_pressed
	cfg["scale"] = SCALES[_scale.selected]
	_apply_options()
	world.set_unit_count(cfg.units)
	_window = PackedFloat32Array()
	_all = PackedFloat32Array()
	_windows.clear()
	_window_start = WARMUP_S
	_ramp_best = 0
	_ramp_fails = 0
	_t0_us = Time.get_ticks_usec()
	_elapsed = 0.0
	running = true
	_menu.visible = false
	_result.visible = false
	_stop_btn.visible = true
	print("[bench] start ", JSON.stringify(cfg))


func _bench_tick(dt_ms: float) -> void:
	# Skip the first seconds: shader compilation and startup hitches are not steady-state.
	if _elapsed < WARMUP_S:
		return
	if cfg.mode == "soak":
		_window.append(dt_ms)
		_all.append(dt_ms)
		if _elapsed - _window_start >= SOAK_WINDOW_S:
			_close_window()
			_window_start = _elapsed
		if _elapsed >= WARMUP_S + cfg.duration:
			_finish()
		return
	# Ramp: after each unit-count change, let it settle, measure, then add more or stop.
	var since := _elapsed - _window_start
	if since < RAMP_SETTLE_S:
		return
	_window.append(dt_ms)
	if since >= RAMP_SETTLE_S + RAMP_WINDOW_S:
		var s := _close_window()
		var ok: bool = s.avg_fps >= cfg.cap * 0.95 and s.jank <= s.frames * 0.02
		_window_start = _elapsed
		if ok:
			_ramp_best = world.unit_count()
			_ramp_fails = 0
			if _ramp_best >= RAMP_MAX_UNITS:
				_finish()
				return
			world.set_unit_count(_ramp_best + RAMP_STEP)
		else:
			# One retry at the same count so a single hiccup doesn't end the test.
			_ramp_fails += 1
			if _ramp_fails >= 2:
				_finish()
				return
	if _elapsed >= WARMUP_S + cfg.duration:
		_finish()


func _close_window() -> Dictionary:
	var s := Stats.summarize(_window, _target_ms())
	s["t"] = snappedf(_elapsed, 0.1)
	s["units"] = world.unit_count()
	_windows.append(s)
	_window = PackedFloat32Array()
	print("[bench] window ", JSON.stringify(s))
	return s


func _finish() -> void:
	if not running:
		return
	running = false
	if cfg.mode == "soak" and _window.size() > 0:
		_close_window()
	var result := {
		"engine": "godot",
		"device": _device_info(),
		"config": cfg,
		"duration_s": snappedf(_elapsed - WARMUP_S, 0.1),
		"windows": _windows,
	}
	if cfg.mode == "soak":
		result["overall"] = Stats.summarize(_all, _target_ms())
		var first := _avg_fps_between(0.0, WARMUP_S + TREND_S)
		var last := _avg_fps_between(_elapsed - TREND_S, INF)
		result["first_2min_fps"] = first
		result["last_2min_fps"] = last
		# Below 100 means the phone slowed down over time, usually from heat.
		result["sustained_pct"] = 100.0 * last / first if first > 0.0 else 0.0
	else:
		result["max_units_at_cap"] = _ramp_best
	var json := JSON.stringify(result)
	print("[bench-result] ", json)
	var path := "user://bench_%s.json" % Time.get_datetime_string_from_system().replace(":", "-")
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(result, "  "))
		path = ProjectSettings.globalize_path(path)
	_result_label.text = _result_text(result) + "\n\nSaved: " + path
	_stop_btn.visible = false
	_result.visible = true


func _avg_fps_between(t_from: float, t_to: float) -> float:
	var frames := 0
	var secs := 0.0
	for w in _windows:
		if w.t > t_from and w.t <= t_to:
			frames += w.frames
			secs += w.frames / w.avg_fps
	return frames / secs if secs > 0.0 else 0.0


func _result_text(r: Dictionary) -> String:
	var c: Dictionary = r.config
	var head := "%s · cap %d · shadows %s · bloom %s · scale %d%%\n" % [
		c.label, c.cap, _on(c.shadows), _on(c.bloom), int(c.scale * 100)]
	if c.mode == "ramp":
		return head + "Max units holding %d fps: %d" % [c.cap, r.max_units_at_cap]
	var o: Dictionary = r.overall
	return head + (
		"Avg %.1f fps · 1%% low %.1f fps · p99 %.1f ms · janks %d / %d frames\n"
		+ "First 2 min %.1f fps -> last 2 min %.1f fps (sustained %.0f%%)"
	) % [o.avg_fps, o.low1_fps, o.p99_ms, o.jank, o.frames,
		r.first_2min_fps, r.last_2min_fps, r.sustained_pct]


func _on(v: bool) -> String:
	return "on" if v else "off"


func _hud_tick(dt_ms: float) -> void:
	_hud_frames.append(dt_ms)
	var now := Time.get_ticks_msec() / 1000.0
	if now < _hud_next:
		return
	_hud_next = now + 0.5
	var s := Stats.summarize(_hud_frames, _target_ms())
	_hud_frames = PackedFloat32Array()
	var line := "Godot · %.0f fps · p99 %.1f ms · %d units" % [s.avg_fps, s.p99_ms, world.unit_count()]
	if running:
		var phase: String = "warm-up" if _elapsed < WARMUP_S else cfg.mode
		line += "\n%s · %ds / %ds" % [phase, int(_elapsed), int(cfg.duration)]
		if cfg.mode == "ramp":
			line += " · best %d" % _ramp_best
	_hud.text = line


func _device_info() -> Dictionary:
	return {
		"os": OS.get_name(),
		"model": OS.get_model_name(),
		"gpu": RenderingServer.get_video_adapter_name(),
		"api": RenderingServer.get_video_adapter_api_version(),
		"renderer": RenderingServer.get_current_rendering_method(),
		"resolution": "%dx%d" % [DisplayServer.window_get_size().x, DisplayServer.window_get_size().y],
		"engine": Engine.get_version_info().string,
	}


# --- UI, built in code so the project stays a single tiny scene ---

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = Theme.new()
	root.theme.default_font_size = 22
	layer.add_child(root)

	_hud = Label.new()
	_hud.position = Vector2(16, 12)
	_hud.add_theme_constant_override("outline_size", 6)
	_hud.add_theme_color_override("font_outline_color", Color.BLACK)
	root.add_child(_hud)

	_stop_btn = Button.new()
	_stop_btn.text = "Stop"
	_stop_btn.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_stop_btn.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_stop_btn.position += Vector2(-16, 12)
	_stop_btn.visible = false
	_stop_btn.pressed.connect(_finish)
	root.add_child(_stop_btn)

	var box := _panel(root)
	_menu = box.get_parent().get_parent()
	box.add_child(_label("Godot 4 benchmark"))
	var info := _device_info()
	box.add_child(_label("%s · %s · %s" % [info.model, info.gpu, info.renderer], 16))
	var opts := HBoxContainer.new()
	opts.add_theme_constant_override("separation", 16)
	_shadows = _toggle(opts, "Shadows")
	_bloom = _toggle(opts, "Bloom")
	_cap = _choice(opts, ["60 fps cap", "120 fps cap"])
	_scale = _choice(opts, ["Scale 100%", "Scale 75%", "Scale 50%"])
	box.add_child(opts)
	for p in PRESETS:
		var b := Button.new()
		b.text = p.label
		b.pressed.connect(_start.bind(p))
		box.add_child(b)
	box.add_child(_label("Results print to logcat and save as JSON. Use tools/android_thermal_log.sh for heat.", 14))

	var rbox := _panel(root)
	_result = rbox.get_parent().get_parent()
	_result.visible = false
	_result_label = _label("")
	rbox.add_child(_result_label)
	var back := Button.new()
	back.text = "Back to menu"
	back.pressed.connect(_back_to_menu)
	rbox.add_child(back)


func _back_to_menu() -> void:
	_result.visible = false
	_menu.visible = true
	world.set_unit_count(MENU_UNITS)


func _panel(root: Control) -> VBoxContainer:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(center)
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.125, 0.16, 0.92)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(18)
	panel.add_theme_stylebox_override("panel", style)
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)
	return box


func _label(text: String, size := 22) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	return l


func _toggle(parent: Control, text: String) -> CheckButton:
	var t := CheckButton.new()
	t.text = text
	t.button_pressed = true
	t.toggled.connect(func(_on: bool): _apply_options())
	parent.add_child(t)
	return t


func _choice(parent: Control, items: Array) -> OptionButton:
	var o := OptionButton.new()
	for item in items:
		o.add_item(item)
	o.item_selected.connect(func(_i: int): _apply_options())
	parent.add_child(o)
	return o
