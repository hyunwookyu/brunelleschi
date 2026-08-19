// **첫 앵커 — 지면 배치**(2026-08-19 13차 항목 2).
//
// 카메라가 서는 순간, 소실점을 만든 보조선들은 **바닥 격자**다(지시 2-a — 이 도구의
// 사용자는 투시를 알고, 소실점을 세우는 선은 지면 격자로 긋는 것이 관행이다). 그 선들을
// 지면(Y=0 평면 — 눈높이 게이지 `EYE_HEIGHT` 아래)에 놓으면 **첫 앵커**가 생기고,
// 이후는 교차 앵커·오스냅 연쇄가 좌표를 잇는다(연쇄 ③·④).
//
// ⚠ **첫 앵커 전용이다** — 3D가 하나라도 있으면 이 경로는 돌지 않는다(D-L84 ③ · 10차
// 항목 1: 확정 뒤의 좌표는 연결이 정한다. 떠 있는 성분의 임의 지면 배치가 바로 그
// 세션이 실측으로 잡아 막은 것이다). 호출부(`solveInto`)가 그 가드를 든다.
//
// 왜 일괄 풀이(liftAll)가 못 놓나: 그 솔버의 접합은 **끝점 근접**(touch 반경 안)을
// 요구하는데, 보조선은 길게 긋고 가운데서 가로지르는 스타일이라 몸통 교차만 남는다 —
// 실획 15-16-18에서 교점 0/몸통 교차 7이 그 실측이다(`first_anchor.json`).
//
// 지면 가정의 뜻: 시선 광선과 지면 평면의 교점이므로 **재투영은 그린 화면점 그대로**다
// (광선 위의 점 — 잉크와 3D가 자기일관). 지평선 위나 카메라 뒤를 향한 끝점은 지면에
// 없으므로 null — **애매하면 놓지 않는다**(A-3).
import { groundFrame, onGround, EYE_HEIGHT, type Vec3 } from "./geom3d.js";
import type { Pt2 } from "./camera.js";
import type { PlaceCtx } from "./stroke.js";

/**
 * 획 하나를 지면에 놓는다 — 양 끝을 시선 광선 × 지면 교점으로. 어느 끝이든 지면에
 * 못 닿으면(지평선 위·카메라 뒤) null.
 *
 * ⚠ 축의 소실점을 쓰지 않는다 — 지면 평면과 광선만 쓴다. 그래서 화면 평행 축(무한원)의
 * 획에도 그대로 선다(1점 투시의 화면 가로선 — 지시 2-b: 축이 정해져 있고 그 평면에서
 * 깊이가 결정된다). 방향이 축과 얼마나 어긋나는지는 스냅(확정 시점의 2D 방향 스냅)이
 * 이미 처리한 뒤다.
 */
export function groundSegment(pts2d: Pt2[], ctx: PlaceCtx): [Vec3, Vec3] | null {
  if (pts2d.length < 2) return null;
  const g = groundFrame(ctx.vps[2] ?? null, ctx.principal, ctx.f, EYE_HEIGHT);
  const a = onGround(pts2d[0], ctx.principal, ctx.f, g);
  const b = onGround(pts2d[pts2d.length - 1], ctx.principal, ctx.f, g);
  if (!a || !b) return null;
  return [a, b];
}

/** 지면 배치의 대상인가 — 수평 평면 축(0·1)만이다. 수직축·미분류는 연결이 정한다. */
export const groundEligible = (axis: unknown): axis is 0 | 1 => axis === 0 || axis === 1;
