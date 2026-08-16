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
    // **상태가 안 움직인다** — 답이 오기 전에는 규칙이 아무것도 안 한다.
    // ⚠ 초기 상태는 이제 `[null, null, 화면 수직]`이다(2026-08-17 A-2)
    expect(r.state.slots).toEqual(newRuleState(SZ).slots);
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

  /**
   * ⚠⚠ **계약이 뒤집혔다**(2026-08-17 B). 옛 판은 두 번째 수평 소실점이 화면 가로축 선언을
   * **밀어냈다**(`promoted`, 1점 → 2점). 지시문이 그것을 없앴다: **"되돌리기를 만들지 않는다.
   * 잘못 그었으면 처음부터 다시 그린다."** 화면 가로선을 그은 것은 **1점 투시를 선언한 것**이고
   * 그 뒤의 대각선은 전부 그 하나뿐인 깊이축이다.
   *
   * 이 시험이 그 **회귀 팔**이다 — 대체를 되살리면 여기가 먼저 깨진다.
   */
  it("**회귀** — 화면 가로축 선언은 두 번째 소실점이 **못 밀어낸다**(B)", () => {
    let st = feed([[line([0, 100], [400, 100])], [line([100, 50], [100, 500])]]);
    st = feed([[seg(P0, V1)]], st);
    expect(st.slots[0]).toMatchObject({ kind: "screen" });
    const r = stepRule(st, seg(P0, V2), SZ);
    // ⚠ **2026-08-17 C-2가 이 칸의 사건을 바꿨다**: 1점 투시에서 축을 안 향하는 대각선은
    // **거리점**이고 그것이 시거리를 정한다(7.4). 요점은 그대로다 — **소실점은 안 는다.**
    expect(r.event.type).toBe("distance_point");
    expect(orderOfState(r.state)).toBe(1);
    expect(r.state.slots[0]).toMatchObject({ kind: "screen", dir: "h" });   // **안 밀렸다**
    expect(r.state.distance).toBeGreaterThan(0);
  });
});

describe("d. 세 번째는 **사용자가 그은 기울어진 수직선**에서 나온다 (2026-08-17 A-4)", () => {
  const H = SZ[1] / 2;
  /**
   * ⚠⚠ **이 절의 계약이 뒤집혔다.** 옛 판은 수평 소실점 둘 + 주점 가정에서 V₃를
   * **수심으로 유도**했고(이론서 6.3), 그러면 **지평선 높이가 곧 3점 여부**가 됐다 —
   * 사용자가 2점을 그리는 동안 도구가 피치를 정하는 것이고 그것이 A-4의 결함 보고다.
   *
   * 새 계약: V₃ = **그은 기울어진 수직선 ∩ (x = 이미지 중심)**. 가정은 주점 x 하나뿐이고
   * 나머지는 측정이다. 옛 수심 항등(6.4)은 `horizon.test.ts`가 계속 재현한다
   * (`vpVerticalFromOrthocenter`는 `horizon.ts`에 남는다 — 폐기 코드 규칙).
   */
  const HP = 250;                                       // 지평선(2점에서는 주점 y다)
  const V1: Pt2 = [-600, HP], V2: Pt2 = [1500, HP];
  const seg = (from: Pt2, to: Pt2, t = 0.25): RLine =>
    line(from, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);

  it("화면 세로축이 선언돼 있으면 유도하지 않는다 — 2점 투시가 옳다", () => {
    let st = feed([[line([100, 50], [100, 500])]]);
    st = feed([[seg([300, 640], [V1[0], H])], [seg([300, 640], [V2[0], H])]], st);
    expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
    expect(orderOfState(st)).toBe(2);
  });

  /**
   * **회귀 팔**(A-4). 옛 코드를 되살리면 이 시험이 실제로 깨진다 — 고치기 전 상태에서
   * 이 입력이 `{kind:"vp", source:"orthocenter"}`를 냈다.
   */
  it("**회귀** — 선언이 없으면 유도하지 않는다. 지평선이 어디 있든 수직축은 화면 수직이다", () => {
    for (const h of [SZ[1] / 2, HP, 480]) {
      let st = newRuleState(SZ);
      st.slots[0] = { kind: "vp", at: [V1[0], h], source: "horizon_x_line", support: 2 };
      st.slots[1] = { kind: "vp", at: [V2[0], h], source: "horizon_x_line", support: 1 };
      st.horizon = h;
      st = deriveVertical(st, SZ);
      expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
      expect(orderOfState(st)).toBe(2);
    }
  });

  /** **양성 채널**(#30) — 위가 "3점이 아무 데서도 안 선다"면 판정이 아니다. */
  it("**양성** — 기울어진 수직선을 답하면 그 선에서 V₃가 나온다 (측정이다)", () => {
    let st = newRuleState(SZ);
    st.slots[0] = { kind: "vp", at: V1, source: "horizon_x_line", support: 2 };
    st.slots[1] = { kind: "vp", at: V2, source: "horizon_x_line", support: 1 };
    st.horizon = HP;
    // 화면 수직에서 **13.7° 기운** 선. ⚠ 각을 아무렇게나 못 고른다:
    // ① `depth`(≥8°)여야 **선 하나로** 3점을 선언한다 — 4~8°는 손 오차 대역이라 안 받는다
    // ② 소실점 삼각형이 **예각**이어야 카메라가 성립하고(6.5), V₁·V₂가 2100px 벌어져 있으면
    //    V₃는 지평선에서 **1050px 넘게** 떨어져야 한다((V₁−V₃)·(V₂−V₃) > 0).
    const a: Pt2 = [700, 550], b: Pt2 = [612, 910];
    st.verticalLines.push(line(a, b));
    st = deriveVertical(st, SZ);
    expect(st.slots[2]).toMatchObject({ kind: "vp", source: "tilted_vertical" });
    const v3 = (st.slots[2] as { at: Pt2 }).at;
    expect(v3[0]).toBeCloseTo(SZ[0] / 2, 6);            // 주점 x = 이미지 중심 가정(16.2)
    // **그은 선 위에 있다** — 유도가 아니라 그 선에서 읽은 값이다
    const dist = Math.abs((v3[0] - a[0]) * (b[1] - a[1]) - (v3[1] - a[1]) * (b[0] - a[0]))
               / Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(dist).toBeLessThan(1e-6);
    // 3점 카메라가 실제로 선다 — 주점은 **수심**이고 f는 6.3에서 나온다
    const three = recoverCamera(vpsOf(st), SZ);
    expect(three.ok).toBe(true);
    expect(three.fSource).toBe("orthocenter(6.3)");
    // 세 축이 서로 직교한다 — 카메라가 실제로 성립한다는 뜻이다(6.3·6.5)
    const P = three.principalPoint!, f = three.f!;
    const [d1, d2, d3] = vpsOf(st).map(v => unit3(axisDirection(v!, P, f)));
    for (const [u, v] of [[d1, d2], [d2, d3], [d1, d3]] as [Vec3, Vec3][]) {
      expect(Math.abs(angleBetween(u, v) - 90)).toBeLessThan(1e-6);
    }
    expect(cross3(d1, d2).length).toBe(3);              // 사용한다 — 죽은 import를 안 남긴다
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

  // **양성 채널**(#30) — 아무 획이나 축을 받으면 판정이 아니다
  it("어느 축도 안 향하는 획은 미분류다 — 조용히 배정하지 않는다", () => {
    expect(axisOfStroke([[300, 600], [700, 120]], st()).axis).toBe("free");
  });
});
