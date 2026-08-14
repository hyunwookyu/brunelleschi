// S-4 튜브 메쉬 — 동작을 잠그는 테스트. 수치 측정은 `tube_measure.test.ts`가 원장에 낸다.
import { describe, it, expect } from "vitest";
import { buildTube, widthProfile, worldRadius, TUBE_TOL } from "../src/s3d/tube.js";
import { norm3, sub3, dot3, unit3, project, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

/** 나선 — 접선이 계속 돌므로 프레임이 꼬이면 여기서 드러난다. */
function helix(n = 40): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * Math.PI * 3;
    return [Math.cos(t) * 0.5, Math.sin(t) * 0.5, 2 + (i / n) * 1.5] as Vec3;
  });
}

describe("S-4 튜브 메쉬", () => {
  it("중심선을 다시 샘플링하지 않는다 — 링 수 = 점 수 (§1)", () => {
    const pts = helix(37);
    const m = buildTube(pts, pts.map(() => 0.01))!;
    expect(m.counts.rings).toBe(37);
    // 각 링의 중심이 원래 점이다(반지름 방향으로만 벌어진다)
    const seg = TUBE_TOL.radial_segments;
    for (let i = 0; i < 37; i++) {
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < seg; j++) {
        const o = (i * seg + j) * 3;
        cx += m.positions[o]; cy += m.positions[o + 1]; cz += m.positions[o + 2];
      }
      const c: Vec3 = [cx / seg, cy / seg, cz / seg];
      expect(norm3(sub3(c, pts[i]))).toBeLessThan(1e-6);
    }
  });

  it("반지름이 점마다 다르게 반영된다 — 속도 기반 굵기의 요구", () => {
    const pts: Vec3[] = Array.from({ length: 10 }, (_, i) => [i * 0.1, 0, 2]);
    const radii = pts.map((_, i) => 0.005 + i * 0.002);
    const m = buildTube(pts, radii)!;
    const seg = TUBE_TOL.radial_segments;
    for (const i of [0, 5, 9]) {
      let maxR = 0;
      for (let j = 0; j < seg; j++) {
        const o = (i * seg + j) * 3;
        maxR = Math.max(maxR, norm3(sub3(
          [m.positions[o], m.positions[o + 1], m.positions[o + 2]], pts[i])));
      }
      expect(maxR).toBeCloseTo(radii[i], 6);
    }
  });

  it("**프레임이 꼬이지 않는다** — 평행 이송. 이웃 링의 대응 정점이 붙어 있다", () => {
    const pts = helix(60);
    const m = buildTube(pts, pts.map(() => 0.03))!;
    const seg = TUBE_TOL.radial_segments;
    const at = (i: number, j: number): Vec3 => {
      const o = (i * seg + j) * 3;
      return [m.positions[o], m.positions[o + 1], m.positions[o + 2]];
    };
    // 대응 정점 사이 거리가 중심선 간격 + 반지름 변화 수준을 크게 넘지 않아야 한다.
    // 프레임이 홱 돌면(축 기준 프레임의 특이점) 이 값이 지름 근처로 뛴다.
    let worst = 0;
    for (let i = 1; i < pts.length; i++) {
      const step = norm3(sub3(pts[i], pts[i - 1]));
      for (let j = 0; j < seg; j++) {
        worst = Math.max(worst, norm3(sub3(at(i, j), at(i - 1, j))) - step);
      }
    }
    expect(worst).toBeLessThan(0.03);          // 반지름(0.03) 미만 = 한 칸도 안 돌았다

  });

  it("**대조군: 접선이 기준축을 지나는 획에서 매 점 프레임이 홱 돈다** — 평행 이송의 근거", () => {
    // 나선으로는 안 갈렸다(오히려 대조군이 작았다). **꼬임은 특이점에서만 생긴다** —
    // 매 점 프레임은 `T × (0,1,0)`이라 접선이 (0,1,0)과 나란해지는 순간 정의를 잃는다.
    // 여기 획은 그 자리를 **정확히 통과한다**(yz 평면의 호: 접선이 t=0에서 (0,1,0)).
    // 상자 모서리 같은 곧은 획은 그 자리를 지나지 않아 둘이 거의 같다
    // (원장 `twist_ratio_naive_frame` 0.472 대 0.435) — 그것도 함께 적어 둔다.
    const n = 61, R = 0.03;
    const pts: Vec3[] = Array.from({ length: n }, (_, i) => {
      const t = -1.2 + (2.4 * i) / (n - 1);
      return [0, Math.sin(t), 2 + Math.cos(t)] as Vec3;
    });
    const seg = TUBE_TOL.radial_segments;
    const worstOf = (naiveFrame: boolean) => {
      const m = buildTube(pts, pts.map(() => R), { naiveFrame })!;
      let w = 0;
      for (let i = 1; i < n; i++) {
        const step = norm3(sub3(pts[i], pts[i - 1]));
        for (let j = 0; j < seg; j++) {
          const o = (i * seg + j) * 3, q = ((i - 1) * seg + j) * 3;
          w = Math.max(w, norm3(sub3(
            [m.positions[o], m.positions[o + 1], m.positions[o + 2]],
            [m.positions[q], m.positions[q + 1], m.positions[q + 2]])) - step);
        }
      }
      return w;
    };
    const transported = worstOf(false), naive = worstOf(true);
    // 실측: 평행 이송 0.00104 / 매 점 프레임 0.01888 (반지름 0.03) — **18배**.
    expect(transported).toBeLessThan(R * 0.1);     // 평행 이송은 매끄럽다
    expect(naive).toBeGreaterThan(transported * 8);
  });

  it("법선이 바깥을 향하고 단위벡터다 — 조명이 뒤집히지 않는다", () => {
    const pts = helix(24);
    const m = buildTube(pts, pts.map(() => 0.02))!;
    const seg = TUBE_TOL.radial_segments;
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < seg; j++) {
        const o = (i * seg + j) * 3;
        const nv: Vec3 = [m.normals[o], m.normals[o + 1], m.normals[o + 2]];
        expect(norm3(nv)).toBeCloseTo(1, 6);
        const out = sub3([m.positions[o], m.positions[o + 1], m.positions[o + 2]], pts[i]);
        expect(dot3(unit3(out), nv)).toBeGreaterThan(0.999);
      }
    }
  });

  it("캡이 양 끝을 막는다 — 끄면 정점·삼각형이 줄어든다", () => {
    const pts = helix(12);
    const r = pts.map(() => 0.02);
    const capped = buildTube(pts, r)!, open = buildTube(pts, r, { caps: false })!;
    expect(capped.counts.vertices).toBe(open.counts.vertices + 2);
    expect(capped.counts.triangles).toBe(open.counts.triangles + 2 * TUBE_TOL.radial_segments);
    expect(Math.max(...capped.indices)).toBeLessThan(capped.positions.length / 3);
  });

  it("겹친 점과 너무 짧은 획을 견딘다 — 손 획에 실제로 있다", () => {
    const dup: Vec3[] = [[0, 0, 2], [0, 0, 2], [0.1, 0, 2], [0.1, 0, 2]];
    const m = buildTube(dup, dup.map(() => 0.01))!;
    expect(m.counts.rings).toBe(2);
    expect(Number.isFinite(m.positions[0])).toBe(true);
    expect(buildTube([[0, 0, 2]], [0.01])).toBeNull();
    expect(buildTube([[0, 0, 2], [0, 0, 2]], [0.01, 0.01])).toBeNull();
  });
});

describe("S-4 속도 기반 굵기", () => {
  /** `[x, y, t, ...]` — 일정 속도 또는 구간별 속도. */
  const mk = (speeds: number[], dt = 8): number[][] => {
    const out: number[][] = [[0, 0, 0, 0.5, 0, 0]];
    speeds.forEach((v, i) => out.push([out[i][0] + v * dt, 0, (i + 1) * dt, 0.5, 0, 0]));
    return out;
  };

  it("일정 속도면 일정 굵기다 — **반례**: 굵기가 속도 말고 다른 것을 따라가면 여기서 터진다", () => {
    const raw = mk(new Array(20).fill(1.2));
    const w = widthProfile(raw, raw.length);
    expect(Math.max(...w) - Math.min(...w)).toBeLessThan(1e-9);
    expect(w[0]).toBeCloseTo(TUBE_TOL.base_width_px, 9);
  });

  it("빠른 구간이 얇다 — 실제 펜이 그렇다", () => {
    const raw = mk([...new Array(12).fill(0.4), ...new Array(12).fill(4.0)]);
    const w = widthProfile(raw, raw.length);
    expect(w[3]).toBeGreaterThan(w[raw.length - 4]);
  });

  it("**절대 속도가 아니라 자기 획의 중앙값 기준이다** (V-s) — 전체가 2배 빨라도 같다", () => {
    const slow = mk([1, 1, 3, 3, 1, 1, 5, 5, 1, 1]);
    const fast = mk([2, 2, 6, 6, 2, 2, 10, 10, 2, 2]);
    const a = widthProfile(slow, slow.length), b = widthProfile(fast, fast.length);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));
  });

  it("시간이 없으면 **일정 굵기로 떨어진다** — 추정하지 않는다", () => {
    const noTime = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const w = widthProfile(noTime, 4);
    expect(new Set(w).size).toBe(1);
    expect(widthProfile(undefined, 5).length).toBe(5);
    // 표본 수가 안 맞으면(합성 획) 그대로 일정
    expect(new Set(widthProfile(noTime, 7)).size).toBe(1);
  });

  it("같은 시각 표본(coalesced)에 죽지 않는다", () => {
    const raw = [[0, 0, 0], [1, 0, 5], [2, 0, 5], [3, 0, 10], [4, 0, 15]];
    const w = widthProfile(raw, raw.length);
    expect(w.every(Number.isFinite)).toBe(true);
  });

  it("**세계 반지름은 그린 굵기에서 온다** — 그린 카메라에서 그은 굵기로 보인다", () => {
    const f = 800, P: Pt2 = [400, 300];
    for (const z of [1.5, 4, 9]) {
      const r = worldRadius(4, z, f);
      const centre: Vec3 = [0.2, 0.1, z];
      const edge: Vec3 = [centre[0] + r, centre[1], z];      // 화면 x 방향으로 반지름만큼
      const a = project(centre, P, f)!, b = project(edge, P, f)!;
      expect(Math.abs(b[0] - a[0]) * 2).toBeCloseTo(4, 6);   // 화면 폭 = 4px
    }
  });
});
