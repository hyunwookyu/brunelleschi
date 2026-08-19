// **어느 시점에서든 축 셋의 소실점**(2026-08-19 15차 항목 8 · D-L101 · `src/s3d/axisVp.ts`).
//
// 잠그는 성질:
//   ① 축 방향의 소실점은 `principal + f·(dx,dy)/dz`이고 **`d`와 `−d`가 같은 점**이다
//   ② `dz → 0`이면 무한원 — 그때도 **화면 방향**은 있다(이론서 2.2, c=0)
//   ③ 지평선은 **수평 소실점 둘을 잇는 선**이다 — 롤이 있으면 화면에서 기운다
//   ④ 하나만 유한이면 그 점을 지나 무한원 축의 화면 방향으로
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #17 새 임계를 안 만든다 — 무한원 판정은 `isFiniteVp`(VP_INFINITE_RATIO) 그대로
//   #30 되살림: 옛 판(가로선 지평선)은 롤이 있으면 두 소실점을 안 지난다 — 그 팔이 있다
//   #40 도달 가능성: 롤이 있는 시점에서 두 y가 실제로 다르다는 것을 단언으로 박는다
//   #49 판정이 쓰는 단위 — 지평선의 옳음은 "두 소실점을 지나는가"(점-선 거리)로 잰다
import { describe, it, expect } from "vitest";
import { axisVpAt, axisVpsAt, horizonThrough, overlayAxisMarks } from "../src/s3d/axisVp.js";
import { VP_INFINITE_RATIO, type Pt2 } from "../src/s3d/camera.js";
import { unit3, type Vec3 } from "../src/s3d/geom3d.js";

const SZ: [number, number] = [1280, 675];
const P: Pt2 = [640, 337.5];
const F = 1000;

/** 점 `q`에서 선분 `a→b`가 정하는 **직선**까지의 수직거리. */
function lineDist(q: Pt2, a: Pt2, b: Pt2): number {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const L = Math.hypot(ex, ey);
  if (L < 1e-12) return Infinity;
  return Math.abs((q[0] - a[0]) * ey - (q[1] - a[1]) * ex) / L;
}

describe("축 소실점 — 시점별 계산 (D-L101)", () => {
  it("소실점은 `principal + f·(dx,dy)/dz`이고 **부호에 무관**하다", () => {
    const d: Vec3 = unit3([0.6, 0.2, 0.8]);
    const a = axisVpAt(d, P, F, SZ)!;
    const b = axisVpAt([-d[0], -d[1], -d[2]], P, F, SZ)!;
    expect(a.at).not.toBeNull();
    expect(Math.hypot(a.at![0] - (P[0] + F * d[0] / d[2]),
                      a.at![1] - (P[1] + F * d[1] / d[2]))).toBeLessThan(1e-9);
    expect(Math.hypot(a.at![0] - b.at![0], a.at![1] - b.at![1])).toBeLessThan(1e-9);
    // 화면 방향도 같다 — 축은 부호가 없다
    expect(Math.abs(a.screenDir[0] - b.screenDir[0])).toBeLessThan(1e-9);
    expect(Math.abs(a.screenDir[1] - b.screenDir[1])).toBeLessThan(1e-9);
  });

  it("**반례** — 화면과 나란한 축은 무한원이고 그때도 방향이 있다", () => {
    const d: Vec3 = [1, 0, 0];
    const r = axisVpAt(d, P, F, SZ)!;
    expect(r.at).toBeNull();
    expect(r.distFromPrincipal).toBeNull();
    expect(Math.abs(Math.abs(r.screenDir[0]) - 1)).toBeLessThan(1e-9);
  });

  it("**반례** — 너무 먼 소실점은 무한원으로 접는다(`isFiniteVp` 규약 그대로 — #17)", () => {
    const diag = Math.hypot(...SZ);
    // 주점에서 VP_INFINITE_RATIO 배 대각보다 멀도록 dz를 아주 작게
    const far: Vec3 = unit3([1, 0, 1 / (VP_INFINITE_RATIO * diag)]);
    expect(axisVpAt(far, P, F, SZ)!.at).toBeNull();
  });

  it("**반례** — 방향이 없으면 그 축도 없다", () => {
    expect(axisVpAt(null, P, F, SZ)).toBeNull();
    expect(axisVpAt([0, 0, 0], P, F, SZ)).toBeNull();
    expect(axisVpsAt([null, null, null], P, F, SZ)).toEqual([null, null, null]);
  });

  it("축 번호가 붙는다 — 인덱스가 곧 축이다", () => {
    const dirs: (Vec3 | null)[] = [unit3([1, 0, 0.5]), unit3([-1, 0, 0.5]), unit3([0, 1, 0.2])];
    const av = axisVpsAt(dirs, P, F, SZ);
    expect(av.map(a => a?.axis)).toEqual([0, 1, 2]);
  });

  it("**지평선은 두 소실점을 지난다** — 롤이 있으면 화면에서 기운다", () => {
    // 롤이 있는 시점: 두 수평 축을 화면에서 기울여 둔다
    const d0: Vec3 = unit3([1, 0.25, 0.6]);
    const d1: Vec3 = unit3([-1, 0.05, 0.6]);
    const av = axisVpsAt([d0, d1, unit3([0, 1, 0.1])], P, F, SZ);
    const h = horizonThrough(av[0], av[1], SZ)!;
    expect(h).toBeTruthy();
    expect(lineDist(av[0]!.at!, h.a, h.b)).toBeLessThan(1e-6);
    expect(lineDist(av[1]!.at!, h.a, h.b)).toBeLessThan(1e-6);
    // **되살림 팔**(#30·#40) — 옛 판(첫 소실점의 y로 그은 화면 가로선)은 두 번째를 안 지난다
    const oldY = av[0]!.at![1];
    expect(Math.abs(av[1]!.at![1] - oldY)).toBeGreaterThan(1);      // 도달 가능성
    expect(lineDist(av[1]!.at!, [0, oldY], [SZ[0], oldY])).toBeGreaterThan(1);
  });

  it("하나만 유한이면 그 점을 지나 **무한원 축의 화면 방향**으로", () => {
    const fin: Vec3 = unit3([1, 0.1, 0.5]);
    const inf: Vec3 = [0, 1, 0];                       // 화면 세로 — 무한원
    const av = axisVpsAt([fin, inf, null], P, F, SZ);
    expect(av[1]!.at).toBeNull();
    const h = horizonThrough(av[0], av[1], SZ)!;
    expect(lineDist(av[0]!.at!, h.a, h.b)).toBeLessThan(1e-6);
    // 방향이 무한원 축의 화면 방향과 나란하다
    const ux = h.b[0] - h.a[0], uy = h.b[1] - h.a[1];
    const L = Math.hypot(ux, uy);
    expect(Math.abs(Math.abs((ux / L) * av[1]!.screenDir[0]
                           + (uy / L) * av[1]!.screenDir[1]) - 1)).toBeLessThan(1e-9);
  });

  it("**반례** — 둘 다 무한원이면 지평선이 안 정해진다", () => {
    const av = axisVpsAt([[1, 0, 0], [0, 0, 0], null], P, F, SZ);
    expect(horizonThrough(av[0], av[1], SZ)).toBeNull();
    expect(horizonThrough(null, null, SZ)).toBeNull();
  });

  it("**반례** — 두 소실점이 겹치면 지평선이 안 정해진다", () => {
    const d: Vec3 = unit3([1, 0.1, 0.5]);
    const av = axisVpsAt([d, d, null], P, F, SZ);
    expect(horizonThrough(av[0], av[1], SZ)).toBeNull();
  });

  it("**배면·윗면에서도 선다** — 시선을 뒤집어도 소실점과 지평선이 나온다(지시 8-b)", () => {
    const flip = (d: Vec3): Vec3 => [-d[0], d[1], -d[2]];    // 180° 요(배면)
    const d0: Vec3 = unit3([1, 0.05, 0.6]), d1: Vec3 = unit3([-0.9, 0.02, 0.7]);
    const av = axisVpsAt([flip(d0), flip(d1), unit3([0, 1, 0.15])], P, F, SZ);
    expect(av[0]!.at).not.toBeNull();
    expect(av[1]!.at).not.toBeNull();
    const h = horizonThrough(av[0], av[1], SZ)!;
    expect(lineDist(av[0]!.at!, h.a, h.b)).toBeLessThan(1e-6);
    expect(lineDist(av[1]!.at!, h.a, h.b)).toBeLessThan(1e-6);
  });

  it("표식 — 화면 안은 `point`, 밖은 `edge`, 무한원은 `infinite`(지시 8-c·8-e)", () => {
    const inside: Vec3 = unit3([0.02, 0.01, 1]);        // 소실점이 주점 근처 — 화면 안
    const outside: Vec3 = unit3([3, 0.2, 1]);           // 소실점이 화면 밖 오른쪽
    const infinite: Vec3 = [0, 1, 0];                   // 화면 세로 — 무한원
    const av = axisVpsAt([inside, outside, infinite], P, F, SZ);
    const marks = overlayAxisMarks(av, SZ);
    expect(marks.map(m => m.kind)).toEqual(["point", "edge", "infinite"]);
    expect(marks.map(m => m.axis)).toEqual([0, 1, 2]);
    // `point`는 소실점 그 자리다
    expect(Math.hypot(marks[0].at[0] - av[0]!.at![0],
                      marks[0].at[1] - av[0]!.at![1])).toBeLessThan(1e-9);
    // `edge`는 화면 안이고 소실점 **방향**을 가리킨다
    expect(marks[1].at[0]).toBeGreaterThan(0);
    expect(marks[1].at[0]).toBeLessThan(SZ[0]);
    expect(marks[1].dir[0]).toBeGreaterThan(0);
    // `infinite`는 그 축의 화면 방향이다
    expect(Math.abs(Math.abs(marks[2].dir[1]) - 1)).toBeLessThan(1e-9);
  });

  it("**반례** — 방향이 없는 축은 표식도 없다", () => {
    expect(overlayAxisMarks([null, null, null], SZ)).toEqual([]);
  });
});
