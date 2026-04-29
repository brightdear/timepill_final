from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a prototype pill detector in Google Colab.")
    parser.add_argument("--data", required=True, help="Path to dataset.yaml produced by build_prototype_yolo_dataset.py")
    parser.add_argument("--project", default="/content/runs", help="Ultralytics project directory")
    parser.add_argument("--name", default="pill_prototype_v1", help="Run name")
    parser.add_argument(
        "--model",
        default="yolo11n.pt",
        help="Use yolo11n.pt for pretrained prototype starts, or yolo11n.yaml for from-scratch.",
    )
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--patience", type=int, default=15)
    parser.add_argument("--device", default="0")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--save-period", type=int, default=10)
    parser.add_argument("--export-tflite", action="store_true")
    parser.add_argument("--drive-export-dir", default="", help="Optional Drive directory to copy best.pt and exports into.")
    return parser.parse_args()


def maybe_copy_artifact(src: Path, dst_dir: Path) -> None:
    if not src.exists():
        return
    dst_dir.mkdir(parents=True, exist_ok=True)
    target = dst_dir / src.name
    target.write_bytes(src.read_bytes())


def main() -> int:
    args = parse_args()
    data_yaml = Path(args.data).resolve()
    project_dir = Path(args.project).resolve()

    print(f"data={data_yaml}")
    print(f"project={project_dir}")
    print(f"name={args.name}")
    print(f"model={args.model}")

    model = YOLO(args.model)
    model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=args.patience,
        device=args.device,
        workers=args.workers,
        seed=args.seed,
        project=str(project_dir),
        name=args.name,
        save=True,
        save_period=args.save_period,
        close_mosaic=10,
        degrees=8.0,
        translate=0.05,
        scale=0.15,
        perspective=0.0003,
        fliplr=0.0,
        flipud=0.0,
        mosaic=0.5,
        hsv_h=0.015,
        hsv_s=0.30,
        hsv_v=0.20,
    )

    run_dir = project_dir / args.name
    best_pt = run_dir / "weights" / "best.pt"

    if best_pt.exists():
        metrics = YOLO(str(best_pt)).val(data=str(data_yaml), device=args.device)
        print(f"mAP50={metrics.box.map50:.4f}")
        print(f"mAP50-95={metrics.box.map:.4f}")
        print(f"precision={metrics.box.mp:.4f}")
        print(f"recall={metrics.box.mr:.4f}")
    else:
        print(f"best checkpoint not found: {best_pt}")
        return 1

    if args.export_tflite:
        exported = YOLO(str(best_pt)).export(
            format="tflite",
            int8=True,
            data=str(data_yaml),
            imgsz=args.imgsz,
        )
        print(f"tflite_export={exported}")

    if args.drive_export_dir:
        export_dir = Path(args.drive_export_dir).resolve()
        maybe_copy_artifact(best_pt, export_dir)
        maybe_copy_artifact(run_dir / "results.csv", export_dir)
        tflite_dir = run_dir / "weights" / "best_saved_model"
        if tflite_dir.exists():
            for artifact in tflite_dir.glob("*"):
                maybe_copy_artifact(artifact, export_dir)
        print(f"artifacts_copied_to={export_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
