// L-B.3 **스냅** — 계획서 §3. **Rhino Osnap / SketchUp inference를 그대로 따른다**(A-3).
//
// 새로 설계하지 않는다. 목록·우선순위·표시가 전부 선례이고, 고유한 것은 §1.2의 둘뿐이다.
//
// ```
// 대상    끝점 · 중점 · 교차점 · 수선 발 · 선 위 근처점 · 면 위 점
// 우선    끝점 > 중점 > 교차점 > 수선 발 > 선 위 근처점 > 면 위 점   (정확한 것이 앞선다)
// 반경    화면 픽셀. 커서가 여러 후보 안에 있으면 **우선순위가 높은 것**이 이긴다
// ```
//
// **획의 첫 점이 스냅되면 그 획의 3D가 확정된다**(§3 마지막 문단). 그 뒤 커서 픽셀 하나가
// 끝점을 유일하게 결정하므로 추론할 것이 없다 — 이것이 이 접근의 핵심이다.
//
// ---------------------------------------------------------------- 화면 교차가 아니라 3D 교차다
//
// **교차점은 3D에서 실제로 만나는 것만 쓴다.** 화면에서 가로지르는 것은 대개 **가림**이고,
// `lift.ts`가 이미 그 자리에서 걸렸다(상자 하나에서 27개 중 3개가 가림이었고 그것 때문에
// 참 상자가 복원되지 않았다). Rhino의 `Int`도 실제 교차이고 겉보기 교차는 별개 항목이다 —
// **선례가 같은 쪽이다.**
//
// ---------------------------------------------------------------- 면 위 점의 유일한 대상은 지면이다
//
// 면 생성이 범위 밖이라(DEFERRED) 지금 존재하는 면은 **지면 하나**다. 그리고 지면 스냅의
// 화면 거리는 **정의상 0**이다(커서 광선이 그 평면과 만나는 점이므로 되쏘면 커서로 돌아온다).
// 그래서 ① 우선순위 최하위이고 ② **측정에서 성공률에 섞지 않는다** — 넣으면 성공률이
// 공짜로 1이 된다(PITFALLS #3: 지표가 정의의 귀결일 수 있다).
import { project, closestPoints, rayThrough, add3, sub3, mul3, dot3, norm3,
         rayPlane, type Vec3, type Plane } from "./geom3d.js";
import type { Pt2 } from "./camera.js";

export type SnapKind =
  | "vertex" | "endpoint" | "midpoint" | "intersection" | "perpendicular"
  | "extension" | "on_edge" | "on_face";

/**
 * **우선순위**(앞이 높다). 선례 그대로 — 정확한 것이 앞선다.
 *
 * ⚠ **`vertex`(정점)는 이 자료구조에서 "여러 획이 만나는 끝점"이다**(2026-08-16 사람 지시).
 * Rhino의 `Vertex`는 메쉬·SubD의 정점인데 **여기 기하는 선분뿐이라 그 대상이 없다** —
 * 없는 것을 지어내지 않고, 대신 **모서리가 만나는 꼭짓점**에 그 이름을 준다.
 * 끝점보다 앞이지만 **위치는 같다**(같은 3D 점의 다른 이름이므로 붙는 자리가 안 바뀐다) —
 * 바뀌는 것은 **표시**뿐이고, 그래서 이 순위 변경은 배치를 안 움직인다.
 */
/**
 * ⚠ **`extension`(연장선, 13차 항목 3)은 점 후보가 아니라 방향 스냅이다** — 후보 생성
 * (`snapCandidates`·`staticCandidates`)에는 안 나오고 확정·미리보기(`resolveLive`)가 따로
 * 판정한다(`extension.ts`). 이 목록에 있는 이유는 **우선순위와 종류별 토글**(지시 3-f·3-g)
 * 이다: 끝점·중점·교차점(점 스냅 — 시작 앵커를 정하는 것들) 다음, 근처점(on_edge)보다 앞.
 * Rhino도 Extension을 오스냅 토글 목록에 나란히 둔다(선례 A-3).
 */
export const SNAP_ORDER: readonly SnapKind[] =
  ["vertex", "endpoint", "midpoint", "intersection", "perpendicular",
   "extension", "on_edge", "on_face"] as const;

const RANK = new Map<SnapKind, number>(SNAP_ORDER.map((k, i) => [k, i]));

export const SNAP_TOL = {
  /**
   * **스냅 반경**(화면 대각 대비). 계획서 §3은 "화면 픽셀 기준 고정값"이라고 적었고 선례도
   * 절대 px다(포인터 정밀도의 문제이므로). 여기서 비율로 두는 이유는 **재는 양이 비율이기
   * 때문**이다 — 합성 잉크의 겨냥 오차(`drawEdges`의 `endJitter`)가 그림 대각 대비 σ이고
   * 실획 자릿수(`closure_gap` 0.028~0.051)도 비율이다. 절대 px로 두면 캔버스 크기에 따라
   * 다른 양을 재게 된다(V-s의 "절대 픽셀 금지"와 같은 이유).
   *
   * **값은 측정이 정했다** — `stage0/out/snap.json`의 `by_density.rules.k3.rule_c_saturation`.
   * 0.05 = 960×672에서 **58.6px**이고, 이것은 SketchUp/Rhino의 고정 조리개(10~15px)보다
   * **훨씬 크다.** 이유는 손 획의 겨냥 오차 자체가 크기 때문이다 — 시작 잉크 점이 참 모서리의
   * 상에서 어긋나는 거리가 중앙 **4.7 / 14.7 / 23.8px**(`endJitter` 0.01 / 0.03 / 0.05)이다.
   *
   * ⚠ **더 키워도 되는 것이 아니라 더 키워도 얻는 것이 없다.** 등록한 두 규칙(순이득 최대 ·
   * 틀림 ≤ 10%)은 **둘 다 실패했다**: 전자는 반경을 키우는 비용이 픽스처에 없어 계속 커지고,
   * 후자는 대상이 촘촘해지면 **어떤 반경도 만족하지 못한다.**
   * **한계를 정하는 것은 반경이 아니라 (겨냥 오차 / 대상 간격)의 비**다 — 격자 k3에서
   * 참 꼭짓점 간격 중앙이 21.3px인데 겨냥 오차 중앙이 14.7px이라, 반경을 어떻게 잡아도
   * **틀린 붙음이 1330/4320에서 포화한다.** 스냅으로 못 고치는 몫이 그것이다.
   */
  radius_ratio: 0.05,
  /**
   * **3D 교차로 인정하는 최대 간격**(기하 크기 대비). 두 선분의 최근접점 사이가 이보다
   * 멀면 **화면에서만 겹친 것**(가림)이다.
   */
  meet_ratio: 0.01,
  /**
   * 선분 밖으로 얼마나 넘겨도 그 선분 위로 보는가(선분 길이 대비).
   * 손 획이 모서리에서 못 미치거나 지나치므로 0이 아니다.
   */
  extend_ratio: 0.02,
  /** 끝점·중점을 같은 대상으로 합치는 3D 거리(기하 크기 대비). 모서리를 여러 획이 공유한다. */
  merge_ratio: 0.002,
};
export type SnapCfg = Partial<typeof SNAP_TOL>;

/** 스냅 대상이 되는 3D 세그먼트 — 문서의 3D 레이어 그대로다. */
export interface SnapSeg { id: string; a: Vec3; b: Vec3 }

export interface SnapCand {
  kind: SnapKind;
  /** 3D 위치 — **이것이 획의 시작점이 된다.** */
  at: Vec3;
  /** 그 점의 화면 위치. */
  screen: Pt2;
  /** 커서에서 화면 거리(px). */
  dist: number;
  ofId?: string;
  /** 교차점일 때 상대 세그먼트. */
  ofId2?: string;
}

export interface SnapCtx {
  principal: Pt2;
  f: number;
  imgSize: [number, number];
  /**
   * 지면 — §3의 "면 위 점". 면 생성이 범위 밖이라 지금 있는 면은 이것 하나다.
   * `null`이면 그 종류를 내지 않는다(**측정은 항상 `null`로 돈다**).
   */
  ground?: Plane | null;
  /**
   * 수선 발의 기준점 — **지금 그리는 선의 시작점**이다. Rhino의 `Perp`도 같다
   * (시작점이 있어야 "무엇에 수직인지"가 정해진다). 없으면 그 종류를 내지 않는다.
   */
  from?: Vec3 | null;
}

const diagOf = (sz: [number, number]) => Math.hypot(sz[0], sz[1]);

/** 기하 전체의 크기 — 3D 임계의 기준. 대상이 없으면 1. */
export function geomScale(segs: SnapSeg[]): number {
  if (!segs.length) return 1;
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of segs) for (const p of [s.a, s.b]) for (const k of [0, 1, 2] as const) {
    if (p[k] < lo[k]) lo[k] = p[k];
    if (p[k] > hi[k]) hi[k] = p[k];
  }
  const d = norm3(sub3(hi, lo));
  return Number.isFinite(d) && d > 1e-9 ? d : 1;
}

/** 3D 점 → 커서까지의 화면 거리. 카메라 뒤면 `null`. */
function screenOf(at: Vec3, p: Pt2, ctx: SnapCtx): { screen: Pt2; dist: number } | null {
  const u = project(at, ctx.principal, ctx.f);
  if (!u || !Number.isFinite(u[0]) || !Number.isFinite(u[1])) return null;
  return { screen: u, dist: Math.hypot(u[0] - p[0], u[1] - p[1]) };
}

/** 선분 위의 매개변수 → 3D 점. */
const atParam = (s: SnapSeg, t: number): Vec3 => add3(s.a, mul3(sub3(s.b, s.a), t));

/** 질의와 무관한 후보 — 끝점·중점·교차점. **기하가 바뀔 때만 다시 만든다.** */
export interface StaticCand { kind: SnapKind; at: Vec3; ofId?: string; ofId2?: string }

/**
 * **질의와 무관한 후보를 미리 만든다.**
 *
 * 교차점 후보가 `O(n²)`이라 포인터가 움직일 때마다 다시 만들면 대상 100선에서 5천 번의
 * 최근접 계산이 매 프레임 돈다. 기하는 획을 놓을 때만 바뀌므로 **그때만** 다시 만든다.
 * 측정 하네스도 같은 함수를 쓴다(PITFALLS #17) — 밀도 스윕이 이 절약 없이는 안 돈다.
 */
export function staticCandidates(segs: SnapSeg[], cfg: SnapCfg = {}): StaticCand[] {
  const c = { ...SNAP_TOL, ...cfg };
  const G = geomScale(segs);
  const meet = c.meet_ratio * G;
  const merge = c.merge_ratio * G;
  const out: StaticCand[] = [];

  // ---- 끝점 · 중점. 같은 자리를 여러 획이 공유하므로 **합친다**(중복 후보는 정보가 아니다).
  // **합쳐진 개수가 곧 정점 여부다** — 둘 이상이 만나면 그 자리는 꼭짓점이다(위 `SNAP_ORDER`).
  const seen: { at: Vec3; kind: SnapKind; hits: number; idx: number }[] = [];
  const fresh = (at: Vec3, kind: SnapKind): boolean => {
    for (const s of seen) {
      if (s.kind === kind && norm3(sub3(s.at, at)) <= merge) { s.hits += 1; return false; }
    }
    seen.push({ at, kind, hits: 1, idx: out.length });
    return true;
  };
  for (const s of segs) {
    for (const at of [s.a, s.b]) if (fresh(at, "endpoint")) out.push({ kind: "endpoint", at, ofId: s.id });
    // **3D 중점을 투영한다** — 화면 중점이 아니다(투시에서 둘은 다르다).
    const mid = atParam(s, 0.5);
    if (fresh(mid, "midpoint")) out.push({ kind: "midpoint", at: mid, ofId: s.id });
  }
  // **여러 획이 만난 끝점을 정점으로 승격한다.** 위치는 그대로이고 이름과 표시만 바뀐다
  for (const s of seen) {
    if (s.kind === "endpoint" && s.hits >= 2) out[s.idx].kind = "vertex";
  }

  // ---- 교차점: **3D에서 실제로 만나는 것만.** 화면 교차는 가림이다.
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i], B = segs[j];
    const cl = closestPoints(A.a, sub3(A.b, A.a), B.a, sub3(B.b, B.a));
    if (cl.parallel || cl.gap > meet) continue;
    // `closestPoints`의 t·s는 **단위 방향** 기준이라 길이로 나눠 매개변수로 되돌린다
    const la = norm3(sub3(A.b, A.a)), lb = norm3(sub3(B.b, B.a));
    if (la < 1e-9 || lb < 1e-9) continue;
    const ta = cl.t / la, tb = cl.s / lb;
    const pad = c.extend_ratio;
    if (ta < -pad || ta > 1 + pad || tb < -pad || tb > 1 + pad) continue;
    const at = mul3(add3(cl.p, cl.q), 0.5);
    // 끝점과 같은 자리면 끝점이 이미 냈다 — 교차점으로 또 내지 않는다
    if ([A.a, A.b, B.a, B.b].some(e => norm3(sub3(e, at)) <= merge)) continue;
    out.push({ kind: "intersection", at, ofId: A.id, ofId2: B.id });
  }
  return out;
}

/**
 * **후보를 전부 낸다** — 반경 안에 든 것만, 우선순위·거리 순으로.
 *
 * 화면에 여러 개를 보이지는 않지만(선례는 하나만 보인다) 측정이 "무엇에 붙을 뻔했는가"를
 * 봐야 하므로 목록을 낸다. **추측하지 말고 센다**(#7).
 *
 * `pre`를 주면 질의 무관 후보를 다시 만들지 않는다(`staticCandidates`).
 */
export function snapCandidates(
  p: Pt2, segs: SnapSeg[], ctx: SnapCtx, cfg: SnapCfg = {}, pre?: StaticCand[],
): SnapCand[] {
  const c = { ...SNAP_TOL, ...cfg };
  const R = c.radius_ratio * diagOf(ctx.imgSize);
  const out: SnapCand[] = [];

  const push = (kind: SnapKind, at: Vec3, ofId?: string, ofId2?: string) => {
    const sc = screenOf(at, p, ctx);
    if (!sc || sc.dist > R) return;
    out.push({ kind, at, screen: sc.screen, dist: sc.dist, ofId, ofId2 });
  };

  for (const s of (pre ?? staticCandidates(segs, cfg))) push(s.kind, s.at, s.ofId, s.ofId2);

  // ---- 수선 발: 기준점이 있어야 정해진다(Rhino `Perp`와 같다).
  if (ctx.from) {
    for (const s of segs) {
      const e = sub3(s.b, s.a);
      const L2 = dot3(e, e);
      if (L2 < 1e-18) continue;
      const t = dot3(sub3(ctx.from, s.a), e) / L2;
      if (t < -c.extend_ratio || t > 1 + c.extend_ratio) continue;
      push("perpendicular", atParam(s, t), s.id);
    }
  }

  // ---- 선 위 근처점: 커서 광선에 가장 가까운 선분 위 점.
  for (const s of segs) {
    const e = sub3(s.b, s.a);
    const L = norm3(e);
    if (L < 1e-9) continue;
    const cl = closestPoints([0, 0, 0], rayThrough(p, ctx.principal, ctx.f), s.a, e);
    const t = Math.min(1 + c.extend_ratio, Math.max(-c.extend_ratio, cl.s / L));
    push("on_edge", atParam(s, t), s.id);
  }

  // ---- 면 위 점: 지금은 지면 하나. **화면 거리가 정의상 0이다**(머리말).
  if (ctx.ground) {
    const at = rayPlane([0, 0, 0], rayThrough(p, ctx.principal, ctx.f), ctx.ground.n, ctx.ground.d);
    if (at) push("on_face", at);
  }

  return out.sort((a, b) => (RANK.get(a.kind)! - RANK.get(b.kind)!) || (a.dist - b.dist));
}

/**
 * **하나를 고른다.** 커서가 여러 후보 안에 있으면 **우선순위가 높은 것**이 이긴다 —
 * 더 가까운 것이 아니다. 선례가 그렇게 한다(정확한 대상이 흐릿한 대상에 밀리면 안 된다).
 *
 * 아무 후보도 반경 안에 없으면 `null` — **애매하면 놓지 않는다**(A-3).
 */
export function snapAt(
  p: Pt2, segs: SnapSeg[], ctx: SnapCtx, cfg: SnapCfg = {}, pre?: StaticCand[],
): SnapCand | null {
  return snapCandidates(p, segs, ctx, cfg, pre)[0] ?? null;
}

/** 화면 표시용 — 종류별 라벨과 색. SketchUp의 관행(종류마다 다른 표식)을 따른다. */
export const SNAP_LABEL: Record<SnapKind, string> = {
  vertex: "정점", endpoint: "끝점", midpoint: "중점", intersection: "교차점",
  perpendicular: "수선 발", extension: "연장선", on_edge: "선 위", on_face: "면 위",
};
export const SNAP_COLOR: Record<SnapKind, string> = {
  vertex: "#0c7a0c", endpoint: "#20a020", midpoint: "#1f77d0", intersection: "#c02090",
  perpendicular: "#d06a00", extension: "#9b59b6", on_edge: "#7a7a7a", on_face: "#8a6d3b",
};
/**
 * **종류별 표식 모양**(§3 "표시"). 색만으로는 안 갈린다 — 선례가 모양을 함께 쓴다
 * (SketchUp의 초록 네모=끝점 · 하늘색 마름모=중점 · Rhino의 종류별 아이콘).
 */
export const SNAP_ICON: Record<SnapKind, "square" | "diamond" | "cross" | "triangle" | "circle" | "tee"> = {
  vertex: "square", endpoint: "square", midpoint: "diamond", intersection: "cross",
  perpendicular: "tee", extension: "circle", on_edge: "circle", on_face: "triangle",
};
/** 툴팁 — **무엇에 붙는지와 그것이 무엇을 정하는지**를 한 줄로. */
export const SNAP_TIP: Record<SnapKind, string> = {
  vertex: "여러 획이 만나는 꼭짓점 — 가장 확실한 대상입니다",
  endpoint: "획의 끝점",
  midpoint: "획의 3D 중점(화면 중점이 아닙니다)",
  intersection: "3D에서 실제로 만나는 교차점(겉보기 교차는 제외)",
  perpendicular: "시작점에서 그 획에 내린 수선의 발",
  extension: "끝점에서 그 선의 방향을 그대로 이어 긋습니다 — 같은 3D 직선 위에 놓입니다",
  on_edge: "그 획 위에서 커서에 가장 가까운 점",
  on_face: "지면 위의 점(시선과 지면의 교점)",
};
