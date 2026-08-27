// web2-14 4번 — 스냅샷 겹 고스트 회귀 팔.
//
// 결함(실기기 보고 → dpr2 재현): #brushsnap에 CSS 크기(style width/height)가 없어
// `position:absolute; inset:0`이 대체 요소(canvas)를 늘리지 못하고 **고유 크기 =
// backing(W·dpr × H·dpr)** 으로 표시됐다. dpr>1이면 그리는 동안(스냅샷 겹이 떠 있는
// 동안만) 확정 획 질감이 좌상단 기준 dpr배 자리에 «같은 장면»으로 또 보였다.
// dpr1은 고유 크기 == 뷰포트라 증상이 없다 — **dpr2 프로젝트가 판별자다**(D-C3).
// ⚠ 실기기 dpr은 미측정이다(DEFERRED web2-09 표의 devicePixelRatio 행이 판정자) —
// «이 수리가 사람 증상의 원인»은 dpr>1 가정 위다(1차 리뷰 [1] — NOTES 4번 절).
//
// e2e가 못 잡은 이유(D-5): 긋는 도중을 보는 다리(draftgate 상자·materials during 상자)가
// 전부 «획 주변의 좁은 상자»였다 — 고스트는 dpr배 자리(장면에서 떨어진 곳)에 난다.
// 이 팔이 그 구멍을 막는다: **긋는 도중의 프레임을, 그리는 자리에서 떨어진 상자로** 본다.
//
// 두 상자의 역할이 다르다:
//   · 원격 상자(고스트 대역) — diff 0 = 고스트 없음.
//   · 원본 상자(그 획 위) — diff 0 = **스냅샷이 옳은 자리에 실제로 그렸다**(양성 증인).
//     긋는 동안 #brushc는 draft 한 획뿐이라, 확정 질감이 제자리에 보이는 것은 snap의
//     일이다 — snap이 안 뜨거나 어긋나면 이 상자가 든다. (상자 안 지평선·파선은 ink
//     겹이라 증인이 아니다 — 증인은 brush 질감이다.)
//
// 뷰 변환 두 갈래(identity · fitViewToFrame형) × dpr 둘 — 지시 문면 «팬·줌 한 상태와
// 안 한 상태 모두». 고스트는 합성 단계 CSS 배율이라 뷰 변환과 독립인 것이 예측이고,
// 두 갈래가 그것을 실측으로 만든다.
//
// 반증(D-3): 수리(fitSnap의 CSS 크기 부여)가 없으면 dpr2에서 이 팔이 실패한다 —
// 수리 커밋 이전 실행이 그것이다(원장 falsification 블록·NOTES 4번 절).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PIXEL_DIFF_CH } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))
const ledger: Record<string, unknown> = {}
test.afterAll(async ({ }, testInfo) => {
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/snap_ghost_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-14 4번 — 스냅샷 겹 고스트(${testInfo.project.name}): 긋는 도중, 그리는 자리에서 떨어진 두 상자(원격=고스트 대역·원본=양성 증인)의 idle 대비 diff(채널 차 ${PIXEL_DIFF_CH} 초과 픽셀 수)와 겹 CSS 기하. e2e snapghost.spec가 매 실행 다시 쓴다 — 문서는 필드 이름만 인용한다(#47).`,
    def: 'remote_box=[285,406,430,109] CSS(고스트 대역 — 좌상단 획의 dpr배 자리 y 400~496을 덮되, 상단은 지평선·따라긋기 파선 행(400±파선 브러시 폭) 아래로 web2-17이 내렸다 — 그 행은 draft 스냅샷의 WebGL 픽셀 복사 반올림(±10ch)이 실려 무변화 단언의 대상이 아니다) · near_box=[140,190,230,70] CSS(그 획 자체). 분모 box_px는 상자 실픽셀(CSS w×h×dpr²). 판정 0은 임계가 아니라 항등 단언(무변화)이다 — 동작점·스윕 없음(#12): 상자는 기하(획 위치×dpr배)로 도출했고 0은 «아무 일도 없다»의 문면이다. 수리 전 재현값(falsification)은 web2-17에서 새 상자로 다시 쟀다.',
    falsification: '수리(fitSnap CSS 크기) 이전 실행: dpr2 remote mid_diff 5101 · snap CSS 2400×1600(뷰포트의 2배) — 수리 커밋(7a8b5ae) 직전 로그(옛 상자 [285,380,430,135] 기준). ⚙ web2-17이 상자를 [285,406,430,109]로 옮긴 뒤 **되살림을 다시 실행**했다: fitSnap CSS 명시를 빼면 dpr2 두 팔이 실패한다(기하 단언 snap CSS 2400 — mid_diff 이전에 걸린다). 새 상자에서도 팔이 결함을 잡는다(#69 ㉢).',
    ...ledger,
  }, null, 1))
})

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    return [...g.getImageData(0, 0, c.width, c.height).data]
  }, buf.toString('base64'))
}
function diffCount(a: number[], b: number[]): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(b[i]! - a[i]!) > PIXEL_DIFF_CH || Math.abs(b[i + 1]! - a[i + 1]!) > PIXEL_DIFF_CH ||
        Math.abs(b[i + 2]! - a[i + 2]!) > PIXEL_DIFF_CH) n++
  }
  return n
}

/** 지평선 + 수평 앵커(승격) — draftgate와 같은 픽스처 */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

// ⚠ web2-17: 상자 상단을 지평선·따라긋기 파선 행(문서 y=400 — identity에서 화면 400,
// fit에서 385) **아래(406)로** 내렸다. 따라긋기 획(대기 파선)이 brushc에 있고, draft 모드의
// 스냅샷은 WebGL 캔버스의 픽셀 복사라 반투명 픽셀이 (un)premultiply 반올림으로 ±10ch쯤
// 흔들린다 — 그 행의 3픽셀이 걸렸다(고스트가 아니라 복사 반올림 — 실측 좌표 (429,399)·
// (483,399)·(334,400), NOTES 5부 절). 고스트 대역(대각 획의 dpr배 자리 y 400~496)은
// 그대로 덮는다.
const REMOTE = [285, 406, 430, 109] as const   // 고스트 대역 — 좌상단 획의 dpr배 자리
const NEAR = [140, 190, 230, 70] as const      // 그 획 자체 — 스냅샷의 양성 증인

for (const fit of [false, true]) {
  test(`긋는 동안 장면이 다른 자리에 안 뜬다 — 뷰 변환 ${fit ? 'fit(0.85,70,45)' : 'identity'}`, async ({ page }, testInfo) => {
    await boot(page)
    // 뷰 변환 갈래 — fitViewToFrame이 여는 상태(사람이 팬·줌을 안 해도 열 때 걸린다)
    if (fit) {
      await page.evaluate(() => {
        const a = (window as any).__b2.app
        a.view = { s: 0.85, ox: 70, oy: 45 }
        a.listeners.forEach((l: () => void) => l())
      })
      await settle(page)
    }
    await fixture(page)
    // 좌상단 사분면의 획 — 결함이 있으면 dpr2에서 이 획의 질감이 REMOTE 대역에 «또» 보인다
    await page.mouse.move(150, 200); await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(150 + 25 * i, 200 + 6 * i)
    await page.mouse.up(); await settle(page)

    const idleRemote = await shot(page, ...REMOTE)
    const idleNear = await shot(page, ...NEAR)

    // 긋는 도중 — 두 상자에서 떨어진 자리(x=900)에 긋고, 떼지 않은 채 본다
    await page.mouse.move(900, 560); await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(900, 560 - 9 * i)
    await settle(page); await settle(page)
    const midRemote = diffCount(idleRemote, await shot(page, ...REMOTE))
    const midNear = diffCount(idleNear, await shot(page, ...NEAR))

    // 겹 기하 — 상대(brushc)와 절대(#app = 뷰포트) 둘 다 댄다(1차 리뷰 [5] — 상대만
    // 보면 두 겹이 같은 경로로 함께 굳는 재발(AS-C7 계열)을 못 잡는다)
    const geom = await page.evaluate(() => {
      const s = document.getElementById('brushsnap')!.getBoundingClientRect()
      const c = document.getElementById('brushc')!.getBoundingClientRect()
      const app = document.getElementById('app')!.getBoundingClientRect()
      return { sw: s.width, sh: s.height, cw: c.width, ch: c.height, aw: app.width, ah: app.height }
    })
    await page.mouse.up(); await settle(page)
    const afterRemote = diffCount(idleRemote, await shot(page, ...REMOTE))

    console.log(`[측정] 스냅샷 고스트(fit=${fit}) — 원격 중${midRemote} 후${afterRemote} · 증인 중${midNear} · snap ${geom.sw}×${geom.sh} / brushc ${geom.cw}×${geom.ch} / app ${geom.aw}×${geom.ah}`)
    const dpr = testInfo.project.name === 'dpr2' ? 2 : 1
    ledger[fit ? 'view_fit' : 'view_identity'] = {
      remote_box: REMOTE, near_box: NEAR,
      remote_box_px: REMOTE[2] * REMOTE[3] * dpr * dpr,
      near_box_px: NEAR[2] * NEAR[3] * dpr * dpr,
      remote_mid_diff: midRemote, remote_after_diff: afterRemote, near_mid_diff: midNear,
      snap_css: [geom.sw, geom.sh], brushc_css: [geom.cw, geom.ch], app_css: [geom.aw, geom.ah],
    }
    expect(geom.sw, 'snap CSS 폭 == brushc CSS 폭(상대)').toBe(geom.cw)
    expect(geom.sh, 'snap CSS 높이 == brushc CSS 높이(상대)').toBe(geom.ch)
    expect(geom.sw, 'snap CSS 폭 == #app 폭(절대)').toBe(geom.aw)
    expect(geom.sh, 'snap CSS 높이 == #app 높이(절대)').toBe(geom.ah)
    // 긋는 동안: 원격은 무변화(고스트 없음), 원본도 무변화(= snap이 제자리에 그렸다)
    expect(midRemote, '긋는 중 원격 상자 무변화(고스트 없음)').toBe(0)
    expect(midNear, '긋는 중 원본 상자 무변화(스냅샷 양성 증인)').toBe(0)
    expect(afterRemote, '뗀 뒤 원격 상자 무변화').toBe(0)
  })
}
