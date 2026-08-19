// **보조 소실점**(2026-08-19 15차 항목 7 · D-L106). 이론서 6.2·7.3·7.5·15.1·15.2.
//
// 사용자 지시 7(압축 기록): *"보조 소실점 — 미구현. 지평선 위 틱 · 탈레스 반원 ·
// 각도 입력 · 화면 밖 처리 · 스냅 후보 · 경사 소실점 · 위계."*
//
// ---------------------------------------------------------------- 무엇이 보조 소실점인가
//
// 축 셋의 소실점은 **카메라가 정한다**(D-L101). 보조 소실점은 그 카메라 아래에서
// **사용자가 고른 다른 방향**의 소실점이다 — 45° 벽, 30° 지붕, 계단의 경사.
// 종이 위 투시에서 늘 쓰는 것이고(이론서 7장·15장), 이 도구에는 없었다.
//
// **상태를 늘리지 않는다.** 보조 소실점의 자리는 **각도와 카메라가 함께 정한다** —
// 그러므로 저장하는 것은 **각도**이고 자리는 매번 계산이다(CLAUDE.md §1의 규약: 차수가
// 계산인 것과 같은 자리). 카메라가 바뀌면 보조 소실점도 따라 움직인다 — 따로 안 고친다.
//
// ```
// 수평 보조:  부모 축 e_of 에서 수평면 안으로 yaw 만큼 돌린 방향
// 경사 보조:  그 수평 방향에 tan(pitch) 만큼 수직 성분을 더한 것 (이론서 15.1)
// 소실점:     axisVpAt(그 방향)  ← **같은 함수**를 쓴다(#17 — 새 투영을 안 만든다)
// ```
//
// **이론서 15.1이 경사 보조의 성질을 준다**: *"경사 소실점은 대응하는 수평 소실점의
// 바로 위 또는 아래에 있다"*(오르막이면 위). 그 성질을 반례 테스트가 확인한다 —
// 계산이 그 정리를 만족하는지가 이 모듈이 옳다는 증거다.
//
// ---------------------------------------------------------------- 탈레스와 측점
//
// 이론서 6.2: 수평 소실점 둘 V₁·V₂와 주점 P에 대해 **f² = |PV₁|·|PV₂|**이고,
// 작도는 *"V₁V₂를 지름으로 하는 반원을 그리고 P에서 수직선을 올려 반원과 만나는 점 E"*다.
// |PE| = f이고 E는 **화면을 지평선 축으로 회전시켰을 때의 시점**(rabatment)이다.
//
// 이론서 7.3: 방향 v의 소실점 V에 대한 **측점** M은 **|VM| = |VE|**이고 지평선 위에 있다.
// 측점은 *"이등변삼각형을 만드는 보조 소실점"*이다 — 길이를 재는 데 쓴다(7.5의 절차).
//
// ⚠ **P가 V₁V₂ 사이에 없으면 E가 없다**(이론서 6.5의 예각 조건 — f² < 0). 그때는 `null`을
// 낸다. 조용히 근사값을 만들지 않는다(A-3).
//
// ⚠⚠ **측점이 어느 쪽인가는 교본마다 다르다**(이론서 7.5의 주석 그대로) — 여기서는
// **주점 쪽**으로 잡는다. 두 답을 다 낼 수도 있으나 화면에 둘을 그리면 사용자가 고를
// 근거가 없다(A-3: 가장 단순한 것). 반대쪽이 필요하면 `both`가 든다.
import { axisVpAt, type AxisVpAt } from "./axisVp.js";
import type { Pt2 } from "./camera.js";
import { add3, mul3, norm3, type Vec3 } from "./geom3d.js";

/**
 * **보조 방향 하나** — 저장되는 것은 이것뿐이고 소실점 자리는 계산이다.
 *
 * `of`는 각도의 기준 축이다. 수평 보조는 수평축(0·1) 기준이어야 뜻이 선다 —
 * 수직축 기준의 "수평면 안 회전"은 정의가 안 된다.
 */
export interface AuxDir {
  id: string;
  /** 기준 축(0|1). 각도 0이면 그 축 자신이다. */
  of: 0 | 1;
  /** 수평면 안에서 기준 축에서 돌린 각(도). 양수는 다른 수평축 쪽이다. */
  yawDeg: number;
  /** 경사각(도, 이론서 15.1). 0이면 수평 보조이고 양수는 오르막이다. */
  pitchDeg: number;
  /** 사용자 라벨(선택) — "지붕 30°"처럼. */
  label?: string;
}

const RAD = Math.PI / 180;

/**
 * **보조 방향의 3D 벡터**(시점 좌표). 축 방향이 없으면 `null`이다.
 *
 * 수평면은 축 0·1이 편다(축 2가 수직이다 — `screenVerticalSlot`의 규약). 기준 축에서
 * 다른 수평축 쪽으로 `yaw`만큼 돈 뒤, 이론서 15.1대로 수직 성분 `tan(pitch)`를 더한다.
 */
export function auxDirVec(d: AuxDir, axisDirs: (Vec3 | null)[]): Vec3 | null {
  const e0 = axisDirs[d.of], e1 = axisDirs[d.of === 0 ? 1 : 0], vert = axisDirs[2];
  if (!e0 || !e1) return null;
  const c = Math.cos(d.yawDeg * RAD), s = Math.sin(d.yawDeg * RAD);
  const horiz = add3(mul3(e0, c), mul3(e1, s));
  const hn = norm3(horiz);
  if (hn < 1e-12) return null;
  const h: Vec3 = mul3(horiz, 1 / hn);
  if (Math.abs(d.pitchDeg) < 1e-12 || !vert) return h;
  // **이론서 15.1**: 수평 (a,0,c) → (a,b,c), b/|수평| = tan θ.
  //
  // ⚠ **«위»의 정의는 화면이다**(#49 — 판정이 쓰는 단위). 축 방향에는 부호가 없으므로
  // (`axisVpAt` 머리말: `d`와 `−d`가 같은 소실점을 낸다) `axisDirs[2]`의 부호는 규약이
  // 아니고, 그것을 그대로 더하면 구도에 따라 오르막이 아래로 간다. 사용자가 «오르막»으로
  // 뜻하는 것은 **소실점이 지평선 위로 간다**는 것이므로 그 조건으로 부호를 정한다.
  //
  // 소실점 y는 `P_y + f·(h_y + t·u_y)/(h_z + t·u_z)`이고 t = 0에서의 도함수는
  // `f·(u_y·h_z − h_y·u_z)/h_z²`다 — 분모가 양수이므로 **부호는 `u_y·h_z − h_y·u_z`**가 정한다.
  // 화면 y는 아래가 양이므로 오르막(양의 pitch)은 그 값이 **음수**여야 한다.
  const cy = vert[1] * h[2] - h[1] * vert[2];
  const up: Vec3 = cy > 0 ? mul3(vert, -1) : vert;
  return add3(h, mul3(up, Math.tan(d.pitchDeg * RAD)));
}

/** 보조 소실점 하나 — `axisVpAt`을 그대로 쓴다(#17). `axis`는 뜻이 없어 버린다. */
export interface AuxVpAt {
  id: string;
  /** 유한 소실점의 화면 좌표. 무한원이면 `null`(그때 `screenDir`이 표시의 재료다). */
  at: Pt2 | null;
  screenDir: Pt2;
  distFromPrincipal: number | null;
  yawDeg: number;
  pitchDeg: number;
  label?: string;
}

export function auxVpAt(
  d: AuxDir, axisDirs: (Vec3 | null)[], principal: Pt2, f: number,
  imgSize: [number, number],
): AuxVpAt | null {
  const v = auxDirVec(d, axisDirs);
  const r: AxisVpAt | null = axisVpAt(v, principal, f, imgSize);
  if (!r) return null;
  return { id: d.id, at: r.at, screenDir: r.screenDir,
           distFromPrincipal: r.distFromPrincipal,
           yawDeg: d.yawDeg, pitchDeg: d.pitchDeg, label: d.label };
}

export const auxVpsAt = (
  ds: AuxDir[], axisDirs: (Vec3 | null)[], principal: Pt2, f: number,
  imgSize: [number, number],
): (AuxVpAt | null)[] => ds.map(d => auxVpAt(d, axisDirs, principal, f, imgSize));

/**
 * **탈레스 작도**(이론서 6.2) — 수평 소실점 둘과 주점에서 시점 `E`를 낸다.
 *
 * `P`가 `V₁V₂` 사이에 없으면(예각 조건이 깨지면) `null`이다 — 근사를 안 만든다.
 * 반환하는 `f`는 `|PE|`이고, 이것이 **카메라가 든 f와 같은 값인지는 여기서 안 본다**
 * (그 대조는 원장의 일이다 — #5: 같은 값이 나오는 것은 보장이지 측정이 아니다).
 */
export interface Thales {
  center: Pt2;
  r: number;
  /** 그 변 위의 수선 발 — 주점에서 `V₁V₂`에 내린 발이다(3점에서는 수심의 성질로 `V₃`의 발과 같다). */
  foot: Pt2;
  /** 시점의 회전 위치(rabatment). 반원 위, 발에서 올린 수직선과의 교점. */
  E: Pt2;
  /** `|foot−E|` — 회전한 시점이 그 변까지 가는 거리. 2점에서는 이것이 곧 f다. */
  edgeDist: number;
  /** 주점이 그 변에서 떨어진 거리. 2점(주점이 지평선 위)에서는 0이다. */
  principalOffset: number;
  /** 초점거리. `f² = edgeDist² − principalOffset²`(아래 머리말). */
  f: number;
}

export function thales(v1: Pt2, v2: Pt2, principal: Pt2): Thales | null {
  const center: Pt2 = [(v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2];
  const r = Math.hypot(v2[0] - v1[0], v2[1] - v1[1]) / 2;
  if (r < 1e-9) return null;
  // 변의 방향과 그 법선 — 롤이 있어도 선다(D-L101의 지평선이 선분인 것과 같은 자리)
  const ux = (v2[0] - v1[0]) / (2 * r), uy = (v2[1] - v1[1]) / (2 * r);
  // 주점을 그 변 위로 내린 발까지의 **부호 있는 거리**(중심 기준)
  const t = (principal[0] - center[0]) * ux + (principal[1] - center[1]) * uy;
  const h2 = r * r - t * t;
  if (h2 <= 0) return null;                 // 예각 조건이 깨졌다(이론서 6.5 — f² < 0)
  const h = Math.sqrt(h2);
  const nx = -uy, ny = ux;
  const foot: Pt2 = [center[0] + t * ux, center[1] + t * uy];
  const sgn = ((principal[0] - foot[0]) * nx + (principal[1] - foot[1]) * ny) >= 0 ? 1 : -1;
  const E: Pt2 = [foot[0] + sgn * h * nx, foot[1] + sgn * h * ny];
  const off = Math.hypot(principal[0] - foot[0], principal[1] - foot[1]);
  // ⚠⚠ **`|PE| = f`는 2점 전용이다**(이론서 6.2의 전제: 주점이 지평선 **위에** 있다).
  //
  // 3점에서는 주점이 수심이라 어느 변 위에도 없다 — 그때 반원이 주는 것은 **그 변까지의
  // 회전 거리**(`edgeDist` = |foot−E|)이고, 눈은 그 변에서 `edgeDist`, 화면에서 `f` 떨어져
  // 있으며 발–주점–눈이 직각삼각형을 이룬다(이론서 6.3의 수심 정리와 7.6의 «변마다 E가
  // 다르다»가 같은 말이다). 그러므로
  //     f² = edgeDist² − principalOffset²
  // 이고, 2점에서는 `principalOffset = 0`이라 `f = |PE|`로 되돌아간다.
  const f2 = h * h - off * off;
  if (f2 <= 0) return null;                 // 그 변으로는 f가 안 선다 — 근사를 안 만든다
  return { center, r, foot, E, edgeDist: h, principalOffset: off, f: Math.sqrt(f2) };
}

/**
 * **측점**(이론서 7.3) — 소실점 `V`에서 지평선을 따라 `|VE|`만큼 간 점.
 *
 * 두 해 중 **주점 쪽**을 낸다(이론서 7.5: 교본마다 다르다 — A-3으로 하나를 고른다).
 * 반대쪽도 `both`로 함께 낸다: 고르는 규약이 바뀔 때 다시 계산하지 않는다.
 */
export function measuringPoint(
  v: Pt2, E: Pt2, v1: Pt2, v2: Pt2, principal: Pt2,
): { at: Pt2; both: [Pt2, Pt2] } | null {
  const L = Math.hypot(v2[0] - v1[0], v2[1] - v1[1]);
  if (L < 1e-9) return null;
  const ux = (v2[0] - v1[0]) / L, uy = (v2[1] - v1[1]) / L;
  const d = Math.hypot(E[0] - v[0], E[1] - v[1]);
  const p: Pt2 = [v[0] + d * ux, v[1] + d * uy];
  const q: Pt2 = [v[0] - d * ux, v[1] - d * uy];
  const near = (z: Pt2) => Math.hypot(z[0] - principal[0], z[1] - principal[1]);
  return { at: near(p) <= near(q) ? p : q, both: [p, q] };
}

/**
 * **보조 소실점 방향 스냅**(위계 — 지시 7). `vpDirSnap`과 **같은 판정·같은 임계**를 쓰되
 * **축을 안 낸다**.
 *
 * ⚠⚠ **이것이 위계의 전부다**: 보조 소실점은 방향만 준다 — 축을 배정하지 않고, 카메라에
 * 기여하지 않고, 차수를 안 바꾼다. 그러므로 부르는 쪽이 **주 소실점 스냅이 진 뒤에만**
 * 이것을 본다. 그렇게 두는 이유는 A-3의 "조용히 틀린 배치를 만들지 않는다"다 —
 * 보조는 사용자가 만든 것이라 **틀릴 수 있고**, 틀린 보조가 축을 배정하면 그 획은
 * 조용히 잘못 놓인다.
 */
export interface AuxDirSnap {
  id: string;
  at: Pt2;
  vp: Pt2;
  misfit: number;
  yawDeg: number;
  pitchDeg: number;
}

export function auxDirSnap(
  a: Pt2, b: Pt2, aux: (AuxVpAt | null)[], tol: number,
): AuxDirSnap | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) return null;
  let best: AuxDirSnap | null = null;
  let bestMove = Infinity;
  for (const v of aux) {
    if (!v || !v.at) continue;
    const dx = v.at[0] - a[0], dy = v.at[1] - a[1];
    const D = Math.hypot(dx, dy);
    if (D < 1e-6) continue;                        // 시작점이 소실점 위다 — 방향이 없다
    // **`vpMisfit`과 같은 양**: 끝점의 a→V 직선까지의 수직거리 ÷ 획 길이(#17·#49)
    const cross = Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / D;
    const m = cross / len;
    if (m > tol) continue;
    const t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (D * D);
    const at: Pt2 = [a[0] + t * dx, a[1] + t * dy];
    const move = Math.hypot(at[0] - b[0], at[1] - b[1]);
    if (move < bestMove) {
      bestMove = move;
      best = { id: v.id, at, vp: v.at, misfit: m, yawDeg: v.yawDeg, pitchDeg: v.pitchDeg };
    }
  }
  return best;
}
