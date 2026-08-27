// 앱 상태 — 문서(획 목록)와 뷰 포즈. 카메라·소실점·리프팅은 전부 계산으로 나온다.
//
// 실행취소는 op 단위다: 획 추가 op, 지우개 한 번의 드래그 op.
// 그림만 되돌린다 — 작도(카메라)는 op에 들어가지 않는다.

import { emptyDoc, type Doc, type Stroke, type Face, type CamPose, type ViewOffset, type Grade, type RawInput } from '../core/types'
import { isInk } from '../core/material'
export type { ViewOffset }
import { liftAll, closestOnLineToRay, type LiftResult } from '../core/lift'
import { camSig, defineByTouch, type TouchStats } from '../core/own3d'
import { DRAW_POSE, rayThrough } from '../core/camera'
import { defaultOsnap, type OsnapSettings } from '../core/osnap'
import { pieces, distToPiece, type Piece } from '../core/pieces'
import { loopAt, faceAt, faceScreen, resolveFaces, type ResolvedFace } from '../core/face'
import { C } from '../core/constants'
import { type Pt, type V3, v3, add3, sub3, mul3, dot3, len3, quatAxisAngle, quatMul, quatRotate } from '../core/vec'

export type Tool = 'pencil' | 'pen' | 'eraser-pencil' | 'eraser-ink' | 'face'

/** 지금 그으면 무슨 재료인가 — **한 자리에서만 정한다**(원칙 a의 재료판).
 *  펜은 언제나 잉크이고, 연필은 고른 경도다. */
export const activeGrade = (app: Pick<App, 'tool' | 'grade'>): Grade =>
  app.tool === 'pen' ? 'INK' : app.grade

/** 이 draft를 brush 경로(질감 #brushc + 몸체 Line2)가 그리는가(web2-12 2번) —
 *  **한 곳**이어야 한다(#54): brushlayer(질감) · render3d의 setDraftLine 배선(몸체) ·
 *  render2d(그럴 때 잉크 겹 몸체를 **긋지 않는다**)가 같이 본다.
 *  잉크 겹에 몸체를 그으면 겹 순서가 확정과 반대가 된다 — 그리는 중엔 몸체(잉크 겹, 위)가
 *  질감을 덮고, 떼면 몸체가 #gl(아래)로 내려가 질감이 덮는다. 뗌 게이트가 이것으로 깨졌다
 *  (초판 실측 — 좌표·id·재료는 전부 동일했는데 diff가 획의 대부분이었다. 2D 캔버스 벡터로
 *  아래 겹에 흉내 내는 중간판도 반투명 합성의 파이프라인 차가 남아 걷었다 — 몸체는 확정과
 *  같은 Line2가 그린다. draft_gate_web2*.json이 정본).
 *  INK 제외 — 잉크 확정 몸체는 Line2 균일선(질감 없음)이라 벡터 미리보기가 그 모습이다.
 *  작도 획(horizon·vp) 제외 — 확정돼도 재료 질감이 없다.
 *  카메라 미확정(f 없음) 제외 — Line2 역사영이 설 수 없다(그때는 종전 벡터 미리보기). */
export const draftBrushed = (app: Pick<App, 'tool' | 'grade' | 'renderer' | 'lift'>, label: string | null): boolean =>
  app.renderer === 'brush' && label !== 'horizon' && label !== 'vp' && activeGrade(app) !== 'INK' &&
  app.lift.an.f !== null && app.lift.an.principal !== null

/** 지우개 도구인가 — 입력·커서·렌더가 전부 이것을 본다.
 *  `tool !== 'pen'` 으로 재던 초판은 연필 도구가 생기면서 그대로 깨진다. */
export const isEraser = (t: Tool): boolean => t === 'eraser-pencil' || t === 'eraser-ink'

export interface Op {
  removed: { stroke: Stroke; index: number }[]
  added: Stroke[]
  /** 면 지정·해제도 실행취소 대상이다 — 사람이 한 것이므로(작도와 다르다) */
  facesAdded?: Face[]
  facesRemoved?: { face: Face; index: number }[]
}

export interface App {
  doc: Doc
  undoStack: Op[]
  redoStack: Op[]
  pose: CamPose
  nextId: number
  /** 문서가 바뀔 때마다 다시 계산 — 유일한 캐시이고 doc에서만 나온다 */
  lift: LiftResult
  /** 풀린 면 — 경계가 다 승격돼 있고 한 평면인 것만. 이것도 doc에서만 나온다.
   *  못 푸는 면은 **여기서 빠질 뿐 문서에는 남는다**(불변식 j의 면판). */
  faces: ResolvedFace[]
  /** 문서 변경 카운터 — 렌더가 기하 재구축 시점을 안다 (포즈 변경과 구분) */
  docVersion: number
  /** 오스냅 설정 — 종류별 켜고 끄기, 반경 (Rhino 관행) */
  osnap: OsnapSettings
  /** 도구 넷 — **연필과 펜은 재료가 다르므로 도구가 다르다**(지시 4-h).
   *  연필은 경도(2H~2B)를 고르고 펜은 니브 굵기를 고른다.
   *  지우개 둘이 그것과 짝이 맞는다 — 연필 지우개는 흑연만, 펜 지우개는 잉크만(선따기). */
  tool: Tool
  /** 연필 심 — 경도. **펜에는 안 쓴다**(펜은 언제나 INK다). */
  grade: Grade
  /** 제도펜 니브 굵기 px */
  nib: number
  eraserRadius: number
  /** **지금 이 획이 펜의 지우개 끝으로 그어지는 중인가**(web2-15 2-b).
   *  ⚠ 도구(`tool`)는 **안 바꾼다.** 안드로이드 크롬은 지우개 끝을 호버에 안 알리므로
   *  전환이 접촉 순간에만 일어나고, 도구를 바꾸면 뗄 때 되돌려야 하는데 그 복원이
   *  어긋나는 경우(앱 정지·이벤트 유실·포인터 겹침)가 생긴다. 이 깃발은 되돌릴 것이
   *  없다: `input.ts`가 **매 `pointerdown`에서 다시 정한다**(신호가 없으면 false).
   *  그래서 뗌이 유실돼도 다음 접촉이 스스로 바로잡고, 그리기는 접촉 없이 못 일어난다.
   *  읽는 곳은 지우개 커서(`render2d`)와 진단 패널뿐이다. */
  tipErase: boolean
  /** 지우개 드래그 한 번의 누적 op (드래그가 끝나면 undoStack으로) */
  activeErase: Op | null
  /** 화면 조작(뷰 오프셋) — 그리는 중의 팬·줌. 문서 좌표는 안 바뀐다. */
  view: ViewOffset
  /** 조작 제스처(궤도·팬) 동안 대기 획 감쇠 판정을 **동결**하는 포즈(web2-14 3번) —
   *  null이면 실시간(app.pose). 잡는 순간 굳고 놓으면 풀린다: 돌리는 동안 대기 획의
   *  표시 상태가 아무것도 안 바뀐다(실기기 판정 「돌릴 때 깜빡여 성가시다」의 수리).
   *  ⚠ 표시 계층(render2d·brushlayer의 감쇠·질감 판정)만 읽는다 — 교점 사건(4-g)의
   *  atOwnPose는 획끼리의 포즈 비교라 이것과 무관하다. 감쇠 자체는 그대로다(1-e —
   *  떨림만 없앤다). 읽기는 fadeRef() 하나다(#54). */
  fadePose: CamPose | null
  /** 저장된 시점 */
  savedViews: { pose: CamPose; view: ViewOffset; thumb?: string }[]
  /** 치수 스냅(web2-08 지시 4-7) — **기본 꺼짐**(옵션). 켜면 그리는 동안 실제 길이가
   *  `dimSnapStep`(mm)의 배수로 맞춰진다 — 표시만이 아니다. */
  dimSnap: boolean
  dimSnapStep: number
  /** 무한소수 표기(지시 4-8) — 꺼져 있으면 읽는 자리만 반올림해 보인다(값은 불변) */
  dimExact: boolean
  /** coalesced 이벤트 수집(web2-11 1-a) — **기본 켜짐**. 끄는 손잡이는 D-3 반증용이다
   *  (끄면 점 수가 전달 이벤트당 1로 떨어지는 것을 e2e가 실측한다). 화면에는 안 나온다. */
  coalesce: boolean
  /** 획 렌더러(web2-11 2부) — **기본 brush**(사람의 결정: 「무겁더라도 좋은 걸 먼저」).
   *  'classic'은 종전 경로 그대로다(2-b: 되돌릴 수 있어야 한다 — 안 지운다).
   *  토글은 세로바 버튼·진단 패널이 보인다. 저장은 localStorage(문서의 값이 아니다). */
  renderer: 'classic' | 'brush'
  /** 지평선 표시(web2-12 7번) — **기본 켜짐**(작도의 뼈대다). 격자 토글의 선례 그대로
   *  설정에 산다. 끄면 지평선 «표시»만 사라진다 — 카메라·판정은 그대로다(표현 계층). */
  horizon: boolean
  /** 지면 격자 표시 — **기본 꺼짐**(지시 3-a). 토글은 설정에 남는다.
   *  이 도구는 모델링 툴이 아니라 그림 도구다 — 빈 종이에 격자가 깔려 있으면
   *  CAD의 감각이 된다. 필요한 사람이 켠다. */
  grid: boolean
  /** 대기 획 시점 감쇠(web2-13 3-a) — **기본 켜짐**(새 동작: 자기 시점 밖 `WAIT_FADE_DEG`
   *  에서 0 도달). 끄면 종전 동작(항상 그리되 흐림 0.3) **그대로**다(A-4 — 되돌릴 길.
   *  실기기 판정은 DEFERRED web2-13 표). 설정 「대기 획은 그린 시점에서만」. */
  waitFade: boolean
  /** 「잘못 찍힌 점」 문이 버린 획 수(web2-13 3-b) — 세션 계수. 진단 패널에 보인다.
   *  조용히 버리는 것은 이 저장소가 가장 경계하는 형태라 **수가 말하게 한다** —
   *  크면 `C.STRAY_MIN_PX`가 틀린 것이다. */
  strayCount: number
  /** **자립 깃발**(web2-13 4부 · 개정 3 초안) — **기본 켜짐**(2026-08-27 web2-14 —
   *  사람이 실기기 판정으로 켰다: 「창문은 남는다. 옵션이 아니라 기본값으로」).
   *  켜짐: 카메라가 닫힌 뒤 사슬이 놓은 3D를 획이 소유하고(Stroke.own3 — 사건·영구),
   *  승격 사건이 나면 버리고 다시 올려 다시 굳힌다(2부 측정이 정한 갈래).
   *  끄면(설정 — A-4 옛 경로 유지) 옛 사슬만 도는 종전 동작 그대로다. 이제 **켜짐이
   *  정본이고 꺼짐이 대체 경로**다 — e2e 팔 구성도 그렇게 갈려 있다(NOTES web2-14 1번 표). */
  own3d: boolean
  /** 승격 «사건»의 판정자(4-c) — 직전 recompute의 카메라 서명(own3d 켜짐에서만 유지) */
  lastCamSig: string | null
  /** 교점 정의(4-g)의 성립·무산 계수 — «끝이 대기선 위에서 끝난» 후보만 센다.
   *  조용히 버리지 않는다(3-b 규약의 4-g판 — 4차 리뷰어 [42]). 진단 패널이 보인다. */
  touchStats: TouchStats
  /** 마지막 확정 획의 교점 단계 트레이스(web2-14 2번 — 지시의 ①~④를 화면에서 가른다):
   *  ① A가 3D인가(lifted) ② 닿은 대기선 수(touched) ③④ 성립/무산. 진단 패널이 읽는다. */
  touchLast: { lifted: boolean; touched: number; ok: number } | null
  cubeLayout: { cx: number; cy: number; size: number }
  listeners: (() => void)[]
}

export function createApp(W: number, H: number): App {
  const doc = emptyDoc(W, H)
  return {
    doc,
    undoStack: [],
    redoStack: [],
    pose: DRAW_POSE,
    nextId: 1,
    lift: liftAll(doc),
    faces: [],
    docVersion: 0,
    osnap: defaultOsnap(),
    tool: 'pencil',
    grade: 'HB',
    nib: C.NIB_PX,
    eraserRadius: C.ERASER_PX,
    tipErase: false,
    activeErase: null,
    view: { s: 1, ox: 0, oy: 0 },
    fadePose: null,
    savedViews: [],
    dimSnap: false,
    dimSnapStep: 50,
    dimExact: false,
    coalesce: true,
    renderer: 'brush',
    horizon: true,
    grid: false,
    waitFade: true,
    strayCount: 0,
    own3d: true,   // 기본 켜짐(web2-14 1번 — 사람 판정). 끄는 길은 설정 + localStorage 'off'.
    lastCamSig: null,
    touchStats: { ok: 0, pose: 0, axis: 0, lift: 0, roundtrip: 0 },
    touchLast: null,
    cubeLayout: { cx: W - 110, cy: 60, size: 80 }, // 우측 상단 — 1.5배 세로바(x W−45..)와 안 겹치게 왼쪽으로(web2-10 지시 5)
    listeners: [],
  }
}

// ── 치수(web2-08 지시 4) — 입력이 어디서 오든(필기·음성) 여기 하나로 들어온다 ──
//
// 4-1: 첫 치수가 스케일을 정한다 — 스케일은 **파생**이다(`lift.ts`의 `scaleOf`: 문서
//   순서상 첫 치수 획의 dim ÷ 무치수 풀이 길이). 여기서는 dim만 싣는다. 그래서 같은
//   획에 «다시» 입력하면(획마다 자동 적용되는 필기가 «2»→«25»→«2500»으로 지나간다)
//   스케일이 마지막 값으로 선다 — 저장하던 초판은 첫 «2»가 굳었다(#54 · e2e가 잡았다).
// 4-2: 그 뒤는 획의 `dim`(mm)이 길이를 바꾼다(`lift.ts` — 시작점·방향만 취한다).
// ⚠ 실행취소 대상이 아니다 — 치수는 다시 말하거나 다시 써서 고친다(지시 4-4의 «확정 전
//   변경»과 같은 몸짓이 확정 후에도 유효하다). DEFERRED에 기록.

export type DimResult = 'scale' | 'applied' | 'no3d' | 'none'

/** 획 id에 치수 mm를 싣는다. 무스케일 상태의 첫 적용이 곧 스케일 확정이다(기하 불변). */
export function setDimension(app: App, id: number, mm: number): DimResult {
  const s = app.doc.strokes.find(x => x.id === id)
  if (!s || !(mm > 0) || !isFinite(mm)) return 'none'
  const wasScaled = app.lift.mmPerUnit !== null
  if (!wasScaled && !app.lift.lifted.has(id)) return 'no3d'  // 스케일을 정할 길이가 없다
  s.dim = mm
  if (!wasScaled) app.doc.scaleRef = id      // 첫 «입력»이 기준이다(리뷰어 [5])
  recompute(app)
  if (!wasScaled && app.lift.mmPerUnit === null) {
    // 실려도 스케일이 안 섰다(퇴화 길이 등) — 조용히 두지 않고 물린다
    delete s.dim
    delete app.doc.scaleRef
    recompute(app)
    return 'no3d'
  }
  return wasScaled ? 'applied' : 'scale'
}

/** 화면 좌표 ↔ 문서 좌표 — 뷰 오프셋의 단일 출처 */
export const screenToDoc = (app: App, p: Pt): Pt =>
  ({ x: (p.x - app.view.ox) / app.view.s, y: (p.y - app.view.oy) / app.view.s })
export const docToScreen = (app: App, p: Pt): Pt =>
  ({ x: p.x * app.view.s + app.view.ox, y: p.y * app.view.s + app.view.oy })

/** 작도 포즈인가 — **원점이 아니라 `DRAW_POSE`와 견준다.**
 *  세계 원점이 지면으로 옮겨가 눈은 더 이상 원점에 없다(camera.ts). */
export const isDrawPose = (pose: CamPose): boolean =>
  Math.abs(pose.p.x - DRAW_POSE.p.x) + Math.abs(pose.p.y - DRAW_POSE.p.y) +
  Math.abs(pose.p.z - DRAW_POSE.p.z) < 1e-12 &&
  Math.abs(pose.q.x) + Math.abs(pose.q.y) + Math.abs(pose.q.z) < 1e-12

function recompute(app: App) {
  app.lift = liftAll(app.doc, app.own3d)
  // ── 자립(web2-13 4부) — 깃발 켜짐에서만. 꺼짐이면 위 한 줄이 종전과 동일하다 ──
  if (app.own3d) {
    const sig = camSig(app.lift.an)
    // 승격 «사건»: 카메라 서명(f·주점·fSource)이 움직였다 → 굳힌 3D는 옛 좌표계의
    // 것이라 전부 버리고 사슬로 다시 올린다(2부 측정 — 초안 §9.1. §6.1 조항 그대로).
    if (app.lastCamSig !== null && sig !== app.lastCamSig && app.doc.strokes.some(s => s.own3)) {
      for (const s of app.doc.strokes) delete s.own3
      app.lift = liftAll(app.doc, true)
    }
    app.lastCamSig = sig
    // 굳힘(사건): 카메라가 닫혔으면(§9.2 — constructionDone. 그 뒤로는 어떤 획도
    // f·주점을 못 바꾼다) 사슬이 놓은 3D를 획이 소유한다. 한 번 얻으면 영구 —
    // 이미 소유한 획은 안 덮는다(첫 사건이 이긴다).
    if (app.lift.an.constructionDone) {
      for (const [id, seg] of app.lift.lifted) {
        const s = app.lift.strokes.get(id)
        if (s && !s.own3) s.own3 = { a: { ...seg.a3 }, b: { ...seg.b3 }, axis: seg.axis }
      }
    }
  } else app.lastCamSig = null
  app.faces = resolveFaces(app.lift, app.doc.faces)
  app.docVersion++
  for (const l of app.listeners) l()
}

/** 자립 깃발 토글(4-f) — 설정·복원 경로가 이것 하나를 부른다(#54). */
export function setOwn3d(app: App, on: boolean) {
  app.own3d = on
  app.lastCamSig = null   // 새 관측 시작 — 켜는 순간의 카메라를 «사건»으로 안 읽는다
  recompute(app)
}

// ── 면 — 사용자가 지정한다. 자동으로 안 만든다 ─────────────────────────────
//
// **한 도구, 한 몸짓**: 면 도구로 탭하면 면이 없으면 만들고 있으면 없앤다(토글).
// 만들기와 없애기를 도구 둘로 가르지 않은 이유는 선례다 — 캐드의 페인트통·채우기가
// 그 자리를 한 도구로 쓴다. 그리고 이 앱에는 «선택»이 없어서(선택 후 삭제가 불가)
// 없애는 몸짓을 따로 두면 도구가 하나 더 늘 뿐이다(A-3: 단순한 쪽).

/** 면 지정·해제 — 문서 좌표 p. 무엇을 했는지 돌려준다(알림이 그것을 읽는다). */
export function toggleFaceAt(app: App, p: Pt): 'added' | 'removed' | 'none' {
  const hit = faceAt(app.lift, app.pose, app.faces, p)
  if (hit) {
    const i = app.doc.faces.findIndex(f => f.id === hit.id)
    if (i < 0) return 'none'
    const face = app.doc.faces.splice(i, 1)[0]!
    app.undoStack.push({ removed: [], added: [], facesRemoved: [{ face, index: i }] })
    app.redoStack = []
    recompute(app)
    return 'removed'
  }
  const found = loopAt(app.lift, app.pose, p)
  if (!found) return 'none'
  const face: Face = { id: app.nextId++, loops: found.loops }
  app.doc.faces.push(face)
  recompute(app)
  // 못 풀리면(평면성 밖 등) **안 남긴다** — 조용히 틀린 입체를 만들지 않는다
  if (!app.faces.some(f => f.id === face.id)) {
    app.doc.faces.pop()
    app.nextId--
    recompute(app)
    return 'none'
  }
  app.undoStack.push({ removed: [], added: [], facesAdded: [face] })
  app.redoStack = []
  return 'added'
}

/** 면 도구의 미리보기 — 지금 탭하면 **무엇이 될지**를 그대로 낸다(원칙 d의 면판).
 *  `toggleFaceAt`과 **같은 판정 순서**를 쓴다: 있는 면이 먼저고 없으면 최소 루프다. */
export function facePreview(app: App, p: Pt): { poly: Pt[]; mode: 'add' | 'remove' } | null {
  const hit = faceAt(app.lift, app.pose, app.faces, p)
  if (hit) {
    const poly = faceScreen(app.lift, app.pose, hit.outer)
    return poly ? { poly, mode: 'remove' } : null
  }
  const found = loopAt(app.lift, app.pose, p)
  return found ? { poly: found.poly, mode: 'add' } : null
}

export function commitStroke(app: App, a: Pt, b: Pt, raw?: Pt[], press?: number, rawIn?: RawInput) {
  const s: Stroke = { id: app.nextId++, a, b }
  if (raw && raw.length > 2) {
    s.raw = raw
    // 점별 입력(web2-11 1-c)은 raw와 나란해야만 뜻이 있다 — 어긋나면 조용히 버린다
    // (캡처 쪽 결함이지 문서 손상이 아니다. file.ts의 «거부»와 다른 자리다).
    if (rawIn && Object.values(rawIn).every(arr => !arr || arr.length === raw.length)) s.rawIn = rawIn
  }
  if (!isDrawPose(app.pose)) s.view = { p: { ...app.pose.p }, q: { ...app.pose.q } }
  s.mat = { grade: activeGrade(app) }
  // 니브는 **잉크에만** 얹는다 — 연필 굵기는 경도가 정한다(재료가 다르다, 4-h)
  if (app.tool === 'pen' && app.nib !== C.NIB_PX) s.mat.w = app.nib
  if (press !== undefined) s.mat.press = press
  app.doc.strokes.push(s)
  // 작도 획(지평선·깊이선)은 실행취소 대상이 아니다 — role은 추가 후 계산으로 안다
  recompute(app)
  // ── 교점 정의(web2-13 4-g — 같은 깃발 뒤) — 사건은 커밋 순간 한 번이다 ────────
  // 방금 확정된 획의 «뗀 끝»이 방향 있는 대기선 위에서 끝났으면 그 대기선이 정의된다
  // (own3 — 이후 근거가 지워져도 유지). 그리는 중의 교차는 사건이 아니다.
  if (app.own3d) {
    const { defs, missed } = defineByTouch(app.lift, s, app.osnap.radius / app.view.s)
    // 무산도 센다(3-b의 규약 — 조용히 버리지 않는다. 진단 패널 「3D 경로」 줄이 보인다)
    app.touchStats.ok += missed.ok
    app.touchStats.pose += missed.pose
    app.touchStats.axis += missed.axis
    app.touchStats.lift += missed.lift
    app.touchStats.roundtrip += missed.roundtrip
    // 마지막 획의 단계 트레이스(web2-14 2번) — 「왜 아무 일도 안 났나」를 결과가 아니라
    // 단계로 읽게 한다: A 미승격(①)이면 닿음 판정 자체가 없었던 것이다.
    app.touchLast = {
      lifted: app.lift.lifted.has(s.id),
      touched: missed.ok + missed.pose + missed.axis + missed.lift + missed.roundtrip,
      ok: missed.ok,
    }
    if (defs.length > 0) {
      for (const d of defs) {
        const t = app.lift.strokes.get(d.id)
        if (t) t.own3 = d.own3
      }
      recompute(app)
    }
  }
  if (app.lift.an.roles.get(s.id) === 'content') {
    app.undoStack.push({ removed: [], added: [s] })
    app.redoStack = []
  }
  return s
}

function removeById(doc: Doc, id: number): { stroke: Stroke; index: number } | null {
  const i = doc.strokes.findIndex(s => s.id === id)
  if (i < 0) return null
  return { stroke: doc.strokes.splice(i, 1)[0]!, index: i }
}

export function undo(app: App) {
  const op = app.undoStack.pop()
  if (!op) return
  for (const s of op.added) removeById(app.doc, s.id)
  for (const r of [...op.removed].sort((a, b) => a.index - b.index)) {
    app.doc.strokes.splice(Math.min(r.index, app.doc.strokes.length), 0, r.stroke)
  }
  for (const f of op.facesAdded ?? []) {
    const i = app.doc.faces.findIndex(x => x.id === f.id)
    if (i >= 0) app.doc.faces.splice(i, 1)
  }
  for (const r of [...(op.facesRemoved ?? [])].sort((a, b) => a.index - b.index)) {
    app.doc.faces.splice(Math.min(r.index, app.doc.faces.length), 0, r.face)
  }
  app.redoStack.push(op)
  recompute(app)
}

export function redo(app: App) {
  const op = app.redoStack.pop()
  if (!op) return
  for (const r of op.removed) removeById(app.doc, r.stroke.id)
  app.doc.strokes.push(...op.added)
  for (const r of op.facesRemoved ?? []) {
    const i = app.doc.faces.findIndex(x => x.id === r.face.id)
    if (i >= 0) app.doc.faces.splice(i, 1)
  }
  for (const f of op.facesAdded ?? []) app.doc.faces.push(f)
  app.undoStack.push(op)
  recompute(app)
}

// ── 지우개 — 닿으면 그 조각이 사라진다 ────────────────────────────────────
// 승격 획은 3D 교차에서 나뉜 조각 단위, 대기 획은 통째.
// 매달린 것들의 처리: 삭제로 3D 결정을 잃은 획은 대기로 내려간다.
// 사라지지 않는다(불변식 j) — 사라지는 것은 지운 조각뿐이다.

export function beginErase(app: App) {
  app.activeErase = { removed: [], added: [] }
}

/** 지우개 종류 — 무엇을 지우는가(재료 필터). 사이드바 도구와 **펜의 지우개 끝**이
 *  같은 값을 쓴다(끝은 도구를 안 바꾸므로 인자로 온다 — web2-15 2-b). */
export type EraserKind = 'eraser-pencil' | 'eraser-ink'

export function eraseAt(app: App, p: Pt, kind?: EraserKind) {
  if (!app.activeErase) return
  // 인자가 없으면 사이드바 도구가 정한다(종전 동작 — 호출부를 안 고친다)
  const ek: EraserKind = kind ?? (app.tool === 'eraser-ink' ? 'eraser-ink' : 'eraser-pencil')
  const ps = pieces(app.lift, app.pose)
  // 지우개 반경은 화면 px — 문서 좌표에서는 배율로 나눈다
  const hits = ps.filter(x => distToPiece(p, x) <= app.eraserRadius / app.view.s)
  if (hits.length === 0) return
  const byStroke = new Map<number, Piece[]>()
  for (const h of hits) {
    const arr = byStroke.get(h.strokeId) ?? []
    arr.push(h)
    byStroke.set(h.strokeId, arr)
  }
  const op = app.activeErase
  for (const [id, hit] of byStroke) {
    // 작도 획은 지우개가 못 지운다 — 카메라는 별개다
    const role = app.lift.an.roles.get(id)
    if (role !== 'content') continue
    // 재료 필터 — 연필 지우개는 흑연만, 펜 지우개는 잉크만. 겹쳐 있어도 서로 안 건드린다.
    const target = app.lift.strokes.get(id)
    if (!target) continue
    if (ek === 'eraser-pencil' && isInk(target)) continue
    if (ek === 'eraser-ink' && !isInk(target)) continue
    const kept = ps.filter(x => x.strokeId === id && !hit.includes(x))
    const rm = removeById(app.doc, id)
    if (!rm) continue
    const newStrokes: Stroke[] = kept.map(k => {
      const s: Stroke = { id: app.nextId++, a: k.a, b: k.b }
      if (!isDrawPose(app.pose)) s.view = { p: { ...app.pose.p }, q: { ...app.pose.q } }
      if (target.mat) s.mat = { ...target.mat } // 조각도 같은 재료
      // 자립(web2-13 4부 — 깃발 켜짐에서만): own3 획의 조각은 **어버이의 3D 직선을
      // 승계한다**(4차 리뷰어 [46]) — 조각 끝점은 그 직선 위 점의 사영이므로 광선
      // 리프팅이 정확한 좌표를 준다(잉크 심판 유지). 안 하면 사슬이 끊긴 굳힘을
      // 지우개로 자르는 순간 조각이 대기로 추락한다([40]의 사촌).
      if (app.own3d && target.own3) {
        const d = sub3(target.own3.b, target.own3.a)
        const L = len3(d)
        if (L > 1e-12) {
          const dir = mul3(d, 1 / L)
          const pose = s.view ?? DRAW_POSE
          const ra = rayThrough(app.lift.an, pose, k.a)
          const rb = rayThrough(app.lift.an, pose, k.b)
          const a3 = ra ? closestOnLineToRay(target.own3.a, dir, ra) : null
          const b3 = rb ? closestOnLineToRay(target.own3.a, dir, rb) : null
          if (a3 && b3) s.own3 = { a: a3, b: b3, axis: target.own3.axis }
        }
      }
      return s
    })
    app.doc.strokes.push(...newStrokes)
    // 드래그 안에서 이미 만든 조각을 또 지우면 — 그 조각은 op에서 지우고 원본은 그대로
    const idxInAdded = op.added.findIndex(s => s.id === id)
    if (idxInAdded >= 0) op.added.splice(idxInAdded, 1)
    else op.removed.push(rm)
    op.added.push(...newStrokes)
  }
  recompute(app)
}

export function endErase(app: App) {
  const op = app.activeErase
  app.activeErase = null
  if (op && (op.removed.length > 0 || op.added.length > 0)) {
    app.undoStack.push(op)
    app.redoStack = []
  }
}

export function setPose(app: App, pose: CamPose) {
  app.pose = pose
  for (const l of app.listeners) l()
}

export function setView(app: App, v: ViewOffset) {
  app.view = v
  for (const l of app.listeners) l()
}

/** 작도 시점 — 포즈와 뷰 오프셋 둘 다 원래대로 */
export function resetPose(app: App) {
  app.view = { s: 1, ox: 0, oy: 0 }
  setPose(app, DRAW_POSE)
}

export function saveView(app: App, thumb?: string) {
  app.savedViews.push({
    pose: { p: { ...app.pose.p }, q: { ...app.pose.q } },
    view: { ...app.view },
    // 썸네일(web2-12 5번) — 저장 시점에 굽는다(㉮): 열 때 다시 그리려면 뷰마다 장면을
    // 재사영해야 해서 «펼치기»가 무거워진다. 파일이 커지는 몫은 실측 원장이 든다
    // (views_thumb_web2.json — .brnl은 선택 필드라 하위호환 그대로).
    ...(thumb ? { thumb } : {}),
  })
  for (const l of app.listeners) l() // 자동 저장이 듣는다
}

/** 뷰 삭제(web2-12 5번) — **실행취소 대상이 아니다**: 실행취소 스택은 문서(획·면)
 *  전용이고(경계 유지 — 비우기·치수와 같은 규칙), 뷰는 잃어도 다시 저장이 탭 하나라
 *  잃는 비용이 낮다(지시 문면 「뷰 삭제는 가볍다」를 이렇게 읽었다 — 근거는 NOTES). */
export function deleteView(app: App, i: number) {
  if (i < 0 || i >= app.savedViews.length) return
  app.savedViews.splice(i, 1)
  for (const l of app.listeners) l() // 자동 저장이 듣는다
}

/** .brnl 복원 — 문서·시점만 갈아끼우고 나머지는 전부 다시 계산 */
export function loadDoc(app: App, data: { doc: Doc; nextId: number; savedViews: App['savedViews'] }) {
  app.doc = data.doc
  app.nextId = data.nextId
  app.savedViews = data.savedViews
  app.undoStack = []
  app.redoStack = []
  app.pose = DRAW_POSE
  app.view = { s: 1, ox: 0, oy: 0 }
  recompute(app)
}

/** 비우기 — 그림도 작도도 전부 버리고 빈 상태로. **지평선 단계부터 다시 시작한다.**
 *
 *  실행취소로는 못 돌아온다 — 작도 획(지평선·깊이선)이 op에 안 들어가므로(위 규칙)
 *  op 하나로 되돌리려면 그 규칙부터 갈라야 한다. 그래서 실수 방지는 **확인 한 번**으로
 *  한다(A-3: 단순한 쪽). 확인 UI는 최상단 한 줄의 밑줄 단어다.
 *
 *  프레임(좌표계)은 **지금 창 크기로 새로 잡는다** — 빈 문서이므로 옛 프레임을 붙들 이유가
 *  없고, 다른 크기에서 그린 파일을 열었다 비운 경우 주점이 화면 가운데를 벗어난다. */
export function clearAll(app: App, W: number, H: number) {
  app.doc = emptyDoc(W, H)
  app.nextId = 1
  app.undoStack = []
  app.redoStack = []
  app.savedViews = []
  app.activeErase = null
  app.pose = DRAW_POSE
  app.view = { s: 1, ox: 0, oy: 0 }
  recompute(app)
}

export function gotoView(app: App, i: number) {
  const v = app.savedViews[i]
  if (!v) return
  app.view = { ...v.view }
  setPose(app, { p: { ...v.pose.p }, q: { ...v.pose.q } })
}

/** 조작 제스처 시작 — 감쇠 판정 동결(web2-14 3번: 돌리는 동안 아무 일도 안 일어난다).
 *  이미 동결 중이면(연속 제스처) 처음 값을 지킨다 — 매 프레임 갱신하면 동결이 아니다. */
export function beginNavHold(app: App) {
  if (!app.fadePose) app.fadePose = app.pose
}
/** 조작 제스처 끝 — 동결 해제·재판정 한 번. 왕복 제스처면 표시 변화 0~1회가 된다. */
export function endNavHold(app: App) {
  if (!app.fadePose) return
  app.fadePose = null
  for (const l of app.listeners) l()
}
/** 감쇠·질감의 «자기 시점» 판정이 읽는 포즈 — 제스처 중에는 동결값(단일 출처 #54) */
export const fadeRef = (app: Pick<App, 'fadePose' | 'pose'>): CamPose => app.fadePose ?? app.pose

/** 궤도 한 픽셀이 도는 각(rad) — 데스크톱·터치가 같은 값을 쓴다 */
export const ORBIT_RAD_PER_PX = 0.005

function rotateAroundPivot(app: App, axis: V3, angle: number, pivot: V3) {
  const R = quatAxisAngle(axis, angle)
  const p = add3(pivot, quatRotate(R, sub3(app.pose.p, pivot)))
  setPose(app, { p, q: quatMul(R, app.pose.q) })
}

/** **궤도** — 화면 이동량만큼 돈다. 세로는 세계 수직축, 가로는 카메라 오른쪽 축.
 *  입력(마우스 중버튼·손가락 하나)과 시험이 **같은 함수**를 부른다 — 갈리면 시험이
 *  앱을 안 재게 된다(`draft.ts`·`classifyNext`와 같은 이유). */
export function orbitBy(app: App, dx: number, dy: number) {
  if (app.lift.lifted.size === 0) return // 돌 것이 없다 — **소실점 개수가 아니라 기하의 유무다**
  const pivot = orbitPivot(app)
  rotateAroundPivot(app, v3(0, 1, 0), -dx * ORBIT_RAD_PER_PX, pivot)
  const right = quatRotate(app.pose.q, v3(1, 0, 0))
  rotateAroundPivot(app, right, -dy * ORBIT_RAD_PER_PX, pivot)
}

/** **궤도 반경** — 눈에서 pivot까지의 3D 거리. 궤도는 이 값을 **바꾸지 않는다**
 *  (pivot 둘레의 회전이므로 구성상 보존된다) — 그래서 이 값이 달라졌다면 사람이
 *  **줌으로 정한 것**이다. 접기가 그것을 지키는 근거가 여기 있다(`core/level.ts`). */
export const orbitRadius = (app: App): number => len3(sub3(app.pose.p, orbitPivot(app)))

/** **줌(돌리)** — 작도 포즈에서는 화면 배율(뷰 오프셋), 궤도 후에는 pivot을 향한 실제 이동.
 *
 *  입력(휠·두 손가락)과 시험이 **같은 함수**를 부른다(web2-06 지시 5). 초판은 이 계산이
 *  `input.ts` 안에 있어 **시험이 앱의 줌을 못 불렀다** — 「돌려보다 줌한 거리가 접으면
 *  사라진다」를 재려면 앱이 실제로 도는 경로가 필요했다(`orbitBy`를 옮긴 것과 같은 이유). */
export function dollyBy(app: App, scale: number, center: Pt) {
  if (isDrawPose(app.pose)) {
    const v = app.view
    const s = Math.min(8, Math.max(0.2, v.s * scale))
    const k = s / v.s
    setView(app, { s, ox: center.x - k * (center.x - v.ox), oy: center.y - k * (center.y - v.oy) })
    return
  }
  if (app.lift.lifted.size === 0) return
  const pivot = orbitPivot(app)
  const p = add3(pivot, mul3(sub3(app.pose.p, pivot), 1 / scale))
  setPose(app, { p, q: app.pose.q })
}

/** **팬** — 작도 포즈에서는 화면 이동, 궤도 후에는 카메라를 옆으로 옮긴다.
 *  ⚠ 궤도 중의 팬은 **접으면 되돌아간다**(앵커가 그때 것이 아니다). 줌과 달리 안 지키는
 *  이유는 잰 것이 없어서다 — `DEFERRED.md`에 조건과 함께 있다. */
export function panBy(app: App, dx: number, dy: number) {
  if (isDrawPose(app.pose)) {
    const v = app.view
    setView(app, { s: v.s, ox: v.ox + dx, oy: v.oy + dy })
    return
  }
  if (app.lift.lifted.size === 0) return
  const pivot = orbitPivot(app)
  const view = quatRotate(app.pose.q, v3(0, 0, -1))
  const depth = Math.max(1, dot3(sub3(pivot, app.pose.p), view))
  const k = depth / (app.lift.an.f ?? 1000)
  const right = quatRotate(app.pose.q, v3(1, 0, 0))
  const up = quatRotate(app.pose.q, v3(0, 1, 0))
  const p = add3(app.pose.p, add3(mul3(right, -dx * k), mul3(up, dy * k)))
  setPose(app, { p, q: app.pose.q })
}

/** **궤도 중심 — 펜으로 딴 선의 경계 상자 중심**(web2-06 지시 4). 펜이 없으면 연필로 대신한다.
 *
 *  ⚠ 초판은 **승격 기하 전체의 무게중심**이었고, 그래서 «연필 구축선»이 중심을 끌어갔다.
 *  구축선은 소실점 쪽으로 길게 뻗으므로 깊이가 크다 — 소실점 가까이서 끝나는 유도선 하나가
 *  3D에서 83 단위 뒤에 서고, 그것 하나로 반경이 **17.335**가 됐다(실측 픽스처).
 *  펜 획만 보면 **7.274**다. 결과물은 펜으로 딴 선이므로 **그것이 돌려볼 대상**이다.
 *
 *  **무게중심이 아니라 경계 상자 중심이다**(지시의 말 그대로): 무게중심은 획 밀도에 끌린다 —
 *  한 귀퉁이를 촘촘히 따면 중심이 그리로 간다. 경계 상자는 «어디까지 그렸나»만 본다.
 *
 *  ⚠⚠ **펜이 없으면 «무게중심»으로 돌아간다 — 경계 상자가 아니다**(web2-06 1차 리뷰어 [9]).
 *  초판은 펜이 없을 때도 경계 상자였고, 그러면 그 구축선 하나가 상자를 통째로 늘려
 *  반경이 **52.087**이 됐다(무게중심 17.335의 3배). **그것은 사람이 보고한 증상과 같은
 *  방향**이다 — 「반경이 너무 길어진다」를 고치는 항목이 펜 이전 구간에서 그것을 3배로
 *  키운 셈이다. 지시의 「경계 상자」는 **무엇을 넣고 뺄지**의 말이고(「연필 구축선은 경계
 *  상자에서 뺀다」), 「펜 선이 없으면 연필로 **대신한다**」는 **종전 규칙으로 돌아간다**로
 *  읽는 것이 측정과 맞는다(D-4: 측정이 사람이 준 근거를 포함해 우선한다).
 *  그래서 갈래가 둘이고, 둘 다 팔이 수를 낸다(`test/pivot.test.ts`).
 *
 *  저장하지 않는다 — 매번 계산이다(원칙 b). 펜 획을 지우면 그 즉시 연필로 돌아간다. */
export function orbitPivot(app: App): V3 {
  const segs = [...app.lift.lifted]
  if (segs.length === 0) {
    const f = app.lift.an.f ?? 1000
    return add3(DRAW_POSE.p, v3(0, 0, -f)) // 눈 앞 f — 눈은 원점이 아니다
  }
  const ink = segs.filter(([id]) => {
    const s = app.lift.strokes.get(id)
    return s ? isInk(s) : false
  })
  if (ink.length === 0) {
    // 펜이 없다 — **종전 규칙(무게중심) 그대로**. 회귀를 안 만든다(위 ⚠⚠).
    let x = 0, y = 0, z = 0
    for (const [, g] of segs) { x += g.a3.x + g.b3.x; y += g.a3.y + g.b3.y; z += g.a3.z + g.b3.z }
    const n = segs.length * 2
    return v3(x / n, y / n, z / n)
  }
  let lo = v3(Infinity, Infinity, Infinity), hi = v3(-Infinity, -Infinity, -Infinity)
  for (const [, g] of ink) {
    for (const p of [g.a3, g.b3]) {
      lo = v3(Math.min(lo.x, p.x), Math.min(lo.y, p.y), Math.min(lo.z, p.z))
      hi = v3(Math.max(hi.x, p.x), Math.max(hi.y, p.y), Math.max(hi.z, p.z))
    }
  }
  return v3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
}
