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
