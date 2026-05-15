"""
auto_label_zip.py
Roboflow YOLOv8 zip 이미지에 best.pt로 자동 라벨링.

출력:
  high_conf/  — max conf >= --conf-high  (바로 사용 가능)
  low_conf/   — conf-low <= max conf < conf-high  (확인 필요)
  no_detect/  — 탐지 없음  (버리거나 hard-negative로)
  preview_high.jpg
  preview_low.jpg
  preview_no_detect.jpg
"""

from __future__ import annotations

import argparse
import io
import math
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def _make_label(boxes_data: list) -> str:
    return "\n".join(
        f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}"
        for _, cx, cy, bw, bh, *_ in boxes_data
    ) + "\n"


def _draw_boxes(img: Image.Image, boxes_data: list, color: str) -> Image.Image:
    d = ImageDraw.Draw(img)
    iw, ih = img.size
    lw = max(2, min(iw, ih) // 100)
    for conf, cx, cy, bw, bh, x1, y1, x2, y2 in boxes_data:
        d.rectangle([x1, y1, x2, y2], outline=color, width=lw)
        d.text((x1 + 2, y1 + 2), f"{conf:.2f}", fill=color)
    return img


def _make_grid(entries: list[tuple[str, Image.Image]], out_path: Path, cols: int = 8) -> None:
    if not entries:
        return
    THUMB, TITLE_H, PAD = 200, 20, 6
    rows = math.ceil(len(entries) / cols)
    W = PAD + cols * (THUMB + PAD)
    H = PAD + rows * (TITLE_H + THUMB + PAD)
    sheet = Image.new("RGB", (W, H), (40, 40, 40))
    draw = ImageDraw.Draw(sheet)
    for idx, (name, img) in enumerate(entries):
        img.thumbnail((THUMB, THUMB), Image.LANCZOS)
        col, row = idx % cols, idx // cols
        x = PAD + col * (THUMB + PAD)
        y = PAD + row * (TITLE_H + THUMB + PAD)
        draw.text((x, y), name[:18], fill=(180, 180, 180))
        sheet.paste(img, (x + (THUMB - img.width) // 2, y + TITLE_H + (THUMB - img.height) // 2))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, quality=92)
    print(f"preview 저장: {out_path}")


def process_zip(zip_path: Path, output_dir: Path, model_path: Path,
                conf_high: float, conf_low: float, device: str = "cpu") -> None:
    from ultralytics import YOLO

    model = YOLO(str(model_path))

    dirs = {
        "high_img": output_dir / "high_conf" / "images",
        "high_lbl": output_dir / "high_conf" / "labels",
        "low_img":  output_dir / "low_conf"  / "images",
        "low_lbl":  output_dir / "low_conf"  / "labels",
        "no_img":   output_dir / "no_detect" / "images",
    }
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    counts = {"high": 0, "low": 0, "no": 0}

    # preview용 이미지는 별도 폴더에 저장 후 grid 생성 (메모리 절약)
    prev_dirs = {
        "high": output_dir / "_preview_imgs" / "high",
        "low":  output_dir / "_preview_imgs" / "low",
        "no":   output_dir / "_preview_imgs" / "no",
    }
    for d in prev_dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        image_entries = sorted(
            n for n in zf.namelist()
            if "/images/" in n and not n.endswith("/")
        )
        print(f"총 {len(image_entries)}장 추론 시작")

        for i, entry in enumerate(image_entries, 1):
            stem = Path(entry).stem
            img = Image.open(io.BytesIO(zf.read(entry))).convert("RGB")
            img = ImageOps.exif_transpose(img)
            iw, ih = img.size

            results = model.predict(img, conf=conf_low, verbose=False, device=device)
            result = results[0]

            if result.boxes is None or len(result.boxes) == 0:
                img.save(dirs["no_img"] / f"{stem}.jpg", quality=92)
                # preview 저장
                prev = img.copy(); prev.thumbnail((200, 200), Image.LANCZOS)
                prev.save(prev_dirs["no"] / f"{stem}.jpg", quality=80)
                counts["no"] += 1
                print(f"  [{i:03d}] {stem[:40]} → no_detect")
                continue

            boxes_data = []
            for box in result.boxes:
                conf = float(box.conf)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cx = ((x1 + x2) / 2) / iw
                cy = ((y1 + y2) / 2) / ih
                bw = (x2 - x1) / iw
                bh = (y2 - y1) / ih
                boxes_data.append((conf, cx, cy, bw, bh, x1, y1, x2, y2))

            max_conf = max(b[0] for b in boxes_data)
            label_text = _make_label(boxes_data)

            color = "#00cc44" if max_conf >= conf_high else "#ff9900"
            preview_img = _draw_boxes(img.copy(), boxes_data, color=color)
            preview_img.thumbnail((200, 200), Image.LANCZOS)

            if max_conf >= conf_high:
                img.save(dirs["high_img"] / f"{stem}.jpg", quality=92)
                (dirs["high_lbl"] / f"{stem}.txt").write_text(label_text, encoding="utf-8")
                preview_img.save(prev_dirs["high"] / f"{stem}.jpg", quality=80)
                counts["high"] += 1
                tag = "high"
            else:
                img.save(dirs["low_img"] / f"{stem}.jpg", quality=92)
                (dirs["low_lbl"] / f"{stem}.txt").write_text(label_text, encoding="utf-8")
                preview_img.save(prev_dirs["low"] / f"{stem}.jpg", quality=80)
                counts["low"] += 1
                tag = "low"

            print(f"  [{i:03d}] {stem[:40]} → {tag} (max_conf={max_conf:.3f})")

    print(f"\n완료: high={counts['high']} / low={counts['low']} / no_detect={counts['no']}")

    # 디스크에서 읽어 grid 생성
    for key, label in [("high", "detected"), ("low", "low_conf"), ("no", "no_detect")]:
        entries = [(p.stem, Image.open(p)) for p in sorted(prev_dirs[key].glob("*.jpg"))]
        _make_grid(entries, output_dir / f"preview_{label}.jpg")
        for _, im in entries:
            im.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip",       required=True, help="입력 zip 경로")
    parser.add_argument("--model",     required=True, help="best.pt 경로")
    parser.add_argument("--output",    default="auto_labeled", help="출력 폴더")
    parser.add_argument("--conf-high", type=float, default=0.70,
                        help="이 이상이면 high_conf (기본 0.70)")
    parser.add_argument("--conf-low",  type=float, default=0.30,
                        help="최소 탐지 conf, 이 미만은 no_detect (기본 0.30)")
    parser.add_argument("--device",    default=None,
                        help="추론 장치 (기본: GPU 자동감지, 없으면 cpu)")
    args = parser.parse_args()

    zip_path = Path(args.zip)
    if not zip_path.exists():
        raise FileNotFoundError(f"zip 없음: {zip_path}")
    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"모델 없음: {model_path}")

    device = args.device
    if device is None:
        import torch
        device = "0" if torch.cuda.is_available() else "cpu"
        print(f"device: {device}")

    process_zip(zip_path, Path(args.output), model_path, args.conf_high, args.conf_low, device)


if __name__ == "__main__":
    main()
