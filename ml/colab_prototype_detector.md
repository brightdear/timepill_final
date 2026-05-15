# Colab Prototype Detector

현재 `real_data_set` 기준으로 YOLO 프로토타입 detector를 먼저 돌리는 용도입니다.

## 가정

- 이 저장소가 Google Drive 안에 있음
- 경로 예시: `/content/drive/MyDrive/timepillv3/ml`
- AIHub는 이번 1차 프로토타입에서는 필수 아님
- 시작은 `yolo11n.pt` 사전학습 가중치 기반이 더 안전함

## Colab 셀 1

```python
from google.colab import drive
drive.mount("/content/drive", force_remount=True)
```

## Colab 셀 2

```bash
%cd /content/drive/MyDrive/timepillv3
!pip install -q ultralytics pillow
```

## Colab 셀 3

```bash
!python ml/build_prototype_yolo_dataset.py \
  --real-root /content/drive/MyDrive/timepillv3/ml/real_data_set \
  --output-root /content/datasets/pill_prototype \
  --copy-hard-negatives \
  --synthetic-target 300
```

## Colab 셀 4

```bash
!python ml/train_prototype_detector_colab.py \
  --data /content/datasets/pill_prototype/dataset.yaml \
  --project /content/runs \
  --name pill_prototype_v1 \
  --model yolo11n.pt \
  --epochs 40 \
  --batch 16 \
  --export-tflite \
  --drive-export-dir /content/drive/MyDrive/timepillv3/ml/exports
```

## 메모

- 정말 처음부터 학습해보고 싶으면 `--model yolo11n.yaml`로 바꾸면 됩니다.
- 지금 단계에서는 `yolo11n.pt`로 먼저 baseline을 확인하는 쪽이 더 좋습니다.
- `synthetic-target`은 0, 200, 300 정도로 비교해보는 것이 무난합니다.
- `hard_negatives`는 false positive를 줄이는 데 도움될 가능성이 큽니다.
