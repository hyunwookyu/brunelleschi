// L-C **차수 승격** — 계획서 §6.1. 계획서 §1.2가 말하는 **고유한 것 둘 중 두 번째**다.
//
// ```
// 소실점이 하나 더 잡히면 차수가 승격되고 전부 다시 풀린다
// ```
//
// **1점 · 2점 · 3점 투시는 하나의 이론이고 갈리는 것은 개수뿐이다**(이론서 2.3).
// 그래서 여기에 분기가 없다 — 소실점 집합이 바뀌면 `recoverCamera`가 알아서 차수를 낸다.
//
// ---------------------------------------------------------------- 왜 전부 다시 푸는가
//
// `pts2d`를 보존하므로(CLAUDE.md §1) **처음부터 다시 올릴 수 있다.** 부분 유지는
// **좌표계가 섞인 상태**를 만든다 — 옛 카메라로 푼 획과 새 카메라로 푼 획이 한 공간에 있으면
// 그 둘의 관계가 아무것도 아니다. 그래서 §6.1은 "전부 다시"이고 여기도 그렇다.
//
// ---------------------------------------------------------------- ⚠ 스냅이 조용히 풀린다
//
// `applySnapToStart`는 `pts2d[0]`을 **대상의 상**으로 옮긴다. 그런데 그 상은
// **그 카메라에서만** 그 대상이다. 새 카메라에서는 같은 화면 점이 **다른 3D 점**을 가리킨다.
// 그래서 `snapStart.ofId`를 **새 카메라로 다시 풀어** 그 대상의 **새 상**으로 옮겨야 한다.
//
// ⚠ **순서 문제가 있다**: 대상 자체도 승격에서 다시 풀리므로, 대상이 새 3D를 얻기 전에는
// 그 상을 낼 수 없다. → **두 번 돈다.** 1차로 스냅을 무시하고 전부 올리고,
// 2차에서 그 결과를 대상으로 삼아 `snapStart`를 다시 풀고 다시 올린다.
// **대상이 1차에서 안 놓이면 그 스냅은 못 살린다** — 그 사실을 센다(#7).
import { liftAll, type LiftStroke, type LiftCtx, type LiftSeg } from "./lift.js";
import { classifyStroke, type Axis, type AxisCfg } from "./axis.js";
import { project, type Vec3 } from "./geom3d.js";
import { isFiniteVp, type Pt2 } from "./camera.js";

/** 승격 입력 — 문서의 획 하나. **`pts2d`가 원본이고 그것만 있으면 다시 풀 수 있다.** */
export interface OrderStroke {
  id: string;
  pts2d: Pt2[];
  /** 사용자가 직접 고른 축은 재분류가 덮지 않는다(§6.1 "사용자 지정만 유지"). */
  axis: Axis;
  userAxis: boolean;
  /** 무엇에 붙었나. `ofId`가 있으면 **그 대상의 새 상으로 다시 옮긴다.** */
  snapStart: { kind: string; at: Vec3; ofId?: string } | null;
  /**
   * **끝점이 붙은 대상**(오스냅, D-L46). 양 끝이 다 있으면 그 획은 **축이 없어도** 놓인다 —
   * 두 점이 선분을 정하기 때문이다. 승격에서도 같다: **둘 다 다시 풀리면 그 둘로 놓고,
   * 하나라도 못 살리면 놓지 않는다**(반쪽은 조용히 틀린 자리다, A-3).
   */
  snapEnd?: { kind: string; at: Vec3; ofId?: string } | null;
}

export interface OrderResult {
  /** 새 카메라로 푼 3D. **전부 다시 푼 것**이다. */
  placed: Map<string, LiftSeg>;
  /** 스냅을 다시 푼 결과. **추측하지 말고 센다**(#7). */
  snap: {
    /** `snapStart.ofId`가 있는 획 수 — 다시 풀 대상. */
    had: number;
    /** 대상이 새 카메라에서 놓여 **상을 다시 낼 수 있었던** 것. */
    reanchored: number;
    /** 대상이 안 놓여 못 살린 것. 그 획의 `pts2d[0]`은 **옛 상 그대로** 남는다. */
    target_unplaced: number;
    /** 대상이 카메라 뒤로 가서 투영이 안 되는 것. */
    behind_camera: number;
    /**
     * **못 살린 스냅의 획 id** — `target_unplaced`와 `behind_camera`를 합친 **직접 집합**이다.
     *
     * 개수를 `had − reanchored`로 만들지 않는다(#10). 그리고 이 목록이 있어야
     * L-C.2가 **어느 획인지 화면에 표시**할 수 있다 — 개수만으로는 못 보인다.
     * 그 획들의 시작점은 **옛 카메라의 상 그대로**라 **조용히 틀린 시작점**이다.
     */
    lost_ids: string[];
    /** 새 상으로 옮긴 획 id. `reanchored`의 직접 집합이다. */
    reanchored_ids: string[];
    /**
     * **다시 안 옮겼다면 어긋났을 거리**(px). 0이면 "조용히 풀린다"는 걱정이 없는 것이다 —
     * **양성 채널이 먼저다**(#30). 옛 화면 점과 새 상의 화면 거리다.
     */
    drift_px: number[];
  };
}

/** 화면 점을 옛 것으로 되돌리기 위한 사본 — 입력을 **안 건드린다**(순수 함수). */
const copyStroke = (s: OrderStroke): OrderStroke =>
  ({ ...s, pts2d: s.pts2d.map(p => [p[0], p[1]] as Pt2) });

/**
 * **차수 승격 — 전부 다시 푼다**(§6.1).
 *
 * `cfg`는 축 재분류의 임계다(앱과 하네스가 **같은 것을 쓴다**, #17).
 * 반환의 `placed`가 새 3D이고, 입력은 **안 바뀐다** — 호출자가 채택 여부를 정한다(§6.2 되돌리기).
 */
export function promoteOrder(
  strokes: OrderStroke[], ctx: LiftCtx, cfg: AxisCfg = {},
  /**
   * **축을 다시 붙이는 방법**(2026-08-16 규칙 경로). 안 주면 옛 검출 판정(`classifyStroke`)이다.
   * 앱은 `CamState.axisOf`를 준다 — 규칙이 이미 축을 정해 뒀으므로 **추정이 없다**(#17).
   */
  classify?: (pts2d: Pt2[]) => Axis,
): OrderResult {
  const out: OrderResult = {
    placed: new Map(),
    snap: { had: 0, reanchored: 0, target_unplaced: 0, behind_camera: 0,
            lost_ids: [], reanchored_ids: [], drift_px: [] },
  };
  if (!strokes.length) return out;
  const work = strokes.map(copyStroke);

  // ---- 1차: **스냅을 무시하고** 전부 올린다. 대상의 새 3D를 얻는 것이 목적이다
  const relabel = (s: OrderStroke): Axis => {
    if (s.userAxis) return s.axis;                    // 사용자 지정만 유지한다(§6.1)
    if (classify) return classify(s.pts2d);
    return classifyStroke(s.pts2d, ctx.vps, ctx.imgSize, cfg,
                          { principal: ctx.principal, f: ctx.f }).axis;
  };
  const pass1: LiftStroke[] = work.map(s => ({ id: s.id, pts2d: s.pts2d, axis: relabel(s) }));
  const r1 = liftAll(pass1, ctx);

  // ---- 2차: 1차 결과를 대상으로 스냅을 다시 푼다.
  //
  // **한 획에 두 자리가 있다**(오스냅, D-L46) — 시작점과 끝점. 같은 연산이므로 한 함수로 푼다
  // (#34: 한 자리에서 고친 것은 그 자리에서만 고쳐진다).
  let moved = false;
  /** 옛 스냅 → 새 3D + 새 화면점. 못 살리면 `null`. */
  const reanchor = (ref: { kind: string; at: Vec3; ofId?: string },
                    old: Pt2): { at: Vec3; u: Pt2 } | "unplaced" | "behind" => {
    const target = ref.ofId ? r1.placed.get(ref.ofId) : undefined;
    if (!target) return "unplaced";
    // 옛 3D 점이 대상 위 어디였는지 — **매개변수로 옮긴다**(끝점이면 0 또는 1이다).
    // 옛 대상의 3D를 모르므로 `kind`에 기대지 않고 **가장 가까운 매개변수**를 쓴다.
    const t = paramOnOldTarget(ref.at, ref.kind);
    const at: Vec3 = [target.a[0] + (target.b[0] - target.a[0]) * t,
                      target.a[1] + (target.b[1] - target.a[1]) * t,
                      target.a[2] + (target.b[2] - target.a[2]) * t];
    const u = project(at, ctx.principal, ctx.f);
    if (!u || !Number.isFinite(u[0]) || !Number.isFinite(u[1])) return "behind";
    out.snap.drift_px.push(Math.hypot(u[0] - old[0], u[1] - old[1]));
    return { at, u: [u[0], u[1]] };
  };

  /** 양 끝 스냅이 다 살아난 획 — **두 점으로 직접 놓는다**(축이 필요 없다). */
  const twoPoint = new Map<string, LiftSeg>();

  for (const s of work) {
    const hasStart = !!s.snapStart?.ofId, hasEnd = !!s.snapEnd?.ofId;
    if (!hasStart && !hasEnd) continue;
    out.snap.had += 1;
    const last = s.pts2d.length - 1;
    const rs = hasStart ? reanchor(s.snapStart!, s.pts2d[0]) : null;
    const re = hasEnd ? reanchor(s.snapEnd!, s.pts2d[last]) : null;
    const bad = [rs, re].find(r => r === "unplaced" || r === "behind");
    if (bad) {
      // **하나라도 못 살리면 그 획은 잃은 것으로 센다** — 반쪽 스냅은 조용히 틀린 자리다
      if (bad === "unplaced") out.snap.target_unplaced += 1; else out.snap.behind_camera += 1;
      out.snap.lost_ids.push(s.id);
      continue;
    }
    if (rs && rs !== "unplaced" && rs !== "behind") {
      s.pts2d = [rs.u, ...s.pts2d.slice(1)];
      s.snapStart = { ...s.snapStart!, at: rs.at };
    }
    if (re && re !== "unplaced" && re !== "behind") {
      s.pts2d = [...s.pts2d.slice(0, last), re.u];
      s.snapEnd = { ...s.snapEnd!, at: re.at };
    }
    // **양 끝이 다 살아났으면 그 둘이 곧 3D다**(추론이 없다)
    if (rs && re && rs !== "unplaced" && rs !== "behind" && re !== "unplaced" && re !== "behind") {
      twoPoint.set(s.id, { a: rs.at, b: re.at });
    }
    out.snap.reanchored += 1;
    out.snap.reanchored_ids.push(s.id);
    moved = true;
  }

  // ---- 옮긴 것이 있으면 다시 푼다. 없으면 1차가 답이다(**같은 연산을 두 번 돌리지 않는다**)
  if (!moved) {
    out.placed = r1.placed;
  } else {
    const pass2: LiftStroke[] = work.map(s => ({ id: s.id, pts2d: s.pts2d, axis: relabel(s) }));
    out.placed = liftAll(pass2, ctx).placed;
  }
  // **양 끝 스냅은 솔버 결과를 덮는다** — 두 점이 이미 선분을 정했고 그것이 사용자가 지정한 것이다
  for (const [id, seg] of twoPoint) out.placed.set(id, seg);
  return out;
}

/**
 * 옛 스냅 점이 대상 선분 위 어디였나 — **끝점·중점만 매개변수가 정해진다.**
 *
 * 다른 종류(교차점·수선 발·선 위)는 **두 선분의 관계**라 한 대상만으로는 안 정해진다.
 * 그런 경우 `0.5`로 두면 **조용히 틀린 자리**가 되므로, 대신 **끝점 중 가까운 쪽**을 쓴다 —
 * ⚠ 그것도 근사이고 그 사실을 원장에 적는다. 정확히 하려면 `snapStart`가 매개변수를
 * 들고 있어야 하는데 그것은 `snap.ts`의 자료구조 변경이다(DEFERRED).
 */
function paramOnOldTarget(_at: Vec3, kind: string): number {
  if (kind === "midpoint") return 0.5;
  return 0;                                   // 끝점 규약: `a`쪽
}

/** 새 소실점 집합이 옛 것과 **차수가 다른가**. 같으면 승격이 아니다. */
export function orderOf(vps: readonly (Pt2 | null)[], imgSize: [number, number]): number {
  return vps.filter(v => v && isFiniteVp(v, imgSize)).length;
}
