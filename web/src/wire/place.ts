// W-3 앵커 체인 — 계획서 §4.2. 방향만으로는 깊이가 정해지지 않는다.
//
//   1. 씨앗   지면 접촉점. 첫 점을 Z=0으로 둔다
//   2. 전파   그 점에서 알려진 방향으로 광선-직선 최근접점
//   3. 교차   기존 엣지와 만나는 지점이 새 앵커
//   4. 반복
//
// **연결된 것만 배치된다.** 떠 있는 획은 깊이 미결정이며 추정하지 않는다 —
// 가장 가까운 기존 기하에 붙거나, 붙을 곳이 없으면 배치를 미룬다.
import type { Pt2 } from "./camera.js";
import type { Direction } from "./infer.js";
import {
  closestPoints, meetPoint, rayThrough, axisDirection, addVertex, addEdge, unit3,
  type Model, type Vec3, type Provenance,
} from "./model.js";

export interface PlaceCtx {
  principal: Pt2;
  f: number;
  vps: (Pt2 | null)[];
  imgSize: [number, number];
  /** 정점 병합 반경 — 화면 대각 대비 비율. */
  mergeRatio?: number;
}

export const PLACE_TOL = {
  merge_ratio: 0.012,       // 화면 대각의 1.2%
  max_gap_ratio: 0.15,      // 광선과 축 직선이 이보다 멀면 "만났다"고 보지 않는다(깊이 단위)
};

const diagOf = (sz: [number, number]) => Math.hypot(sz[0], sz[1]);

/** 씨앗 — 화면 점을 **지면(Z=0)** 위의 3D 점으로 읽는다. 첫 앵커는 여기서 나온다. */
export function seedOnGround(screen: Pt2, ctx: PlaceCtx): Vec3 | null {
  // 지면은 카메라 아래 y = +1(f 단위) 평면으로 둔다. 게이지 선택일 뿐이며
  // 이후 모든 길이가 이 단위의 비례로 나온다(실척 앵커는 이 프로토타입 범위 밖).
  const r = rayThrough(screen, ctx.principal, ctx.f);
  if (Math.abs(r[1]) < 1e-9) return null;        // 지평선 방향 — 지면과 만나지 않는다
  const t = 1 / r[1];
  if (t <= 0) return null;                        // 카메라 뒤
  return [r[0] * t, 1, r[2] * t];
}

export interface PlaceResult {
  ok: boolean;
  position?: Vec3;
  gap?: number;              // 광선과 축 직선의 어긋남(깊이 단위). 크면 사용자가 축을 벗어나 그은 것
  reason?: string;
}

/**
 * **배치의 핵심 한 줄.** 이미 놓인 점 `from`에서 축 `direction`으로 나가는 3D 직선과,
 * 화면 점 `screen`으로 나가는 광선의 최근접점을 잡는다.
 * 커서 픽셀 하나가 3D 점 하나를 유일하게 결정한다는 것이 바로 이것이다.
 */
export function placeAlongAxis(from: Vec3, direction: Direction, screen: Pt2,
                               ctx: PlaceCtx): PlaceResult {
  const dir = axisVec(direction, ctx);
  if (!dir) return { ok: false, reason: `방향 ${String(direction)}은 3D 축이 아니다` };
  const ray = rayThrough(screen, ctx.principal, ctx.f);
  const c = closestPoints([0, 0, 0], ray, from, dir);
  const depth = Math.max(1e-9, Math.abs(c.q[2]));
  if (c.parallel) return { ok: false, reason: "축이 시선과 평행 — 이 각도에서는 깊이가 안 정해진다" };
  if (c.s <= 0 && c.s >= 0) { /* s=0은 from 자신 — 허용 */ }
  if (c.gap / depth > PLACE_TOL.max_gap_ratio) {
    return { ok: false, gap: c.gap, reason: "축에서 너무 벗어났다 — 다른 축이거나 자유선이다" };
  }
  return { ok: true, position: meetPoint(c), gap: c.gap };
}

/** 축 라벨 → 3D 방향. `screen`은 화면 평행이라 소실점이 없다(2.2 c=0). */
export function axisVec(direction: Direction, ctx: PlaceCtx): Vec3 | null {
  if (direction === "free") return null;
  if (direction === "screen") return null;        // 화면 평행 축은 두 방향(가로/세로)이라 따로 다룬다
  const vp = ctx.vps[direction];
  if (!vp) return null;
  return axisDirection(vp, ctx.principal, ctx.f);
}

/** 화면 평행 방향(가로/세로)의 3D 방향 — 광선과 무관하게 화면 축 그대로다. */
export function screenAxisVec(horizontal: boolean): Vec3 {
  return horizontal ? [1, 0, 0] : [0, 1, 0];
}

export interface ChainInput { screen: [Pt2, Pt2]; direction: Direction; }
export interface ChainOutput { placed: number; deferred: number; model: Model; }

/**
 * 분류된 선분들을 순서대로 배치한다.
 *
 * 첫 선분의 시작점이 씨앗(지면 Z=0)이 된다. 이후는 **이미 놓인 정점에 닿는 선분만**
 * 배치한다 — 닿지 않으면 미룬다. 미룬 것은 다음 회차에 다시 시도하고,
 * 한 회차에 아무것도 배치되지 않으면 멈춘다(연결되지 않은 것은 배치되지 않는다).
 */
export function buildChain(segs: ChainInput[], ctx: PlaceCtx): ChainOutput {
  const m: Model = { vertices: {}, edges: {}, faces: {} };
  const mergeR = (ctx.mergeRatio ?? PLACE_TOL.merge_ratio) * diagOf(ctx.imgSize);
  let pending = segs.slice();
  let placed = 0;

  // 씨앗
  const first = pending[0];
  if (!first) return { placed: 0, deferred: 0, model: m };
  const seed = seedOnGround(first.screen[0], ctx);
  if (!seed) return { placed: 0, deferred: pending.length, model: m };
  addVertex(m, seed, first.screen[0], "measured", mergeR);

  for (let round = 0; round < segs.length + 1 && pending.length; round++) {
    const next: ChainInput[] = [];
    let progressed = false;
    for (const s of pending) {
      const hit = findAnchor(m, s.screen, mergeR);
      if (!hit) { next.push(s); continue; }
      const [anchorId, anchorEnd] = hit;
      const other = anchorEnd === 0 ? s.screen[1] : s.screen[0];
      const from = m.vertices[anchorId].position;
      const r = placeAlongAxis(from, s.direction, other, ctx);
      if (!r.ok || !r.position) { next.push(s); continue; }
      const vid = addVertex(m, r.position, other, "measured", mergeR);
      if (addEdge(m, anchorId, vid, s.direction, "measured")) { placed += 1; progressed = true; }
    }
    pending = next;
    if (!progressed) break;
  }
  return { placed, deferred: pending.length, model: m };
}

/** 선분의 두 끝 중 하나가 기존 정점에 닿는가. 닿으면 [정점id, 어느 끝(0|1)]. */
function findAnchor(m: Model, screen: [Pt2, Pt2], radius: number): [string, 0 | 1] | null {
  let best: [string, 0 | 1] | null = null, bestD = radius;
  for (const v of Object.values(m.vertices)) {
    for (const k of [0, 1] as const) {
      const d = Math.hypot(v.screen[0] - screen[k][0], v.screen[1] - screen[k][1]);
      if (d <= bestD) { bestD = d; best = [v.id, k]; }
    }
  }
  return best;
}

/** 두 3D 방향이 이루는 각(도). 직교성 확인·표시에 쓴다. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const u = unit3(a), v = unit3(b);
  const c = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  return (Math.acos(c) * 180) / Math.PI;
}
