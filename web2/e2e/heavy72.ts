// web2-72 §0 — **부하 픽스처와 세 자(A·B·C)**. 계측(perf72)과 게이트(gates72)가 **같은 것을
// 쓴다**(#54 — 두 벌 계산 ⛔). 여기 있는 것은 «장면을 세우는 법»과 «재는 법»뿐이고,
// 문턱은 gates72 쪽에 있다.
//
// 픽스처의 정본은 **사람 문서**다(`e2e/fixtures/heavy-paint-01.brnl`). 없으면 합성한다:
//   격자 벽(paint50의 상자 + 벽 안 4×4 격자) → 면 23 · 면마다 칠 획 40(연필·붓·마커 섞어)
//   → 칠 획 ~920. 큰 면은 dpr2에서 2048 단계에 걸린다(gate.clamped가 값으로 말한다).
// ⚠ D-5 — 합성 칠 획은 **사람이 그은 한 획을 복제**해 만든다(uv를 손으로 짓지 않는다):
//   자료의 모양이 앱이 실제로 만드는 그것과 같아야 굽기 경로가 같은 것을 잰다.

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

export async function buildHeavy(page: Page, perFace = 40): Promise<Heavy> {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })

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
    await page.waitForTimeout(1200)
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
  const spots: [number, number][] = []
  for (const cx of [540, 620, 700, 780, 860]) for (const cy of [365, 435, 505, 575, 645]) spots.push([cx, cy])
  for (const [cx, cy] of spots) { await page.mouse.click(cx, cy); await page.waitForTimeout(35) }
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
  for (let k = 0; k < spots.length; k++) {
    const [cx, cy] = spots[k]!
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
  // 문서 판이 갈렸음을 앱에 알린다(칠 텍스처가 다시 선다) — 편집 하나와 같은 통로
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.app.docVersion = (b2.app.docVersion ?? 0) + 1
    b2.diag.invalidate()
  })
  await page.waitForTimeout(500)
  // web2-72 §1 — 굽기가 프레임에 나뉜다: 픽스처가 «다 구워진» 상태에서 재기 시작한다
  // (안 그러면 A의 첫 프레임들이 남은 굽기를 뒤집어쓴다 — 남의 값 · #89).
  await page.waitForFunction(() => !(window as any).__b2.diag.paintBakePendingForTest(), null, { timeout: 120_000 })
  return await summarize(page, 'synthetic')
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

// ── A 돌릴 때 ────────────────────────────────────────────────────────────────────
export interface OrbitOut {
  frames: { n: number; p50: number; p95: number; max: number }
  cost: unknown
  bake: BakeStat
  emptyFrames: number
  durationMs: number
  orbitDeg: number
}

/** 화면을 «사람처럼» 확대한다 — 휠(앱의 그 경로 · #54). 면이 화면에서 커져야 단계가
 *  1024·2048로 올라간다: D-5(픽스처가 실사용 대역을 덮는가)의 그 손잡이다.
 *  ⚠ `app.view.s`를 직접 곱하면 **화면 원점 기준**으로 커져 면이 화면 밖으로 날아간다
 *  (첫 판이 그랬다: 확대 뒤 보이는 칠 면 0). 휠은 커서 자리를 붙잡는다. */
export async function zoomIn(page: Page, steps = 5): Promise<void> {
  await page.mouse.move(700, 480)
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(50) }
  await page.waitForTimeout(400)
  await page.waitForFunction(() => !(window as any).__b2.diag.paintBakePendingForTest(), null, { timeout: 240_000 })
}

/** 한 손가락 궤도 4초(등속) — 프레임마다 같은 각을 돈다. 자는 rAF 사이 간격(사람이 느끼는 그것)이다. */
export async function orbitProbe(page: Page, seconds = 4, degPerSec = 45): Promise<OrbitOut> {
  // 재기 «전»에 굽기가 끝나 있어야 한다(#89 — 초록의 범위: 남은 굽기를 궤도의 값으로 읽지 않는다)
  await page.waitForFunction(() => !(window as any).__b2.diag.paintBakePendingForTest(), null, { timeout: 120_000 })
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.diag.paintBakeReset(); b2.diag.frameCostReset()
  })
  const r = await page.evaluate(async ([sec, dps]) => {
    const b2 = (window as any).__b2
    const gaps: number[] = []
    let empty = 0
    const t0 = performance.now()
    let last = t0
    let deg = 0
    await new Promise<void>((res) => {
      const step = () => {
        const now = performance.now()
        const dt = now - last
        last = now
        gaps.push(dt)
        const d = (dps as number) * dt / 1000
        b2.diag.orbitByForTest(d, 0)
        deg += d
        // «빈 프레임»(칠 면이 흰 채로 그려진 프레임) — 단계 0이거나 캔버스가 없는 항목이
        // 보이는 채로 있으면 그 프레임의 그 면은 비어 있다(§1 「옛 그림을 계속 보인다」의 자).
        for (const e of b2.diag.paintTex() as any[]) if (e.visible && (e.level === 0 || e.w === 0)) { empty++; break }
        if (now - t0 < (sec as number) * 1000) requestAnimationFrame(step)
        else res()
      }
      requestAnimationFrame(step)
    })
    const g = gaps.slice(1).sort((a, b) => a - b)
    const q = (p: number) => g.length ? g[Math.min(g.length - 1, Math.floor(g.length * p))]! : 0
    return {
      frames: { n: g.length, p50: Math.round(q(0.5) * 100) / 100, p95: Math.round(q(0.95) * 100) / 100, max: Math.round(Math.max(...g, 0) * 100) / 100 },
      cost: b2.diag.frameCost(),
      bake: b2.diag.paintBake(),
      emptyFrames: empty,
      durationMs: Math.round(performance.now() - t0),
      orbitDeg: Math.round(deg),
    }
  }, [seconds, degPerSec] as const)
  return r as OrbitOut
}

// ── B 열 때 ─────────────────────────────────────────────────────────────────────
export interface OpenOut {
  firstInteractiveMs: number
  allPaintMs: number
  longestBlockMs: number
  bakes: number
  bakedStrokes: number
  editScans: number
  editScanCalls: number
  restoredStrokes: number
  bareFirstInteractiveMs: number
  bareLongestBlockMs: number
  bareStrokes: number
  boot: { bootAt: number; parseMs: number; applyMs: number; bytes: number; strokes: number }
  bakeMsOnOpen: number
}

/** 새로고침 → ① 첫 상호작용 가능 프레임 ② 칠 전부 보이기 ③ 그 동안의 메인 최장 차단.
 *  ③의 자는 `PerformanceObserver('longtask')`다 — 메인 스레드가 실제로 막힌 구간이 그것이다. */
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
    } catch { /* longtask 미지원 — 값은 0으로 남고 원장이 그것을 말한다 */ }
  })
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2, null, { timeout: 30_000 })
  // ① 첫 상호작용 가능 프레임 — __b2가 서고 rAF가 한 번 돈 시각
  await page.evaluate(async () => {
    const w = window as any
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    w.__p72.interactive = performance.now() - w.__p72.t0
  })
  // ② 칠 전부 보이기 — 보이는 (면,쪽)이 전부 단계 > 0이고 잉크가 선 첫 시각(상한 20초 · #81)
  // ⚠ 자를 «보이는 것»으로 잡으면 안 된다(#105 — 빈 결과 폴백): 아직 안 구운 자리는 «칠 없이»
  //   그려지므로 visible이 거짓이고, 그러면 「보이는 것이 전부 구워졌다」가 첫 프레임부터 참이 된다.
  //   자는 **«보여야 하는 자리»(gateSide)가 전부 구워졌는가 + 이어 구울 것이 없는가**다.
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
  }, null, { timeout: 120_000 })
  const base = await page.evaluate(() => {
    const w = window as any
    const b2 = w.__b2
    return {
      firstInteractiveMs: Math.round(w.__p72.interactive),
      allPaintMs: Math.round(w.__p72.allPaint),
      longestBlockMs: Math.round(w.__p72.long),
      bakes: b2.diag.paintBake().bakes,
      bakedStrokes: b2.diag.paintBake().bakedStrokes,
      restoredStrokes: b2.app.doc.strokes.length,
      boot: b2.diag.bootCost(),                  // web2-72 §0 표식 — 열기 시간의 몫(파싱·앉히기)
      bakeMsOnOpen: Math.round(b2.diag.paintBake().ms),
    }
  })
  // ④의 자 — **편집 한 번**에 훑는 획 수(가설 4). 칠 획 하나를 지웠다 되돌린다.
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
  // ── 대조군(D-3) — **칠을 걷어낸 같은 문서**의 열기. 남은 시간이 칠의 것인지 아닌지를 가른다.
  //   (칠을 지워도 열기가 비슷하면 남은 것은 문서·3D 동기의 몫이고, 이 라운드의 칠 수리로는
  //    더 못 줄인다 — 그 사실을 값으로 남긴다.)
  const bare = await openBare(page)
  return { ...base, ...edit, ...bare }
}

/** 같은 문서에서 **칠 획만 걷어내고** 다시 연다 — 열기 시간의 «칠 몫»을 가르는 대조군. */
async function openBare(page: Page): Promise<{ bareFirstInteractiveMs: number; bareLongestBlockMs: number; bareStrokes: number }> {
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.app.doc.strokes = b2.app.doc.strokes.filter((s: any) => s.paint === undefined)
    b2.app.docVersion = (b2.app.docVersion ?? 0) + 1
    b2.diag.invalidate()
    return b2.diag.storeFlush()
  })
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
export interface MemOut { bytes: number; budget: number; entries: number; visible: number; levels: Record<string, number>; clamped: number }
export async function memProbe(page: Page): Promise<MemOut> {
  return await page.evaluate(() => {
    const b2 = (window as any).__b2
    const bk = b2.diag.paintBake()
    const st = b2.diag.paintTex() as any[]
    const levels: Record<string, number> = {}
    let visible = 0, clamped = 0
    for (const e of st) {
      if (!e.visible) continue
      visible++
      levels[String(e.level)] = (levels[String(e.level)] ?? 0) + 1
      if (e.clamped) clamped++
    }
    return { bytes: bk.bytes, budget: bk.budget, entries: bk.entries, visible, levels, clamped }
  })
}
