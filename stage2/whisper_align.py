"""Whisper 연동 + 발화-획 시간 정렬 (§3.6 "발화 시점 ±3초의 획", §4.2 우회).

transcribe(audio_path): 오디오 → 세그먼트. whisper가 설치돼 있지 않을 수 있는
환경이므로 import를 가드하고, 미설치 시 설치 안내와 함께 명확한 예외를 낸다.

align(segments, strokes, window=3.0): 오디오 없이도 동작한다. 발화 세그먼트와
획의 타임스탬프만 있으면 되므로 오프라인 테스트가 가능하다. §3.6 "발화 시점
±3초의 획"을 그대로 구현 — 발화 구간 [start-window, start+dur+window]에 타임
스탬프가 걸리는 획을 그 발화의 문맥으로 묶는다.
"""
from __future__ import annotations
from typing import Any

try:
    import whisper  # type: ignore
    _HAS_WHISPER = True
except ImportError:
    _HAS_WHISPER = False


def transcribe(audio_path: str, model: str = "base") -> list[dict]:
    """오디오 파일 → [{text, start, dur}] 세그먼트. whisper 미설치 시 안내 예외
    (§9 위임: Whisper 연동은 Claude Code에 위임된 항목이나, 실행 환경에 패키지가
    보장되지 않으므로 여기서 명확히 실패시킨다 — 조용한 폴백은 안 한다)."""
    if not _HAS_WHISPER:
        raise NotImplementedError(
            "whisper 미설치. `pip install openai-whisper` (+ ffmpeg) 후 재시도. "
            "align()은 오디오 없이 세그먼트+획 타임스탬프만으로 동작하므로 "
            "이 함수 없이도 나머지 파이프라인/테스트는 가능하다."
        )
    m = whisper.load_model(model)
    result = m.transcribe(audio_path)
    return [{"text": s["text"].strip(), "start": float(s["start"]), "dur": float(s["end"] - s["start"])}
            for s in result["segments"]]


def _stroke_timestamps(stroke: dict) -> list[float]:
    """§4.1 스트로크 포맷 {"points":[[x,y,t,p],...]} 또는 단일 타임스탬프 {"t":...}
    둘 다 받는다 — capture 원본과 합성 테스트 픽스처를 같은 함수로 처리하기 위함."""
    if "t" in stroke:
        return [float(stroke["t"])]
    return [float(p[2]) for p in stroke.get("points", []) if len(p) > 2]


def align(segments: list[dict], strokes: list[dict], window: float = 3.0) -> list[dict]:
    """각 발화 구간 [start-window, start+dur+window]에 타임스탬프가 걸리는 획의
    id를 매칭해 발화별 문맥으로 붙인다(§3.6). strokes는 {"id":..., "t"|"points":...}.
    반환: segments와 같은 순서로 [{**segment, "strokes": [stroke_id, ...]}]."""
    out = []
    for seg in segments:
        t0 = seg["start"] - window
        t1 = seg["start"] + seg.get("dur", 0.0) + window
        hit = [s["id"] for s in strokes if any(t0 <= t <= t1 for t in _stroke_timestamps(s))]
        out.append({**seg, "strokes": hit})
    return out


if __name__ == "__main__":
    demo_segments = [{"text": "홀 폭이 한 12미터쯤", "start": 100.0, "dur": 2.0}]
    demo_strokes = [
        {"id": "s_before_window", "t": 90.0},
        {"id": "s_in_window_1", "t": 98.0},
        {"id": "s_in_window_2", "t": 104.5},
        {"id": "s_after_window", "t": 110.0},
    ]
    result = align(demo_segments, demo_strokes, window=3.0)
    print(result)

    try:
        transcribe("nonexistent.wav")
    except NotImplementedError as e:
        print("transcribe() guarded as expected:", e)
