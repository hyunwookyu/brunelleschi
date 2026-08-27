// web2-11 2부 — brush 렌더러: 두 경로가 다 돌고(2-b) · 결정론(2-d 계약 3) ·
// 화면 고정 굵기(계약 1) · 획만 바꾼다(2-a 범위).
//
// 헤드리스가 재는 것: 겹의 존재·전환·결정론·굵기 불변·범위(작도선은 ink에 남는다).
// 실기기만 아는 것: 「종이 같은가」 — 지시 문면대로 헤드리스가 못 잰다(DEFERRED 표).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

// 시각 실측 원장(2차 재리뷰 [7] — #25: 원장 밖 측정은 규칙이 있어도 안 걸린다).
// 이 파일의 팔들이 잰 값을 모아 dpr1에서 한 번 쓴다(파일 안 테스트는 한 워커에서 차례로 돈다).
const visual: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  if (testInfo.project.name !== 'dpr1') return
  const out = resolve(HERE, '../../stage0/out/brush_visual_web2.json')
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: 'web2-11 2부 — brush 렌더러의 시각 실측(불투명 몫·어두움 단조·두께·시드 해시). e2e brush.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).',
    ...visual,
  }, null, 1))
})

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawMouse(page: Page, ax: number, ay: number, bx: number, by: number, steps = 8) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  await page.mouse.up()
  await settle(page)
}

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** #brushc(WebGL2 · preserveDrawingBuffer)를 2D로 떠서 상자를 읽는다 */
const brushBox = (page: Page, cx: number, cy: number, w: number) =>
  page.evaluate(([x, y, ww]) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round(ww! * dpr); t.height = Math.round(ww! * dpr)
    const c = t.getContext('2d')!
    c.drawImage(src, Math.round((x! - ww! / 2) * dpr), Math.round((y! - ww! / 2) * dpr),
      t.width, t.height, 0, 0, t.width, t.height)
    const d = c.getImageData(0, 0, t.width, t.height).data
    let painted = 0, h = 2166136261 >>> 0
    for (let i = 0; i < d.length; i++) {
      if (i % 4 === 3 && d[i]! > 0) painted++
      h = Math.imul(h ^ d[i]!, 16777619) >>> 0
    }
    return { painted, hash: h }
  }, [cx, cy, w])

/** 수직 기둥에서 선의 두께(px) — 수평선을 가로지르는 열에서 칠해진 행 수의 중앙값 */
const thicknessAt = (page: Page, cx: number, cy: number) =>
  page.evaluate(([x, y]) => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    const W = Math.round(24 * dpr), H = Math.round(30 * dpr)
    t.width = W; t.height = H
    const c = t.getContext('2d')!
    c.drawImage(src, Math.round((x! - 12) * dpr), Math.round((y! - 15) * dpr), W, H, 0, 0, W, H)
    const d = c.getImageData(0, 0, W, H).data
    const cols: number[] = []
    for (let cx2 = 0; cx2 < W; cx2++) {
      let n = 0
      for (let ry = 0; ry < H; ry++) if (d[(ry * W + cx2) * 4 + 3]! > 24) n++
      if (n > 0) cols.push(n / dpr)
    }
    cols.sort((a, b) => a - b)
    return cols.length ? cols[Math.floor(cols.length / 2)]! : 0
  }, [cx, cy])

test('2-b — 기본은 brush 렌더러이고, 획을 그으면 #brushc에 잉크가 생긴다 · 작도선(지평선)은 ink에 남는다(2-a 범위)', async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => (window as any).__b2.diag.renderer())).toBe('brush')
  await drawMouse(page, 100, 400, 1100, 400)          // 지평선 — 작도선(획이 아니다)
  const hz = await brushBox(page, 600, 400, 30)
  expect(hz.painted).toBe(0)                          // 지평선은 brush 대상이 아니다(범위)
  // 지평선은 종전대로 ink 캔버스에 있다(2H 급) — level.spec이 이미 재지만 범위 팔로 한 줄
  const inkHz = await page.evaluate(() => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(Math.round(580 * dpr), Math.round(396 * dpr),
      Math.round(40 * dpr), Math.round(8 * dpr)).data
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  })
  expect(inkHz).toBeGreaterThan(0)

  await drawMouse(page, 300, 550, 700, 550, 12)       // 내용 획(수평 — 앵커로 승격)
  const s = await brushBox(page, 500, 550, 30)
  console.log(`[측정] brush 획 상자 painted ${s.painted} · 해시 ${s.hash}`)
  expect(s.painted).toBeGreaterThan(0)                // 획은 brush 겹이 그린다
})

test('2-b — 토글: classic으로 바꾸면 brush 겹이 비고 grain(ink)이 돌아온다 · 되돌리면 다시 brush다', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)
  await drawMouse(page, 300, 550, 700, 550, 12)
  const on = await brushBox(page, 500, 550, 30)
  expect(on.painted).toBeGreaterThan(0)

  await page.evaluate(() => (document.getElementById('btn-brush') as HTMLButtonElement).click()) // 3-c: 설정 안 — DOM click(배선 동일)                      // 사람이 누르는 그 버튼으로 끈다
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.diag.renderer())).toBe('classic')
  const off = await brushBox(page, 500, 550, 30)
  expect(off.painted).toBe(0)                         // brush 겹이 비었다
  // classic 질감(grain)이 ink에 돌아왔다 — 2-e의 «끄되 지우지 않는다»의 양성 채널
  const grainPix = await page.evaluate(() => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(Math.round(480 * dpr), Math.round(535 * dpr),
      Math.round(40 * dpr), Math.round(30 * dpr)).data
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  })
  console.log(`[측정] classic 전환 후 ink 상자 painted ${grainPix}`)
  expect(grainPix).toBeGreaterThan(0)

  await page.evaluate(() => (document.getElementById('btn-brush') as HTMLButtonElement).click()) // 3-c: 설정 안 — DOM click(배선 동일)                      // 되돌린다(2-b — 비교가 목적)
  await settle(page)
  expect((await brushBox(page, 500, 550, 30)).painted).toBeGreaterThan(0)
})

test('2-d 계약 3 — 결정론: 같은 문서를 다시 그리면(리로드 — 자동저장 복원) 같은 픽셀이다', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)
  await drawMouse(page, 300, 550, 700, 550, 12)
  await drawMouse(page, 350, 620, 650, 580, 10)
  await page.waitForTimeout(600)                      // 자동저장(400ms 디바운스)
  const before = await brushBox(page, 500, 570, 120)
  expect(before.painted).toBeGreaterThan(0)
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await settle(page)
  const after = await brushBox(page, 500, 570, 120)
  console.log(`[측정] 결정론 — 리로드 전 ${before.painted}/${before.hash} 후 ${after.painted}/${after.hash}`)
  expect(after.hash).toBe(before.hash)                // 같은 입력 → 같은 픽셀(획 id 시드)
  // 반증(D-3): 획을 하나 더 그으면 해시가 갈린다 — 이 해시가 실제로 가른다
  await drawMouse(page, 360, 610, 640, 590, 8)
  const changed = await brushBox(page, 500, 570, 120)
  expect(changed.hash).not.toBe(before.hash)
})

test('2-d 계약 3 반증(D-3) — 시드가 픽셀을 정한다: 같은 기하·다른 id면 다르고, 같은 id면 같다', async ({ page }) => {
  // «리로드 동일»만으로는 시드 배선이 안 재진다(2차 [10] — 내부 RNG가 순서 결정적이면
  // seed(id) 없이도 통과한다). 같은 기하에서 id만 바꾸면: seed(id)가 실려 있을 때만 갈린다.
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)
  await drawMouse(page, 300, 550, 700, 550, 12)
  const first = await page.evaluate(() => {
    const d = (window as any).__b2.app.doc.strokes
    return d[d.length - 1].id
  })
  const h1 = await brushBox(page, 500, 550, 60)
  await page.keyboard.press('Control+z')
  await settle(page)
  await drawMouse(page, 300, 550, 700, 550, 12)      // 같은 기하 — id는 다르다(nextId 증가)
  const h2 = await brushBox(page, 500, 550, 60)
  await page.keyboard.press('Control+z')
  await settle(page)
  await page.evaluate((id) => { (window as any).__b2.app.nextId = id }, first)
  await drawMouse(page, 300, 550, 700, 550, 12)      // 같은 기하 — 같은 id로 복원
  const h3 = await brushBox(page, 500, 550, 60)
  console.log(`[측정] 시드 — id ${first}: ${h1.hash} · 다른 id: ${h2.hash} · 같은 id 복원: ${h3.hash}`)
  visual['seed'] = { same_geometry_id_a: h1.hash, different_id: h2.hash, id_a_restored: h3.hash,
    note: '같은 기하에서 id만 바꾸면 해시가 갈리고(seed(id)가 실렸다) 같은 id면 동일 — 계약 3의 직접 판정' }
  expect(h2.hash).not.toBe(h1.hash)                  // id가 다르면 질감이 다르다 — seed(id)가 실렸다
  expect(h3.hash).toBe(h1.hash)                      // id가 같으면 완전히 같다
})

test('2-c — 렌더된 어두움이 경도 단조다(2H < HB < 2B) · 인접 급(2H↔H)도 갈린다', async ({ page }) => {
  // MAT 표 재인용이 아니라 **렌더 결과**의 단조(2차 [9]). 같은 길이·나란한 획 셋+하나.
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)
  // web2-16 3-a: 대기 획은 흑연 «파선»이다. 첫 화면평행 획은 첫 앵커 게이지로 승격돼
  // 통짜가 되므로(z=−f), 여섯 급 중 첫 획만 통짜·나머지 파선이면 잉크량 비교가 어긋난다.
  // 앵커 몫을 측정 밖 획 하나가 먼저 가져가게 한다 — 여섯 급 전부가 대기(파선)로 나란하다.
  await drawMouse(page, 300, 430, 660, 430, 10)      // 앵커 소진용(측정 상자 밖 y=430)
  const dark = async (y: number) => {
    const b = await page.evaluate(([yy]) => {
      const src = document.getElementById('brushc') as HTMLCanvasElement
      const dpr = window.devicePixelRatio || 1
      const t = document.createElement('canvas')
      t.width = Math.round(360 * dpr); t.height = Math.round(16 * dpr)
      const c = t.getContext('2d')!
      c.drawImage(src, Math.round(320 * dpr), Math.round((yy! - 8) * dpr), t.width, t.height, 0, 0, t.width, t.height)
      const d = c.getImageData(0, 0, t.width, t.height).data
      let s = 0
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]! / 255
        if (a > 0) s += (255 - (d[i]! + d[i + 1]! + d[i + 2]!) / 3) / 255 * a
      }
      return s
    }, [y])
    return b as number
  }
  // 여섯 급 전부(2차 재리뷰 [8] — 근사가 걸린 세 쌍 (2H,H)·(F,HB)·(B,2B)를 다 덮는다)
  const grades: [string, number][] = [['2H', 470], ['H', 505], ['F', 540], ['HB', 575], ['B', 610], ['2B', 645]]
  const measured: Record<string, number> = {}
  for (const [g, y] of grades) {
    await page.evaluate((gg) => { (window as any).__b2.app.grade = gg }, g)
    await drawMouse(page, 300, y, 660, y, 10)
    measured[g] = await dark(y)
  }
  console.log(`[측정] 렌더 어두움 — ${grades.map(([g]) => `${g} ${measured[g]!.toFixed(1)}`).join(' · ')}`)
  visual['darkness_monotonic'] = { ...Object.fromEntries(grades.map(([g]) => [g, Number(measured[g]!.toFixed(1))])),
    note: '같은 길이 획의 상자 어두움(Σ(1-밝기)×알파) — 여섯 급 강한 단조가 판정. 이웃 질감 근사(2H,H)(F,HB)(B,2B)의 «갈림»이 이 단조에 든다(AS-C34)' }
  expect(measured['2H']!).toBeGreaterThan(0)
  const order: string[] = ['2H', 'H', 'F', 'HB', 'B', '2B']
  for (let i = 1; i < order.length; i++)
    expect(measured[order[i]!]!).toBeGreaterThan(measured[order[i - 1]!]!)  // 인접 급 전부 갈린다
})

test('2-c — 알파 근사의 실측: 2H 획의 불투명 픽셀 몫(뒤의 3D를 가리는 몫)을 잰다', async ({ page }) => {
  // alphaColor는 색을 종이 쪽으로 섞을 뿐 픽셀 알파를 안 정한다 — 뒤(#gl의 Line2·면)가
  // 비치는 몫은 브러시 자신의 불투명도가 진다. ⚠ 초판은 «완전 불투명 없음(<255)»을
  // 기대했는데 **반증됐다** — 2H에도 완전 불투명 픽셀이 있다(그 관측이 AS-C35의 본문이다:
  // 옅은 획이 뒤의 어두운 3D 선을 점점이 가린다 — 화면 판정은 실기기 몫). 여기서는 그
  // 몫을 실측해 남기고, «전부 불투명은 아니다»(=반투명 몫이 실존한다)만 강제한다.
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)
  await page.evaluate(() => { (window as any).__b2.app.grade = '2H' })
  await drawMouse(page, 300, 550, 700, 550, 10)
  const r = await page.evaluate(() => {
    const src = document.getElementById('brushc') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.round(300 * dpr); t.height = Math.round(12 * dpr)
    const c = t.getContext('2d')!
    c.drawImage(src, Math.round(350 * dpr), Math.round(544 * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = c.getImageData(0, 0, t.width, t.height).data
    let painted = 0, opaque = 0
    for (let i = 3; i < d.length; i += 4) { if (d[i]! > 0) painted++; if (d[i]! === 255) opaque++ }
    return { painted, opaque }
  })
  console.log(`[측정] 2H 획 — painted ${r.painted} · 완전 불투명 ${r.opaque} (몫 ${(r.opaque / r.painted).toFixed(3)})`)
  visual['opacity_2h'] = { painted: r.painted, opaque: r.opaque,
    def: '분모 painted = 상자(300×12 CSS px 대역) 안 알파>0 픽셀 수(상자 전체가 아니다 — 배경 투명 확인은 painted << 상자 픽셀 수) · 분자 opaque = 알파==255. #brushc 캔버스 자체의 값(합성 전) — 위 겹의 알파 255 픽셀이 아래 겹을 대체하는 것은 브라우저 합성 규칙이므로 «3D 가림»은 이 실측 + 그 규칙의 귀결이다(AS-C35)' }
  expect(r.painted).toBeGreaterThan(0)
  // **현재 사실의 고정**(promote.test의 실측값 고정과 같은 형식): 실측 몫 1.000 — 칠해진
  // 픽셀은 전부 불투명이고, 옅은 획도 뒤의 3D를 **픽셀 단위로 가린다**(두 번째 기대
  // «반투명 몫 실존»도 반증됐다 — AS-C35가 이 관측을 든다. 시각 판정은 실기기 몫).
  // 라이브러리가 바뀌어 반투명이 되면 여기가 깨져 AS-C35를 다시 읽게 한다.
  expect(r.opaque / r.painted).toBeGreaterThan(0.9)
})

test('2-d 계약 1 — 화면 고정 굵기: 줌해도 획의 화면 두께가 같다', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)
  await drawMouse(page, 300, 550, 700, 550, 12)       // 수평 획
  const t1 = await thicknessAt(page, 500, 550)
  expect(t1).toBeGreaterThan(0)
  // 화면 줌(작도 포즈의 돌리) — (500,550)을 중심으로 ≈2배까지 휠을 굴린다.
  // ⚠ dpr2 프로젝트는 휠 delta가 다르게 실려 한 번으로 2배가 안 됐다 — 배율을 보며 굴린다.
  await page.mouse.move(500, 550)
  for (let i = 0; i < 10; i++) {
    const s0 = await page.evaluate(() => (window as any).__b2.app.view.s)
    if (s0 >= 1.9) break
    await page.mouse.wheel(0, -350)
    await settle(page)
  }
  const s = await page.evaluate(() => (window as any).__b2.app.view.s)
  const t2 = await thicknessAt(page, 500, 550)        // 중심점이라 줌 후에도 같은 자리
  console.log(`[측정] 굵기 — 줌 전 ${t1}px · 줌 ${s.toFixed(2)}배 후 ${t2}px`)
  visual['thickness_zoom'] = { before_css_px: t1, zoom: Number(s.toFixed(3)), after_css_px: t2,
    def: '알파>24 행 수의 중앙값 ÷ dpr(«단단한 심»의 CSS px). ⚠ dpr 프로젝트끼리 절대값 비교 불가 — 질감 AA 분포가 밀도에 따라 달라 문턱 위 픽셀 수가 다르다(dpr2가 더 얇게 읽힌다). 판정은 프로젝트 «안»의 줌 전후 비교다' }
  expect(s).toBeGreaterThan(1.8)
  // 화면 고정(원칙 e): 두께가 배율을 안 탄다. AA·질감 요동 여유 ±45%(두께 ~2px 대역의 1px).
  expect(t2).toBeGreaterThan(t1 * 0.55)
  expect(t2).toBeLessThan(t1 * 1.45)
  // 반증(D-3): 이 지표가 배율을 «잴 수 있는» 지표인가 — 줌이 굵기에 실렸다면 t2 ≈ 2·t1로
  // 위 상한이 잡는다(지표의 판별력은 상한이 든다 — 문서 좌표로 그리면 실제로 2배가 된다).
})
