// web2-72 ⛳ 사진 넷 —
//   72-orbit.png  궤도 중 프레임 시간(수리 전/후 · 원장에서 그린다)
//   72-open.png   열기 시간 막대(수리 전/후 · 칠 걷어낸 대조군 포함)
//   72-case.png   §A-2·§A-3 — 필통 여덟 칸(이주 뒤 겹침 0 · 지금 색을 바꿔도 제 색을 안 든 칸은 안 물든다)
//   72-wheel.png  §A-4 — 휠을 편 채 크기·불투명을 끌어도 접히지 않는다
//
// ⚠ 72-orbit·72-open은 **원장 JSON에서 그린 그림**이다(perf72_pre_web2_dpr2 · perf72_web2_dpr2) —
//   사진이 수치를 새로 만들지 않는다(#47: 수치는 원장이 정본). 원장이 없으면 그 사진은 건너뛴다.
// 산출물은 stage0/out/shots72/ → tools/shots72-copy.mjs. dpr2 목록에 든다(screenshot).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUTDIR = resolve(HERE, '../../stage0/out/shots72')
const LEDGER = (pre: boolean) => resolve(HERE, `../../stage0/out/perf72${pre ? '_pre' : ''}_web2_dpr2.json`)
const saveBuf = (name: string, buf: Buffer) => {
  mkdirSync(OUTDIR, { recursive: true })
  writeFileSync(resolve(OUTDIR, name), buf)
  expect(buf.length, `${name} PNG가 실재한다`).toBeGreaterThan(2000)
}
const readLedger = (pre: boolean): Record<string, any> | null =>
  existsSync(LEDGER(pre)) ? JSON.parse(readFileSync(LEDGER(pre), 'utf8')) as Record<string, any> : null

test.describe.configure({ mode: 'serial' })

/** 원장의 값을 막대로 그린다 — 페이지 안의 캔버스에(새 의존 없음 · 값은 인용일 뿐) */
async function barChart(page: Page, title: string, note: string,
  groups: { label: string; bars: { name: string; v: number; color: string }[]; unit: string }[]): Promise<Buffer> {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const b64 = await page.evaluate(([t, n, gs]) => {
    const G = gs as { label: string; bars: { name: string; v: number; color: string }[]; unit: string }[]
    const W = 980, rowH = 118, H = 76 + G.length * rowH
    const cv = document.createElement('canvas')
    cv.width = W * 2; cv.height = H * 2
    const g = cv.getContext('2d')!
    g.scale(2, 2)
    g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#3c3831'; g.font = '600 17px system-ui'; g.fillText(t as string, 20, 30)
    g.fillStyle = '#6b655c'; g.font = '12px system-ui'; g.fillText(n as string, 20, 50)
    G.forEach((grp, i) => {
      const y0 = 76 + i * rowH
      g.fillStyle = '#3c3831'; g.font = '600 13px system-ui'; g.fillText(grp.label, 20, y0 + 4)
      const max = Math.max(...grp.bars.map(b => b.v), 1)
      grp.bars.forEach((b, k) => {
        const y = y0 + 16 + k * 26
        const w = Math.max(2, (b.v / max) * 560)
        g.fillStyle = b.color; g.fillRect(150, y, w, 18)
        g.fillStyle = '#6b655c'; g.font = '12px system-ui'
        g.textAlign = 'right'; g.fillText(b.name, 142, y + 13); g.textAlign = 'left'
        g.fillStyle = '#3c3831'; g.font = '600 12px system-ui'
        g.fillText(`${b.v.toLocaleString()} ${grp.unit}`, 150 + w + 8, y + 13)
      })
    })
    return cv.toDataURL('image/png').split(',')[1]!
  }, [title, note, groups] as unknown[])
  return Buffer.from(b64, 'base64')
}

test('72-orbit.png — 궤도 중 프레임 시간(수리 전/후 · 원장 인용)', async ({ page }) => {
  const pre = readLedger(true), post = readLedger(false)
  test.skip(!pre || !post, '원장이 없다 — 먼저 perf72를 pre/post로 돌린다')
  const P = pre!, Q = post!
  const az = (d: Record<string, any>) => d.A_orbit_zoomed ?? d.A_orbit
  const buf = await barChart(page, 'web2-72 §0 A — 「돌릴 때」(궤도 4초 · dpr2 · 면 23 · 칠 획 920)',
    '원장 perf72_pre_web2_dpr2.json / perf72_web2_dpr2.json — 면을 키운 판(단계가 실제로 움직이는 대역).', [
      { label: '프레임 시간 p50', unit: 'ms', bars: [
        { name: '수리 전', v: az(P).frames.p50, color: '#c25b4a' },
        { name: '수리 후', v: az(Q).frames.p50, color: '#3f7d5a' }] },
      { label: '프레임 시간 최악', unit: 'ms', bars: [
        { name: '수리 전', v: az(P).frames.max, color: '#c25b4a' },
        { name: '수리 후', v: az(Q).frames.max, color: '#3f7d5a' }] },
      { label: '궤도 4초 동안 bakeFaceTex 호출', unit: '회', bars: [
        { name: '수리 전', v: az(P).bake.bakes, color: '#c25b4a' },
        { name: '수리 후', v: az(Q).bake.bakes, color: '#3f7d5a' }] },
      { label: '그 굽기가 다시 그린 획', unit: '획', bars: [
        { name: '수리 전', v: az(P).bake.bakedStrokes, color: '#c25b4a' },
        { name: '수리 후', v: az(Q).bake.bakedStrokes, color: '#3f7d5a' }] },
    ])
  saveBuf('72-orbit.png', buf)
})

test('72-open.png — 열기 시간(수리 전/후 · 칠 걷어낸 대조군)', async ({ page }) => {
  const pre = readLedger(true), post = readLedger(false)
  test.skip(!pre || !post, '원장이 없다 — 먼저 perf72를 pre/post로 돌린다')
  const P = pre!.B_open, Q = post!.B_open
  const buf = await barChart(page, 'web2-72 §0 B — 「열 때」(새로고침 · dpr2 · 획 936 · 칠 획 920)',
    '원장 perf72_pre_web2_dpr2.json / perf72_web2_dpr2.json — 「대조군」은 **칠만 걷어낸 같은 문서**(그만큼은 칠의 몫이 아니다).', [
      { label: '첫 상호작용 프레임', unit: 'ms', bars: [
        { name: '수리 전', v: P.firstInteractiveMs, color: '#c25b4a' },
        { name: '수리 후', v: Q.firstInteractiveMs, color: '#3f7d5a' },
        { name: '대조군(칠 없음)', v: Q.bareFirstInteractiveMs ?? 0, color: '#8a8378' }] },
      { label: '메인 스레드 최장 차단', unit: 'ms', bars: [
        { name: '수리 전', v: P.longestBlockMs, color: '#c25b4a' },
        { name: '수리 후', v: Q.longestBlockMs, color: '#3f7d5a' },
        { name: '대조군(칠 없음)', v: Q.bareLongestBlockMs ?? 0, color: '#8a8378' }] },
      { label: '첫 창에서 구운 획', unit: '획', bars: [
        { name: '수리 전', v: P.bakedStrokes, color: '#c25b4a' },
        { name: '수리 후', v: Q.bakedStrokes, color: '#3f7d5a' }] },
      { label: '편집 한 번에 훑은 획', unit: '회', bars: [
        { name: '수리 전', v: P.editScans, color: '#c25b4a' },
        { name: '수리 후', v: Q.editScans, color: '#3f7d5a' }] },
    ])
  saveBuf('72-open.png', buf)
})

test('72-case.png — §A-2·§A-3 필통 여덟 칸(이주 뒤 겹침 0 · 지금 색이 칸을 안 물들인다)', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  // 옛 판(64)만 두고 다시 연다 — 이주 경로가 도는 그 자리(사람의 실제 경로)
  await page.evaluate(() => {
    localStorage.removeItem('b2.pencilcase68.v1')
    localStorage.setItem('b2.brushFavs64.v1', JSON.stringify([
      { i: 'pencil', br: 'classic/pencil' }, { i: 'brush', br: 'deevad/liner' }, { i: 'marker', br: 'brunelleschi/marker' },
      { i: 'cp', br: 'brunelleschi/colored_pencil' }, { i: 'pencil', br: 'classic/charcoal' }, { i: 'brush', br: 'deevad/watercolor_expressive' }]))
  })
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint'); await page.waitForTimeout(300)
  // 지금 색을 강조색에 가까운 파랑으로 — 수리 «전»에는 일곱 칸이 한꺼번에 이 색이 됐다
  await page.evaluate(() => { (window as any).__b2.diag.setPaintHexForTest('#2040ff') })
  await page.waitForTimeout(250)
  const box = await page.locator('#painttray').boundingBox()
  expect(box, '칠 패널이 화면에 있다').not.toBeNull()
  saveBuf('72-case.png', await page.screenshot({ clip: { x: box!.x - 4, y: box!.y - 4, width: box!.width + 8, height: box!.height + 8 } }))
})

test('72-wheel.png — §A-4 휠을 편 채 크기·불투명을 끌어도 접히지 않는다', async ({ page }) => {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.click('#btn-paint'); await page.waitForTimeout(200)
  await page.click('#paint-color-btn'); await page.waitForTimeout(200)
  const drag = async (id: string, dx: number) => {
    const b = (await page.locator(id).boundingBox())!
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width * 0.4 + dx, b.y + b.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(80)
  }
  await drag('#paint-size-range', 34)
  await drag('#paint-opacity-range', -18)
  await page.click('#paint-fav-4'); await page.waitForTimeout(150)
  const open = await page.evaluate(() => ((window as any).__b2.diag.openBoxes() as string[]).includes('#paint-wheelbox'))
  expect(open, '크기·불투명·필통 칸을 만진 뒤에도 휠이 열려 있다').toBe(true)
  const box = await page.locator('#painttray').boundingBox()
  saveBuf('72-wheel.png', await page.screenshot({ clip: { x: box!.x - 4, y: box!.y - 4, width: box!.width + 8, height: box!.height + 8 } }))
})
