// S-4 튜브 메쉬 — 획을 굵기 있는 3D 입체로 만든다. 계획서 §7 S-4.
//
// **three.js `TubeGeometry`를 쓰지 않는다.** 그것은 반지름이 상수인데 §S-4가 요구하는 것은
// **속도 기반 굵기**, 즉 점마다 다른 반지름이다. 표준 기하이므로 직접 짠다
// (참조 저장소 코드는 보지도 복사하지도 않는다 — CLAUDE.md §3).
//
// **점을 다시 샘플링하지 않는다**(§1 "획을 버리지 않는다"). 들어온 점열이 그대로 튜브의 중심선이다.
import { add3, cross3, dot3, mul3, norm3, sub3, unit3, type Vec3 } from "./geom3d.js";

export const TUBE_TOL = {
  /** 단면 분할 수. 얇은 튜브라 6이면 실루엣이 매끄럽다 — 늘리면 정점만 는다. */
  radial_segments: 6,
  /** 속도 → 굵기 지수. 빠를수록 얇다(v/v_med의 −gamma 승). */
  speed_gamma: 0.5,
  /** 굵기 배율의 하한·상한. 한 획 안에서 굵기가 무한정 벌어지지 않게 한다. */
  width_min: 0.55,
  width_max: 1.6,
  /** 속도 평활 창(점 수). 원 속도는 표본 잡음이 커서 그대로 쓰면 굵기가 떨린다. */
  smooth_window: 5,
  /** 화면 기준 획 굵기(px). 실척이 아니라 **표시용 선택**이다. */
  base_width_px: 3.2,
};

// ---------------------------------------------------------------- 속도 → 굵기

/**
 * 포인터 표본 `[x, y, t, ...]`에서 **점마다의 화면 굵기(px)**를 낸다.
 *
 * 빠르게 그은 곳은 얇고 느린 곳은 굵다 — 실제 펜이 그렇다. 속도는 **자기 획의 중앙값으로
 * 정규화**한다. 절대 속도로 하면 빨리 그리는 사람의 획이 전부 얇아진다(V-s: 절대 단위 금지).
 *
 * 시간이 없거나(합성 획) 표본이 모자라면 **일정 굵기**로 떨어진다 — 추정하지 않는다.
 */
export function widthProfile(
  raw: number[][] | undefined, n: number, cfg: Partial<typeof TUBE_TOL> = {},
): number[] {
  const c = { ...TUBE_TOL, ...cfg };
  const flat = new Array(n).fill(c.base_width_px);
  if (!raw || raw.length !== n || n < 3 || raw[0].length < 3) return flat;

  // 점별 속도(px/ms). 같은 시각의 표본(coalesced)은 앞 값을 물려받는다.
  const speed: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const dt = raw[i][2] - raw[i - 1][2];
    const d = Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
    speed[i] = dt > 1e-6 ? d / dt : speed[i - 1];
  }
  speed[0] = speed[1];
  const ok = speed.filter(Number.isFinite);
  if (ok.length < 3) return flat;
  const sorted = [...ok].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  if (!(med > 1e-9)) return flat;

  // 평활 — 원 속도는 표본 잡음이 커서 그대로 쓰면 굵기가 떨린다
  const w = Math.max(1, Math.round(c.smooth_window));
  const half = w >> 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0, k = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      if (Number.isFinite(speed[j])) { s += speed[j]; k += 1; }
    }
    const v = k ? s / k : med;
    const f = Math.pow(Math.max(v, 1e-9) / med, -c.speed_gamma);
    out.push(c.base_width_px * Math.min(c.width_max, Math.max(c.width_min, f)));
  }
  return out;
}

/**
 * 화면 굵기(px) → **그 점이 놓인 깊이에서의 세계 반지름**.
 *
 * 잉크는 3D 물체이므로 세계 반지름을 가져야 하지만, 그 값은 **그린 굵기에서 온다** —
 * 그린 카메라에서 보면 그은 굵기 그대로이고, 돌리면 원근에 따라 자연히 굵어지고 얇아진다.
 * (반대로 화면 굵기를 고정하면 3D 물체가 아니라 화면 장식이 된다.)
 */
export const worldRadius = (widthPx: number, depth: number, f: number): number =>
  (widthPx * 0.5 * depth) / f;

// ---------------------------------------------------------------- 튜브

export interface TubeMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** 정점·삼각형 수 — 지연 예산(P1/P4/V-n) 측정이 쓴다. */
  counts: { rings: number; vertices: number; triangles: number };
}

/** 접선이 t0에서 t1로 갈 때 벡터 v를 같은 회전으로 옮긴다(평행 이송). */
function transport(v: Vec3, t0: Vec3, t1: Vec3): Vec3 {
  const axis = cross3(t0, t1);
  const s = norm3(axis);
  const c = Math.max(-1, Math.min(1, dot3(t0, t1)));
  if (s < 1e-9) return c > 0 ? v : mul3(v, -1);      // 같은 방향이거나 정반대
  const k = mul3(axis, 1 / s);
  const th = Math.atan2(s, c);
  const cs = Math.cos(th), sn = Math.sin(th);
  // 로드리게스
  return add3(add3(mul3(v, cs), mul3(cross3(k, v), sn)), mul3(k, dot3(k, v) * (1 - cs)));
}

/**
 * 중심선 + 점별 반지름 → 튜브 메쉬.
 *
 * 프레임은 **평행 이송**으로 옮긴다. 매 점에서 프레임을 새로 고르면(예: 항상 (0,1,0)과의 외적)
 * 접선이 그 기준과 나란해지는 곳에서 프레임이 홱 돌아 튜브가 꼬인다 — 손으로 그은 획은
 * 방향이 계속 변하므로 실제로 그 자리를 지난다.
 */
export function buildTube(
  pts: Vec3[], radii: number[], cfg: Partial<typeof TUBE_TOL> & { caps?: boolean } = {},
): TubeMesh | null {
  const c = { ...TUBE_TOL, caps: true, ...cfg };
  const seg = Math.max(3, Math.round(c.radial_segments));

  // 겹친 점은 접선을 못 준다 — 버리되 **형태를 바꾸지 않는다**(같은 자리이므로)
  const P: Vec3[] = [], R: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && norm3(sub3(pts[i], P[P.length - 1])) < 1e-12) continue;
    P.push(pts[i]); R.push(radii[Math.min(i, radii.length - 1)] ?? 0);
  }
  const n = P.length;
  if (n < 2) return null;

  // 접선 — 안쪽은 중앙차분(양쪽 방향을 평균해야 꺾인 곳에서 튀지 않는다)
  const T: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? sub3(P[i], P[i - 1]) : sub3(P[1], P[0]);
    const b = i < n - 1 ? sub3(P[i + 1], P[i]) : sub3(P[n - 1], P[n - 2]);
    const t = unit3(add3(unit3(a), unit3(b)));
    T.push(norm3(t) < 1e-9 ? unit3(a) : t);
  }

  // 첫 법선은 접선에 수직인 아무 방향 — 이후는 평행 이송으로 따라간다
  let nrm = cross3(T[0], [0, 1, 0]);
  if (norm3(nrm) < 1e-6) nrm = cross3(T[0], [1, 0, 0]);
  nrm = unit3(nrm);

  const positions = new Float32Array(n * seg * 3);
  const normals = new Float32Array(n * seg * 3);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      nrm = transport(nrm, T[i - 1], T[i]);
      nrm = unit3(sub3(nrm, mul3(T[i], dot3(nrm, T[i]))));   // 수직성 회복(수치 표류)
    }
    const bin = unit3(cross3(T[i], nrm));
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const dir = add3(mul3(nrm, Math.cos(a)), mul3(bin, Math.sin(a)));
      const o = (i * seg + j) * 3;
      const p = add3(P[i], mul3(dir, R[i]));
      positions[o] = p[0]; positions[o + 1] = p[1]; positions[o + 2] = p[2];
      normals[o] = dir[0]; normals[o + 1] = dir[1]; normals[o + 2] = dir[2];
    }
  }

  const tri: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      const a = i * seg + j, b = i * seg + j2, d = (i + 1) * seg + j, e = (i + 1) * seg + j2;
      tri.push(a, d, b, b, d, e);
    }
  }
  let vCount = n * seg;
  let pos = Array.from(positions), nor = Array.from(normals);
  if (c.caps) {
    // 끝을 막는다 — 안 막으면 획 끝에서 속이 비어 보인다
    for (const [idx, sign] of [[0, -1], [n - 1, 1]] as [number, number][]) {
      const centre = P[idx], axis = mul3(T[idx], sign);
      const ci = vCount++;
      pos.push(centre[0], centre[1], centre[2]);
      nor.push(axis[0], axis[1], axis[2]);
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        const a = idx * seg + j, b = idx * seg + j2;
        if (sign < 0) tri.push(ci, b, a); else tri.push(ci, a, b);
      }
    }
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    indices: new Uint32Array(tri),
    counts: { rings: n, vertices: vCount, triangles: tri.length / 3 },
  };
}
