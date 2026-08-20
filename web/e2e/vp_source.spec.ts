// **스냅이 쓰는 소실점과 화면에 표시된 소실점이 같은가**(2026-08-20 17차, 사람 지시).
// 산출: `stage0/out/vp_source.json`.
//
// 사용자 보고: *"축 스냅을 켜고 그으면 선들이 한 점으로 모인다. 그런데 그 점이 화면에
// 표시된 소실점(빨간 표식)이 아니다 — 그보다 위, 또는 화면 밖이다."* 상태 표시는
// 「뷰 1 · 2D 4」였다.
//
// ⚠⚠ **「뷰 1」이 이 원장의 자세를 정한다**(1차 리뷰어 [1]·[7]). 그 이름은 `viewForDrawing`이
// 붙인다: 카메라가 서 있고 **핀이 아닐 때만** `뷰 ${doc.views.length}`가 새로 생긴다
// (안 서 있으면 「확정 뷰」, 핀이면 확정 뷰 그대로다). 즉 관측 화면은 **확정됐고 핀이 아닌**
// 상태였고, 그것이 두 출처가 갈리는 바로 그 조건이다 — **회전이 필요 없다.** 그래서 자세
// 목록에 «확정 뒤 비핀 · 회전 없음» 행(②)이 있고 그 행이 관측의 서명이다.
//
// 재현(수리 전): 표시는 `viewOverlayCtx().vps`(지금 시점의 투영), 스냅은 `cam.vps()`
// (확정 시점의 값)를 읽었다. **핀일 때만 두 값이 같다.**
//
// 착수 시 `PITFALLS.md`를 읽었다 — 걸리는 번호는 `progress.md`의 17차 착수 표가 든다.
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { AXIS_TOL } from "../src/s3d/axis.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene } from "./fixture.js";

declare global { interface Window { S2S: any; __SC: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/**
 * **한 자세의 한 축.** 표시된 소실점을 **정확히 겨냥해** 그은 현을 앱의 2D 방향 스냅
 * (`S2S.vpDir` → `vpDirSnap`)에 넣고, 그 스냅이 고른 것이 **표시된 그 점인지** 잰다.
 *
 * ⚠ 각도 판정을 하네스가 다시 쓰지 않는다(#52) — 앱의 승자 하나를 읽는다.
 * `aim_deg`는 **스냅이 보는 단위**다(1차 리뷰어 [2]): 시작점에서 «표시된 소실점 방향»과
 * «스냅이 고른 방향» 사이의 각. px 격차는 소실점이 멀수록 부풀어 스냅 임계와 단조가 아니다.
 */
const ARM = `((axis) => {
  const S = window.S2S;
  const o = S.draftOverlay();
  const disp = o ? o.vps[axis] : S.vpsOnScreen()[axis];   // 표시가 읽는 값(스위치 무관)
  const src = S.vpsForSnap()[axis];                       // 스냅이 읽는 값(스위치가 가른다)
  const el = document.getElementById("ink");
  const W = el.clientWidth, H = el.clientHeight;
  const a = [W * 0.45, H * 0.55];
  const degBetween = (p, q) => {
    if (!p || !q) return null;
    const u = [p[0]-a[0], p[1]-a[1]], v = [q[0]-a[0], q[1]-a[1]];
    const lu = Math.hypot(u[0],u[1]), lv = Math.hypot(v[0],v[1]);
    if (lu < 1e-9 || lv < 1e-9) return null;
    const c = Math.min(1, Math.max(-1, (u[0]*v[0]+u[1]*v[1])/(lu*lv)));
    const d = Math.acos(c) * 180 / Math.PI;
    return Math.min(d, 180 - d);          // 축은 부호가 없다
  };
  if (!disp) return { axis, disp: null, skipped: "표시 소실점이 무한원·미정" };
  const L = Math.hypot(disp[0] - a[0], disp[1] - a[1]) || 1;
  const t = Math.min(0.35, 160 / L);
  const b = [a[0] + (disp[0] - a[0]) * t, a[1] + (disp[1] - a[1]) * t];
  const snap = S.vpDir(a, b);
  return {
    axis, disp, snap_src: src, chord: [a, b],
    engaged: !!snap,
    picked_axis: snap ? snap.axis : null,
    /** 겨냥한 축을 골랐는가 — **측정**이다(축 경쟁의 결과이지 출처의 귀결이 아니다). */
    picked_expected_axis: snap ? snap.axis === axis : null,
    picked_vp: snap ? snap.vp : null,
    /** 스냅이 고른 소실점이 표시된 그 점에서 벗어난 px. 안 걸리면 null. */
    gap_px: snap && snap.vp
      ? Math.hypot(snap.vp[0] - disp[0], snap.vp[1] - disp[1]) : null,
    /** 표시와 스냅의 **출처** 격차(px) — 크기의 인상이지 스냅이 보는 양은 아니다. */
    source_gap_px: src && disp ? Math.hypot(src[0]-disp[0], src[1]-disp[1]) : null,
    /** **스냅이 보는 단위**(도) — 시작점에서 본 «표시 방향 ↔ 출처 방향» 사이 각. */
    source_aim_deg: degBetween(disp, src),
    /** 두 진입점이 같은 값을 내는가 — 스위치가 켜져 있으면 참이어야 한다(#54 잔여). */
    entries_agree: (() => {
      const x = S.vpsOnScreen()[axis], y = S.vpsForSnap()[axis];
      return (!x && !y) || (!!x && !!y && x[0] === y[0] && x[1] === y[1]);
    })(),
  };
})`;

const RUN = (dpr: number) => {
test(`표시된 소실점으로 스냅되는가 — 자세 여섯 (dpr ${dpr})`, async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);

  const poses: any[] = [];
  const at = async (label: string, note: string) => {
    const row = await page.evaluate(([armSrc]) => {
      const S = window.S2S;
      const arm = eval(armSrc as string);
      const o = S.draftOverlay();
      const read = () => [0, 1, 2].map(i => arm(i));
      const fixed = read();
      S.setVpSource(false);                 // **되살림**(#30) — 스냅 쪽만 옛 배선으로
      const legacy = read();
      S.setVpSource(true);
      // **지시 c·d를 실측으로 답한다** — 소실점이 지평선 위에 있는가(점-선 거리, px #49).
      const hl = o ? o.horizonLine : null;
      const toLine = (q: any) => {
        if (!q || !hl) return null;
        const ex = hl.b[0]-hl.a[0], ey = hl.b[1]-hl.a[1], L = Math.hypot(ex, ey);
        if (L < 1e-12) return null;
        return Math.abs((q[0]-hl.a[0])*ey - (q[1]-hl.a[1])*ex) / L;
      };
      const marks = (S.axisMarks() || []).map((m: any) => ({
        axis: m.axis, kind: m.kind, at: m.at.map((v: number) => Math.round(v)),
      }));
      const cur = S.views().find((v: any) => v.id === S.currentView());
      const el2 = document.getElementById("ink") as HTMLCanvasElement;
      return {
        pinned: S.camPose().pinned, view_state: S.viewState(), standing: S.standing(),
        /** **dpr가 실제로 걸렸는가**(2차 리뷰어 [7]) — 백킹 스토어가 css 크기의 배수여야 한다. */
        dpr: window.devicePixelRatio,
        canvas_css: [el2.clientWidth, el2.clientHeight],
        canvas_backing: [el2.width, el2.height],
        backing_ratio: el2.clientWidth ? el2.width / el2.clientWidth : null,
        /** **음성 대조**(2차 리뷰어 [1]) — 핀이면 현재 뷰가 「확정 뷰」다. 「뷰 N」이 아니다. */
        current_view_name: cur ? cur.name : null,
        current_is_confirm: cur ? cur.isConfirm : null,
        disp_vps: o ? o.vps : null, cam_vps: S.camSnapshot().vps,
        lifted: S.doc().strokes.filter((x: any) => x.seg3d).length,
        strokes: S.doc().strokes.length,
        /** 지시 c — 지평선(수평 소실점 둘을 잇는 선)과 각 축 소실점의 점-선 거리(px). */
        horizon_line: hl, horizon_scalar_y: o ? o.horizonY : null,
        axis_horizon_dist_px: o ? [0,1,2].map(i => toLine(o.vps[i])) : null,
        /** 지시 d — 표식의 종류와 자리. `edge`가 화면 밖 소실점의 가장자리 표식이다. */
        marks,
        /** 지시 d — **표식의 화면 자리**가 지평선에서 떨어진 px(관측이 물은 그 양이다). */
        mark_horizon_dist_px: marks.map((m: any) => toLine(m.at)),
        /** 지시 e — 토글(`on`)과 표시(`visible`·`drawn`)는 **다른 양**이다. */
        view_cube: S.viewCubeState(),
        fixed, legacy,
      };
    }, [ARM]);
    poses.push({ label, note, ...row });
    return row;
  };

  // ---- ⓪ **미확정** — 카메라가 안 섰다. 두 출처가 정의상 같은 자리다.
  //      유한 소실점 하나를 든 NONE 상태는 하네스로만 만든다(슬롯 하나 = 차수 0).
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => {
    window.S2S.setAxisLines([
      { axis: 0, a: [-400, 337], b: [640, 200] }, { axis: 0, a: [-400, 337], b: [640, 500] },
    ]);
  });
  await at("⓪ 미확정(소실점 하나 · 차수 0)",
           "카메라가 안 서면 시점 문맥이 없다 — 두 출처가 같은 자리다(구성의 귀결).");

  // ---- 확정된 3점 픽스처. `setupScene`은 **핀을 안 건다** — 카메라는 섰는데 무대는
  //      three의 기본 자세에 남는다. 그것이 ①이다(확정 카메라와 무관한 자유 자세).
  await setupScene(page);
  const box = (await page.locator("#ink").boundingBox())!;
  await at("① 확정됐으나 비핀 · 확정 카메라와 무관한 자유 자세",
           "「뷰 N」이 붙는 상태이고, 자세가 확정 카메라와 다르므로 두 출처가 갈린다. "
           + "⚠ 이 자세를 **앱 조작만으로 어떻게 도달하는지는 특정하지 못했다** — "
           + "`applyDoc2`의 복원 갈래(`stage.setPose(v.pose)`)와 `restoreSnap`(비핀이면 "
           + "그대로 둔다)이 후보다. 여기서는 픽스처가 만든다.");


  // ---- **관측의 서명을 자세 ① 안에서 만든다**(2차 리뷰어 [2]) — 「뷰 N」이 붙는 것과
  //      `lifted = 0`이 **한 상태**에서 함께 나야 «다섯이 한 자세에서»가 성립한다.
  const before = await page.evaluate(() => ({
    views: window.S2S.views().length,
    lifted: window.S2S.doc().strokes.filter((x: any) => x.seg3d).length,
  }));
  const sa: [number, number] = [0.30 * box.width, 0.55 * box.height];
  const sb: [number, number] = [0.58 * box.width, 0.50 * box.height];
  await page.mouse.move(box.x + sa[0], box.y + sa[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(box.x + sa[0] + (sb[0] - sa[0]) * i / 10,
                          box.y + sa[1] + (sb[1] - sa[1]) * i / 10);
  await page.mouse.up();
  await page.waitForTimeout(120);
  const signature = await page.evaluate(([bv]) => {
    const S = window.S2S;
    const cur = S.views().find((v: any) => v.id === S.currentView());
    const last = S.doc().strokes[S.doc().strokes.length - 1];
    return {
      at_pose: "① 확정됐으나 비핀 · 확정 카메라와 무관한 자유 자세",
      views_before: (bv as any).views, views_after: S.views().length,
      current_view_name: cur ? cur.name : null,
      current_is_confirm: cur ? cur.isConfirm : null,
      pending_in_current: cur ? cur.pending : null,
      stroke_axis: last ? last.axis : null,
      stroke_has_3d: last ? !!last.seg3d : null,
      lifted: S.doc().strokes.filter((x: any) => x.seg3d).length,
      view_cube: S.viewCubeState(),
    };
  }, [before]);

  // ② 핀 — 앱의 확정 경로(`standCamera` → `stage.pinTo`)가 만든다(#17)
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(200);
  await at("② 확정 직후(핀)", "자세가 항등이라 두 출처가 같다.");

  // ③ **핀 해제 · 자세 보존** — 음성 대조다: 비핀이라고 다 갈리는 것이 아니다.
  await page.evaluate(() => { window.S2S.stage.unpin(null); window.S2S.refresh(); });
  await page.waitForTimeout(150);
  await at("③ 핀 해제 · 자세 보존",
           "**음성 대조** — 비핀이지만 자세가 확정 카메라 그대로라 두 출처가 같다. "
           + "갈리는 조건은 «비핀»이 아니라 «자세가 확정 카메라와 다름»이다.");

  // ④·⑤ 돌린 자세
  await page.evaluate(r => window.S2S.cubeSpin(r, 0), 0.35);
  await page.waitForTimeout(150);
  await at("④ 요 +0.35rad", "");
  await page.evaluate(() => {
    const S = window.S2S;
    const c = S.stage.viewport.camera, ctl = S.stage.viewport.controls;
    c.position.set(1.2, 5.2, 3.0); ctl.target.set(0.6, 0.2, -3.4); ctl.update();
    c.updateMatrixWorld(true); S.refresh();
  });
  await page.waitForTimeout(220);
  await at("⑤ 윗면(피치)", "");

  // ---------------------------------------------------------------- 집계
  const finite = (rows: any[]) => rows.filter(r => r.disp);
  const rotated = poses.filter(p => p.standing && !p.pinned);   // ②③④ — 두 출처가 갈릴 수 있는 자세
  const fixedAll = poses.flatMap(p => finite(p.fixed));
  const fixedRot = rotated.flatMap(p => finite(p.fixed));
  const legacyRot = rotated.flatMap(p => finite(p.legacy));
  const notEngaged = (rows: any[]) => rows.filter(r => !r.engaged).length;
  const wrongAxis = (rows: any[]) => rows.filter(r => r.engaged && r.picked_expected_axis === false).length;
  const wrongPoint = (rows: any[]) => rows.filter(r => r.engaged && (r.gap_px ?? 1) > 1e-6).length;
  const nums = (xs: any[]) => xs.filter(x => typeof x === "number");
  const legacyDeg = nums(legacyRot.map((r: any) => r.source_aim_deg));
  const legacyPx = nums(legacyRot.map((r: any) => r.source_gap_px));
  const entriesDisagree = fixedAll.filter((r: any) => r.entries_agree === false).length;

  // **관측 대조** — 보고된 증상 다섯이 어느 자세에서 함께 나는가(①이 그 자리다).
  const p1 = poses[1];
  const observationMatch = {
    pose: p1.label,
    standing_not_pinned: p1.standing && !p1.pinned,     // 「뷰 N」이 붙는 조건
    lifted: p1.lifted,                                   // 3D 없음 → 궤도·큐브가 닫힌다
    cube_on_but_hidden: p1.view_cube.on && !p1.view_cube.drawn,
    axis2_mark: (p1.marks.find((m: any) => m.axis === 2) ?? null),
    axis2_off_horizon_px: p1.axis_horizon_dist_px ? p1.axis_horizon_dist_px[2] : null,
    source_aim_deg: p1.legacy.filter((r: any) => r.disp).map((r: any) => r.source_aim_deg),
    what_is_not_shown: "그 사용자가 **어떤 조작으로** 이 자세에 왔는지는 특정하지 못했다 — "
      + "픽스처가 만든 상태다. 후보는 `applyDoc2`의 복원 갈래와 `restoreSnap`(비핀 유지)이다. "
      + "⚠ 그리고 `lifted = 0`도 이 픽스처의 설정이지 이 자세의 귀결이 아니다"
      + "(같은 12획인 자세 ②~⑤는 `lifted = 12`다) — 자유도 하나가 증상 셋을 낳는 것은 "
      + "`answers.b`가 적는다(2차 리뷰어 [3]).",
    view_name_counterexample: "⚠⚠ **「뷰 N」은 «지금 핀이 아니다»의 증거가 아니다**"
      + "(2차 리뷰어 [1]의 반례를 원장이 든다): 자세 ②는 **핀인데** `current_view_name`이 "
      + "「뷰 1」이다 — 이름은 **만들어질 때** 정해지고 `doc.currentView`는 확정으로 안 돌아간다. "
      + "「뷰 1」이 증명하는 것은 **그 뷰가 만들어진 시점**과 **그 뷰에 배정된 획이 그어진 "
      + "시점**이 «서 있고 핀이 아님»이라는 것이다(`viewForDrawing`이 자세까지 대조한다). "
      + "관측의 「2D 4」가 그 뷰의 대기 획 수이므로 **그 넷은 그 상태에서 그어졌다** — "
      + "그리고 사용자가 어긋남을 본 것도 «그을 때»다. **화면을 찍은 그 순간이 비핀이었는지는 "
      + "증명되지 않는다.**",
  };

  const led = {
    what: "축 스냅이 겨냥하는 소실점과 화면에 표시된 소실점이 같은가.",
    how: {
      arm: "자세마다 축 셋 각각에 대해 **표시된 소실점을 정확히 겨냥한 현**을 만들어 "
        + "앱의 2D 방향 스냅(`S2S.vpDir` → `vpDirSnap`)에 넣는다. 값 셋을 갈라 낸다: "
        + "`engaged`(걸렸는가) · `picked_expected_axis`(겨냥한 축을 골랐는가) · "
        + "`gap_px`(고른 소실점이 표시된 점에서 벗어난 px).",
      legacy: "같은 자세에서 `S2S.setVpSource(false)`로 **수리 전 배선**(스냅만 확정 시점의 "
        + "`cam.vps()`를 읽는다)을 되살려 다시 잰다(#30). 스위치는 **스냅 쪽만** 움직인다 — "
        + "표시까지 옮기면 되살림이 자기 자신을 잰다(#52).",
      unit: "px가 아니라 **도**(`source_aim_deg`)가 스냅이 보는 단위다(1차 리뷰어 [2] · #49): "
        + "`vpDirSnap`의 판정은 `AXIS_TOL.vp_dist_ratio`(수직거리 ÷ 길이)이고, 같은 각이라도 "
        + "소실점이 멀면 px 격차가 부푼다. px는 인상으로만 읽는다.",
      poses: "⓪ 미확정 · ① **비핀 · 자유 자세**(관측의 서명) · ② 핀 · ③ 핀 해제·자세 보존"
        + "(음성 대조) · ④ 요 · ⑤ 피치. "
        + "두 출처가 갈릴 수 있는 것은 **서 있고 핀이 아닌** 자세뿐이라 집계 분모를 그 넷으로 "
        + "따로 낸다(#11 — 핀·미확정 행은 정의상 0이라 분모에 넣으면 판별력을 부풀린다). "
        + "⚠ 그 넷 중 ③은 **비핀인데도 0**이다 — 조건은 «비핀»이 아니라 «자세가 확정 "
        + "카메라와 다름»이고, 그 사실 자체가 이 원장의 관찰 하나다.",
      signature: "관측 상태 표시 「뷰 1 · 2D 4」를 앱 경로로 만든다 — 비핀 상태에서 한 획을 "
        + "그으면 `viewForDrawing`이 「뷰 N」을 새로 만들고 그 획이 2D로 남는가.",
      observation: "보고된 증상 다섯(표시≠스냅 · 3D 없음 · 뷰 안 돌아감 · 「뷰 1」 · "
        + "큐브 켬인데 안 보임)이 **한 자세에서 함께 나는가**를 `observation_match`가 든다.",
      c_d_e: "지시 c·d·e도 **실측으로** 답한다: `axis_horizon_dist_px`(각 축 소실점이 "
        + "지평선에서 떨어진 px — 수평 둘은 0이 **보장**이고 수직축이 얼마나 떨어지는지가 "
        + "답이다) · `marks`(표식의 종류와 자리 — 「5.4W」 삼각형이 어느 축의 무엇인지) · "
        + "`view_cube`(토글과 표시가 다른 양임을).",
    },
    what_this_does_not_say: [
      "**어느 값이 옳은가를 참값으로 대조하지 않았다.** 이 원장이 재는 것은 «표시와 스냅이 "
      + "같은 점을 가리키는가»뿐이다. «지금 시점의 투영이 옳다»는 기하의 논거(3D 축 스냅이 "
      + "이미 그 시점의 축 방향을 쓴다)이고 **측정이 아니다**.",
      "**칠해진 픽셀은 안 잰다.** 「표시」는 그리는 쪽과 **같은 함수**(`viewOverlayCtx`·"
      + "`overlayAxisMarks`)를 읽어 확인한다 — canvas 호출까지의 배선을 재는 원장은 "
      + "**이 저장소 어디에도 없다**(`view_axes.json`의 같은 문장이 위임의 끝이다, "
      + "1차 리뷰어 [6]). 판정은 그만큼 «두 소비자가 같은 함수를 부른다»에 얹혀 있다.",
      "겨냥 오차 동작점은 **«정확히 0» 하나**다(#12) — 현이 표시 소실점을 정확히 겨냥한다. "
      + "손 오차가 있는 겨냥에서 어느 쪽이 먼저 임계를 벗어나는지는 안 쟀다.",
      "픽스처 하나(3점 합성 상자)다. `setupScene`의 참 소실점 카메라이고 실획이 아니다.",
      "`fixed.gap_px`가 0인 것(= `fixed_wrong_point`)은 **출처가 같다**는 데서 오는 "
      + "**설계 보장**이다(#5) — 값을 안 읽는다. 같은 팔에서 **측정인 것은 "
      + "`fixed_not_engaged`와 `fixed_wrong_axis`**다(축 경쟁의 결과라 출처의 귀결이 아니다). "
      + "검사(expect)는 그 둘에만 건다.",
      "**3D가 왜 안 섰는가는 이 원장이 안 잰다.** 궤도·뷰 큐브가 안 열리는 것은 "
      + "`lifted(doc).length > 0` 하나가 가르는 자리다(설명이지 측정이 아니다). 그 앞 단계 — "
      + "«획이 왜 대기로 남았나» — 의 실측은 `signature`가 한 획으로만 든다.",
      "dpr는 이 파일이 **1과 2 둘**을 돈다(#21·D-C3). 그러나 그 둘이 같은 결론을 내는 것은 "
      + "**출처 규칙이 dpr과 무관하기 때문**이라 새 정보가 아니다 — 배선이 dpr에서 갈리지 "
      + "않음을 확인하는 것까지다.",
    ],
    selfcheck_notes: {
      fixed_zero: "`fixed.gap_px`·`fixed.source_gap_px`·`source_aim_deg`가 0인 것은 "
        + "**보장**이다(#5) — 표시와 스냅이 `vpsOnScreen` 하나를 지난다. 되살림 팔"
        + "(`legacy`)이 **같은 자리에서 0이 아닌 값**을 내는 것이 그 배선이 실재함의 "
        + "증거다(#30·#52).",
      pinned_zero: "핀·미확정 자세는 `legacy`도 0이다 — 자세가 항등이면 두 출처가 정의상 "
        + "같은 자리다. 그래서 집계 분모(`*_rotated`)에서 뺀다.",
      horizon_dist_zero: "`axis_horizon_dist_px[0]`·`[1]`이 0(또는 1e-13대)인 것은 "
        + "**보장**이다(#5) — 지평선을 그 두 소실점으로 만든다(`horizonThrough`). "
        + "**값이 있는 자리는 [2]**(수직축이 지평선에서 떨어진 px)이고 그것이 지시 c·d의 답이다.",
      observation_lifted_zero: "`observation_match.lifted = 0`은 **재현하려는 증상 자체**다 "
        + "(3D가 없다) — 집계가 안 돈 것이 아니다. 같은 자세의 `view_cube.drawn`이 거짓인 "
        + "것과 짝이다.",
      backing_ratio_one: "`backing_ratio`가 dpr 1에서 정확히 1인 것은 **정상**이다 — "
        + "백킹 스토어가 css 크기의 dpr배라는 규약(`canvasFrame`)의 값이다. 이 필드의 "
        + "쓸모는 **dpr 2 원장에서 2가 되는 것**이고, 그것이 «두 번째 실행에 "
        + "deviceScaleFactor가 실제로 걸렸다»의 증거다(2차 리뷰어 [7]).",
      arms_runs_equal: "`arms.fixed`와 `arms.legacy`의 `runs`가 같은 것은 **구성의 귀결**이다 "
        + "— 두 팔이 **같은 자세·같은 축**을 돈다(그래야 되살림이 같은 자리를 잰다). "
        + "분포가 아니라 **실행 수 선언**이고, 비용 원장(`test_cost.json`의 "
        + "`declared_scenarios`)이 그 수를 읽는다(#33).",
      pose3_near_zero: "자세 ③(핀 해제·자세 보존)의 `legacy` 값이 1e-13대인 것은 "
        + "**음성 대조가 성립한 것**이다 — 비핀이지만 자세가 확정 카메라 그대로라 두 출처가 "
        + "같은 점을 낸다(부동소수 잔차만 남는다).",
      entries_agree_is_measurement: "`entries_agree`는 **보장이 아니라 배선 측정**이다"
        + "(2차 리뷰어 [4]): 진입점이 둘(`vpsOnScreen`·`vpsForSnap`)이라 누군가 한쪽만 "
        + "고치면 갈린다 — 코드 형태가 강제하지 않는다. 그래서 게이트에 **등록하고** "
        + "검사도 건다. 스위치가 꺼진 `legacy` 쪽에서는 이 필드를 안 읽는다(그때는 "
        + "갈리는 것이 의도다).",
    },
    tolerances: { vp_dist_ratio: AXIS_TOL.vp_dist_ratio },
    answers: {
      c: "표시된 **수평** 소실점은 지평선 위에 있다 — `poses[*].axis_horizon_dist_px[0..1]`이 "
        + "0이고 그것은 **보장**이다(#5: 지평선을 그 두 점으로 만든다). **수직축(축 2)은 "
        + "지평선 위가 아니다** — 같은 배열의 [2]가 그 거리다. 갈린 것은 표시 지평선이 "
        + "아니라 `cam.rules.horizon`(확정 시점 값)이고, 그것을 읽는 자리는 핀으로 막혀 있다.",
      d: "「5.4W」 파란 삼각형 = **축 2(수직축)의 화면 밖 소실점 가장자리 표식**이고 "
        + "**위치**를 낸다(`marks`의 `axis: 2 · kind: \"edge\"`와 그 `at`). 색은 "
        + "`AXIS_COLOR[2] = #2471a3`이고 「W」 라벨은 **주 소실점 가장자리 갈래에만** 있다 "
        + "(보조 소실점 표식·탈레스 `E(밖)`는 다른 문자열이다 — 그 대조는 구현 독해다). "
        + "**지평선 위가 아닌 것이 정상이다.** ⚠ 관측이 물은 것은 «표식의 화면 자리»이므로 "
        + "그 양은 `mark_horizon_dist_px`다(2차 리뷰어 [6]) — `axis_horizon_dist_px`(소실점의 "
        + "자리)와 두 자릿수 다르다. 그리고 그 값이 말하는 것은 더 넓다: **화면 밖 소실점의 "
        + "가장자리 표식은 축을 가리지 않고 지평선에서 떨어진다** — 표식이 화면 가장자리로 "
        + "죄이므로(`VP_EDGE.padPx`) **수평 소실점의 표식도** 지평선 위에 안 온다"
        + "(`mark_horizon_dist_px[0]`·`[1]`이 0이 아닌 것이 그것이다). 즉 «지평선 위가 "
        + "아니다»는 수직축이라서가 아니라 **화면 밖이라서**다.",
      e: "「뷰 큐브 켬」은 토글(`view_cube.on`)이고 그려지는 조건은 "
        + "`view_cube.visible = cam.standing() && lifted > 0`이다. `poses[0]`(미확정)에서 "
        + "`on: true`인데 `visible`·`drawn`이 거짓인 것이 그 실측이다 — **결함이 아니라 "
        + "두 양이 다른 것**이고, 3D가 없는 것과 같은 뿌리다.",
      b: "3D 부재와의 인과 — 궤도(`gestures.begin`)와 뷰 큐브는 `lifted > 0` 하나가 "
        + "가른다(**설명이지 측정이 아니다**). ⚠ 그래서 보고된 증상 셋(3D 없음·뷰 안 돌아감·"
        + "큐브 안 보임)은 **독립 관찰이 아니다** — `lifted = 0` 자유도 **하나**가 셋을 낳는다"
        + "(2차 리뷰어 [3]). `observation_match`의 다섯도 그 뜻으로 읽는다: 독립 다섯이 "
        + "아니라 «한 자세에서 함께 관측된다»이다. **반대 방향의 인과**는 되살림 팔이 든다: "
        + "표시와 다른 점을 겨냥한 스냅은 `legacy_not_engaged_rotated`만큼 **아예 안 걸리고** "
        + "그 획은 대기로 남는다. ⚠ 나머지 `legacy_wrong_point_rotated`는 반대다 — "
        + "**걸리되 다른 점**이고 그것이 조용히 틀린 배치다(A-3이 가장 경계하는 것). "
        + "«3D가 왜 안 섰나»의 전체 인과는 이 원장이 안 잰다.",
    },
    observation_match: observationMatch,
    poses,
    signature,
    summary: {
      view_states: poses.map(p => p.view_state),
      pinned: poses.map(p => p.pinned),
      standing: poses.map(p => p.standing),
      /** **측정** — 표시된 소실점을 정확히 겨냥했는데 안 걸린 횟수 / 시도. */
      fixed_not_engaged: `${notEngaged(fixedAll)}/${fixedAll.length}`,
      fixed_not_engaged_rotated: `${notEngaged(fixedRot)}/${fixedRot.length}`,
      /** **측정** — 걸렸는데 **다른 축**을 골랐다(축 경쟁의 결과). */
      fixed_wrong_axis: `${wrongAxis(fixedAll)}/${fixedAll.length}`,
      fixed_wrong_axis_rotated: `${wrongAxis(fixedRot)}/${fixedRot.length}`,
      /** **보장**(#5) — 걸렸는데 다른 점. 출처가 하나라 0이다. 값으로 안 읽는다. */
      fixed_wrong_point: `${wrongPoint(fixedAll)}/${fixedAll.length}`,
      /** 되살림 — **갈라 센다**(1차 리뷰어 [3]): 앞은 «대기로 남음», 뒤는 «조용히 틀린 배치». */
      legacy_not_engaged_rotated: `${notEngaged(legacyRot)}/${legacyRot.length}`,
      legacy_wrong_point_rotated: `${wrongPoint(legacyRot)}/${legacyRot.length}`,
      legacy_miss_rotated:
        `${notEngaged(legacyRot) + wrongPoint(legacyRot)}/${legacyRot.length}`,
      /** 되살림에서 두 출처가 벌어진 **각**(도) — 스냅이 보는 단위. 핀·미확정 제외. */
      legacy_source_aim_deg_rotated: legacyDeg.map(x => Math.round(x * 10) / 10),
      /** ⚠ **걸리지 않은 행을 포함한다** — 그 행의 각은 «스냅이 못 본 각»이다(2차 리뷰어 [12]). */
      legacy_source_aim_deg_max_all: legacyDeg.length ? Math.round(Math.max(...legacyDeg) * 10) / 10 : null,
      /** 걸린 행만의 최댓값 — «걸렸는데 다른 점»의 크기다. */
      legacy_source_aim_deg_max_engaged: (() => {
        const d = nums(legacyRot.filter((r: any) => r.engaged).map((r: any) => r.source_aim_deg));
        return d.length ? Math.round(Math.max(...d) * 10) / 10 : null;
      })(),
      /** 같은 것의 px — **인상용**이다(#49: 스냅이 보는 양이 아니다). */
      legacy_source_gap_px_rotated: legacyPx.map(x => Math.round(x * 10) / 10),
      entries_disagree: entriesDisagree,
    },
    gate: {
      registered: "표시와 스냅이 같은 소실점을 가리킨다 — 판정은 **개수**가, 그리고 "
        + "**같은 분모**(비핀 자세)로 든다: `summary.fixed_not_engaged_rotated`와 "
        + "`fixed_wrong_axis_rotated`가 0/n이고 `summary.legacy_miss_rotated`가 **0이 아닌 "
        + "것**이 함께 든다(#30·#11). 셋째로 `summary.entries_disagree`가 0이다"
        + "(진입점 둘의 배선 — 보장이 아니라 측정이다, `selfcheck_notes`).",
      /** 등록 지표와 **같은 양·같은 분모**로 적는다(1차 리뷰어 [2] · #40 ①·③). */
      reachability: "되살림 스위치(`S2S.setVpSource(false)`)로 수리 전 배선을 세우면 "
        + "같은 자세·같은 분모에서 `legacy_miss_rotated`가 0이 아니다. 크기의 값은 "
        + "`legacy_source_aim_deg_rotated`(도 — 스냅이 보는 단위)가 든다.",
      reachability_source: "summary/legacy_miss_rotated",
      reachability_value: null as unknown,
      reachability_magnitude_source: "summary/legacy_source_aim_deg_rotated",
      reachability_magnitude_value: null as unknown,
    },
    /**
     * **비용 원장이 이 팔을 센다**(#33 · 9차 지시 c — `testCost.mjs`가 `arms`·`runs`를 읽는다).
     * 팔 둘(수리 후 · 되살림) × 자세 여섯 × 축 셋이 한 dpr의 실행 수다.
     */
    arms: {
      fixed: { headline: { runs: poses.length * 3 } },
      legacy: { headline: { runs: poses.length * 3 } },
    },
    runs: poses.length * 3 * 2,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  (led.gate as any).reachability_value = led.summary.legacy_miss_rotated;
  (led.gate as any).reachability_magnitude_value = led.summary.legacy_source_aim_deg_rotated;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, dpr === 1 ? "vp_source.json" : "vp_source_dpr2.json"),
                JSON.stringify(led, null, 1));

  // **수리 후 — 겨냥한 소실점에, 겨냥한 축으로 걸린다**(측정인 둘에만 건다, #5)
  expect(fixedAll.length).toBeGreaterThan(0);
  expect(notEngaged(fixedAll)).toBe(0);
  expect(wrongAxis(fixedAll)).toBe(0);
  // **두 진입점이 같은 값을 낸다**(스위치가 켜진 동안 — #54의 잔여 위험)
  expect(entriesDisagree).toBe(0);
  // **되살림이 실제로 잡는다**(#30) — 안 잡으면 이 팔은 눈뜬 것이 아니다
  expect(legacyRot.length).toBeGreaterThan(0);
  expect(notEngaged(legacyRot) + wrongPoint(legacyRot)).toBeGreaterThan(0);
  // **어긋남의 크기가 스냅 임계를 넘는다** — 도달 가능성(#40)
  expect(led.summary.legacy_source_aim_deg_max_all).toBeGreaterThan(1);
  // **관측의 서명** — 비핀에서 그으면 「뷰 N」이 생긴다(「뷰 1 · 2D 4」의 「뷰 1」이 그것이다)
  expect(signature.current_is_confirm).toBe(false);
  expect(signature.current_view_name).toMatch(/^뷰 \d+$/);
  // **관측의 다섯 증상이 한 자세에서 함께 난다**(①) — 「뷰 N」 조건 · 3D 없음 · 큐브 숨김
  expect(observationMatch.standing_not_pinned).toBe(true);
  expect(observationMatch.lifted).toBe(0);
  expect(observationMatch.cube_on_but_hidden).toBe(true);
  // **수직축 소실점은 지평선 위가 아니다**(지시 d — 정상이다)
  expect(observationMatch.axis2_off_horizon_px).toBeGreaterThan(1);
});
};

test.describe("dpr 1", () => { test.use({ deviceScaleFactor: 1 }); RUN(1); });
test.describe("dpr 2", () => { test.use({ deviceScaleFactor: 2 }); RUN(2); });
