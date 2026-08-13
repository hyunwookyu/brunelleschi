"""0단계 재작업 — 실획 기반 노이즈 모델 추출·보정·검증 (지시 0.1~0.3).

구 모델(전체획 straightness를 점별 jitter로 사용)은 단위 혼동으로 폐기(V-o 반증).
Quick,Draw **raw** 실획(브라우저 마우스/터치 입력)에서 4성분을 분리 추출하고,
합성 생성기가 같은 스펙트럼을 내도록 고주파 sigma를 수치 보정한다.

출력: stage0/out/ink_noise_model.json
용법: python stage0/10_ink_noise_model.py
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.inknoise import (resample_uniform, low_freq_bow, high_freq_turn,
                             corner_overshoot, closure_gap, render_ink)
from common.normalize_core import stroke_straightness
from stage1.normalize import GRADE_CENTROID

RAW = ROOT / "data" / "quickdraw"
OUT = ROOT / "stage0" / "out"
CATS = ["square", "door", "house", "castle", "skyscraper"]
N_PER_CAT = 400
CANON_DIAG = 180.0          # 정준 스케일(stage1/normalize와 동일)
SPACING_CANON = 0.02        # 재표본 간격 / 대각 — 실획·합성 공통 자


def local_grade(strokes: list[np.ndarray], win=12, step=6) -> str:
    """국소창 직진성 → 등급(V-5b 정정 centroid와 같은 단위)."""
    vals = []
    for s in strokes[:8]:
        for i in range(0, max(1, len(s) - win), step):
            v = stroke_straightness(s[i:i + win, 0], s[i:i + win, 1])
            if v is not None:
                vals.append(v)
    if not vals:
        return "precise"
    m = float(np.median(vals))
    return min(GRADE_CENTROID, key=lambda g: abs(GRADE_CENTROID[g] - m))


def load_real(cat: str, n: int) -> list[list[np.ndarray]]:
    p = RAW / f"{cat}.ndjson"
    if not p.exists():
        return []
    out = []
    for i, ln in enumerate(p.read_text(encoding="utf-8").splitlines()):
        if len(out) >= n:
            break
        if not ln.strip():
            continue
        d = json.loads(ln)
        if d.get("recognized") is False:
            continue
        st = [np.stack([np.asarray(s[0], float), np.asarray(s[1], float)], 1)
              for s in d["drawing"] if len(s[0]) >= 3]
        if st:
            out.append(st)
    return out


def to_canon(strokes: list[np.ndarray]) -> list[np.ndarray]:
    """정준 대각으로 스케일 — 파라미터를 스케일 불변으로 만든다."""
    allp = np.concatenate(strokes)
    diag = math.hypot(*np.ptp(allp, 0)) or 1.0
    s = CANON_DIAG / diag
    lo = allp.min(0)
    return [(st - lo) * s for st in strokes]


def measure_strokes(strokes: list[np.ndarray]) -> dict:
    """한 그림의 4성분 + 간격. 등간격 재표본 후 고주파 측정(간격 교란 제거)."""
    sp = SPACING_CANON * CANON_DIAG
    lf, hf, ov, raw_sp = [], [], [], []
    for st in strokes:
        if len(st) < 6:
            continue
        seg = np.hypot(*np.diff(st, axis=0).T)
        raw_sp.extend(seg[seg > 1e-9].tolist())
        rs = resample_uniform(st, sp)
        lf += low_freq_bow(rs)
        hf += high_freq_turn(rs)
        ov += corner_overshoot(rs)
    # 시종점 어긋남은 **폐합 의도 획**에서만 유효하다. 다획 그림(변마다 한 획)의 최장 획은
    # 열린 한 변이라 첫-끝 거리가 곧 변 길이 → 폐합 오차가 아니다(1차 추출서 등급 역전으로 드러남).
    # → 단일 획으로 윤곽 전체를 그린 그림만 채택.
    gap = closure_gap(strokes[0]) if (len(strokes) == 1 and len(strokes[0]) > 2) else None
    return {"lf": lf, "hf": hf, "ov": ov, "gap": gap, "spacing": raw_sp}


def agg(vals: list[float], q=0.5) -> float:
    return float(np.quantile(vals, q)) if vals else 0.0


def calibrate_hf(target_turn: float, lf_bow: float, overshoot: float,
                 spacing_ratio: float, rng) -> float:
    """합성 획의 고주파 방향각 중앙값이 실획 목표와 같아지는 hf_sigma를 이분 탐색.
    해석적으로도 turn≈2·sigma/spacing이지만, 저주파·오버슈트가 섞이므로 수치로 맞춘다."""
    poly = np.array([[0., 0.], [CANON_DIAG * .6, 0.], [CANON_DIAG * .6, CANON_DIAG * .45],
                     [0., CANON_DIAG * .45]])
    sp = spacing_ratio * CANON_DIAG

    def turn_of(hf_sigma: float) -> float:
        vals = []
        for _ in range(12):
            p = {"lf_bow": lf_bow, "hf_sigma": hf_sigma, "overshoot": overshoot,
                 "closure_gap": 0.0, "spacing_ratio": spacing_ratio}
            st = render_ink(poly, p, rng)[0]
            vals += high_freq_turn(resample_uniform(st, sp))
        return agg(vals)

    lo, hi = 0.0, 2.0
    if turn_of(hi) < target_turn:            # 상한으로도 부족하면 상한 반환
        return hi
    for _ in range(18):
        mid = (lo + hi) / 2
        if turn_of(mid) < target_turn:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2, 5)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    buckets: dict[str, dict[str, list]] = {}
    n_by_grade: dict[str, int] = {}

    for cat in CATS:
        for strokes in load_real(cat, N_PER_CAT):
            cs = to_canon(strokes)
            g = local_grade(cs)
            m = measure_strokes(cs)
            b = buckets.setdefault(g, {"lf": [], "hf": [], "ov": [], "gap": [], "spacing": []})
            b["lf"] += m["lf"]; b["hf"] += m["hf"]; b["ov"] += m["ov"]
            if m["gap"] is not None:
                b["gap"].append(m["gap"])
            b["spacing"] += m["spacing"]
            n_by_grade[g] = n_by_grade.get(g, 0) + 1

    grades = {}
    for g, b in sorted(buckets.items()):
        spacing_ratio = round(agg(b["spacing"]) / CANON_DIAG, 5) if b["spacing"] else SPACING_CANON
        # lf_bow는 |반사인 활|의 관측 중앙값 → 생성기 normal sigma로 환산(|N|의 중앙값≈0.6745σ)
        lf_med = agg(b["lf"])
        lf_sigma = round(lf_med / 0.6745, 5)
        ov_med = agg(b["ov"])
        ov_sigma = round(ov_med / 0.6745, 5) if ov_med else 0.0
        gap_med = agg(b["gap"])
        gap_sigma = round(gap_med / 0.6745, 5) if gap_med else 0.0
        hf_target = agg(b["hf"])
        hf_sigma = calibrate_hf(hf_target, lf_sigma, ov_sigma, spacing_ratio, rng)
        grades[g] = {
            "n_drawings": n_by_grade.get(g, 0),
            "lf_bow": lf_sigma, "hf_sigma": hf_sigma,
            "overshoot": ov_sigma, "closure_gap": gap_sigma,
            "spacing_ratio": spacing_ratio,
            "observed": {"lf_bow_median": round(lf_med, 5),
                         "hf_turn_deg_median": round(hf_target, 4),
                         "overshoot_median": round(ov_med, 5),
                         "closure_gap_median": round(gap_med, 5),
                         "n_closure_intent": len(b["gap"])},
        }

    rep = {
        "spec": "실획 기반 잉크 노이즈 모델 (V-5c, 지시 0). 구 jitter_ratio 모델 폐기 대체.",
        "source": f"Quick,Draw raw {CATS} (브라우저 마우스/터치 입력), 등급=국소창 직진성",
        "canon_diag": CANON_DIAG, "measure_spacing_ratio": SPACING_CANON,
        "grades": grades,
        "note": "lf/ov/gap은 |N(0,σ)| 중앙값=0.6745σ로 σ 환산. hf_sigma는 방향각 중앙값 일치로 수치 보정.",
    }
    (OUT / "ink_noise_model.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    print("\n-> stage0/out/ink_noise_model.json")


if __name__ == "__main__":
    main()
