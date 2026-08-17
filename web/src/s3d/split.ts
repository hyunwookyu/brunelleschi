// **자동 분할 — 교차·접촉 지점에서 세그먼트가 나뉜다**(2026-08-17 지시 I). SketchUp 선례.
//
// 목적은 **삐져나온 부분을 잘라내는 것**이다: 지우개가 "조각"(교차점 사이 구간)을 단위로
// 지우려면 조각의 경계 = 다른 세그먼트와의 교차·접촉 매개변수를 먼저 알아야 한다.
//
// ```
// 교차: 두 선분의 **안쪽끼리** 최근접 거리 ≤ 허용 — 양쪽 모두에 절단점이 생긴다
// 접촉: 한 선분의 **끝점**이 다른 선분의 안쪽에 닿음(T자) — 안쪽 선분에만 절단점
// ```
//
// **부분 지우개는 분할의 특수한 경우다**(지시 I 그대로): 지나간 매개 구간을 절단점으로 삼아
// 나눈 뒤 그 구간 조각을 버리는 것 — 그래서 이 모듈은 "절단점 계산"과 "구간 빼기"만 낸다.
// 문서 수술(조각 생성·앵커 이관)은 부르는 쪽(mainL)이 한다.
import { sub3, dot3, norm3, type Vec3 } from "./geom3d.js";

/**
 * 분할 판정 허용치. **`test/constants.ts`(전역 해시)에 안 넣는 사유**: D-L51·D-L54와 같은
 * 자리 — 키 하나가 무관한 원장 40여 개를 STALE로 만든다(DEFERRED "의존 집합별 해시").
 * 값은 이 모듈을 재는 원장(`split` 시험)이 자기 안에 든다.
 */
export const SPLIT_TOL = {
  /**
   * **접촉 거리**(두 선분 길이 중 짧은 쪽 대비 비율). 스냅으로 놓인 기하는 공유점이
   * 정확히 같아 0에 가깝고, 이 여유는 부동소수·양 끝 스냅의 미세 어긋남(D-L46의
   * "같은 꼭짓점이 획마다 다른 3D 점")을 담기 위한 것이다.
   */
  contact_ratio: 0.01,
  /** 절단점이 끝에 이보다 가까우면(매개변수) 안 자른다 — 길이 0 조각을 안 만든다. */
  end_margin: 0.02,
  /** 절단점끼리 이보다 가까우면(매개변수) 하나로 합친다. */
  merge_t: 0.01,
} as const;

export interface Seg3 { id: string; a: Vec3; b: Vec3 }

const at = (s: Seg3, t: number): Vec3 => [
  s.a[0] + (s.b[0] - s.a[0]) * t,
  s.a[1] + (s.b[1] - s.a[1]) * t,
  s.a[2] + (s.b[2] - s.a[2]) * t,
];
const len3 = (s: Seg3): number => norm3(sub3(s.b, s.a));

/** 두 선분의 최근접 매개변수 (t, u)와 거리. 표준 clamped closest-point다. */
export function closestParams(p: Seg3, q: Seg3): { t: number; u: number; dist: number } {
  const d1 = sub3(p.b, p.a), d2 = sub3(q.b, q.a), r = sub3(p.a, q.a);
  const a = dot3(d1, d1), e = dot3(d2, d2), f = dot3(d2, r);
  let t = 0, u = 0;
  if (a <= 1e-20 && e <= 1e-20) { t = 0; u = 0; }
  else if (a <= 1e-20) { t = 0; u = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = dot3(d1, r);
    if (e <= 1e-20) { u = 0; t = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = dot3(d1, d2);
      const den = a * e - b * b;
      t = den > 1e-20 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      u = (b * t + f) / e;
      if (u < 0) { u = 0; t = Math.max(0, Math.min(1, -c / a)); }
      else if (u > 1) { u = 1; t = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  const dv = sub3(at(p, t), at(q, u));
  return { t, u, dist: norm3(dv) };
}

/**
 * **선분 하나의 절단점들** — 다른 선분들과의 교차(안쪽×안쪽)·접촉(상대 끝점×내 안쪽).
 * 끝 여유 안이나 서로 너무 가까운 절단점은 정리한다.
 */
export function cutParams(s: Seg3, others: Seg3[], cfg: Partial<typeof SPLIT_TOL> = {}): number[] {
  const c = { ...SPLIT_TOL, ...cfg };
  const L = len3(s);
  if (L < 1e-12) return [];
  const cuts: number[] = [];
  for (const o of others) {
    if (o.id === s.id) continue;
    const eps = c.contact_ratio * Math.min(L, Math.max(1e-12, len3(o)));
    const { t, u, dist } = closestParams(s, o);
    if (dist > eps) continue;
    // 내 쪽 절단점은 **안쪽**이어야 한다(끝점 접촉은 이미 조각 경계다)
    if (t <= c.end_margin || t >= 1 - c.end_margin) continue;
    // 상대가 안쪽(교차)이든 끝점(T 접촉)이든 — 내 안쪽에 닿았으면 자른다
    void u;
    cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  const out: number[] = [];
  for (const t of cuts) if (!out.length || t - out[out.length - 1] > c.merge_t) out.push(t);
  return out;
}

/** 절단점 → 조각 [t0, t1] 목록. */
export const piecesFromCuts = (cuts: number[]): [number, number][] => {
  const b = [0, ...cuts, 1];
  const out: [number, number][] = [];
  for (let i = 1; i < b.length; i++) out.push([b[i - 1], b[i]]);
  return out;
};

/**
 * **구간 빼기** — 부분 지우개. `erase`(합쳐지지 않은 [t0,t1]들)를 빼고 남는 조각을 낸다.
 * 결과 조각이 `min_len`(매개변수)보다 짧으면 버린다 — 먼지 조각을 안 남긴다.
 */
export function subtractIntervals(
  erase: [number, number][], min_len = 0.02,
): [number, number][] {
  const ordered = erase
    .map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [number, number])
    .map(([a, b]) => [Math.max(0, a), Math.min(1, b)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const iv of ordered) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  const keep: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of merged) {
    if (a - cur >= min_len) keep.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (1 - cur >= min_len) keep.push([cur, 1]);
  return keep;
}

/** 매개변수 t의 3D 점 — 조각의 끝점 계산에 쓴다. */
export const pointAt = at;

/**
 * **앵커 이관 규칙**(지시 I — "지운 조각이 다른 세그먼트의 앵커였으면 어떻게 되는지 정의한다").
 *
 * 정의: 앵커(`snapStart`/`snapEnd`)는 **획 id가 아니라 3D 점**이 본체다. 대상 획이 조각나면
 * ① 앵커 점을 **담고 있는 살아남은 조각**으로 `ofId`를 넘긴다(점-선분 거리 ≤ 접촉 허용).
 * ② 그 점을 담은 조각이 지워졌으면 **스냅 기록을 끊는다**(`null`) — 기하(`seg3d`)는 좌표로
 *    확정돼 있어 **다음 차수 승격 전까지는** 움직이지 않는다. ⚠ 승격은 전부 다시 풀므로
 *    (CLAUDE.md §1) 기록이 끊긴 획은 그때 두 점 경로를 잃는다 — D-L46("하나라도 못 살리면
 *    안 놓는다")대로 **2D 대기로 내려가는 것이 옳은 동작**이고, 조용히 다른 곳에 붙는 것보다
 *    낫다(A-3). 끊긴 개수는 부르는 쪽이 세어 알린다(#7).
 * 삭제를 소리 없이 전파하지 않는다 — 그 획들을 2D로 되돌리는 것은 사용자가 시키지 않은
 * 삭제다(`deletePicked`의 기존 규약 그대로).
 */
export function reanchorId(
  anchorAt: Vec3, pieces: Seg3[], cfg: Partial<typeof SPLIT_TOL> = {},
): string | null {
  const c = { ...SPLIT_TOL, ...cfg };
  let best: { id: string; d: number } | null = null;
  for (const p of pieces) {
    const { dist } = closestParams({ id: "_a", a: anchorAt, b: anchorAt }, p);
    if (!best || dist < best.d) best = { id: p.id, d: dist };
  }
  if (!best) return null;
  const scale = Math.max(...pieces.map(len3), 1e-12);
  return best.d <= c.contact_ratio * scale ? best.id : null;
}
