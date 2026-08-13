"""축 라벨 모호 (지시 1-ter B) — 기하가 정하지 못하는 것을 추정하지 않는지 잠근다.

근거: 투시 복원은 종횡비를 역수까지만 정한다(8way 대응 탐색이 두 해를 동점으로 본다).
실측 뒤바뀜 28.75%, 그 경우 평면 IoU 0.527(정상 0.838) — 라벨만이 아니라 세계 좌표에서
90° 회전한 형태가 나오므로 2F 최대 식별 오차원이다.
"""
from __future__ import annotations
import numpy as np

from ir.schema import IR, Volume, ROOT_FIELDS
from stage2.anchor import apply_ops
from common.grammar import Op
from stage_perspective.uncertainty import axis_unresolved_entry, swap_axes
from stage6.query import candidates, branch_impact, shape_signature, output_signature

AXIS = {"ambiguous": True, "aspect": 1.333, "aspect_alt": 0.75, "perm": [0, 1, 2, 3]}
FP = [[0, 0], [40, 0], [40, 30], [0, 30]]


def test_volume_axis_is_nested_field_root_unchanged():
    """Volume.axis는 중첩 필드 — 루트 키 수 불변(§13)."""
    assert len(ROOT_FIELDS) == 7
    v = Volume(id="v1", footprint=FP)
    assert v.axis is None                       # 기본값(기존 동작 보존)


def test_recovery_reports_both_solutions():
    """복원이 고른 해와 대안(역수)을 함께 기록해야 한다 — 어느 것을 택했는지 IR에 남긴다."""
    from stage_perspective.decompose import _project_polygon
    from stage_perspective.priors import rect, recover_plane_rightangle
    truth = rect(1.8) * 5.0
    c = truth.mean(0)
    diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
    eye = (c[0] + diag * 1.6, c[1] + diag * 1.2, diag * 1.1)
    img = _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), (800.0, 600.0))
    r = recover_plane_rightangle(img, (800.0, 600.0))
    assert r["ok"]
    ax = r["axis"]
    assert ax["ambiguous"] is True
    assert ax["aspect"] > 0 and ax["aspect_alt"] > 0
    assert abs(ax["aspect"] * ax["aspect_alt"] - 1.0) < 1e-6      # 서로 역수


def test_unresolved_entry_only_when_ambiguous():
    assert axis_unresolved_entry("v1", None) is None
    assert axis_unresolved_entry("v1", {"ambiguous": False}) is None
    msg = axis_unresolved_entry("v1", AXIS, "hall")
    assert msg and "hall" in msg and "1.33" in msg and "0.75" in msg


def test_swap_axes_is_involution():
    assert swap_axes(swap_axes(FP)) == [[float(x), float(y)] for x, y in FP]


def test_anchor_records_axis_ambiguity_without_guessing():
    """축이 모호한 볼륨에 폭 앵커가 오면 적용하되 **미확정임을 기록**해야 한다."""
    ir = IR(volumes=[Volume(id="v1", footprint=FP, axis=dict(AXIS))])
    apply_ops(ir, [Op(op="set", args={"id": "v1", "prop": "width", "value": 12.0})])
    xs = [p[0] for p in ir.volumes[0].footprint]
    assert abs((max(xs) - min(xs)) - 12.0) < 1e-6      # 적용은 된다
    assert any("축 라벨 미확정" in u for u in ir.unresolved)
    assert any("확인 필요" in n.text for n in ir.notes)


def test_anchor_silent_when_axis_unambiguous():
    """축 모호가 없으면 잡음을 만들지 않는다(기존 동작 보존)."""
    ir = IR(volumes=[Volume(id="v1", footprint=FP)])
    apply_ops(ir, [Op(op="set", args={"id": "v1", "prop": "width", "value": 12.0})])
    assert ir.unresolved == [] and ir.notes == []


def test_height_anchor_has_no_axis_ambiguity():
    """높이는 화면 수직이라 축 모호가 없다(이론서 7.7) → 기록하지 않는다."""
    ir = IR(volumes=[Volume(id="v1", footprint=FP, axis=dict(AXIS))])
    apply_ops(ir, [Op(op="set", args={"id": "v1", "prop": "height", "value": 9.0})])
    assert not any("축 라벨 미확정" in u for u in ir.unresolved)


def test_axis_becomes_query_item_with_high_impact():
    """§6 질의: 축 라벨이 후보로 오르고 영향도가 유의해야 한다."""
    ir = IR(volumes=[Volume(id="v1", footprint=[[0, 0], [12, 0], [12, 4], [0, 4]],
                            height=3.0, axis=dict(AXIS))],
            anchors=[])
    items = candidates(ir)
    axis_items = [i for i in items if i["kind"] == "axis"]
    assert len(axis_items) == 1
    assert branch_impact(ir, axis_items[0]) > 0.5


def test_volume_signature_alone_is_blind_to_axis_swap():
    """왜 형태 서명이 필요한가 — 부피 서명은 90° 뒤바뀜에 불변이다(맹점).
    이 성질이 유지되는 한 형태 서명을 빼면 축 질의 영향도가 0이 된다."""
    ir = IR(volumes=[Volume(id="v1", footprint=[[0, 0], [12, 0], [12, 4], [0, 4]], height=3.0)])
    swapped = IR(volumes=[Volume(id="v1", footprint=swap_axes(ir.volumes[0].footprint), height=3.0)])
    assert abs(output_signature(ir) - output_signature(swapped)) < 1e-9    # 부피 불변
    assert abs(shape_signature(ir) - shape_signature(swapped)) > 1e-6      # 형태는 변한다
