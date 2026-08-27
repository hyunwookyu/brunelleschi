// 3D 리프팅 — 확정 후 경로에 판정이 없다(원칙 c).
// 시작점이 3D에 있고 방향이 축이면 끝점은 광선-직선 최근접점. 계산이다.
// 시작점이 3D에 없으면 그 획은 2D로 대기한다 — 거부가 아니라 상태다.
// 대기 획은 조건이 갖춰지면 승격하고, 승격은 연쇄한다.

import type { Doc, Stroke, CamPose } from './types'
import { C } from './constants'
import {
  analyze, type Analysis, type AxisId, DRAW_POSE,
  screenAxes, project, rayThrough, pointOnGround, vpDeviation, type Ray,
} from './camera'
import {
  type Pt, type V3, add3, sub3, mul3, dot3, dist2, norm3, len3,
} from './vec'

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
   *  (지평선 따라긋기 획 — 퇴화. 카메라에도 지면에도 아무 일이 없다).
   *  'hasHeight' = 소실점 축인데 **모델에 이미 높이가 있어** 지면 규칙이 안 걸렸다
   *  (4부 — 위치 미정: 교점(xint)·연결이 정의한다. 죽음이 아니라 국면의 사실이다).
   *  'mixedWait' = 소실점 축이고 높이도 없는데 **대기에 비축 획이 섞여 있어** 지면 규칙이
   *  안 걸렸다(4부 판별자 ② — 2차 리뷰어 [5]: 이 차단도 사유가 있어야 한다).
   *  진단 패널이 네 수를 가른다. */
  waitWhy: Map<number, 'aboveHorizon' | 'onHorizon' | 'hasHeight' | 'mixedWait'>
  /** 게이지 앵커가 된 획 (전역 스케일의 게이지 — 유일한 자유 선택) */
  anchorId: number | null
  /** id → 획 (문서에서 그대로 — 조회 편의) */
  strokes: Map<number, Stroke>
  /** **세계 1단위 = 몇 mm** — 파생이다(web2-08 지시 4-1): 문서 순서상 첫 치수 획의
   *  `dim ÷ (무치수 풀이 길이)`. 치수가 없으면 null(무스케일). 계산은 아래 `scaleOf`. */
  mmPerUnit: number | null
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
  return liftPass(doc, scaleOf(doc), useOwn)
}

/** **스케일(mm/세계단위) — 파생**(원칙 b · 지시 4-1): 문서 순서상 첫 치수 획을
 *  **치수 없이** 풀었을 때의 길이가 분모다. 그래서 그 획에 치수를 «다시» 입력해도
 *  스케일이 그 값으로 다시 선다 — 저장하면 첫 입력이 굳어 정정과 갈린다(#54).
 *  대가: 치수 없는 풀이를 한 번 더 돈다(문서당 2패스) — 전량 재계산이 이미 원칙이다.
 *  ⚠ 첫 치수 획을 지우면(조각은 dim을 안 물려받는다) 스케일이 다음 치수 획으로
 *  넘어가거나 없어진다 — 조용히 다른 값이 되는 대신 그 사실이 길이 표시(null)로 보인다. */
function scaleOf(doc: Doc): number | null {
  // 기준은 «첫 입력»(scaleRef)이고, 그 획이 없어졌으면 문서 순서상 첫 치수 획으로 물러난다
  const s0 = doc.strokes.find(s => s.id === doc.scaleRef && s.dim !== undefined)
    ?? doc.strokes.find(s => s.dim !== undefined)
  if (!s0) return null
  const base = liftPass(doc, null)
  const g = base.lifted.get(s0.id)
  if (!g) return null
  const L = len3(sub3(g.b3, g.a3))
  return L > 1e-12 ? s0.dim! / L : null
}

function liftPass(doc: Doc, mmPerUnit: number | null, useOwn = false): LiftResult {
  const an = analyze(doc)
  const lifted = new Map<number, LiftedSeg>()
  const waitWhy = new Map<number, 'aboveHorizon' | 'onHorizon' | 'hasHeight' | 'mixedWait'>()
  let anchorId: number | null = null

  const strokes = new Map(doc.strokes.map(s => [s.id, s]))
  // **내용 = 표식이 아닌 전부다**(web2-17 1-b — 지평선은 이제 획이 아니라 프레임 상수라
  // 거를 role이 없다). 깊이선은 소실점을 정의하고 *동시에* 사람이 그은 선이다.
  // 3D로 남겨야 그 끝점이 오스냅·연결 대상이 된다.
  // 찍은 소실점 표식은 **점**이라 3D 선이 아니다 — 방향이 없고 무한원에 있다.
  const isMark = (s: Stroke) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) <= C.TAP_MAX_PX
  const content = doc.strokes.filter(s => !isMark(s))
  if (!an.principal || an.f === null) {
    return { an, lifted, waiting: content.map(s => s.id), waitWhy, anchorId, strokes, mmPerUnit }
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
      // 전환이 드러낸 회귀: 씨앗이 사슬 풀이를 건너뛰므로 아래 dim 대체가 여기도 필요하다).
      // 멱등이다 — 이미 그 길이면 같은 값. b 끝의 잉크 어긋남은 잉크 심판의 알려진
      // 예외(own3Deviation이 dim 획의 b를 뺀다). 시작점·방향은 씨앗 그대로다.
      if (s.dim !== undefined && mmPerUnit !== null && mmPerUnit > 0) {
        const d = sub3(b3, a3)
        const L = len3(d)
        if (L > 1e-12) b3 = add3(a3, mul3(d, s.dim / mmPerUnit / L))
      }
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
        const useB = axis === 'V' && s.b.y > s.a.y   // 아래로 그은 수직선
        const g = pointOnGround(an, pose, useB ? s.b : s.a)
        // 지면과 못 만났다(web2-17 1-c) — 사유를 가른다: 지평선 대역 안(따라긋기 — 광선이
        // 지면과 평행) 대 지평선 위쪽(올려다보기 — 광선이 위로). 조용히 대기시키지 않는다.
        // 올려다보는 구도의 해법 자체는 이 회차 밖이다(DEFERRED 「첫 획이 지면 위에 있을
        // 수 없는 구도」). 대역 임계는 classifyNext의 퇴화 갈래와 같은 값(OSNAP_RADIUS_PX).
        if (!g) {
          const py = (useB ? s.b : s.a).y
          waitWhy.set(s.id, Math.abs(py - an.horizonY) <= C.OSNAP_RADIUS_PX ? 'onHorizon' : 'aboveHorizon')
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

      // ── 치수(web2-08 지시 4-2) — **시작점과 방향만 취하고 길이는 입력값으로 바꾼다** ──
      // 끝점 오스냅으로 붙인 좌표도 치수가 이긴다 — «점이 방향을 이긴다»(#63)와 다른
      // 자리다: 그쪽은 재계산이 사람의 점을 덮는 결함이고, 여기는 **사람이 나중에 준
      // 명시 입력**(치수)이 앞의 점을 대체하는 것이다(지시 문면 그대로).
      // 첫 치수(스케일을 정한 획)도 같은 갈래를 타는데, mmPerUnit이 그 획의 길이에서
      // 나왔으므로 dim/mmPerUnit == 원래 길이 — 구성상 무변형이다(팔이 잰다).
      if (s.dim !== undefined && mmPerUnit !== null && mmPerUnit > 0) {
        const d = sub3(b3, a3)
        const L = len3(d)
        if (L > 1e-12) b3 = add3(a3, mul3(d, s.dim / mmPerUnit / L))
      }

      lifted.set(s.id, { a3, b3, axis })
      endpoints.push(a3, b3)
      segs.push({ a3, b3 })
      pending.delete(s.id)
      waitWhy.delete(s.id)   // 나중 패스의 연결로 올라왔다 — 사유는 대기 중에만 뜻이 있다
      progressed = true
    }
  }

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
  let extended = true
  while (extended) {
    extended = false
    if (!heightless() || !pendingAllVp()) break
    for (const s of content) {
      if (!pending.has(s.id)) continue
      const pose = s.view ?? DRAW_POSE
      const axis = axisOfStroke(an, pose, s.a, s.b)
      if (axis !== 'vp0' && axis !== 'vp1') continue
      const dir = axisDir(an, axis)
      const g = pointOnGround(an, pose, s.a)
      if (!g) {
        // 지면과 못 만났다 — 1-c와 같은 사유 규약(조용히 대기시키지 않는다)
        waitWhy.set(s.id, Math.abs(s.a.y - an.horizonY) <= C.OSNAP_RADIUS_PX ? 'onHorizon' : 'aboveHorizon')
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
      extended = true
      break              // 하나 올리고 연결 패스부터 다시 — 높이가 생겼을 수 있다
    }
    if (!extended) break
    // 연결 패스 재실행(위 본 루프와 같은 코드 경로를 다시 태운다)
    let again = true
    while (again) {
      again = false
      for (const s of content) {
        if (!pending.has(s.id)) continue
        const pose = s.view ?? DRAW_POSE
        const axis = axisOfStroke(an, pose, s.a, s.b)
        let a3 = matchPoint(s.a, pose)
        let b3: V3 | null = null
        if (!a3 && axis) {
          b3 = matchPoint(s.b, pose)
          if (b3) {
            const dir = axisDir(an, axis)
            const ray = rayThrough(an, pose, s.a)
            if (dir && ray) a3 = closestOnLineToRay(b3, dir, ray)
          }
        }
        if (!a3) continue
        if (!b3) {
          b3 = matchPoint(s.b, pose)
          if (!b3 && axis) {
            const dir = axisDir(an, axis)
            const ray = rayThrough(an, pose, s.b)
            if (dir && ray) b3 = closestOnLineToRay(a3, dir, ray)
          }
        }
        if (!b3) continue
        if (s.dim !== undefined && mmPerUnit !== null && mmPerUnit > 0) {
          const d = sub3(b3, a3)
          const L = len3(d)
          if (L > 1e-12) b3 = add3(a3, mul3(d, s.dim / mmPerUnit / L))
        }
        lifted.set(s.id, { a3, b3, axis })
        endpoints.push(a3, b3)
        segs.push({ a3, b3 })
        pending.delete(s.id)
        waitWhy.delete(s.id)
        again = true
      }
    }
  }
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
  }

  return { an, lifted, waiting: [...pending], waitWhy, anchorId, strokes, mmPerUnit }
}
