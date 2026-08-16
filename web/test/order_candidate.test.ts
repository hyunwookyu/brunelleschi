// **차수 판정 — 첫 획이 후보를 좁힌다**(2026-08-17 사람 지시 B).
//
// 지시문: "**경우의 수가 유한하므로 상태 전이를 전수 테스트한다.**"
// 그래서 여기서는 **도달 가능한 상태 × 그을 수 있는 획 종류**를 전부 돌리고 표로 잠근다.
//
// ⚠ **표가 공허하지 않은지 함께 센다**(#32·#38): 셀 수와 **서로 다른 결과의 가짓수**를
// 단언한다. 전부 같은 답을 내는 표는 판정이 아니다.
import { describe, it, expect } from "vitest";
import {
  newRuleState, stepRule, orderCandidate, orderOfState, RULE_TOL,
  type RuleState, type RLine, type OrderCandidate,
} from "../src/s3d/vpRules.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];

const line = (a: Pt2, b: Pt2): RLine => ({ a, b });

/** 화면 수평과 `deg`를 이루는 길이 400px 선. */
function at(deg: number, from: Pt2 = [260, 380], len = 400): RLine {
  const r = (deg * Math.PI) / 180;
  return line(from, [from[0] + len * Math.cos(r), from[1] - len * Math.sin(r)]);
}

// ---------------------------------------------------------------- 그을 수 있는 획 종류

const AMB_DEG = (RULE_TOL.screen_axis_deg + RULE_TOL.depth_min_deg) / 2;

const INPUTS: { key: string; line: RLine; forced?: "screen" | "depth" | "vertical" }[] = [
  { key: "화면 가로", line: at(0) },
  { key: "화면 세로", line: at(90) },
  // ⚠ **두 깊이선은 충분히 벌어져야 한다** — 안 그러면 둘째가 첫 소실점의 **지지선**으로
  // 떨어지고(`vpMisfit`), 그러면 이 표가 "2점이 안 선다"를 잠그게 된다(#32).
  { key: "깊이 왼쪽", line: line([400, 560], [15, 452]) },
  { key: "깊이 오른쪽", line: line([560, 560], [946, 457]) },
  { key: "가파른 깊이 70°", line: at(70, [400, 560]) },
  { key: "애매 6°", line: at(AMB_DEG) },
  { key: "짧은 획", line: at(30, [300, 400], RULE_TOL.min_vp_len_px - 5) },
  // ⚠ **17.4° 기운 선**이어야 한다 — `depth`(≥8°)만 선 하나로 3점을 선언한다(4~8°는 손 오차)
  { key: "수직축이라 답함", line: line([700, 600], [590, 950]), forced: "vertical" },
];

// ---------------------------------------------------------------- 도달 가능한 상태

/** 획을 차례로 넣어 상태를 만든다 — **앱과 같은 경로**(#17). `ask`·`rejected`는 안 반영된다. */
function feed(st0: RuleState, steps: { line: RLine; forced?: "screen" | "depth" | "vertical" }[]) {
  let st = st0;
  for (const s of steps) {
    const r = stepRule(st, s.line, SZ, s.forced);
    if (r.event.type !== "ask" && r.event.type !== "rejected") st = r.state;
  }
  return st;
}

const H = INPUTS[0], D1 = INPUTS[2], D2 = INPUTS[3], VT = INPUTS[7];

const STATES: { key: string; st: () => RuleState; cand: OrderCandidate; order: number }[] = [
  { key: "S0 초기", st: () => newRuleState(SZ), cand: "initial", order: 0 },
  { key: "S1 1점후보·소실점0", st: () => feed(newRuleState(SZ), [H]), cand: "one_point", order: 0 },
  { key: "S2 1점후보·소실점1", st: () => feed(newRuleState(SZ), [H, D1]), cand: "one_point", order: 1 },
  { key: "S3 2점후보·소실점1", st: () => feed(newRuleState(SZ), [D1]), cand: "two_point", order: 1 },
  { key: "S4 2점후보·소실점2", st: () => feed(newRuleState(SZ), [D1, D2]), cand: "two_point", order: 2 },
  { key: "S5 3점", st: () => feed(newRuleState(SZ), [D1, D2, VT]), cand: "two_point", order: 3 },
];

describe("B 차수 후보 — 상태 자체", () => {
  it("도달 가능한 상태가 후보와 차수를 그대로 낸다", () => {
    for (const s of STATES) {
      const st = s.st();
      expect([s.key, orderCandidate(st), orderOfState(st)]).toEqual([s.key, s.cand, s.order]);
    }
  });

  it("**화면 세로선은 아무것도 안 좁힌다** — 수직축은 1점·2점 둘 다에서 화면 수직이다", () => {
    const st = feed(newRuleState(SZ), [INPUTS[1]]);
    expect(orderCandidate(st)).toBe("initial");
    expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
  });

  it("**화면 가로선 하나가 1점 투시를 정한다** — 소실점이 아직 없어도", () => {
    const st = feed(newRuleState(SZ), [H]);
    expect(orderCandidate(st)).toBe("one_point");
    expect(orderOfState(st)).toBe(0);
  });
});

// ---------------------------------------------------------------- 전수 전이표

/** 한 셀의 결과 — 사건 종류와 그 뒤의 (후보, 차수). */
const cell = (st: RuleState, i: typeof INPUTS[number]) => {
  const r = stepRule(st, i.line, SZ, i.forced);
  return `${r.event.type}|${orderCandidate(r.state)}|${orderOfState(r.state)}`;
};

/**
 * **전수 전이표**(6 상태 × 8 획 = 48 셀).
 *
 * 읽는 법: `사건|다음 후보|다음 차수`. `ask`·`rejected`는 상태를 **안 바꾸므로**
 * 뒤 두 칸이 그 상태의 값 그대로다.
 *
 * ⚠ 이 표가 이 항목의 계약이다. 값 하나가 바뀌면 **여기가 먼저 깨진다**.
 */
const TABLE: Record<string, string[]> = {
  "S0 초기": [
    "screen_axis|one_point|0",      // 화면 가로 → **1점 투시 선언**
    "support|initial|0",            // 화면 세로 → 이미 있는 축의 지지선. 아무것도 안 좁힌다
    "vp_fixed|two_point|1",         // 깊이 왼쪽
    "vp_fixed|two_point|1",         // 깊이 오른쪽
    "ask|initial|0",                // 가파른 깊이 → 두 번째 수평인가 수직인가
    "ask|initial|0",                // 애매 6°
    "rejected|initial|0",           // 짧은 획 (A-5)
    "derived_vertical|initial|1",   // 수직축이라 답함 → 그 선에서 V₃를 읽는다(A-4)
  ],
  "S1 1점후보·소실점0": [
    "support|one_point|0",          // 화면 가로 → 같은 축의 지지선
    "support|one_point|0",
    "vp_fixed|one_point|1",         // 깊이선이 그 하나뿐인 깊이축을 세운다
    "vp_fixed|one_point|1",
    "vp_fixed|one_point|1",         // **1점 후보에서는 안 묻는다**(B) — 3점이 불가능하다
    "ask|one_point|0",
    "rejected|one_point|0",
    "support|one_point|0",          // **1점에서는 수직 소실점을 안 만든다**(B) — 지지선으로만
  ],
  "S2 1점후보·소실점1": [
    "support|one_point|1",
    "support|one_point|1",
    "support|one_point|1",          // 같은 소실점을 향한다
    "rejected|one_point|1",         // **다른 방향** → 1점에는 깊이축이 하나뿐이다(B)
    "rejected|one_point|1",
    "ask|one_point|1",
    "rejected|one_point|1",
    "support|one_point|1",
  ],
  "S3 2점후보·소실점1": [
    "rejected|two_point|1",         // **1점 선언은 `initial`에서만 열린다**(B: 첫 획이 좁힌다)
    "support|two_point|1",
    "support|two_point|1",
    "vp_fixed|two_point|2",         // 다른 방향 → 두 번째 소실점
    "ask|two_point|1",
    "ask|two_point|1",
    "rejected|two_point|1",
    "derived_vertical|two_point|2", // 3점 선언은 수평 소실점이 하나여도 받는다
  ],
  "S4 2점후보·소실점2": [
    "rejected|two_point|2",         // 수평 슬롯이 둘 다 찼다 — 소실점은 잠긴다
    "support|two_point|2",
    "support|two_point|2",
    "support|two_point|2",
    "ask|two_point|2",              // 가파른 선 → **수직축입니까?** 3점으로 갈 입구다
    "ask|two_point|2",
    "rejected|two_point|2",
    "derived_vertical|two_point|3", // **2점 → 3점. 남은 유일한 차수 승격이다**
  ],
  "S5 3점": [
    "rejected|two_point|3",
    "rejected|two_point|3",         // 수직축이 유한 소실점이라 화면 세로선은 그 축이 아니다
    "support|two_point|3",
    "support|two_point|3",
    "rejected|two_point|3",         // 물음이 안 뜬다 — 수직축이 이미 유한 소실점이다
    "ask|two_point|3",
    "rejected|two_point|3",
    "support|two_point|3",          // 지지선 하나 더 — **다시 풀기가 실패해도 옛 값을 지킨다**
  ],
};

describe("B 전수 상태 전이 (6 상태 × 8 획)", () => {
  for (const s of STATES) {
    it(s.key, () => {
      const st = s.st();
      expect(INPUTS.map(i => cell(st, i))).toEqual(TABLE[s.key]);
    });
  }

  it("**표가 공허하지 않다** — 셀 48개에 서로 다른 결과가 여럿이다", () => {
    const cells = STATES.flatMap(s => INPUTS.map(i => cell(s.st(), i)));
    expect(cells.length).toBe(48);
    expect(new Set(cells).size).toBeGreaterThanOrEqual(10);
    // 사건 종류가 실제로 갈린다 — 한 종류로 쏠리면 판정이 아니다
    const kinds = new Set(cells.map(c => c.split("|")[0]));
    expect(kinds).toEqual(new Set(
      ["screen_axis", "support", "vp_fixed", "ask", "rejected", "derived_vertical"]));
  });

  /**
   * **되돌리기를 만들지 않는다**(B). 옛 판은 두 번째 수평 소실점이 화면 가로축 선언을
   * **밀어냈다**(`promoted`). 이 시험이 그 회귀 팔이다 — 되살리면 S2의 "깊이 ↘30°" 칸이
   * `rejected`에서 `vp_fixed|two_point|2`로 바뀌어 위 표가 깨진다.
   */
  it("**회귀** — 1점을 선언한 뒤에는 두 번째 소실점이 안 생긴다", () => {
    const st = feed(newRuleState(SZ), [H, D1, D2]);
    expect(orderCandidate(st)).toBe("one_point");
    expect(orderOfState(st)).toBe(1);
    expect(st.slots.some(s => s?.kind === "screen" && s.dir === "h")).toBe(true);
  });
});
