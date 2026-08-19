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
import { classifyStroke, angleWiden, representative, AXIS_TOL } from "../src/s3d/axis.js";
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
      return {
        id: s.id,
        axis: v.axis, axis_no_widen: vNoWiden.axis,
        widen_factor: rep ? +angleWiden(rep, axisCam, AXIS_TOL).toFixed(3) : null,
        relative: v.relative ?? false,
        /** 배정이 실제로 잰 양 — 대표 직선의 부적합도(수직거리÷길이). Δ와 프레임이 다르다(#24) */
        misfit: v.misfit == null ? null : +v.misfit.toFixed(4),
        /** 시작점→배정 소실점 거리(px) — 가까울수록 같은 misfit이 큰 각을 뜻한다 */
        vp_dist_px: vpDistPx == null ? null : +vpDistPx.toFixed(1),
        vp_dir_err_deg: err == null ? null : +err.toFixed(4),
      };
    });
    // 배정이 widen에 의존하는 획(①의 직접 실측): widen을 끄면 미분류가 되는 축 배정 획
    const widenDependent = perStroke.filter(r =>
      typeof r.axis === "number" && r.axis_no_widen === "free");
    const rankOnly = perStroke.filter(r => r.relative);

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
            + "⚠ 동작점: 길이 150px·소실점 거리 이 픽스처 한 벌(#12)",
        rows: snapSweep,
      },
      file_15_18_25: {
        note: "화각 163° 카메라(복원 경로 — first_anchor.contrast의 그 실측)의 획별 분해. "
            + "`axis_no_widen`이 free인 축 배정 획 = **angleWiden 없이는 배정되지 않았을 획**"
            + "(① — 큰 Δ가 표에 나타난 것 자체가 widen의 산물인지의 직접 판별). "
            + "`relative` = 상대 순위 배정(③). ⚠ **실측이 ①·③을 이 파일에서 기각했다** — "
            + "widen_dependent·rank_only 둘 다 공집합인데 Δ20.8·16.6 행이 있다. 기전은 "
            + "misfit·vp_dist_px 짝이 보인다: 배정이 재는 것은 부적합도(수직거리÷길이)이고 "
            + "**소실점이 가까우면(극단 카메라의 성질) 같은 비가 훨씬 큰 각을 뜻한다** — "
            + "vpRules.ts가 지평선 거리 함정에서 이미 적은 그 기하다. 즉 두 표본의 차이는 "
            + "카메라 품질(소실점 근접)로 설명되고(지시 4-c), 경로는 widen 배수가 아니라 "
            + "비율 임계의 각 대응 자체다.",
        per_stroke: perStroke,
        widen_dependent_ids: widenDependent.map(r => r.id),
        rank_only_ids: rankOnly.map(r => r.id),
      },
      /** ② 사거리의 크기 — 스윕에서 발동한 행 수(경계 전이의 존재는 아래 단언이 잠근다). */
      sweep_engaged_rows: snapSweep.filter(r => r.engaged).length,
      refeed_gate: {
        note: "① 후반 — 같은 두 소실점을 현행 확정 게이트에 재투입한 판. reject면 신규 "
            + "확정으로는 이 카메라(와 그 아래의 Δ 분포)가 재현되지 않는다 — 12차 상한의 "
            + "사거리 확인. 복원 경로는 여전히 지나간다(DEFERRED 그 행).",
        band: verdict.band, fov_deg: verdict.fovDeg == null ? null : +verdict.fovDeg.toFixed(2),
        reject_threshold_deg: FOV_GATE.reject_fov_deg,
      },
      gate: gate({
        registered: "② 스윕에서 engaged 행의 delta_after = 0, 미발동 행은 delta_after = "
                  + "delta_before(경계 전이가 스윕 안에 존재한다) · ① 실좌표에서 "
                  + "widen_dependent_ids가 큰 Δ 획을 포함하는가가 판별이고, refeed_gate.band = "
                  + "reject(신규 확정 재현 불가) · ③ rank_only_ids를 갈라 낸다. 값은 필드가 든다(#47)",
        reachability: "값은 ② 스윕의 발동 행 수(사거리의 크기 — 0도 8도 아니면 경계가 스윕 "
                    + "안에 있다). ①의 판별력은 widen 끔 팔(angle_relax 0)과 본 팔의 **배정 "
                    + "차이**이고 결과는 result.widen_dependent = 0(공집합 = 기각 — #30 개입 팔. "
                    + "정확히 0이라 selfcheck 의심이 뜨면 이 문장이 원인 확인이다: 기각의 "
                    + "실측값이지 항등이 아니다. 카메라 품질의 실제 경로는 misfit↔각 대응의 "
                    + "붕괴 — note)",
        reachability_value: snapSweep.filter(r => r.engaged).length,
        reachability_source: "sweep_engaged_rows",
        result: { widen_dependent: widenDependent.length, rank_only: rankOnly.length,
                  refeed_band: verdict.band },
        note: "이 원장이 걸리는 번호: #49(경계의 단위 — 부적합도) · #12(동작점 — 스윕 "
            + "한 벌·파일 하나) · #30(widen 끔 개입 팔) · #5(Δ 표 자체가 배정 통과 획만 담는 "
            + "선택 절단 — 그 절단의 폭을 widen이 정한다는 것이 ①의 내용이다)",
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
  });
});
