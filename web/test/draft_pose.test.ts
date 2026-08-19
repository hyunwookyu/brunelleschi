// **작도 시점 판정·복귀 방향**(14차 항목 6 · D-L97) — `judgeDraftPose`의 계약.
//
// 판정 단위는 각도다(#49 — 피치·요 이탈). 임계는 D-L66의 `ONE_POINT_TOL.hand_deg`(2°)
// 재사용이라 새 상수가 없다. 반례 팔(#30): 모델링 판정(피치 큰 쪽)과 경계 ±1°.

import { describe, it, expect } from "vitest";
import { judgeDraftPose } from "../src/s3d/draftPose.js";
import { ONE_POINT_TOL } from "../src/s3d/onePoint.js";
import type { Vec3 } from "../src/s3d/geom3d.js";

const H = ONE_POINT_TOL.hand_deg;
const rad = (d: number) => (d * Math.PI) / 180;
/** 요·피치 → three 규약 시선(y 위·z 앞·정면 = −z). */
const gaze = (yawDeg: number, pitchDeg: number): Vec3 => [
  Math.cos(rad(pitchDeg)) * Math.sin(rad(yawDeg)),
  Math.sin(rad(pitchDeg)),
  -Math.cos(rad(pitchDeg)) * Math.cos(rad(yawDeg)),
];

describe("judgeDraftPose — 작도/모델링 판정 (14차 항목 6-d)", () => {
  it("정면(피치 0·요 0)은 1점이고 복귀 방향은 자기 자신이다", () => {
    const j = judgeDraftPose(gaze(0, 0), H);
    expect(j.kind).toBe("one_point");
    expect(j.returnDir[0]).toBeCloseTo(0, 9);
    expect(j.returnDir[1]).toBe(0);
    expect(j.returnDir[2]).toBeCloseTo(-1, 9);
  });

  it("피치 0·요 45°는 2점이고 요가 유지된다(지시 6-a — 요가 축 사이)", () => {
    const j = judgeDraftPose(gaze(45, 0), H);
    expect(j.kind).toBe("two_point");
    expect(Math.atan2(j.returnDir[0], -j.returnDir[2])).toBeCloseTo(rad(45), 9);
    expect(j.returnDir[1]).toBe(0);
  });

  it("반례(#30): 피치가 임계 밖이면 모델링이다 — 요 정렬이어도", () => {
    expect(judgeDraftPose(gaze(0, H + 1), H).kind).toBeNull();
    expect(judgeDraftPose(gaze(0, 30), H).kind).toBeNull();
    expect(judgeDraftPose(gaze(45, -25), H).kind).toBeNull();
  });

  it("경계 ±1°: 피치 임계 안은 작도·밖은 모델링, 요 이탈 임계 안은 1점·밖은 2점", () => {
    expect(judgeDraftPose(gaze(0, H - 1), H).kind).toBe("one_point");
    expect(judgeDraftPose(gaze(0, H + 1), H).kind).toBeNull();
    expect(judgeDraftPose(gaze(H - 1, 0), H).kind).toBe("one_point");
    expect(judgeDraftPose(gaze(H + 1, 0), H).kind).toBe("two_point");
  });

  it("모델링 시점의 복귀 방향: 피치를 접고 요를 유지한다(2점 복귀 — 최소 회전)", () => {
    const j = judgeDraftPose(gaze(30, 25), H);
    expect(j.kind).toBeNull();
    expect(j.returnDir[1]).toBe(0);                                  // 피치 0
    expect(Math.atan2(j.returnDir[0], -j.returnDir[2])).toBeCloseTo(rad(30), 9);
    expect(Math.hypot(...j.returnDir)).toBeCloseTo(1, 9);
  });

  it("요가 축에 가까우면(임계 안) 복귀가 그 축으로 스냅된다 — 1점 복귀(D-L66 재탭과 같은 답)", () => {
    const j = judgeDraftPose(gaze(90 + (H - 1), 20), H);
    expect(Math.atan2(j.returnDir[0], -j.returnDir[2])).toBeCloseTo(rad(90), 9);
    const j2 = judgeDraftPose(gaze(-(H - 1), -15), H);
    expect(Math.atan2(j2.returnDir[0], -j2.returnDir[2])).toBeCloseTo(0, 9);
  });

  it("네 축 전부에서 요 스냅이 자기 축으로 간다(0·90·180·−90)", () => {
    for (const y of [0, 90, 180, -90]) {
      const j = judgeDraftPose(gaze(y + 1, 10), H);
      const back = (Math.atan2(j.returnDir[0], -j.returnDir[2]) * 180) / Math.PI;
      const diff = Math.abs(back - y);
      expect(Math.min(diff, 360 - diff)).toBeLessThan(1e-9);
    }
  });

  it("특이점(수직 응시)은 결정론적 기본값(정면)이다 — 요 유지가 성립하지 않는 자리", () => {
    const j = judgeDraftPose([0, 1, 0], H);
    expect(j.kind).toBeNull();
    expect(j.returnDir).toEqual([0, 0, -1]);
  });

  it("피치의 부호와 무관하다 — 내려보나 올려보나 같은 요면 같은 복귀", () => {
    const a = judgeDraftPose(gaze(60, 20), H).returnDir;
    const b = judgeDraftPose(gaze(60, -20), H).returnDir;
    expect(a[0]).toBeCloseTo(b[0], 12);
    expect(a[2]).toBeCloseTo(b[2], 12);
  });
});
