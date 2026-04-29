from __future__ import annotations

import argparse
from pathlib import Path

import yaml
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a YOLO detector from a yaml config.")
    parser.add_argument("--config", required=True, help="Path to detector config yaml.")
    return parser.parse_args()


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def resolve_path(base_dir: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (base_dir / path).resolve()


def build_train_kwargs(config: dict, config_path: Path) -> dict:
    paths_cfg = config["paths"]
    train_cfg = config["train"]
    augment_cfg = config.get("augment", {})
    project_cfg = config.get("project", {})

    dataset_yaml = resolve_path(config_path.parent, paths_cfg["dataset_yaml"])
    output_dir = resolve_path(config_path.parent, paths_cfg["output_dir"])

    output_dir.mkdir(parents=True, exist_ok=True)

    kwargs = {
        "data": str(dataset_yaml),
        "epochs": train_cfg.get("epochs", 100),
        "imgsz": train_cfg.get("imgsz", 640),
        "batch": train_cfg.get("batch", 16),
        "patience": train_cfg.get("patience", 20),
        "project": str(output_dir),
        "name": project_cfg.get("name", "detector_run"),
        "seed": train_cfg.get("seed", 42),
        "cache": train_cfg.get("cache", False),
        "workers": train_cfg.get("workers", 8),
        "device": train_cfg.get("device", 0),
        "save": True,
        "save_period": 10,
    }
    kwargs.update(augment_cfg)
    return kwargs


def export_artifacts(best_model_path: Path, export_config: dict) -> None:
    if not export_config.get("enabled", False):
        return

    formats = export_config.get("formats", [])
    model = YOLO(str(best_model_path))
    for export_format in formats:
        print(f"Exporting {export_format}...")
        model.export(format=export_format)


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).resolve()
    config = load_yaml(config_path)

    model_source = config["model"]["source"]
    train_kwargs = build_train_kwargs(config, config_path)

    print(f"config={config_path}")
    print(f"model_source={model_source}")
    print(f"dataset={train_kwargs['data']}")
    print(f"output_project={train_kwargs['project']}")
    print(f"run_name={train_kwargs['name']}")

    model = YOLO(model_source)
    model.train(**train_kwargs)

    best_model_path = Path(train_kwargs["project"]) / train_kwargs["name"] / "weights" / "best.pt"
    if best_model_path.exists():
        print("\nValidation")
        metrics = YOLO(str(best_model_path)).val(data=train_kwargs["data"], device=train_kwargs["device"])
        print(f"mAP50={metrics.box.map50:.4f}")
        print(f"mAP50-95={metrics.box.map:.4f}")
        print(f"precision={metrics.box.mp:.4f}")
        print(f"recall={metrics.box.mr:.4f}")
        export_artifacts(best_model_path, config.get("export", {}))
    else:
        print(f"best model not found: {best_model_path}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
