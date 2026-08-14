"""분할 검증 — **단일 표본·단일 추정량** 통합 측정 (지시 D-1b-3, 리뷰어 지적 [1][3][4][7][11]).

리뷰어 지적으로 재작성했다. 이전 판은 같은 양(L자 자연 프레임 종횡비 오차)이
`split_eval` 0.143 / `frame_audit` 0.163 / `decompose_2H` 0.190 세 값으로 유통됐다.
원인은 스크립트마다 표본·시드·추정량(역수 동치 적용 여부)이 달랐던 것이다.
→ **여기서 한 번에 다 잰다.** 다른 스크립트는 이 값을 인용한다.

측정 항목(전부 같은 표본에서):
  outer_aspect_err       외곽 종횡비 오차 — 자연 프레임, 역수 동치
  notch_du/dv_err        노치 크기 오차 — **같은 방향 안의 비**(폭÷전체폭, 깊이÷전체깊이)
  notch_u/v_err          노치 모서리 오차 — 게이지 여부를 따로 검사한다
  notch_corner_gauge     모서리 라벨을 4가지로 다 돌려본 뒤 최소 오차(게이지면 0에 가까움)
  hold_rate              복원 성공률 — 중앙값이 **생존 표본 통계**임을 드러낸다
  U·계단 노치도 측정      "노치 2개는 간섭한다"는 주장이 측정에 근거하는지 확인

이론 귀속(리뷰어 지적 [5], 이론서 16.4): 단일 시점에 남는 자유도는 **깊이 방향 아핀변환**이다.
그렇다면 훼손되는 것은 **교차 방향 비**(폭 대 깊이 = 외곽 종횡비)이고, **같은 방향 안의 비**
(노치폭 ÷ 전체폭)는 불변이어야 한다. du와 dv를 따로 재서 이 예측을 시험한다 —
"국소가 전역보다 정확하다"보다 이쪽이 검증 가능한 진술이다.

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
from stage_perspective.rectilinear_split import split, reflex_vertices, outer_box, principal_frame
from stage_perspective.shape_metrics import similarity_iou, bbox_aspect
from stage_perspective.uncertainty import aspect_equiv

OUT = ROOT / "stage0" / "out"


def _q(v, p=50):
    v = [x for x in v if x is not None and np.isfinite(x)]
    return round(float(np.percentile(v, p)), 4) if v else None


def _aspect_err(rec, truth) -> float:
    """역수 동치 상대오차 — 축 라벨은 게이지이므로(D-1) a와 1/a를 같게 본다."""
    r, t = aspect_equiv(rec), aspect_equiv(truth)
    if not np.isfinite(r) or not np.isfinite(t) or t <= 0:
        return float("nan")
    return abs(r - t) / t


def notch_desc(poly):
    """노치 1개의 (corner, u, v, du, dv). 없으면 None."""
    r = split(poly)
    return r.get("notch")


def all_notches(poly) -> list[dict]:
    """노치 **여러 개**를 각각 기술한다(U·계단 검증용, 리뷰어 지적 [7]).
    각 오목 정점에 대해 가장 가까운 상자 모서리 기준 크기 비율을 낸다."""
    P = np.asarray(poly, float)
    idx = reflex_vertices(P)
    box = outer_box(P)
    if not box["ok"] or not idx:
        return []
    A, _R = principal_frame(P)
    lo = np.asarray(box["lo"], float)
    w, h = box["w"], box["h"]
    out = []
    for i in idx:
        r = A[i]
        cx = "-" if (r[0] - lo[0]) < w / 2 else "+"
        cy = "-" if (r[1] - lo[1]) < h / 2 else "+"
        du = (r[0] - lo[0]) / w if cx == "-" else 1.0 - (r[0] - lo[0]) / w
        dv = (r[1] - lo[1]) / h if cy == "-" else 1.0 - (r[1] - lo[1]) / h
        out.append({"corner": cx + cy, "du": float(du), "dv": float(dv),
                    "u": float((r[0] - lo[0]) / w), "v": float((r[1] - lo[1]) / h)})
    return out


def _match_notches(truth_ns, rec_ns):
    """노치를 크기로 최근접 매칭(개수가 같을 때만). 모서리 라벨은 게이지라 위치로 매칭하지 않는다."""
    if len(truth_ns) != len(rec_ns) or not truth_ns:
        return []
    used, pairs = set(), []
    for t in truth_ns:
        best, bi = None, None
        for j, r in enumerate(rec_ns):
            if j in used:
                continue
            d = abs(r["du"] - t["du"]) + abs(r["dv"] - t["dv"])
            if best is None or d < best:
                best, bi = d, j
        if bi is not None:
            used.add(bi); pairs.append((t, rec_ns[bi]))
    return pairs


def run(n=150, seed=0) -> dict:
    ratios = grade_ratios()
    sz = (800.0, 600.0)
    res = {}
    for name, base in _shapes().items():
        res[name] = {}
        t_notches = all_notches(base)
        t_aspect = bbox_aspect(base, "natural")
        for grade in ("precise", "medium"):
            rng = np.random.default_rng(stable_seed("split_eval_v2", name, grade, base=seed))
            oa, du_e, dv_e, u_e, v_e, gauge_e, ious = [], [], [], [], [], [], []
            attempted = held = scope_hit = 0
            for _ in range(n):
                attempted += 1
                truth = base * rng.uniform(3, 8)
                c = truth.mean(0)
                diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
                az = rng.uniform(0, 2 * np.pi)
                el = rng.uniform(np.radians(30), np.radians(60))
                dist = diag * rng.uniform(1.4, 2.2)
                eye = (c[0] + dist * np.cos(az) * np.cos(el),
                       c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.3)
                img = add_corner_noise(
                    _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz),
                    ratios[grade], rng)
                r = recover_orthogonal_polygon(img, sz)
                if not r.get("ok"):
                    continue
                held += 1
                rec = np.asarray(r["recovered"], float)
                if split(rec)["scope"] == split(truth)["scope"]:
                    scope_hit += 1
                oa.append(_aspect_err(bbox_aspect(rec, "natural"), t_aspect))
                ious.append(similarity_iou(truth, rec))
                # 노치 — 개수가 같을 때만 매칭(크기 기준)
                for t, s in _match_notches(all_notches(truth), all_notches(rec)):
                    du_e.append(abs(s["du"] - t["du"]))
                    dv_e.append(abs(s["dv"] - t["dv"]))
                    u_e.append(abs(s["u"] - t["u"]))
                    v_e.append(abs(s["v"] - t["v"]))
                    # 모서리 게이지 검사: 4모서리·축교환까지 허용했을 때 남는 최소 위치오차.
                    # 게이지라면 0에 가까워야 한다(D-1의 대응 탐색과 같은 논리).
                    cands = []
                    for uu, vv in ((s["u"], s["v"]), (1 - s["u"], s["v"]),
                                   (s["u"], 1 - s["v"]), (1 - s["u"], 1 - s["v"]),
                                   (s["v"], s["u"]), (1 - s["v"], s["u"]),
                                   (s["v"], 1 - s["u"]), (1 - s["v"], 1 - s["u"])):
                        cands.append(abs(uu - t["u"]) + abs(vv - t["v"]))
                    gauge_e.append(min(cands))
            res[name][grade] = {
                "attempted": attempted, "held": held,
                "hold_rate": round(held / max(1, attempted), 3),
                "scope_agreement": round(scope_hit / max(1, held), 3),
                "truth_scope": split(base)["scope"], "truth_notches": len(t_notches),
                "outer_aspect_err_median": _q(oa), "outer_aspect_err_p90": _q(oa, 90),
                "similarity_iou_median": _q(ious),
                "notch_du_err_median": _q(du_e), "notch_dv_err_median": _q(dv_e),
                "notch_u_err_median": _q(u_e), "notch_v_err_median": _q(v_e),
                "notch_corner_gauge_residual_median": _q(gauge_e),
                "n_notch_pairs": len(du_e),
            }
    return {
        "spec": "분할 검증 — 단일 표본·단일 추정량 통합(D-1b-3, 리뷰어 지적 반영).",
        "estimator": "자연 프레임 bbox 종횡비 + 역수 동치 상대오차. 노치는 크기 기준 매칭.",
        "by_shape": res,
        "theory_prediction": (
            "이론서 16.4: 단일 시점 잔여 자유도는 깊이 방향 아핀변환. 따라서 훼손되는 것은 "
            "**교차 방향 비**(외곽 종횡비)이고 **같은 방향 안의 비**(노치폭÷전체폭)는 불변이어야 한다. "
            "du·dv를 따로 재서 이 예측을 시험한다."),
        "note": ("중앙값은 **생존 표본 통계**다 — hold_rate를 함께 읽을 것. "
                 "노치 모서리 오차는 게이지 잔차(corner_gauge_residual)와 함께 볼 것."),
    }


def main():
    r = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "split_eval.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
