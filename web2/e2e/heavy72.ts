// web2-72 §0 — **부하 픽스처와 세 자(A·B·C)**. 계측(perf72)과 게이트(gates72)가 **같은 것을
// 쓴다**(#54 — 두 벌 계산 ⛔). 여기 있는 것은 «장면을 세우는 법»과 «재는 법»뿐이고,
// 문턱은 gates72 쪽에 있다.
//
// 픽스처의 정본은 **사람 문서**다(`e2e/fixtures/heavy-paint-01.brnl`). 없으면 합성한다:
//   격자 벽(paint50의 상자 + 벽 안 4×4 격자) → 면 23 · 면마다 칠 획 40(연필·붓·마커 섞어)
//   → 칠 획 ~920.
// ⚠ D-5 — 합성 칠 획은 **사람이 그은 한 획을 복제**해 만든다(uv를 손으로 짓지 않는다):
//   자료의 모양이 앱이 실제로 만드는 그것과 같아야 굽기 경로가 같은 것을 잰다.
//
// ⚠⚠ **궤도는 «각»으로 몬다**(리뷰어 [H3]). 첫 판은 프레임마다 `각속도 × dt`를 돌려서
//   **느린 트리가 더 많이 돌았다**(수리 전 7,857ms·354° / 수리 후 4,047ms·182°) — 그러면
//   「4초에 프레임 몇 개」도 「굽기 몇 회」도 같은 조건의 짝이 아니다. 지금은 **고정 걸음 ×
//   고정 각**이라 두 판이 «같은 각을 같은 걸음으로» 돌고, 견주는 것은 그 각을 도는 데 든
//   시간·프레임·굽기다.

import { expect, type Page } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const HUMAN_FIXTURE = 'fixtures/heavy-paint-01.brnl'
export const humanFixturePath = (): string | null => {
  const p = resolve(HERE, HUMAN_FIXTURE)
  return existsSync(p) ? p : null
}

export interface Heavy {
  source: 'human' | 'synthetic'
  faces: number
  docStrokes: number
  paintStrokes: number
  texEntries: number
  clampedFaces: number
  levels: Record<string, number>
}

export interface BakeStat {
  bakes: number; bakedStrokes: number; appends: number; appendStrokes: number
  handoverStrokes: number; uploads: number; uploadBytes: number; ms: number
  drops: number; rebuilds: number; syncs: number; evicts: number; texReallocs: number
  scans: number; scanCalls: number
  sigChange: { lv: number; texelQ: number; fam: number; hatch: number; rep: number; box: number; doc: number }
  levelUp: number; levelDown: number
  frozenFrames: number; allocDowns: number; allocBytes: number; deferred: number; sliced: number
  indexRebuilds: number; indexScans: number
  entries: number; bytes: number; budget: number
}

/** ⚠ `?reset`은 **비동기로 `location.replace`**를 부른다(main.ts — 워커·캐시를 지운 뒤 매개를
 *  떼고 다시 연다). 그 항해가 오기 «전»에 긴 evaluate를 시작하면 실행 맥락이 부서진다. */
export async function bootReset(page: Page): Promise<void> {
  await page.goto('/?reset')
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(200)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
}

/** 이어 구울 것이 없어질 때까지(고정 ms 대기 ⛔ · **상한 있는 대기** #81).
 *  ⚠ 상한에 닿으면 **던지지 않고 그 사실을 값으로 남긴다**(#105 — 조용한 폴백 ⛔):
 *  `settleTimeouts`가 0이 아니면 그 실행의 값은 «다 구워진 상태»가 아니다. 원장이 그것을 말한다. */
export const settleStat: { timeouts: number; lastStage: string; rows: unknown } = { timeouts: 0, lastStage: '', rows: null }
export async function settleBake(page: Page, ms = 300, stage = ''): Promise<void> {
  await page.waitForTimeout(ms)
  try {
    await page.waitForFunction(() => !(window as any).__b2.diag.paintBakePendingForTest(), null, { timeout: 90_000 })
  } catch {
    settleStat.timeouts++
    settleStat.lastStage = stage
    settleStat.rows = await page.evaluate(() => ({
      rows: (window as any).__b2.diag.paintPendingRowsForTest(),
      bake: (window as any).__b2.diag.paintBake(),
    }))
  }
}

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 3 })
  await page.mouse.move(x1, y1, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(30)
}

/** 칠 한 붓 — 면 위 짧은 획(pointer · 제품 경로 그대로) */
async function paintStroke(page: Page, x0: number, y0: number, len = 34) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + len * 0.5, y0 + 5, { steps: 2 })
  await page.mouse.move(x0 + len, y0 + 9, { steps: 2 })
  await page.mouse.up()
  await page.waitForTimeout(25)
}

/** 격자 칸의 중심들(면 만들기·칠의 자리 — 두 곳이 같은 목록을 쓴다 #54) */
const SPOTS: [number, number][] = (() => {
  const out: [number, number][] = []
  for (const cx of [540, 620, 700, 780, 860]) for (const cy of [365, 435, 505, 575, 645]) out.push([cx, cy])
  return out
})()

export async function buildHeavy(page: Page, perFace = 40): Promise<Heavy> {
  await bootReset(page)

  const human = humanFixturePath()
  if (human) {
    const text = readFileSync(human, 'utf8')
    const ok = await page.evaluate((t) => {
      const b2 = (window as any).__b2
      const r = b2.diag.readBrnlForTest(t)
      if (!r.data) return false
      b2.diag.applyDoc(r.data)
      b2.diag.invalidate()
      return true
    }, text)
    expect(ok, '사람 문서를 열었다').toBe(true)
    await settleBake(page, 1200, 'buildHeavy/human')
    return await summarize(page, 'human')
  }

  // ── 합성 ①: paint50의 상자 + 벽 안 격자 ────────────────────────────────────────
  for (const l of [[60, 620, 1140, 620], [500, 700, 900, 610], [500, 700, 150, 620], [900, 610, 640, 560],
    [150, 620, 640, 560], [500, 700, 500, 330], [900, 610, 900, 330], [900, 330, 500, 330]] as const)
    await drawLine(page, l[0], l[1], l[2], l[3])
  await page.evaluate(() => (window as any).__b2.diag.setDimForTest((window as any).__b2.app.doc.strokes[5].id, 2500))
  for (const x of [580, 660, 740, 820]) await drawLine(page, x, 335, x, 690)
  for (const y of [400, 470, 540, 610]) await drawLine(page, 505, y, 895, y)
  // ── 합성 ②: 칸마다 면 ────────────────────────────────────────────────────────
  await page.click('#btn-face')
  for (const [cx, cy] of SPOTS) { await page.mouse.click(cx, cy); await page.waitForTimeout(35) }
  const faces = await page.evaluate(() => (window as any).__b2.app.faces.length as number)
  expect(faces, '격자 면이 섰다(#103)').toBeGreaterThanOrEqual(16)

  // ── 합성 ③: 칸마다 «사람의 한 붓» — 도구를 섞는다(연필·붓·마커) ───────────────────
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    Object.assign(b2.app.paintSel, { hex: '#7a4a3a', w: 14, o: 1 })
  })
  await page.click('#btn-paint')
  await page.waitForTimeout(60)
  const INSTR = ['pencil', 'brush', 'marker'] as const
  for (let k = 0; k < SPOTS.length; k++) {
    const [cx, cy] = SPOTS[k]!
    await page.evaluate((i) => {
      const b2 = (window as any).__b2
      b2.diag.setPaintInstrForTest(i)
      Object.assign(b2.app.paintSel, { hex: '#7a4a3a', w: 14, o: 1 })
    }, INSTR[k % 3])
    await paintStroke(page, cx - 24, cy - 10)
  }
  // ── 합성 ④: 그 한 붓을 **복제**해 면마다 perFace개로 불린다(uv를 손으로 짓지 않는다) ──
  const cloned = await page.evaluate((n) => {
    const b2 = (window as any).__b2
    const app = b2.app
    const seeds = app.doc.strokes.filter((s: any) => s.paint?.uv && s.paint.uv.length >= 4)
    const out: any[] = []
    for (const s of seeds) {
      const uv: number[] = s.paint.uv
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (let i = 0; i + 1 < uv.length; i += 2) {
        u0 = Math.min(u0, uv[i]!); u1 = Math.max(u1, uv[i]!)
        v0 = Math.min(v0, uv[i + 1]!); v1 = Math.max(v1, uv[i + 1]!)
      }
      const du = Math.max(1e-6, u1 - u0), dv = Math.max(1e-6, v1 - v0)
      for (let k = 1; k < n; k++) {
        const gx = (k % 8) - 3.5, gy = Math.floor(k / 8) - 2
        const nu = uv.slice()
        for (let i = 0; i + 1 < nu.length; i += 2) { nu[i] = nu[i]! + gx * du * 0.55; nu[i + 1] = nu[i + 1]! + gy * dv * 1.15 }
        out.push({ ...s, id: 0, paint: { ...s.paint, uv: nu } })
      }
    }
    for (const c of out) { c.id = app.nextId++; app.doc.strokes.push(c) }
    b2.diag.invalidate()
    return out.length
  }, perFace)
  expect(cloned, '복제 칠 획이 섰다').toBeGreaterThan(0)
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.app.docVersion = (b2.app.docVersion ?? 0) + 1
    b2.diag.invalidate()
  })
  // 굽기가 «다 끝난» 상태에서 재기 시작한다(#89 — 남은 굽기를 남의 값으로 읽지 않는다)
  await settleBake(page, 500, 'buildHeavy/synthetic')
  return await summarize(page, 'synthetic')
}

/** 지금 문서에서 **칠 획만 걷어낸다** — A·B의 대조군(남은 시간이 칠의 것인지 가른다) */
export async function stripPaint(page: Page): Promise<number> {
  const n = await page.evaluate(() => {
    const b2 = (window as any).__b2
    const before = b2.app.doc.strokes.length
    b2.app.doc.strokes = b2.app.doc.strokes.filter((s: any) => s.paint === undefined)
    b2.app.docVersion = (b2.app.docVersion ?? 0) + 1
    b2.diag.invalidate()
    return before - b2.app.doc.strokes.length
  })
  await settleBake(page, 300, 'stripPaint')
  return n
}

/** web2-72 반증 스위치 셋을 한꺼번에 — **켜면 «수리 전»의 거동**이다(동결·분할·색인 끔).
 *  같은 트리·같은 픽스처·같은 프로브의 대조군이라 트리를 건너뛰는 비교보다 낫다(리뷰어 [H3]). */
export async function setLegacy(page: Page, on: boolean): Promise<void> {
  await page.evaluate((v) => { (window as any).__b2.diag.setLegacy72ForTest(v) }, on)
  await settleBake(page, 400, 'setLegacy')
}

async function summarize(page: Page, source: 'human' | 'synthetic'): Promise<Heavy> {
  return await page.evaluate((src) => {
    const b2 = (window as any).__b2
    const st = b2.diag.paintTex() as any[]
    const levels: Record<string, number> = {}
    let clamped = 0
    for (const e of st) {
      const lv = String(e.level ?? 0)
      levels[lv] = (levels[lv] ?? 0) + 1
      if (e.clamped) clamped++
    }
    return {
      source: src,
      faces: b2.app.faces.length,
      docStrokes: b2.app.doc.strokes.length,
      paintStrokes: b2.app.doc.strokes.filter((s: any) => s.paint?.uv && s.paint.uv.length >= 4).length,
      texEntries: b2.diag.paintBake().entries,
      clampedFaces: clamped,
      levels,
    }
  }, source)
}

/** 카메라를 그대로 떠 두고 되돌린다 — **세 팔이 같은 카메라에서 출발해야** 궤도가 견줘진다.
 *  (휠로 되돌리면 걸음이 안 맞아 다른 자리에 선다: 첫 판이 그래서 legacy 팔을 ×10.9까지 밀어
 *  면을 화면 밖으로 내보냈다. 카메라는 값이므로 값으로 되돌린다.) */
export async function snapshotCamera(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const a = (window as any).__b2.app
    return { pose: JSON.parse(JSON.stringify(a.pose)), view: { ...a.view }, viewF: a.viewF ?? null }
  })
}
export async function restoreCamera(page: Page, snap: unknown): Promise<void> {
  await page.evaluate((sn: any) => {
    const b2 = (window as any).__b2
    b2.app.pose = JSON.parse(JSON.stringify(sn.pose))
    b2.app.view = { ...sn.view }
    b2.app.viewF = sn.viewF
    b2.diag.invalidate()
  }, snap)
  await settleBake(page, 300, 'restoreCamera')
}

/** 화면을 «사람처럼» 확대한다 — 휠(앱의 그 경로 · #54). **목표 단계에 닿을 때까지** 돈다:
 *  고정 걸음이면 판마다 다른 단계에서 멈춰 비교가 안 선다(리뷰어 [H4]). */
export async function zoomToLevel(page: Page, minLevel = 512, maxSteps = 24): Promise<{ steps: number; maxLevel: number }> {
  await page.mouse.move(700, 480)
  let steps = 0
  let maxLevel = 0
  for (; steps < maxSteps; steps++) {
    maxLevel = await page.evaluate(() => Math.max(0, ...((window as any).__b2.diag.paintTex() as any[]).filter(e => e.visible).map(e => e.level)))
    if (maxLevel >= minLevel) break
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(280)                    // 동결 창(150ms)을 넘긴다 — 단계가 따라온다
    await page.waitForFunction(() => !(window as any).__b2.diag.paintBakePendingForTest(), null, { timeout: 240_000 })
  }
  await settleBake(page, 400, 'zoomToLevel')
  maxLevel = await page.evaluate(() => Math.max(0, ...((window as any).__b2.diag.paintTex() as any[]).filter(e => e.visible).map(e => e.level)))
  return { steps, maxLevel }
}

// ── A 돌릴 때 ────────────────────────────────────────────────────────────────────
export interface OrbitOut {
  frames: { n: number; p50: number; p95: number; max: number }
  fps: number
  steps: number
  degPerStep: number
  /** 실제로 돈 각(포즈에서 잰 값 — 몸짓이 얼마나 돌렸나) */
  totalDeg: number
  /** 화면에서 끈 거리(px — 두 팔이 같은 몸짓을 했다는 값) */
  pxDragged: number
  durationMs: number
  longestBlockMs: number
  cost: unknown
  bake: BakeStat
  emptyFrames: number
}

/** 한 손가락 궤도 — **사람의 경로 그대로**(가운데 단추 끌기 · 앱의 그 제스처 · #54).
 *  고정 걸음 × 고정 px라 두 팔이 **같은 몸짓**을 한다. 돈 각은 포즈에서 재서 값으로 낸다.
 *
 *  ⚠⚠ **왜 `orbitByForTest`를 안 쓰는가**(실측이 잡았다): 그 통로로 3°씩 120번 부르면
 *  **첫 번째만 남고 나머지는 자동 수평이 되접는다**(포즈 q가 120번 뒤에도 한 걸음 자리에
 *  있었다 — 그래서 화면 크기가 800에서 안 움직였고 «궤도 중 굽기 0»이 수리 전 판에서도
 *  나왔다: 반증이 아무것도 안 재는 상태 #108). 사람의 끌기는 그 되접기를 안 받는다.
 *  자는 rAF 사이 간격과 «메인 최장 차단»(longtask)이다. */
export async function orbitProbe(page: Page, steps = 120, pxPerStep = 6, capMs = 240_000): Promise<OrbitOut> {
  await settleBake(page, 200, 'orbitProbe')
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.paintBakeReset(); b2.diag.frameCostReset()
  })
  return await page.evaluate(async ([nSteps, per, cap]) => {
    const b2 = (window as any).__b2
    const el = document.getElementById('ink')!
    const r = el.getBoundingClientRect()
    const fire = (t: string, x: number, y: number, buttons: number, button: number) =>
      el.dispatchEvent(new PointerEvent(t, {
        pointerId: 7, pointerType: 'mouse', isPrimary: true, buttons, button,
        clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true,
      }))
    const qOf = () => { const q = b2.app.pose.q; return { x: q.x, y: q.y, z: q.z, w: q.w } }
    const angBetween = (a: any, c: any) => {
      const d = Math.abs(a.x * c.x + a.y * c.y + a.z * c.z + a.w * c.w)
      return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI
    }
    const gaps: number[] = []
    let empty = 0
    let longest = 0
    let po: PerformanceObserver | null = null
    try {
      po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longest = Math.max(longest, e.duration) })
      po.observe({ entryTypes: ['longtask'] })
    } catch { /* longtask 미지원 — 0으로 남고 원장이 그것을 말한다 */ }
    const q0 = qOf()
    const X0 = 220, Y0 = 400
    const t0 = performance.now()
    let last = t0
    let done = 0
    fire('pointerdown', X0, Y0, 4, 1)
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    await new Promise<void>((res) => {
      const step = () => {
        const now = performance.now()
        if (done > 0) gaps.push(now - last)
        last = now
        done++
        fire('pointermove', X0 + done * (per as number), Y0 + done * ((per as number) / 6), 4, -1)
        for (const e of b2.diag.paintTex() as any[]) if (e.visible && (e.level === 0 || e.w === 0)) { empty++; break }
        if (done < (nSteps as number) && performance.now() - t0 < (cap as number)) requestAnimationFrame(step)
        else res()
      }
      requestAnimationFrame(step)
    })
    fire('pointerup', X0 + done * (per as number), Y0 + done * ((per as number) / 6), 0, 1)
    po?.disconnect()
    const g = gaps.slice().sort((a, b) => a - b)
    const q = (p: number) => g.length ? g[Math.min(g.length - 1, Math.floor(g.length * p))]! : 0
    const durationMs = performance.now() - t0
    return {
      frames: { n: g.length, p50: Math.round(q(0.5) * 100) / 100, p95: Math.round(q(0.95) * 100) / 100, max: Math.round(Math.max(...g, 0) * 100) / 100 },
      fps: Math.round((done / Math.max(1e-6, durationMs / 1000)) * 100) / 100,
      steps: done,
      degPerStep: 0,
      totalDeg: Math.round(angBetween(q0, qOf()) * 10) / 10,
      pxDragged: done * (per as number),
      durationMs: Math.round(durationMs),
      longestBlockMs: Math.round(longest),
      cost: b2.diag.frameCost(),
      bake: b2.diag.paintBake(),
      emptyFrames: empty,
    }
  }, [steps, pxPerStep, capMs] as const) as OrbitOut
}

// ── B 열 때 ─────────────────────────────────────────────────────────────────────
export interface OpenOut {
  firstInteractiveMs: number
  allPaintMs: number
  longestBlockMs: number
  bakes: number
  bakedStrokes: number
  bakeMsOnOpen: number
  boot: { bootAt: number; parseMs: number; applyMs: number; bytes: number; strokes: number }
  editScans: number
  editScanCalls: number
  restoredStrokes: number
  bareFirstInteractiveMs: number
  bareLongestBlockMs: number
  bareStrokes: number
}

export async function openProbe(page: Page): Promise<OpenOut> {
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(400)
  await page.addInitScript(() => {
    const w = window as any
    w.__p72 = { t0: performance.now(), long: 0, interactive: 0, allPaint: 0 }
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__p72.long = Math.max(w.__p72.long, e.duration)
      }).observe({ entryTypes: ['longtask'] })
    } catch { /* longtask 미지원 */ }
  })
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2, null, { timeout: 30_000 })
  await page.evaluate(async () => {
    const w = window as any
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    w.__p72.interactive = performance.now() - w.__p72.t0
  })
  // ⚠ 자를 «보이는 것»으로 잡으면 안 된다(#105): 아직 안 구운 자리는 «칠 없이» 그려져
  //   visible이 거짓이라 「보이는 것이 전부 구워졌다」가 첫 프레임부터 참이 된다.
  await page.waitForFunction(() => {
    const w = window as any
    const b2 = w.__b2
    const es = b2.diag.paintTex() as any[]
    if (es.length === 0) return false
    const want = es.filter((e: any) => e.gateSide !== false)
    if (want.length === 0) return false
    const ok = want.every((e: any) => e.level > 0 && e.w > 0) && !b2.diag.paintBakePendingForTest()
    if (ok && w.__p72.allPaint === 0) w.__p72.allPaint = performance.now() - w.__p72.t0
    return ok
  }, null, { timeout: 240_000 })
  const base = await page.evaluate(() => {
    const w = window as any
    const b2 = w.__b2
    const bk = b2.diag.paintBake()
    return {
      firstInteractiveMs: Math.round(w.__p72.interactive),
      allPaintMs: Math.round(w.__p72.allPaint),
      longestBlockMs: Math.round(w.__p72.long),
      bakes: bk.bakes,
      bakedStrokes: bk.bakedStrokes,
      bakeMsOnOpen: Math.round(bk.ms),
      boot: b2.diag.bootCost(),
      restoredStrokes: b2.app.doc.strokes.length,
    }
  })
  // ④의 자 — **편집 한 번**에 훑는 획 수(가설 4). 칠 획 하나를 지운다.
  const edit = await page.evaluate(async () => {
    const b2 = (window as any).__b2
    b2.diag.paintBakeReset()
    const app = b2.app
    const i = app.doc.strokes.findIndex((s: any) => s.paint?.uv)
    if (i >= 0) app.doc.strokes.splice(i, 1)
    app.docVersion = (app.docVersion ?? 0) + 1
    b2.diag.invalidate()
    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
    const st = b2.diag.paintBake()
    return { editScans: st.scans, editScanCalls: st.scanCalls }
  })
  const bare = await openBare(page)
  return { ...base, ...edit, ...bare }
}

/** 같은 문서에서 **칠 획만 걷어내고** 다시 연다 — 열기 시간의 «칠 몫»을 가르는 대조군. */
async function openBare(page: Page): Promise<{ bareFirstInteractiveMs: number; bareLongestBlockMs: number; bareStrokes: number }> {
  await stripPaint(page)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(600)
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2, null, { timeout: 30_000 })
  return await page.evaluate(async () => {
    const w = window as any
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    return {
      bareFirstInteractiveMs: Math.round(performance.now() - w.__p72.t0),
      bareLongestBlockMs: Math.round(w.__p72.long),
      bareStrokes: w.__b2.app.doc.strokes.length,
    }
  })
}

// ── C 메모리 ─────────────────────────────────────────────────────────────────────
export interface MemRow { key: string; level: number; screenPx: number | null; want: number | null; texelPerPx: number | null }
export interface MemOut {
  bytes: number; budget: number; entries: number; visible: number
  levels: Record<string, number>; clamped: number
  /** ⛳ 자리마다 «요구 단계»와 «실제 단계» — 「메모리가 적다」와 「줌이 안 걸렸다」를 가른다(리뷰어 [H4]) */
  rows: MemRow[]
  /** 히스테리시스 대역 밖(실제 < 요구/2)인 자리 수 — 「멈춘 뒤에는 맞는 단계다」의 자(리뷰어 [H5]) */
  outOfBand: number
}
export async function memProbe(page: Page): Promise<MemOut> {
  return await page.evaluate(() => {
    const b2 = (window as any).__b2
    const bk = b2.diag.paintBake()
    const st = b2.diag.paintTex() as any[]
    const levels: Record<string, number> = {}
    const rows: MemRow[] = []
    let visible = 0, clamped = 0, outOfBand = 0
    for (const e of st) {
      if (!e.visible) continue
      visible++
      levels[String(e.level)] = (levels[String(e.level)] ?? 0) + 1
      if (e.clamped) clamped++
      const want = e.want ?? null
      rows.push({
        key: e.key, level: e.level, screenPx: e.screenPx ?? null, want,
        texelPerPx: e.screenPx ? Math.round((e.level / e.screenPx) * 1000) / 1000 : null,
      })
      if (want !== null && e.level < want / 2) outOfBand++
    }
    return { bytes: bk.bytes, budget: bk.budget, entries: bk.entries, visible, levels, clamped, rows, outOfBand }
  }) as unknown as MemOut
}
