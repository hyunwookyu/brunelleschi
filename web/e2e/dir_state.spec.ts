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
  expect((led.chain as any).lifted).toBe(6);                   // V·D·F 셋이 함께 올라갔다
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
  expect((led.end_anchor as any).lifted).toBe(7);
  expect((led.end_anchor as any).placeBy.end_anchor).toBe(1);
  led.e_detail = await page.evaluate(() => {
    const s = window.S2S.doc().strokes.find((x: any) => x.id === "s9");
    return { end_kind: s.snapEnd ? s.snapEnd.kind : null, start: s.snapStart };
  });
  expect(["endpoint", "vertex"]).toContain((led.e_detail as any).end_kind);

  // ---- ⑤·⑥ 무연결 획 둘(s4·W1)은 끝까지 dir(무한직선)로 남고, **경로 합 = 전체**다
  led.final = await states();
  {
    const st = Object.fromEntries((led.final as any).states.map((s: any) => [s.id, s.state]));
    expect(st.s4).toBe("dir"); expect(st.s5).toBe("dir");      // 연결이 없으면 좌표도 없다
    const pb = (led.final as any).placeBy;
    const sum = pb.ref_anchor + pb.start_anchor + pb.two_point + pb.end_anchor
              + pb.batch + pb.unanchored;
    expect(sum).toBe((led.final as any).lifted);               // 합 = 배치 전체
    expect(pb.unanchored).toBe(0);                             // 가드가 임의 배치를 다 막았다
    led.place_sum = sum;
    // **새 두 경로(ref·end)의 발화 합** — 게이트 도달 가능성 값의 출처(selfcheck가 경로를 푼다)
    led.new_path_placements = pb.ref_anchor + pb.end_anchor;
  }

  led.console_errors = errors;
  expect(errors).toEqual([]);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "dir_state.json"), JSON.stringify({
    spec: "10차 항목 1(지시 4-1~4-4·4-6) — 세 상태(계산)·무한직선 표시·연결이 좌표를 정하는 연쇄(기록된 연결 우선)·끝점 연결·경로별 배치 카운터의 합=전체. Playwright 신뢰 이벤트·픽셀·콘솔 오류 0",
    what_this_does_not_say: [
      "**옛 연쇄(시작점만)에서 end_anchor·ref_anchor가 0이었다는 것은 코드 독해다**(#25) — 이전 판을 토글로 되살리는 팔은 없다. 이 원장이 실측하는 것은 현행 경로의 발화(카운터 1·1)와 그 획들이 실제로 올라갔다는 것이다",
      "무한직선 픽셀 판정은 표본 두 점(연장부 하나·빗나간 점 하나)이다(#12) — 선 전체의 픽셀 검증이 아니다. 알파 값(0.12)의 시각 적정성은 안 잰다",
      "연쇄 A→B→C의 인과는 스냅 참조(ofId)로 확인한다 — 세 획이 같은 연쇄 호출의 몇 번째 패스에서 올라갔는지는 chainTrace가 남지만 단언하지 않는다(같은 패스 안에서도 순서 연쇄가 성립한다 — 대기 목록이 문서 순서라 A가 먼저 놓이면 B가 같은 패스에서 잡힌다)",
      "dpr 1·합성 마우스·한 구도의 확인이다(#12·#21·AS-C1)",
      "placeBy는 **실행 누계**다 — 실행취소·삭제를 되돌리지 않는다. 합=전체 검산이 성립하는 것은 이 픽스처에 실행취소가 없기 때문이고, 원장 밖 일반 보장이 아니다",
    ],
    thresholds: { infinite_px_min: 1, off_line_px_max: 0, console_errors_max: 0 },
    gate: {
      registered: "카메라 전 상태 전부 none · 확정 뒤 접합 성분 셋 coord(batch=3 — 4-4 첫 앵커)·지지선 dir · 무연결 가로선의 연장부 잉크 >0(빗나간 점 0) · V→D→F 연쇄(D.snapStart.ofId=V · F.snapEnd.ofId=D · ref_anchor=1 — #18 소비) · 끝점 연결 획이 올라간다(end_anchor=1) · 무연결 둘은 끝까지 dir · 경로 합=배치 전체 · unanchored=0(D-L83) · 콘솔 오류 0. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
      reachability: "새 두 경로의 발화 수가 값이다 — ref_anchor 1 · end_anchor 1(합 2). 자명값이 아닌 이유: 같은 실행에서 시작점 앵커(start_anchor 2)와 일괄 풀이(batch 3)가 **다른 경로로** 함께 발화해 카운터가 경로를 실제로 가른다는 것을 보인다. ⚠ 옛 코드 0 대조는 없다(#25 — what_this_does_not_say ①)",
      reachability_value: 2,
      reachability_source: "new_path_placements",
    },
    ...led,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  }, null, 1));
});
