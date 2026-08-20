// **불변식 — 그리기 국면에 들어간 뒤 그은 획은 반드시 화면에 남는다**(2026-08-20 20차
// 지시 3 · D-L118). 산출: `stage0/out/post_confirm_invariant.json`.
//
// ⚠ **사거리가 «확정 후 전부»가 아니다**(1차 리뷰어 [2]) — 작도 국면(확정 직후, 획마다
// 소실점을 만드는 동안)의 사선은 여전히 작도선으로 소비된다(18차 설계 · DEFERRED 20차
// 3행). 이 불변식이 잠그는 것은 **그리기 국면 진입 후**다 — 사람이 보고한 재발이 그
// 자리였고, D-L118이 그 자리를 구조로 막았다.
//
// 3D가 되든 2D로 대기하든 **사라지지 않는다**. 사라지는 것은 사용자가 지웠을 때뿐이다.
// «남는다»는 둘 다다(지시 3-c — 저장은 됐는데 안 그려지는 경우가 있다):
//   ① 문서에 있다(`in_doc`) ② 화면에 있다 — 2D 대기면 `drawn_alpha`>0 **그리고 그 자리
//   픽셀**>0, 3D면 three 층(`lifted_ids`)에 있다.
//
// **버그를 되살려 실제로 잡는지 확인한다**(지시 3-d · A-4): `S2S.setDraftGate(false)`가
// 수리 전 거동(그리기 국면에도 규칙이 돈다)이고, 그 팔에서 P1 사선이 **실제로 사라진다**.
//
// ⚠ 팔마다 장면을 초기화한다(#53). 시드 난수를 안 쓴다(재현성 §5) — 방향·길이는 고정 표다.
// 착수 시 `PITFALLS.md`를 읽었다(`tail -40`). 걸리는 번호는 `progress.md` 20차 착수 표.
import { test, expect, type Page } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

async function fresh(page: Page) {
  await page.goto("/l.html");
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-act="clear"]')!.click());
}

async function drawOn(page: Page, a: [number, number], b: [number, number]) {
  const box = (await page.locator("#ink").boundingBox())!;
  await page.mouse.move(box.x + a[0], box.y + a[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + a[0] + (b[0] - a[0]) * i / 10,
                          box.y + a[1] + (b[1] - a[1]) * i / 10);
  }
  await page.mouse.up();
  await page.waitForTimeout(50);
}

const size = (page: Page) => page.evaluate(() => {
  const r = document.getElementById("ink")!.getBoundingClientRect();
  return { W: r.width, H: r.height };
});

/** 획 하나의 생존 상태 — 문서·표식·**그 자리 픽셀**(대기 획만: 2D 층은 잉크 캔버스다). */
const survival = (page: Page, id: string) => page.evaluate((sid) => {
  const S = window.S2S;
  const t = S.strokeTrace(sid);
  const st = S.doc().strokes.find((x: any) => x.id === sid);
  let px: number | null = null;
  if (st && !st.seg3d) {
    // 대기 획의 중점 — 직선으로 그리므로(§1.1) 중점은 선 위다. 9×9 창의 알파>8 픽셀 수.
    const [a, b] = [st.pts2d[0], st.pts2d[st.pts2d.length - 1]];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const dpr = el.width / el.clientWidth;
    const d = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
    px = 0;
    const cx = Math.round(mx * dpr), cy = Math.round(my * dpr);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const i = ((cy + dy) * el.width + (cx + dx)) * 4 + 3;
      if (i >= 0 && i < d.length && d[i] > 8) px++;
    }
  }
  return { id: sid, in_doc: !!st, seg3d: !!st?.seg3d,
           drawn_alpha: t.drawn_alpha, midpoint_px: px,
           in_lifted_layer: (S.renderTrace().lifted_ids as string[]).includes(sid) };
}, id);

const lastId = (page: Page) => page.evaluate(() => window.S2S.lastTrace().id as string | null);

/**
 * **방향·길이 고정 표** — 축 스냅이 걸릴 방향(소실점 겨냥·수평·수직)과 안 걸릴 방향
 * (사선 여러 각)을 섞는다. 시드 난수 금지(§5) — 각도는 등간격이다.
 */
function fan(cx: number, cy: number, W: number, H: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (let k = 0; k < 12; k++) {
    const ang = (k * 30 + 7) * Math.PI / 180;
    const len = 40 + (k % 4) * 25;
    const a: [number, number] = [cx + (k % 3) * 30, cy + (k % 5) * 18];
    const b: [number, number] = [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
    if (b[0] < 8 || b[0] > W - 8 || b[1] < 8 || b[1] > H - 8) continue;
    out.push([a, b]);
  }
  return out;
}

test("불변식 — 확정 후 그은 획은 반드시 화면에 남는다 (20차 지시 3)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  const led: Record<string, unknown> = {};

  // ================================================================ P1 팔 — 사라짐이 났던 그 상태
  await fresh(page);
  const { W, H } = await size(page);
  const HY = Math.round(H * 0.22);
  await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);            // 지평선
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]); // 깊이선1 → 1점 확정
  // **그리기 국면 진입** — 소실점을 안 만드는 첫 획(수평선). 이 획부터 불변식 대상이다.
  const p1rows: Record<string, unknown>[] = [];
  const drawTracked = async (a: [number, number], b: [number, number]) => {
    await drawOn(page, a, b);
    const id = await lastId(page);
    if (id) p1rows.push(await survival(page, id));
    return id;
  };
  await drawTracked([W * 0.30, H * 0.88], [W * 0.46, H * 0.87]);
  // **임의 방향·길이 수십 획**(지시 3-b) — P1에서 사선은 수리 전이라면 전부 소비 후보였다
  for (const [a, b] of fan(W * 0.18, H * 0.32, W, H)) await drawTracked(a, b);
  for (const [a, b] of fan(W * 0.58, H * 0.50, W, H)) await drawTracked(a, b);
  const p1state = await page.evaluate(() => ({
    order: window.S2S.order(), strokes: window.S2S.doc().strokes.length,
    lifted: window.S2S.doc().strokes.filter((x: any) => x.seg3d).length,
    drafting: window.S2S.draftPhase(),
  }));

  // ================================================================ P2 팔 — 두 소실점 상태
  await fresh(page);
  await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.76, H * 0.63]); // 깊이선2 → 2점(작도 국면)
  const p2rows: Record<string, unknown>[] = [];
  const drawTracked2 = async (a: [number, number], b: [number, number]) => {
    await drawOn(page, a, b);
    const id = await lastId(page);
    if (id) p2rows.push(await survival(page, id));
  };
  await drawTracked2([W * 0.33, H * 0.87], [W * 0.48, H * 0.86]); // 그리기 진입(지면 후보)
  for (const [a, b] of fan(W * 0.20, H * 0.36, W, H)) await drawTracked2(a, b);
  for (const [a, b] of fan(W * 0.55, H * 0.55, W, H)) await drawTracked2(a, b);
  const p2state = await page.evaluate(() => ({
    order: window.S2S.order(), strokes: window.S2S.doc().strokes.length,
    lifted: window.S2S.doc().strokes.filter((x: any) => x.seg3d).length,
    drafting: window.S2S.draftPhase(),
  }));

  // ================================================================ 되살림 팔 — 수리 전 거동
  // `setDraftGate(false)` = 그리기 국면에도 규칙이 돈다. **같은 고정 표를 전수로 돌려**
  // 몇 획이 사라지는지 센다(1차 리뷰어 [3] — 한 획로는 나머지 24행이 «되살림에서도
  // 살아남았을 획»인지 안 갈린다). 그 수가 곧 수리가 되돌린 크기다.
  await fresh(page);
  await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]); // 1점
  await drawOn(page, [W * 0.30, H * 0.88], [W * 0.46, H * 0.87]); // 그리기 진입
  const revOrderBefore = await page.evaluate(() => window.S2S.order());
  await page.evaluate(() => window.S2S.setDraftGate(false));
  await drawOn(page, [W * 0.2, H * 0.5], [W * 0.34, H * 0.41]);  // 사선 — 수리 전이면 소비된다
  const revivedId = await lastId(page);
  const revived = revivedId ? await survival(page, revivedId) : null;
  const revivedState = await page.evaluate(() => ({
    order_before: null as number | null,     // 아래서 채운다 — evaluate 안에서 못 읽는다
    order: window.S2S.order(),
    fired: window.S2S.strokeTrace(window.S2S.lastTrace().id).steps
      .some((s: any) => s.at === "vp_fixed_delete"),
  }));
  revivedState.order_before = revOrderBefore;
  // **같은 고정 표를 방향마다 새 장면에서**(#12 · 1차 리뷰어 [3]) — 한 장면에서는 소비가
  // **한 번뿐이다**(첫 vp_fixed가 암묵 슬롯을 닫아 차수가 2가 되면 뒤 사선은 거절로
  // 남는다). 그래서 이어 그으면 «사라진 수»가 항상 1로 나와 방향별 취약성이 안 갈린다 —
  // 방향마다 P1 그리기 국면을 새로 만들어 «이 방향이 첫 사선이었다면 사라졌는가»를 잰다.
  const revRows: { dir: number; a: [number, number]; b: [number, number];
                   id: string | null; in_doc: boolean; order: number;
                   feed: string | null; note: string | null }[] = [];
  {
    // **P1 팔과 같은 두 부채 전부**다 — 어느 방향이 소비 부류인지가 이 표의 답이다.
    const dirs = [...fan(W * 0.18, H * 0.32, W, H), ...fan(W * 0.58, H * 0.50, W, H)];
    for (let k = 0; k < dirs.length; k++) {
      await fresh(page);
      await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
      await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]);   // 1점
      await drawOn(page, [W * 0.30, H * 0.88], [W * 0.46, H * 0.87]);  // 그리기 진입
      await page.evaluate(() => window.S2S.setDraftGate(false));       // fresh가 켬으로 되돌린다
      await drawOn(page, dirs[k][0], dirs[k][1]);
      const id = await lastId(page);
      revRows.push({
        dir: k, a: dirs[k][0], b: dirs[k][1], id,
        in_doc: id != null && await page.evaluate(
          (sid) => window.S2S.doc().strokes.some((x: any) => x.id === sid), id),
        order: await page.evaluate(() => window.S2S.order()),
        // 살아남은 사유를 가른다(#43) — 규칙 사건 이름(support/rejected)이 그 자리다
        feed: await page.evaluate(() => {
          const s = window.S2S.lastTrace().steps.find((x: any) => x.at === "feed_rule");
          return s ? (s.why ?? null) : null;
        }),
        // **앱 자신의 알림**을 그대로 싣는다(#52 — 하네스가 f² 조건을 다시 계산하지
        // 않는다). 거절 사유(f² ≤ 0 등)가 이 문구에 있다 — 기전 서술의 근거가 원장 안이다.
        note: await page.evaluate(() =>
          (document.getElementById("status")?.textContent ?? "").slice(0, 80) || null),
      });
    }
  }
  await page.evaluate(() => window.S2S.setDraftGate(true));

  // ================================================================ 원장
  const all = [...p1rows, ...p2rows];
  const ledger = {
    what: "불변식(20차 지시 3 · D-L118): **그리기 국면에 들어간 뒤** 그은 획은 반드시 "
      + "화면에 남는다 — 문서와 픽셀 둘 다. ⚠ 작도 국면(확정 직후 연속 작도)은 사거리 "
      + "밖이다 — 그 사선은 설계대로 작도선이 된다(DEFERRED 20차 3행).",
    how: "P1·P2 각각에서 그리기 국면에 들어간 뒤 고정 표의 방향·길이로 수십 획을 긋고, "
      + "획마다 in_doc · (대기면) drawn_alpha와 중점 9×9 픽셀 · (3D면) three 층 등재를 "
      + "읽는다. 되살림 팔은 setDraftGate(false)로 수리 전 거동을 켜고 같은 고정 표를 "
      + "**방향마다 새 P1 장면에서** 다시 긋는다(#30 · #12). ⚠ 한 장면에서 소비는 **최대 "
      + "1획**이다(첫 vp_fixed가 암묵 슬롯을 닫아 P2가 되면 뒤 사선은 거절로 남는다) — "
      + "그래서 `revived_fan`의 «사라진 수»는 «한 장면의 손실»이 아니라 **방향별 소비 "
      + "성향**이다. 수리 전 한 장면의 실제 손실은 «첫 해당 사선 1획 + 그 뒤 전 획이 "
      + "조용히 바뀐 카메라(P2) 아래 놓이는 것»이다.",
    counts: {
      p1_drawn: p1rows.length, p2_drawn: p2rows.length,
      p1_lifted: p1rows.filter(r => r.seg3d).length,
      p2_lifted: p2rows.filter(r => r.seg3d).length,
      p1_waiting: p1rows.filter(r => !r.seg3d).length,
      p2_waiting: p2rows.filter(r => !r.seg3d).length,
    },
    what_this_does_not_say: [
      "dpr 1 · 마우스 합성 · 두 구도다(#12·#21).",
      "**작도 국면(확정 직후 첫 사선)은 이 팔 밖이다** — 그 획은 설계대로 작도선이 되어 "
      + "사라진다(18차 지시 4 · DEFERRED 20차 3행이 그 잔존 사거리를 든다).",
      "3D로 올라간 획의 «화면에 있다»는 three 층 등재(`lifted_ids`)로 재고 WebGL 픽셀은 "
      + "안 읽는다(preserveDrawingBuffer 없음) — 그 층의 픽셀 검증은 `stage.spec`의 몫이다.",
      "놓인 좌표가 옳은가는 안 잰다 — 재는 것은 «남는가»뿐이다.",
      "궤도를 돌린 상태의 2D 대기 층(§9.4 — 다른 뷰 소유)은 이 팔 밖이다(뷰 불일치는 "
      + "render:other_view 표식이 들고, 그 획은 뷰로 돌아오면 다시 그려진다 — 삭제가 아니다).",
      "되살림 방향별 팔의 «사라진 수»는 이 좌표 표의 값이다 — 지평선에 유한 교점을 "
      + "만드는 방향만 소비되므로, 표가 달라지면 그 수도 달라진다(#46).",
    ],
    p1: { state: p1state, rows: p1rows },
    p2: { state: p2state, rows: p2rows },
    revived_bug: { id: revivedId, survival: revived, ...revivedState },
    /**
     * **되살림 · 고정 표 방향별**(#12 · 1차 리뷰어 [3]) — 수리 전 거동에서 «이 방향이 첫
     * 사선이었다면 사라졌는가». 방향마다 새 P1 장면이다(한 장면에서는 소비가 한 번뿐이라서
     * — 첫 승격이 암묵 슬롯을 닫는다). `vanished`가 곧 수리가 되돌린 방향 수다.
     *
     * **소비 부류는 방향 전부가 아니다** — 이 표가 그것을 가른다. 살아남은 사유는 행마다
     * `feed`(규칙 사건)와 `note`(앱 자신의 알림 — 거절이면 f² ≤ 0 문구가 그대로 실린다,
     * #52)가 들고, 좌표는 `a`·`b`다. **가르는 조건의 서술은 «후보»다**(2차 [R5] — 원장 밖
     * 손 관측을 단정으로 적지 않는다): 소비 행의 공통점은 그 사선의 지평선 교점이 기존
     * 소실점과 화각 게이트를 지나는 짝(f² > 0)이 되는 것으로 보이고, 거절 행의 `note`가
     * f² ≤ 0 문구를 드는 것이 그 방증이다 — 확정 판정은 행별 f² 부호를 내는 팔이 생길
     * 때다. 수리 전에도 전 획이 사라진 것은 아니었고, 사라지는 방향이 구도에 딸려
     * 있었다 — 재발 보고가 간헐로 보인 이유의 후보다.
     */
    revived_fan: {
      drawn: revRows.length,
      vanished: revRows.filter(r => !r.in_doc).length,
      survived: revRows.filter(r => r.in_doc).length,
      by_feed_event: revRows.reduce((m: Record<string, number>, r) => {
        const k = r.in_doc ? (r.feed ?? "none") : "vp_fixed(소비)";
        m[k] = (m[k] ?? 0) + 1; return m;
      }, {}),
      rows: revRows,
    },
    gate: {
      registered: "① 그리기 국면의 전 획(p1·p2 합 40+)이 문서에 남고, 대기면 중점 픽셀>0 · "
        + "3D면 three 층 등재다 ② P1 팔의 차수가 사선 수십 획 뒤에도 1이다(조용한 승격 "
        + "없음) ③ 되살림(수리 전 거동)에서는 같은 사선이 사라지고 차수가 1→2로 움직인다.",
      reachability: "되살림 팔이 도달 가능성이다 — 수리 전 거동에서 첫 사선이 소비되고"
        + "(`revived_bug`) 같은 고정 표에서 사라진 수가 0이 아니다(`revived_fan.vanished`). "
        + "⚠ **재는 것은 범주다**(vanished > 0 — 되살림이 실제로 죽인다). 크기(그 수 자체)는 "
        + "이 좌표 표가 정하므로(#46) 크기를 근거로 쓰지 않는다.",
      reachability_source: "revived_fan/vanished",
      reachability_value: null as unknown,
      /** #46 ⚙️ — 값이 픽스처(좌표 표) 결정임을 자동이 읽는 자리. */
      reachability_value_fixture_determined: true,
    },
    /** ⚠ 이 배열은 **이 원장 본문이 실제로 인용한 번호**와 일치시킨다(2차 [R2]). */
    pitfall_citations: [12, 21, 30, 46],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  (ledger.gate as { reachability_value: unknown }).reachability_value =
    ledger.revived_fan.vanished;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "post_confirm_invariant.json"), JSON.stringify(ledger, null, 1));

  // ---- 불변식 — 전 획이 문서에 남는다
  expect(all.length).toBeGreaterThanOrEqual(40);            // «수십 획»(지시 3-b)
  for (const r of all) {
    expect(r.in_doc, `${r.id} — 문서에서 사라졌다`).toBe(true);
    if (r.seg3d) {
      expect(r.in_lifted_layer, `${r.id} — 3D인데 three 층에 없다`).toBe(true);
    } else {
      expect(r.drawn_alpha, `${r.id} — 대기인데 drawPending이 안 그렸다`).not.toBeNull();
      expect(r.midpoint_px as number, `${r.id} — 대기인데 그 자리에 픽셀이 없다`).toBeGreaterThan(0);
    }
  }
  // 축 스냅이 걸린 것(3D)과 안 걸린 것(대기) **둘 다** 표본에 있다(지시 3-b)
  expect((ledger.counts as any).p2_lifted).toBeGreaterThan(0);
  expect((ledger.counts as any).p1_waiting).toBeGreaterThan(0);
  // 카메라가 조용히 안 바뀐다 — P1 팔은 사선 수십 획 뒤에도 1점이다
  expect(p1state.order).toBe(1);
  // ---- 되살린 버그를 실제로 잡는다(지시 3-d) — 수리 전 거동에서는 그 사선이 사라진다
  expect(revived).not.toBeNull();
  expect(revived!.in_doc).toBe(false);
  expect(revivedState.fired).toBe(true);                    // vp_fixed_delete가 그 자리다
  expect(revivedState.order_before).toBe(1);
  expect(revivedState.order).toBe(2);                       // 카메라도 조용히 승격됐었다
  // 같은 고정 표 전수 — 사라진 획이 실제로 있다(수리가 되돌린 크기가 0이 아니다)
  expect((ledger.revived_fan as any).vanished).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
