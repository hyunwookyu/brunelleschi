// **축 스냅 — 라이노 직교 모드**(2026-08-16, 사람 지시 1·3).
//
// 옛 판은 **획을 놓은 뒤 방향을 판정**했다. 그러면 사용자가 그은 각도 오차가 그대로 3D에 들어온다.
// 여기서는 **그리는 동안 축으로 강제한다** — 커서를 정확히 따라가지 않는다.
//
// ```
// 커서 이동 → 앵커에서 각 축으로 뻗은 3D 직선을 만든다
//          → 커서 광선의 **최근접점**이 그 직선 위의 끝점이다(= 화면에서 수직 투영)
//          → 후보 중 하나를 고른다(아래) → 미리보기는 **그 축 방향**으로 그린다
// 획 종료   → 그 축 선이 확정된다. **커서 위치가 아니다**
// ```
//
// **오차 구조가 바뀐다**: 확정 후 그리는 선은 축을 정확히 따르므로 **새 오차가 안 들어온다.**
// 첫 한두 선의 오차만 전체를 정한다. (그것이 사실인지는 `axis_snap.json`이 잰다 —
// ⚠ **"축 오차가 준다"는 부분적으로 설계 보장이다**(PITFALLS #5): 확정 후 선은 정의상
// 축을 따르므로 그 선들의 기여가 0이 되는 것은 측정이 아니다. 재는 것은 **카메라 축 오차**와
// **배치·조용히 틀림**이고, 그것은 첫 선들과 모호 판정이 정한다.)
//
// ---------------------------------------------------------------- 모호한 방향 (사람 지시 3)
//
// 화면 정중앙에서 세로선을 그으면 **수직축인지 그 지점을 향하는 깊이선인지 기하로 못 가른다** —
// 주점 근처에서 두 해석의 화면 방향이 겹친다. 좌우 규칙을 따로 두지 않는다:
// **두 해석의 선을 모두 계산하고 커서가 더 가까운 쪽을 고른다.**
//
//   · 각도로 갈리므로 **모든 구도에서 일관**되고, 후보가 셋 이상일 때도 같은 방식이 쓰인다
//   · **긋는 방향과 무관하다** — 축은 부호가 없다(위→아래든 아래→위든 같다)
//   · 화면에는 **고른 것만** 보인다. 움직이면 색과 방향이 함께 바뀐다 — 설명할 필요가 없다
import { closestPoints, rayThrough, project, add3, mul3, unit3, norm3, type Vec3 } from "./geom3d.js";
import type { Pt2 } from "./camera.js";

/** 축 스냅의 임계. **`test/constants.ts`에 등록한다**(D-C4). */
export const SNAP_TOL_AXIS = {
  /**
   * **모호 구간**(도). 1등과 2등 후보의 화면 각차가 이 값 안이면 각도로 못 가르고
   * **커서 위치로 고른다**(사람 지시 3-a·b).
   *
   * ⚠ **명백히 하나로 결정되면 이 장치가 발동하지 않는다** — 평소에는 보이지 않는다.
   * 값은 측정으로 정한다(`axis_snap.json`의 `by_ambiguous_deg` 스윕).
   */
  ambiguous_deg: 6 as number,
} as const;
export type AxisSnapCfg = { ambiguous_deg?: number };

export interface SnapCtx2 { principal: Pt2; f: number }

/** 후보 하나 — 그 축으로 강제했을 때의 3D 선분과 **화면에 보이는 끝점**. */
export interface AxisCand {
  axis: 0 | 1 | 2;
  /** 커서 방향과 그 축의 **화면 방향** 각차(도). 부호 없음. */
  deg: number;
  /** 앵커 → 그 축 위 최근접점. */
  seg: [Vec3, Vec3];
  /** 끝점의 화면 좌표. **커서와의 거리**가 모호 구간의 판정 재료다. */
  screenEnd: Pt2;
  /** 커서에서 그 끝점까지의 화면 거리(px). */
  cursorDist: number;
}

/**
 * **모든 축 후보를 계산한다.** 각도로 거르지 않는다 — 축 스냅은 언제나 어느 하나로 간다.
 *
 * `dirs`는 축 0·1·2의 3D 방향이고 `null`은 그 축이 아직 없다는 뜻이다.
 * 각차는 **앵커에서 축으로 조금 간 점의 상**으로 잰다(소실점으로 모이므로 앵커마다 다르다).
 */
export function axisCandidates(
  anchor: Vec3, dirs: (Vec3 | null)[], anchorScreen: Pt2, cursor: Pt2, ctx: SnapCtx2,
): AxisCand[] {
  const sx = cursor[0] - anchorScreen[0], sy = cursor[1] - anchorScreen[1];
  const L = Math.hypot(sx, sy);
  const out: AxisCand[] = [];
  for (let i = 0; i < dirs.length && i < 3; i++) {
    const d = dirs[i];
    if (!d || norm3(d) < 1e-12) continue;
    // ① 그 축으로 강제한 3D 끝점 = 커서 광선과 축 직선의 최근접점(= 화면에서 수직 투영)
    const r = rayThrough(cursor, ctx.principal, ctx.f);
    const cl = closestPoints([0, 0, 0], r, anchor, d);
    if (cl.parallel || cl.q[2] <= 1e-9) continue;      // 시선과 나란하거나 카메라 뒤
    const end = project(cl.q, ctx.principal, ctx.f);
    if (!end) continue;
    // ② 화면 각차 — **부호를 무시한다**(어느 쪽으로 긋든 같은 축이다, 사람 지시 3-c)
    const step = mul3(unit3(d), Math.max(1e-3, norm3(anchor) * 1e-3));
    const q2 = project(add3(anchor, step), ctx.principal, ctx.f);
    let deg = 90;
    if (q2 && L > 1e-9) {
      const vx = q2[0] - anchorScreen[0], vy = q2[1] - anchorScreen[1];
      const M = Math.hypot(vx, vy);
      if (M > 1e-12) {
        const c = Math.min(1, Math.abs(((sx / L) * vx + (sy / L) * vy) / M));
        deg = (Math.acos(c) * 180) / Math.PI;
      }
    }
    out.push({
      axis: i as 0 | 1 | 2, deg, seg: [anchor, cl.q], screenEnd: end,
      cursorDist: Math.hypot(end[0] - cursor[0], end[1] - cursor[1]),
    });
  }
  return out.sort((a, b) => a.deg - b.deg);
}

export interface AxisChoice {
  pick: AxisCand | null;
  /** 모호 구간에 들어갔는가 — 화면에 짧게 표시한다(사람 지시 3-f). */
  ambiguous: boolean;
  /** 모호 구간에서 함께 겨룬 후보들(고른 것 포함). 화면에는 **고른 것만** 그린다(3-d). */
  tied: AxisCand[];
}

/**
 * **후보 중 하나를 고른다.**
 *
 * 1등과 2등의 각차가 `ambiguous_deg`보다 크면 **1등이다**(평소 경로 — 이 장치는 안 보인다).
 * 그 안이면 **커서에 가장 가까운 끝점**을 가진 후보다 — 각도로 못 가르는 자리를
 * 커서가 가른다(사람 지시 3-b). 좌우·상하 규칙을 따로 두지 않는다.
 */
export function chooseAxis(cands: AxisCand[], cfg: AxisSnapCfg = {}): AxisChoice {
  const c = { ...SNAP_TOL_AXIS, ...cfg };
  if (!cands.length) return { pick: null, ambiguous: false, tied: [] };
  const best = cands[0];
  const tied = cands.filter(x => x.deg - best.deg <= c.ambiguous_deg);
  if (tied.length < 2) return { pick: best, ambiguous: false, tied: [best] };
  let pick = tied[0];
  for (const x of tied) if (x.cursorDist < pick.cursorDist) pick = x;
  return { pick, ambiguous: true, tied };
}

/** 후보 계산 + 선택을 한 번에. **앱과 하네스가 이 함수 하나를 부른다**(PITFALLS #17). */
export function snapToAxis(
  anchor: Vec3, dirs: (Vec3 | null)[], anchorScreen: Pt2, cursor: Pt2,
  ctx: SnapCtx2, cfg: AxisSnapCfg = {},
): AxisChoice {
  return chooseAxis(axisCandidates(anchor, dirs, anchorScreen, cursor, ctx), cfg);
}
