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
// ⚠ 옛 주석은 "축 오차 1°는 화면에서 29 / 52 / 102px이라 드래그로 닿는다"였다. **둘 다 철회됐다.**
//   ① 임계는 1°가 아니라 **0.5°**다(L-A.7 정정, `camera_gate.json@34db7279`의 무오차 행 기준).
//   ② 29~102px은 **소실점 좌표의 여유이지 핸들 여유가 아니다**(PITFALLS #29).
//      사용자가 만지는 양으로 환산하면 **핸들 예산**이고, 그것은 가이드 길이와 각차가 정한다 —
//      `vpSensitivity.ts`가 그 값을 계산하고 `guide_budget.json`이 실측을 낸다.
import { detectVps, linesFromStrokes, assignAxes, type DetLine } from "./vpDetect.js";
import type { Pt2 } from "./camera.js";

export interface Guide {
  axis: 0 | 1 | 2; a: Pt2; b: Pt2;
  /**
   * **그림에서 나온 것이 아니라 채운 것인가**(L-B.3 항목 b · 리뷰어 2회차 [11]).
   *
   * 채우기를 넣은 뒤 **초안만으로 카메라가 서고 민감도 숫자가 뜬다** — 그런데 그 축 일부는
   * 검출이 아니라 **표준 2점 구도의 기본값**이다. 구분하지 않으면 A-3의 "없는 숫자를
   * 지어내지 않는다"가 뒤집힌다. 화면이 이 표시로 갈라 그린다.
   */
  filled?: boolean;
}

export const DRAFT_TOL = {
  /** 핸들 반경(화면 대각 대비). 손가락으로도 잡히게 넉넉히. */
  handle_ratio: 0.018,
  /** 가이드 선을 화면 안으로 들일 때 남기는 여백(화면 대각 대비). */
  margin_ratio: 0.03,
  /**
   * **초안 가이드의 최소 길이**(화면 대각 대비) — **핸들 예산을 정하는 지배 인자다.**
   *
   * 소실점은 두 핸들을 잇는 직선으로 정해지므로 그 직선의 각도 정밀도가 **핸들 간격에 비례**한다.
   * 측정(`vp_homog.json`의 `by_guide_length`): 축 오차 0.5°를 다 쓰기까지 핸들이 움직여도 되는
   * px(최악 방향, 각차 3~20°)는
   * ```
   * 길이 100px → 0.20~0.72px      300px → 0.63~2.16px
   *      140px → 0.29~1.01px      450px → 0.96~3.25px
   *      200px → 0.42~1.44px      600px → 1.28~4.33px
   * ```
   * **초판 0.12(960×672에서 140px)는 서브픽셀 예산이었다** — 사람이 맞출 수 없다.
   * 0.45로 올린다(≈525px, 예산 1.1~3.8px). **그래도 넉넉하지 않다** —
   * 이것이 §5.4의 실제 한계이고 `progress.md`에 그렇게 적었다.
   */
  min_guide_ratio: 0.45,
  /**
   * **지지선 두 개를 고르는 방법**(L-B.3 항목 b).
   *
   * 초판은 `"longest"`(가장 긴 둘)였다. 근거는 "긴 획이 방향을 가장 잘 정한다"였는데,
   * **소실점은 두 선의 교점**이므로 교점의 조건은 길이만이 아니라 **두 선의 각차**가 함께
   * 정한다 — 나란한 두 선은 아무리 길어도 교점이 안 정해진다(무한원 스냅으로 축이 비워진다).
   *
   * `"len_x_sep"`은 `len_i · len_j · sin(각차)`를 최대로 하는 쌍이다 — 두 인자를 함께 본다.
   * `"widest"`는 각차만 본다. **어느 것이 맞는지는 `draft_recover.json`이 정한다.**
   */
  support_pick: "len_x_sep" as "longest" | "widest" | "len_x_sep",
  /**
   * **초안이 못 채운 축을 중립 위치로 채운다**(L-B.3 항목 b).
   *
   * 측정(`draft_recover.json`): 초안은 90장면 중 **21에서 가이드가 4개 미만**이다.
   * 그 축은 화면에 손잡이가 아예 없어 **사용자가 끌 것이 없다** — 조정 UI의 전제가 깨진다.
   *
   * 중립 가이드는 그림을 안 보는 표준 2점 구도이고, 축 오차 중앙 **13.8°**로 초안(9.05°)보다
   * 나쁘다. 그러니 **초안을 대체하지 않고 빈 축만 채운다** — 있는 것은 초안이 이기고
   * 없는 것은 중립이 0보다 낫다.
   */
  fill_missing_axes: true,
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
    const pool = cd.support.map(id => byId.get(id)).filter((L): L is DetLine => !!L);
    const sup = pickSupport(pool, c.support_pick);
    if (sup.length < 2) continue;
    for (const L of sup) {
      const [a, b] = atLeast(L.rep.a, L.rep.b, c.min_guide_ratio * diag);
      const cl = clipToCanvas(a, b, imgSize, c.margin_ratio * diag);
      if (cl) out.push({ axis: axis as 0 | 1 | 2, a: cl[0], b: cl[1] });
    }
  }
  // **빈 축만 중립으로 채운다.** 초안이 있는 축은 건드리지 않는다 — 초안이 중립보다 낫다.
  if (c.fill_missing_axes) {
    const neutral = neutralGuides(imgSize);
    for (const ax of [0, 1, 2] as const) {
      if (out.filter(g => g.axis === ax).length >= 2) continue;
      const need = 2 - out.filter(g => g.axis === ax).length;
      out.push(...neutral.filter(g => g.axis === ax).slice(0, need).map(g => ({ ...g, filled: true })));
    }
  }
  return out;
}

/**
 * 지지선 둘 고르기(§5.2 · L-B.3 항목 b). **왜 세 갈래인가는 `DRAFT_TOL.support_pick` 주석에 있다.**
 *
 * 후보가 많으면 `len_x_sep`·`widest`가 O(n²)이지만 지지선 수는 획 수 이하라 문제되지 않는다.
 */
export function pickSupport(pool: DetLine[], how: typeof DRAFT_TOL.support_pick): DetLine[] {
  if (pool.length < 2) return pool.slice();
  if (how === "longest") {
    return pool.slice().sort((p, q) => q.rep.len - p.rep.len).slice(0, 2);
  }
  const dirOf = (L: DetLine): [number, number] => {
    const dx = L.rep.b[0] - L.rep.a[0], dy = L.rep.b[1] - L.rep.a[1];
    const n = Math.hypot(dx, dy) || 1;
    return [dx / n, dy / n];
  };
  let best: DetLine[] = pool.slice(0, 2), bv = -Infinity;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const [ax, ay] = dirOf(pool[i]), [bx, by] = dirOf(pool[j]);
    const sin = Math.abs(ax * by - ay * bx);          // |sin(각차)| — 부호 무시(축은 직선이다)
    const v = how === "widest" ? sin : sin * pool[i].rep.len * pool[j].rep.len;
    if (v > bv) { bv = v; best = [pool[i], pool[j]]; }
  }
  return best;
}

/**
 * **중립 가이드** — 그림을 전혀 안 보는 표준 2점 구도. 소실점은 좌우 화면 밖, 수직은 화면 평행.
 *
 * 초안이 축을 못 채웠을 때의 시작 위치이며 **측정 하네스도 이 함수를 쓴다**(PITFALLS #17).
 * 값의 근거는 `draft_recover.json`의 `neutral_ignores_drawing` 팔이다 —
 * 카메라는 **언제나 서지만**(90/90) 축 오차 중앙 13.8° · f 상대오차 0.41로 초안보다 나쁘다.
 */
export function neutralGuides(imgSize: [number, number]): Guide[] {
  const [W, H] = imgSize;
  const vpR: Pt2 = [W * 1.6, H * 0.45], vpL: Pt2 = [-W * 0.6, H * 0.45];
  const out: Guide[] = [];
  for (const [ax, v] of [[0, vpR], [1, vpL]] as [0 | 1, Pt2][]) {
    for (const t of [[W * 0.35, H * 0.35], [W * 0.35, H * 0.72]] as Pt2[]) {
      out.push({ axis: ax, a: [v[0], v[1]], b: [t[0], t[1]] });
    }
  }
  // 수직은 **화면 평행**으로 둔다 — 2점 구도의 기본값이다(이론서 2.2의 c=0).
  // 3점 그림이면 사용자가 벌려서 끄고, 그때 차수가 승격된다(§6).
  out.push({ axis: 2, a: [W * 0.3, H * 0.2], b: [W * 0.3, H * 0.85] });
  out.push({ axis: 2, a: [W * 0.7, H * 0.2], b: [W * 0.7, H * 0.85] });
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

/**
 * **선 자체에 가장 가까운 가이드**(L-B.2). 핸들이 아니라 **선을 통째로 잡는다** —
 * 라이노·SketchUp에서 선을 끄는 것과 같은 동작이라 새로 배울 것이 없다(A-3).
 *
 * 왜 필요한가: 초안 가이드는 **검출 지지선**에서 나오므로 길이를 그림이 정한다.
 * 캔버스 안 현(弦)이 짧은 자리에 놓이면 `min_guide_ratio`를 못 채우고
 * (L-B.1에서 여섯 중 둘이 651px에 미달했다) **핸들 예산이 그만큼 좁아진다**.
 * 선을 옮기면 사용자가 **더 긴 현이 나오는 자리로** 가져갈 수 있다.
 */
export function guideLineAt(
  guides: Guide[], p: Pt2, imgSize: [number, number], cfg: DraftCfg = {},
): number | null {
  const c = { ...DRAFT_TOL, ...cfg };
  const r = c.handle_ratio * diagOf(imgSize);
  let bestI = -1, bestD = Infinity;
  guides.forEach((g, i) => {
    const ex = g.b[0] - g.a[0], ey = g.b[1] - g.a[1], L2 = ex * ex + ey * ey;
    const t = L2 < 1e-12 ? 0
      : Math.max(0, Math.min(1, ((p[0] - g.a[0]) * ex + (p[1] - g.a[1]) * ey) / L2));
    const d = Math.hypot(g.a[0] + ex * t - p[0], g.a[1] + ey * t - p[1]);
    if (d < bestD) { bestD = d; bestI = i; }
  });
  return bestI >= 0 && bestD <= r ? bestI : null;
}

/** 가이드 하나를 통째로 평행이동한다. **방향은 그대로** — 소실점이 선을 따라 미끄러진다. */
export function moveGuideBy(guides: Guide[], index: number, dx: number, dy: number): Guide[] {
  return guides.map((g, i) => (i !== index ? g
    : { ...g, a: [g.a[0] + dx, g.a[1] + dy] as Pt2, b: [g.b[0] + dx, g.b[1] + dy] as Pt2 }));
}

/**
 * 가이드를 **자기 직선을 따라 캔버스 끝까지 늘린다**(L-B.2).
 * 방향과 소실점은 안 바뀌고 **지렛대만 길어진다** — 핸들 예산이 길이에 반비례하기 때문이다
 * (`vp_homog.json`: 300px 0.63~2.16 → 1250px 2.68~9.03).
 * 늘릴 수 없으면(이미 최대) 그대로 돌려준다.
 */
export function extendGuide(
  guides: Guide[], index: number, imgSize: [number, number], cfg: DraftCfg = {},
): Guide[] {
  const c = { ...DRAFT_TOL, ...cfg };
  const g = guides[index];
  if (!g) return guides;
  const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return guides;
  const far: [Pt2, Pt2] = [[g.a[0] - dx * 1e3, g.a[1] - dy * 1e3],
                           [g.b[0] + dx * 1e3, g.b[1] + dy * 1e3]];
  const cl = clipToCanvas(far[0], far[1], imgSize, c.margin_ratio * diagOf(imgSize));
  if (!cl) return guides;
  return guides.map((x, i) => (i === index ? { ...x, a: cl[0], b: cl[1] } : x));
}
