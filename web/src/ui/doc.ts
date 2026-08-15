// L-B — 문서 모델. 계획서 §9(뷰 시스템과 2D/3D 레이어).
//
// **미배치는 실패가 아니라 대기 상태다**(§9.1). 그래서 "놓지 못한 획" 같은 별도 집합이 없다 —
// `seg3d === null`이면 2D 레이어이고, 조건이 갖춰지면 그 자리에서 승격한다.
// 옛 모델은 미배치를 `provisional`·`userPlaced`·`viewOrigin` 세 집합으로 앱에 흩어 놨는데,
// 그것이 스냅샷 되돌리기를 다섯 곳으로 늘린 원인이었다.
//
// ```
// 2D 레이어 : seg3d === null   — 그린 뷰에서만 보인다(viewRef가 소유자)
// 3D 레이어 : seg3d !== null   — 어느 뷰에서든 보인다(viewRef는 이력으로만 남는다)
// ```
//
// **DOM도 three도 모른다.** 순수 상태라 테스트가 이 파일만 보고 쓸 수 있다.
import type { Pt2 } from "../s3d/camera.js";
import type { Vec3 } from "../s3d/geom3d.js";
import type { Axis } from "../s3d/axis.js";
import type { ViewPose } from "../s3d/viewCamera.js";

/** 획의 시작점이 무엇에 붙었는가(§3 스냅). L-B.3에서 채운다. */
export interface SnapRef { kind: string; at: Vec3; ofId?: string }

export interface SStroke {
  id: string;
  /** **원본을 보존한다**(CLAUDE.md §1) — 승격·차수 승격이 여기서 다시 푼다. */
  pts2d: Pt2[];
  /** 그린 뷰. 2D 레이어일 때 **소유자**이고, 승격 뒤에는 이력이다(§9.2). */
  viewRef: string;
  /** `null`이면 2D 레이어(대기 상태). 프리핸드를 미뤘으므로 두 점이다(§1.1). */
  seg3d: [Vec3, Vec3] | null;
  axis: Axis;
  /** 사용자가 직접 고른 축은 재분류가 덮지 않는다. */
  userAxis: boolean;
  snapStart: SnapRef | null;
  color?: string;
  width?: number;
}

/**
 * 명명된 뷰(§9.2). 라이노의 명명된 뷰를 따르되 **2D 획을 소유한다**.
 *
 * `pose`가 `null`인 뷰가 **확정 뷰**다 — 첫 카메라 자체이고 자세가 항등이다.
 * `seq`는 생성 순서다. `Date.now()`를 쓰지 않는다(재현성 규칙, CLAUDE.md §5).
 */
export interface SView {
  id: string;
  name: string;
  pose: ViewPose | null;
  seq: number;
}

export interface DocState {
  strokes: SStroke[];
  views: SView[];
  /** 지금 그리고 있는 뷰. 2D 획의 소유자가 된다. */
  currentView: string;
}

let strokeSeq = 0;
let viewSeq = 0;

/** 테스트가 id를 예측할 수 있게 되돌린다. **앱에서는 부르지 않는다.** */
export function resetDocSeq(): void { strokeSeq = 0; viewSeq = 0; }

export function newDoc(): DocState {
  const v = newView("확정 뷰", null);
  return { strokes: [], views: [v], currentView: v.id };
}

export function newView(name: string, pose: ViewPose | null): SView {
  viewSeq += 1;
  return { id: `v${viewSeq}`, name, pose, seq: viewSeq };
}

export function newSStroke(pts2d: Pt2[], viewRef: string): SStroke {
  strokeSeq += 1;
  return { id: `s${strokeSeq}`, pts2d, viewRef, seg3d: null, axis: "free",
           userAxis: false, snapStart: null };
}

/** 3D 레이어 — 어느 뷰에서든 보인다. */
export const lifted = (d: DocState): SStroke[] => d.strokes.filter(s => s.seg3d !== null);

/**
 * 지금 뷰의 2D 레이어 — **대기 중인 획**. 다른 뷰의 것은 숨긴다(§9.4).
 *
 * 숨기는 이유는 화면 정리가 아니라 **좌표계**다: 2D 획의 `pts2d`는 그린 뷰의 화면 좌표라서
 * 다른 뷰에 그리면 엉뚱한 자리에 나온다. 옛 UI가 그 자리에서 걸렸다.
 */
export const pending = (d: DocState, viewId = d.currentView): SStroke[] =>
  d.strokes.filter(s => s.seg3d === null && s.viewRef === viewId);

/** 다른 뷰가 들고 있는 대기 획 수 — 화면에 "숨긴 것이 있다"고 알리려면 세어야 한다. */
export const pendingElsewhere = (d: DocState, viewId = d.currentView): number =>
  d.strokes.filter(s => s.seg3d === null && s.viewRef !== viewId).length;

export const viewOf = (d: DocState, id: string): SView | undefined =>
  d.views.find(v => v.id === id);

/**
 * 뷰를 지우면 **그 안의 대기 획도 함께 사라진다**(§9.2). 승격된 획은 뷰 소속이 없으므로 남는다.
 * 확정 뷰(`pose === null`)는 지우지 않는다 — 첫 카메라 자체다.
 */
export function deleteView(d: DocState, id: string): { removed: number } | null {
  const v = viewOf(d, id);
  if (!v || v.pose === null) return null;
  const before = d.strokes.length;
  d.strokes = d.strokes.filter(s => !(s.seg3d === null && s.viewRef === id));
  d.views = d.views.filter(x => x.id !== id);
  if (d.currentView === id) d.currentView = d.views[0].id;
  return { removed: before - d.strokes.length };
}

/** 되돌리기용 스냅샷. **문서 하나만 복사하면 된다** — 곁가지 집합이 없다. */
export function snapshotDoc(d: DocState): DocState {
  return {
    strokes: d.strokes.map(s => ({ ...s, pts2d: s.pts2d,
      seg3d: s.seg3d ? [[...s.seg3d[0]], [...s.seg3d[1]]] as [Vec3, Vec3] : null })),
    views: d.views.map(v => ({ ...v })),
    currentView: d.currentView,
  };
}
