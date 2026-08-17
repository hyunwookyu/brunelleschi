// **오스냅 설정**(2026-08-17 지시 H) — 반경(화면 px)·종류별 토글이 실제로 스냅을 가른다.
//
// 라이노 선례: 조리개는 절대 px(10~15), 종류는 켜고 끈다. 앱의 모든 스냅 질의가
// `appSnapAt`(종류 필터 + px→비 환산) 하나를 지나므로(#17) `S2S.snap`으로 재면 앱 경로다.
// **수직점(perp)**: 지시가 "동작 확인하고 없으면 넣는다" — 있고, 여기서 발화를 잠근다.
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

declare global { interface Window { S2S: any } }

test("반경·종류·수직점 — 설정이 스냅을 실제로 가른다", async ({ page }) => {
  await page.goto("/l.html");
  await setupConfirmed(page);

  const r = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const st = S.doc().strokes.find((s: any) => s.seg3d)!;
    const pEnd = g3.project(st.seg3d[0], ctx.principal, ctx.f)!;   // 어떤 끝점의 화면 자리
    const off: [number, number] = [pEnd[0] + 22, pEnd[1]];         // 끝점에서 22px 옆

    const out: Record<string, unknown> = {};
    // ① 반경 15px(기본)에서는 22px 밖이라 안 붙는다 → 40px로 넓히면 붙는다
    S.setOsnap({ radiusPx: 15 });
    const c15 = S.snap(off);
    out.r15 = c15?.kind ?? null;
    out.r15_dist = c15?.dist ?? null;
    S.setOsnap({ radiusPx: 40 });
    const c40 = S.snap(off);
    out.r40 = c40?.kind ?? null;
    out.r40_dist = c40?.dist ?? null;
    // ② 끝점·정점을 끄면 같은 자리에서 그 종류가 안 나온다(라이노의 종류 토글)
    S.setOsnap({ kinds: { endpoint: false, vertex: false } });
    out.no_endpoint = S.snap(off)?.kind ?? null;
    S.setOsnap({ radiusPx: 15, kinds: { endpoint: true, vertex: true } });   // 기본 복원
    // ③ **수직점** — 다른 획의 안쪽에 내린 수선의 발. `from`(앵커)이 있어야 정의된다
    const seg = S.doc().strokes.find((s: any) => s.seg3d && s.id !== st.id)!;
    const mid3 = [0, 1, 2].map(k => (seg.seg3d[0][k] + seg.seg3d[1][k]) / 2);
    // 앵커를 그 선분에서 비켜 세운다(수선이 안쪽에 떨어지게 중점 근처를 겨냥)
    const from = [mid3[0] + 0.4, mid3[1] - 0.3, mid3[2] + 0.2];
    const foot2 = g3.project(mid3, ctx.principal, ctx.f)!;
    const near: [number, number] = [foot2[0] + 4, foot2[1] + 3];
    const cand = S.endSnap(from, near);
    out.perp_kind = cand?.kind ?? null;
    return out;
  });

  // **반경이 실제로 좁혔다**: 22px 밖의 끝점은 15px 조리개에 안 잡힌다(잡히는 것이 있다면
  // 조리개 안의 다른 종류 — 예: 모서리 위 점 — 이고, 그 거리는 15px 이하다)
  expect(["endpoint", "vertex"]).not.toContain(r.r15 as string);
  if (r.r15 != null) expect(r.r15_dist as number).toBeLessThanOrEqual(15);
  expect(["endpoint", "vertex"]).toContain(r.r40 as string);
  expect(["endpoint", "vertex"]).not.toContain(r.no_endpoint as string);  // **종류 토글이 가른다**
  // **수직점이 발화한다** — 끝점·중점이 이길 수 있는 자리라 종류만 확인한다(중점도 정답이면
  // 그 자리가 수선 발과 겹친 것이므로 perpendicular 또는 midpoint를 받는다)
  expect(["perpendicular", "midpoint"]).toContain(r.perp_kind as string);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "osnap_config.json"), JSON.stringify({
    spec: "지시 H — 앱 조리개(px)·종류 토글·수직점 발화. 앱 경로(S2S.snap = appSnapAt) 그대로",
    thresholds: { radius_px_default: 15, radius_px_ui_range: [4, 40],
      note: "constants.ts 비등재 사유는 D-L56 — 전역 해시 눈사태(D-L51·54 선례). "
        + "⚠ CSS px 임계이고 dpr 2 실기 확인은 없다(#21 — DEFERRED)" },
    gate: {
      registered: "① 22px 오조준이 15px 조리개에서 끝점으로 안 붙는다(잡혀도 dist ≤ 15) "
        + "② 40px로 넓히면 끝점이 붙는다 ③ 끝점·정점을 끄면 그 종류가 안 나온다 "
        + "④ 수직점(또는 같은 자리의 중점)이 발화한다. ⚠ 이 항목이 등록한 게이트다 — "
        + "CLAUDE.md §2 중단 조건 아님(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      // ⚠ 옛 판은 `r40_dist`를 값으로 적었다 — 그것은 게이트 조항 ②의 측정값 자신이자
      // 픽스처가 준 오조준(22px)의 되읽기다(#40 ⚠⚠ — 4차 재검 [12-a]가 잡았다.
      // 항목 1 [7]·항목 2 [B-3]과 같은 정정). `r15_dist` 0도 보장이라 못 쓴다(#40②).
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 판정 조항의 측정값 밖에서 이 게이트를 넘을 수 있는 독립 값이 없다(4차 재검 [12-a])",
    },
    measured: r,
    what_this_does_not_say: [
      "15px가 **옳은 기본값이라는 것** — 합성 측정은 반대를 가리킨다(D-L56: `snap.json@54346ad1` 스윕에서 "
        + "그 대역의 맞음 0.53~0.63·미스 0.18~0.26 대 0.05의 0.90·0.013). 실획(snapDistPx)이 판정한다",
      "dpr 2 — dpr 1 실행이다(#21)",
    ],
    constants: constantsSnapshot(),
    metric_defs: { ...metricsSnapshot(), uses_metrics: false },
  }, null, 1));
});
