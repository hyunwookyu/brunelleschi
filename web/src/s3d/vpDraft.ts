// L-A.5 **소실점 초안과 조정** — 계획서 §5.4.
//
// L-A.4·L-A.6이 둘을 확정했다.
//   ① **자동 검출만으로는 안 된다** — 축 방향 오차가 검출에서 4.5~10°인데 임계는 **약 1°**다.
//      획을 32배로 늘려도 안 내려간다(AS-L10 반증). 자동 확정 경로를 두지 않는다.
//   ② **그러나 검출을 버릴 이유도 없다** — 초안으로 쓰면 빈 화면에서 세 번 찍는 것보다 싸다.
//
// 그래서 **검출 = 초안, 사용자 = 확정**이다.
//
// ---------------------------------------------------------------- 왜 점이 아니라 선인가
//
// 소실점은 **대개 화면 밖에 있다**(2점 투시의 기본 구도). 화면 밖 점은 끌 수 없다.
// fSpy·SketchUp Match Photo가 쓰는 선례를 따른다(A-3): **축마다 가이드 선 두 개**를 두고
// 그 끝점 넷을 화면 안에서 끈다. 소실점은 두 선의 교점이므로 화면 밖이어도 조정된다.
//
// 누산기가 이미 `vp_line`을 받으므로(`ConstraintAccumulator`) 새 기전이 아니다 —
// **초기값을 검출이 채우고 끌 수 있게 만드는 것**이 여기서 하는 전부다.
//
// 임계의 자릿수(`camera_gate.json@034fc089`): 축 오차 1°는 소실점이 화면 밖
// 800 / 1400 / 2200px일 때 화면에서 **29 / 52 / 102px**이다. 드래그로 닿는 거리다.
import { detectVps, linesFromStrokes, assignAxes, type DetLine } from "./vpDetect.js";
import type { Pt2 } from "./camera.js";

export interface Guide { axis: 0 | 1 | 2; a: Pt2; b: Pt2 }

export const DRAFT_TOL = {
  /** 핸들 반경(화면 대각 대비). 손가락으로도 잡히게 넉넉히. */
  handle_ratio: 0.018,
  /** 가이드 선을 화면 안으로 들일 때 남기는 여백(화면 대각 대비). */
  margin_ratio: 0.03,
  /** 초안 가이드의 최소 길이(화면 대각 대비). 짧으면 끌기 어렵고 소실점이 흔들린다. */
  min_guide_ratio: 0.12,
};
export type DraftCfg = Partial<typeof DRAFT_TOL>;

const diagOf = (sz: [number, number]) => Math.hypot(sz[0], sz[1]);

/** 선분을 화면 안(여백 포함)으로 자른다 — 리앙-바스키. 밖이면 `null`. */
export function clipToCanvas(
  a: Pt2, b: Pt2, imgSize: [number, number], margin: number,
): [Pt2, Pt2] | null {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lo = [margin, margin], hi = [imgSize[0] - margin, imgSize[1] - margin];
  for (const k of [0, 1]) {
    const d = k === 0 ? dx : dy, p0 = a[k];
    for (const [p, q] of [[-d, p0 - lo[k]], [d, hi[k] - p0]] as [number, number][]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
}

/** 선분을 중점 기준으로 늘려 최소 길이를 맞춘다(끌기 쉽게). */
function atLeast(a: Pt2, b: Pt2, minLen: number): [Pt2, Pt2] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L >= minLen || L < 1e-9) return [a, b];
  const k = minLen / L / 2, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  return [[mx - dx * k, my - dy * k], [mx + dx * k, my + dy * k]];
}

/**
 * **검출 결과 → 축마다 가이드 선 두 개.**
 *
 * 각 소실점의 지지선 중 **가장 긴 둘**을 고른다 — 긴 획이 방향을 가장 잘 정하고
 * (`fitVp`의 길이² 가중과 같은 근거), 끌 때도 지렛대가 길어 조정이 안정적이다.
 *
 * **무한원 소실점은 가이드를 만들지 않는다** — 화면 평행 축이라 소실점이 없다(이론서 2.2).
 */
export function draftFromDetection(
  strokes: { id: string; pts2d: Pt2[] }[], imgSize: [number, number], cfg: DraftCfg = {},
): Guide[] {
  const c = { ...DRAFT_TOL, ...cfg };
  const diag = diagOf(imgSize);
  const lines = linesFromStrokes(strokes, imgSize);
  const byId = new Map(lines.map(L => [L.id, L]));
  const cands = detectVps(lines, imgSize);
  const vps = assignAxes(cands, lines);
  const out: Guide[] = [];
  for (const cd of cands) {
    if (cd.infinite) continue;
    const axis = vps.findIndex(v => v && v[0] === cd.vp[0] && v[1] === cd.vp[1]);
    if (axis < 0) continue;
    const sup = cd.support
      .map(id => byId.get(id))
      .filter((L): L is DetLine => !!L)
      .sort((p, q) => q.rep.len - p.rep.len)
      .slice(0, 2);
    if (sup.length < 2) continue;
    for (const L of sup) {
      const [a, b] = atLeast(L.rep.a, L.rep.b, c.min_guide_ratio * diag);
      const cl = clipToCanvas(a, b, imgSize, c.margin_ratio * diag);
      if (cl) out.push({ axis: axis as 0 | 1 | 2, a: cl[0], b: cl[1] });
    }
  }
  return out;
}

export interface HandleRef { index: number; end: 0 | 1 }

/** 화면 점에 가장 가까운 핸들. 반경 밖이면 `null`. */
export function handleAt(
  guides: Guide[], p: Pt2, imgSize: [number, number], cfg: DraftCfg = {},
): HandleRef | null {
  const c = { ...DRAFT_TOL, ...cfg };
  const r = c.handle_ratio * diagOf(imgSize);
  let best: HandleRef | null = null, bd = r;
  guides.forEach((g, index) => {
    for (const end of [0, 1] as const) {
      const q = end === 0 ? g.a : g.b;
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= bd) { bd = d; best = { index, end }; }
    }
  });
  return best;
}

/** 핸들 하나를 옮긴 새 가이드 배열. **원본을 바꾸지 않는다**(되돌리기가 쉬워진다). */
export function moveHandle(guides: Guide[], h: HandleRef, to: Pt2): Guide[] {
  return guides.map((g, i) => {
    if (i !== h.index) return g;
    return h.end === 0 ? { ...g, a: [to[0], to[1]] as Pt2 }
                       : { ...g, b: [to[0], to[1]] as Pt2 };
  });
}

/** 축별로 묶는다 — 누산기에 넣을 형태. */
export function byAxis(guides: Guide[]): Record<0 | 1 | 2, { a: Pt2; b: Pt2 }[]> {
  const out = { 0: [], 1: [], 2: [] } as Record<0 | 1 | 2, { a: Pt2; b: Pt2 }[]>;
  for (const g of guides) out[g.axis].push({ a: g.a, b: g.b });
  return out;
}
