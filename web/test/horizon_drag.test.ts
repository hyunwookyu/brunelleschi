// **지평선 끌기**(D-L45) — 규칙과 잠금이 실제로 도는지 잠근다.
//
// 이 항목의 주장은 하나다: **지평선을 중앙에서 옮기면 초기 스케치에서 3점이 선다.**
// 그것과 함께 **옮길 수 없는 상태에서는 안 옮겨진다**(반례)를 같이 건다 —
// 소실점이 선 뒤에 지평선을 옮기면 그 소실점이 자기 지지선에서 떨어지고, 그것이
// D-L32가 실패한 자리다(사후 사영: 배치 2049 → 792).
import { describe, it, expect } from "vitest";
import {
  newRuleState, stepRule, perspectiveOrder, horizonAdjustable, withHorizon, defaultHorizon,
  type RuleState, type RLine,
} from "../src/s3d/vpRules.js";
import { CamState } from "../src/ui/camState.js";
import { vpSlot, rulesOf } from "./ruleFixture.js";

const SZ: [number, number] = [960, 672];
const CENTER = defaultHorizon(SZ);      // 336

/**
 * 깊이선 둘 — **화면 수평과 30°**라 `depth`로 판정되고(≥8°), 화면 수직과는 60°라
 * "두 번째 수평인가 수직인가" 물음(45°)에 안 걸린다. 서로 반대 방향이라 다른 소실점을 만든다.
 */
const DEPTH_A: RLine = { a: [100, 500], b: [400, 327] };
const DEPTH_B: RLine = { a: [860, 500], b: [560, 327] };

function feed(st0: RuleState, lines: RLine[]): RuleState {
  let st = st0;
  for (const l of lines) {
    const r = stepRule(st, l, SZ);
    if (r.event.type !== "ask" && r.event.type !== "rejected") st = r.state;
  }
  return st;
}

describe("지평선 끌기 — 조작 가능성", () => {
  it("소실점이 없으면 끌 수 있고, 값이 실제로 바뀐다", () => {
    const st = newRuleState(SZ);
    expect(horizonAdjustable(st)).toBe(true);
    const moved = withHorizon(st, 200, SZ);
    expect(moved.horizon).toBe(200);
    expect(st.horizon).toBe(CENTER);          // 원본은 안 바뀐다(스냅샷 되돌리기 전제)
  });

  it("**반례** — 유한 소실점이 서면 잠기고 상태가 안 바뀐다", () => {
    const st = rulesOf([vpSlot([620, 200]), null, null], SZ);
    expect(horizonAdjustable(st)).toBe(false);
    const same = withHorizon(st, 400, SZ);
    expect(same).toBe(st);                    // **같은 객체를 낸다** — 조용히 옮기지 않는다
    expect(same.horizon).toBe(200);
  });

  it("화면 밖으로는 안 나간다 — 손잡이가 화면에 있어야 한다", () => {
    const st = newRuleState(SZ);
    expect(withHorizon(st, -50, SZ).horizon).toBe(0);
    expect(withHorizon(st, 9999, SZ).horizon).toBe(SZ[1]);
    expect(withHorizon(st, Number.NaN, SZ)).toBe(st);
  });
});

/**
 * ⚠⚠ **2026-08-17 A-4가 이 절의 계약을 뒤집었다.**
 *
 * 옛 계약: "지평선을 중앙에서 옮기면 **같은 두 깊이선으로 3점이 선다**"(수심 유도가 산다).
 * 그것이 **결함으로 보고됐다** — 사용자는 2점을 그리고 있는데 지평선 높이만으로 도구가
 * "내려다보는 뷰"라고 정해 버리고, 그 결과 **수직 소실점 위쪽에서 축 스냅이 안 걸렸다**.
 *
 * 새 계약: **2점에서 피치 판정은 없다.** 수직축은 화면 수직이고, 3점은 사용자가
 * **기울어진 수직선을 수직축이라고 답할 때만** 선다. 지평선 끌기는 남지만 그 뜻이
 * **주점 y**로 바뀐다(피치 0에서 지평선 = 주점 y가 강제된다, 이론서 3.1).
 *
 * ⚠ **이 시험은 회귀 팔이다** — 옛 동작을 되살리면(=`deriveVertical`이 지평선만으로 발화하면)
 * 아래 첫 시험이 **실제로 깨진다**(A-4를 고치기 전 상태에서 확인했다: 차수 3 · `orthocenter`).
 */
describe("2점에서는 피치를 판정하지 않는다 (2026-08-17 A-4)", () => {
  it("지평선이 중앙이면 2점이고 수직축은 화면 수직이다", () => {
    const st = feed(newRuleState(SZ), [DEPTH_A, DEPTH_B]);
    expect(st.horizon).toBe(CENTER);
    expect(perspectiveOrder(st)).toBe(2);
    expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
  });

  it("**회귀** — 지평선을 올려도 3점이 안 된다. 같은 두 획이면 같은 2점이다", () => {
    const st = feed(withHorizon(newRuleState(SZ), 200, SZ), [DEPTH_A, DEPTH_B]);
    expect(st.horizon).toBe(200);
    expect(perspectiveOrder(st)).toBe(2);
    expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
  });

  /**
   * **양성 채널**(#30) — 위 둘이 "3점이 아무 데서도 안 선다"는 뜻이면 판정이 아니다.
   * 3점은 **사용자가 기울어진 수직선을 수직축이라 답할 때** 실제로 선다.
   */
  it("**양성** — 기울어진 수직선을 수직축이라 답하면 3점이 선다", () => {
    let st = feed(withHorizon(newRuleState(SZ), 200, SZ), [DEPTH_A, DEPTH_B]);
    // 화면 수직에서 **20.1° 기운 선** — 올려다보는 구도의 세로 모서리.
    // ⚠ ① `depth`(≥8°)여야 선 하나로 3점을 선언한다(4~8°는 손 오차 대역이다)
    //    ② 소실점 삼각형이 **예각**이어야 한다(6.5) — V₁·V₂가 280px이므로 V₃는 지평선에서 140px 밖
    const r = stepRule(st, { a: [700, 300], b: [590, 600] }, SZ, "vertical");
    st = r.state;
    expect(perspectiveOrder(st)).toBe(3);
    const s2 = st.slots[2];
    expect(s2?.kind).toBe("vp");
    if (s2 && s2.kind === "vp") {
      // **측정이다** — 그은 선에서 읽었고, 가정은 주점 x = 이미지 중심 하나뿐이다
      expect(s2.source).toBe("tilted_vertical");
      expect(s2.at[0]).toBeCloseTo(SZ[0] / 2, 6);
    }
  });
});

describe("지평선 끌기 — 앱 경로(CamState)", () => {
  it("소실점 전에는 옮겨진다 (잠금 플래그가 아니라 소실점 유무가 가른다, 지시 1)", () => {
    const cam = new CamState(SZ);
    expect(cam.canSetHorizon()).toBe(true);
    expect(cam.setHorizon(210)).toBe(true);
    expect(cam.rules.horizon).toBe(210);
  });

  it("**반례** — 소실점이 서면 안 옮겨진다", () => {
    const cam = new CamState(SZ);
    cam.loadRules(rulesOf([vpSlot([620, 200]), null, null], SZ));
    expect(cam.canSetHorizon()).toBe(false);
    expect(cam.setHorizon(400)).toBe(false);
    expect(cam.rules.horizon).toBe(200);
  });

  // **브라우저가 잡은 결함의 회귀 팔**(#21: 버그를 되살려 실제로 잡는지 본다).
  // 레이아웃 전 캔버스 높이가 1px일 때 `setHorizon`이 1로 잘리고, 그 1이 비례로 늘어나
  // **지평선이 화면 바닥에 붙었다**(실측 675). 지금은 그 상태에서 **기본값으로 다시 잡는다**.
  it("**회귀** — 레이아웃 전(높이 1px) 상태를 거쳐도 지평선이 바닥에 안 붙는다", () => {
    const cam = new CamState([1280, 1]);
    expect(cam.setHorizon(200)).toBe(true);
    expect(cam.rules.horizon).toBe(1);          // 그 캔버스에서는 이것이 맞다(화면 밖 금지)
    cam.resize([1280, 675]);
    expect(cam.rules.horizon).toBe(337.5);      // **바닥(675)이 아니라 중앙**
  });

  it("창이 바뀌면 지평선이 화면 비율을 지킨다", () => {
    const cam = new CamState(SZ);
    cam.setHorizon(168);                        // 화면 위 1/4
    cam.resize([480, 336]);
    expect(cam.rules.horizon).toBeCloseTo(84, 6);
    // 소실점이 서 있으면 안 움직인다 — 확정된 축이 소리 없이 바뀌면 안 된다(A-3)
    const cam2 = new CamState(SZ);
    cam2.loadRules(rulesOf([vpSlot([620, 200]), null, null], SZ));
    cam2.resize([480, 336]);
    expect(cam2.rules.horizon).toBe(200);
  });
});
