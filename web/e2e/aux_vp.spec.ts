// **보조 소실점**(2026-08-19 15차 항목 7 · D-L106). 산출: `stage0/out/aux_vp.json`.
//
// 사용자 지시 7(압축 기록): *"보조 소실점 — 미구현. 지평선 위 틱 · 탈레스 반원 ·
// 각도 입력 · 화면 밖 처리 · 스냅 후보 · 경사 소실점 · 위계."*
//
// **미구현이 맞았다** — 저장소에 보조 소실점이 없었다(`grep`로 확인했고 그 자체가 재현이다).
// 그러므로 이 원장이 재는 것은 «고쳤는가»가 아니라 **«새로 넣은 것이 지시대로 도는가»**다.
//
// **판정은 앱 경로가 한다**(#17 · 항목 6에서 배운 것): 자리는 `S2S.auxVps`(그리는 쪽과
// 같은 `viewOverlayCtx`), 스냅은 **실제로 획을 그어** `placeBy.aux`가 느는지로 본다 —
// 하네스가 판정을 다시 쓰지 않는다.
//
// 착수 시 `PITFALLS.md`를 읽었다(표는 `progress.md`의 이 항목 착수 절):
//   #5  탈레스가 f를 되돌리는 것은 **단위 팔**의 몫이다(이론서가 정답) — 여기서는 배선을 잰다
//   #12 각도 여럿(45·30·60)·경사 둘(±)·화면 안/밖을 돈다
//   #17 자리·스냅 판정이 앱 함수 하나를 지난다 · 새 임계 없음(`AXIS_TOL`·`PICK_TOL` 재사용)
//   #21 dpr 1 · #30 되살림은 `clearAux()`(보조가 없던 거동) · #32 미실행을 반증으로 안 쓴다
//   #35 못 만든 갈래(무한원 보조)를 안전으로 안 읽는다 · #36 안 잰 팔을 0으로 안 센다
//   #38 팔 수와 질의 수를 하네스가 스스로 적는다
//   #40·#46 게이트 값은 **보조가 이긴 획 수 ↔ 없을 때 그 획이 간 축**의 대비다
//   #41 새 게이트다 — CLAUDE.md §2의 중단 조건이 아니다
//   #47 수치를 산문에 안 박는다 · #49 «이겼다»의 단위는 **배치 경로**(placeBy)다
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("보조 소실점 — 각도로 만들고, 그 방향으로 그으면 붙는다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e}`));
  await page.goto("/l.html");
  await setupConfirmed(page);

  // ---- ① **각도 입력**(지시 7-c) — 앱의 「추가」와 같은 함수를 부른다
  const made = await page.evaluate(() => {
    const S = window.S2S;
    S.clearAux();
    const ids = [S.addAux(45, 0), S.addAux(30, 0), S.addAux(60, 0)];
    return { ids, dirs: S.aux().dirs };
  });

  // ---- ② **자리**(지시 7-a) — 수평 보조는 **지평선 위**에 선다
  const placed = await page.evaluate(() => {
    const S = window.S2S;
    const o = S.thales();
    const av = S.auxVps();
    const ov = S.draftOverlay();
    const hv = ov.axisVps.filter((a: any) => a && a.at).map((a: any) => a.at);
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      aux: av.map((a: any) => a && ({ id: a.id, yaw: a.yawDeg, pitch: a.pitchDeg,
                                      at: a.at ? a.at.map(r) : null,
                                      dist: a.distFromPrincipal == null ? null
                                            : r(a.distFromPrincipal) })),
      horizon_y: hv.length >= 2 ? [r(hv[0][1]), r(hv[1][1])] : null,
      // 지평선(두 수평 소실점을 잇는 선)까지의 점-선 거리 — 0이어야 한다(이론서: 수평 방향)
      gap_to_horizon_px: (() => {
        if (hv.length < 2) return null;
        const [a, b] = hv;
        const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
        return av.filter((x: any) => x && x.at).map((x: any) =>
          r(Math.abs((x.at[0] - a[0]) * ey - (x.at[1] - a[1]) * ex) / L));
      })(),
      principal: o ? o.principal.map(r) : null,
    };
  });

  // ---- ③ **탈레스 반원과 측점**(지시 7-b · 이론서 6.2·7.3)
  const th = await page.evaluate(() => {
    const S = window.S2S;
    S.setThales(true);
    const t = S.thales();
    const c = S.cam.ctx();
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    return t && t.thales ? {
      f_from_thales: r(t.thales.f), f_camera: r(c.f),
      f_rel_gap: r(Math.abs(t.thales.f - c.f) / c.f),
      E: t.thales.E.map((v: number) => Math.round(v * 100) / 100),
      measuring: t.measuring.map((m: any) => m && m.at.map((v: number) => Math.round(v * 100) / 100)),
    } : null;
  });

  // ---- ④ **경사 보조**(지시 7-f · 이론서 15.1) — 대응 수평 소실점의 **바로 위/아래**
  const slope = await page.evaluate(() => {
    const S = window.S2S;
    const up = S.addAux(45, 25), dn = S.addAux(45, -25);
    const av = S.auxVps();
    const ov = S.draftOverlay();
    const find = (id: string) => av.find((a: any) => a && a.id === id);
    const h = av.find((a: any) => a && a.yawDeg === 45 && a.pitchDeg === 0);
    const u = find(up), d = find(dn);
    const vUp = ov.axisVps[2];
    const r = (v: number) => Math.round(v * 1000) / 1000;
    // **일반형**(이론서 15.1의 확장): 경사 소실점은 «대응 수평 소실점 ↔ 수직축 소실점»
    // 직선 위에 있다. 15.1의 «바로 위/아래»는 수직축이 무한원(2점)일 때의 특수해다 —
    // 이 픽스처는 3점이라 문면 그대로는 성립하지 않는다(AS-L54에 기록).
    const onLine = (v: any) => {
      if (!v?.at || !h?.at) return null;
      if (vUp && vUp.at) {
        const ex = vUp.at[0] - h.at[0], ey = vUp.at[1] - h.at[1], L = Math.hypot(ex, ey);
        return r(Math.abs((v.at[0] - h.at[0]) * ey - (v.at[1] - h.at[1]) * ex) / L);
      }
      const ex = vUp ? vUp.screenDir[0] : 0, ey = vUp ? vUp.screenDir[1] : 1;
      return r(Math.abs((v.at[0] - h.at[0]) * ey - (v.at[1] - h.at[1]) * ex));
    };
    return { h: h?.at ? h.at.map(r) : null, up: u?.at ? u.at.map(r) : null,
             dn: d?.at ? d.at.map(r) : null,
             vertical_vp: vUp && vUp.at ? vUp.at.map(r) : null,
             vertical_infinite: !!(vUp && !vUp.at),
             /** 일반형의 잔차(px) — 그 직선에서 벗어난 거리 */
             line_off_up: onLine(u), line_off_dn: onLine(d),
             /** 15.1의 **문면**(화면 세로) — 3점에서는 0이 아니다. 반증의 실측이다 */
             dx_up: u?.at && h?.at ? r(Math.abs(u.at[0] - h.at[0])) : null,
             dx_dn: d?.at && h?.at ? r(Math.abs(d.at[0] - h.at[0])) : null,
             up_above: !!(u?.at && h?.at) && u.at[1] < h.at[1],
             dn_below: !!(d?.at && h?.at) && d.at[1] > h.at[1] };
  });

  // ---- ⑤ **스냅**(지시 7-e) — 보조 방향으로 실제로 긋는다. 판정은 **`placeBy.aux`**다
  const drawAlong = async (auxId: string) => {
    const box = (await page.locator("#frame").boundingBox())!;
    const g = await page.evaluate(async (id: string) => {
      const S = window.S2S;
      const g3 = await import("/src/s3d/geom3d.ts");
      const c = S.cam.ctx();
      const st = S.doc().strokes.find((x: any) => x.seg3d)!;
      const a = g3.project(st.seg3d[0], c.principal, c.f)!;    // 기존 끝점(앵커가 붙는다)
      const v = S.auxVps().find((x: any) => x && x.id === id);
      if (!v || !v.at) return null;
      const dx = v.at[0] - a[0], dy = v.at[1] - a[1], L = Math.hypot(dx, dy) || 1;
      return { a, b: [a[0] + (dx / L) * 170, a[1] + (dy / L) * 170] };
    }, auxId);
    if (!g) return null;
    const before = await page.evaluate(() => ({ ...window.S2S.placeBy() }));
    await page.mouse.move(box.x + g.a[0], box.y + g.a[1]);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + g.a[0] + (g.b[0] - g.a[0]) * i / 6,
                            box.y + g.a[1] + (g.b[1] - g.a[1]) * i / 6);
    }
    await page.mouse.up();
    await page.waitForTimeout(70);
    const after = await page.evaluate(() => {
      const S = window.S2S, sts = S.doc().strokes, s = sts[sts.length - 1];
      return { placeBy: { ...S.placeBy() }, axis: s.axis, auxId: s.auxId ?? null,
               lifted: !!s.seg3d, note: S.snapNote() };
    });
    const dp: Record<string, number> = {};
    for (const k of Object.keys(after.placeBy)) {
      const d = (after.placeBy as any)[k] - (before as any)[k];
      if (d) dp[k] = d;
    }
    return { aux_id: auxId, before_aux: before.aux, after_aux: after.placeBy.aux,
             delta_aux: after.placeBy.aux - before.aux,
             /** 그 손짓이 늘린 **모든** 경로 카운터 — 어디로 갔는지가 여기 있다(#43) */
             place_delta: dp,
             stroke_axis: after.axis, stroke_aux_id: after.auxId, lifted: after.lifted };
  };
  const snapOn = await drawAlong("aux1");
  // **되살림**(#30) — 보조를 지우고 **같은 손짓**을 다시 한다: 축으로 끌려가야 한다
  const snapOff = await (async () => {
    const keepIds = await page.evaluate(() => window.S2S.aux().dirs.map((d: any) => d.id));
    const at = await page.evaluate((id: string) => {
      const v = window.S2S.auxVps().find((x: any) => x && x.id === id);
      return v && v.at ? v.at : null;
    }, "aux1");
    if (!at) return null;
    const box = (await page.locator("#frame").boundingBox())!;
    const g = await page.evaluate(async (a2: any) => {
      const S = window.S2S;
      const g3 = await import("/src/s3d/geom3d.ts");
      const c = S.cam.ctx();
      const st = S.doc().strokes.find((x: any) => x.seg3d)!;
      const a = g3.project(st.seg3d[0], c.principal, c.f)!;
      const dx = a2[0] - a[0], dy = a2[1] - a[1], L = Math.hypot(dx, dy) || 1;
      S.clearAux();                                  // ← 되살림: 보조가 없던 거동
      return { a, b: [a[0] + (dx / L) * 170, a[1] + (dy / L) * 170] };
    }, at);
    const before = await page.evaluate(() => ({ ...window.S2S.placeBy() }));
    await page.mouse.move(box.x + g.a[0], box.y + g.a[1]);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + g.a[0] + (g.b[0] - g.a[0]) * i / 6,
                            box.y + g.a[1] + (g.b[1] - g.a[1]) * i / 6);
    }
    await page.mouse.up();
    await page.waitForTimeout(70);
    const after = await page.evaluate(() => {
      const S = window.S2S, sts = S.doc().strokes, s = sts[sts.length - 1];
      return { placeBy: { ...S.placeBy() }, axis: s.axis, auxId: s.auxId ?? null,
               lifted: !!s.seg3d };
    });
    const dp: Record<string, number> = {};
    for (const k of Object.keys(after.placeBy)) {
      const d = (after.placeBy as any)[k] - (before as any)[k];
      if (d) dp[k] = d;
    }
    return { kept_ids: keepIds, delta_aux: after.placeBy.aux - before.aux, place_delta: dp,
             stroke_axis: after.axis, stroke_aux_id: after.auxId, lifted: after.lifted };
  })();

  // ---- ⑦ **위계 — 비기면 축이 이긴다**(지시 7 "위계"). 각 **0°** 보조는 축 0과
  // 정확히 같은 방향이므로 화면 각이 **같다**. 그때 축이 이겨야 한다(엄격 비교).
  // ⚠ 이 팔이 없으면 위계는 **선언뿐**이다 — 규약을 재는 자리가 여기다.
  const tie = await (async () => {
    const box = (await page.locator("#frame").boundingBox())!;
    const g = await page.evaluate(async () => {
      const S = window.S2S;
      const g3 = await import("/src/s3d/geom3d.ts");
      const c = S.cam.ctx();
      S.clearAux();
      S.addAux(0, 0);                                  // ← 축 0과 **같은 방향**
      // ⚠ **앵커를 고를 때 연장선 경로를 피한다**(우선순위: 양 끝 스냅 > 연장선 > 축·보조).
      // 축 0을 따라 놓인 획의 끝점에서 축 0 쪽으로 그으면 **연장선**이 먼저 잡아서
      // 경쟁 자체가 안 열린다 — 첫 판이 그 자리에 걸렸다. **축 0이 아닌 획**의 끝점을 쓴다.
      const st = S.doc().strokes.find((x: any) => x.seg3d && x.axis !== 0 && x.axis !== "free")
              ?? S.doc().strokes.find((x: any) => x.seg3d)!;
      const a = g3.project(st.seg3d[0], c.principal, c.f)!;
      // 축 0의 소실점 쪽으로 긋는다 — 보조도 같은 소실점이다(각 0이므로)
      const av = S.draftOverlay().axisVps[0];
      if (!av || !av.at) return null;
      const dx = av.at[0] - a[0], dy = av.at[1] - a[1], L = Math.hypot(dx, dy) || 1;
      return { a, b: [a[0] + (dx / L) * 160, a[1] + (dy / L) * 160],
               aux_at: S.auxVps()[0]?.at ?? null, axis_at: av.at };
    });
    if (!g) return null;
    const before = await page.evaluate(() => ({ pb: { ...window.S2S.placeBy() },
                                                ax: { ...window.S2S.aux() } }));
    await page.mouse.move(box.x + g.a[0], box.y + g.a[1]);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + g.a[0] + (g.b[0] - g.a[0]) * i / 6,
                            box.y + g.a[1] + (g.b[1] - g.a[1]) * i / 6);
    }
    await page.mouse.up();
    await page.waitForTimeout(70);
    const after = await page.evaluate(() => {
      const S = window.S2S, sts = S.doc().strokes, s = sts[sts.length - 1];
      return { placeBy: { ...S.placeBy() }, axis: s.axis, auxId: s.auxId ?? null,
               aux: { ...S.aux() } };
    });
    const dp: Record<string, number> = {};
    for (const k of Object.keys(after.placeBy)) {
      const d = (after.placeBy as any)[k] - (before.pb as any)[k];
      if (d) dp[k] = d;
    }
    return { aux_at: g.aux_at, axis_at: g.axis_at,
             /** 두 소실점이 같은 자리인가 — «비긴다»의 구성 확인 */
             same_vp_px: g.aux_at ? Math.round(Math.hypot(g.aux_at[0] - g.axis_at[0],
                                                          g.aux_at[1] - g.axis_at[1]) * 1000) / 1000
                                  : null,
             place_delta: dp, stroke_axis: after.axis, stroke_aux_id: after.auxId,
             /** **이 손짓의 몫**(누적이 아니다) — 경쟁이 실제로 열렸고 보조가 졌는가 */
             competed_delta: after.aux.competed - before.ax.competed,
             won_delta: after.aux.won - before.ax.won };
  })();

  // ---- ⑥ **화면 밖 처리**(지시 7-d) — 아주 얕은 각은 소실점이 화면 밖으로 나간다
  const offscreen = await page.evaluate(() => {
    const S = window.S2S;
    S.clearAux();
    S.addAux(2, 0);                       // 축 0에 거의 나란한 방향 — 소실점이 멀다
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const v = S.auxVps()[0];
    const inside = !!(v && v.at && v.at[0] >= 0 && v.at[0] <= el.clientWidth
                      && v.at[1] >= 0 && v.at[1] <= el.clientHeight);
    return { at: v && v.at ? v.at.map((x: number) => Math.round(x)) : null,
             infinite: !!(v && !v.at), inside,
             canvas: [el.clientWidth, el.clientHeight] };
  });

  const led: any = {
    what: "각도로 만든 **보조 소실점**이 서고, 지평선 위 틱·화면 밖 표시·탈레스/측점·경사 "
      + "보조가 돌고, 그 방향으로 그으면 **붙되 축은 안 바뀌는가**(지시 7).",
    how: {
      place: "자리는 `S2S.auxVps`(그리는 쪽과 **같은 출처** `viewOverlayCtx`)가 낸다 — "
        + "하네스가 투영을 다시 짜지 않는다(#17).",
      snap: "스냅은 **실제로 획을 그어** `placeBy.aux`의 증분으로 잰다(#49: 단위는 배치 "
        + "경로다). 되살림은 `clearAux()` 뒤 **같은 손짓**이다(#30) — 보조가 없으면 축으로 "
        + "끌려가야 한다(축 스냅은 «각도로 거르지 않는다»).",
      theory: "이론서와의 일치(6.2의 f · 15.1의 위/아래 · 7.3의 |VM| = |VE|)는 **단위 팔**"
        + "(`test/aux_vp.test.ts`)이 정답을 밖에 두고 잰다. 여기서는 **배선**을 잰다.",
    },
    what_this_does_not_say: [
      "dpr 1·마우스·한 픽스처(확정된 합성 상자)다(#12·#21).",
      "**보조 각도가 옳은지는 안 잰다** — 사용자가 준 값이다. 이 원장이 재는 것은 그 값이 "
      + "**뜻대로 방향이 되는가**이고, 그 방향이 그리려는 벽과 맞는지는 사용자의 몫이다.",
      "**칠해진 픽셀은 안 잰다** — 틱·반원·측점의 **자리**만 든다(`drawAuxVps`·`drawThales`가 "
      + "그 값을 그대로 받는다).",
      "**무한원 보조는 이 픽스처에서 안 났다**(#35) — 축과 정확히 화면 평행이 되는 각도가 "
      + "있어야 하고 그 자리는 안 만들었다. 그 갈래는 **안 쟀다**(0으로 안 센다, #36).",
      "**비긴 자리는 쟀다**(⑦ — 각 0° 보조는 축 0과 같은 방향이라 화면 각이 같다). "
      + "그런데 **비슷하지만 안 비긴 자리**(축에서 1~3° 떨어진 보조)는 안 쟀다 — 그 대역의 "
      + "경계 스윕은 `DEFERRED`다.",
      "**저장/복원은 안 쟀다** — 보조는 `Camera`가 아니라 앱 상태라 `.brnl`에 안 들어간다"
      + "(그 결정과 대가는 `DEFERRED`).",
    ],
    setup: { canvas: offscreen.canvas, arms: 7,
             angles_deg: [45, 30, 60, 2], slopes_deg: [25, -25] },
    made, placed, thales: th, slope,
    snap: { on: snapOn, off: snapOff },
    tie,
    offscreen,
    summary: {
      aux_count: made.dirs.length,
      gap_to_horizon_px: placed.gap_to_horizon_px,
      f_rel_gap: th ? th.f_rel_gap : null,
      slope_line_off_px: [slope.line_off_up, slope.line_off_dn],
      /** 15.1의 문면(화면 세로 정렬) — 3점에서는 0이 아니다(AS-L54의 실측) */
      slope_dx_screen_px: [slope.dx_up, slope.dx_dn],
      vertical_vp_finite: !slope.vertical_infinite,
      slope_up_above: slope.up_above,
      slope_dn_below: slope.dn_below,
      snap_delta_aux: [snapOn ? snapOn.delta_aux : null, snapOff ? snapOff.delta_aux : null],
      snap_axis: [snapOn ? snapOn.stroke_axis : null, snapOff ? snapOff.stroke_axis : null],
      snap_aux_id: [snapOn ? snapOn.stroke_aux_id : null, snapOff ? snapOff.stroke_aux_id : null],
      /** 그 손짓이 늘린 경로 전부 — 켬은 `aux`, 끔은 다른 경로여야 한다(#43) */
      snap_place_delta: [snapOn ? snapOn.place_delta : null, snapOff ? snapOff.place_delta : null],
      offscreen_inside: offscreen.inside,
      /** **위계** — 같은 방향(각 0°)에서 축이 이기는가. 보조 경로가 안 늘어야 한다 */
      tie_place_delta: tie ? tie.place_delta : null,
      tie_stroke_axis: tie ? tie.stroke_axis : null,
      tie_same_vp_px: tie ? tie.same_vp_px : null,
      /** 경쟁이 실제로 열렸는가(>0) · 보조가 이겼는가(0이어야 한다) */
      tie_competed: tie ? tie.competed_delta : null,
      tie_won: tie ? tie.won_delta : null,
    },
    gate: {
      registered: "보조 소실점이 지평선 위에 서고(`gap_to_horizon_px` ≈ 0), 경사 보조가 "
        + "대응 수평 소실점과 **수직축 소실점을 잇는 직선 위**에 있고"
        + "(`slope_line_off_px` ≈ 0 — 이론서 15.1의 일반형), 그 방향으로 그은 획이 "
        + "**보조 경로로** 놓이며(`snap_delta_aux[0]` = 1) **축은 free**다. 판정은 "
        + "`summary`의 필드가 든다(#47).",
      registered_note: "⚠ **이 항목이 등록한 게이트다 — CLAUDE.md §2 중단 조건 아님**(#41).",
      reachability: "**보조가 없으면 그 손짓이 어디로 가는가** — 되살림 팔(`snap.off`)이 "
        + "그 답이다. 값은 `snap_delta_aux`(켬 1 · 끔 0)와 `snap_axis`(켬 free · 끔 축 번호)의 "
        + "쌍이다. 끔에서도 1이면 이 원장은 아무것도 안 말한다(#32·#40).",
      reachability_value: null as unknown,
      reachability_source: "summary/snap_delta_aux",
      /**
       * **픽스처가 정한 값인가**(#46 — 항목 5·6이 세운 표기). `true`다: 증분은 {1, 0}의
       * **1비트**이고 크기가 픽스처와 무관하게 다른 값을 가질 수 없다. 실제로 재는 것은
       * 그 비트이고, **함께 드는 `snap_axis`**(free ↔ 축 번호)가 그 비트의 뜻을 준다 —
       * 보조를 지우면 같은 손짓이 **축으로** 간다는 것이 대비의 내용이다.
       */
      reachability_value_fixture_determined: true,
      result: {} as Record<string, unknown>,
    },
    selfcheck_notes: {
      gap_zero: "`gap_to_horizon_px`가 0인 것은 **이론의 귀결이지 이 구현의 보장이 아니다**"
        + "(#5) — 수평 방향(경사 0)의 소실점은 지평선 위에 있다(이론서 6.2의 전제). 구현이 "
        + "수직 성분을 잘못 더하면 이 값이 0을 벗어난다. 그래서 임계를 건다.",
      slope_line_off_zero: "`slope_line_off_px`가 0인 것은 **이론의 판정**이다 — 경사 "
        + "소실점은 «대응 수평 소실점 ↔ 수직축 소실점» 직선 위에 있다(이론서 15.1의 일반형). "
        + "정답이 밖에 있으므로 보장이 아니고 임계를 건다. ⚠ **15.1의 문면**(«바로 위/아래»)은 "
        + "수직축이 무한원일 때(2점)의 특수해다 — 이 픽스처는 3점이라 `slope_dx_screen_px`가 "
        + "0이 아니고, 그것이 AS-L54의 실측이다.",
      f_rel_gap_zero: "`f_rel_gap`이 0인 것도 **이론의 판정**이다(#5) — 탈레스 작도가 "
        + "카메라의 f를 되돌리는지 본다. 구현이 2점 식(`|PE|`)을 3점에 그대로 쓰면 이 값이 "
        + "0.2대로 뛴다(초판이 그랬다 — AS-L55). 보장이 아니라 실측이고 임계를 건다.",
      off_delta_zero: "`snap_delta_aux[1]`(끔 팔)이 0인 것은 **되살림의 성립**이다 — "
        + "보조가 없으면 그 경로가 안 돈다. 0이 나와야 대비가 선다. 그 손짓이 **대신 어디로 "
        + "갔는지는** `snap_place_delta[1]`가 든다(#43: 경로별 카운터).",
      on_delta_gt_one: "`snap_delta_aux[0]`이 1보다 클 수 있다 — 확정 뒤 **승격 연쇄**가 "
        + "대기 획을 같은 보조 방향으로 함께 올리기 때문이다(`promoteChain`). 판정은 "
        + "«0보다 큰가»이지 정확한 수가 아니다.",
    },
    pitfall_citations: [5, 12, 17, 21, 30, 32, 35, 36, 38, 40, 41, 43, 46, 47, 49],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_value = led.summary.snap_delta_aux;
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "aux_vp.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  // **① 각도 입력** — 셋이 만들어진다
  expect(made.dirs.length).toBe(3);
  // **② 수평 보조는 지평선 위다**(이론서) — 점-선 거리 ≈ 0
  for (const g of placed.gap_to_horizon_px as number[]) expect(Math.abs(g)).toBeLessThan(0.01);
  // **③ 탈레스가 카메라의 f를 되돌린다**(이론서 6.2 — 배선 확인)
  expect(th).not.toBeNull();
  expect(th!.f_rel_gap).toBeLessThan(1e-6);
  expect(th!.measuring.every((m: unknown) => m != null)).toBe(true);
  // **④ 경사 보조**(이론서 15.1의 **일반형**) — 수평 소실점과 수직축 소실점을 잇는 직선 위
  expect(slope.line_off_up!).toBeLessThan(0.01);
  expect(slope.line_off_dn!).toBeLessThan(0.01);
  expect(slope.up_above).toBe(true);
  expect(slope.dn_below).toBe(true);
  // **반증의 실측**(AS-L54) — 이 3점 픽스처에서 «바로 위/아래»의 문면은 깨진다
  expect(slope.vertical_infinite).toBe(false);
  expect(slope.dx_up!).toBeGreaterThan(1);
  // **⑤ 스냅과 위계** — 보조 경로로 놓이고 축은 free다
  expect(snapOn).not.toBeNull();
  expect(snapOn!.delta_aux).toBeGreaterThan(0);
  expect(snapOn!.stroke_axis).toBe("free");
  expect(snapOn!.stroke_aux_id).toBe("aux1");
  expect(snapOn!.lifted).toBe(true);
  // **되살림**(#30·#40) — 보조를 지우면 같은 손짓이 축으로 간다
  expect(snapOff).not.toBeNull();
  expect(snapOff!.delta_aux).toBe(0);
  expect(snapOff!.stroke_aux_id).toBeNull();
  // 그 손짓은 **다른 경로**로 놓인다(어느 경로인지는 원장이 든다 — 여기서 이름을 안 박는다)
  expect(Object.keys(snapOff!.place_delta).length).toBeGreaterThan(0);
  // **⑦ 위계** — 같은 방향에서는 **축이 이긴다**(보조 경로가 안 늘고 축 번호가 붙는다)
  expect(tie).not.toBeNull();
  expect(tie!.same_vp_px!).toBeLessThan(0.01);      // 구성 확인: 두 소실점이 같은 자리다
  // **경쟁이 실제로 열렸다** — 안 열리면 이 팔은 위계를 안 잰 것이다(#32)
  expect(tie!.competed_delta).toBeGreaterThan(0);
  expect(tie!.won_delta).toBe(0);
  expect(tie!.place_delta.aux ?? 0).toBe(0);
  expect(tie!.stroke_aux_id).toBeNull();
  expect(typeof tie!.stroke_axis).toBe("number");
  // **⑥ 화면 밖 처리** — 얕은 각의 소실점은 화면 밖이고 그래도 값이 있다
  expect(offscreen.inside).toBe(false);
  expect(offscreen.at).not.toBeNull();
});
