"""노이즈 모델 검증 (지시 0.3) — 새 합성이 실획과 같은 분포에 들어오는가.

V-5b가 쓴 지표를 그대로 쓴다: 저주파(현 대비 중점편차/현길이), 고주파(연속 3점 방향각).
**원점(raw) 기준**으로 재되, 새 모델은 실획의 점 간격(spacing_ratio)까지 맞추므로
V-5b 비교에 있던 '간격 교란'이 제거된 상태에서 공정 비교가 된다.

구 모델(폐기)도 같이 돌려 교정 전후를 나란히 본다.
출력: stage0/out/noise_model_validation.json
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.inknoise import render_ink, low_freq_bow, high_freq_turn, load_model
from common.normalize_core import stroke_straightness
from stage1.normalize import normalize_to_ir, GRADE_CENTROID

RAW = ROOT / "data" / "quickdraw"
OUT = ROOT / "stage0" / "out"
CANON = 180.0
CATS = ["square", "door", "house", "castle", "skyscraper"]

# 구 모델(폐기) — 비교용 재현. stage0/02.render_noisy와 동일 식.
OLD_PARAMS = {"precise": (0.04884, 11.31, 0.7388),
              "medium": (0.19676, 32.005, 0.1335),
              "coarse": (0.21542, 11.31, 0.3806)}


def old_render(poly, jitter_ratio, angle_sigma, closure_gap, rng):
    n = len(poly); cur = []
    for i in range(n):
        p0, p1 = poly[i], poly[(i + 1) % n]
        L = np.hypot(*(p1 - p0)); k = max(2, int(L / 6))
        ts = np.linspace(0, 1, k)
        base = p0[None, :] * (1 - ts[:, None]) + p1[None, :] * ts[:, None]
        d = (p1 - p0) / (L + 1e-9); nrm = np.array([-d[1], d[0]])
        wob = rng.normal(0, jitter_ratio * L, k); wob[0] = wob[-1] = wob[0] * 0.3
        th = math.radians(rng.normal(0, angle_sigma))
        Rm = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
        c = base.mean(0); base = (base - c) @ Rm.T + c
        cur.extend((base + nrm[None, :] * wob[:, None]).tolist())
    cur = np.array(cur)
    cur[-1] += rng.normal(0, closure_gap * np.ptp(cur, 0).mean(), 2)
    return [cur]


def local_grade(strokes):
    vals = []
    for s in strokes[:8]:
        for i in range(0, max(1, len(s) - 12), 6):
            v = stroke_straightness(s[i:i + 12, 0], s[i:i + 12, 1])
            if v is not None:
                vals.append(v)
    if not vals:
        return "precise"
    m = float(np.median(vals))
    return min(GRADE_CENTROID, key=lambda g: abs(GRADE_CENTROID[g] - m))


def load_real(cat, n):
    p = RAW / f"{cat}.ndjson"
    if not p.exists():
        return []
    out = []
    for ln in p.read_text(encoding="utf-8").splitlines():
        if len(out) >= n:
            break
        if not ln.strip():
            continue
        d = json.loads(ln)
        if d.get("recognized") is False:
            continue
        st = [np.stack([np.asarray(s[0], float), np.asarray(s[1], float)], 1)
              for s in d["drawing"] if len(s[0]) >= 3]
        if st:
            out.append(st)
    return out


def to_canon(strokes):
    allp = np.concatenate(strokes)
    diag = math.hypot(*np.ptp(allp, 0)) or 1.0
    return [(st - allp.min(0)) * (CANON / diag) for st in strokes]


def capture_of(strokes):
    return {"frame": "plan", "w": 320, "h": 320,
            "strokes": [{"points": [[float(x), float(y), i, 0.5] for x, y in st], "pen": "mass"}
                        for i, st in enumerate(strokes)]}


def self_iou(strokes, ir):
    from shapely.geometry import Polygon
    if not ir.volumes:
        return None
    rec = Polygon(ir.volumes[0].footprint).buffer(0)
    raw = Polygon([tuple(p) for p in np.concatenate(strokes)]).buffer(0)
    if rec.is_empty or raw.is_empty:
        return None
    u = rec.union(raw).area
    return rec.intersection(raw).area / u if u else 0.0


def q(v, p=0.5):
    return round(float(np.quantile(v, p)), 4) if len(v) else None


def profile(stroke_sets: list[list[np.ndarray]]) -> dict:
    """스펙트럼(원점 기준, V-5b 지표) + 파싱 품질."""
    lf, hf, ious, confs = [], [], [], []
    par = 0
    for strokes in stroke_sets:
        main = max(strokes, key=len)
        lf += low_freq_bow(main); hf += high_freq_turn(main)
        cap = capture_of(strokes)
        ir, meta = normalize_to_ir(cap)
        if ir.volumes and meta.get("parseable"):
            par += 1
            confs.append(meta["confidence"])
            v = self_iou(strokes, ir)
            if v is not None:
                ious.append(v)
    n = max(1, len(stroke_sets))
    return {"n": len(stroke_sets), "lowFreq": q(lf), "highFreq": q(hf),
            "parseable": round(par / n, 3), "selfIoU": q(ious), "conf": q(confs)}


def rect_poly(rng):
    w = rng.uniform(0.45, 0.75) * CANON
    h = rng.uniform(0.35, 0.65) * CANON
    return np.array([[0., 0.], [w, 0.], [w, h], [0., h]])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    model = load_model()
    rng = np.random.default_rng(7)
    N = 150

    # 실획 — 등급별로 모음
    real_by_grade: dict[str, list] = {}
    for cat in CATS:
        for strokes in load_real(cat, 300):
            cs = to_canon(strokes)
            real_by_grade.setdefault(local_grade(cs), []).append(cs)
    real = {g: profile(v[:N]) for g, v in sorted(real_by_grade.items())}

    # 새 합성
    new = {}
    for g, p in sorted(model.items()):
        sets = [render_ink(rect_poly(rng), p, rng) for _ in range(N)]
        new[g] = profile(sets)

    # 구 합성(폐기 모델)
    old = {}
    for g, (jr, asig, cg) in OLD_PARAMS.items():
        sets = [old_render(rect_poly(rng), jr, asig, cg, rng) for _ in range(N)]
        old[g] = profile(sets)

    rep = {"spec": "노이즈 모델 검증(지시 0.3). 지표=V-5b와 동일(원점 기준).",
           "real_ink": real, "new_synth": new, "old_synth_DEPRECATED": old,
           "note": "새 합성은 실획 spacing까지 맞춰 원점 기준 비교가 공정하다. 구 모델은 폐기."}
    (OUT / "noise_model_validation.json").write_text(
        json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")

    hdr = f'{"":8} {"등급":8} {"저주파":>8} {"고주파°":>8} {"parse":>7} {"selfIoU":>8} {"conf":>7}'
    print(hdr)
    for name, blk in (("실획", real), ("새합성", new), ("구합성", old)):
        for g, r in blk.items():
            print(f'{name:8} {g:8} {str(r["lowFreq"]):>8} {str(r["highFreq"]):>8} '
                  f'{r["parseable"]:>7.3f} {str(r["selfIoU"]):>8} {str(r["conf"]):>7}')
    print("\n-> stage0/out/noise_model_validation.json")


if __name__ == "__main__":
    main()
