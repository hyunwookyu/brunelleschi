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
    # ⚠ **#40 이후로는 산문만으로 부족하다** — 수치 + 출처, 또는 "오라클 없음" 명시가 있어야 한다.
    rep = {"gate": {"criterion": "판별력 ≥ 0.5", "reachability": "오라클 팔 0.97",
                    "reachability_value": 0.97, "reachability_source": "oracle/best",
                    "result": 0.31},
           "oracle": {"best": 0.97}}
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
    rep = {"gate": {"registered": "판별력 ≥ 0.5", "reachability": "오라클 0.97",
                    "reachability_value": 0.97, "reachability_source": "oracle/best"},
           "oracle": {"best": 0.97}}
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


# ---- #40: **자동 검사의 필수 필드를 항등·자명한 값으로 채우지 않는다** (2026-08-16, 사람 지시) ----
# 실제로 걸린 것: #35 검사를 만든 **같은 세션**이 `reachability`를 정보량 0인 항등으로 채웠다
# (`horizon` 초판의 "참 카메라에서 오차 0"). 필드가 안 비었으므로 검사를 통과했다 —
# **검사를 만들면서 검사를 무력화한 것**이다. 아래가 그 반례들이다.


def test_gate_reachability_prose_only_fires():
    """산문뿐이면 걸려야 한다 — 수치도 '오라클 없음' 명시도 없는 상태."""
    rep = {"gate": {"registered": "판별력 ≥ 0.5", "reachability": "구성상 도달 가능하다"}}
    flags = selfcheck.scan_gate_reachability({"x.json": rep})
    assert any("산문뿐" in (f["val"] or "") for f in flags), flags


def test_gate_reachability_identity_value_fires():
    """도달 가능성 값이 **정확히 0**이면 항등을 의심해야 한다(#5) — horizon 초판이 그랬다."""
    rep = {"gate": {"registered": "오차 ≤ 1", "reachability": "참 카메라에서 오차 0",
                    "reachability_value": 0, "reachability_source": "oracle/err"},
           "oracle": {"err": 0}}
    flags = selfcheck.scan_gate_reachability({"x.json": rep})
    assert any("정확히 0 또는 1" in f["flag"] for f in flags), flags


def test_gate_reachability_value_mismatch_fires():
    """적어 둔 수치가 원장과 다르면 걸려야 한다(값 대조, #33) — 재측정 뒤 안 고친 자리."""
    rep = {"gate": {"registered": "r", "reachability": "오라클 팔",
                    "reachability_value": 0.97, "reachability_source": "oracle/best"},
           "oracle": {"best": 0.42}}
    flags = selfcheck.scan_gate_reachability({"x.json": rep})
    assert any("원장과 다르다" in f["flag"] for f in flags), flags


def test_gate_reachability_bad_source_fires():
    rep = {"gate": {"registered": "r", "reachability": "오라클 팔",
                    "reachability_value": 0.97, "reachability_source": "nowhere/at/all"}}
    flags = selfcheck.scan_gate_reachability({"x.json": rep})
    assert any("안 풀린다" in f["flag"] for f in flags), flags


def test_gate_reachability_ok_is_quiet():
    """수치가 자명하지 않고 원장과 맞으면 **조용해야 한다** — 늘 우는 검사는 안 읽힌다."""
    rep = {"gate": {"registered": "r", "reachability": "오라클 팔",
                    "reachability_value": 0.9694, "reachability_source": "oracle/best"},
           "oracle": {"best": 0.9694}}
    assert selfcheck.scan_gate_reachability({"x.json": rep}) == []


def test_gate_reachability_absent_is_quiet():
    """오라클이 **없다고 명시**하면 통과한다 — '없다'도 결론이고 그것이 원장에 남는다."""
    rep = {"gate": {"registered": "r", "reachability": "…",
                    "reachability_absent": "이 게이트에는 참값 팔이 없다"}}
    assert selfcheck.scan_gate_reachability({"x.json": rep}) == []


def test_sweep_pattern_never_matches_fires(tmp_path):
    """파일은 훑었는데 **패턴이 한 번도 안 맞으면** 그 훑기는 공허하다(#40)."""
    (tmp_path / "a.md").write_text("아무 내용", encoding="utf-8")
    (tmp_path / "sweeps.json").write_text(json.dumps({"sweeps": [{
        "name": "t", "why": "", "pattern": "결코없는패턴XYZ",
        "roots": ["."], "exts": [".md"], "exclude": [],
    }]}), encoding="utf-8")
    flags = selfcheck.scan_sweep_coverage(tmp_path)
    assert any("한 번도 안 맞았다" in f["flag"] for f in flags), flags


def test_citation_to_missing_ledger_fires(tmp_path):
    """**없는 원장을 인용하면** 값 대조를 한 번도 안 지난다 — 조용히 넘어가면 안 된다(#40)."""
    (tmp_path / "doc.md").write_text("gone_ledger.json@aabbccdd", encoding="utf-8")
    flags = selfcheck.scan_citation_hashes(tmp_path, {"real.json": {"constants": {"hash": "aabbccdd"}}})
    assert any("없는 원장을 인용한다" in f["flag"] for f in flags), flags


def test_stray_progress_fires(tmp_path):
    """**루트 밖 `progress.md`**를 잡는다 — 세 번째 재발이라 기계가 본다(2026-08-16)."""
    (tmp_path / "progress.md").write_text("정본", encoding="utf-8")
    (tmp_path / "web").mkdir()
    (tmp_path / "web" / "progress.md").write_text("여기 쓰면 안 된다", encoding="utf-8")
    flags = selfcheck.scan_stray_progress(tmp_path)
    assert any("루트 밖" in f["flag"] for f in flags), flags
    assert any(f["path"] == "web/progress.md" for f in flags), flags


def test_stray_progress_quiet_when_only_root(tmp_path):
    """루트의 것만 있으면 **조용해야 한다** — 늘 우는 검사는 안 읽힌다."""
    (tmp_path / "progress.md").write_text("정본", encoding="utf-8")
    assert selfcheck.scan_stray_progress(tmp_path) == []


# ---------------------------------------------------------------- #42 ⑥ 존재 대조
# `scan_cited_values` — 인용한 수치가 원장에 **실재하는가**(2026-08-18 8차 지시 1-c).
# 되살리는 버그: 6차의 "합성 400구도에서 각차 399 · 거리 400"이 **어느 원장에도 없었고**
# 그것으로 설계가 뒤집혔다(7-R [①-a]·#25). 옛 검사는 해시만 봤으므로 안 걸렸다.

def _reports(ledgers, hash_="54346ad1"):
    """`{이름: 원장}` — 전부 같은 상수 해시를 든다(현재 해시로 인용된 줄만 대상이다).

    ⚠ **키는 확장자를 포함한다**(`rule.json`) — `reports`의 실제 규약이 그렇고,
    안 맞추면 인용이 하나도 안 풀려 **덮는 대상 0**으로 조용히 지나간다(#32).
    """
    return {n: dict(v, constants={"hash": hash_}) for n, v in ledgers.items()}


def test_cited_values_fires_when_no_number_is_in_the_ledger(tmp_path):
    """원장에 **하나도 없는** 수치로 주장하면 걸려야 한다 — 되살린 그 버그다."""
    (tmp_path / "d.md").write_text(
        "근거: `rule.json@54346ad1` 합성 400구도에서 각차 399 · 거리 400", encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"rule.json": {"deg_median": 31.6083}}))
    assert any("하나도 없다" in f["flag"] for f in flags), flags


def test_cited_values_quiet_when_one_number_is_anchored(tmp_path):
    """원장 값이 **하나라도** 있으면 조용해야 한다 — 유도값(합·비)까지 울면 안 읽힌다.

    실측으로 정한 규칙이다: 수치별로 세니 1129 중 **272**가 걸렸고(24%) 대부분이
    `938`(= 720 + 218)·`0.493`(= 938/1904) 같은 **산문의 산술**이었다(#38·#32).
    """
    (tmp_path / "d.md").write_text(
        "`p.json@54346ad1`: 1회차 720 뒤 추가 218로 938(0.493)", encoding="utf-8")
    assert selfcheck.scan_cited_values(tmp_path, _reports({"p.json": {"first": 720}})) == \
        [f for f in selfcheck.scan_cited_values(tmp_path, _reports({"p.json": {"first": 720}}))
         if f["path"] == "selfcheck:scan_cited_values"]


def test_cited_values_counts_ledgers_named_without_a_hash(tmp_path):
    """한 줄이 여러 원장을 인용한다 — 해시 없이 이름만 적힌 것도 대조 대상이다."""
    (tmp_path / "d.md").write_text(
        "`a.json@54346ad1`의 대역에서 가이드는 607.6px다(`b.json`)", encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"a.json": {"x": 1}, "b.json": {"guide": 607.6}}))
    assert not any("하나도 없다" in f["flag"] for f in flags), flags


def test_cited_values_skips_history_lines(tmp_path):
    """`git show <sha>:` 줄은 **과거 원장**의 기록이다 — 현재 원장을 주장하지 않는다."""
    (tmp_path / "d.md").write_text(
        "옛 값 2.521은 `git show d724ac0:stage0/out/r.json`에 있다 — `r.json@54346ad1`",
        encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"r.json": {"now": 2.367}}))
    assert not any("하나도 없다" in f["flag"] for f in flags), flags


def test_cited_values_ignores_reference_numbers(tmp_path):
    """`#42`·`D-L70`·`§9.1`·연도는 수치가 아니다 — 그것만 있는 줄은 셈에서 빠진다."""
    (tmp_path / "d.md").write_text(
        "`r.json@54346ad1`(#42 · D-L70 · AS-L13 · §9.1 · 2026-08-18)", encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"r.json": {"v": 9.99}}))
    assert not any("하나도 없다" in f["flag"] for f in flags), flags


def test_cited_values_rounds_to_the_documents_precision(tmp_path):
    """원장 6자리 ↔ 문서 4자리. 반올림이 같은 값이면 실재로 친다."""
    (tmp_path / "d.md").write_text("`r.json@54346ad1` 중앙 31.6083", encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"r.json": {"deg": 31.60829999}}))
    assert not any("하나도 없다" in f["flag"] for f in flags), flags


def test_cited_values_ignores_stale_hash_lines(tmp_path):
    """낡은 해시 줄은 `scan_citation_hashes`가 잡는다 — 두 번 세지 않는다."""
    (tmp_path / "d.md").write_text("`r.json@509615a1` 각차 399", encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"r.json": {"deg": 31.6083}}))
    assert not any("하나도 없다" in f["flag"] for f in flags), flags


def test_cited_values_flags_zero_coverage(tmp_path):
    """덮는 대상이 0이면 **그 자체가 플래그**다(#38·#32) — 안 돈 것을 깨끗함으로 읽지 않는다.

    이 검사가 실제로 그 함정에 빠졌다: `reports`의 키가 `rule.json`인데 `rule`로 찾아
    인용이 하나도 안 풀렸고, **플래그 0건**이 나왔다. 이 팔이 그것을 잡는다.
    """
    (tmp_path / "d.md").write_text("인용 없는 산문 12345", encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"r.json": {"deg": 31.6083}}))
    assert any("덮는 대상이 0" in f["flag"] for f in flags), flags


def test_cited_values_counts_what_it_covers(tmp_path):
    """덮는 대상이 있으면 조용하다 — 늘 우는 검사는 안 읽힌다."""
    (tmp_path / "d.md").write_text("`r.json@54346ad1` 31.6083", encoding="utf-8")
    flags = selfcheck.scan_cited_values(tmp_path, _reports({"r.json": {"deg": 31.6083}}))
    assert flags == [], flags
