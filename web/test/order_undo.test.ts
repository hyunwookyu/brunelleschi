// L-C.2 **되돌리기 UI** — 산출: `stage0/out/order_undo.json`. 계획서 §6.2.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호는 `progress.md`의 L-C.2 절에 적었다.
//
// ---------------------------------------------------------------- 무엇을 재는가
//
// §6.2는 "사용자가 즉시 보고 **1점으로 되돌리기**를 누른다. 임계를 정교하게 만드는 것보다
// 싸다"이다. 그 문장이 성립하려면 **둘**이 필요하다:
//
//   ① 되돌릴 것이 있다는 것을 **본다**  ② 되돌리면 **정말 되돌아간다**
//
// ①은 개수의 문제다 — 승격이 실제로 무엇을 잃는지 재고, 그 수가 0이면 이 UI는
// 아무것도 안 보이는 것이므로 **그 사실을 적어야 한다.**
// ②는 **설계 보장**이다(CLAUDE.md §5.1 자기참조 유형 3) — 스냅샷을 되돌리고 그 스냅샷과
// 비교하는 것이라 **임계를 안 건다.** 대신 **양성 채널**(#30)로 대조가 눈뜬 것임을 보인다.
//
// ⚠ **잃은 것을 뺄셈으로 만들지 않는다**(#10). `dropped`는 "전 개수 − 후 개수"가 아니라
// **전에 있고 후에 없는 id를 직접 모은 것**이다. 뺄셈은 **어느 획인지**를 잃고,
// 화면에 표시하려면 바로 그 id가 필요하다.
//
// ⚠ **앱과 같은 함수를 부른다**(#17) — `diffPlacement`·`takeSnap`·`applySnap`·`snapDiff`가
// `src/`에 있고 앱이 그것을 부른다. 하네스가 자기 판을 다시 짜면 다른 것을 재게 된다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promoteOrder, orderOf, type OrderStroke } from "../src/s3d/promoteOrder.js";
import { diffPlacement } from "../src/s3d/promoteDiff.js";
import { takeSnap, applySnap, snapDiff } from "../src/ui/appSnap.js";
import { newDoc, newSStroke, resetDocSeq, type DocState } from "../src/ui/doc.js";
import { CamState } from "../src/ui/camState.js";
import { setRules, vpSlot, screenSlot } from "./ruleFixture.js";
import { liftAll, LIFT_TOL, type LiftStroke, type LiftCtx, type LiftSeg } from "../src/s3d/lift.js";
import { classifyStroke, type Axis } from "../src/s3d/axis.js";
import { snapCandidates, staticCandidates, type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { norm3, sub3 } from "../src/s3d/geom3d.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { scene, boxEdges, drawEdges, groundPoint, stat, round,
         type Scene, type TrueEdge } from "./scene3d.js";
import { metricsSnapshot } from "./metrics.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");

const SZ: [number, number] = [960, 672];
const GRADES: InkGrade[] = ["precise", "medium", "coarse"];
const SEEDS = [1, 2, 3, 4, 5, 6];
const JITTERS = [0, 0.01, 0.03, 0.05];

/** 구도·시드 산식은 `order_promote`와 **같다**(#27 — 다른 픽스처의 수를 나란히 읽지 않는다). */
const TRUE_3PT = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
];

const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface Fx { sc: Scene; edges: TrueEdge[]; strokes: OrderStroke[]; diag: number }

function fixture(C: typeof TRUE_3PT[number], grade: InkGrade, seed: number, jit: number): Fx | null {
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  const edges = boxEdges(sc, O, C.box[0], C.box[1], C.box[2]);
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const pts = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of pts) for (const q of pts) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, edges, diag,
           strokes: drawn.map((e, i) => ({ id: `s${i}`, pts2d: e.pts2d as Pt2[],
                                           axis: "free" as Axis, userAxis: false, snapStart: null })) };
}

/** 시작점을 이웃 획에 붙인다 — **안 붙이면 "스냅이 끊긴다"를 잴 대상이 없다.** */
function attachSnaps(fx: Fx, placed: Map<string, LiftSeg>): number {
  const segs: SnapSeg[] = [...placed].map(([id, s]) => ({ id, a: s.a, b: s.b }));
  if (!segs.length) return 0;
  const sctx: SnapCtx = { principal: fx.sc.principal, f: fx.sc.f, imgSize: SZ,
                          ground: null, from: null };
  const pre = staticCandidates(segs);
  let n = 0;
  for (const s of fx.strokes) {
    const own = segs.filter(g => g.id !== s.id);
    if (!own.length) continue;
    const c = snapCandidates(s.pts2d[0], own, sctx,
                             {}, pre.filter(x => x.ofId !== s.id && x.ofId2 !== s.id))[0];
    if (!c) continue;
    s.snapStart = { kind: c.kind, at: c.at, ofId: c.ofId };
    s.pts2d = [[c.screen[0], c.screen[1]], ...s.pts2d.slice(1)];
    n += 1;
  }
  return n;
}

describe("L-C.2 — 승격이 잃은 것이 보이는가, 되돌리기가 되돌리는가", () => {
  it("측정을 원장에 남긴다", () => {
    // ---- ① 잃은 것의 규모. **id 집합으로 직접 센다**(#10)
    const perScene = { dropped: [] as number[], gained: [] as number[], snapLost: [] as number[] };
    let scenes = 0, scenesWithLoss = 0, scenesWithSnapLoss = 0;
    let droppedTotal = 0, gainedTotal = 0, snapLostTotal = 0, snapHadTotal = 0;
    let reanchoredTotal = 0;
    /**
     * **id 집합과 개수가 어긋나지 않는가** — 직접 모은 집합과 카운터를 대조한다(#33: 값 대조).
     * 술어를 이름 붙여 둔다 — **같은 술어에 어긋난 쌍을 넣어** 발화를 보이기 위해서다.
     */
    const mismatched = (setLen: number, counter: number) => setLen !== counter;
    let countMismatch = 0;
    /** 구도별(#9 — 무엇이 섞였는지 먼저 가른다). */
    const byComp: Record<string, { n: number; dropped: number; snapLost: number }> = {};

    for (const C of TRUE_3PT) for (const grade of GRADES) for (const seed of SEEDS) {
      for (const jit of JITTERS) {
        const fx = fixture(C, grade, seed, jit);
        if (!fx) continue;
        const truth = trueVps(fx.sc);
        const before: (Pt2 | null)[] = [truth[0], truth[1], null];
        const ctxB: LiftCtx = { principal: fx.sc.principal, f: fx.sc.f, vps: before, imgSize: SZ };
        const ctxA: LiftCtx = { principal: fx.sc.principal, f: fx.sc.f, vps: truth, imgSize: SZ };
        const inB: LiftStroke[] = fx.strokes.map(s => ({
          id: s.id, pts2d: s.pts2d,
          axis: classifyStroke(s.pts2d, before, SZ, {},
                               { principal: fx.sc.principal, f: fx.sc.f }).axis,
        }));
        const rB = liftAll(inB, ctxB, { touch_ratio: LIFT_TOL.touch_ratio });
        attachSnaps(fx, rB.placed);
        const placedBefore = new Map(fx.strokes.map(s => [s.id, rB.placed.has(s.id)]));
        const pr = promoteOrder(fx.strokes, ctxA, {});
        const placedAfter = new Map(fx.strokes.map(s => [s.id, pr.placed.has(s.id)]));
        // **앱이 부르는 그 함수다**(#17)
        const d = diffPlacement(placedBefore, placedAfter);

        scenes += 1;
        perScene.dropped.push(d.dropped.length);
        perScene.gained.push(d.gained.length);
        perScene.snapLost.push(pr.snap.lost_ids.length);
        droppedTotal += d.dropped.length; gainedTotal += d.gained.length;
        snapLostTotal += pr.snap.lost_ids.length;
        snapHadTotal += pr.snap.had; reanchoredTotal += pr.snap.reanchored;
        if (d.dropped.length) scenesWithLoss += 1;
        if (pr.snap.lost_ids.length) scenesWithSnapLoss += 1;
        // **값 대조**(#33) — 직접 모은 집합과 카운터가 같은 수인지. 갈리면 하나가 거짓말이다
        if (mismatched(pr.snap.lost_ids.length,
                       pr.snap.target_unplaced + pr.snap.behind_camera)) countMismatch += 1;
        if (mismatched(pr.snap.reanchored_ids.length, pr.snap.reanchored)) countMismatch += 1;
        const b = (byComp[C.name] ??= { n: 0, dropped: 0, snapLost: 0 });
        b.n += 1; b.dropped += d.dropped.length; b.snapLost += pr.snap.lost_ids.length;
      }
    }

    // ---- ② 되돌리기 왕복. **설계 보장이다** — 임계를 안 건다(#5)
    resetDocSeq();
    const cam = new CamState(SZ);
    // **규칙 상태로 세운다** — 가이드가 없어졌다(2026-08-16). 2점 투시: 수평 소실점 둘 + 화면 세로
    setRules(cam, [vpSlot([-1400, 330]), vpSlot([2100, 330]), screenSlot("v")]);
    cam.locked = true;
    let doc: DocState = newDoc();
    for (let i = 0; i < 6; i++) {
      const s = newSStroke([[100 + i * 30, 200], [200 + i * 30, 260]], doc.currentView);
      s.seg3d = [[i, 0, 0], [i + 1, 0.5, 0.2]];
      s.snapStart = { kind: "endpoint", at: [i, 0, 0], ofId: `x${i}` };
      doc.strokes.push(s);
    }
    const snap0 = takeSnap(doc, cam, 2);

    // **승격을 흉내 낸다**: 수직축이 무한원에서 **유한 소실점**으로 바뀌고(3점), 기하가 다시 풀리고,
    // **스냅된 시작점이 새 상으로 옮겨진다**(그것이 L-C.1이 p90 311px로 실측한 그 이동이다)
    setRules(cam, [vpSlot([-1400, 330]), vpSlot([2100, 330]), vpSlot([480, -2600])]);
    for (let i = 0; i < doc.strokes.length; i++) {
      const s = doc.strokes[i];
      s.seg3d = i % 3 === 0 ? null : [[i * 2, 1, 1], [i * 2 + 1, 1.5, 1.2]];
      s.pts2d = [[s.pts2d[0][0] + 37, s.pts2d[0][1] - 12], ...s.pts2d.slice(1)];
    }
    const snapPromoted = takeSnap(doc, cam, 3);

    doc = applySnap(cam, snap0);
    const roundTrip = snapDiff(takeSnap(doc, cam, snap0.lockedOrder), snap0);

    // **양성 채널**(#30) — 대조가 눈뜬 것인가. 왕복이 비는 것만으로는
    // "언제나 빈 배열을 내는 함수"와 구분되지 않는다.
    // ⚠ 초판은 `snapDiff(snap0, snapPromoted)`도 따로 냈는데 **같은 계산의 중복**이라
    // 두 증거처럼 읽혔다(리뷰어 [11]). 하나만 낸다
    const positive = snapDiff(takeSnap(doc, cam, snap0.lockedOrder), snapPromoted);

    // ---- **왕복을 여러 번 돌린다**(리뷰어 [10] — n이 없으면 보장의 범위가 없다).
    // 어긴 방식을 바꿔 가며 돈다: 가이드만 · 기하만 · 시작점만 · 잠금만 · 전부
    const breakers: { name: string; f: (d: DocState, c: CamState) => void }[] = [
      { name: "vp_moved", f: (_d, c) => {
          setRules(c, [vpSlot([-900, 300]), vpSlot([2100, 330]), screenSlot("v")]); } },
      { name: "vp_added", f: (_d, c) => {
          setRules(c, [vpSlot([-1400, 330]), vpSlot([2100, 330]), vpSlot([480, -2600])]); } },
      { name: "seg3d_null", f: (d) => { d.strokes[1].seg3d = null; } },
      { name: "seg3d_move", f: (d) => { d.strokes[2].seg3d = [[9, 9, 9], [8, 8, 8]]; } },
      { name: "pts2d", f: (d) => { d.strokes[3].pts2d = [[1, 1], ...d.strokes[3].pts2d.slice(1)]; } },
      { name: "snapStart", f: (d) => { d.strokes[4].snapStart = null; } },
      { name: "locked", f: (_d, c) => { c.locked = false; } },
      { name: "all", f: (d, c) => { c.locked = false; setRules(c, [vpSlot([-1400, 330]), null, null]);
                                    d.strokes.forEach(s => { s.seg3d = null; }); } },
    ];
    const trials = breakers.map(b => {
      const base = takeSnap(doc, cam, snap0.lockedOrder);
      b.f(doc, cam);
      // **어긴 것이 실제로 대조에 잡히는가** — 안 잡히면 그 왕복은 아무것도 안 지킨 것이다
      const broke = snapDiff(takeSnap(doc, cam, snap0.lockedOrder), base);
      doc = applySnap(cam, base);
      const back = snapDiff(takeSnap(doc, cam, base.lockedOrder), base);
      return { breaker: b.name, detected: broke.length, restored: back.length === 0 };
    });

    const doc2 = {
      what: "L-C.2 — 승격이 잃은 것이 보이는가(개수), 그리고 되돌리기가 되돌리는가(보장)",
      why: "§6.2는 '사용자가 즉시 보고 되돌린다'이다. **지금은** 표시와 되돌리기가 판정 수단이고 "
        + "그러려면 잃은 것이 보여야 한다. ⚠ **'유일한'이라 적으면 안 된다**(L-C.2 리뷰어 [8]) — "
        + "AS-L6이 반증한 것은 **재투영 잔차 하나**이고, 계획서 §6.2는 대체 후보 둘"
        + "(획별 `tiltDeg` · 소실점 삼각형 f² 편차)을 **시험하라**고 적었다. AS-L6 자신이 "
        + "`tiltDeg`가 '끝점 오차 0.03에서 중앙 2.06°로 **실제로 움직인다**'고 기록해 두었다. "
        + "그 시험이 **L-C.3**이고 아직 안 했다. "
        + "L-C.1이 이 UI의 필요를 측정으로 뒷받침했다 — 승격은 품질을 올리고 **배치를 −168 줄인다**.",
      method: {
        loss: "`order_promote`와 **같은 픽스처·같은 산식**으로 승격을 돌리고, "
          + "**앱이 부르는 `diffPlacement`**로 전후 배치를 짝지어 `dropped`·`gained`를 낸다(#17). "
          + "`snap_lost`는 `promoteOrder`가 **직접 모은 id 집합**이다(#10).",
        undo: "**설계 보장**이다(#5·자기참조 유형 3) — `takeSnap` → 상태를 어긴다 → `applySnap` → "
          + "`snapDiff`가 비는지. 스냅샷을 되돌리고 그 스냅샷과 비교하는 것이므로 "
          + "**측정이 아니고 임계를 안 건다.** 값은 **양성 채널**에 있다.",
        positive_channel: "같은 대조를 **다른 상태**(승격 후)에 걸어 그 자리를 이름으로 짚는지 본다. "
          + "안 짚으면 왕복 통과는 '언제나 빈 배열'과 구분되지 않는다.",
      },
      conditions: {
        compositions: TRUE_3PT.map(c => c.name), grades: GRADES, seeds: SEEDS,
        end_jitters: JITTERS, skew: 0.12, canvas_px: SZ,
        camera: "**참 소실점**을 넣고 뺀다 — 검출·조정 오차는 여기서 안 잰다.",
      },
      // ---- ① 사용자가 보게 될 것
      visible_loss: {
        note: "**이 수가 0이면 이 UI는 아무것도 안 보인다.** 그 사실이 판정이다(사전 등록 ②). "
          + "`dropped`는 3D였다가 2D 대기로 내려온 획이고 **실패가 아니라 대기**다(§9.1) — "
          + "표시의 문구도 그렇게 적었다.",
        scenes,
        scenes_with_dropped: `${scenesWithLoss}/${scenes}`,
        scenes_with_snap_lost: `${scenesWithSnapLoss}/${scenes}`,
        dropped_total: droppedTotal, gained_total: gainedTotal,
        placed_delta: gainedTotal - droppedTotal,
        dropped_per_scene: stat(perScene.dropped, 2),
        gained_per_scene: stat(perScene.gained, 2),
        snap_lost_per_scene: stat(perScene.snapLost, 2),
        snap: { had: snapHadTotal, reanchored: reanchoredTotal, lost: snapLostTotal,
                lost_rate: round(snapLostTotal / Math.max(1, snapHadTotal), 4) },
        by_composition: Object.fromEntries(Object.entries(byComp).map(([k, v]) => [k, {
          scenes: v.n, dropped: v.dropped, snap_lost: v.snapLost,
        }])),
        // **집합과 카운터가 같은 수인가**(#33 — 문법이 아니라 값으로 대조한다)
        set_vs_counter_mismatch: countMismatch,
        set_vs_counter_checks: scenes * 2,
        // ⚠ **0인 카운터는 "안 돈 것"과 구분이 안 된다**(selfcheck가 정확히 그렇게 플래그한다).
        // **같은 술어**에 어긋난 쌍을 넣어 발화하는지 보인다(#30의 양성 채널과 같은 형태)
        set_vs_counter_probe_fires: mismatched(3, 4),
        cross_check: "⚠ **`order_promote.json`의 스냅 수와 다르게 보이는 것이 정상이다** — "
          + "그쪽 `snap_reanchor`는 **가짜 승격 대조군까지 합산**한 값이고(참 2점 구도 72장면이 더 있다) "
          + "여기는 **참 3점 216장면만**이다(#11). "
          + "⚠ `placed_delta`가 양쪽에서 **−168**로 같은 것은 **#33(값 대조)이 아니다** — "
          + "같은 픽스처·같은 산식이라 그냥 결정성이다(L-C.2 리뷰어 [6]). "
          + "여기서 실제로 확인되는 것은 **#17**이다: 짝짓기를 **앱이 부르는 `diffPlacement`**로 하는데도 "
          + "하네스가 직접 짝지은 `order_promote`와 같은 수가 나온다 — 앱 경로와 측정 경로가 안 갈렸다.",
      },
      // ---- ② 되돌리기
      undo_roundtrip: {
        note: "⚠ **설계 보장이지 측정이 아니다**(CLAUDE.md §5.1 자기참조 유형 3). "
          + "**임계를 걸지 않는다.** 아래 `positive_channel`이 이 대조가 눈뜬 것임을 보인다.",
        guarantee: "왕복 뒤 `snapDiff`가 빈다",
        // ⚠ **보장의 범위는 스냅샷이 담은 필드까지다**(리뷰어 [9]).
        // `takeSnap`이 안 담는 필드는 `snapDiff`도 못 보므로 양성 채널도 못 본다 —
        // L-C.1이 실제로 잡힌 결함이 정확히 그 형태였다(문서만 담고 카메라를 안 담았다)
        covers: {
          note: "**담는 것**과 **담지 않아도 되는 것**을 나눠 적는다. 후자는 사유를 함께 적는다 — "
            + "사유 없이 빠진 것이 초판의 결함이었다.",
          // ⚠ **`Stroke`의 여덟 필드를 전부 분류한다**(2회차 리뷰어). 초판은 넷만 적었고
          // 빠진 것 중 `color`는 PITFALLS #18의 표본이다 — 열거가 새면 대응도 샌다
          held: ["doc.strokes.id", "doc.strokes.pts2d", "doc.strokes.seg3d", "doc.strokes.axis",
                 "doc.strokes.userAxis", "doc.strokes.snapStart", "doc.strokes.viewRef",
                 "doc.strokes.color", "doc.strokes.width",
                 "doc.views", "doc.currentView", "cam.guides", "cam.locked", "lockedOrder",
                 "promoteReport"],
          held_but_not_compared: {
            fields: ["id(순서로만 본다)", "userAxis", "viewRef", "color", "width"],
            why: "⚠ **`takeSnap`은 `{...s}`로 전부 담지만 `snapDiff`는 이 다섯을 안 본다.** "
              + "담기므로 **복원은 된다** — 못 보는 것은 *복원 실패를 잡는 능력*이다. "
              + "지금 승격·되돌리기 경로가 이 다섯을 안 건드리므로 대조에 넣을 이유가 없었고, "
              + "**건드리게 되면 그때 넣어야 한다.** `Stroke.layer`는 `SStroke`에 아예 없다 "
              + "(#18이 잡은 그 필드이고 L 전환에서 빠졌다).",
          },
          derived_not_held: {
            fields: ["cam.acc", "vps", "principal", "f", "fSource", "order"],
            why: "**가이드에서 파생된다** — `CamState.apply()`가 **`guides`만으로** "
              + "`acc.setLines(axis, ...)`를 다시 부르고 `vps()`/`ctx()`가 그 해에서 나온다. "
              + "누산기에 들어가는 선은 `byAxis(this.guides)`가 유일한 출처다(획은 안 들어간다 — "
              + "확정 뒤에는 획이 소실점을 안 바꾼다, CLAUDE.md §1). "
              + "⚠ **브라우저 확인은 `revert_by_order` 경로 하나뿐이다**(2회차 리뷰어) — "
              + "일반 `실행취소` 경로는 이 픽스처에서 가이드가 안 바뀌어(6 → 6) "
              + "파생 복원을 시험하지 않는다. `trials`의 `guides`·`guides_add`가 그 자리를 "
              + "노드에서 덮지만 **앱 경로의 확인은 한 경로뿐**이다.",
          },
          transient_not_held: {
            fields: ["tool", "axisLock", "hoverSnap", "live", "note"],
            why: "**그리는 중의 상태**라 되돌리기의 대상이 아니다(SketchUp도 안 되돌린다, A-3). "
              + "다음 포인터 이벤트가 전부 다시 만든다.",
          },
          stage_pose: "`stage`의 자세는 `doc.views[].pose`가 들고 있으므로 문서에 있다. "
            + "다만 **지금 보고 있는 자세**(`stage.pose()`)는 `doc.currentView`가 정하고 "
            + "`restoreSnap`이 확정 시점으로 되돌린다 — 그것이 §6.2가 요구하는 동작이다.",
        },
        trials: {
          note: "**왕복을 여러 번 돌린다**(리뷰어 [10]). 어긴 방식을 바꿔 가며 돌고, "
            + "매번 **어긴 것이 대조에 잡히는지**(`detected > 0`)를 먼저 본다 — "
            + "안 잡히면 그 왕복은 아무것도 안 지킨 것이다. "
            + "⚠ **개별 일곱은 각각 1이고 `all`은 8이다** — 합(7)이 아니다(2회차 리뷰어). "
            + "`all`은 `locked`(1) + `guides.length`(1) + **획 여섯의 `seg3d.presence`**(6)를 "
            + "함께 어기기 때문이다. 개별 `seg3d_null`은 획 **하나**만 비운다.",
          n: trials.length,
          rows: trials,
          all_detected: trials.every(t => t.detected > 0),
          all_restored: trials.every(t => t.restored),
        },
        round_trip_diff: roundTrip,
        round_trip_empty: roundTrip.length === 0,
        positive_channel: {
          note: "같은 대조를 승격 **후** 상태에 걸었다. 여기가 비면 대조가 눈이 먼 것이고 "
            + "그러면 위의 통과는 아무 뜻이 없다(#30).",
          diff_len: positive.length,
          names_all: positive,
          // **`pts2d`를 실제로 본다**(#34) — 승격이 스냅된 시작점을 옮기므로,
          // 이것이 안 잡히면 '되돌렸다'가 시작점만 새 자리에 남은 상태를 통과시킨다
          sees_pts2d: positive.some(x => x.includes("pts2d")),
          // **카메라도 본다** — 옛 이름은 `guides`였고 지금은 규칙 슬롯이다(2026-08-16 전면 교체).
          // 이름만 바꾼 것이 아니라 **보는 대상이 소실점 자체**가 됐다
          sees_rules: positive.some(x => x.startsWith("rules")),
          sees_seg3d: positive.some(x => x.includes("seg3d")),
          sees_locked_order: positive.includes("lockedOrder"),
        },
        camera_included: {
          note: "⚠ **초판의 `실행취소`는 문서만 되돌렸다.** 승격을 되돌리면 기하는 옛 해로 "
            + "돌아가는데 소실점은 새 것 그대로 남아 §6.1이 금지한 **좌표계가 섞인 상태**가 된다. "
            + "화면은 그럴듯해서 아무도 못 본다. `appSnap`이 둘을 함께 담는다.",
          axes_restored: cam.rules.slots.filter(Boolean).length,
          axes_at_promotion: snapPromoted.rules.slots.filter(Boolean).length,
          order_restored: cam.order(),
          locked_order_restored: snap0.lockedOrder,
        },
      },
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "order_undo.json"), JSON.stringify(doc2, null, 2));

    // ---- 불변식
    // 사전 등록 ② — **잃은 것이 0이 아니다.** 0이면 이 UI가 보일 것이 없다는 뜻이고
    // 그때는 결론을 "표시할 것이 없다"로 적어야 한다
    expect(droppedTotal).toBeGreaterThan(0);
    expect(snapLostTotal).toBeGreaterThan(0);
    // #33 — 직접 모은 집합과 카운터가 갈리면 하나가 거짓말이다
    expect(countMismatch).toBe(0);
    // 설계 보장 — 왕복은 빈다
    expect(roundTrip).toEqual([]);
    // **양성 채널이 먼저다**(#30) — 안 움직이면 위 줄은 아무것도 안 말한다
    expect(positive.length).toBeGreaterThan(0);
    expect(doc2.undo_roundtrip.positive_channel.sees_pts2d).toBe(true);
    expect(doc2.undo_roundtrip.positive_channel.sees_rules).toBe(true);
    expect(doc2.undo_roundtrip.positive_channel.sees_seg3d).toBe(true);
    // **어긴 것이 매번 잡히고 매번 되돌아온다**(리뷰어 [10]) — n을 원장에 적었다
    expect(doc2.undo_roundtrip.trials.all_detected).toBe(true);
    expect(doc2.undo_roundtrip.trials.all_restored).toBe(true);
  }, 300_000);
});
