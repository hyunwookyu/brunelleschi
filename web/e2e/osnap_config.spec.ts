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
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
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
    // ① 반경 15px(⚠ D-L85로 기본은 8이 됐다 — 이 팔은 **반경이 실제로 가르는가**의
    //    메커니즘 확인이라 값 15·40을 명시적으로 쓴다)에서는 22px 밖이라 안 붙는다 →
    //    40px로 넓히면 붙는다
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
    S.setOsnap({ radiusPx: 8, kinds: { endpoint: true, vertex: true } });    // 기본 복원(D-L85)
    // ③ **수직점** — 다른 획의 안쪽에 내린 수선의 발. `from`(앵커)이 있어야 정의된다
    const seg = S.doc().strokes.find((s: any) => s.seg3d && s.id !== st.id)!;
    // ⚠ **초판은 수선 발을 중점에 두었다**(11차 항목 3-d · #46): 그러면 중점 스냅이 늘
    // 이기고 단언 `["perpendicular","midpoint"]`는 **픽스처가 보장하는 통과**였다 —
    // 수직점이 안 돌아도 통과한다. 발을 **t = 0.3**으로 옮겨 중점과 갈라 놓고
    // `perpendicular`를 **정확히** 요구한다.
    const A = seg.seg3d[0] as number[], B = seg.seg3d[1] as number[];
    const T = 0.3;
    const foot3 = [0, 1, 2].map(k => A[k] + (B[k] - A[k]) * T);
    const mid3 = [0, 1, 2].map(k => (A[k] + B[k]) / 2);
    // 앵커는 **선분에 수직으로** 비켜 세운다 — 그래야 수선의 발이 정확히 t=0.3이다
    const d = [0, 1, 2].map(k => B[k] - A[k]);
    const dn = Math.hypot(d[0], d[1], d[2]) || 1;
    const u = d.map(v => v / dn);
    const pick = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const dot = pick[0] * u[0] + pick[1] * u[1] + pick[2] * u[2];
    const w = pick.map((v, k) => v - dot * u[k]);
    const wn = Math.hypot(w[0], w[1], w[2]) || 1;
    const from = foot3.map((v, k) => v + (w[k] / wn) * 0.5);
    const foot2 = g3.project(foot3, ctx.principal, ctx.f)!;
    const mid2 = g3.project(mid3, ctx.principal, ctx.f)!;
    const near: [number, number] = [foot2[0] + 4, foot2[1] + 3];
    const cand = S.endSnap(from, near);
    out.perp_kind = cand?.kind ?? null;
    out.perp_t = T;
    // **중점이 이 자리를 못 먹는다는 실측** — 겨냥점에서 중점까지의 화면 거리(px).
    // 조리개(8px)보다 크면 중점은 후보가 아니다(그 사실이 판별을 만든다).
    out.perp_mid_px = Math.hypot(mid2[0] - near[0], mid2[1] - near[1]);
    // ⚠ **이 값은 픽스처가 정한다**(11차 리뷰어 [10] · #46) — 겨냥점을 발에서 (4,3)만큼
    // 띄웠으므로 정확히 5px이다. 판별을 만드는 것은 이 값이 아니라 **중점이 조리개 밖**
    // 이라는 사실(`perp_mid_px` > `perp_radius_px`)이다.
    out.perp_foot_px = Math.hypot(foot2[0] - near[0], foot2[1] - near[1]);
    out.perp_foot_px_fixture_determined = true;
    out.perp_radius_px = 8;                     // 위에서 기본으로 되돌린 값(D-L85)
    return out;
  });

  // **반경이 실제로 좁혔다**: 22px 밖의 끝점은 15px 조리개에 안 잡힌다(잡히는 것이 있다면
  // 조리개 안의 다른 종류 — 예: 모서리 위 점 — 이고, 그 거리는 15px 이하다)
  expect(["endpoint", "vertex"]).not.toContain(r.r15 as string);
  if (r.r15 != null) expect(r.r15_dist as number).toBeLessThanOrEqual(15);
  expect(["endpoint", "vertex"]).toContain(r.r40 as string);
  expect(["endpoint", "vertex"]).not.toContain(r.no_endpoint as string);  // **종류 토글이 가른다**
  // **수직점이 발화한다**(11차 항목 3-d — 판별이 서는 형태로 고쳤다): 발을 t=0.3에 두어
  // 중점과 갈라 놓았으므로 `perpendicular`를 정확히 요구한다. 중점이 조리개 밖이라는 것을
  // 같은 실행이 실측으로 든다(그 값이 판별의 근거다 — #46: 상수가 아니라 실행의 양이다)
  expect(r.perp_kind as string).toBe("perpendicular");
  expect(r.perp_mid_px as number).toBeGreaterThan(r.perp_radius_px as number);
  expect(r.perp_foot_px as number).toBeLessThanOrEqual(r.perp_radius_px as number);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "osnap_config.json"), JSON.stringify({
    spec: "지시 H — 앱 조리개(px)·종류 토글·수직점 발화. 앱 경로(S2S.snap = appSnapAt) 그대로",
    thresholds: { radius_px_default: OSNAP_RADIUS_PX, radius_px_ui_range: [4, 40],
      note: "constants.ts 비등재 사유는 D-L56 — 전역 해시 눈사태(D-L51·54 선례). "
        + "⚠ CSS px 임계이고 dpr 2 실기 확인은 없다(#21 — DEFERRED)" },
    gate: {
      registered: "① 22px 오조준이 15px 조리개에서 끝점으로 안 붙는다(잡혀도 dist ≤ 15) "
        + "② 40px로 넓히면 끝점이 붙는다 ③ 끝점·정점을 끄면 그 종류가 안 나온다 "
        + "④ **수직점이 발화한다** — 발을 t=0.3에 두어 중점과 갈라 놓고 `perpendicular`를 정확히 요구한다(11차 항목 3-d. 옛 조항 ‘수직점 **또는 같은 자리의 중점**’은 중점이 늘 이기는 자리라 **픽스처가 보장하는 통과**였다 — #46). 같은 실행이 중점까지의 화면 거리(`perp_mid_px`)와 조리개(`perp_radius_px`)를 든다. ⚠ **가르는 것은 존재이지 순위가 아니다**(11차 리뷰어 [10]): 중점이 조리개 **밖**이라 이 팔은 ‘수직점이 돈다’를 가르지 ‘수직점이 중점을 이긴다’를 가르지 않는다. `perp_foot_px`는 픽스처가 정한 값이라 그렇게 표시한다(#46). ⚠ 이 항목이 등록한 게이트다 — "
        + "CLAUDE.md §2 중단 조건 아님(#41)",
      reachability: "오라클 없음 — `reachability_absent` 참조(#40 규칙 ①)",
      // ⚠ 옛 판은 `r40_dist`를 값으로 적었다 — 그것은 게이트 조항 ②의 측정값 자신이자
      // 픽스처가 준 오조준(22px)의 되읽기다(#40 ⚠⚠ — 4차 재검 [12-a]가 잡았다.
      // 항목 1 [7]·항목 2 [B-3]과 같은 정정). `r15_dist` 0도 보장이라 못 쓴다(#40②).
      reachability_absent: "**배선 확인이라 도달 가능성 오라클이 성립하지 않는다** — 판정 조항의 측정값 밖에서 이 게이트를 넘을 수 있는 독립 값이 없다(4차 재검 [12-a])",
    },
    measured: r,
    what_this_does_not_say: [
      "⚠ 기본값 서술은 D-L85(10차 항목 4)로 낡았다 — **기본은 8px**이고 이 팔의 15·40은 메커니즘 확인용 명시값이다. (구 서술:) 15px가 **옳은 기본값이라는 것** — 합성 측정은 반대를 가리킨다(D-L56: `snap.json@54346ad1` 스윕에서 "
        + "그 대역의 맞음 0.53~0.63·미스 0.18~0.26 대 0.05의 0.90·0.013). 실획(snapDistPx)이 판정한다",
      "dpr 2 — dpr 1 실행이다(#21)",
    ],
    constants: constantsSnapshot(),
    metric_defs: { ...metricsSnapshot(), uses_metrics: false },
  }, null, 1));
});
