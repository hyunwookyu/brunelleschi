// **깊이선 거절의 대상**(2026-08-19 15차 항목 2 · D-L100).
//
// 사용자 보고 ②: *"2점 투시에서 축 스냅으로 깊이선을 그었는데 «이 선이 어긋납니다 — 두
// 소실점 어디도 향하지 않습니다»가 뜬다. 회전해 확인해도 실제로는 안 어긋난다."*
//
// 여기서 잠그는 것은 **판정의 대상 집합**이다: 거절문은 "수평 축은 둘뿐입니다"라고 말하면서
// **수평 둘만** 봤다. 3점 구도에서 수직축은 유한 소실점이고, 그 소실점이 가까우면 그쪽으로
// 그은 선이 `screen_v` 임계(4°) 밖이라 `depth`로 분류된다 — 그러면 셋째 소실점을 **안 세고**
// "어느 쪽도 향하지 않는다"고 말한다. 2D 방향 스냅(`vpDirSnap`)은 이미 소실점 **셋 전부**를
// 후보로 보므로(그 함수의 `i < 3` 루프) 스냅과 판정이 서로 다른 집합을 보고 있었다(#17).
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #17 스냅과 판정이 **같은 집합**을 본다 — 이 항목이 고치는 바로 그 어긋남
//   #24 단위를 고치는 것과 임계를 무르는 것은 다르다 — 여기는 **대상 집합**을 고친다
//       (임계 `AXIS_TOL.vp_dist_ratio`는 그대로다)
//   #30 되살림: 수직 슬롯을 `screen`으로 두면 옛 거동(거절)이 그대로 난다
//   #32 "전부 통과"로 안 넓힌다 — 어느 소실점도 안 향하는 선은 **여전히 거절**한다(반례)
//   #40 도달 가능성: 되살림 팔이 실제로 거절을 낸다
import { describe, it, expect } from "vitest";
import { drawnHorizon } from "./ruleState.js";
import { stepRule, newRuleState, type RuleState, type RLine } from "../src/s3d/vpRules.js";

const SZ: [number, number] = [1280, 675];

/** 3점 상태 — 수평 둘과 **가까운 수직 소실점**. 가까워야 그쪽 선이 `depth`로 분류된다. */
function threePoint(vertical: [number, number] | null): RuleState {
  const st = drawnHorizon(SZ);
  st.slots[0] = { kind: "vp", at: [2100, 300], source: "two_lines", support: 2 };
  st.slots[1] = { kind: "vp", at: [-800, 300], source: "horizon_x_line", support: 2 };
  st.slots[2] = vertical
    ? { kind: "vp", at: vertical, source: "tilted_vertical", support: 2 }
    : { kind: "screen", dir: "v", support: 1 };
  st.horizon = 300;
  return st;
}

/** `a`에서 `to`를 향해 길이 `L`로 뻗은 선. */
const toward = (a: [number, number], to: [number, number], L: number): RLine => {
  const u = [to[0] - a[0], to[1] - a[1]];
  const n = Math.hypot(u[0], u[1]);
  return { a, b: [a[0] + (u[0] / n) * L, a[1] + (u[1] / n) * L] };
};

describe("깊이선 거절의 대상 (D-L100)", () => {
  // 수직 소실점을 **주점 근처**에 둔다 — 그쪽으로 그은 선이 화면 수직에서 크게 벗어난다
  const V2: [number, number] = [900, 900];
  const A: [number, number] = [400, 500];

  it("**되살림 팔** — 수직 슬롯이 무한원이면 그쪽 선은 거절된다(옛 거동)", () => {
    const st = threePoint(null);
    const r = stepRule(st, toward(A, V2, 260), SZ);
    expect(r.event.type).toBe("rejected");                       // 도달 가능성(#40)
    if (r.event.type === "rejected") expect(r.event.notify).toBe(true);
  });

  it("수직 소실점이 유한하면 그쪽 선은 **그 축의 지지선**이다", () => {
    const st = threePoint(V2);
    const r = stepRule(st, toward(A, V2, 260), SZ);
    expect(r.event.type).toBe("support");
    if (r.event.type === "support") expect(r.event.axis).toBe(2);
    expect((r.state.slots[2] as { support: number }).support).toBe(3);
  });

  it("**반례** — 어느 소실점도 안 향하는 선은 여전히 거절된다", () => {
    const st = threePoint(V2);
    // 세 소실점 어느 쪽도 아닌 방향(아래쪽 왼쪽)
    const r = stepRule(st, toward(A, [100, 660], 260), SZ);
    expect(r.event.type).toBe("rejected");
    if (r.event.type === "rejected") {
      expect(r.event.notify).toBe(true);
      expect(r.event.why).toContain("어디도 향하지 않습니다");
    }
  });

  it("**반례** — 수평 소실점을 향한 선은 종전대로 그 축의 지지선이다(순서가 안 바뀐다)", () => {
    const st = threePoint(V2);
    const r = stepRule(st, toward(A, [2100, 300], 260), SZ);
    expect(r.event.type).toBe("support");
    if (r.event.type === "support") expect(r.event.axis).toBe(0);
  });

  it("**반례** — 화면 수직선은 여전히 `screen_v` 갈래다(깊이선 갈래로 안 샌다)", () => {
    const st = threePoint(V2);
    const r = stepRule(st, { a: A, b: [A[0], A[1] - 260] }, SZ);
    // 수직 슬롯이 유한 소실점이므로 화면 수직선은 그 축이 아니다 — 거절이되 알림은 없다
    expect(r.event.type).toBe("rejected");
    if (r.event.type === "rejected") {
      expect(r.event.why).toContain("수직축은 이미 유한 소실점입니다");
      expect(r.event.notify).toBeFalsy();
    }
  });
});
