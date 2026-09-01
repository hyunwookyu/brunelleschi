// web2-18 1부 — **잉크 확정선이 흑연 위로 온다**.
//
// 사람 관측: 「연필선 위에 펜을 그렸을 때 펜이 연필선에 먹혀 거의 보이지 않는다.」
// 기전(1-a): 겹이 `#gl(1) → #brushc(1, DOM 나중) → #ink(2)`인데 잉크 확정선의 몸체만
// `#gl`(Line2)에 있었다 — `brushlayer.redraw`가 `gradeOf(s)==='INK'`인 승격 획을
// 건너뛰므로 #brushc에는 잉크가 없고, 그 겹의 **연필 흑연이 잉크를 덮었다**.
// 답(1-b ⓒ): 잉크 몸체를 `#ink`로 옮긴다 — 균일선이라 Canvas 2D가 같은 것을 그리고
// 연필은 손도 안 대며 z-index도 안 건드린다(ⓐ·ⓑ 기각 사유는 DECISIONS.md).
//
// **판정은 합성 화면이다**(#67 — 캔버스별 판독만 있으면 「합성이 가리는」 결함은 영영
// 안 걸린다. web2-11의 흰 장막이 e2e 116팔을 통과했다). 그래서 이 파일의 모든 수는
// `page.screenshot`(사람이 보는 것)에서 나온다.
//
// 지표: **«잉크를 더했을 때 달라진 픽셀 수»**(materials.spec의 diffCount 어법).
//   «어두운 픽셀 수»가 아닌 이유: 종이 결 마스크(알파 199..255) 때문에 흑연 위 잉크는
//   중간 명도가 되고, 절대 밝기 문턱은 그 대역에서 흑연과 잉크를 못 가른다.
//   «달라졌는가»는 그 혼동에 걸리지 않는다 — 덮여 있으면 안 달라지고, 위에 오면 달라진다.

import { test, expect, type Page } from '@playwright/test'
import { clearStore } from './store43'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PIXEL_DIFF_CH } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 잉크가 «보인다»의 하한 — 흑연 위 잉크가 맨 종이 위 잉크의 이 비율 이상 달라져야 한다.
 *  1.0(완전 동일)이 아닌 이유: 흑연 위에서는 잉크 AA 가장자리의 대비가 낮아 문턱
 *  (PIXEL_DIFF_CH) 아래로 떨어지는 칸이 남는다 — 몸체가 위에 와도 그 몫은 안 돌아온다.
 *  0.7은 «몸체가 보인다»와 «가장자리 몇 칸이 덜 세진다»를 가르는 자리다.
 *  ⚠ 동작점 하나다(#12 — AS-C54). 되돌릴 조건: 수리 후 값이 이 선 바로 위/아래에서
 *  흔들리면(실행 간 변동) 대비 자체가 지표로 못 쓰는 것이므로 지표를 바꾼다. */
const VISIBLE_RATIO = 0.7

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await clearStore(page)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

/** 합성 화면의 상자를 픽셀 배열로 — 스크린샷(사람이 보는 것)을 그대로 읽는다 */
async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  return (await shotSized(page, x, y, w, h)).px
}

/** 같은 스크린샷을 **실제 이미지 크기와 함께** — 좌표를 되짚어야 할 때 쓴다.
 *  ⚠ dpr2에서는 이미지가 CSS 상자의 2배다(D-C3: dpr 1에서만 확인하지 않는다). 첫 판이
 *  폭을 CSS px로 가정해 팔 ⑤가 dpr2에서만 11.5px 어긋남을 냈다 — 계기의 결함이었다. */
async function shotSized(page: Page, x: number, y: number, w: number, h: number): Promise<{ px: number[]; w: number; h: number }> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    return { px: [...g.getImageData(0, 0, c.width, c.height).data], w: c.width, h: c.height }
  }, buf.toString('base64'))
}

/** 기준 대비 달라진 픽셀 수 — 채널 차 PIXEL_DIFF_CH 초과(materials.spec와 같은 자·D-C4) */
function diffCount(base: number[], now: number[]): number {
  let n = 0
  for (let i = 0; i < base.length; i += 4) {
    if (Math.abs(now[i]! - base[i]!) > PIXEL_DIFF_CH || Math.abs(now[i + 1]! - base[i + 1]!) > PIXEL_DIFF_CH ||
        Math.abs(now[i + 2]! - base[i + 2]!) > PIXEL_DIFF_CH) n++
  }
  return n
}

/** 상자의 내용 해시 — «연필 불변»(팔 ②)의 값. 32bit FNV-1a. */
function hash(px: number[]): number {
  let h = 0x811c9dc5
  for (const v of px) { h ^= v; h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

/** 픽스처 — 지평선(카메라) + 수평 앵커(승격된다). materials.spec와 같은 규격. */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

/** 앵커 위 점에서 아래로 내리긋는다 — 화면 평행(V축)이라 승격된다. 손 오차를 태운다(#68). */
async function drawDown(page: Page, x: number, y0: number, y1: number, jitter = 0) {
  await page.mouse.move(x, y0); await page.mouse.down()
  const n = 14
  for (let i = 1; i <= n; i++) {
    // 손 오차 — 이상적 좌표만 쓰면 «도달 불가»가 통과로 남는다(#68). 결정론(사인).
    const j = jitter * Math.sin((i / n) * Math.PI * 3)
    await page.mouse.move(x + j, y0 + ((y1 - y0) * i) / n)
  }
  await page.mouse.up(); await settle(page)
}

/** 연필통에서 경도를 고른다(재료의 출처는 UI 하나 — 측정용 우회로를 안 만든다) */
async function pickPencil(page: Page, g: string) {
  // 연필통은 접혀 있다(web2-19 3-b') — 연필을 눌러 열고 고른다(고르면 접힌다)
  if (await page.locator('#tray.open').count() === 0) await page.click('#btn-pencil')
  await page.click(`#tray-${g}`)
}
async function pickPen(page: Page) {
  await page.click('#btn-pen')
}

const BAND_W = 14, BAND_H = 90
const X_OVER = 400      // 연필 위에 잉크를 겹치는 자리
const X_SOLO = 620      // 맨 종이 위 잉크(대조군)
const Y0 = 560, Y1 = 700
const bandOf = (x: number) => [x - BAND_W / 2, Y0 + 20, BAND_W, BAND_H] as const

const ledger: Record<string, unknown> = {}

/** 원장을 **그 자리에서** 쓴다 — `afterAll`에 두면 팔이 하나라도 실패했을 때
 *  playwright가 워커를 갈아 치우면서 모듈 상태가 날아가 그 판이 통째로 빈다
 *  (실제로 첫 실행에서 `brush` 칸이 사라졌다 — 수리 전 판을 못 남길 뻔했다).
 *  그래서 팔 넷을 **한 시험** 안에 두고, 판정(expect)보다 **먼저** 기록한다. */
function writeLedger(testInfo: { project: { name: string } }) {
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/inklayer_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify({
    what: `web2-18 1부 — 잉크 확정선이 흑연 위로 오는가(합성 화면·${testInfo.project.name}). 지표는 «잉크를 더했을 때 달라진 픽셀 수»(#67: 캔버스별 판독은 합성이 가리는 결함을 못 잡는다).`,
    def: `연필(2B) 세로획 위에 잉크 세로획을 겹쳐 긋고, 잉크를 더하기 «전/후» 상자(${BAND_W}×${BAND_H} CSS px)를 견준다. 채널 차 ${PIXEL_DIFF_CH} 초과 픽스 수(임계 출처 e2e/thresholds.ts — D-C4). 대조군은 맨 종이 위 같은 획. ratio = 겹친 쪽 ÷ 대조군 — 몸체가 덮여 있으면 0에 가깝고 위에 오면 1에 가깝다. 하한 ${VISIBLE_RATIO}의 동작점 성격은 AS-C54(스윕 없음).`,
    threshold: { visible_ratio: VISIBLE_RATIO, pixel_diff_ch: PIXEL_DIFF_CH },
    phase: 'after',
    flags_explained: {
      'brush.ratio > 1': '겹친 잉크가 대조군보다 «더» 달라지는 것은 정상이다 — 흑연 위에서는 잉크의 대비가 커서 문턱(PIXEL_DIFF_CH)을 넘는 칸이 맨 종이 위보다 조금 많다. 1.0을 넘는 것 자체가 「덮이지 않았다」의 강한 표시다.',
      'draft_commit_jump.changed_px = 0': '**설계 보장 쪽에 가깝다**(§5.1 유형 3): 잉크 미리보기 몸체와 확정 몸체가 web2-18 1부부터 **같은 겹·같은 그리기**이고 좌표도 같다. 0은 그 구성의 귀결이므로 임계를 «판별»로 읽지 않는다 — 되살아나는 것(0이 아니게 되는 것)만 감시한다.',
      'follow.*.off ≈ 0.5': '1.5px 굵기 선의 AA에서 가장 어두운 칸이 중심에서 반 칸 치우친 값이다(dpr2에서 0.25). 사영 어긋남이 아니라 픽셀 격자다.',
    },
    phase_note: '**수리 후**(잉크 몸체가 #ink) 판. 쌍이 되는 «수리 전» 판은 같은 폴더의 `inklayer_web2_before.json`이다 — 1부 수리를 `git stash`로 잠시 걷고 dev 서버를 다시 띄워 같은 하네스로 냈다(#70). 그 판에서 팔 ①이 실제로 실패한다(D-2 재현 · D-3 반증).',
    ...ledger,
  }, null, 1))
}

async function arm1(page: Page) {
  await boot(page)
  await fixture(page)

  // 연필(2B) — 겹치는 자리에만. 대조군 자리는 맨 종이다.
  await pickPencil(page, '2B')
  await drawDown(page, X_OVER, Y0, Y1, 1.5)

  // 기준(잉크를 더하기 «전») — 두 상자
  const baseOver = await shot(page, ...bandOf(X_OVER))
  const baseSolo = await shot(page, ...bandOf(X_SOLO))
  const pencilOnlyHash = hash(baseOver)

  // 잉크 — 같은 자리에 겹쳐서, 그리고 대조군 자리에 따로
  await pickPen(page)
  await drawDown(page, X_OVER, Y0, Y1 - 10, 1.5)
  const inkOverId = await page.evaluate(() => (window as any).__b2.app.nextId - 1)
  await drawDown(page, X_SOLO, Y0, Y1 - 10, 1.5)
  const inkSoloId = await page.evaluate(() => (window as any).__b2.app.nextId - 1)

  const afterOver = await shot(page, ...bandOf(X_OVER))
  const afterSolo = await shot(page, ...bandOf(X_SOLO))
  const over = diffCount(baseOver, afterOver)
  const solo = diffCount(baseSolo, afterSolo)

  // 그 잉크 획들이 실제로 승격됐는가 — 대기 잉크는 이 결함의 대상이 아니다(#brushc가 긋는다)
  const lifted = await page.evaluate(([a, b]) => {
    const L = (window as any).__b2.app.lift
    return { over: L.lifted.has(a), solo: L.lifted.has(b) }
  }, [inkOverId, inkSoloId])

  // 겹이 어디인가 — 캔버스별 판독은 «판정»이 아니라 **기전의 표식**이다(합성이 판정한다)
  const layers = await page.evaluate(() => (window as any).__b2.diag.glLines())

  ledger.brush = {
    ink_diff_over_pencil: over,
    ink_diff_solo: solo,
    ratio: solo > 0 ? +(over / solo).toFixed(3) : null,
    lifted, layers,
    pencil_only_band_hash: pencilOnlyHash,
    note: 'ratio가 하한 아래면 잉크가 흑연에 덮인 것이다(사람 관측의 재현). 수리 전 실측은 이 원장의 before 판(NOTES 1부)에 있다. pencil_only_band_hash는 팔 ② — 수리 전/후 판이 같아야 «연필은 손도 안 댔다»가 값으로 선다.',
  }

  console.log(`[1부 ①] 겹친 잉크 ${over} · 대조군 ${solo} · 비 ${solo > 0 ? (over / solo).toFixed(3) : 'n/a'}`
    + ` · 승격 over=${lifted.over} solo=${lifted.solo} · 연필상자해시 ${pencilOnlyHash}`)

}

async function arm3(page: Page) {
  await boot(page)
  await fixture(page)
  await pickPen(page)

  // 떼기 «직전»(draft) — 포인터를 잡은 채로 상자를 찍는다
  await page.mouse.move(X_SOLO, Y0); await page.mouse.down()
  for (let i = 1; i <= 14; i++) await page.mouse.move(X_SOLO, Y0 + ((Y1 - 10 - Y0) * i) / 14)
  await settle(page)
  const during = await shot(page, ...bandOf(X_SOLO))
  await page.mouse.up(); await settle(page)
  const after = await shot(page, ...bandOf(X_SOLO))
  const jump = diffCount(during, after)

  ledger.draft_commit_jump = {
    changed_px: jump, band: bandOf(X_SOLO),
    note: '잉크 미리보기 몸체는 종전부터 #ink의 벡터선이었다(draftBrushed가 INK를 뺀다). 확정 몸체까지 #ink로 오면서 **둘이 같은 겹·같은 그리기**가 됐다 — 이 수가 그 정합의 값이다.',
  }
  console.log(`[1부 ③] 뗌 순간 달라진 픽셀 ${jump}`)
}

async function arm4(page: Page) {
  await boot(page)
  await page.evaluate(() => (window as any).__b2.diag.setRenderer('classic'))
  await settle(page)
  await fixture(page)
  await pickPencil(page, '2B')
  await drawDown(page, X_OVER, Y0, Y1, 1.5)
  const baseOver = await shot(page, ...bandOf(X_OVER))
  const baseSolo = await shot(page, ...bandOf(X_SOLO))
  await pickPen(page)
  await drawDown(page, X_OVER, Y0, Y1 - 10, 1.5)
  await drawDown(page, X_SOLO, Y0, Y1 - 10, 1.5)
  const over = diffCount(baseOver, await shot(page, ...bandOf(X_OVER)))
  const solo = diffCount(baseSolo, await shot(page, ...bandOf(X_SOLO)))

  ledger.classic = {
    ink_diff_over_pencil: over, ink_diff_solo: solo,
    ratio: solo > 0 ? +(over / solo).toFixed(3) : null,
    note: 'classic은 흑연을 #ink 자신이 grain()으로 그린다 — 잉크 몸체가 #gl에 있으면 그 입자가 위다. 같은 결함의 다른 겹이라 같은 답(잉크를 #ink로)이 둘 다 푼다.',
  }
  console.log(`[1부 ④ classic] 겹친 잉크 ${over} · 대조군 ${solo} · 비 ${solo > 0 ? (over / solo).toFixed(3) : 'n/a'}`)
}

async function arm5(page: Page) {
  await boot(page)
  await fixture(page)
  await pickPen(page)
  await drawDown(page, X_SOLO, Y0, Y1 - 10)
  const id = await page.evaluate(() => (window as any).__b2.app.nextId - 1)
  expect(await page.evaluate((i) => (window as any).__b2.app.lift.lifted.has(i), id)).toBe(true)

  /** **사영이 말하는 직선 위에 실제로 잉크가 있는가** — 어긋나면 여기서 보인다.
   *  중점까지의 «거리»가 아니라 **사영 선분까지의 수직거리**를 잰다: 선을 따라서는 픽셀이
   *  거의 같은 명도라 «중점 거리»는 동률의 첫 칸(창 가장자리)을 집는다 — 그 지표는 어긋남이
   *  아니라 주사 순서를 잰다(첫 판이 그 함정에 걸렸다. 여기 남긴다). 수직거리는 방향과
   *  무관하므로 궤도 뒤(선이 기울어도) 같은 뜻이다. 좌표 변환은 앱과 같은 view다. */
  const probe = async (): Promise<{ off: number | null; best: number | null }> => {
    const seg = await page.evaluate((i) => {
      const b = (window as any).__b2
      const p = b.diag.projectAll()[i]
      if (!p) return null
      const v = b.app.view
      const to = (q: { x: number; y: number }) => ({ x: q.x * v.s + v.ox, y: q.y * v.s + v.oy })
      return { a: to(p.a), b: to(p.b) }
    }, id)
    if (!seg) return { off: null, best: null }
    const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 }
    const R = 12
    const ox = Math.round(mid.x) - R, oy = Math.round(mid.y) - R
    const img = await shotSized(page, ox, oy, R * 2, R * 2)
    const k = img.w / (R * 2)          // 물리 px / CSS px — dpr2에서 2다(위 ⚠)
    let best = 1e9, bx = 0, by = 0
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const i4 = (y * img.w + x) * 4
        const lum = img.px[i4]! * 0.2126 + img.px[i4 + 1]! * 0.7152 + img.px[i4 + 2]! * 0.0722
        if (lum < best) { best = lum; bx = x; by = y }
      }
    }
    // 종이색뿐이면 «잉크가 이 창에 없다»(화면 밖·대기로 떨어짐) — 어긋남과 구별해 null
    if (best > 160) return { off: null, best: +best.toFixed(1) }
    // 점–선분 수직거리(**CSS px** — 물리 픽셀 자리를 k로 나눠 되돌린다). 중심 보정 +0.5.
    const p = { x: ox + (bx + 0.5) / k, y: oy + (by + 0.5) / k }
    const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y
    const L2 = dx * dx + dy * dy
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / L2)) : 0
    const off = Math.hypot(p.x - (seg.a.x + dx * t), p.y - (seg.a.y + dy * t))
    return { off: +off.toFixed(2), best: +best.toFixed(1) }
  }

  const atDraw = await probe()
  // 궤도
  await page.mouse.move(600, 300); await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 20; i++) await page.mouse.move(600 + i * 3, 300 + i)
  await page.mouse.up({ button: 'middle' }); await settle(page)
  const afterOrbit = await probe()
  // 팬(오른버튼) + 줌(휠)
  await page.mouse.move(600, 300); await page.mouse.down({ button: 'right' })
  for (let i = 1; i <= 10; i++) await page.mouse.move(600 - i * 5, 300 + i * 3)
  await page.mouse.up({ button: 'right' }); await settle(page)
  const afterPan = await probe()
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -240); await settle(page)
  const afterZoom = await probe()

  ledger.follow = {
    at_draw: atDraw, after_orbit: afterOrbit, after_pan: afterPan, after_zoom: afterZoom,
    note: 'off = 사영 선분까지의 **수직거리**(px) — 가장 어두운 칸에서 잰다. #ink의 잉크가 #gl의 사영 모델과 같은 좌표를 쓰면 굵기 반경 대역(≤1.5px)에 머문다. best는 그 칸의 광도(잉크 색 101014의 광도는 16이고, 1.5px 선의 AA로 70대가 정상이다 — 그 수가 «잉크가 거기 있다»의 값이다). off=null은 그 창에 어두운 칸이 없다는 뜻(궤도로 화면 밖·대기로 떨어짐) — 어긋남과 구별해 적는다. ⚠ 첫 판은 «중점까지의 거리»를 쟀는데, 선을 따라 명도가 거의 같아 동률의 첫 칸(창 가장자리)이 잡혀 12.04가 상수로 나왔다 — 그 지표는 어긋남이 아니라 주사 순서를 쟀다.',
  }
  console.log(`[1부 ⑤] 작도 ${JSON.stringify(atDraw)} · 궤도 ${JSON.stringify(afterOrbit)}`
    + ` · 팬 ${JSON.stringify(afterPan)} · 줌 ${JSON.stringify(afterZoom)}`)

}

test('1부 회귀 팔 ①~⑤ — 잉크 확정선이 흑연 위로 온다(합성 화면이 판정한다)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  // ⚠ 팔 넷이 **한 시험**이다(위 writeLedger 주석) — 측정을 전부 끝내고 원장을 쓴 뒤에
  // 판정한다. 그래야 실패한 판도 원장에 남아 «수리 전/후»를 나란히 적을 수 있다(D-2).
  await test.step('① 덮임 재현 → 수리 · ② 연필 불변(상자 해시)', () => arm1(page))
  await test.step('③ draft → 확정 무튀김', () => arm3(page))
  await test.step('④ classic 렌더러', () => arm4(page))
  await test.step('⑤ 궤도·팬·줌 추종(불변식 k)', () => arm5(page))
  writeLedger(testInfo)

  const b = ledger.brush as { ink_diff_over_pencil: number; ink_diff_solo: number; lifted: { over: boolean; solo: boolean }; layers: { inkLifted: number; line2: number; liftedTotal: number } }
  // ① — 이 회차의 판별 팔이다. 반증(D-3): 잉크를 #gl로 되돌리면 여기서 실패한다(실행 확인).
  expect(b.lifted.over, '겹친 잉크가 승격됐다(이 결함의 대상)').toBe(true)
  expect(b.lifted.solo, '대조군 잉크가 승격됐다').toBe(true)
  expect(b.ink_diff_solo, '대조군이 0이 아니다 — 계기가 살아 있다(#69 ㉣)').toBeGreaterThan(20)
  expect(b.ink_diff_over_pencil / b.ink_diff_solo, '연필 위 잉크가 맨 종이 위만큼 보인다')
    .toBeGreaterThanOrEqual(VISIBLE_RATIO)
  // 기전의 표식 — 잉크 몸체는 #gl에 하나도 없다(#ink로 갔다). 판정은 위 픽셀이 한다.
  expect(b.layers.inkLifted, '잉크 승격 획이 실제로 있다(표식의 분모)').toBeGreaterThan(0)
  expect(b.layers.line2, '#gl의 Line2 수 = 승격 획 − 잉크 승격 획')
    .toBe(b.layers.liftedTotal - b.layers.inkLifted)

  // ③ 상자는 90×14 = 1260칸 — 그 1%(12칸)를 넘으면 «튀었다»로 본다
  expect((ledger.draft_commit_jump as { changed_px: number }).changed_px, '뗌 순간에 안 튄다')
    .toBeLessThanOrEqual(13)

  // ④ classic — **판별 팔이 아니라 불변 팔이다**(원장 note가 정본): 수리 전에도 통과했다
  //    (classic은 흑연이 성긴 입자라 #gl의 잉크를 안 덮는다). 값은 «수리가 classic의 답을
  //    안 바꿨다»에 있다.
  const c = ledger.classic as { ink_diff_over_pencil: number; ink_diff_solo: number }
  expect(c.ink_diff_solo, 'classic 대조군이 0이 아니다').toBeGreaterThan(20)
  expect(c.ink_diff_over_pencil / c.ink_diff_solo, 'classic에서도 연필 위 잉크가 보인다')
    .toBeGreaterThanOrEqual(VISIBLE_RATIO)

  // ⑤ 불변식 k — 옮긴 겹이 #gl과 같은 사영 모델을 쓴다
  const f = ledger.follow as Record<string, { off: number | null }>
  expect(f.at_draw!.off, '작도 시점에서 잉크가 사영 자리에 있다').not.toBeNull()
  expect(f.at_draw!.off!).toBeLessThanOrEqual(1.5)
  for (const k of ['after_orbit', 'after_pan', 'after_zoom']) {
    const r = f[k]!
    if (r.off === null) continue   // 화면 밖 — 어긋남이 아니다(원장이 null로 적는다)
    expect(r.off, `${k} 뒤에도 잉크가 사영 자리에 있다`).toBeLessThanOrEqual(1.5)
  }
})
