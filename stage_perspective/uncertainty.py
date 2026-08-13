"""2점 종횡비 불확실성 전파 (지시 1-bis).

**왜 게이트가 아니라 구간인가**: 2점 직각복원의 종횡비 실패는 **구조적 모호가 아니라
노이즈 기인 추정 오차**다. 기하적 서명이 없으므로(지시 1에서 확인: 무노이즈 f/W=1.000이
종횡비와 무관, 실패군/성공군 시거리 분포 동일) 이진 게이트가 원리적으로 불가능하다.
→ 게이트 대신 **입력 불확실성을 출력까지 전파**해 구간으로 표현한다.

입력 불확실성 = 실측 코너 오차 분포(stage0/12): precise 1.68% / medium 2.69% / coarse 4.21%
(도형 대각 대비). 전파 경로: 코너 → 소실점 → f(6.2) → 종횡비.

몬테카를로를 쓴다(해석적 야코비안보다 단순하고, 소실점 교점·8way 대응 탐색 같은
비매끄러운 단계를 그대로 통과시킬 수 있다).

**측정 중 확인된 두 성질**(테스트로 잠금):
1. **종횡비는 역수까지만 결정된다.** 어느 변이 width이고 어느 쪽이 depth인지는 대응 라벨링
   선택이며 8way 재투영 탐색이 고른다. 참 0.6인 도형이 점추정 1.667(=1/0.6)로 나온다.
   → 구간을 소비할 때 a와 1/a를 같은 것으로 봐야 한다(`aspect_equiv`).
2. **구간 폭은 시선 고각에 단조**다(medium, 종횡비 1.5): 12° 1.093 → 40° 0.806 → 82° 0.501.
   지면 도형을 낮게 볼수록(edge-on) 종횡비 구속이 약해진다. 전파가 실제 기하 조건수를
   반영한다는 증거다.
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
from stage_perspective.noise import grade_ratios, diag_of
from stage_perspective.priors import recover_aspect_rightangle

# 구간 폭 임계 — **잠정값**. §14 로깅 튜닝 대상(질의 임계 ASK_THRESHOLD와 같은 성격).
# 상대 폭(구간폭/점추정)이 이보다 크면 비례 미확정으로 보고 unresolved에 올린다.
REL_WIDTH_UNRESOLVED = 0.40


def aspect_equiv(a: float) -> float:
    """종횡비를 역수 동치류의 대표값(≥1)으로 정규화. 라벨링 모호(성질 1) 흡수."""
    a = float(a)
    if a <= 0:
        return float("nan")
    return a if a >= 1.0 else 1.0 / a


def interval_contains_aspect(r: dict, a_true: float) -> bool:
    """구간이 참 종횡비를 담는가 — 역수 동치를 인정해 판정."""
    if not r.get("ok"):
        return False
    return (r["lo"] <= a_true <= r["hi"]) or (r["lo"] <= 1.0 / a_true <= r["hi"])


def propagate_aspect(image4: np.ndarray, img_size, grade: str = "medium",
                     n_samples: int = 200, seed: int = 0, ci: float = 0.90) -> dict:
    """관측 4점 + 등급 → 종횡비 점추정 + 신뢰구간(몬테카를로).

    반환:
      aspect       점추정(무섭동 복원값). 복원 실패면 None
      lo, hi       ci 신뢰구간(표본 분위수)
      rel_width    (hi-lo)/aspect — 상대 폭. 스케일 무관 비교용
      unresolved   rel_width > REL_WIDTH_UNRESOLVED 또는 복원 실패
      ok_rate      섭동 표본 중 복원 성공 비율(낮으면 그 자체로 불안정 신호)
    """
    a = np.asarray(image4, float)
    ratio = grade_ratios().get(grade, 0.0269)
    sigma = ratio * diag_of(a)
    rng = np.random.default_rng(seed)

    base = recover_aspect_rightangle(a, img_size)
    point = float(base["aspect"]) if base.get("ok") else None

    vals = []
    for _ in range(n_samples):
        r = recover_aspect_rightangle(a + rng.normal(0, sigma, a.shape), img_size)
        if r.get("ok") and np.isfinite(r["aspect"]) and r["aspect"] > 0:
            vals.append(float(r["aspect"]))
    ok_rate = len(vals) / n_samples

    if not vals:
        return {"ok": False, "aspect": point, "lo": None, "hi": None,
                "rel_width": None, "ok_rate": ok_rate, "unresolved": True,
                "reason": "모든 섭동 표본에서 복원 실패"}

    q = (1 - ci) / 2
    lo = float(np.quantile(vals, q)); hi = float(np.quantile(vals, 1 - q))
    med = float(np.median(vals))
    center = point if point is not None else med
    rel = (hi - lo) / max(1e-9, center)
    return {"ok": True, "aspect": round(center, 4),
            "lo": round(lo, 4), "hi": round(hi, 4),
            "rel_width": round(rel, 4), "ok_rate": round(ok_rate, 3),
            "median_of_samples": round(med, 4),
            "unresolved": bool(rel > REL_WIDTH_UNRESOLVED),
            "grade": grade, "n_samples": n_samples, "ci": ci}


def unresolved_entry(vol_id: str, r: dict) -> str | None:
    """§3.5 '앵커 부재 시 무차원' 확장 — 구간이 넓으면 unresolved 문자열을 만든다(2.5)."""
    if not r.get("unresolved"):
        return None
    if not r.get("ok"):
        return f"{vol_id}: 종횡비 복원 실패(투시 단독) — 치수 또는 추가 뷰 필요"
    return (f"{vol_id}: 종횡비 미확정 "
            f"[{r['lo']}~{r['hi']}], 상대폭 {r['rel_width']:.2f} — 치수 또는 추가 뷰 필요")
