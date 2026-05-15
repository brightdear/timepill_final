# 0422 Prototype Detector

2026-04-22 기준 실사 중심 YOLO prototype detector 작업 폴더입니다.

## 포함 파일

- `build_real_prototype_dataset.py`
- `train_real_prototype_detector_colab.py`
- `validate_dataset_split.py`
- `prototype_detector_colab.ipynb`
- `preview_synthetic_positives.py`

## 전제

- 이 실험은 AIHub 전체 데이터가 아니라 `real_data_set` 기반 실사 prototype 검증용입니다.
- Google Drive 또는 로컬 root 아래에 아래 자산이 있다고 가정합니다.
  - `pill.yolov8`
  - `sample_img`
  - `backgrounds`
  - `hard_negatives`

## 현재 빌드/학습 정책

- `pill.yolov8` 실사 positive를 세션 단위로 다시 split합니다.
- exact duplicate는 같은 split 안에 남기지 않고 제거합니다.
- `hard_negatives`는 empty-label negative로 합칩니다.
- `hard_negatives`의 train split에는 낮은 확률로 scene-shadow augmentation을 적용합니다.
- synthetic positive는 train split에만 추가합니다.
- synthetic 개수는 요청값 그대로 쓰지 않고, real train positive 대비 비율 상한으로 자동 clamp합니다.
- 학습 후 `val`과 `test`를 모두 평가하고, metadata에 함께 기록합니다.

## 기본값

- `synthetic_target`: `200`
- `synthetic_max_ratio`: `0.40`
- `hard_negative_shadow_prob`: `0.15`
- `aihub total_cap`: `350`

즉 현재 기본 동작에서는 synthetic 요청값이 커도 real train positive의 40%를 넘기지 않도록 제한합니다.
synthetic 200장을 실제로 모두 넣으려면 real train positive가 **500장 이상** 필요합니다.
부족한 경우 `--synthetic-max-ratio 0.50` 등으로 비율을 올리거나 실사 데이터를 보강하세요.

## 권장 사용 순서

1. 데이터셋 빌드
2. split 검증
3. 학습
4. `best.pt`, `run_metadata.json`, `build_manifest.json`, `validation_report.json` 확인

## 예시

```powershell
python ml/0422/build_real_prototype_dataset.py `
  --real-root C:/timepillv3/ml/real_data_set `
  --output-root C:/timepillv3/ml/0422/pill_prototype_0422 `
  --copy-hard-negatives
```

```powershell
python ml/0422/validate_dataset_split.py `
  --dataset-root C:/timepillv3/ml/0422/pill_prototype_0422 `
  --json-out C:/timepillv3/ml/0422/pill_prototype_0422/validation_report.json
```

```powershell
python ml/0422/train_real_prototype_detector_colab.py `
  --data /content/datasets/pill_prototype_0422/dataset.yaml `
  --project /content/runs `
  --name pill_prototype_0422_v1 `
  --model yolo11n.pt `
  --epochs 500 `
  --batch 16 `
  --device 0 `
  --export-tflite `
  --drive-export-dir /content/drive/MyDrive/models
```

## 주의

- 로컬에서 synthetic 생성이나 hard negative shadow augmentation을 쓰려면 `Pillow`가 필요합니다.
- 디스크 공간이 부족하면 dataset build가 중간에 실패할 수 있습니다.
- prototype 단계에서는 반드시 `0 / 50 / 100` 같은 synthetic ablation으로 비교하는 것이 좋습니다.
