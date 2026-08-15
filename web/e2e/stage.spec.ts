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
