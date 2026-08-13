"""폐기 노이즈 모델의 영향 범위 재측정 (지시 0.5).

구 모델(`noise_params.jitter_ratio` = 전체획 straightness를 점별 지터로 사용)에 의존한
측정 중 지시가 명시한 3건을 **구/신 모델 양쪽으로** 돌려 델타를 본다.
기존 스크립트는 건드리지 않고 여기서 대조만 한다(기준선 교체는 별도 판단 사항).

  (1) 부분 획 단조성 위반율      (stage0/09)
  (2) tolerance 그리드서치        → V-5b 실획 스윕으로 대체 판단(아래 note)
  (3) 카메라 정합 fit_error 등급별 (stage3/noise_eval)

출력: stage0/out/noise_model_impact.json
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.inknoise import render_ink, load_model
from stage1.normalize import normalize_to_ir
from stage3.camera import fit_camera
from stage3.synth import build_synthetic

OUT = ROOT / "stage0" / "out"
QD = json.loads((OUT / "quickdraw_grades.json").read_text(encoding="utf-8"))["noise_params"]
FRACS = [0.3, 0.5, 0.7, 0.9, 1.0]


# ---------- 구 모델 재현(폐기) ----------
def old_render(poly, gp, rng):
    n = len(poly); cur = []
    for i in range(n):
        p0, p1 = poly[i], poly[(i + 1) % n]
        L = np.hypot(*(p1 - p0)); k = max(2, int(L / 6))
        ts = np.linspace(0, 1, k)
        base = p0[None, :] * (1 - ts[:, None]) + p1[None, :] * ts[:, None]
        d = (p1 - p0) / (L + 1e-9); nrm = np.array([-d[1], d[0]])
        wob = rng.normal(0, gp["jitter_ratio"] * L, k); wob[0] = wob[-1] = wob[0] * 0.3
        th = math.radians(rng.normal(0, gp["angle_sigma_deg"]))
        Rm = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
        c = base.mean(0); base = (base - c) @ Rm.T + c
        cur.extend((base + nrm[None, :] * wob[:, None]).tolist())
    cur = np.array(cur)
    cur[-1] += rng.normal(0, gp["closure_gap_ratio"] * np.ptp(cur, 0).mean(), 2)
    return cur


def gen_rect(rng):
    w = rng.uniform(90, 160); h = rng.uniform(60, 130)
    return np.array([[0., 0.], [w, 0.], [w, h], [0., h]])


# ---------- (1) 부분 획 단조성 ----------
def truncate(stroke, frac):
    k = max(2, int(len(stroke) * frac))
    return stroke[:k]


def partial_monotonicity(render, n=120, seed=0):
    """confidence≥0.5 확정 볼륨이 이후 단계에서 사라지는가(§task1 재정의 불변식)."""
    rng = np.random.default_rng(seed)
    viol = 0; parse_by_frac = {f: 0 for f in FRACS}; crashes = 0
    for _ in range(n):
        stroke = render(gen_rect(rng), rng)
        confirmed = False
        for f in FRACS:
            cap = {"frame": "p", "w": 640, "h": 520,
                   "strokes": [{"points": [[float(x), float(y), i, 0.5]
                                           for i, (x, y) in enumerate(truncate(stroke, f))], "pen": "mass"}]}
            try:
                ir, meta = normalize_to_ir(cap)
            except Exception:
                crashes += 1; continue
            ok = bool(ir.volumes) and meta.get("parseable") and meta.get("confidence", 0) >= 0.5
            if ok:
                parse_by_frac[f] += 1
                confirmed = True
            elif confirmed:
                viol += 1; confirmed = False      # 확정됐다 사라짐 = 위반
    return {"n": n, "violation_rate": round(viol / n, 4), "crashes": crashes,
            "confirmed_rate_by_frac": {str(f): round(c / n, 3) for f, c in parse_by_frac.items()}}


# ---------- (3) 카메라 fit_error 등급별 ----------
def camera_fit(noise_ratio: float, n=200, seed=0):
    """이미지 4점에 코너 노이즈(대각 비율) 주입 → 8way solvePnP → fit_error 분포."""
    rng = np.random.default_rng(seed)
    errs, approx = [], 0
    for _ in range(n):
        w = rng.uniform(4, 9); h = rng.uniform(3, 7)
        world4 = np.array([[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0]], float)
        c = world4.mean(0); diag = math.hypot(w, h)
        az = rng.uniform(0, 2 * np.pi); el = rng.uniform(np.radians(20), np.radians(65))
        dist = diag * rng.uniform(1.3, 2.5)
        eye = (c[0] + dist * np.cos(az) * np.cos(el), c[1] + dist * np.sin(az) * np.cos(el),
               dist * np.sin(el) + diag * 0.2)
        try:
            w4, img4, sz, _t = build_synthetic(img_size=(800.0, 600.0), eye=eye,
                                               target=(float(c[0]), float(c[1]), 0.0),
                                               world4=world4[:, :2])
        except Exception:
            continue
        a = np.asarray(img4, float)
        d_px = float(np.hypot(*np.ptp(a, 0))) or 1.0
        noisy = a + rng.normal(0, noise_ratio * d_px, a.shape)
        try:
            r = fit_camera(np.asarray(w4, float), noisy, sz)
        except Exception:
            continue
        fe = r.fit_error
        if fe is None or not r.ok:
            continue
        errs.append(fe)
        if fe > 0.10:
            approx += 1
    def q(p): return round(float(np.percentile(errs, p)), 5) if errs else None
    return {"n": len(errs), "median": q(50), "p95": q(95),
            "approx_rate": round(approx / max(1, len(errs)), 4)}


def main():
    model = load_model()
    res = {"spec": "폐기 노이즈 모델 영향 재측정(지시 0.5). 구=jitter_ratio(폐기), 신=실획기반.",
           "partial_strokes": {}, "camera_fit_error": {}}

    # (1) 부분 획 — precise 등급 기준(구 스크립트와 동일 조건)
    res["partial_strokes"]["old_model"] = partial_monotonicity(
        lambda poly, rng: old_render(poly, QD["precise"], rng))
    res["partial_strokes"]["new_model"] = partial_monotonicity(
        lambda poly, rng: render_ink(poly, model["precise"], rng)[0])

    # (3) 카메라 — 구: jitter_ratio를 노이즈비율로 사용 / 신: 실측 코너오차 비율
    ce = json.loads((OUT / "corner_error.json").read_text(encoding="utf-8"))["grades"]
    for g in ("precise", "medium", "coarse"):
        res["camera_fit_error"].setdefault("old_model", {})[g] = camera_fit(QD[g]["jitter_ratio"] * 0.1)
        res["camera_fit_error"].setdefault("new_model", {})[g] = camera_fit(
            ce[g]["corner_err_over_diag_median"])

    res["tolerance_gridsearch"] = {
        "status": "구 모델 산출물(common/tuned_tol.json)은 폐기 모델 위에서 튜닝됨",
        "superseded_by": "V-5b 실획 tolerance 스윕(stage0/out/mouse_tolerance_sweep.json)",
        "finding": "실획 12종 스윕에서 현행 세트를 개선하는 변형 없음(평탄 최적) → 재튜닝 불요",
    }
    (OUT / "noise_model_impact.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
