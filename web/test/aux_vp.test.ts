// **보조 소실점의 기하**(2026-08-19 15차 항목 7 · D-L106). 이론서 6.2·7.3·15.1이 정답이다.
//
// **이 파일이 재는 것은 이론서와의 일치**다 — 합성 픽스처의 자기 일관성이 아니라,
// 독립적으로 성립하는 정리를 계산이 만족하는지다(#5의 반대편: 여기서는 정답이 밖에 있다).
//   · 15.1 경사 소실점은 대응 수평 소실점의 **바로 위/아래**에 있다(오르막이면 위)
//   · 6.2  탈레스 반원의 |PE| = f
//   · 7.3  측점 M은 |VM| = |VE|이고 지평선 위에 있다
//   · 7.4  1점 투시의 거리점은 |PD| = f (측점법의 특수해)
import { describe, it, expect } from "vitest";
import { auxDirVec, auxVpAt, auxVpsAt, thales, measuringPoint, auxDirSnap,
         normYaw, yawFromScreenPoint, protractorVp, protractorAngle,
         slopeByMeasuringPoint,
         type AuxDir } from "../src/s3d/auxVp.js";
import { axisVpAt } from "../src/s3d/axisVp.js";
import type { Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const IMG: [number, number] = [1280, 675];
const P: Pt2 = [640, 337.5];
const F = 900;

/** 요 35°의 2점 구도 — 축 0·1이 수평, 축 2가 수직(화면 아래가 +y). */
function axes(yawDeg = 35): (Vec3 | null)[] {
  const t = (yawDeg * Math.PI) / 180;
  return [[Math.cos(t), 0, Math.sin(t)],
          [-Math.sin(t), 0, Math.cos(t)],
          [0, 1, 0]];
}
const aux = (o: Partial<AuxDir> = {}): AuxDir =>
  ({ id: "a", of: 0, yawDeg: 0, pitchDeg: 0, ...o });

describe("보조 방향", () => {
  it("각 0이면 기준 축 자신이다 — 소실점이 축 소실점과 같다", () => {
    const A = axes();
    const v = auxVpAt(aux({ yawDeg: 0 }), A, P, F, IMG)!;
    const a0 = axisVpAt(A[0], P, F, IMG)!;
    expect(v.at).not.toBeNull();
    expect(Math.hypot(v.at![0] - a0.at![0], v.at![1] - a0.at![1])).toBeLessThan(1e-9);
  });

  it("각 90°면 다른 수평축이다", () => {
    const A = axes();
    const v = auxVpAt(aux({ yawDeg: 90 }), A, P, F, IMG)!;
    const a1 = axisVpAt(A[1], P, F, IMG)!;
    expect(Math.hypot(v.at![0] - a1.at![0], v.at![1] - a1.at![1])).toBeLessThan(1e-6);
  });

  it("수평 보조는 지평선 위에 있다 — 두 수평 축 소실점과 같은 y", () => {
    const A = axes();
    const y0 = axisVpAt(A[0], P, F, IMG)!.at![1];
    for (const g of [15, 30, 45, 60, 75]) {
      const v = auxVpAt(aux({ yawDeg: g }), A, P, F, IMG)!;
      expect(Math.abs(v.at![1] - y0)).toBeLessThan(1e-6);
    }
  });

  it("**이론서 15.1** — 경사 소실점은 대응 수평 소실점의 바로 위/아래다", () => {
    const A = axes();
    for (const g of [0, 25, 55]) {
      const h = auxVpAt(aux({ id: "h", yawDeg: g }), A, P, F, IMG)!;
      const up = auxVpAt(aux({ id: "u", yawDeg: g, pitchDeg: 20 }), A, P, F, IMG)!;
      const dn = auxVpAt(aux({ id: "d", yawDeg: g, pitchDeg: -20 }), A, P, F, IMG)!;
      // **바로 위/아래** — x가 같다
      expect(Math.abs(up.at![0] - h.at![0])).toBeLessThan(1e-6);
      expect(Math.abs(dn.at![0] - h.at![0])).toBeLessThan(1e-6);
      // 오르막이 위다(화면 y는 아래가 +)
      expect(up.at![1]).toBeLessThan(h.at![1]);
      expect(dn.at![1]).toBeGreaterThan(h.at![1]);
      // 위·아래가 지평선에서 같은 거리다(부호만 반대)
      expect(Math.abs((h.at![1] - up.at![1]) - (dn.at![1] - h.at![1]))).toBeLessThan(1e-6);
    }
  });

  it("**일반형** — 경사 소실점은 대응 수평 소실점과 **수직축 소실점**을 잇는 직선 위에 있다", () => {
    // ⚠ 이론서 15.1의 «바로 위/아래»는 **2점 전용**이다(수직축이 화면 세로일 때).
    // 3점(피치가 있는 카메라)에서는 수직축 소실점이 유한하고, 경사 소실점은 그 점과
    // 수평 소실점을 잇는 직선 위로 간다 — 15.1은 그 직선이 화면 세로가 되는 특수해다.
    const t = (35 * Math.PI) / 180, q = (18 * Math.PI) / 180;
    const cy = Math.cos(q), sy = Math.sin(q);
    const rotX = (v: Vec3): Vec3 => [v[0], cy * v[1] - sy * v[2], sy * v[1] + cy * v[2]];
    const A3: (Vec3 | null)[] = [rotX([Math.cos(t), 0, Math.sin(t)]),
                                 rotX([-Math.sin(t), 0, Math.cos(t)]),
                                 rotX([0, 1, 0])];
    const vUp = axisVpAt(A3[2], P, F, IMG)!.at!;
    expect(vUp).not.toBeNull();
    for (const g of [0, 30, 70]) {
      const h = auxVpAt(aux({ yawDeg: g }), A3, P, F, IMG)!.at!;
      for (const pitch of [10, 25, -25, -40]) {
        const v = auxVpAt(aux({ yawDeg: g, pitchDeg: pitch }), A3, P, F, IMG)!.at!;
        const ex = vUp[0] - h[0], ey = vUp[1] - h[1], L = Math.hypot(ex, ey);
        const off = Math.abs((v[0] - h[0]) * ey - (v[1] - h[1]) * ex) / L;
        expect(off).toBeLessThan(1e-6);          // 그 직선 위다
      }
      // **반례** — 화면 세로선 위는 **아니다**(15.1의 문면이 여기서 깨진다)
      const v25 = auxVpAt(aux({ yawDeg: g, pitchDeg: 25 }), A3, P, F, IMG)!.at!;
      expect(Math.abs(v25[0] - h[0])).toBeGreaterThan(1);
    }
  });

  it("경사각이 커지면 지평선에서 더 멀어진다(단조)", () => {
    const A = axes();
    const h = auxVpAt(aux({ yawDeg: 30 }), A, P, F, IMG)!;
    let prev = 0;
    for (const t of [5, 10, 20, 35, 50]) {
      const v = auxVpAt(aux({ yawDeg: 30, pitchDeg: t }), A, P, F, IMG)!;
      const d = Math.abs(v.at![1] - h.at![1]);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it("축 방향이 없으면 null이다 — 조용히 만들지 않는다", () => {
    expect(auxDirVec(aux(), [null, null, null])).toBeNull();
    expect(auxVpAt(aux(), [null, null, null], P, F, IMG)).toBeNull();
  });

  it("여럿을 한 번에 낸다 — 순서가 보존된다", () => {
    const A = axes();
    const out = auxVpsAt([aux({ id: "x", yawDeg: 10 }), aux({ id: "y", yawDeg: 20 })],
                         A, P, F, IMG);
    expect(out.map(o => o?.id)).toEqual(["x", "y"]);
  });
});

describe("탈레스 반원 (이론서 6.2)", () => {
  it("|PE| = f를 되돌린다 — 두 수평 소실점과 주점만으로", () => {
    const A = axes();
    const v1 = axisVpAt(A[0], P, F, IMG)!.at!;
    const v2 = axisVpAt(A[1], P, F, IMG)!.at!;
    const t = thales(v1, v2, P)!;
    expect(t).not.toBeNull();
    // ⚠ 이것은 **보장이 아니다**(#5): 6.2는 카메라와 독립인 정리이고, 여기서는 두 소실점을
    // 실제 카메라로 만들었으므로 f가 되돌아오는 것이 그 정리의 확인이다
    expect(Math.abs(t.f - F)).toBeLessThan(1e-6);
  });

  it("여러 요·초점거리에서 f를 되돌린다", () => {
    for (const yaw of [20, 35, 50, 65]) {
      for (const f of [600, 900, 1400]) {
        const A = axes(yaw);
        const v1 = axisVpAt(A[0], P, f, IMG)!.at!;
        const v2 = axisVpAt(A[1], P, f, IMG)!.at!;
        const t = thales(v1, v2, P);
        if (!t) continue;                    // 화면 밖 무한원 처리로 소실점이 없을 수 있다
        expect(Math.abs(t.f - f) / f).toBeLessThan(1e-9);
      }
    }
  });

  it("**3점에서도 f를 되돌린다** — |PE| = f는 2점 전용이다(이론서 6.3·7.6)", () => {
    // 피치를 준 3점 카메라: 축 셋이 다 유한 소실점을 갖는다
    const t = (35 * Math.PI) / 180, q = (18 * Math.PI) / 180;
    const cy = Math.cos(q), sy = Math.sin(q);
    const rotX = (v: Vec3): Vec3 => [v[0], cy * v[1] - sy * v[2], sy * v[1] + cy * v[2]];
    const A3: (Vec3 | null)[] = [rotX([Math.cos(t), 0, Math.sin(t)]),
                                 rotX([-Math.sin(t), 0, Math.cos(t)]),
                                 rotX([0, 1, 0])];
    const v1 = axisVpAt(A3[0], P, F, IMG)!.at!;
    const v2 = axisVpAt(A3[1], P, F, IMG)!.at!;
    const v3 = axisVpAt(A3[2], P, F, IMG)!.at!;
    expect(v3).not.toBeNull();                        // 3점이 맞다(수직축도 유한하다)
    const th = thales(v1, v2, P)!;
    expect(th).not.toBeNull();
    // 주점이 그 변 위에 **없다** — 2점과 다른 자리다
    expect(th.principalOffset).toBeGreaterThan(1);
    // 그래도 f는 되돌아온다(f² = edgeDist² − principalOffset²)
    expect(Math.abs(th.f - F) / F).toBeLessThan(1e-9);
    // **반례** — 옛 식(|PE|)은 이 자리에서 틀린다
    const oldF = Math.hypot(th.E[0] - P[0], th.E[1] - P[1]);
    expect(Math.abs(oldF - F) / F).toBeGreaterThan(0.01);
  });

  it("**롤이 있는 3점**에서도 f를 되돌린다 — E의 x가 주점 x와 다른 자리", () => {
    // ⚠ 앞 팔의 픽스처는 롤 0이라 `V₃ₓ = pₓ`였고, 그때 "E는 V₃에서 내린 수선의 발 위"와
    // "E는 주점 바로 위"가 **같은 점을 준다**(1차 리뷰어 [9]). 롤을 넣어 그 둘을 가른다.
    const rz = (14 * Math.PI) / 180, cz = Math.cos(rz), sz = Math.sin(rz);
    const rotZ = (v: Vec3): Vec3 => [cz * v[0] - sz * v[1], sz * v[0] + cz * v[1], v[2]];
    const t = (35 * Math.PI) / 180, q = (18 * Math.PI) / 180;
    const cy = Math.cos(q), sy = Math.sin(q);
    const rotX = (v: Vec3): Vec3 => [v[0], cy * v[1] - sy * v[2], sy * v[1] + cy * v[2]];
    const R = (v: Vec3) => rotZ(rotX(v));
    const A: (Vec3 | null)[] = [R([Math.cos(t), 0, Math.sin(t)]),
                                R([-Math.sin(t), 0, Math.cos(t)]),
                                R([0, 1, 0])];
    const v1 = axisVpAt(A[0], P, F, IMG)!.at!;
    const v2 = axisVpAt(A[1], P, F, IMG)!.at!;
    const v3 = axisVpAt(A[2], P, F, IMG)!.at!;
    const th = thales(v1, v2, P)!;
    expect(th).not.toBeNull();
    // 이 픽스처가 실제로 앞 팔과 다른 자리인지 **먼저 확인한다**(#12: 동작점이 새로운가)
    expect(Math.abs(v3[0] - P[0])).toBeGreaterThan(1);      // 수직 소실점이 주점 x 위가 아니다
    expect(Math.abs(th.E[0] - P[0])).toBeGreaterThan(1);    // E도 주점 x 위가 아니다
    expect(th.principalOffset).toBeGreaterThan(1);
    // 그래도 f는 되돌아온다
    expect(Math.abs(th.f - F) / F).toBeLessThan(1e-9);
    // **수심 성질** — 주점의 발이 V₃에서 내린 수선의 발과 같다(7.6이 든 그 점)
    const ux = (v2[0] - v1[0]), uy = (v2[1] - v1[1]), L = Math.hypot(ux, uy);
    const foot3 = ((v3[0] - v1[0]) * ux + (v3[1] - v1[1]) * uy) / (L * L);
    const f3: [number, number] = [v1[0] + foot3 * ux, v1[1] + foot3 * uy];
    expect(Math.hypot(th.foot[0] - f3[0], th.foot[1] - f3[1])).toBeLessThan(1e-6);
  });

  it("2점에서는 principalOffset이 0이고 f = |PE|다(옛 식이 특수해다)", () => {
    const A = axes();
    const v1 = axisVpAt(A[0], P, F, IMG)!.at!;
    const v2 = axisVpAt(A[1], P, F, IMG)!.at!;
    const th = thales(v1, v2, P)!;
    expect(th.principalOffset).toBeLessThan(1e-9);
    expect(Math.abs(th.f - Math.hypot(th.E[0] - P[0], th.E[1] - P[1]))).toBeLessThan(1e-9);
  });

  it("**반례** — 주점이 두 소실점 사이에 없으면 null이다(이론서 6.5, f² < 0)", () => {
    // 두 소실점을 주점의 **같은 쪽**에 둔다 — 예각 조건이 깨진다
    expect(thales([800, 300], [1000, 300], P)).toBeNull();
  });

  it("**반례** — 두 소실점이 겹치면 null이다", () => {
    expect(thales([700, 300], [700, 300], P)).toBeNull();
  });
});

describe("측점 (이론서 7.3)", () => {
  it("|VM| = |VE|이고 지평선 위에 있다", () => {
    const A = axes();
    const v1 = axisVpAt(A[0], P, F, IMG)!.at!;
    const v2 = axisVpAt(A[1], P, F, IMG)!.at!;
    const t = thales(v1, v2, P)!;
    const m = measuringPoint(v1, t.E, v1, v2, P)!;
    const VE = Math.hypot(t.E[0] - v1[0], t.E[1] - v1[1]);
    const VM = Math.hypot(m.at[0] - v1[0], m.at[1] - v1[1]);
    expect(Math.abs(VM - VE)).toBeLessThan(1e-9);
    // 지평선 위 — 두 소실점의 y와 같다(롤 0 픽스처)
    expect(Math.abs(m.at[1] - v1[1])).toBeLessThan(1e-9);
  });

  it("두 해를 다 낸다 — 고르는 규약이 바뀌어도 다시 안 잰다(이론서 7.5의 주석)", () => {
    const A = axes();
    const v1 = axisVpAt(A[0], P, F, IMG)!.at!;
    const v2 = axisVpAt(A[1], P, F, IMG)!.at!;
    const t = thales(v1, v2, P)!;
    const m = measuringPoint(v1, t.E, v1, v2, P)!;
    expect(m.both).toHaveLength(2);
    expect(m.both.some(z => Math.hypot(z[0] - m.at[0], z[1] - m.at[1]) < 1e-9)).toBe(true);
    // 두 해가 V에서 같은 거리다(부호만 반대)
    const d = m.both.map(z => Math.hypot(z[0] - v1[0], z[1] - v1[1]));
    expect(Math.abs(d[0] - d[1])).toBeLessThan(1e-9);
  });

  it("고른 쪽은 **주점 쪽**이다(A-3으로 고른 규약)", () => {
    const A = axes();
    const v1 = axisVpAt(A[0], P, F, IMG)!.at!;
    const v2 = axisVpAt(A[1], P, F, IMG)!.at!;
    const t = thales(v1, v2, P)!;
    const m = measuringPoint(v1, t.E, v1, v2, P)!;
    const near = (z: Pt2) => Math.hypot(z[0] - P[0], z[1] - P[1]);
    expect(near(m.at)).toBeLessThanOrEqual(Math.max(...m.both.map(near)));
  });
});

describe("보조 방향 스냅 — 위계", () => {
  const A = axes();
  const vs = auxVpsAt([aux({ id: "a", yawDeg: 45 })], A, P, F, IMG);
  const V = vs[0]!.at!;

  it("보조 소실점을 향한 획이 그 직선으로 당겨진다", () => {
    const a: Pt2 = [300, 400];
    const dx = V[0] - a[0], dy = V[1] - a[1], D = Math.hypot(dx, dy);
    const b: Pt2 = [a[0] + dx / D * 200 + 2, a[1] + dy / D * 200 - 1];   // 살짝 빗나감
    const r = auxDirSnap(a, b, vs, 0.06)!;
    expect(r).not.toBeNull();
    expect(r.id).toBe("a");
    // 스냅된 끝점은 a→V 직선 위다
    const cross = Math.abs((r.at[0] - a[0]) * dy - (r.at[1] - a[1]) * dx) / D;
    expect(cross).toBeLessThan(1e-9);
  });

  it("**반례** — 임계 밖 획은 안 당겨진다", () => {
    const a: Pt2 = [300, 400];
    const b: Pt2 = [a[0] + 200, a[1] - 190];   // 전혀 다른 방향
    expect(auxDirSnap(a, b, vs, 0.06)).toBeNull();
  });

  it("**축을 안 낸다** — 위계: 보조는 방향만 준다", () => {
    const a: Pt2 = [300, 400];
    const dx = V[0] - a[0], dy = V[1] - a[1], D = Math.hypot(dx, dy);
    const b: Pt2 = [a[0] + dx / D * 200, a[1] + dy / D * 200];
    const r = auxDirSnap(a, b, vs, 0.06)!;
    expect(Object.prototype.hasOwnProperty.call(r, "axis")).toBe(false);
  });

  it("길이 0·후보 없음·무한원 후보는 null이다", () => {
    expect(auxDirSnap([10, 10], [10, 10], vs, 0.06)).toBeNull();
    expect(auxDirSnap([10, 10], [200, 200], [], 0.06)).toBeNull();
    expect(auxDirSnap([10, 10], [200, 200],
                      [{ id: "z", at: null, screenDir: [1, 0], distFromPrincipal: null,
                         yawDeg: 0, pitchDeg: 0 }], 0.06)).toBeNull();
  });
});

// ================================================================ 16차 항목 0 — 만드는 경로 셋
//
// 지시 원문(`docs/instructions/16.md`): *"만드는 경로 셋 — 지평선 위 탭 · 각도기 광선 ·
// 각도 입력 → **같은 것이다**."* 15차는 셋 중 하나만 냈고 «같은 것»이라는 주장을 **안 쟀다**.
// 여기가 그 자리다.
//
// ⚠ **팔이 전 차수를 돈다**(PITFALLS #51 — 16차 지시 1-a가 등재한 그 함정). 15차의
// `|PE| = f` 오적용이 «단위 팔이 2점만 돌아» 종단에서 났다. 아래 팔들은 **2점·3점·롤 3점**
// 셋을 전부 돈다 — 픽스처 하나가 셋을 다 낸다.

/** 세 차수의 축 방향. 이름이 곧 그 팔의 라벨이다(#42 ⑨). */
const ORDERS: { name: string; A: (Vec3 | null)[] }[] = (() => {
  const rx = (q: number) => (v: Vec3): Vec3 => {
    const c = Math.cos(q), s = Math.sin(q);
    return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
  };
  const rz = (q: number) => (v: Vec3): Vec3 => {
    const c = Math.cos(q), s = Math.sin(q);
    return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
  };
  const frame = (yaw: number, R: (v: Vec3) => Vec3): (Vec3 | null)[] => {
    const t = (yaw * Math.PI) / 180;
    return [R([Math.cos(t), 0, Math.sin(t)]), R([-Math.sin(t), 0, Math.cos(t)]), R([0, 1, 0])];
  };
  const id = (v: Vec3) => v;
  const d = (x: number) => (x * Math.PI) / 180;
  return [
    { name: "two_point", A: frame(35, id) },
    { name: "three_point", A: frame(35, rx(d(18))) },
    { name: "three_point_roll", A: frame(35, v => rz(d(14))(rx(d(18))(v))) },
  ];
})();

describe("만드는 경로 셋은 같은 양의 세 표기다 (16차 지시 0)", () => {
  for (const { name, A } of ORDERS) {
    it(`[${name}] **각도기 광선의 각 = 세계 각**(지시 원문의 그 문장)`, () => {
      const v0 = axisVpAt(A[0], P, F, IMG)!.at!;
      const v1 = axisVpAt(A[1], P, F, IMG)!.at!;
      const th = thales(v0, v1, P)!;
      expect(th).not.toBeNull();
      // ∠V₀EV₁ = 90° — 탈레스가 보장한다(구성이므로 #5: 이것은 보장이지 측정이 아니다)
      const a: Pt2 = [v0[0] - th.E[0], v0[1] - th.E[1]];
      const b: Pt2 = [v1[0] - th.E[0], v1[1] - th.E[1]];
      const cosAB = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]));
      expect(Math.abs(cosAB)).toBeLessThan(1e-9);
      // **측정은 이것이다** — E에서 θ로 쏜 광선이 만나는 자리가, 세계에서 yaw θ로 돌린
      // 방향의 소실점과 **같은 점**인가. 두 계산은 서로 독립이다(2D 작도 ↔ 3D 투영).
      // ⚠ g = −35는 이 픽스처(요 35°)의 **퇴화각**이다 — 그 방향이 화면과 나란해 소실점이
      // 무한원이고, 광선도 지평선과 나란하다. **두 경로가 같은 각에서 함께 닫히는 것**이
      // 일치의 일부이므로 건너뛰지 않고 «둘 다 null»을 단언한다.
      let compared = 0;
      for (const g of [-70, -35, -10, 0, 15, 30, 45, 60, 80, 90]) {
        const byRay = protractorVp(th.E, v0, v1, g);
        const by3d = auxVpAt(aux({ yawDeg: g }), A, P, F, IMG)!.at;
        expect(byRay === null).toBe(by3d === null);
        if (byRay && by3d) {
          expect(Math.hypot(byRay[0] - by3d[0], byRay[1] - by3d[1])).toBeLessThan(1e-6);
          compared++;
        }
      }
      expect(compared).toBeGreaterThanOrEqual(8);   // #36 — 전부 닫혀 있으면 잰 것이 없다
    });

    it(`[${name}] 각도기의 역(화면점 → 눈금)이 정방향과 맞물린다`, () => {
      const v0 = axisVpAt(A[0], P, F, IMG)!.at!;
      const v1 = axisVpAt(A[1], P, F, IMG)!.at!;
      const th = thales(v0, v1, P)!;
      for (const g of [-80, -45, 0, 20, 55, 90]) {
        const p = protractorVp(th.E, v0, v1, g)!;
        expect(protractorAngle(th.E, v0, v1, p)!).toBeCloseTo(normYaw(g), 9);
      }
      // 눈금 0·90은 두 축 소실점 자신이다(지시: "X축 소실점 방향 0°, Z축 90°")
      expect(protractorAngle(th.E, v0, v1, v0)!).toBeCloseTo(0, 9);
      expect(protractorAngle(th.E, v0, v1, v1)!).toBeCloseTo(90, 9);
    });

    it(`[${name}] **지평선 위 탭 = 같은 각** — 역투영이 각도기와 같은 답을 낸다`, () => {
      const v0 = axisVpAt(A[0], P, F, IMG)!.at!;
      const v1 = axisVpAt(A[1], P, F, IMG)!.at!;
      const th = thales(v0, v1, P)!;
      for (const g of [-75, -30, 0, 25, 50, 85]) {
        const p = protractorVp(th.E, v0, v1, g)!;
        // 경로 ①: 그 점을 **탭했다면** 나오는 각(역투영 — 탈레스를 안 쓴다)
        expect(yawFromScreenPoint(p, A, P, F)!).toBeCloseTo(normYaw(g), 6);
      }
      // 축 소실점을 탭하면 0°·90°다
      expect(yawFromScreenPoint(v0, A, P, F)!).toBeCloseTo(0, 6);
      expect(yawFromScreenPoint(v1, A, P, F)!).toBeCloseTo(90, 6);
    });

    it(`[${name}] 탭 → 각 → 소실점 왕복이 제자리로 온다`, () => {
      // ⚠ **왕복은 설계 보장에 가깝다**(#5 유형 3) — 그래서 이 팔은 «맞는가»가 아니라
      // «어긋나는 자리가 없는가»만 본다. 경로가 같은 양임을 재는 것은 위 세 팔이다.
      for (const g of [-60, -20, 5, 40, 70]) {
        const src = auxVpAt(aux({ yawDeg: g }), A, P, F, IMG)!.at!;
        const back = yawFromScreenPoint(src, A, P, F)!;
        const again = auxVpAt(aux({ yawDeg: back }), A, P, F, IMG)!.at!;
        expect(Math.hypot(again[0] - src[0], again[1] - src[1])).toBeLessThan(1e-6);
      }
    });
  }

  it("**반례** — 지평선에서 벗어난 탭은 수평 성분만 남긴다(수직 성분을 버린다)", () => {
    const A = ORDERS[0].A;
    const v0 = axisVpAt(A[0], P, F, IMG)!.at!;
    const on = yawFromScreenPoint(v0, A, P, F)!;
    // 지평선에서 40px 위로 벗어난 탭 — **각이 안 바뀐다**(그 벗어남은 pitch이지 yaw가 아니다)
    const off = yawFromScreenPoint([v0[0], v0[1] - 40], A, P, F)!;
    expect(off).toBeCloseTo(on, 6);
  });

  it("**반례** — 축 방향이 없으면 각이 없다 · 기준이 겹치면 자리가 없다", () => {
    expect(yawFromScreenPoint([100, 100], [null, null, null], P, F)).toBeNull();
    // E가 소실점 위에 겹치면 광선의 기준이 없다
    expect(protractorVp([0, 0], [0, 0], [100, 0], 30)).toBeNull();
    expect(protractorAngle([0, 0], [0, 0], [100, 0], [5, 5])).toBeNull();
  });

  it("**반례** — 주점이 두 소실점 사이에 없으면 각도기 자체가 없다(이론서 6.5)", () => {
    // 예각 조건이 깨진 구도 — `thales`가 null이므로 경로 ②가 **닫힌다**. ①·③은 그래도 산다
    expect(thales([100, 300], [300, 300], [900, 300])).toBeNull();
  });

  it("**1점에서는 ②가 닫히고 ①이 산다** — 둘이 같은 경로가 아니라는 증거", () => {
    // 축 1이 화면과 나란해 소실점이 무한원이다(1점) → 탈레스의 재료가 없다
    const A1: (Vec3 | null)[] = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
    expect(axisVpAt(A1[1], P, F, IMG)!.at).toBeNull();
    // ①은 축 방향 둘만 쓰므로 돈다 — 축 0의 소실점(= 주점)을 탭하면 0°다
    expect(yawFromScreenPoint(P, A1, P, F)).toBeCloseTo(0, 6);
    // 유한 소실점을 가진 임의 각의 왕복 — ⚠ **P + 200px 탭은 90°가 아니다**: 90° 방향
    // (축 1 = 화면 나란)의 소실점은 **무한원**이고, 그 탭이 주는 것은 atan2(200, f)의
    // 방향이다. 탭이 «자리»를 주고 각은 역투영이 정한다 — 그것이 이 경로의 정의다.
    expect(yawFromScreenPoint([P[0] + 200, P[1]], A1, P, F))
      .toBeCloseTo(Math.atan2(200, F) / (Math.PI / 180), 6);
    for (const g of [12, 30, -25]) {
      const at = auxVpAt(aux({ yawDeg: g }), A1, P, F, IMG)!.at!;
      expect(yawFromScreenPoint(at, A1, P, F)!).toBeCloseTo(g, 6);
    }
  });

  it("normYaw는 180° 주기다 — 소실점이 d와 −d를 구분 못 한다", () => {
    expect(normYaw(0)).toBe(0);
    expect(normYaw(90)).toBe(90);
    expect(normYaw(135)).toBeCloseTo(-45, 12);
    expect(normYaw(-135)).toBeCloseTo(45, 12);
    expect(normYaw(270)).toBeCloseTo(90, 12);
    expect(normYaw(-90)).toBeCloseTo(90, 12);
  });
});

describe("경사 각도기 — 이론서 15.2 작도는 **2점 전용**이다 (PITFALLS #51)", () => {
  // 지시 원문: *"경사 소실점은 기준선만 그 수평 소실점을 지나는 수직선으로. 30도 경사
  // 계단이면 30도로 쏜다."* — 그 «수직선»과 «쏜다»가 **2점 문면**임을 여기가 잰다.
  const slopeArm = (A: (Vec3 | null)[], yaw: number, pitch: number) => {
    const v0 = axisVpAt(A[0], P, F, IMG)!.at!;
    const v1 = axisVpAt(A[1], P, F, IMG)!.at!;
    const th = thales(v0, v1, P)!;
    const vh = auxVpAt(aux({ yawDeg: yaw }), A, P, F, IMG)!.at!;
    const M = measuringPoint(vh, th.E, v0, v1, P)!.at;
    const v2 = axisVpAt(A[2], P, F, IMG);
    // 기준선의 끝점 — 수직축 소실점이 유한하면 그 점, 무한원이면 화면 세로(2점의 문면)
    const baseEnd: Pt2 = v2?.at ?? [vh[0], vh[1] - 1000];
    const drawn = slopeByMeasuringPoint(M, vh, baseEnd, v0, v1, pitch)!;
    const truth = auxVpAt(aux({ yawDeg: yaw, pitchDeg: pitch }), A, P, F, IMG)!.at!;
    return { drawn, truth, gap: Math.hypot(drawn[0] - truth[0], drawn[1] - truth[1]) };
  };

  it("**2점에서는 맞는다** — 측점에서 30°로 쏜 광선이 참 경사 소실점에 닿는다", () => {
    for (const [yaw, pitch] of [[0, 30], [35, 30], [-25, 15], [60, 45]]) {
      const r = slopeArm(ORDERS[0].A, yaw, pitch);
      expect(r.gap).toBeLessThan(1e-6);
    }
  });

  it("**3점에서는 틀린다** — «수직선»도 «측점에서 쏜다»도 2점 규약이다", () => {
    // ⚠ 이것이 **반례 팔**이다: 안 재면 «2점 전용»이 산문으로만 남는다(15차가 그래서
    // `|PE| = f`를 종단까지 들고 갔다). 어긋남의 **크기**를 박는다 — 0이 아님만이 아니라
    let worst = 0;
    for (const [yaw, pitch] of [[0, 30], [35, 30], [-25, 15]]) {
      const r = slopeArm(ORDERS[1].A, yaw, pitch);
      worst = Math.max(worst, r.gap);
    }
    expect(worst).toBeGreaterThan(1);          // px — 반올림이 아니다
    // 롤까지 들어간 3점에서도 마찬가지다
    expect(slopeArm(ORDERS[2].A, 35, 30).gap).toBeGreaterThan(1);
  });

  it("앱이 쓰는 것은 3D 투영이므로 **전 차수에서 옳다**(작도는 표시·검증용이다)", () => {
    // 일반형의 주장: 경사 소실점은 «대응 수평 소실점 ↔ 수직축 소실점» 직선 위다(D-L106)
    for (const { A } of ORDERS) {
      const v2 = axisVpAt(A[2], P, F, IMG)?.at;
      for (const [yaw, pitch] of [[35, 30], [-25, 15]]) {
        const vh = auxVpAt(aux({ yawDeg: yaw }), A, P, F, IMG)!.at!;
        const vs = auxVpAt(aux({ yawDeg: yaw, pitchDeg: pitch }), A, P, F, IMG)!.at!;
        const end: Pt2 = v2 ?? [vh[0], vh[1] - 1000];
        const ex = end[0] - vh[0], ey = end[1] - vh[1], L = Math.hypot(ex, ey);
        const off = Math.abs((vs[0] - vh[0]) * ey - (vs[1] - vh[1]) * ex) / L;
        expect(off).toBeLessThan(1e-6);
      }
    }
  });
});
