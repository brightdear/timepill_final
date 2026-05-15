"""
pill zip augmentation script
입력: Roboflow YOLOv8 zip (train/images + train/labels)
출력: augmented_output/ 폴더 (동일 구조)

각 이미지마다 아래 조합을 랜덤으로 1개 적용:
  rotation  × {0, 90, 180, 270} (PIL ROTATE = CCW 기준)
  flip      × {없음, 좌우, 상하, 둘다}
  brightness× {0.80, 0.90, 1.00}
  contrast  × {1.00, 1.10}

EXIF orientation 보정 후 변환.
bbox 좌표도 rotation/flip 에 맞춰 함께 변환.
"""

from __future__ import annotations

import argparse
import io
import random
import zipfile
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


# ── bbox 변환 헬퍼 ────────────────────────────────────────────────────────────

def _transform_lines(label_text: str, fn, remap_to_pill: bool = False) -> str:
    lines = []
    for line in label_text.strip().splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            lines.append(line)
            continue
        cls = "0" if remap_to_pill else parts[0]
        cx, cy, w, h = map(float, parts[1:])
        cx, cy, w, h = fn(cx, cy, w, h)
        cx = max(0.0, min(1.0, cx))
        cy = max(0.0, min(1.0, cy))
        w  = max(0.0, min(1.0, w))
        h  = max(0.0, min(1.0, h))
        lines.append(f"{cls} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
    return "\n".join(lines) + "\n"


def apply_rotation(img: Image.Image, label: str, angle: int, remap_to_pill: bool = False):
    """PIL ROTATE_N = CCW 회전. bbox 도 동일 방향으로 변환."""
    if angle == 0:
        return img, label
    if angle == 90:   # CCW 90°
        return (
            img.transpose(Image.ROTATE_90),
            _transform_lines(label, lambda cx, cy, w, h: (cy, 1 - cx, h, w), remap_to_pill),
        )
    if angle == 180:
        return (
            img.transpose(Image.ROTATE_180),
            _transform_lines(label, lambda cx, cy, w, h: (1 - cx, 1 - cy, w, h), remap_to_pill),
        )
    if angle == 270:  # CW 90°
        return (
            img.transpose(Image.ROTATE_270),
            _transform_lines(label, lambda cx, cy, w, h: (1 - cy, cx, h, w), remap_to_pill),
        )
    return img, label


def apply_flip(img: Image.Image, label: str, hflip: bool, vflip: bool, remap_to_pill: bool = False):
    if hflip:
        img   = img.transpose(Image.FLIP_LEFT_RIGHT)
        label = _transform_lines(label, lambda cx, cy, w, h: (1 - cx, cy, w, h), remap_to_pill)
    if vflip:
        img   = img.transpose(Image.FLIP_TOP_BOTTOM)
        label = _transform_lines(label, lambda cx, cy, w, h: (cx, 1 - cy, w, h), remap_to_pill)
    return img, label


# ── small bbox 크롭 ───────────────────────────────────────────────────────────

def _crop_small_bbox(img: Image.Image, label_text: str, threshold_ratio: float = 0.01, crop_ratio: float = 0.8):
    """
    이미지 내 bbox 면적이 max(iw,ih)^2 * threshold_ratio 미만이면
    bbox 중심을 기준으로 max(iw,ih)*crop_ratio 크기의 정사각형 크롭.
    small bbox가 없으면 원본 그대로 반환.
    """
    iw, ih = img.size
    max_dim = max(iw, ih)
    threshold = threshold_ratio * max_dim * max_dim

    parsed = []
    for line in label_text.strip().splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        cls = parts[0]
        cx, cy, bw, bh = map(float, parts[1:])
        area_px = (bw * iw) * (bh * ih)
        parsed.append((cls, cx, cy, bw, bh, area_px))

    small = [p for p in parsed if p[5] < threshold]
    if not small:
        return img, label_text, False

    # small bbox들의 중심 평균
    ucx = sum(cx * iw for _, cx, cy, bw, bh, _ in small) / len(small)
    ucy = sum(cy * ih for _, cx, cy, bw, bh, _ in small) / len(small)

    # 긴 변의 crop_ratio 크기 정사각형
    half = max_dim * crop_ratio / 2
    x1 = max(0, ucx - half)
    y1 = max(0, ucy - half)
    x2 = min(iw, ucx + half)
    y2 = min(ih, ucy + half)

    cropped = img.crop((x1, y1, x2, y2))
    rw = x2 - x1
    rh = y2 - y1

    new_lines = []
    for cls, cx, cy, bw, bh, _ in parsed:
        cx_px = cx * iw
        cy_px = cy * ih
        if x1 <= cx_px <= x2 and y1 <= cy_px <= y2:
            new_cx = max(0.0, min(1.0, (cx_px - x1) / rw))
            new_cy = max(0.0, min(1.0, (cy_px - y1) / rh))
            new_bw = max(0.0, min(1.0, (bw * iw) / rw))
            new_bh = max(0.0, min(1.0, (bh * ih) / rh))
            new_lines.append(f"{cls} {new_cx:.6f} {new_cy:.6f} {new_bw:.6f} {new_bh:.6f}")

    new_label = "\n".join(new_lines) + "\n" if new_lines else ""
    return cropped, new_label, True


# ── 메인 처리 ─────────────────────────────────────────────────────────────────

def process_zip(zip_path: Path, output_dir: Path, seed: int, prefix: str = "aug_", remap_to_pill: bool = False, crop_small: bool = False) -> None:
    rng = random.Random(seed)

    img_out = output_dir / "train" / "images"
    lbl_out = output_dir / "train" / "labels"
    img_out.mkdir(parents=True, exist_ok=True)
    lbl_out.mkdir(parents=True, exist_ok=True)

    rotations   = [0, 90, 180, 270]
    flip_modes  = [(False, False), (True, False), (False, True), (True, True)]
    brightness  = [0.80, 0.90, 1.00]
    contrast    = [1.00, 1.10]

    with zipfile.ZipFile(zip_path, "r") as zf:
        image_entries = [n for n in zf.namelist() if "/images/" in n and not n.endswith("/")]
        label_map = {
            Path(n).stem: n
            for n in zf.namelist()
            if "/labels/" in n and n.endswith(".txt")
        }

        print(f"이미지 {len(image_entries)}장 처리 시작 (seed={seed})")

        saved = skipped = 0
        for img_entry in sorted(image_entries):
            stem = Path(img_entry).stem
            lbl_entry = label_map.get(stem)
            if lbl_entry is None:
                print(f"  [skip] 라벨 없음: {stem}")
                skipped += 1
                continue

            # 이미지 로드 + EXIF 보정
            img = Image.open(io.BytesIO(zf.read(img_entry))).convert("RGB")
            img = ImageOps.exif_transpose(img)
            label = zf.read(lbl_entry).decode("utf-8")

            # small bbox 크롭
            if crop_small:
                img, label, cropped = _crop_small_bbox(img, label)
                if cropped:
                    print(f"  [crop] {stem[:40]}")

            # 랜덤 조합 선택
            angle           = rng.choice(rotations)
            hflip, vflip    = rng.choice(flip_modes)
            bright_factor   = rng.choice(brightness)
            contrast_factor = rng.choice(contrast)

            # 변환 적용
            img, label = apply_rotation(img, label, angle, remap_to_pill)
            img, label = apply_flip(img, label, hflip, vflip, remap_to_pill)
            if bright_factor != 1.0:
                img = ImageEnhance.Brightness(img).enhance(bright_factor)
            if contrast_factor != 1.0:
                img = ImageEnhance.Contrast(img).enhance(contrast_factor)

            # remap_to_pill: rotation=0이라 _transform_lines를 안 탄 경우 보완
            if remap_to_pill:
                label = _transform_lines(label, lambda cx, cy, w, h: (cx, cy, w, h), remap_to_pill=True)

            # 저장
            out_stem = f"{prefix}{stem}"
            img.save(img_out / f"{out_stem}.jpg", quality=92)
            (lbl_out / f"{out_stem}.txt").write_text(label, encoding="utf-8")
            saved += 1

            tag = f"rot{angle}" + ("_hf" if hflip else "") + ("_vf" if vflip else "")
            tag += f"_b{bright_factor:.2f}_c{contrast_factor:.2f}"
            print(f"  [{saved:03d}] {stem[:40]} → {tag}")

        print(f"\n완료: {saved}장 저장 / {skipped}장 스킵")
        print(f"출력: {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip",    required=True, help="입력 zip 경로")
    parser.add_argument("--output", default="augmented_output", help="출력 폴더")
    parser.add_argument("--seed",   type=int, default=42)
    parser.add_argument("--prefix", default="aug_", help="출력 파일명 접두사")
    parser.add_argument("--remap-to-pill", action="store_true",
                        help="모든 클래스 인덱스를 0(pill)으로 통일")
    parser.add_argument("--crop-small", action="store_true",
                        help="bbox가 max(w,h)^2의 1%% 미만이면 120%% 확대 크롭")
    args = parser.parse_args()

    zip_path = Path(args.zip)
    if not zip_path.exists():
        raise FileNotFoundError(f"zip 파일 없음: {zip_path}")

    process_zip(zip_path, Path(args.output), args.seed, args.prefix, args.remap_to_pill, args.crop_small)


if __name__ == "__main__":
    main()
