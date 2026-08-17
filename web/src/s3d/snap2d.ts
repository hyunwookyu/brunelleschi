// **2D 오스냅 — 카메라 확정 전의 화면 스냅**(2026-08-17 4차 지시 1).
//
// 보조선 단계가 작도의 본체이고 그 단계는 대부분 **카메라 확정 전**이다(D-2의 원래 취지).
// 그런데 오스냅은 3D 세그먼트만 후보로 모았고(`snapSegs = lifted(doc)`), 확정 전에는
// `frame()`이 없어 질의 자체가 안 돌았다 — 첫 화면에서 끝점·중점에 아무것도 안 붙었다.
//
// 여기는 그 구멍을 메우는 **순수 화면 좌표 스냅**이다:
//
// ```
// 대상    2D 대기 획(pts2d의 시작·끝 두 점 — §1.1대로 직선이다)
// 후보    끝점 · 중점 · 교차점 (+ 여러 획이 만난 끝점은 정점으로 승격)
// 우선    3D 오스냅과 **같은 규칙**(SNAP_ORDER · 우선순위 > 거리) — 지시 1-a
// 반경    앱 조리개 `OSNAP.radiusPx` 그대로(종류 토글도 그대로) — 부르는 쪽이 넘긴다
// ```
//
// **3D 오스냅과 다른 것은 좌표뿐이다.** 화면에서 만나는 두 2D 획은 같은 종이 위의 연필선이라
// 그 교차가 실제 교차다(3D의 "화면 교차 = 가림" 문제가 여기엔 없다 — 아직 공간이 없다).
// 중점도 화면 중점이다 — 투시 중점(3D 중점의 상)은 승격 후 3D 오스냅의 몫이다.
//
// ⚠ **새 임계를 만들지 않는다**(#17): 병합·연장은 `SNAP_TOL.merge_ratio`·`extend_ratio`를
// **화면 대각 기준**으로 그대로 쓴다(3D 판은 기하 크기 기준 — 프레임이 다름을 병기한다, #34).
// 카메라 확정 후에도 **미승격 2D 획은 계속 이 후보에 있다**(지시 1-b) — 승격은 자리를 안 옮기므로
// (끝점이 같은 화면 점) 확정 전후의 스냅이 이어진다.
import { SNAP_ORDER, SNAP_TOL, type SnapKind } from "./snap.js";
import type { Pt2 } from "./camera.js";

const RANK2 = new Map<SnapKind, number>(SNAP_ORDER.map((k, i) => [k, i]));

/** 2D 스냅 대상 — 대기 획의 화면 직선(시작·끝, §1.1). */
export interface Snap2Seg { id: string; a: Pt2; b: Pt2 }

/** 2D 스냅 후보. 3D 판의 `SnapCand`와 같은 필드 구성이되 좌표가 화면뿐이다. */
export interface Snap2Cand {
  kind: SnapKind;
  /** 화면 위치 — **이것이 획의 그 끝이 된다.** */
  at: Pt2;
  /** 커서에서 화면 거리(px). */
  dist: number;
  ofId?: string;
  ofId2?: string;
}

const d2 = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** 질의와 무관한 2D 후보 — 끝점·중점·교차점. 대기 획이 바뀔 때만 다시 만들면 된다. */
export function static2dCandidates(
  segs: Snap2Seg[], screenDiag: number,
  cfg: { merge_ratio?: number; extend_ratio?: number } = {},
): Snap2Cand[] {
  const merge = (cfg.merge_ratio ?? SNAP_TOL.merge_ratio) * screenDiag;
  const pad = cfg.extend_ratio ?? SNAP_TOL.extend_ratio;
  const out: Snap2Cand[] = [];

  // ---- 끝점 · 중점. 같은 자리를 공유하면 합치고, **둘 이상 만난 끝점은 정점**이다(3D 판 그대로).
  const seen: { at: Pt2; kind: SnapKind; hits: number; idx: number }[] = [];
  const fresh = (at: Pt2, kind: SnapKind): boolean => {
    for (const s of seen) {
      if (s.kind === kind && d2(s.at, at) <= merge) { s.hits += 1; return false; }
    }
    seen.push({ at, kind, hits: 1, idx: out.length });
    return true;
  };
  for (const s of segs) {
    for (const at of [s.a, s.b]) if (fresh(at, "endpoint")) out.push({ kind: "endpoint", at, dist: 0, ofId: s.id });
    const mid: Pt2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    if (fresh(mid, "midpoint")) out.push({ kind: "midpoint", at: mid, dist: 0, ofId: s.id });
  }
  for (const s of seen) {
    if (s.kind === "endpoint" && s.hits >= 2) out[s.idx].kind = "vertex";
  }

  // ---- 교차점: 화면에서 실제로 가로지르는 자리. 손 오차를 담아 선분 밖 `extend_ratio`까지 본다.
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i], B = segs[j];
    const adx = A.b[0] - A.a[0], ady = A.b[1] - A.a[1];
    const bdx = B.b[0] - B.a[0], bdy = B.b[1] - B.a[1];
    const det = adx * bdy - ady * bdx;
    if (Math.abs(det) < 1e-12) continue;                       // 나란하다 — 교점이 없다
    const ex = B.a[0] - A.a[0], ey = B.a[1] - A.a[1];
    const t = (ex * bdy - ey * bdx) / det;
    const u = (ex * ady - ey * adx) / det;
    if (t < -pad || t > 1 + pad || u < -pad || u > 1 + pad) continue;
    const at: Pt2 = [A.a[0] + t * adx, A.a[1] + t * ady];
    // 끝점과 같은 자리면 끝점이 이미 냈다(3D 판과 같은 규약)
    if ([A.a, A.b, B.a, B.b].some(e => d2(e, at) <= merge)) continue;
    out.push({ kind: "intersection", at, dist: 0, ofId: A.id, ofId2: B.id });
  }
  return out;
}

/**
 * **하나를 고른다** — 반경 안 후보 중 우선순위가 높은 것, 같으면 가까운 것(3D 판과 같은 규칙).
 * `kinds`는 앱의 종류 토글이다(`OSNAP.kinds` 그대로). 없으면 `null` — 애매하면 놓지 않는다(A-3).
 */
export function snap2dAt(
  p: Pt2, cands: Snap2Cand[], radiusPx: number,
  kinds?: Partial<Record<SnapKind, boolean>>,
): Snap2Cand | null {
  let best: Snap2Cand | null = null;
  for (const c of cands) {
    if (kinds && kinds[c.kind] === false) continue;
    const dist = d2(c.at, p);
    if (dist > radiusPx) continue;
    if (!best
        || RANK2.get(c.kind)! < RANK2.get(best.kind)!
        || (RANK2.get(c.kind) === RANK2.get(best.kind) && dist < best.dist)) {
      best = { ...c, dist };
    }
  }
  return best;
}
