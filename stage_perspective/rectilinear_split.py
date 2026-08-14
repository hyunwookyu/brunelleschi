"""직교 폴리곤 분할 — 외곽(measured) + 노치(prior) (지시 D-1b-2).

**왜 나누는가**: 2H 재산출(D-1b)에서 L자의 두 값이 엇갈렸다.
  외곽 종횡비 오차 **4.6%**(precise) — 신뢰 가능
  상사 IoU **0.805** — 캘리브레이션상 **노치 ~30% 이동**에 해당, 신뢰 불가
같은 도형인데 부위별로 신뢰도가 다르다. 따라서 **하나의 provenance로 묶을 수 없다**:
외곽은 measured, 노치는 prior로 나눠 기록한다.

**범위 판정(D-1b-2 d)**: 노치(오목 정점) 개수로 가른다.
  1개  → L자형. 분할 처리 대상.
  2개+ → U자·계단. 외곽 종횡비 오차마저 0.31~1.27로 크므로 분할이 성립하지 않는다 → 범위 밖.

좌표계: **자연 프레임**(변 방향 정렬, `shape_metrics.natural_frame`)에서 다룬다.
PCA는 L자에서 주축이 45° 돌아 외곽 상자가 건축적 비례가 아니게 된다(D-1b-2).
"""
from __future__ import annotations
import math
from typing import Optional
import numpy as np

# 오목 판정 허용각 — 프리핸드 복원 결과라 관대하게.
REFLEX_TOL_DEG = 15.0


def principal_frame(poly):
    """자연 프레임(변 방향 정렬) — 공용 모듈 `shape_metrics.natural_frame`에 위임한다(D-1b-3 d)."""
    from stage_perspective.shape_metrics import natural_frame
    return natural_frame(poly)


def signed_area(P: np.ndarray) -> float:
    x, y = P[:, 0], P[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def reflex_vertices(poly, tol_deg: float = REFLEX_TOL_DEG) -> list[int]:
    """오목(반사각) 정점 인덱스. 폴리곤 방향(부호 면적)을 기준으로 판정한다."""
    P = np.asarray(poly, float)
    n = len(P)
    if n < 4:
        return []
    ccw = signed_area(P) > 0
    out = []
    for i in range(n):
        a, b, c = P[(i - 1) % n], P[i], P[(i + 1) % n]
        v1, v2 = b - a, c - b
        cross = float(v1[0] * v2[1] - v1[1] * v2[0])
        na, nb = np.hypot(*v1), np.hypot(*v2)
        if na < 1e-9 or nb < 1e-9:
            continue
        # 회전각이 거의 0(직선)이면 코너가 아니다
        ang = abs(math.degrees(math.asin(max(-1.0, min(1.0, cross / (na * nb))))))
        if ang < tol_deg:
            continue
        if (cross < 0) if ccw else (cross > 0):
            out.append(i)
    return out


def notch_count(poly) -> int:
    """노치 개수 = 오목 정점 개수. 범위 판정의 기준(D-1b-2 d)."""
    return len(reflex_vertices(poly))


def outer_box(poly) -> dict:
    """외곽 경계 상자 — **자연 프레임(변 방향)** 기준."""
    A, R = principal_frame(poly)
    lo, hi = A.min(0), A.max(0)
    w, h = float(hi[0] - lo[0]), float(hi[1] - lo[1])
    if min(w, h) < 1e-9:
        return {"ok": False, "reason": "퇴화(폭 또는 높이 0)"}
    return {"ok": True, "w": w, "h": h, "aspect": max(w, h) / min(w, h),
            "lo": lo.tolist(), "hi": hi.tolist(), "rot": R.tolist()}


def notch_of_L(poly) -> Optional[dict]:
    """노치 1개(L자형)의 위치·크기를 외곽 상자 대비 비율로 기술한다.

    반환: {corner, u, v, du, dv} — 주축 프레임에서
      corner : 노치가 붙은 상자 모서리 ('--','+-','-+','++')
      u,v    : 노치 시작점(상자 폭·높이 대비 0~1)
      du,dv  : 노치 크기(같은 정규화)
    prior가 채워야 할 것이 바로 이 네 수다(D-4).
    """
    P = np.asarray(poly, float)
    idx = reflex_vertices(P)
    if len(idx) != 1:
        return None
    box = outer_box(P)
    if not box["ok"]:
        return None
    A, _R = principal_frame(P)
    lo = np.asarray(box["lo"], float)
    w, h = box["w"], box["h"]
    r = A[idx[0]]                                   # 오목 정점(노치 안쪽 모서리)
    # 노치는 오목 정점과 가장 가까운 상자 모서리 사이의 직사각형이다.
    cx = "-" if (r[0] - lo[0]) < w / 2 else "+"
    cy = "-" if (r[1] - lo[1]) < h / 2 else "+"
    corner = cx + cy
    u0 = 0.0 if cx == "-" else (r[0] - lo[0]) / w
    v0 = 0.0 if cy == "-" else (r[1] - lo[1]) / h
    du = (r[0] - lo[0]) / w if cx == "-" else 1.0 - (r[0] - lo[0]) / w
    dv = (r[1] - lo[1]) / h if cy == "-" else 1.0 - (r[1] - lo[1]) / h
    return {"corner": corner, "u": float(u0), "v": float(v0),
            "du": float(du), "dv": float(dv)}


def split(poly) -> dict:
    """직교 폴리곤 → {scope, outer, notch}.

    scope: "rect"(노치 0) | "L"(노치 1, 분할 처리) | "out_of_scope"(노치 2+)
    """
    P = np.asarray(poly, float)
    nc = notch_count(P)
    box = outer_box(P)
    if not box["ok"]:
        return {"scope": "degenerate", "reason": box.get("reason"), "notch_count": nc}
    base = {"notch_count": nc,
            "outer": {"aspect": box["aspect"], "w": box["w"], "h": box["h"]}}
    if nc == 0:
        return {**base, "scope": "rect", "notch": None}
    if nc == 1:
        return {**base, "scope": "L", "notch": notch_of_L(P)}
    # 노치 2개 이상 — U자·계단. 외곽 종횡비 오차도 크므로(0.31~1.27) 분할이 성립하지 않는다.
    return {**base, "scope": "out_of_scope", "notch": None,
            "reason": f"노치 {nc}개 — U자·계단 계열은 외곽 종횡비마저 신뢰 불가(2H 재산출)"}
