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
import { splitGlyphs, isDot } from './digits'
import { classifyGlyph } from './digitnet'
import { C } from './constants'

export const NET_REJECT = 0.52

/** **정규화 시야의 구제 문턱**(web2-32 4번) — 비를 편 래스터가 내는 답은 이 아래면 안 받는다.
 *  0.52(NET_REJECT)보다 높은 이유는 **비용 비대칭**이다(#61 ⚠⚠ — 조용히 틀린 치수보다
 *  다시 쓰기가 싸다). 값의 근거는 `glyph32_web2.json`의 훑기다(같은 표본에서 나란히):
 *    0.60 → 맞음 584/880 · 틀림 20   0.65 → 564 · 11   **0.70 → 534 · 8**   0.75 → 515 · 4
 *  **0.70을 고른 것은 정확도가 아니라 불변식이다**: 잡음 8종의 «ㄷ자»가 편 시야에서
 *  **0.658로 «5»**를 낸다(비 보존 시야에서는 0.497이라 걸러졌다). 0.65면 그것이 통과해
 *  web2-10부터의 불변 「**잡음 수용 0**」이 깨진다 — 그 불변이 정확도보다 앞선다.
 *  ⚠ 여유가 0.042로 **얇다**(NET_REJECT의 ±0.023과 같은 급) — 표본이 커지면 다시 놓는다.
 *  되돌릴 조건: 실기기에서 「자꾸 «?»가 난다」가 관측되면 잡음 표본을 늘려 다시 잰다. */
export const NET_RESCUE = 0.7

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

/** 번들 모형 경로 — 동기·순수(시험이 앱과 같은 함수를 부른다) */
export function recognizeDigitsNet(strokes: Pt[][]): string {
  if (strokes.length === 0) return ''
  const { glyphs, tallest } = splitGlyphs(strokes)
  let out = ''
  for (const g of glyphs) {
    if (isDot(g, tallest)) { out += '.'; continue }
    const r = classifyGlyphNorm(g.strokes)
    out += r && r.p >= NET_REJECT ? r.ch : '?'
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
