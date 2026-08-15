// G-A **세그먼트 기하** — 계획서 `docs/segment_plan.md` §1~§3.
//
// ```
// 획 → 방향 판정 → **무한직선 L** (위치는 교차가 정한다)
//                → 획 양 끝이 L 위 구간 [t0,t1]을 정한다
//                → 각 점 = L(t) + offset(t)      (손떨림 그대로)
// ```
//
// **세그먼트가 기하이고 오프셋이 표현이다.** 교차·접합은 **세그먼트끼리만** 일어나므로
// 손떨림이 계산에 들어오지 않는다. 화면에 나오는 것은 여전히 **손 획뿐**이다.
//
// ## 위치는 어떻게 정해지는가 — **시선 평면과의 교차**
//
// 그린 직선은 3D에서 어디 있는지 모르지만 **한 가지는 안다**: 눈과 그 화면 직선이 만드는
// 평면 P 위에 있다. 방향 d까지 정해지면 남는 자유도는 **P 안에서의 평행 이동 하나**뿐이다.
//
// 그 하나를 **기존 세그먼트가 P를 뚫는 점**이 정한다. 끝점이 정확할 필요가 없다 —
// 지나치거나 못 미쳐도 두 직선이 화면에서 **가로지르기만 하면** 그 점이 계산된다.
// 옛 방식(끝점이 반경 안에 있어야 앵커)이 실패하던 자리가 여기서 사라진다.
import type { Pt2 } from "./camera.js";
import type { Axis } from "./axis.js";
import { rayThrough, project, rayPlane, groundFrame, EYE_HEIGHT,
         unit3, cross3, sub3, add3, mul3, dot3, norm3, type Vec3, type Plane } from "./geom3d.js";
import { wobblePlane, axisVec, diagOf, type PlaceCtx, type WobblePlane } from "./stroke.js";

export const SEG_TOL = {
  /**
   * **교차로 볼 화면 거리**(그림 대각 대비). 기존 세그먼트가 시선 평면을 뚫는 점이 그린 획에서
   * 이만큼 안이면 그 획이 거기 닿았다고 본다. **화면에서 재므로 깊이 오차에 안 흔들린다.**
   * 옛 끝점 접합 반경(0.015)보다 관대해도 되지만(§9) 크면 무관한 세그먼트가 붙는다 —
   * G-A에서 스윕해 정한다.
   */
  cross_screen_ratio: 0.03,
  /**
   * 기존 세그먼트의 구간 밖으로 이만큼(구간 길이 대비)까지는 뚫은 것으로 인정한다.
   * **지나침이 정상이다**(§3) — 사람이 모서리를 조금 넘겨 긋는다.
   */
  extend_ratio: 0.25,
  /** 두 직선이 나란하다고 볼 각(도). 이보다 나란하면 교차점이 안 선다. */
  parallel_deg: 3,
  /** 3D 교차로 접합할 때 두 직선의 최근접 거리 한계(장면 대각 대비). */
  joint_gap_ratio: 0.05,
};

export interface Joint { with: string; at: Vec3; t: number; }

export interface Segment {
  id: string;
  axis: Axis;
  /** 무한직선 L: origin + dir·t. `dir`은 단위벡터다. */
  origin: Vec3;
  dir: Vec3;
  /** 획이 정한 구간. **직선을 먼저 만들고 획을 맞추는 것이 아니다**(§2). */
  t0: number;
  t1: number;
  joints: Joint[];
}

/** 획이 세그먼트에 매달린 결과. `pts3d`는 `L(t) + offset`로 재구성된 것이다. */
export interface Hung {
  segment: Segment;
  params: number[];
  offsets: Vec3[];
  pts3d: Vec3[];
  /** 위치를 정해 준 세그먼트(씨앗이면 `null`). */
  pinnedBy: string | null;
  /** 교차점이 그린 획에서 떨어진 화면 거리(그림 대각 대비). 씨앗이면 `null`. */
  pinScreenGap: number | null;
  /** **몇 개의 후보가 이 직선을 지지했는가**(아래 `chooseBySupport`). 씨앗이면 0. */
  support: number;
}

export const segAt = (s: Segment, t: number): Vec3 => add3(s.origin, mul3(s.dir, t));
export const segA = (s: Segment): Vec3 => segAt(s, s.t0);
export const segB = (s: Segment): Vec3 => segAt(s, s.t1);
export const segLen = (s: Segment): number => Math.abs(s.t1 - s.t0);

/**
 * **시선 평면** — 눈(원점)과 화면 위 두 점이 만드는 평면. 그린 직선의 3D 대응은 반드시 이 위에 있다.
 * 법선은 두 시선 벡터의 외적이고, 평면은 원점을 지나므로 `d = 0`이다.
 */
export function sightPlane(a: Pt2, b: Pt2, ctx: PlaceCtx): Vec3 | null {
  const ra = rayThrough(a, ctx.principal, ctx.f), rb = rayThrough(b, ctx.principal, ctx.f);
  const n = cross3(ra, rb);
  return norm3(n) < 1e-9 ? null : unit3(n);
}

/**
 * 기존 세그먼트가 시선 평면 `n·x = 0`을 뚫는 점. 구간 밖이면 `extend`만큼 봐준다.
 * 나란하면(법선과 방향이 수직) `null`.
 */
export function pierce(seg: Segment, n: Vec3, extend = SEG_TOL.extend_ratio): Vec3 | null {
  const den = dot3(n, seg.dir);
  const sinDeg = Math.abs(den);                       // dir·n = sin(직선과 평면이 이루는 각)
  if (sinDeg < Math.sin((SEG_TOL.parallel_deg * Math.PI) / 180)) return null;
  const t = -dot3(n, seg.origin) / den;
  const lo = Math.min(seg.t0, seg.t1), hi = Math.max(seg.t0, seg.t1);
  const m = (hi - lo) * extend;
  if (t < lo - m || t > hi + m) return null;
  return segAt(seg, t);
}

/** 점과 선분의 거리(화면). 교차점이 그린 획 위에 있는지 보는 데 쓴다. */
function segDist2d(p: Pt2, a: Pt2, b: Pt2): number {
  const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
  const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2));
  return Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]);
}

/** 점이 그린 획(폴리라인)에서 떨어진 화면 거리. 획 전체를 본다 — 끝점만 보지 않는다. */
export function screenGapToStroke(p: Pt2, pts2d: Pt2[]): number {
  let d = Infinity;
  for (let i = 1; i < pts2d.length; i++) d = Math.min(d, segDist2d(p, pts2d[i - 1], pts2d[i]));
  return d;
}

/**
 * **획을 직선 L에 매단다**(§2). 각 점의 광선을 L을 담는 떨림 평면과 만나게 하고,
 * 그 3D 점을 `t`(L 위 매개변수)와 `offset`(L에서의 이탈)로 나눈다.
 *
 * 떨림 평면은 `facing` 그대로다(D-S8, §2.1) — 그린 시점의 화면 투영이 원본과 정확히 같다.
 */
export function hang(pts2d: Pt2[], origin: Vec3, dir: Vec3, ctx: PlaceCtx,
                     mode: WobblePlane = "facing"): { params: number[]; offsets: Vec3[]; pts3d: Vec3[] } | null {
  const d = unit3(dir);
  const pl: Plane = wobblePlane(origin, d, mode);
  const params: number[] = [], offsets: Vec3[] = [], pts3d: Vec3[] = [];
  for (const s of pts2d) {
    const hit = rayPlane([0, 0, 0], rayThrough(s, ctx.principal, ctx.f), pl.n, pl.d);
    if (!hit) return null;                            // 한 점이라도 놓치면 획이 조각난다
    const w = sub3(hit, origin);
    const t = dot3(w, d);
    params.push(t);
    offsets.push(sub3(w, mul3(d, t)));
    pts3d.push(hit);
  }
  return params.length >= 2 ? { params, offsets, pts3d } : null;
}

/** `L(t) + offset`로 3D를 재구성한다. **저장·재계산이 이 한 줄로 된다**(§1). */
export const rebuild = (seg: Segment, params: number[], offsets: Vec3[]): Vec3[] =>
  params.map((t, i) => add3(segAt(seg, t), offsets[i]));

let _seq = 0;
export const resetSegmentIds = () => { _seq = 0; };
export const setSegmentSeq = (n: number) => { _seq = Math.max(_seq, n); };
export const segmentSeq = () => _seq;

/** 직선 하나와 매달린 획으로 세그먼트를 만든다. **구간은 획이 정한다.** */
export function makeSegment(axis: Axis, origin: Vec3, dir: Vec3, params: number[]): Segment {
  return { id: `g${++_seq}`, axis, origin, dir: unit3(dir),
           t0: Math.min(...params), t1: Math.max(...params), joints: [] };
}

export interface PinCandidate {
  /** 위치를 정해 준 기존 세그먼트. */
  by: Segment;
  /** 그 세그먼트가 시선 평면을 뚫은 점. 새 직선은 이 점을 지난다. */
  at: Vec3;
  /** 그 점이 그린 획에서 떨어진 화면 거리(대각 대비). 작을수록 좋다. */
  gap: number;
}

/**
 * **새 획의 위치를 정할 후보들**(§3). 기존 세그먼트마다 시선 평면을 뚫는 점을 구하고,
 * 그 점이 **그린 획 위에 있는지**를 화면에서 본다.
 *
 * 화면에서 재는 이유: 깊이는 아직 모르고, 사용자가 아는 것도 화면뿐이다.
 * **끝점이 아니라 획 전체와 견준다** — 지나치거나 못 미친 것이 여기서 흡수된다.
 */
export function pinCandidates(
  placed: Segment[], pts2d: Pt2[], rep: { a: Pt2; b: Pt2 }, ctx: PlaceCtx,
  tolRatio = SEG_TOL.cross_screen_ratio,
): PinCandidate[] {
  const n = sightPlane(rep.a, rep.b, ctx);
  if (!n) return [];
  const tol = tolRatio * diagOf(ctx.imgSize);
  const out: PinCandidate[] = [];
  for (const seg of placed) {
    const X = pierce(seg, n);
    if (!X || X[2] <= 1e-9) continue;
    const p = project(X, ctx.principal, ctx.f);
    if (!p) continue;
    const gap = screenGapToStroke(p, pts2d);
    if (gap <= tol) out.push({ by: seg, at: X, gap });
  }
  return out.sort((x, y) => x.gap - y.gap);
}

/**
 * **후보 하나로는 못 고른다** — 화면에서 가로지르는 것과 3D에서 만나는 것이 다르기 때문이다.
 * 먼 모서리가 가까운 모서리를 **화면에서만** 가로지르면 그 교차점은 엉뚱한 깊이를 준다
 * (상자 12모서리에서 실제로 둘이 그렇게 놓였다 — 오차 0.6~0.87).
 *
 * **지지 수로 고른다**: 후보 X_i가 정한 직선 L_i 위에 **다른 후보들도 놓이는가**.
 * 진짜 위치는 그 획이 실제로 만나는 모든 세그먼트를 동시에 설명한다. 가짜는 자기 하나뿐이다.
 *
 * 허용치는 **그 깊이에서의 화면 허용치**로 환산한다(`tol_px · z / f`) — 3D 거리로 고정하면
 * 먼 물체에서 관대해지고 가까운 데서 가혹해진다.
 *
 * _이것은 옛 정합성 검사(D-S13·D-S16)와 목적이 같지만 **끝점 정확도를 요구하지 않는다**._
 */
export function chooseBySupport(
  cands: PinCandidate[], dir: Vec3, ctx: PlaceCtx, tolRatio = SEG_TOL.cross_screen_ratio,
): PinCandidate & { support: number } {
  const tolPx = tolRatio * diagOf(ctx.imgSize);
  const distToLine = (p: Vec3, o: Vec3, d: Vec3): number => {
    const w = sub3(p, o);
    return norm3(sub3(w, mul3(d, dot3(w, d))));
  };
  let best: (PinCandidate & { support: number }) | null = null;
  for (const c of cands) {
    let support = 0;
    for (const o of cands) {
      if (distToLine(o.at, c.at, dir) <= (tolPx * o.at[2]) / ctx.f) support += 1;
    }
    // _동점을 **입사각**으로 갈라 봤다(스치듯 지나는 세그먼트는 교차점이 미끄러진다).
    //  **더 나빠졌다**(0.218 → 0.256) — 측정을 따라 화면 거리로 되돌렸다(A-3)._
    if (!best || support > best.support || (support === best.support && c.gap < best.gap)) {
      best = { ...c, support };
    }
  }
  return best!;
}

/** 이 카메라의 지면(씨앗용). 옛 배치 계층과 같은 게이지를 쓴다. */
export const groundOf = (ctx: PlaceCtx): Plane =>
  groundFrame(ctx.vps[2] ?? null, ctx.principal, ctx.f, EYE_HEIGHT);

/**
 * **획 하나를 세그먼트로 만든다**(§2·§3·§3.1).
 *
 * 1. 축 방향 `d`를 얻는다(없으면 실패 — 미분류는 §6에서 다룬다).
 * 2. 기존 세그먼트가 시선 평면을 뚫는 점으로 위치를 정한다.
 * 3. 아무것도 없고 `seed`가 허용되면 지면 접촉으로 씨앗을 놓는다.
 * 4. 획을 매달아 구간과 오프셋을 얻는다.
 */
export function segmentize(
  placed: Segment[], pts2d: Pt2[], axis: Axis, ctx: PlaceCtx,
  opts: { rep?: { a: Pt2; b: Pt2 }; seed?: boolean; mode?: WobblePlane;
          tolRatio?: number;
          /**
           * **몇 개의 교차가 일치해야 놓는가**(D-G4). 1이면 후보 하나로도 놓는다 —
           * 그 경우 30%가 크게 틀렸다(측정). 2면 **두 교차가 같은 직선을 가리켜야** 놓는다.
           * 조용히 틀린 배치보다 미배치가 낫다(A-3).
           */
          minSupport?: number } = {},
): Hung | null {
  if (pts2d.length < 2) return null;
  const rep = opts.rep ?? { a: pts2d[0], b: pts2d[pts2d.length - 1] };
  const dir = axisVec(axis, ctx, rep);
  if (!dir) return null;

  const cands = pinCandidates(placed, pts2d, rep, ctx, opts.tolRatio);
  let origin: Vec3 | null = null, pinnedBy: string | null = null, gap: number | null = null;
  let support = 0;
  if (cands.length) {
    const pick = chooseBySupport(cands, unit3(dir), ctx, opts.tolRatio);
    if (pick.support >= (opts.minSupport ?? 1)) {
      origin = pick.at; pinnedBy = pick.by.id; support = pick.support;
      gap = +(pick.gap / diagOf(ctx.imgSize)).toFixed(6);
    }
  }
  if (!origin && cands.length && (opts.minSupport ?? 1) > 1) {
    return null;                                       // 놓지 않되 버리지 않는다(A-3)
  } else if (opts.seed ?? placed.length === 0) {
    // **씨앗은 하나면 된다**(§3.1) — 나머지는 교차로 전파된다.
    const g = groundOf(ctx);
    origin = rayPlane([0, 0, 0], rayThrough(pts2d[0], ctx.principal, ctx.f), g.n, g.d);
  }
  if (!origin) return null;                            // 놓지 않되 버리지 않는다(A-3)

  const h = hang(pts2d, origin, dir, ctx, opts.mode);
  if (!h) return null;
  const segment = makeSegment(axis, origin, unit3(dir), h.params);
  return { segment, params: h.params, offsets: h.offsets, pts3d: h.pts3d,
           pinnedBy, pinScreenGap: gap, support };
}

// ---------------------------------------------------------------- §3 교차 접합

export interface Cross { a: Segment; b: Segment; pa: Vec3; pb: Vec3; mid: Vec3; gap: number;
                         ta: number; tb: number; }

/** 두 직선의 최근접점 쌍. 나란하면 `null`. */
export function closestOnLines(a: Segment, b: Segment): Cross | null {
  const u = a.dir, v = b.dir;
  const w0 = sub3(a.origin, b.origin);
  const c = dot3(u, v), den = 1 - c * c;
  if (Math.abs(den) < 1e-9) return null;               // 나란하다
  const du = dot3(u, w0), dv = dot3(v, w0);
  const ta = (c * dv - du) / den;
  const tb = (dv - c * du) / den;
  const pa = segAt(a, ta), pb = segAt(b, tb);
  return { a, b, pa, pb, mid: mul3(add3(pa, pb), 0.5), gap: norm3(sub3(pa, pb)), ta, tb };
}

/**
 * **교차로 접합한다**(§3). 두 세그먼트가 3D에서 충분히 가까이 스치면 그 점까지
 * **연장하거나 잘라** 만나게 한다. 끝점 정확도가 아니라 직선끼리의 거리가 기준이다.
 *
 * `scale`은 장면 크기(임계의 분모). 구간 밖이면 `extend_ratio`만큼만 봐준다 —
 * 무한직선끼리는 거의 언제나 어딘가에서 만나므로 그것을 그대로 쓰면 아무 데나 붙는다.
 */
export function joinByCrossing(seg: Segment, others: Segment[], scale: number,
                               opts: { gapRatio?: number; extend?: number } = {}): number {
  const gapMax = (opts.gapRatio ?? SEG_TOL.joint_gap_ratio) * scale;
  const ext = opts.extend ?? SEG_TOL.extend_ratio;
  let n = 0;
  for (const o of others) {
    if (o.id === seg.id) continue;
    const c = closestOnLines(seg, o);
    if (!c || c.gap > gapMax) continue;
    const inSpan = (s: Segment, t: number) => {
      const lo = Math.min(s.t0, s.t1), hi = Math.max(s.t0, s.t1), m = (hi - lo) * ext;
      return t >= lo - m && t <= hi + m;
    };
    if (!inSpan(seg, c.ta) || !inSpan(o, c.tb)) continue;
    // **연장하거나 자른다** — 구간을 그 점까지 늘린다(안쪽이면 그대로 둔다).
    if (c.ta < Math.min(seg.t0, seg.t1)) { if (seg.t0 < seg.t1) seg.t0 = c.ta; else seg.t1 = c.ta; }
    if (c.ta > Math.max(seg.t0, seg.t1)) { if (seg.t0 > seg.t1) seg.t0 = c.ta; else seg.t1 = c.ta; }
    seg.joints.push({ with: o.id, at: c.mid, t: c.ta });
    o.joints.push({ with: seg.id, at: c.mid, t: c.tb });
    n += 1;
  }
  return n;
}

/** 장면 크기 — 임계의 분모. 놓인 세그먼트들의 3D 경계 상자 대각이다. */
export function sceneScale(segs: Segment[]): number {
  const pts = segs.flatMap(s => [segA(s), segB(s)]);
  if (pts.length < 2) return 1;
  const lo = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])));
  const hi = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
  return Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
}

// ---------------------------------------------------------------- 앱이 드는 것

/**
 * 획 하나 + 매달린 결과. **`Stroke`(옛 자료구조)를 대체한다**(§1) —
 * `pts3d`는 들지 않는다: `L(t) + offset`으로 언제든 재구성된다.
 */
export interface SegStroke {
  id: string;
  pts2d: Pt2[];
  axis: Axis;
  rep?: { a: Pt2; b: Pt2 };
  hung: Hung | null;
  color?: string;
  width?: number;
}

export const isPlaced = (s: SegStroke): boolean => !!s.hung;
/** 지금 3D 점열. **저장하지 않고 필요할 때 만든다**(§1). */
export const pointsOf = (s: SegStroke): Vec3[] =>
  s.hung ? rebuild(s.hung.segment, s.hung.params, s.hung.offsets) : [];

export interface SettleOpts {
  mode?: WobblePlane;
  tolRatio?: number;
  /** 일치해야 하는 교차 수(D-G4). 기본 1. */
  minSupport?: number;
  /** 3D 교차 접합의 허용 거리(장면 대각 대비). 0이면 접합을 안 한다. */
  joinGapRatio?: number;
  /** 씨앗을 허용할지. 기본은 **놓인 것이 하나도 없을 때만**(§3.1). */
  seedIfEmpty?: boolean;
}

/**
 * **더 붙지 않을 때까지 반복한다**(옛 `settle`과 같은 이유): 나중 획이 먼저 놓이면
 * 앞서 못 놓은 획이 그때 걸린다. 순서에 따라 영구 미배치가 남지 않게 한다.
 */
export function settleSegments(items: SegStroke[], ctx: PlaceCtx, opts: SettleOpts = {}): number {
  let added = 0;
  // **그린 순서대로 놓는다.** "지지가 많은 것부터" 놓아 봤는데 **더 나빠졌다**(지지 1의 오류
  // 30% → 49%) — 측정을 따른다(A-3). 순서를 바꾸면 초기 배치가 임의의 획으로 정해지고
  // 그 위에 쌓이기 때문으로 보인다. 원장: `segment_gate.json`의 `ordering` 기록.
  for (let pass = 0; pass < items.length + 1; pass++) {
    let moved = 0;
    const placed = items.filter(isPlaced).map(s => s.hung!.segment);
    for (const it of items) {
      if (it.hung) continue;
      const h = segmentize(placed, it.pts2d, it.axis, ctx, {
        rep: it.rep, mode: opts.mode, tolRatio: opts.tolRatio, minSupport: opts.minSupport,
        seed: opts.seedIfEmpty ?? placed.length === 0,
      });
      if (!h) continue;
      it.hung = h;
      if (opts.joinGapRatio !== 0) {
        joinByCrossing(h.segment, placed, sceneScale([...placed, h.segment]),
                       { gapRatio: opts.joinGapRatio });
      }
      placed.push(h.segment);
      moved += 1; added += 1;
    }
    if (!moved) break;
  }
  return added;
}

/** 카메라가 바뀌면 전부 다시 만든다(§5의 재계산). `pts2d`가 원본이다. */
export function resegmentAll(items: SegStroke[], ctx: PlaceCtx, opts: SettleOpts = {}): number {
  for (const it of items) it.hung = null;
  return settleSegments(items, ctx, opts);
}
