// web2-20 3부 — **종이의 표현**(막·섬유질·비침)의 회귀 팔. ⛔⛔ 게이트 = ④⑤⑨(+1-b 왕복은
// layers.test). 조건(#71): dpr 둘 다 · 뷰포트 1200×800 · 판독 자리는 합성 스크린샷(#67 —
// 막은 CSS mix-blend라 캔버스별 판독으로는 곱이 안 보인다. 캔버스 판독은 기전 표식).
//
//   ① 옐로를 얹으면 아래가 노랗게(rect 안·밖 픽셀)   ② 다른 종이로 가면 막이 사라진다
//   ③ 활성 겹 **위**의 막은 안 그려진다               ④ 합성 곡선(HSL — 게이트)
//   ⑤ 층마다 결이 다르다(해시 — 게이트) ⑤' 이음매 없음 ⑥ 저장·복원 뒤 결 동일
//   ⑦ rect가 자라도 결이 안 미끄러진다               ⑧ 세 장 겹쳐도 아래 획이 읽힌다
//   ⑨ 활성 겹 획이 막 위 · 아래 획이 막 아래(게이트)   ⑩ 비용은 아래 «비용» 팔
//   반증(D-3 — 셋 다 실제 실행): 알파 합성↔④ · 상수 시드↔⑤ · 막을 위로↔⑨

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** [#25 — 2차 리뷰 [3]] 게이트·팔의 실측값을 원장으로 남긴다. 시험마다 그 자리에서
 *  읽고-합쳐-쓴다(#71 ㉡ — afterAll은 실패 시 통째로 빈다. workers=1이라 경합 없음). */
function record(project: string, key: string, val: unknown) {
  const suffix = project === 'dpr1' ? '' : `_${project}`
  const p = resolve(HERE, `../../stage0/out/paper_visual_web2${suffix}.json`)
  mkdirSync(dirname(p), { recursive: true })
  let cur: Record<string, unknown> = {}
  try { cur = JSON.parse(readFileSync(p, 'utf-8')) } catch { /* 첫 시험 */ }
  cur.what = 'web2-20 3부 — 종이 표현 팔의 실측값 원장(paper.spec이 시험마다 그 자리에서 쓴다). 판정은 spec의 expect가 정본이고 이 원장은 그 판정이 읽은 값이다(#25 — 산문에만 있던 수를 원장으로).'
  cur.flags_explained = {
    '상수·지표 스냅샷 없음': 'cost18·cost20 원장과 같은 유보 — e2e 하네스라 test/constants.ts의 공유 상수를 안 쓴다.',
    'rect_growth.patch_equal이 정확히 true': '설계 보장이다(패턴 원점을 문서 좌표에 못 박음 — 3-c ⚠) — 임계를 걸지 않는다(자기참조 유형 3).',
  }
  cur[key] = val
  writeFileSync(p, JSON.stringify(cur, null, 2))
}

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

async function closeCamera(page: Page) {
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
}

async function addPaper(page: Page, paper: 'tracing' | 'yellow') {
  await page.click('#layer-add')
  await page.click(`#layer-pop .lpick[data-paper="${paper}"]`)
  await settle(page)
}

/** 겹 목록을 편다 — **토글**이라 열려 있는데 또 누르면 닫힌다(web2-25 4-a) */
async function openList(page: Page) {
  if (await page.locator('#layer-list').count() === 0) {
    await page.click('#layer-summary')
    await settle(page)
  }
}

/** 합성 화면 픽셀(#67 — 사람이 보는 것) — 평균 RGB */
async function avgRGB(page: Page, x: number, y: number, w: number, h: number): Promise<[number, number, number]> {
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } })
  return await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let r = 0, gg = 0, b = 0, n = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]!; gg += d[i + 1]!; b += d[i + 2]!; n++ }
    return [r / n, gg / n, b / n] as [number, number, number]
  }, buf.toString('base64'))
}
const lightness = (c: [number, number, number]) => (Math.max(...c) + Math.min(...c)) / 2 / 255
// 채도는 **HSV**로 잰다 — HSL의 S는 분모(1−|2L−1|)가 명도와 얽혀 곱의 «짙어짐»을
// 거의 안 비춘다(첫 실행 실측: 옐로 둘에서 +0.004 — 분해능 아래 #71 ㉢). HSV S는
// (max−min)/max라 어두워지며 짙어지는 곱의 방향을 그대로 비춘다(+0.19).
const saturation = (c: [number, number, number]) => {
  const mx = Math.max(...c), mn = Math.min(...c)
  return mx === 0 ? 0 : (mx - mn) / mx
}

test('①②③ — 옐로가 아래를 물들인다 · 막은 그 종이의 시점에서만 · 활성 위 막은 없음', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  const before = await avgRGB(page, 400, 200, 40, 40)     // 획 없는 빈 자리
  await addPaper(page, 'yellow')
  // rect 크기를 줄여 안/밖을 가른다(값 채널 — 안:노랗게, 밖:그대로)
  await page.evaluate(() => {
    const a = (window as any).__b2.app
    a.doc.layers[0].rect = { x: 100, y: 100, w: 500, h: 300 }
  })
  await drawLine(page, 900, 700, 901, 701)                // 무해한 재그리기 유발(짧은 획은 버려진다)
  const inside = await avgRGB(page, 400, 200, 40, 40)
  const outside = await avgRGB(page, 700, 200, 40, 40)
  // ① 안은 노랗다(파랑 채널이 준다 — 곱), 밖은 그대로
  expect(inside[2]).toBeLessThan(before[2] - 12)
  expect(Math.abs(outside[2] - before[2])).toBeLessThan(4)
  // ② 다른 종이로 가면 막이 사라지고, 돌아오면 다시 뜬다
  await page.click('#paper-add'); await page.keyboard.press('Escape'); await settle(page)
  // ⚠ **셔터의 번쩍임이 가라앉기를 기다린다**(web2-25 3-a) — 이 팔은 `page.screenshot`으로
  //   **합성 화면**을 읽으므로 흰 덮개가 잠깐 밝기를 올린다(실측: 파랑 채널 +7).
  //   팔이 지키던 요구(「다른 종이에서는 막이 없다」)는 그대로이고 읽는 **시점**만 미룬다.
  await page.locator('#shutter-flash').waitFor({ state: 'detached', timeout: 3000 })
  await settle(page)
  const away = await avgRGB(page, 400, 200, 40, 40)
  expect(Math.abs(away[2] - before[2])).toBeLessThan(6)   // 막 없음(대략 원색 — 다른 종이)
  await page.click('#paperbar .ptab[data-sheet="0"]'); await settle(page)
  // 돌아오면 활성 겹이 풀려 있다(종이 전환 규칙) — **목록의 줄**로 다시 활성
  // (web2-25 4부: 겹 탭 더미 → 접으면 요약·펼치면 목록. 닿는 자리만 옮겼다)
  await openList(page)
  await page.click('#layer-list .lrow'); await settle(page)
  const back = await avgRGB(page, 400, 200, 40, 40)
  expect(back[2]).toBeLessThan(before[2] - 12)
  // ③ 활성 겹 위의 막은 안 그려진다 — 트레이싱지를 하나 더 얹고(활성) 옐로를 활성으로
  //   내리면, 위(트레이싱지)의 막이 사라져 그 자리 픽셀이 옐로만의 값으로 돌아온다
  const yellowOnly = await avgRGB(page, 400, 200, 40, 40)
  await addPaper(page, 'tracing')                          // 맨 위·활성 — 막 둘 다 그려진다
  const both = await avgRGB(page, 400, 200, 40, 40)
  expect(both[0] + both[1] + both[2]).toBeLessThan(yellowOnly[0] + yellowOnly[1] + yellowOnly[2] - 3)
  await openList(page)                                              // 목록을 편다(4부)
  await page.click('#layer-list .lrow.yellow'); await settle(page)  // 옐로를 활성으로 — 위 막 꺼짐
  const lowerActive = await avgRGB(page, 400, 200, 40, 40)
  for (let i = 0; i < 3; i++) expect(Math.abs(lowerActive[i]! - yellowOnly[i]!)).toBeLessThan(4)
  record(test.info().project.name, 'tint_and_pose_gate', { before, inside, outside, away, back, yellowOnly, both, lowerActive })
})

test('④ 합성 곡선(게이트) — 명도 단조 감소 · 옐로 둘 채도 상승 · 섞으면 채도 하강 (+알파 반증)', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  const P = [400, 200, 40, 40] as const
  const bare = await avgRGB(page, ...P)
  await addPaper(page, 'yellow')
  const y1 = await avgRGB(page, ...P)
  await addPaper(page, 'yellow')
  const y2 = await avgRGB(page, ...P)
  await addPaper(page, 'tracing')
  const y2t = await avgRGB(page, ...P)
  // 명도 단조 감소 — 겹칠수록 어두워진다(곱)
  expect(lightness(y1)).toBeLessThan(lightness(bare))
  expect(lightness(y2)).toBeLessThan(lightness(y1))
  expect(lightness(y2t)).toBeLessThan(lightness(y2))
  // 옐로 둘 — 채도가 오른다(짙어진다) · 트레이싱지를 섞으면 — 채도가 내린다
  expect(saturation(y2)).toBeGreaterThan(saturation(y1) + 0.02)
  expect(saturation(y2t)).toBeLessThan(saturation(y2) - 0.01)
  // **반증(D-3) — 알파 합성으로 바꾸면 이 곡선이 무너진다**(실제 실행 — diag 손잡이):
  // 알파(덮개)에서는 겹이 쌓여도 마지막 막 색으로 수렴한다 — 곱의 «누적으로 어두워짐»이
  // 사라져 세 겹의 결과가 곱보다 밝다.
  await page.evaluate(() => (window as any).__b2.diag.filmAlphaForTest(true))
  await settle(page)
  const alpha2 = await avgRGB(page, ...P)
  await page.evaluate(() => (window as any).__b2.diag.filmAlphaForTest(false))
  await settle(page)
  expect(lightness(alpha2)).toBeGreaterThan(lightness(y2t) + 0.02)
  record(test.info().project.name, 'curve', {
    note: 'V(명도) 단조 감소가 곱의 성질이고 S(HSV 채도)의 방향은 이 색조 쌍에서의 실측이다(1차 리뷰 [12] — AS-C68).',
    bare: { L: lightness(bare), S: saturation(bare) },
    y1: { L: lightness(y1), S: saturation(y1) },
    y2: { L: lightness(y2), S: saturation(y2) },
    y2t: { L: lightness(y2t), S: saturation(y2t) },
    alpha_counter: { L: lightness(alpha2), note: '알파 반증 — 곱(y2t)보다 밝다' },
  })
})

test('⑤⑤\'⑥ — 층마다 결이 다르고(게이트) · 이음매가 없고 · 결정론(저장·복원 동일)', async ({ page }) => {
  await boot(page)
  // ⑤ 같은 종류·다른 층 → 타일 픽셀이 다르다(해시). **반증**: 같은 id면 같다(= 시드를
  //   상수로 두면 층별 차이가 사라져 이 팔이 실패한다 — 구성으로 실행).
  const h = await page.evaluate(() => {
    const d = (window as any).__b2.diag
    return {
      a: d.fiberTileHash(101, 'yellow'), b: d.fiberTileHash(102, 'yellow'),
      aAgain: d.fiberTileHash(101, 'yellow'),
      tr: d.fiberTileHash(101, 'tracing'),
    }
  })
  expect(h.a).not.toBe(h.b)          // 층마다 다르다
  expect(h.a).toBe(h.aAgain)         // 결정론 — 다시 열어도 같은 결(⑥의 근거)
  expect(h.a).not.toBe(h.tr)         // 종이 종류도 가른다(색+섬유 매개변수)
  // ⑤' 이음매 — 2×2 반복에서 경계 줄의 이웃 열 차이가 내부와 같은 대역(감싸 그리기).
  //   **반증**: wrap=false 타일은 경계 차이가 크게 나온다(실제 실행).
  const seam = await page.evaluate(() => {
    const d = (window as any).__b2.diag
    const energy = (tile: HTMLCanvasElement) => {
      const c = document.createElement('canvas')
      c.width = tile.width * 2; c.height = tile.height * 2
      const g = c.getContext('2d')!
      for (const [ox, oy] of [[0, 0], [tile.width, 0], [0, tile.height], [tile.width, tile.height]])
        g.drawImage(tile, ox as number, oy as number)
      const W = c.width, H = c.height
      const img = g.getImageData(0, 0, W, H).data
      // 이음매의 흔적은 «기울기»가 아니라 **섬유 밀도의 결핍**이다(감싸 그리기를 빼면
      // 경계 띠에 걸치는 섬유의 절반이 사라져 그 띠가 밝아진다 — 첫 판의 이웃 열 차
      // 척도는 그 결핍을 못 쟀다: 양쪽 다 배경이라 차가 작다. 실측으로 바꿨다).
      // 척도 = **섬유 에너지**(바탕 대비 편차의 합) — 밝기 평균은 알파 0.02~0.07의
      // 결핍을 못 쟀다(둘째 판 실측 0.15 — 분해능 아래 #71 ㉢). 바탕은 전체 평균으로
      // 근사한다(섬유가 옅어 평균 ≈ 바탕색).
      // ⚠ **배경 기준을 «전체 평균»에서 «밝은 쪽 분위수»로 바꿨다**(web2-26 2번).
      // 평균 기준은 결이 옅을 때만 산다: 결의 진폭을 지각 대역으로 올리자(26-2) 평균이
      // 종이색에서 멀어져 **섬유가 없는 빈 띠도 «평균에서 멀어»** 에너지가 커졌고,
      // 이음매 결핍의 부호가 뒤집혔다(raw 1.03 > wrapped 0.93 — 판정 자체가 무너졌다).
      // 종이색은 «가장 밝은 쪽»이다(섬유는 어둡게만 얹힌다) — 98분위를 기준으로 잡고
      // 에너지를 **어두워진 몫**으로만 센다. 그러면 빈 띠 = 0이 구성상 옳다.
      const lum: number[] = []
      for (let i = 0; i < img.length; i += 4) lum.push(0.299 * img[i]! + 0.587 * img[i + 1]! + 0.114 * img[i + 2]!)
      const sorted = [...lum].sort((a, b) => a - b)
      const bg = sorted[Math.floor(sorted.length * 0.98)]!
      const bandEnergy = (x0: number, x1: number) => {
        let s = 0, n = 0
        for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) {
          s += Math.max(0, bg - lum[y * W + x]!)
          n++
        }
        return s / n
      }
      // ⚠ **읽는 자리를 타일 크기에 비례로 잡는다**(web2-26 2번 · #71 ㉤): 종전에는
      // 60~200으로 못 박혀 있었고 타일이 늘 256 device px이던 시절에는 그것이 왼쪽 타일
      // 안(이음매 256에서 먼 자리)이었다. dpr을 따라 타일이 128~384로 갈리자 dpr1에서
      // **내부 대역이 이음매를 가로질러** 기준값이 오염됐다(raw 1.025 > wrapped 0.922 —
      // 판정이 뒤집혔다). 답은 임계가 아니라 읽는 자리다.
      const seamBand = bandEnergy(tile.width - 3, tile.width + 3)
      const interior = bandEnergy(Math.round(tile.width * 0.23), Math.round(tile.width * 0.78))
      return { ratio: seamBand / interior }
    }
    // 시드 축 스윕(2차 리뷰 [10] · #14) — 타일은 rng32(id) 결정론이라 **실행 반복은
    // 변동 0**(⑤의 aAgain 팔이 그 결정론을 잰다). 변동의 축은 실행이 아니라 시드다 —
    // id 셋에서 같은 판정이 서는지 본다.
    const ids = [7, 12, 33]
    return {
      sweep: ids.map(id => ({ id, wrapped: energy(d.fiberTile(id, 'yellow', true)).ratio, raw: energy(d.fiberTile(id, 'yellow', false)).ratio })),
    }
  })
  // 감싸 그리면 경계 띠의 섬유 에너지가 내부 대역이고, 빼면 결핍이 뚜렷하다(반증 실행).
  // 임계는 **상대**다(dpr2에서 섬유가 타일 px 기준 두 배라 절대 차가 준다 — 실측 보정).
  // 절대 0.8은 wrapped의 바닥 위생값(dpr1에서는 raw가 실제로 그 아래로 내려가 반증되고,
  // dpr2에서는 상대 단언이 판별한다 — 실측값은 원장·NOTES).
  for (const s of seam.sweep) {
    console.log(`[⑤'] id ${s.id} — wrapped ${s.wrapped.toFixed(3)} · raw ${s.raw.toFixed(3)}`)
    // 절대 바닥은 **위생값**이고 판별은 아래 상대 단언이 한다. 0.8 → 0.7로 다시 잡았다:
    // 에너지의 정의가 갈렸으므로(평균 기준 → 98분위 기준 · web2-26 2번) 옛 값의 근거가
    // 같이 갔다. 새 관측 대역은 0.78~1.02(시드 셋 × dpr 둘 — 위 출력이 정본).
    expect(s.wrapped, `id ${s.id} wrapped`).toBeGreaterThan(0.7)
    expect(s.raw, `id ${s.id} raw < wrapped×0.95`).toBeLessThan(s.wrapped * 0.95)
  }
  record(test.info().project.name, 'tile_and_seam', { hashes: h, seam_sweep: seam.sweep })
})

test('⑦⑧⑨ — rect 성장에 결 불변 · 세 장에도 아래 획 읽힘 · 위/아래 겹 순서(게이트 ⑨ + 반증)', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
  // ⚠⚠ **잉크를 흑연으로 못 박는다**(web2-37 2번 뒤): 이 팔의 대상은 **막(film)의 기전**이지
  //    획의 «상태 색»이 아니다. 37-2가 대기 획을 옅은 청색으로 칠하므로, 그대로 두면
  //    이 픽스처의 아래 획(허공의 자유 획 = 대기)이 옅어져 「세 장 아래에서 읽힌다」가
  //    **막이 아니라 색 때문에** 빨개진다(실측: 바닥−획 30 → **25**).
  //    임계를 무는 대신 **축을 하나로 고정한다** — 색 축은 `waitink37`이 따로 진다(#86).
  await page.evaluate(() => (window as never as { __b2: { diag: { waitInk: (m: string) => unknown } } })
    .__b2.diag.waitInk('off'))
  // 아래 획(종이 직접) 하나 — 막 아래에 남을 대상
  await drawLine(page, 350, 250, 560, 250)
  await addPaper(page, 'yellow')
  // ⑦ rect가 자라도 결이 안 미끄러진다 — 같은 문서 자리의 막 픽셀이 성장 전후 동일.
  //   (#film 캔버스 판독 — 결·막 자체의 기전 표식. 합성 판정은 ⑧⑨가 진다.)
  const patch = () => page.evaluate(() => {
    const c = document.getElementById('film') as HTMLCanvasElement
    const g = c.getContext('2d')!
    return [...g.getImageData(300, 300, 24, 24).data]
  })
  const before = await patch()
  await page.evaluate(() => {
    const a = (window as any).__b2.app
    const r = a.doc.layers[0].rect
    a.doc.layers[0].rect = { x: r.x - 200, y: r.y - 150, w: r.w + 400, h: r.h + 300 }
  })
  await drawLine(page, 900, 700, 901, 701)   // 재그리기 유발
  const after = await patch()
  expect(after).toEqual(before)
  // ⑧ 세 장을 겹쳐도 아래 획이 읽힌다 — **상대 유지율**로 잰다: 곱은 명도비를
  // 보존하므로 절대 차는 막 밝기만큼 준다(30×12 상자는 획 1.4px의 희석도 실린다 —
  // 첫 판의 절대 임계 0.04는 그 희석을 안 계산한 값이었다). 막 전(획만) 대비의
  // 35% 이상이 세 장 아래에서도 남으면 읽힌다로 판정한다.
  // ⚠ **곁을 획 바로 옆에서 읽는다**(web2-26 2번 · #71 ㉤ — 답은 임계가 아니라 읽는 자리).
  //   종전에는 36px 떨어진 자리를 곁으로 삼았는데, 결의 진폭이 지각 대역으로 올라가자
  //   **두 상자가 결의 다른 대목을 표본한다**는 사실이 신호(획 대비 ~2계조)를 삼켰다
  //   (실측 c3 0.0025 ↔ 이론 0.007). 획의 위·아래 8px을 평균 내면 같은 결 이웃이다.
  const beside = async () => {
    const up = await avgRGB(page, 420, 238, 60, 6)
    const dn = await avgRGB(page, 420, 258, 60, 6)
    return [(up[0] + dn[0]) / 2, (up[1] + dn[1]) / 2, (up[2] + dn[2]) / 2] as [number, number, number]
  }
  const on0 = await avgRGB(page, 420, 247, 60, 6)
  const beside0 = await beside()
  const contrast0 = lightness(beside0) - lightness(on0)
  await addPaper(page, 'yellow')
  await addPaper(page, 'tracing')
  const on3 = await avgRGB(page, 420, 247, 60, 6)
  const beside3 = await beside()
  console.log(`[⑧] on0 ${on0.map(x=>x.toFixed(1))} beside0 ${beside0.map(x=>x.toFixed(1))} on3 ${on3.map(x=>x.toFixed(1))} beside3 ${beside3.map(x=>x.toFixed(1))} c0 ${contrast0.toFixed(4)} c3 ${(lightness(beside3)-lightness(on3)).toFixed(4)}`)
  expect(contrast0).toBeGreaterThan(0.008)                      // 분해능(#71 ㉢) — 막 전에 실제로 갈린다(dpr2 AA로 준다 — 실측 0.013)
  expect(lightness(beside3) - lightness(on3)).toBeGreaterThan(contrast0 * 0.35)
  // ⑨ 게이트 — 활성 겹 획은 막 **위** · 아래 획은 막 **아래**. 합성 상자는 1.4px 획을
  // 희석하므로(첫 판 실측), **기전 판독**(막 사본·#layerc — #67의 표식 채널)과
  // **가시 판독**(합성 대비·반증)을 짝으로 한다.
  await drawLine(page, 350, 330, 560, 330)                 // 활성(트레이싱지) 겹 위의 획
  const mech = await page.evaluate(() => {
    const rowMin = (c: HTMLCanvasElement, y: number) => {
      const g = c.getContext('2d')!
      const k = window.devicePixelRatio || 1        // 캔버스는 device px — 좌표 보정(D-C3)
      const d = g.getImageData(Math.round(360 * k), Math.round((y - 3) * k), Math.round(160 * k), Math.round(7 * k)).data
      let mn = 255, alpha = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3]! > 0) mn = Math.min(mn, (d[i]! + d[i + 1]! + d[i + 2]!) / 3)
        alpha = Math.max(alpha, d[i + 3]!)
      }
      return { mn, alpha }
    }
    const film = document.getElementById('film') as HTMLCanvasElement
    const layerc = document.getElementById('layerc') as HTMLCanvasElement
    return {
      filmBelow: rowMin(film, 250),     // 막 사본에 아래 획의 검은 줄이 있다(물든다)
      filmAbove: rowMin(film, 330),     // 막 사본에 위 획은 **없다**(안 물든다)
      filmBare: rowMin(film, 290),      // 획이 없는 막 — **그 실행의 바닥값**(#74 ㉡)
      layercAbove: rowMin(layerc, 330), // 위 획은 #layerc에 산다
      layercBelow: rowMin(layerc, 250), // 아래 획은 #layerc에 없다
    }
  })
  // ⚠ **절대 밝기 임계(150)를 버렸다**(web2-26 2번 · #74 ㉡ 그대로): 그 임계는 «종이 결»을
  // 잉크로 셌다 — 결의 진폭을 지각 대역으로 올리자(26-2) 세 장 겹친 막의 빈 자리가
  // 133까지 내려와 「위 획이 막 사본 밖」이 결 때문에 빨개졌다. 판정은 **그 실행의
  // 빈 자리 바닥값과의 차**로 한다. 분해능 단언(#71 ㉢)이 짝이다 — 두 값이 실제로 갈린다.
  expect(mech.filmBare.mn - mech.filmBelow.mn,
    `아래 획이 바닥보다 어둡다(바닥 ${mech.filmBare.mn.toFixed(1)} · 획 ${mech.filmBelow.mn.toFixed(1)})`).toBeGreaterThan(30)
  // ⚠⚠ **출하 색에서도 잰다**(2차 리뷰어 [6] — 「위약 판에서만 초록인 게이트」를 안 만든다).
  //    이 팔의 문(30)은 **막의 기전**에 걸린 것이고 그 축을 고정하려고 위에서 잉크를 흑연으로
  //    못 박았다. 그런데 **출하되는 화면에서 그 아래 획은 대기 획이라 옅은 청색**이다(37-2) —
  //    그 판의 값을 안 재면 「세 장을 겹쳐도 읽힌다」를 **아무 팔도 안 지키게** 된다.
  //    ⛔ 여기에는 문을 안 건다: 「얼마여야 읽히는가」는 이 회차가 정할 것이 아니다(실기기 몫).
  //    수를 남기고 사람이 보게 한다.
  await page.evaluate(() => (window as never as { __b2: { diag: { waitInk: (m: string) => unknown } } })
    .__b2.diag.waitInk('on'))
  await settle(page)
  const shipped = await page.evaluate(() => {
    const rowMin = (c: HTMLCanvasElement, y: number) => {
      const dpr = window.devicePixelRatio || 1
      const g = c.getContext('2d')!
      const d = g.getImageData(Math.round(300 * dpr), Math.round(y * dpr), Math.round(300 * dpr), 1).data
      let mn = 255
      for (let i = 0; i < d.length; i += 4) mn = Math.min(mn, (d[i]! + d[i + 1]! + d[i + 2]!) / 3)
      return mn
    }
    const film = document.getElementById('film') as HTMLCanvasElement
    return { below: rowMin(film, 250), bare: rowMin(film, 290) }
  })
  const shippedContrast = shipped.bare - shipped.below
  console.log(`[측정] 세 장 아래 대비 — 흑연(축 고정) ${(mech.filmBare.mn - mech.filmBelow.mn).toFixed(1)} `
    + `· **출하 색(대기 = 옅은 청색)** ${shippedContrast.toFixed(1)} (바닥 ${shipped.bare.toFixed(1)} · 획 ${shipped.below.toFixed(1)})`)
  expect(shippedContrast, '출하 색에서도 아래 획이 바닥보다는 어둡다(0 초과 — 문이 아니라 하한)')
    .toBeGreaterThan(0)
  expect(Math.abs(mech.filmBare.mn - mech.filmAbove.mn),
    `위 획 자리는 바닥과 같다(바닥 ${mech.filmBare.mn.toFixed(1)} · 자리 ${mech.filmAbove.mn.toFixed(1)})`).toBeLessThan(10)
  expect(mech.layercAbove.alpha).toBeGreaterThan(0)        // 위 획이 #layerc에
  expect(mech.layercBelow.alpha).toBe(0)                   // 아래 획은 #layerc에 없다
  // 가시 — 위 획이 합성 화면에서 실제로 보인다(획 띠가 곁보다 어둡다)
  const aboveSideOf = async () => {
    const u = await avgRGB(page, 400, 318, 80, 5)
    const d = await avgRGB(page, 400, 340, 80, 5)
    return [(u[0] + d[0]) / 2, (u[1] + d[1]) / 2, (u[2] + d[2]) / 2] as [number, number, number]
  }
  const aboveRow = await avgRGB(page, 400, 328, 80, 5)
  const aboveSide = await aboveSideOf()
  const aboveContrast = lightness(aboveSide) - lightness(aboveRow)
  expect(aboveContrast).toBeGreaterThan(0.01)
  // **반증(D-3) — 막을 활성 겹 위로 옮기면 ⑨가 무너진다**(실제 실행): #layerc를 #film
  // 아래로 내리면 위 획이 막의 불투명 사본에 **가려 사라진다**(대비 소멸).
  await page.evaluate(async () => {
    const film = document.getElementById('film')!
    const layerc = document.getElementById('layerc')!
    film.parentElement!.insertBefore(layerc, film)         // layerc가 막 아래로
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
  const brokenRow = await avgRGB(page, 400, 328, 80, 5)
  const brokenSide = await aboveSideOf()
  expect(lightness(brokenSide) - lightness(brokenRow)).toBeLessThan(aboveContrast * 0.4)
  await page.evaluate(() => {
    const film = document.getElementById('film')!
    const layerc = document.getElementById('layerc')!
    film.parentElement!.insertBefore(layerc, film.nextSibling) // 원상 복구
  })
  record(test.info().project.name, 'rect_growth', { patch_equal: true, patch_bytes: before.length })
  record(test.info().project.name, 'readability', {
    contrast_before_films: contrast0, contrast_under_three: lightness(beside3) - lightness(on3),
    retention_threshold: 0.35,
  })
  record(test.info().project.name, 'order_mech_and_visible', {
    mech, above_contrast: aboveContrast, broken_contrast: lightness(brokenSide) - lightness(brokenRow),
  })
})
