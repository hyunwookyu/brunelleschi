"""매스/보이드 구분 (지시 3) — 실내 투시가 매스로 인식되던 결함.

1점투시 실내(한 면이 열린 정육면체, 개구부로 내부를 보는 구도)는 건축의 표준 구도인데
IR에 공간 개념이 없어 솔리드 매스로 인식되면 잘못된 기하가 나온다.
투시 전용 입력(지시 2)과 합치면 지배적 결함이다.
"""
from __future__ import annotations
import numpy as np
import pytest

from ir.schema import IR, Volume, VOLUME_KINDS, ROOT_FIELDS
from stage_perspective.massvoid import (classify_volume, kind_from_label,
                                        interpret_penetrate, unresolved_entry,
                                        contains_polygon)


def _sq(cx, cy, s):
    h = s / 2
    return np.array([[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]], float)


# ---------------------------------------------------------------- 3.1 스키마
def test_kind_is_nested_field_default_mass():
    assert len(ROOT_FIELDS) == 7                       # 루트 불변
    v = Volume(id="v1", footprint=[[0, 0], [1, 0], [1, 1], [0, 1]])
    assert v.kind == "mass"                            # 기존 동작 보존
    assert v.validate() == []


def test_invalid_kind_is_rejected():
    v = Volume(id="v1", footprint=[[0, 0], [1, 0], [1, 1], [0, 1]], kind="void")
    assert any("kind" in e for e in v.validate())
    assert VOLUME_KINDS == ("mass", "room")


# ---------------------------------------------------------------- 3.2 기하 판별
def test_interior_is_room():
    """배면이 개구 안에 작게 들어오면 실내."""
    r = classify_volume(_sq(400, 300, 500), _sq(400, 300, 260))
    assert r["kind"] == "room"
    assert r["evidence"]["far_inside_near"] is True


def test_vanishing_point_inside_back_face_strengthens_room():
    r = classify_volume(_sq(400, 300, 500), _sq(400, 300, 260), vanishing_point=(400, 300))
    assert r["kind"] == "room" and r["evidence"]["vp_inside_far"] is True
    assert "소실점" in r["reason"]


def test_exterior_mass_is_mass():
    """뒷면이 옆으로 어긋나 포함되지 않으면 매스(실루엣이 합집합)."""
    r = classify_volume(_sq(360, 300, 300), _sq(560, 320, 240))
    assert r["kind"] == "mass"
    assert r["evidence"]["far_inside_near"] is False


def test_frontal_near_abstains():
    """면적비가 1에 가까우면 두 해석 모두 가능 → **판정하지 않는다**(§3.7)."""
    r = classify_volume(_sq(400, 300, 400), _sq(400, 300, 392))
    assert r["kind"] is None
    assert "애매" in r["reason"]
    msg = unresolved_entry("v1", r)
    assert msg and "미확정" in msg


def test_abstain_check_comes_before_containment():
    """애매 판정이 포함 판정보다 **먼저**여야 한다 — 면적비 1 부근에서 포함 여부는
    코너 노이즈에 좌우돼 신뢰할 수 없다(실측에서 회피율 0으로 붕괴했던 원인)."""
    near, far = _sq(400, 300, 400), _sq(400, 300, 396)
    assert contains_polygon(near, far) is True          # 포함이지만
    assert classify_volume(near, far)["kind"] is None   # 애매가 이긴다


def test_degenerate_inputs_abstain():
    assert classify_volume([[0, 0], [1, 0]], _sq(0, 0, 1))["kind"] is None
    assert classify_volume(_sq(0, 0, 0), _sq(0, 0, 1))["kind"] is None


# ---------------------------------------------------------------- 3.3 발화 보조
@pytest.mark.parametrize("label,expected", [
    ("hall", "room"), ("로비", "room"), ("침실", "room"),
    ("타워", "mass"), ("building", "mass"),
    ("main hall block", None), ("", None), ("xyz", None),
])
def test_kind_from_label_never_guesses(label, expected):
    """방 이름이면 room, 매스 어휘면 mass. **애매하면 None**(임의 추정 금지)."""
    assert kind_from_label(label) == expected


# ---------------------------------------------------------------- 3.5 관계 해석
def test_penetrate_meaning_depends_on_kind():
    assert interpret_penetrate("mass", "mass") != interpret_penetrate("room", "room")
    assert "공간" in interpret_penetrate("room", "mass")
    assert "연결" in interpret_penetrate("room", "room")


def test_penetrate_not_judged_when_kind_unknown():
    """불명확한 조합은 **판정하지 않는다**."""
    assert interpret_penetrate(None, "mass") is None
    assert interpret_penetrate("mass", None) is None
    assert interpret_penetrate("mass", "void") is None
