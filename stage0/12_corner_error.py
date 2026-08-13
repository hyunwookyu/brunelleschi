"""코너 국소화 오차 측정 (지시 0.4 선행) — Track 2 노이즈에 근거를 준다.

발견(지시 0.4 전제 정정): **Track 2는 잉크 노이즈 모델을 쓰지 않는다.**
`stage_perspective/evaluate.py`의 `GRADE_NOISE={L1:2.0, L2:8.0, L3:20.0}`은
획이 아니라 **4 코너점에 직접** 가산하는 픽셀 sigma이며, 손으로 고른 값이라 근거가 없다.
따라서 Track 2는 `jitter_ratio` 단위 오류에 오염되지는 않았으나, **미교정 지반** 위에 있다.

여기서 측정하는 양: 사람이 그린 획을 파서에 통과시켰을 때
  **복원 코너가 의도한 코너에서 얼마나 벗어나는가** / 도형 대각
이것이 Track 2가 코너에 넣어야 할 노이즈의 실측 근거다.
(실획은 정답 코너가 없으므로 새 잉크 모델 합성으로 측정한다. 새 모델은 실획과
 스펙트럼이 겹침을 stage0/11에서 확인했다.)

출력: stage0/out/corner_error.json
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.inknoise import render_ink, load_model
from stage1.normalize import normalize_to_ir

OUT = ROOT / "stage0" / "out"
CANON = 180.0
N = 300


def rect_poly(rng):
    w = rng.uniform(0.45, 0.75) * CANON
    h = rng.uniform(0.35, 0.65) * CANON
    return np.array([[0., 0.], [w, 0.], [w, h], [0., h]])


def match_corners(truth: np.ndarray, rec: np.ndarray) -> list[float]:
    """복원 폴리곤의 각 정점을 가장 가까운 진짜 코너에 대응시켜 거리 반환.
    복원이 4정점이 아닐 수 있으므로(중복 링·과분할) truth 쪽 기준으로 최근접을 찾는다."""
    out = []
    for t in truth:
        d = np.min(np.hypot(*(rec - t).T))
        out.append(float(d))
    return out


def main_sessions(paths):
    """실측 세션의 코너 오차(지시 4.4).
    **정답 코너가 없으므로** 합성처럼 직접 잴 수 없다 → 복원 폴리곤과 원본 잉크 외곽의
    자기정합 거리로 대신한다(stage1/measure_capture와 같은 성격). 절대 비교가 아니라
    Quick,Draw 기반 값과의 **분포 대조**가 목적이다."""
    from common.session_io import load_session, to_capture, session_input_kind
    from stage1.normalize import normalize_to_ir
    rows = {}
    for path in paths:
        sess = load_session(path)
        kind = session_input_kind(sess)
        cap = to_capture(sess, frame="plan")
        ir, meta = normalize_to_ir(cap)
        if not ir.volumes or not meta.get("parseable"):
            continue
        fp = np.asarray(ir.volumes[0].footprint, float)
        pts = np.asarray([[p[0], p[1]] for s in cap["strokes"] for p in s["points"]], float)
        diag = math.hypot(*np.ptp(fp, 0)) or 1.0
        # 복원 코너에서 가장 가까운 입력점까지 거리 / 대각
        d = [float(np.min(np.hypot(*(pts - c).T))) / diag for c in fp]
        rows.setdefault(kind, []).extend(d)
    rep = {"spec": "실측 세션 코너 정합 거리(지시 4.4). 정답 없음 → 자기정합 대용.",
           "by_input_kind": {k: {"n": len(v),
                                 "median": round(float(np.median(v)), 4),
                                 "p90": round(float(np.percentile(v, 90)), 4)}
                             for k, v in rows.items()},
           "compare_with": "stage0/out/corner_error.json (Quick,Draw 합성, 정답 있음)",
           "note": "값의 성격이 달라 직접 비교 불가. 펜/마우스 간 **상대 차이**만 본다."}
    (OUT / "corner_error_sessions.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if args:
        main_sessions(args); return
    OUT.mkdir(parents=True, exist_ok=True)
    model = load_model()
    rng = np.random.default_rng(11)
    res = {}
    for grade, p in sorted(model.items()):
        errs, rel, par = [], [], 0
        for _ in range(N):
            poly = rect_poly(rng)
            diag = math.hypot(*np.ptp(poly, 0))
            strokes = render_ink(poly, p, rng)
            cap = {"frame": "plan", "w": 320, "h": 320,
                   "strokes": [{"points": [[float(x), float(y), i, 0.5] for x, y in st], "pen": "mass"}
                               for i, st in enumerate(strokes)]}
            ir, meta = normalize_to_ir(cap)
            if not ir.volumes or not meta.get("parseable"):
                continue
            par += 1
            rec = np.asarray(ir.volumes[0].footprint, float)
            d = match_corners(poly, rec)
            errs += d
            rel += [x / diag for x in d]
        def q(a, pc): return round(float(np.percentile(a, pc)), 4) if a else None
        res[grade] = {
            "n_parsed": par, "n_total": N,
            "corner_err_over_diag_median": q(rel, 50),
            "corner_err_over_diag_p90": q(rel, 90),
            "corner_err_canon_px_median": q(errs, 50),
            "note": "정준 대각 180 기준. Track 2 적용 시 noise_px = ratio × (이미지상 도형 대각 px)",
        }

    rep = {"spec": "코너 국소화 오차 — Track 2 GRADE_NOISE의 실측 근거(지시 0.4).",
           "finding": "Track 2는 잉크 노이즈 모델 미사용. GRADE_NOISE(2/8/20px)는 임의값이었다.",
           "source": "새 실획기반 잉크 모델(stage0/10) 합성 + stage1 파서 복원 코너",
           "grades": res}
    (OUT / "corner_error.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
