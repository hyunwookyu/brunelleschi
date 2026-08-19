// **어느 시점에서든 축이 보이고 그릴 수 있다**(2026-08-19 15차 항목 3·8 · D-L101·D-L102).
// 산출: `stage0/out/view_axes.json`.
//
// 사용자 보고 3: *"3점 투시에서 그림이 안 그려진다."*
// 사용자 지시 8: *"어느 시점에서든 축 셋의 소실점을 계산해 표시한다 … 수평 소실점 둘을
// 잇는 선이 지평선이다. 배면을 보든 위를 보든 그 선은 계산된다."*
//
// 재현(수리 전): 참 3점 픽스처에서 `draftJudge().kind`가 **null**(피치 −15°)이고,
// 살짝만 돌리면 `viewState()`가 **"model"**이 되어 그리기가 막혔다 — 3점 시점의 피치는
// **정의상 0이 아니므로**(기운 카메라가 곧 3점이다) 14차의 작도 조건("축 정렬 + 피치 0")이
// 3점을 통째로 배제했다.
//
// ⚠ **이 원장이 안 다루는 것**: 빈 화면에서 **획으로 3점 카메라를 만드는 것**. 규칙에는
// P2 → P3 전이가 없다(7차 지시 3-d로 삭제) — 기울어진 세로 모서리는 항상 깊이선이라
// 엉뚱한 수평 소실점을 만든다. 그 실측은 `stroke_built` 절이 들고 판정은 `DEFERRED`다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5  "돌린 시점에서도 그린다"는 배선 확인이다 — 보장과 실측을 갈라 적는다
//   #12 자세 여럿(핀·요만·피치·배면·윗면)을 돈다 — 동작점을 하나 안 고른다
//   #17 소실점·지평선·격자가 **같은 출처**(`viewOverlayCtx` → `axisVpsAt`)를 쓴다
//   #21 dpr 1·마우스 합성이다
//   #30 되살림: 옛 작도 조건(피치 임계)은 `draftJudge().pitchDeg`로 그 자리에서 재계산된다
//   #32 "전부 작도로 넓혔다"가 아님을 반례가 지킨다 — 카메라가 안 서면 여전히 `pre`다
//   #40 도달 가능성: 옛 조건이 실제로 막았을 자세가 이 표에 있다
//   #49 지평선의 옳음은 **두 소실점을 지나는가**(점-선 거리)로 잰다
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { ONE_POINT_TOL } from "../src/s3d/onePoint.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene } from "./fixture.js";

declare global { interface Window { S2S: any; __SC: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 지금 시점의 축 소실점·지평선·작도 상태. */
const READ = `(() => {
  const S = window.S2S;
  const o = S.draftOverlay();
  const j = S.draftJudge();
  const dist = (q, a, b) => {
    const ex = b[0]-a[0], ey = b[1]-a[1], L = Math.hypot(ex, ey);
    return L < 1e-12 ? Infinity : Math.abs((q[0]-a[0])*ey - (q[1]-a[1])*ex) / L;
  };
  const av = o ? o.axisVps : null;
  const hl = o ? o.horizonLine : null;
  return {
    view_state: S.viewState(),
    judge_kind: j && j.kind, pitch_deg: j && Math.round(j.pitchDeg*100)/100,
    yaw_off_deg: j && Math.round(j.yawOffDeg*100)/100,
    axis_vps: av ? av.map(a => a && ({ axis: a.axis,
        at: a.at ? a.at.map(v => Math.round(v)) : null,
        screen_dir: a.screenDir.map(v => Math.round(v*1000)/1000),
        dist: a.distFromPrincipal == null ? null : Math.round(a.distFromPrincipal) })) : null,
    finite_axes: av ? av.filter(a => a && a.at).length : null,
    horizon_line: hl ? { a: hl.a.map(v=>Math.round(v)), b: hl.b.map(v=>Math.round(v)) } : null,
    /** **지평선이 두 수평 소실점을 지나는가**(#49 — 판정이 쓰는 단위: 점-선 거리 px) */
    horizon_gap_px: (av && hl && av[0] && av[0].at && av[1] && av[1].at)
      ? [Math.round(dist(av[0].at, hl.a, hl.b)*1000)/1000,
         Math.round(dist(av[1].at, hl.a, hl.b)*1000)/1000] : null,
    /** **옛 판(화면 가로선)이 둘째 소실점에서 얼마나 벗어나나** — 되살림 값(#30) */
    old_flat_gap_px: (av && av[0] && av[0].at && av[1] && av[1].at)
      ? Math.round(Math.abs(av[1].at[1] - av[0].at[1])*1000)/1000 : null,
    horizon_scalar_y: o ? (o.horizonY == null ? null : Math.round(o.horizonY)) : null,
    // 축 표식(지시 8-c·8-e) — 그리는 쪽과 같은 함수(overlayAxisMarks)를 읽는다(#17)
    marks: (S.axisMarks() || []).map(m => ({ axis: m.axis, kind: m.kind,
      at: m.at.map(v => Math.round(v)),
      dir: m.dir.map(v => Math.round(v * 1000) / 1000) })),
  };
})()`;

test("어느 시점에서든 축이 보이고 그릴 수 있다 (D-L101·D-L102)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  const setup = await setupScene(page);
  await page.evaluate(() => window.S2S.confirmNow());
  await page.waitForTimeout(80);
  const box = (await page.locator("#ink").boundingBox())!;

  const poses: any[] = [];
  const at = async (label: string, spin: number, wait = 260) => {
    if (spin) { await page.evaluate(s => window.S2S.cubeSpin(s, 0), spin); await page.waitForTimeout(wait); }
    const r: any = { label, ...(await page.evaluate(READ)) as any };
    // **그릴 수 있는가** — 빈 곳에서 한 획 긋고 문서에 남는지 본다(막히면 안내가 뜬다)
    const before = await page.evaluate(() => window.S2S.doc().strokes.length);
    await page.mouse.move(box.x + 0.24 * box.width, box.y + 0.72 * box.height);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + (0.24 + 0.16 * i / 6) * box.width,
                            box.y + (0.72 - 0.06 * i / 6) * box.height);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => ({ n: window.S2S.doc().strokes.length,
                                               note: window.S2S.snapNote() }));
    r.stroke_added = after.n > before;
    r.blocked = typeof after.note === "string" && after.note.includes("모델링 화면");
    poses.push(r);
    return r;
  };

  const pinned = await at("① 확정 시점(핀) — 3점", 0);
  const yaw1 = await at("② 요만 조금(0.15rad)", 0.15);
  const yaw2 = await at("③ 더 돌린다(+0.6rad)", 0.6);
  const back = await at("④ 배면 쪽으로(+2.2rad)", 2.2);
  // 윗면 — 큐브 스핀은 **요만** 돈다. 카메라를 직접 올려 내려다보게 한다(draft_return 선례).
  // ⚠ 초판은 `controls.setPolarAngle`을 불렀는데 **OrbitControls에 그런 메서드가 없어**
  // 자세가 안 움직였고 ④와 글자 그대로 같은 행이 나왔다(2차 리뷰어 [3] — 미실행을
  // 관측으로 세지 않는다 #32). 이제 위치를 직접 준다.
  await page.evaluate(() => {
    const S = window.S2S;
    const camT = S.stage.viewport.camera;
    const ctl = S.stage.viewport.controls;
    camT.position.set(1.2, 5.2, 3.0);
    ctl.target.set(0.6, 0.2, -3.4);
    ctl.update();
    camT.updateMatrixWorld(true);
    S.refresh();
  });
  await page.waitForTimeout(220);
  const top = await at("⑤ 윗면 쪽(카메라를 위로)", 0);

  // **무한원 축의 표식**(지시 8-e) — 3점 픽스처는 축 셋이 다 유한이라 그 갈래가 안 온다
  // (#35: 도달 불가를 안전으로 안 읽는다). 2점 규칙을 넣어 수직축을 무한원으로 만든다.
  // ⚠ **핀(확정 시점)에서 잰다** — 2점의 "수직축은 화면 평행"은 그 시점의 성질이고,
  // 돌린 자세에서는 그 축도 유한 소실점을 갖는다(초판이 ⑤ 자세 뒤에 재서 `infinite`가
  // 안 나왔다). 새 문서에서 다시 세운다.
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await setupScene(page);
  const infiniteArm = await page.evaluate(() => {
    const S = window.S2S, sc = window.__SC;
    S.cam.loadRules({
      slots: [
        { kind: "vp", at: [sc.vps[0][0], sc.vps[0][1]], source: "two_lines", support: 2 },
        { kind: "vp", at: [sc.vps[1][0], sc.vps[1][1]], source: "horizon_x_line", support: 2 },
        { kind: "screen", dir: "v", support: 2 },
      ],
      horizon: sc.vps[0][1], waiting: [], depthLines: [], verticalLines: [],
    });
    S.confirmNow();
    S.refresh();
    const marks = (S.axisMarks() || []).map(m => ({ axis: m.axis, kind: m.kind,
      dir: m.dir.map(v => Math.round(v * 1000) / 1000) }));
    const o = S.draftOverlay();
    return { marks, view_state: S.viewState(),
             finite_axes: o ? o.axisVps.filter(a => a && a.at).length : null,
             has_horizon_line: !!(o && o.horizonLine) };
  });
  expect(infiniteArm.marks.length).toBe(3);
  expect(infiniteArm.marks.some((m: any) => m.kind === "infinite")).toBe(true);
  expect(infiniteArm.has_horizon_line).toBe(true);   // 하나가 무한원이어도 지평선은 선다

  // **획으로 3점을 만들 수 있는가** — 빈 화면에서(이 항목이 안 고친 자리)
  await page.goto("/l.html");
  await page.waitForFunction(() => !!window.S2S);
  await page.evaluate(() => new Promise<void>(res => {
    const q = indexedDB.deleteDatabase("sketch2space");
    q.onsuccess = q.onerror = q.onblocked = () => res();
  }));
  await page.reload();
  await page.waitForFunction(() => !!window.S2S);
  const b2 = (await page.locator("#ink").boundingBox())!;
  const W = b2.width, H = b2.height;
  const strokes: [number, number][][] = [
    [[0.42 * W, 0.30 * H], [0.15 * W, 0.42 * H]],
    [[0.42 * W, 0.30 * H], [0.72 * W, 0.40 * H]],
    [[0.42 * W, 0.30 * H], [0.44 * W, 0.78 * H]],
    [[0.15 * W, 0.42 * H], [0.20 * W, 0.86 * H]],
    [[0.72 * W, 0.40 * H], [0.68 * W, 0.88 * H]],
  ];
  const built: any[] = [];
  for (const [a, b] of strokes) {
    await page.mouse.move(b2.x + a[0], b2.y + a[1]);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(b2.x + a[0] + (b[0] - a[0]) * i / 8, b2.y + a[1] + (b[1] - a[1]) * i / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
    built.push(await page.evaluate(() => {
      const S = window.S2S;
      return { order: S.order(), standing: S.standing(),
               slots: S.rules().slots.map((s: any) => s ? (s.kind === "vp"
                 ? "vp@" + s.at.map(Math.round) : s.kind) : null),
               horizon_y: Math.round(S.rules().horizon),
               lifted: S.doc().strokes.filter((x: any) => x.seg3d).length,
               total: S.doc().strokes.length,
               note: S.snapNote() };
    }));
  }

  const led = {
    what: "돌린 시점(3점 포함)에서 축 소실점·지평선이 서고 그릴 수 있는가.",
    how: {
      poses: "참 소실점 3점 픽스처를 확정하고 자세 다섯을 돈다(핀·요 둘·배면·윗면). "
        + "자세마다 축 소실점·지평선·작도 상태를 읽고 **한 획을 그어** 문서에 남는지 본다.",
      horizon: "지평선의 옳음은 **두 수평 소실점까지의 점-선 거리**로 잰다(#49) — "
        + "`horizon_gap_px`. 옛 판(화면 가로선)의 어긋남은 `old_flat_gap_px`다(#30).",
      stroke_built: "빈 화면에서 3점 상자를 그려 본다 — **이 항목이 안 고친 자리**의 실측.",
    },
    what_this_does_not_say: [
      "dpr 1·마우스 합성·한 픽스처다(#12·#21).",
      "`horizon_gap_px`가 0인 것은 **설계 보장**이다(#5) — 지평선을 그 두 점으로 만들었다. "
      + "판정은 `old_flat_gap_px`(옛 판이 벗어난 크기)가 든다.",
      "**획으로 3점 카메라를 만드는 것은 안 고쳤다** — 규칙에 P2 → P3 전이가 없다"
      + "(7차 지시 3-d로 삭제). `stroke_built`가 그 결과를 실측으로 든다: 기울어진 세로 "
      + "모서리들이 깊이선으로 읽혀 **엉뚱한 수평 소실점**이 선다. 판정은 `DEFERRED`.",
      "표식은 `overlayAxisMarks`가 낸 **자리**를 잰다 — 그리는 쪽과 같은 함수다(#17). "
      + "**칠해진 픽셀은 안 잰다**: 그 배선(canvas 호출)의 실측은 없다.",
      "**지시 8-c의 «축소 뷰»는 안 만들었다** — 가장자리 표시 하나로 간다(A-3: 축소 뷰는 "
      + "좌표계를 둘로 만든다. 6차 지시 7-e가 같은 자리에서 같은 선택을 했다).",
      "자세 다섯에서는 축 셋이 다 유한이라 `infinite` 표식이 안 나온다(#35 — 도달 불가를 "
      + "안전으로 안 읽는다). 그 갈래는 `infinite_arm`(2점 규칙을 넣어 수직축을 무한원으로 "
      + "만든 팔)이 든다.",
      "**지시 3-c의 «소실점이 극단인 경우»는 안 좁혔다.** ⛔ 초판은 그 말을 «주점으로 붕괴»로 "
      + "읽었는데 **틀렸다**(2차 리뷰어 [1]) — 이 저장소가 쓰는 뜻은 **화면 밖 먼 소실점**이다"
      + "(D-L97의 6-e·`docs/line_plan.md` §9.3). 그 대역은 이 원장 안에 **실재한다**: "
      + "`poses[*].axis_vps[*].dist`가 화면 대각의 몇 배까지 간다. 그런데 그 자세들에서 "
      + "**그리기는 정상이고**(`stroke_added` 참·`blocked_now` 거짓) 먼 소실점이 무엇을 "
      + "망가뜨리는지 재는 팔이 없다 — 그래서 안 좁혔다. 판정은 `DEFERRED`.",
      "그릴 수 있는가는 **획이 문서에 남는가**로만 본다 — 그 획이 3D에 옳게 놓이는가는 "
      + "다른 원장의 자리다(`dir_state`·`confirm_link`).",
    ],
    selfcheck_notes: {
      zeros: "`horizon_gap_px`가 전부 0인 것은 **설계 보장**이다(#5) — 지평선을 그 두 "
        + "소실점으로 만들었으므로 그 선까지의 거리는 0이다. **임계를 안 건다**: 판정은 "
        + "`old_flat_gap_px_rotated`(옛 가로선이 둘째 소실점에서 벗어난 px)가 든다.",
      pinned_zero: "`old_flat_gap_px[0]`(핀 자세)이 0인 것도 구성의 귀결이다 — 확정 시점은 "
        + "롤 0이라 두 수평 소실점의 y가 같고, 그 자리에서는 **옛 가로선이 맞았다**. "
        + "그래서 도달 가능성 값에서 뺐다.",
      screen_dir_zero: "`axis_vps[*].screen_dir`의 성분 0은 축이 화면 가로·세로와 정확히 "
        + "나란할 때의 값이다(픽스처가 정한 자리 — #46).",
    },
    setup,
    infinite_arm: infiniteArm,
    hand_deg: ONE_POINT_TOL.hand_deg,
    poses,
    stroke_built: built,
    summary: {
      view_states: poses.map(p => p.view_state),
      judge_kinds: poses.map(p => p.judge_kind),
      pitch_deg: poses.map(p => p.pitch_deg),
      /**
       * **옛 조건이 실제로 막았을 자세** — |피치| > hand_deg **이고 핀이 아닌** 것들.
       * ⚠ 핀(확정 시점)은 옛 코드에서도 `isPinned` 단락으로 통과했다 — 그것을 넣으면
       * "막았을 자세"가 아니라 "피치가 큰 자세"가 된다(2차 리뷰어 [2] · #34: 같은 혼입을
       * `old_flat_gap_px_rotated`에서만 고쳤던 자리).
       */
      blocked_by_old_pitch_rule:
        poses.filter(p => p.pitch_deg != null && p.view_state !== "draft_pinned"
                       && Math.abs(p.pitch_deg) > ONE_POINT_TOL.hand_deg).map(p => p.label),
      /** 참고 — 피치가 큰 자세 전부(핀 포함). 위 목록과 갈라 적는다 */
      pitch_beyond_hand_deg:
        poses.filter(p => p.pitch_deg != null
                       && Math.abs(p.pitch_deg) > ONE_POINT_TOL.hand_deg).map(p => p.label),
      stroke_added: poses.map(p => p.stroke_added),
      blocked_now: poses.map(p => p.blocked),
      finite_axes: poses.map(p => p.finite_axes),
      /** 표식 종류의 자세별 분포(지시 8-c·8-e) — `point`/`edge`/`infinite` */
      mark_kinds: poses.map(p => (p.marks ?? []).map((m: any) => m.kind)),
      infinite_arm_kinds: infiniteArm.marks.map((m: any) => m.kind),
      horizon_gap_px: poses.map(p => p.horizon_gap_px),
      old_flat_gap_px: poses.map(p => p.old_flat_gap_px),
      /**
       * **도달 가능성의 값**(#40) — 핀 자세는 뺀다: 확정 시점은 롤 0이라 옛 가로선이
       * **맞는 자리**이고 그 0은 측정이 아니라 구성의 귀결이다. 판정은 돌린 자세들이 든다.
       */
      old_flat_gap_px_rotated: poses.slice(1).map(p => p.old_flat_gap_px),
      built_final_order: built[built.length - 1].order,
      built_final_slots: built[built.length - 1].slots,
      built_lifted: `${built[built.length - 1].lifted}/${built[built.length - 1].total}`,
    },
    gate: {
      registered: "돌린 3점 시점에서 **그릴 수 있고** 축 소실점·지평선이 선다. "
        + "판정은 `summary.stroke_added`·`blocked_now`·`finite_axes`가 든다(#47).",
      reachability: "옛 조건(|피치| > hand_deg → 모델링)이 실제로 막았을 자세가 "
        + "`blocked_by_old_pitch_rule`에 있다 — 비어 있으면 이 원장은 아무것도 안 말한다. "
        + "지평선 쪽의 도달 가능성은 **`old_flat_gap_px_rotated`**(옛 가로선이 둘째 "
        + "소실점에서 벗어난 px — **핀 자세를 뺀 것**)이고 그것이 값이다. 핀을 뺀 이유는 "
        + "`selfcheck_notes.pinned_zero`가 든다.",
      reachability_value: null as unknown,
      reachability_source: "summary/old_flat_gap_px_rotated",
      result: {} as Record<string, unknown>,
    },
    pitfall_citations: [5, 12, 17, 21, 30, 32, 40, 49],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_value = led.summary.old_flat_gap_px_rotated;
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "view_axes.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  // **도달 가능성**(#40) — 옛 조건이 막았을 자세가 실제로 있다
  expect(led.summary.blocked_by_old_pitch_rule.length).toBeGreaterThan(0);
  // **어느 자세에서도 그릴 수 있고 차단 안내가 안 뜬다**(D-L102)
  for (const p of poses) {
    expect(p.stroke_added).toBe(true);
    expect(p.blocked).toBe(false);
    expect(p.view_state).not.toBe("model");
  }
  // **핀이 아닌 3점 자세가 `draft_three`로 선다** — 이름이 붙는다(옛 판은 `model`)
  expect(poses.slice(1).some(p => p.view_state === "draft_three")).toBe(true);
  // **축 셋이 계산된다**(지시 8-a·d) — 유한 소실점이 둘 이상
  for (const p of poses) expect(p.finite_axes).toBeGreaterThanOrEqual(2);
  // **축 셋에 전부 표식이 붙는다**(지시 8-a·c·d·e) — 화면 밖도 무한원도 빠지지 않는다
  for (const p of poses) {
    expect(p.marks.length).toBe(3);
    expect(p.marks.every((m: any) => ["point", "edge", "infinite"].includes(m.kind))).toBe(true);
  }
  // **화면 밖 소실점의 표식은 화면 안에 있다**(지시 8-c — 가장자리 표시)
  for (const p of poses) {
    for (const m of p.marks) {
      if (m.kind !== "edge") continue;
      expect(m.at[0]).toBeGreaterThan(0);
      expect(m.at[1]).toBeGreaterThan(0);
    }
  }
  // **지평선이 두 수평 소실점을 지난다**(지시 8-b · 보장 — #5)
  for (const p of poses) {
    if (!p.horizon_gap_px) continue;
    expect(Math.max(...p.horizon_gap_px)).toBeLessThan(1e-3);
  }
});
