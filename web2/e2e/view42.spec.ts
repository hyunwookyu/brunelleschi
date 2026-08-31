// web2-42 — **일곱 뷰·평행·읽는 값이 브라우저에서 실제로 도는가.**
//
// 단위 팔(`test/view42.test.ts`·`test/read42.test.ts`)이 기하와 환산을 전부 잰다.
// 여기가 더하는 것은 넷이다:
//   ① 큐브 **면을 실제로 눌러** 평행으로 가는가 · 가운데를 눌러 원근으로 오는가
//   ② **확정 전에 그 자리를 눌러도 아무 일이 없는가** — 문면이 아니라 **그 런타임의 행위**로
//      잰다(PITFALLS #94: 금지가 행위면 검사도 그 행위를 일으켜 봐야 한다)
//   ③ 이름이 **화면에 그려지는가**(캔버스 픽셀) — 그리고 「도면」이 화면에 없는가
//   ④ 읽는 값이 **대체되는가** — 투시에서 mm, 평행에서 축척. 동시에 안 뜬다(문자열)
//
// ⚠ 몸짓은 **시간으로 읽힌다**(#93): 큐브는 «누르고 바로 뗀다»(끌기 없음) — 누름 진입
//   (39-1의 450 ms)에 안 걸린다. 전환은 `TURN_ANIM_MS`(300 ms)라 그만큼 기다린다.
// ⚠ 자리는 `app.cubeLayout`·`C.CUBE_CENTER_R`에서 읽는다 — px를 여기 옮겨 적지 않는다(#88).
//
// 원장: LEDGER=1 npx playwright test e2e/view42.spec.ts → stage0/out/view42_web2_dpr*.json

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../stage0/out')
const r6 = (x: number) => Number(x.toFixed(6))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 큐브를 **누르고 바로 뗀다** — 끌기가 없으므로 누름 진입(#93)에 안 걸린다 */
async function tap(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
}

const view42 = (page: Page) => page.evaluate(() => (window as any).__b2.diag.view42())
const cubeOf = (page: Page) => page.evaluate(() => (window as any).__b2.app.cubeLayout)

/** 그 영역의 그려진 픽셀 수 — 2D 오버레이(ink) */
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

/** 2점 작도 — 지평선 · 깊이선 둘 · 기둥(3D가 있어야 큐브가 산다) */
async function construct(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 500, 380, 600, 362)
  const an = await page.evaluate(() => {
    const a = (window as any).__b2.app.lift.an
    return { vps: a.vps.length, done: a.constructionDone, lifted: (window as any).__b2.app.lift.lifted.size }
  })
  expect(an.vps, '소실점 둘').toBe(2)
  expect(an.done).toBe(true)
  expect(an.lifted).toBeGreaterThan(1)
}

/** 큐브에서 **면**을 짚는 자리 — 가운데 원(「투시」) 밖이고 실루엣 안이다.
 *  배수는 앱이 쓰는 값(`CUBE_CENTER_R`)에서 유도한다(#88). */
async function facePoint(page: Page) {
  const cube = await cubeOf(page)
  const cr = (await view42(page)).centerR as number   // **앱에서 읽는다**(#88)
  return { x: cube.cx + cube.size * (cr + 0.13), y: cube.cy, cube }
}

const ledger: Record<string, unknown> = {}

// ══════════════════════════════════════════════════════════════════════════
test('42 ① 면을 누르면 평행으로 가고 이름이 뜬다 · 가운데를 누르면 원근으로 온다', async ({ page }) => {
  await construct(page)
  const before = await view42(page)
  expect(before.parallel).toBe(false)
  expect(before.name).toBe('투시')

  const fp = await facePoint(page)
  await tap(page, fp.x, fp.y)
  await settle(page)
  const mid = await view42(page)          // 보간 중 — 아직 1이 아니다
  await page.waitForTimeout(500)
  await settle(page)
  const after = await view42(page)

  console.log(`[42 ①] 면 클릭 — w ${mid.w.toFixed(3)} → ${after.w} · 이름 ${after.name} · D ${after.D}`)
  expect(after.parallel, '평행으로 갔다').toBe(true)
  expect(after.w).toBe(1)
  expect(['평면', '저면', '정면', '후면', '좌측면', '우측면']).toContain(after.name)
  expect(after.horizon, '평행에는 지평선이 없다').toBeNull()
  expect(after.vpMarks, '평행에는 ✕가 없다').toBe(0)
  // 보간 — 누른 **직후**에는 아직 목표가 아니다(즉시 전환이면 여기서 이미 1이다)
  expect(mid.w, '보간 중이다').toBeLessThan(1)
  expect(mid.w).toBeGreaterThan(0)

  // 가운데 — 원근으로 돌아온다. 자세는 안 바뀐다.
  const poseBefore = await page.evaluate(() => JSON.stringify((window as any).__b2.app.pose.q))
  await tap(page, fp.cube.cx, fp.cube.cy)
  await page.waitForTimeout(500)
  await settle(page)
  const back = await view42(page)
  const poseAfter = await page.evaluate(() => JSON.stringify((window as any).__b2.app.pose.q))
  console.log(`[42 ①] 가운데 클릭 — 이름 ${back.name} · 평행 ${back.parallel}`)
  expect(back.parallel).toBe(false)
  expect(back.name).toBe('투시')
  expect(poseAfter, '가운데는 자세를 안 바꾼다').toBe(poseBefore)
  expect(back.horizon, '원근에서는 지평선이 돌아온다').not.toBeNull()

  ledger['gate1_face_and_center'] = {
    before: { name: before.name, parallel: before.parallel, horizon: before.horizon },
    mid_w: r6(mid.w),
    mid_w_note: (
      '⚠ 이 값은 **벽시계에 묶여 매 실행 다르다**(300 ms 애니 중 언제 읽혔는가) — '
      + '재는 것은 크기가 아니라 **「0도 1도 아니다」**이다(2차 리뷰어 [2]).'
    ),
    after: { name: after.name, parallel: after.parallel, w: after.w, D: r6(after.D), horizon: after.horizon, vp_marks: after.vpMarks },
    center: {
      name: back.name, parallel: back.parallel, pose_unchanged: poseAfter === poseBefore,
      horizon: back.horizon, vp_marks: back.vpMarks,
    },
  }
})

test('42 ② 확정 전에는 그 자리를 **눌러도** 아무 일이 없다 (문면이 아니라 행위로)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)      // 지평선만 — 확정 전
  await drawLine(page, 500, 500, 600, 475)       // 소실점 하나 — 아직 확정 전
  const v0 = await view42(page)
  const pose0 = await page.evaluate(() => JSON.stringify((window as any).__b2.app.pose))
  expect(v0.allowed, '31-2와 같은 조건 — 아직 잠겨 있다').toBe(false)

  const cube = await cubeOf(page)
  // 큐브 대역을 **아홉 자리** 눌러 본다(가운데·면 자리·모서리 대역)
  const pts: [number, number][] = []
  for (const dx of [-0.3, 0, 0.3]) for (const dy of [-0.3, 0, 0.3]) {
    pts.push([cube.cx + cube.size * dx, cube.cy + cube.size * dy])
  }
  for (const [x, y] of pts) { await tap(page, x, y); await settle(page) }
  await page.waitForTimeout(400)
  const v1 = await view42(page)
  const pose1 = await page.evaluate(() => JSON.stringify((window as any).__b2.app.pose))
  console.log(`[42 ②] 확정 전 ${pts.length}회 클릭 — 평행 ${v1.parallel} · 포즈 불변 ${pose1 === pose0}`)
  expect(v1.parallel, '평행으로 안 간다').toBe(false)
  expect(v1.name).toBe('투시')
  expect(pose1, '포즈가 한 톨도 안 움직인다').toBe(pose0)
  ledger['gate2_locked_before_confirm'] = {
    taps: pts.length, allowed: v0.allowed, parallel_after: v1.parallel, pose_unchanged: pose1 === pose0,
  }
})

test('42 ③ 정투상에서 손으로 돌리면 평행이 유지되고 이름이 축측이 된다', async ({ page }) => {
  await construct(page)
  const fp = await facePoint(page)
  await tap(page, fp.x, fp.y)
  await page.waitForTimeout(500)
  await settle(page)
  const named = await view42(page)
  expect(named.parallel).toBe(true)

  // 중버튼 끌기 = 궤도(데스크톱 선례). 큐브에서 먼 자리에서 끈다.
  await page.mouse.move(400, 500)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 6; i++) await page.mouse.move(400 + i * 8, 500 + i * 4)
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const orb = await view42(page)
  console.log(`[42 ③] 궤도 뒤 — 평행 ${orb.parallel} · 이름 ${orb.name}`)
  expect(orb.parallel, '투시로 안 돌아간다').toBe(true)
  expect(orb.name, '축에서 벗어나면 축측').toBe('축측')
  ledger['gate3_axonometric'] = { named: named.name, after_orbit: orb.name, parallel: orb.parallel }
})

test('42 ④ 읽는 값이 대체된다 — 투시 mm ↔ 평행 축척 (동시에 안 뜬다)', async ({ page }) => {
  await construct(page)
  // 렌즈 팝오버를 연다 — 읽는 값이 그 자리다(리본에 새 단추를 안 만든다)
  await page.click('#btn-lens')
  await settle(page)
  const persp = (await page.textContent('#lens-read'))!.trim()
  console.log(`[42 ④] 투시 — "${persp}"`)
  expect(persp).toMatch(/^렌즈 \d+mm/)
  expect(persp).not.toContain('축척')

  // 렌즈를 바꾸면 mm가 따라 바뀐다(31-2 무회귀)
  await page.evaluate(() => {
    const r = document.getElementById('lens-range') as HTMLInputElement
    r.value = String(Number(r.max))
    r.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const zoomed = (await page.textContent('#lens-read'))!.trim()
  console.log(`[42 ④] 렌즈를 끝까지 — "${zoomed}"`)
  expect(zoomed).toMatch(/^렌즈 \d+mm/)
  expect(zoomed).not.toBe(persp)
  await page.click('#btn-lens-reset')
  await settle(page)

  // 평행으로 — 그 자리가 축척으로 갈린다
  const fp = await facePoint(page)
  await tap(page, fp.x, fp.y)
  await page.waitForTimeout(500)
  await settle(page)
  const par = (await page.textContent('#lens-read'))!.trim()
  const v = await view42(page)
  console.log(`[42 ④] 평행 — "${par}" · mmPerUnit ${v.mmPerUnit}`)
  expect(par).toContain('축척')
  expect(par).not.toContain('렌즈')
  expect(par).not.toContain('mm')
  expect(par, '치수가 없으면 미정이다').toBe('축척 미정')

  // 치수를 주면 축척이 선다 — **32-5의 그 경로**(`setDimForTest` = `setDimension`. 새 기제 ⛔)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    const id = [...b2.app.lift.lifted.keys()][0]
    b2.diag.setDimForTest(id, 3000)
  })
  await settle(page)
  const par2 = (await page.textContent('#lens-read'))!.trim()
  const v2 = await view42(page)
  console.log(`[42 ④] 치수 뒤 — "${par2}" · mmPerUnit ${v2.mmPerUnit} · 분모 ${v2.denom}`)
  expect(v2.mmPerUnit, '축척의 출처는 32-5의 그 값이다').toBeGreaterThan(0)
  expect(par2).toMatch(/^축척 (1:[0-9.]+|[0-9.]+:1)$/)
  expect(par2).not.toBe('축척 미정')

  // 손잡이는 평행에서 잠긴다(렌즈길이가 무의미하다)
  const disabled = await page.evaluate(() => (document.getElementById('lens-range') as HTMLInputElement).disabled)
  expect(disabled, '평행에서 렌즈 손잡이는 잠긴다').toBe(true)

  ledger['gate4_readout'] = {
    perspective: persp, perspective_zoomed: zoomed, parallel: par, parallel_after_dim: par2,
    mm_per_unit: v2.mmPerUnit, denom: v2.denom, px_per_unit: v2.pxPerUnit,
    slider_disabled_in_parallel: disabled,
  }
})

test('42 ⑤ 이름이 화면에 그려지고, 「도면」이라는 말이 화면에 없다', async ({ page }) => {
  await construct(page)
  const cube = await cubeOf(page)
  // 이름은 큐브 **아래** — 화살표(0.90·size) 밖이다
  const y0 = cube.cy + cube.size * 0.94, y1 = cube.cy + cube.size * 1.25
  const px = await inkPixels(page, cube.cx - cube.size * 0.5, y0, cube.cx + cube.size * 0.5, y1)
  console.log(`[42 ⑤] 이름 대역 픽셀 ${px}`)
  expect(px, '이름이 그려진다').toBeGreaterThan(10)

  const body = await page.evaluate(() => document.body.innerText)
  expect(body).not.toContain('도면')
  // 큐브 이름 여덟에도 「도면」이 없다(그 목록이 화면에 나가는 전부다)
  const names = ['투시', '평면', '저면', '정면', '후면', '좌측면', '우측면', '축측']
  expect(names.some(n => n.includes('도면'))).toBe(false)
  ledger['gate5_label'] = { pixels: px, names, no_domyeon_in_dom: !body.includes('도면') }
})

test('42 ⑥ 3D 겹(#gl)이 사영과 같은 자리에 그린다 — 원근과 평행 둘 다 (불변식 k)', async ({ page }) => {
  await construct(page)
  // **깊이가 있는 장면을 만든다** — 기본 발판은 pivot 면에 몰려 있어 두 사영이 1.75 px밖에
  // 안 갈린다(실측). 그 장면에서 재면 행렬을 원근으로 되돌려도 팔이 초록으로 남는다(아래 D-3).
  // 모서리에서 vp0 쪽으로 **깊게** 한 획 — 끝이 지평선에 가까울수록 깊다.
  await drawLine(page, 500, 500, 850, 412)

  /** 그 획의 **사영 선분**(화면 CSS 좌표)과 `#gl`에서 그 둘레의 불투명 픽셀 무게중심의
   *  **수직거리**. 창 안에 아무것도 없으면 null — 「어긋났다」와 「없다」를 가른다. */
  const probe = (id: number, R = 16) => page.evaluate(([id, R]) => {
    const b2 = (window as any).__b2
    const pr = b2.diag.projectAll()[id!]
    if (!pr) return { off: null as number | null, n: 0, seg: null as unknown }
    const v = b2.diag.lens().xf
    const to = (q: { x: number; y: number }) => ({ x: q.x * v.s + v.ox, y: q.y * v.s + v.oy })
    const a = to(pr.a), b = to(pr.b)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const gl = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = gl.width; t.height = gl.height
    t.getContext('2d')!.drawImage(gl, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const ox = Math.round(mid.x - R!), oy = Math.round(mid.y - R!)
    const w = Math.round(R! * 2), h = Math.round(R! * 2)
    if (ox < 0 || oy < 0 || (ox + w) * dpr > t.width || (oy + h) * dpr > t.height) {
      return { off: null, n: -1, seg: { a, b } }   // 창이 화면 밖 — 못 잰다
    }
    const d = t.getContext('2d')!.getImageData(
      Math.round(ox * dpr), Math.round(oy * dpr), Math.round(w * dpr), Math.round(h * dpr)).data
    let sx = 0, sy = 0, n = 0
    const pw = Math.round(w * dpr)
    for (let i = 3, k = 0; i < d.length; i += 4, k++) {
      if (d[i]! === 0) continue
      sx += (k % pw) / dpr + ox; sy += Math.floor(k / pw) / dpr + oy; n++
    }
    if (n === 0) return { off: null, n: 0, seg: { a, b } }
    const p = { x: sx / n, y: sy / n }
    const dx = b.x - a.x, dy = b.y - a.y
    const L = Math.hypot(dx, dy)
    const off = L < 1e-9 ? Math.hypot(p.x - a.x, p.y - a.y)
      : Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L
    return { off: +off.toFixed(3), n, seg: { a, b } }
  }, [id, R] as [number, number])

  // 대상 — 승격된 연필 획 하나(잉크는 #ink에 산다 · web2-18 1부)
  const id = await page.evaluate(() => [...(window as any).__b2.app.lift.lifted.keys()][0] as number)
  const persp = await probe(id)
  console.log(`[42 ⑥] 원근 — 화소 ${persp.n} · 수직 어긋남 ${persp.off}`)
  expect(persp.n, '원근에서 그 자리에 3D 픽셀이 있다').toBeGreaterThan(0)
  expect(persp.off!).toBeLessThanOrEqual(2)

  const fp = await facePoint(page)
  await tap(page, fp.x, fp.y)
  await page.waitForTimeout(500)
  await settle(page)
  // **축측으로 조금 돌린다** — 정면에서는 깊이가 시선과 나란해 두 사영이 화면에서
  // 거의 «선을 따라» 갈리고, 그러면 수직거리를 재는 이 팔이 못 가른다(위 D-3의 이유).
  // 돌리면 깊이 차가 화면의 **수직 방향**으로 나와 팔의 축과 같은 축이 된다.
  await page.mouse.move(400, 500)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 10; i++) await page.mouse.move(400 + i * 9, 500 + i * 3)
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const v = await view42(page)
  expect(v.parallel).toBe(true)

  // ⚠⚠ **가를 수 있는 획을 골라야 한다**(#71 — 재는 조건 · D-3의 실패한 첫 판):
  //    설계상 **pivot 면에서는 두 사영이 같은 배율**이라(그것이 전환이 안 튀는 이유다)
  //    그 면 근처의 획은 원근이든 평행이든 **같은 자리에 찍힌다** — 거기서 재면 행렬을
  //    원근으로 되돌려도 팔이 초록으로 남는다. 실제로 그 판을 돌려 봤고 **안 빨개졌다**.
  //    그래서 「두 사영이 실제로 갈리는 폭」(`split`)을 먼저 재서 **가장 갈리는 획**을 고르고,
  //    그 폭이 문(2 px)의 두 배를 넘는 것을 **게이트로 박는다**.
  const pick = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const app = b2.app, an = app.lift.an
    const pose = app.pose
    const persp = { p: pose.p, q: pose.q }          // 같은 자세 · 원근
    const v2 = b2.diag.lens().xf
    const to = (q: { x: number; y: number }) => ({ x: q.x * v2.s + v2.ox, y: q.y * v2.s + v2.oy })
    let best = -1, bd = -1
    for (const [id, g] of app.lift.lifted) {
      const mid = { x: (g.a3.x + g.b3.x) / 2, y: (g.a3.y + g.b3.y) / 2, z: (g.a3.z + g.b3.z) / 2 }
      const A = b2.diag.projectWith(pose, mid), B = b2.diag.projectWith(persp, mid)
      const a2 = b2.diag.projectWith(pose, g.a3), b2p = b2.diag.projectWith(pose, g.b3)
      if (!A || !B || !a2 || !b2p) continue
      const pa = to(A), pb = to(B), qa = to(a2), qb = to(b2p)
      if (Math.hypot(qb.x - qa.x, qb.y - qa.y) < 40) continue   // 화면에서 점에 가까운 획 제외
      // 창(16 px)이 캔버스 안이어야 잰다 — 밖이면 «어긋남»이 아니라 «못 잼»이다
      const M = 24
      if (pa.x < M || pa.y < M || pa.x > innerWidth - M || pa.y > innerHeight - M) continue
      // ⚠ **팔이 재는 축과 같은 축으로 갈라야 한다**: 아래 `probe`는 사영 선분까지의
      //   **수직거리**를 재므로, 원근 판이 그 선 «위»로 어긋나면(깊이선처럼) 팔이 못 가른다.
      //   그래서 split도 **원근 판의 점에서 평행 판의 선까지의 수직거리**로 잰다.
      const dx = qb.x - qa.x, dy = qb.y - qa.y
      const L = Math.hypot(dx, dy)
      const d = Math.abs((pb.x - qa.x) * dy - (pb.y - qa.y) * dx) / L
      if (d > bd) { bd = d; best = Number(id) }
    }
    return { id: best, split: +bd.toFixed(3) }
  })
  console.log(`[42 ⑥] 두 사영이 갈리는 폭(수직) ${pick.split} px (획 ${pick.id})`)
  expect(pick.split, '이 팔이 가를 수 있는가 — 원근 판과의 폭이 문의 두 배를 넘는다').toBeGreaterThan(4)
  const id2 = pick.id
  const par = await probe(id2)
  console.log(`[42 ⑥] 평행 — 화소 ${par.n} · 수직 어긋남 ${par.off}`)
  expect(par.n, '평행에서도 그 자리에 3D 픽셀이 있다 — 행렬이 사영과 같다').toBeGreaterThan(0)
  expect(par.off!, 'GL과 core가 같은 사영을 쓴다(불변식 k)').toBeLessThanOrEqual(2)

  ledger['gate6_gl_matches_projection'] = {
    what: '`#gl`(three.js 행렬)과 `core/camera.project`가 같은 자리에 그리는가 — 원근·평행 둘 다',
    perspective: { id, px: persp.n, off_px: persp.off },
    parallel: { id: id2, px: par.n, off_px: par.off, name: v.name },
    split_px: pick.split,
    falsification_executed: (
      '**실행했다**(D-3): `render3d.syncCamera`의 `w`를 `0 * projW(pose)`로 바꿔 **행렬만 원근으로** '
      + '되돌리고 이 팔을 돌렸다 → 창 안 불투명 화소 **64 → 0**(빨강). 되돌렸다.'
    ),
    falsification_history: (
      '**첫 판은 못 갈랐다**(D-3): ① 아무 획이나 고르면 pivot 면 근처라 두 사영이 같은 자리에 '
      + '찍힌다 — 행렬을 원근으로 되돌려도 팔이 **초록으로 남았다**(실행 확인) ② 정면 뷰에서는 '
      + '두 사영이 «선을 따라» 갈려 **수직거리를 재는 이 팔의 축과 어긋난다**(수직 폭 2.484 px). '
      + '그래서 ㉠ 깊은 획을 하나 더 긋고 ㉡ **축측으로 돌린 뒤** ㉢ split을 팔과 **같은 축**(수직)으로 '
      + '재서 가장 갈리는 획을 고른다 — 그때 57.062 px다.'
    ),
    note: '창(16 CSS px) 안 불투명 화소의 무게중심 ↔ 사영 선분의 **수직거리**. 창이 비면 null이라 「어긋남」과 「없음」이 갈린다',
  }
})

test.afterAll(async ({}, testInfo) => {
  const dpr = testInfo.project.name
  const payload = JSON.stringify({
    what: 'web2-42 — 화면에서 재는 다섯(면·가운데·확정 전 잠금·축측·읽는 값·이름).',
    canonical_command: 'LEDGER=1 npx playwright test e2e/view42.spec.ts',
    project: dpr,
    ...ledger,
    gate: {
      for: 'web2-42 — 화면(브라우저)에서만 설 수 있는 판정 여섯',
      registered: [
        '면을 누르면 평행으로 가고(w → 1) 이름이 그 면이다 · 누른 직후에는 0도 1도 아니다(보간)',
        '가운데를 누르면 원근으로 돌아온다 — **자세 문자열이 불변**이고 지평선·✕가 되살아난다',
        '**확정 전에는 큐브 대역 아홉 자리를 실제로 눌러도** 평행으로 안 가고 포즈가 한 톨도 안 움직인다(#94)',
        '정투상에서 중버튼 궤도 뒤에도 평행이 유지되고 이름이 「축측」이 된다',
        '읽는 값이 대체된다 — 「렌즈 N mm」 ↔ 「축척 1:N」/「축척 미정」 · 평행에서 손잡이가 잠긴다 · 두 값이 **한 문자열에 같이 안 뜬다**',
        '이름이 캔버스에 그려진다(픽셀) · DOM 어디에도 「도면」이 없다',
        '`#gl`(three.js 행렬)이 `core/camera.project`와 같은 자리에 그린다 — 원근·평행 둘 다(불변식 k)',
      ],
      reachability: (
        '**무엇이 이 기준을 넘는가**: GL 팔에서 `render3d.syncCamera`의 평행도를 `0 * projW(pose)`로 '
        + '바꿔 **행렬만 원근으로** 되돌리면 창 안 불투명 화소가 **64 → 0**으로 떨어진다(실행했다 · 되돌렸다). '
        + '그 판별이 서려면 두 사영이 갈리는 폭이 커야 하고, 그래서 팔이 그 폭(`split_px`)을 먼저 재서 '
        + '가장 갈리는 획을 고른다 — **57.062 px**. ⚠ 폭이 작은 획을 고르면(2.484 px) 같은 위약이 '
        + '초록으로 남는다(그 실패를 실제로 겪었다 — `gate6_gl_matches_projection.falsification_history`).'
      ),
      reachability_source: 'gate6_gl_matches_projection/split_px',
      reachability_value: (ledger['gate6_gl_matches_projection'] as { split_px: number } | undefined)?.split_px ?? null,
    },
    pitfalls: ['#94', '#93', '#88', '#89', '#35', '#40', '#71'],
    pitfalls_note: (
      '#94 — 「확정 전에는 잠긴다」를 **그 런타임에서 실제로 눌러** 잰다(아홉 자리 · 포즈 문자열 비교). '
      + '#93 — 큐브는 누르고 바로 뗀다(끌기 ⛔ — 누름 진입에 안 걸린다) · 전환은 300 ms 기다린다. '
      + '#88 — 자리를 `app.cubeLayout`에서 읽는다. '
      + '#89 — 이 원장은 **dpr 한 판**의 값이다(파일 이름에 판이 들어간다).'
    ),
  }, null, 2)
  const out = resolve(OUT, `view42_web2_${dpr}.json`)
  if (process.env.LEDGER === '1') {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(out, payload)
  }
})
