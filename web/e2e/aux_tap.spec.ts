// **보조 소실점 — 탭이 만드는 두 경로**(2026-08-20 16차 항목 0 · D-L106 후속).
// 산출: `stage0/out/aux_tap.json`.
//
// 지시 원문(`docs/instructions/16.md` 지시 7 — 15차의 압축이 아니라 **원문**이다):
//   *"만드는 경로 셋 — 지평선 위 탭 → 그 자리에 보조 소실점 · 각도기 광선 → … **그 점에서
//   쏜 광선의 각도가 곧 세계 각도다** · 각도 입력 → 같은 것이다"*
//
// 15차는 셋 중 **각도 입력 하나만** 냈고 나머지 둘을 «각도의 다른 표기»라며 기각했다 —
// 16차 지시 0-a·0-b가 그 어긋남을 짚었다. 이 원장이 재는 것은 새로 배선된 **탭 경로 둘**이다:
//
//   ① 지평선 위 탭   →  **그 자리에** 보조 소실점이 서는가 (`tap_gap_px`)
//   ② 각도기 광선     →  만들어진 소실점이 **E → 탭점 광선 위**에 있는가 (`ray_off_px`)
//
// **경로 ③과의 «같은 것» 판정은 단위 팔의 몫이다**(`test/aux_vp.test.ts`의 «만드는 경로
// 셋» — 2점·3점·롤 3점 전 차수, PITFALLS #51). 여기서는 **배선**을 잰다: 실제 포인터 탭이
// `addAux`(③과 같은 함수)에 닿는가.
//
// ⚠ **②의 판정은 하네스가 각도 공식을 다시 쓰지 않는다**(PITFALLS #52 — 16차 지시 1-b:
// 하네스가 앱과 같은 조건을 다시 걸면 앱을 지워도 같은 답이 나온다). 광선 판정은 각이
// 아니라 **공선성**(E·탭점·소실점이 한 직선)으로 한다 — 그 셋이 한 직선인 것은 앱의 각도
// 계산과 독립인 기하 명제다.
//
// 착수 시 `PITFALLS.md`를 읽었다(표는 `progress.md`의 16차 항목 0 절):
//   #12 탭 자리 셋(지평선 두 자리 · 광선 한 자리) · #17 판정 띠는 `PICK_TOL` 재사용
//   #21 dpr 1 · #30 되살림은 패널 닫기(탭이 그리기로 돌아간다) · #32 미실행을 반증으로 안
//   쓴다 · #36 분모 0 팔을 0으로 안 센다 · #38 하네스가 팔 수를 스스로 적는다
//   #40·#46 게이트 값은 연속량(탭점↔소실점 px)과 비트 · #43 경로별 카운터(aux 개수 증분)
//   #47 수치는 필드가 든다 · #51 전 차수는 단위 팔이 돈다(여기는 픽스처 하나 — 그 사실을
//   `what_this_does_not_say`가 든다) · #53 팔마다 개수 기준선을 그 자리에서 다시 읽는다
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { PICK_TOL } from "../src/ui/pick.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupConfirmed } from "./fixture.js";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

test("보조 소실점 — 지평선 탭과 각도기 광선이 각도 입력과 같은 자리에 선다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`${e}`));
  await page.goto("/l.html");
  await setupConfirmed(page);
  const box = (await page.locator("#frame").boundingBox())!;

  const tap = async (p: [number, number]) => {
    await page.mouse.move(box.x + p[0], box.y + p[1]);
    await page.mouse.down();
    // 캡처는 2점부터 획이다(`inkCanvas.onUp`) — 1px만 움직여 «탭»을 획으로 만든다
    await page.mouse.move(box.x + p[0] + 1, box.y + p[1]);
    await page.mouse.up();
    await page.waitForTimeout(60);
  };
  const auxState = () => page.evaluate(() => {
    const S = window.S2S;
    return { n: S.aux().dirs.length, dirs: S.aux().dirs.map((d: any) => ({ ...d })),
             open: S.auxOpen() };
  });

  // ---- 패널을 **실제 버튼**으로 연다(15차 리뷰어 [7]의 선례 — API로 걸면 배선이 안 지나간다)
  const opened = await page.evaluate(() => {
    const bar = document.getElementById("bar")!;
    const click = (sel: string) => {
      const b = bar.querySelector<HTMLButtonElement>(sel);
      if (!b || b.disabled) return false;
      b.click(); return true;
    };
    const menu = click('button[data-act="menu"]');
    const aux = click('button[data-act="aux"]');
    return { menu, aux, open: window.S2S.auxOpen() };
  });

  // ---- ① **지평선 위 탭** — 두 자리(#12). 탭점과 만들어진 소실점의 거리가 판정이다.
  //
  // ⚠ 각을 0.1°로 반올림해 저장하므로 그 자리가 **정확히** 탭점은 아니다 — 반올림이
  // 소실점을 얼마나 옮기는지는 자리의 지렛대가 정한다(소실점 근처 각 민감도). 그 실측이
  // `tap_gap_px`이고 게이트는 판정 띠(`PICK_TOL` — 탭을 받은 그 띠)보다 작은가다(#17).
  const horizonTaps: any[] = [];
  for (const fx of [0.42, 0.65]) {
    const target = await page.evaluate((fx: number) => {
      const o = window.S2S.draftOverlay();
      if (!o?.horizonLine) return null;
      const { a, b } = o.horizonLine;
      const w = (document.getElementById("ink") as HTMLCanvasElement).clientWidth;
      const x = w * fx;
      const t = (x - a[0]) / ((b[0] - a[0]) || 1e-9);
      return [x, a[1] + t * (b[1] - a[1])];
    }, fx);
    if (!target) { horizonTaps.push({ fx, unreached: "horizonLine 없음" }); continue; }
    const before = await auxState();
    await tap(target as [number, number]);
    const after = await auxState();
    const made = after.dirs.find((d: any) => !before.dirs.some((x: any) => x.id === d.id)) ?? null;
    const at = made ? await page.evaluate((id: string) => {
      const v = window.S2S.auxVps().find((x: any) => x && x.id === id);
      return v && v.at ? v.at : null;
    }, made.id) : null;
    horizonTaps.push({
      fx, tap_at: (target as number[]).map(v => Math.round(v * 100) / 100),
      delta_n: after.n - before.n,
      made: made ? { yaw: made.yawDeg, pitch: made.pitchDeg } : null,
      vp_at: at ? at.map((v: number) => Math.round(v * 100) / 100) : null,
      /** «그 자리에»의 실측 — 탭점 ↔ 만들어진 소실점(px). 0.1° 반올림의 지렛대가 든 값 */
      tap_gap_px: at ? Math.round(Math.hypot(at[0] - (target as number[])[0],
                                             at[1] - (target as number[])[1]) * 100) / 100 : null,
    });
  }

  // ---- ② **각도기 광선** — 탈레스를 켜고 지평선 **밖**을 탭한다. 광선 E→탭점이 지평선과
  // 만나는 자리가 소실점이어야 한다 — 판정은 **공선성**(E·탭점·소실점 점-직선 px, #52).
  await page.evaluate(() => {
    const bar = document.getElementById("bar")!;
    const b = bar.querySelector<HTMLButtonElement>('button[data-act="aux_thales"]');
    if (b) b.click(); else window.S2S.setThales(true);
  });
  const rayArm = await (async () => {
    const target = await page.evaluate(() => {
      const S = window.S2S;
      const o = S.draftOverlay();
      const t = o?.thales;
      if (!t || !o.horizonLine) return null;
      const el = document.getElementById("ink") as HTMLCanvasElement;
      // E에서 지평선의 화면 안 한 점으로 가는 광선 위, 지평선에서 충분히 떨어진 자리 —
      // 지평선 띠(PICK_TOL) 밖이어야 경로 ①이 아니라 ②를 지난다
      const { a, b } = o.horizonLine;
      const w = el.clientWidth, h = el.clientHeight;
      const x = w * 0.58;
      const tt = (x - a[0]) / ((b[0] - a[0]) || 1e-9);
      const hp = [x, a[1] + tt * (b[1] - a[1])];
      const dx = hp[0] - t.E[0], dy = hp[1] - t.E[1];
      const L = Math.hypot(dx, dy) || 1;
      const p = [hp[0] - (dx / L) * 120, hp[1] - (dy / L) * 120];   // 광선 위, 지평선 앞 120px
      if (p[0] < 4 || p[0] > w - 4 || p[1] < 4 || p[1] > h - 4) return null;
      return { p, E: t.E, thales_on: true };
    });
    if (!target) return { unreached: "탭 자리가 화면 밖(E의 자리에 따라 생길 수 있다 — #35: 안전으로 안 읽는다)" };
    const before = await auxState();
    await tap(target.p as [number, number]);
    const after = await auxState();
    const made = after.dirs.find((d: any) => !before.dirs.some((x: any) => x.id === d.id)) ?? null;
    const probe = made ? await page.evaluate((arg: any) => {
      const v = window.S2S.auxVps().find((x: any) => x && x.id === arg.id);
      if (!v || !v.at) return null;
      // **공선성**(#52) — E·탭점·소실점. 각도 공식을 다시 쓰지 않는다
      const ex = arg.p[0] - arg.E[0], ey = arg.p[1] - arg.E[1];
      const L = Math.hypot(ex, ey) || 1;
      const off = Math.abs((v.at[0] - arg.E[0]) * ey - (v.at[1] - arg.E[1]) * ex) / L;
      return { vp_at: v.at.map((x: number) => Math.round(x * 100) / 100),
               ray_off_px: Math.round(off * 100) / 100 };
    }, { id: made.id, p: target.p, E: target.E }) : null;
    const eInside = await page.evaluate((E: number[]) => {
      const el = document.getElementById("ink") as HTMLCanvasElement;
      return E[0] >= 0 && E[0] <= el.clientWidth && E[1] >= 0 && E[1] <= el.clientHeight;
    }, target.E as number[]);
    return { tap_at: (target.p as number[]).map(v => Math.round(v * 100) / 100),
             E: (target.E as number[]).map(v => Math.round(v * 100) / 100),
             E_inside: eInside,
             delta_n: after.n - before.n,
             made: made ? { yaw: made.yawDeg, pitch: made.pitchDeg } : null,
             ...(probe ?? { vp_at: null, ray_off_px: null }) };
  })();

  // ---- **되살림**(#30) — 패널을 닫으면 같은 탭이 아무것도 안 만든다(탭은 그리기의 것)
  const closedArm = await (async () => {
    await page.evaluate(() => {
      const bar = document.getElementById("bar")!;
      bar.querySelector<HTMLButtonElement>('button[data-act="aux"]')?.click();  // 패널 닫기
    });
    const target = await page.evaluate(() => {
      const o = window.S2S.draftOverlay();
      if (!o?.horizonLine) return null;
      const { a, b } = o.horizonLine;
      const w = (document.getElementById("ink") as HTMLCanvasElement).clientWidth;
      const x = w * 0.5;
      const t = (x - a[0]) / ((b[0] - a[0]) || 1e-9);
      return [x, a[1] + t * (b[1] - a[1])];
    });
    if (!target) return { unreached: "horizonLine 없음" };
    const before = await auxState();
    await tap(target as [number, number]);
    const after = await auxState();
    return { open: after.open, delta_n: after.n - before.n };
  })();

  const canvas = await page.evaluate(() => {
    const el = document.getElementById("ink") as HTMLCanvasElement;
    return [el.clientWidth, el.clientHeight];
  });
  const bandPx = Math.round(PICK_TOL.radius_ratio * Math.hypot(canvas[0], canvas[1]) * 100) / 100;

  const led: any = {
    what: "실제 포인터 탭이 보조 소실점을 만드는가 — ① 지평선 위 탭은 **그 자리에**, "
      + "② 각도기 광선(탈레스 켬 · 지평선 밖 탭)은 **E→탭점 광선 위에**(16차 지시 7).",
    how: {
      wiring: "탭은 Playwright 마우스(신뢰 이벤트)다. 패널 열기는 **실제 버튼**을 누른다 — "
        + "API로 걸면 «패널이 열려 있을 때만 가로챈다»는 배선이 안 지나간다.",
      ray: "②의 판정은 **공선성**(E·탭점·소실점의 점-직선 px)이다 — 하네스가 앱의 각도 "
        + "공식을 다시 쓰면 앱을 지워도 같은 답이 나온다(#52·16차 지시 1-b). 세 점이 한 "
        + "직선인 것은 그 공식과 독립인 기하 명제다.",
      identity: "**경로 ③(각도 입력)과의 «같은 것» 판정은 단위 팔이 든다**"
        + "(`test/aux_vp.test.ts` «만드는 경로 셋» — 2점·3점·롤 3점). 여기는 배선 원장이다.",
    },
    what_this_does_not_say: [
      "dpr 1·마우스·한 픽스처다(#12·#21). ⛔ 초판이 이 픽스처를 «2점»이라 적었는데 "
      + "**3점이다**(1차 리뷰어 [9] — `setupConfirmed`는 `aux_vp.json`과 같은 픽스처이고 "
      + "그 원장의 `cam_before.order` = 3, 수직 소실점 유한). **전 차수는 단위 팔이 "
      + "돈다**(#51) — 이 종단이 한 차수 하나인 것은 15차의 그 함정과 같은 모양이므로 "
      + "명시한다.",
      "탭의 **손떨림**은 없다 — 마우스 합성이라 탭점이 정확하다. 실획의 탭 정밀도는 실획 "
      + "표본이 판정자다.",
      "`tap_gap_px`는 0.1° 반올림의 지렛대를 **포함한** 값이다 — 배선 오차와 반올림 이동을 "
      + "여기서 안 가른다(가르려면 반올림 전 각을 원장에 남겨야 하고, 그 상태는 앱에 없다).",
      "**광선 팔의 E는 화면 밖이다**(`ray.E_inside` — 1차 리뷰어 [12]): 지시 7의 «계산은 "
      + "실제 위치로»가 실제로 그 갈래에서 돌았다는 뜻이기도 하다. 착수 표의 `unreached` "
      + "갈래(탭 자리가 화면 밖이라 팔이 못 도는 경우)는 이 실행에서 안 났다 — 필드가 "
      + "없는 것이 «났는데 안 적음»이 아니라 «안 났음»이다.",
    ],
    setup: { canvas, band_px: bandPx, arms: 4, queries: 4 },
    opened,
    horizon_taps: horizonTaps,
    ray: rayArm,
    closed: closedArm,
    summary: {
      tap_delta_n: horizonTaps.map(t => t.delta_n ?? null),
      tap_gap_px: horizonTaps.map(t => t.tap_gap_px ?? null),
      tap_pitch_zero: horizonTaps.every(t => !t.made || t.made.pitch === 0),
      ray_delta_n: (rayArm as any).delta_n ?? null,
      ray_off_px: (rayArm as any).ray_off_px ?? null,
      closed_delta_n: (closedArm as any).delta_n ?? null,
    },
    gate: {
      registered: "지평선 탭이 보조를 만들고(`tap_delta_n` 전부 > 0) 그 소실점이 탭점의 판정 "
        + "띠 안이며(`tap_gap_px` < `setup.band_px`), 광선 탭의 소실점이 E→탭점 직선 위이고"
        + "(`ray_off_px` — 공선성 px), 패널이 닫히면 같은 탭이 아무것도 안 만든다"
        + "(`closed_delta_n` = 0).",
      registered_note: "⚠ **이 항목이 등록한 게이트다 — CLAUDE.md §2 중단 조건 아님**(#41).",
      reachability: "패널 닫힘 팔(`closed`)이 되살림이다(#30) — 탭이 그리기로 돌아간다.",
      /** 실제로 재는 양(#46): 연속량 둘(`tap_gap_px`·`ray_off_px`)과 비트 셋. */
      reachability_bits: null as unknown,
      /**
       * ⛔ 초판은 `reachability_value`에 `tap_gap_px`를 넣었다 — **게이트 결과의 복사**라
       * 도달 가능성이 아니다(1차 리뷰어 [3] — #40의 segment_gate 선례 그대로). «무엇이
       * 이 기준(띠)을 넘을 수 있는가»의 오라클 팔(고의로 다른 각을 주는 배선·참값 대비)은
       * **안 만들었다** — 그 사실을 적는 것이 맞다(#35: 없다고 기준을 낮추지 않는다).
       */
      reachability_absent: "오라클 팔 없음 — tap_gap_px·ray_off_px는 이 게이트의 결과 "
        + "자체라 도달 가능성으로 못 쓴다. 띠를 넘는 것은 «다른 각을 주는 배선»인데 그 "
        + "팔은 없다(되살림 팔은 경로 차단만 잰다).",
      result: {} as Record<string, unknown>,
    },
    selfcheck_notes: {
      ray_gap_is_dx: "`ray_off_px`와 `tap_gap_px[0]`이 같은 자릿수(px 소수 둘)에서 겹칠 수 "
        + "있다(1차 리뷰어 [11]) — 이 픽스처의 광선이 거의 세로라 점-직선 거리 ≈ Δx이고, "
        + "탭 판정도 Δx가 지배한다. **두 팔은 다른 기하를 재지만 이 픽스처에서는 수치가 "
        + "수렴한다** — 게이트 기준은 띠(#17 재사용)로 두고 실측을 필드가 든다: 띠보다 "
        + "20배 작은 실측이 «0.1° 반올림 지렛대» 크기라는 것이 그 대비의 내용이다.",
      pitch_zero: "`horizon_taps[*].made.pitch` = 0은 **경로 ①의 정의다** — 지평선 탭은 "
        + "수평 보조를 만든다(벗어난 성분은 pitch라 사영이 버린다 — 단위 반례 팔이 잰다). "
        + "0이 나와야 «탭은 yaw만 준다»가 선다.",
      closed_zero: "`closed_delta_n` = 0은 **되살림의 성립**이다(#30) — 패널이 닫히면 탭이 "
        + "보조를 안 만든다. 0이 나와야 «열려 있을 때만»이 선다.",
      ray_off_small: "`ray_off_px`가 0에 가까운 것은 보장이 아니라 **배선의 판정**이다 — "
        + "탭→각→소실점이 다른 공식을 지나므로(각도기 역산 ↔ 3D 투영) 배선이 틀리면 "
        + "직선에서 벗어난다. 크기가 정확히 0이 아닌 것은 0.1° 반올림의 지렛대다.",
    },
    pitfall_citations: [12, 17, 21, 30, 32, 35, 36, 38, 40, 41, 43, 46, 47, 51, 52, 53],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  led.gate.reachability_bits = {
    horizon_tap_creates: horizonTaps.every(t => (t.delta_n ?? 0) > 0),
    ray_tap_creates: ((rayArm as any).delta_n ?? 0) > 0,
    closed_tap_ignored: (closedArm as any).delta_n === 0,
  };
  led.gate.result = { ...led.summary };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "aux_tap.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  expect(opened.open).toBe(true);
  // ① 지평선 탭 — 두 자리 모두 만들어지고, 그 자리(판정 띠 안)에 선다
  for (const t of horizonTaps) {
    expect(t.unreached).toBeUndefined();
    expect(t.delta_n).toBe(1);
    expect(t.made.pitch).toBe(0);                       // 벗어난 만큼은 pitch — 수평 보조다
    expect(t.tap_gap_px).not.toBeNull();
    expect(t.tap_gap_px!).toBeLessThan(bandPx);
  }
  // ② 각도기 광선 — 만들어지고 E→탭점 직선 위다(공선성)
  expect((rayArm as any).unreached).toBeUndefined();
  expect((rayArm as any).delta_n).toBe(1);
  expect((rayArm as any).ray_off_px).not.toBeNull();
  expect((rayArm as any).ray_off_px).toBeLessThan(bandPx);
  // 되살림 — 패널이 닫히면 같은 탭이 아무것도 안 만든다
  expect((closedArm as any).open).toBe(false);
  expect((closedArm as any).delta_n).toBe(0);
});
