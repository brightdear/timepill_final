from __future__ import annotations

import argparse
import json
import math
import random
import shutil
from pathlib import Path

from build_real_prototype_dataset import ensure_split_dirs, generate_synthetic_positives


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a small local synthetic-positive preview set and save a contact sheet."
    )
    parser.add_argument(
        "--real-root",
        required=True,
        help="Root that contains sample_img and backgrounds.",
    )
    parser.add_argument(
        "--output-root",
        default="synthetic_preview",
        help="Directory where preview images and labels will be written.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=10,
        help="How many synthetic positives to generate.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--stage-assets",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Copy sample_img/backgrounds into the output root before generation.",
    )
    parser.add_argument(
        "--grid-name",
        default="synthetic_preview_grid.jpg",
        help="Filename for the contact sheet saved under output_root.",
    )
    return parser.parse_args()


def draw_yolo_boxes(image_path: Path, label_path: Path) -> Image.Image:
    from PIL import Image, ImageDraw

    image = Image.open(image_path).convert("RGB")
    if not label_path.exists():
        return image

    lines = [line.strip() for line in label_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not lines:
        return image

    draw = ImageDraw.Draw(image)
    width, height = image.size
    line_width = max(2, min(width, height) // 120)
    for line in lines:
        _, center_x, center_y, box_w, box_h = line.split()
        cx = float(center_x) * width
        cy = float(center_y) * height
        bw = float(box_w) * width
        bh = float(box_h) * height
        left = cx - bw / 2.0
        top = cy - bh / 2.0
        right = cx + bw / 2.0
        bottom = cy + bh / 2.0
        draw.rectangle((left, top, right, bottom), outline=(255, 64, 64), width=line_width)
    return image


def make_contact_sheet(image_paths: list[Path], label_dir: Path, output_path: Path) -> Path | None:
    from PIL import Image, ImageDraw

    if not image_paths:
        return None

    rendered: list[tuple[Path, Image.Image]] = []
    thumb_w = 320
    thumb_h = 320
    padding = 16
    title_h = 28

    for image_path in image_paths:
        labeled = draw_yolo_boxes(image_path, label_dir / f"{image_path.stem}.txt")
        preview = labeled.copy()
        preview.thumbnail((thumb_w, thumb_h), Image.LANCZOS)
        rendered.append((image_path, preview))

    cols = min(3, len(rendered))
    rows = math.ceil(len(rendered) / cols)
    sheet_w = padding + cols * (thumb_w + padding)
    sheet_h = padding + rows * (title_h + thumb_h + padding)
    sheet = Image.new("RGB", (sheet_w, sheet_h), (245, 245, 245))
    draw = ImageDraw.Draw(sheet)

    for idx, (image_path, preview) in enumerate(rendered):
        row = idx // cols
        col = idx % cols
        x = padding + col * (thumb_w + padding)
        y = padding + row * (title_h + thumb_h + padding)
        draw.text((x, y), image_path.name, fill=(32, 32, 32))
        paste_x = x + (thumb_w - preview.width) // 2
        paste_y = y + title_h + (thumb_h - preview.height) // 2
        sheet.paste(preview, (paste_x, paste_y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=92)
    return output_path


def main() -> int:
    args = parse_args()
    real_root = Path(args.real_root).resolve()
    output_root = Path(args.output_root).resolve()
    rng = random.Random(args.seed)

    if not real_root.exists():
        raise FileNotFoundError(f"real_root not found: {real_root}")

    if output_root.exists():
        shutil.rmtree(output_root)

    ensure_split_dirs(output_root)
    stats = generate_synthetic_positives(
        real_root=real_root,
        dataset_root=output_root,
        rng=rng,
        target_count=args.count,
        stage_assets=args.stage_assets,
        background_augment_copies=0,
        background_augment_include_original=True,
    )

    image_dir = output_root / "images" / "train"
    label_dir = output_root / "labels" / "train"
    image_paths = sorted(image_dir.glob("syn_*.jpg"))
    grid_path = make_contact_sheet(image_paths, label_dir, output_root / args.grid_name)

    print(f"output_root={output_root}")
    print(f"generated_images={len(image_paths)}")
    print(f"grid_path={grid_path if grid_path is not None else ''}")
    print(json.dumps(stats, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
