"""투시 복원 평가 2C — 노이즈(등급 프록시) 대비 복원 품질 경계 (지시서 트랙2 2E).

"평면 없이 투시 단독으로 어디까지 되는가"에 라벨 없는 실측으로 답한다.
투시 4점에 픽셀 노이즈(프리핸드 프록시)를 주입하며 복원 품질을 측정:
  - 카메라 오차(위치·방향·초점거리)
  - 역투영 평면 IoU (2A 정답 대조)
  - 재투영 오차(2B 무정답 지표 a)
  - 직교 잔차(2B 지표 c — 복원 모서리 직교성)

노이즈 등급 매핑: L1(자·구축선)≈2px, L2(프리핸드 일부)≈8px, L3(컨셉)≈20px.
'정확도 추측' 금지 — 아래는 전부 측정값.
출력: stage0/out/perspective_eval.json
"""
from __future__ import annotations
import sys, json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.synth import build_synthetic, _look_at
from stage3.camera import fit_camera
from stage_perspective.reconstruct import reconstruct, _norm

# 노이즈 → 등급. **실측 근거판**(stage_perspective/noise.py, 지시 0.4).
# 구판 GRADE_NOISE={2,8,20}px는 임의 절대픽셀이었다(L1은 파서 달성한계의 1/3.5로 낙관).
# 이제 등급별 코너오차 비율 × 표본 대각. 등급명도 실측 등급(precise/medium/coarse)으로.
from stage_perspective.noise import grade_ratios, add_corner_noise, stable_seed
GRADE_NOISE = grade_ratios()


def _rand_quad(rng):
    base = np.array([[0, 0], [10, 0], [9.3, 6.4], [0.6, 6.1]], float)
    base = base * rng.uniform(0.7, 1.5) + rng.normal(0, 0.3, base.shape)
    return base


def _rand_cam(rng, quad):
    c = quad.mean(0); diag = float(np.hypot(*(quad.max(0) - quad.min(0))))
    az = rng.uniform(0, 2 * np.pi); el = rng.uniform(np.radians(20), np.radians(60))
    dist = diag * rng.uniform(1.3, 2.4)
    eye = (c[0] + dist * np.cos(az) * np.cos(el), c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.2)
    return eye, (float(c[0]), float(c[1]), 0.0)


def _reproj_error(plan4, persp_noisy, img_size):
    """무정답 지표 a: 복원 카메라로 되쏜 4점 vs 관측 투시점 RMS/대각."""
    import cv2
    res = fit_camera(plan4, persp_noisy, img_size)
    if not res.ok:
        return None
    world3 = np.hstack([plan4, np.zeros((4, 1))])
    reproj, _ = cv2.projectPoints(world3, res.rvec, res.tvec, res.K, None)
    reproj = reproj.reshape(-1, 2)
    diag = float(np.hypot(*img_size))
    return float(np.sqrt(np.mean(np.sum((reproj - persp_noisy[res.perm]) ** 2, 1))) / diag)


def _ortho_residual(recovered):
    """지표 c: 복원 4각형 모서리 직교성 잔차(도). 건축물 사전지식."""
    p = np.asarray(recovered, float); res = []
    for i in range(len(p)):
        a = p[(i - 1) % len(p)] - p[i]; b = p[(i + 1) % len(p)] - p[i]
        na, nb = np.hypot(*a), np.hypot(*b)
        if na < 1e-9 or nb < 1e-9:
            continue
        ang = np.degrees(np.arccos(np.clip(np.dot(a, b) / (na * nb), -1, 1)))
        res.append(abs(ang - 90))
    return float(np.median(res)) if res else None


def run(n=200, seed=0):
    out = {}
    for grade, ratio in GRADE_NOISE.items():
        rng = np.random.default_rng(stable_seed(grade, base=seed))
        ious, fiterr, reproj, ortho, fails = [], [], [], [], 0
        aerr = []   # 종횡비 상대오차(1급 지표, 지시 1-ter A) — 역수 동치
        oious = []  # 방위 유지 IoU(구 지표) — D-1b로 용도 구분해 병기
        for _ in range(n):
            quad = _rand_quad(rng); eye, target = _rand_cam(rng, quad)
            w4, img4, sz, _t = build_synthetic(img_size=(800, 600), eye=eye, target=target, world4=quad)
            noisy = add_corner_noise(img4, ratio, rng)
            r = reconstruct(quad, noisy, sz)
            if not r["ok"]:
                fails += 1; continue
            ious.append(r["plane_iou"]); fiterr.append(r["fit_error"])
            if r.get("oriented_iou") is not None: oious.append(r["oriented_iou"])
            from stage_perspective.metric_audit import polygon_aspect, aspect_rel_err
            ae = aspect_rel_err(polygon_aspect(r["recovered_plane"]), polygon_aspect(quad))
            if np.isfinite(ae):
                aerr.append(ae)
            re = _reproj_error(quad, noisy, sz)
            if re is not None:
                reproj.append(re)
            orr = _ortho_residual(r["recovered_plane"])
            if orr is not None:
                ortho.append(orr)
        def q(a, p): return round(float(np.percentile(a, p)), 4) if a else None
        out[grade] = {
            "corner_err_ratio": ratio, "n": n, "fail_rate": round(fails / n, 3),
            "plane_iou_median": q(ious, 50), "plane_iou_p10": q(ious, 10),
            "aspect_rel_err_median": q(aerr, 50), "aspect_rel_err_p90": q(aerr, 90),
            "oriented_iou_median": q(oious, 50),
            "camera_fit_error_median": q(fiterr, 50), "camera_fit_error_p95": q(fiterr, 95),
            "reproj_error_median": q(reproj, 50), "ortho_residual_median_deg": q(ortho, 50),
        }
    return out


def main():
    res = run(n=200)
    boundary = _boundary(res)
    report = {
        "spec": "트랙2 2C — 투시 단독 복원 품질 경계(노이즈=등급 프록시). 전부 측정값.",
        "note": "2A 정답 대조(plane_iou) + 무정답 지표(reproj/ortho). 작도 영상 이상선 → 노이즈 주입으로 프리핸드 근사.",
        "by_grade": res,
        "parsing_boundary": boundary,
        "answers": {
            "평면없이 투시단독 어디까지": ", ".join(
                f"{g} IoU중앙 {d['plane_iou_median']}" for g, d in res.items()),
            "§3.8 평면병용 완화 가능?": boundary,
        },
    }
    (ROOT / "stage0" / "out" / "perspective_eval.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=2))


def _boundary(res):
    # IoU 중앙값 0.5를 경계로 어느 등급까지 유의미한지
    ok = [g for g, d in res.items() if (d["plane_iou_median"] or 0) >= 0.5]
    return f"IoU중앙≥0.5 유지 등급: {ok or '없음'} → 그 이하는 복원 무의미(§5.3 경계)"


if __name__ == "__main__":
    main()
