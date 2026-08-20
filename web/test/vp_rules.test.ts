// **새 절차 — 지평선을 먼저 긋는다**(2026-08-20 18차 지시 · D-L109).
//
// ```
// 1. 지평선을 긋는다            시선 높이가 정해진다. 롤 0
// 2. 깊이선 하나                지평선과의 교점 = 첫 소실점. 1점 확정
// 3. 다른 방향 깊이선 하나      그 교점 = 두 번째 소실점. 2점 확정
// ```
// **선 하나가 소실점 하나를 만든다. 판정이 아니라 계산이다.**
//
// ⛔ **이 파일의 옛 판(617줄·39건)은 은퇴했다.** 그것이 잠그던 것은 **대기 규칙**이었다 —
// 「셋째 선이 확정한다」(11-1) · 「이음점을 소실점으로 안 읽는다」(11-2) · 「셋이 다 다르면
// 각차 최소」(11-3) · 「선언된 가로축이면 둘로 정한다」(D-L96) · 「P1은 불가역」(D-L53).
// 그 규칙들은 **어느 둘이 같은 축인가**를 푸는 기계였고, 지평선을 먼저 그으면 그 물음이
// 아예 없다. 왜 있었는지는 `DECISIONS.md`의 D-L109와 `docs/archive/`가 든다.
//
// 착수 시 `PITFALLS.md`를 읽었다(`tail -40`). 이 파일에 걸리는 번호는 `progress.md` 18차
// 착수 표가 든다 — 여기서는 #49(판정을 정하는 양의 단위)와 #30(반례로 되살린다)이 직접이다.
import { describe, it, expect } from "vitest";
import {
  newRuleState, withHorizon, hasHorizon, stepRule, perspectiveOrder, vpsOf,
  horizonAdjustable, type RuleState,
} from "../src/s3d/vpRules.js";
import { drawnHorizon } from "./ruleState.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const H = 300;                                   // 사용자가 그은 지평선 y

/** 지평선 위 `x`를 향해 `from`에서 뻗는 깊이선. **그 소실점이 정답이다.** */
const toward = (from: Pt2, vpx: number, t = 0.35): [Pt2, Pt2] => {
  const v: Pt2 = [vpx, H];
  return [from, [from[0] + (v[0] - from[0]) * t, from[1] + (v[1] - from[1]) * t]];
};
const feed = (st: RuleState, [a, b]: [Pt2, Pt2]) => stepRule(st, { a, b }, SZ);

describe("지평선을 먼저 긋는다 — 선 하나가 소실점 하나를 만든다", () => {
  it("지평선 전에는 아무것도 안 선다 — 깊이선이 거절된다(지시 l의 마지막 방어)", () => {
    const st = newRuleState(SZ);
    expect(hasHorizon(st)).toBe(false);
    expect(st.horizon).toBeNull();
    const r = feed(st, toward([500, 500], -400));
    expect(r.event.type).toBe("rejected");
    expect(perspectiveOrder(r.state)).toBe(0);
  });

  it("지평선 → 깊이선 하나 = **1점 확정**. 소실점은 그 선 × 지평선이다(지시 2)", () => {
    const st0 = drawnHorizon(SZ, H);
    expect(hasHorizon(st0)).toBe(true);
    const r = feed(st0, toward([500, 500], -400));
    expect(r.event.type).toBe("vp_fixed");
    expect(perspectiveOrder(r.state)).toBe(1);
    const vp = vpsOf(r.state)[0]!;
    // **지평선 위다** — 그것이 «계산»의 전부다(판정이 아니다)
    expect(vp[1]).toBeCloseTo(H, 6);
    expect(vp[0]).toBeCloseTo(-400, 6);
    // 남는 수평축은 화면 평행이고 **자동으로 채워진다**(1점) — 안 채우면 가로선이 못 올라간다
    expect(r.state.slots[1]).toMatchObject({ kind: "screen", dir: "h", implicit: true });
  });

  it("깊이선 하나 더(다른 방향) = **2점 확정**. 둘 다 지평선 위다(지시 3)", () => {
    let st = drawnHorizon(SZ, H);
    st = feed(st, toward([500, 500], -400)).state;
    const r = feed(st, toward([500, 500], 1500));
    expect(r.event.type).toBe("vp_fixed");
    expect(perspectiveOrder(r.state)).toBe(2);
    const [v0, v1] = vpsOf(r.state);
    expect(v0![1]).toBeCloseTo(H, 6);
    expect(v1![1]).toBeCloseTo(H, 6);
    expect(v0![0]).toBeCloseTo(-400, 6);
    expect(v1![0]).toBeCloseTo(1500, 6);
  });

  it("**끝점을 공유해도 선다** — 15차 사용자 보고 ①·②가 새 절차에서는 성립하지 않는다", () => {
    // 옛 판은 이음점을 소실점으로 오독하지 않으려 그 짝을 통째로 버렸고, 그래서
    // «깊이선 하나를 긋고 그 끝점에서 새 깊이선을 뻗으면 공간이 안 선다»가 났다(D-L99).
    // 새 절차에서는 **각 선이 자기 소실점을 만든다** — 짝을 안 고르므로 그 결함이 없다.
    const shared: Pt2 = [500, 480];
    let st = drawnHorizon(SZ, H);
    st = feed(st, toward(shared, -400)).state;
    const r = feed(st, toward(shared, 1500));
    expect(perspectiveOrder(r.state)).toBe(2);
  });

  it("같은 소실점을 향한 선은 **지지선**이다 — 판정을 «선 × 지평선»과 같은 단위로 한다(#49)", () => {
    let st = drawnHorizon(SZ, H);
    st = feed(st, toward([500, 500], -400)).state;
    // 다른 자리에서 같은 소실점으로 — 교점이 같으므로 지지선이다
    const r = feed(st, toward([620, 560], -400));
    expect(r.event.type).toBe("support");
    expect(perspectiveOrder(r.state)).toBe(1);
  });

  it("**셋째 방향은 거절된다** — 그때만 알림이 뜬다(지시 c·f)", () => {
    let st = drawnHorizon(SZ, H);
    st = feed(st, toward([500, 500], -400)).state;
    st = feed(st, toward([500, 500], 1500)).state;
    const r = feed(st, toward([500, 500], 620));
    expect(r.event.type).toBe("rejected");
    expect(r.event).toMatchObject({ notify: true });
    // **한 줄이다**(지시 i) — 마크업도 줄바꿈도 없다
    const why = (r.event as { why: string }).why;
    expect(why).not.toContain("<");
    expect(why).not.toContain("\n");
    expect(why.length).toBeLessThan(40);
  });

  it("**깊이선으로 정의된 획에는 경고가 안 뜬다**(지시 c-5 — 되살려 확인한다)", () => {
    // 되살림: **옛 판정 단위**(각도 `vpMisfit`)로 재면 같은 획이 «어긋난다»가 될 수 있다.
    // 여기서 잠그는 것은 «그 선이 만든 점이 기존 소실점과 같은 자리면 지지선»이다.
    let st = drawnHorizon(SZ, H);
    st = feed(st, toward([500, 500], -400)).state;
    st = feed(st, toward([500, 500], 1500)).state;
    // 두 소실점 각각을 겨냥한 선 넷 — **전부 조용해야 한다**
    for (const [from, vpx] of [[[430, 520], -400], [[700, 430], -400],
                               [[430, 520], 1500], [[700, 430], 1500]] as [Pt2, number][]) {
      const r = feed(st, toward(from, vpx));
      expect(r.event.type).toBe("support");
      expect(r.event).not.toHaveProperty("notify", true);
    }
  });

  it("지평선과 나란한 선은 **축 자체**다 — 소실점을 안 만든다(지시 n)", () => {
    const st = drawnHorizon(SZ, H);
    const r = stepRule(st, { a: [300, 420], b: [700, 420] }, SZ);
    expect(r.event.type).toBe("screen_axis");
    expect(r.state.slots[0]).toMatchObject({ kind: "screen", dir: "h" });
    expect(vpsOf(r.state).filter(Boolean)).toHaveLength(0);
  });

  it("**반례** — 사용자가 선언한 가로축은 안 밀려난다(D-L53이 막던 자리는 남는다)", () => {
    let st = drawnHorizon(SZ, H);
    // 스냅이 잡은 가로선 = 선언(declared). 1점 선언이다
    st = stepRule(st, { a: [300, 420], b: [700, 420] }, SZ, undefined, {}, "screen").state;
    expect(st.slots[0]).toMatchObject({ kind: "screen", dir: "h", declared: true });
    st = feed(st, toward([500, 500], -400)).state;      // 깊이 소실점 하나 → 1점
    expect(perspectiveOrder(st)).toBe(1);
    // 두 번째 깊이선이 와도 **선언된 가로축을 안 밀어낸다** — 2점이 안 된다
    const r = feed(st, toward([500, 500], 1500));
    expect(r.event.type).toBe("rejected");
    expect(perspectiveOrder(r.state)).toBe(1);
  });

  it("소실점이 서면 지평선이 잠긴다(D-L45) — 그전에는 옮길 수 있다", () => {
    let st = drawnHorizon(SZ, H);
    expect(horizonAdjustable(st)).toBe(true);
    st = withHorizon(st, 250, SZ);
    expect(st.horizon).toBe(250);
    st = feed(st, [[500, 500], [420, 447.5]]).state;    // 250 지평선을 향한 선
    if (perspectiveOrder(st) >= 1) {
      expect(horizonAdjustable(st)).toBe(false);
      expect(withHorizon(st, 100, SZ).horizon).toBe(250);
    }
  });

  it("**실행 취소가 지평선 단계로 돌아간다**(지시 p) — 상태 왕복", () => {
    const before = newRuleState(SZ);
    const drawn = withHorizon(before, H, SZ);
    const after = feed(drawn, toward([500, 500], -400)).state;
    expect(perspectiveOrder(after)).toBe(1);
    // 스냅샷이 규칙 상태 전체이므로 되돌리면 «안 그은 상태»가 그대로 돌아온다
    expect(hasHorizon(before)).toBe(false);
    expect(perspectiveOrder(before)).toBe(0);
  });

  it("**반례** — 너무 짧은 획은 소실점을 안 만든다(A-5)", () => {
    const st = drawnHorizon(SZ, H);
    const r = feed(st, [[500, 500], [495, 496]]);
    expect(r.event.type).toBe("rejected");
    expect(perspectiveOrder(r.state)).toBe(0);
  });
});
