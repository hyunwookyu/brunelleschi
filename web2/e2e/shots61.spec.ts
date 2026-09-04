// web2-61 ⛳ 사진 — 브러시 넷 × 획 셋(직선·물결·자기교차)의 PNG 산출물.
// 지시 문면: 「게이트 열두 개가 통과하는데 사람이 보면 나빴다(#87) — 사진은 재는 대상을
// 사람의 눈에 맞춘다.」 자국은 markSampleForTest(이음매 drawMark — 제품과 같은 함수 #54).
//
// ⚠ #104: e2e가 도는 동안 web2/ 아래에 쓰면 vite 전체 새로고침이 페이지를 죽인다 —
// PNG는 먼저 stage0/out/shots61/(저장소 루트 — vite 감시 밖)에 쓰고, 실행이 끝난 뒤
// 사람이(또는 마감 절차가) web2/shots/로 옮겨 커밋한다(tools/shots61-copy.mjs).
// 원장 관문(#90)은 stage0/out 전체를 지키므로 이 쓰기도 LEDGER=1에서만 된다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots61')

const TOOLS = ['pencil', 'cp', 'marker', 'brush'] as const

test('사진 — 넷 × 셋 (dpr1에서만 — 견본 판은 dpr 무관)', async ({ page }, info) => {
  test.skip(info.project.name === 'dpr2', '견본 판은 고정 px — dpr1 한 번이면 같은 그림')
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(150)
  mkdirSync(OUTDIR, { recursive: true })
  for (const tool of TOOLS) {
    // 한 장 = 세로로 획 셋(직선·물결·자기교차) — 이름을 판에 굽는다
    const dataUrl = await page.evaluate((t) => {
      const b2 = (window as any).__b2
      const W = 480, H = 240
      const sheet = document.createElement('canvas')
      sheet.width = W; sheet.height = H * 3 + 30
      const sg = sheet.getContext('2d')!
      sg.fillStyle = '#fffdf8'; sg.fillRect(0, 0, sheet.width, sheet.height)
      const shapes = ['line', 'wave', 'cross'] as const
      shapes.forEach((sh, i) => {
        b2.diag.markSampleForTest(t, sh, 20)
        const cv = (window as any).__m61cv as HTMLCanvasElement
        sg.drawImage(cv, 0, 30 + i * H)
      })
      sg.fillStyle = '#3c3831'
      sg.font = '16px system-ui'
      sg.fillText(`${t} — line / wave / cross · w20 · p5.brush`, 12, 20)
      return sheet.toDataURL('image/png')
    }, tool)
    const b64 = dataUrl.split(',')[1]!
    writeFileSync(resolve(OUTDIR, `61-${tool}.png`), Buffer.from(b64, 'base64'))
    expect(b64.length, `${tool} PNG가 실재한다`).toBeGreaterThan(2000)
  }
})
