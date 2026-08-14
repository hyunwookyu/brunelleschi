// W-3 기하 자료구조 — 계획서 §5.1. **IR을 대체한다.**
//
// 구 IR은 volumes/anchors/openings/relations… 7개 루트 필드에 "무엇을 추정했는가"를
// 담고 있었다. 여기에는 추정이 없다. 카메라가 확정되면 커서 픽셀 하나가 3D 점 하나를
// 유일하게 결정하므로, 남는 것은 **점과 그것을 잇는 선**뿐이다.
//
// provenance도 단순해진다: measured(그은 것에서 나옴) / setting(슬라이더·프리셋) /
// default(미조작 기본값). "얼마나 확실한가"가 아니라 **어디서 왔는가**만 적는다.
import type { Pt2 } from "./camera.js";
import type { Direction } from "./infer.js";

export type Vec3 = [number, number, number];
export type Provenance = "measured" | "setting" | "default";

export interface Vertex {
  id: string;
  position: Vec3;
  provenance: Provenance;
  /** 이 정점이 화면 어디에서 왔는가. 스냅·표시에 쓴다. */
  screen: Pt2;
}

export interface Edge {
  id: string;
  v0: string; v1: string;
  direction: Direction;
  provenance: Provenance;
}

export interface Face {
  id: string;
  edges: string[];
  normal: Vec3;
  /** 평면 방정식 n·x = d */
  d: number;
}

export interface Model {
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  faces: Record<string, Face>;
}

export const ROOT_FIELDS = ["vertices", "edges", "faces"] as const;
export const MAX_ROOT_FIELDS = 12;          // §13 규칙 유지. 지금 3개 — 여유 9.
export const emptyModel = (): Model => ({ vertices: {}, edges: {}, faces: {} });

// ---------------------------------------------------------------- 3D 기본 연산

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

// ---------------------------------------------------------------- 광선-직선 최근접점
//
// **이것이 배치의 전부다**(계획서 §1.1). 카메라가 확정되면 화면의 한 점은 3D 광선 하나를
// 정하고, "어느 축 방향으로 간다"는 것은 3D 직선 하나를 정한다. 둘의 최근접점이 답이다.
// 두 직선이 만나지 않아도(손떨림) 답이 하나 나온다 — 그래서 실패 모드가 온건하다.

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
    // 평행 — 최근접점이 유일하지 않다. o에서 내린 수선을 답으로 준다.
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
export function meetPoint(c: Closest): Vec3 {
  return mul3(add3(c.p, c.q), 0.5);
}

// ---------------------------------------------------------------- 화면 ↔ 3D

/**
 * 화면 점 → 카메라 좌표계 광선 방향. 게이지는 `wire/camera.ts`와 같다:
 * 씨앗 평면 깊이를 z₀ = f 로 두므로 화면 평행면 좌표가 `u − p`가 된다.
 * 여기서 z는 **화면 안쪽으로 들어가는 축**이고 f 단위다.
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
 * 이것이 "축 방향으로 간다"를 3D 직선으로 바꿔 준다.
 */
export function axisDirection(vp: Pt2, principal: Pt2, f: number): Vec3 {
  return rayThrough(vp, principal, f);
}

// ---------------------------------------------------------------- 모델 편집

let _seq = 0;
export const resetIds = () => { _seq = 0; };
const nextId = (prefix: string) => `${prefix}${++_seq}`;

/**
 * 정점 추가 — **가까운 기존 정점이 있으면 그것을 쓴다**(병합).
 *
 * W-2가 가리킨 자리다. 코너 오차의 지배항은 선의 방향이 아니라 위치이고, 선을 따로
 * 고쳐서는 줄지 않는다. **두 선이 같은 정점을 공유하게 만들면** 그 순간 위치가 하나로
 * 정해진다. 병합 반경은 화면 대각 대비 비율이다(절대 픽셀 금지, V-s).
 */
export function addVertex(m: Model, position: Vec3, screen: Pt2, provenance: Provenance,
                          mergeRadius: number): string {
  for (const v of Object.values(m.vertices)) {
    if (Math.hypot(v.screen[0] - screen[0], v.screen[1] - screen[1]) <= mergeRadius) return v.id;
  }
  const id = nextId("v");
  m.vertices[id] = { id, position, provenance, screen };
  return id;
}

export function addEdge(m: Model, v0: string, v1: string, direction: Direction,
                        provenance: Provenance): string | null {
  if (v0 === v1) return null;
  for (const e of Object.values(m.edges)) {
    if ((e.v0 === v0 && e.v1 === v1) || (e.v0 === v1 && e.v1 === v0)) return e.id;
  }
  const id = nextId("e");
  m.edges[id] = { id, v0, v1, direction, provenance };
  return id;
}

/** 정점에 붙은 엣지들. 앵커 체인이 여기서 뻗어 나간다. */
export function incident(m: Model, vid: string): Edge[] {
  return Object.values(m.edges).filter(e => e.v0 === vid || e.v1 === vid);
}
