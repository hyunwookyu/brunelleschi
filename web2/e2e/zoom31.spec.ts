// web2-31 3번 — 돋보기가 **브라우저에서** 실제로 도는가.
//
// 단위 팔(`test/zoom31.test.ts`)이 기하를 전부 잰다. 여기가 더하는 것은 넷이다:
//   ① 단추가 **그려지고** 그 자리가 **실제로 눌린다** — ⚠⚠ 「그려졌는가」만 재지 않는다:
//      31-1의 초판이 정확히 거기 걸렸다(픽셀은 넷 다 있었는데 누르면 남의 것이었다).
//      판정은 `elementFromPoint`이고 **dpr 1·2 둘 다** 낸다(#87 ㉠·㉤).
//   ② 궤도 뒤에 누르면 대상이 화면에 차고 **여백이 10% ± 3%** — 화면에서 다시 잰다
//      (`diag.projectAll()` + `app.view` — 제품의 맞춤 코드와 **다른 경로**로 재derive한다)
//   ③ 렌즈 값이 안 변한다 — `an.f` · `an.fSource`가 전후 같다
//   ④ 아무것도 없을 때 눌러도 안 깨진다(콘솔 오류 0 · 상태 무변 · 그 뒤로도 그려진다)
//   ⑤ 자리 — 세로바가 화면 안이고 남는 여유가 0 이상. ⚠ **여유 px를 여기 적지 않는다**
//      (#88 — 34-6이 남긴 여유에서 유도한다: 실측 상자에서 그 자리에 뺀다)
//
// ⚠ 조건(#71): 뷰포트 1200×800 · dpr 둘 다(playwright.config의 두 판이 그대로 돈다).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../stage0/out')

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 2점 작도 + 기둥 — 3D 기하가 있어야 돋보기에 대상이 있다 */
async function construct(page: Page) {
  await boot(page)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 500, 380, 600, 362)
  const an = await page.evaluate(() => {
    const a = (window as any).__b2.app.lift.an
    return { vps: a.vps.length, done: a.constructionDone, lifted: (window as any).__b2.app.lift.lifted.size }
  })
  expect(an.vps, '소실점 둘 — 2점 구도').toBe(2)
  expect(an.done).toBe(true)
  expect(an.lifted).toBeGreaterThan(2)
  return an
}

/** **화면에서 다시 잰 여백** — 제품의 맞춤 코드가 아니라 «지금 그려지는 자리»에서 유도한다.
 *  `diag.projectAll()`(승격 획의 현재 포즈 재사영) + `app.view`가 곧 화면 좌표다. */
const marginNow = (page: Page) => page.evaluate(() => {
  const b2 = (window as any).__b2
  const pr = b2.diag.projectAll() as Record<string, { a: { x: number; y: number }; b: { x: number; y: number } } | null>
  const v = b2.app.view
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0, missing = 0
  for (const k of Object.keys(pr)) {
    const e = pr[k]
    if (!e) { missing++; continue }
    for (const p of [e.a, e.b]) {
      const sx = p.x * v.s + v.ox, sy = p.y * v.s + v.oy
      if (sx < x0) x0 = sx
      if (sx > x1) x1 = sx
      if (sy < y0) y0 = sy
      if (sy > y1) y1 = sy
      n++
    }
  }
  const W = window.innerWidth, H = window.innerHeight
  const mx = Math.min(x0, W - x1) / W, my = Math.min(y0, H - y1) / H
  return {
    n, missing, W, H,
    mx: +mx.toFixed(6), my: +my.toFixed(6), min: +Math.min(mx, my).toFixed(6),
    inside: x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H,
    box: { x0: +x0.toFixed(1), x1: +x1.toFixed(1), y0: +y0.toFixed(1), y1: +y1.toFixed(1) },
  }
})

/** ⚠ **dpr 축이 실제로 돌았는가를 값으로 남긴다**(리뷰어 [9] · #21) — 프로젝트 «이름»만으로는
 *  「둘 다 돌렸다」가 안 선다. CSS px 값이 dpr에 안 변하는 것은 **맞는 결과**이고, 그것이
 *  맞는 결과이려면 **배율이 실제로 달랐다**는 값이 같이 있어야 한다. */
const dprNow = (page: Page) => page.evaluate(() => {
  const c = document.getElementById('ink') as HTMLCanvasElement
  const r = c.getBoundingClientRect()
  return {
    device_pixel_ratio: window.devicePixelRatio,
    ink_backing_px: { w: c.width, h: c.height },        // dpr 배 — **여기가 dpr에 반응한다**
    ink_css_px: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    backing_over_css: +(c.width / Math.max(1, r.width)).toFixed(3),
  }
})

const camState = (page: Page) => page.evaluate(() => {
  const app = (window as any).__b2.app
  return {
    f: app.lift.an.f, fSource: app.lift.an.fSource,
    principal: app.lift.an.principal,
    pose: { p: { ...app.pose.p }, q: { ...app.pose.q } },
    view: { ...app.view },
  }
})

const dist = (a: { x: number; y: number; z: number }, b: typeof a) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

// 원장은 한 파일 안에서 모았다가 마지막 팔이 쓴다(한 파일은 한 워커에서 차례로 돈다)
const ledger: Record<string, unknown> = {}

test('31-3 ① 돋보기 단추 — 그려지고, 그 자리가 실제로 눌린다 (elementFromPoint)', async ({ page }, testInfo) => {
  await boot(page)
  // 그려졌는가 — DOM 아이콘이므로 «그림이 있는가»는 svg의 실제 렌더 상자와 자식으로 잰다
  const drawn = await page.evaluate(() => {
    const b = document.getElementById('btn-zoom-fit')!
    const svg = b.querySelector('svg')!
    const r = svg.getBoundingClientRect(), br = b.getBoundingClientRect()
    return {
      svg_w: +r.width.toFixed(2), svg_h: +r.height.toFixed(2),
      btn_w: +br.width.toFixed(2), btn_h: +br.height.toFixed(2),
      shapes: [...svg.children].map(e => e.tagName),
      viewBox: svg.getAttribute('viewBox'),
      stroke: svg.getAttribute('stroke'), fill: svg.getAttribute('fill'),
      title: b.getAttribute('title'), aria: b.getAttribute('aria-label'),
      cls: b.className,
    }
  })
  // `docs/instrument-icons.md` 「돋보기」 정본 — 렌즈 원 + 손잡이, 선 문법
  expect(drawn.shapes).toEqual(['circle', 'path'])
  expect(drawn.viewBox).toBe('0 0 32 32')
  expect(drawn.stroke).toBe('currentColor')
  expect(drawn.fill).toBe('none')
  expect(drawn.cls).toContain('ico-m')          // 시점 묶음과 같은 급(34-6의 여유가 그 급이다)
  expect(drawn.svg_h).toBeGreaterThan(20)
  // 손가락 표적 — 실기기에서 통과한 하한(30px)
  expect(drawn.btn_w).toBeGreaterThanOrEqual(30)
  expect(drawn.btn_h).toBeGreaterThanOrEqual(30)

  // ⚠⚠ **눌리는가** — 31-1 초판이 걸린 자리(#87). 다섯 점을 짚는다: 가운데 + 네 귀퉁이 안쪽.
  const hits = await page.evaluate(() => {
    const b = document.getElementById('btn-zoom-fit')!
    const r = b.getBoundingClientRect()
    const pts: [string, number, number][] = [
      ['가운데', r.x + r.width / 2, r.y + r.height / 2],
      ['좌상', r.x + r.width * 0.25, r.y + r.height * 0.25],
      ['우상', r.x + r.width * 0.75, r.y + r.height * 0.25],
      ['좌하', r.x + r.width * 0.25, r.y + r.height * 0.75],
      ['우하', r.x + r.width * 0.75, r.y + r.height * 0.75],
    ]
    return pts.map(([nm, x, y]) => {
      const top = document.elementFromPoint(x, y)
      return {
        at: nm, x: +x.toFixed(1), y: +y.toFixed(1),
        got: top ? ((top as HTMLElement).id || top.tagName) : 'null',
        mine: !!top && (b === top || b.contains(top)),
      }
    })
  })
  for (const h of hits) console.log(`[31-3 ①] ${h.at} (${h.x},${h.y}) → ${h.got} · 내 것 ${h.mine}`)
  expect(hits.filter(h => !h.mine), '다섯 점 전부 돋보기 단추가 받는다').toEqual([])

  ledger[`button_${testInfo.project.name}`] = { drawn, element_from_point: hits }
})

test('31-3 ②③ 궤도 뒤에 누르면 채워진다 — 여백 10%±3% · 렌즈 불변 · 카메라만 움직인다', async ({ page }, testInfo) => {
  await construct(page)
  // 좌우로만 돈다(정렬을 유지한다 — flow.spec과 같은 손짓). 80px = framable 대역이다.
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(680, 400, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect(await page.evaluate(() => {
    const app = (window as any).__b2.app
    return Math.abs(app.pose.p.x) + Math.abs(app.pose.p.z) > 1e-9   // 작도 시점을 떠났다
  }), '궤도 뒤 — 작도 시점이 아니다').toBe(true)

  const before = await camState(page)
  const mBefore = await marginNow(page)
  await page.click('#btn-zoom-fit')
  await settle(page)
  const after = await camState(page)
  const mAfter = await marginNow(page)

  console.log(`[31-3 ②] 여백 ${(mBefore.min * 100).toFixed(2)}% → ${(mAfter.min * 100).toFixed(2)}% (x ${(mAfter.mx * 100).toFixed(2)}% · y ${(mAfter.my * 100).toFixed(2)}%) · 화면 안 ${mAfter.inside}`)
  console.log(`[31-3 ③] f ${before.f} → ${after.f} · fSource ${before.fSource} → ${after.fSource} · view.s ${before.view.s} → ${after.view.s} · 카메라 이동 ${dist(before.pose.p, after.pose.p).toFixed(3)}`)

  expect(mAfter.missing, '뒤로 넘어간 획이 없다').toBe(0)
  expect(mAfter.inside, '대상이 전부 화면 안').toBe(true)
  expect(Math.abs(mAfter.min - 0.10), '좁은 축 여백 10% ± 3%').toBeLessThanOrEqual(0.03)
  // ③ 렌즈 값이 안 변한다 — 그리고 **화면 배율도** 안 건드린다(카메라 갈래)
  expect(after.f).toBe(before.f)
  expect(after.fSource).toBe(before.fSource)
  expect(after.principal).toEqual(before.principal)
  expect(after.view).toEqual(before.view)
  // 자세는 그대로이고 위치만 움직였다 — 「이동만 한다」
  expect(after.pose.q).toEqual(before.pose.q)
  expect(dist(before.pose.p, after.pose.p), '카메라가 실제로 움직였다').toBeGreaterThan(1e-6)

  ledger[`orbited_${testInfo.project.name}`] = {
    /** 값 대조의 자리(#40) — `gate.reachability_source`가 이 경로를 가리킨다 */
    margin_before_after: [mBefore.min, mAfter.min],
    margin_before: { min: mBefore.min, inside: mBefore.inside },
    margin_after: { min: mAfter.min, mx: mAfter.mx, my: mAfter.my, inside: mAfter.inside, box: mAfter.box },
    lens: { f_before: before.f, f_after: after.f, fSource_before: before.fSource, fSource_after: after.fSource },
    view_before: before.view, view_after: after.view,
    camera_moved: +dist(before.pose.p, after.pose.p).toFixed(6),
    q_unchanged: JSON.stringify(before.pose.q) === JSON.stringify(after.pose.q),
  }
})

test('31-3 ② 작도 시점에서 누르면 화면이 움직인다 — 카메라는 그대로', async ({ page }, testInfo) => {
  await construct(page)
  const before = await camState(page)
  await page.click('#btn-zoom-fit')
  await settle(page)
  const after = await camState(page)
  const m = await marginNow(page)
  console.log(`[31-3 ②'] 작도 시점 — view.s ${before.view.s} → ${after.view.s.toFixed(6)} · 여백 ${(m.min * 100).toFixed(2)}% · 카메라 이동 ${dist(before.pose.p, after.pose.p).toFixed(6)}`)
  expect(m.inside).toBe(true)
  expect(Math.abs(m.min - 0.10)).toBeLessThanOrEqual(0.03)
  expect(after.f).toBe(before.f)                       // 렌즈는 그대로
  expect(after.fSource).toBe(before.fSource)
  expect(after.pose).toEqual(before.pose)              // 카메라는 한 톨도 안 움직인다
  expect(after.view.s).not.toBe(before.view.s)
  ledger[`draw_pose_${testInfo.project.name}`] = {
    view_before: before.view, view_after: { s: +after.view.s.toFixed(6), ox: +after.view.ox.toFixed(3), oy: +after.view.oy.toFixed(3) },
    pose_unchanged: JSON.stringify(before.pose) === JSON.stringify(after.pose),
    lens: { f_before: before.f, f_after: after.f },
    margin: { min: m.min, mx: m.mx, my: m.my, inside: m.inside },
  }
})

test('31-3 ④ 아무것도 없을 때 눌러도 안 깨진다', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await boot(page)
  const before = await camState(page)
  await page.click('#btn-zoom-fit')
  await page.click('#btn-zoom-fit')          // 두 번 눌러도
  await settle(page)
  const after = await camState(page)
  expect(after.pose).toEqual(before.pose)
  expect(after.view).toEqual(before.view)
  // 그리고 그 뒤로도 정상이다 — 지평선을 긋고(아직 3D 0) 다시 눌러도 무동작
  await drawLine(page, 100, 400, 1100, 400)
  const lifted0 = await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)
  await page.click('#btn-zoom-fit')
  await settle(page)
  const mid = await camState(page)
  expect(mid.pose).toEqual(before.pose)
  // 이어서 그리면 여전히 3D가 선다(눌러 놓은 것이 아무것도 안 망가뜨렸다)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)
  const lifted1 = await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)
  console.log(`[31-3 ④] 빈 문서에서 두 번 · 작도 획만 있을 때 한 번 눌렀다 — 오류 ${errors.length} · 승격 ${lifted0} → ${lifted1}`)
  expect(errors, '콘솔·페이지 오류가 없다').toEqual([])
  expect(lifted0).toBe(0)
  expect(lifted1).toBeGreaterThan(0)
  ledger[`empty_${testInfo.project.name}`] = {
    clicks_on_empty: 2, clicks_on_construction_only: 1,
    errors: errors.length, pose_unchanged: true, view_unchanged: true,
    lifted_before: lifted0, lifted_after: lifted1,
  }
})

test('31-3 ⑤ 자리 — 34-6이 남긴 여유 안이다 (여유는 실측에서 유도한다)', async ({ page }, testInfo) => {
  await boot(page)
  // ⚠ #88 — 「여유 105px」·「버튼 45px」를 여기 옮겨 적지 않는다. 상자에서 그 자리에 뺀다.
  const place = await page.evaluate(() => {
    const bar = document.getElementById('sidebar')!.getBoundingClientRect()
    const zoom = document.getElementById('btn-zoom-fit')!.getBoundingClientRect()
    const view = document.getElementById('btn-draw-view')!.getBoundingClientRect()
    const body = document.getElementById('sidebar-body')!
    const gap = parseFloat(getComputedStyle(body).rowGap) || 0
    return {
      vh: window.innerHeight,
      bar: { top: +bar.top.toFixed(1), h: +bar.height.toFixed(1), bottom: +bar.bottom.toFixed(1) },
      slack: +(window.innerHeight - bar.bottom).toFixed(1),
      zoom: { w: +zoom.width.toFixed(1), h: +zoom.height.toFixed(1), y: +zoom.y.toFixed(1) },
      draw_view: { w: +view.width.toFixed(1), h: +view.height.toFixed(1), y: +view.y.toFixed(1) },
      row_gap: gap,
      // **이 단추가 먹은 자리** — 그 자체의 높이 + 사이 여백. 상수가 아니라 실측이다.
      taken: +(zoom.height + gap).toFixed(1),
      order: [...document.querySelectorAll('#sidebar-body > button, #sidebar-body > details')].map(e => e.id),
    }
  })
  console.log(`[31-3 ⑤] 세로바 ${place.bar.h}px / 뷰포트 ${place.vh} — 남는 여유 ${place.slack}px · 돋보기가 먹은 자리 ${place.taken}px`)
  console.log(`[31-3 ⑤] 손 띠 순서: ${place.order.join(' · ')}`)
  // dpr 축이 실제로 돌았다는 값 — 이름이 아니라 수로 남긴다(#21 · 리뷰어 [9])
  const dpr = await dprNow(page)
  console.log(`[31-3 dpr] devicePixelRatio ${dpr.device_pixel_ratio} · 캔버스 뒷면 ${dpr.ink_backing_px.w}×${dpr.ink_backing_px.h} / CSS ${dpr.ink_css_px.w}×${dpr.ink_css_px.h} → 배수 ${dpr.backing_over_css}`)
  expect(dpr.backing_over_css, 'dpr이 실제로 캔버스 뒷면에 실렸다')
    .toBeCloseTo(testInfo.project.name === 'dpr2' ? 2 : 1, 2)
  ledger[`dpr_${testInfo.project.name}`] = dpr
  expect(place.bar.bottom, '세로바가 화면 안이다').toBeLessThanOrEqual(place.vh)
  expect(place.slack, '남는 여유가 0 이상').toBeGreaterThanOrEqual(0)
  // 자리는 시점 묶음 안 — 「작도 시점으로」 **바로 아래**다
  expect(place.order[0]).toBe('btn-draw-view')
  expect(place.order[1]).toBe('btn-zoom-fit')
  expect(place.zoom.y).toBeGreaterThan(place.draw_view.y)
  // 급이 이웃과 같다(.ico-m) — 34-6이 셈에 넣은 급이다
  expect(place.zoom.h).toBeCloseTo(place.draw_view.h, 1)
  ledger[`place_${testInfo.project.name}`] = place

  // 이 파일의 마지막 팔이 원장을 쓴다
  if (process.env.LEDGER === '1') {
    const dpr = testInfo.project.name
    mkdirSync(OUT, { recursive: true })
    writeFileSync(resolve(OUT, `zoom31_web2_${dpr}.json`), JSON.stringify({
      what: 'web2-31 3번 — 돋보기가 브라우저에서 실제로 눌리고 채우는가. 기하는 단위 팔(stage0/out/zoom31_web2.json)이 잰다.',
      canonical_command: `LEDGER=1 npx playwright test e2e/zoom31.spec.ts --project=${dpr}`,
      viewport: { w: 1200, h: place.vh }, dpr,
      note_rederive: '여백은 제품의 맞춤 코드가 아니라 `diag.projectAll()` + `app.view`로 **다시 유도**한 값이다 — 재는 자와 맞추는 자가 갈려 있다.',
      note_dpr: (
        '⚠ CSS px 값(자리·여백·elementFromPoint)이 dpr 1·2에서 **글자 그대로 같다** — 그것이 맞는 '
        + '결과다(CSS 좌표계는 dpr과 무관하다). 다만 그 사실이 「dpr 축을 잰다」가 되려면 **배율이 '
        + '실제로 달랐다**는 값이 있어야 하므로 `dpr_*`에 `devicePixelRatio`와 캔버스 뒷면 배수를 '
        + '함께 남긴다(리뷰어 [9] · #21). 이 회차에서 dpr에 실제로 반응하는 것은 캔버스 뒷면 픽셀이다.'
      ),
      note_88: '여유·예약 px를 이 파일에 상수로 안 적는다 — `#sidebar`의 실측 상자에서 그 자리에 뺀다(#88).',
      ...ledger,
      gate: {
        for: 'web2-31 3번 — 단추가 눌린다 · 여백 10%±3% · 렌즈 불변 · 빈 상태 무동작 · 자리가 여유 안',
        registered: [
          '돋보기 단추의 다섯 점이 전부 `elementFromPoint`에서 제 것을 낸다(#87)',
          '궤도 뒤에 누르면 대상이 전부 화면 안이고 좁은 축의 여백이 10% ± 3%',
          '렌즈(f·fSource·주점)와 화면 배율이 안 변한다 — 카메라 위치만 움직인다',
          '작도 시점에서는 반대다 — 화면(뷰 오프셋)만 움직이고 카메라가 그대로다',
          '빈 문서·작도 획만 있는 문서에서 눌러도 오류 0 · 상태 무변 · 이후 승격 정상',
          '세로바가 화면 안이고 남는 여유가 0 이상 · 자리는 「작도 시점으로」 바로 아래',
        ],
        reachability: (
          '**「그려졌는가」와 「눌리는가」가 갈린다**(#87 — 31-1의 초판이 그 사이에서 죽었다). '
          + '이 팔의 ①은 픽셀이 아니라 `elementFromPoint`를 문으로 쓰므로, 단추가 남의 요소 뒤로 '
          + '깔리면 그림이 멀쩡해도 빨개진다. 그리고 ②의 여백은 **맞춤 코드와 다른 경로**로 '
          + '유도하므로 맞춤이 틀리면 그대로 드러난다 — 단위 팔의 반증 두 판이 그 문의 판별력이다 '
          + '(`zoom31_web2.json`의 `falsify_a_no_margin` · `falsify_b_lens`).'
        ),
        reachability_value: (ledger[`orbited_${dpr}`] as { margin_before_after: number[] }).margin_before_after,
        reachability_source: `orbited_${dpr}/margin_before_after`,
      },
      selfcheck_flags_known: {
        device_pixel_ratio: (
          `⚠ 이 판의 \`dpr_${dpr}.device_pixel_ratio\`는 ${dpr === 'dpr2' ? 2 : 1}이고, dpr1 판에서는 그것이 `
          + '「정확히 1」로 selfcheck에 잡힌다 — **그 판의 정의다**. 이 필드가 재는 것은 「값이 1이 아니다」가 '
          + '아니라 **「두 판의 배율이 실제로 갈렸다」**이고, 대조 상대는 짝 원장(1 ↔ 2)과 '
          + '캔버스 뒷면 배수(1.000 ↔ 2.000)다.'
        ),
        errors_zero: (
          '⚠ `empty_*.errors = 0`은 콘솔·페이지 오류 **개수**이고 0이 곧 통과 조건이다(임계를 따로 안 건다). '
          + '0이 아니면 그 칸이 빨개진다.'
        ),
        constants_snapshot_absent: (
          '⚠ 상수·지표 스냅샷이 없다 — **web2 라인 전체의 구멍**이고 이 원장만의 것이 아니다'
          + '(그 기계는 `web/test/constants.ts`에만 있다). 상수는 단위 원장 `zoom31_web2.json`의 `constants` 블록이 든다.'
        ),
      },
      pitfalls: ['#88', '#87', '#71', '#42', '#21'],
    }, null, 1) + '\n')
  }
})
