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

export const NET_REJECT = 0.52

/** 내장 API 최소 타입 — 규격(WICG Handwriting Recognition)의 쓰는 부분만 */
interface HwPoint { x: number; y: number; t?: number }
interface HwDrawing { addStroke(s: unknown): void; getPrediction(): Promise<{ text: string }[]> }
interface HwRecognizer { startDrawing(hints?: unknown): HwDrawing; finish?(): void }
type HwNavigator = Navigator & {
  createHandwritingRecognizer?(constraint: { languages: string[] }): Promise<HwRecognizer>
}

export const hasBuiltin = (): boolean =>
  typeof navigator !== 'undefined' && 'createHandwritingRecognizer' in navigator

/** 번들 모형 경로 — 동기·순수(시험이 앱과 같은 함수를 부른다) */
export function recognizeDigitsNet(strokes: Pt[][]): string {
  if (strokes.length === 0) return ''
  const { glyphs, tallest } = splitGlyphs(strokes)
  let out = ''
  for (const g of glyphs) {
    if (isDot(g, tallest)) { out += '.'; continue }
    const r = classifyGlyph(g.strokes)
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
        const text = raw.replace(/[^0-9.]/g, '')  // 숫자만 필요하다(지시 문면 — 언어는 무방)
        if (text.length > 0) return { text, via: 'builtin' }
        // 내장이 숫자를 못 냈다 — ②로 떨어진다(빈 결과를 확정으로 안 만든다)
      }
    } catch { builtinRec = null /* 선언만 있고 안 도는 환경 — ②로 */ }
  }
  return { text: recognizeDigitsNet(strokes), via: 'digitnet' }
}
