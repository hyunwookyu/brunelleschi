// **끝점 스냅이 단계별로 얼마나 걸리는가 — 그리고 기록되는가**(2026-08-18 9차 항목 1-b).
// 산출: `stage0/out/snap_stage.json`.
//
// ## 왜 이 원장인가
//
// 실획 첫 표본의 `snapEnd`가 **0/5**였고, 8차는 그것을 "끝점 스냅이 안 걸린다"로 읽으려다
// **분모에서 무너졌다** — `snap_use`의 분모는 **3D 획**이라 2D 단계의 갭을 설명할 수 없다.
// 그리고 2D 단계 스냅은 **좌표만 옮기고 기록을 안 남겼으므로**(항목 1이 고친 것) 그 단계의
// 성공률은 **아무 원장에도 없었다.** 여기가 그 자리다.
//
// **가르는 것 셋**(#32 — 미실행을 반증으로 처리하지 않는다):
//   ① 후보가 하나도 없었다        → `cands == 0`
//   ② 후보는 있는데 조리개 밖이다  → `nearest_px > radius`
//   ③ 걸렸다                      → `engaged`
// 그리고 ③ 중 **문서에 남는 수**가 `recorded`다. 항목 1 이전에는 그 값이 **정의상 0**이었다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md` 9차 항목 1 착수 표에 있다.
// 특히 **#11**(2D 단계와 3D 단계는 다른 모집단) · **#5**(`engaged == recorded`는 보장이다 —
// 임계를 걸지 않는다) · **#30**(양성 채널은 `no_record` 팔이다) · **#17**(앱과 같은 함수).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CamState } from "../src/ui/camState.js";
import { representative } from "../src/s3d/axis.js";
import { type Pt2 } from "../src/s3d/camera.js";
import { perspectiveOrder, vpsOf, type RLine } from "../src/s3d/vpRules.js";
import { resolve2dCore, snap2Refs, OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { scene, boxLattice, drawEdges, groundPoint, round, median, quantile } from "./scene3d.js";
import { fraction, rate, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** `order_lock`·`classify_leak`과 **같은 다섯 구도**다(#27). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const JITTERS = [0, 0.005, 0.01, 0.03, 0.05];
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];
/** **조리개를 하나로 안 고른다**(#12). 현행은 15다. */
const RADII = [8, 15, 30];

const REGISTERED =
  "① **기록이 걸린 수와 같다**: 2D 단계에서 `resolve2dCore`가 끝점 오스냅을 건 획 수"
  + "(`engaged_end`)와 `snap2Refs`가 문서에 남긴 수(`recorded_end`)가 **정확히 같다**. "
  + "⚠ 이것은 **보장이지 측정이 아니다**(#5) — `snap2Refs`가 같은 값을 옮겨 적을 뿐이다. "
  + "그래서 **임계를 안 걸고**, 대신 **양성 채널 `no_record` 팔**(기록을 건너뛴 팔)이 "
  + "0을 내야 이 검사가 무엇을 잡는지 증명된다(#30·#32). "
  + "② **단계가 실제로 갈린다**: 2D 단계(P0)에서 그은 획이 **0이 아니다**. 0이면 이 원장이 "
  + "재는 대상이 도달 불가이고(#35), 그러면 항목 1의 수리는 **닿지 않는 코드**다. "
  + "모집단은 5구도 × 6시드 × 등급 2 × 잡음 5 × 조리개 3 = 900실행 × 12획이고 "
  + "**분모는 그 단계에서 그은 획**이다 — 2D와 3D는 **다른 모집단**이다(#11). "
  + "⚠ 이것은 이 항목이 등록한 게이트다(#41).";

interface Row {
  comp: string; jitter: number; grade: InkGrade; seed: number; radius: number;
  /** 그 획을 먹인 시점의 차수 — 0이면 2D 단계다 */
  stage: "d2" | "d3";
  cands: number;
  /** 끝점에서 가장 가까운 2D 후보까지의 거리(px). 후보가 없으면 null */
  nearestEnd: number | null;
  nearestStart: number | null;
  engagedStart: boolean; engagedEnd: boolean;
  recordedStart: boolean; recordedEnd: boolean;
}

function rowsOf(): Row[] {
  const out: Row[] = [];
  const diag = Math.hypot(SZ[0], SZ[1]);
  for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
    const C = COMPOSITIONS[ci];
    const sc = scene(C.yaw, C.pitch, 1000, SZ);
    const O = groundPoint(sc, C.origin);
    if (!O) continue;
    const edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
    for (const jit of JITTERS) for (const grade of GRADES) for (const seed of SEEDS)
    for (const radius of RADII) {
      const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
      if (!drawn) continue;
      const cam = new CamState(SZ);
      const fedSegs: Snap2Seg[] = [];
      for (const e of drawn) {
        const ord = perspectiveOrder(cam.rules);
        const stage: "d2" | "d3" = ord === 0 ? "d2" : "d3";
        let pts = e.pts2d as Pt2[];
        let cands: Pt2[] = [];
        let r2: ReturnType<typeof resolve2dCore> | null = null;
        // **앱과 같은 조건**(#17): 2D 판정은 확정 전(P0)에만 돈다(`mainL.onStrokeEnd`)
        if (ord === 0) {
          const cs = fedSegs.length ? static2dCandidates(fedSegs, diag) : [];
          cands = cs.map(c => c.at);
          r2 = resolve2dCore(pts, { cands: cs, vps: vpsOf(cam.rules),
                                    radiusPx: radius, relSnap: true });
          pts = r2.pts;
        }
        const rep = representative(pts);
        if (!rep) continue;
        const line: RLine = { a: rep.a, b: rep.b };
        fedSegs.push({ id: `f${fedSegs.length}`, a: line.a, b: line.b });
        const near = (q: Pt2): number | null => {
          let best: number | null = null;
          for (const c of cands) {
            const d = Math.hypot(c[0] - q[0], c[1] - q[1]);
            if (best == null || d < best) best = d;
          }
          return best;
        };
        const raw = e.pts2d as Pt2[];
        const ref = r2 ? snap2Refs(r2) : { start: null, end: null };
        out.push({
          comp: C.name, jitter: jit, grade, seed, radius, stage,
          cands: cands.length,
          nearestStart: near(raw[0]), nearestEnd: near(raw[raw.length - 1]),
          engagedStart: !!r2?.start2, engagedEnd: !!r2?.end2,
          recordedStart: !!ref.start, recordedEnd: !!ref.end,
        });
        let r = cam.feed(line);
        // 물음에는 **깊이로** 답한다 — 이 원장은 축 정확도를 안 재고 단계 분포만 본다
        if (r.event.type === "ask") r = cam.feed(line, "depth");
        void r;
      }
    }
  }
  return out;
}

describe("snap_stage — 2D 단계 스냅이 걸리고 기록되는가", () => {
  it("단계별 걸림·기록을 원장에 남긴다", () => {
    const rows = rowsOf();
    expect(rows.length).toBeGreaterThan(1000);

    const d2 = rows.filter(r => r.stage === "d2");
    const d3 = rows.filter(r => r.stage === "d3");

    const cut = (rs: Row[]) => {
      const noCand = rs.filter(r => r.cands === 0);
      const outOfAperture = rs.filter(r => r.cands > 0 && r.nearestEnd != null
                                        && r.nearestEnd > r.radius);
      const inAperture = rs.filter(r => r.cands > 0 && r.nearestEnd != null
                                     && r.nearestEnd <= r.radius);
      return {
        n: rs.length,
        // **①②③을 갈라 센다**(#32) — 하나로 뭉치면 "안 걸린다"의 뜻이 셋이다
        no_candidate: fraction(noCand.length, rs.length),
        out_of_aperture: fraction(outOfAperture.length, rs.length),
        in_aperture: fraction(inAperture.length, rs.length),
        engaged_end: fraction(rs.filter(r => r.engagedEnd).length, rs.length),
        engaged_start: fraction(rs.filter(r => r.engagedStart).length, rs.length),
        recorded_end: fraction(rs.filter(r => r.recordedEnd).length, rs.length),
        recorded_start: fraction(rs.filter(r => r.recordedStart).length, rs.length),
        // **조리개 안인데 안 걸린 것**(③의 반례 — 판정이 안 돈 자리)
        in_aperture_not_engaged: fraction(
          inAperture.filter(r => !r.engagedEnd).length, inAperture.length),
        nearest_end_px: {
          n: rs.filter(r => r.nearestEnd != null).length,
          p10: round(quantile(rs.map(r => r.nearestEnd).filter((x): x is number => x != null), 0.1)),
          median: round(median(rs.map(r => r.nearestEnd).filter((x): x is number => x != null))),
          p90: round(quantile(rs.map(r => r.nearestEnd).filter((x): x is number => x != null), 0.9)),
        },
      };
    };

    const byRadius = Object.fromEntries(RADII.map(R => {
      const rs = d2.filter(r => r.radius === R);
      return [`r${R}`, cut(rs)];
    }));
    const byComp = Object.fromEntries(COMPOSITIONS.map(C => {
      const rs = d2.filter(r => r.comp === C.name && r.radius === OSNAP_RADIUS_PX);
      return [C.name, { n: rs.length,
                        engaged_end: fraction(rs.filter(r => r.engagedEnd).length, rs.length),
                        engaged_start: fraction(rs.filter(r => r.engagedStart).length, rs.length) }];
    }));

    // **양성 채널**(#30) — 기록을 건너뛴 팔. 그 팔의 `recorded`가 0이어야 이 검사가
    // 무엇을 잡는지 증명된다. 항목 1 **이전의 앱이 정확히 이 팔이었다.**
    const noRecord = { recorded_end: fraction(0, d2.length), recorded_start: fraction(0, d2.length),
                       what: "**항목 1 이전의 앱이 이 팔이다** — `resolve2dCore`가 좌표를 옮기고 "
                           + "표식까지 그렸는데 문서에 남는 것이 **하나도 없었다**. "
                           + "`engaged`와 이 행의 차이가 곧 그 결함의 크기다." };

    const mismatch = d2.filter(r => r.engagedEnd !== r.recordedEnd
                                 || r.engagedStart !== r.recordedStart).length;

    const out = {
      what: "**2D 단계(확정 전)의 오스냅이 얼마나 걸리고 문서에 남는가.** 3D 단계와 "
          + "**분모를 갈라** 센다(#11) — 8차가 `snap_use`(분모 = 3D 획)로 2D 갭을 설명하려다 "
          + "무너진 자리다.",
      population: { compositions: COMPOSITIONS.length, jitters: JITTERS, grades: GRADES,
                    seeds: SEEDS, radii: RADII, rows: rows.length,
                    d2_strokes: d2.length, d3_strokes: d3.length },
      stage_split: {
        d2: fraction(d2.length, rows.length), d3: fraction(d3.length, rows.length),
        note: "**2D 단계 획이 전체의 얼마인가.** 이 몫이 곧 항목 1의 수리가 닿는 범위다.",
      },
      d2_by_radius: byRadius,
      d2_by_composition: byComp,
      d3_note: "**3D 단계에서는 `resolve2dCore`가 아예 안 돈다**(앱의 `frame() ? null : resolve2d`). "
             + "그 단계의 끝점 스냅은 `applySnapToEnd`(3D 참조)가 맡고 `snap_use`가 그것을 잰다 — "
             + "**다른 원장·다른 분모다**(#11).",
      d3: { n: d3.length, engaged_end: fraction(0, d3.length),
            note: "**정의상 0이다** — 이 단계에서는 2D 경로가 안 돈다. 측정이 아니라 배선의 귀결이다(#5)." },
      no_record_arm: noRecord,
      guarantee: {
        engaged_equals_recorded_mismatch: mismatch,
        note: "**보장이지 측정이 아니다**(#5 · CLAUDE.md §5) — `snap2Refs`가 "
            + "`resolve2dCore`의 결과를 **옮겨 적을 뿐**이라 다를 수가 없다. "
            + "**그래서 임계를 안 건다.** 이 값이 0이 아니면 배선이 갈라진 것이다.",
      },
      what_this_does_not_say: [
        "**\"붙어야 할 곳에 붙었는가\"를 안 잰다** — 걸림 여부만 센다. 오스냅(안 붙어야 하는데 붙음)은 **항목 2**의 원장이다.",
        "**실획이 아니다**(AS-L24·L25). 실획의 2D 단계 기록은 `.brnl`에 `snap2dEnd`가 담긴 뒤에 나온다 — **이 세션의 표본은 그 필드 이전에 저장됐다**.",
        "**축 정확도·차수를 안 잰다.** 물음에는 전부 `depth`로 답했다 — 단계 분포만 보는 원장이다.",
      ],
      gate: gate({
        registered: REGISTERED,
        reachability: "**`no_record` 팔이 도달 가능성의 반대편이다**(#30·#35) — 항목 1 이전의 "
          + "앱이 그 팔이고 `recorded`가 0이다. `engaged`가 0이 아니면 그 차이가 결함의 크기이고, "
          + "`engaged`가 0이면 **2D 단계에서 끝점 스냅이 애초에 안 걸리는 것**이라 항목 1의 수리는 "
          + "닿는 데가 없다. 즉 이 원장은 **수리의 대상이 존재하는지부터** 판정한다.",
        reachability_value: d2.filter(r => r.engagedEnd).length,
        reachability_source: "d2_engaged_end_n",
      }),
      d2_engaged_end_n: d2.filter(r => r.engagedEnd).length,
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "snap_stage.json"), JSON.stringify(out, null, 2), "utf8");

    // **보장이므로 단언한다**(임계가 아니다) — 배선이 갈라지면 여기서 잡힌다
    expect(mismatch).toBe(0);
    // 등록 ② — 2D 단계 획이 0이면 이 원장이 재는 대상이 도달 불가다
    expect(d2.length).toBeGreaterThan(0);
  }, 120_000);
});
