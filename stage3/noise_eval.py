"""3단계 카메라 정합 — 노이즈 조건 fit_error 분포 (§6.5, §6.1 등급).

무노이즈 fit_error(≈1e-16)는 폐기. 실제 손그림 투시 스케치의 4점은 프리핸드
오차를 가지므로, Quick,Draw 등급별 노이즈(§6.1)를 이미지 4점에 주입해 재측정한다.

절차: (비정형)바닥 사각형 → 알려진 무작위 카메라로 투영 → 이미지 4점에
      등급 노이즈(σ = jitter_ratio × 이미지 변 중앙길이) 주입 → 8way solvePnP
      → fit_error. 등급별 중앙값·p95·근사모드 전환율.

등급 노이즈 파라미터는 stage0/out/quickdraw_grades.json 에서.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np
from stage_perspective.noise import stable_seed   # 결정론 시드(B-0c)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.camera import fit_camera, FIT_ERROR_FAIL
from stage3.synth import build_synthetic, _look_at, default_world_quad_irregular

OUT = ROOT / "stage3" / "out"
OUT.mkdir(parents=True, exist_ok=True)


def _random_world_quad(rng) -> np.ndarray:
    """비정형 사각형(8way 동점 회피, §3.8) — 무작위 크기·비뚤림·회전."""
    base = default_world_quad_irregular()          # ~10 x 6
    s = rng.uniform(0.6, 1.6)
    base = base * s
    base = base + rng.normal(0, 0.4, base.shape)    # 모서리 비뚤림
    th = rng.uniform(0, 2 * np.pi)
    Rm = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    c = base.mean(0)
    return (base - c) @ Rm.T + c


def _random_camera(rng, world4):
    """폴리곤을 향하는 무작위 사경 카메라(눈높이 위, 바닥 윤곽 보이는 시점)."""
    c = world4.mean(0)
    cx, cy = float(c[0]), float(c[1])
    diag = float(np.hypot(*(world4.max(0) - world4.min(0))))
    az = rng.uniform(0, 2 * np.pi)
    el = rng.uniform(np.radians(25), np.radians(65))   # 바닥이 보이도록 위에서
    dist = diag * rng.uniform(1.2, 2.2)
    eye = (cx + dist * np.cos(az) * np.cos(el),
           cy + dist * np.sin(az) * np.cos(el),
           dist * np.sin(el) + diag * 0.2)
    target = (cx, cy, 0.0)
    return eye, target


def run(grade_params: dict, n=300, img_size=(800.0, 600.0), seed=0) -> dict:
    out = {}
    for grade, gp in grade_params.items():
        jr = gp["jitter_ratio"]
        rng = np.random.default_rng(stable_seed(grade, base=seed))
        errs, approx = [], 0
        for _ in range(n):
            world4 = _random_world_quad(rng)
            eye, target = _random_camera(rng, world4)
            w4, img4, sz, truth = build_synthetic(img_size=img_size, eye=eye, target=target, world4=world4)
            # 이미지 변 중앙 길이 → 등급 노이즈 σ
            edges = [np.hypot(*(img4[i] - img4[(i + 1) % 4])) for i in range(4)]
            sigma = jr * float(np.median(edges))
            img_noisy = img4 + rng.normal(0, sigma, img4.shape)
            res = fit_camera(w4, img_noisy, sz)
            if not np.isfinite(res.fit_error):
                continue
            errs.append(res.fit_error)
            if res.approximate:
                approx += 1
        errs = np.array(errs)
        out[grade] = {
            "n": int(len(errs)),
            "fit_error_median": round(float(np.median(errs)), 4),
            "fit_error_p95": round(float(np.percentile(errs, 95)), 4),
            "fit_error_mean": round(float(np.mean(errs)), 4),
            "approx_mode_rate": round(approx / max(1, len(errs)), 3),  # >0.10 → 근사(CP-0.1)
            "noise_sigma_px_ref": round(jr, 4),
        }
    return out


def fit_error_distribution(n=300) -> dict:
    """score.py 훅 — 등급별 노이즈 fit_error 분포."""
    gp = json.loads((ROOT / "stage0" / "out" / "quickdraw_grades.json").read_text(encoding="utf-8"))["noise_params"]
    return run(gp, n=n)


def main():
    dist = fit_error_distribution(n=300)
    result = {
        "spec": "§6.5 카메라 정합 fit_error(노이즈 조건); 무노이즈(1e-16) 폐기",
        "noise": "이미지 4점에 등급 노이즈 σ=jitter_ratio×이미지변중앙길이 주입",
        "fail_threshold": FIT_ERROR_FAIL,
        "by_grade": dist,
    }
    (OUT / "fit_error_noise.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(dist, ensure_ascii=False, indent=2))
    print("\n-> stage3/out/fit_error_noise.json")


if __name__ == "__main__":
    main()
