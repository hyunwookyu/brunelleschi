"""6단계 질의 루프 회귀 테스트 (§7 6단계, §1). 분기 영향도는 결정론적."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Volume, Anchor, Opening
from stage6.query import plan_queries, branch_impact, candidates, output_signature


def _sq(x, y, s=100):
    return [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]


def test_scale_is_highest_impact_when_unanchored():
    """앵커 없으면 스케일(절대치수) 질의가 최고 영향도 — §3.3."""
    ir = IR(volumes=[Volume("v1", _sq(0, 0), confidence=0.9),
                     Volume("v2", _sq(300, 0), confidence=0.9)])
    plan = plan_queries(ir)
    assert plan["queries"][0]["kind"] == "scale"
    assert plan["queries"][0]["ask"] is True


def test_anchored_has_no_scale_query():
    ir = IR(volumes=[Volume("v1", _sq(0, 0), confidence=0.9)],
            anchors=[Anchor("v1", "width", 12.0)])
    kinds = {q["kind"] for q in plan_queries(ir)["queries"]}
    assert "scale" not in kinds


def test_opening_pos_low_impact_quietly_filled():
    """개구부 위치는 매싱을 안 바꿈 → 영향도 0 → 조용히 채움(§3.7)."""
    ir = IR(volumes=[Volume("v1", _sq(0, 0), confidence=0.9)],
            anchors=[Anchor("v1", "width", 12.0)],
            openings=[Opening("v1", "window")])
    plan = plan_queries(ir)
    pos = [q for q in plan["queries"] if q["kind"] == "opening_pos"][0]
    assert pos["impact"] == 0.0 and pos["ask"] is False


def test_branch_impact_deterministic():
    ir = IR(volumes=[Volume("v1", _sq(0, 0), confidence=0.9)])
    it = candidates(ir)[0]
    assert branch_impact(ir, it) == branch_impact(ir, it)   # 결정론적


def test_threshold_gates_asking():
    ir = IR(volumes=[Volume("v1", _sq(0, 0), confidence=0.9)])
    lo = plan_queries(ir, threshold=0.01)["n_to_ask"]
    hi = plan_queries(ir, threshold=99)["n_to_ask"]
    assert hi == 0 and lo >= 1


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
