// 소실점·카메라 단일 출처 (원칙 a)
//
// 소실점·주점·f·축 방향은 전부 이 파일의 analyze()에서만 나온다.
// 다른 파일은 Analysis를 읽기만 한다 — 직접 계산은 정적 검사(test/static.test.ts)가 막는다.
//
// 모델:
//   지평선(첫 획, 수평 강제) → 주점 = (W/2, 지평선 y), 피치 0, 롤 0.
//   깊이선과 지평선의 교점이 소실점 — 판정도 대기도 없는 계산이다.
//   소실점 1 → f는 깊이 배율 게이지(기본값 0.87·W). 소실점 2 → f² = |PV₁|·|PV₂|
//   (이론서 6.2 — 두 방향이 "직교 가로 방향"일 때의 식이다. 여기서는 두 깊이선이
//    직교 가로축이라는 것이 작도의 정의이므로 2점 상태 전용으로만 쓴다).
//   거부는 f² ≤ 0 하나뿐(원칙 f) — 두 소실점이 주점 기준 같은 쪽이면 직교 불가.
//
// 세계 좌표: **원점 = 지면**, +x 화면 오른쪽, +y 위, 작도 시선 −z.
//   작도 카메라는 지면 위 `EYE_HEIGHT`에 서서 수평으로 본다(피치 0·롤 0).
//   그래서 **Y=0이 지면**이고, 눈높이가 Y 스케일을 정한다 — f(깊이 압축률)와 다른 축이다.

import type { Doc, Stroke, CamPose } from './types'
import { C } from './constants'
import {
  type Pt, type V3, pt, v3, norm3, mul3, sub3, add3,
  quatConj, quatRotate, QID,
} from './vec'

export type Role = 'horizon' | 'vp' | 'content'
export type AxisId = 'vp0' | 'vp1' | 'H' | 'V'

export interface Vp { x: number; y: number; strokeId: number }
export interface AxisDir { id: AxisId; dir: V3 }

export interface Analysis {
  W: number
  H: number
  diag: number
  horizonY: number | null
  vps: Vp[]
  principal: Pt | null
  f: number | null
  fSource: 'none' | 'default' | 'two-vp'
  /** 세계(=작도 프레임) 축 방향. 유한 소실점 방향 + 화면 평행(H·V). */
  axes: AxisDir[]
  roles: Map<number, Role>
  /** 거부 사유 — 획은 남고 카메라만 안 건드린 경우 */
  rejects: Map<number, string>
  constructionDone: boolean
}

/** 작도 카메라 — 지면(Y=0) 위 눈높이에 서서 수평으로 본다(피치 0·롤 0).
 *  **세계 원점은 눈이 아니라 지면이다.** 눈이 원점이면 지면이 눈을 지나 퇴화한다. */
export const DRAW_POSE: CamPose = { p: v3(0, C.EYE_HEIGHT, 0), q: QID }

/** 획 후보가 작도 국면에서 무엇이 되는지 — analyze와 미리보기가 같은 함수를 쓴다
 *  (측정 경로와 앱 경로를 가르지 않는다) */
export function classifyNext(
  an: Pick<Analysis, 'horizonY' | 'vps' | 'diag' | 'W' | 'constructionDone'>,
  a: Pt, b: Pt,
): { role: Role; reason?: string; vp?: Pt } {
  if (an.horizonY === null) return { role: 'horizon' }
  if (an.constructionDone) return { role: 'content' }
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  if (L < C.MIN_DIR_LEN_RATIO * an.diag) return { role: 'content' }
  // 화면 평행이면 축 스냅이 붙는다 → 기존 축, 내용 획
  if (Math.abs(dy) / L <= C.SCREEN_PARALLEL_RATIO) return { role: 'content' }
  if (Math.abs(dx) / L <= C.SCREEN_PARALLEL_RATIO) return { role: 'content' }
  // 기존 소실점에 붙는가 — 수직거리 ÷ 획 길이
  for (const v of an.vps) {
    const d = Math.abs((v.x - a.x) * dy - (v.y - a.y) * dx) / L
    if (d / L <= C.VP_DIR_RATIO) return { role: 'content' }
  }
  // 안 붙으면 새 소실점 — 단, 실수로 그은 작은 선은 카메라를 안 건드린다
  if (L < C.VP_MIN_LEN_RATIO * an.diag) {
    return { role: 'content', reason: '소실점을 정의하기엔 짧다' }
  }
  const vpx = a.x + (an.horizonY - a.y) * (dx / dy)
  if (an.vps.length === 1) {
    const px = an.W / 2
    const u1 = an.vps[0]!.x - px
    const u2 = vpx - px
    if (-u1 * u2 <= 0) {
      return { role: 'content', reason: 'f² ≤ 0 — 두 소실점이 주점 기준 반대쪽이어야 한다' }
    }
  }
  return { role: 'vp', vp: pt(vpx, an.horizonY) }
}

/** 문서 → 카메라. 순수 폴드 — 획 목록에서 매번 계산한다(원칙 b). */
export function analyze(doc: Doc): Analysis {
  const { W, H } = doc.frame
  const diag = Math.hypot(W, H)
  const roles = new Map<number, Role>()
  const rejects = new Map<number, string>()
  const vps: Vp[] = []
  let horizonY: number | null = null

  for (const s of doc.strokes) {
    // 작도는 작도 포즈에서만 — 궤도 후의 획은 전부 내용이다
    if (s.view) { roles.set(s.id, 'content'); continue }
    const partial = { horizonY, vps, diag, W, constructionDone: vps.length >= 2 }
    const cls = classifyNext(partial, s.a, s.b)
    roles.set(s.id, cls.role)
    if (cls.reason) rejects.set(s.id, cls.reason)
    if (cls.role === 'horizon') horizonY = (s.a.y + s.b.y) / 2
    else if (cls.role === 'vp' && cls.vp) vps.push({ x: cls.vp.x, y: cls.vp.y, strokeId: s.id })
  }

  const principal = horizonY !== null ? pt(W / 2, horizonY) : null
  let f: number | null = null
  let fSource: Analysis['fSource'] = 'none'
  if (principal) {
    if (vps.length >= 2) {
      const u1 = vps[0]!.x - principal.x
      const u2 = vps[1]!.x - principal.x
      f = Math.sqrt(-u1 * u2) // 수용 시 f² > 0 보장(classifyNext)
      fSource = 'two-vp'
    } else {
      f = C.DEFAULT_F_RATIO * W
      fSource = 'default'
    }
  }

  const axes: AxisDir[] = []
  if (principal && f !== null) {
    vps.forEach((v, i) => {
      axes.push({
        id: i === 0 ? 'vp0' : 'vp1',
        dir: norm3(v3(v.x - principal.x, principal.y - v.y, -f!)),
      })
    })
    axes.push({ id: 'H', dir: v3(1, 0, 0) })
    axes.push({ id: 'V', dir: v3(0, 1, 0) })
  }

  return {
    W, H, diag, horizonY, vps, principal, f, fSource, axes, roles, rejects,
    constructionDone: vps.length >= 2,
  }
}

// ── 사영 — 카메라의 나머지 절반. 출처는 여기 하나다 ──────────────────────

export interface ScreenAxis {
  id: AxisId
  /** 유한 소실점의 화면 위치 (무한원이면 null) */
  vp: Pt | null
  /** 무한원 축의 화면 방향 (유한이면 null) */
  dir: Pt | null
}

/** 현재 포즈에서 각 축의 화면 소실점/방향 — 그리드·스냅·표시가 전부 이것을 쓴다(불변식 i) */
export function screenAxes(an: Analysis, pose: CamPose): ScreenAxis[] {
  if (!an.principal || an.f === null) return []
  const out: ScreenAxis[] = []
  for (const ax of an.axes) {
    let d = quatRotate(quatConj(pose.q), ax.dir)
    if (Math.abs(d.z) < 1e-9) {
      out.push({ id: ax.id, vp: null, dir: pt(d.x, -d.y) })
    } else {
      if (d.z > 0) d = mul3(d, -1)
      out.push({
        id: ax.id,
        vp: pt(an.principal.x + an.f * d.x / -d.z, an.principal.y - an.f * d.y / -d.z),
        dir: null,
      })
    }
  }
  return out
}

/** 세계 점 → 화면 (뒤에 있으면 null) */
export function project(an: Analysis, pose: CamPose, P: V3): Pt | null {
  if (!an.principal || an.f === null) return null
  const pc = quatRotate(quatConj(pose.q), sub3(P, pose.p))
  if (pc.z >= -1e-9) return null
  return pt(an.principal.x + an.f * pc.x / -pc.z, an.principal.y - an.f * pc.y / -pc.z)
}

/** 세계 방향 → 카메라 프레임 — 사영이 아닌 방향 변환(뷰 큐브 위젯 등)도
 *  출처는 여기다(원칙 a — 밖에서 quatConj를 직접 쓰지 않는다) */
export function dirInCamera(pose: CamPose, d: V3): V3 {
  return quatRotate(quatConj(pose.q), d)
}

export interface Ray { o: V3; d: V3 }

/** 화면 점 → 세계 광선 */
export function rayThrough(an: Analysis, pose: CamPose, s: Pt): Ray | null {
  if (!an.principal || an.f === null) return null
  const dc = v3(s.x - an.principal.x, an.principal.y - s.y, -an.f)
  return { o: pose.p, d: norm3(quatRotate(pose.q, dc)) }
}

/** 화면 점 → **지면(Y=0) 위의 점** — 첫 앵커의 자리.
 *
 *  게이지 평면(z=−f)을 대체한다. 게이지 평면은 «화면 1px = 세계 1단위»라는 **임의 단위**를
 *  골라 스케일을 정했다. 지면은 그럴 필요가 없다 — **눈높이가 스케일을 정한다.**
 *  눈이 지면 위 `EYE_HEIGHT`에 있으므로 지평선 아래 화면 점은 지면과 정확히 한 점에서
 *  만나고, 그 점까지의 거리가 곧 실제 거리다. 자유 선택이 하나 줄었다.
 *
 *  지평선 위(또는 그 자리)의 점은 지면과 안 만난다 → null. 좌표를 임의로 정하지 않는다. */
export function pointOnGround(an: Analysis, pose: CamPose, s: Pt): V3 | null {
  const r = rayThrough(an, pose, s)
  if (!r) return null
  if (r.d.y >= -1e-9) return null      // 위로 가거나 지면과 평행 — 안 만난다
  const u = -pose.p.y / r.d.y          // P.y = 0 이 되는 광선 파라미터
  if (!(u > 0)) return null            // 눈이 이미 지면이거나 뒤쪽 — 안 만난다
  return add3(pose.p, mul3(r.d, u))
}
