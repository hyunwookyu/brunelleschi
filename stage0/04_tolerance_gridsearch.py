"""0단계 항목 4 — tolerance 그리드 서치 하네스 (§6.4, §5.3).

조정 대상은 tolerance 스칼라 ~10개뿐(§6.4). 판별기/합성루프/자동반복은 과설계 →
좌표하강 그리드 서치로 등급별 최적 tolerance를 찾는다. 몇 분 내 종료.

목적함수 = SketchGraphs 호환 정답 대비 정준제약 f1 (stage0 항목2 하네스).
등급별 최적 f1이 임계 미만이면 '파싱 불가 경계'(§5.3): 관계만 받는다.

산출:
  stage0/out/tolerance.json      등급별 최적 tolerance + f1
  common/tuned_tol.json          파서가 로드할 등급별 확정 tolerance
"""
from __future__ import annotations
import json, sys, importlib.util
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stage0" / "out"
sys.path.insert(0, str(ROOT))
from common.normalize_core import DEFAULT_TOL

# 항목2 하네스 로드
_spec = importlib.util.spec_from_file_location("sg02", ROOT / "stage0" / "02_sketchgraphs_render.py")
sg = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(sg)

# 좌표하강 후보 그리드 (영향 큰 스칼라 위주)
GRID = {
    "dp_epsilon":          [10, 15, 20, 25, 30, 38],
    "min_segment_len":     [8, 12, 16, 22, 30],
    "coincident_dist":     [12, 20, 28, 38],
    "ortho_snap_deg":      [20, 28, 36, 44],
    "collinear_merge_deg": [12, 20, 30],
    "axis_cluster_deg":    [15, 25, 35],
    "resample_spacing":    [3, 5, 8],
    "perpendicular_deg":   [6, 10, 15],
}
N_EVAL = 120
PARSEABLE_F1 = 0.35    # §5.3 경계: 이 미만이면 기하 불가, 관계만


def objective(grade_params, tol, seed=0) -> float:
    sg.rng = np.random.default_rng(seed)
    s = sg.run(N_EVAL, {"g": grade_params}, tol)["g"]
    return s["f1"]


def coordinate_descent(grade_params, passes=2):
    tol = dict(DEFAULT_TOL)
    best = objective(grade_params, tol)
    for _ in range(passes):
        for key, cands in GRID.items():
            base = tol[key]
            scored = []
            for c in cands + [base]:
                t2 = dict(tol); t2[key] = c
                scored.append((objective(grade_params, t2), c))
            f, c = max(scored, key=lambda x: x[0])
            if f >= best:
                best, tol[key] = f, c
    return tol, round(best, 4)


def main():
    qd = json.loads((OUT / "quickdraw_grades.json").read_text(encoding="utf-8"))
    gp = qd["noise_params"]
    by_grade, tuned = {}, {}
    for grade in ("precise", "medium", "coarse"):
        tol, f1 = coordinate_descent(gp[grade])
        # 홀드아웃(다른 시드)로 재평가 → 과적합 점검
        hold = objective(gp[grade], tol, seed=999)
        parseable = f1 >= PARSEABLE_F1
        by_grade[grade] = {
            "best_f1": f1, "holdout_f1": round(hold, 4),
            "parseable": parseable,
            "tolerance": {k: round(float(v), 3) for k, v in tol.items()},
        }
        tuned[grade] = tol
        print(f"{grade:8s} f1={f1:.3f} holdout={hold:.3f} "
              f"parseable={parseable} dp_eps={tol['dp_epsilon']} min_seg={tol['min_segment_len']}")

    result = {
        "spec": "§6.4 tolerance 그리드 서치(좌표하강); §5.3 파싱가능 경계",
        "objective": "SketchGraphs-호환 정준제약 f1",
        "parseable_threshold": PARSEABLE_F1,
        "by_grade": by_grade,
        "boundary_note": "parseable=False 등급은 '기하 불가, 관계만'(§5.3) 정상 동작.",
    }
    (OUT / "tolerance.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "common" / "tuned_tol.json").write_text(
        json.dumps({g: {k: float(v) for k, v in t.items()} for g, t in tuned.items()},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n-> stage0/out/tolerance.json, common/tuned_tol.json")


if __name__ == "__main__":
    main()
