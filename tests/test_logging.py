"""수집 로깅(§14) 불변식: 옵트인 기본꺼짐 / 기하 익명화."""
import sys, json
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from collect.logschema import Collector, anon_coords, hash_label, CORRECTION_KINDS


def test_optin_default_off(tmp_path):
    """기본 꺼짐: enabled=False면 파일이 생기지 않는다(§14.2)."""
    c = Collector(session="t", enabled=False, log_dir=tmp_path)
    c.log_unmappable("opening"); c.log_metric("x", 1)
    assert not any(tmp_path.iterdir())


def test_speech_separate_consent(tmp_path):
    """발화는 speech_consent True일 때만 기록(§14.2)."""
    c = Collector(session="t", enabled=True, speech_consent=False, log_dir=tmp_path)
    c.log_utterance("홀 폭 12미터", None)
    recs = [json.loads(l) for l in (tmp_path / "t.jsonl").read_text(encoding="utf-8").splitlines()] \
        if (tmp_path / "t.jsonl").exists() else []
    assert all(r["type"] != "utterance" for r in recs)
    c2 = Collector(session="u", enabled=True, speech_consent=True, log_dir=tmp_path)
    c2.log_utterance("홀 폭 12미터", None)
    recs2 = [json.loads(l) for l in (tmp_path / "u.jsonl").read_text(encoding="utf-8").splitlines()]
    assert any(r["type"] == "utterance" for r in recs2)


def test_geometry_anonymized_scale_translation_invariant():
    """익명화: 이동·스케일 불변 → 절대 치수/위치 미보존(§14.2)."""
    sq = np.array([[0, 0], [10, 0], [10, 10], [0, 10]], float)
    a = anon_coords(sq)
    b = anon_coords(sq * 3.0 + np.array([100, 50]))    # 스케일·이동
    assert np.allclose(np.array(a), np.array(b), atol=1e-6)
    assert max(abs(v) for p in a for v in p) <= 0.75    # 정규화 범위


def test_label_hashed():
    h = hash_label("hall")
    assert h.startswith("h:") and "hall" not in h


def test_correction_kinds():
    assert CORRECTION_KINDS == ("misread", "design_change")


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
