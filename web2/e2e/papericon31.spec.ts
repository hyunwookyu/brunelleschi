// web2-31 4번 — **종이 아이콘에서 카메라를 뗀다**.
//
// 지시 문면: 「종이 아이콘에 갱신 화살표(원형 화살표)를 붙이고 카메라 도형을 뺀다. …
// **게이트.** 화면에 카메라 도형이 남아 있지 않다. 기능(시점 저장·복귀)은 무회귀.」
//
// ⚠⚠ **「화면에」가 자를 정한다**(#71 · 지시의 급소 2) — 「그 파일에 없다」로 재지 않는다.
// 여기서 훑는 것은 **DOM에 실제로 사는 svg 전부**이고, 소스 쪽 훑기(파일 전수)는
// `test/icons.test.ts`가 따로 든다. 두 자가 갈려 있다.
//
//   ① 카메라 도형 없음 — **세 채널**로 잰다:
//      (가) **출처** — Phosphor camera 계열 넷 × 여섯 굵기의 path가 DOM svg에 없다
//      (나) **형태** — 그 계열을 래스터로 구운 견본과의 **IoU**가 문 아래다(색·크기·굵기를
//           바꿔 옮겨 심어도 걸린다 — 문자열보다 넓은 자)
//      (다) **말** — 화면 언어에 사진 계열 낱말이 없다
//
// ⚠⚠ **(나)는 문이 둘이다 — 견본을 두 벌로 나눠 각각 잰다**(1차 리뷰어 [1][2]).
//   (나1) **윤곽 견본**(thin·light·regular·bold) — 문 `CAMERA_IOU`. 화면 최대가 낮아
//         (실측 0.5787) 분해능이 크다.
//   (나2) **견본 전부**(채운 판 fill·duotone 포함) — 문 `CAMERA_IOU_ALL`. 채운 카메라는
//         «가로로 긴 덩어리»라 이 앱의 **실물 도구 그림**과 가까워(연필통 줄 0.693 ·
//         지우개 0.6234 · 면 0.6316) 문을 위로 둘 수밖에 없다.
// 초판은 (나1) 하나였고 **채운 카메라를 문자열만 바꿔 심은 칸**을 못 잡았다 — 그 칸을
// 반증 ㉠3이 실제로 돈다. **훑는 «대상»은 (가)(나) 모두 한 개도 안 뺐다**(화면의 svg 전부).
// (다) 말 채널만 **진단 채널**(#diagpanel·#diagctl·#buildid)을 뺀다 — icons.spec ①의
// 선례 그대로이고(대응표 §3: 진단은 그대로 둔다) 그 제외를 원장 `swept.excluded`에 적는다.
//   ② 시점 저장·복귀 무회귀 — **좌표로**(이름만 바꾸고 배선이 끊기는 것이 이 형태의 전형)
//   ③ 반증(D-3) — ㉠ 옛 카메라를 되돌린 판에서 ①이 빨개진다 ㉡ 배선을 끊은 판에서 ②가
//      빨개진다. **둘 다 실제로 실패시킨다.**
//
// 선 문법(fill:none · currentColor · 1.6/32 · round)은 **`e2e/icons.spec.ts`가 재는 자리**다
// (34-5가 세운 `__lintLine` 하나 — 여기서 새로 안 짓는다 · #54).

import { test, expect, type Page } from '@playwright/test'
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { CAMERA_IOU, CAMERA_IOU_ALL } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../stage0/out')

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** 옛 아이콘 **그대로** — 이 회차 직전 커밋의 `paperbar.ts` `CAMERA_PATH`(Phosphor light
 *  camera · `fill="currentColor"` · 뷰박스 256). 반증 ㉠이 이것을 같은 자리에 되돌린다. */
const OLD_CAMERA = readFileSync(
  resolve(HERE, '../node_modules/@phosphor-icons/core/assets/light/camera-light.svg'), 'utf-8')
  .replace(/[\s\S]*?<path d="/, '').replace(/"[\s\S]*/, '')
const OLD_CAMERA_SVG =
  `<svg viewBox="0 0 256 256" fill="currentColor" width="16" height="16" style="vertical-align:-3px"><path d="${OLD_CAMERA}"/></svg>`

/** 카메라 «계열» 견본 — 넷(camera · plus · rotate · slash) × 여섯 굵기. 문자열 훑기의
 *  건초더미이자 래스터 견본의 원본이다(하나만 쓰면 굵기를 바꾼 이식을 못 잡는다).
 *  `solid`는 채운 판(fill·duotone) 표식이다 — (나)의 문은 **윤곽 판만** 견본으로 쓴다. */
type Ref = { name: string; svg: string; solid: boolean; paths: string[] }
function cameraCorpus(): Ref[] {
  const out: Ref[] = []
  const root = resolve(HERE, '../node_modules/@phosphor-icons/core/assets')
  for (const w of readdirSync(root)) {
    for (const n of ['camera', 'camera-plus', 'camera-rotate', 'camera-slash']) {
      const file = resolve(root, w, `${n}${w === 'regular' ? '' : `-${w}`}.svg`)
      const svg = readFileSync(file, 'utf-8')
      out.push({
        name: `${w}/${n}`, svg, solid: w === 'fill' || w === 'duotone',
        paths: [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(m => m[1]!),
      })
    }
  }
  return out
}

/** 페이지 안에 **잉크 격자** 계기를 심는다 — svg 하나를 구워 잉크 상자로 정규화한 뒤
 *  N×N 참/거짓 격자로 만든다. 가로세로비를 **보존**한다(정사각으로 늘이면 가로로 긴 몸통과
 *  세로로 긴 종이가 같아진다 — 이 항목이 가르려는 바로 그 축이다). */
async function installInk(page: Page) {
  await page.evaluate(() => {
    const N = 16, R = 96
    ;(window as any).__inkGrid = async (svgText: string): Promise<boolean[] | null> => {
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText)
      try { await img.decode() } catch { return null }
      const c = document.createElement('canvas')
      c.width = R; c.height = R
      const g = c.getContext('2d')!
      g.clearRect(0, 0, R, R)
      g.drawImage(img, 0, 0, R, R)
      const d = g.getImageData(0, 0, R, R).data
      let x0 = R, y0 = R, x1 = -1, y1 = -1
      for (let y = 0; y < R; y++) {
        for (let x = 0; x < R; x++) {
          if (d[(y * R + x) * 4 + 3]! > 16) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
      }
      if (x1 < 0) return null                       // 잉크가 없다(빈 svg)
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1
      const side = Math.max(bw, bh)                 // **비 보존** — 긴 변으로 정규화한다
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const grid: boolean[] = []
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const sx = Math.round(cx - side / 2 + side * i / N), ex = Math.round(cx - side / 2 + side * (i + 1) / N)
          const sy = Math.round(cy - side / 2 + side * j / N), ey = Math.round(cy - side / 2 + side * (j + 1) / N)
          let ink = false
          for (let y = Math.max(0, sy); y < Math.min(R, Math.max(ey, sy + 1)) && !ink; y++) {
            for (let x = Math.max(0, sx); x < Math.min(R, Math.max(ex, sx + 1)); x++) {
              if (d[(y * R + x) * 4 + 3]! > 16) { ink = true; break }
            }
          }
          grid.push(ink)
        }
      }
      return grid
    }
    ;(window as any).__iou = (a: boolean[], b: boolean[]): number => {
      let inter = 0, uni = 0
      for (let i = 0; i < a.length; i++) {
        if (a[i] && b[i]) inter++
        if (a[i] || b[i]) uni++
      }
      return uni === 0 ? 0 : inter / uni
    }
    /** DOM svg 하나를 «그림 그대로» 문자열로 — 색은 검정으로 고정한다(잉크만 잰다) */
    ;(window as any).__svgText = (svg: SVGSVGElement): string => {
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('style', 'color:#000')
      return new XMLSerializer().serializeToString(clone)
    }
  })
}

/** 화면의 svg 전부를 훑어 «출처(문자열)»와 «형태(IoU)» 둘로 잰다 */
async function sweep(page: Page, corpus: Ref[]) {
  return page.evaluate(async (refs: Ref[]) => {
    const W = window as any
    // 견본은 **한 번만 굽는다** — 이 팔이 훑기를 네 번 돌고(성한 판 + 반증 셋) 매번 다시
    // 구우면 60초 문에 걸린다. 값은 같다(같은 svg 문자열의 결정론적 래스터).
    if (!W.__refGrids || W.__refGrids.size !== refs.length) {
      W.__refGrids = new Map<string, { grid: boolean[]; solid: boolean }>()
      for (const r of refs) {
        const g = await W.__inkGrid(r.svg)
        if (g) W.__refGrids.set(r.name, { grid: g, solid: r.solid })
      }
    }
    const grids = W.__refGrids as Map<string, { grid: boolean[]; solid: boolean }>
    const needles = new Set<string>()
    for (const r of refs) for (const p of r.paths) needles.add(p)
    const hits: string[] = []
    const rows: { where: string; shapes: number; iou: number; iou_ref: string; iou_all: number; iou_all_ref: string }[] = []
    const svgs = [...document.querySelectorAll('svg')]
    let shapesTotal = 0
    for (const svg of svgs) {
      const where = (svg.closest('[id]') as HTMLElement | null)?.id || svg.parentElement?.tagName || '?'
      const shapes = [...svg.querySelectorAll('path,circle,rect,ellipse,line,polygon,polyline')]
      shapesTotal += shapes.length
      // (가) 출처 — 그리는 요소의 좌표 문자열이 카메라 계열의 것과 같은가
      for (const el of shapes) {
        for (const attr of ['d', 'points']) {
          const v = el.getAttribute(attr)
          if (v && needles.has(v)) hits.push(`${where}: ${v.slice(0, 24)}…`)
        }
      }
      // (나) 형태 — 구운 잉크 격자의 IoU 최대
      const grid = await W.__inkGrid(W.__svgText(svg))
      let all = 0, allRef = '', out = 0, outRef = ''
      if (grid) {
        for (const [name, g] of grids) {
          const v = W.__iou(grid, g.grid)
          if (v > all) { all = v; allRef = name }
          if (!g.solid && v > out) { out = v; outRef = name }
        }
      }
      rows.push({ where, shapes: shapes.length, iou: +out.toFixed(4), iou_ref: outRef, iou_all: +all.toFixed(4), iou_all_ref: allRef })
    }
    // (다) 말 — 화면 언어(직접 텍스트 + title + aria-label)에 사진 계열 낱말이 없는가
    const words = ['카메라', '사진', '셔터', '찍는', '찍기', 'camera', 'photo', 'shutter']
    const said: string[] = []
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue
      if (el.closest('#diagpanel, #diagctl, #buildid')) continue
      const bits = [el.getAttribute('title') ?? '', el.getAttribute('aria-label') ?? '']
      for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE) bits.push(n.textContent ?? '')
      for (const b of bits) for (const w of words) if (b.includes(w)) said.push(`${(el as HTMLElement).id || el.tagName}: ${w}`)
    }
    rows.sort((a, b) => b.iou - a.iou)
    // **연 자리** — 「무엇을 열어 놓고 쟀나」가 값으로 남아야 그 훑기를 남이 다시 잰다(#71)
    const opened = [...document.querySelectorAll(
      '#tray, #pentray, #etray, #snap-pop, #display-pop, #face-pop, #pane-file, #pane-settings, #paper-pop, #layer-pop, #dimpanel')]
      .filter(el => el.getClientRects().length > 0).map(el => el.id)
    return { svgs: svgs.length, shapes: shapesTotal, refs: grids.size, needles: needles.size, hits, rows, said, opened }
  }, corpus)
}

/** 겹쳐 뜨는 것 **전부**를 연다 — 목록의 출처는 AS-C128이다(패널 여덟 + 팝업 둘).
 *  ⚠ 종이 팝업(`#paper-pop`)은 **탭을 길게 눌러야** 생긴다 — 이 항목의 툴팁이 가리키는 자리다. */
async function openEverything(page: Page) {
  await page.click('#btn-pencil')            // 연필통
  await page.click('#btn-pen')               // 촉통
  await page.click('#btn-eraser-pencil')     // 크기통
  // ⚠ **누름마다 짧은 문을 건다** — 이 설정에는 `actionTimeout`이 없어(0 = 무한) 그 국면에
  // 못 누르는 단추 하나가 팔 전체를 세운다(실제로 `#btn-measure`가 그랬다: 치수 리본이
  // 덮고 있어 안 눌린다). 못 열면 **못 열었다고 적고 넘어간다** — 그 자리는 `opened`에서 빈다.
  for (const sel of ['#btn-snap', '#btn-display', '#btn-measure', '#btn-face']) {
    const el = await page.$(sel)
    if (el) await el.click({ timeout: 2000 }).catch(() => { /* 그 국면에서 안 눌린다 */ })
  }
  await page.evaluate(() => {                // 서랍 둘(파일·설정)
    for (const d of document.querySelectorAll('details')) (d as HTMLDetailsElement).open = true
  })
  // 겹 목록 팝업 · 종이 팝업 — 길게 누르기
  const tab = await page.$('#paperbar .ptab')
  if (tab) {
    const b = (await tab.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(700)
    await page.mouse.up()
  }
  return page.evaluate(() => [...document.querySelectorAll(
    '#tray, #pentray, #etray, #snap-pop, #display-pop, #face-pop, #pane-file, #pane-settings, #paper-pop, #layer-pop, #dimpanel')]
    .filter(el => el.getClientRects().length > 0)
    .map(el => el.id))
}

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await installInk(page)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 카메라가 닫힌 상태로 만든다 — 상자 하나(지평선 + 세 모서리) */
async function construct(page: Page) {
  await boot(page)
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.an.constructionDone), '카메라가 닫혔다').toBe(true)
}

async function orbit(page: Page, n = 30) {
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= n; i++) await page.mouse.move(600 + i * 4, 400 + (i % 5))
  await page.mouse.up({ button: 'middle' })
  await settle(page)
}

const poseNow = (page: Page) => page.evaluate(() => {
  const a = (window as any).__b2.app
  return { p: { ...a.pose.p }, q: { ...a.pose.q }, view: { ...a.view }, active: a.activeSheet }
})
const sheetsNow = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.sheets.map((s: any) =>
  ({ id: s.id, name: s.name, pose: s.pose ? { p: { ...s.pose.p }, q: { ...s.pose.q } } : null, view: s.view ?? null })))

type P3 = { x: number; y: number; z: number }
type P4 = P3 & { w: number }
const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const qdist = (a: P4, b: P4) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w)

const ledger: Record<string, unknown> = {}

// ── ① 카메라 도형 없음 ────────────────────────────────────────────────────────
test('31-4 ① 화면에 카메라 도형이 없다 — DOM 전수 훑기 (+옛 아이콘을 되돌려 반증)', async ({ page }, testInfo) => {
  // ⚠ 이 팔은 훑기를 **네 번** 돈다(성한 판 + 반증 셋) — 판마다 화면의 svg 전부를 굽는다.
  // 기본 60초 문에 걸리므로 시간만 늘린다(**재는 것은 한 톨도 안 줄인다**).
  test.setTimeout(300_000)
  const corpus = cameraCorpus()
  await construct(page)
  // [12] **닫힌 상태의 svg 수**와 **관측 dpr**을 먼저 값으로 남긴다 — 「열든 안 열든 같다」가
  // 산문이 아니라 수가 되고, dpr 축이 실제로 갈렸다는 것도 값으로 남는다(2차 리뷰어 [12]).
  const closedCount = await page.evaluate(() => document.querySelectorAll('svg').length)
  const dprObserved = await page.evaluate(() => window.devicePixelRatio)
  // **숨은 것도 화면이다** — 겹쳐 뜨는 것 **전부**를 열어 놓고 잰다(1차 리뷰어 [4] —
  // 초판은 넷을 안 열었고 그 중 `#paper-pop`은 **이 항목의 툴팁이 가리키는 자리**였다).
  // 목록의 출처는 AS-C128(이 앱의 겹쳐 뜨는 것)이다.
  await openEverything(page)
  await settle(page)
  const before = await sweep(page, corpus)
  const allTop = [...before.rows].sort((a, b) => b.iou_all - a.iou_all)
  const paperRow = before.rows.find(r => r.where === 'paper-add')!
  console.log(`[31-4 ①] svg ${before.svgs}개 · 그리는 요소 ${before.shapes}개 · 견본 ${before.refs}개(계열 path ${before.needles}) `
    + `· 출처 적중 ${before.hits.length} · 형태 IoU 최대 ${before.rows[0]!.iou} (${before.rows[0]!.where} ↔ ${before.rows[0]!.iou_ref}) · 말 ${before.said.length}`)
  console.log(`[31-4 ①] 윤곽 견본 IoU 상위 다섯: ${before.rows.slice(0, 5).map(r => `${r.where} ${r.iou}(${r.iou_ref})`).join(' · ')}`)
  console.log(`[31-4 ①] 견본 전부(나2 · 문 ${CAMERA_IOU_ALL}) 상위 다섯: ${allTop.slice(0, 5).map(r => `${r.where} ${r.iou_all}(${r.iou_all_ref})`).join(' · ')}`)
  console.log(`[31-4 ①] 연 것 ${before.opened.length}자리: ${before.opened.join(' · ')} · 닫힌 상태 svg ${closedCount} → 연 뒤 ${before.svgs} · devicePixelRatio ${dprObserved}`)
  expect(before.svgs, '접힌 통의 svg도 DOM에 산다 — 열든 안 열든 같은 수다').toBe(closedCount)
  expect(dprObserved, 'dpr 축이 실제로 갈렸다').toBeCloseTo(testInfo.project.name === 'dpr2' ? 2 : 1, 3)
  console.log(`[31-4 ①] 새 아이콘 자신 — 윤곽 ${paperRow.iou}(${paperRow.iou_ref}) · 채운 견본까지 ${paperRow.iou_all}(${paperRow.iou_all_ref})`)
  expect(before.svgs, '훑은 svg가 실제로 여럿이다').toBeGreaterThan(10)
  expect(before.refs, '카메라 견본이 스물넷 이상 구워졌다').toBeGreaterThanOrEqual(24)
  expect(before.hits, '(가) 카메라 계열 path가 DOM에 없다').toEqual([])
  expect(before.rows[0]!.iou, `(나1) 윤곽 견본 IoU 최대가 ${CAMERA_IOU} 아래다`).toBeLessThan(CAMERA_IOU)
  expect(allTop[0]!.iou_all, `(나2) 견본 전부(채운 판 포함) IoU 최대가 ${CAMERA_IOU_ALL} 아래다`).toBeLessThan(CAMERA_IOU_ALL)
  expect(before.said, '(다) 화면 언어에 사진 계열 낱말이 없다').toEqual([])

  // 새 아이콘이 «그 자리에» 있다 — 뺀 것만 재고 넣은 것을 안 재면 절반이다
  const icon = await page.evaluate(() => {
    const svg = document.querySelector('#paper-add svg') as SVGSVGElement
    const b = svg.getBoundingClientRect()
    const btn = document.getElementById('paper-add')!.getBoundingClientRect()
    const el = document.elementFromPoint(btn.x + btn.width / 2, btn.y + btn.height / 2)
    return {
      viewBox: svg.getAttribute('viewBox'),
      shapes: svg.querySelectorAll('path').length,
      box: { w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
      arc: /A5\.6 5\.6/.test(svg.innerHTML),                       // 갱신 화살표의 호
      title: document.getElementById('paper-add')!.title,
      aria: document.getElementById('paper-add')!.getAttribute('aria-label'),
      hit: el ? (el.closest('#paper-add') ? 'paper-add' : (el as HTMLElement).id || el.tagName) : null,
    }
  })
  console.log(`[31-4 ①] 새 아이콘 — viewBox ${icon.viewBox} · path ${icon.shapes} · 상자 ${icon.box.w}×${icon.box.h} · 호 ${icon.arc} · 누르면 ${icon.hit}`)
  expect(icon.viewBox).toBe('0 0 32 32')
  expect(icon.shapes, '종이 · 접힌 모서리 · 호 · 촉').toBe(4)
  expect(icon.arc, '갱신 화살표(원형 화살표)가 있다').toBe(true)
  expect(icon.box, '상자가 옛 카메라와 같은 16×16이다(#88 — 띠의 자리가 안 변한다)').toEqual({ w: 16, h: 16 })
  expect(icon.hit, '단추가 실제로 눌린다(#87 — 그려졌는가 ≠ 눌리는가)').toBe('paper-add')
  expect(icon.title, '툴팁이 시점 계열이고 갱신이 사는 자리를 가리킨다').toContain('시점 갱신')
  expect(icon.aria).toBe('시점 남기기')

  // ── 띠의 자리가 안 변했다 — **전/후를 실측으로** 견준다(1차 리뷰어 [10][11]) ──────
  // 초판은 「16×16이다」를 단언만 했는데 그 16은 **옛 아이콘에서 옮겨 적은 수**라
  // 자기참조였다(#88의 판별 ①). 여기서는 **옛 아이콘을 그 자리에 넣어** 띠의 실측
  // 상자를 견준다 — 같으면 「띠의 자리가 안 변한다」가 값으로 선다.
  await page.evaluate(() => { (window as any).__paperIconHTML = document.getElementById('paper-add')!.innerHTML })
  const barBox = () => page.evaluate(() => {
    const bar = document.getElementById('paperbar')!.getBoundingClientRect()
    const btn = document.getElementById('paper-add')!.getBoundingClientRect()
    const tab = document.querySelector('#paperbar .ptab')!.getBoundingClientRect()
    return {
      bar: { w: +bar.width.toFixed(2), h: +bar.height.toFixed(2) },
      btn: { w: +btn.width.toFixed(2), h: +btn.height.toFixed(2), x: +btn.x.toFixed(2), y: +btn.y.toFixed(2) },
      tab: { w: +tab.width.toFixed(2), h: +tab.height.toFixed(2) },
    }
  })
  const placeNew = await barBox()
  // 반증(D-3 · 2차 리뷰어 [7]) — **상자가 다른 아이콘**을 심으면 이 견줌이 실제로 갈린다.
  // 없으면 이 검사는 「CSS가 고정이라 무엇을 넣어도 같다」와 구별되지 않는다.
  await page.evaluate(() => { document.getElementById('paper-add')!.innerHTML =
    '<svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="currentColor"><circle cx="16" cy="16" r="12"/></svg>' })
  const placeBig = await barBox()
  console.log(`[31-4 자리 반증] 40×40을 심은 판 ${JSON.stringify(placeBig)}`)
  expect(JSON.stringify(placeBig) === JSON.stringify(placeNew), '상자가 다른 아이콘을 넣으면 견줌이 갈린다').toBe(false)
  await page.evaluate(html => { document.getElementById('paper-add')!.innerHTML = html as string },
    await page.evaluate(() => (window as any).__paperIconHTML))

  // ── 반증 ㉠(D-3) — **옛 카메라를 그 자리에 되돌리면** 같은 훑기가 빨개진다 ──────
  // 판 둘을 돌린다: ㉠1 **옛 아이콘 그대로**(light · 채운 그림) · ㉠2 **다른 굵기**(bold 윤곽).
  // ㉠2가 있어야 「문자열만 바뀐 이식」도 (나)가 잡는다는 것이 값으로 선다.
  await page.evaluate(old => { document.getElementById('paper-add')!.innerHTML = old as string }, OLD_CAMERA_SVG)
  const after = await sweep(page, corpus)
  const camRow = after.rows.find(r => r.where === 'paper-add')!
  const placeOld = await barBox()
  console.log(`[31-4 자리] 새 아이콘 ${JSON.stringify(placeNew)} ↔ 옛 카메라 ${JSON.stringify(placeOld)}`)
  expect(placeOld, '옛 아이콘을 넣어도 띠·단추·탭의 실측 상자가 같다 — 자리가 안 변했다').toEqual(placeNew)
  console.log(`[31-4 반증㉠1] 옛 아이콘 그대로 — 출처 적중 ${after.hits.length}건 · #paper-add IoU ${camRow.iou} (↔ ${camRow.iou_ref}) · 문 ${CAMERA_IOU}`)
  expect(after.hits.length, '(가)가 실제로 걸린다').toBeGreaterThan(0)
  expect(camRow.iou, '(나)가 실제로 걸린다').toBeGreaterThanOrEqual(CAMERA_IOU)

  // ㉠2 — **좌표를 바꾼 카메라**(bold 굵기 · 다른 문자열). 출처 채널은 계열 전부를 들고
  // 있으므로 여전히 걸리지만, **좌표를 손으로 흔들면** 문자열은 빠져나간다: 그래서 같은
  // 판에서 **한 점을 옮긴 판**도 돌려 (나) 혼자 걸리는 칸을 낸다.
  const bold = cameraCorpus().find(r => r.name === 'bold/camera')!
  await page.evaluate(d => { document.getElementById('paper-add')!.innerHTML =
    `<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="10" width="16" height="16"><path d="${d}"/></svg>` },
    bold.paths[0]!.replace(/^M/, 'M '))     // 앞에 빈칸 하나 — 문자열 대조를 빠져나간다
  const after2 = await sweep(page, corpus)
  const camRow2 = after2.rows.find(r => r.where === 'paper-add')!
  console.log(`[31-4 반증㉠2] 굵기·색·좌표 문자열을 바꾼 판 — 출처 적중 ${after2.hits.length}건(0이면 문자열은 빠져나갔다) · IoU ${camRow2.iou} (↔ ${camRow2.iou_ref})`)
  expect(after2.hits.length, '문자열 대조는 빠져나간다 — (나)만 남는다').toBe(0)
  expect(camRow2.iou, '(나1)이 혼자서도 걸린다').toBeGreaterThanOrEqual(CAMERA_IOU)

  // ㉠3 — **채운 글리프 + 문자열 변형**(1차 리뷰어 [2]가 이름 붙인 빈 칸).
  // 초판은 (나1)만 있어서 이 칸을 못 잡았다: 채운 카메라는 윤곽 견본과 안 닮고(아래 값),
  // 문자열은 바꿨으니 (가)도 빠져나간다. **(나2)가 그 칸을 든다.**
  const fill = cameraCorpus().find(r => r.name === 'fill/camera')!
  await page.evaluate(d => { document.getElementById('paper-add')!.innerHTML =
    `<svg viewBox="0 0 256 256" fill="currentColor" width="16" height="16"><path d="${d}"/></svg>` },
    fill.paths[0]!.replace(/^M/, 'M '))
  const after3 = await sweep(page, corpus)
  const camRow3 = after3.rows.find(r => r.where === 'paper-add')!
  console.log(`[31-4 반증㉠3] 채운 글리프 + 문자열 변형 — 출처 적중 ${after3.hits.length}건 · `
    + `윤곽 견본 IoU ${camRow3.iou}(문 ${CAMERA_IOU}) · 견본 전부 IoU ${camRow3.iou_all}(${camRow3.iou_all_ref} · 문 ${CAMERA_IOU_ALL})`)
  expect(after3.hits.length, '문자열 대조는 여기서도 빠져나간다').toBe(0)
  // ⚠ 문으로 쓰는 것은 **(나2)**다 — (나1)도 0.7321로 넘지만 여유가 0.032뿐이라 거기 문을 안 건다
  expect(camRow3.iou_all, '(나2)가 채운 판을 결정적으로 잡는다').toBeGreaterThanOrEqual(CAMERA_IOU_ALL)
  // 원상복구 — 뒤 팔이 옛 아이콘을 보지 않는다
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)

  ledger[`sweep_${testInfo.project.name}`] = {
    swept: {
      svgs: before.svgs, shapes: before.shapes, refs: before.refs, family_paths: before.needles,
      opened: before.opened,
      excluded: { source_shape: '없음 — (가)(나)는 DOM에 사는 svg 전부를 훑는다(보이든 안 보이든)',
        words: '#diagpanel · #diagctl · #buildid (진단 채널 — icons.spec ①의 선례)' },
      opened_note: '⚠ **R7 때문에 통은 한 번에 하나만 열린다**(`boxes.ts` — 여는 순간 다른 통이 접힌다). '
        + '그래서 `opened`가 셋뿐이지만 **훑기는 그것과 무관하다**: 접힌 통의 svg도 DOM에 살아 있고 '
        + '(svg 수가 열든 안 열든 43으로 같다) 훑기는 DOM을 본다. **눌러야 «생기는» 것**만 열어야 하고 '
        + '그것이 `#paper-pop`(탭 길게 누르기 — 이 항목의 툴팁이 가리키는 자리)이다. 그 팝업에는 '
        + 'svg가 없다(썸네일 `img` + 글자 `u` 셋) — 그 사실도 이 훑기가 낸 값이다.',
    },
    place_new_vs_old: {
      new: placeNew, old_camera: placeOld, same: JSON.stringify(placeNew) === JSON.stringify(placeOld),
      falsify_big_icon: { box: placeBig, same: JSON.stringify(placeBig) === JSON.stringify(placeNew),
        def: '40×40 아이콘을 같은 자리에 심은 판 — 이 견줌이 실제로 갈리는 것을 값으로 보인다(2차 리뷰어 [7]).' },
    },
    dpr_observed: dprObserved,
    svgs_closed: closedCount,
    source_hits: before.hits.length,
    iou_top5: before.rows.slice(0, 5),
    iou_max: before.rows[0]!.iou,
    iou_all_top10: allTop.slice(0, 10),   // 2차 리뷰어 [6] — top5가 연필통 줄 여섯으로 포화돼
                                          // 면·지우개 값이 원장에서 안 보였다. 열 줄로 늘린다.
    paper_add_row: paperRow,
    words_found: before.said,
    icon: { ...icon },
    falsify_a_old_camera: {
      source_hits: after.hits.length,
      paper_add_iou: camRow.iou, paper_add_ref: camRow.iou_ref,
      gate: CAMERA_IOU,
      restyled: {
        source_hits: after2.hits.length, paper_add_iou: camRow2.iou, paper_add_ref: camRow2.iou_ref,
        // 2차 리뷰어 [2] — (나2) 축의 **항등이 아닌** 도달 값이 여기다(윤곽 글리프를 심었으므로
        // 견본 전부에 대해서도 1.0이 아니다). 이 값이 없으면 (나2)의 도달 가능성이 항등뿐이었다.
        paper_add_iou_all: camRow2.iou_all, paper_add_ref_all: camRow2.iou_all_ref,
      },
      restyled_solid: {
        source_hits: after3.hits.length,
        paper_add_iou_outline: camRow3.iou, paper_add_iou_all: camRow3.iou_all, paper_add_ref_all: camRow3.iou_all_ref,
        note: '채운 글리프 + 문자열 변형 — **(가)는 빠져나간다**(적중 0). 형태 쪽은 **둘 다 잡되 여유가 다르다**: '
          + '(나1) 윤곽 견본 0.7321로 문 0.700을 **0.032 차로 아슬하게** 넘고, (나2) 견본 전부 1.0으로 **결정적으로** 넘는다. '
          + '⚠ 그러므로 「(나2)만 잡는다」가 아니다 — 실측이 그렇게 말한다(초판 문면을 이 값으로 고쳤다). '
          + '⚠ 두 문 **모두 등록된 문이다**(화면 쪽에). 여기서 «문을 안 건다»고 한 것은 **이 반증 판이 어느 문을 넘어야 하는가**이고, 그 단언은 여유가 큰 (나2)에만 건다 — (나1)의 0.032는 넘긴 하지만 얇아서 **기록만** 한다(팔이 그것을 단언하면 래스터가 한 픽셀만 흔들려도 빨개진다). '
          + '초판에는 이 칸이 아예 없었다(1차 리뷰어 [2]).',
      },
    },
    iou_all_max: allTop[0]!.iou_all,
  }
})

// ── ② 시점 저장·복귀 무회귀 ───────────────────────────────────────────────────
test('31-4 ② 시점 저장·복귀 무회귀 — 좌표로 (+배선을 끊어 반증)', async ({ page }, testInfo) => {
  await construct(page)
  await orbit(page)
  const poseA = await poseNow(page)
  expect(dist(poseA.p, { x: 0, y: 0, z: 0 }), '궤도로 작도 시점을 떠났다').toBeGreaterThan(0)

  // 저장 — 셔터 자리의 그 단추다(그림만 바뀌었다)
  await page.click('#paper-add')
  await settle(page)
  await page.keyboard.press('Escape')          // 새 탭의 이름 편집을 닫는다
  await settle(page)
  const saved = await sheetsNow(page)
  expect(saved.length, '한 장이 늘었다').toBe(2)
  const sheet = saved[1]!
  const dSave = dist(sheet.pose!.p, poseA.p), dqSave = qdist(sheet.pose!.q, poseA.q)
  console.log(`[31-4 ②] 저장 — 종이 ${saved.length}장 · 담긴 좌표 차 |p| ${dSave.toExponential(3)} · |q| ${dqSave.toExponential(3)}`)
  expect(dSave, '담긴 위치가 지금 위치와 같다').toBeLessThan(1e-12)
  expect(dqSave, '담긴 자세가 지금 자세와 같다').toBeLessThan(1e-12)

  // 떠난다 — 작도 종이로
  await page.click(`#paperbar .ptab[data-sheet="${saved[0]!.id}"]`)
  await settle(page)
  const away = await poseNow(page)
  const dAway = dist(away.p, poseA.p)
  expect(dAway, '작도 종이로 가면 시점이 실제로 달라진다').toBeGreaterThan(1e-6)

  // 복귀 — 탭을 누르면 저장한 좌표로 **정확히** 돌아온다
  await page.click(`#paperbar .ptab[data-sheet="${sheet.id}"]`)
  await settle(page)
  const back = await poseNow(page)
  const dBack = dist(back.p, poseA.p), dqBack = qdist(back.q, poseA.q)
  console.log(`[31-4 ②] 복귀 — 떠난 거리 ${dAway.toFixed(6)} → 돌아온 차 |p| ${dBack.toExponential(3)} · |q| ${dqBack.toExponential(3)} · 활성 ${back.active === sheet.id}`)
  expect(dBack, '복귀한 위치가 저장한 위치와 같다').toBeLessThan(1e-12)
  expect(dqBack, '복귀한 자세가 저장한 자세와 같다').toBeLessThan(1e-12)
  expect(back.active).toBe(sheet.id)

  // ⚠⚠ **«있는 장은 안 바뀐다»를 직접 잰다**(1차 리뷰어 [7] — 초판은 `save_diff`(=담긴
  // 좌표 ↔ 지금 좌표)를 그 근거로 인용했는데 그것은 다른 물음이었다). 한 번 더 눌러
  // 새 장을 만들고, **먼저 만든 장의 좌표가 그대로인지**를 본다 — AS-C133의 「Add이지
  // Update가 아니다」가 여기서 값으로 선다.
  await orbit(page, 8)
  const poseA2 = await poseNow(page)
  await page.click('#paper-add')
  await settle(page)
  await page.keyboard.press('Escape')
  await settle(page)
  const two = await sheetsNow(page)
  const keptDrift = dist(two[1]!.pose!.p, sheet.pose!.p)
  const newIsNow = dist(two[2]!.pose!.p, poseA2.p)
  console.log(`[31-4 ②] 한 번 더 — 종이 ${two.length}장 · 먼저 만든 장의 좌표 드리프트 ${keptDrift.toExponential(3)} · 새 장 ↔ 지금 ${newIsNow.toExponential(3)} · 그때 사이 이동 ${dist(poseA2.p, poseA.p).toFixed(6)}`)
  expect(two.length, '또 한 장이 는다 — 갱신이 아니라 더하기다').toBe(3)
  expect(keptDrift, '먼저 만든 장의 좌표는 한 톨도 안 바뀐다').toBe(0)
  expect(newIsNow, '새 장이 지금 시점을 담는다').toBeLessThan(1e-12)
  expect(dist(poseA2.p, poseA.p), '그 사이에 시점은 실제로 움직였다').toBeGreaterThan(1e-6)
  // 그 뒤의 갱신 시험은 **먼저 만든 장**을 대상으로 한다(방금 만든 장이 활성이므로 되돌아간다)
  await page.click(`#paperbar .ptab[data-sheet="${sheet.id}"]`)
  await settle(page)

  // 갱신(Update Scene)도 그대로 돈다 — 이 단추가 아니라 **탭 길게 누르기**가 그 자리다
  await orbit(page, 12)
  const poseB = await poseNow(page)
  const b = (await page.locator(`#paperbar .ptab[data-sheet="${sheet.id}"]`).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await page.click('#paper-pop u[data-pick="update"]')
  await settle(page)
  const upd = (await sheetsNow(page)).find((x: { id: number }) => x.id === sheet.id)!
  const dUpd = dist(upd.pose!.p, poseB.p)
  console.log(`[31-4 ②] 갱신 — 갱신 뒤 담긴 좌표 차 ${dUpd.toExponential(3)} · 옛 좌표와의 거리 ${dist(upd.pose!.p, poseA.p).toFixed(6)}`)
  expect(dUpd, '갱신하면 지금 좌표가 담긴다').toBeLessThan(1e-12)
  expect(dist(upd.pose!.p, poseA.p), '갱신 전 좌표와는 달라졌다').toBeGreaterThan(1e-6)

  ledger[`roundtrip_${testInfo.project.name}`] = {
    pose_A: { p: poseA.p, q: poseA.q },
    saved_pose: sheet.pose,
    save_diff: { p: +dSave.toExponential(3), q: +dqSave.toExponential(3) },
    away_dist: +dAway.toFixed(6),
    back_diff: { p: +dBack.toExponential(3), q: +dqBack.toExponential(3) },
    update_diff: +dUpd.toExponential(3),
    update_moved_from_A: +dist(upd.pose!.p, poseA.p).toFixed(6),
    sheets: saved.length,
    add_not_update: {
      sheets_after_second_press: two.length,
      kept_sheet_drift: keptDrift,
      new_sheet_is_now: +newIsNow.toExponential(3),
      moved_between: +dist(poseA2.p, poseA.p).toFixed(6),
      def: '한 번 더 눌렀을 때 **먼저 만든 장의 좌표가 움직이는가**. 0이면 그 단추는 Add Scene이다 '
        + '(AS-C133이 인용하는 자리 — `save_diff`가 아니다).',
    },
  }
})

test('31-4 ③ 반증 ㉡ — 배선을 끊으면 ②가 빨개진다 (저장 · 복귀 각각)', async ({ page }, testInfo) => {
  // 판 ⓐ **저장 끊김** — 단추를 복제로 갈아 끼우면 누름 배선이 사라진다(그림은 그대로다)
  await construct(page)
  await orbit(page)
  const poseA = await poseNow(page)
  await page.evaluate(() => {
    const el = document.getElementById('paper-add')!
    el.replaceWith(el.cloneNode(true))          // cloneNode는 리스너를 안 옮긴다
  })
  await page.click('#paper-add')
  await settle(page)
  const cut = await sheetsNow(page)
  console.log(`[31-4 반증㉡ⓐ] 배선을 끊고 눌렀다 — 종이 ${cut.length}장(성한 판은 2장)`)
  expect(cut.length, '끊긴 판에서는 저장이 안 된다 — ②의 첫 문이 빨개진다').toBe(1)

  // 판 ⓑ **복귀 끊김** — 성한 판에서 저장한 뒤 **탭**의 배선만 끊는다
  // ⚠⚠ **저장소를 비우고 다시 연다**(1차 리뷰어 [3]) — 그냥 `reload`하면 **자동 저장이
  // 앞 판의 획을 복원해** 획이 여섯이 되고 카메라가 달라진다. 초판이 그래서 dpr1·dpr2의
  // 「떠난 거리」가 5.508082 ↔ 5.335540으로 갈렸다(값이 흔들린 것이 아니라 **다른 문서를
  // 잰 것**이다). 비우고 열면 ②와 같은 문서·같은 카메라가 된다.
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length), '비우고 열었다 — 획 0').toBe(0)
  await drawLine(page, 500, 560, 760, 495)
  await drawLine(page, 500, 560, 240, 495)
  await drawLine(page, 760, 495, 240, 495)
  await orbit(page)
  const poseC = await poseNow(page)
  await page.click('#paper-add')
  await settle(page)
  await page.keyboard.press('Escape')
  await settle(page)
  const sheets = await sheetsNow(page)
  expect(sheets.length, '성한 판에서는 저장된다').toBe(2)
  // 판 ⓒ **갱신 끊김**(1차 리뷰어 [6]) — 등록한 문 여섯 중 「갱신이 그대로 돈다」에만
  // 반증이 없었다. 팝업의 그 줄을 복제로 갈아 끼워 **배선만** 끊는다.
  // ⚠ **ⓑ보다 먼저 돈다** — ⓑ가 그 탭의 배선을 끊으면 길게 누르기가 죽어 팝업이 안 열린다.
  await orbit(page, 10)
  const poseD = await poseNow(page)
  const beforeUpd = (await sheetsNow(page)).find((x: { id: number }) => x.id === sheets[1]!.id)!
  const tb = (await page.locator(`#paperbar .ptab[data-sheet="${sheets[1]!.id}"]`).boundingBox())!
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await expect(page.locator('#paper-pop u[data-pick="update"]')).toBeVisible()
  await page.evaluate(() => {
    const el = document.querySelector('#paper-pop u[data-pick="update"]')!
    el.replaceWith(el.cloneNode(true))
  })
  await page.click('#paper-pop u[data-pick="update"]')
  await settle(page)
  const afterUpd = (await sheetsNow(page)).find((x: { id: number }) => x.id === sheets[1]!.id)!
  const dUpdCut = dist(afterUpd.pose!.p, poseD.p)
  console.log(`[31-4 반증㉡ⓒ] 갱신 배선을 끊고 눌렀다 — 담긴 좌표가 지금에서 ${dUpdCut.toFixed(6)} 떨어져 있다(성한 판은 0) · 옛 좌표 그대로 ${dist(afterUpd.pose!.p, beforeUpd.pose!.p).toExponential(3)}`)
  expect(dUpdCut, '끊긴 판에서는 갱신이 안 된다 — 「갱신이 그대로 돈다」가 빨개진다').toBeGreaterThan(1e-6)
  expect(dist(afterUpd.pose!.p, beforeUpd.pose!.p), '옛 좌표가 그대로다').toBeLessThan(1e-12)

  await page.click(`#paperbar .ptab[data-sheet="${sheets[0]!.id}"]`)   // 작도 종이로 떠난다
  await settle(page)
  const away = await poseNow(page)
  await page.evaluate(id => {
    const el = document.querySelector(`#paperbar .ptab[data-sheet="${id}"]`)!
    el.replaceWith(el.cloneNode(true))
  }, sheets[1]!.id)
  await page.click(`#paperbar .ptab[data-sheet="${sheets[1]!.id}"]`)
  await settle(page)
  const back = await poseNow(page)
  const dBackCut = dist(back.p, poseC.p)
  const dAwayCut = dist(away.p, poseC.p)      // 이 판 자신의 «떠난 거리» — ②의 값과 같아야 한다
  console.log(`[31-4 반증㉡ⓑ] 탭 배선을 끊고 눌렀다 — 저장 좌표와의 거리 ${dBackCut.toFixed(6)} (성한 판은 0) · 떠난 거리 ${dAwayCut.toFixed(6)} · 떠난 자리 그대로 ${dist(back.p, away.p).toExponential(3)}`)
  expect(dBackCut, '끊긴 판의 «남은 거리»가 곧 그 판의 «떠난 거리»다').toBeCloseTo(dAwayCut, 9)
  expect(dBackCut, '끊긴 판에서는 복귀가 안 된다 — ②의 둘째 문이 빨개진다').toBeGreaterThan(1e-6)

  ledger[`falsify_b_wiring_${testInfo.project.name}`] = {
    save_cut: { sheets_after_click: cut.length, sheets_when_intact: 2, pose_A: poseA.p },
    goto_cut: {
      back_dist_to_saved: +dBackCut.toFixed(6),
      away_dist_this_run: +dAwayCut.toFixed(6),
      stayed_where_left: +dist(back.p, away.p).toExponential(3),
      intact_back_dist: 0,
      strokes_after_reset: 3,
    },
    update_cut: {
      stored_vs_now: +dUpdCut.toFixed(6),
      stored_unchanged: +dist(afterUpd.pose!.p, beforeUpd.pose!.p).toExponential(3),
      intact_stored_vs_now: 0,
    },
  }

  // 이 파일의 마지막 팔이 원장을 쓴다(LEDGER=1 단독 실행에서만 — web2-22 규율)
  if (process.env.LEDGER === '1') {
    const dpr = testInfo.project.name
    const sw = ledger[`sweep_${dpr}`] as any
    const fb = ledger[`falsify_b_wiring_${dpr}`] as any
    /** 게이트의 값 대조가 가리키는 **한 자리**(#40 ③) — 화면 최대 · 심은 판 · 끊은 판 */
    const reachPoints = [
      sw.iou_max,                                             // (나1) 성한 화면의 최대
      sw.falsify_a_old_camera.restyled.paper_add_iou,         // (나1) 심은 판 — 문 위
      sw.falsify_a_old_camera.restyled.paper_add_iou_all,     // (나2) 심은 판 — **항등이 아닌** 값(2차 [2])
      fb.goto_cut.back_dist_to_saved,                         // 배선 축
    ]
    mkdirSync(OUT, { recursive: true })
    writeFileSync(resolve(OUT, `papericon31_web2_${dpr}.json`), JSON.stringify({
      what: 'web2-31 4번 — 종이 띠 단추의 카메라 도형을 떼고 «종이 + 갱신 화살표»로 바꿨다. '
        + '「화면에 카메라 도형이 없다」를 DOM 전수 훑기(출처·형태·말) 셋으로 재고, '
        + '「시점 저장·복귀 무회귀」를 좌표로 잰다.',
      canonical_command: `LEDGER=1 npx playwright test e2e/papericon31.spec.ts --project=${dpr}`,
      viewport: { w: 1200, h: 800 }, dpr,
      def: {
        source: '(가) DOM svg의 `d`/`points` 문자열이 Phosphor camera 계열 넷(camera·plus·rotate·slash) '
          + '× 여섯 굵기의 path와 **같은가**. 적중 0이 통과.',
        shape: '(나) DOM svg 하나를 96×96으로 굽고 **잉크 상자로 정규화**(가로세로비 보존 — 긴 변 기준) '
          + '한 뒤 16×16 참/거짓 격자로 만들어 카메라 계열 견본과 **IoU**. 최대값이 문 아래여야 한다. '
          + '문자열보다 넓다 — 색·크기·굵기를 바꿔 옮겨 심어도 걸린다.',
        words: '(다) 화면 언어(직접 텍스트 + title + aria-label · 진단 채널 제외)에 사진 계열 낱말 여덟이 없다.',
        roundtrip: '②는 «저장 → 떠남 → 복귀»의 좌표 차다. 저장·복귀 차는 1e-12 아래, 떠난 거리는 1e-6 위.',
      },
      not_covered: '⚠ 못 잡는 칸 **둘**(#26 — 못 잡는 것을 잡는다고 안 적는다 · 1차 리뷰어 [2]): '
        + '㉠ (가)(나)가 모두 **카메라 계열**을 기준으로 하므로, 이 계열에 없는 «손으로 다시 그린 카메라»는 '
        + '두 채널을 지나간다(그 자리는 (다)의 말 훑기와 instrument-icons.md의 등재 규약이 든다). '
        + '㉡ **(나2)의 문 0.75는 화면의 자연 분포에서 0.057 위다** — 채운 견본은 이 앱의 실물 도구 그림과 '
        + '가깝다(연필통 줄 0.693). 실물 도구 그림이 늘거나 뭉툭해지면 그 문이 먼저 흔들린다. 둘 다 DEFERRED에 있다. '
        + '⚠ **초판은 ㉠만 적었고 ㉡의 칸(채운 글리프 + 문자열 변형)은 아예 안 돌았다** — 반증 ㉠3이 그 칸이다.',
      // [4] 임계 **둘 다** 싣는다 — 하나만 실으면 다른 하나가 산문에서 조용히 낡는다(#47)
      thresholds: { CAMERA_IOU, CAMERA_IOU_ALL },
      // [1] ⚠⚠ **문의 출처를 정직하게 적는다**: 두 값은 **관측 분포를 보고 사후로** 놓였다.
      // 규칙은 「자연 최대와 심은 판 사이의 넓은 자리」이고, 각 문의 양쪽 값이 아래에 있다.
      // 사전에 정한 값이 아니므로 ㉠3이 (나1)을 0.032로 넘는 것은 **설계가 아니라 관측**이다.
      threshold_provenance: {
        when: 'post-hoc — 성한 화면의 분포를 먼저 재고 그 위에 놓았다(2차 리뷰어 [1]에 답한다)',
        rule: '자연 최대 < 문 < 심은 판의 값. 문을 «넓은 골»의 가운데 쪽에 둔다.',
        gate_nun1: { natural_max: 0.5787, gate: CAMERA_IOU, planted: 0.8238 },
        gate_nun2: { natural_max: 0.693, gate: CAMERA_IOU_ALL, planted_identity: 1 },
        caveat: '⚠ (나2)의 여유는 0.057뿐이고 그 아래쪽은 **이 앱의 실물 도구 그림**이다 — '
          + '실물 그림이 늘거나 뭉툭해지면 이 문이 먼저 흔들린다(DEFERRED). '
          + '그리고 두 문 모두 **한 실행의 분포 한 점**에서 나왔다(#12의 형태).',
      },
      reach_points: reachPoints,
      reach_points_def: '① 성한 화면의 (나1) IoU 최대(문 아래여야 한다) ② **문자열을 바꿔 심은 카메라**의 '
        + '(나1) IoU(문 0.7 위여야 한다) ③ **같은 판의 (나2) IoU**(문 0.75 위 — 이 축의 «항등이 아닌» 도달 값이다. '
        + '2차 리뷰어 [2]로 더했다: 그전에는 (나2) 축의 도달 값이 채운 글리프의 항등 1.0뿐이었다) '
        + '④ 배선을 끊은 판의 복귀 거리(0이 아니어야 한다). '
        + '⚠ 옛 아이콘 그대로를 되돌린 판의 IoU 1.0은 **항등**이라 이 넷에 안 넣는다(#40 ② · #5).',
      ...ledger,
      gate: {
        for: 'web2-31 4번 — ① 화면에 카메라 도형이 없다(출처 0 · 형태 IoU < 문 · 말 0) '
          + '② 시점 저장·복귀가 좌표로 무회귀',
        registered: [
          'DOM svg 전수에서 카메라 계열 path 적중 0',
          `(나1) 윤곽 견본 IoU 최대 < ${CAMERA_IOU} · (나2) 견본 전부 IoU 최대 < ${CAMERA_IOU_ALL}`,
          '화면 언어에 사진 계열 낱말 0',
          '새 아이콘: viewBox 0 0 32 32 · path 넷 · 호 · elementFromPoint가 제 것을 낸다',
          '띠·단추·탭의 실측 상자가 **옛 아이콘을 넣은 판과 같다**(자기참조 아님 — 전/후 견줌)',
          '한 번 더 눌렀을 때 **먼저 만든 장의 좌표 드리프트 0**이고 장이 하나 더 는다 (Add이지 Update가 아니다)',
          '띠·단추·탭 상자의 전/후 견줌이 **갈릴 수 있다** — 40×40을 심은 판에서 실제로 갈린다',
          '떠난 거리 > 1e-6 (탭 왕복이 실제로 자리를 옮긴다)',
          '⚠ **문이 아니라 «보장 기술»**: 저장·복귀 좌표 차가 0인 것은 같은 좌표를 복사하는 '
            + '경로의 **구성 보장**이다(CLAUDE.md §5.1 유형 3 — 임계를 안 건다). 그 자리의 '
            + '판별력은 반증 ㉡ⓐⓑⓒ가 준다',
          '⚠ 같은 뜻으로 「탭 길게 눌러 갱신이 돈다」와 「새 장이 지금을 담는다」(`new_sheet_is_now` 0)도 '
            + '**보장 쪽**이다 — 같은 좌표를 복사하는 경로다(2차 리뷰어 [8]). 판별력은 ㉡ⓒ·㉡ⓐ다',
        ],
        reachability: '**둘 다 실제로 실패시켰다**(D-3). ㉠ 옛 카메라(Phosphor light camera · 채운 그림)를 '
          + `같은 자리에 되돌리면 (가) 출처 적중이 0 → ${(ledger[`sweep_${dpr}`] as any).falsify_a_old_camera.source_hits}건이 되고 `
          + `(나1) **그 자리(#paper-add)**의 IoU가 ${sw.paper_add_row.iou} → ${sw.falsify_a_old_camera.paper_add_iou}로 문을 넘는다`
          + `(화면 최대 ${sw.iou_max}은 다른 아이콘의 값이다 — 섞어 적지 않는다)`
          + `(그 1.0은 같은 글리프라 **항등**이므로, 값 대조에는 «굵기·색·좌표 문자열을 바꿔 심은 판»의 `
          + `${sw.falsify_a_old_camera.restyled.paper_add_iou}을 쓴다 — 그 판은 출처 채널을 빠져나간다). `
          + `㉠3 **채운 글리프를 문자열만 바꿔 심으면** (가)는 빠져나가고 형태 쪽이 잡는다`
          + `(출처 0건 · 윤곽 ${sw.falsify_a_old_camera.restyled_solid.paper_add_iou_outline} · 전부 ${sw.falsify_a_old_camera.restyled_solid.paper_add_iou_all}). `
          + '㉡ 단추·탭·갱신 줄을 복제로 갈아 끼워 **배선만** 끊으면(그림은 그대로) 저장이 1장에서 안 늘고 '
          + `복귀가 저장 좌표에서 ${fb.goto_cut.back_dist_to_saved} 떨어진 자리에 남고 `
          + `갱신이 지금 좌표에서 ${fb.update_cut.stored_vs_now} 떨어진 옛 좌표에 머문다. `
          + '기록은 web2/NOTES.md 31-4 반증 절.',
        // ⚠ **값 셋을 한 자리에 모아 둔다**(`reach_points`) — selfcheck의 값 대조는
        // **한 경로**만 푼다. 그리고 **㉠1의 IoU 1.0은 여기 안 적는다**: 같은 글리프를
        // 되돌린 판이라 1.0은 «측정»이 아니라 **항등**이다(#40 ②·#5). 그 자리에는
        // **문자열을 바꿔 심은 판**(㉠2 · 0.8238)을 적는다 — 그것이 잴 것이 있는 값이다.
        reachability_value: reachPoints,
        reachability_source: 'reach_points',
        // ⚠⚠ **#35의 자를 반대 방향에도 댄다**(web2-31 마감 [11]). 위 `reachability`는
        //   「심은 판에서 빨개진다」인데, 그 문만 있으면 이 게이트는 **사후**라 지금 화면에
        //   대해서는 영원히 초록이다 — 그러면 «측정»이 아니라 **관측의 재기술**이다.
        //   그래서 「**심은 판 없이** 빨개질 수 있는 경로가 있는가」에 답을 적는다.
        red_without_planting: {
          verdict: '**있다 — 셋이다.** 이 게이트는 고정 목록이 아니라 **DOM 전수 훑기**라 앞을 향한다.',
          routes: [
            '㉠ **앞으로 심는 사람**(가장 흔한 길): 아무 회차가 카메라 계열 아이콘을 화면 어디에 '
              + '넣기만 하면 (가) 출처 적중이 0 → n이 되어 빨개진다. 이 항목이 손댄 `#paper-add` '
              + '한 자리가 아니라 **DOM의 svg 전부**(이 실행에서 43개 · 도형 142개)를 훑으므로, '
              + '심는 자리를 이 팔이 미리 알 필요가 없다. **그것이 이 게이트가 사후가 아닌 이유다.**',
            '㉡ **말이 먼저 샌다**: (다)는 화면 언어(직접 텍스트 · title · aria-label)에서 사진 계열 '
              + '낱말 여덟을 훑는다. 그림을 안 바꾸고 **말만** 「사진/스냅샷/셔터」로 적어도 빨개진다 '
              + '— 실제로 이 회차가 이름을 그 훑기로 골랐다.',
            '㉢ **아무도 안 심어도 빨개질 수 있다**(위양성 쪽 — 이 칸이 «관측의 재기술»이 아님을 '
              + '가장 세게 말한다): (나2)의 자연 최대는 연필통 줄의 **0.693**이고 문이 **0.75**라 '
              + '여유가 0.057뿐이다. **이 앱의 실물 도구 그림이 뭉툭해지거나 커지면** 카메라를 '
              + '한 번도 안 넣고도 그 문을 넘는다. 그 사실은 `threshold_provenance.caveat`와 '
              + 'DEFERRED에 이미 있다 — 여기서는 「빨개지는 경로」로 다시 센다.',
          ],
          not_a_route: (
            '⚠ 반대로 **게이트 ②(저장·복귀 좌표 0)는 이 물음에 「없다」로 답한다** — 같은 좌표를 '
            + '복사하는 경로라 구성상 0이고, 심지 않으면 안 빨개진다. 그래서 그 칸은 '
            + '`registered`에서 이미 **「문이 아니라 보장 기술」**로 내려 적었다(#77 ㉡). '
            + '**두 칸의 답이 서로 다른 것이 이 자를 댄 값이다.**'
          ),
        },
      },
      selfcheck_flags_known: {
        zero_diffs: '⚠ `roundtrip_*.save_diff`·`back_diff`가 0에 붙는 것은 **설계 보장**이다 — '
          + '`addSheet`/`gotoSheet`가 같은 좌표를 복사한다(CLAUDE.md §5.1 유형 3). '
          + '그러므로 그 0 자체는 아무것도 안 재고, **판별력은 반증 ㉡의 두 값**이 준다 '
          + '(끊은 판에서 저장이 안 늘고 복귀가 안 온다).',
        intact_back_dist: '⚠ `falsify_b_wiring_*.goto_cut.intact_back_dist = 0`은 위 ②가 잰 값의 재기술이다(상수).',
        old_camera_iou_1: '⚠ `falsify_a_old_camera.paper_add_iou = 1`이 「정확히 1」로 잡힌다 — **그것이 그 판의 정의다**: '
          + '같은 글리프를 같은 자리에 되돌렸으므로 래스터가 같고 IoU는 **항등**이다. 그래서 게이트의 값 대조에는 '
          + '이 1.0을 **안 쓰고**(#40 ②) 문자열을 바꿔 심은 판의 0.8238을 쓴다(`reach_points`).',
        shapes_1: '⚠ `iou_top5[*].shapes = 1`은 비율이 아니라 **그 svg 안의 그리는 요소 «개수»**다(치수·표시 아이콘이 path 하나).',
        pose_q_near_zero: '⚠ `pose_A.q.x`·`q.z`가 1e-18 대인 것은 **궤도가 세계 수직축 하나로만 돌기 때문**이다'
          + '(state.ts `orbitBy` — 가로 회전만 실린 자세라 x·z 성분이 부동소수 잔차로 남는다). 재는 값은 그 잔차가 아니라 '
          + '`save_diff`/`back_diff`이고, 그쪽의 판별력은 반증 ㉡이 준다.',
        restyled_solid_iou_1: '⚠ `restyled_solid.paper_add_iou_all = 1`도 **항등**이다 — 채운 글리프를 그대로 '
          + '심었으니 래스터가 견본과 같다(바꾼 것은 문자열뿐이다). 그 판이 재는 것은 IoU의 크기가 아니라 '
          + '**(가)가 0건인데 (나2)가 잡는다**는 사실이다.',
        new_sheet_is_now_0: '⚠ `add_not_update.new_sheet_is_now = 0`은 **보장**이다(새 장에 지금 좌표를 '
          + '복사하는 같은 경로 — `save_diff`와 같은 부류). 그래서 게이트에서 문이 아니라 보장 쪽에 적었다'
          + '(2차 리뷰어 [8]). 이 회차가 «잰» 것은 그 옆의 `kept_sheet_drift`다.',
        kept_sheet_drift_0: '⚠ `add_not_update.kept_sheet_drift = 0`은 **이 회차가 실제로 잰 답**이고 보장이 아니다 — '
          + '그 값이 0이 아닐 수 있다는 증거가 같은 원장 안에 있다: 갱신(Update Scene)을 부르면 같은 장의 좌표가 '
          + '`update_moved_from_A`만큼 움직인다. 「Add이지 Update가 아니다」(AS-C133)를 떠받치는 값이 이것이다.',
        btn_y_0: '⚠ `place_new_vs_old.*.btn.y = 0`은 카운터가 아니라 **좌표**다 — 단추가 종이 띠의 맨 위에 붙어 있다. '
          + '이 필드가 재는 것은 값 자체가 아니라 **새 아이콘 판과 옛 아이콘 판이 같은가**이고 `same`이 그 답이다.',
        intact_zeros: '⚠ `intact_back_dist`·`intact_stored_vs_now` = 0은 성한 판에서 잰 값의 재기술이다(상수).',
        constants_snapshot: '⚠ `constants/metric_defs` 스냅샷이 없다 — **web2 라인 원장의 공통 형태**다(상수 스냅샷 등록부 밖). '
          + '이 원장이 인용하는 임계는 `thresholds.CAMERA_IOU` 하나이고 그 출처는 `e2e/thresholds.ts`다.',
      },
    }, null, 2))
  }
})
