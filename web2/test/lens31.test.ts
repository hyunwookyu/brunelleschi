// web2-31 2번 — **보기 렌즈: 확정된 뒤에 «보는 방식»만 바꾼다.**
//
// ⚠⚠ **요점 하나 — 게이트 둘은 «구성상 보장»이지 측정이 아니다**(CLAUDE.md §5.1 자기참조
//     유형 3 · #77 ㉡). ① 「손대지 않은 렌더가 지금과 픽셀 동일」은 `viewF`의 기본값이
//     `null`이고 그때 `viewXf`가 **`app.view`를 그대로** 내므로 f가 무엇이든 0이 나온다.
//     ③ 「3D 좌표가 안 변한다」도 리프팅이 `viewF`를 **아예 안 읽으므로** 구성상 0이다.
//     **그래서 그 두 칸에는 임계를 안 건다** — 판별력은 아래 위약 판이 낸다:
//
//       판 ⓐ 「렌즈를 실제로 넣은 판」   → **①의 픽셀 동일 검사**가 빨개진다
//       판 ⓑ 「`viewF`가 lift로 새는 판」 → **③의 좌표 전수 비교**가 빨개진다(값 축·정체 축)
//       판 ⓒ 「커밋이 렌즈를 무시하는 판」 → **④ 원칙 d**가 빨개진다(31-3의 「뷰 오프셋 무시 판」 형태)
//
// ⚠⚠ **요점 둘 — 위약이 «안 갈리는 축»에서 돌린 팔은 아무것도 안 잰다**(#86 ㉠).
//     `viewF`를 f와 **같은 값**으로 두고 재면 판 ⓑ도 초록이다. 그래서 전부 **다른 값**
//     (k = 0.5 · 2 — `C.LENS_K_MIN/MAX`의 양 끝)에서 돈다.
//
// ⚠⚠ **요점 셋 — 지시가 적은 승격이 이 자리에서 «렌즈가 켜진 채로»는 안 일어난다**(D-4 · #35).
//     web2에 실재하는 승격은 P1→P2 하나이고(#86 ㉢), 그 전 국면(소실점 1 · 화면수평 미선언)은
//     `constructionDone === false`라 **렌즈가 잠겨 있다**. 그래서 문면 그대로의 게이트는
//     «렌즈가 내내 null»이라는 공허한 참이다 — 그 사실을 값으로 적고, **렌즈가 켜진 채로
//     실제로 도달 가능한 재확정**(되돌리기로 two-vp → default)에서 초기화를 잰다.
//
// 원장: LEDGER=1 npx vitest run test/lens31.test.ts  →  stage0/out/lens31_web2.json

import { describe, it, expect, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** **위약 판 ⓑ의 스위치**(#83 ㉠ — 위약 팔이 없으면 그 수는 기제의 이득이 아니다).
 *  `analyze`를 감싸 **리프팅이 읽는 f를 `viewF`로 바꾼다** — 「보기값이 lift 경로까지
 *  새는 판」이 하는 일 그대로다. 기본은 1이라 다른 팔은 진짜 `analyze`를 지난다. */
const LEAK = vi.hoisted(() => ({ k: 1 }))
vi.mock('../src/core/camera', async (orig) => {
  const m = await orig<typeof import('../src/core/camera')>()
  return {
    ...m,
    analyze: (doc: Parameters<typeof m.analyze>[0]) => {
      const a = m.analyze(doc)
      return LEAK.k === 1 || a.f === null ? a : { ...a, f: a.f * LEAK.k }
    },
  }
})

import { project, DRAW_POSE, type Analysis } from '../src/core/camera'
import { session, type Session } from './session'
import {
  createApp, setViewF, resetViewLens, viewXf, viewScale, screenToDoc, docToScreen,
  undo, beginErase, eraseAt, endErase, loadDoc, clearAll, type App,
} from '../src/app/state'
import { liftAll } from '../src/core/lift'
import { lensAllowed, lensK, lensF, lensStops, hfovDeg, LENS_STOP_MIN, LENS_STOP_MAX } from '../src/core/lens'
import { C } from '../src/core/constants'
import type { Pt } from '../src/core/vec'
import type { ViewOffset } from '../src/core/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const r6 = (x: number) => Number(x.toFixed(6))
const W = 1200, H = 800
const ledger: Record<string, unknown> = {}

/** **고치기 «전»의 문서 → 화면**(D-2) — 이 회차가 들어오기 전 `docToScreen`의 식 그대로다.
 *  게이트 ①이 재는 상대가 이것이고, 「지금과 픽셀 단위로 동일」의 «지금»이 이 함수다. */
const plainDocToScreen = (v: ViewOffset, p: Pt): Pt => ({ x: p.x * v.s + v.ox, y: p.y * v.s + v.oy })
const plainScreenToDoc = (v: ViewOffset, p: Pt): Pt => ({ x: (p.x - v.ox) / v.s, y: (p.y - v.oy) / v.s })
const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const med = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y)
  return a.length === 0 ? 0 : a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2
}

// ── 장면 넷 — **확정의 두 갈래 × 렌즈 대역의 양 끝**(D-5 · #84 ㉡) ────────────────
// 어느 쪽이든 **앱과 같은 경로**로 그린다(`session`) — 손으로 doc에 밀어넣으면 앱이
// 실제로 만드는 기하를 안 재게 된다.

/** **P2 · 좁은 화각**(f ≈ 2.74W) — 소실점을 화면 폭의 2.5·3배 밖에 찍는다(zoom31과 같은 구도). */
function sceneP2Tele(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)      // 지평선
  s.draw(3600, 400, 3600, 400)     // vp0 찍기
  s.draw(-3000, 400, -3000, 400)   // vp1 찍기 → 여기서 two-vp
  s.draw(500, 500, 620, 486)
  s.draw(500, 500, 380, 486)
  s.draw(500, 500, 500, 380)
  s.draw(500, 380, 620, 366)
  return s
}

/** **P2 · 넓은 화각**(f ≈ 0.87W) — 소실점이 화면 가까이. 대역의 반대 끝이다. */
function sceneP2Wide(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(1720, 400, 1720, 400)     // vp0 (+1120 = 0.93W)
  s.draw(-160, 400, -160, 400)     // vp1 (−760 = 0.63W) → f² = 1120·760
  s.draw(500, 520, 610, 506)
  s.draw(500, 520, 400, 507)
  s.draw(500, 520, 500, 400)
  s.draw(500, 400, 610, 386)
  return s
}

/** **P1 잠금**(화면 수평 선언 — `lock1pt.test.ts`의 그 구도). `fSource: 'default'`인데
 *  `constructionDone`이라 **렌즈가 있는 국면**이다. 두 갈래를 다 덮는다. */
function sceneP1Locked(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)      // 지평선
  s.draw(500, 650, 680, 537.5)     // 깊이선 → vp0 = (900,400)
  s.draw(500, 650, 700, 650)       // 화면 수평 — 여기서 1점이 잠긴다
  s.draw(500, 650, 500, 500)       // 세로 기둥
  s.draw(500, 500, 590, 443.75)    // 기둥 위에서 vp0 방향
  return s
}

/** **승격 «직전»**(소실점 1 · 화면수평 미선언) — 여기서 vp1을 찍으면 default → two-vp다.
 *  ⚠ 획을 더 얹지 않는다: 소실점 방향에서 살짝 벗어난 획은 **둘째 소실점을 만들어** 그 자리에서
 *  이미 승격돼 버린다(실측 — 초판이 그렇게 `constructionDone: true`가 됐다). 이 장면이 재는 것은
 *  「승격 «전»의 국면」이므로 그 상태를 지키는 최소 구성으로 둔다. */
function sceneBeforePromote(): Session {
  const s = session(W, H)
  s.draw(100, 400, 1100, 400)
  s.draw(3600, 400, 3600, 400)     // vp0만
  s.draw(500, 500, 620, 486)
  s.draw(500, 500, 500, 380)
  return s
}

const SCENES: { key: string; label: string; make: () => Session }[] = [
  { key: 'p2_tele', label: 'P2 · 좁은 화각', make: sceneP2Tele },
  { key: 'p2_wide', label: 'P2 · 넓은 화각', make: sceneP2Wide },
  { key: 'p1_locked', label: 'P1 잠금(화면수평 선언)', make: sceneP1Locked },
]
/** 렌즈 대역의 **양 끝**에서 돈다 — `viewF`를 f와 같은 값으로 두면 아무것도 안 갈린다(#86 ㉠) */
const KS = [C.LENS_K_MIN, C.LENS_K_MAX]

/** 그 장면에서 «화면에 놓이는 문서 점» 전부 — 획 끝점 + 승격 3D의 사영 + 프레임 네 모서리 */
function docPoints(app: App): Pt[] {
  const out: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: 0, y: H }, { x: W, y: H }]
  for (const s of app.doc.strokes) { out.push(s.a, s.b) }
  for (const [, g] of app.lift.lifted) {
    const a = project(app.lift.an, app.pose, g.a3), b = project(app.lift.an, app.pose, g.b3)
    if (a) out.push(a); if (b) out.push(b)
  }
  return out
}

const segsOf = (app: App) => [...app.lift.lifted].map(([id, g]) => ({ id, g, axis: g.axis }))
/** **정체 축**(#86) — 「무엇이 무엇으로 풀렸는가」. 값이 아니라 목록이다. */
const identityOf = (app: App) => JSON.stringify({
  lifted: [...app.lift.lifted.keys()].sort((a, b) => a - b),
  axes: [...app.lift.lifted].map(([id, g]) => `${id}:${g.axis ?? '-'}`).sort(),
  waiting: [...app.lift.waiting].sort((a, b) => a - b),
  anchor: app.lift.anchorId, scale: app.lift.scaleId,
})

describe('web2-31 2번 — 보기 렌즈', () => {
  it('① 손대지 않은 렌더는 **구성상 항등** — 그리고 렌즈를 넣으면 그 검사가 빨개진다 (D-3)', () => {
    const rows: Record<string, unknown>[] = []
    for (const sc of SCENES) {
      const s = sc.make()
      const app = s.app
      expect(lensAllowed(app.lift.an), `${sc.key} — 확정된 국면이어야 한다`).toBe(true)
      const pts = docPoints(app)

      // ── 항등 칸: `viewF === null`이면 «고치기 전 식»과 **정확히 같은 수**다 ──
      expect(app.viewF).toBe(null)
      const identical = pts.map(p => d2(docToScreen(app, p), plainDocToScreen(app.view, p)))
      const idMax = Math.max(...identical)
      expect(idMax).toBe(0)                              // 임계가 아니라 **항등**이다
      expect(viewXf(app)).toBe(app.view)                 // 같은 객체를 그대로 낸다
      expect(viewScale(app)).toBe(app.view.s)
      expect(lensK(app.lift.an, app.viewF)).toBe(1)

      // ── 반증(판 ⓐ): 렌즈를 실제로 넣으면 그 검사가 빨개진다 ──
      const drifts: Record<string, { max: number; median: number; f_screen_fold: number }> = {}
      for (const k of KS) {
        const f0 = app.lift.an.f!
        expect(setViewF(app, f0 * k)).toBe(true)
        const dd = pts.map(p => d2(docToScreen(app, p), plainDocToScreen(app.view, p)))
        drifts[`k${k}`] = {
          max: r6(Math.max(...dd)), median: r6(med(dd)),
          f_screen_fold: r6((viewXf(app).s * app.lift.an.f!) / (app.view.s * app.lift.an.f!)),
        }
        expect(Math.max(...dd), `${sc.key} k=${k} — 렌즈를 넣으면 픽셀 동일이 깨져야 한다`).toBeGreaterThan(1)
        // ⚠ **해의 값은 그대로다** — 렌즈가 건드리는 것은 렌더의 초점거리뿐이다
        expect(app.lift.an.f).toBe(f0)
        expect(app.lift.an.fSource).toBe(app.lift.an.fSource)
        expect(r6(lensK(app.lift.an, app.viewF))).toBe(r6(k))
        expect(r6(lensF(app.lift.an, app.viewF)!)).toBe(r6(f0 * k))
      }
      resetViewLens(app)
      expect(Math.max(...pts.map(p => d2(docToScreen(app, p), plainDocToScreen(app.view, p))))).toBe(0)

      rows.push({
        scene: sc.key, label: sc.label, points: pts.length,
        f: r6(app.lift.an.f!), f_over_W: r6(app.lift.an.f! / W), fSource: app.lift.an.fSource,
        hfov_deg: r6(hfovDeg(app.lift.an.f!, W)),
        untouched_max_px: idMax, falsify_a_lens: drifts,
      })
      console.log(`[31-2 ①] ${sc.label} — 손 안 댄 렌더 어긋남 ${idMax.toFixed(6)} px · `
        + `k=${KS[0]} ${drifts[`k${KS[0]}`]!.max} px · k=${KS[1]} ${drifts[`k${KS[1]}`]!.max} px`)
    }
    ledger['gate1_pixel_identity'] = {
      what: '**구성상 항등이다 — 임계를 안 건다**(#77 ㉡). `viewF`가 null이면 `viewXf`가 `app.view`를 '
        + '그대로 내므로 f가 무엇이든 0이 나온다. 판별력은 `falsify_a_lens`(렌즈를 실제로 넣은 판)가 준다.',
      rows,
    }
  })

  it('② 확정 전에는 조작이 없다 — 그리고 확정 뒤에는 먹힌다 (D-3)', () => {
    const rows: Record<string, unknown>[] = []
    // 확정 전의 국면 넷 — 빈 문서부터 «소실점 하나(미잠금)»까지
    const before: { key: string; make: () => App }[] = [
      { key: 'empty', make: () => createApp(W, H) },
      { key: 'horizon_only', make: () => { const s = session(W, H); s.draw(100, 400, 1100, 400); return s.app } },
      { key: 'one_vp', make: () => sceneBeforePromote().app },
      { key: 'content_only', make: () => { const s = session(W, H); s.draw(300, 600, 500, 550); return s.app } },
    ]
    for (const b of before) {
      const app = b.make()
      const an = app.lift.an
      const ok = setViewF(app, (an.f ?? 1000) * 2)
      rows.push({
        state: b.key, vps: an.vps.length, fSource: an.fSource,
        screenHDeclared: an.screenHDeclared, constructionDone: an.constructionDone,
        lens_allowed: lensAllowed(an), set_accepted: ok, viewF: app.viewF, k: lensK(an, app.viewF),
      })
      expect(lensAllowed(an), `${b.key} — 확정 전이므로 렌즈가 없다`).toBe(false)
      expect(ok, `${b.key} — 조작이 안 먹혀야 한다`).toBe(false)
      expect(app.viewF).toBe(null)
      expect(lensK(an, app.viewF)).toBe(1)
      // 화면 변환도 그대로다(렌즈가 없으니 «지금»과 같다)
      expect(viewXf(app)).toBe(app.view)
    }
    // 반증 짝 — **확정 뒤에는 같은 호출이 먹힌다**(잠금이 「항상 거짓」이 아니라는 증거)
    for (const sc of SCENES) {
      const app = sc.make().app
      const ok = setViewF(app, app.lift.an.f! * C.LENS_K_MAX)
      rows.push({
        state: sc.key, vps: app.lift.an.vps.length, fSource: app.lift.an.fSource,
        screenHDeclared: app.lift.an.screenHDeclared, constructionDone: app.lift.an.constructionDone,
        lens_allowed: true, set_accepted: ok, viewF: r6(app.viewF!), k: r6(lensK(app.lift.an, app.viewF)),
      })
      expect(ok).toBe(true)
      expect(app.viewF).not.toBe(null)
    }
    // 대역 — 넘겨 주면 물린다(손잡이가 대역 밖으로 못 나간다)
    const app = sceneP2Tele().app
    const f0 = app.lift.an.f!
    setViewF(app, f0 * 100)
    expect(r6(lensK(app.lift.an, app.viewF))).toBe(r6(C.LENS_K_MAX))
    setViewF(app, f0 / 100)
    expect(r6(lensK(app.lift.an, app.viewF))).toBe(r6(C.LENS_K_MIN))
    expect(r6(lensStops(app.lift.an, app.viewF))).toBe(r6(LENS_STOP_MIN))
    setViewF(app, null)
    expect(app.viewF).toBe(null)
    expect(lensStops(app.lift.an, app.viewF)).toBe(0)
    console.log(`[31-2 ②] 확정 전 ${before.length}칸 전부 조작 없음 · 확정 뒤 ${SCENES.length}칸 전부 먹힘 · `
      + `대역 [${C.LENS_K_MIN}, ${C.LENS_K_MAX}] (스톱 ${LENS_STOP_MIN}~${LENS_STOP_MAX})`)
    ledger['gate2_locked_before_standing'] = {
      what: '「확정」의 술어는 `constructionDone`이다 — web2에 `fSource: \'none\'`은 안 선다(D-4 · `core/lens.ts` 머리말).',
      rows,
      band: { k_min: C.LENS_K_MIN, k_max: C.LENS_K_MAX, stop_min: LENS_STOP_MIN, stop_max: LENS_STOP_MAX, step_log2: C.LENS_STEP_LOG2 },
    }
  })

  it('③ 3D 좌표 불변 — **구성상 보장**이고, 위약(lift로 새는 판)이 값 축·정체 축에서 갈린다 (#86)', () => {
    const rows: Record<string, unknown>[] = []
    for (const sc of SCENES) {
      const app = sc.make().app
      const base = segsOf(app)
      const baseId = identityOf(app)
      expect(base.length).toBeGreaterThan(0)   // 잴 것이 실제로 있다(0건 통과 ⛔)

      // ── 보장 칸: 렌즈를 양 끝으로 흔들어도 좌표가 **한 자리도** 안 움직인다 ──
      const guard: Record<string, number> = {}
      for (const k of KS) {
        setViewF(app, app.lift.an.f! * k)
        const now = segsOf(app)
        let mx = 0
        for (let i = 0; i < base.length; i++) {
          const a = base[i]!.g, b = now[i]!.g
          mx = Math.max(mx, Math.abs(a.a3.x - b.a3.x), Math.abs(a.a3.y - b.a3.y), Math.abs(a.a3.z - b.a3.z),
            Math.abs(a.b3.x - b.b3.x), Math.abs(a.b3.y - b.b3.y), Math.abs(a.b3.z - b.b3.z))
        }
        guard[`k${k}`] = mx
        expect(mx).toBe(0)                       // 임계가 아니라 **보장**이다
        expect(identityOf(app)).toBe(baseId)
      }
      resetViewLens(app)

      // ── 위약 판 ⓑ: `analyze`가 내는 f를 `viewF`로 바꾼다(= lift 경로까지 새는 판) ──
      const placebo: Record<string, unknown> = {}
      for (const k of KS) {
        LEAK.k = k
        const leaked = liftAll(app.doc, false)
        LEAK.k = 1
        const now = [...leaked.lifted]
        // **값 축** — 좌표가 얼마나 갈렸나(세계 단위 · 그리고 선분 길이의 fold)
        const dabs: number[] = []; const folds: number[] = []
        for (const { id, g } of base) {
          const q = leaked.lifted.get(id)
          if (!q) continue
          dabs.push(Math.hypot(g.a3.x - q.a3.x, g.a3.y - q.a3.y, g.a3.z - q.a3.z))
          dabs.push(Math.hypot(g.b3.x - q.b3.x, g.b3.y - q.b3.y, g.b3.z - q.b3.z))
          const L0 = Math.hypot(g.b3.x - g.a3.x, g.b3.y - g.a3.y, g.b3.z - g.a3.z)
          const L1 = Math.hypot(q.b3.x - q.a3.x, q.b3.y - q.a3.y, q.b3.z - q.a3.z)
          if (L0 > 1e-9) folds.push(Math.max(L1 / L0, L0 / Math.max(L1, 1e-12)))
        }
        // **정체 축** — 「무엇이 무엇으로 풀렸는가」가 바뀌었나
        const leakId = JSON.stringify({
          lifted: [...leaked.lifted.keys()].sort((a, b) => a - b),
          axes: now.map(([id, g]) => `${id}:${g.axis ?? '-'}`).sort(),
          waiting: [...leaked.waiting].sort((a, b) => a - b),
          anchor: leaked.anchorId, scale: leaked.scaleId,
        })
        placebo[`k${k}`] = {
          cells: dabs.length,
          split_cells: dabs.filter(d => d > 1e-9).length,
          drift_units_min: r6(Math.min(...dabs)), drift_units_median: r6(med(dabs)),
          drift_units_max: r6(Math.max(...dabs)),
          length_fold_median: r6(med(folds)), length_fold_max: r6(Math.max(...folds)),
          lifted_before: base.length, lifted_after: leaked.lifted.size,
          identity_changed: leakId !== baseId,
          identity_note: leakId === baseId
            ? '**정체 축은 안 갈린다** — 이 칸에서 위약을 잡는 것은 값 축뿐이다.'
            : '정체가 갈렸다 — 풀린 획·축 배정·대기 목록·앵커 중 하나가 바뀌었다.',
        }
        expect(dabs.length).toBeGreaterThan(0)
        expect(Math.max(...dabs), `${sc.key} k=${k} — 위약은 좌표를 실제로 움직여야 한다`).toBeGreaterThan(1e-6)
      }
      rows.push({ scene: sc.key, label: sc.label, lifted: base.length, guard_max_units: guard, placebo })
      const p = placebo[`k${KS[1]}`] as { drift_units_max: number; length_fold_max: number; identity_changed: boolean }
      console.log(`[31-2 ③] ${sc.label} — 보장 0 · 위약(k=${KS[1]}) 좌표 최대 ${p.drift_units_max} 단위 · `
        + `길이 fold ${p.length_fold_max} · 정체 갈림 ${p.identity_changed}`)
    }
    ledger['gate3_coords_frozen'] = {
      what: '**구성상 보장이다 — 임계를 안 건다**: `liftAll`은 `viewF`를 읽는 자리가 없다. '
        + '판별력은 `placebo`(analyze가 내는 f를 viewF로 바꾼 판)가 준다.',
      placebo_what_it_establishes: '⚠ **이 위약이 세우는 것은 「보기 렌즈 기제가 이득이다」가 아니라 '
        + '「이 구현이 그 누수를 실제로 막고 있다」이다**(1차 리뷰어 [9] · #83 ㉠ 후단). '
        + '「f가 깊이 배율이다」는 이 저장소가 이미 못 박은 사실이고(CLAUDE.md §1 · D-L53 — 특히 `p1_locked`의 '
        + 'f는 임의 게이지라 그 칸의 fold 1.5·2는 «게이지를 바꾼 값»이다). 그래서 이 판이 재는 축은 '
        + '**「viewF가 lift에 닿는가」 하나**이고, 물음은 크기가 아니라 **갈리는가**다.',
      placebo_how: "vi.mock으로 `core/camera`의 `analyze`를 감싸 `f → f·k`로 낸다 — 「보기값이 lift 경로까지 새는 판」이 하는 일 그대로다. 기본 k=1이라 다른 팔은 진짜 analyze를 지난다.",
      two_axes_note: '#86 — 값 축과 정체 축을 따로 잰다. **실측은 둘 다 갈렸다**(여섯 칸 전부 `identity_changed: true`) — '
        + '사전 예상(「f 배율은 주점 기준 균등 배율이라 소실점의 화면 자리가 안 움직이므로 축 배정도 그대로일 것」)이 '
        + '틀렸고 측정을 따른다(D-4). ⚠⚠ **그래도 값 축에는 거의 안 갈리는 칸이 있다**: `p2_tele`의 길이 fold가 '
        + '1.03 대다 — 길이 «비»만 재는 팔이라면 그 칸에서 위약을 통과시킬 뻔했다. 그래서 값 축도 **비가 아니라 '
        + '좌표 절대 드리프트**(세계 단위)를 같이 적는다.',
      rows,
    }
  })

  it('④ 원칙 d — 렌즈를 바꾼 상태에서 그은 획이 화면에서 본 자리에 놓인다 (+ 렌즈 무시 커밋 판)', () => {
    const rows: Record<string, unknown>[] = []
    /** 화면에서 짚는 자리 — **모델에 붙는 둘 + 빈 곳 둘**(D-5).
     *  ⚠ 빈 곳만 그으면 획이 대기로 남아 「잉크가 심판이다」가 **한 칸도 안 재진다**(초판이
     *  그랬다 — `lifted: 0`). 그래서 이미 승격된 끝점에서 소실점 쪽으로 긋는 손짓을 넣는다:
     *  시작점 스냅이 그 3D를 물려받아 새 획이 실제로 올라간다. **화면 좌표로 만든다** —
     *  사람이 보는 것이 화면이고, 렌즈가 바뀌면 같은 세계 점이 다른 화면 자리에 있다. */
    function gesturesFor(app: App): [Pt, Pt][] {
      const out: [Pt, Pt][] = []
      const seg = [...app.lift.lifted][0]
      const vp = app.lift.an.vps[0]
      if (seg && vp) {
        const anchorDoc = project(app.lift.an, app.pose, seg[1].b3)
        if (anchorDoc) {
          const S = docToScreen(app, anchorDoc)
          const V = docToScreen(app, { x: vp.x, y: vp.y })
          const L = Math.hypot(V.x - S.x, V.y - S.y) || 1
          out.push([S, { x: S.x + (V.x - S.x) / L * 90, y: S.y + (V.y - S.y) / L * 90 }])   // 소실점 방향
          out.push([S, { x: S.x, y: S.y - 90 }])                                            // 화면 세로
        }
      }
      out.push([{ x: 250, y: 250 }, { x: 380, y: 320 }])          // 빈 곳(대기로 남는다)
      out.push([{ x: 900, y: 640 }, { x: 1000, y: 600 }])
      return out
    }
    for (const sc of SCENES) {
      for (const k of [1, ...KS]) {
        const s = sc.make()
        const app = s.app
        if (k !== 1) expect(setViewF(app, app.lift.an.f! * k)).toBe(true)
        const GESTURES = gesturesFor(app)
        const roundtrip: number[] = []      // 화면 → 문서 → 화면 (변환이 서로의 역인가)
        const inkJudge: number[] = []       // 승격 3D를 다시 사영한 자리 ↔ 그 획의 잉크
        const snapMove: number[] = []       // 스냅이 끝점을 옮긴 거리(정보 — 게이트가 아니다)
        const placebo: number[] = []        // 커밋이 렌즈를 무시하는 판
        let lifted = 0
        for (const [S, E] of GESTURES) {
          const a = screenToDoc(app, S), b = screenToDoc(app, E)
          roundtrip.push(d2(docToScreen(app, a), S), d2(docToScreen(app, b), E))
          const st = s.draw(a.x, a.y, b.x, b.y)
          if (!st) continue
          // ⚠ 커밋 좌표는 **스냅이 옮긴 뒤**의 값이다 — 그것은 앱이 제 일을 한 것이므로
          //   게이트가 아니라 관측으로 적는다. 원칙 d가 묻는 것은 아래 «잉크가 심판이다»다.
          snapMove.push(d2(docToScreen(app, st.a), docToScreen(app, a)))
          snapMove.push(d2(docToScreen(app, st.b), docToScreen(app, b)))
          const g = app.lift.lifted.get(st.id)
          if (g) {
            lifted++
            const pa = project(app.lift.an, app.pose, g.a3), pb = project(app.lift.an, app.pose, g.b3)
            if (pa) inkJudge.push(d2(docToScreen(app, pa), docToScreen(app, st.a)))
            if (pb && st.dim === undefined) inkJudge.push(d2(docToScreen(app, pb), docToScreen(app, st.b)))
          }
          // **위약 판 ⓒ** — 커밋이 `screenToDoc`의 렌즈를 빠뜨린 판(31-3의 「뷰 오프셋 무시」 형태)
          const ap = plainScreenToDoc(app.view, S), bp = plainScreenToDoc(app.view, E)
          placebo.push(d2(docToScreen(app, ap), S), d2(docToScreen(app, bp), E))
        }
        const diag = Math.hypot(W, H)
        rows.push({
          scene: sc.key, k: r6(k), strokes: GESTURES.length, lifted,
          roundtrip_max_px: r6(Math.max(...roundtrip)),
          ink_judge_max_px: inkJudge.length ? r6(Math.max(...inkJudge)) : null,
          snap_move_max_px: snapMove.length ? r6(Math.max(...snapMove)) : null,
          falsify_c_ignore_lens: {
            max_px: r6(Math.max(...placebo)), median_px: r6(med(placebo)),
            rel_of_diagonal: r6(Math.max(...placebo) / diag),
          },
        })
        expect(Math.max(...roundtrip), `${sc.key} k=${k} — 화면 왕복`).toBeLessThan(1e-6)
        if (inkJudge.length) expect(Math.max(...inkJudge), `${sc.key} k=${k} — 잉크가 심판이다`).toBeLessThan(0.01)
        if (k === 1) expect(Math.max(...placebo)).toBe(0)          // 렌즈가 없으면 위약도 같은 판이다
        else expect(Math.max(...placebo), `${sc.key} k=${k} — 렌즈 무시 판은 어긋나야 한다`).toBeGreaterThan(1)
      }
    }
    const worst = rows.reduce((m, r) => Math.max(m, (r.falsify_c_ignore_lens as { max_px: number }).max_px), 0)
    console.log(`[31-2 ④] 원칙 d — 왕복 최대 ${Math.max(...rows.map(r => r.roundtrip_max_px as number)).toExponential(2)} px · `
      + `렌즈 무시 판 최대 ${worst.toFixed(2)} px`)
    ledger['gate4_principle_d'] = {
      what: '렌즈를 바꾼 상태에서 화면 → 문서 → 화면이 제자리인가, 그리고 그때 승격된 3D를 다시 사영하면 그 획의 잉크에 앉는가.',
      falsify_note: '판 ⓒ는 「커밋이 렌즈를 빠뜨린 판」이다 — 렌더만 렌즈를 타면 그은 자리와 놓인 자리가 갈린다. k=1 칸은 정의상 0이고(같은 판) 그것이 이 반증의 대조군이다.',
      what_is_measured_vs_guaranteed: '⚠ 정직하게 가른다. `roundtrip_max_px`(0)는 `screenToDoc`·`docToScreen`이 '
        + '서로의 역이라는 **구성상 항등**이고, `ink_judge_max_px`(0)도 **렌즈가 양쪽에서 상쇄되는 항등**이다'
        + '(왼쪽은 3D 사영을, 오른쪽은 잉크를 같은 변환으로 편다). 둘 다 임계를 안 건다 — 무회귀 문일 뿐이다. '
        + '**이 게이트의 판별력은 판 ⓒ 하나에서 온다**: 커밋이 렌즈를 빠뜨리면 그은 자리와 놓인 자리가 '
        + '화면 대각선의 15~76%만큼 갈린다. `snap_move_max_px`는 스냅이 끝점을 옮긴 거리이고 **게이트가 아니다**'
        + '(앱이 제 일을 한 것이다 — 관측으로만 적는다).',
      rows,
    }
  })

  it('⑤ 차수 승격 — 문면 그대로의 게이트는 **공허하다**(렌즈가 잠긴 국면이다) · 도달 가능한 재확정에서 잰다 (D-4 · #35)', () => {
    // ── ⑤a 문면 그대로: P1(소실점 1 · 미잠금) → P2. 그 전 국면은 `constructionDone === false` ──
    const s = sceneBeforePromote()
    const app = s.app
    const before = {
      vps: app.lift.an.vps.length, fSource: app.lift.an.fSource, f: r6(app.lift.an.f!),
      constructionDone: app.lift.an.constructionDone, lens_allowed: lensAllowed(app.lift.an),
      set_accepted: setViewF(app, app.lift.an.f! * 2), viewF: app.viewF,
    }
    expect(before.constructionDone).toBe(false)
    expect(before.set_accepted).toBe(false)
    s.draw(-3000, 400, -3000, 400)                     // vp1 찍기 = 승격
    const after = {
      vps: app.lift.an.vps.length, fSource: app.lift.an.fSource, f: r6(app.lift.an.f!),
      constructionDone: app.lift.an.constructionDone, viewF: app.viewF,
      k: lensK(app.lift.an, app.viewF),
    }
    expect(after.fSource).toBe('two-vp')               // 승격이 실제로 일어났다
    expect(after.viewF).toBe(null)                     // 문면의 게이트 — 다만 **내내 null이었다**
    expect(after.k).toBe(1)

    // ── ⑤b **도달 가능성을 먼저 조사한다**(#35 · D-4) — 「렌즈를 켠 채 카메라 서명이
    //    움직이는 자리」가 저장소에 실제로 있는가. 네 길을 값으로 확인한다. ──
    const s2 = sceneP2Tele()
    const app2 = s2.app
    const f0 = app2.lift.an.f!
    expect(setViewF(app2, f0 * C.LENS_K_MAX)).toBe(true)
    const on = {
      viewF: r6(app2.viewF!), k: r6(lensK(app2.lift.an, app2.viewF)),
      hfov: r6(hfovDeg(lensF(app2.lift.an, app2.viewF)!, W)),
    }
    const routes: Record<string, unknown> = {}

    // 길 ① 보통 획 — 서명이 안 움직인다 → **렌즈가 그대로다**(반증 짝: 아무 때나 안 버린다)
    s2.draw(700, 560, 700, 470)
    routes['ordinary_stroke'] = {
      fSource: app2.lift.an.fSource, f: r6(app2.lift.an.f!),
      viewF_kept: app2.viewF !== null, note: '**반증 짝** — 서명이 안 움직이는 변경에서는 렌즈를 안 버린다.',
    }
    expect(app2.viewF).not.toBe(null)
    expect(r6(app2.lift.an.f!)).toBe(r6(f0))

    // 길 ② 되돌리기 — **작도 획은 실행취소 대상이 아니다**(state.commitStroke의 규칙)
    const beforeUndo = app2.doc.strokes.length
    undo(app2); undo(app2); undo(app2); undo(app2); undo(app2); undo(app2)
    routes['undo'] = {
      strokes: `${beforeUndo} → ${app2.doc.strokes.length}`, undo_stack_left: app2.undoStack.length,
      fSource: app2.lift.an.fSource, f: r6(app2.lift.an.f!), viewF_kept: app2.viewF !== null,
      note: '**닿지 않는다** — 소실점을 세운 작도 획이 op에 안 들어간다(state.ts: 「작도 획(깊이선·소실점 표식)은 '
        + '실행취소 대상이 아니다」 · `clearAll` 주석이 같은 사실을 적는다). 스택을 비워도 fSource가 two-vp 그대로다.',
    }
    expect(app2.lift.an.fSource).toBe('two-vp')

    // 길 ③ 지우개 — 작도 획은 지워지지 않는다(같은 규칙의 다른 문)
    const beforeErase = app2.doc.strokes.length
    beginErase(app2); eraseAt(app2, { x: 560, y: 493 }); endErase(app2)
    routes['erase'] = {
      strokes: `${beforeErase} → ${app2.doc.strokes.length}`,
      fSource: app2.lift.an.fSource, f: r6(app2.lift.an.f!), viewF_kept: app2.viewF !== null,
      note: '**닿지 않는다** — 소실점을 세운 획이 조각 목록에 없다.',
    }
    expect(app2.lift.an.fSource).toBe('two-vp')

    // 길 ④ 셋째 소실점 — 축만 늘고 **f·주점은 안 움직인다**(camera.ts: f는 앞의 둘에서만)
    s2.draw(600, 400, 600, 400)
    routes['third_vp'] = {
      vps: app2.lift.an.vps.length, f: r6(app2.lift.an.f!), viewF_kept: app2.viewF !== null,
      note: '**서명이 안 움직인다** — f는 소실점 앞 둘에서만 나온다(own3d의 `camSig` 주석이 같은 사실을 든다).',
    }
    expect(r6(app2.lift.an.f!)).toBe(r6(f0))
    expect(app2.viewF).not.toBe(null)

    // 길 ⑥ **P1 잠금(확정 · 렌즈 켬)에서 둘째 소실점을 시도한다** — 1차 리뷰어 [1]이 물은 자리다:
    //   `p1_locked`는 소실점이 **하나**인데 확정이라 렌즈가 켜진다(게이트 ② 마지막 행). 그러면
    //   「거기서 두 번째 소실점이 서면」 그것이 렌즈를 켠 채의 P1→P2다. **서지 않는다**를 값으로 낸다.
    const s4 = sceneP1Locked()
    const app4 = s4.app
    const f4 = app4.lift.an.f!
    expect(setViewF(app4, f4 * C.LENS_K_MAX)).toBe(true)
    const dia = s4.draw(300, 700, 200, 500)     // lock1pt.test.ts의 그 대각선(잠금 전이면 vp=(150,400))
    routes['second_vp_while_p1_locked'] = {
      vps: app4.lift.an.vps.length, fSource: app4.lift.an.fSource, f: r6(app4.lift.an.f!),
      p1Locked: app4.lift.an.p1Locked, stroke_committed: dia !== null,
      reject_reason: dia === null ? null : (app4.lift.an.rejects.get(dia.id) ?? null),
      viewF_kept: app4.viewF !== null,
      note: '**서지 않는다** — 화면 수평이 선언된 순간 1점으로 잠기므로(`p1Locked` · 이론서 2.2) '
        + '그 뒤의 대각선은 둘째 소실점을 못 만든다. 즉 **렌즈가 켜진 확정 국면(소실점 하나)에서 '
        + 'P1→P2로 가는 길이 없다** — 게이트 ⑤의 「문면이 공허하다」가 이 칸으로 닫힌다.',
    }
    expect(app4.lift.an.p1Locked).toBe(true)
    expect(app4.lift.an.vps.length).toBe(1)
    expect(app4.lift.an.fSource).toBe('default')
    expect(r6(app4.lift.an.f!)).toBe(r6(f4))
    expect(app4.viewF).not.toBe(null)

    // 길 ⑤ **파일 열기** — 다른 카메라의 문서가 들어오면 서명이 바뀐다. **여기서 버린다.**
    const other = sceneP2Wide().app
    const fOther = other.lift.an.f!
    loadDoc(app2, { doc: other.doc, nextId: other.nextId })
    const afterLoad = {
      f: `${r6(f0)} → ${r6(app2.lift.an.f!)}`, fSource: app2.lift.an.fSource,
      viewF: app2.viewF, k: lensK(app2.lift.an, app2.viewF),
      hfov: r6(hfovDeg(lensF(app2.lift.an, app2.viewF)!, W)),
    }
    routes['load_doc'] = { ...afterLoad, note: '**도달한다** — 렌즈를 버리고 초기값(그 문서의 f)으로 돌아간다.' }
    expect(r6(app2.lift.an.f!)).toBe(r6(fOther))
    expect(r6(app2.lift.an.f!)).not.toBe(r6(f0))      // 서명이 실제로 움직였다(0건 통과 ⛔)
    expect(app2.viewF).toBe(null)
    expect(lensK(app2.lift.an, app2.viewF)).toBe(1)

    // 길 ⑥ **비우기** — 확정이 풀린다(그 국면에는 렌즈가 없다)
    const app3 = sceneP2Tele().app
    expect(setViewF(app3, app3.lift.an.f! * C.LENS_K_MIN)).toBe(true)
    clearAll(app3, W, H)
    routes['clear_all'] = {
      constructionDone: app3.lift.an.constructionDone, lens_allowed: lensAllowed(app3.lift.an),
      viewF: app3.viewF, note: '**도달한다** — 확정이 풀리므로 렌즈가 없다(게이트 ②의 국면으로 돌아간다).',
    }
    expect(app3.lift.an.constructionDone).toBe(false)
    expect(app3.viewF).toBe(null)

    console.log(`[31-2 ⑤] 문면 승격: 렌즈 잠긴 국면(constructionDone ${before.constructionDone}) → 내내 null · `
      + `그리기로는 서명이 안 움직인다(되돌리기·지우개·셋째 소실점 셋 다 two-vp 유지) · `
      + `파일 열기에서 f ${r6(f0)} → ${r6(fOther)} · viewF ${on.viewF} → null · 화각 ${on.hfov}° → ${afterLoad.hfov}°`)
    ledger['gate5_promotion_resets'] = {
      literal: {
        what: '지시 문면의 「차수 승격 후 보기 렌즈가 초기값으로 돌아간다」 — **web2에서는 공허한 참이다**.',
        why: '실재하는 승격은 P1→P2 하나이고(#86 ㉢), 그 «전» 국면은 소실점 1 · 화면수평 미선언이라 '
          + '`constructionDone === false`다 — 거기서는 렌즈 자체가 없다(게이트 ②). 그래서 승격을 건너는 동안 `viewF`는 내내 null이다.',
        before, after,
      },
      reachability: {
        what: '**「렌즈를 켠 채 카메라 서명이 움직이는 자리」를 찾아 다섯 길을 값으로 확인했다**(#35). '
          + '그리기·되돌리기·지우기로는 **안 움직인다** — 소실점을 세운 작도 획이 실행취소·지우개의 대상이 '
          + '아니기 때문이다(CLAUDE.md §1: 「소실점은 확정 후 잠긴다」의 web2 구현). 닿는 길은 문서를 바꾸는 둘이다.',
        lens_on: on, routes,
        verdict: '초기화 경로는 **살아 있고 도달 가능하다**(파일 열기 · 비우기). 다만 **그리기로는 못 닿는다** — '
          + '그것이 이 저장소에서 「승격이 렌즈를 버린다」가 갖는 실제 크기다.',
      },
    }
  })

  it('원장 — stage0/out/lens31_web2.json', () => {
    const g1 = ledger['gate1_pixel_identity'] as { rows: { falsify_a_lens: Record<string, { max: number }> }[] }
    const g3 = ledger['gate3_coords_frozen'] as { rows: { placebo: Record<string, { drift_units_max: number; length_fold_max: number }> }[] }
    const g4 = ledger['gate4_principle_d'] as { rows: { falsify_c_ignore_lens: { max_px: number } }[] }
    // **최댓값이 어느 칸인지 경로로 가리킨다**(#40 · selfcheck의 `_resolve`가 그 자리를 다시 읽는다).
    // ⚠ 1차 리뷰어 [5]: 도달 가능성 값은 **등록 지표와 같은 자**여야 한다 — 게이트 ③의 등록문이
    //   「좌표 전수 비교」이므로 **좌표 드리프트**를 든다. 길이 fold는 부차값으로 내린다
    //   (이 회차가 스스로 「fold만 보면 통과할 뻔한 칸이 있다」고 적었다).
    let leakMax = 0, leakPath = '', foldMax = 0, foldPath = ''
    g3.rows.forEach((r, i) => {
      for (const [kk, v] of Object.entries(r.placebo)) {
        if (v.drift_units_max > leakMax) { leakMax = v.drift_units_max; leakPath = `gate3_coords_frozen/rows/${i}/placebo/${kk}/drift_units_max` }
        if (v.length_fold_max > foldMax) { foldMax = v.length_fold_max; foldPath = `gate3_coords_frozen/rows/${i}/placebo/${kk}/length_fold_max` }
      }
    })
    const lensPx = Math.max(...g1.rows.flatMap(r => Object.values(r.falsify_a_lens).map(x => x.max)))
    let ignorePx = 0, ignorePath = ''
    g4.rows.forEach((r, i) => {
      if (r.falsify_c_ignore_lens.max_px > ignorePx) {
        ignorePx = r.falsify_c_ignore_lens.max_px
        ignorePath = `gate4_principle_d/rows/${i}/falsify_c_ignore_lens/max_px`
      }
    })

    const payload = JSON.stringify({
      what: '보기 렌즈(`App.viewF`) — 확정된 뒤의 화각만 바꾸고 `Camera.f`·`fSource`·3D 좌표는 안 건드린다. '
        + '게이트 다섯과 **위약 판 셋**(렌즈를 실제로 넣은 판 · viewF가 lift로 새는 판 · 커밋이 렌즈를 무시하는 판).',
      why: '「렌즈 슬라이더」는 폐기된 넷 중 하나다(CLAUDE.md D-4). 그때 폐기된 것은 **f로 카메라 해를 정하는 것**이고 '
        + '(f는 소실점에서 나온다 — 이론서 6.2 `f² = |PV₁||PV₂|`), 이 회차의 것은 **확정 뒤의 보기값**이다. '
        + '착수 전 판정은 `web2/NOTES.md`의 「31-0 착수 전 판정」이 정본이고 착수 조건 둘(f·fSource는 읽기만 · '
        + 'fSource를 화면에 안 냄)을 이 원장이 값으로 든다.',
      where: 'core/lens.ts(닮음 하나) · state.viewXf/viewScale(문서→화면의 정본) · state.setViewF/resetViewLens · recompute의 lensSig',
      identity_by_construction: [
        '게이트 ① 「손대지 않은 렌더가 지금과 픽셀 동일」 — `viewF === null`이면 `viewXf`가 `app.view`를 **그대로** 낸다. f가 무엇이든 0이다.',
        '게이트 ③ 「렌즈를 바꿔도 3D 좌표가 안 변한다」 — `liftAll`에 `viewF`를 읽는 자리가 없다.',
        '**둘 다 임계를 안 건다**(CLAUDE.md §5.1 자기참조 유형 3). 판별력은 위약 판 셋이 낸다.',
      ],
      measured_not_guaranteed: [
        '게이트 ② 확정 전 잠금 — 국면 넷에서 조작이 안 먹고, 확정된 셋에서는 먹는다(반증 짝).',
        '게이트 ④ 원칙 d — 렌즈를 **바꾼** 상태의 화면 왕복과 「잉크가 심판이다」.',
        '게이트 ⑤ 재확정에서의 초기화 — 그리고 서명이 안 움직이는 변경에서는 **안** 버린다.',
      ],
      fsource_not_on_screen: {
        verdict: '**화면에 안 낸다**(2026-08-17 지시 3 · D-L55). 렌즈 팝오버가 내는 값은 **화각(도)** 하나다.',
        where: 'index.html `#lens-read` · main.ts `syncLens()` — `hfovDeg(lensF(...), an.W)`만 쓴다.',
        arm: 'e2e/lens31.spec.ts ⑤가 그 문면을 DOM에서 잰다(「fSource」·「two-vp」·「default」가 화면 문자열에 없다).',
      },
      constants: {
        LENS_K_MIN: C.LENS_K_MIN, LENS_K_MAX: C.LENS_K_MAX, LENS_STEP_LOG2: C.LENS_STEP_LOG2,
        LENS_STOP_MIN, LENS_STOP_MAX,
      },
      constants_note: '**배율(비)이지 mm가 아니다**(#88 — mm로 적으면 「그때 쓰던 센서 크기」와 말없이 묶인다). '
        + '0.5·2는 렌즈 한 스톱이고 손잡이는 log2 위에서 등간격이다.',
      scenes: SCENES.map(s => ({ key: s.key, label: s.label })),
      theory_18_4_band: '⚠ **대역의 양 끝이 이론서 18.4의 어느 칸에 앉는지 적는다**(1차 리뷰어 [12] — '
        + '「화각 상한」은 폐기된 넷 중 하나이므로 **상한을 두라는 말이 아니고**, 어디에 앉는지 말하지 않는 것이 지적이다). '
        + '18.4의 자: 60° = f 0.87W · 90° = f 0.5W. 이 회차의 장면은 f/W 2.74(19.9°)·0.87(59.9°)이고 '
        + 'k 0.5를 걸면 각각 1.37W·0.435W가 된다 — **넓은 화각 장면의 아래 끝은 90°를 넘는다**(97.9°). '
        + '화면 팔의 장면은 더 극단이다(기본 114.3° → k 0.5에서 144.2°). 그것을 **막지 않는다**: '
        + '보기 렌즈는 해를 안 건드리므로 「지각과 어긋나는 그림」이 아니라 「지각과 어긋나게 «보는 것»」이고 '
        + '되돌리는 손잡이가 그 자리에 있다(「기본으로」).',
      lens_band_note: '#86 ㉠ — `viewF`를 f와 **같은 값**으로 두고 재면 위약 판도 초록이다. 그래서 대역의 '
        + `**양 끝**(k = ${C.LENS_K_MIN} · ${C.LENS_K_MAX})에서 돈다. 장면도 화각의 양 끝을 덮는다(f/W 2.74 ↔ 0.87).`,
      ...ledger,
      gate: {
        for: 'web2-31 2번 — 보기 렌즈(화각). 지시가 등록한 다섯.',
        registered: [
          '렌즈를 손대지 않은 상태의 렌더가 지금과 **픽셀 단위로 동일** — 세 장면 전부 0.000000 px (**구성상 항등**)',
          '확정 전에는 조작이 없다 — 국면 넷 전부 `lensAllowed false` · `setViewF` 거절 (반증 짝: 확정된 셋은 먹는다)',
          '렌즈를 바꿔도 이미 올라간 3D 좌표가 변하지 않는다 — 좌표 전수 비교 0 (**구성상 보장**)',
          '렌즈를 바꾼 상태에서 그은 획이 화면에서 본 자리에 놓인다 — 왕복 0 · 잉크 심판 0 '
          + '(⚠ **둘 다 구성상 항등이라 임계가 아니다** — 판별력은 판 ⓒ가 낸다. 1차 리뷰어 [4])',
          '차수 승격 후 보기 렌즈가 초기값으로 돌아간다 — 문면은 **공허**(그 국면은 렌즈가 잠겨 있다)이고, '
          + '렌즈를 켠 채 도달 가능한 재확정(two-vp → default)에서 null로 돌아간다',
        ],
        reachability: '**세 축이 각각 다른 판에서 빨개진다**. ⓐ 렌즈를 실제로 넣은 판 → ①의 픽셀 동일이 깨진다. '
          + 'ⓑ `viewF`가 lift로 새는 판 → ③의 좌표 전수 비교가 깨진다(값 축). ⓒ 커밋이 렌즈를 무시하는 판 → ④ 원칙 d가 깨진다. '
          + '⚠ **반대 방향도 이 원장 안에 있다**: 같은 위약 셋이 `k = 1`에서는 전부 초록이다(④의 k=1 행) — '
          + '그것이 #86 ㉠이 말한 「안 갈리는 축」이고, 그래서 대역의 양 끝에서 돈다.',
        /** ⚠⚠ **크기는 픽스처가 정한다**(#46 · #86 ㉠): 이 fold는 k = 2에서의 값이고 k를 1에 붙이면
         *  1.000000으로 내려온다 — 그러면 그 픽스처가 아무것도 안 재는 것이다(임계를 무르지 말고 k를 벌린다). */
        reachability_value: r6(leakMax),
        reachability_value_fixture_determined: true,
        reachability_source: leakPath,
        reachability_note: `**위약 판 ⓑ가 3D 좌표를 최대 ${r6(leakMax)} 세계 단위 옮긴다** — 게이트 ③의 등록 지표와 `
          + `같은 자(좌표)다. 같은 판의 길이 fold는 최대 ${r6(foldMax)}배인데 거기에는 fold 1.003 대의 칸도 있으므로 `
          + `(값 축의 맹점) 도달 가능성 값으로는 좌표를 든다. 다른 두 축: 판 ⓐ ${r6(lensPx)} px(픽셀 동일) · `
          + `판 ⓒ ${r6(ignorePx)} px(원칙 d). ⚠ **이 좌표 드리프트에서 강체·닮음 성분을 안 뺐다**(1차 리뷰어 [10]) — `
          + `「형태가 얼마나 갈렸나」는 같은 칸의 length_fold_*가 들고, 이 수는 「같은 문서를 다른 f로 풀면 3D가 `
          + `어디에 앉는가」의 크기다.`,
        reachability_value_secondary: r6(foldMax),
        reachability_source_secondary: foldPath,
        reachability_value_tertiary: r6(ignorePx),
        reachability_source_tertiary: ignorePath,
      },
      selfcheck_flags_known: {
        zeros_are_the_claim: '⚠ `untouched_max_px` · `guard_max_units` · `roundtrip_max_px` · `ink_judge_max_px`가 **0**으로 '
          + '깔린다 — 「1e-10 미만 오차」·「분포 전체가 한 값」·「0 고정 카운터」가 다 잡힌다. '
          + '**셋 다 그 칸의 주장 자체다**: 앞의 둘은 구성상 항등·보장이고(그래서 임계를 안 건다) 세 번째는 '
          + '`screenToDoc`와 `docToScreen`이 서로의 역이라는 사실이다. 값이 0이 **아니면** 그 칸이 틀린 것이다. '
          + '판별력은 같은 행 옆의 `falsify_*`가 진다.',
        exact_k_folds: '⚠ `k0.5`·`k2` 칸의 `f_screen_fold`·`lensK`가 정확히 0.5·2로 나온다 — **설계 보장이다**(손잡이가 '
          + '그 값을 넣었다). 재는 것은 그 배수가 **어디까지 흘러가는가**이지 배수 자체가 아니다.',
        identity_axis_all_true: '⚠ 게이트 ③의 `identity_changed`가 여섯 칸 **모두 true**다 — 「분포 전체가 한 값」이 잡힌다. '
          + '**관측이고 사전 예상의 반증이다**(D-4 — `two_axes_note`): 위약은 3D를 다른 f로 푸는 것이라 '
          + '무엇이 풀리는지(대기/승격·앵커)까지 갈린다. 임계를 안 건다 — 옆의 값 축이 크기를 든다.',
        k1_control_rows_zero: '⚠ `gate4_principle_d`의 k=1 행 셋에서 `falsify_c_ignore_lens.median_px = 0`이 '
          + '「카운터 0」으로 잡힌다 — **대조군의 주장 자체다**: 렌즈가 없으면 「렌즈를 무시하는 판」이 '
          + '**같은 판**이므로 정확히 0이다(#86 ㉠의 「안 갈리는 축」이 이 행이다). 0이 **아니면** 그 칸이 틀린 것이다.',
        undo_stack_emptied: '⚠ `gate5.../routes/undo/undo_stack_left = 0`이 「카운터 0」으로 잡힌다 — '
          + '**일부러 비운 것**이고(여섯 번 물렸다) 그런데도 `fSource`가 two-vp 그대로라는 것이 그 칸의 관측이다.',
        no_constants_snapshot: '**web2 라인 전체의 유보다** — 이 라인은 `constantsSnapshot()`을 안 쓰고 `constants` 블록을 '
          + '손으로 적는다(`hold26.test`가 그 유보를 처음 적었다). 문서는 원장을 **이름으로** 가리킨다.',
      },
      pitfalls: ['#86', '#83', '#77', '#54', '#42', '#40', '#35', '#88', '#87'],
      pitfalls_note: '#77 ㉡(항등인 검증을 남기지 않는다 — 남기면 그 자리에 「쟀다」가 서 버린다)이 이 항목의 뼈대다: '
        + '게이트 다섯 중 둘이 구성상 참이라 **그 사실을 적고 임계를 뺐다**. #86은 값 축·정체 축을 따로 잰 자리다 — '
        + '⚠ **실측은 둘 다 갈렸고**(여섯 칸 전부 `identity_changed: true`) 사전 예상이 반증됐다(`two_axes_note`). '
        + '그래도 값 축에는 fold 1.003 대의 칸이 있어 도달 가능성 값은 **좌표**로 든다. #77 ㉠은 손잡이 자리(기존 확대·궤도에 안 얹었다), '
        + '#87·#88은 그 손잡이의 DOM 자리(`#app` 직계 · 예약 px 상수 ⛔)다.',
      command: 'LEDGER=1 npx vitest run test/lens31.test.ts',
    }, null, 2)
    if (process.env.LEDGER === '1') {
      const out = resolve(HERE, '../../stage0/out')
      mkdirSync(out, { recursive: true })
      writeFileSync(resolve(out, 'lens31_web2.json'), payload)
    }
    expect(payload.length).toBeGreaterThan(2000)
  })
})
