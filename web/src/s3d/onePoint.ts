// **1점 투시의 직접 좌표**(6차 지시 2) — 화면이 곧 정면 입면.
//
// 1점 시점에서는 화면 가로세로가 곧 세계 축이다: 화면에서 수평으로 그으면 X축 선,
// 수직으로 그으면 수직축 선이고, **투영 계산 없이 화면 좌표가 3D 좌표로 바로 간다** —
// 축에 스냅된 획은 유사 삼각형 하나(배율 z₀/f)로 세계 좌표가 나온다. 깊이축 획은 그 역이다.
//
// ```
// 1점 판정   시점 좌표의 축 방향 셋이 (±1,0,0)/(0,±1,0)/(0,0,±1)의 순열인가 (onePointFrame)
// 직접 좌표   화면축 획: 앵커 평면(z=z₀)에서 x·y를 화면에서 읽는다 (directSegment)
//            깊이축 획: z를 화면 좌표의 역으로 읽는다
// ```
//
// 좌표계: 전부 **시점(뷰) 좌표**다(#24) — 호출자(resolveLive)가 fromV로 세계에 되돌린다.
// 확정 뷰에서는 항등이고(P1 확정은 주점=소실점이라 축이 정확히 정렬된다), 뷰 큐브의
// 면 스냅 시점에서는 pose 변환이 정확한 순열을 준다.
import type { Pt2 } from "./camera.js";
import type { Vec3 } from "./geom3d.js";

/**
 * **1점 판정·손 정렬 허용 오차.** `test/constants.ts` 밖이다(D-L49·D-L51의 예외와 같은
 * 자리 — 전역 해시 동결. 측정 픽스처는 정확 정렬이라 어느 원장 값도 이 임계에 의존하지
 * 않는다). 값은 측정 원장의 `algo_constants` 필드로 남는다.
 *
 * - `align_eps`: 직접 경로의 판정(성분 편차) — 정확 정렬만 통과한다(fp 여유).
 *   손으로 근접한 시점은 **자동 정렬이 정확하게 만든 뒤** 이 판정을 지난다.
 * - `hand_deg`: 궤도를 놓는 순간 이 각 안이면 가장 가까운 1점 시점으로 눌러 앉힌다
 *   (지시 2-1 "거의 정면이면 1점으로 본다" — Blender의 축 근접 자동 정렬 선례).
 *   의도적으로 축을 트는 사용자(CLAUDE §전제)를 방해하지 않게 작게 둔다.
 */
export const ONE_POINT_TOL = { align_eps: 1e-3, hand_deg: 2 } as const;

/** 1점 상태의 축 배치 — 어느 세계 축이 화면 가로(h)·세로(v)·깊이(d)인가와 그 부호. */
export interface OnePointFrame {
  /** 화면 가로에 놓인 축 번호와 부호(+x 방향이 그 축의 +인가). */
  h: 0 | 1 | 2; hs: 1 | -1;
  /** 화면 세로. */
  v: 0 | 1 | 2; vs: 1 | -1;
  /** 깊이(시선). */
  d: 0 | 1 | 2; ds: 1 | -1;
}

const BASIS: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * **1점 시점 판정**(지시 2-1). 시점 좌표의 축 방향 셋이 기저의 부호 있는 순열이면
 * 그 배치를 준다. 하나라도 어긋나면 `null` — 직접 경로는 정확한 정렬에서만 돈다
 * (근사 정렬에서 돌리면 오차가 좌표에 구워진다 — 그 경우는 lift 경로가 맞다).
 */
export function onePointFrame(dirs: (Vec3 | null)[]): OnePointFrame | null {
  if (dirs.length < 3) return null;
  const slot: (0 | 1 | 2)[] = [];
  const sign: (1 | -1)[] = [];
  for (let i = 0; i < 3; i++) {
    const dir = dirs[i];
    if (!dir) return null;
    let hit: 0 | 1 | 2 | null = null;
    let s: 1 | -1 = 1;
    for (let k = 0; k < 3; k++) {
      const b = BASIS[k];
      const dot = dir[0] * b[0] + dir[1] * b[1] + dir[2] * b[2];
      // ⚠ 판정은 **잔차 노름**이다 — |내적|은 각의 2차라 0.5° 틀림도 1e-3 안에 들어와
      // 근사 정렬을 통과시킨다(반례 테스트가 잡았다). 잔차는 각의 1차(≈θ)다.
      const sg = dot >= 0 ? 1 : -1;
      const res = Math.hypot(dir[0] - sg * b[0], dir[1] - sg * b[1], dir[2] - sg * b[2]);
      if (res < ONE_POINT_TOL.align_eps) {
        hit = k as 0 | 1 | 2; s = sg as 1 | -1;
        break;
      }
    }
    if (hit == null) return null;
    slot.push(hit); sign.push(s);
  }
  // 순열이어야 한다(두 축이 같은 기저에 앉으면 1점이 아니라 퇴화다)
  if (new Set(slot).size !== 3) return null;
  const at = (k: 0 | 1 | 2) => slot.indexOf(k) as 0 | 1 | 2;
  return {
    h: at(0), hs: sign[at(0)],
    v: at(1), vs: sign[at(1)],
    d: at(2), ds: sign[at(2)],
  };
}

/**
 * **직접 좌표**(지시 2-2). 앵커(시점 좌표 — 깊이 z₀를 든다)와 획의 끝 화면점에서
 * 그 축의 3D 세그먼트를 만든다. 카메라 투영(광선-직선 최근점)을 거치지 않는다:
 *
 * - 화면축(h·v): 끝점의 그 화면 성분만 z₀/f 배율로 읽는다 — 나머지 성분은 앵커 그대로
 *   (스냅된 획의 잉크는 축 방향으로 펴져 있으므로 lift 경로와 같은 점이 나온다, 2-5).
 * - 깊이축(d): z를 역으로 읽는다 — 앵커의 화면 오프셋이 큰 성분을 쓴다(주점 근처 퇴화 회피).
 *
 * `null`이면 이 획은 직접 경로 밖이다(호출자가 lift 경로로 간다) — 길이 0·카메라 뒤·퇴화.
 */
export function directSegment(
  opf: OnePointFrame, axis: 0 | 1 | 2, anchor: Vec3, b2: Pt2,
  ctx: { principal: Pt2; f: number },
): [Vec3, Vec3] | null {
  const z0 = anchor[2];
  if (z0 <= 1e-9) return null;
  const end: Vec3 = [anchor[0], anchor[1], anchor[2]];
  if (axis === opf.h) {
    end[0] = ((b2[0] - ctx.principal[0]) / ctx.f) * z0;
  } else if (axis === opf.v) {
    end[1] = ((b2[1] - ctx.principal[1]) / ctx.f) * z0;
  } else if (axis === opf.d) {
    // 깊이 — 앵커가 주점 위면 깊이선이 점으로 투영되어 역이 없다
    const ox = anchor[0], oy = anchor[1];
    const useX = Math.abs(ox) >= Math.abs(oy);
    const num = useX ? ctx.f * ox : ctx.f * oy;
    const den = useX ? b2[0] - ctx.principal[0] : b2[1] - ctx.principal[1];
    if (Math.abs(num) < 1e-9 || Math.abs(den) < 1e-9) return null;
    const z = num / den;
    if (z <= 1e-9) return null;                        // 카메라 뒤 — 놓지 않는다
    end[2] = z;                                        // 깊이선 {x=ox, y=oy}— x·y는 불변이다
  } else {
    return null;
  }
  const dx = end[0] - anchor[0], dy = end[1] - anchor[1], dz = end[2] - anchor[2];
  if (Math.hypot(dx, dy, dz) < 1e-9) return null;      // 길이 0
  return [[anchor[0], anchor[1], anchor[2]], end];
}

/**
 * **시작점이 스냅 없이도 놓인다**(지시 2-3 — "없으면 궤도 중심의 깊이"). 화면점을
 * 깊이 z₀ 평면에 역투영한 시점 좌표. 1점 상태에서만 부른다 — "그리는 순간 3D에 있다.
 * 미승격이 없다"(지시 2)의 앵커다.
 */
export function planeAnchor(a2: Pt2, z0: number, ctx: { principal: Pt2; f: number }): Vec3 | null {
  if (z0 <= 1e-9) return null;
  return [((a2[0] - ctx.principal[0]) / ctx.f) * z0,
          ((a2[1] - ctx.principal[1]) / ctx.f) * z0, z0];
}
