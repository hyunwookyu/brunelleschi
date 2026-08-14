// S-3 획 → 3D — 계획서 §4.2·§4.4·§4.5. **이 방식의 전제가 여기 걸려 있다.**
//
// ```
// 2D 획 (손떨림 포함) → 방향 판정 → 앵커 결정 → 각 점 역투영
//                                     → 3D 획 (손떨림 그대로, 축을 감싸며 흔들림)
// ```
//
// 획의 형태에 손대지 않는다. 각 점은 **자기 화면 위치가 정하는 광선** 위에 놓이고,
// 그 광선을 어느 평면에서 만나게 할지가 배치의 전부다.
//
// **그래서 화면 이미지는 배치 방식과 무관하게 보존된다** — 어떤 평면을 골라도 각 점은
// 자기 광선 위에 있으므로 그린 카메라에서 다시 투영하면 원본 `pts2d`로 돌아온다(항등).
// 평면 선택이 정하는 것은 **깊이**뿐이고, 그 차이는 **돌린 뒤에야 보인다**(§4.4·AS-2).
import type { Pt2 } from "./camera.js";
import type { Axis } from "./axis.js";
import {
  rayThrough, project, axisDirection, rayPlane, groundFrame, EYE_HEIGHT,
  unit3, cross3, sub3, add3, mul3, dot3, norm3, type Vec3, type Plane,
} from "./geom3d.js";

export interface Stroke {
  id: string;
  /** **원본 화면 좌표. 반드시 보존한다** — 카메라가 재조정되면 전체를 다시 투영한다. */
  pts2d: Pt2[];
  pts3d: Vec3[];
  axis: Axis;
  /** 대표 직선(`classifyStroke`가 준다). `screen` 축은 소실점이 없어 이것으로 방향을 잡는다. */
  rep?: { a: Pt2; b: Pt2 };
  /** 어디에 연결되었는가. `null`이면 씨앗이거나 미배치. */
  anchorRef: string | null;
  /** 끝점 접합으로 옮긴 거리(화면 px). §1.2가 허용하는 **유일한 위치 개입**이다. */
  joinShift: number;
  layer: number;
  color: string;
  width: number;
}

export interface PlaceCtx {
  principal: Pt2;
  f: number;
  /** 확정된 소실점. 관례상 `vps[2]`가 **수직축**이다(화면 상태 표시와 같은 순서). */
  vps: (Pt2 | null)[];
  imgSize: [number, number];
  /** 끝점 접합 반경 — 화면 대각 대비. §1.2 "두 획의 끝이 몇 px 안이면 같은 점". */
  joinRatio?: number;
}

export const PLACE_TOL = {
  join_ratio: 0.015,
  /**
   * **깊이 가림 방어**(S-5). 화면에서 비슷하게 가까운 후보의 깊이가 이 비율을 넘게 다르면
   * 배치하지 않는다. **돌린 시점에서만 켠다** — 첫 시점은 씨앗에서 바깥으로 자라므로
   * 앞뒤가 화면에서 겹치는 일이 드물고, 돌리면 가림이 생긴다(측정: 모서리 오차 p90이
   * 상자 대각의 0.87까지 갔다). 켜면 p90 0.87 → 0.12, 배치율 0.92 → 0.73이다.
   * **조용히 틀린 깊이보다 미배치가 낫다**(A-3). 값은 잠정 — S-10 실획에서 재정한다.
   */
  view_depth_guard: 0.05,
  /**
   * **돌린 시점의 앵커 검사 둘**(S-6). 하나만으로는 각도에 따라 구멍이 남는다 —
   * 정합성은 **양 끝에 후보가 있을 때만** 쓸 수 있고(궤도 45°에서 38.5%가 자유단이었다),
   * 깊이 타당성은 자유단 경로를 막는다. 함께 쓰면 모서리 오차 p90이
   * **0.72~0.93 → 0.05~0.075**(12~18배)로 떨어진다. 배치율은 0.85~0.99 → 0.65~0.76.
   * 값은 잠정이다(AS-13) — 0.5는 듣고 1.0은 느슨해서 45°가 되돌아간다.
   */
  view_far_end_check: 1,
  view_depth_envelope: 0.5,
  /** **면 위 사선**(§4.3)의 정합성 허용치 배수. 잠정 — 실획에서 재정한다(AS-13). */
  face_far_end: 1,
  /** 눈높이 게이지는 `geom3d.EYE_HEIGHT` 한 군데에만 둔다(격자와 씨앗이 같아야 한다). */
  eye_height: EYE_HEIGHT,
};

export const diagOf = (sz: [number, number]) => Math.hypot(sz[0], sz[1]);

/** 획의 화면 길이(호 길이). **판정 임계의 분모**다 — D-S6이 "획 길이 대비"를 요구한다. */
export function strokeLen2d(pts: Pt2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// ---------------------------------------------------------------- §4.4 떨림 평면

/**
 * 축 방향 직선 L이 정해져도 **손떨림이 놓일 자리는 아직 하나가 아니다.** 각 점의 광선을
 * 어느 면에서 멈출지 골라야 하고, 그 선택이 §4.4의 미결 항목이다.
 *
 * 계획서는 두 가지를 적었고, 세어 보니 **셋을 갈라야 했다**.
 *
 * `sight`  L과 **시선 방향(광축)**을 함께 담는 평면(계획서 가). 획이 축을 따라 제대로
 *          들어가지만 평면이 시선과 거의 나란해서 **떨림이 깊이로 길게 늘어난다**.
 * `screen` 앵커를 지나는 **화면 평행 평면**(계획서 나). L을 담지 못하므로 획이 깊이로
 *          들어가지 않는다 — 미리보기(§4.5)가 쓰는 평면이 바로 이것이다.
 * `facing` L을 담되 **시선에 가장 정면으로** 서는 평면(계획서에 없던 셋째). L을 담으므로
 *          축을 따라 들어가고, 시선에 정면이므로 떨림이 그린 만큼만 남는다.
 *
 * **눈을 지나는 평면은 후보가 아니다.** L과 눈을 함께 담는 평면은 화면에 **직선 하나로**
 * 맺히므로(그 평면의 상이 선이다) 축을 벗어난 점의 광선이 아예 만나지 않는다.
 * 계획서의 "시선을 포함하는 평면"을 글자 그대로 읽으면 배치 자체가 불가능하다 — 반례
 * 테스트로 잠갔다. 그래서 `sight`는 눈이 아니라 **광축 방향**을 담는 것으로 읽는다.
 */
export type WobblePlane = "sight" | "screen" | "facing";
export const WOBBLE_PLANES: WobblePlane[] = ["sight", "screen", "facing"];

/** 앵커 A와 축 방향 d가 정하는 떨림 평면. 법선은 **A 쪽을 향하도록** 부호를 맞춘다. */
export function wobblePlane(anchor: Vec3, dir: Vec3, mode: WobblePlane): Plane {
  let n: Vec3;
  if (mode === "screen") {
    n = [0, 0, 1];                                   // 화면 평행 — L을 담지 않는다
  } else if (mode === "sight") {
    n = cross3(unit3(dir), [0, 0, 1]);               // L + 광축
    if (norm3(n) < 1e-9) n = cross3(unit3(dir), [0, 1, 0]);
    n = unit3(n);
  } else {
    // L을 담는 평면 중 시선에 가장 정면인 것: 시선에서 축 성분을 뺀 나머지가 법선이다
    const v = unit3(anchor), d = unit3(dir);
    n = sub3(v, mul3(d, dot3(v, d)));
    if (norm3(n) < 1e-9) {                            // 축이 시선과 나란하다(소실점 정면)
      n = cross3(d, [0, 1, 0]);
      if (norm3(n) < 1e-9) n = cross3(d, [1, 0, 0]);
    }
    n = unit3(n);
  }
  const d0 = dot3(n, anchor);
  return d0 < 0 ? { n: mul3(n, -1), d: -d0 } : { n, d: d0 };
}

/**
 * 떨림 평면 **족(族)의 연속 매개화**. `facing` 법선을 축 둘레로 `deg`만큼 돌린다.
 * `deg = 0`이 `facing`이고, L을 담는 평면 전체가 이 한 매개변수로 덮인다.
 *
 * 왜 필요한가: 리뷰어 지적 — "`facing`이 떨림비에서 유리한 것은 평면 정의의 귀결(동어반복)이
 * 아닌가". 족 전체를 훑어 떨림비가 정말 `facing`에서 극값인지 보면 답이 나온다.
 * 극값이면 그 지표는 **채택 근거에서 내려야 한다**(정의가 시키는 값이므로).
 */
export function tiltedPlane(anchor: Vec3, dir: Vec3, deg: number): Plane {
  const base = wobblePlane(anchor, dir, "facing");
  const k = unit3(dir), th = (deg * Math.PI) / 180;
  const v = base.n, c = Math.cos(th), s = Math.sin(th);
  // 로드리게스 — 축이 dir이므로 회전해도 법선은 dir에 수직으로 남는다(평면이 L을 계속 담는다)
  const n = unit3(add3(add3(mul3(v, c), mul3(cross3(k, v), s)), mul3(k, dot3(k, v) * (1 - c))));
  const d = dot3(n, anchor);
  return d < 0 ? { n: mul3(n, -1), d: -d } : { n, d };
}

/** 주어진 평면 위로 점열을 올린다. 한 점이라도 놓치면 `null`. */
export function placeOnPlane(pts2d: Pt2[], pl: Plane, ctx: PlaceCtx): Vec3[] | null {
  const out: Vec3[] = [];
  for (const s of pts2d) {
    const hit = rayPlane([0, 0, 0], rayThrough(s, ctx.principal, ctx.f), pl.n, pl.d);
    if (!hit) return null;
    out.push(hit);
  }
  return out.length >= 2 ? out : null;
}

// ---------------------------------------------------------------- §4.2 배치

export interface Placed {
  pts3d: Vec3[];
  anchor: Vec3;
  dir: Vec3 | null;
  ok: boolean;
  reason?: string;
  /** 평면과 만나지 못한 점의 수. 0이 아니면 획의 일부가 사라진다. */
  missed: number;
  /** 끝점 접합으로 옮긴 거리(화면 px). */
  joinShift: number;
}

/** 이 카메라의 지면. 수직 소실점이 있으면 그 방향이 법선이다(카메라가 기울어도 맞는다). */
export const groundOf = (ctx: PlaceCtx): Plane =>
  groundFrame(ctx.vps[2] ?? null, ctx.principal, ctx.f, PLACE_TOL.eye_height);

/** 씨앗 — 화면 점을 지면 위 3D 점으로 읽는다(§4.2 "지면 접촉 가정"). 첫 앵커는 여기서 나온다. */
export function seedOnGround(screen: Pt2, ctx: PlaceCtx): Vec3 | null {
  const g = groundOf(ctx);
  return rayPlane([0, 0, 0], rayThrough(screen, ctx.principal, ctx.f), g.n, g.d);
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
 * 앵커 A와 축 방향 d로 떨림 평면을 세우고, 각 점의 광선을 그 평면과 만나게 한다.
 * 축 위에 정확히 있는 점은 A + t·d 로 떨어지고, 벗어난 점(=손떨림)은 그 옆에 놓인다.
 * **점을 축으로 끌어당기지 않는다** — 그것이 "획을 버리지 않는다"의 구현이다.
 *
 * `joinAt`이 주어지면 그 끝점만 앵커에 정확히 붙인다(§1.2가 허용하는 끝점 접합).
 * 옮긴 거리를 `joinShift`로 돌려준다 — **화면에서 얼마나 움직였는지가 AS-3의 실제 대상**이다.
 */
export function placeStroke(
  pts2d: Pt2[], axis: Axis, anchor: Vec3, ctx: PlaceCtx,
  mode: WobblePlane = "facing", rep?: { a: Pt2; b: Pt2 }, joinAt?: 0 | 1,
): Placed {
  const dir = axisVec(axis, ctx, rep);
  const base = { anchor, dir, missed: 0, joinShift: 0 };
  if (!dir) return { ...base, pts3d: [], ok: false, reason: "축이 없다" };
  if (!pts2d.length) return { ...base, pts3d: [], ok: false, reason: "빈 획" };

  const pl = wobblePlane(anchor, dir, mode);
  const out: Vec3[] = [];
  let missed = 0;
  for (const s of pts2d) {
    const hit = rayPlane([0, 0, 0], rayThrough(s, ctx.principal, ctx.f), pl.n, pl.d);
    if (!hit) { missed += 1; continue; }
    out.push(hit);
  }
  // **한 점이라도 놓치면 획 전체를 배치하지 않는다.** 일부만 올리면 `pts2d`와 `pts3d`의
  // 인덱스가 어긋나 재투영·앵커 보간이 조용히 틀어지고, 사용자에게는 획의 일부가 사라진다.
  if (missed > 0 || out.length < 2) {
    return { ...base, pts3d: [], ok: false, missed, reason: "평면과 만나지 않는 점이 있다" };
  }

  let joinShift = 0;
  if (joinAt != null) {
    const k = joinAt === 0 ? 0 : out.length - 1;
    const before = project(out[k], ctx.principal, ctx.f);
    const after = project(anchor, ctx.principal, ctx.f);
    if (before && after) joinShift = Math.hypot(before[0] - after[0], before[1] - after[1]);
    out[k] = anchor;                                  // 끝점 접합 — 두 획의 끝을 같은 점으로
  }
  return { pts3d: out, anchor, dir, ok: true, missed, joinShift };
}

/**
 * 임시 배치 — **그리는 중**에 쓴다(§4.5). 축을 아직 모르므로 화면 평행 평면에 놓는다.
 * 깊이는 앵커의 깊이를 그대로 쓴다. 확정 시 `placeStroke`가 이것을 대체한다.
 *
 * 이것은 `placeStroke(..., "screen")`와 **같은 평면**이다. 미리보기와 확정의 차이가
 * 곧 떨림 평면 두 방식의 차이인 이유가 여기 있다.
 */
export function previewStroke(pts2d: Pt2[], anchor: Vec3, ctx: PlaceCtx): Vec3[] {
  const n: Vec3 = [0, 0, 1];
  const d = dot3(n, anchor);
  const out: Vec3[] = [];
  for (const s of pts2d) {
    const hit = rayPlane([0, 0, 0], rayThrough(s, ctx.principal, ctx.f), n, d);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * 3D 점열을 **그린 카메라로 되쏘아** 원본 화면 좌표와의 거리를 잰다. 획 길이 대비(D-S6).
 *
 * 3D 거리로 재면 안 된다 — 깊이가 다르면 3D 거리는 크지만 화면에서는 같은 자리일 수 있고,
 * 사용자가 놀라는 것은 **화면에서 튀어 보일 때**다.
 *
 * **이 값은 접합한 끝점 말고는 0이다**(각 점이 자기 광선 위에 있으므로 항등).
 * 그러므로 이 지표로 배치 방식을 고를 수 없다 — AS-3의 대상은 접합 이동량과 미배치율이다.
 */
export function reprojectionGap(pts3d: Vec3[], pts2d: Pt2[], ctx: PlaceCtx): number[] {
  const out: number[] = [];
  const n = Math.min(pts3d.length, pts2d.length);
  for (let i = 0; i < n; i++) {
    const p = project(pts3d[i], ctx.principal, ctx.f);
    if (!p) continue;
    out.push(Math.hypot(p[0] - pts2d[i][0], p[1] - pts2d[i][1]));
  }
  return out;
}

// ---------------------------------------------------------------- 앵커 체인

/**
 * 새 획의 끝점이 **기존 획의 어디에** 닿는가. 계획서 §4.2는 두 가지를 적었다 —
 * 끝점끼리 만나는 것(2번)과 **기존 획과 만나는 지점**(3번). 처음에는 끝점끼리만 구현했는데
 * 측정에서 끝점 겨냥 오차 2%일 때 **46%가 앵커를 못 찾았다**. 몸통 접합을 넣으면 T자 접합과
 * 조금 지나친 모서리가 회수된다.
 *
 * 반환하는 3D 점은 기존 획 위에서 **선분 보간**한 값이다. 가장 가까운 표본점을 쓰면 점 간격의
 * 절반(≈4px)만큼 앵커가 틀어지고, 그 오차가 체인을 타고 깊이로 증폭된다(AS-8).
 */
export interface Anchor { pos: Vec3; id: string; which: 0 | 1; onBody: boolean;
  /** 화면에서 비슷하게 가까운데 **깊이가 크게 다른** 후보가 또 있었는가(§S-5 가림). */
  depthAmbiguous: boolean; }

export function findAnchor(
  strokes: Stroke[], ends: [Pt2, Pt2], radius: number, endpointOnly = false,
  nearestSample = false, depthGuard = 0,
): Anchor | null {
  let best: Anchor | null = null;
  let bestD = radius;
  /** 반경 안의 모든 후보(화면 거리, 깊이) — 가림 판정에 쓴다. */
  const cands: { d: number; z: number }[] = [];
  for (const s of strokes) {
    const m = Math.min(s.pts2d.length, s.pts3d.length);
    if (m < 2) continue;
    // `endpointOnly`는 몸통 접합을 넣기 **전** 상태다 — 그 조건의 수치도 원장에 남겨야
    // "몸통 접합이 필수"라는 결론이 재현 가능해진다(리뷰어 지적).
    // 끝점만 볼 때는 끝 두 점을, 몸통까지 볼 때는 모든 선분을 후보로 둔다.
    const segs: number[] = endpointOnly ? [1, m - 1] : [];
    if (!endpointOnly) for (let i = 1; i < m; i++) segs.push(i);
    for (const i of segs) {
      const a = s.pts2d[i - 1], b = s.pts2d[i];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const L2 = ex * ex + ey * ey;
      for (const k of [0, 1] as const) {
        const q = ends[k];
        // 끝점 전용에서는 선분 위로 사영하지 않고 **그 끝점 자체**만 본다
        // `nearestSample`은 선분 보간을 끄고 **가장 가까운 표본점**에 붙인다(대조군).
        // 점 간격의 절반이 앵커 오차가 되고 그것이 체인을 타고 깊이로 증폭된다 — 는 주장의 확인용.
        let t = endpointOnly ? (i === 1 ? 0 : 1)
          : (L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * ex + (q[1] - a[1]) * ey) / L2)));
        if (nearestSample && !endpointOnly) t = t < 0.5 ? 0 : 1;
        const px = a[0] + ex * t, py = a[1] + ey * t;
        const d = Math.hypot(px - q[0], py - q[1]);
        if (d > radius) continue;
        const p0 = s.pts3d[i - 1], p1 = s.pts3d[i];
        const pos: Vec3 = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t,
                           p0[2] + (p1[2] - p0[2]) * t];
        cands.push({ d, z: pos[2] });
        if (d > bestD) continue;
        bestD = d;
        best = {
          pos, id: s.id, which: k,
          onBody: (i > 1 || t > 1e-9) && (i < m - 1 || t < 1 - 1e-9),
          depthAmbiguous: false,
        };
      }
    }
  }
  if (best && depthGuard > 0) {
    // **화면에서 비슷하게 가까운데 깊이가 크게 다른 후보가 또 있으면 애매하다.**
    // 돌린 시점에서는 앞뒤 획이 화면에서 겹치므로(가림) 화면 거리만으로는 못 가른다 —
    // S-5 측정에서 모서리 오차 p90이 상자 대각의 0.4~0.9까지 갔다.
    const zb = best.pos[2];
    best.depthAmbiguous = cands.some(c =>
      c.d <= bestD * 1.5 + 1e-9 && Math.abs(c.z - zb) > depthGuard * Math.max(zb, 1e-6));
  }
  return best;
}

/** 반경 안의 **모든** 앵커 후보(하나만 고르지 않는다). `findAnchor`는 최근접만 준다. */
export function anchorCandidates(
  strokes: Stroke[], end: Pt2, radius: number,
): { pos: Vec3; id: string; d: number }[] {
  const out: { pos: Vec3; id: string; d: number }[] = [];
  for (const s of strokes) {
    const m = Math.min(s.pts2d.length, s.pts3d.length);
    if (m < 2) continue;
    let best: { pos: Vec3; d: number } | null = null;
    for (let i = 1; i < m; i++) {
      const a = s.pts2d[i - 1], b = s.pts2d[i];
      const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
      const t = L2 < 1e-12 ? 0
        : Math.max(0, Math.min(1, ((end[0] - a[0]) * ex + (end[1] - a[1]) * ey) / L2));
      const d = Math.hypot(a[0] + ex * t - end[0], a[1] + ey * t - end[1]);
      if (d > radius || (best && d >= best.d)) continue;
      const p0 = s.pts3d[i - 1], p1 = s.pts3d[i];
      best = { d, pos: [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t,
                        p0[2] + (p1[2] - p0[2]) * t] };
    }
    if (best) out.push({ ...best, id: s.id });
  }
  return out.sort((a, b) => a.d - b.d);
}

export interface Resolved { anchor: Vec3; id: string; which: 0 | 1; byFarEnd: boolean; }

/** 진단 카운터 — **왜 정합성 검사를 못 썼는지**를 세지 않으면 추측하게 된다. */
export const RESOLVE_STATS = { pairChecked: 0, pairAccepted: 0, pairRejected: 0, oneSided: 0 };
export const resetResolveStats = () => {
  RESOLVE_STATS.pairChecked = 0; RESOLVE_STATS.pairAccepted = 0;
  RESOLVE_STATS.pairRejected = 0; RESOLVE_STATS.oneSided = 0;
};

/**
 * **획 자신의 축 제약으로 앵커를 고른다**(S-6). S-5가 남긴 가장 큰 결함의 근본 해법이다.
 *
 * 화면 거리만으로 고르면 돌린 시점에서 **가림** 때문에 깊이가 전혀 다른 획에 붙는다
 * (S-5 측정: 모서리 오차 p90이 상자 대각의 0.87). 깊이 애매성 가드는 후보가 **둘 이상일 때만**
 * 발동하므로 완전히 겹치면 못 잡았다.
 *
 * 그런데 **축과 앵커가 정해지면 획 전체가 정해진다** — 반대쪽 끝점이 어디로 갈지 예측된다.
 * 앵커가 맞으면 그 예측이 반대쪽 끝의 기존 기하와 만나고, 틀리면 엉뚱한 곳을 가리킨다.
 * **후보가 하나뿐이어도 그 하나가 틀렸다는 것을 알 수 있다** — 애매성이 아니라 **정합성**을 본다.
 *
 * 양 끝에 후보가 있을 때만 쓴다. 한쪽이 자유단이면 검사할 것이 없으므로 기존 규칙으로 떨어진다.
 */
export function resolveAnchor(
  strokes: Stroke[], pts2d: Pt2[], axis: Axis, ctx: PlaceCtx,
  opts: { mode?: WobblePlane; rep?: { a: Pt2; b: Pt2 }; radius: number; farEndTol?: number },
): Resolved | null {
  const ends: [Pt2, Pt2] = [pts2d[0], pts2d[pts2d.length - 1]];
  const cands: [ReturnType<typeof anchorCandidates>, ReturnType<typeof anchorCandidates>] =
    [anchorCandidates(strokes, ends[0], opts.radius),
     anchorCandidates(strokes, ends[1], opts.radius)];
  if (!cands[0].length && !cands[1].length) return null;

  // 양 끝에 후보가 있으면 **정합성**으로 고른다
  if (cands[0].length && cands[1].length) {
    let best: { r: Resolved; score: number } | null = null;
    for (const k of [0, 1] as const) {
      for (const a of cands[k]) {
        const r = placeStroke(pts2d, axis, a.pos, ctx, opts.mode ?? "facing", opts.rep, k);
        if (!r.ok) continue;
        const far = k === 0 ? r.pts3d[r.pts3d.length - 1] : r.pts3d[0];
        // 예측한 반대쪽 끝이 그쪽 후보들 중 하나와 만나는가. 허용치는 **그 깊이에서의 접합 반경**이다.
        const tol = (opts.farEndTol ?? 1) * (opts.radius * far[2]) / ctx.f;
        for (const b of cands[1 - k]) {
          const score = norm3(sub3(far, b.pos)) / Math.max(tol, 1e-9);
          if (!best || score < best.score) {
            best = { score, r: { anchor: a.pos, id: a.id, which: k, byFarEnd: true } };
          }
        }
      }
    }
    // 어떤 짝도 안 맞으면 **놓지 않는다** — 후보가 하나뿐이어도 그것이 틀렸다는 뜻이다
    if (best) {
      RESOLVE_STATS.pairChecked += 1;
      if (best.score <= 1) { RESOLVE_STATS.pairAccepted += 1; return best.r; }
      RESOLVE_STATS.pairRejected += 1;
      return null;
    }
  }

  // 한쪽만 후보가 있다(자유단) — 검사할 것이 없으므로 최근접으로 간다
  RESOLVE_STATS.oneSided += 1;
  const k: 0 | 1 = cands[0].length ? 0 : 1;
  const a = cands[k][0];
  return { anchor: a.pos, id: a.id, which: k, byFarEnd: false };
}

// ---------------------------------------------------------------- §4.3 면 위 사선

/**
 * **면은 축 두 개가 정한다**(§4.3, S-6). 앵커가 위치를 정하고 두 축 방향이 방향을 정한다.
 *
 * 계획서는 "이미 정의된 면 위에 있음"이라 적었는데 면 생성(§6)은 S-8이다. 그러나 **면을
 * 만들 필요가 없다** — 상자의 면은 축 두 개가 펴는 평면이고, 사선이 놓일 자리는 그 평면이다.
 * 닫힌 획 루프를 찾을 필요도 없다(A-3: 가장 단순한 것). DECISIONS D-S14.
 */
export function axisPlane(anchor: Vec3, a: Vec3, b: Vec3): Plane | null {
  const n = cross3(unit3(a), unit3(b));
  if (norm3(n) < 1e-6) return null;                 // 두 축이 나란하면 평면이 안 선다
  const u = unit3(n), d = dot3(u, anchor);
  return d < 0 ? { n: mul3(u, -1), d: -d } : { n: u, d };
}

/**
 * 축을 벗어난 획을 **면 위 사선**으로 놓아 본다(§4.3의 첫 경우).
 *
 * 면 + 시선 광선 = 3D 점이 **유일하게 결정된다** — 추가 가정이 없다. 다만 어느 면인지는
 * 골라야 하므로 **S-6 (1)의 정합성 검사를 그대로 쓴다**: 앵커와 면이 맞으면 반대쪽 끝점의
 * 예측이 그쪽 기존 기하와 만난다. **양 끝에 후보가 있을 때만** 시도한다 —
 * 없으면 무엇으로도 검증할 수 없고, 검증 없이 놓는 것은 A-3이 금지하는 추측이다.
 */
export function placeOnFace(
  placed: Stroke[], pts2d: Pt2[], ctx: PlaceCtx, radius: number, farEndTol = 1,
): { pts3d: Vec3[]; id: string; which: 0 | 1; joinShift: number } | null {
  const ends: [Pt2, Pt2] = [pts2d[0], pts2d[pts2d.length - 1]];
  const cands = [anchorCandidates(placed, ends[0], radius),
                 anchorCandidates(placed, ends[1], radius)];
  if (!cands[0].length || !cands[1].length) return null;
  const axes = [0, 1, 2].map(i => (ctx.vps[i] ? axisVec(i as 0 | 1 | 2, ctx) : null));

  let best: { pts3d: Vec3[]; id: string; which: 0 | 1; joinShift: number; score: number } | null = null;
  for (const k of [0, 1] as const) {
    for (const a of cands[k]) {
      for (const [i, j] of [[0, 1], [1, 2], [0, 2]] as [number, number][]) {
        const ai = axes[i], aj = axes[j];
        if (!ai || !aj) continue;
        const pl = axisPlane(a.pos, ai, aj);
        if (!pl) continue;
        const pts3d = placeOnPlane(pts2d, pl, ctx);
        if (!pts3d) continue;
        const far = k === 0 ? pts3d[pts3d.length - 1] : pts3d[0];
        const tol = farEndTol * (radius * far[2]) / ctx.f;
        for (const b of cands[1 - k]) {
          const score = norm3(sub3(far, b.pos)) / Math.max(tol, 1e-9);
          if (best && score >= best.score) continue;
          const idx = k === 0 ? 0 : pts3d.length - 1;
          const p0 = project(pts3d[idx], ctx.principal, ctx.f);
          const p1 = project(a.pos, ctx.principal, ctx.f);
          const snapped = pts3d.slice();
          snapped[idx] = a.pos;                       // 끝점 접합(§1.2)
          best = { pts3d: snapped, id: a.id, which: k, score,
                   joinShift: p0 && p1 ? Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) : 0 };
        }
      }
    }
  }
  return best && best.score <= 1 ? best : null;
}

let _seq = 0;
export const resetStrokeIds = () => { _seq = 0; };

export function newStroke(pts2d: Pt2[], axis: Axis, rep?: { a: Pt2; b: Pt2 }): Stroke {
  return {
    id: `s${++_seq}`, pts2d, pts3d: [], axis, rep,
    anchorRef: null, joinShift: 0, layer: 0, color: "#111", width: 1,
  };
}

export interface PlaceOpts {
  mode?: WobblePlane;
  rep?: { a: Pt2; b: Pt2 };
  /** 앵커를 못 찾았을 때 지면 씨앗으로 떨어질지. 기본은 **아직 배치된 획이 없을 때만**. */
  seedIfEmpty?: boolean;
  /** 끝점끼리만 잇는다(몸통 접합 없음). 측정 대조용 — 기본은 몸통까지 본다. */
  endpointOnly?: boolean;
  /** 몸통 접합에서 선분 보간 대신 **가장 가까운 표본점**에 붙인다. 측정 대조군(S-4 배정). */
  nearestSample?: boolean;
  /**
   * **깊이 가림 방어**(S-5). 화면에서 비슷하게 가까운 후보의 깊이가 이 비율을 넘게 다르면
   * 배치하지 않는다 — 조용히 틀린 깊이에 놓는 것보다 미배치가 낫다(A-3).
   * 0이면 꺼진다(기존 동작).
   */
  depthGuard?: number;
  /**
   * **반대쪽 끝점 정합성으로 앵커를 고른다**(S-6). 가드가 못 잡는 완전 겹침의 근본 해법.
   * 값은 허용치 배수(1 = 그 깊이에서의 접합 반경). 0이면 꺼진다.
   */
  farEndCheck?: number;
  /**
   * **면 위 사선**(§4.3, S-6). 축을 벗어난 획을 축 두 개가 펴는 평면 위에 놓아 본다.
   * 값은 정합성 허용치 배수. 0이면 꺼진다(미분류는 안 놓인다).
   */
  facePlanes?: number;
  /**
   * **깊이 타당성**(S-6) — 정합성 검사를 못 쓴 획(한쪽이 자유단)에만 적용한다.
   * 놓인 획이 기존 기하의 깊이 범위를 이 비율만큼 벗어나면 배치하지 않는다.
   * 측정: 궤도 45°에서 **38.5%가 자유단**이라 정합성 검사가 아예 안 걸렸고, 그 경로가 꼬리였다.
   * 0이면 꺼진다.
   */
  depthEnvelope?: number;
}

/**
 * 획 하나를 이미 배치된 획들에 붙인다. **연결된 것만 배치된다**(§4.2) —
 * 기존 획에 닿지 않고 씨앗도 아니면 `pts3d`가 빈 채로 남는다(깊이 미결정). 추정하지 않는다.
 */
export function placeInto(
  placed: Stroke[], stroke: Stroke, ctx: PlaceCtx, opts: PlaceOpts = {},
): boolean {
  if (stroke.pts2d.length < 2) return false;
  const radius = (ctx.joinRatio ?? PLACE_TOL.join_ratio) * diagOf(ctx.imgSize);

  // **§4.3 면 위 사선** — 축을 벗어난 획은 축 두 개가 펴는 평면 위에 놓아 본다.
  // 정합성 검사를 통과할 때만 놓는다(검증 없이 놓는 것은 추측이다, A-3).
  if (stroke.axis === "free") {
    if (!opts.facePlanes) return false;
    const fr = placeOnFace(placed, stroke.pts2d, ctx, radius, opts.facePlanes);
    if (!fr) return false;
    stroke.pts3d = fr.pts3d;
    stroke.anchorRef = fr.id;
    stroke.joinShift = fr.joinShift;
    return true;
  }
  const ends: [Pt2, Pt2] = [stroke.pts2d[0], stroke.pts2d[stroke.pts2d.length - 1]];
  let hit: { pos: Vec3; id: string; which: 0 | 1 } | null;
  let byFarEnd = false;
  if (opts.farEndCheck) {
    // **획 자신의 축 제약으로 고른다**(S-6). 양 끝에 후보가 있으면 정합성으로 가른다.
    const r = resolveAnchor(placed, stroke.pts2d, stroke.axis, ctx,
      { mode: opts.mode, rep: stroke.rep ?? opts.rep, radius, farEndTol: opts.farEndCheck });
    // 후보는 있었는데 어떤 짝도 안 맞으면 `null`이다 — 그때는 **놓지 않는다**.
    if (!r && (anchorCandidates(placed, stroke.pts2d[0], radius).length
               || anchorCandidates(placed, stroke.pts2d[stroke.pts2d.length - 1], radius).length)) {
      return false;
    }
    hit = r ? { pos: r.anchor, id: r.id, which: r.which } : null;
    byFarEnd = r?.byFarEnd ?? false;
  } else {
    const h = findAnchor(placed, ends, radius, opts.endpointOnly, opts.nearestSample, opts.depthGuard);
    // 가림으로 후보가 갈리지 않으면 **놓지 않는다**. 사용자가 다시 돌리거나 이어 그으면 풀린다.
    if (h?.depthAmbiguous) return false;
    hit = h;
  }

  let anchor: Vec3 | null = hit ? hit.pos : null;
  let joinAt: 0 | 1 | undefined = hit ? hit.which : undefined;
  if (!anchor) {
    if (!(opts.seedIfEmpty ?? placed.length === 0)) return false;   // 떠 있는 획 — 미룬다
    anchor = seedOnGround(stroke.pts2d[0], ctx);                     // 씨앗: 지면 접촉 가정
    joinAt = 0;
  }
  if (!anchor) return false;

  const r = placeStroke(stroke.pts2d, stroke.axis, anchor, ctx,
    opts.mode ?? "facing", stroke.rep ?? opts.rep, joinAt);
  if (!r.ok) return false;

  // **깊이 타당성** — 정합성으로 고르지 못한 앵커(자유단)는 이것으로 한 번 더 거른다.
  // 앵커가 틀리면 획이 기존 기하에서 한참 떨어진 깊이로 날아간다.
  if (opts.depthEnvelope && !byFarEnd && placed.length) {
    const zs = placed.flatMap(t => t.pts3d.map(p => p[2]));
    if (zs.length) {
      const lo = Math.min(...zs), hi = Math.max(...zs), span = Math.max(hi - lo, hi * 0.05);
      const m = opts.depthEnvelope * span;
      const zNew = r.pts3d.map(p => p[2]);
      if (Math.min(...zNew) < lo - m || Math.max(...zNew) > hi + m) return false;
    }
  }
  stroke.pts3d = r.pts3d;
  stroke.anchorRef = hit ? hit.id : null;
  stroke.joinShift = r.joinShift;
  return true;
}

/**
 * 미배치 획을 **더 붙지 않을 때까지** 다시 시도한다.
 * 나중에 그린 획이 앵커를 만들어 주면 앞서 떠 있던 획이 그때 붙는다 —
 * 한 번만 훑으면 그리는 순서에 따라 영구히 미배치로 남는다.
 */
export function settle(strokes: Stroke[], ctx: PlaceCtx, opts: PlaceOpts = {}): number {
  const placed = strokes.filter(s => s.pts3d.length > 0);
  let added = 0;
  for (let pass = 0; pass < strokes.length + 1; pass++) {
    let moved = 0;
    for (const s of strokes) {
      if (s.pts3d.length) continue;
      if (placeInto(placed, s, ctx, { ...opts, seedIfEmpty: opts.seedIfEmpty ?? placed.length === 0 })) {
        placed.push(s); moved += 1; added += 1;
      }
    }
    if (!moved) break;
  }
  return added;
}

/** 카메라가 재조정되면 `pts2d`에서 전부 다시 만든다(§5 "pts2d를 반드시 보존한다"). */
export function reprojectAll(strokes: Stroke[], ctx: PlaceCtx, opts: PlaceOpts = {}): number {
  for (const s of strokes) { s.pts3d = []; s.anchorRef = null; s.joinShift = 0; }
  return settle(strokes, ctx, opts);
}

// ---------------------------------------------------------------- 측정 보조 (§4.4 판단 기준)

/** 점열의 현(첫 점 → 끝 점) 방향과 축 방향이 이루는 각(도). 부호는 무시한다. */
export function chordAxisAngle(pts3d: Vec3[], dir: Vec3): number {
  if (pts3d.length < 2) return NaN;
  const c = unit3(sub3(pts3d[pts3d.length - 1], pts3d[0]));
  const u = unit3(dir);
  const cs = Math.min(1, Math.abs(dot3(c, u)));
  return (Math.acos(cs) * 180) / Math.PI;
}

/** 각 점이 축 직선에서 벗어난 3D 수직거리. **떨림의 3D 진폭**이다. */
export function wobbleAmplitude(pts3d: Vec3[], anchor: Vec3, dir: Vec3): number {
  const u = unit3(dir);
  let m = 0;
  for (const p of pts3d) {
    const w = sub3(p, anchor);
    const perp = sub3(w, mul3(u, dot3(w, u)));
    m = Math.max(m, norm3(perp));
  }
  return m;
}

export { add3, sub3, mul3, dot3, unit3, norm3, project, rayThrough };
