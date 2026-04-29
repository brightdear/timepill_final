# MobileNet Bootstrap Pipeline

이 문서는 `timepillv3`에서 MobileNet 임베딩 학습을 처음부터 다시 시작할 때의 기준 문서입니다.

## 왜 이렇게 나눴는가

- 지금 repo 안에 바로 쓸 수 있는 identity 데이터는 `ml/real_data_set/sample_img`뿐입니다.
- 이 데이터는 투명 PNG 컷아웃이라서, 그대로 학습하면 실제 앱 crop 분포와 어긋납니다.
- 그래서 먼저 `sample_img + backgrounds`로 RGB bootstrap 데이터셋을 만들고,
  그다음 MobileNet 임베딩 모델을 학습하도록 구조를 나눴습니다.

## 현재 기준 시작 순서

1. bootstrap 데이터셋 생성

```powershell
python ml/mobilenet0422/build_mobilenet_dataset.py
```

2. MobileNet 학습

```powershell
python ml/mobilenet0422/train_mobilenet.py --export-onnx
```

3. TFLite까지 필요하면

```powershell
python ml/mobilenet0422/train_mobilenet.py --export-onnx --export-tflite
```

## 생성되는 폴더

- `ml/mobilenet0422/_mobilenet_bootstrap`
  - 클래스별 RGB bootstrap 이미지
  - `manifest.json`
- `ml/mobilenet0422/_mobilenet_runs/bootstrap_mobilenet_v3_small`
  - `best.pt`
  - `last.pt`
  - `split_summary.json`
  - `run_summary.json`
  - `best.onnx`
  - `tflite/` (옵션)

## 이번 구조의 핵심 가정

- bootstrap 학습은 `sample_img` 기반입니다.
- validation/test는 클래스 분리(class-disjoint)로 잡습니다.
  - 목적: 나중에 처음 보는 약에도 임베딩이 어느 정도 일반화되는지 확인
- threshold는 이번 run에서 확정하지 않습니다.
  - `run_summary.json`의 `threshold_hint`는 임시 참고값일 뿐입니다.

## 앱 쪽과 맞춘 부분

- MobileNet 학습 입력 정규화는 ImageNet mean/std 기준입니다.
- 앱의 MobileNet 전처리도 같은 기준으로 맞춰야 하므로,
  `src/domain/scan/mobilenetEmbedder.ts`는 ImageNet normalization을 쓰도록 바꿨습니다.

## 아직 남아 있는 후속 작업

- 등록 UI는 아직 참조사진 저장 플로우가 연결되지 않았습니다.
- 실제 앱 스캔은 여전히 전체 프레임 기준 YOLO를 쓰고 있어서,
  중앙 가이드 crop 기반으로 다시 맞추는 작업이 필요합니다.
- bootstrap 모델만으로 최종 배포 threshold를 정하면 안 됩니다.
- 실제 등록 crop / 실제 스캔 crop / hard negative 사례를 모은 뒤 2차 fine-tuning이 필요합니다.

## 권장 해석

- `test_top1`: bootstrap 데이터에서의 최근접 동일 클래스 회수율
- `test_gap`: positive 평균 similarity와 negative 평균 similarity의 차이
- `threshold_hint`: 임시 기준선. 실제 앱 threshold로 바로 복사하지 말 것
