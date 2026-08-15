// S-10 **종단 검증** — 산출: `stage0/out/e2e.json` · 스크린샷 `stage0/out/e2e/`.
//
// 지금까지의 측정은 전부 **함수를 부른 것**이다. 여기서만 DOM·잉크 캡처·three 렌더·
// IndexedDB가 함께 돈다. 시나리오는 사용자가 실제로 하는 순서 그대로다:
//
//   카메라 확정 → 그리기 → 회전 → 이어 그리기 → 고치기 → 저장(새로고침) → 내보내기
//
// **잉크 캡처 회귀 테스트가 0이었다**(S-A 리뷰어 잔여). 여기가 그 자리이기도 하다 —
// 포인터 이벤트를 실제로 디스패치하므로 `InkCanvas`가 처음으로 검증된다.
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// **상수 스냅샷을 함께 낸다** — 배치 개수가 공유 임계에 달려 있으므로 STALE 대상이다.
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SHOTS = resolve(OUT, "e2e");

/** 측정값 적재소 — 마지막에 한 번에 원장으로 쓴다. */
const led: Record<string, unknown> = {};

/** 화면에 노출된 앱 손잡이(`window.s2s`)의 타입. 브라우저 안에서만 쓴다. */
declare global {
  interface Window { s2s: any }
}

/** 캔버스에 포인터 획 하나를 긋는다. **실제 PointerEvent**다(마우스 1급). */
async function stroke(page: Page, sel: string, pts: [number, number][]) {
  await page.evaluate(([sel, pts]) => {
    const cv = document.querySelector(sel) as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const ev = (type: string, x: number, y: number, buttons: number) =>
      cv.dispatchEvent(new PointerEvent(type, {
        clientX: r.left + x, clientY: r.top + y, pointerId: 1, pointerType: "mouse",
        isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons }));
    ev("pointerdown", pts[0][0], pts[0][1], 1);
    for (let i = 1; i < pts.length; i++) ev("pointermove", pts[i][0], pts[i][1], 1);
    const L = pts[pts.length - 1];
    ev("pointerup", L[0], L[1], 0);
  }, [sel, pts] as const);
}

/** 획 하나의 **끝에서 끝까지 지연**(ms) — `pointerup` 디스패치가 반환할 때까지. */
async function strokeLatency(page: Page, sel: string, pts: [number, number][]): Promise<number> {
  return page.evaluate(([sel, pts]) => {
    const cv = document.querySelector(sel) as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const ev = (type: string, x: number, y: number, buttons: number) =>
      cv.dispatchEvent(new PointerEvent(type, {
        clientX: r.left + x, clientY: r.top + y, pointerId: 1, pointerType: "mouse",
        isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons }));
    ev("pointerdown", pts[0][0], pts[0][1], 1);
    for (let i = 1; i < pts.length; i++) ev("pointermove", pts[i][0], pts[i][1], 1);
    const L = pts[pts.length - 1];
    // **재는 것은 `pointerup` 하나다** — 판정·배치·튜브 생성·다시 그리기가 전부 그 안에서 돈다.
    const t0 = performance.now();
    ev("pointerup", L[0], L[1], 0);
    return performance.now() - t0;
  }, [sel, pts] as const);
}

/** 소실점 셋을 찍는다. **탭도 두 점이 필요하다**(`InkCanvas`가 1점 획을 버린다). */
async function setCamera(page: Page) {
  const vps = await page.evaluate(() => {
    const cv = document.getElementById("ink") as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const f = 320, rad = (d: number) => (d * Math.PI) / 180, y = rad(35), t = rad(15);
    const rx = (v: number[]) => [v[0], v[1] * Math.cos(t) - v[2] * Math.sin(t),
                                 v[1] * Math.sin(t) + v[2] * Math.cos(t)];
    const axes = [rx([Math.cos(y), 0, Math.sin(y)]), rx([-Math.sin(y), 0, Math.cos(y)]), rx([0, 1, 0])];
    const P = [r.width / 2, r.height / 2];
    return axes.map(d => [P[0] + (f * d[0]) / d[2], P[1] + (f * d[1]) / d[2]] as [number, number]);
  });
  for (let i = 0; i < 3; i++) {
    await page.click(`#tools button[data-t="vp${i}"]`);
    await stroke(page, "#ink", [vps[i], [vps[i][0] + 1, vps[i][1] + 1]]);
  }
  return vps;
}

/** 상자 하나의 획 목록(첫 시점). 손떨림을 조금 얹는다 — 곧은 선만 그으면 캡처를 안 시험한다. */
function boxStrokes(vps: [number, number][]): [number, number][][] {
  const lerp = (a: number[], b: number[], t: number): [number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const seg = (a: [number, number], b: [number, number], n = 16): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const p = lerp(a, b, i / n);
      return [p[0] + Math.sin(i * 1.7) * 0.7, p[1] + Math.cos(i * 2.3) * 0.7] as [number, number];
    });
  const O: [number, number] = [430, 560];
  const A = lerp(O, vps[0], 0.30), B = lerp(O, vps[1], 0.30);
  const up = (p: [number, number]): [number, number] => lerp(p, vps[2], -0.10);
  const Ou = up(O), Au = up(A), Bu = up(B);
  const C = lerp(A, vps[1], 0.30), Cu = up(C);
  return ([[O, A], [O, B], [O, Ou], [A, Au], [B, Bu], [Ou, Au], [Ou, Bu],
           [A, C], [B, C], [C, Cu], [Au, Cu], [Bu, Cu]] as [number, number][][])
    .map(([a, b]) => seg(a as [number, number], b as [number, number]));
}

test.describe.configure({ mode: "serial" });

test("카메라 확정 → 그리기 → 회전 → 이어 그리기 → 고치기 → 저장", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto("/");
  // **저장소를 비우고 시작한다** — 앞선 실행의 문서가 열리면 시나리오가 달라진다.
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.s2s);
  mkdirSync(SHOTS, { recursive: true });

  // ---- 1. 카메라 ----
  const vps = await setCamera(page);
  const cam = await page.evaluate(() => window.s2s.panel.acc.solve().camera);
  expect(cam.ok).toBe(true);
  expect(cam.case).toBe("3pt");
  led.camera = { case: cam.case, f: +cam.f.toFixed(2), fov: cam.fovDeg, fSource: cam.fSource };

  // ---- 2. 그리기 (지연 측정) ----
  await page.click('#tools button[data-t="draw"]');
  const lat: number[] = [];
  for (const s of boxStrokes(vps)) lat.push(await strokeLatency(page, "#ink", s));
  const after = await page.evaluate(() => ({
    n: window.s2s.strokes.length,
    placed: window.s2s.strokes.filter((s: any) => s.pts3d.length).length,
    counts: window.s2s.strokeView.lastCounts,
  }));
  expect(after.n).toBe(12);
  expect(after.placed).toBeGreaterThanOrEqual(6);
  led.first_view = { strokes: after.n, placed: after.placed, mesh: after.counts };
  led.stroke_latency_ms = {
    n: lat.length, median: +median(lat).toFixed(2), max: +Math.max(...lat).toFixed(2),
    note: "`pointerup` 하나가 반환할 때까지 — 판정·배치·튜브 생성·다시 그리기가 그 안이다. "
      + "개발 서버(번들 없음) 기준이므로 **상한**으로 읽는다.",
  };
  await page.screenshot({ path: resolve(SHOTS, "01-drawn.png") });

  // ---- 3. 회전 ----
  const frame = await page.evaluate(async () => {
    const vp = window.s2s.viewport;
    const c = vp.camera, t0 = performance.now();
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 0.6;
      c.position.set(Math.sin(a) * 6, -2.2, Math.cos(a) * 6);
      vp.controls.update();
      const t = performance.now();
      await new Promise(r => requestAnimationFrame(() => r(null)));
      times.push(performance.now() - t);
    }
    return { frames: times, total: performance.now() - t0 };
  });
  led.orbit_frame_ms = { n: frame.frames.length, median: +median(frame.frames).toFixed(2),
                         max: +Math.max(...frame.frames).toFixed(2) };
  await page.screenshot({ path: resolve(SHOTS, "02-rotated.png") });

  // ---- 4. 그 시점에서 이어 그리기 ----
  await page.click("#vt-draw");
  const before = await page.evaluate(() => window.s2s.strokes.length);
  // **기존 기하에 닿게 긋는다** — 사용자가 실제로 하는 것이고, 닿지 않으면 깊이를 정할
  // 근거가 없어 안 놓이는 것이 정상이다(그것을 재면 도구가 아니라 시나리오를 재는 것이 된다).
  // 그 시점에서 보이는 끝점 둘을 골라 그 사이를 긋는다(면 대각선 격이다).
  const viewPairs = await page.evaluate(() => {
    const s2s = window.s2s;
    const pts: [number, number][] = [];
    for (const s of s2s.strokes) {
      if (!s.pts3d.length) continue;
      for (const p of [s.pts3d[0], s.pts3d[s.pts3d.length - 1]]) {
        const q = s2s.projectToView(p);
        if (q && q[0] > 20 && q[1] > 20) pts.push([q[0], q[1]]);
      }
    }
    // 화면에서 충분히 떨어진 두 점을 고른다(짧은 획은 어느 소실점에나 맞는다, W-2)
    let best: [number, number][] | null = null, bestD = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d > bestD && d < 400) { bestD = d; best = [pts[i], pts[j]]; }
    }
    return best ? [best] : [];
  });
  expect(viewPairs.length).toBe(1);
  const viewLat: number[] = [];
  for (const [a, b] of viewPairs) {
    const n = 12;
    const path = Array.from({ length: n + 1 }, (_, i) =>
      [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as [number, number]);
    viewLat.push(await strokeLatency(page, "#ink3d", path));
  }
  const afterView = await page.evaluate(() => ({
    n: window.s2s.strokes.length,
    fromView: window.s2s.strokes.length,
    locked: window.s2s.panel.locked,
    placed: window.s2s.strokes.filter((s: any) => s.pts3d.length).length,
  }));
  expect(afterView.n).toBe(before + viewPairs.length);
  led.second_view = { added: afterView.n - before, placed_total: afterView.placed,
                      camera_locked: afterView.locked,
                      latency_ms: { median: +median(viewLat).toFixed(2) },
                      note: "**기존 기하의 끝점 둘 사이**를 그었다(면 대각선 격). `camera_locked`가 "
                        + "false면 그 획이 안 놓였다는 뜻이다 — 잠금은 놓였을 때만 걸린다(D-S22의 귀결)." };
  await page.screenshot({ path: resolve(SHOTS, "03-second-view.png") });

  // ---- 5. 고치기 (첫 시점) — 미배치 획을 손으로 붙인다 ----
  await page.click("#vt-orbit");
  await page.click('#tools button[data-t="edit"]');
  const fix = await page.evaluate(() => {
    const s2s = window.s2s;
    const un = s2s.strokes.filter((s: any) => !s.pts3d.length && !s2s.userPlaced.has(s.id));
    let ops = 0, fixed = 0, noCand = 0;
    for (const s of un) {
      s2s.select(s.id); ops += 1;
      const c = s2s.candidates();
      if (!c.length) { noCand += 1; continue; }
      const ends = [0, 1].map(e => c.find((d: any) => d.end === e)).filter(Boolean);
      for (const d of ends) { s2s.editClick(d.at); ops += 1; }
      if (s.pts3d.length) fixed += 1;
    }
    s2s.select(null);
    return { unplaced: un.length, ops, fixed, noCand,
             provisional: [...s2s.provisional].length, userPlaced: [...s2s.userPlaced].length };
  });
  led.fix_by_hand = { ...fix,
    note: "**실제 UI 경로**(select → candidates → editClick)로 붙였다. `ops`는 조작 수다 — "
      + "합성 하네스(`fix_load.json`)와 같은 셈법이고, 여기서는 시나리오 하나의 실측이다. "
      + "`noCand`는 **돌린 시점에서 그린 획**이다 — 첫 시점 캔버스에는 후보가 없다(좌표계가 다르다).",
  };

  // ---- 5b. 돌린 시점의 고치기 — **"그 시점으로" → 3D 캔버스에서 붙인다**(S-7 4) ----
  // D-S22가 돌린 시점의 자동 배치를 막았으므로 **이 경로가 그 획들의 유일한 길**이다.
  // 시나리오에서 실제로 통하는지가 §1 왕복 지표의 실측이다.
  const fixView = await page.evaluate(() => {
    const s2s = window.s2s;
    const un = s2s.strokes.filter((s: any) => !s.pts3d.length);
    let ops = 0, placed = 0, sameViewOk = 0;
    for (const s of un) {
      s2s.select(s.id); ops += 1;
      const c0 = s2s.viewCamHas(s.id);
      if (!c0) continue;
      // "그 시점으로" 한 번(조작 1) — 그 뒤에야 후보가 뜬다
      const el = document.querySelector("#goview") as HTMLButtonElement | null;
      if (el) { el.click(); ops += 1; }
      if (!s2s.sameView(s.id)) continue;
      sameViewOk += 1;
      s2s.setView3dMode("fix");
      const cands = s2s.candidates3d();
      const ends = [0, 1].map(e => cands.find((d: any) => d.end === e)).filter(Boolean);
      for (const d of ends) { s2s.editClick3d(d.at); ops += 1; }
      if (s.pts3d.length) placed += 1;
    }
    s2s.setView3dMode("orbit"); s2s.select(null);
    return { unplaced: un.length, ops, placed, sameViewOk,
             stillUnplaced: s2s.strokes.filter((x: any) => !x.pts3d.length).length };
  });
  led.fix_in_rotated_view = { ...fixView,
    note: "돌린 시점 획은 **그 시점으로 돌아가야** 후보가 생긴다(좌표계가 그 시점의 것이다). "
      + "조작 수에 '그 시점으로' 1이 더 붙는다 — `fix_load.json`의 모형이 0으로 잡은 항목이다.",
  };
  await page.screenshot({ path: resolve(SHOTS, "04-fixed.png") });

  // ---- 6. 저장 → 새로고침 → 복원 ----
  const fingerprint = await page.evaluate(async () => {
    await window.s2s.saveNow();
    const s = window.s2s.strokes;
    return { ids: s.map((x: any) => x.id),
             p3: s.map((x: any) => (x.pts3d.length ? x.pts3d[0].map((v: number) => +v.toFixed(6)) : null)),
             p2: s.map((x: any) => x.pts2d[0]),
             user: [...window.s2s.userPlaced].sort(),
             placed: s.filter((x: any) => x.pts3d.length).length };
  });
  const t0 = Date.now();
  await page.reload();
  await page.waitForFunction(() => !!window.s2s && window.s2s.strokes.length > 0);
  const restored = await page.evaluate(() => {
    const s = window.s2s.strokes;
    return { ids: s.map((x: any) => x.id),
             p3: s.map((x: any) => (x.pts3d.length ? x.pts3d[0].map((v: number) => +v.toFixed(6)) : null)),
             p2: s.map((x: any) => x.pts2d[0]),
             user: [...window.s2s.userPlaced].sort(),
             placed: s.filter((x: any) => x.pts3d.length).length,
             cam: window.s2s.panel.acc.solve().camera.case,
             mesh: window.s2s.strokeView.lastCounts };
  });
  // **한 비트도 안 변해야 한다** — 저장은 원본을 보존한다(§5).
  expect(restored.ids).toEqual(fingerprint.ids);
  expect(restored.p2).toEqual(fingerprint.p2);
  expect(restored.p3).toEqual(fingerprint.p3);
  expect(restored.user).toEqual(fingerprint.user);
  expect(restored.cam).toBe("3pt");
  led.reload = { ms: Date.now() - t0, strokes: restored.ids.length, placed: restored.placed,
                 user_placed: restored.user.length, identical: true, mesh: restored.mesh };
  await page.screenshot({ path: resolve(SHOTS, "05-restored.png") });
  // **스크린샷 회귀** — 왼쪽 캔버스만 본다. 3D는 GPU·드라이버에 따라 픽셀이 흔들리지만
  // 2D 캔버스는 같은 카메라·같은 획이면 같은 그림이다(회귀를 잡을 수 있는 자리다).
  // 기준 이미지는 첫 실행에서 만들어지고 `e2e/__screenshots__`에 남는다.
  await expect(page.locator("#left")).toHaveScreenshot("left-restored.png",
    { maxDiffPixelRatio: 0.02 });

  // ---- 7. 내보내기 ----
  const exp = await page.evaluate(() => {
    const o = window.s2s.exportObj(), g = window.s2s.exportGltf();
    return { obj: { strokes: o.strokes, points: o.points, skipped: o.skippedUnplaced,
                    hasFace: /^f /m.test(o.data), bytes: o.data.length },
             gltf: { nodes: g.data.nodes.length, modes: [...new Set(g.data.meshes
                       .map((m: any) => m.primitives[0].mode))],
                     bytes: JSON.stringify(g.data).length } };
  });
  expect(exp.obj.hasFace).toBe(false);       // 면은 만들지 않는다(D-S20)
  expect(exp.gltf.modes).toEqual([3]);       // LINE_STRIP
  led.export = exp;

  // ---- 8. 실행 취소·지우개 ----
  const undoR = await page.evaluate(() => {
    const s2s = window.s2s, n0 = s2s.strokes.length;
    const p = s2s.strokes.find((x: any) => x.pts3d.length);
    const at = p ? [p.pts2d[0][0], p.pts2d[0][1]] : [0, 0];
    s2s.eraseAt(at); s2s.refresh();
    const n1 = s2s.strokes.length;
    s2s.undo();
    return { before: n0, afterErase: n1, afterUndo: s2s.strokes.length,
             redoDepth: s2s.redoDepth() };
  });
  expect(undoR.afterErase).toBe(undoR.before - 1);
  expect(undoR.afterUndo).toBe(undoR.before);
  led.undo_erase = undoR;

  led.console_errors = errors;
  expect(errors).toEqual([]);
});

test("오프라인에서도 뜬다(서비스 워커는 빌드본에서만 등록된다)", async ({ page, context }) => {
  // 개발 서버에서는 서비스 워커를 **일부러 등록하지 않는다**(HMR과 충돌한다, main.ts).
  // 그러므로 여기서 재는 것은 "오프라인이면 못 뜬다"는 **사실 확인**이다 —
  // 오프라인 동작은 `npm run build` 산출물에서 성립하고 그 확인은 수동 절차다(README 2절 13번).
  await page.goto("/");
  await page.waitForFunction(() => !!window.s2s);
  const swRegistered = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).length);
  led.service_worker_in_dev = swRegistered;
  expect(swRegistered).toBe(0);
  await context.setOffline(true);
  const res = await page.goto("/").catch(() => null);
  led.offline_dev_server = res ? "떴다(캐시)" : "안 뜬다 — 개발 서버에는 서비스 워커가 없다";
  await context.setOffline(false);
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "e2e.json"), JSON.stringify({
    spec: "S-10 종단 검증 — **실제 앱을 띄우고 실제 포인터 이벤트로** 그린 결과.",
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
    why: "지금까지의 측정은 전부 함수 호출이다. DOM·잉크 캡처·three 렌더·IndexedDB가 "
       + "함께 도는 것은 여기가 처음이고, **잉크 캡처 회귀 테스트가 0이었던 자리**이기도 하다.",
    condition: {
      browser: "chromium(Playwright) · 1440×900 · deviceScaleFactor 1",
      server: "개발 서버(`npm run dev:5222`, 번들 없음) — 지연은 **상한**으로 읽는다",
      composition: "요 35°·피치 15° 3점(f=320px), 상자 하나 12획 + 돌린 시점 2획",
      machine_dependent: "지연·프레임 시간은 이 기계의 값이다. 회귀 감시용이고 절대 기준이 아니다.",
    },
    ...led,
  }, null, 2), "utf-8");
});

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
