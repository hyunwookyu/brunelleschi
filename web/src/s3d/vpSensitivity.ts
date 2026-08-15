// L-B.2 — **가이드 민감도**. 계획서 §5.2 "조정 중 실시간 피드백이 필수다".
//
// 자동 판정이 원리적으로 불가능하므로(§5.3) 사용자의 눈이 유일한 판정 수단인데,
// **눈은 자기 손이 얼마나 정밀해야 하는지를 못 본다.** L-A.7이 잰 것이 그것이고
// (핸들 1px이 축을 0.115~1.10° 움직인다) 지금까지 그 값은 **원장에만** 있었다.
//
// 여기가 그것을 앱으로 옮긴다 — **`min_guide_ratio`를 정한 것과 같은 양을 화면에 낸다.**
//
// ⚠ **#17(측정 경로와 앱 경로가 갈라진다)이 이 파일의 존재 이유다.** `vp_homog_measure`가
// 같은 계산을 자기 안에서 하고 있었고, 앱이 따로 짜면 화면 숫자와 원장 숫자가 갈린다.
// **이 함수 하나를 둘이 같이 쓴다.**
//
// ⚠ 이 값은 **정확도의 측정이 아니다.** 카메라 해의 핸들 위치에 대한 **수치 미분**이고
// 결정론적이다 — "사용자가 그 정밀도에 도달하는가"는 여전히 표본 0이다(AS-L9).
import { ConstraintAccumulator, type AxisId } from "./constraints.js";
import { vpFromGuides } from "./vpHomog.js";
import { byAxis, type Guide } from "./vpDraft.js";
import { axisDirection, dot3, unit3, type Vec3 } from "./geom3d.js";
import type { Pt2 } from "./camera.js";

export const SENS_TOL = {
  /** 핸들을 옮겨 보는 거리(px). 1px이 사용자가 만질 수 있는 최소 단위다(#29). */
  probe_px: 1,
  /** 방향 수. **하나만 보지 않는다** — 방향에 따라 민감도가 다르다(#12). */
  probe_dirs: 8,
  /** 축 방향 오차 예산(도). L-A.7이 재등록한 게이트 값이다(CLAUDE.md §2). */
  budget_deg: 0.5,
  /** 예산이 이보다 좁으면 "조작 불가"로 알린다(px). 1px 미만은 손이 닿지 않는다. */
  unusable_px: 1.0,
} as const;

export type SensCfg = Partial<typeof SENS_TOL>;

export interface Solved {
  principal: Pt2;
  f: number;
  vps: (Pt2 | null)[];
  /** 축 방향(단위벡터). 소실점이 없는 축은 `null`. */
  dirs: (Vec3 | null)[];
}

/**
 * 가이드 → 카메라. **무한원 스냅을 포함한다**(§5.4 c) — 앱이 쓰는 것과 같은 경로여야 하므로
 * 여기가 단일 출처다. 카메라가 안 서면 `null`.
 */
export function solveGuides(guides: Guide[], imgSize: [number, number]): Solved | null {
  const acc = new ConstraintAccumulator(imgSize);
  const per = byAxis(guides);
  for (const ax of [0, 1, 2] as AxisId[]) {
    if (per[ax].length < 2) { acc.setLines(ax, per[ax]); continue; }
    const r = vpFromGuides(per[ax][0], per[ax][1], imgSize);
    acc.setLines(ax, r.infinite ? [] : per[ax]);
  }
  const s = acc.solve();
  const c = s.camera;
  if (!c.ok || c.f == null || !c.principalPoint) return null;
  const vps = ([0, 1, 2] as AxisId[]).map(a =>
    (s.axes[a].status === "fixed" ? ((s.axes[a] as { vp: Pt2 }).vp) : null));
  return {
    principal: c.principalPoint, f: c.f, vps,
    dirs: vps.map(v => (v ? unit3(axisDirection(v, c.principalPoint!, c.f!)) : null)),
  };
}

/** 두 단위벡터 사이의 각(도). **방향의 부호는 무시한다** — 축은 직선이지 반직선이 아니다. */
const angDeg = (a: Vec3, b: Vec3): number =>
  (Math.acos(Math.min(1, Math.abs(dot3(a, b)))) * 180) / Math.PI;

export interface AxisSens {
  axis: AxisId;
  /** 핸들 1px이 이 축의 방향을 움직이는 최대 각(도). 카메라가 안 서면 `null`. */
  degPerPx: number | null;
  /** `budget_deg`를 다 쓰기까지 핸들이 움직여도 되는 px. 작을수록 조작이 어렵다. */
  budgetPx: number | null;
  /** 이 축을 정하는 두 가이드의 길이 중 **짧은 쪽**(px). 정확도는 짧은 쪽이 정한다. */
  shortestGuidePx: number | null;
}

/**
 * **핸들 1px이 축 방향을 얼마나 움직이는가.**
 *
 * 모든 핸들을 여덟 방향으로 1px씩 옮겨 보고 **축마다 최댓값**을 낸다.
 * 한 축의 핸들을 옮기면 f가 바뀌어 **다른 축도 움직이므로** 축별 최댓값은 모든 핸들에 대해 본다.
 *
 * 비용: 핸들 수 × 8 × 카메라 해. 가이드 6개면 96회이고 해가 작은 선형대수라 한 프레임 안이다.
 */
export function axisSensitivity(
  guides: Guide[], imgSize: [number, number], cfg: SensCfg = {},
): AxisSens[] {
  const c = { ...SENS_TOL, ...cfg };
  const base = solveGuides(guides, imgSize);
  const per = byAxis(guides);
  const shortest = ([0, 1, 2] as AxisId[]).map(ax => {
    const ls = per[ax].map(g => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]));
    return ls.length ? Math.min(...ls) : null;
  });
  if (!base) {
    return ([0, 1, 2] as AxisId[]).map(ax =>
      ({ axis: ax, degPerPx: null, budgetPx: null, shortestGuidePx: shortest[ax] }));
  }
  const worst: (number | null)[] = [null, null, null];
  for (let i = 0; i < guides.length; i++) {
    for (const end of [0, 1] as const) {
      for (let k = 0; k < c.probe_dirs; k++) {
        const th = (k * 2 * Math.PI) / c.probe_dirs;
        const dx = Math.cos(th) * c.probe_px, dy = Math.sin(th) * c.probe_px;
        const moved = guides.map((g, j) => {
          if (j !== i) return g;
          return end === 0 ? { ...g, a: [g.a[0] + dx, g.a[1] + dy] as Pt2 }
                           : { ...g, b: [g.b[0] + dx, g.b[1] + dy] as Pt2 };
        });
        const s = solveGuides(moved, imgSize);
        if (!s) continue;
        for (const ax of [0, 1, 2] as AxisId[]) {
          const a = base.dirs[ax], b = s.dirs[ax];
          if (!a || !b) continue;
          const d = angDeg(a, b) / c.probe_px;
          if (worst[ax] == null || d > worst[ax]!) worst[ax] = d;
        }
      }
    }
  }
  return ([0, 1, 2] as AxisId[]).map(ax => ({
    axis: ax,
    degPerPx: worst[ax],
    budgetPx: worst[ax] != null && worst[ax]! > 0 ? c.budget_deg / worst[ax]! : null,
    shortestGuidePx: shortest[ax],
  }));
}
