// web2-73 — **벽이 무엇인지 재는 자** 둘: §1 네 팔(같은 카메라·같은 몸짓으로 문서를 단계별로 걷는다) ·
// §2 열기 분해(「칠 전부 채워지기」를 네 몫으로). 픽스처·궤도·카메라 값은 heavy72의 것을 **그대로**
// 쓴다(#54 — 두 벌 계산 ⛔). 여기 있는 것은 «걷는 법»과 «가르는 법»뿐이고, 문턱은 gates73 쪽에 있다.
//
// ⚠ 이 라운드는 «재는» 라운드다(지시 머리말) — 성능 코드를 안 고친다. 여기서 부르는 앱 손잡이는 전부
//   계측·시험용(ForTest)이고 기본 거동은 한 자도 안 바뀐다.
//
// ⚠⚠ CLOSING 「게이트의 조건」 — 프로브는 자기가 «움직였다»를 먼저 증명한다: 궤도는 totalDeg(포즈에서 잰 각) ·
//   열기는 프레임 수. 그 값이 0이면 그 실행의 다른 숫자는 버린다(스펙이 그 자리에서 판정한다).

import { type Page } from '@playwright/test'
import { buildHeavy, orbitProbe, stripPaint, settleBake, snapshotCamera, restoreCamera, zoomToLevel, type OrbitOut, type Heavy } from './heavy72'

export type ArmName = '①빈' | '②선만' | '③면까지' | '④칠까지'
export interface DocCount { docStrokes: number; paintStrokes: number; faces: number; texEntries: number; r3d: { faceMeshes: number; paintMeshes: number; lines: number } }
export interface ArmOut extends DocCount { arm: ArmName; orbit: OrbitOut }

export async function countDoc(page: Page): Promise<DocCount> {
  return await page.evaluate(() => {
    const b2 = (window as any).__b2
    const info = b2.diag.r3dInfo()
    return {
      docStrokes: b2.app.doc.strokes.length,
      paintStrokes: b2.app.doc.strokes.filter((s: any) => s.paint?.uv && s.paint.uv.length >= 4).length,
      faces: b2.app.faces.length,
      texEntries: b2.diag.paintBake().entries,
      r3d: { faceMeshes: info.faceMeshes, paintMeshes: info.paintMeshes, lines: info.lines },
    }
  }) as DocCount
}

/** 면을 걷는다 — 정본(doc.faces)을 비우고 파생(app.faces)을 다시 세운다(recompute · 앱의 그 함수). */
export async function removeFaces(page: Page): Promise<void> {
  await page.evaluate(() => {
    const b2 = (window as any).__b2
    b2.app.doc.faces = []
    b2.app.docVersion = (b2.app.docVersion ?? 0) + 1
    b2.diag.bumpDocForTest()
  })
  await settleBake(page, 300, 'removeFaces')
}

/** 전부 비운다 — 화면의 「새로 시작」과 같은 함수(clearAll). */
export async function emptyDoc(page: Page): Promise<void> {
  await page.evaluate(() => { (window as any).__b2.diag.clearAllForTest() })
  await settleBake(page, 300, 'emptyDoc')
}

export interface FourArms {
  built: Heavy
  zoom: { steps: number; maxLevel: number }
  strippedPaint: number
  gl: unknown
  arms: Record<ArmName, ArmOut>
}

/** §1-1 네 팔 — **같은 실행 안에서, 같은 카메라·같은 몸짓**(72의 그 걸음 — 가운데 단추 끌기 720px).
 *  ④ → ③ → ② → ① 순으로 «걷어 낸다»(더하는 순이면 팔마다 카메라를 새로 잡아야 한다 — 72 [H4]의 그 결함).
 *  카메라는 ④에서 값으로 떠 두고 팔마다 값으로 되돌린다. */
export async function fourArms(page: Page, perFace = 40): Promise<FourArms> {
  const built = await buildHeavy(page, perFace)
  const zoom = await zoomToLevel(page, 512)
  const cam = await snapshotCamera(page)
  const gl = await page.evaluate(() => (window as any).__b2.diag.glInfo())
  const arm = async (name: ArmName): Promise<ArmOut> => {
    await restoreCamera(page, cam)
    const c = await countDoc(page)
    // ① 빈 팔은 카메라가 없어 끌기가 포즈를 못 돌린다(첫 실행 실측: 0° · render3d 프레임 0 — 아무것도 안 잰 팔).
    // 같은 몸짓을 하되 프레임마다 invalidate로 빈 장면을 실제로 그린다 — 움직임의 증명은 이 팔에서만 «프레임 수»다.
    const orbit = await orbitProbe(page, 120, 6, 240_000, { invalidateEachFrame: name === '①빈' })
    return { arm: name, ...c, orbit }
  }
  const a4 = await arm('④칠까지')
  const strippedPaint = await stripPaint(page)          // ③ = 72의 bare와 같은 자리
  const a3 = await arm('③면까지')
  await removeFaces(page)                               // ② 선만(칠 0 · 면 0)
  const a2 = await arm('②선만')
  await emptyDoc(page)                                  // ① 빈 문서(획 0)
  const a1 = await arm('①빈')
  return { built, zoom, strippedPaint, gl, arms: { '①빈': a1, '②선만': a2, '③면까지': a3, '④칠까지': a4 } }
}

// ── §2 열기 분해 ──────────────────────────────────────────────────────────────────
export interface Open73 {
  idleMs: number | null
  firstInteractiveMs: number
  allPaintMs: number
  longestBlockMs: number
  longtaskSupported: boolean
  /** 고리 장부(main.frame) — 프레임 수·그린 프레임·칠만 이어 구운 프레임·일한 ms·논 ms */
  loop: { frames: number; drawFrames: number; bakeFrames: number; workMs: number; gapMs: number; maxGapMs: number; firstFrameAt: number; firstFrameEndAt: number; lastEndAt: number }
  /** 네 몫(ms) — 굽기 CPU(bakeFaceTex·appendMarkOnTex 안) · 업로드(GL 호출 시간) · 분할 대기(프레임 사이에 논 시간) · 그 밖 */
  parts: { bake_ms: number; upload_ms: number; wait_ms: number; other_ms: number; wall_ms: number; sum_ms: number
    /** 그 밖의 속 — 부팅(첫 프레임 전) · 프레임 안의 나머지(걸음 중 굽기·업로드가 아닌 것) */
    other_boot_ms: number; other_frame_ms: number
    pct: { bake: number; upload: number; wait: number; other: number } }
  /** 독립된 자 둘의 대조(자기참조 ⛔ · §5.1 유형 3): 장부가 셈한 것(부팅 전 + 일한 + 논) ÷ 벽시계 · render3d 걸음 합 ÷ 고리 일한 시간 · rAF 관찰자의 간격 합 ÷ 벽시계 */
  check: { accounted_ms: number; accounted_over_wall: number; steps_total_ms: number; steps_over_work: number; raf_ticks: number; raf_gap_sum_ms: number; raf_over_wall: number; bake_plus_upload_over_work: number }
  steps: unknown
  upload: { calls: number; ms: number; maxMs: number; byName: Record<string, number> }
  bake: { bakes: number; bakedStrokes: number; sliced: number; deferred: number; uploads: number; uploadBytes: number; ms: number }
  boot: unknown
  restoredStrokes: number
  /** 칠만 이어 구운 프레임 하나의 평균 ms(그 밖의 «프레임 고정 비용»의 자) */
  bake_frame_avg_ms: number
}

/** 새로고침마다 서는 관찰자 — 한 번만 단다(addInitScript는 누적된다). */
export async function installOpenProbe73(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any
    w.__p73 = { t0: performance.now(), long: 0, longSupported: false, ticks: 0, gapSum: 0, maxGap: 0, last: -1, interactive: 0, allPaint: 0 }
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__p73.long = Math.max(w.__p73.long, e.duration) }).observe({ entryTypes: ['longtask'] })
      w.__p73.longSupported = true
    } catch { /* longtask 미지원 */ }
    const tick = () => {
      const now = performance.now()
      if (w.__p73.last >= 0) { const g = now - w.__p73.last; w.__p73.gapSum += g; if (g > w.__p73.maxGap) w.__p73.maxGap = g }
      w.__p73.last = now
      w.__p73.ticks++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** 「칠 전부 채워지기」를 네 몫으로 — 예산(idleMs · null이면 C 그대로)마다 다시 연다.
 *  ⚠ 자를 «보이는 것»으로 잡지 않는다(#105 · 72의 그 줄 그대로). */
export async function openProbe73(page: Page, idleMs: number | null, stage: string): Promise<Open73> {
  await page.evaluate((v) => { (window as any).__b2.diag.setPaintBakeIdleMsForTest(v) }, idleMs)
  await page.evaluate(() => (window as any).__b2.diag.storeFlush())
  await page.waitForTimeout(400)
  await page.reload()
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2, null, { timeout: 30_000 })
  await page.evaluate(async () => {
    const w = window as any
    await new Promise<void>(res => requestAnimationFrame(() => res()))
    w.__p73.interactive = performance.now() - w.__p73.t0
  })
  await page.waitForFunction(() => {
    const w = window as any
    const b2 = w.__b2
    const es = b2.diag.paintTex() as any[]
    if (es.length === 0) return false
    const want = es.filter((e: any) => e.gateSide !== false)
    if (want.length === 0) return false
    const ok = want.every((e: any) => e.level > 0 && e.w > 0) && !b2.diag.paintBakePendingForTest()
    if (ok && w.__p73.allPaint === 0) w.__p73.allPaint = performance.now() - w.__p73.t0
    return ok
  }, null, { timeout: 240_000 })
  const out = await page.evaluate((stage) => {
    const w = window as any
    const b2 = w.__b2
    const loop = b2.diag.frameLoop()
    const bk = b2.diag.paintBake()
    const up = b2.diag.glUpload()
    const st = b2.diag.frameSteps()
    const wall = w.__p73.allPaint as number
    const bake = bk.ms as number
    const upload = up.ms as number
    const preFrame = Math.max(0, loop.firstFrameAt - w.__p73.t0)
    const wait = loop.gapMs as number
    const other = wall - bake - upload - wait
    const otherFrame = Math.max(0, loop.workMs - bake - upload)
    const r1 = (x: number) => Math.round(x * 10) / 10
    const pct = (x: number) => Math.round((x / Math.max(1e-9, wall)) * 1000) / 10
    const accounted = preFrame + loop.workMs + loop.gapMs
    return {
      idleMs: b2.diag.paintBakeIdleMsForTest(),
      firstInteractiveMs: Math.round(w.__p73.interactive),
      allPaintMs: Math.round(wall),
      longestBlockMs: Math.round(w.__p73.long),
      longtaskSupported: w.__p73.longSupported,
      loop: { ...loop, workMs: r1(loop.workMs), gapMs: r1(loop.gapMs), maxGapMs: r1(loop.maxGapMs) },
      parts: {
        bake_ms: r1(bake), upload_ms: r1(upload), wait_ms: r1(wait), other_ms: r1(other), wall_ms: r1(wall), sum_ms: r1(bake + upload + wait + other),
        other_boot_ms: r1(preFrame), other_frame_ms: r1(otherFrame),
        pct: { bake: pct(bake), upload: pct(upload), wait: pct(wait), other: pct(other) },
      },
      check: {
        accounted_ms: r1(accounted), accounted_over_wall: Math.round((accounted / Math.max(1e-9, wall)) * 1000) / 1000,
        steps_total_ms: r1(st.steps.total.sum), steps_over_work: Math.round((st.steps.total.sum / Math.max(1e-9, loop.workMs)) * 1000) / 1000,
        raf_ticks: w.__p73.ticks, raf_gap_sum_ms: r1(w.__p73.gapSum), raf_over_wall: Math.round((w.__p73.gapSum / Math.max(1e-9, wall)) * 1000) / 1000,
        bake_plus_upload_over_work: Math.round(((bake + upload) / Math.max(1e-9, loop.workMs)) * 1000) / 1000,
      },
      steps: st,
      upload: up,
      bake: { bakes: bk.bakes, bakedStrokes: bk.bakedStrokes, sliced: bk.sliced, deferred: bk.deferred, uploads: bk.uploads, uploadBytes: bk.uploadBytes, ms: r1(bk.ms) },
      boot: b2.diag.bootCost(),
      restoredStrokes: b2.app.doc.strokes.length,
      bake_frame_avg_ms: loop.bakeFrames > 0 ? r1(loop.workMs / loop.frames) : 0,
      stage,
    }
  }, stage)
  return out as Open73
}
