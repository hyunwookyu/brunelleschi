// web2-19 1-c — **분류가 실제로 틀리는가는 별개 물음이다. 재기만 한다**(⚠⚠ 임계 불변).
//
// 재는 것: 손 오차를 태운(#68) «의도는 화면 평행» 획이 어느 갈래로 떨어지는가.
//   ㉮ 가로 — 처짐(끝점 dy) 0~8px × 길이 × 지평선 이격(h). PARALLEL_PX(1.5px)를 넘은
//      처짐이 소실점 갈래로 가는지, VP_FAR_W(6W)가 어디까지 받아 주는지.
//   ㉯ 세로 — 기움(끝점 dx) 같은 격자. SCREEN_PARALLEL_RATIO(0.05)가 먼저 잡는지.
//      (0.05·L이 곧 문이다 — L 70px에서 3.5px. 그보다 큰 기움은 소실점 갈래다.)
//   ㉰ 경로 확인(#69 — 분류표가 앱 경로와 같은가): 부분 표본을 session.draw(오스냅·
//      축 스냅·커밋까지 실제 경로)로 그려 vps 개수가 분류 예측과 같은지 대조한다.
//
// ⚠ 픽스처 폭(D-5): 처짐 한 값·길이 한 값이면 «vp %»는 격자가 정한 상수다(#46) —
//   길이 6 × 이격 3 × 처짐 10 × 부호 2로 흔든다.
// 반증(D-3 — 이 격자가 실패 가능한가): 격자에 H 갈래와 vp 갈래가 **둘 다** 나와야 한다.
//   한 갈래만 나오면 격자가 경계를 안 물은 것이다(판정선 아래 expect 둘).
//
// 원장: stage0/out/graphite_web2.json — 표를 내고 **다음 회차 판단으로 넘긴다**(지시 1-c).
//   npx vitest run test/graphite_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp } from '../src/app/state'
import { session } from './session'
import { classifyNext } from '../src/core/camera'
import { C } from '../src/core/constants'

const W = 1200, H = 800
const HZ = H / 2
const DIAG = Math.hypot(W, H)

/** 갈래 이름 — classifyNext의 결과를 원장의 말로 접는다 */
function branchOf(r: ReturnType<typeof classifyNext>): string {
  if (r.role === 'vp') return 'vp'
  if (r.screenAxis === 'H') return 'H'
  if (r.screenAxis === 'V') return 'V'
  if (r.reason?.includes('짧다')) return 'short-vp'
  return 'content'
}

const LENGTHS = [40, 70, 110, 140, 200, 300]
const HEIGHTS = [80, 160, 250]            // 지평선 이격 h — 시작 y = HZ + h
const ERRORS = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8]  // 손 오차 px(#68 — 2~5가 손 대역)
const SIGNS = [1, -1]

describe('web2-19 1-c — 손 처짐 분포 (측정만 — 임계 불변)', () => {
  it('가로·세로 격자 → stage0/out/graphite_web2.json', () => {
    const an0 = createApp(W, H).lift.an   // 빈 문서의 카메라(상시 — web2-17)

    type Cell = { L: number; h: number; err: number; sign: number; branch: string; vpDist: number | null }
    const horiz: Cell[] = []
    for (const L of LENGTHS) for (const h of HEIGHTS) for (const err of ERRORS) for (const sign of SIGNS) {
      const a = { x: 350, y: HZ + h }
      const b = { x: 350 + L, y: HZ + h + err * sign }
      const r = classifyNext(an0, a, b)
      horiz.push({ L, h, err, sign, branch: branchOf(r), vpDist: r.vp ? Math.abs(r.vp.x - a.x) : null })
    }
    const vert: Cell[] = []
    for (const L of LENGTHS) for (const h of HEIGHTS) for (const err of ERRORS) for (const sign of SIGNS) {
      const a = { x: 500, y: HZ + h }
      const b = { x: 500 + err * sign, y: HZ + h - L }   // 위로 긋는 세로 — 손이 기운다
      const r = classifyNext(an0, a, b)
      vert.push({ L, h, err, sign, branch: branchOf(r), vpDist: r.vp ? Math.abs(r.vp.x - a.x) : null })
    }

    // 표 접기 — (오차 → 갈래 분포)와 (길이 → 소실점 문턱 오차)
    const fold = (cells: Cell[]) => {
      const byErr: Record<string, Record<string, number>> = {}
      for (const c of cells) {
        const k = String(c.err)
        byErr[k] ??= {}
        byErr[k]![c.branch] = (byErr[k]![c.branch] ?? 0) + 1
      }
      // 길이·이격별 — vp가 시작되는 최소 오차(그 아래는 전부 H/V)
      const minVpErr: Record<string, number | null> = {}
      for (const L of LENGTHS) for (const h of HEIGHTS) {
        const sub = cells.filter(c => c.L === L && c.h === h && c.branch === 'vp')
        minVpErr[`L${L}|h${h}`] = sub.length ? Math.min(...sub.map(c => c.err)) : null
      }
      return { byErr, minVpErr }
    }

    // ㉰ 경로 확인 — 분류표 12칸을 실제 앱 경로(session.draw)로 그려 vps 개수 대조.
    //   «커밋한 획»의 역할은 analyze가 다시 분류한다 — 미리보기와 갈리면 여기서 걸린다.
    const pathCheck: { kind: string; L: number; h: number; err: number; predicted: string; vpsAfter: number; agree: boolean }[] = []
    const SUBSET: [number, number, number][] = [
      [140, 160, 0], [140, 160, 1.5], [140, 160, 3], [140, 160, 8],
      [70, 80, 2], [300, 250, 3], [300, 160, 8], [40, 160, 5],
    ]
    for (const [L, h, err] of SUBSET) {
      const a = { x: 350, y: HZ + h }, b = { x: 350 + L, y: HZ + h + err }
      const predicted = branchOf(classifyNext(an0, a, b))
      const s = session(W, H)
      s.draw(a.x, a.y, b.x, b.y)
      const vpsAfter = s.app.lift.an.vps.length
      pathCheck.push({ kind: 'horiz', L, h, err, predicted, vpsAfter, agree: (predicted === 'vp') === (vpsAfter === 1) })
    }
    for (const [L, h, err] of [[70, 160, 4], [140, 160, 4], [70, 160, 2], [200, 160, 8]] as [number, number, number][]) {
      const a = { x: 500, y: HZ + h }, b = { x: 500 + err, y: HZ + h - L }
      const predicted = branchOf(classifyNext(an0, a, b))
      const s = session(W, H)
      s.draw(a.x, a.y, b.x, b.y)
      const vpsAfter = s.app.lift.an.vps.length
      pathCheck.push({ kind: 'vert', L, h, err, predicted, vpsAfter, agree: (predicted === 'vp') === (vpsAfter === 1) })
    }

    const handBand = (cells: Cell[]) => {
      const hand = cells.filter(c => c.err >= 2 && c.err <= 5)
      const vp = hand.filter(c => c.branch === 'vp').length
      return { n: hand.length, vp, note: '#68의 손 대역(2~5px)에서 소실점 갈래로 떨어진 칸 — 비율이 아니라 분자/분모(§5)' }
    }

    const ledger = {
      what: 'web2-19 1-c — 손 오차를 태운 화면 평행 의도 획의 갈래 분포. **측정만 한다** — '
        + '임계(PARALLEL_PX·SCREEN_PARALLEL_RATIO·VP_FAR_W)는 이 회차가 만지지 않는다(지시 ⚠⚠ — '
        + 'web2-17이 따라긋기 8px 대역에서 경계 플립을 실측한 자리다). 판단은 다음 회차 몫.',
      def: 'branch: H/V = 화면 평행 선언 · vp = 소실점 정의 · short-vp = 방향은 소실점인데 '
        + 'VP_MIN_LEN 미만 · content = 그 외. minVpErr = 그 (길이,이격)에서 소실점이 서는 최소 '
        + '끝점 오차 px(null = 이 격자 안 없음). vpDist = 시작점에서 소실점까지 화면 px.',
      constants: {
        PARALLEL_PX: C.PARALLEL_PX, SCREEN_PARALLEL_RATIO: C.SCREEN_PARALLEL_RATIO,
        VP_FAR_W: C.VP_FAR_W, MIN_DIR_LEN_RATIO: C.MIN_DIR_LEN_RATIO,
        VP_MIN_LEN_RATIO: C.VP_MIN_LEN_RATIO, OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX,
        frame: { W, H, HZ, DIAG },
      },
      grid: { LENGTHS, HEIGHTS, ERRORS, SIGNS, n_per_table: LENGTHS.length * HEIGHTS.length * ERRORS.length * SIGNS.length },
      horizontal: { ...fold(horiz), hand_band: handBand(horiz) },
      vertical: { ...fold(vert), hand_band: handBand(vert),
        ratio_gate_px_per_L: Object.fromEntries(LENGTHS.map(L => [`L${L}`, +(C.SCREEN_PARALLEL_RATIO * L).toFixed(2)])) },
      path_check: pathCheck,
      flags_explained: {
        'constants/metric_defs 스냅샷 없음':
          'web2 라인의 원장은 상수 스냅샷 등록부 밖이다(공통 형태 — xint_web2와 같다). '
          + '대신 constants 블록에 이 측정이 의존하는 값을 그대로 싣는다',
        '판정선이 분포에 없다':
          '지시 1-c가 «재기만 한다»다 — 분포의 좋고 나쁨을 이 팔이 판정하면 그것이 곧 '
          + '임계 판단이 된다. 판정선은 격자의 변별력(H·vp 둘 다 존재)과 경로 일치뿐',
      },
      headless_vs_device: {
        headless: '분류 갈래·문턱 오차·경로 일치 — 위 표 전부',
        device: '실제 손의 처짐 분포(이 격자는 오차를 «심은» 것이지 손을 «잰» 것이 아니다) — 다음 회차',
      },
    }

    const outDir = resolve(__dirname, '../../stage0/out')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'graphite_web2.json'), JSON.stringify(ledger, null, 2))

    const hv = ledger.horizontal.hand_band, vv = ledger.vertical.hand_band
    console.log(`[측정] graphite 1-c — 가로 손 대역 vp ${hv.vp}/${hv.n} · 세로 손 대역 vp ${vv.vp}/${vv.n}`)

    // 판정선(측정 전에 등록 — #26): 격자의 변별력과 경로 일치만 판정한다(분포 자체는 판정 안 함)
    const branches = new Set(horiz.map(c => c.branch))
    expect(branches.has('H'), '격자에 H 갈래가 있다(경계 아래를 물었다)').toBe(true)
    expect(branches.has('vp'), '격자에 vp 갈래가 있다(경계 위를 물었다)').toBe(true)
    const vBranches = new Set(vert.map(c => c.branch))
    expect(vBranches.has('V'), '세로 격자에 V 갈래가 있다').toBe(true)
    for (const p of pathCheck) {
      expect(p.agree, `경로 일치 — ${p.kind} L${p.L} h${p.h} err${p.err}: 예측 ${p.predicted}, vps ${p.vpsAfter}`).toBe(true)
    }
  })
})
