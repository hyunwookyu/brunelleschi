// web2-20 3-e ⑩ — **3-b 선택의 비용**(web2-18 값과 나란히 — 지시 원문).
//
// 이 회차의 3-b는 ⓐ(흑연 겹 분할)도 ⓑ(막 없이 물들여 그리기)도 아니다 —
// **영역 재조립**이다(filmlayer.ts drawFilms 머리주석): #brushc는 한 장 그대로 두고,
// 막 영역에 아래 캔버스 사본(drawImage×3)+in-canvas multiply 패턴을 얹고(#film),
// 활성 겹 획 몸체를 #layerc가 그린다. 그 한계 비용이 프레임 어디에 실리는가:
//   · 작도 시점(막 보임): d2 몫(= filmLayer.draw + draw2d)에 drawImage 셋 + 패턴 채우기
//   · 궤도(막은 포즈 게이트로 꺼짐): d2 몫에 #layerc 사영선만
//
// ⚠⚠ 절대 ms는 결론이 아니다(cost18 원장 environment — 이 컨테이너의 시간은 크게
// 흔들린다). **판별값은 같은 실행 안의 배수**다: 겹 없음 칸이 same-run 기준이고,
// cost18_web2.json의 400획 값은 «다른 실행»의 참조로만 나란히 적는다(#71 ㉠ —
// 전/후를 같은 조건으로 — 를 실행 단위로 지킨 형태다).
// ⚠ `--workers=1`로 돌린다(cost18과 같은 규율 — 워커 둘이면 값이 배 가까이 부푼다).

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const N = 400

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

/** 카메라를 닫는 픽스처 — cost18과 같은 규격(지평선+깊이선+수평 앵커) */
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

/** 격자 채우기 — cost18 fillTo의 rawIn 0% 갈래(같은 시드 규율·같은 손 오차 #68) */
async function fillTo(page: Page, target: number) {
  return page.evaluate((target) => {
    const b = (window as any).__b2
    let s = ((target * 131) >>> 0) || 1
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    const jit = () => {
      const r = 2 + rnd() * 3, a = rnd() * Math.PI * 2
      return { x: Math.cos(a) * r, y: Math.sin(a) * r }
    }
    const marks = b.diag.vpMarks() as { vp: { x: number; y: number } }[]
    while (b.app.doc.strokes.length < target) {
      const i = b.app.doc.strokes.length
      let placed = false
      if (i % 2 === 0 && marks.length > 0) {
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
            from.x + (dx / L) * len + j1.x, from.y + (dy / L) * len + j1.y)
          placed = true
        }
      }
      if (!placed) {
        const ax = 60 + rnd() * 1000, ay = 120 + rnd() * 600
        const ang = rnd() * Math.PI * 2, len = 60 + rnd() * 180
        const j0 = jit(), j1 = jit()
        b.diag.commitStroke(ax + j0.x, ay + j0.y, ax + Math.cos(ang) * len + j1.x, ay + Math.sin(ang) * len + j1.y)
      }
    }
    return { strokes: b.app.doc.strokes.length, lifted: b.app.lift.lifted.size, waiting: b.app.lift.waiting.length }
  }, target)
}

/** ③ 궤도 1프레임 3몫 — cost18 orbitFrames와 같은 몸짓(중버튼 30이동) */
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

/** 작도 시점 프레임 — 호버 이동 40회가 만드는 프레임의 3몫(막이 보이는 국면) */
async function drawPoseFrames(page: Page) {
  await page.evaluate(() => (window as any).__b2.diag.frameCostReset())
  for (let i = 0; i < 40; i++) await page.mouse.move(200 + (i * 17) % 800, 200 + (i * 29) % 400)
  await settle(page)
  return await page.evaluate(() => (window as any).__b2.diag.frameCost()) as
    { n: number; r3: number; bs: number; d2: number; total: number; totalMax: number } | null
}

test('⑩ 3-b(영역 재조립)의 400획 프레임 비용 — 겹 없음/겹+막 나란히 · cost18 참조', async ({ page }, testInfo) => {
  test.setTimeout(600_000)
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await fixture(page)
  const scene = await fillTo(page, N)
  await settle(page)
  expect(scene.strokes, '격자가 실제로 400에 도달한다').toBeGreaterThanOrEqual(N)
  expect(scene.lifted, '승격 획이 섞였다').toBeGreaterThan(0)

  // ── 기준 칸: 겹 없음(= web2-18 경로 그대로 — 막·#layerc 둘 다 이르게 반환) ──────
  const baseDraw = await drawPoseFrames(page)
  const baseOrbit = await orbitFrames(page)

  // ── 비교 칸: 트레이싱지 한 장 + 그 위 획 20 — 막이 보이는 상태로 같은 몸짓 ──────
  const layId = await page.evaluate(() => (window as any).__b2.diag.layerAdd('tracing'))
  expect(layId, '겹이 실제로 얹혔다(카메라 닫힘 게이트 통과)').not.toBeNull()
  await page.evaluate(() => {
    const b = (window as any).__b2
    for (let i = 0; i < 20; i++) b.diag.commitStroke(150 + i * 40, 250, 150 + i * 40, 380)
  })
  await settle(page)
  const filmOn = await page.evaluate(() => {
    const f = document.getElementById('film') as HTMLCanvasElement
    return f && f.style.display !== 'none'
  })
  expect(filmOn, '막이 실제로 그려지는 국면이다(#69 ㉣ — 안 그려진 값을 적기 전에 확인)').toBe(true)
  const withDraw = await drawPoseFrames(page)
  const withOrbit = await orbitFrames(page)

  // ── 알파 대조 칸(1차 리뷰 [13] — 「비용은 알파와 같다」(지시 3-a)를 짐작으로 안 남긴다) ──
  await page.evaluate(() => (window as any).__b2.diag.filmAlphaForTest(true))
  const alphaDraw = await drawPoseFrames(page)
  await page.evaluate(() => (window as any).__b2.diag.filmAlphaForTest(false))

  // ── 무거운 칸(1차 리뷰 [7] — 「1.0×」가 동작점 하나가 아님을 두 번째 점이 낸다):
  //    겹 셋·겹 소속 획 100 — #layerc가 궤도 매 프레임 사영하는 수가 5배로 는다 ──────
  await page.evaluate(() => {
    const b = (window as any).__b2
    b.diag.layerAdd('yellow'); b.diag.layerAdd('yellow')
    for (let i = 0; i < 80; i++) b.diag.commitStroke(100 + (i % 26) * 42, 200 + Math.floor(i / 26) * 90, 100 + (i % 26) * 42, 260 + Math.floor(i / 26) * 90)
  })
  await settle(page)
  const heavy = await page.evaluate(() => {
    const b = (window as any).__b2
    return {
      layers: b.app.doc.layers.length,
      layer_strokes: b.app.doc.strokes.filter((s: any) => s.layer !== undefined).length,
    }
  })
  const heavyDraw = await drawPoseFrames(page)
  const heavyOrbit = await orbitFrames(page)

  for (const [nm, q] of [['base_draw', baseDraw], ['base_orbit', baseOrbit], ['with_draw', withDraw], ['with_orbit', withOrbit], ['alpha_draw', alphaDraw], ['heavy_draw', heavyDraw], ['heavy_orbit', heavyOrbit]] as const)
    expect(q && q.n > 0, `${nm} 표본이 실제로 잡혔다`).toBe(true)

  // cost18 참조(다른 실행 — 나란히 적기만, 같은-실행 비교는 위의 base_* 칸이 한다)
  let ref18: unknown = null
  try {
    const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
    const j = JSON.parse(readFileSync(resolve(HERE, `../../stage0/out/cost18_web2${suffix}.json`), 'utf-8'))
    ref18 = { file: `cost18_web2${suffix}.json`, orbit_frame_ms_400_raw0: j.grid?.raw_0pct?.['400']?.orbit_frame_ms ?? null }
  } catch { ref18 = null }

  const pair = (a: number, b: number) => `${b.toFixed(1)}ms / ${a.toFixed(1)}ms`
  const out = {
    what: 'web2-20 3-e ⑩ — 3-b(영역 재조립: #film 사본+곱 · #layerc 몸체)의 400획 프레임 비용. 겹 없음 칸이 same-run 기준, cost18 값은 다른 실행의 참조.',
    run: { project: testInfo.project.name, note: '`npx playwright test cost20 --workers=1` — cost18과 같은 규율(전량 e2e도 workers=1로 돈다). 절대 ms는 컨테이너 변동이 크다 — 판별은 같은 실행 안의 대비이고, 배수가 아니라 분자/분모 그대로 읽는다(#16 — base 칸이 0.1ms 양자화 대역이라 배수의 분모가 흔들린다: 1차 리뷰 [2]).' },
    scene_at_400: {
      ...scene,
      raw_ratio: 0,
      note_fixture: 'cost18 fillTo의 rawIn 0% 갈래와 같은 규격(승격/자유 획 교대·끝점 지터 #68). with 칸 = 트레이싱지 1장(rect=전체 화면 1200×800)·겹 소속 획 20. heavy 칸 = 겹 셋(트레이싱지1+옐로2, rect 전부 전체 화면)·겹 소속 획 100 — 아래 heavy_scene이 실측.',
    },
    heavy_scene: heavy,
    frames: {
      base_draw_pose: baseDraw, with_film_draw_pose: withDraw, alpha_film_draw_pose: alphaDraw,
      base_orbit: baseOrbit, with_layer_orbit: withOrbit,
      heavy_draw_pose: heavyDraw, heavy_orbit: heavyOrbit,
    },
    comparison: {
      draw_pose_total: pair(baseDraw!.total, withDraw!.total) + ' (막 켬 / 겹 없음)',
      orbit_total: pair(baseOrbit!.total, withOrbit!.total) + ' (겹+막 / 겹 없음 — 궤도에서 막은 포즈 게이트로 꺼진다)',
      heavy_orbit_total: pair(baseOrbit!.total, heavyOrbit!.total) + ' (겹 셋·소속 획 100 / 겹 없음)',
      alpha_vs_multiply_draw: pair(withDraw!.total, alphaDraw!.total) + ' (알파 / 곱 — 지시 3-a 「비용은 알파와 같다」의 실측)',
      d2_delta_draw_ms: +(withDraw!.d2 - baseDraw!.d2).toFixed(3),
      d2_delta_orbit_ms: +(withOrbit!.d2 - baseOrbit!.d2).toFixed(3),
      note: '막의 몫은 d2 조각에 실린다(frame()에서 filmLayer.draw가 draw2d와 같은 구간). 궤도 칸의 델타는 #layerc 사영선의 몫이다.',
    },
    cost18_ref: ref18 === null ? null : { ...(ref18 as object), how: '하네스가 cost18_web2*.json을 읽어 넣는다 — 손 인용이 아니다(1차 리뷰 [3]). 다른 실행의 값이므로 나란히 적을 뿐, 비교는 같은 실행의 base 칸이 한다.' },
    metric_defs: {
      frames: '앱이 그 자리에서 잰 프레임 3몫(r3=render3d·bs=brushLayer.sync·d2=filmLayer.draw+draw2d)의 중앙값 — cost18 ③과 같은 함수(frameCostQ). draw_pose는 호버 40이동, orbit은 중버튼 30이동. 국면별 리셋.',
      comparison: '같은 실행 안의 분자/분모 쌍(#16). 배수를 안 적는 이유: base가 0.1ms 양자화 대역이라 분모의 ±0.2ms가 배수를 수십 % 움직인다(1차 리뷰 [2] 실측 — 같은 코드 두 실행에서 13.5×→17.25×).',
    },
    flags_explained: {
      '상수·지표 스냅샷 없음': 'cost18 원장과 같은 유보 — e2e 하네스라 test/constants.ts의 공유 상수를 안 쓴다(재는 것은 프레임 ms뿐). 스냅샷 대조가 잡을 낡음이 정의상 없다.',
      'base·orbit 칸 값이 서로 같아 보임': '분해능이다 — frameCostQ의 ms가 0.1 단위 대역이고 겹 없는 경로는 1~2ms라 칸이 붙는다. 판별은 comparison의 분자/분모 쌍이 낸다.',
    },
  }
  const suffix = testInfo.project.name === 'dpr1' ? '' : `_${testInfo.project.name}`
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(resolve(HERE, `../../stage0/out/cost20_web2${suffix}.json`), JSON.stringify(out, null, 2))
  console.log(`[⑩] draw ${out.comparison.draw_pose_total} · orbit ${out.comparison.orbit_total} · heavy orbit ${out.comparison.heavy_orbit_total} · alpha ${out.comparison.alpha_vs_multiply_draw}`)
})
