// **규칙 기반 소실점 확정** — 단위 시험과 **반례**(2026-08-16 전면 교체).
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5(자기참조 유형 3 — 유도된 V₃는 **측정이 아니라 항등**이다. 그 사실을 시험이 명시한다)
//   #23(계획서 문장이 기하적으로 성립하는가 — 규칙 c의 "선 하나면 된다"를 실제로 확인한다)
//   #30(양성 채널 — 규칙이 **안 받는 것**도 함께 확인한다. 다 받으면 판정이 아니다)
//   #37(이론서를 먼저 본다 — 6.3 수심 · 6.4 항등식 · 2.2 무한원 · 3.1 지평선)
import { describe, it, expect } from "vitest";
import {
  classifyLine, sepDeg, stepRule, newRuleState, vpsOf, axisDirsOf,
  perspectiveOrder, axisOfStroke, RULE_TOL, type RuleState, type RLine,
} from "../src/s3d/vpRules.js";
import { recoverCamera, type Pt2 } from "../src/s3d/camera.js";
import { vpMisfit } from "../src/s3d/axis.js";
import { cross3, unit3, axisDirection, angleBetween, type Vec3 } from "../src/s3d/geom3d.js";

const SZ: [number, number] = [960, 672];
const line = (a: Pt2, b: Pt2): RLine => ({ a, b });

/** 규칙에 선들을 차례로 넣는다 — 앱의 `feedStroke`와 같은 순서다. */
function feed(ls: [RLine, ("screen" | "depth")?][], st = newRuleState(SZ)): RuleState {
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

  // **양성 채널**(#30) — 다 받으면 판정이 아니다. 사이 구간은 **애매**로 분류된다.
  // ⛔ **12차 지시 4-a(D-L89)**: 애매 구간의 **물음을 지웠다** — 스냅 없이 나온 대각선은
  // 깊이선이다(화면에 나란한 선은 스냅이 잡고, 2D 유지는 주석 채널의 몫이다).
  it("두 임계 사이는 애매로 분류되고 — 묻지 않고 깊이선으로 확정한다(12차 4-a)", () => {
    const mid = (RULE_TOL.screen_axis_deg + RULE_TOL.depth_min_deg) / 2;
    const t = Math.tan((mid * Math.PI) / 180);
    expect(classifyLine([0, 100], [400, 100 + 400 * t]).kind).toBe("ambiguous");
    const r = stepRule(newRuleState(SZ), line([0, 100], [400, 100 + 400 * t]), SZ);
    expect(r.event.type).not.toBe("ask");                      // 물음이 없다
    expect(r.event.type).toBe("waiting");                      // 깊이선으로 대기 풀에 들어갔다
    expect(r.state.depthLines?.length ?? 0).toBe(1);
    expect(r.state.slots).toEqual(newRuleState(SZ).slots);     // 슬롯은 아직 안 움직인다
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
    // ⚠⚠ **1 → 0으로 뒤집혔다**(2026-08-18 8차 지시 1-a·1-b). 옛 판은 "가로선이 그어졌으므로
    // 1점 확정"이라 적었는데, 그것이 **수평축의 존재를 카메라가 선 것으로 읽은** 자리다.
    // 깊이 소실점이 없으면 **깊이 방향이 미정**이라 카메라가 설 수 없다 — 축만 기록하고 대기다.
    expect(perspectiveOrder(st)).toBe(0);
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

describe("b. 첫 소실점 = 한 축으로 모인 **세** 깊이선의 교점 (6차 지시 11)", () => {
  // ⚠⚠ **이 절의 계약이 뒤집혔다**(2026-08-17 4차 지시 3 — 2차의 "지평선이 먼저"를 되돌린다).
  // 옛 계약: 지평선이 처음부터 있고 깊이선 **하나** × 지평선이 소실점이었다. 그 귀결이
  // "격자가 그린 선과 어긋난다"였다 — 소실점이 그린 선들의 교점이 아니라 미리 깔린 지평선
  // 위로 갔기 때문이다. 새 계약: **소실점은 그린 두 선의 교점이고, 지평선은 그 y다**(롤 0 유지).
  const H = SZ[1] / 2;
  const V: Pt2 = [700, 300];                            // 기본 지평선(336) **밖**의 점 — 그래야 옛 규칙과 갈린다
  const toward = (from: Pt2, t = 0.4): RLine =>
    line(from, [from[0] + (V[0] - from[0]) * t, from[1] + (V[1] - from[1]) * t]);

  it("초기 지평선 값은 화면 중앙이되 소실점 확정에 안 쓰인다", () => {
    expect(newRuleState(SZ).horizon).toBeCloseTo(H, 9);
  });

  it("깊이선 **둘까지는 대기**하고, 셋째 선이 교점을 확정한다 (6차 지시 11)", () => {
    const r1 = stepRule(newRuleState(SZ), toward([200, 600]), SZ);
    expect(r1.event.type).toBe("waiting");
    expect(r1.state.slots[0]).toBeNull();               // **아직 소실점이 없다**
    // ⚠⚠ **여기가 6차 지시 11이 바꾼 자리다.** 옛 규칙은 이 둘째 선에서 확정했고, 그래서
    // 서로 다른 축의 대각선 둘을 그으면 **2점을 그리려던 것이 1점으로 굳었다.**
    const r2 = stepRule(r1.state, toward([300, 640]), SZ);
    expect(r2.event.type).toBe("waiting");
    expect(r2.state.slots[0]).toBeNull();
    // 셋째 선이 **같은 점으로 모인다** — 그때 비로소 소실점이다
    const r3 = stepRule(r2.state, toward([420, 660]), SZ);
    expect(r3.event.type).toBe("vp_fixed");
    const vp = (r3.state.slots[0] as { at: Pt2 }).at;
    expect(vp[0]).toBeCloseTo(V[0], 6);                 // **그린 선들의 교점 그대로다**
    expect(vp[1]).toBeCloseTo(V[1], 6);
    // 셋이 다 모였으므로 **둘째 슬롯은 비어 있다**(나머지가 없다)
    expect(r3.state.slots[1]).toBeNull();
    // **소실점이 지평선을 정한다**(지시 4-c의 앞당김 — 롤 0이므로 y가 지평선이다)
    expect(r3.state.horizon).toBeCloseTo(V[1], 6);
    // **소실점 하나 = NONE이다**(지시 1) — 가로선이 오면 P1, 두 번째 소실점이 오면 P2
    expect(perspectiveOrder(r3.state)).toBe(0);
    // **회귀 팔**: 옛 규칙이면 소실점이 (선 ∩ 기본 지평선)에 놓여 y = 336이다 — 지금은 300이다
    expect(vp[1]).not.toBeCloseTo(H, 0);
  });

  /**
   * **이번 변경의 이유 그대로**(6차 지시 11): 빈 캔버스에서 **서로 다른 축**의 대각선 둘은
   * 소실점을 만들지 않는다. 그 교점은 **공간의 한 점**이지 소실점이 아니다.
   *
   * ⚠ **회귀 팔** — 옛 규칙에서는 이 둘째 선이 `vp_fixed`를 냈고 P1이 굳었다.
   */
  it("**반례** — 다른 축의 대각선 둘은 소실점이 아니다 (6차 지시 11의 이유)", () => {
    let st = newRuleState(SZ);
    st = stepRule(st, line([120, 620], [520, 470]), SZ).state;      // 왼쪽으로 가는 축
    const r = stepRule(st, line([840, 620], [440, 470]), SZ);       // 오른쪽으로 가는 축
    expect(r.event.type).toBe("waiting");
    expect(r.state.slots[0]).toBeNull();
    expect(r.state.slots[1]).toBeNull();
    expect(perspectiveOrder(r.state)).toBe(0);
  });

  /**
   * **셋이 안 모이면 2점이 한 번에 선다**(지시 11-1 넷째 줄). 가까운 둘이 한 축이고
   * 나머지가 다른 축이다 — 그 나머지와 지평선의 교점이 두 번째 소실점이다.
   */
  it("셋째 선이 갈리면 **2점이 한 번에** 선다 (지시 11-1)", () => {
    const VA: Pt2 = [1500, 336], VB: Pt2 = [-600, 336];
    const seg = (from: Pt2, to: Pt2, t = 0.3): RLine =>
      line(from, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    let st = newRuleState(SZ);
    st = stepRule(st, seg([300, 640], VA), SZ).state;
    st = stepRule(st, seg([420, 600], VA), SZ).state;
    const r = stepRule(st, seg([600, 640], VB), SZ);
    expect(r.event.type).toBe("vp_fixed");
    expect(perspectiveOrder(r.state)).toBe(2);
    const v0 = (r.state.slots[0] as { at: Pt2 }).at;
    const v1 = (r.state.slots[1] as { at: Pt2 }).at;
    expect(v0[0]).toBeCloseTo(VA[0], 3);
    expect(v1[0]).toBeCloseTo(VB[0], 3);
    expect(v1[1]).toBeCloseTo(v0[1], 9);                // 둘 다 같은 지평선 위다(롤 0)
  });

  it("**반례** — 나란한 짝은 교점이 발산하므로 대기가 이어진다", () => {
    let st = newRuleState(SZ);
    const a = stepRule(st, line([100, 600], [500, 480]), SZ);
    expect(a.event.type).toBe("waiting");
    st = a.state;
    // 같은 기울기, 평행 이동한 선 — 교점이 없다(옛 실패 모드였던 "폭주"는 대기가 됐다)
    const b = stepRule(st, line([100, 640], [500, 520]), SZ);
    expect(b.event.type).toBe("waiting");
    expect(b.state.slots[0]).toBeNull();
    expect(b.state.depthLines.length).toBe(2);
    // 셋째도 나란하면 여전히 교점이 없다 — **대기는 개수가 아니라 기하가 푼다**
    const c = stepRule(b.state, line([100, 680], [500, 560]), SZ);
    expect(c.event.type).toBe("waiting");
    expect(c.state.slots[0]).toBeNull();
  });

  it("**반례** — 끝점을 공유한 이음(ㄱ자)은 소실점이 아니다 — 모든 꼭짓점이 소실점이 되면 안 된다", () => {
    let st = newRuleState(SZ);
    const J: Pt2 = [400, 500];                          // 이음점
    const a = stepRule(st, line([150, 620], J), SZ);
    expect(a.event.type).toBe("waiting");
    st = a.state;
    const b = stepRule(st, line(J, [700, 620]), SZ);    // 같은 점에서 이어 긋는다(2D 오스냅의 기본 동작)
    expect(b.event.type).toBe("waiting");               // **교점 = 이음점이므로 짝에서 뺀다**
    expect(b.state.slots[0]).toBeNull();
  });

  it("지평선과 거의 나란한 선도 짝이 좋으면 교점을 낸다 — 옛 min_slope 거절은 둘째 축의 것이다", () => {
    // 4° 미만이면 screen_h로 가므로 depth 강제 — 첫 축은 지평선을 안 쓰므로 거절 사유가 없다
    let st = newRuleState(SZ);
    st = stepRule(st, line([100, 500], [800, 470]), SZ, "depth").state;   // 얕은 깊이선
    st = stepRule(st, line([200, 640], [700, 500]), SZ, "depth").state;
    const r = stepRule(st, line([150, 600], [650, 520]), SZ, "depth");    // 셋째(6차 지시 11)
    expect(r.event.type).toBe("vp_fixed");
  });

  // ------------------------------------------------------------------ 7차 지시 2
  //
  // 지시 2-1의 **대기 규칙 표**를 그대로 시험으로 옮긴다. 위 시험들이 세 행(대각선 1·2·셋이
  // 한 축·셋이 갈림)을 이미 덮으므로 여기서는 **남은 세 행**과 **2-5**(빈 캔버스 첫 대각선)를 낸다.
  it("**2-1 표** — **무의도**(분류뿐) 수평선이 오면 축만 생기고 1점은 아직이다", () => {
    // 대각선 둘로 대기 중인 상태에서 수평선을 그으면 그것이 축이다(표 다섯째 줄)
    // ⚠⚠ **14차 항목 3(D-L96)이 이 자리를 갈랐다**: hint "screen"(스냅·답변 = 선언)이면
    // 그 자리에서 1점이 선다 — 그 팔은 "14차 항목 3" 절에 있다. 여기(무의도 —
    // 얕은 오분류의 자리)는 8차 1-a의 대기가 그대로다.
    let st = stepRule(newRuleState(SZ), toward([200, 600]), SZ).state;
    st = stepRule(st, toward([300, 640]), SZ).state;
    expect(perspectiveOrder(st)).toBe(0);
    const r = stepRule(st, line([120, 500], [520, 500]), SZ);
    expect(r.event.type).toBe("screen_axis");
    expect(perspectiveOrder(r.state)).toBe(0);
    expect(r.state.slots[0]).toMatchObject({ kind: "screen", dir: "h" });
  });

  // ---- 8차 지시 1-d 회귀 팔: "수평선 + 깊이선"이 어디서 P1이 되고 어디서 P2가 되는가
  it("**1-d** — 수평선 뒤 깊이선 하나로는 P1이 안 된다. 같은 축으로 셋이 모이면 P1이다", () => {
    // 수평선 먼저 → 축만 기록되고 대기(지시 1-a)
    let st = stepRule(newRuleState(SZ), line([120, 500], [520, 500]), SZ).state;
    expect(perspectiveOrder(st)).toBe(0);
    // 깊이선 하나 — 소실점이 안 선다(한 선은 교점을 못 만든다). **P1이 선언되면 안 된다**
    st = stepRule(st, toward([200, 600]), SZ).state;
    expect(perspectiveOrder(st)).toBe(0);
    expect(vpsOf(st).filter(Boolean)).toHaveLength(0);
    // 같은 축으로 둘 더 → 한 점으로 모이므로 깊이 소실점 하나 → **그때 P1**
    st = stepRule(st, toward([300, 640]), SZ).state;
    st = stepRule(st, toward([260, 620]), SZ).state;
    expect(vpsOf(st).filter(Boolean)).toHaveLength(1);
    expect(perspectiveOrder(st)).toBe(1);
  });

  it("**2-1 표** — 수직선만으로는 정보가 없다. 계속 대기다", () => {
    let st = newRuleState(SZ);
    for (const y0 of [200, 260, 320]) {
      const r = stepRule(st, line([300 + y0, y0], [300 + y0, y0 + 200]), SZ);
      // 화면 수직은 **처음부터 선언된 슬롯 2**의 지지선일 뿐이다(D-L47 ⓑ)
      expect(r.event.type).toBe("support");
      st = r.state;
    }
    expect(perspectiveOrder(st)).toBe(0);
    expect(vpsOf(st).filter(Boolean).length).toBe(0);
  });

  it("**2-5** — 빈 캔버스의 첫 대각선에는 묻지 않는다. 그것이 첫 깊이축이다", () => {
    // 축이 하나도 없을 때는 물을 것이 없다 — 두 번째 수평축일 수 없고(첫 번째가 없다)
    // 수직축일 수도 없다(3점은 2점 확정 뒤에만).
    for (const b of [[520, 250], [520, 430], [420, 200], [430, 480]] as Pt2[]) {
      const r = stepRule(newRuleState(SZ), line([260, 340], b), SZ);
      expect(r.event.type).not.toBe("ask");
    }
    // ⛔ **12차 4-a**: 소실점이 선 뒤의 가파른(애매 구간) 선도 이제 **묻지 않는다** —
    // 깊이선으로 판정되고, 기하가 받든 거부하든 **조용한 물음은 없다**(A-3의 "애매하면
    // 놓지 않는다"는 배치의 규칙이고, 여기서는 판정이 명시적 거부/대기로 나온다).
    let st = stepRule(newRuleState(SZ), toward([200, 600]), SZ).state;
    st = stepRule(st, toward([300, 640]), SZ).state;
    st = stepRule(st, toward([250, 620]), SZ).state;
    expect(vpsOf(st).filter(Boolean).length).toBeGreaterThan(0);
    const r2 = stepRule(st, line([300, 200], [340, 560]), SZ);
    expect(r2.event.type).not.toBe("ask");
    expect(["rejected", "waiting", "vp_fixed", "support"]).toContain(r2.event.type);
  });

  // ------------------------------------------------------------------ 7차 지시 4 (화각 게이트)
  //
  // 지시 4-a: "2점 확정 직전에 화각을 판정한다 … f² ≤ 0 → 확정 거부."
  // **그 게이트가 확정 경로에 실제로 걸려 있는지**를 여기서 잠근다(#17 — 배선 확인).
  // 픽스처: 주점 x = 480(이미지 중심). 두 소실점이 **둘 다 그 오른쪽**이면 f² < 0이다
  // (`(480−600)·(900−480) < 0`) — D-L68이 저장소 안의 잘못된 픽스처를 잡은 그 조건이다.
  const VP_R1: Pt2 = [600, SZ[1] / 2];
  const VP_R2: Pt2 = [900, SZ[1] / 2];
  /** (900, 336)으로 뻗는 깊이선 — 39° 기울기라 `depth`이고 V1(600)을 향하지 않는다. */
  const TO_R2: RLine = { a: [700, 500], b: [800, 418] };

  it("**4-a** 두 번째 소실점이 f² ≤ 0이면 확정을 거부한다 — 게이트가 확정 경로에 걸려 있다", () => {
    const st = newRuleState(SZ);
    st.slots[0] = { kind: "vp", at: VP_R1, source: "two_lines", support: 2 };
    st.horizon = SZ[1] / 2;
    const r = stepRule(st, TO_R2, SZ);
    expect(r.event.type).toBe("rejected");
    if (r.event.type === "rejected") {
      expect(r.event.fov?.band).toBe("reject");
      expect(r.event.notify).toBe(true);               // **알린다**(지시 4-c)
    }
    expect(r.state.slots[1]).toBeNull();               // 두 번째 슬롯이 안 찼다
  });

  // ---------------------------------------------------------------- 14차 지시 1 (화각 상한 제거)
  //
  // ⛔ 12차 지시 1-c의 상한(120° 거부)은 **14차 지시 1이 되돌렸다**(D-L93 — 상한은 임의
  // 기준이었고 넓은 화각은 의도일 수 있다. #28: 판정을 바꾼 사유는 지시문이다). 12차의
  // 배선 팔(같은 픽스처 — 간격 120px · 화각 166°)이 정반대 방향을 잠근다:
  // **f² > 0이면 화각이 얼마든 확정이 선다.** f² ≤ 0 차단은 위 4-a 팔이 그대로 든다.
  it("**14차 1** 화각이 아무리 넓어도 f² > 0이면 확정이 선다 — 상한 제거의 배선", () => {
    const st = newRuleState(SZ);
    st.slots[0] = { kind: "vp", at: [420, SZ[1] / 2], source: "two_lines", support: 2 };
    st.horizon = SZ[1] / 2;
    // (540, 336)으로 뻗는 45° 깊이선 — 두 소실점이 120px 간격이라 화각 166°다
    const r = stepRule(st, { a: [640, 436], b: [590, 386] }, SZ);
    expect(r.event.type).toBe("vp_fixed");
    if (r.event.type === "vp_fixed") {
      expect(r.event.fov?.band).toBe("severe");        // 대역은 참고 진단으로만 남는다(1-d)
      expect(r.event.fov?.fovDeg).toBeGreaterThan(120);
      expect(r.event.fov?.why).toBe("");               // 화각 안내 문구도 없다(1-b)
    }
    expect(r.state.slots[1]).not.toBeNull();
  });

  it("**12차 1-e** 경고 대역(90~120°)은 종전대로 확정하고 판정을 실어 낸다", () => {
    const st = newRuleState(SZ);
    // f/W = 0.431(파일1 보고값의 대역) — f = 414px가 되게 소실점을 ±414에 둔다
    const fw = 0.431 * SZ[0];
    st.slots[0] = { kind: "vp", at: [SZ[0] / 2 - fw, SZ[1] / 2], source: "two_lines", support: 2 };
    st.horizon = SZ[1] / 2;
    // (894, 336)으로 뻗는 깊이선 — 894 = 480 + 414
    const to: Pt2 = [SZ[0] / 2 + fw, SZ[1] / 2];
    const r = stepRule(st, { a: [to[0] - 200, to[1] + 200], b: [to[0] - 100, to[1] + 100] }, SZ);
    expect(r.event.type).toBe("vp_fixed");
    if (r.event.type === "vp_fixed") {
      expect(r.event.fov?.band).toBe("severe");        // 경고가 표시로 나간다(mainL feedStroke)
      expect(r.event.fov?.fovDeg).toBeLessThan(120);
    }
  });

  it("**양성 채널** — 주점을 사이에 둔 두 소실점은 그대로 선다(#30)", () => {
    const st = newRuleState(SZ);
    st.slots[0] = { kind: "vp", at: [-400, SZ[1] / 2], source: "two_lines", support: 2 };
    st.horizon = SZ[1] / 2;
    const r = stepRule(st, TO_R2, SZ);
    expect(r.event.type).toBe("vp_fixed");
    if (r.event.type === "vp_fixed") expect(r.event.fov?.band).not.toBe("reject");
  });

  it("**4-a·2-3** 2점이 한 번에 서는 경로에서도 화각에 걸리면 **조용히 1점이 되지 않는다**", () => {
    // 셋이 두 축으로 갈리는 대기 집합 — {l1, l3}이 (600, 336)으로 모이고 l2는 (900, 336)이다.
    // 두 번째 축이 f² ≤ 0이라 안 서고, 그 판정이 사건에 실려 나온다(7차 항목 2에서 고친 자리).
    // ⚠ **각차 최소가 {l1, l3}을 골라야 한다**(D-L72) — 그래서 둘을 소실점에서 멀리 두어
    //    거의 나란하게 만든다(sep 9.8°). TO_R2는 −39.4°라 둘 다에서 33° 넘게 떨어져 있다.
    //    그리고 둘 다 **10°**여야 한다 — 4~8°는 애매 구간이라 물음이 뜬다(`depth_min_deg`).
    const l1: RLine = { a: [100, 424.2], b: [240, 399.5] };        // → (600, 336) · −10°
    const l3: RLine = { a: [100, 247.8], b: [240, 272.5] };        // → (600, 336) · +10°
    let st = stepRule(newRuleState(SZ), l1, SZ).state;
    st = stepRule(st, TO_R2, SZ).state;
    const r = stepRule(st, l3, SZ);
    expect(r.event.type).toBe("vp_fixed");
    if (r.event.type === "vp_fixed") {
      expect(r.event.fov?.band).toBe("reject");        // **알린다** — 조용히 1점이 아니다
    }
    expect(r.state.slots[1]).toBeNull();
  });

  describe("14차 항목 3 — **선언된** 수평선이 깊이축을 하나로 만든다 (D-L96 · 11-1 복원)", () => {
    const V3: Pt2 = [700, 300];
    const toward3 = (from: Pt2, t = 0.4): RLine =>
      line(from, [from[0] + (V3[0] - from[0]) * t, from[1] + (V3[1] - from[1]) * t]);
    // **선언 = 스냅이 잡았거나 답했다**(D-L89) — 앱 경로는 직교 스냅이 hint "screen"을
    // 싣는다(mainL hint2d). 하네스는 그 신호를 그대로 흉내 낸다(#17).
    const declareH = (st: RuleState, l: RLine) => stepRule(st, l, SZ, undefined, {}, "screen");

    it("**재현 기하** — 깊이선 둘(수렴) + 수직 + **스냅 잡힌** 수평: 수평선이 그 자리에서 1점을 세운다", () => {
      // 14차 지시 3의 실측 재현: 이 넷이 **전부 대기**였다(8차 1-a가 unambiguous를 죽여서)
      let st = newRuleState(SZ);
      st = stepRule(st, toward3([200, 600]), SZ).state;          // 깊이 1 — 대기
      st = stepRule(st, toward3([300, 640]), SZ).state;          // 깊이 2 — (옛 판은 계속) 대기
      expect(st.slots[0]).toBeNull();                            // 아직 안 선다 — 11차 규칙 그대로
      st = stepRule(st, line([100, 50], [100, 500]), SZ).state;  // 수직 → 화면 세로축
      const r = declareH(st, line([100, 620], [400, 620]));      // 수평(스냅) — **여기서 선다**
      expect(r.event.type).toBe("vp_fixed");
      if (r.event.type === "vp_fixed") {
        // 소실점은 **그린 두 깊이선의 실제 교점**이다 — 수평선이 만든 점이 아니다
        expect(r.event.at[0]).toBeCloseTo(V3[0], 6);
        expect(r.event.at[1]).toBeCloseTo(V3[1], 6);
        expect(r.state.horizon).toBeCloseTo(V3[1], 6);           // 지평선 = 그 y(롤 0)
      }
      expect(perspectiveOrder(r.state)).toBe(1);                 // 화면 가로축 + 깊이 소실점
      expect(r.state.depthLines ?? []).toHaveLength(0);          // 풀이 비워졌다
    });

    it("선언이 **먼저**면 둘째 깊이선이 확정한다 — unambiguous의 복원", () => {
      const st = declareH(newRuleState(SZ), line([0, 100], [400, 100])).state;  // 가로 선언
      const r1 = stepRule(st, toward3([200, 600]), SZ);
      expect(r1.event.type).toBe("waiting");                     // 하나로는 교점이 없다
      const r2 = stepRule(r1.state, toward3([340, 650]), SZ);
      expect(r2.event.type).toBe("vp_fixed");                    // **둘로 선다** — 축이 하나뿐
      expect(perspectiveOrder(r2.state)).toBe(1);
    });

    it("**지지선이 뒤늦게 선언을 만들면 그 순간 선다** — 우연 분류 뒤 스냅 가로선", () => {
      let st = stepRule(newRuleState(SZ), line([0, 100], [400, 100]), SZ).state; // 우연(무의도)
      st = stepRule(st, toward3([200, 600]), SZ).state;
      st = stepRule(st, toward3([300, 640]), SZ).state;          // 무의도라 아직 대기다
      expect(([0, 1] as const).every(i => st.slots[i]?.kind !== "vp")).toBe(true);
      const r = declareH(st, line([0, 300], [400, 300]));        // 스냅 가로선 → 선언 승격
      expect(r.event.type).toBe("vp_fixed");
      expect(perspectiveOrder(r.state)).toBe(1);
    });

    it("**반례**(#30) — 수평 선언이 없으면 종전대로 두 선은 대기다(11차 규칙 불변)", () => {
      let st = newRuleState(SZ);
      st = stepRule(st, toward3([200, 600]), SZ).state;
      const r = stepRule(st, toward3([300, 640]), SZ);
      expect(r.event.type).toBe("waiting");                      // 세 번째 선이 정한다
      expect(r.state.slots[0]).toBeNull();
      // 수직 선언은 수평이 아니다 — 깊이축의 개수를 안 줄인다(같은 대기)
      const st2 = stepRule(r.state, line([100, 50], [100, 500]), SZ).state;
      expect(([0, 1] as const).every(i => st2.slots[i] == null || st2.slots[i]!.kind !== "vp"))
        .toBe(true);
    });

    it("**반례**(#30 — 무잡음 붕괴의 재현 방지) — **우연 분류** 가로축 아래서는 두 선이 안 선다", () => {
      // hint 없이 분류만으로 들어온 가로축(얕은 참-깊이선의 오분류 자리) — 슬롯은 차지만
      // 선언이 아니므로 unambiguous가 안 열린다. 초판(슬롯 존재로 열기)은 여기서
      // 다른 축 두 선의 교점(공간의 한 점)을 소실점으로 굳혔다 — 31.6° 붕괴의 기전.
      let st = stepRule(newRuleState(SZ), line([0, 100], [400, 100]), SZ).state;
      expect(st.slots[0]).toMatchObject({ kind: "screen", dir: "h" });
      st = stepRule(st, toward3([200, 600]), SZ).state;
      const r = stepRule(st, toward3([300, 640]), SZ);
      expect(r.event.type).toBe("waiting");                      // 종전대로 셋째를 기다린다
    });
  });

  it("화면 가로축이 이미 있으면 소실점은 다른 슬롯으로 간다", () => {
    // ⚠ 깊이선이 **셋**이다(8차 지시 1-a): 옛 판은 화면 가로축이 있으면 둘로 정했는데
    // (`unambiguous = order === 1`), P1이 가로선만으로 서던 그 지름길이 없어졌다.
    const st = feed([[line([0, 100], [400, 100])],
                     [toward([200, 600])], [toward([300, 640])], [toward([260, 620])]]);
    expect(st.slots[0]).toMatchObject({ kind: "screen" });
    expect(st.slots[1]).toMatchObject({ kind: "vp" });
    expect(perspectiveOrder(st)).toBe(1);
  });

  /**
   * **반례 테스트 — 오차 0**(4차 지시 3-d). 두 선을 긋고 소실점을 잡은 뒤 그 두 선이
   * 소실점을 정확히 향하는가 — 교점의 정의상 0이어야 하고(보장 확인, #5 — 임계를 안 건다),
   * 옛 규칙(선 ∩ 미리 깔린 지평선)에서는 **둘째 선이 0이 아니었다**(그 값이 이 시험의 판별력이다).
   */
  it("소실점을 만든 두 선의 부적합도가 정확히 0이다 — 옛 규칙은 여기서 깨진다", () => {
    const l1 = toward([200, 600]);
    const l2 = toward([300, 640]);
    const l3 = toward([420, 660]);                      // **셋째 선이 확정한다**(6차 지시 11)
    let st = newRuleState(SZ);
    st = stepRule(st, l1, SZ).state;
    st = stepRule(st, l2, SZ).state;
    st = stepRule(st, l3, SZ).state;
    const vp = (st.slots[0] as { at: Pt2 }).at;
    for (const l of [l1, l2, l3]) {
      const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
      expect(vpMisfit({ a: l.a, b: l.b, len, bend: 0 }, vp)).toBeLessThan(1e-12);
    }
    // **회귀 팔** — 옛 규칙의 소실점(l1 ∩ 기본 지평선 y=336)에 대해서는 l2의 부적합도가
    // 뚜렷이 0이 아니다. 이 값이 0이면 위 단언은 아무것도 배제하지 않는다(#30)
    const t = (SZ[1] / 2 - l1.a[1]) / (l1.b[1] - l1.a[1]);
    const oldVp: Pt2 = [l1.a[0] + t * (l1.b[0] - l1.a[0]), SZ[1] / 2];
    const len2 = Math.hypot(l2.b[0] - l2.a[0], l2.b[1] - l2.a[1]);
    expect(vpMisfit({ a: l2.a, b: l2.b, len: len2, bend: 0 }, oldVp)).toBeGreaterThan(1e-3);
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
    // **깊이선 둘(같은 소실점을 향한 짝)** → V1 = 교점(4차 지시 3). V1.y = 336 = 기본
    // 지평선과 같은 값이라 아래 c 절의 기대값(H)이 그대로 성립한다
    [seg(P0, V1)],
    [seg([560, 600], V1)],
    // **셋째 선이 확정한다**(6차 지시 11) — 같은 소실점으로 모이므로 V1이 그대로 선다
    [seg([420, 620], V1)],
  ]);

  it("선 하나로 2점이 된다", () => {
    const st0 = base();
    expect(perspectiveOrder(st0)).toBe(0);              // 소실점 하나 = NONE(지시 1)
    const r = stepRule(st0, seg(P0, V2), SZ);
    expect(r.event.type).toBe("vp_fixed");
    const v2 = (r.state.slots[1] as { at: Pt2 }).at;
    expect(v2[0]).toBeCloseTo(V2[0], 4);
    expect(v2[1]).toBeCloseTo(H, 9);
    expect(perspectiveOrder(r.state)).toBe(2);
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
  // ⚠⚠⚠ **이 칸의 계약이 2026-08-18 8차 지시 1-d로 뒤집혔고, 14차 항목 3(D-L96)이
  // 사거리를 갈랐다**: 밀어내기는 **무의도 잠정 가로축**(분류뿐 — 얕은 오분류의 자리)에만
  // 남는다. **선언된 가로축**(스냅·답변)은 깊이선 둘에서 P1을 세우므로 밀어내기 입구에
  // 못 가고, 그 뒤의 다른 축 선은 P1 불가역(D-L53)으로 거절된다(아래 14차 팔).
  it("**1-d** — **무의도** 잠정 가로축은 두 번째 소실점이 밀어낸다(P2가 도달 가능해야 한다)", () => {
    let st = feed([[line([0, 100], [400, 100])], [line([100, 50], [100, 500])]]);
    expect(st.slots[0]).toMatchObject({ kind: "screen", dir: "h" });
    expect(perspectiveOrder(st)).toBe(0);                      // 아직 카메라가 안 섰다
    // V1로 둘 + V2로 하나 → 갈리므로 **2점이 한 번에 선다**(D-L69)
    st = feed([[seg(P0, V1)], [seg([560, 600], V1)]], st);
    expect(perspectiveOrder(st)).toBe(0);                      // 무의도라 둘까지는 대기
    const r = stepRule(st, seg(P0, V2), SZ);
    expect(r.event.type).toBe("vp_fixed");
    expect(perspectiveOrder(r.state)).toBe(2);                 // **P2에 도달했다**
    expect(r.state.slots[0]).toMatchObject({ kind: "vp" });    // **밀렸다**
    expect(r.state.slots[1]).toMatchObject({ kind: "vp" });
    // **조용히 바꾸지 않는다**(A-3) — 밀어낸 사실을 사건에 실어 알린다
    if (r.event.type === "vp_fixed") expect(r.event.displacedScreenH).toBe(true);
  });

  it("**14차 3** — **선언된** 가로축 아래 깊이선 둘이 P1을 세우고, 이후 다른 축 선은 거절된다(D-L53)", () => {
    let st = stepRule(newRuleState(SZ), line([0, 100], [400, 100]), SZ,
                      undefined, {}, "screen").state;          // 스냅이 잡은 가로선 = 선언
    st = feed([[line([100, 50], [100, 500])]], st);
    expect(perspectiveOrder(st)).toBe(0);                      // 아직 카메라가 안 섰다
    st = feed([[seg(P0, V1)]], st);
    expect(perspectiveOrder(st)).toBe(0);                      // 한 선으로는 교점이 없다
    const r1 = stepRule(st, seg([560, 600], V1), SZ);
    expect(r1.event.type).toBe("vp_fixed");                    // **둘째 선이 P1을 세운다**
    expect(perspectiveOrder(r1.state)).toBe(1);
    const r2 = stepRule(r1.state, seg(P0, V2), SZ);
    expect(r2.event.type).toBe("rejected");                    // P1 불가역 — 안 밀린다
    expect(perspectiveOrder(r2.state)).toBe(1);
    expect(([0, 1] as const).some(i => r2.state.slots[i]?.kind === "screen")).toBe(true);
  });

  it("**회귀** — P1이 **실제로 선 뒤에는** 축을 안 향하는 깊이선이 거절되고 안 밀린다", () => {
    // 가로축 + V1로 셋 → 깊이 소실점이 하나 서서 **P1이 실제로 선다**
    let st = feed([[line([0, 100], [400, 100])], [line([100, 50], [100, 500])]]);
    st = feed([[seg(P0, V1)], [seg([560, 600], V1)], [seg([520, 560], V1)]], st);
    expect(perspectiveOrder(st)).toBe(1);
    expect(st.slots[0]).toMatchObject({ kind: "screen", dir: "h" });
    const r = stepRule(st, seg(P0, V2), SZ);
    // P1은 불가역이다(D-L53) — 소실점은 안 늘고 가로축도 안 밀린다
    expect(r.event.type).toBe("rejected");
    expect(perspectiveOrder(r.state)).toBe(1);
    expect(r.state.slots[0]).toMatchObject({ kind: "screen", dir: "h" });   // **안 밀렸다**
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
    // V1은 짝(서로 다른 시작점)으로, V2는 지평선 × 선 하나로(4차 지시 3 · 4-d)
    st = feed([[seg([300, 640], [V1[0], H])], [seg([520, 610], [V1[0], H])],
               [seg([620, 640], [V2[0], H])]], st);
    expect(st.slots[2]).toMatchObject({ kind: "screen", dir: "v" });
    expect(perspectiveOrder(st)).toBe(2);
  });

  /**
   * **회귀 팔**(A-4). 옛 코드를 되살리면 이 시험이 실제로 깨진다 — 고치기 전 상태에서
   * 이 입력이 `{kind:"vp", source:"orthocenter"}`를 냈다.
   */
  // ⛔ **대상이 사라졌다**(2026-08-18 7차 지시 3-b·3-c) — `deriveVertical`(수심 유도의
  //    마지막 잔재)과 "수직축입니까" 물음이 함께 없어졌다. 3점은 **카메라를 기울인 시점의
  //    성질**이고 그 시점의 축 방향은 `viewCamera.viewPlaceCtx`가 낸다.
  //    **지우지 않고 은퇴로 표시한다** — 왜 그 규칙이 있었는지가 근거다(PITFALLS 머리말).
  //    세 세대의 기록: ① 수심 유도(D-L32·D-L43) ② 사용자 선언(A-4) ③ 없음(7차).
  it.skip("**회귀** — 선언이 없으면 유도하지 않는다. 지평선이 어디 있든 수직축은 화면 수직이다", () => {});
  it.skip("**양성** — 기울어진 수직선을 답하면 그 선에서 V₃가 나온다 (측정이다)", () => {});
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
