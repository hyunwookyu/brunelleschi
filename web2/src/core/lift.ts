// 3D 리프팅 — 확정 후 경로에 판정이 없다(원칙 c).
// 시작점이 3D에 있고 방향이 축이면 끝점은 광선-직선 최근접점. 계산이다.
// 시작점이 3D에 없으면 그 획은 2D로 대기한다 — 거부가 아니라 상태다.
// 대기 획은 조건이 갖춰지면 승격하고, 승격은 연쇄한다.

import { onPaper, yellowIds, isFlat2d, type Doc, type Stroke, type CamPose } from './types'
import { C } from './constants'
import {
  analyze, type Analysis, type AxisId, DRAW_POSE,
  screenAxes, project, rayThrough, pointOnGround, pointOnCeiling, vpDeviation, type Ray,
} from './camera'
import {
  type Pt, type V3, add3, sub3, mul3, dot3, dist2, norm3, len3,
} from './vec'

/** 대기의 **사유** — 이름이 원인마다 하나다(#43: 한 계수에 합치면 진단이 원인을 오귀속한다).
 *  뒤의 셋은 web2-37 1번이 더했다 — 가상 교차까지 보고도 못 세운 자리들이다:
 *  `noPoint` = 명시 점도 교차도 없다(그은 자리에 아무 3D도 안 지났다) ·
 *  `onePoint` = 점이 하나뿐이라 방향이 안 선다(명시 1 + 교차 0 · 또는 명시 0 + 교차 1) ·
 *  `nearCross` = 교차는 둘인데 **화면에서 너무 가까워** 방향을 믿을 수 없다(퇴화). */
export type WaitWhy = 'aboveHorizon' | 'onHorizon' | 'hasHeight' | 'mixedWait' | 'straddle'
  | 'noPoint' | 'onePoint' | 'nearCross'

export interface LiftedSeg {
  a3: V3
  b3: V3
  axis: AxisId | null
}

export interface LiftResult {
  an: Analysis
  lifted: Map<number, LiftedSeg>
  /** 내용 획인데 아직 3D 미확정 — 실패가 아니라 대기 */
  waiting: number[]
  /** 대기의 **사유**(web2-17 1-c·4부) — 조용히 대기시키지 않는다. 원인이 셋이라 이름도
   *  셋이다(2차 리뷰어 [9] — 한 계수에 합치면 진단이 원인을 오귀속한다 #43):
   *  'aboveHorizon' = 그 끝이 지평선 **위쪽**이라 광선이 위로 가 지면과 영영 안 만난다
   *  (올려다보는 구도 — 팬으로 지평선을 옮기는 것이 답이다. DEFERRED에 구도 자체의 해법).
   *  'onHorizon' = 그 끝이 지평선 **그 자리**(대역 안)라 광선이 지면과 평행하다
   *  'straddle' = 한 끝은 지평선 위·한 끝은 아래(web2-27 1번) — **정의상 불가능**하다:
   *    그 선은 무한대로 간다. 실패가 아니라 「그렇게 못 놓는다」이고 조용히 안 버린다.
   *  (지평선 따라긋기 획 — 퇴화. 카메라에도 지면에도 아무 일이 없다).
   *  'hasHeight' = 소실점 축인데 **모델에 이미 높이가 있어** 지면 규칙이 안 걸렸다
   *  (4부 — 위치 미정: 교점(xint)·연결이 정의한다. 죽음이 아니라 국면의 사실이다).
   *  'mixedWait' = 소실점 축이고 높이도 없는데 **대기에 비축 획이 섞여 있어** 지면 규칙이
   *  안 걸렸다(4부 판별자 ② — 2차 리뷰어 [5]: 이 차단도 사유가 있어야 한다).
   *  진단 패널이 네 수를 가른다. */
  waitWhy: Map<number, WaitWhy>
  /** 게이지 앵커가 된 획 (전역 스케일의 게이지 — 유일한 자유 선택) */
  anchorId: number | null
  /** id → 획 (문서에서 그대로 — 조회 편의) */
  strokes: Map<number, Stroke>
  /** **세계 1단위 = 몇 mm** — 파생이다(web2-08 지시 4-1): 문서 순서상 첫 치수 획의
   *  `dim ÷ (무치수 풀이 길이)`. 치수가 없으면 null(무스케일). 계산은 아래 `scaleOf`. */
  mmPerUnit: number | null
  /** **축척을 정한 획**(web2-32 5번) — `scaleOf`가 실제로 고른 그 획이다. null = 축척 미정.
   *  화면이 「어느 치수가 정했는가」를 이것으로 읽는다. 같은 판정을 밖에서 다시 하면
   *  출처가 둘이 되고 겹·문서 순서 규칙이 갈리는 날 조용히 어긋난다(#54) — 고른 자리가
   *  자기가 고른 것을 그대로 보고한다. `mmPerUnit !== null` ↔ `scaleId !== null`이 짝이다. */
  scaleId: number | null
  /** **치수를 적용하기 «전»의 기하 길이**(세계 단위) — 치수가 실린 획만(web2-32 7번).
   *  「잰 값」의 출처다. ⚠⚠ 적용 «뒤» 길이를 재면 `dim/mmPerUnit`이 그대로 나와
   *  **구성상 항등**이다(#77 ㉡ — AS-C107이 그 함정이었고 29-2가 그래서 1.000000을 얻었다).
   *  여기 남는 값은 «모델이 가진 값»이고 사람이 «적은 값»과 갈릴 수 있다 — 그 갈림이
   *  32-7의 어긋남이다. 축척을 정한 획에서는 구성상 어긋남이 0이다(그 획이 분모였다). */
  dimGeom: Map<number, number>
}

/** 직선 P0+t·a 와 광선의 최근접점(직선 위의 점). 평행이면 null. */
export function closestOnLineToRay(P0: V3, a: V3, r: Ray): V3 | null {
  const w0 = sub3(P0, r.o)
  const B = dot3(a, r.d)
  const denom = 1 - B * B
  if (denom < 1e-12) return null
  const D = dot3(a, w0)
  const E = dot3(r.d, w0)
  const t = (B * E - D) / denom
  return add3(P0, mul3(a, t))
}

/** **화면에서** 두 선분이 만나는가 — 만나면 그 점과 각 선분 위의 매개변수.
 *  가상 교차(web2-37 1번)의 기하 몫이다. 3D는 여기 없다 — 화면만 본다.
 *  ⚠ 두 선분 «안»으로 제한한다(t·u ∈ [0,1]): 「획이 무엇을 **지나갔는가**」가 물음이고,
 *  연장까지 받으면 그것은 지나간 것이 아니라 «그 쪽을 향했다»가 된다(연장선 오스냅의 자리).
 *  삐져나오기는 표현이라 여기 없다(`overshoot.ts` — 저장 좌표를 안 늘린다). */
export function screenCross(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; u: number; q: Pt } | null {
  const r = { x: b.x - a.x, y: b.y - a.y }
  const sdir = { x: d.x - c.x, y: d.y - c.y }
  const den = r.x * sdir.y - r.y * sdir.x
  if (Math.abs(den) < 1e-12) return null            // 화면에서 평행 — 교차가 없다
  const qp = { x: c.x - a.x, y: c.y - a.y }
  const t = (qp.x * sdir.y - qp.y * sdir.x) / den
  const u = (qp.x * r.y - qp.y * r.x) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { t, u, q: { x: a.x + r.x * t, y: a.y + r.y * t } }
}

/** 획의 축 배정 — 확정 좌표가 이미 스냅돼 있으므로(원칙 d) 재계산은 안정적이다.
 *  기준은 스냅과 같다 — 둘 다 **각도**다: 유한 축은 sin(획↔소실점 각) ≤ VP_DIR_RATIO
 *  (수직거리 ÷ **시작점에서 소실점까지의 거리**), 화면 평행 축은 sin(획↔축방향 각)
 *  ≤ SCREEN_PARALLEL_RATIO. 가장 가까운 것.
 *  ⚠ 이것은 **배정**의 물음이고, 「새 소실점을 만드는가」(`classifyNext`)와 다르다 —
 *  그쪽은 처짐을 px로 잰다(`PARALLEL_PX`). 같은 임계로 두 물음을 재던 것이 결함이었다. */
export function axisOfStroke(an: Analysis, pose: CamPose, a: Pt, b: Pt): AxisId | null {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  if (L === 0) return null
  let best: AxisId | null = null
  let bestScore = 1 // score = 편차/임계 — 1 미만이면 붙는다
  for (const ax of screenAxes(an, pose)) {
    let dev: number, tol: number
    if (ax.vp) {
      // **판정식은 `camera.ts`의 `vpDeviation` 하나다**(원칙 a · PITFALLS #54) —
      // 여기에 같은 식을 다시 쓰면 두 자리가 언젠가 갈린다.
      const d = vpDeviation(ax.vp, a, b)
      if (d === null) continue
      dev = d
      tol = C.VP_DIR_RATIO
    } else if (ax.dir) {
      // 화면 방향 축 — 획 방향과의 사인 편차
      const dl = Math.hypot(ax.dir.x, ax.dir.y)
      dev = Math.abs(dx * ax.dir.y - dy * ax.dir.x) / (L * dl)
      tol = C.SCREEN_PARALLEL_RATIO
    } else continue
    const score = dev / tol
    if (score < 1 && score < bestScore) { best = ax.id; bestScore = score }
  }
  return best
}

const axisDir = (an: Analysis, id: AxisId): V3 | null =>
  an.axes.find(x => x.id === id)?.dir ?? null

/** 문서 전체를 처음부터 리프팅한다 — 카메라가 바뀌면(2점 승격) 전부 다시 푼다.
 *  `useOwn`(web2-13 4부 — 깃발): 획이 소유한 3D(`Stroke.own3`)를 사슬의 씨앗으로
 *  선등록한다. **기본 false — 그때 이 함수는 종전과 완전히 같다**(4부 불변식). */
export function liftAll(doc: Doc, useOwn = false): LiftResult {
  const { mm, id } = scaleOf(doc)
  return liftPass(doc, mm, useOwn, id)
}

/** **스케일(mm/세계단위) — 파생**(원칙 b · 지시 4-1): 문서 순서상 첫 치수 획을
 *  **치수 없이** 풀었을 때의 길이가 분모다. 그래서 그 획에 치수를 «다시» 입력해도
 *  스케일이 그 값으로 다시 선다 — 저장하면 첫 입력이 굳어 정정과 갈린다(#54).
 *  대가: 치수 없는 풀이를 한 번 더 돈다(문서당 2패스) — 전량 재계산이 이미 원칙이다.
 *  ⚠ 첫 치수 획을 지우면(조각은 dim을 안 물려받는다) 스케일이 다음 치수 획으로
 *  넘어가거나 없어진다 — 조용히 다른 값이 되는 대신 그 사실이 길이 표시(null)로 보인다. */
function scaleOf(doc: Doc): { mm: number | null; id: number | null } {
  // 기준은 «첫 입력»(scaleRef)이고, 그 획이 없어졌으면 문서 순서상 첫 치수 획으로 물러난다.
  // ⚠ 후보는 **layer 없는 획**(종이에 직접 그린 것)뿐이다(web2-21 1-b) — 스케일은 바탕
  // 종이가 정한다. 겹 획이 기준이면 그 겹을 끄는 순간 lifted에서 빠져 문서 전체의 실척이
  // null로 무너졌다(원장 scale_layer_web2_before.json A·B행 — «물러난다»조차 못 했다:
  // scaleRef 획은 doc에서 찾히므로 첫 find가 잡고 lifted 부재로 그대로 null). 실물이
  // 그렇다 — 트레이싱지에 자를 대도 축척은 밑그림의 것이다. 원칙 b(파생)는 불변 —
  // 후보 집합만 좁힌다(#54: 이 한 자리. 옛 파일의 겹 scaleRef도 여기서 걸러진다).
  const s0 = doc.strokes.find(s => s.id === doc.scaleRef && s.dim !== undefined && onPaper(s))
    ?? doc.strokes.find(s => s.dim !== undefined && onPaper(s))
  if (!s0) return { mm: null, id: null }
  const base = liftPass(doc, null)
  const g = base.lifted.get(s0.id)
  if (!g) return { mm: null, id: null }
  const L = len3(sub3(g.b3, g.a3))
  // ⚠ **고른 획을 같이 낸다**(web2-32 5번) — 화면의 「어느 치수가 정했는가」가 이 값을
  // 읽는다. 밖에서 같은 find를 다시 쓰면 그 자리가 겹 규칙·물러남 규칙과 갈린다(#54).
  // 퇴화 길이로 스케일이 못 서면 기준도 없다 — 둘은 언제나 같이 산다.
  return L > 1e-12 ? { mm: s0.dim! / L, id: s0.id } : { mm: null, id: null }
}

function liftPass(doc: Doc, mmPerUnit: number | null, useOwn = false, scaleId: number | null = null): LiftResult {
  const an = analyze(doc)
  const lifted = new Map<number, LiftedSeg>()
  const waitWhy = new Map<number, WaitWhy>()
  /** 가상 교차 패스가 본 «왜 못 세웠나» — **`waitWhy`에 바로 안 적는다**(우선순위 때문이다):
   *  소실점 축 획의 사유(`hasHeight`·`mixedWait`)가 더 구체적이라 그쪽이 먼저 간다.
   *  맨 끝에서 **아직 사유가 없는 획에만** 옮겨 적는다(#43 — 한 이름에 두 원인 ⛔). */
  const crossWhy = new Map<number, 'noPoint' | 'onePoint' | 'nearCross'>()
  const dimGeom = new Map<number, number>()
  let anchorId: number | null = null

  /** ── 치수(web2-08 지시 4-2) — **시작점과 방향만 취하고 길이는 입력값으로 바꾼다** ──
   *  ⚠ 끝점 오스냅으로 붙인 좌표도 치수가 이긴다 — «점이 방향을 이긴다»(#63)와 다른
   *  자리다: 그쪽은 재계산이 사람의 점을 덮는 결함이고, 여기는 **사람이 나중에 준 명시
   *  입력**(치수)이 앞의 점을 대체하는 것이다(지시 문면 그대로).
   *  첫 치수(스케일을 정한 획)도 같은 갈래를 타는데, mmPerUnit이 그 획의 길이에서
   *  나왔으므로 dim/mmPerUnit == 원래 길이 — 구성상 무변형이다(팔이 잰다).
   *
   *  ⚠⚠ **이 자리 하나다**(#54 — web2-32 7번이 합쳤다). 종전에는 같은 다섯 줄이 세
   *  갈래(씨앗·본 패스·되살림 패스)에 복사돼 있었고, 32-7이 필요로 하는 **적용 전 길이**를
   *  세 곳에 따로 심으면 그 셋이 언젠가 갈린다. 그 길이를 여기서 `dimGeom`에 남긴다 —
   *  적용 뒤 길이를 재면 구성상 항등이라 아무것도 안 잰다(#77 ㉡). */
  const applyDim = (s: Stroke, a3: V3, b3: V3): V3 => {
    if (s.dim === undefined) return b3
    const d = sub3(b3, a3)
    const L = len3(d)
    if (L <= 1e-12) return b3
    dimGeom.set(s.id, L)                       // «잰 값»(세계 단위) — 적용 전이다
    if (mmPerUnit === null || mmPerUnit <= 0) return b3
    return add3(a3, mul3(d, s.dim / mmPerUnit / L))
  }

  const strokes = new Map(doc.strokes.map(s => [s.id, s]))
  // **내용 = 표식이 아닌 전부다**(web2-17 1-b — 지평선은 이제 획이 아니라 프레임 상수라
  // 거를 role이 없다). 깊이선은 소실점을 정의하고 *동시에* 사람이 그은 선이다.
  // 3D로 남겨야 그 끝점이 오스냅·연결 대상이 된다.
  // 찍은 소실점 표식은 **점**이라 3D 선이 아니다 — 방향이 없고 무한원에 있다.
  const isMark = (s: Stroke) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) <= C.TAP_MAX_PX
  // 꺼진 겹의 획은 리프팅에서 뺀다(web2-20 4부) — 그래서 오스냅·조각·면의 대상에서도
  // **자동으로** 빠진다(별도 필터를 만들지 않는다 — 출처가 둘이 되면 어긋난다 #54).
  // ⚠ 대기 목록에도 안 넣는다 — 꺼짐은 «안 보이고 3D에 없음»이지 대기가 아니다.
  // own3 필드는 안 지운다(사건의 기록 — 다시 켜면 여기서 도로 올라온다: 왕복 팔).
  // ⚠ analyze(위)는 **모든 획**을 본다 — 카메라는 겹과 무관하다(소실점 획이 든 겹을
  // 꺼도 카메라 불변 — 4부 ① 팔이 못 박는다).
  const offLayers = new Set(doc.layers.filter(l => !l.on).map(l => l.id))
  // 옐로 겹의 획은 **2D다**(web2-22 1부) — 켜져 있어도 3D에 없다. 대기도 아니다(대기는
  // «조건이 갖춰지면 승격»인데 옐로는 매체가 2D라 조건이 없다). 여기서 빠지면 오스냅·
  // 조각·면·waiting 계수 전부 자동으로 빠진다(#54 — 별도 필터 없음, web2-20 4부와 같은 길).
  // 글씨 획도 같은 자리에서 빠진다(web2-32 1번) — **옐로와 같은 규격**이라 술어가 하나다
  // (`isFlat2d`). 여기서 빠지면 오스냅·조각·면·waiting 계수가 전부 자동으로 빠진다.
  const yellow = yellowIds(doc)
  const content = doc.strokes.filter(s => !isMark(s) && !isFlat2d(s, yellow)
    && !(s.layer !== undefined && offLayers.has(s.layer)))
  if (!an.principal || an.f === null) {
    return { an, lifted, waiting: content.map(s => s.id), waitWhy, anchorId, strokes, mmPerUnit, scaleId, dimGeom }
  }

  const mergeTol = C.MERGE_RATIO * an.diag
  const pending = new Set(content.map(s => s.id))

  // 승격된 끝점·선분 목록 — 시작점 매칭 대상
  const endpoints: V3[] = []
  const segs: { a3: V3; b3: V3 }[] = []

  // ── 자립 씨앗(web2-13 4부 — 깃발 켜짐에서만) ──────────────────────────────
  // 소유한 3D는 사슬보다 먼저 선다: 근거 획이 지워져도 이 획은 확정 기하이고,
  // 다른 대기 획이 여기 붙어 올라온다(사슬의 씨앗). dim은 굳힘 시점 값에 이미 반영.
  if (useOwn) {
    for (const s of content) {
      if (!s.own3) continue
      const a3 = { ...s.own3.a }
      let b3 = { ...s.own3.b }
      // 치수(4-2)는 굳힘 «뒤»에도 사람의 명시 입력이 이긴다(web2-14 1번 — 기본 켜짐
      // 전환이 드러낸 회귀: 씨앗이 사슬 풀이를 건너뛰므로 dim 대체가 여기도 필요하다).
      // 멱등이다 — 이미 그 길이면 같은 값. b 끝의 잉크 어긋남은 잉크 심판의 알려진
      // 예외(own3Deviation이 dim 획의 b를 뺀다). 시작점·방향은 씨앗 그대로다.
      b3 = applyDim(s, a3, b3)
      lifted.set(s.id, { a3, b3, axis: (s.own3.axis as AxisId | null) })
      endpoints.push(a3, b3)
      segs.push({ a3, b3 })
      pending.delete(s.id)
    }
  }

  // 시작점·끝점의 3D 결정 — 끝점이 붙었거나, 확정된 선(선분 위) 위에 있으면 그 좌표.
  // "3D가 확정된 선과 교차하거나 끝점이 붙으면 그때 좌표가 정해진다"
  const matchPoint = (s2: Pt, pose: CamPose): V3 | null => {
    let best: V3 | null = null
    let bestD = mergeTol
    for (const p3 of endpoints) {
      const pr = project(an, pose, p3)
      if (!pr) continue
      const d = dist2(pr, s2)
      if (d <= bestD) { best = p3; bestD = d }
    }
    if (best) return best
    // 선분 **직선** 위 — 광선과의 최근접점이고 그 사영이 화면 점과 일치할 때.
    //
    // ⚠ **선분 안(t∈[0,1])으로 제한하지 않는다.** 초판이 제한했고, 그래서 「연장선」
    // 오스냅이 준 좌표를 리프팅이 도로 버렸다 — 사람이 붙인 점인데 획이 대기에 남았다
    // (2026-08-21 실측: 임의 방향 30획 중 5획이 전부 이 자리였다. 전부 `osnap:ext`이고
    // 전부 p3가 있었다). 연장선은 «원 선과 같은 3D 직선 위»라 좌표가 정해진다는 것이
    // 그 오스냅의 정의다 — 리프팅이 그것을 부정하면 안 된다.
    // ⚠ 다만 **바깥쪽은 훨씬 좁게** 받는다. 그냥 mergeTol로 열면 멀리 있는 선의 연장이
    // 얕은 각으로 지나가며 2.3px 어긋난 채 «맞았다»고 나온다(실측) — 불변식 k가 그만큼
    // 헐거워진다. 사람이 연장선 오스냅에 붙였다면 확정 2D가 **바로 그 점의 사영**이므로
    // 왕복 오차가 fp 수준이다. 그래서 바깥쪽 판별자는 공간 여유가 아니라 **수치 동일성**이다.
    const ray = rayThrough(an, pose, s2)
    if (!ray) return null
    for (const seg of segs) {
      const dir = sub3(seg.b3, seg.a3)
      const p3 = closestOnLineToRay(seg.a3, norm3(dir), ray)
      if (!p3) continue
      const L = Math.hypot(dir.x, dir.y, dir.z)
      const t = L > 1e-12 ? dot3(sub3(p3, seg.a3), dir) / (L * L) : -1
      const inside = t >= 0 && t <= 1
      const pr = project(an, pose, p3)
      if (!pr) continue
      const d = dist2(pr, s2)
      if (!inside && d > C.LINE_MATCH_PX) continue
      if (d <= bestD) { best = p3; bestD = d }
    }
    return best
  }

  /** ── 사슬 패스 — **표의 위 두 줄**(web2-37 1번) ────────────────────────────
   *  「명시 점 2」와 「명시 점 1 + 축」이 여기서 답을 낸다. 지면 규칙(첫 선·makesVp)도
   *  여기 있다 — 그것은 추론이 아니라 «그 선이 무엇인가»의 선언이라 교차보다 앞선다.
   *  **이 패스를 소진한 뒤에야 가상 교차가 돈다**(`crossPass`) — 그것이 곧 우선순위다:
   *  나중 패스에서 명시 점이 생길 획을 교차로 먼저 세우면 «명시된 것이 암묵의 것을
   *  이긴다»가 깨진다. 특수 분기가 아니라 **표의 순서를 시간으로 편 것**이다. */
  const chainPass = (): void => {
   let progressed = true
   while (progressed) {
    progressed = false
    for (const s of content) {
      if (!pending.has(s.id)) continue
      const pose = s.view ?? DRAW_POSE
      const axis = axisOfStroke(an, pose, s.a, s.b)

      let a3 = matchPoint(s.a, pose)
      let b3: V3 | null = null
      if (!a3 && axis) {
        // 연결은 방향이 없다 — 끝점 쪽이 먼저 확정돼 있으면 그쪽에서 시작점을 푼다
        b3 = matchPoint(s.b, pose)
        if (b3) {
          const dir = axisDir(an, axis)
          const ray = rayThrough(an, pose, s.a)
          if (dir && ray) a3 = closestOnLineToRay(b3, dir, ray)
        }
      }
      // 소실점을 만드는 선은 지면이다 — 첫 선과 **똑같이** 취급한다(지시 1-a·1-b).
      // 초판은 지면 규칙을 첫 획(`lifted.size === 0`)에만 걸었고, 그래서 두 번째
      // 깊이선이 첫 깊이선과 안 닿는 자리에서 시작하면 앵커가 없어 영영 대기했다
      // (2026-08-21 재현: 지평선→(500,650)에서 vp0 방향→(300,700)에서 vp1 방향에서
      //  둘째 획이 waiting에 남았다. 역할은 'vp'이고 소실점은 실제로 만들어졌다).
      // 소실점을 만드는 선은 **격자의 기준**이므로 둘 다 지면이라는 것이 그 규칙의 근거다.
      const makesVp = an.roles.get(s.id) === 'vp'
      const isFirstLine = lifted.size === 0 && anchorId === null
      if (!a3 && !b3 && (isFirstLine || makesVp) && axis !== null) {
        // ── 첫 선은 지면에 있다 · 소실점을 만드는 선도 지면이다 ──────────
        // 규칙 하나이고 **선의 종류를 안 가린다.** 사람이 그리기 시작할 때 첫 선은
        // 바닥에서 시작한다 — 바닥 모서리를 긋거나, 기둥을 세우거나, 벽 하단을 긋는다.
        // ⚠ **연결이 있으면 연결이 이긴다** — 이 갈래는 `!a3 && !b3`일 때만 온다.
        //    깊이선이 이미 확정된 점에 붙어 있으면 그 좌표가 정답이고(불변식 k),
        //    지면으로 끌어내리면 사람이 붙인 점을 도로 버리는 셈이 된다.
        //
        //   수평선·깊이선  그 선 자체가 Y=0
        //   수직선         아래점이 Y=0 (위쪽 높이는 그 선의 길이가 정한다)
        //
        // 수평·깊이 축은 방향의 y 성분이 0이므로(소실점이 지평선 위에 있다) 한 끝만
        // 지면에 놓으면 **선 전체가 지면이다** — 그래서 두 경우가 한 계산으로 끝난다.
        // 아래·위는 화면 y로 가른다: 롤 0·피치 0이라 화면 y가 곧 높이 순서다.
        // (3점 = 피치 ≠ 0 에서는 다시 봐야 한다. 그때 판단한다.)
        const dir = axisDir(an, axis)
        // ── 바닥이냐 천장이냐(web2-27 1번) ─────────────────────────────────────
        // 두 끝이 **모두** 지평선 위면 천장 갈래다(천장 평면의 정의와 근거는
        // `camera.pointOnCeiling` — 눈높이를 바닥에 대해 되접은 면이다. 이 파일은 그 값을
        // 직접 안 짓는다 — 원칙 a). 두 끝이 지평선을 **가로지르면** 그 선은 무한대로 가므로
        // 접지시키지 않는다 — 실패가 아니라 정의상 불가능이고 사유를 남긴다(지시 3).
        const band = C.OSNAP_RADIUS_PX
        const isUp = (p: Pt) => p.y < an.horizonY - band
        const isDown = (p: Pt) => p.y > an.horizonY + band
        // ⚠⚠ **걸침의 거부는 세로선에 안 걸린다**(팔이 그것을 강제했다 — 아래 반례).
        //    수평·깊이 축은 방향의 y가 0이라 **선 전체가 한 수평면**에 있다: 그런 선이
        //    지평선을 가로지르면 그 평면이 눈높이라는 뜻이고 곧 무한대다 — 거부한다.
        //    세로선은 다르다. 눈앞의 기둥은 **바닥에서 시작해 눈높이를 지나 올라간다** —
        //    가장 흔한 획이다. 그때 답은 «아래 끝이 바닥에 있다»이고 종전 규칙 그대로다.
        //    (초판이 이 갈래를 안 갈라 `fold_measure`의 기둥이 통째로 대기로 떨어졌다.)
        const straddles = axis !== 'V' &&
          ((isUp(s.a) && isDown(s.b)) || (isDown(s.a) && isUp(s.b)))
        const ceiling = !straddles && isUp(s.a) && isUp(s.b)
        // 수직선은 **평면 쪽 끝**을 앵커로 잡는다: 바닥은 아래 끝, 천장은 위 끝(거울상).
        const useB = axis === 'V' && (ceiling ? s.b.y < s.a.y : s.b.y > s.a.y)
        const anchorPt = useB ? s.b : s.a
        // 못 만났다(web2-17 1-c) — 사유를 가른다: 걸침(정의상 불가) · 지평선 대역 안
        // (따라긋기 — 광선이 평면과 평행) · 위쪽인데 천장으로도 안 풀림. 조용히 안 버린다.
        const g = straddles ? null
          : (ceiling ? pointOnCeiling(an, pose, anchorPt) : pointOnGround(an, pose, anchorPt))
        if (!g) {
          waitWhy.set(s.id, straddles ? 'straddle'
            : Math.abs(anchorPt.y - an.horizonY) <= band ? 'onHorizon' : 'aboveHorizon')
        }
        if (g && dir) {
          if (useB) {
            const rayA = rayThrough(an, pose, s.a)
            const solved = rayA ? closestOnLineToRay(g, dir, rayA) : null
            if (solved) { a3 = solved; b3 = g }
          } else {
            a3 = g
          }
          if (a3 && anchorId === null) anchorId = s.id
        }
      }
      if (!a3) continue

      if (!b3) {
        // **점이 방향을 이긴다** — `draft.ts`의 순서와 같다(Rhino 선례).
        //
        // ⚠ 초판은 축이 있으면 **축 풀이를 먼저** 했고, 그래서 사람이 끝점 오스냅으로
        // 붙인 자리를 lift가 도로 옮겼다. 축 판정(`axisOfStroke`)은 **각도 허용**이 있어
        // (`VP_DIR_RATIO` = 0.06 ≈ 3.4°) 끝점에 붙인 획도 «그 축»으로 읽히고, 그러면
        // 끝점이 그 축 위로 미끄러진다. 실측(2026-08-21, 면 항목): 오목 육각형의
        // **닫는 획**이 그 자리였다 — 확정 2D는 (500,520)인데 lift가 (503.4,510.5)에
        // 놓아 **루프가 안 닫혔다**(마디 7개·순환 1개·면적 0 = 나무).
        // 그래서 **닫힘 판정의 답이 여기 있다**: 끝점이 정확히 만날 필요는 없지만,
        // 사람이 붙인 점은 lift가 지켜야 한다(원칙 d).
        b3 = matchPoint(s.b, pose)
        if (!b3 && axis) {
          const dir = axisDir(an, axis)
          const ray = rayThrough(an, pose, s.b)
          if (dir && ray) b3 = closestOnLineToRay(a3, dir, ray)
        }
      }
      if (!b3) { if (anchorId === s.id) anchorId = null; continue }

      b3 = applyDim(s, a3, b3)          // 치수 — 규약과 근거는 `applyDim` 머리주석 하나다

      lifted.set(s.id, { a3, b3, axis })
      endpoints.push(a3, b3)
      segs.push({ a3, b3 })
      pending.delete(s.id)
      waitWhy.delete(s.id)   // 나중 패스의 연결로 올라왔다 — 사유는 대기 중에만 뜻이 있다
      progressed = true
    }
   }
  }
  chainPass()

  // ── 지면 규칙 확대(web2-17 4부 — 대체가 아니라 포함) ────────────────────────
  // **모델에 높이가 아직 없을 때, 소실점 축의 선은 지면선이다.** 소실점이 이미 있는
  // 자리에서 뻗은 선(role은 content — makesVp가 아니다)이 영영 대기하던 자리를 연다.
  //
  // ⚠ 판정은 **연결 패스가 소진된 뒤의 모델 전체**로 한다. 초판은 패스 «중간»에
  // 판정했고, 그러면 문서 앞쪽의 소실점 축 획이 — 뒤에서 올라올 수직선을 보기 전에 —
  // 지면에 앉았다(문서 순서가 답을 바꾼다). own3d.test 4-d·face.test 개구부 팔이 그
  // 회귀를 첫 실행에서 잡았다(D-2 — 초판이 수리 전에 실패했다).
  //
  // ⚠ makesVp와의 겹침(지시 4부 확인 사항): 승격 획(P1→P2의 둘째 소실점 획)은 높이가
  // 생긴 뒤에도 role 'vp'라 위 본 규칙으로 지면에 놓인다 — **makesVp가 이긴다**(종전
  // 규칙 보존 — «소실점을 만드는 선은 격자의 기준»). 이 확장은 makesVp가 아닌 획만
  // 만지므로 두 규칙의 출처는 갈래 둘이되 겹치는 국면이 없다.
  //
  // ⚠⚠ 판별자가 하나 더 있다(지시에 없던 조임 — own3d 4-d·face 개구부 팔이 강제했다):
  // **대기 중인 획이 전부 소실점 축일 때만** 돈다. «높이 없음»만 보면, 사슬이 끊겨
  // 대기로 내려온 — 원래 높이에 있던 — 획 무리(창문 등)까지 지면에 앉는다: 남은 lifted가
  // 지면선뿐이라 문면의 조건이 참이 되기 때문이다. 그것은 조용히 틀린 배치다(A-3).
  // 지면선 벌리기 국면의 실제 모습은 «대기가 전부 소실점 축»이고, 수직·가로 대기 획이
  // 섞여 있다는 것은 구조를 짓던 중(또는 표류)이라는 뜻이다 — 애매하면 놓지 않는다.
  //
  // 하나 올릴 때마다 연결 패스를 다시 돌린다 — 지면에 앉은 선이 다른 대기 획의 연결
  // 대상이 되고, 그 연결이 수직선(높이)을 세우면 다음 판정에서 규칙이 꺼진다.
  const heightless = () => [...lifted.values()].every(g =>
    Math.abs(g.a3.y) < C.HEIGHTLESS_Y && Math.abs(g.b3.y) < C.HEIGHTLESS_Y)
  const pendingAllVp = () => content.every(s => {
    if (!pending.has(s.id)) return true
    const ax = axisOfStroke(an, s.view ?? DRAW_POSE, s.a, s.b)
    return ax === 'vp0' || ax === 'vp1'
  })
  /** 확대 패스 — **한 번에 하나만** 올린다(올린 뒤 사슬을 다시 태운다: 높이가 생겼을 수 있다).
   *  ⚠ 종전에는 이 루프 안에 사슬 패스가 **복사돼** 있었다(#54 — 두 벌이 언젠가 갈린다).
   *  web2-37 1번이 사슬을 `chainPass`로 빼면서 그 복사본을 지웠다 — 코드 경로가 하나다. */
  const extendOnce = (): boolean => {
    if (!heightless() || !pendingAllVp()) return false
    for (const s of content) {
      if (!pending.has(s.id)) continue
      const pose = s.view ?? DRAW_POSE
      const axis = axisOfStroke(an, pose, s.a, s.b)
      if (axis !== 'vp0' && axis !== 'vp1') continue
      const dir = axisDir(an, axis)
      // ── 이 패스도 «걸침»과 «천장»을 가른다(web2-27 1번) ────────────────────────
      // 이 갈래는 vp0·vp1 축만 온다 — 방향의 y가 0이므로 **선 전체가 한 수평면**이다.
      // ⚠⚠ 초판은 여기에 갈래를 안 넣어 **첫 갈래의 거부가 이 패스에서 되살아났다**:
      //    소실점을 관통하는 획(role 'vp')이 `s.a`만 보고 지면에 앉아 **눈 뒤까지 뻗는
      //    선분**이 됐다(실측 z −16.704 → +16.704 — 눈이 원점이다). 그것이 지시가 말한
      //    「무한대로 간다」의 실제 모습이고 **조용히 틀린 배치**다.
      const band2 = C.OSNAP_RADIUS_PX
      const up2 = (p: Pt) => p.y < an.horizonY - band2
      const down2 = (p: Pt) => p.y > an.horizonY + band2
      if ((up2(s.a) && down2(s.b)) || (down2(s.a) && up2(s.b))) {
        waitWhy.set(s.id, 'straddle')
        continue
      }
      // ⚠ **천장 갈래는 여기 없다** — 지시 2가 「`lift.ts`의 **첫 선 처리**에서」로 자리를
      //    못 박았고, 이 패스는 첫 선이 아니라 «높이가 아직 없는 장면의 대기 vp축 획»을
      //    끌어올리는 되살림 패스다. 여기에 천장을 넣었더니 **지평선 위에 그린 평범한
      //    깊이선들이 통째로 3.2m로 올라가** 기존 팔 열둘이 깨졌다(xint·own3d 4-g 등):
      //    사람이 눈높이보다 위에 긋는 것은 흔하고, 그 획들은 **연결로 풀리기를 기다리는
      //    중**이지 「천장에 그린 것」이 아니다. 범위를 안 넓힌다(A-3).
      const g = pointOnGround(an, pose, s.a)
      if (!g) {
        // 못 만났다 — 1-c와 같은 사유 규약(조용히 대기시키지 않는다)
        waitWhy.set(s.id, Math.abs(s.a.y - an.horizonY) <= band2 ? 'onHorizon' : 'aboveHorizon')
        continue
      }
      if (!dir) continue
      const ray = rayThrough(an, pose, s.b)
      const b3 = ray ? closestOnLineToRay(g, dir, ray) : null
      if (!b3) continue
      lifted.set(s.id, { a3: g, b3, axis })
      endpoints.push(g, b3)
      segs.push({ a3: g, b3 })
      pending.delete(s.id)
      waitWhy.delete(s.id)
      if (anchorId === null) anchorId = s.id
      return true        // 하나 올리고 연결 패스부터 다시 — 높이가 생겼을 수 있다
    }
    return false
  }

  /** ── 가상 교차(web2-37 1번) — **표의 아래 세 줄** ─────────────────────────────
   *  「명시 점 1, 축 없음」 · 「명시 점 0 + 축」 · 「명시 점 0, 축 없음」이 여기서 답을 낸다.
   *
   *  새 획이 이미 3D를 가진 선과 **화면에서** 교차하면 그 교차점의 3D는 이미 정해져 있다 —
   *  옛 선은 3D 선이고 그 화면점에 대응하는 3D 점은 하나뿐이다. 3D에서 두 선은 실제로
   *  안 만나지만 **화면평면이 진실이라는 것이 이 앱의 전제**이므로 정당한 구속이다
   *  (오토캐드의 apparent intersection과 같은 자리).
   *
   *  ⚠⚠ **오스냅이 아니다.** 오스냅은 「커서가 무엇에 물리는가」이고 이건 「획이 무엇을
   *  지나갔는가」다 — 커서가 시작할 때는 아직 아무것도 안 지났고 교차는 획 중간에 일어난다.
   *  그래서 `osnap.ts`가 아니라 여기다(30-11이 연장선을 후보 목록에서 빼내 선언된 구속으로
   *  옮긴 것과 같은 이동).
   *
   *  ⚠ **축이 있는데 교차를 둘 쓰지 않는다**(지시문이 못 박았다): 두 옛 선은 서로 다른
   *  깊이에 있고 손으로 그은 획이 지나간 자리도 대충이므로, 두 3D 점을 잇는 방향은
   *  어느 축도 아니게 된다. 건축가가 의도한 것은 **방향**이고 교차는 결과다.
   *  같은 이유로 **「명시 점 1 + 교차 1」이 축을 밀어내지 않는다** — 그 조합은 사슬 패스가
   *  이미 답을 냈고 여기 오지 않는다(아래 `named === 1 && axis` 방어선이 그것을 적는다). */
  const crossOnce = (): boolean => {
    for (const s of content) {
      if (!pending.has(s.id)) continue
      const pose = s.view ?? DRAW_POSE
      const solved = solveByCrossing(s, pose)
      if (!solved) continue
      const b3 = applyDim(s, solved.a3, solved.b3)
      lifted.set(s.id, { a3: solved.a3, b3, axis: solved.axis })
      endpoints.push(solved.a3, b3)
      segs.push({ a3: solved.a3, b3 })
      pending.delete(s.id)
      waitWhy.delete(s.id)
      if (anchorId === null) anchorId = s.id
      return true          // 하나 올리고 사슬부터 다시 — 승격은 연쇄한다
    }
    return false
  }

  /** 문서 순서 — 「이 획을 그을 때 그 선이 **이미 거기 있었는가**」의 판정자. */
  const order = new Map(doc.strokes.map((x, i) => [x.id, i]))

  /** 이 획이 지나간 «가상 교차» 목록 — 획을 따라간 순서(t 오름차순)다.
   *
   *  ⚠⚠ **옛 선만 후보다**(문서 순서가 앞선 획). 지시문의 문면이 「**새 획**이 **이미**
   *  3D를 가진 선과 화면에서 교차하면」이고 소장의 관찰도 「출발한 선이 어느 정도 그어진
   *  후에 다른 선을 교차하여 긋는다」이므로, 교차는 **긋는 그 획**에 대한 증거다.
   *  나중 획이 먼저 있던 대기선을 **되짚어** 굳히는 것은 다른 물음이고, 이 앱은 그것을
   *  이미 다르게 답해 뒀다 — 「지나가기만 한 교차는 사건이 아니다 · 끝점이 닿아야 센다」
   *  (`own3d` 4-g)와 「겹은 아래를 안 바꾼다」(web2-21 층 소유)가 그것이다. 순서 조건이
   *  없으면 그 둘이 조용히 뒤집힌다(실측: 이 조건을 빼면 두 팔이 함께 빨개진다 — D-3의
   *  반증이 그 자리다). 앞으로 잇는 연쇄는 그대로 산다 — 옛 선이 서면 그 뒤 획들이 붙는다. */
  function crossingsOf(s: Stroke, pose: CamPose): { t: number; p3: V3; q: Pt }[] {
    const out: { t: number; p3: V3; q: Pt }[] = []
    // **퇴화 제외**: 옛 선이 카메라를 향해 화면에서 점으로 투영되면 후보에서 뺀다.
    // 자는 새로 안 짓는다(#54) — 「방향을 믿는 최소 길이」가 이미 그 물음의 답이다.
    const minLen = C.MIN_DIR_LEN_RATIO * an.diag
    const mine = order.get(s.id) ?? Infinity
    for (const [oid, o] of lifted) {
      if ((order.get(oid) ?? Infinity) > mine) continue      // 나중 획 — 그때 거기 없었다
      const pa = project(an, pose, o.a3)
      const pb = project(an, pose, o.b3)
      if (!pa || !pb) continue
      if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < minLen) continue
      const hit = screenCross(s.a, s.b, pa, pb)
      if (!hit) continue
      const ray = rayThrough(an, pose, hit.q)
      if (!ray) continue
      const p3 = closestOnLineToRay(o.a3, norm3(sub3(o.b3, o.a3)), ray)
      if (!p3) continue
      out.push({ t: hit.t, p3, q: hit.q })
    }
    out.sort((x, y) => x.t - y.t)
    return out
  }

  /** 후보 3D 선(P0 + dir)이 **그은 획의 raw 점열**과 얼마나 어긋나는가 — 제곱 편차 합(px²).
   *  ⚠ **여러 점을 한꺼번에 맞추지 않는다**(지시문): 손으로 그은 선은 어차피 한 3D 선 위에
   *  안 놓인다. 이 값은 «맞추는 목표»가 아니라 후보 **하나를 고르는 자**다.
   *
   *  ⚠⚠ **이 자가 «안 가르는» 국면이 둘 있다**(2026-08-31 실측 — `xint37_web2.json`):
   *   ㉠ 획을 **정확히 축으로** 그으면 후보 X가 무엇이든 「X를 지나는 축 방향 선」이
   *      **그은 선 그 자체**가 되어 편차가 전부 같다. 손으로 그은 선은 축에서 조금
   *      어긋나 있고 그때만 갈린다(같은 획에서 1.09e5 / 4.13e4 / 6.48e4).
   *   ㉡ 「명시 점 1 + 교차」 갈래는 **언제나** 동점이다 — 명시 점과 임의의 교차를 이은
   *      선은 둘 다 그은 선 위의 점이라 사영이 늘 그은 선이다(원칙 d의 딸린 결과).
   *  동점이면 **`xs`가 t 오름차순이므로 «첫 교차»가 뽑힌다**(`dev < bestDev`가 엄격 부등호다).
   *  그 규칙을 여기 적어 둔다 — 「어쩌다 그렇게 되는 것」과 「그렇게 하기로 한 것」은 다르다.
   *  ⚠ 붐비는 장면에서 이 고르기가 **의도한 교차와 갈리는 비율은 0.875**(24칸 · 후보 2~6개 ·
   *  깊이 갈림 폭 3.14 세계 단위)다. 그림에 «어느 교차를 뜻했는지»가 안 적혀 있기 때문이고,
   *  지시문이 그 자리에 놓은 답이 **37-5(끝의 필압)**다. */
  const rawDev = (a3: V3, b3: V3, s: Stroke, pose: CamPose): number => {
    const pa = project(an, pose, a3), pb = project(an, pose, b3)
    if (!pa || !pb) return Infinity
    const dx = pb.x - pa.x, dy = pb.y - pa.y
    const L = Math.hypot(dx, dy)
    if (L < 1e-9) return Infinity
    const pts = s.raw && s.raw.length >= 2 ? s.raw : [s.a, s.b]
    let sum = 0
    for (const q of pts) {
      const d = ((q.x - pa.x) * dy - (q.y - pa.y) * dx) / L
      sum += d * d
    }
    return sum
  }

  /** 3D 선(P0+dir)에 획의 양 끝을 내려 **구간**을 만든다 — 「구간은 자동이다」(지시문).
   *  삐져나온 부분도 그대로 산다: 자르지 않는다. */
  const spanOn = (P0: V3, dir: V3, s: Stroke, pose: CamPose): { a3: V3; b3: V3 } | null => {
    const rA = rayThrough(an, pose, s.a), rB = rayThrough(an, pose, s.b)
    if (!rA || !rB) return null
    const a3 = closestOnLineToRay(P0, dir, rA)
    const b3 = closestOnLineToRay(P0, dir, rB)
    return a3 && b3 ? { a3, b3 } : null
  }

  /** 표의 아래 세 줄을 **한 자리**에서 푼다(특수 분기 ⛔ — 지시문). */
  function solveByCrossing(s: Stroke, pose: CamPose):
    { a3: V3; b3: V3; axis: AxisId | null } | null {
    const axis = axisOfStroke(an, pose, s.a, s.b)
    const pA = matchPoint(s.a, pose)
    const pB = matchPoint(s.b, pose)
    const named = (pA ? 1 : 0) + (pB ? 1 : 0)
    // 위 두 줄(명시 점 2 · 명시 점 1 + 축)은 사슬이 이미 답을 냈다 — 여기 오면 안 된다.
    // ⚠ 이 두 줄이 「교차가 축을 밀어내지 않는다」와 「축이 명시 점 둘을 못 이긴다」의 코드다.
    if (named === 2) return null
    if (named === 1 && axis) return null
    const xs = crossingsOf(s, pose)
    if (xs.length === 0) { crossWhy.set(s.id, named === 0 ? 'noPoint' : 'onePoint'); return null }

    if (named === 1) {
      // ── 명시 점 1, 축 없음 → 교차 하나를 더해 둘로 만든다 ──────────────────────
      const P = (pA ?? pB)!
      const Pq = pA ? s.a : s.b          // 그 명시 점의 **화면** 자리(원칙 d: 확정 2D다)
      let best: { a3: V3; b3: V3 } | null = null, bestDev = Infinity
      let tooNear = false
      for (const x of xs) {
        // ⚠⚠ **두 점이 화면에서 너무 가까우면 방향을 못 믿는다** — 아래 「교차 둘」 갈래와
        //    **같은 자**를 쓴다(#54: 같은 물음이면 자도 하나다). 이 문이 없으면 교차가
        //    명시 점 바로 옆에 있을 때 3D 방향이 폭발한다: `skew34` 자연 분포에서 어긋남
        //    최대가 4.42 → **128.86**으로 튀었고(문 넣기 전 실측), 그것이 곧 조용히 틀린
        //    배치다(A-3 — 애매하면 놓지 않는다: 대기는 실패가 아니라 상태다).
        if (Math.hypot(x.q.x - Pq.x, x.q.y - Pq.y) < C.MIN_DIR_LEN_RATIO * an.diag) {
          tooNear = true; continue
        }
        const d = sub3(x.p3, P)
        if (len3(d) < 1e-9) continue
        const dir = norm3(d)
        // **명시 점은 그 자리에 그대로 둔다**(원칙 d) — 반대쪽 끝만 광선으로 내린다.
        const other = closestOnLineToRay(P, dir, rayThrough(an, pose, pA ? s.b : s.a)!)
        if (!other) continue
        const cand = pA ? { a3: P, b3: other } : { a3: other, b3: P }
        const dev = rawDev(cand.a3, cand.b3, s, pose)
        if (dev < bestDev) { best = cand; bestDev = dev }
      }
      if (!best) { crossWhy.set(s.id, tooNear ? 'nearCross' : 'onePoint'); return null }
      return { ...best, axis }
    }

    if (axis) {
      // ── 명시 점 0 + 축 → 교차 하나 + 축 ────────────────────────────────────────
      const dir = axisDir(an, axis)
      if (!dir) { crossWhy.set(s.id, 'noPoint'); return null }
      let best: { a3: V3; b3: V3 } | null = null, bestDev = Infinity
      for (const x of xs) {
        const cand = spanOn(x.p3, dir, s, pose)
        if (!cand) continue
        const dev = rawDev(cand.a3, cand.b3, s, pose)
        if (dev < bestDev) { best = cand; bestDev = dev }
      }
      if (!best) { crossWhy.set(s.id, 'noPoint'); return null }
      return { ...best, axis }
    }

    // ── 명시 점 0, 축 없음 → 첫 교차 + 끝 교차 ──────────────────────────────────
    // 둘이 가장 멀어 방향이 가장 안정적이다. **화면 최소 간격**으로 퇴화를 막는다 —
    // 자는 여기서도 「방향을 믿는 최소 길이」다(새 숫자 ⛔ #54).
    const first = xs[0]!, last = xs[xs.length - 1]!
    if (xs.length < 2 || Math.hypot(last.q.x - first.q.x, last.q.y - first.q.y)
      < C.MIN_DIR_LEN_RATIO * an.diag) {
      crossWhy.set(s.id, xs.length < 2 ? 'onePoint' : 'nearCross'); return null
    }
    const d = sub3(last.p3, first.p3)
    if (len3(d) < 1e-9) { crossWhy.set(s.id, 'nearCross'); return null }
    const span = spanOn(first.p3, norm3(d), s, pose)
    if (!span) { crossWhy.set(s.id, 'noPoint'); return null }
    return { ...span, axis }
  }

  // ── 구동 ────────────────────────────────────────────────────────────────────
  // 사슬 → 확대 → **그 둘을 다 소진한 뒤에** 가상 교차. 명시된 것이 암묵의 것을 이긴다.
  // 하나 올릴 때마다 사슬을 다시 태운다(승격은 연쇄한다 — 개정 2 §9.1).
  //
  // ⚠⚠ **두 고리를 한 고리로 합치면 안 된다**(실측이 잡았다 — D-2로 재현했다):
  // 확대 패스의 문은 `heightless()`(모델에 아직 높이가 없다)인데, 교차로 선 획이
  // **높이를 만들면 그 문이 닫힌다**. 한 고리로 번갈아 돌리면 교차 하나가 확대 패스를
  // 죽여 **종전에 서던 획이 대기로 떨어졌다**. 교차를 맨 뒤로 미루면 37 이전의 고정점을
  // **먼저 그대로** 만든 뒤에만 더한다 — 그것이 「무회귀」의 코드다.
  for (;;) { if (!extendOnce()) break; chainPass() }
  for (;;) { if (!crossOnce()) break; chainPass() }
  // 남은 대기 중 소실점 축 획의 사유 — 어느 문이 막았는지 가른다(4부 ⚠ 무산 계수 ·
  // 2차 [5]: 판별자 ②의 차단도 사유가 있어야 한다. #43 — 한 이름에 두 원인을 안 합친다)
  {
    const hh = !heightless()
    for (const s of content) {
      if (!pending.has(s.id) || waitWhy.has(s.id)) continue
      const pose = s.view ?? DRAW_POSE
      const axis = axisOfStroke(an, pose, s.a, s.b)
      if (axis === 'vp0' || axis === 'vp1') waitWhy.set(s.id, hh ? 'hasHeight' : 'mixedWait')
    }
    // 가상 교차가 본 사유는 **여기서** 들어간다 — 위의 더 구체적인 사유를 안 덮는다.
    for (const [id, why] of crossWhy) {
      if (pending.has(id) && !waitWhy.has(id)) waitWhy.set(id, why)
    }
  }

  return { an, lifted, waiting: [...pending], waitWhy, anchorId, strokes, mmPerUnit, scaleId, dimGeom }
}
