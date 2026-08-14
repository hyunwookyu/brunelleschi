"""분할 처리 검증 (지시 D-1b-2 a·d) — 외곽은 measured로 쓸 수 있는가, 노치는 얼마나 틀리는가.

**멈춤 조건 확인 항목**: "노치 분할이 외곽 종횡비 정확도를 떨어뜨릴 때(분할 자체가 성립하지
않는다는 뜻)". 분할은 복원 결과를 사후에 나누는 것이므로 원리적으로는 복원을 바꾸지 않지만,
**외곽 상자를 어느 프레임에서 잡느냐**가 값을 바꾼다(변 방향 정렬 vs PCA). 실제로 재보고 확인한다.

측정:
  outer_aspect_err  복원 L의 외곽 종횡비 오차 — measured로 쓸 자격이 있는가
  notch_*_err       노치 위치·크기 오차 — prior가 채워야 할 양이 얼마인가
  scope_accuracy    노치 개수 판정이 맞는가(L=1, U/계단=2+)

출력: stage0/out/split_eval.json
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.decompose import _project_polygon, _shapes, recover_orthogonal_polygon
from stage_perspective.noise import grade_ratios, add_corner_noise, stable_seed
from stage_perspective.rectilinear_split import split, notch_count
from stage_perspective.shape_metrics import similarity_iou

OUT = ROOT / "stage0" / "out"


def _q(v, p=50):
    return round(float(np.percentile(v, p)), 4) if len(v) else None


def run(n=150, seed=0) -> dict:
    ratios = grade_ratios()
    shapes = _shapes()
    res = {}
    for name, base in shapes.items():
        res[name] = {}
        for grade in ("precise", "medium"):
            ratio = ratios[grade]
            rng = np.random.default_rng(stable_seed("split_eval", name, grade, base=seed))
            oa_err, nu, nv, ndu, ndv, ious = [], [], [], [], [], []
            scope_hit = 0
            tot = 0
            truth_split = split(base)
            for _ in range(n):
                truth = base * rng.uniform(3, 8)
                c = truth.mean(0)
                diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
                az = rng.uniform(0, 2 * np.pi)
                el = rng.uniform(np.radians(30), np.radians(60))
                dist = diag * rng.uniform(1.4, 2.2)
                eye = (c[0] + dist * np.cos(az) * np.cos(el),
                       c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.3)
                sz = (800.0, 600.0)
                img = add_corner_noise(
                    _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz), ratio, rng)
                r = recover_orthogonal_polygon(img, sz)
                if not r["ok"]:
                    continue
                rec = np.asarray(r["recovered"], float)
                tot += 1
                sp = split(rec)
                tsp = split(truth)
                if sp["scope"] == tsp["scope"]:
                    scope_hit += 1
                if not tsp.get("outer") or not sp.get("outer"):
                    continue
                # 외곽 종횡비 오차 — 역수 동치(축 라벨은 게이지)
                ta, ra = tsp["outer"]["aspect"], sp["outer"]["aspect"]
                oa_err.append(abs(ra - ta) / max(1e-9, ta))
                ious.append(similarity_iou(truth, rec) or 0.0)
                # 노치 오차(노치 1개인 경우만)
                if tsp.get("notch") and sp.get("notch"):
                    t, s = tsp["notch"], sp["notch"]
                    nu.append(abs(s["u"] - t["u"])); nv.append(abs(s["v"] - t["v"]))
                    ndu.append(abs(s["du"] - t["du"])); ndv.append(abs(s["dv"] - t["dv"]))
            res[name][grade] = {
                "n": tot,
                "scope_agreement": round(scope_hit / max(1, tot), 3),
                "truth_scope": truth_split["scope"],
                "outer_aspect_err_median": _q(oa_err), "outer_aspect_err_p90": _q(oa_err, 90),
                "similarity_iou_median": _q(ious),
                "notch_u_err_median": _q(nu), "notch_v_err_median": _q(nv),
                "notch_du_err_median": _q(ndu), "notch_dv_err_median": _q(ndv),
            }
    return {
        "spec": "직교 폴리곤 분할 검증(지시 D-1b-2). 외곽=measured 자격, 노치=prior 필요량.",
        "by_shape": res,
        "note": ("외곽 종횡비 오차가 기존 2H 종횡비 오차(L precise 0.046)와 같은 수준이면 "
                 "분할이 외곽 정확도를 떨어뜨리지 않는 것 — 멈춤 조건 미해당. "
                 "노치 오차는 prior가 채워야 할 양이다(외곽 대비 비율)."),
    }


def main():
    r = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "split_eval.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
