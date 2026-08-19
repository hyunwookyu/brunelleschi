// **어느 시점에서든 축 셋의 소실점**(2026-08-19 15차 항목 8 · D-L101).
//
// 사용자 지시 8: *"어느 시점에서든 축 셋의 소실점을 계산해 표시한다. 카메라가 있으면 각
// 축 방향을 투영하면 나온다. 수평 소실점 둘을 잇는 선이 지평선이다. 배면을 보든 위를 보든
// 그 선은 계산된다."*
//
// 옛 판이 못 한 것 둘:
//   ① **지평선을 화면 가로선으로 그렸다** — `viewOverlayCtx`가 `vps[0][1]`(첫 수평 소실점의
//      y)만 쓰고 가로선을 깔았다. 확정 시점은 롤 0이라 두 수평 소실점의 y가 같지만
//      **돌린 시점에서는 다르다** — 그때 그 가로선은 지평선이 아니다.
//   ② **무한원 축에는 아무 표시가 없었다** — 소실점이 없으므로 표식 루프가 건너뛴다.
//      그런데 방향은 있다(이론서 2.2, c=0) — 지시 8-e가 그 자리다.
//
// ---------------------------------------------------------------- 소실점은 방향의 상이다
//
// 축 방향 `d`(시점 좌표)의 소실점은 그 방향 무한원점의 상이다:
// ```
// at = principal + f · (dx, dy) / dz        (dz ≠ 0)
// ```
// `d`와 `−d`가 **같은 점**을 낸다(분자·분모가 함께 뒤집힌다) — 축은 부호가 없다.
// `dz → 0`이면 그 축은 **화면과 나란하고** 소실점이 무한원이다. 그때 남는 것은 **화면
// 방향** `(dx, dy)`이고 그것이 표시의 재료다.
//
// ⚠ **새 임계를 만들지 않는다**(#17): "무한원인가"는 `camera.isFiniteVp`가 이미 정한
// 규약(`VP_INFINITE_RATIO` × 화면 대각)을 그대로 쓴다.
import { isFiniteVp, type Pt2 } from "./camera.js";
import { norm3, type Vec3 } from "./geom3d.js";

/** 축 하나의 시점별 소실점. `at`이 `null`이면 무한원 — 그때 `screenDir`이 표시의 재료다. */
export interface AxisVpAt {
  axis: 0 | 1 | 2;
  /** 유한 소실점의 화면 좌표. 무한원이면 `null`. */
  at: Pt2 | null;
  /** 화면에서의 그 축 방향(단위). 유한·무한 모두 있다 — 표식의 방향이다. */
  screenDir: Pt2;
  /** 주점에서의 거리(px). 무한원이면 `null`. */
  distFromPrincipal: number | null;
}

/**
 * **축 방향(시점 좌표) → 그 시점의 소실점**. 방향이 없으면 `null`이다.
 *
 * `screenDir`는 무한원일 때도 정의된다 — `dz = 0`인 방향의 상은 `(dx, dy)`와 나란하다.
 * `dz ≠ 0`이면 주점에서 소실점으로 가는 방향이 같은 값이라 **한 식으로 낸다**.
 */
export function axisVpAt(
  d: Vec3 | null, principal: Pt2, f: number, imgSize: [number, number],
): AxisVpAt | null {
  if (!d || norm3(d) < 1e-12) return null;
  const L = Math.hypot(d[0], d[1]);
  // 화면 방향 — `dz`의 부호로 뒤집히지 않게 **소실점 쪽**으로 맞춘다(축은 부호가 없다)
  const sgn = d[2] >= 0 ? 1 : -1;
  const screenDir: Pt2 = L < 1e-12 ? [1, 0] : [(sgn * d[0]) / L, (sgn * d[1]) / L];
  const inf = { axis: 0 as 0 | 1 | 2, at: null, screenDir, distFromPrincipal: null };
  if (Math.abs(d[2]) < 1e-12) return inf;
  const at: Pt2 = [principal[0] + (f * d[0]) / d[2], principal[1] + (f * d[1]) / d[2]];
  if (!isFiniteVp(at, imgSize)) return inf;
  return { axis: 0, at, screenDir,
           distFromPrincipal: Math.hypot(at[0] - principal[0], at[1] - principal[1]) };
}

/** 축 셋 — 인덱스가 축 번호다. 방향이 없는 축은 `null`. */
export function axisVpsAt(
  dirs: (Vec3 | null)[], principal: Pt2, f: number, imgSize: [number, number],
): (AxisVpAt | null)[] {
  return [0, 1, 2].map(i => {
    const r = axisVpAt(dirs[i] ?? null, principal, f, imgSize);
    return r ? { ...r, axis: i as 0 | 1 | 2 } : null;
  });
}

/**
 * **지평선 = 수평 축 둘의 소실점을 잇는 선**(지시 8-b).
 *
 * ```
 * 둘 다 유한   두 점을 잇는다 — 롤이 있으면 화면에서 기운다(그것이 옳다)
 * 하나만 유한  그 점을 지나 **무한원 축의 화면 방향**으로 — 무한원점도 그 선 위에 있다
 * 둘 다 무한원 두 방향이 같은 선을 정하지 못한다 → `null`(그릴 것이 없다)
 * ```
 * 되돌리는 것은 **화면 상자를 넉넉히 넘는 선분**이다 — 호출부가 그대로 긋는다.
 */
export function horizonThrough(
  h0: AxisVpAt | null, h1: AxisVpAt | null, imgSize: [number, number],
): { a: Pt2; b: Pt2 } | null {
  const [W, H] = imgSize;
  let p: Pt2 | null = null, u: Pt2 | null = null;
  if (h0?.at && h1?.at) {
    p = h0.at;
    const dx = h1.at[0] - h0.at[0], dy = h1.at[1] - h0.at[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) return null;                       // 두 소실점이 겹쳤다 — 선이 안 정해진다
    u = [dx / L, dy / L];
  } else if (h0?.at && h1) { p = h0.at; u = h1.screenDir; }
  else if (h1?.at && h0) { p = h1.at; u = h0.screenDir; }
  if (!p || !u) return null;
  const R = 4 * Math.hypot(W, H);
  return { a: [p[0] - u[0] * R, p[1] - u[1] * R], b: [p[0] + u[0] * R, p[1] + u[1] * R] };
}

/**
 * **표식 목록**(지시 8-c·8-e) — 그리는 쪽과 재는 쪽이 같은 함수를 부른다(#17).
 *
 * ```
 * point     화면 안 유한 소실점 — 그 자리에 점
 * edge      화면 밖 유한 소실점 — 가장자리 화살표(축소 뷰 대신, A-3: 좌표계를 안 늘린다)
 * infinite  무한원 축 — 소실점이 없으므로 **방향**으로 표시한다(이론서 2.2, c=0)
 * ```
 */
export interface AxisMark {
  axis: 0 | 1 | 2;
  kind: "point" | "edge" | "infinite";
  /** `point`면 소실점, `edge`면 가장자리에서 그 방향, `infinite`면 화면 중앙 기준 방향점. */
  at: Pt2;
  /** `edge`·`infinite`의 방향(단위). `point`면 `[0, 0]`. */
  dir: Pt2;
}

export function overlayAxisMarks(
  av: (AxisVpAt | null)[], imgSize: [number, number],
): AxisMark[] {
  const [W, H] = imgSize;
  const cx = W / 2, cy = H / 2;
  const out: AxisMark[] = [];
  av.forEach((a, i) => {
    if (!a) return;
    const axis = i as 0 | 1 | 2;
    if (!a.at) {
      const R = Math.min(W, H) * 0.42;
      out.push({ axis, kind: "infinite",
                 at: [cx + a.screenDir[0] * R, cy + a.screenDir[1] * R],
                 dir: [a.screenDir[0], a.screenDir[1]] });
      return;
    }
    const inside = a.at[0] >= 0 && a.at[0] <= W && a.at[1] >= 0 && a.at[1] <= H;
    if (inside) { out.push({ axis, kind: "point", at: [a.at[0], a.at[1]], dir: [0, 0] }); return; }
    const dx = a.at[0] - cx, dy = a.at[1] - cy;
    const L = Math.hypot(dx, dy) || 1;
    const R = Math.min(W, H) * 0.42;
    out.push({ axis, kind: "edge",
               at: [cx + (dx / L) * R, cy + (dy / L) * R], dir: [dx / L, dy / L] });
  });
  return out;
}
