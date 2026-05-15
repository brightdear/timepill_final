from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import shutil
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
MANIFEST_FILENAME = "manifest.json"
SCHEMA_VERSION = 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "hard_negatives 이미지를 정사각형 랜덤 크롭 + 증강하여 Drive 캐시에 저장.\n"
            "이미 처리된 이미지는 SHA256으로 식별해 건너뛰므로, "
            "새 이미지가 추가될 때만 증분 처리된다."
        )
    )
    parser.add_argument(
        "--hard-negatives-dir",
        required=True,
        help="원본 hard_negatives 폴더 경로 (예: /content/drive/MyDrive/hard_negatives)",
    )
    parser.add_argument(
        "--cache-dir",
        required=True,
        help=(
            "증강 결과를 저장할 Drive 캐시 폴더 경로 "
            "(예: /content/drive/MyDrive/hard_negative_cache_aug)"
        ),
    )
    parser.add_argument(
        "--crops-per-image",
        type=int,
        default=3,
        help="이미지당 랜덤 정사각형 크롭 수 (기본값: 3)",
    )
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cleanup_stale_entries(src_dir: Path, cache_dir: Path, manifest: dict) -> int:
    """삭제/교체된 소스 이미지의 생성 파일을 캐시에서 제거한다."""
    image_out = cache_dir / "images"
    processed = manifest["processed"]

    current_names = {
        p.name: p for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
    }

    stale_shas = []
    for sha, entry in processed.items():
        src_name = entry["source_name"]
        if src_name not in current_names:
            stale_shas.append((sha, "삭제됨"))
        elif entry.get("file_size") is not None and current_names[src_name].stat().st_size != entry["file_size"]:
            # 파일 크기 변화로 교체 감지 — SHA256 재계산 없이 stat()만 사용
            # file_size 없는 구버전 manifest 엔트리는 건너뜀
            stale_shas.append((sha, "교체됨"))

    for sha, reason in stale_shas:
        entry = processed.pop(sha)
        removed = 0
        for gen_name in entry.get("generated", []):
            gen_path = image_out / gen_name
            if gen_path.exists():
                gen_path.unlink()
                removed += 1
        print(
            f"[hard negative cache] {entry['source_name']} ({reason}) → 생성 {removed}장 제거",
            flush=True,
        )

    return len(stale_shas)


def load_manifest(cache_dir: Path) -> dict:
    manifest_path = cache_dir / MANIFEST_FILENAME
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        if data.get("schema_version") == SCHEMA_VERSION:
            return data
    return {"schema_version": SCHEMA_VERSION, "processed": {}, "next_index": 0}


def save_manifest(cache_dir: Path, manifest: dict) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / MANIFEST_FILENAME).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True), encoding="utf-8"
    )


def random_square_crops(img: "Image.Image", n: int, rng: random.Random) -> list["Image.Image"]:
    w, h = img.size
    min_side = min(w, h)
    crops = []
    for _ in range(n):
        # Use 80-95% of min_side so position can vary in both x and y,
        # even for portrait/landscape/square images where one axis was previously locked at 0.
        side = int(min_side * rng.uniform(0.80, 0.95))
        max_x = max(0, w - side)
        max_y = max(0, h - side)
        x = rng.randint(0, max_x)
        y = rng.randint(0, max_y)
        crops.append(img.crop((x, y, x + side, y + side)))
    return crops


def augment_crop(img: "Image.Image", rng: random.Random, level: int = 1) -> "Image.Image":
    """level 0=약, 1=중, 2=강. 크롭 인덱스 순서로 배분해 3장이 서로 달라 보이게 한다."""
    from PIL import Image, ImageEnhance, ImageFilter

    # 모든 레벨 공통: 수평 flip + rotation
    if rng.random() < 0.5:
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if rng.random() < 0.5:
        angle = rng.uniform(-15, 15)
        rad = math.radians(abs(angle))
        scale = math.cos(rad) + math.sin(rad)
        orig_w, orig_h = img.size
        img = img.resize((int(orig_w * scale), int(orig_h * scale)), Image.LANCZOS)
        img = img.rotate(angle, resample=Image.BICUBIC, expand=False)
        left = (img.size[0] - orig_w) // 2
        top = (img.size[1] - orig_h) // 2
        img = img.crop((left, top, left + orig_w, top + orig_h))

    if level == 0:
        pass  # flip + rotation만

    elif level == 1:
        # 중: 밝기(어둡게 위주) + 채도
        if rng.random() < 0.7:
            img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.80, 1.10))
        if rng.random() < 0.6:
            img = ImageEnhance.Color(img).enhance(rng.uniform(0.80, 1.20))

    else:
        # 강: 밝기(어둡게 위주) + 대비 + 채도 + 약한 blur
        if rng.random() < 0.8:
            img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.70, 1.10))
        if rng.random() < 0.7:
            img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.85, 1.15))
        if rng.random() < 0.7:
            img = ImageEnhance.Color(img).enhance(rng.uniform(0.75, 1.20))
        if rng.random() < 0.5:
            img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.5, 1.5)))

    return img


def process_new_images(
    src_dir: Path,
    cache_dir: Path,
    manifest: dict,
    crops_per_image: int,
    rng: random.Random,
) -> int:
    from PIL import Image

    image_out = cache_dir / "images"
    image_out.mkdir(parents=True, exist_ok=True)

    src_images = sorted(
        p for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
    )
    print(f"[hard negative cache] 소스 이미지 {len(src_images)}장 발견", flush=True)

    processed = manifest["processed"]
    next_idx = manifest["next_index"]
    new_count = 0

    # 이름 → sha 역방향 조회 (stat()만으로 기존 파일 스킵)
    name_to_sha = {v["source_name"]: sha for sha, v in processed.items()}

    for src_path in src_images:
        stored_sha = name_to_sha.get(src_path.name)
        if stored_sha is not None:
            stored_size = processed[stored_sha].get("file_size")
            if stored_size is not None and src_path.stat().st_size == stored_size:
                continue  # 변경 없음 — SHA256 계산 스킵
        sha = file_sha256(src_path)
        if sha in processed:
            continue

        try:
            img = Image.open(src_path).convert("RGB")
        except Exception as exc:
            print(f"[hard negative cache] 로드 실패: {src_path.name} — {exc}", flush=True)
            continue

        crops = random_square_crops(img, crops_per_image, rng)
        generated = []
        for idx, crop in enumerate(crops):
            augmented = augment_crop(crop, rng, level=idx % 3)
            if augmented.size != (640, 640):
                augmented = augmented.resize((640, 640), Image.LANCZOS)
            out_name = f"neg_aug_{next_idx:05d}.jpg"
            augmented.save(image_out / out_name, quality=92)
            generated.append(out_name)
            next_idx += 1

        processed[sha] = {"source_name": src_path.name, "file_size": src_path.stat().st_size, "generated": generated}
        new_count += 1
        print(f"[hard negative cache] {src_path.name} → {len(generated)}장 생성", flush=True)

    manifest["next_index"] = next_idx
    return new_count


def main() -> int:
    args = parse_args()
    rng = random.Random(args.seed)

    src_dir = Path(args.hard_negatives_dir).resolve()
    cache_dir = Path(args.cache_dir).resolve()

    if not src_dir.exists():
        raise FileNotFoundError(f"hard_negatives 폴더를 찾을 수 없음: {src_dir}")

    manifest = load_manifest(cache_dir)

    already_processed = len(manifest["processed"])
    total_cached = sum(len(v["generated"]) for v in manifest["processed"].values())
    print(
        f"[hard negative cache] 기존 캐시: 소스 {already_processed}장 처리됨, "
        f"증강 이미지 {total_cached}장",
        flush=True,
    )

    current_src_count = sum(1 for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES)
    if current_src_count < already_processed:
        stale_count = cleanup_stale_entries(src_dir, cache_dir, manifest)
        if stale_count:
            print(f"[hard negative cache] 소스 {stale_count}장 변경 감지 → 해당 캐시 제거 완료", flush=True)
    else:
        stale_count = 0
        print(f"[hard negative cache] 소스 수 감소 없음 ({current_src_count}장) — cleanup 스킵", flush=True)

    new_count = process_new_images(src_dir, cache_dir, manifest, args.crops_per_image, rng)
    save_manifest(cache_dir, manifest)

    total_after = sum(len(v["generated"]) for v in manifest["processed"].values())
    if new_count == 0 and stale_count == 0:
        print("[hard negative cache] 변경 없음 — 캐시 그대로 사용", flush=True)
    else:
        print(
            f"[hard negative cache] 완료: 총 증강 이미지 {total_after}장 → {cache_dir}",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
