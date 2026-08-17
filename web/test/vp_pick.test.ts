// **점 찍기 확정**(2026-08-17 4차 지시 4-b) — 대기 대각선 위의 한 점을 찍으면 그 자리가
// 첫 소실점이다. 두 선 교점(D-L59)의 자매 경로이고, 선 하나로도 확정할 수 있다.
//
// 잠그는 것:
//   ① 대기 선 위의 점을 찍으면 그 수직 투영이 소실점이고 지평선 = 그 y — 호스트 선의
//      부적합도 0(보장 확인, #5 — 투영의 정의다. 임계를 안 건다)
//   ② 교차점이 근처점보다 우선한다(SNAP_ORDER의 순서 그대로 — 정확한 것이 앞선다)
//   ③ 반례 — 반경 밖 · 대기 선 없음 · 이미 소실점 있음 → null(아무것도 안 바꾼다)
import { describe, it, expect } from "vitest";
import { newRuleState, stepRule, pickVpAt, perspectiveOrder, type RuleState } from "../src/s3d/vpRules.js";
import { vpMisfit } from "../src/s3d/axis.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const TOL = 15;                                  // 앱 조리개 기본값과 같은 자리 — 값은 로컬이다

const withWaiting = (lines: [Pt2, Pt2][]): RuleState => {
  let st = newRuleState(SZ);
  for (const [a, b] of lines) {
    const r = stepRule(st, { a, b }, SZ);
    expect(r.event.type).toBe("waiting");
    st = r.state;
  }
  return st;
};

describe("점 찍기 확정 (4차 지시 4-b)", () => {
  it("대기 선 위의 점을 찍으면 그 자리가 소실점이고 지평선이 그 y다 — 호스트 부적합도 0", () => {
    // 나란한 두 선(교점 발산)이라 짝 경로로는 못 서는 상태 — 점 찍기가 유일한 확정 길이다
    const st = withWaiting([[[100, 600], [500, 480]], [[100, 640], [500, 520]]]);
    const tap: Pt2 = [383, 517];                 // 첫 선 위 근처(수직 거리 ~7px)
    const r = pickVpAt(st, tap, SZ, TOL);
    expect(r).not.toBeNull();
    const vp = r!.at;
    // **호스트 선이 그 소실점을 정확히 향한다**(보장 확인 — 투영의 정의)
    const q = { a: [100, 600] as Pt2, b: [500, 480] as Pt2 };
    const len = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
    expect(vpMisfit({ ...q, len, bend: 0 }, vp)).toBeLessThan(1e-12);
    expect(r!.state.horizon).toBeCloseTo(vp[1], 12);
    expect(r!.state.slots[0]).toMatchObject({ kind: "vp", source: "picked_point" });
    expect(perspectiveOrder(r!.state)).toBe(0);  // 소실점 하나 = NONE(지시 1)
    expect(r!.state.depthLines.length).toBe(0);  // 대기가 비워졌다
  });

  it("교차점이 근처점보다 우선한다 — 끝점 이음도 **찍으면** 소실점이 된다(명시적 확인)", () => {
    // 끝점을 공유한 이음 — 자동 짝(D-L59 ④)에서는 제외되지만, 사용자가 그 자리를 **찍는 것**은
    // 명시적 확인이므로 받는다. 둘 다 대기 상태로 남는 픽스처가 그래서 성립한다
    const st = withWaiting([[[100, 600], [500, 480]], [[500, 480], [300, 300]]]);
    const r = pickVpAt(st, [503, 484], SZ, TOL);
    expect(r).not.toBeNull();
    // 교차점(공유 끝점)이 근처점 후보들보다 앞선다 — 두 선 모두의 부적합도가 0이다
    for (const q of [{ a: [100, 600] as Pt2, b: [500, 480] as Pt2 },
                     { a: [500, 480] as Pt2, b: [300, 300] as Pt2 }]) {
      const len = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      expect(vpMisfit({ ...q, len, bend: 0 }, r!.at)).toBeLessThan(1e-12);
    }
    expect(r!.at[0]).toBeCloseTo(500, 9);
    expect(r!.at[1]).toBeCloseTo(480, 9);
  });

  it("**반례** — 반경 밖은 null이고 상태가 안 바뀐다", () => {
    const st = withWaiting([[[100, 600], [500, 480]]]);
    expect(pickVpAt(st, [300, 300], SZ, TOL)).toBeNull();
    expect(st.slots[0]).toBeNull();
  });

  it("**반례** — 대기 선이 없으면 null", () => {
    expect(pickVpAt(newRuleState(SZ), [300, 300], SZ, TOL)).toBeNull();
  });

  it("**반례** — 소실점이 이미 서 있으면 null(확정 후 잠금, §1)", () => {
    // **셋이 모여야 소실점이다**(6차 지시 11) — 둘까지는 대기다
    let st = withWaiting([[[100, 600], [500, 480]]]);
    st = stepRule(st, { a: [200, 640], b: [700, 500] }, SZ, "depth").state;
    const r = stepRule(st, { a: [150, 620], b: [600, 490] }, SZ, "depth");
    expect(r.event.type).toBe("vp_fixed");
    expect(pickVpAt(r.state, [400, 520], SZ, TOL)).toBeNull();
  });
});
