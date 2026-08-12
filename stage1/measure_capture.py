"""실측 스케치 IoU 즉시 산출 + 합성 예측치 대조 (§6.5 노이즈모델 검증 게이트).

실측 스케치는 정답 폴리곤이 없으므로, 비교 가능한 양은
  IoU_자기정합 = IoU(복원 폴리곤, 원본 잉크 외곽 폴리곤)
이다. 합성 precise 픽스처로 같은 양의 분포(예측 밴드)를 만들어 두고, 실측이 밴드
밖이면 노이즈 모델이 실제와 다른 것 → §6.5로 돌아간다(사용자 지시).

용법:
  python stage1/measure_capture.py <exported_sketch.json>   # 실측 즉시 대조
  python stage1/measure_capture.py --band                    # 합성 예측밴드 재생성
밴드는 stage1/synthetic_iou_band.json 에 캐시(즉시 조회).
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage1.normalize import normalize_to_ir
BAND_PATH = ROOT / "stage1" / "synthetic_iou_band.json"


def _raw_outline(capture: dict):
    from shapely.geometry import Polygon
    pts = [p[:2] for s in capture["strokes"] if s.get("pen", "mass") == "mass" for p in s["points"]]
    if len(pts) < 3:
        return None
    return Polygon(pts).buffer(0)


def self_iou(capture: dict, method="paleo"):
    """IoU(복원 폴리곤, 원본 잉크 외곽). 복원 실패시 None."""
    from shapely.geometry import Polygon
    ir, meta = normalize_to_ir(capture, method=method)
    if not ir.volumes:
        return None, meta
    rec = Polygon(ir.volumes[0].footprint).buffer(0)
    raw = _raw_outline(capture)
    if rec.is_empty or raw is None or raw.is_empty:
        return None, meta
    u = rec.union(raw).area
    return (rec.intersection(raw).area / u if u else 0.0), meta


def build_band(n=40):
    """합성 precise 픽스처로 IoU_자기정합 분포 → 예측밴드."""
    import importlib.util
    mfs = importlib.util.spec_from_file_location("mf", ROOT / "stage1" / "make_fixture.py")
    mf = importlib.util.module_from_spec(mfs); mfs.loader.exec_module(mf)
    vals = []
    for seed in range(n):
        for kind in ("rect", "L"):
            cap = mf.make(kind, "precise", seed=seed)
            v, _ = self_iou(cap)
            if v is not None:
                vals.append(v)
    vals = np.array(vals)
    band = {"quantity": "IoU(복원 폴리곤, 원본 잉크 외곽) — precise 합성",
            "median": round(float(np.median(vals)), 4),
            "p10": round(float(np.percentile(vals, 10)), 4),
            "p90": round(float(np.percentile(vals, 90)), 4),
            "n": len(vals)}
    BAND_PATH.write_text(json.dumps(band, ensure_ascii=False, indent=2), encoding="utf-8")
    return band


def measure(capture_path: str):
    if not BAND_PATH.exists():
        build_band()
    band = json.loads(BAND_PATH.read_text(encoding="utf-8"))
    cap = json.loads(Path(capture_path).read_text(encoding="utf-8"))
    v, meta = self_iou(cap)
    if v is None:
        return {"status": "no_polygon", "meta": meta, "band": band,
                "note": "복원 폴리곤 미형성 — 파싱 경계(§5.3)일 수 있음."}
    within = band["p10"] <= v <= 1.01
    return {"status": "ok", "real_self_iou": round(v, 4), "band": band,
            "grade_detected": meta.get("grade"), "n_lines": meta.get("n_lines"),
            "within_band": within,
            "verdict": ("합성 예측 범위 → 노이즈모델 타당" if within else
                        "밴드 하회 → 노이즈모델이 실제와 다를 수 있음 → §6.5 재검토"),
            "hint_if_mismatch": "실측이 크게 낮으면 합성 노이즈(화이트/고주파)가 실제(저주파 떨림)와 "
                                "괴리. render_noisy 저주파화 후 tolerance 재튜닝(§6.5, §10)."}


def main(argv):
    if len(argv) >= 2 and argv[1] == "--band":
        print(json.dumps(build_band(), ensure_ascii=False, indent=2)); return
    if len(argv) < 2:
        print(__doc__); return
    print(json.dumps(measure(argv[1]), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv)
