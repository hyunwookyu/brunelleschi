// web2-19 3부 — **네 자리**(종이·눈·손·서랍)와 전체 화면의 회귀 팔(3-e).
//   ① 네 자리의 요소가 정확히 표대로다(각 자리의 id 목록을 값으로)
//   ①' 연필이 접혀 있다 — 평소 손 띠 버튼이 39px 폭 · 펼침/고름 · 각인 왕복(2H·2B) ·
//      펜은 접기 없음·연필통에 펜 줄 없음
//   ①'' 접힌 펜이 지금 촉을 말한다 — 다섯 촉 왕복·부팅 초기값·연필 각인과 같은 대역 (34-2 · R6)
//   ② 치수 트리거가 손 띠에 있고 리본이 종전대로 열린다
//   ③ 표시 토글 셋이 눈에 있고 동작은 그대로(켰다 끄기 왕복)
//   ④ 자 아이콘 → 오스냅 종류·반경이 열리고 동작은 그대로
//   ⑤ own3d가 설정에 없고 진단에 있으며 동작 그대로(왕복)
//   ⑥ 전체 화면 — 크롬 픽셀 0 · 지평선/소실점 픽셀 그대로 · 손잡이로 나온다 ·
//      그리기·지우기가 된다 · 새로 고치면 꺼져 있다 (+반증: 손잡이를 빼면 나갈 길이 없다)
//   (⑦ 종이 띠 아래 줄은 paperbar.spec가 잰다)
// 조건(#71): 뷰포트 1200×800 · dpr 둘 다 · 기본 도구 연필.

import { test, expect, type Page } from '@playwright/test'
import { C } from '../src/core/constants'

/** 진단 패널을 연다 — **web2-30 3번 별건으로 여닫이가 옮겨졌다**: 빌드 식별자는
 *  `pointer-events: none`인 표시가 됐고, 여는 자리는 **설정 패널의 「진단」**이다. */
async function openDiag(page: import('@playwright/test').Page) {
  if (!(await page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open))) {
    await page.click('#pane-settings > summary')
  }
  await page.click('#btn-diag')
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

function inkPixels(page: Page, x0: number, y0: number, x1: number, y1: number) {
  return page.evaluate(([x0, y0, x1, y1]) => {
    const c = document.getElementById('ink') as HTMLCanvasElement
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const dpr = window.devicePixelRatio || 1
    const d = t.getContext('2d')!.getImageData(
      Math.round(x0 * dpr), Math.round(y0 * dpr),
      Math.max(1, Math.round((x1 - x0) * dpr)), Math.max(1, Math.round((y1 - y0) * dpr))).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
    return n
  }, [x0, y0, x1, y1] as const)
}

test('① 네 자리 — 각 자리의 id 목록이 정확히 표대로다(값으로)', async ({ page }) => {
  await boot(page)
  // 종이(위 왼쪽) — 탭 띠 + **종속 탭 줄**(web2-20 2부 — 대응표 §6 「탭 + 그 아래 종속 탭」).
  // 목록으로 낸다(#72 ② — 수가 아니라 어느 요소인지).
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#topleft > *')].map(e => e.id))).toEqual(['paperbar', 'layerbar'])
  // 눈(위 오른쪽) — 작도 시점으로 · 전체 화면 · 표시
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#eyebar > button')].map(e => e.id)))
    .toEqual(['btn-fullscreen', 'btn-display'])
  // 표시 팝업의 항목들 — id 불변 = 배선 불변. **목록이 곧 표다**(수가 아니라 어느 요소인지 — #72 ②).
  // ⚠ web2-26이 둘을 더했다: `chk-press`(6번 — 필압 보정) · `rng-hold`(4번 — 머무름 직선화
  //   시간). 이 팔이 지키는 사람의 요구(「자리마다 무엇이 있는지가 값으로 못 박혀 있다」)는
  //   그대로 유효하고 **표가 늘어난 것**이다(#75 ㉣: UI의 형태를 갈면 그 형태를 읽던 팔이
  //   깨진다 — 물음은 「그 요구가 지금도 유효한가」이고 답이 예이면 표를 고친다).
  // ⚠⚠ **web2-30 10번이 `chk-press`를 여기서 뺐다** — 눈은 「이 종이를 어떻게 보는가」이고
  //   필압 보정은 **손의 설정**이다. 사람이 여기서 못 찾았고, 찾은 뒤에도 자리가 틀렸다고
  //   판정했다. 지금 자리는 **시스템 띠의 설정 패널**이고 아래 줄이 그것을 값으로 든다.
  // ⚠⚠⚠ **web2-39 1번이 `rng-whold`를 더했다**(사용자가 요청한 손잡이 — 「글씨 꾹 누르기」).
  //   **표가 늘어난 것**이고 자리를 옮긴 것이 아니다: `rng-hold`(옐로 머무름)와 **같은
  //   갈래**라 같은 자리에 둔다(둘 다 기기 설정 · localStorage · 같은 대역). 이 팔이 지키는
  //   요구(「자리마다 무엇이 있는지가 값으로 못 박혀 있다」)는 그대로 유효하므로 표를 고친다
  //   (#75 ㉣). ⚠ 그리고 이 팔이 **실제로 그 추가를 잡았다** — 전량 e2e에서 빨갰다.
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#display-pop input')].map(e => e.id)))
    // web2-45가 해칭 판 토글(chk-hatchface)을, web2-47이 실 다이어그램(chk-rooms — 표시
    // 토글이라 이 자리가 맞다)을 더했다(#75 ㉣ — 표를 고친다. 이 팔이 실제로 그 추가를 잡았다)
    .toEqual(['chk-horizon', 'chk-grid', 'chk-waitfade', 'chk-hidden', 'chk-hatchface', 'chk-rooms', 'rng-hold', 'rng-whold'])
  // 시스템(세로바 아래 묶음) — 파일 서랍 + **설정**(web2-30 10번 · 톱니바퀴).
  // web2-19 3-a가 「설정 자루」를 해체하면서 둘 곳이 없어졌던 자리를 되세운 것이다.
  // ⚠⚠ **web2-34 6번이 표를 갈랐다** — 시스템 묶음(파일·설정 서랍)이 **위 띠로 올라왔다.**
  // 가르는 축이 「제도용구인가」가 아니라 **「그리는 중에 쓰는가」**이고(34-6), 그 축에서
  // 파일·설정은 «안 쓰는 것»이다. 그 이동이 우하단의 자리 다툼(R5 · #79)도 같이 끝냈다 —
  // 서랍이 빌드 식별자·진단 패널·자립 깃발과 같은 모서리를 쓰며 **두 번을 z로** 풀고 있었다.
  // 이 팔이 지키는 요구(「자리마다 무엇이 있는지가 값으로 못 박혀 있다」)는 그대로이고
  // **표가 갈렸다**(#75 ㉣ — 예시를 옮기는 것이 아니라 표를 고친다).
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#sidebar-body > details.pane')].map(e => e.id)))
    .toEqual([])
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#eyebar > details.pane')].map(e => e.id)))
    .toEqual(['pane-file', 'pane-settings'])
  // ⚠ **web2-34 1번이 `chk-grain`(종이 결)을 더했다** — 자리를 옮긴 것이 아니라 **표가
  //   늘어난 것**이다(#75 ㉣ / #76 ㉣의 어법 그대로: 이 팔이 지키던 요구 「자리마다
  //   무엇이 있는지가 값으로 못 박혀 있다」는 그대로 유효하고, 갈린 것은 목록뿐이다).
  //   자리를 «설정»으로 고른 근거는 30-10과 같다 — 결을 끄고 켜는 것은 **손의 설정**이
  //   아니라 «이 기기에서 종이를 어떻게 보는가»이고, 눈 팝업(`#display-pop`)이 아니라
  //   여기인 이유는 그것이 **문서를 안 건드리는 기기 취향**이기 때문이다(localStorage).
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#pane-settings input, #pane-settings button')].map(e => e.id)))
    // web2-47이 btn-stencil(사람 스텐실 그리기 — 지시 문면 「설정 안에 숨긴다」)을 더했다(#75 ㉣)
    .toEqual(['chk-press', 'btn-press-cancel', 'chk-grain', 'btn-diag', 'btn-stencil'])
  // 손(오른쪽 세로) — 되돌리기 둘(맨 위·구분선으로 가름) → 자 → 연필(접힘) → 펜 →
  // 지우개 둘 → **치수 → 롤 둘 → 면** → 서랍. #oldtools(hidden)·#tray(접힘)는 A-4/3-b' 구조물.
  // ⚠ **web2-28 4번이 한 띠 «안»의 순서를 바꿨다**: 면(면 찾기)이 롤·치수보다 **아래**로
  //   내려갔다 — 쓰는 빈도가 낮고 무엇보다 **작도 도구가 아니다**. 이 팔이 지키는 요구
  //   (「자리별로 무엇이 어느 순서로 있는지가 값으로 못 박혀 있다」)는 그대로이고 **표가
  //   갈렸다**(#75 ㉣ — 예시를 옮기는 것이 아니라 표를 고친다).
  // ⚠ **web2-44 띠 재편이 짝 줄(.bar-row)을 넣었다** — [실행취소|다시실행]·[자|손통]이
  //   한 줄에 눕는다. 이 팔이 지키는 요구(「자리별 전수가 값으로 못 박혀 있다」)는 그대로이고
  //   **표와 선택자가 갈렸다**(#75 ㉣): 줄 안의 버튼도 문서 순서 그대로 전수에 든다.
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#sidebar-body > button, #sidebar-body > details, #sidebar-body > .bar-row > button')].map(e => e.id)))
    // web2-45가 붓(btn-paint — 칠하기)을 면 아래에 더했다(#75 ㉣)
    .toEqual(['btn-draw-view', 'btn-zoom-fit', 'btn-lens', 'btn-undo', 'btn-redo', 'btn-snap', 'btn-grip', 'btn-pencil', 'btn-pen',
      'btn-eraser-pencil', 'btn-eraser-ink', 'dim-toggle', 'btn-roll', 'btn-face', 'btn-paint'])
  // 되돌리기와 도구 사이에 **구분선**이 실제로 있다(공백이 아니라 채널 — 3-c)
  expect(await page.evaluate(() => {
    const d = document.querySelector('#sidebar-body .bar-divider')
    if (!d) return null
    const undo = document.getElementById('btn-undo')!.getBoundingClientRect()
    const snap = document.getElementById('btn-snap')!.getBoundingClientRect()
    const r = d.getBoundingClientRect()
    return r.top > undo.bottom - 1 && r.bottom < snap.top + 1
  })).toBe(true)
  // 서랍 — 파일 원본·내보내기·비우기·종이 질감. 설정 자루는 없다.
  expect(await page.evaluate(() =>
    [...document.querySelectorAll('#pane-file button')].map(e => e.id)))
    .toEqual(['btn-save', 'btn-open', 'btn-obj', 'btn-gltf', 'btn-clear', 'btn-brush'])
  // ⚠ **web2-30 10번이 설정 패널을 되세웠다** — web2-19 3-a가 「설정 자루」를 해체하면서
  //   상태 옵션이 갈 곳이 없어져 눈 팝업에 얹혔던 그 결함을 고친 것이다. 이 팔이 지키던
  //   요구(「설정 자루에 있던 것들이 각자 제자리로 갔다」)는 **그대로 유효하다** — 오스냅은
  //   자 팝업에, 표시 셋은 눈에, own3d는 진단 곁에 있고 **설정에는 그 셋이 없다**.
  expect(await page.locator('#pane-settings').count(), '설정 패널은 이제 있다').toBe(1)
  for (const id of ['#chk-own3d', '#chk-horizon', '#chk-grid', '#osnap-radius']) {
    expect(await page.locator(`#pane-settings ${id}`).count(), `설정에 ${id}는 없다`).toBe(0)
  }
})

test("①' 연필 접힘 — 39px 폭 · 펼침/고름 · 각인 왕복(2H·2B) · 펜은 접기 없음", async ({ page }) => {
  await boot(page)
  // 평소 — 연필통이 접혀 있고 손 띠의 보이는 버튼 svg 폭이 전부 39px 대역이다(①')
  expect(await page.locator('#tray.open').count()).toBe(0)
  const widths = await page.evaluate(() =>
    [...document.querySelectorAll('#sidebar-body > button svg')]
      .filter(s => s.getBoundingClientRect().width > 0)
      .map(s => ({ id: s.parentElement!.id, w: s.getBoundingClientRect().width })))
  for (const w of widths) expect(w.w, `#${w.id} 폭 ≤ 45(39 + 확대 여유)`).toBeLessThanOrEqual(45)
  // 누르면 여섯 줄이 펼쳐진다 — 96px 대역(연 동안만 넓다 = 방금 연 것으로 읽힌다)
  await page.click('#btn-pencil'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(1)
  expect(await page.locator('#tray .trow').count()).toBe(6)
  expect((await page.locator('#tray-2H').boundingBox())!.width).toBeGreaterThan(80)
  // 하나를 고르면 접히고, 접힌 아이콘의 각인·심 색이 그 경도를 따른다 — 2H
  await page.click('#tray-2H'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(0)
  expect(await page.locator('#btn-pencil text').textContent()).toBe('2H')
  const lead2H = await page.evaluate(() => document.getElementById('fold-lead')!.getAttribute('fill'))
  // 왕복 — 2B
  await page.click('#btn-pencil'); await page.click('#tray-2B'); await settle(page)
  expect(await page.locator('#btn-pencil text').textContent()).toBe('2B')
  const lead2B = await page.evaluate(() => document.getElementById('fold-lead')!.getAttribute('fill'))
  expect(lead2H).not.toBe(lead2B)                     // 심 색이 실제로 경도를 따른다
  expect(await page.evaluate(() => {
    const b = (window as any).__b2
    return [b.diag.matColor('2H'), b.diag.matColor('2B')]
  })).toEqual([lead2H, lead2B])                       // 출처는 MAT 하나다(#54)
  // 다시 누르면(고르지 않고) 접힌다
  await page.click('#btn-pencil'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(1)
  await page.click('#btn-pencil'); await settle(page)
  expect(await page.locator('#tray.open').count()).toBe(0)
  // 펜 — 접기가 없고(누르면 도구만 바뀐다) 연필통에 펜 줄이 없다
  await page.click('#btn-pen'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pen')
  expect(await page.locator('#tray.open').count()).toBe(0)
  expect(await page.locator('#tray #btn-pen').count()).toBe(0)
})

// ── 34-2 (R6) — **접힌 통은 지금 고른 것을 말한다** ───────────────────────
// 연필은 처음부터 지켰다(각인 `HB`). 펜은 안 지켰다 — 촉이 니브 사각형의 **폭**으로만
// 있어서(0.77~3.00 사용자단위 = 렌더 1.16~4.50 px, 이웃 칸 차 0.45~1.29 px) 화면에서
// 안 읽힌다. ①' 의 「각인 왕복」과 **같은 어법**으로 다섯 촉을 왕복시킨다.
//
// mm 표기의 출처는 `C.NIB_MM` 하나다(#54) — 팔도 그 목록에서 이름을 짓는다(표 복제 ⛔).
const NIB_LABEL = (mm: number) => mm.toFixed(2).replace(/^0/, '')
const NIB_ID = (mm: number) => `nib-${String(mm).replace('.', '_')}`

test("①'' 접힌 펜 각인 — 다섯 촉 왕복 · 부팅 초기값 · 연필 각인과 같은 대역 (34-2 · R6)",
  async ({ page }) => {
    await boot(page)

    // ② **문서를 새로 열어도 맞는다** — 부팅 초기 촉(C.NIB_PX = 0.35 mm)이 글자에 실린다.
    //    ⚠ 부팅 직후 도구는 연필이다 — 「펜을 한 번 눌러야 말한다」면 R6을 못 지킨 것이다.
    expect(await page.evaluate(() => (window as any).__b2.app.tool)).toBe('pencil')
    expect(await page.locator('#btn-pen #fold-nib-text').count(), '접힌 펜에 각인이 있다').toBe(1)
    expect(await page.locator('#fold-nib-text').textContent(), '부팅 초기 촉').toBe(NIB_LABEL(0.35))

    // ① **다섯 촉 전부** — 고를 때마다 접힌 아이콘의 글자가 그 값을 따라간다
    const seen: string[] = []
    for (const mm of C.NIB_MM) {
      await page.click('#btn-pen'); await settle(page)
      expect(await page.locator('#pentray.open').count(), '촉통이 펼쳐진다').toBe(1)
      await page.click(`#${NIB_ID(mm)}`); await settle(page)
      const t = (await page.locator('#fold-nib-text').textContent()) ?? ''
      seen.push(`${mm}→${t}`)
      expect(t, `${mm} mm 촉의 각인`).toBe(NIB_LABEL(mm))
      // 니브 사각형(옛 유일 채널)도 그대로 따라간다 — 채널을 더한 것이지 바꾼 것이 아니다
      expect(await page.evaluate(() => Number(document.getElementById('fold-nib')!.getAttribute('width'))))
        .toBeCloseTo(await page.evaluate(() => (window as any).__b2.app.nib), 6)
    }
    console.log(`[34-2] 촉 각인 왕복 — ${seen.join(' · ')}`)
    expect(new Set(seen.map(s => s.split('→')[1])).size, '다섯이 서로 다른 글자다').toBe(5)

    // ③ **읽히는가** — 글자의 렌더 높이가 연필 각인과 **같은 대역**인가(px 실측).
    //    ⚠⚠ **상태를 맞춰서 잰다**(D-5의 형태): `.tool.on svg`가 «고른» 도구의 아이콘을
    //    `scale(1.14)`로 키우므로(index.html), 연필을 안 고른 채로 펜만 고르고 재면
    //    **펜에만 1.14배가 얹힌 수**를 비로 적게 된다. 둘 다 «안 고른» 상태에서 잰다.
    //    그리고 그 변형에는 `.12s` 트랜지션이 붙어 있어 **중간값이 잡힌다** — 실제로
    //    잡혔다(같은 상태에서 13.20 → 14.15로 흔들렸다). 그래서 기다린 뒤 잰다.
    await page.click('#btn-eraser-ink')
    await page.waitForTimeout(250)
    await settle(page)
    const h = await page.evaluate(() => {
      const m = (id: string) => {
        const e = document.getElementById(id) as unknown as SVGTextElement
        const r = e.getBoundingClientRect(), b = e.getBBox()
        return { h: r.height, w: r.width, bw: b.width,
                 on: (e.closest('button') as HTMLElement).classList.contains('on') }
      }
      // ⚠ 창 폭은 **창 rect에서 읽는다**(#88 — web2-31 마감 [2]. 옛 판은 8.8을 팔이 들었다)
      const win = (id: string) => (document.getElementById(id) as unknown as SVGGraphicsElement).getBBox().width
      return { pencil: m('fold-lead-text'), pen: m('fold-nib-text'),
               penWin: win('fold-nib-win'), leadWin: win('fold-lead-win') }
    })
    expect(h.pencil.on || h.pen.on, '둘 다 «안 고른» 상태에서 잰다').toBe(false)
    console.log(`[34-2] 각인 렌더(둘 다 비활성) — 연필 ${h.pencil.w.toFixed(2)}×${h.pencil.h.toFixed(2)} px · `
      + `펜 ${h.pen.w.toFixed(2)}×${h.pen.h.toFixed(2)} px · 높이비 ${(h.pen.h / h.pencil.h).toFixed(3)} · `
      + `펜 글자 상자 ${h.pen.bw.toFixed(6)} 사용자단위(창 ${h.penWin.toFixed(6)}) · `
      + `연필 글자 상자 ${h.pencil.bw.toFixed(6)}(창 ${h.leadWin.toFixed(6)})`)
    expect(h.pen.h / h.pencil.h, '펜 각인이 연필 각인과 같은 대역')
      .toBeGreaterThanOrEqual(C.FOLD_MARK_MIN_RATIO)
    // 그리고 **창 밖으로 안 넘친다** — 글자의 **잉크 상자**가 창 폭 안에 든다.
    // ⚠ 폭의 출처는 창 rect다(#88 — web2-31 마감 [2]이 8.8을 팔에서 뺐다).
    // ⚠⚠ **연필도 같이 잰다** — 34-2는 「연필은 10에 12.23이라 넘친다」를 적고 넘어갔는데,
    //    web2-31 마감이 `fitMark`로 셋을 한 규약에 넣었으므로 이제 연필도 창 안이다(#54).
    expect(h.pen.bw, '펜 각인이 창 폭 안에 든다').toBeLessThanOrEqual(h.penWin + 1e-3)
    expect(h.pencil.bw, '연필 각인도 창 폭 안에 든다').toBeLessThanOrEqual(h.leadWin + 1e-3)
  })

// **반증(D-3)** — 위 팔이 «무엇이든 하나 더 둔 것»에 통과 도장을 찍는 팔이 아님을 보인다.
// 셋을 실제로 빨갛게 만들고 그 수를 적는다. ⚠ 34-5의 어법과 같다(옛 아이콘을 같은 자리에
// 넣어 같은 검사에 걸리는 것을 값으로 확인한다).
test("①'' 반증 — 옛 마크업 · 끊긴 배선 · font-size로 맞춘 판이 전부 빨개진다 (34-2 · D-3)",
  async ({ page }) => {
    await boot(page)

    // 반증 ㉠ **옛 마크업**(34-2 이전 그대로 — 창도 글자도 없다). 촉의 유일한 채널이었던
    //   니브 사각형의 «폭»이 무엇이었는지 값으로 남긴다.
    const before = await page.evaluate(() => {
      const w: number[] = []
      const b2 = (window as any).__b2
      const rect = document.getElementById('fold-nib')!
      for (const mm of [0.18, 0.25, 0.35, 0.5, 0.7]) {
        b2.app.nib = Math.round(mm * (1.5 / 0.35) * 100) / 100
        // 옛 배선과 같은 계산(syncThick) — 값만 확인한다
        w.push(b2.app.nib)
      }
      const scale = document.querySelector('#btn-pen svg')!.getBoundingClientRect().width / 26
      rect.setAttribute('width', '1.5')
      return { user: w, rendered: w.map(v => +(v * scale).toFixed(2)), scale }
    })
    console.log(`[34-2 반증 ㉠] 옛 유일 채널(니브 폭) — 사용자단위 ${before.user.join(' · ')}`
      + ` = 렌더 ${before.rendered.join(' · ')} px (이웃 칸 차 `
      + `${before.rendered.slice(1).map((v, i) => (v - before.rendered[i]!).toFixed(2)).join(' · ')} px)`)
    await page.reload(); await page.waitForFunction(() => (window as any).__b2)
    const gone = await page.evaluate(() => {
      const svg = document.querySelector('#btn-pen svg')!
      svg.querySelector('#fold-nib-text')!.remove()
      svg.querySelector('rect[width="8.8"]')!.remove()
      return document.querySelectorAll('#btn-pen #fold-nib-text').length
    })
    console.log(`[34-2 반증 ㉠] 옛 마크업으로 되돌리면 #fold-nib-text 개수 = ${gone} (팔의 요구는 1)`)
    expect(gone, '옛 마크업이면 ①의 첫 단언이 빨개진다').toBe(0)

    // 반증 ㉡ **끊긴 배선** — 요소는 있는데 갱신이 안 닿는다(main.ts가 든 참조를 떼어낸다).
    //   ⚠ 이것이 「글자를 하나 그려 놓기만 해도 통과한다」를 막는 자리다.
    await page.reload(); await page.waitForFunction(() => (window as any).__b2)
    await page.evaluate(() => {
      const el = document.getElementById('fold-nib-text')!
      el.replaceWith(el.cloneNode(true))     // 화면의 것은 복제본 · main.ts는 떨어져 나간 원본을 쥔다
    })
    const stuck: string[] = []
    for (const mm of C.NIB_MM) {
      await page.click('#btn-pen'); await settle(page)
      await page.click(`#${NIB_ID(mm)}`); await settle(page)
      stuck.push((await page.locator('#fold-nib-text').textContent()) ?? '')
    }
    console.log(`[34-2 반증 ㉡] 배선을 끊으면 다섯 촉이 전부 "${stuck.join('/')}" — `
      + `서로 다른 글자 ${new Set(stuck).size}가지 (팔의 요구는 5)`)
    expect(new Set(stuck).size, '배선이 끊기면 ①의 왕복이 빨개진다').toBe(1)

    // 반증 ㉢ **font-size로 맞춘 판** — 지시문이 든 다른 길이다(「font-size를 줄여라」).
    //   ".35"가 몸통 8.8에 들어가려면 6.5까지 내려야 하고, 그러면 **높이를 잃는다**.
    await page.reload(); await page.waitForFunction(() => (window as any).__b2)
    await page.click('#btn-eraser-ink'); await page.waitForTimeout(250); await settle(page)
    const alt = await page.evaluate(() => {
      const t = document.getElementById('fold-nib-text')!
      const h = (id: string) => document.getElementById(id)!.getBoundingClientRect().height
      const keep = h('fold-nib-text') / h('fold-lead-text')
      t.setAttribute('font-size', '6.5')
      t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust')
      const b = (t as unknown as SVGTextElement).getBBox()
      return { keep, ratio: h('fold-nib-text') / h('fold-lead-text'), bw: b.width }
    })
    console.log(`[34-2 반증 ㉢] font-size 8.5+textLength 높이비 ${alt.keep.toFixed(3)} → `
      + `font-size 6.5 무압축 높이비 ${alt.ratio.toFixed(3)} · 글자 상자 ${alt.bw.toFixed(2)} `
      + `사용자단위(문턱 C.FOLD_MARK_MIN_RATIO = ${C.FOLD_MARK_MIN_RATIO})`)
    expect(alt.keep, '지금 판은 문턱 위').toBeGreaterThanOrEqual(C.FOLD_MARK_MIN_RATIO)
    expect(alt.ratio, 'font-size로 맞춘 판은 ③이 빨개진다').toBeLessThan(C.FOLD_MARK_MIN_RATIO)
  })

test('②④⑤ — 치수 트리거(손) · 자 팝업(오스냅) · own3d(진단) 동작 그대로', async ({ page }) => {
  await boot(page)
  // ② 치수 — 트리거가 손 띠(#sidebar-body 직속)에 있고 리본이 종전대로 열린다
  expect(await page.evaluate(() =>
    document.getElementById('dim-toggle')!.parentElement!.id)).toBe('sidebar-body')
  expect(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded'))).toBe(true)
  await page.click('#dim-toggle')
  expect(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded'))).toBe(false)
  await page.click('#dim-toggle')
  expect(await page.evaluate(() => document.getElementById('dimpanel')!.classList.contains('folded'))).toBe(true)

  // ④ 자 — 누르면 오스냅 종류·반경이 열리고 동작은 그대로다(설정 자루에서 나온 그 배선)
  await expect(page.locator('#snap-pop')).toBeHidden()
  await page.click('#btn-snap')
  await expect(page.locator('#snap-pop')).toBeVisible()
  expect(await page.locator('#snap-pop #osnap-kinds input').count()).toBeGreaterThanOrEqual(8)
  // 종류 하나를 꺼 본다 — app.osnap이 실제로 바뀐다(왕복). 첫 줄은 OSNAP_ORDER의 'vp'다.
  const vp0 = await page.evaluate(() => (window as any).__b2.app.osnap.kinds.vp)
  await page.click('#osnap-kinds input >> nth=0')
  expect(await page.evaluate(() => (window as any).__b2.app.osnap.kinds.vp)).toBe(!vp0)
  await page.click('#osnap-kinds input >> nth=0')
  expect(await page.evaluate(() => (window as any).__b2.app.osnap.kinds.vp)).toBe(vp0)
  // 반경 — 같은 슬라이더가 그대로 산다
  await page.locator('#osnap-radius').fill('12')
  expect(await page.evaluate(() => (window as any).__b2.app.osnap.radius)).toBe(12)
  await page.locator('#osnap-radius').fill('8')
  // 축 스냅 — **자리만** 있다(끄는 토글이 없다 — 대응표 §4·DEFERRED)
  expect(await page.locator('#snap-pop #axis-snap-slot').count()).toBe(1)
  expect(await page.locator('#axis-snap-slot input').count()).toBe(0)
  await page.click('#btn-snap')
  await expect(page.locator('#snap-pop')).toBeHidden()

  // ⑤ own3d — **진단 곁**에 있고 동작 그대로(왕복 + localStorage 열쇠 불변)
  // ⚠⚠ **web2-30 10번이 설정 패널을 되세웠다**(web2-19 3-a가 해체한 뒤 상태 옵션이 갈 곳이
  //   없어 눈에 얹혔던 그 자리다). 그러나 **own3d는 여기로 안 옮겼다** — own3d는 사용자
  //   설정이 아니라 **A-4의 되돌리기 깃발**(옛 사슬 경로)이라 진단 곁이 제자리다.
  //   그래서 이 팔의 요구(「own3d는 설정이 아니라 진단 곁이다」)는 **그대로 유효**하고,
  //   재는 방식만 「설정이 없다」에서 「설정에 own3d가 없다」로 좁아진다(#74 ㉢의 물음).
  expect(await page.locator('#pane-settings').count(), '설정 패널은 이제 있다').toBe(1)
  expect(await page.locator('#pane-settings #chk-own3d').count(), 'own3d는 설정에 없다').toBe(0)
  await expect(page.locator('#diagctl')).toBeHidden()
  await openDiag(page)
  await expect(page.locator('#diagctl')).toBeVisible()
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('b2-own3d'))).toBe('off')
  await page.click('#chk-own3d')
  expect(await page.evaluate(() => (window as any).__b2.app.own3d)).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('b2-own3d'))).toBe('on')
  await openDiag(page)
  await expect(page.locator('#diagctl')).toBeHidden()
})

test('③ 표시 토글 셋 — 눈 팝업에 있고 동작은 그대로(왕복)', async ({ page }) => {
  await boot(page)
  await expect(page.locator('#display-pop')).toBeHidden()
  await page.click('#btn-display')
  await expect(page.locator('#display-pop')).toBeVisible()
  // 지평선 — 끄면 그 줄 픽셀이 0, 켜면 돌아온다(빈 문서 — 자동 표시 상태)
  expect(await inkPixels(page, 150, 397, 750, 404)).toBeGreaterThan(100)
  await page.click('#chk-horizon'); await settle(page)
  expect(await inkPixels(page, 150, 397, 750, 404)).toBe(0)
  await page.click('#chk-horizon'); await settle(page)
  expect(await inkPixels(page, 150, 397, 750, 404)).toBeGreaterThan(100)
  // 격자 — app.grid 왕복(픽셀 판정은 flow.spec 종전 팔이 진다)
  await page.click('#chk-grid')
  expect(await page.evaluate(() => (window as any).__b2.app.grid)).toBe(true)
  await page.click('#chk-grid')
  expect(await page.evaluate(() => (window as any).__b2.app.grid)).toBe(false)
  // 대기 감쇠 — app.waitFade 왕복
  await page.click('#chk-waitfade')
  expect(await page.evaluate(() => (window as any).__b2.app.waitFade)).toBe(false)
  await page.click('#chk-waitfade')
  expect(await page.evaluate(() => (window as any).__b2.app.waitFade)).toBe(true)
  await page.click('#btn-display')
  await expect(page.locator('#display-pop')).toBeHidden()
})

test('⑥ 전체 화면 — 크롬 0 · 뼈대 그대로 · 손잡이로 나온다 · 새로 고치면 꺼짐 (+반증)', async ({ page }) => {
  await boot(page)
  // 소실점 하나를 세워 둔다(✕가 뼈대의 표본) — 앵커 + vp 획(graphite.spec 픽스처)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)             // vp (1100,400)
  const hzBefore = await inkPixels(page, 150, 397, 750, 404)
  const vpBefore = await inkPixels(page, 1090, 390, 1110, 410)
  expect(vpBefore, '소실점 ✕가 섰다').toBeGreaterThan(4)

  await page.click('#btn-fullscreen'); await settle(page)
  // 크롬 픽셀 0 — 종이 띠·눈·손·서랍·치수 리본이 전부 사라졌다(값: 보이는 크기 0)
  // ⚠ **`thick`이 목록에서 빠졌다**(web2-34 3번) — 굵기 막대가 통째로 사라졌고, 지우개
  //   크기는 이제 **크기통**이다(R1). 통 셋은 세로바 «안»에 있어 `sidebar` 한 줄로 같이
  //   숨으므로 이 표에 따로 안 든다 — 그래도 «전부 사라졌다»를 값으로 지키려고 통 셋의
  //   보이는 크기를 아래에서 따로 잰다(#75 ㉣: 요구는 그대로, 표만 갈렸다).
  for (const id of ['topleft', 'eyebar', 'sidebar', 'dimpanel']) {
    expect(await page.evaluate((i) =>
      getComputedStyle(document.getElementById(i)!).display, id), `#${id} 숨김`).toBe('none')
  }
  // 통 셋(연필통·촉통·크기통)도 화면에 없다 — 세로바가 숨으면 그 안의 펼침도 없다
  expect(await page.evaluate(() =>
    ['tray', 'pentray', 'etray'].map(i => document.getElementById(i)!.getBoundingClientRect().width)),
  '통 셋의 보이는 폭 0').toEqual([0, 0, 0])
  // 작도의 뼈대는 남는다 — 지평선·소실점 ✕ 픽셀이 그대로다
  expect(await inkPixels(page, 150, 397, 750, 404)).toBe(hzBefore)
  expect(await inkPixels(page, 1090, 390, 1110, 410)).toBe(vpBefore)
  // 그리기·궤도가 된다 — 입력은 캔버스 몫이라 크롬과 무관하다
  const n0 = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await drawLine(page, 300, 600, 500, 600)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBe(n0 + 1)
  const q0 = await page.evaluate(() => (window as any).__b2.app.pose.q.y)
  await page.mouse.move(600, 300)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 6; i++) await page.mouse.move(600 + i * 10, 300)
  await page.mouse.up({ button: 'middle' }); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.pose.q.y)).not.toBe(q0)
  // ⚠⚠ **궤도가 방금 그은 획을 버렸다**(web2-37 4번 — 그 획은 허공의 자유 획이라 대기다).
  //    이 팔이 재려는 것은 「크롬 없이도 손은 산다」(그리기·궤도·지우기)이지 대기 획의
  //    수명이 아니므로, **실행취소로 되돌려** 지울 대상을 되살린다 — 그 되돌림이 37-4의
  //    거동(획 + 그 궤도를 함께 무른다)을 이 자리에서 실제로 쓰는 것이기도 하다.
  await page.keyboard.press('Control+z'); await settle(page)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length),
    '실행취소로 그 획이 돌아왔다').toBe(n0 + 1)
  await page.click('#fs-exit'); await settle(page)      // 지우개를 고르러 잠시 나온다
  await page.click('#btn-eraser-pencil')
  await page.click('#btn-fullscreen'); await settle(page)
  // 지우기가 된다 — 방금 그은 획을 문지른다(도구는 들어오기 전에 골랐다 — 크롬 없이도 손은 산다)
  const before = await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
  await drawLine(page, 290, 600, 510, 600)
  expect(await page.evaluate(() => (window as any).__b2.app.doc.strokes.length)).toBeLessThan(before)
  // 나가는 길 — 우하단 손잡이가 보인다(안 보이면 고장으로 읽힌다 — 지시 문면)
  await expect(page.locator('#fs-exit')).toBeVisible()
  // 반증(D-3) — 손잡이를 빼면 나갈 조작 요소가 화면에 없다(크롬이 전부 숨었으므로)
  const exitCount = await page.evaluate(() => {
    document.getElementById('fs-exit')!.remove()
    return document.querySelectorAll('#fs-exit').length
  })
  expect(exitCount).toBe(0)
  await page.reload(); await page.waitForFunction(() => (window as any).__b2)
  // 새로 고치면 꺼져 있다(상태 저장 없음 — 세션 한정)
  expect(await page.evaluate(() => document.body.classList.contains('fs'))).toBe(false)
  await expect(page.locator('#fs-exit')).toBeHidden()
  // 손잡이 경로 — 다시 들어가 **손잡이로** 나온다
  await page.click('#btn-fullscreen'); await settle(page)
  await page.click('#fs-exit'); await settle(page)
  expect(await page.evaluate(() => document.body.classList.contains('fs'))).toBe(false)
  await expect(page.locator('#sidebar')).toBeVisible()
})
