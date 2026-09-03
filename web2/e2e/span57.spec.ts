// web2-57 — 면은 획의 «구간»을 든다: **화면 몫**. 구간·이관·실행취소의 상태 몫은
// 단위 팔(test/span57.test.ts)이 잰다. 여기서 재는 것:
//   ① 삐져나간 토막을 지운다 → 면이 살고 **칠 픽셀이 동일**하다(게이트 「칠 픽셀 동일」)
//   ② 구간 자체를 지운다 → 면이 사라지고 **알림 한 줄**이 뜬다(조용하면 안 된다) ·
//     실행취소로 돌아온다
//
// 판정자는 픽셀 수와 알림 문자열이다(#92 — 「이관했다」는 이름표라 안 센다).
// 원장: stage0/out/span57_e2e_web2_dpr{1,2}.json (LEDGER=1 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-57 — 구간 이관의 화면 몫: 토막 지움 뒤 칠 픽셀 동일 · 구간 지움의 알림',
  note_92: '판정자는 픽셀 수(지우기 전/후 동일)와 #notice 문자열이다 — 상태(면 수)는 픽셀의 보조',
}
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/span57_e2e_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true }
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 첫 실행 */ }
  }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({
    ...prev,
    conditions: {
      workers: info.config.workers, project: info.project.name,
      canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/span57.spec.ts (워커 1 · 스펙 하나씩 — #99)',
    },
    ...OUT,
  }, null, 2))
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 탭 — 누른 자리에서 안 움직이고 뗀다(면 도구의 몸짓 — face.spec의 그것) */
async function tap(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 창의 픽셀 — 알파 계수와 **RGBA 해시(FNV-1a)**를 함께 낸다. ⚠ 계수 하나로는 약하다:
 *  칠한 면은 불투명(48-9)이라 창이 포화되면(계수 == 창 넓이) 칠이 죽어도 면만 살면 같은
 *  수가 나온다 — «동일»의 판정자는 해시다(#92: 결과의 자리에서 센다). */
function winPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('gl') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round(x0 * dpr), Math.round(y0 * dpr),
      Math.max(1, Math.round((x1 - x0) * dpr)), Math.max(1, Math.round((y1 - y0) * dpr)),
    ).data
    let n = 0
    let h = 0x811c9dc5
    for (let i = 0; i < d.length; i++) {
      h = Math.imul(h ^ d[i]!, 0x01000193) >>> 0
      if ((i & 3) === 3 && d[i]! > 0) n++
    }
    return { n, hash: h >>> 0 }
  }, [x0, y0, x1, y1] as const)
}

const summary = (page: Page) => page.evaluate(() => (window as any).__b2.diag.summary())

/** 단위 픽스처(test/span57.test.ts quadScene)와 같은 좌표 — 끝점이 안 만나는 사각형.
 *  e4·e5가 (500,433.33)에서 가로지르고 그 너머가 «토막»이다. */
async function quadWithStubs(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)   // 지평선
  await drawLine(page, 500, 500, 700, 450)    // 깊이선 vp0
  await drawLine(page, 500, 500, 300, 450)    // 깊이선 vp1
  await drawLine(page, 700, 450, 400, 425)    // e4 — 토막이 (500,433)~(400,425)
  await drawLine(page, 300, 450, 600, 425)    // e5 — 토막이 (500,433)~(600,425)
  const s = await summary(page)
  expect(s.lifted, '넷이 3D에 섰다(깊이선 둘 + 가로지르는 둘)').toBe(4)
  await page.click('#btn-face')
  await tap(page, 500, 465)
  expect(await summary(page).then((s: any) => s.docFaces)).toBe(1)
}

test('① 토막 지움 — 면이 살고 칠 픽셀(해시)이 동일하다', async ({ page }) => {
  await quadWithStubs(page)
  const win = [440, 455, 560, 480] as const
  // 전/후를 **같은 도구(지우개)를 든 채** 잰다 — 도구별 면 표시 규칙(48-9)을 상수로 만든다.
  // 칠 «전»의 해시를 먼저 떠서 자(해시)가 칠을 실제로 보는 것을 반증으로 확인한다(D-3).
  await page.click('#btn-eraser-pencil')
  await page.mouse.move(50, 750)
  await page.waitForTimeout(60)
  const noPaint = await winPixels(page, ...win)
  // 칠 — 면 안 한 붓(48-9: 칠한 면은 도구와 무관하게 보인다)
  await page.click('#btn-paint')
  await drawLine(page, 460, 468, 540, 468)
  await page.click('#btn-eraser-pencil')
  await page.mouse.move(50, 750)
  await page.waitForTimeout(60)
  const before = await winPixels(page, ...win)
  expect(before.hash, '자(해시)가 칠을 본다 — 칠 전과 다르다(D-3)').not.toBe(noPaint.hash)
  expect(before.n, '잉크가 실제로 있다').toBeGreaterThan(50)
  // e4의 토막(구간 밖)을 지운다 — 짧은 끌기
  await page.mouse.move(420, 426.7)
  await page.mouse.down()
  await page.mouse.move(424, 427)
  await page.mouse.up()
  await page.mouse.move(50, 750)
  await page.waitForTimeout(60)
  const s = await summary(page)
  expect(s.faces, '면이 산다').toHaveLength(1)
  expect(s.docFaces).toBe(1)
  const after = await winPixels(page, ...win)
  OUT[`gate1_paint_px`] = { no_paint: noPaint, before, after, win }
  expect(after.hash, '칠 픽셀 동일(게이트 — RGBA 해시)').toBe(before.hash)
  expect(after.n).toBe(before.n)
  expect(await page.textContent('#notice'), '이관 성공 — 알림이 없다(반증의 짝)').not.toContain('면이 열렸다')
})

test('② 구간 지움 — 면이 사라지고 알림이 뜬다 · 실행취소로 돌아온다', async ({ page }) => {
  await quadWithStubs(page)
  await page.click('#btn-eraser-pencil')
  // e4의 구간((700,450)~(500,433.33)) 위를 지운다
  await page.mouse.move(620, 443.3)
  await page.mouse.down()
  await page.mouse.move(624, 443.7)
  await page.mouse.up()
  await page.waitForTimeout(60)
  let s = await summary(page)
  expect(s.faces, '면이 열려 사라졌다').toHaveLength(0)
  expect(s.docFaces, '문서에는 남는다(불변식 j)').toBe(1)
  const notice = await page.textContent('#notice')
  OUT[`gate3_notice`] = notice
  expect(notice, '조용하지 않다 — 한 줄 알림').toContain('면이 열렸다')
  await page.click('#btn-undo')
  await page.waitForTimeout(60)
  s = await summary(page)
  expect(s.faces, '실행취소로 돌아온다').toHaveLength(1)
})
