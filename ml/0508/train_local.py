from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import torch
import ultralytics
import yaml
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="로컬 GPU에서 알약 감지 모델 학습.")
    parser.add_argument("--data", required=True, help="build_real_prototype_dataset.py 가 만든 dataset.yaml 경로")
    parser.add_argument("--project", default="C:\\timepill_runs\\runs", help="Ultralytics 프로젝트 디렉토리")
    parser.add_argument("--name", default="pill_prototype_0508_v1", help="Run 이름")
    parser.add_argument(
        "--model",
        default="yolo11n.pt",
        help="yolo11n.pt (전이학습) 또는 yolo11n.yaml (스크래치).",
    )
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument(
        "--patience",
        type=int,
        default=40,
        help="검증 손실이 개선되지 않을 때 early stopping 기준 epoch 수.",
    )
    parser.add_argument(
        "--device",
        default="0",
        help="CUDA 장치 번호 (예: 0). GPU가 없으면 'cpu'.",
    )
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--save-period", type=int, default=25)
    parser.add_argument("--close-mosaic", type=int, default=20)
    parser.add_argument("--export-tflite", action="store_true")
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def maybe_copy_artifact(src: Path, dst_dir: Path) -> Path | None:
    if not src.exists():
        return None
    dst_dir.mkdir(parents=True, exist_ok=True)
    target = dst_dir / src.name
    if src.is_dir():
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(src, target)
    else:
        shutil.copy2(src, target)
    return target


def require_gpu(device_arg: str) -> str:
    if device_arg == "cpu":
        print("[경고] CPU 모드로 실행합니다. 학습이 매우 느릴 수 있습니다.", flush=True)
        return device_arg
    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA를 사용할 수 없습니다. GPU 드라이버와 CUDA 설치를 확인하거나 --device cpu 를 사용하세요."
        )
    return device_arg


def write_run_metadata(run_dir: Path, payload: dict[str, object]) -> Path:
    run_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = run_dir / "run_metadata.json"
    metadata_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
    return metadata_path


def load_yaml(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def resolve_dataset_root(data_yaml: Path, dataset_config: dict[str, object]) -> Path:
    raw_root = Path(str(dataset_config.get("path", data_yaml.parent)))
    if raw_root.is_absolute():
        return raw_root
    return (data_yaml.parent / raw_root).resolve()


def count_split_images(dataset_root: Path, dataset_config: dict[str, object]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for split in ("train", "val", "test"):
        split_rel = dataset_config.get(split)
        if not split_rel:
            counts[split] = 0
            continue
        image_dir = dataset_root / str(split_rel)
        if not image_dir.exists():
            counts[split] = 0
            continue
        counts[split] = sum(1 for path in image_dir.rglob("*") if path.is_file())
    return counts


def evaluate_split(model_path: Path, data_yaml: Path, device: str, split: str) -> dict[str, float]:
    metrics = YOLO(str(model_path)).val(data=str(data_yaml), device=device, split=split)
    return {
        "mAP50": round(metrics.box.map50, 6),
        "mAP50_95": round(metrics.box.map, 6),
        "precision": round(metrics.box.mp, 6),
        "recall": round(metrics.box.mr, 6),
    }


def print_metrics(split: str, metrics_summary: dict[str, float]) -> None:
    print(f"[{split}] mAP50={metrics_summary['mAP50']:.4f}")
    print(f"[{split}] mAP50-95={metrics_summary['mAP50_95']:.4f}")
    print(f"[{split}] precision={metrics_summary['precision']:.4f}")
    print(f"[{split}] recall={metrics_summary['recall']:.4f}")


def main() -> int:
    args = parse_args()
    data_yaml = Path(args.data).resolve()
    project_dir = Path(args.project).resolve()
    run_dir = project_dir / args.name
    resolved_device = require_gpu(args.device)
    dataset_config = load_yaml(data_yaml)
    dataset_root = resolve_dataset_root(data_yaml, dataset_config)
    split_image_counts = count_split_images(dataset_root, dataset_config)

    print(f"data={data_yaml}")
    print(f"dataset_root={dataset_root}")
    print(f"project={project_dir}")
    print(f"name={args.name}")
    print(f"model={args.model}")
    print(f"torch.cuda.is_available()={torch.cuda.is_available()}")
    print(f"resolved_device={resolved_device}")

    metadata: dict[str, object] = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "training_script": str(Path(__file__).resolve()),
        "training_script_sha256": file_sha256(Path(__file__).resolve()),
        "ultralytics_version": ultralytics.__version__,
        "data_yaml": str(data_yaml),
        "data_yaml_sha256": file_sha256(data_yaml),
        "dataset_root": str(dataset_root),
        "split_image_counts": split_image_counts,
        "torch_version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "device": resolved_device,
        "args": vars(args),
    }
    metadata_path = write_run_metadata(run_dir, metadata)
    print(f"run_metadata={metadata_path}")

    model = YOLO(args.model)
    model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=args.patience,
        device=resolved_device,
        workers=args.workers,
        seed=args.seed,
        project=str(project_dir),
        name=args.name,
        save=True,
        save_period=args.save_period,
        close_mosaic=args.close_mosaic,
        degrees=8.0,
        translate=0.05,
        scale=0.15,
        perspective=0.0003,
        fliplr=0.5,
        flipud=0.0,
        mosaic=0.5,
        hsv_h=0.015,
        hsv_s=0.30,
        hsv_v=0.20,
    )
    actual_run_dir = Path(model.trainer.save_dir)

    best_pt = actual_run_dir / "weights" / "best.pt"
    if not best_pt.exists():
        print(f"best checkpoint를 찾을 수 없습니다: {best_pt}")
        return 1

    metrics_summary: dict[str, dict[str, float]] = {}
    metrics_summary["val"] = evaluate_split(best_pt, data_yaml, resolved_device, "val")
    print_metrics("val", metrics_summary["val"])
    if split_image_counts.get("test", 0) > 0:
        metrics_summary["test"] = evaluate_split(best_pt, data_yaml, resolved_device, "test")
        print_metrics("test", metrics_summary["test"])
    else:
        print("[test] test 이미지가 없어 평가를 건너뜁니다.")

    exported_int8_path = ""
    exported_fp32_path = ""

    if args.export_tflite:
        print("[export] int8 TFLite 내보내는 중...", flush=True)
        exported_int8 = YOLO(str(best_pt)).export(
            format="tflite",
            int8=True,
            data=str(data_yaml),
            imgsz=args.imgsz,
        )
        exported_int8_path = str(Path(exported_int8).resolve())
        print(f"tflite_int8_export={exported_int8_path}")

        print("[export] float32 TFLite 내보내는 중...", flush=True)
        exported_fp32 = YOLO(str(best_pt)).export(
            format="tflite",
            int8=False,
            imgsz=args.imgsz,
        )
        exported_fp32_path = str(Path(exported_fp32).resolve())
        print(f"tflite_fp32_export={exported_fp32_path}")

    metadata["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
    metadata["metrics"] = metrics_summary
    metadata["best_checkpoint"] = str(best_pt)
    metadata["best_checkpoint_sha256"] = file_sha256(best_pt)
    metadata["tflite_int8_export"] = exported_int8_path
    metadata["tflite_fp32_export"] = exported_fp32_path
    write_run_metadata(actual_run_dir, metadata)

    print(f"\n학습 완료. 결과물: {actual_run_dir / 'weights' / 'best.pt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
