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
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene, openDrawing } from "./fixture.js";

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
  // **획이 도는 동안** 잠금을 읽는다(2026-08-19 항목 4 1차 리뷰어 [8]) — `pinned*`는 획
  // 수명의 상태라 획이 끝나면 지워진다. 획 사이에 읽으면 늘 null이고 그것은 측정이 아니다
  const pinnedDuring = await page.evaluate(() => {
    const h = window.S2S.hoverLock();
    return { pinned3d: h.pinned3d, pinned2d: h.pinned2d };
  });
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
           hover_at: hoverAt, down_at: downAt,   // 질의점을 원장에 남긴다(1차 리뷰어 [7])
           hover, pinned_during: pinnedDuring, after,
           /** **지시 4-b의 판정** — 호버에서 본 것과 댄 뒤가 같은가. */
           same_kind: (hover ? hover.kind : null) === after.start_kind };
}

/**
 * **팔 하나의 카운터 몫**(1차 리뷰어 [1]) — 카운터는 페이지 수명 동안 **누적**되므로
 * 팔 앞뒤 차를 낸다. 옛 판은 누적치를 그대로 적어 `off` 팔이 `on` 팔의 값을 베꼈고
 * `#43`의 항등(`locked3d + locked2d + no_hover + stale = downs`)이 깨져 보였다.
 */
const statDelta = (a: any, b: any) => ({
  downs: b.downs - a.downs, locked3d: b.locked3d - a.locked3d,
  locked2d: b.locked2d - a.locked2d, no_hover: b.no_hover - a.no_hover,
  stale: b.stale - a.stale,
  /** 최댓값은 차가 뜻이 없다 — 그 팔이 끝난 시점의 누적 최대다(그렇게 적는다). */
  maxLandGapPx_cumulative: b.maxLandGapPx,
});

/** 팔 한 벌 — 잠금을 켜고/끄고 같은 네 동작점을 돈다. */
async function suite(page: any, on: boolean) {
  const stats0 = await page.evaluate(() => window.S2S.hoverLock());
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
  const stats1 = await page.evaluate(() => window.S2S.hoverLock());
  return { on, rows, stats: statDelta(stats0, stats1), stats_cumulative: stats1 };
}

/**
 * **카메라 서기 전의 2D 갈래**(`resolve2d`의 `pinStart`) — 3D 후보가 없으므로
 * `hover2d`가 잠긴다. 이 팔이 없으면 그 경로는 **안 잰 채 0으로 세어진다**(#36).
 */
async function preCameraArm(page: any, on: boolean) {
  // ⚠ **페이지를 새로 연다**(1차 리뷰어 [2]) — 옛 판은 켬/끔 두 행을 한 문서에서 이어
  // 돌려서, 끔 행이 켬 행이 남긴 획 위에서 돌았다(호버 후보가 `endpoint` → `vertex`로
  // 바뀌었다). 대조군과 실험군이 같은 상태에서 시작해야 대비가 성립한다(#30).
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page, (await page.locator("#ink").boundingBox())!.height * 0.20);
  const stats0 = await page.evaluate(() => window.S2S.hoverLock());
  await page.evaluate((v: boolean) => window.S2S.setHoverLock(v), on);
  // 대기 획 하나를 긋는다 — 그 끝점이 2D 오스냅 후보가 된다
  await pen(page, "pointerdown", 300, 500);
  for (let i = 1; i <= 5; i++) await pen(page, "pointermove", 300 + i * 40, 500 - i * 6);
  await pen(page, "pointerup", 500, 470);
  await page.waitForTimeout(60);
  const tip = await page.evaluate(() => {
    const s = window.S2S.doc().strokes[0];
    return s.pts2d[s.pts2d.length - 1];
  });
  const row = await run(page, `⑤ 카메라 전 · 조리개 밖 착지(2D)${on ? "" : " — 잠금 끔"}`,
                        [tip[0], tip[1]], [tip[0] + 11, tip[1] + 6]);
  const stats1 = await page.evaluate(() => window.S2S.hoverLock());
  return { on, row, stats: statDelta(stats0, stats1) };
}

/**
 * **잠금 문턱의 경계**(1차 리뷰어 [3][9]) — 착지 어긋남을 훑어 **잠금이 끊기는 자리**를 낸다.
 *
 * 게이트 값이 여기서 나온다. 회수된 동작점의 **크기**(12.5px 등)는 픽스처가 고른 값이라
 * 코드를 틀리게 해도 안 움직인다(#46) — 반면 **문턱**은 `PICK_TOL.radius_ratio × 화면 대각`이
 * 정하므로, 그 상수를 잘못 쓰면 밴드가 통째로 옮겨간다. 그것이 판별이다.
 */
async function thresholdSweep(page: any) {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page, (await page.locator("#ink").boundingBox())!.height * 0.20);
  await setupScene(page);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(80);
  await page.evaluate(() => window.S2S.setHoverLock(true));
  const t = await page.evaluate(() => {
    const s0 = window.S2S.doc().strokes.filter((x: any) => x.seg3d)[0];
    return s0.pts2d[0];
  });
  const gaps = [4, 8, 12, 16, 18, 20, 21, 22, 24, 28, 40];
  const rows = [] as any[];
  for (const g of gaps) {
    const r = await run(page, `훑기 ${g}px`, [t[0], t[1]], [t[0] + g, t[1]]);
    rows.push({ gap_px: g, locked: r.pinned_during.pinned3d != null,
                start_kind: r.after.start_kind });
  }
  const locked = rows.filter(r => r.locked).map(r => r.gap_px);
  const stale = rows.filter(r => !r.locked).map(r => r.gap_px);
  return { gaps, rows,
           /** 잠긴 최대 어긋남 / 처음 안 잠긴 어긋남 — 문턱은 이 둘 사이다. */
           last_locked_px: locked.length ? Math.max(...locked) : null,
           first_stale_px: stale.length ? Math.min(...stale) : null };
}

/**
 * **호버가 되는 다른 기기 — 마우스**(1차 리뷰어 [10] · AS-L50). 마우스는 누르는 동안
 * 커서가 안 움직이므로 호버 좌표와 착지 좌표가 **정확히 같다**는 것이 옛 코드의 전제였다.
 * 이 팔이 그것을 **실측한다** — 산문의 단정을 원장이 받는다.
 */
async function mouseArm(page: any) {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page, (await page.locator("#ink").boundingBox())!.height * 0.20);
  await setupScene(page);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(80);
  await page.evaluate(() => window.S2S.setHoverLock(true));
  const box = (await page.locator("#frame").boundingBox())!;
  const t = await page.evaluate(() => {
    const s0 = window.S2S.doc().strokes.filter((x: any) => x.seg3d)[0];
    return s0.pts2d[0];
  });
  await page.mouse.move(box.x + t[0], box.y + t[1]);
  await page.waitForTimeout(40);
  const hover = await page.evaluate(() => {
    const h = window.S2S.hoverSnap();
    return h ? { kind: h.kind, at: h.screen.map((v: number) => Math.round(v * 10) / 10) } : null;
  });
  await page.mouse.down();
  const during = await page.evaluate(() => window.S2S.hoverLock());
  await page.mouse.move(box.x + t[0] + 120, box.y + t[1] + 40, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(60);
  const after = await page.evaluate(() => {
    const sts = window.S2S.doc().strokes, s = sts[sts.length - 1];
    return { start_kind: s.snapStart ? s.snapStart.kind : null, lifted: !!s.seg3d };
  });
  return { hover, pinned_during: during.pinned3d, after,
           /** 마우스에서 착지가 마지막 호버 자리에서 벗어난 px — 전제라면 0이다. */
           land_gap_px: Math.round(during.maxLandGapPx * 1000) / 1000,
           same_kind: (hover ? hover.kind : null) === after.start_kind };
}

/**
 * **호버 없이 시작하는 획**(지시 4-c · 1차 리뷰어 [6]) — 두 갈래를 갈라 잰다.
 *
 * ⚠ **터치는 애초에 잉크가 아니다**(`InkCanvas.inkable` — "touch: 잉크 아님(펜 세션 =
 * 팜 리젝션, 비펜 세션 = 제스처 예약)"). 손가락 하나는 궤도이고 둘은 팬·줌이다(2026-08-17
 * 지시 G). 그러므로 «호버가 안 되는 기기는 종전대로»가 뜻하는 그리기 경로는 **터치가
 * 아니라 호버를 안 거친 펜**이다 — 펜촉이 이미 닿은 채로 들어오거나 호버를 안 내는
 * 스타일러스가 그 자리다. 둘 다 잰다: 터치는 **획이 아예 안 생기는가**, 무호버 펜은
 * **종전 경로(착지 질의)로 가는가**.
 */
async function noHoverArms(page: any) {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page, (await page.locator("#ink").boundingBox())!.height * 0.20);
  await setupScene(page);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(80);
  await page.evaluate(() => window.S2S.setHoverLock(true));
  const t = await page.evaluate(() => {
    const s0 = window.S2S.doc().strokes.filter((x: any) => x.seg3d)[0];
    return s0.pts2d[0];
  });

  // ---- ⑥ 터치: 잉크가 아니다(궤도로 간다) — 획도 카운터도 안 생겨야 한다
  const t0 = await page.evaluate(() => window.S2S.hoverLock());
  const n0 = await page.evaluate(() => window.S2S.doc().strokes.length);
  const touchEv = async (type: string, x: number, y: number) => {
    await page.evaluate((e: any) => {
      const el = document.getElementById("ink") as HTMLCanvasElement;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(e.type, {
        pointerId: 71, pointerType: "touch", isPrimary: true, bubbles: true, cancelable: true,
        clientX: r.left + e.x, clientY: r.top + e.y,
        buttons: e.type === "pointerup" ? 0 : 1, pressure: e.type === "pointerup" ? 0 : 0.5,
      }));
    }, { type, x, y });
  };
  await touchEv("pointerdown", t[0], t[1]);
  for (let i = 1; i <= 5; i++) await touchEv("pointermove", t[0] + i * 22, t[1] + i * 7);
  await touchEv("pointerup", t[0] + 110, t[1] + 35);
  await page.waitForTimeout(60);
  const t1 = await page.evaluate(() => window.S2S.hoverLock());
  // ⚠⚠ **터치는 궤도로 갔다** — 손가락 하나가 카메라를 돌린다(2026-08-17 지시 G).
  // 그러므로 이 팔은 **시점을 바꾼다.** 그 사실을 값으로 남기고(그 자체가 ⑥의 결론을
  // 강화한다) 다음 팔은 **장면을 새로 연다**. 초판은 안 열어서, 전량 실행에서 ⑦이
  // 돌아간 시점의 옛 좌표로 대는 바람에 스냅이 안 걸렸다(단독 실행에서는 회전이 작아
  // 통과했다 — 순서 의존 결함이지 흔들림이 아니다).
  const pinnedAfterTouch = await page.evaluate(() => window.S2S.stage.isPinned);
  const touch = { strokes_added: (await page.evaluate(() => window.S2S.doc().strokes.length)) - n0,
                  stats: statDelta(t0, t1),
                  /** 터치가 **카메라를 돌렸는가** — 잉크가 아니라 궤도라는 것의 실측 */
                  unpinned_view: !pinnedAfterTouch };

  // ---- ⑦ 무호버 펜: 호버 없이 바로 댄다 — 잠글 것이 없어 착지 질의로 간다
  // **장면을 새로 연다**(위 ⚠⚠) — 터치 팔이 시점을 바꿨다
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page, (await page.locator("#ink").boundingBox())!.height * 0.20);
  await setupScene(page);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(80);
  await page.evaluate(() => window.S2S.setHoverLock(true));
  const t2 = await page.evaluate(() => {
    const s0 = window.S2S.doc().strokes.filter((x: any) => x.seg3d)[0];
    return s0.pts2d[0];
  });
  await page.evaluate(() => window.S2S.clearHover());
  const p0 = await page.evaluate(() => window.S2S.hoverLock());
  const hoverBefore = await page.evaluate(() => window.S2S.hoverSnap());
  await pen(page, "pointerdown", t2[0], t2[1]);
  const during = await page.evaluate(() => window.S2S.hoverLock());
  for (let i = 1; i <= 5; i++) await pen(page, "pointermove", t2[0] + i * 22, t2[1] + i * 7);
  await pen(page, "pointerup", t2[0] + 110, t2[1] + 35);
  await page.waitForTimeout(60);
  const p1 = await page.evaluate(() => window.S2S.hoverLock());
  const after = await page.evaluate(() => {
    const sts = window.S2S.doc().strokes, s = sts[sts.length - 1];
    return { start_kind: s.snapStart ? s.snapStart.kind : null, lifted: !!s.seg3d };
  });
  return { touch,
           pen_no_hover: { hover_before_down: hoverBefore, pinned_during: during.pinned3d,
                           after, stats: statDelta(p0, p1) } };
}

// ⛔⛔ **18차로 이 팔을 멈췄다**(지시 a~q — 새 절차). 지운 것이 아니라 **멈춘 것**이다.
// 같은 이유다 — 첫 획이 작도선이라 사라져 호버 대상이 없다. 재작성이 필요하다 — DEFERRED 18차 행.
// ⚠ **그동안 이 팔이 덮던 것은 안 덮인다** — 그 사실을 DEFERRED가 든다(조건과 함께).
test.skip("호버에서 본 후보가 착지에서 그대로 쓰인다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e}`));
  const preOn = await preCameraArm(page, true);
  const preOff = await preCameraArm(page, false);
  const sweep = await thresholdSweep(page);
  const mouse = await mouseArm(page);
  const noHover = await noHoverArms(page);
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page, (await page.locator("#ink").boundingBox())!.height * 0.20);
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
  // **2D 갈래도 같은 모집단에 넣는다**(1차 리뷰어 [4]) — 옛 판은 3D 팔만 세어
  // 회수 하나를 빠뜨렸다(⑤도 끔에서 잃고 켬에서 붙는다)
  if (preOn.row.after.start_kind != null && preOff.row.after.start_kind == null) {
    recoveredGapPx.push(preOn.row.land_gap_px);
  }
  const setup = await page.evaluate(() => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    return { canvas: [el.clientWidth, el.clientHeight], dpr: window.devicePixelRatio };
  });

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
      "⚠ **터치 팔은 시점을 바꾼다** — 손가락 하나가 궤도이기 때문이다(그것이 그 팔의 "
      + "결론이고 `touch_unpinned_view`가 그 실측이다). 그래서 무호버 펜 팔은 **장면을 "
      + "새로 연다**. 초판은 안 열어서 전량 실행에서만 실패했다 — **순서 의존 결함이지 "
      + "흔들림이 아니다**(단독 실행에서는 회전이 작아 통과했다).",
      "**호버 없는 갈래는 `arms.no_hover`가 직접 잰다**(지시 4-c). ⛔ 초판은 그 대역을 "
      + "`touch_route.spec.ts`로 위임했는데 **그 원장은 잠금을 안 든다**(2026-08-17 지시 G의 "
      + "입력 라우팅 하네스다). 1차 리뷰어 [6]으로 여기에 팔을 만들었고, 만들면서 "
      + "**터치는 애초에 그리기가 아니라는 것**이 드러났다(`inkable`: 손가락 하나는 궤도, "
      + "둘은 팬·줌) — 그래서 갈래를 둘로 갈랐다: ⑥ 터치(획이 안 생긴다) · "
      + "⑦ 무호버 펜(호버를 안 거친 펜 — 종전 경로로 간다). ⑦이 지시 4-c가 뜻하는 자리다.",
      "`no_hover`는 «호버 후보가 없는 채로 시작한 획»을 센다 — **기기 종류가 아니다**(#49). "
      + "터치 갈래는 `arms.touch`가 `pointerType: \"touch\"`로 직접 가른다. 씨앗 획처럼 "
      + "펜이지만 호버를 안 거친 획도 같은 칸에 든다.",
      "**`pinned3d`·`pinned2d`는 획이 도는 동안에만 값이 있다**(획 수명의 상태다). "
      + "그래서 `rows[].pinned_during`이 **pointerdown 직후** 읽은 것이고, `counters`의 "
      + "그 필드는 획 사이 값이라 늘 null이다(1차 리뷰어 [8]).",
      "**마우스 팔은 한 동작점이다**(`arms.mouse`) — AS-L50의 «마우스에서는 두 좌표가 "
      + "정확히 같다»를 그 한 자리에서 확인한다. 마우스로 **일부러 어긋내 착지하는** "
      + "손짓은 합성할 수 없어(누르는 동안 커서가 안 움직인다) 안 잰다.",
      "**호버 표식이 화면에 칠해지는가는 안 잰다** — 잰 것은 `S2S.hoverSnap()`이 낸 "
      + "후보다. 칠하기는 `drawSnapMark`가 그 값을 그대로 받는다(배선 공유, #17).",
      "**카메라 전 2D 갈래는 동작점 하나뿐이다**(⑤ — 조리개 밖 착지). 어긋남 곡선은 "
      + "3D 갈래(①②③④)가, 문턱 밴드는 `threshold_sweep`이 든다.",
      "**문턱 밴드는 훑기 격자의 해상도까지만 좁혀진다**(4·8·12·16·18·20·21·22·24·28·40px) — "
      + "밴드 안의 정확한 전이점은 안 잰다.",
      "**잠근 후보가 3D에 옳게 놓이는가는 안 잰다** — `lifted`(놓였는가)까지다. "
      + "옳음은 `confirm_link`·`dir_state`의 자리다(그 둘은 확정 시점 행을 든다).",
      "`same_kind`는 **보장이 아니다**(#5) — 끔 팔의 ③에서 실제로 거짓이 나오는 것이 "
      + "이 원장의 판별이다. 참이 자동으로 성립하는 구성이 아니다.",
    ],
    selfcheck_notes: {
      land_gap_zero: "`land_gap_px`가 정확히 0인 자리(동작점 ① · 마우스 팔)는 **구성의 "
        + "귀결**이다 — ①은 호버와 착지를 같은 좌표로 합성했고(어긋남 0이 그 동작점의 "
        + "정의다), 마우스는 누르는 동안 커서가 안 움직여 두 좌표가 실제로 같다. "
        + "①에는 임계를 안 건다(#5); 마우스의 0은 **AS-L50이 세운 명제의 실측**이라 "
        + "단언을 건다(그 0이 안 나오면 전제가 틀린 것이다).",
      switch_off_zero: "잠금을 끈 팔(`off`·`pre_camera_off`)의 갈래 카운터가 전부 0인 것은 "
        + "**수리 전에 분류가 없었기 때문이다** — 스위치가 꺼지면 `downs`만 세고 즉시 "
        + "돌아간다. 그래서 그 팔에는 항등(#43)이 아니라 «갈래 합이 0»을 단언한다. "
        + "`maxLandGapPx_cumulative` 0도 같은 자리다(그 팔이 아무 어긋남도 안 기록했다).",
      touch_all_zero: "`touch` 팔의 카운터가 **`downs`까지 전부 0**인 것은 터치가 "
        + "**잉크가 아니기 때문이다**(`InkCanvas.inkable` — 손가락 하나는 궤도). 획 시작 "
        + "콜백에 아예 안 닿는다. 0이 집계 미작동이 아니라 **그 팔의 결론**이다(지시 4-c ⑥).",
      pre_camera_3d_zero: "`pre_camera_*`의 `locked3d`·`stale` 0은 그 팔의 구성이다 — "
        + "카메라가 안 서서 3D 후보가 **없고**(`hoverSnap` null), 착지가 늘 잠금 반경 "
        + "안이라 낡은 호버가 안 생긴다. 그 두 갈래는 확정 뒤 팔(①~④)과 훑기가 든다.",
      locked2d_zero: "`counters.on`·`off`의 `locked2d` 0은 **3D가 이기기 때문이다**"
        + "(`onHover`가 3D 후보가 있으면 `hover2d`를 안 만든다 — 4차 지시 1의 순서). "
        + "2D 갈래는 `counters.pre_camera_on`이 든다.",
      pen_no_hover_zero: "`pen_no_hover`의 갈래가 `no_hover` 하나만 1인 것은 **그 팔의 "
        + "결론이다**(지시 4-c ⑦) — 호버를 지우고 바로 댔으므로 잠글 것이 없고, 착지 "
        + "질의로 가서 시작점이 붙는다(`summary.pen_no_hover_start_kind`).",
      no_hover_zero: "`counters.on`·`off`의 `no_hover` 0은 그 팔의 동작점이 전부 "
        + "**호버를 먼저 합성**하기 때문이다. 호버 없는 갈래는 `arms.no_hover`가 든다.",
    },
    setup: { ...setup,
             /** **잠금 반경(px)** — `PICK_TOL.radius_ratio × 화면 대각`. 산문에 안 박는다(#47) */
             lock_radius_px: Math.round(PICK_TOL.radius_ratio
                                        * Math.hypot(setup.canvas[0], setup.canvas[1]) * 100) / 100,
             /** 오스냅 조리개(px) — 잠금 반경과 **다른 양**이다(#49) */
             aperture_px: OSNAP_RADIUS_PX,
             /**
              * **착지 기준 유효 반경의 상한**(1차 리뷰어 [7]) = 조리개 + 잠금 반경.
              * 후보는 호버점에서 조리개 안에 있고 착지는 호버점에서 잠금 반경 안이므로,
              * 착지에서 후보까지는 그 합보다 멀 수 없다. **실측이 아니라 상한이다.**
              */
             effective_from_landing_px_max: Math.round((OSNAP_RADIUS_PX + PICK_TOL.radius_ratio
                                        * Math.hypot(setup.canvas[0], setup.canvas[1])) * 100) / 100 },
    arms: { on: armOn, off: armOff, pre_camera_on: preOn, pre_camera_off: preOff,
            threshold_sweep: sweep, mouse, no_hover: noHover },
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
      pre_camera_same_kind: [preOn.row.same_kind, preOff.row.same_kind],
      pre_camera_start_kind: [preOn.row.after.start_kind, preOff.row.after.start_kind],
      /** **문턱 밴드**(px) — 잠긴 최대 어긋남 / 처음 안 잠긴 어긋남. 게이트 값이다 */
      threshold_band_px: [sweep.last_locked_px, sweep.first_stale_px],
      sweep_locked: sweep.rows.map((r: any) => r.locked),
      /** 마우스: 호버와 착지가 정확히 같은가(AS-L50의 전제) */
      mouse_land_gap_px: mouse.land_gap_px,
      mouse_same_kind: mouse.same_kind,
      /** ⑥ 터치는 **잉크가 아니다** — 획이 안 생기고 카운터도 안 는다(지시 4-c의 실제 자리) */
      touch_strokes_added: noHover.touch.strokes_added,
      touch_downs: noHover.touch.stats.downs,
      /** 터치가 카메라를 돌렸는가 — «잉크가 아니라 궤도»의 실측 */
      touch_unpinned_view: noHover.touch.unpinned_view,
      /** ⑦ 무호버 펜 — 잠글 것이 없어 착지 질의로 간다(거동 불변) */
      pen_no_hover_pinned: noHover.pen_no_hover.pinned_during,
      pen_no_hover_start_kind: noHover.pen_no_hover.after.start_kind,
      pen_no_hover_counter: noHover.pen_no_hover.stats.no_hover,
    },
    gate: {
      registered: "호버에서 본 후보가 착지에서 그대로 쓰인다. 판정은 "
        + "`summary.on_same_kind`(잠금 켬)와 `summary.off_same_kind`(수리 전)의 대비가 든다(#47).",
      reachability: "값은 **문턱 밴드**(`threshold_band_px` — 잠긴 최대 어긋남 / 처음 안 "
        + "잠긴 어긋남)다. ⛔ 초판은 `recovered_land_gap_px`(회수된 동작점의 크기)를 값으로 "
        + "썼는데 **그 크기는 픽스처가 고른 동작점이라 코드를 틀리게 해도 안 움직인다**"
        + "(1차 리뷰어 [3] · #46). 문턱은 다르다 — `PICK_TOL.radius_ratio × 화면 대각`이 "
        + "정하므로 그 상수를 잘못 쓰면 밴드가 통째로 옮겨간다. 밴드가 "
        + "`setup.lock_radius_px`를 감싸는지도 함께 본다. 훑기가 비면 이 원장은 아무것도 "
        + "안 말한다(#32·#40).",
      reachability_value: null as unknown,
      reachability_source: "summary/threshold_band_px",
      /**
       * **픽스처가 정한 상수가 아닌가**(#46 — 앞 항목이 세운 표기 규칙, #42 ⑩). `false`다:
       * 밴드는 훑기 격자가 아니라 **코드의 문턱**이 어디에 있는지를 든다. 판별 —
       * `PICK_TOL.radius_ratio`를 반으로 하면 밴드가 절반 자리로 내려가고, 잠금을 끄면
       * 훑기 전체가 안 잠겨 `last_locked_px`가 null이 된다. 격자(4~40px)는 **해상도**를
       * 정할 뿐 값을 정하지 않는다.
       */
      reachability_value_fixture_determined: false,
      /** 참고 — 회수된 동작점의 크기. **값이 아니다**(위 ⛔). 모집단은 3D 넷 + 2D 하나다 */
      recovered_land_gap_px_reference: null as unknown,
      result: {} as Record<string, unknown>,
    },
    counters: { pre_camera_on: preOn.stats, pre_camera_off: preOff.stats,
                on: armOn.stats, off: armOff.stats,
                touch: noHover.touch.stats, pen_no_hover: noHover.pen_no_hover.stats,
                note: "팔별 값은 **차**다(1차 리뷰어 [1]) — 누적치는 "
                  + "`arms.on.stats_cumulative`가 든다. 항등 "
                  + "`locked3d + locked2d + no_hover + stale = downs`는 **잠금이 켜진 팔에서만** "
                  + "성립한다(#43): 끄면 `downs`만 늘고 갈래는 안 센다 — 수리 전에는 분류 "
                  + "자체가 없었다는 기록이다" },
    ui_constants: { pick_radius_ratio: PICK_TOL.radius_ratio },
    pitfall_citations: [5, 12, 17, 18, 21, 25, 30, 32, 35, 36, 40, 42, 43, 46, 47, 48, 49, 50],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_value = led.summary.threshold_band_px;
  led.gate.recovered_land_gap_px_reference = recoveredGapPx;
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "hover_lock.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  // **도달 가능성**(#40) — 훑기가 실제로 문턱을 낸다(비면 이 원장은 아무 말도 안 한다)
  expect(sweep.last_locked_px).not.toBeNull();
  expect(sweep.first_stale_px).not.toBeNull();
  // 밴드가 **코드의 문턱을 감싼다** — 픽스처 격자가 아니라 `PICK_TOL`이 자리를 정한다(#46)
  const lockR = led.setup.lock_radius_px;
  expect(sweep.last_locked_px!).toBeLessThanOrEqual(lockR);
  expect(sweep.first_stale_px!).toBeGreaterThan(lockR);
  // 훑기가 단조다 — 가까우면 잠기고 멀면 안 잠긴다(뒤섞이면 판정이 무의미하다)
  expect(sweep.rows.map((r: any) => r.locked))
    .toEqual(sweep.gaps.map((g: number) => g <= lockR));
  // **지시 4-b** — 잠금을 켜면 조리개 밖 착지(③)에서도 호버에서 본 후보로 시작한다
  expect(armOn.rows[2].same_kind).toBe(true);
  expect(armOn.rows[2].after.start_kind).not.toBeNull();
  expect(armOn.rows[2].pinned_during.pinned3d).not.toBeNull();
  // **되살림이 실제로 버그를 되살린다**(회귀 팔의 자격) — 끄면 그 자리가 다시 비어야 한다
  expect(armOff.rows[2].after.start_kind).toBeNull();
  // **낡은 호버는 잠그지 않는다**(④) — 종전대로 착지점으로 묻는다
  expect(armOn.stats.stale).toBeGreaterThan(0);
  // **2D 갈래도 돈다**(#36 — 안 잰 팔을 0으로 안 센다): 카메라 전에도 잠기고, 끄면 잃는다
  expect(preOn.row.after.start_kind).not.toBeNull();
  expect(preOff.row.after.start_kind).toBeNull();
  expect(preOn.stats.locked2d).toBeGreaterThan(0);
  // **두 2D 행이 같은 조건에서 시작했다**(1차 리뷰어 [2]) — 호버가 본 것이 같아야 대비가 선다
  expect(preOn.row.hover.kind).toBe(preOff.row.hover.kind);
  // **AS-L50** — 마우스에서는 호버 좌표와 착지 좌표가 정확히 같다(옛 코드의 전제)
  expect(mouse.land_gap_px).toBe(0);
  expect(mouse.same_kind).toBe(true);
  // **지시 4-c ⑥** — 터치는 잉크가 아니다: 획도 카운터도 안 생긴다(궤도로 간다)
  expect(noHover.touch.strokes_added).toBe(0);
  expect(noHover.touch.stats.downs).toBe(0);
  // 그리고 **궤도로 갔다** — 그것이 «터치는 잉크가 아니다»의 다른 쪽 증거다
  expect(noHover.touch.unpinned_view).toBe(true);
  // **지시 4-c ⑦** — 무호버 펜은 잠글 것이 없어 착지 질의로 간다(거동 불변)
  expect(noHover.pen_no_hover.hover_before_down).toBeNull();
  expect(noHover.pen_no_hover.pinned_during).toBeNull();
  expect(noHover.pen_no_hover.stats.no_hover).toBeGreaterThan(0);
  expect(noHover.pen_no_hover.after.start_kind).not.toBeNull();
  // **카운터가 분모를 채운다**(#43) — 팔별 **차**로 본다(누적치가 아니다).
  // ⚠ 항등은 **잠금이 켜진 팔에서만** 성립한다: 끄면 `downs`만 늘고 갈래는 안 센다
  // (그것이 «수리 전에는 분류 자체가 없었다»의 기록이다)
  for (const c of [armOn.stats, preOn.stats,
                   noHover.touch.stats, noHover.pen_no_hover.stats]) {
    expect(c.locked3d + c.locked2d + c.no_hover + c.stale).toBe(c.downs);
  }
  for (const c of [armOff.stats, preOff.stats]) {
    expect(c.downs).toBeGreaterThan(0);
    expect(c.locked3d + c.locked2d + c.no_hover + c.stale).toBe(0);
  }
});
