// 치수 리본 패널(web2-08 지시 4) — 우측, 접힌다(4-3). 화면에 쓰면 공간의 선인지
// 숫자인지 알 수 없으므로 **쓰는 자리가 따로 있다** — 이 패널의 필기 칸이다.
//
// 배선만 한다 — 인식은 `core/digits.ts`, 파싱·표기는 `core/dim.ts`, 적용은 main의
// `applyDimInput`(필기·음성 공용) 하나다. 값 표시는 main이 부른다(`show`) —
// 「한 곳에서 계산해 셋이 읽는다」(4-5)의 셋째 자리가 이 패널이다.

import { recognizeStrokes } from '../core/handwriting'
import type { Pt } from '../core/vec'

export interface DimPanel {
  /** 실시간 길이 줄 — main이 그리는 중·확정 후에 부른다. null = 무스케일/길이 없음 */
  show(text: string | null): void
  /** 필기 칸을 비운다 — 새 획(새 치수 창)이 열릴 때 main이 부른다 */
  clearInk(): void
  /** 인식 문자열 표시(«3500» · «3?») — 판정은 사람이 본다 */
  readout(text: string): void
  /** 확률적 입력(필기·음성)의 결과를 **적용하지 않고** 키패드 표시에 싣는다(web2-10
   *  지시 8-a ② — 확정 전 사람이 읽고 고칠 수 있어야 한다). 적용은 사람이 «적용»으로. */
  stage(text: string): void
  /** **축척 줄**(web2-32 5번) — 「미정」인지 「1 : N」인지, 확정이면 어느 치수가 정했는지.
   *  `set`이 팔이 읽는 자리다(`data-scale`) — 문면이 바뀌어도 판정이 안 흔들린다. */
  scale(text: string, set: boolean): void
  /** **어긋남 줄**(web2-32 7번) — 없으면 null(줄 자체가 사라진다). 표시만 한다. */
  skew(text: string | null): void
  /** **재기 줄**(web2-32 6번) — 잰 값(축척 확정) 또는 비율(축척 미정). */
  measure(text: string, state: 'idle' | 'from' | 'value'): void
}

export function initDimPanel(
  onWritten: (text: string) => void,
): DimPanel {
  const panel = document.getElementById('dimpanel')!
  const toggle = document.getElementById('dim-toggle')!
  const live = document.getElementById('dim-live')!
  const scaleEl = document.getElementById('dim-scale')!
  const skewEl = document.getElementById('dim-skew')!
  const measureEl = document.getElementById('dim-measure')!
  const read = document.getElementById('dim-read')!
  const canvas = document.getElementById('dim-ink') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!

  toggle.addEventListener('click', () => panel.classList.toggle('folded'))

  // ── 필기 캡처 — 획 목록을 들고, 획이 끝날 때마다 전체를 다시 읽는다(다시 쓰면 갱신) ──
  const strokes: Pt[][] = []
  let cur: Pt[] | null = null
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(canvas.clientWidth * dpr || 196 * dpr)
  canvas.height = Math.round(canvas.clientHeight * dpr || 72 * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const at = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#3c3831'
    ctx.lineWidth = 1.6
    ctx.lineJoin = ctx.lineCap = 'round'
    for (const st of strokes.concat(cur ? [cur] : [])) {
      ctx.beginPath()
      st.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
      ctx.stroke()
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    canvas.setPointerCapture(e.pointerId)
    cur = [at(e)]
    redraw()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return
    cur.push(at(e))
    redraw()
  })
  let recSeq = 0
  const up = () => {
    if (!cur) return
    if (cur.length > 1) strokes.push(cur)
    cur = null
    redraw()
    // 인식기는 감지로 갈린다(web2-10 지시 8-b — 내장 API 또는 번들 MLP. $P는 하네스로 남았다).
    // 비동기이므로 순서표를 든다 — 늦게 온 옛 결과가 새 획의 결과를 덮지 않게.
    const seq = ++recSeq
    void recognizeStrokes(strokes.slice()).then(({ text }) => {
      if (seq !== recSeq) return
      read.textContent = text
      // ⚠ 자동 적용을 **안 한다**(web2-10 지시 8-a ② — web2-08의 「읽히면 즉시 적용」을
      // 뒤집었다): 인식은 확률적이라 3이 8로 읽히면 scaleRef가 조용히 틀린다. 결과는
      // 키패드 표시로 올라가고(고칠 수 있다) 사람이 «적용»을 눌러야 실린다.
      if (text.length > 0 && !text.includes('?')) stage(text)
    })
  }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)

  function clearInk() {
    strokes.length = 0
    cur = null
    recSeq++                    // 날고 있는 옛 인식 결과가 비운 칸에 늦게 적히지 않게
    read.textContent = ''
    redraw()
  }
  document.getElementById('dim-clear')!.addEventListener('click', clearInk)

  // ── 숫자 키패드(web2-10 지시 8-a) — **확정 경로** ──────────────────────
  // 인식을 안 거친다. 적용 전에 값이 보이고(#pad-read) ⌫·C로 고친다 — 「① 확정 대체 경로
  // ② 확정 전 읽고 고칠 수 있는 표시」 둘 다(지시 문면). 적용은 필기와 **같은 통로**
  // (onWritten → applyDimInput)라 창 규칙·대체 규칙이 갈리지 않는다.
  // 새 획이 열려도 값은 남는다 — 적용이 명시적(버튼)이라 조용히 안 틀리고,
  // 같은 치수를 잇달아 적용하는 손에 맞다.
  let pad = ''
  const padRead = document.getElementById('pad-read')!
  const padSync = () => { padRead.textContent = pad === '' ? '—' : pad }
  /** 확률적 입력의 스테이징 — 값을 갈아끼운다(다시 쓰면/다시 말하면 대체·«확정 전») */
  const stage = (text: string) => { pad = text; padSync() }
  document.getElementById('pad-keys')!.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).dataset?.k
    if (k === undefined) return
    if (k === 'del') pad = pad.slice(0, -1)
    else if (k === 'clear') pad = ''
    else if (k === 'apply') { if (pad !== '' && pad !== '.') onWritten(pad); return }
    else if (k === '.') { if (!pad.includes('.')) pad += '.' }
    else if (pad.length < 12) pad += k
    padSync()
  })

  return {
    show(text) { live.textContent = text ?? '—' },
    clearInk,
    readout(t) { read.textContent = t },
    stage,
    scale(text, set) {
      scaleEl.textContent = text
      scaleEl.dataset.scale = set ? 'set' : 'unset'
    },
    skew(text) {
      skewEl.hidden = text === null
      skewEl.textContent = text ?? ''
      skewEl.dataset.skew = text === null ? '0' : '1'
    },
    measure(text, state) {
      measureEl.textContent = text
      measureEl.dataset.measure = state
    },
  }
}
