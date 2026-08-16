/**
 * **지평선 — 순서가 뒤집혔던 것을 바로 세운다**(2026-08-16, 사람 지시).
 *
 * 이론서 3.1: 수평면에 놓인 모든 방향의 소실점은 한 직선 위에 있고 그것이 **지평선**이다.
 * 카메라 롤이 0이면 그 직선이 **화면 수평**이다(자세 R = pan·tilt·roll 3 → 2, 이론서 5.3).
 *
 * ---------------------------------------------------------------- 무엇이 바뀌었나
 *
 * L-D.0은 **검출된 두 소실점에 수평을 사후로 강제**했다(`applyRollZero`). 그것이 게이트에
 * 실패한 이유는 제약이 틀려서가 아니라 **순서가 반대**였기 때문이다 — 사영은 소실점을
 * **자기 지지선에서 떼어 놓고**, 그러면 `liftAll`의 정합성 검사가 전부 거절한다
 * (배치 2049 → 792). 위약 팔도 똑같이 무너져 **재던 것이 "롤 0"이 아니라 "해를 80px
 * 옮기는 것"이었다**(PITFALLS #39).
 *
 * 바른 순서는 이것이다:
 *
 * ```
 * ① 첫 소실점이 지평선을 **정의한다**        horizonFrom(vp) = vp.y
 * ② 두 번째는 그 위에 **놓인다**             vpOnHorizon(rep, h)   ← 선 하나면 된다
 * ③ 세 번째는 수심 조건으로 **유도된다**      vpVerticalFromOrthocenter(v1, v2, P)
 * ```
 *
 * 이 순서에는 사영이 없다. 소실점은 언제나 **자기 지지선 위에** 있고, 지평선은 그것을
 * 강제하는 것이 아니라 **첫 소실점에서 읽은 것**이다. 그래서 ②가 만드는 소실점도
 * 자기 지지선 위에 있다(그 선과 지평선의 교점이므로).
 *
 * **규칙 엔진은 `vpRules.ts`이고 이 파일은 그 기하 부품이다.** 앱이 배선한다.
 *
 * ⚠ **전제는 롤 0이다.** 종이를 기울여 그리면 깨진다. A-3에 따라 가장 단순한 쪽으로
 * 시작하고, 실사용에서 문제가 되면 `QUESTIONS.md` (d)로 되돌아본다.
 * ⚠ **폐기된 사후 사영은 `horizonRollZero.ts`에 남겼다** — `horizon.test.ts`가 D-L32의
 * 판정 근거를 재현하는 데 쓴다. **앱은 그것을 배선하지 않는다**(CLAUDE.md의 폐기 코드 규칙).
 */
import type { Pt2 } from "./camera.js";
import type { Rep } from "./axis.js";

/** 지평선 조작의 임계. **`test/constants.ts`에 등록한다**(D-C4). */
export const HORIZON_TOL = {
  /**
   * 획을 지평선으로 연장할 때 **너무 수평이면 교점이 발산한다.**
   * 획 방향과 수평선의 각이 이 값보다 작으면 두 번째 소실점을 안 낸다.
   * 값의 근거: `min_spread_mult`(1.5) × `support_deg`(2.5) = 3.75°와 같은 자리 —
   * **국소화 가능성 조건**이고 D-L7이 같은 이유로 그 배수를 골랐다.
   */
  min_slope_deg: 3.75,
  /**
   * 지평선 위 두 소실점이 **너무 가까우면** 수심 관계가 조건수를 잃는다.
   * 화면 대각 대비. 이론서 6.5의 예각 조건이 실패하는 자리와 같은 방향이다.
   */
  min_vp_sep_ratio: 0.15,
} as const;

/**
 * **① 소실점 하나가 지평선을 정의한다** — 롤 0이면 그 y가 곧 지평선이다.
 *
 * ⚠ **수평 축의 소실점이어야 한다.** 수직 축 소실점의 y는 지평선이 아니다.
 * 판별은 부르는 쪽이 한다 — `vpRules`는 **수평 슬롯에 들어간 것만** 이 함수에 넣는다.
 */
export function horizonFrom(vp: Pt2): number {
  return vp[1];
}

/** 화면에서 가장 **세로**에 가까운 대표 직선을 가진 인덱스. 없으면 −1. */
export function mostVertical(reps: Rep[]): number {
  let bi = -1, bv = -1;
  reps.forEach((r, i) => {
    const dx = Math.abs(r.b[0] - r.a[0]), dy = Math.abs(r.b[1] - r.a[1]);
    const v = dx < 1e-9 ? Infinity : dy / dx;
    if (v > bv) { bv = v; bi = i; }
  });
  return bi;
}

/**
 * **② 획 하나 + 지평선 → 두 번째 소실점.**
 *
 * 그 획의 대표 직선을 연장해 `y = h`와 만나는 점이다. **선 하나면 된다** —
 * 3획 교점 클러스터도, 산포 임계도 필요 없다. 지평선이 이미 자유도 하나를 먹었기 때문이다.
 *
 * `null`을 내는 경우: 획이 **너무 수평**이라 교점이 발산할 때(`min_slope_deg`).
 * ⚠ **그때 폴백은 없다.** 못 내면 안 낸다 — 애매하면 놓지 않는다(A-3).
 */
export function vpOnHorizon(
  rep: Rep, h: number, cfg: { min_slope_deg?: number } = {},
): Pt2 | null {
  const c = { ...HORIZON_TOL, ...cfg };
  const dx = rep.b[0] - rep.a[0], dy = rep.b[1] - rep.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  // 수평선과의 각(0~90°). 작으면 `y = h`와의 교점이 멀리 달아난다.
  const slope = (Math.asin(Math.min(1, Math.abs(dy) / len)) * 180) / Math.PI;
  if (slope < c.min_slope_deg) return null;
  const t = (h - rep.a[1]) / dy;
  const x = rep.a[0] + t * dx;
  return Number.isFinite(x) ? [x, h] : null;
}

/**
 * **③ 수심 조건으로 세 번째 소실점을 유도한다**(이론서 6.3).
 *
 * `V₁`·`V₂`가 지평선 위(같은 y = h)에 있고 주점 `P`가 수심일 때
 * `V₃ = (Pₓ, h − (Pₓ−x₁)(Pₓ−x₂)/(P_y−h))`.
 *
 * ⚠⚠ **이것은 측정이 아니라 유도다.** `V₁`·`V₂`·`P`가 주어지면 값이 일의적으로 정해지므로
 * **새 정보를 넣지 않는다** — 이 `V₃`로 f를 다시 내면 두 소실점 해(6.2)와 **항등으로 같다**
 * (이론서 6.4의 수심 항등식. PITFALLS #5 자기참조 유형 3 · #37). 그래서 부르는 쪽은
 * 이 값을 **축 방향으로만** 쓰고 f의 출처로 쓰지 않는다.
 *
 * `null`을 내는 경우:
 *   - `P_y == h` — 피치 0이라 수직축이 **화면 평행**이다(무한원. 이론서 2.2). 2점 투시다
 *   - 두 소실점이 너무 가깝다(`min_vp_sep_ratio`) — 수심 관계의 조건수가 죽는다
 *
 * ⚠ **위/아래는 이 식이 정한다**(부호가 따라온다) — 주점이 지평선 위에 있으면
 * `P_y − h < 0`이고, `(Pₓ−x₁)(Pₓ−x₂)`는 주점이 두 소실점 **사이**에 있을 때 음수다
 * (그것이 정상 구도다). 두 음수의 몫이 양수이므로 `y₃ = h − (양수) < h`가 되어
 * **수직 소실점이 지평선 위쪽**에 온다 — 올려다보는 구도. 반대면 아래다.
 */
export function vpVerticalFromOrthocenter(
  v1: Pt2, v2: Pt2, principal: Pt2, diag: number,
  cfg: { min_vp_sep_ratio?: number } = {},
): Pt2 | null {
  const c = { ...HORIZON_TOL, ...cfg };
  if (Math.abs(v1[0] - v2[0]) < c.min_vp_sep_ratio * diag) return null;
  const h = (v1[1] + v2[1]) / 2;                    // 롤 0이면 같아야 한다
  const dy = principal[1] - h;
  if (Math.abs(dy) < 1e-6) return null;             // 피치 0 — 수직축은 무한원이다
  const y3 = h - ((principal[0] - v1[0]) * (principal[0] - v2[0])) / dy;
  return Number.isFinite(y3) ? [principal[0], y3] : null;
}
