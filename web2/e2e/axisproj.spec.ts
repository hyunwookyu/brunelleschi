// web2-16 2부 — «어느 쪽이 이겼는지 손에 보인다»의 화면 판(지시 2-a ⚠ · 2차 리뷰 [10]).
// 축이 걸린 획이 대기선의 끝점을 겨누면 기호는 특징점에, 끝은 축선 위에 선다 — 둘 사이를
// 잇는 수선 연결선(#555 · 0.8px)이 «축이 이겼다»를 말한다(render2d).
//
// 표본 구성: 특징점을 축선에서 **32px** 비켜 놓는다 — 단위 팔의 4px 분리로는 기호(≈7px)·
// 미리보기 몸체와 표본 상자가 겹쳐 판별력이 없다(#69 ㉣ — 그래서 단위 쪽은 데이터 계약만
// 재고 화면 판은 여기서 잰다). 32px면 연결선 가운데(±3px 상자)가 기호(특징점 ±5px)와
// 미리보기 선(축선 ±1px)에서 각각 10px 이상 떨어진다.
//
// 반증(D-3): ① 연결선에서 15px 비킨 대조 상자는 painted 0이어야 한다(상자가 아무거나
// 잡으면 이 팔은 아무것도 안 잰다) ② render2d의 연결선 블록을 빼면 본 상자가 0이 된다
// (실행 기록은 NOTES — 실제로 빼서 실패를 확인하고 되돌렸다).

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number, steps = 8) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  await page.mouse.up()
  await settle(page)
}

/** 잉크 겹 상자 painted(알파>0) — drafting.spec의 어법 그대로.
 *  ⚠ 캔버스별 판독이다(#67의 자리 — 3차 [13]): 연결선은 #ink에 그려지고 #ink가
 *  **최상단 겹**(z2 — gl·brushc 위)이라 다른 캔버스가 그것을 가릴 수 없다. #67이 잡는
 *  «윗겹이 아랫겹을 가리는» 형태가 이 표식에는 구조적으로 없다 — 그래서 합성 스크린샷
 *  없이 캔버스 판독으로 충분하다(가리는 쪽 결함은 materials.spec의 합성 팔이 든다). */
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

test('축이 이긴 표시 — 특징점 기호와 축선 끝 사이에 수선 연결선이 그려진다 (그리는 중)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)      // 지평선
  await drawLine(page, 500, 500, 600, 475)       // → vp0
  await drawLine(page, 500, 500, 400, 475)       // → vp1 — 카메라 닫힘
  await drawLine(page, 500, 500, 720, 445)       // 지면 깊이선 — (720,445)가 3D
  await drawLine(page, 752, 240, 902, 315)       // 대기선 B — 끝점 (752,240)이 축선에서 32px 밖
  // 축스냅 세로획을 (720,445)에서 시작해 B의 끝점 위로 끌고 간다 — **떼지 않는다**
  await page.mouse.move(720, 445)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(720 + 32 * i / 10, 445 - 205 * i / 10)
  await settle(page)
  // 연결선 대역: (752,240)→(720,240)의 가운데 (736,240) ±3 — 기호(752±5)·미리보기(720±1) 밖
  const tie = await inkBox(page, 733, 237, 6, 6)
  // 반증 ① — 연결선에서 15px 위의 대조 상자는 비어 있어야 한다(상자 판별력)
  const control = await inkBox(page, 733, 222, 6, 6)
  console.log(`[측정] 수선 연결선 painted ${tie} · 대조 상자 ${control}`)
  await page.mouse.up()
  expect(control, '대조 상자가 비어 있다 — 표본이 아무거나 잡는 것이 아니다').toBe(0)
  expect(tie, '연결선이 그려진다 — 축이 이겼음이 화면에 보인다').toBeGreaterThan(0)
})
