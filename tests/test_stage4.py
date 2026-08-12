"""4단계 회귀 테스트 — 다중화·명명 (§7 4단계)."""
import sys, importlib.util
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage4.multiplex import multiplex
from stage4.naming import extract_naming, assign_names

_mm = importlib.util.spec_from_file_location("mm", ROOT / "stage4" / "make_multi.py")
mm = importlib.util.module_from_spec(_mm); _mm.loader.exec_module(mm)


def test_multiplex_separates_three_volumes():
    cap = mm.make(seed=0)
    ir, metas = multiplex(cap)
    assert len(ir.volumes) == cap["_n_volumes"] == 3
    assert [v.id for v in ir.volumes] == ["v1", "v2", "v3"]
    assert ir.validate() == []
    assert ir.root_field_count() == 6          # 다중화가 루트 필드 안 늘림(§13)


def test_naming_binds_by_position():
    cap = mm.make(seed=1)
    ir, _ = multiplex(cap)
    hints = extract_naming(cap["_naming_utterances"], cap["_stroke_ctx"])
    assign_names(ir, hints)
    labels = {v.label for v in ir.volumes}
    assert labels == {"hall", "lobby", "stair"}
    assert all(v.label for v in ir.volumes)    # 전부 명명됨


def test_unnamed_volume_goes_unresolved():
    cap = mm.make(seed=2)
    ir, _ = multiplex(cap)
    assign_names(ir, [{"label": "hall", "pos": None, "raw": "홀"}])  # 1개만 명명
    named = sum(1 for v in ir.volumes if v.label)
    assert named == 1
    assert any("명명 미정" in u for u in ir.unresolved)


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
