"""
Build a bootstrap MobileNet dataset from transparent pill cutouts.

Input assets come from this repo:
  - ml/real_data_set/sample_img     transparent PNG cutouts grouped by pill code
  - ml/real_data_set/backgrounds    real backgrounds

Output:
  - one folder per class under ml/mobilenet0422/_mobilenet_bootstrap
  - RGB jpg renders that roughly mimic YOLO bbox crops used by the app
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def parse_args() -> argparse.Namespace:
    ml_root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="Build a bootstrap MobileNet dataset from sample_img cutouts."
    )
    parser.add_argument(
        "--sample-root",
        default=str(ml_root / "real_data_set" / "sample_img"),
        help="Path to the transparent cutout class folders.",
    )
    parser.add_argument(
        "--background-root",
        default=str(ml_root / "real_data_set" / "backgrounds"),
        help="Path to real background images.",
    )
    parser.add_argument(
        "--output-root",
        default=str(ml_root / "_mobilenet_bootstrap"),
        help="Output folder where rendered RGB images are written.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--renders-per-source",
        type=int,
        default=4,
        help="How many RGB renders to generate per transparent source image.",
    )
    parser.add_argument(
        "--image-size",
        type=int,
        default=256,
        help="Square render size stored on disk. Training later resizes to 160.",
    )
    parser.add_argument(
        "--min-pill-ratio",
        type=float,
        default=0.58,
        help="Minimum ratio of pill max-side to output image size.",
    )
    parser.add_argument(
        "--max-pill-ratio",
        type=float,
        default=0.82,
        help="Maximum ratio of pill max-side to output image size.",
    )
    return parser.parse_args()


def list_images(folder: Path) -> list[Path]:
    return [
        path for path in sorted(folder.iterdir())
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    ]


def crop_square(image: Image.Image, rng: random.Random) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    zoom_ratio = rng.uniform(0.0, 0.18)
    crop_side = max(1, int(side * (1.0 - zoom_ratio)))

    if width == crop_side:
        left = 0
    else:
        left = rng.randint(0, width - crop_side)

    if height == crop_side:
        top = 0
    else:
        top = rng.randint(0, height - crop_side)

    return image.crop((left, top, left + crop_side, top + crop_side))


def build_background(
    background_paths: list[Path],
    image_size: int,
    rng: random.Random,
) -> Image.Image:
    if background_paths:
        image = Image.open(rng.choice(background_paths)).convert("RGB")
        image = crop_square(image, rng)

        if rng.random() < 0.35:
            image = ImageEnhance.Color(image).enhance(rng.uniform(0.80, 1.20))
        if rng.random() < 0.30:
            image = ImageEnhance.Brightness(image).enhance(rng.uniform(0.85, 1.15))
        if rng.random() < 0.25:
            image = ImageEnhance.Contrast(image).enhance(rng.uniform(0.90, 1.15))

        return image.resize((image_size, image_size), Image.LANCZOS)

    tone = tuple(rng.randint(185, 235) for _ in range(3))
    return Image.new("RGB", (image_size, image_size), tone)


def trim_transparent_border(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    return image.crop(bbox) if bbox else image


def paste_with_shadow(
    background: Image.Image,
    cutout: Image.Image,
    x: int,
    y: int,
    rng: random.Random,
) -> Image.Image:
    canvas = background.convert("RGBA")

    alpha = cutout.getchannel("A").point(lambda value: int(value * rng.uniform(0.16, 0.30)))
    shadow = Image.new("RGBA", cutout.size, (0, 0, 0, 0))
    shadow.putalpha(alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=rng.uniform(2.0, 5.0)))
    dx = rng.randint(-4, 5)
    dy = rng.randint(4, 9)
    canvas.paste(shadow, (x + dx, y + dy), shadow)
    canvas.paste(cutout, (x, y), cutout)
    return canvas.convert("RGB")


def render_bootstrap_image(
    cutout_path: Path,
    background_paths: list[Path],
    image_size: int,
    min_pill_ratio: float,
    max_pill_ratio: float,
    rng: random.Random,
) -> Image.Image:
    cutout = Image.open(cutout_path).convert("RGBA")
    cutout = trim_transparent_border(cutout)
    background = build_background(background_paths, image_size, rng)

    if rng.random() < 0.40:
        cutout = cutout.rotate(
            rng.uniform(-12, 12),
            expand=True,
            resample=Image.BICUBIC,
        )

    if rng.random() < 0.25:
        cutout = ImageEnhance.Brightness(cutout).enhance(rng.uniform(0.92, 1.08))
    if rng.random() < 0.25:
        cutout = ImageEnhance.Color(cutout).enhance(rng.uniform(0.95, 1.05))

    pill_target = rng.uniform(min_pill_ratio, max_pill_ratio) * image_size
    width, height = cutout.size
    scale = pill_target / max(width, height, 1)
    resized = cutout.resize(
        (max(1, int(width * scale)), max(1, int(height * scale))),
        Image.LANCZOS,
    )
    width, height = resized.size

    margin_x = max(2, int(image_size * 0.08))
    margin_y = max(2, int(image_size * 0.08))
    center_x = (image_size - width) // 2
    center_y = (image_size - height) // 2
    jitter_x = rng.randint(-margin_x, margin_x)
    jitter_y = rng.randint(-margin_y, margin_y)
    x = min(max(0, center_x + jitter_x), max(0, image_size - width))
    y = min(max(0, center_y + jitter_y), max(0, image_size - height))

    composite = paste_with_shadow(background, resized, x, y, rng)

    if rng.random() < 0.15:
        composite = composite.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.20, 0.80)))
    if rng.random() < 0.15:
        composite = ImageEnhance.Contrast(composite).enhance(rng.uniform(0.92, 1.08))

    return composite


def main() -> int:
    args = parse_args()
    sample_root = Path(args.sample_root).resolve()
    background_root = Path(args.background_root).resolve()
    output_root = Path(args.output_root).resolve()
    rng = random.Random(args.seed)

    if not sample_root.exists():
        raise FileNotFoundError(f"sample_root not found: {sample_root}")

    background_paths = list_images(background_root) if background_root.exists() else []
    class_dirs = [
        path for path in sorted(sample_root.iterdir())
        if path.is_dir() and len(list_images(path)) >= 2
    ]

    if not class_dirs:
        raise ValueError("No class folders with at least 2 images were found.")

    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    source_counts: dict[str, int] = {}
    render_counts: dict[str, int] = {}
    quality_histogram: Counter[int] = Counter()

    for class_dir in class_dirs:
        class_images = list_images(class_dir)
        class_output = output_root / class_dir.name
        class_output.mkdir(parents=True, exist_ok=True)
        source_counts[class_dir.name] = len(class_images)
        render_counts[class_dir.name] = 0

        for image_path in class_images:
            for render_index in range(args.renders_per_source):
                rendered = render_bootstrap_image(
                    cutout_path=image_path,
                    background_paths=background_paths,
                    image_size=args.image_size,
                    min_pill_ratio=args.min_pill_ratio,
                    max_pill_ratio=args.max_pill_ratio,
                    rng=rng,
                )
                quality = rng.randint(90, 96)
                quality_histogram[quality] += 1
                output_path = class_output / f"{image_path.stem}__r{render_index:02d}.jpg"
                rendered.save(output_path, quality=quality)
                render_counts[class_dir.name] += 1

    manifest = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "sample_root": str(sample_root),
        "background_root": str(background_root),
        "output_root": str(output_root),
        "seed": args.seed,
        "image_size": args.image_size,
        "renders_per_source": args.renders_per_source,
        "min_pill_ratio": args.min_pill_ratio,
        "max_pill_ratio": args.max_pill_ratio,
        "class_count": len(class_dirs),
        "background_count": len(background_paths),
        "source_counts": source_counts,
        "render_counts": render_counts,
        "jpeg_quality_histogram": dict(sorted(quality_histogram.items())),
    }
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )

    total_sources = sum(source_counts.values())
    total_renders = sum(render_counts.values())
    print(f"output_root={output_root}")
    print(f"class_count={len(class_dirs)}")
    print(f"background_count={len(background_paths)}")
    print(f"source_images={total_sources}")
    print(f"rendered_images={total_renders}")
    print(f"manifest={output_root / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
