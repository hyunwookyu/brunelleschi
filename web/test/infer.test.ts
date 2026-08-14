// W-2 방향 분류 + 제약 재적합. 계획서 §4.1.
//
// 핵심 측정: **재적합이 코너 오차를 줄이는가**(assumptions W-2).
// 정답이 있어야 재므로 소실점 셋으로 **투시 정합적인 상자**를 작도해 정답 코너를 만든다.
// 그 다음 엣지 끝점에 실측 잉크 노이즈를 얹고, 재적합 전후로 코너(=엣지 교점)가
// 정답에서 얼마나 떨어지는지 잰다.
//
// 산출물: stage0/out/refit_gain.json
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, refitToVp, inferEdges, vpMisfit, INFER_TOL } from "../src/wire/infer.js";
import { lineIntersect, fFromThreeVps, type Pt2 } from "../src/wire/camera.js";
import { rng32, gauss, INK_GRADES, type InkGrade } from "../src/wire/synthInk.js";
import type { Seg } from "../src/wire/strokeEdge.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SZ: [number, number] = [960, 672];
const seg = (a: Pt2, b: Pt2): Seg =>
  ({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), residual: 0, straight: true });

/** 광선 O→V 위에서 매개변수 t(0~1) 지점. */
const along = (o: Pt2, v: Pt2, t: number): Pt2 => [o[0] + (v[0] - o[0]) * t, o[1] + (v[1] - o[1]) * t];

/**
 * 소실점 셋으로 **투시 정합적인 상자**를 작도한다. 손으로 그리는 절차 그대로다:
 * 한 모서리 O에서 세 방향으로 나가고, 반대편 모서리는 교점으로 얻는다.
 * 반환: 8정점 + 12엣지(각 엣지가 어느 축인지 라벨 포함).
 */
function buildBox(vps: [Pt2, Pt2, Pt2], O: Pt2, t: [number, number, number]) {
  const [V0, V1, V2] = vps;
  const A = along(O, V0, t[0]), B = along(O, V1, t[1]), C = along(O, V2, t[2]);
  const AB = lineIntersect(A, V1, B, V0)!;
  const AC = lineIntersect(A, V2, C, V0)!;
  const BC = lineIntersect(B, V2, C, V1)!;
  const ABC = lineIntersect(AB, V2, AC, V1)!;
  const P = { O, A, B, C, AB, AC, BC, ABC };
  const edges: { a: Pt2; b: Pt2; axis: 0 | 1 | 2 }[] = [
    { a: O, b: A, axis: 0 }, { a: B, b: AB, axis: 0 }, { a: C, b: AC, axis: 0 }, { a: BC, b: ABC, axis: 0 },
    { a: O, b: B, axis: 1 }, { a: A, b: AB, axis: 1 }, { a: C, b: BC, axis: 1 }, { a: AC, b: ABC, axis: 1 },
    { a: O, b: C, axis: 2 }, { a: A, b: AC, axis: 2 }, { a: B, b: BC, axis: 2 }, { a: AB, b: ABC, axis: 2 },
  ];
  return { P, edges };
}

/** 예각 삼각형(6.5)을 이루는 소실점 셋. 무효 카메라로 재면 측정이 무의미하다. */
const VPS: [Pt2, Pt2, Pt2] = [[-900, 260], [1900, 260], [480, 2600]];

function noisy(p: Pt2, sigma: number, r: () => number): Pt2 {
  return [p[0] + gauss(r) * sigma, p[1] + gauss(r) * sigma];
}

/** 코너 = 두 엣지의 교점. 재적합 전후로 이 점이 정답에서 얼마나 떨어지는지가 관심사다. */
function cornerErr(e1: Seg, e2: Seg, truth: Pt2, diag: number): number | null {
  const x = lineIntersect(e1.a, e1.b, e2.a, e2.b);
  if (!x) return null;
  return Math.hypot(x[0] - truth[0], x[1] - truth[1]) / diag;
}

function runGrade(grade: InkGrade, seed: number, n = 300) {
  const r = rng32(seed);
  const diag = Math.hypot(...SZ);
  const before: number[] = [], after: number[] = [], afterGated: number[] = [];
  let classified = 0, wrong = 0, ambiguous = 0, total = 0, refitted = 0, refitWrong = 0;
  for (let it = 0; it < n; it++) {
    const O: Pt2 = [300 + r() * 340, 300 + r() * 220];
    const box = buildBox(VPS, O, [0.16 + r() * 0.1, 0.16 + r() * 0.1, 0.10 + r() * 0.06]);
    // 끝점 노이즈: 실측 코너 오차 등급을 상자 대각 대비로 환산
    const xs = Object.values(box.P).map(p => p[0]), ys = Object.values(box.P).map(p => p[1]);
    const boxDiag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const sigma = INK_GRADES[grade].lf_bow * boxDiag * 0.5;

    const raw = box.edges.map(e => seg(noisy(e.a, sigma, r), noisy(e.b, sigma, r)));
    const inferred = inferEdges(raw, VPS, SZ, { refit: true, refit_max_misfit: 1 });
    const gated = inferEdges(raw, VPS, SZ, { refit: true });
    inferred.forEach((f, i) => {
      total += 1;
      if (f.cls.ambiguous) ambiguous += 1;
      if (f.cls.direction === "free") return;
      classified += 1;
      const bad = f.cls.direction !== box.edges[i].axis;
      if (bad) wrong += 1;
      if (f.refitted) { refitted += 1; if (bad) refitWrong += 1; }
    });

    // 코너 오차 — O에서 만나는 세 엣지 쌍 (인덱스 0·4·8)
    for (const [i, j] of [[0, 4], [4, 8], [0, 8]] as [number, number][]) {
      const b = cornerErr(raw[i], raw[j], box.P.O, diag);
      const a = cornerErr(inferred[i].seg, inferred[j].seg, box.P.O, diag);
      const g = cornerErr(gated[i].seg, gated[j].seg, box.P.O, diag);
      if (b != null && a != null && g != null) { before.push(b); after.push(a); afterGated.push(g); }
    }
  }
  const q = (v: number[], p: number) =>
    v.length ? +([...v].sort((x, y) => x - y)[Math.floor(v.length * p / 100)]).toFixed(5) : null;
  return {
    n_corners: before.length,
    corner_err_before: { median: q(before, 50), p90: q(before, 90) },
    corner_err_after: { median: q(after, 50), p90: q(after, 90) },
    corner_err_after_gated: { median: q(afterGated, 50), p90: q(afterGated, 90) },
    reduction_median: before.length
      ? +(1 - (q(after, 50) ?? 0) / Math.max(1e-9, q(before, 50) ?? 1)).toFixed(4) : null,
    classified_rate: +(classified / total).toFixed(4),
    misclassified_rate: +(wrong / Math.max(1, classified)).toFixed(4),
    ambiguous_rate: +(ambiguous / total).toFixed(4),
    refit_rate: +(refitted / total).toFixed(4),
    // 실제로 **고쳐진 것들 중** 잘못 붙은 비율. 이것이 p90 악화의 원인이었다.
    refit_misclassified_rate: +(refitWrong / Math.max(1, refitted)).toFixed(4),
  };
}

describe("W-2 방향 분류 + 제약 재적합", () => {
  it("재적합이 코너 오차를 줄이는가 (assumptions W-2)", () => {
    const res = {
      spec: "W-2 제약 재적합의 코너 오차 감소. 소실점 셋으로 작도한 상자가 정답.",
      method: [
        "예각 소실점 셋(6.5)으로 투시 정합적인 상자를 작도 → 정답 코너 8개.",
        "엣지 끝점에 실측 잉크 노이즈(등급별 lf_bow)를 얹는다.",
        "분류(점-직선 거리) → 그 VP를 지나도록 재적합 → 코너를 교점으로 다시 구한다.",
        "코너 오차는 **이미지 대각 대비**다(절대 픽셀 금지, V-s).",
      ],
      verdict: ("**전제 반증**(assumptions W-2). 방향만 고치는 재적합은 코너 오차를 거의 "
        + "못 줄이고(중앙값 0.4~2%) p90은 오히려 나빠진다. 코너 오차의 지배항은 방향이 아니라 "
        + "**옆으로 밀린 양**이고, 중점을 보존한 채 방향만 돌리면 그 성분이 남는다. "
        + "게다가 재적합된 것 중 11~32%가 잘못 분류된 것이라 엉뚱한 VP로 끌려간다. "
        + "→ 재적합을 기본으로 끄고 **분류만** 쓴다(계획서 A-2 단계 2가 예상한 우회로). "
        + "진짜 해법은 코너를 공유하는 선들을 함께 푸는 것이고 W-3의 일이다."),
      caveat: ("합성이다. 실획의 실패 모드(다획·덧그림·구조 요인)는 들어 있지 않다(V-o). "
        + "여기서 재는 것은 '**재적합이라는 연산이 오차를 줄이는가**'이지 실사용 성능이 아니다."),
      camera: { vps: VPS, f: fFromThreeVps(...VPS).f, note: "예각 조건 통과 — 무효 카메라로 재면 무의미하다" },
      by_grade: {
        precise: runGrade("precise", 201),
        medium: runGrade("medium", 202),
        coarse: runGrade("coarse", 203),
      },
    };
    const outDir = resolve(ROOT, "stage0", "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "refit_gain.json"), JSON.stringify(res, null, 2), "utf-8");

    for (const g of ["precise", "medium", "coarse"] as const) {
      expect(res.by_grade[g].n_corners).toBeGreaterThan(100);
    }
    // **전제 W-2가 반증됐음을 테스트로 잠근다.** 나중에 재적합이 실제로 효과를 내면
    // 이 테스트가 깨지고, 그때 전제와 기본값을 함께 되돌린다.
    expect(res.by_grade.medium.reduction_median!).toBeLessThan(0.10);
    expect(res.by_grade.medium.corner_err_after.p90!)
      .toBeGreaterThan(res.by_grade.medium.corner_err_before.p90!);
  }, 300_000);

  it("반례: 재적합은 방향만 고친다 — 이미 정확한 선은 거의 그대로다", () => {
    const V: Pt2 = [1900, 260];
    const s = seg([300, 400], [700, 372.6]);          // 대충 V를 향함
    const t = refitToVp(s, V);
    expect(vpMisfit(t, V)).toBeLessThan(1e-9);
    // 중점은 보존된다 — 끝점 하나를 고정하면 그 끝점 오차가 그대로 남는다
    expect((t.a[0] + t.b[0]) / 2).toBeCloseTo((s.a[0] + s.b[0]) / 2, 9);
    expect((t.a[1] + t.b[1]) / 2).toBeCloseTo((s.a[1] + s.b[1]) / 2, 9);
    // 길이도 대체로 보존(사영이므로 약간 줄 수 있다)
    expect(t.len).toBeLessThanOrEqual(s.len + 1e-9);
    expect(t.len).toBeGreaterThan(s.len * 0.9);
  });

  it("반례: 어느 VP도 향하지 않는 선은 free로 남고 **손대지 않는다**", () => {
    // 45° 대각 — 세 VP가 각각 왼쪽·오른쪽·아래에 있으므로 어느 쪽도 아니다.
    // (첫 시도 [400,300]→[420,520]은 거의 수직이라 **아래쪽 VP2로 제대로 잡혔다** —
    //  반례가 틀렸던 것이지 코드가 틀린 것이 아니었다. 면 위 사선이 바로 이 자리다.)
    const s = seg([400, 400], [560, 240]);
    const c = classify(s, VPS, SZ);
    expect(c.direction).toBe("free");
    const [f] = inferEdges([s], VPS, SZ, { refit: true });
    expect(f.refitted).toBe(false);
    expect(f.seg).toEqual(s);
  });

  it("반례: 두 축이 비슷하게 맞으면 억지로 고르지 않는다", () => {
    // 두 소실점을 아주 가깝게 두면 어느 쪽인지 구분되지 않는다
    const near: (Pt2 | null)[] = [[1900, 260], [1904, 262], null];
    const s = seg([300, 400], [700, 372.6]);
    const c = classify(s, near, SZ);
    expect(c.ambiguous).toBe(true);
    expect(c.direction).toBe("free");
  });

  it("반례: 화면 평행선은 screen으로 잡히고 수평으로 정렬된다 (c=0, 2.2)", () => {
    const s = seg([200, 400], [600, 404]);
    const [f] = inferEdges([s], [null, null, null], SZ, { refit: true });
    expect(f.cls.direction).toBe("screen");
    expect(f.seg.a[1]).toBeCloseTo(f.seg.b[1], 9);
  });

  it("분류 임계는 선 길이 대비다 — 10배 확대해도 같은 판정 (V-s)", () => {
    const s = seg([300, 400], [700, 372.6]);
    const big = seg([3000, 4000], [7000, 3726]);
    const bigVps: (Pt2 | null)[] = VPS.map(v => [v[0] * 10, v[1] * 10] as Pt2);
    expect(classify(big, bigVps, [SZ[0] * 10, SZ[1] * 10]).direction)
      .toBe(classify(s, VPS, SZ).direction);
    expect(INFER_TOL.vp_dist_ratio).toBeLessThan(1);
  });
});
