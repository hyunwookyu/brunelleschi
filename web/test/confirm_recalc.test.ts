// **확정 후 재계산 회귀 팔**(2026-08-19 14차 항목 0-d).
//
// 원칙(지시 머리말): 그리는 도중 스냅 → 사용자가 보고 받아들인 것 — 그대로 확정.
// 확정 후 재계산 → 사용자가 안 본 변경 — 이것이 문제다.
//
// 잠그는 것 넷:
//   ① **스냅이 안 걸린 획은 그은 그대로다** — 임계 밖 방향·종류 끔에서 `resolve2dCore`가
//      점열을 한 점도 안 옮긴다(참조 동일까지 — `pts === raw`).
//   ② **스냅이 걸린 획은 그 결과가 최종이다** — 같은 입력에 같은 출력(미리보기=확정의
//      결정성. ⚠ 이것은 순수 함수의 **보장**이지 측정이 아니다(#5) — 배선(같은 함수를
//      부르는 것)은 confirm_dir.spec·dir_state.spec 종단이 잠근다).
//   ③ **판정은 라벨이지 형태 변경이 아니다** — `classifyStroke`가 입력 점열을 변이하지
//      않는다(0-b: angleWiden·rank_margin 완화는 라벨에만 작용해야 한다).
//   ④ **연쇄 되쓰기 가드의 판별식** — 확정 후 배치(승격 연쇄·교차 앵커)가 `pts2d`를 축
//      투영으로 되쓸 때, 그 회전이 `LIFT_TOL.parallel_deg`(나란함 판정 — 임계 선택의
//      두 라운드 논증은 D-L92)를 넘으면 막는다. 여기 팔들은 판별식에 값을
//      넣는 **보장 확인**이고(#5), 앱 경로의 버그 되살림(옛 거동 = setChainDirGuard(false)
//      에서 회전이 실제로 들어가는 것)은 `dir_state.spec.ts`의 짝 대조 팔이 잰다(#30·A-4).
//
// 착수 시 PITFALLS 대조: #5(②·④의 보장/판별 구분) · #12·#13(동작점 — 경계 양쪽 팔) ·
// #17(새 임계 없음 — LIFT_TOL.parallel_deg 재사용) · #43(가드 카운터는 mainL에 분모와 함께).
import { describe, it, expect } from "vitest";
import { resolve2dCore, type Resolve2dCtx } from "../src/s3d/resolve2d.js";
import { chordTurnDeg, classifyStroke, representative, vpMisfit } from "../src/s3d/axis.js";
import { LIFT_TOL } from "../src/s3d/lift.js";
import type { Pt2 } from "../src/s3d/camera.js";
import type { Snap2Cand } from "../src/s3d/snap2d.js";

const IMG: [number, number] = [1200, 800];
const VP: Pt2 = [1000, 400];

const ctxOf = (over: Partial<Resolve2dCtx> = {}): Resolve2dCtx => ({
  cands: [], vps: [VP, null, null], radiusPx: 8, relSnap: false, ...over,
});

describe("① 스냅이 안 걸린 획은 그은 그대로다 (0-b·0-d)", () => {
  it("임계 밖 방향(직교·소실점 어느 쪽도 아님) — 점열이 참조까지 그대로다", () => {
    // 시작 (200,600) → 소실점 방향과 대략 수직, 화면축과 45° — 어느 스냅도 임계 밖
    const raw: Pt2[] = [[200, 600], [230, 570], [260, 540], [290, 510]];
    const r = resolve2dCore(raw, ctxOf());
    expect(r.engaged).toBe(false);
    expect(r.pts).toBe(raw);                       // 복사조차 안 한다 — 그은 그대로
    expect(r.start2).toBeNull();
    expect(r.end2).toBeNull();
  });

  it("종류를 다 꺼도(오스냅 끔) 후보가 있든 말든 좌표가 안 움직인다", () => {
    const raw: Pt2[] = [[200, 600], [290, 510]];
    const cand: Snap2Cand = { kind: "endpoint", at: [203, 598], dist: 0 };
    const kindsOff = { endpoint: false, vertex: false, midpoint: false,
                       intersection: false, perpendicular: false,
                       on_edge: false, on_face: false, extension: false } as const;
    const r = resolve2dCore(raw, ctxOf({ cands: [cand], kinds: kindsOff }));
    expect(r.start2).toBeNull();
    expect(r.pts).toBe(raw);
  });
});

describe("② 스냅이 걸린 획은 그 결과가 최종이다", () => {
  it("소실점 방향 스냅 — 걸리면 정확히 소실점을 지나고, 같은 입력에 같은 출력이다", () => {
    // 소실점을 1.5°쯤 벗어난 겨냥 — vpDirSnap 임계 안(이 기하에서 misfit ≈ 0.017)
    const a: Pt2 = [200, 400];
    const th = (1.5 * Math.PI) / 180;
    const b: Pt2 = [a[0] + 300 * Math.cos(th), a[1] + 300 * Math.sin(th)];
    const raw: Pt2[] = [a, b];
    const r1 = resolve2dCore(raw, ctxOf());
    expect(r1.vpdir).not.toBeNull();
    const rep = representative(r1.pts)!;
    expect(vpMisfit(rep, VP)).toBeLessThan(1e-9);  // 스냅 후 소실점 위 — 정의상 0(#5)
    // **결정성** — 확정이 미리보기와 같은 함수를 같은 입력으로 부르면 같은 좌표다.
    const r2 = resolve2dCore(raw.map(q => [q[0], q[1]] as Pt2), ctxOf());
    expect(r2.pts).toEqual(r1.pts);
  });
});

describe("③ 판정은 라벨이지 형태 변경이 아니다 (0-b)", () => {
  it("classifyStroke가 입력 점열을 변이하지 않는다", () => {
    const raw: Pt2[] = [[200, 100], [400, 175], [600, 250]];   // VP(1000,400)를 정확히 겨냥
    const snapshot = raw.map(q => [q[0], q[1]] as Pt2);
    const v = classifyStroke(raw, [VP, null, null], IMG,
                             {}, { principal: [600, 400], f: 900 });
    expect(v.axis).not.toBe("free");               // 실제로 배정이 났다 — 라벨은 붙는다
    expect(raw).toEqual(snapshot);                 // 좌표는 한 점도 안 움직였다
  });
});

describe("④ 연쇄 되쓰기 가드의 판별식 (0-a·0-c — 버그 되살림)", () => {
  const A: Pt2 = [300, 300];
  /** 그은 현: A에서 각도 th(도)로 200px. */
  const chord = (thDeg: number): [Pt2, Pt2] => {
    const t = (thDeg * Math.PI) / 180;
    return [A, [A[0] + 200 * Math.cos(t), A[1] + 200 * Math.sin(t)]];
  };

  it("옛 거동의 실물 — 20° 어긋난 획을 축 투영으로 되쓰면 그 회전이 그대로 들어간다", () => {
    const [a0, b0] = chord(35);                    // 사용자가 그은 것
    const [a1, b1] = chord(15);                    // 축 투영이 만드는 것 — 20° 회전
    const turn = chordTurnDeg(a0, b0, a1, b1);
    expect(turn).toBeCloseTo(20, 5);
    // **가드가 이것을 잡는다** — 옛 거동(가드 없음)이라면 이 회전이 조용히 확정됐다.
    // ⚠ 이 두 팔은 판별식에 값을 넣는 **보장 확인**이다(#5) — 앱 경로에서 옛 거동을
    // 실제로 되살리는 팔은 `dir_state.spec.ts`의 setChainDirGuard(false) 짝 대조다(#30).
    expect(turn > LIFT_TOL.parallel_deg).toBe(true);
  });

  it("임계 안(3°)의 정렬은 통과한다 — 축 인정 범위 안의 정렬이다", () => {
    const [a0, b0] = chord(18);
    const [a1, b1] = chord(15);
    expect(chordTurnDeg(a0, b0, a1, b1)).toBeCloseTo(3, 5);
    expect(chordTurnDeg(a0, b0, a1, b1) > LIFT_TOL.parallel_deg).toBe(false);
  });

  it("경계 양쪽 — 임계(LIFT_TOL.parallel_deg)의 바로 안은 통과, 바로 밖은 걸린다 (#12·#13)", () => {
    const t = LIFT_TOL.parallel_deg;                   // 등록 상수 — 값을 산문에 안 박는다(#47)
    const inBand = chordTurnDeg(...chord(15 + t - 1), ...chord(15));
    const outBand = chordTurnDeg(...chord(15 + t + 1), ...chord(15));
    expect(inBand).toBeCloseTo(t - 1, 4);
    expect(outBand).toBeCloseTo(t + 1, 4);
    expect(inBand > t).toBe(false);
    expect(outBand > t).toBe(true);
  });

  it("각은 선의 각이다 — 진행 방향 뒤집힘·퇴화는 0", () => {
    const [a0, b0] = chord(35);
    expect(chordTurnDeg(a0, b0, b0, a0)).toBeCloseTo(0, 4);   // 뒤집힘 — 축은 부호가 없다
    expect(chordTurnDeg(a0, a0, a0, b0)).toBe(0);             // 퇴화 — 판정하지 않는다
  });
});
