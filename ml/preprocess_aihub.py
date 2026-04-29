"""
AIHub 단일약제 데이터셋 전처리 스크립트 (RAM 최적화 버전)
- 2-pass 스트리밍: 전체 샘플 리스트를 메모리에 쌓지 않음
- pass 1: drug_N 목록만 수집 → train/val split 결정
- pass 2: JSON 한 개씩 읽고 바로 라벨 파일 작성 → 메모리 해제
- 이미지: 심볼릭 링크 (복사 없음)
- 이미지 크기: JSON 또는 파일 헤더만 읽음 (PIL 없음)
"""

import os
import json
import struct
import random
from pathlib import Path

# ── 경로 설정 ────────────────────────────────────────────────────
# AIHub zip 파일은 Drive에 있고, 압축 해제 후 로컬에 저장됨
# (prototype_detector_colab.ipynb 의 Step 3b 셀에서 압축 해제)
IMAGES_DIR  = Path("/content/aihub_images")           # 로컬 (zip 해제 결과)
LABELS_DIR  = Path("/content/aihub_labels")           # 로컬 (zip 해제 결과)
OUTPUT_DIR  = Path("/content/aihub_200")              # 전처리 결과 출력 폴더

VAL_RATIO       = 0.0   # AIHub는 전부 train으로 — val은 실사진만
ANGLE_90_RATIO  = 0.08  # 90도는 소수만 포함 (70°/75° 위주)
RANDOM_SEED     = 42
PER_DRUG_CAP    = 5    # 종당 최대 이미지 수 — 다양한 종류 확보 우선
TOTAL_CAP       = 200  # 전체 최대 이미지 수 (train + val 합산)
random.seed(RANDOM_SEED)


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
    n_val = max(1, int(len(drugs) * VAL_RATIO))
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

    NON90_CAP  = int(PER_DRUG_CAP * (1 - ANGLE_90_RATIO))  # 64
    ANGLE90_CAP = PER_DRUG_CAP - NON90_CAP                 # 16

    counts  = {"train": 0, "val": 0, "skip": 0}
    angle90 = {"train": [], "val": []}  # 90도 후보 (나중에 샘플링) — (lf, drug_n) 튜플
    drug_non90_counts: dict = {"train": {}, "val": {}}

    label_files = list(LABELS_DIR.rglob("*.json"))  # 경로만 — 수십KB
    random.shuffle(label_files)  # cap 도달 시 균등 샘플링
    total = len(label_files)

    for i, lf in enumerate(label_files):
        if i % 1000 == 0:
            print(f"      {i}/{total}...")
        try:
            with open(lf, encoding="utf-8") as f:
                data = json.load(f)

            if not data.get("images") or not data.get("annotations"):
                counts["skip"] += 1
                continue

            drug_n = data["images"][0].get("drug_N", "")
            if drug_n in train_drugs:
                split = "train"
            elif drug_n in val_drugs:
                split = "val"
            else:
                counts["skip"] += 1
                continue

            angle = angle_from_json(data) or angle_from_filename(lf.stem)

            # 90도는 일단 모아서 나중에 샘플링
            if angle == 90:
                if drug_non90_counts[split].get(drug_n, 0) < NON90_CAP:
                    angle90[split].append((lf, drug_n))
                continue

            # 종당 non-90 cap 확인
            if drug_non90_counts[split].get(drug_n, 0) >= NON90_CAP:
                counts["skip"] += 1
                continue

            img_path = img_index.get(lf.stem)
            if img_path is None:
                counts["skip"] += 1
                continue

            size = size_from_json(data) or size_from_header(img_path)
            if size is None:
                counts["skip"] += 1
                continue

            bboxes = [a["bbox"] for a in data["annotations"] if "bbox" in a]
            if not bboxes or len(bboxes) > 1:  # 단일 bbox만 허용 (멀티 알약 이미지 제외)
                counts["skip"] += 1
                continue

            _write_sample(lf.stem, img_path, bboxes, size, split)
            counts[split] += 1
            drug_non90_counts[split][drug_n] = drug_non90_counts[split].get(drug_n, 0) + 1
            if counts["train"] + counts["val"] >= TOTAL_CAP:
                print(f"      TOTAL_CAP({TOTAL_CAP}) 도달 — 조기 종료")
                break

        except Exception as e:
            counts["skip"] += 1

    # 90도 샘플링 — 종당 ANGLE90_CAP(16장) 제한, TOTAL_CAP 적용
    drug_90_counts: dict = {"train": {}, "val": {}}
    for split in ("train", "val"):
        if counts["train"] + counts["val"] >= TOTAL_CAP:
            break
        random.shuffle(angle90[split])
        added_90 = 0
        for lf, drug_n in angle90[split]:
            if counts["train"] + counts["val"] >= TOTAL_CAP:
                break
            if drug_90_counts[split].get(drug_n, 0) >= ANGLE90_CAP:
                continue
            try:
                with open(lf, encoding="utf-8") as f:
                    data = json.load(f)
                img_path = img_index.get(lf.stem)
                if img_path is None:
                    continue
                size = size_from_json(data) or size_from_header(img_path)
                if size is None:
                    continue
                bboxes = [a["bbox"] for a in data["annotations"] if "bbox" in a]
                if bboxes and len(bboxes) == 1:
                    _write_sample(lf.stem, img_path, bboxes, size, split)
                    counts[split] += 1
                    drug_90_counts[split][drug_n] = drug_90_counts[split].get(drug_n, 0) + 1
                    added_90 += 1
            except Exception:
                pass
        print(f"      90도 추가: {split} +{added_90}장")

    print(f"      결과: train {counts['train']}장 / val {counts['val']}장 / skip {counts['skip']}장")
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

def main():
    print("=== AIHub 전처리 시작 (RAM 최적화) ===")

    if not IMAGES_DIR.exists() or not LABELS_DIR.exists():
        print(f"ERROR: 경로 없음")
        print(f"  IMAGES_DIR: {IMAGES_DIR} exists={IMAGES_DIR.exists()}")
        print(f"  LABELS_DIR: {LABELS_DIR} exists={LABELS_DIR.exists()}")
        return

    train_drugs, val_drugs = build_drug_split()
    img_index = build_img_index()
    counts = process_stream(train_drugs, val_drugs, img_index)
    write_yaml(counts)

    print("=== 완료 ===")

if __name__ == "__main__":
    main()
