// **접기 시점** — 언제 정렬로 돌아가는가. 계산(무엇으로 접는가)은 `core/level.ts`다.
//
// 규칙 하나: **정렬되지 않은 포즈는 마지막 조작에서 `FOLD_DELAY_MS` 지난 뒤 접힌다.**
// 붙잡고 있는 동안(`held`)은 안 접힌다 — 돌리는 동안은 자유롭고, 놓으면 잠깐 뒤 미끄러진다.
// 예외를 안 둔다(뷰 큐브 윗면·저장한 시점도 같은 규칙이다) — 예외가 둘이면 「접히나 안 접히나」를
// 사람이 매번 짐작해야 한다.
//
// ⚙ **끄는 스위치를 안 둔다**(A-3: 단순한 쪽). 돌려보는 것이 부가기능이면 그 상태가
// 오래 유지될 이유가 없고, 붙잡고 있으면 무한히 안 접히므로 살펴보기 자체는 안 막힌다.
// 되돌릴 조건: 기울인 채로 두고 다른 일을 하려는 사용이 관측되면 그때 연다.
//
// 시계를 주입받는다 — 시험이 가짜 시각으로 「계속 조작하는 동안 안 접힌다」를 잰다.

import { type App, setPose, orbitPivot, liftedPoints } from './state'
import { isLevel, levelPose, lerpPose } from '../core/level'
import type { CamPose } from '../core/types'
import { C } from '../core/constants'

/** 입력이 부르는 갈고리 — 조작의 국면만 알린다(무엇으로 접는지는 안 본다) */
export interface LevelHooks {
  /** 잡았다·끌고 있다 — 접기를 취소하고 붙잡는다 */
  grab(): void
  /** 놓았다 — 지금부터 지연을 센다 */
  release(): void
  /** 조작이 아닌 포즈 변경(뷰 큐브·휠·저장한 시점) — 붙잡지 않고 지연만 다시 센다 */
  touch(): void
  /** 지금 접는다 — 기울어 있는데 그리려고 눌렀을 때. 죽은 클릭을 안 만든다. */
  foldNow(): void
}

export interface AutoLevel extends LevelHooks {
  /** 프레임마다. 포즈를 바꿨으면 true */
  tick(): boolean
  /** 접히는 중인가 */
  folding(): boolean
}

/** 부드럽게 — 시작과 끝에서 느리다 */
const ease = (t: number) => t * t * (3 - 2 * t)

export function createAutoLevel(
  app: App, now: () => number = () => performance.now(),
): AutoLevel {
  let held = false
  let last = now()
  let anim: { from: CamPose; to: CamPose; t0: number } | null = null

  const grab = () => { held = true; last = now(); anim = null }
  const release = () => { held = false; last = now() }
  const touch = () => { held = false; last = now() }

  /** 지금 목표 포즈로 미끄러지기 시작한다. 이미 정렬이면 아무것도 안 한다. */
  function start(): boolean {
    if (isLevel(app.pose)) return false
    anim = {
      from: { p: { ...app.pose.p }, q: { ...app.pose.q } },
      to: levelPose(app.lift.an, app.pose, orbitPivot(app), liftedPoints(app)),
      t0: now(),
    }
    return true
  }

  /** 접히는 중이면 한 걸음 나아간다 */
  function step(t: number): boolean {
    if (!anim) return false
    const u = (t - anim.t0) / C.FOLD_ANIM_MS
    if (u >= 1) {
      const to = anim.to
      anim = null
      setPose(app, to)              // **정확히** 목표로 앉힌다 — 보간 끝값을 안 쓴다
    } else {
      setPose(app, lerpPose(anim.from, anim.to, ease(Math.max(0, u))))
    }
    return true
  }

  function tick(): boolean {
    const t = now()
    if (anim) return step(t)
    if (held) return false
    if (isLevel(app.pose)) return false
    if (t - last < C.FOLD_DELAY_MS) return false
    if (!start()) return false
    return step(t)                  // 첫 걸음을 바로 그린다(0에서 한 프레임 멈추지 않게)
  }

  return {
    grab, release, touch, tick,
    foldNow() { held = false; last = now() - C.FOLD_DELAY_MS; if (start()) step(now()) },
    folding: () => anim !== null,
  }
}
