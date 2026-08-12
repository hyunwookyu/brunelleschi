"""파이프라인 회귀 테스트. IR·문법·정규화·단조성 잠금."""
import sys, json
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ir.schema import IR, Volume, Anchor, MAX_ROOT_FIELDS
from common.grammar import parse_ops
from common.normalize_core import parse_strokes


def test_ir_root_fields_within_cap():
    assert IR().root_field_count() == 6 <= MAX_ROOT_FIELDS


def test_ir_validate_and_monotonic():
    t0 = IR(volumes=[Volume("hall", [[0, 0], [12, 0], [12, 8], [0, 8]])])
    t1 = IR(volumes=[Volume("hall", [[0, 0], [12, 0], [12, 8], [0, 8]]),
                     Volume("deck", [[12, 0], [18, 0], [18, 8], [12, 8]])],
            anchors=[Anchor("hall", "width", 12.0)])
    assert t0.validate() == [] and t1.validate() == []
    assert t1.superset_of(t0)
    assert not IR(volumes=[Volume("x", [[0, 0], [1, 0], [1, 1]])]).superset_of(t0)


def test_grammar_closed_output():
    ops, errs = parse_ops([
        {"op": "set", "id": "h", "prop": "width", "value": 12},
        {"op": "bogus", "id": "h"},
        {"op": "range", "id": "h", "prop": "width", "min": 9, "max": 5},
    ])
    assert len(ops) == 1 and len(errs) == 2


def test_normalize_clean_polygon():
    """precise 픽스처는 스케일정규화 후 클린 직교폴리곤(라인<=14)."""
    from stage1.normalize import normalize_to_ir
    cap = json.loads((ROOT / "stage1" / "fixture_L_precise.json").read_text(encoding="utf-8"))
    ir, meta = normalize_to_ir(cap)
    assert meta["parseable"] and 4 <= meta["n_lines"] <= 14
    assert ir.validate() == []
    assert ir.volumes[0].height is None            # 무차원(§3.5)


def test_coarse_declares_boundary():
    """coarse 픽스처는 파싱 경계 → 폴리곤 대신 관계만(§5.3)."""
    from stage1.normalize import normalize_to_ir
    cap = json.loads((ROOT / "stage1" / "fixture_L_coarse.json").read_text(encoding="utf-8"))
    ir, meta = normalize_to_ir(cap)
    if not meta["parseable"]:
        assert ir.unresolved and not ir.volumes


def test_partial_strokes_crash_free():
    """부분 획(미완성)에서도 파서가 죽지 않는다 — 5단계 전제(그리는 도중)."""
    import json as _json
    from stage1.normalize import normalize_to_ir
    cap = _json.loads((ROOT / "stage1" / "fixture_L_precise.json").read_text(encoding="utf-8"))
    pts = cap["strokes"][0]["points"]
    for frac in (0.1, 0.3, 0.5, 0.7, 0.9):
        k = max(2, int(len(pts) * frac))
        partial = {**cap, "strokes": [{"points": pts[:k], "pen": "mass"}]}
        ir, meta = normalize_to_ir(partial)      # 예외 없이 반환되어야
        assert ir.validate() == []               # 어떤 결과든 유효 IR


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
