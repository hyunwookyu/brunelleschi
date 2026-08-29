import type { Pt, V3, Quat } from './vec'
import type { Unit } from './dim'
import type { PressCal } from './press'

/** 뷰 포즈 — 획이 그려진 시점의 카메라. 파생이 아니라 입력 맥락이다.
 *  null/undefined = 작도 포즈(원점, 무회전). */
export interface CamPose {
  p: V3
  q: Quat
}

/** 화면 조작(뷰 오프셋) — 문서 좌표는 안 바뀐다 */
export interface ViewOffset { s: number; ox: number; oy: number }

/** 재료 — 보조선·결과선 같은 분류가 없다. 재료만 있다. */
export type Grade = '2H' | 'H' | 'F' | 'HB' | 'B' | '2B' | 'INK'

/** `raw`와 **나란한** 점별 입력(web2-11 1-c) — `raw[i]`의 필압·기울기가 각 배열의 i다.
 *  `Pt`를 안 늘린 이유: `vec.ts`의 `Pt`는 기하 전체가 쓴다(19파일 — NOTES 실측).
 *  평행 배열이면 파급이 캡처(input)·저장(file)·표현(렌더)에서 끝난다.
 *  전부 **양자화 정수**다(저장 크기 — 근거는 NOTES):
 *  press 0..8191(필압×8191 반올림 — Pro Pen 3 선언 단계와 같아 하드웨어 이상의 손실 없음) ·
 *  tiltX/tiltY 도(-90..90 — Pointer Events 명세가 long이라 정수 저장이 무손실) ·
 *  twist 도(0..359). 각 배열은 있으면 raw와 길이가 같아야 한다(file.ts가 지킨다). */
export interface RawInput { press?: number[]; tiltX?: number[]; tiltY?: number[]; twist?: number[] }

/** 획 — 확정된 끝점 둘(스냅 반영, 원칙 d: 미리보기가 그대로 확정).
 *  raw는 손 획 원본(표현 계층에서 나중에 쓴다). */
export interface Stroke {
  id: number
  a: Pt
  b: Pt
  raw?: Pt[]
  /** 점별 필압·기울기(web2-11 1-c) — raw가 있을 때만, 펜 입력에서만 실린다.
   *  마우스·손가락은 안 싣는다: 상수(마우스 0.5/0/0)를 점마다 쓰면 정보 없이 커진다.
   *  옛 파일에는 없고 그때는 지금까지처럼 동작한다(전부 선택 — 1-e). */
  rawIn?: RawInput
  /** 작도 포즈가 아닌 시점에 그렸으면 그 포즈 */
  view?: CamPose
  /** 재료 — 없으면 HB. `w`는 제도펜 니브 굵기 px(잉크 전용, 없으면 재료 기본값). */
  mat?: { grade: Grade; press?: number; w?: number }
  /** 사용자가 입력한 치수 mm(web2-08 지시 4-2) — 리프팅이 시작점·방향만 취하고
   *  길이를 이 값으로 바꾼다. 첫 치수(스케일을 정한 획)도 같은 규칙인데 구성상 무변형이다. */
  dim?: number
  /** 어느 겹 위에 그렸는가(web2-20 1부) — `Doc.layers[].id`. 없으면 종이에 직접. */
  layer?: number
  /** **자립 3D**(web2-13 4부 — 깃발 뒤·기본 꺼짐 · 개정 3 초안 §2): 카메라가 닫힌 뒤
   *  사슬이 놓은 3D의 소유. 근거 획이 지워져도 유지된다(사건 — 관계가 아니다).
   *  깃발(App.own3d)이 꺼져 있으면 어디서도 안 읽고 안 쓴다 — 원칙 b의 유일한 예외이고
   *  그 예외조차 지금은 실험 경로다. axis는 굳힘 시점의 축 배정 기록(AxisId 문자열 —
   *  camera.ts를 여기서 못 들여온다: 순환). 검증은 own3d.ts의 잉크 심판(§7). */
  own3?: { a: V3; b: V3; axis: string | null }
  /** **글씨 획**(web2-32 1번) — 종이에 쓴 손글씨로 판정된 획. 값은 1 하나뿐이다
   *  (참/거짓이므로 열쇠의 «있음»이 곧 참 — 없으면 작도선이다: 옛 파일이 그대로 산다).
   *  ⚠ **옐로 획과 같은 규격이다**(새 기제 ⛔ — web2-22 1부의 그 규격을 그대로 쓴다):
   *  `raw`가 정본 기하 · 3D 없음(lift가 거른다) · 대기도 아님 · 오스냅·소실점에
   *  참여하지 않음(lift·analyze에서 빠지면 그 넷이 **자동으로** 빠진다 — #54).
   *  판정은 획 하나가 아니라 **뭉치**가 하고(`core/scribble.ts`), 이미 다른 획의 근거가
   *  된 획은 재판정하지 않는다(그 규칙이 `own3`의 «한 번 자립하면 안 풀린다»를 지킨다). */
  text?: 1
}

// ── 종이(web2-19 2부) — **명명된 뷰가 「종이」다**(도면집의 한 장) ─────────────
// 층위 셋의 가운데(지시 2-a): 파일 = 대상 하나 / **종이 = 그 대상을 그린 한 장,
// 하나만 활성** / 겹(종속 탭·web2-20) = 그 종이 위에 얹은 것.
// ⚠⚠ BrnlData가 아니라 **Doc**에 산다 — 다음 회차의 겹이 종이를 가리키고 겹은 획을
// 소유하므로, 종이가 문서 밖에 있으면 그 참조가 문서 경계를 넘는다(지시 2-b).
// `drawView`는 지금 자리(App/BrnlData 층) 그대로다 — 구도이지 구조가 아니다.
export interface Sheet {
  id: number
  name: string
  /** 없으면 **작도 종이** — 포즈는 DRAW_POSE, 뷰는 drawView(web2-17). 여기 또 담으면
   *  출처가 둘이 된다(#54) — 반증 팔이 실제로 담아 ④가 어긋나는 것을 확인한다. */
  pose?: CamPose
  view?: ViewOffset
  thumb?: string
}

// ── 겹(web2-20 1부) — **종이 위에 얹은 것**(트레이싱지·옐로). 여럿 동시. ──────────
// 층위 셋의 셋째: 파일 = 대상 하나 / 종이 = 한 장·하나만 활성 / **겹 = 얹은 것·가산적**.
// ⚠ 'base'라는 겹은 없다 — 바탕은 종이 자신이다(「층 0」을 만들면 층위를 하나 섞는다).
// ⚠ 앱은 겹의 목적을 제안하지 않는다(사람이 정했다) — 종이 종류 둘과 켜고 끄기뿐이다.
export type Paper = 'tracing' | 'yellow'

/** 겹의 **화면 이름** — 출처 하나다(#54). 겹을 얹는 팝업·지우기 확인·툴팁이 같이 읽는다.
 *  ⚠ 「종이」가 아니다: 종이는 `Sheet`이고 겹은 그 위에 **얹은 것**이다(web2-30 4번이
 *  지우기 확인의 「이 종이를 지운다」를 그래서 고쳤다). */
export const paperName = (p: Paper): string => (p === 'yellow' ? '옐로' : '트레이싱지')

/** **결이 있는 면 셋**(web2-30 9번) — 겹 둘 + **바탕 종이**. `Paper`는 «얹는 겹의 종류»라
 *  저장 형식에 들어가고, 이쪽은 **그리는 면**이라 저장에 안 들어간다(파생).
 *  ⚠ web2-20 3부는 「바탕 종이에는 결이 없다」로 정했는데, 실기기에서 **그 차등 자체가
 *  결함으로 읽혔다**(「옐로·트레이싱지는 결이 보이는데 종이만 안 보인다」) — 30-9가 뒤집는다. */
export type Surface = Paper | 'paper'

export interface Layer {
  id: number
  /** 어느 종이 위에 얹혔는가 — `Doc.sheets[].id` */
  sheet: number
  paper: Paper
  /** 그 종이의 **문서 좌표** 사각 — 그 종이의 시점에서만 뜻이 있다. 화지(frame)와
   *  무관하고 넘쳐도 된다(이 화면은 무한이다 — 지시 2-b). */
  rect: { x: number; y: number; w: number; h: number }
  /** 켬/끔 **둘뿐**이다 — dim은 없다: 겹이 쌓이면 아래는 곱 합성이 저절로 흐린다(1-b).
   *  끔 = 안 보이고 **3D에서도 빠진다**(liftAll이 거른다 — 4부). */
  on: boolean
  /** 잠금 — 별개 축: 보이고 3D에 있고 점이 물리지만 편집(그리기·지우기)만 막힌다 */
  locked: boolean
}

/** 작도 종이의 상수 id — **카운터 밖 예약값**이다. 늘 있고 못 지우는 유일한 종이라
 *  할당이 아니라 정체다(nextId는 1부터 시작하므로 충돌하지 않는다 — sheets.test가 지킨다).
 *  나머지 종이의 id는 획·면과 **한 통**(nextId 하나 — 지시 2-b)이다. */
export const DRAW_SHEET_ID = 0
export const drawSheet = (): Sheet => ({ id: DRAW_SHEET_ID, name: '작도' })

/** «종이에 직접 그린 획인가»(겹이 아니라) — 스케일 기준 자격(web2-21 1-b)이 이 술어다.
 *  판정이 두 자리(scaleOf·setDimension)에 흩어지면 겹의 정의가 바뀔 때 갈린다(#54) —
 *  술어는 여기 하나다. */
export const onPaper = (s: Stroke): boolean => s.layer === undefined

/** **옐로 겹의 id 집합**(web2-22 1부 — «옐로는 작도가 멈춘 종이»). 옐로 겹의 획은 2D다:
 *  축 스냅·3D 승격·오스냅·소실점에 참여하지 않는다(지시 1-a 표). 판정의 출처는
 *  `Stroke.layer` → `Layer.paper` 하나다(새 필드 ⛔ — 지시 1-c). 켬/끔 무관 — 옐로의
 *  성질은 매체이지 상태가 아니다. 이 집합을 읽는 자리: lift(content 제외) ·
 *  analyze(소실점 제외) · brushlayer/filmlayer(2D 표시) · input/session(스냅 우회). */
export const yellowIds = (doc: Pick<Doc, 'layers'>): Set<number> =>
  new Set(doc.layers.filter(l => l.paper === 'yellow').map(l => l.id))

/** «글씨로 판정된 획인가»(web2-32 1번) — 출처는 `Stroke.text` 하나다(#54). */
export const isText = (s: Stroke): boolean => s.text === 1

/** «2D 획인가» — 옐로 겹의 획이거나 글씨 획. 읽는 자리: lift(3D 제외) ·
 *  analyze(소실점 제외) · brushlayer/filmlayer(2D 표시). 둘을 한 술어로 묶은 이유는
 *  **규격이 같기 때문**이다(web2-32 1번 — 새 규격을 안 짓는다). */
export const isFlat2d = (s: Stroke, yellow: Set<number>): boolean =>
  isText(s) || (s.layer !== undefined && yellow.has(s.layer))

// ── 밑그림(web2-23 2-b) — **사건의 기록**이지 파생이 아니다 ────────────────────
// 옐로 겹을 얹는 **그 순간 한 번** 구운 make2d(`core/make2d.ts`). `own3`와 같은 급:
// 근거가 바뀌어도 다시 굽지 않는다 — 그것이 사람이 폐기한 「다시 뜨기」이기 때문이다
// (web2-22 1-e). 아래를 고쳤으면 **새 옐로를 한 장 더 얹는다**. 그러면 쌓인 순서가
// 곧 작업 이력이다(D-W12).
// ⚠ 파생이 아니므로 **저장한다**(면·겹·scaleRef와 같은 급 — 원칙 b에 안 걸린다).
//   안 저장하고 열 때 다시 계산하면 그것이 곧 자동으로 다시 뜨는 것이다.

/** 구운 조각 하나 — 문서 좌표의 선분 + 깃발. `hidden`이 경도를 가른다(H vs F — 2-a). */
export interface UnderlaySegment { a: Pt; b: Pt; hidden: boolean }

export interface Underlay {
  /** 어느 겹의 것인가 — `Doc.layers[].id` */
  layer: number
  segs: UnderlaySegment[]
}

/** 문서 — 획 목록과 그린 캔버스 크기(CSS px, 첫 획 시점).
 *  소실점·카메라·차수·축은 여기 없다 — 전부 계산이다(원칙 b). */
export interface Doc {
  frame: { W: number; H: number }
  strokes: Stroke[]
  /** 사용자가 지정한 면 — **이것만은 파생이 아니다**(아래 「면」 절) */
  faces: Face[]
  /** 종이(web2-19 2부) — **배열 0이 작도 종이**이고 pose·view가 없다. 늘 있고 못
   *  지운다(이름은 바꿀 수 있다). 종이가 늘어도 3D는 하나다 — 획은 종이에 안 속한다.
   *  ⚠ web2-20부터 겹이 종이를 가리킨다 — 겹이 있는 종이의 삭제는 획을 지우는 일이
   *  됐다(실행취소 대상 — 2-c에서 규약이 바뀌었다). */
  sheets: Sheet[]
  /** 겹(web2-20 1부) — 배열 순서가 곧 쌓인 순서(뒤가 위). 종이별로 걸러 쓴다.
   *  파생이 아니라 사람의 결정이라 저장한다(면·unit·scaleRef·종이와 같은 급).
   *  ⚠⚠ 섬유질 시드가 layer.id다(3-c — 새로 꺼낼 때마다 다르고 다시 열어도 같은 결). */
  layers: Layer[]
  /** **스케일 기준 획** — 첫 치수 «입력»을 받은 획의 id(지시 4-1의 「첫 치수」는 입력
   *  순서다 — 문서 순서가 아니다: 나중에 앞 획에 치수를 주면 스케일이 조용히 그리로
   *  옮겨 가던 결함을 리뷰어 [5]가 잡았다). 사용자의 결정이라 저장한다(면과 같은 급).
   *  그 획이 지워지면 lift가 문서 순서상 첫 치수 획으로 물러난다(대가 — DEFERRED). */
  scaleRef?: number
  /** 밑그림(web2-23 2-b) — 겹마다 최대 하나(옐로 겹만 갖는다). 굽는 계기는 «얹는
   *  순간» 하나뿐이다(2-c). 겹이 지워지면 같이 가고 실행취소로 같이 돌아온다. */
  underlays: Underlay[]
  /** **필압 보정**(web2-26 6번 · 옵션 · 기본 꺼짐) — 없으면 꺼진 것이다.
   *  ⚠ **문서에 붙는다**(기기 아님): 압력은 원값으로 저장하고 그릴 때 매핑하므로(원칙 b),
   *  이 값이 기기 설정이면 옵션을 켜는 순간 **예전 그림들의 농도까지 전부 바뀐다**.
   *  「기본값은 현행 유지」가 지켜지려면 문서에 붙어야 한다. 파생이 아니라 설정이므로
   *  원칙 b에 안 걸린다(면·unit·scaleRef와 같은 급). 정의는 `core/press.ts`. */
  press?: PressCal
  /** 표시 단위 — 기본 밀리미터(지시 4-6). 사용자의 결정이라 저장한다.
   *  ⚠ 스케일(mmPerUnit)은 여기 **없다** — 파생이다(원칙 b): 문서 순서상 첫 치수 획의
   *  `dim ÷ (무치수 풀이 길이)`로 `lift.ts`가 매번 계산한다. 저장하던 초판은 «2500»을
   *  획마다 쓰는 도중 첫 «2»가 스케일을 굳혀 사용자의 정정과 갈렸다(#54의 형태). */
  unit: Unit
}

export const emptyDoc = (W: number, H: number): Doc =>
  ({ frame: { W, H }, strokes: [], faces: [], sheets: [drawSheet()], layers: [], underlays: [], unit: 'mm' })

// ── 면 ────────────────────────────────────────────────────────────────────
// **자동으로 안 만든다.** 닫힌 루프가 생겼다고 면이 아니다 — 방 안의 벽 넷은 방이고
// 창틀 사각형은 개구부다. 사용자가 지정한 것만 면이다. 그래서 **면은 저장한다**
// (원칙 b의 「파생은 저장하지 않는다」에 걸리지 않는다 — 의도는 파생이 아니다).
//
// 저장하는 것은 **경계의 정체**이고 좌표가 아니다: 정점은 이웃한 두 경계의 3D 직선
// 교점으로 매번 계산한다. 그래서 차수 승격으로 전부 다시 올라가도 면이 따라온다.

/** 경계 하나 — 지금은 획(직선)뿐이다.
 *  `kind`를 둔 이유는 **곡선이 나중에 온다**는 것이 지시의 전제이기 때문이다.
 *  곡선 세그먼트가 생기면 `{ kind: 'arc', ... }` 같은 항이 여기 붙고,
 *  `face.ts`의 「경계 → 정점」 한 함수만 늘어난다. */
export interface FaceEdge {
  kind: 'stroke'
  /** 획 id — 그 획이 사라지면 이 경계가 안 풀린다(면은 대기 상태가 된다) */
  s: number
}

/** 닫힌 루프 하나 — 순서가 곧 둘레 방향이다 */
export interface FaceLoop {
  edges: FaceEdge[]
}

/** 면 — `loops[0]`이 외곽이고 나머지는 **개구부**(면 안의 구멍)다.
 *  오목 외곽과 개구부는 다른 것이다: 오목은 외곽선이 파인 것이고 개구부는 안이 뚫린 것이다. */
export interface Face {
  id: number
  loops: FaceLoop[]
}
