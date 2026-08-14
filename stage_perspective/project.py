"""합성 투영 유틸 — 세계 2D 폴리곤을 카메라로 이미지에 투영한다.

W-A a에서 `decompose.py`(Track 2 형태 추론 판정, §2.3 폐기)를 제거하면서
그 안의 순수 유틸 두 개만 남긴다. 형태를 **추론**하지 않고 **합성**만 한다 —
투시 작도 방식의 검증(W-0/W-2)에서 정답이 알려진 이미지를 만드는 데 쓴다.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.camera import _K_from_size


def rect(aspect: float, w: float = 1.0) -> np.ndarray:
    """폭:높이 = aspect:1 인 직사각형(원점 기준, CCW)."""
    h = w / float(aspect)
    return np.array([[0.0, 0.0], [w, 0.0], [w, h], [0.0, h]], float)


def project_polygon(world2d, eye, target, img_size) -> np.ndarray:
    """N정점 평면 폴리곤(Z=0) → 이미지 정점. eye에서 target을 본다."""
    import cv2
    from stage3.synth import _look_at
    K = _K_from_size(img_size)
    rvec, tvec = _look_at(np.array(eye, float), np.array(target, float))
    w3 = np.hstack([np.asarray(world2d, float), np.zeros((len(world2d), 1))])
    img, _ = cv2.projectPoints(w3, rvec, tvec, K, None)
    return img.reshape(-1, 2)


# 구 이름 호환(테스트에서 쓰던 밑줄 이름)
_project_polygon = project_polygon
