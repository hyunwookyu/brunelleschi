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

/** 영역의 실제 그려진 픽셀 수 — 3D 캔버스(gl, preserveDrawingBuffer).
 *  ⚠ web2-18 1부부터 **잉크 확정선의 몸체는 여기 없다**(#ink로 옮겼다 — 연필 흑연이
 *  #gl 위라 잉크가 덮이던 것이 사람이 보고한 결함이었다). 잉크를 재는 자리는 `inkPixels`다. */
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

  // 빈 화면 — 격자가 기본 꺼짐이라는 것이 여기서 픽셀로 선다(3-a).
  // web2-17: **지평선은 빈 문서에도 이미 있다**(H/2=400) — 띠 밖은 0, 띠 안은 잉크가 있다(1-e ②)
  expect(await inkPixels(page, 0, 0, 1200, 380)).toBe(0)
  expect(await inkPixels(page, 0, 420, 1200, 800)).toBe(0)
  expect(await inkPixels(page, 0, 397, 1200, 404)).toBeGreaterThan(100)
  expect(await page.evaluate(() => (window as any).__b2.app.grid)).toBe(false)
  // 표시용(체크박스)과 판정용(app.grid)이 갈리지 않는가 — 기본값이 두 자리에 있다(PITFALLS #54)
  expect(await page.isChecked('#chk-grid')).toBe(false)
  await page.click('#btn-display')                    // 표시는 눈 팝업(web2-19 3-a)
  await page.click('#chk-grid')
  expect(await page.evaluate(() => (window as any).__b2.app.grid)).toBe(true)
  await page.click('#chk-grid')                       // 되돌린다 — 뒤 팔이 격자 픽셀에 안 걸리게
  expect(await page.evaluate(() => (window as any).__b2.app.grid)).toBe(false)
  await page.click('#btn-display')                    // 닫는다
  expect(await inkPixels(page, 0, 0, 1200, 380)).toBe(0)

  // 기본 도구는 연필이고, 상태 줄에는 **첫 안내 하나뿐**이다(4-b)
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pencil')
  expect(await page.textContent('#notice')).toContain('지평선')

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

  // ── 축은 셋이고 서로 직교한다 (web2-03 지시 1) ──────────────────────
  // 사람이 만든 소실점은 둘인데 **✕ 표식이 셋**이었다 — 여분은 화면 평행 가로축 `H`이고,
  // 작도 시점에서는 무한원이라 안 보이다가 **궤도하면 나타났다**(보조 소실점처럼 보인다).
  // 그리고 축 스냅이 거기 걸려 다른 방향 선들이 그어졌다.
  const frame = await page.evaluate(() => (window as any).__b2.diag.frame())
  expect(frame.ids.sort()).toEqual(['V', 'vp0', 'vp1'])       // 넷이 아니라 셋
  for (const d of frame.dots) expect(Math.abs(d)).toBeLessThan(1e-12)  // 서로 직교
  const marksDraw = await page.evaluate(() => (window as any).__b2.diag.vpMarks().map((m: any) => m.id))
  expect(marksDraw.sort()).toEqual(['vp0', 'vp1'])

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
  // web2-16 3-a: 대기 획 몸체는 흑연 파선으로 #brushc가 그린다 — 그 겹에서 잰다
  // (잉크 겹의 벡터 점선은 이 경로에서 없어졌다 — waitfade.spec 3-a 팔이 그 0을 잰다)
  expect(await page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round((x1! - x0!) * dpr); t.height = Math.round((y1! - y0!) * dpr)
    const g = t.getContext('2d')!
    g.drawImage(c, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [195, 715, 275, 770])).toBeGreaterThan(20)

  // 돌리기 — 형태가 보인다.
  // ⚠ **좌우로만 돈다**(dy = 0). 위아래로 돌리면 그것은 «정렬되지 않은 구도»이고,
  //   손을 떼면 잠깐 뒤 정렬로 접힌다(web2-04). 그러면 아래 「이어 그리기」가
  //   접히는 도중에 걸려 시각에 따라 갈린다. **좌우 각도는 정렬된 구도 그대로**이므로
  //   (1점이냐 2점이냐를 정하는 것이 그것이다) 여기서 재려던 것 — 궤도한 포즈에서
  //   이어 그리기 — 은 그대로 선다. 접기 자체는 `e2e/level.spec.ts`가 잰다.
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(680, 400, { steps: 8 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  expect((await page.evaluate(() => (window as any).__b2.diag.level())).level).toBe(true)
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

  // 작도 시점으로 — 작도선이 다시 보인다. 지평선은 자동 숨김(web2-17 5부 — 소실점이
  // 화면 안)이라 체크박스로 켜서 확인하고 되돌린다(자동 상태 복원 — 뒤 팔에 안 새게).
  await page.click('#btn-draw-view')
  await settle(page)
  s = await summary(page)
  expect(Math.abs(s.pose.q.y)).toBeLessThan(1e-12)
  // 측정 창은 소실점 ✕ 표식(100,400)·(900,400)의 십자를 피한다 — x 150~750
  expect(await inkPixels(page, 150, 397, 750, 404)).toBe(0)  // 자동 숨김 — 소실점이 보인다
  await page.click('#btn-display')                    // 표시는 눈 팝업(web2-19 3-a)
  await page.click('#chk-horizon')
  await settle(page)
  expect(await inkPixels(page, 150, 397, 750, 404)).toBeGreaterThan(100)  // 켜면 그 자리에 있다
  // pref(켬)는 이 뒤로 유지한다 — 아래 줌 구간(282행)이 지평선 위치를 픽셀로 재고,
  // 비우기(clearAll)가 자동(null)으로 되돌리는 것까지가 5부 규칙이라 그 복원도 함께 재진다.
  await page.click('#btn-display')                    // 닫는다
  await settle(page)

  // ── 2단계: 오스냅 ────────────────────────────────────────────────────
  // 호버 — 수직획 중간 근처에서 근처점 표식이 뜬다
  await page.mouse.move(200, 100) // 먼저 빈 곳
  await settle(page)
  const baseInk = await inkPixels(page, 492, 442, 512, 462) // 흑연 입자 질감이 있을 수 있다
  await page.mouse.move(502, 450)
  await settle(page)
  expect(await inkPixels(page, 492, 442, 512, 462)).toBeGreaterThan(baseInk + 5) // 표식 픽셀 증가

  // 선분 위 시작 — 수직획 사영 위 (500,450)에서 **vp1 축**으로 → 3D로 올라간다.
  // ⚠ 원래 「수평으로」였다. 2점 프레임은 {vp0, vp1, V} 셋이고 화면 수평은 축이 아니다
  //    (web2-03 지시 1) — 축 스냅이 늘 셋 중 하나로 보내므로 그 획은 vp1로 간다.
  //    vp1=(100,400)이므로 (500,450)을 지나는 그 축선은 y = 450 + (x−500)·0.125다.
  const liftedBefore = (await summary(page)).lifted
  // ⚠ 끝점 자리를 **재서** 골랐다: (650,470)은 오스냅이 먼저 잡아(점이 방향을 이긴다)
  //    자유 방향이 되고 대기로 남았다. (680,476)이 vp1 축으로 확정된다(실측).
  await drawLine(page, 502, 450, 680, 476)
  s = await summary(page)
  expect(s.lifted).toBe(liftedBefore + 1)
  expect(await page.evaluate(() => {
    const b2 = (window as any).__b2
    const st = b2.app.doc.strokes[b2.app.doc.strokes.length - 1]
    return b2.app.lift.lifted.get(st.id)?.axis
  })).toBe('vp1')


  // ── 3단계: 자동 분할 + 지우개 ────────────────────────────────────────
  // 그 획을 관통하는 세로획 → T자에서 갈린다. 축선 위 x=600 → y=462.5
  await drawLine(page, 600, 462.5, 600, 530)
  s = await summary(page)
  const liftedT = s.lifted
  expect(await glPixels(page, 612, 458, 660, 478)).toBeGreaterThan(5) // 오른쪽 조각이 있다

  // 지우개 — 오른쪽 조각만 지운다 (기본 심 HB → 연필 지우개)
  await page.click('#btn-eraser-pencil')
  await page.mouse.move(630, 466.25)
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
  s = await summary(page)
  expect(s.lifted).toBe(liftedT) // 조각 교체 — 남은 왼쪽 + 세로획은 그대로
  expect(await glPixels(page, 612, 458, 660, 478)).toBe(0) // 지운 자리가 비었다
  expect(await glPixels(page, 505, 444, 596, 466)).toBeGreaterThan(5) // 왼쪽 조각은 남았다

  // 실행취소 — 지우개 한 번이 통째로 돌아온다
  await page.keyboard.press('Control+z')
  await settle(page)
  expect(await glPixels(page, 612, 458, 660, 478)).toBeGreaterThan(5)
  await page.click('#btn-pencil'); await page.click('#tray-HB')   // 그리기로 복귀 — 연필통을 열어 HB(3-b')

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
  // ⚠⚠ **자리를 여기 상수로 적지 않는다**(#88 · web2-31 3번이 고쳤다): 종전에는 `(1090,60)`을
  //   박아 뒀고, web2-31 1번이 화살표를 넣으며 큐브를 `cx W−128 · cy 78`로 물리자 그 좌표가
  //   **면이 아니라 다른 자리**가 돼 이 칸이 조용히 빨개졌다(그 회차는 「종전 클릭 자리는
  //   여전히 면이다」로 적었는데 실측이 아니었다). 판별: ① 이 수가 다른 요소의 현재 자리인가
  //   ② 그 요소를 옮기는 사람이 여기를 볼 이유가 있는가 → 예/아니오이므로 **상수 ⛔**.
  //   자리는 `app.cubeLayout`에서 읽는다 — 큐브를 옮기면 팔이 따라온다.
  const cube = await page.evaluate(() => (window as any).__b2.app.cubeLayout)
  expect(await inkPixels(page, cube.cx - 50, cube.cy - 50, cube.cx + 50, cube.cy + 50)).toBeGreaterThan(10)
  // ⚠⚠ **가운데는 이제 「투시」다**(web2-42 1번 — 일곱 뷰의 가운데): 자세를 안 바꾸고
  //   투영만 원근으로 되돌린다. 그래서 «면을 클릭한다»는 이 칸은 **면 자리**를 짚는다 —
  //   가운데 원(`C.CUBE_CENTER_R`) 밖이고 실루엣 안이다. 배수는 앱에서 읽는다(#88).
  //   그리고 면 전환은 **보간한다**(TURN_ANIM_MS) — 끝날 때까지 기다린 뒤 자세를 읽는다.
  const cr = await page.evaluate(() => (window as any).__b2.diag.view42().centerR)
  await page.mouse.move(cube.cx + cube.size * (cr + 0.13), cube.cy)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(500)
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

  // **궤도한 시점에서도** ✕ 표식은 사람이 만든 소실점 둘뿐이다(web2-03 지시 1).
  // 여기가 여분의 소실점이 보이던 자리다 — 화면 평행 축이 유한한 수렴점을 갖는다.
  const orbitAxes = await page.evaluate(() => (window as any).__b2.diag.screenAxes().map((a: any) => a.id))
  expect(orbitAxes.sort()).toEqual(['V', 'vp0', 'vp1'])   // 축 후보 자체가 셋이다

  /** 지금 포즈에서 ✕ 표식이 붙는 축 — 앱이 그리는 목록 그대로 */
  const markIds = () => page.evaluate(() => (window as any).__b2.diag.vpMarks().map((m: any) => m.id))
  // 큐브 면을 눌러 선 시점은 vp0 정면이라 vp1이 무한원으로 간다 → 표식 하나(실측).
  // **요점은 개수가 아니라 «H가 없다»는 것**이다 — 고치기 전에는 여기에 H가 함께 찍혔다.
  // ⚠⚠ 면은 이제 **평행**이라(web2-42 1번) 소실점이 아예 없다 — 그 상태에서 이 칸을
  //    재면 «H가 없다»가 **거저 통과**한다(#86). 그래서 가운데 「투시」로 원근을 되돌린 뒤
  //    같은 자세에서 잰다: 재는 것은 종전 그대로 «그 자세의 표식 목록»이다.
  expect(await markIds(), '평행에는 소실점이 없다').toEqual([])
  await page.mouse.move(cube.cx, cube.cy)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(500)
  await settle(page)
  // ⚠ **어느 축의 정면인지는 짚은 면이 정한다**(42-1로 짚는 자리가 가운데 밖으로 옮겨졌다) —
  //   재는 것은 「하나뿐이고 그것이 사람이 만든 소실점이다」이지 그 이름이 아니다.
  const faceMarks = await markIds()
  expect(faceMarks.length, '축 정면 — 나머지 가로축은 무한원으로 간다').toBe(1)
  expect(['vp0', 'vp1'], 'H가 아니다 — 그것이 이 칸의 요점이다').toContain(faceMarks[0])

  // 일반 궤도(면 정렬이 아닌 자세)에서도 마찬가지다 — 가운데 버튼 끌기
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(660, 430, { steps: 6 })
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const gen = await markIds()
  expect(gen.length).toBeGreaterThan(0)
  for (const id of gen) expect(['vp0', 'vp1']).toContain(id)   // 사람이 만든 것만

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
  // ⚠ **읽는 겹이 `#gl`에서 `#ink`로 바뀌었다**(web2-18 1부): 잉크 확정선의 몸체가
  //    Line2(#gl)에서 2D 오버레이(#ink)로 옮겨 갔다 — 연필 흑연(#brushc)이 #gl 위라
  //    잉크가 덮이던 것이 사람이 보고한 결함이었다. 재는 것은 그대로(「잉크가 그 자리에
  //    남아 있다」)이고 **임계도 그대로**다(5). 옛 판정을 임계로 되살리지 않는다.
  expect(await inkPixels(page, 495, 360, 505, 400)).toBeGreaterThan(5)

  // 도구가 그림으로 보인다 — 고른 것이 **앞으로 나온다**(4-d: 박스 강조가 아니다)
  expect(await page.getAttribute('#btn-eraser-pencil', 'class')).toContain('on')
  expect(await page.getAttribute('#tray-HB', 'class')).not.toContain('on')
  // ⚠⚠ **굵기 막대(#thick)는 web2-34 3번에 사라졌다**(화면 규칙 R1 — 지우개의 크기도
  //   이제 «고르는 것»이다). 그래서 이 줄이 묻는 것이 바뀌었다: 「연필에서 없고 지우개에서
  //   뜨는가」가 아니라 **「어떤 상태에서도 없는가」**이고, 지금 크기는 **접힌 지우개의
  //   각인**이 말한다(R6). 임계를 문 것이 아니라 팔이 무엇을 묻는지를 고친 것이다(#76 ㉣).
  //   ⚠ 이 줄은 34-3이 요소를 지우면서 안 고쳐 **선재로 빨갰다**(34-4가 찾아 고쳤다 — #80).
  expect(await page.locator('#thick').count(), '지우개 상태에서도 막대가 없다').toBe(0)
  expect(await page.textContent('#fold-erase-pencil-text'), '접힌 지우개가 지금 크기를 말한다').toMatch(/^\d+$/)
  await page.click('#btn-pencil'); await page.click('#tray-HB')   // 연필통을 열어 고른다(3-b')
  await settle(page)
  expect(await page.locator('#thick').count(), '연필 상태에서도 없다').toBe(0)
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

  // 취소가 실제로 막는다 — 실수 방지가 있는지 이것이 잰다(양성 채널).
  // 확인은 버튼 곁 팝오버다(web2-12 4번 — 상부 알림줄에서 옮겨왔다).
  await page.click('#btn-clear')
  expect(await page.locator('#confirm-pop u').count()).toBe(2)
  // ⚠ 확인이 버튼과 **겹치지 않는다** — 같은 자리 연타로 지워지는 사고의 방어(D-3:
  // 실제로 연타한다 — 버튼 자리를 다시 눌러도 «비운다»가 눌리지 않아야 한다)
  const clearBox = (await page.locator('#btn-clear').boundingBox())!
  const popBox = (await page.locator('#confirm-pop').boundingBox())!
  expect(popBox.x + popBox.width).toBeLessThanOrEqual(clearBox.x + 1)  // 팝오버는 버튼 왼쪽
  await page.mouse.click(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2)
  await page.mouse.click(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2)
  await settle(page)
  s = await summary(page)
  expect(s.strokes, '연타로 지워지지 않는다').toBe(beforeReload.strokes)
  // 바깥(캔버스) 누름 = 취소
  await page.click('#btn-clear')
  await page.mouse.click(300, 300)
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(beforeReload.strokes) // 하나도 안 지워졌다
  expect(await page.locator('#confirm-pop').count()).toBe(0)
  // ⚠⚠ **web2-34 4번(화면 규칙 R7)이 이 자리를 뒤집었다.** 종전 주석은 「바깥 누름은
  //   팝오버만 걷고 details는 안 닫는다」였는데, 사람의 말이 바로 그 구멍이었다
  //   (「통을 열어놓고 다른 버튼을 누르면 접혀야 한다」) — 이제 **서랍도 접힌다.**
  //   임계를 문 것이 아니라 팔이 묻는 것을 새 규칙으로 다시 적는다(#76 ㉣): 확인이
  //   걷히는 것과 **서랍이 접히는 것**을 둘 다 단언한다.
  expect(await page.evaluate(() => (document.getElementById('pane-file') as HTMLDetailsElement).open),
    'R7 — 바깥(캔버스)을 누르면 서랍도 접힌다').toBe(false)

  // 비운다 — 그림도 작도도 사라지고 지평선 단계로 돌아간다(서랍을 다시 연다)
  await page.click('#pane-file > summary')
  await page.click('#btn-clear')
  await page.click('#confirm-pop u[data-pick="yes"]')
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(0)
  expect(s.lifted).toBe(0)
  expect(s.horizonY).toBe(400)   // web2-17: 지평선은 상시(H/2) — 비워도 그 자리다
  expect(s.vps).toHaveLength(0)
  expect(await inkPixels(page, 0, 0, 1200, 380)).toBe(0)   // 지평선 띠 밖 — 빈 종이
  expect(await inkPixels(page, 0, 420, 1200, 800)).toBe(0)
  expect(await glPixels(page, 0, 0, 1200, 800)).toBe(0)
  expect(await page.textContent('#notice')).toContain('지평선')

  // 새로고침해도 안 돌아온다 (자동 저장도 지워졌다)
  await page.waitForTimeout(600) // 자동 저장 디바운스가 한 번 더 돌 시간
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(0)
  expect(s.horizonY).toBe(400)   // web2-17: 상시
  // 지평선 띠는 상시로 그려진다 — «빈 화면 0»은 지평선 띠 밖에서 잰다
  expect(await inkPixels(page, 0, 0, 1200, 380)).toBe(0)
  expect(await inkPixels(page, 0, 397, 1200, 404)).toBeGreaterThan(100)
  expect(await page.evaluate(() => localStorage.getItem('b2-autosave'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('b2-autosave2'))).toBeNull()

  // 빈 화면에서 다시 그리기가 처음처럼 된다
  await drawLine(page, 100, 400, 1100, 402)
  s = await summary(page)
  expect(s.horizonY).toBe(400)

  // ── 파일 묶음 대조 — 저장·열기·내보내기가 실제로 도는가 (5단계 UI 점검) ──
  // ⚠ **web2-28 1번부터 명령을 실행하면 서랍이 접힌다** — 그러므로 서랍의 명령을 누르기
  //   전마다 편다. 이 팔이 지키는 요구(「저장·열기·내보내기가 실제로 돈다」)는 그대로이고
  //   몸짓이 한 번씩 는다(#75 ㉣ — 형태가 갈리면 그 형태를 읽던 팔의 몸짓도 갈린다).
  const openPane = async () => {
    if (!(await page.evaluate(() => (document.getElementById('pane-file') as HTMLDetailsElement).open))) {
      await page.click('#pane-file > summary')
    }
  }
  await openPane() // 새로고침으로 접혔다 — 다시 편다
  // 3D가 하나도 없을 때 내보내기는 **빈 파일을 조용히 내려주지 않는다**
  let downloaded = false
  page.once('download', () => { downloaded = true })
  await (await openPane(), page.click('#btn-obj'))
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
    nextId: 5,
  })
  const asFile = { name: 'sample.brnl', mimeType: 'application/json', buffer: Buffer.from(sample) }
  await openPane()
  await page.setInputFiles('#file-open', asFile)
  // ⚠ 파일 읽기가 비동기다(`await f.text()`) — 세는 순간 아직 안 떴을 수 있다.
  //   **기다리는 단언**으로 바꾼다(값은 그대로 2 — 약해지지 않는다).
  await expect(page.locator('#confirm-pop u')).toHaveCount(2)  // 열기 버튼 곁(web2-12 4번)
  await page.click('#confirm-pop u[data-pick="no"]')
  s = await summary(page)
  expect(s.strokes).toBe(1) // 지평선 하나 — 안 바뀌었다

  await openPane()
  await page.setInputFiles('#file-open', asFile)
  await page.click('#confirm-pop u[data-pick="yes"]')
  await settle(page)
  s = await summary(page)
  expect(s.strokes).toBe(3)      // web2-17 2-b: v1의 지평선 획은 변환이 버린다
  expect(s.vps).toHaveLength(2)
  // **깊이선 둘 다 3D다**(지시 1) — 소실점을 만드는 선은 지면이므로 서로 안 닿아도 올라간다.
  // 그전에는 첫 깊이선만 올라가 1이었다. 수직획(#4)은 아무것에도 안 닿아 대기로 남는다.
  expect(s.lifted).toBe(2)
  expect(s.waiting).toEqual([4])

  // 저장·내보내기 — 실제로 파일이 나간다
  const [saved] = await Promise.all([page.waitForEvent('download'), (await openPane(), page.click('#btn-save'))])
  expect(saved.suggestedFilename()).toBe('drawing.brnl')
  const [obj] = await Promise.all([page.waitForEvent('download'), (await openPane(), page.click('#btn-obj'))])
  expect(obj.suggestedFilename()).toBe('drawing.obj')
  const [gltf] = await Promise.all([page.waitForEvent('download'), (await openPane(), page.click('#btn-gltf'))])
  expect(gltf.suggestedFilename()).toBe('drawing.gltf')
})
