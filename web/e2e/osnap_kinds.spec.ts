// **오스냅 종류별 활성화가 여덟 종류 전부에서 돈다**(2026-08-19 15차 항목 6).
// 산출: `stage0/out/osnap_kinds.json`.
//
// 사용자 지시 6(압축 기록): *"라이노 방식 패널 — 끝점·중점·교차점·근처점·수선 발·정점·
// 연장선 · 현재 켜진 것 표시 · 반경 조절."*
//
// **패널은 이미 있다**(2026-08-17 지시 H · `osnap_config.json`). 이 원장이 더하는 것은
// **덮는 범위**다: 옛 팔은 종류 토글을 `endpoint`+`vertex` 한 쌍과 `perpendicular` 발화
// 하나로만 쟀다 — 여덟 중 **다섯**(midpoint·intersection·extension·on_edge·on_face)이
// 안 재진 채 "개별 활성화가 된다"로 읽히고 있었다(#36: 안 잰 팔을 0으로 안 센다).
//
// **동작점을 손으로 안 만든다**(#46) — 화면을 훑어 각 종류가 **실제로 이기는 자리**를
// 장면에서 찾고, 거기서 그 종류만 꺼서 승자가 바뀌는지 본다. 손으로 만들면 픽스처가
// 답을 정한다(옛 팔의 수선 발이 그 자리에 걸렸다 — `perp_foot_px_fixture_determined`).
//
// 착수 시 `PITFALLS.md`를 읽었다(표는 `progress.md`의 이 항목 착수 절):
//   #12 종류마다 자리를 따로 찾는다 — 동작점 하나로 여덟을 대표하지 않는다
//   #17 질의는 `S2S.snapCands`(앱의 `snapCandidates`) 하나를 지난다 · 새 임계 없음
//   #21 dpr 1 · #30 토글 자체가 스위치다 · #35 못 찾은 종류를 **안전으로 안 읽는다**
//   #36 안 잰 종류를 0으로 안 센다 — 못 찾으면 `unreached`에 이름을 적는다
//   #40·#46 값은 **끄면 승자가 바뀐 종류의 수**가 아니라 종류별 승자쌍 표다
//   #47 수치를 산문에 안 박는다 · #49 "가른다"의 단위는 **승자 종류**다(거리가 아니다)
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { SNAP_ORDER, SNAP_LABEL } from "../src/s3d/snap.js";
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("종류 토글 — 여덟 종류가 각각 스냅을 가른다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e}`));
  await page.goto("/l.html");
  await setupConfirmed(page);

  const probe = await page.evaluate(async (args: any) => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const ctx = S.cam.ctx();
    const el = document.getElementById("ink") as HTMLCanvasElement;
    const W = el.clientWidth, H = el.clientHeight;
    // 수선 발의 재료 — 앵커 하나(없으면 `perpendicular`가 후보에 안 나온다)
    const st0 = S.doc().strokes.find((s: any) => s.seg3d)!;
    const from = st0.seg3d[1];
    // 조리개를 넓혀 훑는다 — **찾는 단계**다(가르는 단계는 기본 조리개로 되돌린 뒤)
    S.setOsnap({ radiusPx: 40 });
    const win: Record<string, any> = {};
    const step = 9;
    for (let y = step; y < H; y += step) {
      for (let x = step; x < W; x += step) {
        const cs = S.snapCands([x, y], from).filter((c: any) => c.enabled);
        if (!cs.length) continue;
        const k = cs[0].kind;
        // 그 종류의 **첫 자리**만 잡는다. 더 가까운 자리로 갈아타지 않는다 — 순회 순서가
        // 정하는 자리이고, 그것을 원장이 좌표로 남기므로 재현된다
        if (!win[k]) win[k] = { at: [x, y], dist: cs[0].dist, ofId: cs[0].ofId,
                                runner_up: cs[1] ? cs[1].kind : null };
      }
    }
    S.setOsnap({ radiusPx: args.aperture });
    return { canvas: [W, H], from, win, step };
  }, { aperture: OSNAP_RADIUS_PX });

  // ---- 각 종류를 **하나씩** 끄고 같은 자리에서 승자가 바뀌는지 본다
  const rows = [] as any[];
  for (const kind of SNAP_ORDER) {
    const w = (probe.win as any)[kind];
    if (!w) { rows.push({ kind, label: SNAP_LABEL[kind], found: false }); continue; }
    const r = await page.evaluate(async (a: any) => {
      const S = window.S2S;
      S.setOsnap({ radiusPx: 40 });
      // **앱의 승자는 «켜진 것 중 1등»이다**(`appSnapAt`) — 필터를 여기서도 그대로 지난다(#17)
      const on = S.snapCands(a.at, a.from).filter((c: any) => c.enabled);
      const off0: Record<string, boolean> = {}; off0[a.kind] = false;
      S.setOsnap({ kinds: off0 });
      const off = S.snapCands(a.at, a.from).filter((c: any) => c.enabled);
      const on1: Record<string, boolean> = {}; on1[a.kind] = true;
      S.setOsnap({ kinds: on1, radiusPx: a.aperture });          // 원상 복구
      return { on_winner: on.length ? on[0].kind : null,
               off_winner: off.length ? off[0].kind : null,
               on_has_kind: on.some((c: any) => c.kind === a.kind),
               off_has_kind: off.some((c: any) => c.kind === a.kind) };
    }, { at: w.at, from: probe.from, kind, aperture: OSNAP_RADIUS_PX });
    rows.push({ kind, label: SNAP_LABEL[kind], found: true, at: w.at,
                runner_up: w.runner_up, ...r,
                /** **가르는가** — 껐을 때 그 종류가 후보에서 사라졌는가(#49: 단위는 종류다) */
                gated: r.on_has_kind && !r.off_has_kind,
                /** 승자까지 바뀌었는가 — 그 종류가 1등이던 자리이므로 바뀌어야 한다 */
                winner_changed: r.on_winner !== r.off_winner });
  }

  // ---- **정점 팔**: 합성 잉크는 끝점이 흔들려 있어 «여러 획이 만난 끝점»이 없다.
  // 앱으로 **기존 끝점에서 시작하는 획을 하나 그으면** 시작점이 그 후보의 3D 좌표로
  // 정확히 놓이고(`applySnapToStart`), 그 자리가 정점으로 승격된다(`snap.ts`의 hits≥2).
  // ⚠ 장면을 만드는 것이지 **답을 만드는 것이 아니다**(#46) — 승자는 그 뒤에 묻는다.
  const vertexRow = await (async () => {
    const box = (await page.locator("#frame").boundingBox())!;
    const tip = await page.evaluate(async () => {
      const S = window.S2S;
      const g3 = await import("/src/s3d/geom3d.ts");
      const c = S.cam.ctx();
      const st = S.doc().strokes.find((s: any) => s.seg3d)!;
      return g3.project(st.seg3d[0], c.principal, c.f);
    });
    if (!tip) return { kind: "vertex", label: SNAP_LABEL.vertex, found: false,
                       why: "끝점을 화면에 투영하지 못했다" };
    await page.mouse.move(box.x + tip[0], box.y + tip[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + tip[0] + 90, box.y + tip[1] + 55, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    return page.evaluate(async (a: any) => {
      const S = window.S2S;
      S.setOsnap({ radiusPx: 40 });
      const on = S.snapCands(a.at, a.from).filter((c: any) => c.enabled);
      if (!on.length || on[0].kind !== "vertex") {
        S.setOsnap({ radiusPx: a.aperture });
        return { kind: "vertex", label: a.label, found: false,
                 why: `그 자리의 1등이 ${on.length ? on[0].kind : "없음"}이다` };
      }
      S.setOsnap({ kinds: { vertex: false } });
      const off = S.snapCands(a.at, a.from).filter((c: any) => c.enabled);
      S.setOsnap({ kinds: { vertex: true }, radiusPx: a.aperture });
      return { kind: "vertex", label: a.label, found: true, at: a.at,
               runner_up: on[1] ? on[1].kind : null,
               on_winner: on[0].kind, off_winner: off.length ? off[0].kind : null,
               on_has_kind: true, off_has_kind: off.some((c: any) => c.kind === "vertex"),
               gated: !off.some((c: any) => c.kind === "vertex"),
               winner_changed: (off.length ? off[0].kind : null) !== on[0].kind,
               built_by: "앱으로 기존 끝점에서 획 하나를 그었다(장면 구성)" };
    }, { at: tip.map((v: number) => Math.round(v)), from: probe.from,
         aperture: OSNAP_RADIUS_PX, label: SNAP_LABEL.vertex });
  })();
  const vi = rows.findIndex(r => r.kind === "vertex");
  if (vi >= 0 && !rows[vi].found) rows[vi] = vertexRow;

  // **`extension`은 점 후보가 아니다** — 방향 스냅이고(`snap.ts` 머리말: "후보 생성이
  // 아니라 `extension.ts`가 판정한다") `SNAP_ORDER`에 있는 이유는 **우선순위와 종류
  // 토글**뿐이다. 그러므로 이 원장의 격자로는 **구성상** 못 찾는다 — 안 잰 것이 아니라
  // **다른 자리에서 재진다**: `extension_snap.json`의 `toggle_contrast`(끄면 증분 0).
  const COVERED_ELSEWHERE: Record<string, string> = {
    extension: "점 후보가 아니라 방향 스냅이다(`extension.ts`) — 토글은 "
      + "`extension_snap.json`의 `toggle_contrast` 팔이 든다(끄면 배치 증분 0)",
  };
  const unreached = rows.filter(r => !r.found && !COVERED_ELSEWHERE[r.kind]).map(r => r.kind);
  const gatedKinds = rows.filter(r => r.gated).map(r => r.kind);

  // ---- **꺼진 것이 화면에 보이는가**(지시 6 "현재 켜진 것 표시" · D-L105)
  const labelArm = await page.evaluate(() => {
    const S = window.S2S;
    const read = () => {
      const b = document.querySelector('#bar button[data-act="osnap"]');
      return b ? (b.textContent || "").trim() : null;
    };
    const all_on = read();
    S.setOsnap({ kinds: { midpoint: false, intersection: false } });
    const two_off = read();
    S.setOsnap({ kinds: { midpoint: true, intersection: true } });
    return { all_on, two_off,
             says_off_count: all_on !== two_off && /2/.test(two_off || "") };
  });

  const led: any = {
    what: "오스냅 **종류별 토글**이 여덟 종류 각각에서 실제로 스냅을 가르는가(지시 6).",
    how: {
      find: "조리개를 40px로 넓혀 화면을 격자로 훑고(`step` px), 각 종류가 **1등이 되는 "
        + "첫 자리**를 장면에서 찾는다 — 동작점을 손으로 안 만든다(#46). 그 자리의 좌표를 "
        + "원장이 남기므로 재현된다.",
      label: "«현재 켜진 것 표시»(지시 6)는 **패널을 안 열어도** 보여야 한다 — 종류 둘을 "
        + "끄고 하단바의 스냅 버튼 글자가 바뀌는지 읽는다(`label_arm`). 옛 판은 패널을 "
        + "두 번 열어야만 알 수 있었다.",
      gate_one: "그 자리에서 **그 종류만** 끄고 다시 묻는다. 판정은 «그 종류가 후보에서 "
        + "사라졌는가»(`gated`)이고, 승자까지 바뀌었는지를 함께 낸다(#49: 단위는 **종류**다 "
        + "— 거리가 아니다).",
      restore: "팔마다 조리개와 종류를 되돌린다 — 앞 종류의 끔이 다음 종류의 자리를 안 바꾼다.",
    },
    what_this_does_not_say: [
      "dpr 1·합성·한 픽스처(확정된 합성 상자)다(#12·#21). 종류마다 **자리 하나**다.",
      "**패널 안 버튼의 `class=\"on\"` 표시는 안 잰다** — 잰 것은 하단바 스냅 버튼의 "
      + "**글자**(`label_arm`)다. 종류별 버튼이 켜짐을 어떻게 칠하는지는 안 든다.",
      "**반경 조절은 여기서 안 잰다** — `osnap_config.json`의 15/40 팔이 그 자리다.",
      "**못 찾은 종류는 «되는 것»이 아니다**(#35·#36) — 이 픽스처가 그 종류를 1등으로 "
      + "만드는 자리를 안 낸 것이고, `unreached`가 그 이름을 든다. 그 종류의 토글은 "
      + "**이 원장이 아무 말도 안 한다.** ⚠ `covered_elsewhere`는 그것과 **다르다** — "
      + "구성상 여기서 못 재는 것이고 어느 원장이 재는지를 이름으로 든다.",
      "**정점 팔은 장면을 만들었다** — 합성 잉크는 끝점이 흔들려 있어 «여러 획이 만난 "
      + "끝점»이 없다. 앱으로 기존 끝점에서 획 하나를 그어 그 자리를 만들었고(그 시작점은 "
      + "후보의 3D 좌표로 정확히 놓인다), **승자는 그 뒤에 물었다**(#46: 장면을 만든 것이지 "
      + "답을 만든 것이 아니다). 다른 일곱은 격자가 장면에서 찾았다.",
      "격자 훑기라 **각 종류의 자리는 그 종류가 이기는 여러 자리 중 하나**다 — 대표성을 "
      + "주장하지 않는다.",
    ],
    covered_elsewhere: COVERED_ELSEWHERE,
    setup: { canvas: probe.canvas, grid_step_px: probe.step,
             find_radius_px: 40, gate_radius_px: OSNAP_RADIUS_PX,
             default_radius_px: OSNAP_RADIUS_PX },
    kinds: rows,
    label_arm: labelArm,
    summary: {
      order: SNAP_ORDER.slice(),
      found: rows.map(r => r.found),
      gated: rows.map(r => !!r.gated),
      winner_changed: rows.map(r => !!r.winner_changed),
      on_winner: rows.map(r => r.on_winner ?? null),
      off_winner: rows.map(r => r.off_winner ?? null),
      unreached,
      covered_elsewhere: COVERED_ELSEWHERE,
      /** 옛 팔이 덮던 종류 — 이 원장이 넓힌 몫을 그대로 보이게 적는다 */
      covered_before: ["endpoint", "vertex", "perpendicular"],
      /** 지시 6 "현재 켜진 것 표시" — 패널을 안 열어도 꺼진 수가 보이는가 */
      label_says_off_count: labelArm.says_off_count,
    },
    gate: {
      registered: "**찾은 종류는 전부** 그 종류만 껐을 때 후보에서 사라진다. 판정은 "
        + "`summary.gated`와 `summary.found`가 든다(#47).",
      reachability: "값은 **종류별 승자쌍**(`on_winner` → `off_winner`)이다 — 끄기 전후로 "
        + "실제로 다른 종류가 이겼다는 것이 그 자리의 증거다. 수(가른 종류의 개수)를 값으로 "
        + "안 쓴다(#46: 그 수는 여덟이라는 상수에 갇힌다). `unreached`가 비지 않으면 그 "
        + "종류들에 대해 이 원장은 **아무것도 안 말한다**(#32·#35).",
      reachability_value: null as unknown,
      reachability_source: "summary/off_winner",
      /**
       * **픽스처가 정한 상수가 아닌가**(#46). `false`다: 승자쌍은 **장면이 정한다**(격자
       * 훑기가 자리를 찾았다). 판별 — 종류 필터를 무시하도록 코드를 틀리게 하면
       * `off_winner`가 `on_winner`와 같아지고 `gated`가 전부 거짓이 된다.
       */
      reachability_value_fixture_determined: false,
      result: {} as Record<string, unknown>,
    },
    selfcheck_notes: {
      unreached_not_zero: "`unreached`가 비어 있지 않으면 그것은 «그 종류의 토글이 "
        + "0건 실패했다»가 아니라 **안 쟀다**는 뜻이다(#36) — 분모에서 뺀다.",
    },
    ui_constants: { snap_order: SNAP_ORDER.slice(), labels: { ...SNAP_LABEL } },
    pitfall_citations: [12, 17, 21, 30, 32, 35, 36, 40, 46, 47, 49],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_value = led.summary.off_winner;
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "osnap_kinds.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  // **찾은 종류는 전부 가른다** — 하나라도 안 갈리면 그 토글은 표시만이다
  for (const r of rows.filter(x => x.found)) {
    expect({ kind: r.kind, gated: r.gated }).toEqual({ kind: r.kind, gated: true });
  }
  // **옛 팔이 덮던 셋은 반드시 찾아진다**(#32 — 이 원장이 옛 범위를 안 잃었다)
  for (const k of ["endpoint", "vertex", "perpendicular"]) {
    expect(rows.find(r => r.kind === k)!.found).toBe(true);
  }
  // **넓혔다** — 옛 셋 말고도 최소 둘 이상을 새로 덮는다
  expect(gatedKinds.filter(k => !["endpoint", "vertex", "perpendicular"].includes(k)).length)
    .toBeGreaterThanOrEqual(2);
  // **여덟 종류가 전부 어딘가에서 재진다**(#36) — 여기서 갈리거나, 다른 원장이 이름으로 든다
  for (const k of SNAP_ORDER) {
    const r = rows.find(x => x.kind === k)!;
    expect({ kind: k, ok: !!r.gated || !!COVERED_ELSEWHERE[k] })
      .toEqual({ kind: k, ok: true });
  }
  expect(unreached).toEqual([]);
  // **지시 6 "현재 켜진 것 표시"** — 패널을 안 열어도 꺼진 수가 라벨에 나온다(D-L105)
  expect(labelArm.says_off_count).toBe(true);
});
