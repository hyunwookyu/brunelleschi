// web2-11 1부 — 입력 계층: coalesced(1-a) · 기울기 관측(1-b) · 점별 필압(1-c) ·
// 지우개 끝 신호(1-d) · 진단 패널(1-f). **화면은 그대로여야 한다** — 그 판정은 이 파일이
// 아니라 기존 픽셀 팔이 한다(level.spec 지평선 잉크량 · draw.spec 채도 — 같은 스위트).
//
// 헤드리스가 재는 것: 수집 경로의 동작(불변식 points == events + extra) · 켬/끔 반증 ·
// rawIn의 유무·정렬·양자화 대역 · 날값 관측. **실기기만 아는 것**: 실제 coalesced 계수
// (120Hz + EMR 표본율) · 실제 기울기 대역 · 지우개 펜(3E)의 버튼 신호 — 전부 진단 패널이
// 그 자리다(DEFERRED 표).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawMouse(page: Page, ax: number, ay: number, bx: number, by: number, steps = 8) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  await page.mouse.up()
  await settle(page)
}
const capture = (page: Page) => page.evaluate(() => (window as any).__b2.diag.capture())
const lastStroke = (page: Page) =>
  page.evaluate(() => { const d = (window as any).__b2.app.doc.strokes; return d[d.length - 1] })

async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
}

test('1-a — 수집 불변식: 점 수 == 이벤트 수 + coalesced 추가분 (마우스 실입력)', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)          // 지평선
  await drawMouse(page, 300, 550, 700, 550, 24)       // 내용 획 후보(수평)
  const c = await capture(page)
  console.log(`[측정] 마우스 획 — 이벤트 ${c.stroke.events} · 점 ${c.stroke.points} · 추가 ${c.stroke.extra} · 폴백 ${c.tally.mouse?.fallback ?? 0}`)
  expect(c.stroke.pointerType).toBe('mouse')
  expect(c.stroke.points).toBe(c.stroke.events + c.stroke.extra)
  expect(c.stroke.points).toBeGreaterThanOrEqual(2)
  // 헤드리스 크로뮴의 합성 마우스는 대개 묶음 1(추가 0)이다 — 그 관측 자체를 원장이 든다
})

/** 잉크 캔버스의 상자 — 칠해진 픽셀 수와 **바이트 해시**(FNV). 수만 비교하면 같은 수로
 *  재배치된 잉크에 둔감하다(2차 리뷰어 [2]) — 해시가 배치까지 잰다. */
const boxAt = (page: Page, cx: number, cy: number, w: number) =>
  page.evaluate(([x, y, ww]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const d = c.getContext('2d')!.getImageData(
      Math.round((x! - ww! / 2) * dpr), Math.round((y! - ww! / 2) * dpr),
      Math.round(ww! * dpr), Math.round(ww! * dpr)).data
    let painted = 0, h = 2166136261 >>> 0
    for (let i = 0; i < d.length; i++) {
      if (i % 4 === 3 && d[i]! > 0) painted++
      h = Math.imul(h ^ d[i]!, 16777619) >>> 0
    }
    return { painted, hash: h }
  }, [cx, cy, w])

/** 120Hz EMR 펜의 대역(한 move에 표본 여럿)을 세우는 프로토타입 패치 — 4점 묶음.
 *  ⚠ 중간 점을 **전달 이벤트를 잇는 직선 밖**(y −6·−4·−2px)에 둔다(2차 리뷰어 [2]①) —
 *  선 위에 두면 「픽셀 동일」이 렌더가 raw를 읽든 말든 성립해 아무것도 안 가른다(#46). */
const patchBundle = (page: Page) => page.evaluate(() => {
  (PointerEvent.prototype as any).getCoalescedEvents = function () {
    const mk = (dx: number, dy: number) => new PointerEvent(this.type, {
      clientX: this.clientX + dx, clientY: this.clientY + dy,
      pressure: this.pressure, pointerType: this.pointerType,
    })
    return [mk(-3, -6), mk(-2, -4), mk(-1, -2), mk(0, 0)]
  }
})

test('1-a — coalesced 묶음이 오면 점이 그만큼 늘고, **획 판정·픽셀은 안 바뀐다** · 반증(D-3): 끄면 이벤트당 1로 떨어진다', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)          // 지평선
  // 판정·픽셀 불변 팔은 **연필 흑연 입자**(잉크 캔버스에 그려진다)로 잰다 — 화면평행 첫
  // 획은 앵커로 승격되어 선 본체가 WebGL(gl 캔버스)로 가므로 잉크 캔버스에 남는 것은
  // 입자다. 입자는 획 id 시드라(rng32), 아래에서 undo 후 **nextId를 되돌려 같은 id**로
  // 다시 긋는다 — 그래야 비교가 시드 차이가 아니라 coalesced의 몫을 잰다.
  await patchBundle(page)
  const N = 8
  await drawMouse(page, 300, 550, 700, 550, N)
  const on = await capture(page)
  console.log(`[측정] 묶음 4 — 이벤트 ${on.stroke.events} · 점 ${on.stroke.points} · 추가 ${on.stroke.extra}`)
  // move 이벤트마다 4점 — 시작 1 + Σ묶음. 전달 이벤트 수는 브라우저가 정하므로(합쳐질 수
  // 있다) 식으로 잰다: 추가 == (이벤트−1)×3, 점 == 이벤트 + 추가.
  expect(on.stroke.extra).toBe((on.stroke.events - 1) * 3)
  expect(on.stroke.points).toBe(on.stroke.events + on.stroke.extra)
  const sOn = await lastStroke(page)
  const pixOn = await boxAt(page, 500, 550, 40)

  // 같은 획을 undo로 물리고 **끈 채** 같은 좌표로 다시 긋는다 — 1부의 검증 기준
  // 「화면이 지금과 같은가」를 coalesced가 실제로 «생기는» 조건에서 직접 잰다(1차 리뷰어 [1]).
  // 판정(resolveEnd/resolveCommit)은 전달 이벤트의 끝점만 읽고 raw를 안 읽는다 —
  // src/core에 `.raw` 참조가 없음을 grep이 확인했고(NOTES), 여기는 그것의 동작 증거다.
  await page.keyboard.press('Control+z')
  await settle(page)
  await page.evaluate((id) => {
    (window as any).__b2.app.coalesce = false
    ;(window as any).__b2.app.nextId = id            // 같은 id → 같은 입자 시드
  }, sOn.id)
  await drawMouse(page, 300, 550, 700, 550, N)
  const off = await capture(page)
  const sOff = await lastStroke(page)
  const pixOff = await boxAt(page, 500, 550, 40)
  console.log(`[측정] 끔 — 이벤트 ${off.stroke.events} · 점 ${off.stroke.points} · 추가 ${off.stroke.extra} (켬의 raw ${sOn.raw.length}) · 픽셀 켬 ${pixOn.painted}/${pixOn.hash} / 끔 ${pixOff.painted}/${pixOff.hash}`)
  expect(off.stroke.extra).toBe(0)
  expect(off.stroke.points).toBe(off.stroke.events)   // 반증(D-3): 이벤트당 1점
  expect(sOff.raw.length).toBeLessThan(sOn.raw.length)
  // **판정 불변** — 확정 끝점이 좌표까지 같다. ⚠ 이것은 측정이 아니라 **설계 보장의
  // 확인**이다(자기참조 유형 3 — 판정 경로가 raw를 안 읽는 구조: src/core에 raw 참조
  // 0건을 stroke_payload_web2 원장이 센다). 그래서 임계 없이 등식만 건다.
  expect(sOff.a).toEqual(sOn.a)
  expect(sOff.b).toEqual(sOn.b)
  // **픽셀 불변** — 같은 상자 같은 바이트(수가 아니라 해시 — 재배치에도 민감).
  // 패치 점이 선 «밖»(y −6..0)에 있으므로, 렌더가 raw를 읽었다면 여기서 갈린다.
  expect(pixOff.hash).toBe(pixOn.hash)
  expect(pixOn.painted).toBeGreaterThan(0)            // 빈 상자끼리의 같음이 아니다(D-3)

  // 반증 실행(D-3 — 이 비교가 실제로 가르는가): 같은 좌표를 **다른 id(다른 입자 시드)**로
  // 한 번 더 그으면 해시가 달라진다 — 배치가 다른 잉크를 같다고 읽지 않는다.
  await page.keyboard.press('Control+z')
  await settle(page)
  await drawMouse(page, 300, 550, 700, 550, N)        // nextId를 안 되돌린다 — 시드가 다르다
  const sAlt = await lastStroke(page)
  const pixAlt = await boxAt(page, 500, 550, 40)
  console.log(`[측정] 반증 — id ${sOn.id}→${sAlt.id} · 해시 ${pixOn.hash}→${pixAlt.hash}`)
  expect(sAlt.id).not.toBe(sOn.id)
  expect(pixAlt.hash).not.toBe(pixOn.hash)
})

test('1-b·1-c — 펜은 점별 필압·기울기가 raw와 나란히 실리고, 마우스는 안 싣는다', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)          // 지평선 (마우스)
  const horizon = await lastStroke(page)
  expect(horizon.rawIn).toBeUndefined()               // 마우스 획 — 상수를 지어 싣지 않는다(1-b)

  // 1-b 관측: 마우스에서 tilt가 무엇으로 오는가 — 원장에 남길 값(가정이 아니라 관측)
  const mouseRaw = (await capture(page)).lastRaw
  console.log(`[측정] 마우스 날값 — tiltX ${mouseRaw.tiltX} tiltY ${mouseRaw.tiltY} twist ${mouseRaw.twist} pressure ${mouseRaw.pressure}`)

  // 펜(CDP 실입력 경로) — 필압을 단계마다 바꾸고 기울기를 싣는다
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 550, ...pen, force: 0.2, tiltX: 40, tiltY: -10 })
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: 300 + i * 50, y: 550, ...pen,
      force: 0.2 + i * 0.08, tiltX: 40, tiltY: -10,
    })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 550, ...pen, force: 0 })
  await cdp.detach()
  await settle(page)
  const s = await lastStroke(page)
  expect(s.rawIn).toBeTruthy()
  expect(s.rawIn.press).toHaveLength(s.raw.length)    // **나란하다** — 1-c의 정의
  const distinct = new Set(s.rawIn.press).size
  console.log(`[측정] 펜 rawIn — 점 ${s.raw.length} · 서로 다른 필압 ${distinct} · tiltX ${s.rawIn.tiltX?.[0]} · mat.press ${s.mat?.press?.toFixed(4)}`)
  expect(distinct).toBeGreaterThan(1)                 // 점별이다 — 획당 하나(평균)가 아니다
  expect(s.rawIn.press.every((v: number) => Number.isInteger(v) && v >= 0 && v <= 8191)).toBe(true)
  expect(s.rawIn.tiltX.every((v: number) => v === 40)).toBe(true)
  expect(s.rawIn.tiltY.every((v: number) => v === -10)).toBe(true)
  expect(typeof s.mat.press).toBe('number')           // 옛 필드(획 평균)는 그대로 남는다(A-4)
})

test('1-d — 지우개 끝 신호는 «표시만»이다: 관측은 뜨고 도구는 안 바뀐다', async ({ page }) => {
  await boot(page)
  const before = await page.evaluate(() => (window as any).__b2.app.tool)
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointermove', {
      pointerType: 'pen', buttons: 32, pressure: 0.4, bubbles: true,
    }))
  })
  const c = await capture(page)
  expect(c.lastRaw.eraserBit).toBe(true)
  expect(c.eraserBitSeen).toBe(true)
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe(before) // 자동 전환 없음
  // 반증 — 신호 없는 펜 이동에서는 eraserBit이 서지 않는다
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent('pointermove', {
      pointerType: 'pen', buttons: 1, pressure: 0.4, bubbles: true,
    }))
  })
  expect((await capture(page)).lastRaw.eraserBit).toBe(false)
})

test('1-f — 진단 패널에 날값·coalesced·최근 획·.brnl 줄이 나온다', async ({ page }) => {
  await boot(page)
  await drawMouse(page, 100, 400, 1100, 400)
  await page.click('#buildid')
  const rowText = (key: string) => page.evaluate((k) => {
    const rows = Array.from(document.querySelectorAll('#diagpanel div'))
    const r = rows.find(d => (d.querySelector('.k')?.textContent ?? '') === k)
    return r ? (r.textContent ?? '').slice((r.querySelector('.k')?.textContent ?? '').length) : null
  }, key)
  expect(await rowText('포인터 날값')).toContain('mouse')
  expect(await rowText('기울기 날값')).toMatch(/tiltX (-?\d+|undefined)/)
  expect(await rowText('지우개 끝 신호')).toContain('도구 자동 전환 없음')
  expect(await rowText('coalesced(mouse)')).toMatch(/이벤트 \d+ · 추가 점 \d+ · 묶음 \d+ · 빈 목록 \d+ · API 없음 \d+/)
  expect(await rowText('최근 획')).toMatch(/\d+점 \(mouse\)/)
  expect(await rowText('.brnl')).toMatch(/\d+ B · 획 \d+/)
})

test('1-a·1-b 원장 — 종류별 계수(경로별 폴백)·날값 표본·묶음 켬/끔을 stage0/out에 남긴다', async ({ page }, testInfo) => {
  // dpr1에서만 쓴다 — 같은 원장을 두 프로젝트가 쓰면 마지막 실행이 덮어쓴다(값은 같다)
  await boot(page)
  // 날값 수집기(1-b) — «콘솔 줄»이 아니라 **수**로 원장에 남긴다(1차 리뷰어 [4] · #25)
  await page.evaluate(() => {
    (window as any).__rawCollect = []
    ;(window as any).__downs = {}
    window.addEventListener('pointermove', (e: any) => {
      // buttons도 든다 — pressure 0이 «버튼 뗀 이동(호버)»의 값임을 수로 가른다(2차 [5])
      (window as any).__rawCollect.push({ t: e.pointerType, p: e.pressure, b: e.buttons, tx: e.tiltX, ty: e.tiltY, tw: e.twist })
    }, { capture: true, passive: true })
    window.addEventListener('pointerdown', (e: any) => {
      const d = (window as any).__downs
      d[e.pointerType] = (d[e.pointerType] ?? 0) + 1
    }, { capture: true, passive: true })
  })
  await drawMouse(page, 100, 400, 1100, 400)          // 마우스
  await drawMouse(page, 300, 550, 700, 550, 24)
  const cdp = await page.context().newCDPSession(page)
  const pen = { button: 'left' as const, clickCount: 1, pointerType: 'pen' as const, force: 0.5 }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 600, ...pen })
  for (let i = 1; i <= 24; i++)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300 + i * 16, y: 600, ...pen })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 684, y: 600, ...pen, force: 0 })
  // 손가락 — 이 앱에서 손가락 하나는 궤도다(획이 아니다). 계수는 창 계측(tally)이 잰다.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 400 }] })
  for (let i = 1; i <= 24; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 500 + i * 4, y: 400 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await settle(page)
  const c = await capture(page)
  const penStrokeNative = c.stroke
  // 날값 요약 — 종류별 표본 수·서로 다른 값 목록(작으면 전부, 크면 수만)
  const rawSummary = await page.evaluate(() => {
    const all = (window as any).__rawCollect as { t: string; p: number; b: number; tx: any; ty: any; tw: any }[]
    const per: any = {}
    for (const r of all) {
      const s = per[r.t] ?? (per[r.t] = { samples: 0, pDown: new Set(), pUp: new Set(), tiltX: new Set(), tiltY: new Set(), twist: new Set() })
      s.samples++; (r.b > 0 ? s.pDown : s.pUp).add(r.p)
      s.tiltX.add(String(r.tx)); s.tiltY.add(String(r.ty)); s.twist.add(String(r.tw))
    }
    const list = (x: Set<unknown>) => x.size <= 8 ? [...x] : { distinct: x.size }
    return Object.fromEntries(Object.entries(per).map(([k, s]: [string, any]) =>
      [k, { samples: s.samples, pressures_buttons_down: list(s.pDown), pressures_hover: list(s.pUp), tiltX: list(s.tiltX), tiltY: list(s.tiltY), twist: list(s.twist) }]))
  })
  const downs = await page.evaluate(() => ({ ...(window as any).__downs }))
  console.log(`[측정] tally ${JSON.stringify(c.tally)} raw ${JSON.stringify(rawSummary)} downs ${JSON.stringify(downs)}`)
  // 검산(#43) — 경로별 합 == 전체, 그리고 «빈 목록 == 그 종류의 시작(다운) 수»(관측 주장을
  // 팔로 세운다 — 2차 [7]. 크로뮴의 pointerdown이 빈 coalesced 목록을 주는 것의 실측)
  for (const [k, t] of Object.entries(c.tally) as [string, any][]) {
    expect(t.bundled + t.empty + t.noApi).toBe(t.events)
    expect(t.empty).toBe(downs[k] ?? 0)
  }

  // 묶음 켬/끔 — **가르는 수를 원장 안에** 넣는다(1차 리뷰어 [3] — 켠 extra가 0인 환경에서
  // «끄면 0» 반증은 항등이다. 여기서는 묶음을 패치로 세워 켬 24 / 끔 0을 원장이 든다).
  await patchBundle(page)
  await drawMouse(page, 300, 650, 700, 650, 8)
  const bundleOn = (await capture(page)).stroke
  await page.evaluate(() => { (window as any).__b2.app.coalesce = false })
  await drawMouse(page, 300, 700, 700, 700, 8)
  const bundleOff = (await capture(page)).stroke
  await page.evaluate(() => { (window as any).__b2.app.coalesce = true })
  expect(bundleOn.extra).toBe((bundleOn.events - 1) * 3)
  expect(bundleOff.extra).toBe(0)

  if (testInfo.project.name === 'dpr1') {
    const out = resolve(HERE, '../../stage0/out/input_capture_web2.json')
    mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-11 1-a·1-b — coalesced로 버려지던 점 수와 포인터 날값의 실측(헤드리스 크로뮴). extra = Σ(묶음−1) = 안 썼으면 버려졌을 점 수.',
      environment: '헤드리스 크로뮴 + 합성 입력(Playwright/CDP) — 묶음이 안 생기는 대역이다(native 켬 extra 0 — 환경이 정한 값이라 판별력이 없고, 가르는 수는 아래 bundle_patch다). 실기기(MovinkPad 120Hz + EMR 펜)의 계수는 진단 패널 coalesced 줄로 사람이 읽는다(DEFERRED 표).',
      per_type_note: '폴백은 원인별 두 칸(#43): empty = API는 있는데 빈 목록, noApi = getCoalescedEvents 없음. 검산 둘을 팔이 잰다 — bundled+empty+noApi == events, 그리고 empty == strokes_started(그 종류의 pointerdown 수 — 크로뮴은 pointerdown의 coalesced 목록이 비어 있다). 종류의 용도: mouse·pen 획(저장·렌더될 점) / touch 궤도(카메라 표본 — 저장 안 됨).',
      per_type: c.tally,
      strokes_started: downs,
      last_pen_stroke: penStrokeNative,
      raw_values: rawSummary,
      raw_values_note: '1-b의 관측 근거(수). samples는 pointermove만(수집기 리스너 — pointerdown의 날값은 tally·lastRaw 경로가 본다). pressures_buttons_down = 누른 채 이동의 값 / pressures_hover = 버튼 뗀 이동(호버)의 값 — 마우스의 0은 호버 몫이고 끌기 중은 0.5 하나다. ⚠ pen 행은 tilt·필압 «변화를 주지 않은» 합성 펜(CDP force 0.5 고정·tilt 미지정)의 기본값이다 — tilt를 준 펜이 그대로 실리는 것은 1-c 팔(rawIn tiltX 전부 40)이 따로 잰다. touch의 pressure 1도 합성 기본값. 2부 폴백은 이 값이 아니라 rawIn 유무로 가른다(AS-C33).',
      bundle_patch: {
        note: '4점 묶음 프로토타입 패치(수집 경로 판별) — 중간 점은 전달 이벤트를 잇는 직선 «밖»(y −6·−4·−2px)이다: 선 위에 두면 픽셀 팔이 아무것도 안 가른다(#46). on/off가 이 원장의 가르는 수다 — off는 app.coalesce=false를 실제로 끈 것(D-3).',
        patch_offsets_y: [-6, -4, -2, 0],
        on: bundleOn, off: bundleOff,
      },
      press_q: 8191,
      press_q_note: 'C.PRESS_Q. 이 값을 바꾸면 이 원장과 stroke_payload_web2.json을 재실행하고 AS-C33·DEFERRED web2-11 표의 인용을 고친다.',
      falsification: 'bundle_patch.on.extra ↔ off.extra — 같은 패치·같은 입력에서 손잡이만 다르다(값은 그 필드가 정본 — 산문에 수를 안 박는다 #47). 수집이 죽으면 on.extra가 0이 되어 팔(extra == (events−1)×(묶음−1))이 실패한다. 픽셀·판정 불변의 반증은 input.spec의 «다른 id(다른 입자 시드) → 해시 다름» 실행이 댄다.',
    }, null, 1))
  }
})
