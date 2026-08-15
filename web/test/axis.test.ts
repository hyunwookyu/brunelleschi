// S-2 방향 판정 — assumptions **S-1**("축 판정이 숙련자 획에서 충분히 정확하다")을 잰다.
//
// 정답이 있어야 재므로 소실점 셋으로 상자를 작도하고, **각 모서리를 잉크 획으로 그린다**
// (깨끗한 선분이 아니라 손떨림이 든 점열). 그 획을 판정해 정답 축과 대조한다.
//
// 세 수를 함께 본다. 하나만 보면 안 된다.
//   accuracy    분류된 것 중 맞은 비율
//   assigned    전체 중 분류된 비율 (미분류로 도망가면 accuracy는 쉽게 오른다)
//   silent_wrong 전체 중 **조용히 틀린 축에 배정된** 비율 — A-3이 가장 싫어하는 것
//
// 산출물: stage0/out/axis_judgement.json
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStroke, representative, maxTurn, AXIS_TOL, type AxisCfg } from "../src/s3d/axis.js";
import { lineIntersect, fFromThreeVps, type Pt2 } from "../src/s3d/camera.js";
import { renderInk, rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SZ: [number, number] = [960, 672];
const VPS: [Pt2, Pt2, Pt2] = [[-900, 260], [1900, 260], [480, 2600]];   // 예각(6.5) 통과
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);

const along = (o: Pt2, v: Pt2, t: number): Pt2 => [o[0] + (v[0] - o[0]) * t, o[1] + (v[1] - o[1]) * t];

/** 소실점 셋으로 투시 정합적인 상자를 작도한다. 12모서리에 정답 축이 붙는다. */
function box(O: Pt2, t: [number, number, number]) {
  const [V0, V1, V2] = VPS;
  const A = along(O, V0, t[0]), B = along(O, V1, t[1]), C = along(O, V2, t[2]);
  const AB = lineIntersect(A, V1, B, V0)!, AC = lineIntersect(A, V2, C, V0)!;
  const BC = lineIntersect(B, V2, C, V1)!, ABC = lineIntersect(AB, V2, AC, V1)!;
  return [
    { a: O, b: A, axis: 0 }, { a: B, b: AB, axis: 0 }, { a: C, b: AC, axis: 0 }, { a: BC, b: ABC, axis: 0 },
    { a: O, b: B, axis: 1 }, { a: A, b: AB, axis: 1 }, { a: C, b: BC, axis: 1 }, { a: AC, b: ABC, axis: 1 },
    { a: O, b: C, axis: 2 }, { a: A, b: AC, axis: 2 }, { a: B, b: BC, axis: 2 }, { a: AB, b: ABC, axis: 2 },
  ] as { a: Pt2; b: Pt2; axis: 0 | 1 | 2 }[];
}

/**
 * `skew`는 활의 마루 위치다. **0.5(대칭)가 특수한 경우**다 —
 * 대칭 활은 최소제곱 주축이 참 방향과 정확히 나란해져 방향 판정이 공짜로 맞는다.
 * 그 조건에서만 재면 **자기확인**이 된다. 치우친 활을 함께 잰다.
 */
function run(grade: InkGrade, seed: number, cfg: AxisCfg = {}, n = 250, skew = 0.5) {
  const r = rng32(seed);
  let total = 0, assigned = 0, correct = 0, wrong = 0;
  const byReason: Record<string, number> = {};
  for (let it = 0; it < n; it++) {
    const O: Pt2 = [300 + r() * 320, 300 + r() * 200];
    for (const e of box(O, [0.16 + r() * 0.1, 0.16 + r() * 0.1, 0.10 + r() * 0.06])) {
      const ink = renderInk([e.a, e.b], grade, r, undefined, skew) as Pt2[];
      const v = classifyStroke(ink, VPS, SZ, cfg);
      total += 1;
      byReason[v.reason] = (byReason[v.reason] ?? 0) + 1;
      if (v.axis === "free") continue;
      assigned += 1;
      if (v.axis === e.axis) correct += 1; else wrong += 1;
    }
  }
  return {
    n: total,
    assigned_rate: rate(assigned, total),
    accuracy: rate(correct, assigned),
    silent_wrong_rate: rate(wrong, total),
    by_reason: byReason,
  };
}

describe("S-2 방향 판정", () => {
  it("숙련자 획(precise)에서 축 판정이 정확한가 — assumptions S-1", () => {
    const grades: InkGrade[] = ["precise", "medium", "coarse"];
    const by_grade = Object.fromEntries(grades.map((g, i) => [g, run(g, 301 + i)]));
    // **자기확인 점검**: 대칭 활에서는 주축이 참 방향과 정확히 나란해진다.
    // 마루를 옮겨 그 공짜 정확도를 없앤 조건에서 다시 잰다.
    const by_skew = Object.fromEntries([0.5, 0.25, 0.12].map(sk =>
      [`skew_${sk}`, run("medium", 321, {}, 120, sk)]));

    // bend_max 스윕 — 계획서 §4.1 "크게 휜 획" 미결 항목의 근거
    const bend_sweep = [0.08, 0.12, 0.18, 0.25, 0.40].map(bend_max => ({
      bend_max, ...run("medium", 311, { bend_max }, 80),
    }));

    const report = {
      spec: "S-2 축 판정 정확도. 소실점 셋으로 작도한 상자의 12모서리를 잉크 획으로 그려 판정.",
      method: [
        "예각 소실점 셋(6.5)으로 투시 정합 상자 작도 → 각 모서리의 정답 축을 안다.",
        "모서리를 **깨끗한 선분이 아니라 잉크 획**으로 그린다(실측 노이즈 모델).",
        "판정 임계는 전부 **길이·대각 대비 비율**이다(절대 픽셀 금지, V-s).",
      ],
      three_numbers: (
        "accuracy 하나만 보면 안 된다 — 미분류로 도망가면 쉽게 오른다. "
        + "assigned_rate(얼마나 판정했나)와 silent_wrong_rate(조용히 틀린 축에 배정한 비율)를 "
        + "함께 본다. A-3이 금지하는 것은 세 번째다."
      ),
      caveat: (
        "**합성이다.** 숙련자가 실제로 어떻게 긋는지는 이 표본에 없다(assumptions V-o). "
        + "여기서 재는 것은 '같은 노이즈 수준에서 판정 규칙이 얼마나 갈라내는가'이고, "
        + "'숙련자 획에서 정확한가'(S-1)는 실제 획이 생기는 S-10 이후에 다시 잰다."
      ),
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      camera: { vps: VPS, f: fFromThreeVps(...VPS).f },
      tolerances: AXIS_TOL,
      by_grade,
      self_confirmation_check: {
        why: ("합성 활이 **대칭**이면 최소제곱 주축이 참 방향과 정확히 나란해진다(테스트로 확인). "
          + "그 조건에서만 재면 판정 규칙이 아니라 노이즈 모델의 성질을 재는 것이 된다. "
          + "마루 위치(skew)를 옮겨 그 공짜 정확도를 없앤 값이 아래다."),
        by_skew,
      },
      bend_sweep,
      bend_sweep_note: ("0.12 이상에서 값이 전부 같다 — **이 표본이 bend_max를 시험하지 못한다**. "
        + "상자 모서리는 그만큼 휘지 않는다. 0.18이라는 값은 이 스윕이 정당화하지 않으며, "
        + "실제 휜 획이 생기는 S-10 이후에 다시 정한다."),
      undecided_resolved: {
        "크게 휜 획": "곡률 임계(bend_max) 초과 시 **미분류**. 최소제곱 직선으로 억지 배정하지 않는다.",
        "한 획에 여러 축": "방향 급변(turn_deg)으로 검출해 **미분류**. 분절하지 않는다 — 획을 쪼개는 순간 §1이 깨진다.",
      },
    };
    const outDir = resolve(ROOT, "stage0", "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "axis_judgement.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(by_grade.precise.n).toBeGreaterThan(2000);
    // **조용히 틀리는 것이 드물어야 한다.** 이것이 A-3의 요구다.
    expect(by_grade.precise.silent_wrong_rate!).toBeLessThan(0.05);
  }, 300_000);

  // --- 반례 (계획서 §4.1 미결 항목의 결정을 잠근다) ---

  it("반례: 한 획에 두 축이 있으면 **배정하지 않는다** — 분절도 하지 않는다", () => {
    const r = rng32(51);
    const O: Pt2 = [420, 380];
    const A = along(O, VPS[0], 0.22), B = along(A, VPS[1], 0.22);
    const bent = renderInk([O, A, B], "precise", r) as Pt2[];
    const v = classifyStroke(bent, VPS, SZ);
    expect(v.axis).toBe("free");
    expect(v.reason).toBe("multi_axis");
    expect(v.note).toContain("나눠 그어");
    // 같은 획의 절반은 제대로 배정된다 — 검출기가 무조건 거부하는 것이 아님을 확인
    const half = renderInk([O, A], "precise", rng32(51)) as Pt2[];
    expect(classifyStroke(half, VPS, SZ).axis).toBe(0);
  });

  it("반례: 크게 휜 획은 최소제곱 직선으로 억지 배정하지 않는다", () => {
    // 축 0 방향으로 가되 크게 부푼 호
    const O: Pt2 = [420, 380], A = along(O, VPS[0], 0.25);
    const arc: Pt2[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const bow = Math.sin(Math.PI * t) * 0.30;
      arc.push([O[0] + (A[0] - O[0]) * t, O[1] + (A[1] - O[1]) * t + bow * Math.hypot(A[0] - O[0], A[1] - O[1])]);
    }
    const v = classifyStroke(arc, VPS, SZ);
    expect(v.axis).toBe("free");
    expect(["too_bent", "multi_axis"]).toContain(v.reason);
  });

  it("반례: 두 축이 비슷하게 맞으면 고르지 않는다 — 부적합도가 0 근처여도", () => {
    const near: (Pt2 | null)[] = [[1900, 260], [1903, 261], null];
    const s = renderInk([[300, 400], [700, 372.6]], "precise", rng32(9)) as Pt2[];
    const v = classifyStroke(s, near, SZ);
    expect(v.axis).toBe("free");
    expect(v.reason).toBe("ambiguous");
  });

  it("반례: 짧은 획은 방향을 믿지 않는다", () => {
    const tiny: Pt2[] = [[400, 400], [404, 401], [408, 402]];
    expect(classifyStroke(tiny, VPS, SZ).reason).toBe("too_short");
  });

  it("반례: 어느 축도 아닌 획은 free로 남고 이유를 말한다 (§4.3으로 간다)", () => {
    const diag = renderInk([[400, 430], [560, 250]], "precise", rng32(3)) as Pt2[];
    const v = classifyStroke(diag, VPS, SZ);
    expect(v.axis).toBe("free");
    expect(v.reason).toBe("no_axis_matches");
    expect(v.note).toContain("면 위 사선");
  });

  it("판정 임계는 길이 대비다 — 10배 확대해도 같은 판정 (V-s)", () => {
    const s = renderInk([[300, 400], [640, 377]], "medium", rng32(7)) as Pt2[];
    const big = s.map(([x, y]) => [x * 10, y * 10] as Pt2);
    const bigVps = VPS.map(v => [v[0] * 10, v[1] * 10] as Pt2);
    expect(classifyStroke(big, bigVps, [SZ[0] * 10, SZ[1] * 10]).axis)
      .toBe(classifyStroke(s, VPS, SZ).axis);
  });

  it("대표 직선은 시작-끝이 아니라 최소제곱이다 — **비대칭** 획에서 갈린다", () => {
    // 대칭으로 부푼 호(sin)는 주축이 현과 **정확히 나란하다** — 편차가 상쇄되기 때문이다.
    // (첫 시도가 그것이었고 차이가 1.6e-17로 나왔다. 반례가 틀렸던 것이지 코드가 아니다.)
    const sym: Pt2[] = Array.from({ length: 31 }, (_, i) => {
      const t = i / 30;
      return [t * 300, Math.sin(Math.PI * t) * 40] as Pt2;
    });
    const symRep = representative(sym)!;
    const symChord = Math.atan2(sym[30][1] - sym[0][1], sym[30][0] - sym[0][0]);
    expect(Math.abs(Math.atan2(symRep.b[1] - symRep.a[1], symRep.b[0] - symRep.a[0]) - symChord))
      .toBeLessThan(1e-9);
    expect(symRep.bend).toBeGreaterThan(0.05);

    // 끝에 갈고리가 달린 비대칭 획: 현은 갈고리에 끌려가고 주축은 몸통을 따른다
    const hook: Pt2[] = Array.from({ length: 26 }, (_, i) => [i * 12, 0] as Pt2);
    for (let i = 1; i <= 8; i++) hook.push([300 + i * 3, i * 9]);
    const rep = representative(hook)!;
    const chord = Math.atan2(hook[hook.length - 1][1] - hook[0][1],
                             hook[hook.length - 1][0] - hook[0][0]);
    const pca = Math.atan2(rep.b[1] - rep.a[1], rep.b[0] - rep.a[0]);
    expect(Math.abs(pca)).toBeLessThan(Math.abs(chord) * 0.7);   // 주축이 몸통에 더 가깝다
  });

  it("최대 방향 변화: 곧은 획은 작고 코너 있는 획은 크다", () => {
    const straight: Pt2[] = Array.from({ length: 40 }, (_, i) => [i * 8, i * 3] as Pt2);
    const corner: Pt2[] = [
      ...Array.from({ length: 20 }, (_, i) => [i * 8, 0] as Pt2),
      ...Array.from({ length: 20 }, (_, i) => [160, i * 8] as Pt2),
    ];
    expect(maxTurn(straight, 0.12)).toBeLessThan(1);
    expect(maxTurn(corner, 0.12)).toBeGreaterThan(60);
  });
});
