// **확정 후 획 경로의 표식 원장**(2026-08-20 20차 지시 1 — «탈락 지점을 전수 표시한다,
// 수리 전에»). 산출: `stage0/out/post_confirm_trace.json`.
//
// 획 하나가 3D가 되기까지 지나는 **모든** 판정에 표식(통과·거부·미도달)이 심겼다
// (`mainL.ts`의 `traceMap`·`TRACE_REJECT_SITES`). 여기는 **확정 후 한 획을 긋고 그 표식을
// 전부 내는 자리**다(지시 1-b) — 축 스냅이 걸린 획과 안 걸린 획 각각, 그리고 문서에서
// 실제로 빠지는 유일한 획(소실점을 만든 작도선)까지.
//
// **이것이 원장이 된다**(지시 1-c) — 앞으로 «사라졌다»가 나오면 이 표식만 보면 갈린다.
// **수리는 이 표식이 나온 뒤에 한다**(지시 1-d) — 이 팔은 관찰만 하고 아무것도 안 고친다.
//
// ⚠ **팔마다 장면을 초기화한다**(#53) — A(1점 직후)와 B(2점·3D 있는 상태)는 딴 장면이다.
// 착수 시 `PITFALLS.md`를 읽었다(`tail -40`). 걸리는 번호는 `progress.md` 20차 착수 표.
import { test, expect, type Page } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 빈 장면에서 시작한다 — 저장본·문서·규칙 전부(#53). */
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

/** **실제 포인터 사건**으로 긋는다(#17 — 하네스가 앱 함수를 부르지 않는다). */
async function drawOn(page: Page, a: [number, number], b: [number, number]) {
  const box = (await page.locator("#ink").boundingBox())!;
  await page.mouse.move(box.x + a[0], box.y + a[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + a[0] + (b[0] - a[0]) * i / 10,
                          box.y + a[1] + (b[1] - a[1]) * i / 10);
  }
  await page.mouse.up();
  await page.waitForTimeout(60);
}

const size = (page: Page) => page.evaluate(() => {
  const r = document.getElementById("ink")!.getBoundingClientRect();
  return { W: r.width, H: r.height };
});

/** 방금 끝난 제스처의 표식 + 그 획의 최종·그리기 상태를 한 번에 읽는다. */
const takeTrace = (page: Page, label: string) => page.evaluate((lab) => {
  const S = window.S2S;
  const t = S.lastTrace();
  const st = t.id ? S.strokeTrace(t.id) : null;
  return {
    label: lab, id: t.id, standing: t.standing, steps: t.steps,
    in_doc: st ? st.in_doc : null, seg3d: st ? st.seg3d : null,
    drawn_alpha: st ? st.drawn_alpha : null,
    hidden_other_view: st ? st.hidden_other_view : null,
    render: S.renderTrace(),
  };
}, label);

test("확정 후 획 경로 표식 — 전수 원장 (20차 지시 1)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));

  // ================================================================ A. 1점 확정 직후
  await fresh(page);
  const { W, H } = await size(page);
  const HY = Math.round(H * 0.22);
  const rows: Record<string, unknown>[] = [];

  await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
  rows.push(await takeTrace(page, "A0 지평선(획이 아니다)"));
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]);
  rows.push(await takeTrace(page, "A1 깊이선1 → 1점 확정(작도선 — 문서에서 빠진다)"));
  // **축 스냅이 걸리는 보통 획** — 소실점을 향해 긋는다(소실점 자리는 앱에서 읽는다, #52)
  {
    const vp = await page.evaluate(() => window.S2S.camSnapshot().vps.find((v: any) => v));
    const a: [number, number] = [W * 0.62, H * 0.86];
    const t = 0.3;
    await drawOn(page, a, [a[0] + ((vp as number[])[0] - a[0]) * t,
                           a[1] + ((vp as number[])[1] - a[1]) * t]);
  }
  rows.push(await takeTrace(page, "A2 확정 후 · 축 방향(깊이) 보통 획"));
  // **축 스냅이 안 걸리는(자유 방향) 보통 획**
  await drawOn(page, [W * 0.2, H * 0.5], [W * 0.34, H * 0.41]);
  rows.push(await takeTrace(page, "A3 확정 후 · 자유 방향 보통 획"));
  const stateA = await page.evaluate(() => ({
    order: window.S2S.order(), strokes: window.S2S.doc().strokes.length,
    lifted: window.S2S.doc().strokes.filter((x: any) => x.seg3d).length,
    placeBy: JSON.parse(JSON.stringify(window.S2S.placeBy())),
  }));

  // ================================================================ B. 2점 · 3D가 있는 상태
  await fresh(page);
  await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.76, H * 0.63]);
  rows.push(await takeTrace(page, "B0 깊이선2 → 2점 승격(작도선 — 문서에서 빠진다)"));
  // 지면 배치로 3D를 만든다(procedure_repair의 C 팔과 같은 좌표 — 지면 앵커 경로)
  await drawOn(page, [W * 0.33, H * 0.87], [W * 0.48, H * 0.86]);
  rows.push(await takeTrace(page, "B1 확정 후 · 수평 평면 축 획(지면 배치 후보)"));
  await drawOn(page, [W * 0.55, H * 0.45], [W * 0.69, H * 0.47]);
  rows.push(await takeTrace(page, "B2 확정 후 · 가로 획"));
  // **3D 끝점에서 시작하는 획** — 시작점 오스냅 → 축 경로(확정 후의 정상 경로)
  {
    const start = await page.evaluate(() => {
      const s = window.S2S.doc().strokes.find((x: any) => x.seg3d);
      return s ? s.pts2d[s.pts2d.length - 1] : null;
    });
    if (start) {
      const vp = await page.evaluate(() => window.S2S.camSnapshot().vps.find((v: any) => v));
      const t = 0.25;
      await drawOn(page, [start[0], start[1]],
                   [start[0] + ((vp as number[])[0] - start[0]) * t,
                    start[1] + ((vp as number[])[1] - start[1]) * t]);
    }
  }
  rows.push(await takeTrace(page, "B3 확정 후 · 3D 끝점에서 축 방향(시작 오스냅)"));
  // 자유 방향(빈 곳 → 빈 곳)
  await drawOn(page, [W * 0.12, H * 0.35], [W * 0.22, H * 0.52]);
  rows.push(await takeTrace(page, "B4 확정 후 · 자유 방향(무앵커)"));
  const stateB = await page.evaluate(() => ({
    order: window.S2S.order(), strokes: window.S2S.doc().strokes.length,
    lifted: window.S2S.doc().strokes.filter((x: any) => x.seg3d).length,
    placeBy: JSON.parse(JSON.stringify(window.S2S.placeBy())),
  }));

  // ================================================================ C. 수리 전 거동 (되살림)
  // **초판(수리 전) 실행의 그 표식을 커밋 안에 재현한다**(#25 — 수리 전 값을 원장 안에
  // 둔다 · 1차 리뷰어 [1]): `setDraftGate(false)`가 수리 전 거동이고, 그리기 국면의
  // 사선(A3와 같은 자리)이 **vp_fixed_delete로 소비되며 카메라가 조용히 2점이 된다.**
  await fresh(page);
  await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]);          // 1점
  await drawOn(page, [W * 0.62, H * 0.86], [W * 0.55, H * 0.80]);         // 그리기 진입
  const orderBeforeRevive = await page.evaluate(() => window.S2S.order());
  await page.evaluate(() => window.S2S.setDraftGate(false));
  await drawOn(page, [W * 0.2, H * 0.5], [W * 0.34, H * 0.41]);           // A3와 같은 사선
  rows.push(await takeTrace(page, "C1 [되살림 · 수리 전 거동] 그리기 국면의 사선"));
  const stateC = await page.evaluate(() => ({
    order: window.S2S.order(), strokes: window.S2S.doc().strokes.length,
  }));
  await page.evaluate(() => window.S2S.setDraftGate(true));

  // ================================================================ 집계 — 실제로 걸린 자리
  // **자리별 통과/거부/미도달 수를 함께 낸다**(#43 — 거부 수만 내면 0이 «시도 없음»인지
  // «전부 통과»인지 안 갈린다). `final`은 거부 지점이 아니라 **결과 요약**이라 따로 낸다.
  const sites = await page.evaluate(() => window.S2S.traceRejectSites());
  const bySite: Record<string, { pass: number; reject: number; skip: number }> = {};
  let finalRemoved = 0;
  for (const r of rows) {
    for (const s of (r.steps as { at: string; verdict: "pass" | "reject" | "skip" }[])) {
      if (s.at === "final") { if (s.verdict === "reject") finalRemoved += 1; continue; }
      const b = bySite[s.at] ?? (bySite[s.at] = { pass: 0, reject: 0, skip: 0 });
      b[s.verdict] += 1;
    }
  }

  const ledger = {
    what: "확정 후 획이 3D가 되기까지 지나는 판정의 전수 표식(20차 지시 1). "
      + "⚠ **수리(D-L118) 후 재실행분이다** — 초판(수리 전) 실행은 커밋에 없고, 그때의 "
      + "거동(그리기 국면 사선의 소비·조용한 승격)은 **C1 되살림 팔**이 같은 좌표로 "
      + "재현해 든다. 앞으로 «사라졌다»가 나오면 이 표식으로 가른다.",
    how: "새 절차(지평선 → 깊이선)로 확정한 뒤, 축 방향 획·자유 방향 획·3D 끝점 시작 획·"
      + "작도선(소실점을 만든 획)을 각각 긋고 `S2S.lastTrace()`(그 제스처의 표식 전부)와 "
      + "`S2S.renderTrace()`(drawPending이 실제 그린 것)를 읽는다. 표식은 코드의 그 분기 "
      + "자리에서 적히고 하네스는 조건을 다시 계산하지 않는다(#52).",
    reject_sites_total: sites,
    /** 자리별 (통과·거부·미도달) — 분모가 함께 있다(#43). `final`은 결과 요약이라 별도다. */
    verdicts_by_site: bySite,
    final_removed_count: finalRemoved,
    reading: {
      vp_fixed_delete: "문서에서 획이 빠지는 **유일한** 자리다 — 발화 목록은 아래 게이트가 "
        + "든다(A1·B0 작도선 + C1 되살림 팔뿐이어야 한다).",
      waiting_visible: "2D 대기 획은 전부 `drawn_alpha` > 0이어야 한다 — 대기는 실패가 "
        + "아니라 상태다(§9.1). null이면 저장은 됐는데 안 그려진 것이다(지시 3-c).",
      render_gates: "`render:pending_skip`(뷰 불일치)과 `render:other_view`는 문서가 아니라 "
        + "**화면의** 거부다 — 이 팔의 장면(뷰 하나·궤도 없음)에서는 안 나와야 한다.",
    },
    what_this_does_not_say: [
      "dpr 1 · 마우스 합성 · 한 구도다(#12·#21).",
      "이 원장은 **관찰이다** — 어느 거부가 옳은지(확정 전 판정인지)는 여기 없고, "
      + "그 판정은 진단 절(progress 20차)이 이력 대조로 한다.",
      "궤도를 돌린 상태(`render:pending_skip`·`render:other_view`가 발화하는 장면)는 "
      + "**어느 팔도 안 덮는다**(DEFERRED 20차 4행 — 불변식 팔도 밖이라고 적었다). "
      + "그 자리의 판정자는 `strokeTrace`의 `hidden_other_view`다.",
      "거부 0인 자리(bend_gate·chain_dir_guard 등)는 «그 장면에서 그 조건이 안 났다»다 — "
      + "«안 난다»가 아니다(#38). 자리별 분모는 `verdicts_by_site`가 든다.",
    ],
    arms: rows,
    state: { after_A: stateA, after_B: stateB,
             revived: { order_before: orderBeforeRevive, ...stateC } },
    gate: {
      registered: "① 문서에서 획이 빠지는 자리는 `vp_fixed_delete` 하나이고 발화는 "
        + "작도선(A1·B0)과 되살림 팔(C1)뿐이다 ② 작도선이 아닌 확정 후 획은 전부 문서에 "
        + "남고, 대기면 `drawn_alpha`>0 · 3D면 three 층 등재다 ③ C1(수리 전 거동)에서는 "
        + "같은 사선이 소비되고 차수가 1→2로 움직인다.",
      reachability: "되살림 팔 C1이 도달 가능성이다 — 수리 전 거동에서 같은 좌표의 사선이 "
        + "실제로 사라지고(`in_doc` false) 차수가 움직인다(`state.revived`).",
      reachability_source: "state/revived",
      reachability_value: { order_before: orderBeforeRevive, order_after: stateC.order },
    },
    pitfall_citations: [12, 21, 25, 38, 43, 52, 53],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "post_confirm_trace.json"), JSON.stringify(ledger, null, 1));

  // ---- 표식이 실제로 남는다 — 각 팔에 최소한 최종 상태가 있다
  for (const r of rows) {
    if (r.id == null) continue;                       // 지평선·탭 — 획이 아니다
    const steps = r.steps as { at: string }[];
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some(s => s.at === "final")).toBe(true);
  }
  // ---- 작도선 둘 + 되살림 팔만 문서에서 빠진다 — vp_fixed_delete는 거기서만 발화한다
  const del = rows.filter(r => (r.steps as { at: string }[])
    .some(s => s.at === "vp_fixed_delete"));
  expect(del.map(r => r.label)).toEqual([
    "A1 깊이선1 → 1점 확정(작도선 — 문서에서 빠진다)",
    "B0 깊이선2 → 2점 승격(작도선 — 문서에서 빠진다)",
    "C1 [되살림 · 수리 전 거동] 그리기 국면의 사선",
  ]);
  // ---- 되살림 팔 — 수리 전 거동에서는 그 사선이 실제로 사라지고 차수가 조용히 움직인다
  const c1 = rows.find(r => (r.label as string).startsWith("C1"))!;
  expect(c1.in_doc).toBe(false);
  expect(orderBeforeRevive).toBe(1);
  expect(stateC.order).toBe(2);
  // ---- 작도선이 아닌 확정 후 획은 전부 문서에 남는다
  for (const r of rows) {
    if (r.id == null || del.includes(r)) continue;
    expect(r.in_doc, `${r.label} — 문서에 남아야 한다`).toBe(true);
    // 2D 대기면 실제로 그려졌다(drawn_alpha) · 3D면 three가 그린다(lifted_ids)
    if (r.seg3d) {
      expect((r.render as any).lifted_ids).toContain(r.id);
    } else {
      expect(r.drawn_alpha, `${r.label} — 대기 획이 화면에 없다`).not.toBeNull();
      expect(r.drawn_alpha as number).toBeGreaterThan(0);
    }
  }
  expect(errors).toEqual([]);
});
