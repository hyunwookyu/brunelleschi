"""투시 복원 2A/2D — 평면↔투시 대응에서 카메라, 역투영으로 평면 복원 (지시서 트랙2).

§3.8 "평면 병용 필수" 전제를 직접 시험한다. 작도 영상(2A)은 평면 4점 ↔ 투시 4점의
짝을 관측하므로 지도 신호가 있다:
  카메라 = fit_camera(평면4, 투시4)                     (stage3 재사용)
  역투영: 투시 이미지점 → Z=0 역투영 = 호모그래피 역     (2D)
  검증: 역투영 평면 vs 원본 평면 IoU

지면 위 요소만 복원(Z=0), 올라간 요소는 수직선 길이에서(무차원, §3.5 앵커부재).
주의: 작도 영상은 이상적 선 → 대응 구조 학습에만, tolerance엔 안 씀(2A 주석).
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.camera import fit_camera, _K_from_size


def homography_from_pose(K, R, t) -> np.ndarray:
    """H = K [r1 r2 t] — Z=0 평면 → 이미지."""
    r1 = R[:, 0].reshape(3, 1); r2 = R[:, 1].reshape(3, 1); tt = np.asarray(t).reshape(3, 1)
    return K @ np.hstack([r1, r2, tt])


def inverse_project_plane(H: np.ndarray, image_pts: np.ndarray) -> np.ndarray:
    """이미지점 → Z=0 평면점 (호모그래피 역). 지면 요소만."""
    Hinv = np.linalg.inv(H)
    out = []
    for u, v in image_pts:
        p = Hinv @ np.array([u, v, 1.0])
        out.append([p[0] / p[2], p[1] / p[2]])
    return np.array(out)


def _poly_iou(a: np.ndarray, b: np.ndarray) -> float:
    from shapely.geometry import Polygon
    A = Polygon(a).buffer(0); B = Polygon(b).buffer(0)
    if A.is_empty or B.is_empty:
        return 0.0
    u = A.union(B).area
    return A.intersection(B).area / u if u else 0.0


def reconstruct(plan4: np.ndarray, persp4: np.ndarray, img_size) -> dict:
    """투시4 + (지도신호로서) 평면4 대응 → 카메라 → 역투영 평면 → 원본 대조."""
    res = fit_camera(plan4, persp4, img_size)
    if not res.ok:
        return {"ok": False, "reason": res.reason, "fit_error": res.fit_error}
    H = homography_from_pose(res.K, res.R, res.tvec)
    # 채택된 대응순열로 이미지점 정렬(fit_camera가 고른 perm)
    img_perm = persp4[res.perm]
    recovered = inverse_project_plane(H, img_perm)
    # 원본 평면(무차원 — 스케일·이동 정규화 후 IoU)
    iou = _poly_iou(_norm(plan4), _norm(recovered))
    return {"ok": True, "fit_error": float(res.fit_error), "perm": list(res.perm),
            "plane_iou": round(iou, 4),
            "recovered_plane": recovered.tolist(),
            "note": "지면(Z=0) 요소만 복원. 올라간 요소는 수직선 길이(무차원, §3.5)."}


def _norm(poly: np.ndarray) -> np.ndarray:
    """스케일·이동 정규화(무차원 IoU) — 앵커 부재(§3.5)."""
    p = np.asarray(poly, float); c = p.mean(0)
    diag = float(np.hypot(*(p.max(0) - p.min(0)))) or 1.0
    return (p - c) / diag


if __name__ == "__main__":
    from stage3.synth import build_synthetic, default_world_quad_irregular
    plan = default_world_quad_irregular()
    w4, img4, sz, truth = build_synthetic(world4=plan)
    r = reconstruct(plan, img4, sz)
    print("=== 2A 복원 데모 (무노이즈) ===")
    print("fit_error:", r["fit_error"], "plane_iou:", r["plane_iou"])
