// 자립 구조(web2-13 4부 · 개정 3 초안 §2·§7·§9.1) — **깃발 뒤, 기본 꺼짐.**
//
// 「정의는 사건이다」: 카메라가 닫힌 뒤(§9.2 — constructionDone) 사슬이 놓은 3D를
// 획이 **소유**한다(Stroke.own3). 근거 획이 지워져도 유지된다 — 관계가 아니라 사건.
// 승격 사건(카메라 서명 변화)이 나면 전부 버리고 사슬로 다시 올려 다시 굳힌다
// (2부 측정 promote_freeze_web2.json이 정한 갈래 — 굳힌 3D는 승격을 못 살아남는다).
//
// ⚠ 깃발(App.own3d)이 꺼져 있으면 이 파일의 어떤 함수도 앱 경로에서 불리지 않는다 —
// 옛 사슬이 정본이다(4부 불변식: 꺼짐 동작 전후 동일). 기본값은 **사람만** 켠다(4-f).

import type { Stroke, CamPose } from './types'
import { type Analysis, DRAW_POSE, project, rayThrough } from './camera'
import { dist2, type V3, type Pt } from './vec'
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
 *  아래다 — 정상은 절대 안 걸리고 오류는 절대 통과 못 하는 넓은 골 가운데.
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
 *    가짜 만남»이다(AS-C41). 오스냅과 같은 원칙: 보이는 것끼리만 만난다.
 *  · **방향이 선 B만** — 축 배정이 없는 자유 대기 획은 P 하나로 직선이 안 선다
 *    (방향 미정 — 반증 조건이 이 갈래다).
 *  판정 반경은 오스냅 반경(화면 px) — 사람이 «붙였다»고 아는 그 문과 같은 문이다.
 *  ⚠ 표현 구간(pts2d 확정 끝점 사이)만 본다 — 무한 연장은 안 본다(§4 — 범위 밖). */
export function defineByTouch(lift: LiftResult, a: Stroke, osnapRadiusPx: number):
  { id: number; own3: NonNullable<Stroke['own3']> }[] {
  const an = lift.an
  if (!an.constructionDone) return []                 // 카메라가 닫힌 뒤의 기전이다(§9.2)
  const seg = lift.lifted.get(a.id)
  if (!seg) return []                                 // A 자신이 3D여야 P를 줄 수 있다
  const poseA: CamPose = a.view ?? DRAW_POSE
  const out: { id: number; own3: NonNullable<Stroke['own3']> }[] = []
  for (const idB of lift.waiting) {
    const b = lift.strokes.get(idB)
    if (!b || b.own3) continue                        // 첫 사건이 이긴다(과결정 없음)
    const poseB: CamPose = b.view ?? DRAW_POSE
    if (!atOwnPose(poseA, poseB)) continue            // B의 시점에서만(§3.0)
    if (distToSeg(a.b, b.a, b.b) > osnapRadiusPx) continue   // 뗀 끝이 B 위인가(㉯)
    const axis = axisOfStroke(an, poseB, b.a, b.b)
    if (!axis) continue                               // 방향 미정 — 정의 불가(반증 조건)
    const dir = an.axes.find(x => x.id === axis)?.dir
    if (!dir) continue
    const P: V3 = seg.b3                              // A의 뗀 끝 = 사건의 자리
    const rayA = rayThrough(an, poseB, b.a)
    const rayB = rayThrough(an, poseB, b.b)
    if (!rayA || !rayB) continue
    const a3 = closestOnLineToRay(P, dir, rayA)
    const b3 = closestOnLineToRay(P, dir, rayB)
    if (!a3 || !b3) continue
    // 퇴화 방어 — 직선이 광선과 거의 평행이면 리프팅이 멀리 튄다. 사영 왕복으로 잰다
    // (수치 동일성 — LINE_MATCH_PX의 논리): B의 2D가 그 3D의 사영과 안 맞으면 버린다.
    const pa = project(an, poseB, a3)
    const pb = project(an, poseB, b3)
    if (!pa || !pb || dist2(pa, b.a) > C.LINE_MATCH_PX || dist2(pb, b.b) > C.LINE_MATCH_PX) continue
    out.push({ id: idB, own3: { a: a3, b: b3, axis } })
  }
  return out
}
