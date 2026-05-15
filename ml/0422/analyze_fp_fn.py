from __future__ import annotations

import argparse
import math
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="val set FP/FN 분석 — 오탐/미탐 이미지를 confidence와 함께 시각화.")
    parser.add_argument("--model", required=True, help="best.pt 경로")
    parser.add_argument("--data", required=True, help="dataset.yaml 경로")
    parser.add_argument("--split", default="val", help="분석할 split (val / test)")
    parser.add_argument("--conf", type=float, default=0.25, help="confidence threshold (기본값: 0.25)")
    parser.add_argument("--iou", type=float, default=0.5, help="IoU threshold for TP matching (기본값: 0.5)")
    parser.add_argument("--out-dir", default="", help="결과 이미지를 저장할 폴더 (기본값: model과 같은 폴더)")
    parser.add_argument("--max-fp", type=int, default=60, help="FP 그리드에 표시할 최대 이미지 수")
    parser.add_argument("--max-fn", type=int, default=60, help="FN 그리드에 표시할 최대 이미지 수")
    parser.add_argument("--tile-size", type=int, default=320, help="그리드 타일 한 변 픽셀 (기본값: 320)")
    parser.add_argument("--cols", type=int, default=4, help="그리드 열 수 (기본값: 4)")
    return parser.parse_args()


def box_iou(b1: list[float], b2: list[float]) -> float:
    """xyxy 포맷 두 박스의 IoU."""
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
    a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0


def load_gt_boxes(label_path: Path, img_w: int, img_h: int) -> list[list[float]]:
    """YOLO txt 라벨 → xyxy 픽셀 좌표 리스트."""
    if not label_path.exists():
        return []
    boxes = []
    for line in label_path.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        _, cx, cy, bw, bh = (float(p) for p in parts[:5])
        x1 = (cx - bw / 2) * img_w
        y1 = (cy - bh / 2) * img_h
        x2 = (cx + bw / 2) * img_w
        y2 = (cy + bh / 2) * img_h
        boxes.append([x1, y1, x2, y2])
    return boxes


def draw_tile(img_path: Path, pred_boxes: list[dict], gt_boxes: list[list[float]], tile_size: int) -> "Image.Image":
    from PIL import Image, ImageDraw, ImageFont

    img = Image.open(img_path).convert("RGB")
    orig_w, orig_h = img.size
    draw = ImageDraw.Draw(img)

    # GT 박스 — 파란 점선 (FN용)
    for box in gt_boxes:
        x1, y1, x2, y2 = (int(v) for v in box)
        # 점선 효과: 짧은 선 반복
        dash = 8
        for i in range(x1, x2, dash * 2):
            draw.line([(i, y1), (min(i + dash, x2), y1)], fill=(0, 100, 255), width=2)
            draw.line([(i, y2), (min(i + dash, x2), y2)], fill=(0, 100, 255), width=2)
        for i in range(y1, y2, dash * 2):
            draw.line([(x1, i), (x1, min(i + dash, y2))], fill=(0, 100, 255), width=2)
            draw.line([(x2, i), (x2, min(i + dash, y2))], fill=(0, 100, 255), width=2)

    # 예측 박스 — 빨간 실선 + confidence
    for pred in pred_boxes:
        x1, y1, x2, y2 = (int(v) for v in pred["box"])
        conf = pred["conf"]
        color = (220, 40, 40)
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
        label = f"{conf:.2f}"
        label_x = max(x1, 0)
        label_y = max(y1 - 16, 0)
        draw.rectangle([label_x, label_y, label_x + len(label) * 7 + 4, label_y + 14], fill=color)
        try:
            font = ImageFont.truetype("arial.ttf", 12)
        except Exception:
            font = ImageFont.load_default()
        draw.text((label_x + 2, label_y + 1), label, fill=(255, 255, 255), font=font)

    # 파일명 하단 표시
    name = img_path.name
    if len(name) > 28:
        name = "…" + name[-27:]
    try:
        font_sm = ImageFont.truetype("arial.ttf", 10)
    except Exception:
        font_sm = ImageFont.load_default()
    draw.rectangle([0, orig_h - 14, orig_w, orig_h], fill=(0, 0, 0, 180))
    draw.text((2, orig_h - 13), name, fill=(200, 200, 200), font=font_sm)

    img = img.resize((tile_size, tile_size), Image.LANCZOS)
    return img


def make_grid(tiles: list["Image.Image"], cols: int, tile_size: int, title: str) -> "Image.Image":
    from PIL import Image, ImageDraw, ImageFont

    rows = math.ceil(len(tiles) / cols)
    header_h = 32
    grid_w = cols * tile_size
    grid_h = rows * tile_size + header_h

    canvas = Image.new("RGB", (grid_w, grid_h), (30, 30, 30))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except Exception:
        font = ImageFont.load_default()
    draw.rectangle([0, 0, grid_w, header_h], fill=(50, 50, 50))
    draw.text((8, 8), title, fill=(240, 240, 240), font=font)

    for idx, tile in enumerate(tiles):
        row, col = divmod(idx, cols)
        x = col * tile_size
        y = row * tile_size + header_h
        canvas.paste(tile, (x, y))

    return canvas


def main() -> int:
    from ultralytics import YOLO
    import yaml

    args = parse_args()
    model_path = Path(args.model).resolve()
    data_yaml = Path(args.data).resolve()
    out_dir = Path(args.out_dir).resolve() if args.out_dir else model_path.parent

    with data_yaml.open(encoding="utf-8") as f:
        data_cfg = yaml.safe_load(f)

    raw_root = Path(str(data_cfg.get("path", data_yaml.parent)))
    dataset_root = raw_root if raw_root.is_absolute() else (data_yaml.parent / raw_root).resolve()

    split_rel = data_cfg.get(args.split)
    if not split_rel:
        print(f"[error] dataset.yaml에 '{args.split}' split이 없습니다.")
        return 1

    img_dir = dataset_root / str(split_rel)
    label_dir = img_dir.parent.parent / "labels" / img_dir.name

    img_paths = sorted(p for p in img_dir.rglob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
    print(f"[analyze] {args.split} 이미지 {len(img_paths)}장 발견")

    model = YOLO(str(model_path))

    tp_total = fn_total = fp_total = 0
    fp_tiles: list = []
    fn_tiles: list = []

    for img_path in img_paths:
        from PIL import Image as PILImage
        with PILImage.open(img_path) as tmp:
            img_w, img_h = tmp.size

        label_path = label_dir / (img_path.stem + ".txt")
        gt_boxes = load_gt_boxes(label_path, img_w, img_h)

        results = model.predict(str(img_path), conf=args.conf, verbose=False)
        preds = results[0].boxes
        pred_list: list[dict] = []
        if preds is not None and len(preds):
            for box, conf in zip(preds.xyxy.tolist(), preds.conf.tolist()):
                pred_list.append({"box": box, "conf": conf})

        # TP/FP/FN 매칭
        matched_gt = [False] * len(gt_boxes)
        matched_pred = [False] * len(pred_list)

        for pi, pred in enumerate(pred_list):
            best_iou = 0.0
            best_gi = -1
            for gi, gt in enumerate(gt_boxes):
                if matched_gt[gi]:
                    continue
                iou = box_iou(pred["box"], gt)
                if iou > best_iou:
                    best_iou = iou
                    best_gi = gi
            if best_iou >= args.iou and best_gi >= 0:
                matched_pred[pi] = True
                matched_gt[best_gi] = True
                tp_total += 1

        fp_preds = [p for p, m in zip(pred_list, matched_pred) if not m]
        fn_gts = [g for g, m in zip(gt_boxes, matched_gt) if not m]
        fp_total += len(fp_preds)
        fn_total += len(fn_gts)

        if fp_preds and len(fp_tiles) < args.max_fp:
            tile = draw_tile(img_path, fp_preds, [], args.tile_size)
            fp_tiles.append(tile)

        if fn_gts and len(fn_tiles) < args.max_fn:
            tile = draw_tile(img_path, [], fn_gts, args.tile_size)
            fn_tiles.append(tile)

    precision = tp_total / (tp_total + fp_total) if (tp_total + fp_total) > 0 else 0.0
    recall = tp_total / (tp_total + fn_total) if (tp_total + fn_total) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    summary = (
        f"conf≥{args.conf}  iou≥{args.iou}  |  "
        f"TP={tp_total}  FP={fp_total}  FN={fn_total}  |  "
        f"P={precision:.3f}  R={recall:.3f}  F1={f1:.3f}"
    )
    print(f"[결과] {summary}")

    out_dir.mkdir(parents=True, exist_ok=True)

    if fp_tiles:
        fp_title = f"FALSE POSITIVES ({len(fp_tiles)}장 표시 / 총 {fp_total}건)  |  {summary}"
        fp_grid = make_grid(fp_tiles, args.cols, args.tile_size, fp_title)
        fp_out = out_dir / f"fp_analysis_{args.split}.jpg"
        fp_grid.save(fp_out, quality=90)
        print(f"[FP grid] → {fp_out}")
    else:
        print("[FP] 없음")

    if fn_tiles:
        fn_title = f"FALSE NEGATIVES ({len(fn_tiles)}장 표시 / 총 {fn_total}건)  |  {summary}"
        fn_grid = make_grid(fn_tiles, args.cols, args.tile_size, fn_title)
        fn_out = out_dir / f"fn_analysis_{args.split}.jpg"
        fn_grid.save(fn_out, quality=90)
        print(f"[FN grid] → {fn_out}")
    else:
        print("[FN] 없음")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
