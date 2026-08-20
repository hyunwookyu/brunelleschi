import { describe, it, expect } from 'vitest'
import { analyze, screenAxes, DRAW_POSE } from '../src/core/camera'
import { cubeBasis, cubeGeom, cubeHit, poseForElem } from '../src/core/viewcube'
import { constructedDoc } from './fixtures'
import { v3, dot3, len3, cross3, quatRotate, quatFromBasis, pt } from '../src/core/vec'

const an = analyze(constructedDoc().doc)

describe('quatFromBasis', () => {
  it('기저를 그대로 돌려준다', () => {
    const x = v3(0, 0, -1), y = v3(0, 1, 0), z = v3(1, 0, 0)
    const q = quatFromBasis(x, y, z)
    const rx = quatRotate(q, v3(1, 0, 0))
    expect(rx.x).toBeCloseTo(x.x, 9)
    expect(rx.y).toBeCloseTo(x.y, 9)
    expect(rx.z).toBeCloseTo(x.z, 9)
    const rz = quatRotate(q, v3(0, 0, 1))
    expect(rz.x).toBeCloseTo(z.x, 9)
  })
})

describe('뷰 큐브 — 기준 좌표계는 그린 공간의 축', () => {
  it('기저가 정규직교이고 X = vp0 방향이다', () => {
    const b = cubeBasis(an)!
    const vp0 = an.axes.find(a => a.id === 'vp0')!.dir
    expect(dot3(b.X, vp0)).toBeCloseTo(1, 9)
    expect(len3(b.X)).toBeCloseTo(1, 9)
    expect(dot3(b.X, b.Y)).toBeCloseTo(0, 9)
    expect(dot3(b.X, b.Z)).toBeCloseTo(0, 9)
    expect(len3(cross3(b.Y, b.Z))).toBeCloseTo(1, 9)
  })

  it('작도 전에는 큐브가 없다', () => {
    const partial = analyze({ frame: { W: 1200, H: 800 }, strokes: [] })
    expect(cubeBasis(partial)).toBeNull()
  })

  it('면 시점 = 1점: 그 축의 소실점이 주점에 오고, 피치 0·롤 0', () => {
    const pivot = v3(0, 0, -400)
    const pose = poseForElem(an, { kind: 'face', dirLocal: v3(-1, 0, 0) }, pivot, 500)!
    // 롤 0: 카메라 right의 세계 y 성분이 0
    const right = quatRotate(pose.q, v3(1, 0, 0))
    expect(right.y).toBeCloseTo(0, 9)
    // 피치 0: 카메라 back(시선 반대)의 y 성분이 0
    const back = quatRotate(pose.q, v3(0, 0, 1))
    expect(back.y).toBeCloseTo(0, 9)
    // 1점: vp0 축의 소실점이 주점에 정확히 온다
    const sa = screenAxes(an, pose)
    const vp0 = sa.find(a => a.id === 'vp0')!
    expect(vp0.vp!.x).toBeCloseTo(an.principal!.x, 6)
    expect(vp0.vp!.y).toBeCloseTo(an.principal!.y, 6)
    // 다른 가로축(vp1)은 화면 평행(무한원)이 된다 — 화면 가로세로가 축
    const vp1 = sa.find(a => a.id === 'vp1')!
    expect(vp1.vp).toBeNull()
  })

  it('윗면 시점 — 내려다보고 롤 0', () => {
    const pose = poseForElem(an, { kind: 'face', dirLocal: v3(0, 1, 0) }, v3(0, 0, -400), 500)!
    const back = quatRotate(pose.q, v3(0, 0, 1))
    expect(back.y).toBeCloseTo(1, 6) // 위에서 본다
  })

  it('꼭짓점·모서리·면 판정 — 그리기와 같은 cubeGeom', () => {
    const layout = { cx: 100, cy: 100, size: 80 }
    const geom = cubeGeom(an, DRAW_POSE, layout)!
    // 보이는 꼭짓점 하나를 집어 그 위를 클릭
    const visFace = geom.faces.find(f => f.visible)!
    const cornerIdx = visFace.poly[0]!
    const cp = geom.corners[cornerIdx]!.p
    const hit = cubeHit(geom, cp)!
    expect(hit.kind).toBe('corner')
    // 면 중심 클릭 → 면
    const center = visFace.poly.reduce(
      (acc, i) => pt(acc.x + geom.corners[i]!.p.x / 4, acc.y + geom.corners[i]!.p.y / 4), pt(0, 0))
    const fh = cubeHit(geom, center)
    expect(fh).not.toBeNull()
    // 큐브 밖 → null
    expect(cubeHit(geom, pt(300, 300))).toBeNull()
  })
})
