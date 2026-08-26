// 펜 숫자 인식(web2-08 지시 4-3) — $P 점군 인식기(Vatavu·Anthony·Wobbrock 2012)의
// 표준 구현을 직접 짠다(참조 저장소 코드 아님 — 논문의 공개 알고리즘이다).
//
// 왜 $P인가(A-3 선례): 획 수·순서·방향에 무관한 점군 매칭이라 «4를 두 획으로 쓰는 손»과
// «한 획으로 쓰는 손»을 한 템플릿이 받는다. 사전 학습이 없고 템플릿 몇 개면 돌므로
// 오프라인 PWA에 맞는다. 대가: 흘림·연결 필기는 못 읽는다 — 리본 패널은 숫자를
// 또박또박 쓰는 자리이고, 못 읽으면 화면에 «?»로 보여 다시 쓰게 한다(조용히 틀린
// 치수를 만들지 않는다 — 판정은 사람이 한다).
//
// 글리프 나누기: 획을 가로 위치로 묶는다(겹치면 같은 숫자 — «4»의 두 획).
// 아주 작은 글리프는 소수점 «.»이다.

import type { Pt } from './vec'

const N = 32                      // 점군 크기 — $P 관용값
// 이 거리보다 멀면 «?». 실측으로 놓았다(test/digits.test.ts의 표본 — 분자/분모로 적는다):
// 옳은 매칭 40/40의 최악 0.061(«2») · 잡음 8종(가로선·W·N·X·ㄷ·체크·대각선·삼각형,
// 전부 거부)의 최선 0.1252(X→'8' 후보). 여유(임계 0.10 분모): 아래로 39% · 위로 25%.
// ⚠ 실필기 표본 0 — 옳은 쪽 표본이 «템플릿 흔들기»라 인식률이 아니라 «그 흔들기가
// 임계 안»이라는 말이다. 흘려 쓰면 «?»가 나는 쪽으로 기운 값이다(조용히 틀린 치수보다
// 다시 쓰기가 싸다 — 비용 비대칭 #61 ⚠⚠). AS-C24.
const REJECT = 0.10

interface Cloud { pts: { x: number; y: number; id: number }[] }

/** 템플릿 — 정규 좌표(0..1, y 아래로)의 획 폴리라인들 */
const GLYPHS: Record<string, Pt[][]> = {
  '0': [[{ x: .5, y: 0 }, { x: .18, y: .12 }, { x: .05, y: .5 }, { x: .18, y: .88 }, { x: .5, y: 1 }, { x: .82, y: .88 }, { x: .95, y: .5 }, { x: .82, y: .12 }, { x: .5, y: 0 }]],
  '1': [[{ x: .5, y: 0 }, { x: .5, y: 1 }]],
  '2': [[{ x: .12, y: .28 }, { x: .22, y: .06 }, { x: .5, y: 0 }, { x: .78, y: .08 }, { x: .88, y: .3 }, { x: .62, y: .56 }, { x: .32, y: .76 }, { x: .1, y: 1 }, { x: .9, y: 1 }]],
  '3': [[{ x: .15, y: .1 }, { x: .5, y: 0 }, { x: .85, y: .15 }, { x: .82, y: .36 }, { x: .5, y: .48 }, { x: .85, y: .62 }, { x: .85, y: .85 }, { x: .5, y: 1 }, { x: .15, y: .9 }]],
  '4': [[{ x: .68, y: 0 }, { x: .12, y: .62 }, { x: .92, y: .62 }], [{ x: .68, y: .3 }, { x: .68, y: 1 }]],
  '5': [[{ x: .85, y: 0 }, { x: .22, y: 0 }, { x: .18, y: .42 }, { x: .55, y: .38 }, { x: .85, y: .58 }, { x: .82, y: .84 }, { x: .5, y: 1 }, { x: .15, y: .9 }]],
  '6': [[{ x: .72, y: .04 }, { x: .38, y: .28 }, { x: .18, y: .6 }, { x: .24, y: .86 }, { x: .52, y: 1 }, { x: .78, y: .84 }, { x: .72, y: .58 }, { x: .42, y: .54 }, { x: .2, y: .66 }]],
  '7': [[{ x: .1, y: 0 }, { x: .9, y: 0 }, { x: .45, y: 1 }]],
  '8': [[{ x: .5, y: .48 }, { x: .2, y: .26 }, { x: .5, y: 0 }, { x: .8, y: .26 }, { x: .5, y: .48 }, { x: .18, y: .76 }, { x: .5, y: 1 }, { x: .82, y: .76 }, { x: .5, y: .48 }]],
  '9': [[{ x: .8, y: .12 }, { x: .5, y: 0 }, { x: .2, y: .14 }, { x: .18, y: .38 }, { x: .5, y: .5 }, { x: .78, y: .38 }, { x: .8, y: .12 }], [{ x: .8, y: .16 }, { x: .74, y: 1 }]],
}

/** 획 묶음 → 정규화된 점군: 길이 균등 재표집 → 원점 이동 → **등비** 축소(0..1). */
function toCloud(strokes: Pt[][]): Cloud | null {
  // 총 길이로 점 배분 — 획마다 최소 1점
  const lens = strokes.map(st => {
    let L = 0
    for (let i = 1; i < st.length; i++) L += Math.hypot(st[i]!.x - st[i - 1]!.x, st[i]!.y - st[i - 1]!.y)
    return L
  })
  const total = lens.reduce((a, b) => a + b, 0)
  const pts: { x: number; y: number; id: number }[] = []
  strokes.forEach((st, si) => {
    if (st.length === 0) return
    const n = Math.max(1, total > 0 ? Math.round(N * (lens[si]! / total)) : Math.round(N / strokes.length))
    if (st.length === 1 || lens[si] === 0) {
      for (let k = 0; k < n; k++) pts.push({ x: st[0]!.x, y: st[0]!.y, id: si })
      return
    }
    const step = lens[si]! / n
    let acc = 0, target = step / 2
    for (let i = 1, put = 0; i < st.length && put < n; i++) {
      const a = st[i - 1]!, b = st[i]!
      const seg = Math.hypot(b.x - a.x, b.y - a.y)
      while (acc + seg >= target && put < n) {
        const t = seg > 0 ? (target - acc) / seg : 0
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, id: si })
        put++
        target += step
      }
      acc += seg
    }
    while (pts.filter(p => p.id === si).length < n) pts.push({ x: st[st.length - 1]!.x, y: st[st.length - 1]!.y, id: si })
  })
  if (pts.length === 0) return null
  let lox = Infinity, loy = Infinity, hix = -Infinity, hiy = -Infinity
  for (const p of pts) { lox = Math.min(lox, p.x); loy = Math.min(loy, p.y); hix = Math.max(hix, p.x); hiy = Math.max(hiy, p.y) }
  const s = Math.max(hix - lox, hiy - loy)
  if (!(s > 0)) return null
  const cx = (lox + hix) / 2, cy = (loy + hiy) / 2
  return { pts: pts.map(p => ({ x: (p.x - cx) / s, y: (p.y - cy) / s, id: p.id })) }
}

/** 탐욕 점군 거리($P의 greedy-cloud-match) — 대칭으로 두 번 재서 작은 쪽 */
function cloudDist(a: Cloud, b: Cloud): number {
  const one = (p: Cloud, q: Cloud): number => {
    const used = new Array(q.pts.length).fill(false)
    let sum = 0
    p.pts.forEach((pp, i) => {
      let best = Infinity, bi = -1
      q.pts.forEach((qq, j) => {
        if (used[j]) return
        const d = Math.hypot(pp.x - qq.x, pp.y - qq.y)
        if (d < best) { best = d; bi = j }
      })
      if (bi >= 0) used[bi] = true
      const w = 1 - i / p.pts.length * 0.5      // 앞점 가중 — $P의 confidence weight
      sum += w * best
    })
    return sum / p.pts.length
  }
  return Math.min(one(a, b), one(b, a))
}

const TEMPLATES: { ch: string; cloud: Cloud }[] = Object.entries(GLYPHS)
  .map(([ch, strokes]) => ({ ch, cloud: toCloud(strokes)! }))

/** 글리프 하나(획 묶음) → 숫자 또는 null(못 읽음) */
export function recognizeGlyph(strokes: Pt[][]): { ch: string; d: number } | null {
  const c = toCloud(strokes)
  if (!c) return null
  let best: { ch: string; d: number } | null = null
  for (const t of TEMPLATES) {
    const d = cloudDist(c, t.cloud)
    if (!best || d < best.d) best = { ch: t.ch, d }
  }
  if (!best || best.d > REJECT) return null
  return best
}

interface Glyph { strokes: Pt[][]; lo: number; hi: number; h: number }

const bboxOf = (st: Pt[]) => {
  let lox = Infinity, hix = -Infinity, loy = Infinity, hiy = -Infinity
  for (const p of st) { lox = Math.min(lox, p.x); hix = Math.max(hix, p.x); loy = Math.min(loy, p.y); hiy = Math.max(hiy, p.y) }
  return { lox, hix, loy, hiy }
}

/** 획 목록 → 글리프 묶음 → 문자열. 못 읽는 글리프는 '?'.
 *  가로로 겹치는 획은 같은 글리프다(«4»의 두 획). 아주 작은 글리프는 소수점이다. */
export function recognizeDigits(strokes: Pt[][]): string {
  if (strokes.length === 0) return ''
  const glyphs: Glyph[] = []
  for (const st of strokes) {
    const b = bboxOf(st)
    const h = b.hiy - b.loy
    // 가로 구간이 겹치는 기존 글리프에 붙인다 — 시간 순서와 무관(점 4를 나중에 찍어도 된다)
    const hit = glyphs.find(g => b.lox <= g.hi && b.hix >= g.lo)
    if (hit) {
      hit.strokes.push(st)
      hit.lo = Math.min(hit.lo, b.lox); hit.hi = Math.max(hit.hi, b.hix)
      hit.h = Math.max(hit.h, h)
    } else {
      glyphs.push({ strokes: [st], lo: b.lox, hi: b.hix, h })
    }
  }
  glyphs.sort((a, b) => (a.lo + a.hi) - (b.lo + b.hi))
  const tallest = Math.max(...glyphs.map(g => Math.max(g.h, g.hi - g.lo)))
  let out = ''
  for (const g of glyphs) {
    const size = Math.max(g.h, g.hi - g.lo)
    if (size < tallest * 0.18) { out += '.'; continue }   // 소수점 — 크기로 가른다
    const r = recognizeGlyph(g.strokes)
    out += r ? r.ch : '?'
  }
  return out
}
