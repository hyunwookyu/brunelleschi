// **좌표 회귀** — "펜이 닿는 자리 = 잉크가 나오는 자리"를 **실제 브라우저에서** 잠근다.
//
// 이 스펙이 생긴 이유: 잉크가 dpr배 어긋나 그려지고 있었는데
// **데스크톱(dpr=1)에서도, 기존 Playwright(deviceScaleFactor 1)에서도 안 잡혔다.**
// 그러므로 여기서는 **dpr을 2·3으로 놓고** 돌린다 — iPad가 그 자리다.
//
// 재는 것 둘:
//   ① 앱이 기록한 `pts2d`가 **누른 CSS 좌표와 같은가**(입력 경로)
//   ② 그 좌표가 **캔버스에 실제로 칠해졌는가**(그리기 경로) — 백버퍼 픽셀을 직접 읽는다.
// ②가 없으면 "기록은 맞는데 화면만 어긋나는" 이번 버그를 못 잡는다.
//
// **2026-08-16: 새 UI(`l.html`)로 옮겼다.** 옛 UI를 지우기 전에 이 잠금이 새 경로에서도
// 성립해야 하기 때문이다(A-4). 옮기면서 갈린 것 셋 — 손잡이가 `window.s2s` → **`window.S2S`**,
// 획 목록이 `s2s.strokes` → **`S2S.doc().strokes`**, 진단이 `s2s.diag()` → **`S2S.diag()`**
// (`mainL.ts`의 `frameDiag`). 도구 막대도 `#tools [data-t]` → **`#bar [data-act]`**다.
// ⚠ **`view_vs_overlay`의 뜻이 달라졌다** — 단일 뷰포트라 견주는 것이
// **잉크 CSS 상자 ↔ three 렌더러 뷰 크기**다(옛 UI는 2D·3D 캔버스 둘이었다).
// ⚠⚠ **버그를 되살려 실제로 잡는지 확인했다**(#21) — 아래 `[회귀]` 테스트가 그 자리다.
import { test, expect, type Page } from "@playwright/test";

/** dpr마다 새 컨텍스트를 연다 — `deviceScaleFactor`는 컨텍스트 생성 시에만 정해진다. */
for (const dpr of [1, 2, 3]) {
  test.describe(`dpr ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 800 } });

    test("닿은 자리에 잉크가 나온다 — 기록·픽셀 둘 다", async ({ page }) => {
      await page.goto("/l.html");
      await page.evaluate(() => new Promise<void>(res => {
        const q = indexedDB.deleteDatabase("sketch2space");
        q.onsuccess = q.onerror = q.onblocked = () => res();
      }));
      await page.reload();
      await page.waitForFunction(() => !!(window as any).S2S);

      const r = await page.evaluate(() => {
        const S = (window as any).S2S;
        const cv = document.getElementById("ink") as HTMLCanvasElement;
        const rect = cv.getBoundingClientRect();
        // 그리기 도구로 바꾸고(획이 기록되게) 캔버스 안 한 자리를 긋는다
        (document.querySelector('#bar button[data-act="draw"]') as HTMLButtonElement).click();
        // **왼쪽 위 사분면에 긋는다** — 어긋난 잉크(×dpr 자리)가 캔버스 **안에** 떨어져야
        // 그 자리를 검사할 수 있다. 가운데에 그으면 ×3 자리가 캔버스 밖이라 아무것도 안 보인다
        // (첫 판이 그래서 버그를 못 잡았다 — 재현해 확인했다).
        const A = [Math.round(rect.width * 0.10), Math.round(rect.height * 0.10)];
        const B = [Math.round(rect.width * 0.28), Math.round(rect.height * 0.26)];
        const ev = (type: string, x: number, y: number, buttons: number) =>
          cv.dispatchEvent(new PointerEvent(type, {
            clientX: rect.left + x, clientY: rect.top + y, pointerId: 1, pointerType: "mouse",
            isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons }));
        ev("pointerdown", A[0], A[1], 1);
        for (let i = 1; i <= 10; i++) {
          ev("pointermove", A[0] + ((B[0] - A[0]) * i) / 10, A[1] + ((B[1] - A[1]) * i) / 10, 1);
        }
        ev("pointerup", B[0], B[1], 0);

        const st = S.doc().strokes;
        const s = st[st.length - 1];
        const frame = S.diag();
        // **백버퍼에서 잉크를 찾는다**: 그린 선분의 중점 근처에 어두운 픽셀이 있어야 한다
        const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        const sx = frame.ink.scale[0], sy = frame.ink.scale[1];
        const ctx = cv.getContext("2d")!;
        const probe = (cssX: number, cssY: number, rad = 4) => {
          const px = Math.round(cssX * sx), py = Math.round(cssY * sy);
          const n = Math.max(1, Math.round(rad * sx));
          const d = ctx.getImageData(Math.max(0, px - n), Math.max(0, py - n), n * 2 + 1, n * 2 + 1).data;
          let dark = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] < 200 && d[i + 3] > 0) dark += 1;
          return dark;
        };
        return {
          drawnA: [s.pts2d[0][0], s.pts2d[0][1]], drawnB: s.pts2d[s.pts2d.length - 1],
          wantA: A, wantB: B,
          inkAtMid: probe(mid[0], mid[1]),
          // **어긋났다면 잉크는 dpr배 자리에 있다** — 그 자리도 확인해 원인을 가른다
          inkAtScaled: probe(mid[0] * frame.dpr, mid[1] * frame.dpr),
          frame,
        };
      });

      // ① 입력 경로 — 기록된 좌표가 누른 CSS 좌표와 같다
      expect(Math.abs(r.drawnA[0] - r.wantA[0])).toBeLessThan(1);
      expect(Math.abs(r.drawnA[1] - r.wantA[1])).toBeLessThan(1);
      expect(Math.abs(r.drawnB[0] - r.wantB[0])).toBeLessThan(1);
      expect(Math.abs(r.drawnB[1] - r.wantB[1])).toBeLessThan(1);

      // ② 그리기 경로 — **누른 자리에 실제로 칠해졌다**
      expect(r.inkAtMid).toBeGreaterThan(0);
      // **그리고 ×dpr 자리에는 아무것도 없어야 한다.** 이것이 이번 버그를 잡는 조건이다 —
      // 배경 층은 제자리에 그리므로 "제자리에 잉크가 있다"만으로는 어긋난 층을 못 본다.
      if (dpr > 1) expect(r.inkAtScaled).toBe(0);

      // 프레임 자체의 정합성
      expect(r.frame.dpr).toBe(dpr);
      expect(r.frame.ink.scale[0]).toBeCloseTo(dpr, 2);
      expect(r.frame.ink.stretch[0]).toBeCloseTo(dpr, 2);
      expect(r.frame.view_vs_overlay.same).toBe(true);
    });

    /**
     * **[회귀] 양성 채널** — 위 테스트의 `expect(inkAtScaled).toBe(0)`이 **눈이 떠 있는가**(#21·#30).
     *
     * 그 단언은 "×dpr 자리에 잉크가 없다"인데, **탐침이 아무것도 못 보는 상태여도 0이 나온다.**
     * 첫 판이 실제로 그렇게 통과하고 있었다(배경 층이 제자리에 그리는 탓). 그래서
     * **버그를 되살린다**: ×dpr 자리에 일부러 칠하고 같은 탐침이 그것을 **잡는지** 본다.
     * 못 잡으면 위 단언은 아무것도 배제하지 않는다.
     */
    test("[회귀] ×dpr 자리에 일부러 칠하면 같은 탐침이 잡는다", async ({ page }) => {
      test.skip(dpr === 1, "dpr 1에서는 ×dpr 자리가 제자리다 — 가를 것이 없다");
      await page.goto("/l.html");
      await page.waitForFunction(() => !!(window as any).S2S);
      const r = await page.evaluate(() => {
        const S = (window as any).S2S;
        const cv = document.getElementById("ink") as HTMLCanvasElement;
        const frame = S.diag();
        const sx = frame.ink.scale[0], sy = frame.ink.scale[1];
        const ctx = cv.getContext("2d")!;
        const probe = (cssX: number, cssY: number, rad = 4) => {
          const px = Math.round(cssX * sx), py = Math.round(cssY * sy);
          const n = Math.max(1, Math.round(rad * sx));
          const d = ctx.getImageData(Math.max(0, px - n), Math.max(0, py - n),
                                     n * 2 + 1, n * 2 + 1).data;
          let dark = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i] < 200 && d[i + 3] > 0) dark += 1;
          return dark;
        };
        const rect = cv.getBoundingClientRect();
        const mid = [rect.width * 0.10, rect.height * 0.10];
        const before = probe(mid[0] * frame.dpr, mid[1] * frame.dpr);
        // **어긋난 잉크를 흉내 낸다** — 백버퍼에 직접, ×dpr 자리에 굵게 칠한다.
        // (앱 코드를 고치지 않는다. 재는 것은 **탐침의 민감도**다.)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(mid[0] * frame.dpr * sx - 20, mid[1] * frame.dpr * sy);
        ctx.lineTo(mid[0] * frame.dpr * sx + 20, mid[1] * frame.dpr * sy);
        ctx.stroke();
        ctx.restore();
        return { before, after: probe(mid[0] * frame.dpr, mid[1] * frame.dpr), dpr: frame.dpr };
      });
      expect(r.dpr).toBe(dpr);
      expect(r.before).toBe(0);            // 되살리기 전에는 비어 있다
      expect(r.after).toBeGreaterThan(0);  // **되살린 버그를 실제로 잡는다**
    });

    test("창 크기가 바뀌어도 성립한다(ResizeObserver가 안 와도)", async ({ page }) => {
      await page.goto("/l.html");
      await page.waitForFunction(() => !!(window as any).S2S);
      await page.setViewportSize({ width: 900, height: 600 });
      // **리사이즈 이벤트를 기다리지 않는다** — 그리기 직전 `ensureFit`이 회복해야 한다.
      const r = await page.evaluate(() => {
        const S = (window as any).S2S;
        const cv = document.getElementById("ink") as HTMLCanvasElement;
        const rect = cv.getBoundingClientRect();
        (document.querySelector('#bar button[data-act="draw"]') as HTMLButtonElement).click();
        const P = [Math.round(rect.width * 0.6), Math.round(rect.height * 0.4)];
        const ev = (type: string, x: number, y: number, buttons: number) =>
          cv.dispatchEvent(new PointerEvent(type, {
            clientX: rect.left + x, clientY: rect.top + y, pointerId: 1, pointerType: "mouse",
            isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons }));
        ev("pointerdown", P[0], P[1], 1);
        ev("pointermove", P[0] + 40, P[1] + 30, 1);
        ev("pointerup", P[0] + 40, P[1] + 30, 0);
        const st = S.doc().strokes;
        const s = st[st.length - 1];
        return { got: s.pts2d[0], want: P, frame: S.diag() };
      });
      expect(Math.abs(r.got[0] - r.want[0])).toBeLessThan(1);
      expect(Math.abs(r.got[1] - r.want[1])).toBeLessThan(1);
      // 백버퍼가 새 CSS 상자에 맞춰졌다(늘어난 채로 굳지 않았다)
      expect(r.frame.ink.stretch[0]).toBeCloseTo(dpr, 2);
      expect(r.frame.ink.stretch[1]).toBeCloseTo(dpr, 2);
    });
  });
}
