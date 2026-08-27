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
  const away = await avgRGB(page, 400, 200, 40, 40)
  expect(Math.abs(away[2] - before[2])).toBeLessThan(6)   // 막 없음(대략 원색 — 다른 종이)
  await page.click('#paperbar .ptab[data-sheet="0"]'); await settle(page)
  // 돌아오면 활성 겹이 풀려 있다(종이 전환 규칙) — 탭으로 다시 활성
  await page.click('#layerbar .lpaper'); await settle(page)
  const back = await avgRGB(page, 400, 200, 40, 40)
  expect(back[2]).toBeLessThan(before[2] - 12)
  // ③ 활성 겹 위의 막은 안 그려진다 — 트레이싱지를 하나 더 얹고(활성) 옐로를 활성으로
  //   내리면, 위(트레이싱지)의 막이 사라져 그 자리 픽셀이 옐로만의 값으로 돌아온다
  const yellowOnly = await avgRGB(page, 400, 200, 40, 40)
  await addPaper(page, 'tracing')                          // 맨 위·활성 — 막 둘 다 그려진다
  const both = await avgRGB(page, 400, 200, 40, 40)
  expect(both[0] + both[1] + both[2]).toBeLessThan(yellowOnly[0] + yellowOnly[1] + yellowOnly[2] - 3)
  await page.click('#layerbar .lpaper.yellow'); await settle(page)   // 옐로를 활성으로 — 위 막 꺼짐
  const lowerActive = await avgRGB(page, 400, 200, 40, 40)
  for (let i = 0; i < 3; i++) expect(Math.abs(lowerActive[i]! - yellowOnly[i]!)).toBeLessThan(4)
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
      let bgR = 0, bgG = 0, bgB = 0, bn = 0
      for (let i = 0; i < img.length; i += 4) { bgR += img[i]!; bgG += img[i + 1]!; bgB += img[i + 2]!; bn++ }
      bgR /= bn; bgG /= bn; bgB /= bn
      const bandEnergy = (x0: number, x1: number) => {
        let s = 0, n = 0
        for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4
          s += Math.abs(img[i]! - bgR) + Math.abs(img[i + 1]! - bgG) + Math.abs(img[i + 2]! - bgB)
          n++
        }
        return s / n
      }
      const seamBand = bandEnergy(tile.width - 3, tile.width + 3)
      const interior = bandEnergy(60, 200)
      return { ratio: seamBand / interior }
    }
    return {
      wrapped: energy(d.fiberTile(7, 'yellow', true)),
      raw: energy(d.fiberTile(7, 'yellow', false)),
    }
  })
  // 감싸 그리면 경계 띠의 섬유 에너지가 내부 대역이고, 빼면 결핍이 뚜렷하다(반증 실행).
  // 임계는 **상대**다(dpr2에서 섬유가 타일 px 기준 두 배라 절대 차가 준다 — 실측 보정).
  expect(seam.wrapped.ratio).toBeGreaterThan(0.8)
  expect(seam.raw.ratio).toBeLessThan(seam.wrapped.ratio * 0.95)
})

test('⑦⑧⑨ — rect 성장에 결 불변 · 세 장에도 아래 획 읽힘 · 위/아래 겹 순서(게이트 ⑨ + 반증)', async ({ page }) => {
  await boot(page)
  await closeCamera(page)
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
  const on0 = await avgRGB(page, 440, 246, 30, 6)
  const beside0 = await avgRGB(page, 440, 210, 30, 6)
  const contrast0 = lightness(beside0) - lightness(on0)
  await addPaper(page, 'yellow')
  await addPaper(page, 'tracing')
  const on3 = await avgRGB(page, 440, 246, 30, 6)
  const beside3 = await avgRGB(page, 440, 210, 30, 6)
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
      layercAbove: rowMin(layerc, 330), // 위 획은 #layerc에 산다
      layercBelow: rowMin(layerc, 250), // 아래 획은 #layerc에 없다
    }
  })
  expect(mech.filmBelow.mn).toBeLessThan(150)              // 아래 획이 막 사본 안(곱의 대상)
  expect(mech.filmAbove.mn).toBeGreaterThan(150)           // 위 획은 막 사본 밖
  expect(mech.layercAbove.alpha).toBeGreaterThan(0)        // 위 획이 #layerc에
  expect(mech.layercBelow.alpha).toBe(0)                   // 아래 획은 #layerc에 없다
  // 가시 — 위 획이 합성 화면에서 실제로 보인다(획 띠가 곁보다 어둡다)
  const aboveRow = await avgRGB(page, 400, 328, 80, 5)
  const aboveSide = await avgRGB(page, 400, 310, 80, 5)
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
  const brokenSide = await avgRGB(page, 400, 310, 80, 5)
  expect(lightness(brokenSide) - lightness(brokenRow)).toBeLessThan(aboveContrast * 0.4)
  await page.evaluate(() => {
    const film = document.getElementById('film')!
    const layerc = document.getElementById('layerc')!
    film.parentElement!.insertBefore(layerc, film.nextSibling) // 원상 복구
  })
})
