"""지표 둔감성 전수 점검 (지시 B-2) — §13 규칙 3의 기존 지표 소급 적용.

두 번 같은 유형의 결함이 나왔다.
  1. `plane_iou`가 종횡비 오차에 둔감 (1-ter A: IoU 0.85가 오차 10~20%를 숨김)
  2. `branch_impact`가 부피 서명만 보아 90° 축 뒤바뀜을 영향도 0으로 놓침 (1-ter B)

둘 다 "**지표는 높은데 결과는 틀린 케이스**"였다. 여기서는 각 지표에 대해 그런 케이스를
**의도적으로 만들어** 지표가 통과시키는지 본다. 통과하면 둔감성이 실재하며, 지표를
교체하거나 보조 지표를 병기해야 한다(지시 B-2 c).

각 테스트의 목적은 '무엇을 놓치는가'를 문서로 고정하는 것이다 —
놓치는 것이 확인된 지표는 **단독 판정 금지**이며 병기 지표를 명시한다.
"""
from __future__ import annotations
import numpy as np
import pytest

from ir.schema import IR, Volume, Relation
from stage6.query import output_signature, shape_signature
from stage_perspective.metric_audit import polygon_aspect, aspect_rel_err
from stage_perspective.uncertainty import aspect_equiv


def _rect(w: float, h: float, x0: float = 0.0, y0: float = 0.0):
    return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]


def _area(P) -> float:
    A = np.asarray(P, float)
    x, y = A[:, 0], A[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


# ---------------------------------------------------------------- 1. 부피 서명 (기지 결함, 회귀 잠금)
def test_volume_signature_blind_to_axis_swap():
    """이미 고친 결함의 회귀 잠금 — 부피 서명은 90° 뒤바뀜에 불변이다."""
    a = IR(volumes=[Volume(id="v1", footprint=_rect(12, 4), height=3.0)])
    b = IR(volumes=[Volume(id="v1", footprint=_rect(4, 12), height=3.0)])
    assert output_signature(a) == pytest.approx(output_signature(b))       # 놓친다
    assert shape_signature(a) != pytest.approx(shape_signature(b))         # 병기 지표가 잡는다


# ---------------------------------------------------------------- 2. 부피 서명 — 형태 왜곡
def test_volume_signature_blind_to_shape_distortion_at_equal_area():
    """면적이 같으면 형태가 아무리 달라도 부피 서명이 같다.
    → 부피 서명 단독으로 '복원 품질'을 말할 수 없다."""
    square = IR(volumes=[Volume(id="v1", footprint=_rect(10, 10), height=2.0)])
    sliver = IR(volumes=[Volume(id="v1", footprint=_rect(100, 1), height=2.0)])
    assert output_signature(square) == pytest.approx(output_signature(sliver))
    assert shape_signature(square) != pytest.approx(shape_signature(sliver))


# ---------------------------------------------------------------- 3. polygon_aspect — 내부 형태
def test_polygon_aspect_blind_to_internal_shape():
    """종횡비(외곽 비례)는 내부 형태를 보지 않는다.
    2H에서 L자가 '종횡비는 맞는데 IoU는 낮은' 이유가 이것이다(1-ter A).
    → 종횡비와 IoU를 **병기**해야 한다. 어느 하나로는 판정할 수 없다.

    주의: `polygon_aspect`는 PCA 정렬 bbox라 **비대칭** 노치(L자)는 주축이 돌아가 잡힌다.
    맹점을 드러내려면 주축을 보존하는 **대칭** 노치를 써야 한다(H자)."""
    box = np.array(_rect(10, 6), float)
    H = np.array([[0, 0], [3, 0], [3, 2], [7, 2], [7, 0], [10, 0],
                  [10, 6], [7, 6], [7, 4], [3, 4], [3, 6], [0, 6]], float)   # 대칭, 같은 bbox
    assert polygon_aspect(box) == pytest.approx(polygon_aspect(H), abs=1e-9)     # 놓친다
    # 면적은 크게 다르다 — 종횡비만으로는 이 차이를 볼 수 없다
    assert abs(_area(box) - _area(H)) / _area(box) > 0.2


# ---------------------------------------------------------------- 4. aspect_rel_err — 절대 크기
def test_aspect_error_blind_to_absolute_scale():
    """종횡비는 스케일 불변이라 **절대 치수가 100배 틀려도 0**이다.
    → 앵커 검증에는 종횡비 대신 치수 오차(anchor_dim_error)를 써야 한다."""
    assert aspect_rel_err(2.0, 2.0) == pytest.approx(0.0)
    small = polygon_aspect(np.array(_rect(2, 1), float))
    huge = polygon_aspect(np.array(_rect(200, 100), float))
    assert aspect_rel_err(small, huge) == pytest.approx(0.0)     # 100배 차이를 놓친다


# ---------------------------------------------------------------- 5. aspect_equiv — 축 라벨
def test_aspect_equiv_blind_to_axis_label_by_design():
    """역수 동치는 **의도적으로** 축 라벨을 무시한다(1-bis 성질 1).
    구간 커버리지 계산에는 옳지만, 사용자에게 보이는 형태 판정에는 쓰면 안 된다
    — 뒤바뀜은 실제 형태 오류이기 때문이다(IoU 0.53). 용도 분리를 잠근다."""
    assert aspect_equiv(0.25) == pytest.approx(aspect_equiv(4.0))
    assert aspect_rel_err(0.25, 4.0) == pytest.approx(0.0)       # 뒤바뀜을 오차로 세지 않는다


# ---------------------------------------------------------------- 6. relations 유효율
def test_relations_validity_rate_blind_to_wrongness():
    """`relations.all_ir_valid_rate`는 스키마 유효성만 본다 — **틀린 관계도 유효하다**.
    → 유효율 1.0은 '관계가 맞다'는 뜻이 아니다."""
    ir = IR(volumes=[Volume(id="v1", footprint=_rect(10, 10)),
                     Volume(id="v2", footprint=_rect(10, 10, 500, 500))],
            relations=[Relation(a="v1", b="v2", type="adjacent", src="geometry")])
    assert ir.validate() == []          # 멀리 떨어진 둘을 adjacent라 해도 스키마는 통과


# ---------------------------------------------------------------- 7. 명명 결합률
def test_named_rate_blind_to_wrong_assignment():
    """`multiplex.all_named_rate`는 **라벨이 붙었는지**만 센다. 잘못 붙어도 1.0이다
    (M1에서 자기참조로 이미 지적됨). → 결합 정확도와 구분해야 한다."""
    ir = IR(volumes=[Volume(id="v1", footprint=_rect(10, 10), label="lobby"),
                     Volume(id="v2", footprint=_rect(10, 10, 50, 0), label="hall")])
    named = sum(1 for v in ir.volumes if v.label)
    assert named / len(ir.volumes) == 1.0      # 서로 바꿔 붙여도 1.0


# ---------------------------------------------------------------- 8. confidence
def test_confidence_blind_to_being_wrong_shape():
    """confidence는 **입력 획에 대한 적합도**(둘레지지율²·적합도)이지 정답 대비 정확도가 아니다.
    엉뚱한 형태를 정확히 그려도 confidence는 높다. → 정확도 지표로 쓰면 안 된다."""
    v = Volume(id="v1", footprint=_rect(10, 10), confidence=0.95)
    assert v.validate() == []
    assert v.confidence > 0.9      # 이 값은 '의도한 형태인가'를 말하지 않는다
