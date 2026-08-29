// 기기에서 눈으로 읽는 진단(web2-10 지시 4 · web2-11 1-f 확장) — 태블릿에는 콘솔이 없어
// window.__b2를 아무도 못 읽는다. **설정 패널의 「진단」**을 누르면 이 패널이 펴진다
// (web2-30 3번 별건 전까지는 우하단 빌드 식별자가 그 자리였다).
//
// 값의 성격: 전부 **그 자리에서 읽는 현재값**이다(저장 없음). 포인터 줄만 상태를 든다 —
// 「마지막 입력의 종류·필압」은 지나간 이벤트라 들어 둬야 보인다.
// 캡처 단계 + passive로 듣는다: 앱 핸들러(input.ts)보다 먼저 보되 아무것도 안 바꾼다.
//
// 필압 「단계 수」: EMR 펜이 8192단계를 선언하는데 브라우저가 실제로 몇 단계를 올려
// 보내는지 아무도 안 봤다(지시 문면). pressure의 서로 다른 값을 세면 하한이 나온다 —
// 상한 캡 20000(8192를 다 세고도 남는 크기. 넘치면 「20000+」로 보이고 그 자체가 답이다).
//
// web2-11이 더한 것:
// - **날값 줄**(1-f) — pointerType·button·buttons·pressure·tiltX/Y·twist를 가공 없이.
//   기울기가 «안 오는» 입력에서 무엇이 오는지(0인가 undefined인가)가 2부 폴백의 관측
//   근거다(1-b) — 그래서 undefined를 «0»으로 뭉개지 않고 그대로 보인다.
// - **지우개 끝 신호**(1-d) — `pen + (button 5 | buttons&32)`. ⚠ web2-11에서는 «관측만»
//   이었다(명세 역사는 확인 대상이지 결론이 아니다 — D-4). **web2-15에서 실기기가
//   답했다**: Pro Pen 3E + 안드로이드 15 크롬은 지우는 내내 `buttons 32`를 보내고
//   호버에는 아무것도 안 보낸다. 그래서 지금은 **판정에 쓴다**(`buttons&32` 하나 —
//   `button===5`는 순간값이라 기록만). 도구는 여전히 안 바꾼다(그 획만 — 2-b).
// - **coalesced 계수**(1-a) — 포인터 종류별 «이벤트 수 / coalesced로 더 받은 점 수».
//   버려지던 점 수의 실측 통로다(마우스·펜·손가락 각각 — 원장은 e2e가 남긴다).
// - **최근 획**(1-f) — 점 수·coalesced 추가분·.brnl 바이트(main.ts가 extra로 준다).

const PRESSURE_CAP = 20000
// C.PRESS_Q와 같은 값이어야 한다 — core를 import하지 않으려고 복제하지 않고 가져온다
import { C } from '../core/constants'
const PRESS_QUANT = C.PRESS_Q

/** 포인터 종류별 계측(1-a) — e2e 원장이 이 구조를 그대로 읽는다.
 *  ⚠ 폴백은 **원인별로 두 칸**이다(1차 리뷰어 [2] — 「API 없음」과 「빈 목록」을 한 수로
 *  합치면 실기기에서 어느 쪽인지 못 가른다. #43). 검산: events == bundled + empty + noApi. */
export interface PtrTally {
  events: number
  /** coalesced로 «더» 받은 점 수 = Σ(묶음 크기 − 1) */
  extra: number
  /** 묶음이 실제로 온(비어 있지 않은) 이벤트 수 */
  bundled: number
  /** API는 있는데 목록이 «비어» [e]로 떨어진 이벤트 수 — 크로뮴은 pointerdown이 이렇다 */
  empty: number
  /** getCoalescedEvents 자체가 없어 [e]로 떨어진 이벤트 수 */
  noApi: number
}

export interface LastRaw {
  type: string
  button: number
  buttons: number
  pressure: number
  tiltX: number | undefined
  tiltY: number | undefined
  twist: number | undefined
  /** 지우개 끝 신호(1-d) — 관측만. `button===5 || (buttons&32)!==0` */
  eraserBit: boolean
}

export function initDiagPanel(
  /** 여닫이 — web2-30 3번부터 **설정 패널의 「진단」**이다(빌드 식별자는 표시로 물러났다) */
  toggleEl: HTMLElement, panelEl: HTMLElement,
  extra?: () => [string, string][],
) {
  let lastPointer: { type: string; maxPressure: number; levels: Set<number>; qlevels: Set<number> } | null = null
  let lastRaw: LastRaw | null = null
  /** 지우개 끝 신호가 이 세션에 한 번이라도 관측됐는가(1-d) — 순간 신호라 들어 둔다 */
  let eraserBitSeen = false
  const tally = new Map<string, PtrTally>()

  const track = (e: PointerEvent) => {
    if (!lastPointer || lastPointer.type !== e.pointerType)
      lastPointer = { type: e.pointerType, maxPressure: 0, levels: new Set(), qlevels: new Set() }
    const feel = (p: number) => {
      if (p > lastPointer!.maxPressure) lastPointer!.maxPressure = p
      if (p > 0 && lastPointer!.levels.size < PRESSURE_CAP) {
        lastPointer!.levels.add(p)
        // 양자화 후 단계(1-c의 되돌릴 조건) — 서로 다른 원시값 둘이 같은 저장값으로
        // 접히면(qlevels < levels) PRESS_Q가 브라우저 분해능보다 좁은 것이다.
        // «8191을 넘으면»보다 훨씬 먼저 발화한다(1차 리뷰어 [7] — 도달 가능 조건으로 교체).
        lastPointer!.qlevels.add(Math.round(p * PRESS_QUANT))
      }
    }
    feel(e.pressure)
    // coalesced 이벤트가 더 촘촘하다 — 120Hz 펜은 한 move에 여러 표본을 싣는다
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null
    for (const c of evs ?? []) feel(c.pressure)
    const t = tally.get(e.pointerType) ?? { events: 0, extra: 0, bundled: 0, empty: 0, noApi: 0 }
    t.events++
    if (evs === null) t.noApi++
    else if (evs.length === 0) t.empty++
    else { t.bundled++; t.extra += evs.length - 1 }
    tally.set(e.pointerType, t)
    lastRaw = {
      type: e.pointerType, button: e.button, buttons: e.buttons, pressure: e.pressure,
      // 명세는 tiltX/Y·twist를 정의하지만 구현이 없으면 undefined가 «관측»이다(1-b)
      tiltX: (e as any).tiltX, tiltY: (e as any).tiltY, twist: (e as any).twist,
      eraserBit: e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0),
    }
    if (lastRaw.eraserBit) eraserBitSeen = true
    if (!panelEl.hidden) render()
  }
  window.addEventListener('pointerdown', track, { capture: true, passive: true })
  window.addEventListener('pointermove', track, { capture: true, passive: true })

  const displayMode = (): string => {
    for (const m of ['standalone', 'fullscreen', 'minimal-ui'])
      if (matchMedia(`(display-mode: ${m})`).matches) return m
    return 'browser'
  }

  const show = (v: number | undefined): string => v === undefined ? 'undefined' : String(v)

  const rows = (): [string, string][] => {
    const dpr = window.devicePixelRatio
    const base: [string, string][] = [
      ['필기 인식 API', 'createHandwritingRecognizer' in navigator ? '있음' : '없음'],
      ['devicePixelRatio', String(dpr)],
      ['표시 모드', displayMode()],
      ['화면 CSS px', `${window.innerWidth}×${window.innerHeight}`],
      ['창 물리 px', `${Math.round(window.innerWidth * dpr)}×${Math.round(window.innerHeight * dpr)}`],
      // 화면 «장치» 해상도 — 지시의 「물리 해상도」는 이것이다(창×dpr은 표시줄 몫만큼 작다).
      // MovinkPad면 여기 2880×1800이 보여야 한다(2차 리뷰어 [8]).
      ['화면 물리 px', `${Math.round(screen.width * dpr)}×${Math.round(screen.height * dpr)} (screen ${screen.width}×${screen.height} CSS)`],
      ['마지막 포인터', lastPointer
        ? `${lastPointer.type} · 필압 최대 ${lastPointer.maxPressure.toFixed(4)} · 단계 ${lastPointer.levels.size >= PRESSURE_CAP ? `${PRESSURE_CAP}+` : lastPointer.levels.size} · 양자화 후 ${lastPointer.qlevels.size}`
        : '—'],
      // ── web2-11 1-f: 날값 — 가공하지 않는다(«undefined»도 관측이다) ──
      ['포인터 날값', lastRaw
        ? `${lastRaw.type} button ${lastRaw.button} buttons ${lastRaw.buttons} pressure ${lastRaw.pressure.toFixed(4)}`
        : '—'],
      ['기울기 날값', lastRaw
        ? `tiltX ${show(lastRaw.tiltX)} tiltY ${show(lastRaw.tiltY)} twist ${show(lastRaw.twist)}`
        : '—'],
      // web2-15 2번 — 「표시만」이 아니다: 이 비트가 그 획을 지우개 경로로 보낸다.
      // ⚠ **판정에 쓰는 것은 `buttons&32` 하나**다(그리는 내내 유효한 신호 — 실기기
      //   관측). `button===5`는 누름·뗌 순간에만 오므로 여기 «관측 기록»으로만 남는다.
      ['지우개 끝 신호', lastRaw
        ? `${(lastRaw.buttons & 32) !== 0 ? '지금 buttons&32 — 이 획은 지우개다' : '지금 없음 — 연필이다'}`
          + ` · 세션 중 관측 ${eraserBitSeen ? '있었다' : '없었다'}`
          + ` (판정=buttons&32 · button5는 기록만: ${lastRaw.button === 5 ? '봤다' : '아니다'})`
        : '—'],
      ...[...tally.entries()].map(([k, t]): [string, string] =>
        [`coalesced(${k})`, `이벤트 ${t.events} · 추가 점 ${t.extra} · 묶음 ${t.bundled} · 빈 목록 ${t.empty} · API 없음 ${t.noApi}`]),
      ...(extra ? extra() : []),
      ['UA', navigator.userAgent],
    ]
    return base
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

  toggleEl.addEventListener('click', () => {
    panelEl.hidden = !panelEl.hidden
    if (!panelEl.hidden) render()
  })

  // e2e·원장 통로 — 패널 문자열이 아니라 같은 자료를 그대로 읽는다
  return {
    tally: () => Object.fromEntries([...tally.entries()].map(([k, t]) => [k, { ...t }])),
    lastRaw: () => lastRaw ? { ...lastRaw } : null,
    eraserBitSeen: () => eraserBitSeen,
    /** 필압 단계 — 원시/양자화 후. quantized < raw면 PRESS_Q가 좁다(되돌릴 조건) */
    pressureLevels: () => lastPointer
      ? { type: lastPointer.type, raw: lastPointer.levels.size, quantized: lastPointer.qlevels.size }
      : null,
  }
}
