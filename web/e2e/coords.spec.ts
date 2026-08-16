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
// ⚠⚠ **아래 `[양성 채널]` 팔은 #30이지 #21이 아니다**(리뷰어가 정정했다).
// 캔버스에 직접 칠하는 것은 **앱의 좌표 변환 경로를 지나지 않으므로**, 그 팔이 배제하는 것은
// "탐침이 눈이 멀었다" 하나다. **#21이 요구하는 것(앱 쪽에 dpr 곱을 되살려 이 스펙이 실제로
// 실패하는지)은 아직 안 했다** — `DEFERRED.md`에 적었다.
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { gate } from "../test/gate.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");
/** **원장에 남긴다**(#25) — 이 스펙의 수치가 `progress.md` 산문에만 있었다. */
const led: Record<string, unknown> = {};

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
        // ⚠ **지평선을 빼고 센다**(2026-08-16). 지평선이 이제 **언제나** 화면을 가로지르므로
        // (사람 지시 2) 어느 자리를 찍어도 그 줄에 걸리면 어두운 픽셀이 나온다 —
        // `inkAtScaled`가 55·109로 뜨면서 이 스펙이 **없는 어긋남을 보고**했다.
        // 잉크는 `#111`(R=17)이고 지평선은 `#8e8e8e`(R=142)라 **밝기로 갈린다**.
        // 잉크는 `#111`(17,17,17)이고 배경 층은 전부 그보다 밝거나 **한 채널이 밝다**:
        // 지평선 `#8e8e8e` · 축 색 `#c0392b`(R 192) `#1e8449`(G 132) `#2471a3`(B 163).
        // **세 채널이 다 어두운 것만** 잉크로 센다.
        const INK_MAX = 60;
        const probe = (cssX: number, cssY: number, rad = 4) => {
          const px = Math.round(cssX * sx), py = Math.round(cssY * sy);
          const n = Math.max(1, Math.round(rad * sx));
          const d = ctx.getImageData(Math.max(0, px - n), Math.max(0, py - n), n * 2 + 1, n * 2 + 1).data;
          let dark = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] < INK_MAX && d[i + 1] < INK_MAX && d[i + 2] < INK_MAX && d[i + 3] > 0) dark += 1;
          }
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
      // ⚠ **정확히 0을 요구하지 않는다**(2026-08-16). 화면에 배경 층이 늘면서(지평선·축 색
      // 미리보기) 안티에일리어싱 픽셀이 **한둘** 걸린다 — dpr 3에서 2px가 나왔다.
      // 재려는 것은 "**획 전체**가 ×dpr 자리에 그려졌는가"이므로 **제자리 대비 비율**로 본다.
      // 양성 채널(아래 스펙)은 그 자리를 통째로 칠하므로 이 완화가 그것을 안 무디게 한다(#21).
      if (dpr > 1) expect(r.inkAtScaled).toBeLessThan(Math.max(3, r.inkAtMid * 0.1));

      led[`dpr_${dpr}`] = {
        drawn_vs_want_px: [+(r.drawnA[0] - r.wantA[0]).toFixed(3), +(r.drawnA[1] - r.wantA[1]).toFixed(3)],
        ink_at_mid: r.inkAtMid, ink_at_scaled: r.inkAtScaled,
        stretch: r.frame.ink.stretch, scale: r.frame.ink.scale,
        view_vs_overlay: r.frame.view_vs_overlay, size_heal: r.frame.size_heal,
      };

      // 프레임 자체의 정합성
      expect(r.frame.dpr).toBe(dpr);
      expect(r.frame.ink.scale[0]).toBeCloseTo(dpr, 2);
      expect(r.frame.ink.stretch[0]).toBeCloseTo(dpr, 2);
      expect(r.frame.view_vs_overlay.same).toBe(true);
    });

    /**
     * **[양성 채널]**(#30) — 위 테스트의 `expect(inkAtScaled).toBe(0)`이 **눈이 떠 있는가**.
     *
     * 그 단언은 "×dpr 자리에 잉크가 없다"인데, **탐침이 아무것도 못 보는 상태여도 0이 나온다.**
     * 그래서 ×dpr 자리에 일부러 칠하고 같은 탐침이 **잡는지** 본다.
     *
     * ⚠ **이것은 #21(버그를 되살린다)이 아니다** — 캔버스에 직접 칠하는 것은 **앱의 좌표 변환
     * 경로를 안 지난다.** 배제되는 것은 "탐침 맹점" 하나이고, **"앱이 dpr을 두 번 적용해도
     * 이 스펙이 실패한다"는 미확인이다.** 리뷰어가 정정했고 `DEFERRED.md`에 남겼다.
     */
    test("[양성 채널] ×dpr 자리에 일부러 칠하면 같은 탐침이 잡는다", async ({ page }) => {
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
      expect(r.before).toBe(0);            // 칠하기 전에는 비어 있다
      expect(r.after).toBeGreaterThan(0);  // **탐침이 그것을 잡는다** — 맹점이 아니다
      led[`probe_control_dpr_${dpr}`] = { before: r.before, after: r.after };
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

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "coords.json"), JSON.stringify({
    spec: "D-C3 좌표 규약 — 닿은 자리에 잉크가 나오는가. dpr 1·2·3에서 잠근다(PITFALLS #21).",
    plan: "DECISIONS D-C3 · `src/capture/canvasFrame.ts`가 단일 출처다",
    gate: gate({
      registered: "① 기록된 `pts2d`가 누른 CSS 좌표와 **1px 이내** ② 누른 자리에 **실제로 칠해졌다** "
        + "③ **×dpr 자리에는 아무것도 없다**(dpr > 1) ④ `stretch`가 dpr과 같다 "
        + "⑤ 잉크와 three 렌더러가 같은 상자다. **창 크기를 바꿔도 성립한다**(ResizeObserver 없이).",
      reachability: "**항등이므로 오라클 팔이 없다** — 아래 `reachability_absent` 참조. 넘을 수 있는 것을 굳이 적자면 ③의 양성 채널(`probe_control_*`)이고 그것은 탐침의 눈이지 기준을 넘는 팔이 아니다.",
      reachability_absent: "**오라클 팔이 없고, 있을 자리도 아니다** — 좌표 규약은 정확도가 아니라 "
        + "**항등**이고(닿은 자리 = 그린 자리) 참값이 곧 입력이다. "
        + "⚠⚠ **그래서 ③이 특히 위험하다**: '없다'는 단언은 **탐침이 눈이 멀어도 참**이다. "
        + "`probe_control_*`이 그 양성 채널이고(#30), ×dpr 자리에 일부러 칠하면 탐침이 잡는다. "
        + "⚠ **그러나 그것은 #21이 아니다** — 캔버스에 직접 칠하는 것은 **앱의 변환 경로를 "
        + "안 지난다.** '앱이 dpr을 두 번 적용해도 이 스펙이 실패한다'는 **미확인**이다(DEFERRED).",
      status: "새 UI(`l.html` + `window.S2S`)로 옮긴 뒤에도 dpr 1·2·3에서 통과한다. "
        + "⚠ **`view_vs_overlay`의 뜻이 달라졌다** — 단일 뷰포트라 견주는 것이 "
        + "**잉크 CSS 상자 ↔ three 렌더러 뷰 크기**다(옛 UI는 2D·3D 캔버스 둘이었다).",
    }),
    what_this_does_not_say: [
      "**실기기** — chromium이 `deviceScaleFactor`로 흉내 낸 dpr이다. iPad 사파리가 아니다",
      "**앱 변환 경로의 회귀** — 위 `reachability_absent`의 ⚠ 참조(#21 미이행)",
      "**두 캔버스의 배율 불일치** — 옛 UI가 잡던 그 실패 모드는 **대상이 사라졌다**(캔버스가 하나다). "
        + "지금 `view_vs_overlay`가 잡는 것은 잉크 ↔ 렌더러 상자 불일치다",
    ],
    zero_note: "⚠ `drawn_vs_want_px`가 **정확히 0**이라 selfcheck가 플래그한다 — **원인은 항등이다**: "
      + "앱이 포인터의 CSS 좌표를 **그대로** `pts2d`에 적으므로(변환이 항등이어야 한다는 것이 "
      + "이 규약의 내용이다) 어긋남이 0인 것이 통과다. **측정이 아니라 보장이므로 임계를 안 건다**(#5). "
      + "0이 아니게 되는 순간이 D-C3 위반이고 그때 `expect(<1)`이 잡는다.",
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 2), "utf-8");
});
