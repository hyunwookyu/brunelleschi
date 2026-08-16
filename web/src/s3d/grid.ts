// W-1 투시 가이드 — 계획서 §3.8. 카메라가 정해지면 캔버스에 축 가이드를 깐다.
//
// 목적은 장식이 아니다. **그리기 전에 축 방향이 보이면 스냅이 예측 가능해진다.**
// 건축가가 구축선을 먼저 긋고 그리는 방식과 같다.
//
// 지금 까는 것: 각 소실점으로 모이는 부챗살 + 지평선.
// **아직 안 까는 것: 눈금이 있는 지면 격자.** 격자 간격은 실척이 있어야 정해지고
// 실척은 지면 씨앗점에서 나온다(W-3 앵커 체인). 그전에 눈금을 그리면 **없는 정보를
// 있는 것처럼 보여 주게 된다** — 이 프로젝트가 반복해서 걸린 유형이다. DEFERRED에 기록.
import { isFiniteVp, type Pt2, type CameraSolution } from "./camera.js";
import {
  axisDirection, project, unit3, sub3, mul3, dot3, norm3, rayPlane, rayThrough, groundFrame,
  EYE_HEIGHT, type Vec3,
} from "./geom3d.js";

export interface GuideLine {
  a: Pt2; b: Pt2;
  kind: "axis" | "horizon" | "ground";
  axis?: 0 | 1 | 2;
}

/** 화면 사각형과 직선(점+방향)의 교차 구간. 소실점이 화면 밖이어도 살을 그릴 수 있다. */
export function clipToRect(p: Pt2, d: Pt2, w: number, h: number): [Pt2, Pt2] | null {
  const [dx, dy] = d;
  if (Math.hypot(dx, dy) < 1e-12) return null;
  // Liang-Barsky: 각 경계마다 pᵢ·t ≤ qᵢ
  let t0 = -Infinity, t1 = Infinity;
  const P = [-dx, dx, -dy, dy];
  const Q = [p[0] - 0, w - p[0], p[1] - 0, h - p[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(P[i]) < 1e-12) {
      if (Q[i] < 0) return null;          // 경계에 평행하면서 밖
      continue;
    }
    const t = Q[i] / P[i];
    if (P[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  if (t0 > t1) return null;
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
}

// ⛔ **부챗살(`fanFromVp`)을 지웠다**(2026-08-17 지시 5-5). 화면 테두리를 균등 분할한
// 방사선은 **화면 각도의 균등 분할**이라 공간에서는 불규칙하다 — "공간상 정사각형 격자"가
// 지시이고 그것은 `groundGrid`(지면 격자 투영)가 한다. 이론서 9.5: 등간격 지면선의 화면
// 좌표는 1/(V−uₙ)이 등차수열 — 3D 격자를 투영하면 그 성질이 저절로 성립한다.

/** 카메라 상태 → 가이드선. **지평선 + 지면 격자**뿐이다 — 모르는 것을 그리지 않는다. */
export function guides(
  cam: CameraSolution, vps: (Pt2 | null)[], imgSize: [number, number],
  horizonY?: number | null,
  axisDirs?: (Vec3 | null)[] | null,
): GuideLine[] {
  const [w, h] = imgSize;
  const out: GuideLine[] = [];
  const y = horizonY ?? (cam.principalPoint ? cam.principalPoint[1] : null);
  if (y != null && y > -h && y < 2 * h) {
    out.push({ a: [0, y], b: [w, y], kind: "horizon" });
  }
  out.push(...groundGrid(cam, vps, imgSize, undefined, undefined, axisDirs));
  return out;
}

/** 축별 색 (§4.4 "축별 색상"). SketchUp 관례에 맞춘다 — 빨강/초록/파랑. */
export const AXIS_COLOR = ["#c0392b", "#1e8449", "#2471a3"] as const;
export const HORIZON_COLOR = "#8e8e8e";
export const GROUND_COLOR = "#7f8c8d";

// ---------------------------------------------------------------- 지면 격자 (§3.6)

/**
 * **투시 지면 격자.** 부챗살과 달리 이것은 실제 3D 평면 위의 선을 투영한 것이다 —
 * 두 축이 확정되고 f가 정해져야 나온다.
 *
 * 간격은 **표시용 선택**이지 측정이 아니다. 아직 실척이 없다(씨앗점이 S-3에서 생긴다).
 * 그래서 눈금·치수를 함께 그리지 않는다 — 없는 정보를 있는 것처럼 보여 주지 않기 위해서다.
 * 격자가 하는 일은 "이 방향이 저기로 모인다"를 보여 주는 것뿐이다.
 *
 * **지면은 수직축이 정한다** — `seedOnGround`와 같은 게이지다(`groundFrame`, 눈높이 1).
 * S-1에서는 `y = 1`로 두었는데 그것은 카메라가 수평일 때만 맞다. 3점 투시에서는 카메라가
 * 기울어 있어 지면이 y = const 가 아니다(S-3에서 드러났다).
 */
export function groundGrid(
  cam: CameraSolution, vps: (Pt2 | null)[], imgSize: [number, number],
  half = 6, step = 1,
  axisDirs?: (Vec3 | null)[] | null,
): GuideLine[] {
  const f = cam.f, pp = cam.principalPoint;
  if (!cam.ok || f == null || !pp) return [];
  // **1점 투시에서도 선다**(지시 5-5): 무한원 축은 소실점이 없지만 방향은 정해져 있다
  // (`axisDirsOf`, D-L40) — 그 방향을 받으면 가로축이 화면 평행인 격자가 나온다.
  const dirOf = (i: 0 | 1): Vec3 | null =>
    (vps[i] && isFiniteVp(vps[i], imgSize) ? axisDirection(vps[i]!, pp, f)
     : axisDirs?.[i] ?? null);
  const a0 = dirOf(0), a1 = dirOf(1);
  if (!a0 || !a1) return [];

  const vUp = vps[2] && isFiniteVp(vps[2], imgSize) ? vps[2]! : null;
  const g = groundFrame(vUp, pp, f, EYE_HEIGHT);
  // 두 축 방향에서 지면 법선 성분을 뺀다 — 지면 안에 눕힌다(수평이면 그대로다)
  const flat = (v: Vec3): Vec3 | null => {
    const d = unit3(sub3(v, mul3(g.n, dot3(v, g.n))));
    return norm3(d) < 1e-6 ? null : d;
  };
  const u = flat(a0), w = flat(a1);
  if (!u || !w) return [];

  const [W, H] = imgSize;
  const out: GuideLine[] = [];
  // 격자 원점 = 화면 중앙 아래를 지나는 광선이 지면과 만나는 곳. 없으면 법선 발.
  const O: Vec3 = rayPlane([0, 0, 0], rayThrough([W / 2, H * 0.72], pp, f), g.n, g.d)
    ?? mul3(g.n, g.d);
  const at = (i: number, t: number, along: Vec3, across: Vec3): Vec3 => [
    O[0] + across[0] * i * step + along[0] * t,
    O[1] + across[1] * i * step + along[1] * t,
    O[2] + across[2] * i * step + along[2] * t,
  ];

  for (const [along, across, axis] of [[u, w, 0], [w, u, 1]] as [Vec3, Vec3, 0 | 1][]) {
    for (let i = -half; i <= half; i++) {
      // 카메라 앞(z>0) 구간만 그린다. 뒤로 넘어가면 투영이 뒤집힌다.
      const pts: Pt2[] = [];
      for (let t = -half * step; t <= half * step + 1e-9; t += step * 0.25) {
        const p = at(i, t, along, across);
        if (p[2] <= 0.05) { pts.length = 0; continue; }
        const s = project(p, pp, f);
        if (!s) { pts.length = 0; continue; }
        pts.push(s);
      }
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        // 화면을 완전히 벗어난 조각은 버린다
        const inside = (q: Pt2) => q[0] > -W && q[0] < 2 * W && q[1] > -H && q[1] < 2 * H;
        if (inside(a) || inside(b)) out.push({ a, b, kind: "ground", axis });
      }
    }
  }
  return out;
}
