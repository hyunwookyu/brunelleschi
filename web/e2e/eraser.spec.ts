// **지우개 종단**(2026-08-17 지시 I) — 조각·부분 지우개가 앱 경로로 실제로 깎는가,
// 그리고 **앵커 종속 규칙**(지운 조각이 다른 획의 앵커였으면)이 정의대로 동작하는가.
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

declare global { interface Window { S2S: any } }

test("조각·부분 지우개 — 교차가 조각을 가르고, 앵커는 점을 따라간다", async ({ page }) => {
  await page.goto("/l.html");
  await setupConfirmed(page);

  // 상자 모서리 하나를 가로지르는 획을 **3D로 직접** 넣는다 — 교차(X)를 확실히 만든다.
  // (실포인터 배치는 스냅·축에 좌우돼 교차 위치가 흔들린다 — 여기서 재는 것은 지우개다)
  const setup = await page.evaluate(async () => {
    const S = window.S2S;
    const doc = await import("/src/ui/doc.ts");
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const base = S.doc().strokes.find((s: any) => s.seg3d)!;      // 상자 모서리 하나
    const [A, B] = base.seg3d;
    const mid = [0, 1, 2].map(k => (A[k] + B[k]) / 2);
    // base와 중점에서 교차하는 획 — base에 수직인 방향으로 좌우로 뻗는다
    const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const n = Math.hypot(...d);
    const u = [d[1] / n, -d[0] / n, 0];                           // 대충 직교(같은 평면 아님이어도 접촉 허용 안)
    const cross = doc.newSStroke([[10, 10], [20, 20]], S.doc().currentView, "guide");
    cross.seg3d = [
      [mid[0] - u[0], mid[1] - u[1], mid[2] - u[2]],
      [mid[0] + u[0], mid[1] + u[1], mid[2] + u[2]],
    ];
    cross.axis = "free";
    // **cross를 앵커로 쓰는 획**을 하나 둔다 — 앵커 점은 cross의 t=0.75 쪽 절반에 있다
    const q = [mid[0] + 0.5 * u[0], mid[1] + 0.5 * u[1], mid[2] + 0.5 * u[2]];
    const dep = doc.newSStroke([[30, 30], [40, 40]], S.doc().currentView, "guide");
    dep.seg3d = [[q[0], q[1], q[2]], [q[0] + 0.3, q[1], q[2]]];
    dep.axis = "free";
    dep.snapStart = { kind: "on_edge", at: [q[0], q[1], q[2]], ofId: cross.id };
    S.doc().strokes.push(cross, dep);
    S.refresh();
    const p2 = g3.project(mid, ctx.principal, ctx.f)!;
    // 지울 지점: cross의 t=0.25쪽(앵커 반대편) 화면 자리
    const quarter = [mid[0] - 0.5 * u[0], mid[1] - 0.5 * u[1], mid[2] - 0.5 * u[2]];
    const pQuarter = g3.project(quarter, ctx.principal, ctx.f)!;
    return { crossId: cross.id, depId: dep.id, mid2: p2, pQuarter,
             cuts: S.cutsOf(cross.id), strokes: S.doc().strokes.length };
  });
  // **교차가 절단점을 만든다** — base와의 X 교차 하나(t=0.5)
  expect((setup.cuts as number[]).length).toBeGreaterThanOrEqual(1);

  // ---- 조각 지우개: 앵커 **반대편** 조각을 지운다 → 앵커는 살아남은 조각으로 이관된다
  const afterSeg = await page.evaluate((arg) => {
    const S = window.S2S;
    const ok = S.eraseSegmentAt(arg.pQuarter);
    const dep = S.doc().strokes.find((x: any) => x.id === arg.depId);
    const crossGone = !S.doc().strokes.some((x: any) => x.id === arg.crossId);
    return { ok, crossGone,
             dep_anchor: dep.snapStart ? dep.snapStart.ofId : null,
             strokes: S.doc().strokes.length };
  }, setup);
  expect(afterSeg.ok).toBe(true);
  expect(afterSeg.crossGone).toBe(true);              // 원 획은 조각들로 갈아 끼워졌다
  // **앵커 이관**: dep의 ofId가 살아남은 조각 id로 넘어갔다(끊기지 않았다)
  expect(afterSeg.dep_anchor).not.toBeNull();
  expect(afterSeg.dep_anchor).not.toBe(setup.crossId);

  // ---- 부분 지우개: 남은 조각의 가운데를 스치면 **지나간 자리만** 빠진다(조각 수 +1)
  const afterPart = await page.evaluate((arg) => {
    const S = window.S2S;
    const before = S.doc().strokes.length;
    S.erasePart([arg.mid2, [arg.mid2[0] + 2, arg.mid2[1] + 2]]);
    return { before, after: S.doc().strokes.length };
  }, { mid2: [ (setup.mid2 as number[])[0], (setup.mid2 as number[])[1] ] });
  // 가운데를 깎으면 한 획이 두 조각이 된다(+1) — 아무것도 안 맞았으면 그대로다
  expect(afterPart.after).toBeGreaterThanOrEqual(afterPart.before);

  // ---- 실행취소가 지우개를 되돌린다
  const undone = await page.evaluate((n0) => {
    const S = window.S2S;
    document.querySelector<HTMLButtonElement>('#bar button[data-act="undo"]')!.click();
    document.querySelector<HTMLButtonElement>('#bar button[data-act="undo"]')!.click();
    return { strokes: S.doc().strokes.length, back_to: n0 };
  }, setup.strokes);
  expect(undone.strokes).toBe(setup.strokes);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "eraser.json"), JSON.stringify({
    spec: "지시 I — 조각·부분 지우개와 앵커 이관. 앱 경로(S2S.eraseSegmentAt/erasePart) 그대로",
    gate: {
      registered: "① 교차가 절단점을 만든다(cuts ≥ 1) ② 조각 지우개가 원 획을 조각으로 갈아 끼운다 "
        + "③ 앵커 ofId가 살아남은 조각으로 이관된다(끊기지 않음) ④ 부분 지우개가 조각 수를 안 줄인다 "
        + "⑤ 실행취소 2회가 완전 복원. ⚠ 이 항목이 등록한 게이트다 — CLAUDE.md §2 중단 조건 아님(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①). 앵커 규칙 전문은 split.ts의 reanchorId",
      // ⚠ 옛 판은 `n_cuts`(=2)를 값으로 적었다 — 게이트 조항 ①의 측정값이자 픽스처가
      // 구성으로 만든 절단 수의 항등이다(#40 ⚠⚠ — 4차 재검 [12-a]가 잡았다)
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 판정 조항의 측정값 밖에서 이 게이트를 넘을 수 있는 독립 값이 없다(4차 재검 [12-a])",
    },
    measured: { setup: { cuts: setup.cuts, n_cuts: (setup.cuts as number[]).length,
                         strokes: setup.strokes },
                afterSeg, afterPart, undone },
    thresholds_note: "SPLIT_TOL(contact_ratio 0.01 · end_margin 0.02 · merge_t 0.01)은 "
      + "constants.ts 비등재 — 전역 해시 눈사태(D-L51·54 선례, D-L56). 값은 여기 적는다",
    what_this_does_not_say: [
      "합성 교차 하나의 픽스처다 — 획이 많은 그림의 분할 성능·조각 폭주는 안 쟀다",
      "그리는 시점의 자동 분할은 배선하지 않았다(D-L56) — 분할은 지우개가 조각을 집을 때 계산된다",
    ],
    constants: constantsSnapshot(),
    metric_defs: { ...metricsSnapshot(), uses_metrics: false },
  }, null, 1));
});
