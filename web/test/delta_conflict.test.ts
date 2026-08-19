// **Δ 대푯값 충돌의 분해**(2026-08-19 13차 항목 4) — 두 표본 사이의 겨냥 각차 대푯값
// (Δ0.0~1.7 보고 ↔ Δ0.0~20.8 보고 · 실측은 real_ink.per_doc)이 왜 갈리는가의 후보 셋을
// 합성·실좌표로 가른다:
//   ① 화각 163° 카메라의 angleWiden 폭발 — 극단 카메라에서 배정 허용이 넓어져
//      큰 Δ의 획도 축을 받는다(축을 받아야 Δ 표에 나타난다 — 선택 절단 #5의 반대면)
//   ② 무앵커 무스냅 경로 — 12차 항목 2의 수리(무앵커 획도 확정 시 2D 판을 지난다)가
//      조리개 안 겨냥의 Δ를 0으로 당긴다. 조리개 밖은 그대로다(수리의 사거리)
//   ③ rank_margin 완화 배정 — 절대 임계 밖인데 상대 순위로 받는 배정(verdict.relative)
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke, angleWiden, representative, vpMisfit, AXIS_TOL } from "../src/s3d/axis.js";
import { dirSnap2dCore } from "../src/s3d/resolve2d.js";
import { fovGate, FOV_GATE } from "../src/s3d/vpRules.js";
import { CamState } from "../src/ui/camState.js";
import { axisDirection } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { vpDirErrDeg } from "./vpDirErr.js";
import { gate } from "./gate.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SESSIONS = resolve(ROOT, "sessions");
const FILE = "brunelleschi-2026-08-18T15-18-25.brnl.json";

interface Brnl {
  imgSize: [number, number];
  rules: { horizon: number; slots: ({ kind: string; at?: [number, number] } | null)[] };
  strokes: { id: string; pts2d: Pt2[]; channel?: string }[];
}

describe("Δ 대푯값 충돌 — 후보 셋의 분해(13차 항목 4)", () => {
  it("합성·실좌표 팔을 원장에 남긴다", () => {
    // ---- ② **축 스냅 수리의 사거리**(4-a — 합성): 겨냥 δ°를 스윕해 12차 수리의 그 판
    //      (`dirSnap2dCore` — 무앵커 확정 획이 지나는 2D 방향 스냅)이 Δ를 어디까지
    //      끌어오는지. 경계의 단위는 **부적합도**(수직거리 ÷ 길이 — `AXIS_TOL.vp_dist_ratio`,
    //      굽음 0의 직선 현에서는 sin δ에 해당)다(#49 — 판정이 쓰는 단위를 원장에 명시:
    //      vp_dir_consistency의 경계 팔이 6.7° 안 · 7.1° 밖을 이미 실측했다).
    const W = 1180, H = 668;
    const P: Pt2 = [W / 2, H / 2];
    const F = 0.431 * W;
    const VP0: Pt2 = [P[0] - F, P[1]];
    const A0: Pt2 = [300, 500];
    const aimed = (deltaDeg: number, len = 150): Pt2 => {
      const th = Math.atan2(VP0[1] - A0[1], VP0[0] - A0[0]) + (deltaDeg * Math.PI) / 180;
      return [A0[0] + len * Math.cos(th), A0[1] + len * Math.sin(th)];
    };
    const snapSweep = [0.5, 1, 2, 3, 4, 6, 12, 20].map(d => {
      const b = aimed(d);
      const r = dirSnap2dCore(A0, b, [VP0, null, null]);
      const after = vpDirErrDeg(A0, r.at, VP0)!;
      return { delta_before_deg: d, engaged: !!r.vpdir, delta_after_deg: +after.toFixed(4) };
    });

    // ---- ①·③ **실좌표 팔**(4-b): 15-18-25(화각 163°) 재구성 — 획별로
    //      angleWiden 배수 · 배정 · **widen을 끈 배정**(angle_relax 0) · relative(③) 를 낸다.
    const path = resolve(SESSIONS, FILE);
    expect(existsSync(path), `${FILE}가 sessions/에 없다`).toBe(true);
    const d = JSON.parse(readFileSync(path, "utf-8")) as Brnl;
    const cam = new CamState(d.imgSize);
    cam.loadRules(d.rules as never);
    const ctx = cam.ctx();
    expect(ctx).not.toBeNull();
    const axisCam = { principal: ctx!.principal, f: ctx!.f };
    const vps = ctx!.vps;
    const perStroke = d.strokes.filter(s => s.channel !== "note").map(s => {
      const rep = representative(s.pts2d);
      const v = classifyStroke(s.pts2d, vps, d.imgSize, {}, axisCam);
      const vNoWiden = classifyStroke(s.pts2d, vps, d.imgSize, { angle_relax: 0 }, axisCam);
      const vpAt = typeof v.axis === "number" ? vps[v.axis] : null;
      const err = vpAt && s.pts2d.length >= 2
        ? vpDirErrDeg(s.pts2d[0], s.pts2d[s.pts2d.length - 1], vpAt) : null;
      const vpDistPx = vpAt && s.pts2d.length
        ? Math.hypot(vpAt[0] - s.pts2d[0][0], vpAt[1] - s.pts2d[0][1]) : null;
      // **misfit이 측정인가 보장인가의 판별**(리뷰어 4-R [B-1] · #5 판별법): 같은 대표
      // 직선을 **틀린 축**(다른 유한 소실점)에 대면 값이 움직이는가. 움직이면 함수는
      // 측정이고, 그때 배정 축의 원값(`misfit_raw`)이 1e-16대라는 것은 **기하가 구성상
      // 그 소실점을 지난다**는 뜻이다 — 소실점 자체가 이 획들의 대표 직선에서 만들어졌거나
      // (slots source: horizon_x_line·two_lines), 저장 획이 스냅 **후** 기하이거나(s78 —
      // 2점 직선 · Δ0). 초판의 `toFixed(4)`가 그 1e-16을 0으로 접어 판별을 지웠다.
      const wrongIdx = typeof v.axis === "number"
        ? vps.findIndex((vp2, i) => !!vp2 && i !== v.axis) : -1;
      const misfitWrong = rep && wrongIdx >= 0 ? vpMisfit(rep, vps[wrongIdx]!) : null;
      // **Δ의 실제 기전**(4-R [B-1]·[B-4]): 원시 시작점이 대표 직선에서 벗어난 수직거리
      // (손떨림 몫)와 소실점 거리의 지렛대비. Δ ≈ atan(off/dVp) — 아래 두 필드가 그 실측이다.
      const offFit = rep && s.pts2d.length
        ? (() => {
            const ux = (rep.b[0] - rep.a[0]) / rep.len, uy = (rep.b[1] - rep.a[1]) / rep.len;
            const p = s.pts2d[0];
            return Math.abs((p[0] - rep.a[0]) * -uy + (p[1] - rep.a[1]) * ux);
          })() : null;
      const lever = offFit != null && vpDistPx != null && vpDistPx > 1e-9
        ? (Math.atan(offFit / vpDistPx) * 180) / Math.PI : null;
      return {
        id: s.id,
        axis: v.axis, axis_no_widen: vNoWiden.axis,
        widen_factor: rep ? +angleWiden(rep, axisCam, AXIS_TOL).toFixed(3) : null,
        relative: v.relative ?? false,
        /** 배정이 실제로 잰 양 — 대표 직선의 부적합도(수직거리÷길이). Δ와 프레임이 다르다(#24) */
        misfit: v.misfit == null ? null : +v.misfit.toFixed(4),
        /** 위 값의 **원값**(지수 표기 — [B-1]: toFixed(4)가 1e-16을 0으로 접었다) */
        misfit_raw: v.misfit == null ? null : v.misfit.toExponential(3),
        /** **틀린 축**에 댄 부적합도(#5 판별 팔) — 배정 축과 자릿수가 갈리면 측정이다 */
        misfit_wrong_axis: misfitWrong == null ? null : misfitWrong.toExponential(3),
        /** 대표 직선이 배정 소실점을 1e-9 아래로 지난다 — **구성**(소실점의 재료가 된 획 또는 스냅 후 저장 기하)의 표식 */
        fit_through_vp: v.misfit == null ? null : v.misfit < 1e-9,
        /** 시작점→배정 소실점 거리(px) — Δ의 지렛대 분모 */
        vp_dist_px: vpDistPx == null ? null : +vpDistPx.toFixed(1),
        /** 원시 시작점의 대표 직선 수직 이탈(px) — Δ의 지렛대 분자(손떨림 몫) */
        start_off_fit_px: offFit == null ? null : +offFit.toFixed(2),
        /** atan(start_off_fit_px ÷ vp_dist_px)(°) — Δ의 기전 예측값. vp_dir_err_deg와 나란히 읽는다 */
        jitter_lever_deg: lever == null ? null : +lever.toFixed(4),
        vp_dir_err_deg: err == null ? null : +err.toFixed(4),
      };
    });
    // 배정이 widen에 의존하는 획(①의 직접 실측): widen을 끄면 미분류가 되는 축 배정 획
    const widenDependent = perStroke.filter(r =>
      typeof r.axis === "number" && r.axis_no_widen === "free");
    const rankOnly = perStroke.filter(r => r.relative);

    // ---- ① **widen_dependent의 양성 채널**(리뷰어 4-R [B-3] · #30·#35): 실파일의 0이
    //      "기각"이려면 그 필드가 0 아닌 값을 **낼 수 있는** 입력이 있어야 한다. 주점에서
    //      먼 자리(widen>1)에 겨냥을 조금 빗나간 합성 획을 δ 스윕으로 놓고, 기본 배정은
    //      축·relax 0 배정은 free가 되는 행을 찾는다 — 찾으면 0은 도달 가능한 판정이다.
    // ---- ③ **rank_only의 양성 채널**(2차 리뷰어 [2] — ①만 채널을 받고 ③이 빠졌었다):
    //      relative 배정은 best.m > tol일 때만 열리는데 이 저장본은 misfit_raw 1e-16대라
    //      **구조상 발화 불가**다. 그 필드가 true를 낼 수 있는 입력의 존재 증명 —
    //      기본 임계 밖·천장 안의 misfit + 큰 2등 격차를 합성으로 만든다.
    const rankPositive = (() => {
      const found: { delta_deg: number; axis: unknown; relative: boolean }[] = [];
      const twoVps: (Pt2 | null)[] = [VP0, [P[0] + F, P[1]], null];
      for (const delta of [4, 5, 6, 7, 8, 10, 12]) {
        const b = aimed(delta, 300);
        const v = classifyStroke([A0, b], twoVps, [W, H], {}, { principal: P, f: F });
        if (typeof v.axis === "number" && v.relative) {
          found.push({ delta_deg: delta, axis: v.axis, relative: true });
        }
      }
      return found;
    })();

    const wpBase: Pt2 = [980, 560];
    const widenPositive = (() => {
      const found: { delta_deg: number; axis: unknown; axis_no_widen: unknown;
                     widen_factor: number; misfit: string }[] = [];
      for (const delta of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) {
        const th = Math.atan2(VP0[1] - wpBase[1], VP0[0] - wpBase[0])
                 + (delta * Math.PI) / 180;
        const b: Pt2 = [wpBase[0] + 150 * Math.cos(th), wpBase[1] + 150 * Math.sin(th)];
        const pts: Pt2[] = [wpBase, b];
        const von = classifyStroke(pts, [VP0, null, null], [W, H], {}, { principal: P, f: F });
        const voff = classifyStroke(pts, [VP0, null, null], [W, H], { angle_relax: 0 },
                                    { principal: P, f: F });
        if (typeof von.axis === "number" && voff.axis === "free") {
          const rep2 = representative(pts)!;
          found.push({ delta_deg: delta, axis: von.axis, axis_no_widen: voff.axis,
                       widen_factor: +angleWiden(rep2, { principal: P, f: F }, AXIS_TOL).toFixed(3),
                       misfit: von.misfit!.toExponential(3) });
        }
      }
      return found;
    })();

    // ---- ① **같은 기하의 재투입**(4-b 후반): 두 소실점을 현행 확정 게이트에 넣으면
    //      상한(reject_fov_deg)이 거부한다 — 신규 확정으로는 이 카메라가 다시 안 선다.
    const hs = d.rules.slots.slice(0, 2) as { kind: string; at: [number, number] }[];
    const verdict = fovGate(hs[0].at, hs[1].at, d.imgSize);

    const out = {
      spec: "Δ 대푯값 충돌의 분해(13차 항목 4) — ① angleWiden ② 무앵커 방향 스냅 사거리 ③ rank_margin",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      why: "두 표본의 vp_dir 대푯값(중앙 ~5.6° ↔ 최대 20.8°)이 갈린 후보 셋(vpRules.ts "
         + "concurrent_deg 주석)을 실측·합성으로 가른다. real_ink.per_doc의 실좌표 Δ가 재료다.",
      axis_snap_repair_sweep: {
        note: "② 12차 수리(무앵커 확정 획의 2D 방향 스냅)의 사거리 — engaged면 Δ가 0으로 "
            + "당겨지고, 밖이면 그린 대로 남는다. 경계의 단위는 부적합도(수직거리÷길이 — "
            + "AXIS_TOL.vp_dist_ratio · 직선 현에서 sin δ 상당)다(#49). "
            + "⚠ 동작점: 아래 fixture 필드 한 벌(#12). ⚠⚠ **이 스윕의 °경계를 실획에 옮겨 "
            + "쓰지 않는다**(리뷰어 4-R [B-4] — 같은 Δ°라도 소실점 거리가 다르면 부적합도가 "
            + "달라 발동이 갈린다. 실획의 발동 여부는 per_stroke의 misfit_raw·fit_through_vp가 "
            + "직접 답한다 — 저장 기하가 이미 스냅 후라 전 행 발동 안이다)",
        /** 동작점 값(#12 — [B-4]: 산문 '이 픽스처 한 벌'을 값으로) */
        fixture: {
          len_px: 150,
          vp_dist_px_from_A0: +Math.hypot(VP0[0] - A0[0], VP0[1] - A0[1]).toFixed(1),
          grid_gap_note: "격자는 6 다음이 12다 — **7~12° 구간에 점이 없다**(#12·#13). "
            + "경계 전이의 존재까지만 말하고 경계 위치는 이 격자로 못 좁힌다",
        },
        rows: snapSweep,
      },
      widen_positive_arm: {
        note: "①의 **필드 도달 가능성**([B-3] · #30·#35 — ⚠ 2차 [1]로 읽기 정정: 이것은 "
            + "widen_dependent가 0 아닌 값을 낼 수 있다는 **다른 픽스처**(주점에서 먼 합성 획, "
            + "widen 1.34)의 존재 증명이지, 실파일(widen 2.83~7.50 · misfit_raw 1e-16 — "
            + "구성상 발화 불가)의 모집단이 아니다(#40 ③). 실파일 ① 기각의 근거는 "
            + "file_15_18_25.note가 든다 — misfit_raw < 기본 임계)",
        base_px: wpBase,
        found_rows: widenPositive,
      },
      rank_positive_arm: {
        note: "③의 **필드 도달 가능성**(2차 [2] — ①만 채널을 받았었다): relative=true가 "
            + "나오는 합성 입력(기본 임계 밖·천장 안 misfit + 큰 2등 격차)의 존재 증명. "
            + "widen_positive_arm과 같은 유보 — 실파일 모집단이 아니다",
        found_rows: rankPositive,
      },
      file_15_18_25: {
        note: "화각 163° 카메라(복원 경로 — first_anchor.contrast의 그 실측)의 획별 분해. "
            + "⚠⚠ **①·③의 판은 개입 팔이 아니라 misfit_raw가 든다**(2차 리뷰어 [1]·[2] 정정 — "
            + "이 저장본은 스냅 후 기하라 배정 행 misfit_raw가 1e-16대: angle_relax 0 개입도 "
            + "상대 순위 경로도 **구성상 발화 불가**여서 widen_dependent 0·rank_only 0은 "
            + "이 파일에서 정보량 0이다(#32 — 무변화 개입은 기각의 증거가 아니다). "
            + "①을 기각하는 실제 근거: **배정 행 전부 misfit_raw < 기본 임계 "
            + "AXIS_TOL.vp_dist_ratio** — 큰 Δ 행의 배정에 widen이 필요하지 않았다(배수와 "
            + "무관하게 배정된다). ③ 비적용의 근거도 같다 — relative는 misfit > 임계에서만 "
            + "열린다. 두 필드의 도달 가능성은 widen_positive_arm·rank_positive_arm이 "
            + "**다른 픽스처로** 증명한다(모집단 불일치 명시 — #40 ③). "
            + "**Δ 꼬리의 기전은 지렛대 분해다**(4-R [B-1] · 2차 [4]로 성격 명시): "
            + "fit_through_vp 행에서 Δ ≈ atan(start_off_fit_px ÷ vp_dist_px)는 **독립 측정이 "
            + "아니라 기하 분해**다(대표 직선이 소실점을 지나므로 대수적으로 근접 — #5. "
            + "말해 주는 것: Δ는 겨냥이 아니라 손떨림 이탈×지렛대의 몫이다). 대응의 강도는 "
            + "jitter_lever_correspondence가 행별로 든다 — real_ink의 near_vp_degenerate "
            + "표식이 같은 판정이고, 다른 두 파일의 지렛대 값은 real_ink의 "
            + "per_doc[*].near_vp_lever가 든다(2차 [5]·[9]).",
        per_stroke: perStroke,
        widen_dependent_ids: widenDependent.map(r => r.id),
        rank_only_ids: rankOnly.map(r => r.id),
        /**
         * **지렛대 분해의 대응 강도**(2차 리뷰어 [4] — "행마다 성립"의 모집단·임계를 값으로):
         * 대상은 수평축 배정 행 중 **보장(Δ 정확 0 — s78, #5)을 뺀** 지렛대 값 보유 행이다.
         * ratio = jitter_lever ÷ Δ. 밴드(±3°)보다 값이 작은 행(s75)은 판별력이 없어
         * informative에서 뺀다 — 남는 정보 행은 그 목록이 든다(잔차 10~20%는 계통적 —
         * 현 방향과 대표 직선 방향의 차 몫).
         */
        jitter_lever_correspondence: {
          band_deg: 3,
          rows: perStroke
            .filter(r => r.jitter_lever_deg != null && r.vp_dir_err_deg != null)
            .map(r => ({ id: r.id, lever: r.jitter_lever_deg, delta: r.vp_dir_err_deg,
                         ratio: r.vp_dir_err_deg! > 1e-9
                           ? +(r.jitter_lever_deg! / r.vp_dir_err_deg!).toFixed(4) : null,
                         guaranteed_zero: r.vp_dir_err_deg === 0,
                         below_band: r.vp_dir_err_deg! < 3 })),
          informative_ids: perStroke
            .filter(r => r.jitter_lever_deg != null && r.vp_dir_err_deg != null
                      && r.vp_dir_err_deg > 3)
            .map(r => r.id),
        },
      },
      /** ② 사거리의 크기 — 스윕에서 발동한 행 수(경계 전이의 존재는 아래 단언이 잠근다). */
      sweep_engaged_rows: snapSweep.filter(r => r.engaged).length,
      refeed_gate: {
        note: "① 후반 — 같은 두 소실점을 현행 확정 게이트에 넣은 판. reject면 신규 "
            + "확정으로는 이 카메라(와 그 아래의 Δ 분포)가 재현되지 않는다 — 12차 상한의 "
            + "사거리 확인. 복원 경로는 여전히 지나간다(DEFERRED 그 행).",
        band: verdict.band, fov_deg: verdict.fovDeg == null ? null : +verdict.fovDeg.toFixed(2),
        /**
         * **주점 규약**(리뷰어 4-R [B-6] · #24 — 13차 1차 [9]가 세운 병기 규약): 이 화각은
         * `fovGate`의 주점 = **[W/2, H/2]**에서 나온 값이다. `real_ink.per_doc[*]
         * .camera_assumed_principal_center`(주점 = [W/2, 지평선 y] — 앱 ctx와 같은 규약)와
         * 같은 카메라라도 값이 갈린다(163.18 쪽). 거부 판정은 어느 규약에서도 같은 대역이다.
         */
        principal_convention: "fovGate: [W/2, H/2] — real_ink per_doc([W/2, horizon_y])와 다르다. 인용 시 규약을 함께 적는다",
        reject_threshold_deg: FOV_GATE.reject_fov_deg,
      },
      gate: gate({
        // ⚠ engaged 행의 delta_after = 0은 **스냅 후 항등(#5 — 설계 보장)**이라 게이트
        // 조건에서 내렸다(리뷰어 4-R [B-7] — 항목 3 [9]와 같은 정정. 항등은 위 rows가
        // 기록으로 들고, 단언은 아래 vitest 단언이 별도로 잠근다).
        registered: "② 스윕에 **경계 전이가 존재한다**(engaged 행과 미발동 행이 둘 다 있다) "
                  + "· ① 실좌표의 판별은 **배정 행 misfit_raw < 기본 임계**(widen 불요 — 2차 "
                  + "[1]로 재근거: 개입 팔은 이 저장본에서 구성상 무정보) · refeed_gate.band = "
                  + "reject(신규 확정 재현 불가) · ③ rank_only는 같은 이유로 이 저장본에서 "
                  + "비적용. 값은 필드가 든다(#47)",
        reachability: "값은 ② 스윕의 발동 행 수(사거리의 크기 — 0도 8도 아니면 경계가 스윕 "
                    + "안에 있다). ⚠ ①의 widen_dependent 0·③의 rank_only 0은 **이 저장본에서 "
                    + "정보량 0이다**(2차 [1]·[2] — misfit_raw 1e-16대라 두 경로 다 구성상 발화 "
                    + "불가 · #32). 두 필드의 도달 가능성은 widen_positive_arm·rank_positive_arm"
                    + "(각각 비공집합 — 단 다른 픽스처, #40 ③ 명시)이 든다. selfcheck의 "
                    + "'정확히 0' 의심은 이 문장이 원인 확인이다(발화 불가의 구성 원인: "
                    + "fit_through_vp — 스냅 후 저장 기하)",
        reachability_value: snapSweep.filter(r => r.engaged).length,
        reachability_source: "sweep_engaged_rows",
        /** 이 값은 스윕 격자(0.5~20°의 8점)가 정하는 수다([B-8] · #46) — 격자를 바꾸면 함께 변한다 */
        reachability_value_fixture_determined: true,
        result: { widen_dependent: widenDependent.length, rank_only: rankOnly.length,
                  widen_positive_rows: widenPositive.length,
                  rank_positive_rows: rankPositive.length, refeed_band: verdict.band },
        note: "이 원장이 걸리는 번호: #49(경계의 단위 — 부적합도. **°경계를 실획에 옮기지 "
            + "않는다** — fixture 필드와 per_stroke의 misfit_raw가 각자 자기 단위로 답한다) · "
            + "#12(동작점 — fixture 필드·파일 하나·격자 공백 7~12°) · #30(widen 끔 개입 팔 + "
            + "양성 채널) · #5(Δ 표 자체가 배정 통과 획만 담는 선택 절단 — 그 절단의 폭을 "
            + "widen이 정한다는 것이 ①의 내용이다)",
      }),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "delta_conflict.json"), JSON.stringify(out, null, 2), "utf-8");

    // ---- 단언: ② 경계가 실제로 갈린다(조리개 안 발동·밖 미발동이 스윕에 둘 다 있다)
    expect(snapSweep.some(r => r.engaged)).toBe(true);
    expect(snapSweep.some(r => !r.engaged)).toBe(true);
    for (const r of snapSweep) {
      if (r.engaged) expect(r.delta_after_deg).toBeLessThan(1e-6);
      else expect(Math.abs(r.delta_after_deg - r.delta_before_deg)).toBeLessThan(1e-6);
    }
    // ① 재투입은 거부 대역이다(12차 상한의 사거리)
    expect(verdict.band).toBe("reject");
    // ---- [B-3]·2차 [2] 두 필드의 도달 가능성 팔이 비지 않았다(다른 픽스처 — #40 ③ 유보)
    expect(widenPositive.length).toBeGreaterThan(0);
    expect(rankPositive.length).toBeGreaterThan(0);
    // ---- [B-1] misfit은 측정이다(#5 판별) — 배정 축과 틀린 축의 값이 자릿수로 갈린다.
    //      그리고 배정 행의 원값은 구성상 0(fit_through_vp)이다 — 두 사실이 함께 참이어야
    //      "0은 반올림된 구성값, 함수는 판별력 있음"이 성립한다.
    for (const r of perStroke) {
      if (typeof r.axis !== "number") continue;
      expect(r.fit_through_vp, `${r.id}: 배정 행의 대표 직선이 소실점을 지나야 한다(구성)`).toBe(true);
      if (r.misfit_wrong_axis != null) {
        expect(parseFloat(r.misfit_wrong_axis),
          `${r.id}: 틀린 축 misfit이 판별 여유(1e-3) 위여야 측정이다`).toBeGreaterThan(1e-3);
      }
    }
    // ---- [B-1]·[B-4]·2차 [4] Δ의 지렛대 분해: 수평축 배정 행 중 지렛대 값이 있는 행에서
    //      |Δ − lever| < 3°. ⚠ 정보 행은 jitter_lever_correspondence.informative_ids가
    //      가른다(보장 0 행·밴드보다 작은 행은 판별력이 없다 — 단언은 기계적 상한 확인).
    for (const r of perStroke) {
      if (typeof r.axis !== "number" || r.vp_dir_err_deg == null || r.jitter_lever_deg == null) continue;
      expect(Math.abs(r.vp_dir_err_deg - r.jitter_lever_deg),
        `${r.id}: Δ와 지렛대 분해의 차가 3°를 넘는다 — 기전 서술을 재검한다`).toBeLessThan(3);
    }
  });
});
