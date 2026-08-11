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


def m_normalize() -> dict | None:
    p = OUT / "tolerance.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))["by_grade"]
    return {g: {"holdout_f1": d[g]["holdout_f1"], "parseable": d[g]["parseable"]} for g in d}


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
        "normalize_holdout": m_normalize(),
        "noise_model_ks": m_noise_model(),
        "time_monotonic": m_monotonic(),
        "speech_translation": m_speech(),
        "camera_fit_error": None,  # stage3
    }
    (ROOT / "stage0" / "out" / "score.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
