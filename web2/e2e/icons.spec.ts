// web2-19 4부 — 이름 넷·아이콘의 회귀 팔(4-c ①②④⑥).
//   ① 대응표 §3의 넷이 화면에서 사라졌다(훑어 0) — ⚠⚠ 「오스냅」·「축 스냅」은 훑기
//      목록에 없다: **남아 있어야 한다**(대응표 개정 — 정확한 말은 그대로).
//      ⚠ #69 ㉣ — 일부러 하나 심어 훑기가 실제로 걸리는 것을 먼저 본다(실패 가능한 격자).
//   ② 선 아이콘이 전부 무채색 — 직접 그리는 도구(연필·펜·지우개·면·굵기 미리보기)는
//      검사에서 뺀다(재료색을 갖는 것이 정상이다).
//      «컬러 픽셀 0»의 판정은 속성으로 잰다: fill/stroke가 none·currentColor·회색조뿐이면
//      래스터에도 채도가 실릴 수 없다(구성적 — 픽셀 판보다 강하다).
//   ④ 굵기 대조 — thin/light/regular의 잉크량을 지금 앱 아이콘(가는 선 1.3)과 나란히
//      래스터로 재고, **배포한 light가 실제로 가장 가까운지** 판정한다. 원장에 남긴다.
//   ⑥ 이름이 바뀐 것이 같은 동작을 한다(문자열만 바뀌었다).

import { test, expect, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 화면 언어 수집 — 요소의 직접 텍스트 + title. 진단 채널(#diagpanel·#diagctl·#buildid)과
 *  스크립트·스타일은 밖이다(대응표 §3: 진단은 그대로 둔다). 숨은 팝업(자·표시)은 **든다** —
 *  열면 보이는 화면 언어다. */
const collectText = (page: Page) => page.evaluate(() => {
  const out: string[] = []
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue
    if (el.closest('#diagpanel, #diagctl, #buildid')) continue
    const title = el.getAttribute('title')
    if (title) out.push(title)
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) out.push(n.textContent!.trim())
    }
  }
  return out.join('\n')
})

test('① 이름 훑기 — 넷이 0이고, 오스냅·축 스냅은 남아 있다 (+심어서 반증)', async ({ page }) => {
  await boot(page)
  const text = await collectText(page)
  // 사라진 넷(대응표 §3) — own3d 문구는 진단 채널에만 산다(수집에서 제외된 자리)
  for (const banned of ['획이 위치를 소유한다', '대기 획은 그린 시점에서만', '무한소수', 'brush', 'classic']) {
    expect(text.includes(banned), `「${banned}」가 화면 언어에 없다`).toBe(false)
  }
  // 새 이름이 실제로 그 자리에 있다
  expect(text).toContain('다른 각도에서는 숨긴다')
  expect(text).toContain('소수점 그대로')
  expect(text).toContain('종이 질감')
  // ⚠⚠ 그대로 두는 말 — 훑기에서 지우면 안 되는 것(정확한 말을 지우는 쪽이 손해다)
  expect(text).toContain('오스냅')
  expect(text).toContain('축 스냅')
  // 반증(#69 ㉣) — 금지어 하나를 화면에 심으면 같은 수집이 걸린다(실패 가능한 격자)
  await page.evaluate(() => {
    const s = document.createElement('span')
    s.id = 'sweep-canary'
    s.textContent = '무한소수 표기'
    document.getElementById('snap-pop')!.append(s)
  })
  expect((await collectText(page)).includes('무한소수'), '심은 금지어가 걸린다').toBe(true)
  await page.evaluate(() => document.getElementById('sweep-canary')!.remove())
})

test('② 선 아이콘 무채색 — 직접 그리는 도구 밖의 svg에 채도가 없다', async ({ page }) => {
  await boot(page)
  const bad = await page.evaluate(() => {
    const isGray = (v: string): boolean => {
      if (!v || v === 'none' || v === 'currentColor') return true
      const m = /^#([0-9a-f]{6})$/i.exec(v.trim())
      if (!m) return /^#([0-9a-f])\1\1$/i.test(v.trim())   // #aaa 형
      const r = parseInt(m[1]!.slice(0, 2), 16), g = parseInt(m[1]!.slice(2, 4), 16), b = parseInt(m[1]!.slice(4, 6), 16)
      return r === g && g === b
    }
    const out: string[] = []
    for (const svg of document.querySelectorAll('svg')) {
      // 직접 그리는 도구·재료 표현은 밖(대응표 ㉠ — 재료색이 정체다)
      if (svg.closest('#btn-pencil, #btn-pen, #tray, #oldtools, #btn-eraser-pencil, #btn-eraser-ink, #btn-face, #thick, #boot')) continue
      for (const el of [svg, ...svg.querySelectorAll('*')]) {
        for (const attr of ['fill', 'stroke']) {
          const v = el.getAttribute(attr)
          if (v && !isGray(v)) out.push(`${(svg.parentElement as HTMLElement).id || svg.parentElement!.tagName}:${attr}=${v}`)
        }
      }
    }
    return out
  })
  expect(bad, '채도를 가진 선 아이콘이 없다').toEqual([])
})

test('④ 굵기 대조 — thin/light/regular 잉크량 vs 지금 앱 아이콘 → light가 가장 가깝다 (원장)', async ({ page }, testInfo) => {
  await boot(page)
  const weights = ['thin', 'light', 'regular'] as const
  const pathOf = (w: string) => {
    const file = w === 'regular' ? 'regular/arrows-out.svg' : `${w}/arrows-out-${w}.svg`
    const svg = readFileSync(resolve(HERE, `../node_modules/@phosphor-icons/core/assets/${file}`), 'utf-8')
    return /<path d="([^"]+)"/.exec(svg)![1]!
  }
  const inks = await page.evaluate(async (specs: { name: string; svg: string }[]) => {
    const out: Record<string, number> = {}
    for (const s of specs) {
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.svg)
      await img.decode()
      // ⚠ 32px·문턱 계수는 굵기 축에서 분해능이 없었다(#71 ㉢ — thin/light/regular가
      // 전부 188로 같았다: AA 문턱이 굵기 차를 지웠다). **알파 합·64px**로 잰다 —
      // 세 굵기가 실제로 갈리는 것을 아래 판정선(strict ordering)이 지킨다.
      const c = document.createElement('canvas')
      c.width = 64; c.height = 64
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0, 64, 64)
      const d = g.getImageData(0, 0, 64, 64).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) n += d[i]!
      out[s.name] = Math.round(n / 255)
    }
    return out
  }, [
    // 지금 앱 아이콘의 대표 — 작도 시점(집) 아이콘: 20뷰박스 · 가는 선 1.3(현행 그대로)
    { name: 'ref', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="#000" stroke-width="1.3"><path d="M3 9.4 10 3.6l7 5.8"/><path d="M5.2 8.6V16h9.6V8.6"/></svg>' },
    ...weights.map(w => ({ name: w, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="#000"><path d="${pathOf(w)}"/></svg>` })),
  ])
  const total = 64 * 64
  const frac = (k: string) => inks[k]! / total
  // 분해능 확인(#71 ㉢) — 세 굵기의 잉크가 실제로 갈린다(안 갈리면 이 척도는 아무것도 안 잰다)
  expect(inks['thin']!).toBeLessThan(inks['light']!)
  expect(inks['light']!).toBeLessThan(inks['regular']!)
  // 두 척도를 다 잰다. 실측(알파 합·64px — 분해능 있는 격자): **잉크량 최근접 = light**
  // (지시가 명명한 척도가 light를 직접 지지한다). 선 굵기(낱개 선의 무게)로는 regular가
  // 근소하게 가깝지만(1.875 vs ref 1.95px) 잉크량에서는 ref보다 25% 무겁다 — 사람의
  // 예상(「regular는 새 것만 굵어 보인다」)과 같은 방향이다. light로 확정.
  const inkDist = (k: string) => Math.abs(frac(k) - frac('ref'))
  const STROKE: Record<string, number> = { thin: 8 / 256, light: 12 / 256, regular: 16 / 256 }
  const refStroke = 1.3 / 20
  const strokeDist = (k: string) => Math.abs(STROKE[k]! - refStroke)
  const inkRank = [...weights].sort((a, b) => inkDist(a) - inkDist(b))
  const strokeRank = [...weights].sort((a, b) => strokeDist(a) - strokeDist(b))
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(resolve(HERE, `../../stage0/out/icon_weight_web2${suffix}.json`), JSON.stringify({
    what: `web2-19 4-b(${testInfo.project.name}) — 아이콘 굵기 대조: Phosphor arrows-out의 thin/light/regular를 지금 앱 아이콘(작도 시점 · 가는 선 1.3/20)과 두 척도로 잰 것. 사람이 화면을 못 보고 정했으므로(지시 문면) 이 표가 근거다. e2e icons.spec가 매 실행 다시 쓴다(#47).`,
    def: 'ink_px = 32×32 래스터에서 알파>32인 칸 수(광학 무게 — 글리프 복잡도와 뒤섞이는 척도). stroke_frac = 선 굵기 ÷ viewBox(낱개 선의 무게). 두 척도가 반대편을 가리켜 chosen은 그 «사이»의 light다 — 근거는 what·주석.',
    ink_px: inks, ink_frac: Object.fromEntries(['ref', ...weights].map(k => [k, +frac(k).toFixed(4)])),
    stroke_frac: { ref: +refStroke.toFixed(4), ...Object.fromEntries(weights.map(w => [w, +STROKE[w]!.toFixed(4)])) },
    ink_rank: inkRank, stroke_rank: strokeRank, chosen: 'light',
    chosen_why: '잉크량(지시가 명명한 척도) 최근접이 light다. 선 굵기로는 regular가 근소하게 가깝지만 잉크량에서 ref보다 25% 무겁다(사람의 예상 「regular는 새 것만 굵어 보인다」와 같은 방향). ⚠ 첫 판(32px·문턱 계수)은 세 굵기가 전부 188로 같아 아무것도 안 쟀다 — #71 ㉢의 형태라 알파 합·64px로 바꿨다',
  }, null, 1))
  console.log(`[측정] 굵기 — ink ${JSON.stringify(inks)} · 잉크량 최근접 ${inkRank[0]} · 선 굵기 최근접 ${strokeRank[0]}`)
  // 판정선: **잉크량 최근접이 light다**(지시가 명명한 척도) — 뒤집히면 굵기를 다시 고른다.
  expect(inkRank[0], '잉크량 최근접 = 배포한 light').toBe('light')
  expect(strokeRank[2], '선 굵기 척도의 최악도 light가 아니다').not.toBe('light')
})

test('⑥ 이름이 바뀐 것이 같은 동작을 한다 — 문자열만 바뀌었다', async ({ page }) => {
  await boot(page)
  // 소수점 그대로(옛 무한소수 표기) — id 불변·같은 상태를 민다
  await page.click('#dim-toggle'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.dimExact)).toBe(false)
  await page.click('#chk-exact')
  expect(await page.evaluate(() => (window as any).__b2.app.dimExact)).toBe(true)
  await page.click('#chk-exact')
  expect(await page.evaluate(() => (window as any).__b2.app.dimExact)).toBe(false)
  await page.click('#dim-toggle')
  // 다른 각도에서는 숨긴다(옛 대기 획은 그린 시점에서만) — zones ③이 왕복을 잰다. 여기서는
  // 라벨이 새 이름이고 같은 체크박스인 것만 값으로 확인한다.
  expect(await page.evaluate(() =>
    document.querySelector('#display-pop label:has(#chk-waitfade)')!.textContent!.trim()))
    .toContain('다른 각도에서는 숨긴다')
  // 종이 질감 — 배선 불변(renderer 왕복은 waitfade.spec 3-c 팔이 잰다). title에 내부 이름이 없다.
  expect(await page.evaluate(() => document.getElementById('btn-brush')!.title)).not.toContain('brush')
})
