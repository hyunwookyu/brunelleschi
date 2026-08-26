// 기기에서 눈으로 읽는 진단(web2-10 지시 4) — 태블릿에는 콘솔이 없어 window.__b2를
// 아무도 못 읽는다. 우하단 빌드 식별자를 누르면 이 패널이 펴진다.
//
// 값의 성격: 전부 **그 자리에서 읽는 현재값**이다(저장 없음). 포인터 줄만 상태를 든다 —
// 「마지막 입력의 종류·필압」은 지나간 이벤트라 들어 둬야 보인다.
// 캡처 단계 + passive로 듣는다: 앱 핸들러(input.ts)보다 먼저 보되 아무것도 안 바꾼다.
//
// 필압 「단계 수」: EMR 펜이 8192단계를 선언하는데 브라우저가 실제로 몇 단계를 올려
// 보내는지 아무도 안 봤다(지시 문면). pressure의 서로 다른 값을 세면 하한이 나온다 —
// 상한 캡 20000(8192를 다 세고도 남는 크기. 넘치면 「20000+」로 보이고 그 자체가 답이다).

const PRESSURE_CAP = 20000

export function initDiagPanel(buildEl: HTMLElement, panelEl: HTMLElement) {
  let lastPointer: { type: string; maxPressure: number; levels: Set<number> } | null = null

  const track = (e: PointerEvent) => {
    if (!lastPointer || lastPointer.type !== e.pointerType)
      lastPointer = { type: e.pointerType, maxPressure: 0, levels: new Set() }
    if (e.pressure > lastPointer.maxPressure) lastPointer.maxPressure = e.pressure
    if (e.pressure > 0 && lastPointer.levels.size < PRESSURE_CAP) lastPointer.levels.add(e.pressure)
    // coalesced 이벤트가 더 촘촘하다 — 120Hz 펜은 한 move에 여러 표본을 싣는다
    if (e.getCoalescedEvents) for (const c of e.getCoalescedEvents()) {
      if (c.pressure > lastPointer.maxPressure) lastPointer.maxPressure = c.pressure
      if (c.pressure > 0 && lastPointer.levels.size < PRESSURE_CAP) lastPointer.levels.add(c.pressure)
    }
    if (!panelEl.hidden) render()
  }
  window.addEventListener('pointerdown', track, { capture: true, passive: true })
  window.addEventListener('pointermove', track, { capture: true, passive: true })

  const displayMode = (): string => {
    for (const m of ['standalone', 'fullscreen', 'minimal-ui'])
      if (matchMedia(`(display-mode: ${m})`).matches) return m
    return 'browser'
  }

  const rows = (): [string, string][] => {
    const dpr = window.devicePixelRatio
    return [
      ['필기 인식 API', 'createHandwritingRecognizer' in navigator ? '있음' : '없음'],
      ['devicePixelRatio', String(dpr)],
      ['표시 모드', displayMode()],
      ['화면 CSS px', `${window.innerWidth}×${window.innerHeight}`],
      ['물리 px(창×dpr)', `${Math.round(window.innerWidth * dpr)}×${Math.round(window.innerHeight * dpr)}`],
      ['screen', `${screen.width}×${screen.height} (CSS)`],
      ['마지막 포인터', lastPointer
        ? `${lastPointer.type} · 필압 최대 ${lastPointer.maxPressure.toFixed(4)} · 단계 ${lastPointer.levels.size >= PRESSURE_CAP ? `${PRESSURE_CAP}+` : lastPointer.levels.size}`
        : '—'],
      ['UA', navigator.userAgent],
    ]
  }

  function render() {
    panelEl.textContent = ''
    for (const [k, v] of rows()) {
      const line = document.createElement('div')
      const key = document.createElement('span')
      key.className = 'k'
      key.textContent = k
      line.append(key, document.createTextNode(v))
      panelEl.append(line)
    }
  }

  buildEl.addEventListener('click', () => {
    panelEl.hidden = !panelEl.hidden
    if (!panelEl.hidden) render()
  })
}
