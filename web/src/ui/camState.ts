// L-B.1 — 가이드 → 카메라. 옛 `main.ts`의 `applyGuides`/`placeCtx`를 UI에서 떼어낸 것.
//
// 떼어낸 이유는 **측정 경로와 앱 경로가 갈라지는 것**을 막기 위해서다(PITFALLS #17).
// 옛 판에서는 이 논리가 `main.ts` 안에 있어 테스트가 닿지 않았고, 테스트가 닿는 것은
// `vpFromGuides`뿐이었다 — 무한원 스냅이 **누산기에 어떻게 반영되는지**는 아무도 안 봤다.
import { ConstraintAccumulator, type AxisId } from "../s3d/constraints.js";
import { vpFromGuides } from "../s3d/vpHomog.js";
import { byAxis, type Guide } from "../s3d/vpDraft.js";
import type { Pt2 } from "../s3d/camera.js";
import type { PlaceCtx } from "../s3d/stroke.js";

export interface AxisGuideState { infinite: boolean; sepDeg: number }

export class CamState {
  readonly acc: ConstraintAccumulator;
  guides: Guide[] = [];
  readonly guideState = new Map<AxisId, AxisGuideState>();
  /** 확정됐는가(§1.2의 "카메라 확정"). 확정 뒤에는 획이 소실점을 바꾸지 않는다. */
  locked = false;

  constructor(imgSize: [number, number]) { this.acc = new ConstraintAccumulator(imgSize); }

  get imgSize(): [number, number] { return this.acc.imgSize; }
  resize(s: [number, number]) { this.acc.resize(s); this.apply(); }

  /**
   * 가이드를 누산기에 반영한다 — **교체다**(끌 때마다 쌓이면 안 된다).
   *
   * **무한원 스냅**(§5.4 c, L-A.7): 두 가이드의 각차가 `HOMOG_TOL.snap_deg` 미만이면
   * 교점이 정해지지 않는다(핸들 1px에 축이 0.39°/px 이상 움직인다 —
   * 0.5° 예산의 78%다). 그 축을 **비워** 소실점 개수를 줄이면 1·2점 분기가 맡는다.
   */
  apply(): void {
    const per = byAxis(this.guides);
    this.guideState.clear();
    for (const ax of [0, 1, 2] as AxisId[]) {
      if (per[ax].length < 2) { this.acc.setLines(ax, per[ax]); continue; }
      const r = vpFromGuides(per[ax][0], per[ax][1], this.imgSize);
      this.guideState.set(ax, { infinite: r.infinite, sepDeg: r.sepDeg });
      this.acc.setLines(ax, r.infinite ? [] : per[ax]);
    }
  }

  vps(): (Pt2 | null)[] {
    const s = this.acc.solve().axes;
    return ([0, 1, 2] as AxisId[]).map(a =>
      (s[a].status === "fixed" ? ((s[a] as { vp: Pt2 }).vp) : null));
  }

  /** 배치 문맥. 카메라가 아직이면 `null` — **애매하면 놓지 않는다**(A-3). */
  ctx(): PlaceCtx | null {
    const cam = this.acc.solve().camera;
    if (!cam.ok || cam.f == null || !cam.principalPoint) return null;
    return { principal: cam.principalPoint, f: cam.f, vps: this.vps(), imgSize: this.imgSize };
  }

  /** 무한원으로 스냅된 축들 — 화면에 사유와 각차를 알린다. */
  snapped(): { axis: AxisId; sepDeg: number }[] {
    return [...this.guideState.entries()]
      .filter(([, v]) => v.infinite)
      .map(([axis, v]) => ({ axis, sepDeg: v.sepDeg }));
  }
}
