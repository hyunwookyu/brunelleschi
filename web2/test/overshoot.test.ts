// web2-12 8번 — 모서리 넘김의 «만나는 끝» 판정(core/overshoot.ts).
// 표현 판정만이다 — 기하 불변은 이 파일의 마지막 팔이 lift 결과로 직접 잰다.

import { describe, it, expect } from 'vitest'
import { liftAll } from '../src/core/lift'
import { overshootEnds } from '../src/core/overshoot'
import { constructedDoc } from './fixtures'

/** 작도 완료 + 모서리 기둥 + 그 끝에서 잇는 선 — L자(모서리 둘·자유 끝 둘) */
function scene() {
  const b = constructedDoc()
  const post = b.add(500, 500, 500, 300)    // 기둥 — 아래끝이 깊이선 모서리(500,500)와 만난다
  const top = b.add(500, 300, 700, 350)     // 위끝에서 vp0 축으로 — 시작이 기둥 위끝과 만난다
  return { b, post, top }
}

describe('overshootEnds (web2-12 8번)', () => {
  it('만나는 끝만 참이다 — 모서리는 참·자유 끝은 거짓', () => {
    const { b, post, top } = scene()
    const lift = liftAll(b.doc)
    expect(lift.lifted.has(post.id)).toBe(true)
    expect(lift.lifted.has(top.id)).toBe(true)
    const m = overshootEnds(lift)
    const mp = m.get(post.id)!
    const mt = m.get(top.id)!
    // 기둥: 아래끝(a=500,500)은 깊이선 둘과 만난다 · 위끝(b)은 top과 만난다 — 둘 다 참
    expect(mp.a).toBe(true)
    expect(mp.b).toBe(true)
    // 잇는 선: 시작(a)은 기둥 위끝 — 참 · 끝(b)은 자유 — **거짓**(반증 조건 D-3:
    // 판정이 전부 참을 내면 여기가 잡는다)
    expect(mt.a).toBe(true)
    expect(mt.b).toBe(false)
  })

  it('T자 — 끝이 다른 획의 «몸통 위»에 닿아도 만남이다', () => {
    const b = constructedDoc()
    const post = b.add(500, 500, 500, 300)
    b.add(500, 300, 700, 350)
    // 기둥 몸통의 중간쯤에서 vp0 축으로 — 시작점이 기둥 «몸통 위»다(끝점 아님)
    const mid = b.add(500, 400, 640, 430)
    const lift = liftAll(b.doc)
    if (!lift.lifted.has(mid.id)) return   // 픽스처가 승격 못 하면 판정 대상이 아니다
    const m = overshootEnds(lift)
    expect(m.get(mid.id)!.a).toBe(true)
  })

  it('기하 불변 — 판정을 불러도 lift·문서가 안 움직인다(표현 계층의 증명)', () => {
    const { b } = scene()
    const before = JSON.stringify(b.doc.strokes.map(s => [s.id, s.a, s.b]))
    const lift = liftAll(b.doc)
    const seg = JSON.stringify([...lift.lifted.entries()])
    overshootEnds(lift)
    overshootEnds(lift)   // 캐시 경로도
    expect(JSON.stringify(b.doc.strokes.map(s => [s.id, s.a, s.b]))).toBe(before)
    expect(JSON.stringify([...lift.lifted.entries()])).toBe(seg)
  })
})
