"""보존 자산의 회귀 테스트 (리뷰어 지적 [3]).

W-A a에서 "Python 26/26 통과"라고 적었으나, 그 26건은 `test_viewdist`(10)와
`test_camera_unified`(16)였다. 보존하기로 한 `repetition.py`(9.5/9.6),
`noise.py`(stable_seed — V-H 재현성 규칙의 구현), 신설 `project.py`는
**테스트가 하나도 없었다**. 통과 수치가 실제 검증 범위보다 넓게 읽혔다.
"""
from __future__ import annotations
import numpy as np
import pytest

from stage_perspective.repetition import harmonic_coords, is_evenly_spaced, predict_next
from stage_perspective.noise import stable_seed, grade_ratios
from stage_perspective.project import rect, project_polygon


# ------------------------------------------------------------------ 9.5/9.6 등간격 반복

def test_harmonic_coords_are_arithmetic_for_even_spacing():
    """이론서 9.5: 등간격이면 1/(V−uₙ)이 **등차수열**이다."""
    V, a, b = 100.0, 0.02, 0.01           # uₙ = V − 1/(a + n·b)
    us = [V - 1.0 / (a + n * b) for n in range(6)]
    h = harmonic_coords(V, us)
    d = np.diff(h)
    assert np.allclose(d, d[0], rtol=1e-9)

def test_uneven_spacing_is_rejected():
    """반례 — 지표가 자명하지 않은지 확인(§13 규칙 3). 흐트러뜨리면 등간격 판정이 꺼져야 한다."""
    V, a, b = 100.0, 0.02, 0.01
    us = [V - 1.0 / (a + n * b) for n in range(5)]
    assert is_evenly_spaced(V, us)["ok"]
    us[2] += 6.0
    assert not is_evenly_spaced(V, us)["ok"]

def test_predict_next_recovers_the_series():
    V, a, b = 100.0, 0.02, 0.01
    us = [V - 1.0 / (a + n * b) for n in range(4)]
    assert predict_next(V, us[0], us[1], 3) == pytest.approx(us[3], rel=1e-6)


# ------------------------------------------------------------------ V-H 재현성

def test_stable_seed_is_stable_across_processes():
    """`hash(str)`는 PYTHONHASHSEED 무작위화로 실행마다 달랐다(2F IoU 0.877↔0.885 표류).
    `stable_seed`는 crc32라 프로세스가 달라도 같은 값이어야 한다 — 값 자체를 박아 둔다."""
    v = stable_seed("axis_gauge", "medium", base=0)
    assert v == stable_seed("axis_gauge", "medium", base=0)
    assert isinstance(v, int) and v >= 0
    assert stable_seed("a", "b", base=0) != stable_seed("b", "a", base=0)
    import subprocess, sys
    out = subprocess.run(
        [sys.executable, "-c",
         "from stage_perspective.noise import stable_seed;print(stable_seed('axis_gauge','medium',base=0))"],
        capture_output=True, text=True, cwd=str(__import__("pathlib").Path(__file__).resolve().parent.parent))
    assert out.stdout.strip() == str(v), out.stderr

def test_grade_ratios_are_relative_not_absolute_pixels():
    """실측 코너오차는 **대각 대비 비율**이다(V-s: 절대 픽셀 {2,8,20}은 폐기)."""
    r = grade_ratios()
    assert set(("precise", "medium", "coarse")) <= set(r)
    assert 0 < r["precise"] < r["medium"] < r["coarse"] < 0.2


# ------------------------------------------------------------------ 합성 투영

def test_rect_has_requested_aspect():
    R = rect(2.0)
    assert np.ptp(R[:, 0]) / np.ptp(R[:, 1]) == pytest.approx(2.0)

def test_projection_preserves_collinearity_and_cross_ratio():
    """투영은 사영변환이므로 **공선성**과 **복비**를 보존한다. 이것이 W-1 작도의 근거다."""
    world = np.array([[0, 0], [1, 0], [3, 0], [6, 0]], float)   # 한 직선 위 네 점
    img = project_polygon(world, (2.0, -5.0, 3.0), (2.0, 0.0, 0.0), (800.0, 600.0))
    a, b, c, d = img
    # 공선성: 삼각형 면적 ≈ 0
    for p, q, s in ((a, b, c), (b, c, d)):
        cr2 = (q - p)[0] * (s - p)[1] - (q - p)[1] * (s - p)[0]
        assert abs(cr2) < 1e-6 * np.hypot(*(s - p)) ** 2 + 1e-6
    def cr(P):
        p1, p2, p3, p4 = [np.hypot(*(x - P[0])) for x in P], None, None, None
        return (p1[2] - p1[0]) / (p1[2] - p1[1]) * (p1[3] - p1[1]) / (p1[3] - p1[0])
    assert cr(img) == pytest.approx(cr(world), rel=1e-6)
