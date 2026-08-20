// 공용 픽스처 — 1200×800, 지평선 y=400.
// 깊이선 1 → vp1=(900,400) (u1=+300), 깊이선 2 → vp2=(100,400) (u2=−500)
// f² = −u1·u2 = 150000, f ≈ 387.298. (f/W ≈ 0.32 — 넓은 화각이지만 f²>0이면 유효, 원칙 f)

import { emptyDoc, type Doc, type Stroke, type CamPose } from '../src/core/types'
import type { Pt } from '../src/core/vec'

export const W = 1200
export const H = 800

export interface DocBuilder {
  doc: Doc
  add: (ax: number, ay: number, bx: number, by: number, view?: CamPose) => Stroke
}

export function builder(): DocBuilder {
  const doc = emptyDoc(W, H)
  let id = 1
  return {
    doc,
    add(ax, ay, bx, by, view?) {
      const s: Stroke = { id: id++, a: { x: ax, y: ay }, b: { x: bx, y: by } }
      if (view) s.view = view
      doc.strokes.push(s)
      return s
    },
  }
}

/** 지평선 + 깊이선 둘 — 작도 완료 상태 */
export function constructedDoc(): DocBuilder {
  const b = builder()
  b.add(100, 400, 1100, 400)      // 지평선
  b.add(300, 700, 600, 550)       // 깊이선 1 → (900,400)
  b.add(700, 700, 400, 550)       // 깊이선 2 → (100,400)
  return b
}

export const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps
export const approxPt = (a: Pt, b: Pt, eps = 1e-6) => approx(a.x, b.x, eps) && approx(a.y, b.y, eps)
