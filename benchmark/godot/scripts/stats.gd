extends RefCounted
## Frame-time statistics. Mirrors web/src/stats.js.


static func summarize(deltas: PackedFloat32Array, target_ms: float) -> Dictionary:
	var n := deltas.size()
	if n == 0:
		return {"frames": 0, "avg_fps": 0.0, "p50_ms": 0.0, "p99_ms": 0.0, "max_ms": 0.0, "low1_fps": 0.0, "jank": 0}
	var sorted := deltas.duplicate()
	sorted.sort()
	var total := 0.0
	var jank := 0
	for d in deltas:
		total += d
		# A frame that took 1.5x the target is a visibly missed frame.
		if d > target_ms * 1.5:
			jank += 1
	var p99: float = sorted[mini(n - 1, int(floor(n * 0.99)))]
	return {
		"frames": n,
		"avg_fps": 1000.0 * n / total,
		"p50_ms": sorted[int(n / 2.0)],
		"p99_ms": p99,
		"max_ms": sorted[n - 1],
		"low1_fps": 1000.0 / p99,
		"jank": jank,
	}
