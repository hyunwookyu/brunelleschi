// **소실점 방향 스냅**(2026-08-17 4차 지시 2) — 카메라가 서기 전에도 소실점 방향으로 끌린다.
//
// 잠그는 것:
//   ① 임계 안이면 끝점이 a→V 직선 위로 **수직 투영**된다 — 스냅 후 부적합도 0(보장, #5)
//   ② 소실점이 둘이면 **이동량이 작은 쪽**이 이긴다(chooseAxis의 커서 규칙과 같은 갈래)
//   ③ 반례 — 임계(`AXIS_TOL.vp_dist_ratio`, #17: 지지선 판정과 같은 값) 밖은 `null`,
//      시작점이 소실점 위면 `null`(방향이 없다)
//   ④ 긋는 방향과 무관하다 — 축에는 부호가 없다
import { describe, it, expect } from "vitest";
import { vpDirSnap } from "../src/s3d/axisSnap.js";
import { vpMisfit, AXIS_TOL } from "../src/s3d/axis.js";
import type { Pt2 } from "../src/s3d/camera.js";

const VP: Pt2 = [900, 336];

describe("소실점 방향 스냅 (4차 지시 2)", () => {
  it("임계 안이면 a→V 직선 위로 수직 투영되고, 스냅 후 부적합도가 0이다", () => {
    const a: Pt2 = [200, 500];
    // a→VP 방향에서 조금 빗나간 끝점 — misfit이 임계 안이 되게 짧은 오차를 준다
    const b: Pt2 = [480, 438];      // 참 방향의 점 (480, 434.3)에서 y로 ~4px
    const r = vpDirSnap(a, b, [VP, null, null]);
    expect(r).not.toBeNull();
    expect(r!.axis).toBe(0);
    // 스냅된 끝점은 a→VP 직선 위다 — 그 선의 부적합도가 0이다(**보장 확인**, #5 — 임계를 안 건다)
    const len = Math.hypot(r!.at[0] - a[0], r!.at[1] - a[1]);
    expect(vpMisfit({ a, b: r!.at, len, bend: 0 }, VP)).toBeLessThan(1e-12);
    // 수직 투영이다 — 이동 벡터가 축 방향과 직교한다
    const u: Pt2 = [VP[0] - a[0], VP[1] - a[1]];
    const mv: Pt2 = [r!.at[0] - b[0], r!.at[1] - b[1]];
    expect(Math.abs(u[0] * mv[0] + u[1] * mv[1]) / Math.hypot(...u)).toBeLessThan(1e-9);
  });

  it("소실점이 둘이면 이동량이 작은 쪽이 이긴다", () => {
    const a: Pt2 = [480, 500];
    const v1: Pt2 = [60, 336], v2: Pt2 = [900, 336];
    // v2 방향에 더 가깝게 긋는다
    const b: Pt2 = [700, 418];
    const r = vpDirSnap(a, b, [v1, v2, null]);
    expect(r).not.toBeNull();
    expect(r!.axis).toBe(1);
  });

  it("**반례** — 임계 밖은 null이다. 그래야 다른 소실점을 만들 대각선을 그을 수 있다", () => {
    const a: Pt2 = [200, 500];
    // a→VP와 뚜렷이 다른 방향(반대쪽 아래) — misfit이 임계를 넘는다
    const b: Pt2 = [480, 620];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(vpMisfit({ a, b, len, bend: 0 }, VP)).toBeGreaterThan(AXIS_TOL.vp_dist_ratio);
    expect(vpDirSnap(a, b, [VP, null, null])).toBeNull();
  });

  it("**반례** — 시작점이 소실점 위면 null이다(방향이 없다)", () => {
    expect(vpDirSnap(VP, [500, 400], [VP, null, null])).toBeNull();
  });

  it("긋는 방향과 무관하다 — 소실점 반대쪽으로 그어도 같은 축이다", () => {
    const a: Pt2 = [480, 400];
    // a에서 VP 반대 방향(왼쪽 아래)으로 — 직선은 VP를 (뒤로) 지나므로 같은 축이다.
    // 참 반대점은 (200, 442.7) — 작은 겨냥 오차를 더한다
    const away: Pt2 = [200, 444];
    const r = vpDirSnap(a, away, [VP, null, null]);
    expect(r).not.toBeNull();
    expect(r!.axis).toBe(0);
  });
});
