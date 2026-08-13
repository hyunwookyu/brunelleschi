"""0단계 진단 — precise f1 실패 원인 분해 (오라클 절제, §5.2/§5.3).

정규화 파이프라인의 어느 단계가 f1 손실을 유발하는지 누적 오라클로 분해한다:
  분할(DP/정점추출) → 축 클러스터링(지배 프레임) → 직교 스냅 → 제약 추론.

각 단계를 정답(truth)으로 대체하며 f1 회복량(한계 기여)을 측정:
  full            : 획 → 전 파이프라인
  +seg            : 분할을 truth 정점으로 대체 (프레임탐지+스냅+추론 유지)
  +seg+frame      : 프레임도 truth로 대체 (스냅+추론 유지)
  +seg+frame+snap : 스냅도 생략(정답 축정렬 정점 직접) → 추론 상한

한계 기여:
  분할        = f1(+seg) - f1(full)
  축클러스터링 = f1(+seg+frame) - f1(+seg)
  스냅        = f1(+seg+frame+snap) - f1(+seg+frame)
  추론 상한잔차 = 1 - f1(+seg+frame+snap)

분할이 주원인이면 PaleoSketch 인식기 도입 검토(§5.1).
출력: stage0/out/failure_decomp.json
"""
from __future__ import annotations
import json, sys, importlib.util
from pathlib import Path
import numpy as np
from common.inknoise import render_for_grade   # 실획 기반 노이즈(지시 6)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.normalize_core import (Line, Graph, compare_matched, DEFAULT_TOL,
                                   _dominant_frame, _ortho_snap_chain, _infer, parse_strokes)

_spec = importlib.util.spec_from_file_location("sg02", ROOT / "stage0" / "02_sketchgraphs_render.py")
sg = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(sg)
CANON = sg.CANON


def _true_frame(poly: np.ndarray) -> float:
    """직교 폴리곤의 지배 프레임(첫 변 각) mod 90 — 정답 프레임."""
    p0, p1 = poly[0], poly[1]
    import math
    return math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0])) % 90.0


def _graph_from_verts(verts: np.ndarray, tol, frame=None, do_snap=True) -> Graph:
    """정점 → (선택적 스냅) → 라인 → 제약추론. parse_strokes 3~5단계 미러."""
    verts = np.asarray(verts, float)
    closed = len(verts) >= 3 and np.hypot(*(verts[0] - verts[-1])) <= tol["coincident_dist"]
    if not closed:                       # 닫아줌(오라클 정점은 폐곡선)
        verts = np.vstack([verts, verts[0]]); closed = True
    if do_snap:
        fr = frame if frame is not None else _dominant_frame(
            [Line(tuple(verts[i]), tuple(verts[i + 1])) for i in range(len(verts) - 1)],
            tol["axis_cluster_deg"])
        verts = _ortho_snap_chain(verts, fr, tol["ortho_snap_deg"], closed)
    lines = [Line(tuple(verts[i]), tuple(verts[i + 1])) for i in range(len(verts) - 1)]
    lines = [l for l in lines if l.length >= tol["min_segment_len"]]
    g = Graph(lines=lines); _infer(g, tol)
    return g


def _score(truth: Graph, rec: Graph) -> float:
    tinv = Graph(lines=truth.lines, constraints={c for c in truth.constraints if c[0] in CANON})
    rinv = Graph(lines=rec.lines, constraints={c for c in rec.constraints if c[0] in CANON})
    return compare_matched(tinv, rinv)["f1"]


def run(grade_params, tol, n=250, seed=0):
    sg.rng = np.random.default_rng(seed)
    acc = {"full": [], "seg": [], "seg_frame": [], "seg_frame_snap": []}
    for _ in range(n):
        poly = sg.gen_polygon()
        tg = sg.truth_graph(poly)
        strokes = render_for_grade(poly, "precise", sg.rng)  # 기준선 재수립(지시 6)
        # full
        gf = parse_strokes([np.array(s) for s in strokes], tol)
        acc["full"].append(_score(tg, gf))
        # +seg (truth 정점, 프레임 탐지 + 스냅)
        acc["seg"].append(_score(tg, _graph_from_verts(poly, tol, frame=None, do_snap=True)))
        # +seg+frame (truth 프레임)
        fr = _true_frame(poly)
        acc["seg_frame"].append(_score(tg, _graph_from_verts(poly, tol, frame=fr, do_snap=True)))
        # +seg+frame+snap (스냅 생략, 정답 정점 직접 추론)
        acc["seg_frame_snap"].append(_score(tg, _graph_from_verts(poly, tol, do_snap=False)))
    return {k: float(np.mean(v)) for k, v in acc.items()}


def main():
    qd = json.loads((ROOT / "stage0" / "out" / "quickdraw_grades.json").read_text(encoding="utf-8"))
    tuned = json.loads((ROOT / "common" / "tuned_tol.json").read_text(encoding="utf-8"))
    gp = qd["noise_params"]["precise"]
    tol = tuned.get("precise", DEFAULT_TOL)
    m = run(gp, tol, n=250)

    contrib = {
        "segmentation": round(m["seg"] - m["full"], 4),
        "axis_clustering": round(m["seg_frame"] - m["seg"], 4),
        "ortho_snap": round(m["seg_frame_snap"] - m["seg_frame"], 4),
        "inference_ceiling_residual": round(1.0 - m["seg_frame_snap"], 4),
    }
    total_gap = round(1.0 - m["full"], 4)
    dominant = max(contrib, key=lambda k: contrib[k])
    result = {
        "spec": "precise f1 실패 원인 분해(오라클 절제)",
        "f1_cumulative": {k: round(v, 4) for k, v in m.items()},
        "marginal_contribution": contrib,
        "total_gap_from_1.0": total_gap,
        "dominant_cause": dominant,
        "note": "분할(segmentation)이 최대면 PaleoSketch 인식기 도입 검토(§5.1). "
                "user의 3분류: 분할=segmentation, 축클러스터링=axis_clustering(+ortho_snap), 추론=inference_ceiling_residual.",
    }
    (ROOT / "stage0" / "out" / "failure_decomp.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
