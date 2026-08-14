// W-2 추론 엔진 — 방향 분류 + 제약 재적합. 계획서 §4.1.
//
// **분류는 점-직선 거리로 한다.** 선을 연장해 소실점을 지나는지 검사하는 것이
// 각도 추정보다 강건하다 — 끝점 오차가 방향에 미치는 영향이 작고, 클래스가 서로 멀다.
// 각도로 하면 짧은 선에서 방향 오차가 폭발한다(끝점 1px 흔들림이 20px 선에서는 3°다).
//
// **제약 재적합**이 이 단계의 핵심이다. 분류된 선을 정확히 그 VP를 지나도록 다시 적합하면
// 자유도가 2에서 1로 줄고 손떨림이 제거된다. 평면 파서에서 직교 스냅이 하던 일의 투시 판.
import { lineIntersect, isFiniteVp, type Pt2 } from "./camera.js";
import type { Seg } from "./strokeEdge.js";

/** 축 라벨. `screen`은 화면 평행(c=0, 축소 없음). `free`는 어느 VP도 향하지 않는 선. */
export type Direction = 0 | 1 | 2 | "screen" | "free";

export const INFER_TOL = {
  // 선의 **중점**에서 (끝점→VP) 직선까지의 거리. 선 길이 대비 비율로 잰다.
  // 절대 픽셀로 두면 확대·도형 크기에 따라 다른 것을 재게 된다(V-s).
  vp_dist_ratio: 0.06,
  // 화면 평행 판정: 두 끝점의 y(또는 x) 차이가 길이 대비 이 값 이하
  screen_parallel: 0.05,
  // 두 후보가 이만큼 안에서 비슷하면 애매한 것으로 보고 분류하지 않는다.
  // **애매한 것을 억지로 고르지 않는다** — 미분류로 남기는 것이 잘못 붙이는 것보다 낫다.
  ambiguity_margin: 1.4,
  // **재적합은 기본으로 끈다** — 측정이 전제를 반증했다(assumptions W-2, refit_gain.json).
  //
  // 방향만 고치는 재적합은 코너 오차를 거의 못 줄인다(중앙값 감소 0.4~2%)고 p90은
  // 오히려 나빠진다(0.121→0.136). 이유는 두 가지다.
  //   1. 코너 오차의 지배항은 **방향이 아니라 옆으로 밀린 양**이다. 중점을 보존한 채
  //      방향만 돌리면 그 성분이 그대로 남는다.
  //   2. 재적합된 것들 중 11~32%가 **잘못 분류된 것**이고, 그것들은 엉뚱한 VP로 끌려가
  //      원래보다 나빠진다. 부적합도로 걸러도 개선되지 않았다 — 짧은 선은 틀린 VP에도
  //      아주 잘 맞기 때문이다(부적합도가 0 근처면 비율 기준 애매성 판정이 무력해진다).
  //
  // 계획서가 예상한 우회로다(A-2 단계 2: "제약 재적합이 불안정하면 재적합 없이 분류만").
  // **분류는 그대로 쓴다** — 표시·스냅·W-3 배치가 방향 라벨을 필요로 한다.
  // 진짜 해법은 코너를 공유하는 선들을 **함께** 푸는 것이고 W-3 앵커 체인의 일이다.
  refit: false,
  refit_max_misfit: 0.02,
};
export type InferCfg = Partial<typeof INFER_TOL>;

/**
 * 선분이 소실점을 향하는가 — **점-직선 거리**로 잰다.
 * 선분의 중점이, 한쪽 끝점과 VP를 잇는 직선에서 얼마나 떨어져 있는가(선 길이 대비).
 * 0이면 정확히 VP를 향한다.
 */
export function vpMisfit(seg: Seg, vp: Pt2): number {
  const m: Pt2 = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
  // 더 먼 끝점을 기준으로 잡는다 — 가까운 쪽을 쓰면 지렛대가 짧아 거리가 과소평가된다
  const da = Math.hypot(vp[0] - seg.a[0], vp[1] - seg.a[1]);
  const db = Math.hypot(vp[0] - seg.b[0], vp[1] - seg.b[1]);
  const p = da >= db ? seg.a : seg.b;
  const dx = vp[0] - p[0], dy = vp[1] - p[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9 || seg.len < 1e-9) return Infinity;
  return Math.abs((m[0] - p[0]) * dy - (m[1] - p[1]) * dx) / L / seg.len;
}

export interface Classification {
  direction: Direction;
  misfit: number | null;       // 채택된 방향의 부적합도. free/미분류면 null
  runnerUp: number | null;     // 2등의 부적합도 — 얼마나 아슬아슬했는지
  ambiguous: boolean;          // 1등과 2등이 가까워 억지로 고르지 않은 경우
}

/** 선분 하나 → 방향. 확정된 소실점만 후보다(모르는 축에 붙이지 않는다). */
export function classify(seg: Seg, vps: (Pt2 | null)[], imgSize: [number, number],
                         cfg: InferCfg = {}): Classification {
  const c = { ...INFER_TOL, ...cfg };
  const scored: { dir: Direction; m: number }[] = [];
  vps.forEach((v, i) => {
    if (!v || !isFiniteVp(v, imgSize)) return;
    scored.push({ dir: i as 0 | 1 | 2, m: vpMisfit(seg, v) });
  });
  // 화면 평행: 어느 VP도 없이 수평/수직에 가까운 선. c=0 축(2.2)에 해당한다.
  const dx = Math.abs(seg.b[0] - seg.a[0]) / seg.len;
  const dy = Math.abs(seg.b[1] - seg.a[1]) / seg.len;
  const screenMisfit = Math.min(dx, dy);
  scored.push({ dir: "screen", m: screenMisfit <= c.screen_parallel ? screenMisfit : Infinity });

  scored.sort((p, q) => p.m - q.m);
  const best = scored[0], second = scored[1];
  if (!best || !Number.isFinite(best.m) || best.m > c.vp_dist_ratio) {
    return { direction: "free", misfit: null, runnerUp: null, ambiguous: false };
  }
  // 1등이 2등보다 충분히 낫지 않으면 고르지 않는다
  const ambiguous = !!second && Number.isFinite(second.m)
    && second.m <= c.vp_dist_ratio && second.m < best.m * c.ambiguity_margin;
  return {
    direction: ambiguous ? "free" : best.dir,
    misfit: best.m,
    runnerUp: second && Number.isFinite(second.m) ? second.m : null,
    ambiguous,
  };
}

// ---------------------------------------------------------------- 제약 재적합

/**
 * 분류된 선을 **정확히 그 VP를 지나도록** 다시 적합한다.
 *
 * 자유도가 2(방향+위치)에서 1(위치만)로 준다. 구현은 간단하다 — 선분의 중점을 지나면서
 * VP를 향하는 직선 위로 두 끝점을 사영하고, 원래 길이를 보존한다.
 * **중점을 고정점으로 삼는 것**이 요점이다. 끝점 하나를 고정하면 그 끝점의 오차가
 * 그대로 남고, 중점은 두 끝점 오차의 평균이라 더 안정적이다.
 */
export function refitToVp(seg: Seg, vp: Pt2): Seg {
  const m: Pt2 = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
  const dx = vp[0] - m[0], dy = vp[1] - m[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return seg;
  const ux = dx / L, uy = dy / L;
  // 원래 두 끝점을 이 방향에 사영한 매개변수(중점 기준)
  const ta = (seg.a[0] - m[0]) * ux + (seg.a[1] - m[1]) * uy;
  const tb = (seg.b[0] - m[0]) * ux + (seg.b[1] - m[1]) * uy;
  const a: Pt2 = [m[0] + ux * ta, m[1] + uy * ta];
  const b: Pt2 = [m[0] + ux * tb, m[1] + uy * tb];
  return { a, b, len: Math.abs(tb - ta), residual: seg.residual, straight: seg.straight };
}

/** 화면 평행(c=0) 선의 재적합 — 수평/수직 중 가까운 쪽으로 정렬한다. */
export function refitToScreen(seg: Seg): Seg {
  const m: Pt2 = [(seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2];
  const horiz = Math.abs(seg.b[0] - seg.a[0]) >= Math.abs(seg.b[1] - seg.a[1]);
  const half = seg.len / 2;
  const a: Pt2 = horiz ? [m[0] - half, m[1]] : [m[0], m[1] - half];
  const b: Pt2 = horiz ? [m[0] + half, m[1]] : [m[0], m[1] + half];
  return { a, b, len: seg.len, residual: seg.residual, straight: seg.straight };
}

export interface InferredEdge { seg: Seg; original: Seg; cls: Classification; refitted: boolean; }

/**
 * 선분들을 한 번에 분류·재적합한다.
 *
 * `free`는 손대지 않는다 — 모르는 것을 고치지 않는다.
 * 분류는 됐지만 **부적합도가 큰** 선도 손대지 않는다: 그런 선은 잘못 붙었을 가능성이 높고,
 * 엉뚱한 VP로 끌어당기면 그 코너가 크게 튄다. 분류 라벨은 그대로 남으므로
 * 표시·스냅에는 계속 쓰인다.
 */
export function inferEdges(segs: Seg[], vps: (Pt2 | null)[], imgSize: [number, number],
                           cfg: InferCfg = {}): InferredEdge[] {
  const c = { ...INFER_TOL, ...cfg };
  return segs.map(s => {
    const cls = classify(s, vps, imgSize, cfg);
    if (cls.direction === "free") return { seg: s, original: s, cls, refitted: false };
    if (!c.refit) return { seg: s, original: s, cls, refitted: false };
    if (cls.misfit != null && cls.misfit > c.refit_max_misfit) {
      return { seg: s, original: s, cls, refitted: false };
    }
    if (cls.direction === "screen") return { seg: refitToScreen(s), original: s, cls, refitted: true };
    const v = vps[cls.direction as 0 | 1 | 2]!;
    return { seg: refitToVp(s, v), original: s, cls, refitted: true };
  });
}
