// web2-24 4부 — 옐로 프리핸드(raw 정본)·오스냅 완전 차단·테두리 제거의 e2e 몫.
//
//   ① 옐로에 호를 그으면 확정 기하가 곡선으로 남는다(현 대비 최대 이탈 값) — 픽셀로도:
//      호의 배에 잉크가 있고 현의 중앙(호에서 먼 자리)에는 없다
//   ④ 트레이싱지는 종전대로 직선(회귀) — 같은 호 몸짓이 현으로 선다(픽셀 반대)
//   ⑤ 옐로에서 오스냅이 한 번도 안 뜬다 — 진단 「지금 호버 스냅」이 3D 끝점 위에서도 «—»
//      (반증 내장: 옐로 밖에서는 같은 자리가 스냅 종류를 낸다)
//   ⑦ 겹 테두리 픽셀 0 · 가장자리 근처에서만 손잡이가 뜬다(떠나면 사라진다)
//
// 지시 4-e. 판정 캔버스: 활성 겹 위 획은 #layerc(웹2-20 3부) · 표식·손잡이는 #ink.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 호 — (ax,ay)→(bx,by) 현에서 sag만큼 처지는 경로로 끈다(머무름이 안 서게 빠르게) */
async function drawArc(page: Page, ax: number, ay: number, bx: number, by: number, sag: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  const n = 16
  for (let i = 1; i <= n; i++) {
    const t = i / n
    await page.mouse.move(ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(Math.PI * t) * sag)
  }
  await page.mouse.up()
  await settle(page)
}

function countPixels(page: Page, id: string, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([id, x0, y0, x1, y1]) => {
    const c = document.getElementById(id as string) as HTMLCanvasElement
    if (!c || c.width === 0) return 0
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round((x0 as number) * dpr), Math.round((y0 as number) * dpr),
      Math.max(1, Math.round(((x1 as number) - (x0 as number)) * dpr)),
      Math.max(1, Math.round(((y1 as number) - (y0 as number)) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [id, x0, y0, x1, y1] as const)
}

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)     // 수평 앵커
  await drawLine(page, 500, 560, 800, 480)     // 소실점 획 — 카메라 닫힘
}

test('① 옐로 호 = 곡선 확정(이탈 값·픽셀) · ④ 트레이싱지는 직선(회귀)', async ({ page }) => {
  await boot(page)
  await page.click('#btn-roll-yellow'); await settle(page)
  await drawArc(page, 350, 240, 650, 240, 60)
  const st = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    // 현 대비 최대 이탈(정본 기하 raw에서 — 4-e ① «값으로»)
    const raw: { x: number; y: number }[] = s.raw ?? [s.a, s.b]
    const A = raw[0]!, B = raw[raw.length - 1]!
    const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy
    let dev = 0
    for (const p of raw) {
      const t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L2))
      dev = Math.max(dev, Math.hypot(p.x - (A.x + t * dx), p.y - (A.y + t * dy)))
    }
    return { rawLen: s.raw?.length ?? 0, dev, layer: s.layer }
  })
  expect(st.rawLen, '점렬이 정본으로 남는다').toBeGreaterThan(2)
  expect(st.dev, '호의 처짐이 확정 기하에 남는다(sag 60 대역)').toBeGreaterThan(40)
  // 픽셀 — 호의 배(중앙 y≈240+60)에 잉크, 현 중앙(y≈240 — 호에서 60px)에는 없음
  expect(await countPixels(page, 'layerc', 480, 285, 520, 305), '호의 배에 잉크').toBeGreaterThan(0)
  expect(await countPixels(page, 'layerc', 480, 232, 520, 248), '현 자리는 비어 있다').toBe(0)

  // ④ 회귀 — 트레이싱지에서 같은 몸짓: 확정은 현(직선)이다. 반대 픽셀 분포.
  await page.click('#btn-roll-tracing'); await settle(page)
  await drawArc(page, 350, 400, 650, 400, 60)
  const tr = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[a.doc.strokes.length - 1]
    return { a: s.a, b: s.b, layer: s.layer }
  })
  // 트레이싱지 획의 몸체(#layerc)는 a→b 현이다 — 배 자리는 빈다
  expect(await countPixels(page, 'layerc', 480, 445, 520, 465), '트레이싱지 호의 배는 비어 있다(직선 확정)').toBe(0)
  const chord = await countPixels(page, 'layerc', 480, 392, 520, 425)
  expect(chord, '트레이싱지 몸체는 현 대역에 있다(오스냅·축이 끝을 옮겨도 이 상자 안)').toBeGreaterThan(0)
})

test('⑤ 옐로에서 오스냅이 한 번도 안 뜬다 — 진단 「지금 호버 스냅」 (반증 내장)', async ({ page }) => {
  await boot(page)
  await page.click('#buildid')                 // 진단 패널
  const rowText = (key: string) => page.evaluate((k) => {
    const rows = Array.from(document.querySelectorAll('#diagpanel div'))
    const r = rows.find(d => (d.querySelector('.k')?.textContent ?? '') === k)
    return r ? (r.textContent ?? '').slice((r.querySelector('.k')?.textContent ?? '').length) : null
  }, key)
  // 호버는 **합성 pointermove**(페이지 안 동기 디스패치)로 쏘고 **같은 점에 두 번**
  // 쏜다 — 진단 패널은 window capture 단계에서 렌더해(diagpanel.ts «앱 핸들러보다
  // 먼저 보되») «지금 호버 스냅»이 늘 한 이벤트 낡다(표식 실측 — NOTES 4부. 진단
  // 표시의 선행 특성이지 앱 결함이 아니다). 두 번째 사건이 첫 사건의 결과를 그린다.
  const hoverAt = (x: number, y: number) => page.evaluate(([x, y]) => {
    const c = document.getElementById('ink')!
    c.dispatchEvent(new PointerEvent('pointermove', {
      pointerType: 'mouse', clientX: x as number, clientY: y as number, buttons: 0, bubbles: true,
    }))
  }, [x, y] as const)
  // 반증 방향(옐로 밖) — **실제 확정 끝점**(승격 획의 b — 축·오스냅이 끝을 옮겼을 수
  // 있어 명목 좌표를 안 겨눈다: 1부와 같은 이유) 위 호버에 스냅 종류가 뜬다
  const end = await page.evaluate(() => {
    const a = (window as any).__b2.app
    const s = a.doc.strokes[0]
    return { x: s.b.x * a.view.s + a.view.ox, y: s.b.y * a.view.s + a.view.oy }
  })
  await hoverAt(400, 300); await settle(page)
  await hoverAt(end.x, end.y); await hoverAt(end.x, end.y); await settle(page)
  const before = await rowText('지금 호버 스냅')
  expect(before, '옐로 밖에서는 끝점 스냅이 뜬다(격자가 실패 가능함 — #69 ㉣)').not.toBe('—')
  // 옐로 활성 — 같은 자리 호버에 아무것도 안 뜬다
  await page.click('#btn-roll-yellow'); await settle(page)
  await hoverAt(400, 300); await settle(page)
  await hoverAt(end.x, end.y); await hoverAt(end.x, end.y); await settle(page)
  expect(await rowText('지금 호버 스냅'), '옐로에서는 밑그림 3D 끝점에도 안 붙는다').toBe('—')
})

test('⑦ 테두리 픽셀 0 · 가장자리 근처에서만 손잡이 — 옐로·트레이싱지 둘 다', async ({ page }) => {
  await boot(page)
  for (const btn of ['btn-roll-yellow', 'btn-roll-tracing'] as const) {
    await page.click(`#${btn}`); await settle(page)
    const rect = await page.evaluate(() => {
      const a = (window as any).__b2.app
      const lay = a.doc.layers.find((l: any) => l.id === a.activeLayer)
      const v = a.view
      return {
        x: lay.rect.x * v.s + v.ox, y: lay.rect.y * v.s + v.oy,
        w: lay.rect.w * v.s, h: lay.rect.h * v.s,
      }
    })
    // 윗변 일부 상자(±3px) — 테두리 선이 없다(0픽셀). 포인터는 멀리 둔 상태에서 잰다.
    const bx0 = rect.x + rect.w * 0.3, bx1 = rect.x + rect.w * 0.6
    await page.mouse.move(rect.x + rect.w / 2, rect.y + rect.h / 2); await settle(page)
    expect(await countPixels(page, 'ink', bx0, rect.y - 3, bx1, rect.y + 3), `${btn}: 테두리 픽셀 0`).toBe(0)
    // 가장자리 근처로 — 손잡이(그 변만)가 뜬다
    await page.mouse.move((bx0 + bx1) / 2, rect.y + 1); await settle(page)
    expect(await countPixels(page, 'ink', bx0, rect.y - 3, bx1, rect.y + 3), `${btn}: 근처에서 손잡이`).toBeGreaterThan(0)
    // 떠나면 사라진다
    await page.mouse.move(rect.x + rect.w / 2, rect.y + rect.h / 2); await settle(page)
    expect(await countPixels(page, 'ink', bx0, rect.y - 3, bx1, rect.y + 3), `${btn}: 떠나면 0`).toBe(0)
  }
})
