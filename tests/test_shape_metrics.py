"""형태 비교 지표 (지시 D-1b) — 상사 IoU vs 방위 유지 IoU.

두 지표는 **용도가 다르다**. 하나로 통일하면 안 된다.
  similarity_iou : 형태만. 단일 뷰 복원 평가의 표준(축 뒤바뀜은 게이지, D-1)
  oriented_iou   : 방위를 오차로 셈. 다중 뷰·대지 방위용

§13 규칙 3에 따라 **반례**를 함께 잠근다 — 지표가 자명하게 1을 내지 않는지.
"""
from __future__ import annotations
import numpy as np
import pytest

from stage_perspective.shape_metrics import (similarity_iou, oriented_iou,
                                             best_similarity_iou, polygon_iou)

RECT = np.array([[0, 0], [10, 0], [10, 6], [0, 6]], float)
RECT_ROT90 = np.array([[0, 0], [0, 10], [-6, 10], [-6, 0]], float)   # 같은 도형, 90° 회전
L = np.array([[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]], float)
U = np.array([[0, 0], [12, 0], [12, 10], [8, 10], [8, 4], [4, 4], [4, 10], [0, 10]], float)


def test_similarity_iou_is_rotation_invariant():
    """핵심: 90° 회전은 **오차가 아니다**(D-1 게이지 판정)."""
    assert similarity_iou(RECT, RECT_ROT90) == pytest.approx(1.0, abs=1e-6)


def test_oriented_iou_still_counts_rotation():
    """반대 지표는 회전을 오차로 센다 — 다중 뷰·대지 방위에서 필요하다. 폐기하지 않는다."""
    assert oriented_iou(RECT, RECT_ROT90) < 0.7


def test_correspondence_search_is_required():
    """정점 순서가 순환 이동되면 대응 탐색 없이는 같은 도형도 낮게 나온다.
    D-1 1차 측정이 이 함정에 빠져 게이지를 real_error로 오판했다."""
    shifted = np.roll(RECT, 1, axis=0)
    assert similarity_iou(RECT, shifted, search_correspondence=False) < 0.9   # 함정
    assert similarity_iou(RECT, shifted) == pytest.approx(1.0, abs=1e-6)      # 탐색하면 해결


def test_counterexample_different_shapes_score_low():
    """§13 규칙 3 — 지표가 자명하지 않은가. 다른 도형은 낮아야 한다."""
    assert similarity_iou(U, np.roll(U, 2, axis=0)) is not None
    # 정점 수가 다르면 대응을 못 세운다 → None(조용히 1을 내지 않는다)
    assert similarity_iou(L, U) is None
    # 같은 정점 수의 다른 도형은 낮다
    U2 = U.copy(); U2[4] = [8, 1]
    assert similarity_iou(U, U2) < 0.95


def test_metric_is_monotone_in_deformation():
    """왜곡이 커질수록 단조 감소해야 한다 — 값을 해석할 수 있으려면."""
    vals = []
    for d in (0.0, 1.0, 2.0, 3.0, 4.0):
        bad = L.copy(); bad[3] = [5.0 + d, 5.0 - d * 0.6]
        vals.append(similarity_iou(L, bad))
    assert all(vals[i] > vals[i + 1] for i in range(len(vals) - 1))


def test_calibration_anchors_for_interpretation():
    """측정값 해석용 기준점(2H 재산출 보고에서 인용). 회귀 시 이 값이 흔들리면 해석도 흔들린다."""
    notch30 = L.copy(); notch30[3] = [8.0, 3.2]           # 노치 ~30% 이동
    aspect125 = L.copy(); aspect125[:, 0] *= 1.25          # 종횡비 25% 왜곡
    assert similarity_iou(L, notch30) == pytest.approx(0.80, abs=0.03)
    assert similarity_iou(L, aspect125) == pytest.approx(0.81, abs=0.03)


def test_best_similarity_iou_reports_shift():
    shifted = np.roll(RECT, 1, axis=0)
    v, k = best_similarity_iou(RECT, shifted)
    assert v == pytest.approx(1.0, abs=1e-6)
    assert k is not None


def test_degenerate_inputs_return_none():
    assert similarity_iou(RECT, RECT[:3]) is None
    assert similarity_iou(RECT[:2], RECT[:2]) is None
