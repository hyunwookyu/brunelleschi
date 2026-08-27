// 사람이 그리는 것을 흉내내는 하네스 — **앱과 같은 함수**를 부른다.
// beginDraft/updateDraft/endDraft(input.ts)의 결정은 core/draft.ts에 있고 여기서도 그것을 쓴다.
// 손으로 좌표를 계산해 doc.strokes에 밀어넣으면 스냅·오스냅을 안 거치므로
// **앱이 실제로 만드는 기하를 안 재게 된다** — 그래서 이 경로로만 잰다.

import { createApp, commitStroke, type App } from '../src/app/state'
import { resolveStart, resolveEnd, resolveCommit } from '../src/core/draft'
import type { Stroke } from '../src/core/types'
import type { Pt } from '../src/core/vec'

export interface Session {
  app: App
  /** 한 획 — 화면에서 (ax,ay)를 눌러 (bx,by)에서 뗀다 */
  draw: (ax: number, ay: number, bx: number, by: number) => Stroke | null
}

export function session(W: number, H: number): Session {
  const app = createApp(W, H)
  const set = () => ({ ...app.osnap, radius: app.osnap.radius / app.view.s })
  // 치수 옵션도 앱(input.ts)과 같은 자리에서 읽는다 — 하네스가 앱을 재게(web2-08 지시 4)
  const dims = () => ({
    mmPerUnit: app.lift.mmPerUnit,
    snapStep: app.dimSnap ? app.dimSnapStep : null,
  })
  return {
    app,
    draw(ax, ay, bx, by) {
      const p: Pt = { x: ax, y: ay }
      // 연장선 획득(web2-18 2부)도 **앱과 같은 자리에서** 실어 준다 — `app.extAcq.acquired`가
      // 비어 있으면 ext는 후보가 아니다(그것이 앱의 기본 상태다). 획득을 쓰는 팔은
      // `updateExtDwell`로 그 목록을 채운 뒤 이 경로로 그린다.
      const acq = app.extAcq.acquired
      const oh = resolveStart(app.lift, app.pose, p, set(), acq)
      const start = oh ? oh.p : p
      const startP3 = { p3: oh?.p3 ?? null }
      const r = resolveEnd(app.lift, app.pose, app.lift.an, start, startP3, { x: bx, y: by }, set(), dims(), acq)
      const c = resolveCommit(app.lift.an, start, r.end, set().radius)
      if (!c) return null // 잡음 — 지평선에서 먼 탭
      return commitStroke(app, c.a, c.b, [p, { x: bx, y: by }])
    },
  }
}

/** 화면점 p에서 소실점 v를 향해 비율 t 만큼 간 점 — 사람이 «소실점을 향해» 긋는 것 */
export const toward = (p: Pt, v: Pt, t: number): Pt =>
  ({ x: p.x + (v.x - p.x) * t, y: p.y + (v.y - p.y) * t })
