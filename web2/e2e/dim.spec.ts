// 치수(web2-08 지시 4) 종단 — 진짜 입력으로: 리본 패널을 열고, **펜(마우스)으로 숫자를
// 써서** 스케일을 정하고, 그리는 동안 실시간 길이가 뜨고, 치수 스냅이 실제 길이를
// 맞추는가. 「화면의 선 · 패널의 숫자 · 확정된 3D 길이가 같아야 한다」(4-5)를 문면으로 잰다.

import { test, expect, type Page } from '@playwright/test'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  }
  await page.mouse.up()
  await settle(page)
}

/** 작도 + 기둥 — 기둥이 스케일의 기준 */
async function build(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 500, 500, 500, 380)
  expect((await page.evaluate(() => (window as any).__b2.diag.summary())).lifted).toBe(3)
}

/** 패널 필기 칸에 세로획(«1») 하나를 긋는다 — x는 칸 안 상대좌표 */
async function writeOne(page: Page, relX: number) {
  const r = await page.evaluate(() => {
    const c = document.getElementById('dim-ink')!.getBoundingClientRect()
    return { x: c.left, y: c.top }
  })
  await page.mouse.move(r.x + relX, r.y + 14)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(r.x + relX, r.y + 14 + i * 7)
  await page.mouse.up()
  await settle(page)
}

test('필기로 첫 치수 → 스케일 · 실시간 길이 · 셋의 일치', async ({ page }) => {
  await build(page)

  // 리본은 접혀 있다(기본) — 토글로 연다(4-3)
  expect(await page.$eval('#dimpanel', el => el.classList.contains('folded'))).toBe(true)
  await page.click('#dim-toggle')
  expect(await page.$eval('#dimpanel', el => el.classList.contains('folded'))).toBe(false)

  // 기둥이 지금 치수 창의 대상이다(마지막 획) — «11»을 써서 스케일을 정한다.
  // ⚠ web2-10 지시 8-a ②: 인식 결과는 **자동 적용되지 않는다** — 키패드 표시(#pad-read)에
  // 올라가 사람이 읽고(고칠 수 있다) «적용»을 눌러야 실린다. web2-08의 「읽히면 즉시
  // 적용」은 뒤집혔다(3이 8로 읽히면 scaleRef가 조용히 틀리는 자리라서).
  await writeOne(page, 60)
  await writeOne(page, 100)
  expect(await page.textContent('#dim-read')).toBe('11')
  expect(await page.textContent('#pad-read')).toBe('11')            // 스테이징됐다
  expect((await page.evaluate(() => (window as any).__b2.diag.dim())).dims).toEqual([])  // 아직 안 실렸다
  await page.click('#pad-keys [data-k="apply"]')
  await settle(page)
  const d1 = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d1.mmPerUnit).not.toBeNull()              // 4-1: 첫 치수가 스케일을 정했다
  expect(d1.dims).toEqual([{ id: 4, dim: 11 }])
  expect(await page.textContent('#dim-live')).toBe('11 mm')

  // 다음 선 — 그리는 **동안** 패널에 실시간 길이가 뜬다(4-5)
  await page.mouse.move(500, 380)
  await page.mouse.down()
  await page.mouse.move(560, 366, { steps: 6 })
  await settle(page)
  const during = await page.textContent('#dim-live')
  expect(during).toMatch(/^\d+ mm$/)               // 그리는 중에 이미 실척이다
  await page.mouse.move(620, 352, { steps: 6 })
  await page.mouse.up()
  await settle(page)

  // 확정 후: 패널 숫자 == 확정 3D 길이(반올림 표시 규약 그대로)
  const d2 = await page.evaluate(() => (window as any).__b2.diag.dim())
  const live = await page.textContent('#dim-live')
  const shown = Number(live!.replace(' mm', ''))
  const solved = d2.lenOf[d2.target] as number
  expect(Math.abs(shown - solved)).toBeLessThanOrEqual(0.5)   // 표시는 정수 반올림(±0.5는 표기 규약)
  // **무한소수 표기(4-8)를 켜면 자리 그대로 일치한다** — ±0.5가 팔의 느슨함이 아니라
  // 표기 반올림의 몫임을 가른다(리뷰어 [12]): 이 대조는 상대 1e-9다.
  await page.check('#chk-exact')
  await settle(page)
  const exact = Number((await page.textContent('#dim-live'))!.replace(' mm', ''))
  expect(Math.abs(exact - solved)).toBeLessThan(Math.max(1e-9 * solved, 1e-7))
})

test('치수 스냅(4-7) — 실제 3D 길이가 눈금에 맞춰진다 · «다시 쓰면 대체»(4-2)', async ({ page }) => {
  await build(page)
  await page.click('#dim-toggle')
  // «11» → 기둥 = 11 mm. ⚠ «1»(1mm)로 세우면 10mm 스냅이 끝점을 소실점 수렴 대역까지
  // 밀어 리프팅의 선분 매칭이 다른 직선을 잡는다 — 스냅 눈금은 스케일과 같은 자릿수여야
  // 뜻이 있다(실사용에서도 그렇다).
  await writeOne(page, 60)
  await writeOne(page, 100)
  await page.click('#pad-keys [data-k="apply"]')     // 스테이징 → 적용(web2-10 지시 8-a ②)
  await page.check('#chk-dimsnap')
  await page.selectOption('#dimsnap-step', '10')

  await drawLine(page, 500, 380, 620, 352)          // 기둥 끝 → vp0 축
  const d = await page.evaluate(() => (window as any).__b2.diag.dim())
  const mm = d.lenOf[d.target] as number
  expect(Math.abs(mm - Math.round(mm / 10) * 10)).toBeLessThan(1e-6)   // 실제 길이가 맞춰졌다

  // 그 선에 치수를 다시 쓴다 — 길이가 입력값으로 대체된다(4-2). **화면의 선도 움직인다**
  // (리뷰어 [15] — 3D 끝점이 옮겨지면 그 사영이 옮겨진다. 좌표로 잰다):
  const bBefore = await page.evaluate((id) => (window as any).__b2.diag.projectAll()[id]!.b, d.target)
  await writeOne(page, 60)
  await writeOne(page, 100)                         // «11»
  await page.click('#pad-keys [data-k="apply"]')    // 다시 쓰면 대체 — 이제 적용을 거쳐서
  await settle(page)
  const d2 = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d2.lenOf[d.target]).toBeCloseTo(11, 6)
  expect(await page.textContent('#dim-live')).toBe('11 mm')
  const bAfter = await page.evaluate((id) => (window as any).__b2.diag.projectAll()[id]!.b, d.target)
  expect(Math.hypot(bAfter.x - bBefore.x, bAfter.y - bBefore.y)).toBeGreaterThan(3)
})

test('음성 배선(4-4) — 인식 결과가 창 규칙을 타고 치수로 적용된다 (모의 인식기)', async ({ page }) => {
  // 진짜 마이크는 헤드리스에 없다(AS-C24) — **배선**(voice.ts → applyDimInput → setDimension)을
  // 모의 인식기로 잰다: 앱이 쓰는 그 생성자 자리에 가짜를 꽂고 결과 이벤트를 흘린다.
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = class {
      lang = ''; continuous = false; interimResults = false
      onresult: any = null; onend: any = null; onerror: any = null
      start() { (window as any).__rec = this }
      stop() { (window as any).__rec = null }
    }
  })
  await build(page)
  await page.click('#dim-toggle')
  await writeOne(page, 60); await writeOne(page, 100)      // «11» — 스케일(기둥 11mm)
  await page.click('#pad-keys [data-k="apply"]')           // 스테이징 → 적용(8-a ②)
  await drawLine(page, 500, 380, 620, 352)                 // 다음 선 — 치수 창의 대상
  await page.click('#btn-voice')                           // 모드를 켠다 — 그때만 듣는다
  expect(await page.evaluate(() => !!(window as any).__rec)).toBe(true)
  await page.evaluate(() => {
    (window as any).__rec.onresult({ results: [[{ transcript: '삼천오백' }]], resultIndex: 0 })
  })
  await settle(page)
  // 음성도 확률적 입력 — 자동 적용이 아니라 스테이징이다(web2-10 지시 8-a ②)
  expect(await page.textContent('#pad-read')).toBe('삼천오백')
  expect((await page.evaluate(() => (window as any).__b2.diag.dim())).dims.length).toBe(1)  // 아직 기둥 것뿐
  await page.click('#pad-keys [data-k="apply"]')
  await settle(page)
  const d = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d.lenOf[d.target]).toBeCloseTo(3500, 6)           // 지시 4-4의 예가 적용을 거쳐 실렸다
  expect(await page.textContent('#dim-live')).toBe('3500 mm')
  // 다시 말하면 스테이징이 대체된다 — 적용하면 같은 값(3.5 m = 3500 mm)
  await page.evaluate(() => {
    (window as any).__rec.onresult({ results: [[{ transcript: '3.5미터' }]], resultIndex: 0 })
  })
  await settle(page)
  expect(await page.textContent('#pad-read')).toBe('3.5미터')
  await page.click('#pad-keys [data-k="apply"]')
  await settle(page)
  expect(await page.textContent('#dim-live')).toBe('3500 mm')   // 3.5 m = 3500 mm — 같은 값
  // 모드를 끄면 안 듣는다
  await page.click('#btn-voice')
  expect(await page.evaluate(() => !!(window as any).__rec)).toBe(false)
})

test('무스케일이면 숫자를 지어내지 않는다 — 스케일 전에는 «—»', async ({ page }) => {
  await build(page)
  await page.click('#dim-toggle')
  // 스케일 전 — 그리는 동안에도 길이가 없다
  await page.mouse.move(500, 380)
  await page.mouse.down()
  await page.mouse.move(560, 366, { steps: 6 })
  await settle(page)
  expect(await page.textContent('#dim-live')).toBe('—')
  await page.mouse.up()
  await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.diag.dim().mmPerUnit)).toBeNull()
})

test('키패드(web2-10 지시 8-a) — 확정 경로: 적용 전에 보이고, 고칠 수 있고, 인식을 안 거친다', async ({ page }) => {
  await build(page)
  await page.click('#dim-toggle')

  // 값을 두드리면 **적용 전에** 표시된다 — 읽고 고칠 수 있다(⌫)
  await page.click('#pad-keys [data-k="2"]')
  await page.click('#pad-keys [data-k="5"]')
  await page.click('#pad-keys [data-k="9"]')
  expect(await page.textContent('#pad-read')).toBe('259')
  await page.click('#pad-keys [data-k="del"]')       // 잘못 눌렀다 — 고친다
  await page.click('#pad-keys [data-k="0"]')
  await page.click('#pad-keys [data-k="0"]')
  expect(await page.textContent('#pad-read')).toBe('2500')

  // 적용 전에는 치수가 없다 — 적용이 명시적이라 조용히 안 틀린다(대조군)
  expect((await page.evaluate(() => (window as any).__b2.diag.dim())).dims).toEqual([])
  await page.click('#pad-keys [data-k="apply"]')
  await settle(page)
  const d = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d.dims).toEqual([{ id: 4, dim: 2500 }])     // 필기와 같은 통로(applyDimInput)를 탔다
  expect(d.mmPerUnit).not.toBeNull()                 // 첫 치수 — 스케일이 섰다
  expect(await page.textContent('#dim-live')).toBe('2500 mm')

  // 소수점은 한 번만 · C는 전부 지운다
  await page.click('#pad-keys [data-k="3"]')         // 적용 뒤에도 값이 남아 이어 쓸 수 있다
  await page.click('#pad-keys [data-k="clear"]')
  expect(await page.textContent('#pad-read')).toBe('—')
  await page.click('#pad-keys [data-k="."]')
  await page.click('#pad-keys [data-k="."]')
  await page.click('#pad-keys [data-k="5"]')
  expect(await page.textContent('#pad-read')).toBe('.5')
  // 반증 — «.»만·빈 값·«0»으로 적용하면 아무 일도 안 난다(빈/영 확정을 안 만든다 —
  // 0은 setDimension의 `mm > 0` 가드가 거른다: scaleRef 0의 경로를 막는 자리, 2차 [8])
  for (const seq of [['.'], [], ['0']]) {
    await page.click('#pad-keys [data-k="clear"]')
    for (const k of seq) await page.click(`#pad-keys [data-k="${k}"]`)
    await page.click('#pad-keys [data-k="apply"]')
    await settle(page)
    expect((await page.evaluate(() => (window as any).__b2.diag.dim())).dims).toEqual([{ id: 4, dim: 2500 }])
  }

  // **창 규칙과의 만남**(2차 [3]) — 남은 값으로 다음 획에서 «적용»을 누르면 어디에 실리는가:
  // 창 규칙(web2-08 지시 4-4) 그대로 **지금 창의 대상 = 마지막 내용 획**에 실린다.
  // 그 대상의 실시간 길이가 #dim-live에 떠 있으므로(같은 자리) 조용히 틀리지는 않는다.
  await page.click('#pad-keys [data-k="clear"]')
  await page.click('#pad-keys [data-k="7"]')
  await page.click('#pad-keys [data-k="5"]')          // «75»가 남아 있다
  await drawLine(page, 500, 380, 620, 352)            // 새 획 — 창이 새 획으로 넘어간다
  await page.click('#pad-keys [data-k="apply"]')
  await settle(page)
  const d3 = await page.evaluate(() => (window as any).__b2.diag.dim())
  expect(d3.dims).toEqual([{ id: 4, dim: 2500 }, { id: 5, dim: 75 }])  // 새 획(지금 창)에 실렸다
  expect(await page.textContent('#dim-live')).toBe('75 mm')
})

test('키패드 키가 펜 크기 대역이다 — 실측(지시 5의 크기 규칙과 같은 대역)', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.click('#dim-toggle')
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#pad-keys button')).map(b => {
      const r = b.getBoundingClientRect()
      return { k: (b as HTMLElement).dataset.k, w: r.width, h: r.height }
    }))
  // 4×4 격자에서 0이 두 칸·적용이 두 줄 = **버튼 14개**(칸 16). 임계 32는 설계값 34의
  // 바로 아래다 — 되돌리면(옛 안이었을 27px급) 깨진다(2차 [5] — «옛/새 사이» 규칙).
  expect(boxes.length).toBe(14)
  for (const b of boxes) {
    expect(b.h, `${b.k} 높이`).toBeGreaterThanOrEqual(32)
    expect(b.w, `${b.k} 폭`).toBeGreaterThanOrEqual(32)
  }
  // 적용 키는 두 줄 — 다른 키의 약 2배 높이(펜이 가장 자주 찾는 키)
  const apply = boxes.find(b => b.k === 'apply')!
  expect(apply.h).toBeGreaterThanOrEqual(2 * 34)
  // 배치(2차 [7]) — 키패드가 커진 리본이 뷰포트 안이고, 리본이 자기 토글을 안 덮는다
  const panel = await page.evaluate(() => {
    const r = document.getElementById('dimpanel')!.getBoundingClientRect()
    return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: window.innerWidth, h: window.innerHeight }
  })
  expect(panel.y).toBeGreaterThanOrEqual(0)
  expect(panel.b).toBeLessThanOrEqual(panel.h)
  expect(panel.r).toBeLessThanOrEqual(panel.w)
  expect(await page.evaluate(() => {
    const t = document.getElementById('dim-toggle')!
    const r = t.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return t === el || t.contains(el)
  })).toBe(true)
})
