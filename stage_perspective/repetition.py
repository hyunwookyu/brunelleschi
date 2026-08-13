"""등간격 반복 모듈 검출 (지시 2.4 / 이론서 9.5~9.6).

> V − uₙ = d(BC − AD) / [D(C + nD)]. 분모가 n에 대해 1차이므로
> **1/(V − uₙ)은 n에 대한 등차수열이다.** (9.5)
>
> α = 1/(V − u₀), β = 1/(V − u₁) − 1/(V − u₀) 로 두면 **uₙ = V − 1/(α + nβ)** (9.6)
> 기둥 두 개와 소실점만 있으면 나머지 전부가 결정된다. 역으로 화면에서 세 점을 재면
> 그것이 등간격인지 검증할 수 있다.

용도:
  - 창·기둥·층 간격이 검출되면 **스케일 힌트**(모듈 치수를 알면 앵커가 된다)
  - 세 점이 등간격인지 **검증**(9.6 역방향)
좌표는 소실점 방향의 1차원 좌표(u)를 쓴다. 화면 x 또는 소실점을 향한 직선의 매개변수.
"""
from __future__ import annotations
import math
from typing import Sequence
import numpy as np


def harmonic_coords(V: float, us: Sequence[float]) -> np.ndarray:
    """1/(V − uₙ). 등간격이면 이 좌표에서 등차(9.5)."""
    u = np.asarray(us, float)
    d = V - u
    with np.errstate(divide="ignore", invalid="ignore"):
        return 1.0 / d


def is_evenly_spaced(V: float, us: Sequence[float], tol: float = 0.05) -> dict:
    """세 점 이상이 등간격인가 — 조화좌표의 등차성으로 판정(9.6 역방향).

    tol: 2차 차분의 상대 허용치(1차 차분 중앙값 대비).
    """
    u = np.asarray(us, float)
    if len(u) < 3:
        return {"ok": False, "reason": "3점 이상 필요"}
    h = harmonic_coords(V, u)
    if not np.all(np.isfinite(h)):
        return {"ok": False, "reason": "소실점과 겹치는 점(발산)"}
    d1 = np.diff(h)
    if len(d1) < 2:
        return {"ok": False, "reason": "차분 부족"}
    scale = float(np.median(np.abs(d1)))
    if scale < 1e-12:
        return {"ok": False, "reason": "퇴화(모든 점 동일)"}
    d2 = np.diff(d1)
    resid = float(np.max(np.abs(d2)) / scale)
    return {"ok": bool(resid <= tol), "residual": round(resid, 5),
            "beta": float(np.median(d1)), "alpha": float(h[0]),
            "n": int(len(u))}


def predict_next(V: float, u0: float, u1: float, n: int) -> float:
    """uₙ = V − 1/(α + nβ) (9.6). 기둥 두 개 + 소실점 → n번째 위치."""
    a = 1.0 / (V - u0)
    b = 1.0 / (V - u1) - a
    denom = a + n * b
    if abs(denom) < 1e-12:
        return float("inf")            # 소실점에 도달(n→∞ 극한)
    return V - 1.0 / denom


def detect_repetition(V: float, us: Sequence[float], tol: float = 0.05,
                      min_count: int = 3) -> dict:
    """정렬된 1차원 좌표군에서 등간격 반복을 찾는다.
    검출되면 모듈 개수와 다음 위치 예측을 함께 준다(스케일 힌트용)."""
    u = np.asarray(sorted(us), float)
    if len(u) < min_count:
        return {"found": False, "reason": f"{min_count}점 미만"}
    r = is_evenly_spaced(V, u, tol=tol)
    if not r.get("ok"):
        return {"found": False, "reason": r.get("reason", "등차 아님"),
                "residual": r.get("residual")}
    return {"found": True, "count": int(len(u)), "residual": r["residual"],
            "alpha": r["alpha"], "beta": r["beta"],
            "next_u": predict_next(V, float(u[0]), float(u[1]), len(u)),
            "hint": "등간격 모듈 검출 — 모듈 실치수를 알면 앵커가 된다(§3.3)"}
