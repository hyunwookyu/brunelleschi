"""투시 종횡비 결정 2F — 건축 사전지식으로 세계 종횡비를 뽑을 수 있는가 (지시서 트랙2 2F).

2B에서 확인된 원리적 제약: 소실점은 카메라 방향만 주고 세계 종횡비는 미결정.
사전지식 제약을 걸어 종횡비 결정 가능성을 2A 정답 대비로 수치화한다.

2F-a 직각 가정: 평면 코너=90°(직사각형)면 종횡비 결정 = fSpy 2-VP 원리.
  구현: 세계 사각형을 rect(1,a)로 두고 a를 탐색, 투시4점 재투영오차 최소 a 채택.
  직사각 truth → a 정확 복원, IoU 높음. 비직교 truth → 최적근사 rect, IoU 붕괴(정량).
2F-d 발화 앵커: 치수 있으면 종횡비 확정(자명). 발화 비율은 코퍼스로 측정.
2F-b 수직 직립 / 2F-c 반복 모듈: 수직획·모듈 검출 필요 → 구조만(후속).
"""
from __future__ import annotations
import sys, json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage3.camera import fit_camera
from stage_perspective.reconstruct import homography_from_pose, inverse_project_plane, _norm, _poly_iou


def rect(a: float) -> np.ndarray:
    """단위 폭 × 종횡비 a 직사각형."""
    return np.array([[0, 0], [1, 0], [1, a], [0, a]], float)


def recover_aspect_rightangle(image4: np.ndarray, img_size, a_lo=0.2, a_hi=5.0, iters=40) -> dict:
    """2F-a: 직각(직사각형) 가정으로 종횡비 a 복원. 황금분할 탐색 min 재투영오차."""
    gr = (np.sqrt(5) - 1) / 2
    lo, hi = a_lo, a_hi
    def err(a):
        r = fit_camera(rect(a), image4, img_size)
        return r.fit_error if r.ok else 1e9
    c = hi - gr * (hi - lo); d = lo + gr * (hi - lo)
    fc, fd = err(c), err(d)
    for _ in range(iters):
        if fc < fd:
            hi, d, fd = d, c, fc; c = hi - gr * (hi - lo); fc = err(c)
        else:
            lo, c, fc = c, d, fd; d = lo + gr * (hi - lo); fd = err(d)
    a = (lo + hi) / 2
    res = fit_camera(rect(a), image4, img_size)
    # 축 라벨 모호(지시 1-ter B): rect(a)와 rect(1/a)는 90° 회전한 같은 도형이므로
    # 8way 대응 탐색이 두 해를 거의 동점으로 본다. 어느 변을 '폭'이라 부를지는
    # 기하가 정하지 못한다 → 고른 해와 대안을 함께 반환하고, 추정하지 않는다.
    # 실측: 뒤바뀜 28.75%, 그 경우 IoU 0.527(정상 0.838) — 2F 최대 식별 오차원.
    return {"aspect": float(a), "aspect_alt": float(1.0 / a) if a > 1e-9 else None,
            "perm": (list(res.perm) if getattr(res, "perm", None) is not None else None),
            "axis_ambiguous": True,
            "fit_error": float(res.fit_error) if res.ok else None, "ok": res.ok, "cam": res}


def recover_plane_rightangle(image4: np.ndarray, img_size) -> dict:
    """직각 가정으로 카메라+평면 복원 → 역투영 평면."""
    rec = recover_aspect_rightangle(image4, img_size)
    if not rec["ok"]:
        return {"ok": False}
    res = rec["cam"]
    H = homography_from_pose(res.K, res.R, res.tvec)
    recovered = inverse_project_plane(H, image4[res.perm])
    return {"ok": True, "aspect": rec["aspect"], "fit_error": rec["fit_error"],
            "recovered_plane": recovered,
            "axis": {"ambiguous": True, "aspect": rec["aspect"],
                     "aspect_alt": rec["aspect_alt"], "perm": rec["perm"]}}


# --- 평가: 직사각 vs 비직교 truth, 등급별, 직각가정 IoU ---
def _irregular_quad(rng, skew):
    """비직교 사각형 — skew=0이면 직사각, 클수록 비뚤."""
    base = rect(rng.uniform(0.5, 2.0))
    base = base + rng.normal(0, skew, base.shape)
    return base


def evaluate(n=150, seed=0):
    from stage3.synth import build_synthetic
    from stage_perspective.noise import grade_ratios, add_corner_noise, stable_seed
    GRADE_NOISE = grade_ratios()   # 실측 코너오차 비율(지시 0.4)
    out = {}
    for kind, skew in [("rectangular", 0.0), ("irregular", 0.15)]:
        out[kind] = {}
        for grade, ratio in GRADE_NOISE.items():
            rng = np.random.default_rng(stable_seed(kind, grade, base=seed))
            ious, aerr, holds = [], [], 0
            for _ in range(n):
                truth = _irregular_quad(rng, skew) * rng.uniform(4, 10)
                c = truth.mean(0); diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
                az = rng.uniform(0, 2 * np.pi); el = rng.uniform(np.radians(25), np.radians(60))
                dist = diag * rng.uniform(1.3, 2.2)
                eye = (c[0] + dist * np.cos(az) * np.cos(el), c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.2)
                _, img4, sz, _t = build_synthetic(img_size=(800, 600), eye=eye, target=(float(c[0]), float(c[1]), 0.0), world4=truth)
                noisy = add_corner_noise(img4, ratio, rng)
                r = recover_plane_rightangle(noisy, sz)
                if not r["ok"]:
                    continue
                holds += 1
                iou = _poly_iou(_norm(truth), _norm(np.array(r["recovered_plane"])))
                ious.append(iou)
                # 참 종횡비 대비 복원 종횡비 오차. **역수 동치**로 잰다(지시 1-ter A):
                # 종횡비는 width/depth 라벨링 때문에 역수까지만 결정되므로(1-bis 성질 1),
                # 순진한 차이는 라벨 뒤바뀜(실측 28.75%)을 오차로 잡아 지표를 오염시킨다.
                from stage_perspective.metric_audit import aspect_rel_err
                true_a = (np.hypot(*(truth[3] - truth[0]))) / (np.hypot(*(truth[1] - truth[0])) + 1e-9)
                aerr.append(aspect_rel_err(r["aspect"], true_a))
            def q(x, p): return round(float(np.percentile(x, p)), 4) if x else None
            out[kind][grade] = {"corner_err_ratio": ratio, "hold_rate": round(holds / n, 3),
                                "plane_iou_median": q(ious, 50), "plane_iou_p10": q(ious, 10),
                                "aspect_rel_err_median": q(aerr, 50)}
    return out


def dimension_utterance_rate() -> dict:
    """2F-d: 치수 발화 비율(코퍼스). 있으면 종횡비 확정(자명)."""
    p = ROOT / "stage0" / "out" / "youtube_dist.json"
    if not p.exists():
        return {"note": "코퍼스 없음"}
    d = json.loads(p.read_text(encoding="utf-8"))
    return {"dimension_rate": d.get("type_distribution", {}).get("dimension"),
            "note": "치수 발화 있으면 종횡비까지 확정(§3.3). 투시영상 치수발화율은 2G 실영상서 재측정."}


def main():
    res = evaluate(n=150)
    report = {
        "spec": "트랙2 2F — 사전지식으로 종횡비 결정 가능성(2A 정답 대비). 전부 측정값.",
        "2F_a_right_angle": res,
        "2F_d_speech_anchor": dimension_utterance_rate(),
        "2F_b_vertical_vp": {"status": "구조만 — 수직 획 검출 필요(후속). 2점투시서 수직 VP 무한대 고정"},
        "2F_c_repeated_module": {"status": "구조만 — 창·기둥 등간격 검출 필요(후속). 검출가능 영상비율은 2G"},
        "conclusion": _conclude(res),
    }
    (ROOT / "stage0" / "out" / "aspect_priors.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"2F_a": res, "conclusion": report["conclusion"]}, ensure_ascii=False, indent=2))


def _conclude(res):
    # 등급명은 실측 등급(precise/medium/coarse). 대표는 medium(실획 중앙 등급).
    key = "medium" if "medium" in res["rectangular"] else next(iter(res["rectangular"]))
    rec = res["rectangular"][key]["plane_iou_median"]
    irr = res["irregular"][key]["plane_iou_median"]
    return (f"직각가정(실측 코너오차 노이즈, {key}): 직사각 footprint 종횡비 복원 IoU중앙 {rec}, "
            f"비직교 {irr}. 두 값의 격차가 직각가정의 유효 범위를 정한다.")


if __name__ == "__main__":
    main()
