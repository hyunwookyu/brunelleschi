// **규칙 기반 소실점 확정** — 단위 시험과 **반례**(2026-08-16 전면 교체).
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5(자기참조 유형 3 — 유도된 V₃는 **측정이 아니라 항등**이다. 그 사실을 시험이 명시한다)
//   #23(계획서 문장이 기하적으로 성립하는가 — 규칙 c의 "선 하나면 된다"를 실제로 확인한다)
//   #30(양성 채널 — 규칙이 **안 받는 것**도 함께 확인한다. 다 받으면 판정이 아니다)
//   #37(이론서를 먼저 본다 — 6.3 수심 · 6.4 항등식 · 2.2 무한원 · 3.1 지평선)
import { describe, it, expect } from "vitest";
import {
  classifyLine, sepDeg, stepRule, newRuleState, deriveVertical, vpsOf, axisDirsOf,
  orderOfState, axisOfStroke, RULE_TOL, type RuleState, type RLine,
} from "../src/s3d/vpRules.js";
import { recoverCamera, type Pt2 } from "../src/s3d/camera.js";
import { cross3, unit3, axisDirection, angleBetween, type Vec3 } from "../src/s3d/geom3d.js";

const SZ: [number, number] = [960, 672];
const line = (a: Pt2, b: Pt2): RLine => ({ a, b });

/** 규칙에 선들을 차례로 넣는다 — 앱의 `feedStroke`와 같은 순서다. */
function feed(ls: [RLine, ("screen" | "depth" | "vertical")?][], st = newRuleState(SZ)): RuleState {
  for (const [l, f] of ls) st = stepRule(st, l, SZ, f).state;
  return st;
}

describe("유일한 판단 — 깊이인가 화면 가로세로인가", () => {
  it("화면 수평·수직은 축 자체다", () => {
    expect(classifyLine([0, 100], [400, 100]).kind).toBe("screen_h");
    expect(classifyLine([100, 0], [100, 400]).kind).toBe("screen_v");
    // 임계 안의 기울기도 축이다 — 손으로 그은 수평선이 여기 든다
    expect(classifyLine([0, 100], [400, 100 + 400 * Math.tan(3 * Math.PI / 180)]).kind).toBe("screen_h");
  });

  it("임계 밖은 깊이선이다", () => {
    expect(classifyLine([0, 0], [400, 300]).kind).toBe("depth");
    expect(classifyLine([0, 300], [400, 0]).kind).toBe("depth");
  });

  // **양성 채널**(#30) — 다 받으면 판정이 아니다. 사이 구간은 **애매**로 떨어져야 한다
  it("두 임계 사이는 애매다 — 추정하지 않고 묻는다", () => {
    const mid = (RULE_TOL.screen_axis_deg + RULE_TOL.depth_min_deg) / 2;
    const t = Math.tan((mid * Math.PI) / 180);
    expect(classifyLine([0, 100], [400, 100 + 400 * t]).kind).toBe("ambiguous");
    const r = stepRule(newRuleState(SZ), line([0, 100], [400, 100 + 400 * t]), SZ);
    expect(r.event.type).toBe("ask");
    // **상태가 안 움직인다** — 답이 오기 전에는 규칙이 아무것도 안 한다
    expect(r.state.slots).toEqual([null, null, null]);
  });

  it("각차는 0~90에 든다", () => {
    expect(sepDeg(line([0, 0], [10, 0]), line([0, 0], [0, 10]))).toBeCloseTo(90, 6);
    expect(sepDeg(line([0, 0], [10, 0]), line([5, 5], [-5, 5]))).toBeCloseTo(0, 6);
  });
});

describe("a. 화면 가로세로 선은 축 자체다 (이론서 2.2)", () => {
  it("가로는 수평 슬롯, 세로는 수직 슬롯에 들어간다 — 소실점이 없다", () => {
    const st = feed([[line([0, 100], [400, 100])], [line([100, 0], [100, 400])]]);
    expect(st.slots[0]).toMatchObject({ kind: "screen", dir: "h" });
    expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
    expect(vpsOf(st)).toEqual([null, null, null]);
    expect(orderOfState(st)).toBe(0);
  });

  it("같은 방향을 또 그으면 지지 수만 는다 — 축은 안 바뀐다", () => {
    const st = feed([[line([0, 100], [400, 100])], [line([0, 300], [400, 302])]]);
    expect(st.slots[0]).toMatchObject({ kind: "screen", dir: "h", support: 2 });
    expect(st.slots[1]).toBeNull();
  });

  it("무한원 축의 3D 방향은 화면 방향 그대로다 (c=0)", () => {
    const st = feed([[line([0, 100], [400, 100])], [line([100, 0], [100, 400])]]);
    const d = axisDirsOf(st, [480, 336], 1000);
    expect(d[0]).toEqual([1, 0, 0]);
    expect(d[2]).toEqual([0, 1, 0]);
  });
});

describe("b. 깊이선 **하나** × 지평선 = 소실점 (1점 투시)", () => {
  const H = SZ[1] / 2;                                  // 기본 지평선 = 피치 0
  const V: Pt2 = [700, H];
  const toward = (from: Pt2): RLine =>
    line(from, [from[0] + (V[0] - from[0]) * 0.4, from[1] + (V[1] - from[1]) * 0.4]);

  it("지평선은 처음부터 있다 — 소실점이 정하는 것이 아니다", () => {
    expect(newRuleState(SZ).horizon).toBeCloseTo(H, 9);
  });

  it("깊이선 **하나**로 확정된다", () => {
    const r = stepRule(newRuleState(SZ), toward([200, 600]), SZ);
    expect(r.event.type).toBe("vp_fixed");
    const vp = (r.state.slots[0] as { at: Pt2 }).at;
    expect(vp[0]).toBeCloseTo(V[0], 4);
    expect(vp[1]).toBeCloseTo(H, 9);                    // **지평선 위에 정확히 놓인다**
    expect(orderOfState(r.state)).toBe(1);
  });

  /**
   * **두 선이 나란해져 교점이 날아가는 실패가 없어졌다**(사람 지시 2-b).
   * 옛 규칙은 깊이선 둘의 교점이라 각차가 작으면 소실점이 폭주했다.
   * 지금은 교점의 한 쪽(지평선)이 **오차 없이 정확**하다.
   */
  it("나란한 두 선을 그어도 각각 제 소실점을 낸다 — 옛 실패 모드가 없다", () => {
    let st = newRuleState(SZ);
    const a = stepRule(st, toward([200, 600]), SZ);
    st = a.state;
    // 거의 같은 방향의 두 번째 선 — 옛 규칙에서는 이 쌍이 교점을 못 냈다
    const b = stepRule(st, toward([205, 604]), SZ);
    expect(b.event.type).toBe("support");               // 같은 축을 향한 지지선이다
    expect(orderOfState(b.state)).toBe(1);
    expect((b.state.slots[0] as { at: Pt2 }).at[1]).toBeCloseTo(H, 9);
  });

  it("지평선과 거의 나란한 선은 안 받는다 — 교점이 발산한다", () => {
    const r = stepRule(newRuleState(SZ), line([200, 500], [800, 498]), SZ, "depth");
    expect(r.event.type).toBe("rejected");
  });

  it("화면 가로축이 이미 있으면 소실점은 다른 슬롯으로 간다", () => {
    const st = feed([[line([0, 100], [400, 100])], [toward([200, 600])]]);
    expect(st.slots[0]).toMatchObject({ kind: "screen" });
    expect(st.slots[1]).toMatchObject({ kind: "vp" });
  });
});

describe("c. 두 번째 소실점도 같은 지평선 위다", () => {
  const H = SZ[1] / 2;
  const V1: Pt2 = [-600, H], V2: Pt2 = [1500, H];
  const seg = (from: Pt2, to: Pt2, t = 0.25): RLine =>
    line(from, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);

  // ⚠ **시작점을 지평선에서 충분히 떨어뜨린다** — 가까우면 선이 얕아져 `screen_h` 임계에
  // 걸리고 `ask`가 뜬다(실제로 걸렸다). 지평선이 화면 중앙으로 내려온 결과다.
  const P0: Pt2 = [300, 640];
  const base = (): RuleState => feed([
    [line([100, 50], [100, 500])],                      // 화면 세로 → 수직축
    [seg(P0, V1)],                                      // 깊이선 하나 → V1
  ]);

  it("선 하나로 2점이 된다", () => {
    const st0 = base();
    expect(orderOfState(st0)).toBe(1);
    const r = stepRule(st0, seg(P0, V2), SZ);
    expect(r.event.type).toBe("vp_fixed");
    const v2 = (r.state.slots[1] as { at: Pt2 }).at;
    expect(v2[0]).toBeCloseTo(V2[0], 4);
    expect(v2[1]).toBeCloseTo(H, 9);
    expect(orderOfState(r.state)).toBe(2);
  });

  it("같은 축을 향한 선은 지지선이다 — 소실점은 잠겨 있다", () => {
    const st0 = base();
    const before = (st0.slots[0] as { at: Pt2 }).at.slice();
    const r = stepRule(st0, seg([700, 650], V1), SZ);
    expect(r.event.type).toBe("support");
    expect((r.state.slots[0] as { at: Pt2 }).at).toEqual(before);
    expect(r.state.slots[1]).toBeNull();
  });

  it("화면 가로축 선언은 두 번째 소실점이 **대체한다** — 차수 승격이다", () => {
    let st = feed([[line([0, 100], [400, 100])], [line([100, 50], [100, 500])]]);
    st = feed([[seg(P0, V1)]], st);
    expect(st.slots[0]).toMatchObject({ kind: "screen" });
    const r = stepRule(st, seg(P0, V2), SZ);
    expect(r.event.type).toBe("promoted");
    expect(orderOfState(r.state)).toBe(2);
  });
});

describe("d. 세 번째는 수심 조건으로 **유도된다** (이론서 6.3)", () => {
  const H = SZ[1] / 2;
  /**
   * ⚠ **유도는 지평선이 주점 높이면 `null`이다 — 그것이 옳다**(이론서 2.2).
   * `P_y = h`는 **피치 0**이고 그때 수직축은 화면 평행(무한원)이라 소실점이 없다.
   * 기본 지평선이 화면 중앙(피치 0)이므로 **초기 스케치는 1점·2점뿐이고 3점은 궤도 뒤다**
   * (사람 지시 2-d: 지평선 위치는 카메라 피치가 정하고 궤도로 바뀐다).
   * 아래 둘은 **피치가 걸린 카메라**를 흉내 내려고 지평선을 옮겨 둔다.
   */
  const HP = 250;                                       // 피치가 걸린 지평선
  const V1: Pt2 = [-600, HP], V2: Pt2 = [1500, HP];
  const seg = (from: Pt2, to: Pt2, t = 0.25): RLine =>
    line(from, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);

  it("화면 세로축이 선언돼 있으면 유도하지 않는다 — 2점 투시가 옳다", () => {
    let st = feed([[line([100, 50], [100, 500])]]);
    st = feed([[seg([300, 640], [V1[0], H])], [seg([300, 640], [V2[0], H])]], st);
    expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
    expect(orderOfState(st)).toBe(2);
  });

  it("선언이 없으면 두 수평 소실점에서 유도한다 (피치가 걸린 카메라)", () => {
    let st = newRuleState(SZ);
    st.slots[0] = { kind: "vp", at: V1, source: "horizon_x_line", support: 2 };
    st.horizon = HP;
    st.slots[1] = { kind: "vp", at: V2, source: "horizon_x_line", support: 1 };
    st = deriveVertical(st, SZ);
    expect(st.slots[2]).toMatchObject({ kind: "vp", source: "orthocenter" });
  });

  /**
   * ⚠⚠ **이것은 측정이 아니라 항등이다**(PITFALLS #5 자기참조 유형 3 · 이론서 6.4).
   *
   * 유도된 V₃는 "두 소실점 + 주점 가정"의 **귀결**이므로, 그것을 넣어 f를 다시 내면
   * 2점 해와 **같은 값**이 나온다. 그러므로 **임계를 걸지 않고 항등임을 적는다** —
   * 이 시험이 확인하는 것은 정확도가 아니라 **우리 구현이 그 항등을 지킨다**는 것뿐이다.
   * (자유도가 이미 주점 가정에서 소진됐다. 새 정보가 아니다.)
   */
  it("유도된 V₃로 낸 f는 두 소실점 해와 항등으로 같다 (**설계 보장** — 측정이 아니다)", () => {
    let st = newRuleState(SZ);
    st.slots[0] = { kind: "vp", at: V1, source: "horizon_x_line", support: 2 };
    st.horizon = HP;
    st.slots[1] = { kind: "vp", at: V2, source: "horizon_x_line", support: 1 };
    const two = recoverCamera([V1, V2, null], SZ);
    st = deriveVertical(st, SZ);
    const three = recoverCamera(vpsOf(st), SZ);
    expect(three.ok).toBe(true);
    expect(three.f!).toBeCloseTo(two.f!, 6);
    // 축 방향도 같은 것을 가리킨다 — 유도값은 `d₁ × d₂`의 상이다
    const P = two.principalPoint!, f = two.f!;
    const d1 = unit3(axisDirection(V1, P, f)), d2 = unit3(axisDirection(V2, P, f));
    const d3 = axisDirection((st.slots[2] as { at: Pt2 }).at, P, f);
    expect(Math.min(angleBetween(d3, cross3(d1, d2) as Vec3),
                    angleBetween(d3, cross3(d2, d1) as Vec3))).toBeLessThan(1e-6);
  });
});

describe("획 → 축 (규칙이 이미 정해 뒀다)", () => {
  const V1: Pt2 = [-600, 250], V2: Pt2 = [1500, 250];
  const st = (): RuleState => {
    const s = newRuleState(SZ);
    s.slots[0] = { kind: "vp", at: V1, source: "two_lines", support: 2 };
    s.slots[1] = { kind: "vp", at: V2, source: "horizon_x_line", support: 1 };
    s.slots[2] = { kind: "screen", dir: "v", support: 1 };
    s.horizon = 250;
    return s;
  };

  it("화면 세로 획은 선언된 수직축으로", () => {
    expect(axisOfStroke([[300, 200], [301, 500]], st()).axis).toBe(2);
  });

  it("소실점을 향한 획은 그 축으로", () => {
    const towards = (v: Pt2): Pt2[] => [[400, 450], [400 + (v[0] - 400) * 0.2, 450 + (v[1] - 450) * 0.2]];
    expect(axisOfStroke(towards(V1), st()).axis).toBe(0);
    expect(axisOfStroke(towards(V2), st()).axis).toBe(1);
  });

  // **피치 0에서는 수직축이 무한원이다** — 유도가 `null`을 내는 것이 옳다(이론서 2.2).
  // 기본 지평선이 화면 중앙이므로 **초기 스케치는 1점·2점뿐이다**(3점은 궤도 뒤다).
  it("지평선이 주점 높이면 수직 소실점을 안 만든다 (피치 0 = 2점 투시)", () => {
    const H0 = SZ[1] / 2;
    let s0 = newRuleState(SZ);
    s0.slots[0] = { kind: "vp", at: [-600, H0], source: "horizon_x_line", support: 2 };
    s0.slots[1] = { kind: "vp", at: [1500, H0], source: "horizon_x_line", support: 1 };
    s0 = deriveVertical(s0, SZ);
    expect(s0.slots[2]).toBeNull();
  });
  // **양성 채널**(#30) — 아무 획이나 축을 받으면 판정이 아니다
  it("어느 축도 안 향하는 획은 미분류다 — 조용히 배정하지 않는다", () => {
    expect(axisOfStroke([[300, 600], [700, 120]], st()).axis).toBe("free");
  });
});
