import type { Pt, V3, Quat } from './vec'

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

/** 획 — 확정된 끝점 둘(스냅 반영, 원칙 d: 미리보기가 그대로 확정).
 *  raw는 손 획 원본(표현 계층에서 나중에 쓴다). */
export interface Stroke {
  id: number
  a: Pt
  b: Pt
  raw?: Pt[]
  /** 작도 포즈가 아닌 시점에 그렸으면 그 포즈 */
  view?: CamPose
  /** 재료 — 없으면 HB. `w`는 제도펜 니브 굵기 px(잉크 전용, 없으면 재료 기본값). */
  mat?: { grade: Grade; press?: number; w?: number }
}

/** 문서 — 획 목록과 그린 캔버스 크기(CSS px, 첫 획 시점).
 *  소실점·카메라·차수·축은 여기 없다 — 전부 계산이다(원칙 b). */
export interface Doc {
  frame: { W: number; H: number }
  strokes: Stroke[]
  /** 사용자가 지정한 면 — **이것만은 파생이 아니다**(아래 「면」 절) */
  faces: Face[]
}

export const emptyDoc = (W: number, H: number): Doc =>
  ({ frame: { W, H }, strokes: [], faces: [] })

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
