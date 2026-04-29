from __future__ import annotations

import argparse
from pathlib import Path

import yaml

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a YOLO dataset yaml and label files.")
    parser.add_argument("--config", required=True, help="Path to YOLO dataset yaml.")
    return parser.parse_args()


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def resolve_dataset_dir(config_path: Path, value: str) -> Path:
    raw = Path(value)
    if raw.is_absolute():
        return raw
    return (config_path.parent / raw).resolve()


def collect_images(directory: Path) -> dict[str, Path]:
    return {path.stem: path for path in directory.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES}


def collect_labels(directory: Path) -> dict[str, Path]:
    return {path.stem: path for path in directory.rglob("*.txt")}


def validate_label_file(label_path: Path) -> list[str]:
    errors: list[str] = []
    lines = label_path.read_text(encoding="utf-8").splitlines()
    for line_no, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped:
            continue
        parts = stripped.split()
        if len(parts) != 5:
            errors.append(f"{label_path}: line {line_no} should have 5 values, found {len(parts)}")
            continue

        try:
            class_id = int(parts[0])
            coords = [float(value) for value in parts[1:]]
        except ValueError:
            errors.append(f"{label_path}: line {line_no} contains non-numeric values")
            continue

        if class_id < 0:
            errors.append(f"{label_path}: line {line_no} has a negative class id")

        if any(value < 0.0 or value > 1.0 for value in coords):
            errors.append(f"{label_path}: line {line_no} has coordinates outside 0..1")

    return errors


def summarize_split(name: str, image_dir: Path, label_dir: Path) -> list[str]:
    errors: list[str] = []
    if not image_dir.exists():
        return [f"{name}: image directory does not exist: {image_dir}"]
    if not label_dir.exists():
        return [f"{name}: label directory does not exist: {label_dir}"]

    images = collect_images(image_dir)
    labels = collect_labels(label_dir)

    missing_labels = sorted(set(images) - set(labels))
    missing_images = sorted(set(labels) - set(images))

    print(f"[{name}] images={len(images)} labels={len(labels)}")

    if missing_labels:
        errors.append(f"{name}: {len(missing_labels)} images are missing labels")
    if missing_images:
        errors.append(f"{name}: {len(missing_images)} labels are missing images")

    for label_path in labels.values():
        errors.extend(validate_label_file(label_path))

    return errors


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).resolve()
    config = load_yaml(config_path)

    dataset_root = resolve_dataset_dir(config_path, config["path"])
    train_image_dir = dataset_root / config["train"]
    val_image_dir = dataset_root / config["val"]
    train_label_dir = dataset_root / "labels" / "train"
    val_label_dir = dataset_root / "labels" / "val"

    print(f"dataset_root={dataset_root}")
    print(f"classes={config.get('names', {})}")

    errors = []
    errors.extend(summarize_split("train", train_image_dir, train_label_dir))
    errors.extend(summarize_split("val", val_image_dir, val_label_dir))

    if errors:
        print("\nValidation failed:")
        for error in errors[:50]:
            print(f"- {error}")
        if len(errors) > 50:
            print(f"- ... and {len(errors) - 50} more")
        return 1

    print("\nDataset validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
