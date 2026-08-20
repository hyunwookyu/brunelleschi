// **렌즈 표현 셋의 왕복**(2026-08-20 18차 지시 r-2).
//
// 잠그는 것 셋:
//   ① 세 표현이 **같은 하나**를 말한다 — 왕복이 항등이다(**보장**이다, #5: 임계를 안 건다.
//      값이 아니라 «두 식이 서로의 역인가»를 확인한다)
//   ② **가로** 화각이다 — 세로(three의 `fov`)와 다른 양임을 반례가 짚는다
//   ③ 35mm 환산의 기준이 풀프레임 가로 36mm다
import { describe, it, expect } from "vitest";
import { fovDegFromF, fFromFovDeg, mm35FromF, fFromMm35, FULL_FRAME_MM, clampMm, LENS_MM }
  from "../src/s3d/lens.js";

const W = 1280;

describe("렌즈 — 초점거리의 세 표현", () => {
  it("f ↔ 화각 왕복이 항등이다(**보장** — 두 식이 서로의 역이다)", () => {
    for (const f of [400, 800, 1200, 2400]) {
      expect(fFromFovDeg(fovDegFromF(f, W), W)).toBeCloseTo(f, 9);
    }
  });

  it("f ↔ 35mm 환산 왕복이 항등이다(**보장**)", () => {
    for (const f of [400, 800, 1200, 2400]) {
      expect(fFromMm35(mm35FromF(f, W), W)).toBeCloseTo(f, 9);
    }
  });

  it("하나를 바꾸면 다른 것이 따라온다 — 짧을수록 넓다(단조)", () => {
    const wide = fFromMm35(20, W), tele = fFromMm35(85, W);
    expect(wide).toBeLessThan(tele);
    expect(fovDegFromF(wide, W)).toBeGreaterThan(fovDegFromF(tele, W));
  });

  it("35mm 환산의 기준은 **가로 36mm**다 — f = W면 정확히 36mm다", () => {
    expect(mm35FromF(W, W)).toBeCloseTo(FULL_FRAME_MM, 9);
    expect(fFromMm35(FULL_FRAME_MM, W)).toBeCloseTo(W, 9);
  });

  it("**반례** — 가로 화각은 세로 화각이 아니다(화면이 정사각형이 아닌 한 다르다)", () => {
    const f = 800, H = 675;
    const horiz = fovDegFromF(f, W);
    const vert = fovDegFromF(f, H);          // 같은 식에 **높이**를 넣으면 세로 화각이다
    expect(Math.abs(horiz - vert)).toBeGreaterThan(5);
    expect(horiz).toBeGreaterThan(vert);     // 가로가 넓다(W > H)
  });

  it("조절 범위로 죈다 — 표시 상수다(판정 임계가 아니다)", () => {
    expect(clampMm(2)).toBe(LENS_MM.min);
    expect(clampMm(999)).toBe(LENS_MM.max);
    expect(clampMm(50)).toBe(50);
  });
});
