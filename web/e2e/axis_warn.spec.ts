// **"어긋납니다" 경고의 대상**(2026-08-19 15차 항목 2 · D-L100).
// 산출: `stage0/out/axis_warn.json`.
//
// 사용자 보고: *"2점 투시에서 축 스냅으로 깊이선을 그었는데 «이 선이 어긋납니다 — 두
// 소실점 어디도 향하지 않습니다»가 뜬다. 회전해 확인해도 실제로는 안 어긋난다."*
//
// 재현으로 **셋이 갈렸다**(지시 ③: 갈리면 따로 처리한다):
// ```
// (a) 양 끝 스냅·연장선으로 놓인 획      3D에 정확히 있는데 "지우고 다시 그으세요"가 뜬다
// (b) 유한 수직 소실점을 향한 깊이선      판정이 수평 둘만 본다(vpDirSnap은 셋을 본다)
// (c) 앞 획의 경고가 다음 획에 남는다     note를 아무도 안 비운다
// ```
//
// ⚠⚠ **차수가 동작점이다**(2차 리뷰어 [1]): 알림 조건이 `notify = order !== 1`이다.
// 그래서 **2점(order 2)과 3점(order 3) 둘 다** 돈다 — 사용자가 보고한 것은 2점이다.
// (b)는 유한 수직 소실점의 갈래라 **2점에서는 성립할 수 없다**(수직축이 무한원이다) —
// 그래서 (b)는 이 파일이 규칙 층에서 따로 잰다(`rule_arms`).
//
// ⚠ **`warned = false`의 출처는 하나가 아니다**(2차 리뷰어 [2]·#43): ① 판정 임계 아래
// ② 연결 경로 억제(D-L100 (a)) ③ 알림 비움(D-L100 (c)). 팔마다 **misfit과 배치 경로를
// 함께** 내서 어느 것인지 갈린다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #7  추측하지 말고 센다 — 팔마다 misfit·경로·억제를 함께 낸다
//   #12 동작점 하나 금지 — 차수 둘(2점·3점) × 임계 근처 겨냥 팔
//   #17 스냅과 판정이 같은 집합·같은 양을 본다 — 그 주장을 misfit ↔ 각도 쌍으로 잰다
//   #21 dpr 1·마우스 합성이다
//   #24 단위를 고치는 것과 임계를 무르는 것은 다르다 — 고친 것은 **대상 집합**이다
//   #25 수리 전 값을 원장 안에 둔다 — 스위치 셋(`setConnectionQuiet`·`setNoteClear`)
//   #30 그 스위치가 옛 거동을 되살린다
//   #32 경고를 없앤 것이 아니다 — 진짜 어긋난 획 팔이 그 자리를 지킨다
//   #33 값 대조 — 같은 획의 "축과의 각"이 두 계산에서 다르면 그 둘을 나란히 적는다
//   #35 도달 불가를 안전으로 안 읽는다 — (b)가 종단에서 왜 안 도는지 **크기로** 적는다
//   #40·#46 도달 가능성은 범주가 아니라 크기로
//   #43 `warned = false`의 출처를 경로별로 가른다
//   #47 수치는 필드가 든다 — 산문은 어느 필드를 읽으라는 지시만
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupScene } from "./fixture.js";
import { AXIS_TOL } from "../src/s3d/axis.js";
import { stepRule, newRuleState, type RuleState, type RLine } from "../src/s3d/vpRules.js";
import { VP_INFINITE_RATIO } from "../src/s3d/camera.js";

declare global { interface Window { S2S: any; __SC: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");
const MISALIGNED = "어긋납니다";

/** 한 획을 그은 뒤 읽는 것 — `warned`와 **그 이유를 가르는 값들**. */
const READ = `(async () => {
  const S = window.S2S;
  const ax = await import("/src/s3d/axis.ts");
  const el = document.querySelector(".note");
  const sts = S.doc().strokes;
  const last = sts[sts.length-1];
  const rep = last ? ax.representative(last.pts2d) : null;
  const vps = S.cam.vps().filter(Boolean);
  return { note: el ? el.textContent : null, snap_note: S.snapNote(),
           order: S.order(),
           /** **판정이 쓰는 양**(#49) — 이 획이 어느 소실점에 얼마나 안 맞나 */
           misfit_min: rep && vps.length
             ? Math.round(Math.min(...vps.map(v => ax.vpMisfit(rep, v))) * 1e4) / 1e4 : null,
           place_by: S.placeBy(),
           lifted: !!(last && last.seg3d), axis: last && last.axis,
           start_kind: last && last.snapStart && last.snapStart.kind,
           end_kind: last && last.snapEnd && last.snapEnd.kind };
})()`;

/** 규칙 층의 (b) 팔 — 유한 수직 소실점을 향한 깊이선. 종단 픽스처가 못 만드는 갈래다. */
function ruleArms() {
  const SZ: [number, number] = [1280, 675];
  const mk = (vertical: [number, number] | null): RuleState => {
    const st = newRuleState(SZ);
    st.slots[0] = { kind: "vp", at: [2100, 300], source: "two_lines", support: 2 };
    st.slots[1] = { kind: "vp", at: [-800, 300], source: "horizon_x_line", support: 2 };
    st.slots[2] = vertical
      ? { kind: "vp", at: vertical, source: "tilted_vertical", support: 2 }
      : { kind: "screen", dir: "v", support: 1 };
    st.horizon = 300;
    return st;
  };
  const toward = (a: [number, number], to: [number, number], L: number): RLine => {
    const u = [to[0] - a[0], to[1] - a[1]];
    const n = Math.hypot(u[0], u[1]);
    return { a, b: [a[0] + (u[0] / n) * L, a[1] + (u[1] / n) * L] };
  };
  const V2: [number, number] = [900, 900];
  const A: [number, number] = [400, 500];
  const row = (name: string, st: RuleState, line: RLine) => {
    const r = stepRule(st, line, SZ);
    return { name, event: r.event.type,
             axis: (r.event as { axis?: number }).axis ?? null,
             notify: (r.event as { notify?: boolean }).notify ?? false,
             why: (r.event as { why?: string }).why ?? null };
  };
  return {
    what: "(b) — 유한 수직 소실점을 향한 깊이선. 종단 픽스처가 못 만드는 갈래라 규칙 층에서 잰다.",
    vertical_vp: V2, from: A,
    rows: [
      row("[되살림] 수직 슬롯이 무한원 — 옛 거동", mk(null), toward(A, V2, 260)),
      row("수직 슬롯이 유한 — 수리 후", mk(V2), toward(A, V2, 260)),
      row("[반례] 어느 소실점도 안 향함", mk(V2), toward(A, [100, 660], 260)),
      row("[반례] 수평 소실점을 향함(순서 불변)", mk(V2), toward(A, [2100, 300], 260)),
      row("[반례] 화면 수직선(갈래 불변)", mk(V2), { a: A, b: [A[0], A[1] - 260] }),
    ],
  };
}

test("경고는 **어긋난 획에만** 뜬다 (D-L100)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  let setup: any = null;
  let box = { x: 0, y: 0, width: 0, height: 0 };

  /**
   * 차수를 세운다 — **매번 새 문서에서**. 한 문서 안에서 카메라를 갈아 끼우면 앞 차수의
   * 3D 획이 새 카메라의 스냅 대상이 되어 아무것도 안 붙는다(그 자체가 이 하네스의 결함이었다).
   * 3점은 픽스처의 참 소실점 셋, 2점은 수직 슬롯을 화면 무한원으로.
   */
  const setOrder = async (n: 2 | 3) => {
    await page.goto("/l.html");
    await page.waitForFunction(() => !!window.S2S);
    setup = await setupScene(page);
    box = (await page.locator("#ink").boundingBox())!;
    await page.evaluate(k => {
      const S = window.S2S, sc = window.__SC;
      S.cam.loadRules({
        slots: [
          { kind: "vp", at: [sc.vps[0][0], sc.vps[0][1]], source: "two_lines", support: 2 },
          { kind: "vp", at: [sc.vps[1][0], sc.vps[1][1]], source: "horizon_x_line", support: 2 },
          k === 3 ? { kind: "vp", at: [sc.vps[2][0], sc.vps[2][1]],
                      source: "tilted_vertical", support: 2 }
                  : { kind: "screen", dir: "v", support: 2 },
        ],
        horizon: sc.vps[0][1], waiting: [], depthLines: [], verticalLines: [],
      });
      S.refresh();
    }, n);
    await page.evaluate(() => window.S2S.confirmNow());
    await page.waitForTimeout(60);
  };

  const draw = async (a: number[], b: number[], label: string, cases: any[]) => {
    const before = await page.evaluate(() => window.S2S.placeBy());
    await page.mouse.move(box.x + a[0], box.y + a[1]);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + a[0] + (b[0]-a[0])*i/8, box.y + a[1] + (b[1]-a[1])*i/8);
    }
    await page.mouse.up();
    await page.waitForTimeout(60);
    const r: any = { label, ...(await page.evaluate(READ)) as any };
    r.warned = typeof r.note === "string" && r.note.includes(MISALIGNED);
    // **배치 경로**(#43) — `warned` 거짓의 출처를 가르는 값
    r.path = Object.keys(r.place_by).find(k => r.place_by[k] > (before[k] ?? 0)) ?? null;
    delete r.place_by;
    cases.push(r);
    return r;
  };

  /** 한 차수에서 도는 팔 묶음. */
  const runOrder = async (n: 2 | 3) => {
    await setOrder(n);
    const cases: any[] = [];
    const aim = await page.evaluate(() => {
      const S = window.S2S;
      const a = S.doc().strokes.filter((x: any) => x.seg3d)[0].pts2d[0];
      const vps = S.cam.vps();
      const mk = (vp: number[], degOff: number, R: number) => {
        const u = [vp[0]-a[0], vp[1]-a[1]]; const L = Math.hypot(u[0],u[1]);
        const th = degOff*Math.PI/180;
        const d = [(u[0]*Math.cos(th)-u[1]*Math.sin(th))/L, (u[0]*Math.sin(th)+u[1]*Math.cos(th))/L];
        return [a[0]+d[0]*R, a[1]+d[1]*R];
      };
      return { a, vps, exact: mk(vps[0], 0, 160), off10: mk(vps[0], 10, 160) };
    });
    await draw(aim.a, aim.exact, "① 앵커 + 축 스냅(정확 겨냥)", cases);
    await draw(aim.a, aim.off10, "② 앵커 + 축 스냅(10° 어긋나게 겨냥 — 스냅이 고친다)", cases);

    const diag = await page.evaluate(() => {
      const S = window.S2S;
      const vps = S.cam.vps().filter(Boolean);
      const pts: number[][] = [];
      for (const s of S.doc().strokes.filter((x: any) => x.seg3d)) {
        pts.push(s.pts2d[0]); pts.push(s.pts2d[s.pts2d.length-1]);
      }
      const ang = (a: number[], b: number[], v: number[]) => {
        const u1 = [b[0]-a[0], b[1]-a[1]], u2 = [v[0]-a[0], v[1]-a[1]];
        const d = Math.abs(Math.atan2(u1[1],u1[0]) - Math.atan2(u2[1],u2[0]))*180/Math.PI;
        const m = ((d % 180) + 180) % 180; return Math.min(m, 180-m);
      };
      // **화면 축에서 멀어야 한다** — 화면 수평·수직에 가까우면 `classifyLine`이 그 갈래로
      // 보내고(깊이선 갈래가 아니다) 이 팔이 재려는 것을 안 잰다. 여유는 넉넉히 12°
      const fromScreen = (a: number[], b: number[]) => {
        const d = Math.abs(Math.atan2(b[1]-a[1], b[0]-a[0])) * 180 / Math.PI;
        const m = ((d % 180) + 180) % 180;
        return Math.min(Math.min(m, 180 - m), Math.abs(90 - m));
      };
      let best: any = null;
      for (let i=0;i<pts.length;i++) for (let j=i+1;j<pts.length;j++) {
        const dd = Math.hypot(pts[i][0]-pts[j][0], pts[i][1]-pts[j][1]);
        if (dd < 100 || dd > 420) continue;
        const sc = fromScreen(pts[i], pts[j]);
        if (sc < 12) continue;
        const worst = Math.min(...vps.map((v: number[]) => ang(pts[i], pts[j], v)));
        if (!best || worst > best.worst) best = { a: pts[i], b: pts[j], d: dd, worst, screen_deg: sc };
      }
      return best;
    });
    const c3 = await draw(diag.a, diag.b, "③ 양 끝 스냅(면 대각선)", cases);

    // ④ 진짜 어긋난 획 · ④′ **임계 근처**(#12 — 동작점을 하나 안 고른다)
    const offs = await page.evaluate(() => {
      const S = window.S2S; const vps = S.cam.vps();
      const a = [200, 600];
      const u = [vps[0][0]-a[0], vps[0][1]-a[1]]; const L = Math.hypot(u[0],u[1]);
      const mk = (deg: number) => {
        const th = deg*Math.PI/180;
        const d = [(u[0]*Math.cos(th)-u[1]*Math.sin(th))/L, (u[0]*Math.sin(th)+u[1]*Math.cos(th))/L];
        return [a[0]+d[0]*180, a[1]+d[1]*180];
      };
      return { a, deg30: mk(30), deg1: mk(1), deg3: mk(3) };
    });
    const c4 = await draw(offs.a, offs.deg30, "④ 무앵커 + 어느 소실점도 안 향함", cases);
    await draw(offs.a, offs.deg1, "④′ 무앵커 + 1° 어긋남(임계 근처)", cases);
    await draw(offs.a, offs.deg3, "④″ 무앵커 + 3° 어긋남(임계 근처)", cases);

    const c5 = await draw(aim.a, aim.exact, "⑤ 경고 뒤에 다시 축 스냅으로(경고가 남는가)", cases);

    // ---- **되살림 팔**(#25·#30) — 스위치를 꺼 수리 전 값을 원장 안에 둔다
    await page.evaluate(() => window.S2S.setConnectionQuiet(false));
    const r3 = await draw(diag.a, diag.b, "⑥ [되살림] 연결 억제 끔 — 면 대각선", cases);
    await page.evaluate(() => window.S2S.setConnectionQuiet(true));

    await page.evaluate(() => window.S2S.setNoteClear(false));
    const r6 = await draw(offs.a, offs.deg30, "⑦ [되살림] 알림 비우기 끔 — 어긋난 획", cases);
    const r7 = await draw(aim.a, aim.exact, "⑧ [되살림] 그 뒤에 축 스냅으로", cases);
    await page.evaluate(() => window.S2S.setNoteClear(true));

    return { order: n, cases, c3, c4, c5, r3, r6, r7,
             diag_screen_angle_to_vp_deg: Math.round(diag.worst * 100) / 100,
             diag_from_screen_axis_deg: Math.round(diag.screen_deg * 100) / 100 };
  };

  const o3 = await runOrder(3);
  const o2 = await runOrder(2);

  // **슬롯 2가 유한인가 · 얼마나 먼가**(#35 · 2차 리뷰어 [5]) — (b)가 종단에서 왜 안 도는지
  const slot2 = await page.evaluate(() => {
    const S = window.S2S, sc = window.__SC;
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const diag = Math.hypot(el.clientWidth, el.clientHeight);
    const p = S.cam.principal ? S.cam.principal() : null;
    const v = sc.vps[2];
    const c = [el.clientWidth / 2, el.clientHeight / 2];
    return { at: [Math.round(v[0]), Math.round(v[1])], diag: Math.round(diag),
             dist_from_center: Math.round(Math.hypot(v[0]-c[0], v[1]-c[1])),
             principal: p };
  });

  const led = {
    what: "«이 선이 어긋납니다»가 어느 획에 뜨는가 — 앱 종단(차수 둘) + 규칙 층((b) 갈래).",
    how: {
      end_to_end: "참 소실점 픽스처(setupScene). **차수 둘**을 만든다: 3점은 수직 슬롯도 참 "
        + "소실점, 2점은 화면 무한원. 실제 포인터로 아홉 획(수리 팔 여섯 + 되살림 셋).",
      warned: "상태줄(.note)에 «어긋납니다»가 있는가.",
      why_not_warned: "`warned` 거짓의 출처는 셋이다(#43) — `misfit_min`이 임계 "
        + "(`vp_dist_ratio`) 아래거나, `path`가 `two_point`·`extension`이라 억제됐거나, "
        + "앞 획의 경고가 비워졌거나. 팔마다 그 셋을 함께 낸다.",
      rule_layer: "(b)는 유한 수직 소실점의 갈래라 2점에서는 성립할 수 없고 3점 픽스처에서는 "
        + "그 소실점이 멀어 그쪽 선이 `screen_v`로 분류된다(거리는 `slot2`) — 그래서 "
        + "`rule_arms`가 `stepRule`을 직접 부른다.",
    },
    what_this_does_not_say: [
      "dpr 1·마우스 합성이다(#21).",
      "**경고를 없앤 것이 아니다**(#32) — ④·④″ 팔이 그 자리를 지킨다. 바뀐 것은 **대상**이다.",
      "③이 3D에 **옳게** 놓였는가는 여기서 안 잰다(`lifted`와 두 끝의 스냅 종류만 낸다). "
      + "양 끝 스냅 기하의 옳음은 D-L46의 자리다 — 그러므로 **양 끝 스냅 경로에서 정말로 "
      + "잘못 놓인 획**에도 경고가 안 뜬다는 것은 이 원장이 감수한 대가다(2차 리뷰어 [2]).",
      "`diag_screen_angle_to_vp_deg`(하네스)와 `snap_note`의 «가장 가까운 축과 …°»(앱)는 "
      + "**다른 양**이다(#33): 앞은 화면에서 시작점→소실점 방향과의 각이고, 뒤는 "
      + "`nearestAxisOnScreen`이 낸 **3D 축 방향**과의 각이다. 두 수가 다른 것이 정상이다.",
      "④의 겨냥 방향은 스펙이 고른 좌표다 — `reachability_value`는 그 좌표가 정하는 값이고 "
      + "임계 근처 팔(④′·④″)이 그 축의 감도를 든다(#12·#46).",
    ],
    setup, slot2,
    vp_dist_ratio: AXIS_TOL.vp_dist_ratio,
    vp_infinite_ratio: VP_INFINITE_RATIO,
    by_order: [o3, o2].map(o => ({ order: o.order, cases: o.cases,
                                   diag_screen_angle_to_vp_deg: o.diag_screen_angle_to_vp_deg,
                                   diag_from_screen_axis_deg: o.diag_from_screen_axis_deg })),
    rule_arms: ruleArms(),
    summary: {
      warned_by_order: [o3, o2].map(o => ({ order: o.order, warned: o.cases.map(c => c.warned) })),
      /** 사용자가 보고한 조건 — 축 스냅으로 그은 깊이선 */
      axis_snap_warned: [o3, o2].map(o => o.cases[0].warned || o.cases[1].warned),
      /** (a) 수리 팔 ↔ 되살림 팔 */
      two_point_warned: [o3.c3.warned, o2.c3.warned],
      two_point_warned_when_quiet_off: [o3.r3.warned, o2.r3.warned],
      two_point_misfit: [o3.c3.misfit_min, o2.c3.misfit_min],
      two_point_path: [o3.c3.path, o2.c3.path],
      /** (c) 수리 팔 ↔ 되살림 팔 */
      persisted_to_next: [o3.c5.warned, o2.c5.warned],
      persisted_to_next_when_off: [o3.r7.warned, o2.r7.warned],
      revive_note_arm_warned: [o3.r6.warned, o2.r6.warned],
      /** 도달 가능성의 **크기**(#40·#46) — ④가 임계를 넘은 정도 */
      genuinely_off_misfit: [o3.c4.misfit_min, o2.c4.misfit_min],
      genuinely_off_warned: [o3.c4.warned, o2.c4.warned],
      /** (b) — 규칙 층 */
      rule_revive_event: ruleArms().rows[0].event,
      rule_fixed_event: ruleArms().rows[1].event,
      rule_fixed_axis: ruleArms().rows[1].axis,
    },
    gate: {
      registered: "경고는 **어긋난 획에만** 뜬다. 팔별 판정은 `summary.warned_by_order`가 든다 "
        + "— 산문에 결과를 안 박는다(#47).",
      reachability: "④가 실제로 경고를 낸다. 값은 ④가 판정 임계를 넘은 **크기**"
        + "(`genuinely_off_misfit`, 판정이 쓰는 `vpMisfit` 그대로)이고 임계는 "
        + "`vp_dist_ratio`다. ⚠ 다른 팔의 `warned = false`가 전부 임계 아래인 것은 **아니다** "
        + "— ③·⑤는 임계 위이고 경로 억제·알림 비움이 사유다. 그 갈림은 팔마다의 "
        + "`misfit_min`·`path`가 든다(#43).",
      reachability_value: null as unknown,
      reachability_source: "summary/genuinely_off_misfit",
      result: {} as Record<string, unknown>,
    },
    pitfall_citations: [7, 12, 17, 21, 24, 25, 30, 32, 33, 35, 40, 43, 46, 47],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_value = led.summary.genuinely_off_misfit;
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "axis_warn.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  for (const o of [o3, o2]) {
    // **도달 가능성**(#40) — 경고가 실제로 도는 팔이 있고 그 팔은 임계 위다
    expect(o.c4.warned).toBe(true);
    expect(o.c4.misfit_min).toBeGreaterThan(AXIS_TOL.vp_dist_ratio);
    // 사용자가 보고한 그 상황 — 축 스냅으로 그은 깊이선에는 안 뜬다
    expect(o.cases[0].warned).toBe(false);
    expect(o.cases[1].warned).toBe(false);
    // **(a)** 양 끝 스냅으로 3D에 놓인 면 대각선 — 경고가 아니다. **되살림 팔에서는 뜬다**
    expect(o.c3.lifted).toBe(true);
    expect(o.c3.warned).toBe(false);
    expect(o.c3.misfit_min).toBeGreaterThan(AXIS_TOL.vp_dist_ratio);   // 임계 아래라서가 아니다
    expect(o.r3.warned).toBe(true);
    // **(c)** 경고가 다음 획으로 안 넘어간다. **되살림 팔에서는 넘어간다**
    expect(o.c5.warned).toBe(false);
    expect(o.r6.warned).toBe(true);
    expect(o.r7.warned).toBe(true);
  }
  // **(b)** 규칙 층 — 되살림은 거절, 수리는 축 2의 지지선
  const ra = ruleArms().rows;
  expect(ra[0].event).toBe("rejected");
  expect(ra[1].event).toBe("support");
  expect(ra[1].axis).toBe(2);
  expect(ra[2].event).toBe("rejected");
});
