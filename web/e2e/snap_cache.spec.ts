// **7차 항목 2 — 스냅 정적 후보 캐시의 뷰 전환 무효화** 종단 확인.
// 산출: `stage0/out/snap_cache.json`.
//
// 실획 첫 표본(2026-08-17 지시)의 "snapEnd 전부 null · 시작 전부 on_face"가 잡은 자리다:
// 정적 후보(`snapPre` — 끝점·정점·중점·교차점)는 질의 시점의 **뷰 좌표**인데, 옛 판은
// 기하 변경(syncScene)에만 캐시를 무효화해서 **궤도·뷰 전환 뒤 첫 질의**가 이전 뷰 좌표의
// 후보를 현재 카메라로 투영했다 — 정밀 후보 전부가 엉뚱한 화면 자리로 가고, 캐시 밖에서
// 매번 계산되는 on_face(지면)만 살아남았다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   **#21(버그를 되살려 실패를 먼저 확인)** — 수정 전 실행에서 이 스펙의 "왕복 직후 끝점"
//   단언이 실제로 실패한다(아래 완료 기록 참조) · **#34**(무효화 지점 하나가 아니라 캐시
//   키(poseKey) 비교로 모든 질의 경로를 덮는다 — 이 스펙은 그중 하나(호버 오염 → 질의)를
//   재현한다) · **#30**(음성 채널 — 낡은 후보가 실제로 얼마나 벗어나는지(px)를 함께 잰다) ·
//   **#25**(수치는 이 원장에) · **#12**(질의 지점: 끝점 둘(가까운·먼)을 겨냥한다).
//
// **이 확인이 말하지 않는 것**: 실획 재현(합성 상자다) · 반경 15px의 적정성(그 답은 실획
// `snapDistPx` 분포가 한다 — 같은 항목이 측정을 수리했다).
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { gate } from "../test/gate.js";
import { setupConfirmed, openDrawing } from "./fixture.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const led: Record<string, unknown> = {};

declare global {
  interface Window { S2S: any; __SC: any }
}

test("뷰 왕복 직후 첫 질의가 끝점을 문다(캐시가 시점을 키로 갖는다)", async ({ page }) => {
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await openDrawing(page);
  led.setup = await setupConfirmed(page);

  // ---- 확정 뷰에서 3D 끝점 둘의 화면 자리(참조) — 왕복 뒤 이 자리를 겨냥한다
  const targets = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const segs = S.doc().strokes.filter((s: any) => s.seg3d);
    const pts = [segs[0].seg3d[0], segs[segs.length - 1].seg3d[1]];
    return pts.map((p: number[]) => g3.project(p, ctx.principal, ctx.f));
  });

  // ---- 기준: 왕복 **전**의 질의(오염 없는 캐시) — 무엇이 물리는가
  led.before_roundtrip = await page.evaluate((ts) =>
    ts.map((t: number[]) => {
      const c = window.S2S.snap([t[0] + 3, t[1] + 3]);
      return c ? { kind: c.kind, dist: +c.dist.toFixed(2) } : null;
    }), targets);

  // ---- 오염: 회전 시점으로 가서, **그 시점에서 기하가 바뀐 뒤**(캐시 리셋 — 실사용에서는
  //      돌린 시점에서 획 하나를 긋는 순간이다) 호버가 캐시를 **그 시점 좌표로** 다시 채운다.
  //      ⚠ 리셋 없이 왕복만 하면 옛 판(`??=`)은 확정 뷰 캐시를 그대로 들고 있어 우연히 맞았다 —
  //      결함은 "마지막으로 캐시를 만든 시점 ≠ 질의 시점"에서 난다
  const roundtrip = await page.evaluate(() => {
    const S = window.S2S;
    S.stage.snapToDir([0.55, 0.4, -0.73], S.orbitCenter(), 0);   // 뷰 큐브의 절대 스냅 경로
    S.setShowGuides(true);                                       // syncScene → 캐시 리셋(앱 경로)
    return { pinned: S.camPose().pinned, pose: S.pose() };
  });
  expect(roundtrip.pinned).toBe(false);
  await page.mouse.move(400, 400);                               // 호버 → 회전 시점 좌표로 캐시 구축
  await page.mouse.move(430, 420);
  // ---- 확정 뷰로 되돌아와 **다른 조작 없이 바로** 질의한다 — 실획의 "돌려 보고 이어 긋기"
  const after = await page.evaluate((ts) => {
    const S = window.S2S;
    S.switchView(S.doc().views.find((v: any) => v.pose === null).id);
    return ts.map((t: number[]) => {
      const c = S.snap([t[0] + 3, t[1] + 3]);
      return c ? { kind: c.kind, dist: +c.dist.toFixed(2) } : null;
    });
  }, targets);
  led.after_roundtrip = after;

  // ---- 음성 채널(#30): 낡은 캐시가 가리켰을 자리 — 회전 시점 좌표의 그 끝점을 확정
  //      카메라로 투영하면 참 자리에서 얼마나 벗어나는가(버그가 만들던 어긋남의 크기)
  led.stale_offset_px = await page.evaluate(async (arg) => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const vc = await import("/src/s3d/viewCamera.ts");
    const ctx = S.cam.ctx();
    const segs = S.doc().strokes.filter((s: any) => s.seg3d);
    const pts = [segs[0].seg3d[0], segs[segs.length - 1].seg3d[1]];
    const offsets: number[] = [];
    let behind = 0;
    pts.forEach((p: number[], i: number) => {
      const staleAt = vc.toView(arg.pose, p);                    // 회전 시점 좌표(낡은 캐시의 at)
      const proj = g3.project(staleAt, ctx.principal, ctx.f);    // 그것을 확정 카메라로 투영
      if (!proj) { behind += 1; return; }                        // 카메라 뒤 — 후보 자체가 죽는다
      offsets.push(+Math.hypot(proj[0] - arg.ts[i][0], proj[1] - arg.ts[i][1]).toFixed(1));
    });
    return { offsets, behind_camera: behind };
  }, { pose: roundtrip.pose, ts: targets });

  // **수정의 본체** — 왕복 직후 첫 질의가 정밀 대상(끝점·정점)을 문다.
  // 수정 전에는 캐시가 회전 시점 좌표라 정밀 후보가 밀려나 **on_edge**(캐시 밖에서 매번
  // 계산되는 하위 대체)로 떨어졌다(#21 — 이 스펙의 수정 전 실행이 그 값으로 실패했다).
  for (const c of after) {
    expect(c).not.toBeNull();
    expect(["endpoint", "vertex", "midpoint", "intersection"]).toContain(c!.kind);
  }
  // 왕복 전과 같은 대상이 물린다 — 왕복이 스냅을 바꾸면 안 된다
  expect(after.map((c: any) => c?.kind)).toEqual(
    (led.before_roundtrip as any[]).map((c: any) => c?.kind));

  // ---- **수리된 겨냥 거리의 산출 증거**(2-R″ [3] — 지시 2-b의 산출물을 원장에): 끝점에서
  //      ~8px 벗어난 자리에서 실제로 긋고, 그 획의 snapDistPx가 **0도 null도 아닌** 값(원시
  //      시작점 → 최근접 정밀 대상)으로 적히는가. 옛 정의는 이 자리에서 0(on_face) 또는
  //      cand.dist였다 — 실획 첫 표본의 "전부 0"이 그 서명이다.
  const frame0 = await page.locator("#frame").boundingBox();
  const t0 = targets[0];
  await page.mouse.move(frame0!.x + t0[0] + 5.7, frame0!.y + t0[1] + 5.7);
  await page.mouse.down();
  await page.mouse.move(frame0!.x + t0[0] + 90, frame0!.y + t0[1] + 60, { steps: 6 });
  await page.mouse.up();
  led.aim_dist_px_sample = await page.evaluate(() => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    return { snap_start_kind: st.snapStart?.kind ?? null,
             snap_dist_px: st.snapDistPx == null ? null : +st.snapDistPx.toFixed(2),
             osnap_radius_px: S.osnap().radiusPx };
  });
  expect((led.aim_dist_px_sample as any).snap_dist_px).not.toBeNull();
  expect((led.aim_dist_px_sample as any).snap_dist_px).toBeGreaterThan(0);   // 0 오염이 아니다
  expect((led.aim_dist_px_sample as any).snap_dist_px)
    .toBeLessThanOrEqual((led.aim_dist_px_sample as any).osnap_radius_px);   // 조리개 안 겨냥

  // ---- **옛 정의의 되살림**(#21 — 3·4-R [7]): 정밀 대상에서 조리개 밖(>15px)이고 지면이
  //      받는 자리. 옛 정의(스냅된 후보의 dist)는 여기서 **on_face의 정의상 0**을 적었다 —
  //      그 값을 이 실행에서 그대로 재고(old_def_dist = 그 자리의 스냅 결과 dist), 새 정의가
  //      같은 획에 적는 값(조리개 밖·프로브 안의 실제 겨냥 거리)과 대조한다. 실획 첫 표본의
  //      "전부 0"이 정확히 이 형태였다.
  // 지점 선택: 어느 획 끝점의 **연장 방향으로 25px** — 세그먼트 몸통에서도 25px 떨어져
  // on_edge(조리개 15px)가 못 받고, 지평선 아래라 지면(on_face)이 받는 자리다.
  const farStart = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const hy = S.horizon().y;
    for (const s of S.doc().strokes) {
      if (!s.seg3d) continue;
      for (const [e, f] of [[0, 1], [1, 0]]) {
        const pe = g3.project(s.seg3d[e], ctx.principal, ctx.f);
        const pf = g3.project(s.seg3d[f], ctx.principal, ctx.f);
        if (!pe || !pf) continue;
        const L = Math.hypot(pe[0] - pf[0], pe[1] - pf[1]);
        if (L < 1e-6) continue;
        const p: [number, number] = [pe[0] + (25 * (pe[0] - pf[0])) / L,
                                     pe[1] + (25 * (pe[1] - pf[1])) / L];
        if (p[0] < 20 || p[0] > el.clientWidth - 20 || p[1] < hy + 10
            || p[1] > el.clientHeight - 20) continue;
        const c = S.snap(p);                    // 옛 정의가 적었을 값 — 스냅 결과의 dist
        if (!c || c.kind !== "on_face") continue;   // on_edge 등이 받는 자리면 다음 후보
        return { p, old_def_kind: c.kind, old_def_dist: +c.dist.toFixed(4) };
      }
    }
    return null;
  });
  expect(farStart).not.toBeNull();
  led.far_aim = { old_def_kind: (farStart as any).old_def_kind,
                  old_def_dist: (farStart as any).old_def_dist };
  const fp = (farStart as any).p as [number, number];
  await page.mouse.move(frame0!.x + fp[0], frame0!.y + fp[1]);
  await page.mouse.down();
  await page.mouse.move(frame0!.x + fp[0] + 90, frame0!.y + fp[1] + 60, { steps: 6 });
  await page.mouse.up();
  led.far_aim = await page.evaluate((prev) => {
    const S = window.S2S;
    const st = S.doc().strokes[S.doc().strokes.length - 1];
    return { ...prev, snap_start_kind: st.snapStart?.kind ?? null,
             snap_dist_px: st.snapDistPx == null ? null : +st.snapDistPx.toFixed(2) };
  }, led.far_aim);
  expect((led.far_aim as any).old_def_kind).toBe("on_face");   // 옛 정의가 잡던 그 후보
  expect((led.far_aim as any).old_def_dist).toBe(0);           // **옛 정의의 0 — 버그의 되살림**(#21)
  expect((led.far_aim as any).snap_dist_px).not.toBeNull();
  // **조리개 밖 겨냥이 이제 보인다** — 경계는 앱 기본 조리개다(D-L85로 15 → 8.
  // 옛 15 단언은 "겨냥점 25px 밖"의 최근접 후보가 다른 정밀 후보일 때 깨진다 — 재는 것은
  // "조리개 밖의 겨냥도 기록된다"이지 특정 거리가 아니다)
  expect((led.far_aim as any).snap_dist_px).toBeGreaterThan(8);
  expect((led.far_aim as any).snap_dist_px).toBeLessThanOrEqual(40);
});

test.afterAll(() => {
  led.spec = "7차 항목 2 — 스냅 정적 후보 캐시가 시점(poseKey)을 키로 갖는다: 뷰 왕복 직후 첫 질의가 끝점을 문다";
  led.constants = constantsSnapshot();
  led.metric_defs = metricsSnapshot();
  led.what_this_does_not_say = [
    "실획 재현이 아니다 — 합성 상자·참 소실점 픽스처다(AS-C1)",
    "dpr 1·데스크톱 뷰포트 1440×900·합성 포인터다(#21) — iPad 실기는 안 덮는다",
    "반경(기본 8px — D-L85 · resolve2d.OSNAP_RADIUS_PX, 설정 4~40px 가변)의 적정성은 여기서 안 " +
      "갈린다 — 실획 snapDistPx 분포(수리된 정의 aimDistPx — 필드명은 그대로다)가 답한다. " +
      "⚠ **그 분포의 뜻이 15차 D-L103으로 갈렸다**(호버 잠금): 잠금으로 붙은 획은 " +
      "snapDistPx가 조리개보다 **클 수 있다**(붙은 획은 조리개 이하라는 전제가 깨졌다). " +
      "15차 이후 표본으로 반경을 판정하려면 잠금으로 붙은 획을 갈라야 한다 — `DEFERRED`",
    "왕복 질의의 표본은 **끝점 2건**이다 — 정점·중점·교차점 표본 0(2-R″ [8]. 같은 정적 캐시의 " +
      "종류들이라 기전은 같지만 값으로는 안 덮었다) · 반경·자세·캔버스도 각 하나다(#12)",
    "stale_offset_px.behind_camera는 낡은 후보가 카메라 뒤로 가 아예 죽는 경우의 수다 — " +
      "이 실행에서는 0(관측 없음)이고, 그때 옛 판이 후보를 잃는다는 것은 기하 서술이지 실측이 아니다",
  ];
  // 음성 팔 값들을 한 경로에 — selfcheck 값 대조(#33)가 푼다
  led.gate_oracle_values = [...(led as any).stale_offset_px.offsets,
                            (led as any).far_aim.snap_dist_px];
  led.gate = gate({
    registered: "⚠ 이 항목이 등록한 게이트다 — CLAUDE.md §2의 중단 조건(camera_gate)이 "
      + "아니다(#41). 확정 뷰 ↔ 회전 시점 왕복(그 시점에서 기하 변경·호버 오염 포함) 직후의 "
      + "첫 질의가 왕복 전과 같은 **끝점**을 문다(정점·중점·교차점은 표본 0 — what_not_say). "
      + "그리고 끝점 곁 ~8px에서 그은 획의 snapDistPx가 0도 null도 아닌 조리개 안 값으로 적히고, "
      + "조리개 밖(~22px) 지면 시작 획의 snapDistPx도 실거리로 적힌다(옛 정의는 그 자리가 0 — "
      + "far_aim.old_def_dist가 이 실행의 되살림이다). "
      + "⚠ 기준 등록 시점(#26): 스펙 작성(첫 실행 전)에 등록했고, [8] 대응의 '끝점' 좁힘과 "
      + "far_aim 팔 추가는 측정 뒤의 **모집단 명시·팔 추가**다 — 통과선 수치는 안 움직였다",
    reachability: "음성 채널(#30) — ①(캐시): 낡은 캐시의 후보가 확정 카메라에서 참 자리를 "
      + "벗어나는 거리(stale_offset_px 두 값 — 수백 px대. 이 원장의 osnap_radius_px = 15와 "
      + "자릿수로 갈린다). ②(겨냥 거리): far_aim의 새 정의 값(셋째 값 — 조리개 밖 실거리). "
      + "옛 정의의 대응값은 far_aim.old_def_dist = 정확히 0(버그의 구성상 산물이라 "
      + "reachability_value에 안 넣는다 — #40 ②의 0·1 규칙. 값 자체는 원장 far_aim에 있다)",
    reachability_value: (led as any).gate_oracle_values,
    reachability_source: "gate_oracle_values",
    result: { before: led.before_roundtrip, after: led.after_roundtrip,
              aim_dist_px_sample: led.aim_dist_px_sample, far_aim: led.far_aim },
    note: "수정 전 재현(#21): 같은 스펙이 after에서 **on_edge**(캐시 밖 하위 대체)를 물어 "
      + "실패했다 — progress.md 7차 항목 2의 재현 기록. 실획의 시작 스냅에서는 같은 자리가 "
      + "on_face였다(획이 기존 기하에서 떨어진 곳에서 시작해 on_edge 후보도 멀었던 상태)",
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "snap_cache.json"), JSON.stringify(led, null, 2));
});
