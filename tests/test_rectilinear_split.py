"""직교 폴리곤 분할 (지시 D-1b-2) — 외곽/노치 분해와 범위 판정.

**중요**: 분할 자체는 동작하나, 이를 근거로 한 "외곽=measured / 노치=prior" 전제는
측정에서 성립하지 않았다(split_eval). 아래 테스트는 **분해 동작**을 고정할 뿐
그 전제를 승인하지 않는다. 근거는 progress.md의 D-1b-2 절.
"""
from __future__ import annotations
import math
import numpy as np
import pytest

from stage_perspective.rectilinear_split import (split, notch_count, outer_box,
                                                 reflex_vertices, principal_frame)
from stage_perspective.metric_audit import polygon_aspect

RECT = np.array([[0, 0], [10, 0], [10, 6], [0, 6]], float)
L = np.array([[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]], float)
U = np.array([[0, 0], [12, 0], [12, 10], [8, 10], [8, 4], [4, 4], [4, 10], [0, 10]], float)
STAIR = np.array([[0, 0], [12, 0], [12, 3], [8, 3], [8, 6], [4, 6], [4, 9], [0, 9]], float)


def _rot(P, deg):
    t = math.radians(deg)
    R = np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])
    return P @ R.T


# ---------------------------------------------------------------- 노치 개수 = 범위 판정
@pytest.mark.parametrize("poly,expected", [(RECT, 0), (L, 1), (U, 2), (STAIR, 2)])
def test_notch_count_matches_reflex_vertices(poly, expected):
    assert notch_count(poly) == expected


def test_scope_from_notch_count():
    """D-1b-2 d — 노치 1개면 L형(분할 대상), 2개 이상은 범위 밖."""
    assert split(RECT)["scope"] == "rect"
    assert split(L)["scope"] == "L"
    assert split(U)["scope"] == "out_of_scope"
    assert split(STAIR)["scope"] == "out_of_scope"
    assert "노치 2개" in split(U)["reason"]


# ---------------------------------------------------------------- 프레임
def test_edge_frame_gives_natural_bbox_not_pca():
    """직교 폴리곤은 **변 방향**으로 정렬해야 자연 외곽이 나온다.
    L의 자연 bbox는 정사각(1.0)인데 PCA는 대각으로 돌아 1.333을 준다 — 서로 다른 양이다.
    이 차이가 '외곽 비례 4.6%'와 '16.7%'의 간극을 만들었다(split_eval)."""
    assert outer_box(L)["aspect"] == pytest.approx(1.0, abs=1e-9)
    assert polygon_aspect(L) == pytest.approx(1.3333, abs=1e-3)


def test_outer_aspect_is_rotation_invariant():
    for deg in (17.0, 37.0, 63.0, 88.0):
        assert outer_box(_rot(L, deg))["aspect"] == pytest.approx(1.0, abs=1e-6)
        assert outer_box(_rot(RECT, deg))["aspect"] == pytest.approx(10 / 6, abs=1e-6)


def test_length_weighted_frame_is_stable_under_vertex_noise():
    """최장변 하나로 프레임을 잡으면 노이즈에 흔들린다(실측서 외곽오차 0.213→0.143).
    길이 가중 원형 평균은 흔들림이 작아야 한다."""
    rng = np.random.default_rng(0)
    diag = float(np.hypot(*np.ptp(L, 0)))
    errs = []
    for _ in range(50):
        noisy = L + rng.normal(0, 0.02 * diag, L.shape)
        errs.append(abs(outer_box(noisy)["aspect"] - 1.0))
    assert float(np.median(errs)) < 0.25


# ---------------------------------------------------------------- 노치 기술
def test_notch_size_is_recovered_as_ratio():
    """L의 노치는 외곽의 절반×절반이다."""
    nz = split(L)["notch"]
    assert nz["du"] == pytest.approx(0.5, abs=1e-9)
    assert nz["dv"] == pytest.approx(0.5, abs=1e-9)


def test_notch_size_is_rotation_invariant_but_corner_label_is_not():
    """노치 **크기**는 회전 불변이다. **모서리 라벨**은 프레임 따라 돈다 —
    축 라벨이 게이지인 것(D-1)과 같은 성질이므로 결함이 아니다."""
    a = split(L)["notch"]
    b = split(_rot(L, 37.0))["notch"]
    assert b["du"] == pytest.approx(a["du"], abs=1e-6)
    assert b["dv"] == pytest.approx(a["dv"], abs=1e-6)
    # 라벨은 달라질 수 있다(게이지) — 같아야 한다고 주장하지 않는다
    assert b["corner"] in ("--", "+-", "-+", "++")


def test_notch_none_when_not_single_notch():
    assert split(RECT)["notch"] is None
    assert split(U)["notch"] is None


def test_degenerate_polygon_reports_instead_of_crashing():
    flat = np.array([[0, 0], [10, 0], [20, 0], [30, 0]], float)
    r = split(flat)
    assert r["scope"] in ("degenerate", "rect")
