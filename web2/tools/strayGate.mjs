// 3-b 임계 실측 — 「잘못 찍힌 점」 문(C.STRAY_MIN_PX)의 후보를 실획 대역에 대본다.
//
// 데이터: data/quickdraw/*.ndjson — **원시(raw) Quick,Draw**라 좌표가 실제 장치 픽셀이다
// (간이(simplified) 0~255 정규화가 아니다 — 첫 줄의 x 대역이 수백~천이 그 증거).
// 실제 손이 그린 «의도한 획»의 끝점 간 길이 분포를 재서, 후보 문이 그 대역을 얼마나
// 잘라먹는지(=억울한 폐기율)를 낸다.
//
// ⚠ 한계(원장에도 적는다): 장치 dpr·화면 크기는 기록에 없다 — 이 좌표를 우리 화면
// css px와 1:1로 읽는 것은 **보수적 하한**이다(실 화면이 크면 실길이는 더 길다 →
// 폐기율은 여기 값보다 작아진다). 판정은 실기기 몫(DEFERRED).
//
//   node tools/strayGate.mjs   (web2에서)  →  stage0/out/stray_gate_web2.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const CATS = ['line', 'square', 'house', 'door', 'triangle', 'castle', 'skyscraper']
const CANDIDATES = [3, 4, 5, 6, 8, 10]   // css px 후보 — TAP_MAX_PX(2) 위여야 한다

const perCat = {}
const all = []
for (const cat of CATS) {
  const lens = []
  const lines = readFileSync(resolve(root, 'data/quickdraw', `${cat}.ndjson`), 'utf8').split('\n')
  for (const ln of lines) {
    if (!ln.trim()) continue
    let d
    try { d = JSON.parse(ln) } catch { continue }
    for (const st of d.drawing) {
      const xs = st[0], ys = st[1]
      if (xs.length < 2) { lens.push(0); continue }
      // **bbox 대각** — 게이트가 재는 양. ⚠ 끝점 간 거리로 재면 닫힌 한 붓(사각형 등—
      // 끝이 시작으로 돌아온다)이 «짧은 획»으로 오폐기된다 — 첫 실측이 그것을 보였다
      // (square p50이 33px — 변 길이가 아니라 «되돌아온 끝» 거리였다). 탭이 살짝 끌린
      // 것은 bbox도 작고, 의도한 획은 아무리 되돌아와도 bbox가 크다.
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (let i = 0; i < xs.length; i++) {
        if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]
        if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]
      }
      lens.push(Math.hypot(x1 - x0, y1 - y0))
    }
  }
  lens.sort((a, b) => a - b)
  const q = (p) => lens[Math.min(lens.length - 1, Math.floor(p * lens.length))]
  perCat[cat] = {
    n_strokes: lens.length,
    // 점 찍힘 성분 — bbox가 사실상 0(< 0.5px)인 «획». below[c]의 대부분이 이것이고,
    // «후보가 자르는 짧은 획»은 below[c] − below_zero가 상한이다([27] — 분자를 가른다).
    below_zero: lens.filter(L => L < 0.5).length,
    p001: q(0.001), p01: q(0.01), p05: q(0.05), p50: q(0.5),
    below: Object.fromEntries(CANDIDATES.map(c => [c, lens.filter(L => L < c).length])),
  }
  all.push(...lens)
}
all.sort((a, b) => a - b)
const q = (p) => all[Math.min(all.length - 1, Math.floor(p * all.length))]
const ledger = {
  what: '실획(원시 Quick,Draw)의 **raw bbox 대각** 분포 대 STRAY 문 후보 — below[c]는 «bbox < c px인 획 수»이고 거기에는 점 찍힘(below_zero)과 짧은 획이 섞여 있다(성분은 두 필드로 가른다 — 3차 리뷰어 [27])',
  superseded_scale: '끝점 간 거리 판은 기각 — 닫힌 한 붓(끝이 시작으로 돌아온다)이 «짧은 획»으로 오폐기된다(square p50이 33px로 나온 첫 실행이 그 증거. 재현: bbox 블록을 끝점 거리로 되돌린다)',
  caveat: '좌표의 단위(장치 px인가 css px인가)와 dpr·화면 크기가 기록에 없다 — 1:1 읽기의 방향을 모른다(장치 px·dpr>1이었다면 실기기 폐기율은 이 값보다 크다 — 3차 리뷰어 [32]). 범주 중 폐기율이 가장 높은 행은 skyscraper다(보수 행 — line이 아니다). 실기기 판정이 최종(DEFERRED web2-13 표)',
  candidates_css_px: CANDIDATES,
  per_category: perCat,
  totals: {
    n_strokes: all.length,
    below_zero: all.filter(L => L < 0.5).length,
    p001: q(0.001), p01: q(0.01), p05: q(0.05), p50: q(0.5),
    below: Object.fromEntries(CANDIDATES.map(c => [c, all.filter(L => L < c).length])),
  },
  rerun: 'node tools/strayGate.mjs (web2에서)',
}
mkdirSync(resolve(root, 'stage0/out'), { recursive: true })
writeFileSync(resolve(root, 'stage0/out/stray_gate_web2.json'), JSON.stringify(ledger, null, 2))
console.log('n', all.length, 'p001', ledger.totals.p001, 'p01', ledger.totals.p01, 'below', ledger.totals.below)
