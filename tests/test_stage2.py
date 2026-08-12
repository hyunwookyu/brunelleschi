"""Stage 2 (발화 스케일 앵커) 테스트 — 오프라인, §7 2단계 / §3.6 / §3.3~3.4.
python -m pytest tests/test_stage2.py -q
"""
import sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ir.schema import IR, Volume
from common.grammar import parse_ops
from stage2.translate import translate
from stage2.anchor import apply_ops
from stage2.whisper_align import align


# (a) 규칙 번역기가 한국어/영어 발화를 문법-유효 op로 변환하는가 -----------------
def test_rule_translator_produces_grammar_valid_ops():
    ir = IR(volumes=[
        Volume("홀", [[0, 0], [10, 0], [10, 6], [0, 6]]),
        Volume("로비", [[10, 0], [14, 0], [14, 6], [10, 6]]),
    ])
    segments = [
        {"text": "홀 폭이 한 12미터쯤 됩니다", "start": 10.0, "dur": 2.0},       # range width (hedge)
        {"text": "높이는 최소 9미터는 되어야 해요", "start": 15.0, "dur": 2.0},   # min height
        {"text": "홀은 로비 옆에 붙여주세요", "start": 20.0, "dur": 2.0},        # relate adjacent
        {"text": "hall width is about 12 meters", "start": 25.0, "dur": 2.0},   # range width (english, carries last target)
    ]
    ops, errs = translate(ir, segments, verbose=False)
    assert errs == []
    assert len(ops) == 4
    for op in ops:                      # 7-op 문법(§3.6) 통과 확인
        assert op.validate() == []
    kinds = {o.op for o in ops}
    assert {"range", "min", "relate"} <= kinds

    relate_op = next(o for o in ops if o.op == "relate")
    assert {relate_op.args["a"], relate_op.args["b"]} == {"홀", "로비"}
    assert relate_op.args["type"] == "adjacent"

    range_op = next(o for o in ops if o.op == "range")
    assert range_op.args["id"] == "홀" and range_op.args["prop"] == "width"
    assert range_op.args["min"] == 10.8 and range_op.args["max"] == 13.2   # ±10% of 12


# (b) range 앵커 적용 → stage1 L 픽스처의 footprint가 절대 스케일로 확정되는가 ----
def test_range_anchor_scales_footprint_to_width_12():
    ir = IR.from_dict(json.loads((ROOT / "stage1" / "out_ir_L.json").read_text(encoding="utf-8")))
    assert ir.volumes[0].height is None                       # 적용 전: 무차원(§3.5)

    ops, errs = parse_ops([{"op": "range", "id": "v1", "prop": "width", "min": 10.8, "max": 13.2}])
    assert errs == []
    ir = apply_ops(ir, ops)

    assert ir.validate() == []
    assert ir.root_field_count() == 7                          # §13 필드 수 불변
    xs = [p[0] for p in ir.volumes[0].footprint]
    width = max(xs) - min(xs)
    assert abs(width - 12.0) <= 1.2                             # tol = (13.2-10.8)/2
    assert ir.anchors and ir.anchors[0].target == "v1" and ir.anchors[0].prop == "width"


# (c) retract가 해당 target의 anchor를 제거하는가 -------------------------------
def test_retract_removes_anchor():
    ir = IR(volumes=[Volume("hall", [[0, 0], [10, 0], [10, 6], [0, 6]])])
    ops, errs = parse_ops([{"op": "set", "id": "hall", "prop": "width", "value": 12.0}])
    assert errs == []
    ir = apply_ops(ir, ops)
    assert any(a.target == "hall" and a.prop == "width" for a in ir.anchors)

    ops2, errs2 = parse_ops([{"op": "retract", "target": "hall"}])
    assert errs2 == []
    ir = apply_ops(ir, ops2)
    assert not any(a.target == "hall" for a in ir.anchors)


# (d) 시간 정렬이 ±window 안의 획만 고르는가 (§3.6 ±3초) -------------------------
def test_time_alignment_picks_strokes_within_window():
    segments = [{"text": "홀 폭이 한 12미터쯤", "start": 100.0, "dur": 2.0}]
    strokes = [
        {"id": "s_before", "t": 90.0},     # < 97 → 밖
        {"id": "s_in_1", "t": 98.0},       # [97,105] 안
        {"id": "s_in_2", "t": 104.5},      # 안
        {"id": "s_after", "t": 110.0},     # > 105 → 밖
    ]
    aligned = align(segments, strokes, window=3.0)
    assert aligned[0]["strokes"] == ["s_in_1", "s_in_2"]

    # points 기반 스트로크(§4.1 포맷)도 동일하게 동작해야 함 — 점 하나라도 창 안이면 채택
    stroke_pts = [{"id": "sp_in", "points": [[0, 0, 90.0, 0.5], [1, 1, 100.0, 0.5]]},   # 100.0 in window
                  {"id": "sp_out", "points": [[0, 0, 80.0, 0.5], [1, 1, 85.0, 0.5]]}]   # both outside
    aligned2 = align(segments, stroke_pts, window=3.0)
    assert aligned2[0]["strokes"] == ["sp_in"]
