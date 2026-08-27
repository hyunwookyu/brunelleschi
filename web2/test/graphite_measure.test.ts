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
      const shortVp = hand.filter(c => c.branch === 'short-vp').length
      return { n: hand.length, vp, short_vp: shortVp,
        note: '#68의 손 대역(2~5px). vp = 소실점 갈래(카메라가 바뀐다) · short_vp = 방향은 소실점인데 VP_MIN_LEN 미만 — **확정 시 축 스냅이 가장 가까운 축(수평)에 앉힌다**(short_vp_commit이 값으로 확인). 수평으로 안 앉는 칸 = vp뿐이다. 비율이 아니라 분자/분모(§5)' }
    }

    // short-vp의 확정 거동(1차 리뷰 [8]) — 분류는 «content(짧다)»지만 커밋은 축 스냅을
    // 지나 **가장 가까운 축**에 앉는다(가로 획 → H·처짐 0 / 세로 획 → V·기움 0).
    // ⚠ 0이 구성 필연과 안 갈리지 않게(#40② — 2차 리뷰 [5]) **대조군**을 같이 태운다:
    // vp 갈래 셀은 커서 그대로 확정되므로 committedDrop이 심은 오차 그대로(0이 아님) —
    // 같은 하네스가 0 아닌 값을 실제로 낼 수 있음을 매 실행 증명한다.
    const shortVpCommit: { kind: string; L: number; h: number; err: number; sign: number; committedDrop: number }[] = []
    for (const [L, h, err, sign] of [[40, 160, 3, 1], [40, 80, 5, -1], [40, 250, 4, 1]] as [number, number, number, number][]) {
      const a2 = { x: 350, y: HZ + h }, b2 = { x: 350 + L, y: HZ + h + err * sign }
      const s = session(W, H)
      const st = s.draw(a2.x, a2.y, b2.x, b2.y)
      shortVpCommit.push({ kind: 'horiz-shortvp', L, h, err, sign, committedDrop: st ? Math.abs(st.b.y - st.a.y) : NaN })
    }
    // 세로 short-vp — V축에 앉는다(기움 run이 0으로. 2차 리뷰 [5]㉰ — 세로는 세로로 잰다)
    const shortVpCommitV: { kind: string; L: number; h: number; err: number; sign: number; committedRun: number }[] = []
    for (const [L, h, err, sign] of [[40, 160, 3, 1], [40, 80, 5, -1]] as [number, number, number, number][]) {
      const a2 = { x: 500, y: HZ + h }, b2 = { x: 500 + err * sign, y: HZ + h - L }
      const s = session(W, H)
      const st = s.draw(a2.x, a2.y, b2.x, b2.y)
      shortVpCommitV.push({ kind: 'vert-shortvp', L, h, err, sign, committedRun: st ? Math.abs(st.b.x - st.a.x) : NaN })
    }
    // 대조군 — vp 갈래 셀(L140·h160·**err8**: 160×140/8 = 2800 < 7200이라 vp — err3은
    // 7466 > 7200이라 H다: 첫 판이 그 셀을 골라 대조군 자신이 0을 냈고 이 산술이 잡았다):
    // vp 확정은 커서 그대로라 처짐이 남는다.
    const vpControl = (() => {
      const a2 = { x: 350, y: HZ + 160 }, b2 = { x: 350 + 140, y: HZ + 160 + 8 }
      const s = session(W, H)
      const st = s.draw(a2.x, a2.y, b2.x, b2.y)
      return { kind: 'vp-control', L: 140, h: 160, err: 8, committedDrop: st ? Math.abs(st.b.y - st.a.y) : NaN }
    })()

    const ledger = {
      what: 'web2-19 1-c — 손 오차를 태운 화면 평행 의도 획의 갈래 분포. **측정만 한다** — '
        + '임계(PARALLEL_PX·SCREEN_PARALLEL_RATIO·VP_FAR_W)는 이 회차가 만지지 않는다(지시 ⚠⚠ — '
        + 'web2-17이 따라긋기 8px 대역에서 경계 플립을 실측한 자리다). 판단은 다음 회차 몫.',
      def: 'branch: H/V = 화면 평행 선언 · vp = 소실점 정의 · short-vp = 방향은 소실점인데 '
        + 'VP_MIN_LEN 미만(확정은 축 스냅이 수평에 앉힌다 — short_vp_commit) · content = 그 외. '
        + '**갈래 판정 순서**(camera.ts classifyNext): ① 처짐 ≤ PARALLEL_PX(1.5) → H '
        + '② |vpx−ax| > VP_FAR_W·W(7200px) → H(무한원으로 읽음). |vpx−ax| = 이격h×가로R÷처짐이라 '
        + '길이·이격 의존 — 손 대역에서 H로 살아남은 칸의 대부분은 ①이 아니라 ②의 몫이다'
        + '(minVpErr가 길이·이격마다 다른 이유. 임계 판단의 지렛대도 PARALLEL_PX 하나가 아니다). '
        + '③ run/L ≤ 0.05 → V ④ L < VP_MIN_LEN → short-vp ⑤ 나머지 vp. '
        + 'minVpErr = 그 (길이,이격)에서 소실점이 서는 최소 끝점 오차 px(null = 이 격자 안 없음). '
        + 'vpDist = 시작점에서 소실점까지 화면 px.',
      constants: {
        PARALLEL_PX: C.PARALLEL_PX, SCREEN_PARALLEL_RATIO: C.SCREEN_PARALLEL_RATIO,
        VP_FAR_W: C.VP_FAR_W, MIN_DIR_LEN_RATIO: C.MIN_DIR_LEN_RATIO,
        VP_MIN_LEN_RATIO: C.VP_MIN_LEN_RATIO, OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX,
        frame: { W, H, HZ, DIAG },
      },
      grid: { LENGTHS, HEIGHTS, ERRORS, SIGNS, n_per_table: LENGTHS.length * HEIGHTS.length * ERRORS.length * SIGNS.length },
      horizontal: { ...fold(horiz), hand_band: handBand(horiz) },
      vertical: { ...fold(vert), hand_band: { ...handBand(vert), note: '#68의 손 대역(2~5px). vp = 소실점 갈래 · short_vp = 방향은 소실점인데 VP_MIN_LEN 미만 — 확정 시 축 스냅이 **V축**에 앉힌다(기움 0 — short_vp_commit_vertical이 값으로 확인). 분자/분모(§5)' },
        ratio_gate_px_per_L: Object.fromEntries(LENGTHS.map(L => [`L${L}`, +(C.SCREEN_PARALLEL_RATIO * L).toFixed(2)])) },
      path_check: pathCheck,
      short_vp_commit: shortVpCommit,
      short_vp_commit_vertical: shortVpCommitV,
      short_vp_commit_control: vpControl,
      flags_explained: {
        'grid.ERRORS[0] = 0 · path_check[0].err = 0 (오차류 0)':
          '격자의 0점은 **의도된 대조군**이다(무오차 행 — 손 대역과의 경계를 이것이 세운다). '
          + '측정 실패의 0이 아니라 입력 축의 눈금이다',
        'short_vp_commit의 committedDrop 전부 0':
          '축 스냅이 앉힌 결과의 구성값이다 — «경로 미실행»과 가르는 대조군이 같이 있다'
          + '(short_vp_commit_control: vp 갈래 셀은 처짐 8이 그대로 남는다 · 0이 아닌 값을 '
          + '같은 하네스가 실제로 낸다 — #40²의 답)',
        'byErr의 낮은 오차 행이 단일 범주(H 36 / V 36)':
          '그것이 경계의 구조다 — 처짐 ≤ PARALLEL_PX(1.5)는 전부 화면 평행으로 읽히는 것이 '
          + '규칙이고(camera.ts 154행), 변별력은 그 위 행(2~8px — H·vp·short-vp로 갈린다)이 '
          + '진다. 전 행이 갈리면 오히려 임계가 안 걸리는 것이다',
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
    for (const c of shortVpCommit) {
      expect(c.committedDrop, `short-vp 확정이 수평에 앉는다 — L${c.L} h${c.h} err${c.err}`).toBe(0)
    }
    for (const c of shortVpCommitV) {
      expect(c.committedRun, `세로 short-vp 확정이 V축에 앉는다 — L${c.L} h${c.h} err${c.err}`).toBe(0)
    }
    // 대조군 — 같은 하네스가 0 아닌 값을 실제로 낸다(#40②: 위 0이 «경로 미실행»이 아니다)
    expect(vpControl.committedDrop, 'vp 갈래는 처짐이 남는다(0이 아니다)').toBeGreaterThan(0)
    for (const p of pathCheck) {
      expect(p.agree, `경로 일치 — ${p.kind} L${p.L} h${p.h} err${p.err}: 예측 ${p.predicted}, vps ${p.vpsAfter}`).toBe(true)
    }
  })
})
