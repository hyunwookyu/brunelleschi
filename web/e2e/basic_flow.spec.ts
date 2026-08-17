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

  // ---- ③ 깊이선 **둘**(같은 소실점을 향한 짝) → 3D가 선다 (P1 임의 f — 지시 1·5-4)
  //
  // ⚠ **4차 지시 3**: 첫 소실점은 그린 두 선의 실제 교점이다 — 한 선으로는 대기한다.
  // 두 선 다 (0.62, 0.42)를 지나므로 교점 = 그 점이고, 지평선이 그 y로 맞춰진다.
  await draw(0.30, 0.72, 0.476, 0.555);
  await draw(0.38, 0.75, 0.50, 0.585);
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
  expect((led.s3_depth as any).lifted).toBe(3);          // 가로선 + 깊이선 짝(4차 지시 3)
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

// ---------------------------------------------------------------- 4차 지시 2 — 소실점 방향 스냅
//
// "소실점 하나만 있을 때 그 방향으로 스냅되는가"(지시 검증 절). 카메라가 안 섰어도(NONE)
// 소실점이 있으면 그 방향으로 끌린다 — 붙은 선의 부적합도(vpMisfit)가 0이 되는 것을
// 확인하고, 회귀 팔은 **소실점을 안 향하는 선**이 안 끌리는 것을 확인한다(#30 양성 채널).
test("소실점 하나(카메라 전) — 그 방향으로 스냅된다 (4차 지시 2)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = (await page.locator("#ink").boundingBox())!;
  const W = box.width, H = box.height;
  const drawPx = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + x1 + (x2 - x1) * i / 8, box.y + y1 + (y2 - y1) * i / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  const led: Record<string, unknown> = {};

  // ---- ① 깊이선 **둘**(같은 소실점을 향한 짝, 4차 지시 3) → 소실점 하나.
  //      카메라는 안 선다(NONE — 가로선 없는 소실점 하나). 두 선 다 (0.60W, 0.40H)를 지난다.
  //      ⚠ 소실점 y(0.40H)가 기본 지평선(0.5H)과 **다르다** — 리뷰어 [B-5]의 교락(소실점이
  //      지평선 위면 a→V 방향이 화면 수평과 겹칠 수 있다)을 픽스처가 배제한다
  await drawPx(0.30 * W, 0.70 * H, 0.465 * W, 0.535 * H);
  await drawPx(0.25 * W, 0.55 * H, 0.4425 * W, 0.4675 * H);
  const st1 = await page.evaluate(() => {
    const S = window.S2S;
    return { vps: S.camSnapshot().vps, standing: S.standing(), order: S.order(),
             horizon_y: S.horizon().y, default_horizon_y: null as number | null };
  });
  const vp = (st1.vps as ([number, number] | null)[]).find(v => v) as [number, number];
  expect(vp).toBeTruthy();
  expect(st1.standing).toBe(false);
  // 소실점이 기본 지평선(화면 중앙) 밖에 섰다 — [B-5]의 직교 스냅 교락이 없다
  expect(Math.abs(vp[1] - 0.5 * H)).toBeGreaterThan(0.05 * H);
  led.s1 = st1;

  // ---- ② 소실점을 향해(작은 겨냥 오차) 긋는다 → 그 방향으로 정확히 끌린다
  const a: [number, number] = [0.35 * W, 0.75 * H];
  const bTrue: [number, number] = [(a[0] + vp[0]) / 2, (a[1] + vp[1]) / 2];
  // **스냅 직전의 겨냥을 원장에 남긴다**(리뷰어 [B-5] — 주체 판정의 재료): 화면 수평과의
  // 각이 직교 스냅 임계(4°)를 뚜렷이 넘으므로 이 끌림은 vp_dir만이 만들 수 있다
  led.aim = {
    a, b_aim: [bTrue[0], bTrue[1] + 4], offset_px: 4,
    angle_to_screen_h_deg: Math.abs(Math.atan2(bTrue[1] + 4 - a[1], bTrue[0] - a[0]) * 180 / Math.PI),
    vp,
  };
  expect((led.aim as any).angle_to_screen_h_deg).toBeGreaterThan(8);
  // **2D 오스냅 교락도 가른다**(항목 3 리뷰어 [9] — 항목 1의 "스냅 주체를 원장이 가른다" 규약):
  // 겨냥점 조리개 안에 2D 후보가 없다 — 이 끌림은 2D 오스냅으로도 안 나온다
  led.aim_confound = await page.evaluate((bAim) => ({
    snap2d_at_aim: window.S2S.snap2d(bAim), pending_2d: window.S2S.pending2Targets(),
    snap_targets_3d: window.S2S.snapTargets(),
  }), [bTrue[0], bTrue[1] + 4]);
  expect((led.aim_confound as any).snap2d_at_aim).toBeNull();
  expect((led.aim_confound as any).snap_targets_3d).toBe(0);
  await drawPx(a[0], a[1], bTrue[0], bTrue[1] + 4);       // 4px 겨냥 오차
  led.snap = await page.evaluate((vpIn) => {
    const S = window.S2S;
    const sts = S.doc().strokes;
    const st = sts[sts.length - 1];
    const p = st.pts2d[0], q = st.pts2d[st.pts2d.length - 1];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    // vpMisfit과 같은 식(수직거리 ÷ 길이) — 먼 끝점 기준
    const far = Math.hypot(vpIn[0] - p[0], vpIn[1] - p[1]) >= Math.hypot(vpIn[0] - q[0], vpIn[1] - q[1]) ? p : q;
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const dx = vpIn[0] - far[0], dy = vpIn[1] - far[1];
    const D = Math.hypot(dx, dy);
    const misfit = Math.abs((m[0] - far[0]) * dy - (m[1] - far[1]) * dx) / D / len;
    return { misfit, n_pts: st.pts2d.length, order: S.order(), standing: S.standing() };
  }, vp);
  // **그 소실점 방향으로 정확히 끌렸다** — 스냅 후 부적합도 0은 보장 확인이다(#5)
  expect((led.snap as any).misfit).toBeLessThan(1e-9);
  expect((led.snap as any).order).toBe(0);                 // 지지선일 뿐 — 여전히 NONE(하나뿐)

  // ---- ③ 양성 채널 — 소실점을 안 향하는 선은 안 끌린다(#30). 겨냥이 그대로 남는다
  //      (그 값은 픽스처 각도의 항등이라 도달 가능성이 아니다 — [B-3])
  await drawPx(0.70 * W, 0.75 * H, 0.55 * W, 0.85 * H);
  led.positive_away = await page.evaluate((vpIn) => {
    const S = window.S2S;
    const sts = S.doc().strokes;
    const st = sts[sts.length - 1];
    const p = st.pts2d[0], q = st.pts2d[st.pts2d.length - 1];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const far = Math.hypot(vpIn[0] - p[0], vpIn[1] - p[1]) >= Math.hypot(vpIn[0] - q[0], vpIn[1] - q[1]) ? p : q;
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const dx = vpIn[0] - far[0], dy = vpIn[1] - far[1];
    const D = Math.hypot(dx, dy);
    return { misfit: Math.abs((m[0] - far[0]) * dy - (m[1] - far[1]) * dx) / D / len };
  }, vp);
  expect((led.positive_away as any).misfit).toBeGreaterThan(0.06);   // AXIS_TOL.vp_dist_ratio 밖

  // ---- 픽셀 확인 + 콘솔 오류 0
  led.ink_px = await page.evaluate((inkExpr) => {
    // eslint-disable-next-line no-eval
    return eval(inkExpr) as number;
  }, INK_PX);
  expect(led.ink_px as number).toBeGreaterThan(50);
  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "vp_dir_flow.json"), JSON.stringify({
    spec: "4차 지시 2 — 카메라 확정 전 소실점 방향 스냅 종단. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "misfit 0은 측정이 아니라 **보장 확인**이다(#5) — 스냅이 끝점을 a→V 직선 위로 옮긴다. 1e-9는 그 배선의 판정 임계이고 아래 thresholds에 있다([B-4])",
      "겨냥 오차 4px 한 점의 확인이다(#12) — 임계 경계의 거동은 test/vp_dir.test.ts의 반례가 덮는다",
      "실획이 아니다(AS-C1) — Playwright 합성 마우스다",
      "dpr 1 실행이다(#21) — 좌표 규약은 e2e/coords.spec.ts가 dpr 1·2·3에서 잠근다",
      "스냅 주체의 판정 재료는 aim 블록이다([B-5]) — 겨냥 각이 직교 임계(4°) 밖이고 소실점이 기본 지평선 밖이라, 이 끌림은 vp_dir 외의 경로로는 안 나온다",
    ],
    thresholds: { snap_misfit_max: 1e-9, aim_offset_px: 4, vp_dist_ratio_frame: 0.06,
                  away_misfit_min: 0.06, ink_px_min: 50, console_errors_max: 0 },
    gate: {
      registered: "소실점 하나(NONE·짝 교점으로 확정)에서 그 방향을 겨냥한 선의 스냅 후 부적합도 < 1e-9 · 양성 채널(안 향하는 선)은 임계(0.06) 밖 그대로 · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다.** 양성 채널의 misfit는 스냅이 안 발동한 픽스처 각도의 항등이라 도달 가능성으로 적지 않는다(#40 ⚠⚠ — 항목 1 [7]과 같은 자리의 정정. 리뷰어 [B-3])",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 4차 지시 3 — 소실점 = 그린 선의 교점
//
// "대각선 두 개로 소실점을 잡은 뒤 그 선들이 소실점을 정확히 향하는가"(지시 검증 절).
// 옛 규칙은 소실점을 (선 ∩ 미리 깔린 지평선)에 뒀다 — 손으로 겨냥한 교점이 의도한 자리를
// 벗어나고 격자가 그 벗어난 소실점 기준으로 생겨, 그린 대각선이 격자와 어긋난 채 남았다.
// 새 규칙: 소실점 = 그린 두 선의 실제 교점. 그린 선은 안 움직인다. 격자가 그 선을 따른다.
test("대각선 두 개 → 소실점 — 그 선들이 소실점을 정확히 향한다 (4차 지시 3)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = (await page.locator("#ink").boundingBox())!;
  const W = box.width, H = box.height;
  const drawPx = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + x1 + (x2 - x1) * i / 8, box.y + y1 + (y2 - y1) * i / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  const led: Record<string, unknown> = {};

  // ---- 대각선 두 개 — 둘 다 (0.60W, 0.40H)를 지난다(기본 지평선 0.5H **밖** — 회귀 판별의 재료)
  await drawPx(0.30 * W, 0.70 * H, 0.465 * W, 0.535 * H);
  await drawPx(0.25 * W, 0.55 * H, 0.4425 * W, 0.4675 * H);
  led.fix = await page.evaluate(async () => {
    const S = window.S2S;
    const ax = await import("/src/s3d/axis.ts");
    const vps = S.camSnapshot().vps as ([number, number] | null)[];
    const vp = vps.find(v => v);
    if (!vp) return { vp: null };
    // **그 소실점을 만든 두 선**(규칙이 받은 대표 직선)이 정확히 그 점을 향하는가(지시 3-b·d)
    const misfits = S.doc().strokes.map((st: any) => {
      const rep = ax.representative(st.pts2d);
      return rep ? ax.vpMisfit(rep, vp) : null;
    });
    return { vp, misfits, horizon_y: S.horizon().y, order: S.order(), standing: S.standing() };
  });
  const fix = led.fix as any;
  expect(fix.vp).toBeTruthy();
  // **회귀 판별값을 원장에 남긴다**(항목 3 리뷰어 [8], #40 ③) — 등록 조항의 측정값이 원장에 있어야 한다
  led.fix_regression = { canvas_h: H, default_horizon_y: 0.5 * H,
                         vp_off_px: Math.abs(fix.vp[1] - 0.5 * H),
                         vp_off_ratio: Math.abs(fix.vp[1] - 0.5 * H) / H };
  // **오차 0**(지시 3-d) — 교점의 정의다(보장 확인, #5). 판별력은 아래 회귀 판별이 든다
  for (const m of fix.misfits) expect(m).toBeLessThan(1e-9);
  // **회귀 판별** — 옛 규칙이면 소실점이 기본 지평선(0.5H) 위에 놓인다. 지금은 교점의 y다
  expect(Math.abs(fix.vp[1] - 0.5 * H)).toBeGreaterThan(0.05 * H);
  // **소실점이 지평선을 정한다**(지시 4-c의 앞당김 — 롤 0 유지)
  expect(fix.horizon_y).toBeCloseTo(fix.vp[1], 6);

  // ---- 격자가 그 소실점에서 나온다(지시 3-c) — 화면에 격자를 만들려면 카메라가 서야 하므로
  //      가로선으로 P1을 세운다(그리드·정합의 세부는 test/grid.test.ts가 2점에서 잠근다)
  await drawPx(0.30 * W, 0.85 * H, 0.70 * W, 0.85 * H);
  // **소실점이 있으면 가로선은 묻는다**(D-L48 — 조용한 P1 가둠 방지) — 사람 대신 답한다
  led.asked = await page.evaluate(() => {
    const S = window.S2S;
    const a = S.ask();
    if (a) S.answerAsk("screen");
    return a ? a.question : null;
  });
  led.grid = await page.evaluate(async () => {
    const S = window.S2S;
    const gr = await import("/src/s3d/grid.ts");
    const r = S.cam.acc.solve();
    const vps = S.cam.vps() as ([number, number] | null)[];
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const g = gr.groundGrid(r.camera, vps, size, undefined, undefined, S.cam.ctx()?.axisDirs ?? null);
    let checked = 0, maxSin = 0;
    for (const seg of g) {
      if (seg.axis == null || seg.kind !== "ground") continue;
      const vp = vps[seg.axis];
      if (!vp) continue;                          // 무한원 축(화면 가로)은 방향 자체가 정확하다
      const dx = seg.b[0] - seg.a[0], dy = seg.b[1] - seg.a[1];
      const L = Math.hypot(dx, dy);
      if (L < 5) continue;
      const vx = vp[0] - seg.a[0], vy = vp[1] - seg.a[1];
      const D = Math.hypot(vx, vy);
      if (D < 1e-6) continue;
      const sin = Math.abs(dx * vy - dy * vx) / (L * D);
      maxSin = Math.max(maxSin, sin);
      checked += 1;
    }
    return { standing: S.standing(), checked, maxSin };
  });
  expect((led.grid as any).standing).toBe(true);
  expect((led.grid as any).checked).toBeGreaterThan(10);   // **덮는 대상 수**(#38)
  expect((led.grid as any).maxSin).toBeLessThan(1e-6);     // **격자가 그 소실점으로 모인다**

  // ---- 픽셀 확인 + 콘솔 오류 0
  led.ink_px = await page.evaluate((inkExpr) => {
    // eslint-disable-next-line no-eval
    return eval(inkExpr) as number;
  }, INK_PX);
  expect(led.ink_px as number).toBeGreaterThan(50);
  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "vp_two_lines.json"), JSON.stringify({
    spec: "4차 지시 3 — 소실점 = 그린 두 대각선의 실제 교점. 그 선·격자가 그 점을 정확히 향한다. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "misfit·maxSin의 0은 측정이 아니라 **보장 확인**이다(#5) — 교점·투영의 정의다. 1e-9·1e-6은 배선 판정 임계이고 아래 thresholds에 있다",
      "손 오차의 크기·나란한 짝의 조건수는 여기서 안 잰다 — 반례는 test/vp_rules.test.ts(대기·이음 제외·회귀 팔)가 덮는다",
      "실획이 아니다(AS-C1) — Playwright 합성 마우스다",
      "dpr 1 실행이다(#21) — 좌표 규약은 e2e/coords.spec.ts가 dpr 1·2·3에서 잠근다",
    ],
    thresholds: { line_misfit_max: 1e-9, grid_sin_max: 1e-6, vp_off_default_horizon_min_ratio: 0.05,
                  ink_px_min: 50, console_errors_max: 0 },
    gate: {
      registered: "소실점 = 그린 두 선의 교점(각 선의 부적합도 < 1e-9) · 소실점 y ≠ 기본 지평선(옛 규칙 판별) · 지평선 = 소실점 y · 격자 조각 전부가 소실점으로 모인다(sin < 1e-6, 덮는 수 > 10) · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선·보장 확인이라 도달 가능성 오라클이 성립하지 않는다.** 회귀 판별값(|vp.y − 0.5H|)은 픽스처가 고른 소실점 높이의 항등이라 도달 가능성으로 적지 않는다(#40 ⚠⚠ — 항목 1 [7]·2 [B-3]과 같은 자리)",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 4차 지시 4 — 지평선은 결과다
//
// "지평선이 소실점 확정 전에는 없고 확정 후 그 높이에 생기는가"(지시 검증 절).
// 옛 판은 지평선이 처음부터 화면에 있었고 그것이 첫 제약이었다 — 이제 결과다(D-L60).
// 두 경로를 다 확인한다: ① 대각선 두 개의 교점(D-L59) ② 대각선 하나 + 점 찍기(pickVp).
test("지평선 — 확정 전에는 없고, 확정 후 그 높이에 생긴다 (4차 지시 4)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = (await page.locator("#ink").boundingBox())!;
  const W = box.width, H = box.height;
  const drawPx = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + x1 + (x2 - x1) * i / 8, box.y + y1 + (y2 - y1) * i / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  /** 화면 가로줄 y±3px 대역의 칠해진 픽셀 수 — 지평선 파선이 실제로 그려졌는가의 픽셀 확인. */
  const ROW_INK = `((yCss) => {
    const el = document.getElementById("ink");
    const ctx = el.getContext("2d");
    const k = el.width / el.clientWidth;
    const y0 = Math.max(0, Math.round(yCss * k) - 3);
    const d = ctx.getImageData(0, y0, el.width, 7).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  })`;
  const led: Record<string, unknown> = {};

  // ---- ① 확정 전 — 지평선이 없다. 대역 둘을 잰다(리뷰어 [3·1]):
  //      ⓐ 확정될 소실점 높이(0.40H) — 확정 후와의 대조 ⓑ **옛 기본 지평선 자리(0.5H)** —
  //      옛 동작(처음부터 깔림)을 되살리면 빈 화면에서도 여기 파선이 생긴다. 이것이 회귀 판별이다
  // 대역 기록([A-1] 정정): before는 겨냥 높이(0.40H)와 옛 자리(0.5H), after는 **확정된 vp의
  // 실측 y**(after.y — 마우스 반올림으로 겨냥과 수 px 어긋난다)를 중심으로 잰다
  led.bands = { before_expected_vp_y: 0.40 * H, before_default_y: 0.5 * H, half_px: 3,
                after_band_center: "after.y(확정된 지평선 y — 실측)와 같다" };
  led.before = await page.evaluate((arg) => {
    const S = window.S2S;
    // eslint-disable-next-line no-eval
    return { visible: S.horizon().visible, row_ink: (eval(arg.fn))(arg.y),
             // eslint-disable-next-line no-eval
             row_ink_default_horizon: (eval(arg.fn))(arg.yd) };
  }, { fn: ROW_INK, y: 0.40 * H, yd: 0.5 * H });
  expect((led.before as any).visible).toBe(false);
  expect((led.before as any).row_ink).toBe(0);
  expect((led.before as any).row_ink_default_horizon).toBe(0);   // **옛 동작의 자리가 비어 있다**

  // ---- ② 대각선 두 개의 교점(0.60W, 0.40H)으로 소실점 → 그 높이에 지평선이 생긴다
  await drawPx(0.30 * W, 0.70 * H, 0.465 * W, 0.535 * H);
  led.mid = await page.evaluate(() => ({ visible: window.S2S.horizon().visible }));
  expect((led.mid as any).visible).toBe(false);            // 한 선(대기)로는 아직 없다
  await drawPx(0.25 * W, 0.55 * H, 0.4425 * W, 0.4675 * H);
  led.after = await page.evaluate((arg) => {
    const S = window.S2S;
    const vp = (S.camSnapshot().vps as ([number, number] | null)[]).find((v: any) => v)!;
    // eslint-disable-next-line no-eval
    return { visible: S.horizon().visible, y: S.horizon().y, vp, row_ink: (eval(arg.fn))(vp[1]) };
  }, { fn: ROW_INK, y: 0 });
  expect((led.after as any).visible).toBe(true);
  expect((led.after as any).y).toBeCloseTo((led.after as any).vp[1], 6);   // **그 높이다**(롤 0)
  expect((led.after as any).row_ink).toBeGreaterThan(20);  // **파선이 실제로 그려졌다**

  // ---- ③ 둘째 경로 — 대각선 하나 + 점 찍기(4-b). 새 문서에서 다시
  await page.evaluate(() => window.S2S.doc().strokes.splice(0));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  await drawPx(0.30 * W, 0.70 * H, 0.55 * W, 0.50 * H);    // 대각선 하나 — 대기
  // 그 선 위(t=0.7 근처, 3px 어긋난 겨냥)를 **톡 찍는다** — 실제 포인터 탭
  const tap: [number, number] = [box.x + 0.475 * W, box.y + 0.56 * H - 3];
  await page.mouse.move(tap[0], tap[1]);
  await page.mouse.down();
  await page.mouse.move(tap[0] + 1, tap[1] + 1);
  await page.mouse.up();
  await page.waitForTimeout(60);
  // **찍기의 겨냥을 원장에 남긴다**(리뷰어 [B-5 재발] — 주체 판정의 재료)
  led.pick_aim = { tap: [0.475 * W, 0.56 * H - 3], host_a: [0.30 * W, 0.70 * H],
                   host_b: [0.55 * W, 0.50 * H] };
  led.pick = await page.evaluate(async () => {
    const S = window.S2S;
    const ax = await import("/src/s3d/axis.ts");
    const vps = S.camSnapshot().vps as ([number, number] | null)[];
    const vp = vps.find(v => v) ?? null;
    if (!vp) return { vp: null };
    const st = S.doc().strokes[0];
    const rep = ax.representative(st.pts2d);
    return { vp, visible: S.horizon().visible, y: S.horizon().y,
             host_misfit: rep ? ax.vpMisfit(rep, vp) : null,
             strokes: S.doc().strokes.length };
  });
  expect((led.pick as any).vp).toBeTruthy();               // **찍은 자리에 소실점이 섰다**
  expect((led.pick as any).visible).toBe(true);
  expect((led.pick as any).y).toBeCloseTo((led.pick as any).vp[1], 6);
  // **호스트 대각선이 그 소실점을 정확히 향한다**(투영의 정의 — 보장 확인, #5)
  expect((led.pick as any).host_misfit).toBeLessThan(1e-6);
  expect((led.pick as any).strokes).toBe(1);               // 찍기는 획을 안 만든다

  // ---- 픽셀 확인 + 콘솔 오류 0
  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "horizon_flow.json"), JSON.stringify({
    spec: "4차 지시 4 — 지평선은 결과다(확정 전 없음 · 확정 후 소실점 y). 두 경로(교점·점 찍기). Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "horizon.y = vp.y·host_misfit 0은 **보장 확인**이다(#5) — D-L59 ②·투영의 정의다. 임계는 배선 판정용이고 아래 thresholds에 있다",
      "지시 4-e(확정 후 지평선 끌기 = 피치)는 **미구현**이다(D-L60 — 전부 다시 풀기가 필요해 DEFERRED)",
      "**찍기 경로의 소실점은 선 방향 위치를 그린 획이 구속하지 않는다**(리뷰어 [4·2]) — 근처점 투영은 자유도 하나를 사용자의 점이 정한다. 교점 경로(두 선이 두 자유도를 정함)와 정보량이 다르다 — D-L60에 기록",
      "픽스처 하나·찍기 위치 하나·dpr 1의 확인이다(#12·#21 — 리뷰어 [4·5])",
      "**옛 동작(초기 지평선)을 되살린 실행은 없다**([A-2]) — '0.5H 대역이 옛 동작에서 >0'은 옛 코드의 표시 조건(무조건 그림)에서 오는 추론이고 재현 실행으로 확인하지 않았다(#25 — 그 팔의 값은 원장 밖이다)",
      "실획이 아니다(AS-C1)",
    ],
    thresholds: { row_ink_before_max: 0, row_ink_default_horizon_before_max: 0,
                  row_ink_after_min: 20, band_half_px: 3, horizon_eq_vp_y_digits: 6,
                  host_misfit_max: 1e-6, console_errors_max: 0 },
    gate: {
      registered: "확정 전 visible=false·예상 높이(0.40H)와 **옛 기본 지평선 자리(0.5H)** 두 대역 픽셀 0(후자가 옛 동작의 회귀 판별이다 — 리뷰어 [3·1]) · 교점 확정 후 visible=true·y=vp.y·파선 픽셀>20 · 점 찍기 경로도 같은 귀결 + 호스트 부적합도<1e-6 · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선·보장 확인이라 도달 가능성 오라클이 성립하지 않는다** — 판별력은 확정 전/후의 대조(visible·row_ink 0 → >20)가 들고, 그 값들은 표시 조건의 귀결이라 도달 가능성으로 적지 않는다(#40 ⚠⚠)",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 4차 지시 5 — 관계 스냅
//
// 사각형 도구가 없으므로 선 네 개로 사각형을 만든다 — 두 번째 선의 끝을 첫 선의 끝과
// **같은 높이**에 맞추는 것이 이 스냅의 사용 사례다(지시 5 원문). 오스냅이 이긴다(5-d) —
// 여기서는 오스냅 조리개 밖(25px)의 정렬만 일어나는 자리를 재고, 토글 끔 팔이 판별력을 든다.
test("관계 스냅 — 둘째 선의 끝이 첫 선의 끝과 같은 높이에 맞는다 (4차 지시 5)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = (await page.locator("#ink").boundingBox())!;
  const W = box.width, H = box.height;
  const drawPx = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + x1 + (x2 - x1) * i / 8, box.y + y1 + (y2 - y1) * i / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  const led: Record<string, unknown> = {};

  // ---- ① 첫 선 — 화면 가로(직교 스냅으로 y가 정확히 시작 높이가 된다)
  await drawPx(0.30 * W, 0.60 * H, 0.50 * W, 0.601 * H);
  const y1 = await page.evaluate(() => window.S2S.doc().strokes[0].pts2d[0][1] as number);
  // ---- ② 둘째 선 — 세로로 내려 긋되 끝을 첫 선 높이에서 6px 못 미치게 겨냥한다.
  //      시작 x(0.32W)는 첫 선 끝점들과 25px 이상 떨어져 **오스냅이 안 걸리는** 자리다(5-d 확인)
  await drawPx(0.32 * W, 0.45 * H, 0.322 * W, y1 - 6);
  led.aligned = await page.evaluate(() => {
    const S = window.S2S;
    const sts = S.doc().strokes;
    const st = sts[sts.length - 1];
    const e = st.pts2d[st.pts2d.length - 1];
    return { end: e, y1: sts[0].pts2d[0][1], snap_start: !!st.snapStart, standing: S.standing() };
  });
  // **같은 높이에 정확히 맞았다** — 좌표 일치는 스냅의 보장(#5)이고 판별력은 ③이 든다
  expect(Math.abs((led.aligned as any).end[1] - (led.aligned as any).y1)).toBeLessThan(1e-9);
  expect((led.aligned as any).standing).toBe(false);       // 2D 단계다 — 이 스냅의 자리(5-a)

  // ---- ③ 토글 끔 팔 — 같은 겨냥이 안 맞는다(겨냥 오차 6px이 그대로 남는다)
  await page.evaluate(() => window.S2S.setRelSnap(false));
  await drawPx(0.60 * W, 0.45 * H, 0.602 * W, y1 - 6);
  led.toggled_off = await page.evaluate(() => {
    const S = window.S2S;
    const sts = S.doc().strokes;
    const st = sts[sts.length - 1];
    return { end_y: st.pts2d[st.pts2d.length - 1][1], y1: sts[0].pts2d[0][1] };
  });
  expect(Math.abs((led.toggled_off as any).end_y - (led.toggled_off as any).y1)).toBeGreaterThan(2);
  await page.evaluate(() => window.S2S.setRelSnap(true));

  // ---- ④ 우선순위 팔([B-2]) — 오스냅 후보(끝점)와 정렬 후보가 **동시에 조리개 안**이면
  //      오스냅이 이긴다(5-d): 끝점 8px 옆을 겨냥하면 y 정렬이 아니라 **그 점 자체**에 붙는다
  const endB = await page.evaluate(() => {
    const st = window.S2S.doc().strokes[0];
    return st.pts2d[st.pts2d.length - 1] as [number, number];
  });
  await drawPx(0.45 * W, 0.30 * H, endB[0] + 6, endB[1] - 5);
  led.priority = await page.evaluate(() => {
    const sts = window.S2S.doc().strokes;
    const st = sts[sts.length - 1];
    const e = st.pts2d[st.pts2d.length - 1];
    const b = sts[0].pts2d[sts[0].pts2d.length - 1];
    return { end: e, target: b, gap_px: Math.hypot(e[0] - b[0], e[1] - b[1]) };
  });
  expect((led.priority as any).gap_px).toBeLessThan(0.5);   // **점에 붙었다** — 좌표 정렬이 아니다

  // ---- ⑤ 가이드 표시 팔([B-3], 지시 5-c) — 끌던 중(뗴기 전) 마젠타 가이드 픽셀이 실제로 있다
  await page.mouse.move(box.x + 0.32 * W, box.y + 0.35 * H);
  await page.mouse.down();
  await page.mouse.move(box.x + 0.322 * W, box.y + y1 - 6, { steps: 6 });
  led.guide_px = await page.evaluate(() => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const d = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      // 마젠타 가이드(#c0409a ≈ 192,64,154)의 채널 서명 — 다른 그리기 색과 안 겹친다
      if (d[i + 3] > 8 && d[i] > 140 && d[i] < 230 && d[i + 1] < 120 && d[i + 2] > 100) n++;
    }
    return n;
  });
  await page.mouse.up();
  await page.waitForTimeout(50);
  expect(led.guide_px as number).toBeGreaterThan(5);        // **가이드가 실제로 그려졌다**(5-c)

  // ---- 픽셀 확인 + 콘솔 오류 0
  led.ink_px = await page.evaluate((inkExpr) => {
    // eslint-disable-next-line no-eval
    return eval(inkExpr) as number;
  }, INK_PX);
  expect(led.ink_px as number).toBeGreaterThan(50);
  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "rel_snap_flow.json"), JSON.stringify({
    spec: "4차 지시 5 — 관계 스냅(정렬 가이드) 종단: 둘째 선의 끝이 첫 선의 높이에 맞는다. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "정렬 후 좌표 일치(<1e-9)는 **보장 확인**이다(#5) — 스냅이 좌표를 그 값으로 놓는다. 판별력은 토글 끔 팔이 든다",
      "겨냥 오차 6px 한 점의 확인이다(#12) — 허용치 경계·근원 선택은 test/snap2d.test.ts의 alignAxes 반례가 덮는다",
      "오스냅과의 우선순위는 ②에서는 25px 간격으로 회피했고 **④가 겹치는 자리를 직접 잰다**([B-2] — 끝점 6·5px 겨냥에서 정렬이 아니라 점에 붙는다)",
      "**정렬로 옮겨진 끝점은 규칙(stepRule)의 입력이 된다**([B-1] — D-L58 ③과 같은 원리): 확정 전 전용 배선은 곧 카메라가 정해지는 구간 전체다. 15px 정렬이 300px 획에서 최대 ≈2.9° 방향을 바꾸고 그 선의 교점이 불가역인 첫 소실점이다 — D-L61에 기록",
      "실획이 아니다(AS-C1) · dpr 1 실행이다(#21)",
    ],
    thresholds: { aligned_gap_px_max: 1e-9, aim_offset_px: 6, toggle_off_gap_px_min: 2,
                  priority_gap_px_max: 0.5, guide_px_min: 5,
                  align_tol_px: 15, ink_px_min: 50, console_errors_max: 0 },
    gate: {
      registered: "정렬 켬: 둘째 선 끝 y = 첫 선 y(오스냅 조리개 밖 자리) · 정렬 끔: 겨냥 오차 6px 그대로(>2px) · 겹치는 자리(끝점 √61≈7.81px 겨냥 — snap2d_flow와 같은 표기)는 오스냅이 이긴다(gap<0.5px, 5-d) · 끌던 중 마젠타 가이드 픽셀>5(5-c) · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 끔 팔의 잔차는 픽스처 겨냥 오차(6px)의 항등이라 도달 가능성으로 적지 않는다(#40 ⚠⚠)",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 4차 지시 7 — 회전 중심
//
// 궤도가 **그려진 오브젝트(3D 경계 상자)의 중심**으로 돈다. 옛 판은 끝점 평균(무게중심)이라
// 짧은 선이 몰린 쪽으로 끌렸다 — 회귀 판별은 "target = bbox 중심 ≠ 끝점 평균"의 대조다.
test("회전 중심 — 3D 경계 상자의 중심으로 돈다 (4차 지시 7)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = (await page.locator("#ink").boundingBox())!;
  const W = box.width, H = box.height;
  const drawPx = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + x1 + (x2 - x1) * i / 8, box.y + y1 + (y2 - y1) * i / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  const led: Record<string, unknown> = {};

  // 카메라를 세운다(가로선 + 깊이 짝 — 항목 3의 계약) 그리고 **짧은 선을 한쪽에 몰아** 그린다
  //  — 그래야 평균과 상자 중심이 뚜렷이 갈린다(판별력)
  await drawPx(0.30 * W, 0.75 * H, 0.70 * W, 0.75 * H);
  await drawPx(0.30 * W, 0.72 * H, 0.476 * W, 0.555 * H);
  await drawPx(0.38 * W, 0.75 * H, 0.50 * W, 0.585 * H);
  await drawPx(0.30 * W, 0.70 * H, 0.34 * W, 0.70 * H);
  await drawPx(0.30 * W, 0.68 * H, 0.34 * W, 0.68 * H);
  led.standing = await page.evaluate(() => window.S2S.standing());
  expect(led.standing).toBe(true);

  // 궤도를 돌린다 — 그 순간의 target이 회전 중심이다
  await page.click('#bar button[data-act="orbit"]');
  await page.mouse.move(box.x + 0.5 * W, box.y + 0.5 * H);
  await page.mouse.down();
  await page.mouse.move(box.x + 0.58 * W, box.y + 0.44 * H, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  led.center = await page.evaluate(() => {
    const S = window.S2S;
    const segs = S.doc().strokes.filter((s: any) => s.seg3d);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let mx = 0, my = 0, mz = 0, n = 0;
    for (const s of segs) for (const p of [s.seg3d[0], s.seg3d[1]]) {
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      mx += p[0]; my += p[1]; mz += p[2]; n += 1;
    }
    const bbox = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const mean = [mx / n, my / n, mz / n];
    // camPose().target은 three 규약(y·z 반전) — 우리 규약으로 되돌린다(stage.unpin의 규약 그대로)
    const t = S.camPose().target;
    const target = [t[0], -t[1], -t[2]];
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    return { n_lifted: segs.length, bbox, mean, target,
             target_to_bbox: d(target, bbox), target_to_mean: d(target, mean),
             bbox_vs_mean: d(bbox, mean) };
  });
  const c = led.center as any;
  expect(c.n_lifted).toBeGreaterThanOrEqual(4);
  expect(c.bbox_vs_mean).toBeGreaterThan(0.05);            // **판별력** — 두 중심이 실제로 다르다
  expect(c.target_to_bbox).toBeLessThan(1e-6);             // **상자 중심으로 돈다**(7-a)
  expect(c.target_to_mean).toBeGreaterThan(0.05);          // **평균(옛 동작)이 아니다** — 회귀 판별

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "orbit_center.json"), JSON.stringify({
    spec: "4차 지시 7 — 궤도 회전 중심 = 3D 경계 상자 중심. 갱신은 궤도 시작 시(7-b — 그리는 중 옮기면 시점이 튄다). Playwright 신뢰 이벤트·콘솔 오류 0",
    what_this_does_not_say: [
      "target_to_bbox 0은 **보장 확인**이다(#5 — begin이 그 값을 넣는다). 판별력은 평균과의 대조(target_to_mean > 0.05, 옛 동작)가 든다",
      "픽스처 하나·dpr 1의 확인이다(#12·#21)",
      "7-c(빈 화면 기본점)는 **도달 불가**다 — 버튼·손가락 두 경로 모두 gestures.begin 하나를 지나고 begin이 lifted 0을 거른다(3D를 전부 지워도 같다 — standing은 남지만 begin이 막는다). 방어 기본값 [0,0,4]는 그래서 미측정으로 남는다(코드 경로 확인 — 실행 팔은 없다, 리뷰어 [6])",
      "잰 경로는 **궤도 버튼(begin)** 하나다(리뷰어 [5]) — 터치 unpin·setPose·뷰 전환이 같은 orbitTarget()을 부르는 것은 코드 읽기이지 측정이 아니다",
      "픽스처의 y 성분이 축퇴다(리뷰어 [11]) — 모든 획이 같은 높이(지면 게이지 1)라 bbox와 평균이 y에서 같다. 판별(2.73)은 x·z만의 값이다",
    ],
    thresholds: { target_to_bbox_max: 1e-6, discriminate_min: 0.05, console_errors_max: 0 },
    gate: {
      registered: "궤도 시작 순간의 target = 3D 경계 상자 중심(<1e-6) · 끝점 평균(옛 동작)과 뚜렷이 다름(>0.05 — 회귀 판별) · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — bbox_vs_mean(판별 간격)은 픽스처(몰아 그린 짧은 선)의 항등이라 도달 가능성으로 적지 않는다(#40 ⚠⚠)",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 4차 지시 1 — 초기 화면 오스냅
//
// "빈 화면에서 두 선을 긋고 두 번째가 첫 번째 끝점에 붙는가"(지시 검증 절).
// 카메라 확정 전에는 3D 후보가 0이라 오스냅이 통째로 안 돌던 자리다 — 2D 획의
// 끝점·중점·교차점이 후보가 됐는지를 **실제 포인터**로 확인한다.
//
// **2D 경로였다는 것을 원장이 증명해야 한다**(리뷰어 [1], #32): 스냅 시점의
// `standing:false`와 **3D 후보 0**을 함께 기록한다 — 두 번째 획은 첫 소실점의 지지선
// 방향으로 그어 카메라가 서지 않게 한다(깊이선 둘이 서로 다른 소실점이면 P2가 서 버린다).
//
// **회귀 방어는 본 단언(gap 0)이 담당한다**: 배선이 3D 전용으로 회귀하면 3D 후보가 0이라
// (기록됨) 붙을 수 없어 그 단언이 실패한다. "종류 전부 끔" 팔은 옛 상태의 재현이 **아니라**
// (그 기전은 토글 경로 — `osnap_config.json` ③이 덮는다) 단언의 판별력을 확인하는
// **양성 채널**이다(#30 · 리뷰어 [6] — 3차 리뷰어 [4]의 재분류와 같은 자리).
test("빈 화면 — 두 번째 획이 첫 획의 끝점에 붙는다 (4차 지시 1)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);

  const box = (await page.locator("#ink").boundingBox())!;
  const drawPx = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + x1 + (x2 - x1) * i / 8, box.y + y1 + (y2 - y1) * i / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  const W = box.width, H = box.height;
  const led: Record<string, unknown> = {};

  // ---- ① 빈 화면에 깊이선 하나 (화면 축과 20° 이상 — 애매 물음이 안 뜨는 각)
  await drawPx(0.30 * W, 0.70 * H, 0.50 * W, 0.55 * H);
  // **스냅 직전 상태를 기록한다**(리뷰어 [1]) — 카메라가 안 섰고 3D 후보가 0이다.
  // 이것이 "붙인 주체가 2D 경로"라는 판정의 재료다(#32: 실행 정보 없는 결과는 정보가 0이다)
  led.before2 = await page.evaluate(() => ({
    standing: window.S2S.standing(), order: window.S2S.order(),
    snap_targets_3d: window.S2S.snapTargets(), pending_2d: window.S2S.pending2Targets(),
  }));
  expect((led.before2 as any).standing).toBe(false);
  expect((led.before2 as any).snap_targets_3d).toBe(0);            // **3D 후보가 없다** — 2D뿐이다
  // ---- ② 첫 획의 끝점 근처(조리개 15px 안, √61≈7.8px 겨냥 오차)에서 이어 긋는다.
  //      ⚠ 4차 지시 3으로 깊이선 하나는 소실점을 안 만들고(대기), 끝점을 공유한 이음의
  //      교점은 소실점에서 제외되므로 — 이 두 획으로는 카메라가 서지 않는다(확정 전 유지)
  const end1 = await page.evaluate(() => {
    const st = window.S2S.doc().strokes[0];
    return st.pts2d[st.pts2d.length - 1] as [number, number];
  });
  await drawPx(end1[0] + 6, end1[1] + 5, end1[0] + 0.18 * W, end1[1] + 0.13 * H);
  led.snap = await page.evaluate(() => {
    const S = window.S2S;
    const sts = S.doc().strokes;
    const a = sts[0], b = sts[sts.length - 1];
    const e = a.pts2d[a.pts2d.length - 1], s = b.pts2d[0];
    return { strokes: sts.length, target: e, got: s,
             gap_px: Math.hypot(e[0] - s[0], e[1] - s[1]),
             standing: S.standing(), order: S.order() };
  });
  // **붙었다** — 시작점이 첫 획 끝점과 일치한다(스냅은 좌표를 그 점으로 옮긴다 — 보장 확인, #5).
  // 0.5는 판정 임계다 — 원장 `thresholds`에 등록한다(리뷰어 [5])
  expect((led.snap as any).gap_px).toBeLessThan(0.5);
  expect((led.snap as any).standing).toBe(false);                  // **여전히 카메라 확정 전이다**

  // ---- ③ 양성 채널 — 종류를 전부 끄면 안 붙는다(겨냥 오차가 그대로 남는다).
  //         옛 상태의 재현이 아니라 **단언의 판별력 확인**이다(#30, 리뷰어 [6]).
  //         ⚠ 관계 스냅(4차 지시 5)도 함께 끈다 — 끝점 정렬(x·y 동시)이 같은 자리를 대신
  //         붙여 "후보 0"의 재현이 안 된다(이 팔이 항목 5 추가 직후 실제로 그렇게 깨졌다)
  await page.evaluate(() => { window.S2S.setRelSnap(false); window.S2S.setOsnap({
    kinds: { vertex: false, endpoint: false, midpoint: false, intersection: false,
             perpendicular: false, on_edge: false, on_face: false } }); });
  const end2 = await page.evaluate(() => {
    const sts = window.S2S.doc().strokes;
    const st = sts[sts.length - 1];
    return st.pts2d[st.pts2d.length - 1] as [number, number];
  });
  await drawPx(end2[0] + 6, end2[1] + 5, end2[0] - 0.15 * W, end2[1] + 0.10 * H);
  led.positive_off = await page.evaluate(() => {
    const sts = window.S2S.doc().strokes;
    const prev = sts[sts.length - 2], st = sts[sts.length - 1];
    const e = prev.pts2d[prev.pts2d.length - 1], s = st.pts2d[0];
    return { gap_px: Math.hypot(e[0] - s[0], e[1] - s[1]) };
  });
  expect((led.positive_off as any).gap_px).toBeGreaterThan(2);     // **안 붙었다** — 겨냥 오차 그대로
  await page.evaluate(() => window.S2S.setRelSnap(true));

  // ---- 픽셀 확인 + 콘솔 오류 0 (지시 검증 절)
  led.ink_px = await page.evaluate((inkExpr) => {
    // eslint-disable-next-line no-eval
    return eval(inkExpr) as number;
  }, INK_PX);
  expect(led.ink_px as number).toBeGreaterThan(50);
  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "snap2d_flow.json"), JSON.stringify({
    spec: "4차 지시 1 — 초기 화면(카메라 확정 전) 2D 오스냅 종단. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "gap_px 0은 **보장 확인**이다(#5) — 스냅이 좌표를 그 점으로 옮긴다. 0.5는 그 배선의 판정 임계이고 아래 thresholds에 있다(리뷰어 [5])",
      "겨냥 √61≈7.8px 한 점의 확인이다(#12) — 조리개 경계(15px)·우선순위·연장 여유의 거동은 test/snap2d.test.ts의 반례가 덮는다",
      "실획이 아니다(AS-C1) — Playwright 합성 마우스다",
      "dpr 1 실행이다(#21) — 좌표 규약은 e2e/coords.spec.ts가 dpr 1·2·3에서 잠근다",
      "2D 교차점 스냅이 만드는 접합은 **사용자가 고른 화면 교차**다 — 서로 다른 깊이의 두 획을 화면 교차에서 붙이면 승격에서 3D 접합으로 굳는다(AS-L2의 가림 교차와 같은 기하 — 자동 배치가 아니라 표식을 보고 고른 것이라는 점이 다르다. D-L57에 기록)",
    ],
    thresholds: { start_gap_px_max: 0.5, aim_offset_px: 7.81, osnap_radius_px_default: 15,
                  positive_off_gap_px_min: 2, ink_px_min: 50, console_errors_max: 0 },
    gate: {
      registered: "스냅 직전 standing=false·3D 후보 0 기록(2D 경로 판정, 리뷰어 [1]) · 두 번째 획의 시작이 첫 획 끝점과 일치(gap < 0.5px) · 양성 채널(**오스냅 종류 전부 끔 + 정렬 끔** — 4차 항목 5가 정렬을 더한 뒤 두 토글 조건이 됐다, D-L61)은 겨냥 오차 그대로(> 2px) · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①: '없다'도 결론이고 명시한다)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다.** 판별력은 양성 채널(positive_off/gap_px — 오스냅 종류와 정렬을 함께 끄면 겨냥 오차 √61이 그대로 남는다)이 확인하는데, 그 값은 픽스처가 준 겨냥 오차의 항등이라 도달 가능성 수치로 적지 않는다(#40 ⚠⚠ — segment_gate가 절대값으로 규칙을 피해 갔던 그 자리의 정정과 같다. 리뷰어 [7])",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
