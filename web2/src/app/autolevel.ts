// **접기 시점** — 언제 정렬로 돌아가는가. 계산(무엇으로·어디로 접는가)은 `core/level.ts`다.
//
// 규칙 하나: **접힐 자세(임계 안)는 마지막 조작에서 `FOLD_DELAY_MS` 지난 뒤 접힌다.**
// 붙잡고 있는 동안(`held`)은 안 접힌다 — 돌리는 동안은 자유롭고, 놓으면 잠깐 뒤 미끄러진다.
// ⚠ web2-08 지시 3: **임계 밖 자세는 접히지 않는다 — 머무는 상태다**(`foldTarget`이 null).
// 「무엇이 접히는가」의 판정은 전부 core에 있고 여기는 시계만 안다.
// 예외를 안 둔다(뷰 큐브·저장한 시점도 같은 규칙이다) — 판정이 둘이면 「접히나 안 접히나」를
// 사람이 매번 짐작해야 한다.
//
// ⚙ **끄는 스위치를 안 둔다**(A-3: 단순한 쪽). 임계 밖에 두면 안 접히므로 그것이 곧
// 「기울인 채로 두기」다 — 스위치가 하던 일을 임계가 한다.
//
// 시계를 주입받는다 — 시험이 가짜 시각으로 「계속 조작하는 동안 안 접힌다」를 잰다.

import { type App, setPose, orbitPivot, beginNavHold, endNavHold } from './state'
import { isLevel, foldTarget, lerpPose } from '../core/level'
import type { CamPose } from '../core/types'
import { C, TURN_ANIM_MS } from '../core/constants'

/** 입력이 부르는 갈고리 — 조작의 국면만 알린다(무엇으로 접는지는 안 본다) */
export interface LevelHooks {
  /** 잡았다·끌고 있다 — 접기를 취소하고 붙잡는다 */
  grab(): void
  /** 놓았다 — 지금부터 지연을 센다 */
  release(): void
  /** 조작이 아닌 포즈 변경(뷰 큐브·휠·저장한 시점) — 붙잡지 않고 지연만 다시 센다 */
  touch(): void
  /** 접힐 자세면 지금 접는다 — 기울어 있는데 그리려고 눌렀을 때. 접기 시작했으면 true.
   *  **임계 밖이면 false다** — 그 자세는 머무는 상태라 그 누름은 그리기다(입력이 가른다). */
  foldNow(): boolean
  /** **지정한 포즈로 미끄러진다**(web2-31 1번 — 뷰 큐브 90° 전환). 즉시 튀면 어디로
   *  갔는지 잃는다(지시 문면 · A-3: 스케치업이 그렇게 한다).
   *
   *  ⚠ **접기와 같은 `anim` 슬롯을 쓴다.** 포즈를 움직이는 자가 둘이면 둘이 겹칠 때
   *  프레임마다 서로를 덮는다 — 한 슬롯이면 겹침이 구성상 없고, `grab()`이 이미
   *  「끌기가 애니를 취소한다」를 하고 있으므로 그 규칙도 그대로 물려받는다(#54). */
  glide(to: CamPose): void
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
  let anim: { from: CamPose; to: CamPose; t0: number; ms: number } | null = null

  /** **정렬 상태를 떠나기 직전의 포즈** — 접을 때 여기로 돌아간다(web2-05).
   *
   *  지시는 「궤도 시작 시 카메라 상태를 기억한다」인데, **정렬을 떠나는 순간**으로 잡으면
   *  궤도·뷰 큐브·저장 시점이 **한 규칙**이 된다(예외를 안 두는 이 파일의 규칙과 같은 형태).
   *  «정렬인 동안 계속 갱신»이므로 따로 «시작»을 판정할 필요가 없다 — 마지막 정렬 포즈가
   *  곧 그 값이다. 접기 애니메이션 중에는 정렬이 아니라 안 덮이고, 끝나는 순간의
   *  목표 포즈가 새 앵커가 된다(그것이 다음 궤도의 출발점이므로 맞다).
   *
   *  ⚠ 사용자가 정렬 상태에서 팬·줌으로 높이·거리를 바꾸면 그것이 **의도**이므로
   *  앵커가 따라간다. 궤도로 바뀐 값만 안 남는다 — 그것이 이 회차의 내용이다. */
  let anchor: CamPose = { p: { ...app.pose.p }, q: { ...app.pose.q } }
  app.listeners.push(() => {
    if (!anim && isLevel(app.pose)) anchor = { p: { ...app.pose.p }, q: { ...app.pose.q } }
  })

  const grab = () => { held = true; last = now(); anim = null }
  const release = () => { held = false; last = now() }
  const touch = () => { held = false; last = now() }

  /** 지금 목표 포즈로 미끄러지기 시작한다. 목표가 없으면(임계 밖 · 이미 정렬) 아무것도 안 한다. */
  function start(): boolean {
    const an = app.lift.an
    const to = foldTarget(anchor, app.pose, orbitPivot(app),
      { axes: an.axes.map(a => a.dir), f: an.f, W: an.W })
    if (!to) return false
    anim = {
      from: { p: { ...app.pose.p }, q: { ...app.pose.q } },
      to,
      t0: now(),
      ms: C.FOLD_ANIM_MS,
    }
    // 접기 애니(300ms)도 **연속 회전**이다 — 감쇠 판정을 동결한다(web2-14 3번 2차 [4/6]:
    // 뷰 큐브는 즉시 점프지만 접기는 AS-C12대로 여러 프레임이라, 안 동결하면 놓고 1.2s 뒤
    // 300ms 동안 감쇠가 다시 프레임마다 반응한다). 끝나는 곳(step의 u>=1)에서 푼다.
    beginNavHold(app)
    return true
  }

  /** 접히는 중이면 한 걸음 나아간다 */
  function step(t: number): boolean {
    if (!anim) return false
    const u = (t - anim.t0) / anim.ms
    if (u >= 1) {
      const to = anim.to
      anim = null
      setPose(app, to)              // **정확히** 목표로 앉힌다 — 보간 끝값을 안 쓴다
      endNavHold(app)               // 애니 끝 — 동결 해제·재판정 한 번(web2-14 3번)
    } else {
      setPose(app, lerpPose(anim.from, anim.to, ease(Math.max(0, u))))
    }
    return true
  }

  function tick(): boolean {
    const t = now()
    if (anim) return step(t)
    if (held) return false
    if (t - last < C.FOLD_DELAY_MS) return false
    if (!start()) return false      // 임계 밖(머무는 자세)·이미 정렬 — 목표가 없다
    return step(t)                  // 첫 걸음을 바로 그린다(0에서 한 프레임 멈추지 않게)
  }

  return {
    grab, release, touch, tick,
    glide(to: CamPose) {
      // 조작이 아닌 포즈 변경이다 — `touch()`와 같은 자리(붙잡지 않고 지연만 다시 센다).
      held = false
      last = now()
      anim = {
        from: { p: { ...app.pose.p }, q: { ...app.pose.q } },
        to: { p: { ...to.p }, q: { ...to.q } },
        t0: now(),
        ms: TURN_ANIM_MS,
      }
      beginNavHold(app)   // 여러 프레임에 걸친 연속 회전 — 감쇠 판정 동결(web2-14 3번)
      step(now())         // 첫 걸음을 바로 그린다(0에서 한 프레임 멈추지 않게)
    },
    foldNow() {
      held = false
      if (!start()) return false    // 임계 밖 — 그 누름은 접기가 아니다
      last = now() - C.FOLD_DELAY_MS
      step(now())
      return true
    },
    folding: () => anim !== null,
  }
}
