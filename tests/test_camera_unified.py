"""통합 카메라 복원 + 실척 축 + 반복 모듈 (지시 2.2~2.5, 이론서 2.3/5.3/6/7.7/9.5).

이론서에 수치가 있는 것은 그 값으로, 없는 것은 알려진 카메라에서 역산해 확인한다.
핵심 성질: **분기 구현이 아니라 유한 소실점 개수로 나뉜다**(2.3).
"""
from __future__ import annotations
import math
import numpy as np
import pytest

from stage_perspective.camera_unified import (recover_camera, direct_scale_axes,
                                              vanishing_points_from_quad)
from stage_perspective.repetition import (is_evenly_spaced, predict_next,
                                          detect_repetition, harmonic_coords)

SZ = (800.0, 600.0)


def _rot(rx, ry, rz):
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz_ = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz_, 0], [sz_, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _vps(f, P, R):
    return [P + f * np.array([R[0, i] / R[2, i], R[1, i] / R[2, i]]) for i in range(3)]


# ---------------------------------------------------------------- 3점
def test_three_vps_no_dof_exact_recovery():
    """5.3: 3점은 자유도 없음 → 주점·f가 결정되고 잔차가 곧 신뢰도."""
    f, P = 520.0, np.array([400.0, 300.0])
    R = _rot(math.radians(22), math.radians(31), math.radians(11))
    r = recover_camera(_vps(f, P, R), SZ)
    assert r["case"] == "3pt" and r["ok"]
    assert abs(r["f"] - f) < 1e-6
    assert np.allclose(r["principal_point"], P, atol=1e-6)
    assert r["residual"] < 1e-9
    assert r["direct_scale_axes"] == []          # 7.7: 3점은 실척 직접 없음


def test_three_vps_obtuse_is_deterministic_invalid():
    """6.5: 둔각삼각형이면 f²<0 → 대응 직육면체가 존재하지 않는다. 확률 아님."""
    obtuse = [np.array([0.0, 0.0]), np.array([700.0, 0.0]), np.array([350.0, 20.0])]
    r = recover_camera(obtuse, SZ)
    assert r["case"] == "3pt" and not r["ok"]
    assert r["verdict"] == "invalid"
    assert any("둔각" in u for u in r["unresolved"])


# ---------------------------------------------------------------- 2점
def test_two_vps_uses_image_center_assumption():
    """6.2 + 16.2: 자유도 1을 '주점=이미지 중심' 가정으로 소진. 가정을 명시해야 한다."""
    f, P = 500.0, np.array([SZ[0] / 2, SZ[1] / 2])
    R = _rot(math.radians(18), math.radians(28), 0.0)
    v = _vps(f, P, R)
    r = recover_camera([v[0], v[1], None], SZ)
    assert r["case"] == "2pt" and r["ok"]
    assert abs(r["f"] - f) < 1e-6
    assert "이미지 중심" in r["assumption"]
    assert r["direct_scale_axes"] == ["height"]   # 7.7: 2점은 높이만 실척


# ---------------------------------------------------------------- 1점
def _one_point_quad(d, h, width, depth, z0):
    def pr(X, Z):
        return np.array([d * X / Z, d * (-h) / Z])
    return np.array([pr(-width / 2, z0), pr(width / 2, z0),
                     pr(width / 2, z0 + depth), pr(-width / 2, z0 + depth)])


def test_one_point_without_extra_info_leaves_depth_unresolved():
    """5.3: 1점은 자유도 f가 남는다 → 깊이 미결정. **추정하지 않는다**(지시 2.5)."""
    r = recover_camera([np.array([400.0, 300.0]), None, None], SZ)
    assert r["case"] == "1pt" and not r["ok"]
    assert r["f"] is None
    assert any("깊이 미결정" in u for u in r["unresolved"])
    assert r["direct_scale_axes"] == ["width", "height"]   # 7.7: 1점은 폭·높이 실척


def test_one_point_square_assumption_resolves_f_when_gate_passes():
    """f 경로 b: 사다리꼴 정사각 가정(8.8) + 게이트(18.4 하한 + 상한 3W)."""
    d_true = 700.0
    q = _one_point_quad(d_true, h=150.0, width=200.0, depth=200.0, z0=400.0)
    r = recover_camera([np.array([0.0, 0.0]), None, None], SZ, quad=q)
    assert r["case"] == "1pt" and r["ok"]
    assert r["f_source"].startswith("trapezoid")
    assert abs(r["f"] - d_true) / d_true < 1e-6


def test_one_point_square_assumption_rejected_by_gate():
    """게이트가 막으면 채택하지 않고 unresolved로 남긴다 — 임의 추정 금지."""
    # 아주 얕은 도형 → 정사각 가정 시 시거리가 비현실적으로 커진다(상한 위반)
    q = _one_point_quad(700.0, h=150.0, width=900.0, depth=90.0, z0=500.0)
    r = recover_camera([np.array([0.0, 0.0]), None, None], SZ, quad=q)
    assert not r["ok"]
    assert "gate_rejected" in r
    assert any("깊이 미결정" in u for u in r["unresolved"])


def test_one_point_ellipse_takes_priority():
    """f 경로 a: 타원이 있으면 최우선(8.7). 이론서 수치례로 확인."""
    r = recover_camera([np.array([400.0, 300.0]), None, None], SZ,
                       ellipse={"a": 0.25, "b": 0.5, "A": 0.354, "B": 0.125})
    assert r["ok"] and r["f_source"].startswith("ellipse")
    assert abs(r["f"] - 1.0) < 0.005


# ---------------------------------------------------------------- 0점
def test_zero_vps_is_axonometric_limit():
    """2.4: d→∞ 극한. 투시로 깊이를 얻을 수 없다."""
    r = recover_camera([None, None, None], SZ)
    assert r["case"] == "axonometric" and not r["ok"]
    assert r["direct_scale_axes"] == ["width", "height", "depth"]


def test_vps_from_quad_detects_parallel_as_infinite():
    """이미지에서 평행한 변쌍은 무한원 소실점 → None."""
    # 사다리꼴: 위아래 변 평행(무한원), 좌우 변 수렴(유한)
    q = _one_point_quad(600.0, h=140.0, width=240.0, depth=200.0, z0=420.0)
    q = q + np.array([400.0, 300.0])
    vps = vanishing_points_from_quad(q, SZ)
    assert sum(v is not None for v in vps) == 1


# ---------------------------------------------------------------- 7.7 실척
@pytest.mark.parametrize("n,expected", [(3, []), (2, ["height"]), (1, ["width", "height"])])
def test_direct_scale_axes_follow_theory_7_7(n, expected):
    assert direct_scale_axes(n) == expected


# ---------------------------------------------------------------- 9.5~9.6 반복
def test_harmonic_coords_are_arithmetic_for_even_spacing():
    """9.5: 등간격이면 1/(V−uₙ)이 등차."""
    V = 1000.0
    # 실제 투시: 등간격 세계좌표 → 화면좌표 u = V - 1/(α+nβ)
    us = [predict_next(V, 100.0, 300.0, n) for n in range(6)]
    h = harmonic_coords(V, us)
    d1 = np.diff(h)
    assert np.allclose(d1, d1[0], rtol=1e-9)


def test_is_evenly_spaced_accepts_true_and_rejects_perturbed():
    V = 1000.0
    us = [predict_next(V, 100.0, 300.0, n) for n in range(5)]
    assert is_evenly_spaced(V, us)["ok"]
    bad = list(us); bad[2] += 0.25 * (bad[3] - bad[1])       # 한 점만 어긋냄
    assert not is_evenly_spaced(V, bad)["ok"]


def test_predict_next_matches_construction():
    """9.6: 기둥 둘 + 소실점이면 나머지가 결정된다."""
    V = 900.0
    us = [predict_next(V, 50.0, 220.0, n) for n in range(4)]
    assert abs(predict_next(V, us[0], us[1], 3) - us[3]) < 1e-6


def test_detect_repetition_reports_scale_hint():
    V = 1000.0
    us = [predict_next(V, 100.0, 260.0, n) for n in range(5)]
    r = detect_repetition(V, us)
    assert r["found"] and r["count"] == 5
    assert "앵커" in r["hint"]
