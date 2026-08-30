// 치수 필기 인식의 선택(web2-10 지시 8-b) — **기능 감지로 런타임에 갈린다**:
//   ① 'createHandwritingRecognizer' in navigator → 브라우저 내장 API(기기 안·무네트워크).
//      ⚠ 크롬 문서는 「현재 구현은 ChromeOS」 — 안드로이드는 명시가 없다. 된다고 가정하지
//      않는다: 생성·인식 어느 단계가 실패해도 ②로 떨어진다.
//   ② 없으면 → 번들 숫자 MLP(digitnet.ts).
// $P(digits.ts)는 지우지 않았다(A-4 — 비교 하네스·되돌릴 길). 분절(글리프 묶음·소수점)은
// 세 경로가 **같은 함수**를 쓴다(digits.splitGlyphs — 인식기가 갈려도 «2500»이 넷으로
// 잘리는 규칙은 하나다).
//
// 거부는 **두 겹**이다(조용히 틀린 치수보다 다시 쓰기가 싸다 — 비용 비대칭):
//   ① 모형의 잡음 클래스(11번째 — 비숫자를 명시적으로 배웠다. 합성 잡음 93.4% 거부)
//   ② NET_REJECT: 살아남은 답의 softmax 확신이 이 아래면 «?».
// 값 0.52는 합성 표본 실측 사이다(원장 digit_accuracy_web2.json — 옳은 최악 0.543 ·
// ①을 지난 잡음 최선 0.497. ⚠ 여유가 ±0.023으로 얇다 — 표본이 커지면 다시 놓는다).

import type { Pt } from './vec'
import { splitGlyphs, isDot, recognizeGlyph } from './digits'
import { classifyGlyph } from './digitnet'
import { trajMatch } from './traj_rec'
import { C } from './constants'

export const NET_REJECT = 0.52

/** **정규화 시야의 구제 문턱**(web2-32 4번) — 비를 편 래스터가 내는 답은 이 아래면 안 받는다.
 *  0.52(NET_REJECT)보다 훨씬 높은 이유는 **비용 비대칭**이다(#61 ⚠⚠). 이 회차에서 그 비대칭이
 *  **더 세졌다**: 32-2가 승인 층을 걷어 오답이 조용히 실리고, 첫 치수는 **축척**을 정한다 —
 *  「1」을 「7」로 읽으면 문서 전체가 7배로 선다.
 *
 *  같은 표본(`glyph32_web2.json` sweep_rule_threshold)의 실측:
 *    0.60 → 맞음 584 · **틀림 20** · 「4」 155/320 · 잡음 수용 **1**(불변식이 깨진다)
 *    0.70 → 맞음 534 · **틀림 8**  · 「4」 105/320 · 잡음 수용 0
 *    **0.80 → 맞음 506 · 틀림 2 · 「4」 77/320 · 잡음 수용 0**   ← 이 값
 *    0.90 → 맞음 491 · 틀림 2 · 「4」 62/320(= 정규화 이전과 같다 — 구제가 죽는다)
 *  ⚠⚠ **늘어난 오답은 전부 세리프 「1」의 1 → 7이다**(1차 리뷰어가 잡았다). 0.8은 «맞음
 *  최대»가 아니라 **«오답을 안 늘리는»** 가장 낮은 문턱이다 — 그 값에서 틀림이 정규화
 *  이전과 같은 2이고 「4」는 62 → 77로 는다.
 *  ⚠ «비 보존 시야가 다른 숫자를 냈으면 뒤집지 않는다»는 조항도 재 봤는데 0.8에서는
 *  **아무것도 안 바꾼다**(0.6에서만 틀림 20 → 15). 그래서 안 넣었다 — 재지 못하는 기제를
 *  코드에 남기지 않는다.
 *  되돌릴 조건: 실기기에서 「자꾸 «?»가 난다」가 관측되면 잡음·세리프 표본을 늘려 다시 잰다. */
export const NET_RESCUE = 0.8

/** 내장 API 최소 타입 — 규격(WICG Handwriting Recognition)의 쓰는 부분만 */
interface HwPoint { x: number; y: number; t?: number }
interface HwDrawing { addStroke(s: unknown): void; getPrediction(): Promise<{ text: string }[]> }
interface HwRecognizer { startDrawing(hints?: unknown): HwDrawing; finish?(): void }
type HwNavigator = Navigator & {
  createHandwritingRecognizer?(constraint: { languages: string[] }): Promise<HwRecognizer>
}

export const hasBuiltin = (): boolean =>
  typeof navigator !== 'undefined' && 'createHandwritingRecognizer' in navigator

/** 글리프 하나 → 답. **두 시야**를 이 순서로 본다(web2-32 4번 · 30-8이 정정한 후보):
 *
 *  ① **비 보존**(종전 전처리 — MNIST의 구성 그대로). 이것이 확신을 내면 그대로 받는다.
 *  ② 거부하면 **비를 편 시야**(`DIGIT_NORM_ALPHA`)로 한 번 더 본다 — 구제에는 더 높은
 *     문턱(`NET_RESCUE`)이 걸린다.
 *
 *  ⚠ 이 순서가 곧 「가로세로비를 **약한 특징으로 강등**하되 버리지는 않는다」이다(지시 문면):
 *  비는 여전히 첫 시야를 정하지만 **지배하지 않는다**. 30-8이 「자형」이 아니라 «비»를
 *  가리켰고(비 0.65 6/20 ↔ 비 1.00 18/20), 훑기가 그것을 확인했다 — `glyph32_web2.json`.
 *  ⚠⚠ 비를 **통째로 버리면**(alpha=1) 전체가 491 → **367**로 무너진다(9의 꼬리와 1이
 *  납작해진다). 지시가 「완전히 버리지는 마라」로 못 박은 자리가 실측으로 그대로 나온다. */
export function classifyGlyphNorm(strokes: Pt[][]): { ch: string; p: number } | null {
  const a = classifyGlyph(strokes, 0)
  if (a && a.p >= NET_REJECT) return a
  const b = classifyGlyph(strokes, C.DIGIT_NORM_ALPHA)
  return b && b.p >= NET_RESCUE ? b : null
}

/** **궤적 시야의 채택 거리**(web2-35 1번). 이 회차가 새로 놓는 문턱은 **이것 하나**다 —
 *  네 번째 시야($P)의 문턱은 web2-08이 **다른 표본으로** 이미 놓은 `digits.REJECT`(0.10)를
 *  그대로 쓰고 건드리지 않았다. 자유도를 하나로 묶어야 「표본에 맞춘 값」이 안 된다.
 *
 *  값의 근거는 `glyph35_web2.json`의 `shipped_p_threshold_arm`이다. $P 문턱을 0.10에
 *  고정하고 이 값만 훑으면 **0.10~0.12에서 맞음이 770으로 같다**(고원 5칸) — 0.11은 그
 *  가운데다. 거리 띠의 실측:
 *
 *    맞게 구제되는 201칸의 **최악 거리** 0.098
 *    ─────────── 이 사이 어디를 잘라도 결과가 같다 ───────────
 *    **첫 오답** 거리                  0.124   (세리프1+밑줄 → 「2」)
 *    잡음 8종의 **최선 거리**           0.151   (삼각형 → 「0」)
 *
 *  ⚠ **띠가 얇다**(폭 0.026 = 문턱의 24%) — NET_RESCUE와 같은 성질의 값이고 **합성
 *  표본에서 놓았다**. 실기기에서 다시 놓는다(DEVICE-CHECK).
 *  ⚠⚠ 이 문턱이 지키는 것은 **오답이 안 느는 것**이지 맞음의 최대가 아니다(#61 비용
 *  비대칭 — 32-2가 승인 층을 걷었고 첫 치수는 축척을 정한다). */
export const TRAJ_ACCEPT = 0.11

/** 글리프 하나 → 답. **네 시야를 이 순서로** 본다. 모양이 먼저이고 궤적은 더한 것이다.
 *
 *  ① **비 보존 래스터**(digitnet · web2-10)   — 확신 ≥ NET_REJECT면 그대로
 *  ② **비를 편 래스터**(web2-32 4번)          — 확신 ≥ NET_RESCUE면 구제
 *  ③ **궤적**(web2-35 · traj_rec)            — 거리 ≤ TRAJ_ACCEPT면 구제
 *  ④ **$P 점군**(web2-08 · digits)           — 거리 ≤ digits.REJECT면 구제
 *
 *  ⚠⚠ **③④가 ①②를 뒤집는 길은 없다**(발화 조건이 «앞이 거부»다). 그렇게 둔 근거는
 *  실측이다: 래스터가 **맞게 수용한** 칸에서 궤적은 자주 다른 답을 낸다(7·가로줄 있음
 *  0/80 일치 · 4·열린·1획 0/38 · 세리프1+밑줄 0/22 — 원장 `traj_on_accepted`). 원형 표가
 *  자리마다 **한 가지 필체**뿐이라 그렇다. 궤적을 **판정자**로 두면 오답이 2 → 295로
 *  터진다(`arm_traj_only`). 그러므로 궤적은 «판정자»가 아니라 **«거부를 되살리는 시야»**다.
 *
 *  ⚠⚠⚠ **③과 ④를 둘 다 두는 근거**는 둘이 **서로 다른 자형을 살리고 그 몫이 씨마다
 *  서기** 때문이다(런타임과 **같은 자**로 잰 값 · `traj_vs_p_dollar_by_form.at_runtime`):
 *  ④가 이미 있어도 ③이 **+45**(전부 「4·닫힌·2획」 · 씨별 [9,8,10,9,9] 폭 2) ·
 *  ③이 있어도 ④가 **+63**(세리프 「1」). 45 + 63 + 156 = 264 = 770 − 506으로 맞는다.
 *
 *  ⚠ **「궤적이 $P보다 낫다」는 이 표본으로 못 가른다**(2차 리뷰어 · #14): 전량으로는
 *  707 대 695지만 **씨별로 [-1, 0, 7, 4, 2]**라 폭 8에 부호가 뒤집힌다. 그 12칸을
 *  게이트에서도 결론에서도 뺐다 — 올린 것의 대부분은 «궤적»이 아니라 **«시야를 하나 더
 *  둔 것»**이다(506 → 695가 $P만으로 난다 · `decomposition`).
 *  ⚠ 「궤적이 앞에 서면 $P의 오답이 3 → 2로 내려간다」는 **채택 근거가 아니다** —
 *  PITFALLS #20(거름을 선택 전에 걸면 상대 순위가 거저 통과)의 모양이고, 씨별로는
 *  $P의 오답이 [0,0,1,0,2]로 2를 넘는 씨가 없다. 사실로만 남긴다. */
export type GlyphAnswer =
  | { ch: string; via: 'preserved' | 'rescued'; p: number }
  | { ch: string; via: 'traj' | 'pdollar'; d: number }

export function readGlyph(strokes: Pt[][]): GlyphAnswer | null {
  const a = classifyGlyph(strokes, 0)
  if (a && a.p >= NET_REJECT) return { ch: a.ch, via: 'preserved', p: a.p }
  const b = classifyGlyph(strokes, C.DIGIT_NORM_ALPHA)
  if (b && b.p >= NET_RESCUE) return { ch: b.ch, via: 'rescued', p: b.p }
  const t = trajMatch(strokes)
  if (t && t.d <= TRAJ_ACCEPT) return { ch: t.ch, via: 'traj', d: t.d }
  const q = recognizeGlyph(strokes)                    // 문턱은 digits.REJECT가 안에서 건다
  if (q) return { ch: q.ch, via: 'pdollar', d: q.d }
  return null
}

/** 번들 모형 경로 — 동기·순수(시험이 앱과 같은 함수를 부른다) */
export function recognizeDigitsNet(strokes: Pt[][]): string {
  if (strokes.length === 0) return ''
  const { glyphs, tallest } = splitGlyphs(strokes)
  let out = ''
  for (const g of glyphs) {
    if (isDot(g, tallest)) { out += '.'; continue }
    const r = readGlyph(g.strokes)
    out += r ? r.ch : '?'          // 문턱은 세 시야가 각자 안에서 이미 걸었다
  }
  return out
}

let builtinRec: HwRecognizer | null | undefined  // undefined = 아직 안 물어봄 · null = 없거나 실패

/** 인식 — 감지로 고른다. 어느 경로였는지 via로 남긴다(진단 패널이 유무를 보인다). */
export async function recognizeStrokes(strokes: Pt[][]): Promise<{ text: string; via: 'builtin' | 'digitnet' }> {
  if (hasBuiltin()) {
    try {
      if (builtinRec === undefined) {
        builtinRec = await (navigator as HwNavigator).createHandwritingRecognizer!({ languages: ['en'] })
      }
      if (builtinRec) {
        const drawing = builtinRec.startDrawing({ recognitionType: 'text', inputType: 'stylus', alternatives: 1 })
        const HS = (globalThis as Record<string, unknown>)['HandwritingStroke'] as
          (new () => { addPoint(p: HwPoint): void }) | undefined
        for (const st of strokes) {
          const pts = st.map((p, i) => ({ x: p.x, y: p.y, t: i * 8 }))
          if (HS) {
            const hs = new HS()
            for (const p of pts) hs.addPoint(p)
            drawing.addStroke(hs)
          } else {
            drawing.addStroke(pts)               // 규격 이전 구현 대비 — 실패하면 catch로
          }
        }
        const pred = await drawing.getPrediction()
        const raw = pred[0]?.text ?? ''
        // 숫자·점 밖 문자는 지운다(«2,500»·«2500mm» 같은 병기 대비). ⚠ «l2»→«2»처럼
        // 오인식 문자가 지워지며 값이 달라질 수 있다 — 그래도 «?»로 통째 거부하지 않은
        // 근거: 결과는 어차피 **스테이징**이라 사람이 읽고 적용한다(8-a ② — 조용히
        // 확정되는 길이 없다). 지운 몫이 커서 헷갈린다는 관측이 오면 거부로 바꾼다.
        const text = raw.replace(/[^0-9.]/g, '')
        if (text.length > 0) return { text, via: 'builtin' }
        // 내장이 숫자를 못 냈다 — ②로 떨어진다(빈 결과를 확정으로 안 만든다)
      }
    } catch { builtinRec = null /* 선언만 있고 안 도는 환경 — ②로 */ }
  }
  return { text: recognizeDigitsNet(strokes), via: 'digitnet' }
}
