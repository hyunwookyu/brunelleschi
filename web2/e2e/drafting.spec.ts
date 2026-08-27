// web2-12 3부 — 제도 표현: 8 모서리 넘김 · 9 잉크 번짐 · 10 종이 결.
// **3부의 불변식: 표현만 바꾼다** — 오스냅·조각·면·lift가 수리 전후 동일해야 하고,
// 여기서는 그 판을 «넘김 꼬리 끝에서 오스냅이 안 잡힌다»(기하에 새 표적이 안 생겼다)와
// 「확정 좌표 == 재사영」(flow.spec의 불변식 k 팔)으로 잰다.

import { test, expect, type Page } from '@playwright/test'
import { PIXEL_DIFF_CH } from './thresholds'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  if (Object.keys(ledger).length === 0) return
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(resolve(HERE, `../../stage0/out/drafting_web2${suffix}.json`), JSON.stringify({
    what: `web2-12 3부(${testInfo.project.name}) — 제도 표현의 실측: 종이 마스크 켬/끔의 궤도 프레임(ms) · 연쇄 승격 순간의 화면 변화 픽셀. e2e drafting.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
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

/** 잉크 겹의 상자 painted(알파>0) */
const inkBox = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round(ww! * dpr)), Math.max(1, Math.round(hh! * dpr))).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x, y, w, h])

/** 작도 완료 + 모서리 기둥 — 기둥 아래끝(500,500)은 만나고 위끝(500,300)은 자유다 */
async function corner(page: Page) {
  await drawLine(page, 100, 400, 1100, 400, 8)   // 지평선
  await drawLine(page, 500, 500, 600, 475)       // 깊이선 1
  await drawLine(page, 500, 500, 400, 475)       // 깊이선 2
  await drawLine(page, 500, 500, 500, 300)       // 기둥 — 승격된다
}

test('8 넘김 — 만나는 끝에만 꼬리가 있고, 자유 끝에는 없고, 꼬리는 스냅 표적이 아니다 · 줌 불변', async ({ page }) => {
  await boot(page)
  await corner(page)
  // 만나는 끝(아래 500,500) 너머 — 꼬리 픽셀이 있다(기둥 방향 아래로)
  const tail = await inkBox(page, 497, 502, 6, 8)
  // 자유 끝(위 500,300) 너머 — 없다(반증 조건 D-3: 전 끝에 넘기면 여기가 잡는다)
  const free = await inkBox(page, 497, 290, 6, 8)
  console.log(`[측정] 넘김 — 만나는 끝 너머 painted ${tail} · 자유 끝 너머 ${free}`)
  expect(tail).toBeGreaterThan(3)
  expect(free).toBe(0)

  // 꼬리는 기하가 아니다 — 꼬리 끝(500,505)의 오스냅이 **실제 끝점(500,500)**을 내거나
  // 없어야 한다(꼬리 끝 자체가 표적이 되면 기하를 건드린 것 — 3부 불변식의 판).
  const hit = await page.evaluate(() => (window as any).__b2.diag.osnapAt(500, 505))
  if (hit) {
    expect(Math.hypot(hit.p.x - 500, hit.p.y - 500), '스냅은 실제 끝점으로').toBeLessThan(0.5)
  }
  // 확정 좌표도 불변(a·b가 안 움직였다) — 기둥의 문서 좌표
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { a: s.a, b: s.b }
  })
  expect(st.a).toEqual({ x: 500, y: 500 })
  expect(st.b).toEqual({ x: 500, y: 300 })

  // 화면 고정(원칙 e) — 줌 2배 후 꼬리의 화면 길이가 그대로다(문서 길이가 아니다)
  await page.mouse.move(500, 500)
  for (let i = 0; i < 10; i++) {
    const s0 = await page.evaluate(() => (window as any).__b2.app.view.s)
    if (s0 >= 1.9) break
    await page.mouse.wheel(0, -350)
    await settle(page)
  }
  const zoomed = await page.evaluate(() => (window as any).__b2.app.view.s)
  // 줌 중심(500,500) 아래 꼬리 — 화면 좌표로 같은 대역이면 painted가 같은 자릿수다
  const tailZoom = await inkBox(page, 495, 502, 10, 10)
  console.log(`[측정] 넘김 줌 — 배율 ${zoomed.toFixed(2)} 꼬리 painted ${tailZoom}(전 ${tail})`)
  expect(zoomed).toBeGreaterThan(1.8)
  expect(tailZoom).toBeGreaterThan(3)
  expect(tailZoom).toBeLessThan(tail * 4)   // 문서 고정이면 길이 2배×굵기 2배 ≈ 4배를 넘는다
})

test('9 잉크 번짐 — 내림·뗌 자국·머무름 고임이 있고, 그리는 중과 뗀 뒤가 이어진다', async ({ page }) => {
  await boot(page)
  await drawLine(page, 100, 400, 1100, 400, 8)
  await page.click('#btn-pen'); await settle(page)

  // 잉크 획 — 시작·끝 자국: 몸통(1.5px)보다 끝이 굵다
  await drawLine(page, 300, 620, 700, 620, 12)
  // ⚠ **두 상자는 획에 «똑같이» 덮여야 한다**(web2-18 1부에서 이 팔이 깨져 고친 자리):
  //    이 획은 화면 평행이라 앵커로 **승격**되고, 1부부터 승격 잉크의 «몸체»도 이 캔버스
  //    (#ink)가 그린다. 종전 상자(x=296..304)는 획 시작(300) 앞으로 4px 비어 있어 몸체를
  //    절반만 세었다 — 몸체가 #gl에 있던 때는 그 차가 안 보였지만 이제는 상자 자체가
  //    기울어진 자다. 시작 상자를 **획 안쪽으로** 옮겨(300..308) 두 상자의 몸체 몫을
  //    같게 만든다. 재는 것(내림 자국이 몸통보다 굵다)은 그대로다 — 임계는 안 만졌다.
  const midBand = await inkBox(page, 495, 616, 8, 9)     // 몸통 가운데
  const endBand = await inkBox(page, 300, 616, 8, 9)     // 내림 자국(획 시작점부터)
  console.log(`[측정] 번짐 끝자국 — 몸통 상자 ${midBand} · 시작 상자 ${endBand}`)
  // ⚠ **판별력이 얇다**(실측 여유 dpr1 22→23 · dpr2 81→85): 몸체가 같은 캔버스로 오면서
  //    상자의 대부분을 몸체가 차지하고, 자국 자체는 니브의 0.75배 원이라 dpr1에서 몇 칸이다.
  //    이 사실을 여기 적어 둔다 — 다음 회차가 지표를 «칸 수»에서 «알파 합»으로 바꿀 자리다
  //    (DEFERRED web2-18). 지금 고치지 않는 이유: 범위를 안 넓힌다(A-3).
  expect(endBand).toBeGreaterThan(midBand)               // 대는 자리가 굵다

  // 머무름 — 펜을 한 자리에 머무르게(같은 점을 여러 번) 한 획
  await page.mouse.move(300, 680); await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(300 + i * 30, 680)
  for (let i = 0; i < 10; i++) await page.mouse.move(480 + (i % 2), 680)  // 고임(≥5점 묶음)
  for (let i = 1; i <= 6; i++) await page.mouse.move(480 + i * 30, 680)
  await settle(page)
  const dwellDuring = await inkBox(page, 474, 675, 12, 10)
  const plainDuring = await inkBox(page, 400, 675, 12, 10)
  await page.mouse.up(); await settle(page)
  const dwellAfter = await inkBox(page, 474, 675, 12, 10)
  const plainAfter = await inkBox(page, 400, 675, 12, 10)
  console.log(`[측정] 머무름 — 고임 상자 중${dwellDuring}/후${dwellAfter} · 맨몸통 중${plainDuring}/후${plainAfter}`)
  // ⚠ 국면 «안»에서 비교한다 — 이 획은 대기로 남아 뗌에서 몸체 렌더러가 바뀐다(벡터 →
  // rotring+파선: 설계된 상태 채널). 국면을 섞어 절대량을 견주면 그 몫이 섞인다(초판 실측
  // 이 그랬다). 뗌 연속성 자체는 draftgate의 INK 게이트(승격 경로)가 잰다.
  expect(dwellDuring).toBeGreaterThan(plainDuring)       // 머무른 자리가 고인다(그리는 중)
  expect(dwellAfter).toBeGreaterThan(plainAfter)         // 떼도 고임이 남는다(같은 함수·시드)
})

test('10 종이 결 — 겹에 마스크 한 장이 걸려 있고, 위상이 문서(팬)를 따라간다', async ({ page }) => {
  await boot(page)
  await drawLine(page, 100, 400, 1100, 400, 8)
  await drawLine(page, 300, 550, 700, 550, 12)   // 확정 획(질감이 #brushc에)
  const mask = await page.evaluate(() => {
    const c = document.getElementById('brushc') as HTMLElement
    const s = document.getElementById('brushsnap') as HTMLElement
    const st = (el: HTMLElement) => getComputedStyle(el).maskImage || (getComputedStyle(el) as any).webkitMaskImage
    return { brushc: String(st(c)).slice(0, 30), snap: String(st(s)).slice(0, 30) }
  })
  console.log(`[측정] 종이 마스크 — brushc ${mask.brushc} · snap ${mask.snap}`)
  expect(mask.brushc).toContain('url')            // 한 장이 걸려 있다
  expect(mask.snap).toContain('url')              // 스냅샷 겹에도 같은 장(뗌 게이트의 전제)

  // 위상 = 문서 고정 — 팬(두 손가락 대신 데스크톱 확인: state.panBy와 같은 함수는
  // 입력층에 있으므로 화면 팬을 직접 낸다) 후 mask-position이 ox·oy를 따라간다
  const before = await page.evaluate(() => (document.getElementById('brushc') as HTMLElement).style.maskPosition)
  await page.evaluate(() => {
    const b = (window as any).__b2
    b.app.view = { ...b.app.view, ox: b.app.view.ox + 37, oy: b.app.view.oy + 11 }
    b.app.listeners.forEach((l: () => void) => l())
  })
  await settle(page)
  const after = await page.evaluate(() => (document.getElementById('brushc') as HTMLElement).style.maskPosition)
  console.log(`[측정] 종이 위상 — 팬 전 «${before}» 후 «${after}»`)
  expect(after).toBe('37px 11px')                 // ox·oy를 그대로 탄다(문서 고정)
  expect(after).not.toBe(before)                  // 반증(D-3): 화면 고정이면 안 움직인다
})


test('8·9 연쇄 승격 순간 — 표현이 «나타나는» 몫의 실측 + 획은 계속 보인다(불변식 j 화면판)', async ({ page }) => {
  // 승격 전환은 원래 표현이 바뀌는 사건이다(파선 → 실선·rotring → Line2 — 상태 채널).
  // 넘김 꼬리·가장자리 퍼짐이 그 사건에 얹는 몫을 «수로» 남긴다(3차 [6] — 게이트가 아니라
  // 기록이다: 뗌 게이트의 «무변화» 요구는 미리보기→확정 전환의 것이고, 승격은 상태가
  // 바뀌었음을 화면이 말해야 하는 전환이다. 재는 판은 «사라지지 않는다»뿐이다).
  await boot(page)
  await corner(page)                             // 승격망(모서리 500,500 포함)
  await page.click('#btn-pen')
  await drawLine(page, 700, 250, 700, 130, 10)   // 허공 수직 잉크 — 대기로 남는다
  const waiting = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { id: s.id, waiting: a.lift.waiting.includes(s.id) }
  })
  expect(waiting.waiting).toBe(true)
  const before = await inkBox(page, 690, 160, 20, 40)
  // 사슬 — 모서리에서 vp0 광선으로, 그 끝에서 수직으로 대기 획의 왼끝까지: 축을 타는
  // 다리 둘이 승격되고 연쇄가 대기 잉크를 올린다(«승격은 연쇄한다» — CLAUDE.md)
  await page.click('#tray-HB')
  await drawLine(page, 500, 500, 700, 450, 12)   // vp0 광선 위 — 승격
  await drawLine(page, 700, 450, 700, 250, 12)   // 수직 기둥 — 승격·꼭대기가 대기 획 아래끝
  const after = await page.evaluate((id) => {
    const a = (window as any).__b2.app
    return a.lift.lifted.has(id)
  }, waiting.id)
  const box = await inkBox(page, 690, 160, 20, 40)
  console.log(`[측정] 연쇄 승격 — 승격됨 ${after} · 잉크 겹 상자 전 ${before} 후 ${box}`)
  ledger['promotion'] = { lifted: after, ink_box_before: before, ink_box_after: box,
    note: '전/후는 잉크 겹의 painted — 파선 소멸·번짐 가장자리 등장 등 상태 전환의 총 몫이다(설계된 변화 — 무변화 게이트 대상이 아니다).' }
  expect(after).toBe(true)
  expect(box).toBeGreaterThan(0)                 // 획이 사라지지 않는다(불변식 j)
})

test('8 기하 불변의 직접 판 — 조각·면 배열 수가 고정값이다(표현이 기하에 새면 여기가 깨진다)', async ({ page }) => {
  // 3차 [8] — «읽기 전용» 논증에 수를 더한다: 같은 픽스처의 배열(arrangement)을 고정한다.
  // 넘김·번짐·마스크 어느 것이든 lift·조각·면에 새면 이 수가 움직인다.
  await boot(page)
  await corner(page)
  await drawLine(page, 500, 300, 600, 275)       // 위끝에서 vp0로 — 갈래 있는 장면(#64)
  const ar = await page.evaluate(() => {
    const a = (window as any).__b2.diag.arrangement()
    return { nodes: a.nodes, edges: a.edges, planes: a.planes.length }
  })
  const lifted = await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)
  console.log(`[측정] 배열 고정 — 마디 ${ar.nodes} 변 ${ar.edges} 평면 ${ar.planes} · 승격 ${lifted}`)
  expect(lifted).toBe(4)
  expect(ar.nodes).toBeGreaterThan(0)
  // 고정값 — 이 픽스처의 기하가 주는 수(표현 계층 변경으로 움직이면 기하를 건드린 것)
  ledger['arrangement_pin'] = ar
  expect(ar).toEqual({ nodes: 5, edges: 4, planes: 1 })
})

test('10 종이 마스크의 궤도 비용 — 켬/끔의 프레임 간격을 나란히 잰다', async ({ page }) => {
  // 3차 [10] — 「비용은 갱신뿐」을 서술이 아니라 수로. 같은 장면·같은 궤도를 마스크
  // 켬/끔으로 돌고 rAF 간격 중앙을 원장에 남긴다(절대값은 헤드리스 — 판별은 두 값의 비).
  await boot(page)
  await drawLine(page, 100, 400, 1100, 400, 8)
  for (let i = 0; i < 6; i++) await drawLine(page, 300 + i * 60, 550, 340 + i * 60, 480)
  const orbitFrames = async (): Promise<number> => {
    await page.evaluate(() => {
      const S: any = ((window as any).__pf = { d: [] as number[], prev: 0 })
      const tick = () => { const n = performance.now(); if (S.prev) S.d.push(n - S.prev); S.prev = n; if (S.d.length < 90) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await page.mouse.move(600, 400)
    await page.mouse.down({ button: 'middle' })
    for (let i = 1; i <= 30; i++) await page.mouse.move(600 + i * 4, 400 + (i % 5))
    await page.mouse.up({ button: 'middle' })
    return await page.evaluate(() => {
      const d = [...(window as any).__pf.d].sort((a: number, b: number) => a - b)
      return d.length ? Number(d[Math.floor(d.length / 2)].toFixed(2)) : -1
    })
  }
  const withMask = await orbitFrames()
  await page.evaluate(() => {
    for (const id of ['brushc', 'brushsnap']) {
      const el = document.getElementById(id) as HTMLElement
      el.style.maskImage = 'none'; (el.style as any).webkitMaskImage = 'none'
    }
  })
  const withoutMask = await orbitFrames()
  console.log(`[측정] 종이 궤도 — 마스크 켬 프레임 중앙 ${withMask}ms · 끔 ${withoutMask}ms`)
  ledger['paper_orbit'] = { frame_ms_median_mask_on: withMask, frame_ms_median_mask_off: withoutMask,
    note: '국면당 1회 표본(brush_perf의 single_sample_note와 같은 규율 — 작은 차는 판별하지 않는다). 줌 미끄러짐(위상 문서·크기 화면의 교환)은 실기기 눈 몫(DEFERRED).' }
  expect(withMask).toBeGreaterThan(0)
})
