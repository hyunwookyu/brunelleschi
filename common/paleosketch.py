"""PaleoSketch식 프리미티브 인식 — 코너 검출 (§5.1 채택).

실패 분해(stage0/05)에서 f1 손실의 97%가 프리미티브 분할(DP 정점추출)로 확인됨.
DP는 변을 따라 생기는 프리핸드 떨림의 국소 편차가 dp_epsilon을 넘어 거짓 코너를
남긴다. PaleoSketch는 곡률/속도 기반 코너 검출을 쓴다.

핵심(스케일 불변): 리샘플 후 각 점의 **창(window) 회전각** = 들어오는 현과 나가는
현 사이 각. 떨림의 부호 있는 회전은 창에서 상쇄되고, 실제 코너는 ~90° 누적된다.
속도 최소점(타임스탬프 있을 때) 가중으로 코너 후보를 강화(Sezgin/PaleoSketch).

이 모듈은 분할 단계만 담당한다. 프레임/스냅/추론은 normalize_core 그대로(그 단계는
정답 정점 주면 f1 0.986 — 무결).
"""
from __future__ import annotations
import numpy as np

# PaleoSketch 분할 파라미터 (정준 스케일 diag≈180 기준, 스케일 불변)
PALEO = {
    "resample_spacing": 3.0,
    "smooth_sigma": 4.0,     # 경로 가우시안 평활 σ(리샘플 점) — 프리핸드 떨림 저역통과
    "turn_window": 7,        # 리샘플 점 단위 창 반경 (방향 분류/코너 창)
    "turn_thresh_deg": 40.0, # (코너검출 폴백용) 최소 누적 회전각
    "min_corner_sep": 6,     # 최소 런 길이(짧은 런 흡수) / 코너 간 최소 간격
    "speed_weight": 0.3,     # (코너검출 폴백용) 속도 최소점 가중
}


def _smooth(rs: np.ndarray, sigma: float) -> np.ndarray:
    """경로 좌표 가우시안 평활(Sezgin/PaleoSketch식). 고주파 떨림 제거, 코너 보존.
    닫힌 폴리곤 왜곡 최소화 위해 반사 경계."""
    if sigma <= 0 or len(rs) < 5:
        return rs
    from scipy.ndimage import gaussian_filter1d
    x = gaussian_filter1d(rs[:, 0], sigma, mode="nearest")
    y = gaussian_filter1d(rs[:, 1], sigma, mode="nearest")
    return np.stack([x, y], 1)


def _resample(pts: np.ndarray, spacing: float) -> tuple[np.ndarray, np.ndarray | None]:
    """호길이 등간격 리샘플. 타임스탬프(3열) 있으면 함께 보간해 속도 계산."""
    xy = pts[:, :2]
    seg = np.diff(xy, axis=0)
    d = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.concatenate([[0], np.cumsum(d)])
    total = cum[-1]
    if total < 1e-9:
        return xy[:1], None
    n = max(2, int(total // spacing) + 1)
    tt = np.linspace(0, total, n)
    x = np.interp(tt, cum, xy[:, 0]); y = np.interp(tt, cum, xy[:, 1])
    rs = np.stack([x, y], 1)
    ts = None
    if pts.shape[1] >= 3:
        ts = np.interp(tt, cum, pts[:, 2])
    return rs, ts


def _turning(rs: np.ndarray, w: int) -> np.ndarray:
    """각 점의 창 회전각(도). v1=현[i-w..i], v2=현[i..i+w] 사이 각."""
    n = len(rs)
    turn = np.zeros(n)
    for i in range(n):
        a, b = i - w, i + w
        if a < 0 or b >= n:
            continue
        v1 = rs[i] - rs[a]; v2 = rs[b] - rs[i]
        n1 = np.hypot(*v1); n2 = np.hypot(*v2)
        if n1 < 1e-9 or n2 < 1e-9:
            continue
        cosang = np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)
        turn[i] = np.degrees(np.arccos(cosang))
    return turn


def _speed_penalty(rs, ts, w):
    """속도(호길이/Δt) 정규화 역수 → 최소점에서 큰 값. ts 없으면 0."""
    if ts is None:
        return np.zeros(len(rs))
    n = len(rs)
    sp = np.full(n, np.nan)
    for i in range(w, n - w):
        dt = ts[i + w] - ts[i - w]
        dl = np.sum(np.hypot(*np.diff(rs[i - w:i + w + 1], axis=0).T))
        if dt > 1e-6:
            sp[i] = dl / dt
    valid = ~np.isnan(sp)
    if valid.sum() < 3:
        return np.zeros(n)
    lo, hi = np.nanpercentile(sp[valid], [5, 95])
    if hi - lo < 1e-9:
        return np.zeros(n)
    norm = np.clip((sp - lo) / (hi - lo), 0, 1)
    pen = 1.0 - norm            # 느릴수록(코너) 큰 값
    pen[np.isnan(pen)] = 0.0
    return pen


def corners(stroke: np.ndarray, cfg: dict = None, closed_hint: bool = False) -> np.ndarray:
    """단일 폴리라인 → 코너 정점 배열(순서 보존). PaleoSketch식 곡률+속도.
    stroke: Nx2 또는 Nx3(+t) 또는 Nx4(+p)."""
    c = {**PALEO, **(cfg or {})}
    stroke = np.asarray(stroke, float)
    rs, ts = _resample(stroke, c["resample_spacing"])
    if len(rs) < 3:
        return rs
    rs = _smooth(rs, c["smooth_sigma"])          # 저역통과 후 코너 검출
    w = int(c["turn_window"])
    turn = _turning(rs, w)
    score = turn + c["speed_weight"] * c["turn_thresh_deg"] * _speed_penalty(rs, ts, w)
    thr = c["turn_thresh_deg"]
    sep = int(c["min_corner_sep"])
    # 후보: 임계 이상 + 창 내 최대(비최대억제)
    cand = []
    for i in range(len(rs)):
        if turn[i] < thr:
            continue
        lo, hi = max(0, i - sep), min(len(rs), i + sep + 1)
        if score[i] >= score[lo:hi].max() - 1e-9:
            cand.append(i)
    # 근접 후보 병합
    merged = []
    for i in cand:
        if merged and i - merged[-1] < sep:
            if score[i] > score[merged[-1]]:
                merged[-1] = i
        else:
            merged.append(i)
    verts_idx = [0] + merged + [len(rs) - 1]
    verts_idx = sorted(set(verts_idx))
    verts = rs[verts_idx]
    # 폐곡선: 시작/끝이 근접하면 하나로
    if closed_hint or np.hypot(*(verts[0] - verts[-1])) <= 2 * c["resample_spacing"]:
        if len(verts) > 3 and np.hypot(*(verts[0] - verts[-1])) <= 3 * c["resample_spacing"]:
            verts = verts[:-1]
    return verts


def _dominant_orientation(rs: np.ndarray, w: int) -> float:
    """코너 없이 지배 방향(mod 90°) 추정 — 국소 방향의 원형평균(길이 가중).
    이중각(4θ) 매핑으로 90° 주기 처리. 직교폴리곤에 강건."""
    n = len(rs)
    sx = sy = 0.0
    for i in range(w, n - w):
        v = rs[i + w] - rs[i - w]
        L = np.hypot(*v)
        if L < 1e-9:
            continue
        ang = np.arctan2(v[1], v[0])
        sx += L * np.cos(4 * ang); sy += L * np.sin(4 * ang)
    if sx == 0 and sy == 0:
        return 0.0
    return (np.degrees(np.arctan2(sy, sx)) / 4.0) % 90.0


def recognize_rectilinear(path: np.ndarray, cfg: dict = None) -> np.ndarray:
    """직교 폴리곤 폴리라인 인식 (§5.1 PaleoSketch polyline, 직교 도메인 특화).

    코너 검출 대신 프레임 우선: 지배방향 추정 → 축정렬 → 각 점을 H/V 이동으로 분류
    → 런(run) 경계가 코너. 각 런의 일정좌표(중앙값)로 클린 정점을 직접 구성.
    화이트노이즈에 강건(방향 분류가 창에서 적분됨)."""
    c = {**PALEO, **(cfg or {})}
    path = np.asarray(path, float)
    rs, _ = _resample(path, c["resample_spacing"])
    if len(rs) < 5:
        return rs[:, :2]
    rs = _smooth(rs, max(2.0, c["smooth_sigma"] * 0.5))
    w = int(c["turn_window"])
    frame = _dominant_orientation(rs, max(2, w // 2))
    th = np.radians(frame)
    R = np.array([[np.cos(th), np.sin(th)], [-np.sin(th), np.cos(th)]])  # 월드→프레임
    q = rs @ R.T
    # 각 점 H/V 분류 (창 속도의 |dx| vs |dy|)
    n = len(q)
    lab = np.empty(n, dtype='U1')
    for i in range(n):
        a, b = max(0, i - w), min(n - 1, i + w)
        vx = q[b, 0] - q[a, 0]; vy = q[b, 1] - q[a, 1]
        lab[i] = 'H' if abs(vx) >= abs(vy) else 'V'
    # 런 분할 + 짧은 런 흡수
    runs = []
    s = 0
    for i in range(1, n):
        if lab[i] != lab[s]:
            runs.append([lab[s], s, i - 1]); s = i
    runs.append([lab[s], s, n - 1])
    minrun = max(3, int(c["min_corner_sep"]))
    changed = True
    while changed and len(runs) > 1:
        changed = False
        for k, r in enumerate(runs):
            if r[2] - r[1] + 1 < minrun:
                # 이웃과 병합(더 긴 쪽 라벨로)
                if k == 0:
                    runs[1][1] = r[1]
                else:
                    runs[k - 1][2] = r[2]
                runs.pop(k); changed = True; break
    # 인접 동일라벨 병합
    m = [runs[0]]
    for r in runs[1:]:
        if r[0] == m[-1][0]:
            m[-1][2] = r[2]
        else:
            m.append(r)
    runs = m
    if len(runs) < 2:
        return rs[:, :2]
    # 각 런의 일정좌표(중앙값) + 축 범위
    coord = []
    for lb, a, b in runs:
        seg = q[a:b + 1]
        if lb == 'H':
            coord.append(('H', float(np.median(seg[:, 1]))))   # y 고정
        else:
            coord.append(('V', float(np.median(seg[:, 0]))))   # x 고정
    # 연속 런 교차 → 정점
    verts_q = []
    for k in range(len(runs)):
        lb, val = coord[k]
        nb, nval = coord[(k + 1) % len(runs)]
        if lb == nb:
            continue
        y = val if lb == 'H' else nval
        x = val if lb == 'V' else nval
        verts_q.append([x, y])
    verts_q = np.array(verts_q, float)
    if len(verts_q) < 3:
        return rs[:, :2]
    verts_q = np.vstack([verts_q, verts_q[0]])   # 폐곡선 명시(런은 순환) → 닫는 변 포함
    return verts_q @ R              # 프레임→월드 (R 직교이므로 역=전치의 전치)


def merge_polyline(strokes: list[np.ndarray], join_dist: float) -> np.ndarray:
    """다중 획을 끝점 근접 기준 하나의 폴리라인으로(리샘플 전 원좌표)."""
    polys = [np.asarray(s, float) for s in strokes if len(s) >= 2]
    if not polys:
        return np.empty((0, polys[0].shape[1] if polys else 2))
    merged = list(polys[0])
    for s in polys[1:]:
        end = np.array(merged[-1])[:2]
        if np.hypot(*(end - s[0, :2])) <= join_dist:
            merged.extend(s[1:])
        elif np.hypot(*(end - s[-1, :2])) <= join_dist:
            merged.extend(s[::-1][1:])
        else:
            merged.extend(s)
    return np.array(merged, float)
