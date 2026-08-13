"""직교 전용 파서의 범위 한계 정량화 (지시 7).

해결이 목적이 아니다. **범위 한계를 수치로 아는 것**이 목적이며, 계획 §2
"직교 그리드 + 축 회전 정도로 제한"의 근거가 된다.

두 계열이 같은 뿌리다:
  - house 자기정합 IoU 0.571 — 삼각 지붕(**비직교**)
  - 2H 폐기 — L·U·계단의 **노치(오목)** 내부 형태 복원 실패
    ("외곽 비례는 맞고 내부 형태가 틀린다", 1-ter A)
→ 비직교뿐 아니라 **오목 폴리곤(노치) 빈도도 함께** 센다.

측정 대상: Quick,Draw 건축 계열 실획. 각 그림의 외곽을 코너로 요약한 뒤
  - 비직교: 코너 내각이 90°/180°에서 크게 벗어나는 것이 있는가
  - 오목  : 반사각(>180°) 코너가 있는가 (노치)
출력: stage0/out/orthogonal_limit.json
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.inknoise import resample_uniform

RAW = ROOT / "data" / "quickdraw"
OUT = ROOT / "stage0" / "out"
# 건축 계열 — 있는 범주 전부.
CATS = ["house", "castle", "skyscraper", "door", "square", "triangle"]
N_PER_CAT = 400
ANG_TOL = 25.0          # 직교 판정 허용각(도). 프리핸드라 관대하게.


def load_outlines(cat: str, n: int) -> list[np.ndarray]:
    """가장 긴 획을 외곽으로 본다(대개 윤곽선)."""
    p = RAW / f"{cat}.ndjson"
    if not p.exists():
        return []
    out = []
    for ln in p.read_text(encoding="utf-8").splitlines():
        if len(out) >= n:
            break
        if not ln.strip():
            continue
        d = json.loads(ln)
        if d.get("recognized") is False:
            continue
        strokes = [np.stack([np.asarray(s[0], float), np.asarray(s[1], float)], 1)
                   for s in d["drawing"] if len(s[0]) >= 8]
        if not strokes:
            continue
        out.append(max(strokes, key=len))
    return out


def corners_of(stroke: np.ndarray, min_turn=35.0, win=4) -> tuple[np.ndarray, list[float]]:
    """획 → 코너 정점 + 각 코너의 방향 전환각(부호 있음, 좌회전 +).
    등간격 재표본으로 샘플 밀도 편차를 없앤 뒤 국소 방향 변화가 큰 지점을 코너로 본다."""
    diag = math.hypot(*np.ptp(stroke, 0)) or 1.0
    rs = resample_uniform(stroke, diag * 0.03)
    if len(rs) < 3 * win:
        return np.empty((0, 2)), []
    idx, turns = [], []
    for i in range(win, len(rs) - win):
        a = rs[i] - rs[i - win]
        b = rs[i + win] - rs[i]
        na, nb = np.hypot(*a), np.hypot(*b)
        if na < 1e-9 or nb < 1e-9:
            continue
        cross = float(a[0] * b[1] - a[1] * b[0]) / (na * nb)
        dot = float(a[0] * b[0] + a[1] * b[1]) / (na * nb)
        ang = math.degrees(math.atan2(cross, dot))     # 부호 있는 전환각
        if abs(ang) >= min_turn:
            if idx and i - idx[-1] < win:              # 인접 후보는 큰 쪽만
                if abs(ang) > abs(turns[-1]):
                    idx[-1], turns[-1] = i, ang
            else:
                idx.append(i); turns.append(ang)
    return rs[idx], turns


def classify(stroke: np.ndarray) -> dict:
    """한 그림의 외곽이 직교인가 / 오목(노치)을 갖는가."""
    pts, turns = corners_of(stroke)
    if len(turns) < 3:
        return {"ok": False}
    # 직교: 모든 전환각이 ±90°(또는 ±180°) 근처
    def near_ortho(t: float) -> bool:
        r = abs(t) % 180.0
        return min(abs(r - 90.0), abs(r), abs(r - 180.0)) <= ANG_TOL
    ortho = all(near_ortho(t) for t in turns)
    # 오목: 전환 방향이 섞여 있으면 반사각(노치)이 있다는 뜻
    pos = sum(1 for t in turns if t > 0)
    neg = len(turns) - pos
    concave = min(pos, neg) >= 1 and len(turns) >= 4
    return {"ok": True, "n_corners": len(turns), "orthogonal": bool(ortho),
            "concave": bool(concave), "nonortho_corners": sum(0 if near_ortho(t) else 1 for t in turns)}


def run() -> dict:
    res = {}
    tot = {"n": 0, "nonortho": 0, "concave": 0, "both": 0}
    for cat in CATS:
        rows = [classify(s) for s in load_outlines(cat, N_PER_CAT)]
        rows = [r for r in rows if r.get("ok")]
        if not rows:
            continue
        n = len(rows)
        no = sum(1 for r in rows if not r["orthogonal"])
        cc = sum(1 for r in rows if r["concave"])
        both = sum(1 for r in rows if not r["orthogonal"] or r["concave"])
        res[cat] = {"n": n,
                    "nonorthogonal_rate": round(no / n, 3),
                    "concave_rate": round(cc / n, 3),
                    "outside_parser_scope_rate": round(both / n, 3),
                    "median_corners": int(np.median([r["n_corners"] for r in rows]))}
        tot["n"] += n; tot["nonortho"] += no; tot["concave"] += cc; tot["both"] += both
    overall = {"n": tot["n"],
               "nonorthogonal_rate": round(tot["nonortho"] / max(1, tot["n"]), 3),
               "concave_rate": round(tot["concave"] / max(1, tot["n"]), 3),
               "outside_parser_scope_rate": round(tot["both"] / max(1, tot["n"]), 3)}

    # --- 검출기 보정 (자기검증) ---
    # `square`/`door`는 **의도상 직교**인 범주다. 그런데도 비직교로 잡히는 비율이 있다면
    # 그것은 도형의 성질이 아니라 **검출기의 오탐률**이다(프리핸드 떨림 + 코너 미검출).
    # 실제로 square의 코너 중앙값이 4가 아니라 3으로 나온다 — 폐합 코너를 놓친다.
    # → 이 값을 바닥(floor)으로 두고 나머지 범주를 그 위에서 읽는다.
    floor_cats = [c for c in ("square", "door") if c in res]
    if floor_cats:
        fp = sum(res[c]["nonorthogonal_rate"] * res[c]["n"] for c in floor_cats) /              sum(res[c]["n"] for c in floor_cats)
        calib = {"floor_categories": floor_cats,
                 "detector_false_positive_rate": round(float(fp), 3),
                 "adjusted_nonorthogonal_rate": {
                     c: round(max(0.0, res[c]["nonorthogonal_rate"] - fp), 3) for c in res},
                 "note": ("square/door는 의도상 직교이므로 그 비직교율은 검출기 오탐률이다. "
                          "코너 중앙값이 4가 아닌 3인 것이 근거 — 폐합 코너를 놓친다. "
                          "보정값은 하한 추정이며, 오목(concave) 판정은 방향 부호 기반이라 이 보정과 무관하다.")}
    else:
        calib = None

    return {
        "spec": "직교 전용 파서의 범위 한계(지시 7). Quick,Draw 건축 계열 실획 외곽.",
        "angle_tolerance_deg": ANG_TOL,
        "by_category": res, "overall": overall, "detector_calibration": calib,
        "note": ("해결이 아니라 한계를 아는 것이 목적. 계획 §2 '직교 그리드 + 축 회전으로 제한'의 근거. "
                 "비직교(삼각 지붕 계열)와 오목 노치(2H 폐기 계열)를 함께 센다."),
    }


def main():
    r = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "orthogonal_limit.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
