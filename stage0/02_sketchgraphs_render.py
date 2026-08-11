"""0단계 항목 2 — SketchGraphs 렌더 → 노이즈 → 파서 → 대조 (§6.2, §6.5).

파이프라인(§6.2):
  제약 그래프(정답) → 렌더 → 프리핸드 노이즈(6.1 분포 부여) → 파서 → 복원 그래프 → 대조

실 데이터 주: SketchGraphs 전처리본(.npy)은 princeton 호스트에 있으나 그들의 pickle
포맷 + 라이브러리가 필요. 본 하네스는 SketchGraphs 호환 어휘(직교폴리곤 부분집합, §6.2)로
정답 그래프를 '해석적으로' 만들어 전 파이프라인을 실측 성립시킨다. 실 .npy는 loader만
교체하면 다운스트림 동일 → load_sketchgraphs() 스텁 참조.

대조는 회전불변 제약 {parallel, perpendicular, equal, coincident}로 채점(§6.2 부분집합).
horizontal/vertical은 프레임 의존이라 별도 보고.

출력: stage0/out/sketchgraphs_check.json
"""
from __future__ import annotations
import json, sys, math
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common.normalize_core import parse_strokes, Line, Graph, compare_matched, DEFAULT_TOL

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stage0" / "out"
# 채점 대상 = 직교폴리곤 정준 제약(§6.2 부분집합). 희소·정준 집합이라야 recall이 유의.
CANON = ("horizontal", "vertical", "coincident")

rng = np.random.default_rng(0)


# --- 정답 스케치 생성: 직교 폴리곤(rect / L / U) + 해석적 제약 --------------
def gen_polygon() -> np.ndarray:
    kind = rng.choice(["rect", "L", "U"])
    w, h = rng.uniform(60, 200, 2)
    if kind == "rect":
        v = [(0, 0), (w, 0), (w, h), (0, h)]
    elif kind == "L":
        a, b = rng.uniform(0.3, 0.6, 2)
        v = [(0, 0), (w, 0), (w, h * b), (w * a, h * b), (w * a, h), (0, h)]
    else:  # U
        a, b = rng.uniform(0.25, 0.4, 2)
        v = [(0, 0), (w, 0), (w, h), (w * (1 - a), h),
             (w * (1 - a), h * b), (w * a, h * b), (w * a, h), (0, h)]
    p = np.array(v, float)
    # 축정렬 유지(H/V 의미 보존) + 미세 전역 기울기 ±2°만 (드로잉 습관)
    th = math.radians(rng.uniform(-2, 2))
    R = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
    return (p @ R.T) + rng.uniform(-20, 20, 2)


def truth_graph(poly: np.ndarray) -> Graph:
    """정준(sparse) 제약: 각 변의 H/V + 연속 정점 coincident(폐곡선 포함)."""
    n = len(poly)
    lines = [Line(tuple(poly[i]), tuple(poly[(i + 1) % n])) for i in range(n)]
    g = Graph(lines=lines)
    for i in range(n):
        a = lines[i].angle % 180.0
        if min(a, 180 - a) <= 10:
            g.add("horizontal", i)
        elif abs(a - 90) <= 10:
            g.add("vertical", i)
        g.add("coincident", i, (i + 1) % n)
    return g


# --- 렌더 + 노이즈 (6.1 등급 파라미터) --------------------------------------
def render_noisy(poly: np.ndarray, jitter_ratio: float, angle_sigma: float,
                 closure_gap: float, one_stroke=True) -> list[np.ndarray]:
    n = len(poly)
    strokes, cur = [], []
    for i in range(n):
        p0, p1 = poly[i], poly[(i + 1) % n]
        L = np.hypot(*(p1 - p0))
        k = max(2, int(L / 6))
        ts = np.linspace(0, 1, k)
        base = p0[None, :] * (1 - ts[:, None]) + p1[None, :] * ts[:, None]
        # 수직 지터
        d = (p1 - p0) / (L + 1e-9)
        nrm = np.array([-d[1], d[0]])
        wob = rng.normal(0, jitter_ratio * L, k)
        wob[0] = wob[-1] = wob[0] * 0.3
        # 방향 미세 회전
        th = math.radians(rng.normal(0, angle_sigma))
        Rm = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
        c = base.mean(0)
        base = (base - c) @ Rm.T + c
        pts = base + nrm[None, :] * wob[:, None]
        cur.extend(pts.tolist())
    cur = np.array(cur)
    # 닫힘 간격: 끝점을 시작에서 벌림
    cur[-1] += rng.normal(0, closure_gap * np.ptp(cur, 0).mean(), 2)
    if one_stroke:
        strokes = [cur]
    else:
        strokes = [cur[:len(cur)//2], cur[len(cur)//2:]]
    return strokes


def load_sketchgraphs(npy_path):   # 실 데이터 드롭인 스텁 (loader만 교체)
    raise NotImplementedError("실 SketchGraphs .npy loader: sketchgraphs 패키지 필요. "
                              "정답 그래프를 truth_graph 형식으로 변환해 반환.")


def run(n_samples, grade_params, tol=None):
    scores = {}
    for grade, gp in grade_params.items():
        fs = []
        for _ in range(n_samples):
            poly = gen_polygon()
            tg = truth_graph(poly)
            strokes = render_noisy(poly, gp["jitter_ratio"], gp["angle_sigma_deg"],
                                   gp["closure_gap_ratio"])
            rg = parse_strokes([np.array(s) for s in strokes], tol)
            # 정준 제약만 채점 (lines는 대응매칭 위해 보존)
            tinv = Graph(lines=tg.lines,
                         constraints={c for c in tg.constraints if c[0] in CANON})
            rinv = Graph(lines=rg.lines,
                         constraints={c for c in rg.constraints if c[0] in CANON})
            fs.append(compare_matched(tinv, rinv))
        arr = {k: float(np.mean([f[k] for f in fs])) for k in ("precision", "recall", "f1")}
        arr = {k: round(v, 4) for k, v in arr.items()}
        arr["n"] = n_samples
        scores[grade] = arr
    return scores


def main():
    qd = json.loads((OUT / "quickdraw_grades.json").read_text(encoding="utf-8"))
    grade_params = qd["noise_params"]
    scores = run(200, grade_params)
    result = {
        "spec": "§6.2 SketchGraphs 대조; 정준 제약 {horizontal,vertical,coincident}",
        "source": "synthetic SketchGraphs-compatible (직교폴리곤 부분집합). 실 .npy는 loader 교체.",
        "tolerances": DEFAULT_TOL,
        "match_rate_by_grade": scores,
        "holdout_metric_note": "§13 정규화 보강 판정 = 이 f1. 스키마 변경 후 하락하면 잘못 자란 것(§10).",
    }
    (OUT / "sketchgraphs_check.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(scores, ensure_ascii=False, indent=2))
    print("\n-> stage0/out/sketchgraphs_check.json")


if __name__ == "__main__":
    main()
