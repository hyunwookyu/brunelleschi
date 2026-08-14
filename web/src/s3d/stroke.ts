// S-3 획 → 3D — 계획서 §4.2·§4.4·§4.5. **이 방식의 전제가 여기 걸려 있다.**
//
// ```
// 2D 획 (손떨림 포함) → 방향 판정 → 앵커 결정 → 각 점 역투영
//                                     → 3D 획 (손떨림 그대로, 축을 감싸며 흔들림)
// ```
//
// 획의 형태에 손대지 않는다. 각 점은 **자기 화면 위치가 정하는 광선** 위에 놓이고,
// 그 광선을 어느 평면에서 만나게 할지가 배치의 전부다.
import type { Pt2 } from "./camera.js";
import type { Axis } from "./axis.js";
import {
  closestPoints, meetPoint, rayThrough, project, axisDirection, rayPlane,
  unit3, cross3, sub3, add3, mul3, dot3, norm3, type Vec3,
} from "./geom3d.js";

export interface Stroke {
  id: string;
  /** **원본 화면 좌표. 반드시 보존한다** — 카메라가 재조정되면 전체를 다시 투영한다. */
  pts2d: Pt2[];
  pts3d: Vec3[];
  axis: Axis;
  /** 어디에 연결되었는가. `null`이면 씨앗이거나 미배치. */
  anchorRef: string | null;
  layer: number;
  color: string;
  width: number;
}

export interface PlaceCtx {
  principal: Pt2;
  f: number;
  vps: (Pt2 | null)[];
  imgSize: [number, number];
  /** 끝점 접합 반경 — 화면 대각 대비. §1.2 "두 획의 끝이 몇 px 안이면 같은 점". */
  joinRatio?: number;
}

export const PLACE_TOL = {
  join_ratio: 0.015,
  /** 지면 게이지: 카메라 아래 y = 1 (f 단위). `groundGrid`와 같은 평면이다. */
  ground_y: 1,
};

const diagOf = (sz: [number, number]) => Math.hypot(sz[0], sz[1]);

// ---------------------------------------------------------------- §4.4 떨림 평면

/**
 * 축 방향 직선 L이 정해지면 손떨림을 담을 평면은 **L을 포함하는 평면** 중 하나여야 한다.
 * 어느 것을 쓸지가 §4.4의 미결 항목이고, 두 방식을 모두 구현해 비교한다.
 *
 * `eye`  L과 **시선**을 함께 담는 평면. 화면에 보이는 떨림이 그대로 보존된다 —
 *        그린 순간의 그림과 완전히 일치한다. 대신 그 평면이 시선을 향하고 있으므로
 *        옆에서 보면 떨림이 납작해진다.
 * `screen` L을 담되 **화면에 평행한 방향**으로 세운 평면. 회전해도 떨림이 살아 있지만
 *        그린 순간의 화면과는 조금 어긋난다.
 */
export type WobblePlane = "eye" | "screen";

/** 앵커 A와 축 방향 d가 정하는 평면의 법선. 떨림 평면 선택이 여기서 갈린다. */
export function wobbleNormal(anchor: Vec3, dir: Vec3, mode: WobblePlane): Vec3 {
  if (mode === "eye") {
    // 시선(원점 → 앵커)과 축을 함께 담는 평면 ⇒ 법선은 둘의 외적
    const n = cross3(unit3(anchor), unit3(dir));
    return norm3(n) < 1e-9 ? unit3(cross3([0, 0, 1], dir)) : unit3(n);
  }
  // 화면 평행 성분을 담는다 ⇒ 축과 화면 법선(0,0,1)의 외적을 법선으로
  const n = cross3(unit3(dir), [0, 0, 1]);
  return norm3(n) < 1e-9 ? unit3(cross3([0, 1, 0], dir)) : unit3(n);
}

// ---------------------------------------------------------------- §4.2 배치

export interface Placed { pts3d: Vec3[]; anchor: Vec3; dir: Vec3 | null; ok: boolean; reason?: string; }

/** 씨앗 — 화면 점을 지면(y = ground_y) 위 3D 점으로 읽는다. 첫 앵커는 여기서 나온다. */
export function seedOnGround(screen: Pt2, ctx: PlaceCtx): Vec3 | null {
  const r = rayThrough(screen, ctx.principal, ctx.f);
  if (Math.abs(r[1]) < 1e-9) return null;                 // 지평선 방향
  const t = PLACE_TOL.ground_y / r[1];
  if (t <= 0) return null;                                 // 카메라 뒤
  return mul3(r, t);
}

/** 축 라벨 → 3D 방향. `screen`은 화면 평행이라 소실점이 없다(2.2 c=0). */
export function axisVec(axis: Axis, ctx: PlaceCtx, rep?: { a: Pt2; b: Pt2 }): Vec3 | null {
  if (axis === "free") return null;
  if (axis === "screen") {
    if (!rep) return null;
    // 화면 평행 방향은 화면에서의 방향 그대로다(깊이 성분 0)
    const d: Vec3 = [rep.b[0] - rep.a[0], rep.b[1] - rep.a[1], 0];
    return norm3(d) < 1e-9 ? null : unit3(d);
  }
  const vp = ctx.vps[axis];
  return vp ? axisDirection(vp, ctx.principal, ctx.f) : null;
}

/**
 * **획 하나를 3D로 올린다.** 이 함수가 계획서 §4의 전부다.
 *
 * 앵커 A와 축 방향 d로 평면(A, n)을 세우고, 각 점의 광선을 그 평면과 만나게 한다.
 * 축 위에 정확히 있는 점은 A + t·d 로 떨어지고, 벗어난 점(=손떨림)은 그 옆에 놓인다.
 * **점을 축으로 끌어당기지 않는다** — 그것이 "획을 버리지 않는다"의 구현이다.
 */
export function placeStroke(
  pts2d: Pt2[], axis: Axis, anchor: Vec3, ctx: PlaceCtx,
  mode: WobblePlane = "eye", rep?: { a: Pt2; b: Pt2 },
): Placed {
  const dir = axisVec(axis, ctx, rep);
  if (!dir) return { pts3d: [], anchor, dir: null, ok: false, reason: "축이 없다" };
  const n = wobbleNormal(anchor, dir, mode);
  const d = dot3(n, anchor);
  const out: Vec3[] = [];
  for (const s of pts2d) {
    const hit = rayPlane([0, 0, 0], rayThrough(s, ctx.principal, ctx.f), n, d);
    if (!hit) return { pts3d: [], anchor, dir, ok: false, reason: "평면과 만나지 않는다" };
    out.push(hit);
  }
  return { pts3d: out, anchor, dir, ok: true };
}

/**
 * 임시 배치 — **그리는 중**에 쓴다(§4.5). 축을 아직 모르므로 시선에 수직인 평면에 놓는다.
 * 깊이는 앵커의 깊이를 그대로 쓴다. 확정 시 `placeStroke`가 이것을 대체한다.
 */
export function previewStroke(pts2d: Pt2[], anchor: Vec3, ctx: PlaceCtx): Vec3[] {
  const n: Vec3 = [0, 0, 1];                 // 시선 수직 = 화면 평행 평면
  const d = dot3(n, anchor);
  const out: Vec3[] = [];
  for (const s of pts2d) {
    const hit = rayPlane([0, 0, 0], rayThrough(s, ctx.principal, ctx.f), n, d);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * **미리보기 ↔ 확정 차이**(§4.5, assumptions S-3 — 유일한 중단 조건).
 * 두 3D 점열을 각각 화면에 되쏘아 화면상 거리를 잰다. 화면 대각 대비.
 *
 * 3D 거리로 재면 안 된다 — 깊이가 다르면 3D 거리는 크지만 화면에서는 같은 자리일 수 있고,
 * 사용자가 놀라는 것은 **화면에서 튀어 보일 때**다.
 */
export function reprojectionGap(a: Vec3[], b: Vec3[], ctx: PlaceCtx): number[] {
  const diag = diagOf(ctx.imgSize);
  const out: number[] = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const pa = project(a[i], ctx.principal, ctx.f), pb = project(b[i], ctx.principal, ctx.f);
    if (!pa || !pb) continue;
    out.push(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / diag);
  }
  return out;
}

// ---------------------------------------------------------------- 앵커 체인

/** 화면상 끝점 접합 — 두 획의 끝이 반경 안이면 같은 점으로 본다(§1.2). */
export function findAnchor(
  strokes: Stroke[], ends: [Pt2, Pt2], radius: number,
): { pos: Vec3; id: string; which: 0 | 1 } | null {
  let best: { pos: Vec3; id: string; which: 0 | 1 } | null = null;
  let bestD = radius;
  for (const s of strokes) {
    if (!s.pts3d.length) continue;
    const cand: [Pt2, Vec3][] = [
      [s.pts2d[0], s.pts3d[0]],
      [s.pts2d[s.pts2d.length - 1], s.pts3d[s.pts3d.length - 1]],
    ];
    for (const [scr, p3] of cand) {
      for (const k of [0, 1] as const) {
        const d = Math.hypot(scr[0] - ends[k][0], scr[1] - ends[k][1]);
        if (d <= bestD) { bestD = d; best = { pos: p3, id: s.id, which: k }; }
      }
    }
  }
  return best;
}

let _seq = 0;
export const resetStrokeIds = () => { _seq = 0; };

/**
 * 획을 모델에 붙인다. **연결된 것만 배치된다**(§4.2) — 기존 획에 닿지 않고
 * 씨앗도 아니면 `pts3d`가 비어 있는 채로 남는다(깊이 미결정). 추정하지 않는다.
 */
export function attachStroke(
  strokes: Stroke[], pts2d: Pt2[], axis: Axis, ctx: PlaceCtx,
  opts: { mode?: WobblePlane; rep?: { a: Pt2; b: Pt2 }; seedIfEmpty?: boolean } = {},
): Stroke {
  const id = `s${++_seq}`;
  const stroke: Stroke = {
    id, pts2d, pts3d: [], axis, anchorRef: null, layer: 0, color: "#111", width: 1,
  };
  if (!pts2d.length) return stroke;
  const radius = (ctx.joinRatio ?? PLACE_TOL.join_ratio) * diagOf(ctx.imgSize);
  const ends: [Pt2, Pt2] = [pts2d[0], pts2d[pts2d.length - 1]];
  const hit = findAnchor(strokes, ends, radius);

  let anchor: Vec3 | null = hit ? hit.pos : null;
  if (!anchor && (opts.seedIfEmpty ?? strokes.length === 0)) {
    anchor = seedOnGround(pts2d[0], ctx);          // 씨앗: 지면 접촉 가정
  }
  if (!anchor) return stroke;                       // 연결되지 않았다 — 미배치로 남긴다
  stroke.anchorRef = hit ? hit.id : null;

  const r = placeStroke(pts2d, axis, anchor, ctx, opts.mode ?? "eye", opts.rep);
  if (r.ok) stroke.pts3d = r.pts3d;
  return stroke;
}

/** 카메라가 재조정되면 `pts2d`에서 전부 다시 만든다(§5 "pts2d를 반드시 보존한다"). */
export function reprojectAll(
  strokes: Stroke[], ctx: PlaceCtx, mode: WobblePlane = "eye",
): Stroke[] {
  const out: Stroke[] = [];
  for (const s of strokes) {
    const rebuilt = attachStroke(out, s.pts2d, s.axis, ctx,
      { mode, seedIfEmpty: out.length === 0 });
    rebuilt.id = s.id; rebuilt.layer = s.layer; rebuilt.color = s.color; rebuilt.width = s.width;
    out.push(rebuilt);
  }
  return out;
}

export { add3, sub3 };
