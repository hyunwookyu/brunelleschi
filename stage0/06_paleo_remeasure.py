"""PaleoSketch 도입 재측정 — DP vs Paleo, 세 지표 동시 (§5.1 채택 검증).

분할이 공통 원인이므로 세 지표(constraint f1 / 폴리곤 IoU / 앵커 depth 오차)가
모두 개선되어야 한다. 하나만 오르면 원인 분석이 틀린 것(사용자 지시).

출력: stage0/out/paleo_remeasure.json
"""
from __future__ import annotations
import json, sys, importlib.util
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.normalize_core import parse_strokes, Graph, compare_matched
from stage1.normalize import normalize_to_ir
from stage2.anchor import apply_ops
from common.grammar import Op

_spec = importlib.util.spec_from_file_location("sg", ROOT / "stage0" / "02_sketchgraphs_render.py")
sg = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(sg)
_mf = importlib.util.spec_from_file_location("mf", ROOT / "stage1" / "make_fixture.py")
mf = importlib.util.module_from_spec(_mf); _mf.loader.exec_module(mf)

TUNED = json.loads((ROOT / "common" / "tuned_tol.json").read_text(encoding="utf-8"))["precise"]
QD = json.loads((ROOT / "stage0" / "out" / "quickdraw_grades.json").read_text(encoding="utf-8"))["noise_params"]


def f1_by_grade(method, n=250, seed=1):
    out = {}
    for grade in ("precise", "medium", "coarse"):
        sg.rng = np.random.default_rng(seed); fs = []; gp = QD[grade]
        for _ in range(n):
            poly = sg.gen_polygon(); tg = sg.truth_graph(poly)
            st = sg.render_noisy(poly, gp["jitter_ratio"], gp["angle_sigma_deg"], gp["closure_gap_ratio"])
            g = parse_strokes([np.array(s) for s in st], TUNED, method=method)
            tinv = Graph(lines=tg.lines, constraints={c for c in tg.constraints if c[0] in sg.CANON})
            rinv = Graph(lines=g.lines, constraints={c for c in g.constraints if c[0] in sg.CANON})
            fs.append(compare_matched(tinv, rinv)["f1"])
        out[grade] = round(float(np.mean(fs)), 4)
    return out


def iou_precise(method):
    from shapely.geometry import Polygon
    ious = []
    for seed in range(30):
        for kind in ("rect", "L"):
            cap = mf.make(kind, "precise", seed=seed)
            truth = Polygon(cap["_truth_poly"]).buffer(0)
            ir, _ = normalize_to_ir(cap, method=method)
            if not ir.volumes:
                continue
            rec = Polygon(ir.volumes[0].footprint).buffer(0)
            u = rec.union(truth).area
            if u:
                ious.append(rec.intersection(truth).area / u)
    return {"iou_median": round(float(np.median(ious)), 4),
            "iou_p10": round(float(np.percentile(ious, 10)), 4), "n": len(ious)}


def anchor_depth_err(method):
    errs = []
    for seed in range(40):
        cap = mf.make("rect", "precise", seed=seed)
        tp = np.array(cap["_truth_poly"], float)
        tw = float(np.ptp(tp[:, 0])); th = float(np.ptp(tp[:, 1]))
        ir, _ = normalize_to_ir(cap, method=method)
        if not ir.volumes or tw < 1 or th < 1:
            continue
        apply_ops(ir, [Op("set", {"id": ir.volumes[0].id, "prop": "width", "value": tw})])
        fp = np.array(ir.volumes[0].footprint, float)
        rw = float(np.ptp(fp[:, 0])); rh = float(np.ptp(fp[:, 1]))
        if rw > 1e-6:
            errs.append(abs(rh - th) / th)
    return {"depth_rel_error_median": round(float(np.median(errs)), 4),
            "depth_rel_error_p90": round(float(np.percentile(errs, 90)), 4), "n": len(errs)}


def main():
    res = {}
    for method in ("dp", "paleo"):
        res[method] = {"constraint_f1": f1_by_grade(method),
                       "polygon_iou_precise": iou_precise(method),
                       "anchor_depth_error": anchor_depth_err(method)}
    # 개선 판정
    dp, pl = res["dp"], res["paleo"]
    improved = {
        "f1_precise": pl["constraint_f1"]["precise"] > dp["constraint_f1"]["precise"],
        "iou_median": pl["polygon_iou_precise"]["iou_median"] > dp["polygon_iou_precise"]["iou_median"],
        "anchor_depth": pl["anchor_depth_error"]["depth_rel_error_median"] < dp["anchor_depth_error"]["depth_rel_error_median"],
    }
    res["improved_all_three"] = all(improved.values())
    res["improved"] = improved
    res["verdict"] = ("세 지표 모두 개선 → 분할이 공통 원인 확증(§5.1 도입 정당)"
                      if all(improved.values()) else
                      "일부만 개선 → 원인 분석 재검토 필요(사용자 지시)")
    (ROOT / "stage0" / "out" / "paleo_remeasure.json").write_text(
        json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
