"""함의 시거리 게이트 유효 범위 측정 (지시 1.4).

**발견**: 시거리 게이트는 2I가 시험하던 **2점 직각복원에는 적용되지 않는다.**
무노이즈 2점에서 f/W = 1.000(정확)이 종횡비와 무관하게 나온다 — f는 두 소실점과 주점만으로
결정되므로(6.2) 종횡비 실패 정보를 담지 않는다. 2I 실패는 종횡비 미지수의 실패이고 f는 별개 미지수다.

게이트가 정보를 갖는 곳은 **형태 가정에서 d를 역산하는 경로**다(8.8 정사각 가정, 1점).
거기서는 가정이 틀린 만큼 d가 틀리므로 d의 비현실성이 곧 가정 오류의 신호가 된다.

여기서 측정하는 것:
  (A) 1점 정사각 가정 경로에서 게이트가 종횡비 오류를 얼마나 잡는가 (recall/precision)
  (B) 게이트의 단측성 — 하한만 있는 18.4 기준에 상한을 더하면 개선되는가
출력: stage0/out/viewdist_gate.json
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.viewdist import d_from_trapezoid, gate, TRUST_W, WARN_W

OUT = ROOT / "stage0" / "out"


def one_point_quad(d: float, h: float, width: float, depth: float, z0: float) -> np.ndarray:
    """1점 투시: 눈 원점, 시선 +Z, 화면 Z=d, 지면 Y=-h. 지평선 y=0.
    바닥 직사각형(가로 width, 안쪽 깊이 depth)의 상."""
    def pr(X, Z):
        return np.array([d * X / Z, d * (-h) / Z])
    return np.array([pr(-width / 2, z0), pr(width / 2, z0),
                     pr(width / 2, z0 + depth), pr(-width / 2, z0 + depth)])


def run(n=600, seed=0, W=800.0, err_thresh=0.30, upper=3.0):
    """정사각 가정으로 d를 역산 → 게이트. 참 종횡비(depth/width)가 1에서 벗어난 정도가 오류."""
    rng = np.random.default_rng(seed)
    rows = []
    for _ in range(n):
        d_true = W * rng.uniform(0.6, 1.8)            # 현실적 구도 범위
        h = rng.uniform(80, 250)
        width = rng.uniform(120, 400)
        k = float(np.exp(rng.uniform(math.log(0.25), math.log(4.0))))   # depth/width, 로그균등
        depth = width * k
        z0 = rng.uniform(1.0, 3.0) * max(width, depth)
        q = one_point_quad(d_true, h, width, depth, z0)
        r = d_from_trapezoid(q)
        g = gate(r.get("f"), W, r.get("ok", False))
        # 정사각 가정이 틀린 정도 = |log k| → 상대 오류
        aspect_err = abs(k - 1.0) / 1.0
        rows.append({"k": k, "aspect_err": aspect_err, "bad": aspect_err > err_thresh,
                     "d_true_ratio": d_true / W,
                     "ratio": g.get("ratio"), "verdict": g["verdict"]})

    bad = [r for r in rows if r["bad"]]

    def stats(sel, name):
        gated = [r for r in rows if sel(r)]
        passed = [r for r in rows if not sel(r)]
        caught = [r for r in gated if r["bad"]]
        return {"gate": name,
                "flags": round(len(gated) / len(rows), 3),
                "recall": round(len(caught) / max(1, len(bad)), 3),
                "precision": round(len(caught) / max(1, len(gated)), 3),
                "passed_bad_rate": round(sum(r["bad"] for r in passed) / max(1, len(passed)), 3)}

    def is_low(r):   # 18.4 하한 위반(광각 과다)
        return r["verdict"] in ("unreliable", "invalid")

    def is_high(r):  # 상한 위반(비현실적 망원) — 18.4엔 없음, 구도 타당성 근거로 추가 시험
        return r["ratio"] is not None and r["ratio"] > upper

    res = {
        "spec": "함의 시거리 게이트 유효 범위(지시 1.4). 1점 정사각 가정 경로.",
        "n": n, "aspect_err_threshold": err_thresh, "upper_bound_W": upper,
        "base_bad_rate": round(len(bad) / len(rows), 3),
        "gates": [
            stats(lambda r: r["verdict"] != "trust", "not_trust(18.4 하한 0.87W)"),
            stats(is_low, "unreliable_or_invalid(<0.5W)"),
            stats(is_high, f"upper_only(>{upper}W)"),
            stats(lambda r: is_low(r) or is_high(r), f"both(<0.5W or >{upper}W)"),
        ],
        "ratio_by_outcome": {},
        "note": "정사각 가정이 틀리면 d가 그만큼 틀린다(implied_d/true_d = width/depth). "
                "하한만 있는 18.4는 '가정보다 깊은' 쪽만 잡는다 → 단측. 상한이 반대쪽을 잡는다.",
    }
    for label, sel in (("bad", lambda r: r["bad"]), ("ok", lambda r: not r["bad"])):
        v = [r["ratio"] for r in rows if sel(r) and r["ratio"] is not None]
        res["ratio_by_outcome"][label] = {
            "n": len(v),
            "median": round(float(np.median(v)), 3) if v else None,
            "p10": round(float(np.percentile(v, 10)), 3) if v else None,
            "p90": round(float(np.percentile(v, 90)), 3) if v else None}
    # 방향별 분해: k>1(가정보다 깊음) vs k<1(얕음)
    for label, sel in (("deeper_than_square(k>1)", lambda r: r["k"] > 1.3),
                       ("shallower_than_square(k<1)", lambda r: r["k"] < 0.77)):
        sub = [r for r in rows if sel(r)]
        if sub:
            res.setdefault("by_direction", {})[label] = {
                "n": len(sub),
                "caught_by_lower": round(sum(is_low(r) for r in sub) / len(sub), 3),
                "caught_by_upper": round(sum(is_high(r) for r in sub) / len(sub), 3),
                "ratio_median": round(float(np.median([r["ratio"] for r in sub if r["ratio"]])), 3)}
    return res


def main():
    res = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "viewdist_gate.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
