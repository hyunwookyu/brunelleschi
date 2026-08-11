"""3단계 합성 검증 데이터 (§6.5 카메라 정합 = 재투영 오차).

알려진 world 사각형 + 알려진 카메라(K,R,t)로 4모서리를 이미지에 투영해
정답이 있는 테스트 데이터를 만든다. fit_camera가 이 정답을 복원하는지 검증하는 데 쓴다.

world 좌표계는 §3.2 footprint 관례를 따른다: (x,y) 평면, Z=0, 무차원 단위.
"""
from __future__ import annotations
from pathlib import Path
import sys
import numpy as np
import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.camera import _K_from_size  # noqa: E402  (내부 헬퍼 재사용)


def _look_at(eye: np.ndarray, target: np.ndarray, up: np.ndarray = np.array([0.0, 0.0, 1.0])):
    """world eye/target/up → OpenCV 외부파라미터 (rvec, tvec).
    world_pt(카메라계) = R @ world_pt(월드계) + t,  eye가 카메라 원점.
    """
    fwd = target - eye
    fwd = fwd / np.linalg.norm(fwd)
    right = np.cross(fwd, up)
    right = right / np.linalg.norm(right)
    true_up = np.cross(right, fwd)
    # 카메라축: x=right, y=-true_up(이미지 y는 아래로), z=fwd(광축)
    R = np.stack([right, -true_up, fwd], axis=0)  # 3x3, world->camera 회전
    t = -R @ eye
    rvec, _ = cv2.Rodrigues(R)
    return rvec, t.reshape(3, 1)


def default_world_rect() -> np.ndarray:
    """바닥 폴리곤 4모서리(world, Z=0) — stage1 footprint 스타일 무차원 사각형."""
    return np.array([[0.0, 0.0], [10.0, 0.0], [10.0, 6.0], [0.0, 6.0]])


def default_world_quad_irregular() -> np.ndarray:
    """완전 평행사변형이 아닌 4점(대응 순열 판별용).

    수학적 사실: 완전한 직사각형/평행사변형은 단일 시점 평면 포즈에 내재하는
    2중 모호성(§3.8 IPPE 표준 결과)이 대응 순열의 대칭(180도 회전/반전)과 겹쳐
    최대 4가지 순열이 재투영오차 0으로 동점을 이룬다 — 8way 탐색으로도 원천적으로
    구분 불가능하다(알고리즘 결함이 아님). 실제 손그림 폴리곤은 완전 평행사변형이
    아니므로(§5.3 정규화 전 원 스케치는 미세하게 비뚤다) 이 비정형 사각형으로
    대응 순열 판별을 검증한다.
    """
    return np.array([[0.0, 0.0], [10.0, 0.0], [9.3, 6.4], [0.6, 6.1]])


def build_synthetic(img_size=(800.0, 600.0), eye=(-6.0, -8.0, 5.0), target=(5.0, 3.0, 0.0),
                     noise_std: float = 0.0, seed: int | None = 0, world4: np.ndarray | None = None):
    """알려진 카메라로 world4 → image4 투영. (world4, image4, img_size, truth) 반환.

    truth = {"rvec","tvec","K","eye","target"} — fit_camera 복원 결과와 대조용.
    noise_std>0 이면 이미지점에 가우시안 픽셀 노이즈를 더한다(합성 vs 실측 격차 시뮬레이션, §6.1식).
    world4 미지정 시 기본 직사각형(§3.8 텍스트상 "rectangle") 사용.
    """
    if world4 is None:
        world4 = default_world_rect()
    world3 = np.hstack([world4, np.zeros((4, 1))])

    K = _K_from_size(img_size)
    rvec, tvec = _look_at(np.array(eye, dtype=float), np.array(target, dtype=float))

    img_pts, _ = cv2.projectPoints(world3, rvec, tvec, K, None)
    img_pts = img_pts.reshape(-1, 2)

    if noise_std > 0:
        rng = np.random.default_rng(seed)
        img_pts = img_pts + rng.normal(0.0, noise_std, img_pts.shape)

    truth = {"rvec": rvec, "tvec": tvec, "K": K, "eye": np.array(eye), "target": np.array(target)}
    return world4, img_pts, img_size, truth


if __name__ == "__main__":
    world4, image4, img_size, truth = build_synthetic(world4=default_world_quad_irregular())
    print("=== stage3/synth.py demo ===")
    print("world4:\n", world4)
    print("image4:\n", image4)
    print("img_size:", img_size)
    print("true rvec:", truth["rvec"].ravel())
    print("true tvec:", truth["tvec"].ravel())

    from stage3.camera import fit_camera
    res = fit_camera(world4, image4, img_size)
    print("recovered fit_error:", res.fit_error, "perm:", res.perm)
