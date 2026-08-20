// **확정 순간의 연결 — 측정 하네스**(2026-08-19 15차 항목 1 · D-L98).
// 산출: `stage0/out/confirm_link.json`.
//
// 재는 것 둘이고 **단위가 다르다**(#49 — 판정을 정하는 양의 단위로 잰다):
//
// ```
// real_ink_rep_offset   그린 끝점 ↔ `representative`의 그 끝 (화면 px)
//                       — **결함의 조건**이다. 이 값이 0이면 두 결함 다 안 난다
// chain_arms            붙여 그은 두 획의 그 끝 사이 거리 (기하 크기 대비) · 놓인 수/전체
//                       — **결함의 크기**다
// ```
//
// ⚠ **`real_ink_rep_offset`은 실측이고 `chain_arms`의 수리 후 값은 보장이다**(#5):
// 되맞춤은 두 끝을 같은 점으로 **모으는 연산**이므로 그 뒤의 0은 측정이 아니라 설계
// 보장이다. **임계를 걸지 않는다** — 판정은 `off` 팔의 값이 든다.
//
// ⚠ 이 파일이 `stage0/out`에 쓰므로 **측정 갈래**다(`web/tools/testSplit.mjs` — 행동이
// 갈래를 정한다). 항목마다 도는 `test:unit`에는 안 든다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { skipReason } from "./dataDeps.js";
import { type RLine } from "../src/s3d/vpRules.js";
import { liftAll, LIFT_TOL, type LiftStroke, type LiftCtx, type DeclaredJoint }
  from "../src/s3d/lift.js";
import { anchorToTarget } from "../src/s3d/liftAnchor.js";
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { representative } from "../src/s3d/axis.js";
import { lineIntersect } from "../src/s3d/camera.js";
import { norm3, sub3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat } from "./scene3d.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";
/** `.brnl`(Doc2) 저장본 — 앱의 현행 내보내기다(`real_ink.test.ts`의 `BrnlDoc`과 같은 것). */
interface BrnlDoc { format?: string; strokes?: { id: string; pts2d: number[][] }[] }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SESSIONS = resolve(ROOT, "sessions");
const SZ: [number, number] = [1280, 675];

const dist = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** 실획 표본에서 그린 끝점과 `rep` 끝의 어긋남(px). 두 점짜리 획은 정의상 0이라 뺀다. */
function repOffsets(): { total: number; rows: { doc: string; id: string; n: number; len: number;
                                 bend: number; start: number; end: number }[] } {
  const rows: { doc: string; id: string; n: number; len: number; bend: number;
                start: number; end: number }[] = [];
  let total = 0;
  for (const f of readdirSync(SESSIONS).filter(x => x.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(resolve(SESSIONS, f), "utf8")) as BrnlDoc;
    for (const s of doc.strokes ?? []) {
      const pts = (s.pts2d ?? []) as Pt2[];
      total += 1;
      if (pts.length < 3) continue;                 // 두 점 획은 `rep`가 그 두 점을 지난다
      const rep = representative(pts);
      if (!rep) continue;
      rows.push({
        doc: f, id: s.id, n: pts.length,
        len: Math.round(rep.len * 100) / 100,
        bend: Math.round(rep.bend * 1e4) / 1e4,
        start: Math.round(Math.min(dist(rep.a, pts[0]), dist(rep.b, pts[0])) * 100) / 100,
        end: Math.round(Math.min(dist(rep.a, pts[pts.length - 1]),
                                 dist(rep.b, pts[pts.length - 1])) * 100) / 100,
      });
    }
  }
  return { total, rows };
}

/** 붙여 그린 사슬 — 상자 모서리 셋(축 0·1·2)을 프리핸드로 긋고 오스냅처럼 시작점을 잇는다. */
function chainFixture(grade: "precise" | "medium" | "coarse", seed: number) {
  const sc = scene(35, 15, 1000, SZ);
  const O = groundPoint(sc, [520, 430])!;
  const all = boxEdges(sc, O, 1.2, 1.0, 0.9);
  const drawn = drawEdges(sc, [all[0], all[3], all[7]], grade, rng32(seed), 0.12, 0, 0)!;
  const strokes = drawn.map((d, i) => ({ id: `c${i}`, pts2d: d.pts2d.map(p => [p[0], p[1]] as Pt2),
                                         axis: d.axis })) as LiftStroke[];
  const links: { id: string; ofId: string; at: Pt2 }[] = [];
  for (let i = 1; i < strokes.length; i++) {
    const prev = strokes[i - 1].pts2d;
    const at: Pt2 = [prev[prev.length - 1][0], prev[prev.length - 1][1]];
    strokes[i].pts2d[0] = [at[0], at[1]];
    links.push({ id: strokes[i].id, ofId: strokes[i - 1].id, at });
  }
  const ctx: LiftCtx = { principal: sc.principal, f: sc.f,
                         vps: [sc.vps[0], sc.vps[1], sc.vps[2]], imgSize: SZ };
  return { ctx, strokes, links,
           declared: links.map(l => ({ i: l.id, j: l.ofId, q: l.at })) as DeclaredJoint[] };
}

const pairGap = (a: [Vec3, Vec3], b: [Vec3, Vec3]) =>
  Math.min(...a.flatMap(p => b.map(q => norm3(sub3(p, q)))));

/**
 * **(a)의 기전 크기** — 그린 연결점과 **두 대표 직선의 교점** 사이 거리(px), 그리고
 * `findJoints`가 그 교점을 받는 접합 반경(`touch_ratio` × 화면 대각).
 * 이 값이 반경을 넘으면 그 접합이 **안 잡힌다** — 붙여 그은 획이 구조에서 떨어지는 그 자리다.
 */
function repIntersectOffsets(grade: "precise" | "medium" | "coarse", seed: number) {
  const { ctx, strokes, links } = chainFixture(grade, seed);
  const by = new Map(strokes.map(s => [s.id, s]));
  const tolPx = LIFT_TOL.touch_ratio * Math.hypot(SZ[0], SZ[1]);
  const rows = links.map(l => {
    const A = representative(by.get(l.id)!.pts2d), B = representative(by.get(l.ofId)!.pts2d);
    if (!A || !B) return null;
    const q = lineIntersect(A.a, A.b, B.a, B.b);
    if (!q) return null;
    return { id: l.id, ofId: l.ofId, offset_px: Math.round(dist(q, l.at) * 100) / 100 };
  }).filter((x): x is { id: string; ofId: string; offset_px: number } => !!x);
  return { tol_px: Math.round(tolPx * 100) / 100, rows };
}

/** 팔 하나 — 선언 제약 on/off × 되맞춤 on/off. */
function arm(declaredOn: boolean, anchorOn: boolean, grade: "precise" | "medium" | "coarse",
             seed: number, keepDir = true) {
  const { ctx, strokes, links, declared } = chainFixture(grade, seed);
  const r = liftAll(strokes, ctx, {}, declaredOn ? declared : []);
  const segs = new Map([...r.placed].map(([k, v]) => [k, [v.a, v.b] as [Vec3, Vec3]]));
  const turns: number[] = [];
  if (anchorOn) {
    for (const l of links) {
      const s = segs.get(l.id), t = segs.get(l.ofId);
      if (!s || !t) continue;
      const out = anchorToTarget(s, t, l.at, "endpoint", ctx, keepDir);
      if (!out) continue;
      segs.set(l.id, out.seg); segs.set(l.ofId, out.target);
      turns.push(out.turnDeg);
    }
  }
  const G = Math.max(...[...segs.values()].flat().map(p => norm3(p)), 1e-9);
  const gaps = links.filter(l => segs.has(l.id) && segs.has(l.ofId))
                    .map(l => pairGap(segs.get(l.id)!, segs.get(l.ofId)!) / G);
  return {
    declared: declaredOn, anchor: anchorOn, keep_dir: keepDir, grade, seed,
    placed: r.placed.size, total: strokes.length,
    /** 이 팔이 측정한 연결 수 — 분모다(#11). 놓인 짝만 잰다 */
    links_measured: gaps.length, links_total: links.length,
    gap_rel: stat(gaps, 6),
    turn_deg: turns.length ? stat(turns, 4) : null,
    unplaced_reasons: r.unplaced.map(u => u.reason),
  };
}

/**
 * **소실점 후보 문의 노출**(D-L99 · 2차 리뷰어 [3]) — 완화가 **무엇을 더 받게 됐는가**.
 *
 * 각 기하마다 `unambiguous` false(옛 문) ↔ true(완화)의 판정을 짝으로 낸다.
 * ⚠ **이 표가 D-L99를 받은 근거의 채널이다**: "새 종류가 아니라 도달 범위의 확장"이
 * 참인지는 `opened`(false → true로 바뀐 행)와 그 행의 의도(소실점인가 꼭짓점인가)로 읽는다.
 */
function poolGateExposure() {
  const SZP: [number, number] = [1280, 675];
  const rows: { name: string; intent: "vp" | "corner"; off: boolean; on: boolean;
                at: [number, number] | null }[] = [];
  // ⛔ **`resolvePool` 갈래를 은퇴시켰다**(2026-08-20 18차 지시 a) — 대기 규칙이 폐기됐다.
  // 재던 것은 «선언 아래서 두 문(이음점·`beyondSegment`)을 푸는가»였고, 새 절차에는
  // 그 문도 그 선언도 없다(소실점 = 선 × 지평선). 사용자 보고의 재현은
  // `vp_rules.test.ts`의 «끝점을 공유해도 선다»가 이어받았다.
  const put = (name: string, intent: "vp" | "corner", _pool: RLine[]) => {
    rows.push({ name, intent, off: false, on: false, at: null });
  };
  const V: [number, number] = [1050, 250];
  put("꼭짓점 방사(사용자 보고 ①의 형태)", "vp",
      [{ a: V, b: [420, 470] }, { a: V, b: [500, 180] }]);
  const apex: [number, number] = [330, 290];
  put("닫힌 삼각형(사용자 보고 ②′)", "vp",
      [{ a: apex, b: [700, 420] }, { a: [1040, 420], b: apex }]);
  put("서로 다른 축의 모서리 꼭짓점(완화의 대가)", "corner",
      [{ a: [640, 340], b: [300, 300] }, { a: [640, 340], b: [980, 300] }]);
  put("몸통 교차", "corner",
      [{ a: [300, 200], b: [900, 500] }, { a: [300, 500], b: [900, 200] }]);
  put("T자 접합", "corner",
      [{ a: [300, 400], b: [900, 400] }, { a: [600, 400], b: [640, 180] }]);
  put("나란함", "corner",
      [{ a: [300, 300], b: [900, 400] }, { a: [300, 380], b: [900, 480] }]);
  return {
    rows,
    /** 완화가 **새로 받는** 행 — 이것이 노출의 크기다(분자) */
    opened: rows.filter(r => !r.off && r.on).map(r => r.name),
    opened_intended_vp: rows.filter(r => !r.off && r.on && r.intent === "vp").length,
    opened_corner: rows.filter(r => !r.off && r.on && r.intent === "corner").length,
    /** 분모 — 검사한 기하 수(#11) */
    n: rows.length,
    what_this_says: "완화가 새로 받는 기하 중 **의도가 소실점인 것**과 **꼭짓점인 것**의 수. "
      + "꼭짓점 몫이 0이 아니면 그것이 D-L3(#23)의 실패로 가는 문이고, 그 문이 열리는 조건은 "
      + "**선언이 틀린 것**이다(D-L96의 물음 — DEFERRED). ⚠ 여섯 기하는 **손으로 고른 것**이고 "
      + "실사용 분포가 아니다(#12) — 이 표가 재는 것은 **문이 열리는가**이지 빈도가 아니다.",
  };
}

describe("확정 순간의 연결 (D-L98) — 원장", () => {
  const NO_SESSIONS = skipReason("sessions");

  it("실획의 `rep` 어긋남과 합성 사슬 네 팔을 원장에 남긴다", () => {
    const GRADES = ["precise", "medium", "coarse"] as const;
    const SEEDS = [7, 11, 23, 41, 59];
    const arms: ReturnType<typeof arm>[] = [];
    for (const g of GRADES) for (const sd of SEEDS) for (const d of [false, true]) {
      arms.push(arm(d, false, g, sd));
      // **되맞춤 팔은 방향 보존 on/off 둘 다 낸다** — `keep_dir: false`가 초판이고,
      // 그 팔의 `turn_deg`가 "방향을 물려야 하는가"의 근거다(#30: 옛 판이 도달 가능하다)
      arms.push(arm(d, true, g, sd, false));
      arms.push(arm(d, true, g, sd, true));
    }
    const off = arms.filter(x => !x.declared && !x.anchor);
    const on = arms.filter(x => x.declared && x.anchor && x.keep_dir);
    const noKeep = arms.filter(x => x.anchor && !x.keep_dir);
    // **(b) 단독의 되살림 팔**(1차 리뷰어 [4]) — 선언 제약은 켜고 되맞춤만 끈 팔이다.
    // `off`는 (a)+(b)가 섞여 있어 (b)의 크기가 아니다
    const bOnly = arms.filter(x => x.declared && !x.anchor);
    // ⚠ **관측 0건 팔을 0으로 세지 않는다**(#36·#11 — 1차 리뷰어 [5]):
    // `links_measured === 0`이면 그 팔에는 잴 연결이 없다(놓인 것이 없어서다)
    const gapMax = (xs: ReturnType<typeof arm>[]) =>
      stat(xs.filter(a => a.links_measured > 0)
             .map(a => a.gap_rel.max as number), 6);
    const gapUnmeasured = (xs: ReturnType<typeof arm>[]) => xs.filter(a => a.links_measured === 0).length;

    const ink = NO_SESSIONS ? null : repOffsets();
    const offs = ink ? ink.rows.flatMap(r => [r.start, r.end]) : [];
    const startOffs = ink ? ink.rows.map(r => r.start) : [];

    const led = {
      what: "확정 순간 붙여 그은 두 획이 떨어지는가 — 조건(rep 어긋남)과 크기(연결 간격).",
      how: {
        real_ink: "sessions/의 실획 획마다 |rep 끝 − 그린 끝|(px). 두 점 획은 정의상 0이라 뺀다.",
        chain: "상자 모서리 셋(축 0·1·2)을 프리핸드로 긋고 오스냅처럼 시작점을 이은 사슬. "
             + "팔은 선언 제약(DeclaredJoint) on/off × 되맞춤(anchorToTarget) on/off.",
        unit: "간격은 **두 획의 그 끝 사이 3D 거리 ÷ 기하 크기**다(#49 — 연결이 쓰는 단위). "
            + "`residual`(깊이 불일치)이 아니다.",
        aperture_px: OSNAP_RADIUS_PX,
        touch_ratio: LIFT_TOL.touch_ratio,
      },
      selfcheck_notes: {
        zeros: "`chain_arms[*].gap_rel`·`turn_deg`와 `summary.on_*`의 **분포 전체가 0** 플래그는 "
          + "전부 **설계 보장**이다(#5): 되맞춤은 두 끝을 같은 점으로 **모으는 연산**이라 그 뒤 "
          + "간격이 0이고, `keepDir`는 방향을 앵커에 **물리는 연산**이라 그 뒤 회전이 0이다. "
          + "**임계를 안 건다** — 판정은 끈 팔(`off_placed`·`b_only_gap_rel_max`·"
          + "`no_keepdir_turn_deg_max`)이 든다.",
        who_moves_them: "코드를 틀리게 하면 움직인다(#46의 판별법): `anchorToTarget`이 "
          + "`at3` 대신 원래 끝점을 두면 `gap_rel`이 `b_only` 값으로 돌아가고, `keepDir`를 "
          + "false로 두면 `turn_deg`가 `no_keepdir` 분포가 된다 — 그 두 팔이 원장에 있다.",
      },
      what_this_does_not_say: [
        "수리 후 팔의 간격 0은 **설계 보장**이다(#5) — 두 끝을 같은 점으로 모으는 연산이다. "
        + "임계를 걸지 않는다. 판정은 off 팔의 값이 든다.",
        "실획 표본 셋은 12차 수리 이전에 그려졌다 — 여기서 쓰는 것은 **획 형태**(rep 어긋남)뿐이고 "
        + "그 값은 수리와 무관하다.",
        "합성 사슬은 획 셋·한 카메라다. 획 수·구도가 늘 때의 거동은 안 잰다(#12).",
        "실획 표본에는 이 사슬에 대응하는 snap2d 기록이 거의 없다 — 선언 제약의 **효과**를 "
        + "실획에서 잰 것이 아니라 **조건**만 실획에서 잰 것이다.",
      ],
      real_ink_rep_offset: ink ? {
        /** **분모**(#11 · 1차 리뷰어 [8]) — 재는 것은 점열이 셋 이상인 획뿐이다 */
        n_strokes: ink.rows.length,
        n_strokes_all: ink.total,
        n_excluded_two_point: ink.total - ink.rows.length,
        excluded_why: "점열이 두 점인 획은 `representative`가 그 두 점을 정확히 지나 "
          + "어긋남이 **정의상 0**이다(방향·끝점 스냅이 걸려 `resolve2dCore`가 `pts = [a, b]`를 "
          + "낸 획). 그 획들은 이 결함의 대상이 아니다 — **모집단은 원시 점열이 남은 획**이다.",
        px: stat(offs, 3),
        start_px: stat(startOffs, 3),
        over_aperture_start: startOffs.filter(v => v > OSNAP_RADIUS_PX).length,
        rows: ink.rows,
      } : { skipped: NO_SESSIONS },
      chain_arms: arms,
      /**
       * **(a)의 기전 크기** — 그린 연결점과 두 대표 직선의 교점 사이 거리(px)가
       * 접합 반경(`tol_px`)을 넘으면 `findJoints`가 그 접합을 못 잡는다.
       * ⚠ 이것이 "붙여 그은 획이 구조에서 떨어진다"의 **유일한 크기**다(1차 리뷰어 [6]①).
       */
      pool_gate_exposure: poolGateExposure(),
      rep_intersect_offset: (() => {
        // **모집단은 전 15구성이다**(2차 리뷰어 [4]) — 등급 3 × 시드 5. 초판은 다섯만 담고
        // 그 선정 기준을 안 적었다
        const all = GRADES.flatMap(g => SEEDS.map(sd =>
          ({ grade: g, seed: sd, ...repIntersectOffsets(g, sd) })));
        const vals = all.flatMap(f => f.rows.map(r => r.offset_px));
        const tol = all[0].tol_px;
        return {
          tol_px: tol,
          by_fixture: all,
          px: stat(vals, 3),
          /** **분자/분모**(#11·#8) — 반경을 넘는 접합이 몇/몇인가. "넘는다"는 꼬리다 */
          over_tol: vals.filter(v => v > tol).length,
          n: vals.length,
        };
      })(),
      summary: {
        off_placed: stat(off.map(a => a.placed), 3),
        on_placed: stat(on.map(a => a.placed), 3),
        /** ⚠ `off`는 **(a)+(b)가 섞인** 팔이다 — (b) 단독은 `b_only_gap_rel_max`다 */
        off_gap_rel_max: gapMax(off),
        off_arms_unmeasured: gapUnmeasured(off),
        /** **(b) 단독**(선언 제약 켬 · 되맞춤 끔) — 이것이 (b)의 크기다 */
        b_only_gap_rel_max: gapMax(bOnly),
        b_only_arms_unmeasured: gapUnmeasured(bOnly),
        on_gap_rel_max: gapMax(on),
        on_turn_deg_max: stat(on.flatMap(a => (a.turn_deg?.max != null ? [a.turn_deg.max] : [])), 4),
        /** **초판(방향 미보존)의 회전** — 이 값이 방향을 물린 근거다. 나란함 임계는 5°다 */
        no_keepdir_turn_deg_max:
          stat(noKeep.flatMap(a => (a.turn_deg?.max != null ? [a.turn_deg.max] : [])), 4),
        parallel_deg: LIFT_TOL.parallel_deg,
        arms_total: arms.length,
        no_keepdir_arms_unmeasured:
          noKeep.filter(a => a.turn_deg == null || a.turn_deg.max == null).length,
        /**
         * **요약이 안 덮는 팔**(2차 리뷰어 [10]) — 여섯 구성 중 `declared=false·anchor=true`
         * 15팔은 어느 요약 필드에도 안 든다(선언 없이 되맞춤만 — 이 항목의 물음에 대응하는
         * 이름이 없다). 값은 `chain_arms`에 있다.
         */
        arms_not_summarised: arms.filter(a => !a.declared && a.anchor && a.keep_dir).length,
      },
      /**
       * **도달 가능성**(#40) — 끈 팔이 실제로 결함을 내는가. 값은 이 실행이 정한다.
       */
      gate: {
        registered: "확정 순간 붙여 그은 두 획이 붙어 있는가. 판정은 **끈 팔의 값**이 든다 — "
          + "켠 팔의 0은 설계 보장이라(#5) 임계를 안 건다.",
        reachability: "끈 팔이 결함을 낸다: (a)는 `summary.off_placed.min`이 3 미만이고 "
          + "(b)는 `summary.b_only_gap_rel_max.max`가 0보다 크다. 그 둘이 0/3이면 "
          + "이 원장은 아무것도 안 말한다.",
        reachability_value: null as number | null,
        reachability_source: "summary/b_only_gap_rel_max/max",
        result: {} as Record<string, unknown>,
      },
      pitfall_citations: [5, 11, 12, 17, 21, 25, 30, 32, 36, 40, 43, 47, 49],
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    led.gate.reachability_value = led.summary.b_only_gap_rel_max.max;
    led.gate.result = {
      a_off_placed_min: led.summary.off_placed.min,
      b_only_gap_rel_max: led.summary.b_only_gap_rel_max.max,
      on_gap_rel_max: led.summary.on_gap_rel_max.max,
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "confirm_link.json"), JSON.stringify(led, null, 1));

    // **도달 가능성**(#40) — off 팔이 결함을 실제로 낸다
    expect(led.summary.b_only_gap_rel_max.max).toBeGreaterThan(0);
    expect(led.summary.off_placed.min).toBeLessThan(3);
    expect(led.summary.on_gap_rel_max.max).toBeLessThan(1e-9);
    // 방향 보존 팔은 회전 0(보장 — #5)이고, 초판 팔은 0이 아니다(도달 가능성 — #40)
    expect(led.summary.on_turn_deg_max.max).toBeLessThan(1e-9);
    expect(led.summary.no_keepdir_turn_deg_max.max).toBeGreaterThan(0);
  });
});
