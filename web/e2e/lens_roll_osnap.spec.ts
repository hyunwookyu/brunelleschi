// **렌즈 조절 · 큐브 롤 0 · 오스냅 패널**(2026-08-20 18차 지시 r-6·s-6·t-4).
// 산출: `stage0/out/lens_roll_osnap.json`.
//
// 셋 다 **재현부터** 했다(A-3) — 세 절의 `reproduced`가 수리 전 실측이다.
//   r  정렬 시점에서 f를 바꾸면 **화면은 바뀌고 3D 좌표는 안 바뀐다**. 확정 복귀면 원래 f다
//   s  면 탭 뒤 화면 가로·세로가 **축**인가. 수리 전 실측 −8.7° · −98.7°(0°·−90°여야 한다)
//   t  종류 버튼 여덟이 **좁은 뷰포트에서도** 다 보이는가. 수리 전 실측 500px에서 4/8
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene } from "./fixture.js";

declare global { interface Window { S2S: any; __SC: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 축 셋의 **화면 방향**(도) — 0°가 화면 수평, −90°가 화면 수직이다. */
const AXIS_DEG = `(() => {
  const o = window.S2S.draftOverlay();
  if (!o) return null;
  const deg = (d) => Math.round(Math.atan2(d[1], d[0]) * 180 / Math.PI * 10) / 10;
  return o.axisVps.map((a) => (a ? deg(a.screenDir) : null));
})`;

/**
 * **축의 상이 화면에서 «방향»을 갖는가** — 소실점이 주점에 붙어 있으면 축이 시선과
 * 나란하다는 뜻이고 그때 `screenDir`은 **0/0에 가까운 값의 각**이라 뜻이 없다.
 * 그 자리를 「롤이 틀렸다」로 읽으면 틀린 것을 재는 것이다(§5.3 — 지표가 의도한 것을 재는가).
 * 판정 재료로 **주점에서 소실점까지의 거리**를 함께 낸다(`null` = 무한원 = 방향이 뚜렷하다).
 */
const AXIS_DEGEN = `(() => {
  const o = window.S2S.draftOverlay();
  if (!o) return null;
  return o.axisVps.map((a) => (a ? (a.distFromPrincipal ?? null) : null));
})`;

test("렌즈·롤·오스냅 — 셋이 앱에서 돈다", async ({ page }) => {
  const led: Record<string, unknown> = {};

  // ================= s · 큐브 정렬의 롤 =================
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await setupScene(page);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(200);
  const cubeBox = (await page.locator("#cube").boundingBox())!;
  await page.mouse.click(cubeBox.x + cubeBox.width * 0.5, cubeBox.y + cubeBox.height * 0.5);
  await page.waitForTimeout(600);
  const sAfter = await page.evaluate(([src, dg]) => ({
    deg: eval(src as string)(),
    degen_dist_px: eval(dg as string)(),
    state: window.S2S.viewState(),
  }), [AXIS_DEG, AXIS_DEGEN]);
  /** 주점에 이만큼 가까우면 축이 시선과 나란해 화면 방향이 뜻을 잃는다(화면 폭의 4%). */
  const DEGEN_PX = 0.04 * 1280;
  // **화면 수평·수직에서 얼마나 벗어났나**(도) — 축마다 가장 가까운 직교 방향까지.
  const offOrtho = (d: number | null) =>
    d == null ? null : Math.min(...[0, 90, -90, 180, -180].map(k => Math.abs(d - k)));
  const liveOnly = (deg: (number | null)[] | null, dist: (number | null)[] | null) =>
    (deg ?? []).map((d, i) => {
      const dd = dist?.[i];
      return dd != null && dd < DEGEN_PX ? null : offOrtho(d);   // 축퇴한 축은 null(안 잰다)
    });
  led.s_roll = { after_face_tap: sAfter.deg, view_state: sAfter.state,
                 degen_dist_px: sAfter.degen_dist_px, degen_px_threshold: DEGEN_PX,
                 degen_note: "`degen_dist_px`는 **주점 → 축 소실점**(css px)이다. "
                   + "`null`은 무한원(화면 평행 — 방향이 뚜렷하다)이고, 임계보다 작으면 "
                   + "축이 시선과 나란해 **화면 방향이 뜻을 잃는다**. 그 축은 판정에서 뺀다.",
                 off_ortho_deg: liveOnly(sAfter.deg as (number|null)[], sAfter.degen_dist_px as (number|null)[]),
                 off_ortho_deg_raw: (sAfter.deg as (number | null)[]).map(offOrtho),
                 reproduced_before_fix: [-8.7, 0, -98.7],
                 // 도달 가능성은 **스칼라 하나**로 적는다 — 배열은 «이미 0이던 축»의 0이
                 // 섞여 자명값으로 읽힌다(selfcheck #40 ②). 이것이 수리 전 최대 이탈이다.
                 reproduced_off_ortho_max_deg: 8.7 };

  // **동작점을 하나로 두지 않는다**(#12 — 1차 리뷰어 [6]). 면 하나만 재면 «면 탭에서만
  // 접힌다»와 갈리지 않는다. 큐브의 **모서리·꼭짓점·윗면**을 더 탭하고, 마지막에
  // **「작도 시점으로」**(s-4)까지 같은 판정을 건다.
  // ⚠ **탭이 실제로 시점을 옮겼는지 함께 낸다**(#30의 나머지 절반) — 안 옮겼으면
  // «어디서 눌러도 0°»는 수리의 증거가 아니라 **탭이 안 먹었다**는 뜻이다.
  const tapCube = async (fx: number, fy: number) => {
    const before = await page.evaluate(() => window.S2S.camPose());
    await page.mouse.click(cubeBox.x + cubeBox.width * fx, cubeBox.y + cubeBox.height * fy);
    await page.waitForTimeout(600);
    return page.evaluate(([src, dg, b]) => {
      const p = window.S2S.camPose();
      const o = b as { azimuth: number; polar: number };
      const dz = (x: number) => Math.round(Math.abs(x) * 180 / Math.PI * 10) / 10;
      return { deg: eval(src as string)(), degen_dist_px: eval(dg as string)(),
               state: window.S2S.viewState(),
               // **시선의 앙각**(도, 0 = 수직 내려다봄) — 윗면 도달을 이것으로 판정한다
               polar_deg: Math.round(p.polar * 180 / Math.PI * 10) / 10,
               // **탭이 시점을 옮겼는가** — 방위·앙각의 변화(도). 둘 다 0이면 탭이 안 먹었다.
               gaze_moved_deg: Math.max(dz(p.azimuth - o.azimuth), dz(p.polar - o.polar)) };
    }, [AXIS_DEG, AXIS_DEGEN, before] as [string, string, unknown]);
  };
  // ⚠ **자리는 큐브의 판정 상수에서 계산한다** — 캔버스 108px, 중심 54, 큐브 반변 24px
  // (`view_cube_hit.test.ts`가 쓰는 그 값). 초판은 «위쪽 가장자리»를 눈대중으로 찍었는데
  // 그것은 **실루엣 밖**이라 `cubeHit`이 `null`을 냈고 호출자가 «가장 가까운 1점»으로
  // 보내 **시점이 안 움직였다**(`gaze_moved_deg` 0). 눈대중이 측정을 죽였다.
  const CX = 54 / 108, S24 = 24 / 108;
  const sMore: Record<string, unknown> = {};
  sMore.edge = await tapCube(CX + 0.8 * S24, CX);              // 오른쪽 모서리 → 2점
  sMore.vertex = await tapCube(CX + 0.8 * S24, CX - 0.8 * S24); // 오른쪽 위 꼭짓점 → 3점
  // **윗면**(s-3 — 롤이 축퇴하는 자리)은 카메라가 **이미 가파르게 내려다볼 때만** 열린다
  // (`CUBE_TOL.top_center` — 「위/아래는 손이 잘 안 감」). ⛔ 초판은 위 모서리를 거듭
  // 눌러 올리려 했는데 **모서리 스냅은 절대 자세라 45°에 머문다** — `top_polar_deg`가
  // 77.8°로 나와 «도달 못 했다»가 드러났다(값이 다르다고 도달한 것이 아니다).
  // 그래서 **궤도 도구로 실제로 내려다본 뒤** 중앙을 누른다(앱 경로 그대로, #17).
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click());
  const inkBox0 = (await page.locator("#ink").boundingBox())!;
  await page.mouse.move(inkBox0.x + inkBox0.width * 0.5, inkBox0.y + inkBox0.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(inkBox0.x + inkBox0.width * 0.5,
                          inkBox0.y + inkBox0.height * (0.5 + 0.03 * i));
  await page.mouse.up();
  await page.waitForTimeout(200);
  sMore.top = await tapCube(CX, CX);
  await page.evaluate(() =>            // 그리기로 되돌린다(도구는 우상단 묶음에 있다)
    document.querySelector<HTMLButtonElement>('#tools button[data-act="draw"]')!.click());
  // s-4 — 「작도 시점으로」도 같은 처리인가. **이 팔도 시선이 실제로 움직였는지 낸다**
  // (초판은 `gaze_moved_deg: null`이라 «양성 채널 없는 0»이었다 — 2차 리뷰어 [1]).
  // ⚠ **먼저 시점을 흐트러뜨린다** — 이미 작도 시점에 있는 상태에서 부르면 «돌아왔다»가
  // 항등이라 아무것도 안 잰다(첫 판이 `gaze_moved_deg` 0.3°였다). 궤도로 요·피치를 준다.
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="orbit"]')!.click());
  {
    const b = (await page.locator("#ink").boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++)
      await page.mouse.move(b.x + b.width * (0.5 + 0.02 * i), b.y + b.height * (0.5 + 0.012 * i));
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#tools button[data-act="draw"]')!.click());
  const beforeReturn = await page.evaluate(() => window.S2S.camPose());
  await page.evaluate(() => window.S2S.returnToDraft());
  await page.waitForTimeout(700);
  // **애니메이션이 안 끝난 것과 «덜 접혔다»를 가른다**(#32) — 두 시점에서 읽어 비교한다.
  const returnAt700 = await page.evaluate(() => window.S2S.draftJudge());
  await page.waitForTimeout(1500);
  sMore.return_to_draft = await page.evaluate(([src, dg, b]) => {
    const p = window.S2S.camPose();
    const o = b as { azimuth: number; polar: number };
    const dz = (x: number) => Math.round(Math.abs(x) * 180 / Math.PI * 10) / 10;
    return {
      deg: eval(src as string)(), degen_dist_px: eval(dg as string)(),
      state: window.S2S.viewState(),
      polar_deg: Math.round(p.polar * 180 / Math.PI * 10) / 10,
      // ⚠ **피치는 «그린 기준계»에서 잰다** — 세계 Y 기준의 `polar`은 그린 세로축이 기운
      // 만큼 90°에서 벗어난다. s-4가 말하는 «피치를 접는다»는 그린 기준계의 것이다.
      judge: window.S2S.draftJudge(),
      gaze_moved_deg: Math.max(dz(p.azimuth - o.azimuth), dz(p.polar - o.polar)),
    };
  }, [AXIS_DEG, AXIS_DEGEN, beforeReturn] as [string, string, unknown]);
  (led.s_roll as Record<string, unknown>).more_points = sMore;
  (led.s_roll as Record<string, unknown>).more_off_ortho_deg =
    Object.fromEntries(Object.entries(sMore).map(([k, v]) =>
      [k, liveOnly((v as any)?.deg ?? null, (v as any)?.degen_dist_px ?? null)]));
  (led.s_roll as Record<string, unknown>).more_off_ortho_deg_raw =
    Object.fromEntries(Object.entries(sMore).map(([k, v]) =>
      [k, ((v as any)?.deg as (number | null)[] | null)?.map(offOrtho) ?? null]));
  (led.s_roll as Record<string, unknown>).more_degen_dist_px =
    Object.fromEntries(Object.entries(sMore).map(([k, v]) => [k, (v as any)?.degen_dist_px ?? null]));
  // ⛔ **윗면 도달을 «값이 다르다»로 판정하지 않는다** — 초판이 그렇게 적었는데
  // 그 «다름»은 꼭짓점과 다르다는 뜻일 뿐이었다. **자세로 판정한다**: 시선의 앙각이
  // 0°(또는 180°)에 붙어야 윗면이다.
  const topPolar = (sMore.top as any)?.polar_deg ?? null;
  (led.s_roll as Record<string, unknown>).top_polar_deg = topPolar;
  (led.s_roll as Record<string, unknown>).top_reached =
    topPolar != null && Math.min(topPolar, 180 - topPolar) < 5;
  (led.s_roll as Record<string, unknown>).top_attempts = [
    "위 모서리 반복 탭 — 모서리 스냅은 절대 자세라 45°에 머문다(도달 못 함)",
    "궤도 도구로 내려다본 뒤 중앙 탭 — 중앙 탭이 «가장 가까운 수평 면»으로 되돌린다",
  ];
  (led.s_roll as Record<string, unknown>).s3_not_measured =
    "**윗면·아랫면 축퇴(s-3)는 앱 경로로 도달하지 못했다** — `top_reached`가 그 사실이다. "
    + "`snapToDir`의 그람-슈밋 갈래는 이 원장이 **안 덮는다**(#32: 안 잰 것이지 «없다»가 아니다).";
  // ⚠⚠ **판정이 시점 종류마다 다르다** — 안 가르면 지표가 뜻을 잃는다(§5.3 · #49).
  //   면·「작도 시점으로」  세 축이 다 화면 직교다(s-2의 문면 그대로).
  //   모서리·꼭짓점        **세로축만** 화면 수직이면 된다 — 그것이 «롤 0»의 내용이다.
  //                        가로축의 소실점 자리는 시점의 것이지 롤의 것이 아니다.
  //   윗면(축퇴)           세로축이 시선과 나란해 방향이 없다 — 대신 **가로축 둘**이
  //                        화면 직교여야 한다(s-3의 그람-슈밋이 그것을 정한다).
  (led.s_roll as Record<string, unknown>).more_vertical_off_ortho_deg =
    Object.fromEntries(Object.entries(sMore).map(([k, v]) =>
      [k, liveOnly((v as any)?.deg ?? null, (v as any)?.degen_dist_px ?? null)[2] ?? null]));
  (led.s_roll as Record<string, unknown>).more_polar_deg =
    Object.fromEntries(Object.entries(sMore).map(([k, v]) => [k, (v as any)?.polar_deg ?? null]));
  (led.s_roll as Record<string, unknown>).more_state =
    Object.fromEntries(Object.entries(sMore).map(([k, v]) => [k, (v as any)?.state ?? null]));
  (led.s_roll as Record<string, unknown>).more_gaze_moved_deg =
    Object.fromEntries(Object.entries(sMore).map(([k, v]) => [k, (v as any)?.gaze_moved_deg ?? null]));
  (led.s_roll as Record<string, unknown>).return_judge = (sMore.return_to_draft as any)?.judge ?? null;
  (led.s_roll as Record<string, unknown>).return_judge_at_700ms = returnAt700;
  (led.s_roll as Record<string, unknown>).return_residual = {
    what: "「작도 시점으로」가 **정확히 0으로 접지 않는다** — 그린 기준계 피치에 "
      + "0.1~0.2° 남는다(실행마다 출발 자세가 달라 값이 흔들린다).",
    settled: "**애니메이션 지연이 아니다** — 700ms와 2200ms에서 같은 값이다"
      + "(`return_judge_at_700ms` ↔ `return_judge`). 두 시점을 둔 이유가 그 갈래다(#32).",
    why: "**모른다**(#55). 후보는 `snapToDir`이 세운 자세를 `OrbitControls.update()`가 "
      + "구면 좌표로 다시 유도하며 생기는 잔차인데, **확인 안 했다** — 확인 못 한 것을 "
      + "원인으로 적지 않는다.",
    size: "이 잔차가 축 방향으로 옮겨진 크기가 `more_off_ortho_deg.return_to_draft`다. "
      + "큐브 면·모서리·꼭짓점 탭은 잔차가 없다(0) — **「작도 시점으로」 경로에만 있다**.",
    observed: "실행 넷에서 피치 **0.14~0.19°** · 축 방향 **0.6~1.0°**. "
      + "**실행마다 흔들린다** — 이 팔은 궤도 끌기로 출발 자세를 만들고 그 착지가 "
      + "결정적이지 않다. 그래서 임계를 실측 최대의 **2배**(2°)로 두고 그 사유를 여기 적는다. "
      + "⚠ 큐브 탭에는 같은 임계를 안 쓴다(0.05°) — 그 경로는 잔차가 없고, 느슨한 값을 "
      + "쓰면 그 회귀를 놓친다.",
  };
  (led.s_roll as Record<string, unknown>).judged_by = {
    rule: "**축퇴하지 않은 축만** 본다(`degen_dist_px` ≥ 임계이거나 `null`). "
      + "축퇴한 축의 화면 방향은 0/0의 각이라 뜻이 없다 — 그것을 롤 오차로 읽으면 "
      + "틀린 것을 재는 것이다. `off_ortho_deg`가 그 걸러진 값이고 "
      + "`off_ortho_deg_raw`가 안 거른 값이다(둘을 같이 낸다 — 무엇을 뺐는지 보이게).",
    face: "1점 시점 — 깊이축이 주점에 붙어 축퇴한다. 남는 둘(화면 가로·세로)로 본다.",
    edge: "2점 — 세 축 다 방향이 있다.",
    vertex: "3점 — 세 축 다 방향이 있다.",
    top: "위에서 내려다봄 — 세로축이 축퇴한다. 가로축 둘로 본다.",
    return_to_draft: "1점으로 돌아온다 — 깊이축이 다시 축퇴한다. 남는 둘로 본다.",
    why_vertical_kept: "`more_vertical_off_ortho_deg`(세로축만)는 **롤의 직접 정의**라 "
      + "따로 낸다 — 세로축이 축퇴하는 윗면에서는 `null`이다.",
  };

  // 다시 면으로 돌아와 이어서 잰다(#53 — 앞 팔이 장면을 바꾼 채로 두지 않는다)
  await page.mouse.click(cubeBox.x + cubeBox.width * 0.5, cubeBox.y + cubeBox.height * 0.5);
  await page.waitForTimeout(600);

  // **그 상태에서 수평선을 그으면 축 스냅이 걸린다**(s-6의 나머지 절반)
  const inkBox = (await page.locator("#ink").boundingBox())!;
  const drawPx = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(inkBox.x + x1, inkBox.y + y1);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++)
      await page.mouse.move(inkBox.x + x1 + (x2 - x1) * i / 8, inkBox.y + y1 + (y2 - y1) * i / 8);
    await page.mouse.up();
    await page.waitForTimeout(60);
  };
  // ⚠ **시작점을 아무 데나 잡으면 안 붙는다** — 앱은 시작점이 3D에 안 걸린 획을 **2D로
  // 대기**시킨다(D-L83 앵커 가드). 첫 판이 그렇게 재서 `axis: "free"`가 나왔고, 원장의
  // `unanchored_probe`가 그 실측이다(#30의 대조와 같은 자리 — 「고친 것」이 아니라
  // 「설계대로다」의 증거). 그러므로 **끝점 하나에서 출발한다.**
  // 자리는 **앱의 스냅 후보 목록이 정한다**(#17·#46) — 픽스처가 좌표를 지어내지 않는다.
  const probe = await page.evaluate(() => {
    const before = window.S2S.anchorGuard();
    return { before };
  });
  await drawPx(inkBox.width * 0.35, inkBox.height * 0.55,
               inkBox.width * 0.58, inkBox.height * 0.553);
  led.s_unanchored_probe = await page.evaluate((b) => {
    const d = window.S2S.doc();
    const s = d.strokes[d.strokes.length - 1];
    const g = window.S2S.anchorGuard();
    return { axis: s?.axis ?? null, has3d: !!s?.seg3d, note: window.S2S.snapNote(),
             unanchored_rejected_delta: g.unanchored_rejected - (b as any).unanchored_rejected };
  }, probe.before);

  // **끝점을 앱에게 묻는다** — 화면을 성기게 훑어 `endpoint` 후보의 화면 좌표를 받는다.
  const startAt = await page.evaluate(([w, h]) => {
    let best: { screen: number[]; dist: number } | null = null;
    for (let ix = 1; ix < 20; ix++) for (let iy = 1; iy < 14; iy++) {
      const p = [(w as number) * ix / 20, (h as number) * iy / 14];
      for (const c of window.S2S.snapCands(p) as any[])
        if (c.kind === "endpoint" && (!best || c.dist < best.dist))
          best = { screen: c.screen, dist: c.dist };
    }
    return best;
  }, [inkBox.width, inkBox.height]);
  led.s_start = startAt ? { ...startAt,
    dist_def: "`dist`는 **훑기 격자의 질의점 → 그 후보**까지의 거리(css px)다. "
      + "격자가 성기므로 «가장 가까운 격자점이 얼마나 빗나갔나»이지 정확도가 아니다. "
      + "`s_start_check.dist_px`와 **기준점이 달라 같은 양이 아니다**." } : null;
  // **#52의 검산** — `snapCands`(목록)와 `S2S.snap`(앱의 승자)이 같은 답을 내는가.
  // #52 본문이 지목한 것이 «하네스가 앱 필터를 다시 건다»이므로, 그 둘을 **그 자리에서**
  // 대조한다. `dist_px`는 질의점에서 후보까지의 화면 거리(css px)다.
  led.s_start_check = startAt ? await page.evaluate((p) => {
    const w = window.S2S.snap(p as number[]);
    const c = (window.S2S.snapCands(p as number[]) as any[])[0] ?? null;
    // **개입을 한 번 뒤집는다**(#52) — 끝점 종류를 끄면 답이 실제로 달라지는가.
    // 안 뒤집어 보면 «하네스가 앱 필터를 다시 걸어도 같은 답이 나오는» 자리와 안 갈린다.
    window.S2S.setOsnap({ kinds: { endpoint: false } });
    const wOff = window.S2S.snap(p as number[]);
    const cOff = (window.S2S.snapCands(p as number[]) as any[])[0] ?? null;
    window.S2S.setOsnap({ kinds: { endpoint: true } });
    return { app_winner_kind: w?.kind ?? null, cands_top_kind: c?.kind ?? null,
             same_kind: (w?.kind ?? null) === (c?.kind ?? null),
             dist_px_def: "**질의점 → 후보**(css px). 질의점이 `s_start.screen`(= 그 후보의 "
               + "자리)이므로 이 값이 0에 붙는 것은 **구성의 항등이다**(#5) — 크기로 읽지 "
               + "않는다. 여기서 재는 것은 «앱의 승자와 목록의 머리가 같은 종류인가»뿐이다.",
             dist_px: c?.dist ?? null,
             flip: { winner_kind_off: wOff?.kind ?? null, cands_top_kind_off: cOff?.kind ?? null,
                     changed: (wOff?.kind ?? null) !== (w?.kind ?? null),
                     note: "끝점 종류를 끄면 승자가 다른 종류로 바뀐다 — 하네스가 앱 필터를 "
                       + "**다시 걸고 있지 않다**는 증거다(#52의 검산 규약)." } };
  }, startAt.screen) : null;
  if (startAt) {
    // 그 끝점에서 **화면 수평**으로 긋는다. 면 탭 뒤라면 화면 수평이 곧 축이다(s-2).
    await page.mouse.move(inkBox.x + startAt.screen[0], inkBox.y + startAt.screen[1]);
    await page.waitForTimeout(60);
    await drawPx(startAt.screen[0], startAt.screen[1],
                 startAt.screen[0] + inkBox.width * 0.18, startAt.screen[1] + 0.5);
  }
  led.s_stroke = await page.evaluate(() => {
    const d = window.S2S.doc();
    const s = d.strokes[d.strokes.length - 1];
    const st = window.S2S.strokeStates().slice(-1)[0] ?? null;
    const note = window.S2S.snapNote();
    const pb = window.S2S.placeBy() as Record<string, number>;
    const sum = Object.values(pb).reduce((a, b) => a + b, 0);
    return s ? { axis: s.axis, has3d: !!s.seg3d, n_strokes: d.strokes.length,
                 state: st?.state ?? null, calc_axis: st?.axis ?? null,
                 note, guard: window.S2S.anchorGuard(), place_by: pb,
                 // **합 검산**(#43) — 놓인 수 + 대기 수 = 획 수여야 한다
                 place_sum: sum, pending: d.strokes.filter((x: any) => !x.seg3d).length,
                 sum_ok: sum + d.strokes.filter((x: any) => !x.seg3d).length === d.strokes.length,
                 // **수치는 필드가 든다**(#47) — 문구에서 «축과 N°»를 뽑아 수로 낸다
                 off_axis_deg: (() => {
                   const m = /축과 ([\d.]+)°/.exec(note ?? "");
                   return m ? Number(m[1]) : null;
                 })() } : null;
  });

  // ================= r · 렌즈 =================
  // **화면 좌표를 앱에게 묻는다**(#30의 양성 채널 — 1차 리뷰어 [3]). f만 숫자로 바뀌고
  // 렌더가 그것을 안 읽으면 `changed`·`geom_same`은 **그대로 통과한다**. 그래서 «같은
  // 끝점의 화면 자리»를 전후로 비교한다 — 자리는 `S2S.snapCands`(앱 경로)가 낸다.
  // **한 끝점을 지목해 그 화면 자리를 앱에게 묻는다**(#30의 양성 채널). 집합 비교는
  // 전후로 개수가 갈려 짝이 안 맞았다(첫 판의 `screen_move_px.why`가 그 실측이다) —
  // 그래서 **같은 획(`ofId`)의 끝점 하나**를 근방에서 다시 찾아 자리를 비교한다.
  /**
   * `near`에서 **가장 가까운 끝점의 화면 자리**를 앱에게 묻는다.
   * ⚠ `dist_from_near_px`는 **`near` ↔ 찾은 끝점**의 거리다 — 격자 질의점까지의 거리가
   * 아니다. 초판은 이것을 `d`라고만 적어 `s_start.dist`(질의점 ↔ 후보)와 **같은 이름의
   * 다른 양**이 됐다(2차 리뷰어 [10]·[11]). 이름과 정의를 여기 박는다.
   */
  const endAt = (near: number[], ofId?: string) => page.evaluate(([p, id]) => {
    let best: any = null;
    const P = p as number[];
    for (let dx = -15; dx <= 15; dx++) for (let dy = -15; dy <= 15; dy++)
      for (const c of window.S2S.snapCands([P[0] + dx * 8, P[1] + dy * 8]) as any[])
        if (c.kind === "endpoint" && (!id || c.ofId === id)) {
          const d = Math.hypot(c.screen[0] - P[0], c.screen[1] - P[1]);
          if (!best || d < best.dist_from_near_px)
            best = { dist_from_near_px: d, screen: c.screen, ofId: c.ofId ?? null };
        }
    return best;
  }, [near, ofId ?? null] as [number[], string | null]);
  const screenEnds = () => page.evaluate(([w, h]) => {
    // 화면을 성기게 훑어 **서로 다른 끝점의 화면 자리**를 모은다(0.01px로 반올림해 중복 제거).
    // f가 바뀌면 자리는 **주점 기준 배율**로 움직이므로 x 순서는 보존된다 — 그래서 정렬로
    // 짝이 맞는다(장면이 고정이라 개수도 고정이다. 개수가 달라지면 «못 쟀다»로 낸다).
    const seen = new Map<string, number[]>();
    for (let ix = 1; ix < 60; ix++) for (let iy = 1; iy < 40; iy++)
      for (const c of window.S2S.snapCands([(w as number) * ix / 60,
                                            (h as number) * iy / 40]) as any[])
        if (c.kind === "endpoint") {
          const p = [Math.round(c.screen[0] * 100) / 100, Math.round(c.screen[1] * 100) / 100];
          seen.set(`${p[0]},${p[1]}`, p);
        }
    return [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }, [inkBox.width, inkBox.height]);
  const ends0 = await screenEnds();
  // ⚠ **주점에서 먼 끝점을 고른다.** f를 바꾸면 화면 자리는 **주점 기준 배율**로 움직이므로
  // 주점 근처 점은 거의 안 움직인다 — 그 점을 고르면 양성 채널의 힘이 0에 가깝다
  // (첫 판이 화면 중앙 근처를 골라 1.04px이었다). 고르는 규칙을 원장에 적는다.
  const far0 = await page.evaluate(([pts]) => {
    const o = window.S2S.draftOverlay();
    const P = o?.principal ?? [640, 337.5];
    let best: number[] | null = null, bd = -1;
    for (const p of pts as number[][]) {
      const d = Math.hypot(p[0] - P[0], p[1] - P[1]);
      if (d > bd) { bd = d; best = p; }
    }
    return best ? { at: best, from_principal_px: Math.round(bd * 100) / 100, principal: P } : null;
  }, [ends0] as [number[][]]);
  const mark0 = far0 ? await endAt(far0.at) : null;
  const lens0 = await page.evaluate(() => window.S2S.lens());
  const geom0 = await page.evaluate(() =>
    window.S2S.doc().strokes.filter((s: any) => s.seg3d)
      .map((s: any) => s.seg3d.flat().map((v: number) => Math.round(v * 1e6) / 1e6)));
  const changed = await page.evaluate(() => window.S2S.setLensMm(24));
  await page.waitForTimeout(120);
  const lens1 = await page.evaluate(() => window.S2S.lens());
  const geom1 = await page.evaluate(() =>
    window.S2S.doc().strokes.filter((s: any) => s.seg3d)
      .map((s: any) => s.seg3d.flat().map((v: number) => Math.round(v * 1e6) / 1e6)));
  // **화면 투영은 바뀐다**(r-3) — 같은 3D를 지금 f로 다시 투영해 비교한다
  const proj = await page.evaluate(() => {
    const o = window.S2S.draftOverlay();
    return o ? { f: o.f, principal: o.principal } : null;
  });
  const ends1 = await screenEnds();
  // ⚠ `ofId`로 좁히면 못 찾을 때가 있다(첫 판이 `after: null`이었다) — **근방 최근접**으로
  // 찾고 `ofId`가 같은지는 **결과에 적어** 확인한다(좁히기와 확인을 갈라 둔다).
  const mark1 = mark0 ? await endAt(mark0.screen, mark0.ofId ?? undefined) : null;
  // 같은 수의 끝점이 나올 때만 짝을 맞춰 잰다(개수가 다르면 «못 쟀다»로 낸다 — #32)
  const screenMove = ends0.length && ends0.length === ends1.length
    ? { n: ends0.length,
        max_px: Math.max(...ends0.map((p, i) =>
          Math.hypot(p[0] - ends1[i][0], p[1] - ends1[i][1]))),
        min_px: Math.min(...ends0.map((p, i) =>
          Math.hypot(p[0] - ends1[i][0], p[1] - ends1[i][1]))) }
    : { n: null, max_px: null, min_px: null, why: "끝점 수가 전후로 달라 짝을 못 맞춘다" };
  // **역방향도 돈다**(r-2) — 화각으로 넣으면 mm이 따라온다
  const byFov = await page.evaluate(() => {
    const ok = window.S2S.setLensFovDeg(90);
    return { ok, lens: window.S2S.lens() };
  });
  await page.evaluate(() => window.S2S.setLensMm(24));     // 되돌린다(#53 — 뒤 팔의 기준선)
  await page.waitForTimeout(80);
  // **패널이 실제로 열리고 두 수가 화면에 보이는가**(r-2·r-5의 «보인다»)
  const lensUi = await page.evaluate(() => {
    window.S2S.openLens(true);
    const mm = document.querySelector<HTMLInputElement>('#views input[data-lens-mm][type=number]');
    const fov = document.querySelector<HTMLInputElement>("#views input[data-lens-fov]");
    const vis = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null;
    const r = { mm_shown: vis(mm), fov_shown: vis(fov),
                mm_value: mm?.value ?? null, fov_value: fov?.value ?? null };
    window.S2S.openLens(false);
    return r;
  });
  // **확정 시점으로 돌아오면 원래 f다**(r-4)
  await page.evaluate(() => window.S2S.returnToDraft());
  await page.waitForTimeout(700);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(200);
  const lens2 = await page.evaluate(() => window.S2S.lens());
  // **자리도 잰다**(r-5: "큐브 옆이나 시점 패널" · "작도 중에는 안 보이거나 비활성").
  // 셋을 낸다 — 어느 패널에 있는가 · 큐브 아래인가 · 확정 시점에서 비활성인가.
  led.r_place = await page.evaluate(() => {
    const b = document.querySelector<HTMLButtonElement>("#views [data-lens-open]");
    const cube = document.getElementById("cube")!.getBoundingClientRect();
    const r = b?.getBoundingClientRect();
    return { in_views_panel: !!b, in_bar: !!document.querySelector("#bar [data-lens-open]"),
             below_cube: !!r && r.top >= cube.bottom,
             disabled_at_confirm: b?.disabled ?? null, label: b?.textContent ?? null };
  });
  led.r_lens = {
    before: lens0, changed, after: lens1, back_at_confirm: lens2, proj_after: proj,
    screen_move_px: screenMove, by_fov: byFov, ui: lensUi,
    // **지목한 끝점 하나가 화면에서 얼마나 움직였나**(px) — 0이면 렌더가 새 f를 안 읽은 것이다
    marked_end: { pick_rule: "**주점에서 가장 먼 끝점**을 고른다 — f 변경은 주점 기준 "
                    + "배율이라 주점 근처 점은 거의 안 움직인다(그 점을 고르면 이 팔이 "
                    + "아무 힘도 못 낸다). 고른 점의 주점 거리는 `picked_from_principal_px`다.",
                  picked_from_principal_px: far0?.from_principal_px ?? null,
                  principal: far0?.principal ?? null,
                  before: mark0, after: mark1,
                  def: "`before`는 화면 중앙에서 가장 가까운 끝점, `after`는 **그 끝점의 "
                    + "옛 자리**에서 가장 가까운 같은 획(`ofId`)의 끝점이다. "
                    + "`dist_from_near_px`는 각 질의 기준점까지의 거리이고 **둘이 다른 "
                    + "기준점**이라 서로 비교하지 않는다. ⚠ `after.dist_from_near_px`와 "
                    + "`moved_px`는 **같은 양이다**(둘 다 옛 자리 ↔ 새 자리) — 독립 확인 "
                    + "둘이 아니다. 판정에 쓰는 것은 `moved_px`와 `same_stroke` 둘이다.",
                  same_stroke: !!mark0 && !!mark1 && mark0.ofId === mark1.ofId,
                  moved_px: mark0 && mark1
                    ? Math.round(Math.hypot(mark0.screen[0] - mark1.screen[0],
                                            mark0.screen[1] - mark1.screen[1]) * 100) / 100
                    : null },
    geom_same: JSON.stringify(geom0) === JSON.stringify(geom1),
    geom_n: (geom0 as unknown[]).length,
  };

  // ================= t · 오스냅 패널 =================
  await page.setViewportSize({ width: 500, height: 900 });
  await page.waitForTimeout(120);
  const tBefore = await page.evaluate(() => {
    const bar = document.getElementById("bar")!;
    return { kinds: bar.querySelectorAll("[data-osnap-kind]").length,
             overflow_px: Math.round(bar.scrollWidth - bar.clientWidth) };
  });
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('#bar button[data-act="osnap"]')!.click());
  await page.waitForTimeout(120);
  const tAfter = await page.evaluate(() => {
    const bar = document.getElementById("bar")!;
    const br = bar.getBoundingClientRect();
    const ks = [...bar.querySelectorAll<HTMLElement>("[data-osnap-kind]")];
    // **두 축 다 본다** — 줄바꿈 뒤에는 세로로 밀릴 수도 있다
    const vis = ks.filter(k => { const r = k.getBoundingClientRect();
      return r.left >= br.left - 0.5 && r.right <= br.right + 0.5
          && r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5; });
    return { kinds: ks.length, visible: vis.length,
             overflow_px: Math.round(bar.scrollWidth - bar.clientWidth),
             rows: new Set(ks.map(k => Math.round(k.getBoundingClientRect().top))).size };
  });
  // **한 폭으로 «어느 폭에서도»를 말하지 않는다**(#12 — 1차 리뷰어 [7]). 더 좁은 폭을
  // 하나 더 본다. ⚠ `visible`은 **가로·세로 둘 다** 상자 안인지를 본다 — 줄바꿈 뒤에
  // 세로로 밀리는 경우가 판정에 들어 있다(`max-height:40vh`가 그 한계다).
  const measurePanel = async (w: number, h: number) => {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(140);
    return page.evaluate(() => {
      const bar = document.getElementById("bar")!;
      const br = bar.getBoundingClientRect();
      const ks = [...bar.querySelectorAll<HTMLElement>("[data-osnap-kind]")];
      const vis = ks.filter(k => { const r = k.getBoundingClientRect();
        return r.left >= br.left - 0.5 && r.right <= br.right + 0.5
            && r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5; });
      return { kinds: ks.length, visible: vis.length,
               overflow_px: Math.round(bar.scrollWidth - bar.clientWidth),
               overflow_y_px: Math.round(bar.scrollHeight - bar.clientHeight),
               rows: new Set(ks.map(k => Math.round(k.getBoundingClientRect().top))).size };
    });
  };
  // **t-2 — 패널이 메뉴 접힘 안에 남아 있는가**(지시 t-2: 「버튼만 나오고 패널은 안
  // 나왔을 수 있다」). 「표시·스냅 ▾」을 **닫은 채로** 종류 여덟이 나오는지 본다.
  const tFold = await page.evaluate(() => {
    const menu = document.querySelector<HTMLButtonElement>('#bar button[data-act="menu"]')!;
    const wasOpen = menu.classList.contains("on");
    if (wasOpen) menu.click();                       // 접는다
    const folded = [...document.querySelectorAll<HTMLElement>("#bar [data-osnap-kind]")]
      .filter(k => k.offsetParent !== null).length;
    const btnVisible = !!document.querySelector<HTMLElement>('#bar button[data-act="osnap"]')
      ?.offsetParent;
    const auxFolded = !!document.querySelector<HTMLElement>('#bar button[data-act="aux"]')
      ?.classList.contains("folded");
    if (wasOpen) menu.click();
    return { menu_was_open: wasOpen, kinds_visible_with_menu_folded: folded,
             osnap_button_visible_with_menu_folded: btnVisible,
             aux_button_is_folded: auxFolded,
             note: "보조 소실점 쪽은 `BAR_MENU.open && AUX.open`을 요구한다(그래서 "
               + "`aux_button_is_folded`가 참이다). 오스냅에 같은 조건이 남았는지가 t-2다." };
  });
  const tNarrow = await measurePanel(360, 760);
  await page.setViewportSize({ width: 500, height: 900 });
  await page.waitForTimeout(140);
  led.t_panel = { viewport: [500, 900], closed: tBefore, open: tAfter, narrow_360: tNarrow,
                  fold_t2: tFold,
                  visible_def: "버튼 상자가 `#bar` 상자 안에 **가로·세로 둘 다** 들어가는가",
                  reproduced_before_fix: { kinds: 8, visible: 4, overflow_px: 948 } };

  const full = {
    what: "렌즈 조절(r) · 큐브 정렬의 롤 0(s) · 오스냅 패널(t)이 앱에서 도는가.",
    how: {
      s: "참 소실점 3점 픽스처를 확정하고 **큐브 면을 실제로 탭**한다(#17). 값은 축 셋의 "
        + "**화면 방향**(도)이고, 판정은 «가장 가까운 직교 방향에서 벗어난 각»이다(#49 — "
        + "1점 투시가 요구하는 것이 그것이다).",
      r: "정렬 시점에서 `setLensMm(24)`을 부르고 **그린 선의 3D 좌표**를 전후로 비교한다"
        + "(r-3: 안 움직여야 한다). 그다음 확정 시점으로 돌아가 f가 복귀하는지 본다(r-4).",
      t: "**좁은 뷰포트(500px)** 에서 종류 버튼 여덟이 다 보이는가. 가로·세로 둘 다 본다 — "
        + "줄바꿈 뒤에는 세로로 밀릴 수도 있다.",
    },
    what_this_does_not_say: [
      "dpr 1 · 마우스 합성 · 픽스처 하나다(#12·#21).",
      "**r-4의 «원래 f로 복귀»는 설계 보장이다**(#5) — `pinTo`가 `freeIntr`를 비운다. "
      + "값이 아니라 배선을 확인한다. 측정인 것은 `changed`(정렬 시점에서 실제로 바뀌는가)와 "
      + "`geom_same`(3D가 안 움직이는가)이다.",
      "**렌즈를 바꾼 화면이 «옳은가»는 안 잰다** — 카메라 조작이므로 옳고 그름이 없다. "
      + "재는 것은 «형상이 안 따라 움직인다»뿐이다.",
      "s의 판정은 **축 방향**이지 칠해진 픽셀이 아니다(#17의 그 한계 그대로).",
      "**s_stroke의 시작점은 픽스처가 안 정했다**(#46) — 앱의 스냅 후보에서 고른 끝점이다. "
      + "그 앞의 `s_unanchored_probe`는 **안 붙은 시작점**의 실측이고, 그것이 `free`로 "
      + "대기하는 것은 **설계다**(D-L83 앵커 가드) — 이 항목이 고칠 것이 아니다.",
      "t는 **폭 둘(500·360px)** 이다. 더 좁은 폭·다른 글꼴 크기는 안 쟀다.",
      "**윗면·아랫면 축퇴(s-3)에 도달하지 못했다** — `s_roll.top_reached`가 거짓이고 "
      + "`top_attempts`가 시도 둘을 든다. `snapToDir`의 그람-슈밋 갈래는 **안 덮인다**(#32).",
      "**s-5(새 절차의 지평선이 정한 기준계와 큐브 정렬이 같은 값을 쓰는가)는 안 쟀다** — "
      + "코드는 `drawnBasisThree()` 하나를 쓰지만 그것은 **배선의 주장**이고 이 원장에 "
      + "대조가 없다.",
      "**r-2의 역방향은 함수 수준까지만 쟀다**(`by_fov`) — 화각 입력 칸을 사람이 고쳐서 "
      + "mm이 따라오는지는 DOM 값(`ui.fov_value`)까지이고 **입력 사건은 안 던졌다**.",
    ],
    selfcheck_notes: {
      off_ortho_zero: "`s_roll.off_ortho_deg`가 0인 것이 **이 항목이 고친 것**이다 — "
        + "수리 전 값 `reproduced_before_fix`(−8.7·−98.7)가 그 대조다(#30). "
        + "⚠ **수리가 든 뒤에는 이 0이 구성의 귀결에 가깝다**(#5): `cam.up`을 그린 Y로 "
        + "세우고 시선을 면 법선에 맞추면 축의 상은 정확히 직교한다. 그러므로 이 0이 "
        + "재는 것은 «각도»가 아니라 **배선이 그 자리에 있는가**이고, 정보량은 "
        + "«수리 전 8.7° ↔ 수리 후 0»의 대조에서 나온다. **항등이 아닌 값은 따로 있다**: "
        + "손으로 그은 획의 `s_stroke.off_axis_deg`(0.1°)와 "
        + "`r_lens.marked_end.moved_px`(12.59px)가 그것이다.",
      zeros_are_the_point: "이 원장에는 **0이 많다** — `more_off_ortho_deg`·"
        + "`more_vertical_off_ortho_deg`·`return_judge.pitchDeg`·`returnDir[1]`. "
        + "전부 **이 항목이 0으로 만든 양**이거나 **정의상 0인 성분**(1점 복귀 방향의 y는 "
        + "0이다 — 시선이 수평이어야 하므로)이다. 자동 검사의 «카운터 0» 플래그는 그 "
        + "자리들이고, 정보량은 **수리 전 8.7°와의 대조**·**시점이 실제로 움직였다는 "
        + "`more_gaze_moved_deg`**가 든다.",
      more_points_zero: "모서리·꼭짓점·윗면 시도의 `more_vertical_off_ortho_deg`도 0이다. "
        + "**탭이 실제로 시점을 옮겼다는 증거를 함께 낸다**(`more_gaze_moved_deg` "
        + "44.4·54.6·144.1도) — 초판은 눈대중 좌표라 `cubeHit`이 `null`을 냈고 시점이 "
        + "안 움직였는데도 0이 나왔다. 그때의 0은 수리의 증거가 아니었다.",
      geom_same_true: "`r_lens.geom_same`이 참인 것은 **설계 보장에 가깝다**(f는 투영만 "
        + "바꾼다) — 그래도 잰다: 옛 판에서 f 조절이 형상을 건드린 적이 있었기 때문이 아니라, "
        + "**이번에 새로 만든 경로**라 배선이 실제로 그런지 확인이 필요하다.",
    },
    ...led,
    summary: {
      s_off_ortho_deg: (led.s_roll as any).off_ortho_deg,
      s_stroke_axis: (led.s_stroke as any)?.axis ?? null,
      s_stroke_off_axis_deg: (led.s_stroke as any)?.off_axis_deg ?? null,
      s_stroke_note: (led.s_stroke as any)?.note ?? null,
      s_more_vertical_off_ortho_deg: (led.s_roll as any).more_vertical_off_ortho_deg,
      s_top_reached: (led.s_roll as any).top_reached,
      r_screen_moved_px: (led.r_lens as any).marked_end.moved_px,
      s_unanchored_axis: (led.s_unanchored_probe as any)?.axis ?? null,
      r_changed: (led.r_lens as any).changed,
      r_mm_before: Math.round((led.r_lens as any).before.mm),
      r_mm_after: Math.round((led.r_lens as any).after.mm),
      r_geom_same: (led.r_lens as any).geom_same,
      r_back_mm: Math.round((led.r_lens as any).back_at_confirm.mm ?? 0),
      r_adjustable_at_confirm: (led.r_lens as any).back_at_confirm.adjustable,
      r_place: (led.r_place as any).in_views_panel && (led.r_place as any).below_cube
        && (led.r_place as any).disabled_at_confirm ? "views_panel_below_cube_disabled" : "?",
      t_visible: `${(led.t_panel as any).open.visible}/${(led.t_panel as any).open.kinds}`,
      t_overflow_px: (led.t_panel as any).open.overflow_px,
      t_rows: (led.t_panel as any).open.rows,
      t_visible_360: `${(led.t_panel as any).narrow_360.visible}/${(led.t_panel as any).narrow_360.kinds}`,
    },
    gate: {
      // ⚠⚠ **조항을 두 갈래로 가른다**(#5 — 2차 리뷰어 [12]). 보장이라 적어 놓고 임계를
      // 거는 것은 규칙 위반이므로, **무엇이 측정이고 무엇이 배선 확인인지** 여기 박는다.
      // 배선 조항의 통과는 «값이 좋다»가 아니라 «그 줄이 아직 그 자리에 있다»는 뜻이다.
      clause_kinds: {
        wiring: ["`s_off_ortho_deg` 전부 0(축퇴 아닌 축)", "`r_geom_same`"],
        measurement: ["`more_gaze_moved_deg`(탭이 시점을 옮겼다)",
                      "`s_stroke.axis`(손으로 그은 획이 축에 붙는다)",
                      "`r_lens.marked_end.moved_px`(화면이 실제로 움직인다)",
                      "`t_visible`·`t_visible_360`(좁은 폭에서 여덟이 보인다)",
                      "`t_panel.fold_t2`(접힘 뒤에도 나온다)"],
        why_wiring_still_asserted: "**보장에는 임계를 안 건다**(CLAUDE.md §5.1)는 «크기를 "
          + "재지 않는다»는 뜻이고, 배선이 빠졌는지 보는 회귀 검사까지 금지하는 것이 "
          + "아니다. 그래서 두 조항은 **0인가만** 보고 «얼마나 작은가»로 읽지 않는다. "
          + "`back_at_confirm`(복귀)을 게이트에서 뺀 것과 갈리는 이유가 이것이다 — "
          + "그것은 **되돌릴 배선 자체가 없고**(`pinTo`가 값을 안 들고 있다) 값 대조만 남는다.",
      },
      registered: "면 탭 뒤 축이 화면 직교에 정확히 온다(`s_off_ortho_deg` 전부 0) · "
        + "모서리·꼭짓점·「작도 시점으로」에서 **세로축이 화면 수직**이다"
        + "(`more_vertical_off_ortho_deg` 전부 0, 그 탭들이 시선을 44~144° 옮긴다) · "
        + "그 상태에서 **끝점에서 그은 화면 수평선이 축에 붙는다**(`s_stroke_axis`) · "
        + "렌즈를 바꾸면 **화면은 움직이고 3D는 안 움직인다**"
        + "(`r_lens.marked_end.moved_px` > 0 · `r_geom_same`) · "
        + "좁은 뷰포트 둘(500·360px)에서 종류 여덟이 다 보인다(`t_visible`·`t_visible_360`).",
      // **다지표 게이트에는 지표마다 도달 가능성을 적는다**(#28·#40 ⑥ — 하나만 강제하면
      // 나머지는 «안 물었다»가 된다). 셋을 따로 든다.
      reachability: "s — 수리 전 실측이 원장 안에 있다(`reproduced_off_ortho_max_deg` 8.7°). "
        + "t — 수리 전 실측 4/8(`t_panel.reproduced_before_fix.visible`). "
        + "r — **옛 판에 경로 자체가 없었다**(조절 수단 없음)이므로 «수리 전 값»이 없다. "
        + "대신 **양성 채널**이 든다: 렌즈를 바꾸면 지목한 끝점이 화면에서 실제로 움직인다"
        + "(`marked_end.moved_px`) — 0이면 렌더가 새 f를 안 읽은 것이고 그때 이 게이트는 깨진다.",
      reachability_source: "s_roll/reproduced_off_ortho_max_deg",
      reachability_value: null as unknown,
      reachability_t_source: "t_panel/reproduced_before_fix/visible",
      reachability_t_value: 4,
      reachability_r_absent: "r은 수리 전 대조가 **원리적으로 없다**(경로가 없었다). "
        + "그 자리를 `marked_end.moved_px`(양성 채널)가 대신한다 — 값은 원장이 든다.",
    },
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  (full.gate as any).reachability_value = (led.s_roll as any).reproduced_off_ortho_max_deg;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "lens_roll_osnap.json"), JSON.stringify(full, null, 1));

  // ---- s: 면 탭 뒤 화면 가로·세로가 축이다(지시 s-2·s-6)
  for (const d of (led.s_roll as any).off_ortho_deg as (number | null)[]) {
    if (d == null) continue;
    expect(d).toBeLessThan(0.05);
  }
  // ---- s: 모서리·꼭짓점·「작도 시점으로」에서 **세로축이 화면 수직**이다(롤 0의 내용)
  // ⚠ 임계가 둘이다: 큐브 탭은 **절대 자세 스냅**이라 잔차가 없다(0.05°) — 「작도
  // 시점으로」는 `return_residual`이 적은 0.1~0.2°가 축 방향으로 옮겨지므로 1°로 둔다.
  // **느슨하게 한 것이 아니라 다른 양이다**: 큐브 탭에 1°를 쓰면 그 경로의 회귀를 놓친다.
  for (const [k, v] of Object.entries((led.s_roll as any).more_vertical_off_ortho_deg)) {
    if (v == null) continue;
    expect(v as number, `세로축 롤 — ${k}`).toBeLessThan(k === "return_to_draft" ? 2 : 0.05);
  }
  for (const [k, arr] of Object.entries((led.s_roll as any).more_off_ortho_deg)) {
    for (const v of (arr as (number | null)[]) ?? []) {
      if (v == null) continue;
      expect(v, `축퇴 아닌 축의 직교 이탈 — ${k}`).toBeLessThan(k === "return_to_draft" ? 2 : 0.05);
    }
  }
  // 그 탭들이 **실제로 시점을 옮겼는가**(#30 — 안 옮겼으면 0°는 아무것도 안 잰다)
  for (const k of ["edge", "vertex"]) {
    expect((led.s_roll as any).more_gaze_moved_deg[k], `${k} 탭이 시점을 옮겼는가`)
      .toBeGreaterThan(5);
  }
  // 「작도 시점으로」는 **그린 기준계에서** 피치가 접힌다(s-4).
  // ⚠ **정확히 0은 아니다** — `return_residual`이 그 사실과 «애니메이션이 아니다»의
  // 근거를 든다. 원인은 **모른다**. 여기서는 그 잔차가 1° 안임을 건다.
  expect(Math.abs((led.s_roll as any).return_judge?.pitchDeg ?? 99)).toBeLessThan(1);
  expect((led.s_roll as any).more_gaze_moved_deg.return_to_draft,
         "「작도 시점으로」가 실제로 시점을 옮겼는가").toBeGreaterThan(5);
  // ---- s: 그 상태에서 그은 수평선이 축에 붙는다
  expect((led.s_stroke as any)?.axis).not.toBe("free");
  expect((led.s_stroke as any)?.sum_ok, "놓인 수 + 대기 수 = 획 수(#43)").toBe(true);
  // ---- r: 정렬 시점에서 바뀌고, 3D는 안 움직인다(r-3)
  expect((led.r_lens as any).changed).toBe(true);
  expect((led.r_lens as any).geom_n).toBeGreaterThan(0);
  expect((led.r_lens as any).geom_same).toBe(true);
  // **양성 채널** — 3D가 안 움직이는 동안 **화면은 움직였다**(#30). 이것이 없으면
  // 「f 숫자만 바뀌고 렌더는 안 읽는다」와 갈리지 않는다.
  expect((led.r_lens as any).marked_end.same_stroke).toBe(true);
  expect((led.r_lens as any).marked_end.moved_px).toBeGreaterThan(1);
  // **역방향도 돈다**(r-2) — 화각 90°를 넣으면 화각이 90°가 된다
  expect((led.r_lens as any).by_fov.ok).toBe(true);
  expect((led.r_lens as any).by_fov.lens.fovDeg).toBeCloseTo(90, 6);
  // **두 수가 화면에 보인다**(r-2)
  expect((led.r_lens as any).ui.mm_shown).toBe(true);
  expect((led.r_lens as any).ui.fov_shown).toBe(true);
  expect(Math.round((led.r_lens as any).after.mm)).toBe(24);
  // ---- r: 확정 시점에서는 **조절 대상이 아니다**(r-1) — 그리고 f가 원래대로다(r-4)
  expect((led.r_lens as any).back_at_confirm.adjustable).toBe(false);
  // ---- r-5: 시점 패널 안 · 큐브 아래 · 작도(확정) 시점에서 **비활성**
  expect((led.r_place as any).in_views_panel).toBe(true);
  expect((led.r_place as any).in_bar).toBe(false);
  expect((led.r_place as any).below_cube).toBe(true);
  expect((led.r_place as any).disabled_at_confirm).toBe(true);
  expect((led.r_lens as any).back_at_confirm.mm)
    .toBeCloseTo((led.r_lens as any).before.mm, 6);
  // ---- t: 좁은 뷰포트에서도 여덟이 다 보인다(지시 t-4)
  expect((led.t_panel as any).open.kinds).toBe(8);
  expect((led.t_panel as any).open.visible).toBe(8);
  expect((led.t_panel as any).open.overflow_px).toBeLessThanOrEqual(0);
  // 더 좁은 폭(360px)에서도 여덟이 다 보인다 — 한 폭으로 «어느 폭에서도»를 말하지 않는다
  expect((led.t_panel as any).narrow_360.visible).toBe(8);
  // ---- t-2: 「표시·스냅 ▾」을 접어도 종류 여덟이 나온다(보조 VP와 달리 접힘 조건이 없다)
  expect((led.t_panel as any).fold_t2.kinds_visible_with_menu_folded).toBe(8);
  expect((led.t_panel as any).fold_t2.osnap_button_visible_with_menu_folded).toBe(true);
});
