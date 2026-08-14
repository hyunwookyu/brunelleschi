// 3D 기본 연산 — 화면 점 하나를 3D 점 하나로 올리는 데 필요한 전부.
//
// 폐기된 `wire/model.ts`에서 **순수 기하 함수만** 구제했다. Vertex/Edge/Face와
// provenance는 함께 폐기됐다(계획서 §10) — 이번 접근의 자료구조는 `Stroke`이고
// 정점을 따로 만들지 않는다. 손떨림이 든 점열이 그대로 3D 점열이 된다.
//
// **카메라가 확정되면 커서 픽셀 하나가 3D 점 하나를 유일하게 결정한다.**
// 눈에서 커서로 나가는 광선과 (앵커 + t·축방향) 직선의 최근접점이 그 점이다.
// 두 직선이 만나지 않아도(손떨림) 답이 하나 나오므로 실패 모드가 온건하다.
import type { Pt2 } from "./camera.js";

export type Vec3 = [number, number, number];

export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm3 = (a: Vec3) => Math.sqrt(dot3(a, a));
export function unit3(a: Vec3): Vec3 {
  const L = norm3(a);
  return L < 1e-12 ? [0, 0, 0] : [a[0] / L, a[1] / L, a[2] / L];
}

/** 두 3D 방향이 이루는 각(도). */
export function angleBetween(a: Vec3, b: Vec3): number {
  const u = unit3(a), v = unit3(b);
  return (Math.acos(Math.max(-1, Math.min(1, dot3(u, v)))) * 180) / Math.PI;
}

export interface Closest { p: Vec3; q: Vec3; t: number; s: number; gap: number; parallel: boolean; }

/**
 * 광선 (o + t·d) 와 직선 (a + s·e) 의 최근접점 쌍.
 * gap = 둘 사이 거리. 0에 가까우면 실제로 만난 것이다.
 */
export function closestPoints(o: Vec3, d: Vec3, a: Vec3, e: Vec3): Closest {
  const u = unit3(d), v = unit3(e);
  const w0 = sub3(o, a);
  const b = dot3(u, v);
  const den = 1 - b * b;
  const dU = dot3(u, w0), dV = dot3(v, w0);
  if (Math.abs(den) < 1e-12) {
    const s = dV;
    const q = add3(a, mul3(v, s));
    return { p: o, q, t: 0, s, gap: norm3(sub3(o, q)), parallel: true };
  }
  const t = (b * dV - dU) / den;
  const s = (dV - b * dU) / den;
  const p = add3(o, mul3(u, t));
  const q = add3(a, mul3(v, s));
  return { p, q, t, s, gap: norm3(sub3(p, q)), parallel: false };
}

/** 최근접점 쌍의 중점 — 실제 배치 위치. 어느 한쪽을 고르면 그쪽 오차만 남는다. */
export const meetPoint = (c: Closest): Vec3 => mul3(add3(c.p, c.q), 0.5);

/**
 * 화면 점 → 카메라 좌표계 광선 방향.
 * 게이지: 씨앗 평면 깊이를 z₀ = f 로 두므로 화면 평행면 좌표가 `u − p`가 된다.
 * z는 화면 안쪽으로 들어가는 축이고 f 단위다.
 */
export function rayThrough(screen: Pt2, principal: Pt2, f: number): Vec3 {
  return unit3([screen[0] - principal[0], screen[1] - principal[1], f]);
}

/** 3D 점 → 화면. `rayThrough`의 역이며 z>0(카메라 앞)일 때만 유효하다. */
export function project(p: Vec3, principal: Pt2, f: number): Pt2 | null {
  if (p[2] <= 1e-9) return null;
  return [principal[0] + (p[0] * f) / p[2], principal[1] + (p[1] * f) / p[2]];
}

/**
 * 소실점 → 그 축의 **3D 방향**. 소실점은 그 방향으로 무한히 간 점의 상이므로,
 * 그 방향은 눈에서 소실점으로 나가는 광선 방향과 같다(이론서 2.2).
 * 이것이 "이 획은 X축"이라는 판정을 3D 직선으로 바꿔 준다.
 */
export const axisDirection = (vp: Pt2, principal: Pt2, f: number): Vec3 =>
  rayThrough(vp, principal, f);

/**
 * 평면(n·x = d)과 광선의 교점. **§4.3 "이미 정의된 면 위에 있음"** 경로가 이것을 쓴다 —
 * 면이 있으면 축을 몰라도 화면 점 하나가 3D 점 하나를 정한다.
 */
export function rayPlane(o: Vec3, dir: Vec3, n: Vec3, d: number): Vec3 | null {
  const den = dot3(n, dir);
  if (Math.abs(den) < 1e-12) return null;
  const t = (d - dot3(n, o)) / den;
  if (t <= 0) return null;
  return add3(o, mul3(dir, t));
}
