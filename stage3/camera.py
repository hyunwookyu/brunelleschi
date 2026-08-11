"""3단계 카메라 정합 — 호모그래피 4점 (§3.8).

평면 폴리곤 4점(world, Z=0) ↔ 투시 스케치 4점(image) 대응으로 카메라를 복원한다.
  평면 4점 ↔ 투시 4점 → cv2.findHomography(진단용) → solvePnP → 카메라 확정

대응 순서(폴리곤 시작점·순회 방향)를 모르므로 순환 4 × 반전 2 = 8가지를 전수
탐색해 재투영 오차 최소를 채택한다(§3.8 "탐색 공간이 작아 최적화가 필요 없다").

실패 조건(§3.8): 바닥 윤곽이 없거나(대응점 부족/퇴화) fit_error > 0.10(CP-0.1,
CLAUDE.md §8) → 근사 모드(View.camera={"mode":"approximate"}).
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
import sys
import numpy as np
import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import View

FIT_ERROR_FAIL = 0.10   # CP-0.1 (CLAUDE.md §8) — 이 값 초과 시 근사 모드


def _K_from_size(img_size: tuple[float, float]) -> np.ndarray:
    """초점거리 근사 = max(w,h), 주점 = 이미지 중심 (§3.8 fSpy 최소 보정 가정)."""
    w, h = img_size
    f = float(max(w, h))
    return np.array([[f, 0.0, w / 2.0],
                      [0.0, f, h / 2.0],
                      [0.0, 0.0, 1.0]], dtype=float)


def _correspondences(n: int = 4) -> list[list[int]]:
    """순환 4 × 반전 2 = 8가지 인덱스 순열(§3.8). world 순서는 고정, image 쪽에 적용."""
    idx = list(range(n))
    perms = []
    for r in range(n):
        rot = idx[r:] + idx[:r]
        perms.append(rot)
        perms.append(list(reversed(rot)))
    return perms


def _is_degenerate(pts: np.ndarray, eps: float = 1e-6) -> bool:
    """4점이 <4개거나 (거의) 일직선/면적 0에 가까우면 True.
    신발끈공식 면적 대 bbox 넓이 비로 판정 — 순수 스케일 불변.
    """
    if pts.shape[0] < 4:
        return True
    area = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i][:2]
        x2, y2 = pts[(i + 1) % n][:2]
        area += x1 * y2 - x2 * y1
    area = abs(area) / 2.0
    # numpy2: arr.ptp() 제거됨 → np.ptp(arr) 함수형으로 사용
    span = float(np.ptp(pts[:, 0])) * float(np.ptp(pts[:, 1]))
    if span < eps:
        return True
    return (area / span) < 1e-4


@dataclass
class FitResult:
    ok: bool
    fit_error: float
    K: np.ndarray | None = None
    rvec: np.ndarray | None = None
    tvec: np.ndarray | None = None
    R: np.ndarray | None = None
    perm: list[int] = field(default_factory=list)
    approximate: bool = False
    reason: str = ""


def homography_only(world4, image4) -> np.ndarray | None:
    """평면 4점 → 이미지 4점 호모그래피만 (퇴화/진단용 경로, §3.8).
    solvePnP 없이 순수 2D 사영변환만 필요할 때, 또는 solvePnP 실패 시 참고용.
    """
    src = np.asarray(world4, dtype=float)[:, :2]
    dst = np.asarray(image4, dtype=float)
    if src.shape[0] != 4 or dst.shape[0] != 4:
        return None
    H, _ = cv2.findHomography(src, dst, method=0)
    return H


def fit_camera(world4, image4, img_size: tuple[float, float]) -> FitResult:
    """8way 대응 전수 탐색 → solvePnP(평면점=IPPE, 실패시 ITERATIVE) →
    재투영오차 최소 채택(§3.8). fit_error = RMS(reproj-image)/이미지대각선(§6.5).
    """
    world = np.asarray(world4, dtype=float)
    image = np.asarray(image4, dtype=float)

    if world.shape[0] != 4 or image.shape[0] != 4:
        return FitResult(ok=False, fit_error=float("inf"), approximate=True,
                          reason="need exactly 4 correspondences (got world=%d image=%d)"
                          % (world.shape[0], image.shape[0]))
    if _is_degenerate(world) or _is_degenerate(image):
        return FitResult(ok=False, fit_error=float("inf"), approximate=True,
                          reason="degenerate points (collinear or near-zero area)")

    world3 = world if world.shape[1] == 3 else np.hstack([world, np.zeros((4, 1))])
    world3 = np.ascontiguousarray(world3, dtype=float)

    K = _K_from_size(img_size)
    diag = float(np.hypot(*img_size))
    best: FitResult | None = None

    for perm in _correspondences(4):
        img_p = np.ascontiguousarray(image[perm], dtype=float)
        ok = False
        try:
            ok, rvec, tvec = cv2.solvePnP(world3, img_p, K, None, flags=cv2.SOLVEPNP_IPPE)
        except cv2.error:
            ok = False
        if not ok:
            try:
                ok, rvec, tvec = cv2.solvePnP(world3, img_p, K, None, flags=cv2.SOLVEPNP_ITERATIVE)
            except cv2.error:
                ok = False
        if not ok:
            continue

        reproj, _ = cv2.projectPoints(world3, rvec, tvec, K, None)
        reproj = reproj.reshape(-1, 2)
        rms = float(np.sqrt(np.mean(np.sum((reproj - img_p) ** 2, axis=1))))
        err = rms / diag
        if best is None or err < best.fit_error:
            R, _ = cv2.Rodrigues(rvec)
            best = FitResult(ok=True, fit_error=err, K=K, rvec=rvec, tvec=tvec, R=R, perm=perm)

    if best is None:
        return FitResult(ok=False, fit_error=float("inf"), approximate=True,
                          reason="solvePnP failed for all 8 correspondences")
    if best.fit_error > FIT_ERROR_FAIL:
        best.approximate = True
        best.reason = "fit_error %.4f > %.2f (CP-0.1) -> approximate mode" % (best.fit_error, FIT_ERROR_FAIL)
    return best


def to_view(src: str, result: FitResult) -> View:
    """FitResult → IR View (§3.2 views 스키마). camera 하위값은 JSON 직렬화 가능한 리스트로."""
    if result.approximate or not result.ok:
        fe = None if result.fit_error == float("inf") else result.fit_error
        return View(src=src, camera={"mode": "approximate", "reason": result.reason}, fit_error=fe)
    return View(src=src, camera={
        "K": result.K.tolist(),
        "rvec": result.rvec.reshape(-1).tolist(),
        "tvec": result.tvec.reshape(-1).tolist(),
        "R": result.R.tolist(),
        "perm": list(result.perm),
    }, fit_error=result.fit_error)


def approximate_from_utterance(hint: str = "") -> dict:
    """§3.8 우회 경로: 투시에 바닥 윤곽이 없어(위를 보는 시점/내부 시점) 4점 대응이
    불가능할 때, 발화로 받은 근사 시점 힌트로 대략적 카메라를 세운다.

    스텁 — 자연어 hint 파싱은 하지 않는다(2단계 발화 번역 문법의 몫). 여기서는
    "확인 용도로는 성립"(§3.8) 수준의 고정 기본값만 반환한다: 눈높이에서 살짝
    아래를 보는 정면 카메라. 실제 힌트 해석이 필요해지면 stage2 번역 출력을
    받아 카메라 회전만 조정하는 확장으로 붙인다.
    """
    return {"mode": "approximate", "hint": hint,
            "note": "front-ish default: eye-level, slight down-tilt, no metric recovery"}


if __name__ == "__main__":
    from stage3.synth import build_synthetic, default_world_quad_irregular
    # 비정형 사각형 사용: 완전 직사각형은 대응 순열에 수학적 동점이 생겨(§3.8 참고, synth.py 주석)
    # 데모에서 임의의 동점 해가 뽑힐 수 있다 — 실제 손그림 폴리곤과 같은 비정형 4점으로 시연.
    world4, image4, img_size, truth = build_synthetic(world4=default_world_quad_irregular())
    res = fit_camera(world4, image4, img_size)
    print("=== stage3/camera.py demo (synthetic) ===")
    print("fit_error:", res.fit_error, " approximate:", res.approximate, " perm:", res.perm)
    print("true  rvec:", truth["rvec"].ravel(), " tvec:", truth["tvec"].ravel())
    if res.ok:
        print("recov rvec:", res.rvec.ravel(), " tvec:", res.tvec.ravel())
    v = to_view("sk_demo", res)
    print("View:", v)
