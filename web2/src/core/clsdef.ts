// web2-55 — **분류 «정의»**: 두께는 면이 아니라 분류가 든다(BIM의 type — 사람 문면
// 「폭은 앞으로 생길 레이어(외벽·내벽·기타등등)에 따라 **일괄적으로** 줄 것」).
// 면은 분류를 가리키고 **예외만** 덮어쓴다(Face.ex — instance).
//
// **t = 0 이 기본이다** — 슬롯(앞·뒤·테두리)은 처음부터 있고 테두리 폭이 0일 뿐이다.
// 두께를 «나중에 더하는 것»으로 두면 그 날 칠 데이터를 옮겨야 한다. 항상 있는데 0이면
// 옮길 일이 영원히 없다(50의 「마이그레이션을 만들지 마라」와 같은 자리 — 지시 문면).
//
// 저장은 **바뀐 것만**이다(doc.clsDefs — 부분 덮어쓰기): 옛 문서는 바이트가 한 자도 안
// 바뀐다(43-1 ①의 왕복 동일성이 그 판이다).
//
// 우선순위·코어는 **56이 쓴다 — 이번엔 들고만 있는다**(지시). 초판값의 근거(원장에도
// 같은 문면 — paint55 원장 defaults 블록):
//   · pri: 외벽 4 > 내벽·벽 3 > 슬라브·경사 2 — 조사 문면의 방향(구조 벽 우세 · 외벽이
//     연속면을 이끈다)을 따랐을 뿐 **임의 초판**이다. 사람이 바꾸는 것을 전제로 한 자리
//     (원칙 a — 손잡이는 56이 접합을 세울 때 함께 온다).
//   · core: 다섯 전부 1 — 분류당 층이 하나(전부 구조체)인 지금의 사실 그대로다. 0은
//     마감 층이 생기는 날의 값이다.
//   · off 기본 «가운데»('c') — 손으로 그은 선이 벽의 어디인지 앱이 알 수 없고, 예측
//     가능한 쪽이다(지시의 결정 — 사람과 확정).
//   · 기본 재료: 46의 것 그대로(분류가 재료를 «가리키는» 꼴 유지 — 복합벽이 오는 날
//     우선순위를 재료로 옮길 수 있게. 지시 문면).

import type { FaceClass } from './paint'
import type { Doc, Face } from './types'
import type { MatId } from './palette'

/** 오프셋 기준 — 'c' 가운데(중심선이 벽 한가운데) · 's' 한쪽(그린 선이 «앞» 표면). */
export type ClsOff = 'c' | 's'

export interface ClsDef {
  /** 두께 mm — 0이면 지금과 픽셀이 같다(중심 게이트) */
  t: number
  off: ClsOff
  /** 56의 병합 걸음이 쓴다 — 큰 쪽이 이긴다 */
  pri: number
  /** 56의 2단 정렬 키 윗자리 */
  core: 0 | 1
  /** 기본 재료(46의 것) — 분류가 재료를 가리킨다 */
  mat?: MatId
}

/** 초판값 — 전부 t=0(무변화가 기본). 값의 근거는 파일 머리주석·원장 defaults 블록. */
export const DEFAULT_CLS: Record<FaceClass, ClsDef> = {
  slab: { t: 0, off: 'c', pri: 2, core: 1, mat: 'conc' },
  wall: { t: 0, off: 'c', pri: 3, core: 1, mat: 'conc' },
  extw: { t: 0, off: 'c', pri: 4, core: 1, mat: 'brick' },
  intw: { t: 0, off: 'c', pri: 3, core: 1, mat: 'conc' },
  slope: { t: 0, off: 'c', pri: 2, core: 1, mat: 'roof' },
}

/** 분류 정의 — 문서의 덮어쓰기(clsDefs)를 기본값 위에 병합한 값. **출처 한 자리**(#54). */
export function clsDefOf(doc: Pick<Doc, 'clsDefs'>, id: FaceClass): ClsDef {
  const base = DEFAULT_CLS[id]
  const over = doc.clsDefs?.[id]
  return over ? { ...base, ...over } : base
}

/** 이 면의 유효 두께(mm)와 기준 — 분류의 t 위에 면의 예외(Face.ex.t)가 덮는다.
 *  반환의 t는 mm다 — 세계 단위 환산은 부르는 쪽이 mmPerUnit로 한다(자는 lift의 것 #54). */
export function faceThickness(
  doc: Pick<Doc, 'clsDefs'>, face: Face | undefined, cls: FaceClass,
): { t: number; off: ClsOff; ex: boolean } {
  const def = clsDefOf(doc, cls)
  if (face?.ex?.t !== undefined) return { t: face.ex.t, off: def.off, ex: true }
  return { t: def.t, off: def.off, ex: false }
}

/** 앞/뒤 표면의 법선 방향 오프셋(같은 단위 — 넣은 t의 단위 그대로).
 *  · 가운데: 앞 +t/2 · 뒤 −t/2
 *  · 한쪽: 앞 0 · 뒤 −t — **그린 선이 «앞» 표면이다**(겉면을 그렸다고 읽는 쪽이
 *    입면 스케치의 관성이다 — D-W24). */
export function slotOffsets(t: number, off: ClsOff): { front: number; back: number } {
  if (t <= 0) return { front: 0, back: 0 }
  return off === 'c' ? { front: t / 2, back: -t / 2 } : { front: 0, back: -t }
}
