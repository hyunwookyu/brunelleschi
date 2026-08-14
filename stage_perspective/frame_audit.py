"""프레임 문제 전수 점검 (지시 D-1b-3 c) — PCA vs 자연 프레임이 어느 트랙에 영향을 주는가.

D-1b-2에서 L자의 종횡비 오차가 프레임에 따라 0.056(PCA) vs 0.167(자연)으로 3배 갈렸다.
`polygon_aspect`(PCA)를 쓰는 곳이 2A/2C·2F·2H 셋이므로 **전부 다시 재서** 영향 범위를 확정한다.

예상: 직사각형은 PCA 축이 변 방향과 일치하므로 차이가 없어야 한다(2F·2A).
     차이가 나는 것은 질량 분포가 대각인 형태(2H의 L·U·계단)뿐이어야 한다.
이 예상이 맞으면 프레임 교체의 영향이 2H에 국한되고, 틀리면 재산출 범위가 넓어진다(멈춤 조건).

출력: stage0/out/frame_audit.json
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.decompose import _project_polygon, _shapes, recover_orthogonal_polygon
from stage_perspective.priors import rect, recover_plane_rightangle
from stage_perspective.noise import grade_ratios, add_corner_noise, stable_seed
from stage_perspective.shape_metrics import bbox_aspect
from stage_perspective.uncertainty import aspect_equiv

OUT = ROOT / "stage0" / "out"


def _err(rec_asp: float, truth_asp: float) -> float:
    r, t = aspect_equiv(rec_asp), aspect_equiv(truth_asp)
    if not np.isfinite(r) or not np.isfinite(t) or t <= 0:
        return float("nan")
    return abs(r - t) / t


def _view(rng, truth):
    c = truth.mean(0)
    diag = float(np.hypot(*(truth.max(0) - truth.min(0))))
    az = rng.uniform(0, 2 * np.pi)
    el = rng.uniform(np.radians(30), np.radians(60))
    dist = diag * rng.uniform(1.4, 2.2)
    return (c[0] + dist * np.cos(az) * np.cos(el),
            c[1] + dist * np.sin(az) * np.cos(el), dist * np.sin(el) + diag * 0.3), c


def run(n=150, seed=0) -> dict:
    ratios = grade_ratios()
    sz = (800.0, 600.0)
    res = {}

    # --- 2F 경로(단일 사각형, 직각가정) ---
    for kind, skew in (("2F_rect", 0.0), ("2F_irregular", 0.15)):
        res[kind] = {}
        for grade in ("precise", "medium"):
            rng = np.random.default_rng(stable_seed("frame_audit", kind, grade, base=seed))
            pca, nat = [], []
            for _ in range(n):
                base = rect(rng.uniform(0.5, 2.0))
                if skew:
                    base = base + rng.normal(0, skew, base.shape)
                truth = base * rng.uniform(3, 9)
                eye, c = _view(rng, truth)
                img = add_corner_noise(
                    _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz),
                    ratios[grade], rng)
                r = recover_plane_rightangle(img, sz)
                if not r.get("ok"):
                    continue
                rec = np.asarray(r["recovered_plane"], float)
                pca.append(_err(bbox_aspect(rec, "pca"), bbox_aspect(truth, "pca")))
                nat.append(_err(bbox_aspect(rec, "natural"), bbox_aspect(truth, "natural")))
            res[kind][grade] = {
                "n": len(pca),
                "aspect_err_pca": round(float(np.nanmedian(pca)), 4) if pca else None,
                "aspect_err_natural": round(float(np.nanmedian(nat)), 4) if nat else None,
            }

    # --- 2H 경로(직교 폴리곤) ---
    for name, base in _shapes().items():
        key = f"2H_{name}"
        res[key] = {}
        for grade in ("precise", "medium"):
            rng = np.random.default_rng(stable_seed("frame_audit", key, grade, base=seed))
            pca, nat = [], []
            for _ in range(n):
                truth = base * rng.uniform(3, 8)
                eye, c = _view(rng, truth)
                img = add_corner_noise(
                    _project_polygon(truth, eye, (float(c[0]), float(c[1]), 0.0), sz),
                    ratios[grade], rng)
                r = recover_orthogonal_polygon(img, sz)
                if not r.get("ok"):
                    continue
                rec = np.asarray(r["recovered"], float)
                pca.append(_err(bbox_aspect(rec, "pca"), bbox_aspect(truth, "pca")))
                nat.append(_err(bbox_aspect(rec, "natural"), bbox_aspect(truth, "natural")))
            res[key][grade] = {
                "n": len(pca),
                "aspect_err_pca": round(float(np.nanmedian(pca)), 4) if pca else None,
                "aspect_err_natural": round(float(np.nanmedian(nat)), 4) if nat else None,
            }

    # 프레임별 참값 차이(형태 자체가 두 프레임에서 다른 종횡비를 갖는가)
    truth_frames = {}
    for name, base in _shapes().items():
        truth_frames[name] = {"pca": round(float(bbox_aspect(base, "pca")), 4),
                              "natural": round(float(bbox_aspect(base, "natural")), 4)}
    truth_frames["rect_10x6"] = {
        "pca": round(float(bbox_aspect(np.array([[0, 0], [10, 0], [10, 6], [0, 6]], float), "pca")), 4),
        "natural": round(float(bbox_aspect(np.array([[0, 0], [10, 0], [10, 6], [0, 6]], float), "natural")), 4)}

    return {
        "spec": "프레임 전수 점검(지시 D-1b-3 c). PCA vs 자연(변 방향) 프레임의 종횡비 오차 대조.",
        "by_track": res,
        "truth_aspect_by_frame": truth_frames,
        "note": ("직사각형은 PCA 축이 변 방향과 일치하므로 두 프레임이 같아야 한다. "
                 "차이가 나는 것은 질량 분포가 대각인 형태(L·U·계단)뿐이어야 한다 — "
                 "그렇지 않으면 프레임 교체 영향이 2H를 넘는다."),
    }


def main():
    r = run()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "frame_audit.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
