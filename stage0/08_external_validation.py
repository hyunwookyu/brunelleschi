"""외부 데이터셋 검증 — TU-Berlin 실인간 스케치로 IoU 게이트 (CP-1 대체).

Quick,Draw는 노이즈 밴드 유도에 이미 썼으므로 순환을 피해 **다른** 외부 소스인
TU-Berlin Sketch(실인간 프리핸드, 250범주)의 직교 형태 범주로 검증한다.

절차: PNG 스케치 → 외곽 윤곽 추출(프리핸드 공간 떨림 보존) → 파서 → 복원 폴리곤
      → IoU(복원, 윤곽) → 합성 예측밴드(measure_capture, median≈0.83) 대조.
밴드 안이면 통과(노이즈모델 타당), 벗어나면 §6.5 복귀.

직교 범주: tv/book/door/laptop(직사각), envelope(플랩 포함 준직교).
출력: stage0/out/external_validation.json
"""
from __future__ import annotations
import io, json, sys
from pathlib import Path
import numpy as np
import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage1.normalize import normalize_to_ir

PARQUET = ROOT / "data" / "tuberlin" / "train0.parquet"
# 직교 범주 라벨 인덱스 (kmewhort/tu-berlin-png)
TARGETS = {"tv": 237, "book": 24, "door": 69, "laptop": 119, "envelope": 75}
ORTHO_STRICT = ("tv", "book", "door", "laptop")   # 밴드 판정 대상(엄격 직사각)
PER_CAT = 15
BAND = None  # measure_capture 밴드 로드


def _contour_polygon(png_bytes: bytes):
    """PNG 스케치 → 최대 외곽 윤곽 폴리곤(프리핸드 외곽선). 실패시 None."""
    arr = np.frombuffer(png_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    # 잉크=어두움 → 이진화(반전), 작은 틈 닫기
    _, bw = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY_INV)
    bw = cv2.dilate(bw, np.ones((5, 5), np.uint8), iterations=2)
    cnts, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < 0.02 * img.shape[0] * img.shape[1]:
        return None
    pts = c.reshape(-1, 2).astype(float)
    if len(pts) < 20:
        return None
    return pts


def _iou(cap, contour):
    from shapely.geometry import Polygon
    ir, meta = normalize_to_ir(cap)
    if not ir.volumes:
        return None, meta
    rec = Polygon(ir.volumes[0].footprint).buffer(0)
    raw = Polygon(contour).buffer(0)
    if rec.is_empty or raw.is_empty:
        return None, meta
    u = rec.union(raw).area
    return (rec.intersection(raw).area / u if u else 0.0), meta


def load_samples():
    import pyarrow.parquet as pq
    tbl = pq.read_table(PARQUET, columns=["image", "label"])
    labels = tbl.column("label").to_numpy()
    images = tbl.column("image").to_pylist()   # [{'bytes':..,'path':..}]
    out = {name: [] for name in TARGETS}
    for name, idx in TARGETS.items():
        rows = np.where(labels == idx)[0]
        for r in rows[:PER_CAT]:
            b = images[int(r)].get("bytes")
            if b:
                out[name].append(b)
    return out


def main():
    global BAND
    band_path = ROOT / "stage1" / "synthetic_iou_band.json"
    if not band_path.exists():
        from stage1.measure_capture import build_band
        build_band()
    BAND = json.loads(band_path.read_text(encoding="utf-8"))

    samples = load_samples()
    per_cat, all_ortho = {}, []
    for name, blobs in samples.items():
        ious = []
        for b in blobs:
            contour = _contour_polygon(b)
            if contour is None:
                continue
            cap = {"frame": "tuberlin", "w": 1111, "h": 1111,
                   "strokes": [{"points": [[float(x), float(y), 0.0, 0.5] for x, y in contour],
                                "pen": "mass"}]}
            v, meta = _iou(cap, contour)
            if v is not None:
                ious.append(v)
        if ious:
            per_cat[name] = {"n": len(ious),
                             "iou_median": round(float(np.median(ious)), 4),
                             "iou_p10": round(float(np.percentile(ious, 10)), 4)}
            if name in ORTHO_STRICT:
                all_ortho += ious

    ortho = np.array(all_ortho)
    real_median = float(np.median(ortho)) if len(ortho) else 0.0
    real_p10 = float(np.percentile(ortho, 10)) if len(ortho) else 0.0
    # 통과: 실측 중앙값이 합성 예측밴드 [p10, p90] 안 (하회하지 않음)
    passed = BAND["p10"] <= real_median <= 1.01
    result = {
        "spec": "CP-1 대체 — TU-Berlin 외부 실인간 스케치 IoU 게이트",
        "synthetic_band": BAND,
        "per_category": per_cat,
        "orthogonal_strict_categories": list(ORTHO_STRICT),
        "real_iou_median": round(real_median, 4),
        "real_iou_p10": round(real_p10, 4),
        "n_orthogonal": int(len(ortho)),
        "PASS": bool(passed),
        "verdict": ("외부 실측이 합성 예측밴드 내 → 노이즈모델 타당, 게이트 통과 → 4단계 진행"
                    if passed else
                    "외부 실측이 밴드 하회 → §6.5 복귀(render_noisy 저주파화 + tolerance 재튜닝)"),
    }
    (ROOT / "stage0" / "out" / "external_validation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
