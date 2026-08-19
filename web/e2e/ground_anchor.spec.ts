// **첫 앵커 — 지면 배치 종단**(2026-08-19 13차 항목 2).
//
// 실획 15-16-18이 드러낸 구멍의 회귀 팔이다: 보조선을 **길게 긋고 가운데서 가로지르는**
// 스타일(끝점 접합 없음)로 카메라를 세우면, 옛 앱은 일괄 풀이가 교점 0으로 아무것도 못
// 올렸고(D-L83이 확정 경로를 옳게 막아) 3D가 영원히 비었다(`first_anchor.json`의 재현 팔).
//
// 재는 것:
//   ⓪ **경로 끔 대조 팔**(#30 — D-L83 `setAnchorGuard` 선례 · 13차 1·2 리뷰어 [4·1]):
//      같은 입력·같은 앱에서 `S2S.setGroundAnchor(false)`면 lifted 0 — "수리 전 거동"의
//      실측이고, 이 팔이 게이트 도달 가능성의 대조다.
//   ① **소실점을 만든 선들만 그은 상태에서 3D가 선다**(지시 2-d) — 가로선 + 깊이선 셋
//      (확정은 세 번째 깊이선이 한다 — resolvePool), 전부 몸통 교차. 확정 순간
//      placeBy.ground로 올라간다(batch 0 — 접합이 없으므로).
//   ② **교차 앵커가 연쇄를 잇는다**(지시 2-c) — 지면 획의 상을 가로지르는 수직선이
//      cross_anchor로 올라간다. 두 기전이 맞물리는 것의 종단이다.
//   ③ **지평선 위 획은 지면에 안 간다**(A-3 — 애매하면 놓지 않는다): 확정 뒤 허공의
//      가로선은 dir 대기로 남는다(첫 앵커 뒤에는 ground 경로 자체가 안 돈다 — D-L84 ③).
//   ④ **placeBy 합 = lifted**(#43 — 세 팔 전부에서 검산한다. 이 검산이 실제로
//      확정 획의 이중 배치(자기 양 끝 스냅 재배치)를 잡았다 — 리뷰어 [1]).
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { gate } from "../test/gate.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("지면 첫 앵커 — 몸통 교차 보조선으로 세운 카메라가 3D를 낸다 (13차 항목 2)", async ({ page }) => {
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
  const states = () => page.evaluate(() => {
    const pb = window.S2S.placeBy();
    const lifted = window.S2S.doc().strokes.filter((s: any) => s.seg3d).length;
    const sum = pb.ref_anchor + pb.start_anchor + pb.two_point + pb.end_anchor
              + pb.cross_anchor + pb.batch + pb.ground + pb.extension + pb.unanchored;
    return { lifted, placeBy: pb, place_sum: sum, states: window.S2S.strokeStates() };
  });
  /** 몸통 교차 확정 재료 — 가로선 + 같은 소실점(0.52W, 0.40H)을 향한 깊이선 셋.
   *  ⚠ 14차 D-L96: 가로선이 정확히 수평(직교 스냅 = 선언)이라 **깊이선 2가 확정자**다
   *  (11-1 복원 — 13차 작성 시점에는 셋째가 확정자였다). 깊이선 3은 확정 **뒤의** 획이고,
   *  가로선(이미 3D)을 몸통에서 가로지르므로 **교차 앵커 연쇄**(13차 항목 3 경로)로 오른다. */
  const drawConfirm = async () => {
    await drawPx(0.15 * W, 0.65 * H, 0.85 * W, 0.65 * H);           // 가로선(지면 격자)
    await drawPx(0.22 * W, 0.72 * H, 0.42 * W, 0.5067 * H);         // 깊이선 1 → VP
    await drawPx(0.85 * W, 0.75 * H, 0.62 * W, 0.5061 * H);         // 깊이선 2 → VP(확정자 — D-L96)
    await drawPx(0.40 * W, 0.78 * H, 0.46 * W, 0.59 * H);           // 깊이선 3 → VP(확정 뒤·교차 연쇄)
  };
  const led: Record<string, unknown> = {};

  // ---- ⓪ **경로 끔 대조 팔**(#30) — 같은 입력에서 수리 전 거동: 아무것도 안 오른다
  await page.evaluate(() => window.S2S.setGroundAnchor(false));
  await drawConfirm();
  led.ground_off = await states();
  expect((led.ground_off as any).lifted).toBe(0);
  expect((led.ground_off as any).place_sum).toBe(0);
  // 비우고(문서·카메라 리셋) 경로를 켠다 — placeBy는 누계이나 이 팔은 0이라 안 섞인다
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('#bar button[data-act="clear"]')!.click();
    window.S2S.setGroundAnchor(true);
  });
  await page.waitForTimeout(60);

  // ---- ① 같은 입력, 경로 켬 — 확정 순간 지면 첫 앵커로 오른다
  await drawConfirm();
  led.confirmed = await states();
  // **회귀 단언(지시 2-d)** — 값은 원장 arms가 든다(#47). ⚠ 14차 D-L96 개정: 확정이
  // 둘째 깊이선에서 나므로 조건은 "확정 순간의 풀은 전부 ground 경로 + 확정 뒤 도착한
  // 깊이선 3은 교차 앵커 연쇄 + batch 0"이다(옛 조건 "전부 ground"는 셋째-확정자 시절).
  expect((led.confirmed as any).lifted).toBeGreaterThan(0);
  expect((led.confirmed as any).placeBy.ground).toBeGreaterThan(0);
  expect((led.confirmed as any).placeBy.ground + (led.confirmed as any).placeBy.cross_anchor)
    .toBe((led.confirmed as any).lifted);
  expect((led.confirmed as any).placeBy.cross_anchor).toBe(1);      // 깊이선 3 — 연쇄 경로
  expect((led.confirmed as any).placeBy.batch).toBe(0);
  expect((led.confirmed as any).place_sum).toBe((led.confirmed as any).lifted);   // ④ #43

  // ---- ② 교차 앵커 연쇄(지시 2-c) — 지면 획들을 가로지르는 수직선. 끝점 겨냥 없음.
  const liftedBefore = (led.confirmed as any).lifted;
  await drawPx(0.5 * W, 0.30 * H, 0.5 * W, 0.75 * H);
  led.chained = await states();
  expect((led.chained as any).lifted).toBe(liftedBefore + 1);
  expect((led.chained as any).placeBy.cross_anchor).toBeGreaterThanOrEqual(1);
  expect((led.chained as any).place_sum).toBe((led.chained as any).lifted);       // ④ #43

  // ---- ③ 지평선 위 무연결 가로선 — 지면에 못 가고(광선이 지면을 안 만난다) 첫 앵커
  //      뒤라 ground 경로도 안 돈다. dir 대기가 명세다(D-L84 ③).
  await drawPx(0.2 * W, 0.15 * H, 0.4 * W, 0.15 * H);
  led.air = await states();
  expect((led.air as any).lifted).toBe((led.chained as any).lifted);
  expect((led.air as any).placeBy.ground).toBe((led.confirmed as any).placeBy.ground);
  expect((led.air as any).place_sum).toBe((led.air as any).lifted);               // ④ #43
  {
    const st = (led.air as any).states;
    expect(st[st.length - 1].state).toBe("dir");
  }

  // ---- 원장
  const recovered = (led.confirmed as any).lifted - (led.ground_off as any).lifted;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "ground_anchor.json"), JSON.stringify({
    spec: "지면 첫 앵커 종단(13차 항목 2) — 경로 끔 대조 · 몸통 교차 확정 · 교차 앵커 연쇄 · 허공 대기 · 합=전체(#43)",
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
    why: "실획 15-16-18(카메라 섰는데 seg3d 0/13 — first_anchor.json)의 회귀 팔. "
       + "일괄 풀이의 접합(끝점 근접)이 몸통 교차 스타일을 못 쓰므로, 확정 순간 수평 평면 축 "
       + "보조선을 지면에 놓는 첫 앵커 경로(groundAnchor.ts)를 13차 항목 2가 넣었다. "
       + "양성 채널은 ⓪↔① 짝이다(#30 — 같은 입력·경로 토글만 다름).",
    what_this_does_not_say: [
      "**옳음(참값 대비)을 여기서 재지 않는다**(#15·#16) — 이 원장은 배치 수와 경로만 센다. "
      + "지면 전제가 틀린 획(허공·상자 윗면의 수평선)의 조용히 틀린 깊이는 "
      + "first_anchor.json의 ground_truth 팔이 합성 참값으로 잰다.",
      "**동작점이 하나다**(#12) — 구도 한 종류(2점 계열·피치 0)·확정 재료 한 벌이다. 스윕을 안 돌렸다.",
      "arms의 lifted·ground 값은 **픽스처가 정하는 수**다(#46) — 판정은 값의 크기가 아니라 "
      + "조건(전부 ground 경로·합=전체·끔 팔 0)이다.",
    ],
    arms: led,
    /** ⓪↔①의 차 — 이 수리가 같은 입력에서 연 배치 수(#30의 짝 대조). */
    recovered_by_ground: recovered,
    gate: gate({
      registered: "⓪ 끔 팔에서 lifted 0 · ① 켬 팔에서 ground > 0·ground + cross_anchor == "
                + "lifted·cross_anchor == 1(확정 뒤 도착한 깊이선 3 — 14차 D-L96으로 확정자가 "
                + "둘째 깊이선이 되면서 조건 개정: 옛 '전부 ground'는 셋째-확정자 시절)·batch 0 "
                + "· ② 연쇄 팔에서 cross_anchor ≥ 1이 켬 팔 lifted에 +1 · ③ 허공 팔에서 ground "
                + "불변·마지막 획 dir 대기 · ④ 모든 팔에서 placeBy 합 == lifted(#43). "
                + "값은 arms가 든다(#47 — 산문에 수를 안 박는다)",
      reachability: "도달 가능성은 ⓪↔① **짝 대조**다(#30 · 13차 1·2 리뷰어 [4·1]) — 같은 "
                  + "입력·같은 앱에서 경로 토글만 다르고, 끔 팔 0 → 켬 팔 >0이 이 경로가 여는 "
                  + "양이다. ⚠ 값(recovered_by_ground)은 픽스처가 정하는 수다(#46) — 크기가 "
                  + "아니라 0에서 양수로의 전이가 판정이다(reachability_value_fixture_determined)",
      reachability_value: recovered,
      reachability_value_fixture_determined: true,
      reachability_source: "recovered_by_ground",
      note: "이 항목이 걸리는 번호: #30(짝 대조) · #43(합=전체 — 실제로 확정 획의 이중 배치를 "
          + "잡았다) · #46(픽스처 결정값) · #12(동작점 하나)",
    }),
    page_errors: errors,
  }, null, 2), "utf-8");
  expect(errors).toEqual([]);
});
