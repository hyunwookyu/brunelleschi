import type { Pt, V3, Quat } from './vec'
import type { Unit } from './dim'

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
  /** **자립 3D**(web2-13 4부 — 깃발 뒤·기본 꺼짐 · 개정 3 초안 §2): 카메라가 닫힌 뒤
   *  사슬이 놓은 3D의 소유. 근거 획이 지워져도 유지된다(사건 — 관계가 아니다).
   *  깃발(App.own3d)이 꺼져 있으면 어디서도 안 읽고 안 쓴다 — 원칙 b의 유일한 예외이고
   *  그 예외조차 지금은 실험 경로다. axis는 굳힘 시점의 축 배정 기록(AxisId 문자열 —
   *  camera.ts를 여기서 못 들여온다: 순환). 검증은 own3d.ts의 잉크 심판(§7). */
  own3?: { a: V3; b: V3; axis: string | null }
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

/** 작도 종이의 상수 id — **카운터 밖 예약값**이다. 늘 있고 못 지우는 유일한 종이라
 *  할당이 아니라 정체다(nextId는 1부터 시작하므로 충돌하지 않는다 — sheets.test가 지킨다).
 *  나머지 종이의 id는 획·면과 **한 통**(nextId 하나 — 지시 2-b)이다. */
export const DRAW_SHEET_ID = 0
export const drawSheet = (): Sheet => ({ id: DRAW_SHEET_ID, name: '작도' })

/** 문서 — 획 목록과 그린 캔버스 크기(CSS px, 첫 획 시점).
 *  소실점·카메라·차수·축은 여기 없다 — 전부 계산이다(원칙 b). */
export interface Doc {
  frame: { W: number; H: number }
  strokes: Stroke[]
  /** 사용자가 지정한 면 — **이것만은 파생이 아니다**(아래 「면」 절) */
  faces: Face[]
  /** 종이(web2-19 2부) — **배열 0이 작도 종이**이고 pose·view가 없다. 늘 있고 못
   *  지운다(이름은 바꿀 수 있다). 종이가 늘어도 3D는 하나다 — 획은 종이에 안 속한다. */
  sheets: Sheet[]
  /** **스케일 기준 획** — 첫 치수 «입력»을 받은 획의 id(지시 4-1의 「첫 치수」는 입력
   *  순서다 — 문서 순서가 아니다: 나중에 앞 획에 치수를 주면 스케일이 조용히 그리로
   *  옮겨 가던 결함을 리뷰어 [5]가 잡았다). 사용자의 결정이라 저장한다(면과 같은 급).
   *  그 획이 지워지면 lift가 문서 순서상 첫 치수 획으로 물러난다(대가 — DEFERRED). */
  scaleRef?: number
  /** 표시 단위 — 기본 밀리미터(지시 4-6). 사용자의 결정이라 저장한다.
   *  ⚠ 스케일(mmPerUnit)은 여기 **없다** — 파생이다(원칙 b): 문서 순서상 첫 치수 획의
   *  `dim ÷ (무치수 풀이 길이)`로 `lift.ts`가 매번 계산한다. 저장하던 초판은 «2500»을
   *  획마다 쓰는 도중 첫 «2»가 스케일을 굳혀 사용자의 정정과 갈렸다(#54의 형태). */
  unit: Unit
}

export const emptyDoc = (W: number, H: number): Doc =>
  ({ frame: { W, H }, strokes: [], faces: [], sheets: [drawSheet()], unit: 'mm' })

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
