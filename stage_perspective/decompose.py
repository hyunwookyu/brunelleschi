"""직교 폴리곤 종횡비 복원 2H — 다중 변 → 2 소실점 → 전 정점 역투영 (지시서 트랙2 2H).

2F(단일 사각형)가 비직교에서 붕괴하는 것은 전체를 한 사각형으로 봐서다. 직교 폴리곤은
X/Y 두 세계방향 변만 가진다(직사각형들의 합집합). 정점 순서상 변이 X/Y로 교대(rectilinear)
→ 홀짝으로 두 방향족 분리 → 각 족의 소실점(최소제곱 교점) → 직교성으로 f → 카메라 →
전 정점 역투영 → 복원 직교폴리곤. 4변보다 많은 변이 VP에 투표하므로 강건.

공유 엣지 일치는 자동(같은 카메라·같은 평면 역투영이라 전역 일관). 2A 정답 대비 IoU.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.camera import _K_from_size


def _edges(verts):
    n = len(verts)
    return [(verts[i], verts[(i + 1) % n]) for i in range(n)]


def _ls_intersection(lines):
    """직선군 최소제곱 교점. 각 line=(p, dir). 수직거리² 합 최소."""
    A = np.zeros((2, 2)); bb = np.zeros(2)
    for p, d in lines:
        n = np.array([-d[1], d[0]]); n = n / (np.hypot(*n) + 1e-12)
        A += np.outer(n, n); bb += n * np.dot(n, p)
    if abs(np.linalg.det(A)) < 1e-9:
        return None
    return np.linalg.solve(A, bb)


def _procrustes_iou(truth, recovered):
    """복원을 truth에 상사변환(회전+스케일+이동) 정합 후 IoU. 형태충실도(상사 불변)."""
    from shapely.geometry import Polygon
    T = np.asarray(truth, float); R = np.asarray(recovered, float)
    if len(T) != len(R):
        return None
    tc, rc = T.mean(0), R.mean(0)
    T0, R0 = T - tc, R - rc
    H = R0.T @ T0
    U, s, Vt = np.linalg.svd(H)
    Rot = Vt.T @ U.T
    if np.linalg.det(Rot) < 0:
        Vt[-1] *= -1; Rot = Vt.T @ U.T
    scale = s.sum() / (np.sum(R0 ** 2) + 1e-12)
    aligned = (scale * R0 @ Rot.T) + tc
    A = Polygon(T).buffer(0); B = Polygon(aligned).buffer(0)
    if A.is_empty or B.is_empty:
        return 0.0
    u = A.union(B).area
    return A.intersection(B).area / u if u else 0.0


def recover_orthogonal_polygon(image_verts: np.ndarray, img_size) -> dict:
    """직교 폴리곤 투시 정점 → 카메라 → 역투영 복원 폴리곤. rectilinear(변 X/Y 교대) 가정."""
    V = np.asarray(image_verts, float)
    n = len(V)
    if n < 4 or n % 2 != 0:
        return {"ok": False, "reason": f"짝수 정점 필요(직교폴리곤 교대), got {n}"}
    edges = _edges(V)
    # 홀짝으로 두 방향족
    fam0 = [(np.array(a), np.array(b) - np.array(a)) for i, (a, b) in enumerate(edges) if i % 2 == 0]
    fam1 = [(np.array(a), np.array(b) - np.array(a)) for i, (a, b) in enumerate(edges) if i % 2 == 1]
    vpx = _ls_intersection([(p, d / (np.hypot(*d) + 1e-12)) for p, d in fam0])
    vpy = _ls_intersection([(p, d / (np.hypot(*d) + 1e-12)) for p, d in fam1])
    if vpx is None or vpy is None:
        return {"ok": False, "reason": "소실점 미검출(평행/퇴화)"}
    K = _K_from_size(img_size); pp = np.array([K[0, 2], K[1, 2]]); f = K[0, 0]
    # 직교성: f² = -(vpx-pp)·(vpy-pp)  (주점 기준)
    dotp = np.dot(vpx - pp, vpy - pp)
    if dotp >= 0:
        return {"ok": False, "reason": f"직교 비일관(dot={dotp:.1f}≥0) — 실패 사전판정 대상(2I)"}
    # 세계 방향(카메라계)
    Kinv = np.linalg.inv(K)
    d1 = Kinv @ np.array([vpx[0], vpx[1], 1.0]); d1 /= np.linalg.norm(d1)
    d2 = Kinv @ np.array([vpy[0], vpy[1], 1.0]); d2 /= np.linalg.norm(d2)
    d3 = np.cross(d1, d2)
    R = np.stack([d1, d2, d3], 1)   # 열 = 세계축의 카메라계 방향
    t = np.array([0.0, 0.0, 1.0])   # 임의(형태는 K,R로 상사까지 결정)
    H = K @ np.stack([R[:, 0], R[:, 1], t], 1)
    Hinv = np.linalg.inv(H)
    rec = []
    for u, v in V:
        p = Hinv @ np.array([u, v, 1.0]); rec.append([p[0] / p[2], p[1] / p[2]])
    return {"ok": True, "recovered": np.array(rec), "vpx": vpx.tolist(), "vpy": vpy.tolist(),
            "focal_consistency": float(dotp)}


# --- 평가: L/凹/계단, 2A 정답 대비 IoU, 2F(단일사각형)와 비교 ---
def _shapes():
    L = np.array([[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]], float)
    U = np.array([[0, 0], [12, 0], [12, 10], [8, 10], [8, 4], [4, 4], [4, 10], [0, 10]], float)
    stair = np.array([[0, 0], [12, 0], [12, 3], [8, 3], [8, 6], [4, 6], [4, 9], [0, 9]], float)
    return {"L": L, "U": U, "stair": stair}


def _project_polygon(world2d, eye, target, img_size):
    """N정점 직교폴리곤 → 이미지 정점 (cv2). build_synthetic는 4점전용이라 별도."""
    import cv2
    from stage3.synth import _look_at
    K = _K_from_size(img_size)
    rvec, tvec = _look_at(np.array(eye, float), np.array(target, float))
    w3 = np.hstack([np.asarray(world2d, float), np.zeros((len(world2d), 1))])
    img, _ = cv2.projectPoints(w3, rvec, tvec, K, None)
    return img.reshape(-1, 2)


def evaluate(n=120, seed=0):
    from stage_perspective.noise import grade_ratios, add_corner_noise, stable_seed
    _r = grade_ratios()
    GRADE_NOISE = {k: _r[k] for k in ("precise", "medium") if k in _r}   # 실측(지시 0.4)
    out = {}
    for name, base in _shapes().items():
        out[name] = {}
        for grade, ratio in GRADE_NOISE.items():
            rng = np.random.default_rng(stable_seed(name, grade, base=seed))
            ious, holds = [], 0
            aerr = []   # 종횡비 상대오차(1급 지표, 지시 1-ter A)
            oious = []  # 방위 유지 IoU(구 지표) — 병기
            for _ in range(n):
                truth = base * rng.uniform(3, 8)
                c = truth.mean(0); diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
                az = rng.uniform(0, 2 * np.pi); el = rng.uniform(np.radians(30), np.radians(60))
                dist = diag * rng.uniform(1.4, 2.2)
                eye = (c[0] + dist * np.cos(az) * np.cos(el), c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.3)
                sz = (800.0, 600.0)
                img = _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz)
                noisy = add_corner_noise(img, ratio, rng)
                r = recover_orthogonal_polygon(noisy, sz)
                if not r["ok"]:
                    continue
                # D-1b: 대응 탐색 포함 상사 IoU가 표준. 구 `_procrustes_iou`는 정점 순서를
                # 그대로 믿어 순환 이동된 해를 과소평가했다.
                from stage_perspective.shape_metrics import similarity_iou, oriented_iou
                iou = similarity_iou(truth, r["recovered"])
                if iou is not None:
                    ious.append(iou); holds += 1
                    oious.append(oriented_iou(truth, r["recovered"]))
                    from stage_perspective.metric_audit import polygon_aspect, aspect_rel_err
                    ae = aspect_rel_err(polygon_aspect(r["recovered"]), polygon_aspect(truth))
                    if np.isfinite(ae):
                        aerr.append(ae)
            def q(x, p): return round(float(np.percentile(x, p)), 4) if x else None
            out[name][grade] = {"corner_err_ratio": ratio, "hold_rate": round(holds / n, 3),
                                "iou_median": q(ious, 50), "iou_p10": q(ious, 10),
                                "oriented_iou_median": q(oious, 50),
                                "aspect_rel_err_median": q(aerr, 50), "aspect_rel_err_p90": q(aerr, 90)}
    return out


def main():
    import json
    res = evaluate(n=120)
    # 2F 단일사각형 비직교 결과와 대비
    f2 = json.loads((ROOT / "stage0" / "out" / "aspect_priors.json").read_text(encoding="utf-8")) \
        if (ROOT / "stage0" / "out" / "aspect_priors.json").exists() else {}
    GA, GB = "precise", "medium"        # 실측 등급명(구 L1_ruler/L2_freehand)
    irr_2F = f2.get("2F_a_right_angle", {}).get("irregular", {}).get(GB, {}).get("plane_iou_median")
    l_2H = res.get("L", {}).get(GB, {}).get("iou_median")
    l1 = {s: res[s][GA]["iou_median"] for s in res}
    l2 = {s: res[s][GB]["iou_median"] for s in res}
    hold_l1 = {s: res[s][GA]["hold_rate"] for s in res}
    ok_l1 = all((v or 0) >= 0.6 for v in l1.values())
    report = {
        "spec": "트랙2 2H — 직교폴리곤 다중VP 분해 복원(2A 정답 대비, 상사정합 IoU). 전부 측정값.",
        "by_shape": res,
        "iou_median_precise": l1, "iou_median_medium": l2, "hold_rate_precise": hold_l1,
        "note_baseline": "2F irregular은 비뚤어진 4각형(직교 아님)이라 2H 직교폴리곤과 직접 비교 부적절. "
                         "2H는 '직교폴리곤을 단일사각형으로 보면 붕괴'하던 것을 다중VP로 복원한 것.",
        "vs_2F": {"2F_irregular_medium_iou": irr_2F, "2H_L_medium_iou": l_2H},
        "conclusion": (
            f"2H(다중VP, 실측 코너오차 노이즈): 직교폴리곤 precise IoU {l1} (hold {hold_l1}), medium {l2}. "
            + ("**precise 등급에선 직교폴리곤 종횡비 부분 복원 가능**(IoU≥0.6). "
               if ok_l1 else "precise서도 IoU<0.6 다수. ")
            + "medium에선 저하+hold 감소. 직교성 게이트(dotp≥0→실패)가 실패 일부 사전판정(2I)."),
    }
    (ROOT / "stage0" / "out" / "decompose_2H.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"by_shape": res, "vs_2F": report["vs_2F"], "conclusion": report["conclusion"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
