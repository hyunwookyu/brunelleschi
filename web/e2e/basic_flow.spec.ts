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
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
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
  // ⚠⚠ **1 → 0으로 뒤집혔다**(2026-08-18 8차 지시 1-a). 옛 판은 "가로선 = 1점 확정"이었고
  // 그것이 **수평축의 존재를 카메라가 선 것으로 읽은** 자리다. 이제 축만 기록하고 대기한다 —
  // `standing: false`는 옛 판에서도 이미 false였다(그 어긋남이 이 결함의 서명이었다:
  // **차수는 1인데 카메라는 안 서 있는** 상태를 도구가 "확정"이라 불렀다).
  expect((led.s1_horizontal as any).order).toBe(0);
  expect((led.s1_horizontal as any).standing).toBe(false);         // 깊이 소실점 전 — 3D는 아직

  // ---- ③ 깊이선 **둘**(같은 소실점을 향한 짝) → 3D가 선다 (P1 임의 f — 지시 1·5-4)
  //
  // ⚠ **4차 지시 3**: 첫 소실점은 그린 두 선의 실제 교점이다 — 한 선으로는 대기한다.
  // 두 선 다 (0.62, 0.42)를 지나므로 교점 = 그 점이고, 지평선이 그 y로 맞춰진다.
  await draw(0.30, 0.72, 0.476, 0.555);
  await draw(0.38, 0.75, 0.50, 0.585);
  // **셋째 지지선**(8차 지시 1-a) — 위 둘의 교점 (0.62, 0.42)를 지난다. 화면 가로축만으로는
  // P1이 아니게 되면서 두 선 지름길이 없어졌다(D-L69의 기본 경로).
  await draw(0.36, 0.70, 0.50, 0.549);
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
  // ⚠⚠ **4 → 2는 D-L83 되살림(10차 항목 0)의 귀결이고 이 흐름에서는 2가 옳다.**
  // 이 픽스처의 넷 중 **연결이 있는 것은 가로선(s1)과 둘째 깊이선(s3)뿐이다** — s3의
  // 시작점 (0.38, 0.75)가 s1의 몸통 위 T접합이다(liftAll의 끝점 접합 판정). s2는 시작점이
  // s1에서 20px 떨어져 있고(직선 교점은 s1 시작에서 40px 밖) s4(지지선)는 어느 획과도
  // 접합·스냅(조리개 안 후보 없음 — 15px 시절에도 없었고 D-L85의 8px에서는 더욱 없다)이 없다.
  // 옛 4는 **s2가 `on_face` 임의 앵커로**(승격 연쇄 경로), s4가
  // **그 임의 기하의 끝점에 양 끝 스냅으로** 올라간 값이었다 — 정확히 D-L83이 지우는 배치다.
  // 무연결 획 둘은 **대기**한다(§9.1 — 실패가 아니라 정상 대기. 항목 4-3의 연쇄가 놓아 준다).
  expect((led.s3_depth as any).lifted).toBe(2);
  // **가드가 실제로 막았다**(#30 양성 채널) — 시작점 앵커(연쇄 포함)와 placeUnanchored 둘 다
  led.s3_guard = await page.evaluate(() => window.S2S.anchorGuard());
  expect((led.s3_guard as any).on).toBe(true);
  expect((led.s3_guard as any).rejected).toBeGreaterThanOrEqual(2);
  // **놓인 둘의 출처를 원장이 가른다**(10차 리뷰어 [2] — 개수는 판정자가 아니다):
  // 둘 다 **일괄 풀이(접합 성분)**이고 앵커 경로는 전부 0이다. "연결"은 liftAll의 끝점 접합
  // (T접합 — findJoints의 endNear 판정)이지 on_edge 스냅이 아니다 — 접합은 §5.2의 구조
  // 제약이고 D-L83이 다루는 앵커 자격과 다른 층이다. 대기 수도 함께 남긴다(#16).
  led.s3_place_by = await page.evaluate(() => ({
    ...window.S2S.placeBy(),
    waiting: window.S2S.doc().strokes.filter((s: any) => !s.seg3d).length }));
  expect((led.s3_place_by as any).batch).toBe(2);
  expect((led.s3_place_by as any).start_anchor + (led.s3_place_by as any).two_point
       + (led.s3_place_by as any).end_anchor + (led.s3_place_by as any).ref_anchor
       + (led.s3_place_by as any).unanchored).toBe(0);
  expect((led.s3_place_by as any).waiting).toBe(2);
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
  await page.click('#tools button[data-act="draw"]');
  const target = await page.evaluate(async () => {
    // 돌린 시점에서 3D 끝점 하나의 화면 자리를 계산한다 — 앱과 같은 변환(viewCamera)
    const S = window.S2S;
    const vc = await import("/src/s3d/viewCamera.ts");
    const g3 = await import("/src/s3d/geom3d.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const pose = S.pose();
    // **자유 시점은 확정 렌즈를 이어받는다**(7차 항목 1) — 앱(frame())과 같은 내적 파라미터를
    // 같은 출처(stage.freeIntrinsics)에서 읽는다(#17). 옛 45°·중심 주점은 낡은 값이다
    const ctx = vc.viewPlaceCtx(pose, S.cam.ctx().vps.map((v: any) =>
      (v ? g3.axisDirection(v, S.cam.ctx().principal, S.cam.ctx().f) : null)), size, 45,
      S.stage.freeIntrinsics());
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
      "③의 lifted 2는 **D-L83(10차 항목 0 되살림)의 값**이다 — 무연결 깊이선 둘(s2·s4)은 대기한다. 옛 4는 on_face 임의 앵커(연쇄)와 그 임의 기하 위 양 끝 스냅의 값이었다. s3_guard가 가드 발동을 든다",
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
  // **셋째 지지선**(6차 지시 11 — 소실점은 세 번째 선이 정한다). 같은 (0.60W, 0.40H)를 지난다
  await drawPx(0.20 * W, 0.62 * H, 0.38 * W, 0.521 * H);
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

  // ---- 대각선 **셋** — 전부 (0.60W, 0.40H)를 지난다(기본 지평선 0.5H **밖** — 회귀 판별의 재료).
  //      ⚠ **셋이다**(6차 지시 11): 둘까지는 같은 축인지 다른 축인지 안 갈리므로 대기한다
  await drawPx(0.30 * W, 0.70 * H, 0.465 * W, 0.535 * H);
  await drawPx(0.25 * W, 0.55 * H, 0.4425 * W, 0.4675 * H);
  await drawPx(0.20 * W, 0.62 * H, 0.38 * W, 0.521 * H);
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
  // **오차 0**(지시 3-d) — 교점의 정의다(보장 확인, #5). 판별력은 아래 회귀 판별이 든다.
  // ⚠ **셋 중 둘만 정확히 0이다**(6차 지시 11): 소실점은 짝의 교점이므로 그 둘은 정의상 0이고,
  // 셋째는 **모임 판정**(`RULE_TOL.concurrent_deg` = 3°)을 지난 지지선이라 마우스 반올림만큼
  // 어긋난다. 그 몫도 3°의 탄젠트 안이어야 한다 — 안 그러면 모임 판정이 헐거운 것이다
  const exactMisfits = (fix.misfits as (number | null)[]).filter(m => m != null && m < 1e-9);
  expect(exactMisfits.length).toBeGreaterThanOrEqual(2);
  for (const m of fix.misfits) expect(m).toBeLessThan(Math.tan((3 * Math.PI) / 180));
  led.fix_concurrency = { exact_zero: exactMisfits.length, of: fix.misfits.length,
                          max_misfit: Math.max(...(fix.misfits as number[])) };
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
    spec: "**6차 지시 11** — 소실점 = 한 축으로 모인 **세** 대각선의 교점(4차 지시 3의 '두 선'을 대체한다: 다른 축의 두 선이 만나는 것은 공간의 한 점이지 소실점이 아니다). 그 선·격자가 그 점을 정확히 향한다. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "misfit·maxSin의 0은 측정이 아니라 **보장 확인**이다(#5) — 교점·투영의 정의다. 1e-9·1e-6은 배선 판정 임계이고 아래 thresholds에 있다",
      "⚠ **셋 중 둘만 0이다**(6차 지시 11): 소실점은 짝의 교점이므로 그 둘은 정의상 0이고, 셋째는 모임 판정을 지난 지지선이라 마우스 반올림만큼 어긋난다(`fix_concurrency.max_misfit`). `line_misfit_max = 1e-9`는 **그 둘에만** 걸린다",
      "손 오차의 크기·나란한 짝의 조건수는 여기서 안 잰다 — 반례는 test/vp_rules.test.ts(대기·이음 제외·회귀 팔)가 덮는다",
      "실획이 아니다(AS-C1) — Playwright 합성 마우스다",
      "dpr 1 실행이다(#21) — 좌표 규약은 e2e/coords.spec.ts가 dpr 1·2·3에서 잠근다",
    ],
    thresholds: { line_misfit_max: 1e-9, concurrent_deg: 3, grid_sin_max: 1e-6, vp_off_default_horizon_min_ratio: 0.05,
                  ink_px_min: 50, console_errors_max: 0 },
    gate: {
      registered: "소실점 = 한 축으로 모인 **세** 선의 교점 — 그중 **짝을 이룬 둘**의 부적합도 < 1e-9(교점의 정의)이고 **셋째(지지선)는 모임 판정 3°의 탄젠트 안**이다(6차 지시 11) · 소실점 y ≠ 기본 지평선(옛 규칙 판별) · 지평선 = 소실점 y · 격자 조각 전부가 소실점으로 모인다(sin < 1e-6, 덮는 수 > 10) · 콘솔 오류 0. "
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
  led.mid2 = await page.evaluate(() => ({ visible: window.S2S.horizon().visible }));
  // **두 선으로도 아직 없다**(6차 지시 11) — 다른 축의 대각선 둘일 수 있기 때문이다
  expect((led.mid2 as any).visible).toBe(false);
  // **셋째 지지선**(6차 지시 11 — 소실점은 세 번째 선이 정한다). 같은 (0.60W, 0.40H)를 지난다
  await drawPx(0.20 * W, 0.62 * H, 0.38 * W, 0.521 * H);
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

  // ---- ④′ 판별력 대조 팔(이월-1 재검 [15]) — **같은 겨냥에서 오스냅을 끄면 다른 점이 나온다.**
  //      정렬 단독이면 y 후보는 ③의 선 끝(y1−6, 거리 1px)이 첫 선 y(거리 5px)보다 가까워
  //      (endB.x, y1−6)으로 가야 한다 — ④의 gap 0이 "어느 쪽이 이겨도 같은 점"이 아님을 잠근다
  await page.evaluate(() => window.S2S.setOsnap({
    kinds: { vertex: false, endpoint: false, midpoint: false, intersection: false } }));
  await drawPx(0.45 * W, 0.32 * H, endB[0] + 6, endB[1] - 5);
  led.priority_control = await page.evaluate(() => {
    const sts = window.S2S.doc().strokes;
    const st = sts[sts.length - 1];
    const e = st.pts2d[st.pts2d.length - 1];
    const b = sts[0].pts2d[sts[0].pts2d.length - 1];
    return { end: e, target: b, gap_px: Math.hypot(e[0] - b[0], e[1] - b[1]) };
  });
  // 오스냅 없이는 그 점에 안 붙는다(gap > 2px) — ④가 판별하는 팔임의 증거
  expect((led.priority_control as any).gap_px).toBeGreaterThan(2);
  await page.evaluate(() => window.S2S.setOsnap({
    kinds: { vertex: true, endpoint: true, midpoint: true, intersection: true } }));

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
      "오스냅과의 우선순위는 ②에서는 25px 간격으로 회피했고 **④가 겹치는 자리를 직접 잰다**([B-2] — 끝점 √61≈7.81px 겨냥에서 정렬이 아니라 점에 붙는다). ④의 gap 0 자체는 스냅의 보장(#5)이고 **판별력은 ④′(오스냅 끔 대조)가 든다** — 같은 겨냥에서 정렬 단독은 다른 점(gap>2px)으로 간다(이월-1 재검 [15])"
      + " ⚠ ④′의 판별력은 **경쟁 y 후보의 존재에 걸려 있다**(재검 [37]): 겨냥 y(y1−5)에서 ③의 선 끝(y1−6, 거리 1px)이 첫 선 y(거리 5px)보다 가까워 정렬이 다른 점으로 간다 — ③ 팔이 픽스처에서 빠지면 정렬 x·y가 끝점 좌표를 재현해 ④′가 조용히 판별력을 잃는다(그 경우 이 팔이 실패해 알린다: gap>2 단언이 깨진다)",
      "**정렬로 옮겨진 끝점은 규칙(stepRule)의 입력이 된다**([B-1] — D-L58 ③과 같은 원리): 확정 전 전용 배선은 곧 카메라가 정해지는 구간 전체다. 정렬 허용치는 조리개와 같아(D-L85로 8px) 300px 획에서 최대 ≈1.5° 방향을 바꾸고(15px 시절 ≈2.9°) 그 선의 교점이 불가역인 첫 소실점이다 — D-L61에 기록",
      "실획이 아니다(AS-C1) · dpr 1 실행이다(#21)",
    ],
    // ⚠ `aim_offset_px` 6은 ②(정렬 팔)의 y 겨냥 오차다 — snap2d_flow의 같은 이름 필드(7.81 =
    // 겨냥 거리)와 **다른 양**이라 이름을 갈랐다(이월-1 재검 [10]). ④의 겨냥 거리는 priority_aim_px
    thresholds: { aligned_gap_px_max: 1e-9, aim_offset_y_px: 6, priority_aim_px: 7.81,
                  toggle_off_gap_px_min: 2,
                  priority_gap_px_max: 0.5, priority_control_gap_px_min: 2, guide_px_min: 5,
                  align_tol_px: 15, ink_px_min: 50, console_errors_max: 0 },
    gate: {
      registered: "정렬 켬: 둘째 선 끝 y = 첫 선 y(오스냅 조리개 밖 자리) · 정렬 끔: 겨냥 오차 6px 그대로(>2px) · 겹치는 자리(끝점 √61≈7.81px 겨냥 — snap2d_flow와 같은 표기)는 오스냅이 이긴다(gap<0.5px, 5-d) · **같은 겨냥에서 오스냅을 끄면 다른 점**(gap>2px — ④의 판별력, 이월-1 재검 [15]) · 끌던 중 마젠타 가이드 픽셀>5(5-c) · 콘솔 오류 0. "
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
test("회전 중심 — 경계 상자 중심을 시선에 투영한 점으로 돈다 (4차 지시 7 · 5차 지시 2 개정)", async ({ page }) => {
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
  // **셋째 지지선**(8차 지시 1-a) — 위 둘의 교점 (0.62W, 0.42H)를 지난다
  await drawPx(0.36 * W, 0.70 * H, 0.50 * W, 0.549 * H);
  // ⚠ **짧은 선 둘은 가로선의 끝점 사슬에 잇는다**(D-L83, 10차 항목 0) — 옛 좌표
  // ((0.30, 0.70)·(0.30, 0.68) — 허공)는 on_face 임의 앵커로만 올라가던 것이라 가드가 막는다.
  // 첫 획의 왼끝(0.30, 0.75)에서 시작해 끝점 스냅으로 놓이고, 둘째는 첫째의 끝에 잇는다 —
  // "짧은 선을 한쪽에 몰아"(판별력)는 그대로다.
  await drawPx(0.30 * W, 0.75 * H, 0.34 * W, 0.75 * H);
  await drawPx(0.34 * W, 0.75 * H, 0.38 * W, 0.75 * H);
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
    // **5차 지시 2 개정**: target = 경계 상자 중심을 **궤도 시작 시점의 시선에 투영**한 점.
    // 확정 시점에서 시작했으므로 시선은 광축(눈 0·앞 +z) — 기대 target은 (0, 0, bbox.z)다
    return { n_lifted: segs.length, bbox, mean, target,
             target_to_proj_bbox: d(target, [0, 0, bbox[2]]),
             target_to_bbox: d(target, bbox),
             proj_gap_bbox_mean: Math.abs(bbox[2] - mean[2]),
             bbox_vs_mean: d(bbox, mean) };
  });
  const c = led.center as any;
  expect(c.n_lifted).toBeGreaterThanOrEqual(4);
  expect(c.bbox_vs_mean).toBeGreaterThan(0.05);            // **판별력** — 두 중심이 실제로 다르다
  expect(c.proj_gap_bbox_mean).toBeGreaterThan(0.05);      // **투영 깊이도 갈린다** — 평균 대조 판별
  // **상자 중심의 시선 투영으로 돈다**(7-a + 5차 2-a — 시선 유지: 재조준 없음)
  expect(c.target_to_proj_bbox).toBeLessThan(1e-6);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "orbit_center.json"), JSON.stringify({
    spec: "4차 지시 7 + 5차 지시 2 개정 — 궤도 회전 중심 = 경계 상자 중심을 궤도 시작 시점의 시선에 투영한 점(시선 유지 — 재조준 없음). 갱신은 궤도 시작 시(7-b). Playwright 신뢰 이벤트·콘솔 오류 0",
    what_this_does_not_say: [
      "target_to_proj_bbox 0은 **보장 확인**이다(#5 — retarget이 그 값을 넣는다). 판별력은 평균 투영과의 대조(proj_gap_bbox_mean > 0.05)와 첫 프레임 팔(orbit_begin_invariance)이 든다. ⚠ 그럼에도 임계 1e-6을 거는 이유는 **배선 판정**(begin→retarget이 bboxCenter를 실제로 투영하는가)이다 — 측정 임계가 아니다(§5.1의 예외 사유, 이월-1 재검 #5 지적). target_to_bbox(횡 오프셋)는 정보 필드로 남긴다 — 그 값이 0이면 옛 동작(재조준)이다",
      "픽스처 하나·dpr 1의 확인이다(#12·#21)",
      "7-c(빈 화면 기본점)는 **도달 불가**다 — 버튼·손가락 두 경로 모두 gestures.begin 하나를 지나고 begin이 lifted 0을 거른다(3D를 전부 지워도 같다 — standing은 남지만 begin이 막는다). 방어 기본값 [0,0,4]는 그래서 미측정으로 남는다(코드 경로 확인 — 실행 팔은 없다, 리뷰어 [6])",
      "잰 경로는 **궤도 버튼(begin)** 하나다(리뷰어 [5]) — 터치 unpin·setPose·뷰 전환이 같은 orbitTarget()을 부르는 것은 코드 읽기이지 측정이 아니다",
      "픽스처의 y 성분이 축퇴다(리뷰어 [11]) — 모든 획이 같은 높이(지면 게이지)라 bbox와 평균이 y에서 같다. ⚠ 개정 후 판별 필드(proj_gap_bbox_mean)는 시선 투영이 x·y를 지워 **z 성분 하나의 값**이다(재검 [2-4] — bbox_vs_mean의 x 성분은 판별에 안 든다. 값은 이 원장의 center 필드를 읽는다 — 10차 항목 0이 짧은 선 픽스처를 끝점 사슬로 옮겨 옛 산문의 2.73은 낡았다)",
    ],
    thresholds: { target_to_proj_bbox_max: 1e-6, discriminate_min: 0.05, console_errors_max: 0 },
    gate: {
      registered: "궤도 시작 순간의 target = 경계 상자 중심의 시선 투영(<1e-6, 5차 지시 2 개정 — 4차 등록 'target = 상자 중심 그대로'를 사람 지시가 갈아 끼웠다: 재조준이 첫 프레임을 튀게 했다) · 평균 투영과 뚜렷이 다름(>0.05 — 회귀 판별) · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — bbox_vs_mean(판별 간격)은 픽스처(끝점 사슬로 이은 짧은 선을 한쪽에 몰았다 — 10차 항목 0이 D-L83에 맞춰 허공 좌표를 옮겼다)의 항등이라 도달 가능성으로 적지 않는다(#40 ⚠⚠)",
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
  // ---- ② 첫 획의 끝점 근처(√61≈7.8px 겨냥 오차 — 조리개 8px(D-L85) 바로 안)에서 이어 긋는다.
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

  // ---- ②′ **그 스냅이 문서에 남는가**(2026-08-18 9차 항목 1 · D-L81).
  //      ⚠⚠ 항목 1 이전에는 **좌표가 옮겨지고 표식까지 그려지는데 문서에는 아무 흔적도
  //      없었다** — `applySnapToEnd`의 호출자 둘이 전부 3D 경로였기 때문이다. 그래서
  //      실획의 `snapEnd` 0/5가 "안 걸린다"인지 "안 세어진다"인지 갈리지 않았다.
  //      **`snapStart`(3D 참조)는 여기서 여전히 `null`이어야 한다** — 카메라가 안 섰다.
  led.snap2d_record = await page.evaluate(() => {
    const st = window.S2S.doc().strokes.slice(-1)[0] as any;
    return { has2dStart: !!st.snap2dStart, kind: st.snap2dStart?.kind ?? null,
             at: st.snap2dStart?.at ?? null, distPx: st.snap2dStart?.distPx ?? null,
             has3dStart: !!st.snapStart, has3dEnd: !!st.snapEnd };
  });
  {
    const r = led.snap2d_record as any;
    expect(r.has2dStart).toBe(true);                 // **기록이 남는다**(항목 1이 고친 것)
    expect(r.has3dStart).toBe(false);                // 3D 참조는 아직 없다 — 단계가 갈린다
    expect(r.distPx).toBeLessThanOrEqual(15);        // 조리개 안이다(기록이 거리도 남긴다)
    // 기록한 좌표가 **실제로 옮겨간 그 점**이다(#5 보장 확인 — `snap2Refs`는 옮겨 적을 뿐이다)
    const got = (led.snap as any).got as [number, number];
    expect(Math.hypot(r.at[0] - got[0], r.at[1] - got[1])).toBeLessThan(0.5);
  }

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
  // **양성 채널이 기록에도 걸린다**(#30) — 안 붙었으면 기록도 없다. 이 단언이 없으면
  // 위 ②′는 "필드가 늘 채워진다"로도 통과한다(#32 — 판별력이 0인 검사).
  led.snap2d_record_off = await page.evaluate(() => {
    const st = window.S2S.doc().strokes.slice(-1)[0] as any;
    return { has2dStart: !!st.snap2dStart, has2dEnd: !!st.snap2dEnd };
  });
  expect((led.snap2d_record_off as any).has2dStart).toBe(false);
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
      "겨냥 √61≈7.8px 한 점의 확인이다(#12) — 조리개 경계(현행 기본 8px — D-L85. ⚠ 이 겨냥 7.8px은 그 경계 바로 안이다)·우선순위·연장 여유의 거동은 test/snap2d.test.ts의 반례가 덮는다",
      "실획이 아니다(AS-C1) — Playwright 합성 마우스다",
      "dpr 1 실행이다(#21) — 좌표 규약은 e2e/coords.spec.ts가 dpr 1·2·3에서 잠근다",
      "2D 교차점 스냅이 만드는 접합은 **사용자가 고른 화면 교차**다 — 서로 다른 깊이의 두 획을 화면 교차에서 붙이면 승격에서 3D 접합으로 굳는다(AS-L2의 가림 교차와 같은 기하 — 자동 배치가 아니라 표식을 보고 고른 것이라는 점이 다르다. D-L57에 기록)",
    ],
    thresholds: { start_gap_px_max: 0.5, aim_offset_px: 7.81, osnap_radius_px_default: OSNAP_RADIUS_PX,
                  positive_off_gap_px_min: 2, ink_px_min: 50, console_errors_max: 0,
                  // **2D 기록의 좌표 일치**(9차 항목 1) — 보장 확인이라 임계가 아니라 배선 판정이다
                  snap2d_record_at_gap_px_max: 0.5 },
    gate: {
      registered: "스냅 직전 standing=false·3D 후보 0 기록(2D 경로 판정, 리뷰어 [1]) · 두 번째 획의 시작이 첫 획 끝점과 일치(gap < 0.5px) · 양성 채널(**오스냅 종류 전부 끔 + 정렬 끔** — 4차 항목 5가 정렬을 더한 뒤 두 토글 조건이 됐다, D-L61)은 겨냥 오차 그대로(> 2px) · 콘솔 오류 0. "
        + "**[9차 항목 1 추가 등록]** 그 스냅이 **문서에 남는다**: `snap2dStart`가 있고(`distPx` ≤ 15) 그 `at`이 실제로 옮겨간 점과 0.5px 안이며, **3D 참조(`snapStart`)는 `null`**이다(단계가 갈린다). 양성 채널에서는 **기록도 없다**(`snap2dStart` 없음) — 그 단언이 없으면 '필드가 늘 채워진다'로도 통과한다(#32). "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①: '없다'도 결론이고 명시한다)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다.** 판별력은 양성 채널(positive_off/gap_px — 오스냅 종류와 정렬을 함께 끄면 겨냥 오차 √61이 그대로 남는다)이 확인하는데, 그 값은 픽스처가 준 겨냥 오차의 항등이라 도달 가능성 수치로 적지 않는다(#40 ⚠⚠ — segment_gate가 절대값으로 규칙을 피해 갔던 그 자리의 정정과 같다. 리뷰어 [7])",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 5차 지시 1 — 확정 화면 불변
//
// **1점 확정 직전·직후 그린 선이 같은 자리에 있는가**(지시 1-d의 반례 팔).
// 되살린 버그: 확정 전 획이 자유 자세 가짜 뷰로 들어가 일괄 풀이가 빈 목록을 받고
// (lifted 0), viewIsCurrent()가 거짓이 되어 그린 획이 화면에서 통째로 사라지던 것.
// ⚠ **확정 획의 시작점을 지평선 위에 둔다** — 옛 코드가 우연히 살아나던 경로(시작점이
// 지면을 물어 연쇄로 올라가는 것)를 막아, 옛 코드에서 이 팔이 반드시 실패하게 한다.
test("1점 확정 — 직전·직후 그린 선이 같은 자리다 (5차 지시 1)", async ({ page }) => {
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

  // 획 중점들의 표시 여부 — 잉크(2D 알파) 또는 GL(3D 어둡기) 어느 층이든 보이면 된다
  const VISIBLE_AT = `(async (pts) => {
    const S = window.S2S;
    const el = document.getElementById("ink");
    const dpr = el.width / el.getBoundingClientRect().width;
    const ink = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    const vp = S.stage.viewport;
    vp.renderer.render(vp.scene, vp.camera);
    const gl = vp.renderer.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const kx = bw / vp.renderer.domElement.clientWidth,
          ky = bh / vp.renderer.domElement.clientHeight;
    return pts.map(([sx, sy]) => {
      let inkN = 0;
      const cx = Math.round(sx * dpr), cy = Math.round(sy * dpr);
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const i = ((cy + dy) * el.width + (cx + dx)) * 4 + 3;
        if (i >= 0 && i < ink.length && ink[i] > 30) inkN++;
      }
      let dark = 255;
      const gx = Math.round(sx * kx), gy = Math.round(bh - sy * ky);
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const i = ((gy + dy) * bw + (gx + dx)) * 4;
        if (i < 0 || i >= buf.length) continue;
        dark = Math.min(dark, Math.max(buf[i], buf[i + 1], buf[i + 2]));
      }
      return { ink: inkN, gl_dark: dark };
    });
  })`;

  // ---- ① 작도 밑선 + 깊이선 하나(밑선 왼끝에서 소실점 쪽으로) — 아직 확정 전
  //      ⚠ 끝점을 잇는 실제 작도 형태다 — 일괄 풀이(liftAll)는 끝점 접합만 구조로 잇는다
  //      (화면 가로지름은 가림 교차일 수 있어 안 잇는다, #23).
  //      ⚠ **그림 전체가 지평선 위다**(눈높이 위 상자 — 올려다본 구도): 옛 코드의 우연한
  //      생존 경로(확정 획 시작점이 지면을 물어 연쇄로 올라감)는 지면(지평선 아래)에서만
  //      열리므로, 이 구도에서 옛 결함(일괄 풀이 빈 목록 → lifted 0)이 반드시 드러난다
  await drawPx(0.25 * W, 0.30 * H, 0.45 * W, 0.301 * H);
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  const mids0 = await page.evaluate(() => window.S2S.doc().strokes.map((s: any) => {
    const a = s.pts2d[0], b = s.pts2d[s.pts2d.length - 1];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }));
  led.before = await page.evaluate(async ({ fn, pts }) => {
    // eslint-disable-next-line no-eval
    return await eval(fn)(pts);
  }, { fn: VISIBLE_AT, pts: mids0 });
  for (const v of led.before as any[]) expect(v.ink).toBeGreaterThan(0);  // 직전: 잉크가 보인다
  led.standing_before = await page.evaluate(() => window.S2S.standing());
  expect(led.standing_before).toBe(false);

  // ---- ② 확정 획 — 밑선 오른끝에서 같은 소실점 쪽으로 긋는 둘째 깊이선.
  //      첫 깊이선과의 연장 수렴 교점(≈0.62W, 0.58H) = 소실점 → P1 확정
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  // **셋째 지지선**(8차 지시 1-a) — 위 둘의 교점 (0.6204W, 0.58H)를 지난다.
  // 화면 가로축만으로는 P1이 아니게 되면서 두 선 지름길이 없어졌다(D-L69의 기본 경로).
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  led.after_state = await page.evaluate(() => {
    const S = window.S2S, d = S.doc();
    return { standing: S.standing(), order: S.order(),
             lifted: d.strokes.filter((s: any) => s.seg3d).length,
             strokes: d.strokes.length,
             pending_hidden: d.strokes.filter((s: any) => !s.seg3d
               && s.viewRef !== d.currentView).length };
  });
  // ⚠⚠ **미앵커 배치의 서명을 원장에 남긴다**(2026-08-18 8차 리뷰어 [3]·[4] · #25).
  //
  // 8차 항목 0이 병합한 원격 갈래의 `placeUnanchored`·`planeAnchor`(D-L77)는 **앵커도 연결도
  // 없는 획을 지면에 임의 깊이로** 놓는다. 그 사실을 지난 세션은 **브라우저에서 눈으로 보고
  // 문서에만 적었고**(원장 밖 측정 — #25), 판정도 `lifted` **개수**로 걸었다. 개수는
  // "**임의 깊이로 놓임**"과 "**연결이 정한 깊이로 놓임**"을 **못 가른다**(리뷰어 [4]).
  //
  // 그래서 **좌표로 남긴다**: 앵커 없이(`snapStart == null`) 놓인 획이 몇이고, 그 획의 3D y가
  // **앞선 획들과 같은 지면 값**인가(= 임의 지면 스냅의 서명).
  // ⛔⛔ **"4-5가 지우면 0"이라던 8차의 예측은 틀렸다**(9차 항목 4-5 실측 4 → 3) —
  // `snapStart == null` 배치를 만드는 경로가 셋이고 D-L83은 둘(①시작점 임의 앵커
  // ②placeUnanchored)만 막는다. 셋째(`solveInto` → `liftAll`)는 **연결이 있는 성분**을
  // 카메라가 올리는 경로라 이 카운터에 남는다 — **0으로 만드는 것은 4-3의 몫**이다.
  led.unanchored_place = await page.evaluate(() => {
    const d = window.S2S.doc();
    const placed = d.strokes.filter((s: any) => s.seg3d);
    const ys = placed.map((s: any) => s.seg3d[0][1]);
    const ground = ys.length ? ys[0] : null;
    const un = placed.filter((s: any) => s.snapStart == null);
    return {
      placed: placed.length,
      unanchored_placed: un.length,
      // 앵커 없이 놓인 획의 y가 첫 획의 y와 같은가 — 지면 임의 스냅의 서명
      unanchored_on_ground: un.filter((s: any) =>
        ground != null && Math.abs(s.seg3d[0][1] - ground) < 1e-9).length,
      ground_y: ground,
      unanchored_segs: un.map((s: any) => ({ a: s.seg3d[0], b: s.seg3d[1] })),
      note: "앵커 없이(snapStart·snapEnd 없이) 놓인 획. ⛔⛔ **'0이 판정'이라는 예측은 두 번 "
          + "틀렸다**: 8차의 '4-5가 지우면 0'은 9차 실측 4 → 3으로, 10차의 '4-3이 0으로 만든다'는 "
          + "4-3 완료 뒤에도 **3**으로. 남은 셋은 확정 순간의 일괄 풀이(첫 앵커 — D-L84 ③이 "
          + "그 배치를 정당한 것으로 못 박았다)라 **이 수는 0이 될 수 없다.** 판정자 역할은 "
          + "경로별 카운터(place_by — batch/unanchored/앵커 셋)로 옮겨 갔다. 임의 배치의 "
          + "판정은 place_by.unanchored와 가드 카운터다(10차 리뷰어 2차 [2]).",
    };
  });
  // **D-L83 가드 상태를 원장에 남긴다**(10차 항목 0-c — rejected와 lifted를 함께 기록한다)
  led.anchor_guard = await page.evaluate(() => window.S2S.anchorGuard());
  // **가드가 켜져 있고 placeUnanchored를 정확히 한 번 막았다**(9차 실측의 재현) —
  // 넷째 획(지지선)이 임의 깊이로 놓이던 그 경로다. 시작점 앵커 경로는 이 픽스처에서 0이다
  // (9차 4-5′: 0은 "그 픽스처에서 안 걸렸다"이지 가드 무력이 아니다 — 경로별로 세므로 가른다).
  expect((led.anchor_guard as any).on).toBe(true);
  expect((led.anchor_guard as any).unanchored_rejected).toBe(1);
  // **놓인 셋의 출처를 원장이 가른다**(10차 리뷰어 [2]) — 전부 일괄 풀이(접합 성분)이고
  // 앵커 경로는 0이다. 그래서 여전히 snapStart가 없다(unanchored_placed == placed).
  // 이 등식이 깨지는 것은 연결 앵커(ref/start/end)가 이 픽스처에 생긴 뒤다.
  led.place_by = await page.evaluate(() => window.S2S.placeBy());
  expect((led.place_by as any).batch).toBe(3);
  expect((led.place_by as any).start_anchor + (led.place_by as any).two_point
       + (led.place_by as any).end_anchor + (led.place_by as any).ref_anchor
       + (led.place_by as any).unanchored).toBe(0);
  expect((led.unanchored_place as any).unanchored_placed)
    .toBe((led.unanchored_place as any).placed);
  expect((led.after_state as any).standing).toBe(true);
  // **일괄 풀이가 실제로 돌았다** — 옛 코드는 가짜 뷰 때문에 0이었다(이 팔의 되살린 버그)
  // ⚠⚠ **4 → 3은 D-L83 되살림(10차 항목 0)의 값이고 이 흐름에서는 3이 옳다**: 밑선(s1)과
  // 두 깊이선(s2·s3)은 끝점 접합으로 이어진 성분이라 일괄 풀이가 올리고, 넷째(지지선)는
  // **어느 획과도 접합·스냅이 없어** 대기한다(§9.1). 옛 4는 그 획을 placeUnanchored가
  // 임의 깊이(z 3.499~6.995)로 놓은 값이었다 — 위 unanchored_place 주석의 그 배치다.
  expect((led.after_state as any).lifted).toBe(3);
  expect((led.after_state as any).pending_hidden).toBe(0);   // 숨은 뷰에 남은 획이 없다

  // ---- ③ 직후: 같은 자리(그린 선 중점)가 여전히 보인다 — 잉크가 아니면 3D가 그 자리에 있다
  const mids1 = await page.evaluate(() => window.S2S.doc().strokes.slice(0, 2).map((s: any) => {
    const a = s.pts2d[0], b = s.pts2d[s.pts2d.length - 1];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }));
  led.after = await page.evaluate(async ({ fn, pts }) => {
    // eslint-disable-next-line no-eval
    return await eval(fn)(pts);
  }, { fn: VISIBLE_AT, pts: mids1 });
  for (const v of led.after as any[]) {
    expect(v.ink > 0 || v.gl_dark < 235).toBe(true);         // **같은 자리에 남아 있다**
  }

  // ---- ④ 재투영 불변(지시 1-b) — 올라간 세그먼트를 확정 카메라로 되쏘면 pts2d와 같다
  led.reproject = await page.evaluate(() => {
    const S = window.S2S, d = S.doc();
    const ctx = S.cam.ctx();
    const P = ctx.principal, f = ctx.f;
    const prj = (p: number[]) => [P[0] + (f * p[0]) / p[2], P[1] + (f * p[1]) / p[2]];
    return d.strokes.filter((s: any) => s.seg3d).map((s: any) => {
      const a = prj(s.seg3d[0]), b = prj(s.seg3d[1]);
      const a2 = s.pts2d[0], b2 = s.pts2d[s.pts2d.length - 1];
      return { gap_a: Math.hypot(a[0] - a2[0], a[1] - a2[1]),
               gap_b: Math.hypot(b[0] - b2[0], b[1] - b2[1]) };
    });
  });
  // 시작점은 자기 광선 위(§4.5 — 오차 0). 끝점은 축 스냅이 방향을 다시 정할 수 있어 별도다
  for (const g of led.reproject as any[]) expect(g.gap_a).toBeLessThan(1e-3);
  led.reproject_start_max = Math.max(...(led.reproject as any[]).map((g: any) => g.gap_a));
  led.reproject_end_max = Math.max(...(led.reproject as any[]).map((g: any) => g.gap_b));

  // **음성 대조**(재검 [1-3]) — 획이 없는 자리의 GL 어둡기. 중점 판정(<235)이 격자·지평선
  // 같은 배경 요소로도 통과하는 것이 아닌지 가른다
  led.gl_empty_spot = await page.evaluate(async (fn) => {
    // eslint-disable-next-line no-eval
    const r = await eval(fn)([[0.08 * document.getElementById("ink")!.getBoundingClientRect().width,
                               0.08 * document.getElementById("ink")!.getBoundingClientRect().height]]);
    return r[0].gl_dark;
  }, VISIBLE_AT);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "p1_invariance.json"), JSON.stringify({
    spec: "5차 지시 1 — 1점 확정 직전·직후 화면 불변: 그린 선의 중점이 같은 자리에 보이고, 일괄 풀이가 확정 뷰의 대기 획 전부를 올린다. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "중점 표본의 확인이다(#12 — **직전 표본은 둘**: 확정 전에 그려진 두 획. 확정 획 자신은 '직전'이 없어 재투영 팔(셋)만 지난다. 재검 [1-2]가 '셋' 오기를 잡았다) — 선 전체의 픽셀 일치가 아니다. 자리 불변의 판정은 9×9 창의 표시 유무이고, gl_empty_spot(획 없는 자리의 GL 어둡기)이 배경 요소 오탐의 음성 대조다(재검 [1-3])",
      "reproject의 셋 중 둘은 gap이 정확히 0이다 — 화면 축(무한원) 방향의 배치는 시작점 광선 위 산술이 유리수 연산이라 잔차가 안 생기고, 유한 소실점 축(둘째 획)만 부동소수 잔차(3.5e-6px)가 남는다. 임계의 실효 표본이 좁다는 뜻이다(재검 [1-6])",
      "**되살림 확인(A-4)의 값은 원장 밖이다**(#25 — 커밋되지 않는 임시 판이라 재현 불가): 옛 동작에서 이 팔의 lifted가 0으로 실패하는 것을 확인하고 복원했다. progress 산문에만 있다",
      "재투영 0은 시작점(자기 광선 위, §4.5 보장 #5)이고 **끝점은 별도로 적는다** — 축 스냅이 방향을 다시 정하면 끝점 상이 이동한다(그건 결함이 아니라 D-L42의 동작이다). reproject_end_max가 그 값이다",
      "dpr 1 실행이다(#21) — 아이패드(dpr 2·터치)의 확인은 실기(K)의 문이다",
      "옛 결함의 재현 조건(그림 전체가 지평선 위 — 눈높이 위 상자)을 픽스처에 박았다 — 확정 획 시작점이 지평선 아래면 옛 코드도 지면 스냅 연쇄로 우연히 올라가 이 팔이 그 결함을 못 본다. 지평선 아래 구도의 확정은 기본 흐름 스펙(①~③)이 덮는다",
      "anchor_guard의 **0은 '그 픽스처에서 시도가 없었다'다**(9차 4-5′ · #11) — start_rejected 0의 분모는 start_attempts(후보가 있었던 질의 수)이고 이 픽스처에서 0이다(빈 곳 시작이라 후보 자체가 없다). 가드 무력의 판정이 아니다 — 시작점 경로의 차단은 basic_flow ①~③의 s3_guard(start_rejected > 0)가 든다",
    ],
    thresholds: { reproject_start_px_max: 1e-3, gl_dark_max: 235, ink_alpha_min: 30,
                  console_errors_max: 0 },
    gate: {
      registered: "확정 직전 **두 획**(확정 전에 그려진 것 전부) 중점에 잉크가 있고 · 확정 직후 lifted=3(일괄 풀이 실행 — 옛 코드는 가짜 뷰 때문에 0. ⚠ 8차 병합~9차 사이에는 placeUnanchored가 넷째를 임의 깊이로 놓아 **4**였고, D-L83 되살림(10차 항목 0)이 그 배치를 막아 3으로 돌아왔다 — 낮춘 것이 아니라 원래 조항의 복원이다) · 숨은 뷰 대기 0 · 같은 중점이 직후에도 보이고(잉크 또는 GL<235) · 올라간 시작점의 재투영 오차 <1e-3px(§4.5 — 실측 3.5e-6px, 부동소수 잔차만 담는 배선 임계) · 콘솔 오류 0. "
        + "⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선·보장 확인이라 도달 가능성 오라클이 성립하지 않는다** — 재투영 0은 §4.5의 설계 보장이고(#5) 임계 1e-3px는 배선 판정이다(실측 3.5e-6px — 부동소수 잔차만 걸린다)",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 5차 지시 2 — 궤도 시작 불변
//
// **궤도를 시작해도 그리던 뷰에서 이어진다**(지시 2). 회전 중심(경계 상자 중심, D-L62)은
// **현재 시선 위로 투영**해 놓는다(stage.retarget) — target을 중심점 그대로 놓으면
// OrbitControls.update()가 카메라를 재조준해 첫 프레임이 튀었다(되살린 버그).
test("궤도 시작 — 손가락만 대면 화면이 같고, 첫 회전이 이어진다 (5차 지시 2)", async ({ page }) => {
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

  // 확정 상태를 만든다(p1_invariance와 같은 눈높이 위 구도 — lifted 3)
  await drawPx(0.25 * W, 0.30 * H, 0.45 * W, 0.301 * H);
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  // **셋째 지지선**(6차 지시 11) — 위 둘의 교점 (0.6204W, 0.58H)를 지난다
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  const ready = await page.evaluate(() => {
    const S = window.S2S;
    return { standing: S.standing(), lifted: S.doc().strokes.filter((s: any) => s.seg3d).length };
  });
  expect(ready.standing).toBe(true);
  // ⚠⚠ **4 → 3은 D-L83 되살림(10차 항목 0)이다** — 8차가 이 자리에 미리 적어 둔 그대로
  // ("임의 스냅을 지우면 3으로 돌아가고, 그 시점에는 이 줄이 회귀 신호다" — #30 양성 채널).
  // 넷째(지지선)는 어느 획과도 접합·스냅이 없어 대기한다. 4가 다시 나오면 임의 배치의 회귀다.
  expect(ready.lifted).toBe(3);

  // GL 서명(칠해진 수 + 성긴 체크섬) — 화면이 같은가의 판정
  const GL_SIG = `(() => {
    const S = window.S2S;
    const vp = S.stage.viewport;
    vp.renderer.render(vp.scene, vp.camera);
    const gl = vp.renderer.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let painted = 0, sum = 0;
    for (let i = 0; i < buf.length; i += 4)
      if (buf[i] < 235 || buf[i + 1] < 235 || buf[i + 2] < 235) { painted++; sum = (sum + i) % 1000000007; }
    return { painted, sum };
  })`;

  // ---- ① 손가락을 **대기만** 한다(이동 0) → 화면 동일(죽은 구간 dead_px=3의 잠금 포함)
  led.sig_before = await page.evaluate(f => eval(f)(), GL_SIG);
  led.dir_before = await page.evaluate(() => {
    const c = window.S2S.stage.viewport.camera;
    c.updateMatrixWorld(true);
    const d = { x: 0, y: 0, z: 0 } as any;
    const v = c.getWorldDirection(new (c.position.constructor)());
    return [v.x, v.y, v.z];
  });
  await page.evaluate(() => {
    const el = document.getElementById("ink")!;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 91001, pointerType: "touch", isPrimary: true, bubbles: true,
      clientX: r.left + r.width * 0.7, clientY: r.top + r.height * 0.7, buttons: 1 }));
  });
  led.sig_touch = await page.evaluate(f => eval(f)(), GL_SIG);
  expect((led.sig_touch as any).painted).toBe((led.sig_before as any).painted);
  expect((led.sig_touch as any).sum).toBe((led.sig_before as any).sum);

  // ---- ② 죽은 구간을 넘기고(+5px — 이 이동은 구간 소비만 한다) **한 번 더**(+7px) 움직여
  //      begin을 실제로 연다(#32 — 첫 이동만으로는 begin이 안 열려 팔이 공허하다).
  //      begin이 unpin → 궤도 중심 설정을 지나므로 여기가 재조준이 나던 자리다
  await page.evaluate(() => {
    const el = document.getElementById("ink")!;
    const r = el.getBoundingClientRect();
    // ⚠ 이동도 **캔버스에** 보낸다 — 리스너가 캔버스에 있고 합성 이벤트는 포인터 캡처를 안 탄다
    for (const dx of [5, 7]) {
      el.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 91001, pointerType: "touch", isPrimary: true, bubbles: true,
        clientX: r.left + r.width * 0.7 + dx, clientY: r.top + r.height * 0.7, buttons: 1 }));
    }
  });
  led.began = await page.evaluate(() => !window.S2S.stage.isPinned);
  expect(led.began).toBe(true);          // **begin이 실제로 열렸다**(#32 — 미실행이면 공허하다)
  led.dir_after = await page.evaluate(() => {
    const c = window.S2S.stage.viewport.camera;
    c.updateMatrixWorld(true);
    const v = c.getWorldDirection(new (c.position.constructor)());
    return [v.x, v.y, v.z];
  });
  const dot = (led.dir_before as number[]).reduce((t, v, i) => t + v * (led.dir_after as number[])[i], 0);
  led.gaze_change_deg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
  // 2px 회전의 기대 각은 (2π·2/658)·(180/π) ≈ 1.1° — 재조준(경계 상자 방향, 수 도~수십 도)과 갈린다
  expect(led.gaze_change_deg as number).toBeLessThan(1.5);
  await page.evaluate(() => {
    document.getElementById("ink")!.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 91001, pointerType: "touch", isPrimary: true, bubbles: true }));
  });

  // **양성 채널**(#30, 재검 [2-2]) — 더 크게 돌리면 GL 서명이 실제로 움직인다.
  //  서명 불변 판정(①)이 "지표 둔감"이 아님을 같은 실행에서 가른다
  await page.evaluate(() => {
    const el = document.getElementById("ink")!;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 91002, pointerType: "touch", isPrimary: true, bubbles: true,
      clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.6, buttons: 1 }));
    for (const dx of [20, 60, 120]) {
      el.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 91002, pointerType: "touch", isPrimary: true, bubbles: true,
        clientX: r.left + r.width * 0.6 + dx, clientY: r.top + r.height * 0.6, buttons: 1 }));
    }
    el.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 91002, pointerType: "touch", isPrimary: true, bubbles: true }));
  });
  led.sig_after_rotation = await page.evaluate(f => eval(f)(), GL_SIG);
  expect((led.sig_after_rotation as any).sum).not.toBe((led.sig_before as any).sum);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "orbit_begin_invariance.json"), JSON.stringify({
    spec: "5차 지시 2 — 궤도 시작 불변: 손가락을 대기만 하면 화면이 같고(GL 서명 동일), 죽은 구간을 넘겨도 시선 변화가 미소 회전뿐이다(재조준 없음 — retarget이 중심을 시선 위로 투영).",
    what_this_does_not_say: [
      "GL 서명은 칠해진 픽셀 수 + 성긴 체크섬이다 — 완전한 프레임 대조가 아니다(같은 서명의 다른 프레임이 이론상 가능하나 재조준 크기의 변화는 못 지나간다)",
      "시선 변화 1.5°는 **연속 회전과 재조준(실측 9.78° — 되살림 실행)을 가르는 배선 임계**다(#24 프레임: 도 단위) — 미소 회전의 정밀 검증이 아니다. 연속 회전의 실측은 gaze_change_deg 필드를 읽는다(감쇠·죽은 구간 소비로 명목 2px보다 작다, 재검 [2-7] — 5차 0.24°·10차 0.43°: 가드로 lifted 집합·궤도 중심이 옮겨 가며 함께 움직였다)",
      "**되살림 확인(A-4)의 9.78°는 원장 밖이다**(#25 — 커밋되지 않는 임시 판이라 재현 불가). progress·D-L65 산문에만 있다",
      "GL 서명 불변의 양성 채널은 sig_after_rotation(더 돌린 뒤 서명이 움직임 — #30)이다",
      "dpr 1·합성 터치다(#21·AS-C1) — 실기(아이패드) 확인은 K의 문이다",
      "한 구도(눈높이 위 상자)·중심 한 점의 확인이다(#12)",
    ],
    thresholds: { gaze_change_deg_max: 1.5, console_errors_max: 0 },
    gate: {
      registered: "터치 다운(이동 0)에서 GL 서명 동일 · 죽은 구간을 넘긴 두 번째 이동(begin 실개방 — isPinned 해제 확인 #32)에서 시선 변화 <1.5°(재조준이면 실패) · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 이동 0의 화면 불변은 설계 보장(#5 — 죽은 구간이 begin을 안 연다)이고, 판정은 그 배선(재조준 부재)이다",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 5차 지시 3 — 스냅된 수평선은 묻지 않는다
//
// 축 스냅으로 화면 수평이 된 선은 사용자가 수평을 **의도한** 것이다 — 묻지 않고 그 축으로
// 확정한다(3-a). 판정(물음)의 대상은 스냅이 안 걸린 자유 선뿐이다(3-b).
// ⛔⛔ **12차 지시 4-a(D-L89)로 계약이 다시 뒤집혔다**: 스냅이 잡은 가로선은 **묻지 않고**
// P1을 확정한다("붙은 것은 묻지 않는다"). 7차의 우회 우려(D-L70)와 다른 이유는
// kindFlipGuard(D-L80)다 — 원 방향이 depth인 획에는 직교 스냅이 안 걸리므로,
// hint "screen"은 원 방향이 화면 축 대역(≤4°)인 획에만 붙는다.
test("스냅된 수평선 — 묻지 않고 P1이 선다 (12차 지시 4-a · D-L89)", async ({ page }) => {
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

  // ---- ① 깊이선 둘 → 소실점이 선다(아직 가로축 없음 — 물음 가드가 있던 그 상태)
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  // **셋째 지지선**(6차 지시 11) — 위 둘의 교점 (0.6204W, 0.58H)를 지난다
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  led.vp_state = await page.evaluate(() => {
    const S = window.S2S;
    return { vps: S.cam.vps().filter((v: unknown) => v).length,
             order: S.order(), asked: S.askStats().asked };
  });
  expect((led.vp_state as any).vps).toBe(1);               // 소실점 하나가 서 있다

  // ---- ② **거의 수평선**(1.7° — 직교 스냅 4° 안)을 긋는다 → **묻지 않고 P1이 선다**
  //      (12차 지시 4-a — D-L89 "붙은 것은 묻지 않는다"). 스냅 발동 = 사용자의 수평 의도이고
  //      그 hint가 P1 가드를 지난다. kindFlipGuard(D-L80)가 원 방향 depth의 우회를 스냅
  //      단계에서 이미 막으므로 D-L70의 붕괴 기전(조용한 방향 뒤집기)은 못 돌아온다.
  await drawPx(0.25 * W, 0.55 * H, 0.45 * W, 0.556 * H);
  led.after = await page.evaluate(() => {
    const S = window.S2S;
    return { ask: S.ask(), asked: S.askStats().asked, order: S.order(),
             standing: S.standing() };
  });
  // **물음이 없다** — 스냅이 곧 화면 축 판정이다(지시 4-b: 화면 축 판정은 스냅 단계에서만)
  expect((led.after as any).ask).toBeFalsy();
  expect((led.after as any).asked).toBe((led.vp_state as any).asked);
  // **P1이 그 자리에서 섰다** — 답을 기다리지 않는다
  expect((led.after as any).order).toBe(1);
  expect((led.after as any).standing).toBe(true);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "snap_declare.json"), JSON.stringify({
    spec: "**12차 지시 4-a(D-L89)로 다시 뒤집혔다** — 직교 스냅이 잡은 수평선은 **묻지 않고 P1을 확정한다**('붙은 것은 묻지 않는다'). 연혁: 5차 '스냅이 곧 선언'(D-L56) → 7차 물음 복원(D-L70 — snapForced가 원 방향 depth까지 뒤집어 P1에 가뒀다) → 12차 무물음 확정(D-L89 — kindFlipGuard(D-L80)가 방향 뒤집기를 스냅 단계에서 막으므로 hint 'screen'은 원 방향 ≤4°에만 붙는다. 그래서 7차가 막은 붕괴 기전과 다른 문이다). Playwright 신뢰 이벤트·콘솔 오류 0",
    what_this_does_not_say: [
      "**이 팔은 '스냅된 가로선의 무물음 P1'만 잰다.** 차수 분포와 배치의 몫은 `order_lock.json`의 `arms.fixed`/`arms.bypass`가 든다 — 수치는 그 원장의 `arms.*.headline.order_counts`·`first_declaration`을 그 자리에서 읽는다(⚠ 3차 리뷰어 [3]: 옛 산문이 남의 원장 수치(519→499·497/600)를 박았고 셋 다 현행에 없었다 — #47. 산문에 수를 안 박는다)",
      "**되살림 확인(A-4)**: `stepRule`의 P1 가드에서 `hint !== \"screen\"` 조건을 지우면(7차 판 복원) ②의 '물음 없음' 기대가 실패한다 — 그 조건이 이 팔의 판정 대상이다",
      "**이 팔은 스냅이 잡은 가로선만 잰다** — 스냅이 안 걸린(수정자·토글 끔) 가로선의 물음은 남아 있고 그 잔여 경로는 이 원장이 안 덮는다",
      "한 각도(1.7°)의 확인이다(#12) — 직교 임계(4°) 경계는 test/axisSnap 반례가 덮는다",
      "dpr 1·마우스 합성이다(#21·AS-C1)",
    ],
    thresholds: { console_errors_max: 0 },
    gate: {
      registered: "소실점이 선 상태에서 4° 안 수평선을 그으면(직교 스냅 발동) **묻지 않고**(askStats 불변) **P1이 그 자리에서 선다**(order 1·standing). 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 물음 발생은 설계 선언이고(#5) 판정은 그 배선이다",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 5차 지시 4 — 궤적선 제거
//
// 그리는 동안 **스냅된 미리보기 하나만** 보인다 — 원시 스타일러스 궤적(시작→커서 직선)은
// 스냅이 걸린 동안 숨는다. 자유 선일 때만 궤적이 그대로 미리보기다.
test("그리는 중 — 스냅이 걸리면 궤적선이 안 보인다 (5차 지시 4)", async ({ page }) => {
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
  const led: Record<string, unknown> = {};

  // 잉크 캔버스의 한 점 주변(±1px) 알파 픽셀 수
  const INK_AT = `((sx, sy) => {
    const el = document.getElementById("ink");
    const dpr = el.width / el.getBoundingClientRect().width;
    const d = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    const cx = Math.round(sx * dpr), cy = Math.round(sy * dpr);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((cy + dy) * el.width + (cx + dx)) * 4 + 3;
      if (i >= 0 && i < d.length && d[i] > 30) n++;
    }
    return n;
  })`;

  // ---- 거의 수평(2.3° — 직교 스냅 안)으로 **끌던 중**: 스냅 선(수평)만 보이고 궤적은 숨는다
  const x1 = 0.25 * W, y1 = 0.55 * H, x2 = 0.55 * W, y2 = y1 + 12;
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + x1 + (x2 - x1) * i / 8, box.y + y1 + (y2 - y1) * i / 8);
  }
  led.mid = await page.evaluate(({ fn, px, py, rx, ry }) => {
    const S = window.S2S;
    // eslint-disable-next-line no-eval
    const at = eval(fn);
    return { engaged: !!S.live2d(), preview_ink: at(px, py), raw_ink: at(rx, ry) };
  }, { fn: INK_AT, px: (x1 + x2) / 2, py: y1, rx: (x1 + x2) / 2, ry: y1 + 6 });
  // **스냅이 걸려 있다** — 이 팔의 전제(#38: 안 걸렸으면 공허하다)
  expect((led.mid as any).engaged).toBe(true);
  expect((led.mid as any).preview_ink).toBeGreaterThan(0);   // 스냅된 수평 미리보기가 보인다
  expect((led.mid as any).raw_ink).toBe(0);                  // **궤적(6px 아래)은 안 보인다**
  await page.mouse.up();
  await page.waitForTimeout(50);

  // ---- 자유 선(약 22°)은 궤적이 그대로 미리보기다(지시 4 둘째 문장)
  const fy1 = y1 + 0.05 * H, fy2 = y1 + 0.18 * H;
  await page.mouse.move(box.x + x1, box.y + fy1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + x1 + (0.3 * W) * i / 8, box.y + fy1 + (fy2 - fy1) * i / 8);
  }
  led.free = await page.evaluate(({ fn, mx, my }) => {
    const S = window.S2S;
    // eslint-disable-next-line no-eval
    const at = eval(fn);
    return { engaged2d: !!S.live2d(), mid_ink: at(mx, my) };
  }, { fn: INK_AT, mx: x1 + 0.15 * W, my: (fy1 + fy2) / 2 });
  expect((led.free as any).mid_ink).toBeGreaterThan(0);      // **자유 선은 궤적이 보인다**
  await page.mouse.up();
  await page.waitForTimeout(50);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "trace_hidden.json"), JSON.stringify({
    spec: "5차 지시 4 — 그리는 중 스냅이 걸리면 원시 궤적선이 숨고 스냅된 미리보기 하나만 보인다. 자유 선은 궤적이 그대로 미리보기다. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "확정 전(live2d) 경로의 확인이다 — 확정 후(live.seg — 3D 축 스냅 미리보기)의 숨김은 같은 스위치(liveHidden)를 지나지만 이 팔은 안 잰다(#12)",
      "한 각도(2.3°)·한 이탈(12px)의 확인이다(#12)",
      "dpr 1·마우스 합성이다(#21·AS-C1)",
      "**되살림 확인(A-4)의 값은 원장 밖이다**(#25 — 숨김 스위치를 빼면 raw_ink 0 단언이 실패하는 것을 확인하고 복원했다)",
      "겨냥 끝점의 이탈은 12px·프로브 지점(중점)의 이탈은 6px이다 — 두 수는 같은 획의 다른 자리다(재검 표기 지적)",
    ],
    thresholds: { raw_ink_max: 0, aim_end_offset_px: 12, probe_offset_px: 6, console_errors_max: 0 },
    gate: {
      registered: "스냅이 걸린 끌기 중 원시 궤적 자리(수평에서 6px 이탈점)의 잉크 0 · 스냅 미리보기 자리 잉크 >0 · engaged 참(#38 — 스냅이 실제로 걸렸다) · 자유 선의 궤적 잉크 >0 · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 숨김은 표시 스위치의 보장이고(#5) 판정은 그 배선이다",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 5차 지시 5·6 — 지우개 크기·배치
//
// 프로크리에이트식 배치(6): 도구·채널은 상단 우측 묶음(#tools), 크기 슬라이더는 좌측
// 사이드바(#side — 지우개 도구일 때만), 하단바에는 파일·표시 토글만. 지우개 크기(5)는
// 화면 px이고 슬라이더가 실제 지우기 반경을 바꾼다.
test("지우개 크기·도구 배치 — 슬라이더가 반경을 바꾸고 묶음이 상단 우측에 있다 (5차 지시 5·6)", async ({ page }) => {
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

  // ---- ⑥ 배치: 도구·채널·실행취소가 #tools에, 하단바에는 없다. 사이드바는 그리기 땐 숨김
  led.layout = await page.evaluate(() => ({
    tools_in_cluster: ["draw", "erase_seg", "erase_part", "edit", "ch_guide", "ch_result", "ch_note", "undo"]
      .map(a => !!document.querySelector(`#tools button[data-act="${a}"]`)),
    tools_in_bar: ["draw", "erase_seg", "erase_part", "edit", "undo"]
      .map(a => !!document.querySelector(`#bar button[data-act="${a}"]`)),
    file_in_bar: ["json", "obj", "gltf", "clear", "menu"]
      .map(a => !!document.querySelector(`#bar button[data-act="${a}"]`)),
    side_hidden: document.getElementById("side")!.classList.contains("hidden"),
  }));
  expect((led.layout as any).tools_in_cluster.every(Boolean)).toBe(true);
  expect((led.layout as any).tools_in_bar.some(Boolean)).toBe(false);
  expect((led.layout as any).file_in_bar.every(Boolean)).toBe(true);
  expect((led.layout as any).side_hidden).toBe(true);

  // ---- 확정 상태 + 3D 획 하나(부분 지우개의 대상)
  await drawPx(0.25 * W, 0.30 * H, 0.45 * W, 0.301 * H);
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  // **셋째 지지선**(6차 지시 11) — 위 둘의 교점 (0.6204W, 0.58H)를 지난다
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  const ready = await page.evaluate(() => ({
    standing: window.S2S.standing(),
    lifted: window.S2S.doc().strokes.filter((s: any) => s.seg3d).length }));
  expect(ready.standing).toBe(true);
  // ⚠ 4 → 3의 사유는 이 파일 위쪽 "궤도 시작" 팔의 주석과 같다(D-L83 되살림 —
  // 무연결 지지선은 대기한다. 4가 다시 나오면 임의 배치의 회귀다).
  expect(ready.lifted).toBe(3);

  // ---- ⑤ 지우개 도구 → 사이드바가 보이고, 슬라이더가 ERASER.px를 바꾼다
  await page.click('#tools button[data-act="erase_part"]');
  led.side_visible = await page.evaluate(() =>
    !document.getElementById("side")!.classList.contains("hidden"));
  expect(led.side_visible).toBe(true);
  await page.evaluate(() => {
    const r = document.querySelector('#side input[data-eraser-size]') as HTMLInputElement;
    r.value = "6";
    r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  led.eraser_after_slider = await page.evaluate(() => window.S2S.eraser().px);
  expect(led.eraser_after_slider).toBe(6);

  // ---- 반경이 실제로 지우기를 가른다: 획에서 12px 떨어진 자리 —
  //      6px 지우개는 못 닿고, 30px 지우개는 닿는다(화면 px 기준, 지시 5)
  const target = await page.evaluate(() => {
    const S = window.S2S, fr = S.doc().strokes.find((s: any) => s.seg3d && s.axis === 0);
    return fr.id;
  });
  const probe = { x: 0.35 * W, y: 0.30 * H + 12 };   // 가로 획(0.30H)에서 12px 아래
  const pieces = () => page.evaluate(() => window.S2S.doc().strokes.length);
  led.n_before = await pieces();
  await drawPx(probe.x, probe.y, probe.x + 8, probe.y);   // 6px 지우개로 문지른다
  led.n_small = await pieces();
  expect(led.n_small).toBe(led.n_before);                 // **못 닿았다**(반경 6 < 거리 12)
  await page.evaluate(() => window.S2S.setEraser(30));
  await drawPx(probe.x, probe.y, probe.x + 8, probe.y);   // 30px 지우개
  led.n_large = await pieces();
  expect(led.n_large as number).not.toBe(led.n_before);   // **닿았다**(반경 30 > 거리 12)

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "eraser_size.json"), JSON.stringify({
    spec: "5차 지시 5·6 — 지우개 크기 슬라이더(좌측 사이드바, 화면 px)가 실제 반경을 바꾸고, 도구·채널·실행취소는 상단 우측 묶음(#tools)·하단바에는 파일·표시 토글만. Playwright 신뢰 이벤트·콘솔 오류 0",
    what_this_does_not_say: [
      "반경 판정은 두 동작점(6px 못 닿음·30px 닿음, 거리 12px)의 확인이다(#12) — 경계 정밀도는 안 잰다",
      "아이패드 실기(손 가림 6-e)·dpr 2 확인은 K의 문이다(#21)",
      "부분 지우개 경로의 확인이다 — 조각 지우개의 반경(pickStroke rPx)은 같은 ERASER.px를 읽는다(코드 경로 확인, 실행 팔 없음)",
    ],
    thresholds: { eraser_small_px: 6, eraser_large_px: 30, probe_offset_px: 12, console_errors_max: 0 },
    gate: {
      registered: "도구·채널·실행취소가 #tools에 있고 #bar에는 없다 · 파일·메뉴는 #bar에 있다 · 지우개 도구에서 사이드바가 보이고 슬라이더가 ERASER.px를 바꾼다 · 반경 6px는 12px 거리의 획을 못 지우고 30px는 지운다 · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 반경이 지우기를 가르는 것은 erasePartSample의 정의이고(#5) 판정은 그 배선(슬라이더→ERASER→반경)이다",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 5차 지시 7 — 시점 저장·실행취소 분리
//
// 7-1: 돌려 보던 각도를 "시점"으로 저장하고, 목록에서 누르면 **날아서** 돌아온다(라이노
// 명명된 뷰의 관행 — 이름만 부드럽게). 7-2: 실행취소는 **그림만** 되돌린다 — 돌린 카메라가
// 실행취소로 튀면 안 된다(되살린 버그: restoreSnap이 무조건 pinTo).
test("시점 저장·복귀 — 실행취소는 카메라를 안 건드린다 (5차 지시 7)", async ({ page }) => {
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
  const CAM = `(() => {
    const c = window.S2S.stage.viewport.camera;
    c.updateMatrixWorld(true);
    return { p: [c.position.x, c.position.y, c.position.z],
             q: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
             pinned: window.S2S.stage.isPinned };
  })`;
  const led: Record<string, unknown> = {};
  // **감쇠 정착 대기** — OrbitControls의 관성(dampingFactor 0.12)이 제스처 뒤에도 몇 프레임
  // 카메라를 움직인다. 카메라 불변을 재려면 먼저 멈춰야 한다(#7 — 0.08 이동의 정체가 이것이었다)
  const settle = async () => {
    let prev = await page.evaluate(c => eval(c)(), CAM);
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(100);
      const cur = await page.evaluate(c => eval(c)(), CAM);
      const d = Math.hypot(...(prev as any).p.map((v: number, k: number) => v - (cur as any).p[k]));
      prev = cur;
      if (d < 1e-10) break;
    }
    return prev;
  };

  // 확정 상태(눈높이 위 구도 — lifted 3)
  await drawPx(0.25 * W, 0.30 * H, 0.45 * W, 0.301 * H);
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  // **셋째 지지선**(6차 지시 11) — 위 둘의 교점 (0.6204W, 0.58H)를 지난다
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  expect(await page.evaluate(() => window.S2S.standing())).toBe(true);

  // ---- 돌린다(터치 한 손가락 — 항목 2 팔과 같은 경로)
  await page.evaluate(() => {
    const el = document.getElementById("ink")!;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 92001, pointerType: "touch", isPrimary: true, bubbles: true,
      clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.6, buttons: 1 }));
    for (const dx of [15, 45, 90]) {
      el.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 92001, pointerType: "touch", isPrimary: true, bubbles: true,
        clientX: r.left + r.width * 0.6 + dx, clientY: r.top + r.height * 0.6, buttons: 1 }));
    }
    el.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 92001, pointerType: "touch", isPrimary: true, bubbles: true }));
  });
  led.orbited = await settle();                              // 감쇠가 멎은 자세
  expect((led.orbited as any).pinned).toBe(false);

  // ---- 7-1a: 시점 저장 — 목록에 pose 있는 "시점 1"이 는다
  const viewsBefore = await page.evaluate(() => window.S2S.doc().views.length);
  await page.click("#views button[data-saveview]");
  led.saved = await page.evaluate(() => {
    const d = window.S2S.doc();
    const v = d.views[d.views.length - 1];
    return { n: d.views.length, name: v.name, hasPose: !!v.pose, current: d.currentView === v.id };
  });
  expect((led.saved as any).n).toBe(viewsBefore + 1);
  expect((led.saved as any).name).toBe("시점 1");
  expect((led.saved as any).hasPose).toBe(true);

  // ---- 7-2: 그리고 → 실행취소 → **카메라가 그대로다**(d의 반례 검사)
  await drawPx(0.30 * W, 0.55 * H, 0.42 * W, 0.552 * H);   // 돌린 시점에서 한 획(L-B.8)
  const nStrokes = await page.evaluate(() => window.S2S.doc().strokes.length);
  led.before_undo = await settle();
  await page.click('#tools button[data-act="undo"]');
  await page.waitForTimeout(60);
  led.after_undo = await page.evaluate(c => eval(c)(), CAM);
  led.strokes_after_undo = await page.evaluate(() => window.S2S.doc().strokes.length);
  expect(led.strokes_after_undo).toBe(nStrokes - 1);        // 그림은 되돌아갔다
  const b = led.before_undo as any, a = led.after_undo as any;
  const dp = Math.hypot(...b.p.map((v: number, i: number) => v - a.p[i]));
  const dq = Math.hypot(...b.q.map((v: number, i: number) => v - a.q[i]));
  led.cam_moved = { dp, dq };
  expect(a.pinned).toBe(false);                              // **다시 물리지 않았다**
  expect(dp).toBeLessThan(1e-9);                             // **카메라가 그대로다**(7-2d)
  expect(dq).toBeLessThan(1e-9);

  // ---- 7-1b: 확정 시점으로 **날아서** 복귀 → 그 뒤 시점 1로 날아서 복귀
  await page.click(`#views button[data-view="v1"]`);
  await page.waitForTimeout(500);                            // 비행 280ms + 마무리
  led.at_confirm = await page.evaluate(c => eval(c)(), CAM);
  expect((led.at_confirm as any).pinned).toBe(true);         // 확정 시점에 물렸다
  const savedId = await page.evaluate(() => {
    const d = window.S2S.doc();
    return d.views.find((v: any) => v.name === "시점 1")!.id;
  });
  await page.click(`#views button[data-view="${savedId}"]`);
  await page.waitForTimeout(500);
  led.at_saved = await settle();
  const s2 = led.at_saved as any, o = led.orbited as any;
  led.return_gap = Math.hypot(...o.p.map((v: number, i: number) => v - s2.p[i]));
  expect((led.at_saved as any).pinned).toBe(false);
  expect(led.return_gap as number).toBeLessThan(1e-3);       // **저장한 자세로 돌아왔다**

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "viewpoint_undo.json"), JSON.stringify({
    spec: "5차 지시 7 — 시점 저장(자세 보존·기본 이름 번호)·목록 복귀(비행 후 자세 일치)·실행취소는 그림만(획 수 −1, 카메라 위치·방향 불변, 재물림 없음). Playwright 신뢰 이벤트·콘솔 오류 0",
    what_this_does_not_say: [
      "비행 중 프레임의 품질(투영 전환 시점)은 안 잰다 — 도착 자세 일치(<1e-3)만 판정한다(#12)",
      "이름 바꾸기(✎·prompt)는 합성 클릭으로 안 잰다 — prompt는 Playwright 대화상자 처리라 별도 팔이 필요하고, 기본 이름 경로가 본체다",
      "실행취소가 **확정 자체를 되돌리는** 경우(카메라가 안 서게 됨 — 물림 해제 경로)는 이 팔 밖이다(코드 경로: restoreSnap의 !c && isPinned → unpin)",
      "**되살림 확인(A-4)의 값은 원장 밖이다**(#25 — restoreSnap을 무조건 pinTo로 되돌리면 이 팔이 실패하는 것을 확인하고 복원했다)",
      "dpr 1·합성 터치다(#21·AS-C1)",
    ],
    thresholds: { cam_delta_max: 1e-9, return_gap_max: 1e-3, console_errors_max: 0 },
    gate: {
      registered: "돌린 뒤 시점 저장 → 이름 '시점 1'·pose 보존 · 그리고 실행취소 → 획 수 −1이고 카메라 위치·방향 변화 <1e-9·재물림 없음(7-2 — 되살린 버그: restoreSnap 무조건 pinTo) · 확정 시점 복귀 후 pinned · 저장 시점 복귀 후 자세 오차 <1e-3 · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 자세 보존·복귀는 자료구조(§9.2)의 보장이고(#5) 판정은 그 배선(저장 버튼→뷰→비행→복귀)이다",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 6차 지시 1 — 3D 뷰 큐브
//
// 면 = 1점 시점(피치 0) · 꼭짓점 = 3점 시점 · 드래그 = 연속 요 회전(수직축 고정) ·
// 화살표 = 상대 90°(피치 유지) · 재탭 = 가장 가까운 1점(피치 0·중심 조준·거리 유지).
// 차수 판정은 vps_finite(유한 소실점 가족 수 — |축·시선| > 0.05): 1점=1 · 2점=2 · 3점=3.
import { CUBE_TOL } from "../src/ui/viewCube.js";

/** 피치≠0 전제의 문턱(재검 [5]·8-R″ [M4]) — 원장 thresholds로 등록된다. */
const FY_NONZERO_MIN = 0.02;
test("3D 뷰 큐브 — 면=1점 스냅·꼭짓점=3점·드래그 연속·상대 90°·재탭=가장 가까운 1점 (6차 지시 1)", async ({ page }) => {
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
  const STATE = `(() => {
    const S = window.S2S;
    const c = S.stage.viewport.camera;
    c.updateMatrixWorld(true);
    const v = c.getWorldDirection(new (c.position.constructor)());
    const V3 = c.position.constructor;
    // 유한 소실점 가족 수 — 세계 축(three x·y·z)이 화면과 나란하지 않으면 유한(이론서 2.2 c=0)
    const fam = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];
    const finite = fam.filter(a => Math.abs(a.dot(v)) > 0.05).length;
    // 수평 축 두 가족의 소실점이 화면 안에 몇 개인가(5차와 같은 프로브 — far 평면 안 500)
    const inside = (dir) => {
      for (const s of [1, -1]) {
        const far = c.position.clone().addScaledVector(dir, s * 500);
        const nd = far.project(c);
        if (nd.z < 1 && Math.abs(nd.x) <= 1 && Math.abs(nd.y) <= 1) return true;
      }
      return false;
    };
    const nInside = [new V3(1, 0, 0), new V3(0, 0, 1)].filter(inside).length;
    // 궤도 중심(우리 규약 → three)까지의 거리와 조준 각
    const oc = S.orbitCenter();
    const c3 = new V3(oc[0], -oc[1], -oc[2]);
    const toC = c3.clone().sub(c.position);
    const dist = toC.length();
    const aimDeg = Math.acos(Math.max(-1, Math.min(1, toC.normalize().dot(v)))) * 180 / Math.PI;
    return { yaw: S.cubeYaw(), fy: v.y, pinned: S.stage.isPinned,
             vps_finite: finite, vps_inside: nInside, dist, aim_deg: aimDeg,
             pos: [c.position.x, c.position.y, c.position.z],
             cube_on: S.viewCube().on,
             cube_hidden: document.getElementById("cube").classList.contains("hidden") };
  })`;
  const led: Record<string, unknown> = {};
  const settle = async () => {
    let prev = await page.evaluate(c => eval(c)(), STATE);
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(100);
      const cur = await page.evaluate(c => eval(c)(), STATE);
      // 요·수직 성분·위치 셋 다 본다 — 요만 보면 수직 감쇠 꼬리를 놓친다(8-R″ [M5]의 자리)
      const d = Math.abs((prev as any).yaw - (cur as any).yaw)
              + Math.abs((prev as any).fy - (cur as any).fy)
              + Math.hypot(...(prev as any).pos.map((x: number, k: number) => x - (cur as any).pos[k]));
      prev = cur;
      if (d < 1e-10) break;
    }
    return prev;
  };
  /** 90° 격자에서의 이탈(°) — 요가 세계 축 정렬인지. */
  const offGrid = (yawRad: number) => {
    const deg = (yawRad * 180) / Math.PI;
    return Math.abs(deg - Math.round(deg / 90) * 90);
  };
  const wrapDeg = (a: number) => Math.abs(((a + 540) % 360) - 180);

  // 확정 상태(1점 — 눈높이 위 구도, lifted 3)
  await drawPx(0.25 * W, 0.30 * H, 0.45 * W, 0.301 * H);
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  // **셋째 지지선**(6차 지시 11) — 위 둘의 교점 (0.6204W, 0.58H)를 지난다
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  // **피치를 먼저 준다**(재검 [5] — 확정 카메라는 fy=0이라 그 상태로는 '수직축 고정'과
  // '국소 up 회전'이 같은 결과다. 아래로 15px 돌려 fy≠0을 만든 뒤에 재야 판별이 산다)
  await page.evaluate(() => {
    const el = document.getElementById("ink")!;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", {
      pointerId: 93001, pointerType: "touch", isPrimary: true, bubbles: true,
      clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.6, buttons: 1 }));
    for (const dy of [6, 15]) {
      el.dispatchEvent(new PointerEvent("pointermove", {
        pointerId: 93001, pointerType: "touch", isPrimary: true, bubbles: true,
        clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.6 + dy, buttons: 1 }));
    }
    el.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 93001, pointerType: "touch", isPrimary: true, bubbles: true }));
  });
  led.before = await settle();
  expect(Math.abs((led.before as any).fy)).toBeGreaterThan(FY_NONZERO_MIN);  // **피치≠0 — 판별의 전제**
  expect((led.before as any).cube_on).toBe(true);            // 기본 켬(지시 1-5)
  expect((led.before as any).cube_hidden).toBe(false);       // 확정 후 보인다

  const cube = (await page.locator("#cube").boundingBox())!;
  const cx = cube.x + cube.width / 2, cy = cube.y + cube.height / 2;
  const S_PX = cube.width * 0.22;                            // 큐브 반변(viewCube.scale과 같은 식)

  // **요 전제**(8-R″ 재검 [1] — 요 0에서 면 탭하면 '격자 복귀'가 자명하다 #40 ②):
  // 큐브 드래그로 요를 격자 밖으로 틀어 두고, 면 탭이 격자로 **되돌리는지** 잰다
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy, { steps: 5 });
  await page.mouse.up();
  led.before_face = await settle();
  expect(offGrid((led.before_face as any).yaw)).toBeGreaterThan(1);   // 격자 밖에서 출발한다
  expect(Math.abs((led.before_face as any).fy)).toBeGreaterThan(FY_NONZERO_MIN);

  // ---- ① 면 탭(가운데) = **1점 스냅**: 피치가 0으로, 요는 90° 격자로, 중심 조준·거리 유지
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(350);
  led.after_face = await settle();
  expect(Math.abs((led.after_face as any).fy)).toBeLessThan(1e-6);          // **피치 0**(0.02↑에서 내려왔다)
  expect(offGrid((led.after_face as any).yaw)).toBeLessThan(0.5);           // 격자 **복귀**(1°↑ 밖에서 왔다)
  expect((led.after_face as any).vps_finite).toBe(1);                       // **1점** — 유한 소실점 가족 1
  expect((led.after_face as any).vps_inside).toBe(1);                       // 그 소실점이 화면 안에 1개
  // 기준은 **탭 직전** 상태다 — 사전 드래그(spinYaw)는 시선 투영점 둘레 회전이라
  // 경계 상자 중심까지의 거리가 바뀔 수 있다(투영점 ≠ 중심). 스냅이 보존하는 것은
  // '스냅 시작 시점의 중심 거리'다(stage.snapToDir의 규약).
  expect(Math.abs((led.after_face as any).dist - (led.before_face as any).dist)
         / (led.before_face as any).dist).toBeLessThan(1e-6);               // **거리 유지**
  expect((led.after_face as any).aim_deg).toBeLessThan(0.5);                // **궤도 중심 조준**

  // ---- ② 꼭짓점 탭(우상 0.8·0.8) = **3점 스냅**: 피치 ±35.26° · 유한 소실점 3
  await page.mouse.click(cx + 0.8 * S_PX, cy - 0.8 * S_PX);
  await page.waitForTimeout(350);
  led.after_vertex = await settle();
  expect(Math.abs(Math.abs((led.after_vertex as any).fy) - 1 / Math.sqrt(3))).toBeLessThan(0.02);
  expect((led.after_vertex as any).vps_finite).toBe(3);                     // **3점**
  expect(Math.abs((led.after_vertex as any).dist - (led.after_face as any).dist)
         / (led.after_face as any).dist).toBeLessThan(1e-6);

  // ---- ③ 드래그 = 연속 요 회전(수직축 고정 — 피치 ≠ 0 상태에서 fy 불변이 판별이다, 재검 [5])
  expect(Math.abs((led.after_vertex as any).fy)).toBeGreaterThan(FY_NONZERO_MIN);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy, { steps: 5 });
  await page.mouse.up();
  led.after_drag = await settle();
  const dragYaw = wrapDeg(((led.after_drag as any).yaw - (led.after_vertex as any).yaw) * 180 / Math.PI);
  led.drag_deg = dragYaw;
  expect(dragYaw).toBeGreaterThan(1);                        // 실제로 돌았다(#38 — 공허 방지)
  expect(dragYaw).toBeLessThan(45);                          // 90° 스냅이 아니라 연속이다
  expect(Math.abs((led.after_drag as any).fy - (led.after_vertex as any).fy)).toBeLessThan(1e-6);

  // ---- ④ 상대 90° 화살표(지시 1-2) — 요만 +90°, **피치 유지**(절대 스냅과의 판별)
  await page.mouse.click(cube.x + cube.width - 6, cy);
  await page.waitForTimeout(350);
  led.after_arrow = await settle();
  const arrowYaw = wrapDeg(((led.after_arrow as any).yaw - (led.after_drag as any).yaw) * 180 / Math.PI);
  led.arrow_deg = arrowYaw;
  expect(Math.abs(arrowYaw - 90)).toBeLessThan(0.5);
  expect(Math.abs((led.after_arrow as any).fy - (led.after_drag as any).fy)).toBeLessThan(1e-6);

  // ---- ⑤ 재탭(가운데) = **가장 가까운 1점**(지시 1-3) — 3점 시점에서 탭 한 번에 1점 복귀
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(350);
  led.after_retap = await settle();
  expect(Math.abs((led.after_retap as any).fy)).toBeLessThan(1e-6);         // 피치 0
  expect(offGrid((led.after_retap as any).yaw)).toBeLessThan(0.5);          // 가장 가까운 세계 축
  expect((led.after_retap as any).vps_finite).toBe(1);                      // 다시 1점
  expect(Math.abs((led.after_retap as any).dist - (led.after_arrow as any).dist)
         / (led.after_arrow as any).dist).toBeLessThan(1e-6);               // 거리 유지
  expect((led.after_retap as any).aim_deg).toBeLessThan(0.5);               // 중심 조준

  // ---- ⑥ 토글(지시 1-5) — 끄면 숨는다
  await page.evaluate(() => {
    (document.querySelector('#bar button[data-act="menu"]') as HTMLButtonElement).click();
  });
  await page.click('#bar button[data-act="viewcube"]');
  led.toggled = await page.evaluate(() =>
    new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() =>
      res(document.getElementById("cube")!.classList.contains("hidden"))))));
  expect(led.toggled).toBe(true);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "view_cube.json"), JSON.stringify({
    spec: "6차 지시 1 — 3D 뷰 큐브: 면 탭=1점 스냅(피치 0·요 90° 격자·중심 조준·거리 유지), 꼭짓점 탭=3점(피치 ±35.26°·유한 소실점 3), 드래그=연속 요 회전(수직축 고정·fy 불변), 화살표=상대 90°(피치 유지), 재탭=가장 가까운 1점, 토글. Playwright 신뢰 이벤트·콘솔 오류 0",
    what_this_does_not_say: [
      "모서리(2점) 탭 팔이 없다 — 분류기의 모서리 밴드는 vitest(view_cube_hit.test.ts)가 잰다. 종단은 면·꼭짓점·재탭 셋이고 2점 시점 종단은 한 동작점 아낌이다(#12 — 모서리 배선은 면·꼭짓점과 같은 snap 경로 하나다 #17)",
      "**도착 요·피치·거리·조준은 설계 보장이다**(8-R″ [M8]·재검 [6] — snapToDir가 중심을 겨눈 목표 자세를 해석적으로 대입하고 flyTo·setPose가 그 자세로 끝난다. **상대 회전(spinYaw)도 정확한 델타 대입이다** — arrow_deg가 정확히 90, aim_deg가 정확히 0으로 찍히는 것이 그 보장의 표시다). 임계(0.5°·1e-6)는 측정이 아니라 **배선 확인**이다 — 이 팔이 재는 것은 '올바른 목표가 계산되어 카메라에 실제로 실렸는가'다(§5 유형 3: 보장이라 적고 측정이라 주장하지 않는다). 판별력이 있는 값은 **움직인 것들**이다: fy 0.084→0(면 탭)·0→0.577(꼭짓점), 요 격자 밖 1°↑→격자(면 탭·재탭), 드래그 13.75°",
      "fy_before_min(0.02)의 출처(8-R″ 재검 [8]): 8-R′ [5]가 등록한 값 그대로 — 궤도 15px 입력이 만드는 fy(≈0.08)의 1/4 아래·감쇠 꼬리 잡음(1e-10대)의 여덟 자리 위에 둔 **임의 문턱**이다(#26 — 측정 전에 박았다. 정밀 측정값이 아니다)",
      "**피치≠0을 먼저 만든다**(재검 [5]·8-R″ [M4]) — 확정 카메라(fy=0)에서 면 탭의 '피치 0'은 공허하다. fy가 문턱(fy_before_min) 위에서 1e-6 아래로 **움직이는 것**이 양성 채널이고, 그 문턱은 thresholds에 등록했다",
      "settle은 이 스펙의 지역 헬퍼다(8-R″ [M5]) — 요·시선 수직 성분·카메라 위치 셋의 수렴을 본다(요만 보면 수직 감쇠 꼬리를 놓친다). viewpoint_undo의 settle은 위치 3성분을 보는 별개 지역 함수다",
      "vps_finite는 세계 축 세 가족의 시선 내적 판정(기하 계산)이지 그린 선의 실측 수렴점이 아니다(#5에 가까움) · vps_inside는 5차와 같은 화면 안 투영 프로브다",
      "드래그 팔의 하한(1°)은 공허 방지다(#38 — 안 돌았으면 이 팔은 아무것도 안 잰 것이다)",
      "판정 좌표는 전부 three 세계 축이다(#24 — basisOf·cubeHit·STATE 프로브가 같은 규약으로 닫힌다. 각은 yaw rad 원장 필드에 도(°) 파생 병기)",
      "한 구도·클릭 지점 각 1개의 확인이다(#12) · dpr 1·합성 마우스(#21·AS-C1)",
      "위/아래 면 탭·빗나감 경로·재탭 각 문턱(retap_cos)의 경계는 vitest가 잰다 — 종단 팔은 없다",
      "**되살림 확인(A-4)은 별도로 안 했다** — 이 팔의 단언 자체가 배선 부재에서 실패한다(snapToDir 미배선이면 fy가 0으로 안 내려와 ①이, 분류기 미배선이면 꼭짓점 스냅이 없어 ②가 깨진다). 그 판단을 여기 적는다(#25 — 원장 밖 실행 없음)",
      "ui_constants(CUBE_TOL)는 test/constants.ts 밖이다(D-L49·D-L51의 예외와 같은 자리 — 전역 해시 동결. 조작 감도라 어느 원장 값도 이 상수에 의존하지 않는다) — 값은 아래 ui_constants 필드",
    ],
    thresholds: { fy_before_min: FY_NONZERO_MIN, snap_grid_tol_deg: 0.5, pitch_zero_max: 1e-6,
                  vertex_fy_tol: 0.02, drag_min_deg: 1, drag_max_deg: 45, arrow_tol_deg: 0.5,
                  dist_rel_tol: 1e-6, aim_max_deg: 0.5, offgrid_before_min_deg: 1,
                  console_errors_max: 0 },
    ui_constants: { CUBE_TOL },
    inputs: {
      note: "재현 좌표(8-R″ 재검 [11] — #12의 동작점을 값으로 남긴다). 좌표는 요소 상대·CSS px",
      orbit_pitch: { at_frac: [0.6, 0.6], dy_px: [6, 15], pointer: "touch" },
      pre_face_drag_px: 20,
      face_tap: "큐브 중심", vertex_tap: "큐브 중심 + (0.8, -0.8) x 반변",
      drag_px: 20, arrow: "우측 가장자리 -6px", retap: "큐브 중심",
      cube_css_px: 108, scale_ratio: 0.22,
    },
    gate: {
      registered: "피치≠0(|fy| > fy_before_min)·요 격자 밖(offGrid > 1° — 8-R″ 재검 [1]: 요 0에서의 격자 판정은 자명하다) 전제에서: 면 탭 후 |fy| < 1e-6·요 90° 격자 ±0.5°(**fy·요가 실제로 움직였다** — 양성 채널)·유한 소실점 1(화면 안 1)·중심 조준 <0.5°·거리 유지 <1e-6 · 꼭짓점 탭 후 |fy|≈1/√3 ±0.02·유한 소실점 3 · 드래그 20px 후 요 1~45°(연속)·fy 불변 <1e-6 · 화살표 +90°±0.5°·fy 불변 · 재탭 후 1점 복귀(피치 0·격자·거리·조준) · 토글 숨김 · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 도착 자세·거리는 목표 자세의 해석적 구성이 주는 보장이고(#5·8-R″ [M8]) 판정은 그 배선(탭→분류→snapToDir→카메라)이다",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});

// ---------------------------------------------------------------- 6차 지시 2 — 네 입면 흐름
//
// "정면 그리기 → 큐브로 우측면 → 이어 그리기 → 배면 → 이어 그리기 → 자유 시점으로 돌려
// 형태 확인. 각 단계 픽셀 확인."(2-5) — 1점 시점에서 축 스냅 획은 **직접 좌표 경로**로
// 올라가고(pathStats.direct), 1점이 깨지면 lift 경로다(음성 대조가 앱 안에 있다).
test("네 입면 흐름 — 정면·우측면·배면에서 이어 그리기, 직접 좌표 경로 (6차 지시 2)", async ({ page }) => {
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
    await page.waitForTimeout(60);
  };
  /** 문서 상태 + GL 픽셀 — 각 단계의 픽셀 확인(2-5). */
  const STATE = `(() => {
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
    return { lifted: S.doc().strokes.filter(s => s.seg3d).length,
             segs: S.doc().strokes.filter(s => s.seg3d).map(s => s.seg3d),
             path: S.pathStats(), center: S.orbitCenter(), gl_painted_px: painted,
             yaw: S.cubeYaw() };
  })`;
  const state = () => page.evaluate(c => eval(c)(), STATE);
  /** 세계 점(우리 규약)의 잉크 캔버스 화면 좌표 — 이어 그리기의 시작점을 여기서 얻는다. */
  const screenOf = (w: number[]) => page.evaluate((pt) => {
    const S = window.S2S;
    const c = S.stage.viewport.camera;
    c.updateMatrixWorld(true);
    const v = new (c.position.constructor)(pt[0], -pt[1], -pt[2]).project(c);
    const r = document.getElementById("ink")!.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height,
             on: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 };
  }, w);
  const led: Record<string, unknown> = {};

  // ---- ① 정면(확정 1점) — 상자 뼈대(가로 + 깊이 짝)로 카메라가 선다
  await drawPx(0.25 * W, 0.30 * H, 0.45 * W, 0.301 * H);
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  // **셋째 지지선**(8차 지시 1-a) — 위 둘의 교점 (0.6204W, 0.58H)를 지난다.
  // 화면 가로축만으로는 P1이 아니게 되면서 두 선 지름길이 없어졌다(D-L69의 기본 경로).
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  led.s1_confirm = await state();
  // ⚠⚠ **4 → 3은 D-L83 되살림(10차 항목 0)이다** — 접합 성분(밑선 + 깊이선 둘)만 일괄
  // 풀이가 올리고, 넷째(지지선 — 무연결)는 대기한다. p1_invariance 팔의 주석과 같은 판정이다.
  expect((led.s1_confirm as any).lifted).toBe(3);

  // ---- ② 정면에서 이어 그리기 — 기존 끝점에서 가로선: **직접 좌표 경로**(X축 선)
  await drawPx(0.4167 * W, 0.426 * H, 0.56 * W, 0.428 * H);
  led.s2_front = await state();
  expect((led.s2_front as any).lifted).toBe(4);
  expect((led.s2_front as any).path.direct).toBeGreaterThanOrEqual(1);   // 직접 경로가 실제로 돌았다
  {
    const segs = (led.s2_front as any).segs as number[][][];
    const s = segs[segs.length - 1];
    expect(Math.abs(s[0][1] - s[1][1])).toBeLessThan(1e-9);              // 화면 가로 = X축: y 불변
    expect(Math.abs(s[0][2] - s[1][2])).toBeLessThan(1e-9);              // z 불변
  }

  // ---- ③ 빈 곳에서 시작(무스냅) — ⛔⛔ **D-L83(10차 항목 0)이 옛 동작을 뒤집었다**:
  //      6차 지시 2-3(D-L77 "없으면 궤도 중심의 깊이")의 임의 깊이 배치는 이제 **막힌다**.
  //      앵커도 연결도 없는 획은 놓이지 않고 **대기**한다(§9.1 — 실패가 아니라 정상 대기.
  //      항목 4-3의 연쇄가 연결이 생기면 놓는다). 가드 카운터가 차단을 든다(#30 양성 채널).
  //      ⚠ 지평선 위·기하 밖에서 긋는 이유는 종전과 같다 — 지평선 아래는 지면 스냅이 받는다.
  await drawPx(0.66 * W, 0.15 * H, 0.78 * W, 0.152 * H);
  led.s3_unanchored = await state();
  led.s3_guard = await page.evaluate(() => window.S2S.anchorGuard());
  expect((led.s3_unanchored as any).lifted).toBe(4);     // **안 늘었다** — 그 획은 대기한다
  expect((led.s3_guard as any).on).toBe(true);
  expect((led.s3_guard as any).unanchored_rejected).toBeGreaterThanOrEqual(1);

  // ---- ④ 큐브 화살표로 우측면(상대 90° — 정확 정렬에서는 절대 정렬과 같다) → 이어 그리기
  const cube = (await page.locator("#cube").boundingBox())!;
  const cy = cube.y + cube.height / 2;
  await page.mouse.click(cube.x + cube.width - 6, cy);
  await page.waitForTimeout(500);
  led.yaw_right = (await state() as any).yaw;
  {
    // 기존 기하의 한 끝점에서 화면 가로로 — 우측면에서는 **Z축 선**이다(2-4)
    const st = led.s3_unanchored as any;
    const anchor3 = st.segs[0][1] as number[];                           // 첫 가로선의 오른끝
    const p = await screenOf(anchor3);
    expect(p.on).toBe(true);                                             // 화면 안에 있다
    await drawPx(p.x - box.x, p.y - box.y, p.x - box.x + 0.12 * W, p.y - box.y + 2);
    led.s4_right = await state();
    expect((led.s4_right as any).lifted).toBe(5);
    const s = (led.s4_right as any).segs[(led.s4_right as any).segs.length - 1];
    expect(Math.abs(s[0][0] - s[1][0])).toBeLessThan(1e-9);              // 우측면 가로 = Z축: x 불변
    expect(Math.abs(s[0][1] - s[1][1])).toBeLessThan(1e-9);              // y 불변
    expect(Math.abs(s[1][2] - s[0][2])).toBeGreaterThan(1e-6);           // z가 실제로 움직였다
    expect(Math.abs(s[0][0] - anchor3[0])).toBeLessThan(1e-6);           // 스냅 끝점의 깊이면
  }

  // ---- ⑤ 배면으로 → 이어 그리기(화면 가로 = 다시 X축)
  await page.mouse.click(cube.x + cube.width - 6, cy);
  await page.waitForTimeout(500);
  {
    const st = led.s4_right as any;
    const anchor3 = st.segs[st.segs.length - 1][1] as number[];          // 방금 그은 Z선의 끝
    const p = await screenOf(anchor3);
    expect(p.on).toBe(true);
    await drawPx(p.x - box.x, p.y - box.y, p.x - box.x - 0.1 * W, p.y - box.y - 2);
    led.s5_back = await state();
    expect((led.s5_back as any).lifted).toBe(6);
    const s = (led.s5_back as any).segs[(led.s5_back as any).segs.length - 1];
    expect(Math.abs(s[0][1] - s[1][1])).toBeLessThan(1e-9);              // 배면 가로 = X축: y 불변
    expect(Math.abs(s[0][2] - s[1][2])).toBeLessThan(1e-9);              // z 불변
    expect(Math.abs(s[1][0] - s[0][0])).toBeGreaterThan(1e-6);           // x가 실제로 움직였다
  }
  // **세 획**(정면·우측면·배면) 전부 직접 경로 — 무스냅 획은 D-L83이 막아 여기 안 든다
  expect((led.s5_back as any).path.direct).toBeGreaterThanOrEqual(3);
  expect((led.s5_back as any).path.lift).toBe(0);                        // 1점에서는 lift가 안 돈다

  // ---- ⑥ 자유 시점(큐브 드래그 — 격자 밖 요) → 형태 확인 + **음성 대조**: 이제 lift 경로다
  await page.mouse.move(cube.x + cube.width / 2, cy);
  await page.mouse.down();
  await page.mouse.move(cube.x + cube.width / 2 + 20, cy, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  {
    const st = await state() as any;
    const anchor3 = st.segs[0][0] as number[];
    const p = await screenOf(anchor3);
    expect(p.on).toBe(true);
    await drawPx(p.x - box.x, p.y - box.y, p.x - box.x + 0.1 * W, p.y - box.y + 3);
  }
  led.s6_free = await state();
  expect((led.s6_free as any).gl_painted_px).toBeGreaterThan(0);         // **형태가 보인다**
  expect((led.s6_free as any).path.lift).toBeGreaterThanOrEqual(1);      // 1점 밖 — lift 경로(음성 대조)
  expect((led.s6_free as any).path.direct).toBe((led.s5_back as any).path.direct);

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "elevation_flow.json"), JSON.stringify({
    spec: "6차 지시 2 — 네 입면 흐름 종단: 정면(확정 1점) 이어 그리기(직접 경로·X축) → 무스냅 시작(⛔ D-L83이 옛 궤도 중심 깊이 배치를 막는다 — 대기 확인) → 화살표 90°로 우측면(Z축 선·스냅 끝점 깊이면) → 배면(X축 선) → 자유 시점(형태 확인 + lift 경로 음성 대조). Playwright 신뢰 이벤트·콘솔 오류 0",
    what_this_does_not_say: [
      "**축 평면 좌표(y·z 불변 등)는 직접 좌표 공식의 보장이다**(#5) — 이 팔이 재는 것은 배선(resolveLive 분기→placeLive→seg3d)과 경로 선택(direct/lift 카운터)이다. 공식 자체의 동등성은 one_point_direct.json이 잰다",
      "우측면·배면 전환은 큐브 **화살표**(상대 90°)다 — 정확 정렬에서 출발하므로 절대 정렬과 같다(지시 1-2). 면 탭 전환은 view_cube.json의 팔이 잰다",
      "**손 정렬 자동 스냅(hand_deg)의 종단 팔은 없다** — 감쇠 꼬리 대기 뒤 정렬이라 결정론이 약해, 판정은 onePointFrame(정확 정렬)의 반례 테스트와 여기의 lift 음성 대조가 진다. 자동 스냅 자체의 종단은 DEFERRED(실기 K와 같은 문)",
      "한 구도·한 순서의 확인이다(#12) · dpr 1·합성 마우스(#21·AS-C1)",
      "⛔ **무스냅 배치(2-3·D-L77)는 D-L83(10차 항목 0)이 뒤집었다** — 이 팔은 이제 그 경로가 **막히는 것**을 잰다(lifted 불변 · unanchored_rejected 증가). 옛 판정(깊이 = 궤도 중심 z)은 대상이 소멸했다",
      "무스냅 획을 지평선 위(0.15H)에서 긋는 이유는 종전과 같다 — 지평선 아래는 지면 on_face가 후보로 잡힌다. ⚠ 'D-L83 이후 그쪽도 대기가 된다'는 **이 실행이 밟지 않은 코드 경로다**(#25) — 이 픽스처의 s3_guard 값을 그대로 읽으면 start_attempts는 이어 그리기의 정밀 후보 질의이고(전부 통과라 rejected 0), **on_face가 후보로 잡힌 질의는 0**이다. 그 경로의 실측 차단은 basic_flow ①~③의 s3_guard(rejected > 0)가 든다",
      "**direct_min 4 → 3은 10차 항목 0의 하향이다** — 무스냅 획이 직접 경로에서 빠졌기 때문(D-L83이 placeUnanchored를 막는다). 판정을 결과에 맞춘 것이 아니라 **조항 하나(무스냅 배치)가 대상 소멸**한 것이고, 그 조항의 대체가 '가드가 막는다' 단언이다(gate.registered)",
      "**깊이 성분은 1점 f(임의값 — D-L53)가 정하는 배율 위의 값이다**(이론서 16.4·AS-C4 — 2-R′ [B-7]): s4의 Δz 같은 깊이 좌표와 이 흐름으로 만든 입체의 깊이:폭 비는 그 상수에 달렸다. 직접·lift 두 경로가 같은 f를 쓰므로 동등성에는 안 닿는다",
      "손 정렬 자동 스냅의 발화는 **궤도 종료(터치 제스처·마우스 궤도) 뒤**다(2-R′ [B-6]) — flyTo 복귀·저장본 복원·실행취소는 저장된 자세를 그대로 복원하므로 대상이 아니고, 그 자세가 근사 정렬이면 1점으로 안 선다(직접 경로는 정확 정렬만). 이 팔은 화살표 이동이라 항상 정확 정렬에서 출발한다. ⚠ 정정(7차 항목 1): '저장본 복원이 자세를 그대로 복원한다'는 **적힌 시점에 거짓이었다** — 옛 applyDoc2는 무대 자세를 아예 재수립하지 않았다(새로고침 뒤 생성 기본 자세). 7차가 복원을 setPose/pinTo(정확 복원)로 고쳐 이 문장이 참이 됐다 — 발화 범위 판단(복원은 자동 스냅 대상이 아니다) 자체는 정확 복원을 전제로 한 것이라 7차 이후 상태에서 유지된다(restore_pose.json이 그 정확성을 잠근다)",
      "pathStats는 확정 축 배치만 센다(미리보기 프레임 아님) — twoPoint(양 끝 스냅)는 별도 칸이고 **확정 단계에서 1**(상자 뼈대 중 한 획의 양 끝 스냅), 이후 전 단계 불변이다(2-R′ [B-2] — 초판 '0' 서술은 자기 데이터와 모순이었다)",
    ],
    thresholds: { plane_const_max: 1e-9, anchor_plane_max: 1e-6, moved_min: 1e-6,
                  direct_min: 3, lift_min_after_free: 1, console_errors_max: 0 },
    algo_constants_note: "ONE_POINT_TOL은 one_point_direct.json의 algo_constants에 있다",
    inputs: {
      note: "재현 좌표(#12) — 비율은 잉크 캔버스 크기 대비",
      confirm: [[0.25, 0.30, 0.45, 0.301], [0.25, 0.30, 0.4167, 0.426], [0.45, 0.30, 0.5523, 0.468]],
      front_stroke: [0.4167, 0.426, 0.56, 0.428], unanchored: [0.66, 0.15, 0.78, 0.152],
      arrow: "큐브 우측 가장자리 -6px(두 번)", side_strokes: "기존 끝점의 투영 + 화면 가로 0.1~0.12W",
      free: "큐브 드래그 +20px",
    },
    gate: {
      registered: "정면 이어 그리기 direct≥1·X축 평면(y·z<1e-9) · 무스냅 시작은 **가드가 막아 대기**(lifted 불변·unanchored_rejected≥1 — D-L83, 10차 항목 0이 옛 조항 '깊이=궤도 중심 z<1e-6'을 갈아 끼웠다: D-L77 동작이 지시로 뒤집혔다) · 우측면 Z축 선(x·y<1e-9·z 이동>1e-6·앵커 깊이면) · 배면 X축 선 · 세 획 direct·lift 0 · 자유 시점 GL>0·lift≥1(음성 대조 — 1점 밖에서는 직접 경로가 안 돈다·direct 불변) · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "음성 대조가 오라클이다(2-R′ [B-1] — 초판은 통과 기준 자체(direct_min=4)를 도달 가능성으로 적었다: #40 ① 지표 불일치) — 자유 시점(격자 밖 요)에서 **같은 그리기가 lift로 간 수**가 값이다. 1이 자명값이 아닌 이유: 같은 그리기가 격자 안에서는 direct로 갔다(s2~s5 네 번). 이 값이 0이면 direct 카운터는 아무 데서나 오르는 것이고 이 게이트는 무효다. ⚠ 정확히 1이라 selfcheck #40 검사가 의심 플래그를 낸다 — 그 플래그의 원인 확인이 이 문장이다(의심≠오류, §5)",
      reachability_value: 1,
      reachability_source: "s6_free/path/lift",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
