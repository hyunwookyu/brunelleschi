// web2-37 2번 — **대기는 옅은 청색 · 확정은 흑연**(화면).
//
// 단위 팔(`test/waitink37.test.ts`)이 재는 것은 색 «함수»이고, 여기서 재는 것은
// **화면에 실제로 나간 픽셀**이다. 둘이 갈리는 자리가 실재한다: 브러시 겹은 색을
// 종이색과 다시 섞고(`alphaColor`), 겹이 셋이며(#brushc·#ink·#layerc), 제스처 중에는
// 구운 타일이 그린다 — 함수가 옳아도 그중 하나가 옛 색을 들고 있으면 조용히 갈린다.
//
// 판정자는 단위 팔과 **같은 하나**다:  hueShift = 파랑 − 빨강 (0 = 무채색 흑연)
//
// ⚠⚠ **팔이 색도 자리도 손에 안 든다**(PITFALLS #88 — 재발이 난 자리가 바로 «팔»이었다):
//   · 기대 색상 이동은 `diag.waitInk().ink`에서 유도한다(WAIT_INK를 바꾸면 팔이 따라온다)
//   · 문(`WAIT_HUE`)은 그 유도값의 **비**다 — 절대 px·절대 채널값이 아니다
//   · 측정 상자는 그은 좌표에서 만든다
// 반증(D-3): 같은 팔을 **위약 판 둘**에서 그대로 돌린다 — `off`(청색을 끈 판)에서
// 「대기는 청색」이, `all`(확정에도 칠한 판)에서 「확정은 흑연」이 실제로 무너져야 한다.

import { test, expect, type Page } from '@playwright/test'
import { WAIT_HUE } from './thresholds'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  if (Object.keys(ledger).length === 0) return
  // 원장은 LEDGER=1 단독 실행에서만 쓴다(관문은 `tools/ledgerguard` — 없으면 조용히 막힌다)
  if (process.env.LEDGER !== '1') return
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(resolve(HERE, `../../stage0/out/waitink37_web2${suffix}.json`), JSON.stringify({
    conditions: {
      workers: testInfo.config.workers, project: testInfo.project.name,
      canonical: 'LEDGER=1 npx playwright test e2e/waitink37.spec.ts --project=dpr1 --workers=1',
    },
    what: `web2-37 2번(${testInfo.project.name}) — 화면에 나간 획 몸체의 색상 이동(파랑−빨강) 실측. 대기 ↔ 확정 ↔ 위약 두 판. e2e waitink37.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
    thresholds: WAIT_HUE,
    ...ledger,
  }, null, 1))
})

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number, steps = 10) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  await page.mouse.up()
  await settle(page)
}

/** 작도 완료 + 모서리 기둥 — 기둥(500,300)–(500,500)이 **확정 획**의 측정 대상이다.
 *  (drafting.spec의 `corner`와 같은 구도 — 픽스처를 새로 짓지 않는다) */
async function corner(page: Page) {
  await drawLine(page, 100, 400, 1100, 400, 8)   // 지평선
  await drawLine(page, 500, 500, 600, 475)       // 깊이선 1
  await drawLine(page, 500, 500, 400, 475)       // 깊이선 2
  await drawLine(page, 500, 500, 500, 300)       // 기둥 — 승격된다
}

/** **그은 선분에서 상자를 만든다** — 좌표를 손으로 안 적는다(#88). pad는 획 굵기 대역. */
const boxOf = (a: [number, number], b: [number, number], pad = 8) => ({
  x: Math.min(a[0], b[0]) - pad, y: Math.min(a[1], b[1]) - pad,
  w: Math.abs(b[0] - a[0]) + pad * 2, h: Math.abs(b[1] - a[1]) + pad * 2,
})

/** 겹의 상자에서 **그려진 픽셀의 평균 색상 이동**(파랑−빨강)과 그 픽셀 수.
 *  알파로 가중한다 — 반투명 가장자리가 평균을 종이 쪽으로 안 끈다. */
/** **픽셀과 상태를 한 번에** 뜬다(web2-37 마감 · dpr2에서 창을 놓쳤다).
 *  둘을 두 번의 `evaluate`로 나누면 그 사이에 300ms 창이 닫힐 수 있다 — dpr2는 픽셀 읽기가
 *  네 배라 실제로 닫혔다(`settling` 빈 배열). 읽는 «순서»를 정하는 것으로는 못 막는다:
 *  **같은 시각의 두 값이어야** 「이 픽셀은 그 창 안의 것이다」가 성립한다. */
function hueOf(page: Page, layer: string, r: { x: number; y: number; w: number; h: number }) {
  return page.evaluate(([id, x, y, w, h]) => {
    const src = document.getElementById(id as string) as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round((w as number) * dpr))
    t.height = Math.max(1, Math.round((h as number) * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round((x as number) * dpr), Math.round((y as number) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let wsum = 0, shift = 0, n = 0, sr = 0, sg = 0, sb = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      if (a <= 0) continue
      n++
      wsum += a
      shift += (d[i + 2]! - d[i]!) * a
      sr += d[i]! * a; sg += d[i + 1]! * a; sb += d[i + 2]! * a
    }
    const den = wsum > 0 ? wsum : 1
    return { painted: n, shift: wsum > 0 ? shift / wsum : 0,
      rgb: [+(sr / den).toFixed(1), +(sg / den).toFixed(1), +(sb / den).toFixed(1)] as [number, number, number] }
  }, [layer, r.x, r.y, r.w, r.h] as const)
}

/** 앱이 쓰는 색에서 **기대 색상 이동의 자**를 유도한다 — 팔이 수를 안 든다(#88) */
const inkScale = (page: Page) => page.evaluate(() => {
  const ink: string = (window as any).__b2.diag.waitInk().ink
  return parseInt(ink.slice(5, 7), 16) - parseInt(ink.slice(1, 3), 16)
})

const setMode = async (page: Page, mode: 'on' | 'off' | 'all') => {
  await page.evaluate((m) => (window as any).__b2.diag.waitInk(m), mode)
  await settle(page)
  await settle(page)
}

/** 이 회차의 픽스처 — 확정 기둥 하나 + 아무것에도 안 닿는 대기 획 하나.
 *  두 상자와 그 측정을 한 번에 낸다(위약 판에서 **같은 함수**를 다시 부른다). */
const PILLAR: [[number, number], [number, number]] = [[500, 300], [500, 500]]
const FLOAT: [[number, number], [number, number]] = [[200, 720], [270, 765]]

async function measure(page: Page) {
  const conf = await hueOf(page, 'brushc', boxOf(PILLAR[0], PILLAR[1]))
  const wait = await hueOf(page, 'brushc', boxOf(FLOAT[0], FLOAT[1]))
  return { confirmed: conf, waiting: wait }
}

test('37-2 ① 대기는 청색 · 확정은 흑연 — 같은 화면에서 두 상태가 갈린다', async ({ page }) => {
  await boot(page)
  await corner(page)
  // 아무것에도 안 닿는 획 — 대기로 남는다(flow.spec가 쓰는 그 자리: 연장선에도 안 걸린다)
  await drawLine(page, FLOAT[0][0], FLOAT[0][1], FLOAT[1][0], FLOAT[1][1])
  const s = await page.evaluate(() => (window as any).__b2.diag.summary())
  const last = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return a.doc.strokes[a.doc.strokes.length - 1].id
  })
  expect(s.waiting).toContain(last)              // 픽스처의 전제 — 이 획이 실제로 대기다
  expect(s.lifted).toBeGreaterThan(0)            // 확정도 화면에 있다

  const scale = await inkScale(page)             // 유도된 자 — WAIT_INK의 색상 이동
  const m = await measure(page)
  console.log(`[측정] 색상 이동(파랑−빨강) — 대기 ${m.waiting.shift.toFixed(1)} (px ${m.waiting.painted})`
    + ` · 확정 ${m.confirmed.shift.toFixed(1)} (px ${m.confirmed.painted}) · 자 ${scale}`
    + ` · 평균 rgb 대기 ${m.waiting.rgb.join('/')} 확정 ${m.confirmed.rgb.join('/')}`)
  ledger['on'] = {
    ink_hue_scale: scale,
    waiting: { shift: +m.waiting.shift.toFixed(2), painted: m.waiting.painted, rgb: m.waiting.rgb },
    confirmed: { shift: +m.confirmed.shift.toFixed(2), painted: m.confirmed.painted, rgb: m.confirmed.rgb },
    note: '성한 판(mode on). shift = 알파 가중 평균(파랑−빨강). 문은 자(WAIT_INK의 색상 이동)의 비다.',
  }

  expect(m.waiting.painted).toBeGreaterThan(20)  // 대기 획이 실제로 그려졌다(불변식 j)
  expect(m.confirmed.painted).toBeGreaterThan(20)
  // 문 ㉠ — 대기는 청색 쪽으로 충분히 갔다
  expect(m.waiting.shift).toBeGreaterThan(scale * WAIT_HUE.WAIT_MIN)
  // 문 ㉡ — 확정은 무채색 대역이다(표시가 **안 붙었다**)
  expect(Math.abs(m.confirmed.shift)).toBeLessThan(scale * WAIT_HUE.CONF_MAX)
})

test('37-2 ② 반증 — 위약 판 둘에서 각각 «다른» 문이 무너진다 (D-3)', async ({ page }) => {
  await boot(page)
  await corner(page)
  await drawLine(page, FLOAT[0][0], FLOAT[0][1], FLOAT[1][0], FLOAT[1][1])
  const scale = await inkScale(page)
  const gate = (m: { waiting: { shift: number }; confirmed: { shift: number } }) => ({
    wait_is_blue: m.waiting.shift > scale * WAIT_HUE.WAIT_MIN,
    conf_is_graphite: Math.abs(m.confirmed.shift) < scale * WAIT_HUE.CONF_MAX,
  })

  const mOn = await measure(page)
  const on = gate(mOn)
  await setMode(page, 'off')
  const mOff = await measure(page)
  await setMode(page, 'all')
  const mAll = await measure(page)
  await setMode(page, 'on')
  const back = await measure(page)

  const off = gate(mOff), all = gate(mAll)
  console.log(`[측정] 위약 — off: 대기 ${mOff.waiting.shift.toFixed(1)} 확정 ${mOff.confirmed.shift.toFixed(1)}`
    + ` · all: 대기 ${mAll.waiting.shift.toFixed(1)} 확정 ${mAll.confirmed.shift.toFixed(1)}`)
  console.log(`[측정] 문 — on ${JSON.stringify(on)} · off ${JSON.stringify(off)} · all ${JSON.stringify(all)}`)
  ledger['falsification'] = {
    ink_hue_scale: scale,
    on: { ...on, waiting: +mOn.waiting.shift.toFixed(2), confirmed: +mOn.confirmed.shift.toFixed(2) },
    off: { ...off, waiting: +mOff.waiting.shift.toFixed(2), confirmed: +mOff.confirmed.shift.toFixed(2) },
    all: { ...all, waiting: +mAll.waiting.shift.toFixed(2), confirmed: +mAll.confirmed.shift.toFixed(2) },
    note: 'off = 청색을 끈 판(37-2 이전) → wait_is_blue가 거짓이어야 한다. all = 확정에도 칠한 판 → conf_is_graphite가 거짓이어야 한다. 둘 다 참이면 이 팔은 아무것도 안 잰다.',
  }

  expect(on.wait_is_blue).toBe(true)
  expect(on.conf_is_graphite).toBe(true)
  expect(off.wait_is_blue).toBe(false)      // ← 위약 ①에서 실제로 빨개지는 문
  expect(off.conf_is_graphite).toBe(true)   // 다른 축은 그대로 선다
  expect(all.conf_is_graphite).toBe(false)  // ← 위약 ②에서 실제로 빨개지는 문
  // 되돌리면 성한 판으로 정확히 돌아온다 — 손잡이가 상태를 안 남긴다
  expect(gate(back)).toEqual(on)
})

test('37-2 ③ 정착 전이 — 청색이 사라지고 흑연 하나만 남는다(두 선이 안 남는다)', async ({ page }) => {
  await boot(page)
  await corner(page)
  // 허공 수직 — 대기로 남는다(drafting.spec 8·9의 사슬과 같은 구도)
  const AIR: [[number, number], [number, number]] = [[700, 130], [700, 250]]
  await drawLine(page, AIR[1][0], AIR[1][1], AIR[0][0], AIR[0][1])
  const id = await page.evaluate(() => {
    const a = (window as any).__b2.app
    return a.doc.strokes[a.doc.strokes.length - 1].id
  })
  expect(await page.evaluate((i) => (window as any).__b2.app.lift.waiting.includes(i), id)).toBe(true)

  const box = boxOf(AIR[0], AIR[1])
  const scale = await inkScale(page)
  const before = await hueOf(page, 'brushc', box)

  // ⚠⚠ **web2-54 §1 게이트 1이 이 팔을 잡았다**(#93 — 병렬 4에서 표본 «한 번»이 창을
  // 놓친다): 종전 판은 사슬을 긋고 나서 evaluate 한 번으로 «전이 중»을 떴는데, 기기가
  // 붐비면 그 왕복이 정착 창(settleMs)보다 늦어 settling이 **이미 빈 배열**이었다
  // (기록: 조용한 기계의 리허설 초록에서도 dpr2가 그 자리로 빨갰다). 문턱·창 길이는
  // 안 만진다 — **팔을 표본에서 «추적자»로 바꾼다**: 사슬을 긋기 «전에» 페이지 안에
  // rAF 루프를 심어, 창이 열린 프레임마다 (settling id · 그 순간의 상자 청색 이동)을
  // 그 자리에서 기록한다. 창이 1프레임이라도 열리면 반드시 잡힌다 — 시각 경합이 없다.
  await page.evaluate(([x, y, w, h, sid]) => {
    const wnd = window as never as { __wi37?: { ids: number[]; maxShift: number; frames: number; stop: boolean }; __b2: any }
    const tr = { ids: [] as number[], maxShift: -Infinity, frames: 0, stop: false }
    wnd.__wi37 = tr
    const shiftOf = () => {
      const src = document.getElementById('brushc') as HTMLCanvasElement
      const dpr = window.devicePixelRatio || 1
      const t = document.createElement('canvas')
      t.width = Math.max(1, Math.round((w as number) * dpr))
      t.height = Math.max(1, Math.round((h as number) * dpr))
      const g = t.getContext('2d')!
      g.drawImage(src, Math.round((x as number) * dpr), Math.round((y as number) * dpr),
        t.width, t.height, 0, 0, t.width, t.height)
      const d = g.getImageData(0, 0, t.width, t.height).data
      let wsum = 0, shift = 0
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]! / 255
        if (a <= 0) continue
        wsum += a; shift += (d[i + 2]! - d[i]!) * a
      }
      return wsum > 0 ? shift / wsum : 0
    }
    const tick = () => {
      if (tr.stop) return
      const s = wnd.__b2.diag.waitInk()
      for (const z of s.settling) if (!tr.ids.includes(z.id)) tr.ids.push(z.id)
      if (s.settling.some((z: { id: number }) => z.id === (sid as number))) {
        tr.frames++
        const v = shiftOf()
        if (v > tr.maxShift) tr.maxShift = v
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [box.x, box.y, box.w, box.h, id] as const)

  // 사슬 — 다리 둘이 승격되고 연쇄가 이 획을 올린다(«승격은 연쇄한다»)
  await drawLine(page, 500, 500, 700, 450, 12)
  await drawLine(page, 700, 450, 700, 250, 12)
  const mid = await page.evaluate((sid) => {
    const wnd = window as never as { __wi37: { ids: number[]; maxShift: number; frames: number; stop: boolean }; __b2: any }
    return {
      lifted: wnd.__b2.app.lift.lifted.has(sid as number) as boolean,
      settleMs: wnd.__b2.diag.waitInk().settleMs as number,
    }
  }, id)
  expect(mid.lifted).toBe(true)

  // 창이 닫히기를 기다린다 — **길이도 앱에서 읽는다**(팔이 ms를 안 든다 · #88)
  await page.waitForFunction(() => (window as any).__b2.diag.waitInk().settling.length === 0,
    undefined, { timeout: 5000 })
  await settle(page)
  const trace = await page.evaluate(() => {
    const tr = (window as never as { __wi37: { ids: number[]; maxShift: number; frames: number; stop: boolean } }).__wi37
    tr.stop = true
    return { ids: tr.ids, maxShift: tr.maxShift, frames: tr.frames }
  })
  const after = await hueOf(page, 'brushc', box)

  console.log(`[측정] 정착 — 대기 ${before.shift.toFixed(1)} · 전이 중(최대) ${trace.maxShift.toFixed(1)}`
    + ` (${trace.frames}프레임) · 끝난 뒤 ${after.shift.toFixed(1)} (px ${after.painted}) · 창 ${mid.settleMs}ms`)
  ledger['settle'] = {
    settle_ms: mid.settleMs,
    waiting_shift: +before.shift.toFixed(2),
    during_shift: +trace.maxShift.toFixed(2),
    after_shift: +after.shift.toFixed(2),
    after_painted: after.painted,
    note: '한 획이 색을 바꾼다 — 창이 닫힌 뒤 그 상자에 남는 것은 흑연 하나다(청색 잔상 없음). during_shift는 web2-54부터 rAF 추적자의 창-안 최대값이다(표본 한 번은 부하에서 창을 놓친다 — #93)',
  }

  expect(before.shift).toBeGreaterThan(scale * WAIT_HUE.WAIT_MIN)   // 대기였다
  expect(trace.ids).toContain(id)                                    // 전이가 실제로 걸렸다(창 안 프레임에서)
  expect(trace.frames).toBeGreaterThan(0)                            // 추적자가 창 안을 실제로 봤다(반증: 창이 안 열리면 0)
  expect(trace.maxShift).toBeGreaterThan(after.shift)                // 전이 중이 더 청색이다
  expect(after.painted).toBeGreaterThan(10)                          // 획이 사라지지 않는다
  expect(Math.abs(after.shift)).toBeLessThan(scale * WAIT_HUE.CONF_MAX)  // 청색이 남지 않았다
})
