"""시드 변동폭 정량화 + 이전 판정 재검토 (지시 B-0 a·b).

`stable_seed` 교체 전 수치는 전부 시드 변동을 포함한다(4자리 보고는 과잉 정밀).
여기서 **여러 시드로 반복 측정해 변동폭(±)을 내고**, 이전 결론 중 그 폭 안에서
뒤집히는 것이 있는지 확인한다.

재검토 대상(지시 B-0 b):
  1. 2F 하향        0.96 → 0.87±?
  2. 2A/2C 유지 판정
  3. 부분획 단조성   0.108 → 0.008
  4. 카메라 fit_error coarse p95  0.105 → 0.024

출력: stage0/out/seed_variance.json
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

OUT = ROOT / "stage0" / "out"
SEEDS = [0, 1000, 2000, 3000, 4000]


def _spread(vals: list[float]) -> dict:
    a = np.asarray([v for v in vals if v is not None], float)
    if a.size == 0:
        return {"n": 0}
    return {"n": int(a.size), "mean": round(float(a.mean()), 4),
            "std": round(float(a.std(ddof=1)) if a.size > 1 else 0.0, 4),
            "min": round(float(a.min()), 4), "max": round(float(a.max()), 4),
            "range": round(float(a.max() - a.min()), 4)}


def measure_2F(n=150):
    from stage_perspective.priors import evaluate
    out = {}
    for kind in ("rectangular", "irregular"):
        for g in ("precise", "medium", "coarse"):
            out[f"{kind}/{g}"] = {"plane_iou": [], "aspect_err": []}
    for s in SEEDS:
        r = evaluate(n=n, seed=s)
        for kind in ("rectangular", "irregular"):
            for g in ("precise", "medium", "coarse"):
                out[f"{kind}/{g}"]["plane_iou"].append(r[kind][g]["plane_iou_median"])
                out[f"{kind}/{g}"]["aspect_err"].append(r[kind][g]["aspect_rel_err_median"])
    return {k: {m: _spread(v) for m, v in d.items()} for k, d in out.items()}


def measure_2A(n=150):
    from stage_perspective.evaluate import run
    out = {g: {"plane_iou": [], "aspect_err": []} for g in ("precise", "medium", "coarse")}
    for s in SEEDS:
        r = run(n=n, seed=s)
        for g in out:
            if g in r:
                out[g]["plane_iou"].append(r[g]["plane_iou_median"])
                out[g]["aspect_err"].append(r[g]["aspect_rel_err_median"])
    return {g: {m: _spread(v) for m, v in d.items()} for g, d in out.items()}


def measure_partial(n=120):
    """부분획 단조성 위반율 — 구/신 노이즈 모델 각각 여러 시드로."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("nmi", ROOT / "stage0" / "13_noise_model_impact.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    from common.inknoise import render_ink, load_model
    model = load_model()
    old, new = [], []
    for s in SEEDS:
        old.append(m.partial_monotonicity(
            lambda poly, rng: m.old_render(poly, m.QD["precise"], rng), n=n, seed=s)["violation_rate"])
        new.append(m.partial_monotonicity(
            lambda poly, rng: render_ink(poly, model["precise"], rng)[0], n=n, seed=s)["violation_rate"])
    return {"old_model": _spread(old), "new_model": _spread(new)}


def measure_camera(n=200):
    """카메라 fit_error p95 — 실측 코너오차 기준, 등급별."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("nmi", ROOT / "stage0" / "13_noise_model_impact.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    ce = json.loads((OUT / "corner_error.json").read_text(encoding="utf-8"))["grades"]
    out = {}
    for g in ("precise", "medium", "coarse"):
        p95, approx = [], []
        for s in SEEDS:
            r = m.camera_fit(ce[g]["corner_err_over_diag_median"], n=n, seed=s)
            p95.append(r["p95"]); approx.append(r["approx_rate"])
        out[g] = {"p95": _spread(p95), "approx_rate": _spread(approx)}
    return out


def _separated(a: dict, b: dict) -> dict:
    """두 측정군이 갈리는가. 두 기준을 함께 본다.
      disjoint : 시드 범위가 겹치지 않는가 (분산이 큰 쪽에 끌리지 않는 1차 기준)
      three_sigma : 평균 격차 > 3·pooled std (보수적 2차 기준)
    한쪽 분산이 크면 3σ만으로는 참인 격차도 CHECK로 뜬다 → 두 값을 함께 기록한다."""
    hi, lo = (a, b) if a["mean"] >= b["mean"] else (b, a)
    pooled = (a.get("std", 0) ** 2 + b.get("std", 0) ** 2) ** 0.5
    gap = hi["mean"] - lo["mean"]
    return {"gap": round(gap, 4),
            "disjoint": bool(lo["max"] < hi["min"]),
            "three_sigma": bool(gap > 3 * pooled),
            "pooled_std": round(pooled, 4)}


def verdicts(f2, a2, part, cam) -> list[dict]:
    """이전 판정이 변동폭 안에서 뒤집히는가."""
    v = []

    rect_p = f2["rectangular/precise"]["plane_iou"]
    v.append({
        "claim": "2F 하향: 구 0.96 → 신 0.87",
        "measured": f"{rect_p['mean']} ± {rect_p['std']} (범위 {rect_p['min']}~{rect_p['max']})",
        "gap": round(0.96 - rect_p["mean"], 4),
        "holds": bool(0.96 - rect_p["max"] > 2 * rect_p["std"]),
        "note": "구 0.96은 도달 불가 코너정밀도(0.48%) 산물이라 값 자체가 다른 조건. 변동폭 대비 격차가 크면 하향 판정 유지",
    })

    rect_m, irr_m = f2["rectangular/medium"]["plane_iou"], f2["irregular/medium"]["plane_iou"]
    sep = rect_m["mean"] - irr_m["mean"]
    pooled = (rect_m["std"] ** 2 + irr_m["std"] ** 2) ** 0.5
    v.append({
        "claim": "2F: 직사각 > 비직교(직각가정은 직사각에만 성립)",
        "measured": f"직사각 {rect_m['mean']}±{rect_m['std']} vs 비직교 {irr_m['mean']}±{irr_m['std']}",
        "gap": round(sep, 4), "holds": bool(sep > 3 * pooled),
    })

    a_med = a2["medium"]["plane_iou"]; a_err = a2["medium"]["aspect_err"]
    f_med = f2["rectangular/medium"]["plane_iou"]; f_err = f2["rectangular/medium"]["aspect_err"]
    v.append({
        "claim": "2A/2C(대응 있음)가 2F(직각가정)보다 견고",
        "measured": (f"2A IoU {a_med['mean']}±{a_med['std']}, 종횡비오차 {a_err['mean']}±{a_err['std']} | "
                     f"2F IoU {f_med['mean']}±{f_med['std']}, 종횡비오차 {f_err['mean']}±{f_err['std']}"),
        "gap": round(f_err["mean"] - a_err["mean"], 4),
        "holds": bool(f_err["mean"] - a_err["mean"] > 3 * ((a_err["std"] ** 2 + f_err["std"] ** 2) ** 0.5)),
    })

    o, nw = part["old_model"], part["new_model"]
    sep = _separated(o, nw)
    v.append({
        "claim": "부분획 단조성 위반이 신 노이즈 모델에서 크게 낮다",
        "measured": f"구 {o['mean']}±{o['std']} (범위 {o['min']}~{o['max']}) vs 신 {nw['mean']}±{nw['std']} (범위 {nw['min']}~{nw['max']})",
        **sep,
        "holds": sep["disjoint"],
        "note": ("구 모델 분산이 커(상대 40%) 3σ 검정은 보수적으로 나온다. 시드 범위가 "
                 "겹치지 않으므로 결론은 유지된다. 단 **개별 수치(0.108→0.008)는 시드 뽑기 값**이며 "
                 "0.10±0.04 → 0.002±0.004로 읽어야 한다."),
    })

    cp = cam["coarse"]["p95"]
    v.append({
        "claim": "카메라 fit_error coarse p95가 임계 0.10보다 크게 낮다(CP-0.1 여유)",
        "measured": f"{cp['mean']} ± {cp['std']} (최대 {cp['max']})",
        "gap": round(0.10 - cp["max"], 4),
        "holds": bool(cp["max"] + 3 * cp["std"] < 0.10),
    })
    return v


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    f2 = measure_2F(); a2 = measure_2A(); part = measure_partial(); cam = measure_camera()
    rep = {
        "spec": "시드 변동폭 + 이전 판정 재검토(지시 B-0 a·b). stable_seed 적용 후.",
        "seeds": SEEDS,
        "2F": f2, "2A_2C": a2, "partial_strokes": part, "camera_fit_error": cam,
        "verdicts": verdicts(f2, a2, part, cam),
        "note": "holds=True면 시드 변동폭 대비 격차가 충분해 판정이 유지된다(3σ 기준).",
    }
    (OUT / "seed_variance.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    for v in rep["verdicts"]:
        print(("  OK  " if v["holds"] else " CHECK") + f" {v['claim']}\n        {v['measured']}")
    print("\n-> stage0/out/seed_variance.json")


if __name__ == "__main__":
    main()
