// L-A **초기 3D 올리기** — 계획서 `docs/line_plan.md` §5.2. **한 번에 푼다.**
//
// ```
// 확정 순간 → 모든 획을 축별로 분류 → 화면상 교점을 전부 찾는다
//           → 그 교점 관계를 제약으로 두고 3D를 한 번에 푼다
//           → 스케일 자유도 하나만 남으므로 임의로 정한다
// ```
//
// **순서대로 하나씩 올리지 않는다.** 첫 획이 앵커가 되면 초기 오류가 고착되고, 그것이
// 세그먼트 게이트의 지지 1 문제였다(`docs/archive/segment_plan.md` 폐기 사유).
//
// ---------------------------------------------------------------- 왜 미지수가 획마다 하나인가
//
// 획 하나는 화면에서 직선 하나다. 그 직선을 눈에서 되쏘면 **해석 평면**이 생긴다 —
// 눈과 그 직선을 함께 담는 평면이고, 법선은 `n = ray(a) × ray(b)`다.
// 획의 3D 직선은 **반드시 그 평면 안에** 있다(각 점이 자기 광선 위에 있으므로).
//
// 축이 정해지면 **방향 `d`도 정해진다**(소실점 → 방향, 이론서 2.2). 방향이 정해진 직선이
// 평면 안에 있으면 남는 자유도는 **평면 안에서 `d`에 수직으로 미는 것 하나**다.
// 그 방향을 `e = n × d`로 두면
// ```
// 획 i의 3D 직선 = s_i·e_i + t·d_i        미지수는 s_i 하나
// ```
// `{e_i, d_i}`가 평면의 정규직교 기저이므로, 화면 점 q의 광선 `r`이 그 직선과 만나는 깊이는
// ```
// λ_i(q) = s_i / (r·e_i)
// ```
// 이다. 두 획이 화면 점 q에서 만나고 3D에서도 그 점을 공유하면 `λ_i(q) = λ_j(q)`이므로
// ```
// s_i·(r·e_j) − s_j·(r·e_i) = 0            **s에 대해 선형이다**
// ```
// 전체가 동차 선형계 `A s = 0`이 되고, **남는 자유도는 s의 전역 배율 하나**다 —
// 계획서가 "스케일 자유도 하나만 남는다"고 한 것이 바로 이것이다. 앵커도 씨앗도 없다.
import { lineIntersect, type Pt2 } from "./camera.js";
import { representative, type Axis, type Rep } from "./axis.js";
import { jacobiEigenSym, type Mat } from "../parser/linalg.js";
import {
  rayThrough, axisDirection, groundFrame, project, EYE_HEIGHT,
  unit3, cross3, sub3, add3, mul3, dot3, norm3, type Vec3,
} from "./geom3d.js";

export interface LiftStroke { id: string; pts2d: Pt2[]; axis: Axis; rep?: Rep }

export interface LiftCtx {
  principal: Pt2;
  f: number;
  /** 확정된 소실점. 관례상 `vps[2]`가 **수직축**이다. */
  vps: (Pt2 | null)[];
  imgSize: [number, number];
}

export const LIFT_TOL = {
  /**
   * **접합 반경**(화면 대각 대비). 교점이 두 획의 선분 안(이만큼 늘려서)에 있고,
   * **적어도 한 획의 끝점에서 이 안에** 있어야 제약으로 쓴다.
   *
   * 손으로 그으면 모서리에서 못 미치거나 지나치므로 늘려야 한다. 실획 자릿수는
   * `closure_gap` 환산 0.028~0.051뿐이고 그것은 **다른 양**이다(AS-C2) — 이 값은 잠정이고
   * L-B에서 스냅 반경과 함께 다시 정한다. 0.015는 옛 `join_ratio`의 값이다.
   */
  touch_ratio: 0.015,
  /**
   * **같은 축 두 획의 교점은 제약이 아니다.** 3D에서 나란한 두 직선이 화면에서 만나면
   * 그것은 **가림**이지 접합이 아니다. 방향 사이 각이 이보다 작으면 같은 축으로 본다(도).
   */
  parallel_deg: 5,
  /**
   * **이상점 제거 반복 횟수.** 화면에서 가로지르는 것과 3D에서 만나는 것이 다를 수 있고
   * (AS-20이 지지 1에서 걸린 자리), 전역 해에서는 그것이 **잔차로 드러난다**.
   * 0이면 꺼진다 — 켜야 하는지는 측정이 정한다(`lift_gate.json`).
   */
  reject_passes: 2,
  /** 잔차가 중앙값의 이 배수를 넘는 제약을 이상점으로 본다. */
  reject_mult: 4,
  /** 스케일 게이지 — 구조의 가장 낮은 점이 지면에 닿게 맞춘다. `geom3d.EYE_HEIGHT`와 같아야 한다. */
  gauge_height: EYE_HEIGHT,
};
export type LiftCfg = Partial<typeof LIFT_TOL>;

/** 화면 교점 하나 = 제약 하나. */
export interface Joint {
  i: string; j: string;
  /** 화면 교점. */
  q: Pt2;
  /** 해를 구한 뒤의 깊이 불일치 `|λ_i − λ_j| / mean` (무차원). */
  residual?: number;
  /** 이상점으로 버렸는가. */
  dropped?: boolean;
}

export interface LiftSeg { a: Vec3; b: Vec3 }

export interface LiftResult {
  /** 획 id → 3D 세그먼트. */
  placed: Map<string, LiftSeg>;
  /** 못 놓은 획과 이유. **버리지 않는다 — 화면에 남긴다**(D-C2). */
  unplaced: { id: string; reason: string }[];
  joints: Joint[];
  /** 푼 연결 성분의 획 id. */
  component: string[];
  /** 전역 배율(게이지). */
  scale: number;
  /** 제약 잔차 요약. */
  residual: { n: number; median: number | null; p90: number | null; max: number | null };
}

const diagOf = (sz: [number, number]) => Math.hypot(sz[0], sz[1]);
const sortNum = (xs: number[]) => xs.slice().sort((a, b) => a - b);
const quant = (xs: number[], q: number): number | null => {
  const v = sortNum(xs.filter(Number.isFinite));
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
};

/** 축 라벨 → 3D 방향. `screen`은 소실점이 없다(화면 평행, c=0) — 화면 방향 그대로 쓴다. */
export function dirOf(axis: Axis, ctx: LiftCtx, rep: Rep): Vec3 | null {
  if (axis === "free") return null;
  if (axis === "screen") {
    const d: Vec3 = [rep.b[0] - rep.a[0], rep.b[1] - rep.a[1], 0];
    return norm3(d) < 1e-9 ? null : unit3(d);
  }
  const vp = ctx.vps[axis];
  return vp ? axisDirection(vp, ctx.principal, ctx.f) : null;
}

/** 획 하나의 해석 평면과 그 안의 미지수 방향. */
export interface Frame {
  id: string; rep: Rep;
  /** 해석 평면 법선(눈과 화면 직선을 담는 평면). */
  n: Vec3;
  /** 평면 안으로 사영한 축 방향. */
  d: Vec3;
  /** 평면 안에서 `d`에 수직 — 미지수 `s`가 미는 방향. */
  e: Vec3;
  /** 축 방향을 평면 안으로 사영할 때 돌린 각(도). **판정이 얼마나 안 맞았는지의 3D 척도.** */
  tiltDeg: number;
}

/**
 * 획 → 해석 평면 프레임. 축 방향이 평면 안에 없으면(노이즈) **평면 안으로 사영한다** —
 * 방향이 평면 밖이면 그 축의 직선은 이 획의 상을 만들 수 없기 때문이다.
 * 돌린 각을 `tiltDeg`로 남긴다: 이것이 축 판정이 3D에서 얼마나 어긋났는지다.
 */
export function frameOf(st: LiftStroke, ctx: LiftCtx): Frame | { reason: string } {
  const rep = st.rep ?? representative(st.pts2d);
  if (!rep) return { reason: "대표 직선이 없다(너무 짧다)" };
  const ra = rayThrough(rep.a, ctx.principal, ctx.f);
  const rb = rayThrough(rep.b, ctx.principal, ctx.f);
  const nRaw = cross3(ra, rb);
  if (norm3(nRaw) < 1e-9) return { reason: "해석 평면이 서지 않는다(획이 한 점)" };
  const n = unit3(nRaw);
  const d0 = dirOf(st.axis, ctx, rep);
  if (!d0) return { reason: st.axis === "free" ? "축이 미분류다" : "그 축의 소실점이 없다" };
  const inPlane = sub3(d0, mul3(n, dot3(n, d0)));
  if (norm3(inPlane) < 1e-6) return { reason: "축 방향이 해석 평면에 수직이다" };
  const d = unit3(inPlane);
  const tiltDeg = (Math.acos(Math.min(1, Math.abs(dot3(d, d0)))) * 180) / Math.PI;
  const eRaw = cross3(n, d);
  if (norm3(eRaw) < 1e-9) return { reason: "미지수 방향이 서지 않는다" };
  return { id: st.id, rep, n, d, e: unit3(eRaw), tiltDeg };
}

/** 점이 선분 위(양쪽으로 `pad` 늘림) 안에 있는가. */
function onSegment(p: Pt2, rep: Rep, pad: number): boolean {
  const ex = rep.b[0] - rep.a[0], ey = rep.b[1] - rep.a[1];
  const L2 = ex * ex + ey * ey;
  if (L2 < 1e-12) return false;
  const t = ((p[0] - rep.a[0]) * ex + (p[1] - rep.a[1]) * ey) / L2;
  const m = pad / Math.sqrt(L2);
  return t >= -m && t <= 1 + m;
}

/** 교점이 그 획의 **끝점 근처**인가. 모서리 접합과 T자 접합이 이것을 만족한다. */
const endNear = (q: Pt2, rep: Rep, tol: number): boolean =>
  Math.hypot(q[0] - rep.a[0], q[1] - rep.a[1]) <= tol
  || Math.hypot(q[0] - rep.b[0], q[1] - rep.b[1]) <= tol;

/**
 * **화면 교점을 전부 찾는다**(§5.2 "2D에서는 확실하다"). — 다만 계획서보다 **좁게** 찾는다.
 *
 * 두 무한직선은 (평행이 아니면) 반드시 만나므로 **선분 안인지**를 본다. 그것만으로는 모자란다:
 * 상자 하나에서 27개 교점 중 **3개가 가림**이었다(뒤쪽 모서리가 앞쪽 수직 모서리를
 * 화면에서 가로지른다). 정확한 투영을 넣었는데도 그 3개 때문에 동차계의 최소 고유값이
 * 0이 아니게 되고(6.95e-3) **참 상자가 복원되지 않았다**(형태 오차 0.79).
 * §5.2의 "2D에서는 확실하다"는 **교점의 위치**에 대해서만 참이고
 * **그것이 3D 접합인지**에 대해서는 참이 아니다 — AS-20이 지지 1에서 걸린 자리와 같다.
 *
 * 그래서 **적어도 한 획의 끝점 근처**여야 한다고 요구한다. 모서리 접합(양쪽 끝점이 같은 점)과
 * T자 접합(한쪽 끝점이 다른 획의 몸통)은 통과하고, **양쪽 다 몸통에서 가로지르는 것은
 * 가림**이므로 떨어진다. 대가로 3D에서 진짜로 몸통끼리 교차하는 경우(면 대각선 둘이
 * 서로 가로지르는 것)를 놓치지만, **놓지 않는 쪽이 조용히 틀리는 것보다 낫다**(A-3).
 *
 * **같은 축끼리도 제외한다.** 3D에서 나란한 두 직선이 화면에서 만나면 그것도 가림이다.
 */
export function findJoints(frames: Frame[], ctx: LiftCtx, cfg: LiftCfg = {}): Joint[] {
  const c = { ...LIFT_TOL, ...cfg };
  const tol = c.touch_ratio * diagOf(ctx.imgSize);
  const cosPar = Math.cos((c.parallel_deg * Math.PI) / 180);
  const out: Joint[] = [];
  for (let a = 0; a < frames.length; a++) {
    for (let b = a + 1; b < frames.length; b++) {
      const F = frames[a], G = frames[b];
      if (Math.abs(dot3(F.d, G.d)) >= cosPar) continue;         // 같은 축 — 가림이다
      const q = lineIntersect(F.rep.a, F.rep.b, G.rep.a, G.rep.b);
      if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
      if (!onSegment(q, F.rep, tol) || !onSegment(q, G.rep, tol)) continue;
      if (!endNear(q, F.rep, tol) && !endNear(q, G.rep, tol)) continue;   // 몸통 교차 = 가림
      out.push({ i: F.id, j: G.id, q });
    }
  }
  return out;
}

/** 연결 성분 — 교점으로 이어진 획 묶음. 가장 큰 것만 푼다(나머지는 미배치, §5.2). */
export function components(ids: string[], joints: Joint[]): string[][] {
  const idx = new Map(ids.map((id, i) => [id, i]));
  const par = ids.map((_, i) => i);
  const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
  for (const j of joints) {
    const a = idx.get(j.i), b = idx.get(j.j);
    if (a == null || b == null) continue;
    par[find(a)] = find(b);
  }
  const groups = new Map<number, string[]>();
  ids.forEach((id, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  });
  return [...groups.values()].sort((p, q) => q.length - p.length);
}

/** 제약들의 동차 최소제곱 해 — `A s = 0`의 최소 고유벡터. 전역 배율이 남는다. */
function solveNull(ids: string[], frames: Map<string, Frame>, joints: Joint[], ctx: LiftCtx)
: number[] | null {
  const n = ids.length;
  const at = new Map(ids.map((id, i) => [id, i]));
  const M: Mat = Array.from({ length: n }, () => new Array(n).fill(0));
  let rows = 0;
  for (const jt of joints) {
    const ia = at.get(jt.i), ib = at.get(jt.j);
    if (ia == null || ib == null) continue;
    const F = frames.get(jt.i)!, G = frames.get(jt.j)!;
    const r = rayThrough(jt.q, ctx.principal, ctx.f);
    // s_i·(r·e_j) − s_j·(r·e_i) = 0. **행을 정규화한다** — 안 하면 계수가 큰 제약이 지배한다
    let ca = dot3(r, G.e), cb = -dot3(r, F.e);
    const L = Math.hypot(ca, cb);
    if (L < 1e-12) continue;
    ca /= L; cb /= L;
    M[ia][ia] += ca * ca; M[ib][ib] += cb * cb;
    M[ia][ib] += ca * cb; M[ib][ia] += ca * cb;
    rows += 1;
  }
  if (rows < n - 1) return null;                 // 영공간이 1차원보다 크다 — 형태가 안 정해진다
  const { values, vectors } = jacobiEigenSym(M);
  let mi = 0;
  for (let i = 1; i < values.length; i++) if (values[i] < values[mi]) mi = i;
  const s = vectors.map(row => row[mi]);
  return s.some(v => !Number.isFinite(v)) ? null : s;
}

/**
 * **초기 3D 올리기.** 카메라가 확정된 순간 한 번 부른다.
 *
 * 반환하는 것은 획마다 **3D 세그먼트 하나**다(프리핸드는 미뤘다, 계획서 §1.1).
 * `pts2d`는 호출자가 계속 보존한다 — 승격 때 처음부터 다시 올린다(§6.1).
 */
export function liftAll(strokes: LiftStroke[], ctx: LiftCtx, cfg: LiftCfg = {}): LiftResult {
  const c = { ...LIFT_TOL, ...cfg };
  const frames = new Map<string, Frame>();
  const unplaced: { id: string; reason: string }[] = [];
  for (const st of strokes) {
    const fr = frameOf(st, ctx);
    if ("reason" in fr) unplaced.push({ id: st.id, reason: fr.reason });
    else frames.set(st.id, fr);
  }
  const ids = [...frames.keys()];
  const fl = [...frames.values()];
  const empty: LiftResult = {
    placed: new Map(), unplaced, joints: [], component: [], scale: 1,
    residual: { n: 0, median: null, p90: null, max: null },
  };
  if (ids.length < 2) {
    for (const id of ids) unplaced.push({ id, reason: "이어진 획이 없다" });
    return empty;
  }

  const allJoints = findJoints(fl, ctx, c);
  const comps = components(ids, allJoints);
  const comp = comps[0] ?? [];
  if (comp.length < 2) {
    for (const id of ids) unplaced.push({ id, reason: "어느 획과도 교점이 없다" });
    return empty;
  }
  // 가장 큰 성분 밖은 미배치 — **스케일이 성분마다 따로라 상대 위치가 정해지지 않는다**
  const inComp = new Set(comp);
  for (const id of ids) if (!inComp.has(id)) unplaced.push({ id, reason: "구조에 이어지지 않았다" });

  let live = allJoints.filter(j => inComp.has(j.i) && inComp.has(j.j));
  let s: number[] | null = null;
  let res: number[] = [];

  for (let pass = 0; pass <= Math.max(0, c.reject_passes); pass++) {
    s = solveNull(comp, frames, live, ctx);
    if (!s) break;
    const at = new Map(comp.map((id, i) => [id, i]));
    res = live.map(jt => {
      const F = frames.get(jt.i)!, G = frames.get(jt.j)!;
      const r = rayThrough(jt.q, ctx.principal, ctx.f);
      const la = s![at.get(jt.i)!] / dot3(r, F.e);
      const lb = s![at.get(jt.j)!] / dot3(r, G.e);
      const mean = (Math.abs(la) + Math.abs(lb)) / 2;
      const v = mean > 1e-12 ? Math.abs(la - lb) / mean : Infinity;
      jt.residual = v;
      return v;
    });
    if (pass >= c.reject_passes) break;
    const med = quant(res, 0.5);
    if (med == null || !(med > 0)) break;
    const keep = live.filter((jt, k) => res[k] <= med * c.reject_mult);
    // 제약이 성분을 쪼갤 만큼 버리면 되돌린다 — 형태가 안 정해진다
    if (keep.length === live.length || keep.length < comp.length - 1) break;
    const stillOne = components(comp, keep)[0]?.length === comp.length;
    if (!stillOne) break;
    live.filter(jt => !keep.includes(jt)).forEach(jt => { jt.dropped = true; });
    live = keep;
  }
  if (!s) {
    for (const id of comp) unplaced.push({ id, reason: "교점 제약이 형태를 정하지 못한다" });
    return { ...empty, joints: allJoints };
  }

  // ---- 부호: 광선 깊이가 양수여야 한다(카메라 앞). 고유벡터의 부호는 임의다
  const at = new Map(comp.map((id, i) => [id, i]));
  const lamOf = (id: string, p: Pt2): number => {
    const F = frames.get(id)!;
    const r = rayThrough(p, ctx.principal, ctx.f);
    const den = dot3(r, F.e);
    return Math.abs(den) < 1e-12 ? NaN : s![at.get(id)!] / den;
  };
  let pos = 0, neg = 0;
  for (const id of comp) {
    const F = frames.get(id)!;
    for (const p of [F.rep.a, F.rep.b]) {
      const l = lamOf(id, p);
      if (Number.isFinite(l)) (l > 0 ? pos++ : neg++);
    }
  }
  const sign = neg > pos ? -1 : 1;
  s = s.map(v => v * sign);

  // ---- 세그먼트 만들기. 한쪽이라도 카메라 뒤면 놓지 않는다(A-3)
  const raw = new Map<string, LiftSeg>();
  for (const id of comp) {
    const F = frames.get(id)!;
    const la = lamOf(id, F.rep.a), lb = lamOf(id, F.rep.b);
    if (!(la > 1e-9) || !(lb > 1e-9)) {
      unplaced.push({ id, reason: "카메라 뒤로 간다(해석 평면이 지평선을 넘는다)" });
      continue;
    }
    raw.set(id, {
      a: mul3(rayThrough(F.rep.a, ctx.principal, ctx.f), la),
      b: mul3(rayThrough(F.rep.b, ctx.principal, ctx.f), lb),
    });
  }

  // ---- 스케일 게이지. **형태는 이미 정해졌고 여기서 정하는 것은 전역 배율뿐이다.**
  // 구조의 가장 낮은 점을 지면에 놓는다 — 격자와 눈높이를 맞추기 위한 것이고
  // "지면에 닿는다"를 **배치 근거로 쓰는 것이 아니다**(그것이 옛 씨앗 가정이었다).
  const g = groundFrame(ctx.vps[2] ?? null, ctx.principal, ctx.f, c.gauge_height);
  let hMax = -Infinity, zMed: number[] = [];
  for (const seg of raw.values()) for (const p of [seg.a, seg.b]) {
    hMax = Math.max(hMax, dot3(g.n, p));
    zMed.push(p[2]);
  }
  let scale = 1;
  if (Number.isFinite(hMax) && hMax > 1e-12) scale = c.gauge_height / hMax;
  else {
    const m = quant(zMed, 0.5);
    if (m && m > 1e-12) scale = 2 / m;                  // 폴백: 중앙 깊이를 2로
  }
  const placed = new Map<string, LiftSeg>();
  for (const [id, seg] of raw) placed.set(id, { a: mul3(seg.a, scale), b: mul3(seg.b, scale) });

  const kept = res.filter((_, k) => !live[k]?.dropped);
  return {
    placed, unplaced, joints: allJoints, component: comp, scale,
    residual: {
      n: kept.length, median: quant(kept, 0.5), p90: quant(kept, 0.9), max: quant(kept, 1),
    },
  };
}

/**
 * **전환 무변화**(§5.3) — 올린 세그먼트를 그린 카메라로 되쏘아 원본 대표 직선의 끝점과 비교한다.
 *
 * 카메라가 맞았다면 전환 순간 화면이 **똑같아야** 한다. 사용자는 전환을 인지하지 못한다.
 *
 * ⚠ **이 중 일부는 설계 보장이다**(selfcheck 자기참조 유형 3). 각 3D 점이 자기 광선 위에
 * 있으므로 되쏘면 정확히 그 화면 점으로 돌아온다 — 즉 여기서 재는 것은
 * **"세그먼트가 원본 획을 얼마나 대신하는가"**이지 카메라의 정확도가 아니다.
 * 그래서 두 값을 갈라 낸다:
 *   `segGap`  세그먼트 끝점 ↔ 대표 직선 끝점 (0이어야 한다 — **보장**, 불변식으로 잠근다)
 *   `inkGap`  세그먼트 ↔ **원본 획의 점열** (0이 아니다 — 프리핸드를 버린 값, §1.1의 대가)
 */
export function transitionGap(
  strokes: LiftStroke[], placed: Map<string, LiftSeg>, ctx: LiftCtx,
): { segGap: number[]; inkGap: number[] } {
  const segGap: number[] = [], inkGap: number[] = [];
  for (const st of strokes) {
    const seg = placed.get(st.id);
    if (!seg) continue;
    const rep = st.rep ?? representative(st.pts2d);
    if (!rep) continue;
    const pa = project(seg.a, ctx.principal, ctx.f), pb = project(seg.b, ctx.principal, ctx.f);
    if (!pa || !pb) continue;
    segGap.push(Math.hypot(pa[0] - rep.a[0], pa[1] - rep.a[1]));
    segGap.push(Math.hypot(pb[0] - rep.b[0], pb[1] - rep.b[1]));
    // 원본 획의 각 점에서 세그먼트 화면 상까지의 거리 — 손떨림을 버린 대가
    const ex = pb[0] - pa[0], ey = pb[1] - pa[1], L2 = ex * ex + ey * ey;
    for (const p of st.pts2d) {
      const t = L2 < 1e-12 ? 0
        : Math.max(0, Math.min(1, ((p[0] - pa[0]) * ex + (p[1] - pa[1]) * ey) / L2));
      inkGap.push(Math.hypot(pa[0] + ex * t - p[0], pa[1] + ey * t - p[1]));
    }
  }
  return { segGap, inkGap };
}

export { add3, sub3, mul3, dot3, unit3, norm3, cross3 };
