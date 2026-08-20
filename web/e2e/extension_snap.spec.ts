// **연장선 스냅 종단**(2026-08-19 13차 항목 3-h) — 앱 배선의 회귀 팔:
//   ① 끝점에서 그 선의 방향 그대로 바깥으로 그으면 **연장선 경로**(placeBy.extension)로
//      즉시 놓인다(지시 3-c — 좌표가 그 자리에서 정해진다).
//   ② 놓인 획이 원 선과 **같은 3D 직선 위**다(공선성 — 3-h의 첫 물음).
//   ③ 토글을 끄면(OSNAP.kinds.extension = false, 지시 3-g) 같은 손짓이 연장선으로 안
//      가고 **다른 스냅**(축 스냅 — start_anchor 경로)으로 넘어간다(지시 3-a의 후반).
// 발동 임계·안쪽 배제 등 판정 자체의 반례는 unit(extension_snap.test.ts)이 잰다.
import { test, expect } from "@playwright/test";
import { openDrawing } from "./fixture.js";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { gate } from "../test/gate.js";
import { extensionDir } from "../src/s3d/extension.js";
import { endFromCursor } from "../src/s3d/liveLine.js";
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { LIFT_TOL } from "../src/s3d/lift.js";
import { project, sub3, unit3, norm3, dot3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("연장선 스냅 — 끝점에서 이어 그으면 같은 3D 직선, 토글 끄면 축 스냅으로 (13차 항목 3)", async ({ page }) => {
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
  // **지평선을 픽스처의 소실점 높이에 긋는다**(18차 지시 j) — 이 픽스처의 깊이선들이
  // 겨냥하는 VP가 0.40H에 있다(아래 ① 주석). 그 높이가 곧 시선 높이다.
  await openDrawing(page, (await page.locator("#ink").boundingBox())!.height * 0.40);

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
  const led: Record<string, unknown> = {};

  // ---- 카메라를 세운다(ground_anchor와 같은 재료 — 몸통 교차 스타일)
  await drawPx(0.15 * W, 0.65 * H, 0.85 * W, 0.65 * H);
  await drawPx(0.22 * W, 0.72 * H, 0.42 * W, 0.5067 * H);
  await drawPx(0.85 * W, 0.75 * H, 0.62 * W, 0.5061 * H);
  await drawPx(0.40 * W, 0.78 * H, 0.46 * W, 0.59 * H);
  // ⚠⚠ **깊이선 1은 소실점을 만들고 사라졌다**(18차 지시 4·m) — 작도선이기 때문이다.
  // 연장선은 **남아 있는 획의 끝점**에서 나가므로, 같은 자리에 한 번 더 긋는다:
  // 그 획은 이미 있는 소실점의 **지지선**이라 사라지지 않고 3D로 놓인다.
  await drawPx(0.22 * W, 0.72 * H, 0.42 * W, 0.5067 * H);
  const base = await page.evaluate(() => ({
    lifted: window.S2S.doc().strokes.filter((s: any) => s.seg3d).length,
    pb: window.S2S.placeBy(),
  }));
  expect((base as any).lifted).toBeGreaterThan(0);

  // ---- ① 깊이선 1의 시작 끝점(0.22W, 0.72H)에서 **바깥**(소실점 반대쪽)으로 이어 긋는다.
  //      깊이선 1의 방향: (0.22, 0.72) → VP(0.52, 0.40). 바깥 = 그 반대다.
  await drawPx(0.22 * W, 0.72 * H, 0.22 * W - 0.09 * W, 0.72 * H + 0.096 * H);
  led.extended = await page.evaluate(() => {
    const st = window.S2S.doc().strokes;
    const last = st[st.length - 1];
    const pb = window.S2S.placeBy();
    const sum = pb.ref_anchor + pb.start_anchor + pb.two_point + pb.end_anchor
              + pb.cross_anchor + pb.batch + pb.ground + pb.extension + pb.unanchored;
    return { pb, place_sum: sum, lifted: st.filter((s: any) => s.seg3d).length,
             last: { seg3d: last.seg3d, axis: last.axis,
                     start: last.snapStart ? last.snapStart.kind : null } };
  });
  expect((led.extended as any).place_sum).toBe((led.extended as any).lifted);   // #43
  expect((led.extended as any).pb.extension).toBe((base as any).pb.extension + 1);
  expect((led.extended as any).lifted).toBe((base as any).lifted + 1);
  // ② **같은 3D 직선 위** — 원 선(깊이선 1)의 두 끝과 새 획의 두 끝이 공선이다
  led.collinear = await page.evaluate(() => {
    const st = window.S2S.doc().strokes;
    const orig = st.find((s: any) => s.seg3d && Math.abs(s.pts2d[0][0] - 0.22 * (document.getElementById("ink")!.clientWidth)) < 30
                                   && s.pts2d[0][1] > 0.6 * (document.getElementById("ink")!.clientHeight));
    const last = st[st.length - 1];
    if (!orig?.seg3d || !last?.seg3d) return null;
    const A = orig.seg3d[0], B = orig.seg3d[1];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const lu = Math.hypot(u[0], u[1], u[2]);
    const dev = (p: number[]) => {
      const v = [p[0] - A[0], p[1] - A[1], p[2] - A[2]];
      const c = [v[1] * u[2] / lu - v[2] * u[1] / lu, v[2] * u[0] / lu - v[0] * u[2] / lu,
                 v[0] * u[1] / lu - v[1] * u[0] / lu];
      return Math.hypot(c[0], c[1], c[2]);
    };
    return { d0: dev(last.seg3d[0]), d1: dev(last.seg3d[1]) };
  });
  expect(led.collinear).not.toBeNull();
  expect((led.collinear as any).d0).toBeLessThan(1e-6);
  expect((led.collinear as any).d1).toBeLessThan(1e-6);

  // ---- ③ 토글 끔(지시 3-g) — 같은 종류의 손짓(깊이선 2의 시작 끝점에서 바깥)이
  //      연장선으로 안 가고 축 스냅(start_anchor)으로 넘어간다(지시 3-a 후반)
  await page.evaluate(() => window.S2S.setOsnap({ kinds: { extension: false } }));
  await drawPx(0.85 * W, 0.75 * H, 0.85 * W + 0.08 * W, 0.75 * H + 0.085 * H);
  led.toggled_off = await page.evaluate(() => {
    const pb = window.S2S.placeBy();
    const sum = pb.ref_anchor + pb.start_anchor + pb.two_point + pb.end_anchor
              + pb.cross_anchor + pb.batch + pb.ground + pb.extension + pb.unanchored;
    return { pb, place_sum: sum,
             lifted: window.S2S.doc().strokes.filter((s: any) => s.seg3d).length };
  });
  expect((led.toggled_off as any).place_sum).toBe((led.toggled_off as any).lifted); // #43
  expect((led.toggled_off as any).pb.extension).toBe((led.extended as any).pb.extension); // 불변
  expect((led.toggled_off as any).pb.start_anchor)
    .toBeGreaterThan((led.extended as any).pb.start_anchor);                              // 폴백
  expect((led.toggled_off as any).lifted).toBe((led.extended as any).lifted + 1);
  await page.evaluate(() => window.S2S.setOsnap({ kinds: { extension: true } }));

  // ---- ④ **임계 밖 폴백**(지시 3-a 후반 · 리뷰어 [15]) — 깊이선 3의 시작 끝점에서
  //      연장 방향에서 ~15° 튼 손짓: 연장선은 발동하지 않고 축 스냅이 받는다(획은 놓인다)
  await drawPx(0.40 * W, 0.78 * H, 0.40 * W - 0.055 * W, 0.78 * H + 0.10 * H);
  led.off_angle = await page.evaluate(() => {
    const st = window.S2S.doc().strokes;
    const last = st[st.length - 1];
    return { pb: window.S2S.placeBy(),
             lifted: st.filter((s: any) => s.seg3d).length,
             lastAxis: last.axis, lastSeg: !!last.seg3d };
  });
  expect((led.off_angle as any).pb.extension).toBe((led.extended as any).pb.extension); // 불변
  expect((led.off_angle as any).lastSeg).toBe(true);                                    // 놓였다
  expect(typeof (led.off_angle as any).lastAxis).toBe("number");                        // 축 경로

  // ---- **순수 함수 팔들을 같은 원장에 넣는다**(#25 — 측정을 테스트 밖 산문에 두지 않는다)
  // ⓐ 축 밖(대각) 원 선 — 3-b("유일한 수단")의 직접 팔: 소실점 없이도 발동·공선이 선다
  const P2: Pt2 = [590, 334], F2 = 500;
  const at3 = (p: Pt2, z: number): Vec3 =>
    [((p[0] - P2[0]) / F2) * z, ((p[1] - P2[1]) / F2) * z, z];
  const dA = at3([400, 300], 2), dB = at3([700, 420], 3);       // 축이 아닌 임의 3D 방향
  const pB2 = project(dB, P2, F2)!;
  const pA2 = project(dA, P2, F2)!;
  const outDir: Pt2 = (() => { const d = [pB2[0] - pA2[0], pB2[1] - pA2[1]];
    const L = Math.hypot(d[0], d[1]); return [d[0] / L, d[1] / L] as Pt2; })();
  const diagArm = (() => {
    const chordEnd: Pt2 = [pB2[0] + outDir[0] * 150, pB2[1] + outDir[1] * 150];
    const dir = extensionDir(dB, dA, [pB2[0], pB2[1]], chordEnd, { principal: P2, f: F2 });
    if (!dir) return { engaged: false };
    const e = endFromCursor(dB, dir, chordEnd, { principal: P2, f: F2 })!;
    const v = sub3(e, dA), u = unit3(sub3(dB, dA));
    const cross = Math.hypot(v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2],
                             v[0] * u[1] - v[1] * u[0]);
    return { engaged: true, collinear_dev: +cross.toExponential(2),
             axis_involved: false };
  })();
  // ⓑ **어긋난 원 선의 갈림**(리뷰어 [5] — "기하는 같다"의 사거리): 축에서 3° 튼 원 선의
  //     연장은 **원 선을 따른다** — 축 경로와의 각차가 곧 3°다(연장선의 정의이지 오차가
  //     아니다 — AS-L41과 같은 방향. 옳음은 원 선의 옳음에 상속된다).
  const axisDir3: Vec3 = unit3([1, 0, 0.2]);
  const rot = (d: Vec3, deg: number): Vec3 => {
    const th = (deg * Math.PI) / 180;
    return unit3([d[0] * Math.cos(th) - d[1] * Math.sin(th),
                  d[0] * Math.sin(th) + d[1] * Math.cos(th), d[2]]);
  };
  const devArm = (() => {
    const origDir = rot(axisDir3, 3);
    const A: Vec3 = [-0.4, 0.3, 3];
    const B: Vec3 = [A[0] + origDir[0], A[1] + origDir[1], A[2] + origDir[2]];
    const pa = project(A, P2, F2)!, pb = project(B, P2, F2)!;
    const d2: Pt2 = [pb[0] - pa[0], pb[1] - pa[1]];
    const L2 = Math.hypot(d2[0], d2[1]);
    const chordEnd: Pt2 = [pb[0] + (d2[0] / L2) * 120, pb[1] + (d2[1] / L2) * 120];
    const dir = extensionDir(B, A, [pb[0], pb[1]], chordEnd, { principal: P2, f: F2 });
    if (!dir) return { engaged: false };
    const degVsAxis = (Math.acos(Math.min(1, Math.abs(dot3(dir, axisDir3)))) * 180) / Math.PI;
    const degVsOrig = (Math.acos(Math.min(1, Math.abs(dot3(dir, origDir)))) * 180) / Math.PI;
    return { engaged: true, orig_off_axis_deg: 3,
             ext_vs_axis_deg: +degVsAxis.toFixed(4), ext_vs_orig_deg: +degVsOrig.toFixed(4) };
  })();
  // ⓒ **단축 상 가드의 동작점 스윕**(리뷰어 [4][10] — 조리개는 전역 해시 밖·사용자 가변):
  //     상 길이 6px의 원 선(시선과 거의 나란)에서 minImagePx ∈ {0(가드 끔), 4, 8, 40}
  const guardSweep = (() => {
    const A: Vec3 = [0.1, 0.1, 3];
    const B: Vec3 = [0.104, 0.104, 4.2];                       // 상이 몇 px가 되는 깊이 방향
    const pa = project(A, P2, F2)!, pb = project(B, P2, F2)!;
    const imgLen = +Math.hypot(pb[0] - pa[0], pb[1] - pa[1]).toFixed(2);
    // 바깥 방향(상의 방향 그대로)의 현 — 상이 짧아도 부호는 정의돼 있다
    const dImg: Pt2 = [pb[0] - pa[0], pb[1] - pa[1]];
    const Li = Math.hypot(dImg[0], dImg[1]);
    const chordEnd: Pt2 = [pb[0] + (dImg[0] / Li) * 140, pb[1] + (dImg[1] / Li) * 140];
    const rows = [0, 4, 8, 40].map(m => ({
      min_image_px: m,
      engaged: !!extensionDir(B, A, [pb[0], pb[1]], chordEnd,
                              { principal: P2, f: F2 }, LIFT_TOL.parallel_deg, m),
    }));
    return { image_len_px: imgLen, rows,
             note: "가드 0(끔 팔 — #30)이면 몇 px 상도 발동한다 — 그 방향은 잡음이다(입면의 "
                 + "깊이축 선이 실측 사례 — basic_flow 네 입면). 가드가 조리개 값에 묶여 "
                 + "있으므로 사용자가 40px로 올리면 상 40px 미만 선의 연장이 죽는다 — 그 "
                 + "맞바꿈이 이 표다(#12 동작점)" };
  })();

  // ---- 원장
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "extension_snap.json"), JSON.stringify({
    spec: "연장선 스냅 종단(13차 항목 3) — 발동·공선성·토글 끔 폴백",
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
    why: "Rhino Extension·SketchUp 선 위 연장 선례(A-3). 끝점 앵커 + 원 선 방향이라 좌표가 "
       + "즉시 정해지는 셋째 연결 수단(지시 3-c). 판정 임계(LIFT_TOL.parallel_deg 재사용 #17)의 "
       + "반례는 unit이 잰다 — 이 원장은 앱 배선의 회귀다.",
    thresholds: {
      note: "이 실행의 동작점(리뷰어 [4] — 조리개는 전역 해시 밖·사용자 4~40px 가변이라 "
          + "원장이 자기 값을 든다). collinear_dev는 임계가 아니라 배선 확인이다(#5 — 아래 gate)",
      parallel_deg: LIFT_TOL.parallel_deg,
      aperture_px_at_run: OSNAP_RADIUS_PX,
      min_image_px_at_run: OSNAP_RADIUS_PX,
    },
    what_this_does_not_say: [
      "**동작점이 하나다**(#12) — 카메라 한 구도·끝점 두 곳이다. 각 스윕은 unit의 임계 경계 팔이, "
      + "가드 동작점은 guard_sweep이 대신한다.",
      "arms의 수는 픽스처가 정한다(#46) — 판정은 조건(경로 전이·토글 불변·합=전체)이다.",
      "**공선성은 게이트 조건이 아니다**(#5 — 구성의 성질: endFromCursor는 정의상 그 직선 위 "
      + "점을 낸다. 배선 확인으로만 남긴다 — collinear·diagonal_arm.collinear_dev의 0 근처 값이 "
      + "selfcheck의 near-zero 의심에 걸리면 이 문장이 그 원인 확인이다).",
      "**연장선의 '옳음'은 원 선의 옳음에 상속된다**(divergence_arm — 원 선이 축에서 3° 튼 "
      + "픽스처에서 연장은 원 선을 따르고 축 경로와 정확히 그만큼 갈린다. 그것이 이 기능의 "
      + "정의다(같은 3D 직선 — 3-c). '기하는 같다'는 정확 겨냥 원 선에 한한 문장이다 — "
      + "리뷰어 [5]로 사거리를 좁혔다).",
    ],
    arms: led,
    /** 순수 함수 팔(#25 — 원장 안에): 축 밖 원 선 · 어긋난 원 선의 갈림 · 가드 동작점 스윕 */
    diagonal_arm: diagArm,
    divergence_arm: devArm,
    guard_sweep: guardSweep,
    /** 토글 짝 대조의 증분(#30 · 리뷰어 [1][2]) — 누적 카운터의 팔별 Δ */
    toggle_contrast: {
      note: "placeBy는 페이지 누적이다 — 팔별 증분이 판정이다: 켬 팔 Δ(+1) ↔ 끔 팔 Δ(0). "
          + "recovered = Δon − Δoff가 이 경로가 실제로 가르는 양이다(ground_anchor의 "
          + "recovered_by_ground와 같은 형태)",
      delta_on: (led.extended as any).pb.extension - (base as any).pb.extension,
      delta_off: (led.toggled_off as any).pb.extension - (led.extended as any).pb.extension,
      recovered: ((led.extended as any).pb.extension - (base as any).pb.extension)
               - ((led.toggled_off as any).pb.extension - (led.extended as any).pb.extension),
    },
    gate: gate({
      registered: "① 끝점 바깥 이어 긋기가 placeBy.extension을 팔 증분 +1로 즉시 놓는다(3-c) "
                + "② 토글 끄면 증분 0·start_anchor 폴백(3-a·3-g) ③ 임계 밖 손짓은 축 경로로 "
                + "놓인다(off_angle 팔 — 3-a 후반) ④ 두 확정 팔의 place_sum == lifted(#43). "
                + "공선성은 게이트 조건이 아니다(#5 — what_this_does_not_say). 값은 arms·"
                + "toggle_contrast가 든다(#47)",
      reachability: "도달 가능성은 토글 **짝 대조의 증분 차**다(#30 · 리뷰어 [1][2] — 판정 "
                  + "필드 자체를 적던 초판을 ground_anchor의 recovered 형태로 갈았다): "
                  + "Δon(+1) − Δoff(0). ⚠ 값은 픽스처가 정한다(#46) — 0에서 양수로의 전이가 판정",
      reachability_value: ((led.extended as any).pb.extension - (base as any).pb.extension)
                        - ((led.toggled_off as any).pb.extension - (led.extended as any).pb.extension),
      reachability_value_fixture_determined: true,
      reachability_source: "toggle_contrast/recovered",
      note: "이 항목이 걸리는 번호: #30(토글·가드 끔 대조) · #46(픽스처 결정값) · #12(동작점 — "
          + "guard_sweep이 가드의 동작점을 든다) · #17(임계 재사용) · #5(공선성·diagonal_arm은 "
          + "구성의 성질 — 판별은 divergence_arm과 경로 전이) · #25(순수 팔을 원장 안에)",
    }),
    page_errors: errors,
  }, null, 2), "utf-8");
  expect(errors).toEqual([]);
});
