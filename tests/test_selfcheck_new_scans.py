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
    flags = selfcheck.scan_gate_reachability({"x.json": rep})
    # 통계 블록에는 안 걸리되, **덮는 대상이 0이라는 것은 걸려야 한다**(아래 테스트).
    assert [f for f in flags if "reachability" in f["flag"]] == []


# ---- **덮는 대상 수**를 각 검사가 보고한다(2026-08-16, 사람 지시) ----
# `scan_gate_reachability`가 원장 39개를 훑고도 `gate`라는 이름의 블록이 하나도 없어
# **덮는 대상이 0**이었다. 플래그 0건이 나왔고 그것이 "깨끗함"으로 읽혔다 — #32의 상황이다.


def _cov(scan: str):
    return [c for c in selfcheck.COVERAGE if c["scan"] == scan][-1]


def test_gate_scan_flags_zero_coverage():
    """덮는 게이트 블록이 0이면 **그 사실이 플래그로 뜬다**(#32)."""
    flags = selfcheck.scan_gate_reachability({"x.json": {"totals": {"n": 3}}})
    assert any("덮는 대상이 0" in f["flag"] and "게이트 블록" in f["val"] for f in flags), flags
    assert _cov("scan_gate_reachability")["targets"] == 0


def test_gate_scan_reports_coverage_when_gates_exist():
    """게이트가 있으면 덮는 수를 보고하고 **0 플래그는 안 뜬다**."""
    rep = {"gate": {"registered": "판별력 ≥ 0.5", "reachability": "오라클 0.97"}}
    flags = selfcheck.scan_gate_reachability({"a.json": rep, "b.json": rep})
    assert flags == [], flags
    assert _cov("scan_gate_reachability")["targets"] == 2


def test_zero_denominator_reports_coverage(tmp_path):
    """#36 검사가 **훑은 하네스 수**를 보고한다 — 거름이 깨지면 0으로 드러난다."""
    base = tmp_path / "web" / "test"
    base.mkdir(parents=True)
    (base / "h.test.ts").write_text(
        'writeFileSync("stage0/out/x.json", s);\nconst r = k / Math.max(1, n);\n', encoding="utf-8")
    (base / "pure.ts").write_text("export const f = 1;\n", encoding="utf-8")   # 원장을 안 쓴다
    flags = selfcheck.scan_zero_denominator(tmp_path)
    assert any("분모 0이 1로 바뀐다" in f["flag"] for f in flags), flags
    assert _cov("scan_zero_denominator")["targets"] == 1          # `pure.ts`는 대상이 아니다


def test_zero_denominator_flags_zero_coverage(tmp_path):
    """대상 하네스가 0이면 **안 돈 것**이다 — 조용히 넘어가면 안 된다(#32)."""
    (tmp_path / "web" / "test").mkdir(parents=True)
    flags = selfcheck.scan_zero_denominator(tmp_path)
    assert any("덮는 대상이 0" in f["flag"] and "하네스 파일" in f["val"] for f in flags), flags


def test_sweep_coverage_reports_sweep_count(tmp_path):
    """#33 검사가 **훑기 수**를 보고한다. 선언이 비면 0으로 드러난다."""
    (tmp_path / "sweeps.json").write_text(json.dumps({"sweeps": []}), encoding="utf-8")
    flags = selfcheck.scan_sweep_coverage(tmp_path)
    assert any("덮는 대상이 0" in f["flag"] and "훑기" in f["val"] for f in flags), flags
    assert _cov("scan_sweep_coverage")["targets"] == 0
