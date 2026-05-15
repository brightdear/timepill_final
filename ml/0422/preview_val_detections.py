"""Val set 전체 프리뷰 — TP(초록), FP(빨강), FN(파란 점선) 시각화."""
from __future__ import annotations

import argparse
import glob
import math
from pathlib import Path

import matplotlib.patches as patches
import matplotlib.pyplot as plt
import yaml
from PIL import Image
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Val set 전체 예측 결과를 페이지별로 시각화.")
    parser.add_argument("--model", default="", help="best.pt 경로 (미지정 시 runs/ 자동 탐색)")
    parser.add_argument("--data", required=True, help="dataset.yaml 경로")
    parser.add_argument("--split", default="val")
    parser.add_argument("--conf", type=float, default=0.65)
    parser.add_argument("--iou", type=float, default=0.5)
    parser.add_argument("--page-size", type=int, default=20)
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--save-dir", default="", help="저장 폴더 (미지정 시 화면 출력만)")
    return parser.parse_args()


def iou(b1: list, b2: list) -> float:
    ix1, iy1 = max(b1[0], b2[0]), max(b1[1], b2[1])
    ix2, iy2 = min(b1[2], b2[2]), min(b1[3], b2[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    u = (b1[2] - b1[0]) * (b1[3] - b1[1]) + (b2[2] - b2[0]) * (b2[3] - b2[1]) - inter
    return inter / u if u > 0 else 0.0


def load_gt(lbl_path: Path, iw: int, ih: int) -> list:
    if not lbl_path.exists():
        return []
    out = []
    for line in lbl_path.read_text(encoding="utf-8").strip().splitlines():
        parts = line.split()
        if len(parts) == 5:
            _, cx, cy, w, h = map(float, parts)
            out.append([(cx - w / 2) * iw, (cy - h / 2) * ih, (cx + w / 2) * iw, (cy + h / 2) * ih])
    return out


def match(preds: list, gts: list, thr: float) -> tuple:
    matched_g: set = set()
    tp_p, fp_p = [], []
    for pi, pb in enumerate(preds):
        best, bgi = 0.0, -1
        for gi, gb in enumerate(gts):
            if gi in matched_g:
                continue
            v = iou(pb, gb)
            if v > best:
                best, bgi = v, gi
        if best >= thr:
            tp_p.append(pi)
            matched_g.add(bgi)
        else:
            fp_p.append(pi)
    fn_g = [i for i in range(len(gts)) if i not in matched_g]
    return tp_p, fp_p, fn_g


COLOR = {"tp": "#00cc44", "fp": "#ff3333", "fn": "#3399ff"}


def show_page(page_cases: list, page_idx: int, total_pages: int,
              conf_thresh: float, cols: int,
              tp_total: int, fp_total: int, fn_total: int, f1: float,
              save_dir: str = "") -> None:
    nrows = math.ceil(len(page_cases) / cols)
    fig, axes = plt.subplots(nrows, cols, figsize=(cols * 4, nrows * 4))
    axes_flat = axes.flatten() if hasattr(axes, "flatten") else [axes]

    for ax, (img_path, preds, confs, gts, tp_p, fp_p, fn_g) in zip(axes_flat, page_cases):
        ax.imshow(Image.open(img_path))
        ax.axis("off")
        has_err = len(fp_p) > 0 or len(fn_g) > 0
        flag = " ⚠" if has_err else " ✓"
        ax.set_title(img_path.name[:26] + flag, fontsize=7,
                     color="#ff4444" if has_err else "#44aa44")
        for pi in tp_p:
            x1, y1, x2, y2 = preds[pi]
            ax.add_patch(patches.Rectangle((x1, y1), x2 - x1, y2 - y1,
                                           lw=1.5, edgecolor=COLOR["tp"], facecolor="none"))
            ax.text(x1, y1 - 3, f"{confs[pi]:.2f}", color=COLOR["tp"], fontsize=6, fontweight="bold")
        for pi in fp_p:
            x1, y1, x2, y2 = preds[pi]
            ax.add_patch(patches.Rectangle((x1, y1), x2 - x1, y2 - y1,
                                           lw=1.5, edgecolor=COLOR["fp"], facecolor="none"))
            ax.text(x1, y1 - 3, f"FP {confs[pi]:.2f}", color=COLOR["fp"], fontsize=6, fontweight="bold")
        for gi in fn_g:
            x1, y1, x2, y2 = gts[gi]
            ax.add_patch(patches.Rectangle((x1, y1), x2 - x1, y2 - y1,
                                           lw=1.5, edgecolor=COLOR["fn"], facecolor="none", linestyle="--"))
            ax.text(x1, y1 - 3, "FN", color=COLOR["fn"], fontsize=6, fontweight="bold")

    for ax in axes_flat[len(page_cases):]:
        ax.axis("off")

    from matplotlib.lines import Line2D
    fig.legend(handles=[
        Line2D([0], [0], color=COLOR["tp"], lw=2, label="TP (정탐)"),
        Line2D([0], [0], color=COLOR["fp"], lw=2, label="FP (오탐)"),
        Line2D([0], [0], color=COLOR["fn"], lw=2, linestyle="--", label="FN (미탐)"),
    ], loc="lower center", ncol=3, fontsize=9, bbox_to_anchor=(0.5, 0))

    plt.suptitle(
        f"Val 전체 프리뷰 — 페이지 {page_idx + 1}/{total_pages}  |  "
        f"conf≥{conf_thresh}  |  TP={tp_total} FP={fp_total} FN={fn_total}  |  F1={f1:.3f}",
        fontsize=11,
    )
    plt.tight_layout(rect=[0, 0.04, 1, 1])

    if save_dir:
        Path(save_dir).mkdir(parents=True, exist_ok=True)
        fig.savefig(Path(save_dir) / f"val_preview_page{page_idx + 1:02d}.jpg", dpi=100, bbox_inches="tight")
        plt.close(fig)
    else:
        plt.show()


def main() -> int:
    args = parse_args()

    if args.model:
        best_pt = args.model
    else:
        candidates = sorted(glob.glob("/content/runs/pill_prototype_0422_v1*/weights/best.pt"))
        if not candidates:
            print("[error] best.pt를 찾을 수 없습니다. --model 로 경로를 지정하세요.")
            return 1
        best_pt = candidates[-1]
    print("best.pt:", best_pt)

    with open(args.data, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    ds_root = Path(str(cfg.get("path", Path(args.data).parent)))
    split_rel = cfg.get(args.split, "")
    if not split_rel:
        print(f"[error] dataset.yaml에 '{args.split}' split이 없습니다.")
        return 1

    img_dir = ds_root / split_rel.strip()
    lbl_dir = img_dir.parent.parent / "labels" / img_dir.name
    img_paths = sorted(p for p in img_dir.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    print(f"{args.split} 이미지 {len(img_paths)}장")

    model = YOLO(best_pt)
    results = model.predict(
        [str(p) for p in img_paths],
        conf=args.conf, iou=0.45, device="0", verbose=False,
    )

    cases = []
    for img_path, res in zip(img_paths, results):
        img = Image.open(img_path)
        iw, ih = img.size
        lbl = lbl_dir / (img_path.stem + ".txt")
        gts = load_gt(lbl, iw, ih)
        preds = res.boxes.xyxy.cpu().numpy().tolist() if res.boxes is not None and len(res.boxes) else []
        confs = res.boxes.conf.cpu().numpy().tolist() if res.boxes is not None and len(res.boxes) else []
        tp_p, fp_p, fn_g = match(preds, gts, args.iou)
        cases.append((img_path, preds, confs, gts, tp_p, fp_p, fn_g))

    tp_total = sum(len(c[4]) for c in cases)
    fp_total = sum(len(c[5]) for c in cases)
    fn_total = sum(len(c[6]) for c in cases)
    prec = tp_total / (tp_total + fp_total) if (tp_total + fp_total) else 0.0
    rec = tp_total / (tp_total + fn_total) if (tp_total + fn_total) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    print(f"TP={tp_total}  FP={fp_total}  FN={fn_total}  |  P={prec:.3f}  R={rec:.3f}  F1={f1:.3f}")

    pages = [cases[i:i + args.page_size] for i in range(0, len(cases), args.page_size)]
    for idx, page in enumerate(pages):
        show_page(page, idx, len(pages), args.conf, args.cols,
                  tp_total, fp_total, fn_total, f1, args.save_dir)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
