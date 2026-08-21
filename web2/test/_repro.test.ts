// 재현 표식 — 지시 1·2 (D-1: 경로 전체에 표식을 심는다). 임시 파일.
import { describe, it } from 'vitest'
import { session } from './session'
import { resolveStart, resolveEnd } from '../src/core/draft'
import { analyze, classifyNext, screenAxes, vpMarks, DRAW_POSE } from '../src/core/camera'

const W = 1200, H = 800, HY = 400
const set = (s: any) => ({ ...s.app.osnap, radius: s.app.osnap.radius })

function trace(s: any, ax: number, ay: number, bx: number, by: number, tag: string) {
  const an = s.app.lift.an
  const oh = resolveStart(s.app.lift, s.app.pose, { x: ax, y: ay }, set(s))
  const start = oh ? oh.p : { x: ax, y: ay }
  const cls = classifyNext(an, start, { x: bx, y: by })
  const r = resolveEnd(s.app.lift, s.app.pose, an, start, { p3: oh?.p3 ?? null }, { x: bx, y: by }, set(s))
  console.log(`[${tag}] startSnap=${oh?.kind ?? '-'}@${oh ? `${oh.p.x.toFixed(1)},${oh.p.y.toFixed(1)}` : '-'}`,
    `cls=${cls.role}${cls.screenAxis ? '/' + cls.screenAxis : ''}${cls.vp ? `@vp(${cls.vp.x.toFixed(0)},${cls.vp.y.toFixed(0)})` : ''}`,
    `end=(${r.end.x.toFixed(1)},${r.end.y.toFixed(1)}) label=${r.label} axis=${r.axis}`)
}

describe('재현', () => {
  it('지시 2 — 지평선만 긋고 수평선을 그린다', () => {
    const s = session(W, H)
    s.draw(100, HY, 1100, HY)
    const an = s.app.lift.an
    console.log('축:', screenAxes(an, DRAW_POSE).map(a => `${a.id}:${a.vp ? `vp(${a.vp.x.toFixed(0)},${a.vp.y.toFixed(0)})` : `dir(${a.dir!.x.toFixed(2)},${a.dir!.y.toFixed(2)})`}`).join(' '))
    for (const d of [0, 1, 1.5, 2, 3, 5, 10, 20]) {
      trace(s, 300, 600, 700, 600 - d, `수평의도 처짐 ${d}px`)
    }
    // 실제로 그어 본다 (처짐 5px)
    const s2 = session(W, H)
    s2.draw(100, HY, 1100, HY)
    const st = s2.draw(300, 600, 700, 595)
    const a2 = analyze(s2.app.doc)
    console.log('그은 뒤:', JSON.stringify({ a: st?.a, b: st?.b, vps: a2.vps, role: a2.roles.get(st!.id), hDecl: a2.screenHDeclared }))
  })

  it('지시 1 — 소실점에서 출발하는 선', () => {
    const s = session(W, H)
    s.draw(100, HY, 1100, HY)
    s.draw(900, HY, 900, HY)          // 찍기 → vp0 = (900,400)
    const an = s.app.lift.an
    console.log('vps:', JSON.stringify(an.vps), 'marks:', JSON.stringify(vpMarks(an, DRAW_POSE)))
    // 소실점에서 아래로 뻗는 선 — 새 축(경사 소실점)을 만들려는 것
    for (const [bx, by] of [[700, 600], [800, 700], [600, 500], [900, 700]] as const) {
      trace(s, 900, HY, bx, by, `vp0에서 (${bx},${by})`)
    }
    // 소실점 근처(반경 안)에서 출발
    trace(s, 903, HY + 2, 700, 600, 'vp0 근처에서')
  })
})
