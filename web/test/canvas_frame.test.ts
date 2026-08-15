// **캔버스 좌표 불변식** — "펜이 닿는 자리 = 잉크가 나오는 자리".
//
// 이 테스트가 생긴 이유: 같은 캔버스를 둘이 **다른 규약으로** 쓰고 있었다(`canvasFrame.ts` 머리말).
// `main.ts`가 `setTransform(dpr,…)`으로 CSS 픽셀 좌표계를 만들어 두었는데 `InkCanvas`는 변환이
// 항등인 줄 알고 좌표마다 `* dpr`을 곱했다 — **dpr배 어긋난 자리에 그려진다**.
// **dpr=1에서는 항등이라 안 보인다.** 데스크톱 확인도 Playwright(deviceScaleFactor 1)도 못 잡았다.
//
// 그래서 §4.5 재투영 항등과 **같은 성격**의 불변식으로 잠근다:
//
//   화면의 한 점 → 로컬 좌표 → 그리기 변환 → **같은 화면 점**
//
// dpr 1·2·3과 여러 캔버스 크기에서, 그리고 **크기가 바뀐 뒤에도** 성립해야 한다.
import { describe, it, expect } from "vitest";
import { frameOf, toLocal, toDevice, fromDevice, ensureFit,
         type Frame } from "../src/capture/canvasFrame.js";

const DPRS = [1, 2, 3, 1.5, 2.75];
const SIZES: [number, number][] = [[490, 672], [1024, 768], [1, 24], [375, 812], [1440, 900]];

/** 요소가 화면 어디에 있든 상관없어야 한다 — rect의 원점을 흔들어 본다. */
const RECTS = [
  { left: 0, top: 0 }, { left: 12, top: 48 }, { left: -30, top: 5 }, { left: 200.5, top: 90.25 },
];

describe("캔버스 좌표 불변식 — 닿는 자리와 그려지는 자리", () => {
  it("포인터 → 로컬 → 백버퍼 → 화면이 **항등**이다(dpr·크기·위치 전부)", () => {
    for (const dpr of DPRS) for (const [w, h] of SIZES) for (const o of RECTS) {
      const frame = frameOf(w, h, dpr);
      const rect = { ...o, width: w, height: h };
      // 캔버스 안의 여러 자리에서 확인한다(모서리 포함 — 오프셋과 배율이 여기서 갈린다)
      for (const [fx, fy] of [[0, 0], [0.5, 0.5], [1, 1], [0.13, 0.87], [1, 0]] as [number, number][]) {
        const clientX = o.left + w * fx, clientY = o.top + h * fy;
        const local = toLocal(rect, frame, clientX, clientY);
        // 그리기 변환이 하는 일
        const device = toDevice(frame, local);
        // 그 백버퍼 픽셀이 화면에서 어디인가 — 백버퍼는 CSS 상자에 꽉 차게 늘어난다
        const backToCssX = (device[0] / frame.backW) * rect.width + rect.left;
        const backToCssY = (device[1] / frame.backH) * rect.height + rect.top;
        expect(backToCssX).toBeCloseTo(clientX, 6);
        expect(backToCssY).toBeCloseTo(clientY, 6);
      }
    }
  });

  it("로컬 ↔ 백버퍼 왕복이 항등이다", () => {
    for (const dpr of DPRS) {
      const frame = frameOf(800, 600, dpr);
      for (const p of [[0, 0], [123.4, 55.5], [800, 600]] as [number, number][]) {
        const back = fromDevice(frame, toDevice(frame, p));
        expect(back[0]).toBeCloseTo(p[0], 9);
        expect(back[1]).toBeCloseTo(p[1], 9);
      }
    }
  });

  /**
   * **반례** — 옛 코드의 방식(변환도 걸고 좌표에 `* dpr`도 곱한다)이 실제로 어긋나는지 확인한다.
   * 이것이 깨지면(= 어긋나지 않으면) 이 테스트가 버그를 못 잡는다는 뜻이다.
   */
  it("반례: **두 번 곱하면** dpr배 어긋난다(고치기 전 동작)", () => {
    const dpr = 2;
    const frame = frameOf(490, 672, dpr);
    const rect = { left: 0, top: 0, width: 490, height: 672 };
    const local = toLocal(rect, frame, 300, 200);
    const correct = toDevice(frame, local);            // 변환만
    const doubled: [number, number] = [local[0] * frame.sx * dpr, local[1] * frame.sy * dpr];  // 변환 + 손곱
    expect(doubled[0]).toBeCloseTo(correct[0] * dpr, 6);
    expect(Math.hypot(doubled[0] - correct[0], doubled[1] - correct[1])).toBeGreaterThan(100);
  });

  it("**요소가 늘어나 있으면**(백버퍼가 낡았을 때) 입력 좌표가 그 배율을 되돌린다", () => {
    // 프레임은 490×672로 맞춰져 있는데 요소가 980×1344로 커진 순간(다음 그리기 전)
    const frame = frameOf(490, 672, 2);
    const rect = { left: 0, top: 0, width: 980, height: 1344 };
    // 요소의 정중앙을 눌렀다 → 프레임 좌표의 정중앙이어야 한다
    const local = toLocal(rect, frame, 490, 672);
    expect(local[0]).toBeCloseTo(245, 6);
    expect(local[1]).toBeCloseTo(336, 6);
  });

  it("`frameOf`는 반올림을 한 군데서만 한다 — 백버퍼는 CSS×dpr의 반올림이다", () => {
    expect(frameOf(490, 672, 2)).toMatchObject({ backW: 980, backH: 1344, sx: 2, sy: 2 });
    expect(frameOf(375.5, 812.25, 3)).toMatchObject({ backW: 1127, backH: 2437 });
    expect(frameOf(0, 0, 2)).toMatchObject({ cssW: 1, cssH: 1, backW: 2, backH: 2 });
    // **반올림이 생기면 배율이 dpr과 갈린다** — 그때 `dpr`로 그리면 어긋난다(그래서 `sx`를 쓴다)
    const odd = frameOf(1, 24, 1.5);
    expect(odd.backW).toBe(2);
    expect(odd.sx).toBe(2);
    expect(odd.sx).not.toBe(odd.dpr);
  });
});

describe("`ensureFit` — 크기가 바뀌면 스스로 맞춘다", () => {
  /** 최소 캔버스 대역(브라우저 없이 확인한다 — `getContext`와 크기만 있으면 된다). */
  function fakeCanvas(w: number, h: number) {
    const calls: number[][] = [];
    const el = {
      width: 0, height: 0,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
      getContext: () => ({ setTransform: (...a: number[]) => { calls.push(a); } }),
    };
    return { el: el as unknown as HTMLCanvasElement, calls,
             setSize(nw: number, nh: number) { w = nw; h = nh; } };
  }

  it("처음에는 맞추고, 안 바뀌면 다시 안 맞춘다", () => {
    const c = fakeCanvas(490, 672);
    const a = ensureFit(c.el, null, 2);
    expect(a.changed).toBe(true);
    expect(c.el.width).toBe(980);
    expect(c.calls[0]).toEqual([2, 0, 0, 2, 0, 0]);   // 490×672는 딱 떨어져 dpr과 같다
    const b = ensureFit(c.el, a.frame, 2);
    expect(b.changed).toBe(false);
    expect(c.calls.length).toBe(1);
  });

  it("**요소가 커지면 다시 맞춘다** — `ResizeObserver`가 안 와도 회복된다(AS-11)", () => {
    const c = fakeCanvas(1, 24);                    // S-1에서 실제로 굳었던 크기
    const a = ensureFit(c.el, null, 2);
    expect(c.el.width).toBe(2);
    c.setSize(490, 672);
    const b = ensureFit(c.el, a.frame, 2);
    expect(b.changed).toBe(true);
    expect(c.el.width).toBe(980);
    expect(b.frame.cssW).toBe(490);
  });

  it("**dpr이 바뀌어도 다시 맞춘다**(창을 다른 배율 화면으로 옮길 때)", () => {
    const c = fakeCanvas(490, 672);
    const a = ensureFit(c.el, null, 1);
    expect(c.el.width).toBe(490);
    const b = ensureFit(c.el, a.frame, 3);
    expect(b.changed).toBe(true);
    expect(c.el.width).toBe(1470);
    expect(c.calls[c.calls.length - 1]).toEqual([3, 0, 0, 3, 0, 0]);
  });

  it("백버퍼 크기를 바꾼 **뒤에** 변환을 건다(순서가 바뀌면 변환이 초기화된다)", () => {
    const c = fakeCanvas(490, 672);
    ensureFit(c.el, null, 2);
    // `applyFrame`이 크기 설정 → `getContext` → `setTransform` 순이어야 한다.
    // 크기를 먼저 바꾸지 않으면 브라우저가 컨텍스트를 초기화하며 변환을 지운다.
    expect(c.el.width).toBe(980);
    expect(c.calls.length).toBe(1);
  });
});
