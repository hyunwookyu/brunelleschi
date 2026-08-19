// **확정 순간의 연결 — 종단 확인**(2026-08-19 15차 항목 1 · D-L98).
// 산출: `stage0/out/confirm_link_e2e.json`.
//
// 사용자가 보고한 것: *"사선 → 끝점 스냅 수평선 → 그 끝점 스냅 사선 — 공간이 정의되는
// 순간 스냅이 풀리고 연결도 끊어진다."*
//
// 진단(원장 `confirm_link.json`): 스냅 **기록**은 안 없어진다(확정 전후로 그대로 남는다).
// 없어지는 것은 **기하의 연결**이다 — 일괄 풀이가 3D 끝점을 `rep`(PCA 극단)의 광선에 놓고,
// 오스냅이 붙여 준 점은 `pts2d`의 양 끝이라 프리핸드 획에서 그 둘이 어긋난다.
// 두 결함이 갈린다:
//   (a) 선언된 연결이 제약이 아니라 획이 **구조에서 떨어져 2D로 남는다**(`setLiftDeclared`)
//   (b) 놓여도 두 획의 그 끝이 **3D에서 떨어진다**(`setLiftAnchor`)
//
// ⚠ **마우스 직선으로는 안 잡힌다**: 방향·끝점 스냅이 걸린 획은 `pts2d`가 두 점으로 접혀
// `rep`가 그 두 점을 정확히 지난다(합성 삼각형 25구도 전부 간격 0 — 그것이 이 결함이
// 14차까지 안 보인 이유다). 그래서 여기서는 **떨림을 넣어 프리핸드 형태로 긋는다**.
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5  수리 후 간격 0은 **보장**이다 — 판정은 끈 팔의 값이 든다
//   #12 한 구도·한 떨림 폭이다. 부족분은 `what_this_does_not_say`에 적는다
//   #17 미리보기·확정·되맞춤이 같은 함수를 지난다(`endFromCursor`)
//   #21 dpr 1·마우스 합성이다
//   #30 측정 스위치 둘이 수리 전 거동을 되살린다
//   #40 도달 가능성: 끈 팔이 실제로 결함을 낸다(단언으로 박는다)
import { test, expect } from "@playwright/test";
import { constantsSnapshot } from "../test/constants.js";
import { metricsSnapshot } from "../test/metrics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

declare global { interface Window { S2S: any } }
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

/** 그린 시점의 연결마다 두 획의 그 끝이 3D에서 얼마나 떨어졌나(기하 크기 대비). */
const PROBE = `(async () => {
  const S = window.S2S; const doc = S.doc();
  const g3 = await import("/src/s3d/geom3d.ts");
  const ctx = S.cam.ctx();
  const by = new Map(doc.strokes.map(s => [s.id, s]));
  const d3 = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  let size = 0;
  for (const s of doc.strokes) if (s.seg3d) for (const p of s.seg3d) size = Math.max(size, Math.hypot(p[0],p[1],p[2]));
  const rows = [];
  for (const s of doc.strokes) {
    for (const key of ["snap2dStart","snap2dEnd"]) {
      const r = s[key]; if (!r || !r.ofId) continue;
      const t = by.get(r.ofId);
      const row = { id: s.id, key, ofId: r.ofId, kind: r.kind,
                    lifted: !!s.seg3d, targetLifted: !!(t && t.seg3d),
                    ref3d: key === "snap2dStart" ? !!s.snapStart : !!s.snapEnd };
      if (s.seg3d && t && t.seg3d && ctx) {
        const gap = Math.min(...s.seg3d.map(p => Math.min(...t.seg3d.map(q => d3(p,q)))));
        row.gap3d = Math.round(gap*1e5)/1e5;
        row.gap_rel = size > 0 ? Math.round(gap/size*1e5)/1e5 : null;
        const pr = s.seg3d.map(p => g3.project(p, ctx.principal, ctx.f));
        row.break_px = Math.round(Math.min(...pr.map(p => p ? Math.hypot(p[0]-r.at[0],p[1]-r.at[1]) : Infinity))*100)/100;
      }
      rows.push(row);
    }
  }
  return { order: S.order(), standing: S.standing(),
           lifted: doc.strokes.filter(s=>s.seg3d).length, total: doc.strokes.length,
           liftAnchor: S.liftAnchor(), liftDeclared: S.liftDeclared(),
           placeBy: S.placeBy(),
           // **후보 ②의 분모**(AS-L46 — 이 경로를 지나는가). 0이면 가드는 발화 기회가 없었다
           chainDirGuard: S.chainDirGuard(),
           snap_records: doc.strokes.filter(s => s.snap2dStart || s.snap2dEnd).length,
           size: Math.round(size*1000)/1000, rows };
})()`;

/** 사선 → 수평 → 사선 (사용자가 보고한 그 순서). 화면 비율 좌표. */
const TRI: [number, number][][] = [
  [[0.20, 0.38], [0.50, 0.58]],
  [[0.50, 0.58], [0.82, 0.58]],
  [[0.82, 0.58], [0.62, 0.40]],
];

/** **꼭짓점 방사** — 깊이선 둘이 한 점에서 만난다(보고 ①: "그 끝점을 소실점 삼아"). */
const FAN: [number, number][][] = [
  [[0.62, 0.30], [0.25, 0.55]],
  [[0.62, 0.30], [0.32, 0.22]],
];

/** **닫힌 삼각형** — 마지막 사선이 첫 점으로 돌아온다(보고 ②′의 그 형태). */
const CLOSED: [number, number][][] = [
  [[0.25, 0.42], [0.55, 0.62]],
  [[0.55, 0.62], [0.85, 0.62]],
  [[0.85, 0.62], [0.25, 0.42]],
];

test("확정 순간 붙여 그은 획이 붙어 있다 (D-L98)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e}`));
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  const arm = async (name: string, opts: { anchor: boolean; declared: boolean },
                     path: [number, number][][] = TRI, wob = 6) => {
    await page.goto("/l.html");
    await page.waitForFunction(() => !!window.S2S);
    await page.evaluate(() => new Promise<void>(res => {
      const q = indexedDB.deleteDatabase("sketch2space");
      q.onsuccess = q.onerror = q.onblocked = () => res();
    }));
    await page.reload();
    await page.waitForFunction(() => !!window.S2S);
    await page.evaluate(o => { window.S2S.setLiftAnchor(o.anchor); window.S2S.setLiftDeclared(o.declared); }, opts);
    const box = (await page.locator("#ink").boundingBox())!;
    const X = (fx: number) => box.x + box.width * fx;
    const Y = (fy: number) => box.y + box.height * fy;
    // **결정론적 떨림**(`Math.random` 금지 — CLAUDE.md §5). 저주파 셋 + 양 끝 갈고리
    let seed = 99991 >>> 0;
    const r32 = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (const [p, q] of path) {
      // **앞 획의 그린 끝점을 겨냥한다** — 사용자가 보이는 끝에 대는 그 동작이다
      const aim = await page.evaluate(d => {
        const sts = window.S2S.doc().strokes;
        if (!sts.length) return null;
        const last = sts[sts.length - 1].pts2d;
        const e = last[last.length - 1];
        return Math.hypot(e[0] - d[0], e[1] - d[1]) < 40 ? e : null;
      }, [X(p[0]) - box.x, Y(p[1]) - box.y]);
      const sx = aim ? box.x + aim[0] : X(p[0]);
      const sy = aim ? box.y + aim[1] : Y(p[1]);
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      const N = 40;
      const ph = [r32() * 6.28, r32() * 6.28, r32() * 6.28];
      const ex = X(q[0]) - sx, ey = Y(q[1]) - sy;
      const nl = Math.hypot(ex, ey) || 1;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const w = wob * (Math.sin(t * 3.1 + ph[0]) + 0.6 * Math.sin(t * 7.3 + ph[1])
                       + 0.4 * Math.sin(t * 13.7 + ph[2]));
        const hook = wob * 1.4 * (Math.exp(-t * 16) - Math.exp(-(1 - t) * 16));
        const off = w + hook;
        await page.mouse.move(sx + ex * t + (-ey / nl) * off, sy + ey * t + (ex / nl) * off);
      }
      await page.mouse.up();
      await page.waitForTimeout(40);
    }
    return { name, wobble_px: wob, ...opts, ...(await page.evaluate(PROBE)) as any };
  };

  const off = await arm("off", { anchor: false, declared: false });
  const declOnly = await arm("declared_only", { anchor: false, declared: true });
  const on = await arm("on", { anchor: true, declared: true });

  // **닫힌 삼각형**(보고 ①·②) — 두 사선이 꼭짓점을 공유한다. D-L99 전에는 그 짝이
  // 소실점 후보에서 통째로 빠져 **카메라가 영영 안 섰다**(order 0 · standing false).
  const closed = await arm("closed_triangle", { anchor: true, declared: true }, CLOSED);
  // **떨림 0 팔**(1차 리뷰어 [6]②③ — "합성 마우스로는 안 보인다"를 원장 안으로).
  // 방향·끝점 스냅이 걸린 획은 `pts2d`가 두 점으로 접혀 `rep`가 그 두 점을 정확히 지난다
  const straight = await arm("declared_only_straight", { anchor: false, declared: true }, TRI, 0);
  // **증상 ①의 현행 상태**(2차 리뷰어 [2]) — 가로선 없이 깊이선 둘을 **한 점에서** 만나게.
  // D-L99의 완화는 `unambiguous`(가로축이 **선언**된 P1)에만 열리므로 이 형태는 **여전히
  // 안 선다** — 그것이 결함이 아니라 지시 11-1의 의도된 대기임을 원장이 값으로 든다.
  const symptom1 = await arm("symptom1_two_depth_shared_vertex",
                             { anchor: true, declared: true }, FAN, 0);

  const gapsOf = (a: any) => a.rows.filter((r: any) => r.gap_rel != null).map((r: any) => r.gap_rel);
  const led = {
    what: "사용자 보고 ②의 종단 재현 — 사선 → 끝점 스냅 수평선 → 그 끝점 스냅 사선.",
    how: "실제 포인터로 **떨림을 넣어** 긋는다(프리핸드 형태). 팔은 측정 스위치 둘로 가른다: "
       + "off(수리 전) · declared_only(선언 제약만) · on(선언 + 되맞춤).",
    what_this_does_not_say: [
      "한 구도·한 떨림 폭·dpr 1이다(#12·#21) — 폭과 구도의 감도는 안 잰다.",
      "수리 후의 간격 0은 **보장**이다(#5) — 판정은 off 팔의 값이 든다.",
      "스냅 **기록**은 세 팔 모두에서 보존된다(`snap_records`) — 사라진 적이 없다. "
      + "사용자가 본 '스냅이 풀린다'의 실체는 기록이 아니라 **기하**다.",
      "⚠ **`off` 팔은 (b)의 되살림 팔이 아니다** — 선언 제약이 없으면 일괄 풀이가 획 하나를 "
      + "못 담고, 그 획을 **승격 연쇄의 끝점 앵커**가 대신 놓는다(`placeBy.end_anchor`). "
      + "그 경로는 앵커를 정확히 쓰므로 간격이 0이다. (b)의 되살림 팔은 "
      + "**`declared_only`**(선언 제약은 켜고 되맞춤만 끈 팔)다.",
      "`break_px`(확정된 끝점 ↔ 기록된 화면점)는 수리 후에도 0이 아니다 — 연결점이 "
      + "**대상 획의 대표 직선 위**라서다. 그 값은 프리핸드를 버린 대가(§1.1)의 크기이고 "
      + "이 항목의 범위가 아니다(`DEFERRED`: 전 끝점 되맞춤).",
      "⚠ **`declared_only_straight`의 0은 구성상 0이다**(#5 · 2차 리뷰어 [5]) — 떨림이 없으면 "
      + "방향·끝점 스냅이 `pts2d`를 두 점으로 접고 `rep`가 그 두 점을 **정확히** 지난다. "
      + "측정이 아니라 그 구성의 귀결이므로 **임계를 안 건다**; 이 팔이 말하는 것은 "
      + "'프리핸드가 조건이다'까지다.",
      "⚠ **`size`(기하 크기 = `gap_rel`의 분모)가 팔마다 다르다**(#24 · 2차 리뷰어 [6]): "
      + "떨림이 2D 입력을 바꾸면 복원된 3D의 전역 배율(`liftAll`의 지면 게이지)이 함께 바뀐다. "
      + "그러므로 `declared_only`(떨림 6)와 `declared_only_straight`(떨림 0)는 "
      + "**같은 스위치·같은 손짓이되 복원 기하 크기가 다른 두 팔**이다 — 비교는 "
      + "'0인가 아닌가'까지만 하고 크기 비는 안 읽는다.",
      "`closed_triangle` 팔이 재는 것은 **카메라가 서는가**(D-L99)이지 획이 전부 올라가는가가 "
      + "아니다. 자기 소실점까지 그은 획은 그 끝의 깊이가 무한이라 세그먼트가 안 정해진다 — "
      + "그 획이 2D로 남는 것은 기하의 사실이고 결함이 아니다(§9.1: 미배치는 대기다).",
    ],
    arms: [off, declOnly, on, closed, straight, symptom1],
    summary: {
      off_lifted: `${off.lifted}/${off.total}`,
      declared_only_lifted: `${declOnly.lifted}/${declOnly.total}`,
      on_lifted: `${on.lifted}/${on.total}`,
      /** ⚠ 이름이 `confirm_link.json`의 같은 이름과 **다른 양**이다(2차 리뷰어 [13]) — 여기서는 승격 연쇄의 끝점 앵커가 우회해 0이 나온다 */
      off_gap_rel_max_end_anchor_bypassed:
        gapsOf(off).length ? Math.max(...gapsOf(off)) : null,
      declared_only_gap_rel_max: gapsOf(declOnly).length ? Math.max(...gapsOf(declOnly)) : null,
      on_gap_rel_max: gapsOf(on).length ? Math.max(...gapsOf(on)) : null,
      closed_standing: closed.standing,
      closed_order: closed.order,
      closed_lifted: `${closed.lifted}/${closed.total}`,
      /** 떨림 0(직선 마우스) — 같은 팔 구성에서 결함이 **안 난다**. 프리핸드가 판정자다 */
      straight_gap_rel_max: gapsOf(straight).length ? Math.max(...gapsOf(straight)) : null,
      straight_wobble_px: straight.wobble_px,
      /**
       * **후보 ②의 분모와 분자**(AS-L46 · 2차 리뷰어 [1]) — 이 픽스처들이 그 경로를 만드는가,
       * 만들었을 때 실제로 되돌려 보냈는가. `attempts`가 0이 아닌 팔이 있으므로
       * "발화 기회가 없다"로 읽으면 안 된다 — 읽을 것은 `rejected`다.
       */
      chain_dir_guard_attempts: [off, declOnly, on, closed, straight, symptom1]
        .map(a => a.chainDirGuard.attempts),
      chain_dir_guard_rejected: [off, declOnly, on, closed, straight, symptom1]
        .map(a => a.chainDirGuard.rejected),
      /** **증상 ①의 현행 상태** — 안 선다(의도된 대기). D-L99의 완화 밖이다 */
      symptom1_standing: symptom1.standing,
      symptom1_order: symptom1.order,
      symptom1_lifted: `${symptom1.lifted}/${symptom1.total}`,
    },
    gate: {
      registered: "확정 순간 붙여 그은 두 획이 붙어 있는가(앱 종단). 판정은 **끈 팔의 값**이 "
        + "든다 — 켠 팔의 0은 설계 보장이라(#5) 임계를 안 건다.",
      reachability: "(b)의 되살림 팔은 `declared_only`다(선언 제약 켬 · 되맞춤 끔). "
        + "⚠ **완전 `off` 팔은 되살림 팔이 아니다** — 선언 제약이 없으면 일괄 풀이가 획 하나를 "
        + "못 담고 승격 연쇄의 **끝점 앵커**가 대신 놓아(`arms[0].placeBy.end_anchor`) "
        + "간격이 0으로 나온다. 그 사실 자체가 이 원장의 관측이다.",
      reachability_value: gapsOf(declOnly).length ? Math.max(...gapsOf(declOnly)) : null,
      reachability_source: "summary/declared_only_gap_rel_max",
      result: {
        declared_only_gap_rel_max: gapsOf(declOnly).length ? Math.max(...gapsOf(declOnly)) : null,
        off_place_by_end_anchor: off.placeBy.end_anchor,
        straight_gap_rel_max: gapsOf(straight).length ? Math.max(...gapsOf(straight)) : null,
      },
    },
    pitfall_citations: [5, 12, 17, 21, 25, 30, 40],
    errors,
    constants: constantsSnapshot(),
    metric_defs: metricsSnapshot(),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "confirm_link_e2e.json"), JSON.stringify(led, null, 1));

  expect(errors).toEqual([]);
  // ---- 세 팔 모두 공간은 선다(이 구도는 확정된다) — 그래야 팔들이 견줄 수 있다
  for (const a of [off, declOnly, on]) expect(a.standing).toBe(true);
  // ---- **닫힌 삼각형도 선다**(D-L99) — 두 사선이 꼭짓점을 공유해도 그 점이 소실점이다.
  // ⚠ 획이 **전부** 올라가는 것은 아니다: 자기 소실점까지 그은 획은 그 끝의 깊이가
  // 무한이라 세그먼트가 안 정해진다 — 그 획은 **대기**다(§9.1, 실패가 아니다)
  expect(closed.standing).toBe(true);
  expect(closed.order).toBeGreaterThanOrEqual(1);
  expect(closed.lifted).toBeGreaterThan(0);
  // ---- **스냅 기록은 안 없어진다**(지시 1-b의 물음에 대한 답: 유지된다)
  for (const a of [off, declOnly, on]) expect(a.snap_records).toBeGreaterThan(0);
  // ---- **도달 가능성**(#40) — 되맞춤만 끈 팔이 실제로 결함을 낸다
  expect(led.summary.declared_only_gap_rel_max).toBeGreaterThan(0);
  // ---- **떨림 0에서는 안 난다** — 프리핸드가 판정자라는 주장의 대조 팔
  expect(led.summary.straight_gap_rel_max).toBe(0);
  // 그 팔은 셋 다 일괄 풀이로 놓는다 — 연쇄 우회가 아니라 이 경로의 값임을 박는다
  expect(declOnly.placeBy.batch).toBe(declOnly.total);
  // ---- 수리 팔: 붙여 그은 두 획이 3D에서 **같은 점**을 쓴다(보장 — #5)
  expect(on.lifted).toBe(on.total);
  expect(led.summary.on_gap_rel_max).toBeLessThan(1e-9);
  // ---- 확정 획에 **3D 참조가 붙는다**(옛 판은 일괄 풀이 경로에서 전부 null이었다)
  expect(on.rows.filter((r: any) => r.ref3d).length).toBeGreaterThan(0);
  expect(off.rows.filter((r: any) => r.ref3d).length).toBe(0);
});
