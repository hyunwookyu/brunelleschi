// L-A.7 b **조건수 측정** — 산출: `stage0/out/vp_homog.json`.
//
// 물음: **핸들 1px이 카메라를 얼마나 움직이는가.** 위치 파라미터화와 각도(동차)
// 파라미터화를 같은 입력에서 대조한다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호:
//   **#24(단위 변경은 아무것도 고치지 않는다)** · #3(지표가 정의의 귀결) · #6(대조군) ·
//   #8(꼬리) · #13(절단값) · #25(원장) · #26(사전 등록)
//
// **#3이 특히 위험하다.** "각도로 재니 유계더라"는 **정의의 귀결**이다(각도는 0~90°로 유계다).
// 그래서 유계성 자체를 성과로 적지 않는다 — 재는 것은 **카메라 파라미터의 민감도**이고,
// 그것은 파라미터화를 바꿔도 안 바뀔 수 있다. 그 대조가 이 측정의 요점이다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { vpFromGuides, angleBetweenVp, separationDeg, HOMOG_TOL } from "../src/s3d/vpHomog.js";
import { lineIntersect, recoverCamera, type Pt2 } from "../src/s3d/camera.js";
import { unit3, dot3, axisDirection } from "../src/s3d/geom3d.js";
import { stat, round } from "./scene3d.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];
const P: Pt2 = [SZ[0] / 2, SZ[1] / 2];

/** 각차 `sep`(도)를 갖는 가이드 쌍. 첫 선은 고정, 둘째를 돌린다. */
function pair(sepDeg: number, L = 600): [{ a: Pt2; b: Pt2 }, { a: Pt2; b: Pt2 }] {
  const g1 = { a: [120, 220] as Pt2, b: [120 + L, 220] as Pt2 };
  const t = (sepDeg * Math.PI) / 180;
  const g2 = { a: [120, 520] as Pt2,
               b: [120 + L * Math.cos(t), 520 - L * Math.sin(t)] as Pt2 };
  return [g1, g2];
}

/** 핸들 하나를 `d`px 옮긴 쌍. */
const nudge = (g: { a: Pt2; b: Pt2 }, dx: number, dy: number) =>
  ({ a: g.a, b: [g.b[0] + dx, g.b[1] + dy] as Pt2 });

describe("L-A.7 b 조건수 — 위치 대 각도 파라미터화", () => {
  it("핸들 1px이 무엇을 얼마나 움직이는지 원장에 낸다", () => {
    const SEPS = [0.5, 1, 2, 3, 5, 10, 20, 40, 60];
    const rows: Record<string, unknown> = {};
    // 고정된 다른 축 하나 — 카메라(6.2)를 풀려면 소실점이 둘 필요하다
    const OTHER: Pt2 = [-820, 336];
    const round2 = round;

    for (const sep of SEPS) {
      const [g1, g2] = pair(sep);
      const dPos: number[] = [], dAng: number[] = [], dF: number[] = [], dAxis: number[] = [];
      let finiteBefore = 0, finiteAfter = 0, snapped = 0;
      // 핸들을 여덟 방향으로 1px씩 — 방향에 따라 민감도가 다르므로 하나만 보지 않는다
      for (let k = 0; k < 8; k++) {
        const th = (k * Math.PI) / 4;
        const g2b = nudge(g2, Math.cos(th), Math.sin(th));
        const a = vpFromGuides(g1, g2, SZ, { snap_deg: 0 });
        const b = vpFromGuides(g1, g2b, SZ, { snap_deg: 0 });
        if (!a.degenerate && !b.degenerate) {
          dAng.push(angleBetweenVp(a.v, b.v));
          const pa = lineIntersect(g1.a, g1.b, g2.a, g2.b);
          const pb = lineIntersect(g1.a, g1.b, g2b.a, g2b.b);
          if (pa && pb) dPos.push(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]));
          // **카메라가 얼마나 움직이는가** — 이것이 실제로 중요한 양이다
          const ca = recoverCamera([OTHER, pa, null], SZ);
          const cb = recoverCamera([OTHER, pb, null], SZ);
          if (ca.ok && cb.ok && ca.f && cb.f) {
            finiteBefore += 1; finiteAfter += 1;
            dF.push(Math.abs(cb.f - ca.f) / ca.f);
            const da = unit3(axisDirection(pa!, ca.principalPoint!, ca.f));
            const db = unit3(axisDirection(pb!, cb.principalPoint!, cb.f));
            dAxis.push((Math.acos(Math.min(1, Math.abs(dot3(da, db)))) * 180) / Math.PI);
          }
        }
        // 기본 임계에서 스냅되는가
        if (vpFromGuides(g1, g2, SZ).infinite) snapped += 1;
      }
      rows[`sep_${sep}deg`] = {
        actual_sep_deg: round(separationDeg(g1, g2), 3),
        d_vp_position_px: stat(dPos),
        d_homog_angle_deg: stat(dAng),
        d_camera_f_rel: stat(dF),
        d_axis_dir_deg: stat(dAxis),
        camera_solvable: { before: finiteBefore, after: finiteAfter, of: 8 },
        snapped_at_default: `${snapped}/8`,
      };
    }

    // ---- **가이드 길이 스윕**. 핸들 예산이 길이에 어떻게 달렸는가 —
    //      이것이 `min_guide_ratio`를 정하는 유일한 실측 근거다(리뷰어 지적 [5]).
    const byLen: Record<string, unknown> = {};
    // **1250을 더했다** — L-B.1의 단일 뷰포트에서 실제로 나온 가이드 길이가 607~1328px이다
    // (`stage_browser.json`). 600에서 멈추면 새 뷰포트의 예산을 **외삽으로** 말하게 된다.
    for (const L of [100, 140, 200, 300, 450, 600, 1250]) {
      const row: Record<string, unknown> = {};
      for (const sep of [3, 5, 10, 20]) {
        const [g1, g2] = pair(sep, L);
        const dAxis: number[] = [];
        for (let k = 0; k < 8; k++) {
          const th = (k * Math.PI) / 4;
          const g2b = nudge(g2, Math.cos(th), Math.sin(th));
          const pa = lineIntersect(g1.a, g1.b, g2.a, g2.b);
          const pb = lineIntersect(g1.a, g1.b, g2b.a, g2b.b);
          if (!pa || !pb) continue;
          const ca = recoverCamera([OTHER, pa, null], SZ);
          const cb = recoverCamera([OTHER, pb, null], SZ);
          if (!(ca.ok && cb.ok && ca.f && cb.f)) continue;
          const da = unit3(axisDirection(pa, ca.principalPoint!, ca.f));
          const db = unit3(axisDirection(pb, cb.principalPoint!, cb.f));
          dAxis.push((Math.acos(Math.min(1, Math.abs(dot3(da, db)))) * 180) / Math.PI);
        }
        const worst = dAxis.length ? Math.max(...dAxis) : null;
        row[`sep_${sep}deg`] = {
          d_axis_dir_deg: stat(dAxis),
          // **핸들 예산** — 축 오차 0.5°를 쓰기까지 핸들이 몇 px 움직여도 되는가(최악 방향)
          handle_budget_px_for_0_5deg: worst ? round(0.5 / worst, 2) : null,
          handle_budget_px_for_1deg: worst ? round(1.0 / worst, 2) : null,
        };
      }
      byLen[`guide_len_${L}px`] = row;
    }

    const doc = {
      what: "L-A.7 b — 핸들 1px 이동이 소실점·카메라를 얼마나 움직이는가. 위치 대 각도 파라미터화",
      plan: "docs/line_plan.md §5.2 (가이드 조정·발산 대응) — **개정 2 번호**",
      method: "각차 sep을 준 가이드 쌍에서 한 핸들을 **여덟 방향으로 1px씩** 옮긴다. "
        + "방향에 따라 민감도가 다르므로 하나만 보지 않는다. 스냅은 꺼서 표현만 본다.",
      warning: "⚠ **각도가 유계인 것은 정의의 귀결이다**(PITFALLS #3). 그것을 성과로 읽지 않는다. "
        + "재는 것은 `d_camera_f_rel`·`d_axis_dir_deg`이고, **파라미터화를 바꿔도 그 둘은 "
        + "안 바뀐다** — 같은 기하를 다른 좌표로 적은 것뿐이기 때문이다(#24). "
        + "동차 표현이 주는 것은 **값이 유한하게 유지되어 스냅을 연속적으로 걸 수 있다**는 것이다.",
      snap_threshold_deg: HOMOG_TOL.snap_deg,
      by_separation: rows,
      by_guide_length: byLen,
      guide_length_note: "**핸들 예산**(축 오차 0.5°를 쓰기까지 핸들이 움직여도 되는 px)이 "
        + "가이드 길이에 어떻게 달렸는가. `DRAFT_TOL.min_guide_ratio`는 **0.45**이고 "
        + "960×672에서 **527px**을 요구한다(초판은 0.12 = 140px이었고 그 서술이 이 필드에 "
        + "남아 있었다 — 리뷰어 2회차). 단일 뷰포트(1280×675)의 실제 가이드는 607~1328px이고 "
        + "**가장 짧은 것이 정확도를 정한다**. 이 표가 그 값을 정하는 유일한 실측 근거다.",
      constants: constantsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "vp_homog.json"), JSON.stringify(doc, null, 2));
    expect(Object.keys(rows).length).toBe(SEPS.length);
  }, 120_000);
});
