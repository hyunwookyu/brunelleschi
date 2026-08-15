// L-A.2 **소실점 후보 검출** — `docs/line_plan.md` §5.1의 성질을 잠근다.
//
// 재는 것은 셋이다.
//   ① 상자 하나로 소실점 셋이 잡히는가 (그리고 참값에 가까운가)
//   ② **선 2개로는 확정되지 않는가** — 교점은 반드시 생기므로 정보가 없다(§5.1)
//   ③ **한 점에서 안 만나는 선 3개로는 확정되지 않는가** — 반례
//
// ②·③이 반례 테스트다(A-4). 없으면 "검출됐다"가 "아무거나 검출한다"와 구분되지 않는다.
import { describe, it, expect } from "vitest";
import {
  detectVps, linesFromStrokes, assignAxes, orderVps, VP_TOL, type DetLine,
} from "../src/s3d/vpDetect.js";
import { recoverCamera, type Pt2 } from "../src/s3d/camera.js";
import { representative } from "../src/s3d/axis.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxEdges, drawEdges, groundPoint } from "./scene3d.js";

const SZ: [number, number] = [960, 672];

/** 두 끝점을 그대로 대표 직선으로 — 노이즈 없는 조건. */
function lineOf(id: string, a: Pt2, b: Pt2): DetLine {
  const rep = representative([a, b]);
  if (!rep) throw new Error("degenerate");
  return { id, rep };
}

/** 소실점 `v`를 향하는 선분 — `p`에서 `v` 쪽으로 길이 `L`. */
function toward(id: string, p: Pt2, v: Pt2, L: number): DetLine {
  const dx = v[0] - p[0], dy = v[1] - p[1], d = Math.hypot(dx, dy);
  return lineOf(id, p, [p[0] + (dx / d) * L, p[1] + (dy / d) * L]);
}

const dist = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("소실점 후보 검출 (§5.1)", () => {
  it("한 점을 향하는 선 3개 → 확정된다", () => {
    const V: Pt2 = [1600, 300];
    const lines = [
      toward("a", [200, 200], V, 220),
      toward("b", [220, 400], V, 240),
      toward("c", [180, 560], V, 260),
    ];
    const got = detectVps(lines, SZ);
    expect(got.length).toBe(1);
    expect(got[0].support.length).toBe(3);
    expect(dist(got[0].vp, V)).toBeLessThan(1);
  });

  it("**반례** — 선 2개로는 확정되지 않는다 (교점은 반드시 생긴다)", () => {
    const V: Pt2 = [1600, 300];
    const lines = [toward("a", [200, 200], V, 220), toward("b", [220, 400], V, 240)];
    expect(detectVps(lines, SZ)).toEqual([]);
  });

  it("**반례** — 꼭짓점은 소실점이 아니다 (모서리 셋이 한 점에서 만난다)", () => {
    // 상자의 꼭짓점에는 모서리 셋이 **정확히** 한 점에서 만나므로 §5.1의 문장을 완벽히
    // 만족한다. `min_reach`가 없으면 이것이 소실점으로 잡히고, 노이즈가 있으면
    // 참 소실점보다 **더 잘** 맞는다(꼭짓점의 산포는 끝점 오차뿐이다).
    const C: Pt2 = [400, 400];
    const away = (id: string, dx: number, dy: number, L: number): DetLine => {
      const d = Math.hypot(dx, dy);
      return lineOf(id, C, [C[0] + (dx / d) * L, C[1] + (dy / d) * L]);
    };
    const corner = [away("v", 0, -1, 240), away("h1", 1, 0.15, 260), away("h2", -1, 0.2, 250)];
    expect(detectVps(corner, SZ)).toEqual([]);
    // `min_reach`를 0으로 내리면 실제로 잡힌다 — 이 조건이 그것을 막고 있음을 확인한다
    expect(detectVps(corner, SZ, { min_reach: 0 }).length).toBe(1);
  });

  it("**반례** — 한 점에서 안 만나는 선 3개로는 확정되지 않는다", () => {
    // 서로 다른 세 점을 향한다 — 쌍마다 교점은 생기지만 지지가 2를 못 넘는다
    const lines = [
      toward("a", [200, 200], [1600, 300], 220),
      toward("b", [220, 400], [-1400, 120], 240),
      toward("c", [180, 560], [500, -2000], 260),
    ];
    expect(detectVps(lines, SZ)).toEqual([]);
  });

  it("**반례** — 짧은 획은 검출에 들어가지 않는다", () => {
    const V: Pt2 = [1600, 300];
    const short = Math.hypot(...SZ) * VP_TOL.min_len_ratio * 0.5;
    const strokes = [
      { id: "a", pts2d: [[200, 200], [200 + short, 210]] as Pt2[] },
      { id: "b", pts2d: [[220, 400], [220 + short, 405]] as Pt2[] },
      { id: "c", pts2d: [[180, 560], [180 + short, 562]] as Pt2[] },
    ];
    expect(linesFromStrokes(strokes, SZ)).toEqual([]);
    // 같은 방향이라도 길이가 있으면 들어온다
    const long = [toward("a", [200, 200], V, 220), toward("b", [220, 400], V, 240),
                  toward("c", [180, 560], V, 260)];
    expect(detectVps(long, SZ).length).toBe(1);
  });

  it("상자 하나(노이즈 없음) → 소실점 셋, 참값과 일치", () => {
    const sc = scene(35, 15, 1000, SZ);
    const O = groundPoint(sc, [420, 470])!;
    const edges = boxEdges(sc, O, 1.1, 0.9, 0.8);
    const drawn = drawEdges(sc, edges, "precise", rng32(1), 0.12, 0, 0);
    expect(drawn).not.toBeNull();
    // 노이즈 없이 참 끝점만 쓴다
    const lines = drawn!.map((e, i) => lineOf(`e${i}`, e.a2d, e.b2d));
    const got = detectVps(lines, SZ);
    expect(got.length).toBe(3);
    for (const c of got) expect(c.support.length).toBe(4);   // 상자 축마다 모서리 4개
    // 검출된 셋이 참 소실점 셋과 짝지어진다
    for (const v of sc.vps) {
      const near = Math.min(...got.map(c => dist(c.vp, v)));
      expect(near).toBeLessThan(1);
    }
  });

  it("잉크 노이즈가 있어도 셋이 잡히고, 카메라가 참 f를 되찾는다", () => {
    const sc = scene(35, 15, 1000, SZ);
    const O = groundPoint(sc, [420, 470])!;
    const edges = boxEdges(sc, O, 1.1, 0.9, 0.8);
    const drawn = drawEdges(sc, edges, "precise" as InkGrade, rng32(7), 0.12, 0.005, 0);
    const lines = linesFromStrokes(
      drawn!.map((e, i) => ({ id: `e${i}`, pts2d: e.pts2d })), SZ);
    const got = detectVps(lines, SZ);
    expect(got.length).toBe(3);
    const vps = assignAxes(got, lines);
    const cam = recoverCamera(vps, SZ);
    expect(cam.ok).toBe(true);
    expect(cam.case).toBe("3pt");
    // **시드 하나로 정밀도를 주장하지 않는다**(AS-C9). 분포는 원장이 낸다
    // (`vp_detect.json`: 중앙 0.105 · p90 0.267). 여기서는 자릿수만 잠근다.
    expect(Math.abs(cam.f! - sc.f) / sc.f).toBeLessThan(0.35);
  });

  it("`vps[2]`가 수직축이다 (관례)", () => {
    const sc = scene(35, 15, 1000, SZ);
    const O = groundPoint(sc, [420, 470])!;
    const edges = boxEdges(sc, O, 1.1, 0.9, 0.8);
    const drawn = drawEdges(sc, edges, "precise", rng32(3), 0.12, 0, 0);
    const lines = drawn!.map((e, i) => lineOf(`e${i}`, e.a2d, e.b2d));
    const vps = orderVps(detectVps(lines, SZ), lines);
    expect(vps[2]).not.toBeNull();
    expect(dist(vps[2]!, sc.vps[2])).toBeLessThan(1);
  });

  it("화면 평행 선들은 무한원으로 표시된다 (c=0, 이론서 2.2)", () => {
    // 정확히 평행이면 교점이 없어 후보가 안 생긴다 — 아주 조금 수렴시킨다
    const V: Pt2 = [200000, 336];
    const lines = [
      toward("a", [200, 200], V, 300),
      toward("b", [200, 340], V, 300),
      toward("c", [200, 480], V, 300),
    ];
    const got = detectVps(lines, SZ);
    expect(got.length).toBe(1);
    expect(got[0].infinite).toBe(true);
  });

  it("소실점 둘이 갈린다 — 한 직선이 두 소실점에 배정되지 않는다", () => {
    // ⚠ **지평선 위의 직선은 두 수평 소실점을 다 지난다** — 원리적 애매성이다.
    // 두 소실점을 같은 y에 두고 그 y에서 획을 그으면 어느 쪽인지 못 가른다.
    // 그래서 픽스처에서 지평선(y=300) 위의 획을 뺐다. 실제 그림에서도 같은 애매성이 있다.
    const V1: Pt2 = [1600, 300], V2: Pt2 = [-1200, 300];
    const lines = [
      toward("a1", [200, 150], V1, 220), toward("a2", [210, 380], V1, 230),
      toward("a3", [190, 450], V1, 240), toward("a4", [205, 600], V1, 250),
      toward("b1", [700, 150], V2, 220), toward("b2", [710, 380], V2, 230),
      toward("b3", [690, 500], V2, 240),
    ];
    const got = detectVps(lines, SZ);
    expect(got.length).toBe(2);
    expect(got[0].support.length).toBe(4);
    expect(got[1].support.length).toBe(3);
    const all = [...got[0].support, ...got[1].support];
    expect(new Set(all).size).toBe(all.length);          // 겹치지 않는다
  });

  it("`min_support`를 4로 올리면 지지 3짜리는 안 잡힌다 (임계가 실제로 작동한다)", () => {
    const V: Pt2 = [1600, 300];
    const lines = [
      toward("a", [200, 200], V, 220), toward("b", [220, 400], V, 240),
      toward("c", [180, 560], V, 260),
    ];
    expect(detectVps(lines, SZ, { min_support: 4 })).toEqual([]);
    expect(detectVps(lines, SZ, { min_support: 3 }).length).toBe(1);
  });
});
