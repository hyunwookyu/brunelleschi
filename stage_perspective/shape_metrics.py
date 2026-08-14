"""형태 비교 지표 — 회전 동치(상사) IoU와 방위 유지 IoU (지시 D-1b).

**왜 두 개인가**: 무엇을 오차로 셀지는 용도에 달렸다.

  `similarity_iou`  회전·스케일·이동 + **정점 대응**까지 허용. 형태만 본다.
      단일 뷰 복원 평가의 **표준 지표**. 세계 좌표계의 방위는 단일 뷰에서
      결정되지 않으므로(D-1: 축 뒤바뀜은 게이지 자유도) 그것을 오차로 세면 과민이다.

  `oriented_iou`    스케일·이동만 정규화(구 `_norm` + `_poly_iou`). **방위를 오차로 센다.**
      다중 뷰 결합·대지 방위처럼 **세계 방위가 의미를 갖는 경우**에는 이쪽이 맞다.
      폐기하지 않고 용도를 구분해 남긴다.

**이 구분이 없어서 생긴 일**(D-1): 90° 회전한 게이지 해가 `oriented_iou` 0.53으로 찍혀
"축 뒤바뀜이 2F 최대 식별 오차원"이라는 잘못된 결론이 나왔다. B-2의 지표 맹점과 같은
계열이되, 그쪽은 둔감(놓침)이고 이쪽은 **과민**(없는 오차를 셈)이다.

**정점 대응 탐색이 필수다**: 두 해는 `perm`이 달라 정점 순서가 순환 이동돼 있다.
순서대로 맞추면 같은 도형도 IoU 0.45로 나온다(D-1 1차 측정이 이 함정에 빠졌다).
"""
from __future__ import annotations
from typing import Optional
import numpy as np


def _poly_area(P: np.ndarray) -> float:
    x, y = P[:, 0], P[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


def normalize_scale_translation(poly) -> np.ndarray:
    """스케일·이동 정규화(회전은 두 채로). 구 `reconstruct._norm`과 동일."""
    p = np.asarray(poly, float)
    c = p.mean(0)
    diag = float(np.hypot(*(p.max(0) - p.min(0)))) or 1.0
    return (p - c) / diag


def polygon_iou(a, b) -> float:
    """두 폴리곤의 IoU(shapely). 정규화는 호출자 책임."""
    from shapely.geometry import Polygon
    A = Polygon(np.asarray(a, float)).buffer(0)
    B = Polygon(np.asarray(b, float)).buffer(0)
    if A.is_empty or B.is_empty:
        return 0.0
    u = A.union(B).area
    return float(A.intersection(B).area / u) if u else 0.0


def oriented_iou(truth, recovered) -> float:
    """**방위를 오차로 세는** IoU. 다중 뷰·대지 방위처럼 세계 방위가 의미 있을 때 쓴다."""
    return polygon_iou(normalize_scale_translation(truth), normalize_scale_translation(recovered))


def _procrustes_align(truth: np.ndarray, recovered: np.ndarray) -> np.ndarray:
    """recovered를 truth에 상사변환(회전+스케일+이동) 정합. 정점 순서가 대응한다고 가정."""
    T = np.asarray(truth, float)
    R = np.asarray(recovered, float)
    tc, rc = T.mean(0), R.mean(0)
    T0, R0 = T - tc, R - rc
    H = R0.T @ T0
    U, s, Vt = np.linalg.svd(H)
    Rot = Vt.T @ U.T
    if np.linalg.det(Rot) < 0:
        Vt[-1] *= -1
        Rot = Vt.T @ U.T
    scale = s.sum() / (np.sum(R0 ** 2) + 1e-12)
    return (scale * R0 @ Rot.T) + tc


def similarity_iou(truth, recovered, search_correspondence: bool = True) -> Optional[float]:
    """**표준 지표** — 회전·스케일·이동 + 정점 대응까지 허용한 형태 일치도.

    정점 수가 같아야 한다(대응을 세우므로). 다르면 None.
    `search_correspondence=False`면 순서를 그대로 믿는다(디버그용 — 함정 재현).
    """
    T = np.asarray(truth, float)
    R = np.asarray(recovered, float)
    if len(T) != len(R) or len(T) < 3:
        return None
    if not search_correspondence:
        return polygon_iou(T, _procrustes_align(T, R))
    best = 0.0
    n = len(R)
    for rev in (False, True):
        Q = R[::-1] if rev else R
        for k in range(n):
            cand = np.roll(Q, k, axis=0)
            v = polygon_iou(T, _procrustes_align(T, cand))
            if v > best:
                best = float(v)
    return best


def best_similarity_iou(a, b):
    """최대 상사 IoU와 그 대응 `(reversed, shift)`. D-1의 게이지 판정에서 쓴 것."""
    A = np.asarray(a, float)
    B = np.asarray(b, float)
    if len(A) != len(B) or len(A) < 3:
        return 0.0, None
    best, bestk = 0.0, None
    for rev in (False, True):
        Q = B[::-1] if rev else B
        for k in range(len(Q)):
            v = polygon_iou(A, _procrustes_align(A, np.roll(Q, k, axis=0)))
            if v > best:
                best, bestk = float(v), (rev, k)
    return best, bestk
