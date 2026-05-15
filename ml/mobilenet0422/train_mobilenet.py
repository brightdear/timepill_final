"""
Timepill MobileNet embedding trainer.

This script is intentionally aligned to the current repo structure:
  1. Build a bootstrap RGB dataset from transparent cutouts:
       python ml/mobilenet0422/build_mobilenet_dataset.py
  2. Train an embedding model from that dataset:
       python ml/mobilenet0422/train_mobilenet.py --export-onnx

The bootstrap dataset is not the final production dataset.
It exists so we can start from local assets today, then fine-tune later
with real registration crops and real scan failures.
"""

from __future__ import annotations

import argparse
import copy
import json
import random
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset, Sampler
from torchvision import models, transforms

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def parse_args() -> argparse.Namespace:
    ml_root = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(
        description="Train a MobileNetV3 Small pill embedding model from a bootstrap dataset."
    )
    parser.add_argument(
        "--dataset-root",
        default=str(ml_root / "_mobilenet_bootstrap"),
        help="Root folder produced by mobilenet0422/build_mobilenet_dataset.py (class folders directly under root).",
    )
    parser.add_argument(
        "--output-root",
        default=str(ml_root / "_mobilenet_runs" / "bootstrap_mobilenet_v3_small"),
        help="Directory where checkpoints and export artifacts are written.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--embed-dim", type=int, default=128)
    parser.add_argument("--input-size", type=int, default=160)
    parser.add_argument("--epochs", type=int, default=36)
    parser.add_argument(
        "--freeze-epochs",
        type=int,
        default=6,
        help="Freeze the backbone for the first N epochs, then fine-tune end-to-end.",
    )
    parser.add_argument("--margin", type=float, default=0.20)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--head-lr", type=float, default=3e-4)
    parser.add_argument("--backbone-lr", type=float, default=1e-4)
    parser.add_argument("--classes-per-batch", type=int, default=8)
    parser.add_argument("--samples-per-class", type=int, default=4)
    parser.add_argument(
        "--train-batches-per-epoch",
        type=int,
        default=80,
        help="How many balanced batches to sample per train epoch.",
    )
    parser.add_argument(
        "--val-batches-per-epoch",
        type=int,
        default=20,
        help="How many balanced batches to sample when estimating validation loss.",
    )
    parser.add_argument("--train-ratio", type=float, default=0.70)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument(
        "--export-onnx",
        action="store_true",
        help="Export best checkpoint to ONNX after training.",
    )
    parser.add_argument(
        "--export-tflite",
        action="store_true",
        help="Export ONNX to TFLite with onnx2tf. Implies --export-onnx.",
    )
    return parser.parse_args()


def image_files(folder: Path) -> list[Path]:
    return [
        path for path in sorted(folder.iterdir())
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    ]


def split_class_names(
    class_names: list[str],
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> dict[str, list[str]]:
    if not class_names:
        raise ValueError("No classes found in dataset root.")

    ratios = train_ratio + val_ratio + test_ratio
    if abs(ratios - 1.0) > 1e-6:
        raise ValueError("train/val/test ratios must sum to 1.0")

    shuffled = list(class_names)
    random.Random(seed).shuffle(shuffled)

    total = len(shuffled)
    n_test = max(1, int(round(total * test_ratio))) if total >= 10 else 0
    n_val = max(1, int(round(total * val_ratio))) if total >= 6 else 0

    n_test = min(n_test, max(0, total - 2))
    n_val = min(n_val, max(0, total - n_test - 1))
    n_train = total - n_val - n_test

    if n_train < 2:
        raise ValueError(
            f"Need at least 2 train classes for triplet learning, but only got {n_train}."
        )

    return {
        "train": shuffled[:n_train],
        "val": shuffled[n_train:n_train + n_val],
        "test": shuffled[n_train + n_val:],
    }


def build_split_samples(
    dataset_root: Path,
    split_classes: list[str],
) -> tuple[list[tuple[Path, int]], dict[int, str], dict[str, int]]:
    samples: list[tuple[Path, int]] = []
    label_to_class: dict[int, str] = {}
    counts: dict[str, int] = {}

    for label, class_name in enumerate(split_classes):
        class_dir = dataset_root / class_name
        class_images = image_files(class_dir)
        if len(class_images) < 2:
            continue
        label_to_class[label] = class_name
        counts[class_name] = len(class_images)
        samples.extend((path, label) for path in class_images)

    return samples, label_to_class, counts


class PillImageDataset(Dataset):
    def __init__(self, samples: list[tuple[Path, int]], transform: transforms.Compose):
        self.samples = samples
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        path, label = self.samples[index]
        image = Image.open(path).convert("RGB")
        return self.transform(image), label


class BalancedBatchSampler(Sampler[list[int]]):
    def __init__(
        self,
        labels: list[int],
        classes_per_batch: int,
        samples_per_class: int,
        steps_per_epoch: int,
        seed: int,
    ) -> None:
        self.classes_per_batch = classes_per_batch
        self.samples_per_class = samples_per_class
        self.steps_per_epoch = steps_per_epoch
        self.seed = seed
        self.epoch = 0
        self.class_to_indices: dict[int, list[int]] = defaultdict(list)
        for index, label in enumerate(labels):
            self.class_to_indices[label].append(index)

        if len(self.class_to_indices) < 2:
            raise ValueError("Balanced batches need at least 2 classes in the split.")

    def set_epoch(self, epoch: int) -> None:
        self.epoch = epoch

    def __len__(self) -> int:
        return self.steps_per_epoch

    def __iter__(self):
        rng = random.Random(self.seed + self.epoch)
        class_ids = sorted(self.class_to_indices)

        for _ in range(self.steps_per_epoch):
            if len(class_ids) >= self.classes_per_batch:
                selected_classes = rng.sample(class_ids, self.classes_per_batch)
            else:
                selected_classes = [rng.choice(class_ids) for _ in range(self.classes_per_batch)]

            batch: list[int] = []
            for class_id in selected_classes:
                indices = self.class_to_indices[class_id]
                if len(indices) >= self.samples_per_class:
                    batch.extend(rng.sample(indices, self.samples_per_class))
                else:
                    batch.extend(rng.choices(indices, k=self.samples_per_class))
            rng.shuffle(batch)
            yield batch


class PillEmbedder(nn.Module):
    def __init__(self, embed_dim: int):
        super().__init__()
        try:
            weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
        except AttributeError:
            weights = "IMAGENET1K_V1"

        backbone = models.mobilenet_v3_small(weights=weights)
        self.features = backbone.features
        self.avgpool = backbone.avgpool
        self.projector = nn.Sequential(
            nn.Linear(576, 256),
            nn.Hardswish(),
            nn.Dropout(0.2),
            nn.Linear(256, embed_dim),
        )

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        embeddings = self.features(images)
        embeddings = self.avgpool(embeddings)
        embeddings = embeddings.flatten(1)
        embeddings = self.projector(embeddings)
        return F.normalize(embeddings, p=2, dim=1)


def set_backbone_trainable(model: PillEmbedder, trainable: bool) -> None:
    for parameter in model.features.parameters():
        parameter.requires_grad = trainable


def build_transforms(input_size: int) -> tuple[transforms.Compose, transforms.Compose]:
    train_transform = transforms.Compose([
        transforms.Resize(int(input_size * 1.15)),
        transforms.RandomResizedCrop(
            input_size,
            scale=(0.85, 1.00),
            ratio=(0.90, 1.10),
        ),
        transforms.RandomRotation(12),
        transforms.ColorJitter(
            brightness=0.15,
            contrast=0.15,
            saturation=0.08,
            hue=0.02,
        ),
        transforms.RandomApply(
            [transforms.GaussianBlur(kernel_size=3, sigma=(0.10, 1.20))],
            p=0.20,
        ),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])

    eval_transform = transforms.Compose([
        transforms.Resize((input_size, input_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    return train_transform, eval_transform


def batch_hard_triplet_loss(
    embeddings: torch.Tensor,
    labels: torch.Tensor,
    margin: float,
) -> tuple[torch.Tensor, int]:
    distances = torch.cdist(embeddings, embeddings, p=2)
    loss_sum = embeddings.new_tensor(0.0)
    valid_triplets = 0

    for index in range(labels.size(0)):
        positive_mask = labels == labels[index]
        positive_mask[index] = False
        negative_mask = labels != labels[index]

        if not positive_mask.any() or not negative_mask.any():
            continue

        hardest_positive = distances[index][positive_mask].max()
        hardest_negative = distances[index][negative_mask].min()
        loss_sum = loss_sum + F.relu(hardest_positive - hardest_negative + margin)
        valid_triplets += 1

    if valid_triplets == 0:
        return embeddings.new_tensor(0.0), 0
    return loss_sum / valid_triplets, valid_triplets


def create_train_loader(
    samples: list[tuple[Path, int]],
    input_size: int,
    classes_per_batch: int,
    samples_per_class: int,
    steps_per_epoch: int,
    seed: int,
    workers: int,
    pin_memory: bool,
) -> tuple[DataLoader, BalancedBatchSampler]:
    train_transform, _ = build_transforms(input_size)
    dataset = PillImageDataset(samples, train_transform)
    sampler = BalancedBatchSampler(
        labels=[label for _, label in samples],
        classes_per_batch=classes_per_batch,
        samples_per_class=samples_per_class,
        steps_per_epoch=steps_per_epoch,
        seed=seed,
    )
    loader = DataLoader(
        dataset,
        batch_sampler=sampler,
        num_workers=workers,
        pin_memory=pin_memory,
    )
    return loader, sampler


def create_eval_loader(
    samples: list[tuple[Path, int]],
    input_size: int,
    batch_size: int,
    workers: int,
    pin_memory: bool,
) -> DataLoader:
    _, eval_transform = build_transforms(input_size)
    dataset = PillImageDataset(samples, eval_transform)
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=workers,
        pin_memory=pin_memory,
    )


@torch.no_grad()
def estimate_balanced_loss(
    model: PillEmbedder,
    loader: DataLoader,
    sampler: BalancedBatchSampler,
    device: torch.device,
    margin: float,
    epoch: int,
) -> float:
    model.eval()
    sampler.set_epoch(epoch)
    total_loss = 0.0
    counted = 0

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)
        embeddings = model(images)
        loss, valid_triplets = batch_hard_triplet_loss(embeddings, labels, margin)
        if valid_triplets == 0:
            continue
        total_loss += loss.item()
        counted += 1

    return total_loss / max(1, counted)


@torch.no_grad()
def collect_embeddings(
    model: PillEmbedder,
    loader: DataLoader,
    device: torch.device,
) -> tuple[torch.Tensor, torch.Tensor]:
    model.eval()
    all_embeddings: list[torch.Tensor] = []
    all_labels: list[torch.Tensor] = []

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        embeddings = model(images).cpu()
        all_embeddings.append(embeddings)
        all_labels.append(labels.cpu())

    if not all_embeddings:
        return torch.empty(0, 0), torch.empty(0, dtype=torch.long)

    return torch.cat(all_embeddings, dim=0), torch.cat(all_labels, dim=0)


def compute_retrieval_metrics(
    embeddings: torch.Tensor,
    labels: torch.Tensor,
) -> dict[str, float]:
    if embeddings.numel() == 0 or labels.numel() == 0 or embeddings.size(0) < 2:
        return {
            "top1": 0.0,
            "positive_mean": 0.0,
            "negative_mean": 0.0,
            "gap": 0.0,
            "positive_p05": 0.0,
            "negative_p95": 0.0,
            "threshold_hint": 0.0,
        }

    similarities = embeddings @ embeddings.T
    count = labels.size(0)
    eye = torch.eye(count, dtype=torch.bool)
    same = labels[:, None] == labels[None, :]
    positive_mask = same & ~eye
    negative_mask = ~same

    nearest_indices = similarities.masked_fill(eye, float("-inf")).argmax(dim=1)
    top1 = (labels[nearest_indices] == labels).float().mean().item()

    positive_values = similarities[positive_mask]
    negative_values = similarities[negative_mask]

    if positive_values.numel() == 0 or negative_values.numel() == 0:
        positive_mean = 0.0
        negative_mean = 0.0
        gap = 0.0
        positive_p05 = 0.0
        negative_p95 = 0.0
        threshold_hint = 0.0
    else:
        positive_mean = positive_values.mean().item()
        negative_mean = negative_values.mean().item()
        gap = positive_mean - negative_mean
        positive_p05 = torch.quantile(positive_values, 0.05).item()
        negative_p95 = torch.quantile(negative_values, 0.95).item()
        threshold_hint = (positive_p05 + negative_p95) * 0.5

    return {
        "top1": top1,
        "positive_mean": positive_mean,
        "negative_mean": negative_mean,
        "gap": gap,
        "positive_p05": positive_p05,
        "negative_p95": negative_p95,
        "threshold_hint": threshold_hint,
    }


def train_one_epoch(
    model: PillEmbedder,
    loader: DataLoader,
    sampler: BalancedBatchSampler,
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    margin: float,
    epoch: int,
) -> float:
    model.train()
    sampler.set_epoch(epoch)
    total_loss = 0.0
    counted = 0

    for images, labels in loader:
        images = images.to(device, non_blocking=True)
        labels = labels.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)
        embeddings = model(images)
        loss, valid_triplets = batch_hard_triplet_loss(embeddings, labels, margin)
        if valid_triplets == 0:
            continue
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
        counted += 1

    return total_loss / max(1, counted)


def build_optimizer(
    model: PillEmbedder,
    head_lr: float,
    backbone_lr: float | None,
    weight_decay: float,
) -> torch.optim.Optimizer:
    if backbone_lr is None:
        return torch.optim.AdamW(
            model.projector.parameters(),
            lr=head_lr,
            weight_decay=weight_decay,
        )

    return torch.optim.AdamW(
        [
            {"params": model.features.parameters(), "lr": backbone_lr},
            {"params": model.projector.parameters(), "lr": head_lr},
        ],
        weight_decay=weight_decay,
    )


def save_checkpoint(
    path: Path,
    model: PillEmbedder,
    args: argparse.Namespace,
    epoch: int,
    best_metric: float,
    metrics: dict[str, float],
    split_summary: dict[str, object],
) -> None:
    payload = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "epoch": epoch,
        "best_metric": best_metric,
        "metrics": metrics,
        "config": vars(args),
        "split_summary": split_summary,
        "model_state": model.state_dict(),
    }
    torch.save(payload, path)


def load_checkpoint_state(checkpoint_path: Path, embed_dim: int) -> PillEmbedder:
    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model = PillEmbedder(embed_dim=embed_dim)
    state = checkpoint["model_state"] if isinstance(checkpoint, dict) and "model_state" in checkpoint else checkpoint
    model.load_state_dict(state)
    model.eval()
    return model


def export_onnx(checkpoint_path: Path, output_root: Path, embed_dim: int, input_size: int) -> Path:
    model = load_checkpoint_state(checkpoint_path, embed_dim)
    dummy = torch.randn(1, 3, input_size, input_size)
    onnx_path = output_root / "best.onnx"
    torch.onnx.export(
        model,
        dummy,
        str(onnx_path),
        input_names=["input"],
        output_names=["embedding"],
        dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=14,
    )
    return onnx_path


def export_tflite(onnx_path: Path, output_root: Path) -> Path:
    tflite_root = output_root / "tflite"
    command = ["onnx2tf", "-i", str(onnx_path), "-o", str(tflite_root)]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            "onnx2tf export failed.\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
    return tflite_root


def main() -> int:
    args = parse_args()
    dataset_root = Path(args.dataset_root).resolve()
    output_root = Path(args.output_root).resolve()

    if not dataset_root.exists():
        raise FileNotFoundError(
            f"Dataset root not found: {dataset_root}\n"
            "Run `python ml/mobilenet0422/build_mobilenet_dataset.py` first."
        )

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    output_root.mkdir(parents=True, exist_ok=True)

    class_names = sorted([
        path.name for path in dataset_root.iterdir()
        if path.is_dir() and len(image_files(path)) >= 2
    ])

    split_classes = split_class_names(
        class_names,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )

    train_samples, train_label_to_class, train_class_counts = build_split_samples(dataset_root, split_classes["train"])
    val_samples, val_label_to_class, val_class_counts = build_split_samples(dataset_root, split_classes["val"])
    test_samples, test_label_to_class, test_class_counts = build_split_samples(dataset_root, split_classes["test"])

    if len(train_label_to_class) < 2:
        raise ValueError("Need at least 2 train classes with >=2 images each.")
    if val_samples and len(val_label_to_class) < 2:
        raise ValueError("Validation split must contain at least 2 classes with >=2 images each.")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pin_memory = device.type == "cuda"

    train_loader, train_sampler = create_train_loader(
        samples=train_samples,
        input_size=args.input_size,
        classes_per_batch=args.classes_per_batch,
        samples_per_class=args.samples_per_class,
        steps_per_epoch=args.train_batches_per_epoch,
        seed=args.seed,
        workers=args.workers,
        pin_memory=pin_memory,
    )

    val_balanced_loader = None
    val_balanced_sampler = None
    if val_samples:
        _, eval_transform = build_transforms(args.input_size)
        val_dataset = PillImageDataset(val_samples, eval_transform)
        val_balanced_sampler = BalancedBatchSampler(
            labels=[label for _, label in val_samples],
            classes_per_batch=min(args.classes_per_batch, len(val_label_to_class)),
            samples_per_class=args.samples_per_class,
            steps_per_epoch=args.val_batches_per_epoch,
            seed=args.seed + 777,
        )
        val_balanced_loader = DataLoader(
            val_dataset,
            batch_sampler=val_balanced_sampler,
            num_workers=args.workers,
            pin_memory=pin_memory,
        )

    eval_batch_size = args.classes_per_batch * args.samples_per_class
    val_eval_loader = create_eval_loader(
        val_samples,
        input_size=args.input_size,
        batch_size=eval_batch_size,
        workers=args.workers,
        pin_memory=pin_memory,
    ) if val_samples else None
    test_eval_loader = create_eval_loader(
        test_samples,
        input_size=args.input_size,
        batch_size=eval_batch_size,
        workers=args.workers,
        pin_memory=pin_memory,
    ) if test_samples else None

    model = PillEmbedder(embed_dim=args.embed_dim).to(device)
    set_backbone_trainable(model, False)
    optimizer = build_optimizer(
        model=model,
        head_lr=args.head_lr,
        backbone_lr=None,
        weight_decay=args.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=max(1, args.freeze_epochs),
    )

    split_summary = {
        "dataset_root": str(dataset_root),
        "train_classes": split_classes["train"],
        "val_classes": split_classes["val"],
        "test_classes": split_classes["test"],
        "train_class_counts": train_class_counts,
        "val_class_counts": val_class_counts,
        "test_class_counts": test_class_counts,
        "normalization": {
            "mean": IMAGENET_MEAN,
            "std": IMAGENET_STD,
        },
    }
    (output_root / "split_summary.json").write_text(
        json.dumps(split_summary, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )

    best_checkpoint_path = output_root / "best.pt"
    last_checkpoint_path = output_root / "last.pt"
    best_metric = float("-inf")
    best_state = None
    history: list[dict[str, float]] = []

    for epoch in range(1, args.epochs + 1):
        if epoch == args.freeze_epochs + 1:
            set_backbone_trainable(model, True)
            optimizer = build_optimizer(
                model=model,
                head_lr=args.head_lr,
                backbone_lr=args.backbone_lr,
                weight_decay=args.weight_decay,
            )
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
                optimizer,
                T_max=max(1, args.epochs - args.freeze_epochs),
            )

        train_loss = train_one_epoch(
            model=model,
            loader=train_loader,
            sampler=train_sampler,
            optimizer=optimizer,
            device=device,
            margin=args.margin,
            epoch=epoch,
        )

        metrics = {
            "train_loss": train_loss,
            "val_loss": 0.0,
            "val_top1": 0.0,
            "val_gap": 0.0,
            "val_positive_p05": 0.0,
            "val_negative_p95": 0.0,
            "val_threshold_hint": 0.0,
        }

        if val_balanced_loader is not None and val_balanced_sampler is not None:
            metrics["val_loss"] = estimate_balanced_loss(
                model=model,
                loader=val_balanced_loader,
                sampler=val_balanced_sampler,
                device=device,
                margin=args.margin,
                epoch=epoch,
            )

        if val_eval_loader is not None:
            val_embeddings, val_labels = collect_embeddings(model, val_eval_loader, device)
            val_metrics = compute_retrieval_metrics(val_embeddings, val_labels)
            metrics["val_top1"] = val_metrics["top1"]
            metrics["val_gap"] = val_metrics["gap"]
            metrics["val_positive_p05"] = val_metrics["positive_p05"]
            metrics["val_negative_p95"] = val_metrics["negative_p95"]
            metrics["val_threshold_hint"] = val_metrics["threshold_hint"]

        score = metrics["val_top1"] + max(metrics["val_gap"], 0.0) * 0.10
        history.append({"epoch": epoch, **metrics})

        print(
            f"[{epoch:02d}/{args.epochs}] "
            f"train_loss={metrics['train_loss']:.4f} "
            f"val_loss={metrics['val_loss']:.4f} "
            f"val_top1={metrics['val_top1']:.4f} "
            f"val_gap={metrics['val_gap']:.4f}"
        )

        if score > best_metric:
            best_metric = score
            best_state = copy.deepcopy(model.state_dict())
            save_checkpoint(
                path=best_checkpoint_path,
                model=model,
                args=args,
                epoch=epoch,
                best_metric=best_metric,
                metrics=metrics,
                split_summary=split_summary,
            )
            print("           -> best checkpoint updated")

        scheduler.step()

    if best_state is None:
        raise RuntimeError("Training finished without producing a checkpoint.")

    model.load_state_dict(best_state)
    save_checkpoint(
        path=last_checkpoint_path,
        model=model,
        args=args,
        epoch=args.epochs,
        best_metric=best_metric,
        metrics=history[-1],
        split_summary=split_summary,
    )

    test_metrics = {
        "top1": 0.0,
        "positive_mean": 0.0,
        "negative_mean": 0.0,
        "gap": 0.0,
        "positive_p05": 0.0,
        "negative_p95": 0.0,
        "threshold_hint": 0.0,
    }
    if test_eval_loader is not None:
        test_embeddings, test_labels = collect_embeddings(model, test_eval_loader, device)
        test_metrics = compute_retrieval_metrics(test_embeddings, test_labels)

    run_summary = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "device": str(device),
        "config": vars(args),
        "split_summary": split_summary,
        "history": history,
        "best_score": best_metric,
        "test_metrics": test_metrics,
        "notes": [
            "Validation/test are class-disjoint. This estimates generalization to unseen pill classes.",
            "Threshold hints are only bootstrap references. Real thresholds must be recalibrated with real crops.",
            "Training normalization uses ImageNet mean/std and should match app-side MobileNet preprocessing.",
        ],
    }

    onnx_path = None
    if args.export_onnx or args.export_tflite:
        onnx_path = export_onnx(best_checkpoint_path, output_root, args.embed_dim, args.input_size)
        run_summary["onnx_path"] = str(onnx_path)

    if args.export_tflite and onnx_path is not None:
        tflite_root = export_tflite(onnx_path, output_root)
        run_summary["tflite_root"] = str(tflite_root)

    (output_root / "run_summary.json").write_text(
        json.dumps(run_summary, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )

    print(f"best_checkpoint={best_checkpoint_path}")
    print(f"last_checkpoint={last_checkpoint_path}")
    print(f"run_summary={output_root / 'run_summary.json'}")
    if onnx_path is not None:
        print(f"onnx_export={onnx_path}")
    print(f"test_top1={test_metrics['top1']:.4f}")
    print(f"test_gap={test_metrics['gap']:.4f}")
    print(f"threshold_hint={test_metrics['threshold_hint']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
