"""통합 카메라 복원 — 1·2·3점을 한 경로로 (지시 2.2 / 이론서 2.3, 5.3, 6장).

> 직육면체의 세 주축 중 c = 0인 것이 몇 개냐로 이름이 갈린다. **이론은 하나이고,
> 1점과 2점은 카메라 자세가 특수 위치에 놓인 퇴화 사례다.** (이론서 2.3)

따라서 분기 구현을 두지 않는다. **유한 소실점 개수**로 경우를 나눌 뿐이다.

자유도 회계(5.3):
| 유한 소실점 | 남는 자유도 |
|---|---|
| 3개 | 없음 → 잔차가 곧 신뢰도 |
| 2개 | 주점 x 또는 f 중 하나 (→ 주점=이미지 중심 가정, 16.2) |
| 1개 | f (→ 깊이 미결정) |
| 0개 | 축측 극한(d→∞) — 투시 정보 없음 |

부족한 자유도는 **추정하지 않는다**(§3.5 확장, 지시 2.5). unresolved에 올려 §6 질의로 넘긴다.
1점 투시는 '무엇이 부족한지'가 기하적으로 특정되므로 질의 내용이 명확하다.
"""
from __future__ import annotations
import math
from typing import Optional, Sequence
import numpy as np

from stage_perspective.viewdist import (f_from_two_vps, f_from_three_vps,
                                        d_from_trapezoid, d_from_ellipse,
                                        line_intersect, gate)

# 소실점이 '무한원'인지 판정: 이미지 대각 대비 이 배수를 넘으면 평행으로 본다.
VP_INFINITE_RATIO = 50.0


def _is_finite_vp(vp: Optional[np.ndarray], img_size) -> bool:
    if vp is None or not np.all(np.isfinite(vp)):
        return False
    W, H = img_size
    diag = math.hypot(W, H)
    c = np.array([W / 2.0, H / 2.0])
    return float(np.hypot(*(np.asarray(vp, float) - c))) <= VP_INFINITE_RATIO * diag


def vanishing_points_from_quad(quad, img_size) -> list[Optional[np.ndarray]]:
    """사각형(직육면체 바닥면의 상) → 두 방향족의 소실점. 평행이면 None(무한원)."""
    q = np.asarray(quad, float)
    v1 = line_intersect(q[0], q[1], q[3], q[2])
    v2 = line_intersect(q[1], q[2], q[0], q[3])
    return [v1 if _is_finite_vp(v1, img_size) else None,
            v2 if _is_finite_vp(v2, img_size) else None]


# 이론서 7.7 — 화면 평행 방향(c=0)은 축소가 없어 실척이 직접 적용된다.
DIRECT_SCALE_AXES = {3: [], 2: ["height"], 1: ["width", "height"], 0: ["width", "height", "depth"]}


def direct_scale_axes(n_finite_vps: int) -> list[str]:
    """카메라 복원 **전에도** 비례가 확정되는 축(이론서 7.7).
    앵커가 하나 들어왔을 때 어느 축까지 즉시 확정되는지 구분하는 데 쓴다(지시 2.3)."""
    return list(DIRECT_SCALE_AXES.get(int(n_finite_vps), []))


def recover_camera(vps: Sequence[Optional[np.ndarray]], img_size,
                   quad=None, ellipse: dict | None = None,
                   principal: Optional[Sequence[float]] = None) -> dict:
    """유한 소실점 개수로 나뉘는 단일 경로.

    vps: 최대 3개(직교 세 방향). None = 무한원(화면 평행).
    quad: 1점 경로에서 사다리꼴 정사각 가정을 쓸 때 필요(8.8).
    ellipse: {"a","b","A","B"} 있으면 1점에서 f를 직접 준다(8.7) — 최우선.

    반환 공통: case, n_vps, principal_point, f, residual, verdict, unresolved[], direct_scale_axes
    """
    W, _H = img_size
    finite = [np.asarray(v, float) for v in vps if _is_finite_vp(v, img_size)]
    n = len(finite)
    out: dict = {"n_vps": n, "unresolved": [], "direct_scale_axes": direct_scale_axes(n),
                 "dof_note": None}

    # ---------------- 3점: 자유도 없음 (5.3) ----------------
    if n >= 3:
        r = f_from_three_vps(finite[0], finite[1], finite[2])
        out.update({"case": "3pt", "principal_point": r.get("principal_point"),
                    "residual": r.get("residual")})
        if not r["ok"]:
            # 6.5 예각 조건 위반 → f²<0 → 물리적으로 존재하지 않는 카메라. **결정적 무효**.
            out.update({"ok": False, "f": None, "reason": r.get("reason"),
                        **gate(None, W, ok=False)})
            out["unresolved"].append(
                "카메라 무효: 소실점 삼각형이 둔각 → f²<0. 대응하는 직육면체가 존재하지 않는다(이론서 6.5)")
            return out
        out.update({"ok": True, "f": r["f"], **gate(r["f"], W)})
        out["dof_note"] = "자유도 없음 — 세 조합 f² 편차(residual)가 곧 신뢰도"
        return out

    # ---------------- 2점: 자유도 1 (주점 x 또는 f) ----------------
    if n == 2:
        # 가정 V-y: 주점 = 이미지 중심(이론서 16.2). 명시적으로 기록한다.
        r = f_from_two_vps(finite[0], finite[1], img_size, principal=principal)
        out.update({"case": "2pt", "principal_point": r.get("principal_point"),
                    "residual": 0.0,
                    "assumption": "주점 = 이미지 중심(이론서 16.2, 가정 V-y) — 미검증"})
        if not r["ok"]:
            out.update({"ok": False, "f": None, "reason": r.get("reason"),
                        **gate(None, W, ok=False)})
            out["unresolved"].append("카메라 무효: 두 소실점이 주점 같은 쪽 → f²<0(직교 방향쌍 아님)")
            return out
        out.update({"ok": True, "f": r["f"], **gate(r["f"], W)})
        out["dof_note"] = "자유도 1을 주점 가정으로 소진 — 가정이 틀리면 f가 틀린다"
        return out

    # ---------------- 1점: 자유도 1 = f (깊이 미결정) ----------------
    if n == 1:
        pp = finite[0].tolist()      # 소실점 = 주점 (5.3)
        out.update({"case": "1pt", "principal_point": pp, "residual": 0.0})
        # f 결정 경로 (우선순위, 지시 2.2)
        if ellipse:
            r = d_from_ellipse(**ellipse)          # a. 타원 (8.7)
            if r["ok"]:
                out.update({"ok": True, "f": r["f"], "f_source": "ellipse(8.7)", **gate(r["f"], W)})
                return out
        if quad is not None:
            r = d_from_trapezoid(quad)             # b. 사다리꼴 정사각 가정 (8.8)
            g = gate(r.get("f"), W, r.get("ok", False))
            # 1번 게이트: 하한(0.5W)+상한(3W). 통과해야 채택한다.
            upper_ok = (g.get("ratio") is not None and g["ratio"] <= 3.0)
            if r.get("ok") and g["verdict"] in ("trust", "warn") and upper_ok:
                out.update({"ok": True, "f": r["f"], "f_source": "trapezoid_square_assumption(8.8)",
                            **g})
                out["dof_note"] = "정사각 가정으로 f 결정 — 가정이 틀리면 d가 그만큼 틀린다(게이트 통과분)"
                return out
            out["gate_rejected"] = {"reason": r.get("reason"), **g}
        # c/d/e — 발화·수동 입력, 다중 뷰, 없으면 unresolved
        out.update({"ok": False, "f": None, "verdict": "unresolved_f", "ratio": None, "fov_deg": None})
        out["unresolved"].append(
            "1점 투시: 시거리 f 미결정 → **안쪽 깊이 미결정**. "
            "타원·정사각 가정(게이트 통과)·치수 입력·추가 뷰 중 하나가 필요하다(이론서 5.3)")
        out["dof_note"] = "자유도 1(f) 잔존 — 폭·높이는 실척 직접(7.7), 깊이만 미결정"
        return out

    # ---------------- 0점: 축측 극한 ----------------
    out.update({"case": "axonometric", "ok": False, "f": None, "principal_point": None,
                "residual": None, "verdict": "no_perspective", "ratio": None, "fov_deg": None})
    out["unresolved"].append("유한 소실점 0 — 축측 극한(d→∞, 이론서 2.4). 투시로 깊이를 얻을 수 없다")
    out["dof_note"] = "모든 방향의 소실점이 무한원 — 아핀변환"
    return out
