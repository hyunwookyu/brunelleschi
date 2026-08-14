"""평가 지표 감사 — plane_iou가 종횡비 오차에 둔감한가 (지시 1-ter A).

1-bis에서 "평면 IoU는 종횡비 오차에 둔감하다"고 추정했다. 사실이면 Track 2 전체가
**핵심 오차를 놓치는 지표로 평가돼 온 것**이므로 정량화가 필요하다.

측정:
  (a) 종횡비 상대오차 ↔ plane_iou 상관 + 둔감성 곡선(오차 구간별 IoU 중앙값)
  (b) 어느 IoU 값이 어느 종횡비 오차에 대응하는가 (역치 환산표)

**주의**: 종횡비는 역수까지만 결정된다(1-bis 성질 1). 오차는 반드시 역수 동치로 재야 한다.
그렇지 않으면 라벨 뒤바뀜이 오차로 잡혀 지표가 오염된다(기존 2F aspect_rel_err가 그랬다).

출력: stage0/out/metric_audit.json
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.decompose import _project_polygon
from stage_perspective.priors import rect, recover_plane_rightangle
from stage_perspective.noise import grade_ratios, add_corner_noise
from stage_perspective.reconstruct import _norm, _poly_iou
from stage_perspective.uncertainty import aspect_equiv

OUT = ROOT / "stage0" / "out"


def polygon_aspect(poly) -> float:
    """**일반 폴리곤**의 종횡비 — PCA 주축 정렬 후 bbox 비(장변/단변).

    ⚠ **직교 폴리곤에는 쓰지 말 것**(D-1b-3 c). L자는 질량 분포가 대각이라 주축이 45° 돌아
    참값이 1.333으로 나온다 — 건축적 외곽 비례(자연값 1.000)가 아니다. 그 프레임에서 잰
    0.046이 "외곽은 신뢰 가능"의 근거였으나 자연 프레임에서는 0.163이다.
    직교 폴리곤은 `shape_metrics.bbox_aspect(poly, "natural")`을 쓴다.
    프레임 영향 범위는 실측으로 2H L자에 국한됨을 확인했다(2F 비율 1.00, U 참값 동일)."""
    P = np.asarray(poly, float)
    if len(P) < 3:
        return float("nan")
    Q = P - P.mean(0)
    # 주축(PCA)으로 회전 정렬 → 회전 불변
    _u, _s, vt = np.linalg.svd(Q, full_matrices=False)
    R = Q @ vt.T
    w = float(np.ptp(R[:, 0])); h = float(np.ptp(R[:, 1]))
    if min(w, h) < 1e-9:
        return float("nan")
    return max(w, h) / min(w, h)


def aspect_rel_err(recovered: float, truth: float) -> float:
    """역수 동치 종횡비 상대오차. |log| 기반이 대칭적이나 기존 지표와 비교 가능하도록
    동치류 대표값(≥1)에서의 상대오차를 쓴다."""
    r, t = aspect_equiv(recovered), aspect_equiv(truth)
    if not np.isfinite(r) or not np.isfinite(t) or t <= 0:
        return float("nan")
    return abs(r - t) / t


def run(n=400, seed=0, grade="medium"):
    rng = np.random.default_rng(seed)
    ratio = grade_ratios().get(grade, 0.0269)
    rows = []
    for _ in range(n):
        a_true = rng.uniform(0.3, 3.0)
        truth = rect(a_true) * rng.uniform(3, 9)
        c = truth.mean(0)
        diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
        az = rng.uniform(0, 2 * np.pi)
        el = rng.uniform(np.radians(10), np.radians(85))
        dist = diag * rng.uniform(1.1, 3.5)
        eye = (c[0] + dist * np.cos(az) * np.cos(el),
               c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.2)
        sz = (800.0, 600.0)
        img = _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz)
        noisy = add_corner_noise(img, ratio, rng)
        r = recover_plane_rightangle(noisy, sz)
        if not r["ok"]:
            continue
        iou = _poly_iou(_norm(truth), _norm(np.array(r["recovered_plane"])))
        # 역수 동치 오차(옳음)와 순진한 오차(기존 2F 방식) 둘 다 기록
        e_eq = aspect_rel_err(r["aspect"], a_true)
        e_naive = abs(r["aspect"] - a_true) / a_true
        rows.append({"iou": float(iou), "err_equiv": float(e_eq), "err_naive": float(e_naive),
                     "aspect_true": a_true, "aspect_rec": float(r["aspect"])})

    ok = [r for r in rows if np.isfinite(r["err_equiv"])]
    iou = np.array([r["iou"] for r in ok])
    err = np.array([r["err_equiv"] for r in ok])
    errn = np.array([r["err_naive"] for r in ok])

    def sp(a, b):
        ra = np.argsort(np.argsort(a)).astype(float)
        rb = np.argsort(np.argsort(b)).astype(float)
        return float(np.corrcoef(ra, rb)[0, 1])

    # 둔감성 곡선: 종횡비 오차 구간별 IoU 중앙값
    bins = [(0.0, 0.05), (0.05, 0.10), (0.10, 0.20), (0.20, 0.35), (0.35, 0.60), (0.60, 10.0)]
    curve = []
    for lo, hi in bins:
        m = (err >= lo) & (err < hi)
        if m.sum() >= 3:
            curve.append({"aspect_err": f"{lo:.2f}~{hi:.2f}", "n": int(m.sum()),
                          "iou_median": round(float(np.median(iou[m])), 4),
                          "iou_p10": round(float(np.percentile(iou[m], 10)), 4)})

    # 역치 환산: IoU 임계별로 통과한 표본의 종횡비 오차 분포
    thresholds = []
    for t in (0.6, 0.7, 0.8, 0.9):
        m = iou >= t
        if m.sum() >= 3:
            thresholds.append({"iou_threshold": t, "n_pass": int(m.sum()),
                               "aspect_err_median": round(float(np.median(err[m])), 4),
                               "aspect_err_p90": round(float(np.percentile(err[m], 90)), 4)})

    res = {
        "spec": "plane_iou vs 종횡비 상대오차 (지시 1-ter A). 역수 동치로 오차 산출.",
        "n": len(ok), "grade": grade, "corner_err_ratio": ratio,
        "correlation_iou_vs_aspect_err": {
            "pearson": round(float(np.corrcoef(iou, err)[0, 1]), 4),
            "spearman": round(sp(iou, err), 4),
        },
        "insensitivity_curve": curve,
        "iou_threshold_to_aspect_err": thresholds,
        "naive_vs_equivalent_error": {
            "note": "순진한 오차는 역수 라벨 뒤바뀜을 오차로 잡는다(기존 2F 방식의 오염).",
            "median_naive": round(float(np.median(errn)), 4),
            "median_equivalent": round(float(np.median(err)), 4),
            "flip_rate": round(float(np.mean(errn > err + 1e-9)), 4),
        },
        "summary_medians": {"iou_median": round(float(np.median(iou)), 4),
                            "aspect_err_median": round(float(np.median(err)), 4)},
    }
    return res


def main():
    res = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "metric_audit.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
