// 종단 — **그리기 규칙 둘**(web2-06 지시 1·2). 단위는 `vpray`·`hsnap`이 재고,
// 여기서는 **진짜 입력**(마우스 이동 여덟 걸음)으로 같은 것을 잰다: 사람이 손으로 긋는
// 경로에는 중간 이동마다 미리보기가 다시 도는 단계가 있고, 그 경로를 거쳐도 같은 좌표가
// 확정되는지는 하네스가 못 본다(하네스는 시작·끝 두 점만 준다).

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
const summary = (page: Page) => page.evaluate(() => (window as any).__b2.diag.summary())
const lastStroke = (page: Page) =>
  page.evaluate(() => { const d = (window as any).__b2.app.doc.strokes; return d[d.length - 1] })

test('지시 2 — 지평선을 긋고 **수평선이 스냅으로 그어진다**', async ({ page }) => {
  // 고치기 전: 처짐 5px의 수평 의도가 **x=16300(13.3W) 소실점**을 만들고 주점이 그리로 갔다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)          // 지평선
  await drawLine(page, 300, 600, 700, 595)           // 수평 의도 — 5px 어긋나게
  const s = await summary(page)
  expect(s.vps).toHaveLength(0)                      // 소실점이 안 생겼고
  expect(s.f).toBeCloseTo(0.87 * 1200, 6)            // f가 기본값 그대로다
  const st = await lastStroke(page)
  expect(st.b.y).toBe(st.a.y)                        // 획이 **정확히 수평**이다

  // 그 뒤에도 깊이선은 그대로 소실점을 만든다(양성 채널 — 규칙이 다 막은 게 아니다)
  await drawLine(page, 500, 500, 620, 470)
  expect((await summary(page)).vps.length).toBe(1)
})

test('지시 1 — **소실점에서 뻗는 획은 커서 자리에 그대로 끝난다**', async ({ page }) => {
  // 고치기 전: 축 스냅이 그 획을 지평선 위로 눌렀다((900,400)→(700,600)이 끝점 (700,400)).
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)          // 지평선
  await page.mouse.move(900, 400)                    // 탭 = 소실점 찍기
  await page.mouse.down(); await page.mouse.up()
  await settle(page)
  expect((await summary(page)).vps).toEqual([{ x: 900, y: 400 }])

  await drawLine(page, 901, 401, 700, 600)           // 소실점을 눌러(1px 빗나가게) 아래로
  const st = await lastStroke(page)
  expect(st.a).toEqual({ x: 900, y: 400 })           // 시작점은 소실점에 붙고
  expect(st.b).toEqual({ x: 700, y: 600 })           // 끝점은 커서 그대로다
  expect((await summary(page)).vps).toHaveLength(1)  // 새 소실점을 안 만든다
})

test('지시 7(web2-10) — 축 스냅 미리보기가 무채색이고, 붙으면 파선 안내가 «획 너머»에 뜬다', async ({ page }) => {
  // 재현(수리 전): 축에 붙은 미리보기가 축 색(vp0 #c2571a — 채널 차 168 급)으로 칠해졌다.
  // 수리 후: 선은 재료색(무채색 회색), «붙었다»는 양끝 너머의 무채색 파선(#555)이 말한다.
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)          // 지평선
  await page.mouse.move(900, 400)                    // 탭 = 소실점 (900,400)
  await page.mouse.down(); await page.mouse.up()
  await settle(page)
  expect((await summary(page)).vps).toEqual([{ x: 900, y: 400 }])

  const boxAt = (cx: number, cy: number, w: number) => page.evaluate(([x, y, ww]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round((x! - ww! / 2) * dpr), Math.round((y! - ww! / 2) * dpr),
      Math.round(ww! * dpr), Math.round(ww! * dpr)).data
    let painted = 0, chroma = 0, dark = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! === 0) continue
      painted++
      const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!
      dark += (255 - (r + g + b) / 3) / 255 * (d[i + 3]! / 255)  // 어두움 — level.spec과 같은 지표
      chroma = Math.max(chroma, Math.abs(r - g), Math.abs(g - b), Math.abs(r - b))
    }
    return { painted, chroma, dark }
  }, [cx, cy, w])

  // (500,600)에서 소실점 방향으로 — 정확선에서 5px 벗어나(≈1.3°) 축 허용각 안이다
  await page.mouse.move(500, 600)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(500 + i * 25, 600 - i * 11.9)
  await settle(page)
  const mid = await boxAt(600, 550, 20)              // 미리보기 선의 중간쯤
  // 끝(700,505 근처가 축 위로 스냅됨) 너머 — 파선 안내의 자리. 방향 (0.894,-0.447)·+20px
  const guide = await boxAt(718, 496, 22)
  const guideMeanD = guide.dark / guide.painted
  console.log(`[측정] 축 스냅 미리보기 — 선 채도 ${mid.chroma}(painted ${mid.painted}) · 너머 painted ${guide.painted}(채도 ${guide.chroma} · 평균 어두움 ${guideMeanD.toFixed(3)})`)
  expect(mid.painted).toBeGreaterThan(5)             // 상자에 선이 실제로 있다(D-3의 «없음»과 가름)
  expect(mid.chroma).toBeLessThanOrEqual(12)         // 수리 전 vp0 주황은 168 급 — 여기서 걸린다
  expect(guide.painted).toBeGreaterThan(4)           // 붙음 — 획 너머에 안내가 있다
  expect(guide.chroma).toBeLessThanOrEqual(12)       // 안내도 무채색
  // 대역 분리(지시 7 문면 — 오스냅과 같은 대역에 두지 않는다): 지표는 **어두움**(색×알파,
  // level.spec과 동일)이다 — ⚠ 평균 «알파»로는 안 갈렸다(실측 0.444/0.574 vs 오스냅
  // 0.388/0.381 — 1px 파선의 AA 희석이 불투명을 먹는다. 2차 [12]의 실측이 이것을 냈다).
  // 어두움 실측: 안내 0.296/0.383 vs 오스냅 0.153/0.149 — 0.22는 그 사이다.
  expect(guideMeanD).toBeGreaterThan(0.22)

  // 반증 — 축 밖 방향으로 끌면 «끝 너머» 상자가 빈다(붙음/안 붙음이 실제로 갈린다)
  await page.mouse.move(560, 690)                    // 자유 방향(어느 축도 아님)
  await settle(page)
  const freeGuide = await boxAt(573, 709, 22)        // 그 끝 너머(방향 (0.55,0.83)·+20px)
  console.log(`[측정] 자유 방향 끝 너머 painted ${freeGuide.painted}`)
  expect(freeGuide.painted).toBe(0)
  await page.mouse.up()
})
