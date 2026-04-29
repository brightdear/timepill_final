param(
    [string]$DatasetConfig = "ml/configs/dataset.local.yaml",
    [string]$TrainConfig = "ml/configs/detector.local.yaml"
)

$ErrorActionPreference = "Stop"

Write-Host "[1/2] Validating dataset: $DatasetConfig"
python ml/check_yolo_dataset.py --config $DatasetConfig

Write-Host "[2/2] Training detector: $TrainConfig"
python ml/train_detector.py --config $TrainConfig
