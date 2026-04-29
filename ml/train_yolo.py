"""
YOLO11n 알약 감지 모델 학습 스크립트
Google Colab + GPU 기준

사전 준비:
  - preprocess_aihub.py 실행 완료
  - Drive/dataset/yolo/ 폴더 존재

[셀 1] 환경 설치
  !pip install ultralytics -q

[셀 2] Drive 마운트
  from google.colab import drive
  drive.mount('/content/drive')

[셀 3] 이 스크립트 실행
  !python /content/drive/MyDrive/ml/train_yolo.py
"""

from ultralytics import YOLO
from pathlib import Path

DRIVE        = "/content/drive/MyDrive"
DATASET_YAML = f"{DRIVE}/dataset/yolo/dataset.yaml"
OUTPUT_DIR   = f"{DRIVE}/models/yolo"


# ─── 1. 학습 ──────────────────────────────────────────────────────────────────

def train():
    model = YOLO("yolo11n.pt")

    results = model.train(
        data=DATASET_YAML,
        epochs=100,
        imgsz=640,
        batch=16,
        device=0,
        project=OUTPUT_DIR,
        name="pill_v1",
        patience=20,

        # augmentation
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=45.0,
        translate=0.1,
        scale=0.5,
        flipud=0.5,
        fliplr=0.5,
        mosaic=1.0,
        close_mosaic=10,        # 마지막 10 에포크는 모자이크 끄고 실사 단위 미세조정
        perspective=0.001,      # 저각도 스캔 시뮬레이션

        # optimizer
        lr0=0.01,
        lrf=0.01,
        warmup_epochs=3,

        save=True,
        save_period=10,
    )

    print(f"\n학습 완료: {OUTPUT_DIR}/pill_v1/")
    return results


# ─── 2. 검증 ──────────────────────────────────────────────────────────────────

def validate(model_path):
    model = YOLO(model_path)
    metrics = model.val(data=DATASET_YAML, device=0)
    print(f"mAP50     : {metrics.box.map50:.3f}")
    print(f"mAP50-95  : {metrics.box.map:.3f}")
    print(f"Precision : {metrics.box.mp:.3f}")
    print(f"Recall    : {metrics.box.mr:.3f}")
    return metrics


# ─── 3. TFLite int8 export ────────────────────────────────────────────────────

def export_tflite(model_path):
    """
    best.pt → TFLite int8
    DATASET_YAML의 val 셋을 calibration에 사용.
    출력: best_saved_model/best_integer_quant.tflite
    """
    model = YOLO(model_path)
    model.export(
        format="tflite",
        int8=True,
        data=DATASET_YAML,
        imgsz=640,
    )
    tflite_path = Path(model_path).parent / "best_saved_model" / "best_integer_quant.tflite"
    print(f"TFLite int8: {tflite_path}")
    return str(tflite_path)


# ─── 메인 ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    train()

    best_pt = f"{OUTPUT_DIR}/pill_v1/weights/best.pt"
    validate(best_pt)
    export_tflite(best_pt)
