"""불확실성 구간이 실제 실패를 예측하는가 (지시 1-bis e).

2I와 **같은 조건**(medium 코너오차, 임의 종횡비·시점)에서
  구간 폭(rel_width)  vs  실제 실패(IoU<0.6)
의 상관과 분리력을 측정한다. 상관이 있으면 정량화가 작동하는 것이다.

출력: stage0/out/uncertainty_eval.json
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
from stage_perspective.uncertainty import (propagate_aspect, REL_WIDTH_UNRESOLVED,
                                          interval_contains_aspect)

OUT = ROOT / "stage0" / "out"


def run(n=250, seed=0, grade="medium", mc=120):
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
        iou = _poly_iou(_norm(truth), _norm(np.array(r["recovered_plane"]))) if r["ok"] else 0.0
        u = propagate_aspect(noisy, sz, grade=grade, n_samples=mc, seed=int(rng.integers(1e9)))
        rows.append({"iou": iou, "fail": iou < 0.6,
                     "rel_width": u.get("rel_width"), "ok_rate": u.get("ok_rate"),
                     "unresolved": bool(u.get("unresolved")),
                     "aspect_true": a_true,
                     # 종횡비는 역수까지만 결정된다(uncertainty 성질 1) → 동치 인정
                     "covered": interval_contains_aspect(u, a_true)})

    have = [r for r in rows if r["rel_width"] is not None]
    fails = [r for r in rows if r["fail"]]

    def med(v):
        return round(float(np.median(v)), 4) if len(v) else None

    # (e) 상관: 구간 폭 vs 실패
    w = np.array([r["rel_width"] for r in have], float)
    f = np.array([1.0 if r["fail"] else 0.0 for r in have], float)
    pearson = float(np.corrcoef(w, f)[0, 1]) if len(set(f)) > 1 else None
    # 순위상관(스피어만) — 단조 관계에 강건
    rw = np.argsort(np.argsort(w)).astype(float)
    rf = np.argsort(np.argsort(f)).astype(float)
    spearman = float(np.corrcoef(rw, rf)[0, 1]) if len(set(f)) > 1 else None
    # AUC(실패 판별력) — 폭이 클수록 실패면 >0.5
    pos = w[f == 1]; neg = w[f == 0]
    auc = None
    if len(pos) and len(neg):
        auc = float(np.mean((pos[:, None] > neg[None, :]).astype(float)
                            + 0.5 * (pos[:, None] == neg[None, :]).astype(float)))

    def gate_stats(sel, name):
        g = [r for r in have if sel(r)]; p = [r for r in have if not sel(r)]
        caught = [r for r in g if r["fail"]]
        # 통과군이 비면(게이트가 전부 발화) 통과 통계는 정의되지 않는다 → None.
        # 0.0으로 두면 '통과분에 실패 없음'으로 오독된다(§13 자기검증이 잡은 결함).
        return {"gate": name, "flags": round(len(g) / len(have), 3),
                "n_gated": len(g), "n_passed": len(p),
                "recall": round(len(caught) / max(1, len(fails)), 3) if g else None,
                "precision": round(len(caught) / max(1, len(g)), 3) if g else None,
                "passed_fail_rate": (round(sum(r["fail"] for r in p) / len(p), 3) if p else None),
                "passed_iou_median": med([r["iou"] for r in p]) if p else None}

    res = {
        "spec": "2점 종횡비 불확실성 전파 — 구간 폭 vs 실제 실패(지시 1-bis e).",
        "n": len(rows), "grade": grade, "mc_samples": mc,
        "corner_err_ratio": ratio,
        "overall_fail_rate": round(len(fails) / len(rows), 3),
        "rel_width": {"median_all": med([r["rel_width"] for r in have]),
                      "median_fail": med([r["rel_width"] for r in have if r["fail"]]),
                      "median_ok": med([r["rel_width"] for r in have if not r["fail"]]),
                      "p90_all": round(float(np.percentile(w, 90)), 4) if len(w) else None},
        "correlation": {"pearson": round(pearson, 4) if pearson is not None else None,
                        "spearman": round(spearman, 4) if spearman is not None else None,
                        "auc_width_predicts_failure": round(auc, 4) if auc is not None else None},
        "coverage_of_true_aspect(ci=0.90)": round(
            float(np.mean([r["covered"] for r in have])), 3),
        "gates": [gate_stats(lambda r: r["unresolved"], f"rel_width>{REL_WIDTH_UNRESOLVED}(잠정)")]
                 + [gate_stats(lambda r, t=t: r["rel_width"] > t, f"rel_width>{t}")
                    for t in (0.2, 0.3, 0.6, 1.0)],
        "note": ("구간 폭은 게이트가 아니라 표현이다. 폭이 실패와 상관되면 정량화가 작동하는 것. "
                 "임계는 잠정 — §14 로깅 튜닝 대상."),
    }
    return res


def main():
    res = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "uncertainty_eval.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
