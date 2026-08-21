// 작도 순서 — 어느 것을 먼저 그어도 같은 결과다 (지시 1)
//
// 불변식 j·k를 **확정 전에 그은 획까지** 재도록 고쳐 쓴다.
// 초판의 구멍: 불변식 k 검사(lift.test.ts)가 `before`를 `r1.lifted`에서만 만들었다 —
// 그때 대기 중이던 획은 목록에 없으니 「사라졌는가·튀었는가」를 아예 안 봤다.
// 여기서는 **문서의 모든 획**을 매 단계 재고, 대기 획은 저장된 2D를 그 위치로 본다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import type { Session } from './session'
import { project, DRAW_POSE } from '../src/core/camera'
import type { App } from '../src/app/state'
import type { Pt } from '../src/core/vec'

/** 한 획이 «지금 화면 어디에 있는가» — 승격됐으면 재사영, 대기면 저장된 2D.
 *  둘을 같은 양으로 보는 것이 요점이다. 사람 눈에는 구분이 없다. */
function screenOf(app: App, id: number): { a: Pt; b: Pt } | null {
  const st = app.lift.strokes.get(id)
  if (!st) return null
  const g = app.lift.lifted.get(id)
  if (!g) return { a: st.a, b: st.b }
  const pose = st.view ?? DRAW_POSE
  const a = project(app.lift.an, pose, g.a3), b = project(app.lift.an, pose, g.b3)
  return a && b ? { a, b } : { a: st.a, b: st.b }
}

const near = (p: Pt, q: Pt, eps = 1e-6) => Math.hypot(p.x - q.x, p.y - q.y) <= eps

/** 매 단계 전 획의 화면 위치를 재고, 이전 단계와 다르면 그 자리를 이름과 함께 낸다 */
function watch(s: Session) {
  const seen = new Map<number, { a: Pt; b: Pt }>()
  const moved: string[] = []
  const vanished: string[] = []
  return {
    step(tag: string) {
      // j — 한 번 본 획은 문서에서 사라지지 않고, 그려질 자리가 있다.
      // 지평선만 예외다: 3D가 없고(무한원) 화면 전폭의 작도선으로 그려진다 — 자리가 따로 있다.
      for (const id of seen.keys()) {
        if (!s.app.lift.strokes.get(id)) { vanished.push(`${tag}: #${id} 문서에서 사라짐`); continue }
        if (s.app.lift.an.roles.get(id) === 'horizon') {
          if (s.app.lift.an.horizonY === null) vanished.push(`${tag}: #${id} 지평선이 없어짐`)
          continue
        }
        const has = s.app.lift.lifted.has(id) || s.app.lift.waiting.includes(id)
        if (!has) vanished.push(`${tag}: #${id} 승격도 대기도 아님 — 그려질 자리가 없다`)
      }
      // k — 화면 위치는 카메라가 바뀌어도 그대로다 (대기 → 승격 순간 포함)
      for (const st of s.app.doc.strokes) {
        const now = screenOf(s.app, st.id)
        if (!now) continue
        const was = seen.get(st.id)
        if (was && !(near(was.a, now.a) && near(was.b, now.b))) {
          moved.push(`${tag}: #${st.id} (${was.a.x.toFixed(2)},${was.a.y.toFixed(2)})->(${was.b.x.toFixed(2)},${was.b.y.toFixed(2)}) 가 ` +
            `(${now.a.x.toFixed(2)},${now.a.y.toFixed(2)})->(${now.b.x.toFixed(2)},${now.b.y.toFixed(2)}) 로 튐`)
        }
        seen.set(st.id, now)
      }
    },
    moved, vanished,
    lifted: () => s.app.lift.lifted.size,
    waiting: () => [...s.app.lift.waiting],
  }
}

// 화면 좌표 — 지평선 y=400, vp0=(900,400), vp1=(100,400)
const HZ = [100, 400, 1100, 400] as const
const D1 = [500, 650, 680, 537.5] as const  // (500,650)에서 vp0 쪽
const D2 = [500, 650, 320, 537.5] as const  // (500,650)에서 vp1 쪽
const VT = [500, 650, 500, 450] as const    // 수직
const HR = [500, 650, 700, 650] as const    // 수평

describe('1 — 작도 순서 강제가 없다', () => {
  it('지평선 → 수직선 → 깊이선 → 수직선: 전부 남고 전부 3D가 된다', () => {
    const s = session(1200, 800)
    const w = watch(s)
    s.draw(...HZ); w.step('지평선')
    s.draw(...VT); w.step('+수직')
    s.draw(...D1); w.step('+깊이')
    s.draw(680, 537.5, 680, 427.5); w.step('+수직2')
    expect(w.vanished).toEqual([])
    expect(w.moved).toEqual([])
    expect(w.waiting()).toEqual([])
    expect(w.lifted()).toBe(3) // 지평선 빼고 셋
  })

  it('지평선 → 수평선 → 깊이선: 전부 남고 전부 3D가 된다', () => {
    const s = session(1200, 800)
    const w = watch(s)
    s.draw(...HZ); w.step('지평선')
    s.draw(...HR); w.step('+수평')
    s.draw(...D1); w.step('+깊이')
    expect(w.vanished).toEqual([])
    expect(w.moved).toEqual([])
    expect(w.waiting()).toEqual([])
    expect(w.lifted()).toBe(2)
  })

  it('지평선 → 수직선 → 수평선 → 깊이선: 둘 다 남는다', () => {
    const s = session(1200, 800)
    const w = watch(s)
    s.draw(...HZ); w.step('지평선')
    s.draw(...VT); w.step('+수직')
    s.draw(...HR); w.step('+수평')
    s.draw(...D1); w.step('+깊이')
    expect(w.vanished).toEqual([])
    expect(w.moved).toEqual([])
    expect(w.waiting()).toEqual([])
    expect(w.lifted()).toBe(3)
  })

  // 지시 2에서 켠다 — 첫 앵커가 획 종류를 안 가리게 되는 것이 지시 2의 내용이고,
  // 그 변경이 앵커를 깊이선으로 옮겨 좌표 기대값을 흔든다. 지시 2·3이 좌표계를
  // 다시 잡으므로(지면 Y=0 · 눈높이 1.6) 그 한 번에 함께 맞춘다.
  // ⚠ 이 팔은 앵커 규칙을 **단독으로** 잰다 — 수직·수평 획을 하나라도 섞으면
  // 그것이 앵커가 되어 깊이선을 구해 주므로 제한이 안 드러난다. 검증됨(되살려 확인):
  // 제한을 되돌리면 이 팔만 빨개지고 나머지 일곱은 통과한다.
  it('깊이선만으로도 3D가 선다 — H·V 획이 하나도 없는 경우 (앵커가 획 종류를 안 가린다)', () => {
    const s = session(1200, 800)
    const w = watch(s)
    s.draw(...HZ); w.step('지평선')
    s.draw(...D1); w.step('+깊이1')            // (500,650) → vp0
    s.draw(...D2); w.step('+깊이2')            // (500,650) → vp1, 같은 시작점
    expect(w.vanished).toEqual([])
    expect(w.moved).toEqual([])
    expect(w.waiting()).toEqual([])
    expect(w.lifted()).toBe(2)
  })

  it('지평선 → 깊이선 먼저여도 3D가 선다', () => {
    const s = session(1200, 800)
    const w = watch(s)
    s.draw(...HZ); w.step('지평선')
    s.draw(...D1); w.step('+깊이')
    s.draw(...VT); w.step('+수직')
    expect(w.vanished).toEqual([])
    expect(w.moved).toEqual([])
    expect(w.waiting()).toEqual([])
    expect(w.lifted()).toBe(2)
  })

  it('순서가 결과를 안 바꾼다 — 같은 획 셋을 다른 순서로 그으면 같은 3D', () => {
    const key = (s: Session) => [...s.app.lift.lifted.values()]
      .map(g => [g.a3, g.b3].map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`).join('|'))
      .sort().join('  ')
    const a = session(1200, 800)
    a.draw(...HZ); a.draw(...VT); a.draw(...D1)
    const b = session(1200, 800)
    b.draw(...HZ); b.draw(...D1); b.draw(...VT)
    expect(key(b)).toBe(key(a))
  })

  it('두 번째 소실점이 f를 바꿔도 — 대기 획까지 포함해 — 화면이 안 튄다', () => {
    const s = session(1200, 800)
    const w = watch(s)
    s.draw(...HZ); w.step('지평선')
    s.draw(...VT); w.step('+수직')
    s.draw(...D1); w.step('+깊이1')
    // 아직 아무것에도 안 닿는 획 — 대기 상태로 남는다
    s.draw(200, 700, 200, 600); w.step('+뜬 수직(대기)')
    expect(s.app.lift.waiting.length).toBe(1)
    s.draw(...D2); w.step('+깊이2 (f가 바뀐다)')
    expect(s.app.lift.an.fSource).toBe('two-vp')
    expect(w.vanished).toEqual([])
    expect(w.moved).toEqual([])   // ← 대기 획이 이 검사에 들어 있는 것이 요점이다
  })

  it('반례: 대기 획은 «실패»가 아니라 상태다 — 닿을 것이 없으면 대기로 남는다', () => {
    const s = session(1200, 800)
    s.draw(...HZ)
    s.draw(...D1)
    s.draw(200, 700, 200, 600) // 기존 기하와 안 닿는다
    expect(s.app.lift.waiting.length).toBe(1)
    expect(s.app.lift.strokes.get(s.app.lift.waiting[0]!)).toBeTruthy() // 사라지지 않았다
  })
})
