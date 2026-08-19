// **12차 항목 2 — 축 배정 획의 방향 일관성 회귀 팔**(지시 2-d).
//
// 실획 두 표본(⚠ **파일은 저장소에 없다** — 사람 보고, b4f2d9b 선례)의 실측:
// 축 배정 획의 2D 현 방향과 소실점 방향의 차가 **Δ0.00°~20.80°**로 퍼졌다.
// 정확히 붙은 것(s78)은 `snapStart`가 있었고, 벗어난 것(s65 Δ20.80·s66 Δ16.59)은 없었다.
//
// 원인(코드 독해 + 이 팔이 잠근다):
//   · 앵커 있는 획 → 축 스냅 + `placeLive`의 되쓰기(D-L71) → Δ = 0.
//   · 앵커 없는 획 → (옛 판) `onStrokeEnd`의 2D 판(`resolve2d`)이 **카메라 확정 전에만**
//     돌아서, 확정 뒤의 무앵커 획은 미리보기도 방향 스냅도 없이 원시 궤적으로 남았다.
//     분류(`classifyStroke`)는 완화 임계(angleWiden·rank_margin)로 축을 배정하므로
//     **축은 붙는데 방향은 안 붙는다.** (파일 2의 Δ16~20°는 화각 163° 카메라에서
//     angleWiden이 폭발한 몫이고, 그 카메라는 12차 항목 1의 상한이 이제 거부한다.)
//
// 고침(12차 항목 2): 무앵커 획도 확정 시 같은 2D 판(`resolve2d` → `dirSnap2dCore`)을
// 지난다 — 조리개 안 겨냥은 방향이 소실점을 정확히 지나고, 그 획은 일괄 풀이에서
// **정확한 축으로** 풀린다(아래 사슬 팔). 이 파일은 그 기전의 **원시 함수**를 앱과 같은
// 인자로 부른다(#17 — 앱 배선 자체는 e2e·측정 하네스 몫).
//
// ⚠ **일괄 풀이(liftAll)에는 되쓰기가 없고 필요도 없다**(이 세션이 실측으로 확인):
// liftAll의 끝점은 그 화면점의 광선 위에 있어 **재투영이 그린 현과 정확히 같다** —
// 잉크와 3D가 그 경로에서는 자기일관이다(아래 항등 팔이 잠근다). 처음 계획(재투영
// 되쓰기)은 "liftAll의 3D가 정확히 축"이라는 **틀린 전제**였고, 실측(재투영 = 원 현)이
// 그것을 기각했다 — 기각의 기록으로 항등 팔을 남긴다(A-3: 측정을 따른다).
//
// ⚠ 픽스처의 카메라·겨냥각은 **보고값의 재구성**이다(f/W 0.431 = 파일1 보고 ·
// Δ1.33/12.81 = 보고된 s42·s41) — 실측이 아니라고 여기 명시한다. #46: 각들은 픽스처
// 상수가 맞고, 정보를 나르는 것은 **스냅·풀이가 그 각을 0으로 만드는가**다(판별:
// 스냅을 안 거친 원시 현 팔은 그 각이 그대로 남는다 — 양방향 도달, #30).
import { describe, it, expect } from "vitest";
import { dirSnap2dCore } from "../src/s3d/resolve2d.js";
import { liftAll, type LiftStroke } from "../src/s3d/lift.js";
import { classifyStroke } from "../src/s3d/axis.js";
import { axisDirection, project } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { vpDirErrDeg } from "./vpDirErr.js";

// 파일1 보고 기하의 재구성(h = 0 대칭 — confirm_rules의 재구성과 같은 규약)
const W = 1180, H = 668;
const P: Pt2 = [W / 2, H / 2];
const F = 0.431 * W;                                   // 508.58 — 보고 f/W 0.431
const VP0: Pt2 = [P[0] - F, P[1]];
const VP1: Pt2 = [P[0] + F, P[1]];
const VPS: (Pt2 | null)[] = [VP0, VP1, null];
const DIRS = [axisDirection(VP0, P, F), axisDirection(VP1, P, F), null];
const A0: Pt2 = [300, 500];

/** 시작점 A0에서 소실점 방향으로 겨냥하되 δ°만큼 튼 길이 150px의 현. */
function aimed(vp: Pt2, deltaDeg: number, len = 150): Pt2 {
  const th = Math.atan2(vp[1] - A0[1], vp[0] - A0[0]) + (deltaDeg * Math.PI) / 180;
  return [A0[0] + len * Math.cos(th), A0[1] + len * Math.sin(th)];
}

/** 파트너 획(축 1, 정확 겨냥) — liftAll은 이어진 획이 둘 이상이어야 푼다. */
const PARTNER: LiftStroke = { id: "p", pts2d: [A0, aimed(VP1, 0)], axis: 1 };

describe("12차 항목 2 — 무앵커 획의 방향 일관성(보고 Δ0.00~20.80°의 재구성)", () => {
  it("조리개 안 겨냥(Δ1.33° — 보고 s42)은 방향 스냅이 소실점을 정확히 지나게 한다", () => {
    const b = aimed(VP0, 1.33);
    expect(vpDirErrDeg(A0, b, VP0)!).toBeCloseTo(1.33, 2);    // 픽스처 검산
    const d = dirSnap2dCore(A0, b, VPS);
    expect(d.vpdir).not.toBeNull();                           // 임계 안 — 걸린다(아래 경계 팔)
    // ⚠ **스냅 후 Δ = 0은 구성의 항등이다**(#5 · 2차 리뷰어 [5] — vpDirSnap이 끝점을
    // a→V 직선 위로 수직 투영하므로 정의상 0이다). 측정이 아니라 배선 확인으로 둔다 —
    // 이 팔의 측정 내용은 \"1.33°가 임계 **안**\"이라는 발동 여부뿐이다.
    expect(vpDirErrDeg(A0, d.at, VP0)!).toBeLessThan(1e-6);
  });

  it("스냅 임계 양쪽의 동작점(#12 — 2차 리뷰어 [4]) — 경계를 사이에 둔 두 겨냥이 갈린다", () => {
    // 임계는 각이 아니라 **부적합도**다(#49): vpMisfit는 **중점**의 수직 거리 ÷ 현 길이라
    // (axis.ts — 먼 끝점 p 기준), 곧은 현을 δ만큼 틀면 misfit = (|m−p|/len)·sinδ = 0.5·sinδ.
    // 발동 경계각 δ* = asin(2·0.06) ≈ **6.89°** — 곧은 현에서는 기하와 무관하다.
    // ⚠ 초판 산문의 "≈3.44°"(asin 0.06)는 중점 계수 0.5를 빠뜨린 **오기**였고(2차
    // 리뷰어 [4]가 요구한 경계 팔이 그 오기를 잡았다) 이 팔이 실측으로 잠근다.
    expect(dirSnap2dCore(A0, aimed(VP0, 6.7), VPS).vpdir).not.toBeNull();
    expect(dirSnap2dCore(A0, aimed(VP0, 7.1), VPS).vpdir).toBeNull();
  });

  it("사슬 — 스냅된 겨냥은 일괄 풀이에서도 정확한 축으로 풀린다(재투영 Δ ≈ 0)", () => {
    const snapped = dirSnap2dCore(A0, aimed(VP0, 1.33), VPS).at;
    const r = liftAll([{ id: "s42r", pts2d: [A0, snapped], axis: 0 }, PARTNER],
                      { principal: P, f: F, vps: VPS, imgSize: [W, H], axisDirs: DIRS });
    const seg = r.placed.get("s42r")!;
    expect(seg).toBeTruthy();
    const q0 = project(seg.a, P, F)!, q1 = project(seg.b, P, F)!;
    expect(vpDirErrDeg([q0[0], q0[1]], [q1[0], q1[1]], VP0)!).toBeLessThan(0.01);
  });

  it("조리개 밖 겨냥(Δ12.81° — 보고 s41)은 방향 스냅이 안 걸린다 — 그린 대로 남는 자리", () => {
    const b = aimed(VP0, 12.81);
    const d = dirSnap2dCore(A0, b, VPS);
    expect(d.vpdir).toBeNull();                               // 발동 경계(≈6.89°) 밖 — 스냅 아님
    // 그린 현은 안 움직인다(A-3) — 보고의 Δ가 그대로 남는 것이 옳은 동작이다
    expect(vpDirErrDeg(A0, b, VP0)!).toBeCloseTo(12.81, 2);
  });

  it("항등 — 일괄 풀이의 재투영은 그린 현과 같다(잉크↔3D 자기일관 · 되쓰기 불요의 근거)", () => {
    // ⚠ 이것은 **측정이 아니라 구성의 항등이다**(#5 — liftAll 끝점이 광선 위에 있다).
    // 임계를 걸지 않고, "재투영 되쓰기가 필요하다"던 초안 전제의 **기각 기록**으로 남긴다.
    const b = aimed(VP0, 12.81);
    const r = liftAll([{ id: "s41r", pts2d: [A0, b], axis: 0 }, PARTNER],
                      { principal: P, f: F, vps: VPS, imgSize: [W, H], axisDirs: DIRS });
    const seg = r.placed.get("s41r")!;
    expect(seg).toBeTruthy();
    const q0 = project(seg.a, P, F)!, q1 = project(seg.b, P, F)!;
    const ends = [[q0[0], q0[1]], [q1[0], q1[1]]] as Pt2[];
    // 재투영 끝점 집합 = {A0, b} (순서 무관, 광선 항등)
    const near = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
    expect(ends.some(e => near(e, A0)) && ends.some(e => near(e, b))).toBe(true);
  });

  it("분류의 완화 임계는 넓은 각도 배정할 수 있다 — 배정 ≠ 방향 정착(원인의 재현)", () => {
    // 보고 Δ12.81(s41)급의 획이 축 배정을 받으면 "축은 붙는데 방향은 안 붙는다"가 성립하는
    // 그 자리다. 배정 여부 자체는 완화 임계의 성질이라 고정하지 않는다(#12). 재는 것은:
    // **배정이 나더라도 그 축의 소실점 방향과 현의 각차가 스냅 발동 경계(≈6.89°)를 넘는다.**
    const b = aimed(VP0, 12.81);
    const v = classifyStroke([A0, b], VPS, [W, H], {}, { principal: P, f: F });
    if (typeof v.axis === "number") {
      // 배정됐는데 현은 스냅 발동 경계(≈6.89° — 위 경계 팔)보다 밖이다
      expect(vpDirErrDeg(A0, b, VPS[v.axis]!)!).toBeGreaterThan(7.1);
    }
    // 배정이 안 나면 이 획은 미분류 대기다 — 그것도 "조용히 틀리지 않는" 옳은 결과다
  });
});
