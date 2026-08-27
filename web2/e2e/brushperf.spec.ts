// web2-11 2-f — 무게를 «성능»이 아니라 «느낌»으로 잰다: 사람이 「이건 왜 이상하지」 할 때
// 원인을 찾는 도구다. 수치가 좋다고 「통과」라 적지 않는다(지시 문면 — 판정자는 사람 손).
//
// 2차 리뷰어 대응으로 재설계된 하네스다:
// - [3] 반복(5회)·min/median/max — 실행 간 변동(±55% 관측)이 결론을 못 덮게 분산을 원장에.
// - [2] 다운→다음 그리기 기회: rAF 콜백의 performance.now() − 다운 시각(음수 불가).
//   ⚠ 이것은 «렌더러 지연»이 아니라 **vsync 위상 + 그 프레임의 그리기**다 — 원장에 그렇게
//   정의한다(실기기 «첫 픽셀»의 대용 하한이지 등가가 아니다).
// - [5] 판별력: 그리는 중(캐시 히트 — 두 렌더러 같아야 정상)과 **궤도 중**(포즈가 프레임마다
//   캐시를 깨 brush가 전량 재그리기 — 여기서 갈려야 지표가 산 것)을 다 잰다. 재그리기는
//   산문이 아니라 분자/분모 카운터다(brushStats — #43).
// - [6] 힙은 원 바이트(반올림 없음) — GPU/텍스처 메모리는 JS에서 **못 잰다**(미측정 명기).
//
// ⚠ 헤드리스 크로뮴 + 소프트웨어 GL의 수다 — 실기기(120Hz·모바일 GPU)의 절대값이 아니다.
// 판별력은 «두 렌더러의 비», «획 수·국면에 따른 변화»에 있다(환경이 양쪽에 같이 걸린다).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawMouse(page: Page, ax: number, ay: number, bx: number, by: number, steps = 24) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) await page.mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
  await page.mouse.up()
  await settle(page)
}

/** rAF 간격·다운→다음 그리기 기회 수집기 — 페이지에 한 번 심는다 */
async function installCollector(page: Page) {
  await page.evaluate(() => {
    const S: any = ((window as any).__fs = { deltas: [], downAt: 0, firstPaint: 0, on: false })
    window.addEventListener('pointerdown', () => {
      S.downAt = performance.now(); S.firstPaint = 0; S.on = true
    }, { capture: true, passive: true })
    window.addEventListener('pointerup', () => { S.on = false }, { capture: true, passive: true })
    let prev = 0
    const tick = () => {
      const now = performance.now()   // rAF 인자(스케줄 시각)가 아니라 지금 — 음수가 안 나온다(2차 [2])
      if (S.on) {
        if (!S.firstPaint && S.downAt) S.firstPaint = Math.max(0, now - S.downAt)
        if (prev) S.deltas.push(now - prev)
      }
      prev = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
const resetCollector = (page: Page) => page.evaluate(() => {
  const S = (window as any).__fs; S.deltas = []; S.downAt = 0; S.firstPaint = 0; S.on = false
})
const readCollector = (page: Page) => page.evaluate(() => {
  const S = (window as any).__fs
  const d = [...S.deltas].sort((a: number, b: number) => a - b)
  const q = (t: number) => d.length ? Number(d[Math.min(d.length - 1, Math.floor(d.length * t))].toFixed(2)) : null
  return { down_to_next_paint_ms: Number(S.firstPaint.toFixed(2)), frame_ms_median: q(0.5), frame_ms_p90: q(0.9), frame_ms_worst: q(1), frames: d.length }
})

/** 그리는 중(한 획) — 재그리기 카운터는 **펜이 닿아 있는 동안**(다운~마지막 move)의
 *  델타다. 뗌(커밋)은 docVersion을 올려 정당한 재그리기 1회를 내므로 밖에서 잰다. */
async function liveDraw(page: Page, renderer: 'brush' | 'classic', y: number) {
  await page.evaluate((r) => (window as any).__b2.diag.setRenderer(r), renderer)
  await settle(page)
  await resetCollector(page)
  await page.mouse.move(200, y)
  await page.mouse.down()
  const s0 = await page.evaluate(() => (window as any).__b2.diag.brushStats())
  // draft 통계는 **이 국면 것만** 읽는다(리셋 — 누산기를 국면 칸에 실으면 실행 0인 칸에
  // 남의 값이 실린다: 2차 리뷰어 [5]가 classic 칸의 brush 값(글자 그대로 동일)을 잡았다)
  await page.evaluate(() => (window as any).__b2.diag.draftStatsReset())
  for (let i = 1; i <= 40; i++) await page.mouse.move(200 + (700 * i) / 40, y + (40 * i) / 40)
  await settle(page)
  const s1 = await page.evaluate(() => (window as any).__b2.diag.brushStats())
  const d1 = await page.evaluate(() => (window as any).__b2.diag.draftStats())
  await page.mouse.up()
  await settle(page)
  const s2 = await page.evaluate(() => (window as any).__b2.diag.brushStats())
  const fs = await readCollector(page)
  return {
    ...fs,
    brush_redraws_while_down: s1.redraws - s0.redraws,
    brush_syncs_while_down: s1.syncs - s0.syncs,
    brush_redraws_on_commit: s2.redraws - s1.redraws,
    // web2-12 2번 — draft(진행 중 획) 한 획 재그리기의 분자와 ms(이 국면 표본의 중앙·최악).
    // 전량 재그리기(brush_redraws)와 갈라 센다 — 섞으면 «그리는 중 전량 0회»가 안 재진다.
    draft_redraws_while_down: d1.redraws,
    draft_ms_median: d1.redraws > 0 ? Number(d1.msMedian.toFixed(2)) : null,
    draft_ms_max: d1.redraws > 0 ? Number(d1.msMax.toFixed(2)) : null,
  }
}

/** 궤도 중 — 포즈가 프레임마다 캐시를 깬다(brush 전량 재그리기의 양성 채널) */
async function liveOrbit(page: Page, renderer: 'brush' | 'classic') {
  await page.evaluate((r) => (window as any).__b2.diag.setRenderer(r), renderer)
  await settle(page)
  await resetCollector(page)
  const s0 = await page.evaluate(() => (window as any).__b2.diag.brushStats())
  await page.evaluate(() => (window as any).__b2.diag.tileStatsReset())   // 국면별로 리셋(#32·#43)
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })         // SketchUp 선례 — 중버튼 궤도
  for (let i = 1; i <= 30; i++) await page.mouse.move(600 + i * 4, 400 + (i % 5))
  const s1 = await page.evaluate(() => (window as any).__b2.diag.brushStats())
  // ⚠ 타일 통계는 **버튼을 놓기 전에** 읽는다 — 놓으면 경로가 꺼진다(active=false)
  const t1 = await page.evaluate(() => (window as any).__b2.diag.tileStats())
  await page.mouse.up({ button: 'middle' })
  const fs = await readCollector(page)
  await page.evaluate(() => (window as any).__b2.diag.setRenderer('brush'))
  // 작도 포즈로 복귀(다음 측정이 그리기 국면이 되게)
  await page.click('#btn-draw-view')
  await settle(page)
  return { ...fs, brush_redraws: s1.redraws - s0.redraws, brush_syncs: s1.syncs - s0.syncs,
    // web2-18 3부 — 궤도 중 흑연의 새 출처. 이 셋이 «양성 채널»이다(위 옛 채널의 자리).
    tiles_active: t1.active, tile_frames: t1.frames, tile_bake_ms: t1.bakeMs,
    tile_frame_ms_median: t1.frameMsMedian, tile_frame_ms_max: t1.frameMsMax, tiles: t1.tiles }
}

const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!

test('2-f 원장 — 지연·프레임(그리기/궤도)·재그리기 분산·힙·번들을 두 렌더러 나란히 잰다', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await installCollector(page)
  await drawMouse(page, 100, 400, 1100, 400, 8)       // 지평선(작도) — 이후 획은 내용이다

  // ① 그리는 중 — 획 적은 상태, 두 렌더러
  const liveBrushFew = await liveDraw(page, 'brush', 500)
  const liveClassicFew = await liveDraw(page, 'classic', 560)

  // ② 전량 재그리기 — 획 10·100·500 × 두 렌더러 × 5회(min/median/max — 2차 [3])
  const scale: Record<string, unknown> = {}
  for (const n of [10, 100, 500]) {
    await page.evaluate((target) => {
      const b = (window as any).__b2
      let i = b.app.doc.strokes.length
      while (b.app.doc.strokes.length < target + 3) { // +3 = 지평선 + ①의 획 둘
        const y = 120 + ((i * 37) % 560)
        const x = 60 + ((i * 53) % 300)
        b.diag.commitStroke(x, y, x + 320 + (i % 90), y)
        i++
      }
    }, n)
    await settle(page)
    const brushRuns = await page.evaluate(() => {
      const b = (window as any).__b2
      b.diag.setRenderer('brush')
      return [0, 1, 2, 3, 4].map(() => b.diag.brushRedrawMs())
    })
    const classicRuns = await page.evaluate(() => {
      const b = (window as any).__b2
      b.diag.setRenderer('classic')
      return [0, 1, 2, 3, 4].map(() => b.diag.draw2dMs())
    })
    const heap = await page.evaluate(() => (performance as any).memory
      ? (performance as any).memory.usedJSHeapSize : null)
    scale[String(n)] = {
      brush_ms: { min: Math.min(...brushRuns), median: median(brushRuns), max: Math.max(...brushRuns) },
      classic_ms: { min: Math.min(...classicRuns), median: median(classicRuns), max: Math.max(...classicRuns) },
      heap_bytes: heap,
    }
    console.log(`[측정] 획 ${n} — brush ${JSON.stringify(brushRuns.map(v => +v.toFixed(1)))} · classic ${JSON.stringify(classicRuns.map(v => +v.toFixed(1)))} · 힙 ${heap}`)
  }

  // ③ 그리는 중 — 획 500, 두 렌더러(2차 [5]: classic@500 팔 신설)
  const liveBrush500 = await liveDraw(page, 'brush', 500)
  const liveClassic500 = await liveDraw(page, 'classic', 560)
  // ④ 궤도 중 — 획 500, 두 렌더러(포즈가 캐시를 깬다 — 지표가 실제로 움직이는 자리)
  const orbitBrush500 = await liveOrbit(page, 'brush')
  const orbitClassic500 = await liveOrbit(page, 'classic')

  console.log(`[측정] 그리는 중 few — brush ${JSON.stringify(liveBrushFew)} classic ${JSON.stringify(liveClassicFew)}`)
  console.log(`[측정] 그리는 중 500 — brush ${JSON.stringify(liveBrush500)} classic ${JSON.stringify(liveClassic500)}`)
  console.log(`[측정] 궤도 500 — brush ${JSON.stringify(orbitBrush500)} classic ${JSON.stringify(orbitClassic500)}`)

  // 판별 하한(D-3) — 수집기 생존 + «그리는 중 재그리기 0회»는 카운터로 + 궤도의 양성 채널
  expect(liveBrush500.frames).toBeGreaterThan(5)
  expect(liveBrush500.brush_redraws_while_down).toBe(0)  // 닿아 있는 동안 — **전량** 재그리기 0회(웹2-12 뒤에도 계약)
  expect(liveBrush500.brush_syncs_while_down).toBeGreaterThan(0)
  expect(liveBrush500.brush_redraws_on_commit).toBe(1)   // 뗌 = 정당한 1회(커밋이 장면을 바꾼다)
  // ⚠ **web2-18 3부에서 이 양성 채널이 옮겨 갔다.** 종전에는 «궤도 중 전량 재그리기가
  //    돈다»가 판별 신호였는데(그것이 곧 사람이 느끼던 끊김의 원인이었다), 이제 궤도
  //    동안에는 **구운 타일**이 흑연을 든다(3-c ㉢) — 전량 재그리기는 **0이 옳다**.
  //    새 양성 채널은 «타일 경로가 실제로 돌았는가»다. 임계를 만져 옛 판정을 되살리지 않는다.
  expect(orbitBrush500.brush_redraws, '궤도 중 전량 재그리기는 0이다(타일 경로가 든다)').toBe(0)
  expect(orbitBrush500.tiles_active, '궤도 중 타일 경로가 실제로 돌았다').toBe(true)
  expect(orbitBrush500.tile_frames, '타일 붙이기 프레임이 실제로 있었다').toBeGreaterThan(0)
  // web2-12 2번 — 그리는 중 draft «한 획» 재그리기는 실제로 돈다(brush에서만).
  // 획 500에서도 이 분자는 획 수와 무관하다 — 전량이 아니라 스냅샷 위 한 획이므로.
  expect(liveBrush500.draft_redraws_while_down).toBeGreaterThan(0)
  expect(liveClassic500.draft_redraws_while_down).toBe(0) // classic은 옛 경로(비교 기준)다
  const s500 = scale['500'] as any
  expect(s500.brush_ms.min).toBeGreaterThan(0)

  if (testInfo.project.name === 'dpr1') {
    let bundle: number | null = null
    try {
      const dir = resolve(HERE, '../dist/assets')
      bundle = readdirSync(dir).reduce((s, f) => s + statSync(join(dir, f)).size, 0)
    } catch { /* dist가 없으면(빌드 전) null — 원장에 그렇게 남는다 */ }
    const BEFORE = 677355
    const out = resolve(HERE, '../../stage0/out/brush_perf_web2.json')
    mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-11 2-f + web2-12 2번 — brush 렌더러의 «느낌» 원장: 다운→다음 그리기 기회, 그리기/궤도 중 프레임, draft 한 획 재그리기(횟수·ms), 전량 재그리기(획 10·100·500 × 5회 min/median/max), JS 힙(원 바이트), 번들. 두 렌더러 나란히(classic = 옛 미리보기 경로).',
      environment: '헤드리스 크로뮴(소프트웨어 GL 가능) — 절대값이 아니라 두 렌더러의 비·국면(그리기 vs 궤도)·획 수에 따른 변화가 판별값이다. ⚠ 실행 «사이» 변동이 min/max(5회 — 같은 세션 안 연속 반복)보다 훨씬 크다(수십 % 대역 — 실측: 이 원장을 쓴 실행들이 서로 그만큼 갈렸고 그것이 문서 인용을 두 번 낡게 했다). 그래서 이 원장의 수는 문서에 옮겨 적지 않는다 — 필드를 그 자리에서 읽는다(#47). 실기기 절대값은 사람 손이 판정한다(DEFERRED 표).',
      metric_defs: {
        down_to_next_paint_ms: 'pointerdown 시각 → 다음 rAF 콜백의 performance.now(). vsync 위상 + 그 프레임 그리기이지 «렌더러 지연»이 아니다(2차 [2] — 초판의 rAF 인자 기준은 음수가 났다). 실기기 «첫 픽셀»의 대용 하한.',
        frame_ms: '그 국면의 rAF 간격(중앙·p90·최악). 60Hz 헤드리스에서 16.7ms는 vsync 상한이라 그 값 자체는 판별력이 없고, 상한을 «넘는» 국면(궤도)이 판별한다(#46).',
        tiles: 'web2-18 3부 — 궤도(제스처) 동안 흑연을 드는 **구운 타일**의 값: tiles_active(경로가 돌았는가) · tile_frames(붙인 프레임 수) · tile_bake_ms(굽기 1회) · tile_frame_ms_median/max(붙이기 1프레임). 굽기는 제스처마다 한 번이고 붙이기는 프레임마다다 — 그 둘의 대비가 이 방법의 값어치다.',
        brush_redraws: '그 국면 동안 #brushc의 «획» 재그리기 횟수 — 렌더러가 brush일 때만 센다(2차 재리뷰 [2]: classic의 비우기 패스를 섞으면 0이 «캐시 성공»과 «겹 미사용»을 못 가른다. classic 칸의 0은 겹 미사용의 0이다). 분모 brush_syncs = sync 검사 횟수(#43).',
        single_sample_note: 'live 계열(down_to_next_paint·frame_ms·frames)은 국면당 «1회» 표본이다 — 실행 간 변동이 커서 작은 차(수 ms)는 판별하지 않고, 국면 간 큰 차(수 배)만 읽는다.',
        heap_bytes: 'performance.memory.usedJSHeapSize — ⚠ 크로뮴이 값을 양자화해 준다(십만 단위 관측 — «원 바이트»는 API가 주는 그대로라는 뜻이지 정밀 힙이 아니다). 렌더러 전환(brush→classic 측정 직후)의 값이라 한 시점 스냅샷이다.',
        frames_bundle: 'frames = 그 국면의 rAF 표본 수(수집기 생존 판별용) · bundle_bytes = dist/assets 합(실행 시점 빌드).',
        draft: 'web2-12 2번 — draft_redraws_while_down = 그 국면(닿아 있는 동안)의 draft 한 획 재그리기 횟수(국면별 리셋 — 2차 [5]). draft_ms = 그 표본의 중앙·최악(몸체 겹 + 질감 한 획 + render 블릿). 재그리기 0인 칸은 null(그 경로 미실행 — 값이 없다). classic은 옛 미리보기 경로라 구성상 0/null — «옛 경로와 나란히»의 대조군 칸이다. ⚠ 이동(move) 수가 아니라 rAF 프레임에서 키가 갈린 횟수라 국면·부하에 따라 다르다.',
      },
      live: {
        drawing_few: { brush: liveBrushFew, classic: liveClassicFew },
        drawing_500: { brush: liveBrush500, classic: liveClassic500 },
        orbit_500: { brush: orbitBrush500, classic: orbitClassic500 },
        note: '그리는 중 brush_redraws 0(캐시 설계 — 카운터가 정본)이고, 궤도 중에는 프레임마다 재그리기가 돌아 프레임 간격이 상한을 넘는다 — 실기기에서 「돌릴 때 끊긴다」가 오면 이 행이 원인이다.',
      },
      full_redraw_ms: {
        note: 'brush_ms = #brushc 전량 재그리기(5회 min/median/max) — 커밋·궤도·줌·접기 때 돈다. classic_ms = draw2d 1회(grain 포함) — classic은 매 프레임 이 비용이고 brush는 장면이 바뀔 때만 + 사이 0. 획당 비용·선형성은 이 세 점의 필드에서 계산해 읽는다(산문에 안 박는다 — #47).',
        ...scale,
      },
      heap_note: 'JS 힙 원 바이트(반올림 없음). ⚠ WebGL 컨텍스트(gl·brushc 둘)의 GPU/텍스처 메모리는 JS에서 못 잰다 — 미측정(2차 [6]). 실기기에서 «앱이 죽는다/느려진다»가 오면 chrome://gpu 계열이 그 자리다.',
      bundle_bytes: {
        with_brush: bundle,
        before_brush_e2e5e91: BEFORE,
        delta: bundle === null ? null : bundle - BEFORE,
        note: 'before는 git worktree(e2e5e91)에서 같은 방법(vite build, dist/assets 합)으로 실측. delta가 p5.brush 2.2.2 표준 빌드 + 이 회차 코드 몫이다. 배포본의 값은 배포 직전 빌드에서 이 팔이 다시 잰다.',
      },
      offline_note: 'sw.js는 정적 목록 없는 런타임 캐시(vite.config swSource)라 새 번들도 첫 로드에 캐시된다 — 구조 서술이다. 오프라인 «실측»은 이 회차 미실행: static_deploy의 오프라인 양성 채널은 DEFERRED 11차 항목 5에 컨테이너 시간 초과로 등재된 그대로다(2차 [12] — 미측정을 미측정으로 적는다).',
      falsification: '**brush 렌더러 조건의** drawing_*.brush.brush_redraws_while_down이 0이 아니면 캐시 설계가 깨진 것(팔이 0을 강제 — classic 칸의 0은 겹 미사용이라 판정에 안 쓴다) · full_redraw가 전부 0이면 재그리기 미작동(팔이 500행 min>0 강제). ⚠ **web2-18 3부에서 궤도의 양성 채널이 옮겨 갔다**: 종전에는 orbit_500.brush.brush_redraws>0가 신호였는데(그 재그리기가 곧 사람이 느끼던 끊김의 원인이었다), 이제 궤도 동안은 구운 타일이 흑연을 들므로 **그 값이 0인 것이 옳다**. 새 신호는 tiles_active=true · tile_frames>0이고 팔이 그 셋을 강제한다 — 임계를 만져 옛 판정을 되살리지 않았다.',
    }, null, 1))
  }
})
