"""함의 시거리 게이트 (지시 1) — 이론서 6·8·18장 대조 검증.

이론서에 수치 검증례가 있는 것은 그 값으로, 없는 것은 알려진 카메라에서 역산해 확인한다.
"""
from __future__ import annotations
import math
import numpy as np
import pytest

from stage_perspective.viewdist import (d_from_ellipse, d_from_trapezoid, f_from_two_vps,
                                        f_from_three_vps, gate, evaluate_quad)


def _rot(rx, ry, rz):
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _vps_for(f, P, R):
    """직교 세 방향의 소실점 (이론서 6.1)."""
    out = []
    for i in range(3):
        d = R[:, i]
        out.append(P + f * np.array([d[0] / d[2], d[1] / d[2]]))
    return out


def test_ellipse_matches_theory_numeric_check():
    """이론서 8.7 수치 검증: a=.25,b=.5,A=.354,B=.125 → d=1.000."""
    r = d_from_ellipse(a=0.25, b=0.5, A=0.354, B=0.125)
    assert r["ok"]
    assert abs(r["f"] - 1.0) < 0.005


def test_three_vp_orthocenter_is_principal_point_and_f_exact():
    """6.3 수심 정리 + 6.4 f²=|PVᵢ||PHᵢ|. 자유도 0이므로 잔차도 0이어야 한다(5.3)."""
    f, P = 500.0, np.array([400.0, 300.0])
    R = _rot(math.radians(25), math.radians(35), math.radians(15))
    r = f_from_three_vps(*_vps_for(f, P, R))
    assert r["ok"]
    assert np.allclose(r["principal_point"], P, atol=1e-6)
    assert abs(r["f"] - f) < 1e-6
    assert r["residual"] < 1e-9          # 세 조합이 같은 f²


def test_three_vp_obtuse_triangle_is_deterministically_invalid():
    """6.5 예각 조건: 둔각삼각형이면 f²<0 → 대응 직육면체가 존재하지 않는다.
    확률적 게이트가 아니라 결정적 무효 판정이다(지시 1.3)."""
    # 한 점이 다른 두 점 사이에 가깝게 놓인 둔각(거의 일직선) 삼각형
    obtuse = [np.array([0.0, 0.0]), np.array([1000.0, 0.0]), np.array([500.0, 30.0])]
    r = f_from_three_vps(*obtuse)
    assert not r["ok"]
    assert r["reason"] == "obtuse_triangle_f2_negative"
    assert r["f2"] < 0
    assert gate(None, 800.0, ok=False)["verdict"] == "invalid"


def test_two_vp_f_from_known_camera():
    """6.2 f²=|PV₁||PV₂| (주점 주어짐)."""
    f, P = 500.0, np.array([400.0, 300.0])
    R = _rot(math.radians(20), math.radians(30), 0.0)
    v = _vps_for(f, P, R)
    r = f_from_two_vps(v[0], v[1], (800, 600), principal=P)
    assert r["ok"]
    assert abs(r["f"] - f) < 1e-6


def _one_point_quad(d, h, width, depth, z0):
    def pr(X, Z):
        return np.array([d * X / Z, d * (-h) / Z])
    return np.array([pr(-width / 2, z0), pr(width / 2, z0),
                     pr(width / 2, z0 + depth), pr(-width / 2, z0 + depth)])


@pytest.mark.parametrize("d_true", [300.0, 500.0, 800.0])
def test_trapezoid_recovers_viewing_distance_of_a_square(d_true):
    """8.8 d = 2/[s(1/b′−1/a′)] — 정사각형이면 참 시거리를 정확히 준다."""
    q = _one_point_quad(d_true, h=150.0, width=200.0, depth=200.0, z0=400.0)
    r = d_from_trapezoid(q)
    assert r["ok"]
    assert abs(r["f"] - d_true) / d_true < 1e-6


def test_trapezoid_is_never_wrong_only_implies_other_distance():
    """8.8의 핵심: 모든 사다리꼴은 어떤 시거리에 대해 정사각형이다.
    2:1 직사각형(width:depth)은 참 d의 2배를 함의한다 — 퇴화가 없으므로
    재투영 오차로는 잡히지 않는다(2I fit_error recall≈0의 원인)."""
    d_true = 500.0
    q = _one_point_quad(d_true, h=150.0, width=400.0, depth=200.0, z0=400.0)
    r = d_from_trapezoid(q)
    assert r["ok"]
    assert abs(r["f"] - 2 * d_true) / d_true < 1e-6      # implied/true = width/depth


def test_gate_thresholds_follow_18_4():
    """18.4: d≥0.87W 신뢰 / ≥0.5W 경고 / <0.5W 불가."""
    W = 800.0
    assert gate(0.90 * W, W)["verdict"] == "trust"
    assert gate(0.60 * W, W)["verdict"] == "warn"
    assert gate(0.30 * W, W)["verdict"] == "unreliable"
    assert gate(-1.0, W)["verdict"] == "invalid"
    # 화각 환산이 단조
    assert gate(0.90 * W, W)["fov_deg"] < gate(0.60 * W, W)["fov_deg"]


def test_two_point_f_is_independent_of_aspect_error():
    """**게이트 적용 범위의 근거**(지시 1.4 발견): 2점 경로에서 f는 두 VP와 주점만으로
    결정되므로(6.2) 종횡비가 무엇이든 참값이 나온다 → 종횡비 실패를 잡을 수 없다.
    시거리 게이트는 형태 가정에서 d를 역산하는 1점 경로에 속한다."""
    from stage_perspective.decompose import _project_polygon
    from stage_perspective.priors import rect
    sz = (800.0, 600.0)
    ratios = []
    for a in (0.4, 1.0, 2.5):
        truth = rect(a) * 5.0
        c = truth.mean(0)
        diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
        eye = (c[0] + diag * 1.6, c[1] + diag * 1.2, diag * 1.1)
        img = _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz)
        r = evaluate_quad(img, sz)
        assert r["case"] == "2pt"
        ratios.append(r["ratio"])
    # 종횡비가 6배 넘게 달라져도 함의 시거리는 같다
    assert max(ratios) - min(ratios) < 1e-6
