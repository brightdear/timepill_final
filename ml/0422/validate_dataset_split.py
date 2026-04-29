from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

from build_real_prototype_dataset import IMAGE_SUFFIXES, source_group_key_from_name


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate built dataset splits for group overlap and exact duplicates.")
    parser.add_argument("--dataset-root", required=True, help="Path to a built dataset root that contains images/{train,val,test}.")
    parser.add_argument("--json-out", default="", help="Optional path to write the validation report as JSON.")
    parser.add_argument(
        "--strict-fallback",
        action="store_true",
        help="Fail if any file names require content-fallback grouping that cannot be reconstructed from built names.",
    )
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def classify_image(path: Path) -> str:
    if path.stem.startswith("neg_"):
        return "negative"
    if path.stem.startswith("syn_"):
        return "synthetic"
    return "positive"


def recover_source_name(path: Path) -> str:
    if path.stem.startswith("neg_"):
        return path.name[len("neg_") :]
    return path.name


def main() -> int:
    args = parse_args()
    dataset_root = Path(args.dataset_root).resolve()
    split_dirs = {split: dataset_root / "images" / split for split in ("train", "val", "test")}

    group_membership = {
        "positive": defaultdict(set),
        "negative": defaultdict(set),
    }
    exact_hash_membership = {
        "positive": defaultdict(set),
        "negative": defaultdict(set),
        "synthetic": defaultdict(set),
    }
    exact_hash_paths = {
        "positive": defaultdict(list),
        "negative": defaultdict(list),
        "synthetic": defaultdict(list),
    }
    fallback_files: list[str] = []
    counts: dict[str, dict[str, int]] = {
        "positive": {"train": 0, "val": 0, "test": 0},
        "negative": {"train": 0, "val": 0, "test": 0},
        "synthetic": {"train": 0, "val": 0, "test": 0},
    }

    for split, image_dir in split_dirs.items():
        for image_path in sorted(image_dir.iterdir()):
            if not image_path.is_file() or image_path.suffix.lower() not in IMAGE_SUFFIXES:
                continue

            kind = classify_image(image_path)
            counts[kind][split] += 1

            image_hash = file_sha256(image_path)
            exact_hash_membership[kind][image_hash].add(split)
            exact_hash_paths[kind][image_hash].append(str(image_path.relative_to(dataset_root)))

            if kind == "synthetic":
                continue

            group_key, strategy = source_group_key_from_name(recover_source_name(image_path))
            if group_key is None:
                fallback_files.append(str(image_path.relative_to(dataset_root)))
                group_key = f"FALLBACK::{Path(recover_source_name(image_path)).stem}"
            group_membership[kind][group_key].add(split)

    report = {
        "dataset_root": str(dataset_root),
        "counts": counts,
        "group_overlap": {},
        "cross_split_duplicates": {},
        "within_split_duplicates": {},
        "empty_required_splits": [],
        "fallback_files": fallback_files,
    }

    has_overlap = False
    has_cross_split_duplicates = False
    has_within_split_duplicates = False
    for kind in ("positive", "negative"):
        overlap = {
            group_key: sorted(splits)
            for group_key, splits in group_membership[kind].items()
            if len(splits) > 1
        }
        duplicates = {
            digest: {
                "splits": sorted(splits),
                "paths": exact_hash_paths[kind][digest],
            }
            for digest, splits in exact_hash_membership[kind].items()
            if len(splits) > 1
        }
        within_split_duplicates = {
            digest: {
                "splits": sorted(splits),
                "paths": exact_hash_paths[kind][digest],
            }
            for digest, splits in exact_hash_membership[kind].items()
            if len(splits) == 1 and len(exact_hash_paths[kind][digest]) > 1
        }
        report["group_overlap"][kind] = overlap
        report["cross_split_duplicates"][kind] = duplicates
        report["within_split_duplicates"][kind] = within_split_duplicates
        has_overlap = has_overlap or bool(overlap)
        has_cross_split_duplicates = has_cross_split_duplicates or bool(duplicates)
        has_within_split_duplicates = has_within_split_duplicates or bool(within_split_duplicates)

    report["cross_split_duplicates"]["synthetic"] = {
        digest: {
            "splits": sorted(splits),
            "paths": exact_hash_paths["synthetic"][digest],
        }
        for digest, splits in exact_hash_membership["synthetic"].items()
        if len(splits) > 1
    }
    report["within_split_duplicates"]["synthetic"] = {
        digest: {
            "splits": sorted(splits),
            "paths": exact_hash_paths["synthetic"][digest],
        }
        for digest, splits in exact_hash_membership["synthetic"].items()
        if len(splits) == 1 and len(exact_hash_paths["synthetic"][digest]) > 1
    }
    has_within_split_duplicates = has_within_split_duplicates or bool(report["within_split_duplicates"]["synthetic"])

    for split in ("train", "val"):
        split_total = sum(kind_counts[split] for kind_counts in counts.values())
        if split_total == 0:
            report["empty_required_splits"].append(split)

    if args.json_out:
        output_path = Path(args.json_out).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, indent=2, ensure_ascii=True), encoding="utf-8")
        print(f"json_report={output_path}")

    print(f"dataset_root={dataset_root}")
    for kind, split_counts in counts.items():
        print(f"[{kind}] counts={split_counts}")
    for kind in ("positive", "negative"):
        overlap_count = len(report["group_overlap"][kind])
        duplicate_count = len(report["cross_split_duplicates"][kind])
        within_split_duplicate_count = len(report["within_split_duplicates"][kind])
        print(
            f"[{kind}] group_overlap={overlap_count} "
            f"cross_split_duplicates={duplicate_count} "
            f"within_split_duplicates={within_split_duplicate_count}"
        )
    print(
        "[synthetic] cross_split_duplicates="
        f"{len(report['cross_split_duplicates']['synthetic'])} "
        "within_split_duplicates="
        f"{len(report['within_split_duplicates']['synthetic'])}"
    )
    if report["empty_required_splits"]:
        print(f"empty_required_splits={report['empty_required_splits']}")
    print(f"fallback_files={len(fallback_files)}")
    for rel_path in fallback_files[:20]:
        print(f"  fallback {rel_path}")

    if has_overlap or has_cross_split_duplicates or has_within_split_duplicates:
        return 1
    if report["empty_required_splits"]:
        return 1
    if args.strict_fallback and fallback_files:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
