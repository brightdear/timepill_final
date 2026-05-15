# Dataset Inventory

Workspace root: `C:\timepillv3`  
Snapshot date: `2026-04-22`

## Summary

All ML data assets currently live under `ml/`.

### Raw assets

| Path | Purpose | Current local count |
| --- | --- | ---: |
| `ml/real_data_set/pill.yolov8` | Real positive YOLO bbox dataset | 195 image + 195 label |
| `ml/real_data_set/sample_img` | Background-removed pill cutouts for synthetic generation | 22 folders, 920 PNG |
| `ml/real_data_set/backgrounds` | Background images for synthetic positives | 25 image |
| `ml/real_data_set/hard_negatives` | Negative images for false-positive suppression | 213 image |

### Built datasets present in this snapshot

| Path | Purpose | Current local count |
| --- | --- | ---: |
| `ml/_prototype_smoke` | Older split YOLO prototype dataset snapshot | 397 image + 397 label |

## Notes

### 1. `ml/real_data_set/pill.yolov8`

- This is the raw real positive dataset with YOLO-format labels.
- In the current local snapshot, only `train/images` and `train/labels` are populated.
- The bundled `data.yaml` points to `train/valid/test`, but the local snapshot does not fully contain those split folders yet.

### 2. `ml/real_data_set/sample_img`

- These are transparent PNG pill cutouts used to synthesize extra positive training images.
- The current local snapshot contains 22 pill-code folders and 920 PNG files total.

### 3. `ml/real_data_set/backgrounds`

- These are scene backgrounds used by the 0422 synthetic-positive builder.
- The current local snapshot contains 25 background images.

### 4. `ml/real_data_set/hard_negatives`

- These are negative images used to suppress YOLO false positives.
- The current local snapshot contains 210 `.jpg` files and 3 `.webp` files.

### 5. `ml/_prototype_smoke`

- This is an older already-built split dataset.
- Current split image counts:
  - `train`: 298
  - `val`: 59
  - `test`: 40
- It should be treated as a stale smoke snapshot, not as a source of truth for the latest raw asset counts.

## Important caveats

- `ml/0422/_smoke` is not present in the current local snapshot.
- Raw asset counts and older built-dataset counts do not necessarily match.
- For current 0422 experiments, prefer rebuilding from `ml/real_data_set` with `ml/0422/build_real_prototype_dataset.py` and inspecting the generated `build_manifest.json`.
