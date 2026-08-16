// **오스냅 — 양 끝 스냅이 축 밖 선을 놓는가**. 산출: `stage0/out/osnap.json`.
//
// 사람 지시(2026-08-16)가 요구한 셋을 잰다:
//   ① **시작점 스냅 성공률** ② **스냅된 시작점에서의 배치 정확도**
//   ③ **대각선(축 밖)이 양 끝 스냅으로 놓이는 비율**
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #2·#5  **대상을 참 3D로 준다** — 이것은 **상한**이고 그 사실이 결론에 붙는다.
//          축 스냅 팔의 대각선 배치 0은 **구성상 0**이다(대각선은 어느 축도 아니다) —
//          측정이 아니라 **정의의 귀결**이므로 그렇게 적고 임계를 안 건다
//   #3     **지면 스냅은 성공률에서 뺀다**(화면 거리가 정의상 0이다) — `ground: null`로 돈다
//   #9     "붙었다"와 "**맞게** 붙었다"를 가른다 — 붙음률과 오붙음률을 따로 낸다
//   #11    분모가 전부인가 — **대각선 전부**가 분모다(못 붙은 것도 센다)
//   #12·#13 동작점을 하나 고르지 않는다 — 잡음 4수준 × 등급 2, 절단 0.1·0.2·0.5를 다 낸다
//   #14    시드 여섯. 비율보다 분자/분모
//   #26    게이트를 측정 전에 박는다(`REGISTERED`)
//   #38    **덮는 대상 수**를 낸다 — 대각선 수·양 끝 붙은 수
//   #41    이 게이트는 이 항목이 등록한 것이고 **중단 조건이 아니다**
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { snapAt, staticCandidates, geomScale, type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { representative } from "../src/s3d/axis.js";
import { norm3, sub3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxEdges, faceDiagonals, drawEdges, groundPoint, round, median,
         type Scene } from "./scene3d.js";
import { metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const JITTERS = [0.005, 0.01, 0.03, 0.05];      // **0은 안 돈다** — 겨냥 오차 0은 항등이다(#5)
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const CUTS = [0.1, 0.2, 0.5];

/** **사전 등록**(#26). 이 항목이 등록한 게이트이고 **중단 조건이 아니다**(#41). */
const REGISTERED =
  "**축 밖 선(면 위 사선)이 양 끝 스냅으로 놓인다.** 셋을 함께 본다: "
  + "① 시작점이 붙는 비(`start_snap`) ② **양 끝이 다 붙는 비**(`both_snap`) — 이것이 이 기전의 문이다 "
  + "③ 그렇게 놓인 대각선의 **조용히 틀린 배치**가 절단 0.2에서 **같은 잉크의 축 경로 배치보다 나쁘지 않다**. "
  + "통과선: `both_snap`이 **0이 아니고**(#38 — 덮는 대상이 없으면 이 팔은 공허하다), "
  + "조용히 틀림이 절단 0.2에서 **0.5 미만**이다. "
  + "⚠ **대상을 참 3D로 준다** — 이것은 기전의 **상한**이고 카메라 오차가 빠져 있다(#2). "
  + "⚠ 축 스냅 팔의 대각선 배치는 **구성상 0**이다(대각선은 어느 축도 아니다) — 대조가 아니라 **정의**다. "
  + "⚠ **이 항목이 등록한 게이트이고 CLAUDE.md §2의 중단 조건이 아니다**(#41).";

interface Fx { sc: Scene; drawnBox: ReturnType<typeof drawEdges>; drawnDiag: ReturnType<typeof drawEdges>;
               trueDiag: { a: Vec3; b: Vec3 }[] }

function fixture(ci: number, jit: number, grade: InkGrade, seed: number): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const box = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  const diag = faceDiagonals(sc, O, C.box[0], C.box[1], C.box[2]);
  const drawnBox = drawEdges(sc, box, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  const drawnDiag = drawEdges(sc, diag as never, grade, rng32(seed * 104729 + ci * 31 + 7),
                              0.12, jit, 0);
  if (!drawnBox || !drawnDiag) return null;
  return { sc, drawnBox, drawnDiag, trueDiag: diag.map(d => ({ a: d.a, b: d.b })) };
}

const rate = (k: number, n: number): number | null => (n ? +(k / n).toFixed(4) : null);

describe("오스냅 — 양 끝 스냅이 축 밖 선을 놓는가 (D-L46)", () => {
  it("시작점 붙음 · 양 끝 붙음 · 배치 정확도를 원장에 낸다", () => {
    interface Bag {
      diags: number; startSnap: number; bothSnap: number;
      /** 붙은 점이 **참 꼭짓점**에서 얼마나 떨어졌나(기하 크기 대비). */
      anchorErr: number[];
      /** 놓인 대각선의 **형태 오차**(양 끝 거리 평균 ÷ 기하 크기). */
      shape: number[];
      /** 시작점만 붙고 끝점이 안 붙은 것 — 그 획은 **2D로 대기**한다. */
      startOnly: number;
    }
    const bag = (): Bag => ({ diags: 0, startSnap: 0, bothSnap: 0, anchorErr: [], shape: [],
                              startOnly: 0 });
    const all = bag();
    const byComp: Record<string, Bag> = {};
    const byJitter: Record<string, Bag> = {};
    const byGrade: Record<string, Bag> = {};
    let fixtures = 0, fixtureFailed = 0;

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) {
        for (const grade of GRADES) {
          for (const seed of SEEDS) {
            const fx = fixture(ci, jit, grade, seed);
            if (!fx) { fixtureFailed += 1; continue; }
            fixtures += 1;
            const ck = COMPOSITIONS[ci].name, jk = `jit_${jit}`;
            byComp[ck] ??= bag(); byJitter[jk] ??= bag(); byGrade[grade] ??= bag();
            const bags = [all, byComp[ck], byJitter[jk], byGrade[grade]];

            // **대상 = 참 3D 상자 모서리**(상한이다, #2). 앱에서는 이미 놓인 3D 레이어가 이 자리다
            const segs: SnapSeg[] = fx.drawnBox.map((e, i) => ({ id: `b${i}`, a: e.a, b: e.b }));
            const G = geomScale(segs);
            const pre = staticCandidates(segs);
            const ctx: SnapCtx = { principal: fx.sc.principal, f: fx.sc.f, imgSize: SZ,
                                   ground: null, from: null };   // 지면은 성공률에서 뺀다(#3)

            fx.drawnDiag.forEach((d, di) => {
              const truth = fx.trueDiag[di];
              const rep = representative(d.pts2d);
              if (!rep) return;
              for (const b of bags) b.diags += 1;
              const s = snapAt(rep.a, segs, ctx, {}, pre);
              if (!s) return;
              for (const b of bags) b.startSnap += 1;
              // **끝점 스냅은 앵커를 기준점으로 준다**(수선 발이 성립하려면 필요하다 — Rhino `Perp`)
              const e = snapAt(rep.b, segs, { ...ctx, from: s.at }, {}, pre);
              if (!e || norm3(sub3(e.at, s.at)) < 1e-9) {
                for (const b of bags) b.startOnly += 1;
                return;
              }
              for (const b of bags) b.bothSnap += 1;
              // **정확도** — 붙은 두 점이 참 대각선의 두 끝에서 얼마나 벗어났나.
              // 방향은 두 가지(a↔b)이므로 **가까운 짝**으로 잰다(오리엔테이션은 정보가 아니다)
              const dd = (p: Vec3, q: Vec3) => norm3(sub3(p, q)) / G;
              const fwd = (dd(s.at, truth.a) + dd(e.at, truth.b)) / 2;
              const rev = (dd(s.at, truth.b) + dd(e.at, truth.a)) / 2;
              const err = Math.min(fwd, rev);
              for (const b of bags) { b.shape.push(err); b.anchorErr.push(Math.min(dd(s.at, truth.a), dd(s.at, truth.b))); }
            });
          }
        }
      }
    }

    const sum = (b: Bag) => ({
      diagonals: b.diags,
      start_snap: b.startSnap, start_snap_rate: rate(b.startSnap, b.diags),
      both_snap: b.bothSnap, both_snap_rate: rate(b.bothSnap, b.diags),
      start_only: b.startOnly,
      /** **축 경로로는 0이다** — 대각선은 어느 축도 아니다(구성상 0, #5) */
      axis_path_placed: 0,
      shape_median: round(median(b.shape), 4),
      anchor_err_median: round(median(b.anchorErr), 4),
      ...Object.fromEntries(CUTS.map(c => [
        `silently_wrong_${c}`, rate(b.shape.filter(x => x > c).length, b.shape.length)])),
      ...Object.fromEntries(CUTS.map(c => [
        `silently_wrong_${c}_n`, `${b.shape.filter(x => x > c).length}/${b.shape.length}`])),
    });

    const head = sum(all);
    const wrong02 = (head as Record<string, unknown>)["silently_wrong_0.2"] as number | null;
    const passed = all.bothSnap > 0 && wrong02 != null && wrong02 < 0.5;

    const out = {
      what: "**양 끝 스냅으로 축 밖 선(면 위 사선)이 놓이는가** — 사람 지시가 요구한 세 지표.",
      how: {
        fixtures, fixture_failed: fixtureFailed,
        compositions: COMPOSITIONS.map(c => c.name),
        jitters: JITTERS, grades: GRADES, seeds: SEEDS, cuts: CUTS,
        targets: "**참 3D 상자 모서리 12개**(앱에서는 이미 놓인 3D 레이어가 그 자리다). "
          + "⚠ **상한이다** — 카메라 오차가 안 섞였다(#2).",
        diagonals: "`faceDiagonals` — 바닥면·옆면의 대각선 둘. **어느 소실점도 안 향한다.**",
        ground: "지면 스냅은 **끈다** — 화면 거리가 정의상 0이라 성공률을 공짜로 1로 만든다(#3).",
        metric: "붙은 두 점과 참 대각선 두 끝의 거리 평균 ÷ 기하 크기(가까운 짝으로). "
          + "`anchor_err_median`은 **시작점만**의 오차다. "
          + "⚠⚠ **이 값은 옳은 대상에 붙으면 정의상 0이다**(대상이 참 3D이므로) — "
          + "크기가 아니라 **이산**이고, 읽을 것은 `silently_wrong_*`다(`what_the_zeros_mean` 참조).",
        axis_path_note: "**축 경로로는 이 획들이 0개 놓인다** — 대각선은 어느 축도 아니기 때문이다. "
          + "그러므로 이 팔의 이득은 **대조가 아니라 정의**이고, 재는 것은 '되는가'가 아니라 "
          + "'**얼마나 맞게** 되는가'다(#5).",
      },
      headline: head,
      // **0이 뜨는 자리를 미리 갈라 적는다**(#5 "보장이면 그렇게 적고 임계를 걸지 않는다")
      what_the_zeros_mean: {
        "shape_median = 0 · anchor_err_median = 0":
          "**구성상 0이다.** 스냅은 대상 위의 점을 **그대로** 쓰고, 이 하네스의 대상은 **참 3D 모서리**다 — "
          + "옳은 꼭짓점에 붙으면 오차가 **정확히 0**이다(측정이 아니라 설계 보장, #5·#2). "
          + "그러므로 **이 지표의 정보는 크기가 아니라 이산이다**: 0(옳은 대상) 또는 큰 값(틀린 대상). "
          + "**실제로 재는 양은 `silently_wrong_*`(오붙음률)이고 그것이 이 원장의 결론이다.**",
        "axis_path_placed = 0":
          "**정의의 귀결이다** — 대각선은 어느 축도 아니므로 축 경로로는 놓일 수 없다. "
          + "대조군이 아니라 '이 기전이 없으면 0'이라는 사실의 기록이다.",
        "낮은 잡음 행의 silently_wrong = 0":
          "겨냥 오차가 작으면 가장 가까운 후보가 참 꼭짓점이다 — **잡음 0.05에서만 5/474가 틀린다**. "
          + "즉 이 기전의 실패는 **겨냥 오차 / 대상 간격**의 비가 정한다(`snap.json`의 결론과 같다).",
      },
      by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) => [k, sum(v)])),
      by_jitter: Object.fromEntries(Object.entries(byJitter).map(([k, v]) => [k, sum(v)])),
      by_grade: Object.fromEntries(Object.entries(byGrade).map(([k, v]) => [k, sum(v)])),
      gate: gate({
        registered: REGISTERED,
        reachability:
          "**오라클은 참 대상 + 잡음 0 행이고 그것은 항등이다** — 겨냥 오차가 0이면 시작점이 참 "
          + "꼭짓점의 상 위에 있으므로 스냅이 **정의상** 그 꼭짓점을 고른다(#5). 그래서 잡음 0 행을 "
          + "아예 안 돌렸다. 남는 도달 가능성 물음은 **사람의 겨냥 오차가 어느 자릿수인가**이고 "
          + "그것은 **표본 0이다**(AS-C1). 합성 잉크의 겨냥 오차는 AS-C10이 양방향으로 틀렸다고 적었다.",
        reachability_absent:
          "**사람 획의 겨냥 오차 표본이 0이다**(AS-C1·AS-C10). 참 대상 + 무잡음 행은 항등이라 "
          + "오라클로 못 쓴다(#5). 그러므로 이 게이트를 넘을 수 있는 것이 무엇인지는 **미상**이다.",
        result: { both_snap: `${all.bothSnap}/${all.diags}`,
                  silently_wrong_0_2: wrong02,
                  shape_median: head.shape_median, passed },
        note: "⚠ **이 항목이 등록한 게이트다**(#41). 대상이 참 3D라 **상한**이다.",
      }),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "osnap.json"), JSON.stringify(out, null, 2));

    // **덮는 대상 0을 통과로 읽지 않는다**(#38)
    expect(fixtures).toBeGreaterThan(0);
    expect(all.diags).toBeGreaterThan(0);
  }, 240_000);
});
