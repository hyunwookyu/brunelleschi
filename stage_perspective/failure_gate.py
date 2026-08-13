"""2I — 종횡비 복원 실패 사전판정 게이트 (지시서 트랙2 2I).

2F 직사각 L2서도 p10이 0.4대. 실패를 없애는 게 아니라 미리 아는 것이 목표(§5.3 성격).
복원 전 이미지 기하만으로 예측자 계산 → IoU와 상관 → 실패 분리 게이트 → 근사모드/평면요구 전환.

예측자(이미지 4점만):
  - VP 거리(중심 대비): 멀면 near-parallel → f 불안정
  - 직교 마진 f²=-(vpA-pp)·(vpB-pp): ≤0이면 유효 f 없음(즉시 실패)
  - 이미지 사각형 최소 내각: 작으면 퇴화(edge-on)
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.camera import _K_from_size
from stage_perspective.priors import recover_plane_rightangle, rect
from stage_perspective.reconstruct import _norm, _poly_iou


def _line_int(p1, p2, p3, p4):
    d1 = p2 - p1; d2 = p4 - p3
    A = np.array([[d1[0], -d2[0]], [d1[1], -d2[1]]])
    if abs(np.linalg.det(A)) < 1e-9:
        return None
    t = np.linalg.solve(A, p3 - p1)
    return p1 + t[0] * d1


def predictors(image4: np.ndarray, img_size) -> dict:
    """복원 전 예측자. image4 순서 0-1-2-3 사각형."""
    V = np.asarray(image4, float)
    K = _K_from_size(img_size); pp = np.array([K[0, 2], K[1, 2]]); diag = float(np.hypot(*img_size))
    vpa = _line_int(V[0], V[1], V[3], V[2])   # 변 0-1 ∥ 3-2
    vpb = _line_int(V[1], V[2], V[0], V[3])   # 변 1-2 ∥ 0-3
    if vpa is None or vpb is None:
        return {"valid": False, "reason": "VP 미검출(평행)"}
    dotp = float(np.dot(vpa - pp, vpb - pp)); f2 = -dotp
    vpa_d = float(np.hypot(*(vpa - pp)) / diag); vpb_d = float(np.hypot(*(vpb - pp)) / diag)
    # 이미지 사각형 최소 내각
    angs = []
    for i in range(4):
        a = V[(i - 1) % 4] - V[i]; b = V[(i + 1) % 4] - V[i]
        na, nb = np.hypot(*a), np.hypot(*b)
        if na < 1e-9 or nb < 1e-9:
            continue
        angs.append(np.degrees(np.arccos(np.clip(np.dot(a, b) / (na * nb), -1, 1))))
    min_ang = float(min(angs)) if angs else 0.0
    return {"valid": True, "f2": f2, "f2_positive": f2 > 0,
            "vp_dist_max": max(vpa_d, vpb_d), "min_image_angle": min_ang}


def recovery_gate(image4, img_size, vp_far=8.0, min_ang=25.0) -> dict:
    """복원 신뢰 게이트. 불신뢰면 근사모드/평면요구(fit_error 게이트와 동성격)."""
    pr = predictors(image4, img_size)
    if not pr["valid"] or not pr["f2_positive"]:
        return {"reliable": False, "reason": "직교 비일관(f²≤0)", "pred": pr}
    if pr["vp_dist_max"] > vp_far:
        return {"reliable": False, "reason": f"VP 원거리({pr['vp_dist_max']:.1f}>{vp_far}) near-parallel 불안정", "pred": pr}
    if pr["min_image_angle"] < min_ang:
        return {"reliable": False, "reason": f"이미지 사각형 퇴화(최소각 {pr['min_image_angle']:.0f}<{min_ang})", "pred": pr}
    return {"reliable": True, "reason": "ok", "pred": pr}


def evaluate(n=400, seed=0):
    """다양(정상+퇴화) 시점에서 게이트가 실패(IoU<0.6)를 잡는지 — recall/precision + 게이트후 IoU."""
    from stage_perspective.decompose import _project_polygon
    rng = np.random.default_rng(seed)
    rows = []
    for _ in range(n):
        a = rng.uniform(0.3, 3.0); truth = rect(a) * rng.uniform(3, 9)
        c = truth.mean(0); diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
        az = rng.uniform(0, 2 * np.pi)
        el = rng.uniform(np.radians(10), np.radians(85))       # 퇴화 시점 포함(고각=near-frontal)
        dist = diag * rng.uniform(1.1, 3.5)
        eye = (c[0] + dist * np.cos(az) * np.cos(el), c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.2)
        sz = (800.0, 600.0)
        img = _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz)
        noisy = img + rng.normal(0, 8, img.shape)
        gate = recovery_gate(noisy, sz)
        r = recover_plane_rightangle(noisy, sz)
        iou = _poly_iou(_norm(truth), _norm(np.array(r["recovered_plane"]))) if r["ok"] else 0.0
        fe = r["fit_error"] if r["ok"] and r["fit_error"] is not None else 1.0
        rows.append({"reliable": gate["reliable"], "iou": iou, "fail": iou < 0.6, "fit_error": fe})
    fails = [r for r in rows if r["fail"]]

    def gate_stats(is_gated):
        gated = [r for r in rows if is_gated(r)]; passed = [r for r in rows if not is_gated(r)]
        caught = [r for r in gated if r["fail"]]
        return {"flags": round(len(gated) / len(rows), 3),
                "recall": round(len(caught) / max(1, len(fails)), 3),
                "precision": round(len(caught) / max(1, len(gated)), 3),
                "passed_fail_rate": round(sum(r["fail"] for r in passed) / max(1, len(passed)), 3),
                "passed_iou_median": round(float(np.median([r["iou"] for r in passed])), 4) if passed else None}
    # fit_error 임계 스윕 → 최적
    fe_gates = {f"fit_error>{th}": gate_stats(lambda r, th=th: r["fit_error"] > th) for th in (0.01, 0.02, 0.03, 0.05)}
    return {
        "n": n, "overall_fail_rate": round(len(fails) / n, 3),
        "overall_iou_median": round(float(np.median([r["iou"] for r in rows])), 4),
        "geometric_gate": gate_stats(lambda r: not r["reliable"]),
        "fit_error_gates": fe_gates,
        "note": "게이트 통과분 fail_rate가 전체보다 유의 낮으면 사전판정 유효(§5.3). fit_error는 복원 직후 저비용.",
    }


def main():
    import json
    res = evaluate(n=400)
    (ROOT / "stage0" / "out" / "failure_gate.json").write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
