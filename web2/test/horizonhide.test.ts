// web2-17 5부 — 지평선 자동 숨김 (5-c ①~⑥).
// 표시 여부 = horizonPref ?? !(소실점 ≥ 1 && 첫 소실점이 화면 안).
// 판정 함수는 render2d.horizonVisible 하나(✕ 컬링의 vpOnScreen과 같은 «화면 안»).
// 반증(D-3): 「화면 안」 조건을 빼면 ③이 실패한다 — 실제 실행 기록은 NOTES 5부 절.

import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session } from './session'
import { horizonVisible, vpOnScreen } from '../src/app/render2d'
import { clearAll, panBy, beginNavHold, endNavHold, setView } from '../src/app/state'

const W = 1200, H = 800
const vis = (s: ReturnType<typeof session>) => horizonVisible(s.app, W, H)

const ledger: Record<string, unknown> = {
  what: 'web2-17 5부(지평선 자동 숨김)의 측정 — 표시 규칙 온·오프와 제스처 동결. horizonhide.test.ts가 매 실행 다시 쓴다.',
}
afterAll(() => {
  const out = resolve(__dirname, '../../stage0/out/horizon_hide_web2.json')
  mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
  writeFileSync(out, JSON.stringify(ledger, null, 1))
})

/** 소실점 하나(화면 안 — (900,400))가 있는 문서 */
function withVp() {
  const s = session(W, H)
  s.draw(500, 650, 680, 537.5)          // → vp0 (900,400)
  expect(s.app.lift.an.vps).toHaveLength(1)
  return s
}

describe('5-c — 자동 숨김 규칙', () => {
  it('① 소실점 0 → 보인다', () => {
    const s = session(W, H)
    expect(vis(s)).toBe(true)
  })

  it('② 소실점 1(화면 안) → 자동으로 사라진다', () => {
    const s = withVp()
    expect(vpOnScreen(s.app.view, { x: 900, y: 400 }, W, H)).toBe(true)
    expect(vis(s)).toBe(false)
  })

  it('③ 팬으로 그 소실점을 화면 밖으로 보내면 다시 보인다', () => {
    const s = withVp()
    panBy(s.app, -400, 0)               // vp 화면 x: 900 → 500... 더 밀어 밖으로
    expect(vis(s)).toBe(false)          // 아직 안(500,400)
    panBy(s.app, -600, 0)               // 화면 x = -100 — 밖
    expect(vpOnScreen(s.app.view, { x: 900, y: 400 }, W, H)).toBe(false)
    expect(vis(s)).toBe(true)
    ledger['pan_cycle'] = { in_view_hidden: true, out_of_view_shown: true }
  })

  it('④ 체크박스를 한 번 만지면(pref 굳음) 그 뒤로는 ②③이 표시를 안 바꾼다', () => {
    const s = withVp()
    s.app.horizonPref = true            // 사람이 켰다(main.ts change 배선의 상태 몫)
    expect(vis(s)).toBe(true)           // 소실점이 화면 안이어도 보인다
    panBy(s.app, -1000, 0)
    expect(vis(s)).toBe(true)
    s.app.horizonPref = false           // 사람이 껐다
    panBy(s.app, 1000, 0)
    expect(vis(s)).toBe(false)          // 소실점이 어디 있든 안 보인다
  })

  it('⑤ 비우기 뒤 자동으로 돌아간다', () => {
    const s = withVp()
    s.app.horizonPref = false
    clearAll(s.app, W, H)
    expect(s.app.horizonPref).toBeNull()
    expect(vis(s)).toBe(true)           // 소실점 0 — 자동이 보여준다
  })

  it('⑥ 왕복 제스처에서 표시 변화 0~1회 — 제스처 동결(fadeView)', () => {
    const s = withVp()
    expect(vis(s)).toBe(false)
    beginNavHold(s.app)
    const seen: boolean[] = [vis(s)]
    // 팬 왕복 — 소실점이 화면을 여러 번 드나드는 궤적
    for (const dx of [-600, -600, 400, 800, -400, 400]) {
      panBy(s.app, dx, 0)
      seen.push(vis(s))
    }
    endNavHold(s.app)
    seen.push(vis(s))
    let changes = 0
    for (let i = 1; i < seen.length; i++) if (seen[i] !== seen[i - 1]) changes++
    ledger['gesture_cycle'] = { samples: seen.length, changes }
    console.log(`[측정] 5-c ⑥ — 왕복 제스처 표본 ${seen.length} · 표시 변화 ${changes}회`)
    expect(changes).toBeLessThanOrEqual(1)
    // 대조군(판정이 살아 있다): 동결 없이 같은 궤적이면 여러 번 바뀐다
    const s2 = withVp()
    const seen2: boolean[] = [vis(s2)]
    for (const dx of [-600, -600, 400, 800, -400, 400]) {
      panBy(s2.app, dx, 0)
      seen2.push(vis(s2))
    }
    let changes2 = 0
    for (let i = 1; i < seen2.length; i++) if (seen2[i] !== seen2[i - 1]) changes2++
    ledger['gesture_cycle_control'] = { samples: seen2.length, changes: changes2 }
    expect(changes2).toBeGreaterThan(1)
  })

  it('궤도 포즈에서 소실점이 그 포즈 화면 안이면 숨는다 — 판정 포즈가 fadeRef다', () => {
    // 궤도 후에는 vpMarks가 그 포즈의 사영을 낸다 — 같은 함수(원칙 a)가 그대로 판정한다.
    const s = withVp()
    setView(s.app, { s: 1, ox: 0, oy: 0 })
    expect(vis(s)).toBe(false)
  })
})
