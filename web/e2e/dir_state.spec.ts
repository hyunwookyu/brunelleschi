// **방향 확정 상태 종단**(2026-08-18 10차 항목 1 — 지시 4-1~4-4·4-6).
//
// 재는 것:
//   ① 세 상태가 계산으로 나온다 — 카메라 전 none / 확정 뒤 무연결 dir / 놓이면 coord (4-1)
//   ② 방향 확정 획의 무한직선이 실제로 그려진다 — 연장부 픽셀 > 0 · 빗나간 점 0 (4-2)
//   ③ 연결이 좌표를 정하고 연쇄한다 — V(시작 앵커) → D(끝점 접합) → F(**기록된 연결**) (4-3)
//   ④ 끝점 연결로도 올라간다 — 옛 연쇄(시작점만)가 못 올리던 획 (4-3 · #30)
//   ⑤ 연결 없는 획은 끝까지 무한직선으로 남는다 (4-2 "구간은 연결이 정한다")
//   ⑥ 배치 경로 카운터의 **합 = 전체** (4-6 — 한 경로만 세면 0이 부재의 증거로 읽힌다)
//   ⑦ 첫 앵커 = 소실점을 만든 두 선 + 밑선의 접합 성분(일괄 풀이 · 지면 게이지) (4-4)
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 잉크 캔버스의 (sx, sy) 주변 9×9 창에서 알파 > 8인 픽셀 수. */
const INK_AT = `((sx, sy) => {
  const el = document.getElementById("ink");
  const dpr = el.width / el.clientWidth;
  const d = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
  let n = 0;
  const cx = Math.round(sx * dpr), cy = Math.round(sy * dpr);
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const i = ((cy + dy) * el.width + (cx + dx)) * 4 + 3;
    if (i >= 0 && i < d.length && d[i] > 8) n++;
  }
  return n;
})`;

test("방향 확정 — 세 상태·무한직선·연결 연쇄·경로 카운터 (10차 항목 1)", async ({ page }) => {
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
  const states = () => page.evaluate(() => ({
    states: window.S2S.strokeStates(),
    lifted: window.S2S.doc().strokes.filter((s: any) => s.seg3d).length,
    placeBy: window.S2S.placeBy(),
    guard: window.S2S.anchorGuard(),
  }));
  const led: Record<string, unknown> = {};

  // ---- ① 카메라 전 — 상태는 전부 none이다(방향 미정: 소실점이 없으니 축이 없다)
  await drawPx(0.25 * W, 0.30 * H, 0.45 * W, 0.301 * H);
  await drawPx(0.25 * W, 0.30 * H, 0.4167 * W, 0.426 * H);
  led.pre_camera = await states();
  expect((led.pre_camera as any).lifted).toBe(0);
  expect((led.pre_camera as any).states.every((s: any) => s.state === "none")).toBe(true);

  // ---- 확정(p1_invariance 구도) — 접합 성분 셋이 일괄 풀이로 올라가고(4-4의 첫 앵커),
  //      지지선(s4)은 무연결이라 **방향 확정(dir)** 으로 남는다
  await drawPx(0.45 * W, 0.30 * H, 0.5523 * W, 0.468 * H);
  await drawPx(0.30 * W, 0.42 * H, 0.4602 * W, 0.50 * H);
  led.confirmed = await states();
  expect((led.confirmed as any).lifted).toBe(3);
  expect((led.confirmed as any).placeBy.batch).toBe(3);      // **첫 앵커 = 접합 성분의 일괄 풀이**
  {
    const st = Object.fromEntries((led.confirmed as any).states.map((s: any) => [s.id, s.state]));
    expect(st.s1).toBe("coord"); expect(st.s2).toBe("coord"); expect(st.s3).toBe("coord");
    expect(st.s4).toBe("dir");                               // 무연결 지지선 — 정상 대기(§9.1)
  }

  // ---- ② 무연결 가로선 W1 — dir 상태가 되고 **무한직선이 그려진다**(4-2)
  await drawPx(0.60 * W, 0.20 * H, 0.72 * W, 0.20 * H);
  led.w1 = await states();
  expect((led.w1 as any).lifted).toBe(3);                    // 안 놓였다 — 대기
  expect((led.w1 as any).states.find((s: any) => s.id === "s5").state).toBe("dir");
  // 연장부(그린 끝 0.72W 너머)의 픽셀 — 옅은 무한직선이 실제로 있다. 빗나간 점은 0
  led.infinite_px = await page.evaluate(({ fn, x, y, ox, oy }) => {
    // eslint-disable-next-line no-eval
    const f = eval(fn);
    return { on_line: f(x, y), off_line: f(ox, oy) };
  }, { fn: INK_AT, x: 0.78 * W, y: 0.20 * H, ox: 0.78 * W, oy: 0.24 * H });
  expect((led.infinite_px as any).on_line).toBeGreaterThan(0);
  expect((led.infinite_px as any).off_line).toBe(0);

  // ---- ③ 연쇄 A→B→C (4-3). D(깊이선, 허공) → F(가로선, 끝이 D의 시작에 **2D로 붙는다**)
  //      → V(수직선, 놓인 s2 끝점에서 D의 시작으로) — V가 놓이는 순간 D가 끝점 접합으로,
  //      F가 **그린 시점의 연결 기록(snap2dEnd)** 으로 연쇄해 올라간다(#18의 소비 실증)
  await drawPx(0.4167 * W, 0.526 * H, 0.52 * W, 0.5534 * H);   // D — 소실점을 향한다
  await drawPx(0.26 * W, 0.526 * H, 0.4167 * W, 0.526 * H);    // F — 끝이 D의 시작
  led.f_ref = await page.evaluate(() => {
    const f = window.S2S.doc().strokes.find((s: any) => s.id === "s7");
    return { end_ref: f.snap2dEnd ? { kind: f.snap2dEnd.kind, ofId: f.snap2dEnd.ofId } : null };
  });
  // **확정 뒤에 생긴 2D 연결이 기록됐다**(10차 항목 1 — D-L81 필드의 확장)
  expect((led.f_ref as any).end_ref).toEqual({ kind: "endpoint", ofId: "s6" });
  await drawPx(0.4167 * W, 0.426 * H, 0.4167 * W, 0.526 * H);  // V — s2의 끝점에서 수직으로
  led.chain = await states();
  led.chain_detail = await page.evaluate(() => {
    const d = window.S2S.doc();
    const of = (id: string) => {
      const s = d.strokes.find((x: any) => x.id === id);
      return { lifted: !!s.seg3d, start: s.snapStart ? { kind: s.snapStart.kind, ofId: s.snapStart.ofId } : null,
               end: s.snapEnd ? { kind: s.snapEnd.kind, ofId: s.snapEnd.ofId } : null };
    };
    return { D: of("s6"), F: of("s7"), V: of("s8"), trace: window.S2S.chainTrace() };
  });
  // **12차 항목 3-a**: V가 서는 순간 s4(지지선)가 V의 상을 **가로지르므로** 교차 앵커로
  // 함께 올라간다 — 옛 기대 6(V·D·F)이 7이 됐다. 끝점 겨냥 없는 연결의 e2e 실증이다.
  expect((led.chain as any).lifted).toBe(7);                   // V·D·F + s4(교차)
  expect((led.chain as any).placeBy.cross_anchor).toBe(1);     // 교차 앵커 경로가 발화했다
  expect((led.chain_detail as any).V.lifted).toBe(true);
  expect((led.chain_detail as any).D.lifted).toBe(true);
  expect((led.chain_detail as any).D.start.ofId).toBe("s8");   // D는 V의 끝점에(연쇄의 인과)
  expect((led.chain_detail as any).F.lifted).toBe(true);
  expect((led.chain_detail as any).F.end.ofId).toBe("s6");     // F는 **기록된 연결**로 D에
  expect((led.chain as any).placeBy.ref_anchor).toBe(1);       // #18 — 필드가 실제로 읽혔다

  // ---- ④ 끝점 연결(4-3 · #30 양성 채널) — 시작은 허공, **끝**이 s1의 끝점인 가로선 E.
  //      옛 연쇄는 시작점만 봐서 이 획을 영영 안 올렸다 — end_anchor 경로가 올린다
  await drawPx(0.66 * W, 0.301 * H, 0.45 * W, 0.301 * H);
  led.end_anchor = await states();
  expect((led.end_anchor as any).lifted).toBe(8);
  expect((led.end_anchor as any).placeBy.end_anchor).toBe(1);
  led.e_detail = await page.evaluate(() => {
    const s = window.S2S.doc().strokes.find((x: any) => x.id === "s9");
    return { end_kind: s.snapEnd ? s.snapEnd.kind : null, start: s.snapStart };
  });
  expect(["endpoint", "vertex"]).toContain((led.e_detail as any).end_kind);

  // ---- ⑤·⑥ 무연결 획(W1)은 끝까지 dir(무한직선)로 남고, **경로 합 = 전체**다
  //      (⚠ 12차: s4는 이제 **교차 연결**로 coord다 — 무연결 증인은 W1 하나다)
  led.final = await states();
  {
    const st = Object.fromEntries((led.final as any).states.map((s: any) => [s.id, s.state]));
    expect(st.s4).toBe("coord");                               // 12차 — 교차가 연결이다(3-a)
    expect(st.s5).toBe("dir");                                 // 연결이 없으면 좌표도 없다
    const pb = (led.final as any).placeBy;
    const sum = pb.ref_anchor + pb.start_anchor + pb.two_point + pb.end_anchor
              + pb.cross_anchor + pb.batch + pb.unanchored;
    expect(sum).toBe((led.final as any).lifted);               // 합 = 배치 전체
    expect(pb.unanchored).toBe(0);                             // 가드가 임의 배치를 다 막았다
    led.place_sum = sum;
    // **새 두 경로(ref·end)의 발화 합** — 게이트 도달 가능성 값의 출처(selfcheck가 경로를 푼다)
    led.new_path_placements = pb.ref_anchor + pb.end_anchor;
  }

  // ---- ⑦ **옛 연쇄 대조 팔**(#30 — 10차 리뷰어 2차 [9]). 확장(기록 연결·끝점 오스냅)을
  //      끄면 끝점 연결 획이 **안 올라간다** — "옛 코드가 못 올리던 경로"가 코드 독해가
  //      아니라 측정이 된다. 다시 켜면 다음 턴의 연쇄가 회수한다.
  await page.evaluate(() => window.S2S.setChainExt(false));
  await drawPx(0.66 * W, 0.35 * H, 0.66 * W, 0.301 * H);       // 끝이 E(s9)의 시작 끝점
  const oldChainBefore = await states();
  await page.evaluate(() => window.S2S.setChainExt(true));
  await drawPx(0.85 * W, 0.60 * H, 0.92 * W, 0.60 * H);        // 무관한 획 — 턴만 돌린다
  const oldChainAfter = await states();
  led.old_chain = {
    ext_off_lifted: (oldChainBefore as any).lifted,            // 8 그대로 — 안 올라갔다
    ext_on_lifted: (oldChainAfter as any).lifted,              // 9 — 다음 턴의 연쇄가 회수
    end_anchor_after: (oldChainAfter as any).placeBy.end_anchor,
    // **판별값** — 확장을 켰을 때만 올라간 획 수(끄면 0이었을 값). 게이트 도달 가능성의 출처
    recovered: (oldChainAfter as any).lifted - (oldChainBefore as any).lifted,
  };
  expect((led.old_chain as any).ext_off_lifted).toBe(8);
  expect((led.old_chain as any).ext_on_lifted).toBe(9);
  expect((led.old_chain as any).end_anchor_after).toBe(2);

  // ---- ⑧ **확정 카메라 아래 무앵커 획의 방향 스냅**(12차 항목 2 — 2차 리뷰어 [2]가
  //      "이 배선을 단언하는 e2e가 없다"를 잡았다). 빈 곳에서 소실점을 4°(발동 경계
  //      ≈6.89° 안) 벗어나게 겨냥한 획이, 확정 시 소실점을 **정확히** 지나는 방향으로
  //      되쓰인다 — `placeStroke` 대기 가지의 `resolve2d` 배선을 앱 수준에서 잰다.
  {
    const vp = await page.evaluate(() => {
      const sl = window.S2S.rules().slots.find((s: any) => s && s.kind === "vp");
      return sl.at as [number, number];
    });
    const ax2 = 0.80 * W, ay2 = 0.75 * H;
    const th = Math.atan2(vp[1] - ay2, vp[0] - ax2) + (4 * Math.PI) / 180;
    await drawPx(ax2, ay2, ax2 + 150 * Math.cos(th), ay2 + 150 * Math.sin(th));
    led.dir_snap_unanchored = await page.evaluate(() => {
      const d = window.S2S.doc();
      const s = d.strokes[d.strokes.length - 1];
      const sl = window.S2S.rules().slots.find((x: any) => x && x.kind === "vp");
      const a = s.pts2d[0], b = s.pts2d[s.pts2d.length - 1];
      const u = [b[0] - a[0], b[1] - a[1]], v = [sl.at[0] - a[0], sl.at[1] - a[1]];
      const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
      const c = Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]) / (lu * lv));
      return { aimed_off_deg: 4, err_deg: (Math.acos(c) * 180) / Math.PI,
               lifted: !!s.seg3d, snap_start_3d: !!s.snapStart };
    });
    // 겨냥 4°가 0에 가깝게 되쓰였다 — 배선이 실제로 돈다(경계 밖 팔은 단위 갈래가 든다)
    expect((led.dir_snap_unanchored as any).err_deg).toBeLessThan(0.05);
  }

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "dir_state.json"), JSON.stringify({
    spec: "10차 항목 1(지시 4-1~4-4·4-6) — 세 상태(계산)·무한직선 표시·연결이 좌표를 정하는 연쇄(기록된 연결 우선)·끝점 연결·경로별 배치 카운터의 합=전체. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "옛 연쇄와의 대조는 old_chain 팔이 든다(#30 — setChainExt(false)에서 끝점 연결 획이 안 올라가고, 켜면 다음 턴에 회수된다). ⚠ ref_anchor 경로의 옛 대조는 그 팔에 없다 — F가 이미 올라간 뒤라서다. ref의 발화 실측은 chain 팔의 카운터 1이다",
      "**unanchored_attempts == unanchored_rejected는 가드 켬에서 항등이다**(리뷰어 2차 [6] — 가드가 그 분기를 무조건 막는다). 그 분모의 정보는 '거절 0이 시도 0인지'를 가르는 것뿐이고, 판별은 가드 끔 팔(setAnchorGuard(false))의 몫이다. 같은 이유로 아래 게이트의 'unanchored 0'은 판정이 아니라 **보장 명시**다(#5)",
      "무한직선 픽셀 판정은 **그 직선이 소실점을 지나는지 안 잰다**(4-2의 방향 정합은 코드 경로(drawDirLines의 vp 분기)이지 이 픽셀 표본의 판정이 아니다) — 소실점 쪽 연장부는 잠정 그리드(drawPendingVpGuides)의 파선과 픽셀로 안 갈린다",
      "무한직선 픽셀 판정은 표본 두 점(연장부 하나·빗나간 점 하나)이다(#12) — 선 전체의 픽셀 검증이 아니다. 알파 값(0.12)의 시각 적정성은 안 잰다",
      "연쇄 A→B→C의 인과는 스냅 참조(ofId)로 확인한다 — 세 획이 같은 연쇄 호출의 몇 번째 패스에서 올라갔는지는 chainTrace가 남지만 단언하지 않는다(같은 패스 안에서도 순서 연쇄가 성립한다 — 대기 목록이 문서 순서라 A가 먼저 놓이면 B가 같은 패스에서 잡힌다)",
      "dpr 1·합성 마우스·한 구도의 확인이다(#12·#21·AS-C1)",
      "placeBy는 **실행 누계**다 — 실행취소·삭제를 되돌리지 않는다. 합=전체 검산이 성립하는 것은 이 픽스처에 실행취소가 없기 때문이고, 원장 밖 일반 보장이 아니다",
      "**교차 앵커의 가림 교차 위험은 이 픽스처가 안 잰다**(12차 항목 3-a — #23: 화면 교차가 3D 접촉이 아닌 비율이 상자 하나에서 3/27이었다). s4×V는 참 접촉 교차다. 가림 교차가 조용히 틀린 깊이를 만드는 몫은 실획 표본이 와야 재진다 — DEFERRED 등재",
    ],
    thresholds: { infinite_px_min: 1, off_line_px_max: 0, console_errors_max: 0 },
    gate: {
      registered: "카메라 전 상태 전부 none · 확정 뒤 접합 성분 셋 coord(batch=3 — 4-4 첫 앵커)·지지선 dir(→ 12차: V가 선 뒤 s4는 **교차 앵커**로 coord가 된다 — cross_anchor=1, 지시 3-a) · 무연결 가로선의 연장부 잉크 >0(빗나간 점 0) · V→D→F 연쇄(D.snapStart.ofId=V · F.snapEnd.ofId=D · ref_anchor=1 — #18 소비) · 끝점 연결 획이 올라간다(end_anchor=1) · **옛 연쇄 대조**(ext_off에서 같은 형태가 안 올라가고 ext_on 다음 턴에 회수 — #30) · 무연결 둘은 끝까지 dir · 경로 합=배치 전체 · 콘솔 오류 0(잠금 — 임계 아님). ⚠ 'unanchored 0'은 가드 켬의 보장이라 판정 조항에서 뺐다(#5·리뷰어 2차 [6]). ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "**옛 연쇄 팔이 오라클이다**(#30 · 리뷰어 2차 [9]): setChainExt(false)에서 끝점 연결 획이 안 올라가고(old_chain.ext_off_lifted 7 — 불변) 켜면 다음 턴에 올라간다(8). 그 대조가 end_anchor 경로의 판별을 든다. ⚠ 값이 정확히 1이라 #40 검사가 플래그한다 — 원인은 대조 팔이 회수 대상 획을 하나만 두기 때문이다(의심≠오류, §5). 옛 초판 값 2(ref+end 발화 합)는 픽스처 구성의 귀결이라 오라클에서 뺐다(#40 ⚠)",
      reachability_value: 1,
      reachability_source: "old_chain/recovered",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
