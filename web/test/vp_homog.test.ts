// L-A.7 **동차 소실점 표현** — `docs/line_plan.md` §5.4의 발산 대응.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   **#24(단위 변경은 아무것도 고치지 않는다 — D-L2에서 걸린 자리)** · #3 · #6 · #13 · #25 · #26
//
// **#24가 이 항목의 중심이다.** 그래서 반례를 양쪽으로 박는다:
//   ① 동차 표현이 **실제로** 발산을 없애는가 (위치 표현과 대조)
//   ② 그런데도 **카메라는 여전히 발산하는가** — 그렇다면 재매개화가 만능이 아니라는 뜻이고
//      §c의 무한원 스냅이 필요한 이유가 된다. **고쳐지지 않는 것을 고쳤다고 적지 않는다.**
import { describe, it, expect } from "vitest";
import {
  vpFromGuides, separationDeg, angleBetweenVp, frameOf, HOMOG_TOL,
} from "../src/s3d/vpHomog.js";
import { lineIntersect, recoverCamera, type Pt2 } from "../src/s3d/camera.js";

const SZ: [number, number] = [960, 672];
const g = (ax: number, ay: number, bx: number, by: number) =>
  ({ a: [ax, ay] as Pt2, b: [bx, by] as Pt2 });

describe("동차 소실점 표현 (§5.4 발산 대응)", () => {
  it("유한 소실점은 옛 경로와 같은 점을 준다 (표현만 바뀐다)", () => {
    const g1 = g(100, 200, 500, 260), g2 = g(100, 500, 500, 440);
    const r = vpFromGuides(g1, g2, SZ);
    const old = lineIntersect(g1.a, g1.b, g2.a, g2.b)!;
    expect(r.infinite).toBe(false);
    expect(Math.hypot(r.point![0] - old[0], r.point![1] - old[1])).toBeLessThan(1e-6);
  });

  it("**나란한 가이드에서 값이 튀지 않는다** — 위치 표현과 대조", () => {
    // 두 번째 가이드를 조금씩 돌려 나란함에 접근시킨다
    const base = g(100, 200, 700, 200);
    const posJumps: number[] = [], angJumps: number[] = [];
    let prevPt: Pt2 | null = null, prevV: [number, number, number] | null = null;
    for (let k = 0; k <= 40; k++) {
      const dy = 60 - k * 1.5;                      // 60 → 0 (마지막이 정확히 나란)
      const cur = g(100, 500, 700, 500 - dy);
      const r = vpFromGuides(base, cur, SZ, { snap_deg: 0 });   // 스냅을 꺼서 표현만 본다
      const pt = lineIntersect(base.a, base.b, cur.a, cur.b);
      if (prevPt && pt) posJumps.push(Math.hypot(pt[0] - prevPt[0], pt[1] - prevPt[1]));
      if (prevV) angJumps.push(angleBetweenVp(prevV, r.v));
      prevPt = pt; prevV = r.v;
    }
    // 위치 표현은 **발산한다** — 한 걸음에 화면 대각의 수십 배가 움직인다
    expect(Math.max(...posJumps)).toBeGreaterThan(10 * Math.hypot(...SZ));
    // 동차(각도) 표현은 **유계**다 — 한 걸음이 몇 도를 넘지 않는다
    expect(Math.max(...angJumps)).toBeLessThan(5);
  });

  it("정확히 나란하면 무한원이다 (c=0, 이론서 2.2)", () => {
    const r = vpFromGuides(g(100, 200, 700, 200), g(100, 500, 700, 500), SZ);
    expect(r.infinite).toBe(true);
    expect(r.point).toBeNull();
    expect(r.degenerate).toBe(false);              // 퇴화가 아니다 — 무한원은 정상 상태다
    expect(r.sepDeg).toBeLessThan(1e-9);
  });

  it("**스냅 임계가 실제로 작동한다** — 각차가 임계 미만이면 무한원으로 본다", () => {
    // 각차 약 1.9° — 임계 3.0° 미만
    const g1 = g(100, 200, 700, 200), g2 = g(100, 500, 700, 480);
    expect(separationDeg(g1, g2)).toBeLessThan(HOMOG_TOL.snap_deg);
    expect(vpFromGuides(g1, g2, SZ).infinite).toBe(true);
    // 임계를 0으로 내리면 유한으로 잡힌다 — 이 조건이 막고 있음을 확인한다
    expect(vpFromGuides(g1, g2, SZ, { snap_deg: 0 }).infinite).toBe(false);
  });

  it("**반례** — 같은 직선 둘이면 퇴화다(소실점이 정의되지 않는다)", () => {
    const r = vpFromGuides(g(100, 200, 700, 260), g(100, 200, 700, 260), SZ);
    expect(r.degenerate).toBe(true);
    expect(r.point).toBeNull();
  });

  it("**반례 — 재매개화가 카메라의 발산까지 고치지는 않는다**(PITFALLS #24)", () => {
    // 축 둘을 두고 하나를 점점 화면 평행으로 보낸다. 동차 표현은 유계인데(위 테스트)
    // `f² = −(V₁−P)·(V₂−P)`는 **실제로 발산한다** — 기하가 그렇다.
    const P: Pt2 = [SZ[0] / 2, SZ[1] / 2];
    const V1: Pt2 = [-800, 336];
    const fs: number[] = [];
    for (const D of [900, 3000, 20000, 200000]) {
      const cam = recoverCamera([V1, [P[0] + D, 336], null], SZ);
      if (cam.ok && cam.f) fs.push(cam.f);
    }
    // `f = √(|PV₁|·|PV₂|)`이므로 거리에 √로 발산한다. **상한이 있는 것은 기하가 아니라
    // `isFiniteVp`의 절단**(대각의 50배) 때문이고, 그 안에서도 4.7배 움직인다.
    expect(fs.length).toBeGreaterThanOrEqual(3);
    expect(fs[fs.length - 1] / fs[0]).toBeGreaterThan(4);    // f가 발산한다
    // **그래서 무한원 스냅이 필요하다** — 개수가 줄어 1·2점 분기로 떨어지는 것이 정답이다
    const two = recoverCamera([V1, null, null], SZ, { fSetting: 1000 });
    expect(two.case).toBe("1pt");
    expect(two.f).toBe(1000);                                 // 설정값이 채운다(AS-C4)
  });

  it("정규화 프레임 왕복이 항등이다", () => {
    const F = frameOf(SZ);
    const p: Pt2 = [123, 456];
    const n = [(p[0] - F.cx) / F.diag, (p[1] - F.cy) / F.diag];
    expect(n[0] * F.diag + F.cx).toBeCloseTo(p[0], 9);
    expect(n[1] * F.diag + F.cy).toBeCloseTo(p[1], 9);
  });
});
