// 소실점·카메라 단일 출처 (원칙 a)
//
// 소실점·주점·f·축 방향은 전부 이 파일의 analyze()에서만 나온다.
// 다른 파일은 Analysis를 읽기만 한다 — 직접 계산은 정적 검사(test/static.test.ts)가 막는다.
//
// 모델(web2-17 — 지평선은 이미 있다):
//   지평선은 **긋는 것이 아니라 상시다** — 문서 y = H/2 상수(`horizonDocY`).
//   사람이 팬으로 정하는 것은 지평선이 아니라 «획이 문서 어디에 앉는가»다(종이가 움직인다).
//   주점 = (W/2, H/2) — 프레임의 중심(이미지 중심 가정 AS-C5와 한 몸). 피치 0, 롤 0.
//   깊이선과 지평선의 교점이 소실점 — 판정도 대기도 없는 계산이다.
//   소실점 1 → f는 깊이 배율 게이지(기본값 0.87·W). 소실점 2 → f² = |PV₁|·|PV₂|
//   (이론서 6.2 — 두 방향이 "직교 가로 방향"일 때의 식이다. 여기서는 두 깊이선이
//    직교 가로축이라는 것이 작도의 정의이므로 2점 상태 전용으로만 쓴다).
//   거부는 f² ≤ 0 하나뿐(원칙 f) — 두 소실점이 주점 기준 같은 쪽이면 직교 불가.
//
// 세계 좌표: **원점 = 지면**, +x 화면 오른쪽, +y 위, 작도 시선 −z.
//   작도 카메라는 지면 위 `EYE_HEIGHT`에 서서 수평으로 본다(피치 0·롤 0).
//   그래서 **Y=0이 지면**이고, 눈높이가 Y 스케일을 정한다 — f(깊이 압축률)와 다른 축이다.

import { yellowIds, type Doc, type Stroke, type CamPose } from './types'
import { C } from './constants'
import { isLevel } from './level'
import {
  type Pt, type V3, pt, v3, norm3, mul3, sub3, add3,
  quatConj, quatRotate, QID,
} from './vec'

export type Role = 'vp' | 'content'

/** **지평선의 문서 y — 출처는 여기 하나다**(원칙 a · web2-17 1-a). 프레임 세로의 절반.
 *  저장하지 않는다 — 팬은 `view` 오프셋이라 문서 좌표를 안 건드리므로, 사람이 «지평선을
 *  옮긴» 결과는 획이 문서 어디에 앉았는가로 이미 문서에 박혀 있다. 다른 파일이 `H/2`를
 *  직접 쓰면 안 된다. */
export const horizonDocY = (H: number): number => H / 2
export type AxisId = 'vp0' | 'vp1' | 'H' | 'V'

export interface Vp { x: number; y: number; strokeId: number }
export interface AxisDir { id: AxisId; dir: V3 }

export interface Analysis {
  W: number
  H: number
  diag: number
  /** 지평선의 문서 y — 상수 `horizonDocY(H)`다(web2-17 1-b: null 갈래가 없다) */
  horizonY: number
  vps: Vp[]
  principal: Pt | null
  f: number | null
  fSource: 'none' | 'default' | 'two-vp'
  /** 세계(=작도 프레임) 축 방향. 유한 소실점 방향 + 화면 평행(H·V). */
  axes: AxisDir[]
  roles: Map<number, Role>
  /** 거부 사유 — 획은 남고 카메라만 안 건드린 경우 */
  rejects: Map<number, string>
  /** 화면 수평축(H)이 **선언됐는가** — 사람이 화면 수평인 내용 획을 실제로 그었는가.
   *  2점 투시에서는 어떤 가로 모서리도 화면 수평이 아니다(둘 다 소실점으로 수렴한다).
   *  그러니 화면 수평 획이 있다는 것은 **그 축의 소실점이 무한원**이라는 선언이고,
   *  그것이 1점 투시의 정의다(이론서 2.2). */
  screenHDeclared: boolean
  /** 1점으로 잠겼다 — 화면 수평축 선언 + 깊이 소실점 하나. 세 축(H·V·깊이)이 다 정해졌고
   *  **두 번째 수평 소실점이 생길 자리가 없다**(지시 2-a·2-b). */
  p1Locked: boolean
  constructionDone: boolean
}

/** 잠긴 뒤 소실점을 만들려 할 때의 사유 — 한 자리에서만 쓴다 */
export const P1_LOCK_REASON = '화면 수평선을 그은 이상 1점 투시다 — 두 번째 소실점이 설 자리가 없다'

/** 작도 카메라 — 지면(Y=0) 위 눈높이에 서서 수평으로 본다(피치 0·롤 0).
 *  **세계 원점은 눈이 아니라 지면이다.** 눈이 원점이면 지면이 눈을 지나 퇴화한다. */
export const DRAW_POSE: CamPose = { p: v3(0, C.EYE_HEIGHT, 0), q: QID }

/** **획이 그 소실점을 향하는가** — sin(획 방향 ↔ 시작점→소실점 방향).
 *
 *  «붙었다»의 판정은 `≤ C.VP_DIR_RATIO`이고, 재는 자리가 둘이다:
 *  `classifyNext`(새 소실점을 만드는가)와 `lift.ts`의 `axisOfStroke`(어느 축인가).
 *  **그래서 여기 하나에서만 계산한다**(PITFALLS #54: «저장하지 않는다»로는 부족하고
 *  «한 함수에서만 계산한다»까지 간다). 두 자리에 같은 식을 두고 「함께 고쳤다」로 닫으면
 *  다음에 한쪽만 고치는 사람이 그대로 갈린다.
 *
 *  ⚠ 나누는 것은 **시작점에서 소실점까지의 거리**다. 획 길이로 나누던 것이 결함이었다 —
 *  길수록 절대 허용이 커져, 길이 875 획이 12° 빗나가고 향까지 반대인데 붙었다(web2-03 지시 2).
 *  겹친 자리(소실점이 시작점 위)면 방향이 없다 → `null`. */
export function vpDeviation(vp: Pt, a: Pt, b: Pt): number | null {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  const toVp = Math.hypot(vp.x - a.x, vp.y - a.y)
  if (L < 1e-12 || toVp < 1e-9) return null
  return Math.abs((vp.x - a.x) * dy - (vp.y - a.y) * dx) / (L * toVp)
}

/** 획 후보가 작도 국면에서 무엇이 되는지 — analyze와 미리보기가 같은 함수를 쓴다
 *  (측정 경로와 앱 경로를 가르지 않는다) */
export function classifyNext(
  an: Pick<Analysis, 'horizonY' | 'vps' | 'diag' | 'W' | 'constructionDone' | 'p1Locked'>,
  a: Pt, b: Pt,
): { role: Role; reason?: string; vp?: Pt; screenAxis?: 'H' | 'V' } {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  // ── 찍기 — 지평선 위의 점 하나가 소실점이다(지시 4-b) ────────────────────
  // 선을 그어 교점을 만드는 것과 **다른 길이고 같은 결과**다: 어느 쪽이든 여기서
  // 같은 `vps` 항목이 나오므로 카메라는 구별하지 못한다(4-c).
  // 작도가 끝난 뒤에도 받는다 — 3점으로 갈 때 세 번째 소실점을 찍을 수 있어야 한다.
  if (L <= C.TAP_MAX_PX && Math.abs(a.y - an.horizonY) <= C.OSNAP_RADIUS_PX) {
    // 잠긴 뒤에는 **찍기도 안 받는다**(2-a: 「그 뒤 어떤 획도」). 찍기는 지평선 위의 점이라
    // 만들 수 있는 것이 수평 소실점뿐이고, 그 자리가 없다는 것이 잠금의 내용이다.
    if (an.p1Locked) return { role: 'content', reason: P1_LOCK_REASON }
    const mark = pt(a.x, an.horizonY)
    if (an.vps.some(v => Math.abs(v.x - mark.x) <= C.OSNAP_RADIUS_PX)) {
      return { role: 'content', reason: '이미 그 자리에 소실점이 있다' }
    }
    if (an.vps.length === 1) {
      const u1 = an.vps[0]!.x - an.W / 2
      const u2 = mark.x - an.W / 2
      if (-u1 * u2 <= 0) {
        return { role: 'content', reason: 'f² ≤ 0 — 두 소실점이 주점 기준 반대쪽이어야 한다' }
      }
    }
    return { role: 'vp', vp: mark }
  }
  // ── 지평선 위를 그대로 따라 그은 선은 **퇴화**다 — 아무것도 선언하지 않는다(web2-17) ──
  // 지평선 위의 선은 어느 수평 소실점의 살도 될 수 있다(모든 수평 방향의 소실점이 그 선
  // 위에 있다). 그래서 «화면 수평 획 = 1점 선언»(아래 screenAxis H)의 근거인 무애매함이
  // 여기서는 성립하지 않는다 — 선언 없이 내용으로 남긴다(대기 — 지면과 못 만난다).
  // 이것이 기존 진입(«지평선을 긋고» 시작하던 손버릇)을 그대로 살린다(1-e ⑥): 그 획은
  // 카메라에 아무 일도 안 하고, 뒤의 대각선 둘이 종전대로 2점을 세운다.
  // 대역은 «지평선 위인가»의 기존 임계 그대로다(OSNAP_RADIUS_PX — 위 찍기 갈래·
  // resolveCommit과 같은 물음, 같은 값. 숫자를 새로 짓지 않는다).
  if (Math.max(Math.abs(a.y - an.horizonY), Math.abs(b.y - an.horizonY)) <= C.OSNAP_RADIUS_PX) {
    return { role: 'content' }
  }
  if (an.constructionDone) return { role: 'content' }
  if (L < C.MIN_DIR_LEN_RATIO * an.diag) return { role: 'content' }
  // 기존 소실점에 붙는가 — **수직거리 ÷ 시작점에서 소실점까지의 거리**. 그것이 곧 sin(각도)다.
  //
  // ⚠ 초판은 **획 길이**로 나눴다(`d / L`). 그러면 획이 길수록 절대 허용이 커진다 —
  //   실측: (500,440)→(−375,430) 획(길이 875)이 오른쪽 vp0과 **6.37°**, 게다가 향이
  //   반대인데도 `d/L = 0.051 ≤ 0.06`으로 「vp0에 붙었다」가 됐다. 그래서 새 소실점을
  //   못 만들고 2점이 안 섰다. 나눌 것을 틀린 것이고, `PARALLEL_PX`와 **같은 형태**다
  //   (비로 재야 할 것과 절대로 재야 할 것을 바꿔 잡았다 — web2-03 지시 2-d).
  let vpScore = Infinity
  for (const v of an.vps) {
    const dev = vpDeviation(v, a, b)
    if (dev === null) { vpScore = 0; break }
    vpScore = Math.min(vpScore, dev / C.VP_DIR_RATIO)
  }
  // ── 지평선과 평행한가 — **처짐을 px로 잰다**(web2-03 지시 2) ──────────────
  // 비(2.87°)로 재던 초판은 「그 비가 뜻하는 소실점 거리」가 시작점 높이에 비례해서
  // 커졌다 — 지평선 가까이서 그은 획은 **1W 거리의 소실점조차** 수평으로 읽혔다.
  // 여기서 재는 것은 획 자신의 끝점 처짐이고, 그것이 곧 「이 획으로 그 소실점을 무한원과
  // 구별할 수 있는가」다(처짐 d = h·R/D). 축 스냅이 H로 붙인 획은 d가 정확히 0이다.
  const drop = Math.abs(dy)
  const run = Math.abs(dx)
  if (drop <= C.PARALLEL_PX && run > drop) return { role: 'content', screenAxis: 'H' }
  if (run <= C.PARALLEL_PX && drop > run) return { role: 'content', screenAxis: 'V' }
  // 화면 평행 대역 안이지만 처짐이 있는 획은 **아래로 흘려보낸다** — 소실점을 만들 수 있다.
  // 기존 소실점에 붙으면 그쪽이 이긴다(바로 아래). 축 스냅은 종전대로 가장 가까운 축이다.
  if (vpScore <= 1) return { role: 'content' }
  // ── 그 소실점이 **작도 대역 안인가** — 밖이면 무한원으로 읽는다(web2-06 지시 2) ──
  // 위의 `PARALLEL_PX`는 「이 획으로 무한원과 구별할 수 있는가」를 **포인터 잡음**으로 잰다.
  // 그것만으로는 **손의 겨냥 오차**가 통째로 소실점이 됐다 — 실측: 지평선만 그은 상태에서
  // (300,600)→(700,595)(처짐 5px)이 **x=16300(13.3W)** 소실점을 만들었고, 처짐 2px이면
  // 33W였다. 그 획은 작도 획이라 실행취소도 안 된다.
  // 그래서 물음의 나머지 절반을 여기서 잰다: **그 소실점이 사람이 그리는 구도 안인가.**
  // 밖이면 H다(1점) — 6W 밖의 «2점»은 화상면과 **7.1°~9.9°** 안이라 화면에서 1점과 구별되지
  // 않는다(그 각은 **기본 f**의 값이고, 이 갈래는 소실점이 0~1개일 때만 돌므로 f는 언제나
  // 기본값이다. 폭이 있는 것은 임계가 시작점 기준이고 각은 주점 기준이라서다 — 리뷰어 [3]).
  const vpx = a.x + (an.horizonY - a.y) * (dx / dy)   // dy ≠ 0 (drop ≤ PARALLEL_PX 갈래를 지났다)
  if (Math.abs(vpx - a.x) > C.VP_FAR_W * an.W) return { role: 'content', screenAxis: 'H' }
  // 화면 세로에 가까운 획은 소실점을 못 만든다 — 지평선과 만나는 점이 화면 밖 무한대로 간다
  if (run / L <= C.SCREEN_PARALLEL_RATIO) return { role: 'content', screenAxis: 'V' }
  // 안 붙으면 새 소실점 — 단, 실수로 그은 작은 선은 카메라를 안 건드린다
  if (L < C.VP_MIN_LEN_RATIO * an.diag) {
    return { role: 'content', reason: '소실점을 정의하기엔 짧다' }
  }
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
  // 지평선은 폴드 밖에서 정해진다(web2-17 1-b) — 획이 아니라 프레임의 상수다.
  const horizonY = horizonDocY(H)
  let screenHDeclared = false

  // 옐로 겹의 획은 **소실점을 안 쓴다**(web2-22 1-a 표) — 자유 방향 스케치가 우연히
  // 소실점·수평 선언으로 읽히면 카메라가 오염된다(닫힌 뒤에도 P1→P2 승격 입구가 있다).
  // ⚠ web2-20의 「analyze는 모든 획을 본다」는 **트레이싱지**의 규칙이다(겹을 꺼도 카메라
  // 불변) — 옐로는 매체가 2D라 애초에 작도 획이 될 수 없다(1부 팔 ④가 트레이싱지
  // 불변을, 카메라 불변 팔이 이 제외를 잰다).
  const yellow = yellowIds(doc)
  for (const s of doc.strokes) {
    if (s.layer !== undefined && yellow.has(s.layer)) { roles.set(s.id, 'content'); continue }
    // 작도는 작도 포즈에서만 — 궤도 후의 획은 전부 내용이다
    if (s.view) { roles.set(s.id, 'content'); continue }
    const p1Locked = screenHDeclared && vps.length >= 1
    const partial = {
      horizonY, vps, diag, W, p1Locked,
      constructionDone: vps.length >= 2 || p1Locked,
    }
    const cls = classifyNext(partial, s.a, s.b)
    roles.set(s.id, cls.role)
    if (cls.reason) rejects.set(s.id, cls.reason)
    if (cls.role === 'vp' && cls.vp) vps.push({ x: cls.vp.x, y: cls.vp.y, strokeId: s.id })
    if (cls.screenAxis === 'H') screenHDeclared = true
  }

  // ── 주점 ────────────────────────────────────────────────────────────
  // **1점에서는 깊이 소실점이 곧 주점이다.** 주점은 눈에서 화상면에 내린 수선의 발이고,
  // 화상면에 수직인 방향(=1점의 깊이축)의 소실점이 바로 그 점이다(이론서 6.3·16.2).
  //
  // 초판은 늘 `W/2`였고, 그래서 사람이 만든 소실점이 화면 가운데가 아니면 **깊이축이
  // 화면 가로축(H)과 직교하지 않았다** — 실측 `vp0·H = 73.9677°`(vp0=900·주점 600).
  // 화면에서는 안 보이고 **탑뷰에서만** 보인다: 1점 상자의 바닥이 평행사변형이 된다.
  //
  // ⚠ **2점에서는 그대로 `W/2`다.** 그때는 주점이 자유롭지 않다 — f² = |PV₁||PV₂|가
  // 주점을 알고 있어야 서고(이론서 6.2), 「주점 = 이미지 중심」이 그 가정이다(16.2 · AS-C5).
  // 1점은 그 식을 안 쓰므로 주점이 자유롭고, 그 자유를 **직교에 쓴다**(이 도구의 전제).
  // 지평선이 상시이므로 주점·f도 상시다(web2-17) — 빈 문서부터 카메라가 있다.
  // 주점 y = H/2 상수: x의 이미지 중심 가정(AS-C5)과 y가 이제 한 몸이다 — ⚠ 단,
  // «프레임의 중심»이 되는 것은 **0·2점**뿐이다. 1점의 x는 종전대로 깊이 소실점이다
  // (아래 — 직교의 근거. 2차 리뷰어 [17]이 지시 1-a의 문면을 이렇게 좁혔다).
  const principal = pt(vps.length === 1 ? vps[0]!.x : W / 2, horizonY)
  let f: number
  let fSource: Analysis['fSource']
  if (vps.length >= 2) {
    const u1 = vps[0]!.x - principal.x
    const u2 = vps[1]!.x - principal.x
    f = Math.sqrt(-u1 * u2) // 수용 시 f² > 0 보장(classifyNext)
    fSource = 'two-vp'
  } else {
    f = C.DEFAULT_F_RATIO * W
    fSource = 'default'
  }

  // ── 축 후보 = **정규직교 프레임 그 자체** (web2-03 지시 1) ──────────────
  // 「스냅할 수 있는 방향」과 「상자의 모서리 방향」을 갈라 두면 그 틈으로 **사람이 만들지
  // 않은 축**이 들어온다. 실측(2점 · 지평선+깊이선 둘):
  //   · 사람이 만든 소실점 2 → 궤도 시점의 ✕ 표식 **3개**(여분은 `H`)
  //   · `vp0·H = 52.2388°` · `vp1·H = 142.2388°` — 둘 다 직교가 아니다
  //   · 축 스냅이 커서 360°/5°를 훑을 때 **72방향 중 10을 H가 가져갔다**
  // 사람이 「보조 소실점처럼 보인다」고 한 것이 그 H다.
  //
  // 그래서 **2점부터는 H를 안 넣는다** — 화상면에 평행한 가로 방향은 실재하지만
  // 그 상자의 모서리가 아니다. 프레임은 {vp0, vp1, V}이고 셋뿐이다.
  // 1점의 프레임은 {vp0, H, V}이고, 위 주점 보정이 그 셋을 직교로 만든다.
  // 소실점이 아직 없으면 화면 가로·세로만 있다 — 깊이가 안 정해졌으니 프레임이 아니다.
  // 소실점이 없어도 화면 가로·세로(H·V)는 선다(web2-17) — 지평선·주점·f가 상시이므로
  // 방 실루엣(수평·수직)이 소실점 없이 3D로 올라간다(1-e ③). 깊이축은 소실점이 채운다.
  const axes: AxisDir[] = []
  vps.forEach((v, i) => {
    axes.push({
      id: i === 0 ? 'vp0' : 'vp1',
      dir: norm3(v3(v.x - principal.x, principal.y - v.y, -f)),
    })
  })
  if (vps.length < 2) axes.push({ id: 'H', dir: v3(1, 0, 0) })
  axes.push({ id: 'V', dir: v3(0, 1, 0) })

  const p1Locked = screenHDeclared && vps.length >= 1
  return {
    W, H, diag, horizonY, vps, principal, f, fSource, axes, roles, rejects,
    screenHDeclared, p1Locked,
    // 작도가 끝났다 = **더 만들 것이 없다.** 소실점 둘이거나, 1점으로 잠겼거나.
    constructionDone: vps.length >= 2 || p1Locked,
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

/** **✕ 표식이 붙는 소실점** — 표시와 오스냅이 같은 목록을 쓴다(불변식 i).
 *
 *  사람이 **만든** 소실점(vp0·vp1)만이다. 화면 평행 축(H·V)도 궤도 시점에서는 유한한
 *  수렴점을 갖지만 그것은 **사영의 산물**이지 작도가 정한 점이 아니다 —
 *  거기에 ✕를 찍으면 「사용자가 만들지 않은 소실점이 하나 더 생긴다」로 보인다
 *  (2026-08-21 실측: 1점 궤도에서 vp0(1444,400) 옆에 **H(−1869,400)**가 함께 그려졌다).
 *
 *  ⚠ **축 스냅(`snapDir`)은 이 목록이 아니라 `screenAxes` 전부를 쓴다** — H는 1점에서
 *  진짜 축이고 그 방향으로 그을 수 있어야 한다. 「그릴 수 있는 방향」과 「찍힌 점」은
 *  다른 물음이다. */
export function vpMarks(an: Analysis, pose: CamPose): { id: AxisId; vp: Pt }[] {
  const out: { id: AxisId; vp: Pt }[] = []
  for (const ax of screenAxes(an, pose)) {
    if (ax.vp && (ax.id === 'vp0' || ax.id === 'vp1')) out.push({ id: ax.id, vp: ax.vp })
  }
  return out
}

/** **그 화면 점이 소실점인가** — 맞으면 그 축 id, 아니면 null (web2-06 지시 1).
 *
 *  오스냅이 붙인 좌표는 `vpMarks`가 낸 값 **그대로**이므로(원칙 d) 정확히 견준다.
 *  여유(1e-6)는 부동소수 몫이고 «근처»의 여유가 아니다 — 「소실점 근처에서 눌렀다」는
 *  **오스냅 반경**이 이미 답했고, 여기서 또 반경을 두면 판정이 두 자리로 갈린다(#54).
 *
 *  쓰는 자리: 소실점에서 뻗는 획에는 축 스냅을 안 건다(`core/draft.ts`).
 *  그 획은 «있는 축 중 하나»를 고르는 것이 아니라 **그 소실점의 살을 고르는 중**이고,
 *  소실점을 지나는 직선은 어느 방향이든 그 소실점의 살이다. */
export function vpAt(an: Analysis, pose: CamPose, p: Pt): AxisId | null {
  for (const m of vpMarks(an, pose)) {
    if (Math.abs(m.vp.x - p.x) <= 1e-6 && Math.abs(m.vp.y - p.y) <= 1e-6) return m.id
  }
  return null
}

/** **지평선의 화면 y** — 그릴 수 있으면 그 값, 아니면 null (web2-06 지시 3).
 *
 *  정렬된 포즈(피치 0·롤 0)에서 지평선은 **정확히 `principal.y`의 화면 수평선**이다:
 *  수평 방향 d는 `d.y = 0`이므로 사영이 `principal.y − f·0/−d.z = principal.y`다.
 *  **작도 포즈만의 성질이 아니다** — 접힌 포즈도 정렬이므로 같다. `render2d`가 작도 포즈에서만
 *  그어서 **접은 뒤 지평선이 사라졌다**(web2-05가 픽셀로 발견 · `DEFERRED.md`).
 *  증상을 「지평선이 올라간다」로 말한 사람에게 접힌 뒤 그것이 없으면 눈높이를 못 읽는다.
 *
 *  ⚠ **기울면 null이다.** 그때 지평선은 화면 수평선이 아니고(무한원 직선의 사영이라 여전히
 *  직선이지만 기울어 있다) 그것을 제대로 그으려면 수평 방향 둘의 소실점을 이어야 한다.
 *  **소실점 ✕는 모든 포즈에서 그린다** — 규칙이 갈리는 것이 맞다: ✕는 «점 하나»라 어느
 *  포즈에서든 사영이 한 점이고, 지평선은 «직선»이라 그 사영을 따로 세워야 한다.
 *  그 일반형은 범위 밖이고 `DEFERRED.md`에 있다. */
export function horizonScreenY(an: Analysis, pose: CamPose): number | null {
  if (!an.principal) return null
  if (!isLevel(pose)) return null
  return an.principal.y
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

/** 세계 선분 → 화면 선분. **카메라 앞으로 잘라낸다** — 한쪽이 뒤로 넘어가도
 *  그 앞부분은 보여야 한다(격자처럼 발밑에서 지평선까지 뻗는 선). 전부 뒤면 null. */
export function projectSeg(an: Analysis, pose: CamPose, A: V3, B: V3): [Pt, Pt] | null {
  if (!an.principal || an.f === null) return null
  const q = quatConj(pose.q)
  let a = quatRotate(q, sub3(A, pose.p))
  let b = quatRotate(q, sub3(B, pose.p))
  const NEAR = -1e-3
  if (a.z > NEAR && b.z > NEAR) return null
  if (a.z > NEAR || b.z > NEAR) {
    const t = (NEAR - a.z) / (b.z - a.z)
    const m = v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, NEAR)
    if (a.z > NEAR) a = m; else b = m
  }
  const to = (c: V3) => pt(an.principal!.x + an.f! * c.x / -c.z, an.principal!.y - an.f! * c.y / -c.z)
  return [to(a), to(b)]
}

/** **그 차수의 정규직교 프레임** — 세 축이고 서로 직교한다(web2-03 지시 1-d).
 *
 *    1점  {깊이(vp0), H, V}   — 깊이 소실점이 곧 주점이므로 깊이 = (0,0,−1)
 *    2점  {vp0, vp1, V}       — H는 프레임 밖이다(화상면에 평행한 가로 방향이고 상자
 *                               모서리가 아니다). **후보 목록에서도 뺀다.**
 *
 *  ⚠ 이 함수와 `an.axes`는 **같은 것을 내야 한다** — 목록이 둘로 갈리면 그것이 #54다.
 *  `test/axes.test.ts`가 두 목록을 대조한다. 축이 모자라면 null이고 0을 억지로 안 낸다. */
export function frameAxes(an: Analysis): AxisDir[] | null {
  const get = (id: AxisId) => an.axes.find(a => a.id === id)
  const V = get('V'), H = get('H'), v0 = get('vp0'), v1 = get('vp1')
  if (!V || !v0) return null
  if (v1) return [v0, v1, V]
  return H ? [v0, H, V] : null
}

/** 지면 격자의 두 방향 — 세계의 가로축 둘(방향의 y가 0인 축).
 *  소실점 축이 우선이고, 모자라면 화면 평행 가로축(H)이 채운다.
 *  **화면 각도 균등 분할이 아니다** — 공간의 정사각형을 투영한다(이론서 9.5). */
export function groundAxes(an: Analysis): [V3, V3] | null {
  const flat = an.axes.filter(a => Math.abs(a.dir.y) < 1e-9)
  const vps = flat.filter(a => a.id === 'vp0' || a.id === 'vp1').map(a => a.dir)
  const h = flat.find(a => a.id === 'H')?.dir
  if (vps.length >= 2) return [vps[0]!, vps[1]!]
  if (vps.length === 1 && h) return [vps[0]!, h]
  return null
}
