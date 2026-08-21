// 종단 — 사람이 하는 순서 그대로:
// 빈 화면 → 지평선 → 깊이선 둘 → 획 몇 개 → 돌리기 → 이어 그리기.
// 각 단계에서 픽셀이 실제로 그려졌는지 확인한다. (단계가 늘면 이 흐름도 는다)

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  }
  await page.mouse.up()
  await settle(page)
}

/** 영역의 실제 그려진 픽셀 수 — 2D 오버레이(ink) */
function inkPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round((x1! - x0!) * dpr)), Math.max(1, Math.round((y1! - y0!) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1])
}

/** 영역의 실제 그려진 픽셀 수 — 3D 캔버스(gl, preserveDrawingBuffer) */
function glPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const gl = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = gl.width; t.height = gl.height
    const ctx = t.getContext('2d')!
    ctx.drawImage(gl, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = ctx.getImageData(
      Math.round(x0! * dpr), Math.round(y0! * dpr),
      Math.max(1, Math.round((x1! - x0!) * dpr)), Math.max(1, Math.round((y1! - y0!) * dpr)),
    ).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1])
}

const summary = (page: Page) => page.evaluate(() => (window as any).__b2.diag.summary())

test('1단계 전체 흐름 — 지평선→소실점 둘→3D→궤도→이어 그리기', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)

  // 빈 화면
  expect(await inkPixels(page, 0, 0, 1200, 800)).toBe(0)

  // 지평선 — 수평 강제
  await drawLine(page, 100, 400, 1100, 403) // 손이 3px 튀어도 수평이 된다
  let s = await summary(page)
  expect(s.horizonY).toBe(400)
  expect(await inkPixels(page, 0, 397, 1200, 404)).toBeGreaterThan(100)

  // 깊이선 1 → 소실점 (900,400). **첫 선이므로 이것이 지면(Y=0)에 놓인다**(지시 2).
  // 깊이선 둘을 같은 모서리 (500,500)에서 뻗는다 — 사람이 상자를 그리는 방식이고,
  // 그래야 서로 연결돼 둘 다 3D가 되고 그 모서리에서 세운 기둥도 이어진다.
  await drawLine(page, 500, 500, 600, 475)
  s = await summary(page)
  expect(s.vps).toHaveLength(1)
  expect(Math.abs(s.vps[0].x - 900)).toBeLessThan(1e-6)
  expect(Math.abs(s.vps[0].y - 400)).toBeLessThan(1e-6)

  // 깊이선 2 → 소실점 (100,400), f² = 300·500
  await drawLine(page, 500, 500, 400, 475)
  s = await summary(page)
  expect(s.vps).toHaveLength(2)
  expect(s.fSource).toBe('two-vp')
  expect(Math.abs(s.f - Math.sqrt(150000))).toBeLessThan(1e-6)

  // 내용 획 1 — 모서리에서 세운 수직. 아래점은 지면이고 높이는 그 선의 길이가 정한다.
  await drawLine(page, 500, 500, 500, 300)
  s = await summary(page)
  expect(s.lifted).toBe(3) // 깊이선 둘 + 이 수직
  expect(await glPixels(page, 495, 305, 505, 495)).toBeGreaterThan(20)

  // 내용 획 2 — vp0 축으로 이어 긋기 → 연쇄 승격
  await drawLine(page, 500, 300, 700, 350)
  s = await summary(page)
  expect(s.lifted).toBe(4)

  // 불변식 k의 화면 층: 확정 좌표 = 재사영 (작도 포즈)
  const proj = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const out: { err: number }[] = []
    const pa = b2.diag.projectAll()
    for (const st of b2.app.doc.strokes) {
      const pr = pa[st.id]
      if (!pr) continue
      out.push({ err: Math.hypot(pr.a.x - st.a.x, pr.a.y - st.a.y) + Math.hypot(pr.b.x - st.b.x, pr.b.y - st.b.y) })
    }
    return out
  })
  expect(proj.length).toBe(4) // 승격된 것 전부 — 깊이선 둘도 3D 선이다(지시 1)
  for (const p of proj) expect(p.err).toBeLessThan(1e-3)

  // 대기 획 — 시작점이 3D에 없다. 사라지지 않는다(불변식 j)
  // ⚠ 개수를 박지 않는다 — 깊이선도 이제 3D 대상이라(지시 1) 안 닿으면 함께 대기한다.
  // 재는 것은 «이 획이 대기로 남고 화면에 그려지는가»다.
  // ⚠ 자리를 골라야 한다 — (900,600)은 기존 깊이선의 **연장선 위**라 이제 오스냅이 잡고
  // 3D가 된다(지시 5: 연장선이 좌표를 정한다). 정말로 아무것에도 안 닿는 자리를 쓴다.
  const before = s.waiting.length
  await drawLine(page, 200, 720, 270, 765) // 미연결 — 연장선에도 안 걸린다
  s = await summary(page)
  expect(s.waiting.length).toBe(before + 1)
  expect(await inkPixels(page, 195, 715, 275, 770)).toBeGreaterThan(20)

  // 돌리기 — 형태가 보인다
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(680, 430, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  s = await summary(page)
  const poseMoved = Math.abs(s.pose.q.y) > 1e-4
  expect(poseMoved).toBe(true)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBeGreaterThan(20)

  // 이어 그리기 — 돌린 포즈에서 확정 끝점부터 vp0 축으로
  const aim = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const pa = b2.diag.projectAll()
    const ids = Object.keys(pa).map(Number).sort((a, b) => a - b)
    const endpoint = pa[ids[ids.length - 1]!]!.b
    const vp0 = b2.diag.screenAxes().find((x: any) => x.id === 'vp0')
    return { endpoint, vp: vp0?.vp ?? null }
  })
  expect(aim.vp).not.toBeNull()
  const dx = aim.vp.x - aim.endpoint.x, dy = aim.vp.y - aim.endpoint.y
  const L = Math.hypot(dx, dy)
  const t = Math.min(120, L * 0.4)
  await drawLine(page, aim.endpoint.x, aim.endpoint.y, aim.endpoint.x + dx / L * t, aim.endpoint.y + dy / L * t)
  s = await summary(page)
  expect(s.lifted).toBe(5) // +2: 깊이선 둘도 3D 선이다(지시 1)

  // 실행취소 — 그림만 되돌린다. 카메라(작도)는 그대로
  await page.keyboard.press('Control+z')
  await settle(page)
  s = await summary(page)
  expect(s.lifted).toBe(4) // +2: 깊이선 둘 — 실행취소는 그림만 되돌린다(작도는 그대로)
  expect(s.vps).toHaveLength(2)
  await page.keyboard.press('Control+y')
  await settle(page)
  s = await summary(page)
  expect(s.lifted).toBe(5) // 다시실행 — +2: 깊이선 둘

  // 작도 시점으로 — 지평선·작도선이 다시 보인다
  await page.click('#btn-draw-view')
  await settle(page)
  s = await summary(page)
  expect(Math.abs(s.pose.q.y)).toBeLessThan(1e-12)
  expect(await inkPixels(page, 0, 397, 1200, 404)).toBeGreaterThan(100)

  // ── 2단계: 오스냅 ────────────────────────────────────────────────────
  // 호버 — 수직획 중간 근처에서 근처점 표식이 뜬다
  await page.mouse.move(200, 100) // 먼저 빈 곳
  await settle(page)
  const baseInk = await inkPixels(page, 492, 442, 512, 462) // 흑연 입자 질감이 있을 수 있다
  await page.mouse.move(502, 450)
  await settle(page)
  expect(await inkPixels(page, 492, 442, 512, 462)).toBeGreaterThan(baseInk + 5) // 표식 픽셀 증가

  // 선분 위 시작 — 수직획 사영 위 (500,450)에서 수평으로 → 3D로 올라간다
  const liftedBefore = (await summary(page)).lifted
  await drawLine(page, 502, 450, 650, 452) // 오스냅이 (500,450)으로, 축 스냅이 수평으로
  s = await summary(page)
  expect(s.lifted).toBe(liftedBefore + 1)

  // ── 3단계: 자동 분할 + 지우개 ────────────────────────────────────────
  // 수평획을 관통하는 세로획 → T자에서 수평획이 갈린다
  await drawLine(page, 600, 450, 600, 520)
  s = await summary(page)
  const liftedT = s.lifted
  expect(await glPixels(page, 612, 444, 645, 457)).toBeGreaterThan(5) // 오른쪽 조각이 있다

  // 지우개 — 오른쪽 조각만 지운다 (기본 심 HB → 연필 지우개)
  await page.click('#btn-eraser-pencil')
  await page.mouse.move(630, 450)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
  s = await summary(page)
  expect(s.lifted).toBe(liftedT) // 조각 교체 — 남은 왼쪽 + 세로획은 그대로
  expect(await glPixels(page, 612, 444, 645, 457)).toBe(0) // 지운 자리가 비었다
  expect(await glPixels(page, 500, 444, 596, 457)).toBeGreaterThan(5) // 왼쪽 조각은 남았다

  // 실행취소 — 지우개 한 번이 통째로 돌아온다
  await page.keyboard.press('Control+z')
  await settle(page)
  expect(await glPixels(page, 612, 444, 645, 457)).toBeGreaterThan(5)
  await page.click('#btn-pencil')   // 그리기로 복귀 — 기본 도구는 연필이다(지시 4-h)

  // ── 4단계: 화면 줌(뷰 오프셋) · 뷰 큐브 ─────────────────────────────
  // 그리는 중(작도 포즈)의 줌은 화면 조작 — 문서 좌표는 안 바뀐다
  await page.mouse.move(600, 300)
  await page.mouse.wheel(0, -300)
  await settle(page)
  s = await summary(page)
  expect(s.view.s).toBeGreaterThan(1.05)
  const hy = Math.round(400 * s.view.s + s.view.oy)
  expect(await inkPixels(page, 0, hy - 3, 1200, hy + 4)).toBeGreaterThan(100) // 지평선이 새 화면 위치에

  // 확대 상태에서도 그리기가 성립한다 — 화면 좌표는 역변환되어 문서로
  const sx = 500 * s.view.s + s.view.ox, sy = 450 * s.view.s + s.view.oy
  const liftedZ = s.lifted
  await drawLine(page, sx, sy, sx + 100, sy + 2)
  s = await summary(page)
  expect(s.lifted).toBe(liftedZ + 1)

  // 작도 시점 — 뷰 오프셋도 같이 돌아온다
  await page.click('#btn-draw-view')
  await settle(page)
  s = await summary(page)
  expect(s.view.s).toBe(1)

  // 뷰 큐브 — 우측 상단에 보이고, 면을 클릭하면 롤 0 시점으로 선다
  expect(await inkPixels(page, 1090, 10, 1190, 110)).toBeGreaterThan(10)
  await page.mouse.move(1140, 60)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
  s = await summary(page)
  const movedDist = Math.hypot(s.pose.p.x, s.pose.p.y, s.pose.p.z)
  expect(movedDist).toBeGreaterThan(1) // 시점이 섰다
  const rightY = await page.evaluate(() => {
    const q = (window as any).__b2.app.pose.q
    // right = q · (1,0,0) 의 y 성분 — 롤 0이면 0
    return 2 * (q.x * q.y + q.w * q.z) // 회전행렬 m10
  })
  expect(Math.abs(rightY)).toBeLessThan(1e-6)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBeGreaterThan(20) // 형태가 보인다

  await page.click('#btn-draw-view')

  // ── 6단계: 재료 — 잉크 위 연필 지우개는 잉크를 안 건드린다 (선따기) ──
  // **연필과 펜은 다른 도구다**(지시 4-h) — 잉크는 경도 슬라이더가 아니라 펜을 골라서 나온다.
  await page.click('#btn-pen')
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pen')
  await drawLine(page, 500, 500, 500, 300)      // 기존 흑연 수직획 위에 잉크로 덧긋기
  expect(await page.evaluate(() => {
    const st = (window as any).__b2.app.doc.strokes
    return st[st.length - 1].mat.grade
  })).toBe('INK')                                // 펜으로 그은 획은 잉크다
  s = await summary(page)
  expect(s.lifted).toBeGreaterThan(0)
  await page.click('#btn-eraser-pencil')
  await page.mouse.move(500, 380)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
  // 흑연 조각은 지워졌지만 잉크 선은 그 자리에 남아 있다
  expect(await glPixels(page, 495, 360, 505, 400)).toBeGreaterThan(5)

  // 도구가 그림으로 보인다 — 고른 것이 **앞으로 나온다**(4-d: 박스 강조가 아니다)
  expect(await page.getAttribute('#btn-eraser-pencil', 'class')).toContain('on')
  expect(await page.getAttribute('#btn-pencil', 'class')).not.toContain('on')
  // 굵기 막대는 연필에서 사라지고 펜·지우개에서 뜬다(4-f · 4-e)
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('thick')!).display)).toBe('block')
  await page.click('#btn-pencil')
  await settle(page)
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('thick')!).display)).toBe('none')
  // 홀더펜 창 — 지금 심이 연필 몸통에 보인다(4-e)
  expect(await page.textContent('#lead-text')).toBe('HB')
  await settle(page)

  // ── 5단계: 자동 저장 — 새로고침해도 그림과 카메라(재계산)가 남는다 ──
  const beforeReload = await summary(page)
  await page.waitForTimeout(600) // 자동 저장 디바운스
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(beforeReload.strokes)
  expect(s.vps).toHaveLength(2)
  expect(s.lifted).toBe(beforeReload.lifted)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBeGreaterThan(20)
  // 빌드 식별자가 보인다
  const buildId = await page.textContent('#buildid')
  expect(buildId && buildId.length).toBeGreaterThan(3)

  // ── 비우기 — 확인 한 줄(밑줄 단어) 뒤에 전부 사라지고, 새로고침해도 안 돌아온다 ──
  await page.click('#pane-file > summary')

  // 취소가 실제로 막는다 — 실수 방지가 있는지 이것이 잰다(양성 채널)
  await page.click('#btn-clear')
  expect(await page.locator('#notice u').count()).toBe(2)
  await page.click('#notice u[data-pick="no"]')
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(beforeReload.strokes) // 하나도 안 지워졌다
  expect(await page.locator('#notice u').count()).toBe(0)

  // 비운다 — 그림도 작도도 사라지고 지평선 단계로 돌아간다
  await page.click('#btn-clear')
  await page.click('#notice u[data-pick="yes"]')
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(0)
  expect(s.lifted).toBe(0)
  expect(s.horizonY).toBeNull()
  expect(s.vps).toHaveLength(0)
  expect(await inkPixels(page, 0, 0, 1200, 800)).toBe(0)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBe(0)
  expect(await page.textContent('#notice')).toContain('지평선')

  // 새로고침해도 안 돌아온다 (자동 저장도 지워졌다)
  await page.waitForTimeout(600) // 자동 저장 디바운스가 한 번 더 돌 시간
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(0)
  expect(s.horizonY).toBeNull()
  expect(await inkPixels(page, 0, 0, 1200, 800)).toBe(0)
  expect(await page.evaluate(() => localStorage.getItem('b2-autosave'))).toBeNull()

  // 빈 화면에서 다시 그리기가 처음처럼 된다
  await drawLine(page, 100, 400, 1100, 402)
  s = await summary(page)
  expect(s.horizonY).toBe(400)

  // ── 파일 묶음 대조 — 저장·열기·내보내기가 실제로 도는가 (5단계 UI 점검) ──
  await page.click('#pane-file > summary') // 새로고침으로 접혔다 — 다시 편다
  // 3D가 하나도 없을 때 내보내기는 **빈 파일을 조용히 내려주지 않는다**
  let downloaded = false
  page.once('download', () => { downloaded = true })
  await page.click('#btn-obj')
  await page.waitForTimeout(300)
  expect(downloaded).toBe(false)
  expect(await page.textContent('#notice')).toContain('내보낼 것이 없다')

  // 열기 — 지금 그림(지평선)을 덮으므로 확인을 받는다. 취소하면 그대로다.
  const sample = JSON.stringify({
    format: 'brnl', version: 1, frame: { W: 1200, H: 800 },
    strokes: [
      { id: 1, a: { x: 100, y: 400 }, b: { x: 1100, y: 400 } },
      { id: 2, a: { x: 300, y: 700 }, b: { x: 600, y: 550 } },
      { id: 3, a: { x: 700, y: 700 }, b: { x: 400, y: 550 } },
      { id: 4, a: { x: 500, y: 500 }, b: { x: 500, y: 300 } },
    ],
    nextId: 5, savedViews: [],
  })
  const asFile = { name: 'sample.brnl', mimeType: 'application/json', buffer: Buffer.from(sample) }
  await page.setInputFiles('#file-open', asFile)
  expect(await page.locator('#notice u').count()).toBe(2)
  await page.click('#notice u[data-pick="no"]')
  s = await summary(page)
  expect(s.strokes).toBe(1) // 지평선 하나 — 안 바뀌었다

  await page.setInputFiles('#file-open', asFile)
  await page.click('#notice u[data-pick="yes"]')
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(4)
  expect(s.vps).toHaveLength(2)
  // **깊이선 둘 다 3D다**(지시 1) — 소실점을 만드는 선은 지면이므로 서로 안 닿아도 올라간다.
  // 그전에는 첫 깊이선만 올라가 1이었다. 수직획(#4)은 아무것에도 안 닿아 대기로 남는다.
  expect(s.lifted).toBe(2)
  expect(s.waiting).toEqual([4])

  // 저장·내보내기 — 실제로 파일이 나간다
  const [saved] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save')])
  expect(saved.suggestedFilename()).toBe('drawing.brnl')
  const [obj] = await Promise.all([page.waitForEvent('download'), page.click('#btn-obj')])
  expect(obj.suggestedFilename()).toBe('drawing.obj')
  const [gltf] = await Promise.all([page.waitForEvent('download'), page.click('#btn-gltf')])
  expect(gltf.suggestedFilename()).toBe('drawing.gltf')
})
