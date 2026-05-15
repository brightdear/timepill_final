# ML Fresh Start

이 폴더는 기존 실험 스크립트를 보존하면서, 새 모델을 다시 시작할 수 있도록 정리한 최소 학습 파이프라인입니다.

## 권장 시작 순서

1. `detector`부터 만듭니다.
2. 데이터셋 구조를 검증합니다.
3. 작은 설정으로 1차 학습을 돌립니다.
4. 결과가 안정화되면 그다음에 분류기나 임베딩 모델을 붙입니다.

지금 프로젝트에서는 알약 위치를 먼저 안정적으로 찾는 것이 가장 중요하므로, 새 출발 기준의 1단계는 YOLO detector입니다.

## 새로 추가한 파일

- `configs/dataset.example.yaml`: YOLO 데이터셋 예시
- `configs/detector.example.yaml`: 학습 설정 예시
- `configs/dataset.local.yaml`: 실제 로컬 경로를 넣는 개인용 설정 파일 템플릿
- `check_yolo_dataset.py`: 데이터셋 구조/라벨 검증
- `train_detector.py`: 설정 파일 기반 detector 학습 엔트리포인트
- `run_detector.ps1`: 검증 후 학습까지 이어서 실행하는 런처
- `requirements-detector.txt`: detector 학습용 Python 패키지 목록

## 데이터셋 구조

```text
your_dataset/
  images/
    train/
    val/
  labels/
    train/
    val/
```

라벨 파일은 YOLO 형식이어야 합니다.

```text
class_id center_x center_y width height
```

모든 좌표는 `0.0 ~ 1.0` 범위의 정규화 값이어야 합니다.

## 빠른 시작

1. `ml/configs/dataset.local.yaml`에 실제 데이터 경로 입력
2. `ml/configs/detector.local.yaml`에 실행 설정 입력
3. 데이터셋 검증

```powershell
python ml/check_yolo_dataset.py --config ml/configs/dataset.local.yaml
```

4. 학습 시작

```powershell
python ml/train_detector.py --config ml/configs/detector.local.yaml
```

또는 런처로 한 번에 실행할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File ml/run_detector.ps1
```

## 처음부터 학습 vs 사전학습 사용

- 정말 처음부터 학습: `model.source`를 `yolo11n.yaml`처럼 아키텍처 yaml로 둡니다.
- 사전학습에서 시작: `model.source`를 `yolo11n.pt`처럼 weight 파일로 바꿉니다.

데이터가 아주 많지 않다면 보통은 사전학습 시작이 더 안정적입니다. 그래도 "완전 처음부터" 실험을 하고 싶다면 현재 예시 설정 그대로 사용할 수 있습니다.

## 의존성 설치

```powershell
pip install -r ml/requirements-detector.txt
```
