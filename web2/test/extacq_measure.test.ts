// web2-18 2부 측정 — **연장선이 허공을 얼마나 덮고 있었나**, 그리고 물러난 뒤 무엇이 풀렸나.
//
// 사람 관측(원문): 「선을 그을 때, 스타일러스를 떼기 전에, 뭔가 허공에서도 어딘가에 스냅이
// 잡혀 끌려다니는 느낌. 정확히 어떤 오스냅 때문인지는 모르겠지만 네모 표시가 뜬다.」
// 파선 네모가 `ext`의 기호다(render2d의 `mark` — 실선 □ = 끝점, 파선 □ = 연장선,
// ✕+파선 = 겉보기 교차).
//
// 재는 것 둘(지시 2-d ①·⑥):
//   ① **허공 끌림 비율** — 승격 선분 다섯이 있는 장면에서 «잉크가 없는 자리»를 훑을 때
//      `ext`가 잡히는 칸의 비율. 수리 전/후를 나란히 적는다(D-2 — 재현이 먼저다).
//   ⑥ **xint 승률** — web2-15가 `ext`의 가림을 우회하려고 넣은 겉보기 교차가, 원인이
//      물러난 뒤 실제로 더 자주 이기는가.
//
// ⚠ 이 파일은 **판정이 아니라 분포**를 낸다(#69 ㉠의 처방 그대로: 새 후보/규칙을 넣으면
//    «그 후보가 이기는 실측 분포»를 낸다). 판정 팔은 `test/osnap.test.ts`의 연장선 넷과
//    `e2e/extacq.spec.ts`(표식·진단·확정 시 비움)에 있다.
//
// 수리 전 판은 같은 파일을 **2부 수리를 `git stash`로 걷은 트리**에서 돌려 냈다
// (`stage0/out/extacq_web2_before.json`) — 1부와 같은 방법이고 같은 세션의 자기 트리다(#70).

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session, toward } from './session'
import { osnap, type OsnapKind } from '../src/core/osnap'
import { newExtDwell, declareAtForTest } from '../src/core/extacq'
import { resolveEnd } from '../src/core/draft'
import { project } from '../src/core/camera'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const W = 1200, H = 800, HY = 400

/** 승격 선분 다섯 + 대기선 하나가 있는 장면(지시 2-d ① 「3D 선 5개」).
 *  손 오차를 태운다(#68) — 이상적 좌표만 훑으면 실사용 대역을 안 덮는다. */
function scene5() {
  const s = session(W, H)
  const V0 = { x: 900, y: HY }
  s.draw(100, HY, 1100, HY)          // 지평선(작도)
  s.draw(500, 520, 600, 496)         // 깊이선 1 → vp0
  s.draw(500, 520, 400, 496)         // 깊이선 2 → vp1
  s.draw(500, 520, 500, 320)         // 기둥
  const p1 = toward({ x: 500, y: 520 }, V0, 0.30)
  s.draw(500, 520, p1.x + 2, p1.y - 1)     // 바닥선(손 오차 2px)
  const p2 = toward({ x: 500, y: 320 }, V0, 0.30)
  s.draw(500, 320, p2.x - 1, p2.y + 2)     // 윗선(손 오차 2px)
  return s
}

/** 승격 선분 어디에도 가깝지 않은 «허공» 칸들 — 그 위에서 무엇이 잡히는지 센다.
 *  칸은 화면 격자(24px 간격)에서 뽑고, **승격 선분의 그린 구간에서 반경의 3배 밖**만
 *  남긴다(끝점·몸통 근처는 «허공»이 아니다 — 거기서는 end·near가 나는 것이 옳다). */
function voidCells(s: ReturnType<typeof session>, R: number) {
  const segs = [...s.app.lift.lifted.values()]
  const proj = segs.map(g => {
    const a = projectSafe(s, g.a3), b = projectSafe(s, g.b3)
    return a && b ? { a, b } : null
  }).filter(Boolean) as { a: { x: number; y: number }; b: { x: number; y: number } }[]
  const far = (p: { x: number; y: number }) => proj.every(q => {
    const dx = q.b.x - q.a.x, dy = q.b.y - q.a.y
    const L2 = dx * dx + dy * dy
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - q.a.x) * dx + (p.y - q.a.y) * dy) / L2)) : 0
    return Math.hypot(p.x - (q.a.x + dx * t), p.y - (q.a.y + dy * t)) > R * 3
  })
  const out: { x: number; y: number }[] = []
  for (let y = 180; y <= 700; y += 24) for (let x = 120; x <= 1080; x += 24) {
    const p = { x, y }
    if (far(p)) out.push(p)
  }
  return out
}

/** 앱과 같은 사영 — 여기서 다른 식을 안 만든다 */
function projectSafe(s: ReturnType<typeof session>, p3: { x: number; y: number; z: number }) {
  return project(s.app.lift.an, s.app.pose, p3)
}

describe('web2-18 2부 측정 — 허공 끌림 비율과 xint 승률', () => {
  it('① 허공에서 무엇이 잡히는가 · ⑥ xint 승률 — 원장 extacq_web2.json', () => {
    const s = scene5()
    const R = s.app.osnap.radius / s.app.view.s
    const lifted = s.app.lift.lifted.size
    expect(lifted, '승격 선분이 다섯 이상이다(장면이 섰다)').toBeGreaterThanOrEqual(5)

    const cells = voidCells(s, R)
    expect(cells.length, '허공 칸이 실제로 있다 — 없으면 이 표는 아무것도 안 잰다(#69 ㉣)')
      .toBeGreaterThan(50)

    // ── ① 허공 훑기 — 조준선 없이(호버 경로 그대로) ────────────────────────
    const tally: Partial<Record<OsnapKind | 'none', number>> = {}
    for (const p of cells) {
      const h = osnap(s.app.lift, s.app.pose, p, { ...s.app.osnap, radius: R })
      const k = (h?.kind ?? 'none') as OsnapKind | 'none'
      tally[k] = (tally[k] ?? 0) + 1
    }
    const extHits = tally.ext ?? 0
    const noneHits = tally.none ?? 0

    // ── ①-b 같은 훑기를 «모든 끝점을 획득한» 상태로 ─────────────────────────
    // 획득식이 «상시»와 어떻게 다른지를 한 실행 안에서 보인다: 상한(EXT_MAX_RATIO)만
    // 남긴 상태다. 수리 전(획득도 상한도 없음)은 before 판이 든다.
    const allAcq = [...s.app.lift.lifted.keys()].flatMap(id => [
      { id, end: 0 as const }, { id, end: 1 as const },
    ])
    const tallyAll: Partial<Record<OsnapKind | 'none', number>> = {}
    for (const p of cells) {
      const h = osnap(s.app.lift, s.app.pose, p, { ...s.app.osnap, radius: R }, undefined, undefined, allAcq)
      const k = (h?.kind ?? 'none') as OsnapKind | 'none'
      tallyAll[k] = (tallyAll[k] ?? 0) + 1
    }

    // ── ⑥ xint 승률 — web2-15의 픽스처 어법 그대로(대기선 몸통을 조준한다) ────
    // 축이 걸린 획을 대기선 B 쪽으로 그으며 끝점을 훑고, `resolveEnd`(앱 경로)가
    // 무엇으로 답하는지 센다. ext가 물러나면 xint·near가 그 자리를 받는다.
    // 픽스처는 **web2-15가 세운 것 그대로**다(test/xint.test.ts의 `fx()` — 새로 짓지 않는다:
    // 그 좌표가 «어느 점 오스냅도 안 닿는 몸통»이라는 성질을 이미 검증받았다).
    const x = session(W, H)
    x.draw(100, HY, 1100, HY)                 // 지평선
    x.draw(500, 500, 600, 475)                // → vp0 = (900,400)
    x.draw(500, 500, 400, 475)                // → vp1 = (100,400) — 닫힘
    const B6 = x.draw(690, 290, 840, 365)!    // 대기 소실점 선(몸통을 겨눈다)
    const D1 = x.draw(500, 500, 720, 445)!    // 지면 깊이선 — 끝 (720,445)가 3D다
    const V = x.draw(720, 445, 720, 345)!     // 세로 3D 선 — 그 연장이 조준 경로를 덮던 것
    const raceReady = x.app.lift.waiting.includes(B6.id)
      && x.app.lift.lifted.has(D1.id) && x.app.lift.lifted.has(V.id)
    const winner: Partial<Record<string, number>> = {}
    let cells6 = 0
    // 손 오차 25칸(web2-15의 격자 그대로) — V의 위 끝에서 B의 몸통 쪽으로 겨눈다
    for (const dx of [0, 2, 4, 6, 8]) for (const dy of [0, 3, -3, 6, -6]) {
      const r = resolveEnd(x.app.lift, x.app.pose, x.app.lift.an,
        { x: 720, y: 345 }, { p3: null }, { x: 720 + dx, y: 305 + dy },
        { ...x.app.osnap, radius: x.app.osnap.radius / x.app.view.s })
      const k = r.endSnap?.kind ?? 'none(축만)'
      winner[k] = (winner[k] ?? 0) + 1
      cells6++
    }

    const ledger = {
      what: 'web2-18 2부 — 연장선이 허공을 얼마나 덮고 있었나(①)와 그것이 물러난 뒤 겉보기 교차가 얼마나 이기는가(⑥). 판정이 아니라 **분포**다(#69 ㉠: 규칙을 바꾸면 그 규칙이 이기는 실측 분포를 낸다).',
      phase: 'after',
      phase_note: '수리 후(획득식). 쌍이 되는 수리 전 판은 같은 폴더의 `extacq_web2_before.json` — 같은 파일을 2부 수리를 `git stash`로 걷은 트리에서 돌려 냈다(같은 세션의 자기 트리 — #70).',
      thresholds: { EXT_ACQUIRE_MS: C.EXT_ACQUIRE_MS, EXT_MAX_RATIO: C.EXT_MAX_RATIO, EXT_MAX_ACQUIRED: C.EXT_MAX_ACQUIRED, OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX },
      scene: { lifted, waiting: s.app.lift.waiting.length, void_cells: cells.length,
        cell_def: `화면 격자 24px · 승격 선분의 그린 구간에서 반경(${C.OSNAP_RADIUS_PX}px)의 3배 밖만 «허공»으로 센다(끝점·몸통 근처는 end·near가 나는 것이 옳다)` },
      void_sweep: {
        no_acquisition: { ...tally, ext_ratio: +(extHits / cells.length).toFixed(4), none_ratio: +(noneHits / cells.length).toFixed(4) },
        all_endpoints_acquired: { ...tallyAll, ext_ratio: +((tallyAll.ext ?? 0) / cells.length).toFixed(4) },
        note: 'no_acquisition이 앱의 **기본 상태**다(획을 확정할 때마다 비워지므로 대부분의 시간이 여기다). all_endpoints_acquired는 «획득식이 상시와 어떻게 다른가»의 대조군 — 획득 문만 열고 상한(EXT_MAX_RATIO)은 그대로 둔 상태다. 수리 전(획득도 상한도 없음)은 before 판이 든다.',
      },
      xint_race: {
        cells: cells6, winner, race_ready: raceReady,
        note: 'web2-15가 `xint`를 넣은 이유가 «ext가 조준 경로 내내 이겨 near가 한 번도 못 이긴다»였다(그 파일 주석 ②). 원인인 ext가 물러난 뒤 그 자리를 무엇이 받는지 센다 — 이 표가 다음 사람에게 «xint는 우회였다»를 말한다(지시 2-b ⚠).',
      },
      flags_explained: {
        'void_sweep.no_acquisition.ext_ratio = 0': '**이 0이 곧 이 회차의 측정 결과다** — 「획득 없이는 허공에서 ext가 한 번도 안 난다」. 자기참조가 아니라 관측이다: 같은 하네스의 수리 전 판이 같은 격자에서 75칸(8.8%)을 냈고(extacq_web2_before.json), 같은 실행의 all_endpoints_acquired 행이 55칸을 낸다. **0이 아닌 값이 나올 수 있는 격자임을 두 이웃 칸이 보인다**(#69 ㉣).',
        'xint_race.winner 단일 범주(xint 25)': '**설계 보장 쪽이다**(§5.1 유형 3): 조준선이 있으면 겉보기 교차의 답이 구성상 하나이고 25칸 전부가 그 문을 지난다. 이 표의 값어치는 «비율»이 아니라 «수리 전에도 25/25였다»는 **불변**에 있다 — web2-15의 우회가 그 자리에서는 이미 이기고 있었으므로 2부가 푼 것은 **조준선 없는 경로**다(test/xint.test.ts의 맨 osnap 팔이 ext→near로 뒤집혔다).',
      },
      falsification: '허공 칸이 0이면(scene이 화면을 다 덮으면) 이 표는 아무것도 안 잰다 — 팔이 >50을 강제한다. 승격 선분이 다섯 미만이어도 마찬가지다(팔이 ≥5를 강제). 획득 조건을 항상 참으로 두는 반증은 all_endpoints_acquired 행이 그 자리이고, 상한을 무한으로 두는 반증은 test/osnap.test.ts의 「연장선 ④」가 값으로 든다.',
    }
    const out = resolve(HERE, '../../stage0/out/extacq_web2.json')
    mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify(ledger, null, 1))
    console.log(`[2부 ①] 허공 ${cells.length}칸 — ext ${extHits}(${(extHits / cells.length * 100).toFixed(1)}%)`
      + ` · 아무것도 안 잡힘 ${noneHits} · 전부획득이면 ext ${tallyAll.ext ?? 0}`)
    console.log(`[2부 ⑥] xint 경합 ${cells6}칸(픽스처 ${raceReady ? 'OK' : '안 섰다'}) — ${JSON.stringify(winner)}`)
    expect(raceReady, '⑥ 픽스처가 실제로 섰다 — 안 서면 그 표는 아무것도 안 잰다(#69 ㉣)').toBe(true)

    // 이 파일의 유일한 판정: 획득이 없으면 허공에서 ext가 **한 번도** 안 난다(팔 ②의 분포판)
    expect(extHits, '획득 없이는 허공에서 ext가 한 번도 안 난다').toBe(0)
  })

  it('반증 — 선언을 채워도 **오스냅에는 안 난다**(web2-30 11번) · 대신 구속으로 선다', () => {
    const s = scene5()
    const R = s.app.osnap.radius / s.app.view.s
    const cells = voidCells(s, R)
    // ⚠⚠ **web2-30 11번이 이 반증의 문면을 뒤집었다.** 종전에는 「획득을 채우면 허공에서
    //   ext가 실제로 난다」였다(문이 살아 있다는 증거). 지금은 연장선이 **후보 목록에서
    //   통째로 빠졌으므로** 선언을 채워도 `osnap`은 한 번도 ext를 안 낸다 —
    //   그것이 이 회차의 요구다(층위: 후보가 아니라 구속).
    //   **문이 죽지 않았다는 증거는 다른 자리에서 든다**: `resolveEnd`가 선언된 선으로
    //   끝점을 투영한다(`test/ext30.test.ts` ②). 여기서는 «후보로는 안 난다»만 잰다.
    let hits = 0
    let declared = 0
    for (const [id, seg] of s.app.lift.lifted) {
      const st = newExtDwell()
      for (const end of [0, 1] as const) {
        const p = projectSafe(s, end === 0 ? seg.a3 : seg.b3)
        if (!p) continue
        declareAtForTest(st, s.app.lift, s.app.pose, p, R)
      }
      if (st.acquired.length === 0) continue
      declared++
      for (const p of cells) {
        const h = osnap(s.app.lift, s.app.pose, p, { ...s.app.osnap, radius: R }, undefined, undefined, st.acquired)
        if (h?.kind === 'ext') hits++
      }
      void id
    }
    // 분해능(#71 ㉢) — 선언이 실제로 섰다는 것부터 확인한다(안 서면 0은 아무 뜻이 없다)
    expect(declared, '선언이 실제로 선 선분이 있다').toBeGreaterThan(0)
    expect(hits, '선언해도 오스냅 후보로는 한 번도 안 난다').toBe(0)
  })
})
