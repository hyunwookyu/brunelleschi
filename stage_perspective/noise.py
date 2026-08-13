"""Track 2 코너 노이즈 — 실측 근거판 (지시 0.4).

**교체 이유**: 구판은 `GRADE_NOISE = {L1_ruler: 2.0, L2_freehand: 8.0, L3_concept: 20.0}` px를
손으로 골라 4 코너점에 가산했다. 근거가 없었고, 도형 크기와 무관한 절대 픽셀이라
투영 크기가 변하면 실효 노이즈가 달라졌다.

**실측 대체**: `stage0/12_corner_error.py`가 실획 기반 잉크 모델(stage0/10) → stage1 파서로
**복원 코너가 의도 코너에서 벗어나는 거리 / 도형 대각**을 측정했다.
  precise 1.68% (p90 3.22%) · medium 2.69% (5.33%) · coarse 4.21% (8.01%)

구판 대비(투영 대각 중앙 419px 기준):
  L1_ruler 2px = 0.48%  → 파서가 **달성 불가능한 정밀도**(precise 1.68%의 1/3.5). 낙관.
  L2_freehand 8px = 1.91% → 실은 precise급. "freehand"가 아니었다.
  L3_concept 20px = 4.77% → coarse(4.21%)와 근사. 유일하게 타당했던 값.
→ L1·L2 결과는 과대평가였다. 등급명을 실측 등급에 맞춰 재정의한다.

노이즈는 **도형 대각 비율**로 준다(스케일 불변).
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CORNER_ERR = ROOT / "stage0" / "out" / "corner_error.json"

# 실측 코너오차 중앙값 / 도형 대각 (stage0/out/corner_error.json). 로드 실패 시 폴백.
_FALLBACK = {"precise": 0.0168, "medium": 0.0269, "coarse": 0.0421}


def grade_ratios() -> dict[str, float]:
    """등급별 코너오차 비율. 실측 파일 우선."""
    if CORNER_ERR.exists():
        g = json.loads(CORNER_ERR.read_text(encoding="utf-8"))["grades"]
        out = {k: v["corner_err_over_diag_median"] for k, v in g.items()
               if v.get("corner_err_over_diag_median")}
        if out:
            return out
    return dict(_FALLBACK)


def diag_of(pts: np.ndarray) -> float:
    a = np.asarray(pts, float)
    return float(np.hypot(*np.ptp(a, 0))) or 1.0


def add_corner_noise(img_pts: np.ndarray, ratio: float, rng) -> np.ndarray:
    """코너점에 등방 가우시안. sigma = ratio × 이 표본의 대각(스케일 불변)."""
    a = np.asarray(img_pts, float)
    return a + rng.normal(0, ratio * diag_of(a), a.shape)


def stable_seed(*parts, base: int = 0, mod: int = 100000) -> int:
    """결정론적 시드. `hash(str)`는 PYTHONHASHSEED 무작위화 때문에 **실행마다 달라져**
    측정이 재현되지 않는다(지시 1-ter 중 발견: 같은 설정 재실행에 2F IoU 0.877↔0.885 표류).
    zlib.crc32는 프로세스 간 안정적이다."""
    import zlib
    key = "|".join(str(p) for p in parts).encode("utf-8")
    return int(base) + (zlib.crc32(key) % mod)
