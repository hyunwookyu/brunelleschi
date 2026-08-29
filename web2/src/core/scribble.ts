// 종이의 글씨(web2-32 1번) — **가르는 층**이다.
//
// 증상(사용자 확인): 종이에 숫자를 쓰면 **획마다 다르게 처리된다**. 1은 축에 붙어
// 작도선이 되고, 곡선인 숫자는 안 되고, 숫자 하나가 공간에 흩어진다.
// 원인: 가르는 층이 **없다** — 종이의 모든 획이 같은 관을 지나 제 기하가 이끄는 대로
// 떨어진다. 옐로는 프리핸드에 스냅이 없어 글씨가 자연스럽지만 종이에서는 작도 기계와 싸운다.
//
// **실제 제도에서는 종이가 구분하지 않고 손이 구분한다** — 자를 대고 긋다가 자를 떼고
// 숫자를 쓴다. 그래서 앱도 손을 본다:
//
//   작도선 — 길다 · 한 방향 · 획 하나 · 서로 떨어져 있다
//   글씨   — 짧다 · 방향이 여러 번 바뀐다 · 여러 획 · 서로 뭉쳐 있다
//
// ⚠ **판정은 획이 아니라 뭉치 단위다.** 첫 획은 애매해도 옆에 짧은 획이 하나 더 붙는
//   순간 확정된다. 그래서 이 파일의 판정 함수는 «획 하나 → 참/거짓»이 아니라
//   «획 목록 → 확정인가»다.
//
// ⚠⚠ **재판정의 한계**(지시가 못 박았다): 글씨로 되돌릴 수 있는 것은 **다른 획의 근거가
//   되지 않은 획뿐**이다. 이미 다른 획이 그것을 근거로 3D를 세웠으면 작도선으로 둔다 —
//   `own3`는 「한 번 자립하면 근거를 지워도 안 풀린다」인데 **근거 자체를 없애 버리면**
//   그 규칙이 무너진다. `isBasis`가 그 물음이고, 애매하면 «근거다»로 기운다(보수적).
//
// 여기 있는 것은 전부 **순수 함수**다 — 앱 상태를 안 읽는다(단위 시험이 앱과 같은 함수를
// 부른다, #62). 배선은 `app/state.ts`의 `reclassifyWriting`이다.

import type { Pt } from './vec'
import type { LiftedSeg } from './lift'

/** 획 하나의 «손» 특징 — 전부 **문서 좌표**의 양이다(화면 px로 견주는 쪽이 나눈다). */
export interface WriteFeat {
  /** 점렬 길이(현이 아니라 실제 궤적 길이) */
  len: number
  /** 바운딩 박스 */
  w: number
  h: number
  /** 바운딩 박스 대각 — «짧다»의 척도(끝점 거리로 재면 닫힌 한 붓이 0이 된다, #STRAY와 같은 이유) */
  span: number
  /** 방향 전환 횟수 — 마디 사이 각이 90°를 넘은 횟수(«방향이 여러 번 바뀐다») */
  turns: number
  /** 총 회전각 rad(절대합) — 「곧은가 감기는가」. 확정 판정이 읽는 값이다 */
  turn: number
}

/** 점렬 → 특징. `segMin`은 회전각에서 무시할 짧은 마디(문서 단위 — 손떨림 몫). */
export function featOf(pts: Pt[], segMin: number): WriteFeat {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  let len = 0
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  // 회전각은 **긴 마디만** 잇는다: 짧은 마디의 방향은 표본 잡음이라 각이 무작위로 튄다.
  const dirs: { dx: number; dy: number }[] = []
  let ax = pts[0]?.x ?? 0, ay = pts[0]?.y ?? 0
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!
    const dx = p.x - ax, dy = p.y - ay
    const d = Math.hypot(dx, dy)
    len += Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y)
    if (d >= segMin) { dirs.push({ dx: dx / d, dy: dy / d }); ax = p.x; ay = p.y }
  }
  let turn = 0, turns = 0
  for (let i = 1; i < dirs.length; i++) {
    const a = dirs[i - 1]!, b = dirs[i]!
    const ang = Math.abs(Math.atan2(a.dx * b.dy - a.dy * b.dx, a.dx * b.dx + a.dy * b.dy))
    turn += ang
    if (ang > Math.PI / 2) turns++
  }
  const w = x1 - x0, h = y1 - y0
  return { len, w, h, span: Math.hypot(w, h), turns, turn }
}

/** 「이 획이 다른 획의 3D 근거인가」 — 다른 3D 획의 끝점이 이 획의 3D 선분 위에 있으면 참.
 *
 *  근거가 되는 길이 리프팅에 둘뿐이라(끝점 일치 · 선분 위 점) 그 둘을 그대로 뒤집어
 *  묻는다. ⚠ 리프팅은 일치한 좌표를 **그대로 복사**하므로(matchPoint가 찾은 V3를 그대로
 *  쓴다) 끝점 사슬은 수치적으로 정확히 같다 — `tol`은 선분 위 점(연장선·교점)의 몫이다.
 *  ⚠ 방향을 **모른다**(어느 쪽이 먼저 섰는지 리프팅이 기록하지 않는다) — 그래서 이
 *  물음은 보수적이다: 겹치기만 하면 근거로 본다. 그 편이 안전한 쪽이다(A-3: 애매하면
 *  놓지 않는다 — 조용히 3D를 없애지 않는다). */
export function isBasis(lifted: Map<number, LiftedSeg>, id: number, tol: number): boolean {
  const seg = lifted.get(id)
  if (!seg) return false                       // 3D가 없으면 근거가 될 수 없다
  for (const [oid, other] of lifted) {
    if (oid === id) continue
    if (distToSeg3(other.a3, seg) <= tol || distToSeg3(other.b3, seg) <= tol) return true
  }
  return false
}

function distToSeg3(p: { x: number; y: number; z: number }, s: LiftedSeg): number {
  const dx = s.b3.x - s.a3.x, dy = s.b3.y - s.a3.y, dz = s.b3.z - s.a3.z
  const L2 = dx * dx + dy * dy + dz * dz
  if (L2 < 1e-18) return Math.hypot(p.x - s.a3.x, p.y - s.a3.y, p.z - s.a3.z)
  let t = ((p.x - s.a3.x) * dx + (p.y - s.a3.y) * dy + (p.z - s.a3.z) * dz) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (s.a3.x + t * dx), p.y - (s.a3.y + t * dy), p.z - (s.a3.z + t * dz))
}

/** 뭉치가 **글씨로 확정되는가** — 지시 문면 그대로다:
 *  · 획이 `minStrokes`개 이상 모였다 → 확정(「옆에 짧은 획이 하나 더 붙는 순간」)
 *  · 획이 하나뿐이면 **감겨 있어야** 확정(한 붓의 0·2·3·5·6·8·9). 곧은 획 하나는
 *    «1»일 수도 짧은 작도선일 수도 있으므로 **놓지 않는다**(대기 상태다 — 다음 획이
 *    붙으면 그때 확정된다).
 *  ⚠ 크기(짧다)·거리(뭉쳐 있다)는 뭉치를 **만드는 쪽**이 이미 걸렀다(state.writingCluster). */
export function confirmWriting(feats: WriteFeat[], minStrokes: number, turnRad: number): boolean {
  if (feats.length === 0) return false
  if (feats.length >= minStrokes) return true
  return feats[0]!.turn >= turnRad
}
