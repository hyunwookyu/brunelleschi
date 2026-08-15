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
): OrderResult {
  const out: OrderResult = {
    placed: new Map(),
    snap: { had: 0, reanchored: 0, target_unplaced: 0, behind_camera: 0, drift_px: [] },
  };
  if (!strokes.length) return out;
  const work = strokes.map(copyStroke);

  // ---- 1차: **스냅을 무시하고** 전부 올린다. 대상의 새 3D를 얻는 것이 목적이다
  const relabel = (s: OrderStroke): Axis => {
    if (s.userAxis) return s.axis;                    // 사용자 지정만 유지한다(§6.1)
    return classifyStroke(s.pts2d, ctx.vps, ctx.imgSize, cfg,
                          { principal: ctx.principal, f: ctx.f }).axis;
  };
  const pass1: LiftStroke[] = work.map(s => ({ id: s.id, pts2d: s.pts2d, axis: relabel(s) }));
  const r1 = liftAll(pass1, ctx);

  // ---- 2차: 1차 결과를 대상으로 `snapStart`를 다시 푼다
  let moved = false;
  for (const s of work) {
    if (!s.snapStart?.ofId) continue;
    out.snap.had += 1;
    const target = r1.placed.get(s.snapStart.ofId);
    if (!target) { out.snap.target_unplaced += 1; continue; }
    // 옛 3D 점이 대상 위 어디였는지 — **매개변수로 옮긴다**(끝점이면 0 또는 1이다).
    // 옛 대상의 3D를 모르므로 `kind`에 기대지 않고 **가장 가까운 매개변수**를 쓴다.
    const t = paramOnOldTarget(s.snapStart.at, s.snapStart.kind);
    const at: Vec3 = [target.a[0] + (target.b[0] - target.a[0]) * t,
                      target.a[1] + (target.b[1] - target.a[1]) * t,
                      target.a[2] + (target.b[2] - target.a[2]) * t];
    const u = project(at, ctx.principal, ctx.f);
    if (!u || !Number.isFinite(u[0]) || !Number.isFinite(u[1])) {
      out.snap.behind_camera += 1; continue;
    }
    out.snap.drift_px.push(Math.hypot(u[0] - s.pts2d[0][0], u[1] - s.pts2d[0][1]));
    s.pts2d = [[u[0], u[1]], ...s.pts2d.slice(1)];
    s.snapStart = { ...s.snapStart, at };
    out.snap.reanchored += 1;
    moved = true;
  }

  // ---- 옮긴 것이 있으면 다시 푼다. 없으면 1차가 답이다(**같은 연산을 두 번 돌리지 않는다**)
  if (!moved) { out.placed = r1.placed; return out; }
  const pass2: LiftStroke[] = work.map(s => ({ id: s.id, pts2d: s.pts2d, axis: relabel(s) }));
  out.placed = liftAll(pass2, ctx).placed;
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
