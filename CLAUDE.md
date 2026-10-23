# Project notes

- Engine: **Godot 4** (Mobile renderer), GDScript. See `docs/decisions/0001-game-engine.md`.
- **Planned: a web build for sharing test links.** When the owner asks for it, produce it with Godot's own Web export of the same project, not a separate three.js port. Keep the code GDScript and the art within what Godot's Compatibility renderer (used on the web) can show, so the web build keeps working.
- `benchmark/` holds the Godot vs three.js test scenes and is reference material, not game code.
