// 글씨 상태(web2-39) — **진입은 선언이고 종료는 자동이다.**
//
// ⛔⛔ 이 파일은 `core/scribble.ts`(web2-32 1번)를 **대체한다**. 그쪽은 「이 획이
// 글씨인가」를 손의 특징으로 **추측**했고(짧다·방향이 여러 번 바뀐다·뭉쳐 있다),
// 사용자가 실사용에서 그 추측이 구조적으로 못 서는 것을 찾아 왔다:
//
//   「세로선을 긋다가 이를 숫자 1로 인식하여 1·11·111mm 등의 수치를 의도치 않게 부여하는 문제.」
//
// **작도선 자체가 숫자와 구별되지 않는다** — 「1」은 세로선이고, 짧은 세로선 셋은
// 「111」이며, 제도에서 짧은 평행 세로선은 널려 있다(기둥·문설주·해칭). 궤적을 봐도
// 1과 세로 작도선은 **같은 궤적**이다. 그러므로 인식을 아무리 고쳐도 못 막는다 —
// 이것은 「인식률이 낮다」가 아니라 **「입력이 같다」**이다(AS-C143).
//
// 그래서 규칙이 둘로 줄었다:
//
//   글씨 상태 안 → 모든 획이 글씨
//   글씨 상태 밖 → 모든 획이 작도선
//
// 여기 있는 것은 **순수 함수**다 — 앱 상태를 안 읽는다(단위 시험이 앱과 같은 함수를
// 부른다, #62). 배선은 `app/state.ts`(진입·종료·획 싣기)와 `app/input.ts`(누름 판정)다.
//
// ⚠ **재판정 기제가 없다.** 32-1은 확정된 작도선을 나중에 글씨로 되돌렸고, 그래서
//   「이미 다른 획의 3D 근거가 된 획은 재판정 금지」(`isBasis`) 같은 예외를 지고 다녔다.
//   진입이 명시적이면 되돌릴 일이 없으므로 그 예외도 **함께 사라졌다**(#54 계열: 쓰이지
//   않는 예외를 남기지 않는다).

/** 문서 좌표의 상자 — 「먼 곳」 판정의 두 인자가 이 형태다 */
export interface WBox { x0: number; y0: number; x1: number; y1: number }

/** 점렬 → 상자. 빈 목록이면 null(없는 상자를 0으로 위장하지 않는다). */
export function boxOfPts(pts: { x: number; y: number }[]): WBox | null {
  if (pts.length === 0) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

/** 두 상자의 합집합 — 뭉치가 자란다 */
export function unionBox(a: WBox | null, b: WBox): WBox {
  if (!a) return { ...b }
  return {
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
  }
}

/** 상자를 사방으로 `r`만큼 부풀린다 — 「누른 자리」를 뭉치의 씨앗으로 놓을 때 쓴다. */
export function inflate(b: WBox, r: number): WBox {
  return { x0: b.x0 - r, y0: b.y0 - r, x1: b.x1 + r, y1: b.y1 + r }
}

/** 두 상자 사이의 **간격**(겹치면 0) — 32-1의 뭉치 규칙이 쓰던 그 식 그대로다(#54). */
export function boxGap(a: WBox, b: WBox): number {
  return Math.max(0, b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1)
}

/** 글씨 상태가 끝나는 사유 — **둘 중 먼저 오는 것**이다(39-3).
 *  ⛔ 새 제스처는 없다: 둘 다 사람이 어차피 하는 동작이라 따로 배울 게 없다. */
export type WriteEnd =
  /** 손이 멈췄다(`WRITE_IDLE_MS`) — 숫자를 쓰는 중에 그만큼 쉬는 일은 드물다 */
  | 'idle'
  /** 뭉치에서 **먼 곳**에 새 획이 왔다 — 작도로 돌아간 것이다 */
  | 'far'
  /** 사람이 다른 도구·다른 종이로 갔다 · 문서가 갈렸다 */
  | 'left'

/** ① **손이 멈췄는가.** 시각은 **살아 있는 값**을 호출자가 넣는다(#73 ㉡ — 동결 참조 ⛔),
 *  그래서 시험이 가짜 시계로 양끝을 잰다. `lastMs`는 마지막 글씨 획이 끝난 시각. */
export const writeIdle = (lastMs: number, now: number, idleMs: number): boolean =>
  now - lastMs >= idleMs

/** ② **이 획이 뭉치에서 «먼 곳»인가.** 척도는 **글자 크기**(화면 px)이고, 문은
 *  32-1의 뭉치 간격 규칙과 **같은 값**을 쓴다(`DIM_GLYPH_MAX_PX × DIM_GROUP_SPAN` —
 *  새 숫자 ⛔ · #54). 뭉치가 아직 비었으면(`cluster === null`) 먼 곳일 수 없다 —
 *  첫 획은 언제나 그 뭉치의 시작이다.
 *
 *  ⚠ **간격이지 중심 거리가 아니다**: 「2500」처럼 이어 쓰면 뭉치 상자가 가로로 길어지는데
 *  중심 거리로 재면 자릿수가 늘수록 다음 자리가 «멀어진다». 간격은 자릿수에 안 늘어난다
 *  (32-3의 `unit`이 상자 대각에서 짧은 변으로 바뀐 것과 **같은 형태의 결함**이다).
 *
 *  ⚠⚠ **묻는 시점 때문에 `next`가 «점»일 수 있다**(획이 시작될 때 판정한다 — 그때는 그
 *  획의 상자를 아직 모른다). 그래서 씨앗 쪽을 **글자 반쪽만큼 부풀려** 둔다(`inflate`) —
 *  안 그러면 같은 문이 «점으로 잴 때» 글자 높이만큼 더 빡빡해진다. 팔이 그것을 실제로
 *  빨갛게 잡았다(누른 자리에서 86 px 위에 쓴 첫 획이 「먼 곳」으로 읽혔다). */
export function writeFar(
  cluster: WBox | null, next: WBox, glyphPx: number, farSpan: number,
): boolean {
  if (!cluster) return false
  return boxGap(cluster, next) > glyphPx * farSpan
}
