// web2-22 0부 — **비용 재측정**(1부 전에 한다 — 지시 문면). cost18의 격자 규격 그대로,
// 획을 200·400·800으로 늘리고 **절반을 옐로 겹의 자유 획**으로 채운다.
//
// 이 표의 물음: 자유 스케치 대역(수백 획)에서 `osnap`(그중 `intersections3` O(n²))이
// 어떻게 자라는가 — 그리고 1-c(옐로 획을 오스냅·리프팅에서 뺀다)가 실제로 듣는가(전/후).
// ⚠⚠ **절대 ms가 아니라 기울기**(200→800 = 4배: O(n)이면 ≈4 · O(n²)이면 ≈16 — 지시 0부).
//
// 전/후 규율(#71 ㉠ — web2-21 재발 부기가 이 회차 착수 표의 첫 줄): 1-c 수리 **전**에 이
// 파일을 돌려 원장을 `cost22_web2{,_dpr2}_before.json`으로 옮기고, 수리 후 재실행이 정본
// `cost22_web2{,_dpr2}.json`이다. 국면은 짐작이 아니라 **옐로 승격 수로 자동 판별**해
// 원장에 적는다(전: 옐로가 축·3D를 타므로 >0 · 후: 정확히 0).
//
// ⚠⚠ `--workers=1`로 돌린다(cost18과 같은 규율 — 명령: npx playwright test cost22 --workers=1).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const GRID = [200, 400, 800] as const
const RAW_RATIO = 0.5   // cost18의 가운데 칸 — 축은 획 수·옐로 비율이고 rawIn은 상수로 둔다(조건 명기)
const REPS = 5

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** 카메라를 닫는 픽스처(cost18과 같은 규격) */
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
  // 옐로 한 장(3-a 롤) — 절반의 자유 획이 이 겹으로 간다
  await page.click('#btn-roll-yellow'); await settle(page)
}

const stats = (a: number[]) => {
  const v = [...a].sort((x, y) => x - y)
  return { min: +v[0]!.toFixed(3), median: +v[Math.floor(v.length / 2)]!.toFixed(3), max: +v[v.length - 1]!.toFixed(3) }
}

/** 격자를 target까지 채운다 — **짝수 획은 옐로 자유 획**(활성 겹으로 · 방향 무작위),
 *  홀수 획은 cost18의 바탕 혼합(승격 노림/자유). 손 오차 2~5px(#68) · 시드 LCG(§5). */
async function fillTo(page: Page, target: number) {
  return page.evaluate(([target, rawRatio]) => {
    const b = (window as any).__b2
    let s = ((target * 131 + 977) >>> 0) || 1
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    const jit = () => {
      const r = 2 + rnd() * 3, a = rnd() * Math.PI * 2
      return { x: Math.cos(a) * r, y: Math.sin(a) * r }
    }
    const yid = b.app.doc.layers.find((l: any) => l.paper === 'yellow')?.id ?? null
    const marks = b.diag.vpMarks() as { vp: { x: number; y: number } }[]
    while (b.app.doc.strokes.length < target) {
      const i = b.app.doc.strokes.length
      const withRaw = rnd() < rawRatio
      const press = withRaw
        ? Array.from({ length: 16 }, (_, k) => Math.round((0.35 + 0.5 * Math.sin((k / 15) * Math.PI)) * 8191))
        : undefined
      if (i % 2 === 0 && yid !== null) {
        // ── 옐로 자유 획 — 활성 겹으로. 각도 전역(축 대역 근처 포함 — #68) ──────
        b.app.activeLayer = yid
        const ax = 60 + rnd() * 1000, ay = 120 + rnd() * 600
        const ang = rnd() * Math.PI * 2, len = 40 + rnd() * 200
        const j0 = jit(), j1 = jit()
        b.diag.commitStroke(ax + j0.x, ay + j0.y,
          ax + Math.cos(ang) * len + j1.x, ay + Math.sin(ang) * len + j1.y,
          press ? { press } : undefined)
        b.app.activeLayer = null
      } else {
        // ── 바탕 획 — cost18의 혼합(승격 노림 ↔ 전역 자유) ─────────────────────
        let placed = false
        if (i % 4 === 1 && marks.length > 0) {
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
          const ax = 60 + rnd() * 1000, ay = 120 + rnd() * 600
          const ang = rnd() * Math.PI * 2, len = 60 + rnd() * 180
          const j0 = jit(), j1 = jit()
          b.diag.commitStroke(ax + j0.x, ay + j0.y,
            ax + Math.cos(ang) * len + j1.x, ay + Math.sin(ang) * len + j1.y,
            press ? { press } : undefined)
        }
      }
    }
    const yellow = b.app.doc.strokes.filter((x: any) => x.layer === yid)
    return {
      strokes: b.app.doc.strokes.length,
      lifted: b.app.lift.lifted.size,
      waiting: b.app.lift.waiting.length,
      yellow: yellow.length,
      yellow_lifted: yellow.filter((x: any) => b.app.lift.lifted.has(x.id)).length,
      withRawIn: b.app.doc.strokes.filter((x: any) => x.rawIn && x.rawIn.press).length,
    }
  }, [target, RAW_RATIO] as const)
}

async function orbitFrames(page: Page) {
  await page.evaluate(() => (window as any).__b2.diag.frameCostReset())
  await page.mouse.move(600, 400)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 30; i++) await page.mouse.move(600 + i * 4, 400 + (i % 5))
  await page.mouse.up({ button: 'middle' })
  await settle(page)
  const q = await page.evaluate(() => (window as any).__b2.diag.frameCost())
  await page.click('#btn-draw-view')
  await settle(page)
  return q as { n: number; r3: number; bs: number; d2: number; total: number; totalMax: number } | null
}

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

test('0부 — 비용 재측정(획 200·400·800 · 절반 옐로 자유): 전량흑연·syncStrokes·궤도·osnap 분해', async ({ page }, testInfo) => {
  test.setTimeout(900_000)
  const table: Record<string, unknown> = {}
  let sceneAtMax: Record<string, unknown> = {}

  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await fixture(page)

  for (const n of GRID) {
    const built = await fillTo(page, n)
    await settle(page)
    const full = await page.evaluate((r) => {
      const b = (window as any).__b2
      return Array.from({ length: r }, () => b.diag.brushRedrawMs())
    }, REPS)
    const sync = await page.evaluate((r) => {
      const b = (window as any).__b2
      return Array.from({ length: r }, () => b.diag.syncStrokesMs())
    }, REPS)
    const orbit = await orbitFrames(page)
    const osn = await hoverOsnap(page)
    table[String(n)] = {
      scene: built,
      full_redraw_ms: stats(full),
      sync_strokes_ms: stats(sync),
      orbit_frame_ms: orbit,
      osnap: osn,
    }
    console.log(`[0부-22] 획 ${n} — 옐로 ${built.yellow}(승격 ${built.yellow_lifted}) · 전량 ${stats(full).median}ms`
      + ` · 궤도합 ${orbit ? orbit.total.toFixed(2) : '—'}ms · osnap ${osn.per_call_ms}ms`
      + `(교차 ${osn.intersect_ms} · 병합 ${osn.ends_merge_ms} · 나머지 ${osn.rest_ms})`)
    if (n === 800) sceneAtMax = built as unknown as Record<string, unknown>
  }

  // ── 기울기(200→800 = 4배: O(n)≈4 · O(n²)≈16) — 이 원장의 값어치 ────────────
  const at = (n: number, path: (t: any) => number | null | undefined) => {
    const v = path(table[String(n)])
    return typeof v === 'number' && isFinite(v) ? v : null
  }
  const ratioOf = (path: (t: any) => number | null | undefined) => {
    const a = at(200, path), b = at(800, path)
    return a !== null && b !== null && a > 0 ? +(b / a).toFixed(2) : null
  }
  const slope = {
    full_redraw: ratioOf(t => t.full_redraw_ms.median),
    sync_strokes: ratioOf(t => t.sync_strokes_ms.median),
    orbit_frame: ratioOf(t => t.orbit_frame_ms && t.orbit_frame_ms.total),
    osnap_total: ratioOf(t => t.osnap.per_call_ms),
    osnap_intersect: ratioOf(t => t.osnap.intersect_ms),
    osnap_ends_merge: ratioOf(t => t.osnap.ends_merge_ms),
    osnap_rest: ratioOf(t => t.osnap.rest_ms),
  }
  console.log(`[0부-22] 기울기(200→800 · O(n)≈4 · O(n²)≈16) — ${JSON.stringify(slope)}`)

  // 국면 자동 판별 — 짐작이 아니라 값(1-c 전: 옐로가 축·3D를 타므로 승격 >0 · 후: 0)
  const yl = (sceneAtMax as any).yellow_lifted as number
  const phase = yl > 0 ? 'before(1-c 전 — 옐로 획이 승격·오스냅에 든다)' : 'after(1-c 후 — 옐로 획이 2D다)'

  // 판별 하한(D-3 · #69 ㉣) — 격자가 실제로 갈리는가
  const g800 = table['800'] as any, g200 = table['200'] as any
  expect((sceneAtMax as any).strokes, '격자가 800에 도달').toBeGreaterThanOrEqual(800)
  expect((sceneAtMax as any).yellow, '절반이 옐로다').toBeGreaterThanOrEqual(380)
  expect(g800.osnap.calls, 'osnap 표식이 돌았다').toBeGreaterThan(0)
  expect(g800.full_redraw_ms.median, '800이 200보다 비싸다(격자가 갈린다 — #71 ㉢)')
    .toBeGreaterThan(g200.full_redraw_ms.median)

  const cost18Path = resolve(HERE, `../../stage0/out/cost18_web2${testInfo.project.name === 'dpr1' ? '' : '_' + testInfo.project.name}.json`)
  // cost18_ref — **구간이 다르다**(0·1부 리뷰 [8]): cost18 slope는 50→400(8배 — O(n)≈8·
  // O(n²)≈64), cost22 slope는 200→800(4배 — ≈4·≈16). 나란히 읽으려면 지수로 환산한다
  // (배수 b, 구간 k배 → 지수 log(b)/log(k)).
  const cost18Ref = existsSync(cost18Path)
    ? (() => {
      const j = JSON.parse(readFileSync(cost18Path, 'utf-8'))
      return { phase: j.phase, slope: j.slope, slope_span: '50→400(8배) — cost22의 200→800(4배)과 다른 구간: 지수로 환산해 비교한다' }
    })()
    : null

  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  const out = resolve(HERE, `../../stage0/out/cost22_web2${suffix}.json`)
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  // 원장은 LEDGER=1 단독 실행에서만 쓴다(web2-22 규율 — 전량·병렬 판이 네 번 오염을 냈다: #71 ㉠)
  if (process.env.LEDGER === '1') writeFileSync(out, JSON.stringify({
    what: 'web2-22 0부 — 자유 스케치 대역(200·400·800 · 절반 옐로)의 비용 재측정. 1-c(옐로를 오스냅·리프팅에서 뺀다)의 전/후를 이 표가 보인다.',
    phase,
    run: {
      note: '정본 명령: LEDGER=1 npx playwright test cost22 --workers=1 — **단독 실행**. LEDGER=1이 없으면 원장을 안 쓴다(전량·병렬 판 차단 — web2-22 규율, 네 번 재발한 #71 ㉠의 구조적 수리). 전 판(1-c 전)은 cost22_web2*_before.json — 그 파일의 run.note는 이 문구의 복사라 자기 자신을 가리킨다(사후 해명: before 판이 그 보존본이다).',
      project: testInfo.project.name,
      raw_ratio: RAW_RATIO,
    },
    environment: '헤드리스 크로뮴 · viewport 1200×800 · 절대 ms는 컨테이너 값 — **판별값은 slope(200→800 배수: O(n)≈4 · O(n²)≈16)**. 실기기는 진단 패널 ①②③④.',
    fixture_note: '카메라 닫는 픽스처 + 옐로 한 장(롤 버튼). 짝수 획 = 옐로 자유(전역 각도 — 축 대역 포함 #68 · 활성 겹) · 홀수 획 = 바탕 혼합(승격 노림/자유 — cost18 규격). 손 오차 2~5px · 시드 LCG.',
    metric_defs: {
      full_redraw_ms: '① #brushc 전량 재그리기(5회 min/median/max)',
      sync_strokes_ms: '② render3d.syncStrokes(5회)',
      orbit_frame_ms: '③ 궤도 프레임 3몫(r3·bs·d2 — 앱이 그 자리에서)',
      osnap: '④ 호버 이동 40회 호출당 평균 — intersect(intersections3)·ends_merge·rest 분해. rest는 뺄셈이라 음수 가능',
      slope: '200→800 배수 — 이 원장의 값어치. 1-c의 효과는 before/after 판의 osnap_* 기울기·절대 대역 차로 읽는다',
    },
    cost18_ref: cost18Ref,
    scene_at_800: sceneAtMax,
    grid: table,
    slope,
    resolution: {
      note: '#71 ㉢ — 이 표의 축(획 수)이 값을 실제로 가르는가를 하네스가 단언한다(800 full > '
        + '200 full). slope의 한 칸 소수점은 실행 변동 안이다 — 대역으로만 읽는다. '
        + '전/후 대조의 정본 채널은 **구조 값**(scene의 waiting·yellow_lifted — 결정론)이고 '
        + '절대 ms·slope는 참고다(#47 — 값을 이 산문에 박지 않는다: 값은 grid가 정본).',
      spans_800_gt_200: true,
    },
    falsification: '격자가 안 갈리면 표가 아무것도 안 잰 것이다 — 팔이 강제한다: 800 도달 · '
      + '옐로 ≥380 · osnap 호출 >0 · 800 full > 200 full. 국면(phase)은 옐로 승격 수의 자동 판별이다.',
    flags_explained: {
      'constants/metric_defs 스냅샷 없음': 'web2 라인 공통 형태(xint_web2와 같다)',
      'rest_ms 음수 가능': '뺄셈 분해의 타이머 분해능 — 그대로 적는다(cost18과 같은 유보)',
      'yellow_lifted 정확히 0(after 전 칸)': '측정이 아니라 **설계 보장**이다(자기참조 유형 3 — '
        + '옐로가 lift에서 빠지면 승격 0은 항등). 임계를 안 건다 — 이 값의 몫은 국면(전/후) 판별이다.',
      '옐로 비율·raw 비율이 전 칸 0.5 고정': '동작점이다(#12) — 지시 문면이 «절반»을 지정했다. '
        + '옐로 수를 흔든 칸은 없다(옐로 «자체»의 기여 0은 위 설계 보장이 말하고, 비율 축 스윕은 안 했다 — 정직 기재).',
      'ends_merge 같은 값 반복(0.09 등)': '0.01ms 분해능 아래의 양자화다 — 이 몫은 작아서 '
        + '표의 판정(교차 몫이 지배)과 무관.',
    },
  }, null, 1))
  console.log(`[0부-22] 원장 기록 — ${out} · phase=${phase}`)
})
