// web2-50 — 면 텍스처의 **순수 수학 몫**: uv 왕복 · 해상도 양자화 · 등방 배율 ·
// 개구부(삼각분할이 구멍을 뺀다 — 텍스처 절단의 «근거»가 이 기하다) · 필압 정렬.
// 픽셀(굽기·곱 합성)은 e2e(paint50.spec)가 잰다 — 단위 환경(node)에는 캔버스가 없다.

import { describe, it, expect } from 'vitest'
import { uvBoxOf, uvOf, uvTo3, texLevel, texDims, uvFromScreen, paintGeoOf } from '../src/core/facetex'
import { triangulate3 } from '../src/core/face'
import type { ResolvedFace } from '../src/core/face'
import { repBasis } from '../src/core/matrep'
import { C } from '../src/core/constants'
import { v3, sub3, len3, type V3 } from '../src/core/vec'
import { session } from './session'
import { commitPaint, toggleFaceAt } from '../src/app/state'
import { project, DRAW_POSE } from '../src/core/camera'

const wall = (): ResolvedFace => {
  const outer = [v3(-2, 0, -8), v3(2, 0, -8), v3(2, 2.4, -8), v3(-2, 2.4, -8)]
  return { id: 1, outer, holes: [], normal: v3(0, 0, 1), flat: 0, tris: triangulate3(outer, [], v3(0, 0, 1)) }
}
const slab = (): ResolvedFace => {
  const outer = [v3(-2, 0, -8), v3(2, 0, -8), v3(2, 0, -12), v3(-2, 0, -12)]
  return { id: 2, outer, holes: [], normal: v3(0, 1, 0), flat: 0, tris: triangulate3(outer, [], v3(0, 1, 0)) }
}
const slope = (): ResolvedFace => {
  const n = v3(0, Math.SQRT1_2, Math.SQRT1_2)
  const outer = [v3(-2, 0, -8), v3(2, 0, -8), v3(2, 1.7, -9.7), v3(-2, 1.7, -9.7)]
  return { id: 3, outer, holes: [], normal: n, flat: 0, tris: triangulate3(outer, [], n) }
}

describe('uv 왕복 — 기저는 repBasis(#54: 무늬와 같은 기저)', () => {
  it('세 분류(벽·슬라브·경사)에서 3D → uv → 3D가 항등이다', () => {
    for (const rf of [wall(), slab(), slope()]) {
      const box = uvBoxOf(rf)
      for (const P of rf.outer) {
        const q = uvOf(box.basis, P)
        const back = uvTo3(box.basis, q.x, q.y)
        expect(len3(sub3(back, P)), `면 ${rf.id}`).toBeLessThan(1e-12)
      }
      // 상자가 외곽을 정확히 문다
      expect(box.u1 - box.u0).toBeGreaterThan(0)
      expect(box.v1 - box.v0).toBeGreaterThan(0)
    }
  })
  it('⚠ 반증(D-3) — 평면 밖 점은 uv → 3D 왕복이 항등이 아니다(평면 사영이 실린다)', () => {
    const rf = wall()
    const box = uvBoxOf(rf)
    const off = v3(0, 1, -7)                       // 평면(z=-8)에서 1 단위 떨어진 점
    const q = uvOf(box.basis, off)
    const back = uvTo3(box.basis, q.x, q.y)
    expect(len3(sub3(back, off))).toBeGreaterThan(0.9)   // 법선 성분이 죽는다 — 자가 잰다
  })
})

describe('해상도 — 화면 크기의 2^n 올림 양자화 · 상한·하한(C.FACETEX_*)', () => {
  it('양자화·상하한이 선다', () => {
    expect(texLevel(1)).toBe(C.FACETEX_MIN_PX)
    expect(texLevel(C.FACETEX_MIN_PX)).toBe(C.FACETEX_MIN_PX)
    expect(texLevel(C.FACETEX_MIN_PX + 1)).toBe(C.FACETEX_MIN_PX * 2)
    expect(texLevel(300)).toBe(512)
    expect(texLevel(1e9)).toBe(C.FACETEX_MAX_PX)
    // 2^n — 단계 수가 유한하다(같은 단계 = 재굽기 없음의 근거)
    const lvls = new Set<number>()
    for (let px = 1; px <= C.FACETEX_MAX_PX * 2; px += 7) lvls.add(texLevel(px))
    for (const lv of lvls) expect(Math.log2(lv) % 1).toBe(0)
  })
  it('texDims — 등방 배율 하나(왜곡 없음) · 긴 변이 단계에 붙는다', () => {
    const rf = wall()
    const box = uvBoxOf(rf)                        // 4 × 2.4
    const d = texDims(box, 512)
    expect(Math.max(d.w, d.h)).toBe(512)
    expect(Math.abs(d.w / d.h - 4 / 2.4)).toBeLessThan(0.02)
    // 배율 하나 — 두 축의 px/단위가 같다(ceil의 몫 1px 안)
    expect(Math.abs(d.pxPerUnit * (box.u1 - box.u0) - d.w)).toBeLessThanOrEqual(1)
    expect(Math.abs(d.pxPerUnit * (box.v1 - box.v0) - d.h)).toBeLessThanOrEqual(1)
  })
})

describe('개구부 — 삼각분할이 구멍을 뺀다(증상 ⑤의 기하 근거 · 픽셀은 경계 절단 e2e)', () => {
  it('구멍 중심은 어느 삼각형에도 안 들고, 고리 안 점은 든다', () => {
    const outer = [v3(-2, 0, -8), v3(2, 0, -8), v3(2, 2.4, -8), v3(-2, 2.4, -8)]
    const hole = [v3(-0.5, 0.8, -8), v3(0.5, 0.8, -8), v3(0.5, 1.6, -8), v3(-0.5, 1.6, -8)]
    const tris = triangulate3(outer, [hole], v3(0, 0, 1))
    expect(tris.length).toBeGreaterThan(0)
    const inTri = (P: V3): boolean => {
      for (let i = 0; i + 2 < tris.length; i += 3) {
        const a = tris[i]!, b = tris[i + 1]!, c = tris[i + 2]!
        const s = (p: V3, q: V3, r: V3) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
        const d1 = s(a, b, P), d2 = s(b, c, P), d3 = s(c, a, P)
        const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0
        if (!(neg && pos)) return true
      }
      return false
    }
    expect(inTri(v3(0, 1.2, -8)), '구멍 중심 — 안 덮인다').toBe(false)
    expect(inTri(v3(-1.5, 1.2, -8)), '고리 안 — 덮인다').toBe(true)
    expect(inTri(v3(0, 0.3, -8)), '구멍 아래 띠 — 덮인다').toBe(true)
  })
})

describe('화면 → uv → 3D → 재사영(앱 경로 — 벽에 칠하고 uv 정본으로 되돌아온다)', () => {
  it('필압이 같은 길이로 실리고, uv 왕복 오차가 픽셀 아래다', () => {
    const s = session(1200, 800)
    s.draw(100, 400, 1100, 400)                        // 지평선(새 절차 — 확정의 전제)
    s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)   // 깊이선 둘 → 2점 확정
    // 벽(faces45의 그 장면 그대로 — 검증된 픽스처를 새로 안 짓는다)
    s.draw(500, 500, 500, 380); s.draw(600, 475, 600, 385); s.draw(600, 385, 500, 380)
    expect(toggleFaceAt(s.app, { x: 550, y: 430 })).toBe('added')
    const pts = Array.from({ length: 11 }, (_, t) => ({ x: 520 + t * 7, y: 465 - t * 4 }))
    const press = pts.map((_, i) => 100 + i * 10)
    const r = commitPaint(s.app, pts, press)
    expect(r.placed).toBe(1)
    const p = s.app.doc.strokes.find(x => x.paint !== undefined)!
    expect(p.paint!.uv!.length).toBe(pts.length * 2)
    expect(p.paint!.press).toEqual(press)             // 원래 자리 정렬(idx) 그대로
    expect(p.paint!.s === 1 || p.paint!.s === -1).toBe(true)
    expect(p.paint!.w).toBeGreaterThan(0)             // 세계 단위 굵기
    // uv → 3D → 같은 포즈 재사영 == 그은 잉크(배선 확인 — #5: 항등은 구성이고 자가 잰다)
    const rf = s.app.faces.find(f => f.id === p.paint!.f)!
    const g3 = paintGeoOf(rf, p)!
    for (let i = 0; i < g3.length; i++) {
      const q = project(s.app.lift.an, DRAW_POSE, g3[i]!)!
      expect(Math.hypot(q.x - pts[i]!.x, q.y - pts[i]!.y)).toBeLessThan(1e-6)
    }
    // uvFromScreen 직접 호출도 같은 값(commitPaint가 이 함수를 쓴다 — #54 확인)
    const uv2 = uvFromScreen(s.app.lift.an, DRAW_POSE, rf, pts)!
    for (let i = 0; i < uv2.length; i++) expect(uv2[i]).toBeCloseTo(p.paint!.uv![i]!, 10)
  })
  it('기저가 무늬(repBasis)와 같다 — 출처 한 자리(#54)', () => {
    const rf = wall()
    const b1 = uvBoxOf(rf).basis
    const b2 = repBasis(rf)
    expect(b1.u).toEqual(b2.u)
    expect(b1.v).toEqual(b2.v)
    expect(b1.origin).toEqual(b2.origin)
  })
})
