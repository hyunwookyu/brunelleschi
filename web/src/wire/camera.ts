// W-1 카메라 수학 — `stage_perspective/{viewdist,camera_unified}.py`의 TS 이식.
//
// **소실점 몇 개가 잡혔는가**가 전부를 가른다. 1/2/3점 투시는 다른 이론이 아니라
// 같은 이론에서 무한원으로 간 축이 몇 개인가의 차이다(이론서 2.3).
// 그래서 분기가 아니라 **하나의 함수**가 개수로 갈린다.
//
// 자유도 회계(5.3)
//   3점 → 자유도 0. 주점 = 소실점 삼각형의 수심(6.3), f² = |PV₁||PV₂|
//   2점 → 자유도 1. 주점 x 또는 f 중 하나를 가정해야 한다 → **주점 = 이미지 중심**(16.2, 가정 W-y)
//   1점 → 자유도 1 = f. **설정값으로 채운다**(렌즈 슬라이더). 형태를 가정해 역산하지 않는다
//   0점 → 축측(평행) 극한. 원근이 없다
//
// Python 쪽이 기준 구현이며 `tests/test_camera_unified.py`가 정답이다.
// 이식 정합은 `web/test/camera_parity.test.ts`가 같은 입력·같은 기대값으로 잠근다.
export type Pt2 = [number, number];
export type Verdict = "trust" | "warn" | "unreliable" | "invalid";

// 18.4 실무 기준. **하한만 있다.** 상한(d>3W)은 폐기된 1점 형태가정 경로를 정당화하던
// 프로젝트 자체 휴리스틱이었고(assumptions V-E, 접근 전환으로 무효) 이론서에 근거가 없다.
export const TRUST_W = 0.87;
export const WARN_W = 0.50;

const dot = (a: Pt2, b: Pt2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Pt2, b: Pt2): Pt2 => [a[0] - b[0], a[1] - b[1]];

/** 두 점을 지나는 직선 (a,b,c): ax+by+c=0. */
export function lineThrough(p: Pt2, q: Pt2): [number, number, number] {
  const a = q[1] - p[1], b = p[0] - q[0];
  return [a, b, -(a * p[0] + b * p[1])];
}

/** 두 직선(각각 두 점으로 준)의 교점 = 소실점. 평행이면 null(무한원점, c=0 축). */
export function lineIntersect(p1: Pt2, p2: Pt2, p3: Pt2, p4: Pt2): Pt2 | null {
  const [a1, b1, c1] = lineThrough(p1, p2);
  const [a2, b2, c2] = lineThrough(p3, p4);
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return null;
  return [(b1 * c2 - b2 * c1) / det, (c1 * a2 - c2 * a1) / det];
}

/** 직선군의 최소제곱 교점 — 엣지 여러 개가 같은 VP에 투표할 때(§3.1 "선 두 개 이상"). */
export function lsIntersection(lines: { p: Pt2; d: Pt2 }[]): Pt2 | null {
  let a00 = 0, a01 = 0, a11 = 0, b0 = 0, b1 = 0;
  for (const { p, d } of lines) {
    const L = Math.hypot(d[0], d[1]);
    if (L < 1e-12) continue;
    const n: Pt2 = [-d[1] / L, d[0] / L];      // 법선
    const c = dot(n, p);
    a00 += n[0] * n[0]; a01 += n[0] * n[1]; a11 += n[1] * n[1];
    b0 += n[0] * c; b1 += n[1] * c;
  }
  const det = a00 * a11 - a01 * a01;
  if (Math.abs(det) < 1e-9) return null;
  return [(a11 * b0 - a01 * b1) / det, (a00 * b1 - a01 * b0) / det];
}

export interface FResult {
  ok: boolean; f?: number; principalPoint?: Pt2; residual?: number;
  reason?: string; f2?: number;
}

/**
 * 3점 (6.3~6.5). 주점 = 소실점 삼각형의 **수심**. f² = −(V₁−P)·(V₂−P).
 * 삼각형이 둔각이면 f² < 0 — **대응하는 직육면체가 존재하지 않는다**(6.5).
 * 자유도가 0이므로 세 쌍의 f²는 같아야 하고, 그 편차가 곧 신뢰도다.
 */
export function fFromThreeVps(v1: Pt2, v2: Pt2, v3: Pt2): FResult {
  const V: Pt2[] = [v1, v2, v3];
  const n1 = sub(V[2], V[1]), n2 = sub(V[2], V[0]);
  const det = n1[0] * n2[1] - n1[1] * n2[0];
  if (Math.abs(det) < 1e-12) return { ok: false, reason: "degenerate_triangle" };
  const r0 = dot(n1, V[0]), r1 = dot(n2, V[1]);
  const P: Pt2 = [(r0 * n2[1] - r1 * n1[1]) / det, (n1[0] * r1 - n2[0] * r0) / det];
  const pairs: [number, number][] = [[0, 1], [1, 2], [0, 2]];
  const f2s = pairs.map(([i, j]) => -dot(sub(V[i], P), sub(V[j], P)));
  const f2 = f2s.reduce((a, b) => a + b, 0) / 3;
  const mean = f2;
  const sd = Math.sqrt(f2s.reduce((a, x) => a + (x - mean) ** 2, 0) / 3);
  const residual = sd / (Math.abs(f2) + 1e-12);
  if (f2 <= 0) {
    return { ok: false, reason: "obtuse_triangle_f2_negative", f2, principalPoint: P, residual };
  }
  return { ok: true, f: Math.sqrt(f2), principalPoint: P, residual };
}

/**
 * 2점 (6.2). f² = |PV₁|·|PV₂| — 주점에서 두 소실점까지 거리의 곱.
 * 주점은 **이미지 중심으로 가정**한다(16.2). 자유도 1을 그렇게 소진한다.
 * V₁·V₂가 주점 기준 반대쪽이어야 성립한다 — 같은 쪽이면 직교 방향쌍이 아니다.
 */
export function fFromTwoVps(v1: Pt2, v2: Pt2, imgSize: [number, number],
                            principal?: Pt2): FResult {
  const P: Pt2 = principal ?? [imgSize[0] / 2, imgSize[1] / 2];
  const f2 = -dot(sub(v1, P), sub(v2, P));
  if (f2 <= 0) return { ok: false, reason: "vps_same_side_f2_negative", f2, principalPoint: P };
  return { ok: true, f: Math.sqrt(f2), principalPoint: P, residual: 0 };
}

export interface Gate { verdict: Verdict; ratio: number | null; fovDeg: number | null; reason?: string; }

/** 화각 판정 (18.4). f/W 비율로 수평 화각을 읽는다. **하한만** 본다. */
export function gate(f: number | null | undefined, imgWidth: number, ok = true): Gate {
  if (!ok || f == null || !Number.isFinite(f) || f <= 0) {
    return { verdict: "invalid", ratio: null, fovDeg: null, reason: "f 없음/비유한/비양수" };
  }
  const r = f / imgWidth;
  const fov = 2 * (Math.atan(0.5 / r) * 180 / Math.PI);
  const verdict: Verdict = r >= TRUST_W ? "trust" : r >= WARN_W ? "warn" : "unreliable";
  return { verdict, ratio: +r.toFixed(4), fovDeg: +fov.toFixed(2) };
}

/**
 * 실척으로 **직접** 읽히는 축 (7.7). 화면에 평행한 방향은 축소되지 않으므로
 * f를 몰라도 비례가 살아 있다. 소실점이 적을수록 그런 축이 많다.
 *
 * ⚠ 이것은 "그 축의 **비례**가 왜곡 없이 읽힌다"는 뜻이지 "세계 길이를 안다"는 뜻이 아니다.
 * 이론서 5.5: 소실점 셋을 다 찍어도 모서리 간 길이비는 결정되지 않는다 — 계량은 7장 측점법이 들여온다.
 */
const DIRECT_SCALE_AXES: Record<number, string[]> = {
  3: [], 2: ["height"], 1: ["width", "height"], 0: ["width", "height", "depth"],
};
export function directScaleAxes(nFiniteVps: number): string[] {
  return DIRECT_SCALE_AXES[Math.min(3, Math.max(0, nFiniteVps))] ?? [];
}

/** 소실점이 화면 밖 아주 멀리 있으면 사실상 무한원(화면 평행, c=0)으로 본다. */
export const VP_INFINITE_RATIO = 50.0;
export function isFiniteVp(vp: Pt2 | null | undefined, imgSize: [number, number]): boolean {
  if (!vp || !Number.isFinite(vp[0]) || !Number.isFinite(vp[1])) return false;
  const [W, H] = imgSize;
  const diag = Math.hypot(W, H);
  return Math.hypot(vp[0] - W / 2, vp[1] - H / 2) < VP_INFINITE_RATIO * diag;
}

export type CameraCase = "3pt" | "2pt" | "1pt" | "axonometric";
export interface CameraSolution {
  case: CameraCase;
  nVps: number;
  ok: boolean;
  f: number | null;
  fSource?: "orthocenter(6.3)" | "two_vps(6.2)" | "setting(렌즈)";
  principalPoint: Pt2 | null;
  residual: number | null;
  verdict: Verdict | "unresolved_f" | "no_perspective";
  ratio: number | null;
  fovDeg: number | null;
  unresolved: string[];
  directScaleAxes: string[];
  assumption?: string;
  dofNote?: string;
  reason?: string;
}

/** 소실점 개수로 갈리는 단일 경로. `fSetting`은 1점에서 f를 채우는 **설정값**(측정 아님). */
export function recoverCamera(
  vps: (Pt2 | null)[], imgSize: [number, number],
  opts: { principal?: Pt2; fSetting?: number } = {},
): CameraSolution {
  const [W] = imgSize;
  const finite = vps.filter((v): v is Pt2 => isFiniteVp(v, imgSize));
  const n = finite.length;
  const base = {
    nVps: n, unresolved: [] as string[], directScaleAxes: directScaleAxes(n),
  };

  if (n >= 3) {
    const r = fFromThreeVps(finite[0], finite[1], finite[2]);
    if (!r.ok) {
      return {
        ...base, case: "3pt", ok: false, f: null,
        principalPoint: r.principalPoint ?? null, residual: r.residual ?? null,
        reason: r.reason, ...gate(null, W, false),
        unresolved: ["카메라 무효: 소실점 삼각형이 둔각 → f²<0. 대응하는 직육면체가 존재하지 않는다(6.5)"],
      };
    }
    return {
      ...base, case: "3pt", ok: true, f: r.f!, fSource: "orthocenter(6.3)",
      principalPoint: r.principalPoint!, residual: r.residual!, ...gate(r.f, W),
      dofNote: "자유도 없음 — 세 조합 f² 편차(residual)가 곧 신뢰도",
    };
  }

  if (n === 2) {
    const r = fFromTwoVps(finite[0], finite[1], imgSize, opts.principal);
    const assumption = "주점 = 이미지 중심(이론서 16.2, 가정 W-y) — 미검증";
    if (!r.ok) {
      return {
        ...base, case: "2pt", ok: false, f: null,
        principalPoint: r.principalPoint ?? null, residual: 0, assumption,
        reason: r.reason, ...gate(null, W, false),
        unresolved: ["카메라 무효: 두 소실점이 주점 같은 쪽 → f²<0(직교 방향쌍이 아니다)"],
      };
    }
    return {
      ...base, case: "2pt", ok: true, f: r.f!, fSource: "two_vps(6.2)",
      principalPoint: r.principalPoint!, residual: 0, assumption, ...gate(r.f, W),
      dofNote: "자유도 1을 주점 가정으로 소진 — 가정이 틀리면 f가 틀린다",
    };
  }

  if (n === 1) {
    const P = finite[0];                    // 소실점 = 주점 (5.3)
    if (opts.fSetting != null && opts.fSetting > 0) {
      return {
        ...base, case: "1pt", ok: true, f: opts.fSetting, fSource: "setting(렌즈)",
        principalPoint: P, residual: 0, ...gate(opts.fSetting, W),
        dofNote: "자유도 1(f)을 설정으로 소진 — 측정이 아니라 사용자 선택이다(provenance: setting)",
      };
    }
    return {
      ...base, case: "1pt", ok: false, f: null, principalPoint: P, residual: 0,
      verdict: "unresolved_f", ratio: null, fovDeg: null,
      unresolved: ["1점 투시: f 미설정 → 안쪽 깊이 미결정. 렌즈 값을 정하면 채워진다(§3.2). "
        + "폭·높이는 그 전에도 실척 비례로 읽힌다(7.7)"],
      dofNote: "자유도 1(f) 잔존 — 깊이만 미결정",
    };
  }

  return {
    ...base, case: "axonometric", ok: false, f: null, principalPoint: null, residual: null,
    verdict: "no_perspective", ratio: null, fovDeg: null,
    unresolved: ["소실점 0개 — 축측 극한(모든 축이 화면 평행). 원근이 없어 깊이가 결정되지 않는다"],
    dofNote: "평행투영 극한 — f→∞",
  };
}

// ---------------------------------------------------------------- 게이지 (§3.2 부분 확정)

/**
 * **f가 정해지기 전에 그린 것이 그대로 남는가?** — 계획서 §3.2가 "부분 확정 상태에서도
 * 그릴 수 있다"고 주장하는 근거. 답은 **좌표 게이지를 어떻게 잡느냐에 달렸다.**
 *
 * 핀홀에서 깊이 z의 화면 평행면 위 점은 `u − p = f·(X/z, Y/z)`로 찍힌다.
 * 여기서 **씨앗 평면의 깊이를 z₀ = f 로 잡으면**(그것이 이 게이지다) `X = u − p`가 되어
 * **f가 식에서 사라진다**. 즉 화면 평행면의 기하는 f와 무관하게 확정된다.
 *
 * 깊이는 그렇지 않다. 같은 게이지에서 깊이 방향으로 물러난 점은 `z = f·X / (u′ − p)`이므로
 * **깊이가 f에 비례**한다. 그래서 렌즈를 정하면 **이미 놓인 폭·높이는 움직이지 않고
 * 안쪽 깊이만 채워진다.**
 *
 * ⚠ 이론서 5.5와 충돌하지 않는다. 5.5는 "소실점만으로는 길이비가 결정되지 않는다"는 말이고
 * 여기서는 **f를 아는 카메라**를 쓴다. f가 두세 소실점에서 나왔으면 그 깊이비는 measured이고,
 * 렌즈 슬라이더에서 나왔으면 **setting**이다 — 같은 수를 두 provenance로 구분해 표시한다.
 * 7장의 측점법은 이 계산을 손으로 하는 절차이지 다른 정보원이 아니다.
 */
export function frontalWorld(imagePt: Pt2, principal: Pt2): Pt2 {
  return [imagePt[0] - principal[0], imagePt[1] - principal[1]];
}

/** 같은 게이지에서 깊이 방향 좌표. 축소비 `s = |u′−p| / |u−p|` (0<s<1)만큼 물러난 점의 깊이. */
export function depthFromForeshortening(f: number, s: number): number {
  if (!(s > 0) || !Number.isFinite(s)) return Infinity;
  return f / s;
}
