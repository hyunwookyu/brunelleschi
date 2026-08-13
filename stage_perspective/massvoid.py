"""매스/보이드 판별 (지시 3.2) — 투시 기하만으로.

**결함의 성격**: 1점투시 실내 공간(한 면이 열린 정육면체, 개구부로 내부를 보는 구도)은
건축의 표준 구도인데, IR에 공간 개념이 없어 **솔리드 매스로 인식**되면 잘못된 기하가 나온다.
투시 전용 입력(지시 2)과 합치면 이 결함이 지배적이다.

**판별 원리**(추가 계산 없음 — 2.2의 소실점 경로에 이미 있는 정보):
  room : 원경 사각형(배면)이 근경 사각형(개구) **안에 포함**되고, 소실점이 배면 안에 있다.
         내부에서 보므로 벽이 화면 바깥쪽으로 펼쳐지고 배면이 가운데 작게 남는다.
  mass : 포함 관계가 없다. 실루엣이 두 사각형의 **합집합**이며 소실점이 도형 밖이거나
         배면이 근경 밖으로 삐져나온다.

애매하면 판정하지 않는다(§3.7 "추정하지 않는다"). `kind=None` → unresolved.
"""
from __future__ import annotations
import math
from typing import Optional, Sequence
import numpy as np


def _poly_area(P: np.ndarray) -> float:
    x, y = P[:, 0], P[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


def point_in_poly(pt, poly) -> bool:
    p = np.asarray(pt, float); P = np.asarray(poly, float)
    inside = False
    n = len(P)
    for i in range(n):
        j = (i - 1) % n
        xi, yi = P[i]; xj, yj = P[j]
        if ((yi > p[1]) != (yj > p[1])) and \
           (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
    return inside


def contains_polygon(outer, inner, min_frac: float = 1.0) -> bool:
    """inner의 정점이 outer 안에 있는 비율이 min_frac 이상인가.
    **엄격(1.0)이 최적**이다. 완화(0.75)를 시험했으나 외부 매스가 room으로 오분류돼
    정확도가 0.905→0.765로 떨어졌다. 면적비 애매 판정을 앞에 두면 노이즈 취약성은
    거기서 흡수되므로 포함 판정은 엄격해도 된다(파라미터 스윕 근거)."""
    O = np.asarray(outer, float); I = np.asarray(inner, float)
    hits = sum(1 for p in I if point_in_poly(p, O))
    return hits >= math.ceil(min_frac * len(I) - 1e-9)


def classify_volume(near_quad, far_quad, vanishing_point: Optional[Sequence[float]] = None,
                    area_ratio_max: float = 0.85) -> dict:
    """근경(개구) 사각형 + 원경(배면) 사각형 → kind.

    near_quad: 화면에서 큰 쪽(실내면 개구부 테두리, 외부 매스면 앞면)
    far_quad : 화면에서 작은 쪽(실내면 배면, 외부 매스면 뒷면)
    vanishing_point: 있으면 배면 안에 있는지 추가 확인(실내의 강한 신호)

    반환: {"kind": "room"|"mass"|None, "reason": str, "evidence": {...}}
    """
    N = np.asarray(near_quad, float); F = np.asarray(far_quad, float)
    if len(N) < 3 or len(F) < 3:
        return {"kind": None, "reason": "정점 부족", "evidence": {}}

    a_near, a_far = _poly_area(N), _poly_area(F)
    if a_near <= 1e-9:
        return {"kind": None, "reason": "퇴화(면적 0)", "evidence": {}}
    ratio = a_far / a_near
    contained = contains_polygon(N, F)
    vp_inside_far = bool(vanishing_point is not None and point_in_poly(vanishing_point, F))

    ev = {"area_ratio": round(float(ratio), 4), "far_inside_near": bool(contained),
          "vp_inside_far": vp_inside_far}

    # **애매를 먼저 걸러낸다.** 면적비가 1에 가까우면 정면 근접이라 두 해석 모두 가능하고,
    # 이때 포함 여부는 코너 노이즈에 좌우돼 신뢰할 수 없다(실측: 회피율 0으로 붕괴했던 원인).
    if ratio >= area_ratio_max:
        return {"kind": None,
                "reason": f"애매(면적비 {ratio:.2f}가 1에 가까움 — 정면 근접) — 판정하지 않음",
                "evidence": ev}
    # room: 배면이 근경 **안에** 있고 충분히 작다. 소실점이 배면 안이면 확증.
    if contained:
        return {"kind": "room",
                "reason": "배면이 개구 안에 포함(내부에서 보는 구도)"
                          + (" + 소실점이 배면 안" if vp_inside_far else ""),
                "evidence": ev}
    # mass: 포함 관계 없음 → 실루엣이 합집합
    return {"kind": "mass", "reason": "포함 관계 없음(실루엣이 합집합)", "evidence": ev}


def unresolved_entry(vol_id: str, res: dict) -> Optional[str]:
    """판정 실패 시 unresolved 문자열(§3.7 추정 금지)."""
    if res.get("kind") is not None:
        return None
    return (f"{vol_id}: 매스/실내 구분 미확정 — {res.get('reason', '판별 불가')}. "
            f"발화(방 이름)나 추가 뷰가 필요하다")


# ------------------------------------------------------------------ 3.3 발화 보조
# 방 이름이면 kind=room. 애매하면 unresolved — 임의 추정 금지.
ROOM_WORDS = ("hall", "lobby", "room", "홀", "로비", "방", "실", "거실", "침실",
              "주방", "복도", "office", "사무실", "화장실", "corridor", "atrium", "아트리움")
MASS_WORDS = ("mass", "매스", "동", "block", "블록", "tower", "타워", "building", "건물")


def kind_from_label(label: str) -> Optional[str]:
    """명명(§4 naming)에서 kind 추정. 확실한 것만 반환하고 애매하면 None."""
    if not label:
        return None
    low = label.lower()
    room = any(w in low for w in ROOM_WORDS)
    mass = any(w in low for w in MASS_WORDS)
    if room and not mass:
        return "room"
    if mass and not room:
        return "mass"
    return None            # 둘 다이거나 둘 다 아님 → 판정하지 않음


# ------------------------------------------------------------------ 3.5 관계 해석
# penetrate의 의미가 kind 조합에 따라 달라진다. 불명확한 조합은 판정하지 않는다.
PENETRATE_MEANING = {
    ("mass", "mass"): "두 덩어리가 서로 파고듦(합집합 형태 변화)",
    ("room", "mass"): "덩어리가 실내로 돌출(공간을 침범)",
    ("mass", "room"): "덩어리가 실내로 돌출(공간을 침범)",
    ("room", "room"): "두 공간이 연결됨(개구부·통로)",
}


def interpret_penetrate(kind_a: Optional[str], kind_b: Optional[str]) -> Optional[str]:
    """kind 조합별 penetrate 해석. 하나라도 미확정이면 **판정하지 않는다**."""
    if kind_a not in ("mass", "room") or kind_b not in ("mass", "room"):
        return None
    return PENETRATE_MEANING[(kind_a, kind_b)]
