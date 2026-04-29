"""
Timepill — 커스텀 augmentation 유틸
albumentations built-in으로 커버 안 되는 케이스만 여기서 구현.
"""

import random
import numpy as np


def apply_rect_shadow(image: np.ndarray, p: float = 0.30) -> np.ndarray:
    """
    핸드폰 그림자 시뮬레이션 — 이미지 한쪽 가장자리에 직사각형 어두운 패치.

    실사용: 핸드폰이 광원 위에 있으면 상단/좌/우 중 한쪽에
    폭이 좁고 긴 직사각형 그림자가 생김.

    Parameters
    ----------
    image : np.ndarray
        HxWxC, uint8
    p : float
        적용 확률 (default 0.30)

    Returns
    -------
    np.ndarray
        augment된 이미지 (원본과 동일한 shape/dtype)
    """
    if random.random() > p:
        return image

    img = image.copy()
    h, w = img.shape[:2]

    side = random.choice(["top", "left", "right"])

    # 그림자 두께: 이미지 짧은 변의 10~30%
    thickness_ratio = random.uniform(0.10, 0.30)
    # 불투명도: 40~70%
    alpha = random.uniform(0.40, 0.70)

    if side == "top":
        thickness = int(h * thickness_ratio)
        region = img[:thickness, :, :]
    elif side == "left":
        thickness = int(w * thickness_ratio)
        region = img[:, :thickness, :]
    else:  # right
        thickness = int(w * thickness_ratio)
        region = img[:, w - thickness:, :]

    darkened = (region * (1.0 - alpha)).astype(np.uint8)

    if side == "top":
        img[:thickness, :, :] = darkened
    elif side == "left":
        img[:, :thickness, :] = darkened
    else:
        img[:, w - thickness:, :] = darkened

    return img


def build_albumentations_transform():
    """
    YOLO 학습용 albumentations 파이프라인.
    YOLO의 built-in augmentation과 중복되지 않는 것만 포함.

    사용법 (YOLO 콜백 또는 커스텀 Dataset):
        transform = build_albumentations_transform()
        aug = transform(image=img)["image"]
    """
    try:
        import albumentations as A
    except ImportError:
        raise ImportError("pip install albumentations")

    return A.Compose([
        A.OneOf([
            A.Blur(blur_limit=3, p=1.0),
            A.MedianBlur(blur_limit=3, p=1.0),
        ], p=0.25),
        A.CLAHE(clip_limit=2.0, p=0.20),
        A.RandomBrightnessContrast(
            brightness_limit=0.2,
            contrast_limit=0.2,
            p=0.30,
        ),
        A.GaussNoise(var_limit=(5, 30), p=0.20),
        A.ImageCompression(quality_lower=75, quality_upper=95, p=0.20),
        A.CoarseDropout(
            max_holes=2,
            max_height=60,
            max_width=60,
            min_holes=1,
            fill_value=0,
            p=0.25,
        ),
    ])
