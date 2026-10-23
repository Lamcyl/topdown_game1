extends Node3D
## The benchmark scene: ground, trees, towers with glowing orbs, and wandering units.
## Layout, sizes, colours and movement rules match web/src/world.js.
## Every object is its own mesh instance (no MultiMesh) because that is how a
## first version of a real game is usually built; both engines get the same draw calls.

const Rng = preload("res://scripts/rng.gd")

const SEED := 1337
const TREE_COUNT := 150
const TOWER_COLS := 6
const TOWER_ROWS := 4
const UNIT_X := 30.0
const UNIT_Z := 18.0
const TEAM_COLORS := [Color("e07a5f"), Color("3d85c6"), Color("f2cc8f")]

var light: DirectionalLight3D
var env: Environment

var _rng
var _turrets: Array[Node3D] = []
var _unit_mesh: CylinderMesh
var _team_mats: Array[StandardMaterial3D] = []
var _units: Array[MeshInstance3D] = []
# Unit state lives in packed arrays to keep the per-frame loop cheap.
var _ux := PackedFloat32Array()
var _uz := PackedFloat32Array()
var _utx := PackedFloat32Array()
var _utz := PackedFloat32Array()
var _uspeed := PackedFloat32Array()
var _uphase := PackedFloat32Array()


func build() -> void:
	_rng = Rng.new(SEED)
	_build_environment()
	_build_camera()
	_build_ground()
	_build_trees()
	_build_towers()
	_unit_mesh = CylinderMesh.new()
	_unit_mesh.top_radius = 0.0
	_unit_mesh.bottom_radius = 0.5
	_unit_mesh.height = 1.2
	_unit_mesh.radial_segments = 8
	_unit_mesh.rings = 0
	for c in TEAM_COLORS:
		_team_mats.append(_mat(c))


func unit_count() -> int:
	return _units.size()


func set_unit_count(n: int) -> void:
	while _units.size() > n:
		_units.pop_back().queue_free()
	var keep := _units.size()
	_ux.resize(keep)
	_uz.resize(keep)
	_utx.resize(keep)
	_utz.resize(keep)
	_uspeed.resize(keep)
	_uphase.resize(keep)
	while _units.size() < n:
		var i := _units.size()
		var unit := MeshInstance3D.new()
		unit.mesh = _unit_mesh
		unit.material_override = _team_mats[i % TEAM_COLORS.size()]
		add_child(unit)
		_units.append(unit)
		_ux.append(_rng.range_f(-UNIT_X, UNIT_X))
		_uz.append(_rng.range_f(-UNIT_Z, UNIT_Z))
		_utx.append(_rng.range_f(-UNIT_X, UNIT_X))
		_utz.append(_rng.range_f(-UNIT_Z, UNIT_Z))
		_uspeed.append(_rng.range_f(2.0, 5.0))
		_uphase.append(_rng.range_f(0.0, TAU))


func update(dt: float, time_s: float) -> void:
	for t in _turrets:
		t.rotate_y(dt * 0.8)
	for i in _units.size():
		var x := _ux[i]
		var z := _uz[i]
		var dx := _utx[i] - x
		var dz := _utz[i] - z
		var d := sqrt(dx * dx + dz * dz)
		if d < 0.5:
			_utx[i] = _rng.range_f(-UNIT_X, UNIT_X)
			_utz[i] = _rng.range_f(-UNIT_Z, UNIT_Z)
		else:
			var step := minf(_uspeed[i] * dt, d)
			x += dx / d * step
			z += dz / d * step
			_ux[i] = x
			_uz[i] = z
		var y := 0.6 + sin(time_s * 8.0 + _uphase[i]) * 0.1
		_units[i].transform = Transform3D(Basis(Vector3.UP, atan2(dx, dz)), Vector3(x, y, z))


func _build_environment() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("9fc6e0")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("cfe3ff")
	env.ambient_light_energy = 0.35
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.glow_enabled = true
	env.glow_intensity = 0.8
	env.glow_bloom = 0.0
	env.glow_hdr_threshold = 1.0
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	light = DirectionalLight3D.new()
	light.light_energy = 1.0
	light.shadow_enabled = true
	# One shadow map, like three.js, instead of Godot's default split cascades.
	light.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	light.directional_shadow_max_distance = 80.0
	add_child(light)
	light.look_at_from_position(Vector3(20, 40, 15), Vector3.ZERO, Vector3.UP)


func _build_camera() -> void:
	var cam := Camera3D.new()
	cam.fov = 45.0
	cam.near = 0.5
	cam.far = 200.0
	add_child(cam)
	cam.look_at_from_position(Vector3(0, 38, 30), Vector3(0, 0, 2), Vector3.UP)
	cam.current = true


func _build_ground() -> void:
	var mesh := PlaneMesh.new()
	mesh.size = Vector2(120, 90)
	_add_mesh(mesh, _mat(Color("8fb573")), Vector3.ZERO)


func _build_trees() -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.0
	mesh.bottom_radius = 1.0
	mesh.height = 2.6
	mesh.radial_segments = 6
	mesh.rings = 0
	var mat := _mat(Color("5b8c5a"))
	for i in TREE_COUNT:
		var x: float = _rng.range_f(-34.0, 34.0)
		var z: float = _rng.range_f(-22.0, 22.0)
		var s: float = _rng.range_f(0.7, 1.4)
		var r: float = _rng.range_f(0.0, TAU)
		var tree := _add_mesh(mesh, mat, Vector3(x, 1.3 * s, z))
		tree.scale = Vector3(s, s, s)
		tree.rotation.y = r


func _build_towers() -> void:
	var base_mesh := CylinderMesh.new()
	base_mesh.top_radius = 1.1
	base_mesh.bottom_radius = 1.3
	base_mesh.height = 2.0
	base_mesh.radial_segments = 6
	base_mesh.rings = 0
	var turret_mesh := BoxMesh.new()
	turret_mesh.size = Vector3(1.0, 0.6, 1.6)
	var orb_mesh := SphereMesh.new()
	orb_mesh.radius = 0.35
	orb_mesh.height = 0.7
	orb_mesh.radial_segments = 8
	orb_mesh.rings = 4
	var base_mat := _mat(Color("c9c2b6"))
	var turret_mat := _mat(Color("4a4e69"))
	var orb_mat := _mat(Color("7fdbff"))
	orb_mat.emission_enabled = true
	orb_mat.emission = Color("7fdbff")
	orb_mat.emission_energy_multiplier = 4.0
	for col in TOWER_COLS:
		for row in TOWER_ROWS:
			var x := -25.0 + col * 10.0
			var z := -13.5 + row * 9.0
			_add_mesh(base_mesh, base_mat, Vector3(x, 1.0, z))
			var turret := _add_mesh(turret_mesh, turret_mat, Vector3(x, 2.3, z))
			turret.rotation.y = _rng.range_f(0.0, TAU)
			_turrets.append(turret)
			_add_mesh(orb_mesh, orb_mat, Vector3(x, 3.0, z))


func _add_mesh(mesh: Mesh, mat: Material, pos: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	add_child(mi)
	return mi


func _mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.8
	return m
