import type { Pt, V3, Quat } from './vec'

/** 뷰 포즈 — 획이 그려진 시점의 카메라. 파생이 아니라 입력 맥락이다.
 *  null/undefined = 작도 포즈(원점, 무회전). */
export interface CamPose {
  p: V3
  q: Quat
}

/** 화면 조작(뷰 오프셋) — 문서 좌표는 안 바뀐다 */
export interface ViewOffset { s: number; ox: number; oy: number }

/** 획 — 확정된 끝점 둘(스냅 반영, 원칙 d: 미리보기가 그대로 확정).
 *  raw는 손 획 원본(표현 계층에서 나중에 쓴다). */
export interface Stroke {
  id: number
  a: Pt
  b: Pt
  raw?: Pt[]
  /** 작도 포즈가 아닌 시점에 그렸으면 그 포즈 */
  view?: CamPose
}

/** 문서 — 획 목록과 그린 캔버스 크기(CSS px, 첫 획 시점).
 *  소실점·카메라·차수·축은 여기 없다 — 전부 계산이다(원칙 b). */
export interface Doc {
  frame: { W: number; H: number }
  strokes: Stroke[]
}

export const emptyDoc = (W: number, H: number): Doc => ({ frame: { W, H }, strokes: [] })
