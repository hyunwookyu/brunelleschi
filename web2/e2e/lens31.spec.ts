// web2-31 2번 — **보기 렌즈: 화면에서 재는 다섯.**
//
// 단위 팔(`test/lens31.test.ts`)이 재는 것은 «셈»이고 여기서 재는 것은 «화면»이다:
// 손잡이가 어느 자리에 있고 · 확정 전에 꺼져 있고 · 팝오버가 가려지지 않고(#87) ·
// 슬라이더가 **그림을 실제로 움직이고** · 그러는 동안 3D 좌표와 `Camera.f`·`fSource`가
// 그대로이고 · **`fSource`가 화면에 안 나온다**(2026-08-17 지시 3 · D-L55).
//
// ⚠ 화면 자리는 `diag.lens().xf`(합성된 문서 → 화면)로 편다 — 팔이 `app.view`를 손으로
//   펴면 렌즈를 안 타고, 그러면 「그림이 움직였나」를 **못 본다**(#54).
//
// 원장: LEDGER=1 npx playwright test e2e/lens31.spec.ts → stage0/out/lens31_web2_dpr*.json

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../stage0/out')
const r6 = (x: number) => Number(x.toFixed(6))

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

/** 2점 작도 + 기둥 — `zoom31.spec`의 그 구도(같은 장면을 두 팔이 쓴다) */
async function construct(page: Page) {
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 500, 380, 600, 362)
  const an = await page.evaluate(() => {
    const a = (window as any).__b2.app.lift.an
    return { vps: a.vps.length, done: a.constructionDone, lifted: (window as any).__b2.app.lift.lifted.size }
  })
  expect(an.vps).toBe(2)
  expect(an.done).toBe(true)
  expect(an.lifted).toBeGreaterThan(2)
  return an
}

/** **지금 그려지는 자리** — 승격 획을 현재 포즈로 재사영하고 «합성된» 변환으로 편다. */
const shotNow = (page: Page) => page.evaluate(() => {
  const b2 = (window as any).__b2
  const pr = b2.diag.projectAll() as Record<string, { a: { x: number; y: number }; b: { x: number; y: number } } | null>
  const v = b2.diag.lens().xf
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0
  const pts: number[][] = []
  for (const k of Object.keys(pr).sort()) {
    const e = pr[k]
    if (!e) continue
    for (const p of [e.a, e.b]) {
      const sx = p.x * v.s + v.ox, sy = p.y * v.s + v.oy
      pts.push([sx, sy])
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx
      if (sy < y0) y0 = sy; if (sy > y1) y1 = sy
      n++
    }
  }
  const segs = b2.app.lift.lifted as Map<number, { a3: any; b3: any; axis: string | null }>
  const coords = [...segs.entries()].sort((a, b) => a[0] - b[0])
    .map(([id, g]) => [id, g.a3.x, g.a3.y, g.a3.z, g.b3.x, g.b3.y, g.b3.z, g.axis])
  return {
    n, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, pts,
    lens: b2.diag.lens(), f: b2.app.lift.an.f, fSource: b2.app.lift.an.fSource,
    coords: JSON.stringify(coords),
  }
})

const ledger: Record<string, unknown> = {}

test('31-2 ① 자리와 급 — 손 띠의 시점 묶음 · 돋보기 바로 아래 · 이웃과 같은 대역', async ({ page }) => {
  await boot(page)
  const place = await page.evaluate(() => {
    const body = document.getElementById('sidebar-body')!
    const ids = [...body.children].map(e => e.id).filter(Boolean)
    const b = document.getElementById('btn-lens')!
    const z = document.getElementById('btn-zoom-fit')!
    const rb = b.getBoundingClientRect(), rz = z.getBoundingClientRect()
    return {
      order: ids, parentIsBody: b.parentElement === body,
      afterZoom: ids.indexOf('btn-lens') === ids.indexOf('btn-zoom-fit') + 1,
      box: { w: +rb.width.toFixed(1), h: +rb.height.toFixed(1) },
      zoomBox: { w: +rz.width.toFixed(1), h: +rz.height.toFixed(1) },
      svgH: +(b.querySelector('svg')!.getBoundingClientRect().height.toFixed(1)),
      right: +(window.innerWidth - rb.right).toFixed(1),
      zoomRight: +(window.innerWidth - rz.right).toFixed(1),
      barBottomSlack: +(window.innerHeight - document.getElementById('sidebar')!.getBoundingClientRect().bottom).toFixed(1),
    }
  })
  console.log(`[31-2 ①] 손 띠: ${place.order.join(' · ')}`)
  console.log(`[31-2 ①] #btn-lens ${place.box.w}×${place.box.h} (돋보기 ${place.zoomBox.w}×${place.zoomBox.h}) · `
    + `svg ${place.svgH}px · 오른쪽 ${place.right}px · 띠 아래 여유 ${place.barBottomSlack}px`)
  expect(place.parentIsBody, '손 띠의 직계다').toBe(true)
  expect(place.afterZoom, '돋보기 바로 아래 — 시점 묶음 안이다').toBe(true)
  expect(place.box).toEqual(place.zoomBox)          // 이웃과 **같은 급**(`.ico-m`)
  expect(place.right).toBe(place.zoomRight)         // 오른쪽 정렬 규칙(세로바 한 규칙)
  expect(place.box.w).toBeGreaterThanOrEqual(30)    // 손가락 표적(28-4 ④와 같은 하한)
  expect(place.box.h).toBeGreaterThanOrEqual(30)
  expect(place.svgH).toBeGreaterThanOrEqual(27)     // 아이콘 크기 대역(sidebar.spec ①)
  expect(place.barBottomSlack, '띠가 화면 안이다').toBeGreaterThanOrEqual(0)
  ledger['place'] = place
})

test('31-2 ② 확정 전에는 꺼져 있다 — 눌러도 안 열린다 (+확정 뒤에는 열린다)', async ({ page }) => {
  await boot(page)
  const before = await page.evaluate(() => ({
    disabled: (document.getElementById('btn-lens') as HTMLButtonElement).disabled,
    done: (window as any).__b2.app.lift.an.constructionDone,
    allowed: (window as any).__b2.diag.lens().allowed,
    read: document.getElementById('lens-read')!.textContent,
  }))
  expect(before.done).toBe(false)
  expect(before.disabled, '확정 전에는 꺼져 있다').toBe(true)
  expect(before.allowed).toBe(false)
  // 눌러도 안 열린다(disabled라 click이 안 간다 — force로 눌러도 마찬가지여야 한다)
  await page.click('#btn-lens', { force: true }).catch(() => {})
  expect(await page.locator('#lens-pop').isVisible()).toBe(false)

  await construct(page)
  const after = await page.evaluate(() => ({
    disabled: (document.getElementById('btn-lens') as HTMLButtonElement).disabled,
    allowed: (window as any).__b2.diag.lens().allowed,
    read: document.getElementById('lens-read')!.textContent,
  }))
  expect(after.disabled, '확정 뒤에는 켜진다').toBe(false)
  expect(after.allowed).toBe(true)
  expect(after.read).toMatch(/화각 [\d.]+°/)
  expect(after.read).toContain('기본')
  await page.click('#btn-lens')
  expect(await page.locator('#lens-pop').isVisible()).toBe(true)
  console.log(`[31-2 ②] 확정 전 disabled ${before.disabled} → 뒤 ${after.disabled} · 읽음 「${after.read}」`)
  ledger['lock'] = { before, after }
})

test('31-2 ③ 팝오버가 안 깔린다 — `#app`의 직계 · 그 자리의 elementFromPoint가 제 것 (#87)', async ({ page }) => {
  await boot(page)
  await construct(page)
  await page.click('#btn-lens')
  await settle(page)
  const z = await page.evaluate(() => {
    const pop = document.getElementById('lens-pop')!
    const r = pop.getBoundingClientRect()
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    const dim = document.getElementById('dimpanel')
    const rd = dim?.getBoundingClientRect()
    const overlap = rd ? Math.max(0, Math.min(r.right, rd.right) - Math.max(r.left, rd.left))
      * Math.max(0, Math.min(r.bottom, rd.bottom) - Math.max(r.top, rd.top)) : 0
    return {
      parent: pop.parentElement?.id ?? null,
      box: { x: +r.left.toFixed(0), y: +r.top.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0) },
      hitId: hit?.id ?? hit?.tagName ?? null, mine: !!hit && pop.contains(hit),
      overlapWithDimPanel: overlap, inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
    }
  })
  console.log(`[31-2 ③] #lens-pop 부모 #${z.parent} · ${z.box.x},${z.box.y} ${z.box.w}×${z.box.h} → ${z.hitId} · 내 것 ${z.mine}`)
  expect(z.parent, '`#app`의 직계다 — 세로바 안에 두면 쌓임 맥락이 삼킨다(#87)').toBe('app')
  expect(z.mine, '그 자리를 누르면 내 것이 나온다').toBe(true)
  expect(z.inViewport).toBe(true)
  // R7 — 바깥(캔버스)을 누르면 접힌다
  await page.mouse.click(300, 700)
  await settle(page)
  expect(await page.locator('#lens-pop').isVisible(), 'R7 — 바깥 누름에 접힌다').toBe(false)
  ledger['pop'] = z
})

test('31-2 ④⑤ 슬라이더가 그림을 움직인다 — 그동안 3D 좌표·f·fSource는 그대로 · 「기본으로」가 되돌린다', async ({ page }, testInfo) => {
  await boot(page)
  await construct(page)
  const base = await shotNow(page)
  expect(base.n).toBeGreaterThan(4)
  await page.click('#btn-lens')

  const rows: Record<string, unknown>[] = []
  for (const stops of [-1, 1]) {
    await page.evaluate((v) => {
      const el = document.getElementById('lens-range') as HTMLInputElement
      el.value = String(v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, stops)
    await settle(page)
    const now = await shotNow(page)
    const drift = Math.max(...now.pts.map((p, i) => Math.hypot(p[0]! - base.pts[i]![0]!, p[1]! - base.pts[i]![1]!)))
    rows.push({
      stops, k: r6(now.lens.k), hfov_deg: r6(now.lens.hfov!),
      width_fold: r6(now.w / base.w), max_screen_drift_px: r6(drift),
      read: await page.textContent('#lens-read'),
      f_unchanged: now.f === base.f, fSource: now.fSource,
      coords_unchanged: now.coords === base.coords,
    })
    // 그림이 실제로 움직였다
    expect(r6(now.lens.k)).toBe(r6(Math.pow(2, stops)))
    expect(drift, `stops ${stops} — 화면이 움직여야 한다`).toBeGreaterThan(1)
    expect(r6(now.w / base.w), '가로 폭이 배율만큼').toBeCloseTo(Math.pow(2, stops), 3)
    // **해와 3D는 그대로다** — 좌표 전수 비교(문자열 하나로 접었다)
    expect(now.f).toBe(base.f)
    expect(now.fSource).toBe(base.fSource)
    expect(now.coords).toBe(base.coords)
  }
  // 「기본으로」 — 처음 자리로 정확히 돌아온다
  await page.click('#btn-lens-reset')
  await settle(page)
  const back = await shotNow(page)
  const backDrift = Math.max(...back.pts.map((p, i) => Math.hypot(p[0]! - base.pts[i]![0]!, p[1]! - base.pts[i]![1]!)))
  expect(back.lens.viewF).toBe(null)
  expect(back.lens.k).toBe(1)
  expect(backDrift).toBeLessThan(1e-6)
  expect(back.coords).toBe(base.coords)
  console.log(`[31-2 ④] ${rows.map(r => `stops ${r.stops} → k ${r.k} · 화각 ${r.hfov_deg}° · 화면 ${r.max_screen_drift_px}px · 좌표 불변 ${r.coords_unchanged}`).join(' | ')}`)
  console.log(`[31-2 ⑤] 「기본으로」 → k ${back.lens.k} · 처음과의 어긋남 ${backDrift.toExponential(2)} px`)
  ledger['slider'] = { base: { n: base.n, w: r6(base.w), hfov: r6(base.lens.hfov!) }, rows, reset: { k: back.lens.k, drift_px: r6(backDrift) } }

  if (process.env.LEDGER === '1') {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(resolve(OUT, `lens31_web2_${testInfo.project.name}.json`), JSON.stringify({
      what: 'web2-31 2번 — 보기 렌즈를 **화면에서** 잰다: 손잡이 자리 · 확정 전 잠금 · 팝오버가 안 깔린다 · '
        + '슬라이더가 그림을 움직이는 동안 3D 좌표·`Camera.f`·`fSource`가 그대로 · 「기본으로」의 왕복.',
      dpr: testInfo.project.name,
      viewport: { w: 1200, h: 800 },
      ...ledger,
      gate: {
        for: 'web2-31 2번 — 화면 몫',
        registered: [
          '손잡이가 손 띠의 시점 묶음(돋보기 바로 아래)이고 이웃과 **같은 급**이다 — 자리는 34-6의 여유에서 실측으로 유도한다(#88)',
          '확정 전에는 꺼져 있고 눌러도 안 열린다 · 확정 뒤에는 열린다',
          '팝오버가 `#app`의 직계라 그 자리의 elementFromPoint가 제 것이다(#87) · 바깥 누름에 접힌다(R7)',
          '슬라이더가 그림을 실제로 움직인다(화면 드리프트 · 폭 배수) — 그동안 3D 좌표 전수·f·fSource 불변',
          '「기본으로」가 처음 화면으로 되돌린다(어긋남 < 1e-6 px)',
        ],
        reachability: '**「움직였나」와 「안 움직였나」를 한 실행에서 나란히 낸다**: 같은 조작이 화면(px)은 '
          + '수백 px 움직이고 3D 좌표 문자열은 **글자 하나도** 안 바꾼다. 렌즈가 lift로 새면 뒤쪽이 깨지고, '
          + '렌더가 렌즈를 안 읽으면 앞쪽이 깨진다 — 두 방향이 서로의 반증이다. 크기는 단위 원장 '
          + '`lens31_web2.json`의 위약 판 셋이 든다.',
        reachability_value: rows.map(r => r.max_screen_drift_px),
        reachability_source: 'slider/rows[]/max_screen_drift_px',
      },
      selfcheck_flags_known: {
        coords_unchanged_all_true: '⚠ `coords_unchanged`가 전부 true이고 `reset.drift_px`가 0이다 — '
          + '**그 칸의 주장 자체다**(렌즈는 렌더만 바꾼다 · 되돌리면 처음 자리다). 값이 다르면 그 칸이 틀린 것이다.',
        no_constants_snapshot: 'web2 라인 전체의 유보 — `constantsSnapshot()`을 안 쓴다(`hold26.test`가 처음 적었다).',
      },
      pitfalls: ['#87', '#88', '#77', '#54', '#42'],
      command: 'LEDGER=1 npx playwright test e2e/lens31.spec.ts',
    }, null, 2))
  }
})

test('31-2 ⑥ `fSource`가 화면에 안 나온다 (2026-08-17 지시 3 · D-L55)', async ({ page }) => {
  await boot(page)
  await construct(page)
  await page.click('#btn-lens')
  await settle(page)
  expect(await page.locator('#lens-pop').isVisible(), '팝오버가 실제로 떠 있다 — [hidden]이면 innerText가 textContent로 떨어져 이 팔이 헛돈다').toBe(true)
  const seen = await page.evaluate(() => {
    const pop = document.getElementById('lens-pop')!
    const body = document.body.innerText
    return {
      popText: pop.innerText.replace(/\s+/g, ' ').trim(),
      bodyHasFSource: /fSource|two-vp/i.test(body),
      // 진단 통로에는 **있다** — 그것이 D-L55가 허락한 자리다(자료구조·S2S)
      diagHasFSource: typeof (window as any).__b2.diag.summary().fSource === 'string',
    }
  })
  console.log(`[31-2 ⑥] 팝오버 문면 「${seen.popText}」 · 화면에 fSource ${seen.bodyHasFSource} · 진단에 fSource ${seen.diagHasFSource}`)
  expect(seen.popText).toMatch(/화각 [\d.]+°/)
  expect(seen.popText).not.toMatch(/fSource|two-vp|default/i)
  expect(seen.bodyHasFSource, '화면 어디에도 안 나온다').toBe(false)
  expect(seen.diagHasFSource, '진단 통로에는 그대로 있다 — 그 자리는 D-L55가 허락한 곳이다').toBe(true)
})
