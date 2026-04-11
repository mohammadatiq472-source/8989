# W1-C13 Smoke Checklist

Formal command:

```bash
npm run gate:godot:week1
```

Pass criteria:
- `tmp/gates/godot_week1_gate_latest.json` exists.
- JSON `ok == true`.
- Steps include and pass:
  - `health`
  - `runtime`
  - `join`
  - `world`
  - `map-layout`
  - `godot-headless`

Notes:
- `join` accepts `409` only when script is run without `--strict-join`.
- If `/api/world/map-layout?scope=full` returns `403`, gate auto-falls back to `scope=bootstrap`.
