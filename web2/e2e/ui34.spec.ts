// web2-34 3번 — **지우개 크기: 슬라이더를 없애고 고르기로** (화면 규칙 R1·R2·R3·R6).
//
// 사람의 말: 「동그라미가 허공에 떠 있기만 하니 이게 뭔지 모르겠다.」
// 그 동그라미는 막대 폭 안에 들어가려고 줄여 그린 것이라 **실제 지우개의 27.5~112.5%**
// 였다(수리 전 실측 — NOTES 34-3 §D-1). 30-2가 펜 굵기에서 없앤 것과 같은 병이다.
//
// D-2(재현): ①④는 **수리 전에 실패한다** — `#thick`이 DOM에 있었고(요구 0), 접힌
//   지우개에 각인이 없었다(0개 · 요구 1), 크기 줄도 0개였다.
// D-3(반증): ⑤가 둘을 **실제로 되돌려** 빨갛게 만든다 — 옛 «비율만» 견본 · 끊긴 배선.
// D-5(대역): 네 단계 **전부**를 왕복하고 dpr 둘 다 돈다. 견본의 1:1은 값 비교가 아니라
//   **실제로 지워서** 잰다(30-2의 「견본 == 그은 선」이 그 어법이다).

import { test, expect, type Page } from '@playwright/test'
import { C } from '../src/core/constants'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 줄의 id — main.ts가 짓는 규칙 그대로(표를 팔에 복제하지 않는다 — #54) */
const ROW_ID = (r: number) => `erase-${String(r).replace('.', '_')}`
/** 각인·줄의 표기 — 지름 mm의 반올림. 자는 `C.NIB_PX_PER_MM` 하나다(#54) */
const LABEL = (r: number) => String(Math.round(2 * r / C.NIB_PX_PER_MM))

const strokeCount = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)

async function drawMouse(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay); await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(ax + (bx - ax) * i / 6, ay + (by - ay) * i / 6)
  await page.mouse.up(); await settle(page)
}

/** 크기통을 열고 한 단계를 고른다 — 화면의 길 그대로(직접 대입 ⛔) */
async function pickStep(page: Page, r: number, btn = '#btn-eraser-pencil') {
  if (!(await page.locator('#etray.open').count())) { await page.click(btn); await settle(page) }
  await page.click(`#${ROW_ID(r)}`)
  await settle(page)
}

/** 줄의 견본을 **렌더 px로** 잰다 — 원의 상자에서 선폭을 빼면 지름이다.
 *  ⚠ 속성(r)이 아니라 **화면에 그려진 크기**를 재는 것이 이 팔의 핵심이다: 옛 막대의
 *  동그라미는 속성 자체가 줄어 있었고, 어떤 배수가 CSS에서 얹혀도 여기서 걸린다. */
const sampleDia = (page: Page, r: number) => page.evaluate((id) => {
  const c = document.querySelector(`#${id} .esample`) as SVGCircleElement
  const svg = c.ownerSVGElement!
  return {
    dia: c.getBoundingClientRect().width,      // 크롬은 SVG 도형의 상자를 기하로 준다(선폭 밖)
    sw: Number(c.getAttribute('stroke-width')),
    attr: Number(c.getAttribute('r')),
    svgScale: svg.getBoundingClientRect().width / svg.viewBox.baseVal.width,
  }
}, ROW_ID(r))

test('34-3 ① 슬라이더가 사라졌다 · 네 단계 · 견본이 1:1이다 · 고르면 접힌다 (R1·R3)', async ({ page }) => {
  await boot(page)
  // 어떤 상태에서도 없다 — 도구 넷을 돌며 확인한다(옛 막대는 «지우개에만» 떴다)
  for (const btn of ['#btn-pencil', '#btn-pen', '#btn-eraser-pencil', '#btn-eraser-ink']) {
    await page.click(btn); await settle(page)
    expect(await page.locator('#thick').count(), `${btn} 상태에서 굵기 막대가 없다`).toBe(0)
  }

  await page.click('#btn-eraser-pencil'); await settle(page)
  expect(await page.locator('#etray.open').count(), '지우개를 누르면 크기통이 열린다').toBe(1)
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('#etray button')].map(e => ({
      id: (e as HTMLElement).id,
      px: Number((e as HTMLElement).dataset.eraserPx),
      mm: (e as HTMLElement).dataset.eraserMm,
    })))
  console.log(`[34-3 ①] 단계 ${rows.length} — ${rows.map(r => `${r.mm}mm=${r.px}px`).join(' · ')}`)
  expect(rows.map(r => r.px)).toEqual([...C.ERASER_R_PX])
  expect(rows.map(r => r.mm)).toEqual(C.ERASER_R_PX.map(LABEL))
  expect(new Set(rows.map(r => r.mm)).size, '표기가 서로 다르다').toBe(C.ERASER_R_PX.length)
  // **부팅 기본값이 계단 위에 있다** — 이 회차가 지우개의 크기를 안 바꿨다는 증거
  expect(rows.map(r => r.px)).toContain(C.ERASER_PX)

  for (const r of C.ERASER_R_PX) {
    const s = await sampleDia(page, r)
    console.log(`[34-3 ①] ${LABEL(r)}mm — 견본 지름 ${s.dia.toFixed(2)} px (요구 ${2 * r}) · svg 배수 ${s.svgScale.toFixed(3)}`)
    expect(s.svgScale, '줄의 svg에 배수가 안 걸린다(1:1)').toBeCloseTo(1, 3)
    // 선폭 하나(1 px) 안에서 같다 — 그 이상 벌어지면 «비율만 보이는 동그라미»다(⑤ ㉠이 그 값)
    expect(Math.abs(s.dia - 2 * r), '견본의 렌더 지름 == 그 단계의 지우개 지름').toBeLessThanOrEqual(s.sw)
  }

  // 고르면 접힌다(R3) — 네 단계 전부
  for (const r of C.ERASER_R_PX) {
    await pickStep(page, r)
    expect(await page.locator('#etray.open').count(), `${LABEL(r)}mm — 고르면 접힌다`).toBe(0)
    expect(await page.evaluate(() => (window as any).__b2.app.eraserRadius)).toBeCloseTo(r, 6)
    expect(await page.getAttribute(`#${ROW_ID(r)}`, 'class'), '고른 줄이 표시된다').toContain('on')
  }
})

test('34-3 ② 견본 == **실제로 지워지는 넓이** (네 단계를 실제로 지워서 잰다)', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)     // 지평선(작도 획 — 지우개가 못 지운다)
  await drawMouse(page, 400, 600, 700, 600)      // 내용 획 — 지울 대상
  const n0 = await strokeCount(page)
  expect(n0, '분해능 — 잴 획이 실제로 있다').toBe(2)

  /** (550, 600−d)를 찍으면 내용 획이 지워지는가 — 지워졌으면 되돌린다 */
  const erasedAt = async (d: number) => {
    await page.mouse.move(550, 600 - d); await page.mouse.down(); await page.mouse.up()
    await settle(page)
    const gone = (await strokeCount(page)) !== n0
    if (gone) { await page.click('#btn-undo'); await settle(page); expect(await strokeCount(page)).toBe(n0) }
    return gone
  }

  for (const r of C.ERASER_R_PX) {
    // 견본은 **통이 펼쳐진 동안** 잰다(접히면 줄이 화면에 없다) — 그 뒤에 고른다
    if (!(await page.locator('#etray.open').count())) { await page.click('#btn-eraser-pencil'); await settle(page) }
    const s = await sampleDia(page, r)
    await pickStep(page, r)
    expect(await erasedAt(0), `${LABEL(r)}mm — 획 위를 찍으면 지워진다(분해능)`).toBe(true)
    let lo = 0, hi = Math.max(...C.ERASER_R_PX) * 1.5
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2
      if (await erasedAt(mid)) lo = mid; else hi = mid
    }
    console.log(`[34-3 ②] ${LABEL(r)}mm — 실측 지워지는 반경 ∈ (${lo.toFixed(2)}, ${hi.toFixed(2)}) px`
      + ` · 견본 반지름 ${(s.dia / 2).toFixed(2)} px · 단계 ${r} px`)
    expect(lo, '실측 경계가 그 단계 안쪽').toBeLessThanOrEqual(r)
    expect(hi, '실측 경계가 그 단계 바깥쪽').toBeGreaterThanOrEqual(r)
    // 견본 == 실제 — 견본의 반지름이 **실측 경계 안**에 든다(±0.5 px 분해능)
    expect(s.dia / 2, '견본 반지름이 실제로 지워지는 반경과 같다').toBeGreaterThanOrEqual(lo - 0.5)
    expect(s.dia / 2).toBeLessThanOrEqual(hi + 0.5)
  }
})

/** 리본(#sidebar)의 모든 버튼 중심 — 통을 열기 전후로 **바뀌면 안 된다**(30-3 ①의 어법) */
const ribbonCenters = (page: Page) => page.evaluate(() => {
  const out: Record<string, [number, number]> = {}
  for (const b of document.querySelectorAll('#sidebar button, #sidebar summary')) {
    const el = b as HTMLElement
    if (el.closest('#tray, #pentray, #etray, [hidden]')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    out[el.id || (el.getAttribute('aria-label') ?? '?')] = [r.left + r.width / 2, r.top + r.height / 2]
  }
  return out
})

test('34-3 ③ 리본의 길이가 안 변한다 · 통끼리 서로 닫는다 · 아래쪽 앵커에서도 화면 안 (R2)', async ({ page }) => {
  await boot(page)
  const before = await ribbonCenters(page)
  expect(Object.keys(before).length, '분해능 — 리본에 버튼이 실제로 있다').toBeGreaterThan(8)

  for (const btn of ['#btn-eraser-pencil', '#btn-eraser-ink']) {
    await page.click(btn); await settle(page)
    const rows = await page.evaluate(() => [...document.querySelectorAll('#etray button')].map(e => {
      const r = (e as HTMLElement).getBoundingClientRect()
      return { id: (e as HTMLElement).id, x: r.left, y: r.top, w: r.width, h: r.height }
    }))
    expect(rows.length, '크기통이 실제로 펼쳐졌다').toBe(C.ERASER_R_PX.length)
    expect(rows.every(r => r.w > 0 && r.h > 0), '줄이 실제로 보인다').toBe(true)
    const after = await ribbonCenters(page)
    const moved = Object.keys(before).filter(k =>
      !after[k] || Math.abs(after[k]![0] - before[k]![0]) > 0.01 || Math.abs(after[k]![1] - before[k]![1]) > 0.01)
    console.log(`[34-3 ③] ${btn} — 줄 ${rows.length} · 움직인 버튼 ${moved.length} ${JSON.stringify(moved)}`)
    expect(moved, '리본 안의 무엇도 리본의 길이를 바꾸지 않는다').toEqual([])
    // 통이 세로바 **왼쪽**에 겹쳐 뜬다 — 화면 안이다
    const bar = (await page.locator('#sidebar').boundingBox())!
    const vp = page.viewportSize()!
    for (const r of rows) {
      expect(r.x, `${r.id} 왼쪽`).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w, `${r.id} 세로바 왼쪽`).toBeLessThanOrEqual(bar.x + 1)
      expect(r.y, `${r.id} 위쪽`).toBeGreaterThanOrEqual(0)
      expect(r.y + r.h, `${r.id} 아래쪽`).toBeLessThanOrEqual(vp.height)
    }
    await page.click(btn)   // 다시 누르면 접힌다
    await settle(page)
    expect(await page.locator('#etray.open').count(), '다시 누르면 접힌다').toBe(0)
  }

  // 통끼리 — 하나를 열면 앞의 통이 닫힌다(연필통·촉통과 같은 규약)
  await page.click('#btn-eraser-pencil'); await settle(page)
  await page.click('#btn-pencil'); await settle(page)
  expect(await page.locator('#etray.open').count(), '연필통을 열면 크기통이 닫힌다').toBe(0)
  expect(await page.locator('#tray.open').count()).toBe(1)
  await page.click('#btn-eraser-ink'); await settle(page)
  expect(await page.locator('#tray.open').count(), '크기통을 열면 연필통이 닫힌다').toBe(0)
  expect(await page.locator('#etray.open').count()).toBe(1)
  await page.click('#btn-pen'); await settle(page)
  expect(await page.locator('#etray.open').count(), '촉통을 열면 크기통이 닫힌다').toBe(0)
  expect(await page.locator('#pentray.open').count()).toBe(1)

  // 아래쪽 앵커에서 열어도 통이 화면 안이다(30-3 ②의 어법 — 가장 큰 줄이 지름 120 px다)
  await page.evaluate(() => {
    const b = document.getElementById('btn-eraser-pencil')!
    b.style.position = 'fixed'; b.style.right = '2px'; b.style.bottom = '0px'; b.style.top = 'auto'
  })
  await page.click('#btn-eraser-pencil'); await settle(page)
  const rows2 = await page.evaluate(() => [...document.querySelectorAll('#etray button')].map(e => {
    const r = (e as HTMLElement).getBoundingClientRect(); return { y: r.top, h: r.height }
  }))
  const lo = Math.min(...rows2.map(r => r.y)), hi = Math.max(...rows2.map(r => r.y + r.h))
  const vh = page.viewportSize()!.height
  console.log(`[34-3 ③] 아래쪽 앵커 — 통 세로 ${lo.toFixed(1)}..${hi.toFixed(1)} / 화면 ${vh}`)
  expect(lo).toBeGreaterThanOrEqual(0)
  expect(hi).toBeLessThanOrEqual(vh)
})

test('34-3 ④ 접힌 지우개가 지금 크기를 말한다 — 부팅·네 단계·연필 각인과 같은 대역 (R6)', async ({ page }) => {
  await boot(page)
  // ⓐ **부팅 상태**(도구가 연필)에서도 말한다 — 34-2가 구멍을 낸 바로 그 칸이다
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pencil')
  for (const id of ['fold-erase-pencil-text', 'fold-erase-ink-text']) {
    expect(await page.locator(`#${id}`).count(), `${id}가 있다`).toBe(1)
    expect(await page.locator(`#${id}`).textContent(), '부팅 초기 크기').toBe(LABEL(C.ERASER_PX))
  }

  // ⓑ 네 단계 왕복 — **접힌 지우개 둘 다** 그 값을 따라간다(크기는 둘이 나눠 쓰는 한 값)
  const seen: string[] = []
  for (const r of C.ERASER_R_PX) {
    await pickStep(page, r)
    const a = await page.locator('#fold-erase-pencil-text').textContent()
    const b = await page.locator('#fold-erase-ink-text').textContent()
    seen.push(`${r}px→${a}`)
    expect(a, `${r}px의 각인`).toBe(LABEL(r))
    expect(b, '두 지우개가 같은 값을 말한다').toBe(LABEL(r))
  }
  console.log(`[34-3 ④] 크기 각인 왕복 — ${seen.join(' · ')}`)
  expect(new Set(seen.map(s => s.split('→')[1])).size, '넷이 서로 다른 글자다').toBe(C.ERASER_R_PX.length)

  // ⓒ **읽히는가** — 글자의 렌더 높이가 연필 각인과 같은 대역인가(34-2가 세운 문턱).
  //   ⚠ `.tool.on svg`가 «고른» 도구를 1.14배로 키우므로 **연필도 지우개도 안 고른**
  //   상태에서 잰다(펜을 고른다). 트랜지션(.12s)이 끝나기를 기다린다 — 34-2가 중간값을
  //   실제로 잡았다(13.20 → 14.15).
  await page.click('#btn-pen')
  await page.waitForTimeout(250)
  await settle(page)
  const h = await page.evaluate(() => {
    const m = (id: string) => {
      const e = document.getElementById(id) as unknown as SVGTextElement
      const r = e.getBoundingClientRect(), b = e.getBBox()
      return { h: r.height, w: r.width, bw: b.width, on: (e.closest('button') as HTMLElement).classList.contains('on') }
    }
    return { pencil: m('fold-lead-text'), erase: m('fold-erase-pencil-text'), ink: m('fold-erase-ink-text') }
  })
  expect(h.pencil.on || h.erase.on || h.ink.on, '셋 다 «안 고른» 상태에서 잰다').toBe(false)
  console.log(`[34-3 ④] 각인 렌더(둘 다 비활성) — 연필 ${h.pencil.w.toFixed(2)}×${h.pencil.h.toFixed(2)} px · `
    + `지우개 ${h.erase.w.toFixed(2)}×${h.erase.h.toFixed(2)} px · 높이비 ${(h.erase.h / h.pencil.h).toFixed(3)} · `
    + `글자 상자 ${h.erase.bw.toFixed(2)} 사용자단위(창 6.6)`)
  expect(h.erase.h / h.pencil.h, '지우개 각인이 연필 각인과 같은 대역')
    .toBeGreaterThanOrEqual(C.FOLD_MARK_MIN_RATIO)
  expect(h.ink.h / h.pencil.h).toBeGreaterThanOrEqual(C.FOLD_MARK_MIN_RATIO)
  expect(h.erase.bw, '각인이 창 폭(6.6) 안에 든다').toBeLessThanOrEqual(6.6 + 1e-3)
})

test('34-3 ⑤ 반증 — 옛 «비율만» 견본 · 끊긴 배선이 전부 빨개진다 (D-3)', async ({ page }) => {
  await boot(page)

  // 반증 ㉠ **옛 «비율만» 견본**(막대의 동그라미 식 그대로 되돌린다).
  //   같은 검사(견본 지름 == 2r)에 걸리는지 값으로 낸다.
  await page.click('#btn-eraser-pencil'); await settle(page)   // 줄이 실제로 떠 있어야 잰다
  const ratio = await page.evaluate(([mn, mx]) => {
    const out: { px: number; old: number; want: number }[] = []
    for (const c of document.querySelectorAll('#etray .esample')) {
      const el = c as SVGCircleElement
      const r = Number(el.getAttribute('r'))
      const old = 4.5 + (r - mn!) / (mx! - mn!) * 12      // 옛 식(index.html 34-3 이전)
      el.setAttribute('r', String(old))
      out.push({ px: r, old, want: 2 * r })
    }
    return out
  }, [C.ERASER_MIN, C.ERASER_MAX] as const)
  const measured = await Promise.all(C.ERASER_R_PX.map(r => sampleDia(page, r)))
  const lines = ratio.map((x, i) => `${x.px}px → 견본 지름 ${measured[i]!.dia.toFixed(2)}(요구 ${x.want}) = ${(measured[i]!.dia / x.want * 100).toFixed(1)}%`)
  console.log(`[34-3 ⑤ ㉠] 옛 «비율만» 견본 — ${lines.join(' · ')}`)
  // ⚠ **네 칸 전부가 갈리지는 않는다** — 옛 식은 대역의 아래 끝에서 우연히 실제와 가깝다
  //   (2 mm 칸에서 0.57 px 차 · 선폭 1 안). 그래서 ①은 **한 칸으로 통과를 주장하지 않고**
  //   네 칸 전부를 요구한다(D-5) — 옛 식이면 그중 셋이 빨개진다.
  const broken = ratio.filter((x, i) => Math.abs(measured[i]!.dia - x.want) > measured[i]!.sw)
  console.log(`[34-3 ⑤ ㉠] ①의 견본 검사가 갈리는 칸 ${broken.length}/${ratio.length} — ${broken.map(b => `${b.px}px`).join(' · ')}`)
  expect(broken.length, '옛 식이면 ①이 빨개진다').toBeGreaterThanOrEqual(3)

  // 반증 ㉡ **끊긴 배선** — 요소는 그대로 두고 main.ts가 쥔 참조만 떼어낸다.
  //   「글자를 하나 그려 놓기만 해도 통과한다」를 막는 자리다(34-2 ㉡과 같은 수).
  await page.reload(); await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => {
    for (const id of ['fold-erase-pencil-text', 'fold-erase-ink-text']) {
      const t = document.getElementById(id)!
      t.replaceWith(t.cloneNode(true))     // 같은 그림 · 끊긴 참조
    }
  })
  const cut: string[] = []
  for (const r of C.ERASER_R_PX) {
    await pickStep(page, r)
    cut.push(`${r}px→${await page.locator('#fold-erase-pencil-text').textContent()}`)
  }
  const distinct = new Set(cut.map(s => s.split('→')[1])).size
  console.log(`[34-3 ⑤ ㉡] 끊긴 배선 — ${cut.join(' · ')} → 서로 다른 글자 ${distinct}가지(요구 ${C.ERASER_R_PX.length})`)
  expect(distinct, '④의 왕복이 갈린다').toBeLessThan(C.ERASER_R_PX.length)
})
