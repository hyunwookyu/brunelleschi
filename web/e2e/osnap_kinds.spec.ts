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
    // ⚠ **조리개를 안 바꾼다**(1차 리뷰어 [4]) — 옛 판은 40px로 찾고 8px로 갈라서 «종류가
    // 사라졌다»가 조리개 축소의 산물일 수 있었다(교락). 찾기와 가르기가 **같은 조리개**다.
    S.setOsnap({ radiusPx: args.aperture });
    const win: Record<string, any> = {};
    const step = args.step;
    let queries = 0;
    for (let y = step; y < H; y += step) {
      for (let x = step; x < W; x += step) {
        queries += 1;
        // **앱의 승자**를 그대로 쓴다(`appSnapAt`) — 종류 필터를 하네스가 다시 걸지 않는다
        const w = S.snap([x, y]);
        if (!w) continue;
        const k = w.kind;
        // 그 종류의 **첫 자리**만 잡는다 — 순회 순서가 정하는 자리이고 좌표를 원장이 남긴다
        if (!win[k]) {
          const cs = S.snapCands([x, y], from).filter((c: any) => c.enabled);
          win[k] = { at: [x, y], dist: w.dist, ofId: w.ofId ?? null,
                     runner_up: cs[1] ? cs[1].kind : null };
        }
      }
    }
    return { canvas: [W, H], from, win, step, queries };
  }, { aperture: OSNAP_RADIUS_PX, step: 5 });

  // ---- 각 종류를 **하나씩** 끄고 같은 자리에서 승자가 바뀌는지 본다
  const rows = [] as any[];
  for (const kind of SNAP_ORDER) {
    const w = (probe.win as any)[kind];
    if (!w) { rows.push({ kind, label: SNAP_LABEL[kind], found: false }); continue; }
    const r = await page.evaluate(async (a: any) => {
      const S = window.S2S;
      // ⚠⚠ **판정은 `S2S.snap`이 한다**(1차 리뷰어 [1] — 옛 판은 후보 목록에 **하네스가**
      // 종류 필터를 다시 걸어서, 앱의 필터(`appSnapAt`의 `.find`)를 지워도 같은 답이 나왔다.
      // 그러면 재는 것은 토글이 아니라 자기 필터다). `S2S.snap`은 그 `.find`를 지난다(#17).
      const on = S.snap(a.at);
      const off0: Record<string, boolean> = {}; off0[a.kind] = false;
      S.setOsnap({ kinds: off0 });
      const off = S.snap(a.at);
      const on1: Record<string, boolean> = {}; on1[a.kind] = true;
      S.setOsnap({ kinds: on1 });                                // 원상 복구(조리개는 안 건드린다)
      return { on_winner: on ? on.kind : null,
               off_winner: off ? off.kind : null,
               on_has_kind: !!on && on.kind === a.kind,
               off_has_kind: !!off && off.kind === a.kind };
    }, { at: w.at, from: probe.from, kind });
    rows.push({ kind, label: SNAP_LABEL[kind], found: true, at: w.at,
                runner_up: w.runner_up, ...r,
                /** **가르는가** — 껐을 때 그 종류가 후보에서 사라졌는가(#49: 단위는 종류다) */
                gated: r.on_has_kind && !r.off_has_kind,
                /** 승자까지 바뀌었는가 — 그 종류가 1등이던 자리이므로 바뀌어야 한다 */
                winner_changed: r.on_winner !== r.off_winner });
  }

  // ---- **수선 발 팔**(⚠ **정점 팔보다 먼저 돈다** — 정점 팔이 획을 하나 더해
  // 장면을 바꾸고, 그러면 이 자리의 1등이 교차점으로 바뀐다). `perpendicular`는 **끝점 스냅 경로에만** 있다 — 앵커(`from`)가
  // 있어야 정의되기 때문이다(`snapCandidates`의 `ctx.from`). 그래서 `S2S.snap`(시작점
  // 질의)의 격자로는 안 나온다. 앱 경로는 `S2S.endSnap`이고 그 필터(`endSnapKindOk`)가
  // `OSNAP.kinds`를 지난다 — 판정을 그리로 옮긴다(#17: 그 종류가 사는 자리에서 잰다).
  const perpRow = await page.evaluate(async () => {
    const S = window.S2S;
    const g3 = await import("/src/s3d/geom3d.ts");
    const c = S.cam.ctx();
    const sts = S.doc().strokes.filter((x: any) => x.seg3d);
    const st = sts[0], seg = sts.find((x: any) => x.id !== st.id)!;
    const A = seg.seg3d[0] as number[], B = seg.seg3d[1] as number[];
    const T = 0.3;
    const foot3 = [0, 1, 2].map(k => A[k] + (B[k] - A[k]) * T);
    // 앵커는 선분에 **수직으로** 비켜 세운다 — 그래야 수선의 발이 정확히 t=0.3이다
    // ⚠ **자리는 `osnap_config`가 쓰던 것 그대로다**(같은 동작점 — 그 원장은 «발화»를,
    // 여기는 «토글»을 묻는다). 앵커 방향·겨냥 오프셋(4,3)까지 같게 둔다: 자리를 새로
    // 고르면 그 원장의 판별(중점이 조리개 밖)이 여기서 성립하는지 다시 재야 한다
    const d = [0, 1, 2].map(k => B[k] - A[k]);
    const dn = Math.hypot(d[0], d[1], d[2]) || 1;
    const u = d.map(v => v / dn);
    const pick = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const dt = pick[0] * u[0] + pick[1] * u[1] + pick[2] * u[2];
    const w = pick.map((v, k) => v - dt * u[k]);
    const wn = Math.hypot(w[0], w[1], w[2]) || 1;
    const from = foot3.map((v, k) => v + (w[k] / wn) * 0.5) as [number, number, number];
    const foot2 = g3.project(foot3 as any, c.principal, c.f);
    if (!foot2) return { kind: "perpendicular", found: false, why: "발을 투영하지 못했다" };
    const at: [number, number] = [foot2[0] + 4, foot2[1] + 3];
    const on = S.endSnap(from, at);
    if (!on || on.kind !== "perpendicular") {
      return { kind: "perpendicular", found: false,
               why: `끝점 스냅의 1등이 ${on ? on.kind : "없음"}이다` };
    }
    S.setOsnap({ kinds: { perpendicular: false } });
    const off = S.endSnap(from, at);
    S.setOsnap({ kinds: { perpendicular: true } });
    return { kind: "perpendicular", label: "수선 발", found: true,
             at: at.map((v: number) => Math.round(v)),
             path: "endSnap(앵커가 있어야 정의된다)",
             on_winner: on.kind, off_winner: off ? off.kind : null,
             on_has_kind: true, off_has_kind: !!off && off.kind === "perpendicular",
             gated: !(off && off.kind === "perpendicular"),
             winner_changed: (off ? off.kind : null) !== on.kind,
             runner_up: null, fixture_determined: true };
  });
  const pi = rows.findIndex(r => r.kind === "perpendicular");
  if (pi >= 0 && !rows[pi].found) rows[pi] = perpRow;

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
      const on = S.snap(a.at);
      if (!on || on.kind !== "vertex") {
        return { kind: "vertex", label: a.label, found: false,
                 why: `그 자리의 1등이 ${on ? on.kind : "없음"}이다` };
      }
      const cs = S.snapCands(a.at, a.from).filter((c: any) => c.enabled);
      S.setOsnap({ kinds: { vertex: false } });
      const off = S.snap(a.at);
      S.setOsnap({ kinds: { vertex: true } });
      return { kind: "vertex", label: a.label, found: true, at: a.at,
               runner_up: cs[1] ? cs[1].kind : null,
               on_winner: on.kind, off_winner: off ? off.kind : null,
               on_has_kind: true, off_has_kind: !!off && off.kind === "vertex",
               gated: !(off && off.kind === "vertex"),
               winner_changed: (off ? off.kind : null) !== on.kind,
               built_by: "앱으로 기존 끝점에서 획 하나를 그었다(장면 구성)",
               /**
                * ⚠ **이 행의 승자쌍은 구성이 정한다**(1차 리뷰어 [3]): 같은 좌표에 거리 0의
                * `endpoint` 후보가 반드시 있고 `SNAP_ORDER`가 vertex를 앞에 두므로
                * off_winner는 endpoint 외일 수 없다. 다른 여섯과 갈라 표시한다
                */
               fixture_determined: true };
    }, { at: tip.map((v: number) => Math.round(v)), from: probe.from,
         label: SNAP_LABEL.vertex });
  })();
  const vi = rows.findIndex(r => r.kind === "vertex");
  if (vi >= 0 && !rows[vi].found) rows[vi] = vertexRow;


  // **`extension`은 점 후보가 아니다** — 방향 스냅이고(`snap.ts` 머리말: "후보 생성이
  // 아니라 `extension.ts`가 판정한다") `SNAP_ORDER`에 있는 이유는 **우선순위와 종류
  // 토글**뿐이다. 그러므로 이 원장의 격자로는 **구성상** 못 찾는다 — 안 잰 것이 아니라
  // **다른 자리에서 재진다**: `extension_snap.json`의 `toggle_contrast`(끄면 증분 0).
  const COVERED_ELSEWHERE: Record<string, string> = {
    extension: "점 후보가 아니라 방향 스냅이다(`extension.ts`) — 토글은 "
      + "`extension_snap.json`의 `toggle_contrast` 팔이 든다(끄면 배치 증분 0). "
      + "⚠ **단위가 다르다**(#49 · 1차 리뷰어 [5]): 여기의 판정은 «앱의 승자에서 그 종류가 "
      + "사라지는가»(종류)이고 그쪽은 **배치 경로 카운터의 증분**이다. "
      + "⚠⚠ 그리고 그쪽 게이트의 도달 가능성은 `selfcheck.json`이 **«픽스처 결정 = 통과가 "
      + "아니다»**로 분류한 값이다(`reachability_value` [1] · `..._fixture_determined` 참). "
      + "즉 «다른 원장이 덮는다»는 **덮는 강도가 여기와 같지 않다**.",
  };
  const unreached = rows.filter(r => !r.found && !COVERED_ELSEWHERE[r.kind]).map(r => r.kind);
  const gatedKinds = rows.filter(r => r.gated).map(r => r.kind);

  // ---- **꺼진 것이 화면에 보이는가**(지시 6 "현재 켜진 것 표시" · D-L105)
  // ⚠ **패널 버튼을 실제로 누른다**(1차 리뷰어 [7]) — `S2S.setOsnap`으로 걸면
  // «패널 버튼 → `OSNAP.kinds`» 배선이 한 번도 안 지나간다.
  const labelArm = await page.evaluate(() => {
    const S = window.S2S;
    const bar = document.getElementById("bar")!;
    const read = () => {
      const b = bar.querySelector('button[data-act="osnap"]');
      return b ? (b.textContent || "").trim() : null;
    };
    const click = (sel: string) => {
      const b = bar.querySelector<HTMLButtonElement>(sel);
      if (!b) return false;
      b.click();
      return true;
    };
    const all_on = read();
    // 접이식 메뉴를 열고 패널을 연 뒤 종류 버튼 둘을 누른다(사용자가 하는 순서 그대로)
    const opened_menu = click('button[data-act="menu"]');
    const opened_panel = click('button[data-act="osnap"]');
    const hit_mid = click('button[data-osnap-kind="midpoint"]');
    const hit_int = click('button[data-osnap-kind="intersection"]');
    const kinds_after = { ...S.osnap().kinds };
    const two_off = read();
    click('button[data-osnap-kind="midpoint"]');
    click('button[data-osnap-kind="intersection"]');
    click('button[data-act="osnap"]');
    click('button[data-act="menu"]');
    return { all_on, two_off, opened_menu, opened_panel, hit_mid, hit_int,
             /** 패널 버튼이 실제로 상태를 껐는가 — 배선 확인(#17) */
             kinds_off_after_click: !kinds_after.midpoint && !kinds_after.intersection,
             says_off_count: all_on !== two_off && /2/.test(two_off || ""),
             restored: !!S.osnap().kinds.midpoint && !!S.osnap().kinds.intersection };
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
      "**`perpendicular`는 다른 경로에서 잰다** — 앵커가 있어야 정의되므로 시작점 질의"
      + "(`S2S.snap`)의 격자에 안 나온다. 앱 경로는 끝점 스냅(`S2S.endSnap`)이고 그 필터"
      + "(`endSnapKindOk`)가 같은 `OSNAP.kinds`를 지난다. 자리는 `osnap_config`가 쓰던 "
      + "t = 0.3 발이다(픽스처가 정한 자리 — `fixture_determined` 참).",
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
      + "주장하지 않는다. 훑은 점 수는 `setup.queries`가 든다(#38: 하네스가 스스로 적는다).",
      "**확정 후(3D) 단계뿐이다**(1차 리뷰어 [10]) — 확정 **전** 2D 단계에서는 여덟 중 "
      + "`on_edge`·`on_face` 둘이 아예 안 걸린다는 기록이 따로 있다(`DEFERRED`의 그 행). "
      + "이 원장의 `gated` 7/7은 그 단계를 안 든다.",
      "**정점 행은 다른 여섯과 성질이 다르다** — 장면을 구성해 만들었고 그 구성이 승자쌍을 "
      + "정한다(`kinds[].fixture_determined` 참, 1차 리뷰어 [3]). 나머지는 격자가 찾았다.",
    ],
    covered_elsewhere: COVERED_ELSEWHERE,
    setup: { canvas: probe.canvas, grid_step_px: probe.step,
             /** 찾기와 가르기가 **같은 조리개**다(1차 리뷰어 [4]) */
             radius_px: OSNAP_RADIUS_PX,
             /** 훑은 격자 점 수 — 이 팔의 비용(#38·A-4) */
             queries: probe.queries,
             arms: 8 + 1 },
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
      /**
       * **옛 팔이 «개별 토글»로 덮던 종류 — 0이다**(1차 리뷰어 [6]).
       * ⛔ 초판은 `["endpoint","vertex","perpendicular"]` 셋으로 적었는데 틀렸다:
       * `osnap_config.json`의 `no_endpoint`는 endpoint와 vertex를 **한 팔에서 동시에** 껐고
       * (그러면 어느 쪽 단독 토글도 안 갈린다), `perp_kind`는 그 원장이 스스로
       * "가르는 것은 **존재**이지 순위가 아니다"라고 적은 **발화 팔**이지 토글 팔이 아니다.
       */
      covered_before_individually: [] as string[],
      /** 옛 팔이 어떤 형태로든 손댄 종류(참고 — 개별 토글은 아니다) */
      touched_before: ["endpoint", "vertex", "perpendicular"],
      /** 지시 6 "현재 켜진 것 표시" — 패널을 안 열어도 꺼진 수가 보이는가 */
      label_says_off_count: labelArm.says_off_count,
    },
    gate: {
      registered: "**찾은 종류는 전부** 그 종류만 껐을 때 후보에서 사라진다. 판정은 "
        + "`summary.gated`와 `summary.found`가 든다(#47).",
      registered_note: "⚠ **이 항목이 등록한 게이트다 — CLAUDE.md §2 중단 조건 아님**(#41). "
        + "실패하면 A-2대로 우회한다.",
      reachability: "값은 **종류별 승자쌍**(`on_winner` → `off_winner`)이다. ⛔ **연속량이 "
        + "아니다**(1차 리뷰어 [2]): `off_winner`는 켬 상태 후보 목록의 **2등**과 7/7 같고, "
        + "실제로 재는 것은 **«그 종류가 앱의 승자에서 사라지는가»의 1비트 × 종류 수**다. "
        + "그것을 `reachability_bits`가 그대로 든다. `unreached`가 비지 않으면 그 종류들에 "
        + "대해 이 원장은 **아무것도 안 말한다**(#32·#35).",
      reachability_value: null as unknown,
      reachability_source: "summary/off_winner",
      /** 실제로 재는 양 — 종류별 1비트(1차 리뷰어 [2] · 항목 5가 세운 표기, #42 ⑩) */
      reachability_bits: null as unknown,
      /**
       * **픽스처가 정한 값인가**(#46). ⛔ **`true`다**(1차 리뷰어 [2] — 초판은 `false`였다):
       * `off_winner`의 **이름**은 그 자리의 후보 순위가 정하고 코드를 틀리게 해도 다른
       * 이름이 안 나온다. 움직이는 것은 **비트**(사라지는가)뿐이다. 판별은 그 비트로 한다 —
       * `appSnapAt`의 종류 필터를 지우면 `gated`가 전부 거짓이 된다(그래서 판정을
       * `S2S.snap`으로 옮겼다, 1차 리뷰어 [1]).
       */
      reachability_value_fixture_determined: true,
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
  led.gate.reachability_bits = rows.map(r => ({ kind: r.kind, gated: !!r.gated }));
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
  // **패널 버튼 배선**(1차 리뷰어 [7]) — 버튼을 실제로 눌러 상태가 꺼지고 되돌아온다
  expect(labelArm.kinds_off_after_click).toBe(true);
  expect(labelArm.restored).toBe(true);
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
