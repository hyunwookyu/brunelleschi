// 화면 규칙 **R7** — 열린 통은 그 통 바깥의 무엇을 눌러도 접힌다 (web2-34 4번).
//
// 사람의 말: 「필통이나 볼펜통을 열어놓은 상태에서 지우개 등 다른 버튼을 누르면 통이
// 접혀야 한다.」 28-1(R3)은 패널 **안**의 거동만 다뤘고 **바깥이 비어 있었다.**
//
// ⚠⚠ **새 기제를 만들지 않는다**(#54). 이 파일은 `paperbar.ts`·`layerbar.ts`·`notice.ts`가
// 각자 갖고 있던 **똑같은 `away` 핸들러 셋**을 한 자리로 옮긴 것이고 규약은 그대로다:
//
//   - `pointerdown`을 **캡처 단계**에서 듣는다 — 앱 핸들러보다 먼저 «접힘»을 판단한다.
//   - ⚠⚠ **아무것도 안 삼킨다.** `preventDefault`도 `stopPropagation`도 안 쓴다. 첫 누름은
//     **접기와 그 누름의 제 일**을 둘 다 한다 — 삼키면 캔버스의 획·탭이 통째로 죽는다
//     (#77 ㉠. 그 반증 짝이 `e2e/ui34r7.spec.ts` ②다: 통이 열린 채 캔버스에 그으면
//      통은 접히고 **그 획은 정상으로 그려진다**).
//   - 통의 «안»(`zone`)은 통 자신과 **그것을 여는 단추**다. 여는 단추를 안에 넣어야
//     여닫이가 산다(누르는 순간 접고 곧바로 다시 여는 깜빡임이 안 생긴다).
//
// 그리고 **동시에 둘이 열리지 않는다** — 통을 여는 쪽이 `closeOtherBoxes`를 부른다.
// ⛔ 「무엇이 열려 있나」를 그때그때 추측하는 코드는 안 만든다(28-1의 `FOLD_PANELS`가
//    그 어법이다 — 목록이 늘 때마다 틀린다). 등록부가 곧 목록이다.

/** 열리는 것 하나 — 통·팝오버·서랍. */
export interface Box {
  /** 진단·팔이 읽는 이름. 대개 그 통의 선택자(`#tray` 등). */
  id: string
  isOpen: () => boolean
  close: () => void
  /** 이 통의 «안» — 통 자신과 그것을 여는 단추(들). 여기 안을 누르면 안 접힌다. */
  zone: () => (Node | null | undefined)[]
  /** 다른 통이 열릴 때 닫히는가. 기본 **참**.
   *  거짓인 것은 «곁딸린 확인»(`#confirm-pop`)뿐이다 — 그것은 열린 서랍 «안»의 단추에
   *  붙어 뜨므로 서랍과 **함께 떠 있는 것이 설계**다(#69 ㉣ · web2-12 4번). */
  exclusive?: boolean
  /** 참인 동안은 바깥 누름에 **안 접힌다** — 「바깥을 눌러야 그 패널의 일이 되는」 구간.
   *  R7 예외의 판정 문면은 `DECISIONS.md`의 R7 절에 있고 지금 쓰는 데는 한 곳이다
   *  (필압 보정 절차 — 그 동안 캔버스 획이 그 패널의 일이다). */
  pinned?: () => boolean
}

const boxes: Box[] = []
let listening = false

/** **반증 손잡이**(D-3 — 팔은 `e2e/ui34r7.spec.ts` ⑥). 평상시는 `'on'`이고 다른 둘은
 *  «틀린 판»을 실제로 만들어 검사를 빨갛게 만드는 데만 쓴다:
 *   - `'off'`   — 바깥 누름을 안 듣는다(R7을 안 건 판). ①②③이 빨개진다.
 *   - `'swallow'` — 바깥 누름을 **삼킨다**(#77 ㉠의 형태). ⚠⚠ **①③은 여전히 초록이고
 *     ②만 빨개진다** — 「접힌다」와 「그 누름의 제 일이 산다」가 다른 축이라는 증거다. */
let mode: 'on' | 'off' | 'swallow' = 'on'
export function setBoxAwayModeForTest(m: 'on' | 'off' | 'swallow') { mode = m }

function onDown(e: PointerEvent) {
  if (mode === 'off') return                            // 반증 ㉠
  const t = e.target
  if (!(t instanceof Node)) return
  if (mode === 'swallow') { e.stopPropagation(); e.preventDefault() }   // 반증 ㉡ — ⛔ 평상시 금지
  // ⚠ 사본을 돈다 — `close()`가 자기 등록을 지우는 통이 있다(동적 팝오버).
  for (const b of [...boxes]) {
    if (!b.isOpen()) continue
    if (b.pinned?.()) continue
    if (b.zone().some(n => !!n && n.contains(t))) continue
    b.close()
  }
  // ⛔ 여기서 e를 건드리지 않는다(위 ⚠⚠ — 반증 손잡이 밖에서는 삼키지 않는다).
}

/** 통 하나를 등록한다. 돌려주는 함수가 등록을 지운다(동적 팝오버가 닫힐 때 부른다). */
export function registerBox(b: Box): () => void {
  if (!listening) {
    window.addEventListener('pointerdown', onDown, true)
    listening = true
  }
  boxes.push(b)
  return () => {
    const i = boxes.indexOf(b)
    if (i >= 0) boxes.splice(i, 1)
  }
}

/** 통 하나를 «지금 열린 하나»로 만든다 — 나머지 배타 통을 전부 닫는다.
 *  여는 쪽에서 부른다. 바깥 누름(`onDown`)만으로도 대개 같은 결과가 나지만,
 *  **손가락을 안 거치고 열리는 길**(도구 전환·안내 줄의 「면 만들기」 등)이 있어서
 *  「동시에 둘이 안 열린다」를 여기 한 자리에서 못 박는다. */
export function closeOtherBoxes(id: string): void {
  for (const b of [...boxes]) {
    if (b.id === id || b.exclusive === false) continue
    if (b.isOpen()) b.close()
  }
}

/** 지금 열려 있는 통의 이름들 — 진단용(`S2S`/`__b2`가 읽는다). */
export function openBoxIds(): string[] {
  return boxes.filter(b => b.isOpen()).map(b => b.id)
}
