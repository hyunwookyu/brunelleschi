// **기본 흐름 종단 시험**(2026-08-17 지시 6) — 사람이 하는 순서 그대로.
//
// 같은 유형의 결함이 반복된 원인은 **검증 대상과 사용 경로가 달랐다**는 것이다:
// 단위 시험이 통과하고 합성 지표가 나오는데 열어서 그리면 안 됐다(5-1은 브라우저를
// 열어봤으면 즉시 나왔다). 그래서 이 스펙은 **실제 포인터로 긋고, 픽셀이 실제로
// 그려졌는지**를 매 단계 확인하며, **콘솔 오류 0을 함께 잠근다**.
//
// 순서(지시문 그대로):
//   ① 빈 화면에서 선을 긋는다 → 화면에 남는가
//   ② 가로선을 긋는다 → 1점이 되는가
//   ③ 깊이선을 긋는다 → 3D가 서는가
//   ④ 결과선으로 바꿔 덧긋는다 → 검정으로 남는가 · 보조선 끝점에 붙는가
//   ⑤ 돌린다 → 형태가 보이는가
//   ⑥ 돌린 뒤 이어 긋는다 → 붙는가
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 잉크 캔버스(2D)의 칠해진 픽셀 수. 알파 > 8인 픽셀을 센다. */
const INK_PX = `(() => {
  const el = document.getElementById("ink");
  const d = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
  return n;
})()`;

test("기본 흐름 — 긋고, 서고, 덧긋고, 돌리고, 이어 긋는다", async ({ page }) => {
  // **콘솔 오류 0을 잠근다**(지시 6 마지막 줄) — pageerror와 console.error 둘 다.
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  // 저장 복원 경쟁을 끊는다(결정론 — `stage.spec`의 shot()과 같은 이유)
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = (await page.locator("#ink").boundingBox())!;
  const X = (fx: number) => box.x + box.width * fx;
  const Y = (fy: number) => box.y + box.height * fy;
  const draw = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(X(x1), Y(y1));
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(X(x1 + (x2 - x1) * i / 8), Y(y1 + (y2 - y1) * i / 8));
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  const led: Record<string, unknown> = {};

  // ---- ①·② 빈 화면에 가로선 → 화면에 남고, 1점이 된다
  await draw(0.30, 0.75, 0.70, 0.75);
  led.s1_horizontal = await page.evaluate((inkExpr) => {
    const S = window.S2S;
    // eslint-disable-next-line no-eval
    const ink = eval(inkExpr) as number;
    return { ink_px: ink, order: S.order(), standing: S.standing(),
             strokes: S.doc().strokes.length };
  }, INK_PX);
  expect((led.s1_horizontal as any).ink_px).toBeGreaterThan(50);   // **획이 화면에 남았다**
  expect((led.s1_horizontal as any).order).toBe(1);                // **가로선 = 1점 확정**(지시 1)
  expect((led.s1_horizontal as any).standing).toBe(false);         // 깊이 소실점 전 — 3D는 아직

  // ---- ③ 깊이선 → 3D가 선다 (P1 임의 f — 지시 1·5-4)
  await draw(0.30, 0.75, 0.45, 0.55);
  led.s3_depth = await page.evaluate(() => {
    const S = window.S2S;
    const vp = S.stage.viewport;
    vp.renderer.render(vp.scene, vp.camera);
    const gl = vp.renderer.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let painted = 0;
    for (let i = 0; i < buf.length; i += 4)
      if (buf[i] < 235 || buf[i + 1] < 235 || buf[i + 2] < 235) painted++;
    return { standing: S.standing(), order: S.order(),
             lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             axes: S.doc().strokes.map((s: any) => s.axis),
             gl_painted_px: painted };
  });
  expect((led.s3_depth as any).standing).toBe(true);
  expect((led.s3_depth as any).lifted).toBe(2);
  // **축 배정**(5-3의 원장 근거, 리뷰어 [6]) — 가로선과 깊이선이 서로 다른 축이다
  expect(new Set((led.s3_depth as any).axes).size).toBe(2);
  expect((led.s3_depth as any).axes.every((a: unknown) => typeof a === "number")).toBe(true);
  expect((led.s3_depth as any).gl_painted_px).toBeGreaterThan(0);  // **3D가 실제로 그려졌다**

  // ---- ④ 결과선으로 덧긋는다 → 검정으로 남고, 보조선 끝점에 붙는다
  //
  // **판정은 차등이다**(리뷰어 [2]가 절대 임계의 결함을 잡았다): 안티에일리어싱과 픽셀 정렬
  // 때문에 결과선(#111)의 최암이 17~60을 오가고, 보조선(#4a4a4a=74)과의 절대 여유가 얇다.
  // 그래서 **같은 자리를 덧긋기 전(보조선만)과 후(결과선 위)로 나눠 재고 어두워진 양**을
  // 판정한다 — 결과선이 안 그려지면(5-1) 변화가 0이라 정확히 실패한다.
  const DARK_AT = `(async (sx, sy) => {
    const S = window.S2S;
    const vp = S.stage.viewport;
    vp.renderer.render(vp.scene, vp.camera);
    const gl = vp.renderer.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const kx = bw / vp.renderer.domElement.clientWidth,
          ky = bh / vp.renderer.domElement.clientHeight;
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let dark = 255;
    const cx = Math.round(sx * kx), cy = Math.round(bh - sy * ky);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = ((cy + dy) * bw + (cx + dx)) * 4;
      if (i < 0 || i >= buf.length) continue;
      dark = Math.min(dark, Math.max(buf[i], buf[i + 1], buf[i + 2]));
    }
    return dark;
  })`;
  const guideMid = await page.evaluate(async (fn) => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const st = S.doc().strokes[0];                       // ①의 가로 보조선
    const ctx = S.cam.ctx();
    const mid = [0, 1, 2].map(k => (st.seg3d[0][k] + st.seg3d[1][k]) / 2);
    const p = g3.project(mid, ctx.principal, ctx.f)!;
    // eslint-disable-next-line no-eval
    const dark = await (eval(fn))(p[0], p[1]);
    return { p, dark };
  }, DARK_AT);
  await page.evaluate(() => window.S2S.setChannel("result"));
  await draw(0.30, 0.75, 0.70, 0.75);
  led.s4_result = await page.evaluate(async (arg) => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    // eslint-disable-next-line no-eval
    const dark = await (eval(arg.fn))(arg.p[0], arg.p[1]);
    return { channel: st.channel, lifted: !!st.seg3d,
             snap_start: st.snapStart ? st.snapStart.kind : null,
             guide_dark_before: arg.before, result_dark_after: dark };
  }, { fn: DARK_AT, p: guideMid.p, before: guideMid.dark });
  expect((led.s4_result as any).channel).toBe("result");
  expect((led.s4_result as any).lifted).toBe(true);                // **결과선이 3D다**(5-1)
  // **검정으로 남는다**(5-7) — 결과선이 같은 자리를 뚜렷이 어둡게 만든다(차등 ≥ 15).
  // 절대 상한(70)은 보조선 단독(74)조차 통과 못 하게 하는 이차 방어다.
  expect((led.s4_result as any).result_dark_after)
    .toBeLessThan((led.s4_result as any).guide_dark_before - 15);
  expect((led.s4_result as any).result_dark_after).toBeLessThan(70);
  // **보조선 끝점에 붙었다** — 같은 자리에서 시작했으므로 끝점/정점 스냅이 잡혀야 한다
  expect(["endpoint", "vertex"]).toContain((led.s4_result as any).snap_start);

  // ---- ⑤ 돌린다 → 형태가 보인다
  await page.click('#bar button[data-act="orbit"]');
  await page.mouse.move(X(0.5), Y(0.5));
  await page.mouse.down();
  await page.mouse.move(X(0.62), Y(0.42), { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  led.s5_orbit = await page.evaluate(() => {
    const S = window.S2S;
    const vp = S.stage.viewport;
    vp.renderer.render(vp.scene, vp.camera);
    const gl = vp.renderer.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let painted = 0;
    for (let i = 0; i < buf.length; i += 4)
      if (buf[i] < 235 || buf[i + 1] < 235 || buf[i + 2] < 235) painted++;
    return { pinned: S.stage.isPinned, gl_painted_px: painted };
  });
  expect((led.s5_orbit as any).pinned).toBe(false);                // 궤도가 실제로 풀렸다
  expect((led.s5_orbit as any).gl_painted_px).toBeGreaterThan(0);  // **형태가 보인다**

  // ---- ⑥ 돌린 뒤 이어 긋는다 → 붙는다
  await page.click('#bar button[data-act="draw"]');
  const target = await page.evaluate(async () => {
    // 돌린 시점에서 3D 끝점 하나의 화면 자리를 계산한다 — 앱과 같은 변환(viewCamera)
    const S = window.S2S;
    const vc = await import("/src/s3d/viewCamera.ts");
    const g3 = await import("/src/s3d/geom3d.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const pose = S.pose();
    const ctx = vc.viewPlaceCtx(pose, S.cam.ctx().vps.map((v: any) =>
      (v ? g3.axisDirection(v, S.cam.ctx().principal, S.cam.ctx().f) : null)), size, 45);
    const st = S.doc().strokes.find((s: any) => s.seg3d)!;
    const p = g3.project(vc.toView(pose, st.seg3d[0]), ctx.principal, ctx.f);
    return p ? { x: p[0] / size[0], y: p[1] / size[1] } : null;
  });
  expect(target).not.toBeNull();
  await draw(target!.x, target!.y, target!.x + 0.12, target!.y - 0.1);
  led.s6_continue = await page.evaluate(() => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    return { snap_start: st.snapStart ? st.snapStart.kind : null, lifted: !!st.seg3d };
  });
  expect((led.s6_continue as any).snap_start).not.toBeNull();      // **붙었다**

  // ---- 콘솔 오류 0 (지시 6 — 함께 잠근다)
  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "basic_flow.json"), JSON.stringify({
    spec: "지시 6 — 기본 흐름 종단(사람 순서 그대로, Playwright 신뢰 이벤트·픽셀·콘솔 오류 0)",
    what_this_does_not_say: [
      "배치 정확도 — 참값 대조가 없다(합성 픽스처도 없다 — 실제 손 순서만 있다)",
      "실획 — Playwright 합성 마우스 경로다(AS-C1 — '실포인터'라 부르지 않는다)",
      "⑥의 lifted 여부는 단언하지 않는다 — 돌린 시점의 배치는 앵커·각도에 따라 2D 대기가 옳을 수 있다(§9.1)",
      "격자 픽셀은 안 잰다 — 격자 기하는 `test/grid.test.ts`의 9.5 잠금이 덮는다",
      "dpr 1 실행이다(#21) — 표시 값(LINE_PX·표식 반지름)은 CSS px라 장치 시각 크기는 같지만, 실기(아이패드) 확인은 K의 문이다",
    ],
    /**
     * 판정 임계 — `test/constants.ts`에 안 넣는 사유: `SHARED_CONSTANTS`가 전역 해시
     * 하나라(DEFERRED "의존 집합별 해시") 키를 더하면 무관한 원장 40여 개가 STALE이 된다.
     * D-L51(GESTURE_TOL)과 같은 결정 — 값은 이 원장이 자기 안에 든다.
     */
    thresholds: { result_darkens_by_min: 15, result_dark_max: 70,
                  ink_px_min: 50, console_errors_max: 0 },
    gate: {
      registered: "④ 결과선이 보조선 자리를 15 이상 어둡게 하고 절대 70 미만(5-1 소실·5-7 검정의 회귀) · "
        + "①~⑥ 각 단계의 픽셀·차수·스냅 단언 · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 = 현행 구현의 실측(#35 — 상한이라 부르지 않는다). "
        + "회귀 팔 둘을 수동으로 돌렸다(2026-08-17): ① 결과선 색을 #c0392b로 되살리면 절대 상한에서 실패 "
        + "② 결과선 층을 제거하면(5-1 재현) 차등 판정이 실패(guide_dark − result_dark = 0). "
        + "⚠ 두 팔의 실측값은 원장 밖이다(#25 — 임시 패치 실행이라 재현 스크립트가 없다)",
      reachability_value: (led.s4_result as any).result_dark_after,
      reachability_source: "s4_result/result_dark_after",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
