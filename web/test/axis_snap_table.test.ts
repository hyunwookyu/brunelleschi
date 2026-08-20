// **축 스냅 표**(2026-08-17 사람 지시 A 마지막 줄: "1·2·3점 각각에서 어느 축이 스냅
// 가능한지 표로 정리하고 테스트로 잠근다").
//
// 이 파일이 잠그는 것은 넷이다.
//   A-1  수직축이 **처음부터** 스냅 대상이다(화면 수직, 무한원)
//   A-2  화면 가로·세로는 **카메라 없이** 첫 획부터 스냅된다
//   A-3  확정된 소실점 방향은 **앵커마다 화면 방향이 다르다** — 그 계산이 실제로 들어 있다
//   A-5  짧은 획은 소실점을 안 만든다
//
// ⚠ **표 자체가 공허하지 않은지 함께 센다**(#32·#38): 각 상태에서 `via`가 붙는 축이
// **몇 개인지**를 단언한다. 전부 `null`인 표는 "규칙을 지켰다"가 아니라 "아무것도 안 한다"다.
import { describe, it, expect } from "vitest";
import { drawnHorizon } from "./ruleState.js";
import {
  newRuleState, stepRule, snapAxisTable, axisDirsOf, classifyLine, perspectiveOrder,
  RULE_TOL, type RuleState,
} from "../src/s3d/vpRules.js";
import { screenOrthoSnap, axisCandidates } from "../src/s3d/axisSnap.js";
import { CamState } from "../src/ui/camState.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
/** 최소 길이는 **화면 대각 대비**다(A-5, 2026-08-17 리뷰어 지적으로 px → 비). */
const MIN_LEN = RULE_TOL.min_vp_len_ratio * Math.hypot(SZ[0], SZ[1]);


// ---------------------------------------------------------------- A-2 화면 직교 스냅

describe("A-2 화면 직교 스냅 — 카메라와 무관하다", () => {
  it("임계 안이면 정확히 가로·세로로 끌린다 (수직 투영)", () => {
    const t = Math.tan(((RULE_TOL.screen_axis_deg - 1) * Math.PI) / 180);
    const h = screenOrthoSnap([100, 300], [500, 300 + 400 * t]);
    expect(h).toMatchObject({ dir: "h" });
    expect(h!.at).toEqual([500, 300]);                   // x는 커서, y는 앵커 — 수직 투영이다
    const v = screenOrthoSnap([300, 100], [300 + 400 * t, 500]);
    expect(v).toMatchObject({ dir: "v" });
    expect(v!.at).toEqual([300, 500]);
  });

  it("**반례** — 임계 밖은 안 끌린다. 그래야 깊이선을 그을 수 있다", () => {
    const t = Math.tan(((RULE_TOL.screen_axis_deg + 1) * Math.PI) / 180);
    expect(screenOrthoSnap([100, 300], [500, 300 + 400 * t])).toBeNull();
    expect(screenOrthoSnap([100, 300], [500, 700])).toBeNull();     // 45°
    expect(screenOrthoSnap([100, 300], [100, 300])).toBeNull();     // 길이 0
  });

  it("**긋는 방향과 무관하다** — 축에는 부호가 없다", () => {
    for (const [a, b] of [[[100, 300], [500, 310]], [[500, 310], [100, 300]],
                          [[500, 300], [100, 310]]] as [Pt2, Pt2][]) {
      expect(screenOrthoSnap(a, b)?.dir).toBe("h");
    }
  });

  /**
   * **스냅과 판정이 같은 자리에서 갈린다**(#17). 스냅이 걸린 획은 정확히 0°/90°가 되므로
   * `classifyLine`이 **반드시** `screen_h`·`screen_v`를 낸다 — 애매로 안 떨어진다.
   * 이것이 A-2가 말한 "초기 확정의 정확도를 올린다"의 기전이다.
   */
  it("스냅된 획은 애매 구간에 안 떨어진다 — 규칙이 한쪽으로 정확히 간다", () => {
    let snapped = 0;
    for (let deg = 0; deg <= 12; deg += 0.5) {
      const t = Math.tan((deg * Math.PI) / 180);
      const a: Pt2 = [100, 300], b: Pt2 = [500, 300 + 400 * t];
      const o = screenOrthoSnap(a, b);
      if (!o) continue;
      snapped += 1;
      expect(classifyLine(a, o.at).kind).toBe("screen_h");
    }
    expect(snapped).toBeGreaterThan(0);                  // **덮는 대상 수**(#38)
    expect(snapped).toBe(9);                             // 0~4°를 0.5° 간격으로
  });
});

// ---------------------------------------------------------------- 스냅 표

/** 그은 선으로 상태를 만든다 — **앱과 같은 경로**다(#17). */
function feed(st0: RuleState, lines: [Pt2, Pt2][],
              forced?: "screen" | "depth"): RuleState {
  let st = st0;
  for (const [a, b] of lines) {
    const r = stepRule(st, { a, b }, SZ, forced);
    if (r.event.type !== "ask" && r.event.type !== "rejected") st = r.state;
  }
  return st;
}

/**
 * 깊이선 — 화면 수평과 27~41°(≥8°라 `depth`) · 수직과 45° 밖(물음에 안 걸린다).
 * ⚠ **4차 지시 3**: 첫 소실점은 그린 두 선의 교점이다 — A·A2가 같은 V₁(-100, 258)을
 * 지나는 짝이고, B는 V₂(1250, 258)를 향한다(V₁과의 부적합도가 커 지지선으로 안 오인된다).
 * V₁·V₂가 주점(480) 양쪽이라 2점 카메라가 선다(f² > 0, 6.2).
 */
/** **사용자가 그은 지평선**(18차 지시 j) — 픽스처의 소실점 둘이 이 높이에 있다. */
const HY = 258;
const DEPTH_A: [Pt2, Pt2] = [[300, 600], [140, 463.2]];
const DEPTH_A2: [Pt2, Pt2] = [[500, 560], [260, 439.2]];
const DEPTH_B: [Pt2, Pt2] = [[700, 620], [920, 475.2]];
/**
 * **A의 셋째 지지선**(2026-08-18 6차 지시 11) — 소실점은 **세** 선이 모여야 선다.
 * 같은 V₁(-100, 258)을 지난다: (400,640)에서 V₁ 쪽으로 t = 0.35.
 */
const DEPTH_A3: [Pt2, Pt2] = [[400, 640], [225, 506.3]];
const SCREEN_H: [Pt2, Pt2] = [[100, 200], [500, 200]];
/**
 * 화면 수직에서 **17.4° 기운 선** — 3점의 유일한 입구다(A-4).
 * ⚠ 각을 아무렇게나 못 고른다: ① `depth`(≥8°)여야 **선 하나로** 3점을 선언할 수 있고
 * (4~8°는 손 오차 대역이라 안 받는다) ② 소실점 삼각형이 **예각**이어야 카메라가 선다(6.5) —
 * V₁·V₂가 1798px 벌어져 있으므로 V₃는 지평선에서 898px 넘게 떨어져야 한다.
 */
const TILTED_V: [Pt2, Pt2] = [[700, 600], [590, 950]];

const rows = (st: RuleState, standing: boolean) =>
  snapAxisTable(st, standing).map(r => `${r.kind ?? "-"}/${r.via ?? "-"}`);

describe("스냅 표 — 상태마다 어느 축이 스냅되는가", () => {
  it("초기(카메라 없음) — 수직축만 화면 직교로 잡힌다", () => {
    const st = drawnHorizon(SZ, HY);
    expect(rows(st, false)).toEqual(["-/-", "-/-", "screen_v/screen_ortho"]);
    expect(snapAxisTable(st, false).filter(r => r.via).length).toBe(1);
  });

  it("화면 가로 선언(P1 — 깊이 소실점 전) — 가로·세로 둘이 화면 직교로 잡힌다", () => {
    const st = feed(drawnHorizon(SZ, HY), [SCREEN_H]);
    expect(rows(st, false)).toEqual(["screen_h/screen_ortho", "-/-", "screen_v/screen_ortho"]);
    expect(snapAxisTable(st, false).filter(r => r.via).length).toBe(2);
  });

  it("1점 확정 — 소실점 하나 + 화면 가로 + 화면 세로. 셋 다 축 스냅이다", () => {
    // ⚠ 깊이선이 **셋**이다(2026-08-18 8차 지시 1-a): 화면 가로축만으로는 P1이 아니고
    // (깊이 소실점이 있어야 한다) 그 지름길이 없어져 셋째 선이 소실점을 정한다.
    const st = feed(feed(drawnHorizon(SZ, HY), [SCREEN_H]), [DEPTH_A, DEPTH_A2, DEPTH_A3]);
    expect(perspectiveOrder(st)).toBe(1);
    expect(rows(st, true)).toEqual(["screen_h/axis_snap", "vp/axis_snap", "screen_v/axis_snap"]);
    expect(snapAxisTable(st, true).filter(r => r.via).length).toBe(3);
  });

  it("**A-1** 2점 확정 — 수직축이 화면 수직으로 **스냅 대상에 들어 있다**", () => {
    const st = feed(drawnHorizon(SZ, HY), [DEPTH_A, DEPTH_A2, DEPTH_B]);
    expect(perspectiveOrder(st)).toBe(2);
    expect(rows(st, true)).toEqual(["vp/axis_snap", "vp/axis_snap", "screen_v/axis_snap"]);
    expect(snapAxisTable(st, true).filter(r => r.via).length).toBe(3);
  });

  // **3점 시점의 축 후보는 셋이다**(7차 지시 3-b) — 그 상태를 만드는 방법만 바뀌었다.
  // 옛 판은 "수직축입니까"에 답해서 만들었고, 지금은 **카메라를 기울인 시점**이 만든다.
  // 여기서는 그 상태를 **옛 저장본처럼 직접 넣어** 표만 확인한다(#17: 표는 상태의 함수다).
  it("3점 확정 — 셋 다 소실점", () => {
    const st0 = feed(drawnHorizon(SZ, HY), [DEPTH_A, DEPTH_A2, DEPTH_B]);
    const st = { ...st0, slots: [st0.slots[0], st0.slots[1],
      { kind: "vp", at: [480, 950] as Pt2, source: "tilted_vertical", support: 1 }] as typeof st0.slots };
    expect(perspectiveOrder(st)).toBe(3);
    expect(rows(st, true)).toEqual(["vp/axis_snap", "vp/axis_snap", "vp/axis_snap"]);
  });

  /**
   * ⚠ **계약이 바뀌었다**(2026-08-17 4차 지시 2 — 완화가 아니라 지시에 따른 변경).
   * 옛 계약: "소실점이 있어도 카메라가 안 서면 그 방향을 못 만든다"(축 방향 `(V−P, f)`에
   * f가 필요하다) — 그래서 이 자리가 `vp/-`였다. 지시 2가 그것을 뒤집었다:
   * **소실점을 지나는 화면 직선은 f 없이 성립한다**(이론서 2장). 3D 축 스냅이 아니라
   * **화면 작도**(`vpDirSnap`)로 끄는 것이고, 표는 그 경로를 `vp_dir`로 구분해 낸다 —
   * "언제나 전부 스냅된다"가 아니라 **경로가 다르다**는 것이 표에 남는다(#30).
   */
  it("카메라가 안 서도(NONE·소실점 하나) 소실점 방향은 vp_dir로 스냅된다 (4차 지시 2)", () => {
    // ⚠ **셋이 모여야 소실점이다**(6차 지시 11) — 옛 판은 둘이면 섰다
    const st = feed(drawnHorizon(SZ, HY), [DEPTH_A, DEPTH_A2, DEPTH_A3]);
    // **18차** — 첫 소실점이 서면 남는 수평축은 정의상 화면 평행이라 규칙이 채운다
    // (`implicit`). 안 채우면 그 축이 방향을 잃어 화면 가로선이 못 올라간다.
    expect(rows(st, false))
      .toEqual(["vp/vp_dir", "screen_h/screen_ortho", "screen_v/screen_ortho"]);
    expect(snapAxisTable(st, false).filter(r => r.via).length).toBe(3);
    // 서면 같은 축이 3D 축 스냅으로 올라간다 — 경로 구분이 표에 남는다
    expect(snapAxisTable(st, true)[0].via).toBe("axis_snap");
  });
});

// ---------------------------------------------------------------- A-1·A-3 실제 후보

describe("A-1·A-3 축 후보가 실제로 나온다 (표가 아니라 기하)", () => {
  /** 2점 카메라 — 깊이선 둘로 세우고 `CamState`가 f·주점을 낸다(앱 경로 그대로, #17). */
  function twoPoint() {
    const cam = new CamState(SZ);
    cam.setHorizon(HY);                      // **지평선이 첫 동작이다**(18차 지시 j)
    for (const [a, b] of [DEPTH_A, DEPTH_A2, DEPTH_B]) cam.feed({ a, b });
    const ctx = cam.ctx();
    expect(ctx).not.toBeNull();
    return { cam, ctx: ctx! };
  }

  it("**A-1** 2점에서 수직 축 후보가 나오고, 그 화면 방향이 수직이다", () => {
    const { ctx } = twoPoint();
    const dirs = ctx.axisDirs!;
    expect(dirs[2]).not.toBeNull();
    const anchor: [number, number, number] = [0.4, -0.2, 3];
    const a2 = [ctx.principal[0] + (anchor[0] * ctx.f) / anchor[2],
                ctx.principal[1] + (anchor[1] * ctx.f) / anchor[2]] as Pt2;
    const cands = axisCandidates(anchor, dirs, a2, [a2[0] + 2, a2[1] + 200], ctx);
    const v = cands.find(c => c.axis === 2);
    expect(v).toBeDefined();
    expect(v!.deg).toBeLessThan(1);                       // 세로로 그으면 수직축이 0°에 가깝다
    expect(cands[0].axis).toBe(2);                        // 그리고 1등이다
  });

  it("**A-1 반례** — 옛 상태(수직 슬롯이 비었다)에서는 후보가 안 나온다", () => {
    const { cam, ctx } = twoPoint();
    const st = cam.dumpRules();
    st.slots[2] = null;                                   // 고치기 전의 상태를 되살린다
    const dirs = axisDirsOf(st, ctx.principal, ctx.f);
    expect(dirs[2]).toBeNull();
    const anchor: [number, number, number] = [0.4, -0.2, 3];
    const a2 = [ctx.principal[0] + (anchor[0] * ctx.f) / anchor[2],
                ctx.principal[1] + (anchor[1] * ctx.f) / anchor[2]] as Pt2;
    const cands = axisCandidates(anchor, dirs, a2, [a2[0] + 2, a2[1] + 200], ctx);
    expect(cands.some(c => c.axis === 2)).toBe(false);     // **세로선을 못 긋던 자리다**
  });

  /**
   * **A-3** — 유한 소실점 방향의 스냅은 화면에서 **직선이 아니다**: 앵커와 소실점을 잇는
   * 선이므로 앵커마다 방향이 다르다. "그 계산이 들어가 있는지 확인한다"가 지시문이다.
   */
  it("**A-3** 같은 축이라도 앵커가 다르면 화면 방향이 다르다", () => {
    const { ctx } = twoPoint();
    const dirs = ctx.axisDirs!;
    const screenDirOf = (anchor: [number, number, number]) => {
      const a2 = [ctx.principal[0] + (anchor[0] * ctx.f) / anchor[2],
                  ctx.principal[1] + (anchor[1] * ctx.f) / anchor[2]] as Pt2;
      const c = axisCandidates(anchor, dirs, a2, [a2[0] + 100, a2[1]], ctx).find(x => x.axis === 0)!;
      return Math.atan2(c.screenEnd[1] - a2[1], c.screenEnd[0] - a2[0]) * 180 / Math.PI;
    };
    const d1 = screenDirOf([-0.8, -0.5, 3]);
    const d2 = screenDirOf([0.9, 0.6, 3]);
    // **화면 각이 실제로 다르다** — 같으면 소실점을 안 쓰고 고정 방향을 쓴 것이다
    expect(Math.abs(d1 - d2)).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------- A-5 최소 길이

describe("A-5 짧은 획은 소실점을 안 만든다", () => {
  const short = (): [Pt2, Pt2] => {
    const L = MIN_LEN - 5;
    return [[300, 400], [300 + L * Math.cos(Math.PI / 6), 400 - L * Math.sin(Math.PI / 6)]];
  };

  it("임계 아래면 규칙이 안 움직인다 — 획은 부르는 쪽에 남는다", () => {
    const st0 = drawnHorizon(SZ, HY);
    const r = stepRule(st0, { a: short()[0], b: short()[1] }, SZ);
    expect(r.event.type).toBe("rejected");
    expect(r.state).toBe(st0);                            // **같은 객체** — 조용히 안 바꾼다
    expect(perspectiveOrder(r.state)).toBe(0);
  });

  it("**반례** — 임계 위면 규칙에 들어간다(선 하나가 곧 소실점이다, 18차 지시 2)", () => {
    const L = MIN_LEN + 5;
    const b: Pt2 = [300 + L * Math.cos(Math.PI / 6), 400 - L * Math.sin(Math.PI / 6)];
    const r = stepRule(drawnHorizon(SZ, HY), { a: [300, 400], b }, SZ);
    expect(r.event.type).toBe("vp_fixed");        // **거절이 아니다** — 규칙에 들어갔다
    expect(perspectiveOrder(r.state)).toBe(1);    // 지평선 + 소실점 하나 = 1점
  });

  // ⛔ **대상이 사라졌다**(2026-08-18 7차 지시 3-b — 기울어진 선은 항상 깊이선이고
  //    "수직축입니까" 물음이 없어졌다). **지우지 않고 은퇴로 표시한다** — 왜 그 규칙이
  //    있었는지가 근거다(PITFALLS 머리말).
  it.skip("사용자가 답한 수직축 선언은 길이로 안 막는다 — 그것은 소실점 후보가 아니다", () => {});
});

