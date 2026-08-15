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
import { test, expect, type Page } from "@playwright/test";

/** dpr마다 새 컨텍스트를 연다 — `deviceScaleFactor`는 컨텍스트 생성 시에만 정해진다. */
for (const dpr of [1, 2, 3]) {
  test.describe(`dpr ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 800 } });

    test("닿은 자리에 잉크가 나온다 — 기록·픽셀 둘 다", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => new Promise<void>(res => {
        const q = indexedDB.deleteDatabase("sketch2space");
        q.onsuccess = q.onerror = q.onblocked = () => res();
      }));
      await page.reload();
      await page.waitForFunction(() => !!(window as any).s2s);

      const r = await page.evaluate(() => {
        const s2s = (window as any).s2s;
        const cv = document.getElementById("ink") as HTMLCanvasElement;
        const rect = cv.getBoundingClientRect();
        // 그리기 도구로 바꾸고(획이 기록되게) 캔버스 안 한 자리를 긋는다
        (document.querySelector('#tools button[data-t="draw"]') as HTMLButtonElement).click();
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

        const s = s2s.strokes[s2s.strokes.length - 1];
        const frame = s2s.diag();
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

    test("창 크기가 바뀌어도 성립한다(ResizeObserver가 안 와도)", async ({ page }) => {
      await page.goto("/");
      await page.waitForFunction(() => !!(window as any).s2s);
      await page.setViewportSize({ width: 900, height: 600 });
      // **리사이즈 이벤트를 기다리지 않는다** — 그리기 직전 `ensureFit`이 회복해야 한다.
      const r = await page.evaluate(() => {
        const s2s = (window as any).s2s;
        const cv = document.getElementById("ink") as HTMLCanvasElement;
        const rect = cv.getBoundingClientRect();
        (document.querySelector('#tools button[data-t="draw"]') as HTMLButtonElement).click();
        const P = [Math.round(rect.width * 0.6), Math.round(rect.height * 0.4)];
        const ev = (type: string, x: number, y: number, buttons: number) =>
          cv.dispatchEvent(new PointerEvent(type, {
            clientX: rect.left + x, clientY: rect.top + y, pointerId: 1, pointerType: "mouse",
            isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons }));
        ev("pointerdown", P[0], P[1], 1);
        ev("pointermove", P[0] + 40, P[1] + 30, 1);
        ev("pointerup", P[0] + 40, P[1] + 30, 0);
        const s = s2s.strokes[s2s.strokes.length - 1];
        return { got: s.pts2d[0], want: P, frame: s2s.diag() };
      });
      expect(Math.abs(r.got[0] - r.want[0])).toBeLessThan(1);
      expect(Math.abs(r.got[1] - r.want[1])).toBeLessThan(1);
      // 백버퍼가 새 CSS 상자에 맞춰졌다(늘어난 채로 굳지 않았다)
      expect(r.frame.ink.stretch[0]).toBeCloseTo(dpr, 2);
      expect(r.frame.ink.stretch[1]).toBeCloseTo(dpr, 2);
    });
  });
}
