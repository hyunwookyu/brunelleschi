// web2-18 0부 — **비용 원장**. 고치기 전에 잰다(D-2: 무엇이 실제로 드는지 모르면 넷 중
// 어느 것이 들었는지 모른 채 끝난다). 3·4부의 «무엇을 고칠지»를 이 표가 정한다.
//
// ⚠⚠ **절대 ms는 결론이 아니다**(지시 0부). 이 컨테이너의 시간은 크게 흔들린다(HANDOFF:
// 9차에 전량이 121s → 1h52m — 원인은 하네스가 아니라 디스크였다). 판별값은 **획 수 대비
// 기울기**다: 50→400에서 8배면 O(n), 64배면 O(n²). 원장은 그 배수를 계산해 함께 적는다.
//
// 격자: 획 50·100·200·400 × `rawIn`(점별 필압) 보유 0%·50%·100%.
// 픽스처는 **손 오차를 태운다**(#68 — 끝점에 2~5px 지터. 이상적 좌표만 쓰면 «도달 불가»가
// 통과로 남는다). 승격 획과 대기 획을 섞는다 — 둘의 경로가 brushlayer에서 갈린다
// (승격은 project+drawStroke · 대기는 docToScreen+파선). 실제 비율은 원장이 적는다.
//
// 재는 것 넷(지시 0부 표):
//   ① 전량 흑연 재그리기 ms — 포즈·뷰가 바뀌는 **매 프레임**
//   ② syncStrokes ms      — 문서가 바뀔 때마다
//   ③ 궤도 1프레임 합 ms  — render3d + brushLayer.sync + draw2d(앱이 그 자리에서 잰다)
//   ④ 포인터 이동 1회 osnap ms — intersections3 · 끝점 병합 · 나머지로 **분해**
//
// 헤드리스 표와 실기기 표는 **가른다**(지시 0부 ⚠) — 실기기 몫은 진단 패널의 ①②③④ 줄이고
// DEFERRED의 실기기 표가 그 자리다. 이 파일이 내는 것은 헤드리스 표다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const GRID = [50, 100, 200, 400] as const
const RAW_RATIOS = [0, 0.5, 1] as const
const REPS = 5

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** 지평선 + 깊이선 + 수평 앵커 — **카메라가 닫히는** 픽스처(own3d.spec와 같은 규격) */
async function fixture(page: Page) {
  await page.mouse.move(100, 400); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(100 + 125 * i, 400)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(300, 650); await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(300 + 25 * i, 650 - 18 * i)
  await page.mouse.up(); await settle(page)
  await page.mouse.move(280, 560); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(280 + (420 / 12) * i, 560)
  await page.mouse.up(); await settle(page)
}

const stats = (a: number[]) => {
  const v = [...a].sort((x, y) => x - y)
  return { min: +v[0]!.toFixed(3), median: +v[Math.floor(v.length / 2)]!.toFixed(3), max: +v[v.length - 1]!.toFixed(3) }
}

/** 격자를 target까지 **채운다**(이미 있는 것 위에 더한다 — 50→100→200→400 누적).
 *  ⚠ 시드 고정 LCG(§5 — Math.random 금지). 손 오차 2~5px를 **끝점에 태운다**(#68). */
async function fillTo(page: Page, target: number, rawRatio: number) {
  return page.evaluate(([target, rawRatio]) => {
    const b = (window as any).__b2
    // rng32와 같은 LCG — 시드는 목표 획 수와 비율에서 정해진다(실행마다 같다)
    let s = ((target * 131 + Math.round(rawRatio * 100) * 7919) >>> 0) || 1
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    /** 손 오차 — 2~5px, 방향 무작위(#68: 이상적 좌표만 쓰면 도달 불가가 통과로 남는다) */
    const jit = () => {
      const r = 2 + rnd() * 3, a = rnd() * Math.PI * 2
      return { x: Math.cos(a) * r, y: Math.sin(a) * r }
    }
    const marks = b.diag.vpMarks() as { vp: { x: number; y: number } }[]
    let promoted = 0, waited = 0
    while (b.app.doc.strokes.length < target) {
      const i = b.app.doc.strokes.length
      // 점별 필압 — 이 획이 rawIn을 갖는가(비율 격자). 값은 결정론 LCG.
      const withRaw = rnd() < rawRatio
      const press = withRaw
        ? Array.from({ length: 16 }, (_, k) => Math.round((0.35 + 0.5 * Math.sin((k / 15) * Math.PI)) * 8191))
        : undefined
      let placed = false
      if (i % 2 === 0 && marks.length > 0) {
        // ── 승격을 노리는 획 — 이미 3D인 끝점에서 소실점 쪽으로 ──────────────
        const proj = b.diag.projectAll() as Record<number, { a: { x: number; y: number }; b: { x: number; y: number } } | null>
        const live = Object.values(proj).filter(Boolean) as { a: { x: number; y: number }; b: { x: number; y: number } }[]
        if (live.length > 0) {
          const seg = live[Math.floor(rnd() * live.length) % live.length]!
          const from = rnd() < 0.5 ? seg.a : seg.b
          const vp = marks[Math.floor(rnd() * marks.length) % marks.length]!.vp
          const dx = vp.x - from.x, dy = vp.y - from.y
          const L = Math.hypot(dx, dy) || 1
          const len = 60 + rnd() * 140
          const j0 = jit(), j1 = jit()
          b.diag.commitStroke(from.x + j0.x, from.y + j0.y,
            from.x + (dx / L) * len + j1.x, from.y + (dy / L) * len + j1.y,
            press ? { press } : undefined)
          placed = true
        }
      }
      if (!placed) {
        // ── 자유 획(대기가 되기 쉬운 쪽) — 화면 전역에 흩는다 ────────────────
        const ax = 60 + rnd() * 1000, ay = 120 + rnd() * 600
        const ang = rnd() * Math.PI * 2, len = 60 + rnd() * 180
        const j0 = jit(), j1 = jit()
        b.diag.commitStroke(ax + j0.x, ay + j0.y,
          ax + Math.cos(ang) * len + j1.x, ay + Math.sin(ang) * len + j1.y,
          press ? { press } : undefined)
      }
      if (b.app.lift.lifted.has(b.app.nextId - 1)) promoted++; else waited++
    }
    return {
      strokes: b.app.doc.strokes.length,
      lifted: b.app.lift.lifted.size,
      waiting: b.app.lift.waiting.length,
      withRawIn: b.app.doc.strokes.filter((x: any) => x.rawIn && x.rawIn.press).length,
      added: { promoted, waited },
    }
  }, [target, rawRatio] as const)
}

/** ③ 궤도 1프레임 합 — **앱이 그리는 그 자리**의 3몫(render3d·brushLayer.sync·draw2d) */
async function orbitFrames(page: Page) {
  await page.evaluate(() => (window as any).__b2.diag.frameCostReset())
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 30; i++) await page.mouse.move(600 + i * 4, 400 + (i % 5))
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const q = await page.evaluate(() => (window as any).__b2.diag.frameCost())
  await page.click('#btn-draw-view')   // 작도 시점 복귀 — 다음 칸이 같은 국면에서 시작한다
  await settle(page)
  return q as { n: number; r3: number; bs: number; d2: number; total: number; totalMax: number } | null
}

/** ④ 포인터 이동 1회 osnap — 호버 이동 M회의 **호출당** 평균을 3몫으로 분해 */
async function hoverOsnap(page: Page, moves = 40) {
  await page.evaluate(() => (window as any).__b2.diag.osnapCostReset())
  for (let i = 0; i < moves; i++) await page.mouse.move(200 + (i * 17) % 800, 200 + (i * 29) % 400)
  await settle(page)
  const c = await page.evaluate(() => (window as any).__b2.diag.osnapCost())
  const k = c.calls || 1
  return {
    calls: c.calls,
    per_call_ms: +(c.totalMs / k).toFixed(4),
    intersect_ms: +(c.intersectMs / k).toFixed(4),
    ends_merge_ms: +(c.endsMs / k).toFixed(4),
    rest_ms: +(c.restMs / k).toFixed(4),
  }
}

// ⚠⚠ **`--workers=1`로 돌린다.** 두 프로젝트를 동시에 돌리면 서로 CPU를 다퉈 절대값이
// 배 가까이 부풀고, 전/후 비교가 무효가 된다(이 회차 실측: 400획 전량 재그리기가 워커 1에서
// 186ms인데 워커 2에서 343ms였다). 기울기도 같이 흔들린다 — 시간을 재는 팔의 규율이다.
test('0부 — 비용 원장(획 50·100·200·400 × rawIn 0·50·100%): 전량흑연·syncStrokes·궤도프레임·osnap', async ({ page }, testInfo) => {
  test.setTimeout(900_000)
  const table: Record<string, Record<string, unknown>> = {}
  let scene: Record<string, unknown> = {}

  for (const ratio of RAW_RATIOS) {
    const key = `raw_${Math.round(ratio * 100)}pct`
    table[key] = {}
    await page.goto('/')
    await page.waitForFunction(() => (window as any).__b2)
    await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
    await page.goto('/')
    await page.waitForFunction(() => (window as any).__b2)
    await fixture(page)

    for (const n of GRID) {
      const built = await fillTo(page, n, ratio)
      await settle(page)
      // ① 전량 흑연 재그리기 — 강제 실행 REPS회(앱과 같은 redraw)
      const full = await page.evaluate((r) => {
        const b = (window as any).__b2
        return Array.from({ length: r }, () => b.diag.brushRedrawMs())
      }, REPS)
      // ② syncStrokes — 강제 실행 REPS회(앱과 같은 함수)
      const sync = await page.evaluate((r) => {
        const b = (window as any).__b2
        return Array.from({ length: r }, () => b.diag.syncStrokesMs())
      }, REPS)
      // ③ 궤도 1프레임 합
      const orbit = await orbitFrames(page)
      // ④ osnap 분해
      const osn = await hoverOsnap(page)
      // ①의 «앱이 실제 그린» 값 — 강제 실행과 같은 대역인지 대조(계측 자기 확인)
      const lastFull = await page.evaluate(() => (window as any).__b2.diag.brushLastFull())

      table[key]![String(n)] = {
        scene: built,
        full_redraw_ms: stats(full),
        last_full_app_ms: +lastFull.ms.toFixed(3),
        // 3-c ㉠ — **이 궤도에서 화면 밖으로 실제로 몇 획이 잘렸나**. 0이면 이 픽스처는
        // ㉠을 «안 재는» 것이고, 그 사실이 값으로 있어야 「㉠이 표를 못 움직였다」가 선다(#69 ㉣).
        last_full_drawn: lastFull.drawn, last_full_clipped: lastFull.clipped,
        sync_strokes_ms: stats(sync),
        orbit_frame_ms: orbit,
        osnap: osn,
      }
      console.log(`[0부] rawIn ${Math.round(ratio * 100)}% . 획 ${n} — 전량 ${stats(full).median}ms . sync ${stats(sync).median}ms`
        + ` . 궤도합 ${orbit ? orbit.total.toFixed(2) : '—'}ms . osnap ${osn.per_call_ms}ms`
        + ` (승격 ${built.lifted} / 대기 ${built.waiting} / rawIn ${built.withRawIn})`)
      if (n === 400) scene = built as unknown as Record<string, unknown>
    }
  }

  // ── 기울기 — **이 원장의 값어치**(지시 0부 ⚠⚠). 50→400은 8배이므로 O(n)이면 ≈8. ──
  const slope: Record<string, unknown> = {}
  for (const key of Object.keys(table)) {
    const at = (n: number, path: (t: any) => number | null | undefined) => {
      const v = path(table[key]![String(n)])
      return typeof v === 'number' && isFinite(v) ? v : null
    }
    const ratioOf = (path: (t: any) => number | null | undefined) => {
      const a = at(50, path), b = at(400, path)
      return a !== null && b !== null && a > 0 ? +(b / a).toFixed(2) : null
    }
    slope[key] = {
      full_redraw: ratioOf(t => t.full_redraw_ms.median),
      sync_strokes: ratioOf(t => t.sync_strokes_ms.median),
      orbit_frame: ratioOf(t => t.orbit_frame_ms && t.orbit_frame_ms.total),
      osnap_total: ratioOf(t => t.osnap.per_call_ms),
      osnap_intersect: ratioOf(t => t.osnap.intersect_ms),
      osnap_ends_merge: ratioOf(t => t.osnap.ends_merge_ms),
    }
  }

  console.log(`[0부] 기울기(50→400 . O(n)이면 ≈8 . O(n²)이면 ≈64) — ${JSON.stringify(slope)}`)

  // 판별 하한(D-3) — 격자가 **실제로 갈리는지**. 이 셋이 서면 표가 무언가를 잰 것이다.
  const at400 = table['raw_100pct']!['400'] as any
  const at50 = table['raw_100pct']!['50'] as any
  expect(at400.scene.strokes, '격자가 실제로 400에 도달한다').toBeGreaterThanOrEqual(400)
  expect(at400.scene.lifted, '승격 획이 섞였다').toBeGreaterThan(0)
  expect(at400.scene.waiting, '대기 획이 섞였다').toBeGreaterThan(0)
  expect(at400.scene.withRawIn, 'rawIn 100% 칸은 실제로 필압을 실었다').toBeGreaterThan(0)
  expect((table['raw_0pct']!['400'] as any).scene.withRawIn, 'rawIn 0% 칸은 안 실었다').toBe(0)
  expect(at400.full_redraw_ms.median, '전량 재그리기가 0이 아니다(#69 ㉣ — 0을 적기 전에 확인)')
    .toBeGreaterThan(0)
  expect(at400.full_redraw_ms.median, '400이 50보다 비싸다(격자가 갈린다)')
    .toBeGreaterThan(at50.full_redraw_ms.median)
  expect(at400.osnap.calls, 'osnap 표식이 실제로 돌았다').toBeGreaterThan(0)

  {
    // dpr1·dpr2 **둘 다 남긴다**(D-C3 — dpr 1에서만 확인하지 않는다). dpr2는 픽셀이 네 배라
    // 흑연 재그리기가 그만큼 비싸다 — 실기기(고해상도 태블릿)에 가까운 쪽이 그 판이다.
    // 종전에는 dpr2 실행이 5분 넘게 돌고 **아무것도 안 남겼다**(그 시간이 통째로 낭비였다).
    const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
    const out = resolve(HERE, `../../stage0/out/cost18_web2${suffix}.json`)
    mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
    // 원장은 LEDGER=1 단독 실행에서만 쓴다(web2-22 규율 — 전량·병렬 판이 네 번 오염을 냈다: #71 ㉠)
    if (process.env.LEDGER === '1') writeFileSync(out, JSON.stringify({
      what: 'web2-18 0부 — 비용 원장(이 판의 국면은 아래 phase가 정본이다). 획 50·100·200·400 × rawIn 보유 0·50·100%에서 ①전량 흑연 재그리기 ②syncStrokes ③궤도 1프레임 합(3몫) ④포인터 이동 1회 osnap(3몫 분해). 3·4부의 «무엇을 고칠지»를 이 표가 정한다.',
      phase: 'after',
      run: {
        project: testInfo.project.name,
        workers: process.env.PW_WORKERS ?? '(명령 인자 — 아래 ⚠)',
        note: '⚠⚠ **전/후는 같은 조건이어야 한다**(#71 ㉠). 이 원장을 낼 때 쓴 명령은 `npx playwright test cost18 --workers=1`이다. 워커 둘이면 dpr1·dpr2가 CPU를 다퉈 값이 배 가까이 부풀고 비교가 무효가 된다(실측 400획 전량 재그리기 워커1 186.5 ms ↔ 워커2 343.3 ms). ⚠ **dpr2에는 «전» 판이 없다** — before 판은 dpr1 전용이므로 dpr2 판은 «후»의 절대값과 기울기만 읽는다(전/후 비교가 아니다).',
      },
      phase_note: '**1·2부 수리 후** 판. 쌍이 되는 «전» 판은 같은 폴더의 `cost18_web2_before.json`(커밋 923f331 시점)이다. ⚠⚠ **전/후는 같은 실행 조건이어야 한다** — `--workers=1`. 워커 둘로 돌리면 dpr1·dpr2가 CPU를 다퉈 값이 배 가까이 부풀고 비교가 무효가 된다(이 회차에서 실제로 그렇게 나와 그 판을 버렸다).',
      dpr: testInfo.project.name,
      environment: `헤드리스 크로뮴(소프트웨어 GL 가능) · viewport 1200×800 · ${testInfo.project.name} 기록. ⚠ 절대 ms는 이 컨테이너의 값이고 실행 간 변동이 크다(HANDOFF: 9차 121s→1h52m, 원인은 디스크). **판별값은 slope(50→400 배수)다** — O(n)이면 ≈8, O(n²)이면 ≈64. 실기기 값은 다르다: 진단 패널의 ①②③④ 줄이 그 자리다(DEFERRED 실기기 표). dpr2 판은 픽셀이 네 배라 흑연 재그리기가 그만큼 비싸다 — 고해상도 실기기에 가까운 쪽이 그 판이다(D-C3).`,
      fixture_note: '카메라를 닫는 픽스처(지평선+깊이선+수평 앵커 — own3d.spec와 같은 규격) 위에 격자를 누적한다(50→100→200→400). 손 오차를 태웠다(#68 — 끝점마다 2~5px 지터, 시드 고정 LCG). 획은 두 종류를 번갈아 낸다: 이미 3D인 끝점에서 소실점 쪽으로(승격을 노림) · 화면 전역 자유 획(대기가 되기 쉬움). 실제 승격/대기 비율은 각 칸의 scene에 있다 — 의도가 아니라 실측이다.',
      metric_defs: {
        full_redraw_ms: '① brushLayer.redrawTimed — #brushc 전량 재그리기 1회(min/median/max, 5회). 포즈·뷰가 바뀌는 **매 프레임** 도는 비용이다. last_full_app_ms는 «앱이 실제로 그린» 마지막 값(강제 실행과 같은 대역인지의 자기 확인).',
        sync_strokes_ms: '② render3d.syncStrokes 1회(min/median/max, 5회) — Line2 기하를 전부 다시 만든다. **문서가 바뀔 때마다** 돈다(궤도 중에는 안 돈다 — 포즈는 docVersion을 안 올린다).',
        orbit_frame_ms: '③ 궤도 제스처(중버튼 30이동) 동안 **앱이 그 자리에서 잰** 프레임 3몫: r3=render3d · bs=brushLayer.sync · d2=draw2d. total은 셋의 합의 중앙값, totalMax는 최악. n은 표본 프레임 수. 국면별로 리셋해 읽는다(누산은 국면이 섞인다).',
        osnap: '④ 호버 이동 40회 동안의 osnap() **호출당** 평균 ms와 3몫 분해: intersect=intersections3(모든 3D 선분 쌍) · ends_merge=끝점·정점 병합(ends.find) · rest=나머지 전부. ⚠ rest는 뺄셈이라 타이머 분해능에서 음수가 날 수 있다 — 그대로 적는다.',
        slope: '50→400(획 8배)에서의 median 배수. **이 원장의 값어치가 여기 있다**(절대 ms가 아니다): ≈8이면 O(n) · ≈64면 O(n²) · ≈1이면 획 수 무관.',
      },
      flags_explained: {
        'sync_strokes_ms.median = 1': '양자화다 — 이 경로의 ms가 0.1 단위로 떨어지고 400획에서 1.0 근처라 중앙값이 정확히 1이 되는 칸이 있다. 항등이 아니라 분해능이다(같은 열의 50획 칸은 0.1~0.2다).',
        'slope 값이 칸마다 흔들린다': '실행 간 변동이다(이 컨테이너의 시간은 크게 흔들린다 — environment 참조). **판정은 대역으로 읽는다**: full_redraw·orbit_frame은 6~11(≈8, O(n)) · osnap_intersect는 31~45(≈64 쪽, O(n²)). 한 칸의 소수점을 인용하지 않는다.',
      },
      scene_at_400: scene,
      grid: table,
      slope,
      falsification: '격자가 안 갈리면 표가 아무것도 안 잰 것이다 — 팔이 강제한다: 400의 획 수 ≥400 · 승격>0 · 대기>0 · rawIn 100% 칸은 >0이고 0% 칸은 정확히 0 · 400의 전량 재그리기 median >0(#69 ㉣) 이고 50보다 크다 · osnap 호출 수 >0. 이 중 하나라도 무너지면 그 표는 못 읽는다.',
    }, null, 1))
    console.log(`[0부] 원장 기록 — ${out}`)
  }
})
