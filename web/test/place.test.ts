// S-3 획 → 3D — 계획서 §4.2(앵커 체인)·§4.4(떨림 평면)·§4.5(호출 단위).
//
// 여기 있는 것은 **동작을 잠그는 테스트**다. 수치 측정은 `place_measure.test.ts`가 하고
// 원장(`stage0/out/`)에 남긴다. 무노이즈 왕복은 **근거가 아니라 회귀 자물쇠**로 둔다 —
// 정답을 스스로 만들어 스스로 맞히는 유형(M4)이 이 프로젝트에서 두 번 걸렸다.
import { describe, it, expect } from "vitest";
import {
  placeStroke, previewStroke, seedOnGround, wobblePlane, axisVec, reprojectionGap,
  newStroke, placeInto, settle, reprojectAll, resetStrokeIds, chordAxisAngle,
  strokeLen2d, groundOf, type PlaceCtx, type Stroke, WOBBLE_PLANES,
} from "../src/s3d/stroke.js";
import { classifyStroke } from "../src/s3d/axis.js";
import { project, rayPlane, rayThrough, dot3, sub3, norm3, unit3, cross3, type Vec3 }
  from "../src/s3d/geom3d.js";
import { scene, groundPoint, boxEdges, chordDeviation } from "./scene3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const sc = scene(35, 15);
const ctx: PlaceCtx = { principal: sc.principal, f: sc.f, vps: sc.vps, imgSize: sc.imgSize };

/** 참 3D 선분을 화면에 투영해 균등 점열로 만든다(노이즈 없음). */
function cleanStroke(a: Vec3, b: Vec3, n = 24): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    out.push(project(p, sc.principal, sc.f)!);
  }
  return out;
}

/** 화면에서 현에 수직으로 흔든다 — 손떨림을 결정론적으로 흉내 낸다. */
function wobble2d(pts: Pt2[], amp: number): Pt2[] {
  const a = pts[0], b = pts[pts.length - 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
  return pts.map((p, i) => {
    const t = i / (pts.length - 1);
    const e = Math.sin(Math.PI * t * 3) * amp;
    return [p[0] + nx * e, p[1] + ny * e] as Pt2;
  });
}

describe("S-3 씨앗과 지면", () => {
  it("씨앗은 지면 위에 있다 — **카메라가 기울어도**(3점 투시)", () => {
    const g = groundOf(ctx);
    const s: Pt2 = [420, 470];
    const p = seedOnGround(s, ctx)!;
    expect(p).not.toBeNull();
    expect(dot3(g.n, p)).toBeCloseTo(1, 9);              // 지면 방정식을 만족한다
    const back = project(p, sc.principal, sc.f)!;
    expect(Math.hypot(back[0] - s[0], back[1] - s[1])).toBeLessThan(1e-9);
  });

  it("반례: 지면을 `y = 1`로 두면 기운 카메라에서 **틀린 곳**에 떨어진다", () => {
    // S-1이 쓰던 가정. 수직축이 (0,1,0)이 아니면 그 점은 지면 위에 있지 않다.
    const s: Pt2 = [420, 470];
    const r = rayThrough(s, sc.principal, sc.f);
    const naive: Vec3 = [r[0] / r[1], 1, r[2] / r[1]];    // y = 1 평면과의 교점
    const g = groundOf(ctx);
    expect(Math.abs(dot3(g.n, naive) - 1)).toBeGreaterThan(0.1);   // 지면에서 10% 이상 벗어난다
  });

  it("지평선 위를 찍으면 씨앗이 없다 — 추정하지 않는다", () => {
    expect(seedOnGround([480, 5], ctx)).toBeNull();
  });
});

describe("S-3 떨림 평면 (§4.4)", () => {
  const A = groundPoint(sc, [430, 460])!;
  const edges = boxEdges(sc, A, 1.1, 0.9, 0.8);
  const e0 = edges[0];                                    // 축 0 모서리
  const pts = wobble2d(cleanStroke(e0.a, e0.b), 6);

  it("어느 평면을 골라도 **화면 이미지는 같다** — 다른 것은 깊이뿐이다", () => {
    // 각 점이 자기 광선 위에 있으므로 그린 카메라에서는 구별되지 않는다.
    // §4.5의 "미리보기 ↔ 확정 차이"가 화면에서 0인 이유가 이것이다.
    const seen = WOBBLE_PLANES.map(m => placeStroke(pts, 0, e0.a, ctx, m));
    for (const r of seen) {
      expect(r.ok).toBe(true);
      expect(Math.max(...reprojectionGap(r.pts3d, pts, ctx))).toBeLessThan(1e-6);
    }
    // 깊이는 다르다 — **떨린 점에서만** 갈린다(축 위의 점은 어느 평면에서도 같은 자리다).
    const dz = seen[0].pts3d.map((p, i) => Math.abs(p[2] - seen[2].pts3d[i][2]));
    expect(Math.max(...dz)).toBeGreaterThan(1e-3);
    expect(Math.min(...dz)).toBeLessThan(1e-9);
  });

  it("반례: **눈을 지나는 평면**은 배치 자체가 불가능하다 (계획서 문구를 글자 그대로 읽으면)", () => {
    // L과 눈을 함께 담는 평면은 화면에 **직선 하나**로 맺힌다. 축을 벗어난 점(=떨림)의
    // 광선은 그 평면과 원점에서만 만나므로 3D 점이 나오지 않는다.
    const dir = axisVec(0, ctx)!;
    const n = unit3(cross3(unit3(A), dir));
    expect(Math.abs(dot3(n, A))).toBeLessThan(1e-9);      // 평면이 원점(눈)을 지난다
    const miss = pts.filter(s => !rayPlane([0, 0, 0], rayThrough(s, sc.principal, sc.f), n, 0));
    expect(miss.length).toBe(pts.length);                 // 한 점도 놓이지 않는다
  });

  it("`screen`(계획서 나)는 축 방향을 잃는다 — 획이 깊이로 들어가지 않는다", () => {
    const dir = axisVec(0, ctx)!;
    const flat = placeStroke(pts, 0, e0.a, ctx, "screen");
    const face = placeStroke(pts, 0, e0.a, ctx, "facing");
    expect(chordAxisAngle(flat.pts3d, dir)).toBeGreaterThan(20);
    expect(chordAxisAngle(face.pts3d, dir)).toBeLessThan(1);
    // 미리보기가 바로 이 평면이다
    const prev = previewStroke(pts, e0.a, ctx);
    expect(Math.max(...prev.map((p, i) => norm3(sub3(p, flat.pts3d[i]))))).toBeLessThan(1e-9);
  });

  it("`sight`(계획서 가)는 떨림을 깊이로 **길게 늘인다** — `facing`은 그린 만큼만 남긴다", () => {
    const exp2d = chordDeviation(pts);                    // 화면에서 그린 떨림(px)
    const ratio = (m: "sight" | "facing") => {
      const r = placeStroke(pts, 0, e0.a, ctx, m);
      const z = r.pts3d[0][2];
      return chordDeviation(r.pts3d) / ((exp2d * z) / sc.f);   // 1 = 그린 만큼
    };
    expect(ratio("facing")).toBeLessThan(1.2);
    expect(ratio("sight")).toBeGreaterThan(ratio("facing") * 2);
  });

  it("평면 법선은 항상 앵커 쪽을 향한다 — 부호가 뒤집히면 광선이 뒤로 나간다", () => {
    for (const m of WOBBLE_PLANES) {
      const pl = wobblePlane(A, axisVec(0, ctx)!, m);
      expect(pl.d).toBeGreaterThan(0);
      expect(Math.abs(dot3(pl.n, A) - pl.d)).toBeLessThan(1e-9);
    }
  });

  it("축이 시선과 나란해도(소실점 정면) 평면이 퇴화하지 않는다", () => {
    const straightOn: Vec3 = unit3(A);                    // 앵커를 그대로 보는 방향
    for (const m of WOBBLE_PLANES) {
      const pl = wobblePlane(A, straightOn, m);
      expect(norm3(pl.n)).toBeCloseTo(1, 9);
    }
  });
});

describe("S-3 앵커 체인 (§4.2)", () => {
  const A = groundPoint(sc, [430, 470])!;
  const edges = boxEdges(sc, A, 1.1, 0.9, 0.8);
  const mk = (i: number) => newStroke(cleanStroke(edges[i].a, edges[i].b), edges[i].axis);

  it("연결된 것만 배치된다 — 떠 있는 획은 추정하지 않는다", () => {
    resetStrokeIds();
    const seed = mk(0);
    const far = newStroke(
      cleanStroke(edges[10].a, edges[10].b), edges[10].axis);       // 씨앗에 닿지 않는 모서리
    const list = [seed, far];
    settle(list, ctx);
    expect(seed.pts3d.length).toBeGreaterThan(0);
    expect(far.pts3d.length).toBe(0);                                // 미배치로 남는다
    expect(far.anchorRef).toBeNull();
  });

  it("나중 획이 앵커를 만들면 **앞서 떠 있던 획이 그때 붙는다**", () => {
    resetStrokeIds();
    const list = [mk(0), mk(10), mk(5)];   // 0=씨앗, 10=떠 있음, 5는 둘을 잇는다
    settle(list, ctx);
    expect(list.every(s => s.pts3d.length > 0)).toBe(true);
    expect(list[1].anchorRef).not.toBeNull();
  });

  it("끝점 접합 — 두 획의 끝이 **정확히 같은 3D 점**이 된다 (§1.2)", () => {
    resetStrokeIds();
    const list = [mk(0), mk(3)];           // 0의 끝 A에서 3이 시작한다
    settle(list, ctx);
    const end0 = list[0].pts3d[list[0].pts3d.length - 1];
    const start1 = list[1].pts3d[0];
    expect(norm3(sub3(end0, start1))).toBeLessThan(1e-9);
  });

  it("**회귀 자물쇠**(근거 아님): 노이즈 없는 상자는 참 위치로 돌아온다", () => {
    // 정답을 스스로 만들어 스스로 맞히는 형태다(M4). 부호·축 배정이 깨지면 여기서 터진다.
    resetStrokeIds();
    const list = edges.map((_, i) => mk(i));
    settle(list, ctx);
    expect(list.every(s => s.pts3d.length > 0)).toBe(true);
    const diag = norm3(sub3(edges[11].b, edges[0].a));
    let worst = 0;
    list.forEach((s, i) => {
      worst = Math.max(worst,
        norm3(sub3(s.pts3d[0], edges[i].a)) / diag,
        norm3(sub3(s.pts3d[s.pts3d.length - 1], edges[i].b)) / diag);
    });
    expect(worst).toBeLessThan(1e-9);
  });

  it("축이 `free`면 배치하지 않는다 — 미분류를 조용히 배정하지 않는다", () => {
    resetStrokeIds();
    const s = newStroke(cleanStroke(edges[0].a, edges[0].b), "free");
    expect(placeInto([], s, ctx, { seedIfEmpty: true })).toBe(false);
    expect(s.pts3d.length).toBe(0);
  });
});

describe("S-3 재투영 (§4.5·§5)", () => {
  const A = groundPoint(sc, [430, 470])!;
  const edges = boxEdges(sc, A, 1.1, 0.9, 0.8);

  it("카메라가 바뀌면 `pts2d`에서 전부 다시 만든다 — 원본 점열은 그대로다", () => {
    resetStrokeIds();
    const list: Stroke[] = edges.slice(0, 5).map(e => newStroke(cleanStroke(e.a, e.b), e.axis));
    const before = list.map(s => JSON.stringify(s.pts2d));
    settle(list, ctx);
    const z0 = list[0].pts3d[0][2];

    const moved: PlaceCtx = { ...ctx, f: ctx.f * 1.25 };
    reprojectAll(list, moved);
    expect(list.map(s => JSON.stringify(s.pts2d))).toEqual(before);   // §5 pts2d 보존
    expect(list[0].pts3d[0][2]).not.toBeCloseTo(z0, 3);               // 깊이는 f를 따라 움직인다
    // 새 카메라에서도 화면 이미지는 그대로다
    expect(Math.max(...reprojectionGap(list[0].pts3d, list[0].pts2d, moved))).toBeLessThan(1e-6);
  });

  it("획 길이는 호 길이다 — D-S6의 분모", () => {
    const straight: Pt2[] = [[0, 0], [30, 40], [60, 80]];
    expect(strokeLen2d(straight)).toBeCloseTo(100, 9);
  });

  it("판정 → 배치가 이어진다 — 축을 스스로 고른 획이 3D에 놓인다", () => {
    resetStrokeIds();
    const list: Stroke[] = [];
    for (const e of edges) {
      const pts = cleanStroke(e.a, e.b);
      const v = classifyStroke(pts, sc.vps, sc.imgSize);
      expect(v.axis).toBe(e.axis);                       // 노이즈가 없으면 판정이 맞는다
      list.push(newStroke(pts, v.axis));
    }
    settle(list, ctx);
    expect(list.filter(s => s.pts3d.length).length).toBe(12);
  });
});
