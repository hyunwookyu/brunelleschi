// 공용 픽스처 — 1200×800, 지평선 y=400. 주점 = (600, 400).
// 깊이선 둘은 **같은 모서리 (500,500)에서 뻗는다** — 사람이 상자를 그리는 방식이고,
// 그래야 서로 연결돼 둘 다 3D가 된다(지시 1·2: 깊이선도 3D 선이고, 첫 선만 앵커다).
//   깊이선 1 → vp0=(900,400) (u1=+300), 깊이선 2 → vp1=(100,400) (u2=−500)
//   f² = −u1·u2 = 150000, f ≈ 387.298. (f/W ≈ 0.32 — 넓은 화각이지만 f²>0이면 유효, 원칙 f)
// **첫 선 = 깊이선 1이고 그것이 지면(Y=0)에 놓인다**(지시 2). 모서리 (500,500)은
// 지평선보다 100px 아래이므로 지면과 만난다. (500,500)에서 시작하는 내용 획은
// 그 모서리에 연결돼 함께 올라간다.

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
  b.add(500, 500, 600, 475)       // 깊이선 1 → (900,400)   ← 첫 선, 지면에 놓인다
  b.add(500, 500, 400, 475)       // 깊이선 2 → (100,400)   ← 같은 모서리에서
  return b
}

export const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps
export const approxPt = (a: Pt, b: Pt, eps = 1e-6) => approx(a.x, b.x, eps) && approx(a.y, b.y, eps)

/** **실제 작도 대역의 픽스처** — 소실점이 화면 폭의 두세 배 밖에 있는 구도(web2-03 지시 2-d).
 *
 *  `constructedDoc()`의 소실점은 `u1=+300`(0.25W) · `u2=−500`(0.4W)로 **화면 안**이다.
 *  건축 투시도의 소실점은 보통 화면 폭의 2~3배 밖이고, 그 대역이 픽스처에 없어서
 *  「먼 소실점이면 1점으로 잠긴다」가 단위·종단 어디서도 안 걸렸다.
 *  여기는 `u1=+3000`(2.5W) · `u2=−3600`(3W)다. f² = 3000·3600 → f ≈ 3286.
 *
 *  소실점은 **찍어서** 만든다 — 그 거리의 깊이선을 화면 안에서 그으면 처짐이 작아
 *  픽스처가 임계를 시험하게 되고, 그러면 「구도를 재는 픽스처」가 아니라
 *  「임계를 재는 픽스처」가 된다(그 시험은 `farvp.test.ts`가 따로 한다). */
export function wideDoc(): DocBuilder {
  const b = builder()
  b.add(100, 400, 1100, 400)        // 지평선
  b.add(3600, 400, 3600, 400)       // vp0 = +3000 = 2.5W  (찍기)
  b.add(-3000, 400, -3000, 400)     // vp1 = −3600 = 3W    (찍기)
  return b
}
