// **새 절차 후 결함 넷의 회귀 팔**(2026-08-20 19차 지시 · D-L114·L115·L116).
// 산출: `stage0/out/procedure_repair.json`.
//
// 사람이 새 절차로 그려 보고 넷을 보고했고(`docs/instructions/19.md`), 이 세션이 **넷 전부를
// 브라우저에서 재현한 뒤** 고쳤다. 여기는 그 넷이 **다시 나면 잡히는 자리**다.
//
// ```
// A 작도선   지시 1·2 — 소실점을 만든 획이 «그리기 첫 획»까지 옅게 남는가
// B 지평선   지시 3   — 그은 y가 그대로 쓰이는가 · 옛 저장본의 «화면 중앙»이 절차를 막는가
// C 면 위    지시 4   — 기하가 없으면 후보에 아예 없는가
// ```
//
// ⚠⚠ **팔마다 버그를 되살린다**(A-4 · #30). 되살릴 수단이 없으면 그 팔은 «통과»라고
// 말할 자격이 없다 — 무엇이 갈리는지 모르기 때문이다(#38):
//   A `S2S.setSeedLines(false)`가 **18차 거동**(그 순간 삭제)이다.
//   B **옛 형식 저장본을 직접 심어** 복원시킨다 — 그것이 결함을 만든 입력 그 자체다.
//   C 기하를 만들면 `on_face`가 **돌아온다** — 막은 것이지 죽인 것이 아니다.
//
// ⚠ **팔마다 장면을 초기화한다**(#53). B가 IndexedDB를 심으므로 앞 팔의 저장본이 뒤 팔에
// 남으면 뒤 팔이 다른 장면에서 돈다 — 팔마다 DB를 지우고 새로고침한다.
//
// 착수 시 `PITFALLS.md`를 읽었다(`tail -40`). 걸리는 번호는 `progress.md` 19차 착수 표가 든다.
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

/**
 * **그 띠에 실제로 칠해진 픽셀 수**. 지시 1-d가 «화면 픽셀과 저장된 획 수를 함께 본다»고
 * 요구했다 — 상태만 읽으면 «저장은 됐는데 안 그려진다»를 못 가른다.
 */
const bandPx = (page: Page, x0: number, y0: number, x1: number, y1: number) =>
  page.evaluate(([a, b, c, d]) => {
    const cv = document.getElementById("ink") as HTMLCanvasElement;
    const g = cv.getContext("2d")!;
    const r = devicePixelRatio;
    const im = g.getImageData(Math.round(a * r), Math.round(b * r),
                              Math.round((c - a) * r), Math.round((d - b) * r)).data;
    let n = 0;
    for (let i = 3; i < im.length; i += 4) if (im[i] > 10) n++;
    return n;
  }, [x0, y0, x1, y1]);

const state = (page: Page) => page.evaluate(() => {
  const S = window.S2S;
  return {
    order: S.order(), standing: S.standing(),
    strokes: S.doc().strokes.length,
    lifted: S.doc().strokes.filter((x: any) => x.seg3d).length,
    horizon_y: S.horizon().y,
    seeds: S.seedLines().length,
  };
});

test("새 절차 후 결함 넷 — 작도선·지평선 y·면 위", async ({ page }) => {
  const led: Record<string, unknown> = {};

  // ================================================================ A. 작도선 (지시 1·2)
  await fresh(page);
  const { W, H } = await size(page);
  const HY = Math.round(H * 0.22);          // **상단** — 지시 3의 보고가 상단이었다
  /** 깊이선 1이 지나는 띠. 여기 칠해진 픽셀이 «첫 선이 화면에 있는가»다(지시 2-d). */
  const B1: [number, number, number, number] =
    [W * 0.25, H * 0.6, W * 0.52, H * 0.78];
  const B2: [number, number, number, number] =
    [W * 0.52, H * 0.6, W * 0.79, H * 0.78];
  /**
   * **확정 뒤에 그은 보통 획**(소실점을 안 만드는 획)의 띠. 지시 1의 문면은
   * «공간이 정의된 뒤 선을 그으면»이라 **승격 획만으로는 안 덮인다** — 이 띠가 그 나머지다.
   */
  const B3: [number, number, number, number] =
    [W * 0.27, H * 0.85, W * 0.58, H * 0.94];

  /**
   * **한 팔을 끝까지 돈다** — 두 팔이 같은 좌표·같은 순서를 지나므로 각 단계의 그리드가
   * 같고, **팔 사이 차만 획의 잉크**다(#5: 절대값에는 그리드가 섞여 있다).
   * ⚠ 단계 **사이**의 차는 안 쓴다 — 확정이 그리드를 바꾸므로 그 차에는 그리드 몫이 섞인다
   * (초판이 그 차 하나(−1098)를 표제로 썼고 리뷰어가 잡았다).
   */
  const runArm = async (seedOn: boolean) => {
    await fresh(page);
    if (!seedOn) await page.evaluate(() => window.S2S.setSeedLines(false));
    const rows: Record<string, unknown>[] = [];
    const snap = async (label: string) => rows.push({
      label, ...(await state(page)),
      px_line1: await bandPx(page, ...B1), px_line2: await bandPx(page, ...B2),
      px_plain: await bandPx(page, ...B3),
    });
    await snap("0 빈 화면");
    await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
    await snap("1 지평선");
    await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]);
    await snap("2 깊이선1 → 1점");
    await drawOn(page, [W * 0.5, H * 0.75], [W * 0.76, H * 0.63]);
    await snap("3 깊이선2 → 2점");
    await drawOn(page, [W * 0.3, H * 0.9], [W * 0.55, H * 0.88]);
    await snap("4 그리기 첫 획(보통 획)");
    return rows;
  };

  // **켬 = 19차 · 끔 = 18차 거동**(A-4 · #30). 두 팔이 **같은 좌표·같은 순서**를 돈다.
  const armA = await runArm(true);
  const armAOld = await runArm(false);

  // ================================================================ B. 지평선 y (지시 3)
  // ---- B-1. 상단·중앙·하단 — 그은 y가 그대로 쓰이는가(지시 3-d)
  //
  // ⚠⚠ **셋 다 화면 중앙(H/2)을 피한다.** 그 값은 **옛 기본값 그 자체**라, 거기서 맞는 것은
  // «그은 y가 쓰였다»와 «기본값이 굳어 있다»를 **못 가른다**(#38 — 판별력 0인 행).
  // 초판이 0.5를 넣었고 리뷰어가 잡았다.
  const thirds: { label: string; y: number; got: number | null; is_center: boolean }[] = [];
  for (const [label, frac] of [["상단", 0.15], ["중간위", 0.42], ["하단", 0.85]] as const) {
    await fresh(page);
    const y = Math.round(H * frac);
    await drawOn(page, [W * 0.2, y], [W * 0.8, y]);
    thirds.push({ label, y, got: (await state(page)).horizon_y,
                  is_center: Math.abs(y - H / 2) < 2 });
  }

  // ---- B-1'. **기울어진 획**은 y가 어떻게 정해지나(리뷰어 [13] — 사람이 그은 선은 기운다).
  // 앱은 **끝점의 y**를 쓴다(화면 수평으로 강제하므로 y 하나다). 그것을 값으로 잠근다 —
  // 「그은 y가 쓰인다」가 **완전 수평 합성 획에서만** 성립하는 항등이 아님을 보인다.
  await fresh(page);
  const tiltA: [number, number] = [W * 0.2, Math.round(H * 0.30)];
  const tiltB: [number, number] = [W * 0.8, Math.round(H * 0.36)];
  await drawOn(page, tiltA, tiltB);
  const tilted = {
    start_y: tiltA[1], end_y: tiltB[1],
    slope_deg: Math.atan2(tiltB[1] - tiltA[1], tiltB[0] - tiltA[0]) * 180 / Math.PI,
    got: (await state(page)).horizon_y,
    rule: "끝점의 y를 쓴다 — 지평선은 화면 수평으로 강제되므로(18차 지시 j) y 하나다",
  };

  // ---- B-2. **옛 저장본이 절차를 막는가** — 결함 3을 만든 입력 그대로 심는다
  const oldSave = async (withVp: boolean, hy: number) => {
    await page.goto("/l.html");
    await page.evaluate(async (args) => {
      await new Promise<void>(res => {
        const q = indexedDB.deleteDatabase("sketch2space");
        q.onsuccess = q.onerror = q.onblocked = () => res();
      });
      // **18차 이전 형식** — 그때 `newRuleState`가 `horizon: imgSize[1] / 2`(화면 중앙)를
      // 기본값으로 넣었다. 획이 하나라도 있어야 복원된다(mainL의 `getDoc2` 가지).
      const doc = {
        format: "s2s-doc/2", seq: 9,
        strokes: [{ id: "s1", pts2d: [[args.W * 0.2, args.H * 0.9], [args.W * 0.4, args.H * 0.88]],
                    viewRef: "v1", channel: "guide", axis: "free", width: 2 }],
        views: [{ id: "v1", name: "확정 뷰", seq: 1, isConfirm: true }],
        currentView: "v1",
        rules: {
          slots: args.withVp
            ? [{ kind: "vp", at: [-args.W, args.hy], source: "two_lines", support: 2 },
               { kind: "vp", at: [args.W * 2, args.hy], source: "horizon_x_line", support: 2 },
               { kind: "screen", dir: "v", support: 0 }]
            : [null, null, { kind: "screen", dir: "v", support: 0 }],
          horizon: args.hy, depthLines: [], verticalLines: [],
        },
      };
      await new Promise<void>((res, rej) => {
        const r = indexedDB.open("sketch2space", 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs");
        };
        r.onsuccess = () => {
          const db = r.result;
          const t = db.transaction("docs", "readwrite");
          t.objectStore("docs").put(doc, "current2");
          t.oncomplete = () => { db.close(); res(); };
          t.onerror = () => rej(t.error);
        };
        r.onerror = () => rej(r.error);
      });
    }, { W, H, withVp, hy });
    await page.reload();
    await page.waitForFunction(() => !!window.S2S);
    await page.waitForFunction(() => window.S2S.doc().strokes.length > 0, null,
                               { timeout: 5000 }).catch(() => { /* 복원이 안 왔으면 아래가 잡는다 */ });
    return state(page);
  };

  // **결함을 만든 입력 그대로** — 옛 기본값은 화면 중앙(H/2)이다
  const restoredNoVp = await oldSave(false, Math.round(H / 2));
  // 그 상태에서 상단에 그으면 **그것이 지평선이어야 한다**(결함 3의 정확한 반대)
  const topY = Math.round(H * 0.18);
  await drawOn(page, [W * 0.2, topY], [W * 0.8, topY]);
  const afterTop = await state(page);
  // **양성 채널** — 소실점이 얹힌 저장본의 지평선은 **지킨다**(지우면 확정 축이 무너진다).
  // ⚠ y를 **기본값이 아닌 값**으로 둔다(리뷰어 [7]) — H/2로 두면 «지켰다»와
  // «기본값이 다시 채워졌다»가 같은 수로 나와 판별력이 0이다(#38).
  const keptY = Math.round(H * 0.31);
  const restoredWithVp = await oldSave(true, keptY);

  // ================================================================ C. 면 위 (지시 4)
  await fresh(page);
  const probeFace = () => page.evaluate(() => {
    const S = window.S2S;
    const pts: [number, number][] = [[200, 200], [500, 400], [900, 300], [700, 550]];
    const kinds = pts.map(p => { const c = S.snap(p); return c ? c.kind : null; });
    const cands = pts.map(p => (S.snapCands(p) ?? []).filter((c: any) => c.kind === "on_face").length);
    return { kinds, on_face_cands: cands.reduce((a: number, b: number) => a + b, 0),
             lifted: S.doc().strokes.filter((x: any) => x.seg3d).length,
             // **첫 앵커의 지면 배치가 살아 있는가**(D-L90) — D-L116이 «안 건드렸다»고
             // 주장하는 자리다. **같은 실행에서** 확인해야 그 주장이 근거를 갖는다(#55).
             placeBy: JSON.parse(JSON.stringify(S.placeBy())) };
  });
  await drawOn(page, [W * 0.15, HY], [W * 0.85, HY]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.28, H * 0.63]);
  await drawOn(page, [W * 0.5, H * 0.75], [W * 0.76, H * 0.63]);
  const faceEmpty = await probeFace();                      // 기하 0 — 후보 0이어야 한다
  // **양성 채널** — 기하가 생기면 돌아온다(막은 것이지 죽인 것이 아니다)
  await drawOn(page, [W * 0.33, H * 0.87], [W * 0.48, H * 0.86]);
  await drawOn(page, [W * 0.55, H * 0.45], [W * 0.69, H * 0.47]);
  const faceWithGeom = await probeFace();

  // ================================================================ 원장
  const ledger = {
    what: "새 절차 후 사람이 보고한 결함 넷이 다시 나면 잡는다(19차 지시).",
    how: {
      A: "작도선 — 소실점을 만든 획이 «그리기 첫 획»까지 화면에 남는가. "
        + "`seeds`(앱이 그리는 목록)와 `px_line*`(실제 칠해진 픽셀)을 **함께** 읽는다(지시 1-d).",
      A_old: "`setSeedLines(false)`가 18차 거동이다 — 두 팔이 **같은 좌표·같은 순서**를 "
        + "돌므로 각 단계의 그리드가 같고, **팔 사이 차만 획의 잉크**다(`seed_ink`). "
        + "⚠ **단계 사이의 차는 안 쓴다** — 확정이 그리드를 바꾸므로 거기엔 그리드 몫이 "
        + "섞인다(초판이 그런 차 하나를 표제로 썼고 리뷰어가 잡았다).",
      A_plain: "지시 1의 문면은 «공간이 정의된 뒤 선을 그으면»이라 **승격 획만으로는 "
        + "안 덮인다**. `px_plain`이 그 나머지다 — 소실점을 **안** 만드는 보통 획이 "
        + "**두 팔 다에서** 남는지(픽셀이 느는지) 본다. 그것이 결함 1의 사거리를 "
        + "«승격 획»으로 좁히는 근거다.",
      B: "지평선 y — 세 높이에 그은 y가 그대로 쓰이는가(지시 3-d) · 기울어진 획에서는 "
        + "무엇이 y가 되는가 · 18차 이전 형식 저장본(«화면 중앙» 기본값)이 절차를 막는가.",
      B_positive: "소실점이 얹힌 저장본은 지평선을 **지킨다** — 게이트가 무차별이 아님을 "
        + "보인다. ⚠ 그 y는 **기본값이 아닌 값**이다(H·0.31) — H/2면 «지켰다»와 "
        + "«기본값이 다시 채워졌다»가 같은 수라 판별력이 0이다(#38).",
      C: "면 위 — 기하 0에서 후보 0인가(지시 4-b) · 기하가 생기면 돌아오는가 · "
        + "**첫 앵커의 지면 배치(D-L90)가 살아 있는가**(`placeBy.ground`).",
    },
    what_this_does_not_say: [
      "dpr 1 · 마우스 합성 · 한 구도다(#12·#21).",
      "**그린 선이 3D에 옳게 놓이는가는 안 잰다** — 여기서 재는 것은 이 네 결함의 자리다.",
      "`px_line*` 띠에는 **그리드도 지난다** — 절대값이 «작도선의 굵기»가 아니다. "
      + "읽는 것은 **같은 띠의 팔 사이 차**뿐이다(#5: 절대값은 구성의 몫이 섞여 있다).",
      "B의 옛 저장본은 **이 팔이 만든 것**이고 실제 사용자 파일이 아니다 — 재현한 것은 "
      + "«그 형식이 오면 어떻게 되는가»이지 «사용자 파일이 그 형식이다»가 아니다.",
      "C의 `on_face`가 돌아오는 것은 **기하가 생겼을 때**다. 그 기하가 옳게 놓였는지는 "
      + "이 팔의 물음이 아니다.",
    ],
    selfcheck_notes: {
      zero_strokes: "A2·A3에서 `strokes`가 0인 것은 **설계 그대로다**(18차 지시 4 — 소실점을 "
        + "만든 획은 문서에 안 남는다). 19차가 바꾼 것은 «문서에서 뺀다»가 아니라 "
        + "«화면에서 언제 지우는가»이고, 그것을 재는 필드는 `seeds`와 `px_line*`이다.",
      zero_on_face: "`face.empty.on_face_cands`가 0인 것이 **이 팔이 재현하려는 수리**다 — "
        + "집계가 안 돈 것이 아니다. 같은 실행의 `face.with_geometry`가 0이 아니다.",
      zero_restored: "`horizon.restored_old_save_no_vp`의 `order`·`lifted`·`seeds`가 0인 것은 "
        + "**그 저장본의 정의**다 — 소실점이 없으니 차수 0이고, 3D도 작도선도 없다. "
        + "같은 블록의 `strokes`가 **1**인 것이 «복원이 실제로 일어났다»의 증거이고, "
        + "`horizon_y`가 `null`인 것이 이 팔이 재는 수리다. 같은 실행의 "
        + "`restored_old_save_with_vp`가 차수 2를 낸다 — 게이트가 무차별이 아니다.",
      zero_lifted: "**`lifted` 0이 세 곳에 있고 셋 다 이 세션의 변경과 무관하다**"
        + "(리뷰어 [2]가 물었다): ① `arms.*`의 4행(보통 획) — 확정 뒤 첫 획은 붙을 3D "
        + "대상이 없어 **2D 대기**다(D-L83이 `on_edge`·`on_face`를 앵커에서 뺐다). "
        + "같은 좌표에서 수리 **전에도** 0이었다. ⚠ `horizon_first.json`의 ④는 `lifted` 1인데 "
        + "**다른 좌표**라 지면 배치(D-L90)가 걸린 것이다 — 같은 상황이 아니다. "
        + "② `restored_old_save_*` — 복원은 **다시 풀지 않는다**(`applyDoc2` 머리말: "
        + "`seg3d`가 화면에 있던 그것이다). 심은 저장본의 획에 `seg3d`가 없으므로 0이 맞다. "
        + "③ `face.empty` — 그것이 이 팔이 재는 상태 자체다. "
        + "**이 원장의 0 카운터는 그래서 다섯 갈래다**: `strokes`(A2·A3) · `seeds`(A0·A1·A4) · "
        + "`on_face_cands`(face.empty) · `order`(no_vp) · `lifted`(위 셋).",
    },
    arms: { A: armA, A_old_behavior: armAOld },
    /**
     * **작도선이 실제로 칠한 픽셀** — 같은 띠를 두 팔에서 잰 값이다.
     * `old`는 **18차 거동**(그 순간 삭제)의 바닥이고, `new`가 그보다 커야 «화면에 남았다»다.
     * ⚠ 절대값에는 **그리드도 섞여 있다**(위 `what_this_does_not_say`) — 읽는 것은 차뿐이다.
     */
    seed_px: {
      old: [armAOld[2].px_line1 as number, armAOld[3].px_line2 as number],
      new: [armA[2].px_line1 as number, armA[3].px_line2 as number],
    },
    /**
     * **작도선의 잉크** = 같은 단계·같은 띠의 두 팔 차. 그리드가 상쇄되므로 **이것이
     * «화면에 남았다»의 크기**다. 양수여야 한다.
     */
    seed_ink: [
      (armA[2].px_line1 as number) - (armAOld[2].px_line1 as number),
      (armA[3].px_line2 as number) - (armAOld[3].px_line2 as number),
    ],
    /**
     * **보통 획의 잉크**(지시 1의 문면) — 소실점을 **안** 만드는 확정 후 획이 그린 자리에
     * 픽셀을 더하는가. **두 팔 다에서** 양수여야 한다: 18차 거동에서도 보통 획은 안 사라졌고,
     * 그것이 결함 1의 사거리를 «승격 획»으로 좁히는 근거다.
     */
    plain_ink: {
      new: (armA[4].px_plain as number) - (armA[3].px_plain as number),
      old: (armAOld[4].px_plain as number) - (armAOld[3].px_plain as number),
    },
    horizon: {
      thirds, tilted,
      restored_old_save_no_vp: restoredNoVp,
      after_drawing_top: { drawn_y: topY, ...afterTop },
      restored_old_save_with_vp: { seeded_y: keptY, ...restoredWithVp },
    },
    face: { empty: faceEmpty, with_geometry: faceWithGeom },
    gate: {
      registered: "① 깊이선1 뒤 `seeds` 1이고 `seed_ink[0]` > 0 "
        + "② 깊이선2 뒤 `seeds` 2이고 `seed_ink[1]` > 0 ③ 그리기 첫 획에서 `seeds` 0 "
        + "④ 세 높이에 그은 y가 그대로 `horizon_y`다(셋 다 화면 중앙이 아니다) "
        + "⑤ 소실점 없는 옛 저장본은 `horizon_y`가 `null`이고, 소실점 있는 것은 "
        + "**기본값이 아닌 y**로 지켜진다 "
        + "⑥ 기하 0에서 `on_face` 후보가 0이고 기하가 생기면 0이 아니다.",
      reachability: "**A** — 되살릴 것은 18차 거동이고 `setSeedLines(false)` 팔이 그것이다. "
        + "넘어야 할 바닥은 그 팔의 픽셀(`seed_px.old`)이고 `seed_ink`가 그 차다. "
        + "**B** — 되살림은 **저장본이 아니라 수리를 되돌리는 것**이다(저장본만 심으면 이 "
        + "원장은 수리된 값 `null`을 낸다). 손으로 되돌려 확인했고 그때 `horizon_y`가 "
        + "`gate.revert_check.B_horizon_y`로 잡힌다. **C** — 같은 방식으로 되돌리면 "
        + "`gate.revert_check.C_on_face_cands`가 잡힌다. "
        + "⚠ **A만 같은 실행 안의 대조이고 B·C는 손으로 되돌린 확인이다**(비대칭을 적는다).",
      /**
       * **수리를 되돌렸을 때 이 팔이 잡는 값.** 같은 실행이 아니라 **손으로 두 줄을
       * 되돌려** 얻은 것이다(#55 — 어떻게 얻었는지 함께 적는다). 자동 대조 대상이 아니다.
       */
      revert_check: {
        B_horizon_y: 337, C_on_face_cands: 4,
        how: "`camState`의 지평선 게이트와 `mainL`의 `snapCtx` 지면 조건을 각각 한 줄씩 "
          + "되돌리고 이 팔을 돌렸다. 각각 `restored_old_save_no_vp.horizon_y` 337과 "
          + "`face.empty.on_face_cands` 4에서 실패한다. 337은 그 실행의 **H/2**이고 "
          + "(잉크 캔버스 높이 674) 그것이 곧 옛 `defaultHorizon`이다 — 이 원장의 "
          + "`horizon.restored_old_save_no_vp`가 심은 값과 같은 자리다.",
      },
      reachability_source: "seed_px/old",
      reachability_value: null as unknown,
    },
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  (ledger.gate as { reachability_value: unknown }).reachability_value = ledger.seed_px.old;
  Object.assign(led, ledger);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "procedure_repair.json"), JSON.stringify(led, null, 1));

  // ---- A. 작도선(지시 1·2)
  expect(armA[0].seeds).toBe(0);                    // 빈 화면
  expect(armA[1].seeds).toBe(0);                    // 지평선은 작도선이 아니다(획이 아니다)
  expect(armA[2].order).toBe(1);
  expect(armA[2].seeds).toBe(1);                    // **첫 깊이선이 남는다**(지시 2-d)
  expect(armA[3].order).toBe(2);
  expect(armA[3].seeds).toBe(2);                    // **둘째도 남는다**(지시 1 — 안 사라진다)
  expect(armA[4].seeds).toBe(0);                    // **그리기 첫 획에서 지운다**(지시 2-a·2-b)
  expect(armA[4].strokes).toBe(1);                  // 그 획 자신은 문서에 남는다
  // **화면에 실제로 있었다** — 상태만이 아니라 픽셀로(지시 1-d). 같은 단계·같은 띠의
  // 두 팔 차라 그리드가 상쇄된다(단계 사이 차가 아니다 — 리뷰어 [1])
  expect(ledger.seed_ink[0]).toBeGreaterThan(0);
  expect(ledger.seed_ink[1]).toBeGreaterThan(0);
  // **되살린 버그가 실제로 잡힌다**(A-4) — 옛 거동에서는 그 자리에 아무것도 안 남는다
  expect(armAOld[2].seeds).toBe(0);
  expect(armAOld[3].seeds).toBe(0);
  // **보통 획은 두 팔 다에서 남는다**(지시 1의 문면 — 리뷰어 [3]).
  // 이것이 결함 1의 사거리를 «승격 획»으로 좁힌다: 18차 거동에서도 보통 획은 안 사라졌다.
  expect(ledger.plain_ink.new).toBeGreaterThan(0);
  expect(ledger.plain_ink.old).toBeGreaterThan(0);
  expect(armAOld[4].strokes).toBe(1);

  // ---- B. 지평선 y(지시 3)
  for (const t of thirds) {
    expect(t.got).toBeCloseTo(t.y, 0);
    expect(t.is_center).toBe(false);                // 판별력 0인 행을 두지 않는다(#38)
  }
  // **기울어진 획에서도 규칙이 하나다** — 끝점의 y다(합성 완전 수평에서만 성립하는 항등이 아니다)
  expect(Math.abs(tilted.slope_deg)).toBeGreaterThan(0.5);
  expect(tilted.got).toBeCloseTo(tilted.end_y, 0);
  expect(tilted.got).not.toBeCloseTo(tilted.start_y, 0);
  expect(restoredNoVp.strokes).toBe(1);             // 복원은 실제로 일어났다
  expect(restoredNoVp.horizon_y).toBeNull();        // **옛 기본값을 안 읽는다**
  expect(restoredNoVp.order).toBe(0);
  expect(afterTop.horizon_y).toBeCloseTo(topY, 0);  // 그 뒤 상단에 그으면 **그것이 지평선이다**
  expect(restoredWithVp.horizon_y).toBeCloseTo(keptY, 0);   // 소실점이 얹혔으면 **지킨다**
  expect(keptY).not.toBeCloseTo(H / 2, 0);          // 그 y는 **옛 기본값이 아니다**(#38)
  expect(restoredWithVp.order).toBe(2);

  // ---- C. 면 위(지시 4)
  expect(faceEmpty.lifted).toBe(0);
  expect(faceEmpty.on_face_cands).toBe(0);          // **면이 없으면 후보에도 없다**(지시 4-b)
  expect(faceEmpty.kinds.every(k => k !== "on_face")).toBe(true);
  expect(faceWithGeom.lifted).toBeGreaterThan(0);
  expect(faceWithGeom.on_face_cands).toBeGreaterThan(0);      // 막은 것이지 죽인 것이 아니다
  // **첫 앵커의 지면 배치(D-L90)가 살아 있다** — D-L116이 «안 건드렸다»고 주장하는 자리를
  // **같은 실행에서** 확인한다(#55 — 초판은 다른 원장의 필드를 «같은 실행»이라 적었다)
  expect(faceEmpty.placeBy.ground).toBe(0);
  expect(faceWithGeom.placeBy.ground).toBeGreaterThan(0);
});
