// S-3 획을 3D 뷰포트에 올린다. **선(THREE.Line)으로 충분하다** —
// 튜브 메쉬·속도 기반 굵기는 S-4다. 지금 확인할 것은 "그린 획이 3D에 놓이고 돌려서 보이는가"뿐이다.
//
// 점열을 그대로 넘긴다. 다시 샘플링하거나 다듬지 않는다(§1 "획을 버리지 않는다").
import * as THREE from "three";
import type { Viewport } from "./viewport.js";
import type { Stroke } from "./stroke.js";
import { AXIS_COLOR } from "./grid.js";

const FREE_COLOR = "#9aa4ab";

export class StrokeView {
  private group = new THREE.Group();
  private objs: THREE.Line[] = [];

  constructor(private vp: Viewport) { vp.world.add(this.group); }

  /** 배치된 획만 그린다. 미배치 획은 **아무것도 보이지 않는다** — 깊이가 없기 때문이다. */
  sync(strokes: Stroke[]) {
    for (const o of this.objs) {
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.objs = [];
    for (const s of strokes) {
      if (s.pts3d.length < 2) continue;
      const g = new THREE.BufferGeometry().setFromPoints(
        s.pts3d.map(p => new THREE.Vector3(p[0], p[1], p[2])));
      const color = typeof s.axis === "number" ? AXIS_COLOR[s.axis] : FREE_COLOR;
      const m = new THREE.LineBasicMaterial({ color });
      const line = new THREE.Line(g, m);
      this.group.add(line);
      this.objs.push(line);
    }
    // 획이 늘 때마다 다시 맞춘다 — 첫 획에서 한 번만 맞추면 나머지가 화면 밖으로 나간다
    // (브라우저 확인에서 실제로 그렇게 나왔다). 사용자가 직접 돌린 뒤에는 건드리지 않는다.
    if (this.objs.length && !this.vp.userMoved) this.vp.frameAll();
    this.vp.invalidate();
  }

  reset() { this.vp.userMoved = false; this.sync([]); }
}
