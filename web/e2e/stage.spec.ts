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
import { gate } from "../test/gate.js";
import { setupScene } from "./fixture.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const led: Record<string, unknown> = {};

declare global {
  interface Window { S2S: any; __SC: any }
}

/**
 * 합성 상자를 넣고 **참 소실점으로** 가이드를 세운다 — 사람이 완벽히 맞춘 극한.
 *
 * `boxes = 2`면 **첫 상자와 면을 맞댄 두 번째 상자**를 함께 넣는다(L-D.3).
 * 상자 하나로는 안 되는 것 셋이 있다:
 *   ① **승격 연쇄가 픽스처 상한에 갇힌다** — 장면당 12획이면 깊이 4가 거의 상한이다
 *      (`promote.json`의 1회 720 → 2회 192 → 3회 25 → 4회 1이 그 모양이다)
 *   ② 뷰 하나에 **구조가 하나**뿐이라 "이어 그리기"가 같은 덩어리 안에서만 일어난다
 *   ③ 지연·스크린샷 회귀가 **획 24개 규모**에서 어떤지 모른다
 * 두 번째 상자는 `axes[0]` 방향으로 첫 상자의 `a`만큼 밀어 **면을 공유**한다 —
 * 그래야 둘을 잇는 획이 스냅으로 붙고 ①의 연쇄가 상자를 건너간다.
 */
async function setup(page: Page, opts: { boxes?: 1 | 2 } = {}) {
  // ⚠ **본체는 `e2e/fixture.ts`로 옮겼다**(2026-08-17 G) — G의 하네스가 같은 장면을 쓰는데
  // 복사하면 픽스처가 둘이 되고 한쪽만 고쳐지는 자리가 생긴다.
  return setupScene(page, opts);
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
    window.S2S.confirmNow();
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
    // **소실점을 옮겨 수심(= 주점)을 화면 중심 밖으로 보낸다**(이론서 6.3).
    // 옛 판은 가이드 핸들을 밀었다 — 가이드가 없어졌으므로(D-L37) 소실점을 직접 민다.
    (window as any).__RULES0 = S.cam.dumpRules();      // **끝나면 되돌린다**(아래)
    const r = S.cam.dumpRules();
    // ⚠ **수평 소실점을 미는 것으로는 주점 x가 안 움직인다** — 롤 0에서 `V₁V₂`가 수평이면
    // `V₃`에서 내린 수선이 수직선이라 **주점 x = `V₃.x`**다(이론서 6.3). 실제로 0이 나왔다.
    // 그래서 **수직 소실점을 민다** — 그것이 주점을 화면 중심 밖으로 보내는 유일한 손잡이다.
    // ⚠⚠ **왼쪽으로 민다.** `threeIntrinsics`의 `offsetX = W/2 − pₓ`이고 `W = 2·max(pₓ, w−pₓ)`라
    // **주점이 중심보다 오른쪽이면 `offsetX`가 정확히 0이 된다** — 오른쪽으로 밀었다가 실제로
    // 0이 나왔다. 이 스펙이 재려는 것은 `setViewOffset`이 실제로 걸리는가이므로 왼쪽이어야 한다.
    r.slots[2].at = [r.slots[2].at[0] - 40, r.slots[2].at[1]];
    S.cam.loadRules(r);
    const ctx = S.cam.ctx();
    S.stage.pinTo(ctx.principal, ctx.f);
    const el = document.getElementById("ink") as HTMLCanvasElement;
    return { principal: ctx.principal, canvas_center: [el.clientWidth / 2, el.clientHeight / 2],
             vps: S.cam.vps(),
             view_offset: { ...S.stage.viewport.camera.view } };
  });
  expect(Math.abs((led.offcenter_principal as any).view_offset.offsetX)).toBeGreaterThan(1);
  const off = await pixelGap(page, "css");
  led.offcenter_identity_px = off;
  expect(off.max).toBeLessThan(1e-6);
  // ⚠ **되돌린다.** 이 아래 검사들은 **확정 카메라로 푼 기하**를 되쏘므로, 카메라만 옮겨 두면
  // 상이 어긋나 "칠해졌는가"가 실패한다(실측: −140에서 0/12 · −30에서 7/12 · −2에서 11/12 —
  // 즉 **밀기의 크기에 비례해 어긋난다**. 임계를 낮추면 그 사실이 가려진다).
  // 옛 판은 가이드 핸들을 26px 밀어 소실점이 거의 안 움직였고 그래서 드러나지 않았다.
  await page.evaluate(() => {
    const S = window.S2S;
    S.cam.loadRules((window as any).__RULES0);
    const ctx = S.cam.ctx();
    S.stage.pinTo(ctx.principal, ctx.f);
    S.refresh();
  });

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
  // ⛔ **`ink_painted_px === 0`이 뒤집혔다**(2026-08-19 15차 항목 8 · D-L101): 돌린 시점에도
  // **축 소실점·지평선·격자**가 그 시점의 값으로 그려진다(지시 8: "어느 시점에서든"). 잉크
  // 캔버스가 그 표시를 담으므로 0이 아니다. 재는 뜻(3D는 GL이 그린다)은 그대로다 —
  // **잉크 캔버스에 3D 획이 안 그려진다**는 것은 `gl_painted_px`가 든다.
  // ⚠ **지우지 않고 뒤집는다**(2차 리뷰어 [11]) — 새 거동도 이 팔이 잠근다
  expect((led.orbit as any).ink_painted_px).toBeGreaterThan(0);
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

    const el = document.getElementById("ink") as HTMLCanvasElement;
    const diag = Math.hypot(el.clientWidth, el.clientHeight);
    const lens: number[] = [];   // **가이드가 없어졌다**(D-L37) — 길이라는 양이 사라졌다
    return {
      canvas: [el.clientWidth, el.clientHeight], diag,
      required_min_len_px: null,
      actual_guide_len_px: lens.map((x: number) => +x.toFixed(1)),
      note: "⚠ **대상이 사라졌다**(D-L37) — 가이드가 없어졌으므로 '가이드 길이'도 "
        + "'요구 길이(`min_guide_ratio`)'도 없는 양이다. 빈 배열·`null`이고, 이 자리를 "
        + "지우지 않는 이유는 왜 그 규칙이 있었는지가 근거이기 때문이다(#29의 숙제였다).",
    };
  });
});

test("저장·복원 — 뷰와 2D 레이어가 새로고침을 넘는다(L-D.2)", async ({ page }) => {
  // 착수 시 PITFALLS 최근 다섯을 읽었다. 걸리는 것:
  //   #32(미실행을 반증으로 안 쓴다 — 저장소를 비우고 시작해 **이번 실행이** 쓴 것을 본다)
  //   #34(v1 `store.ts`가 같은 DB를 쓴다 — 키가 갈렸는지 여기서 함께 본다)
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  await setup(page);

  // 확정 → 3D. 그 뒤 **궤도를 돌려 새 뷰**를 만들고 거기서 한 획 더 긋는다(2D 레이어).
  const before = await page.evaluate(async () => {
    const S = window.S2S;
    const doc = await import("/src/ui/doc.ts");
    window.S2S.confirmNow();
    // 새 각도 → 새 뷰(§9.3). **앱의 궤도 버튼 경로 그대로**다(#17) —
    // `pose()`는 궤도로 풀리기 전에는 `null`이라(확정 시점에 고정) 직접 카메라를 옮긴다.
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click();
    const camT = S.stage.viewport.camera;
    camT.position.set(1.6, -1.1, 2.2);
    // ⚠⚠ **자세를 `lookAt`만으로 주면 안 된다**(2026-08-17 G에서 잡았다 — 이 시험은 **간헐적으로**
    // 실패하고 있었다): 렌더 루프의 `controls.update()`가 카메라를 자기 `target`으로 **다시 겨눈다**.
    // 두 `evaluate` 사이에 프레임이 도느냐에 따라 자세가 갈렸고, 안 돌면 상자가 **카메라 뒤**라
    // `project()`가 `null`을 내 다음 줄이 던졌다. `target`을 함께 주고 **여기서 `update()`를 부르면**
    // 그 뒤의 `update()`가 항등이 된다. 규약 변환은 `stage.unpin`의 그것과 같다(우리 y 아래·z 안쪽).
    const ctl = S.stage.viewport.controls;
    ctl.target.set(0.6, 0.4, -4.2);              // 우리 (0.6,-0.4,4.2) → three
    ctl.update();
    camT.updateMatrixWorld(true);
    document.querySelector<HTMLButtonElement>('#tools button[data-act="draw"]')!.click();
    S.refresh();
    const v = S.viewForDrawing();
    S.doc().currentView = v;
    S.doc().strokes.push(doc.newSStroke([[120, 140], [260, 210]], v));
    S.refresh();
    await S.saveNow();
    const d = S.doc();
    return {
      views: d.views.map((x: any) => ({ id: x.id, name: x.name, pose: !!x.pose })),
      currentView: d.currentView,
      strokes: d.strokes.map((x: any) => ({ id: x.id, viewRef: x.viewRef, axis: x.axis,
                                            seg3d: x.seg3d, pts2d0: x.pts2d[0] })),
      lifted: d.strokes.filter((x: any) => x.seg3d).length,
      pending: d.strokes.filter((x: any) => !x.seg3d).length,
      standing: S.standing(),
      axes: S.cam.rules.slots.filter(Boolean).length,
      order: S.order(),
    };
  });
  expect(before.lifted).toBe(12);
  expect(before.pending).toBe(1);                     // 새 뷰의 2D 레이어 한 획
  expect(before.views.length).toBe(2);

  // ---- 새로고침 ----
  const t0 = Date.now();
  await page.reload();
  await page.waitForFunction(() => !!window.S2S && window.S2S.doc().strokes.length > 0);
  const after = await page.evaluate(() => {
    const S = window.S2S, d = S.doc();
    return {
      views: d.views.map((x: any) => ({ id: x.id, name: x.name, pose: !!x.pose })),
      currentView: d.currentView,
      strokes: d.strokes.map((x: any) => ({ id: x.id, viewRef: x.viewRef, axis: x.axis,
                                            seg3d: x.seg3d, pts2d0: x.pts2d[0] })),
      lifted: d.strokes.filter((x: any) => x.seg3d).length,
      pending: d.strokes.filter((x: any) => !x.seg3d).length,
      standing: S.standing(),
      axes: S.cam.rules.slots.filter(Boolean).length,
      order: S.order(),
      newId: (() => { const n = S.doc().strokes.length; return `s${n}`; })(),
    };
  });

  // **한 비트도 안 변한다** — `pts2d`·`seg3d`·`viewRef`·축
  expect(after.strokes).toEqual(before.strokes);
  expect(after.views).toEqual(before.views);
  expect(after.currentView).toBe(before.currentView);
  expect(after.lifted).toBe(before.lifted);
  expect(after.pending).toBe(before.pending);         // **2D 레이어가 살아 있다**(§9.1)
  expect(after.standing).toBe(true);
  expect(after.axes).toBe(before.axes);              // 규칙 상태가 카메라의 입력이다(D-L37)
  expect(after.order).toBe(before.order);

  // **새 획의 id가 안 겹친다**(v1에서 실제로 겪었다)
  const fresh = await page.evaluate(async () => {
    const S = window.S2S;
    const doc = await import("/src/ui/doc.ts");
    const s = doc.newSStroke([[10, 10], [20, 20]], S.doc().currentView);
    return { id: s.id, collides: S.doc().strokes.some((x: any) => x.id === s.id) };
  });
  expect(fresh.collides).toBe(false);

  // 내보내기가 **뷰 이름을 담고 3D만** 낸다
  // ⚠ **2026-08-17 D-3이 채널 필터를 더했다**: 기본은 결과선만 나가고 이 픽스처의 획은
  // 보조선(기본 채널)이다. 옵션을 켜서 종전과 같은 것을 잰다 — 채널 자체는
  // `test/channel.test.ts`가 잠근다(#17: 한 시험이 두 가지를 재지 않는다).
  const exp = await page.evaluate(() => {
    const S = window.S2S;
    S.setExportGuides(true);
    const o = S.exportObj(), g = S.exportGltf();
    return { objStrokes: o.strokes, objHasFace: /^f /m.test(o.data),
             objHasView: /view=/.test(o.data), skipped: o.skippedUnplaced,
             gltfNodes: g.data.nodes.length, gltfName: g.data.nodes[0].name,
             gltfModes: [...new Set(g.data.meshes.map((m: any) => m.primitives[0].mode))] };
  });
  expect(exp.objStrokes).toBe(12);                    // 2D 레이어는 안 나간다
  expect(exp.skipped).toBe(0);                        // `linesFromDoc`이 이미 걸렀다
  expect(exp.objHasFace).toBe(false);
  expect(exp.objHasView).toBe(true);
  expect(exp.gltfModes).toEqual([3]);
  expect(exp.gltfName).toContain("@");

  // **비우기가 저장본까지 지운다** — 안 지우면 새로고침에서 버린 작업이 되살아난다
  await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    await new Promise(r => setTimeout(r, 900));       // 디바운스(600ms)보다 길게
  });
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  const cleared = await page.evaluate(() => window.S2S.doc().strokes.length);
  expect(cleared).toBe(0);

  // **블록 이름을 `l_*` 규약에 맞춘다**(리뷰어 [1]) — 옛 이름 `persist`는 S-9 원장
  // `persist.json`과 헷갈렸고, HANDOFF가 "원장 밖"으로 잘못 읽어 중복 append를 지시했다.
  led.l_d3_save_roundtrip = {
    reload_ms: Date.now() - t0,
    views: after.views.length, lifted: after.lifted, pending_2d: after.pending,
    identical: true, export: exp,
    // **`identical`이 무엇을 덮는지 적는다**(PITFALLS #17, 리뷰어 [15]).
    // "같다"만 적으면 다음 세션이 그것을 전수 대조로 읽는다.
    identical_covers: ["strokes[].id", "strokes[].viewRef", "strokes[].axis",
                       "strokes[].seg3d", "strokes[].pts2d[0]",
                       "views[].id", "views[].name", "views[].pose 유무",
                       "currentView", "lifted 수", "pending 수", "standing",
                       "cam.rules 축 수", "order"],
    identical_does_not_cover: ["pts2d 전체(첫 점만 본다)", "snapStart", "color·width·layer",
                               "되돌리기 이력", "orderMarks"],
    // **저장 v2가 못 담는 것**(리뷰어 [6]) — 복원 뒤 어떻게 보이는지 한 줄씩.
    v2_does_not_hold: {
      "되돌리기 이력": "복원 뒤 되돌리기 깊이가 0이다. 새로고침 전 조작은 못 되돌린다",
      orderMarks: "차수 표식(승격이 무엇을 잃었는지)이 사라진다 — **되돌릴 대상이 안 보인다**",
      "못 살린 스냅 표식": "⚠ **가장 나쁜 항목이다** — 승격에서 대상이 안 놓여 못 옮긴 시작점의 "
        + "표식이 복원 뒤 사라진다. 그 획은 조용히 틀린 시작점을 가진 채 정상으로 보인다",
      "승격 손실 표시": "L-C.2의 손실 목록이 복원 뒤 비어 있다",

      "Stroke.color·width": "화면이 축 색을 쓰므로 복원 뒤 차이가 안 보인다(#18의 `layer`와 같은 자리)",
      "Stroke.layer": "**아무 데도 안 쓰인다**(selfcheck: 쓰기 0 · 읽기 0). 저장 안 함이 맞다",
    },
    reload_ms_definition: "`page.reload()` 호출 직전부터 `window.S2S`가 서고 `doc().strokes`가 "
      + "0이 아닐 때까지. ⚠ **`e2e.json`의 `reload.ms`(146)와 다른 구간이다** — 그쪽은 옛 UI "
      + "(`index.html`)의 복원이고 여기는 새 UI(`l.html`)에 **뷰 둘 + 2D 레이어**가 실린 문서다. "
      + "두 수를 견주지 않는다(리뷰어 [16]).",
    note: "**직렬화 왕복이다**(설계 보장, PITFALLS #5) — `seg3d`를 담기로 했으므로 같을 "
      + "수밖에 없다. 깨지면 저장 포맷 결함을 뜻한다. 임계를 걸지 않는다. "
      + "⚠ **틀린 문서를 넣는 대조군이 없다**(#30) — `identical`은 위 목록만 덮는다.",
  };
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
      camera: "요 35°·피치 15° 3점(f=1000px). **참 소실점을 규칙 슬롯에 직접 넣는다**(D-L37)",
    },
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
    ...led,
  }, null, 2), "utf-8");
});

/**
 * L-B.2 — **가이드 조정 UI와 실시간 피드백**(§5.2). 산출: `stage_browser.json`의 `l_b2`.
 *
 * ⛔ **대상이 사라졌다**(D-L37, 2026-08-16). 소실점 확정이 규칙 기반으로 바뀌면서
 * 검출 초안·가이드 여섯·핸들·민감도·`가이드 늘리기`가 전부 빠졌다 — 이 스펙이 재던 셋
 * (초안이 늘어나는가 · 민감도가 뜨는가 · 선을 끌 수 있는가)이 **하나도 남아 있지 않다.**
 *
 * **지우지 않고 건너뛴다** — 왜 그 확인이 있었는지가 근거이기 때문이다(`PITFALLS.md` 머리말).
 * ⚠ **`stage_browser.json`의 `l_b2`가 이제 안 갱신된다** — 그 절을 인용하는 문서는
 * **낡은 UI를 설명하는 것**이다(계획서 §5.2의 핸들 예산 표가 그것이다).
 * 규칙 경로의 대응 확인은 `test/vp_rules.test.ts`와 `stage0/out/rule_camera.json`에 있다.
 */
test.skip("가이드 조정 — 늘리기·민감도·선 끌기 (대상이 사라졌다, D-L37)", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  // ① 검출 초안만으로는 카메라가 안 선다 — **그 사실 자체가 §5.1의 근거다**
  l.draft_only = await page.evaluate(async () => {
    const S = window.S2S;
    const m = await import("/test/scene3d.ts");
    const vd = await import("/src/s3d/clip2d.ts");   // 화면 밖 소실점 → 캔버스 안 직선(범용 클리핑)
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
test("스냅 — 대상·표식·시작점 확정", async ({
 page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  await setup(page);
  await page.evaluate(() =>
    window.S2S.confirmNow());

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
  // 꼭짓점에서 **7px 어긋나게** 겨냥한다 — 손 획이 정확히 맞지 않는 것을 흉내낸다.
  // ⚠ 조리개 연혁: 지시 H가 15px(라이노 선례)로, D-L85(10차 항목 4)가 **8px**로 줄였다 —
  // 옛 오조준 값(18px → 10px)은 각 시점의 조리개 밖이라 모서리(on_edge)로 떨어졌다.
  // 반경 자체는 `osnap_config.spec`이 잠근다
  await page.mouse.move(cx + geo.a[0] + 5, cy + geo.a[1] + 5);
  l.hover = await page.evaluate(() => {
    const S = window.S2S;
    const h = S.hoverSnap();
    return { kind: h?.kind ?? null, dist_px: h ? +h.dist.toFixed(1) : null };
  });
  expect((l.hover as any).kind).toBe("endpoint");
  // ⛔ 상태 줄 스냅 표시 확인을 뺐다(지시 3 — 상태 패널이 비었다). 표식은 캔버스에 그려진다

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
      // **두 점 배치의 정의**(D-L46) — 3D 세그먼트가 두 앵커 그 자체인가.
      // ⚠ 이것도 배선 검사이지 정확도가 아니다(#5) — 대입한 값을 되읽는다
      end_snapped: !!st.snapEnd,
      seg_matches_anchors_px: st.seg3d && st.snapStart && st.snapEnd
        ? +Math.max(
            Math.hypot(st.seg3d[0][0] - st.snapStart.at[0], st.seg3d[0][1] - st.snapStart.at[1],
                       st.seg3d[0][2] - st.snapStart.at[2]),
            Math.hypot(st.seg3d[1][0] - st.snapEnd.at[0], st.seg3d[1][1] - st.snapEnd.at[1],
                       st.seg3d[1][2] - st.snapEnd.at[2])).toFixed(9)
        : null,
      status_note: document.getElementById("status")!.innerText.includes("마지막 획"),
    };
  });
  expect((l.drawn as any).snap_kind).toBe("endpoint");
  expect((l.drawn as any).placed).toBe(true);
  // ⚠⚠ **계약이 바뀌었다**(2026-08-16, D-L46 오스냅). 끝점이 **다른 꼭짓점에 붙으면**
  // 그 획은 **두 점으로** 놓이고 축은 **라벨**일 뿐이다 — 옛 단언(`axis === geo.axis`)은
  // 축 경로의 계약이었다. 두 앵커가 **서로 다른 획의 3D**에서 오므로 그 방향이 축과
  // 정확히 나란하지 않을 수 있고(실측 6.3°), 그때 라벨은 **미분류**가 맞다(A-3: 지어내지 않는다).
  // **대신 두 점 배치의 정의를 검사한다**: 끝점이 붙었고, 3D가 그 두 앵커와 같다.
  expect((l.drawn as any).end_snapped).toBe(true);
  expect((l.drawn as any).seg_matches_anchors_px).toBeLessThan(1e-6);
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

  // **사전 등록을 `gate()` 이름으로 적는다**(#38·#40) — 산문 필드(`registered_pass`)로 두면
  // `scan_gate_reachability`의 대상이 아니고, 그래서 **값이 어긋나도 자동으로 안 잡힌다**
  // (실제로 `reload_ms`가 그렇게 낡았다). 리뷰어 [15]가 그 사각지대를 짚었다.
  l.gate = gate({
    registered: "L-D.3 종단 — ① 상자 둘에서 두 상자를 잇는 배치가 일어난다 "
      + "② 승격 연쇄가 **2회 이상** 돌고 상한 8에 안 닿는다 ③ `orderMarks`가 2·3점을 함께 든다 "
      + "④ 획 하나 지연 중앙 **10ms 미만**(개발 서버) ⑤ 같은 픽스처 두 판의 픽셀이 같다. "
      + "`progress.md`의 'L-D.3 — 사전 등록: 판정'에 측정 전에 박았다(#26).",
    reachability: "**배선 확인이라 오라클 팔이 없다** — 아래 `reachability_absent` 참조. 다섯 다 '되는가'이고 '얼마나 맞는가'가 아니다.",
    reachability_absent: "**오라클 팔이 없고, 있을 자리도 아니다.** 이것은 정확도 측정이 아니라 "
      + "**배선 확인**이다 — 다섯 다 '되는가'이지 '얼마나 맞는가'가 아니다. 정확도는 합성 "
      + "하네스가 재고(`promote`·`axis_live`), 앱에서 참값 대조를 하는 것은 측정 경로와 앱 경로를 "
      + "섞는 일이다(#17). ⚠ **④는 기계·실행마다 흔들린다** — 판정은 '10ms 미만'이라는 "
      + "**자릿수**이고 중앙값 그 자체를 인용하면 문서가 곧 낡는다(실제로 낡았다).",
    status: "다섯 전부 통과. 회차·수치는 위 블록에 있다.",
  });
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
    window.S2S.confirmNow());

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
  // (오조준 11,9 → 5,4 — D-L85가 조리개를 8px로 줄였다. 이 팔이 재는 것은 배선 항등이라
  //  조리개 안에서 시작해야 한다 — 조리개 밖 거동은 snap_cache의 far_aim 팔이 잰다)
  await page.mouse.move(cx + geo.a[0] + 5, cy + geo.a[1] + 4);
  await page.mouse.down();
  await page.mouse.move(cx + (geo.a[0] + geo.b[0]) / 2, cy + (geo.a[1] + geo.b[1]) / 2, { steps: 4 });

  l.mid_drag = await page.evaluate(() => {
    const S = window.S2S;
    const t = document.getElementById("status")!.innerText;
    // ⛔ 상태 줄의 "그리는 중" 표시 확인을 뺐다(지시 3) — 판정은 캔버스 미리보기 색이 보인다
    return { hover_cleared: S.hoverSnap() === null };
  });

  // **미리보기와 확정의 일치**: 끌기 마지막 위치의 미리보기 3D와, 그 자리에서 뗀 확정 3D
  const endX = cx + geo.b[0] - 5, endY = cy + geo.b[1] + 3;
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
    // ⚠ **표현이 둘이다**: 미리보기의 미분류는 `null`, 문서의 미분류는 `"free"`다(D-L46 이후
    // 두 점 배치에서 실제로 난다). **같은 뜻을 같게 본다** — 임계를 무르는 것이 아니다
    const same = pv.axis === st.axis || (pv.axis === null && st.axis === "free");
    return { preview: true, placed: true, axis_same: same, gap: +g.toFixed(12),
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
    window.S2S.confirmNow());

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

  // **어느 축과도 안 맞는 방향**으로 긋는다 — 고정이 없으면 2D로 대기해야 한다.
  // ⚠ **축 스냅을 끈다**(2026-08-16, D-L42) — 축 스냅이 켜져 있으면 **언제나 어느 축으로
  // 가므로** "축이 안 맞아서 대기한다"는 상태가 아예 없어진다. 이 스펙이 재는 것은
  // **명시적 축 고정이 추론의 거부를 덮는가**이고, 그 거부는 축 스냅이 꺼졌을 때만 난다.
  await page.evaluate(() => window.S2S.setAxisSnap(false));
  // ⚠⚠ **끝점도 스냅 대상에서 멀어야 한다**(2026-08-16, D-L46) — 오스냅이 들어오면서
  // **양 끝이 붙은 획은 축 없이 놓인다.** 끝점이 어떤 대상 반경 안이면 이 스펙이 재려던 것
  // ("축이 안 맞으면 대기한다")이 아니라 **두 점 배치**를 재게 된다. 그래서 더 멀리 두고,
  // `snapEnd === null`을 **전제로 못 박는다**(전제가 깨지면 이 검사가 조용히 다른 것을 잰다).
  const wild = { x: cx + geo.a[0] + 250, y: cy + geo.a[1] - 300 };
  // (오조준 10,8 → 5,4 — D-L85 조리개 8px. 시작 앵커가 잡혀야 "축 거부 대 고정"을 잰다)
  await page.mouse.move(cx + geo.a[0] + 5, cy + geo.a[1] + 4);
  await page.mouse.down();
  await page.mouse.move(wild.x, wild.y, { steps: 5 });
  await page.mouse.up();
  l.without_lock = await page.evaluate(() => {
    const st = window.S2S.doc().strokes[window.S2S.doc().strokes.length - 1];
    return { placed: !!st.seg3d, axis: st.axis, userAxis: st.userAxis,
             end_snapped: !!st.snapEnd };
  });
  // **전제**: 끝점이 아무 대상에도 안 붙었다 — 붙었으면 아래 검사는 다른 것을 잰다(D-L46)
  expect((l.without_lock as any).end_snapped).toBe(false);

  // 같은 획을 **축 고정**으로 다시 긋는다
  // **그 앵커에서 실제로 뻗는 축**을 고정한다 — 임의의 축을 고르면 커서 광선과의
  // 최근접점이 카메라 뒤로 가서 끝점이 안 정해질 수 있다(그것은 고정의 실패가 아니다)
  await page.evaluate((ax) => window.S2S.setAxisLock(ax), geo.axis as 0 | 1 | 2);
  await page.mouse.move(cx + geo.a[0] + 5, cy + geo.a[1] + 4);
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
  await page.evaluate(() => window.S2S.setAxisSnap(true));   // 기본값으로 되돌린다
  expect((l.with_lock as any).axis).toBe(geo.axis);
  // **사용자가 고른 축은 재분류가 덮지 않는다**(`doc.ts`의 `userAxis`)
  expect((l.with_lock as any).userAxis).toBe(true);
  expect((l.with_lock as any).mid_drag.locked).toBe(true);
  // ⛔ 상태 줄 확인을 뺐다(지시 3)

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
    window.S2S.confirmNow());

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
  // ⛔ 상태 줄 "다른 뷰 N 숨김" 문구를 뺐다(지시 3) — 숨김 동작 자체는 아래 픽셀 확인이 잰다
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
    document.querySelector<HTMLButtonElement>('#tools button[data-act="undo"]')!.click();
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
    window.S2S.confirmNow());

  // ---- 돌린다. **앱의 궤도 버튼 경로 그대로**
  l.after_orbit = await page.evaluate(() => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click();
    const camT = S.stage.viewport.camera;
    // ⚠ 14차 항목 6: 시선이 그린 수직축과 충분히 안 직교해야 **모델링 화면**이다(이 픽스처의
    // 그린 수직축은 세계 Y에서 ~15° 기울어 있어 얕은 자세는 작도 대역에 든다) — 급한
    // 내려보기(~40°)로 둬 어느 기준계로도 모델링이게 한다. ⓪′가 그 상태를 단언한다
    camT.position.set(1.6, 6.0, 2.2);
    // ⚠⚠ **자세를 `lookAt`만으로 주면 안 된다**(2026-08-17 G에서 잡았다 — 이 시험은 **간헐적으로**
    // 실패하고 있었다): 렌더 루프의 `controls.update()`가 카메라를 자기 `target`으로 **다시 겨눈다**.
    // 두 `evaluate` 사이에 프레임이 도느냐에 따라 자세가 갈렸고, 안 돌면 상자가 **카메라 뒤**라
    // `project()`가 `null`을 내 다음 줄이 던졌다. `target`을 함께 주고 **여기서 `update()`를 부르면**
    // 그 뒤의 `update()`가 항등이 된다. 규약 변환은 `stage.unpin`의 그것과 같다(우리 y 아래·z 안쪽).
    const ctl = S.stage.viewport.controls;
    ctl.target.set(0.6, 0.4, -4.2);              // 우리 (0.6,-0.4,4.2) → three
    ctl.update();
    camT.updateMatrixWorld(true);
    // 그리기로 돌아온다 — 여기서부터 잉크 캔버스가 포인터를 받는다
    document.querySelector<HTMLButtonElement>('#tools button[data-act="draw"]')!.click();
    S.refresh();
    return { pinned: S.stage.isPinned, views: S.views().length,
             snap_targets: S.snapTargets(), has_pose: !!S.pose() };
  });
  expect((l.after_orbit as any).pinned).toBe(false);
  // **스냅 대상이 있다** — 돌린 시점에서도 3D 레이어가 대상이다(L-B.8이 연 것)
  expect((l.after_orbit as any).snap_targets).toBe(12);

  // ---- ⓪′ **모델링 화면에서는 안 그린다**(14차 항목 6-e — 계약 갱신): 위 자세는 피치가
  //      있어 작도 화면이 아니다. 획 시작 자체가 막히고(§9.3의 "돌린 시점에서 그린다"는
  //      이제 **돌린 작도 시점**의 이야기다 — 아래 ①~④가 그 판이다), 복귀 뒤에 그린다.
  {
    const before = await page.evaluate(() => ({
      state: window.S2S.viewState(), strokes: window.S2S.doc().strokes.length }));
    // ⛔ **계약이 뒤집혔다**(2026-08-19 15차 항목 3 · D-L102): 피치가 있는 자세도 **작도**다
    // (`draft_three`). 그리기가 안 막히므로 아래 "차단" 팔은 **그려진다**를 잠근다
    expect((before as any).state).toBe("draft_three");
    const fb = await page.locator("#frame").boundingBox();
    await page.mouse.move(fb!.x + 200, fb!.y + 200);
    await page.mouse.down();
    await page.mouse.move(fb!.x + 320, fb!.y + 230, { steps: 4 });
    await page.mouse.up();
    // ⚠ **이름은 옛것이고 뜻은 뒤집혔다**(2차 리뷰어 [12]): 이제 «차단»이 아니라
    // **그려짐**을 잰다(D-L102). 다음 세션이 이름으로 grep해도 안 헷갈리게 여기 박는다
    l.model_blocked_now_draws = await page.evaluate((n) => ({
      strokes_before: n, strokes_after: window.S2S.doc().strokes.length,
      state: window.S2S.viewState() }), (before as any).strokes);
    // D-L102 — 막히지 않는다. 획이 하나 는다
    expect((l.model_blocked_now_draws as any).strokes_after)
      .toBe((l.model_blocked_now_draws as any).strokes_before + 1);
    // **복귀**(지시 6-a·f) — 앱 버튼 경로 그대로. 피치를 접은 2점 작도 시점으로 간다
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#bar button[data-act="draft"]')!.click();
    });
    await page.waitForTimeout(450);                       // snapToDir 280ms + 여유
    l.returned = await page.evaluate(() => ({
      state: window.S2S.viewState(), pinned: window.S2S.stage.isPinned }));
    expect(["draft_two", "draft_one"]).toContain((l.returned as any).state);
    expect((l.returned as any).pinned).toBe(false);       // 확정 시점 복귀가 아니라 작도 복귀다
  }

  // ---- ① 돌린 시점에서 스냅이 도는가. 참 꼭짓점의 **이 시점 화면 좌표**를 겨냥한다
  const target = await page.evaluate(async () => {
    const S = window.S2S;
    const vc = await import("/src/s3d/viewCamera.ts");
    const g3 = await import("/src/s3d/geom3d.ts");
    const pose = S.pose();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    // **자유 시점은 확정 렌즈를 이어받는다**(7차 항목 1) — 앱과 같은 출처에서 읽는다(#17)
    const fi = S.stage.freeIntrinsics();
    const f = fi ? fi.f : vc.fFromFov(45, size[1]);
    const principal: [number, number] = fi ? fi.principal : [size[0] / 2, size[1] / 2];
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
      // ⛔ **`=== 2`에서 넓혔다**(15차 항목 3 · D-L102): 앞의 팔이 이제 안 막히므로
      // 그 획도 자기 각도의 뷰를 만든다 — 판정은 "새 뷰가 생겼는가"이지 개수가 아니다
      new_view_created: S.views().length >= 2,
      view_count: S.views().length,
      stroke_owned_by_current: st.viewRef === cur,
      placed: !!st.seg3d, axis: st.axis,
      seg3d: st.seg3d,
      snap_kind: st.snapStart?.kind ?? null,
      snap_at: st.snapStart?.at ?? null,
      end_snapped: !!st.snapEnd,
    };
  }, mid);
  const d = l.drawn_in_orbit as any;
  // **§9.3이 도달했다** — 새 각도에서 그렸더니 뷰가 생겼다
  expect(d.new_view_created).toBe(true);
  expect(d.stroke_owned_by_current).toBe(true);
  expect(d.current).not.toBe("v1");
  // **돌린 시점에서 3D가 확정된다**(L-B.8의 핵심)
  expect(d.placed).toBe(true);
  // ⚠ **계약이 바뀌었다**(D-L46): 양 끝이 붙으면 **축 없이 두 점으로** 놓이고 축은 라벨이다.
  // 재는 것은 "돌린 시점에서 3D가 확정된다"이므로 **놓인 근거가 축이든 두 점이든 통과**이고,
  // **둘 다 아니면 실패**다(그때는 `axis`가 미분류이면서 끝점도 안 붙은 것이다)
  expect(typeof d.axis === "number" || d.end_snapped).toBe(true);

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
// ⛔ **대상이 사라졌다**(2026-08-18 7차 지시 3-d — 차수 승격 개념이 없어졌다).
// P2 → P3 전이의 입구(기울어진 수직선의 "수직축" 답)를 3-b가 없앴고, 그러면 승격 전이가
// 하나도 안 남는다. 승격 UI(요약·되돌리기·잃은 것 표시)와 `S2S.promoteOrderNow`·
// `promoteReport`·`orderMarks`·`revertToOrder`·`relinkLostSnaps`가 함께 지워졌다.
// **지우지 않고 은퇴로 표시한다** — 왜 그 규칙이 있었는지가 근거다(PITFALLS 머리말).
// 순수 모듈(`promoteOrder.ts`·`promoteDiff.ts`)과 그 단위 시험은 남는다.
test.skip("차수 승격 — 소실점이 하나 더 잡히면 전부 다시 풀린다", async () => {});
// ⛔ **대상이 사라졌다**(2026-08-18 7차 지시 3-d — 차수 승격 개념이 없어졌다).
// P2 → P3 전이의 입구(기울어진 수직선의 "수직축" 답)를 3-b가 없앴고, 그러면 승격 전이가
// 하나도 안 남는다. 승격 UI(요약·되돌리기·잃은 것 표시)와 `S2S.promoteOrderNow`·
// `promoteReport`·`orderMarks`·`revertToOrder`·`relinkLostSnaps`가 함께 지워졌다.
// **지우지 않고 은퇴로 표시한다** — 왜 그 규칙이 있었는지가 근거다(PITFALLS 머리말).
// 순수 모듈(`promoteOrder.ts`·`promoteDiff.ts`)과 그 단위 시험은 남는다.
test.skip("되돌리기 UI — 승격이 잃은 것이 보이고, 차수로 되돌아간다", async () => {});
test("고치기 — 획을 고르고, 축을 지정하고, 지운다", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  l.setup = await page.evaluate(async () => {
    const S = window.S2S;
    const m = await import("/test/scene3d.ts");
    const vd = await import("/src/s3d/clip2d.ts");   // 화면 밖 소실점 → 캔버스 안 직선(범용 클리핑)
    const doc = await import("/src/ui/doc.ts");

    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const sc = m.scene(35, 15, 1000, size);
    const edges = m.boxEdges(sc, [0.6, -0.4, 4.2], 1.2, 1.0, 0.9);
    let s0 = 12345 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    for (const e of m.drawEdges(sc, edges, "medium", r, 0.37, 0.006, 0)) {
      S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    }
    const margin = 0.02 * Math.hypot(size[0], size[1]);
    const guides: unknown[] = [];
    sc.vps.forEach((vp: number[], ax: number) => {
      for (const t of [[[0.30, 0.30], [0.30, 0.72]], [[0.70, 0.30], [0.70, 0.72]],
                       [[0.32, 0.35], [0.70, 0.35]]][ax]) {
        const q = [t[0] * size[0], t[1] * size[1]];
        const far = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
        const cl = vd.clipToCanvas([vp[0], vp[1]], far, size, margin);
        if (cl) guides.push({ axis: ax, a: cl[0], b: cl[1] });
      }
    });
    // **안 올라가는 획을 만든다** — §9.5가 말하는 그 상황이다("영원히 안 올라가는 획이 쌓일 수 있다").
    // 면 대각선은 두 꼭짓점에 닿지만 **어느 축도 아니라서** 축 판정이 `free`로 남긴다
    for (const d of m.faceDiagonals(sc, [0.6, -0.4, 4.2], 1.2, 1.0, 0.9)) {
      const pa = m.project(d.a, sc.principal, sc.f), pb = m.project(d.b, sc.principal, sc.f);
      if (pa && pb) S.doc().strokes.push(doc.newSStroke([pa, pb] as any, S.doc().currentView));
    }
    S.setAxisLines(guides);
    S.cam.apply(); S.refresh();
    window.S2S.confirmNow();
    document.querySelector<HTMLButtonElement>('#tools button[data-act="edit"]')!.click();
    return { strokes: S.doc().strokes.length,
             lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             pending: S.doc().strokes.filter((s: any) => !s.seg3d).length,
             tool_button_on: !!document.querySelector('#tools button[data-act="edit"].on') };
  });
  const su = l.setup as any;
  expect(su.tool_button_on).toBe(true);
  expect(su.lifted).toBeGreaterThan(0);
  expect(su.strokes).toBeGreaterThan(su.lifted - 1);
  // **안 올라간 획이 실제로 있는가** — 없으면 아래 **축 지정** 판정이 공허하다(#32의 실행 카운터).
  // ⚠⚠ **2026-08-16: 이 픽스처가 더는 대기 획을 안 만든다.** 면 대각선이 `axisOfStroke`에서
  // 어느 축으로 배정돼 놓인다 — 그것이 **회수인지 조용히 틀린 배치인지 안 갈랐다**
  // (`face_diagonal.json`은 그것을 **조용히 틀림**이라 적었다: 0.0216 대 0.4483).
  // **임계를 낮춰 통과시키지 않는다**(#32) — 실행 여부를 원장에 적고 갈라 낸다.
  // `DEFERRED.md`에 트리거를 달았다.
  (l as any).axis_assign_checks_ran = su.pending > 0;

  // ---- ① 클릭이 옳은 획을 고른다
  l.pick = await page.evaluate(() => {
    const S = window.S2S;
    const st = S.doc().strokes.find((s: any) => s.seg3d)!;
    // 그 획의 **화면 중점**을 누른다 — 잉크가 있던 자리이고 3D도 같은 픽셀이다(§5.3 보장)
    const p0 = st.pts2d[0], p1 = st.pts2d[st.pts2d.length - 1];
    const mid: [number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const got = S.pick(mid);
    // **빈 곳을 누르면 풀린다**(A-3: 선례 그대로)
    const empty = S.pick([4, 4]);
    return { want: st.id, got, cleared: empty, picked_after: S.picked() };
  });
  const pk = l.pick as any;
  expect(pk.got).toBe(pk.want);
  expect(pk.cleared).toBeNull();

  // ---- ④⑤ 축 지정이 대기 획을 올리는가, 그리고 승격이 안 덮는가
  l.assign = await page.evaluate(() => {
    const S = window.S2S;
    const wait = S.doc().strokes.filter((s: any) => !s.seg3d);
    if (!wait.length) return { skipped: "대기 획이 없다", n: 0 };
    const before = S.doc().strokes.filter((s: any) => s.seg3d).length;
    const tried: any[] = [];
    for (const st of wait) {
      const p0 = st.pts2d[0], p1 = st.pts2d[st.pts2d.length - 1];
      S.pick([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]);
      if (S.picked() !== st.id) {
        tried.push({ id: st.id, picked: false, got: S.picked(),
                     view_is_current: st.viewRef === S.currentView() });
        continue;
      }
      S.assignAxis(2);
      const now = S.doc().strokes.find((s: any) => s.id === st.id)!;
      tried.push({ id: st.id, picked: true, userAxis: now.userAxis, axis: now.axis,
                   placed: !!now.seg3d });
    }
    return { n: wait.length, before,
             after: S.doc().strokes.filter((s: any) => s.seg3d).length, tried };
  });
  const as = l.assign as any;
  // **지정이 실제로 걸린다** — `userAxis`가 서고 축이 그 값이다(#7: 추측하지 않는다)
  const done = (as.tried ?? []).filter((t: any) => t.picked);
  // ⚠ **대기 획이 없으면 지정할 것도 없다** — 위 `axis_assign_checks_ran`과 같은 자리다.
  // 안 돈 것을 통과로 읽지 않으려고 **실행 여부를 원장에 적고** 갈라 낸다(#32).
  (l as any).axis_assign_ran = done.length > 0;
  for (const t of done) { expect(t.userAxis).toBe(true); expect(t.axis).toBe(2); }
  l.assign_note = `대기 ${as.n}획 중 ${done.length}획을 골라 축3으로 지정했고 `
    + `**${done.filter((t: any) => t.placed).length}획이 올라갔다** — 3D ${as.before} → ${as.after}. `
    + "⚠ **면 지정이 아니라 축 지정이다**(면 생성이 범위 밖) — 방향만 주므로 "
    + "§5.4의 일괄 풀이가 그 방향으로 이어지는 구조를 찾아야 놓인다.";

  // ---- ② ③ 지우기와 되돌리기
  l.erase = await page.evaluate(() => {
    const S = window.S2S;
    const st = S.doc().strokes.find((s: any) => s.seg3d)!;
    const p0 = st.pts2d[0], p1 = st.pts2d[st.pts2d.length - 1];
    S.pick([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]);
    const beforeN = S.doc().strokes.length, beforeTargets = S.snapTargets();
    S.deletePicked();
    const afterN = S.doc().strokes.length, afterTargets = S.snapTargets();
    const gone = !S.doc().strokes.some((s: any) => s.id === st.id);
    document.querySelector<HTMLButtonElement>('#tools button[data-act="undo"]')!.click();
    return { id: st.id, beforeN, afterN, gone, picked_cleared: S.picked() === null,
             // **씬·스냅 후보가 함께 줄었는가** — 문서에서만 지우면 여기가 안 움직인다
             snap_targets: [beforeTargets, afterTargets],
             restored_n: S.doc().strokes.length,
             restored_has_it: S.doc().strokes.some((s: any) => s.id === st.id) };
  });
  const er = l.erase as any;
  expect(er.afterN).toBe(er.beforeN - 1);
  expect(er.gone).toBe(true);
  expect(er.picked_cleared).toBe(true);
  // **문서에서만 지우지 않았다** — 스냅 대상이 함께 줄었다
  expect(er.snap_targets[1]).toBe(er.snap_targets[0] - 1);
  // **되돌릴 수 있다**
  expect(er.restored_n).toBe(er.beforeN);
  expect(er.restored_has_it).toBe(true);

  l.what_this_does_not_say = [
    "**면 지정** — 면 생성이 범위 밖이라(DEFERRED) 줄 수 있는 것은 **방향**뿐이다. "
      + "면 지정은 획을 평면에 가두고 축 지정은 그러지 않는다",
    "**사용자가 옳은 축을 고르는가** — 표본 0(AS-C1). 여기서는 축3을 기계적으로 준다",
    "**지운 획에 붙어 있던 스냅** — 개수를 세어 알리지만 그 획들을 2D로 되돌리지는 않는다 "
      + "(사용자가 안 시킨 삭제가 되기 때문이다)",
  ];
  led.l_d1 = l;
});

/**
 * **L-D.3 종단 검증** — 상자 둘 픽스처 위에서 L-B 게이트 3번·차수 표식 다중·지연·회귀를
 * 함께 닫는다. 산출: `stage_browser.json`의 `l_d3`.
 *
 * 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 걸리는 번호:
 *   **#26**(판정을 측정 전에 박았다 — `progress.md`의 "L-D.3 — 사전 등록: 판정")
 *   **#32**(연쇄가 실제로 돌았는지 **회차별 카운터**로 남긴다. 상한 8에 닿았으면 잘린 것이다)
 *   **#25**(원장에 남긴다) · **#17**(앱 경로 그대로 부른다) · **#22**(캔버스 굳음)
 *   **#40**(도달 가능성을 자명한 값으로 적지 않는다)
 *
 * **이 확인이 말하지 않는 것**: 배치 정확도(참값 대조를 앱에서 안 한다) · 실획 · 사람의 축 오차.
 */
test("L-D.3 종단 — 상자 둘에서 연쇄·표식 다중·지연·회귀", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const l: Record<string, unknown> = {};

  // ---- ① 상자 둘 픽스처. **하나짜리와 규모가 실제로 다른지** 센다
  const two = await setup(page, { boxes: 2 });
  expect(two.boxes).toBe(2);
  expect(two.strokes).toBe(24);                       // 12 × 2
  expect(two.hasCamera).toBe(true);
  const confirmed = await page.evaluate(() => {
    const S = window.S2S;
    window.S2S.confirmNow();
    return { lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             pending: S.doc().strokes.filter((s: any) => !s.seg3d).length,
             order: S.order() };
  });
  l.fixture = { strokes: two.strokes, ...confirmed,
                note: "상자 둘이 **면을 공유**한다 — 그래야 연쇄가 상자를 건너간다. "
                  + "확정에서 **24/24가 놓였다**는 것이 두 번째 상자의 모서리가 첫 상자의 "
                  + "기하에 앵커로 붙었다는 뜻이다(따로 이어 그은 획 없이도 건너간다).",
                registered_pass: "상자 둘 · 두 상자를 잇는 배치가 실제로 일어난다(사전 등록)" };
  expect(confirmed.lifted).toBeGreaterThan(12);       // 상자 하나보다 많이 놓인다

  // ---- ② **지연**: 획 하나를 실제 포인터로 긋고 `pointerup` 반환까지를 잰다
  //
  // ⚠ `e2e.json`은 **옛 UI**의 값이라 여기와 같은 구간이 아니다(L-D.2 리뷰어 [16]).
  // 이것은 **새 UI · 상자 둘(24획)** 규모의 값이다.
  // ⚠ **페이지 안에서 잰다.** 초판은 `page.mouse.*`를 Date.now()로 감쌌는데 그것은
  // **CDP 왕복**을 재는 것이라 앱의 지연이 아니었다(중앙 30ms대). `flow.spec.ts`가 이미
  // 옳은 방식을 쓰고 있었다 — `pointerup` **디스패치가 반환할 때까지**를 `performance.now()`로.
  const lat: number[] = await page.evaluate(() => {
    const cv = document.querySelector("#ink") as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const ev = (type: string, x: number, y: number, buttons: number) =>
      cv.dispatchEvent(new PointerEvent(type, {
        clientX: r.left + x, clientY: r.top + y, pointerId: 1, pointerType: "mouse",
        isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons }));
    const out: number[] = [];
    for (let i = 0; i < 8; i++) {
      const x0 = cv.clientWidth * (0.20 + i * 0.02), y0 = cv.clientHeight * 0.80;
      ev("pointerdown", x0, y0, 1);
      for (let k = 1; k <= 4; k++) ev("pointermove", x0 + 15 * k, y0 - 5 * k, 1);
      // **재는 것은 `pointerup` 하나다** — 판정·배치·튜브 생성·다시 그리기가 그 안이다
      const t0 = performance.now();
      ev("pointerup", x0 + 60, y0 - 20, 0);
      out.push(+(performance.now() - t0).toFixed(3));
    }
    return out;
  });
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  l.stroke_latency_ms = {
    n: lat.length, median: med(lat), max: Math.max(...lat),
    note: "**개발 서버(번들 없음) · 상자 둘(24획 + 그린 획)** 기준이므로 상한으로 읽는다. "
      + "⚠ `e2e.json`의 값은 **옛 UI**라 같은 구간이 아니다 — 견주지 않는다.",
    registered_pass: "중앙 10ms 미만(사전 등록). ⚠ **중앙값 자체를 문서에 인용하지 않는다** — "
      + "기계·실행마다 흔들린다. 판정은 자릿수다",
  };
  expect(med(lat)).toBeLessThan(10);

  // ---- ③ **L-B 게이트 3번**: 승격 연쇄가 **여러 회** 도는가. 회차별로 남긴다
  l.promote_chain = await page.evaluate(async () => {
    const S = window.S2S;
    // 2점으로 다시 세운다 — 수직 가이드를 뒤에 더해 승격을 만든다(`l_c2`와 같은 절차)
    const m = await import("/test/scene3d.ts");
    const vd = await import("/src/s3d/clip2d.ts");   // 화면 밖 소실점 → 캔버스 안 직선(범용 클리핑)
    const doc = await import("/src/ui/doc.ts");

    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const size: [number, number] = [el.clientWidth, el.clientHeight];
    const sc = m.scene(35, 15, 1000, size);
    const O: [number, number, number] = [0.6, -0.4, 4.2];
    const edges = m.boxEdges(sc, O, 1.2, 1.0, 0.9);
    const e0 = sc.axes[0];
    edges.push(...m.boxEdges(sc, [O[0] + e0[0] * 1.2, O[1] + e0[1] * 1.2, O[2] + e0[2] * 1.2],
                             0.9, 1.0, 0.7));
    let s0 = 12345 >>> 0;
    const r = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    for (const e of m.drawEdges(sc, edges, "medium", r, 0.37, 0.006, 0)) {
      S.doc().strokes.push(doc.newSStroke(e.pts2d, S.doc().currentView));
    }
    const margin = 0.02 * Math.hypot(size[0], size[1]);
    const mk = (ax: number, ts: number[][]) => {
      const vp = sc.vps[ax]; const out: unknown[] = [];
      for (const t of ts) {
        const q = [t[0] * size[0], t[1] * size[1]];
        const far = [vp[0] + (q[0] - vp[0]) * 1e4, vp[1] + (q[1] - vp[1]) * 1e4];
        const cl = vd.clipToCanvas([vp[0], vp[1]], far, size, margin);
        if (cl) out.push({ axis: ax, a: cl[0], b: cl[1] });
      }
      return out;
    };
    S.setAxisLines([...mk(0, [[0.30, 0.30], [0.30, 0.72]]), ...mk(1, [[0.70, 0.30], [0.70, 0.72]])]);
    S.cam.apply(); S.refresh();
    window.S2S.confirmNow();
    const before = { order: S.order(),
                     lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
                     pending: S.doc().strokes.filter((s: any) => !s.seg3d).length };
    // ⛔ **승격 호출을 뺐다**(7차 지시 3-d — 차수 승격 개념이 사라졌다). 이 절이 실제로
    //    재는 것은 **승격 연쇄**(`promoteChain` — 새 획이 놓이면 대기 획이 따라 놓인다)이고
    //    그것은 살아 있다. 세 번째 축을 세우는 부분만 뺀다.
    return { before, order: S.order(), trace: S.chainTrace(),
             lifted: S.doc().strokes.filter((s: any) => s.seg3d).length,
             pending: S.doc().strokes.filter((s: any) => !s.seg3d).length,
             // **확정 후 재계산 가드의 합성 대가**(14차 항목 0 · D-L92 — #16: 병목이 옮겨간
             // 것을 기록한다): medium 잉크의 손떨림이 5°(LIFT_TOL.parallel_deg)를 넘는
             // 획은 연쇄가 회전 배치하지 않고 **대기**로 남긴다. 이 팔의 배치 감소가 그
             // 크기다(D-L92 이전 lifted 16 → 이후 8 — 합성 medium 한 동작점, 실획이
             // 판정자다. 5~12° 대역 빈도 물음의 첫 합성 자료점).
             dir_guard: S.chainDirGuard() };
  });
  const pc = l.promote_chain as any;
  expect(pc.before.order).toBe(2);
  expect(pc.order).toBe(2);           // ⛔ 승격이 없으므로 차수는 그대로다(7차 지시 3-d)
  // **연쇄가 실제로 돌았는가**(#32) — 회차 배열이 비면 이 실행은 기전에 대한 정보가 0이다
  (l.promote_chain as any).rounds = pc.trace.length;
  (l.promote_chain as any).hit_cap = pc.trace.length >= 8;
  (l.promote_chain as any).reading =
    pc.trace.length >= 2
      ? "**여러 회 돌았다** — 회차별 (대기 · 놓임)이 `trace`에 있다"
      : "⚠ **한 회로 멎었다.** 상자 둘로도 연쇄가 안 길어진다면 그것은 픽스처가 아니라 "
        + "기전의 성질이다 — 대기 집합이 첫 회에 거의 다 소진되는지 `trace`로 본다";
  expect(pc.trace.length).toBeGreaterThanOrEqual(1);
  expect(pc.trace.length).toBeLessThan(8);            // 상한에 닿으면 수렴이 아니라 잘린 것이다

  // ---- ④ ⛔ **차수 표식 다중 절을 지웠다**(7차 지시 3-d) — `orderMarks`·`revertToOrder`·
  //         `promoteOrderNow`가 함께 없어졌다. 되돌리기는 일반 `실행취소` 하나이고 그것은
  //         `viewpoint_undo` 팔이 덮는다. **왜 그 규칙이 있었는지**는 위 은퇴 표시에 남는다.
  l.order_marks_multi = { retired: "7차 지시 3-d — 차수 승격 개념이 사라졌다" };

  // ---- ⑤ **스크린샷 회귀**: 같은 픽스처를 두 번 세우면 픽셀이 같아야 한다(결정론)
  //
  // ⚠ **기계 간 비교는 안 한다** — 폰트·안티에일리어싱이 다르다. 같은 실행 안의 두 번만 본다.
  // ⚠ **매번 새로고침해서 같은 출발점에서 잰다.** 초판은 `clear()`만 하고 다시 세웠는데,
  // 그러면 **앞 절이 남긴 상태**(`cam.locked` · `lockedOrder` · 자세)가 첫 판과 둘째 판에서
  // 달라 픽셀이 갈렸다 — 스펙 하나만 돌리면 통과하고 **전체를 돌리면 실패**했다.
  // 재는 것은 "같은 픽스처가 같은 픽셀을 내는가"이므로 출발점을 같게 만드는 것이 맞다.
  const shot = async () => {
    await page.goto("/l.html");
    await page.waitForFunction(() => !!window.S2S);
    // ⚠ **저장 복원 경쟁을 끊는다**(2026-08-17 3차에서 간헐 실패로 드러났다): `getDoc2` 복원이
    // 비동기라, 앞 판의 자동 저장본이 `setup`의 획 주입과 **경주**한다 — 복원이 먼저 오면
    // 두 판의 그림이 달라진다. 저장소를 지우고 다시 연 뒤에 세운다(출발점을 같게).
    await page.evaluate(() => new Promise<void>(res => {
      const q = indexedDB.deleteDatabase("sketch2space");
      q.onsuccess = q.onerror = q.onblocked = () => res();
    }));
    await page.reload();
    await page.waitForFunction(() => !!window.S2S);
    await setup(page, { boxes: 2 });
    await page.evaluate(() => {
      window.S2S.confirmNow();
      // ⚠ **한 번 더 그린다** — 도구 막대의 높이가 바뀌면 캔버스가 새로 잡히고(자가 치유)
      // 그 프레임의 그림이 **치유 전/후 중 어느 쪽인지가 실행마다 갈린다**.
      // 두 장이 **같은 안정 상태**에서 찍히게 한 번 더 돌린다(위 머리말과 같은 이유).
      window.S2S.refresh(); window.S2S.refresh();
    });
    // ⚠ **요소 스크린샷이 아니라 캔버스 비트맵을 비교한다**(2026-08-17 3차 정정).
    // 요소 스크린샷은 캔버스 위에 겹친 DOM 글자까지 합성하는데, 그 글자의 안티에일리어싱이
    // 페이지 로드 간에 ±1 그레이 레벨로 흔들렸다(실측: 22px, 전부 도구 막대 글자 자리) —
    // 재려는 것은 **잉크 층의 결정론**이므로 잉크 캔버스의 픽셀만 본다.
    return page.evaluate(() =>
      (document.getElementById("ink") as HTMLCanvasElement).toDataURL());
  };
  const a = await shot(), b = await shot();
  l.screenshot_regression = {
    identical: a === b, bytes: a.length,
    note: "**결정론 확인이다**(설계 보장, #5) — 잉크가 LCG이고 자세가 고정이므로 같아야 한다. "
      + "임계를 걸지 않는다. ⚠ **기계 간 비교는 안 한다**(폰트·안티에일리어싱).",
  };
  expect(a).toBe(b);

  l.what_this_does_not_say = [
    "배치 정확도 — 참값 대조를 앱에서 하지 않는다(측정 경로와 앱 경로를 섞는 일이다, #17)",
    "실획 — 합성 잉크다(AS-C1·AS-C10)",
    "사람이 도달하는 축 오차 — 참 소실점을 그대로 넣는다(AS-L9은 표본 0)",
    "**AS-L9 시나리오는 여기 없다** — 사람이 가이드를 끄는 것이라 자동화가 안 된다(DEFERRED)",
  ];
  led.l_d3 = l;
});
