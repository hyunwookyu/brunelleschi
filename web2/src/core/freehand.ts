// 프리핸드 점렬 유틸(web2-24 4부) — 옐로 겹에서 raw(손 점렬)가 정본 기하가 되면서
// 필요해진 둘: ① 확정 시점의 RDP 솎기(합쳐진 포인터 사건은 한 획에 수백 점이다)
// ② 점-점렬 거리(지우개 히트가 현이 아니라 점렬을 따라 재야 곡선 안쪽이 지워진다).
//
// ⚠ 이 모듈은 옐로 전용 규약의 도구다 — 트레이싱지·바탕의 확정 기하는 여전히 {a,b}이고
// (§1: 손떨림은 버린다), 거기의 점렬은 질감·필압용 그대로라 솎지 않는다(길이가 점별 입력과
// 나란해야 한다는 불변식이 거기서는 원본 길이로 산다).

import type { Pt } from './vec'

/** 점 p → 선분 ab 거리 */
const dSeg = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/** 점 → 점렬(폴리라인) 최소 거리. 점이 하나면 그 점까지 거리다. */
export function distToPolyline(p: Pt, pts: Pt[]): number {
  if (pts.length === 0) return Infinity
  if (pts.length === 1) return Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y)
  let d = Infinity
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, dSeg(p, pts[i]!, pts[i + 1]!))
  return d
}

/** Ramer–Douglas–Peucker — **남길 인덱스**를 돌려준다(오름차순 · 양 끝 항상 포함).
 *  인덱스로 돌려주는 이유: 점별 입력(필압·기울기)이 점렬과 나란해야 하므로 같은
 *  인덱스로 함께 골라낸다(file.ts의 «길이가 같아야 한다» 불변식 유지). */
export function rdpIndices(pts: Pt[], eps: number): number[] {
  if (pts.length <= 2) return pts.map((_, i) => i)
  const keep = new Set<number>([0, pts.length - 1])
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [i0, i1] = stack.pop()!
    let worst = -1, worstD = eps
    for (let i = i0 + 1; i < i1; i++) {
      const d = dSeg(pts[i]!, pts[i0]!, pts[i1]!)
      if (d > worstD) { worstD = d; worst = i }
    }
    if (worst >= 0) {
      keep.add(worst)
      stack.push([i0, worst], [worst, i1])
    }
  }
  return [...keep].sort((a, b) => a - b)
}
