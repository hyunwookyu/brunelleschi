// S-2 방향 판정 — 계획서 §4.1. **획 전체가 하나의 축에 배정된다.**
//
// 개별 점은 그 축을 중심으로 흔들린다. 시스템이 하는 판정은 이것뿐이고,
// 획의 형태에는 손대지 않는다.
//
// **판정은 점-직선 거리로 한다.** 획의 대표 방향을 연장해 소실점을 지나는지 검사한다.
// 각도 추정보다 강건하다 — 끝점 오차의 영향이 작고 클래스가 서로 멀다.
// 각도로 하면 짧은 획에서 방향 오차가 폭발한다(끝점 1px 흔들림이 20px 획에서 3°다).
//
// **애매하면 미분류로 둔다.** 조용히 틀린 축에 배정하는 것보다 사용자에게 묻는 것이 낫다
// (CLAUDE.md A-3). 미분류 획은 §4.3 폴백으로 간다.
import { isFiniteVp, type Pt2 } from "./camera.js";

export type Axis = 0 | 1 | 2 | "screen" | "free";

export const AXIS_TOL = {
  /** 대표 직선에서 소실점까지의 **수직거리 ÷ 획 길이**. 절대 픽셀 금지(V-s). */
  vp_dist_ratio: 0.06,
  /** 화면평행(c=0) 판정 — 대표 방향이 수평/수직에서 벗어난 정도(길이 대비). */
  screen_parallel: 0.05,
  /** 1등이 2등보다 이 배수만큼 나아야 채택한다. 아니면 미분류. */
  ambiguity_margin: 1.5,
  /** 부적합도가 이보다 작으면 배수 기준이 무력해지므로(둘 다 0에 가까움) 절대 여유로 가른다. */
  ambiguity_floor: 0.008,
  /** 이보다 짧은 획은 방향을 못 믿는다 — 화면 대각 대비. */
  min_len_ratio: 0.02,
  /** 곡률: 대표 직선에서의 최대 편차 ÷ 길이. 넘으면 "크게 휜 획"으로 본다. */
  bend_max: 0.18,
  /**
   * **한 획에 여러 축**(§4.1 미결 항목) — 방향 급변으로 검출한다.
   * 계획서는 "축마다 끊어 그린다고 가정"과 "급변점에서 분절" 두 후보를 뒀다.
   * **분절하지 않는다**(A-3: 조용히 틀린 축에 배정하지 않는다). 대신 검출해서 미분류로 두고
   * 사용자에게 나눠 그으라고 말한다 — 획을 쪼개는 순간 "획을 버리지 않는다"가 깨진다.
   */
  turn_deg: 45,
  turn_window_ratio: 0.12,      // 방향을 재는 창 = 점 수 대비

  // ---- S-2b 체계적 왜곡 대응 (AS-14). 카메라(`cam`)가 주어질 때만 켜진다 ----
  /**
   * **(a) 위치 의존 임계.** 이론서 18.4: 화각 60° 이내는 평면-구면 차이가 선 굵기 이하이고,
   * 넘어가면 주변부 신장이 감지된다 — 사람은 그 구간에서 수렴을 완화해 그린다.
   * 그러므로 허용 범위도 화각 60°(반각 30°, tan = 0.577)를 넘는 만큼 넓힌다.
   * 0이면 꺼진다(기존 동작).
   */
  angle_relax: 1.2,
  /** 18.4의 기준 반각. `tan(30°)`. */
  angle_t60: 0.5773502692,
  /**
   * **(b) 상대 순위 판정.** 체계적 왜곡은 **모든 후보의 부적합도를 함께 밀어 올린다** —
   * 절대 임계로는 전부 탈락하지만 **순위는 유지된다**. 1등이 2등보다 이 배수만큼 나으면
   * 절대 임계를 넘어도 채택한다. 단 아래 천장까지다.
   */
  rank_margin: 2.5,
  /** 상대 판정의 하드 천장 — 이보다 나쁘면 순위가 좋아도 배정하지 않는다. */
  vp_dist_ceiling: 0.22,
};
export type AxisCfg = Partial<typeof AXIS_TOL>;

export interface Rep { a: Pt2; b: Pt2; len: number; bend: number; }

/** 카메라 — (a) 위치 의존 임계에 필요하다. 없으면 그 보정이 꺼진다. */
export interface AxisCam { principal: Pt2; f: number; }

/**
 * 획의 **대표 직선**. 최소제곱(PCA 주축)으로 잡고 점열을 그 위에 사영해 양 끝을 낸다.
 * 시작-끝 잇기보다 낫다 — 획이 휘면 시작-끝 방향이 실제 진행 방향과 어긋난다.
 * `bend`는 그 직선에서의 최대 편차(길이 대비)이며 "크게 휜 획" 판정에 쓴다.
 */
export function representative(pts: Pt2[]): Rep | null {
  const n = pts.length;
  if (n < 2) return null;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) {
    const dx = p[0] - cx, dy = p[1] - cy;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  // 2×2 대칭행렬의 주고유벡터
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const lam = tr / 2 + Math.sqrt(disc);
  let ux = sxy, uy = lam - sxx;
  if (Math.hypot(ux, uy) < 1e-12) { ux = lam - syy; uy = sxy; }
  const L = Math.hypot(ux, uy);
  if (L < 1e-12) return null;
  ux /= L; uy /= L;

  let tmin = Infinity, tmax = -Infinity, bend = 0;
  for (const p of pts) {
    const dx = p[0] - cx, dy = p[1] - cy;
    const t = dx * ux + dy * uy;
    tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
    bend = Math.max(bend, Math.abs(dx * -uy + dy * ux));      // 수직 편차
  }
  const a: Pt2 = [cx + ux * tmin, cy + uy * tmin];
  const b: Pt2 = [cx + ux * tmax, cy + uy * tmax];
  const len = tmax - tmin;
  return { a, b, len, bend: len > 1e-9 ? bend / len : Infinity };
}

/**
 * 획 안의 **최대 방향 변화**(도). 창 양쪽 현(chord)의 각도차로 잰다.
 * 크게 휜 곡선은 변화가 완만히 쌓이고, 코너가 있는 획은 한 점에서 급변한다 —
 * 그 둘을 가르는 것이 이 값이다.
 */
export function maxTurn(pts: Pt2[], windowRatio: number): number {
  const n = pts.length;
  const w = Math.max(2, Math.round(n * windowRatio));
  if (n < 2 * w + 1) return 0;
  let best = 0;
  for (let i = w; i < n - w; i++) {
    const ax = pts[i][0] - pts[i - w][0], ay = pts[i][1] - pts[i - w][1];
    const bx = pts[i + w][0] - pts[i][0], by = pts[i + w][1] - pts[i][1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) continue;
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    best = Math.max(best, (Math.acos(cos) * 180) / Math.PI);
  }
  return best;
}

/**
 * **부호 있는** 부적합도 — 대표 직선을 연장했을 때 소실점이 **어느 쪽으로** 빗나갔는가.
 *
 * 크기만으로는 체계적 왜곡을 다룰 수 없다. 왜곡은 방향이 있으므로 이웃 획들이 **같은 쪽으로**
 * 빗나가고, 그 편향을 빼면 판정이 선다(§c). 부호가 없으면 편향이 상쇄돼 보인다.
 */
export function vpMisfitSigned(rep: Rep, vp: Pt2): number {
  const m: Pt2 = [(rep.a[0] + rep.b[0]) / 2, (rep.a[1] + rep.b[1]) / 2];
  const da = Math.hypot(vp[0] - rep.a[0], vp[1] - rep.a[1]);
  const db = Math.hypot(vp[0] - rep.b[0], vp[1] - rep.b[1]);
  const p = da >= db ? rep.a : rep.b;
  const dx = vp[0] - p[0], dy = vp[1] - p[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9 || rep.len < 1e-9) return Infinity;
  return ((m[0] - p[0]) * dy - (m[1] - p[1]) * dx) / L / rep.len;
}

/** 대표 직선이 소실점을 얼마나 빗나가는가 — **수직거리 ÷ 길이**. */
export function vpMisfit(rep: Rep, vp: Pt2): number {
  const m: Pt2 = [(rep.a[0] + rep.b[0]) / 2, (rep.a[1] + rep.b[1]) / 2];
  // 먼 쪽 끝점을 기준으로 잡는다 — 가까운 쪽은 지렛대가 짧아 거리가 과소평가된다
  const da = Math.hypot(vp[0] - rep.a[0], vp[1] - rep.a[1]);
  const db = Math.hypot(vp[0] - rep.b[0], vp[1] - rep.b[1]);
  const p = da >= db ? rep.a : rep.b;
  const dx = vp[0] - p[0], dy = vp[1] - p[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9 || rep.len < 1e-9) return Infinity;
  return Math.abs((m[0] - p[0]) * dy - (m[1] - p[1]) * dx) / L / rep.len;
}

/**
 * **(a) 위치 의존 임계 배수.** 대표 직선의 중점이 주점에서 얼마나 떨어졌는지를 화각으로 재고,
 * 이론서 18.4의 60° 기준을 넘는 만큼 허용 범위를 넓힌다. 60° 안이면 1(넓히지 않는다).
 */
export function angleWiden(rep: Rep, cam: AxisCam | undefined, c: typeof AXIS_TOL): number {
  if (!cam || c.angle_relax <= 0) return 1;
  const mx = (rep.a[0] + rep.b[0]) / 2 - cam.principal[0];
  const my = (rep.a[1] + rep.b[1]) / 2 - cam.principal[1];
  const t = Math.hypot(mx, my) / cam.f;               // tan(반각)
  return 1 + c.angle_relax * Math.max(0, t / c.angle_t60 - 1);
}

export type Reason =
  | "ok" | "too_short" | "too_bent" | "multi_axis" | "ambiguous" | "no_axis_matches" | "no_camera";

export interface AxisScore { axis: Axis; m: number; signed: number; }

export interface AxisVerdict {
  axis: Axis;
  reason: Reason;
  misfit: number | null;
  runnerUp: number | null;
  rep: Rep | null;
  /** 후보별 부적합도(부호 포함). **§c 획 간 일관성이 이것을 쓴다.** */
  scores?: AxisScore[];
  /** 순위 기준으로만 채택했는가(절대 임계 초과) — 보고와 측정에서 갈라 본다. */
  relative?: boolean;
  /** 미분류 이유를 사람 말로. 사용자가 축을 직접 고를 때 화면에 나온다. */
  note: string;
}

const NOTE: Record<Reason, string> = {
  ok: "",
  too_short: "획이 너무 짧아 방향을 믿을 수 없습니다 — 축을 골라 주세요",
  too_bent: "크게 휜 획입니다 — 축을 골라 주거나 나눠 그어 주세요",
  multi_axis: "한 획에 방향이 두 개 이상 있습니다 — 축마다 나눠 그어 주세요",
  ambiguous: "두 축이 비슷하게 맞습니다 — 어느 쪽인지 골라 주세요",
  no_axis_matches: "어느 축도 아닙니다 — 면 위 사선이거나 자유 곡선입니다",
  no_camera: "카메라가 아직 확정되지 않았습니다",
};

/**
 * 획 하나 → 축. 확정된 소실점만 후보다(모르는 축에 배정하지 않는다).
 *
 * 순서가 중요하다: **길이 → 곡률 → 후보 점수 → 애매성**.
 * 짧거나 크게 휜 획은 점수를 내기 전에 걸러야 한다 — 그런 획은 어느 축에도
 * 우연히 잘 맞을 수 있고, 그러면 애매성 판정마저 통과해 버린다.
 */
export function classifyStroke(
  pts: Pt2[], vps: (Pt2 | null)[], imgSize: [number, number], cfg: AxisCfg = {},
  cam?: AxisCam,
): AxisVerdict {
  const c = { ...AXIS_TOL, ...cfg };
  const diag = Math.hypot(imgSize[0], imgSize[1]);
  const rep = representative(pts);
  const base = { misfit: null, runnerUp: null, rep };
  if (!rep) return { ...base, axis: "free", reason: "too_short", note: NOTE.too_short };
  if (rep.len < c.min_len_ratio * diag) {
    return { ...base, axis: "free", reason: "too_short", note: NOTE.too_short };
  }
  // 여러 축이 먼저다 — 코너가 있는 획은 곡률도 크므로, 순서를 바꾸면 원인을 잘못 말한다
  if (maxTurn(pts, c.turn_window_ratio) > c.turn_deg) {
    return { ...base, axis: "free", reason: "multi_axis", note: NOTE.multi_axis };
  }
  if (rep.bend > c.bend_max) {
    return { ...base, axis: "free", reason: "too_bent", note: NOTE.too_bent };
  }

  const scored: AxisScore[] = [];
  vps.forEach((v, i) => {
    if (!v || !isFiniteVp(v, imgSize)) return;
    scored.push({ axis: i as 0 | 1 | 2, m: vpMisfit(rep, v), signed: vpMisfitSigned(rep, v) });
  });
  // 화면평행(c=0) — 소실점이 없는 축. 수평·수직 중 가까운 쪽에서 벗어난 정도로 잰다.
  const dx = Math.abs(rep.b[0] - rep.a[0]) / rep.len;
  const dy = Math.abs(rep.b[1] - rep.a[1]) / rep.len;
  const sm = Math.min(dx, dy);
  scored.push({ axis: "screen", m: sm <= c.screen_parallel ? sm : Infinity, signed: sm });

  scored.sort((p, q) => p.m - q.m);
  const withScores = { ...base, scores: scored };
  const best = scored[0], second = scored[1];
  if (!best || !Number.isFinite(best.m)) {
    const reason: Reason = scored.length <= 1 ? "no_camera" : "no_axis_matches";
    return { ...withScores, axis: "free", reason, note: NOTE[reason] };
  }

  // (a) 위치 의존 임계 — 화각 60° 밖에서는 사람이 수렴을 완화해 그린다(18.4·AS-14)
  const tol = c.vp_dist_ratio * angleWiden(rep, cam, c);
  const runnerUp = second && Number.isFinite(second.m) ? second.m : null;

  // (b) 상대 순위 — 왜곡은 후보 전체를 함께 밀어 올리므로 순위는 살아 있다
  let relative = false;
  if (best.m > tol) {
    const ranked = runnerUp != null && runnerUp > best.m * c.rank_margin;
    if (!(ranked && best.m <= c.vp_dist_ceiling)) {
      return { ...withScores, axis: "free", misfit: best.m, reason: "no_axis_matches",
               note: NOTE.no_axis_matches };
    }
    relative = true;
  }

  // 배수 기준은 1등이 0에 가까우면 무력해진다(짧은 획이 틀린 축에도 잘 맞는 경우).
  // 절대 여유를 함께 본다 — **둘 중 하나만 만족해도 구분된 것으로 본다.**
  const separated = runnerUp == null
    || runnerUp > best.m * c.ambiguity_margin
    || runnerUp - best.m > c.ambiguity_floor;
  if (!separated) {
    return { ...withScores, axis: "free", misfit: best.m, runnerUp, reason: "ambiguous",
             note: NOTE.ambiguous };
  }
  return { rep, scores: scored, axis: best.axis, misfit: best.m, runnerUp,
           reason: "ok", note: "", relative };
}
