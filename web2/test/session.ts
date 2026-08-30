// 사람이 그리는 것을 흉내내는 하네스 — **앱과 같은 함수**를 부른다.
// beginDraft/updateDraft/endDraft(input.ts)의 결정은 core/draft.ts에 있고 여기서도 그것을 쓴다.
// 손으로 좌표를 계산해 doc.strokes에 밀어넣으면 스냅·오스냅을 안 거치므로
// **앱이 실제로 만드는 기하를 안 재게 된다** — 그래서 이 경로로만 잰다.

import { createApp, commitStroke, yellowActive, viewScale, type App } from '../src/app/state'
import { resolveStart, resolveEnd, resolveCommit } from '../src/core/draft'
import type { OsnapHit, OsnapSettings } from '../src/core/osnap'
import type { Stroke } from '../src/core/types'
import type { Pt } from '../src/core/vec'

export interface Session {
  app: App
  /** 한 획 — 화면에서 (ax,ay)를 눌러 (bx,by)에서 뗀다 */
  draw: (ax: number, ay: number, bx: number, by: number) => Stroke | null
  /** **점렬 한 획**(web2-32 — 글씨·프리핸드). 끝점 판정은 `draw`와 **같은 경로**이고
   *  다른 것은 `raw`가 점렬 그대로라는 것뿐이다(입력이 앱에 싣는 것이 그것이다). */
  stroke: (pts: Pt[]) => Stroke | null
  /** **시작점 판정 하나만**(web2-37 6번) — `draw`가 부르는 **바로 그 호출**이다(아래에서
   *  `draw`·`stroke`가 이것을 부른다). 확정을 안 하므로 장면이 안 바뀐다: 「같은 장면에서
   *  시작점이 어디로 가는가」를 여러 번 재는 팔이 이것을 쓴다.
   *  ⚠ 반경 환산(`app.osnap.radius / viewScale`)을 팔이 다시 적으면 앱이 그 식을 바꿀 때
   *  조용히 갈린다(#88의 형태) — 그래서 손잡이를 여기 둔다. */
  startHit: (p: Pt) => OsnapHit | null
  /** 앱이 지금 쓰는 오스냅 설정(문서 단위 반경) — 팔이 **제품에서 읽게** 한다(#88) */
  osnapSet: () => OsnapSettings
}

export function session(W: number, H: number): Session {
  const app = createApp(W, H)
  const set = () => ({ ...app.osnap, radius: app.osnap.radius / viewScale(app) })
  // 치수 옵션도 앱(input.ts)과 같은 자리에서 읽는다 — 하네스가 앱을 재게(web2-08 지시 4)
  const dims = () => ({
    mmPerUnit: app.lift.mmPerUnit,
    snapStep: app.dimSnap ? app.dimSnapStep : null,
  })
  const startHit = (p: Pt): OsnapHit | null =>
    resolveStart(app.lift, app.pose, p, set(), app.extAcq.acquired)
  return {
    app,
    startHit,
    osnapSet: set,
    draw(ax, ay, bx, by) {
      const p: Pt = { x: ax, y: ay }
      // 옐로(web2-22 1부) — 입력(input.ts)과 같은 우회: 오스냅·축·소실점 없이 그대로 확정
      if (yellowActive(app)) {
        if (Math.hypot(bx - ax, by - ay) <= 4) return null   // 탭 = 잡음(입력과 같은 문)
        return commitStroke(app, p, { x: bx, y: by }, [p, { x: bx, y: by }])
      }
      // 연장선 획득(web2-18 2부)도 **앱과 같은 자리에서** 실어 준다 — `app.extAcq.acquired`가
      // 비어 있으면 ext는 후보가 아니다(그것이 앱의 기본 상태다). 획득을 쓰는 팔은
      // `updateExtDwell`로 그 목록을 채운 뒤 이 경로로 그린다.
      const acq = app.extAcq.acquired
      const oh = startHit(p)
      const start = oh ? oh.p : p
      const startP3 = { p3: oh?.p3 ?? null }
      const r = resolveEnd(app.lift, app.pose, app.lift.an, start, startP3, { x: bx, y: by }, set(), dims(), acq)
      // (하네스는 한 점에서 판정한다 — 이력은 «드래그 중»의 것이라 여기선 빈 상태다.
      //  이력을 재는 팔은 `extband26.test.ts`가 스스로 연속 이동을 만든다.)
      const c = resolveCommit(app.lift.an, start, r.end, set().radius)
      if (!c) return null // 잡음 — 지평선에서 먼 탭
      return commitStroke(app, c.a, c.b, [p, { x: bx, y: by }])
    },
    stroke(pts) {
      if (pts.length < 2) return null
      const p = pts[0]!, q = pts[pts.length - 1]!
      if (yellowActive(app)) return commitStroke(app, p, q, pts.map(z => ({ ...z })))
      const acq = app.extAcq.acquired
      const oh = startHit(p)
      const start = oh ? oh.p : p
      const r = resolveEnd(app.lift, app.pose, app.lift.an, start, { p3: oh?.p3 ?? null }, q, set(), dims(), acq)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const z of pts) {
        if (z.x < x0) x0 = z.x; if (z.x > x1) x1 = z.x
        if (z.y < y0) y0 = z.y; if (z.y > y1) y1 = z.y
      }
      // 입력과 **같은 인자**다(web2-32 1번 — 닫힌 한 붓이 탭으로 안 읽히게 bbox를 넘긴다)
      const c = resolveCommit(app.lift.an, start, r.end, set().radius, Math.hypot(x1 - x0, y1 - y0) * viewScale(app))
      if (!c) return null
      return commitStroke(app, c.a, c.b, pts.map(z => ({ ...z })))
    },
  }
}

/** 화면점 p에서 소실점 v를 향해 비율 t 만큼 간 점 — 사람이 «소실점을 향해» 긋는 것 */
export const toward = (p: Pt, v: Pt, t: number): Pt =>
  ({ x: p.x + (v.x - p.x) * t, y: p.y + (v.y - p.y) * t })
