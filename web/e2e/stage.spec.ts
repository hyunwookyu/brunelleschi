// L-B.1 **단일 뷰포트 종단 확인** — 산출: `stage0/out/stage_browser.json`.
//
// 왜 여기인가: L-B.1의 브라우저 확인 수치가 처음에는 `progress.md`에만 있었다.
// **원장 밖 측정은 규칙이 있어도 안 걸린다**(PITFALLS #25 — L-A.2의 스윕 표가 그렇게 죽었다).
// 그래서 손으로 콘솔에 친 것을 그대로 자동화해 원장에 남긴다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   #25(원장) · **#21(dpr — 되살려서 실패하는지 확인)** · #6(대조군) · #22(캔버스 굳음) ·
//   #5(보장과 측정) · #29(여유는 사용자가 만지는 양으로)
//
// **이 확인이 말하지 않는 것**(분모를 좁힌다):
//   · 배치 정확도 — 참값 대조를 앱에서 하지 않는다(DEFERRED [13])
//   · 사람이 도달하는 축 오차 — 여기서는 **참 소실점을 그대로 넣는다**(AS-L9은 여전히 표본 0)
//   · 실획 — 합성 잉크다(AS-C1·AS-C10)
// 말할 수 있는 것은 **배선 항등이 실제 브라우저에서 성립한다**와 **규약(주점 비중심·dpr·창
// 크기 변경)이 유지된다**까지다.
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const led: Record<string, unknown> = {};

declare global {
  interface Window { S2S: any; __SC: any }
}

/** 합성 상자를 넣고 **참 소실점으로** 가이드를 세운다 — 사람이 완벽히 맞춘 극한. */
async function setup(page: Page) {
  return page.evaluate(async () => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const m = await import("/test/scene3d.ts");
    const doc = await import("/src/ui/doc.ts");
    const vd = await import("/src/s3d/vpDraft.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const sc = m.scene(35, 15, 1000, size);
    const edges = m.boxEdges(sc, [0.6, -0.4, 4.2], 1.2, 1.0, 0.9);
    // 결정론적 난수 — `Math.random` 금지(CLAUDE.md §5)
    let s0 = 12345 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    const drawn = m.drawEdges(sc, edges, "medium", r, 0.37, 0.006, 0);
    for (const e of drawn) S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    const margin = 0.02 * Math.hypot(size[0], size[1]);
    const targets = [[[0.30, 0.30], [0.30, 0.72]], [[0.70, 0.30], [0.70, 0.72]],
                     [[0.32, 0.35], [0.70, 0.35]]];
    const guides: unknown[] = [];
    sc.vps.forEach((vp: number[], ax: number) => {
      for (const t of targets[ax]) {
        const q = [t[0] * size[0], t[1] * size[1]];
        const far = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
        const cl = vd.clipToCanvas([vp[0], vp[1]], far, size, margin);
        if (cl) guides.push({ axis: ax, a: cl[0], b: cl[1] });
      }
    });
    S.cam.guides = guides; S.cam.apply(); S.refresh();
    window.__SC = sc;
    return { canvas: size, strokes: S.doc().strokes.length, hasCamera: !!S.cam.ctx() };
  });
}

/**
 * three가 실제로 그리는 픽셀과 `project(principal, f)`의 차이. **설계 보장의 배선 확인**이다.
 * `mode: "backbuffer"`는 **일부러 dpr을 틀리게 적용한 대조군**이다 — 이것이 안 커지면
 * dpr 행은 dpr을 검사하지 않는 것이다(#21: 버그를 되살려 실제로 실패하는지 본다).
 */
async function pixelGap(page: Page, mode: "css" | "backbuffer") {
  return page.evaluate(async (mode) => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const camT = S.stage.viewport.camera;
    camT.updateMatrixWorld(true);
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const w = mode === "css" ? el.clientWidth : el.width;
    const h = mode === "css" ? el.clientHeight : el.height;
    const mvp = camT.projectionMatrix.clone().multiply(camT.matrixWorldInverse);
    let max = 0, n = 0;
    for (const s of S.doc().strokes) {
      if (!s.seg3d) continue;
      for (const p of s.seg3d) {
        const v = [p[0], -p[1], -p[2], 1];            // `world` 그룹의 x축 180°
        const e = mvp.elements;
        const cl = [0, 1, 2, 3].map(rw =>
          e[rw] * v[0] + e[4 + rw] * v[1] + e[8 + rw] * v[2] + e[12 + rw] * v[3]);
        const px = [w * (cl[0] / cl[3] + 1) / 2, h * (1 - cl[1] / cl[3]) / 2];
        const want = g3.project(p, ctx.principal, ctx.f);
        max = Math.max(max, Math.hypot(px[0] - want[0], px[1] - want[1]));
        n++;
      }
    }
    return { max, n };
  }, mode);
}

test("단일 뷰포트 — 확정 시 3D가 잉크 자리에 그려진다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  led.setup = await setup(page);

  led.confirm = await page.evaluate(() => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click();
    const ctx = S.cam.ctx();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    return {
      lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
      total: S.doc().strokes.length,
      f_px: ctx.f, true_f_px: window.__SC.f,
      principal: ctx.principal, canvas_center: [el.clientWidth / 2, el.clientHeight / 2],
      view_offset: { ...S.stage.viewport.camera.view },
    };
  });
  expect((led.confirm as any).lifted).toBe(12);

  led.wiring_identity_px = { ...(await pixelGap(page, "css")),
    note: "**보장의 배선 확인**이다(PITFALLS #5). 0에 가까워야 하고, 아니면 규약 오류다." };
  expect((led.wiring_identity_px as any).max).toBeLessThan(1e-6);

  // ---- 주점이 화면 중심이 아닌 경로 (`setViewOffset`의 offsetX ≠ 0)
  led.offcenter_principal = await page.evaluate(() => {
    const S = window.S2S;
    S.cam.locked = false;
    const g = S.cam.guides;
    g[0] = { axis: g[0].axis, a: [g[0].a[0] + 26, g[0].a[1] - 34], b: g[0].b };
    g[4] = { axis: g[4].axis, a: g[4].a, b: [g[4].b[0] - 18, g[4].b[1] + 12] };
    S.cam.apply();
    const ctx = S.cam.ctx();
    S.cam.locked = true;
    S.stage.pinTo(ctx.principal, ctx.f);
    const el = document.getElementById("ink") as HTMLCanvasElement;
    return { principal: ctx.principal, canvas_center: [el.clientWidth / 2, el.clientHeight / 2],
             view_offset: { ...S.stage.viewport.camera.view } };
  });
  expect(Math.abs((led.offcenter_principal as any).view_offset.offsetX)).toBeGreaterThan(1);
  const off = await pixelGap(page, "css");
  led.offcenter_identity_px = off;
  expect(off.max).toBeLessThan(1e-6);

  // ---- dpr 2 + **대조군**: 백버퍼 px로 비교하면 실제로 어긋나는가 (#21·#6)
  led.dpr = await page.evaluate(async () => {
    const S = window.S2S;
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const gl = S.stage.viewport.renderer;
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    gl.setPixelRatio(2);
    el.width = 0;                            // `canvasFrame`이 다시 맞추게 강제한다
    S.stage.viewport.resize(); S.refresh();
    await new Promise(r => setTimeout(r, 50));
    return {
      dpr: window.devicePixelRatio,
      ink_backbuffer: [el.width, el.height], ink_css: [el.clientWidth, el.clientHeight],
      gl_backbuffer: [gl.domElement.width, gl.domElement.height],
      cam_imgSize: S.cam.imgSize,
    };
  });
  const dprCss = await pixelGap(page, "css");
  const dprBad = await pixelGap(page, "backbuffer");
  led.dpr_identity_px = {
    css_frame: dprCss.max,
    backbuffer_frame_control: dprBad.max,
    control_stat: "24점의 **최댓값**(css_frame과 같은 통계·같은 분모)",
    note: "**대조군이 요점이다**(#6). dpr 2에서 CSS 프레임으로 비교하면 0이고, "
        + "백버퍼 프레임으로 비교하면 벌어진다 — 벌어지지 않으면 이 행은 아무것도 검사하지 않는다.",
    what_this_is_not: "⚠ **앱의 dpr 규약을 되살린 것이 아니다**(리뷰어 2회차 [8][9]). 되살린 것은 "
        + "**측정 쪽 비교 프레임**이고, 앱의 `canvasFrame` 규약을 잠그는 것은 "
        + "`e2e/coords.spec.ts`(dpr 1·2·3 프로젝트)다. 여기서 dpr 2는 "
        + "`deviceScaleFactor`가 아니라 **페이지 안에서 흉내낸 것**이라 브라우저 합성 경로를 "
        + "타지 않는다 — PITFALLS #21이 기록한 실패 자리가 바로 그 조건이다.",
  };
  expect(dprCss.max).toBeLessThan(1e-6);
  expect(dprBad.max).toBeGreaterThan(100);        // 되살린 버그가 실제로 잡히는가

  // ---- 창 크기 변경에서 규약이 유지되는가 (AS-C7 / #22)
  led.resize = await page.evaluate(async () => {
    const S = window.S2S;
    Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
    S.stage.viewport.renderer.setPixelRatio(1);
    const frame = document.getElementById("frame")!;
    const before = { ...S.stage.viewport.camera.view };
    frame.style.width = "820px";
    (document.getElementById("ink") as HTMLCanvasElement).width = 0;
    S.stage.viewport.resize(); S.refresh();
    await new Promise(r => setTimeout(r, 50));
    const after = { ...S.stage.viewport.camera.view, imgSize: S.cam.imgSize };
    frame.style.width = "";
    S.stage.viewport.resize(); S.refresh();
    return { before, after, size_heal_count: S.SIZE_HEAL.count };
  });

  // ---- **말이 아니라 픽셀로** — 3D 선분이 실제로 칠해져 있는가 + 대조군(빈 모서리)
  led.painted = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const vp = S.stage.viewport;
    const gl = vp.renderer.getContext();
    vp.renderer.render(vp.scene, vp.camera);       // 같은 태스크 안에서 읽어야 남아 있다
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const W = el.clientWidth, H = el.clientHeight, pr = bw / W;
    const ctx = S.cam.ctx();
    const hits = (cx: number, cy: number, rad: number) => {
      let n = 0;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const x = Math.round(cx * pr + dx), y = Math.round((H - cy) * pr + dy);
        if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
        const i = (y * bw + x) * 4;
        if (buf[i] < 235 || buf[i + 1] < 235 || buf[i + 2] < 235) n++;
      }
      return n;
    };
    let drawn = 0, painted = 0;
    for (const s of S.doc().strokes) {
      if (!s.seg3d) continue;
      const mid = [0, 1, 2].map(k => (s.seg3d[0][k] + s.seg3d[1][k]) / 2);
      const p = g3.project(mid, ctx.principal, ctx.f);
      if (!p) continue;
      drawn++;
      if (hits(p[0], p[1], 2) > 0) painted++;
    }
    return { segments: drawn, painted, blank_corner_control: hits(6, 6, 2) };
  });
  expect((led.painted as any).painted).toBe((led.painted as any).segments);
  expect((led.painted as any).blank_corner_control).toBe(0);

  // ---- 궤도: 확정 뷰의 2D 층이 **사라지는가**(§9.2 — 다른 뷰에서는 숨는다)
  led.orbit = await page.evaluate(async () => {
    const S = window.S2S;
    const vp = S.stage.viewport;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click();
    await new Promise(r => setTimeout(r, 60));
    vp.camera.position.set(2.2, -1.4, 1.1); vp.controls.update();
    vp.renderer.render(vp.scene, vp.camera);
    const gl = vp.renderer.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let gl3d = 0;
    for (let i = 0; i < buf.length; i += 4)
      if (buf[i] < 235 || buf[i + 1] < 235 || buf[i + 2] < 235) gl3d++;
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const id = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let ink = 0;
    for (let i = 3; i < id.length; i += 4) if (id[i] > 8) ink++;
    return { pinned: S.stage.isPinned, controls: vp.controls.enabled,
             ink_pointer_events: getComputedStyle(el).pointerEvents,
             gl_painted_px: gl3d, ink_painted_px: ink };
  });
  expect((led.orbit as any).ink_painted_px).toBe(0);
  expect((led.orbit as any).gl_painted_px).toBeGreaterThan(0);

  led.home = await page.evaluate(async () => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="home"]')!.click();
    await new Promise(r => setTimeout(r, 60));
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const id = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    let ink = 0;
    for (let i = 3; i < id.length; i += 4) if (id[i] > 8) ink++;
    return { pinned: S.stage.isPinned, ink_painted_px: ink };
  });
  expect((led.home as any).pinned).toBe(true);
  expect((led.home as any).ink_painted_px).toBeGreaterThan(0);

  // ---- **핸들 예산**은 사용자가 만지는 양이다(#29). DEFERRED가 L-B에 물려 둔 숙제.
  led.guide_budget = await page.evaluate(async () => {
    const S = window.S2S;
    const vd = await import("/src/s3d/vpDraft.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const diag = Math.hypot(el.clientWidth, el.clientHeight);
    const lens = S.cam.guides.map((g: any) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]));
    return {
      canvas: [el.clientWidth, el.clientHeight], diag,
      required_min_len_px: vd.DRAFT_TOL.min_guide_ratio * diag,
      actual_guide_len_px: lens.map((x: number) => +x.toFixed(1)),
      note: "**참 소실점으로 세운 가이드**의 길이다. 검출 초안이 아니다.",
    };
  });
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "stage_browser.json"), JSON.stringify({
    spec: "L-B.1 단일 뷰포트 — **실제 브라우저에서** 3D 층과 2D 층이 같은 픽셀에 오는가",
    plan: "docs/line_plan.md §10.3 (개정 2 번호)",
    what_this_does_not_say: [
      "배치 정확도 — 참값 대조를 앱에서 하지 않는다(DEFERRED)",
      "사람이 도달하는 축 오차 — 여기서는 **참 소실점을 그대로 넣는다**(AS-L9은 표본 0)",
      "실획 — 합성 잉크다(AS-C1·AS-C10)",
      "분모는 상자 하나 12획이다. 구도 하나이므로 5구도 주장의 근거가 아니다",
    ],
    condition: {
      browser: "chromium(Playwright) · 1440×900 · deviceScaleFactor 1(dpr 2는 페이지에서 흉내낸다)",
      server: "개발 서버(`npx vite --port 5223`)",
      fixture: "`/test/scene3d.ts` — **측정 하네스와 같은 픽스처**(손으로 만들면 아핀 상자가 나온다)",
      ink_grade: "medium", ink_seed: "LCG 12345(페이지 안에서 결정론적으로 생성)",
      end_jitter: 0.006, skew: 0.37,
      grade_note: "⚠ **동작점 하나다**(PITFALLS #12). 같은 구도의 `stage_cam.json`은 등급에 따라 "
        + "배치가 크게 갈린다 — 여기 '12/12'를 등급 전체의 값으로 읽으면 안 된다.",
      camera: "요 35°·피치 15° 3점(f=1000px). 가이드를 **참 소실점**으로 세운다",
    },
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
    ...led,
  }, null, 2), "utf-8");
});

/**
 * L-B.2 — **가이드 조정 UI와 실시간 피드백**(§5.2). 산출: `stage_browser.json`의 `l_b2`.
 *
 * 재는 것: 초안이 실제로 늘어나는가 · 민감도가 화면에 뜨는가 · 선을 통째로 끌 수 있는가.
 * **정확도는 안 잰다** — 이 스펙은 배선 확인이다.
 */
test("가이드 조정 — 늘리기·민감도·선 끌기", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  // ① 검출 초안만으로는 카메라가 안 선다 — **그 사실 자체가 §5.1의 근거다**
  l.draft_only = await page.evaluate(async () => {
    const S = window.S2S;
    const m = await import("/test/scene3d.ts");
    const doc = await import("/src/ui/doc.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const sc = m.scene(35, 15, 1000, size);
    const edges = m.boxEdges(sc, [0.6, -0.4, 4.2], 1.2, 1.0, 0.9);
    let s0 = 12345 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    for (const e of m.drawEdges(sc, edges, "medium", r, 0.37, 0.006, 0))
      S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    S.refresh();
    document.querySelector<HTMLButtonElement>('#bar button[data-act="draft"]')!.click();
    const len = (g: any) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
    return { guides: S.cam.guides.length,
             lengths: S.cam.guides.map((g: any) => +len(g).toFixed(1)),
             camera_solvable: !!S.cam.ctx(),
             sensitivity_shown: document.getElementById("status")!.innerText.includes("핸들 예산"),
             filled_axes: S.cam.guides.filter((g: any) => g.filled).map((g: any) => g.axis),
             warns_filled: document.getElementById("status")!.innerText.includes("채운 것"),
             note: "⚠ **L-B.3(b)이 이 성질을 뒤집었다.** 옛 판의 주석은 '검출 초안만으로는 "
                 + "카메라가 안 선다. 민감도도 그래서 안 뜬다'였는데, **빈 축을 중립으로 "
                 + "채우면서 카메라가 서고 민감도가 뜬다**. 그 축은 그림이 정한 값이 아니므로 "
                 + "화면이 **흐린 점선 + `채움` 표시 + 경고 줄**로 구분한다 — "
                 + "구분하지 않으면 A-3의 '없는 숫자를 지어내지 않는다'가 뒤집힌다(리뷰어 2회차 [11])." };
  });

  // **이 구도에서는 검출이 세 축을 다 채운다** — 채움이 0인 것이 정상이다.
  // 그러니 개수를 요구하지 않고 **표시와 사실이 일치하는지**만 잠근다(#19: 설명이 검사를 끄지 않게).
  {
    const d = l.draft_only as { filled_axes: number[]; warns_filled: boolean };
    expect(d.warns_filled).toBe(d.filled_axes.length > 0);
  }

  // ② 참 소실점을 넣어 카메라를 세운다 — 그 뒤라야 민감도가 뜻을 갖는다
  await setup(page);

  // **선을 통째로 끌면 소실점이 옮겨지고 방향은 그대로여야 한다**
  l.line_drag = await page.evaluate(async () => {
    const S = window.S2S;
    const vd = await import("/src/s3d/vpDraft.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const g0 = S.cam.guides[0];
    const mid: [number, number] = [(g0.a[0] + g0.b[0]) / 2, (g0.a[1] + g0.b[1]) / 2];
    const grabbed = vd.guideLineAt(S.cam.guides, mid, size);
    const before = S.cam.vps().map((v: any) => v && v.map((x: number) => +x.toFixed(2)));
    const dirBefore = [g0.b[0] - g0.a[0], g0.b[1] - g0.a[1]];
    S.cam.guides = vd.moveGuideBy(S.cam.guides, 0, 30, -18);
    S.cam.apply(); S.refresh();
    const g1 = S.cam.guides[0];
    return { grabbed_index: grabbed,
             direction_unchanged: Math.abs((g1.b[0] - g1.a[0]) - dirBefore[0]) < 1e-9
                               && Math.abs((g1.b[1] - g1.a[1]) - dirBefore[1]) < 1e-9,
             vps_before: before,
             vps_after: S.cam.vps().map((v: any) => v && v.map((x: number) => +x.toFixed(2))) };
  });
  expect((l.line_drag as any).grabbed_index).toBe(0);
  expect((l.line_drag as any).direction_unchanged).toBe(true);

  // **민감도가 화면에 뜨는가** — 원장에만 있던 값을 사용자에게 옮기는 것이 L-B.2다
  l.sensitivity = await page.evaluate(() => {
    const S = window.S2S;
    const s = S.cam.sensitivity();
    return { rows: s.map((x: any) => ({ axis: x.axis,
               deg_per_px: x.degPerPx == null ? null : +x.degPerPx.toFixed(4),
               budget_px: x.budgetPx == null ? null : +x.budgetPx.toFixed(3),
               shortest_guide_px: x.shortestGuidePx == null ? null : +x.shortestGuidePx.toFixed(1) })),
             shown_in_status: document.getElementById("status")!.innerText.includes("핸들 예산") };
  });
  expect((l.sensitivity as any).shown_in_status).toBe(true);

  led.l_b2 = l;
});

/**
 * L-B.3 — **스냅**(§3). 산출: `stage_browser.json`의 `l_b3`.
 *
 * 재는 것: 대상이 3D 레이어에서 오는가 · 떠 있는 커서에 표식이 뜨는가 ·
 * **실제 포인터로 그은 획의 시작점이 붙고 그 자리에서 3D가 확정되는가**(§3 마지막 문단).
 *
 * ⚠ **정확도 표는 여기가 아니다** — `snap.json`이 5구도·3등급·시드 6으로 낸다.
 * 여기는 **배선 확인**이고 동작점 하나다(#12).
 */
test("스냅 — 대상·표식·시작점 확정", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  await setup(page);
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click());

  // ① 대상은 **3D 레이어**에서 온다. 확정 전에는 0이어야 한다 — 그 대조를 함께 낸다.
  l.targets = await page.evaluate(() => {
    const S = window.S2S;
    return { after_confirm: S.snapTargets(), lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             pending: S.doc().strokes.filter((s: any) => !s.seg3d).length };
  });
  expect((l.targets as any).after_confirm).toBe((l.targets as any).lifted);

  // ② 떠 있는 커서 — 참 꼭짓점 근처에서 **끝점** 표식이 떠야 한다.
  const geo = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const s0 = S.doc().strokes.find((s: any) => s.seg3d);
    const a = g3.project(s0.seg3d[0], ctx.principal, ctx.f);
    const b = g3.project(s0.seg3d[1], ctx.principal, ctx.f);
    const r = (document.getElementById("ink") as HTMLCanvasElement).getBoundingClientRect();
    return { a, b, originX: r.left, originY: r.top, id: s0.id, axis: s0.axis };
  });
  const cx = geo.originX, cy = geo.originY;
  // 꼭짓점에서 **18px 어긋나게** 겨냥한다 — 손 획이 정확히 맞지 않는 것을 흉내낸다
  await page.mouse.move(cx + geo.a[0] + 13, cy + geo.a[1] + 12);
  l.hover = await page.evaluate(() => {
    const S = window.S2S;
    const h = S.hoverSnap();
    return { kind: h?.kind ?? null, dist_px: h ? +h.dist.toFixed(1) : null,
             shown_in_status: document.getElementById("status")!.innerText.includes("스냅") };
  });
  expect((l.hover as any).kind).toBe("endpoint");
  expect((l.hover as any).shown_in_status).toBe(true);

  // ③ **실제 포인터로 긋는다.** 시작을 꼭짓점에서 어긋나게, 끝을 같은 모서리 방향으로.
  await page.mouse.down();
  await page.mouse.move(cx + (geo.a[0] + geo.b[0]) / 2, cy + (geo.a[1] + geo.b[1]) / 2, { steps: 4 });
  await page.mouse.move(cx + geo.b[0] - 6, cy + geo.b[1] + 5, { steps: 4 });
  await page.mouse.up();

  l.drawn = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const sn = await import("/src/s3d/snap.ts");
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    const back = st.seg3d ? g3.project(st.seg3d[0], ctx.principal, ctx.f) : null;
    return {
      snap_kind: st.snapStart?.kind ?? null,
      snapped_to: st.snapStart?.ofId ?? null,
      axis: st.axis,
      placed: !!st.seg3d,
      // ⚠ **이것은 측정이 아니라 항등이다**(PITFALLS #5). `pts2d[0] = project(cand.at)`로
      // 넣고 `seg3d[0] = cand.at`으로 놓았으니 되쏘면 정확히 같은 점이다. **정확도가 아니라
      // 배선을 검사한다** — 둘 중 하나만 대입하는 실수를 잡는다. 임계를 걸지 않는다.
      start_reprojection_gap_px_IDENTITY: back
        ? +Math.hypot(back[0] - st.pts2d[0][0], back[1] - st.pts2d[0][1]).toFixed(9) : null,
      status_note: document.getElementById("status")!.innerText.includes("마지막 획"),
    };
  });
  expect((l.drawn as any).snap_kind).toBe("endpoint");
  expect((l.drawn as any).placed).toBe(true);
  expect((l.drawn as any).axis).toBe(geo.axis);
  expect((l.drawn as any).start_reprojection_gap_px_IDENTITY).toBeLessThan(1e-6);

  // ④ **대조군** — 아무것도 없는 자리에서 시작하면 안 붙고 **2D로 대기**한다(§9.1).
  await page.mouse.move(cx + 12, cy + 12);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy + 30, { steps: 3 });
  await page.mouse.up();
  l.control_far_from_geometry = await page.evaluate(() => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    return { snap_kind: st.snapStart?.kind ?? null, placed: !!st.seg3d,
             note: "붙지 않으면 **실패가 아니라 대기**다(§9.1). 조용히 틀린 배치를 만들지 않는다." };
  });
  expect((l.control_far_from_geometry as any).snap_kind).toBeNull();
  expect((l.control_far_from_geometry as any).placed).toBe(false);

  l.what_this_does_not_say = [
    "성공률 — `snap.json`이 5구도·3등급·잡음 4·시드 6으로 낸다. 여기는 동작점 하나다(#12)",
    "반경의 타당성 — 대상 밀도가 상자 하나다(`snap.json`의 `by_density`가 그것을 잰다)",
    "실획 — 합성 잉크다(AS-C1)",
    "`start_reprojection_gap_px_IDENTITY`는 **항등**이다 — 정확도가 아니라 배선을 검사한다(#5)",
  ];
  led.l_b3 = l;
});

/**
 * L-B.4 — **실시간 축 판정과 미리보기**(§4). 산출: `stage_browser.json`의 `l_b4`.
 *
 * 재는 것: 그리는 **도중에** 축이 판정되고 미리보기가 뜨는가, 그리고
 * **미리보기와 확정이 같은가**(계획서 §11 L-B 게이트의 세 번째 항목 — 일치 0).
 */
test("실시간 축 판정 — 미리보기와 확정이 같다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  await setup(page);
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click());

  const geo = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const s0 = S.doc().strokes.find((s: any) => s.seg3d);
    const r = (document.getElementById("ink") as HTMLCanvasElement).getBoundingClientRect();
    return { a: g3.project(s0.seg3d[0], ctx.principal, ctx.f),
             b: g3.project(s0.seg3d[1], ctx.principal, ctx.f),
             originX: r.left, originY: r.top, axis: s0.axis };
  });
  const cx = geo.originX, cy = geo.originY;

  // 꼭짓점 근처에서 시작해 같은 모서리 방향으로 **끌고 가는 도중** 상태를 읽는다
  await page.mouse.move(cx + geo.a[0] + 11, cy + geo.a[1] + 9);
  await page.mouse.down();
  await page.mouse.move(cx + (geo.a[0] + geo.b[0]) / 2, cy + (geo.a[1] + geo.b[1]) / 2, { steps: 4 });

  l.mid_drag = await page.evaluate(() => {
    const S = window.S2S;
    const t = document.getElementById("status")!.innerText;
    return { status_shows_live: t.includes("그리는 중"),
             status_shows_axis: /축[123]/.test(t),
             hover_cleared: S.hoverSnap() === null };
  });
  expect((l.mid_drag as any).status_shows_live).toBe(true);
  expect((l.mid_drag as any).status_shows_axis).toBe(true);

  // **미리보기와 확정의 일치**: 끌기 마지막 위치의 미리보기 3D와, 그 자리에서 뗀 확정 3D
  const endX = cx + geo.b[0] - 7, endY = cy + geo.b[1] + 4;
  await page.mouse.move(endX, endY, { steps: 3 });
  const preview = await page.evaluate(() => {
    const S = window.S2S;
    const lv = S.live();
    return lv?.seg ? { axis: lv.axis, a: lv.seg[0], b: lv.seg[1] } : null;
  });
  await page.mouse.up();
  l.preview_vs_confirm = await page.evaluate((pv) => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    if (!pv || !st.seg3d) return { preview: !!pv, placed: !!st.seg3d, gap: null };
    const g = Math.max(
      ...[0, 1].flatMap(k => [0, 1, 2].map(c =>
        Math.abs((k === 0 ? pv.a : pv.b)[c] - st.seg3d[k][c]))));
    return { preview: true, placed: true, axis_same: pv.axis === st.axis, gap: +g.toFixed(12),
             note: "⚠ **이것은 항등에 가깝다**(PITFALLS #5) — 미리보기와 확정이 `resolveLive` "
                 + "**같은 함수**를 같은 입력으로 부른다. 재는 것은 정확도가 아니라 **배선**이고, "
                 + "입력이 갈리는 경로가 생기면 이 값이 0이 아니게 된다. 임계를 걸지 않는다." };
  }, preview);
  expect((l.preview_vs_confirm as any).placed).toBe(true);
  expect((l.preview_vs_confirm as any).axis_same).toBe(true);
  expect((l.preview_vs_confirm as any).gap).toBe(0);

  l.what_this_does_not_say = [
    "축 판정의 정확도 — `axis_live.json`이 5구도·3등급·잡음 4·시드 6으로 낸다",
    "일치 0은 **항등**이다 — 같은 함수를 같은 입력으로 부른다(#5)",
  ];
  led.l_b4 = l;
});

/**
 * L-B.5 — **축 고정**(§4). 산출: `stage_browser.json`의 `l_b5`.
 *
 * 재는 것은 **배선뿐이다.** "고정하면 그 축으로 놓인다"는 **정의상 참**이라(PITFALLS #3)
 * 성공률이 뜻이 없다. 확인하는 것은 ① 고정이 `resolveLive` 안에서 걸리는가
 * (바깥에서 덮으면 미리보기와 확정이 갈린다) ② 추론이 거부한 획을 고정이 놓는가
 * ③ 그렇게 놓인 획이 `userAxis`로 표시되는가(재분류가 덮지 않아야 한다).
 */
test("축 고정 — 추론이 거부한 획을 사용자가 강제한다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  await setup(page);
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click());

  const geo = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const s0 = S.doc().strokes.find((s: any) => s.seg3d);
    const r = (document.getElementById("ink") as HTMLCanvasElement).getBoundingClientRect();
    return { a: g3.project(s0.seg3d[0], ctx.principal, ctx.f), axis: s0.axis,
             originX: r.left, originY: r.top };
  });
  const cx = geo.originX, cy = geo.originY;

  // **어느 축과도 안 맞는 방향**으로 긋는다 — 고정이 없으면 2D로 대기해야 한다
  const wild = { x: cx + geo.a[0] + 120, y: cy + geo.a[1] - 130 };
  await page.mouse.move(cx + geo.a[0] + 10, cy + geo.a[1] + 8);
  await page.mouse.down();
  await page.mouse.move(wild.x, wild.y, { steps: 5 });
  await page.mouse.up();
  l.without_lock = await page.evaluate(() => {
    const st = window.S2S.doc().strokes[window.S2S.doc().strokes.length - 1];
    return { placed: !!st.seg3d, axis: st.axis, userAxis: st.userAxis };
  });

  // 같은 획을 **축 고정**으로 다시 긋는다
  // **그 앵커에서 실제로 뻗는 축**을 고정한다 — 임의의 축을 고르면 커서 광선과의
  // 최근접점이 카메라 뒤로 가서 끝점이 안 정해질 수 있다(그것은 고정의 실패가 아니다)
  await page.evaluate((ax) => window.S2S.setAxisLock(ax), geo.axis as 0 | 1 | 2);
  await page.mouse.move(cx + geo.a[0] + 10, cy + geo.a[1] + 8);
  await page.mouse.down();
  await page.mouse.move(wild.x, wild.y, { steps: 5 });
  const midLocked = await page.evaluate(() => {
    const lv = window.S2S.live();
    return { axis: lv?.axis ?? null, locked: lv?.locked ?? null, has_preview: !!lv?.seg,
             status: document.getElementById("status")!.innerText.includes("축 고정") };
  });
  await page.mouse.up();
  l.with_lock = await page.evaluate((mid) => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    return { mid_drag: mid, placed: !!st.seg3d, axis: st.axis, userAxis: st.userAxis,
             lock_state: S.axisLock(), last_note: document.getElementById("status")!.innerText };
  }, midLocked);

  expect((l.without_lock as any).placed).toBe(false);
  expect((l.with_lock as any).placed).toBe(true);
  expect((l.with_lock as any).axis).toBe(geo.axis);
  // **사용자가 고른 축은 재분류가 덮지 않는다**(`doc.ts`의 `userAxis`)
  expect((l.with_lock as any).userAxis).toBe(true);
  expect((l.with_lock as any).mid_drag.locked).toBe(true);
  expect((l.with_lock as any).mid_drag.status).toBe(true);

  l.what_this_does_not_say = [
    "고정이 오배정을 줄이는가 — **사용자 행동 의존이라 직접 측정이 불가능하다**(AS-L5)",
    "'고정하면 그 축으로 놓인다'는 정의상 참이다(#3) — 여기서 재는 것은 배선뿐이다",
  ];
  led.l_b5 = l;
});

/**
 * L-B.6 — **뷰 시스템**(§9.2~§9.4). 산출: `stage_browser.json`의 `l_b6`.
 *
 * 재는 것은 **배선**이다. 사전에 적은 목록 그대로다(#26 — 사후에 정하지 않는다):
 *   ① 뷰 목록이 뜬다
 *   ② 다른 뷰로 갔다가 돌아오면 **같은 화면**이다
 *   ③ 뷰를 지우면 그 안의 대기 획이 함께 사라지고 **승격된 획은 남는다**
 *   ④ 확정 뷰는 못 지운다
 *   ⑤ 다른 뷰의 대기 획은 숨는다(개수가 화면에 나온다)
 *
 * ⚠ **말하지 않는 것**: §9.3의 "새 각도에서 그리면 뷰가 생긴다"는 **궤도 후 그리기(L-B.8)가
 * 열려야 도달한다.** 여기서는 뷰를 코드로 만들어 전환·삭제·소유 규약만 확인한다(#23).
 * ⚠ **왕복 픽셀 차이에 임계를 걸지 않는다**(#5) — `pose()`와 `setPose()`가 서로의 역이라
 * **설계 보장**이다. 그래서 **틀린 자세를 넣은 대조군**을 함께 낸다(#30 양성 채널).
 */
test("뷰 시스템 — 목록·전환·삭제·소유", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  await setup(page);
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click());

  // ---- ① 목록. 확정 뷰 하나에서 시작한다
  l.initial = await page.evaluate(() => ({
    views: window.S2S.views(),
    rows: document.querySelectorAll("#views .row").length,
    current: window.S2S.currentView(),
    lifted: window.S2S.doc().strokes.filter((s: any) => s.seg3d).length,
    pending: window.S2S.doc().strokes.filter((s: any) => !s.seg3d).length,
  }));
  expect((l.initial as any).views.length).toBe(1);
  expect((l.initial as any).views[0].isConfirm).toBe(true);
  expect((l.initial as any).rows).toBe(1);

  // ---- ② 궤도 → 뷰 등록 → 확정 뷰로 갔다가 돌아온다. **같은 화면인가**
  const round = await page.evaluate(async () => {
    const S = window.S2S;
    const doc = await import("/src/ui/doc.ts");
    // 궤도로 돌린다(앱의 궤도 버튼과 같은 경로)
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click();
    const camT = S.stage.viewport.camera;
    camT.position.set(2.2, 1.4, 5.1);
    camT.lookAt(0, 0, 0);
    camT.updateMatrixWorld(true);
    const p = S.pose();
    const v = doc.newView("뷰 2", p);
    S.doc().views.push(v);
    S.switchView(v.id);
    const before = S.pose();
    // 확정 뷰로 갔다가 돌아온다
    S.switchView(S.views().find((x: any) => x.isConfirm).id);
    const pinnedInBetween = S.stage.isPinned;
    S.switchView(v.id);
    const after = S.pose();
    const d = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
    return {
      view_id: v.id, pinned_at_confirm_view: pinnedInBetween,
      pinned_now: S.stage.isPinned,
      pose_roundtrip_max_abs: Math.max(d(before.C, after.C),
        ...[0, 1, 2].map(i => d(before.R[i], after.R[i]))),
      current: S.currentView(),
    };
  });
  l.roundtrip = round;
  expect(round.pinned_at_confirm_view).toBe(true);
  expect(round.pinned_now).toBe(false);
  expect(round.current).toBe(round.view_id);

  // **양성 채널**(#30·#5) — 왕복 0이 항등인지 측정인지 가른다.
  // 틀린 자세를 넣으면 같은 비교가 0이 아니어야 한다. 안 움직이면 위의 0은 아무것도 안 말한다
  l.roundtrip_wrong_pose_control = await page.evaluate(() => {
    const S = window.S2S;
    const before = S.pose();
    const bent = { R: before.R, C: [before.C[0] + 0.7, before.C[1], before.C[2]] };
    S.orbitTo(bent);
    const after = S.pose();
    const d = (a: number[], b: number[]) => Math.max(...a.map((x: number, i: number) => Math.abs(x - b[i])));
    S.orbitTo(before);
    return { max_abs: d(before.C, after.C) };
  });
  expect((l.roundtrip_wrong_pose_control as any).max_abs).toBeGreaterThan(0.5);
  // 대조군이 움직이므로 아래 왕복 0은 **재는 것이 있는 0**이다. 다만 **임계는 안 건다**(#5)
  expect(round.pose_roundtrip_max_abs).toBeLessThan(1e-9);

  // ---- ⑤ 다른 뷰의 대기 획은 숨는다. 화면에 개수가 나오고 **픽셀로도 안 그려진다**
  l.ownership = await page.evaluate(async () => {
    const S = window.S2S;
    const doc = await import("/src/ui/doc.ts");
    const v2 = S.views().find((x: any) => !x.isConfirm).id;
    const confirmId = S.views().find((x: any) => x.isConfirm).id;
    // **대조군을 먼저 찍는다**(#6) — 그 상자 안에는 그리드·가이드도 있으므로 절대 픽셀 수는
    // 아무것도 말하지 않는다. **획을 넣기 전과 후의 차이**가 재는 것이다
    const el0 = document.getElementById("ink") as HTMLCanvasElement;
    const dpr0 = el0.width / Math.max(1, el0.clientWidth);
    const paintedIn = () => {
      const g0 = el0.getContext("2d")!;
      const bx = g0.getImageData(Math.round(95 * dpr0), Math.round(95 * dpr0),
                                 Math.round(300 * dpr0), Math.round(260 * dpr0));
      let n = 0;
      for (let i = 3; i < bx.data.length; i += 4) if (bx.data[i] > 8) n += 1;
      return n;
    };
    S.switchView(confirmId); S.refresh();
    const paintedBefore = paintedIn();
    // 뷰 2가 대기 획 둘을 소유한다(궤도 시점의 화면 좌표 — L-B.8이 열리기 전이라 손으로 넣는다)
    S.doc().strokes.push(doc.newSStroke([[100, 100], [200, 160]], v2));
    S.doc().strokes.push(doc.newSStroke([[120, 200], [240, 260]], v2));
    // **그 뷰에서 승격된 획도 하나 만든다**(리뷰어 [9]) — 삭제 팔이 "승격된 획은 남는다"를
    // 실제로 시험하려면 지울 뷰 안에 승격된 획이 **있어야** 한다. 없으면 공허 통과다
    const up = doc.newSStroke([[300, 300], [380, 340]], v2);
    up.seg3d = [[0.2, 0.1, 3.0], [0.6, 0.1, 3.0]];
    up.axis = 0;
    S.doc().strokes.push(up);
    S.switchView(confirmId);
    S.refresh();
    const statusAtConfirm = document.getElementById("status")!.innerText;
    // **픽셀로 본다**(리뷰어 [15]) — 소유가 다르다는 것과 안 그려진다는 것은 다른 주장이다
    const paintedAfter = paintedIn();
    // **양성 채널**(#30) — 같은 획을 **확정 뷰 소유로** 넣으면 픽셀이 실제로 늘어야 한다.
    // 안 늘면 위의 0은 "안 그린다"가 아니라 "측정이 안 돈다"이다
    const probe = doc.newSStroke([[110, 110], [210, 170]], confirmId);
    S.doc().strokes.push(probe);
    S.refresh();
    const paintedProbe = paintedIn();
    S.doc().strokes.pop();
    S.refresh();
    return {
      painted_before: paintedBefore, painted_after: paintedAfter,
      delta_other_view: paintedAfter - paintedBefore,
      delta_same_view_control: paintedProbe - paintedAfter,
      views: S.views(),
      status_mentions_hidden: /다른 뷰 2 숨김/.test(statusAtConfirm),
      pending_here: S.doc().strokes.filter((s: any) => !s.seg3d && s.viewRef === confirmId).length,
      pending_there: S.doc().strokes.filter((s: any) => !s.seg3d && s.viewRef === v2).length,
      lifted_in_v2: S.doc().strokes.filter((s: any) => s.seg3d && s.viewRef === v2).length,
      canvas_css: [el0.clientWidth, el0.clientHeight],
      size_heal_count: S.SIZE_HEAL.count,
    };
  });
  expect((l.ownership as any).status_mentions_hidden).toBe(true);
  expect((l.ownership as any).pending_there).toBe(2);
  expect((l.ownership as any).lifted_in_v2).toBe(1);
  // **다른 뷰의 2D 획은 한 픽셀도 안 그려진다** — 소유 질의가 아니라 화면 확인이다.
  // 절대 픽셀 수가 아니라 **넣기 전후의 차이**다(상자 안에 그리드·가이드가 있다)
  expect((l.ownership as any).delta_other_view).toBe(0);
  // **양성 채널**(#30) — 같은 획을 이 뷰 소유로 넣으면 실제로 늘어난다
  expect((l.ownership as any).delta_same_view_control).toBeGreaterThan(0);

  // ---- ④ 확정 뷰의 삭제 버튼은 비활성이다
  l.confirm_view_undeletable = await page.evaluate(() => {
    const S = window.S2S;
    const rows = [...document.querySelectorAll("#views .row")];
    const confirmId = S.views().find((x: any) => x.isConfirm).id;
    const row = rows.find(r => r.querySelector(`button[data-view="${confirmId}"]`))!;
    return { disabled: (row.querySelector(".del") as HTMLButtonElement).disabled };
  });
  expect((l.confirm_view_undeletable as any).disabled).toBe(true);

  // ---- ③ 뷰 삭제 — 그 안의 대기 획은 사라지고 승격된 획은 남는다
  l.delete = await page.evaluate(() => {
    const S = window.S2S;
    const v2 = S.views().find((x: any) => !x.isConfirm).id;
    const before = { lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
                     total: S.doc().strokes.length, views: S.doc().views.length,
                     lifted_in_deleted: S.doc().strokes.filter((s: any) => s.seg3d && s.viewRef === v2).length };
    const row = [...document.querySelectorAll("#views .row")]
      .find(r => r.querySelector(`button[data-view="${v2}"]`))!;
    (row.querySelector(".del") as HTMLButtonElement).click();
    return { before,
             after: { lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
                      total: S.doc().strokes.length, views: S.doc().views.length },
             note: document.getElementById("status")!.innerText,
             current: S.currentView(), rows: document.querySelectorAll("#views .row").length,
             canvas_css: [(document.getElementById("ink") as HTMLCanvasElement).clientWidth,
                          (document.getElementById("ink") as HTMLCanvasElement).clientHeight],
             canvas_css_after: [(document.getElementById("ink") as HTMLCanvasElement).clientWidth,
                                (document.getElementById("ink") as HTMLCanvasElement).clientHeight],
             size_heal_count: S.SIZE_HEAL.count };
  });
  const del = l.delete as any;
  expect(del.after.views).toBe(del.before.views - 1);
  expect(del.after.total).toBe(del.before.total - 2);      // 대기 둘만 사라진다
  // **그 뷰 안에 승격된 획이 있었는데 남았다**(리뷰어 [9]) — 이것이 §9.2의 핵심 규약이고
  // 지울 뷰에 승격된 획이 0개면 공허 통과다. 그래서 위에서 하나 만들어 두었다
  expect(del.before.lifted_in_deleted).toBe(1);
  expect(del.after.lifted).toBe(del.before.lifted);        // 승격된 것은 그대로다
  expect(del.rows).toBe(1);
  // **크기 규약**(#22 / AS-C7 — 착수에 걸리는 번호로 적었다). 뷰 전환이 카메라를 갈아 끼운다
  expect(del.canvas_css_after).toEqual((l.ownership as any).canvas_css);

  // ---- 되돌리기가 뷰 삭제도 되돌린다(스냅샷이 뷰를 복사한다)
  l.undo_restores_view = await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#bar button[data-act="undo"]')!.click();
    return { views: window.S2S.doc().views.length,
             total: window.S2S.doc().strokes.length };
  });
  expect((l.undo_restores_view as any).views).toBe(2);

  l.what_this_does_not_say = [
    "§9.3의 '새 각도에서 그리면 뷰가 생긴다' — **여기서는 뷰를 코드로 만든다.** "
    + "실제로 그려서 뷰가 생기는 경로는 **L-B.8의 스펙**이 확인한다(#23)",
    "자세 왕복 0은 **설계 보장**이다(#5) — `pose()`와 `setPose()`가 서로의 역이다. "
    + "임계를 걸지 않고 틀린 자세 대조군을 함께 낸다. "
    + "⚠ **대조군 0.7의 단위는 세계 좌표의 카메라 위치 성분**이고, 상자 대각이 약 2다",
    "궤도 시점의 2D 획은 손으로 넣었다 — 그 좌표가 실제로 그 시점의 화면 좌표인지는 L-B.8의 일이다",
    "'같은 화면이다'를 **자세 왕복 수치로** 확인했다 — 픽셀 대조는 아니다. "
    + "다른 뷰의 2D 획이 **0픽셀**인 것만 픽셀로 봤다",
  ];
  led.l_b6 = l;
});

/**
 * L-B.8 — **궤도 후 계속 그리기**(§7 · §9.3). 산출: `stage_browser.json`의 `l_b8`.
 *
 * 이것이 §9.3의 "궤도를 돌려 **새 각도에서 실제로 획을 그리면** 그 시점이 새 뷰로 등록된다"를
 * **도달 가능하게** 만든다. L-B.6은 뷰를 코드로 만들어 전환·삭제만 봤다(#23).
 *
 * 재는 것:
 *   ① 돌린 시점에서 스냅이 돈다(대상 개수 · 표식)
 *   ② 그리면 **새 뷰가 생기고** 그 획을 소유한다
 *   ③ 그 획이 **3D로 놓인다** — 그리고 그 3D가 **확정 시점으로 돌아가도 제자리**다
 *   ④ 같은 자세에서 한 획 더 그리면 **뷰가 안 늘어난다**("돌릴 때마다 만들지 않는다")
 *
 * ⚠ **말하지 않는 것**: 배치 정확도(참값 대조를 앱에서 안 한다) · 사람이 그 각도에서 얼마나
 * 정확히 겨냥하는지(표본 0) · 여기 쓰는 자세는 **코드로 만든 것**이고 마우스 궤도가 아니다.
 */
test("궤도 후 계속 그리기 — 새 각도가 새 뷰가 된다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  await setup(page);
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click());

  // ---- 돌린다. **앱의 궤도 버튼 경로 그대로**
  l.after_orbit = await page.evaluate(() => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click();
    const camT = S.stage.viewport.camera;
    camT.position.set(1.6, -1.1, 2.2);
    camT.lookAt(0.6, -0.4, 4.2);
    camT.updateMatrixWorld(true);
    // 그리기로 돌아온다 — 여기서부터 잉크 캔버스가 포인터를 받는다
    document.querySelector<HTMLButtonElement>('#bar button[data-act="draw"]')!.click();
    S.refresh();
    return { pinned: S.stage.isPinned, views: S.views().length,
             snap_targets: S.snapTargets(), has_pose: !!S.pose() };
  });
  expect((l.after_orbit as any).pinned).toBe(false);
  // **스냅 대상이 있다** — 돌린 시점에서도 3D 레이어가 대상이다(L-B.8이 연 것)
  expect((l.after_orbit as any).snap_targets).toBe(12);

  // ---- ① 돌린 시점에서 스냅이 도는가. 참 꼭짓점의 **이 시점 화면 좌표**를 겨냥한다
  const target = await page.evaluate(async () => {
    const S = window.S2S;
    const vc = await import("/src/s3d/viewCamera.ts");
    const g3 = await import("/src/s3d/geom3d.ts");
    const pose = S.pose();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const f = vc.fFromFov(45, size[1]);
    const principal: [number, number] = [size[0] / 2, size[1] / 2];
    // 3D 레이어의 한 끝점을 골라 그 화면 자리를 낸다
    const s0 = S.doc().strokes.filter((s: any) => s.seg3d)[0];
    const p = g3.project(vc.toView(pose, s0.seg3d[0]), principal, f);
    // 그 축 방향으로 조금 간 자리를 끝점으로 삼는다
    const q = g3.project(vc.toView(pose, s0.seg3d[1]), principal, f);
    return { a: p, b: [p[0] + (q[0] - p[0]) * 0.6, p[1] + (q[1] - p[1]) * 0.6] as [number, number] };
  });
  const frame0 = await page.locator("#frame").boundingBox();
  const ox = frame0!.x, oy = frame0!.y;

  await page.mouse.move(ox + target.a[0] + 3, oy + target.a[1] + 3);
  l.hover = await page.evaluate(() => {
    const h = window.S2S.hoverSnap();
    return { kind: h?.kind ?? null, has: !!h };
  });
  expect((l.hover as any).has).toBe(true);

  // ---- ②③ 그린다
  await page.mouse.down();
  await page.mouse.move(ox + target.b[0], oy + target.b[1], { steps: 6 });
  const mid = await page.evaluate(() => {
    const lv = window.S2S.live();
    return { axis: lv?.axis ?? null, has_preview: !!lv?.seg };
  });
  await page.mouse.up();

  l.drawn_in_orbit = await page.evaluate((m) => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    const cur = S.currentView();
    return {
      mid_drag: m,
      views: S.views(), current: cur,
      new_view_created: S.views().length === 2,
      stroke_owned_by_current: st.viewRef === cur,
      placed: !!st.seg3d, axis: st.axis,
      seg3d: st.seg3d,
      snap_kind: st.snapStart?.kind ?? null,
      snap_at: st.snapStart?.at ?? null,
    };
  }, mid);
  const d = l.drawn_in_orbit as any;
  // **§9.3이 도달했다** — 새 각도에서 그렸더니 뷰가 생겼다
  expect(d.new_view_created).toBe(true);
  expect(d.stroke_owned_by_current).toBe(true);
  expect(d.current).not.toBe("v1");
  // **돌린 시점에서 3D가 확정된다**(L-B.8의 핵심)
  expect(d.placed).toBe(true);
  expect(typeof d.axis).toBe("number");

  // ---- ③ 확정 시점으로 돌아가도 **그 3D가 제자리다**(세계 좌표로 저장했다는 뜻)
  l.back_to_confirm = await page.evaluate((seg: number[][]) => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="home"]')!.click();
    S.refresh();
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    const same = st.seg3d!.every((p: number[], i: number) =>
      p.every((v: number, k: number) => Math.abs(v - seg[i][k]) < 1e-12));
    return { pinned: S.stage.isPinned, unchanged: same, seg3d: st.seg3d,
             views: S.views().length, current: S.currentView() };
  }, d.seg3d);
  // **세계 좌표다.** 시점 좌표로 저장했다면 확정 시점에서 다른 자리가 된다
  expect((l.back_to_confirm as any).unchanged).toBe(true);
  expect((l.back_to_confirm as any).pinned).toBe(true);

  // ---- ④ 같은 자세로 돌아가 한 획 더 — **뷰가 안 늘어난다**
  l.second_stroke_same_pose = await page.evaluate(() => {
    const S = window.S2S;
    const v2 = S.views().find((x: any) => !x.isConfirm);
    S.switchView(v2.id);
    const before = S.views().length;
    // `viewForDrawing`이 지금 자세에 해당하는 뷰를 **찾아서** 낸다(새로 만들지 않는다)
    const got = S.viewForDrawing();
    return { before, after: S.views().length, resolved_to: got, expected: v2.id };
  });
  expect((l.second_stroke_same_pose as any).after)
    .toBe((l.second_stroke_same_pose as any).before);
  expect((l.second_stroke_same_pose as any).resolved_to)
    .toBe((l.second_stroke_same_pose as any).expected);

  l.what_this_does_not_say = [
    "배치 정확도 — 참값 대조를 앱에서 하지 않는다(DEFERRED). 여기서 재는 것은 **배선**이다",
    "자세는 **코드로 만든 것**이고 마우스 궤도가 아니다 — OrbitControls 자체는 이 스펙이 안 본다",
    "돌린 시점의 **지면 스냅은 끈다**(그 시점의 지면 평면을 세우지 않는다) — `on_face`가 안 나온다",
    "돌린 시점의 2D 대기 획은 **일괄 풀이에 안 넣는다**(`liftAll`은 확정 카메라의 소실점을 쓴다). "
    + "그 시점에서 못 놓인 획은 그 뷰의 2D로 남고, 앵커가 생기면 그때 올라간다(§9.1)",
  ];
  led.l_b8 = l;
});

/**
 * L-C.1 — **차수 승격**(§6.1). 산출: `stage_browser.json`의 `l_c1`.
 *
 * 재는 것은 **배선**이다: 소실점을 하나 더 잡고 `차수 승격`을 누르면
 *   ① 차수가 실제로 오른다 ② **전부 다시 풀린다** ③ **화면이 움직인다**(§6.2 — 초기 확정과 다르다)
 *   ④ `실행취소`가 되돌린다 ⑤ 스냅이 새 상으로 옮겨진다
 *
 * ⚠ **말하지 않는 것**: 승격이 나아지게 하는가(그것은 `order_promote.json`이 참값으로 잰다) ·
 * 사람이 세 번째 소실점을 얼마나 정확히 잡는가(표본 0).
 */
test("차수 승격 — 소실점이 하나 더 잡히면 전부 다시 풀린다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  // **2점으로 시작한다** — 수직 축 가이드를 안 세운다
  l.setup2pt = await page.evaluate(async () => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const m = await import("/test/scene3d.ts");
    const doc = await import("/src/ui/doc.ts");
    const vd = await import("/src/s3d/vpDraft.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const sc = m.scene(35, 15, 1000, size);
    const edges = m.boxEdges(sc, [0.6, -0.4, 4.2], 1.2, 1.0, 0.9);
    let s0 = 12345 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    const drawn = m.drawEdges(sc, edges, "medium", r, 0.37, 0.006, 0);
    for (const e of drawn) S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    const margin = 0.02 * Math.hypot(size[0], size[1]);
    const mk = (ax: number, ts: number[][]) => {
      const vp = sc.vps[ax];
      const out: unknown[] = [];
      for (const t of ts) {
        const q = [t[0] * size[0], t[1] * size[1]];
        const far = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
        const cl = vd.clipToCanvas([vp[0], vp[1]], far, size, margin);
        if (cl) out.push({ axis: ax, a: cl[0], b: cl[1] });
      }
      return out;
    };
    // 가로 둘만 — **수직 축은 비운다**(2점 투시)
    S.cam.guides = [...mk(0, [[0.30, 0.30], [0.30, 0.72]]), ...mk(1, [[0.70, 0.30], [0.70, 0.72]])];
    S.cam.apply(); S.refresh();
    (window as any).__SC2 = sc;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click();
    return { order: S.order(), lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             locked: S.cam.locked };
  });
  expect((l.setup2pt as any).order).toBe(2);
  expect((l.setup2pt as any).lifted).toBeGreaterThan(0);

  // ---- 소실점을 하나 더 잡는다 → 차수 승격
  l.promote = await page.evaluate(async () => {
    const S = window.S2S;
    const vd = await import("/src/s3d/vpDraft.ts");
    const sc = (window as any).__SC2;
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const margin = 0.02 * Math.hypot(size[0], size[1]);
    const before = {
      order: S.order(), lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
      first_id: S.doc().strokes.find((s: any) => s.seg3d).id,
      seg0: S.doc().strokes.find((s: any) => s.seg3d).seg3d.map((p: number[]) => [...p]),
      snap_count: S.doc().strokes.filter((s: any) => s.snapStart?.ofId).length,
    };
    S.unlockGuides();
    const vp = sc.vps[2];
    for (const t of [[0.42, 0.35], [0.62, 0.35]]) {
      const q = [t[0] * size[0], t[1] * size[1]];
      const far = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
      const cl = vd.clipToCanvas([vp[0], vp[1]], far, size, margin);
      if (cl) S.cam.guides.push({ axis: 2, a: cl[0], b: cl[1] });
    }
    S.cam.apply(); S.refresh();
    const midOrder = S.order();
    S.promoteOrderNow();
    const st0 = S.doc().strokes.find((s: any) => s.id === before.first_id)!;
    const moved = st0.seg3d
      ? st0.seg3d.some((p: number[], i: number) =>
          p.some((v: number, k: number) => Math.abs(v - before.seg0[i][k]) > 1e-9))
      : true;
    return {
      before, order_after_guides: midOrder, order: S.order(),
      lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
      geometry_moved: moved, locked: S.cam.locked, pinned: S.stage.isPinned,
      note: document.getElementById("status")!.innerText,
      size_heal_count: S.SIZE_HEAL.count,
    };
  });
  const pr = l.promote as any;
  // ① 차수가 올랐다
  expect(pr.before.order).toBe(2);
  expect(pr.order).toBe(3);
  // ③ **화면이 움직인다** — §5.3의 "전환 무변화"는 초기 확정에 한한 이야기다(§6.2)
  expect(pr.geometry_moved).toBe(true);
  expect(pr.locked).toBe(true);
  expect(pr.pinned).toBe(true);
  expect(pr.note).toContain("차수 승격 2점 → 3점");

  // ---- ④ 되돌리기(§6.2 — 주 판정 수단)
  l.undo = await page.evaluate((arg: { seg0: number[][]; id: string }) => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="undo"]')!.click();
    const st0 = S.doc().strokes.find((s: any) => s.id === arg.id)!;
    const same = !!st0.seg3d && st0.seg3d.every((p: number[], i: number) =>
      p.every((v: number, k: number) => Math.abs(v - arg.seg0[i][k]) < 1e-12));
    return { restored: same, lifted: S.doc().strokes.filter((s: any) => s.seg3d).length };
  }, { seg0: pr.before.seg0, id: pr.before.first_id });
  // **되돌리기가 승격 전 기하를 정확히 복원한다** — 그것이 §6.2의 전제다
  expect((l.undo as any).restored).toBe(true);
  expect((l.undo as any).lifted).toBe(pr.before.lifted);

  l.what_this_does_not_say = [
    "승격이 **나아지게 하는가** — 참값 대조는 `order_promote.json`이 한다(앱에는 참값이 없다)",
    "사람이 세 번째 소실점을 얼마나 정확히 잡는가 — **표본 0**(AS-L9)",
    "여기 소실점은 **참값을 넣은 것**이다. 검출·조정 오차는 L-A·L-B가 잰다",
  ];
  led.l_c1 = l;
});

/**
 * L-C.2 — **되돌리기 UI**(§6.2). 산출: `stage_browser.json`의 `l_c2`.
 *
 * §6.2는 "사용자가 즉시 **보고** 되돌린다"이다. L-C.1이 배선을 확인했고 여기는 **그 앞의 둘**이다:
 *   ① 승격이 무엇을 잃었는지 **화면에 나온다**(내려간 획 · 끊긴 스냅)
 *   ② **차수를 명시한 되돌리기**가 생기고, 그것이 **소실점과 기하를 함께** 되돌린다
 *   ③ ⚠ **회귀** — 일반 `실행취소`도 카메라를 되돌린다. 초판은 문서만 되돌려
 *      기하는 옛 해 · 소실점은 새 것인 **좌표계가 섞인 상태**를 만들었다(§6.1이 금지한 것)
 *
 * ⚠ **말하지 않는 것**: 사용자가 그 표시를 보고 옳게 판단하는가(표본 0, AS-C1) ·
 * 재연결이 붙이는 자리가 옳은가(그것은 스냅의 문제이고 `snap.json`이 잰다).
 */
test("되돌리기 UI — 승격이 잃은 것이 보이고, 차수로 되돌아간다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  // ---- 2점으로 확정하고, 수직 가이드를 세워 승격한다(`l_c1`과 같은 절차)
  l.promote = await page.evaluate(async () => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const m = await import("/test/scene3d.ts");
    const doc = await import("/src/ui/doc.ts");
    const vd = await import("/src/s3d/vpDraft.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const sc = m.scene(35, 15, 1000, size);
    const edges = m.boxEdges(sc, [0.6, -0.4, 4.2], 1.2, 1.0, 0.9);
    let s0 = 12345 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    for (const e of m.drawEdges(sc, edges, "medium", r, 0.37, 0.006, 0)) {
      S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    }
    const margin = 0.02 * Math.hypot(size[0], size[1]);
    const mk = (ax: number, ts: number[][]) => {
      const vp = sc.vps[ax];
      const out: unknown[] = [];
      for (const t of ts) {
        const q = [t[0] * size[0], t[1] * size[1]];
        const far = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
        const cl = vd.clipToCanvas([vp[0], vp[1]], far, size, margin);
        if (cl) out.push({ axis: ax, a: cl[0], b: cl[1] });
      }
      return out;
    };
    S.cam.guides = [...mk(0, [[0.30, 0.30], [0.30, 0.72]]), ...mk(1, [[0.70, 0.30], [0.70, 0.72]])];
    S.cam.apply(); S.refresh();
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click();
    const before = {
      order: S.order(),
      lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
      // **전체 상태를 찍어 둔다** — 되돌리기가 이것과 같아져야 한다
      ids3d: S.doc().strokes.filter((s: any) => s.seg3d).map((s: any) => s.id).sort(),
      guides: S.camSnapshot().guides.length,
      pts0: S.doc().strokes.map((s: any) => [s.id, s.pts2d[0][0], s.pts2d[0][1]]),
    };
    S.unlockGuides();
    for (const g of mk(2, [[0.42, 0.35], [0.62, 0.35]])) S.cam.guides.push(g as any);
    S.cam.apply(); S.refresh();
    S.promoteOrderNow();
    return {
      before, order: S.order(), report: S.promoteReport(), marks: S.orderMarks(),
      lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
      panel: document.querySelector("#status .promote")?.textContent ?? null,
      revert_button: !!document.querySelector('#bar button[data-act="revert2"]'),
    };
  });
  const pr = l.promote as any;
  expect(pr.before.order).toBe(2);
  expect(pr.order).toBe(3);
  // ① **요약이 화면에 있다.** 개수만 상태 줄에 묻히면 "눈에 띄게"가 아니다(§6.2)
  expect(pr.panel).toContain("차수 승격 2점 → 3점");
  expect(pr.report).not.toBeNull();
  // ② **차수를 명시한 되돌리기 버튼이 생겼다**
  expect(pr.marks).toEqual([2]);
  expect(pr.revert_button).toBe(true);
  // **잃은 것이 있으면 그것이 패널에 적힌다** — 없으면 없다고 적는다(#7)
  const lost = pr.report.dropped.length, snapLost = pr.report.snapLost.length;
  l.what_was_lost = { dropped: lost, snap_lost: snapLost,
                      reanchored: `${pr.report.reanchored}/${pr.report.had}` };
  if (lost) expect(pr.panel).toContain("3D에서 내려왔습니다");
  if (snapLost) expect(pr.panel).toContain("끊겼습니다");

  // ---- ③ ⚠ **회귀**: 일반 `실행취소`가 카메라 상태까지 되돌리는가
  //
  // ⚠ **되돌아가는 자리를 정확히 적는다**: `실행취소` 한 번은 **승격 직전**으로 간다.
  // 그 자리는 "`소실점 다시`를 눌러 가이드를 셋째 축까지 세웠지만 **아직 승격은 안 한**" 상태이고,
  // 앱이 명시적으로 지원하는 상태다(`unlock`의 안내문: "확정된 3D는 그대로 있고,
  // 승격을 눌러야 다시 풀립니다"). 그러므로 **`S.order()`는 3이 맞다** — 가이드가 그대로이기 때문이다.
  // **되돌아와야 하는 것은 `locked` · `lockedOrder` · 기하**이고, 초판은 그 셋을 안 되돌렸다.
  l.undo_restores_camera = await page.evaluate(() => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="undo"]')!.click();
    const c = S.camSnapshot();
    return { order: S.order(), guides: c.guides.length, locked: c.locked,
             locked_order: c.lockedOrder,
             lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             report_gone: S.promoteReport() === null };
  });
  const ur = l.undo_restores_camera as any;
  // **이것이 초판의 결함이다** — 문서만 되돌리면 이 셋이 승격 후 값 그대로 남는다
  expect(ur.locked).toBe(false);
  expect(ur.locked_order).toBe(2);
  expect(ur.lifted).toBe(pr.before.lifted);
  expect(ur.report_gone).toBe(true);
  // 가이드는 **안 되돌아온다** — 승격 직전에 이미 셋째 축이 서 있었다. 그것이 옳다
  expect(ur.order).toBe(3);

  // ---- ④ **차수 되돌리기**: 다시 승격한 뒤 획을 더 그려도 한 번에 2점으로 간다
  l.revert_by_order = await page.evaluate(async (arg: { pts0: [string, number, number][] }) => {
    const S = window.S2S;
    const doc = await import("/src/ui/doc.ts");
    S.promoteOrderNow();                              // 되돌린 자리에서 다시 승격한다
    const afterPromote = S.order();
    // 승격 뒤에 획을 하나 더 그린다 — `실행취소` 한 번으로는 못 돌아가는 자리를 만든다
    S.doc().strokes.push(doc.newSStroke([[120, 140], [260, 200]], S.doc().currentView));
    S.refresh();
    const strokesBefore = S.doc().strokes.length;
    S.revertToOrder(2);
    const map = new Map(S.doc().strokes.map((s: any) => [s.id, s.pts2d[0]]));
    // **`pts2d[0]`까지 되돌아왔는가**(#34) — 승격이 스냅된 시작점을 새 상으로 옮기므로
    // 그것이 안 돌아오면 시작점만 새 카메라 자리에 남는다(L-C.1이 p90 311px로 잰 이동이다)
    const pts_restored = arg.pts0.every(([id, x, y]) => {
      const p = map.get(id) as number[] | undefined;
      return !!p && Math.abs(p[0] - x) < 1e-12 && Math.abs(p[1] - y) < 1e-12;
    });
    return {
      after_promote: afterPromote, strokes_before_revert: strokesBefore,
      order: S.order(), guides: S.camSnapshot().guides.length,
      ids3d: S.doc().strokes.filter((s: any) => s.seg3d).map((s: any) => s.id).sort(),
      pts_restored, strokes: S.doc().strokes.length,
      note: document.getElementById("status")!.innerText,
    };
  }, { pts0: pr.before.pts0 });
  const rv = l.revert_by_order as any;
  expect(rv.after_promote).toBe(3);
  // **한 번에 2점으로 간다** — 그 사이에 그린 획도 함께 사라진다(스냅샷 그대로다)
  expect(rv.order).toBe(2);
  expect(rv.guides).toBe(pr.before.guides);
  expect(rv.ids3d).toEqual(pr.before.ids3d);
  expect(rv.pts_restored).toBe(true);
  expect(rv.note).toContain("2점으로 되돌렸습니다");

  // ---- ⑤ ⚠ **잃은 것이 실제로 있는 픽스처에서 다시 본다.**
  //
  // 위 픽스처는 `dropped = 0 · snapLost = 0`이라 **표시 경로를 한 줄도 안 지난다** —
  // 통과해도 공허하다(리뷰어가 L-B.6 [9]에서 같은 형태를 잡았다: "지울 뷰 안에 승격 획을
  // 만들어 넣은 뒤 다시 봤다"). 그래서 **떨어지는 획과 끊기는 스냅이 나오는 픽스처**로 바꾼다.
  // 잉크 등급·시드는 `order_undo.json`이 "176/216 장면에서 내려간 획이 생긴다"고 잰 것과
  // 같은 현상이고, 여기서는 그 중 하나를 **눈으로 보이는지** 확인한다.
  l.loss_shown = await page.evaluate(async () => {
    const S = window.S2S;
    const m = await import("/test/scene3d.ts");
    const doc = await import("/src/ui/doc.ts");
    const vd = await import("/src/s3d/vpDraft.ts");
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const sc = m.scene(35, 15, 1000, size);
    const edges = m.boxEdges(sc, [0.6, -0.4, 4.2], 1.2, 1.0, 0.9);
    let s0 = 4242 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    for (const e of m.drawEdges(sc, edges, "medium", r, 0.37, 0.04, 0)) {
      S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    }
    const margin = 0.02 * Math.hypot(size[0], size[1]);
    const mk = (ax: number, ts: number[][]) => {
      const vp = sc.vps[ax]; const out: any[] = [];
      for (const t of ts) {
        const q = [t[0] * size[0], t[1] * size[1]];
        const far = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
        const cl = vd.clipToCanvas([vp[0], vp[1]], far, size, margin);
        if (cl) out.push({ axis: ax, a: cl[0], b: cl[1] });
      }
      return out;
    };
    S.cam.guides = [...mk(0, [[0.30, 0.30], [0.30, 0.72]]), ...mk(1, [[0.70, 0.30], [0.70, 0.72]])];
    S.cam.apply(); S.refresh();
    document.querySelector<HTMLButtonElement>('#bar button[data-act="confirm"]')!.click();
    S.unlockGuides();
    for (const g of mk(2, [[0.42, 0.35], [0.62, 0.35]])) S.cam.guides.push(g);
    S.cam.apply(); S.refresh();
    S.promoteOrderNow();
    const rep = S.promoteReport();

    // **표식이 실제로 캔버스에 그려졌는가** — 문구만 보면 그리기 경로는 안 지난다.
    // 끊긴 스냅의 시작점 둘레에서 ⊘의 붉은색을 찾는다. 좌표는 **CSS 픽셀**이고
    // 캔버스는 dpr 배율이므로 그만큼 곱해 읽는다(D-C3·#21 — dpr 1에서만 보면 안 된다)
    const g2 = el.getContext("2d")!;
    const dpr = el.width / el.clientWidth;
    const near = (p: number[], want: [number, number, number]) => {
      const R = Math.round(9 * dpr);
      const x0 = Math.max(0, Math.round(p[0] * dpr) - R), y0 = Math.max(0, Math.round(p[1] * dpr) - R);
      const d = g2.getImageData(x0, y0, R * 2, R * 2).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 40 && Math.abs(d[i] - want[0]) < 45
            && Math.abs(d[i + 1] - want[1]) < 45 && Math.abs(d[i + 2] - want[2]) < 45) return true;
      }
      return false;
    };
    const byId = new Map(S.doc().strokes.map((s: any) => [s.id, s]));
    const snapMark = rep.snapLost.length
      ? near((byId.get(rep.snapLost[0]) as any).pts2d[0], [192, 57, 43]) : null;
    const dropMark = rep.dropped.length
      ? near((byId.get(rep.dropped[0]) as any).pts2d[0], [230, 126, 34]) : null;

    const panel = document.querySelector("#status .promote")?.textContent ?? "";
    const relinkBtn = document.querySelector<HTMLButtonElement>('#status button[data-act="relink"]');
    const beforeRelink = rep.snapLost.length;
    relinkBtn?.click();
    const rep2 = S.promoteReport();
    // 되돌리기가 재연결도 되돌리는가 — 표시가 **다시 나와야** 한다
    document.querySelector<HTMLButtonElement>('#bar button[data-act="undo"]')!.click();
    const rep3 = S.promoteReport();
    return {
      // ⚠ **매개변수를 원장에 남긴다**(#25 — 원장 밖 측정은 규칙이 있어도 안 걸린다)
      fixture: { grade: "medium", end_jitter: 0.04, seed: 4242, skew: 0.37,
                 scene: "yaw 35 · pitch 15 · f 1000", box: [1.2, 1.0, 0.9] },
      dropped: rep.dropped.length, gained: rep.gained.length,
      snap_lost: beforeRelink, snap_had: rep.had, reanchored: rep.reanchored,
      panel_says_dropped: panel.includes("3D에서 내려왔습니다"),
      panel_says_snap_lost: panel.includes("끊겼습니다"),
      relink_button: !!relinkBtn,
      drop_mark_drawn: dropMark, snap_mark_drawn: snapMark,
      relinked: rep2?.relinked ?? null, snap_lost_after: rep2?.snapLost.length ?? null,
      undo_restores_report: rep3 != null && rep3.snapLost.length === beforeRelink
                            && rep3.relinked === null,
    };
  });
  const ls = l.loss_shown as any;
  // **픽스처가 실제로 잃는다** — 안 잃으면 아래 판정이 전부 공허하다(#32의 실행 카운터와 같은 형태)
  expect(ls.dropped).toBeGreaterThan(0);
  expect(ls.snap_lost).toBeGreaterThan(0);
  // ① 문구 ② **그리기 경로** — 둘 다 본다
  expect(ls.panel_says_dropped).toBe(true);
  expect(ls.panel_says_snap_lost).toBe(true);
  expect(ls.drop_mark_drawn).toBe(true);
  expect(ls.snap_mark_drawn).toBe(true);
  // ③ 재연결은 **버튼이다** — 자동으로 안 한다(A-3·D-L25)
  expect(ls.relink_button).toBe(true);
  expect(ls.relinked.tried).toBe(ls.snap_lost);
  expect(ls.snap_lost_after).toBe(ls.snap_lost - ls.relinked.ok);
  // ④ 되돌리면 표시가 **다시 나온다** — 안 나오면 사용자가 무엇을 되돌렸는지 못 본다
  expect(ls.undo_restores_report).toBe(true);

  // ⚠ **이 픽스처를 어떻게 골랐는지 적는다**(#25·#12 · 리뷰어 [7]).
  l.loss_fixture_provenance = {
    how: "첫 픽스처(medium · jitter 0.006 · seed 12345)가 `dropped 0 · snapLost 0`이라 "
      + "표시 경로를 안 지났다. **등급 2 × jitter 3 × 시드 3 = 18조합을 훑어** "
      + "`dropped > 0 && snapLost > 0`인 것을 골랐다. 18조합 중 **셋**이 그랬다 "
      + "(medium/0.04/4242 · coarse/0.02/4242 · coarse/0.04/4242).",
    why_not_cherry_picking: "**결론을 만들려고 고른 것이 아니라 코드 경로를 지나려고 골랐다.** "
      + "이 테스트가 판정하는 것은 '표시가 뜨는가'이지 '얼마나 자주 잃는가'가 아니다 — "
      + "빈도는 `order_undo.json`이 216장면으로 잰다(내려감 176/216 · 스냅 끊김 94/216).",
    where_in_population: "⚠ **이 픽스처는 모집단의 꼬리 쪽이다.** 스냅 끊김 4/5 = 0.80인데 "
      + "모집단은 295/1676 = **0.176**이고, 장면당 끊김은 중앙 **0** · p90 **4**다"
      + "(`order_undo.json@46c028d1`) — 즉 **p90 자리**다. "
      + "표시 경로를 지나려면 그래야 하지만, **이 수를 대표값으로 인용하면 안 된다.**",
    off_grid: "⚠ **격자 밖이 셋이다**(#12): jitter 0.04(격자 {0, 0.01, 0.03, 0.05}) · "
      + "seed 4242(격자 {1..6}) · **skew 0.37**(하네스는 0.12 — 3배다). "
      + "skew는 이 파일의 다른 브라우저 픽스처와 같은 값이고 **훑기에서 흔들지 않았다**(고정). "
      + "배선 확인용이고 여기서 나온 수치를 원장 값으로 쓰지 않는다.",
  };

  l.what_this_does_not_say = [
    "사용자가 그 표시를 보고 **옳게 판단하는가** — 표본 0(AS-C1)",
    "재연결이 붙이는 자리가 **옳은가** — 그것은 스냅의 문제이고 `snap.json`이 잰다. "
      + "여기서 재는 것은 **끊긴 것이 보이고 되돌릴 수 있는가**뿐이다",
    "**얼마나 자주 잃는가** — 이 픽스처는 표시 경로를 지나려고 고른 **p90 자리**다. "
      + "빈도는 `order_undo.json`이 216장면으로 잰다",
    "여러 차수 표식(1점·2점·3점)이 동시에 있을 때의 동작 — 이 픽스처는 2 → 3 하나뿐이다",
    "돌린 뷰에서의 표시 — `drawPromoteLoss`는 **확정 시점에서만** 그린다(`pts2d`가 그 화면 좌표다)",
  ];
  led.l_c2 = l;
});
