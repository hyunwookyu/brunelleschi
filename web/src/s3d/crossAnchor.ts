// **교차 앵커**(2026-08-18 12차 항목 3-a) — 대기 획이 3D 획의 상(투영 선분)을 화면에서
// **가로지르면** 그 교차점이 연결이다.
//
// 실측 배경(사람 보고 — 파일은 저장소에 없다): 실획 파일 1은 13획 전부 스냅 기록 0건이라
// D-L83이 전부 막았고(의도대로), 3D가 하나도 안 섰다. 스냅(끝점 겨냥)에만 의존하면
// **겨냥이 조리개 밖인 사용자에게 도구가 멈춘다** — 교차는 끝점을 겨냥하지 않아도 생기는
// 연결이고, SketchUp의 추론도 교차를 1급으로 둔다(A-3 선례).
//
// **D-L83과 어긋나지 않는다**: 배제된 것은 `on_edge`·`on_face`(선·면 위 **미끄러지는** 점 —
// 좌표를 안 정한다)이고, 교차는 두 직선이 정하는 **한 점**이다(`intersection`은 정밀 다섯
// 안이다, snap.ts SNAP_ORDER). 좌표는 연결이 정한다 — 교차가 그 연결이다.
//
// ```
// 대기 획의 대표 현 × 3D 선분의 투영 → 화면 교차점 X₂ (둘 다 선분 안 · 연장 여유는
//   오스냅과 같은 값 SNAP_TOL.extend_ratio, #17)
// X₂의 광선 × 그 3D 선분 → 앵커 q (선분 안 · 카메라 앞)
// 획의 3D = q를 지나는 축 직선 위에서 양 끝 광선의 최근접점 (endFromCursor 그대로)
// ```
//
// ⚠⚠ **아래 재투영 검사는 검증이 아니라 수치 항등 가드다**(#5 유형 3 — 12차 3차 리뷰어
// [1]이 잡았다): X₂가 그 선분의 상 위에 있으면 광선(X₂)은 그 선분의 해석 평면 안에
// 있으므로 광선과 3D 직선이 실제로 만나고, 교점의 재투영은 **정의상 X₂다**. 그러므로
// 이 검사는 가림 교차(화면에서만 만나는 두 획 — #23, 합성 상자 3/27)를 **원리적으로 못
// 거른다** — 좌표 변환 오류·퇴화만 잡는다. 가림 교차의 실질 완화는 **얕은 교차 거름
// 하나**뿐이고, 그 위험의 측정·잔차 검증 팔은 DEFERRED다.
//
// ⚠ **얕은 교차는 받지 않는다** — 두 선이 거의 나란하면 교점의 조건수가 나빠 앵커가
// 화면 오차에 크게 흔들린다. 임계는 새로 만들지 않고 `HORIZON_TOL.min_slope_deg`(지평선
// 교점 발산 판정 — 같은 취지의 같은 양)를 그대로 쓴다(#17).
import { closestPoints, rayThrough, project, sub3, norm3, type Vec3 } from "./geom3d.js";
import { lineIntersect, type Pt2 } from "./camera.js";
import { SNAP_TOL } from "./snap.js";
import { HORIZON_TOL } from "./horizon.js";

export interface CrossSeg { id: string; a: Vec3; b: Vec3 }

export interface CrossHit {
  /** 앵커(시점 좌표) — 3D 선분 위의 점. */
  atV: Vec3;
  /** 화면 교차점. */
  at2: Pt2;
  /** 교차 상대(3D 획)의 id. */
  ofId: string;
}

/**
 * 대기 획의 현(a2→b2)과 3D 선분들의 투영 사이 **화면 교차**를 찾아 3D 앵커를 낸다.
 * 여럿이면 **현의 시작점에 가장 가까운 것** — 시작점 앵커 편향과 같은 결정 규칙이다.
 * 없으면 `null` — 그 획은 계속 대기다(§9.1).
 */
export function crossAnchorOf(
  a2: Pt2, b2: Pt2, segs: CrossSeg[],
  ctx: { principal: Pt2; f: number }, tolPx: number,
): CrossHit | null {
  const ext = SNAP_TOL.extend_ratio;
  const minSin = Math.sin((HORIZON_TOL.min_slope_deg * Math.PI) / 180);
  const cd: Pt2 = [b2[0] - a2[0], b2[1] - a2[1]];
  const cl = Math.hypot(cd[0], cd[1]);
  if (cl < 1e-9) return null;
  let best: { hit: CrossHit; dStart: number } | null = null;
  for (const s of segs) {
    const pa = project(s.a, ctx.principal, ctx.f);
    const pb = project(s.b, ctx.principal, ctx.f);
    if (!pa || !pb) continue;
    const sd: Pt2 = [pb[0] - pa[0], pb[1] - pa[1]];
    const sl = Math.hypot(sd[0], sd[1]);
    if (sl < 1e-9) continue;
    // 얕은 교차 거름 — |sin(두 화면 방향의 각)|
    const cross = Math.abs(cd[0] * sd[1] - cd[1] * sd[0]) / (cl * sl);
    if (cross < minSin) continue;
    const x = lineIntersect(a2, b2, pa, pb);
    if (!x) continue;
    // 둘 다 선분 안(연장 여유는 오스냅 규약 그대로)
    const t = ((x[0] - a2[0]) * cd[0] + (x[1] - a2[1]) * cd[1]) / (cl * cl);
    const u = ((x[0] - pa[0]) * sd[0] + (x[1] - pa[1]) * sd[1]) / (sl * sl);
    if (t < -ext || t > 1 + ext || u < -ext || u > 1 + ext) continue;
    // 광선 × 3D 선분 → 앵커. 선분 밖·카메라 뒤·재투영 불일치는 버린다(refAnchorOf 규약)
    const e = sub3(s.b, s.a);
    const L = norm3(e);
    if (L < 1e-9) continue;
    const r = rayThrough(x, ctx.principal, ctx.f);
    const c = closestPoints([0, 0, 0], r, s.a, e);
    if (c.parallel || !Number.isFinite(c.s)) continue;
    if (c.s < -ext * L || c.s > (1 + ext) * L) continue;
    if (!(c.q[2] > 1e-9)) continue;
    const back = project(c.q, ctx.principal, ctx.f);
    if (!back || Math.hypot(back[0] - x[0], back[1] - x[1]) > tolPx) continue;
    const dStart = Math.hypot(x[0] - a2[0], x[1] - a2[1]);
    if (!best || dStart < best.dStart) {
      best = { hit: { atV: c.q, at2: [x[0], x[1]], ofId: s.id }, dStart };
    }
  }
  return best ? best.hit : null;
}
