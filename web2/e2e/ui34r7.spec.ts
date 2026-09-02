// web2-34 4번 — **열린 통은 그 통 바깥의 무엇을 눌러도 접힌다**(화면 규칙 R7).
//
// 사람의 말: 「필통이나 볼펜통을 열어놓은 상태에서 지우개 등 다른 버튼을 누르면
// 통이 접혀야 한다.」 28-1(R3)은 「패널 **안**에서 명령을 실행했을 때」만 다뤘고
// **바깥이 비어 있었다.**
//
// D-2(재현): ①이 **수리 전에 빨갛다** — 여덟 통이 바깥 누름에 열린 채 남는다
//   (`#tray`·`#pentray`·`#etray`·`#snap-pop`·`#display-pop`·`#face-pop`·
//    `#pane-file`·`#pane-settings`). `#paper-pop`·`#layer-pop`은 수리 전에도
//   초록이다 — 그 둘이 **이 저장소 안의 선례**이고 나머지가 안 쓸린 것이다(#54).
// D-3(반증): `away` 등록을 빼면 ①②③이 빨개진다 — 실제로 빼서 수치를 냈다(NOTES §⑤).
// D-5(대역): 통 **전부**를 표로 돌고 dpr 둘 다 돈다. 바깥은 «단추»만이 아니라
//   **캔버스**까지 잰다(②) — 거기가 #77 ㉠이 죽는 자리다.
//
// ⚠ R3과 안 부딪힌다: R3은 패널 **안**의 거동이고 R7은 **밖**의 거동이다.
//   오스냅 체크는 R3에서 안 접히지만(ui28.spec ①) R7에서는 바깥을 누르면 접힌다.

import { test, expect, type Page } from '@playwright/test'
import { clearStore } from './store43'

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

const strokes = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)
const tool = (page: Page) => page.evaluate(() => (window as any).__b2.app.tool)

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up(); await settle(page)
}

/** 카메라를 닫는다 — `#layer-add`(겹 팝오버의 입구)가 그 뒤에야 눌린다(2-a) */
async function boot(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await clearStore(page)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await drawLine(page, 280, 560, 700, 560)
  await drawLine(page, 500, 560, 800, 480)
  expect(await page.evaluate(() => (window as any).__b2.app.lift.an.constructionDone)).toBe(true)
}

type Kind = 'class' | 'hidden' | 'details' | 'exists'

interface Box {
  id: string
  sel: string
  kind: Kind
  /** 화면의 길 그대로 연다(직접 대입 ⛔) */
  open: (page: Page) => Promise<void>
  /** 이 통을 여는 길이 도구까지 바꾸는가 — 캔버스 누름의 «제 일»이 무엇인지가 갈린다 */
  tool?: string
}

const isOpen = (page: Page, sel: string, kind: Kind) => page.evaluate(([s, k]) => {
  const el = document.querySelector(s as string) as HTMLElement | null
  if (!el) return false
  if (k === 'exists') return true
  if (k === 'details') return (el as HTMLDetailsElement).open
  if (k === 'class') return el.classList.contains('open')
  return !el.hidden
}, [sel, kind])

async function longPress(page: Page, sel: string) {
  const b = (await page.locator(sel).boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await settle(page)
}

/** 열리는 것 **전부**(통·팝오버·서랍). 정본은 `index.html`과 `src/app/*.ts`이고
 *  이 표는 그 전수 훑기의 결과다 — 새 통이 생기면 여기 한 줄이 는다.
 *  ⚠ 비대상 셋과 그 근거는 NOTES 34-4 §③에 있다:
 *    `#dimpanel`(작업대 — 바깥을 눌러야 일이 된다) · `#diagpanel`(판독 전용) ·
 *    `#layer-list`/`#sidebar`(겹쳐 뜨지 않고 띠 자체를 늘리는 인라인 펼침). */
const BOXES: Box[] = [
  { id: '#tray 연필통', sel: '#tray', kind: 'class', open: p => p.click('#btn-pencil'), tool: 'pencil' },
  { id: '#pentray 촉통', sel: '#pentray', kind: 'class', open: p => p.click('#btn-pen'), tool: 'pen' },
  {
    id: '#etray 지우개 크기통', sel: '#etray', kind: 'class',
    open: p => p.click('#btn-eraser-pencil'), tool: 'eraser-pencil',
  },
  { id: '#snap-pop 자', sel: '#snap-pop', kind: 'hidden', open: p => p.click('#btn-snap') },
  { id: '#display-pop 표시', sel: '#display-pop', kind: 'hidden', open: p => p.click('#btn-display') },
  {
    id: '#face-pop 면', sel: '#face-pop', kind: 'hidden', tool: 'face',
    open: async p => { await p.click('#btn-face'); await settle(p); await p.click('#btn-face') },
  },
  { id: '#pane-file 파일 서랍', sel: '#pane-file', kind: 'details', open: p => p.click('#pane-file > summary') },
  { id: '#pane-settings 설정 서랍', sel: '#pane-settings', kind: 'details', open: p => p.click('#pane-settings > summary') },
  // ⚠ 겹 팝오버가 종이 팝오버 **앞**이다 — 종이 팝오버는 탭 바로 아래(겹 줄 자리)에 떠서
  //   `#layer-add`를 덮는다. 순서를 반대로 두면 ③이 «가려서» 못 누른다(규칙이 아니라 자리).
  { id: '#layer-pop 겹', sel: '#layer-pop', kind: 'exists', open: p => p.click('#layer-add') },
  { id: '#paper-pop 종이', sel: '#paper-pop', kind: 'exists', open: p => longPress(p, '#paperbar .ptab[data-sheet="0"]') },
]

/** 어느 통의 «안»도 아닌 중립 단추 — 눈 띠의 「작도 시점으로」(시점만 바꾼다) */
const OUTSIDE = '#btn-draw-view'

/** 도구를 연필로 되돌리고 통은 닫아 둔다 — 앞 칸이 남긴 도구가 다음 칸을 흐리지 않게 */
async function resetPencil(page: Page) {
  await page.click('#btn-pencil'); await settle(page)
  if (await isOpen(page, '#tray', 'class')) { await page.click('#btn-pencil'); await settle(page) }
  expect(await tool(page)).toBe('pencil')
}

test('34-4 ① **전수** — 열린 통은 바깥의 단추를 누르면 접힌다', async ({ page }) => {
  await boot(page)
  const rows: string[] = []
  const stuck: string[] = []       // ⚠ 첫 실패에서 멈추지 않는다 — **목록**을 낸다(#72 ②)
  for (const b of BOXES) {
    await resetPencil(page)
    await b.open(page)
    await settle(page)
    const before = await isOpen(page, b.sel, b.kind)
    expect(before, `${b.id} — 열렸는지부터 확인한다(공집합이면 통과가 무의미하다 — #69 ㉣)`).toBe(true)
    await page.click(OUTSIDE)
    await settle(page)
    const after = await isOpen(page, b.sel, b.kind)
    rows.push(`${b.id}: 열림 ${before} → 바깥(${OUTSIDE}) 누름 뒤 열림 ${after}`)
    if (after) stuck.push(b.id)
  }
  console.log(`[34-4 ①] 전수 ${BOXES.length}\n  ` + rows.join('\n  ')
    + `\n  안 접힌 것 ${stuck.length}: ${stuck.join(', ') || '없음'}`)
  expect(stuck, '바깥을 눌렀는데 열린 채 남은 통').toEqual([])
})

test('34-4 ② 바깥이 **캔버스**여도 접힌다 — 그리고 그 누름의 제 일이 산다', async ({ page }) => {
  await boot(page)
  const rows: string[] = []
  const stuck: string[] = []
  const swallowed: string[] = []
  const PATH = [200, 700, 420, 640] as const
  for (const b of BOXES) {
    await resetPencil(page)
    // 지우개통 칸에서는 **지울 것**을 먼저 놓는다 — 그 도구의 제 일이 지우기이므로
    if (b.sel === '#etray') await drawLine(page, ...PATH)
    await b.open(page)
    await settle(page)
    expect(await isOpen(page, b.sel, b.kind), `${b.id} 열림`).toBe(true)
    const t0 = await tool(page)
    if (b.tool) expect(t0, `${b.id}을 여는 길이 도구를 ${b.tool}로 둔다`).toBe(b.tool)
    const n0 = await strokes(page)
    await drawLine(page, ...PATH)          // 캔버스 왼쪽 아래 — 어느 통·리본과도 안 겹친다
    const n1 = await strokes(page)
    const after = await isOpen(page, b.sel, b.kind)
    rows.push(`${b.id}: 도구 ${t0} · 접힘 ${!after} · 획 ${n0}→${n1}`)
    if (after) stuck.push(b.id)
    expect(await tool(page), `${b.id} — 캔버스 누름이 도구를 안 바꾼다`).toBe(t0)
    if (t0 === 'pencil' || t0 === 'pen') {
      // ⚠ 이것이 #77 ㉠의 반증 짝이다 — 바깥 누름을 «삼키면» 여기가 빨개진다
      if (n1 !== n0 + 1) swallowed.push(`${b.id}(획 ${n0}→${n1})`)
      const last = await page.evaluate(() => {
        const s = (window as any).__b2.app.doc.strokes
        const st = s[s.length - 1]
        return { a: [st.a.x, st.a.y], b: [st.b.x, st.b.y] }
      })
      // 끝점이 그은 자리다 — 시작점·끝점 중 하나가 (200,700)·(420,640) 쪽에 있다
      const dist = Math.min(
        Math.hypot(last.a[0] - PATH[0], last.a[1] - PATH[1]),
        Math.hypot(last.b[0] - PATH[0], last.b[1] - PATH[1]))
      if (dist > 30) swallowed.push(`${b.id}(끝점 ${JSON.stringify(last)})`)
    } else if (t0 === 'eraser-pencil') {
      if (n1 >= n0) swallowed.push(`${b.id}(지우기 안 됨 ${n0}→${n1})`)
    }
  }
  // 픽셀로도 확인한다 — 마지막으로 그은 자리에 실제로 칠이 있다
  await resetPencil(page)
  await page.click('#btn-pencil'); await settle(page)      // 연필통을 연 채로
  expect(await isOpen(page, '#tray', 'class')).toBe(true)
  await drawLine(page, 200, 700, 420, 640)
  const painted = await page.evaluate(() => {
    const dpr = window.devicePixelRatio || 1
    const out: Record<string, number> = {}
    for (const id of ['brushc', 'ink']) {
      const c = document.getElementById(id) as HTMLCanvasElement | null
      if (!c) { out[id] = -1; continue }
      const t = document.createElement('canvas')
      t.width = Math.round(30 * dpr); t.height = Math.round(30 * dpr)
      const g = t.getContext('2d')!
      g.drawImage(c, Math.round((310 - 15) * dpr), Math.round((670 - 15) * dpr), t.width, t.height, 0, 0, t.width, t.height)
      const d = g.getImageData(0, 0, t.width, t.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++
      out[id] = n
    }
    return out
  })
  console.log(`[34-4 ②]\n  ` + rows.join('\n  ')
    + `\n  안 접힌 것 ${stuck.length}: ${stuck.join(', ') || '없음'}`
    + `\n  누름이 삼켜진 것 ${swallowed.length}: ${swallowed.join(', ') || '없음'}`
    + `\n  획 가운데 30×30의 칠한 픽셀 ${JSON.stringify(painted)}`)
  expect(stuck, '캔버스를 눌렀는데 열린 채 남은 통').toEqual([])
  expect(swallowed, '통을 접느라 그 누름의 제 일이 죽은 자리(#77 ㉠)').toEqual([])
  expect(await isOpen(page, '#tray', 'class'), '캔버스를 눌러 연필통이 접혔다').toBe(false)
  expect(Math.max(painted.brushc ?? 0, painted.ink ?? 0), '캔버스에 실제로 그어졌다').toBeGreaterThan(0)
})

test('34-4 ③ 동시에 둘이 안 열린다 — 통 전수', async ({ page }) => {
  await boot(page)
  const rows: string[] = []
  const bad: string[] = []
  for (const b of BOXES) {
    // ⚠ 앞 칸을 안 닫고 바로 다음 통을 연다 — 그것이 이 팔이 묻는 것이다
    await b.open(page)
    await settle(page)
    const open: string[] = []
    for (const o of BOXES) if (await isOpen(page, o.sel, o.kind)) open.push(o.id)
    // 등록부가 무엇이라 하는지도 같이 읽는다 — 화면 형태와 등록부가 갈리면 그 자체가 결함이다
    const reg = await page.evaluate(() => (window as any).__b2.diag.openBoxes())
    rows.push(`${b.id}을 연 뒤 열린 것 ${open.length}: ${open.join(', ') || '없음'} · 등록부 ${JSON.stringify(reg)}`)
    if (open.length !== 1 || open[0] !== b.id) bad.push(`${b.id} → ${open.join('+') || '없음'}`)
    if (reg.length !== 1) bad.push(`${b.id} 등록부 ${reg.join('+') || '없음'}`)
  }
  console.log(`[34-4 ③]\n  ` + rows.join('\n  ')
    + `\n  «열린 것이 하나»가 깨진 칸 ${bad.length}: ${bad.join(' / ') || '없음'}`)
  expect(bad, '통을 열었을 때 열린 것이 그것 하나가 아닌 칸').toEqual([])
})

test('34-4 ④ 누른 버튼의 **제 일**이 죽지 않는다 — 전수', async ({ page }) => {
  await boot(page)
  const rows: string[] = []
  const bad: string[] = []
  // 사람의 문면 그대로: 통이 열린 채 지우개를 누르면 통이 접히고 **도구가 바뀐다**
  for (const [btn, want] of [
    ['#btn-eraser-pencil', 'eraser-pencil'],
    ['#btn-eraser-ink', 'eraser-ink'],
    ['#btn-face', 'face'],
    ['#btn-pen', 'pen'],
    ['#btn-pencil', 'pencil'],
  ] as [string, string][]) {
    // 통 하나를 열어 둔다(누를 단추의 바깥이다). ⚠ 여닫이 단추라 **열렸는지를 보고** 누른다
    // — 수리 전에는 앞 칸의 통이 열린 채 남아 이 누름이 «닫기»가 됐다.
    if (!(await isOpen(page, '#snap-pop', 'hidden'))) { await page.click('#btn-snap'); await settle(page) }
    expect(await isOpen(page, '#snap-pop', 'hidden'), '자 통이 열렸다').toBe(true)
    await page.click(btn)
    await settle(page)
    const folded = !(await isOpen(page, '#snap-pop', 'hidden'))
    const t = await tool(page)
    rows.push(`${btn}: 자 통 접힘 ${folded} · 도구 ${t}(요구 ${want})`)
    if (!folded) bad.push(`${btn} 안 접힘`)
    if (t !== want) bad.push(`${btn} 도구 ${t}`)
  }
  // 명령 단추도 같다 — 실행취소가 실제로 돈다
  // 연필통을 연다 — ⚠ 여닫이라 **열렸는지를 보고** 누른다(위 고리의 마지막이 연필이다)
  if (!(await isOpen(page, '#tray', 'class'))) { await page.click('#btn-pencil'); await settle(page) }
  expect(await isOpen(page, '#tray', 'class')).toBe(true)
  const n0 = await strokes(page)
  await page.click('#btn-undo'); await settle(page)
  const n1 = await strokes(page)
  const trayFolded = !(await isOpen(page, '#tray', 'class'))
  rows.push(`#btn-undo: 연필통 접힘 ${trayFolded} · 획 ${n0}→${n1}`)
  if (!trayFolded) bad.push('#btn-undo 안 접힘')
  if (n1 !== n0 - 1) bad.push(`#btn-undo 실행취소 안 됨(${n0}→${n1})`)
  console.log(`[34-4 ④]\n  ` + rows.join('\n  ') + `\n  깨진 칸 ${bad.length}: ${bad.join(', ') || '없음'}`)
  expect(bad, '바깥 단추의 접힘·제 일 둘 중 하나가 깨진 칸').toEqual([])
})

test('34-4 ⑤ **예외** — 치수 리본은 작업대다: 캔버스를 눌러도 안 접히고 거기서 잰다', async ({ page }) => {
  await boot(page)
  await page.click('#dim-toggle'); await settle(page)
  const dimOpen = () => page.evaluate(() => !document.getElementById('dimpanel')!.classList.contains('folded'))
  expect(await dimOpen(), '치수 리본이 펴졌다').toBe(true)
  // 캔버스를 눌러도 안 접힌다 — 바깥을 눌러야 일이 되는 자리다(#77 ㉠)
  await drawLine(page, 200, 700, 420, 640)
  expect(await dimOpen(), '캔버스를 눌러도 안 접힌다').toBe(true)
  // 그 자리에서 **재기가 실제로 된다** — 두 점을 짚으면 값이 선다
  await page.click('#btn-measure'); await settle(page)
  expect(await dimOpen(), '재기로 들어가면 펴진 채다').toBe(true)
  await page.mouse.move(280, 560); await page.mouse.down(); await page.mouse.up(); await settle(page)
  const s1 = await page.getAttribute('#dim-measure', 'data-measure')
  await page.mouse.move(700, 560); await page.mouse.down(); await page.mouse.up(); await settle(page)
  const s2 = await page.getAttribute('#dim-measure', 'data-measure')
  const text = await page.textContent('#dim-measure')
  console.log(`[34-4 ⑤] 치수 리본 펴짐 유지 · 재기 ${s1} → ${s2} · 「${text}」`)
  expect(await dimOpen(), '재고 난 뒤에도 펴진 채다').toBe(true)
  expect(s1, '첫 점을 짚었다').toBe('from')
  expect(s2, '둘째 점으로 값이 섰다').toBe('value')
})

test('34-4 ⑥ **반증** — away를 빼면 ①②③이, 삼키면 ②만 빨개진다 (D-3)', async ({ page }) => {
  test.setTimeout(120_000)   // #93(55 마감) — 병렬 4 부하에서 60s 초과(값 오류 아님 · 긴 D-3 순회)
  /** 통 전수에 대해 「바깥을 눌렀을 때 접혔나 · 그 누름의 제 일이 살았나」를 한 번에 낸다 */
  async function sweep(mode: 'on' | 'off' | 'swallow') {
    await page.evaluate(m => (window as any).__b2.diag.boxAwayModeForTest(m), mode)
    const stuck: string[] = []
    const swallowed: string[] = []
    const opened: string[] = []
    const scored: string[] = []      // 「제 일」을 잴 수 있는 칸 — 도구가 연필·펜·지우개인 칸
    for (const b of BOXES) {
      await page.evaluate(() => (window as any).__b2.diag.boxAwayModeForTest('on'))
      await resetPencil(page)                       // 앞 칸의 통을 확실히 닫고 도구를 되돌린다
      await page.evaluate(m => (window as any).__b2.diag.boxAwayModeForTest(m), mode)
      await b.open(page)
      await settle(page)
      if (!(await isOpen(page, b.sel, b.kind))) continue   // 못 열렸으면 그 칸은 안 센다
      opened.push(b.id)
      const t0 = await tool(page)
      const n0 = await strokes(page)
      await drawLine(page, 200, 700, 420, 640)
      const n1 = await strokes(page)
      if (await isOpen(page, b.sel, b.kind)) stuck.push(b.id)
      // 「제 일」 — 연필·펜은 획이 하나 늘고 지우개는 준다. 면 도구는 잴 것이 없어 안 센다.
      if (t0 === 'pencil' || t0 === 'pen') {
        scored.push(b.id)
        if (n1 !== n0 + 1) swallowed.push(b.id)
      } else if (t0 === 'eraser-pencil') {
        scored.push(b.id)
        if (n1 >= n0) swallowed.push(b.id)
      }
    }
    await page.evaluate(() => (window as any).__b2.diag.boxAwayModeForTest('on'))
    return { stuck, swallowed, opened, scored }
  }

  await boot(page)
  // 지울 것을 미리 놓는다 — 지우개 칸의 «제 일»이 지우기다
  for (let i = 0; i < 3; i++) await drawLine(page, 200, 700, 420, 640)

  const on = await sweep('on')
  const off = await sweep('off')
  const sw = await sweep('swallow')
  const line = (n: string, r: typeof on) =>
    `  ${n} — 열린 칸 ${r.opened.length}/${BOXES.length} · 안 접힘 ${r.stuck.length}: ${r.stuck.join(', ') || '없음'}`
    + ` · 잴 수 있는 칸 ${r.scored.length} 중 삼켜짐 ${r.swallowed.length}: ${r.swallowed.join(', ') || '없음'}`
  console.log(`[34-4 ⑥] 통 ${BOXES.length}\n`
    + line('제자리(on)  ', on) + '\n' + line('㉠ away 없음', off) + '\n' + line('㉡ 삼키는 판', sw))

  // 제자리에서는 둘 다 0이어야 ①②가 초록인 이유가 선다
  expect(on.opened.length, '제자리에서는 통 전부가 열린다').toBe(BOXES.length)
  expect(on.stuck).toEqual([])
  expect(on.swallowed).toEqual([])
  // ㉠ away를 빼면 **접힘이 통째로 죽는다** — ①②③이 빨개지는 자리.
  //   ⚠ `#layer-pop`만 예외로 걷힌다 — 획이 그어지면 겹 줄이 다시 그려지고 그때 닫힌다
  //   (R7이 아니라 `render()`의 몫이다). 그래서 요구는 전부가 아니라 «하나 뺀 전부»다.
  expect(off.stuck.length, 'away가 없으면 통이 열린 채 남는다').toBeGreaterThanOrEqual(BOXES.length - 1)
  expect(off.swallowed, 'away가 없어도 그 누름의 제 일은 산다(삼키지 않으므로)').toEqual([])
  // ㉡ 삼키면 **접힘은 여전히 산다** — 「접힌다」만 재는 팔로는 이 결함을 못 잡는다
  expect(sw.stuck, '삼켜도 통은 접힌다(①③은 초록이다)').toEqual([])
  // …그리고 **잴 수 있는 칸이 전부 죽는다** — ②만 빨개진다(#77 ㉠)
  expect(sw.scored.length, '잴 수 있는 칸이 여럿 있다(#69 ㉣)').toBeGreaterThanOrEqual(6)
  expect(sw.swallowed, '삼키면 캔버스의 획·지우기가 전부 죽는다').toEqual(sw.scored)
})

test('34-4 ⑦ **예외의 반증 짝** — 필압 보정 절차 중에만 설정 서랍이 안 접힌다 (D-4)', async ({ page }) => {
  // ⚠ 지시문의 표는 `#pane-settings`를 그냥 R7 대상으로 들었는데, 그 서랍 안에
  //   「캔버스에 두 획을 그으세요」라는 절차가 있고 **다음 지시와 그만두기 손잡이가
  //   이 패널 안**이다(30-7). 바깥 누름에 접으면 첫 획에 그 수리가 죽는다(#77 ㉠).
  //   예외를 **패널이 아니라 그 구간**에 걸었다는 것을 두 방향으로 잰다.
  await boot(page)
  const open = () => page.evaluate(() => (document.getElementById('pane-settings') as HTMLDetailsElement).open)
  const busy = () => page.evaluate(() => (window as any).__b2.app.pressCalib !== null)

  // ㉠ 절차 **중** — 캔버스에 그어도 안 접히고, 그만두기가 실제로 눌린다
  await page.click('#pane-settings > summary'); await settle(page)
  await page.click('#chk-press'); await settle(page)   // ⚠ check()는 못 쓴다(30-7 ④)
  expect(await busy(), '절차가 시작됐다').toBe(true)
  await drawLine(page, 200, 700, 420, 640)
  const inProc = await open()
  const step = await page.textContent('#press-calib-step')
  const cancelVisible = await page.locator('#btn-press-cancel').isVisible()
  expect(inProc, '절차 중에는 캔버스를 눌러도 안 접힌다').toBe(true)
  expect(cancelVisible, '그만두기 손잡이가 화면에 남는다').toBe(true)
  await page.click('#btn-press-cancel'); await settle(page)
  expect(await busy(), '그만뒀다').toBe(false)

  // ㉡ 절차 **밖** — 같은 서랍이 보통 통이다(바깥을 누르면 접힌다)
  if (!(await open())) { await page.click('#pane-settings > summary'); await settle(page) }
  expect(await open()).toBe(true)
  await drawLine(page, 200, 700, 420, 640)
  const outProc = await open()
  console.log(`[34-4 ⑦] 절차 중 열림 ${inProc}(그만두기 보임 ${cancelVisible} · 「${step?.trim()}」) · 절차 밖 열림 ${outProc}`)
  expect(outProc, '절차가 아니면 보통 통이다 — 바깥을 누르면 접힌다').toBe(false)
})
