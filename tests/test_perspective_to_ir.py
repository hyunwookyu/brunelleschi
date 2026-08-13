"""투시 → IR (지시 2.1/2.5) — 평면이 입력이 아니라 파생 출력임을 잠근다."""
from __future__ import annotations
import numpy as np

from ir.schema import IR, ROOT_FIELDS
from stage_perspective.decompose import _project_polygon
from stage_perspective.priors import rect
from stage_perspective.to_ir import build_ir, floor_quad_to_volume

SZ = (800.0, 600.0)


def _persp(aspect: float, el_mul: float = 1.1):
    truth = rect(aspect) * 5.0
    c = truth.mean(0)
    diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
    eye = (c[0] + diag * 1.6, c[1] + diag * 1.2, diag * el_mul)
    return _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), SZ), truth


def test_plane_is_derived_not_input():
    """투시 사각형만 주면 평면(footprint)이 나온다 — 평면 입력 없음."""
    img, _truth = _persp(1.6)
    ir = build_ir([img], SZ, mc_samples=40)
    assert len(ir.volumes) == 1
    assert len(ir.volumes[0].footprint) == 4
    assert ir.validate() == []
    assert len(ROOT_FIELDS) == 7                      # 루트 불변


def test_height_stays_dimensionless_without_anchor():
    """§3.5: 앵커 없으면 무차원. 임의 추정 금지."""
    img, _ = _persp(1.6)
    ir = build_ir([img], SZ, mc_samples=40)
    assert ir.volumes[0].height is None
    assert ir.volumes[0].height_src == "unset"


def test_unresolved_records_aspect_and_axis():
    """2.5: 부족 자유도는 unresolved로. 종횡비 구간(1-bis)과 축 라벨(1-ter B) 둘 다."""
    img, _ = _persp(1.6)
    ir = build_ir([img], SZ, mc_samples=60)
    text = " ".join(ir.unresolved)
    assert "종횡비" in text
    assert "축 라벨" in text


def test_view_records_camera_case_and_direct_scale_axes():
    """2.2/2.3: 어떤 경우(1/2/3점)였고 어느 축이 실척 직접인지 IR에 남는다."""
    img, _ = _persp(1.6)
    ir = build_ir([img], SZ, mc_samples=40)
    cam = ir.views[0].camera
    assert cam["case"] in ("1pt", "2pt", "3pt", "axonometric")
    if cam["case"] == "2pt":
        assert cam["direct_scale_axes"] == ["height"]      # 이론서 7.7
        assert "이미지 중심" in (cam.get("assumption") or "")


def test_axis_ambiguity_recorded_on_volume():
    """1-ter B: 두 해를 함께 기록하고 추정하지 않는다."""
    img, _ = _persp(1.6)
    r = floor_quad_to_volume(img, SZ, mc_samples=40)
    ax = r["volume"].axis
    assert ax["ambiguous"] is True
    assert abs(ax["aspect"] * ax["aspect_alt"] - 1.0) < 1e-6


def test_multiple_quads_become_multiple_volumes():
    imgs = [_persp(1.4)[0], _persp(2.2)[0] + np.array([120.0, 40.0])]
    ir = build_ir(imgs, SZ, mc_samples=30)
    assert len(ir.volumes) == 2
    assert [v.id for v in ir.volumes] == ["v1", "v2"]
