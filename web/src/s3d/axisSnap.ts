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
import { RULE_TOL, type RuleCfg } from "./vpRules.js";
import { vpMisfit, AXIS_TOL, type Rep } from "./axis.js";

// ---------------------------------------------------------------- 화면 직교 스냅 (A-2)

/**
 * **화면 가로·세로 스냅 — 카메라와 무관하고 첫 획부터 돈다**(2026-08-17 사람 지시 A-2).
 *
 * 화면에 평행한 방향은 소실점이 **무한원**이고(이론서 2.2, c=0), 그 성질은 **어떤 카메라를
 * 나중에 세우든 유지된다.** 롤이 0이므로 화면 수직도 언제나 수직축이다. 즉 여기에는
 * **추정할 것이 없다** — 그런데 옛 판은 카메라가 확정될 때까지 아무 스냅도 안 돌렸다
 * (`frame()`이 `cam.locked`를 요구했다). 그것이 A-1·A-3이 본 증상의 절반이다.
 *
 * **이것이 초기 확정의 정확도를 올린다**: 지평선이 화면 수평이므로 규칙 ⓒ(깊이선 × 지평선)의
 * 교점에서 **한 쪽이 오차 없이 정확**해지고, 손 오차는 깊이선 하나에만 남는다.
 *
 * ⚠ **새 임계를 만들지 않는다**(#17) — 각 임계는 `RULE_TOL.screen_axis_deg`(4°)를 그대로 쓴다.
 * 그 값이 곧 "이 획을 화면 축으로 본다"의 정의이므로, 스냅과 판정이 **같은 자리에서 갈린다**:
 * 스냅이 걸린 획은 정확히 0°/90°가 되어 `classifyLine`이 반드시 `screen_h`·`screen_v`를 낸다.
 *
 * ⚠ **축 스냅(라이노 직교 모드)과 달리 임계가 있다.** 축 스냅은 "언제나 어느 축으로 간다"인데
 * 여기서 그러면 **깊이선을 못 긋는다**(45° 획이 가로나 세로로 끌려간다). 화면 축 둘만으로는
 * 평면을 못 덮으므로 임계 밖은 **그대로 둔다**.
 *
 * 커서는 **그 축 위로 수직 투영**된다(Rhino·SketchUp 직교 모드 그대로, A-3).
 */
export interface ScreenOrtho { dir: "h" | "v"; at: Pt2; deg: number }

export function screenOrthoSnap(a: Pt2, b: Pt2, cfg: RuleCfg = {}): ScreenOrtho | null {
  const c = { ...RULE_TOL, ...cfg };
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const toH = (Math.asin(Math.min(1, Math.abs(dy) / L)) * 180) / Math.PI;
  const toV = 90 - toH;
  if (toH <= c.screen_axis_deg) return { dir: "h", at: [b[0], a[1]], deg: toH };
  if (toV <= c.screen_axis_deg) return { dir: "v", at: [a[0], b[1]], deg: toV };
  return null;
}

// ---------------------------------------------------------------- 소실점 방향 스냅 (4차 지시 2)

/**
 * **소실점 방향 스냅 — 카메라가 서기 전에도 돈다**(2026-08-17 4차 지시 2).
 *
 * 소실점이 하나 잡혔으면 그 점을 향하는 방향은 이미 정해진 것이다. 소실점을 지나는 화면
 * 직선은 그 축에 평행한 3D 직선의 상이므로(이론서 2장) **f가 없어도 화면에서 성립한다** —
 * 그런데 축 스냅(`snapToAxis`)은 3D 앵커와 f를 요구해 카메라가 안 서면 통째로 안 돌았다.
 * 공간이 생기면 이 선들이 평행선이 된다 — 나중에 축이 될 것을 미리 스냅하는 것이고 손해가 없다.
 *
 * ```
 * 시작점 a → 소실점 V 를 잇는 직선에 끝점 b를 수직 투영한다 (직교 스냅과 같은 규약)
 * "향한다"의 판정 = vpMisfit ≤ AXIS_TOL.vp_dist_ratio (지지선 판정과 같은 값, #17)
 * 소실점이 여럿이면 각각 후보 — 투영 이동량이 가장 작은 것이 이긴다 (chooseAxis의 커서 규칙)
 * ```
 *
 * ⚠ **축 스냅과 달리 임계가 있다**(화면 직교 스냅과 같은 이유): 여기서 "언제나 어느
 * 소실점으로" 가면 두 번째 소실점을 만들 대각선을 못 긋는다. 임계 밖은 그대로 둔다.
 */
export interface VpDirSnap {
  axis: 0 | 1 | 2;
  /** 끝점의 스냅 위치 — a→V 직선 위로의 수직 투영. */
  at: Pt2;
  vp: Pt2;
  /** 겨냥 부적합도(수직거리 ÷ 길이) — 스냅 **전**의 값이다(스냅 후는 정의상 0, #5). */
  misfit: number;
}

export function vpDirSnap(
  a: Pt2, b: Pt2, vps: (Pt2 | null)[], cfg: { vp_dist_ratio?: number } = {},
): VpDirSnap | null {
  const tol = cfg.vp_dist_ratio ?? AXIS_TOL.vp_dist_ratio;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return null;
  const rep: Rep = { a, b, len, bend: 0 };
  let best: VpDirSnap | null = null;
  let bestMove = Infinity;
  for (let i = 0; i < vps.length && i < 3; i++) {
    const v = vps[i];
    if (!v) continue;
    const dx = v[0] - a[0], dy = v[1] - a[1];
    const D = Math.hypot(dx, dy);
    if (D < 1e-6) continue;                       // 시작점이 소실점 위다 — 방향이 없다
    const m = vpMisfit(rep, v);
    if (m > tol) continue;
    const t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (D * D);
    const at: Pt2 = [a[0] + t * dx, a[1] + t * dy];
    const move = Math.hypot(at[0] - b[0], at[1] - b[1]);
    if (move < bestMove) { bestMove = move; best = { axis: i as 0 | 1 | 2, at, vp: v, misfit: m }; }
  }
  return best;
}

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
