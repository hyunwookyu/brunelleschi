"""실획 기반 잉크 노이즈 모델 (V-5c, 지시 0). 구 모델 폐기 대체.

**폐기된 구 모델**(`stage0/02.render_noisy`): 직선 보간 + 점별 독립 정규
`sigma = jitter_ratio * L`, 여기서 `jitter_ratio` = **전체획** straightness 중앙값
(0.049/0.197/0.215). 이는 단위 혼동이다 — 전체획 직진성(형태 복잡도)을 점별 지터 비율로
썼다. 결과: 화이트/고주파 일색 → PaleoSketch 가우시안 평활이 전량 제거 → parseable 1.0의
낙관 편향(V-o 반증, progress.md V-5b).

**새 모델**: 실획에서 분리 추출한 4성분을 독립 파라미터로 둔다.
  1. lf_bow      저주파 휘어짐 — 변을 따라 생기는 완만한 활 모양 (현 대비 중점편차 / 현길이)
  2. hf_sigma    고주파 떨림   — 점간 방향 급변을 만드는 수직 미세 변위 (spacing 대비 비율)
  3. overshoot   코너 오버슈트 — 방향 전환점에서 진행방향으로 초과한 이동량 (변길이 대비)
  4. closure_gap 시종점 어긋남 — 폐합 의도 획의 첫-끝 거리 (bbox 대각 대비)
  + spacing      점 간격(정준 대각 대비) — 고주파 지표가 간격에 의존하므로 함께 맞춘다.

생성 순서(지시 0.2): 저주파를 **먼저** 부여하고 고주파를 얹는다. 코너 오버슈트와
시종점 어긋남을 포함한다.
"""
from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "stage0" / "out" / "ink_noise_model.json"

# ---------------------------------------------------------------- 측정 지표
# V-5b가 쓴 지표를 그대로 유지한다(지시 0.3: 두 분포가 겹치는지 같은 자로 확인).


def resample_uniform(pts: np.ndarray, spacing: float) -> np.ndarray:
    """호길이 등간격 재표본. 고주파(방향각) 지표가 점 간격에 의존하므로
    실획·합성을 **같은 간격**으로 맞춰야 비교가 성립한다(V-5b 비교의 교란요인 제거)."""
    pts = np.asarray(pts, float)
    if len(pts) < 2:
        return pts
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    total = s[-1]
    if total < spacing * 2:
        return pts
    n = max(2, int(round(total / spacing)) + 1)
    q = np.linspace(0, total, n)
    return np.stack([np.interp(q, s, pts[:, 0]), np.interp(q, s, pts[:, 1])], 1)


def low_freq_bow(pts: np.ndarray, n_seg: int = 4) -> list[float]:
    """저주파: 획을 n_seg 구간으로 나눠 각 구간 현 대비 중점 수직편차 / 현길이."""
    pts = np.asarray(pts, float)
    n = len(pts)
    if n < 12:
        return []
    out, seg = [], n // n_seg
    for st in range(0, n - seg, seg):
        a, b, m = pts[st], pts[st + seg], pts[st + seg // 2]
        L = np.hypot(*(b - a))
        if L < 1e-9:
            continue
        d = abs((b[0] - a[0]) * (a[1] - m[1]) - (a[0] - m[0]) * (b[1] - a[1])) / L
        out.append(d / L)
    return out


def high_freq_turn(pts: np.ndarray) -> list[float]:
    """고주파: 연속 3점 방향 변화(도). 등간격 재표본 후 쓸 것."""
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return []
    d = np.diff(pts, axis=0)
    ang = np.degrees(np.arctan2(d[:, 1], d[:, 0]))
    t = np.abs(np.diff(ang))
    return list(np.minimum(t, 360 - t))


def corner_overshoot(pts: np.ndarray, turn_thresh=50.0, look=6) -> list[float]:
    """코너 오버슈트: 큰 방향전환 지점에서 **진입 방향으로 코너를 넘어간** 최대 거리 / 진입변 길이.
    사람은 코너에서 즉시 멈추지 못하고 지나쳤다 돌아온다."""
    pts = np.asarray(pts, float)
    n = len(pts)
    if n < 3 * look:
        return []
    d = np.diff(pts, axis=0)
    ang = np.degrees(np.arctan2(d[:, 1], d[:, 0]))
    turn = np.abs(np.diff(ang))
    turn = np.minimum(turn, 360 - turn)
    out = []
    for i in np.where(turn > turn_thresh)[0]:
        c = i + 1                                   # 코너 정점 인덱스
        if c - look < 0 or c + look >= n:
            continue
        u = pts[c] - pts[c - look]                  # 진입 방향
        Lu = np.hypot(*u)
        if Lu < 1e-9:
            continue
        u = u / Lu
        # 코너 이후 점들이 진입 방향으로 얼마나 더 나아갔나(양수만)
        adv = (pts[c + 1:c + 1 + look] - pts[c]) @ u
        ov = float(np.max(adv)) if len(adv) else 0.0
        if ov > 0:
            out.append(ov / Lu)
    return out


def closure_gap(pts: np.ndarray) -> float:
    """시종점 어긋남: 첫-끝 거리 / bbox 대각."""
    pts = np.asarray(pts, float)
    diag = math.hypot(*np.ptp(pts, 0)) or 1.0
    return float(np.hypot(*(pts[0] - pts[-1])) / diag)


# ---------------------------------------------------------------- 생성기

def render_ink(poly: np.ndarray, p: dict, rng: np.random.Generator,
               one_stroke: bool = True) -> list[np.ndarray]:
    """폴리곤 정점 → 사람이 그린 듯한 획. 지시 0.2 순서: 저주파 → 고주파 → 오버슈트 → 폐합오차.

    p: {lf_bow, hf_sigma, overshoot, closure_gap, spacing_ratio}
       lf_bow      = 활 진폭 / 변 길이
       hf_sigma    = 점별 수직 변위 sigma / 점 간격
       overshoot   = 코너 초과 이동 / 변 길이
       closure_gap = 첫-끝 거리 / bbox 대각
       spacing_ratio = 점 간격 / bbox 대각
    """
    poly = np.asarray(poly, float)
    n = len(poly)
    diag = math.hypot(*np.ptp(poly, 0)) or 1.0
    spacing = max(1e-6, p.get("spacing_ratio", 0.02) * diag)
    cur: list[list[float]] = []

    for i in range(n):
        p0, p1 = poly[i], poly[(i + 1) % n]
        L = np.hypot(*(p1 - p0))
        if L < 1e-9:
            continue
        k = max(3, int(round(L / spacing)) + 1)
        ts = np.linspace(0, 1, k)
        base = p0[None, :] * (1 - ts[:, None]) + p1[None, :] * ts[:, None]
        d = (p1 - p0) / L
        nrm = np.array([-d[1], d[0]])

        # 1) 저주파 휘어짐 — 반사인 활(양끝 0, 중앙 최대). 부호·진폭 무작위.
        amp = rng.normal(0, p["lf_bow"]) * L
        bow = amp * np.sin(np.pi * ts)
        # 2차 성분(약한 S자) — 실획의 휘어짐이 순수 활만은 아님
        amp2 = rng.normal(0, p["lf_bow"] * 0.4) * L
        bow = bow + amp2 * np.sin(2 * np.pi * ts)

        # 2) 고주파 떨림 — 점별 수직 미세 변위. 저주파 위에 얹는다(순서 준수).
        hf = rng.normal(0, p["hf_sigma"] * spacing, k)
        hf[0] *= 0.3; hf[-1] *= 0.3          # 끝점은 시각 목표라 덜 흔들림

        pts = base + nrm[None, :] * (bow + hf)[:, None]

        # 3) 코너 오버슈트 — 변 끝에서 진행방향으로 초과했다 돌아옴
        ov = abs(rng.normal(0, p["overshoot"])) * L
        if ov > spacing * 0.5:
            m = max(1, int(round(ov / spacing)))
            tail = np.array([pts[-1] + d * (spacing * (j + 1)) for j in range(m)])
            back = tail[::-1][1:]             # 되돌아오는 궤적
            pts = np.vstack([pts, tail, back])

        cur.extend(pts.tolist())

    arr = np.array(cur)
    # 4) 시종점 어긋남 — 끝점을 폐합 지점에서 벌린다
    gap = abs(rng.normal(0, p["closure_gap"])) * (math.hypot(*np.ptp(arr, 0)) or 1.0)
    if gap > 0 and len(arr) > 2:
        theta = rng.uniform(0, 2 * math.pi)
        arr[-1] = arr[-1] + gap * np.array([math.cos(theta), math.sin(theta)])

    if one_stroke:
        return [arr]
    h = len(arr) // 2
    return [arr[:h], arr[h:]]


def load_model() -> dict:
    """등급별 파라미터. 없으면 stage0/10 실행 안내."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"{MODEL_PATH} 없음 — `python stage0/10_ink_noise_model.py` 먼저 실행")
    return json.loads(MODEL_PATH.read_text(encoding="utf-8"))["grades"]


def render_for_grade(poly, grade: str, rng, one_stroke: bool = True):
    """등급명으로 바로 획 생성 — 구 `sg.render_noisy(poly, jitter_ratio, ...)`의 대체 진입점.

    구 호출부는 `noise_params[grade]`의 세 스칼라를 넘겼는데, 그 `jitter_ratio`가
    **전체획 straightness를 점별 지터로 쓴** 단위 혼동이었다(V-5c에서 폐기).
    여기서는 실획 기반 4성분 모델을 쓴다. 호출부는 등급명만 넘기면 된다.
    """
    return render_ink(poly, load_model()[grade], rng, one_stroke=one_stroke)
