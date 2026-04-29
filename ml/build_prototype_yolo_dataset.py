from __future__ import annotations

import argparse
import random
import shutil
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a prototype YOLO dataset from local real_data_set assets."
    )
    parser.add_argument(
        "--real-root",
        required=True,
        help="Path to ml/real_data_set in Colab/Drive.",
    )
    parser.add_argument(
        "--output-root",
        default="/content/datasets/pill_prototype",
        help="Output dataset root.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducible splits and synthetic generation.",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.15,
        help="Validation ratio for real positives and hard negatives.",
    )
    parser.add_argument(
        "--test-ratio",
        type=float,
        default=0.10,
        help="Test ratio for real positives and hard negatives.",
    )
    parser.add_argument(
        "--synthetic-target",
        type=int,
        default=300,
        help="How many synthetic positive images to generate from sample_img and backgrounds.",
    )
    parser.add_argument(
        "--skip-synthetic",
        action="store_true",
        help="Disable synthetic positive generation.",
    )
    parser.add_argument(
        "--copy-hard-negatives",
        action="store_true",
        help="Include hard negative images with empty labels.",
    )
    return parser.parse_args()


def ensure_split_dirs(dataset_root: Path) -> None:
    for split in ("train", "val", "test"):
        (dataset_root / "images" / split).mkdir(parents=True, exist_ok=True)
        (dataset_root / "labels" / split).mkdir(parents=True, exist_ok=True)


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def source_group_key(image_path: Path) -> str:
    name = image_path.name
    marker = ".rf."
    if marker in name:
        return name.split(marker, 1)[0]
    return image_path.stem


def list_split_items(image_dir: Path, label_dir: Path) -> list[tuple[Path, Path, str]]:
    items: list[tuple[Path, Path, str]] = []
    for image_path in sorted(image_dir.iterdir()):
        if not image_path.is_file() or image_path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        label_path = label_dir / f"{image_path.stem}.txt"
        if not label_path.exists():
            continue
        items.append((image_path, label_path, source_group_key(image_path)))
    return items


def assign_group_splits(
    group_keys: list[str],
    rng: random.Random,
    val_ratio: float,
    test_ratio: float,
) -> dict[str, str]:
    keys = list(group_keys)
    rng.shuffle(keys)

    n_total = len(keys)
    n_test = max(1, int(round(n_total * test_ratio))) if n_total >= 10 else 0
    n_val = max(1, int(round(n_total * val_ratio))) if n_total >= 6 else 0
    n_test = min(n_test, max(0, n_total - 2))
    n_val = min(n_val, max(0, n_total - n_test - 1))

    assignments: dict[str, str] = {}
    for index, key in enumerate(keys):
        if index < n_test:
            assignments[key] = "test"
        elif index < n_test + n_val:
            assignments[key] = "val"
        else:
            assignments[key] = "train"
    return assignments


def copy_real_positives(real_root: Path, dataset_root: Path, rng: random.Random, val_ratio: float, test_ratio: float) -> dict[str, int]:
    source_root = real_root / "pill.yolov8" / "train"
    image_dir = source_root / "images"
    label_dir = source_root / "labels"
    items = list_split_items(image_dir, label_dir)

    groups = sorted({group_key for _, _, group_key in items})
    split_by_group = assign_group_splits(groups, rng, val_ratio, test_ratio)

    counts = {"train": 0, "val": 0, "test": 0}
    for image_path, label_path, group_key in items:
        split = split_by_group[group_key]
        copy_file(image_path, dataset_root / "images" / split / image_path.name)
        copy_file(label_path, dataset_root / "labels" / split / label_path.name)
        counts[split] += 1

    return counts


def copy_hard_negatives(real_root: Path, dataset_root: Path, rng: random.Random, val_ratio: float, test_ratio: float) -> dict[str, int]:
    negative_dir = real_root / "hard_negatives"
    images = [path for path in sorted(negative_dir.iterdir()) if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES]
    rng.shuffle(images)

    n_total = len(images)
    n_test = int(round(n_total * test_ratio))
    n_val = int(round(n_total * val_ratio))

    counts = {"train": 0, "val": 0, "test": 0}
    for index, image_path in enumerate(images):
        if index < n_test:
            split = "test"
        elif index < n_test + n_val:
            split = "val"
        else:
            split = "train"

        target_image = dataset_root / "images" / split / f"neg_{image_path.stem}{image_path.suffix.lower()}"
        target_label = dataset_root / "labels" / split / f"neg_{image_path.stem}.txt"
        copy_file(image_path, target_image)
        target_label.write_text("", encoding="utf-8")
        counts[split] += 1

    return counts


def list_cutouts(sample_root: Path) -> list[Path]:
    return [path for path in sorted(sample_root.rglob("*.png")) if path.is_file()]


def list_backgrounds(background_root: Path) -> list[Path]:
    return [path for path in sorted(background_root.iterdir()) if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES]


def augment_background(image: Image.Image, rng: random.Random) -> Image.Image:
    from PIL import ImageEnhance

    bg = image.copy()
    bg_w, bg_h = bg.size

    zoom = rng.uniform(0.0, 0.20)
    if zoom > 0.01:
        left = int(rng.uniform(0, bg_w * zoom))
        top = int(rng.uniform(0, bg_h * zoom))
        right = bg_w - int(bg_w * zoom - left)
        bottom = bg_h - int(bg_h * zoom - top)
        right = max(left + 1, min(right, bg_w))
        bottom = max(top + 1, min(bottom, bg_h))
        bg = bg.crop((left, top, right, bottom)).resize((bg_w, bg_h), Image.LANCZOS)

    if rng.random() < 0.35:
        bg = ImageEnhance.Color(bg).enhance(rng.uniform(0.75, 1.25))
    if rng.random() < 0.30:
        bg = ImageEnhance.Brightness(bg).enhance(rng.uniform(0.80, 1.20))
    if rng.random() < 0.25:
        bg = ImageEnhance.Contrast(bg).enhance(rng.uniform(0.85, 1.15))
    return bg


def generate_synthetic_positives(real_root: Path, dataset_root: Path, rng: random.Random, target_count: int) -> int:
    from PIL import Image

    sample_root = real_root / "sample_img"
    background_root = real_root / "backgrounds"
    cutouts = list_cutouts(sample_root)
    backgrounds = list_backgrounds(background_root)

    if not cutouts or not backgrounds:
        return 0

    image_out = dataset_root / "images" / "train"
    label_out = dataset_root / "labels" / "train"
    created = 0
    attempts = 0

    while created < target_count and attempts < target_count * 20:
        attempts += 1

        cutout_path = rng.choice(cutouts)
        background_path = rng.choice(backgrounds)

        try:
            cutout = Image.open(cutout_path).convert("RGBA")
            background = augment_background(Image.open(background_path).convert("RGB"), rng)
        except Exception:
            continue

        bg_w, bg_h = background.size
        scale = rng.uniform(0.10, 0.30)
        target_size = int(min(bg_w, bg_h) * scale)
        cw, ch = cutout.size
        ratio = min(target_size / max(cw, 1), target_size / max(ch, 1))
        cutout = cutout.resize((max(1, int(cw * ratio)), max(1, int(ch * ratio))), Image.LANCZOS)
        cutout = cutout.rotate(rng.uniform(-20, 20), expand=True, resample=Image.BICUBIC)
        cw, ch = cutout.size

        if bg_w <= cw or bg_h <= ch:
            continue

        x = rng.randint(0, bg_w - cw)
        y = rng.randint(0, bg_h - ch)

        composite = background.copy()
        composite.paste(cutout, (x, y), cutout)

        output_size = 640
        composite = composite.resize((output_size, output_size), Image.LANCZOS)
        sx = output_size / bg_w
        sy = output_size / bg_h

        cx = (x * sx + cw * sx / 2) / output_size
        cy = (y * sy + ch * sy / 2) / output_size
        bw = (cw * sx) / output_size
        bh = (ch * sy) / output_size

        if bw < 0.05 or bh < 0.05:
            continue

        stem = f"syn_{created:05d}"
        composite.save(image_out / f"{stem}.jpg", quality=92)
        (label_out / f"{stem}.txt").write_text(
            f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}\n",
            encoding="utf-8",
        )
        created += 1

    return created


def write_dataset_yaml(dataset_root: Path) -> Path:
    yaml_path = dataset_root / "dataset.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"path: {dataset_root}",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                "nc: 1",
                "names: ['pill']",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return yaml_path


def count_split_images(dataset_root: Path) -> dict[str, int]:
    return {
        split: len(list((dataset_root / "images" / split).glob("*")))
        for split in ("train", "val", "test")
    }


def main() -> int:
    args = parse_args()
    rng = random.Random(args.seed)

    real_root = Path(args.real_root).resolve()
    dataset_root = Path(args.output_root).resolve()

    if not real_root.exists():
        raise FileNotFoundError(f"real_root not found: {real_root}")

    if dataset_root.exists():
        shutil.rmtree(dataset_root)

    ensure_split_dirs(dataset_root)

    positive_counts = copy_real_positives(real_root, dataset_root, rng, args.val_ratio, args.test_ratio)
    negative_counts = {"train": 0, "val": 0, "test": 0}
    if args.copy_hard_negatives:
        negative_counts = copy_hard_negatives(real_root, dataset_root, rng, args.val_ratio, args.test_ratio)

    synthetic_count = 0
    if not args.skip_synthetic and args.synthetic_target > 0:
        synthetic_count = generate_synthetic_positives(real_root, dataset_root, rng, args.synthetic_target)

    yaml_path = write_dataset_yaml(dataset_root)
    final_counts = count_split_images(dataset_root)

    print(f"dataset_root={dataset_root}")
    print(f"dataset_yaml={yaml_path}")
    print(f"real_positive_counts={positive_counts}")
    print(f"hard_negative_counts={negative_counts}")
    print(f"synthetic_train_added={synthetic_count}")
    print(f"final_image_counts={final_counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
