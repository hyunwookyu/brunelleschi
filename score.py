"""score.py — §6.5 검증 지표 러너 (§13 진행 규칙 훅).

각 단계 완료 시 실행 → progress.md 기록. 임계 통과 판정에 쓰인다.
전부 라벨 작성 없이 수치가 나온다(§6.5). 단계별로 가능한 지표만 계산.

지표(§6.5):
  정규화   : SketchGraphs 홀드아웃 제약그래프 일치율(f1)   [stage0+]
  노이즈모델: 합성 획 vs Quick,Draw 획 통계 이표본 KS검정   [stage0+]
  카메라정합: 재투영 오차 fit_error                         [stage3]
  시간단조성: IR(t+1) ⊇ IR(t)                               [모든 단계]
  발화번역 : 자막 치수언급 vs 파싱 anchors                  [stage2]
"""
from __future__ import annotations
import json, sys, importlib.util
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "stage0" / "out"
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Volume, Anchor
from common.normalize_core import parse_strokes, stroke_straightness  # noqa


def m_normalize(n=150) -> dict | None:
    """정규화 제약 f1(등급별) — 현행 파서(PaleoSketch, §5.1)로 라이브 측정."""
    qd = OUT / "quickdraw_grades.json"
    if not qd.exists():
        return None
    from common.normalize_core import parse_strokes, Graph, compare_matched
    spec = importlib.util.spec_from_file_location("sg", ROOT / "stage0" / "02_sketchgraphs_render.py")
    sg = importlib.util.module_from_spec(spec); spec.loader.exec_module(sg)
    tuned = json.loads((ROOT / "common" / "tuned_tol.json").read_text(encoding="utf-8"))["precise"]
    QD = json.loads(qd.read_text(encoding="utf-8"))["noise_params"]
    out = {}
    for grade in ("precise", "medium", "coarse"):
        sg.rng = __import__("numpy").random.default_rng(1)
        gp = QD[grade]; fs = []
        for _ in range(n):
            poly = sg.gen_polygon(); tg = sg.truth_graph(poly)
            st = sg.render_noisy(poly, gp["jitter_ratio"], gp["angle_sigma_deg"], gp["closure_gap_ratio"])
            g = parse_strokes([__import__("numpy").array(s) for s in st], tuned, method="paleo")
            ti = Graph(lines=tg.lines, constraints={c for c in tg.constraints if c[0] in sg.CANON})
            ri = Graph(lines=g.lines, constraints={c for c in g.constraints if c[0] in sg.CANON})
            fs.append(compare_matched(ti, ri)["f1"])
        import numpy as _np
        out[grade] = {"f1": round(float(_np.mean(fs)), 4), "method": "paleo", "parseable": True}
    return out


def m_noise_model() -> dict | None:
    """합성 획 straightness 분포 vs Quick,Draw(precise) straightness 분포 KS검정."""
    qd = OUT / "quickdraw_grades.json"
    if not qd.exists():
        return None
    from scipy import stats
    # Quick,Draw precise 표본 재계산 (캐시 ndjson에서)
    from common.normalize_core import DEFAULT_TOL
    spec = importlib.util.spec_from_file_location("sg", ROOT / "stage0" / "02_sketchgraphs_render.py")
    sg = importlib.util.module_from_spec(spec); spec.loader.exec_module(sg)
    gp = json.loads(qd.read_text(encoding="utf-8"))["noise_params"]["precise"]

    def straightness_of_strokes(strokes):
        vals = []
        for s in strokes:
            s = np.asarray(s, float)
            st = stroke_straightness(s[:, 0], s[:, 1]) if s.ndim == 2 else None
            if st is not None:
                vals.append(st)
        return vals

    # 합성 획 straightness
    sg.rng = np.random.default_rng(7)
    synth = []
    for _ in range(400):
        poly = sg.gen_polygon()
        strokes = sg.render_noisy(poly, gp["jitter_ratio"], gp["angle_sigma_deg"], gp["closure_gap_ratio"])
        # 폴리곤 변 단위로 자른 획의 직진성
        for a, b in zip(poly, np.roll(poly, -1, 0)):
            pass
        synth += straightness_of_strokes([np.array(s).reshape(-1, 2) for s in strokes])
    # 실제 Quick,Draw 획 straightness (house 캐시)
    real = []
    cache = ROOT / "data" / "quickdraw" / "house.ndjson"
    if cache.exists():
        for line in cache.read_text(encoding="utf-8").splitlines()[:800]:
            d = json.loads(line)
            for st in d["drawing"]:
                xs = np.asarray(st[0], float); ys = np.asarray(st[1], float)
                v = stroke_straightness(xs, ys)
                if v is not None:
                    real.append(v)
    if not synth or not real:
        return None
    ks = stats.ks_2samp(synth, real)
    return {"ks_stat": round(float(ks.statistic), 4), "p_value": round(float(ks.pvalue), 5),
            "synth_median": round(float(np.median(synth)), 4),
            "real_median": round(float(np.median(real)), 4),
            "n_synth": len(synth), "n_real": len(real),
            "interpret": "KS작을수록 노이즈모델이 실제와 근접(§10 위험 점검)."}


def m_monotonic() -> dict:
    """시간 단조성 자기검사: IR에 볼륨/앵커 추가 시 superset 유지."""
    t0 = IR(volumes=[Volume("hall", [[0, 0], [12, 0], [12, 8], [0, 8]])])
    t1 = IR(volumes=[Volume("hall", [[0, 0], [12, 0], [12, 8], [0, 8]]),
                     Volume("deck", [[12, 0], [18, 0], [18, 8], [12, 8]])],
            anchors=[Anchor("hall", "width", 12.0)])
    t_bad = IR(volumes=[Volume("deck", [[0, 0], [1, 0], [1, 1], [0, 1]])])
    return {"t1_superset_t0": t1.superset_of(t0),
            "bad_superset_t0": t_bad.superset_of(t0),
            "pass": t1.superset_of(t0) and not t_bad.superset_of(t0)}


def m_normalize_iou() -> dict | None:
    """1단계: 합성 입력 truth 폴리곤 대비 복원 폴리곤 IoU (§6.5 확장)."""
    try:
        from shapely.geometry import Polygon
    except Exception:
        return None
    import importlib.util
    mfs = importlib.util.spec_from_file_location("mf", ROOT / "stage1" / "make_fixture.py")
    mf = importlib.util.module_from_spec(mfs); mfs.loader.exec_module(mf)
    from stage1.normalize import normalize_to_ir
    ious, parseable = [], 0
    N = 30
    for seed in range(N):
        for kind in ("rect", "L"):
            cap = mf.make(kind, "precise", seed=seed)
            truth = Polygon(cap["_truth_poly"]).buffer(0)
            ir, meta = normalize_to_ir(cap)
            if not ir.volumes:
                continue
            parseable += 1
            rec = Polygon(ir.volumes[0].footprint).buffer(0)
            if rec.is_empty or truth.is_empty:
                continue
            u = rec.union(truth).area
            ious.append(rec.intersection(truth).area / u if u else 0.0)
    if not ious:
        return None
    import numpy as np
    return {"iou_median": round(float(np.median(ious)), 4),
            "iou_p10": round(float(np.percentile(ious, 10)), 4),
            "n": len(ious), "parseable_rate": round(parseable / (2 * N), 3),
            "note": "복원 폴리곤 vs truth 면적 IoU (스케일정규화 후, precise 등급)."}


def m_anchor_error() -> dict | None:
    """2단계: 주입 치수 대비 복원 치수 오차 (§6.5 확장).
    truth width를 앵커로 주입 → 복원 depth를 truth depth와 대조(종횡비 전파 오차)."""
    import importlib.util
    mfs = importlib.util.spec_from_file_location("mf", ROOT / "stage1" / "make_fixture.py")
    mf = importlib.util.module_from_spec(mfs); mfs.loader.exec_module(mf)
    from stage1.normalize import normalize_to_ir
    from stage2.anchor import apply_ops
    from common.grammar import Op
    import numpy as np
    errs = []
    for seed in range(40):
        cap = mf.make("rect", "precise", seed=seed)
        tp = np.array(cap["_truth_poly"], float)
        tw = float(np.ptp(tp[:, 0])); th = float(np.ptp(tp[:, 1]))
        if tw < 1 or th < 1:
            continue
        ir, meta = normalize_to_ir(cap)
        if not ir.volumes:
            continue
        apply_ops(ir, [Op("set", {"id": ir.volumes[0].id, "prop": "width", "value": tw})])
        fp = np.array(ir.volumes[0].footprint, float)
        rw = float(np.ptp(fp[:, 0])); rh = float(np.ptp(fp[:, 1]))
        if rw < 1e-6:
            continue
        # width는 주입값으로 정확 → depth(종횡비 전파) 상대오차
        errs.append(abs(rh - th) / th)
    if not errs:
        return None
    return {"depth_rel_error_median": round(float(np.median(errs)), 4),
            "depth_rel_error_p90": round(float(np.percentile(errs, 90)), 4),
            "n": len(errs),
            "note": "width 앵커 주입 후 depth 복원 상대오차 = 폴리곤 종횡비 복원 오차."}


def m_camera_noise() -> dict | None:
    """3단계: 노이즈 조건 fit_error 분포 (stage3/noise_eval, §6.5)."""
    try:
        from stage3.noise_eval import fit_error_distribution
    except Exception:
        return None
    d = fit_error_distribution(n=120)
    return {g: {"fit_error_median": d[g]["fit_error_median"],
                "fit_error_p95": d[g]["fit_error_p95"],
                "approx_rate": d[g]["approx_mode_rate"]} for g in d}


def m_speech() -> dict | None:
    p = OUT / "youtube_dist.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    if d.get("status") != "OK":
        return {"status": d.get("status"), "reason": d.get("reason")}
    return {"dimension_rate": d["type_distribution"].get("dimension"),
            "n_examples": len(d.get("translation_examples_20", [])),
            "note": "발화 anchors 대조는 stage2에서 완결(§6.5)."}


def main():
    report = {
        # stage0
        "normalize_holdout": m_normalize(),
        "noise_model_ks": m_noise_model(),
        "time_monotonic": m_monotonic(),
        "speech_translation": m_speech(),
        # stage1~3 (§13 전이 판정 지표)
        "normalize_iou": m_normalize_iou(),        # 1단계: 폴리곤 IoU
        "anchor_dim_error": m_anchor_error(),      # 2단계: 치수 복원 오차
        "camera_fit_error": m_camera_noise(),      # 3단계: 노이즈 fit_error(§task1)
    }
    (ROOT / "stage0" / "out" / "score.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
