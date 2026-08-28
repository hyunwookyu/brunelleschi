// 앱 상태 — 문서(획 목록)와 뷰 포즈. 카메라·소실점·리프팅은 전부 계산으로 나온다.
//
// 실행취소는 op 단위다: 획 추가 op, 지우개 한 번의 드래그 op.
// 그림만 되돌린다 — 작도(카메라)는 op에 들어가지 않는다.

import { emptyDoc, DRAW_SHEET_ID, onPaper, type Doc, type Stroke, type Face, type Sheet, type Layer, type Underlay, type Paper, type CamPose, type ViewOffset, type Grade, type RawInput } from '../core/types'
import { isInk } from '../core/material'
export type { ViewOffset }
import { liftAll, closestOnLineToRay, type LiftResult } from '../core/lift'
import { camSig, defineByTouch, emptyTouchStats, type TouchStats } from '../core/own3d'
import { DRAW_POSE, rayThrough } from '../core/camera'
import { defaultOsnap, type OsnapSettings, type OsnapKind } from '../core/osnap'
import { newExtDwell, clearExtAcq, type ExtDwell } from '../core/extacq'
import { rng32 } from '../core/material'
import { pieces, distToPiece, type Piece } from '../core/pieces'
import { rdpIndices, distToPolyline } from '../core/freehand'
import { loopAt, faceAt, faceScreen, resolveFaces, resolveFace, allLoops, inPoly, type ResolvedFace, type LoopCandidate } from '../core/face'
import { bakeUnderlay } from '../core/make2d'
import { geomSize3 } from '../core/osnap'
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
 *  ⚠ 작도 획 제외('horizon'·'vp')는 **web2-19 1부가 없앴다** — 'horizon'은 web2-17부터
 *  죽은 가지였고, 'vp'는 이제 진짜 모서리다(방 실루엣의 후퇴선은 벽 모서리이면서 소실점을
 *  만든다 — 확정되면 재료 질감으로 그려지므로 미리보기도 같아야 한다. 원칙 d).
 *  카메라 미확정(f 없음) 제외 — Line2 역사영이 설 수 없다(그때는 종전 벡터 미리보기). */
export const draftBrushed = (app: Pick<App, 'tool' | 'grade' | 'renderer' | 'lift' | 'activeLayer'>): boolean =>
  app.renderer === 'brush' && activeGrade(app) !== 'INK' &&
  // 활성 겹 위의 draft(web2-20 3부)는 벡터 미리보기(#ink — 막 **위**)로 간다: brush 겹
  // (#brushc)은 막 아래라 긋는 동안 막에 물들고 떼는 순간 위로 튄다. 질감은 뗄 때
  // #layerc 경로로(지금은 몸체만 — 알려진 강등, filmlayer 머리주석).
  app.activeLayer === null &&
  app.lift.an.f !== null && app.lift.an.principal !== null

/** 지우개 도구인가 — 입력·커서·렌더가 전부 이것을 본다.
 *  `tool !== 'pen'` 으로 재던 초판은 연필 도구가 생기면서 그대로 깨진다. */
export const isEraser = (t: Tool): boolean => t === 'eraser-pencil' || t === 'eraser-ink'

/** **활성 겹이 옐로인가**(web2-22 1부) — 옐로를 얹으면 «자가 치워진» 것이다(대응표 §4의
 *  답): 입력이 오스냅·축 스냅·소실점 경로를 통째로 우회하고, 2부의 후행 확정(머무름)이
 *  이 갈래에서만 돈다. 판정 출처는 Layer.paper 하나(#54 — 새 필드 ⛔). */
export const yellowActive = (app: Pick<App, 'doc' | 'activeLayer'>): boolean => {
  const l = app.doc.layers.find(x => x.id === app.activeLayer)
  return !!l && l.paper === 'yellow'
}

export interface Op {
  removed: { stroke: Stroke; index: number }[]
  added: Stroke[]
  /** 면 지정·해제도 실행취소 대상이다 — 사람이 한 것이므로(작도와 다르다) */
  facesAdded?: Face[]
  facesRemoved?: { face: Face; index: number }[]
  /** 겹 삭제(web2-20 2-c) — 그 위의 획이 같이 가므로 **실행취소 대상**이다(지우개와
   *  같은 급). 겹 자체도 op에 실려 되돌아온다. */
  layersRemoved?: { layer: Layer; index: number }[]
  /** 겹과 함께 간 밑그림(web2-23 2-c ⚠) — 겹을 지우면 그 밑그림도 가고 **실행취소로
   *  같이 돌아온다**. 겹과 짝이므로 언제나 layersRemoved와 함께 실린다. */
  underlaysRemoved?: { underlay: Underlay; index: number }[]
  /** 종이 삭제(web2-20 2-c — 규약 변경): 겹이 하나라도 있으면 획이 딸려 가므로
   *  실행취소 대상이 된다. web2-19의 「종이 삭제는 실행취소 밖」은 겹이 없을 때만 남는다. */
  sheetRemoved?: { sheet: Sheet; index: number }
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
  /** **작도 시점**(web2-17 3-b) — 첫 획을 긋던 순간의 `view`. 팬으로 선언한 눈높이가
   *  화면 어디였는가다. null = 아직 선언 전(빈 문서)이거나 옛 파일(2부 변환을 지난 문서).
   *  ⚠ `Doc`이 아니라 여기(App/BrnlData 층)다 — `savedViews`와 같은 급이고, `Doc`은
   *  획·면·치수만 갖는다는 경계를 이 회차가 안 흔든다(반대 의견 「그림의 선언이니 Doc이
   *  맞다」는 NOTES에 근거와 함께 기각 기록). */
  drawView: ViewOffset | null
  /** 조작 제스처(궤도·팬) 동안 대기 획 감쇠 판정을 **동결**하는 포즈(web2-14 3번) —
   *  null이면 실시간(app.pose). 잡는 순간 굳고 놓으면 풀린다: 돌리는 동안 대기 획의
   *  표시 상태가 아무것도 안 바뀐다(실기기 판정 「돌릴 때 깜빡여 성가시다」의 수리).
   *  ⚠ 표시 계층(render2d·brushlayer의 감쇠·질감 판정)만 읽는다 — 교점 사건(4-g)의
   *  atOwnPose는 획끼리의 포즈 비교라 이것과 무관하다. 감쇠 자체는 그대로다(1-e —
   *  떨림만 없앤다). 읽기는 fadeRef() 하나다(#54). */
  fadePose: CamPose | null
  /** 제스처 동안 지평선 자동 숨김 판정의 **뷰 동결**(web2-17 5-b ⚠) — 팬은 포즈가 아니라
   *  `view`를 움직이므로 fadePose만으로는 판정이 제스처 중에 떨린다. 잡는 순간 굳고
   *  놓으면 풀린다(fadePose와 한 쌍 — beginNavHold/endNavHold). 읽기는 fadeRefView 하나다. */
  fadeView: ViewOffset | null
  /** **활성 종이**(web2-19 2부) — Doc.sheets 중 하나의 id. 하나만 활성이다(지시 2-a).
   *  런타임 상태라 저장하지 않는다(파일을 열면 작도 종이에서 시작한다). */
  activeSheet: number
  /** **활성 겹**(web2-20 2부) — 새 획이 그리로 간다. null = 종이에 직접. 활성 종이의
   *  겹만 가리킬 수 있고 종이를 바꾸면 null로 돌아온다. 런타임 상태 — 저장 안 함. */
  activeLayer: number | null
  /** **솔로**(web2-25 4-a) — 「그것만 보기」. Procreate 가 표시 체크박스를 길게 눌러 하는
   *  것이고, 대안 하나만 놓고 보고 싶을 때 정확히 필요한 동작이다.
   *  ⚠ **새 게이트를 안 만들었다**(#54): 솔로 = «나머지를 끈 것»이므로 `setLayerOn`을
   *  그대로 부르고, 되돌릴 켬/끔을 `prev`에 기억한다. 그래서 「꺼진 겹이 3D에서 빠진다」
   *  (web2-20 4-b)에 **자동으로 같이 걸린다** — 판단 근거는 `DECISIONS.md` D-W12 [6].
   *  런타임 상태 — 저장 안 함(문서에 남는 것은 그 결과인 `on`뿐이다). */
  solo: { layer: number; prevOn: [number, boolean][]; prevActive: number | null } | null
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
  /** 지평선 표시(web2-12 7번 → **web2-17 5부: 자동 숨김**) — `null` = 자동(기본):
   *  소실점이 하나 이상 있고 **그 첫 소실점이 화면 안**이면 숨는다(사람 문면 — 소실점이
   *  보이면 눈높이를 그것으로 읽는다. 화면 밖으로 나가면 읽을 길이 없어 다시 보인다).
   *  `true/false` = 사람이 체크박스로 정했다 — 그 뒤로 자동이 안 건드린다.
   *  판정 함수는 `render2d.horizonVisible` 하나다(✕ 컬링과 같은 «화면 안» — 원칙 a).
   *  카메라·판정은 어느 쪽이든 그대로다(표현 계층). */
  horizonPref: boolean | null
  /** 지면 격자 표시 — **기본 꺼짐**(지시 3-a). 토글은 설정에 남는다.
   *  이 도구는 모델링 툴이 아니라 그림 도구다 — 빈 종이에 격자가 깔려 있으면
   *  CAD의 감각이 된다. 필요한 사람이 켠다. */
  grid: boolean
  /** 대기 획 시점 감쇠(web2-13 3-a) — **기본 켜짐**(새 동작: 자기 시점 밖 `WAIT_FADE_DEG`
   *  에서 0 도달). 끄면 종전 동작(항상 그리되 흐림 0.3) **그대로**다(A-4 — 되돌릴 길.
   *  실기기 판정은 DEFERRED web2-13 표). 설정 「대기 획은 그린 시점에서만」. */
  waitFade: boolean
  /** **밑그림의 가린 선을 보이는가**(web2-23 2-a) — 기본 **켜짐**: 은선이 보이는 편이
   *  제도에 가깝고(가린 선 = H), 빼는 것은 정리된 그림을 원할 때다(사람의 문면
   *  「옵션에 따라」). 표시 팝오버의 「가린 선(은선)」. ⚠ **표시 손잡이일 뿐이다** —
   *  굽기 결과(`Doc.underlays`)는 안 바뀐다(끄고 켜도 다시 안 굽는다: 2-c). */
  showHidden: boolean
  /** 3부 안내를 **이미 띄웠는가** — 「면이 없어 뒤엣선이 다 보인다」는 **한 번만** 뜬다
   *  (매번 뜨면 잔소리가 된다 — 지시 3부 ⚠). 런타임 상태라 저장하지 않는다. */
  underlayNoticed: boolean
  /** **연장선 획득 상태**(web2-18 2부) — 어떤 끝점 위에 머물러 그 선의 연장을 켰는가.
   *  `ext` 오스냅은 이제 여기 있는 선분에서만 난다(`osnap`의 `extAcq` 인자).
   *  획을 확정하면 비운다(`commitStroke`). 표시는 render2d의 획득 표식이다.
   *  ⚠ 파생이 아니라 **입력 맥락**이다(원칙 b의 예외가 아니다 — 저장하지 않는다:
   *  문서에도 .brnl에도 안 들어가고 세션 안에서만 산다. `fadePose`와 같은 급이다). */
  extAcq: ExtDwell
  /** **마지막 확정 획의 스냅 종류**(web2-18 2-c) — 사람이 「정확히 어떤 오스냅 때문인지
   *  모르겠다」고 했다. 그것을 앱이 말한다. 값은 앱이 실제로 쓴 `OsnapHit.kind`를 그대로
   *  둔 것이다 — 표시용으로 다시 계산하지 않는다(원칙 a). 읽는 곳은 진단 패널뿐이다. */
  lastSnap: { start: OsnapKind | null; end: OsnapKind | null } | null
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
  touchLast: { lifted: boolean; touched: number; ok: number; missed: TouchStats } | null
  /** **면 일괄 후보**(web2-21 4부) — 「전부 찾기」가 낸 «아직 물어보는 중»의 목록.
   *  런타임 상태(저장 안 함). null = 후보 모드 아님. 표시는 **테두리만**(4-d — 확정된
   *  면만 채운다), 탭은 배제(4-a — 지정의 방향이 「배제」다), 확정이 한 op로 담는다.
   *  문서가 바뀌면(recompute) 자동으로 버려진다 — 낡은 후보를 안 남긴다. */
  faceCandidates: LoopCandidate[] | null
  /** **겹 가장자리 손잡이**(web2-24 4-d) — 테두리 상시 선이 없어지면서(색조 경계가
   *  가장자리다 — 사람이 web2-21 3-b를 뒤집었다) rect 끌기의 손잡이가 사라졌다.
   *  포인터가 활성 겹 가장자리 **가까이 갔을 때만**(입력이 tryRectDrag와 같은 판정으로
   *  채운다) 그 변을 옅게 그린다 — 순간 피드백이라 상시 표시와 대역이 다르다(색 규칙
   *  그대로). 런타임 상태 — 저장 안 함. */
  rectHover: { id: number; edges: { l: boolean; r: boolean; t: boolean; b: boolean } } | null
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
    drawView: null,
    fadePose: null,
    fadeView: null,
    activeSheet: DRAW_SHEET_ID,
    solo: null,
    activeLayer: null,
    dimSnap: false,
    dimSnapStep: 50,
    dimExact: false,
    coalesce: true,
    renderer: 'brush',
    horizonPref: null,
    grid: false,
    waitFade: true,
    showHidden: true,       // 기본은 H로 표시(2-a — 은선이 보이는 편이 제도에 가깝다)
    underlayNoticed: false,
    extAcq: newExtDwell(),
    lastSnap: null,
    strayCount: 0,
    own3d: true,   // 기본 켜짐(web2-14 1번 — 사람 판정). 끄는 길은 설정 + localStorage 'off'.
    lastCamSig: null,
    touchStats: emptyTouchStats(),
    touchLast: null,
    faceCandidates: null,
    rectHover: null,
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

export type DimResult = 'scale' | 'applied' | 'no3d' | 'none' | 'baseScale'

/** 획 id에 치수 mm를 싣는다. 무스케일 상태의 첫 적용이 곧 스케일 확정이다(기하 불변). */
export function setDimension(app: App, id: number, mm: number): DimResult {
  const s = app.doc.strokes.find(x => x.id === id)
  if (!s || !(mm > 0) || !isFinite(mm)) return 'none'
  const wasScaled = app.lift.mmPerUnit !== null
  if (!wasScaled && !app.lift.lifted.has(id)) return 'no3d'  // 스케일을 정할 길이가 없다
  s.dim = mm
  // 스케일은 바탕 종이가 정한다(web2-21 1-b) — 겹 획은 scaleRef가 못 된다. 치수는
  // 남는다(바탕이 스케일을 정하면 그 스케일로 «읽히는» 값이다 — lift의 dim 적용 그대로).
  // 호출부가 'baseScale'로 한 줄 안내를 띄운다: 「축척은 바탕 종이의 치수가 정한다」.
  if (!wasScaled && !onPaper(s)) { recompute(app); return 'baseScale' }
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

/** **닮음 합성**(web2-17 3-c) — 프레임 맞춤(fit)과 작도 시점(draw)은 둘 다 (s, o) 닮음이라
 *  합성된다: 문서 → draw 화면 → fit 창. `s = s_fit·s_draw`, `o = s_fit·o_draw + o_fit`.
 *  둘 중 하나를 덮어쓰면 다른 창 크기에서 연 파일이 구도를 잃거나 화면 밖으로 나간다 —
 *  합성 함수는 여기 하나다(원칙 a). `fitViewToFrame`(main.ts)과 팔이 같이 부른다. */
export const composeView = (fit: ViewOffset, draw: ViewOffset): ViewOffset =>
  ({ s: fit.s * draw.s, ox: fit.s * draw.ox + fit.ox, oy: fit.s * draw.oy + fit.oy })

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
  // 문서가 바뀌면 면 일괄 후보는 낡는다(4부) — 조용히 낡은 폴리곤을 들고 있지 않는다.
  // commitCandidates는 recompute 뒤에 볼일이 없으므로 이 무효화가 확정도 겸해 닫는다.
  app.faceCandidates = null
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

// ── 면 일괄(web2-21 4부) — 전부 켜고 빼기 ──────────────────────────────────

/** 「전부 찾기」 — 모든 평면의 닫힌 영역을 후보로 세운다. 이미 면인 것(외곽 동일)과
 *  풀리지 않을 것(비평면 등 — resolveFace가 거부할 것)은 후보에서 뺀다(조용히 틀린
 *  입체를 만들지 않는다 — toggleFaceAt의 사후 검사를 사전으로). 반환 = 후보 수. */
export function findAllFaces(app: App): number {
  const sigOf = (loop: Face['loops'][number]): string =>
    loop.edges.map(e => e.s).sort((a, b) => a - b).join(',')
  const existing = new Set(app.doc.faces.map(f => sigOf(f.loops[0]!)))
  const size3 = geomSize3(app.lift)
  const cands = allLoops(app.lift, app.pose).filter(c =>
    !existing.has(sigOf(c.loops[0]!)) &&
    resolveFace(app.lift, { id: -1, loops: c.loops }, size3) !== null)
  app.faceCandidates = cands
  for (const l of app.listeners) l()
  return cands.length
}

/** 후보 배제 — 탭한 자리를 둘러싼 후보 하나를 뺀다(4-a: 아닌 것만 탭해서 뺀다).
 *  여럿이 겹치면 화면에서 가장 작은 것(loopAt의 «작은 것» 규칙과 같은 방향). */
export function excludeCandidateAt(app: App, p: Pt): boolean {
  if (!app.faceCandidates) return false
  let best = -1, bestArea = Infinity
  app.faceCandidates.forEach((c, i) => {
    if (!inPoly(p, c.poly)) return
    const a = Math.abs(c.poly.reduce((s2, q, k) => {
      const r = c.poly[(k + 1) % c.poly.length]!
      return s2 + q.x * r.y - r.x * q.y
    }, 0) / 2)
    if (a < bestArea) { best = i; bestArea = a }
  })
  if (best < 0) return false
  app.faceCandidates.splice(best, 1)
  for (const l of app.listeners) l()
  return true
}

/** 후보 확정 — 남은 후보 전부가 **한 op**로 면이 된다(4-e: 실행취소 한 번에 전체).
 *  반환 = 만든 면 수. */
export function commitCandidates(app: App): number {
  const cands = app.faceCandidates
  if (!cands || cands.length === 0) { app.faceCandidates = null; return 0 }
  const added: Face[] = []
  for (const c of cands) {
    const face: Face = { id: app.nextId++, loops: c.loops }
    app.doc.faces.push(face)
    added.push(face)
  }
  recompute(app)   // 후보도 여기서 비워진다
  // 사후 안전망 — 안 풀린 것이 있으면 뺀다(찾기에서 걸렀으므로 정상 경로에서는 0)
  for (let i = added.length - 1; i >= 0; i--) {
    if (!app.faces.some(f => f.id === added[i]!.id)) {
      const j = app.doc.faces.findIndex(f => f.id === added[i]!.id)
      if (j >= 0) app.doc.faces.splice(j, 1)
      added.splice(i, 1)
    }
  }
  if (added.length === 0) { recompute(app); return 0 }
  app.undoStack.push({ removed: [], added: [], facesAdded: added })
  app.redoStack = []
  return added.length
}

/** 후보 취소 — 아무 일도 안 한 것으로 */
export function cancelCandidates(app: App) {
  if (app.faceCandidates === null) return
  app.faceCandidates = null
  for (const l of app.listeners) l()
}

export function commitStroke(app: App, a: Pt, b: Pt, raw?: Pt[], press?: number, rawIn?: RawInput) {
  // 첫 획인가 — **밀어 넣기 전의 길이로 판정한다**(web2-17 3-b ⚠ — 순서를 팔이 지킨다).
  const firstStroke = app.doc.strokes.length === 0
  const s: Stroke = { id: app.nextId++, a, b }
  if (yellowActive(app) && raw && raw.length > 2) {
    // 옐로(web2-24 4-b) — **raw가 정본 기하다**(프리핸드): 확정 시점에 눈에 안 보이는
    // 임계(C.RAW_SIMPLIFY_PX 화면 px)로 RDP 솎아 싣는다(합쳐진 포인터 사건은 한 획에
    // 수백 점 — 파일 몫은 yellowraw_web2 원장). 머무름 갈음(입력이 [a,b]를 보낸다 —
    // 22 2부·D-W10 «raw 소멸»)과 솎은 뒤 2점이 되는 직선 손 획은 raw를 **안** 싣는다 —
    // 2점 raw는 {a,b}와 동치라 정보가 없다(정본 기하가 현이면 현이 정본이다).
    // rawIn은 **같은 인덱스**로 나란히 골라낸다(file.ts의 «길이 같음» 불변식).
    const keep = rdpIndices(raw, C.RAW_SIMPLIFY_PX / app.view.s)
    if (keep.length > 2) {
      s.raw = keep.map(i => ({ ...raw[i]! }))
      if (rawIn && Object.values(rawIn).every(arr => !arr || arr.length === raw.length)) {
        // **옐로는 press만 싣는다**(web2-25 5-b) — 파일 크기의 표가 지목한 자리다.
        // 근거(`filesize25_web2.json` components_utf8): 점렬 좌표 다음으로 큰 몫이 rawIn이고
        // 그 안에서 tilt·twist가 press의 세 배다(축이 셋이므로). 그리고 **읽는 자리가
        // 없다** — 렌더는 `brushmap.ts`의 `rawIn.press` 하나만 본다(grep으로 확인 · D-4).
        // ⚠ **트레이싱지·바탕은 안 건드린다**(지시 5-b ⛔ — 아래 갈래 그대로): 그쪽 raw는
        //   솎지도 않는 «질감·필압용 원본»이고, 사람이 그 자리를 나중에 쓰겠다고 정했다.
        s.rawIn = { press: keep.map(i => rawIn.press?.[i] ?? 0) }
      }
    }
  } else if (raw && raw.length > 2) {
    // 트레이싱지·바탕 — 종전 그대로(§1: 확정 기하는 {a,b}, raw는 질감·필압용 · 솎지
    // 않는다 — 4-b ⚠ «프리핸드는 옐로만이다»).
    s.raw = raw
    // 점별 입력(web2-11 1-c)은 raw와 나란해야만 뜻이 있다 — 어긋나면 조용히 버린다
    // (캡처 쪽 결함이지 문서 손상이 아니다. file.ts의 «거부»와 다른 자리다).
    if (rawIn && Object.values(rawIn).every(arr => !arr || arr.length === raw.length)) s.rawIn = rawIn
  }
  if (!isDrawPose(app.pose)) s.view = { p: { ...app.pose.p }, q: { ...app.pose.q } }
  // 겹 소속(web2-20 2부) — 활성 겹이 있으면 새 획이 그리로 간다. 잠긴·꺼진 겹으로는
  // 안 간다(잠금 = 편집 막힘·끔 = 3D 밖 — setActiveLayer가 그 상태를 안 만들지만
  // 문서를 연 직후 등 경계에서 한 번 더 지킨다).
  if (app.activeLayer !== null) {
    const lay = app.doc.layers.find(l => l.id === app.activeLayer)
    // **소유는 예외가 없다**(web2-26 1번) — 활성 겹이 이 종이에 있으면 새 획은 그 겹의
    // 것이다. 종전에는 켬·잠금까지 함께 물어 셋 중 하나가 어긋나면 획이 **소리 없이
    // 종이로 떨어졌다**(오염의 두 번째 입구 — 첫째는 지우개 조각). 켬·잠금은 «편집이
    // 되는가»의 축이고 소유와 다른 축이다(web2-20 4부의 문면 그대로).
    if (lay && lay.sheet === app.activeSheet) s.layer = lay.id
    if (lay && lay.on && !lay.locked && lay.sheet === app.activeSheet) {
      // 종이 밖에 그으면 rect가 자란다(2-b) — **확정 시점에**(미리보기 중에 자라면
      // 산만하다 — 지시 문면). 획의 문서 bbox(raw 포함)로 합집합.
      const xs = [a.x, b.x, ...(raw ?? []).map(p2 => p2.x)]
      const ys = [a.y, b.y, ...(raw ?? []).map(p2 => p2.y)]
      const x0 = Math.min(lay.rect.x, ...xs), y0 = Math.min(lay.rect.y, ...ys)
      const x1 = Math.max(lay.rect.x + lay.rect.w, ...xs), y1 = Math.max(lay.rect.y + lay.rect.h, ...ys)
      lay.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    }
  }
  s.mat = { grade: activeGrade(app) }
  // 니브는 **잉크에만** 얹는다 — 연필 굵기는 경도가 정한다(재료가 다르다, 4-h)
  if (app.tool === 'pen' && app.nib !== C.NIB_PX) s.mat.w = app.nib
  if (press !== undefined) s.mat.press = press
  app.doc.strokes.push(s)
  // 획을 확정하면 **연장선 획득을 비운다**(web2-18 2-b) — 다음 획은 처음부터 다시
  // 획득한다. 안 비우면 지난 획에서 켠 연장이 다음 획 내내 떠 있어 종전 증상이 반쯤
  // 돌아온다(상시는 아니지만 «내가 지금 켠 것»도 아닌 상태).
  clearExtAcq(app.extAcq)
  // **첫 획이 시점을 굳힌다**(web2-17 3-b) — 그 순간의 팬(눈높이 선언)이 «작도 시점»이다.
  if (firstStroke) app.drawView = { ...app.view }
  // 작도 획(깊이선·소실점 표식)은 실행취소 대상이 아니다 — role은 추가 후 계산으로 안다
  recompute(app)
  // ── 교점 정의(web2-13 4-g — 같은 깃발 뒤) — 사건은 커밋 순간 한 번이다 ────────
  // 방금 확정된 획의 «뗀 끝»이 방향 있는 대기선 위에서 끝났으면 그 대기선이 정의된다
  // (own3 — 이후 근거가 지워져도 유지). 그리는 중의 교차는 사건이 아니다.
  if (app.own3d) {
    const { defs, missed } = defineByTouch(app.lift, s, app.osnap.radius / app.view.s)
    // 무산도 센다(3-b의 규약 — 조용히 버리지 않는다. 진단 패널 「3D 경로」 줄이 보인다)
    for (const k of Object.keys(missed) as (keyof TouchStats)[]) app.touchStats[k] += missed[k]
    // 마지막 획의 단계 트레이스(web2-14 2번) — 「왜 아무 일도 안 났나」를 결과가 아니라
    // 단계로 읽게 한다: A 미승격(①)이면 닿음 판정 자체가 없었던 것이다.
    // ⚠ touched의 합에 noCam·aNot3d가 **들어간다**(2-b) — 문 안에서 죽은 것은 전부
    // 트레이스에 보인다. missed 원본도 들고 간다(진단 패널이 사유별로 보인다).
    app.touchLast = {
      lifted: app.lift.lifted.has(s.id),
      touched: (Object.keys(missed) as (keyof TouchStats)[]).reduce((n, k) => n + missed[k], 0),
      ok: missed.ok,
      missed: { ...missed },
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
  // 종이·겹 복원(web2-20 2-c) — 종이 먼저(겹이 종이를 가리킨다), 겹은 원래 자리로
  if (op.sheetRemoved) {
    app.doc.sheets.splice(Math.min(op.sheetRemoved.index, app.doc.sheets.length), 0, op.sheetRemoved.sheet)
  }
  for (const r of [...(op.layersRemoved ?? [])].sort((a, b) => a.index - b.index)) {
    app.doc.layers.splice(Math.min(r.index, app.doc.layers.length), 0, r.layer)
  }
  for (const r of [...(op.underlaysRemoved ?? [])].sort((a, b) => a.index - b.index)) {
    app.doc.underlays.splice(Math.min(r.index, app.doc.underlays.length), 0, r.underlay)
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
  // 겹·종이 재삭제(web2-20 2-c) — 겹 먼저, 종이 나중(복원의 역순)
  for (const r of op.underlaysRemoved ?? []) {
    const i = app.doc.underlays.findIndex(x => x.layer === r.underlay.layer)
    if (i >= 0) app.doc.underlays.splice(i, 1)
  }
  for (const r of [...(op.layersRemoved ?? [])].sort((a, b) => b.index - a.index)) {
    const i = app.doc.layers.findIndex(x => x.id === r.layer.id)
    if (i >= 0) app.doc.layers.splice(i, 1)
    if (app.activeLayer === r.layer.id) app.activeLayer = null
  }
  if (op.sheetRemoved) {
    const i = app.doc.sheets.findIndex(x => x.id === op.sheetRemoved!.sheet.id)
    if (i > 0) {
      app.doc.sheets.splice(i, 1)
      if (app.activeSheet === op.sheetRemoved.sheet.id) gotoSheet(app, app.doc.sheets[0]!.id)
    }
  }
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
  // 옐로(web2-24 4-b) — 옐로 획은 lift 밖(2D)이라 조각 목록에 없다: 정본 기하(raw
  // 점렬)를 **따라** 직접 잰다(현으로 재면 곡선 안쪽이 안 지워지고 현이 지워진다 —
  // yellowraw.test ⑥). 층 규칙(활성 층의 획만 — web2-21 2부)은 그대로다. 부분 지우기는
  // 안 한다 — 대기 획과 같은 «통째» 규약(깊이/조각 기전이 없는 2D 획의 선례 그대로).
  if (yellowActive(app)) {
    const rad = app.eraserRadius / app.view.s
    const op = app.activeErase
    let removedAny = false
    for (const st of [...app.doc.strokes]) {
      if (st.layer !== app.activeLayer) continue
      if (ek === 'eraser-pencil' && isInk(st)) continue
      if (ek === 'eraser-ink' && !isInk(st)) continue
      if (distToPolyline(p, st.raw ?? [st.a, st.b]) > rad) continue
      const rm = removeById(app.doc, st.id)
      if (!rm) continue
      removedAny = true
      const idxInAdded = op.added.findIndex(x => x.id === st.id)
      if (idxInAdded >= 0) op.added.splice(idxInAdded, 1)
      else op.removed.push(rm)
    }
    if (removedAny) recompute(app)
    return
  }
  const ps = pieces(app.lift, app.pose)
  // 지우개 반경은 화면 px — 문서 좌표에서는 배율로 나눈다
  const hits = ps.filter(x => distToPiece(p, x) <= app.eraserRadius / app.view.s)
  if (hits.length === 0) return
  const byStroke = new Map<number, Piece[]>()
  // 잠긴 겹의 획은 안 지운다(web2-20 4부 — 잠금 = 편집만 막힘. 꺼진 겹은 리프팅에서
  // 빠져 조각 자체가 없다 — 여기 걸리는 것은 잠금뿐이다).
  const lockedLayers = new Set(app.doc.layers.filter(l => l.locked).map(l => l.id))
  for (const h of hits) {
    const st = app.doc.strokes.find(s2 => s2.id === h.strokeId)
    if (st?.layer !== undefined && lockedLayers.has(st.layer)) continue
    // 지우개는 **활성 층의 획만** 지운다(web2-21 2부 — 겹은 아래를 안 바꾼다):
    // 트레이싱지를 통해 밑그림을 지울 수 없다. 아래를 고치려면 그 층으로 내려간다 —
    // 실물이 그렇다. 활성 겹이 없으면(null) 종이가 활성이라 종이 획만 지운다.
    // ⚠ 잠금 가드(위)와 **별개의 규칙**이다(지시 문면) — 활성 겹은 잠길 수 없어 겹치는
    // 국면이 없지만, 규칙의 출처가 다르므로 둘 다 남긴다.
    if ((st?.layer ?? null) !== app.activeLayer) continue
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
      // **조각은 어버이의 층을 승계한다**(web2-26 1번 — 소유권은 획에 붙는다).
      // 빠져 있어서 겹 획을 잘라낸 조각이 `layer === undefined`가 됐고, 그것이 곧
      // «종이에 직접 그린 획»(onPaper)이라 **아래 종이가 오염됐다**: 겹을 꺼도 남고
      // 겹을 걷어도(removeLayer는 layer === id만 걷는다) 종이에 눌러앉았다.
      // 실기기 확인이 「선따기 뒤 종이가 달라진다」로 잡은 자리다(DEVICE-CHECK E2).
      if (target.layer !== undefined) s.layer = target.layer
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

/** 작도 시점 — 포즈는 DRAW_POSE로, 뷰는 **첫 획을 긋던 그 화면**으로(web2-17 3-b).
 *  «작도 시점»이라는 말이 이제 문자 그대로다. 선언 전(drawView 없음)이면 원점.
 *  ⚠ 프레임 ≠ 창이면 호출부(main.ts)가 `fitViewToFrame`으로 합성을 다시 얹는다(3-c). */
export function resetPose(app: App) {
  app.view = app.drawView ? { ...app.drawView } : { s: 1, ox: 0, oy: 0 }
  setPose(app, DRAW_POSE)
}

/** 지금 포즈가 활성 종이의 시점인가 — 작도 종이는 `DRAW_POSE`, 저장 종이는 그 `pose`.
 *
 *  ⚠ **살아 있는 포즈**로 판정한다(fadeRef 아님 — #73 ㉡). 동결 포즈로 판정하면 궤도
 *  제스처 내내 참으로 남아 ① 막이 도는 장면 위에 계속 곱해지고(web2-20 3-d 위반 —
 *  시점을 벗어나면 사라져야 한다) ② 그 drawFilms가 궤도 매 프레임 돈다(cost20 표식이
 *  잡은 31ms/프레임). 떨림 걱정은 없다 — 포즈는 제스처 중 연속으로 움직이므로 경계에서
 *  왕복하지 않는다.
 *
 *  ⚙️ **web2-25 2부가 이 술어를 `filmlayer.ts`에서 여기로 옮겼다.** 「막이 보이는가」의
 *  게이트이자 **「롤이 시점을 굳혀야 하는가」의 판정**이 같은 물음이기 때문이다 — 두 자리가
 *  같은 함수를 읽어야 «얹었는데 안 보인다»가 구조적으로 불가능해진다(#54). */
export function atSheetPose(app: App): boolean {
  const sheet = app.doc.sheets.find(s => s.id === app.activeSheet)
  if (!sheet) return false
  if (!sheet.pose) return isDrawPose(app.pose)
  const a = app.pose, b = sheet.pose
  return Math.abs(a.p.x - b.p.x) < 1e-9 && Math.abs(a.p.y - b.p.y) < 1e-9 && Math.abs(a.p.z - b.p.z) < 1e-9
    && Math.abs(a.q.x - b.q.x) < 1e-9 && Math.abs(a.q.y - b.q.y) < 1e-9
    && Math.abs(a.q.z - b.q.z) < 1e-9 && Math.abs(a.q.w - b.q.w) < 1e-9
}

/** **겹을 얹기 전에 — 지금 시점이 어느 종이의 시점도 아니면 그 시점을 새 종이로 굳힌다**
 *  (web2-25 2부).
 *
 *  결함이 이랬다: 궤도로 돌려본 시점은 아직 어느 종이의 시점도 아니므로, 그 자리에서 롤을
 *  누르면 겹이 **활성 종이**(대개 작도 종이)에 얹히고 **지금 화면에서는 안 보인다**
 *  (막은 `atSheetPose`에서만 뜬다 — web2-20 3-d). 「추가는 되는데 안 보인다」다.
 *
 *  **답은 앞서 정한 규칙과 같은 것이다** — 「+ 는 각도를 찾은 뒤 저장한다」(web2-19 2-c ·
 *  사람이 답한 셋의 3). 롤을 누르는 것도 「**이 각도에서 시작한다**」는 선언이므로,
 *  각도를 먼저 굳히고 그 위에 얹는다. 셔터(「+」)와 **같은 경로**(`addSheet`)를 부른다.
 *
 *  판정은 `atSheetPose` 하나다(#54) — 그것이 곧 「막이 보이는가」의 게이트이므로
 *  **얹었는데 안 보이는 상태가 구조적으로 불가능**해진다.
 *  ⚠ 이미 그 종이의 시점이면 **아무 일도 안 한다**(종이가 안 는다 — 팔 ②). */
export function freezePoseForLayer(app: App, thumb?: string): Sheet | null {
  if (atSheetPose(app)) return null
  return addSheet(app, thumb)
}

/** 「+」 = **지금 보고 있는 포즈·뷰를 새 종이로 저장**(web2-19 2-c — 빈 장을 먼저
 *  만들지 않는다: 사람이 답한 셋의 3 「+는 각도를 찾은 뒤 저장하는 것」).
 *  id는 획·면과 한 통(nextId — 지시 2-b). 이름은 「종이 N」, 띠에서 바로 편집한다.
 *  썸네일은 저장 시점에 굽는다(㉮ — 옛 saveView의 근거 그대로: 열 때 다시 그리면
 *  «펼치기»가 무거워진다. 바이트 몫은 views_thumb 원장). 만든 종이가 활성이 된다. */
export function addSheet(app: App, thumb?: string): Sheet {
  const s: Sheet = {
    id: app.nextId++,
    name: `종이 ${app.doc.sheets.length + 1}`,
    pose: { p: { ...app.pose.p }, q: { ...app.pose.q } },
    view: { ...app.view },
    ...(thumb ? { thumb } : {}),
  }
  app.doc.sheets.push(s)
  app.activeSheet = s.id
  app.activeLayer = null   // 겹은 종이에 속한다(web2-20) — 새 종이에는 아직 겹이 없다
  for (const l of app.listeners) l() // 자동 저장이 듣는다
  return s
}

// ── 겹(web2-20 2부) — 종이 위에 얹은 것. 여럿 동시·가산적 ─────────────────────

/** 「+」·롤 버튼 = 새 겹을 **맨 위에** 얹고 활성으로(지시 2부). ⚠ **카메라가 닫히기
 *  전에는 못 얹는다**(2-a — 사람이 정했다: 겹마다 소실점을 만들면 카메라가 섞인다.
 *  얹는 시점을 닫힌 뒤로 미루면 그 자리가 아예 없어진다). 호출부가 그 조건을 UI로
 *  보이고, 여기서도 지킨다(null 반환). rect 기본값 = 지금 화면에서 **짧은 변 5%를 들인
 *  인셋**(web2-21 3-b — 종전 «화면 전체»는 필터로 보였다) + 층별 흔들림(아래). */
export function addLayer(app: App, paper: Paper, viewport: { W: number; H: number }): Layer | null {
  if (!app.lift.an.constructionDone) return null
  const v = app.view
  const id = app.nextId++
  // ── 인셋(web2-21 3-b) — 화면 전체를 덮으면 가장자리가 화면 밖이라 종이가 아니라
  // 필터로 보인다. 「흰 종이 위에 새 종이가 올라갔다」의 정체는 **가장자리가 보이는 것** —
  // 짧은 변의 5%(초안 — 화면 대조는 NOTES 3부)를 들인다. 문서 좌표로 저장되니 줌해도
  // 종이는 종이 크기로 남는다.
  const inset = 0.05 * Math.min(viewport.W, viewport.H)
  // ── 층별 흔들림 — 시드는 섬유와 같은 rng32(layer.id)(#54: 시드 출처 하나 · 저장은
  // rect 자체가 되므로 복원 뒤에도 같다). 세 장이 정확히 겹치면 한 장으로 보이는데,
  // 몇 px씩 어긋나면 가장자리가 여러 겹으로 드러나 몇 장 쌓였는지가 즉시 읽힌다.
  // ⚠ 평행이동·크기까지만 — 회전은 안 넣는다(rect {x,y,w,h}에 자리가 없다 — 지시 ⛔).
  const r = rng32(id)
  const jx = (r() * 2 - 1) * 6, jy = (r() * 2 - 1) * 6    // 평행이동 ±6 화면 px
  const jw = (r() * 2 - 1) * 4, jh = (r() * 2 - 1) * 4    // 크기 ±4 화면 px
  const lay: Layer = {
    id,
    sheet: app.activeSheet,
    paper,
    // +0 정규화 — -0/s는 -0이고 toEqual·JSON에서 +0과 갈린다(팔이 실측으로 잡았다)
    rect: {
      x: (inset + jx - v.ox) / v.s + 0,
      y: (inset + jy - v.oy) / v.s + 0,
      w: (viewport.W - 2 * inset + jw) / v.s,
      h: (viewport.H - 2 * inset + jh) / v.s,
    },
    on: true,
    locked: false,
  }
  app.doc.layers.push(lay)
  app.activeLayer = lay.id
  // ── 굽기(web2-23 1부·2-c) — **옐로를 얹는 그 순간 한 번**. 다른 계기는 없다 ──────
  // 트레이싱지는 안 굽는다(3D가 살아 있어 그냥 보인다 — 2-c ⚠). 굽기는 **지금 이
  // 포즈**에서 돈다: 겹은 그 종이의 시점에서만 뜻이 있으므로(web2-20 3-d) 그 시점의
  // 사영이 곧 밑그림이다. ⛔ 「다시 뜨기」를 만들지 않는다(사람이 정했다 — 2-c).
  if (paper === 'yellow') {
    const baked = bakeUnderlay(app.lift, app.faces, app.pose)
    app.doc.underlays.push({ layer: lay.id, segs: baked.segs })
    bakeCount++
  }
  for (const l of app.listeners) l() // 자동 저장이 듣는다
  return lay
}

/** **굽기가 실제로 몇 번 돌았는가** — 「다시 안 굽는다」(2-c ⛔)를 재는 유일한 값이다.
 *  ⚠ 조각 수로는 그것을 못 잰다: 굽기는 결정론이라 **다시 구워도 같은 수**가 나온다
 *  (2차 리뷰 [8] — 실패 불가능한 격자 #69 ㉣). 이 계수는 그 팔이 실패할 수 있게 한다.
 *  런타임 값이고 저장하지 않는다(진단·e2e 전용). */
let bakeCount = 0
export const underlayBakeCount = (): number => bakeCount

/** 그 겹의 밑그림 — 없으면 null. 읽는 자리(표시·저장·팔)의 **출처 하나**다(#54). */
export const underlayOf = (doc: Pick<Doc, 'underlays'>, layer: number): Underlay | null =>
  doc.underlays.find(u => u.layer === layer) ?? null

/** 겹이 갈 때 그 밑그림도 뗀다(web2-23 2-c ⚠) — **문서에서 빼고 op에 싣는다**.
 *  실행취소가 같은 자리에 도로 꽂는다. 겹 삭제와 종이 삭제가 같은 함수를 부른다(#54). */
function takeUnderlays(app: App, layerIds: Set<number>): Op['underlaysRemoved'] {
  const out: { underlay: Underlay; index: number }[] = []
  for (let i = app.doc.underlays.length - 1; i >= 0; i--) {
    if (layerIds.has(app.doc.underlays[i]!.layer)) out.push({ underlay: app.doc.underlays[i]!, index: i })
  }
  for (const r of out) app.doc.underlays.splice(r.index, 1)
  return out.length > 0 ? out : undefined
}

/** 겹 삭제(2-c) — **그 위의 획도 같이 간다 → 실행취소 대상**(획을 지우는 일이므로
 *  지우개와 같은 급). 「비우기」가 실행취소 밖인 것과 다른 근거: 비우기는 작도까지
 *  버려 op로 못 되돌리고, 겹 삭제는 내용 획만 버린다. */
export function removeLayer(app: App, id: number) {
  const li = app.doc.layers.findIndex(l => l.id === id)
  if (li < 0) return
  const removed: Op['removed'] = []
  for (let i = app.doc.strokes.length - 1; i >= 0; i--) {
    if (app.doc.strokes[i]!.layer === id) removed.push({ stroke: app.doc.strokes[i]!, index: i })
  }
  for (const r of removed) app.doc.strokes.splice(r.index, 1)
  const op: Op = { removed, added: [], layersRemoved: [{ layer: app.doc.layers[li]!, index: li }],
    underlaysRemoved: takeUnderlays(app, new Set([id])) }
  app.doc.layers.splice(li, 1)
  if (app.activeLayer === id) app.activeLayer = null
  app.undoStack.push(op)
  app.redoStack = []
  recompute(app)
}

/** 탭 = 그 겹을 활성으로 — 새 획이 그리로 간다. **활성으로 만들면 자동으로 켜진다**
 *  (지시 2부 문면). null = 종이에 직접. 잠긴 겹은 활성이 못 된다(편집이 막혀 있다). */
export function setActiveLayer(app: App, id: number | null) {
  if (id === null) {
    if (app.activeLayer !== null) { app.activeLayer = null; recompute(app) }
    return
  }
  const lay = app.doc.layers.find(l => l.id === id)
  if (!lay || lay.sheet !== app.activeSheet || lay.locked) return
  if (!lay.on) lay.on = true                       // 활성으로 만들면 자동으로 켜진다
  app.activeLayer = id
  // ⚠ 항상 recompute — 위/아래 갈림(filmSplit)이 syncStrokes(#gl 제외)에 실리려면
  // docVersion이 움직여야 한다(리스너의 재동기 조건이 그것이다). 켬은 4부 liftAll 몫도 겸한다.
  recompute(app)
}

/** 켬/끔 — 끔은 안 보이고 **3D에서도 빠진다**(4부). 활성 겹을 끄면 활성이 풀린다
 *  (안 보이는 겹으로 새 획이 가면 조용히 사라진 획이 된다). */
export function setLayerOn(app: App, id: number, on: boolean) {
  const lay = app.doc.layers.find(l => l.id === id)
  if (!lay || lay.on === on) return
  lay.on = on
  if (!on && app.activeLayer === id) app.activeLayer = null
  // 손으로 눈을 건드리면 **솔로의 기억이 낡는다** — 되돌릴 자리가 더는 그 자리가 아니다.
  // 되돌리지 않고 **기억만 버린다**(지금 화면이 사람이 만든 상태다).
  app.solo = null
  recompute(app)
}

/** **솔로 — 그것만 보기**(web2-25 4-a). 같은 겹을 다시 부르면 돌아온다.
 *
 *  Procreate 가 표시 체크박스를 **길게 눌러** 하는 것이다. 「대안 하나만 놓고 보고 싶다」가
 *  이 도구에서 늘 나는 국면이고(트레이싱지 여러 장 = 대안 여러 개) 그때 눈을 하나씩 끄는
 *  것은 손이 많이 간다.
 *
 *  ⚠⚠ **새 게이트를 안 만들었다**(#54). 솔로는 «나머지를 끈 것»이므로 `setLayerOn`을
 *  그대로 부르고 되돌릴 켬/끔을 기억한다 — 그래서 「꺼진 겹은 3D에서도 빠진다」
 *  (web2-20 4-b)에 **자동으로 같이 걸린다**. 표시용 새 필드를 두면 그 규약과 갈릴 자리가
 *  생기고, 갈리면 「솔로인데 3D에는 남아 있다」가 난다(D-W12 [6]).
 *  ⚠ `id`가 null이면 **되돌리기만** 한다. 종이를 바꿀 때 `gotoSheet`가 그것을 부른다. */
export function setSolo(app: App, id: number | null) {
  const cur = app.solo
  if (cur) {
    for (const [lid, on] of cur.prevOn) setLayerOn(app, lid, on)   // (setLayerOn이 solo를 지운다)
    app.activeLayer = cur.prevActive
    app.solo = null
    if (id === null || id === cur.layer) { recompute(app); return }   // 같은 것을 다시 = 끄기
  }
  if (id === null) return
  const lay = app.doc.layers.find(l => l.id === id)
  if (!lay) return
  const stack = app.doc.layers.filter(l => l.sheet === lay.sheet)
  const prevOn = stack.map(l => [l.id, l.on] as [number, boolean])
  const prevActive = app.activeLayer
  for (const l of stack) setLayerOn(app, l.id, l.id === id)
  app.activeLayer = id
  app.solo = { layer: id, prevOn, prevActive }
  recompute(app)
}

/** 그 겹이 지금 솔로인가 — 화면과 팔의 **출처 하나** */
export const isSolo = (app: App, id: number): boolean => app.solo?.layer === id

/** 잠금 — 보이고 3D에 있고 점이 물리지만 편집만 막힌다. 활성 겹을 잠그면 활성이 풀린다. */
export function setLayerLocked(app: App, id: number, locked: boolean) {
  const lay = app.doc.layers.find(l => l.id === id)
  if (!lay || lay.locked === locked) return
  lay.locked = locked
  if (locked && app.activeLayer === id) app.activeLayer = null
  for (const l of app.listeners) l()
}

/** 종이 삭제 — **작도 종이(배열 0)는 못 지운다**(늘 있다 — 지시 2-b).
 *  ⚠⚠ **규약이 web2-20 2-c에서 바뀌었다**: 겹이 하나라도 있으면 그 겹과 그 위의 획이
 *  딸려 가므로 **실행취소 대상이 된다**(web2-19 DEFERRED의 그 행이 여기서 닫힌다).
 *  겹이 없으면 종전대로 실행취소 밖(잃는 것이 포즈뿐이라 다시 저장이 탭 하나다).
 *  보고 있던 종이를 지우면 작도 종이로 돌아온다(빈 자리를 안 남긴다). */
export function deleteSheet(app: App, id: number) {
  const i = app.doc.sheets.findIndex(s => s.id === id)
  if (i <= 0) return
  const layersOnSheet = app.doc.layers.filter(l => l.sheet === id)
  if (layersOnSheet.length > 0) {
    const removed: Op['removed'] = []
    const layerIds = new Set(layersOnSheet.map(l => l.id))
    for (let si = app.doc.strokes.length - 1; si >= 0; si--) {
      const st = app.doc.strokes[si]!
      if (st.layer !== undefined && layerIds.has(st.layer)) removed.push({ stroke: st, index: si })
    }
    for (const r of removed) app.doc.strokes.splice(r.index, 1)
    const underlaysRemoved = takeUnderlays(app, layerIds)
    const layersRemoved = layersOnSheet
      .map(l => ({ layer: l, index: app.doc.layers.indexOf(l) }))
      .sort((x, y) => y.index - x.index)
    for (const r of layersRemoved) app.doc.layers.splice(r.index, 1)
    const op: Op = { removed, added: [], layersRemoved, underlaysRemoved, sheetRemoved: { sheet: app.doc.sheets[i]!, index: i } }
    app.doc.sheets.splice(i, 1)
    if (app.activeSheet === id) gotoSheet(app, app.doc.sheets[0]!.id)
    app.undoStack.push(op)
    app.redoStack = []
    recompute(app)
    return
  }
  app.doc.sheets.splice(i, 1)
  if (app.activeSheet === id) gotoSheet(app, app.doc.sheets[0]!.id)
  for (const l of app.listeners) l() // 자동 저장이 듣는다
}

/** **시점 갱신이 막히는 이유** — 없으면 null(web2-25 3-c).
 *
 *  SketchUp Scenes 의 *Update Scene* 이 이 도구에는 없었다: 종이 위에서 조금 돌려 더 나은
 *  각도를 찾아도 되돌릴 수도 갱신할 수도 없었다. 그 길을 낸다 — 다만 두 자리에서 막는다.
 *
 *  ㉠ `'layers'` — **겹이 있는 종이는 갱신을 막는다.** 밑그림(옐로)은 «얹은 그 시점»의
 *     사영이라 시점을 갈아 끼우면 어긋난다. 「다시 뜨기 없음」(web2-23 2-c)과 같은 결이다:
 *     답은 갱신이 아니라 **새 종이를 만드는 것**이다.
 *  ㉡ `'draw-pose'` — **작도 종이의 시점은 «작도 시점»이라는 정의**다(pose를 안 담는다 —
 *     정본은 DRAW_POSE·drawView). 그러므로 지금이 작도 시점일 때만 갱신할 것이 있고
 *     (팬·줌과 썸네일), 돌려본 각도로는 갈아 끼울 수 없다. */
export type SheetUpdateBlock = 'layers' | 'draw-pose' | null
export function sheetUpdateBlock(app: App, id: number): SheetUpdateBlock {
  const s = app.doc.sheets.find(x => x.id === id)
  if (!s) return 'layers'
  if (app.doc.layers.some(l => l.sheet === id)) return 'layers'
  if (!s.pose && !isDrawPose(app.pose)) return 'draw-pose'
  return null
}

/** **이 시점으로 갱신**(web2-25 3-c) — 포즈·뷰·썸네일을 지금 것으로 다시 굽는다.
 *  막히면 아무 일도 안 하고 `false`.
 *
 *  ⚠ **실행취소 대상이 아니다**(3-c ⑤에서 정했다). 근거: 종이의 시점을 다루는 몸짓이
 *  이미 전부 스택 밖이다 — 저장(「+」)·삭제(web2-12 deleteView 규약)·이름 바꾸기.
 *  스택에 드는 것은 «그린 것»(획·면·겹)이고 시점은 «보기»다. 갱신만 스택에 넣으면
 *  실행취소가 두 종류를 섞어 되돌리게 된다. 대신 **막는 조항**(㉠)이 잃을 것을 막는다 —
 *  겹이 붙은 종이는 갱신 자체가 안 되므로 되돌릴 필요가 있는 상태가 안 생긴다. */
export function updateSheet(app: App, id: number, thumb?: string): boolean {
  if (sheetUpdateBlock(app, id) !== null) return false
  const s = app.doc.sheets.find(x => x.id === id)!
  if (s.pose) s.pose = { p: { ...app.pose.p }, q: { ...app.pose.q } }
  s.view = { ...app.view }
  if (thumb) s.thumb = thumb
  gotoSheet(app, id)   // 지금 보고 있는 것이 이 종이다 — 포즈·뷰가 이미 같으므로 무변화다
  for (const l of app.listeners) l() // 자동 저장이 듣는다
  return true
}

/** 이름 바꾸기 — 작도 종이도 이름은 바꿀 수 있다(지시 2-b — 못 지울 뿐이다) */
export function renameSheet(app: App, id: number, name: string) {
  const s = app.doc.sheets.find(x => x.id === id)
  const v = name.trim()
  if (!s || !v || s.name === v) return
  s.name = v
  for (const l of app.listeners) l() // 자동 저장이 듣는다
}

/** 탭 = 그 종이로. **작도 종이는 pose를 안 담으므로** 정본 둘(DRAW_POSE·drawView)로
 *  간다(resetPose — #54: 여기 또 담으면 출처가 둘이 된다. 반증 팔이 실제로 담아 확인). */
export function gotoSheet(app: App, id: number) {
  const s = app.doc.sheets.find(x => x.id === id)
  if (!s) return
  // 솔로는 **그 종이 안의 상태**다 — 떠나면 되돌린다(안 그러면 꺼 둔 겹이 남는다 · 4-a ⑤)
  if (app.activeSheet !== id && app.solo) setSolo(app, null)
  if (app.activeSheet !== id) app.activeLayer = null   // 겹은 종이에 속한다(web2-20)
  app.activeSheet = id
  if (s.pose && s.view) {
    app.view = { ...s.view }
    setPose(app, { p: { ...s.pose.p }, q: { ...s.pose.q } })
  } else {
    resetPose(app)
  }
}

/** .brnl 복원 — 문서·시점만 갈아끼우고 나머지는 전부 다시 계산.
 *  `drawView`(web2-17 3-c)가 있으면 그 화면으로 연다 — 없으면(옛 파일) 원점.
 *  프레임 ≠ 창의 합성은 호출부의 `fitViewToFrame`이 얹는다(`composeView`). */
export function loadDoc(app: App, data: { doc: Doc; nextId: number; drawView?: ViewOffset | null }) {
  app.doc = data.doc
  app.nextId = data.nextId
  app.activeSheet = data.doc.sheets[0]!.id   // 연 문서는 작도 종이에서 시작한다
  app.activeLayer = null
  app.drawView = data.drawView ? { ...data.drawView } : null
  app.undoStack = []
  app.redoStack = []
  app.pose = DRAW_POSE
  app.view = app.drawView ? { ...app.drawView } : { s: 1, ox: 0, oy: 0 }
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
  app.activeSheet = app.doc.sheets[0]!.id   // 비우면 종이도 처음(작도 한 장)이다
  app.activeLayer = null
  app.activeErase = null
  app.drawView = null   // 선언도 버린다(web2-17 3-b) — 다음 첫 획이 새로 굳힌다
  app.horizonPref = null   // 자동으로 돌아간다(web2-17 5-a — 비우기는 처음부터다)
  app.pose = DRAW_POSE
  app.view = { s: 1, ox: 0, oy: 0 }
  recompute(app)
}


/** 조작 제스처 시작 — 감쇠 판정 동결(web2-14 3번: 돌리는 동안 아무 일도 안 일어난다).
 *  이미 동결 중이면(연속 제스처) 처음 값을 지킨다 — 매 프레임 갱신하면 동결이 아니다. */
export function beginNavHold(app: App) {
  if (!app.fadePose) { app.fadePose = app.pose; app.fadeView = { ...app.view } }
  // 면 일괄 후보는 «찾은 그 시점»의 화면 폴리곤이다(web2-21 4부) — 궤도·팬이 시작되면
  // 낡으므로 버린다(빼기 탭의 소실은 「전부 찾기」 한 번으로 복구된다 — D-W8 근거).
  if (app.faceCandidates !== null) {
    app.faceCandidates = null
    for (const l of app.listeners) l()
  }
}
/** 조작 제스처 끝 — 동결 해제·재판정 한 번. 왕복 제스처면 표시 변화 0~1회가 된다. */
export function endNavHold(app: App) {
  if (!app.fadePose) return
  app.fadePose = null
  app.fadeView = null
  for (const l of app.listeners) l()
}
/** 감쇠·질감의 «자기 시점» 판정이 읽는 포즈 — 제스처 중에는 동결값(단일 출처 #54) */
export const fadeRef = (app: Pick<App, 'fadePose' | 'pose'>): CamPose => app.fadePose ?? app.pose
/** 지평선 자동 숨김 판정이 읽는 뷰 — 제스처 중에는 동결값(web2-17 5-b · fadeRef의 뷰판) */
export const fadeRefView = (app: Pick<App, 'fadeView' | 'view'>): ViewOffset => app.fadeView ?? app.view

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
    // **선언 전에는 줌이 없다**(web2-17 3-a — 사람 문면 「무차원이니 줌 없이 팬만」).
    // 더 강한 근거: 줌은 프레임이 종이를 얼마나 덮는가를 바꾼다. 지평선과 주점이 프레임의
    // 중심에 붙어 있으므로, 줌한 뒤 같은 손짓으로 그으면 같은 그림이 **다른 화각**으로
    // 앉는다(f = 0.87·W는 문서 단위다). 사람이 선언한다고 한 것은 눈높이 하나이므로
    // 두 번째 선언(화각)을 조용히 끼워 넣지 않는다. 첫 획 뒤에는 종전대로 줌이 산다.
    if (app.doc.strokes.length === 0) return
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
