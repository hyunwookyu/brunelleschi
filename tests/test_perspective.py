"""투시 복원 트랙 테스트 (지시서 트랙2). 2A 역투영 round-trip + 2B VP 추출."""
import sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.reconstruct import reconstruct
from stage_perspective.construction import extract_construction_lines, vanishing_points, construction_residual


def test_2A_roundtrip_noiseless_iou1():
    """2A: 대응 알면 무노이즈서 역투영 평면 IoU≈1 (§3.8 역경로 성립)."""
    from stage3.synth import build_synthetic, default_world_quad_irregular
    plan = default_world_quad_irregular()
    _, img4, sz, _ = build_synthetic(world4=plan)
    r = reconstruct(plan, img4, sz)
    assert r["ok"] and r["plane_iou"] > 0.99


def test_2A_degrades_with_noise_but_bounded():
    """2A: 노이즈↑ IoU↓이나 대응 알면 견고(경계 측정)."""
    from stage3.synth import build_synthetic
    rng = np.random.default_rng(1)
    quad = np.array([[0, 0], [10, 0], [9.3, 6.4], [0.6, 6.1]], float)
    _, img4, sz, _ = build_synthetic(world4=quad, eye=(-8, -10, 6), target=(5, 3, 0))
    ious = []
    for _ in range(20):
        noisy = img4 + rng.normal(0, 8, img4.shape)
        r = reconstruct(quad, noisy, sz)
        if r["ok"]:
            ious.append(r["plane_iou"])
    assert np.median(ious) > 0.7          # L2 노이즈서도 대응 알면 견고


def test_2B_vanishing_point_from_perspective_only():
    """2B: 투시 획만으로 소실점 추출(평면 없이). 해석적 VP와 근접."""
    import cv2
    from stage3.camera import _K_from_size
    from stage3.synth import _look_at
    sz = (800.0, 600.0); K = _K_from_size(sz)
    rvec, tvec = _look_at(np.array([-8.0, -10.0, 6.0]), np.array([5.0, 3.0, 0.0]))
    strokes = []
    for y in np.linspace(0, 6, 5):
        w = np.array([[0, y, 0], [10, y, 0]], float)
        img, _ = cv2.projectPoints(w, rvec, tvec, K, None); img = img.reshape(-1, 2)
        ts = np.linspace(0, 1, 20)
        strokes.append(img[0][None] * (1 - ts[:, None]) + img[1][None] * ts[:, None])
    R, _ = cv2.Rodrigues(rvec)
    vp_true = K @ (R @ np.array([1.0, 0, 0])); vp_true = vp_true[:2] / vp_true[2]
    vps = vanishing_points(extract_construction_lines(strokes))
    assert vps and vps[0]["support"] >= 3
    assert np.hypot(*(np.array(vps[0]["vp"]) - vp_true)) < 5.0
    assert construction_residual(strokes, vps) > 0.9


def test_2F_right_angle_recovers_aspect_for_rectangle():
    """2F-a: 직각가정으로 직사각 footprint 종횡비 복원 — 참값 근접(투시 단독 결정)."""
    from stage3.synth import build_synthetic
    from stage_perspective.priors import recover_aspect_rightangle, rect
    true_a = 1.6
    _, img4, sz, _ = build_synthetic(world4=rect(true_a) * 8, eye=(-8, -10, 7), target=(4, 6.4, 0))
    r = recover_aspect_rightangle(img4, sz)
    assert r["ok"]
    assert abs(r["aspect"] - true_a) / true_a < 0.15      # 무노이즈 종횡비 <15% 오차


def test_2G_frame_diff_stroke_extraction():
    """2G: 프레임차분 획 추출 — 변별로 그린 사각형 → 4획, 순서(seq) 보존."""
    import cv2
    from stage_perspective.extract import extract_from_frames
    H, W = 200, 260
    corners = [(30, 30), (230, 30), (230, 170), (30, 170)]
    canvas = np.full((H, W), 255, np.uint8)
    frames = [canvas.copy()]
    for i in range(4):
        cv2.line(canvas, corners[i], corners[(i + 1) % 4], 0, 2)
        frames.append(canvas.copy())
    strokes = extract_from_frames(frames)
    assert len(strokes) == 4
    assert [s["seq"] for s in strokes] == [0, 1, 2, 3]     # 프레임순=획순
    # 첫 획은 상단 변(대략 y≈30 수평)
    p0 = np.array([pt[:2] for pt in strokes[0]["points"]])
    assert abs(p0[:, 1].mean() - 30) < 10


def test_2F_right_angle_collapses_on_irregular():
    """2F-a 반례(§13 자기검증3): 비직교 footprint는 직각가정 IoU 붕괴 — 지표가 자명 1.0 아님."""
    from stage_perspective.priors import evaluate
    res = evaluate(n=40, seed=3)
    # 등급명은 실측 등급(V-5c 지시 0.4). 구 L1_ruler(2px)는 파서 달성한계 밖이라 폐기.
    g = "precise"
    rect_iou = res["rectangular"][g]["plane_iou_median"]
    irr_iou = res["irregular"][g]["plane_iou_median"]
    assert rect_iou > irr_iou + 0.15                      # 직사각이 비직교보다 유의하게 높음
    assert irr_iou < 0.8                                  # 비직교는 붕괴(직각가정 부적합)


def test_2H_orthogonal_polygon_recovers_L_at_low_noise():
    """2H: 다중VP로 L형(단순 직교폴리곤) L1급서 복원 — 무노이즈 IoU 높음."""
    import numpy as np
    from stage_perspective.decompose import recover_orthogonal_polygon, _project_polygon, _procrustes_iou
    L = np.array([[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]], float) * 5
    c = L.mean(0)
    img = _project_polygon(L, (c[0] - 30, c[1] - 40, 30), (float(c[0]), float(c[1]), 0.0), (800., 600.))
    r = recover_orthogonal_polygon(img, (800., 600.))
    assert r["ok"]
    assert _procrustes_iou(L, r["recovered"]) > 0.7


def test_2I_gate_flags_degenerate_not_fiterror():
    """2I: 게이트가 퇴화 시점 표시. fit_error는 실패 미예측(정직 — 종횡비 모호는 내재)."""
    import numpy as np
    from stage_perspective.failure_gate import recovery_gate
    # 거의 일직선 4점(퇴화) → 불신뢰
    degen = np.array([[100, 300], [300, 302], [500, 304], [700, 306]], float)
    assert recovery_gate(degen, (800., 600.))["reliable"] is False


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
