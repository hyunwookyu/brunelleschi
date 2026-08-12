"""판정 D(교체) 테스트 — tentative hint 표시 및 폐합 전환 (지시서 V 정정)."""
import sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage1.tentative import resolve


def _partial(frac):
    cap = json.loads((ROOT / "stage1" / "fixture_L_precise.json").read_text(encoding="utf-8"))
    pts = cap["strokes"][0]["points"]
    k = max(2, int(len(pts) * frac))
    return {**cap, "strokes": [{"points": pts[:k], "pen": "mass"}]}


def test_D_hint_at_30_percent():
    """30% 완성 → 정식 볼륨 없음, tentative hint 표시(판정 D 교체)."""
    vols, hints = resolve(_partial(0.30))
    assert len(vols) == 0
    assert len(hints) >= 1
    assert len(hints[0]["bbox"]) == 4          # 축정렬 파선 상자
    assert hints[0]["confidence"] < 0.5


def test_D_volume_at_completion():
    """폐합(100%) → 정식 볼륨으로 전환, hint 없음(매끄러운 교체)."""
    vols, hints = resolve(_partial(1.0))
    assert len(vols) == 1
    assert len(hints) == 0


def test_D_transition_monotone_completion():
    """완성도↑ → hint→볼륨 전환 (중간에 hint 또는 볼륨 항상 존재, 빈 화면 없음)."""
    for frac in (0.3, 0.5, 0.7, 0.9, 1.0):
        vols, hints = resolve(_partial(frac))
        assert len(vols) + len(hints) >= 1     # 항상 뭔가 보인다(빈 화면 방지)


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
