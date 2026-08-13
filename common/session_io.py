"""세션 JSON 로더 (지시 4.4) — 실획을 분석 경로에 연결한다.

`web/src/ui/sessionExport.ts`가 내보낸 세션을 `stage0/10_ink_noise_model.py`(잉크 노이즈
4성분)와 `stage0/12_corner_error.py`(코너 오차)의 입력으로 바꾼다.

**보류 사유 (실행은 실제 획이 생긴 뒤)**:
현재 Track 2 임계와 1-bis 불확실성 전파는 **전부 Quick,Draw 코너 오차**에 근거한다
(precise 1.68% / medium 2.69% / coarse 4.21% of 대각). 그런데 Quick,Draw는
**마우스·손가락 입력**이다. 애플펜슬은 필압·기울기·샘플링률이 달라 저주파 휘어짐 분포가
다를 수 있고, 다르면 **노이즈 모델을 펜/마우스 두 벌로 분리하고 Track 2 임계를 재산출**해야
한다. 재작업 위험으로 등록(assumptions V-A).
→ 그래서 세션 포맷에 `input.penSeen`을 필수로 두었다. 어느 입력으로 그린 획인지 모르면
   분리 자체가 불가능하다.
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Iterable
import numpy as np

FORMAT = "sketch2space.session"


def load_session(path: str | Path) -> dict:
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    if d.get("format") != FORMAT:
        raise ValueError(f"세션 포맷 아님: {d.get('format')!r}")
    return d


def session_strokes(sess: dict, frame: str | None = None, pen: str = "mass") -> list[np.ndarray]:
    """세션 → [N,2] 획 배열 목록. frame 지정 시 그 프레임만."""
    out = []
    for s in sess.get("strokes", []):
        if pen and s.get("pen", "mass") != pen:
            continue
        if frame and s.get("frame") != frame:
            continue
        pts = np.asarray([[p[0], p[1]] for p in s.get("points", [])], float)
        if len(pts) >= 2:
            out.append(pts)
    return out


def session_input_kind(sess: dict) -> str:
    """'pen' | 'mouse' — 노이즈 모델 분리 판단의 근거(4.4 보류 사유)."""
    return "pen" if sess.get("input", {}).get("penSeen") else "mouse"


def sessions_in(dirpath: str | Path) -> list[dict]:
    """디렉토리의 세션들을 모두 읽는다(실측 수집 후 일괄 분석용)."""
    out = []
    for p in sorted(Path(dirpath).glob("*.json")):
        try:
            out.append(load_session(p))
        except Exception:
            continue
    return out


def to_capture(sess: dict, frame: str | None = None) -> dict:
    """stage1 파서가 받는 capture 형태로 변환."""
    strokes = [s for s in sess.get("strokes", [])
               if (not frame or s.get("frame") == frame) and s.get("pen", "mass") == "mass"]
    canvas = sess.get("canvas", {})
    return {"frame": frame or "plan",
            "w": canvas.get("w", 800), "h": canvas.get("h", 600),
            "strokes": strokes}
