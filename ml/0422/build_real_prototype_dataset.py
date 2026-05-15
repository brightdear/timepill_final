from __future__ import annotations

import argparse
import functools
import hashlib
import json
import random
import re
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
SYNTHETIC_OBJECT_CHOICES = [1, 2, 3, 4]
SYNTHETIC_OBJECT_WEIGHTS = [0.55, 0.25, 0.15, 0.05]


class DisjointSet:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, item: str) -> str:
        if item not in self.parent:
            self.parent[item] = item
            return item
        parent = self.parent[item]
        if parent != item:
            parent = self.find(parent)
            self.parent[item] = parent
        return parent

    def union(self, left: str, right: str) -> str:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root
        return self.find(left)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a real-data-first prototype YOLO dataset from Drive folders."
    )
    parser.add_argument(
        "--real-root",
        required=True,
        help="Drive root that contains sample_img, backgrounds, hard_negatives.",
    )
    parser.add_argument(
        "--pill-yolov8-dir",
        default=None,
        help=(
            "pill.yolov8 폴더 경로. 지정하면 real_root/pill.yolov8 대신 이 경로를 사용한다. "
            "Drive zip을 /content/에 압축해제한 경우 /content/pill.yolov8 로 지정."
        ),
    )
    parser.add_argument(
        "--output-root",
        default="/content/datasets/pill_prototype_0422",
        help="Output dataset root.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.10)
    parser.add_argument(
        "--synthetic-target",
        type=int,
        default=0,
        help="How many synthetic positives to generate from sample_img and backgrounds.",
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
    parser.add_argument(
        "--hard-negative-shadow-prob",
        type=float,
        default=0.15,
        help=(
            "Probability of applying train-only scene-shadow augmentation to each hard negative. "
            "Set to 0 to disable."
        ),
    )
    parser.add_argument(
        "--hard-negative-cache-dir",
        default=None,
        help=(
            "augment_hard_negatives_cache.py 로 생성한 Drive 캐시 폴더 경로. "
            "지정하면 hard_negatives/ 원본 대신 캐시의 증강 이미지를 사용하며, "
            "shadow augmentation은 적용하지 않는다 (캐시 생성 시 이미 증강됨)."
        ),
    )
    parser.add_argument(
        "--stage-synthetic-assets",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Stage sample_img and backgrounds into output_root to reduce repeated Drive I/O.",
    )
    parser.add_argument(
        "--synthetic-max-ratio",
        type=float,
        default=0.40,
        help=(
            "Clamp the effective synthetic-positive count to at most this fraction "
            "of real train positives. Use 0 or a negative value to disable the cap."
        ),
    )
    parser.add_argument(
        "--background-augment-copies",
        type=int,
        default=0,
        help=(
            "How many augmented background variants to create per original background "
            "before synthetic compositing. Use 0 to disable."
        ),
    )
    parser.add_argument(
        "--background-augment-include-original",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include original backgrounds together with augmented background variants.",
    )
    parser.add_argument(
        "--aihub-root",
        default=None,
        help=(
            "Path to preprocess_aihub.py output (images/train, images/val, labels/train, labels/val). "
            "Images are copied as-is alongside real positives with an 'aihub_' prefix."
        ),
    )
    parser.add_argument(
        "--synthetic-cache-dir",
        default=None,
        help=(
            "Drive 경로에 합성 이미지 캐시를 저장/재사용한다 "
            "(예: /content/drive/MyDrive/synthetic_cache). "
            "캐시에 이미지가 충분히 있으면 재생성 없이 그대로 복사해서 쓴다. "
            "부족하면 --synthetic-cache-size 만큼 생성해서 Drive에 저장한 뒤 복사한다."
        ),
    )
    parser.add_argument(
        "--synthetic-cache-size",
        type=int,
        default=1000,
        help=(
            "캐시가 비어 있거나 --force-regen-cache 시 Drive에 생성할 합성 이미지 총 수. "
            "실제 학습에 쓰이는 수(--synthetic-target)와는 별개로, "
            "캐시를 크게 만들어 두면 매 실행마다 다른 샘플을 뽑아 다양성이 높아진다."
        ),
    )
    parser.add_argument(
        "--force-regen-cache",
        action="store_true",
        help="(deprecated) 소스 변경 시 자동 감지로 대체됨. 하위 호환을 위해 인자는 유지.",
    )
    parser.add_argument(
        "--cache-only",
        action="store_true",
        help=(
            "synthetic 캐시만 채우고 dataset 생성 없이 종료. "
            "--synthetic-cache-dir 과 --real-root 가 필요하다."
        ),
    )
    return parser.parse_args()


def ensure_split_dirs(dataset_root: Path) -> None:
    for split in ("train", "val", "test"):
        (dataset_root / "images" / split).mkdir(parents=True, exist_ok=True)
        (dataset_root / "labels" / split).mkdir(parents=True, exist_ok=True)


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(src, dst)
    except OSError as exc:
        if getattr(exc, "winerror", None) == 112 or getattr(exc, "errno", None) == 28:
            raise OSError(f"Out of disk space while copying {src} -> {dst}") from exc
        raise


def save_rgb_image(image: "Image.Image", dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    save_kwargs: dict[str, object] = {}
    if dst.suffix.lower() in {".jpg", ".jpeg"}:
        save_kwargs["quality"] = 92
    try:
        image.save(dst, **save_kwargs)
    except OSError as exc:
        if getattr(exc, "winerror", None) == 112 or getattr(exc, "errno", None) == 28:
            raise OSError(f"Out of disk space while saving {dst}") from exc
        raise


def require_pillow(context: str) -> None:
    try:
        import PIL  # noqa: F401
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            f"Pillow is required for {context}. "
            "Install it with `pip install Pillow` or `pip install -r ml/requirements-detector.txt`."
        ) from exc


def strip_roboflow_suffix(filename: str) -> str:
    if ".rf." in filename:
        return filename.split(".rf.", 1)[0]
    return filename


def bucket_timestamp_stem(stem: str) -> str:
    match = re.fullmatch(r"(\d{8})_(\d{6})", stem)
    if not match:
        return stem

    date_part, time_part = match.groups()
    hour = int(time_part[:2])
    minute = int(time_part[2:4])
    bucket_minute = (minute // 10) * 10
    return f"{date_part}_{hour:02d}{bucket_minute:02d}"


def source_group_key_from_name(filename: str) -> tuple[str | None, str]:
    stem = Path(strip_roboflow_suffix(filename)).stem
    stem = re.sub(r"_(jpg|jpeg|png|webp)$", "", stem, flags=re.IGNORECASE)

    kakao_match = re.fullmatch(r"(KakaoTalk_\d{8}_\d+)(?:_\d+)?", stem)
    if kakao_match:
        return kakao_match.group(1), "kakao"

    timestamp_bucket = bucket_timestamp_stem(stem)
    if timestamp_bucket != stem:
        return timestamp_bucket, "timestamp_bucket"

    generic_suffix_match = re.fullmatch(r"(.+?)_\d{1,3}", stem)
    if generic_suffix_match:
        return generic_suffix_match.group(1), "generic_suffix"

    return None, "content_fallback"


def source_group_key(image_path: Path) -> tuple[str, str]:
    key, strategy = source_group_key_from_name(image_path.name)
    if key is not None:
        return key, strategy
    return content_group_key(str(image_path.resolve())), strategy


@functools.lru_cache(maxsize=None)
def content_group_key(image_path_str: str) -> str:
    require_pillow("content-fallback grouping")
    from PIL import Image

    image_path = Path(image_path_str)
    with Image.open(image_path) as image:
        image = image.convert("L")
        width, height = image.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        image = image.crop((left, top, left + side, top + side))
        image = image.resize((4, 4), Image.BILINEAR)
        pixels = list(image.getdata())

    low = min(pixels)
    high = max(pixels)
    span = max(1, high - low + 1)
    bins = [min(2, int((pixel - low) * 3 / span)) for pixel in pixels]
    return "".join(str(value) for value in bins)


@functools.lru_cache(maxsize=None)
def file_sha256(path_str: str) -> str:
    digest = hashlib.sha256()
    with Path(path_str).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compute_dir_fingerprint(dir_path: Path) -> str:
    """파일명+크기 기반 fingerprint. 추가/삭제/교체를 모두 감지한다."""
    if not dir_path.exists():
        return ""
    entries = sorted(
        (p.relative_to(dir_path).as_posix(), p.stat().st_size)
        for p in dir_path.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
    )
    digest = hashlib.sha256()
    digest.update(repr(entries).encode())
    return digest.hexdigest()[:16]


def list_split_items(image_dir: Path, label_dir: Path) -> list[tuple[Path, Path]]:
    items: list[tuple[Path, Path]] = []
    for image_path in sorted(image_dir.iterdir()):
        if not image_path.is_file() or image_path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        label_path = label_dir / f"{image_path.stem}.txt"
        if not label_path.exists():
            continue
        items.append((image_path, label_path))
    return items


def collect_original_positive_items(pill_yolov8_dir: Path) -> tuple[list[tuple[Path, Path]], list[str]]:
    positive_root = pill_yolov8_dir
    split_names = ("train", "val", "valid", "test")

    # zip 압축 해제 시 동일 이름 폴더가 한 단계 더 생기는 경우 자동 감지
    # 예: /content/pill.yolov8/pill.yolov8/train/...
    if positive_root.exists() and not any((positive_root / s / "images").exists() for s in split_names):
        subdirs = [d for d in positive_root.iterdir() if d.is_dir() and not d.name.startswith("_")]
        if len(subdirs) == 1 and any((subdirs[0] / s / "images").exists() for s in split_names):
            print(f"[pill.yolov8] 중첩 폴더 자동 감지 → {subdirs[0]}", flush=True)
            positive_root = subdirs[0]

    items: list[tuple[Path, Path]] = []
    seen_split_names: list[str] = []

    for split_name in split_names:
        image_dir = positive_root / split_name / "images"
        label_dir = positive_root / split_name / "labels"
        if not image_dir.exists() or not label_dir.exists():
            continue
        items.extend(list_split_items(image_dir, label_dir))
        seen_split_names.append(split_name)

    return items, seen_split_names


def dedupe_labeled_items(items: list[tuple[Path, Path]]) -> tuple[list[tuple[Path, Path]], dict[str, object]]:
    deduped: list[tuple[Path, Path]] = []
    seen_by_key: dict[tuple[str, int], str] = {}
    dropped_samples: list[str] = []
    inconsistent_samples: list[dict[str, str]] = []

    for image_path, label_path in items:
        dedup_key = (strip_roboflow_suffix(image_path.stem), image_path.stat().st_size)
        existing = seen_by_key.get(dedup_key)
        if existing is not None:
            if len(inconsistent_samples) < 20:
                inconsistent_samples.append(
                    {
                        "kept_image": existing,
                        "dropped_image": image_path.name,
                    }
                )
            if len(dropped_samples) < 20:
                dropped_samples.append(image_path.name)
            continue

        seen_by_key[dedup_key] = image_path.name
        deduped.append((image_path, label_path))

    return deduped, {
        "dropped_exact_duplicate_images": len(items) - len(deduped),
        "dropped_exact_duplicate_samples": dropped_samples,
        "inconsistent_duplicate_label_samples": inconsistent_samples,
    }


def dedupe_unlabeled_images(images: list[Path]) -> tuple[list[Path], dict[str, object]]:
    deduped: list[Path] = []
    seen_keys: set[tuple[str, int]] = set()
    dropped_samples: list[str] = []

    for image_path in images:
        dedup_key = (strip_roboflow_suffix(image_path.stem), image_path.stat().st_size)
        if dedup_key in seen_keys:
            if len(dropped_samples) < 20:
                dropped_samples.append(image_path.name)
            continue

        seen_keys.add(dedup_key)
        deduped.append(image_path)

    return deduped, {
        "dropped_exact_duplicate_images": len(images) - len(deduped),
        "dropped_exact_duplicate_samples": dropped_samples,
    }


def build_component_groups(image_paths: list[Path]) -> tuple[dict[Path, str], dict[str, object]]:
    dsu = DisjointSet()
    source_counts: Counter[str] = Counter()
    strategy_counts: Counter[str] = Counter()
    entries: list[tuple[Path, str]] = []

    for image_path in image_paths:
        source_key, strategy = source_group_key(image_path)
        source_node = f"source::{source_key}"
        dsu.find(source_node)
        source_counts[source_key] += 1
        strategy_counts[strategy] += 1
        entries.append((image_path, source_node))

    component_map = {image_path: dsu.find(source_node) for image_path, source_node in entries}
    merged_group_count = len(set(component_map.values()))

    return component_map, {
        "source_group_count": len(source_counts),
        "merged_group_count": merged_group_count,
        "exact_duplicate_hash_groups": 0,
        "grouping_strategies": dict(strategy_counts),
    }


def assign_group_splits(
    group_keys: list[str],
    rng: random.Random,
    val_ratio: float,
    test_ratio: float,
) -> dict[str, str]:
    keys = list(group_keys)
    rng.shuffle(keys)

    total = len(keys)
    test_count = (int(round(total * test_ratio)) if total >= 10 else 0) if test_ratio > 0 else 0
    val_count = max(1, int(round(total * val_ratio))) if total >= 6 else 0
    test_count = min(test_count, max(0, total - 2))
    val_count = min(val_count, max(0, total - test_count - 1))

    split_map: dict[str, str] = {}
    for idx, key in enumerate(keys):
        if idx < test_count:
            split_map[key] = "test"
        elif idx < test_count + val_count:
            split_map[key] = "val"
        else:
            split_map[key] = "train"
    return split_map


def copy_real_positives(
    real_root: Path,
    dataset_root: Path,
    rng: random.Random,
    val_ratio: float,
    test_ratio: float,
    pill_yolov8_dir: Path | None = None,
) -> tuple[dict[str, int], dict[str, object], dict[str, list[str]]]:
    # We intentionally collapse any pre-existing train/val/test split and
    # re-split from scratch so that leakage checks use one consistent policy.
    _pill_dir = pill_yolov8_dir if pill_yolov8_dir is not None else real_root / "pill.yolov8"
    items, source_splits = collect_original_positive_items(_pill_dir)
    if not source_splits:
        raise FileNotFoundError(f"No labeled pill.yolov8 splits were found under train/val/valid/test. (searched: {pill_yolov8_dir})")
    print(f"[real positives] found {len(items)} labeled images", flush=True)
    print(f"[real positives] collected from original splits: {source_splits}", flush=True)
    print("[real positives] grouping by filename/session key when available", flush=True)

    group_map, grouping_stats = build_component_groups([image_path for image_path, _ in items])
    deduped_items, dedupe_stats = dedupe_labeled_items(items)
    grouping_stats = {**grouping_stats, **dedupe_stats}
    if dedupe_stats["dropped_exact_duplicate_images"]:
        print(
            "[real positives] dropped "
            f"{dedupe_stats['dropped_exact_duplicate_images']} within-split exact duplicates",
            flush=True,
        )
    groups = sorted(set(group_map.values()))
    print(
        f"[real positives] grouped into {len(groups)} capture groups"
        f" (exact duplicate merges={grouping_stats['exact_duplicate_hash_groups']})",
        flush=True,
    )
    split_map = assign_group_splits(groups, rng, val_ratio, test_ratio)

    counts = {"train": 0, "val": 0, "test": 0}
    split_membership = {"train": [], "val": [], "test": []}
    for image_path, label_path in deduped_items:
        split = split_map[group_map[image_path]]
        copy_file(image_path, dataset_root / "images" / split / image_path.name)
        copy_file(label_path, dataset_root / "labels" / split / label_path.name)
        counts[split] += 1
        split_membership[split].append(image_path.name)
    return counts, grouping_stats, split_membership


def copy_aihub_positives(
    aihub_root: Path,
    dataset_root: Path,
) -> dict[str, int]:
    """preprocess_aihub.py 출력(images/train, images/val)을 dataset에 병합."""
    counts = {"train": 0, "val": 0, "test": 0}
    skipped_missing_labels = 0
    skipped_non_images = 0
    for split in ("train", "val"):
        image_src = aihub_root / "images" / split
        label_src = aihub_root / "labels" / split
        if not image_src.exists() or not label_src.exists():
            print(f"[aihub positives] {split} 폴더 없음 — 건너뜀", flush=True)
            continue
        for img_path in sorted(image_src.iterdir()):
            if not img_path.is_file() or img_path.suffix.lower() not in IMAGE_SUFFIXES:
                skipped_non_images += 1
                continue
            lbl_path = label_src / f"{img_path.stem}.txt"
            if not lbl_path.exists():
                skipped_missing_labels += 1
                continue
            copy_file(img_path, dataset_root / "images" / split / f"aihub_{img_path.name}")
            copy_file(lbl_path, dataset_root / "labels" / split / f"aihub_{lbl_path.name}")
            counts[split] += 1
    print(
        "[aihub positives] "
        f"train={counts['train']} val={counts['val']} "
        f"skipped_missing_labels={skipped_missing_labels} skipped_non_images={skipped_non_images}",
        flush=True,
    )
    return counts


def copy_hard_negatives(
    real_root: Path,
    dataset_root: Path,
    rng: random.Random,
    val_ratio: float,
    test_ratio: float,
    shadow_prob: float,
    cache_dir: Path | None = None,
) -> tuple[dict[str, int], dict[str, object], dict[str, list[str]]]:
    if cache_dir is not None:
        # 캐시 모드: augment_hard_negatives_cache.py 가 생성한 증강 이미지를 사용.
        # shadow augmentation 불필요 (캐시 생성 시 이미 증강됨).
        negative_dir = cache_dir / "images"
        if not negative_dir.exists():
            raise FileNotFoundError(
                f"hard negative 캐시의 images/ 폴더가 없습니다: {negative_dir}\n"
                "augment_hard_negatives_cache.py 를 먼저 실행하거나 "
                "--hard-negative-cache-dir 인자를 제거하세요."
            )
        shadow_prob = 0.0
        print(f"[hard negatives] 캐시에서 읽는 중: {negative_dir}", flush=True)
    else:
        negative_dir = real_root / "hard_negatives"
    images = [
        path for path in sorted(negative_dir.iterdir()) if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    ]
    print(f"[hard negatives] found {len(images)} images", flush=True)
    print("[hard negatives] grouping by filename/session key when available", flush=True)

    group_map, grouping_stats = build_component_groups(images)
    deduped_images, dedupe_stats = dedupe_unlabeled_images(images)
    grouping_stats = {**grouping_stats, **dedupe_stats}
    grouping_stats["shadow_augmented_images"] = 0
    if dedupe_stats["dropped_exact_duplicate_images"]:
        print(
            "[hard negatives] dropped "
            f"{dedupe_stats['dropped_exact_duplicate_images']} within-split exact duplicates",
            flush=True,
        )
    groups = sorted(set(group_map.values()))
    print(
        f"[hard negatives] grouped into {len(groups)} capture groups"
        f" (exact duplicate merges={grouping_stats['exact_duplicate_hash_groups']})",
        flush=True,
    )
    split_map = assign_group_splits(groups, rng, val_ratio, test_ratio)

    counts = {"train": 0, "val": 0, "test": 0}
    split_membership = {"train": [], "val": [], "test": []}
    for image_path in deduped_images:
        split = split_map[group_map[image_path]]

        prefix = "" if image_path.stem.startswith("neg_") else "neg_"
        image_name = f"{prefix}{image_path.stem}{image_path.suffix.lower()}"
        label_name = f"{prefix}{image_path.stem}.txt"
        image_dst = dataset_root / "images" / split / image_name
        label_dst = dataset_root / "labels" / split / label_name
        if split == "train" and shadow_prob > 0 and rng.random() < shadow_prob:
            from PIL import Image

            try:
                image_name = f"{prefix}{image_path.stem}.jpg"
                image_dst = dataset_root / "images" / split / image_name
                augmented = apply_large_scene_shadow(Image.open(image_path).convert("RGB"), rng)
                save_rgb_image(augmented, image_dst)
                grouping_stats["shadow_augmented_images"] += 1
            except Exception:
                image_name = f"{prefix}{image_path.stem}{image_path.suffix.lower()}"
                image_dst = dataset_root / "images" / split / image_name
                copy_file(image_path, image_dst)
        else:
            copy_file(image_path, image_dst)
        label_dst.write_text("", encoding="utf-8")
        counts[split] += 1
        split_membership[split].append(image_name)

    if grouping_stats["shadow_augmented_images"]:
        print(
            "[hard negatives] applied scene-shadow augmentation to "
            f"{grouping_stats['shadow_augmented_images']} train images",
            flush=True,
        )

    return counts, grouping_stats, split_membership


def list_cutouts(sample_root: Path) -> list[Path]:
    return [path for path in sorted(sample_root.rglob("*.png")) if path.is_file()]


def list_backgrounds(background_root: Path) -> list[Path]:
    return [
        path for path in sorted(background_root.iterdir()) if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    ]


def stage_synthetic_assets(real_root: Path, base_dir: Path) -> tuple[Path, Path, Path]:
    # base_dir 아래 _staging/ 폴더에 sample_img·backgrounds를 복사해둔다.
    # dataset_root든 cache_dir든 어디든 base_dir로 받아서 동일하게 처리한다.
    staging_root = base_dir / "_staging"
    sample_src = real_root / "sample_img"
    background_src = real_root / "backgrounds"
    sample_dst = staging_root / "sample_img"
    background_dst = staging_root / "backgrounds"

    if staging_root.exists():
        shutil.rmtree(staging_root)

    print(f"[synthetic] staging assets into {staging_root}", flush=True)
    shutil.copytree(sample_src, sample_dst)
    shutil.copytree(background_src, background_dst)
    return sample_dst, background_dst, staging_root


def _count_cache_pairs(cache_dir: Path) -> int:
    """cache_dir/images 안의 jpg 중 짝이 되는 labels txt가 있는 쌍의 수를 반환한다."""
    img_dir = cache_dir / "images"
    lbl_dir = cache_dir / "labels"
    if not img_dir.exists() or not lbl_dir.exists():
        return 0
    return sum(1 for p in img_dir.glob("*.jpg") if (lbl_dir / f"{p.stem}.txt").exists())


def _copy_from_cache(
    cache_dir: Path,
    image_out: Path,
    label_out: Path,
    count: int,
    rng: random.Random,
) -> int:
    """캐시에서 count장을 무작위로 골라 dataset train 폴더로 복사한다.
    파일명은 syn_NNNNN 형식을 유지하고 인덱스만 재부여한다."""
    img_dir = cache_dir / "images"
    lbl_dir = cache_dir / "labels"
    pairs = [
        (p, lbl_dir / f"{p.stem}.txt")
        for p in sorted(img_dir.glob("*.jpg"))
        if (lbl_dir / f"{p.stem}.txt").exists()
    ]
    chosen = rng.sample(pairs, k=min(count, len(pairs)))
    for i, (img_path, lbl_path) in enumerate(chosen):
        copy_file(img_path, image_out / f"syn_{i:05d}.jpg")
        copy_file(lbl_path, label_out / f"syn_{i:05d}.txt")
    print(f"[synthetic] cache에서 {len(chosen)}장 복사 완료", flush=True)
    return len(chosen)


_SYNTHETIC_MANIFEST_FILENAME = "synthetic_cache_manifest.json"


def _load_synthetic_cache_manifest(cache_dir: Path) -> dict:
    path = cache_dir / _SYNTHETIC_MANIFEST_FILENAME
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_synthetic_cache_manifest(cache_dir: Path, manifest: dict) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / _SYNTHETIC_MANIFEST_FILENAME).write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True), encoding="utf-8"
    )


def augment_background(image: "Image.Image", rng: random.Random) -> "Image.Image":
    from PIL import Image, ImageEnhance

    bg = image.copy()
    bg_w, bg_h = bg.size

    # Favor closer-looking crops so synthetic scenes resemble handheld captures
    # more often than wide background shots.
    zoom = rng.uniform(0.15, 0.45)
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


def build_augmented_background_pool(
    background_root: Path,
    output_root: Path,
    rng: random.Random,
    copies_per_background: int,
    include_original: bool,
) -> tuple[list[Path], dict[str, object]]:
    originals = list_backgrounds(background_root)
    stats: dict[str, object] = {
        "background_original_count": len(originals),
        "background_augmented_count": 0,
        "background_pool_count": len(originals),
        "background_augment_copies": copies_per_background,
        "background_augment_include_original": include_original,
    }
    if copies_per_background <= 0:
        return originals, stats

    from PIL import Image

    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    augmented: list[Path] = []
    failures = 0
    for bg_path in originals:
        try:
            source = Image.open(bg_path).convert("RGB")
        except Exception:
            failures += 1
            continue

        for copy_idx in range(copies_per_background):
            try:
                augmented_image = augment_background(source, rng)
                out_path = output_root / f"{bg_path.stem}_bgaug_{copy_idx:02d}.jpg"
                save_rgb_image(augmented_image, out_path)
                augmented.append(out_path)
            except Exception:
                failures += 1

    backgrounds = (originals if include_original else []) + augmented
    stats.update(
        {
            "background_augmented_count": len(augmented),
            "background_pool_count": len(backgrounds),
            "background_augment_failures": failures,
            "background_augment_root": str(output_root),
        }
    )
    print(
        "[synthetic] background pool "
        f"original={len(originals)} augmented={len(augmented)} total={len(backgrounds)}",
        flush=True,
    )
    return backgrounds, stats


def crop_to_tight_alpha_bbox(cutout: "Image.Image", alpha_threshold: int = 12) -> "Image.Image | None":
    alpha = cutout.getchannel("A")
    if alpha_threshold > 0:
        alpha = alpha.point(lambda value: 255 if value >= alpha_threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        return None
    return cutout.crop(bbox)


def prepare_cutout(cutout_path: Path, bg_w: int, bg_h: int, rng: random.Random) -> "Image.Image | None":
    from PIL import Image

    try:
        cutout = Image.open(cutout_path).convert("RGBA")
    except Exception:
        return None

    cutout = crop_to_tight_alpha_bbox(cutout)
    if cutout is None:
        return None

    # Uniform scale across 0.15–0.40 of min(bg_w, bg_h) to cover the full
    # range a user might see when holding the phone at varying distances.
    scale = rng.uniform(0.15, 0.40)
    target_size = int(min(bg_w, bg_h) * scale)
    cw, ch = cutout.size
    ratio = min(target_size / max(cw, 1), target_size / max(ch, 1))
    cutout = cutout.resize((max(1, int(cw * ratio)), max(1, int(ch * ratio))), Image.LANCZOS)
    cutout = cutout.rotate(rng.uniform(-18, 18), expand=True, resample=Image.BICUBIC)
    if rng.random() < 0.20:
        cutout = cutout.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    # BICUBIC interpolation leaves dark semi-transparent fringe pixels at edges
    # where opaque pill pixels blend with the transparent (0,0,0,0) background.
    # Threshold low-alpha pixels to fully transparent before the tight crop.
    clean_alpha = cutout.getchannel("A").point(lambda v: 0 if v < 16 else v)
    cutout.putalpha(clean_alpha)
    cutout = crop_to_tight_alpha_bbox(cutout)
    return cutout


def bbox_iou(left_box: tuple[int, int, int, int], right_box: tuple[int, int, int, int]) -> float:
    inter_left = max(left_box[0], right_box[0])
    inter_top = max(left_box[1], right_box[1])
    inter_right = min(left_box[2], right_box[2])
    inter_bottom = min(left_box[3], right_box[3])
    inter_w = max(0, inter_right - inter_left)
    inter_h = max(0, inter_bottom - inter_top)
    if inter_w == 0 or inter_h == 0:
        return 0.0

    inter_area = inter_w * inter_h
    left_area = max(1, (left_box[2] - left_box[0]) * (left_box[3] - left_box[1]))
    right_area = max(1, (right_box[2] - right_box[0]) * (right_box[3] - right_box[1]))
    return inter_area / float(left_area + right_area - inter_area)


def find_paste_position(
    bg_w: int,
    bg_h: int,
    cutout_w: int,
    cutout_h: int,
    placed_boxes: list[tuple[int, int, int, int]],
    rng: random.Random,
    min_iou: float = 0.0,
    max_iou: float | None = None,
) -> tuple[int, int] | None:
    if bg_w <= cutout_w or bg_h <= cutout_h:
        return None

    if max_iou is None:
        max_iou = rng.uniform(0.03, 0.18)

    for _ in range(45):
        x = rng.randint(0, bg_w - cutout_w)
        y = rng.randint(0, bg_h - cutout_h)
        candidate = (x, y, x + cutout_w, y + cutout_h)
        overlaps = [bbox_iou(candidate, existing) for existing in placed_boxes]
        if any(overlap > max_iou for overlap in overlaps):
            continue
        if min_iou > 0.0 and overlaps and max(overlaps) < min_iou:
            continue
        return x, y
    return None


def paste_cutout_with_shadow(
    canvas: "Image.Image",
    cutout: "Image.Image",
    x: int,
    y: int,
    rng: random.Random,
) -> "Image.Image":
    from PIL import Image, ImageFilter

    rgba_canvas = canvas.convert("RGBA")
    alpha = cutout.getchannel("A").point(lambda value: int(value * rng.uniform(0.18, 0.32)))
    shadow_cutout = Image.new("RGBA", cutout.size, (0, 0, 0, 0))
    shadow_cutout.putalpha(alpha)
    cutout_size = max(cutout.size[0], cutout.size[1])
    blur_r = rng.uniform(cutout_size * 0.02, cutout_size * 0.05)
    shadow_cutout = shadow_cutout.filter(ImageFilter.GaussianBlur(radius=blur_r))
    dx = rng.randint(-int(cutout_size * 0.04), int(cutout_size * 0.05) + 1)
    dy = rng.randint(int(cutout_size * 0.05), int(cutout_size * 0.12) + 1)
    # Shadow first so it appears underneath the pill, not on top of it.
    shadow_layer = Image.new("RGBA", rgba_canvas.size, (0, 0, 0, 0))
    shadow_layer.paste(shadow_cutout, (x + dx, y + dy), shadow_cutout)
    rgba_canvas = Image.alpha_composite(rgba_canvas, shadow_layer)
    rgba_canvas.paste(cutout, (x, y), cutout)
    return rgba_canvas.convert("RGB")


def build_blurred_shadow_patch(
    patch_w: int,
    patch_h: int,
    rng: random.Random,
    fill_alpha: int,
) -> "Image.Image":
    from PIL import Image, ImageDraw, ImageFilter

    patch = Image.new("L", (max(1, patch_w), max(1, patch_h)), 0)
    draw = ImageDraw.Draw(patch)
    if rng.random() < 0.65:
        radius = max(12, min(patch.width, patch.height) // 7)
        draw.rounded_rectangle((0, 0, patch.width - 1, patch.height - 1), radius=radius, fill=fill_alpha)
    else:
        draw.ellipse((0, 0, patch.width - 1, patch.height - 1), fill=fill_alpha)

    rotated = patch.rotate(rng.uniform(-38, 38), expand=True, resample=Image.BICUBIC)
    return rotated.filter(ImageFilter.GaussianBlur(radius=rng.uniform(18.0, 52.0)))


def apply_large_scene_shadow(image: "Image.Image", rng: random.Random) -> "Image.Image":
    from PIL import Image, ImageChops, ImageFilter

    if rng.random() >= 0.90:
        return image

    width, height = image.size
    shadow_mask = Image.new("L", image.size, 0)

    def merge_shadow_patch(base_mask: "Image.Image", patch: "Image.Image", left: int, top: int) -> "Image.Image":
        layer = Image.new("L", base_mask.size, 0)
        layer.paste(patch, (left, top))
        return ImageChops.lighter(base_mask, layer)

    band_h = int(height * rng.uniform(0.35, 0.95))
    band_w = int(width * rng.uniform(1.15, 2.00))
    band_alpha = int(rng.uniform(96, 196))
    band_patch = build_blurred_shadow_patch(band_w, band_h, rng, band_alpha)

    edge = rng.choice(("left", "right", "top", "bottom"))
    if edge == "left":
        band_x = -int(band_patch.width * rng.uniform(0.25, 0.62))
        band_y = rng.randint(-band_patch.height // 5, max(-band_patch.height // 5, height - band_patch.height // 2))
    elif edge == "right":
        band_x = width - int(band_patch.width * rng.uniform(0.38, 0.78))
        band_y = rng.randint(-band_patch.height // 5, max(-band_patch.height // 5, height - band_patch.height // 2))
    elif edge == "top":
        band_x = rng.randint(-band_patch.width // 4, max(-band_patch.width // 4, width - band_patch.width // 2))
        band_y = -int(band_patch.height * rng.uniform(0.25, 0.62))
    else:
        band_x = rng.randint(-band_patch.width // 4, max(-band_patch.width // 4, width - band_patch.width // 2))
        band_y = height - int(band_patch.height * rng.uniform(0.38, 0.78))
    shadow_mask = merge_shadow_patch(shadow_mask, band_patch, band_x, band_y)

    if rng.random() < 0.75:
        phone_w = int(width * rng.uniform(0.20, 0.42))
        phone_h = int(height * rng.uniform(0.42, 0.92))
        phone_alpha = int(rng.uniform(70, 156))
        phone_patch = build_blurred_shadow_patch(phone_w, phone_h, rng, phone_alpha)
        phone_edge = rng.choice(("left", "right", "top"))
        if phone_edge == "left":
            phone_x = -int(phone_patch.width * rng.uniform(0.08, 0.42))
            phone_y = rng.randint(-phone_patch.height // 6, max(-phone_patch.height // 6, height - phone_patch.height // 2))
        elif phone_edge == "right":
            phone_x = width - int(phone_patch.width * rng.uniform(0.58, 0.92))
            phone_y = rng.randint(-phone_patch.height // 6, max(-phone_patch.height // 6, height - phone_patch.height // 2))
        else:
            phone_x = rng.randint(-phone_patch.width // 5, max(-phone_patch.width // 5, width - phone_patch.width // 2))
            phone_y = -int(phone_patch.height * rng.uniform(0.04, 0.28))
        shadow_mask = merge_shadow_patch(shadow_mask, phone_patch, phone_x, phone_y)

    if rng.random() < 0.35:
        secondary_w = int(width * rng.uniform(0.75, 1.30))
        secondary_h = int(height * rng.uniform(0.18, 0.42))
        secondary_alpha = int(rng.uniform(54, 132))
        secondary_patch = build_blurred_shadow_patch(secondary_w, secondary_h, rng, secondary_alpha)
        secondary_x = rng.randint(-secondary_patch.width // 3, max(-secondary_patch.width // 3, width - secondary_patch.width // 2))
        secondary_y = rng.randint(-secondary_patch.height // 3, max(-secondary_patch.height // 3, height - secondary_patch.height // 2))
        shadow_mask = merge_shadow_patch(shadow_mask, secondary_patch, secondary_x, secondary_y)

    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=rng.uniform(8.0, 20.0)))
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    overlay.putalpha(shadow_mask)
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def apply_local_pill_blur(
    image: "Image.Image",
    placed_boxes: list[tuple[int, int, int, int]],
    rng: random.Random,
) -> "Image.Image":
    from PIL import Image, ImageDraw, ImageFilter

    if not placed_boxes or rng.random() >= 0.35:
        return image

    base = image.convert("RGBA")
    blurred = image.filter(ImageFilter.GaussianBlur(radius=rng.uniform(1.4, 3.2))).convert("RGBA")
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)

    target_count = 1 if len(placed_boxes) == 1 or rng.random() < 0.70 else min(2, len(placed_boxes))
    targets = rng.sample(placed_boxes, k=target_count)
    for left, top, right, bottom in targets:
        width = max(1, right - left)
        height = max(1, bottom - top)
        pad_x = int(width * rng.uniform(0.35, 0.90))
        pad_y = int(height * rng.uniform(0.35, 0.90))
        blur_left = max(0, left - pad_x)
        blur_top = max(0, top - pad_y)
        blur_right = min(image.size[0] - 1, right + pad_x)
        blur_bottom = min(image.size[1] - 1, bottom + pad_y)
        radius = max(8, min(blur_right - blur_left, blur_bottom - blur_top) // 5)
        draw.rounded_rectangle(
            (blur_left, blur_top, blur_right, blur_bottom),
            radius=radius,
            fill=int(rng.uniform(96, 180)),
        )

    mask = mask.filter(ImageFilter.GaussianBlur(radius=rng.uniform(10.0, 22.0)))
    return Image.composite(blurred, base, mask).convert("RGB")


def choose_synthetic_object_count(rng: random.Random) -> int:
    return rng.choices(SYNTHETIC_OBJECT_CHOICES, weights=SYNTHETIC_OBJECT_WEIGHTS, k=1)[0]


def resolve_effective_synthetic_target(
    requested_target: int,
    real_train_positive_count: int,
    synthetic_max_ratio: float,
) -> int:
    if requested_target <= 0 or real_train_positive_count <= 0:
        return 0
    if synthetic_max_ratio <= 0:
        return requested_target

    max_target = max(1, int(round(real_train_positive_count * synthetic_max_ratio)))
    return min(requested_target, max_target)


def generate_synthetic_positives(
    real_root: Path,
    dataset_root: Path,
    rng: random.Random,
    target_count: int,
    stage_assets: bool,
    background_augment_copies: int,
    background_augment_include_original: bool,
    output_dir: Path | None = None,
) -> dict[str, object]:
    # output_dir이 주어지면 그곳에 이미지/라벨을 저장한다 (캐시 생성용).
    # None이면 기존 동작대로 dataset_root/images/train 에 저장한다.
    from PIL import Image, ImageFilter

    sample_root = real_root / "sample_img"
    background_root = real_root / "backgrounds"
    staging_root: Path | None = None

    # 스테이징 기준 디렉토리: 캐시 생성 시엔 cache_dir 아래에, 일반 생성 시엔 dataset_root 아래에 둔다.
    staging_base = output_dir if output_dir is not None else dataset_root
    if stage_assets:
        sample_root, background_root, staging_root = stage_synthetic_assets(real_root, staging_base)

    cutouts = list_cutouts(sample_root)
    background_aug_root = staging_base / "_background_augmented"
    backgrounds, background_stats = build_augmented_background_pool(
        background_root,
        background_aug_root,
        rng,
        background_augment_copies,
        background_augment_include_original,
    )
    print(
        f"[synthetic] cutouts={len(cutouts)} backgrounds={len(backgrounds)} target={target_count}",
        flush=True,
    )

    if not cutouts or not backgrounds:
        return {
            "created_images": 0,
            "effective_target": target_count,
            "object_histogram": {},
            "attempts": 0,
            "staged_assets": bool(staging_root),
            "staging_root": str(staging_root) if staging_root else "",
            "dropped_small_boxes": 0,
            "images_dropped_all_small_boxes": 0,
            **background_stats,
        }

    if output_dir is not None:
        # 캐시 디렉토리에 images/ labels/ 폴더를 만들어 저장한다.
        image_out = output_dir / "images"
        label_out = output_dir / "labels"
        image_out.mkdir(parents=True, exist_ok=True)
        label_out.mkdir(parents=True, exist_ok=True)
    else:
        image_out = dataset_root / "images" / "train"
        label_out = dataset_root / "labels" / "train"
    created = 0
    attempts = 0
    object_histogram: Counter[int] = Counter()
    dropped_small_boxes = 0
    images_dropped_all_small_boxes = 0

    while created < target_count and attempts < target_count * 25:
        attempts += 1
        background_path = rng.choice(backgrounds)
        try:
            background = augment_background(Image.open(background_path).convert("RGB"), rng)
        except Exception:
            continue

        bg_w, bg_h = background.size
        desired_objects = choose_synthetic_object_count(rng)
        composite = background.copy()
        placed_boxes: list[tuple[int, int, int, int]] = []

        for _ in range(desired_objects * 12):
            if len(placed_boxes) >= desired_objects:
                break

            cutout_path = rng.choice(cutouts)
            cutout = prepare_cutout(cutout_path, bg_w, bg_h, rng)
            if cutout is None:
                continue

            cutout_w, cutout_h = cutout.size
            overlap_mode = len(placed_boxes) > 0 and rng.random() < 0.10
            min_overlap_iou = rng.uniform(0.08, 0.16) if overlap_mode else 0.0
            max_overlap_iou = rng.uniform(0.22, 0.30) if overlap_mode else rng.uniform(0.03, 0.18)
            position = find_paste_position(
                bg_w,
                bg_h,
                cutout_w,
                cutout_h,
                placed_boxes,
                rng,
                min_iou=min_overlap_iou,
                max_iou=max_overlap_iou,
            )
            if position is None:
                continue

            tight_cutout = crop_to_tight_alpha_bbox(cutout)
            if tight_cutout is None:
                continue
            cutout = tight_cutout
            bbox = (0, 0, cutout.size[0], cutout.size[1])

            x, y = position
            composite = paste_cutout_with_shadow(composite, cutout, x, y, rng)
            placed_boxes.append((x + bbox[0], y + bbox[1], x + bbox[2], y + bbox[3]))

        minimum_objects = 1 if desired_objects == 1 else 2
        if len(placed_boxes) < minimum_objects:
            continue

        composite = apply_large_scene_shadow(composite, rng)
        composite = apply_local_pill_blur(composite, placed_boxes, rng)

        out_size = 640
        composite = composite.resize((out_size, out_size), Image.LANCZOS)

        if rng.random() < 0.20:
            composite = composite.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.5, 1.2)))

        # 나중에 붙여진 알약(위)이 먼저 붙여진 알약(아래)을 bbox 기준으로 완전히 덮는 경우 제거.
        # placed_boxes는 붙여진 순서 = 인덱스가 높을수록 위에 있음.
        placed_boxes = [
            box for i, box in enumerate(placed_boxes)
            if not any(
                j > i  # j가 i보다 나중에 붙여졌으므로 위에 있음
                and box[0] >= placed_boxes[j][0]
                and box[1] >= placed_boxes[j][1]
                and box[2] <= placed_boxes[j][2]
                and box[3] <= placed_boxes[j][3]
                for j in range(len(placed_boxes))
            )
        ]

        scale_x = out_size / bg_w
        scale_y = out_size / bg_h
        label_lines: list[str] = []
        small_boxes_in_image = 0
        for left, top, right, bottom in placed_boxes:
            box_w = (right - left) * scale_x / out_size
            box_h = (bottom - top) * scale_y / out_size
            # Drop synthetic boxes whose longest side is still too small after
            # resize; these tend to look unrealistic and hurt crop quality.
            if max(box_w, box_h) < 0.10:
                dropped_small_boxes += 1
                small_boxes_in_image += 1
                continue

            center_x = ((left + right) * 0.5 * scale_x) / out_size
            center_y = ((top + bottom) * 0.5 * scale_y) / out_size
            label_lines.append(f"0 {center_x:.6f} {center_y:.6f} {box_w:.6f} {box_h:.6f}")

        if not label_lines:
            if small_boxes_in_image > 0:
                images_dropped_all_small_boxes += 1
            continue

        stem = f"syn_{created:05d}"
        composite.save(image_out / f"{stem}.jpg", quality=92)
        (label_out / f"{stem}.txt").write_text("\n".join(label_lines) + "\n", encoding="utf-8")
        created += 1
        object_histogram[len(label_lines)] += 1
        if created % 25 == 0 or created == target_count:
            print(f"[synthetic] generated {created}/{target_count}", flush=True)

    print(
        "[synthetic] dropped "
        f"{dropped_small_boxes} boxes (< 0.10 normalized longest side) across "
        f"{images_dropped_all_small_boxes} images",
        flush=True,
    )

    return {
        "created_images": created,
        "effective_target": target_count,
        "object_histogram": dict(sorted(object_histogram.items())),
        "attempts": attempts,
        "staged_assets": bool(staging_root),
        "staging_root": str(staging_root) if staging_root else "",
        "dropped_small_boxes": dropped_small_boxes,
        "images_dropped_all_small_boxes": images_dropped_all_small_boxes,
        **background_stats,
    }


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


def count_split_labels(dataset_root: Path) -> dict[str, int]:
    return {
        split: len(list((dataset_root / "labels" / split).glob("*.txt")))
        for split in ("train", "val", "test")
    }


def write_build_manifest(
    dataset_root: Path,
    args: argparse.Namespace,
    positive_counts: dict[str, int],
    aihub_counts: dict[str, int],
    positive_grouping: dict[str, object],
    positive_membership: dict[str, list[str]],
    negative_counts: dict[str, int],
    negative_grouping: dict[str, object],
    negative_membership: dict[str, list[str]],
    synthetic_stats: dict[str, object],
    final_image_counts: dict[str, int],
    final_label_counts: dict[str, int],
) -> Path:
    manifest_path = dataset_root / "build_manifest.json"
    payload = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "builder_script": str(Path(__file__).resolve()),
        "builder_script_sha256": file_sha256(str(Path(__file__).resolve())),
        "args": {
            "real_root": str(Path(args.real_root).resolve()),
            "output_root": str(Path(args.output_root).resolve()),
            "seed": args.seed,
            "val_ratio": args.val_ratio,
            "test_ratio": args.test_ratio,
            "synthetic_target": args.synthetic_target,
            "synthetic_max_ratio": args.synthetic_max_ratio,
            "background_augment_copies": args.background_augment_copies,
            "background_augment_include_original": args.background_augment_include_original,
            "skip_synthetic": args.skip_synthetic,
            "copy_hard_negatives": args.copy_hard_negatives,
            "hard_negative_shadow_prob": args.hard_negative_shadow_prob,
            "stage_synthetic_assets": args.stage_synthetic_assets,
            "aihub_root": str(Path(args.aihub_root).resolve()) if args.aihub_root else "",
        },
        "grouping": {
            "real_positive": positive_grouping,
            "hard_negative": negative_grouping,
        },
        "counts": {
            "real_positive": positive_counts,
            "aihub_positive": aihub_counts,
            "hard_negative": negative_counts,
            "synthetic": synthetic_stats,
            "images": final_image_counts,
            "labels": final_label_counts,
        },
        "split_membership": {
            "real_positive": positive_membership,
            "hard_negative": negative_membership,
        },
    }
    manifest_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")
    return manifest_path


def main() -> int:
    args = parse_args()
    rng = random.Random(args.seed)

    real_root = Path(args.real_root).resolve()
    dataset_root = Path(args.output_root).resolve()
    pill_yolov8_dir = Path(args.pill_yolov8_dir).resolve() if args.pill_yolov8_dir else None

    if not real_root.exists():
        raise FileNotFoundError(f"real_root not found: {real_root}")
    if pill_yolov8_dir is not None and not pill_yolov8_dir.exists():
        raise FileNotFoundError(f"--pill-yolov8-dir not found: {pill_yolov8_dir}")

    if args.cache_only:
        if not args.synthetic_cache_dir:
            raise ValueError("--cache-only 모드에서는 --synthetic-cache-dir 이 필요합니다.")
        require_pillow("synthetic positive generation")
        cache_dir = Path(args.synthetic_cache_dir).resolve()
        current_source_fp = {
            "backgrounds": compute_dir_fingerprint(real_root / "backgrounds"),
            "sample_img": compute_dir_fingerprint(real_root / "sample_img"),
        }
        syn_manifest = _load_synthetic_cache_manifest(cache_dir)
        stored_source_fp = syn_manifest.get("source_fingerprint")
        if stored_source_fp is not None and stored_source_fp != current_source_fp:
            print("[synthetic] 소스 변경 감지 → 캐시 재생성", flush=True)
            if cache_dir.exists():
                shutil.rmtree(cache_dir)
        available = _count_cache_pairs(cache_dir)
        print(f"[synthetic] cache_dir={cache_dir}  사용 가능={available}장", flush=True)
        if available >= args.synthetic_cache_size:
            print(f"[synthetic] 캐시 충분 ({available}장) — 재생성 건너뜀", flush=True)
        else:
            print(f"[synthetic] Drive에 {args.synthetic_cache_size}장 생성 중...", flush=True)
            generate_synthetic_positives(
                real_root,
                cache_dir,
                rng,
                args.synthetic_cache_size,
                args.stage_synthetic_assets,
                args.background_augment_copies,
                args.background_augment_include_original,
                output_dir=cache_dir,
            )
        _save_synthetic_cache_manifest(cache_dir, {"source_fingerprint": current_source_fp})
        total = _count_cache_pairs(cache_dir)
        print(f"[cache-only] 완료: 합성 캐시 {total}장 → {cache_dir}", flush=True)
        return 0

    if not args.skip_synthetic and args.synthetic_target > 0:
        require_pillow("synthetic positive generation")
    if args.copy_hard_negatives and args.hard_negative_shadow_prob > 0:
        require_pillow("hard negative shadow augmentation")

    if dataset_root.exists():
        shutil.rmtree(dataset_root)

    ensure_split_dirs(dataset_root)
    print(f"[start] building dataset from {real_root}", flush=True)
    if not args.copy_hard_negatives and (args.skip_synthetic or args.synthetic_target <= 0):
        print(
            "[warning] both hard negatives and synthetic positives are disabled. "
            "This build will contain only real positive images.",
            flush=True,
        )

    print("[phase] copy real positives", flush=True)
    positive_counts, positive_grouping, positive_membership = copy_real_positives(
        real_root,
        dataset_root,
        rng,
        args.val_ratio,
        args.test_ratio,
        pill_yolov8_dir=pill_yolov8_dir,
    )

    aihub_counts = {"train": 0, "val": 0, "test": 0}
    if args.aihub_root:
        aihub_root = Path(args.aihub_root).resolve()
        if not aihub_root.exists():
            raise FileNotFoundError(f"aihub_root not found: {aihub_root}")
        print("[phase] copy aihub positives", flush=True)
        aihub_counts = copy_aihub_positives(aihub_root, dataset_root)

    negative_counts = {"train": 0, "val": 0, "test": 0}
    negative_grouping: dict[str, object] = {
        "source_group_count": 0,
        "merged_group_count": 0,
        "exact_duplicate_hash_groups": 0,
        "grouping_strategies": {},
    }
    negative_membership = {"train": [], "val": [], "test": []}
    if args.copy_hard_negatives:
        print("[phase] copy hard negatives", flush=True)
        neg_cache = Path(args.hard_negative_cache_dir).resolve() if args.hard_negative_cache_dir else None
        negative_counts, negative_grouping, negative_membership = copy_hard_negatives(
            real_root,
            dataset_root,
            rng,
            args.val_ratio,
            args.test_ratio,
            args.hard_negative_shadow_prob,
            cache_dir=neg_cache,
        )

    synthetic_stats: dict[str, object] = {
        "created_images": 0,
        "requested_target": args.synthetic_target,
        "effective_target": 0,
        "object_histogram": {},
        "attempts": 0,
        "staged_assets": False,
        "staging_root": "",
        "dropped_small_boxes": 0,
        "images_dropped_all_small_boxes": 0,
    }
    if not args.skip_synthetic and args.synthetic_target > 0:
        effective_synthetic_target = resolve_effective_synthetic_target(
            requested_target=args.synthetic_target,
            real_train_positive_count=positive_counts["train"] + aihub_counts["train"],
            synthetic_max_ratio=args.synthetic_max_ratio,
        )
        synthetic_stats["effective_target"] = effective_synthetic_target
        if effective_synthetic_target < args.synthetic_target:
            print(
                "[synthetic] clamped target from "
                f"{args.synthetic_target} to {effective_synthetic_target} "
                f"using synthetic_max_ratio={args.synthetic_max_ratio:.2f}",
                flush=True,
            )
        print("[phase] generate synthetic positives", flush=True)

        cache_dir = Path(args.synthetic_cache_dir).resolve() if args.synthetic_cache_dir else None

        if cache_dir is not None:
            # ── 캐시 모드 ──────────────────────────────────────────────────────
            # 1) --force-regen-cache 가 붙으면 기존 캐시를 통째로 지운다.
            #    sample_img / backgrounds 소스를 교체했을 때 한 번만 사용하면 된다.
            if args.force_regen_cache and cache_dir.exists():
                print(f"[synthetic] --force-regen-cache: 기존 캐시 삭제 → {cache_dir}", flush=True)
                shutil.rmtree(cache_dir)

            # 소스 변경 자동 감지: backgrounds / sample_img 파일 구성이 바뀌면 캐시 무효화.
            current_source_fp = {
                "backgrounds": compute_dir_fingerprint(real_root / "backgrounds"),
                "sample_img": compute_dir_fingerprint(real_root / "sample_img"),
            }
            syn_manifest = _load_synthetic_cache_manifest(cache_dir)
            stored_source_fp = syn_manifest.get("source_fingerprint")
            if stored_source_fp is not None and stored_source_fp != current_source_fp:
                print(
                    "[synthetic] 소스 변경 감지 (backgrounds 또는 sample_img 변경) → 캐시 재생성",
                    flush=True,
                )
                if cache_dir.exists():
                    shutil.rmtree(cache_dir)

            available = _count_cache_pairs(cache_dir)
            print(f"[synthetic] cache_dir={cache_dir}  사용 가능={available}장", flush=True)

            if available < effective_synthetic_target:
                # 2) 캐시가 비어 있거나 부족하면 --synthetic-cache-size 만큼 새로 생성한다.
                #    생성된 이미지는 Drive(cache_dir)에 영구 보관된다.
                cache_size = max(args.synthetic_cache_size, effective_synthetic_target)
                print(
                    f"[synthetic] 캐시 부족 → Drive에 {cache_size}장 생성 중 (최초 또는 재생성)...",
                    flush=True,
                )
                synthetic_stats = generate_synthetic_positives(
                    real_root,
                    dataset_root,
                    rng,
                    cache_size,
                    args.stage_synthetic_assets,
                    args.background_augment_copies,
                    args.background_augment_include_original,
                    output_dir=cache_dir,  # dataset이 아닌 Drive 캐시 폴더에 저장
                )
            else:
                print(f"[synthetic] 캐시 재사용 (생성 건너뜀)", flush=True)
                synthetic_stats = {
                    "created_images": 0,
                    "effective_target": effective_synthetic_target,
                    "object_histogram": {},
                    "attempts": 0,
                    "staged_assets": False,
                    "staging_root": "",
                    "dropped_small_boxes": 0,
                    "images_dropped_all_small_boxes": 0,
                    "background_original_count": 0,
                    "background_augmented_count": 0,
                    "background_pool_count": 0,
                    "background_augment_copies": args.background_augment_copies,
                    "background_augment_include_original": args.background_augment_include_original,
                    "loaded_from_cache": True,
                }

            # 3) 캐시에서 effective_synthetic_target 장을 무작위로 뽑아 dataset에 복사한다.
            #    매 실행마다 다른 샘플이 뽑혀 학습 다양성이 높아진다.
            image_out = dataset_root / "images" / "train"
            label_out = dataset_root / "labels" / "train"
            loaded = _copy_from_cache(cache_dir, image_out, label_out, effective_synthetic_target, rng)
            synthetic_stats["created_images"] = loaded

            _save_synthetic_cache_manifest(cache_dir, {"source_fingerprint": current_source_fp})

        else:
            # ── 캐시 없음: 매 실행마다 직접 생성 (기존 동작) ──────────────────
            synthetic_stats = generate_synthetic_positives(
                real_root,
                dataset_root,
                rng,
                effective_synthetic_target,
                args.stage_synthetic_assets,
                args.background_augment_copies,
                args.background_augment_include_original,
            )

        synthetic_stats["requested_target"] = args.synthetic_target
    else:
        print("[phase] synthetic positives skipped", flush=True)

    yaml_path = write_dataset_yaml(dataset_root)
    final_image_counts = count_split_images(dataset_root)
    final_label_counts = count_split_labels(dataset_root)
    manifest_path = write_build_manifest(
        dataset_root,
        args,
        positive_counts,
        aihub_counts,
        positive_grouping,
        positive_membership,
        negative_counts,
        negative_grouping,
        negative_membership,
        synthetic_stats,
        final_image_counts,
        final_label_counts,
    )

    print(f"dataset_root={dataset_root}")
    print(f"dataset_yaml={yaml_path}")
    print(f"build_manifest={manifest_path}")
    print(f"real_positive_counts={positive_counts}")
    print(f"aihub_positive_counts={aihub_counts}")
    print(f"real_positive_grouping={positive_grouping}")
    print(f"hard_negative_counts={negative_counts}")
    print(f"hard_negative_grouping={negative_grouping}")
    print(f"synthetic_stats={synthetic_stats}")
    print(f"final_image_counts={final_image_counts}")
    print(f"final_label_counts={final_label_counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
