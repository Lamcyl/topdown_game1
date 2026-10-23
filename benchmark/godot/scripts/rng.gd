extends RefCounted
## Tiny LCG. Same algorithm and seed as web/src/rng.js, so both builds
## place every tree, tower and unit in the same spot.

var _state: int


func _init(seed_value: int) -> void:
	_state = seed_value & 0x7FFFFFFF


func next_float() -> float:
	_state = (_state * 1103515245 + 12345) & 0x7FFFFFFF
	return float(_state) / 2147483648.0


func range_f(lo: float, hi: float) -> float:
	return lo + (hi - lo) * next_float()
