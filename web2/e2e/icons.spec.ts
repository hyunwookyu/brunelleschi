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
  // 사라진 넷(대응표 §3) — own3d 문구는 진단 채널에만 산다(수집에서 제외된 자리).
  // 실패 시 «어느 문자열이 어디에»가 보이게 목록으로 낸다(#72 규칙 ②).
  const BANNED = ['획이 위치를 소유한다', '대기 획은 그린 시점에서만', '무한소수', 'brush', 'classic']
  const found = BANNED.filter(b2 => text.includes(b2))
    .map(b2 => `${b2} @ …${text.slice(Math.max(0, text.indexOf(b2) - 20), text.indexOf(b2) + 30)}…`)
  expect(found, '금지어가 화면 언어에 없다').toEqual([])
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
  // 경계의 반대편(2차 리뷰 [11]) — 제외 구역(#diagctl) **안**에 심으면 안 걸린다:
  // 「진단 채널은 그대로」(대응표 §3)의 경계가 실제로 그 자리에 있다.
  await page.evaluate(() => {
    const s = document.createElement('span')
    s.id = 'sweep-canary2'
    s.textContent = '무한소수 표기'
    document.getElementById('diagctl')!.append(s)
  })
  expect((await collectText(page)).includes('무한소수'), '진단 채널 안은 훑기 밖이다').toBe(false)
  await page.evaluate(() => document.getElementById('sweep-canary2')!.remove())
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
      // #btn-roll-yellow — **선 아이콘의 유일한 색 예외**(instrument-icons.md 정본:
      // 옐로 트레이스는 이름 자체가 색이라 고리를 #e9d98a로 채운다 — web2-21 3-a가
      // 손 띠에 상주시키며 이 팔의 검사 대상에 처음 들어왔다). 트레이싱지 롤은 무채색
      // 그대로 검사받는다 — 예외는 하나뿐이다.
      // ⚠ **`#pentray`가 들어왔다**(web2-30 2번) — 펜 촉통의 줄은 연필통 줄과 **같은 범주**다:
      //    누운 제도 펜의 그림(몸통·촉·그 굵기의 실제 선 견본)이라 «직접 그리는 도구»의
      //    재료색이 정체다. 예외를 넓힌 것이 아니라 **같은 무리에 새 자리가 하나 는 것**이다.
      if (svg.closest('#btn-pencil, #btn-pen, #tray, #pentray, #oldtools, #btn-eraser-pencil, #btn-eraser-ink, #btn-face, #thick, #boot, #btn-roll-yellow')) continue
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
  // 속성 판정의 구멍(currentColor 상속) 마감 — **계산색**도 회색조다. 지시 문면은
  // «컬러 픽셀 0»인데 픽셀 판은 AA·배경과 섞여 분해능이 낮다(#71 ㉢의 축) — 속성+계산색이
  // 구성적으로 더 강하다: 채널을 바꾼 근거를 여기 적는다.
  const badColor = await page.evaluate(() => {
    const out: string[] = []
    for (const svg of document.querySelectorAll('svg')) {
      // #btn-roll-yellow — **선 아이콘의 유일한 색 예외**(instrument-icons.md 정본:
      // 옐로 트레이스는 이름 자체가 색이라 고리를 #e9d98a로 채운다 — web2-21 3-a가
      // 손 띠에 상주시키며 이 팔의 검사 대상에 처음 들어왔다). 트레이싱지 롤은 무채색
      // 그대로 검사받는다 — 예외는 하나뿐이다.
      // ⚠ **`#pentray`가 들어왔다**(web2-30 2번) — 펜 촉통의 줄은 연필통 줄과 **같은 범주**다:
      //    누운 제도 펜의 그림(몸통·촉·그 굵기의 실제 선 견본)이라 «직접 그리는 도구»의
      //    재료색이 정체다. 예외를 넓힌 것이 아니라 **같은 무리에 새 자리가 하나 는 것**이다.
      if (svg.closest('#btn-pencil, #btn-pen, #tray, #pentray, #oldtools, #btn-eraser-pencil, #btn-eraser-ink, #btn-face, #thick, #boot, #btn-roll-yellow')) continue
      const m = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(svg).color)
      if (m && Math.max(+m[1]!, +m[2]!, +m[3]!) - Math.min(+m[1]!, +m[2]!, +m[3]!) > 40) out.push(`${(svg.parentElement as HTMLElement).id}:color=${getComputedStyle(svg).color}`)
    }
    return out
  })
  expect(badColor, 'currentColor가 받는 계산색도 무채색이다').toEqual([])
  // 반증(D-3) — 색을 실제로 물리면 걸린다(실패 가능한 격자)
  const caught = await page.evaluate(() => {
    const el = document.getElementById('btn-snap')!
    el.style.color = '#1a6ac2'
    const svg = el.querySelector('svg')!
    const m = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(svg).color)!
    const bad = Math.max(+m[1]!, +m[2]!, +m[3]!) - Math.min(+m[1]!, +m[2]!, +m[3]!) > 40
    el.style.color = ''
    return bad
  })
  expect(caught, '물린 색이 계산색 검사에 걸린다').toBe(true)
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
  // 원장은 LEDGER=1 단독 실행에서만 쓴다(web2-22 규율·#71 ㉠의 문 — web2-24 3부 전면화).
  // 팔은 그대로 돈다 — 원장만 안 덮는다. 정본 명령: LEDGER=1 npx playwright test icons --workers=1
  if (process.env.LEDGER === '1') writeFileSync(resolve(HERE, `../../stage0/out/icon_weight_web2${suffix}.json`), JSON.stringify({
    conditions: {
      workers: testInfo.config.workers, project: testInfo.project.name,
      canonical: 'LEDGER=1 npx playwright test icons --workers=1',
      time_validity: '값이 전부 결정론(래스터 잉크량·path 기하)이라 워커 수가 값을 못 바꾼다 — 조건은 기록용(#71 ㉠ 규약의 일관)',
    },
    what: `web2-19 4-b(${testInfo.project.name}) — 아이콘 굵기 대조: Phosphor arrows-out의 thin/light/regular를 지금 앱 아이콘(작도 시점 · 가는 선 1.3/20)과 두 척도로 잰 것. 사람이 화면을 못 보고 정했으므로(지시 문면) 이 표가 근거다. e2e icons.spec가 매 실행 다시 쓴다(#47).`,
    def: 'ink_px = **64×64 래스터의 알파 합 ÷ 255**(픽셀 등가 잉크량 — 이름의 px는 그 등가 단위다. ⚠ 첫 판의 32×32 문턱 계수는 분해능이 없어 철회 — chosen_why). 광학 무게 척도라 글리프 복잡도와 뒤섞인다. stroke_frac = 선 굵기 ÷ viewBox(낱개 선의 무게 — ×30px 렌더 환산은 ref 1.95px·light 1.41·regular 1.875). 합성 래스터의 path 기하를 재므로 **dpr 무관**(dpr1·dpr2 원장이 같은 값인 것은 설계다 — dpr2 판은 같은 측정의 재실행 확인일 뿐이다).',
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

// ── web2-34 5번 — 설정 톱니(선 문법) ──────────────────────────────────────────
// ⚠ 위 ②는 **「채웠는지」를 못 가른다**: `fill="none"`도 `fill="currentColor"`도 무채색이라
//    둘 다 통과한다(회색조 판정이다). 그래서 이 팔이 따로 선다 — 묻는 것은 채도가 아니라
//    **문법**이다(docs/instrument-icons.md 「규칙」: fill:none · stroke:currentColor ·
//    stroke-width 1.6/32 · round cap/join).
// 반증 조건(D-3)은 **옛 아이콘 그 자체**다: 아래 OLD_GEAR 는 이 회차 직전 커밋의
// `#pane-settings > summary` 안에 있던 Phosphor light gear(`fill="currentColor"` · 뷰박스 256)
// **그대로**이고, 같은 검사 함수에 넣어 **실제로 위반이 나오는 것**을 값으로 확인한다.
// 그 확인이 없으면 이 검사는 아무것도 안 잰다.
const OLD_GEAR = '<svg width="26" height="26" viewBox="0 0 256 256" fill="currentColor"><path d="M128,82a46,46,0,1,0,46,46A46.06,46.06,0,0,0,128,82Zm0,80a34,34,0,1,1,34-34A34,34,0,0,1,128,162Zm82-31.62c0-.79.05-1.58.05-2.38s0-1.59-.05-2.38l14.16-17.71a6,6,0,0,0,1.11-5.29A102.68,102.68,0,0,0,214.68,85a6,6,0,0,0-4.24-3.33l-22.35-3.72q-1.57-1.87-3.27-3.63L181.1,52a6,6,0,0,0-3.33-4.24,102.68,102.68,0,0,0-17.61-10.55,6,6,0,0,0-5.29,1.11L137.16,52.48c-.79,0-1.58-.05-2.38-.05h-13.56c-.8,0-1.59,0-2.38.05L101.13,38.32A6,6,0,0,0,95.84,37.2,102.68,102.68,0,0,0,78.23,47.75,6,6,0,0,0,74.9,52L71.18,74.35q-1.87,1.57-3.63,3.27L45.2,81.34A6,6,0,0,0,41,84.67a102.68,102.68,0,0,0-10.55,17.61,6,6,0,0,0,1.11,5.29L45.68,125.3c0,.79-.05,1.58-.05,2.38s0,1.59.05,2.38L31.52,147.77a6,6,0,0,0-1.11,5.29A102.68,102.68,0,0,0,41,170.67a6,6,0,0,0,4.24,3.33l22.35,3.72q1.57,1.87,3.27,3.63l3.72,22.35A6,6,0,0,0,77.9,208a102.68,102.68,0,0,0,17.61,10.55,6,6,0,0,0,5.29-1.11l17.71-14.16c.79,0,1.58.05,2.38.05h13.56c.8,0,1.59,0,2.38-.05l17.71,14.16a6,6,0,0,0,5.29,1.11A102.68,102.68,0,0,0,177.44,208a6,6,0,0,0,3.33-4.24l3.72-22.35q1.87-1.57,3.63-3.27l22.35-3.72a6,6,0,0,0,4.24-3.33,102.68,102.68,0,0,0,10.55-17.61,6,6,0,0,0-1.11-5.29Z"/></svg>'

/** 선 문법 검사 — 셀렉터가 가리키는 svg 안의 «그리는 요소» 전부를 계산값으로 잰다.
 *  계산값을 쓰는 이유: 속성은 루트 svg에 한 번 적히고 자식이 **상속**받으므로
 *  자식에서 getAttribute 는 null 이 된다(SVG 표현 속성은 상속되는 CSS 속성이다). */
const LINT = (page: Page, sel: string): Promise<string[]> =>
  page.evaluate((s: string) => (window as any).__lintLine(s), sel)
function installLint(page: Page) {
  return page.evaluate(() => {
    (window as any).__lintLine = (sel: string): string[] => {
      const svg = document.querySelector(sel) as SVGSVGElement | null
      if (!svg) return [`${sel}: svg가 없다`]
      const out: string[] = []
      if (svg.getAttribute('viewBox') !== '0 0 32 32') out.push(`viewBox=${svg.getAttribute('viewBox')}`)
      const shapes = [...svg.querySelectorAll('path,circle,rect,ellipse,line,polygon,polyline')]
      if (shapes.length === 0) out.push('그리는 요소가 없다')
      for (const el of shapes) {
        const cs = getComputedStyle(el as Element)
        const tag = el.tagName
        // ① 채우지 않는다 — 이 줄 하나가 「채운 아이콘」을 떨어뜨린다
        if (cs.fill !== 'none') out.push(`${tag}:fill=${cs.fill}`)
        // ② stroke 는 currentColor — 계산값이 그 요소의 color 와 같다
        if (cs.stroke === 'none' || cs.stroke !== cs.color) out.push(`${tag}:stroke=${cs.stroke} color=${cs.color}`)
        // ③ round cap/join
        if (cs.strokeLinecap !== 'round') out.push(`${tag}:cap=${cs.strokeLinecap}`)
        if (cs.strokeLinejoin !== 'round') out.push(`${tag}:join=${cs.strokeLinejoin}`)
        // ④ 굵기 1.6 (뷰박스 32 기준 — 사용자 단위로 잰다)
        if (cs.strokeWidth !== '1.6px') out.push(`${tag}:width=${cs.strokeWidth}`)
      }
      return out
    }
  })
}

test('34-5 설정 톱니 — 선 문법이고 채우지 않았다 · 바깥 톱니 + 중앙 원 (+옛 채운 아이콘으로 반증)', async ({ page }) => {
  await boot(page)
  await installLint(page)
  const SEL = '#pane-settings > summary svg'

  // (1) 지금 아이콘이 선 문법을 지킨다
  const bad = await LINT(page, SEL)
  expect(bad, '설정 톱니가 선 문법을 지킨다(fill:none · currentColor · round · 1.6)').toEqual([])

  // (1') 크기 급 무회귀 — `.ico-f`(19px × --ui-scale)다. 뷰박스가 256 → 32 로 바뀌면서
  //      width/height 속성을 뺐으므로(높이는 CSS가 준다) **실제 높이를 값으로 잰다**:
  //      파일 서랍과 같은 급이고 e2e/sidebar.spec 이 그 급에 25px 하한을 건다.
  const h = await page.evaluate((sel: string) => document.querySelector(sel)!.getBoundingClientRect().height, SEL)
  console.log(`[측정] 설정 톱니 높이 ${h.toFixed(1)}px (.ico-f 급 — 파일 서랍과 같다)`)
  expect(h, '크기 급이 안 줄었다(.ico-f)').toBeGreaterThanOrEqual(25)

  // (2) 실루엣이 «바깥 톱니 + 중앙 원» 둘이다 — 요소로 확인한다
  const shape = await page.evaluate((sel: string) => {
    const svg = document.querySelector(sel) as SVGSVGElement
    const paths = [...svg.querySelectorAll('path')]
    const circles = [...svg.querySelectorAll('circle')]
    const gear = paths[0]!, hub = circles[0]!
    const gb = (gear as unknown as SVGGraphicsElement).getBBox()
    const hb = (hub as unknown as SVGGraphicsElement).getBBox()
    const d = gear.getAttribute('d') || ''
    return {
      paths: paths.length, circles: circles.length,
      closed: /z\s*$/i.test(d.trim()),
      teeth: (d.match(/A/g) || []).length,          // 뿌리 호 하나 = 톱니 하나
      gear: { x: +gb.x.toFixed(2), y: +gb.y.toFixed(2), w: +gb.width.toFixed(2), h: +gb.height.toFixed(2) },
      hub: { x: +hb.x.toFixed(2), y: +hb.y.toFixed(2), w: +hb.width.toFixed(2), h: +hb.height.toFixed(2) },
    }
  }, SEL)
  expect(shape.paths, '톱니 실루엣 하나').toBe(1)
  expect(shape.circles, '중앙 원 하나').toBe(1)
  expect(shape.closed, '닫힌 실루엣이다').toBe(true)
  expect(shape.teeth, '톱니 여덟').toBe(8)
  // 중앙 원이 **안쪽에 있고 가운데**다 — 이름값을 기하로 확인한다(bbox 중심 일치 · 더 작다)
  const c = (b: { x: number; y: number; w: number; h: number }): [number, number] => [b.x + b.w / 2, b.y + b.h / 2]
  const [gx, gy] = c(shape.gear), [hx, hy] = c(shape.hub)
  expect(Math.abs(gx - hx), '중앙 원의 x 중심이 톱니와 같다').toBeLessThan(0.2)
  expect(Math.abs(gy - hy), '중앙 원의 y 중심이 톱니와 같다').toBeLessThan(0.2)
  expect(shape.hub.w).toBeLessThan(shape.gear.w * 0.5)
  console.log(`[측정] 톱니 bbox ${JSON.stringify(shape.gear)} · 중앙 원 ${JSON.stringify(shape.hub)} · 톱니 ${shape.teeth}`)

  // (3) ⚠⚠ 반증(D-3) — **옛 채운 아이콘**을 같은 자리에 넣으면 같은 검사가 떨어진다.
  //     떨어뜨리는 항목까지 값으로 낸다(무엇을 재는 검사인지가 그 목록이다).
  const before = await page.evaluate(sel => document.querySelector(sel)!.parentElement!.innerHTML, SEL)
  await page.evaluate(([sel, old]) => {
    document.querySelector(sel as string)!.parentElement!.innerHTML = old as string
  }, [SEL, OLD_GEAR])
  const oldBad = await LINT(page, SEL)
  console.log(`[반증] 옛 채운 아이콘의 위반 ${oldBad.length}건 — ${JSON.stringify(oldBad)}`)
  expect(oldBad.length, '옛 채운 아이콘은 이 검사에 걸린다').toBeGreaterThan(0)
  expect(oldBad.join(' '), '떨어지는 이유에 «채웠다»가 있다').toContain('fill=')
  expect(oldBad.join(' '), '뷰박스도 걸린다(256 → 32)').toContain('viewBox=')
  // 원상복구 — 뒤 팔이 옛 아이콘을 보지 않는다
  await page.evaluate(([sel, html]) => {
    document.querySelector(sel as string)!.parentElement!.innerHTML = html as string
  }, [SEL, before])
  expect(await LINT(page, SEL), '복구 뒤 다시 선 문법이다').toEqual([])
})
