"""2점 종횡비 불확실성 전파 (지시 1-bis) — 구간이 의미를 갖는지 잠근다."""
from __future__ import annotations
import numpy as np
import pytest

from stage_perspective.decompose import _project_polygon
from stage_perspective.priors import rect
from stage_perspective.uncertainty import (propagate_aspect, unresolved_entry,
                                          aspect_equiv, interval_contains_aspect)

SZ = (800.0, 600.0)


def _view(aspect: float, el_deg: float = 40.0, az: float = 0.7, dist_mul: float = 1.8):
    truth = rect(aspect) * 5.0
    c = truth.mean(0)
    diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
    el = np.radians(el_deg)
    dist = diag * dist_mul
    eye = (c[0] + dist * np.cos(az) * np.cos(el),
           c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.2)
    return _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), SZ)


def test_interval_contains_point_estimate():
    img = _view(1.5)
    r = propagate_aspect(img, SZ, grade="medium", n_samples=80, seed=1)
    assert r["ok"]
    assert r["lo"] <= r["median_of_samples"] <= r["hi"]
    assert r["rel_width"] >= 0


def test_interval_widens_with_grade_noise():
    """입력 불확실성이 크면 출력 구간도 넓어져야 한다 — 전파가 실제로 일어나는지."""
    img = _view(1.5)
    fine = propagate_aspect(img, SZ, grade="precise", n_samples=150, seed=2)
    rough = propagate_aspect(img, SZ, grade="coarse", n_samples=150, seed=2)
    assert fine["ok"] and rough["ok"]
    assert rough["rel_width"] > fine["rel_width"]


def test_aspect_is_determined_only_up_to_reciprocal():
    """성질 1: 어느 변이 width/depth인지는 대응 라벨링이라 역수까지만 결정된다.
    참 0.6인 도형이 1/0.6=1.667로 복원된다 — 결함이 아니라 이 방법의 성질."""
    r = propagate_aspect(_view(0.6, el_deg=40.0), SZ, grade="medium", n_samples=150, seed=3)
    assert r["ok"]
    assert abs(r["aspect"] - 1 / 0.6) < 0.05          # 역수로 나옴
    assert not (r["lo"] <= 0.6 <= r["hi"])            # 원래 값은 구간 밖
    assert interval_contains_aspect(r, 0.6)           # 역수 동치로는 담긴다
    assert abs(aspect_equiv(0.6) - aspect_equiv(1 / 0.6)) < 1e-9


def test_interval_covers_true_aspect_in_benign_view():
    """퇴화가 없는 구도에서는 참 종횡비가 90% 구간 안에 있어야 한다(역수 동치 인정)."""
    for a in (0.6, 1.0, 2.0):
        r = propagate_aspect(_view(a, el_deg=40.0), SZ, grade="medium", n_samples=200, seed=3)
        assert r["ok"]
        assert interval_contains_aspect(r, a), f"aspect {a} not in [{r['lo']}, {r['hi']}]"


def test_interval_width_is_monotone_in_elevation():
    """성질 2: 지면 도형을 낮게 볼수록(edge-on) 종횡비 구속이 약해진다 → 구간이 넓어진다.
    전파가 실제 기하 조건수를 반영하는지 확인한다(내 최초 가정과 방향이 반대였다)."""
    widths = []
    for el in (12.0, 40.0, 82.0):
        r = propagate_aspect(_view(1.5, el_deg=el), SZ, grade="medium", n_samples=150, seed=4)
        assert r["ok"]
        widths.append(r["rel_width"])
    assert widths[0] > widths[1] > widths[2]          # 저각일수록 넓다


def test_unresolved_entry_emitted_only_when_wide():
    img = _view(1.5)
    narrow = propagate_aspect(img, SZ, grade="precise", n_samples=120, seed=5)
    if not narrow["unresolved"]:
        assert unresolved_entry("v1", narrow) is None
    wide = dict(narrow, unresolved=True, ok=True, lo=0.5, hi=3.0, rel_width=1.6)
    msg = unresolved_entry("v1", wide)
    assert msg is not None and "v1" in msg and "종횡비" in msg
