// **캔버스 좌표 규약 — 단 하나의 출처.**
//
// 이 파일이 생긴 이유: 같은 캔버스를 **둘이 서로 다른 규약으로** 쓰고 있었다.
//   - `main.ts`의 `fit()`이 `ctx.setTransform(dpr,0,0,dpr,0,0)`을 걸어 **CSS 픽셀 좌표계**를 만들고,
//   - `InkCanvas`는 변환이 **항등**이라고 보고 좌표마다 `* dpr`을 곱했다(배경은 `scale(dpr,dpr)`까지).
// 그래서 dpr>1인 기기에서 잉크가 **dpr배 어긋난 자리**에 그려졌다(배경은 dpr²배).
// **데스크톱 dpr=1에서는 전부 항등이라 한 번도 안 보였다** — iPad에서만 나는 버그였다.
//
// 규약을 하나로 못 박는다:
//
//   **모든 그리기와 모든 입력 좌표는 CSS 픽셀이다.** 백버퍼는 CSS크기×dpr이고,
//   그 배율은 `setTransform` **한 군데**에만 있다. 그리는 쪽은 dpr을 몰라도 된다.
//
// 그리고 **틀어짐을 스스로 고친다**: 그릴 때마다 요소의 실제 크기와 마지막으로 맞춘 크기를
// 비교해 다르면 다시 맞춘다. `ResizeObserver`가 안 오는 환경(S-1에서 캔버스가 1×24로 굳었다),
// 분할 바 드래그, 화면 회전, iOS 주소창 표시가 전부 여기서 회복된다.
export interface Frame {
  /** 요소의 CSS 크기(px). 그리기·입력 좌표계의 크기다. */
  cssW: number;
  cssH: number;
  dpr: number;
  /** 백버퍼 크기(px) = CSS크기 × dpr을 반올림한 것. */
  backW: number;
  backH: number;
  /**
   * **실제 배율** = 백버퍼 ÷ CSS크기. `dpr`이 아니다 — 반올림 때문에 갈린다.
   * 브라우저는 백버퍼를 CSS 상자에 **꽉 차게** 늘려 그리므로 화면 배율은 이 값이고,
   * 그리기 변환도 이 값을 써야 "닿는 자리 = 그려지는 자리"가 **정확히** 성립한다.
   * (490×672 @2처럼 딱 떨어지면 `dpr`과 같다. 1×24 @1.5 같은 자리에서만 갈린다.)
   */
  sx: number;
  sy: number;
}

/** dpr을 한 군데서 읽는다(테스트가 주입할 수 있게 인자로도 받는다). */
export const deviceRatio = (): number =>
  (typeof window !== "undefined" && window.devicePixelRatio) || 1;

/** CSS 크기와 dpr이 정하는 프레임. **반올림은 여기서만 한다.** */
export function frameOf(cssW: number, cssH: number, dpr: number): Frame {
  const w = Math.max(1, cssW), h = Math.max(1, cssH), r = Math.max(0.01, dpr);
  const backW = Math.max(1, Math.round(w * r)), backH = Math.max(1, Math.round(h * r));
  return { cssW: w, cssH: h, dpr: r, backW, backH, sx: backW / w, sy: backH / h };
}

/**
 * 포인터 이벤트 → **CSS 픽셀 로컬 좌표**. `getBoundingClientRect`를 쓰므로 스크롤·안전영역·
 * `visualViewport` 오프셋이 전부 반영된다(그 셋은 rect에 이미 들어 있다).
 *
 * **요소가 CSS로 늘어나 있으면**(백버퍼가 낡아 브라우저가 늘려 그리는 중) 그 배율까지 되돌린다 —
 * 그러지 않으면 그리는 자리와 닿는 자리가 갈린다. `ensureFit`이 곧 고치지만, 그 사이에 들어온
 * 이벤트도 맞아야 한다.
 */
export function toLocal(rect: { left: number; top: number; width: number; height: number },
                        frame: Frame, clientX: number, clientY: number): [number, number] {
  const sx = rect.width > 0 ? frame.cssW / rect.width : 1;
  const sy = rect.height > 0 ? frame.cssH / rect.height : 1;
  return [(clientX - rect.left) * sx, (clientY - rect.top) * sy];
}

/** 로컬(CSS px) → **백버퍼 픽셀**. 그리기 변환이 하는 일과 같은 계산이다(불변식 테스트용). */
export const toDevice = (frame: Frame, p: [number, number]): [number, number] =>
  [p[0] * frame.sx, p[1] * frame.sy];

/** 백버퍼 픽셀 → 로컬(CSS px). `toDevice`의 역. */
export const fromDevice = (frame: Frame, p: [number, number]): [number, number] =>
  [p[0] / frame.sx, p[1] / frame.sy];

/**
 * 캔버스를 프레임에 맞춘다. **백버퍼 크기와 변환을 함께** 세우는 유일한 자리다.
 * 백버퍼 크기를 바꾸면 컨텍스트 상태가 초기화되므로 **변환을 그 뒤에 다시 건다**.
 */
export function applyFrame(canvas: HTMLCanvasElement, frame: Frame): CanvasRenderingContext2D {
  if (canvas.width !== frame.backW) canvas.width = frame.backW;
  if (canvas.height !== frame.backH) canvas.height = frame.backH;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(frame.sx, 0, 0, frame.sy, 0, 0);   // **dpr이 아니라 실제 배율**(위 `sx`)
  return ctx;
}

/** 요소의 현재 CSS 크기. `getBoundingClientRect`가 `clientWidth`보다 정확하다(소수점). */
export function cssSizeOf(el: HTMLElement): [number, number] {
  const r = el.getBoundingClientRect();
  return [Math.max(1, r.width), Math.max(1, r.height)];
}

/**
 * **그릴 때마다 부른다.** 요소 크기나 dpr이 마지막으로 맞춘 것과 다르면 다시 맞춘다.
 * 크기 변화를 이벤트로 잡으려 하지 않는다 — `ResizeObserver`가 안 오는 환경이 있었고(AS-11),
 * 주소창·회전·분할 바는 이벤트가 제각각이다. **그리기 직전에 확인하는 것이 가장 단순하고 샌다.**
 */
export function ensureFit(canvas: HTMLCanvasElement, prev: Frame | null,
                          dpr = deviceRatio()): { frame: Frame; changed: boolean } {
  const [w, h] = cssSizeOf(canvas);
  const frame = frameOf(w, h, dpr);
  const changed = !prev || prev.backW !== frame.backW || prev.backH !== frame.backH
                       || prev.dpr !== frame.dpr;
  if (changed) applyFrame(canvas, frame);
  return { frame, changed };
}
