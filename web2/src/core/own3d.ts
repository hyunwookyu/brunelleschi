// 자립 구조(web2-13 4부 · 개정 3 초안 §2·§7·§9.1) — 깃발 뒤 · **기본 켜짐**
// (web2-14 1번 — 사람이 실기기 판정으로 켰다. 이제 이 경로가 정본이다).
//
// 「정의는 사건이다」: 카메라가 닫힌 뒤(§9.2 — constructionDone) 사슬이 놓은 3D를
// 획이 **소유**한다(Stroke.own3). 근거 획이 지워져도 유지된다 — 관계가 아니라 사건.
// 승격 사건(카메라 서명 변화)이 나면 전부 버리고 사슬로 다시 올려 다시 굳힌다
// (2부 측정 promote_freeze_web2.json이 정한 갈래 — 굳힌 3D는 승격을 못 살아남는다).
//
// ⚠ 깃발(App.own3d)이 꺼져 있으면(설정 — A-4 대체 경로) 이 파일의 어떤 함수도 앱
// 경로에서 불리지 않는다 — 그때는 옛 사슬 동작 그대로다(web2-13 4부 불변식이 그 대역).

import type { Stroke, CamPose } from './types'
import { type Analysis, DRAW_POSE, project, rayThrough } from './camera'
import { dist2, add3, sub3, mul3, dot3, cross3, norm3, len3, type V3, type Pt } from './vec'
import { closestOnLineToRay, axisOfStroke, type LiftResult } from './lift'
import { atOwnPose } from './waitfade'
import { C } from './constants'

/** 검증 불변식(4-a — «잉크가 심판이다» · 초안 §7):
 *  저장된 3D를 지금 카메라로 사영하면 그 획의 `pts2d`(확정 끝점 a·b)와 맞아야 한다.
 *  획 하나로 판정된다 — 다른 획을 안 본다.
 *
 *  반환: 어긋남(px, 두 끝의 최대) — own3가 없으면 null(판정 대상 아님).
 *  ⚠ `dim` 획의 b 끝은 재지 않는다 — 치수가 길이를 «대체»하므로(사람의 명시 입력)
 *  b3의 사영은 구성상 s.b와 다르다. 잉크 심판의 알려진 예외이고 a 끝은 그대로 잰다.
 *  ⚠ 사영이 안 되면(카메라 뒤) Infinity — 「맞는다」로 조용히 통과하지 않는다. */
export function own3Deviation(an: Analysis, s: Stroke): number | null {
  if (!s.own3) return null
  const pose: CamPose = s.view ?? DRAW_POSE
  const pa = project(an, pose, s.own3.a)
  let d = pa ? dist2(pa, s.a) : Number.POSITIVE_INFINITY
  if (s.dim === undefined) {
    const pb = project(an, pose, s.own3.b)
    d = Math.max(d, pb ? dist2(pb, s.b) : Number.POSITIVE_INFINITY)
  }
  return d
}

/** 4-a 허용 오차(px) — **수치 동일성 검사**이지 공간 여유가 아니다.
 *  굳힘은 리프팅 결과의 사본이므로 같은 카메라 재사영은 fp 왕복 대역(1e-13 실측 —
 *  promote_freeze의 오라클 행)이고, .brnl 왕복은 JSON 전체 정밀도라 역시 fp 대역이다.
 *  0.01은 그 대역의 열 자릿수 위·«틀린 3D»(수십~수백 px — 2부 원장)의 서너 자릿수
 *  아래다 — 넓은 골 가운데. ⚠ 「정상이 안 걸린다」는 경험적 주장이다(4차 [44]) —
 *  알려진 예외가 이미 하나 있고(dim — own3Deviation이 뺀다) 예외 후보 전수는
 *  AS-C47이 유보로 든다. 실측 여유는 own3d_invariant_web2.json(국면 넷)이 정본.
 *  선례: LINE_MATCH_PX 0.5도 같은 성격(수치 동일성)인데 그쪽은 화면 판정이라 AA
 *  대역을 두었고, 여기는 순수 수치 대조라 더 좁다. */
export const OWN3_TOL_PX = 0.01

/** 카메라 서명 — 승격 «사건»의 판정자(4-c · 초안 §9.1·§9.2).
 *  f·주점·fSource가 움직이면 승격이다(2부 원장: 그 둘이 굳힌 3D를 깨는 원인 전부다).
 *  ⚠ vps 개수는 안 넣는다 — 셋째 소실점 «찍기»는 축 방향만 더하고 카메라(f·주점)를
 *  안 바꾼다(camera.ts — f는 앞 둘에서만). 그때 굳힌 3D는 그대로 유효하다. */
export const camSig = (an: Analysis): string =>
  `${an.fSource}|${an.f ?? 'n'}|${an.principal ? an.principal.x : 'n'}|${an.principal ? an.principal.y : 'n'}`

// ── 4-g: 교점으로 정의하기 — 나중에 온 선이 먼저 있던 대기선을 못 박는다(초안 §3) ──

/** 점-선분 거리(2D) — 화면 판정용 */
const distToSeg = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** 방금 확정된(3D가 있는) 획 A의 **뗀 끝**이 대기선 B의 표현 구간 위에서 끝났으면
 *  B를 정의한다(사건): P = A의 그 끝 3D — B는 P를 지나고 방향(축)을 아니 완전히
 *  정의된다. 새 수학이 없다 — lift의 광선-직선 리프팅을 「교점」 근거에 한 번 더.
 *
 *  좁힌 문 셋(초안 §3.0·§3.1 — 전부 의도하지 않은 정의를 막는 자리):
 *  · **끝점만 센다**(㉯) — 그리는 중의 스침·지나감은 사건이 아니다. 제도에서 수선은
 *    만나는 데까지 긋고 멈춘다 — 끝난다는 것 자체가 의도의 표시다.
 *  · **B의 시점에서만** — 다른 시점에서 그은 A와의 화면 일치는 «시점 따라 생멸하는
 *    가짜 만남»이다(AS-C41). ⚠ 판정은 `atOwnPose`(같은 포즈)다 — 3-a의 가시 창(30°
 *    감쇠 안에서는 흐리게 «보인다»)보다 **좁다**. 흐리게 보이는 각도에서 붙여도 사건이
 *    아니다(4차 리뷰어 [43] — «보인다»를 두 뜻으로 쓰지 않는다).
 *  · **방향이 선 B만** — 축 배정이 없는 자유 대기 획은 P 하나로 직선이 안 선다
 *    (방향 미정 — 반증 조건이 이 갈래다).
 *
 *  ⚠ (web2-13 4차 [41]의 「실효 문 0.5px · 도달 집합 = 끝점·중점 오스냅뿐」은
 *  **web2-14 2번으로 뒤집혔다** — 실기기가 «손으로는 안 된다»로 판정했다.) 지금 문은
 *  선언대로 **오스냅 반경**이다: ① 대기 획의 그린 구간이 near 오스냅 대상이라(osnap.ts)
 *  끝점이 B 잉크 위에 정확히 붙을 수 있고 ② P를 A직선∩B해석면으로 풀어(아래) 뗌
 *  오차가 B의 위치에 안 실린다. 왕복 문(0.5px)은 이제 퇴화 방어 본연으로 돌아갔다 —
 *  B 자신의 잉크가 축선에서 벗어난 획(자유롭게 긋고 나중에 축으로 읽힌 것)은 여전히
 *  거부된다: 그래야 정의된 3D가 잉크 심판(§7)을 통과한다.
 *  무산은 `missed`로 센다 — 조용히 버리지 않는다(3-b 규약).
 *  ⚠ 표현 구간(pts2d 확정 끝점 사이)만 본다 — 무한 연장은 안 본다(§4 — 범위 밖). */
/** 무산 계수 — «끝이 B 위에서 끝났다»(㉯)가 성립한 뒤의 무산을 **전부** 센다.
 *  ⚠ web2-16 2-b: 종전에는 A가 3D가 아니면 **계수 없이** 첫 줄에서 빠져나갔다 —
 *  「축을 잃어서」 죽는 경로가 진단에 안 보였다(#69 ㉡ · DEFERRED #43 「후보도 못 된 채
 *  죽는 것」의 그 자리). 이제 문(끝이 B 위)을 먼저 세우고, 문 안에서 죽은 것은 사유
 *  불문 전부 계수에 잡힌다: noCam(카메라 미확정) · aNot3d(A 자신이 3D가 아니다 —
 *  축 손실이 여기로 온다) · pose · axis(B 방향 미정) · lift · roundtrip. */
export interface TouchStats { ok: number; noCam: number; aNot3d: number; pose: number; axis: number; lift: number; roundtrip: number }
export const emptyTouchStats = (): TouchStats =>
  ({ ok: 0, noCam: 0, aNot3d: 0, pose: 0, axis: 0, lift: 0, roundtrip: 0 })
export function defineByTouch(lift: LiftResult, a: Stroke, osnapRadiusPx: number):
  { defs: { id: number; own3: NonNullable<Stroke['own3']> }[]; missed: TouchStats } {
  const missed: TouchStats = emptyTouchStats()
  const an = lift.an
  const out: { id: number; own3: NonNullable<Stroke['own3']> }[] = []
  // 문 먼저 — «끝이 B 위에서 끝났다»(㉯)가 성립하는 대기선 목록. 문 밖은 후보가
  // 아니었으므로 안 센다(종전 규약 그대로). 문 안의 무산은 아래에서 전부 센다(2-b).
  const touched: number[] = []
  for (const idB of lift.waiting) {
    if (idB === a.id) continue                        // 자기 끝은 자기 위다(거리 0) — 문이 아니다
    const b = lift.strokes.get(idB)
    if (!b || b.own3) continue                        // 첫 사건이 이긴다(과결정 없음)
    if (distToSeg(a.b, b.a, b.b) > osnapRadiusPx) continue   // 뗀 끝이 B 위인가(㉯)
    touched.push(idB)
  }
  if (touched.length === 0) return { defs: out, missed }
  if (!an.constructionDone) {                          // 카메라가 닫힌 뒤의 기전(§9.2)
    missed.noCam += touched.length
    return { defs: out, missed }
  }
  const seg = lift.lifted.get(a.id)
  if (!seg) {                                          // A 자신이 3D여야 P를 줄 수 있다
    missed.aNot3d += touched.length                    // ← 「축을 잃어서」가 죽는 자리(2-b)
    return { defs: out, missed }
  }
  const poseA: CamPose = a.view ?? DRAW_POSE
  for (const idB of touched) {
    const b = lift.strokes.get(idB)
    if (!b) continue
    const poseB: CamPose = b.view ?? DRAW_POSE
    if (!atOwnPose(poseA, poseB)) { missed.pose++; continue }     // B의 시점에서만(§3.0)
    const axis = axisOfStroke(an, poseB, b.a, b.b)
    if (!axis) { missed.axis++; continue }            // 방향 미정 — 정의 불가(반증 조건)
    const dir = an.axes.find(x => x.id === axis)?.dir
    if (!dir) { missed.axis++; continue }
    const rayA = rayThrough(an, poseB, b.a)
    const rayB = rayThrough(an, poseB, b.b)
    if (!rayA || !rayB) { missed.lift++; continue }
    // ── 사건의 자리 P(web2-14 2번 수리 ㉑) — «A의 뗀 끝 그대로»가 아니라
    // **A의 3D 직선 ∩ B의 해석면**(눈과 B의 잉크 선분이 만드는 평면)이다.
    // 뗀 끝을 그대로 쓰면 손의 뗌 오차 δpx가 P의 사영을 B 잉크에서 δ만큼 벗어나게
    // 하고, 아래 왕복 문(0.5px)이 그 δ를 그대로 거부했다 — 오스냅 반경(8px) 대역의
    // 손이 0.5px 문을 열 수 없어 «코드에는 있는데 손으로는 안 된다»가 됐다(실기기
    // 판정 → vptouch.test 재현: 수리 전 missed.roundtrip=1). 교점으로 풀면 proj(P)가
    // 구성상 B 잉크 위라 왕복이 fp 대역이다 — 손 오차는 «어디서 뗐나»(A의 끝)에만
    // 남고 «B가 어디 서나»에는 안 실린다. 끝점 사건 문(위 distToSeg)은 그대로다.
    const u = sub3(seg.b3, seg.a3)
    if (len3(u) < 1e-12) { missed.lift++; continue }
    const un = norm3(u)
    const n = cross3(rayA.d, rayB.d)                  // B 해석면의 법선(면은 눈을 지난다)
    const denom = dot3(n, un)
    if (Math.abs(denom) < 1e-12) { missed.lift++; continue }   // A가 해석면과 평행 — 교점 없음
    const t = dot3(n, sub3(rayA.o, seg.b3)) / denom
    const P: V3 = add3(seg.b3, mul3(un, t))
    // 사건은 여전히 «뗀 끝»의 일이다 — P가 뗀 끝의 오스냅 대역을 벗어나면(얕은 각의
    // 원거리 교점) 의도로 읽지 않는다. 위 distToSeg 문과 같은 반경을 쓴다.
    const pp = project(an, poseB, P)
    if (!pp || dist2(pp, a.b) > osnapRadiusPx) { missed.lift++; continue }
    const a3 = closestOnLineToRay(P, dir, rayA)
    const b3 = closestOnLineToRay(P, dir, rayB)
    if (!a3 || !b3) { missed.lift++; continue }
    // 퇴화 방어 = **실효 문**(위 ⚠⚠) — B의 2D가 그 3D의 사영과 수치 동일해야 한다.
    // 이것이 없으면 정의된 3D가 잉크 심판(§7)에서 어긋난다(같은 임계 — LINE_MATCH_PX).
    const pa = project(an, poseB, a3)
    const pb = project(an, poseB, b3)
    if (!pa || !pb || dist2(pa, b.a) > C.LINE_MATCH_PX || dist2(pb, b.b) > C.LINE_MATCH_PX) { missed.roundtrip++; continue }
    out.push({ id: idB, own3: { a: a3, b: b3, axis } })
    missed.ok++
  }
  return { defs: out, missed }
}
