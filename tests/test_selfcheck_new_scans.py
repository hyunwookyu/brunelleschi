# PITFALLS #33·#35를 옮긴 자동 검사에 **반례를 건다**(2026-08-16).
#
# #32가 "미실행을 반증으로 처리하지 말 것"이므로, 플래그 0건이 **깨끗함**인지
# **안 돎**인지 여기서 가른다 — 걸려야 하는 입력을 넣어 실제로 걸리는지 본다.
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import selfcheck  # noqa: E402


def test_sweep_coverage_fires_when_extension_missing(tmp_path):
    """선언 밖 확장자에 같은 패턴이 있으면 **걸려야 한다**(#33이 실제로 그랬다)."""
    (tmp_path / "a.md").write_text("보고서.json@1671e540", encoding="utf-8")
    (tmp_path / "b.ts").write_text("// 보고서.json@1671e540", encoding="utf-8")
    (tmp_path / "sweeps.json").write_text(json.dumps({"sweeps": [{
        "name": "t", "why": "", "pattern": r"\.json@[0-9a-f]{8}",
        "roots": ["."], "exts": [".md"], "exclude": [],
    }]}), encoding="utf-8")
    flags = selfcheck.scan_sweep_coverage(tmp_path)
    assert any(".ts" in (f["val"] or "") for f in flags), flags


def test_sweep_coverage_quiet_when_declared(tmp_path):
    """다 덮으면 조용해야 한다 — 늘 우는 검사는 아무도 안 읽는다."""
    (tmp_path / "a.md").write_text("보고서.json@1671e540", encoding="utf-8")
    (tmp_path / "b.ts").write_text("// 보고서.json@1671e540", encoding="utf-8")
    (tmp_path / "sweeps.json").write_text(json.dumps({"sweeps": [{
        "name": "t", "why": "", "pattern": r"\.json@[0-9a-f]{8}",
        "roots": ["."], "exts": [".md", ".ts"], "exclude": [],
    }]}), encoding="utf-8")
    assert selfcheck.scan_sweep_coverage(tmp_path) == []


def test_sweep_coverage_flags_zero_files(tmp_path):
    """훑은 파일이 0이면 **안 돈 것**이다(#32) — 조용히 넘어가면 안 된다."""
    (tmp_path / "sweeps.json").write_text(json.dumps({"sweeps": [{
        "name": "t", "why": "", "pattern": "x", "roots": ["nowhere"], "exts": [".md"], "exclude": [],
    }]}), encoding="utf-8")
    flags = selfcheck.scan_sweep_coverage(tmp_path)
    assert any("안 돌았다" in f["flag"] for f in flags), flags


def test_gate_without_reachability_fires():
    """게이트에 도달 가능성이 없으면 **걸려야 한다**(#35 — L-C.3이 그렇게 실패했다)."""
    rep = {"gate": {"criterion": "판별력 ≥ 0.5", "result": 0.31}}
    flags = selfcheck.scan_gate_reachability({"x.json": rep})
    assert len(flags) == 1, flags
    assert "reachability" in flags[0]["flag"]


def test_gate_with_reachability_passes():
    rep = {"gate": {"criterion": "판별력 ≥ 0.5", "reachability": "오라클 팔 0.97", "result": 0.31}}
    assert selfcheck.scan_gate_reachability({"x.json": rep}) == []


def test_gate_scan_does_not_fire_on_stat_blocks():
    """`threshold`가 든 통계 블록까지 세면 97건이 떠서 검사가 소음이 된다(실제로 그랬다)."""
    rep = {"by_jitter": {"jitter_0": {"silent_wrong": {"k": 1, "n": 10, "rate": 0.1, "threshold": 0.2}}}}
    assert selfcheck.scan_gate_reachability({"x.json": rep}) == []
