# Medieval Iso Profile Baseline

This baseline is now centralized in:

- `My project/Assets/Editor/Map/MedievalIsoProfile.cs`

## Profile values

- `profileName`: `MedievalIsoProfile`
- `terrainPPU`: `100`
- `grid.cellSize`: `(0.9, 0.51966, 1)`
- `sortingAxis`: `(0, 1, -0.26)`
- required tilemap sort order:
  - `Ground`: `0`
  - `Decorations`: `1`
  - `Highlight`: `10`

## RenderGate thresholds

- local regression gate:
  - `localMaeThreshold`: `0.02`
  - `localChangedRatioThreshold`: `0.05`
- target alignment gate:
  - `targetMaeThreshold`: `0.22`
  - `targetChangedRatioThreshold`: `0.45`
  - scale search range: `[0.7, 1.6]`, step `0.05`
- target baseline:
  - `C:\Users\Buffoon Queer\Desktop\KosIqn.png`

## Formal editor entrypoints

- Apply baseline:
  - `YouZhou/Profiles/Apply Medieval Pack Profile (90x52, 0.51966)`
- Force re-import sprites and re-apply:
  - `YouZhou/Profiles/Reapply Medieval Import Profile (Force Scan)`
- Validate scene against baseline:
  - `YouZhou/Profiles/Validate Medieval Iso Profile`
- Run gate (baseline + validation + screenshot diff report):
  - `YouZhou/RenderGate/Run`
- Set baseline screenshot:
  - `YouZhou/RenderGate/Set Baseline`
- Open output folder:
  - `YouZhou/RenderGate/Open Output Folder`

## Output artifacts

- folder: `tmp/rendergate`
- files:
  - `latest.png`
  - `baseline.png`
  - `diff.png`
  - `latest_target_aligned.png`
  - `best_aligned_latest.png`
  - `diff_target_best.png`
  - `report.json`
