# **정의 낡음(STALE(정의)) 탐지**에 반례를 건다(A-4: 새 지표엔 반례 테스트).
#
# 왜: 상수 스냅샷은 **임계값**만 본다. L-B.7에서 상수는 같은 채 형태 오차의 **식**이 갈렸고
# (`axis_live`의 `perStrokeError`는 게이지를 없애고 `promote`의 `segErr`는 안 없앴다),
# 같은 2416획이 두 원장에서 0.1222와 0.1533으로 나왔다. **STALE은 아무것도 안 짚었다** —
# 잡을 대상이 상수가 아니었기 때문이다(리뷰어 L-B.7 [1]).
#
# 반례가 확인하는 것 넷:
#   ① 정의가 갈리면 실제로 발화하는가 (버그를 되살려 잡히는지 — PITFALLS #21의 규칙)
#   ② 같으면 조용한가 (거짓 양성이 없어야 매 실행 쓸모가 있다)
#   ③ 스냅샷이 아예 없는 산출물을 짚는가
#   ④ 기준 자신(`metrics.json`)을 자기와 대조하지 않는가
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from selfcheck import scan_stale_metrics  # noqa: E402

NAMES = ["fitGauge", "perStrokeError", "silentWrong"]


def _outdir(tmp_path, cur_hash="aaaa0000", source="file", names=None):
    (tmp_path / "metrics.json").write_text(json.dumps({
        "hash": cur_hash, "names": names if names is not None else NAMES,
        "cuts": [0.1, 0.2, 0.5], "source": source,
    }, ensure_ascii=False), encoding="utf-8")
    return tmp_path


def _snap(h, names=None):
    return {"metric_defs": {"hash": h, "names": names if names is not None else NAMES,
                            "source": "file"}}


def test_same_definition_is_silent(tmp_path):
    """② 정의가 같으면 플래그가 없다 — 아니면 매 실행이 잡음이 된다."""
    out = _outdir(tmp_path)
    got = scan_stale_metrics(out, {"promote.json": _snap("aaaa0000")})
    assert got == []


def test_changed_definition_is_flagged(tmp_path):
    """① **버그를 되살린다** — 정의 해시가 다르면 그 산출물은 낡았다."""
    out = _outdir(tmp_path)
    got = scan_stale_metrics(out, {"promote.json": _snap("bbbb1111")})
    assert len(got) == 1
    assert "STALE(정의)" in got[0]["flag"]
    assert got[0]["path"] == "promote.json@bbbb1111"


def test_added_metric_is_named_in_the_diff(tmp_path):
    """지표 목록이 갈리면 **무엇이 갈렸는지** 함께 낸다 — 아니면 사람이 못 찾는다."""
    out = _outdir(tmp_path, names=NAMES + ["axisDirErrors"])
    got = scan_stale_metrics(out, {"promote.json": _snap("bbbb1111")})
    assert len(got) == 1
    assert "axisDirErrors" in got[0]["val"]


def test_same_names_different_hash_says_where_to_look(tmp_path):
    """목록이 같은데 해시가 다르면 **식이 바뀐 것**이다. 그 사실을 적는다."""
    out = _outdir(tmp_path)
    got = scan_stale_metrics(out, {"promote.json": _snap("bbbb1111")})
    assert "web/test/metrics.ts" in got[0]["val"]


def test_missing_snapshot_is_flagged(tmp_path):
    """③ 스냅샷이 없으면 **낡았는지 판정 불가**이고 그것도 결함이다."""
    out = _outdir(tmp_path)
    got = scan_stale_metrics(out, {"promote.json": {"scenes": 3}})
    assert len(got) == 1
    assert "스냅샷 없음" in got[0]["flag"]


def test_reference_itself_is_not_compared(tmp_path):
    """④ 기준 자신을 자기와 대조하지 않는다 — 상수 쪽에서 실제로 오탐이 났던 형태다."""
    out = _outdir(tmp_path)
    got = scan_stale_metrics(out, {"metrics.json": {}, "constants.json": {}})
    assert got == []


def test_fallback_source_invalidates_the_reference(tmp_path):
    """기준이 소스에서 안 왔으면 **대조 자체가 무의미하다.** 조용히 통과시키지 않는다."""
    out = _outdir(tmp_path, source="fallback")
    got = scan_stale_metrics(out, {"promote.json": _snap("aaaa0000")})
    assert len(got) == 1
    assert "무의미" in got[0]["flag"]


def test_no_reference_file_at_all(tmp_path):
    """기준 파일이 없으면 그것부터 만들라고 말한다."""
    got = scan_stale_metrics(tmp_path, {"promote.json": _snap("aaaa0000")})
    assert len(got) == 1
    assert "metrics.test.ts" in got[0]["flag"]
