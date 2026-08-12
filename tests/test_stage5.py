"""5단계 관계 추론 회귀 테스트 (§7 5단계)."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Volume, RELATION_TYPES
from common.grammar import Op
from stage5.relate import infer_relations, infer_geometric, relations_from_ops


def _sq(x, y, s=10):
    return [[x, y], [x + s, y], [x + s, y + s], [x, y + s]]


def test_adjacent_and_separated():
    ir = IR(volumes=[Volume("v1", _sq(0, 0, 100), confidence=0.9),
                     Volume("v2", _sq(101, 0, 100), confidence=0.9),   # 바로 옆(gap 1)
                     Volume("v3", _sq(500, 0, 100), confidence=0.9)])  # 멀리
    infer_relations(ir)
    pairs = {(r.a, r.b, r.type) for r in ir.relations}
    assert ("v1", "v2", "adjacent") in pairs
    assert any(t == "separated" and {a, b} == {"v1", "v3"} for a, b, t in pairs)
    assert ir.validate() == []


def test_penetrate_on_overlap():
    ir = IR(volumes=[Volume("v1", _sq(0, 0, 100), confidence=0.9),
                     Volume("v2", _sq(50, 50, 100), confidence=0.9)])  # 겹침
    rels = infer_geometric(ir)
    assert any(r.type == "penetrate" for r in rels)


def test_confidence_guard_excludes_partial():
    """부분 획 방어: 저confidence 볼륨엔 관계 안 걸림(§task1)."""
    ir = IR(volumes=[Volume("v1", _sq(0, 0, 100), confidence=0.9),
                     Volume("v2", _sq(101, 0, 100), confidence=0.2)])  # 미확정
    assert infer_geometric(ir) == []


def test_utterance_relation_mapped_to_canon():
    ir = IR(volumes=[Volume("v1", _sq(0, 0), confidence=0.9),
                     Volume("v2", _sq(500, 0), confidence=0.9)])
    ops = [Op("relate", {"a": "v1", "b": "v2", "type": "inside"})]   # inside→penetrate
    rels = relations_from_ops(ir, ops)
    assert rels and rels[0].type == "penetrate" and rels[0].src == "utterance"


def test_relation_types_are_five():
    assert len(RELATION_TYPES) == 5
    assert set(RELATION_TYPES) == {"adjacent", "above_below", "penetrate", "separated", "aligned"}


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
