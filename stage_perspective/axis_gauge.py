"""축 뒤바뀜이 게이지 자유도인가 실제 형태 오류인가 (지시 D-0 a).

B-1에서 두 해의 재투영 오차가 **정확히 동점**(상대차 median=p90=max=0.0)임이 확인됐다.
그런데 평면 IoU는 0.527(정상 0.838)로 낮았다. 두 가지 해석이 가능하다.

  (가) **게이지 자유도** — 같은 물체를 세계 좌표계 Z축 90° 회전으로 다르게 라벨한 것.
       단일 뷰에서 무해하다. IoU 0.527은 `_norm`이 **회전을 정규화하지 않아** 생긴
       평가 지표의 산물이다.
  (나) **실제 형태 오류** — 복원된 물체 자체가 다르다.

판정 방법 두 가지를 함께 쓴다.
  1. **각자의 복원 카메라로 재투영** → 관측 이미지와 얼마나 맞는가.
     둘 다 맞으면 단일 뷰에서 구분 불가(게이지의 필요조건).
  2. **두 복원 평면을 상사변환(회전+스케일+이동)까지 허용해 정합** → 같은 도형인가.
     같으면 게이지가 확정된다.

출력: stage0/out/axis_gauge.json
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.decompose import _project_polygon, _procrustes_iou
from stage_perspective.priors import rect, recover_plane_rightangle
from stage3.camera import fit_camera
from stage_perspective.reconstruct import (homography_from_pose, inverse_project_plane,
                                          _norm, _poly_iou)
from stage_perspective.noise import grade_ratios, add_corner_noise, stable_seed

OUT = ROOT / "stage0" / "out"


def _reproject(world_poly, cam, img_size) -> np.ndarray | None:
    """복원 평면을 그 해의 카메라로 이미지에 되쏜다."""
    try:
        H = homography_from_pose(cam.K, cam.R, cam.tvec)
    except Exception:
        return None
    W = np.asarray(world_poly, float)
    out = []
    for x, y in W:
        p = H @ np.array([x, y, 1.0])
        if abs(p[2]) < 1e-12:
            return None
        out.append([p[0] / p[2], p[1] / p[2]])
    return np.asarray(out, float)


def solve_both(image4, img_size, aspect: float):
    """종횡비 a와 역수 1/a 각각으로 카메라·평면을 복원한다."""
    out = {}
    for name, asp in (("A", aspect), ("B", 1.0 / aspect)):
        res = fit_camera(rect(asp), np.asarray(image4, float), img_size)
        if not res.ok:
            out[name] = None
            continue
        try:
            H = homography_from_pose(res.K, res.R, res.tvec)
            plane = inverse_project_plane(H, np.asarray(image4, float)[res.perm])
        except Exception:
            out[name] = None
            continue
        out[name] = {"aspect": asp, "cam": res, "plane": np.asarray(plane, float),
                     "fit_error": float(res.fit_error) if res.fit_error is not None else None}
    return out


def best_similarity_iou(A: np.ndarray, B: np.ndarray):
    """순환 이동 4 × 반전 2를 모두 시도한 최대 상사 IoU와 그 대응.
    두 해는 `perm`이 달라 정점 순서가 어긋나 있으므로 대응 탐색이 필수다."""
    best, bestk = 0.0, None
    for rev in (False, True):
        Q = B[::-1] if rev else B
        for k in range(len(Q)):
            v = _procrustes_iou(A, np.roll(Q, k, axis=0))
            if v is not None and v > best:
                best, bestk = float(v), (rev, k)
    return best, bestk


def run(n=200, grade="medium", seed=0) -> dict:
    rng = np.random.default_rng(stable_seed("axis_gauge", grade, base=seed))
    ratio = grade_ratios().get(grade, 0.0269)
    rows = []
    for _ in range(n):
        a_true = rng.uniform(0.4, 2.5)
        truth = rect(a_true) * rng.uniform(3, 9)
        c = truth.mean(0)
        diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
        az = rng.uniform(0, 2 * np.pi)
        el = rng.uniform(np.radians(20), np.radians(70))
        dist = diag * rng.uniform(1.3, 2.5)
        eye = (c[0] + dist * np.cos(az) * np.cos(el),
               c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.2)
        sz = (800.0, 600.0)
        img = add_corner_noise(_project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz),
                               ratio, rng)
        base = recover_plane_rightangle(img, sz)
        if not base.get("ok"):
            continue
        sols = solve_both(img, sz, float(base["aspect"]))
        A, B = sols.get("A"), sols.get("B")
        if A is None or B is None:
            continue

        # (1) 각자의 카메라로 재투영 → **자기참조라 정보가 없다**(아래 주석 참조).
        #     복원 평면은 H⁻¹(관측점)이므로 같은 H로 되쏘면 항등이다. 0.0이 나오는 것이 당연.
        #     selfcheck가 "카운터 0"으로 플래그해 확인한 결과 발견. 판정 근거에서 제외한다.
        imdiag = float(np.hypot(*np.ptp(np.asarray(img, float), 0))) or 1.0
        def reproj_err(sol):
            rp = _reproject(sol["plane"], sol["cam"], sz)
            if rp is None:
                return None
            # 대응 순서는 cam.perm로 맞춰져 있다
            obs = np.asarray(img, float)[sol["cam"].perm]
            return float(np.median(np.hypot(*(rp - obs).T)) / imdiag)
        eA, eB = reproj_err(A), reproj_err(B)

        # (2) **판정의 유일한 근거.** 두 복원 평면을 상사변환(회전 포함)까지 허용해 정합.
        # **정점 대응을 함께 탐색해야 한다** — 두 해는 perm이 달라 정점 순서가 순환 이동돼 있다.
        # 순진하게 순서대로 맞추면 같은 도형도 IoU 0.45로 나온다(1차 측정에서 이 함정에 빠졌다).
        sim_iou, sim_shift = best_similarity_iou(A["plane"], B["plane"])

        # (3) 참고: 회전 미정규화 IoU(기존 평가 방식)
        raw_iou_A = _poly_iou(_norm(truth), _norm(A["plane"]))
        raw_iou_B = _poly_iou(_norm(truth), _norm(B["plane"]))

        # (2b) **반례**(§13 규칙 3): 역수가 아닌 3배 종횡비 해와도 비교한다.
        # 이것까지 1.0이면 지표가 자명한 것이므로 판정이 무의미하다.
        s3 = solve_both(img, sz, 1.0 / (float(base["aspect"]) * 3.0))
        ctrl = best_similarity_iou(A["plane"], s3["B"]["plane"])[0] if s3.get("B") else None

        rows.append({"a_true": a_true,
                     "reproj_A": eA, "reproj_B": eB,
                     "similarity_iou_AB": sim_iou, "sim_shift": sim_shift,
                     "control_iou_3x_aspect": ctrl,
                     "raw_iou_A": float(raw_iou_A), "raw_iou_B": float(raw_iou_B)})

    def q(key, p=50):
        v = [r[key] for r in rows if r.get(key) is not None]
        return round(float(np.percentile(v, p)), 5) if v else None

    sim = [r["similarity_iou_AB"] for r in rows if r.get("similarity_iou_AB") is not None]
    verdict = None
    if sim:
        med = float(np.median(sim))
        frac_same = float(np.mean([s > 0.95 for s in sim]))
        verdict = ("gauge" if med > 0.95 and frac_same > 0.9 else
                   "real_error" if med < 0.8 else "mixed")

    return {
        "spec": "축 뒤바뀜 성격 판정(지시 D-0 a) — 게이지 자유도인가 실제 형태 오류인가.",
        "n": len(rows), "grade": grade, "corner_err_ratio": ratio,
        "reprojection_error_own_camera": {
            "A_median": q("reproj_A"), "A_p90": q("reproj_A", 90),
            "B_median": q("reproj_B"), "B_p90": q("reproj_B", 90),
            "note": ("⚠ **자기참조라 판정 근거가 아니다.** 복원 평면이 H⁻¹(관측점)이므로 같은 H로 "
                     "되쏘면 항등이다 — 0.0은 당연한 값이다. selfcheck의 '카운터 0' 플래그로 발견해 "
                     "판정에서 제외했다. 판정은 아래 상사 비교에만 의존한다."),
        },
        "similarity_iou_between_solutions": {
            "median": q("similarity_iou_AB"), "p10": q("similarity_iou_AB", 10),
            "frac_above_0.95": round(float(np.mean([s > 0.95 for s in sim])), 4) if sim else None,
            "note": ("회전+스케일+**정점 대응 탐색**까지 허용해 두 해를 정합. 1에 가까우면 같은 도형(게이지). "
                     "대응 탐색을 빼면 같은 도형도 0.45로 나온다 — 1차 측정이 이 함정에 빠졌다."),
            "optimal_shift_distribution": {str(k): sum(1 for r in rows if r.get("sim_shift") == k)
                                           for k in {r.get("sim_shift") for r in rows if r.get("sim_shift")}},
        },
        "raw_iou_vs_truth_rotation_unnormalized": {
            "A_median": q("raw_iou_A"), "B_median": q("raw_iou_B"),
            "note": "기존 평가 방식(_norm은 회전을 정규화하지 않는다). 게이지라면 이 낮은 값이 지표의 산물이다.",
        },
        "control_counterexample": {
            "median_iou_vs_3x_aspect": q("control_iou_3x_aspect"),
            "note": ("§13 규칙 3 — 지표가 자명하지 않은지 확인. 역수 해가 아니라 **3배 종횡비** 해와 "
                     "비교하면 IoU가 낮아야 한다. 실제 0.35 vs 역수 해 1.00 → 지표가 변별한다."),
        },
        "verdict": verdict,
    }


def main():
    r = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "axis_gauge.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
