"""축 뒤바뀜 — 8way가 두 해를 구분하는가 (지시 B-1 a).

뒤바뀜은 28.75% 발생하고 그때 평면 IoU 0.527(정상 0.838) — 2F 최대 식별 오차원이다.
대응 수준을 올리기 전에 **기하적으로 구분 가능한지**부터 확인한다.

측정: 같은 이미지에 대해
  err(a)    = 복원 종횡비 a로 맞춘 재투영 오차
  err(1/a)  = 역수 해로 맞춘 재투영 오차
두 값의 차이가 유의하면 **선택 규칙을 개선할 여지가 있다**.
차이가 없으면 기하적으로 구분 불가이므로 두 해를 모두 남기고 사용자에게 묻는 수밖에 없다(B-1 b).

출력: stage0/out/axis_probe.json
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.decompose import _project_polygon
from stage_perspective.priors import rect, recover_plane_rightangle
from stage3.camera import fit_camera
from stage_perspective.noise import grade_ratios, add_corner_noise, stable_seed
from stage_perspective.reconstruct import _norm, _poly_iou

OUT = ROOT / "stage0" / "out"


def fit_err(aspect: float, image4, img_size) -> float | None:
    r = fit_camera(rect(aspect), np.asarray(image4, float), img_size)
    return float(r.fit_error) if r.ok and r.fit_error is not None else None


def run(n=300, grade="medium", seed=0):
    rng = np.random.default_rng(stable_seed("axis_probe", grade, base=seed))
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
        img = add_corner_noise(_project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz),
                               ratio, rng)
        r = recover_plane_rightangle(img, sz)
        if not r["ok"]:
            continue
        a = float(r["aspect"])
        e_a, e_inv = fit_err(a, img, sz), fit_err(1.0 / a, img, sz)
        if e_a is None or e_inv is None:
            continue
        iou = _poly_iou(_norm(truth), _norm(np.array(r["recovered_plane"])))
        flipped = abs(a - 1.0 / a_true) < abs(a - a_true)
        # 두 해의 재투영 오차 차이(상대). 0에 가까우면 기하가 구분하지 못한다.
        denom = max(1e-12, min(e_a, e_inv))
        rows.append({"a_true": a_true, "a_rec": a, "flipped": bool(flipped), "iou": float(iou),
                     "err_chosen": e_a, "err_alt": e_inv,
                     "rel_diff": float(abs(e_a - e_inv) / denom),
                     "chose_lower": bool(e_a <= e_inv),
                     "el_deg": float(np.degrees(el))})

    def q(vals, p):
        return round(float(np.percentile(vals, p)), 6) if len(vals) else None

    rel = [r["rel_diff"] for r in rows]
    flipped = [r for r in rows if r["flipped"]]
    ok = [r for r in rows if not r["flipped"]]

    # 뒤바뀜 케이스에서 '더 낮은 오차'를 골랐는가 = 선택 규칙이 실제로 작동하는가
    res = {
        "spec": "축 뒤바뀜 — 8way가 두 해를 구분하는가(지시 B-1 a).",
        "n": len(rows), "grade": grade, "corner_err_ratio": ratio,
        "flip_rate": round(len(flipped) / max(1, len(rows)), 4),
        "iou_median": {"flipped": q([r["iou"] for r in flipped], 50),
                       "not_flipped": q([r["iou"] for r in ok], 50)},
        "reproj_rel_diff_between_two_solutions": {
            "median": q(rel, 50), "p90": q(rel, 90), "max": q(rel, 100),
            "frac_below_1pct": round(float(np.mean([x < 0.01 for x in rel])), 4),
            "frac_below_10pct": round(float(np.mean([x < 0.10 for x in rel])), 4),
        },
        "chose_lower_error_rate": round(float(np.mean([r["chose_lower"] for r in rows])), 4),
        "elevation_of_flipped": {"median": q([r["el_deg"] for r in flipped], 50),
                                 "median_not_flipped": q([r["el_deg"] for r in ok], 50)},
        "note": ("두 해의 재투영 오차가 사실상 같으면(rel_diff≈0) 기하가 구분하지 못한다는 뜻 → "
                 "선택 규칙 개선 불가, 두 해를 남기고 사용자에게 묻는다(B-1 b)."),
    }
    return res


def run_by_view_type(n=200, grade="medium", seed=0):
    """투시 종류별 축 모호 정도(지시 B-1 d).

    1점: 한 방향이 **화면 평행**(소실점 무한)이라 이미지에서 두 방향이 구별된다 → 모호 약함
    2점: 두 방향 모두 소실점을 가져 rect(a)/rect(1/a)가 동점 → 모호 강함
    방위각을 축에 정렬(0°)하면 1점에 가깝고, 45°면 2점에 가깝다.
    """
    ratio = grade_ratios().get(grade, 0.0269)
    out = {}
    for name, az_fixed in (("near_1pt(az≈0°)", 0.0), ("mid(az≈22°)", np.radians(22)),
                           ("2pt(az≈45°)", np.radians(45))):
        rng = np.random.default_rng(stable_seed("axis_view", name, base=seed))
        flips = 0; tot = 0
        for _ in range(n):
            a_true = rng.uniform(0.4, 2.5)
            truth = rect(a_true) * rng.uniform(3, 9)
            c = truth.mean(0)
            diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
            az = az_fixed + rng.normal(0, np.radians(3))
            el = rng.uniform(np.radians(20), np.radians(65))
            dist = diag * rng.uniform(1.3, 2.5)
            eye = (c[0] + dist * np.cos(az) * np.cos(el),
                   c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.2)
            sz = (800.0, 600.0)
            img = add_corner_noise(_project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz),
                                   ratio, rng)
            r = recover_plane_rightangle(img, sz)
            if not r["ok"]:
                continue
            tot += 1
            a = float(r["aspect"])
            if abs(a - 1.0 / a_true) < abs(a - a_true):
                flips += 1
        out[name] = {"n": tot, "flip_rate": round(flips / max(1, tot), 4)}
    return out


def main():
    r = run()
    r["by_view_type"] = run_by_view_type()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "axis_probe.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
