"""
AIHub 단일약제 데이터셋 전처리 스크립트 (RAM 최적화 버전)
- 2-pass 스트리밍: 전체 샘플 리스트를 메모리에 쌓지 않음
- pass 1: drug_N 목록만 수집 → train/val split 결정
- pass 2: JSON 한 개씩 읽고 바로 라벨 파일 작성 → 메모리 해제
- 이미지: 심볼릭 링크 (복사 없음)
- 이미지 크기: JSON 또는 파일 헤더만 읽음 (PIL 없음)
"""

import argparse
import json
import os
import shutil
import struct
import random
from collections import Counter
from pathlib import Path

# ── 경로 설정 ────────────────────────────────────────────────────
# AIHub zip 파일은 Drive에 있고, 압축 해제 후 로컬에 저장됨
# (prototype_detector_colab.ipynb 의 Step 3b 셀에서 압축 해제)
IMAGES_DIR  = Path("/content/aihub_images")           # 로컬 (zip 해제 결과)
LABELS_DIR  = Path("/content/aihub_labels")           # 로컬 (zip 해제 결과)
OUTPUT_DIR  = Path("/content/aihub_600")              # 전처리 결과 출력 폴더

VAL_RATIO       = 0.0   # AIHub는 전부 train으로 — val은 실사진만
ANGLE_90_RATIO  = 0.20  # 90도 비율 목표 (전체의 20%, 나머지 80%는 75도)
RANDOM_SEED     = 42
PER_DRUG_CAP    = 0    # 0이면 종당 제한 없음 — detector용 300장 확보 우선
MAX_BBOXES_PER_IMAGE = 0  # 0이면 이미지당 bbox 개수 제한 없음
TOTAL_CAP       = 600  # 전체 최대 이미지 수 (train + val 합산)


def parse_args():
    parser = argparse.ArgumentParser(description="Preprocess AIHub pill data into YOLO format.")
    parser.add_argument("--images-dir", default=str(IMAGES_DIR), help="Unzipped AIHub image root.")
    parser.add_argument("--labels-dir", default=str(LABELS_DIR), help="Unzipped AIHub JSON label root.")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR), help="YOLO-format output root.")
    parser.add_argument("--total-cap", type=int, default=TOTAL_CAP, help="Maximum output images.")
    parser.add_argument(
        "--per-drug-cap",
        type=int,
        default=PER_DRUG_CAP,
        help="Maximum images per drug_N. Use 0 to disable the per-drug cap.",
    )
    parser.add_argument("--angle-90-ratio", type=float, default=ANGLE_90_RATIO)
    parser.add_argument(
        "--max-bboxes-per-image",
        type=int,
        default=MAX_BBOXES_PER_IMAGE,
        help="Skip images with more boxes than this. Use 0 to allow multi-box YOLO labels.",
    )
    parser.add_argument("--val-ratio", type=float, default=VAL_RATIO)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    parser.add_argument(
        "--keep-existing",
        action="store_true",
        help="Do not clear output-dir before writing. Normally leave this off.",
    )
    return parser.parse_args()


# ── 유틸 ──────────────────────────────────────────────────────────

def coco_to_yolo(bbox, img_w, img_h):
    x, y, w, h = bbox
    cx = (x + w / 2) / img_w
    cy = (y + h / 2) / img_h
    return (
        max(0.0, min(1.0, cx)),
        max(0.0, min(1.0, cy)),
        max(0.0, min(1.0, w / img_w)),
        max(0.0, min(1.0, h / img_h)),
    )

def angle_from_filename(stem):
    for part in stem.split("_")[1:]:
        if part in ("70", "75", "90"):
            return int(part)
    return None

def angle_from_json(data):
    try:
        return int(data["images"][0].get("camera_la", 0))
    except Exception:
        return None

def size_from_json(data):
    try:
        info = data["images"][0]
        w = info.get("width") or info.get("img_width")
        h = info.get("height") or info.get("img_height")
        if w and h:
            return int(w), int(h)
    except Exception:
        pass
    return None

def size_from_header(path):
    try:
        with open(path, "rb") as f:
            hdr = f.read(24)
        if hdr[:8] == b'\x89PNG\r\n\x1a\n':
            return struct.unpack(">II", hdr[16:24])
        if hdr[:2] == b'\xff\xd8':
            with open(path, "rb") as f:
                f.read(2)
                while True:
                    mk = f.read(2)
                    if len(mk) < 2:
                        break
                    ln = struct.unpack(">H", f.read(2))[0]
                    if mk[1] in (0xC0, 0xC1, 0xC2):
                        f.read(1)
                        h, w = struct.unpack(">HH", f.read(4))
                        return w, h
                    f.read(ln - 2)
    except Exception:
        pass
    return None


# ── pass 1: drug_N 목록 수집 ──────────────────────────────────────

def build_drug_split():
    """JSON에서 drug_N만 빠르게 읽어 train/val drug set 반환."""
    print("[1/3] drug_N 수집 중...")
    drug_set = set()
    angle_counts = {70: 0, 75: 0, 90: 0, "other": 0}

    for lf in LABELS_DIR.rglob("*.json"):
        try:
            with open(lf, encoding="utf-8") as f:
                data = json.load(f)
            drug_n = data["images"][0].get("drug_N")
            if drug_n:
                drug_set.add(drug_n)
            angle = angle_from_json(data) or angle_from_filename(lf.stem)
            k = angle if angle in angle_counts else "other"
            angle_counts[k] += 1
        except Exception:
            pass

    print(f"      drug 종류: {len(drug_set)}종, 각도 분포: {angle_counts}")

    drugs = sorted(drug_set)
    random.shuffle(drugs)
    n_val = 0 if VAL_RATIO <= 0 else max(1, int(len(drugs) * VAL_RATIO))
    val_drugs   = set(drugs[:n_val])
    train_drugs = set(drugs[n_val:])
    print(f"      train {len(train_drugs)}종 / val {len(val_drugs)}종")
    return train_drugs, val_drugs


# ── pass 2: 스트리밍 처리 ─────────────────────────────────────────

def build_img_index():
    """이미지 stem → Path 인덱스 (1회만 빌드)."""
    print("[2/3] 이미지 인덱스 빌드 중...")
    idx = {}
    for p in IMAGES_DIR.rglob("*"):
        if p.suffix.lower() in (".png", ".jpg", ".jpeg"):
            idx[p.stem] = p
    print(f"      {len(idx)}개 인덱싱 완료")
    return idx

def process_stream(train_drugs, val_drugs, img_index):
    """JSON 파일을 하나씩 읽어 즉시 라벨/링크 생성. 전체 목록 메모리 적재 없음."""
    print("[3/3] 스트리밍 전처리 중...")

    # 출력 폴더
    for split in ("train", "val"):
        (OUTPUT_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (OUTPUT_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

    counts  = {"train": 0, "val": 0, "skip": 0}
    skip_reasons = Counter()
    angle90 = {"train": [], "val": []}
    overflow_non90 = {"train": [], "val": []}
    drug_counts: dict = {"train": {}, "val": {}}
    per_drug_cap_enabled = PER_DRUG_CAP > 0
    target_90 = int(round(TOTAL_CAP * ANGLE_90_RATIO)) if 0 < ANGLE_90_RATIO < 1 else 0
    target_non90 = max(0, TOTAL_CAP - target_90)
    non90_added = 0

    def total_written():
        return counts["train"] + counts["val"]

    def skip(reason):
        counts["skip"] += 1
        skip_reasons[reason] += 1

    def read_valid_sample(lf):
        try:
            with open(lf, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            skip("json_read_error")
            return None

        if not data.get("images"):
            skip("missing_images")
            return None
        if not data.get("annotations"):
            skip("missing_annotations")
            return None

        drug_n = data["images"][0].get("drug_N", "")
        if drug_n in train_drugs:
            split = "train"
        elif drug_n in val_drugs:
            split = "val"
        else:
            skip("drug_not_in_split")
            return None

        img_path = img_index.get(lf.stem)
        if img_path is None:
            skip("image_not_found_by_stem")
            return None

        size = size_from_json(data) or size_from_header(img_path)
        if size is None:
            skip("image_size_unavailable")
            return None

        bboxes = [a["bbox"] for a in data["annotations"] if len(a.get("bbox", [])) == 4]
        if not bboxes:
            skip("missing_bbox")
            return None
        if MAX_BBOXES_PER_IMAGE > 0 and len(bboxes) > MAX_BBOXES_PER_IMAGE:
            skip("too_many_bboxes")
            return None

        return {
            "stem": lf.stem,
            "img_path": img_path,
            "bboxes": bboxes,
            "size": size,
            "split": split,
            "drug_n": drug_n,
            "angle": angle_from_json(data) or angle_from_filename(lf.stem),
        }

    def write_accepted(sample, reason_prefix):
        split = sample["split"]
        drug_n = sample["drug_n"]
        if total_written() >= TOTAL_CAP:
            skip(f"{reason_prefix}_total_cap")
            return False
        if per_drug_cap_enabled and drug_counts[split].get(drug_n, 0) >= PER_DRUG_CAP:
            skip(f"{reason_prefix}_per_drug_cap")
            return False

        _write_sample(sample["stem"], sample["img_path"], sample["bboxes"], sample["size"], split)
        counts[split] += 1
        drug_counts[split][drug_n] = drug_counts[split].get(drug_n, 0) + 1
        return True

    label_files = list(LABELS_DIR.rglob("*.json"))  # 경로만 — 수십KB
    random.shuffle(label_files)  # cap 도달 시 균등 샘플링
    total = len(label_files)

    for i, lf in enumerate(label_files):
        if i % 1000 == 0:
            print(f"      {i}/{total}...")
        sample = read_valid_sample(lf)
        if sample is None:
            continue

        if sample["angle"] == 90:
            angle90[sample["split"]].append(sample)
            continue

        if non90_added < target_non90:
            if write_accepted(sample, "non90"):
                non90_added += 1
        else:
            overflow_non90[sample["split"]].append(sample)

    # 90도는 목표 비율만큼 먼저 채우고, 부족하면 non-90 후보로 TOTAL_CAP까지 보충한다.
    added_90_total = 0
    for split in ("train", "val"):
        if total_written() >= TOTAL_CAP or added_90_total >= target_90:
            break
        random.shuffle(angle90[split])
        added_90 = 0
        for sample in angle90[split]:
            if total_written() >= TOTAL_CAP or added_90_total >= target_90:
                break
            if write_accepted(sample, "angle90"):
                added_90 += 1
                added_90_total += 1
        print(f"      90도 추가: {split} +{added_90}장")

    if total_written() < TOTAL_CAP:
        filled_non90 = 0
        for split in ("train", "val"):
            if total_written() >= TOTAL_CAP:
                break
            random.shuffle(overflow_non90[split])
            for sample in overflow_non90[split]:
                if total_written() >= TOTAL_CAP:
                    break
                if write_accepted(sample, "overflow_non90"):
                    filled_non90 += 1
        if filled_non90:
            print(f"      90도 부족분 non-90로 보충: +{filled_non90}장")

    print(f"      결과: train {counts['train']}장 / val {counts['val']}장 / skip {counts['skip']}장")
    print("      skip 사유:")
    for reason, value in skip_reasons.most_common():
        print(f"        {reason}: {value}")
    return counts

def _write_sample(stem, img_path, bboxes, size, split):
    img_w, img_h = size
    link = OUTPUT_DIR / "images" / split / img_path.name
    if not link.exists():
        os.symlink(img_path.resolve(), link)

    lines = []
    for bbox in bboxes:
        if len(bbox) == 4:
            cx, cy, bw, bh = coco_to_yolo(bbox, img_w, img_h)
            lines.append(f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

    with open(OUTPUT_DIR / "labels" / split / (stem + ".txt"), "w") as f:
        f.write("\n".join(lines))


# ── yaml ──────────────────────────────────────────────────────────

def write_yaml(counts):
    p = OUTPUT_DIR / "pill.yaml"
    p.write_text(
        f"path: {OUTPUT_DIR}\n"
        "train: images/train\n"
        "val:   images/val\n"
        "nc: 1\n"
        "names: ['pill']\n"
        f"# train: {counts['train']}  val: {counts['val']}\n"
    )
    print(f"yaml → {p}")


# ── main ──────────────────────────────────────────────────────────

def main() -> int:
    global IMAGES_DIR, LABELS_DIR, OUTPUT_DIR
    global VAL_RATIO, ANGLE_90_RATIO, RANDOM_SEED, PER_DRUG_CAP, MAX_BBOXES_PER_IMAGE, TOTAL_CAP

    args = parse_args()
    IMAGES_DIR = Path(args.images_dir)
    LABELS_DIR = Path(args.labels_dir)
    OUTPUT_DIR = Path(args.output_dir)
    VAL_RATIO = args.val_ratio
    ANGLE_90_RATIO = args.angle_90_ratio
    RANDOM_SEED = args.seed
    PER_DRUG_CAP = args.per_drug_cap
    MAX_BBOXES_PER_IMAGE = args.max_bboxes_per_image
    TOTAL_CAP = args.total_cap
    random.seed(RANDOM_SEED)

    print("=== AIHub 전처리 시작 (RAM 최적화) ===")
    print(f"  images_dir={IMAGES_DIR}")
    print(f"  labels_dir={LABELS_DIR}")
    print(f"  output_dir={OUTPUT_DIR}")
    print(
        f"  total_cap={TOTAL_CAP} per_drug_cap={PER_DRUG_CAP} "
        f"max_bboxes_per_image={MAX_BBOXES_PER_IMAGE} angle_90_ratio={ANGLE_90_RATIO}"
    )

    if not IMAGES_DIR.exists() or not LABELS_DIR.exists():
        print(f"ERROR: 경로 없음")
        print(f"  IMAGES_DIR: {IMAGES_DIR} exists={IMAGES_DIR.exists()}")
        print(f"  LABELS_DIR: {LABELS_DIR} exists={LABELS_DIR.exists()}")
        return 1

    if OUTPUT_DIR.exists() and not args.keep_existing:
        shutil.rmtree(OUTPUT_DIR)

    train_drugs, val_drugs = build_drug_split()
    img_index = build_img_index()
    counts = process_stream(train_drugs, val_drugs, img_index)
    write_yaml(counts)

    print("=== 완료 ===")

if __name__ == "__main__":
    main()
