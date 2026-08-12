"""부분 획(미완성) 검증 — 5단계 진입 전 필수 (사용자 지시 2026-08-12).

완성 닫힌 윤곽만 검증한 채 관계 추론에 들어가면 '그리는 도중의 인접 판정'이 무너진다.
SketchGraphs 렌더에 획 순서를 부여하고 앞에서 n%만 남긴 미완성 입력으로:
  (a) 파서가 죽지 않는지 (크래시 0)
  (b) IR(t+1) ⊇ IR(t) 단조성 (더 그릴수록 IR은 자라기만)
  (c) 열린 윤곽에서 폴리곤 복원이 어떻게 실패하는지
을 측정한다.

출력: stage0/out/partial_strokes.json
"""
from __future__ import annotations
import json, sys, importlib.util, traceback
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage1.normalize import normalize_to_ir
from stage4.multiplex import multiplex
from ir.schema import IR

_sg = importlib.util.spec_from_file_location("sg", ROOT / "stage0" / "02_sketchgraphs_render.py")
sg = importlib.util.module_from_spec(_sg); _sg.loader.exec_module(sg)
_mm = importlib.util.spec_from_file_location("mm", ROOT / "stage4" / "make_multi.py")
mm = importlib.util.module_from_spec(_mm); _mm.loader.exec_module(mm)

FRACS = [30, 50, 70, 90, 100]


def _truncate_one(stroke: np.ndarray, frac: int) -> np.ndarray:
    k = max(2, int(len(stroke) * frac / 100))
    return stroke[:k]


def _truncate_capture(cap: dict, frac: int) -> dict:
    """다중 획을 획 순서대로 총점의 frac%까지 — 마지막 걸치는 획은 부분만(그리는 중)."""
    strokes = [s for s in cap["strokes"] if s.get("pen", "mass") == "mass"]
    total = sum(len(s["points"]) for s in strokes)
    cutoff = int(total * frac / 100)
    out, acc = [], 0
    for s in strokes:
        n = len(s["points"])
        if acc + n <= cutoff:
            out.append(s); acc += n
        else:
            take = cutoff - acc
            if take >= 2:
                out.append({**s, "points": s["points"][:take]})
            break
    return {**cap, "strokes": out}


def single_volume_partial(n_samples=60):
    """단일 볼륨: 순서 있는 한 획을 앞 n%만. 크래시·복원상태·열린윤곽 실패양상."""
    crashes = 0
    per_frac = {f: {"parseable": 0, "n_lines": [], "resid": []} for f in FRACS}
    mono_viol = 0
    sg.rng = np.random.default_rng(0)
    for _ in range(n_samples):
        poly = sg.gen_polygon()
        gp = json.loads((ROOT / "stage0" / "out" / "quickdraw_grades.json").read_text(encoding="utf-8"))["noise_params"]["precise"]
        stroke = np.array(sg.render_noisy(poly, gp["jitter_ratio"], gp["angle_sigma_deg"], gp["closure_gap_ratio"])[0])
        seq = []
        for f in FRACS:
            cap = {"frame": "p", "w": 640, "h": 520,
                   "strokes": [{"points": _truncate_one(stroke, f).tolist(), "pen": "mass"}]}
            try:
                ir, meta = normalize_to_ir(cap)
            except Exception:
                crashes += 1; traceback.print_exc(); continue
            seq.append(ir)
            if meta.get("parseable"):
                per_frac[f]["parseable"] += 1
            per_frac[f]["n_lines"].append(meta.get("n_lines", 0))
            per_frac[f]["resid"].append(meta.get("fit_residual", 1.0))
        # 단조성: 연속 절단에서 IR이 자라기만(볼륨 집합 축소 없음)
        for a, b in zip(seq, seq[1:]):
            if not b.superset_of(a):
                mono_viol += 1
    summary = {}
    for f in FRACS:
        d = per_frac[f]
        summary[f] = {"parseable_rate": round(d["parseable"] / n_samples, 3),
                      "n_lines_median": int(np.median(d["n_lines"])) if d["n_lines"] else 0,
                      "fit_resid_median": round(float(np.median(d["resid"])), 4) if d["resid"] else None}
    return {"crashes": crashes, "monotonicity_violations": mono_viol,
            "n_samples": n_samples, "by_frac": summary}


def multi_volume_partial(n_samples=30):
    """다중 볼륨 증분 드로잉: 총점 frac%까지. 볼륨 수 증가·단조성·ID 안정성."""
    crashes, mono_viol, id_shift = 0, 0, 0
    vol_counts = {f: [] for f in FRACS}
    for seed in range(n_samples):
        cap = mm.make(seed=seed)
        seq = []
        for f in FRACS:
            tc = _truncate_capture(cap, f)
            try:
                ir, _ = multiplex(tc)
            except Exception:
                crashes += 1; continue
            seq.append(ir)
            vol_counts[f].append(len(ir.volumes))
        for a, b in zip(seq, seq[1:]):
            if not b.superset_of(a):
                mono_viol += 1
                # ID 이동인지 확인(같은 물리 볼륨이 다른 id)
                if len(b.volumes) >= len(a.volumes):
                    id_shift += 1
    return {"crashes": crashes, "monotonicity_violations": mono_viol,
            "id_shift_suspected": id_shift, "n_samples": n_samples,
            "vol_count_median_by_frac": {f: int(np.median(v)) if v else 0 for f, v in vol_counts.items()}}


def main():
    single = single_volume_partial()
    multi = multi_volume_partial()
    # 열린 윤곽 실패 양상 해석
    open_fail = ("n<100(열린 윤곽): recognize_rectilinear가 런-교차로 강제 폐합 → "
                 "부분 사각형이 왜곡 폴리곤. fit_residual 게이트(FIT_MAX)로 상당수 '관계만'(§5.3)으로 반려. "
                 "완성될수록 parseable↑, n_lines가 정답 변수로 수렴.")
    result = {
        "spec": "부분 획(미완성) 검증 — 5단계 진입 전(그리는 도중 인접 판정 대비)",
        "fracs_percent": FRACS,
        "single_volume": single,
        "multi_volume": multi,
        "open_contour_failure_mode": open_fail,
        "verdict_crash_free": single["crashes"] == 0 and multi["crashes"] == 0,
        "note_id_stability": "multiplex는 절단마다 좌상단 정렬로 id 재부여 → 드로잉 순서≠정렬 순서면 "
                             "id 이동 가능(단조성 위반의 원인). 증분 드로잉(5·6단계)에서 안정 id 필요 시 보완 대상.",
    }
    (ROOT / "stage0" / "out" / "partial_strokes.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
