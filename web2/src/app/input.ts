// 입력 배정 — 펜: 그리기 · 손가락 1개: **궤도 또는 이동** · 손가락 2개: 팬+줌 · 마우스: 데스크톱 확인용.
// ⚠ 손가락 1개의 뜻은 `state.fingerPans`가 정한다(web2-26 5번): 이 세션에서 펜이 한 번이라도
//    쓰였거나 아직 돌 것이 없으면 **이동**, 아니면 종전대로 궤도. 손가락은 안 그린다(종전 그대로).
// 팜 리젝션: 펜이 닿아 있는 동안 터치를 무시한다(잉크·카메라 양쪽).
// 데스크톱 선례(SketchUp): 중버튼 궤도, 우버튼 팬, 휠 줌.

import {
  orbitPivot, orbitBy, dollyBy, panBy, setPose, beginErase, eraseAt, endErase, fingerPans,
  screenToDoc, isEraser, yellowActive, toggleFaceAt, facePreview, excludeCandidateAt, beginNavHold, endNavHold,
  viewScale, writeActive, writeFarPts, writeIdleNow, resetViewLens,
  holdTargetAt, gripDragStartAt, gripBase, applyMove, applyRotate, finishManip, manipLabelOf,
  paintActive, paintEraseNow,
  type App, type GripGeom,
} from './state'
import { solveMove, solveAlong, planePointAt, yawOf } from '../core/grip'
import type { AxisId } from '../core/camera'
import type { V3 } from '../core/vec'
import { osnap, type OsnapHit } from '../core/osnap'
import { updateExtTrip, beginExtTrip } from '../core/extacq'
import { isLevel, pitchSnaps } from '../core/level'
import type { LevelHooks } from './autolevel'
import { resolveStart, resolveEnd, resolveCommit, isStray } from '../core/draft'
import { newHoldGate, tickHold, yellowEnd, driftAllowPx } from '../core/hold'
import { filmSplit } from './filmlayer'
import { C } from '../core/constants'
import { isParallel } from '../core/camera'
import {
  cubeGeom, cubeHit, poseForElem, cubeBasis, arrowHit, orientIn, turnOrient, poseForOrient,
  parallelAllowed, parallelPose, perspectivePose,
} from '../core/viewcube'
import type { Draft } from './render2d'
import type { RawInput } from '../core/types'
import { type Pt, pt } from '../core/vec'

/** 최근 획의 캡처 통계(web2-11 1-a·1-f) — 진단 패널·e2e 원장이 읽는다 */
export interface StrokeCapStats {
  pointerType: string
  /** 브라우저가 실제로 전달한 move 이벤트 수 */
  events: number
  /** 획에 실린 점 수(coalesced 포함, 시작점 포함) */
  points: number
  /** coalesced로 «더» 받은 점 수 = Σ(묶음 크기 − 1). 안 썼으면 버려졌을 수다. */
  extra: number
}

export interface InputCallbacks {
  onDraftChange: (d: Draft | null) => void
  onHover: (h: OsnapHit | null) => void
  /** press — 펜 필압 평균 (마우스는 undefined) · rawIn — 점별 필압·기울기(펜만, 1-c) */
  onCommit: (a: Pt, b: Pt, raw: Pt[], press?: number, rawIn?: RawInput) => void
  /** 지우개 커서 위치 (지우개 도구일 때) */
  onEraserMove: (p: Pt | null) => void
  /** **면이 열렸다**(web2-57) — 지우개가 경계 구간을 끊어 면이 사라졌다(대기).
   *  조용하면 안 된다 — 알림 한 줄은 main이 낸다(onFaceToggle의 문법 · #54). */
  onFacesOpened: (ids: number[]) => void
  /** 면 도구의 미리보기 — 지금 탭하면 무엇이 될지(원칙 d) */
  onFacePreview: (f: { poly: Pt[]; mode: 'add' | 'remove' } | null) => void
  /** 면 지정·해제 결과 — 알림 한 줄이 이것을 읽는다 */
  onFaceToggle: (r: 'added' | 'removed' | 'none') => void
  /** 손글씨 치수(web2-29) — 쓰는 중의 획(문서 좌표. 미리보기용) */
  onDimInk: (pts: Pt[] | null) => void
  /** 손글씨 한 획이 끝났다 — 인식은 main이 부른다(비동기·출처 하나) */
  onDimStroke: (pts: Pt[]) => void
  /** 치수 대상 탭 — 문서 좌표. 고른 결과의 알림은 main이 낸다 */
  onDimPick: (p: Pt) => void
  /** 제안이 떠 있을 때의 탭(web2-29 2단계) — 대상을 그 선으로 옮긴다 */
  /** 사후 수정(web2-32 2번) — 탭이 치수 숫자를 짚었는가. 참이면 입력은 거기서 끝난다
   *  (그 탭이 점 찍기로 흘러가지 않는다). */
  onDimTap: (p: Pt) => boolean
  /** 면 일괄 후보 모드(web2-21 4부)의 탭 — true = 후보 하나를 뺐다 */
  onCandidateTap: (excluded: boolean) => void
  /** 재기(web2-32 6번)의 탭 — 문서 좌표. 오스냅·판정·알림은 main이 낸다(#54) */
  onMeasureTap: (p: Pt) => void
  /** **선을 꾹 눌렀다**(web2-39 1번) — 문서 좌표. 진입 판정·알림은 main이 낸다(#54).
   *  반환 = 실제로 글씨 상태로 들어갔는가(들어갔으면 이 몸짓은 그리기가 아니다). */
  onWriteHold: (p: Pt) => boolean
  /** **글씨 한 획이 끝났다**(web2-39 2번) — 문서 좌표 점렬. 확정·인식은 main이 부른다
   *  (비동기라 출처가 하나여야 한다 — 29-2의 `onDimStroke`와 같은 갈래). */
  onWriteStroke: (pts: Pt[]) => void
  /** **글씨 상태가 끝났다**(web2-39 3번) — 사유는 「멈춤」이거나 「먼 곳의 새 획」이다.
   *  ⛔ 종료 «제스처»가 아니다: 둘 다 사람이 어차피 하는 동작이라 배울 것이 없다. */
  onWriteEnd: (why: 'idle' | 'far') => void
  /** **조작이 끝났다**(web2-44) — 옮김·돌림 끌기가 값을 남겼다. 알림은 main이 낸다(#54). */
  onManip: (kind: 'move' | 'rotate') => void
  /** **칠 한 붓이 끝났다**(web2-45) — 문서 좌표 점렬. 면 배정·확정은 main이 부른다(#54). */
  /** 칠 한 붓 — press는 점별 필압(펜만 · raw와 같은 길이 · web2-50 정본 목록의 «압력») */
  onPaint: (pts: Pt[], press?: number[]) => void
  /** **마우스**의 탭(web2-67 §1 — raw bbox 대각 ≤ C.PAINT67_MOUSE_TAP_MAX_PX): 면 고르기 + 51의
   *  Injector(마우스는 장치가 하나라 두 뜻을 다 진다). ⚠ 펜은 여기 안 온다 — 펜 한 붓은 언제나 칠이다. */
  onPaintTap: (p: Pt) => void
  /** **손가락 탭**(web2-67 §1 — 칠 도구에서만): 면을 고른다(또 탭 = 더해짐 · 빈 곳 = 풀림 — 54-2). */
  onPaintFingerTap: (p: Pt) => void
  /** **손가락 긴 누름**(web2-67 67-1): 51의 Injector — 짚은 칠 획의 속성을 지금 도구에 싣는다.
   *  (44의 잡기·39의 손글씨 꾹 누름은 «펜»이라 이 자리가 비어 있었다 — 착수 전 확인 ②.)
   *  반환 = **실제로 실었는가**. 못 실었으면(짚은 칠 획 없음) 몸짓을 안 삼킨다 — 느린
   *  손끝의 탭이 450ms를 넘겨도 뗄 때 «고르기»로 산다(#93의 노출을 좁힌다 — 리뷰어 [H5]). */
  onPaintFingerHold: (p: Pt) => boolean
}

export function initInput(
  canvas: HTMLCanvasElement, app: App, cb: InputCallbacks, level: LevelHooks,
) {
  let draft: Draft | null = null
  let penDown = false
  let drawingPointer: number | null = null
  let drawingType = ''
  let pressSamples: number[] = []
  // 점별 표본(1-c) — draft.raw와 **나란히** 쌓인다(같은 이벤트에서 같이 push).
  // 양자화는 확정 때 한 번(quantIn) — 그리는 중에는 날값을 든다.
  let samples: { p: number; tx: number | null; ty: number | null; tw: number | null }[] = []
  // 최근 획 통계(1-a·1-f). 값의 성격: 마지막으로 **끝난** 획이 아니라 «지금까지» —
  // 그리는 중에도 갱신되어 패널이 실시간으로 읽는다.
  let capStats: StrokeCapStats = { pointerType: '', events: 0, points: 0, extra: 0 }

  /** coalesced 묶음(1-a) — 없는 브라우저·합성 이벤트(빈 목록)는 `[e]`로 떨어진다.
   *  `app.coalesce = false`가 반증 손잡이다(D-3: 끄면 점 수가 이벤트당 1로 떨어진다). */
  const bundleOf = (e: PointerEvent): PointerEvent[] => {
    if (!app.coalesce) return [e]
    const evs = e.getCoalescedEvents?.()
    return evs && evs.length > 0 ? evs : [e]
  }
  /** 점별 표본 하나 — 기울기·twist는 **관측 그대로**(안 오면 null. 1-b: 폴백은 2부가
   *  이 관측에서 정한다 — 여기서 0을 지어 넣으면 마우스가 «수직 펜»이 된다). */
  const sampleOf = (e: PointerEvent) => ({
    p: e.pressure,
    tx: typeof e.tiltX === 'number' ? e.tiltX : null,
    ty: typeof e.tiltY === 'number' ? e.tiltY : null,
    tw: typeof (e as any).twist === 'number' ? (e as any).twist : null,
  })
  // ── 펜의 지우개 끝(web2-15 2-b) ─────────────────────────────────────
  // 실기기 관측(Wacom Pro Pen 3E · MovinkPad Pro 14 · 안드로이드 15 크롬):
  // **지우개로 그리는 내내 `buttons`가 32**다. 일반 펜 접촉은 `buttons 1`이라 깨끗이
  // 갈린다. `button === 5`는 누름·뗌 «순간»에만 오므로 판정에 못 쓴다 — 정본은 이 비트다.
  // ⚠ 이 비트가 없으면 **절대 전환하지 않는다.** 다른 신호로 추측하지 않는다
  // (「조용히 틀린 배치를 만들지 않는다」의 지우개판 — 잘못 감지하면 그리다가 지워진다).
  // ⚠ 호버에는 신호가 없다(실기기 확인: 「호버링만 할 땐 뜨지 않는다」) — 그래서 판정도
  // 커서도 **닿아야** 뜬다. 호버 미리보기는 불가능하다(HANDOFF에 적었다).
  const TIP_ERASE_BIT = 32
  const isTipErase = (e: PointerEvent) => e.pointerType === 'pen' && (e.buttons & TIP_ERASE_BIT) !== 0
  /** 지금 획을 지우개로 보내는가 — 끝이 켰거나(획 하나) 사이드바 도구가 지우개거나 */
  const erasingNow = () => app.tipErase || isEraser(app.tool)
  /** web2-67 0-6 — **칠 도구에서의 뒷꼭지는 «칠 지우개»다**(선 지우개가 아니다): 그 한 붓은
   *  보통 칠 경로(draft → onPaint)로 흐르고, 스탬핑(state.paintEraseNow)이 er=1을 찍는다.
   *  아래 erasingNow 분기 셋(누름·이동·뗌)이 이 술어로 비켜 간다(#54 — 판정은 state 하나). */
  const paintTipErase = () => paintActive(app) && app.tipErase
  /** 무엇을 지우는가 — 끝은 **연필 지우개**가 기본이다(DECISIONS 「제도 매체」: 가장 흔한
   *  동작이고 선따기가 그것이다. 잉크 지우개는 드물고 파괴적이라 명시적 선택으로 남긴다). */
  const eraseKind = () => (app.tipErase ? 'eraser-pencil' as const : undefined)

  const touches = new Map<number, Pt>()
  let lastTouchMid: Pt | null = null
  let lastTouchDist = 0
  // ── 손가락 탭(web2-67 §1 — 칠 도구에서만) ──────────────────────────────────────
  // 판정은 «움직인 거리»다(#93 — 시간이 아니다): 문턱(C.PAINT67_FINGER_TAP_MAX_PX)을 넘기
  // «전»에는 아무것도 안 하고, 넘으면 후보를 접고 궤도가 그 자리부터 시작한다(30-1 무변 —
  // 문턱 아래 이동량만 버려진다). 떼면 탭 = 면 고르기 · 긴 누름 = Injector(67-1 — 44·39의
  // 꾹 누름은 «펜»이라 이 자리가 비어 있었다).
  let fingerTap: { id: number; sp: Pt; p: Pt; held: boolean; holdT: number } | null = null
  function cancelFingerTap() {
    if (!fingerTap) return
    clearTimeout(fingerTap.holdT)
    fingerTap = null
  }
  let orbitBtn: { last: Pt; mode: 'orbit' | 'pan' } | null = null
  let faceDown: Pt | null = null
  /** 치수 대상 고르기 탭(web2-29) — 누른 자리. 뗄 때 «안 움직였으면» 고른다. */
  let dimTap: Pt | null = null
  /** 재기(web2-32 6번)의 누름 자리 — 면 도구와 **같은 몸짓**이다(탭이고 끌면 취소) */
  let measureDown: Pt | null = null
  /** 제안이 떠 있는 동안의 누름 자리(web2-29 2단계) — 안 움직이고 떼면 대상 바꾸기 */
  let suggestTap: Pt | null = null
  /** 쓰고 있는 손글씨 한 획 — 뗄 때 `cb.onDimStroke`로 넘긴다 */
  let dimInk: Pt[] | null = null
  // ── 선을 꾹 눌러 글씨 상태로 들어간다(web2-39 1번) ──────────────────────────
  // **누를 때 아무것도 안 하고 시계를 켠다.** `app.writeHoldMs` 동안 누른 자리를 안
  // 벗어나면 그때 진입 판정이 돈다(`cb.onWriteHold`). 움직이면 그리기이고, 그 전에
  // 떼면 종전 경로(탭·획)로 그대로 간다 — **죽은 클릭을 안 만든다**.
  // ⚠ 이동 허용은 옐로 머무름의 `driftAllowPx`를 그대로 쓴다(#54 — 「누른 자리에서
  //   안 벗어났다」는 같은 물음이다. 새 숫자 ⛔).
  // ⚠⚠ 선례는 종이 탭의 길게 누르기(`PAPER_LONGPRESS_MS` · `paperbar.ts`)다 — 타이머
  //   하나 + 이동 취소. 같은 몸짓을 두 벌로 짓지 않는다(A-3).
  /** 누른 자리(문서 좌표)와 시계 — 진입이 성립하면 `writeEntered`가 선다 */
  let holdPress: { p: Pt; sp: Pt } | null = null
  let holdTimerId: number | undefined
  /** 이 몸짓이 글씨 진입으로 소진됐는가 — 뗌이 그리기로 흘러가지 않게 한다 */
  let writeEntered = false
  /** 쓰고 있는 글씨 한 획(web2-39) — 뗄 때 `cb.onWriteStroke`로 넘긴다 */
  let writeInk: Pt[] | null = null
  // ── 잡기 끌기(web2-44) — 글씨 상태 안에서 «잡힌 것 위에서 시작한 끌기»는 손이다 ──
  // 몸통 = 옮기기(축 제한) · 끝점 = 돌리기(수직축 · 축점은 반대 끝). 끌기가 첫 문턱
  // (오스냅 반경 — 몸짓이 방향을 정하는 눈금·새 숫자 ⛔)을 넘으면 축이 잠기고, 그 뒤로는
  // 잠긴 축을 따라만 푼다 — 매 이동마다 다시 고르면 경계 방향에서 축이 튄다.
  let manipDrag: {
    mode: 'move' | 'rotate'
    start: Pt
    anchor3?: V3
    pivot?: V3
    yaw0?: number
    base: { base: Map<number, GripGeom>; base3: Map<number, { a3: V3; b3: V3 }> }
    axis: { id: AxisId; dir: V3 } | null
    amount: number
    after: Map<number, GripGeom> | null
  } | null = null

  function dragManip(e: PointerEvent) {
    const md = manipDrag
    if (!md) return
    const cur = toPt(e)
    const movedPx = Math.hypot(cur.x - md.start.x, cur.y - md.start.y) * viewScale(app)
    const engaged = md.axis !== null || md.yaw0 !== undefined
    if (!engaged && movedPx < C.OSNAP_RADIUS_PX) return
    if (md.mode === 'move') {
      if (!md.axis) {
        const sol = solveMove(app.lift.an, app.pose, md.anchor3!, cur)
        if (!sol) return
        md.axis = { id: sol.axis, dir: sol.dir }
      }
      const s = solveAlong(app.lift.an, app.pose, md.anchor3!, md.axis.dir, cur)
      if (!s) return
      const after = applyMove(app, md.base.base, md.base.base3, md.axis.dir, s.t)
      if (!after) return
      md.amount = s.t
      md.after = after
      if (app.grip) app.grip.live = { label: manipLabelOf(app, 'move', s.t), at: cur }
    } else {
      if (md.yaw0 === undefined) {
        const p0 = planePointAt(app.lift.an, app.pose, md.pivot!, md.start)
        if (!p0) return
        md.yaw0 = yawOf(md.pivot!, p0)
      }
      const pc = planePointAt(app.lift.an, app.pose, md.pivot!, cur)
      if (!pc) return
      let ang = yawOf(md.pivot!, pc) - md.yaw0
      while (ang > Math.PI) ang -= 2 * Math.PI
      while (ang < -Math.PI) ang += 2 * Math.PI
      const after = applyRotate(app, md.base.base, md.base.base3, md.pivot!, ang)
      if (!after) return
      md.amount = ang
      md.after = after
      if (app.grip) app.grip.live = { label: manipLabelOf(app, 'rotate', ang), at: cur }
    }
    cb.onDraftChange(null)          // 다시 그리기(값 채널 재사용 — rect 끌기의 선례)
  }

  function endManipDrag(e: PointerEvent) {
    const md = manipDrag
    if (!md) return
    manipDrag = null
    if (app.grip) app.grip.live = null
    const done = md.after !== null && Math.abs(md.amount) > 1e-12
    if (done) {
      const cur = toPt(e)
      finishManip(app, md.mode, md.base.base, md.base.base3, md.after!, {
        axis: md.axis?.id ?? null, dir: md.axis?.dir ?? null, pivot: md.pivot ?? null,
        amount: md.amount, labelAt: cur,
      })
      cb.onManip(md.mode)
    }
    cb.onDraftChange(null)
  }

  function cancelHoldPress() {
    if (holdTimerId !== undefined) { clearTimeout(holdTimerId); holdTimerId = undefined }
    holdPress = null
  }
  /** 누름 시계를 켠다 — web2-44부터 **글씨 상태 안에서도 켠다**(잡음에 더하기 · 이어진
   *  것까지 잡기 · 값 표찰 수정이 전부 «한 번 더 꾹»이다). 상태 밖·안의 판정은
   *  `holdTargetAt` 하나가 든다(#54 — 순서: 치수 숫자 > 값 표찰 > 선 > 잠긴 선 > 면). */
  function armHoldPress(p: Pt, sp: Pt) {
    cancelHoldPress()
    // **잡히는 것이 없으면 시계를 안 켠다**(빈 곳 경로 ⛔ — 39-1 문면). 판정을 여기서
    // 미리 한 번 하는 이유는 그리기 도중에 아무 일도 안 일어나게 하기 위해서다.
    // ⚠ web2-54 54-2의 한 뼘: **면 고름이 있으면 빈 곳 꾹 누름이 «풀기»다**(R7의 어법) —
    // 그때만 빈 곳에도 시계를 켠다. 판정·해제는 beginHold의 sel-clear 갈래 하나가 든다(#54).
    if (!holdTargetAt(app, p) && app.faceSel.length === 0) return
    holdPress = { p, sp }
    holdTimerId = window.setTimeout(() => {
      holdTimerId = undefined
      if (!holdPress) return
      const q = holdPress.p
      holdPress = null
      if (!cb.onWriteHold(q)) return
      // 들어갔다 — 그리던 초안·쓰던 잉크·잡기 끌기를 버린다(이 몸짓은 그것들이 아니었다).
      writeEntered = true
      draft = null
      suggestTap = null
      manipDrag = null
      if (writeInk) { writeInk = null; cb.onDimInk(null) }
      cb.onDraftChange(null)
    }, app.writeHoldMs)
  }
  /** 포인터가 움직였다 — 허용 밖이면 그리기다(시계를 끈다) */
  function moveHoldPress(sp: Pt) {
    if (!holdPress) return
    if (Math.hypot(sp.x - holdPress.sp.x, sp.y - holdPress.sp.y) > driftAllowPx(app.writeHoldMs)) cancelHoldPress()
  }

  /** 화면 좌표 (뷰 오프셋 적용 전) */
  const toScreen = (e: PointerEvent | WheelEvent): Pt => {
    const r = canvas.getBoundingClientRect()
    return pt(e.clientX - r.left, e.clientY - r.top)
  }
  /** 문서 좌표 — 그리기·스냅·지우개는 이것 */
  const toPt = (e: PointerEvent): Pt => screenToDoc(app, toScreen(e))
  /** 오스냅 반경은 화면 px — 문서 좌표용으로 배율 보정 */
  const osnapSet = () => ({ ...app.osnap, radius: app.osnap.radius / viewScale(app) })
  /** **연장선 왕복 선언**(web2-30 11번) — 그리는 중에 포인터가 움직일 때마다 한 번.
   *  ⚠ 호버에서는 안 돈다: 왕복은 **획의 시작점**에서 재는 몸짓이라 획이 없으면 뜻이 없다
   *  (종전 머무름 획득은 호버에서도 돌았다). 반환 = 이번에 선언이 새로 섰는가. */
  const tickExt = (p: Pt): boolean =>
    updateExtTrip(app.extAcq, app.lift, app.pose, p,
      C.EXT_TRIP_LINE_TOL_PX / viewScale(app), C.EXT_TRIP_MIN_PX / viewScale(app), performance.now())
  /** 치수 옵션 — 스냅은 켜져 있을 때만 step이 실린다(지시 4-7) */
  const dimOpts = () => ({
    mmPerUnit: app.lift.mmPerUnit,
    snapStep: app.dimSnap ? app.dimSnapStep : null,
  })

  // ── 획 미리보기 — 확정과 같은 함수로(스냅이 그대로 확정된다, 원칙 d) ──
  // 끝점 결정: 오스냅(점)이 축 스냅(방향)을 이긴다 — Rhino 선례.
  // ⚠ 미리보기 판정(resolveEnd)은 **전달 이벤트당 한 번**이다 — coalesced 점마다 돌리면
  // 판정 비용이 묶음 크기배가 되는데 끝점은 어차피 마지막 점이다. 점 수집만 촘촘하다.
  function updateDraft(e: PointerEvent) {
    if (!draft) return
    const bundle = bundleOf(e)
    capStats.events++
    capStats.extra += bundle.length - 1
    const r0 = canvas.getBoundingClientRect()
    for (const c of bundle) {
      draft.raw.push(screenToDoc(app, pt(c.clientX - r0.left, c.clientY - r0.top)))
      samples.push(sampleOf(c))
      // 점별 필압을 미리보기에도(web2-12 2번) — 양자화 식은 quantIn과 같다(한 곳이어야
      // 미리보기·확정이 같은 프로필을 낸다). 펜만 — 마우스는 상수 0.5라 정보가 없다(AS-C33).
      if (draft.press) draft.press.push(quantPress(c.pressure))
    }
    capStats.points = draft.raw.length
    const cur = toPt(e)
    // 칠(web2-45) — 자유 점렬 그대로다: 오스냅·축·머무름 직선화 전부 없음(칠은 톤이지
    // 선이 아니다). 정본은 raw이고 미리보기는 render2d의 점렬 갈래가 그린다.
    if (paintActive(app)) {
      draft.end = cur
      draft.label = null
      draft.endSnap = null
      draft.lenMm = null
      draft.vp = undefined
      cb.onDraftChange(draft)
      return
    }
    // 옐로(web2-22 1부) — 오스냅·축 스냅·소실점 예고 전부 우회: 자유 방향 그대로.
    // 2부(후행 확정): 끝에서 머무르면(tickHold — 살아 있는 시각) 미리보기가 반듯해진다
    // (yellowEnd — 직선화 + 화면 수평·수직 붙임). 그 상태로 떼면 그대로 확정(원칙 d).
    if (yellowActive(app)) {
      applyYellowDraft(cur, performance.now())
      // 포인터가 멈추면 이벤트도 멈춘다 — 타이머가 HOLD_MS 뒤에 같은 판정을 한 번 더
      // 돌린다(QuickShape의 «누르고 있으면»은 이벤트 없이 온다).
      if (holdTimer !== undefined) clearTimeout(holdTimer)
      holdTimer = window.setTimeout(() => {
        holdTimer = undefined
        if (draft && yellowActive(app)) applyYellowDraft(cur, performance.now())
      }, app.holdMs + 16)
      return
    }
    tickExt(cur)
    const r = resolveEnd(
      app.lift, app.pose, app.lift.an,
      draft.start, { p3: draft.startP3 }, cur, osnapSet(), dimOpts(), app.extAcq.acquired,
      draft.endSnap,   // 이력(web2-26 3번) — 직전에 이긴 선 후보는 유지 띠까지 산다
    )
    draft.end = r.end
    draft.label = r.label
    draft.endSnap = r.endSnap
    draft.lenMm = r.lenMm
    draft.vp = r.vp          // 소실점 예고 자리(web2-19 1-b) — 파선 ✕가 읽는다
    cb.onDraftChange(draft)
  }

  /** 필압 양자화 — quantIn과 같은 식(0..C.PRESS_Q 정수). 둘이 갈리면 뗄 때 입자가 튄다. */
  const quantPress = (p: number): number => Math.round(Math.min(1, Math.max(0, p)) * C.PRESS_Q)

  // ── 후행 확정(web2-22 2부 — 옐로 전용): 머무름 게이트 + 반듯 미리보기 ──────────
  let holdGate = newHoldGate()
  let holdTimer: number | undefined
  function applyYellowDraft(cur: Pt, now: number) {
    if (!draft) return
    const held = tickHold(holdGate, cur, now, app.holdMs)
    const y = yellowEnd(draft.start, cur, held)
    draft.end = y.end
    draft.held = held
    draft.label = null
    draft.endSnap = null
    draft.lenMm = null
    draft.vp = undefined
    cb.onDraftChange(draft)
  }

  // ── 활성 겹 rect 끌기(web2-20 2-b) ────────────────────────────────────────
  let rectDrag: { id: number; edges: { l: boolean; r: boolean; t: boolean; b: boolean }; last: Pt } | null = null
  /** 이 자리(문서 좌표)가 활성 겹 가장자리 어느 변에 걸리는가 — 끌기(tryRectDrag)와
   *  손잡이 표시(web2-24 4-d — 테두리 상시 선이 없어져 hover가 이것으로 옅게 띄운다)가
   *  **같은 판정**을 쓴다(#54). 잡는 반경은 오스냅 반경 재사용(새 숫자 없음). */
  function rectEdgesAt(p: Pt): { id: number; edges: { l: boolean; r: boolean; t: boolean; b: boolean } } | null {
    const split = filmSplit(app)
    if (!split || app.activeLayer === null) return null
    const lay = app.doc.layers.find(l => l.id === app.activeLayer)
    if (!lay || lay.locked || split.films.every(f => f.id !== lay.id)) return null
    const tol = C.OSNAP_RADIUS_PX / viewScale(app)
    const nearV = (x: number) => Math.abs(p.x - x) <= tol && p.y >= lay.rect.y - tol && p.y <= lay.rect.y + lay.rect.h + tol
    const nearH = (y: number) => Math.abs(p.y - y) <= tol && p.x >= lay.rect.x - tol && p.x <= lay.rect.x + lay.rect.w + tol
    const edges = {
      l: nearV(lay.rect.x), r: nearV(lay.rect.x + lay.rect.w),
      t: nearH(lay.rect.y), b: nearH(lay.rect.y + lay.rect.h),
    }
    if (!edges.l && !edges.r && !edges.t && !edges.b) return null
    return { id: lay.id, edges }
  }
  /** 손잡이 상태 갱신 — 달라졌을 때만 다시 그린다(값 채널은 onDraftChange 재사용) */
  function setRectHover(h: { id: number; edges: { l: boolean; r: boolean; t: boolean; b: boolean } } | null) {
    const a = app.rectHover, b = h
    const same = (a === null && b === null) || (!!a && !!b && a.id === b.id &&
      a.edges.l === b.edges.l && a.edges.r === b.edges.r && a.edges.t === b.edges.t && a.edges.b === b.edges.b)
    if (same) return
    app.rectHover = h
    cb.onDraftChange(draft)
  }
  function tryRectDrag(e: PointerEvent): boolean {
    const p = screenToDoc(app, toScreen(e))
    const hit = rectEdgesAt(p)
    if (!hit) return false
    rectDrag = { id: hit.id, edges: hit.edges, last: p }
    canvas.setPointerCapture(e.pointerId)
    e.preventDefault()
    return true
  }
  function dragRect(e: PointerEvent) {
    if (!rectDrag) return
    const lay = app.doc.layers.find(l => l.id === rectDrag!.id)
    if (!lay) { rectDrag = null; return }
    const p = screenToDoc(app, toScreen(e))
    const dx = p.x - rectDrag.last.x
    const dy = p.y - rectDrag.last.y
    rectDrag.last = p
    const r = lay.rect
    let { x, y, w, h } = r
    if (rectDrag.edges.l) { x += dx; w -= dx }
    if (rectDrag.edges.r) { w += dx }
    if (rectDrag.edges.t) { y += dy; h -= dy }
    if (rectDrag.edges.b) { h += dy }
    if (w > 8 && h > 8) lay.rect = { x, y, w, h }   // 뒤집힘 방지 — 최소 8 doc px
    cb.onDraftChange(null)                            // 다시 그리기(값 채널 재사용)
  }

  function beginDraft(p: Pt, e: PointerEvent) {
    samples = [sampleOf(e)]
    capStats = { pointerType: e.pointerType, events: 1, points: 1, extra: 0 }
    holdGate = newHoldGate()   // 획마다 새로 — 지난 획의 머무름이 안 샌다(2부)
    // 옐로(web2-22 1부) — 자가 치워졌다: 시작점 오스냅 없음(자유의 정의 — 지시 1-c)
    // 칠(web2-45)도 같다 — 칠은 톤이라 아무것에도 안 붙는다.
    const oh = yellowActive(app) || paintActive(app)
      ? null : resolveStart(app.lift, app.pose, p, osnapSet(), app.extAcq.acquired)
    draft = {
      start: oh ? oh.p : p,
      end: oh ? oh.p : p,
      raw: [p],
      label: null,
      startSnap: oh,
      startP3: oh?.p3 ?? null,
      endSnap: null,
      lenMm: null,
      // 잠정 id(web2-12 2번) — 확정이 쓸 바로 그 값. 그리는 동안 다른 확정이 없으므로
      // (포인터 캡처) 뗄 때 commitStroke의 nextId++가 정확히 이 값을 준다.
      nid: app.nextId,
      ...(e.pointerType === 'pen' ? { press: [quantPress(e.pressure)] } : {}),
    }
    // **왕복 판정을 연다**(web2-30 11번) — 기준점은 «오스냅이 붙은 뒤의» 시작점이다.
    // 선언은 이 획 안에서만 산다(획이 끝나면 `clearExtAcq`가 비운다).
    beginExtTrip(app.extAcq, draft.start)
    cb.onDraftChange(draft)
  }

  /** 점별 표본 → 저장형(1-c) — 펜에만, raw와 길이가 맞을 때만.
   *  양자화(정수)는 여기 한 번이다 — 값·근거는 `types.ts`의 `RawInput`과 `C.PRESS_Q`. */
  function quantIn(sm: typeof samples, n: number): RawInput | undefined {
    if (drawingType !== 'pen' || sm.length !== n || n === 0) return undefined
    const ri: RawInput = { press: sm.map(s => Math.round(Math.min(1, Math.max(0, s.p)) * C.PRESS_Q)) }
    // 기울기·twist는 **한 점이라도 관측된 축만** 싣는다(안 오는 기기에서 배열을 안 만든다)
    if (sm.some(s => s.tx !== null)) ri.tiltX = sm.map(s => Math.round(s.tx ?? 0))
    if (sm.some(s => s.ty !== null)) ri.tiltY = sm.map(s => Math.round(s.ty ?? 0))
    if (sm.some(s => s.tw !== null && s.tw !== 0)) ri.twist = sm.map(s => Math.round(s.tw ?? 0))
    return ri
  }

  function endDraft() {
    if (!draft) return
    const d = draft
    draft = null
    cb.onDraftChange(null)
    // mat.press(획 평균)는 **종전 그대로 전달 이벤트 표본의 평균**이다 — coalesced 표본을
    // 섞으면 옛 파일·현재 렌더가 보는 값이 미세하게 달라진다(1부: 화면은 그대로).
    const press = pressSamples.length > 0
      ? pressSamples.reduce((a, b) => a + b, 0) / pressSamples.length
      : undefined
    pressSamples = []
    const rawIn = quantIn(samples, d.raw.length)
    samples = []
    // 「잘못 찍힌 점」 문(web2-13 3-b) — 탭 대역 위·STRAY 문 아래의 raw bbox는 획을
    // **애초에 안 만든다.** 탭(끝점 이동 ≤ TAP_MAX_PX)은 여기 안 걸리고 종전 경로
    // (resolveCommit — 소실점 찍기/잡음 폐기)로 그대로 간다. 버린 수는 진단 패널.
    // ⚠ web2-67 §1 — **칠 도구는 이 문을 안 지난다**(펜 한 붓은 «길이와 무관»하게 칠이다 —
    //   2~6px 펜 획이 여기서 조용히 사라지면 §1의 문면이 깨진다. 이 문은 작도의 지뢰(교차·
    //   오스냅에 참여하는 안 보이는 선분)를 막는 것이고 칠은 그 지뢰가 아니다 — 면 위 잉크다).
    //   반증 판(gestureSplitOff)에서는 옛 그대로 지난다(옛 세계의 충실한 재현 — 게이트 ⑦).
    if (!paintActive(app) || app.gestureSplitOff) {
      const endDistPx = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) * viewScale(app)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const p of d.raw) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y
      }
      const bboxDiagPx = d.raw.length >= 2 ? Math.hypot(x1 - x0, y1 - y0) * viewScale(app) : 0
      if (isStray(endDistPx, bboxDiagPx)) { app.strayCount++; return }
    }
    // 옐로(web2-22 1부) — 소실점 찍기가 없다(1-a 표): 탭은 잡음이고 획은 그대로 확정.
    // 2부: 머무름이 성립한 채 뗐으면 **직선화** — raw를 [a,b]로 줄인다(§1 「손떨림은
    // 버린다」의 명시판: 반듯해진 획의 raw 곡선이 남으면 표현·23 밑그림이 그 곡선을
    // 되살린다). 반듯 미리보기의 end가 그대로 확정된다(원칙 d — 2-b 순서).
    if (holdTimer !== undefined) { clearTimeout(holdTimer); holdTimer = undefined }
    // 칠 — 탭은 **Injector**다(web2-51: 그린 획을 짚으면 그 획의 속성이 지금 도구에
    // 실린다 — Feather의 그 도구). 45~50에서 탭은 잡음이었으므로 몸짓에 뜻을 하나만
    // 얹는 것이다(#77 ㉠ 무위반 — 옛 뜻이 없던 자리). 끌면 종전대로 한 붓이다.
    if (paintActive(app)) {
      // web2-67 §1 — **장치가 뜻을 가른다**(사람 판정 「그리려고 하는 건데 면이 선택되어버리는
      // 문제」 · Feather의 그 구조): 펜 한 붓은 «언제나 칠»이다 — 길이와 무관, 거리 문턱이
      // 없어졌다(64의 6px 판정은 펜에서 뺐다). 면 고르기는 손가락 탭(touch 경로)이 한다.
      // **마우스만** 문턱이 남는다(장치가 하나라 두 뜻을 다 져야 한다 — 6 → 12 · #93 거리).
      // 반증(D-3 · 게이트 ⑦): gestureSplitOff = 옛 판(펜·마우스 다 6px 탭 판정) — 켜면
      // 짧은 펜 획이 도로 고르기가 된다(옛 충돌의 재현).
      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity
      for (const p of d.raw) {
        if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x
        if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y
      }
      const diagPx = d.raw.length >= 2 ? Math.hypot(bx1 - bx0, by1 - by0) * viewScale(app) : 0
      const tap = app.gestureSplitOff
        ? diagPx <= 6                                       // 옛 판(64) — 반증 전용 값
        : drawingType !== 'pen' && diagPx <= C.PAINT67_MOUSE_TAP_MAX_PX
      if (tap) {
        cb.onPaintTap(d.start)
        return
      }
      // **펜 점 찍기**(게이트 ①) — 움직임 없는 한 붓은 엔진의 도장 셈(거리 기반)이 0이라
      // 자국이 안 남는다: 굵기 비율의 짧은 걸음으로 편다(C.PAINT67_DOT_FRAC · 문서 좌표로 환산).
      let pts = d.raw
      if (diagPx < 1 && !app.gestureSplitOff) {
        const wpx = paintEraseNow(app) ? app.eraseSel.w : app.paintSel.w
        const step = Math.max(C.PAINT67_DOT_MIN_PX, wpx * C.PAINT67_DOT_FRAC) / viewScale(app)
        pts = [d.start, pt(d.start.x + step, d.start.y)]
      }
      cb.onPaint(pts, d.press && d.press.length === pts.length ? d.press : undefined)
      return
    }
    if (yellowActive(app)) {
      if (Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) * viewScale(app) <= C.TAP_MAX_PX) return
      app.lastSnap = { start: null, end: null }
      cb.onCommit(d.start, d.end, d.held ? [d.start, d.end] : d.raw, press, d.held ? undefined : rawIn)
      return
    }
    // bbox 대각을 함께 넘긴다(web2-32 1번) — 닫힌 한 붓이 탭으로 읽히지 않게.
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity
    for (const p of d.raw) {
      if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x
      if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y
    }
    const bboxDiagPx = d.raw.length >= 2 ? Math.hypot(bx1 - bx0, by1 - by0) * viewScale(app) : 0
    const c = resolveCommit(app.lift.an, d.start, d.end, app.osnap.radius / viewScale(app), bboxDiagPx)
    if (!c) return // 잡음 — 지평선에서 먼 탭
    // **어떤 오스냅이 이 획을 정했는가**(web2-18 2-c) — 사람이 「정확히 어떤 오스냅
    // 때문인지 모르겠다」고 했다. 앱이 실제로 쓴 값을 그대로 든다(다시 계산하지 않는다).
    // ⚠ commitStroke가 획득을 비우므로 **그 전에** 적는다.
    app.lastSnap = { start: d.startSnap?.kind ?? null, end: d.endSnap?.kind ?? null }
    cb.onCommit(c.a, c.b, d.raw, press, rawIn)
  }

  // ── 카메라 조작 — 궤도는 state.ts의 orbitBy 하나다(시험이 같은 함수를 부른다) ──
  const orbit = (dx: number, dy: number) => orbitBy(app, dx, dy)

  // 팬·줌 — **계산은 `state.ts`에 있다**(입력과 시험이 같은 함수를 부른다 · 지시 5).
  // dx·dy·중심은 화면 좌표다.
  const dolly = (scale: number, center: Pt) => dollyBy(app, scale, center)
  const pan = (dx: number, dy: number) => panBy(app, dx, dy)

  // 뷰 큐브 — 화면 좌표로 판정. 잡히면 그 시점으로.
  function tryCube(sp: Pt): boolean {
    const geom = cubeGeom(app.lift.an, app.pose, app.cubeLayout)
    if (!geom) return false
    if (Math.hypot(sp.x - app.cubeLayout.cx, sp.y - app.cubeLayout.cy) > app.cubeLayout.size) return false
    const pivot = orbitPivot(app)
    const dist = Math.max(1, Math.hypot(
      app.pose.p.x - pivot.x, app.pose.p.y - pivot.y, app.pose.p.z - pivot.z))
    // 90° 화살표가 먼저다(web2-31 1번) — 큐브 폴리곤 밖에 있으므로 서로 안 먹지만,
    // 순서를 정해 두면 대역이 겹치게 바뀌어도 판정이 안 흔들린다.
    // **틀은 화면이 아니라 축이다**: 지금 자세를 축 틀의 면으로 읽고 그 안에서 90° 돈다.
    const turn = arrowHit(app.cubeLayout, sp)
    const basis = cubeBasis(app.lift.an)
    if (turn && basis) {
      const t = poseForOrient(basis, turnOrient(orientIn(basis, app.pose), turn), pivot, dist)
      // **투영은 그대로 간다**(web2-42) — 90°는 «자세»의 일이다. 거리(dist)를 그대로 쓰므로
      // 기준 깊이 D도 그대로 맞다. 정투상 뷰에서 화살표를 눌러도 평행이 유지된다.
      const to = app.pose.proj ? { ...t, proj: { ...app.pose.proj } } : t
      level.glide(to)   // 보간한다 — 즉시 튀면 어디로 갔는지 잃는다
      return true
    }
    const elem = cubeHit(geom, sp)
    if (!elem) return false
    // ── 일곱 개의 이름 붙은 뷰(web2-42 1번) ────────────────────────────────
    // **가운데 = 「투시」** — 자세는 그대로 두고 투영만 원근으로 되돌린다.
    if (elem.kind === 'center') {
      if (isParallel(app.pose)) level.glide(perspectivePose(app.pose))
      return true   // 이미 원근이면 할 일이 없다(구성상 항등 — 애니메이션도 안 건다)
    }
    const pose = poseForElem(app.lift.an, elem, pivot, dist)
    if (!pose) return true
    if (elem.kind === 'face') {
      // **면을 누르면 자세와 투영이 같이 정해진다** — 「평행을 켜고 정면으로 간다」가
      // 아니라 그냥 정면으로 간다(지시 문면). 확정 전에는 평행이 잠기므로(31-2와 같은
      // 조건) 그때는 자세만 간다 — 하지만 그 국면에서는 `cubeGeom`이 이미 null이라
      // 여기까지 오지도 않는다(문이 둘이 아니라 하나다).
      const to = parallelAllowed(app.lift.an) ? parallelPose(pose, pivot) : pose
      // 렌즈는 평행에서 뜻이 없다 — 들어가면서 버린다(42-3: 읽는 값이 축척으로 갈린다).
      if (to.proj) resetViewLens(app)
      level.glide(to)   // **보간한다** — 원근↔평행은 시각적으로 커서 튀면 어디로 갔는지 잃는다
      return true
    }
    // 모서리·꼭짓점은 **31-1의 범위 그대로**다(즉시 이동 · 원근 유지 — 지시: 안 되살린다)
    setPose(app, pose); level.touch()
    return true
  }

  // ── 포인터 이벤트 ────────────────────────────────────────────────────
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      if (penDown) return // 팜 리젝션(26) — 그 배선 그대로: 펜이 닿아 있는 동안 손가락은 없다
      if (touches.size === 0 && tryCube(toScreen(e))) return
      if (fingerTap) cancelFingerTap()   // 둘째 손가락 — 그 몸짓은 팬+줌이다(탭 후보를 접는다)
      touches.set(e.pointerId, toScreen(e))
      lastTouchMid = null
      lastTouchDist = 0
      // 손가락 탭 후보(web2-67 §1) — 칠 도구에서만: 작도 중 손가락 탭은 종전대로 아무 일도
      // 안 한다(게이트 ⑤). 문턱 전에는 잠잠하다 — 넘으면 궤도(move가 접는다) · 떼면 탭.
      if (paintActive(app) && touches.size === 1 && !app.gestureSplitOff) {
        const p = toPt(e)
        fingerTap = {
          id: e.pointerId, sp: toScreen(e), p, held: false,
          // 긴 누름 = Injector(67-1) — 시계는 39·44의 그 값(WRITE_HOLD_MS 계열 · 새 숫자 ⛔).
          // ⚠ «실었을 때만» 몸짓을 삼킨다(리뷰어 [H5] · #93): 짚은 칠 획이 없으면 held가 안
          // 서고, 느리게 머문 탭도 뗄 때 고르기로 산다 — 시간 진입이 뜻을 «조용히» 못 바꾼다.
          holdT: window.setTimeout(() => {
            if (fingerTap && touches.size === 1) fingerTap.held = cb.onPaintFingerHold(fingerTap.p)
          }, app.writeHoldMs),
        }
      }
      level.grab()
      beginNavHold(app)   // 제스처 동안 감쇠 판정 동결(web2-14 3번)
      return
    }
    if (e.pointerType === 'pen') { penDown = true; app.penUsed = true }
    // **매 접촉에서 다시 정한다** — 신호가 없으면 false다. 뗌이 유실돼도 다음 접촉이
    // 스스로 바로잡으므로 «되돌리기»가 없다(state.ts `tipErase` 주석이 정본).
    app.tipErase = isTipErase(e)
    if (e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = { last: toScreen(e), mode: e.button === 1 ? 'orbit' : 'pan' }
      level.grab()
      beginNavHold(app)   // 제스처 동안 감쇠 판정 동결(web2-14 3번)
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (tryCube(toScreen(e))) return
    // **접힐 자세(임계 안)면 그 누름이 접기를 당긴다** — 곧 정렬될 화면에 긋게 두면
    // 확정 좌표가 접히기 전 포즈의 것이 된다. 죽은 클릭도 안 만든다 — 접히면 바로 그린다.
    // **임계 밖(머무는 자세)이면 foldNow가 false다 — 그 자세에서 그대로 그린다**(지시 3).
    // 그때의 획은 `commitStroke`가 `view`를 실어 그 포즈의 2D로 남기고, 연결이 닿으면
    // 3D로 올라간다(`lift.ts`가 `s.view` 포즈로 푼다 — 기존 기전이다).
    if (!isLevel(app.pose) && level.foldNow()) return
    // 활성 겹의 가장자리 끌기(web2-20 2-b) — 변·모서리를 잡으면 그리기가 아니라 크기다.
    // 잡는 반경은 오스냅 반경 재사용(새 숫자를 안 짓는다). 막이 보일 때만(같은 filmSplit).
    if (tryRectDrag(e)) return
    drawingPointer = e.pointerId
    drawingType = e.pointerType
    canvas.setPointerCapture(e.pointerId)
    // **면 도구는 탭이다** — 누르는 동안 아무것도 안 만들고, 뗄 때 판정한다.
    // 누름에서 바로 만들면 «잘못 눌렀다»를 뗌으로 취소할 길이 없다.
    // 지우개 끝이 **먼저**다 — 손에 든 것이 지우개면 사이드바에 무엇이 눌려 있든
    // 지운다(도구는 그대로 남는다 — 뗌과 동시에 아무것도 안 남는다).
    // **탭**은 치수 숫자를 짚을 수 있다(web2-32 2번 — 사후 수정). 끌면 종전대로
    // 그린다(그림이 기본이다). 판정은 뗄 때 «안 움직였는가»로 한다.
    // ⚠ **면 도구는 뺀다** — 그 탭은 이미 뜻이 있다(면 지정). 한 몸짓에 뜻을 둘 얹으면
    //   옛 뜻이 조용히 죽는다(#77 ㉠).
    // ⚠ **재기도 뺀다**(web2-32 6번 — 면·치수와 같은 이유): 그 탭은 이미 뜻이 있다
    //   (재는 점을 짚는다). 한 몸짓에 뜻을 둘 얹으면 옛 뜻이 조용히 죽는다(#77 ㉠).
    if (app.tool !== 'dim' && app.tool !== 'face' && app.tool !== 'measure' && app.tool !== 'paint'
        && !app.tipErase && !isEraser(app.tool)) {
      suggestTap = toPt(e)
      // **꾹 누르면 글씨다**(web2-39 1번) — 탭(사후 수정)·끌기(그리기)와 **같은 몸짓의
      // 세 번째 갈래**이고 셋을 가르는 것은 «얼마나 오래·얼마나 움직였는가»뿐이다.
      // ⚠ 옐로에서는 대상이 없다 — `writeTargetAt`이 3D 내용 획만 보므로 자동으로 안 걸린다
      //   (별도의 문을 안 세운다 — #54. 「옐로에서 자유 스케치」가 그 근거다).
      writeEntered = false
      armHoldPress(toPt(e), toScreen(e))
    }
    // ── 손글씨 치수(web2-29 1단계) — **모드가 있다** ──────────────────────────
    // 대상을 안 골랐으면 탭이 대상을 고르고, 고른 뒤에는 종이 위의 획이 **손글씨**다
    // (문서에 안 들어간다 — 확정되면 사라지고 치수선으로 대체된다).
    if (app.tool === 'dim' && !app.tipErase) {
      if (app.dimPick === null) { dimTap = toPt(e); return }
      dimInk = [toPt(e)]
      drawingPointer = e.pointerId
      canvas.setPointerCapture(e.pointerId)
      return
    }
    // ── 글씨 상태(web2-39 2번) — **상태 안에서는 모든 획이 글씨다** ─────────────
    // 축·오스냅·소실점을 아예 안 지난다(39-4: 「곧게 안 펴진다」가 곧 상태 표시다).
    // ⚠ 상태에 들어간 뒤에는 꾹 누름 시계를 안 켠다 — 이미 대상이 정해져 있다.
    if (writeActive(app) && !app.tipErase && !isEraser(app.tool)) {
      const wp = toPt(e)
      // ── 잡기 끌기(web2-44) — **잡힌 것 위에서 시작하면 손이다**(글씨보다 먼저 본다:
      // 이것이 「같은 제스처의 두 뜻」을 가르는 문이다 — 잡힌 선 위 = 조작 · 밖 = 글씨).
      const gd = gripDragStartAt(app, wp)
      if (gd) {
        manipDrag = {
          mode: gd.kind, start: wp, base: gripBase(app), axis: null, amount: 0, after: null,
          ...(gd.kind === 'move' ? { anchor3: gd.anchor3 } : { pivot: gd.pivot }),
        }
        drawingPointer = e.pointerId
        drawingType = e.pointerType
        canvas.setPointerCapture(e.pointerId)
        return
      }
      // **종료 판정은 여기서 한다**(39-3) — 둘 중 **먼저 오는 것**이고, 둘 다 「이 획이
      // 글씨인가」를 묻기 **전에** 답이 난다. 그래야 작도로 돌아간 획이 아래 보통 경로로
      // 흘러가 오스냅·축을 지난다(끝난 뒤에 판정하면 그 획은 아무데도 안 붙은 선이 된다).
      const idle = writeIdleNow(app, performance.now())
      const far = writeFarPts(app, [wp])
      if (idle || far) {
        cb.onWriteEnd(idle ? 'idle' : 'far')
        // 상태가 끝났다 — **아래로 흘려보낸다**(이 획은 작도선이다)
      } else {
        writeInk = [wp]
        suggestTap = null
        cb.onDimInk(writeInk)               // 미리보기 통로 재사용(#54 — 새 채널 ⛔)
        return
      }
    }
    if (app.tool === 'face' && !app.tipErase) { faceDown = toPt(e); return }
    // 재기(web2-32 6번) — **탭 둘**이다(면과 같은 몸짓: 누를 때 아무것도 안 하고 뗄 때
    // 판정한다). 끌면 취소이므로 잘못 짚은 것을 뗌으로 무를 수 있다.
    if (app.tool === 'measure' && !app.tipErase) { measureDown = toPt(e); return }
    if (erasingNow() && !paintTipErase()) {
      beginErase(app)
      const opened = eraseAt(app, toPt(e), eraseKind())
      if (opened.length > 0) cb.onFacesOpened(opened)
      cb.onEraserMove(toPt(e))
      return
    }
    pressSamples = e.pointerType === 'pen' && e.pressure > 0 ? [e.pressure] : []
    beginDraft(toPt(e), e)
  })

  canvas.addEventListener('pointermove', (e) => {
    // 펜이 **닿지 않고 지나가는** 것도 「펜을 든 세션」의 신호다(web2-26 5번) — 호버가
    // 펜의 첫 신호인 기기가 있다. 손가락의 뜻이 첫 획을 기다리지 않게 한다.
    if (e.pointerType === 'pen') app.penUsed = true
    if (rectDrag) { dragRect(e); return }
    if (e.pointerType === 'touch') {
      if (penDown) return
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, toScreen(e))
      // 손가락 탭 후보(web2-67 §1) — 문턱 안이면 잠잠(궤도 시작 ⛔ · lastTouchMid도 안
      // 만진다) · 긴 누름이 이미 소진했으면 이 몸짓은 끝났다 · 문턱을 넘으면 후보를 접고
      // 아래 궤도가 «이 자리부터» 시작한다(lastTouchMid가 null이라 이번 이동은 기준점만 선다).
      if (fingerTap && fingerTap.id === e.pointerId) {
        if (fingerTap.held) return
        const sp = toScreen(e)
        if (Math.hypot(sp.x - fingerTap.sp.x, sp.y - fingerTap.sp.y) <= C.PAINT67_FINGER_TAP_MAX_PX) return
        cancelFingerTap()
      }
      level.grab()
      const pts = [...touches.values()]
      if (pts.length === 1) {
        const p = pts[0]!
        // **한 손가락의 뜻**(web2-26 5번) — 판정의 출처는 `fingerPans` 하나다(#54).
        // 펜을 든 세션이거나 돌 것이 없으면 **이동**, 아니면 종전대로 궤도.
        if (lastTouchMid) {
          const dx = p.x - lastTouchMid.x, dy = p.y - lastTouchMid.y
          if (fingerPans(app)) pan(dx, dy)
          else orbit(dx, dy)
        }
        lastTouchMid = p
      } else if (pts.length >= 2) {
        const mid = pt((pts[0]!.x + pts[1]!.x) / 2, (pts[0]!.y + pts[1]!.y) / 2)
        const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y)
        if (lastTouchMid && lastTouchDist > 0) {
          pan(mid.x - lastTouchMid.x, mid.y - lastTouchMid.y)
          dolly(dist / lastTouchDist, mid)
        }
        lastTouchMid = mid
        lastTouchDist = dist
      }
      return
    }
    if (orbitBtn) {
      const p = toScreen(e)
      if (orbitBtn.mode === 'orbit') orbit(p.x - orbitBtn.last.x, p.y - orbitBtn.last.y)
      else pan(p.x - orbitBtn.last.x, p.y - orbitBtn.last.y)
      orbitBtn.last = p
      level.grab()
      return
    }
    if (drawingPointer === e.pointerId) {
      moveHoldPress(toScreen(e))     // 움직였으면 그리기다 — 꾹 누름 시계를 끈다(web2-39)
      if (writeEntered) return       // 이 몸짓은 글씨 진입으로 소진됐다
      if (manipDrag) { dragManip(e); return }   // 잡기 끌기(web2-44) — 손이다
      if (erasingNow() && !paintTipErase()) {
        const opened = eraseAt(app, toPt(e), eraseKind())
        if (opened.length > 0) cb.onFacesOpened(opened)
        cb.onEraserMove(toPt(e))
        return
      }
      if (writeInk) { writeInk.push(toPt(e)); cb.onDimInk(writeInk); return }
      if (app.tool === 'dim' && dimInk) { dimInk.push(toPt(e)); cb.onDimInk(dimInk); return }
      if (app.tool === 'face') { cb.onFacePreview(app.faceCandidates ? null : facePreview(app, toPt(e))); return }
      if (draft) {
        if (e.pointerType === 'pen' && e.pressure > 0) pressSamples.push(e.pressure)
        updateDraft(e)
      }
      return
    }
    if (e.buttons === 0) {
      if (isEraser(app.tool)) {
        cb.onEraserMove(toPt(e))
        cb.onHover(null)
        return
      }
      cb.onEraserMove(null)
      if (app.tool === 'face') {
        // **접힐 자세(임계 안 기울임)에서는 미리보기가 없다** — 그때 누름은 접기이지 면이
        // 아니다. 머무는 자세(임계 밖)에서는 누름이 면 토글이므로 미리보기도 뜬다(지시 3).
        const acts = isLevel(app.pose) || !pitchSnaps(app.pose, app.lift.an.f, app.lift.an.W)
        // 후보 모드에서는 낱개 미리보기가 없다 — 후보 테두리가 이미 «물어보는 중»이다(4-d)
        cb.onFacePreview(acts && !app.faceCandidates ? facePreview(app, toPt(e)) : null)
        cb.onHover(null)
        return
      }
      // 호버 — 와콤 EMR 펜·마우스. 스냅 후보 표식.
      const hp = toPt(e)
      // 겹 가장자리 손잡이(web2-24 4-d) — 가까이 갔을 때만 옅게 뜬다(순간 피드백)
      setRectHover(rectEdgesAt(hp))
      // 옐로(web2-24 4-c) — **오스냅이 아예 안 돈다**: 후보에서 빠지는 것(22 1-c)을
      // 넘어, 옐로에서 그릴 때 아무것에도 안 붙는다(사람 문면). 밑그림의 3D 점에도
      // 안 붙고 표식도 안 뜬다 — 「자를 치운 종이」의 정의. 연장선 획득(ext)도 같은
      // 자(치운 그 자)의 일부라 같이 쉰다.
      if (yellowActive(app) || paintActive(app)) { cb.onHover(null); return }
      // ⚠ **호버에서는 왕복이 안 돈다**(web2-30 11번) — 선언은 «획의 시작점에서 나갔다
      //    돌아왔다»는 몸짓이라 획이 없으면 잴 것이 없다(종전 머무름 획득은 여기서도 돌았다).
      cb.onHover(osnap(app.lift, app.pose, hp, osnapSet(), undefined, undefined, app.extAcq.acquired))
    }
  })

  const release = (e: PointerEvent) => {
    cancelHoldPress()                // 뗐으면 꾹 누름은 성립 안 한다(web2-39)
    if (writeEntered) {              // 진입으로 소진된 몸짓 — 그리기·탭으로 안 흘러간다
      writeEntered = false
      drawingPointer = null
      suggestTap = null
      return
    }
    if (manipDrag && drawingPointer === e.pointerId) {   // 잡기 끌기가 끝났다(web2-44)
      drawingPointer = null
      suggestTap = null
      endManipDrag(e)
      return
    }
    if (writeInk) {                  // 글씨 한 획이 끝났다(web2-39 2번)
      const pts = writeInk
      writeInk = null
      drawingPointer = null
      cb.onDimInk(null)
      if (pts.length >= 2) cb.onWriteStroke(pts)
      return
    }
    if (rectDrag) {
      rectDrag = null
      for (const l of app.listeners) l()   // 자동 저장 — rect는 문서의 값이다
      return
    }
    if (e.pointerType === 'touch') {
      // 손가락 탭(web2-67 §1) — 문턱 안에서 뗐고 긴 누름이 안 소진했으면 «탭»이다(면 고르기).
      // pointercancel은 탭이 아니다(몸짓이 끊긴 것 — 조용히 무위).
      if (fingerTap && fingerTap.id === e.pointerId) {
        const ft = fingerTap
        cancelFingerTap()
        if (!ft.held && e.type === 'pointerup') cb.onPaintFingerTap(ft.p)
      }
      touches.delete(e.pointerId)
      lastTouchMid = null
      lastTouchDist = 0
      if (touches.size === 0) { level.release(); endNavHold(app) } else level.grab()
      return
    }
    if (e.pointerType === 'pen') penDown = false
    if (orbitBtn && e.pointerType === 'mouse' && e.button !== 0) {
      orbitBtn = null; level.release(); endNavHold(app); return
    }
    if (suggestTap) {
      const d = suggestTap
      suggestTap = null
      const p = toPt(e)
      // 끌었으면 그림이다 — 아래로 흘려보낸다(탭일 때만 치수를 짚는다).
      // 짚었으면 **거기서 끝난다**: 그 탭이 소실점 표식(점 찍기)으로 흘러가지 않는다.
      if (Math.hypot(p.x - d.x, p.y - d.y) <= C.TAP_MAX_PX / viewScale(app) && cb.onDimTap(d)) {
        if (drawingPointer === e.pointerId) { drawingPointer = null; draft = null; cb.onDraftChange(null) }
        return
      }
    }
    if (measureDown) {
      const d = measureDown
      measureDown = null
      const p = toPt(e)
      // 끌었으면 취소다 — 면·치수와 같은 탭 대역(새 숫자 ⛔)
      if (Math.hypot(p.x - d.x, p.y - d.y) <= C.TAP_MAX_PX / viewScale(app)) cb.onMeasureTap(d)
      return
    }
    if (dimTap) {
      const d = dimTap
      dimTap = null
      const p = toPt(e)
      // 끌었으면 취소다 — 면 도구와 같은 탭 대역(새 숫자 ⛔)
      if (Math.hypot(p.x - d.x, p.y - d.y) <= C.TAP_MAX_PX / viewScale(app)) cb.onDimPick(d)
      return
    }
    if (drawingPointer === e.pointerId) {
      drawingPointer = null
      if (erasingNow() && !paintTipErase()) {
        endErase(app)
        if (app.tipErase) {
          app.tipErase = false        // 그 획 하나로 끝난다 — 도구는 처음부터 안 바꿨다
          cb.onEraserMove(null)       // 커서도 같이 사라진다(사이드바 지우개는 종전대로 남는다)
        }
        return
      }
      if (app.tool === 'dim') {
        const pts = dimInk
        dimInk = null
        cb.onDimInk(null)
        if (pts && pts.length >= 2) cb.onDimStroke(pts)
        return
      }
      if (app.tool === 'face') {
        const d = faceDown
        faceDown = null
        if (!d) return
        const p = toPt(e)
        // 끌었으면 취소다 — 탭 대역(`TAP_MAX_PX`)은 찍기와 같은 기준을 쓴다
        if (Math.hypot(p.x - d.x, p.y - d.y) > C.TAP_MAX_PX / viewScale(app)) return
        // 면 일괄 후보 모드(web2-21 4부) — 탭은 **배제**다(아닌 것만 탭해서 뺀다).
        // 후보 밖 탭은 아무 일도 안 한다(확정·취소는 팝오버 — 실수로 안 닫히게).
        if (app.faceCandidates !== null) {
          cb.onCandidateTap(excludeCandidateAt(app, d))
          return
        }
        cb.onFaceToggle(toggleFaceAt(app, d))
        cb.onFacePreview(facePreview(app, d))
        return
      }
      endDraft()
      // web2-67 0-6 — 뒷꼭지 지우개는 그 한 붓으로 끝난다(칠 판 — endDraft «뒤»에 끈다:
      // 확정(commitPaint)이 paintEraseNow로 이 값을 읽기 때문이다).
      if (paintTipErase()) app.tipErase = false
    }
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    dolly(Math.exp(-e.deltaY * 0.001), toScreen(e))
    level.touch()
  }, { passive: false })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  // 진단·원장 통로(1-a·1-f) — 패널과 e2e가 같은 값을 읽는다
  return { strokeStats: () => ({ ...capStats }) }
}
