"""정규화 코어 — 획 → 폴리곤 + 제약 그래프 (§5, §6.4).

전 구간 결정론적(§6.4). 조정 대상은 tolerance 스칼라 ~10개뿐.
파이프라인(§6.4): 획 → 리샘플 → Douglas-Peucker → 선분 적합 → 축 클러스터링
                 → 직교 스냅 → 제약 추론 → (폴리곤).
검증용 1차 구현은 즉시 스냅(§5.2). 후보 유지는 2차.

stage0 그리드 서치(항목4)와 stage1 normalize가 공유한다 → 단일 소스.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np

# --- tolerance 스칼라 (§6.4, ~10개) -----------------------------------------
DEFAULT_TOL = {
    "resample_spacing": 3.0,     # 리샘플 간격 (좌표 단위)
    "dp_epsilon": 6.0,           # Douglas-Peucker 단순화 임계
    "min_segment_len": 4.0,      # 이보다 짧은 선분 제거
    "collinear_merge_deg": 12.0, # 인접 선분 병합(거의 일직선)
    "axis_cluster_deg": 20.0,    # 지배 축 클러스터링 허용각
    "ortho_snap_deg": 22.0,      # 직교(0/90) 스냅 허용각
    "coincident_dist": 8.0,      # 끝점 일치(폴리곤 닫힘) 거리
    "parallel_deg": 8.0,         # 평행 판정
    "perpendicular_deg": 8.0,    # 직교 판정
    "equal_len_ratio": 0.12,     # 길이 동일 판정 (상대오차)
}


# --- 기하 유틸 ---------------------------------------------------------------
def resample(pts: np.ndarray, spacing: float) -> np.ndarray:
    if len(pts) < 2:
        return pts
    seg = np.diff(pts, axis=0)
    d = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.concatenate([[0], np.cumsum(d)])
    total = cum[-1]
    if total < 1e-9:
        return pts[:1]
    n = max(2, int(total // spacing) + 1)
    targets = np.linspace(0, total, n)
    x = np.interp(targets, cum, pts[:, 0])
    y = np.interp(targets, cum, pts[:, 1])
    return np.stack([x, y], 1)


def douglas_peucker(pts: np.ndarray, eps: float) -> np.ndarray:
    if len(pts) < 3:
        return pts
    start, end = pts[0], pts[-1]
    line = end - start
    L = np.hypot(*line)
    if L < 1e-9:
        d = np.hypot(*(pts - start).T)
    else:
        d = np.abs(np.cross(line, pts - start)) / L
    idx = int(np.argmax(d))
    if d[idx] > eps:
        left = douglas_peucker(pts[:idx + 1], eps)
        right = douglas_peucker(pts[idx:], eps)
        return np.vstack([left[:-1], right])
    return np.vstack([start, end])


def stroke_straightness(xs, ys) -> float | None:
    """총최소제곱(PCA) 부축 RMS / 주축 길이. 낮을수록 직선. 정규화됨(§6.1).
    노이즈모델 검정·오버레이 어긋남 기준과 동일 척도."""
    xs = np.asarray(xs, float); ys = np.asarray(ys, float)
    if len(xs) < 3:
        return None
    p = np.stack([xs, ys], 1)
    p = p - p.mean(0)
    _, _, vt = np.linalg.svd(p, full_matrices=False)
    proj = p @ vt.T
    major = proj[:, 0].max() - proj[:, 0].min()
    if major < 1e-6:
        return None
    return float(np.sqrt(np.mean(proj[:, 1] ** 2)) / major)


def _angle(p, q) -> float:
    return np.degrees(np.arctan2(q[1] - p[1], q[0] - p[0]))


def _adiff(a, b) -> float:
    """0..90 각차 (선의 방향 무의미)."""
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


# --- 프리미티브 / 제약 (SketchGraphs 호환 어휘) -----------------------------
@dataclass
class Line:
    p0: tuple[float, float]
    p1: tuple[float, float]

    @property
    def length(self) -> float:
        return float(np.hypot(self.p1[0] - self.p0[0], self.p1[1] - self.p0[1]))

    @property
    def angle(self) -> float:
        return _angle(self.p0, self.p1)


# 제약 종류 = SketchGraphs 부분집합 (§6.2: 건축은 직교폴리곤 부분집합)
CONSTRAINT_TYPES = ("horizontal", "vertical", "parallel", "perpendicular",
                    "coincident", "equal")


@dataclass
class Graph:
    lines: list[Line] = field(default_factory=list)
    constraints: set = field(default_factory=set)   # (type, i, j) i<=j

    def add(self, t, i, j=-1):
        if j >= 0 and i > j:
            i, j = j, i
        self.constraints.add((t, i, j))


# --- 파서: 획들 → 폴리곤 라인 + 추론된 제약 ---------------------------------
def parse_strokes(strokes: list[np.ndarray], tol: dict = None) -> Graph:
    t = {**DEFAULT_TOL, **(tol or {})}
    # 1) 리샘플 + DP 단순화, 한 폴리라인으로 잇기(끝점 근접시)
    polys = []
    for s in strokes:
        s = np.asarray(s, float)
        if len(s) < 2:
            continue
        s = resample(s, t["resample_spacing"])
        s = douglas_peucker(s, t["dp_epsilon"])
        polys.append(s)
    if not polys:
        return Graph()
    # 다중 획 병합: 끝점이 가까우면 이어붙임(단순 그리디)
    merged = list(polys[0])
    for s in polys[1:]:
        if np.hypot(*(np.array(merged[-1]) - s[0])) <= t["coincident_dist"]:
            merged.extend(s[1:])
        elif np.hypot(*(np.array(merged[-1]) - s[-1])) <= t["coincident_dist"]:
            merged.extend(s[::-1][1:])
        else:
            merged.extend(s)
    pts = np.array(merged, float)

    # 2) 선분화 + 짧은 선분 제거
    verts = [pts[0]]
    for p in pts[1:]:
        if np.hypot(*(p - verts[-1])) >= t["min_segment_len"]:
            verts.append(p)
    verts = np.array(verts, float)
    closed = len(verts) >= 3 and np.hypot(*(verts[0] - verts[-1])) <= t["coincident_dist"]

    # 3) 축 클러스터링 → 지배 프레임 → 정점 체인 직교 스냅(연결성 보존)
    tmp = [Line(tuple(verts[i]), tuple(verts[i + 1])) for i in range(len(verts) - 1)]
    frame = _dominant_frame(tmp, t["axis_cluster_deg"])
    verts = _ortho_snap_chain(verts, frame, t["ortho_snap_deg"], closed)

    # 4) 라인 재구성(정점 공유) + 짧은 선분 제거 + 거의 일직선 병합
    lines = [Line(tuple(verts[i]), tuple(verts[i + 1])) for i in range(len(verts) - 1)]
    lines = [l for l in lines if l.length >= t["min_segment_len"]]
    lines = _merge_collinear(lines, t["collinear_merge_deg"])

    # 5) 제약 추론
    g = Graph(lines=lines)
    _infer(g, t)
    return g


def _merge_collinear(lines, deg):
    if not lines:
        return lines
    out = [lines[0]]
    for l in lines[1:]:
        if _adiff(out[-1].angle, l.angle) <= deg and \
           np.hypot(*(np.array(out[-1].p1) - l.p0)) < 1e-6:
            out[-1] = Line(out[-1].p0, l.p1)
        else:
            out.append(l)
    return out


def _dominant_frame(lines, deg) -> float:
    """가장 많은 길이가 몰린 방향(0..90)을 프레임 각으로."""
    if not lines:
        return 0.0
    angs = np.array([l.angle % 90.0 for l in lines])
    w = np.array([l.length for l in lines])
    best, best_w = 0.0, -1
    for a0 in angs:
        m = np.abs(((angs - a0 + 45) % 90) - 45) <= deg
        tw = w[m].sum()
        if tw > best_w:
            best_w, best = tw, float(np.average(angs[m], weights=w[m]))
    return best


def _rot(p, c, deg):
    r = np.radians(deg)
    v = np.array(p) - c
    m = np.array([[np.cos(r), -np.sin(r)], [np.sin(r), np.cos(r)]])
    return tuple(m @ v + c)


def _rotmat(deg):
    r = np.radians(deg)
    return np.array([[np.cos(r), -np.sin(r)], [np.sin(r), np.cos(r)]])


def _ortho_snap_chain(verts: np.ndarray, frame: float, deg: float, closed: bool):
    """정점 체인을 지배 프레임 기준 직교로 스냅하되 연결성(공유 정점) 보존.
    각 변을 H/V로 분류(허용각 내) 후 좌표 동일화를 순차 전파 → 클린 직교 폴리곤.
    미니 제약 해(§6.4): 재구현하지 않는 결정론적 rectilinear solve."""
    if len(verts) < 2:
        return verts
    c = verts.mean(0)
    R = _rotmat(-frame)
    v = (verts - c) @ R.T            # 프레임 좌표
    out = [v[0].copy()]
    for i in range(1, len(v)):
        prev = out[-1]; cur = v[i].copy()
        dx = cur[0] - prev[0]; dy = cur[1] - prev[1]
        ang = np.degrees(np.arctan2(dy, dx)) % 180.0
        near = min([0, 90, 180], key=lambda k: abs(ang - k))
        if abs(ang - near) <= deg:
            if near % 180 == 0:      # 수평 → y 고정
                cur[1] = prev[1]
            else:                    # 수직 → x 고정
                cur[0] = prev[0]
        out.append(cur)
    out = np.array(out)
    if closed:                       # 폐곡선: 끝점을 시작점에 맞춤
        out[-1] = out[0]
    return (out @ _rotmat(frame).T) + c


def _infer(g: Graph, t):
    L = g.lines
    for i, li in enumerate(L):
        a = li.angle % 180.0
        if min(a, 180 - a) <= t["perpendicular_deg"]:
            g.add("horizontal", i)
        if abs(a - 90) <= t["perpendicular_deg"]:
            g.add("vertical", i)
    for i in range(len(L)):
        for j in range(i + 1, len(L)):
            d = _adiff(L[i].angle, L[j].angle)
            if d <= t["parallel_deg"]:
                g.add("parallel", i, j)
            elif abs(d - 90) <= t["perpendicular_deg"]:
                g.add("perpendicular", i, j)
            if L[j].length > 1e-6 and abs(L[i].length - L[j].length) / \
                    max(L[i].length, L[j].length) <= t["equal_len_ratio"]:
                g.add("equal", i, j)
    # 인접(coincident): 폴리곤 순서상 i,i+1 끝점 공유 + 폐곡선 닫힘변
    for i in range(len(L) - 1):
        if np.hypot(*(np.array(L[i].p1) - L[i + 1].p0)) <= t["coincident_dist"]:
            g.add("coincident", i, i + 1)
    if len(L) >= 3 and np.hypot(*(np.array(L[-1].p1) - L[0].p0)) <= t["coincident_dist"]:
        g.add("coincident", len(L) - 1, 0)


def match_lines(truth: list[Line], rec: list[Line], scale: float) -> dict:
    """복원 라인 → 정답 라인 대응 (Hungarian). 인덱스 기반 제약 비교 전제.
    반환: rec_idx -> truth_idx (매칭 실패분 제외)."""
    from scipy.optimize import linear_sum_assignment
    if not truth or not rec:
        return {}
    def mid(l): return ((l.p0[0] + l.p1[0]) / 2, (l.p0[1] + l.p1[1]) / 2)
    def adiff(a, b):
        d = abs(a - b) % 180; return min(d, 180 - d)
    C = np.zeros((len(rec), len(truth)))
    for i, r in enumerate(rec):
        for j, t in enumerate(truth):
            dm = np.hypot(mid(r)[0] - mid(t)[0], mid(r)[1] - mid(t)[1]) / (scale + 1e-9)
            da = adiff(r.angle, t.angle) / 30.0
            C[i, j] = dm + da
    ri, tj = linear_sum_assignment(C)
    return {int(i): int(j) for i, j in zip(ri, tj) if C[i, j] < 0.5}


def remap(rec: Graph, mapping: dict) -> set:
    out = set()
    for (typ, i, j) in rec.constraints:
        if i in mapping and (j < 0 or j in mapping):
            ni = mapping[i]; nj = mapping[j] if j >= 0 else -1
            if nj >= 0 and ni > nj:
                ni, nj = nj, ni
            out.add((typ, ni, nj))
    return out


def compare_matched(truth: Graph, rec: Graph) -> dict:
    """기하 대응으로 인덱스 정렬 후 제약집합 비교 (§6.5)."""
    allpts = [p for l in truth.lines for p in (l.p0, l.p1)]
    if allpts:
        xs = [p[0] for p in allpts]; ys = [p[1] for p in allpts]
        scale = max(max(xs) - min(xs), max(ys) - min(ys))
    else:
        scale = 1.0
    mapping = match_lines(truth.lines, rec.lines, scale)
    rec_mapped = Graph(constraints=remap(rec, mapping))
    return compare(truth, rec_mapped)


# --- 그래프 비교 (§6.5 제약 그래프 일치율) ----------------------------------
def compare(truth: Graph, rec: Graph) -> dict:
    T, R = truth.constraints, rec.constraints
    inter = T & R
    prec = len(inter) / len(R) if R else 0.0
    rec_ = len(inter) / len(T) if T else 0.0
    f1 = 2 * prec * rec_ / (prec + rec_) if (prec + rec_) else 0.0
    return {"precision": round(prec, 4), "recall": round(rec_, 4),
            "f1": round(f1, 4), "n_truth": len(T), "n_rec": len(R)}
