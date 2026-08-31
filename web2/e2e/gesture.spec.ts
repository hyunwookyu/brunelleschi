// web2-18 3부 — **돌리는 중에도 흑연이 남는다**.
//
// 사람이 정한 구속(3-b, 원문): 「그리는 중엔 별로 안 버벅이고, 돌리는데 살짝 느려지는
// 정도. **다만 돌리는 중에도 스케치 질감을 포기할 수는 없다.**」
// 그래서 **팔 ①이 성능 팔보다 먼저**다: 궤도 중 모든 프레임에 흑연이 있어야 한다.
// 벡터선 대체·질감 토글·「돌리는 동안만 classic」은 금지다 — 줄인 것은 획당 비용뿐이다.
//
// 재는 것(지시 3-e):
//   ① 궤도 중 **모든 프레임**에 흑연이 있다(질감 픽셀 수 > 0)   ← 구속의 팔
//   ② ㉠ 경계 — 획이 화면 가장자리를 넘나들 때 갑자기 안 사라진다
//   ③ ㉢ 대가 — 제스처 중 화면과 놓은 뒤 화면의 픽셀 차
//   ④ 0부 ③의 전/후 값은 `stage0/out/cost18_web2*.json`이 든다(여기가 아니다)
//
// 판정은 **합성 화면**이다(#67) — 겹이 셋(#gl·#brushc/#brushsnap·#ink)이라 캔버스별
// 판독으로는 「사람이 보는 것」을 못 잰다. 3부는 겹을 **바꾸는** 회차라 더욱 그렇다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PIXEL_DIFF_CH } from './thresholds'

const HERE = dirname(fileURLToPath(import.meta.url))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function shot(page: Page, x: number, y: number, w: number, h: number): Promise<number[]> {
  return (await shotSized(page, x, y, w, h)).px
}

/** 같은 스크린샷을 **실제 이미지 크기와 함께** — 열/행을 짚어야 할 때 쓴다.
 *  ⚠ dpr2에서는 이미지가 CSS 상자의 2배다(D-C3). 첫 판이 폭을 CSS px로 가정해 dpr2의
 *  「입자 번짐」이 20px로 부풀었다(실제 2px) — 같은 함정이 1부 팔 ⑤에서도 났다. */
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

/** 종이(#f5f3ee)보다 어두운 칸 수 — 「흑연이 있다」의 셈. 문턱은 AA 요동 위. */
function darkCount(px: number[]): number {
  let n = 0
  for (let i = 0; i < px.length; i += 4) if (px[i]! < 245 - 12) n++
  return n
}
function diffCount(a: number[], b: number[]): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(b[i]! - a[i]!) > PIXEL_DIFF_CH || Math.abs(b[i + 1]! - a[i + 1]!) > PIXEL_DIFF_CH ||
        Math.abs(b[i + 2]! - a[i + 2]!) > PIXEL_DIFF_CH) n++
  }
  return n
}

/** 카메라를 닫고 흑연 여러 획을 남긴다 — 궤도로 돌려볼 대상 */
async function scene(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(300, 650); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(300 + 25 * i, 650 - 18 * i)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
  // 승격 획을 여럿 — 앱 경로(commitStroke)로 채운다
  await page.evaluate(() => {
    const b = (window as any).__b2
    const marks = b.diag.vpMarks()
    let s = 12345
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    for (let i = 0; i < 40; i++) {
      const proj = b.diag.projectAll()
      const live = Object.values(proj).filter(Boolean) as any[]
      const seg = live[Math.floor(rnd() * live.length) % live.length]
      const from = rnd() < 0.5 ? seg.a : seg.b
      const vp = marks[Math.floor(rnd() * marks.length) % marks.length].vp
      const dx = vp.x - from.x, dy = vp.y - from.y
      const L = Math.hypot(dx, dy) || 1
      const len = 70 + rnd() * 130
      // 손 오차(#68) — 이상적 좌표만 쓰면 실사용 대역을 안 덮는다
      b.diag.commitStroke(from.x + (rnd() - 0.5) * 6, from.y + (rnd() - 0.5) * 6,
        from.x + (dx / L) * len + (rnd() - 0.5) * 6, from.y + (dy / L) * len + (rnd() - 0.5) * 6)
    }
  })
  await settle(page)
}

const BOX = { x: 260, y: 330, w: 520, h: 320 }
const ledger: Record<string, unknown> = {}

test('3부 ①②③ — 궤도 중 흑연이 모든 프레임에 있다 · 경계에서 안 사라진다 · 제스처/놓은 뒤 차', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await boot(page)
  await scene(page)
  await page.evaluate(() => (window as any).__b2.diag.tileStatsReset())

  const strokes = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  const atRest = darkCount(await shot(page, BOX.x, BOX.y, BOX.w, BOX.h))

  // ── ① 궤도 중 **모든 프레임**에 흑연이 있다 ────────────────────────────
  // 사람의 구속을 지키는 팔이다. 성능 팔보다 먼저 적는다(지시 3-e).
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  const during: number[] = []
  let lastFrame: number[] = []
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(600 + i * 12, 400 + i * 3)
    await settle(page)
    lastFrame = await shot(page, BOX.x, BOX.y, BOX.w, BOX.h)
    during.push(darkCount(lastFrame))
  }
  const heldTiles = await page.evaluate(() => (window as any).__b2.diag.tileStats())
  // ── ③ 제스처 중 화면 ↔ 놓은 뒤 화면 — **같은 포즈**에서 견준다(더 안 움직이고 뗀다)
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const afterRelease = await shot(page, BOX.x, BOX.y, BOX.w, BOX.h)
  const releaseDiff = diffCount(lastFrame, afterRelease)
  const afterCount = darkCount(afterRelease)
  const tilesAfter = await page.evaluate(() => (window as any).__b2.diag.tileStats())

  // ── ② ㉠ 경계 — 획이 화면 가장자리를 넘나든다(크게 팬해서 밖으로 밀어낸다) ────
  // 「갑자기 사라진다」가 아니라 **가장자리에서 서서히 잘린다**여야 한다: 상자를 화면
  // 가장자리에 붙이고, 획이 그 밖으로 나가는 동안 어두운 칸이 **단조로 줄어드는지**가
  // 아니라 «가장자리 상자에 흑연이 남아 있는지»를 본다(잘라내기 여유가 0이면 중심이 밖인
  // 순간 입자까지 통째로 사라져 이 값이 0으로 떨어진다 — 반증 조건).
  const edge = { x: 0, y: 300, w: 40, h: 300 }
  const panSteps: number[] = []
  await page.mouse.move(600, 400); await page.mouse.down({ button: 'right' })
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(600 - i * 40, 400)
    await settle(page)
    panSteps.push(darkCount(await shot(page, edge.x, edge.y, edge.w, edge.h)))
  }
  await page.mouse.up({ button: 'right' }); await settle(page)

  ledger.scene = { strokes, at_rest_dark_px: atRest, box: BOX }
  ledger.orbit = {
    dark_px_per_frame: during, min: Math.min(...during),
    tiles_held: heldTiles, tiles_after_release: tilesAfter,
    note: '① 사람의 구속(「돌리는 중에도 스케치 질감을 포기할 수 없다」)의 팔이다 — 궤도 중 매 프레임 흑연 칸 수가 0보다 커야 한다. tiles_held.active=true가 «타일 경로가 실제로 돌았다»의 표식이고(그 값이 false면 이 팔은 종전 경로를 재는 것이다), tiles_after_release.active=false가 «놓으면 정확히 다시 굽는다»의 표식이다.',
  }
  ledger.release_diff = {
    changed_px: releaseDiff, box_px: BOX.w * BOX.h,
    ratio: +(releaseDiff / (BOX.w * BOX.h)).toFixed(4),
    dark_last_frame: during[during.length - 1], dark_after_release: afterCount,
    note: '③ ㉢의 **대가**다: 제스처 중에는 구운 타일을 길이 방향으로만 아핀 변환해 붙이므로 결이 늘거나 눌린다. 놓으면 정확히 다시 굽는다(정본은 언제나 놓은 뒤 화면). 이 수가 그 차이의 크기다 — 임계를 걸지 않고 **값으로 적는다**(무엇이 옳은 값인지 아는 근거가 없다. 실기기에서 「돌릴 때 결이 이상하다」가 오면 이 행이 그 자리다).',
  }
  ledger.clip_edge = {
    dark_px_per_step: panSteps, box: edge,
    note: '② 획이 왼쪽 가장자리를 넘어가는 동안 가장자리 상자(40px 폭)의 흑연 칸 수. ⚠⚠ **이 열은 여유(CLIP_MARGIN_PX)를 안 가른다** — 여유를 0으로 두고 실제로 돌렸는데 **같은 수**가 나왔다(그 팬에서는 획의 한 끝이 늘 화면 안이라 상자 검사가 애초에 안 걸린다. PITFALLS #71 ㉣). **여유의 반증 자리는 아래 `clip_margin.edge_dark_px`다**(두 끝이 모두 화면 밖인 세로획 — 거기서는 여유 0에서 실제로 0이 된다). 이 열이 남는 이유는 «가장자리에서 통째로 사라지지 않는다»의 눈 확인뿐이다.',
  }

  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/gesture_tiles_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  // 원장은 LEDGER=1 단독 실행에서만 쓴다(web2-22 규율·#71 ㉠의 문 — web2-24 3부 전면화).
  // 팔은 그대로 돈다 — 원장만 안 덮는다. 정본 명령: LEDGER=1 npx playwright test gesture --workers=1
  if (process.env.LEDGER === '1') writeFileSync(out, JSON.stringify({
    conditions: {
      workers: testInfo.config.workers, project: testInfo.project.name,
      canonical: 'LEDGER=1 npx playwright test gesture --workers=1',
      time_validity: '⚠ tile_bake_ms 등 시간 칸은 이 conditions.workers의 값이다(#71 ㉠)',
    },
    what: `web2-18 3부 — 돌리는 중에도 흑연이 남는가(${testInfo.project.name}). 획별 질감 캐시(㉢)와 화면 밖 잘라내기(㉠)의 표현 쪽 값. 성능 쪽 값(궤도 1프레임 합)은 cost18_web2*.json이 든다.`,
    threshold: { pixel_diff_ch: PIXEL_DIFF_CH, dark_lt: 233 },
    flags_explained: {
      'clip_edge.dark_px_per_step 앞쪽이 전부 0': '획이 아직 가장자리 상자에 안 닿았다 — 팬이 진행돼야 들어온다. 0이 «사라졌다»가 아니라 «아직 없다»다. ⚠ 이 열은 **여유(CLIP_MARGIN_PX)의 판별력이 없다**(여유 0으로 돌려도 같은 수였다 — #71 ㉣). 여유를 재는 것은 ②-b(clip_margin 블록)다.',
      'orbit.dark_px_per_frame이 정지값보다 작다': '**㉢의 대가다**(AS-C58): 구운 타일을 길이 방향으로 늘려 붙이므로 결이 옅어져 어두운 칸 문턱 아래로 내려간다. 놓으면 정확히 다시 굽고 값이 돌아온다(release_diff의 dark_last_frame → dark_after_release).',
    },
    ...ledger,
  }, null, 1))

  console.log(`[3부 ①] 궤도 중 흑연 칸 ${JSON.stringify(during)} (정지 ${atRest}) · 타일 ${JSON.stringify(heldTiles)}`)
  console.log(`[3부 ③] 뗀 뒤 달라진 칸 ${releaseDiff}/${BOX.w * BOX.h} · 어두운 칸 ${during[during.length - 1]} → ${afterCount}`)
  console.log(`[3부 ②] 가장자리 흑연 칸 ${JSON.stringify(panSteps)}`)

  // ── 판정 ──────────────────────────────────────────────────────────────
  expect(atRest, '정지 화면에 흑연이 있다 — 계기가 살아 있다(#69 ㉣)').toBeGreaterThan(200)
  expect(heldTiles.active, '궤도 중 타일 경로가 실제로 돌았다(안 돌았으면 이 팔은 종전 경로를 잰다)').toBe(true)
  expect(heldTiles.tiles, '타일이 실제로 구워졌다').toBeGreaterThan(10)
  // ① 사람의 구속 — 모든 프레임에 흑연이 있다
  for (let i = 0; i < during.length; i++) {
    expect(during[i], `궤도 프레임 ${i}에 흑연이 있다`).toBeGreaterThan(0)
  }
  // 「있다」가 «한두 칸»이면 구속을 지킨 것이 아니다 — 정지 화면의 절반 대역은 남아야 한다
  expect(Math.min(...during), '궤도 중 흑연이 «남아 있다»(정지의 절반 이상)')
    .toBeGreaterThan(atRest * 0.5)
  expect(tilesAfter.active, '놓으면 타일 경로가 꺼지고 정확히 다시 굽는다').toBe(false)
  // ② 가장자리 — 획이 넘어가는 동안 어느 걸음에서도 통째로 사라지지 않는다.
  //    ⚠ 마지막 몇 걸음은 «정말로 다 나간» 것이므로 0이 옳다. 판정은 **첫 0이 나오기
  //    전까지 단조롭게 줄었는가**가 아니라, 「0이 아닌 걸음이 여럿 있었는가」다 —
  //    여유가 0이면 그 구간이 통째로 사라진다.
  expect(panSteps.filter(v => v > 0).length, '가장자리를 넘는 동안 흑연이 여러 걸음 남아 있다')
    .toBeGreaterThan(2)
})

test('②-b ㉠ 여유 — 획 중심이 화면 밖이어도 입자는 안으로 들어온다(여유 0이면 사라진다)', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  // ⚠ 위 팔 ②는 **여유의 판별력이 없다**(실측으로 확인했다: `CLIP_MARGIN_PX`를 0으로 두고
  //   돌려도 같은 수가 나왔다 — 그 팬에서는 획의 한 끝이 늘 화면 안이라 상자 검사가
  //   애초에 안 걸린다). 여유를 재려면 **두 끝이 모두 화면 밖이면서 입자는 안으로 들어오는**
  //   자리가 필요하다 — 세로획을 왼쪽 가장자리 바로 밖으로 밀어 그 자리를 만든다(D-3).
  await boot(page)
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
  // 세로획 — 두 끝의 x가 같다(가장자리 밖으로 통째로 나갈 수 있는 유일한 형태)
  await page.mouse.move(500, 560); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(500, 560 - 18 * i)
  await page.mouse.up(); await settle(page)

  // 입자가 옆으로 얼마나 번지는지 먼저 잰다 — 그 값이 «여유가 뜻이 있는 대역»이다
  const spread = await (async () => {
    const img = await shotSized(page, 500 - 20, 420, 40, 120)
    const k = img.w / 40                 // 물리 px / CSS px (dpr)
    let leftMost = img.w
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4
      if (img.px[i]! < 233 && x < leftMost) leftMost = x
    }
    return +(20 - leftMost / k).toFixed(1)   // 획 중심에서 왼쪽으로 번진 **CSS px**
  })()

  // 획을 왼쪽 가장자리 **밖**으로 민다 — 중심이 −1px가 되게(입자는 안으로 들어올 자리).
  // ⚠ 1px인 근거는 **위에서 잰 번짐**이다(실측 2px — 그보다 크게 밀면 입자도 안 들어와서
  //    여유의 판별력이 사라진다. 첫 판이 4px로 밀어 그 함정에 빠졌다: 「여유가 0이어도
  //    같은 수」가 나왔는데 그것은 여유가 무의미해서가 아니라 **격자가 실패 불가**였기
  //    때문이다 — #69 ㉣의 형태다).
  const off = 1
  await page.mouse.move(600, 300); await page.mouse.down({ button: 'right' })
  await page.mouse.move(600 - (500 + off), 300)
  await settle(page)
  const edgePx = darkCount(await shot(page, 0, 420, Math.max(2, spread), 120))
  await page.mouse.up({ button: 'right' }); await settle(page)

  // 이 값은 `CLIP_MARGIN_PX`의 **근거**다 — 원장에 남긴다(#47: 산문에 안 박고 필드로 읽는다)
  const suffix2 = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/gesture_tiles_web2${suffix2}.json`)
  // 원장은 LEDGER=1 단독 실행에서만 쓴다(위 첫 쓰기와 같은 문 — web2-24 3부 전면화).
  // 이 블록은 «읽고 다시 쓰기»라 문이 없으면 전량 실행이 기준선을 부분 덮어쓴다.
  if (process.env.LEDGER === '1') try {
    const cur = JSON.parse(readFileSync(out, 'utf8'))
    cur.clip_margin = {
      particle_spread_css_px: spread, stroke_center_off_px: off, edge_dark_px: edgePx,
      margin_px: 24,
      note: '㉠ 여유(CLIP_MARGIN_PX)의 근거. particle_spread = 획 중심에서 옆으로 번진 CSS px 실측. 여유는 그것 + 굵기 대역 상한(니브 4px)보다 넉넉해야 한다. edge_dark_px는 «중심이 화면 밖 1px인 세로획의 입자가 안으로 들어온 칸 수» — 여유를 0으로 두면 0이 된다(반증을 실제로 돌려 확인했다).',
    }
    writeFileSync(out, JSON.stringify(cur, null, 1))
  } catch { /* 앞 팔이 안 돌았으면 원장이 없다 — 콘솔에만 남는다 */ }
  console.log(`[3부 ②-b] 입자 번짐 ${spread}px · 중심 −${off}px에서 가장자리 흑연 칸 ${edgePx} (원장 ${out})`)

  expect(spread, '입자가 실제로 옆으로 번진다 — 안 번지면 여유는 잴 것이 없다(#69 ㉣)')
    .toBeGreaterThan(off)   // 실측 2px > 1px — 격자가 실패 가능하다
  expect(edgePx, `획 중심이 화면 밖 ${1}px여도 입자가 안으로 들어온다(여유 0이면 0이 된다)`)
    .toBeGreaterThan(0)
})

// ── web2-26 5번 — **한 손가락으로 화면을 옮긴다** (배선 팔) ────────────────────
// 단위 팔(`test/finger26.test.ts`)이 재는 것은 **뜻을 정하는 술어**(`fingerPans`)다.
// 여기서는 그 술어가 실제 손짓 배선에 걸려 있는지를 본다 — 손가락 포인터를 직접 쏜다.
//
// D-2 재현: 눈높이 선언 단계(기하 없음)에서 한 손가락은 **아무 일도 안 했다**
//   (`orbitBy`가 `lifted.size === 0`에서 첫 줄 반환). 그 상태를 ①이 그대로 잰다.
// ⚠ web2-30 1번이 ②를 뒤집었다 — 판정에서 `penUsed`가 빠졌다(3D가 서면 궤도).
// D-3 반증: ②에서 **기하를 비우면**(3D를 지우면) 같은 손짓이 도로 화면을 옮긴다.

async function fingerDrag(page: import('@playwright/test').Page, x0: number, y0: number, x1: number, y1: number) {
  await page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('ink')!   // input.ts가 배선하는 캔버스
    const ev = (type: string, x: number, y: number, buttons: number) =>
      c.dispatchEvent(new PointerEvent(type, {
        pointerType: 'touch', pointerId: 91, isPrimary: true, buttons, pressure: buttons ? 0.5 : 0,
        clientX: x, clientY: y, bubbles: true, cancelable: true,
      }))
    ev('pointerdown', x0 as number, y0 as number, 1)
    for (let i = 1; i <= 6; i++) {
      ev('pointermove', (x0 as number) + ((x1 as number) - (x0 as number)) * i / 6,
        (y0 as number) + ((y1 as number) - (y0 as number)) * i / 6, 1)
    }
    ev('pointerup', x1 as number, y1 as number, 0)
  }, [x0, y0, x1, y1] as const)
  await settle(page)
}

const viewOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({ ...(window as any).__b2.app.view }))
const strokeCount = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
/** 카메라 자세의 사원수 — 궤도가 «돌았는가»를 눈이 아니라 수치로 본다 */
const poseQ = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({ ...(window as any).__b2.app.pose.q })) as Promise<{ x: number; y: number; z: number; w: number }>
/** 두 사원수의 거리(부호 무시) — 0이면 자세가 안 바뀐 것 */
const quatDelta = (a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }) =>
  Math.min(
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w),
    Math.hypot(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w))

test('26-5 ① 눈높이 선언 단계 — 한 손가락 드래그가 화면을 옮긴다', async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)).toBe(0)
  const v0 = await viewOf(page)
  await fingerDrag(page, 500, 400, 620, 470)
  const v1 = await viewOf(page)
  console.log(`[26-5 ①] 선언 단계 한 손가락 — ox ${v0.ox} → ${v1.ox} · oy ${v0.oy} → ${v1.oy}`)
  expect(Math.abs(v1.ox - v0.ox)).toBeGreaterThan(50)
  expect(Math.abs(v1.oy - v0.oy)).toBeGreaterThan(30)
  expect(await strokeCount(page)).toBe(0)              // 손가락은 안 그린다
})

test('30-1 ② 펜을 쓴 세션 + 3D — 한 손가락이 **궤도**다 (H4 회귀 · +반증: 3D 서기 전엔 이동)', async ({ page }) => {
  await boot(page)
  // **반증을 먼저 잰다**(D-3) — 3D가 서기 전의 같은 손짓은 화면을 옮긴다(궤도가 아니다).
  // ⚠ 순서가 이 방향이어야 한다: 궤도를 돈 뒤에 `lifted`를 비우면 `panBy`도 첫 줄에서
  //    반환하므로(작도 포즈를 이미 벗어났다) **아무 일도 안 나** 대비가 안 선다.
  const qA = await poseQ(page), vA = await viewOf(page)
  await fingerDrag(page, 400, 300, 520, 360)
  const qB = await poseQ(page), vB = await viewOf(page)
  console.log(`[30-1 ②-반증] 3D 서기 전 — |Δq| ${quatDelta(qA, qB).toExponential(2)} · Δox ${(vB.ox - vA.ox).toFixed(3)}`)
  expect(quatDelta(qA, qB)).toBeLessThan(1e-9)          // 안 돈다
  expect(Math.abs(vB.ox - vA.ox)).toBeGreaterThan(50)   // 화면을 옮긴다

  // 펜으로 카메라를 닫는다 — CDP 실입력(펜 신호가 실제로 온다)
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const }
  for (const [ax, ay, bx, by] of [[280, 560, 700, 560], [500, 560, 800, 480]] as const) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, ...pen, force: 0.4 })
    for (let i = 1; i <= 6; i++)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + (bx - ax) * i / 6, y: ay + (by - ay) * i / 6, ...pen, force: 0.4 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, ...pen, force: 0 })
  }
  await cdp.detach()
  await settle(page)
  const st = await page.evaluate(() => ({
    penUsed: (window as any).__b2.app.penUsed,
    lifted: (window as any).__b2.app.lift.lifted.size,
  }))
  console.log(`[30-1 ②] penUsed ${st.penUsed} · lifted ${st.lifted}`)
  expect(st.penUsed).toBe(true)
  expect(st.lifted).toBeGreaterThan(0)                // 분해능 — 돌 것이 실제로 있다

  const q0 = await poseQ(page)
  const v0 = await viewOf(page)
  const n0 = await strokeCount(page)
  await fingerDrag(page, 400, 300, 520, 360)
  const q1 = await poseQ(page)
  const v1 = await viewOf(page)
  console.log(`[30-1 ②] 펜 세션 + 3D 한 손가락 — |Δq| ${quatDelta(q0, q1).toFixed(6)} · Δox ${(v1.ox - v0.ox).toFixed(3)}`)
  expect(quatDelta(q0, q1)).toBeGreaterThan(1e-3)     // **궤도를 돈다**(H4가 고쳐졌다)
  expect(Math.abs(v1.ox - v0.ox)).toBeLessThan(1)     // 화면은 안 옮긴다
  expect(await strokeCount(page)).toBe(n0)            // 획을 안 만든다
})

// **펜 획이 진행 중이면 손가락 제스처를 전부 무시한다**(30-1 게이트 · 팜 리젝션 회귀).
// 실기기에서 통과한 분이고, 30-1이 한 손가락의 뜻을 «궤도»로 되돌렸으므로 **여기서 새는
// 것이 더 아프다** — 손바닥이 닿으면 그리는 도중에 시점이 돈다.
test('30-1 펜 획 진행 중 손가락 접촉이 시점을 안 바꾼다 (+반증: 펜을 떼면 같은 손짓이 돈다)', async ({ page }) => {
  await boot(page)
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const }
  for (const [ax, ay, bx, by] of [[280, 560, 700, 560], [500, 560, 800, 480]] as const) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, ...pen, force: 0.4 })
    for (let i = 1; i <= 6; i++)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + (bx - ax) * i / 6, y: ay + (by - ay) * i / 6, ...pen, force: 0.4 })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, ...pen, force: 0 })
  }
  expect(await page.evaluate(() => (window as any).__b2.app.lift.lifted.size)).toBeGreaterThan(0)

  // 펜을 **누른 채로** 손가락을 끈다
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 560, ...pen, force: 0.4 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540, y: 600, ...pen, force: 0.4 })
  await settle(page)
  const q0 = await poseQ(page), v0 = await viewOf(page)
  await fingerDrag(page, 400, 300, 520, 360)
  const q1 = await poseQ(page), v1 = await viewOf(page)
  console.log(`[30-1 팜] 펜 접촉 중 — |Δq| ${quatDelta(q0, q1).toExponential(2)} · Δox ${(v1.ox - v0.ox).toFixed(3)}`)
  expect(quatDelta(q0, q1)).toBeLessThan(1e-9)
  expect(Math.abs(v1.ox - v0.ox)).toBeLessThan(1e-9)

  // 펜을 뗀다 — **반증**: 같은 손짓이 이제 시점을 돌린다(위 팔이 「늘 참」이 아니다)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 540, y: 600, ...pen, force: 0 })
  await cdp.detach()
  await settle(page)
  const q2 = await poseQ(page)
  await fingerDrag(page, 400, 300, 520, 360)
  const q3 = await poseQ(page)
  console.log(`[30-1 팜-반증] 펜 뗀 뒤 — |Δq| ${quatDelta(q2, q3).toFixed(6)}`)
  expect(quatDelta(q2, q3)).toBeGreaterThan(1e-3)
})
