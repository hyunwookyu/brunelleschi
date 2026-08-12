"""투시 단독 구축선/소실점 추출 2B — 평면 없이 (지시서 트랙2 2B).

§3.8의 진짜 시험: 대응(평면)이 없을 때 투시 획만으로 소실점을 뽑을 수 있는가.
획 순서상 초반 장직선 = 지평선·소실선 후보. 소실점 = 소실선 교점 클러스터.
이후 획이 그 소실점을 향하는지로 검증. L1→L3로 구축선 잔존율이 난이도 축.

여기서 얻는 VP는 카메라 방향의 지도 신호가 되나, 세계 사각형의 종횡비는
미결정(무차원, §3.5) — 이것이 §3.8 불안정성의 핵심.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def fit_line(stroke: np.ndarray):
    """획 → 직선 (점+방향, TLS). 반환 (p0, dir단위, 길이, 직진성)."""
    p = np.asarray(stroke, float)[:, :2]
    if len(p) < 2:
        return None
    c = p.mean(0); u, s, vt = np.linalg.svd(p - c)
    d = vt[0]
    proj = (p - c) @ d
    length = float(proj.max() - proj.min())
    minor = float(np.sqrt(np.mean(((p - c) @ vt[1]) ** 2))) if len(vt) > 1 else 0.0
    straight = minor / (length + 1e-9)
    return {"c": c, "d": d, "length": length, "straight": straight}


def line_intersection(l1, l2):
    """두 직선 교점 (없으면 None). 각각 {c, d}."""
    c1, d1 = l1["c"], l1["d"]; c2, d2 = l2["c"], l2["d"]
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
    det = np.linalg.det(A)
    if abs(det) < 1e-9:
        return None
    t = np.linalg.solve(A, c2 - c1)
    return c1 + t[0] * d1


def extract_construction_lines(strokes, straight_max=0.03, length_frac=0.3):
    """초반 장직선(구축선) 후보. 직진성 높고 충분히 김."""
    lines = [fit_line(s) for s in strokes]
    lines = [l for l in lines if l and l["straight"] <= straight_max]
    if not lines:
        return []
    maxlen = max(l["length"] for l in lines)
    return [l for l in lines if l["length"] >= length_frac * maxlen]


def vanishing_points(lines, cluster_tol=40.0, min_support=3):
    """소실선 교점 클러스터 → VP. 세계 평행선족은 이미지서 한 점(VP)으로 수렴 →
    그 교점들이 클러스터. 전 쌍 교점 → 그리디 클러스터 → support 큰 것이 VP."""
    pts = []
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            x = line_intersection(lines[i], lines[j])
            if x is not None and np.all(np.isfinite(x)):
                pts.append(x)
    if not pts:
        return []
    clusters = []
    for p in pts:
        placed = False
        for cl in clusters:
            if np.hypot(*(p - cl["mean"])) < cluster_tol:
                cl["pts"].append(p); cl["mean"] = np.mean(cl["pts"], 0); placed = True; break
        if not placed:
            clusters.append({"pts": [p], "mean": p})
    clusters.sort(key=lambda c: -len(c["pts"]))
    # support = 그 VP를 지나는 소실선 수 (교점수가 아니라 실제 라인 수로 환산: k개 라인 → C(k,2) 교점)
    out = []
    for cl in clusters:
        k = int(round((1 + (1 + 8 * len(cl["pts"])) ** 0.5) / 2))   # C(k,2)=n → k
        if k >= min_support:
            out.append({"vp": cl["mean"].tolist(), "support": k})
    return out


def construction_residual(strokes, vps, tol_deg=5.0):
    """이후 획들이 VP를 향하는 비율(구축선 검증). 높을수록 투시 일관."""
    if not vps:
        return 0.0
    lines = [fit_line(s) for s in strokes]
    lines = [l for l in lines if l]
    hit = 0
    for l in lines:
        for vp in vps:
            to_vp = np.array(vp["vp"]) - l["c"]
            n = np.hypot(*to_vp)
            if n < 1e-6:
                continue
            ang = abs(np.degrees(np.arccos(np.clip(abs(np.dot(l["d"], to_vp / n)), -1, 1))))
            if ang <= tol_deg:
                hit += 1; break
    return hit / max(1, len(lines))


if __name__ == "__main__":
    # 합성 1점 투시 바닥 그리드 → X방향 평행선족이 한 VP로 수렴 → 복원 검증
    import cv2
    from stage3.camera import _K_from_size
    from stage3.synth import _look_at
    sz = (800.0, 600.0); K = _K_from_size(sz)
    rvec, tvec = _look_at(np.array([-8.0, -10.0, 6.0]), np.array([5.0, 3.0, 0.0]))
    strokes = []
    for y in np.linspace(0, 6, 5):                 # X방향 평행선 5개(다른 Y)
        w = np.array([[0, y, 0], [10, y, 0]], float)
        img, _ = cv2.projectPoints(w, rvec, tvec, K, None); img = img.reshape(-1, 2)
        ts = np.linspace(0, 1, 20)
        strokes.append(img[0][None] * (1 - ts[:, None]) + img[1][None] * ts[:, None])
    # 해석적 VP: X방향 무한점 [1,0,0] 투영
    R, _ = cv2.Rodrigues(rvec)
    vp_true = K @ (R @ np.array([1.0, 0, 0]))
    vp_true = vp_true[:2] / vp_true[2]
    lines = extract_construction_lines(strokes)
    vps = vanishing_points(lines)
    print("구축선:", len(lines), "VP검출:", [(round(v["vp"][0]), round(v["vp"][1]), v["support"]) for v in vps])
    print("해석적 VP:", [round(x) for x in vp_true])
    if vps:
        err = np.hypot(*(np.array(vps[0]["vp"]) - vp_true))
        print("VP 오차(px):", round(float(err), 2))
    print("구축 잔차:", round(construction_residual(strokes, vps), 3))
