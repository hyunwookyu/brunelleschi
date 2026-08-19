// **첫 3D 부재의 재현·원인 특정**(2026-08-19 13차 항목 1) — 실획 파일 15-16-18(13획)은
// 카메라가 섰는데(`per_doc[*].camera_assumed_principal_center` — 두 슬롯 확정) `seg3d`가
// 0/13이다. 이 하네스는 그 파일을 **실좌표로 재구성**해 일괄 풀이(solveInto 경로:
// `axisOf` 재분류 → `liftAll`)가 어디서 멈추는지 원장에 남긴다.
//
// ⚠ 진단을 코드 독해로 두지 않는다(#25) — 실행이 낸 수가 원장에 있어야 항목 2(첫 앵커)의
// 양성 채널이 선다(#30: 고치기 전 상태가 원장에 한 번은 남아야 전후 대조가 가능하다).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CamState } from "../src/ui/camState.js";
import { liftAll, findJoints, components, frameOf, LIFT_TOL, type LiftStroke } from "../src/s3d/lift.js";
import { diagOf } from "../src/s3d/stroke.js";
import type { Frame } from "../src/s3d/lift.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { groundSegment, groundEligible } from "../src/s3d/groundAnchor.js";
import { crossAnchorOf, type CrossSeg } from "../src/s3d/crossAnchor.js";
import { axisDirection, unit3, dot3, project, type Vec3 } from "../src/s3d/geom3d.js";
import { stat } from "./scene3d.js";
import { gate } from "./gate.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SESSIONS = resolve(ROOT, "sessions");
const FILE = "brunelleschi-2026-08-18T15-16-18.brnl.json";

interface BrnlStroke { id: string; pts2d: Pt2[]; channel?: string; seg3d: unknown }
interface Brnl { imgSize: [number, number]; rules: unknown; strokes: BrnlStroke[] }

/** 두 무한직선의 교점(측정 전용 — `lift.ts`의 내부 함수와 같은 대수다). */
const lineIntersect = (a: Pt2, b: Pt2, c: Pt2, d: Pt2): Pt2 | null => {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + t * r[0], a[1] + t * r[1]];
};
const dist = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const onSeg = (q: Pt2, rep: { a: Pt2; b: Pt2 }, tol: number): boolean => {
  const L = dist(rep.a, rep.b);
  if (L < 1e-9) return false;
  const t = ((q[0] - rep.a[0]) * (rep.b[0] - rep.a[0]) + (q[1] - rep.a[1]) * (rep.b[1] - rep.a[1])) / (L * L);
  return t >= -tol / L && t <= 1 + tol / L;
};

/** 대조 파일(15-18-25) — 같은 일괄 풀이가 **놓는** 쪽. 배치 6/11의 무스냅 배치 경로 후보 확인. */
const FILE_CONTRAST = "brunelleschi-2026-08-18T15-18-25.brnl.json";

describe("첫 3D 부재 — 15-16-18 재구성(13차 항목 1)", () => {
  const path = resolve(SESSIONS, FILE);

  it("일괄 풀이가 배치 0인 이유를 원장에 남긴다", () => {
    // 표본은 저장소에 커밋돼 있다(2026-08-19 도착). 없으면 이 재현 자체가 성립 불가 —
    // 조용히 통과가 아니라 실패로 낸다(#32: 미실행을 초록으로 보이게 하지 않는다).
    expect(existsSync(path), `${FILE}가 sessions/에 없다`).toBe(true);
    const d = JSON.parse(readFileSync(path, "utf-8")) as Brnl;

    const cam = new CamState(d.imgSize);
    cam.loadRules(d.rules as never);
    const ctx = cam.ctx();
    expect(ctx, "규칙 복원으로 카메라가 서야 한다(두 슬롯 확정 저장본)").not.toBeNull();

    // ---- solveInto와 같은 재료(#17): note 채널 제외 · 축은 규칙이 정한 것으로 재분류
    const strokes = d.strokes.filter(s => s.channel !== "note");
    const input: LiftStroke[] = strokes.map(s => ({
      id: s.id, pts2d: s.pts2d, axis: cam.axisOf(s.pts2d).axis,
    }));
    const frames = new Map<string, Frame>();
    for (const st of input) {
      const fr = frameOf(st, ctx!);
      if (!("reason" in fr)) frames.set(st.id, fr);
    }
    const fl = [...frames.values()];
    const joints = findJoints(fl, ctx!, LIFT_TOL);
    const comps = components([...frames.keys()], joints);
    const r = liftAll(input, ctx!);

    // ---- 원인 후보 분해: 교차 자체가 없나, 있는데 끝점 근접(endNear)이 거르나
    const tol = LIFT_TOL.touch_ratio * diagOf(ctx!.imgSize);
    const cosPar = Math.cos((LIFT_TOL.parallel_deg * Math.PI) / 180);
    let bodyCrossings = 0, parallelPairs = 0, offSegment = 0;
    const endDistMin: number[] = [];
    const frArr = [...frames.entries()];
    for (let a = 0; a < frArr.length; a++) for (let b = a + 1; b < frArr.length; b++) {
      const F = frArr[a][1], G = frArr[b][1];
      if (Math.abs(F.d[0] * G.d[0] + F.d[1] * G.d[1] + F.d[2] * G.d[2]) >= cosPar) { parallelPairs += 1; continue; }
      const q = lineIntersect(F.rep.a, F.rep.b, G.rep.a, G.rep.b);
      if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
      if (!onSeg(q, F.rep, tol) || !onSeg(q, G.rep, tol)) { offSegment += 1; continue; }
      // 두 선분 위에 있는 실제 교차 — findJoints가 이 다음 조건(endNear)으로 거른 모집단
      const e = Math.min(dist(q, F.rep.a), dist(q, F.rep.b), dist(q, G.rep.a), dist(q, G.rep.b));
      if (e > tol) { bodyCrossings += 1; endDistMin.push(e); }
    }

    // ---- **대조 팔**(13차 리뷰어 [4]): 15-18-25 — 같은 재구성에서 일괄 풀이가 놓는가.
    // 그 파일의 `lifted_no_snapstart_ids`(real_ink)가 일괄 풀이 몫으로 설명되는지의 재료다.
    const contrast = (() => {
      const p2 = resolve(SESSIONS, FILE_CONTRAST);
      if (!existsSync(p2)) return null;
      const d2 = JSON.parse(readFileSync(p2, "utf-8")) as Brnl;
      const cam2 = new CamState(d2.imgSize);
      cam2.loadRules(d2.rules as never);
      const ctx2 = cam2.ctx();
      if (!ctx2) return { camera_standing: false };
      const in2: LiftStroke[] = d2.strokes.filter(s => s.channel !== "note")
        .map(s => ({ id: s.id, pts2d: s.pts2d, axis: cam2.axisOf(s.pts2d).axis }));
      const r2 = liftAll(in2, ctx2);
      const savedLifted = d2.strokes.filter(s => s.seg3d).map(s => s.id);
      return {
        camera_standing: true,
        placed: r2.placed.size,
        placed_ids: [...r2.placed.keys()],
        saved_lifted_ids: savedLifted,
        /**
         * 재구성이 저장본보다 **더 놓은** 획(리뷰어 2차 [8]) — 이것이 "저장 당시의 순차
         * 흐름이 아니다"의 실측 증거다: 일괄 풀이가 이 획을 놓을 수 있는데 저장본에는 없다.
         */
        beyond_saved_ids: [...r2.placed.keys()].filter(id => !savedLifted.includes(id)),
        note: "⚠ 이 재구성은 **저장 당시의 순차 흐름이 아니다**(확정 시점의 대기 집합을 모른다) — "
            + "일괄 풀이가 이 기하에서 무엇을 놓을 수 있는지의 재료일 뿐, 저장본의 seg3d가 "
            + "이 경로로 났다는 증명이 아니다. `beyond_saved_ids`(재구성이 저장본보다 더 놓은 획)가 "
            + "비어 있지 않은 것이 그 실측 증거다(리뷰어 2차 [8]). real_ink의 "
            + "`lifted_no_snapstart_ids`가 전부 placed_ids 안이면 무앵커 배치는 일괄 풀이 몫으로 "
            + "**모순 없이** 설명된다(증명 아님). "
            + "⚠ 화각 163°(상한 거부 대역)인데 여기서 카메라가 선 것은 **복원 경로**라서다 — "
            + "12차 상한은 신규 확정(stepRule)을 막고, 저장된 슬롯의 ctx 풀이는 지나간다(실측: "
            + "camera_standing true). 의도인지 미상 — DEFERRED 등재(복원 경로의 상한 처리)",
      };
    })();

    // ---- **양성 채널**(13차 항목 2 — 지시 2-e): 지면 첫 앵커 + 교차 앵커가 같은 파일을
    //      몇이나 푸는가. 앱 배선과 같은 순수 함수(groundSegment·crossAnchorOf)를 쓴다(#17).
    const grounded = new Map<string, [Vec3, Vec3]>();
    for (const st of input) {
      if (!groundEligible(st.axis)) continue;
      const seg = groundSegment(st.pts2d, ctx!);
      if (seg) grounded.set(st.id, seg);
    }
    const crossSegs: CrossSeg[] = [...grounded.entries()].map(([id, s]) => ({ id, a: s[0], b: s[1] }));
    // ⚠ **분모는 축을 받은 대기 획이다**(13차 1·2 리뷰어 [1·5] · #11) — 미분류(free)는 연쇄가
    // 원리상 못 놓는다(skipped_axis). 초판은 미분류 넷을 섞어 5/5가 됐고 판별력이 0이었다.
    const waitingClassified = input.filter(st => !grounded.has(st.id) && st.axis !== "free");
    const crossable: string[] = [];
    for (const st of waitingClassified) {
      const a2 = st.pts2d[0], b2 = st.pts2d[st.pts2d.length - 1];
      if (crossAnchorOf(a2, b2, crossSegs, { principal: ctx!.principal, f: ctx!.f }, 8)) {
        crossable.push(st.id);
      }
    }
    const groundRecovery = {
      note: "수리 후 같은 파일이 어디까지 풀리는가 — `ground_placed`(확정 순간 지면 첫 앵커) + "
          + "`crossable_after`(그 지면 획을 가로질러 교차 앵커가 닿는, **축을 받은** 대기 획 — "
          + "분자/분모). 미분류 대기는 분모 밖이고 따로 센다(#11). 앱 종단은 "
          + "`ground_anchor.json`(e2e)이 재고, 여기는 같은 함수의 파일 재료 팔이다. "
          + "⚠ crossable은 도달 가능성이지 배치가 아니다 — 연쇄의 실제 배치는 축·양끝 조건을 더 지난다",
      ground_placed: grounded.size,
      ground_placed_ids: [...grounded.keys()],
      crossable_after: `${crossable.length}/${waitingClassified.length}`,
      crossable_ids: crossable,
      unclassified_waiting: input.length - grounded.size - waitingClassified.length,
    };

    // ---- **가림 교차의 실측**(13차 항목 7 · DEFERRED #23 — "표본이 오면 비율을 잰다"):
    //      대기 획의 상이 지면 획들의 상을 여러 번 가로지를 때, 각 교차가 시사하는 앵커로
    //      그 획의 직선(축 방향)을 세우면 **서로 평행한 직선들**이 나온다 — 참 접촉은
    //      한 점뿐이므로 나머지는 가림이고, 평행선 간 거리(잔차)가 그 크기다.
    //      (liftAll의 reject가 재는 상대 불일치와 같은 종류의 양 — 검증 팔의 설계 입력)
    const crossResidual = (() => {
      const dirs = (ctx as { axisDirs?: (Vec3 | null)[] } | null)?.axisDirs ?? [];
      const rows: Record<string, unknown>[] = [];
      const allOffs: number[] = [];
      for (const st of waitingClassified) {
        const ax = st.axis as 0 | 1 | 2;
        const d3 = dirs[ax];
        if (!d3) continue;
        const a2 = st.pts2d[0], b2 = st.pts2d[st.pts2d.length - 1];
        const anchors: Vec3[] = [];
        for (const seg of crossSegs) {
          const hit = crossAnchorOf(a2, b2, [seg], { principal: ctx!.principal, f: ctx!.f }, 8);
          if (hit) anchors.push(hit.atV);
        }
        if (anchors.length < 2) { rows.push({ id: st.id, n_crossings: anchors.length }); continue; }
        const offs: number[] = [];
        let scaleSum = 0;
        for (const a of anchors) scaleSum += Math.hypot(a[0], a[1], a[2]);
        const scale = Math.max(1e-9, scaleSum / anchors.length);
        for (let i = 0; i < anchors.length; i++) for (let j = i + 1; j < anchors.length; j++) {
          const v: Vec3 = [anchors[j][0] - anchors[i][0], anchors[j][1] - anchors[i][1],
                           anchors[j][2] - anchors[i][2]];
          const t = v[0] * d3[0] + v[1] * d3[1] + v[2] * d3[2];
          const perp: Vec3 = [v[0] - t * d3[0], v[1] - t * d3[1], v[2] - t * d3[2]];
          offs.push(Math.hypot(perp[0], perp[1], perp[2]) / scale);
        }
        allOffs.push(...offs);
        rows.push({ id: st.id, n_crossings: anchors.length,
                    pairwise_line_offset_ratio: stat(offs, 4) });
      }
      // **"켜면 죽는다"의 임계 의존을 값으로 낸다**(5·6·7 리뷰어 7[2] · #13): 검증을
      // "교차 둘 이상이 허용치 안에서 일치해야 채택"으로 정의하면, 생존 경계는 **최소
      // 쌍별 이탈**이다 — 그보다 작은 허용치는 전부 기각(회복 0), 큰 허용치는 통과.
      const minOff = allOffs.length ? Math.min(...allOffs) : null;
      return {
        note: "대기 획별: 지면 획들과의 교차 수 · 각 교차 앵커로 세운 축 직선들의 **쌍별 평행선 "
            + "거리 ÷ 평균 앵커 거리**(상대 — ⚠ 이 분모가 문서들이 '장면 규모'라 부른 그 양의 "
            + "대리다. 7[4]로 대응을 명시: 같은 획의 앵커들 원점 거리 평균이고, 별도 '장면 "
            + "규모' 지표는 없다). 참 접촉은 최대 하나이므로 교차가 2+이고 이 값이 크면 "
            + "**나머지는 가림**이다 — 현행 crossAnchorOf(최근접 교차 채택)이 무엇을 두고 "
            + "고르는지의 실측이고, 잔차 검증 팔(2+ 교차의 일치 요구)의 설계 입력이다. "
            + "⚠⚠ **이 팔은 가림 비율(합성 3/27 같은 분자/분모)을 안 낸다**(7[1] — 실측 획 "
            + "n=1 · 쌍 3이라 비율의 분모가 없다. DEFERRED #23 행의 '절반'은 어긋남 **크기**의 "
            + "실측이지 비율이 아니다). ⚠ '잔차 검증을 켜면 회복이 죽는다'는 **허용치 의존**"
            + "이다(7[2] · #13) — 경계값이 verify_survival_boundary이고, 앱에는 대응 임계가 "
            + "아직 없다(liftAll의 reject_mult는 다른 층의 양 — 허용치 미정). 정책(어느 교차가 "
            + "참인가)은 DEFERRED 그대로 열려 있고 이 실측이 그 판단 재료다",
        rows,
        /** '2+ 교차 일치' 검증의 생존 경계(상대 이탈) — 이보다 작은 허용치면 s49 회복이 죽는다 */
        verify_survival_boundary: minOff == null ? null : +minOff.toFixed(4),
      };
    })();

    // ---- **지면 전제의 참값 대조를 원장에 넣는다**(1·2 리뷰어 [4] · 2차 [1] — 측정을
    //      테스트 안에만 두지 않는다 #25). 아래 describe의 반례 팔과 같은 함수·같은 값이다.
    const groundTruth = (() => {
      const P: Pt2 = [590, 334], f = 500;
      const tctx = { principal: P, f, vps: [null, null, null],
                     imgSize: [1180, 668] } as never;
      const pr = (v: Vec3): Pt2 => { const q = project(v, P, f)!; return [q[0], q[1]]; };
      const onA: Vec3 = [-0.8, 1, 3], onB: Vec3 = [0.6, 1, 5];
      const onSeg2 = groundSegment([pr(onA), pr(onB)], tctx)!;
      const identityErr = Math.max(
        Math.hypot(onSeg2[0][0] - onA[0], onSeg2[0][1] - onA[1], onSeg2[0][2] - onA[2]),
        Math.hypot(onSeg2[1][0] - onB[0], onSeg2[1][1] - onB[1], onSeg2[1][2] - onB[2]));
      const rows = [0.25, 0.5, 0.75].map(h => {
        const A: Vec3 = [-0.5, 1 - h, 3], B: Vec3 = [0.5, 1 - h, 4];
        const sg = groundSegment([pr(A), pr(B)], tctx)!;
        const dT = unit3([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
        const dG = unit3([sg[1][0] - sg[0][0], sg[1][1] - sg[0][1], sg[1][2] - sg[0][2]]);
        return { h_over_eye: h, depth_ratio: +(sg[0][2] / A[2]).toFixed(4),
                 dir_dot_abs: +Math.abs(dot3(dT, dG)).toFixed(6) };
      });
      return {
        note: "합성 참 카메라(피치 0 · 지면 y=+1)의 두 팔(#25 — 여기 있어야 AS-L42·D-L90의 "
            + "인용이 원장 안이다). ① identity_on_plane_err: 참으로 지면 위인 선의 복원 오차 — "
            + "**구성의 항등**(#5: 같은 평면×광선 교점이라 0일 수밖에 없다. 보장이므로 임계를 "
            + "안 건다 — selfcheck 규약대로 그렇게 적는다). ② offplane: 지면 위 높이 h(눈높이 "
            + "비율)의 수평선을 지면에 놓았을 때 — depth_ratio = 1/(1−h)로 깊이가 조용히 늘고 "
            + "dir_dot_abs = 1로 **방향은 보존된다**(등고선의 그림자는 순수 배율 — 방향 지표에 "
            + "안 잡히는 이유. AS-L42 위반 비용의 크기다. ⚠ 이 배율은 닫힌 형식의 귀결이라 "
            + "'실측'의 몫은 구현 확인이다 — 2차 리뷰어 PITFALLS 대조의 #5 주의 그대로)",
        identity_on_plane_err: identityErr,
        offplane: rows,
      };
    })();

    const out = {
      spec: "실획 15-16-18 재구성 — 일괄 풀이(solveInto 경로)가 배치 0인 원인의 특정(13차 항목 1)"
          + " · 지면 첫 앵커의 양성 채널(13차 항목 2)",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      why: "카메라가 섰는데 seg3d 0/13(real_ink.per_doc). 확정 경로는 D-L83(앵커 자격)이 "
         + "3D 대상 부재로 전부 대기시키는 것이 의도대로이고, 교차 앵커(12차)는 첫 3D 뒤의 "
         + "연결 폭이라 여기 도달하지 못한다(12차 리뷰어 [2]). 남는 후보는 확정 순간의 일괄 "
         + "풀이 하나 — 그것이 왜 0인지가 이 원장이다.",
      file: FILE,
      reconstruction: {
        camera_standing: !!ctx,
        n_strokes_nonnote: strokes.length,
        axes: input.map(s => `${s.id}:${s.axis}`),
        n_framed: frames.size,
        n_axis_unclassified: input.length - frames.size,
      },
      batch_solve: {
        joints: joints.length,
        components: comps.map(c => c.length),
        placed: r.placed.size,
        unplaced_reasons: r.unplaced.reduce<Record<string, number>>((m, u) => {
          m[u.reason] = (m[u.reason] ?? 0) + 1; return m;
        }, {}),
      },
      contrast_15_18_25: contrast,
      ground_recovery: groundRecovery,
      ground_truth: groundTruth,
      cross_occlusion: crossResidual,
      crossing_breakdown: {
        note: "findJoints의 세 거름 조건별 모집단 — 같은 축(parallel) · 선분 밖(off_segment) · "
            + "**몸통 교차(body_crossings — 두 선분 위 교차인데 어느 끝점에서도 touch 반경 밖)**. "
            + "교점(joint)이 0인데 몸통 교차가 여럿이면, 멈춘 자리는 교차 부재가 아니라 "
            + "**끝점 근접(endNear) 조건**이다 — 이 사용자의 보조선은 모서리 접합이 아니라 "
            + "길게 긋고 가운데서 가로지르는 스타일이다(교차 앵커 D-L89 계열과 같은 관찰).",
        touch_radius_px: +tol.toFixed(2),
        parallel_pairs: parallelPairs,
        off_segment: offSegment,
        body_crossings: bodyCrossings,
        min_end_dist_px: stat(endDistMin, 1),
      },
      gate: gate({
        registered: "재현 팔(#30): placed = 0 · joints = 0 · body_crossings > 0 — 즉 '교차가 "
                  + "없어서'가 아니라 '끝점 접합이 아니라서'다. ⚠ 이 팔은 liftAll 재료만 "
                  + "지나므로 수리(solveInto 꼬리의 지면 경로)와 무관하게 0이 유지된다 — "
                  + "'수리 전 상태'가 아니라 **일괄 풀이 층의 불변**으로 읽는다(1·2 리뷰어 #44 "
                  + "긴장의 해소). 같은 입력·같은 앱의 수리 전 거동은 ground_anchor.json의 끔 "
                  + "팔이 잰다. 항목 2(첫 앵커)의 양성 채널: ground_recovery.ground_placed > 0",
        reachability: "재현 조건(placed = 0)이 항등이 아님을 **형제 파일의 같은 솔버**가 보인다 — "
                    + "contrast_15_18_25.placed > 0(끝점 접합이 있으면 이 일괄 풀이는 실제로 놓는다). "
                    + "⚠ 초판은 body_crossings(판정 조건 자체)를 여기 적었고 리뷰어 2차 [9]가 "
                    + "#40의 그 형태(기준선을 도달 가능성으로)로 잡아 바꿨다",
        reachability_value: (contrast && "placed" in contrast ? contrast.placed : null) as number,
        reachability_source: "contrast_15_18_25/placed",
        result: { placed: r.placed.size, joints: joints.length, body_crossings: bodyCrossings,
                  ground_placed: grounded.size,
                  crossable_after: `${crossable.length}/${waitingClassified.length}` },
      }),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "first_anchor.json"), JSON.stringify(out, null, 2), "utf-8");

    // **재현 단언** — 이 팔은 수리 전 상태의 기록이다. 항목 2가 앱 배선을 바꿔도 이 팔은
    // 순수 liftAll 재료라 그대로 0이어야 한다(일괄 풀이 자체는 안 바꾼다 — 바뀌면 이 단언이
    // 그 사실을 알린다).
    expect(ctx).not.toBeNull();
    expect(r.placed.size).toBe(0);
    expect(joints.length).toBe(0);
    expect(bodyCrossings).toBeGreaterThan(0);
    // **양성 채널 단언**(13차 항목 2 — 지시 2-e): 같은 파일에서 seg3d 0 → 지면 6.
    // 수평 평면 축 여섯이 전부 지평선 아래라 지면에 선다. 수직선(s49)은 그 상을 가로질러
    // 교차 앵커에 닿는다 — 연쇄가 시작될 수 있다(실제 배치는 앱 종단 ground_anchor.json).
    expect(grounded.size).toBe(6);
    expect(crossable).toContain("s49");
  });
});

describe("groundSegment — 반례(13차 항목 2 · #5 판별법: 틀린 입력에 지표가 반응하는가)", () => {
  // vps 전부 null → 지면 법선 [0, 1, 0](화면 세로가 위) · 지평선 = 주점 y(334)
  const ctx = { principal: [590, 334] as Pt2, f: 500,
                vps: [null, null, null] as (Pt2 | null)[],
                imgSize: [1180, 668] as [number, number] } as never;

  it("소실점을 지나는 현의 지면 배치는 그 축 방향과 나란하다 — 현을 틀면 벗어난다", () => {
    const vp: Pt2 = [900, 334];
    const a: Pt2 = [300, 500];
    const b: Pt2 = [a[0] + (vp[0] - a[0]) * 0.4, a[1] + (vp[1] - a[1]) * 0.4];
    const seg = groundSegment([a, b], ctx)!;
    expect(seg).not.toBeNull();
    const d3 = unit3([seg[1][0] - seg[0][0], seg[1][1] - seg[0][1], seg[1][2] - seg[0][2]]);
    const ax = axisDirection(vp, [590, 334], 500);
    // 시선 평면 ∩ 지면 = 그 소실점 방향의 직선 — 정확히 나란하다(부호 무시)
    expect(Math.abs(dot3(d3, ax))).toBeGreaterThan(1 - 1e-9);
    // 현을 화면에서 6°쯤 틀면 지면 방향이 축에서 벗어난다 — 항등이 아니라 기하다
    const seg2 = groundSegment([a, [b[0], b[1] - 25]], ctx)!;
    const d32 = unit3([seg2[1][0] - seg2[0][0], seg2[1][1] - seg2[0][1], seg2[1][2] - seg2[0][2]]);
    expect(Math.abs(dot3(d32, ax))).toBeLessThan(Math.cos((1 * Math.PI) / 180));
  });

  it("지평선 위 끝점은 null — 지면에 없다(한쪽만 위여도 null)", () => {
    expect(groundSegment([[300, 200], [500, 210]], ctx)).toBeNull();
    expect(groundSegment([[300, 500], [500, 300]], ctx)).toBeNull();
  });

  it("재투영이 그린 점 그대로다 — 광선 위의 점(배선 확인이지 측정이 아니다, #5)", () => {
    const seg = groundSegment([[300, 500], [600, 450]], ctx)!;
    const p0 = project(seg[0], [590, 334], 500)!;
    expect(Math.hypot(p0[0] - 300, p0[1] - 500)).toBeLessThan(1e-9);
  });

  it("groundEligible — 수평 평면 축(0·1)만 대상이다", () => {
    expect(groundEligible(0)).toBe(true);
    expect(groundEligible(1)).toBe(true);
    expect(groundEligible(2)).toBe(false);       // 수직선은 지면에 눕지 않는다 — 연결이 정한다
    expect(groundEligible("free")).toBe(false);
    expect(groundEligible("screen")).toBe(false);
  });
});

/**
 * **지면 전제의 참값 대조**(13차 1·2 리뷰어 [4] — 배치 수만 세면 #15·#16의 자리다).
 * 합성 참 카메라에서 ① 참으로 지면 위인 선의 복원은 **구성의 항등**이고(#5 — 같은 평면과
 * 광선의 교점이라 오차가 0일 수밖에 없다. 기록만 하고 임계를 안 건다) ② **전제가 틀린
 * 선**(지면 위 높이 h의 수평선 — 상자 윗모서리·허공)은 지면 배치가 깊이를 1/(1−h/눈높이)
 * 배로 **조용히 늘린다** — 그 크기를 실측으로 남긴다. 이것이 AS-L42(확정 시점 수평 획은
 * 바닥 격자다)의 위반 비용이다.
 */
describe("groundSegment — 지면 전제의 참값 대조(전제 위반 비용)", () => {
  const P: Pt2 = [590, 334], F = 500;
  const ctx = { principal: P, f: F, vps: [null, null, null] as (Pt2 | null)[],
                imgSize: [1180, 668] as [number, number] } as never;
  const proj = (v: Vec3): Pt2 => { const q = project(v, P, F)!; return [q[0], q[1]]; };

  it("참 지면 위 선의 복원은 항등이다(#5 — 기록: 보장이지 측정이 아니다)", () => {
    const A: Vec3 = [-0.8, 1, 3], B: Vec3 = [0.6, 1, 5];       // 지면 y=+1(눈높이 게이지)
    const seg = groundSegment([proj(A), proj(B)], ctx)!;
    expect(Math.hypot(seg[0][0] - A[0], seg[0][1] - A[1], seg[0][2] - A[2])).toBeLessThan(1e-9);
    expect(Math.hypot(seg[1][0] - B[0], seg[1][1] - B[1], seg[1][2] - B[2])).toBeLessThan(1e-9);
  });

  it("전제가 틀린 선(높이 h)의 깊이는 1/(1−h)배로 조용히 늘어난다 — 위반 비용의 실측", () => {
    // 지면 위 높이 h = 눈높이의 절반(0.5) → y_true = 1 − 0.5 = 0.5. 참 깊이 3·4.
    const A: Vec3 = [-0.5, 0.5, 3], B: Vec3 = [0.5, 0.5, 4];
    const seg = groundSegment([proj(A), proj(B)], ctx)!;
    expect(seg).not.toBeNull();
    // 광선 위에서 지면(y=1)까지 내려가므로 깊이가 정확히 1/y_true = 2배가 된다
    expect(seg[0][2] / A[2]).toBeCloseTo(2, 9);
    expect(seg[1][2] / B[2]).toBeCloseTo(2, 9);
    // ⚠ **방향은 보존된다** — 등고(높이 일정) 선의 지면 그림자는 순수 배율(×1/y)이라
    // 평행 이동·확대일 뿐이다. 즉 이 오류는 방향 지표(vp_dir 등)에 **안 나타난다** —
    // 그래서 "조용히" 틀린 깊이다. 깊이 배율(위)이 유일한 흔적이고 그것을 잰다.
    const dTrue = unit3([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
    const dGnd = unit3([seg[1][0] - seg[0][0], seg[1][1] - seg[0][1], seg[1][2] - seg[0][2]]);
    expect(Math.abs(dot3(dTrue, dGnd))).toBeGreaterThan(1 - 1e-9);
  });

  it("기울어진 카메라에서 지면은 수직 소실점이 정한다(AS-C6 — groundFrame 단일 출처의 배선 확인)", () => {
    // 수직 소실점이 유한하면(피치) 지면 법선이 [0,1,0]이 아니다 — 같은 2D 입력의 배치가
    // 피치 없는 지면과 **달라야** 한다. 다르지 않으면 y=const를 하드코딩한 것이다.
    const tilted = { principal: P, f: F, vps: [null, null, [590, 3000] as Pt2] as (Pt2 | null)[],
                     imgSize: [1180, 668] as [number, number] } as never;
    const chord: [Pt2, Pt2] = [[300, 500], [700, 560]];
    const flat = groundSegment(chord, ctx)!;
    const tilt = groundSegment(chord, tilted)!;
    expect(flat).not.toBeNull(); expect(tilt).not.toBeNull();
    const gap = Math.hypot(tilt[0][0] - flat[0][0], tilt[0][1] - flat[0][1], tilt[0][2] - flat[0][2]);
    expect(gap).toBeGreaterThan(1e-3);
  });
});
