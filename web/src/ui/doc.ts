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

/**
 * **펜 채널**(2026-08-17 사람 지시 D). 작도 순서 그대로다 — **구축선을 긋고 그 위에
 * 확정선을 덧그린다.**
 *
 * ```
 * guide   회색 파선  **보조선 — 기본값.** 작도의 본체다. 3D로 올라가고 돌리면 흐려진다
 * result  검정 실선  결과선 — 보조선 위를 따라 덧그어 확정한다. 돌려도 남고 내보내기에 포함
 * note    파랑      주석(해칭·지시선·메모) — **3D로 안 올라가고** 그린 뷰에서만 보인다
 * ```
 *
 * ⚠ **스냅 강도를 채널로 가르지 않는다**(D-2). 보조선 단계가 작도의 본체이고 정확한
 * 교점·끝점이 없으면 작도가 안 된다. 채널이 정하는 것은 **표시와 내보내기**뿐이다(C-4).
 * ⚠ **자동 판정을 하지 않는다**(D-4) — 사용자가 고르고, 나중에 골라서 바꾼다.
 * ⚠ **결과선을 강제하지 않는다**(D-6) — 보조선만 그리고 끝내도 3D는 서 있다.
 */
export type Channel = "guide" | "result" | "note";

/** 옛 저장본에는 이 필드가 없다 — **보조선이 기본**이다(D-1). */
export const DEFAULT_CHANNEL: Channel = "guide";

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
  /**
   * **끝점이 붙은 대상**(2026-08-16 사람 지시 — 오스냅). `snapStart`와 짝이다.
   *
   * **양 끝이 스냅으로 확정되면 축이 없어도 3D가 나온다** — 두 점이 선분을 정하므로
   * 추론할 것이 없다. 그것이 면 위 사선·자유 세그먼트를 대신하는 경로다(D-L46).
   * `null`이면 끝점은 커서였고, 그때는 축이 방향을 준다(§3의 원래 경로).
   */
  snapEnd: SnapRef | null;
  /**
   * **시작점의 겨냥 거리(px)**(2026-08-17 지시 K) — 가장 가까운 스냅 후보까지의 화면 거리.
   * 스냅이 걸리면 그 후보의 거리, 안 걸리면 **40px 프로브**의 최근접 후보 거리다(조리개에서
   * 절단하면 "반경을 넓혀야 하는가"를 못 답한다 — 리뷰어 [7]). 스냅 여부는 `snapStart` 유무로
   * 가른다. 옛 저장본에는 없다.
   */
  snapDistPx?: number | null;
  /**
   * **조각의 출처 획 id**(지시 I·K). 지우개·분할이 만든 조각은 사람이 그은 획과 **단위가
   * 다르므로**(#11 — 길이·다축 지표의 분모가 갈린다) 실획 측정이 이것으로 가른다.
   */
  pieceOf?: string;
  /** **펜 채널**(D). 그리기·렌더·내보내기·저장·고치기 다섯 곳이 읽는다(#18). */
  channel: Channel;
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

/** 지금까지 나간 번호(저장에 담는다, L-D.2). */
export const docSeq = (): { stroke: number; view: number } =>
  ({ stroke: strokeSeq, view: viewSeq });

/**
 * **저장된 문서를 열 때 번호를 이어 받는다**(L-D.2). 안 하면 새 획이 `s1`부터 다시 나가고
 * **불러온 획과 id가 겹친다** — 스냅 출처(`ofId`)·`viewRef`가 id로 가리키므로 겹치면
 * 남의 것을 가리킨다. 조용히 틀리는 종류라 테스트로 잠근다.
 */
export function setDocSeq(s: { stroke: number; view: number }): void {
  strokeSeq = Math.max(strokeSeq, s.stroke);
  viewSeq = Math.max(viewSeq, s.view);
}

export function newDoc(): DocState {
  const v = newView("확정 뷰", null);
  return { strokes: [], views: [v], currentView: v.id };
}

export function newView(name: string, pose: ViewPose | null): SView {
  viewSeq += 1;
  return { id: `v${viewSeq}`, name, pose, seq: viewSeq };
}

export function newSStroke(pts2d: Pt2[], viewRef: string,
                           channel: Channel = DEFAULT_CHANNEL): SStroke {
  strokeSeq += 1;
  return { id: `s${strokeSeq}`, pts2d, viewRef, seg3d: null, axis: "free",
           userAxis: false, snapStart: null, snapEnd: null, channel };
}

/**
 * **3D로 올라갈 수 있는 획인가**(D-3). 주석은 아니다 — 그린 뷰의 화면에만 있다.
 * **판정을 여기 하나에 둔다**(#17): 규칙 투입·배치·승격 연쇄가 같은 함수를 본다.
 */
export const liftable = (s: SStroke): boolean => s.channel !== "note";

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

/**
 * 되돌리기용 스냅샷. **문서 하나만 복사하면 된다** — 곁가지 집합이 없다.
 *
 * ⚠ **카메라는 여기 없다.** 되돌리기가 담아야 하는 것은 문서와 카메라 둘이고
 * 그 조립은 `ui/appSnap.ts`가 한다 — 승격을 되돌릴 때 소실점이 새 것으로 남으면
 * §6.1이 금지한 좌표계가 섞인 상태가 된다.
 *
 * ⚠ **`pts2d`는 바깥 배열만 복사한다.** 규약은 "**교체하고 제자리에서 안 고친다**"이고
 * 코드 전체가 그렇게 쓴다(승격의 `promoteOrder`·스냅의 `applySnapToStart` 둘 다 새 배열을 만든다).
 * 점 배열까지 복사하면 되돌리기 200단계 × 획 × 점이 되고, 그 비용은 규약이 지켜지는 한 낭비다.
 * 바깥 배열을 복사하는 것은 `push`/`splice` 같은 **배열 단위 조작**에 대한 방어다.
 */
export function snapshotDoc(d: DocState): DocState {
  return {
    strokes: d.strokes.map(s => ({ ...s, pts2d: [...s.pts2d],
      seg3d: s.seg3d ? [[...s.seg3d[0]], [...s.seg3d[1]]] as [Vec3, Vec3] : null })),
    views: d.views.map(v => ({ ...v })),
    currentView: d.currentView,
  };
}
