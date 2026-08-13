"""0단계 항목 1 — Quick,Draw 등급 클러스터링 → 노이즈 파라미터 (§6.1, §5.3).

Quick,Draw RAW ndjson(획별 [[x],[y],[t]])을 카테고리별로 스트리밍 다운로드(조기 종료)하고,
프리핸드 노이즈 분포를 추출한다:
  - 직선 편차 (straightness)  → 오버레이 어긋남 기준(§8) / 즉시스냅 tolerance
  - 획 속도, 축 기울기, 닫힘 간격
등급(§5.3)을 KMeans로 판정(거친/중간/정밀)하고 등급별 tolerance 후보를 낸다.
Quick,Draw는 '등급 스펙트럼의 거친 쪽 상한'(§6.1). 정밀 쪽은 SketchGraphs로 보강.

출력: stage0/out/quickdraw_grades.json
"""
from __future__ import annotations
import json, sys, math, io
from pathlib import Path
import numpy as np
import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stage0" / "out"
RAW = ROOT / "data" / "quickdraw"
OUT.mkdir(parents=True, exist_ok=True)
RAW.mkdir(parents=True, exist_ok=True)

BASE = "https://storage.googleapis.com/quickdraw_dataset/full/raw/{}.ndjson"
CATS = ["house", "square", "line", "triangle", "door", "castle", "skyscraper"]
N_PER_CAT = 1500      # 조기 종료 표본 (거친 상한 통계는 수천이면 충분)


def fetch(cat: str, n: int) -> list[dict]:
    """RAW ndjson을 스트리밍하며 n줄에서 끊는다. 로컬 캐시."""
    cache = RAW / f"{cat}.ndjson"
    if cache.exists():
        lines = cache.read_text(encoding="utf-8").splitlines()
        return [json.loads(l) for l in lines[:n] if l.strip()]
    out, buf = [], []
    with requests.get(BASE.format(cat), stream=True, timeout=60) as r:
        r.raise_for_status()
        for raw_line in r.iter_lines():           # bytes
            if not raw_line:
                continue
            line = raw_line.decode("utf-8")
            buf.append(line)
            out.append(json.loads(line))
            if len(out) >= n:
                break
    cache.write_text("\n".join(buf), encoding="utf-8")
    return out


def stroke_straightness(xs, ys) -> float | None:
    """총최소제곱(PCA) 부축 RMS / 주축 길이. 낮을수록 직선. 정규화됨."""
    if len(xs) < 3:
        return None
    p = np.stack([xs, ys], 1).astype(float)
    p -= p.mean(0)
    # 주축/부축
    _, s, vt = np.linalg.svd(p, full_matrices=False)
    proj = p @ vt.T                       # [:,0]=주축, [:,1]=부축
    major = proj[:, 0].max() - proj[:, 0].min()
    if major < 1e-6:
        return None
    minor_rms = float(np.sqrt(np.mean(proj[:, 1] ** 2)))
    return minor_rms / major


def seg_angles(xs, ys):
    dx = np.diff(xs); dy = np.diff(ys)
    ln = np.hypot(dx, dy)
    m = ln > 1e-6
    return np.degrees(np.arctan2(dy[m], dx[m]))


def tilt_residual(angles):
    """가장 가까운 축(0/90°)으로부터의 잔차 절대값(도). 직교스냅 tolerance 근거."""
    a = np.mod(angles, 90.0)
    return np.minimum(a, 90.0 - a)


def local_straightness(xs, ys, win=12, step=6) -> list[float]:
    """국소 창 직진성 — '떨림'만. 전체획 직진성은 형태(폐곡선)에 좌우된다.
    detect_grade(stage1/normalize)가 쓰는 양과 **같은 단위**. V-5b에서 단위 불일치 발견:
    등급 centroid는 전체획으로 적합됐는데 detect_grade는 국소창으로 비교 → 항상 precise 편향."""
    out = []
    for i in range(0, max(1, len(xs) - win), step):
        v = stroke_straightness(xs[i:i + win], ys[i:i + win])
        if v is not None:
            out.append(v)
    return out


def analyze_drawing(d: dict) -> dict | None:
    strokes = d["drawing"]                 # [[x],[y],[t]]
    straight, speeds, tilts, npts = [], [], [], 0
    local = []
    for s in strokes:
        xs = np.asarray(s[0], float); ys = np.asarray(s[1], float)
        ts = np.asarray(s[2], float) if len(s) > 2 else None
        npts += len(xs)
        st = stroke_straightness(xs, ys)
        if st is not None:
            straight.append(st)
        local.extend(local_straightness(xs, ys))
        ang = seg_angles(xs, ys)
        if ang.size:
            tilts.append(tilt_residual(ang))
        if ts is not None and len(ts) > 1:
            dt = ts[-1] - ts[0]
            plen = float(np.sum(np.hypot(np.diff(xs), np.diff(ys))))
            if dt > 0:
                speeds.append(plen / dt)   # units/ms
    if not straight:
        return None
    # 닫힘 간격: 전체 첫점~끝점 / bbox 대각
    allx = np.concatenate([np.asarray(s[0], float) for s in strokes])
    ally = np.concatenate([np.asarray(s[1], float) for s in strokes])
    diag = math.hypot(np.ptp(allx), np.ptp(ally)) or 1.0
    gap = math.hypot(allx[0] - allx[-1], ally[0] - ally[-1]) / diag
    tilt_all = np.concatenate(tilts) if tilts else np.array([0.0])
    return {
        "straightness": float(np.mean(straight)),
        "straightness_max": float(np.max(straight)),
        # 국소창 직진성 중앙값 — detect_grade와 같은 단위(V-5b 정정)
        "straightness_local": float(np.median(local)) if local else float("nan"),
        "speed": float(np.median(speeds)) if speeds else float("nan"),
        "tilt_res_med": float(np.median(tilt_all)),
        "n_strokes": len(strokes),
        "closure_gap": float(gap),
    }


def main():
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    rows, cat_of = [], []
    for cat in CATS:
        try:
            data = fetch(cat, N_PER_CAT)
        except Exception as ex:
            print(f"  ! {cat}: {ex}", file=sys.stderr)
            continue
        got = 0
        for d in data:
            f = analyze_drawing(d)
            if f:
                rows.append(f); cat_of.append(cat); got += 1
        print(f"  {cat}: {got} drawings")

    if not rows:
        print("NO DATA", file=sys.stderr); sys.exit(1)

    # straightness_local은 **끝에** 추가(feat_idx 인덱스 불변 → 클러스터 동일 유지)
    keys = ["straightness", "speed", "tilt_res_med", "n_strokes", "closure_gap", "straightness_local"]
    X = np.array([[r[k] for k in keys] for r in rows], float)
    # speed NaN → 열 중앙값 대체
    for j in range(X.shape[1]):
        col = X[:, j]; med = np.nanmedian(col); col[np.isnan(col)] = med; X[:, j] = col

    # 등급 클러스터링: straightness·tilt·speed 기준 3등급 (거친/중간/정밀)
    feat_idx = [0, 2, 1]   # straightness, tilt_res, speed
    Xs = StandardScaler().fit_transform(X[:, feat_idx])
    km = KMeans(n_clusters=3, n_init=10, random_state=0).fit(Xs)
    lab = km.labels_
    # 등급 정렬: straightness 평균 오름차순 → 0=정밀, 2=거친
    order = sorted(range(3), key=lambda c: X[lab == c, 0].mean())
    remap = {c: i for i, c in enumerate(order)}
    grade = np.array([remap[l] for l in lab])
    names = {0: "precise", 1: "medium", 2: "coarse"}

    grades_out = {}
    for g in range(3):
        m = grade == g
        sub = X[m]
        grades_out[names[g]] = {
            "n": int(m.sum()),
            "frac": round(float(m.mean()), 3),
            # 오버레이 어긋남 기준(§8): 등급별 직선편차 중앙값
            "straightness_median": round(float(np.median(sub[:, 0])), 5),
            "straightness_p90": round(float(np.percentile(sub[:, 0], 90)), 5),
            # detect_grade가 비교해야 할 **국소창 단위** 기준(V-5b 정정). 위 전체획 값과 단위 다름.
            "straightness_local_median": round(float(np.median(sub[:, 5])), 5),
            "straightness_local_p90": round(float(np.percentile(sub[:, 5], 90)), 5),
            # 직교 스냅 tolerance 후보(도): 축 기울기 잔차 분포
            "ortho_snap_tol_deg_median": round(float(np.median(sub[:, 2])), 3),
            "ortho_snap_tol_deg_p90": round(float(np.percentile(sub[:, 2], 90)), 3),
            "closure_gap_median": round(float(np.median(sub[:, 4])), 4),
            "speed_median": round(float(np.median(sub[:, 1])), 5),
        }

    # 노이즈 파라미터(합성 획 생성용, §6.2 파이프라인): 등급별
    noise_params = {}
    for g in range(3):
        m = grade == g; sub = X[m]
        noise_params[names[g]] = {
            # 점 지터 sigma는 직선편차에서 유도(주축길이 대비 비율)
            "jitter_ratio": round(float(np.median(sub[:, 0])), 5),
            "angle_sigma_deg": round(float(np.percentile(sub[:, 2], 90)), 3),
            "closure_gap_ratio": round(float(np.median(sub[:, 4])), 4),
        }

    result = {
        "spec": "§6.1 Quick,Draw 등급/노이즈; 거친 쪽 상한",
        "categories": CATS,
        "n_total": len(rows),
        "grades": grades_out,
        "noise_params": noise_params,
        "overlay_misalign_baseline_note":
            "오버레이 어긋남 기준(§8) = 등급별 straightness_median. checkpoints CP-0.6.",
        "caveat": "Quick,Draw: 20s 제한/마우스·손가락 혼재/필압없음 → 정밀 쪽은 SketchGraphs(6.2)로.",
    }
    (OUT / "quickdraw_grades.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["grades"], ensure_ascii=False, indent=2))
    print("\n-> stage0/out/quickdraw_grades.json")


if __name__ == "__main__":
    main()
