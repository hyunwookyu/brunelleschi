// **호버에서 본 후보가 펜을 대는 순간 잠긴다**(2026-08-19 15차 항목 4 · D-L103).
// 산출: `stage0/out/hover_lock.json`.
//
// 사용자 보고 4: *"오스냅이 호버부터 걸려야 한다. 애플펜슬은 호버가 된다."*
// 지시 4-b: *"펜을 대면 그 시점의 후보가 확정된다. 호버에서 본 것과 댄 뒤가 같아야 한다."*
//
// 재현(수리 전 — 이 파일의 `off` 팔이 그것을 되살린다): 놓인 획의 끝점을 호버하면
// `vertex` 표식이 뜨는데, 펜이 **12px 빗나가 착지**하면 시작점이 **안 붙는다**
// (`snapStart` null · `seg3d` 없음). 옛 경로가 착지점으로 스냅을 **다시 물었고**
// 조리개(8px) 밖이었기 때문이다. 스타일러스는 대는 순간 그리기가 시작되므로
// **댄 뒤에는 조준할 수 없다** — 조준은 호버에서 끝나 있어야 한다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호(전문은 `progress.md`의 착수 표):
//   #12 착지 어긋남 0·6·12px + 낡은 호버 — 동작점을 하나 안 고른다
//   #17 잠금 반경은 `PICK_TOL.radius_ratio`(새 임계 없음) · 잠근 후보를 세 경로가 다 쓴다
//   #21 dpr 1뿐이다 · #30 되살림은 `setHoverLock(false)` · #35 터치는 `no_hover`가 센다
//   #43 `locked3d + locked2d + no_hover + stale = downs` · #46 판별값은 옛 경로가 잃은 스냅 수
//   #49 잠금 조건의 단위(착지 어긋남 px)는 조리개(8px)와 **다른 양**이다
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { PICK_TOL } from "../src/ui/pick.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene } from "./fixture.js";

declare global { interface Window { S2S: any; __SC: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/**
 * **애플펜슬의 호버와 착지를 합성한다** — `pointerType: "pen"`이고 떠 있는 동안은
 * `buttons: 0`·`pressure: 0`이다(그 둘이 호버와 그리기를 가른다).
 */
async function pen(page: any, type: string, x: number, y: number, hovering = false) {
  await page.evaluate((e: any) => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(e.type, {
      pointerId: 30, pointerType: "pen", isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + e.x, clientY: r.top + e.y,
      buttons: e.hovering || e.type === "pointerup" ? 0 : 1,
      pressure: e.hovering || e.type === "pointerup" ? 0 : 0.5,
    }));
  }, { type, x, y, hovering });
}

/** 호버 → 착지 → 짧게 긋기 → 뗀다. 호버에서 본 것과 놓인 획의 시작점을 나란히 낸다. */
async function run(page: any, label: string, hoverAt: number[], downAt: number[]) {
  await pen(page, "pointermove", hoverAt[0], hoverAt[1], true);
  await page.waitForTimeout(40);
  const hover = await page.evaluate(() => {
    const S = window.S2S;
    const h = S.hoverSnap(), h2 = S.hover2d();
    const r = (v: number) => Math.round(v * 10) / 10;
    return h ? { layer: "3d", kind: h.kind, at: h.screen.map(r), ofId: h.ofId ?? null }
         : h2 ? { layer: "2d", kind: h2.kind, at: h2.at.map(r), ofId: h2.ofId ?? null }
              : null;
  });
  const before = await page.evaluate(() => window.S2S.doc().strokes.length);
  await pen(page, "pointerdown", downAt[0], downAt[1]);
  for (let i = 1; i <= 5; i++) await pen(page, "pointermove", downAt[0] + i * 22, downAt[1] + i * 7);
  await pen(page, "pointerup", downAt[0] + 110, downAt[1] + 35);
  await page.waitForTimeout(60);
  const after = await page.evaluate((n: number) => {
    const S = window.S2S, sts = S.doc().strokes, s = sts[sts.length - 1];
    return { added: sts.length > n,
             start_kind: s.snapStart ? s.snapStart.kind : (s.snap2dStart ? s.snap2dStart.kind : null),
             start_layer: s.snapStart ? "3d" : (s.snap2dStart ? "2d" : null),
             lifted: !!s.seg3d };
  }, before);
  return { label, land_gap_px: Math.round(Math.hypot(downAt[0] - hoverAt[0],
                                                     downAt[1] - hoverAt[1]) * 10) / 10,
           hover, after,
           /** **지시 4-b의 판정** — 호버에서 본 것과 댄 뒤가 같은가. */
           same_kind: (hover ? hover.kind : null) === after.start_kind };
}

/** 팔 한 벌 — 잠금을 켜고/끄고 같은 네 동작점을 돈다. */
async function suite(page: any, on: boolean) {
  await page.evaluate((v: boolean) => window.S2S.setHoverLock(v), on);
  const t = await page.evaluate(() => {
    const S = window.S2S;
    const s0 = S.doc().strokes.filter((x: any) => x.seg3d)[0];
    return s0.pts2d[0];
  });
  const rows = [] as any[];
  rows.push(await run(page, "① 호버 = 착지(정확)", [t[0], t[1]], [t[0], t[1]]));
  rows.push(await run(page, "② 착지가 6.7px 빗나감(조리개 안)", [t[0], t[1]], [t[0] + 6, t[1] + 3]));
  rows.push(await run(page, "③ 착지가 12.5px 빗나감(조리개 밖)", [t[0], t[1]], [t[0] + 11, t[1] + 6]));
  rows.push(await run(page, "④ 호버가 낡았다(먼 자리에 착지)", [t[0], t[1]], [t[0] + 120, t[1] + 90]));
  const stats = await page.evaluate(() => window.S2S.hoverLock());
  return { on, rows, stats };
}

/**
 * **카메라 서기 전의 2D 갈래**(`resolve2d`의 `pinStart`) — 3D 후보가 없으므로
 * `hover2d`가 잠긴다. 이 팔이 없으면 그 경로는 **안 잰 채 0으로 세어진다**(#36).
 */
async function preCameraArm(page: any) {
  // 대기 획 하나를 긋는다 — 그 끝점이 2D 오스냅 후보가 된다
  await pen(page, "pointerdown", 300, 500);
  for (let i = 1; i <= 5; i++) await pen(page, "pointermove", 300 + i * 40, 500 - i * 6);
  await pen(page, "pointerup", 500, 470);
  await page.waitForTimeout(60);
  const tip = await page.evaluate(() => {
    const s = window.S2S.doc().strokes[0];
    return s.pts2d[s.pts2d.length - 1];
  });
  await page.evaluate(() => window.S2S.setHoverLock(true));
  const on = await run(page, "⑤ 카메라 전 · 조리개 밖 착지(2D)", [tip[0], tip[1]],
                       [tip[0] + 11, tip[1] + 6]);
  await page.evaluate(() => window.S2S.setHoverLock(false));
  const off = await run(page, "⑤ 카메라 전 · 조리개 밖 착지(2D) — 잠금 끔", [tip[0], tip[1]],
                        [tip[0] + 11, tip[1] + 6]);
  await page.evaluate(() => window.S2S.setHoverLock(true));
  // ⚠ 카운터는 **이 팔의 몫만** 든다 — `setupScene`이 페이지를 다시 열면 0에서 시작한다
  return { on, off, stats: await page.evaluate(() => window.S2S.hoverLock()) };
}

test("호버에서 본 후보가 착지에서 그대로 쓰인다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e}`));
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const pre = await preCameraArm(page);
  // `setupScene`이 IndexedDB를 지우고 **페이지를 다시 연다** — 앞 팔의 대기 획도
  // 카운터도 여기서 0이 된다(따로 안 지운다)
  await setupScene(page);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(80);

  // **켠 팔이 먼저다** — 끈 팔이 남긴 미배치 획이 다음 팔의 후보를 늘리지 않게(#12 아님:
  // 순서 자체가 동작점이라 두 팔 사이에 문서를 되돌린다)
  const snapshot = await page.evaluate(() => JSON.stringify(window.S2S.doc().strokes.map((s: any) => s.id)));
  const armOn = await suite(page, true);
  await page.evaluate((keep: string) => {
    const ids = new Set(JSON.parse(keep));
    const d = window.S2S.doc();
    d.strokes = d.strokes.filter((s: any) => ids.has(s.id));
    window.S2S.refresh();
  }, snapshot);
  const armOff = await suite(page, false);
  await page.evaluate(() => window.S2S.setHoverLock(true));

  /** **옛 경로가 잃은 스냅 수** — 잠금을 끄면 시작점이 사라지는 동작점의 수. */
  const lostByOldPath = armOn.rows.filter((r, i) =>
    r.after.start_kind != null && armOff.rows[i].after.start_kind == null).length;
  /**
   * **잠금이 되찾은 착지 어긋남(px)** — 옛 경로가 잃고 새 경로가 붙인 동작점의 `land_gap_px`.
   * ⚠ 도달 가능성 값을 **수(count)로 안 적는다**(#40·#5 — 0/1은 정보량이 0이다): 이 값은
   * 연속량이고, 조리개를 넘어 **얼마나 멀리** 잠금이 닿았는지를 그대로 든다.
   * 판별: 착지 어긋남을 조리개 안으로 줄이면 빈 배열이 되고, 스위치를 끄면 빈 배열이 된다.
   */
  const recoveredGapPx = armOn.rows.filter((r, i) =>
    r.after.start_kind != null && armOff.rows[i].after.start_kind == null).map(r => r.land_gap_px);

  const led: any = {
    what: "호버에서 뜬 오스냅 후보가 **펜을 대는 순간 잠기는가** — 착지가 조리개 밖으로 "
      + "빗나가도 그 후보로 시작하는가(지시 4-b).",
    how: {
      arms: "같은 네 동작점(착지 어긋남 0·6.7·12.5px + 낡은 호버)을 **잠금 켬/끔**으로 "
        + "두 번 돈다. 끔이 수리 전 거동이다(#30) — 두 팔 사이에 문서를 되돌린다.",
      judge: "`same_kind` — 호버에서 본 후보 종류와 놓인 획의 시작점 종류가 같은가(#49: "
        + "판정이 드는 양은 **종류**다. 거리 px는 조건이지 판정이 아니다).",
      lock_radius: "잠금 조건은 **착지가 마지막 호버 자리에서 벗어난 px**가 "
        + "`PICK_TOL.radius_ratio × 화면 대각` 이내일 것 — 새 임계가 아니다(#17). "
        + "조리개(`OSNAP_RADIUS_PX`)와는 **다른 양**이다(#49).",
    },
    what_this_does_not_say: [
      "dpr 1·합성 `PointerEvent`·한 픽스처다(#12·#21). **실기(아이패드) 확인은 없다** — "
      + "애플펜슬의 실제 호버 표본이 오면 그때 판정한다.",
      "**호버가 없는 기기는 이 팔이 안 돈다**(#35) — 터치는 `onHover`가 안 불려 "
      + "`hoverSnap`·`hover2d`가 null이고 `no_hover`가 그 갈래를 센다(지시 4-c: 종전대로). "
      + "그 경로의 종단 팔은 `touch_route.spec.ts`가 따로 든다.",
      "**호버 표식이 화면에 칠해지는가는 안 잰다** — 잰 것은 `S2S.hoverSnap()`이 낸 "
      + "후보다. 칠하기는 `drawSnapMark`가 그 값을 그대로 받는다(배선 공유, #17).",
      "**카메라 전 2D 갈래는 동작점 하나뿐이다**(⑤ — 조리개 밖 착지). 어긋남 곡선은 "
      + "3D 갈래(①②③④)가 든다.",
      "**잠근 후보가 3D에 옳게 놓이는가는 안 잰다** — `lifted`(놓였는가)까지다. "
      + "옳음은 `confirm_link`·`dir_state`의 자리다(그 둘은 확정 시점 행을 든다).",
      "`same_kind`는 **보장이 아니다**(#5) — 끔 팔의 ③에서 실제로 거짓이 나오는 것이 "
      + "이 원장의 판별이다. 참이 자동으로 성립하는 구성이 아니다.",
    ],
    selfcheck_notes: {
      land_gap_zero: "`land_gap_px[0]`이 정확히 0인 것은 **구성의 귀결**이다 — 동작점 ①은 "
        + "호버와 착지를 **같은 좌표로** 합성했다(어긋남 0이 그 동작점의 정의다). "
        + "임계를 안 건다(#5).",
      pre_camera_3d_zero: "`counters.pre_camera.locked3d`·`stale` 0은 그 팔의 구성이다 — "
        + "카메라가 안 서서 3D 후보가 **없고**(`hoverSnap` null), 착지가 늘 잠금 반경 "
        + "안이라 낡은 호버가 안 생긴다. 그 두 갈래는 확정 뒤 팔(①~④)이 든다.",
      locked2d_zero: "`counters.on`·`off`의 `locked2d` 0은 **3D가 이기기 때문이다**"
        + "(`onHover`가 3D 후보가 있으면 `hover2d`를 안 만든다 — 4차 지시 1의 순서). "
        + "2D 갈래는 `counters.pre_camera`가 든다.",
      no_hover_zero: "`counters.on`·`off`의 `no_hover` 0은 그 팔의 동작점이 전부 "
        + "**호버를 먼저 합성**하기 때문이다(`pre_camera`의 1은 씨앗 획 — 호버 없이 그었다). "
        + "호버가 없는 기기(터치)의 갈래는 여기서 **도달 불가**이고 안전으로 안 읽는다(#35) — "
        + "그 경로는 `touch_route.spec.ts`가 따로 든다.",
    },
    arms: { on: armOn, off: armOff, pre_camera: pre },
    summary: {
      on_same_kind: armOn.rows.map(r => r.same_kind),
      off_same_kind: armOff.rows.map(r => r.same_kind),
      on_start_kind: armOn.rows.map(r => r.after.start_kind),
      off_start_kind: armOff.rows.map(r => r.after.start_kind),
      on_lifted: armOn.rows.map(r => r.after.lifted),
      off_lifted: armOff.rows.map(r => r.after.lifted),
      land_gap_px: armOn.rows.map(r => r.land_gap_px),
      lost_by_old_path: lostByOldPath,
      recovered_land_gap_px: recoveredGapPx,
      pre_camera_same_kind: [pre.on.same_kind, pre.off.same_kind],
      pre_camera_start_kind: [pre.on.after.start_kind, pre.off.after.start_kind],
    },
    gate: {
      registered: "호버에서 본 후보가 착지에서 그대로 쓰인다. 판정은 "
        + "`summary.on_same_kind`(잠금 켬)와 `summary.off_same_kind`(수리 전)의 대비가 든다(#47).",
      reachability: "**옛 경로가 실제로 잃던 스냅이 있는가** — 값은 "
        + "`recovered_land_gap_px`(잠금이 되찾은 착지 어긋남 px)다. **빈 배열이면 이 원장은 "
        + "아무것도 안 말한다**(#32·#40). 수(`lost_by_old_path`)를 값으로 안 쓴다 — "
        + "0/1은 정보량이 0이다(#5). 이 px는 조리개(8px)를 **얼마나 넘어** 닿았는지를 든다.",
      reachability_value: null as unknown,
      reachability_source: "summary/recovered_land_gap_px",
      /**
       * **픽스처가 정한 상수가 아닌가**(#46 — 앞 항목이 세운 표기 규칙, #42 ⑩). `false`다:
       * 이 배열은 **스위치 하나**(`setHoverLock`)로 비고, 착지 어긋남을 조리개 안으로
       * 줄여도 빈다. 픽스처 좌표가 정하는 상수가 아니다.
       */
      reachability_value_fixture_determined: false,
      result: {} as Record<string, unknown>,
    },
    counters: { pre_camera: pre.stats, on: armOn.stats, off: armOff.stats },
    ui_constants: { pick_radius_ratio: PICK_TOL.radius_ratio },
    pitfall_citations: [5, 12, 17, 21, 30, 32, 35, 36, 40, 42, 43, 46, 47, 48, 49, 50],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_value = recoveredGapPx;
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "hover_lock.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  // **도달 가능성**(#40) — 옛 경로가 실제로 잃던 스냅이 있다
  expect(lostByOldPath).toBeGreaterThan(0);
  // **지시 4-b** — 잠금을 켜면 조리개 밖 착지(③)에서도 호버에서 본 후보로 시작한다
  expect(armOn.rows[2].same_kind).toBe(true);
  expect(armOn.rows[2].after.start_kind).not.toBeNull();
  // **되살림이 실제로 버그를 되살린다**(회귀 팔의 자격) — 끄면 그 자리가 다시 비어야 한다
  expect(armOff.rows[2].after.start_kind).toBeNull();
  // **낡은 호버는 잠그지 않는다**(④) — 종전대로 착지점으로 묻는다
  expect(armOn.stats.stale).toBeGreaterThan(0);
  // **2D 갈래도 돈다**(#36 — 안 잰 팔을 0으로 안 센다): 카메라 전에도 잠기고, 끄면 잃는다
  expect(pre.on.after.start_kind).not.toBeNull();
  expect(pre.off.after.start_kind).toBeNull();
  expect(pre.stats.locked2d).toBeGreaterThan(0);
  // **카운터가 분모를 채운다**(#43)
  const c = armOn.stats;
  expect(c.locked3d + c.locked2d + c.no_hover + c.stale).toBe(c.downs);
});
