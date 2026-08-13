"""함의 시거리(implied viewing distance) 산출과 게이트 — 지시 1, 이론서 6·8·18장.

**왜 fit_error가 아니라 시거리인가** (이론서 8.8):
> 모든 사다리꼴은 정확히 하나의 시거리에 대해 정사각형이다. 사다리꼴은 틀리지 않는다.
> 다만 함의하는 시거리가 비현실적일 수 있고, 도형만 보아서는 그것을 판단할 단서가 없다.

즉 종횡비 복원 실패 케이스에는 **기하적 퇴화가 없다**. 재투영 오차는 낮게 나오는 것이
당연하고(2I의 fit_error recall≈0의 원인), 판정해야 할 양은 복원이 **함의하는 시거리**다.
그 값이 비현실적(극단 광각)이면 사람이 그런 구도로 그리지 않았을 것이므로 복원을 의심한다.

세 경우 모두 같은 양 f(=시거리, 화면 단위)로 환원된다(이론서 2.3: 1·2·3점은 별개 이론이 아니다).
  3점: 주점 = 소실점 삼각형 수심, f² = |PVᵢ|·|PHᵢ|        (6.3, 6.4)
  2점: f² = |PV₁|·|PV₂| (주점=이미지 중심 가정, 16.2)      (6.2)
  1점/사다리꼴: d = 2/[s·(1/b′ − 1/a′)]                    (8.8)
  타원: d = (A/B)·√(ab)                                    (8.7)

게이트(18.4, 화면 폭 W 기준):
  d ≥ 0.87W  화각 60° 이내 → 신뢰
  d ≥ 0.50W  60~90°        → 경고
  d <  0.50W 90° 초과      → 신뢰 불가
  d ≤ 0 또는 발산/비유한   → 무효
3점 예각 조건 위반(둔각삼각형) → f² < 0 → **결정적 무효**(확률적 게이트가 아니다, 6.5).
"""
from __future__ import annotations
import math
from typing import Literal, Optional
import numpy as np

Verdict = Literal["trust", "warn", "unreliable", "invalid"]

# 18.4 실무 기준
TRUST_W = 0.87
WARN_W = 0.50


def _line_through(p, q):
    """두 점을 지나는 직선 (a,b,c), ax+by+c=0."""
    p = np.asarray(p, float); q = np.asarray(q, float)
    a = q[1] - p[1]; b = p[0] - q[0]
    return a, b, -(a * p[0] + b * p[1])


def line_intersect(p1, p2, p3, p4) -> Optional[np.ndarray]:
    """선분 p1p2 와 p3p4 의 (연장) 교점 = 소실점. 평행이면 None(무한원점)."""
    a1, b1, c1 = _line_through(p1, p2)
    a2, b2, c2 = _line_through(p3, p4)
    det = a1 * b2 - a2 * b1
    if abs(det) < 1e-12:
        return None
    return np.array([(b1 * c2 - b2 * c1) / det, (c1 * a2 - c2 * a1) / det])


# ------------------------------------------------------------------ 3점 (6.3~6.5)
def f_from_three_vps(v1, v2, v3) -> dict:
    """소실점 삼각형 → 주점(수심) + f. 둔각이면 f²<0 → 결정적 무효(6.5).
    세 조합의 f² 편차가 곧 신뢰도(자유도 0이므로 남는 잔차가 없어야 한다, 5.3)."""
    V = [np.asarray(v, float) for v in (v1, v2, v3)]
    # 수심: V1에서 V2V3에 내린 수선 ∩ V2에서 V1V3에 내린 수선
    def foot_dir(a, b, c):        # a에서 bc에 내린 수선의 방향
        d = c - b
        return np.array([d[0], d[1]])
    # 수선 1: 점 V1, 법선 (V3-V2) → (x-V1)·(V3-V2)=0
    n1 = V[2] - V[1]; n2 = V[2] - V[0]
    A = np.array([n1, n2], float)
    rhs = np.array([n1 @ V[0], n2 @ V[1]], float)
    if abs(np.linalg.det(A)) < 1e-12:
        return {"ok": False, "reason": "degenerate_triangle"}
    P = np.linalg.solve(A, rhs)
    # f² = (V1-P)·(V2-P) 부호 반전 (6.1). 세 쌍 모두 같아야 한다.
    f2s = [-float((V[i] - P) @ (V[j] - P)) for i, j in ((0, 1), (1, 2), (0, 2))]
    f2 = float(np.mean(f2s))
    spread = float(np.std(f2s) / (abs(f2) + 1e-12))
    if f2 <= 0:
        return {"ok": False, "reason": "obtuse_triangle_f2_negative", "f2": f2,
                "principal_point": P.tolist(), "residual": spread}
    return {"ok": True, "f": math.sqrt(f2), "principal_point": P.tolist(),
            "residual": spread, "case": "3pt"}


# ------------------------------------------------------------------ 2점 (6.2)
def f_from_two_vps(v1, v2, img_size, principal=None) -> dict:
    """f² = |PV₁|·|PV₂|. 주점은 기본적으로 **이미지 중심 가정**(16.2, 가정 V-y).
    V₁·V₂가 주점 양쪽에 있어야 성립(부호 반대). 같은 쪽이면 직교 방향쌍이 아니다."""
    W, H = img_size
    P = np.array([W / 2.0, H / 2.0]) if principal is None else np.asarray(principal, float)
    V1 = np.asarray(v1, float); V2 = np.asarray(v2, float)
    f2 = -float((V1 - P) @ (V2 - P))
    if f2 <= 0:
        return {"ok": False, "reason": "vps_same_side_f2_negative", "f2": f2,
                "principal_point": P.tolist()}
    return {"ok": True, "f": math.sqrt(f2), "principal_point": P.tolist(),
            "residual": 0.0, "case": "2pt"}


# ------------------------------------------------------------------ 1점/사다리꼴 (8.8)
def d_from_trapezoid(quad, horizon_y: float | None = None) -> dict:
    """사다리꼴이 정사각형이 되는 시거리 d = 2/[s(1/b′ − 1/a′)]  (8.8).

    quad: 이미지 4점(순서 있는 폴리곤). 두 변이 이미지 수평(평행)에 가깝고
    나머지 두 변이 한 점으로 수렴하는 구도를 가정한다.
    a′, b′: 두 수평 변의 **지평선으로부터의 거리**. s: 수렴변 기울기(|dy/dx|).
    horizon_y 미지정 시 수렴변 교점(소실점)의 y를 지평선으로 쓴다.
    """
    q = np.asarray(quad, float)
    if len(q) != 4:
        return {"ok": False, "reason": "not_quad"}
    edges = [(q[i], q[(i + 1) % 4]) for i in range(4)]
    # 이미지 수평에 가까운 두 변 = |dy| 최소 두 개
    slopes = []
    for a, b in edges:
        dx, dy = b - a
        slopes.append(abs(dy) / (abs(dx) + 1e-12))
    order = np.argsort(slopes)
    hor = [edges[order[0]], edges[order[1]]]
    con = [edges[order[2]], edges[order[3]]]
    vp = line_intersect(con[0][0], con[0][1], con[1][0], con[1][1])
    if vp is None:
        return {"ok": False, "reason": "parallel_converging_edges(no_vp)"}
    hy = float(vp[1]) if horizon_y is None else float(horizon_y)
    a_mid = (hor[0][0] + hor[0][1]) / 2
    b_mid = (hor[1][0] + hor[1][1]) / 2
    a_p = abs(float(a_mid[1]) - hy)
    b_p = abs(float(b_mid[1]) - hy)
    if a_p < 1e-9 or b_p < 1e-9:
        return {"ok": False, "reason": "edge_on_horizon"}
    # 수렴변 기울기 s (두 변 평균, |dy/dx|)
    ss = []
    for a, b in con:
        dx, dy = b - a
        ss.append(abs(dy) / (abs(dx) + 1e-12))
    s = float(np.mean(ss))
    denom = s * (1.0 / b_p - 1.0 / a_p)
    if abs(denom) < 1e-12:
        # 두 수평 변이 지평선에서 같은 거리 = 수렴 없음 → d 발산(무효)
        return {"ok": False, "reason": "degenerate_denominator(d_diverges)"}
    # 두 수평 변 중 어느 쪽을 a′/b′로 잡느냐는 임의(정렬이 기울기순)이므로 부호가 뒤집힌다.
    # 크기가 판정 대상이므로 절대값을 쓴다(유도상 d>0).
    d = abs(2.0 / denom)
    if not math.isfinite(d) or d <= 0:
        return {"ok": False, "reason": "nonpositive_or_infinite_d", "d": d}
    return {"ok": True, "f": d, "residual": 0.0, "case": "trapezoid"}


# ------------------------------------------------------------------ 타원 (8.7)
def d_from_ellipse(a: float, b: float, A: float, B: float) -> dict:
    """d = (A/B)·√(ab). a,b=지평선에서 상·하단 접점까지 거리, A,B=가로·세로 반축."""
    if b <= 0 or a <= 0 or B <= 0:
        return {"ok": False, "reason": "bad_ellipse_params"}
    return {"ok": True, "f": (A / B) * math.sqrt(a * b), "residual": 0.0, "case": "ellipse"}


# ------------------------------------------------------------------ 게이트 (18.4)
def gate(f: float | None, img_width: float, ok: bool = True) -> dict:
    """시거리 → 신뢰 판정. 화면 폭 대비 비율로 화각을 읽는다."""
    if not ok or f is None or not math.isfinite(f) or f <= 0:
        return {"verdict": "invalid", "ratio": None,
                "fov_deg": None, "reason": "f 없음/비유한/비양수"}
    r = f / float(img_width)
    fov = 2 * math.degrees(math.atan(0.5 / r))     # 수평 화각
    v: Verdict = "trust" if r >= TRUST_W else ("warn" if r >= WARN_W else "unreliable")
    return {"verdict": v, "ratio": round(r, 4), "fov_deg": round(fov, 2)}


def evaluate_quad(quad, img_size, mode: str = "auto") -> dict:
    """이미지 4점(직사각형의 상) → 함의 시거리 + 게이트.
    mode: auto|2pt|trapezoid. auto는 수렴변 두 쌍이 모두 유한 소실점을 주면 2pt."""
    q = np.asarray(quad, float)
    W, _H = img_size
    v1 = line_intersect(q[0], q[1], q[3], q[2])    # 한 방향 쌍
    v2 = line_intersect(q[1], q[2], q[0], q[3])    # 다른 방향 쌍
    use_2pt = (mode == "2pt") or (mode == "auto" and v1 is not None and v2 is not None)
    if use_2pt and v1 is not None and v2 is not None:
        r = f_from_two_vps(v1, v2, img_size)
        if r["ok"]:
            return {**r, **gate(r["f"], W), "vps": [v1.tolist(), v2.tolist()]}
        # 2점이 무효(같은 쪽)면 사다리꼴 경로로 폴백
        r2 = d_from_trapezoid(q)
        return {**r2, **gate(r2.get("f"), W, r2.get("ok", False)),
                "fallback_from": r.get("reason")}
    r = d_from_trapezoid(q)
    return {**r, **gate(r.get("f"), W, r.get("ok", False))}
