// **6차 지시 1·2·7·11의 원장** — 확정 뷰 자세 · 끝점 겨냥 프로브 · 화각 게이트 ·
// 소실점 확정 규칙(세 번째 선).
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 이 항목에 걸리는 번호:
//   **#42** — 완료 시 이 원장이 인용하는 번호(#3·#5·#12·#17·#30·#35·#40)를 착수 표와 대조한다
//   **#40** — `gate` 블록의 도달 가능성은 **수치 + 출처**로 적는다. 산문만 두지 않는다
//   **#38** — 각 절이 **덮는 대상 수**(분모)를 함께 낸다
//   **#3·#5** — `on_face`의 화면 거리는 **정의상 0**이다. 그 값을 성공률·겨냥 분포에 안 섞는다
//   **#12** — `RULE_TOL.concurrent_deg`는 **동작점 하나**다. 스윕을 안 돌렸고 근거는 실획 보고다
//   **#30** — 각 절에 **반례 채널**을 둔다. 다 통과하면 판정이 아니다
//   **#17** — 앱과 하네스가 같은 함수를 부른다(`resolvePool`·`fovGate`·`snapCandidates`)
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  newRuleState, stepRule, resolvePool, convergeDeg, fovGate, perspectiveOrder,
  sepDeg, beyondSegment, RULE_TOL, FOV_GATE, type RLine,
} from "../src/s3d/vpRules.js";
import { lineIntersect, isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { vpMisfit, AXIS_TOL } from "../src/s3d/axis.js";
import { newDoc, newView, confirmViewOf, isConfirmView, type DocState } from "../src/ui/doc.js";
import { serializeDoc2, restoreDoc2 } from "../src/ui/docStore.js";
import { snapCandidates, SNAP_TOL, staticCandidates,
         type SnapSeg, type SnapCtx } from "../src/s3d/snap.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { project } from "../src/s3d/geom3d.js";
import { stat } from "./scene3d.js";
import { gate } from "./gate.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");
const SZ: [number, number] = [960, 672];
const line = (a: Pt2, b: Pt2): RLine => ({ a, b });

/** 소실점 쪽으로 `t`만큼 뻗은 선분. 손 오차 없이 정확히 그 점을 향한다. */
const toward = (from: Pt2, v: Pt2, t: number): RLine =>
  line(from, [from[0] + (v[0] - from[0]) * t, from[1] + (v[1] - from[1]) * t]);

// ---------------------------------------------------------------- 1. 확정 뷰 자세 (지시 1)

/**
 * ⚠⚠ **지시 1의 전제가 틀렸다.** `views[0].pose = null`은 "자세 저장이 빠진 것"이 아니라
 * **확정 뷰의 정의**다(`doc.ts`): 확정 카메라에 물려 있으면 자세가 항등이고(`stage.pinTo`가
 * 원점·항등에 놓는다) `stage.pose()`가 그때 `null`을 낸다. 자세를 채우면 오히려
 * **확정 뷰를 못 찾는다** — 뷰 전환·일괄 풀이·저장 복원 셋이 그 술어로 찾기 때문이다.
 * 확정 카메라의 실제 정보(주점·f·소실점)는 저장본의 `rules`·`cam`에 이미 들어 있다.
 *
 * 그래서 이 절은 **결함 기록이 아니라 불변 확인**이고, 반례 채널(#30)이 그 불변을 깨면
 * 무엇이 무너지는지 보인다.
 */
function confirmViewSection() {
  const doc: DocState = newDoc();
  const home = confirmViewOf(doc);
  const roundTrip = restoreDoc2(serializeDoc2({
    at: "2026-08-18T00:00:00.000Z", imgSize: SZ, cam: null, rules: null,
    doc, seq: { stroke: 0, view: 1 },
  }));
  // **반례** — 확정 뷰에 자세를 넣으면(지시 1-a가 하자던 것) 확정 뷰가 사라진다
  const broken: DocState = {
    ...doc,
    views: [{ ...home, pose: { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] } }],
  };
  const brokenHome = confirmViewOf(broken);
  return {
    what: "`pose === null`이 확정 뷰의 정의인가 — 그리고 자세를 채우면 무엇이 무너지는가",
    views_checked: doc.views.length,
    confirm_pose_null: home.pose === null,
    is_confirm: isConfirmView(home),
    round_trip_pose_null: confirmViewOf(roundTrip.doc).pose === null,
    counter_example: {
      what: "확정 뷰에 항등 자세를 채운 문서 — 지시 1-a가 하려던 변경",
      // 술어가 거짓이 되므로 `confirmViewOf`는 **뜻이 아니라 순서로** 되돌아간다(views[0])
      is_confirm_after: isConfirmView(brokenHome),
      // 그러면 `stage.pose()`(핀에서 null)와 저장된 자세가 **항상 다르다** — `viewIsCurrent`가
      // 거짓이 되고 2D 대기층이 안 그려진다(5차 항목 1이 실측한 그 증상이다)
      view_is_current_would_be: false,
    },
    finding: (
      "지시 1의 세 증상은 자세 누락이 아니다. ① 그리드가 깊이선과 안 맞는 것은 **그리드의 원점이"
      + " 임의**이기 때문이다(`grid.ts`의 `groundGrid`: 화면 (W/2, 0.72H) 광선 ∩ 눈높이 지면)."
      + " 방향은 확정 카메라의 소실점에서 오므로 맞고 **자리와 간격만 임의**다."
      + " ② 회전 튐은 D-L65에서 이미 고쳤다(`stage.retarget` — 시선 투영)."
      + " ③ 그릴 때마다 다른 곳은 **`on_face` 임의 깊이**이고 그것이 항목 4의 대상이다."
    ),
  };
}

// ---------------------------------------------------------------- 2. 끝점 겨냥 프로브 (지시 2)

/**
 * **끝점 스냅이 안 걸린 이유 셋을 가른다**(지시 2-b): ① 반경이 좁다 ② 후보가 없다
 * ③ 판정이 안 돈다. 프로브(40px)가 값을 내면 ①, `null`이면 ②다.
 *
 * ⚠ **`on_face`를 프로브에서 뺀다**(#3·#5) — 지면 스냅의 화면 거리는 **정의상 0**이라
 * 앞을 막으면 "스냅 실패"가 안 생기고 프로브가 영영 발화하지 않는다. 그것이 실획 첫 표본에서
 * `snapDistPx`가 **전부 0**으로 나온 기전이기도 하다.
 */
function endProbeSection() {
  const f = 800, principal: Pt2 = [SZ[0] / 2, SZ[1] / 2];
  const segs: SnapSeg[] = [{ id: "a", a: [-1, -1, 6], b: [1, -1, 6] }];
  const ctx: SnapCtx = { principal, f, imgSize: SZ, ground: null, from: [0, 0, 6] };
  const pre = staticCandidates(segs);
  const endAt = project(segs[0].b, principal, f)!;      // 끝점의 화면 자리
  const APERTURE = 15, PROBE = 40;
  const rows = [5, 12, 20, 30, 60, 200].map(dx => {
    const q: Pt2 = [endAt[0] + dx, endAt[1]];
    const inAperture = snapCandidates(q, segs, ctx, { radius_ratio: APERTURE / Math.hypot(...SZ) }, pre)
      .find(c => c.kind !== "on_edge" && c.kind !== "on_face") ?? null;
    const probed = snapCandidates(q, segs, ctx, { radius_ratio: PROBE / Math.hypot(...SZ) }, pre)
      .find(c => c.kind !== "on_edge" && c.kind !== "on_face") ?? null;
    return { offset_px: dx, snapped: !!inAperture,
             probe_px: probed ? Math.round(probed.dist * 100) / 100 : null,
             verdict: inAperture ? "붙었다" : probed ? "반경이 좁다(①)" : "후보가 없다(②)" };
  });
  return {
    what: "조리개 밖 끝점 겨냥을 프로브가 잡아내는가 — 세 사유를 가르는가",
    aperture_px: APERTURE, probe_px: PROBE,
    covered: rows.length,
    rows,
    // **덮는 대상 수**(#38): 세 사유가 **전부** 관측됐는가. 하나라도 0이면 판별력이 없다
    verdict_counts: {
      snapped: rows.filter(r => r.verdict === "붙었다").length,
      radius_too_small: rows.filter(r => r.verdict.startsWith("반경")).length,
      no_candidate: rows.filter(r => r.verdict.startsWith("후보")).length,
    },
    on_face_excluded: "지면 스냅의 화면 거리는 정의상 0이라 프로브에서 뺀다(#3·#5)",
    /**
     * **프로브가 돌았다는 증거**(6차 리뷰어 [4]). 값 `null` 하나로는 ②(후보 없음)와
     * ③(판정이 안 돎)이 안 갈린다 — 미실행을 반증으로 읽지 않는다(#32).
     */
    probe_ran: { queries: rows.length, snap_targets: segs.length, static_candidates: pre.length },
  };
}

// ---------------------------------------------------------------- 7. 화각 게이트 (지시 7)

function fovSection() {
  // **쓸기의 지평선은 주점 y에 둔다**(h = 0). 그러면 가 정확히 성립해 f/W 격자를
  // 곧바로 만들 수 있다 — 지평선이 주점에서 떨어진 경우(h ≠ 0)의 몫은 가
  // 든다(그 행의 h = 334 − 157 = 177px이고, 그것을 빼먹은 것이 6차 리뷰어의 지적이다).
  const H = SZ[1] / 2;
  // d/W를 쓸어 대역 경계를 낸다. 주점(480)을 사이에 두게 대칭으로 벌린다
  // **f/W를 쓴다**(리뷰어 [5]) — 대역을 가르는 양이 시거리이기 때문이다(이론서 18.4).
  // 대칭 배치이므로 d = 2f로 놓으면 원하는 f/W가 나온다
  // 0.28·0.29는 **화각 상한(120°) 경계**를 사이에 둔다(12차 지시 1-c — `reject_fov_deg`):
  // 0.5/tan60° ≈ 0.2887이 정확히 120°이고, 그 아래(0.2·0.28)는 f² > 0인데도 거부다.
  const sweep = [0.2, 0.28, 0.29, 0.4, 0.49, 0.5, 0.6, 0.86, 0.87, 1.0, 1.5, 2.0, 3.0].map(rf => {
    const c = SZ[0] / 2, d = 2 * rf * SZ[0];
    const v = fovGate([c - d / 2, H], [c + d / 2, H], SZ);
    return { f_over_w: rf, d_over_w: Math.round(v.dOverW * 1000) / 1000, band: v.band,
             f: v.f == null ? null : Math.round(v.f * 100) / 100,
             fov_deg: v.fovDeg == null ? null : Math.round(v.fovDeg * 100) / 100 };
  });
  // **반례**(#30) — 주점 한쪽에 몰린 두 소실점은 **거부**다(f² ≤ 0, 서 있을 수 없는 카메라)
  const sameSide = fovGate([520, H], [1250, H], SZ);
  // **화면 밖 소실점은 정상이다** — 클램프가 없는지 확인한다(지시 7-a)
  const farOff = fovGate([-2400, H], [3600, H], SZ);
  /**
   * **실획 첫 표본의 값**(지시 7-f). ⚠⚠ **파일이 저장소에 없다** — `sessions/`가 비어 있고
   * `real_ink`는 `awaiting_samples` 상태다. 아래 입력은 **6차 지시문이 보고한 수**이고
   * 측정이 아니다. 파일이 들어오면 `real_ink`가 같은 함수로 다시 낸다(#17).
   */
  const reportedW = 1180;
  const reported = fovGate([902, 157], [-231, 157], [reportedW, 668]);
  /**
   * **실획 12차 두 표본**(12차 지시 1-f — 회귀 팔). ⚠⚠ **이 파일들도 저장소에 도착하지
   * 않았다**(11차와 같은 상황 — b4f2d9b 선례: 지시문 수치는 사람 보고로만 기록).
   *
   * ⚠⚠ **지시문 표기 "d/W"의 d는 소실점 간격이 아니라 시거리(= f)다**(12차 리뷰어 [1] —
   * 단위를 못 박는다, #24: 이 게이트가 이미 한 번 빠진 함정이다). 판독의 근거는 파일 2다:
   * 보고가 f = 87.2와 "d/W = 0.074"를 나란히 들었고 87.2/1180 = 0.0739 = 그 값이다 —
   * 소실점 간격이면 179/1180 = 0.152라 안 맞는다. 이론서 18.4도 d를 시거리로 쓴다.
   * 그러므로 파일 1의 "d/W 0.431"도 **f/W**로 읽는다 — 그 판독이 지시문 자신의
   * "0.5W 미만이면 경고"·"파일 1은 경고 구간"과도 맞는다(간격이었다면 f/W ≤ 0.216이라
   * 상한 거부 대역이 되어 지시문의 "경고 구간"과 모순된다).
   * ⚠ 이 원장의 `FovVerdict.d`는 반대로 **소실점 간격**이다 — 이름이 겹치므로 여기 적는다.
   *
   * 아래 좌표는 보고된 (f, d, W)에서 **역산한 재구성**이다 — 지평선을 주점 y에 두면(h = 0)
   * 주점에서 두 소실점까지 수평 거리 a·b가 `a + b = d`, `a·b = f²`을 만족하므로
   * `a, b = (d ± √(d² − 4f²)) / 2`다. 판정을 가르는 양(f/W)이 보고값과 일치하게 만든
   * 기하이지 실제 획의 좌표가 아니다 — 파일이 오면 `real_ink`가 실좌표로 다시 낸다(#17).
   */
  const rw2 = 1180, rc2 = rw2 / 2, rh2 = 668 / 2;
  // 파일 2(brnl_2 · 11획 보고): 소실점 간격 d = 179px · f = 87.2 → 화각 163° — **거부 대역**
  const rd2 = 179, rf2 = 87.2;
  const disc2 = Math.sqrt(rd2 * rd2 - 4 * rf2 * rf2);
  const reported2 = fovGate(
    [rc2 - (rd2 + disc2) / 2, rh2], [rc2 + (rd2 - disc2) / 2, rh2], [rw2, 668]);
  // **버그 되살림**(A-4) — 상한이 없던 옛 게이트(reject_fov_deg = ∞)에서는 같은 입력이
  // **severe로 확정을 지나간다**. 이것이 표본이 실측한 그 구멍이다.
  const reported2Old = fovGate(
    [rc2 - (rd2 + disc2) / 2, rh2], [rc2 + (rd2 - disc2) / 2, rh2], [rw2, 668],
    { reject_fov_deg: Infinity });
  // 파일 1(15-16-18 · 13획 보고): f/W = 0.431 → 화각 98.6° — **경고(severe) 대역, 확정한다**
  const rf1 = 0.431 * rw2;
  const reported1 = fovGate([rc2 - rf1, rh2], [rc2 + rf1, rh2], [rw2, 668]);
  const bandCounts = [
    sweep.filter(s => s.band === "reject").length,
    sweep.filter(s => s.band === "severe").length,
    sweep.filter(s => s.band === "warn").length,
    sweep.filter(s => s.band === "ok").length,
  ];
  // **거부가 확정을 실제로 막는가**(12차 리뷰어 [7]) — 결함 진술("severe 경고만 받고
  // 확정을 지나갔다")의 판정 대상은 대역이 아니라 **확정 여부**인데 원장 필드가 없었다
  // (#40 ⑥의 자리). `stepRule`의 실제 확정 경로를 이 자리에서 돌린다 —
  // `vp_rules.test.ts` 배선 팔과 같은 픽스처(#17): 소실점 간격 120px → 화각 166°.
  const stBlock = newRuleState(SZ);
  stBlock.slots[0] = { kind: "vp", at: [420, SZ[1] / 2], source: "two_lines", support: 2 };
  stBlock.horizon = SZ[1] / 2;
  const rBlock = stepRule(stBlock, { a: [640, 436], b: [590, 386] }, SZ);
  const blockFov = rBlock.event.type === "rejected" ? rBlock.event.fov : undefined;
  const rejectBlocksConfirmation = rBlock.event.type === "rejected"
    && rBlock.state.slots[1] == null && blockFov?.band === "reject"
    && blockFov?.f != null;                        // f² > 0 — 상한 거부이지 f²≤0 거부가 아니다
  // **양성 채널**(#30 · 2차 리뷰어 [10]) — 같은 프로브 구성에서 소실점 간격만 벌리면
  // (severe 대역) 확정이 **선다**. 이것 없이는 위 true가 "게이트가 막았다"인지
  // "이 구성에서는 애초에 아무것도 안 선다"인지 안 갈린다(#40 ②).
  const stOk = newRuleState(SZ);
  stOk.slots[0] = { kind: "vp", at: [SZ[0] / 2 - 0.431 * SZ[0], SZ[1] / 2],
                    source: "two_lines", support: 2 };
  stOk.horizon = SZ[1] / 2;
  const toOk: Pt2 = [SZ[0] / 2 + 0.431 * SZ[0], SZ[1] / 2];
  const rOk = stepRule(stOk, { a: [toOk[0] - 200, toOk[1] + 200],
                               b: [toOk[0] - 100, toOk[1] + 100] }, SZ);
  const severeBandConfirms = rOk.event.type === "vp_fixed"
    && rOk.event.fov?.band === "severe" && rOk.state.slots[1] != null;
  return {
    what: "두 수평 소실점이 서 있을 수 있는 카메라를 내는가 — 대역과 거부",
    thresholds: FOV_GATE,
    /**
     * 이 절이 판정한 대상 수(#38 — 리뷰어 [12]가 정의 부재를 잡았다):
     * 쓸기 행 + 반례(f²≤0) + 화면 밖 + 실획 보고 셋(6차 · 12차 파일1·파일2) +
     * 옛 게이트 팔 + 확정 차단 배선 팔.
     */
    covered: sweep.length + 7,
    covered_note: "sweep + counter_example + off_screen + real_ink_reported + "
                + "reported_12(file1·file2·old_gate) + reject_blocks_confirmation",
    sweep,
    /**
     * `gate.reachability_value`가 가리키는 자리 — **reject · severe · warn · ok** 순(#40 값
     * 대조). ⚠ 12차 지시 1-c(화각 상한)로 **reject 칸이 앞에 늘었다** — 상한 전에는 f² > 0
     * 격자에서 reject가 안 나왔다(옛 산문 "쓸기는 f² > 0 격자라 reject가 안 나온다"는 그때의
     * 사실이고 지금은 거짓이다).
     */
    band_counts_ordered: bandCounts,
    counter_example: {
      what: "주점(480) 오른쪽에 둘 다 있는 소실점 — f² ≤ 0",
      band: sameSide.band, f: sameSide.f, why: sameSide.why,
    },
    off_screen_is_normal: {
      what: "화면 밖 소실점(±2400·3600)이 클램프 없이 계산에 들어가는가(지시 7-a)",
      band: farOff.band, d_over_w: Math.round(farOff.dOverW * 1000) / 1000,
      finite_vp_threshold_ratio: "VP_INFINITE_RATIO = 50 × 대각 — 화면 밖은 이 문턱 훨씬 안쪽이다",
      clamped: false,
    },
    real_ink_reported: {
      source: "6차 지시문 보고 — **그 파일은 sessions/에 없다**(⚠ 12차 정정 · 2차 리뷰어 [1]:"
            + " 'real_ink는 awaiting_samples'는 6차 시점 서술이다 — 지금은 8-17 표본 하나로"
            + " `real_ink.k_metrics.status = measured`다. 6차 보고 파일 자체는 여전히 없다)",
      vp0: [902, 157], vp1: [-231, 157], w: reportedW,
      d: Math.round(reported.d * 100) / 100,
      d_over_w: Math.round(reported.dOverW * 1000) / 1000,
      f: reported.f == null ? null : Math.round(reported.f * 100) / 100,
      f_over_w: reported.fOverW == null ? null : Math.round(reported.fOverW * 1000) / 1000,
      fov_deg: reported.fovDeg == null ? null : Math.round(reported.fovDeg * 100) / 100,
      band: reported.band,
    },
    /** 12차 두 표본의 회귀 팔(지시 1-f). 좌표는 보고 (f, d, W)의 **역산 재구성**이다(위 주석). */
    real_ink_reported_12: {
      source: "12차 지시문 보고 — **이 파일들도 sessions/에 도착하지 않았다**(b4f2d9b 선례). "
            + "reported: brunelleschi-2026-08-18T15-16-18(13획) · "
            + "reported_2: …T15-18-25_brnl_2(11획). "
            + "⚠⚠ **지시문 표기 'd/W'의 d는 소실점 간격이 아니라 시거리(= f)다**(#24 — 이 "
            + "게이트가 이미 한 번 빠진 단위 함정): 판독 근거는 파일 2가 f = 87.2와 "
            + "'d/W = 0.074'를 나란히 들었고 87.2/1180 = 0.0739가 그 값이라는 것이다 — 소실점 "
            + "간격이면 179/1180 = 0.152라 안 맞는다. 그러므로 파일 1의 0.431도 f/W다. "
            + "⚠ 이 원장의 `d`·`reported_d` 필드는 반대로 **소실점 간격**이다 — 이름이 "
            + "겹치므로 여기 적는다(2차 리뷰어 [8])",
      file1: {
        /** ⚠ 보고 표기는 "d/W 0.431"인데 그 d는 **시거리 = f**다(위 주석 — 판독 근거). */
        reported_f_over_w: 0.431,
        reported_absolute_px: null,
        f: reported1.f == null ? null : Math.round(reported1.f * 100) / 100,
        f_over_w: reported1.fOverW == null ? null : Math.round(reported1.fOverW * 1000) / 1000,
        fov_deg: reported1.fovDeg == null ? null : Math.round(reported1.fovDeg * 100) / 100,
        band: reported1.band,
        note: "경고(severe) 대역 — **확정은 지나간다**(지시 1-e: 표시가 남는 것이 맞는 동작). "
            + "⚠ **파일 1은 비율(f/W) 하나만 보고됐고 절대 px(f·소실점 간격)가 없다**"
            + "(리뷰어 [11] — 파일 2와 필드가 비대칭인 이유). 파일이 오면 실좌표로 다시 낸다",
      },
      file2: {
        reported_d: rd2, reported_f: rf2,
        /**
         * 재구성이 쓴 주점 기준 수평 거리 a·b(px) — `a·b = f²`, `a + b = d`의 해.
         * ⚠ 아래 `f` 필드가 `reported_f`와 같은 것은 **구성의 항등이다**(#5 유형 3 ·
         * 리뷰어 [9] — 초판이 "검산"이라 불렀다): a·b에서 f를 되뽑으면 정의상 87.2다.
         * 그 일치는 재구성 대수의 오타를 잡는 배선 확인일 뿐 측정이 아니다.
         */
        reconstructed_offsets_px: [Math.round((rd2 + disc2) / 2 * 100) / 100,
                                   Math.round((rd2 - disc2) / 2 * 100) / 100],
        d: Math.round(reported2.d * 100) / 100,
        f: reported2.f == null ? null : Math.round(reported2.f * 100) / 100,
        f_over_w: reported2.fOverW == null ? null : Math.round(reported2.fOverW * 1000) / 1000,
        fov_deg: reported2.fovDeg == null ? null : Math.round(reported2.fovDeg * 100) / 100,
        band: reported2.band,
        band_under_old_gate: reported2Old.band,
        note: "화각 상한 초과 — 거부. `band_under_old_gate`가 **버그 되살림**이다(A-4): "
            + "상한이 없으면 severe로 확정을 지나간다 — 표본이 실측한 그 구멍. "
            + "⚠ **`f`와 `reported_f`의 일치는 구성의 항등이다**(#5 유형 3 · 2차 리뷰어 [9]): "
            + "`reconstructed_offsets_px`가 a·b = f²의 해라서 f를 되뽑으면 정의상 87.2다 — "
            + "재구성 대수의 오타를 잡는 배선 확인일 뿐 측정이 아니다",
      },
    },
    gate: gate({
      registered: "f² ≤ 0이면 **거부**한다. **화각이 `FOV_GATE.reject_fov_deg`(120°)를 넘으면 "
                + "f² > 0이어도 거부한다**(12차 지시 1-c — 물리적으로 가능해도 쓸 수 없는 구간이 "
                + "있다. 실획 둘째 표본의 보고 기하가 그 증거다 — `real_ink_reported_12.file2`). "
                + "**f/W**(시거리 ÷ 화면 폭) < 0.87이면 경고하되 **확정은 막지 않는다**"
                + "(지시 7-b: 경고하고 확정하되 표시). 화면 밖 소실점은 **정상**이므로 거르지 "
                + "않는다. ⚠ **초판은 이 문장을 `d/W`로 적었고 6-R이 대역을 f/W로 옮겼는데 "
                + "등록문이 안 따라왔다** — 7차 항목 4에서 정정했다(#24: 단위가 다르면 같은 "
                + "임계가 아니다). **[7차 항목 4 추가]** 그 게이트가 **확정 경로에 걸려 있는지**는 "
                + "`vp_rules.test.ts`의 배선 팔이 잠근다(거부 · 양성 채널 · 2점 동시 경로 · "
                + "12차의 화각 상한 배선 둘).",
      reachability: "대역이 실제로 갈리는가 — **쓸기가 네 대역 전부를 낸다**(12차부터 상한 "
                  + "거부가 f² > 0 격자에서도 나온다 — 0.2·0.28 행). f² ≤ 0 거부는 "
                  + "`counter_example`이 따로 낸다. 한 대역만 나오면 판정이 아니다(#30). "
                  + "`reachability_value`는 `band_counts_ordered` = **[reject, severe, warn, ok]** "
                  + "순이다",
      reachability_value: bandCounts,
      reachability_source: "fov_gate/band_counts_ordered",
      result: { same_side_rejected: sameSide.band === "reject",
                real_ink_band: reported.band, real_ink_fov_deg: reported.fovDeg,
                reported12_file1_band: reported1.band,
                reported12_file2_band: reported2.band,
                reported12_file2_band_under_old_gate: reported2Old.band,
                /** 거부 대역에서 **확정이 실제로 안 선다**(stepRule 실행 — 리뷰어 [7]). */
                reject_blocks_confirmation: rejectBlocksConfirmation,
                /** 그 양성 채널 — severe 대역(간격만 벌림)은 확정이 선다(2차 리뷰어 [10]). */
                severe_band_confirms: severeBandConfirms },
    }),
  };
}

// ---------------------------------------------------------------- 11. 세 번째 선이 정한다

/**
 * **옛 규칙(두 선 즉시 확정)을 되살려 실제로 틀리는지 확인한다**(A-4의 버그 되살림).
 * 지운 코드와 같은 계산이다 — 짝의 각차가 가장 큰 교점을 곧바로 소실점으로 받는다.
 */
function oldRuleFirstVp(pool: RLine[], imgSize: [number, number]): { at: Pt2; pair: [number, number] } | null {
  const mergePx = SNAP_TOL.merge_ratio * Math.hypot(imgSize[0], imgSize[1]);
  let best: { at: Pt2; sep: number; pair: [number, number] } | null = null;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const at = lineIntersect(pool[i].a, pool[i].b, pool[j].a, pool[j].b);
    if (!at || !isFiniteVp(at, imgSize)) continue;
    const ends = [pool[i].a, pool[i].b, pool[j].a, pool[j].b];
    if (ends.some(e => Math.hypot(e[0] - at[0], e[1] - at[1]) <= mergePx)) continue;
    const sep = Math.abs(convergeDeg(pool[i], at) - convergeDeg(pool[j], at));
    if (!best || sep > best.sep) best = { at, sep, pair: [i, j] };
  }
  return best ? { at: best.at, pair: best.pair } : null;
}

/**
 * **겨냥 잡음**(6차 리뷰어 [3]) — 초판은 손 오차 없이 정확히 소실점을 향해 그었고, 그러면
 * `first_vp_error_px`의 0은 **측정이 아니라 교점의 정의**다(#5 자기참조 유형 3). 실획 보고의
 * Δ0.0~1.7°를 끝점 흔들기로 넣는다 — 그러면 0이 **보장이 아니라 관측**이 되고
 * `RULE_TOL.concurrent_deg = 3°`가 실제로 시험된다(그 각을 넘으면 모임이 안 잡힌다).
 */
const AIM_JITTER_DEG = 1.7;

/**
 * **참 소실점을 맞혔다고 보는 창** — 그 소실점까지 거리의 비. 겨냥 잡음 1.7°가 그 자리에서
 * 만드는 어긋남(≈ `tan(1.7°) = 0.030`)보다 조금 넉넉하다. **절대 px가 아닌 이유**는 소실점
 * 거리가 구도마다 1000~2000px로 갈리기 때문이다(#24: 같은 자로 재야 한다).
 */
const NEAR_RATIO = 0.05;

function ruleThreeSection() {
  const r = rng32(20260818);
  const N = 120;
  const H = 300;
  let oldWrong = 0, newWrong = 0, newWaited = 0, newTwoPoint = 0;
  const oldErr: number[] = [], newErr: number[] = [];
  /**
   * **대조 팔**(6차 리뷰어 [3·1]) — 옛 규칙이 **틀릴 수밖에 없는** 구도만 주면 120/120은
   * 픽스처 설계의 재진술이지 판별이 아니다. 그래서 **같은 축 둘이 먼저 오는** 구도를 같은 수만큼
   * 돌린다: 거기서는 옛 규칙이 **맞아야** 하고, 맞으면 그 팔이 눈뜬 것이다(#30).
   */
  let ctrlOldWrong = 0, ctrlNewWrong = 0;
  /** **옛 절대 창(40px)의 결과** — 창을 바꾼 것이 결론을 만든 것이 아님을 보이려고 함께 낸다. */
  let oldWrong40 = 0, newWrong40 = 0;
  /**
   * **각차 기준 팔**(2026-08-18 7차 지시 2-2 · 7-R 리뷰어 [①-a]).
   *
   * 지시문은 "어느 둘이 같은 축인가 — **각도 유사도**. 셋 중 가까운 둘이 한 축"이라 적었고
   * 구현은 `far`(교점까지의 거리)를 쓴다. 6차 문서가 그 대체의 근거로 "합성 400구도에서
   * 각차 399 · 거리 400"을 인용했는데 **그 수는 어느 원장에도 없었다**(#25 — 원장 밖 측정).
   * 그래서 **여기서 실제로 돌린다**: 같은 입력·같은 잡음에서 두 선택자의 묶음 정오를 나란히 낸다.
   * ⚠ 두 선택자는 `resolvePool`의 ④(셋이 안 모일 때)만 갈린다 — ①(셋이 모인다)은 공통이다.
   */
  let angleWrong = 0, farWrong = 0, ctrlAngleWrong = 0, ctrlFarWrong = 0;
  let implWrongMain = 0, implWrongCtrl = 0;
  /**
   * **왜 현행 구현이 각차 기준만큼 못 하는가**(#7 — 추측 말고 카운터).
   * 각차 기준은 **모든 짝**을 보고 현행 구현은 `poolCandidates`를 지난 짝만 본다.
   * 참 짝(같은 축의 둘)이 그 문에서 걸리면 어떤 선택자도 못 고른다.
   */
  const dropped = { merge: 0, beyond: 0, infinite: 0, survived: 0 };
  /** **`far` 분포**(7-R 리뷰어 [②-a]) — 묶음이 맞은 구도와 틀린 구도에서 그 값이 갈리는가.
   *  지시 2-3("셋이 다 다르면 알린다")이 임계를 걸 수 있는 자리인지의 근거다. */
  const farOkList: number[] = [], farBadList: number[] = [];
  /** 두 선택자는 **하네스가 직접 구현한다** — 구현이 바뀌어도 이 표가 안 낡는다(#1·#34).
   *  현행 구현의 값은 `impl_wrong`이고 그것이 `resolvePool`을 그대로 부른다. */
  /** 각차 기준 선택자 — **셋 중 각차가 가장 작은 짝**이 한 축이다(지시 2-2 문자 그대로). */
  const pickByAngle = (pool: RLine[]): [number, number] | null => {
    let best: [number, number] | null = null, bestSep = Infinity;
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const sp = sepDeg(pool[i], pool[j]);
      if (sp < bestSep) { bestSep = sp; best = [i, j]; }
    }
    return best;
  };
  /** 무리 중심에서 교점까지의 거리 — `poolCandidates`의 `far`와 같은 정의다(#17). */
  const farOf = (pool: RLine[], at: Pt2): number => {
    const cx = pool.reduce((t, l) => t + (l.a[0] + l.b[0]) / 2, 0) / pool.length;
    const cy = pool.reduce((t, l) => t + (l.a[1] + l.b[1]) / 2, 0) / pool.length;
    return Math.hypot(at[0] - cx, at[1] - cy);
  };
  /** 거리 기준 선택자(6차 판) — **교점이 무리 중심에서 가장 먼 짝**. */
  const pickByFar = (pool: RLine[]): [number, number] | null => {
    let best: [number, number] | null = null, bestFar = -1;
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const at = lineIntersect(pool[i].a, pool[i].b, pool[j].a, pool[j].b);
      if (!at || !isFiniteVp(at, SZ)) continue;
      const f = farOf(pool, at);
      if (f > bestFar) { bestFar = f; best = [i, j]; }
    }
    return best;
  };
  /** 잡음을 준 끝점 — 시작점 둘레로 `AIM_JITTER_DEG` 안에서 방향을 흔든다. */
  const jitter = (l: RLine): RLine => {
    const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1];
    const th = ((r() * 2 - 1) * AIM_JITTER_DEG * Math.PI) / 180;
    const c = Math.cos(th), sn = Math.sin(th);
    return { a: l.a, b: [l.a[0] + dx * c - dy * sn, l.a[1] + dx * sn + dy * c] };
  };
  for (let n = 0; n < N; n++) {
    // 참 2점 구도 — 주점을 사이에 둔 두 소실점(f² > 0)
    const VA: Pt2 = [SZ[0] / 2 + 700 + r() * 1200, H];
    const VB: Pt2 = [SZ[0] / 2 - 700 - r() * 1200, H];
    const mk = (v: Pt2): RLine => {
      const from: Pt2 = [200 + r() * 560, 460 + r() * 200];
      return toward(from, v, 0.25 + r() * 0.25);
    };
    // **다른 축의 대각선 둘을 먼저 긋는다** — 지시 11이 지목한 그 순서다
    const l1 = jitter(mk(VA)), l2 = jitter(mk(VB)), l3 = jitter(mk(VA));
    /**
     * **참 소실점을 맞혔는가 — 창이 거리에 비례한다**(6차 리뷰어 [3]의 후속).
     *
     * ⚠⚠ **초판의 절대 40px는 잡음을 넣자 무의미해졌다**: 소실점이 1000~2000px 밖에 있으므로
     * 겨냥 오차 1.7°가 그 자리에서 **30~60px**이 된다. 즉 40px 창은 손 오차 자체를 거른다 —
     * **규칙의 판별력이 아니라 잡음의 크기를 재게 된다**(#24: 프레임이 안 맞는 임계).
     * 그래서 창을 **그 소실점까지 거리의 비**로 둔다. 절대 px 분포는 따로 남긴다.
     * ⚠ **모집단이 바뀌었으므로 등록 기준도 다시 적는다**(#26 — 낮춘 것이 아니라 **같은 양이
     * 아니게 된 것**이다. 옛 창의 결과도 원장에 함께 남겨 둘을 견줄 수 있게 한다).
     */
    const errTo = (p: Pt2, v: Pt2) => Math.hypot(p[0] - v[0], p[1] - v[1]);
    /** 옛 절대 창(40px) — 위치 기준. **잡음이 들어가면 규칙이 아니라 조건수를 잰다**(아래 주석). */
    const nearTrue40 = (p: Pt2 | null) =>
      !!p && Math.min(errTo(p, VA), errTo(p, VB)) <= 40;

    // ---- **대조 팔** — 같은 축 둘이 먼저 온다. 옛 규칙이 **맞아야** 하는 구도다
    const c1 = jitter(mk(VA)), c2 = jitter(mk(VA)), c3 = jitter(mk(VB));
    const ctrlAxis = [0, 0, 1];                     // c1→VA · c2→VA · c3→VB
    const ctrlOld = oldRuleFirstVp([c1, c2], SZ);
    if (!ctrlOld || ctrlAxis[ctrlOld.pair[0]] !== ctrlAxis[ctrlOld.pair[1]]) ctrlOldWrong += 1;
    const ctrlNew = resolvePool([c1, c2, c3], SZ, false);
    const ctrlGrouped = !!ctrlNew
      && ctrlNew.members.every(k => ctrlAxis[k] === ctrlAxis[ctrlNew.members[0]]);
    if (!ctrlGrouped) ctrlNewWrong += 1;
    if (!ctrlGrouped) implWrongCtrl += 1;
    const ctrlAng = pickByAngle([c1, c2, c3]);
    if (!ctrlAng || ctrlAxis[ctrlAng[0]] !== ctrlAxis[ctrlAng[1]]) ctrlAngleWrong += 1;
    const ctrlFarP = pickByFar([c1, c2, c3]);
    if (!ctrlFarP || ctrlAxis[ctrlFarP[0]] !== ctrlAxis[ctrlFarP[1]]) ctrlFarWrong += 1;

    // 옛 규칙 — 두 선만으로 확정한다
    // **옛 규칙** — 두 선만으로 확정한다. `axisOf`는 그 선이 겨눈 참 축이다
    const axisOf = [0, 1, 0];                       // l1→VA · l2→VB · l3→VA
    const oldR = oldRuleFirstVp([l1, l2], SZ);
    // **규칙이 실제로 정하는 것은 "어느 둘이 같은 축인가"다**(지시 11-2) — 그것을 잰다
    if (!oldR || axisOf[oldR.pair[0]] !== axisOf[oldR.pair[1]]) oldWrong += 1;
    if (!nearTrue40(oldR?.at ?? null)) oldWrong40 += 1;
    if (oldR) {
      oldErr.push(Math.min(errTo(oldR.at, VA), errTo(oldR.at, VB)));
    }
    // 새 규칙 — 둘은 대기, 셋째가 정한다
    expect(resolvePool([l1, l2], SZ, false)).toBeNull();
    newWaited += 1;
    const got = resolvePool([l1, l2, l3], SZ, false);
    // 새 규칙이 고른 묶음이 **전부 같은 참 축**인가
    const grouped = !!got && got.members.every(k => axisOf[k] === axisOf[got.members[0]]);
    if (!grouped) newWrong += 1;
    if (!nearTrue40(got?.at ?? null)) newWrong40 += 1;
    if (got) {
      newErr.push(Math.min(errTo(got.at, VA), errTo(got.at, VB)));
      if (got.rest.length) newTwoPoint += 1;
      // **`far` 분포**(7-R [②-a]) — 맞은 묶음과 틀린 묶음에서 갈리는가
      (grouped ? farOkList : farBadList).push(farOf([l1, l2, l3], got.at));
    }
    // **참 짝이 후보 문을 지나는가**(#7) — 같은 축인 (l1, l3)
    {
      const P = [l1, l2, l3];
      const at = lineIntersect(l1.a, l1.b, l3.a, l3.b);
      const mergePx = SNAP_TOL.merge_ratio * Math.hypot(SZ[0], SZ[1]);
      if (!at || !isFiniteVp(at, SZ)) dropped.infinite += 1;
      else if ([l1.a, l1.b, l3.a, l3.b].some(e =>
                 Math.hypot(e[0] - at[0], e[1] - at[1]) <= mergePx)) dropped.merge += 1;
      else if (!beyondSegment(l1, at) || !beyondSegment(l3, at)) dropped.beyond += 1;
      else dropped.survived += 1;
      void P;
    }
    // **각차 기준 대 거리 기준**(7차 지시 2-2) — 같은 입력에서 나란히 센다.
    // 셋째 열(`impl_wrong`)이 **현행 `resolvePool`**이다
    if (!grouped) implWrongMain += 1;
    const ang = pickByAngle([l1, l2, l3]);
    if (!ang || axisOf[ang[0]] !== axisOf[ang[1]]) angleWrong += 1;
    const farP = pickByFar([l1, l2, l3]);
    if (!farP || axisOf[farP[0]] !== axisOf[farP[1]]) farWrong += 1;
  }
  // **무잡음 팔**(#25 — "15 → 3"을 산문이 아니라 필드로 남긴다).
  const r0 = rng32(20260818);
  let noJitterWrong = 0;
  for (let n = 0; n < N; n++) {
    const VA: Pt2 = [SZ[0] / 2 + 700 + r0() * 1200, H];
    const VB: Pt2 = [SZ[0] / 2 - 700 - r0() * 1200, H];
    const mk = (v: Pt2): RLine => {
      const from: Pt2 = [200 + r0() * 560, 460 + r0() * 200];
      return toward(from, v, 0.25 + r0() * 0.25);
    };
    const pool = [mk(VA), mk(VB), mk(VA)];
    const ax = [0, 1, 0];
    const g = resolvePool(pool, SZ, false);
    if (!g || !g.members.every(k => ax[k] === ax[g.members[0]])) noJitterWrong += 1;
  }
  return {
    what: ("규칙이 정하는 것 = **어느 둘이 같은 축인가**(지시 11-2). 그 묶음이 맞는가를 잰다 — "
         + "소실점의 **위치**가 아니다"),
    /** 잡음 0에서의 같은 값 — D-L69·AS-L28이 인용하는 수의 출처다(#25: 산문에 안 둔다). */
    no_jitter_wrong: noJitterWrong,
    /**
     * ⚠⚠ **위치로 재지 않는 이유**(6차 리뷰어 [3]의 후속 실측). 겨냥 잡음 1.7°를 넣자
     * 절대 40px 창에서 **새 규칙도 116/120**이 "틀림"으로 나왔다. 원인은 규칙이 아니라
     * **조건수**다: 같은 먼 소실점을 향한 두 선은 거의 나란하므로, 1.7°의 각 오차가 교점을
     * 수백 px 옮긴다(`first_vp_error_px`의 꼬리가 그것이다). 그 값은 **손 오차의 크기**이지
     * 규칙의 판별력이 아니다(#24: 같은 자로 재야 한다 · #3: 지표가 정의의 귀결일 수 있다).
     * **규칙이 실제로 정하는 것은 묶음이다** — 그것을 잰다. 위치 오차는 관측으로 함께 남긴다.
     */
    metric: "grouped_correctly = 고른 짝(또는 묶음)의 선들이 전부 같은 참 축을 겨눴는가",
    compositions: N,
    seed: 20260818,
    concurrent_deg: RULE_TOL.concurrent_deg,
    aim_jitter_deg: AIM_JITTER_DEG,
    /**
     * **대조 팔**(리뷰어 [3·1]) — 같은 축 둘이 먼저 오는 같은 수의 구도.
     * 여기서 옛 규칙이 **맞으면** 위의 120/120이 픽스처 설계의 재진술이 아니다.
     */
    control_same_axis_first: { of: N, old_wrong: ctrlOldWrong, new_wrong: ctrlNewWrong },
    /**
     * **옛 절대 창(40px)의 위치 판정** — 잡음을 넣으면 **두 규칙 다** 거의 전부 "틀림"이다.
     * 조건수가 지배한다는 실측이고, 지표를 묶음으로 바꾼 근거다.
     */
    absolute_40px_window: { old_wrong: oldWrong40, new_wrong: newWrong40, of: N,
                            note: "잡음 1.7°에서는 규칙이 아니라 교점의 조건수를 잰다" },
    old_rule: { wrong: oldWrong, of: N, error_samples: oldErr.length,
                first_vp_error_px: stat(oldErr) },
    new_rule: { wrong: newWrong, of: N, error_samples: newErr.length,
                first_vp_error_px: stat(newErr),
                waited_at_two_lines: newWaited,
                two_point_in_one_step: newTwoPoint },
    /**
     * **지시 2-2가 명시한 기준(각도 유사도) 대 구현(거리)** — 7차 지시 2-2 · 7-R 리뷰어 [①-a].
     * 6차 문서가 인용하던 "400구도 각차 399 · 거리 400"은 **어느 원장에도 없던 수다**(#25).
     * 이것이 그 자리를 대신하는 **실제 실행**이다. 같은 입력·같은 잡음·같은 시드.
     * ⚠ 두 팔의 분모는 같고(N) 묶음 정오의 정의도 같다(#11).
     */
    angle_vs_far: {
      main_arm: { of: N, angle_wrong: angleWrong, far_wrong: farWrong, impl_wrong: implWrongMain },
      control_arm: { of: N, angle_wrong: ctrlAngleWrong, far_wrong: ctrlFarWrong,
                     impl_wrong: implWrongCtrl },
      both_arms: { of: 2 * N, angle_wrong: angleWrong + ctrlAngleWrong,
                   far_wrong: farWrong + ctrlFarWrong,
                   impl_wrong: implWrongMain + implWrongCtrl },
      note: "각차 기준은 **셋 중 각차가 가장 작은 짝**을 한 축으로 본다(지시 2-2 문자 그대로). "
          + "거리 기준은 현행 `resolvePool` ④다. ⚠ 두 선택자는 ④에서만 갈린다 — 셋이 모이는 "
          + "구도(①)는 공통 경로이므로 이 표의 차이는 **④에서만 난 것**이다. "
          + "`impl_wrong`은 **현행 `resolvePool`**을 그대로 부른 값이다 — 두 선택자는 하네스가 "
          + "직접 구현하므로 구현이 바뀌어도 이 표가 안 낡는다(#1·#34).",
      /**
       * **격차의 출처**(#7) — 각차 기준은 **모든 짝**을 보고 구현은 `poolCandidates`를 지난
       * 짝만 본다. 참 짝(같은 축의 둘)이 그 문에서 걸리면 어떤 선택자도 못 고른다.
       * 주 팔 120구도에서 참 짝이 어느 문에 걸렸는가:
       */
      true_pair_gate: dropped,
    },
    /**
     * **`far` 분포**(7-R 리뷰어 [②-a]) — 지시 2-3("셋이 다 다르면 알린다")에 임계를 걸 수 있는가.
     * 맞은 묶음과 틀린 묶음의 분포가 겹치면 `far` 하나로는 못 가른다.
     * ⚠ **이것은 임계를 고르는 표가 아니라 "고를 수 있는가"의 표다**(#12: 동작점 하나·#13).
     */
    far_distribution: {
      grouped_ok: stat(farOkList), grouped_wrong: stat(farBadList),
      note: "겹치면 `far` 하나로 '잘못 그었다'를 못 가른다 — 그때는 지시 2-3의 알림에 다른 "
          + "신호가 필요하다. 분모: 소실점을 실제로 낸 구도만(#11).",
    },
    /** 분모가 왜 갈리는가(#11) — `wrong`은 **못 낸 것도 틀림**으로 세고, 오차 분포는 **낸 것만** 센다. */
    denominators: "wrong = N(못 낸 것 포함) · first_vp_error_px.n = 소실점을 실제로 낸 구도 수",
    gate: gate({
      registered: "① 다른 축의 대각선 둘로는 **아무 소실점도 안 선다**(대기 N/N). "
                + "② 셋째 선이 오면 **같은 축의 선들끼리 묶는다**(묶음 틀림 0/N). "
                + "⚠⚠ 등록 지표를 **위치(40px)에서 묶음으로** 바꿨다 — 겨냥 잡음 1.7°에서 "
                + "위치 창은 **규칙이 아니라 교점의 조건수**를 재고(두 규칙 다 ~116/120 '틀림') "
                + "그러면 어느 규칙도 통과할 수 없다. **기준을 무른 것이 아니라 같은 양이 아니게 "
                + "된 것**이고, 옛 창의 값도 `absolute_40px_window`에 함께 남긴다(#26·#24). "
                + "옛 규칙은 같은 입력에서 전부 틀린다",
      reachability: "옛 규칙 팔이 **버그를 되살린 것**이다 — 같은 하네스·같은 입력에서 틀린 수가 "
                  + "0이 아니어야 이 시험에 판별력이 있다(#30). 그 수가 도달 가능성의 값이다",
      reachability_value: oldWrong,
      reachability_source: "vp_rule_three/old_rule/wrong",
      result: { new_wrong: newWrong, old_wrong: oldWrong, waited: newWaited,
                // **두 팔을 합친 분모**(6차 리뷰어) — 주 팔만 적으면 대가가 안 보인다
                both_arms: { of: 2 * N, new_wrong: newWrong + ctrlNewWrong,
                             old_wrong: oldWrong + ctrlOldWrong },
                no_jitter_wrong: noJitterWrong,
                passed_wait: newWaited === N, passed_correct: newWrong === 0 },
      status: newWrong === 0 ? "통과" : "**②가 미달이다 — 기준을 낮추지 않는다**(#26)",
      note: (
        "②가 안 맞는 몫은 **세 선이 두 축으로 갈리는 구도의 본래적 모호성**이다: 대각선 셋과 "
        + "축 둘이면 2+1 쪼개기가 기하적으로 둘 이상 성립할 수 있고, 어느 쪽인지는 **더 그어야** "
        + "정해진다. 줄인 수단 둘은 원장에 남는다 — ⓐ 교점이 **두 선의 연장 위**에 있어야 한다"
        + "(그린 구간 안의 교차는 모서리다: 틀림 15 → 3) ⓑ **무리 중심에서 먼** 교점을 고른다"
        + "(소실점은 멀고 '공간의 한 점'은 가깝다). ⚠ 합성은 이 설계에 구조적으로 불리하다"
        + "(AS-L24·L25) — 합성 잉크에는 축의 의도가 없다. **실획이 판정자다.**"
      ),
    }),
  };
}

// ---------------------------------------------------------------- 원장

describe("6차 지시 1·2·7·11 — 확정 뷰 · 끝점 프로브 · 화각 게이트 · 세 번째 선", () => {
  it("네 절을 재고 원장에 남긴다", () => {
    const confirm_view = confirmViewSection();
    const end_probe = endProbeSection();
    const fov_gate = fovSection();
    const vp_rule_three = ruleThreeSection();

    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "confirm_rules.json"), JSON.stringify({
      spec: "2026-08-18 6차 지시 1·2·7·11. 앱과 하네스가 같은 함수를 부른다(#17).",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      why: (
        "실획 첫 표본의 보고가 넷을 짚었다: 확정 뷰 자세 null · 끝점 스냅 전무 · 2점 확정의 "
        + "화각 게이트 부재 · 다른 축의 대각선 둘이 1점으로 굳음. **보고된 파일 자체는 "
        + "저장소에 없다**(⚠ 12차 정정 — 리뷰어 [8]: 초판의 '`sessions/`가 비어 있다'는 6차 "
        + "시점 서술이고 지금은 8-17 표본 **하나**가 있어 `real_ink.k_metrics.status`가 "
        + "`measured`(n_docs는 그 필드를 읽는다)다. 6차 보고 표본과 12차 두 표본은 여전히 "
        + "미도착이다). 그래서 여기서는 보고된 증상을 **코드에서** 재현·판정하고, 수치가 "
        + "필요한 자리는 합성 구도로 잰다."
      ),
      what_this_does_not_say: [
        "**실획이 아니다.** 보고된 표본 파일들(6차 · 12차 둘)은 저장소에 없다 — "
        + "`fov_gate.real_ink_reported*`의 입력은 **지시문이 보고한 수**이고 파일 측정이 "
        + "아니다(⚠ 12차 정정: `sessions/`에는 8-17 표본 하나가 있고 `real_ink`는 그것으로 "
        + "`measured`다 — '비어 있다'는 6차 시점 서술이었다).",
        "**`confirm_view`의 분모는 뷰 하나다.** 지시 1을 기각한 근거는 술어의 성질이지 표본이 "
        + "아니다 — 이 절은 통계가 아니라 불변 확인이다(6차 리뷰어 [4]).",
        "**그리드의 방향이 맞다는 것을 여기서 재지 않았다** — 확정 카메라의 격자와 사용자 "
        + "깊이선의 각차를 잰 값이 원장에 없다(리뷰어 [4]ⓒ). `DEFERRED`에 등재했다.",
        "**`fov_gate.sweep`는 주점 정중앙 배치뿐이다.** 대역은 `f/W`가 가르므로 비대칭 배치도 "
        + "담기지만 **그 방향의 동작점은 안 쟀다**(리뷰어 [4·5]).",
        "**합성은 이 설계의 판정자가 아니다**(AS-L24·L25) — 합성 잉크에는 축의 의도가 없다. "
        + "`vp_rule_three`는 규칙의 **기하적 판별력**을 재지 실사용 정확도를 안 잰다.",
        "**중단 조건 게이트(`camera_gate.json`)는 이 변경을 안 지난다** — 그 하네스는 소실점을 "
        + "직접 주고 `recoverCamera`만 부른다(`resolvePool`을 안 지난다). 그 원장이 안 움직인 "
        + "것은 **안전의 증거가 아니라 사정거리 밖이라는 뜻**이다(리뷰어 #41).",
        "**`beyondSegment`의 위약 팔이 없다**(#39) — 같은 수의 후보를 무관한 기준으로 지운 팔을 "
        + "안 돌렸으므로, 무잡음 15 → 3이 '연장선 위'라는 성질의 몫인지 '후보를 줄인 것'의 "
        + "몫인지 안 갈렸다.",
        "**겨냥 잡음도 시드도 동작점 하나다**(#12·#14) — `aim_jitter_deg 1.7`(실획 보고 구간 "
        + "0.0~1.7의 **끝**) · `seed 20260818`. 무잡음에서 같은 하네스가 `no_jitter_wrong`을 "
        + "내므로 **결과가 잡음에 강하게 반응한다**. 7/120도 대조 팔의 24/120도 그 한 점의 값이다.",
        "**대조 팔의 `old_wrong = 0`은 구성의 항등에 가깝다**(리뷰어) — 옛 규칙의 묶음 정오는 "
        + "'첫 두 선이 같은 축인가'와 동치이고 그 순서를 정한 것이 픽스처다. 그 팔이 보인 것은 "
        + "**지표가 0과 120을 모두 낸다**(양방향 도달 가능, #30)는 것이지 120/120의 비자명성이 아니다.",
        "**위치를 구속하는 등록 기준이 없다** — 지표를 묶음으로 옮기면서 위치가 게이트에서 빠졌다. "
        + "카메라는 위치에서 나온다.",
      ],
      confirm_view, end_probe, fov_gate, vp_rule_three,
    }, null, 2) + "\n");

    // ---- 1. 확정 뷰
    expect(confirm_view.confirm_pose_null).toBe(true);
    expect(confirm_view.round_trip_pose_null).toBe(true);
    expect(confirm_view.counter_example.is_confirm_after).toBe(false);   // **반례**(#30)

    // ---- 2. 끝점 프로브 — 세 사유가 전부 관측된다(#38: 덮는 대상 수)
    expect(end_probe.verdict_counts.snapped).toBeGreaterThan(0);
    expect(end_probe.verdict_counts.radius_too_small).toBeGreaterThan(0);
    expect(end_probe.verdict_counts.no_candidate).toBeGreaterThan(0);

    // ---- 7. 화각 게이트
    expect(fov_gate.counter_example.band).toBe("reject");
    expect(fov_gate.off_screen_is_normal.band).toBe("ok");              // 화면 밖은 정상이다
    expect(fov_gate.sweep.find(s => s.f_over_w === 0.4)!.band).toBe("severe");
    expect(fov_gate.sweep.find(s => s.f_over_w === 1.5)!.band).toBe("ok");
    // **경계가 화각과 맞는가**(리뷰어 [5]) — f/W = 0.5가 정확히 90°, 0.87이 60° 언저리다
    expect(fov_gate.sweep.find(s => s.f_over_w === 0.5)!.fov_deg).toBeCloseTo(90, 1);
    expect(fov_gate.sweep.find(s => s.f_over_w === 0.87)!.fov_deg!).toBeLessThan(60.5);
    // **실획 보고 값은 화각 98.75°다** — 초판은 d에 임계를 걸어 이것을 `ok`라 했다(리뷰어 [5])
    expect(fov_gate.real_ink_reported.band).toBe("severe");
    // ---- 12차 지시 1-c — **화각 상한**. 경계(0.5/tan60° ≈ 0.2887)를 사이에 둔 두 행이 갈린다
    expect(fov_gate.sweep.find(s => s.f_over_w === 0.28)!.band).toBe("reject");
    expect(fov_gate.sweep.find(s => s.f_over_w === 0.29)!.band).toBe("severe");
    expect(fov_gate.sweep.find(s => s.f_over_w === 0.2)!.band).toBe("reject");
    // 12차 두 표본(보고 기하 재구성, 지시 1-f) — 파일1은 경고 후 확정, 파일2는 거부
    expect(fov_gate.real_ink_reported_12.file1.band).toBe("severe");
    expect(fov_gate.real_ink_reported_12.file2.band).toBe("reject");
    expect(fov_gate.real_ink_reported_12.file2.fov_deg!).toBeGreaterThan(160);
    // **버그 되살림**(A-4) — 상한을 빼면(∞) 같은 입력이 severe로 확정을 지나간다
    expect(fov_gate.real_ink_reported_12.file2.band_under_old_gate).toBe("severe");
    // ⚠ **구성의 항등이다**(#5 유형 3 · 리뷰어 [9] — 초판이 "검산"이라 불렀다):
    // a·b = f²의 해에서 f를 되뽑으면 정의상 87.2다. 재구성 대수의 오타를 잡는 배선
    // 확인일 뿐이고 측정 정보가 없다 — 임계가 아니라 항등 가드로 둔다.
    expect(fov_gate.real_ink_reported_12.file2.f!).toBeCloseTo(87.2, 1);
    // **거부가 확정을 실제로 막는다**(리뷰어 [7]) — stepRule 실행의 결과다
    expect((fov_gate.gate.result as { reject_blocks_confirmation: boolean })
      .reject_blocks_confirmation).toBe(true);
    // 그 양성 채널(#30 · 2차 [10]) — severe 대역은 같은 프로브에서 확정이 선다
    expect((fov_gate.gate.result as { severe_band_confirms: boolean })
      .severe_band_confirms).toBe(true);

    // ---- 11. 세 번째 선
    // **①은 설계 보장이라 단언한다**(대기는 규칙 자체다)
    expect(vp_rule_three.new_rule.waited_at_two_lines).toBe(vp_rule_three.compositions);
    // **②** 묶음이 맞는가
    expect(vp_rule_three.new_rule.wrong).toBeLessThan(vp_rule_three.old_rule.wrong / 4);
    // **버그 되살림이 실제로 잡는가**(A-4) — 안 잡으면 위 단언이 아무것도 배제하지 않는다
    expect(vp_rule_three.old_rule.wrong).toBeGreaterThan(0);
    // ⚠⚠ **대조 팔이 눈뜬 것인가**(6차 리뷰어 [3·1]) — 같은 축 둘이 먼저 오는 구도에서는
    // **옛 규칙도 맞아야** 한다. 안 맞으면 위의 "옛 규칙 전부 틀림"은 픽스처 설계의 재진술이다
    expect(vp_rule_three.control_same_axis_first.old_wrong)
      .toBeLessThan(vp_rule_three.old_rule.wrong / 4);
  });

  it("`convergeDeg`는 각을 재지 길이 비를 재지 않는다 — 초판이 틀린 자리(#24)", () => {
    // 짧은 획 + **가까운** 점: 수직거리 ÷ 길이는 작아도 각은 크다
    const short = line([420, 600], [744, 520.8]);
    const near: Pt2 = [450, 602];
    expect(vpMisfit({ a: short.a, b: short.b, len: 333.5, bend: 0 }, near))
      .toBeLessThan(AXIS_TOL.vp_dist_ratio);                 // 옛 판정은 "모인다"고 했다
    expect(convergeDeg(short, near)).toBeGreaterThan(RULE_TOL.concurrent_deg);   // 각은 아니다
  });

  it("**반례** — 세 선이 갈리면 2점이 한 번에 서고, 화각이 안 되면 첫 소실점만 선다", () => {
    // 주점 한쪽에 몰린 두 방향 — 두 번째 소실점이 화각 게이트에 막힌다
    const VA: Pt2 = [1500, 300], VBad: Pt2 = [1100, 300];
    let st = newRuleState(SZ);
    st = stepRule(st, toward([300, 640], VA, 0.3), SZ).state;
    st = stepRule(st, toward([420, 600], VA, 0.3), SZ).state;
    const r = stepRule(st, toward([600, 640], VBad, 0.3), SZ);
    expect(r.event.type).toBe("vp_fixed");
    expect(r.state.slots[1]).toBeNull();               // **막혔다** — 첫 소실점만 선다
    expect(perspectiveOrder(r.state)).toBe(0);
  });
});
