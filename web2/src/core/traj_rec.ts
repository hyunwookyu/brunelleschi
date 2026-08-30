// web2-35 1번 — 궤적 **원형 대조기**. `traj.ts`가 낸 특징을 자리별 원형과 견준다.
//
// ⚠⚠ **원형의 출처가 이 회차의 정직성을 정한다**(D-3 · D-5).
//   원형은 `digits.ts`의 `GLYPHS`다 — **web2-08이 적은 $P 템플릿 표**이고, 이 회차가
//   만든 것이 **아니다**. 평가 픽스처(`test/glyphforms.ts`의 11자형)를 보고 원형을
//   지으면 「궤적이 올렸다」가 아니라 「픽스처를 외웠다」가 된다.
//   그래서 원장은 11자형을 둘로 갈라 낸다:
//     · **표본 안(4자형·320칸)** — GLYPHS와 같은 획인 「현행 템플릿」 행들
//     · **표본 밖(7자형·560칸)** — 닫힌·2획 / 닫힌·1획 / 열린·1획 / 7가로줄 /
//       세리프1 / 세리프1+밑줄 / 9굽은꼬리. **이쪽 이득만이 궤적의 실제 이득이다.**
//
// 발화 조건은 하나다: **래스터 두 시야가 둘 다 거부했을 때만** 본다(모양을 안 버린다 —
// 지시 35-1 문면). 그러므로 이미 맞던 답을 궤적이 뒤집는 길이 **없고**, 이 계층이
// 만들 수 있는 해악은 «거부 → 오답» 하나뿐이다. 게이트가 그 하나를 잰다.

import type { Pt } from './vec'
import { GLYPHS } from './digits'
import { trajFeat, trajDist, FULL, type TrajFeat, type TrajWeights } from './traj'

/** 여러 획을 **하나로 잇는다** — 같은 글자를 1획으로 쓴 손과 2획으로 쓴 손을 견주는
 *  온라인 필기의 표준 수단(획 병합). 픽스처가 아니라 «획 수 변이» 일반에 대한 대응이다. */
const merged = (strokes: Pt[][]): Pt[][] => [strokes.flat()]

export interface Proto { ch: string; feat: TrajFeat; featMerged: TrajFeat; n: number }

/** 원형 표 — GLYPHS 열 개. 각 자리마다 «그대로»와 «한 획으로 이은» 판을 함께 둔다. */
export const PROTOS: Proto[] = Object.entries(GLYPHS).map(([ch, st]) => ({
  ch,
  feat: trajFeat(st)!,
  featMerged: trajFeat(merged(st))!,
  n: st.length,
}))

export interface TrajOpt {
  /** 획 수가 다를 때 «이어 붙인 판»끼리도 견줘 더 가까운 쪽을 쓴다 */
  mergeTolerant: boolean
  /** 켤 항 */
  w: TrajWeights
}
export const TRAJ_DEFAULT: TrajOpt = { mergeTolerant: true, w: FULL }

/** 글리프 하나 → 가장 가까운 자리와 그 거리(0..1). 문턱은 부르는 쪽이 건다. */
export function trajMatch(strokes: Pt[][], opt: TrajOpt = TRAJ_DEFAULT): { ch: string; d: number; second: number } | null {
  const f = trajFeat(strokes)
  if (!f) return null
  const fm = opt.mergeTolerant && strokes.length > 1 ? trajFeat(merged(strokes)) : null
  const scored = PROTOS.map(p => {
    let d = trajDist(f, p.feat, opt.w)
    if (opt.mergeTolerant) {
      // 획 수가 다르면 «이어 붙인 판»끼리 한 번 더 — 둘 중 가까운 쪽
      if (p.n > 1) d = Math.min(d, trajDist(f, p.featMerged, opt.w))
      if (fm) d = Math.min(d, trajDist(fm, p.featMerged, opt.w), trajDist(fm, p.feat, opt.w))
    }
    return { ch: p.ch, d }
  }).sort((a, b) => a.d - b.d)
  return { ch: scored[0]!.ch, d: scored[0]!.d, second: scored[1]!.d }
}
