// S-4 획을 3D 뷰포트에 올린다 — **튜브 메쉬**. S-3까지는 `THREE.Line`이었다.
//
// 점열을 그대로 넘긴다. 다시 샘플링하거나 다듬지 않는다(§1 "획을 버리지 않는다").
// 굵기는 **획 확정 시점에 이미 앱에 있는 6튜플**에서 온다 — `Stroke` 자료구조를 늘리지 않는다(A-3).
import * as THREE from "three";
import type { Viewport } from "./viewport.js";
import type { Stroke } from "./stroke.js";
import { buildTube, widthProfile, worldRadius, TUBE_TOL } from "./tube.js";
import { AXIS_COLOR } from "./grid.js";

const FREE_COLOR = "#9aa4ab";
/** `Stroke.color`의 기본값. 이것이면 **축 색을 쓴다**(아래 `colorOf`). */
export const DEFAULT_COLOR = "#111";

/**
 * 획의 색. 평소에는 **축 색**이고, `Stroke.color`가 기본값이 아니면 **그것이 이긴다**.
 *
 * 그 덮어쓰기가 지금 쓰이는 곳은 **미확정 배치**다(S-7, D-S18 — 깊이 근거가 앵커 하나뿐인 배치).
 * _`Stroke.color`는 자료구조에 있는데 아무도 안 읽고 있었다 — S-7이 미확정을 그 필드에
 * 적어 놓고 3D도 2D도 축 색만 그리고 있었다(S-8 점검에서 발견). 표시를 만들었다고
 * 화면이 쓰는 것은 아니다 — `appPlace`의 배선 문제와 같은 유형이다._
 */
export function colorOf(s: Stroke): string {
  if (s.color && s.color !== DEFAULT_COLOR) return s.color;
  return typeof s.axis === "number" ? AXIS_COLOR[s.axis] : FREE_COLOR;
}

/** 굵기 조회 — 획 id로 원본 6튜플을 준다. 없으면(합성 획) 일정 굵기로 떨어진다. */
export type RawLookup = (id: string) => number[][] | undefined;

export class StrokeView {
  private group = new THREE.Group();
  private objs: THREE.Mesh[] = [];
  /** 마지막 sync의 메쉬 규모 — 지연 예산(P1/P4/V-n) 확인에 쓴다. */
  lastCounts = { strokes: 0, vertices: 0, triangles: 0 };

  constructor(private vp: Viewport, private rawOf?: RawLookup) { vp.world.add(this.group); }

  /**
   * 배치된 획만 그린다. 미배치 획은 **아무것도 보이지 않는다** — 깊이가 없기 때문이다.
   * `f`는 세계 반지름 환산에 쓴다(그린 굵기 → 그 깊이의 세계 크기).
   */
  sync(strokes: Stroke[], f?: number) {
    for (const o of this.objs) {
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.objs = [];
    let verts = 0, tris = 0, n = 0;

    for (const s of strokes) {
      if (s.pts3d.length < 2) continue;
      // **획은 직선 세그먼트다 — 양 끝만 쓴다**(계획서 §1.1, 2026-08-16 사람 지시 2-b).
      // 손떨림을 버리기로 한 결정이 렌더 층에서 안 지켜지고 있었다: 중심선에 점열을 그대로
      // 넣으면 튜브가 손 획의 곡선을 **그대로 보존한다**. `pts3d`는 그대로 두므로
      // (`Stroke`를 안 고친다) 프리핸드로 돌아갈 때 이 두 줄만 되돌리면 된다.
      const line = [s.pts3d[0], s.pts3d[s.pts3d.length - 1]];
      const px = widthProfile(this.rawOf?.(s.id), s.pts3d.length);
      const w0 = px[0], w1 = px[px.length - 1];
      // f가 없으면 깊이 환산을 할 수 없다 — 화면 굵기를 세계 크기로 옮기는 데 초점거리가 필요하다.
      const radii = line.map((p, i) => f ? worldRadius((i === 0 ? w0 : w1) * s.width, p[2], f)
                                         : TUBE_TOL.base_width_px * 0.0004 * s.width);
      const m = buildTube(line, radii);
      if (!m) continue;

      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      const color = colorOf(s);
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color, roughness: 0.75, metalness: 0.0,
      }));
      this.group.add(mesh);
      this.objs.push(mesh);
      n += 1; verts += m.counts.vertices; tris += m.counts.triangles;
    }
    this.lastCounts = { strokes: n, vertices: verts, triangles: tris };

    // 획이 늘 때마다 다시 맞춘다 — 첫 획에서 한 번만 맞추면 나머지가 화면 밖으로 나간다.
    // 사용자가 직접 돌린 뒤에는 건드리지 않는다.
    if (this.objs.length && !this.vp.userMoved) this.vp.frameAll();
    this.vp.invalidate();
  }

  reset() { this.vp.userMoved = false; this.sync([]); }
}
