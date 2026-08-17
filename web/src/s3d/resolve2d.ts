// **카메라 확정 전의 2D 판정 전부 — 순수 함수**(2026-08-17 5차 이월-2).
//
// 원래 `mainL.ts` 안의 지역 함수였다(4차 지시 1·2·5 통합). 그런데 합성 하네스
// (`rule_camera.test.ts` 등)가 **스냅 전 원시 선**을 `stepRule`에 먹여 앱 동작점 밖 값을
// 내고 있었다(DEFERRED "스냅 반영 하네스" — #17의 측정-앱 갈림). 하네스가 앱과 **같은
// 함수**를 부를 수 있도록 앱 상태 의존(OSNAP·REL_SNAP·cam·pend2Segs)을 인자로 빼서
// 여기로 옮겼다. **로직은 옮기기 전과 같다** — `mainL.resolve2d`는 이제 이 함수의 얇은
// 포장이다(#17: 단일 출처).
//
// 우선순위는 **오스냅 > 방향(화면 직교·소실점) > 관계 스냅(정렬)**이다(4차 지시 5-d —
// 오스냅이 이긴다). 관계 스냅은 방향 스냅과 **성분으로 결합**한다: 직교 세로선이면 y만,
// 가로선이면 x만, 소실점 방향이면 그 직선 위에서 미끄러져 교점으로 — 방향을 깨지 않고
// 정렬한다.
//
// ⚠ **꺾인 획은 끝점 스냅으로 펴지 않는다**(#34 — `placeLive`의 양 끝 스냅 규약 그대로):
// 끝을 옮기면 두 점이 직선을 정하므로, 굽음이 `AXIS_TOL.bend_max`를 넘으면 끝 스냅을
// 버린다. 시작점 스냅은 그대로 둔다.
import { snap2dAt, alignAxes, type Snap2Cand, type AlignHit } from "./snap2d.js";
import { screenOrthoSnap, vpDirSnap, type ScreenOrtho, type VpDirSnap } from "./axisSnap.js";
import { representative, AXIS_TOL } from "./axis.js";
import type { Pt2 } from "./camera.js";
import type { SnapKind } from "./snap.js";

/**
 * **오스냅 조리개 기본값(px)** — D-L56(15px). 앱(`mainL.OSNAP.radiusPx`)의 초기값이고
 * 하네스가 같은 값을 쓴다(#17: 한 출처).
 *
 * ⚠ **`SHARED_CONSTANTS`(전역 해시)에 안 넣는다** — D-L51·P1_F_RATIO와 같은 자리의 결정:
 * 전역 해시가 하나뿐이라 넣으면 이 값에 의존하지 않는 원장 40여 개가 STALE이 된다.
 * 대신 이 값을 쓰는 원장이 `how`에 값을 그대로 적는다(STALE 사각지대임을 병기).
 */
export const OSNAP_RADIUS_PX = 15;

/** 앱 상태를 인자로 뺀 것 — `mainL`이 채우고, 하네스는 합성 상태로 채운다. */
export interface Resolve2dCtx {
  /** 대기 획의 2D 후보(`static2dCandidates`의 결과). 부르는 쪽이 만든다. */
  cands: Snap2Cand[];
  /** 유한 소실점(슬롯 순서) — `vpDirSnap`이 본다. 카메라가 안 서도 소실점만 있으면 돈다. */
  vps: (Pt2 | null)[];
  /** 오스냅 조리개(px) — 앱은 `OSNAP.radiusPx`, 기본 `OSNAP_RADIUS_PX`. */
  radiusPx: number;
  /** 종류 토글(`OSNAP.kinds`). 없으면 전부 허용. */
  kinds?: Partial<Record<SnapKind, boolean>>;
  /** 관계 스냅(정렬) 켬 여부(`REL_SNAP.on`). */
  relSnap: boolean;
}

/** `resolve2dCore`의 결과 — 미리보기와 확정이 **같은 값**을 본다(#17·§11). */
export interface Resolve2dOut {
  a: Pt2; b: Pt2;
  ortho: ScreenOrtho | null; vpdir: VpDirSnap | null;
  start2: Snap2Cand | null; end2: Snap2Cand | null;
  /** 관계 스냅 가이드(4차 지시 5-c). */
  guides: { from: Pt2; to: Pt2 }[];
  /** 확정 시 문서에 남길 점열. */
  pts: Pt2[];
  /** 무엇이든 걸렸는가 — 미리보기 표시 여부. */
  engaged: boolean;
}

/**
 * **끝점의 방향 스냅**(4차 지시 2) — 소실점 방향(`vpDirSnap`)과 화면 직교
 * (`screenOrthoSnap`) 중 **끝점 이동량이 작은 쪽**이 이긴다(`chooseAxis`의 커서 규칙과
 * 같은 갈래). 소실점이 없으면 직교뿐이다. 둘 다 임계 밖이면 그대로 둔다 —
 * 임계 밖까지 끌면 두 번째 소실점을 만들 대각선을 못 긋는다.
 */
export function dirSnap2dCore(
  a: Pt2, b: Pt2, vps: (Pt2 | null)[],
): { at: Pt2; ortho: ScreenOrtho | null; vpdir: VpDirSnap | null } {
  const dir = vpDirSnap(a, b, vps);
  const o = screenOrthoSnap(a, b);
  if (dir && o) {
    const mv = Math.hypot(dir.at[0] - b[0], dir.at[1] - b[1]);
    const mo = Math.hypot(o.at[0] - b[0], o.at[1] - b[1]);
    return mv <= mo ? { at: dir.at, ortho: null, vpdir: dir } : { at: o.at, ortho: o, vpdir: null };
  }
  if (dir) return { at: dir.at, ortho: null, vpdir: dir };
  if (o) return { at: o.at, ortho: o, vpdir: null };
  return { at: b, ortho: null, vpdir: null };
}

export function resolve2dCore(raw: Pt2[], ctx: Resolve2dCtx): Resolve2dOut {
  const a0 = raw[0], b0 = raw[raw.length - 1];
  const guides: { from: Pt2; to: Pt2 }[] = [];
  const tol = ctx.radiusPx;
  // ① 시작점 — 오스냅이 이기고, 안 붙으면 정렬(끝점·중점의 x·y)
  const start2 = snap2dAt(a0, ctx.cands, ctx.radiusPx, ctx.kinds);
  let a: Pt2 = start2 ? start2.at : [a0[0], a0[1]];
  if (!start2 && ctx.relSnap) {
    const h = alignAxes(a, ctx.cands, tol);
    if (h.x) a = [h.x.v, a[1]];
    if (h.y) a = [a[0], h.y.v];
    if (h.x) guides.push({ from: h.x.from, to: [a[0], a[1]] });
    if (h.y) guides.push({ from: h.y.from, to: [a[0], a[1]] });
  }
  // ② 끝점 — 오스냅(굽음 규약은 3D 양 끝 스냅 그대로, #34)
  const rep0 = representative(raw);
  const end2 = (rep0 && rep0.bend <= AXIS_TOL.bend_max)
    ? snap2dAt(b0, ctx.cands, ctx.radiusPx, ctx.kinds) : null;
  if (end2) {
    // **오스냅이 기하를 정하되, 소실점 방향 판정은 함께 낸다**(2026-08-17 7차 항목 2-c).
    // 옛 판은 여기서 `vpdir`를 비운 채 반환했다 — 기존 깊이선 위에 **정확히 얹힌** 획도
    // `snapForced`가 없어, 분류가 모호 구간(4°~8°)이면 **물음으로 갔다**(실획 첫 표본:
    // 물음 6회/획 5). 판정 임계는 방향 스냅과 같은 것(vpMisfit ≤ vp_dist_ratio)이고
    // **점은 옮기지 않는다** — 두 끝은 오스냅이 정했다. vpdir 강제는 규칙에서 **기존
    // 소실점의 지지(support)로만** 떨어지므로 카메라를 못 바꾼다(stepRule의 지지 판정이
    // 같은 임계다 — 안전).
    //
    // ⚠⚠ **화면 직교(ortho)는 강제하지 않는다**(2-R″ [1] — 리뷰어가 잡았다). forced="screen"은
    // stepRule의 P1 가드("소실점이 서 있으면 화면 수평선을 **묻는다**" — D-L53: 이 물음 없이
    // 받게 하자 축 오차 중앙 10.1° → 31.6°로 무너졌고, P1은 **불가역**이다)를 우회한다.
    // 끝점 오스냅은 방향의 의도 선언이 아니다 — 두 점을 이었을 뿐이고 방향은 그 점들이
    // 정한 우연이다(방향 스냅 "스냅이 곧 선언"과 다른 상황). 얕은 현이 가로선으로 읽히는
    // 경우의 물음은 **그대로 남긴다** — 불가역 잠금의 문은 조용히 열지 않는다(A-3).
    const dj = dirSnap2dCore(a, end2.at, ctx.vps);
    return { a, b: end2.at, ortho: null,
             vpdir: dj.vpdir ? { ...dj.vpdir, at: [end2.at[0], end2.at[1]] } : null,
             start2, end2, guides, pts: [a, end2.at], engaged: true };
  }
  // ③ 방향 — 화면 직교·소실점 방향(이동량이 작은 쪽, D-L58)
  const d = dirSnap2dCore(a, b0, ctx.vps);
  let b: Pt2 = [d.at[0], d.at[1]];
  // ④ 관계 스냅 — 방향과 성분으로 결합한다
  if (ctx.relSnap) {
    const h = alignAxes(b, ctx.cands, tol);
    const push = (hit: AlignHit) => guides.push({ from: hit.from, to: [b[0], b[1]] });
    if (d.ortho) {
      // 직교 스냅은 한 성분이 이미 앵커에 잠겨 있다 — 남은 성분만 정렬한다
      if (d.ortho.dir === "v" && h.y) { b = [b[0], h.y.v]; push(h.y); }
      if (d.ortho.dir === "h" && h.x) { b = [h.x.v, b[1]]; push(h.x); }
    } else if (d.vpdir) {
      // 방향선 위에서 미끄러져 정렬 — 가이드(x=cx·y=cy)와 방향선의 교점 중 이동이 작은 쪽
      const u: Pt2 = [d.vpdir.vp[0] - a[0], d.vpdir.vp[1] - a[1]];
      let best: { q: Pt2; hit: AlignHit; move: number } | null = null;
      if (h.x && Math.abs(u[0]) > 1e-6) {
        const t = (h.x.v - a[0]) / u[0];
        const q: Pt2 = [h.x.v, a[1] + t * u[1]];
        const move = Math.hypot(q[0] - b[0], q[1] - b[1]);
        if (move <= tol) best = { q, hit: h.x, move };
      }
      if (h.y && Math.abs(u[1]) > 1e-6) {
        const t = (h.y.v - a[1]) / u[1];
        const q: Pt2 = [a[0] + t * u[0], h.y.v];
        const move = Math.hypot(q[0] - b[0], q[1] - b[1]);
        if (move <= tol && (!best || move < best.move)) best = { q, hit: h.y, move };
      }
      if (best) { b = best.q; guides.push({ from: best.hit.from, to: [b[0], b[1]] }); }
    } else {
      if (h.x) b = [h.x.v, b[1]];
      if (h.y) b = [b[0], h.y.v];
      if (h.x) push(h.x);
      if (h.y) push(h.y);
    }
  }
  const startMoved = a[0] !== a0[0] || a[1] !== a0[1];
  const endMoved = !!d.ortho || !!d.vpdir || b[0] !== b0[0] || b[1] !== b0[1];
  const pts: Pt2[] = endMoved ? [a, b] : startMoved ? [a, ...raw.slice(1)] : raw;
  return { a, b, ortho: d.ortho, vpdir: d.vpdir, start2, end2: null, guides, pts,
           engaged: !!start2 || endMoved || guides.length > 0 };
}
