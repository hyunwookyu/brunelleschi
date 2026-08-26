// 음성 치수(web2-08 지시 4-4) — Web Speech API. **모드를 따로 켠다. 켜져 있는 동안만
// 듣는다.** 인식 문장은 `core/dim.ts`의 parseDim이 읽는다 — 필기·음성이 같은 파서다.
//
// 듣는 «창»(선 그리기 시작 ~ 다음 공간 터치)의 판정은 여기 없다 — main.ts의
// `applyDimInput` 하나가 필기·음성 공용으로 가른다(#54: 창 판정이 두 자리로 갈리지 않게).
//
// ⚠ API가 없는 브라우저(파이어폭스 등)에서는 `supported = false`이고 버튼이 그렇게
// 말한다 — 조용히 죽지 않는다. e2e(헤드리스)도 그 갈래를 지난다.

export interface Voice {
  readonly supported: boolean
  active(): boolean
  /** 켜고 끈다 — 새 상태를 돌려준다 */
  toggle(): boolean
  stop(): void
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null
  onend: (() => void) | null
  onerror: ((e: unknown) => void) | null
}

export function createVoice(onHeard: (text: string) => void): Voice {
  const Ctor: (new () => RecognitionLike) | undefined =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  let rec: RecognitionLike | null = null
  let on = false

  function start() {
    if (!Ctor) return
    rec = new Ctor()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = true       // 「확정 전에는 변경할 수 있다」 — 중간 결과로도 갱신한다
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1]
      if (!last || !last[0]) return
      onHeard(last[0].transcript)
    }
    // 브라우저가 임의로 세션을 끊는다 — 모드가 켜져 있는 동안은 다시 잇는다
    rec.onend = () => { if (on) { try { rec?.start() } catch { /* 재시작 경합 — 다음 onend가 잇는다 */ } } }
    rec.onerror = () => { /* 무음 등 — onend가 다시 잇는다 */ }
    try { rec.start() } catch { /* 권한 거부 — 모드는 켜져 있되 결과가 없다 */ }
  }

  return {
    supported: Ctor !== undefined,
    active: () => on,
    toggle() {
      on = !on
      if (on) start()
      else { try { rec?.stop() } catch { /* 이미 끝났다 */ } rec = null }
      return on
    },
    stop() { if (on) { on = false; try { rec?.stop() } catch { /* 이미 끝났다 */ } rec = null } },
  }
}
