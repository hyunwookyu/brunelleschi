"""3단계 카메라 정합 오프라인 테스트 (§6.5 재투영 오차, §3.8 8way 탐색, CP-0.1 근사 모드)."""
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ir.schema import IR
from stage3.camera import fit_camera, to_view, FIT_ERROR_FAIL
from stage3.synth import build_synthetic, default_world_rect, default_world_quad_irregular


def test_synthetic_recovery_low_error():
    """(a) 알려진 카메라+사각형 → fit_camera 복원, fit_error<0.05, 재투영 수 픽셀 이내."""
    world4, image4, img_size, truth = build_synthetic()
    res = fit_camera(world4, image4, img_size)
    assert res.ok and not res.approximate
    assert res.fit_error < 0.05

    world3 = np.hstack([world4, np.zeros((4, 1))])
    import cv2
    reproj, _ = cv2.projectPoints(world3, res.rvec, res.tvec, res.K, None)
    reproj = reproj.reshape(-1, 2)
    px_err = np.sqrt(np.sum((reproj - image4[res.perm]) ** 2, axis=1))
    assert np.all(px_err < 2.0)          # 수 픽셀 이내(§6.5)


def test_8way_search_survives_rotated_reversed_input_order():
    """(b) 이미지 4점을 순환/반전시켜 입력해도(사용자가 다른 시작점·방향으로 클릭한 상황)
    8way 전수 탐색이 올바른 대응을 찾아 낮은 fit_error를 유지한다.

    완전 직사각형은 순열 간 수학적 동점이 생길 수 있어(평면 포즈의 표준 2중 모호성 ×
    평행사변형 대칭, §3.8) 비정형 사각형(default_world_quad_irregular)으로 검증한다 —
    실제 손그림 폴리곤도 완전한 평행사변형이 아니므로 이 쪽이 더 현실적이다.
    """
    world4, image4, img_size, truth = build_synthetic(world4=default_world_quad_irregular())
    baseline = fit_camera(world4, image4, img_size)
    assert baseline.ok and baseline.fit_error < 1e-6

    for shift in range(4):
        for rev in (False, True):
            order = list(range(4))
            order = order[shift:] + order[:shift]
            if rev:
                order = list(reversed(order))
            shuffled = image4[order]
            res = fit_camera(world4, shuffled, img_size)
            assert res.ok and not res.approximate, "failed for order %s" % order
            assert res.fit_error < 1e-6, "order %s -> fit_error %s" % (order, res.fit_error)
            # perm이 셔플을 올바로 되돌리는지: shuffled[perm] == 원본 image4 순서
            recovered_order = shuffled[res.perm]
            assert np.allclose(recovered_order, image4, atol=1e-6)


def test_to_view_passes_ir_validate():
    """(c) to_view가 만든 View가 IR(views=[view]).validate() == []."""
    world4, image4, img_size, truth = build_synthetic()
    res = fit_camera(world4, image4, img_size)
    view = to_view("sk_01", res)
    assert IR(views=[view]).validate() == []
    assert view.fit_error is not None and view.fit_error < FIT_ERROR_FAIL


def test_degenerate_triggers_approximate_mode():
    """(d) 대응점 부족/일직선 → 예외 없이 근사 모드로 전환."""
    img_size = (800.0, 600.0)

    # 4점 미만
    res_missing = fit_camera(default_world_rect()[:3], np.array([[10, 10], [20, 10], [20, 20]]), img_size)
    assert res_missing.approximate and not res_missing.ok

    # 일직선(면적 0)
    collinear_world = np.array([[0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [3.0, 0.0]])
    collinear_image = np.array([[10.0, 10.0], [20.0, 10.0], [30.0, 10.0], [40.0, 10.0]])
    res_collinear = fit_camera(collinear_world, collinear_image, img_size)
    assert res_collinear.approximate and not res_collinear.ok

    # to_view는 근사 모드에서도 크래시 없이 유효한 View를 만든다
    view = to_view("sk_bad", res_collinear)
    assert view.camera.get("mode") == "approximate"
    assert IR(views=[view]).validate() == []


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([str(Path(__file__)), "-q"]))
