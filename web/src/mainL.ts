// L-B — 단일 뷰포트 UI 엔트리. 계획서 §10.
//
// **옛 `main.ts`를 고치지 않고 새로 짠다**(§10.1) — 좌우 분할·프레임 탭·"여기서 그리기" 토글·
// 점 찍기·고치기·치수 패널이 전부 폐기 대상이라 남는 것이 거의 없었다.
// `canvasFrame`·잉크 캡처·three 씬·`lift.ts`·`vpDetect.ts`·카메라 수학은 그대로 쓴다(§10.2).
//
// **옛 UI는 L-B 게이트 통과 전까지 지우지 않는다**(A-4). `index.html`이 그것이고 여기는 `l.html`이다.
import { InkCanvas } from "./capture/inkCanvas.js";
import { groundSegment, groundEligible } from "./s3d/groundAnchor.js";
import { extensionDir } from "./s3d/extension.js";
// **터치 제스처 → 카메라**(2026-08-17 G). 라우팅은 `InkCanvas`가, 해석은 여기가 한다
import { CamGestures, GESTURE_TOL } from "./capture/camGesture.js";
import { cssSizeOf, deviceRatio } from "./capture/canvasFrame.js";
import { Stage, FREE_FOV_DEG, type StageSeg } from "./ui/stage.js";
import { CamState } from "./ui/camState.js";
import { newDoc, newSStroke, newView, deleteView, lifted, pending, pendingElsewhere, liftable,
         confirmViewOf, isConfirmView,
         type DocState, type SStroke, type Channel } from "./ui/doc.js";
import { takeSnap, applySnap, type AppSnap } from "./ui/appSnap.js";
// L-D.2 저장·내보내기 — **뷰 목록과 뷰별 2D 획**을 담는다(§9.2)
import { serializeDoc2, restoreDoc2, autosaver2, getDoc2, deleteDoc2,
         type Doc2 } from "./ui/docStore.js";
import { toObj, toGltf, download, linesFromDoc } from "./ui/exportGeom.js";
import { setDocSeq, docSeq } from "./ui/doc.js";
import { nearestSeg, PICK_TOL, type PickSeg } from "./ui/pick.js";
import { diffPlacement, diffSummary, type PlacementDiff } from "./s3d/promoteDiff.js";
// **규칙 기반 소실점**(2026-08-16 전면 교체). 검출 초안·가이드·민감도 경로는 전부 빠졌다.
// **상태는 넷뿐이고 차수는 계산한다**(2026-08-17 지시 1) — `perspectiveOrder` 하나를 부른다.
import { classifyLine, snapAxisTable as snapAxisRows, perspectiveOrder, RULE_TOL,
         type RuleEvent, type RLine, type RuleState } from "./s3d/vpRules.js";
// **축 스냅**(사람 지시 1·3) — 그리는 동안 축으로 강제하고, 모호하면 커서가 가른다
import { snapToAxis, screenOrthoSnap, vpDirSnap, SNAP_TOL_AXIS,
         type AxisCand, type ScreenOrtho, type VpDirSnap } from "./s3d/axisSnap.js";
import { liftAll, LIFT_TOL, type LiftStroke, type DeclaredJoint } from "./s3d/lift.js";
import { snapCandidates, staticCandidates, SNAP_ORDER, SNAP_LABEL, SNAP_COLOR, SNAP_ICON, SNAP_TIP,
         SNAP_TOL,
         type SnapCand, type SnapKind, type SnapSeg, type SnapCtx,
         type StaticCand } from "./s3d/snap.js";
// **2D 오스냅**(4차 지시 1) — 카메라 확정 전·미승격 2D 획의 화면 스냅. 후보 규칙은 snap2d.ts 하나다
import { static2dCandidates, snap2dAt, type Snap2Cand, type Snap2Seg } from "./s3d/snap2d.js";
// **확정 전 2D 판정의 단일 출처**(5차 이월-2) — 합성 하네스가 같은 함수를 부른다(#17)
import { resolve2dCore, snap2Refs, OSNAP_RADIUS_PX, type Resolve2dOut } from "./s3d/resolve2d.js";
import { segmentFromAnchor, nearestAxisOnScreen, endFromCursor, LIVE_TOL } from "./s3d/liveLine.js";
import { crossAnchorOf } from "./s3d/crossAnchor.js";
import { anchorToTarget } from "./s3d/liftAnchor.js";
import { onePointFrame, directSegment, planeAnchor, ONE_POINT_TOL } from "./s3d/onePoint.js";
import { judgeDraftPose } from "./s3d/draftPose.js";
import { axisVpsAt, horizonThrough, overlayAxisMarks, type AxisVpAt } from "./s3d/axisVp.js";
import { representative, AXIS_TOL, chordTurnDeg } from "./s3d/axis.js";
// **자동 분할**(지시 I) — 교차·접촉 절단점과 조각. SketchUp 선례. 순수 기하는 split.ts 하나다(#17)
import { cutParams, piecesFromCuts, subtractIntervals, reanchorId, pointAt,
         type Seg3 } from "./s3d/split.js";
import { promoteOrder, type OrderStroke } from "./s3d/promoteOrder.js";
import { ViewCube } from "./ui/viewCube.js";
import { AXIS_COLOR, guides as gridGuides, HORIZON_COLOR, GROUND_COLOR,
         clipToRect } from "./s3d/grid.js";
import { project, axisDirection, groundFrame, sub3, angleBetween,
         rayThrough, closestPoints, norm3,
         type Vec3 } from "./s3d/geom3d.js";
import { lineIntersect, type Pt2 } from "./s3d/camera.js";
import type { PlaceCtx } from "./s3d/stroke.js";
import { viewPlaceCtx, toView, fromView, dirToView, type ViewPose } from "./s3d/viewCamera.js";

// **가이드 조정 도구가 없어졌다** — 끌 가이드가 없다. 선만 그으면 카메라가 선다(사람 지시 1).
// **지우개 둘**(지시 I) — 조각(닿으면 교차점 사이 조각이 통째로) · 부분(지나간 자리만).
type Tool = "draw" | "orbit" | "edit" | "erase_seg" | "erase_part";

const host = document.getElementById("stage")!;
const canvas = document.getElementById("ink") as HTMLCanvasElement;
const barEl = document.getElementById("bar")!;
const statusEl = document.getElementById("status")!;
const viewsEl = document.getElementById("views")!;
const toolsEl = document.getElementById("tools")!;
const sideEl = document.getElementById("side")!;

const stage = new Stage(host);
let doc: DocState = newDoc();
const cam = new CamState(cssSizeOf(canvas));
let tool: Tool = "draw";
let note = "";
/**
 * **마지막 획이 규칙에 어떻게 들어갔는가**(사람 지시 3 — "무엇이 부족한지 알면 사용자가 긋는다").
 * 화면에 그대로 낸다. 추측하지 않고 규칙이 낸 사건을 그대로 보인다(#7).
 */
// (지시 3 — `ruleNote` 상태 줄을 지웠다: 규칙 사건은 화면에 안 낸다)
/**
 * **애매해서 묻고 있는 획**(사람 지시 1 — "애매하면 사용자에게 묻는다. 추정하지 않는다").
 *
 * 답할 때까지 그 획은 **2D로 대기**한다. 답이 오면 그 답을 규칙에 강제로 넣는다.
 * 취소하면 획은 남고 규칙에는 안 들어간다 — **없는 판정을 지어내지 않는다**(A-3).
 */
let ask: { strokeId: string; line: RLine; question: RuleEvent extends never ? never :
           "screen_or_depth" | "second_horizontal_or_vertical"; toH: number; toV: number } | null = null;
/** **모호 물음 카운터**(지시 K) — 실획에서 묻는 빈도의 실측 근거. 저장본에 함께 담긴다. */
const askStats = { asked: 0, screen: 0, depth: 0, vertical: 0, skipped: 0 };
/**
 * **배치 경로 카운터**(6차 지시 2·3 — 실획 측정 "1점 직접 좌표 경로 사용 비율"의 분자·분모).
 * `placeLive`의 축 경로 확정에서만 센다 — 미리보기 프레임은 안 센다(사용 비율이지 호출 수가
 * 아니다). `twoPoint`(양 끝 스냅)는 축 경로 밖이라 따로 센다.
 */
const pathStats = { direct: 0, lift: 0, twoPoint: 0 };
/**
 * **배치를 만든 경로의 카운터**(2026-08-18 10차 항목 1 · 지시 4-6 — "카운터를 경로별로
 * 나눈다. 한 경로만 세면 0이 부재의 증거로 읽힌다. 합이 전체와 맞는지 확인한다").
 * 9차 항목 4-5가 실증한 그 함정의 방어다: 초판 카운터가 경로 하나만 세어 `rejected 0`이
 * "가드가 안 걸렸다"로 읽힐 뻔했다.
 *
 * ```
 * ref_anchor    그린 시점의 연결 기록(snap2dStart/End)이 앵커 — 4-3의 새 경로(#18의 소비자)
 * start_anchor  시작점 3D 오스냅(정밀 대상)
 * two_point     양 끝 스냅(D-L46)
 * end_anchor    끝점 3D 오스냅 — 연결은 어느 끝에서든 좌표를 정한다(4-3)
 * cross_anchor  **교차 앵커**(12차 항목 3-a) — 3D 획의 상을 화면에서 가로지르는 대기 획.
 *               끝점 겨냥 없이 생기는 연결이다(crossAnchor.ts)
 * batch         solveInto → liftAll(접합 성분의 일괄 풀이 — 카메라가 서는 순간)
 * ground        **첫 앵커 — 지면 배치**(13차 항목 2, groundAnchor.ts): 카메라를 세운
 *               수평 평면 축 보조선을 지면에 놓는다. 일괄 풀이가 0이고 3D가 전무할 때만
 * extension     **연장선**(13차 항목 3, extension.ts): 끝점에서 원 선의 방향 그대로 바깥 —
 *               같은 3D 직선 위에 놓인다. 축 밖 방향을 이어 그리는 유일한 수단
 * unanchored    placeUnanchored(D-L77 — D-L83 가드가 기본 차단. 가드를 끈 팔에서만 오른다)
 * ```
 * ⚠ **실행 누계다** — 실행취소·삭제를 되돌리지 않는다. 합=전체 검산은 실행취소 없는
 * 픽스처에서 잰다(`dir_state.json`).
 */
const placeBy = { ref_anchor: 0, start_anchor: 0, two_point: 0, end_anchor: 0,
                  cross_anchor: 0, batch: 0, ground: 0, extension: 0, unanchored: 0 };
/**
 * **교차 앵커의 경로별 진단**(#43 — 12차 3차 리뷰어 [7]). `placeBy.cross_anchor`는 분자이고
 * 여기가 분모·거절 사유다: attempts(연쇄가 검토한 대기 획·회차 누계) = placed +
 * no_crossing + skipped_bend + skipped_axis + rejected_ends + rejected_dir.
 * 원장(dir_state)이 검산한다.
 */
const crossStats = { attempts: 0, placed: 0, no_crossing: 0,
                     skipped_bend: 0, skipped_axis: 0, rejected_ends: 0,
                     /** 방향 가드(아래 CHAIN_DIR_GUARD)가 막은 몫 — 합=attempts에 든다. */
                     rejected_dir: 0 };
/**
 * **확정 후 재계산 가드**(2026-08-19 14차 항목 0). 승격 연쇄·교차 앵커는 **사용자가 안 보는
 * 시점**에 대기 획을 놓는다 — 그 배치의 축 경로는 `pts2d`를 축 투영으로 되쓰는데, 축 스냅은
 * "언제나 어느 축으로 간다"(각도 무제한)라서 그리는 중이라면 미리보기로 보였을 회전이
 * 여기서는 **조용히** 들어간다. 원칙(지시 머리말): 그리는 도중 스냅은 사용자가 보고 받아들인
 * 것이고, 확정 후 재계산은 사용자가 안 본 변경이다.
 *
 * 가드: 되쓰기 전후 현의 선 각도 차(`chordTurnDeg`)가 `LIFT_TOL.parallel_deg`(5° —
 * 나란함 판정 재사용, 새 임계 아님 #17)를 넘으면 놓지 않는다 — 그 획은 **대기**로
 * 남는다(실패가 아니다 §9.1).
 *
 * ⚠⚠ **임계 선택은 리뷰어 두 라운드가 다퉜다**(D-L92의 그 절): 1차는 12°
 * (`LIVE_TOL.axis_deg` — "축으로 인정")를, 2차는 그 교체가 **사용자가 못 본 회전의
 * 허용치를 2.4배 넓힌 것**이라 기각했다. 두 상수 모두 "안 보인 채 얼마나 돌려도 되는가"
 * 라는 이 가드의 물음에 정확히 답하는 등록값이 아니다 — 그 물음의 실측(5~12° 대역의
 * 발생 빈도·체감)은 실획 표본이 판정자다(DEFERRED). 그때까지는 A-3(애매하면 놓지
 * 않는다 — 미배치는 대기라 비용이 낮다)대로 **엄격한 쪽**(나란함 5°)을 쓴다: 임계 안의
 * 되쓰기는 "같은 방향"으로 읽히는 정렬이고, 연장선 발동 판정과 같은 값이다(#17).
 * 그리는 순간의 배치(placeStroke)는 이 가드를 안 지난다 — 미리보기가 같은 것을 보였다.
 *
 * 측정 스위치(#30) — `S2S.setChainDirGuard(false)`가 옛 거동(무제한 회전 배치)이다.
 * 카운터는 경로별·분모와 함께다(#43): attempts = 가드가 검토한 축 경로 배치 시도.
 */
const CHAIN_DIR_GUARD = { on: true };
const chainDirGuardStats = { attempts: 0, rejected: 0 };
/** 떠 있는 커서의 스냅 — **누르기 전에 무엇에 붙을지 보인다**(SketchUp/Rhino 관행, L-B.3). */
let hoverSnap: SnapCand | null = null;
/** 마지막 획이 무엇에 붙었나 — 화면에 사유를 낸다(#7: 추측하지 말고 센다). */
let lastSnapNote = "";
/**
 * **고른 획**(L-D.1, §9.5). `고치기` 도구가 클릭으로 고르고 화살표·`Delete`가 작용한다.
 *
 * §9.5는 두 문장뿐이다 — "'이 획은 저 면 위에 있다' 수준의 지정 경로와, 지우는 경로를 둔다".
 * **면 생성이 범위 밖이므로**(DEFERRED) 지정은 **축 지정**으로 한다.
 * ⚠ 그 둘은 같은 것이 아니다: 면 지정은 획을 **평면에 가두고**, 축 지정은 **방향만** 준다.
 * 축 지정으로 놓이는 것은 §5.4의 일괄 풀이가 그 방향으로 이어지는 구조를 찾을 때뿐이다.
 *
 * 조작은 **SketchUp 그대로**다(A-3) — 화살표가 축이고 `Delete`가 지우기다.
 * 축 키는 그리는 중의 축 고정(L-B.5)과 **같은 배정**을 쓴다(왼쪽=축1 · 오른쪽=축2 · 위=축3).
 */
let picked: string | null = null;
/**
 * **그리는 중의 실시간 판정**(L-B.4, §4). 시작점이 3D에 못박히면 커서 픽셀 하나가
 * 끝점을 정하므로 **확정과 같은 것**을 미리 보여 줄 수 있다 — 계획서 §11 L-B 게이트의
 * "미리보기와 확정의 일치(0)"가 그것을 요구한다.
 */
let live: { anchor: SnapCand; axis: 0 | 1 | 2 | null; deg: number | null;
            seg: [Vec3, Vec3] | null; locked: boolean;
            /** **모호 구간에 들어갔는가**(사람 지시 3-f) — 화면에 짧게 표시한다. */
            ambiguous: boolean; tied: number[];
            /**
             * **끝점이 붙은 대상**(오스냅, D-L46). 있으면 이 획은 **두 점으로 확정된다** —
             * 축이 필요 없고 축 스냅을 **이긴다**(Rhino: 오스냅이 직교 모드를 덮는다).
             */
            end: SnapCand | null;
            /** **연장선이 발동했는가**(13차 항목 3) — 표시(연장 안내선 진해짐)용. */
            ext?: boolean;
} | null = null;
/**
 * **축 고정**(L-B.5, §4). **화살표가 특정 축을 토글한다** — SketchUp 그대로다(A-3).
 * `null`이면 축 스냅에 맡긴다.
 *
 * ⚠ **옛 `"infer"` 모드를 지웠다**(D-L44, 2026-08-16). 그것은 "`Shift`를 누르는 동안
 * **지금 추론된 축**을 잠근다"였는데, **축 스냅이 언제나 도는 지금은 추론이 곧 스냅이라
 * 잠글 것이 없다.** `Shift`의 뜻은 **그 획만 자유**로 바뀌었다(`freeStroke`).
 * 코드에는 그 모드가 죽은 채 남아 있었고 상태 줄이 아직 "Shift 추론 축"이라 적고 있었다 —
 * 화면 안내와 실제가 갈린 자리다.
 */
let axisLock: 0 | 1 | 2 | null = null;
/**
 * **지금 그리는 펜 채널**(2026-08-17 사람 지시 D). **기본은 보조선**이다 — 작도 순서가
 * 그렇기 때문이다: 구축선을 긋고 그 위에 확정선을 덧그린다.
 *
 * ⚠ **자동 판정을 하지 않는다**(D-4). 사용자가 고르고, 나중에 `고치기`로 바꾼다.
 * ⚠ **화면에 보여야 한다**(D-5) — 모르고 그으면 나중에 고쳐야 한다.
 */
let channel: Channel = "guide";

/** 채널의 화면 이름·색. **표시 규약의 단일 출처다**(#17) — 도구 막대·상태 줄·2D 층이 읽는다. */
const CHANNEL_UI: Record<Channel, { name: string; color: string; dash: number[]; alpha: number }> = {
  // E의 네 단계 중 위 둘 — 결과선이 **결과물**이므로 가장 진하다
  // **지시 5-7**: 결과선 검정 가장 진하게 · 보조선 **진한 실선(점선을 쓰지 않는다)** ·
  // 방사선·격자는 아주 연한 무채색(`drawGrid`) · 축 색은 그리는 중 미리보기에만
  result: { name: "결과선", color: "#111111", dash: [], alpha: 1 },
  guide: { name: "보조선", color: "#4a4a4a", dash: [], alpha: 0.9 },
  note: { name: "주석", color: "#2471a3", dash: [], alpha: 0.9 },
};
/**
 * **카메라가 서기 전의 화면 직교 스냅**(2026-08-17 A-2). `live`와 따로 두는 이유는
 * 그것이 **앵커(3D 스냅)를 요구**하기 때문이다 — 여기에는 3D가 아직 없다.
 *
 * ⚠ **카메라가 선 뒤에는 안 돈다.** 그 뒤로는 축 스냅이 방향을 정하고, 화면 가로·세로가
 * 실제로 축인 상태(1점의 가로·모든 차수의 세로)에서는 `axisDirsOf`가 그 방향을
 * 후보로 **이미 낸다**(무한원 축, D-L40). 2점에서 화면 가로는 **축이 아니므로**
 * 거기로 끌어당기면 조용히 틀린 배치가 된다(A-3).
 */
let live2d: { a: Pt2; b: Pt2; ortho: ScreenOrtho | null;
              /** **2D 오스냅**(4차 지시 1) — 양 끝이 다른 2D 획의 끝점·중점·교차점에 붙었는가. */
              start2: Snap2Cand | null; end2: Snap2Cand | null;
              /** **소실점 방향 스냅**(4차 지시 2) — 카메라가 안 서도 그 방향으로 끌린다. */
              vpdir: VpDirSnap | null;
              /** **관계 스냅 가이드**(4차 지시 5-c) — 근원점에서 끌린 자리까지 옅게 뻗는다. */
              guides: { from: Pt2; to: Pt2 }[] } | null = null;
/** 떠 있는 커서의 **2D 스냅**(4차 지시 1) — 3D 후보가 없거나 못 붙을 때의 표식. */
let hover2d: Snap2Cand | null = null;

/**
 * **지금 스냅 가능한 축**(A). 판정은 `vpRules.snapAxisTable` 하나가 하고 여기서는
 * "카메라가 섰는가"만 넘긴다 — 그 답은 `frame()`이다(축 스냅이 실제로 도는 조건과 같다).
 */
const snapAxisTable = () => snapAxisRows(cam.rules, !!frame());

/** 획의 양 끝에 화면 직교 스냅을 건다. **그리는 중과 확정이 같은 함수를 부른다**(#17). */
function orthoOf(pts: Pt2[]): ScreenOrtho | null {
  if (pts.length < 2) return null;
  return screenOrthoSnap(pts[0], pts[pts.length - 1]);
}

/**
 * 화면 직교 스냅이 걸린 획의 **점열**. §1.1대로 **두 점만 남는다** —
 * 축 스냅이 커서 위치를 통째로 버리는 것과 같은 자리다(도구가 기하를 정한다).
 */
const orthoPts = (pts: Pt2[], o: ScreenOrtho | null): Pt2[] =>
  (o ? [pts[0], o.at] : pts);

/**
 * **카메라 확정 전의 확정 경로**(4차 지시 1) — 양 끝을 2D 오스냅에 먼저 붙이고,
 * 끝이 안 붙었을 때만 화면 직교 스냅이 돈다(D-L46 "오스냅이 축 스냅을 이긴다"와 같은 순서).
 * 미리보기(`onLive`의 2D 갈래)와 같은 순서라 보인 대로 놓인다(#17·§11).
 *
 * ⚠ **꺾인 획은 끝점 스냅으로 펴지 않는다**(#34 — `placeLive`의 양 끝 스냅 규약 그대로):
 * 끝을 옮기면 두 점이 직선을 정하므로, 굽음이 `AXIS_TOL.bend_max`를 넘으면 끝 스냅을 버린다.
 * 시작점 스냅은 그대로 둔다 — 점 하나를 옮기는 것은 획을 펴는 것이 아니다.
 */
// ⛔ `snapped2d`는 지워졌다(5차 지시 3) — 확정 경로가 `resolve2d` 결과 전체(방향 스냅 → 강제 축)를 쓴다.

/**
 * **카메라 확정 전의 2D 판정 전부**(4차 지시 1·2·5 통합) — 로직은 `s3d/resolve2d.ts`의
 * `resolve2dCore` 하나다(5차 이월-2, #17: 합성 하네스가 같은 함수를 부른다).
 * 여기서는 앱 상태(대기 획·소실점·조리개·토글)만 채운다.
 *
 * ⚠ **카메라 확정 뒤에도 부른다**(2026-08-18 12차 항목 2) — 3D 오스냅에 시작점이 안 붙은
 * 무앵커 획의 몫이다(`placeStroke`의 대기 가지). `excludeId`는 그 경우의 자기 스냅 방지다 —
 * 확정 경로에서는 획이 이미 문서에 들어가 있어 자기 자신이 대기 후보에 잡힌다.
 */
function resolve2d(raw: Pt2[], excludeId?: string): Resolve2dOut {
  const segs = pend2Segs(excludeId);
  const cands = segs.length ? static2dCandidates(segs, Math.hypot(...cssSize())) : [];
  // 조리개는 표시 px 기준 — 표시 배율을 되돌린다(D-L94 · viewZoomNow 머리말)
  return resolve2dCore(raw, { cands, vps: cam.vps(), radiusPx: OSNAP.radiusPx / viewZoomNow(),
                              // **수선 발의 재료**(9차 항목 2-f) — 질의점에 따라 달라져서
                              // 정적 후보로 못 만든다(3D 판의 `ctx.from`과 같은 자리, #17)
                              segs,
                              kinds: OSNAP.kinds, relSnap: REL_SNAP.on });
}

// ⛔ `dirSnap2d`는 `resolve2dCore` 안으로 옮겨졌다(5차 이월-2 — `dirSnap2dCore`).
/**
 * **축 스냅 — 라이노 직교 모드**(사람 지시 1). 기본은 **켬**이고 토글로 끈다.
 * 객체로 두는 이유는 종단 확인이 `S2S`로 읽고 쓰기 때문이다(#17: 앱 경로 하나).
 */
const AXIS_SNAP = { on: true };
/**
 * **보조선을 내보낼 것인가**(D-3 "제외(옵션)"). 기본은 **끔** — 결과선이 결과물이다.
 * 객체로 두는 이유는 종단 확인이 `S2S`로 읽고 쓰기 때문이다(#17: 앱 경로 하나).
 */
const EXPORT_GUIDES = { on: false };
/**
 * **보조선 표시 토글**(2026-08-17 사람 지시 E). 기본 **켬**이고, **돌리면 자동으로 흐려진다**
 * (그것은 `stage.ts`의 `CHANNEL_3D.guide_orbit`이 한다 — 토글과 다른 축이다).
 *
 * 토글은 **끄는 것**이고 흐림은 **약하게 하는 것**이다. 둘을 한 손잡이로 묶지 않는다:
 * 돌린 채로 보조선을 아예 끄고 싶은 때가 있다.
 */
const SHOW_GUIDES = { on: true };
/** **격자 토글**(지시 5-5). 기본 켬 — 지면 정사각 격자의 투영이다(화면 각도 균등분할 아님). */
const SHOW_GRID = { on: true };
/**
 * **오스냅 설정**(지시 H — 라이노 방식). 반경은 **화면 픽셀**이고 확대·축소와 무관하다
 * (지시문 그대로 — 포인터 정밀도의 문제라 선례도 절대 px: SketchUp/Rhino 조리개 10~15px).
 * 기본 15px — 옛 기본(`SNAP_TOL.radius_ratio` 0.05 = 960×672에서 58.6px)이 "너무 넓다"는
 * 보고의 대응이다. ⚠ **측정 상수는 안 바꾼다**: `SNAP_TOL`은 합성 잉크의 겨냥 오차(비율)를
 * 재는 하네스의 것이고, 여기는 **앱의 조리개**다 — 값을 바꾸면 전역 해시가 움직여 무관한
 * 원장이 STALE이 된다(D-L54의 동결과 같은 자리). 종류별 켜고 끄기도 라이노 그대로다.
 */
/**
 * **관계 스냅 토글**(4차 지시 5-e). 기본 켬 — 다른 선의 끝점·중점과 화면상 같은 x/y에
 * 커서가 오면 그 좌표로 끌리고 가이드가 뜬다(인디자인·일러스트레이터·피그마 관행).
 * 오스냅이 이긴다(지시 5-d). 카메라 확정 전(2D 단계) 전용 — 확정 후에는 축 스냅이 잇는다(5-a).
 */
const REL_SNAP = { on: true };
/** **하단바 접이식 메뉴**(4차 지시 6-a) — 표시·스냅 토글이 접힌다. 기본 접힘. */
const BAR_MENU = { open: false };
const OSNAP = {
  radiusPx: OSNAP_RADIUS_PX,           // 출처는 resolve2d.ts 하나(#17). 값은 그 상수를 읽는다
                                       // (D-L56 신설 → D-L85 개정 — 수를 여기 안 적는다, #47)
  kinds: { vertex: true, endpoint: true, midpoint: true, intersection: true,
           perpendicular: true, extension: true, on_edge: true, on_face: true } as Record<SnapKind, boolean>,
  open: false,                       // 설정 패널이 열려 있는가
};
/**
 * **지우개 크기(화면 px)**(5차 지시 5). 프로크리에이트처럼 좌측 사이드바 슬라이더로 조절한다.
 * 옛 판은 PICK_TOL(대각 비 0.0145 ≈ 21px)을 그대로 써서 너무 컸다. 값은 부분 지우개의
 * 화면 반경이자 조각 지우개의 집기 반경이다. 표시·도구 상수라 test/constants.ts에 안
 * 넣는다(D-L49의 예외와 같은 자리 — 어느 판정도 이 값을 안 읽는다. 원장은 값을 그대로 적는다).
 */
const ERASER = { px: 12, min: 4, max: 60 };
/**
 * **겨냥 거리 프로브의 창(px)**(지시 K · 6차 항목 2). 조리개(`OSNAP.radiusPx`) **밖**까지
 * 보는 진단용 창이다 — 스냅된 사건만 적으면 분포가 조리개에서 절단돼 "반경을 넓혀야
 * 하는가"를 못 답한다(리뷰어 [7]).
 *
 * ⚠ **임계가 아니라 관측창이라 `test/constants.ts`에 안 넣는다**(D-L49·ERASER와 같은 예외):
 * 어떤 판정도 이 값이 안 가른다 — 바꾸면 기록되는 분포의 **상한**만 변한다.
 * 값 40 = 오스냅 반경 입력의 UI 상한(그보다 넓게 물어도 쓸 수 없다).
 * 옛 판은 시작점 프로브 자리에 `40`을 **인라인으로** 적었다 — 끝점 프로브가 생기면서
 * 두 자리가 갈릴 수 있게 되어 이름을 붙였다(#17).
 */
const SNAP_PROBE_PX = 40;
/**
 * **화면 밖 소실점의 가장자리 표식**(6차 지시 7-e). 표시 상수라 `test/constants.ts`에
 * 안 넣는다(D-L49의 예외와 같은 자리 — 어느 판정도 이 값을 안 읽는다).
 */
const VP_EDGE = { padPx: 14, sizePx: 6 };

/** 앱 조리개(px) → 하네스 규약(대각 비). **한 군데서만 환산한다**(#17). */
/**
 * **표시 배율 아래의 유효 조리개**(14차 항목 5 · D-L94): 조리개는 **표시 px** 기준이다
 * (D-L56 — 확대·축소 무관). 스냅 질의는 문서 좌표에서 돌므로 표시 배율 z에서 문서 조리개
 * = radiusPx / z다. 확대하면 문서 기준으로 좁아진다 — 세부를 확대해 정밀하게 겨냥하는
 * 그 용도 그대로다. 궤도 시점(z 미적용)은 1.
 */
const viewZoomNow = () => ((stage.isPinned || !cam.standing()) ? stage.viewZoom : 1);
const osnapCfg = () =>
  ({ radius_ratio: OSNAP.radiusPx / viewZoomNow() / Math.hypot(...cssSize()) });
/** **종류 필터를 지난 최선 후보** — 앱의 모든 스냅 질의가 이것을 지난다(#17). */
function appSnapAt(p: Pt2, segs: SnapSeg[], sc: SnapCtx, pre: StaticCand[]): SnapCand | null {
  return snapCandidates(p, segs, sc, osnapCfg(), pre).find(c => OSNAP.kinds[c.kind]) ?? null;
}

/**
 * **좌표를 정할 자격 — 정밀 대상 다섯**(D-L83, 2026-08-18 9차 항목 4-5 · 10차 항목 0 되살림).
 *
 * `on_edge`·`on_face`는 **표시·미리보기는 그대로 두되 좌표 확정의 자격이 없다** — 선·면 위
 * "어딘가"는 사용자가 겨냥한 점이 아니라 임의 좌표를 만든다(지시 4의 표제
 * "좌표는 연결이 정한다"). `placeUnanchored`(D-L77 궤도 중심 깊이)도 같은 이유로 막는다.
 * 막힌 획은 실패가 아니라 **대기**다(§9.1) — 연결이 잡히면 그때 놓인다(4-3의 연쇄).
 */
const ANCHOR_GRADE_KINDS = new Set<SnapKind>(
  ["vertex", "endpoint", "midpoint", "intersection", "perpendicular"]);
/** 측정 스위치 — `S2S.setAnchorGuard(false)`가 옛 거동이다(#30 — 전후 대조 팔). */
const ANCHOR_GUARD = { on: true };
/**
 * 가드가 막은 횟수 — **경로별로, 분모(시도)와 함께 센다**(9차 4-5′ + 10차 리뷰어 [3]).
 * 초판이 ①만 세어 `rejected = 0`이 "가드가 안 걸렸다"로 오독될 뻔했고, 분모가 없으면
 * 0이 "시도 0"인지 "전부 통과"인지 안 갈린다(#11 — 비율보다 분자/분모).
 * `*_attempts`가 분모다: 시작점은 **후보가 있었던 질의** 수, unanchored는 **분기 진입** 수.
 */
const anchorGuardStats = { start_attempts: 0, start_rejected: 0,
                           unanchored_attempts: 0, unanchored_rejected: 0 };

/**
 * **시작점 앵커 자격 검사**(D-L83 ①). `appSnapAt`이 낸 후보가 정밀 다섯 밖이면 좌표 확정에
 * 쓰지 않는다. 우선순위가 정밀 → on_edge → on_face 순이므로(SNAP_ORDER) 여기서 걸렸다는
 * 것은 조리개 안에 정밀 후보가 **없었다**는 뜻이다 — 대체 후보 탐색은 필요 없다.
 */
function anchorCandAt(p: Pt2, segs: SnapSeg[], sc: SnapCtx, pre: StaticCand[]): SnapCand | null {
  const cand = appSnapAt(p, segs, sc, pre);
  if (cand) anchorGuardStats.start_attempts += 1;
  if (cand && !anchorQualified(cand.kind)) {
    anchorGuardStats.start_rejected += 1;
    return null;
  }
  return cand;
}

/**
 * **자격 판정 하나를 미리보기와 확정이 같이 쓴다**(2026-08-19 14차 항목 0-a · #17).
 *
 * 옛 판은 미리보기(`onLive`)가 `appSnapAt`(자격 검사 없음)으로 앵커를 잡고 확정
 * (`placeStroke`)은 `anchorCandAt`(D-L83 자격 검사)을 지났다 — on_edge·on_face 앵커에서
 * **미리보기는 3D 축 선을 보이는데 확정은 2D 대기로 갔다**("미리보기는 붙는데 확정이
 * 다르다"의 구조적 원인). 카운터를 안 만지는 판정만 뽑아 미리보기가 같은 것을 본다.
 */
const anchorQualified = (k: SnapKind): boolean =>
  !ANCHOR_GUARD.on || ANCHOR_GRADE_KINDS.has(k);

/**
 * **선 표시 네 단계**(E). 위로 갈수록 진하다 — **결과선이 결과물이다.**
 *
 * ```
 * 결과선(3D)          검정, 진하게        `CHANNEL_UI.result` + `stage.CHANNEL_3D.result`
 * 보조선(3D)          회색 파선           `CHANNEL_UI.guide`  + `stage.CHANNEL_3D.guide`
 * 미승격(2D 레이어)    연하게              `drawPending`의 알파
 * 스타일러스 미리보기  **가장 연하게**      아래 값
 * ```
 *
 * ⚠⚠ **옛 판은 순서가 뒤집혀 있었다**(E의 보고): 미리보기가 알파 0.85·굵기 3으로 가장 진했고
 * 확정선은 그보다 흐렸다. **축 색은 미리보기에 붙으므로 연한 톤이어야 한다** —
 * 색이 축을 말하되 "이것이 결과물"이라고 말하면 안 된다.
 */
const PREVIEW_INK = { alpha: 0.4, width: 2, gray: 0.35 };

/** 색을 흰색 쪽으로 섞는다 — 축 색을 남기되 톤을 낮춘다(E). `stage.ts`의 `lerp`와 같은 자리다. */
function paler(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}
/** **그 획만 자유**(수정자). `Shift`를 누르고 있는 동안만 참이다 — 토글과 상황이 다르다. */
let freeStroke = false;
/**
 * **지평선을 끄는 중인가**(D-L45, QUESTIONS g의 답).
 *
 * 사용자는 **그림의 지평선을 올리내린다**고 인식하고 그동안 **카메라 피치가 돈다**
 * (이론서 3.1의 역방향). 그래야 **3점 투시를 처음부터** 그릴 수 있다 —
 * 피치 0에서는 수심 유도가 `null`이라 초기 스케치가 1점·2점뿐이었다(D-L43의 곁가지).
 *
 * **소실점이 서면 잠긴다**(`cam.canSetHorizon()`). 그 뒤에 옮기면 소실점이 자기 지지선에서
 * 떨어지고 그것이 D-L32가 실패한 자리다.
 */
let horizonDrag = false;
// ⛔ **`lockedOrder`를 지웠다**(2026-08-17 지시 1) — 차수는 저장하지 않고 `cam.order()`가
// 계산한다. 표시도 판정도 그 함수를 부른다. 어긋날 자리가 없다.
/** 하네스가 넣은 축 직선(위 `setAxisLines`). **앱은 안 쓴다** — 화면에 가이드가 없다. */
let harnessLines: { axis: 0 | 1 | 2; a: Pt2; b: Pt2 }[] = [];
// **스냅샷 자료구조와 대조는 `ui/appSnap.ts` 하나가 정한다**(#17) — 원장이 같은 함수를 부른다.
const undoStack: AppSnap[] = [];
const UNDO_MAX = 200;

const cssSize = (): [number, number] => cssSizeOf(canvas);

// ⚠ **`report` 자리는 이제 언제나 `null`이다**(7차 지시 3-d — 승격 요약이 없어졌다).
// `appSnap.ts`의 자료구조는 그대로 두어 **옛 저장본이 그대로 열린다**(읽는 쪽이 무시한다).
const appSnap = (): AppSnap => takeSnap(doc, cam, null);

/** 스냅샷을 그대로 되돌린다. **문서만 되돌리지 않는다**(`appSnap.ts` 머리말). */
function restoreSnap(s: AppSnap) {
  doc = applySnap(cam, s);
  const c = cam.ctx();
  // **실행취소는 그림만 되돌린다**(5차 지시 7-2) — 시점(카메라 자세)은 이력이 아니다.
  // 돌려 보던 중이면(비핀) 그대로 둔다. 물려 있던 상태에서만 다시 물린다(f·주점이
  // 되돌아갔을 수 있다). 카메라가 더는 안 서면(확정 자체를 되돌린 경우) 물림을 푼다 —
  // 핀 투영이 낡기 때문이고, 그때 화면은 확정 전 2D 층으로 돌아간다.
  if (c && stage.isPinned) stage.pinTo(c.principal, c.f);
  else if (!c && stage.isPinned) stage.unpin(null);
  syncScene();
}

function pushUndo() {
  undoStack.push(appSnap());
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

// ⛔ **차수 되돌리기·승격 요약을 통째로 지웠다**(2026-08-18 7차 지시 3-d).
//
// `orderMarks` · `markOrder` · `revertToOrder` · `PromoteReport` · `promoteReport` ·
// `autoPromoteOrder` · `relinkSnaps` · `drawPromoteLoss` · `renderPromoteReport` ·
// `N점으로 되돌리기` 버튼이 전부 여기 있었다. **차수 승격 개념이 사라졌으므로**
// (지시 3-d — 3점은 시점의 성질이지 획이 만드는 전이가 아니다) 되돌릴 전이가 없다.
// 남는 되돌리기는 일반 `실행취소` 하나다.
//
// ⚠ **순수 모듈은 남긴다**: `s3d/promoteOrder.ts`·`s3d/promoteDiff.ts`와 그 단위 시험은
// 대상이 사라졌어도 **왜 그 규칙이 있었는지가 근거**이므로 지우지 않고 그렇게 표시한다
// (PITFALLS 머리말의 규약 그대로). 차수 재풀이가 다시 필요해지면 그 자리에서 다시 잇는다.

/**
 * **자동 저장기**(L-D.2). `let`으로 미리 세운다 — `refresh()`가 부르는데 그 함수는 초기화
 * 중에도 불리고, `const`면 TDZ로 터진다(옛 `main.ts`에서 세 번 걸린 자리다).
 */
let saver: ReturnType<typeof autosaver2> | null = null;
let saveNote = "";

// ---------------------------------------------------------------- 스냅 (§3)

/**
 * 스냅 대상 = **3D 레이어 그대로**. 2D 대기 획은 아직 공간에 없으므로 대상이 아니다(§9.1).
 *
 * `toV`가 주어지면 **시점 좌표로 옮겨서** 낸다(L-B.8) — 스냅은 화면 연산이라
 * 카메라가 원점에 있다고 가정하기 때문이다. 확정 시점에서는 항등이다.
 */
const snapSegs = (toV: (p: Vec3) => Vec3 = ID): SnapSeg[] =>
  lifted(doc).map(s => ({ id: s.id, a: toV(s.seg3d![0]), b: toV(s.seg3d![1]) }));

/**
 * 질의 무관 후보 캐시. **교차점이 `O(n²)`이라 포인터가 움직일 때마다 만들면 안 된다** —
 * 대상 100선이면 매 프레임 5천 번의 최근접 계산이다. 기하가 바뀔 때만(=`syncScene`) 버린다.
 */
/**
 * ⚠⚠ **캐시 키는 시점이다**(7차 항목 2 — 실획 첫 표본이 잡은 결함). 후보의 `at`은 질의
 * 시점의 **뷰 좌표**라, 기하가 안 바뀌어도 자세가 바뀌면 좌표계째 낡는다. 옛 판은
 * `syncScene`(기하 변경)에만 무효화해서 궤도·뷰 전환 뒤 첫 획이 **이전 뷰 좌표의 후보**를
 * 현재 카메라로 투영했다 — 끝점·정점·중점·교차점이 전부 엉뚱한 화면 자리로 가고, 캐시
 * 밖에서 매번 계산되는 on_face·선 위·수선 발만 살아남았다("시작 전부 on_face·snapEnd 전무").
 */
let snapPre: { key: string; cands: StaticCand[] } | null = null;
const snapStatic = (segs: SnapSeg[], poseKey: string): StaticCand[] => {
  if (!snapPre || snapPre.key !== poseKey) snapPre = { key: poseKey, cands: staticCandidates(segs) };
  return snapPre.cands;
};

/**
 * **2D 오스냅 대상 — 지금 뷰의 대기 획**(4차 지시 1). 카메라 확정 전에는 이것이 전부이고,
 * 확정 후에도 미승격 획은 계속 후보다(지시 1-b — 승격이 자리를 안 옮기므로 스냅이 이어진다).
 * 주석은 기하가 아니라 제외한다(D-3과 같은 자리). §1.1대로 시작·끝 두 점이 직선이다.
 */
const pend2Segs = (excludeId?: string): Snap2Seg[] =>
  pending(doc).filter(s => liftable(s) && s.pts2d.length >= 2 && s.id !== excludeId)
    .map(s => ({ id: s.id, a: s.pts2d[0], b: s.pts2d[s.pts2d.length - 1] }));

/**
 * **2D 오스냅 질의** — 같은 조리개(`OSNAP.radiusPx`)·같은 종류 토글을 지난다(#17).
 * 대상이 대기 획뿐이라(수십) 캐시 없이 그 자리에서 만든다 — 3D 판의 O(n²) 최근접 계산이 없다.
 */
function snap2At(p: Pt2, excludeId?: string): Snap2Cand | null {
  const segs = pend2Segs(excludeId);
  if (!segs.length) return null;
  return snap2dAt(p, static2dCandidates(segs, Math.hypot(...cssSize())),
                  OSNAP.radiusPx, OSNAP.kinds);
}

// ---------------------------------------------------------------- 시점 틀 (L-B.8, §7)

/**
 * **지금 시점의 배치 문맥과 좌표 변환**(L-B.8 — 궤도 후 계속 그리기).
 *
 * 확정 시점이면 항등이고, 돌린 뒤에는 **세계 ↔ 시점** 변환이 붙는다.
 * 스냅과 실시간 판정은 **화면에서 도는 연산**이라 `project(principal, f)`가 카메라를
 * 원점에 둔 것으로 가정한다 — 그래서 **기하를 시점 좌표로 옮겨 넣고 결과를 세계로 되돌린다.**
 * `snap.ts`·`liveLine.ts`를 **한 줄도 안 고친다**(A-3: 새로 설계하지 않는다).
 *
 * 축 방향은 **시점이 바뀌어도 변하지 않는다**(`viewCamera.ts` 머리말) — 바뀌는 것은 소실점뿐이다.
 */
interface Frame {
  ctx: PlaceCtx;
  /** 세계 → 시점. 확정 시점에서는 항등이다. */
  toV: (p: Vec3) => Vec3;
  /** 시점 → 세계. `toV`의 역이다. */
  fromV: (p: Vec3) => Vec3;
  /** 세계 방향 → 시점 방향(평행이동 없음). */
  dirV: (d: Vec3) => Vec3;
  pinned: boolean;
  /**
   * **이 시점의 정체**(7차 항목 2). 스냅 정적 후보 캐시(`snapPre`)의 키다 — 후보의 `at`은
   * **뷰 좌표**라(snapSegs(fr.toV)) 자세가 바뀌면 좌표계째 낡는다. 옛 판은 기하 변경에만
   * 무효화해서 궤도·뷰 전환 뒤 **첫 획의 끝점·정점·중점·교차점 후보가 이전 뷰 좌표로
   * 투영됐다** — 실획 첫 표본의 "snapEnd 전무·시작 전부 on_face"가 그 자리다(on_face·선 위·
   * 수선 발은 캐시 밖이라 살아남는다 — 낡음이 조용했던 이유).
   */
  poseKey: string;
}

const ID = <T>(x: T) => x;

function frame(): Frame | null {
  // **"확정됐는가"는 계산이다**(지시 1) — 카메라가 서면 그 순간부터 확정이다(옛 `locked` 플래그 폐기).
  const c = cam.ctx();
  if (!c) return null;
  if (stage.isPinned) return { ctx: c, toV: ID, fromV: ID, dirV: ID, pinned: true, poseKey: "pin" };
  const pose = stage.pose();
  if (!pose) return null;
  // **세계 축 방향은 첫 카메라가 정한 것 그대로다.** 새로 추정하지 않는다.
  // ⚠ `c.axisDirs`를 쓴다(6차 지시 2 — D-L40의 회전 판): 무한원 축(1점 확정의 화면평행
  // 축 둘)은 소실점이 없지만 방향은 있고, 돌린 시점에서는 그 축이 깊이축이 된다.
  // 옛 판(vps만)은 그 축들을 돌린 시점에서 잃었다 — 입면 흐름(2-4)의 장애물이었다.
  const axes = c.axisDirs ?? c.vps.map(v => (v ? axisDirection(v, c.principal, c.f) : null));
  return {
    // **자유 시점도 확정 카메라의 렌즈를 이어받는다**(7차 항목 1) — 렌더러(stage)가 실제로
    // 쓰는 내적 파라미터와 같은 값으로 배치 문맥을 세운다(#17). 이어받은 것이 없을 때만 45°다
    ctx: viewPlaceCtx(pose, axes, cssSize(), FREE_FOV_DEG, stage.freeIntrinsics()),
    toV: (p) => toView(pose, p),
    fromV: (p) => fromView(pose, p),
    dirV: (d) => dirToView(pose, d),
    pinned: false,
    // 전체 자릿수로 잇는다 — 감쇠 꼬리의 미세 이동도 다른 시점이다(정확성이 우선.
    // 자세가 멎어 있는 보통의 경우에만 캐시가 맞으면 된다)
    poseKey: [...pose.R[0], ...pose.R[1], ...pose.R[2], ...pose.C].join(","),
  };
}

/**
 * 스냅이 도는 조건: **카메라가 확정됐을 때**. 확정 시점이든 돌린 시점이든 돈다(L-B.8).
 *
 * ⚠ **지면은 확정 시점에서만 낸다.** 돌린 시점의 지면 평면은 시점 좌표로 다시 세워야 하는데
 * `groundFrame`은 소실점에서 세우고 그 소실점은 시점마다 다르다 — **없는 것을 지어내지 않는다**(A-3).
 * 지면 스냅의 화면 거리는 정의상 0이라 성공률 측정에도 못 섞는 종류다(`snap.json`).
 */
function snapCtx(fr: Frame | null = frame(), from: Vec3 | null = null): SnapCtx | null {
  if (!fr) return null;
  const { ctx } = fr;
  return { principal: ctx.principal, f: ctx.f, imgSize: ctx.imgSize,
           // 면 생성이 범위 밖이라 지금 있는 면은 지면 하나다(§3 "면 위 점")
           ground: fr.pinned ? groundFrame(ctx.vps[2] ?? null, ctx.principal, ctx.f) : null,
           // **수선 발은 시작점이 있어야 정해진다**(Rhino `Perp`와 같다) — 끝점을 스냅할 때만 온다
           from };
}

/**
 * **끝점 스냅**(오스냅, D-L46). 그리는 중이든 확정이든 **같은 함수**가 낸다(#17).
 *
 * 시작점 스냅과 다른 점 둘: ① `from`(앵커)을 넘겨 **수선 발**이 성립하게 한다
 * ② **자기 자신은 대상이 아니다**(아직 3D 레이어에 없으므로 자동으로 빠진다).
 * `null`이면 끝점은 커서이고, 그때는 축이 방향을 준다(§3의 원래 경로).
 */
/**
 * **끝점 스냅의 종류 필터**(D-L46). ⚠⚠ **끝점 스냅은 "정확한" 대상만 쓴다**(라이노 기본값
 * 그대로, A-3). 라이노에서 **Near(근처점)는 기본이 꺼져 있다** — 선 근처 어디서나 걸려 너무
 * 잘 잡히기 때문이다. 여기서도 같은 일이 실제로 났다: 모서리를 따라 그으면 `on_edge`가
 * **언제나** 걸려 모든 획이 두 점 배치가 됐다(종단 확인이 잡았다). 시작점 스냅은 종전대로
 * 전부 쓴다 — 그 경로의 측정(`snap.json`)이 그 목록 위에 있다.
 *
 * **질의와 프로브가 같은 필터를 쓴다**(#17, 6차 항목 2) — 갈리면 프로브가 다른 것을 재고
 * "반경이 좁은가"를 못 답한다.
 */
const endSnapKindOk = (c: SnapCand): boolean =>
  OSNAP.kinds[c.kind] && c.kind !== "on_edge" && c.kind !== "on_face";

/** **앵커 자신에 붙는 것은 선분이 아니다** — 길이 0을 만들지 않는다. */
const notAnchor = (c: SnapCand, anchorAt: Vec3): boolean =>
  Math.hypot(c.at[0] - anchorAt[0], c.at[1] - anchorAt[1], c.at[2] - anchorAt[2]) > 1e-9;

function endSnapAt(fr: Frame, anchorAt: Vec3, p: Pt2): SnapCand | null {
  const sc = snapCtx(fr, anchorAt);
  if (!sc) return null;
  const segs = snapSegs(fr.toV);
  const cand = snapCandidates(p, segs, sc, osnapCfg(), snapStatic(segs, fr.poseKey))
    .find(c => endSnapKindOk(c) && notAnchor(c, anchorAt)) ?? null;
  return cand;
}

/**
 * **끝점 겨냥 거리(px) — 조리개 밖까지 보는 프로브**(6차 항목 2-b). `snapEndDistPx`의 출처다.
 *
 * 스냅된 사건만 적으면 분포가 조리개에서 절단돼 "반경을 넓혀야 하는가"를 영영 못 답한다 —
 * 시작점 프로브(지시 K·리뷰어 [7])와 **같은 논리·같은 창(`SNAP_PROBE_PX`)**이다.
 * 후보가 하나도 없으면 `null`이고 그때는 **반경이 아니라 대상이 없는 것**이다.
 */
function endSnapProbe(fr: Frame, anchorAt: Vec3, p: Pt2): number | null {
  const sc = snapCtx(fr, anchorAt);
  if (!sc) return null;
  const segs = snapSegs(fr.toV);
  if (!segs.length) return null;
  const c = snapCandidates(p, segs, sc,
                           { radius_ratio: SNAP_PROBE_PX / Math.hypot(...cssSize()) },
                           snapStatic(segs, fr.poseKey))
    .find(x => endSnapKindOk(x) && notAnchor(x, anchorAt));
  return c ? c.dist : null;
}

/** 끝점 스냅을 시도하고 **겨냥 거리를 함께 남긴다**(항목 2). 확정 경로만 부른다. */
function endSnapRecord(st: SStroke, fr: Frame, anchorAt: Vec3, p: Pt2): SnapCand | null {
  const cand = endSnapAt(fr, anchorAt, p);
  st.snapEndDistPx = cand ? cand.dist : endSnapProbe(fr, anchorAt, p);
  return cand;
}

/**
 * **시작점의 겨냥 거리(px)**(지시 K · 7차 항목 2가 정의를 수리했다) — 40px 프로브 안에서
 * **가장 가까운 정밀 대상**(on_face 제외)까지의 화면 거리. 없으면 `null`.
 *
 * ⚠ 옛 판의 두 결함: ① 스냅이 걸리면 `cand.dist`를 그대로 적었는데 핀 상태에서는 on_face가
 * 항상 걸리므로 **전부 정의상 0**이 됐다(#3·#5 — 지표가 정의의 귀결을 쟀다. 실획 첫 표본의
 * snapDistPx 전부 0이 그것이고, "반경이 좁은가"를 영영 못 답했다). ② 프로브가 우선순위
 * 첫 후보를 집어 **더 가까운 낮은 순위 대상**(중점 등)을 지나쳤다 — 겨냥 거리는 최근접이다.
 * 스냅 성패와 무관하게 **이 정의 하나로** 적는다(#17). 프로브 점은 스냅 전 원시 시작점이다.
 */
function aimDistPx(p: Pt2, segs: SnapSeg[], sc: SnapCtx, pre: StaticCand[]): number | null {
  let best: number | null = null;
  for (const c of snapCandidates(p, segs, sc, { radius_ratio: 40 / Math.hypot(...cssSize()) }, pre)) {
    if (!OSNAP.kinds[c.kind] || c.kind === "on_face") continue;
    if (best == null || c.dist < best) best = c.dist;
  }
  return best;
}

/** 끝점 스냅을 획에 적는다 — 시작점 판(`applySnapToStart`)과 같은 규약이다(#34). */
function applySnapToEnd(st: SStroke, cand: SnapCand, atWorld: Vec3 = cand.at): void {
  st.snapEnd = { kind: cand.kind, at: atWorld, ofId: cand.ofId };
  st.pts2d = [...st.pts2d.slice(0, st.pts2d.length - 1), [cand.screen[0], cand.screen[1]]];
}

/**
 * **화면에서 시작점을 대상의 상으로 옮기는 것이 곧 3D 확정이다.**
 *
 * 올라간 기하는 되쏘면 정확히 그 화면 점으로 돌아오므로(`lift.ts`의 `segGap = 0` 보장)
 * "3D 대상에 붙인다"와 "그 대상의 상으로 화면 점을 옮긴다"가 **같은 연산**이다.
 * 그래서 솔버를 바꾸지 않고 `pts2d[0]`만 옮기면 된다 — 새로 설계한 것이 없다(A-3).
 */
/**
 * ⚠ **이 항등은 그 카메라에서만 성립한다**(리뷰어 [12b]). 차수 승격(§6.1)은 `pts2d`를 보존해
 * **전부 처음부터 다시 올리는데**, 여기서 옮겨 놓은 `pts2d[0]`은 **옛 카메라가 만든 대상의
 * 상**이라 새 카메라에서는 그 대상의 상이 다른 자리다. `snapStart.ofId`를 새 카메라로 **다시
 * 풀지 않으면 스냅이 조용히 풀린다.** L-C에서 처리한다(`DEFERRED.md`).
 */
function applySnapToStart(st: SStroke, cand: SnapCand, atWorld: Vec3 = cand.at): void {
  // ⚠ **`at`은 세계 좌표로 적는다.** 돌린 시점에서는 `cand.at`이 **시점 좌표**다(L-B.8) —
  // 그대로 넣으면 뷰를 바꿀 때마다 같은 획의 `snapStart`가 다른 점을 가리킨다.
  st.snapStart = { kind: cand.kind, at: atWorld, ofId: cand.ofId };
  // ⚠ `snapDistPx`는 여기서 안 적는다(7차 항목 2) — `cand.dist`는 on_face에서 정의상 0이라
  // 겨냥 거리가 아니다(#3·#5). 호출부가 스냅 **전** 원시 시작점으로 `aimDistPx`를 적는다(#17)
  st.pts2d = [[cand.screen[0], cand.screen[1]], ...st.pts2d.slice(1)];
}

/**
 * **승격 연쇄**(§9.1). 새 획이 놓이면 대기 획들의 시작점이 그것에 붙을 수 있다.
 *
 * ⚠ **일괄 재풀이가 아니다.** `promote.json`이 그 경로의 회수율을 **0/1904**로 쟀다 —
 * 대기 사유가 `축이 미분류다`라서 같이 푸나 따로 푸나 같기 때문이다. 회수하는 것은 **앵커**다.
 * **연쇄한다** — 이번에 놓인 것이 다음 획의 대상이 되므로 더 안 늘 때까지 돈다.
 */
/**
 * **연쇄의 회차별 기록**(L-D.3). 합계만 내면 "여러 회 돌았는가"가 안 보인다 —
 * L-B 게이트 3번이 요구하는 것이 그것이다. 마지막 호출분만 들고 있다.
 * ⚠ **상한(8)에 닿았는지도 남긴다** — 닿았다면 수렴한 것이 아니라 잘린 것이다(#32).
 */
const chainTrace: { pass: number; waiting: number; placed: number }[] = [];

/**
 * **그린 시점의 연결 기록을 3D 앵커로 되푼다**(10차 항목 1 · 지시 4-3 — #18의 소비자).
 *
 * `snap2dStart`/`snap2dEnd`는 그 획이 **무엇에 붙었는지**(ofId)와 **어디서**(화면 점)를
 * 안다. 대상이 3D로 올라와 있으면 연결점의 광선과 대상 3D 직선의 최근접점이 앵커다 —
 * 새 솔버가 아니라 `closestPoints` 그대로다(#17). **재탐색(오스냅)보다 앞선다**:
 * 기록은 사용자의 실제 손짓이고, 재탐색은 다른 더 가까운 후보를 집을 수 있다.
 *
 * ⚠ 대상 **선분 안**(연장 규약 `extend_ratio`)의 연결만 받는다 — 직선은 무한이라
 * 선분 밖 최근접점은 연결이 아니다. ⚠ 정밀 다섯 밖의 kind는 가드 규약대로 버린다(D-L83).
 */
function refAnchorOf(st: SStroke, fr: Frame)
: { atV: Vec3; end: boolean; kind: SnapKind; ofId: string } | null {
  const refs = [{ ref: st.snap2dStart, end: false }, { ref: st.snap2dEnd, end: true }];
  for (const { ref, end } of refs) {
    if (!ref || !ref.ofId) continue;
    if (ANCHOR_GUARD.on && !ANCHOR_GRADE_KINDS.has(ref.kind)) continue;
    const target = doc.strokes.find(x => x.id === ref.ofId);
    if (!target || !target.seg3d) continue;
    const A = fr.toV(target.seg3d[0]), B = fr.toV(target.seg3d[1]);
    const e = sub3(B, A);
    const L = norm3(e);
    if (L < 1e-9) continue;
    const r = rayThrough(ref.at, fr.ctx.principal, fr.ctx.f);
    const c = closestPoints([0, 0, 0], r, A, e);
    if (c.parallel || !Number.isFinite(c.s)) continue;
    if (c.s < -SNAP_TOL.extend_ratio * L || c.s > (1 + SNAP_TOL.extend_ratio) * L) continue;
    // 화면 검증 — 연결점의 상이 그 자리로 돌아오는가(다른 뷰 좌표가 섞였으면 여기서 떨어진다)
    const p = project(c.q, fr.ctx.principal, fr.ctx.f);
    if (!p || Math.hypot(p[0] - ref.at[0], p[1] - ref.at[1]) > OSNAP.radiusPx) continue;
    return { atV: c.q, end, kind: ref.kind, ofId: ref.ofId };
  }
  return null;
}

/**
 * **어느 끝이든 앵커가 될 수 있다**(4-3 — 연결이 좌표를 정한다). `placeLive`는 시작점
 * 앵커만 알므로, 끝 앵커는 점열을 **뒤집어 풀고 되뒤집는다** — 축·기하 판정은 방향에
 * 대칭이라(소실점·직교) 같은 답이 나온다. 사용자의 획 방향(`pts2d` 순서)은 보존된다.
 */
function placeAnchored(st: SStroke, fr: Frame, atV: Vec3, atEnd: boolean,
                       dirGuard = false): boolean {
  if (!atEnd) return !!placeLive(st, fr, atV, null, dirGuard);
  st.pts2d = [...st.pts2d].reverse();
  const ok = !!placeLive(st, fr, atV, null, dirGuard);
  st.pts2d = [...st.pts2d].reverse();
  if (ok && st.seg3d) st.seg3d = [st.seg3d[1], st.seg3d[0]];
  return ok;
}

/**
 * **연쇄 확장의 측정 스위치**(#30 · 10차 리뷰어 2차 [9]) — `false`면 옛 연쇄(시작점
 * 오스냅만)다. `setAnchorGuard`와 같은 자리의 결정: 옛 거동을 토글로 되살릴 수 있어야
 * "새 경로가 아니면 안 올라간다"가 코드 독해가 아니라 **측정**이 된다. 앱에서 안 끈다.
 */
const CHAIN_EXT = { on: true };

function promoteChain(fr: Frame): number {
  let total = 0;
  chainTrace.length = 0;
  for (let pass = 0; pass < 8; pass++) {
    // **대기 획의 소유자는 지금 뷰다**(§9.2) — 다른 뷰의 `pts2d`는 다른 화면 좌표라
    // 이 시점의 스냅에 넣으면 엉뚱한 자리에 붙는다
    const waiting = pending(doc, doc.currentView);
    if (!waiting.length) break;
    const segs = snapSegs(fr.toV);
    if (!segs.length) break;
    const sc = snapCtx(fr);
    if (!sc) break;
    const pre = staticCandidates(segs);
    let n = 0;
    for (const st of waiting) {
      if (!liftable(st)) continue;               // **주석은 승격 연쇄에도 안 들어간다**(D-3)
      // ① **그린 시점의 연결 기록이 먼저다**(4-3 · #18) — 기록된 손짓이 재탐색을 이긴다
      const ref = CHAIN_EXT.on ? refAnchorOf(st, fr) : null;
      if (ref) {
        if (placeAnchored(st, fr, ref.atV, ref.end, true)) {
          const world = { kind: ref.kind, at: fr.fromV(ref.atV), ofId: ref.ofId };
          if (ref.end) st.snapEnd = world; else st.snapStart = world;
          n += 1; placeBy.ref_anchor += 1;
        }
        continue;
      }
      const aim0: Pt2 = [st.pts2d[0][0], st.pts2d[0][1]];   // 스냅 전 원시 시작점(겨냥 거리용)
      // ② **시작점 오스냅** — 연쇄도 같은 자격 검사를 지난다(D-L83 ① — 두 호출부 중 하나)
      const cand = anchorCandAt(st.pts2d[0], segs, sc, pre);
      if (cand) {
        // **가드 거절 시 되물릴 스냅샷**(14차 항목 0) — 아래 applySnapTo*가 좌표·기록을
        // 먼저 옮기는데, 방향 가드가 배치를 막으면 그 절반 변경도 남기지 않는다(그은 그대로).
        const keep = { pts: st.pts2d.map(q => [q[0], q[1]] as Pt2),
                       snapStart: st.snapStart, snapEnd: st.snapEnd,
                       snapDistPx: st.snapDistPx };
        applySnapToStart(st, cand, fr.fromV(cand.at));
        st.snapDistPx = aimDistPx(aim0, segs, sc, pre);     // 정의 하나(#17 — aimDistPx 머리말)
        // **대기 획도 양 끝 스냅으로 올라갈 수 있다**(D-L46) — 축이 없어도 두 점이면 놓인다
        const endCand = endSnapRecord(st, fr, cand.at, st.pts2d[st.pts2d.length - 1]);
        if (endCand) applySnapToEnd(st, endCand, fr.fromV(endCand.at));
        {
          const rej0 = chainDirGuardStats.rejected;
          const path = placeLive(st, fr, cand.at, endCand, true);
          // **연장선도 연쇄의 연결 수단이다**(지시 3-c — 대기 중인 선을 확정하는 데 쓰인다)
          if (path) { n += 1; placeBy[path === "axis" ? "start_anchor" : path] += 1; }
          else if (chainDirGuardStats.rejected > rej0) {
            st.pts2d = keep.pts;
            st.snapStart = keep.snapStart; st.snapEnd = keep.snapEnd;
            st.snapDistPx = keep.snapDistPx;
          }
        }
        continue;
      }
      // ③ **끝점 오스냅** — 연결은 어느 끝에서든 좌표를 정한다(4-3). 시작점과 같은 자격
      // 검사를 지난다. 옛 코드는 시작점만 봐서 **끝으로 이어진 획이 영영 안 올라갔다**.
      const ec = CHAIN_EXT.on
        ? anchorCandAt(st.pts2d[st.pts2d.length - 1], segs, sc, pre) : null;
      if (ec) {
        if (placeAnchored(st, fr, ec.at, true, true)) {
          st.snapEnd = { kind: ec.kind, at: fr.fromV(ec.at), ofId: ec.ofId };
          n += 1; placeBy.end_anchor += 1;
        }
        if (st.seg3d) continue;
      }
      // ④ **교차 앵커**(12차 항목 3-a — 지시: "교차로도 연결이 잡혀야 한다").
      // 끝점이 아무것도 못 겨냥한 획도 3D 획의 상을 **가로지르면** 그 교차가 연결이다 —
      // 교차는 두 직선이 정하는 한 점이라 D-L83이 배제한 미끄러지는 대상(on_edge)이
      // 아니다(crossAnchor.ts 머리말). 축이 분류돼 있어야 한다(A-3: 애매하면 놓지 않는다) —
      // 화면 축·미분류는 건너뛴다(수직/수평 화면 축의 방향 선택이 남는 모호 — DEFERRED).
      // ⚠ **카운터는 경로별 + 분모다**(#43 — 3차 리뷰어 [7]: placeBy 0이 "가로지른 획이
      // 없었다"인지 "거절됐다"인지 안 갈린다). crossStats가 사유별로 센다.
      if (CHAIN_EXT.on && !st.seg3d) {
        crossStats.attempts += 1;
        const rep = representative(st.pts2d);
        const ax = st.userAxis ? st.axis : cam.axisOf(st.pts2d).axis;
        const dirs = axisDirs(fr.ctx);
        if (!rep || rep.bend > AXIS_TOL.bend_max) crossStats.skipped_bend += 1;
        else if (!(typeof ax === "number" && dirs[ax])) crossStats.skipped_axis += 1;
        else {
          const hit = crossAnchorOf(rep.a, rep.b, segs, fr.ctx, OSNAP.radiusPx);
          if (!hit) crossStats.no_crossing += 1;
          else {
            const e1 = endFromCursor(hit.atV, dirs[ax], st.pts2d[0], fr.ctx);
            const e2 = endFromCursor(hit.atV, dirs[ax],
                                     st.pts2d[st.pts2d.length - 1], fr.ctx);
            if (e1 && e2 && norm3(sub3(e2, e1)) > 1e-9) {
              const p0 = project(e1, fr.ctx.principal, fr.ctx.f);
              const p1 = project(e2, fr.ctx.principal, fr.ctx.f);
              // **확정 후 재계산 가드**(14차 항목 0 — CHAIN_DIR_GUARD 머리말). 여기의 축은
              // 분류(`cam.axisOf` — angleWiden·rank_margin 완화 포함)가 골랐고, 되쓰기는
              // 그 **라벨 판정이 형태를 바꾸는** 유일한 자리였다(지시 0-b). 되쓰기 회전이
              // 나란함 임계를 넘으면 놓지 않는다 — 라벨은 기하를 안 바꾼다.
              const turn = p0 && p1
                ? chordTurnDeg(rep.a, rep.b, [p0[0], p0[1]], [p1[0], p1[1]]) : null;
              if (CHAIN_DIR_GUARD.on && turn != null && turn > LIFT_TOL.parallel_deg) {
                crossStats.rejected_dir += 1;
              } else {
                st.axis = ax;
                st.seg3d = [fr.fromV(e1), fr.fromV(e2)];
                // **확정된 방향이 pts2d에 남는다**(D-L71 — 앵커 경로와 같은 규약, #17)
                if (p0 && p1) st.pts2d = [[p0[0], p0[1]], [p1[0], p1[1]]];
                n += 1; placeBy.cross_anchor += 1; crossStats.placed += 1;
              }
            } else crossStats.rejected_ends += 1;
          }
        }
      }
    }
    chainTrace.push({ pass: pass + 1, waiting: waiting.length, placed: n });
    total += n;
    if (!n) break;                     // 더 안 는다 — 연쇄가 멎었다
    snapPre = null;                    // 기하가 늘었다
  }
  if (total) lastSnapNote += ` · **승격 연쇄로 ${total}획이 더 올라갔습니다**`;
  return total;
}

/** 축 방향들 — 소실점이 없는 축은 `null`. 실시간 판정과 확정이 **같은 것을 쓴다**(#17). */
const axisDirs = (c: PlaceCtx) =>
  // **무한원 축의 방향도 함께 온다**(D-L40) — 소실점이 없다고 축이 없는 것이 아니다
  c.axisDirs ?? c.vps.map(v => (v ? axisDirection(v, c.principal, c.f) : null));

/**
 * **실시간 판정 = 확정 판정**(L-B.4). 앵커·시작 화면점·끝 화면점만 주면 같은 답이 나온다 —
 * 미리보기와 확정이 어긋날 여지가 **구조적으로 없다**(§11 게이트의 "일치 0").
 */
function resolveLive(c: PlaceCtx, at: Vec3, a2: Pt2, b2: Pt2, end: SnapCand | null = null,
                     extD: Vec3 | null = null) {
  const dirs = axisDirs(c);

  // ---- **오스냅이 축 스냅을 이긴다**(D-L46, Rhino 선례: 오스냅이 직교 모드를 덮는다).
  // 양 끝이 지정되면 **추론할 것이 없다** — 두 점이 선분을 정한다. 축을 벗어난 선(면 위 사선·
  // 자유 세그먼트)이 이 경로로 놓인다. 각도는 **표시용**으로만 낸다(축을 붙이지 않는다).
  if (end) {
    const near = nearestAxisOnScreen(at, dirs, a2, b2, c);
    // **라벨은 기하를 안 바꾼다**(아래 `placeLive` 머리말).
    //
    // ⚠⚠ **화면 판정(`cam.axisOf`)을 쓰면 안 된다** — 그것은 **확정 뷰의 소실점**으로 재므로
    // 돌린 시점에서는 다른 화면 좌표를 그 소실점에 대는 것이 된다(종단 확인이 잡았다:
    // 돌린 뷰의 획이 전부 미분류가 됐다). **3D 방향을 이 시점의 축 방향과 견준다** —
    // 임계는 새로 만들지 않고 `LIFT_TOL.parallel_deg`(나란함 판정)를 그대로 쓴다(#17).
    const dir = sub3(end.at, at);
    let lab: 0 | 1 | 2 | null = null;
    for (const i of [0, 1, 2] as const) {
      const d = dirs[i];
      if (!d) continue;
      const deg = angleBetween(dir, d);
      if (Math.min(deg, 180 - deg) <= LIFT_TOL.parallel_deg) { lab = i; break; }
    }
    return { axis: lab, deg: near?.deg ?? null,
             seg: [at, end.at] as [Vec3, Vec3],
             locked: false, ambiguous: false, tied: [] as number[], why: "", twoPoint: true };
  }
  // ---- **연장선 스냅**(13차 항목 3 · extension.ts) — 시작 앵커의 원 선 방향으로 놓는다.
  // 우선순위(지시 3-f): 양 끝 스냅(위 — 두 점이 기하를 정한다) 다음 · 축 스냅(아래)보다 앞.
  // 축이 아닌 방향(면 위 사선·자유 세그먼트)을 이어 그리는 유일한 수단이다(3-b).
  // 발동 판정은 호출부(extensionOf)가 했고 여기는 기하만 낸다 — 라벨은 기하를 안 바꾼다
  // (양 끝 스냅 갈래와 같은 규약 · 임계는 LIFT_TOL.parallel_deg 재사용 #17).
  if (extD) {
    const eEnd = endFromCursor(at, extD, b2, c);
    if (eEnd && norm3(sub3(eEnd, at)) > 1e-9) {
      let lab: 0 | 1 | 2 | null = null;
      for (const i of [0, 1, 2] as const) {
        const d = dirs[i];
        if (!d) continue;
        const deg = angleBetween(extD, d);
        if (Math.min(deg, 180 - deg) <= LIFT_TOL.parallel_deg) { lab = i; break; }
      }
      return { axis: lab, deg: null, seg: [at, eEnd] as [Vec3, Vec3], locked: false,
               ambiguous: false, tied: [] as number[], twoPoint: false, extension: true,
               why: "" };
    }
  }
  // **고정은 여기 안에 있어야 한다**(#17) — 바깥에서 덮으면 미리보기와 확정이 갈린다
  const forced = lockedAxis();
  const use = forced != null && dirs[forced] ? forced : null;

  // ---- **자유 획**(수정자). 축으로 강제하지 않으므로 방향이 없고 **2D로 대기**한다.
  // 양 끝이 오스냅으로 확정되면 축 밖 선도 3D가 나온다 — 그것이 다음 단계다(사람 지시 6).
  if (use == null && !axisSnapOn()) {
    const near = nearestAxisOnScreen(at, dirs, a2, b2, c);
    return { axis: null, deg: near?.deg ?? null, seg: null, locked: false, ambiguous: false,
             tied: [] as number[], twoPoint: false,
             why: freeStroke ? "자유 획(수정자)" : "축 스냅이 꺼져 있습니다" };
  }

  // ---- **축 스냅**(사람 지시 1). 각도로 거르지 않는다 — 언제나 어느 축으로 간다.
  // 모호 구간이면 **커서에 가까운 쪽**이 이긴다(사람 지시 3).
  const ch = snapToAxis(at, dirs, a2, b2, c);
  const ax = (use ?? ch.pick?.axis ?? null);
  if (ax == null) {
    return { axis: null, deg: null, seg: null, locked: false, ambiguous: false,
             tied: [] as number[], twoPoint: false, why: "축 후보가 없습니다" };
  }
  const cand = ch.tied.find((t: AxisCand) => t.axis === ax) ?? ch.pick;
  // **1점 직접 좌표**(6차 지시 2) — 시점 축이 정확히 화면 정렬이면(onePointFrame) 축 스냅
  // 획은 카메라 투영(광선-직선 최근점)을 거치지 않고 화면 좌표에서 3D가 바로 나온다.
  // 판정·미리보기·확정이 전부 이 한 자리를 지난다(#17). 실패하면 lift 경로 그대로다.
  const opf = onePointFrame(dirs);
  const direct = opf ? directSegment(opf, ax, at, b2, c) : null;
  // **고정 축은 후보 밖일 수 있다** — 그때는 그 축으로 직접 푼다(같은 함수다)
  const seg = direct
    ?? (cand && cand.axis === ax ? cand.seg : segmentFromAnchor(at, dirs[ax], b2, c));
  const deg = cand && cand.axis === ax ? cand.deg : null;
  const tied = ch.tied.map((t: AxisCand) => t.axis);
  return seg
    ? { axis: ax, deg, seg, locked: use != null, ambiguous: ch.ambiguous && use == null,
        tied, twoPoint: false, why: "", path: direct ? "direct" as const : "lift" as const }
    : { axis: ax, deg, seg: null, locked: use != null, ambiguous: false, tied, twoPoint: false,
        why: "끝점이 정해지지 않습니다" };
}

/**
 * 지금 잠긴 축. **화살표가 축을 직접 고른다**(SketchUp 그대로).
 *
 * ⚠ **`Shift`는 여기 없다**(D-L44) — 그 키는 축을 잠그는 것이 아니라 **그 획만 자유**로
 * 푸는 수정자다(`freeStroke`, 라이노 직교 모드의 수정자와 같은 자리, A-3).
 */
function lockedAxis(): 0 | 1 | 2 | null {
  return axisLock;
}

/**
 * **축 스냅이 지금 도는가**(사람 지시 1). 토글(기본 켬)과 수정자(그 획만) 둘이 있다 —
 * 상황이 다르다: 토글은 라이노 직교 모드처럼 켜고 끄는 것이고, 수정자는 한 획만 푼다.
 */
const axisSnapOn = () => AXIS_SNAP.on && !freeStroke;

/**
 * **연장선 발동 판정**(13차 항목 3 — extension.ts 머리말). 시작 앵커가 어느 3D 획의
 * 끝점·정점이고 현이 그 선의 바깥 연장 방향 임계 안이면 그 방향(뷰 좌표)을 낸다.
 * 토글(`OSNAP.kinds.extension`)이 꺼져 있으면 안 돈다(지시 3-g). 양 끝이 다 후보고
 * 시작점 스냅이 이미 가까운 끝을 골랐다(지시 3-e — cand.at에서 가까운 쪽이 발동 끝).
 */
function extensionOf(cand: { kind: SnapKind; at: Vec3; ofId?: string } | null,
                     fr: Frame, a2: Pt2, b2: Pt2, selfId?: string): Vec3 | null {
  if (!cand || !OSNAP.kinds.extension) return null;
  if (cand.kind !== "endpoint" && cand.kind !== "vertex") return null;
  if (!cand.ofId || cand.ofId === selfId) return null;
  const st2 = doc.strokes.find(x => x.id === cand.ofId);
  if (!st2?.seg3d) return null;
  const A = fr.toV(st2.seg3d[0]), B = fr.toV(st2.seg3d[1]);
  const dA = norm3(sub3(cand.at, A)), dB = norm3(sub3(cand.at, B));
  const [endV, otherV] = dA <= dB ? [A, B] : [B, A];
  return extensionDir(endV, otherV, a2, b2, fr.ctx);
}

/**
 * 스냅된 시작점 + 축 → 그 자리에서 3D 확정(§3 마지막 문단 · §7).
 * 축이 안 정해지면 `false`이고 그 획은 2D로 **대기**한다(§9.1).
 * 반환은 놓은 **경로 이름**이다(false = 대기) — 호출부가 placeBy를 경로별로 센다(#43).
 */
function placeLive(st: SStroke, fr: Frame, atV: Vec3, end: SnapCand | null = null,
                   dirGuard = false)
: false | "two_point" | "extension" | "axis" {
  // ⚠⚠ **꺾인 획은 두 점으로 놓지 않는다**(리뷰어 지적, 2026-08-16).
  //
  // 양 끝 스냅은 **축을 우회하는 경로**라, 축 판정이 걸러 주던 "한 획에 방향이 둘"이
  // 그냥 통과한다 — 그러면 꺾인 획이 **조용히 직선으로** 놓인다(Quick,Draw 낙서의 67.7%가
  // 그 종류다, AS-6). 굽음 임계는 **축 경로가 쓰던 것 그대로**다(`AXIS_TOL.bend_max`, #17).
  // **애매하면 놓지 않는다**(A-3) — 그 획은 2D로 대기한다.
  if (end) {
    const rep0 = representative(st.pts2d);
    if (!rep0 || rep0.bend > AXIS_TOL.bend_max) {
      lastSnapNote = `양 끝이 붙었지만 **획이 꺾여 있습니다**`
                   + ` <span class="dim">(굽음 ${rep0 ? rep0.bend.toFixed(3) : "?"} > `
                   + `${AXIS_TOL.bend_max}) — **2D로 대기**합니다</span>`;
      return false;
    }
  }
  // **연장선**(13차 항목 3) — 시작 앵커(snapStart)가 끝점·정점이고 현이 그 선의 연장
  // 방향이면 원 선의 3D 직선 위에 놓는다. 미리보기(onLive)와 같은 판정을 지난다(#17).
  const extD = (!end && st.snapStart)
    ? extensionOf({ kind: st.snapStart.kind as SnapKind, at: fr.toV(st.snapStart.at),
                    ofId: st.snapStart.ofId },
                  fr, st.pts2d[0], st.pts2d[st.pts2d.length - 1], st.id)
    : null;
  const r = resolveLive(fr.ctx, atV, st.pts2d[0], st.pts2d[st.pts2d.length - 1], end, extD);
  const rExt = (r as { extension?: boolean }).extension === true;
  if (!r.seg || (r.axis == null && !r.twoPoint && !rExt)) {
    lastSnapNote = `${r.why} — **2D로 대기**합니다`;
    return false;
  }
  // ⚠⚠ **확정된 방향이 `pts2d`에 남는다**(2026-08-18 7차 지시 1-c·1-e).
  //
  // 옛 판은 카메라가 선 뒤의 `pts2d`를 **원시 커서 궤적 그대로** 두었다(`onStrokeEnd`의
  // `frame() ? raw : resolve2d(raw)`). 그래서 **미리보기는 소실점을 지나는데 확정된 선은
  // 안 지났다** — 사용자가 본 그 증상이고, 규칙(`feedStroke`)도 그 원시 방향을 받았다.
  // 되쓰기는 새 규약이 아니다: `applySnapToStart`·`applySnapToEnd`가 이미 스냅 결과를
  // `pts2d`의 양 끝에 적는다(#17). 되쏘면 그 화면 점으로 정확히 돌아온다는 보장
  // (`lift.ts`의 `segGap = 0`)이 이 되쓰기를 항등으로 만든다 — 양 끝 스냅 획에서는 실제로
  // 아무것도 안 움직인다.
  {
    const p0 = project(r.seg[0], fr.ctx.principal, fr.ctx.f);
    const p1 = project(r.seg[1], fr.ctx.principal, fr.ctx.f);
    // **확정 후 재계산 가드**(14차 항목 0 — CHAIN_DIR_GUARD 머리말). 연쇄(dirGuard)의
    // **축 경로**만 잰다: 양 끝 스냅은 두 점이 기하를 정하고(회전이 조리개에 매인다),
    // 연장선은 발동 판정(extensionDir)이 이미 같은 임계로 각을 가른다. 축 경로만
    // 무제한이다("언제나 어느 축으로 간다").
    if (dirGuard && !r.twoPoint && !rExt && p0 && p1) {
      chainDirGuardStats.attempts += 1;
      const q0 = st.pts2d[0], q1 = st.pts2d[st.pts2d.length - 1];
      const turn = chordTurnDeg(q0, q1, [p0[0], p0[1]], [p1[0], p1[1]]);
      if (CHAIN_DIR_GUARD.on && turn > LIFT_TOL.parallel_deg) {
        chainDirGuardStats.rejected += 1;
        lastSnapNote = `축과 ${turn.toFixed(1)}° 어긋난 그대로 둡니다 — **2D로 대기**합니다`;
        return false;                  // 되쓰기 전이다 — 아무것도 안 움직였다
      }
    }
    if (p0 && p1) st.pts2d = [[p0[0], p0[1]], [p1[0], p1[1]]];
  }
  // **양 끝 스냅은 두 점이 기하를 정한다** — 축은 **기하를 안 바꾸는 라벨**로만 붙인다.
  //
  // ⚠ 라벨을 아예 안 붙이면 축 색·재분류·측정이 통째로 빠진다(종단 확인이 그것을 잡았다:
  // 모서리를 따라 그은 획이 `free`가 됐다). 선례도 라벨은 붙인다 — SketchUp은 두 점 사이
  // 선이 축과 나란하면 **축 색으로 그린다**. **추정이 아닌 이유**: 이 라벨은 어떤 점도
  // 움직이지 않는다(기하는 이미 두 점이 정했다).
  //
  // **판정은 앱의 단일 출처를 그대로 쓴다**(#17) — `cam.axisOf`는 규칙이 정해 둔 소실점에
  // 획을 붙이는 그 함수이고, 대각선처럼 어느 축도 아니면 **미분류**를 낸다(새 임계 없음).
  if (r.twoPoint || rExt) {
    const lab = r.axis ?? "free";
    st.axis = lab;
    st.userAxis = false;
    st.seg3d = [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])];
    if (r.twoPoint) {
      pathStats.twoPoint += 1;
      lastSnapNote = `**양 끝 스냅**으로 확정(축 ${typeof lab === "number" ? lab + 1 : "미분류"})`
                   + ` — ${SNAP_LABEL[st.snapStart!.kind as SnapKind]}`
                   + ` → ${SNAP_LABEL[(end?.kind ?? "endpoint") as SnapKind]}`
                   + (r.deg != null ? ` <span class="dim">(가장 가까운 축과 ${r.deg.toFixed(1)}°)</span>` : "");
      return "two_point";
    }
    // **연장선** — 원 선과 같은 3D 직선 위다(지시 3-c). 라벨은 그 방향이 축과 나란할 때만
    lastSnapNote = `**연장선**으로 확정(축 ${typeof lab === "number" ? lab + 1 : "미분류"})`
                 + ` <span class="dim">— ${SNAP_LABEL[st.snapStart!.kind as SnapKind]}에서 그 선의 방향 그대로</span>`;
    return "extension";
  }
  st.axis = r.axis as 0 | 1 | 2;
  // **사용자가 고른 축은 재분류가 덮지 않는다**(`doc.ts`의 `userAxis`, §6.1의 "사용자 지정만 유지")
  st.userAxis = r.locked;
  // **시점 좌표로 푼 것을 세계로 되돌린다**(L-B.8). 확정 시점에서는 항등이다
  st.seg3d = [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])];
  // **경로 카운터**(6차 지시 2·3) — 확정된 축 획만 센다(미리보기 아님)
  if ((r as { path?: string }).path === "direct") pathStats.direct += 1;
  else pathStats.lift += 1;
  lastSnapNote = r.locked
    ? `축${(r.axis as number) + 1}로 **고정**해 확정`
    : `축${(r.axis as number) + 1}로 확정 (축과 ${r.deg != null ? r.deg.toFixed(1) : "?"}°)`;
  return "axis";
}

/**
 * **시작점 스냅 없는 1점 배치**(6차 지시 2-3 — "없으면 궤도 중심의 깊이"). 앵커는 시작
 * 화면점을 궤도 중심의 깊이 평면에 역투영한 점이다. 축이 안 정해지면 종전대로 2D 대기(false).
 * `snapStart`는 그대로 `null`이다 — 스냅이 아니라 평면 배치이기 때문이다(원장에 명시).
 */
function placeUnanchored(st: SStroke, fr: Frame): boolean {
  const z0 = fr.toV(orbitTarget())[2];
  const anchor = planeAnchor(st.pts2d[0], z0, fr.ctx);
  if (!anchor) return false;
  const ok = !!placeLive(st, fr, anchor);
  if (ok) placeBy.unanchored += 1;
  return ok;
}

/**
 * **D-L83 ② — 궤도 중심 깊이 배치를 가드가 막는다.** 앵커도 연결도 없는 획을 임의 깊이로
 * 놓는 것이 "좌표는 연결이 정한다"(지시 4 표제)와 정면으로 어긋난다(D-L77과의 충돌은
 * D-L77 항목의 충돌 절에 있다). 막힌 획은 2D로 **대기**한다 — 연쇄(4-3)가 나중에 놓는다.
 * ⚠ 카운터는 **진입 차단 횟수**다 — 막지 않았을 때 실제로 놓였을지는 세지 않는다
 * (`placeUnanchored`는 축이 안 정해지면 어차피 false다. 대조는 `setAnchorGuard(false)` 팔이 한다).
 */
function guardedPlaceUnanchored(st: SStroke, fr: Frame): boolean {
  anchorGuardStats.unanchored_attempts += 1;
  if (ANCHOR_GUARD.on) { anchorGuardStats.unanchored_rejected += 1; return false; }
  return placeUnanchored(st, fr);
}

/** 자동 정렬 감시 토큰 — 새 궤도가 시작되면 이전 감시는 죽는다. */
let alignSeq = 0;

/**
 * **손 정렬 자동 스냅**(6차 지시 2-1 — "손으로 돌려 거의 정면이면 1점으로 본다".
 * 선례: Blender의 축 근접 자동 정렬 #23). 궤도가 끝나면 감쇠 꼬리(dampingFactor 0.12,
 * #7)가 멎기를 기다렸다가, 시선이 세계 축·수평의 `hand_deg` 안이면 **정확한** 1점 자세로
 * 눌러 앉힌다 — 직접 좌표(onePointFrame)는 정확 정렬에서만 돌기 때문이다.
 * 회전은 지금 궤도 중심(target) 둘레라 화면 이동이 hand_deg급으로 작다 —
 * 중심 재조준은 하지 않는다(D-L65의 시선 유지와 같은 이유. 큐브 탭의 중심 조준과 다르다).
 */
function armOnePointAlign(): void {
  if (!cam.standing() || stage.isPinned || !lifted(doc).length) return;
  const seq = ++alignSeq;
  const cam3 = stage.viewport.camera;
  let last = cam3.quaternion.clone();
  let still = 0;
  const step = () => {
    if (seq !== alignSeq) return;
    const q = cam3.quaternion;
    const d = Math.abs(q.x - last.x) + Math.abs(q.y - last.y)
            + Math.abs(q.z - last.z) + Math.abs(q.w - last.w);
    last = q.clone();
    if (d > 1e-9) { still = 0; requestAnimationFrame(step); return; }
    if (++still < 3) { requestAnimationFrame(step); return; }
    // ⚠⚠ **그린 축 기준계로 판정한다**(14차 항목 6 R2 [N1] — 옛 판은 세계 기준계였다:
    // "1·2점 확정에서는 차이 없음"이 이월 사유였는데 그것이 틀렸다 — D-L87이 이미 적었듯
    // 항등은 **P1(화면 축 확정)뿐**이고, 2점 구도(보통 상태)에서 세계-축 스냅은 그린
    // 축과 요 각도만큼 어긋난 곳으로 갔다. 큐브·작도 복귀와 같은 단일 출처(#17 —
    // draftGazeDrawn·judgeDraftPose)로 갈아 끼웠다.
    const f = draftGazeDrawn();
    if (!f) return;
    const j = judgeDraftPose(f, ONE_POINT_TOL.hand_deg);
    const eps = 1e-6;
    if (j.kind === "one_point" && (Math.abs(j.pitchDeg) > eps || j.yawOffDeg > eps)) {
      const A = drawnBasisThree();
      stage.viewport.userMoved = true;
      stage.snapToDir(A ? cubeUp(j.returnDir, A) : j.returnDir, null, 160, () => refresh());
      refresh();
    }
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- 3D 레이어

/** 문서의 3D 레이어를 씬에 반영한다. **여기가 유일한 경로다.** */
function syncScene() {
  snapPre = null;                       // 기하가 바뀌었다 — 스냅 후보를 다시 만든다
  // **보조선 표시 토글**(E). 끄면 3D 층에서 빠진다 — 스냅 대상은 그대로다(끄는 것은 표시다)
  const segs: StageSeg[] = lifted(doc)
    .filter(s => SHOW_GUIDES.on || s.channel !== "guide")
    .map(s => ({ id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis, channel: s.channel }));
  stage.setSegments(segs);
}

// ---------------------------------------------------------------- 뷰 시스템 (L-B.6, §9.2~§9.4)

/** 확정 뷰 — 술어는 `doc.ts`의 `confirmViewOf` 하나다(#17, 6차 항목 1). */
const confirmView = () => confirmViewOf(doc);

/**
 * **궤도 중심 — 3D 레이어 경계 상자의 중심**(4차 지시 7-a). 아무것도 없으면 **화면 중앙
 * 깊이의 한 점**(7-c — 확정 카메라의 시선 위 z=4. 실제로는 3D가 없으면 궤도가 안 열리므로
 * 방어적 기본값이다).
 */
const orbitTarget = (): Vec3 => stage.centroid(lifted(doc).map(s =>
  ({ id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis }))) ?? [0, 0, 4];

/**
 * **손가락이 카메라를 움직인다**(2026-08-17 G). 잉크 캔버스가 라우터이고(`onCamera`)
 * 여기서 `OrbitControls`의 **공개 API**로 내려간다 — 궤도 수학을 다시 짜지 않는다(A-3).
 *
 * `begin()`이 **확정 카메라를 푼다** — `궤도` 버튼이 하던 그 일이고, 손가락이 그것을 대신한다.
 * ⚠ **도구는 안 바꾼다**: 펜은 계속 그리는 도구다(그것이 지시문의 목표 동작이다).
 */
/**
 * **뷰 큐브**(6차 지시 1 — 3D 큐브). 상대 회전(드래그·화살표)은 stage.spinYaw,
 * 절대 스냅(면·모서리·꼭짓점·가장 가까운 1점)은 stage.snapToDir 하나를 지난다(#17).
 * 기본 켬(지시 1-5).
 */
/**
 * **큐브의 기준 좌표계 = 그린 공간의 축**(10차 항목 6 · 7차 지시 8 — "자세가 도는 것과
 * 기준계가 도는 것을 구분한다"). 옛 큐브는 three 세계 축이 기준이라, 2·3점 구도에서
 * 면 탭이 **그린 상자의 입면이 아니라 카메라의 초기 방향**으로 갔다 — 사용자가 그린
 * 상자와 큐브의 면이 안 맞았다. 기준계는 **카메라가 서는 순간 고정**되고(axisDirs 불변),
 * 그 뒤 도는 것은 자세뿐이다.
 *
 * 변환은 이 경계 한 곳이다(#17): `basis`는 그린 축 좌표로 **내려** 주고, `snap`은 큐브
 * 좌표(그린 축)를 세계로 **되올린다**. 상대 회전(spinYaw)은 기준계 무관이라 안 건드린다.
 * P1(정면 확정)에서는 그린 축 = 세계 축이라 **항등**이다 — 옛 거동이 그대로 남는다.
 */
/** 기준계 대조 스위치(#30) — `false`가 옛 기준계(three 세계 축)다. 앱에서 안 끈다. */
const CUBE_FRAME = { on: true };

function drawnBasisThree(): { X: Vec3; Y: Vec3; Z: Vec3 } | null {
  if (!CUBE_FRAME.on) return null;
  const dirs = cam.ctx()?.axisDirs;
  if (!dirs || dirs.length < 3) return null;
  // 우리 규약(y 아래·z 안쪽) → three(y 위·z 앞) — 뒤집기는 viewport.ts 규약 그대로
  // ⚠ 유한성 검사까지가 "빈 슬롯" 판정이다 — 이 픽스처 계열의 수직 슬롯이 [NaN, NaN]
  // 소실점을 들고 와 방향이 NaN이 되고, NaN은 truthy라 옛 널 검사를 그대로 지나
  // 기저 전체를 오염시켰다(그램-슈밋 끝의 영벡터 가드가 그것을 조용히 null로 접었다)
  const tt = dirs.map(d =>
    (d && d.every(Number.isFinite) ? [d[0], -d[1], -d[2]] as Vec3 : null));
  // ⚠ **빈 슬롯 보완**(14차 항목 6 — 6-R1 [1]의 뿌리): 옛 판은 axisDirs에 널이 하나라도
  // 있으면 통째로 포기하고 **세계 축**으로 떨어졌다 — 수직축 미선언(P1·P2의 보통 상태)
  // 에서 큐브·작도 복귀가 그린 축과 35°씩 어긋나던 자리다. 수직이 비면 화면 수직이
  // 그 방향이고(2점 = 수직 무한원의 전제 — 이론서 2.2), 가로축(slot 0)이 비면 수직과
  // 남은 수평축의 외적으로 세운다(부호는 아래 flip이 잡는다). 그래도 못 세우면 종전대로
  // 세계 축이다.
  const Yseed: Vec3 = tt[2] ?? [0, 1, 0];
  let Xseed: Vec3 | null = tt[0];
  if (!Xseed) {
    if (!tt[1]) return null;
    Xseed = [Yseed[1] * tt[1][2] - Yseed[2] * tt[1][1],
             Yseed[2] * tt[1][0] - Yseed[0] * tt[1][2],
             Yseed[0] * tt[1][1] - Yseed[1] * tt[1][0]];
  }
  const t = [Xseed, tt[1] ?? [0, 0, 1], Yseed] as Vec3[];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (v: Vec3): Vec3 => {
    const L = Math.hypot(v[0], v[1], v[2]);
    return L < 1e-9 ? [0, 0, 0] : [v[0] / L, v[1] / L, v[2] / L];
  };
  const flip = (v: Vec3, ref: Vec3): Vec3 => (dot(v, ref) < 0 ? [-v[0], -v[1], -v[2]] : v);
  // 큐브 +x ← 가로축(axis 0) · +y ← 수직축(axis 2, 위로) · +z ← 깊이축의 반대(카메라 쪽)
  const X0 = flip(unit(t[0]), [1, 0, 0]);
  const Y0 = flip(unit(t[2]), [0, 1, 0]);
  // 그램-슈밋(소실점 잡음 직교화) + 오른손 좌표계 강제(큐브 히트가 그 규약이다)
  const Y1 = unit([Y0[0] - dot(Y0, X0) * X0[0], Y0[1] - dot(Y0, X0) * X0[1],
                   Y0[2] - dot(Y0, X0) * X0[2]]);
  if (!Y1[0] && !Y1[1] && !Y1[2]) return null;
  // +z는 X×Y가 정한다(오른손 좌표계 — 큐브 히트의 규약. 깊이축의 반대쪽이 저절로 나온다:
  // 우리 삼중항(x우·y아래·z안)이 오른손이라 three로 뒤집어도 오른손이 유지된다)
  const Z1: Vec3 = [X0[1] * Y1[2] - X0[2] * Y1[1], X0[2] * Y1[0] - X0[0] * Y1[2],
                    X0[0] * Y1[1] - X0[1] * Y1[0]];
  return { X: X0, Y: Y1, Z: Z1 };
}
const cubeDown = (v: Vec3, A: { X: Vec3; Y: Vec3; Z: Vec3 }): Vec3 => [
  v[0] * A.X[0] + v[1] * A.X[1] + v[2] * A.X[2],
  v[0] * A.Y[0] + v[1] * A.Y[1] + v[2] * A.Y[2],
  v[0] * A.Z[0] + v[1] * A.Z[1] + v[2] * A.Z[2]];
const cubeUp = (w: Vec3, A: { X: Vec3; Y: Vec3; Z: Vec3 }): Vec3 => [
  w[0] * A.X[0] + w[1] * A.Y[0] + w[2] * A.Z[0],
  w[0] * A.X[1] + w[1] * A.Y[1] + w[2] * A.Z[1],
  w[0] * A.X[2] + w[1] * A.Y[2] + w[2] * A.Z[2]];

// ---------------------------------------------------------------- 작도/모델링 상태 (14차 항목 6)

/** 시선을 큐브 기준계(그린 축 — D-L87)로 내린 것. 큐브 탭·복귀가 같은 기준계를 쓴다. */
function draftGazeDrawn(): Vec3 | null {
  if (!cam.standing()) return null;
  const b = stage.basisOf();
  const A = drawnBasisThree();
  return A ? cubeDown(b.f, A) : b.f;
}

/**
 * **작도 화면인가 모델링 화면인가**(지시 6-d · 2026-08-19 15차 항목 3으로 **넓혔다** — D-L102).
 * 상태는 저장하지 않는다: 자세에서 매번 계산한다(§1의 규약 그대로).
 *
 * ```
 * 작도 = 카메라가 서 있고 **축 기준계가 선다** — 1점·2점·3점 전부
 * 모델링 = 기준계가 없다(카메라 미확정이 아닌데 그린 축을 못 세운다)
 * ```
 *
 * ⛔⛔ **14차 판은 "축 정렬 + 피치 0"을 작도 조건으로 뒀고 그것이 과했다**(지시 3-c).
 * 3점 시점의 피치는 **정의상 0이 아니므로**(기운 카메라가 곧 3점이다) 3점이 통째로
 * 모델링으로 읽혔다 — 참 3점 픽스처에서 살짝만 돌려도 그리기가 막혔다(재현: 지시 3-a).
 * 화면에 붙는 유령을 막으려던 것이 원래 이유인데, 그 몫은 이미 다른 자리가 한다:
 * 소실점·지평선·격자가 전부 **지금 시점의 값**으로 다시 계산된다(`viewOverlayCtx`·
 * `drawGrid`·D-L101). 그러므로 남는 조건은 **기준계가 서는가** 하나다.
 */
function draftStateNow():
  "pre" | "draft_pinned" | "draft_one" | "draft_two" | "draft_three" | "model" {
  if (!cam.standing()) return "pre";
  if (stage.isPinned) return "draft_pinned";
  const f = draftGazeDrawn();
  if (!f) return "model";
  const j = judgeDraftPose(f, ONE_POINT_TOL.hand_deg);
  return j.kind === "one_point" ? "draft_one"
       : j.kind === "two_point" ? "draft_two" : "draft_three";
}
const draftingNow = (): boolean => draftStateNow() !== "model";

/**
 * **이미 정렬된 작도 시점인가** — 피치가 접혀 있어 「작도 시점으로」가 갈 곳이 없는 상태.
 * D-L102로 그리기 게이트에서 물러난 피치 조건이 **버튼의 조건**으로 남은 자리다.
 */
function alignedDraftNow(): boolean {
  const st = draftStateNow();
  return st === "draft_pinned" || st === "draft_one" || st === "draft_two";
}

/**
 * **가장 가까운 작도 시점으로 복귀**(지시 6-a·f). 피치를 0으로 접고, 요는 축 이탈이
 * `hand_deg` 안이면 그 축으로(1점 — 큐브 재탭 D-L76과 같은 답), 밖이면 유지한다(2점).
 * 카메라 이동은 큐브 탭과 같은 경로(`snapToDir` — 거리·중심 유지)다(#17).
 */
function returnToDraft(): void {
  if (!cam.standing() || stage.isPinned) return;
  const f = draftGazeDrawn();
  if (!f) return;
  const j = judgeDraftPose(f, ONE_POINT_TOL.hand_deg);
  const A = drawnBasisThree();
  stage.viewport.userMoved = true;
  stage.snapToDir(A ? cubeUp(j.returnDir, A) : j.returnDir, orbitTarget(), 280, () => refresh());
  tool = "draw";
  refresh();
}

const viewCube = new ViewCube(document.getElementById("cube") as HTMLCanvasElement, {
  basis: () => {
    const b = stage.basisOf();
    const A = drawnBasisThree();
    return A ? { r: cubeDown(b.r, A), u: cubeDown(b.u, A), f: cubeDown(b.f, A) } : b;
  },
  spin: (delta, ms) => {
    stage.viewport.userMoved = true;
    stage.spinYaw(delta, orbitTarget(), ms, () => refresh());
    refresh();
  },
  snap: (fwd) => {
    stage.viewport.userMoved = true;
    const A = drawnBasisThree();
    stage.snapToDir(A ? cubeUp(fwd, A) : fwd, orbitTarget(), 280, () => refresh());
    refresh();
  },
  visible: () => cam.standing() && lifted(doc).length > 0,
});

const gestures = new CamGestures({
  begin: () => {
    if (!cam.standing() || !lifted(doc).length) return false;   // 아직 돌릴 3D가 없다
    if (stage.isPinned) {
      stage.unpin(orbitTarget());
      refresh();   // ⛔ "돌리는 중" 안내를 뺐다(지시 3) — 돌릴 수 있는지는 손가락이 안다
    } else {
      // **새 선이 그어졌으면 다음 궤도가 새 중심으로 돈다**(4차 지시 7-b) — 그리는 순간
      // 옮기면 시점이 튀므로, 갱신 시점은 **궤도를 시작하는 순간**이다.
      // ⚠ **재조준은 자연스러운 동작이 아니었다**(5차 지시 2가 옛 문장을 뒤집었다) —
      // 중심점만 바뀌고 시선은 유지한다: 중심을 **현재 시선 위로 투영**해 놓는다(retarget).
      stage.retarget(orbitTarget());
      stage.viewport.controls.update();
    }
    stage.viewport.userMoved = true;   // 자동 맞춤이 시점을 빼앗지 않는다
    return true;
  },
  controls: () => stage.viewport.controls,
  height: () => stage.size()[1],
  changed: () => stage.viewport.invalidate(),
  ended: () => { armOnePointAlign(); refresh(); },
  // **화면 팬 대 공간 팬**(10차 항목 5 — 지시 문면 그대로): 그리는 중(핀 상태 또는
  // 카메라 전)의 두 손가락은 **종이를 민다** — 카메라는 안 열리고 핀도 안 풀린다.
  // 궤도로 풀린 뒤에는 거짓을 돌려 종전의 공간 팬(OrbitControls.pan)이 받는다.
  screenPan: (dx, dy) => {
    if (!(stage.isPinned || !cam.standing())) return false;
    stage.setViewPan([stage.viewPan[0] + dx, stage.viewPan[1] + dy]);
    refresh();
    return true;
  },
  // **핀치는 화면 줌**(14차 항목 5 · D-L94) — screenPan이 참인 상태에서만 불린다.
  // 옛 판은 이 배율을 버렸다(핀 상태에 줌이 없어서 확대하려면 궤도로 풀 수밖에 없었다).
  screenZoom: (scale, at) => {
    stage.setViewZoom(stage.viewZoom * scale, at);
    refresh();
  },
});

// **마우스 궤도의 종료에도 같은 자동 정렬**(2-R′ [B-6] — 터치 제스처만 덮으면 마우스 `궤도`
// 모드가 빠진다). flyTo 복귀·저장본 복원·실행취소는 저장된 자세를 그대로 복원하므로 대상이
// 아니다 — 그 자세가 근사 정렬이면 1점으로 안 선다(직접 경로는 정확 정렬만).
stage.viewport.controls.addEventListener("end", () => armOnePointAlign());

/**
 * **뷰 전환**(§9.2). 확정 뷰면 확정 카메라에 다시 물리고, 아니면 저장된 자세로 돌아간다.
 *
 * 2D 대기 획은 `viewRef`가 소유하므로 **전환만으로 화면의 2D 층이 바뀐다** —
 * 숨기는 이유는 정리가 아니라 **좌표계**다(`doc.ts` 머리말).
 */
/**
 * **시점 저장**(5차 지시 7-1a — 라이노 '명명된 뷰', 이름은 '시점'). 지금 자세를 뷰로 등록한다.
 * 확정 시점에 물려 있으면 저장할 것이 없다 — 확정 뷰가 이미 목록에 있다.
 */
function saveViewpoint(): void {
  const p = stage.pose();
  if (!p) { note = "확정 시점은 이미 목록에 있습니다"; refresh(); return; }
  const n = doc.views.filter(v => v.pose).length + 1;
  const v = newView(`시점 ${n}`, p);
  doc.views.push(v);
  doc.currentView = v.id;
  note = `<b>${v.name}</b>을 저장했습니다 — 목록에서 누르면 돌아옵니다`;
  refresh();
}

/** **누르면 그 시점으로 날아간다**(7-1b) — 도착해서 switchView로 마무리한다. */
function switchViewAnimated(id: string): void {
  const v = doc.views.find(x => x.id === id);
  if (!v || id === doc.currentView) { if (v) switchView(id); return; }
  stage.flyTo(v.pose, 280, () => switchView(id));
}

function switchView(id: string) {
  const v = doc.views.find(x => x.id === id);
  if (!v) return;
  doc.currentView = id;
  const ctx = cam.ctx();
  if (isConfirmView(v)) {
    if (ctx) stage.pinTo(ctx.principal, ctx.f);
    tool = "draw";
    note = "";
  } else {
    // `isConfirmView`가 거짓이므로 자세가 있다(확정 뷰만 `pose === null`이다 — `doc.ts`)
    stage.setPose(v.pose!, orbitTarget());
    // **L-B.8이 열렸다** — 돌린 시점에서도 그린다. 그래서 전환 뒤 바로 그리기다.
    // 더 돌리려면 `궤도`를 누른다(SketchUp의 모드 전환과 같다).
    tool = "draw";
    note = "";
  }
  hoverSnap = null; hover2d = null; live = null;
  refresh();
}

/**
 * **지금 자세에 해당하는 뷰를 찾거나 만든다**(§9.3).
 *
 * 계획서: "궤도를 돌려 **새 각도에서 실제로 획을 그리면** 그 시점이 새 뷰로 등록된다.
 * 돌릴 때마다 만들지 않는다 — 뷰가 넘친다." 그래서 **획을 그리는 자리에서만** 부른다.
 *
 * ⚠ **지금은 확정 뷰만 반환한다** — 궤도 시점에서 그리는 경로가 아직 안 열렸기 때문이다
 * (L-B.8). 생성 가지는 그때 도달한다. 그 사실을 `progress.md`에 적었다(#23).
 */
function viewForDrawing(): string {
  // ⚠⚠ **카메라 확정 전에는 언제나 확정 뷰다**(5차 지시 1 — 화면 불변 전환의 전제).
  // 그리는 이 화면이 **곧 확정 카메라의 화면이 된다**(§4.5) — 별개 시점이 아니다.
  // 옛 판은 확정 전 스테이지가 비핀(자유 자세)이라는 이유로 **가짜 뷰를 만들어** 확정 전
  // 획 전부를 거기 넣었고, 그 결과 ① `standCamera`의 일괄 풀이(확정 뷰 대상)가 빈 목록을
  // 받아 **아무것도 안 올라갔고** ② 확정 순간 `viewIsCurrent()`가 거짓이 되어 **그린 획이
  // 화면에서 통째로 사라졌다**(5차 항목 1 — "전환이 느껴지면 안 된다"의 정면 위반).
  if (!cam.standing()) return confirmView().id;
  const p = stage.pose();
  if (p === null) return confirmView().id;
  const cur = doc.views.find(v => v.id === doc.currentView);
  if (cur && cur.pose && samePose(cur.pose, p)) return cur.id;
  const v = newView(`뷰 ${doc.views.length}`, p);
  doc.views.push(v);
  return v.id;
}

/**
 * **지금 화면이 `doc.currentView`의 화면인가**(§9.2).
 *
 * 2D 대기 획을 그릴지 정하는 판정이다. `pts2d`는 **그린 뷰의 화면 좌표**라서
 * 자세가 다르면 뜻이 없다 — 그리면 화면에 붙어 따라다니는 유령이 된다.
 * L-B.8 이전에는 "확정 시점인가"로 충분했다(뷰가 하나뿐이었다).
 */
function viewIsCurrent(): boolean {
  const v = doc.views.find(x => x.id === doc.currentView);
  if (!v) return false;
  const p = stage.pose();
  if (isConfirmView(v)) return p === null;          // 확정 뷰는 물려 있을 때만 맞다
  return p !== null && samePose(v.pose!, p);   // 확정 뷰가 아니면 자세가 있다(`doc.ts`)
}

/** 두 자세가 같은가 — 전환 직후 미세한 수치 차이로 뷰가 늘어나는 것을 막는다. */
function samePose(a: ViewPose, b: ViewPose): boolean {
  const near = (u: Vec3, v: Vec3) =>
    Math.abs(u[0] - v[0]) < 1e-6 && Math.abs(u[1] - v[1]) < 1e-6 && Math.abs(u[2] - v[2]) < 1e-6;
  return near(a.C, b.C) && a.R.every((r, i) => near(r, b.R[i]));
}

function renderViews() {
  const rows = doc.views.map(v => {
    const n = pending(doc, v.id).length;
    const on = v.id === doc.currentView;
    const del = isConfirmView(v)
      ? `<button class="del" disabled title="확정 뷰는 지울 수 없습니다 — 첫 카메라입니다">✕</button>`
      : `<button class="del" data-delview="${v.id}" title="이 뷰와 그 안의 대기 획 ${n}개를 지웁니다">✕</button>`;
    const ren = isConfirmView(v) ? ""
      : `<button class="ren" data-renview="${v.id}" title="이름 바꾸기">✎</button>`;
    return `<div class="row"><button data-view="${v.id}"${on ? ' class="on"' : ""}>`
         + `${v.name}${n ? ` <span class="n">·2D ${n}</span>` : ""}</button>${ren}${del}</div>`;
  });
  const canSave = cam.standing() && !stage.isPinned;
  viewsEl.innerHTML = `<div class="cap">시점 ${doc.views.length}</div>` + rows.join("")
    + `<div class="saverow"><button data-saveview${canSave ? "" : " disabled"}`
    + ` title="지금 보는 각도를 시점으로 저장합니다 — 돌려 본 뒤에 누르세요">+ 시점 저장</button></div>`;
}

viewsEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b || (b as HTMLButtonElement).disabled) return;
  if ((b as HTMLButtonElement).dataset.saveview !== undefined) { saveViewpoint(); return; }
  const ren = (b as HTMLButtonElement).dataset.renview;
  if (ren) {
    const v = doc.views.find(x => x.id === ren);
    if (v) {
      // eslint-disable-next-line no-alert
      const name = prompt("시점 이름", v.name);
      if (name && name.trim()) { v.name = name.trim().slice(0, 24); refresh(); }
    }
    return;
  }
  const del = (b as HTMLButtonElement).dataset.delview;
  if (del) {
    pushUndo();
    // **보고 있던 뷰를 지웠을 때만** 카메라를 옮긴다. 아니면 화면이 이유 없이 튄다
    const wasHere = doc.currentView === del;
    const r = deleteView(doc, del);
    if (!r) { note = "확정 뷰는 지울 수 없습니다"; refresh(); return; }
    // **뷰를 지우면 그 안의 대기 획도 함께 사라진다**(§9.2). 승격된 획은 뷰 소속이 없으므로 남는다.
    if (wasHere) switchView(doc.currentView);
    note = `뷰를 지웠습니다 — 그 안의 2D 대기 획 ${r.removed}개가 함께 사라졌습니다`;
    refresh();
    return;
  }
  const to = (b as HTMLButtonElement).dataset.view;
  if (to) switchViewAnimated(to);        // **애니메이션으로 돌아간다**(7-1b)
});

/**
 * **일괄 풀이**(§5.4). 확정 뷰의 대기 획을 축별로 다시 분류하고 한 번에 푼다.
 *
 * L에서는 **획이 카메라보다 먼저** 그려지므로 그릴 때의 축 판정은 전부 `free`다 —
 * 다시 안 하면 아무것도 안 놓인다(L-A.5 브라우저 확인에서 실제로 배치 0이었다).
 * **사용자가 직접 고른 축은 건드리지 않는다.**
 *
 * 미배치는 `seg3d = null`로 남고 그것이 **2D 레이어**다 — 실패가 아니라 대기다(§9.1).
 */
function solveInto(ctx: PlaceCtx, targets: SStroke[]): number {
  if (!targets.length) return 0;
  for (const st of targets) {
    if (!liftable(st)) continue;                 // **주석은 3D로 안 간다**(D-3)
    if (st.userAxis) continue;
    // **규칙이 이미 축을 정해 뒀다** — 검출 판정(`classifyStroke`)을 안 부른다(사람 지시 1).
    st.axis = cam.axisOf(st.pts2d).axis;
  }
  const input: LiftStroke[] = targets.filter(liftable)
    .map(s => ({ id: s.id, pts2d: s.pts2d, axis: s.axis }));
  // **그리며 선언된 연결을 제약으로 넘긴다**(15차 항목 1 · D-L98 · lift.ts `DeclaredJoint`).
  // 검출(`findJoints`)은 대표 직선 교점을 접합 반경 안에서 찾는데, 프리핸드 획에서는
  // 그 교점이 그린 모서리에서 접합 반경 밖으로 나간다(합성 사슬 실측 35px > 21.7px) —
  // **사용자가 붙여 그은 획이 "구조에 안 이어졌다"로 떨어져 2D에 남았다.**
  const declared: DeclaredJoint[] = [];
  for (const s of LIFT_DECLARED.on ? targets : []) {
    if (!liftable(s)) continue;
    for (const ref of [s.snap2dStart, s.snap2dEnd]) {
      if (ref?.ofId) declared.push({ i: s.id, j: ref.ofId, q: ref.at });
    }
  }
  const r = liftAll(input, { principal: ctx.principal, f: ctx.f, vps: ctx.vps,
                             imgSize: ctx.imgSize, axisDirs: ctx.axisDirs }, {}, declared);
  let n = 0;
  for (const s of targets) {
    const seg = r.placed.get(s.id);
    s.seg3d = seg ? [seg.a, seg.b] : null;
    if (seg) { n += 1; reanchorLifted(s, ctx, id => doc.strokes.find(x => x.id === id)); }
  }
  // ⚠ **여기에는 D-L71 되쓰기가 없다 — 필요 없어서다**(12차 항목 2에서 실측으로 확인).
  // `liftAll`의 끝점은 그 화면점의 **광선 위**에 있으므로(λ·ray — lift.ts) 재투영이
  // 그린 현과 정확히 같다: 잉크와 3D가 이 경로에서는 이미 자기일관이다. 방향을 축에
  // 맞추는 것은 배치가 아니라 **확정 시점의 2D 방향 스냅**의 몫이다(`placeStroke`의
  // 대기 가지 — 조리개 안 겨냥이 소실점을 정확히 지나게 옮겨 두면, 그 획은 여기서
  // 정확한 축으로 풀린다. `vp_dir_consistency.test.ts`가 그 사슬을 잠근다).
  // ⚠⚠ **그 자기일관은 `rep`에 대한 것이다**(15차 항목 1 · D-L98). 그린 끝점에 대해서는
  // 자기일관이 아니다 — `rep`는 PCA 극단이고 오스냅 후보는 `pts2d`의 양 끝이라,
  // 프리핸드 획에서 둘이 중앙 6.5px 어긋난다(`confirm_link.json@f351839a`의
  // `real_ink_rep_offset`). 그 몫을 `reanchorLifted`가 되맞춘다.
  placeBy.batch += n;
  // **첫 앵커 — 지면 배치**(13차 항목 2 · groundAnchor.ts 머리말). 일괄 풀이가 아무것도
  // 못 올렸고 **문서에 3D가 하나도 없을 때만**: 카메라를 세운 보조선들(수평 평면 축)은
  // 바닥 격자이므로 지면에 놓는다. 실획 15-16-18이 이 경로 부재로 전량 대기였다
  // (`first_anchor.json` — 접합 모델이 몸통 교차를 못 쓴다). 3D가 이미 있으면 안 돈다 —
  // 떠 있는 성분의 임의 지면 배치는 10차가 막은 그것이다(D-L84 ③).
  if (GROUND_ANCHOR.on && n === 0 && !lifted(doc).length) {
    for (const s of targets) {
      if (!liftable(s) || s.seg3d) continue;
      if (!groundEligible(s.axis)) continue;
      const seg = groundSegment(s.pts2d, ctx);
      if (seg) { s.seg3d = seg; n += 1; placeBy.ground += 1; }
    }
  }
  return n;
}

/**
 * **배치 경로 이름**(`placeLive`의 반환) — `placeStroke`가 이것을 되돌려 `feedStroke`가
 * "이 획의 기하를 무엇이 정했나"를 안다(15차 항목 2 · D-L100).
 */
type PlacePath = "two_point" | "extension" | "axis" | null;

/**
 * **알림은 이 획의 것이다**(15차 항목 2 · D-L100 (c)) — 획마다 `note`를 비운다.
 * 측정 스위치(#30) — `S2S.setNoteClear(false)`가 수리 전 거동(앞 획의 경고가 남는다)이다.
 */
const NOTE_CLEAR = { on: true };

/**
 * **연결이 기하를 정한 획에는 거절 알림을 안 낸다**(15차 항목 2 · D-L100 (a)).
 * 측정 스위치(#30) — `S2S.setConnectionQuiet(false)`가 수리 전 거동(그 획에도 경고)이다.
 */
const CONNECTION_QUIET = { on: true };

/** 측정 스위치(#30 — D-L83 `setAnchorGuard` 선례) — 끄면 수리 전 거동(첫 앵커 없음)이다. */
const GROUND_ANCHOR = { on: true };

/**
 * **확정 배치의 연결 되맞춤**(2026-08-19 15차 항목 1 · D-L98 · `liftAnchor.ts` 머리말).
 *
 * 일괄 풀이가 놓은 끝점은 `rep`(PCA 극단)의 광선 위인데, 사용자가 붙인 연결점은 `pts2d`의
 * 양 끝이다. 프리핸드 획에서 그 둘이 어긋나(`confirm_link.json@f351839a` — 실획 22획 중앙 6.5px) **확정
 * 순간 붙여 그린 두 획이 떨어진다.** 여기서 두 획의 그 끝을 **대상 직선 위의 한 점**으로
 * 모은다 — 규약은 `placeLive`의 그것 그대로다(#17: 좌표는 연결이 정한다, D-L83).
 *
 * 되맞춤이 서면 **3D 참조도 붙인다** — 일괄 풀이 경로는 여태 `snapStart`/`snapEnd`를
 * 아예 안 남겼고(실측: 확정 획 전부 null), 그래서 분할·지우개의 앵커 이관과
 * `refAnchorOf`의 재료가 없었다. 기록이 있는데 3D 참조가 없는 상태를 없앤다.
 *
 * ⚠ **대상이 아직 안 놓였으면 아무것도 안 한다** — 그 연결은 이 회차의 몫이 아니다.
 * 그래서 **문서 순서로 돈다**: 앞선 획이 먼저 놓이고 그 위에 뒤 획이 붙는다(사슬).
 *
 * 측정 스위치(#30) — `S2S.setLiftAnchor(false)`가 수리 전 거동이다.
 */
const LIFT_ANCHOR = { on: true };
/**
 * **선언된 연결을 제약으로 넘기는가**(D-L98의 앞 절반 — `lift.ts`의 `DeclaredJoint`).
 * 측정 스위치(#30) — `S2S.setLiftDeclared(false)`가 수리 전 거동(검출 교점만)이다.
 * 되맞춤(`LIFT_ANCHOR`)과 **따로 끈다**: 두 결함이 다른 것이고 각자의 몫이 갈려야 한다.
 */
const LIFT_DECLARED = { on: true };
/**
 * 분자·분모와 사유(#43) — `attempts`는 **기록이 있는 확정 획의 기록 수**다.
 * `attempts = applied + no_target + rejected`.
 */
const liftAnchorStats = { attempts: 0, applied: 0, no_target: 0, rejected: 0,
                          target_moved: 0, maxMovedPx: 0, maxTurnDeg: 0 };

function reanchorLifted(s: SStroke, ctx: PlaceCtx, by: (id: string) => SStroke | undefined): void {
  if (!LIFT_ANCHOR.on || !s.seg3d) return;
  const refs = [{ ref: s.snap2dStart, end: false }, { ref: s.snap2dEnd, end: true }] as const;
  for (const { ref } of refs) {
    if (!ref?.ofId) continue;
    liftAnchorStats.attempts += 1;
    const t = by(ref.ofId);
    if (!t?.seg3d || t.id === s.id) { liftAnchorStats.no_target += 1; continue; }
    const r = anchorToTarget(s.seg3d, t.seg3d, ref.at, ref.kind, ctx);
    if (!r) { liftAnchorStats.rejected += 1; continue; }
    s.seg3d = r.seg;
    if (r.targetSlot != null) { t.seg3d = r.target; liftAnchorStats.target_moved += 1; }
    liftAnchorStats.applied += 1;
    liftAnchorStats.maxMovedPx = Math.max(liftAnchorStats.maxMovedPx, r.movedPx);
    liftAnchorStats.maxTurnDeg = Math.max(liftAnchorStats.maxTurnDeg, r.turnDeg);
    // **3D 참조를 붙인다** — 세계 = 시점이다(일괄 풀이는 핀 상태에서만 돈다)
    const world = { kind: ref.kind, at: r.at3, ofId: ref.ofId };
    if (ref === s.snap2dEnd) s.snapEnd = world; else s.snapStart = world;
  }
}


// ⛔ **차수 승격 블록을 지웠다**(2026-08-18 7차 지시 3-d) — `autoPromoteOrder`(§6.1의
// 전부 다시 풀기)와 `relinkLostSnaps`(잃은 스냅 재연결)가 여기 있었다. 승격 전이가
// 없어졌으므로 부르는 곳이 없다. 순수 모듈(`promoteOrder.ts`·`promoteDiff.ts`)과 그
// 단위 시험은 남는다 — 왜 그 규칙이 있었는지가 근거다.

// ---------------------------------------------------------------- 고치기 (L-D.1, §9.5)

/**
 * **고른 획을 지운다**(§9.5 "지우는 경로"). SketchUp의 지우개와 같다(A-3).
 *
 * ⚠ **문서에서만 지우면 안 된다** — 씬·스냅 후보·뷰 소유가 함께 정리돼야 한다.
 * `syncScene()`이 셋을 다 한다(그것이 유일한 경로다). 되돌리기는 `pushUndo`가 받는다.
 *
 * ⚠ **지운 획에 붙어 있던 스냅은 끊긴다.** 그 획들을 2D로 되돌리지는 않는다 —
 * 이미 놓인 3D는 좌표가 있고, 그것을 지우는 것은 **사용자가 시키지 않은 삭제**다.
 * 대신 **끊긴 개수를 세어 알린다**(#7).
 */
// ---------------------------------------------------------------- 분할 + 지우개 (지시 I)

/** 3D 획 → 분할 기하. **조각의 경계는 다른 3D 획들과의 교차·접촉이다**(SketchUp). */
const seg3Of = (st: SStroke): Seg3 => ({ id: st.id, a: st.seg3d![0], b: st.seg3d![1] });
const otherSegs = (id: string): Seg3[] =>
  lifted(doc).filter(x => x.id !== id).map(seg3Of);

/** 화면 점 p가 3D 획 위 어느 매개변수에 해당하나(지금 시점의 투영으로). */
function paramAtScreen(st: SStroke, p: Pt2, fr: Frame): number | null {
  const a = project(fr.toV(st.seg3d![0]), fr.ctx.principal, fr.ctx.f);
  const b = project(fr.toV(st.seg3d![1]), fr.ctx.principal, fr.ctx.f);
  if (!a || !b) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-9) return 0;
  return Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
}

/**
 * **획 하나를 조각들로 갈아 끼운다** — 남길 매개 구간(`keep`)만 새 획으로 만든다.
 *
 * 조각의 `pts2d`는 **확정 카메라의 상**이다(§1.1 — 직선이라 양 끝 둘이면 된다). 원 획의
 * `snapStart`는 t=0을 담은 조각만, `snapEnd`는 t=1을 담은 조각만 물려받는다.
 *
 * **앵커 이관**(지시 I의 종속성 정의 — 규칙 전문은 `split.ts`의 `reanchorId`): 이 획을
 * 앵커로 쓰던 다른 획들은 ① 앵커 점을 담은 살아남은 조각으로 `ofId`를 넘기고
 * ② 그 조각이 지워졌으면 **스냅 기록만 끊는다**(기하는 안 움직인다). 끊긴 수를 되돌린다.
 */
function replaceWithPieces(st: SStroke, keep: [number, number][]): { pieces: number; broken: number } {
  const ctx = cam.ctx();
  if (!ctx || !st.seg3d) return { pieces: 0, broken: 0 };
  const s3 = seg3Of(st);
  const mk = (t0: number, t1: number): SStroke | null => {
    const A = pointAt(s3, t0), B = pointAt(s3, t1);
    const a2 = project(A, ctx.principal, ctx.f), b2 = project(B, ctx.principal, ctx.f);
    if (!a2 || !b2) return null;
    const piece = newSStroke([a2, b2], st.viewRef, st.channel);
    piece.pieceOf = st.pieceOf ?? st.id;   // **조각 표시**(지시 K의 분모 — 사람 획과 단위가 다르다, #11)
    piece.axis = st.axis; piece.userAxis = st.userAxis;
    piece.seg3d = [A, B];
    piece.snapStart = t0 <= 1e-9 ? st.snapStart : null;
    piece.snapEnd = t1 >= 1 - 1e-9 ? st.snapEnd ?? null : null;
    return piece;
  };
  const pieces = keep.map(([t0, t1]) => mk(t0, t1)).filter((x): x is SStroke => !!x);
  const i = doc.strokes.findIndex(x => x.id === st.id);
  doc.strokes.splice(i, 1, ...pieces);
  // **앵커 이관** — 점이 본체다. 담은 조각이 없으면 기록을 끊고 센다(#7)
  const pieceSegs = pieces.map(seg3Of);
  let broken = 0;
  for (const other of doc.strokes) {
    for (const key of ["snapStart", "snapEnd"] as const) {
      const an = other[key];
      if (!an || an.ofId !== st.id) continue;
      const to = pieceSegs.length ? reanchorId(an.at, pieceSegs) : null;
      if (to) an.ofId = to;
      else { other[key] = null; broken += 1; }
    }
  }
  return { pieces: pieces.length, broken };
}

/**
 * **조각 지우개**(지시 I) — 닿은 자리의 조각(교차점 사이 구간)이 통째로 사라진다.
 * 2D 대기 획은 조각 개념이 없으므로(교차가 3D의 것) **획 전체**가 사라진다.
 */
function eraseSegmentAt(p: Pt2): boolean {
  const hit = pickStroke(p, ERASER.px);          // **지우개 크기**(5차 지시 5 — 화면 px)
  if (!hit) return false;
  const st = doc.strokes.find(x => x.id === hit)!;
  pushUndo();
  if (!st.seg3d) {
    doc.strokes = doc.strokes.filter(x => x.id !== hit);
    syncScene();
    note = "2D 획 하나를 지웠습니다";
    return true;
  }
  const fr = frame();
  const t = fr ? paramAtScreen(st, p, fr) : null;
  if (t == null) { undoStack.pop(); return false; }
  const cuts = cutParams(seg3Of(st), otherSegs(st.id));
  const all = piecesFromCuts(cuts);
  const keep = all.filter(([t0, t1]) => !(t >= t0 && t <= t1));
  const r = replaceWithPieces(st, keep);
  syncScene();
  note = `조각을 지웠습니다 (${all.length}조각 중 1)`
       + (r.broken ? ` — <b>${r.broken}개의 스냅 기록이 끊겼습니다</b>`
                     + ' <span class="dim">(그 획들의 기하는 그대로입니다)</span>' : "");
  return true;
}

/** **부분 지우개** — 끌면서 지나간 매개 구간만 깎는다. 분할의 특수한 경우다(지시 I). */
let partErase: Map<string, [number, number][]> | null = null;

function erasePartSample(p: Pt2): void {
  const fr = frame();
  if (!fr) return;
  const rPx = ERASER.px;                         // **지우개 크기**(5차 지시 5 — 화면 px)
  for (const st of lifted(doc)) {
    const a = project(fr.toV(st.seg3d![0]), fr.ctx.principal, fr.ctx.f);
    const b = project(fr.toV(st.seg3d![1]), fr.ctx.principal, fr.ctx.f);
    if (!a || !b) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L)));
    const foot: Pt2 = [a[0] + dx * t, a[1] + dy * t];
    if (Math.hypot(foot[0] - p[0], foot[1] - p[1]) > rPx) continue;
    const half = rPx / L;                       // 화면 반경 → 매개 구간 절반
    const iv: [number, number] = [t - half, t + half];
    (partErase!.get(st.id) ?? partErase!.set(st.id, []).get(st.id)!).push(iv);
  }
}

function erasePartCommit(): void {
  if (!partErase || !partErase.size) { partErase = null; return; }
  pushUndo();
  let erased = 0, broken = 0;
  for (const [id, ivs] of partErase) {
    const st = doc.strokes.find(x => x.id === id);
    if (!st || !st.seg3d) continue;
    const keep = subtractIntervals(ivs);
    if (keep.length === 1 && keep[0][0] === 0 && keep[0][1] === 1) continue;
    const r = replaceWithPieces(st, keep);
    erased += 1; broken += r.broken;
  }
  partErase = null;
  if (!erased) { undoStack.pop(); return; }
  syncScene();
  note = `부분 지우개 — ${erased}획을 깎았습니다`
       + (broken ? ` — <b>${broken}개의 스냅 기록이 끊겼습니다</b>` : "");
}

function deletePicked(): void {
  if (!picked) return;
  const st = doc.strokes.find(x => x.id === picked);
  if (!st) { picked = null; return; }
  pushUndo();
  const orphans = doc.strokes.filter(x => x.snapStart?.ofId === st.id).length;
  doc.strokes = doc.strokes.filter(x => x.id !== st.id);
  picked = null;
  syncScene();
  note = `획 하나를 지웠습니다`
       + (orphans ? ` — <b>${orphans}획의 스냅이 이 획에 붙어 있었습니다</b>`
                    + ` <span class="dim">(그 획들은 그대로 있습니다. 지우려면 따로 고르세요)</span>` : "")
       + " <span class=\"dim\">· <b>실행취소</b>로 되돌립니다</span>";
  refresh();
}

/**
 * **고른 획에 축을 지정한다**(§9.5 "'이 획은 저 면 위에 있다' 수준의 지정 경로").
 *
 * ⚠ **면 지정이 아니다.** 면 생성이 범위 밖이라(DEFERRED) 줄 수 있는 것은 **방향**뿐이다.
 * 둘은 같지 않다 — 면 지정은 획을 **평면에 가두고**, 축 지정은 방향만 준다.
 * 그래서 **지정해도 안 놓일 수 있다**: §5.4의 일괄 풀이가 그 방향으로 이어지는 구조를
 * 찾아야 하기 때문이다. **놓였는지 세어 알린다**(#7 — 추측하지 않는다).
 *
 * `userAxis`를 세우므로 **차수 승격의 재분류가 이 값을 안 덮는다**(§6.1 "사용자 지정만 유지").
 */
/**
 * **고른 획의 채널을 바꾼다**(D-4). 자동 판정을 하지 않으므로 **여기가 유일한 변경 경로**다.
 *
 * ⚠ **주석으로 바꾸면 3D에서 내려온다**(D-3) — 주석은 기하가 아니다. 반대로 주석을
 * 보조선·결과선으로 바꾸면 **자동으로 안 올라간다**: 올라가려면 시작점이 무언가에 붙어야
 * 하고 그것은 그리는 시점의 일이다. **승격 연쇄를 한 번 돌려 준다** — 붙으면 올라간다.
 */
function setPickedChannel(next: Channel): void {
  if (!picked) return;
  const st = doc.strokes.find(x => x.id === picked);
  if (!st || st.channel === next) return;
  pushUndo();
  st.channel = next;
  let placed = !!st.seg3d;
  // **주석은 판정 대상이 아니다**(12차 지시 4-c) — 3D에서 내려올 때 축 라벨도 지운다.
  // 남겨 두면 실획 원장의 축 지표(vp_dir_err 등)가 주석을 세게 된다(실획 보고 s52·s53).
  if (next === "note") { st.seg3d = null; st.axis = "free"; st.userAxis = false; placed = false; }
  else if (!st.seg3d) {
    const fr = frame();
    if (fr) { promoteChain(fr); placed = !!st.seg3d; }
  }
  syncScene();
  note = `채널을 <b style="color:${CHANNEL_UI[next].color}">${CHANNEL_UI[next].name}</b>으로 바꿨습니다`
       + (next === "note" ? " — <b>3D에서 내려왔습니다</b>"
          : placed ? " — <b>3D에 있습니다</b>" : " — <b>2D로 대기</b>합니다");
  refresh();
}

function assignAxis(ax: 0 | 1 | 2): void {
  if (!picked) return;
  const st = doc.strokes.find(x => x.id === picked);
  const ctx = cam.ctx();
  if (!st || !ctx) return;
  pushUndo();
  st.axis = ax;
  st.userAxis = true;
  const was = !!st.seg3d;
  const fr = frame();
  let placed = was;
  if (fr) {
    st.seg3d = null;
    // ⚠ **일괄 풀이로는 안 놓인다** — `solveInto`는 **대기 집합끼리만** 풀어서 앵커가 없다.
    // 종단 확인이 실제로 그것을 잡았다(지정 2획 · 올라간 것 **0**).
    // **회수하는 것은 앵커다**(D-L20, L-B.7: 720/1904 대 일괄 0/1904) — 그래서 승격 연쇄를 돈다:
    // 시작점이 이미 놓인 기하에 붙으면 §3·§7의 실시간 경로가 그 획을 놓는다.
    // 확정 뷰에서는 그 앞에 일괄도 한 번 돌린다(서로 이어진 대기 획끼리 풀릴 수 있다)
    if (fr.pinned) solveInto(fr.ctx, pending(doc, confirmView().id));
    if (!st.seg3d) promoteChain(fr);
    placed = !!st.seg3d;
  }
  syncScene();
  note = `이 획을 <b style="color:${AXIS_COLOR[ax]}">축${ax + 1}</b>로 지정했습니다`
       + (placed ? " — <b>3D로 올라갔습니다</b>"
                 : " — <b>아직 2D로 대기</b>합니다"
                   + " <span class=\"dim\">(축은 정해졌으나 다른 획과 이어지지 않았습니다)</span>")
       + " <span class=\"dim\">· 지정한 축은 <b>차수 승격이 안 덮습니다</b>(§6.1)</span>";
  refresh();
}

/** 3D 레이어의 크기 — 뷰 눈 위치를 같이 옮기기 위한 배율 기준. */
function geomScaleOf(list: SStroke[]): number {
  let m = 0;
  for (const s of list) for (const p of s.seg3d!) m = Math.max(m, Math.hypot(p[0], p[1], p[2]));
  return m;
}

/**
 * 확정 — 계획서 §1.2의 **고유한 것 ①**. 그때까지의 획이 3D로 올라간다.
 *
 * 전환이 **무변화**여야 한다: 3D 레이어를 그리는 카메라가 확정 카메라와 같으므로
 * 올라간 획은 **잉크가 있던 바로 그 픽셀**에 그려진다(`sceneCam` 머리말 — 설계 보장이다).
 * **그래서 아무것도 알리지 않는다**(2026-08-17 지시 3) — 알리면 전환이 있다는 인상을 준다.
 * 돌릴 수 있는지는 손가락을 대보면 안다.
 *
 * ⛔ `locked` 플래그·`확정` 버튼 경로를 지웠다(지시 2) — "확정됐는가"는 `cam.standing()`이
 * 계산하고, 소실점 잠금은 `stepRule` 자체의 성질이다(슬롯이 차면 지지선으로만 센다).
 */
function standCamera() {
  const ctx = cam.ctx();
  if (!ctx) return;
  // **확정 뷰의 대기 획 전부**(§5.4) — 확정 전 획은 전부 확정 뷰 소속이다(viewForDrawing).
  // ⚠ `doc.views[0]`이 아니라 `confirmView()`다 — 뜻(자세 항등인 뷰)으로 찾는다.
  const targets = pending(doc, confirmView().id);
  const n = solveInto(ctx, targets);
  stage.pinTo(ctx.principal, ctx.f);
  // 확정 직후에도 연쇄를 한 번 돈다 — 놓인 것이 생겼으므로 대기 획이 붙을 수 있다
  if (n) promoteChain(frame() ?? { ctx, toV: ID, fromV: ID, dirV: ID, pinned: true, poseKey: "pin" });
  syncScene();
  refresh();
}

/**
 * **획 하나가 카메라를 어디로 보내는가** — 전이(NONE→P1 · NONE→P2)의 단일 관문.
 *
 * 처음 서면 조용히 확정한다(`standCamera` — 무변화 전환). ⛔ **승격 갈래는 없다**(7차 지시 3-d).
 */
function feedCamera(line: RLine, forced?: "screen" | "depth",
                    hint?: "screen" | "depth") {
  const wasStanding = cam.standing();
  const r = cam.feed(line, forced, hint);
  // ⛔ **차수 승격 분기를 지웠다**(2026-08-18 7차 지시 3-d). 남아 있던 전이는 P2 → P3
  // 하나였고 그 입구(기울어진 수직선의 "수직축" 답)를 3-b가 없앴다 — **차수 승격 개념이
  // 사라졌다.** 3점은 카메라를 기울인 시점의 성질이지 획이 만드는 전이가 아니다.
  // 남는 전이는 **NONE → P1 · NONE → P2**뿐이고 그것은 "카메라가 처음 서는 것"이다.
  if (r.applied && cam.standing() && !wasStanding) standCamera();
  return r;
}

// ---------------------------------------------------------------- 규칙 (사람 지시 1·3)

/**
 * **획 하나를 규칙에 넣는다.** 대표 직선을 쓴다 — 손떨림이 각 판정을 흔들면 안 되고,
 * `representative`가 최소제곱 주축이라 시작-끝 잇기보다 낫다(`axis.ts` 머리말).
 *
 * 애매하면 `ask`를 세우고 **그 획은 2D로 대기**한다. 답이 올 때까지 규칙은 안 움직인다 —
 * 이것이 "추정하지 않는다"의 구현이다(A-3: 애매하면 놓지 않는다).
 */
function feedStroke(st: SStroke, forced?: "screen" | "depth",
                    hint?: "screen" | "depth", byConnection = false): void {
  const rep = representative(st.pts2d);
  if (!rep) return;
  const line: RLine = { a: rep.a, b: rep.b };
  const r = feedCamera(line, forced, hint);
  // **알릴 규칙 사건은 둘이다** — ① 알림 표시가 붙은 거절(**아무 일도 안 난 이유와
  // 사용자가 다시 그을 것**) ② **f² ≤ 0으로 두 번째 축이 조용히 안 선 채 1점이 된 경우**
  // (D-L73 — 두 축이 한 번에 서는 경로에서 둘째가 막히면 알린다. 조용히 1점이 되면
  // 사용자는 2점을 그렸다고 믿는다). ⛔ **화각 경고는 지웠다**(2026-08-19 14차 지시
  // 1-b · D-L93): 넓은 화각은 결함이 아니라 선택 — warn/severe 대역의 why는 이제 빈
  // 문자열이라 ②의 조건(band reject — f² ≤ 0뿐)에만 문구가 실린다. 1차 리뷰어 [3]이
  // 초판(vp_fixed 알림 전체 삭제)이 D-L73까지 무효화한 것을 잡았다.
  // ⚠⚠ **연결이 기하를 정한 획에는 "어긋납니다"를 안 낸다**(2026-08-19 15차 항목 2 · D-L100).
  //
  // 그 거절문(6차 지시 11-3 — "셋째 방향은 잘못 그은 것이다")은 **축을 겨냥했는데 어디에도
  // 안 닿은 획**에 대한 말이고, 그래서 "지우고 다시 그으세요"라고 한다. 그런데 **양 끝
  // 스냅·연장선으로 놓인 획은 축을 겨냥한 것이 아니다** — `resolveLive`가 그 경로를 두면서
  // 스스로 적었다: "축을 벗어난 선(면 위 사선·자유 세그먼트)이 이 경로로 놓인다. 각도는
  // 표시용으로만 낸다(축을 붙이지 않는다)." 그 획은 **이미 3D에 정확히 있고** 두 끝이
  // 사용자가 고른 실제 점에 붙어 있다. 재현(15차 항목 2): 면 대각선이 양 끝 스냅으로
  // 3D에 놓인 그 순간 "지우고 다시 그으세요"가 떴다.
  //
  // ⚠ **규칙 상태는 그대로 거절한다** — 그 선은 소실점을 만들지 않는다(`state: st0`).
  // 바뀌는 것은 **알림뿐**이고, 무슨 일이 났는지는 `lastSnapNote`가 이미 말한다
  // ("양 끝 스냅으로 확정(축 미분류) — … 가장 가까운 축과 44.5°").
  if (r.event.type === "rejected" && r.event.notify
      && !(byConnection && CONNECTION_QUIET.on)) {
    note = r.event.why;
  } else if (r.event.type === "vp_fixed" && r.event.fov?.band === "reject") {
    note = r.event.fov.why;
  }
  if (r.event.type === "ask") {
    // **카메라가 선 뒤에는 화면축/깊이 물음을 안 낸다**(지시 3 — 시스템 사정을 안 묻는다).
    // 그 물음은 카메라를 세우는 단계의 것이고, 선 뒤에 남는 유일한 물음은 **3점 입구**
    // (두 번째 수평축인가 수직축인가)다 — 그것이 P2 → P3 전이의 문이다.
    if (cam.standing() && r.event.question === "screen_or_depth") { ask = null; return; }
    ask = { strokeId: st.id, line, question: r.event.question,
            toH: r.event.verdict.toH, toV: r.event.verdict.toV };
    askStats.asked += 1;
    return;
  }
  ask = null;
}

/** 물음에 답한다 — 그 답을 규칙에 **강제로** 넣는다. */
function answerAsk(choice: "screen" | "depth"): void {
  if (!ask) return;
  askStats[choice] += 1;
  const st = doc.strokes.find(x => x.id === ask!.strokeId);
  const line = ask.line;
  ask = null;
  if (st) feedStroke(st, choice);
  else feedCamera(line, choice);
  // 규칙이 카메라를 세웠을 수 있다 — 대기 획을 다시 본다
  refresh();
}

// ⛔ **상태 표시 문구를 지웠다**(2026-08-17 지시 3) — `ruleText`·`ruleStatus`·`nextHint`·
// `CAND_NAME`·`SRC_NAME`. "1점 투시 확정" "2점 후보" "다음에 그을 것" "깊이가 정해지지
// 않았습니다"는 전부 시스템 사정이고 사용자가 알 필요가 없다 — **알리면 전환이 있다는
// 인상을 준다.** 남는 안내는 둘뿐이다: 아무리 그려도 안 돌아갈 때의 최소 안내(`renderStatus`)와
// ⛔ 차수 승격 알림도 없어졌다(7차 지시 3-d).

// ---------------------------------------------------------------- 2D 레이어 그리기

/**
 * **획 하나 = 직선 하나**(계획서 §1.1). 점열의 처음과 끝만 잇는다.
 *
 * 계획서는 "획이 직선 세그먼트가 되고 손떨림은 버린다"인데 **렌더 층이 그 결정을 안 따르고
 * 있었다** — 화면에 손 획이 그대로 보였다. 고치는 자리는 **그리는 곳 전부**이고
 * (`inkCanvas`의 잉크 · 여기의 2D 대기층 · `strokeView`의 튜브), 셋 다 같은 규약을 쓴다.
 */
function drawStraight(ctx2: CanvasRenderingContext2D, pts: Pt2[]): void {
  if (pts.length < 2) return;
  const a = pts[0], b = pts[pts.length - 1];
  ctx2.beginPath();
  ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]);
  ctx2.stroke();
}

/** 물어보는 중인 획을 화면에 띄운다 — **무엇에 대해 묻는지 안 보이면 답할 수 없다.** */
function drawAsk(ctx2: CanvasRenderingContext2D): void {
  if (!ask) return;
  ctx2.save();
  ctx2.strokeStyle = "#8e44ad"; ctx2.lineWidth = 4;
  ctx2.globalAlpha = 0.8; ctx2.setLineDash([9, 5]); ctx2.lineCap = "round";
  ctx2.beginPath();
  ctx2.moveTo(ask.line.a[0], ask.line.a[1]); ctx2.lineTo(ask.line.b[0], ask.line.b[1]);
  ctx2.stroke();
  ctx2.restore();
}


/**
 * **지평선은 언제나 옅게 깔린다**(사람 지시 2). 옵션으로 끄지 않는다 —
 * 모든 수평 소실점이 그 위에 놓이므로 **그림의 기준선**이고, 카메라가 서기 전에도 있다.
 * 높이는 **카메라 피치가 정하고** 사용자가 직접 조절하지 않는다(궤도로 바뀐다).
 */
/**
 * **지평선 손잡이를 잡았는가**(D-L45). 반경은 **`PICK_TOL`을 그대로 쓴다** —
 * 새 임계를 만들지 않는다(#17). 고르기와 같은 종류의 조작이고(커서로 정확히 짚는 것)
 * 선례의 값(10~15px)에 가깝다.
 *
 * ⚠ **끌 수 없는 상태면 잡히지 않는다** — 그때 그 자리는 그냥 그리는 자리다.
 */
/**
 * **지평선이 보이는가**(4차 지시 4-a) — **소실점이 결과로 정한 뒤에만** 있다.
 * 옛 판은 처음부터 깔았고 그것이 첫 제약이었다 — 빈 종이 감각을 해쳤고, 소실점이
 * (선 × 미리 깔린 지평선)으로 굳는 원인이었다(항목 3). 지평선은 전제가 아니라 결과다:
 * 유한 수평 소실점이 서는 순간 그 y가 지평선이고(D-L59 ②) 그때부터 그린다.
 */
const horizonVisible = (): boolean =>
  ([0, 1] as const).some(i => {
    const s = cam.rules.slots[i];
    return s != null && s.kind === "vp";
  });

/**
 * **지금 시점의 표시 문맥**(14차 항목 6-c) — 소실점·지평선·그리드를 돌린 작도 시점에서도
 * 낸다. 출처는 배치와 같은 `frame()`(→ `viewPlaceCtx`)이다(#17) — 각 축 방향을 지금
 * 시점으로 투영하면 소실점이고(이론서 2.2), 수평 소실점의 y가 지평선이다(지시 6-c
 * "계산은 자명하다"). 핀 상태에서는 종전 그대로 확정 카메라의 값이다.
 */
function viewOverlayCtx(): {
  vps: (Pt2 | null)[]; horizonY: number | null; principal: Pt2; f: number;
  axisDirs: (Vec3 | null)[] | null; imgSize: [number, number];
  /** **축 셋의 시점별 소실점**(15차 항목 8 · D-L101) — 무한원 축은 `at: null`·방향만. */
  axisVps: (AxisVpAt | null)[];
  /** **지평선 = 수평 소실점 둘을 잇는 선**(지시 8-b). 화면 가로선이 아니다. */
  horizonLine: { a: Pt2; b: Pt2 } | null;
} | null {
  if (!cam.standing()) return null;
  const pack = (vps: (Pt2 | null)[], principal: Pt2, f: number,
                dirs: (Vec3 | null)[] | null, imgSize: [number, number], hy: number | null) => {
    // **축 방향에서 낸다**(D-L101) — 방향이 없으면 규칙이 든 소실점으로 되돌아간다(#17:
    // 두 출처가 아니라 하나의 우선순위. 확정 시점에서는 둘이 같은 값이다).
    const av = dirs ? axisVpsAt(dirs, principal, f, imgSize)
                    : vps.map((v, i) => (v ? { axis: i as 0 | 1 | 2, at: v,
                                               screenDir: [1, 0] as Pt2,
                                               distFromPrincipal: Math.hypot(v[0] - principal[0],
                                                                             v[1] - principal[1]) }
                                           : null));
    return { vps, horizonY: hy, principal, f, axisDirs: dirs, imgSize,
             axisVps: av, horizonLine: horizonThrough(av[0], av[1], imgSize) };
  };
  if (stage.isPinned) {
    const c = cam.ctx();
    if (!c) return null;
    return pack(cam.vps(), c.principal, c.f, c.axisDirs ?? null, cam.imgSize,
                horizonVisible() ? cam.rules.horizon : null);
  }
  const fr = frame();
  if (!fr) return null;
  const vv = fr.ctx.vps;
  // 지평선의 **스칼라 y**는 격자(`gridGuides`)가 여전히 쓰는 옛 규약이다 — 표시용 선분은
  // `horizonLine`이 든다(둘이 갈리는 것은 롤이 있는 시점이고, 그것이 이 항목의 자리다).
  const hy = vv[0] ? vv[0][1] : vv[1] ? vv[1][1] : null;
  return pack(vv, fr.ctx.principal, fr.ctx.f, fr.ctx.axisDirs ?? null, fr.ctx.imgSize, hy);
}

function horizonGrab(p: Pt2): boolean {
  // ⚠ 4차 지시 4로 **보이지 않는 지평선은 잡히지 않는다** — 확정 전에는 지평선이 없다.
  // 확정 후에는 잠긴다(D-L45의 잠금 그대로) — 지시 4-e(확정 후 피치 끌기)는 전부 다시
  // 풀기(승격 규약)가 필요해 DEFERRED로 미뤘다(D-L60).
  if (!horizonVisible()) return false;
  if (tool !== "draw" || !cam.canSetHorizon()) return false;
  if (cam.standing() && !stage.isPinned) return false;      // 돌린 뷰의 화면 좌표가 아니다
  return Math.abs(p[1] - cam.rules.horizon) <= PICK_TOL.radius_ratio * Math.hypot(...cssSize());
}

/** 지평선 선분 하나를 긋는다 — 표시 규약은 가로선 판과 같다(색·파선·알파). */
function drawHorizonSeg(ctx2: CanvasRenderingContext2D, l: { a: Pt2; b: Pt2 }) {
  ctx2.save();
  ctx2.strokeStyle = HORIZON_COLOR;
  ctx2.lineWidth = 1;
  ctx2.setLineDash([6, 4]);
  ctx2.globalAlpha = 0.35;
  ctx2.beginPath(); ctx2.moveTo(l.a[0], l.a[1]); ctx2.lineTo(l.b[0], l.b[1]); ctx2.stroke();
  ctx2.setLineDash([]);
  ctx2.restore();
}

function drawHorizon(ctx2: CanvasRenderingContext2D) {
  // **소실점 확정 전에는 지평선이 없다**(4차 지시 4-a — 빈 종이). 결과이지 전제가 아니다
  if (!horizonVisible()) return;
  // ⚠ **작도 화면에서만 그린다**(14차 항목 6 — 옛 판은 핀 전용이었다): 돌린 작도 시점
  // (축 정렬 + 피치 0)에서는 그 시점의 수평 소실점 y로 다시 낸다(`viewOverlayCtx` — 지시
  // 6-c). 모델링 시점에 그리면 화면에 붙어 따라다니는 유령이 된다(`drawBelowInk` 머리말).
  let y = cam.rules.horizon;
  // **돌린 시점의 지평선은 화면 가로선이 아니다**(15차 항목 8 · D-L101) — 수평 소실점
  // 둘을 잇는 선이다. 롤이 있으면 기울고, 배면·윗면에서도 그 선은 계산된다.
  if (cam.standing() && !stage.isPinned) {
    if (!draftingNow()) return;
    const o = viewOverlayCtx();
    if (o?.horizonLine) { drawHorizonSeg(ctx2, o.horizonLine); return; }
    if (o?.horizonY == null) return;
    y = o.horizonY;
  }
  const [w] = cssSize();
  const grabbable = cam.canSetHorizon() && (!cam.standing() || stage.isPinned);
  ctx2.save();
  ctx2.strokeStyle = HORIZON_COLOR;
  ctx2.lineWidth = horizonDrag ? 2 : 1;
  ctx2.setLineDash([6, 4]);
  ctx2.globalAlpha = horizonDrag ? 0.95 : cam.standing() ? 0.35 : 0.55;
  ctx2.beginPath(); ctx2.moveTo(0, y); ctx2.lineTo(w, y); ctx2.stroke();
  ctx2.setLineDash([]);
  // **끌 수 있으면 손잡이를 낸다** — 없으면 사용자는 끌 수 있다는 것을 모른다(D-L45).
  // 오른쪽 끝에 두는 이유: 그리는 자리(가운데)와 겹치지 않는다
  if (grabbable) {
    ctx2.globalAlpha = horizonDrag ? 1 : 0.75;
    ctx2.fillStyle = HORIZON_COLOR;
    ctx2.beginPath();
    ctx2.moveTo(w - 26, y); ctx2.lineTo(w - 14, y - 6); ctx2.lineTo(w - 14, y + 6);
    ctx2.closePath(); ctx2.fill();
    ctx2.fillRect(w - 12, y - 1, 10, 2);
  }
  // ⛔ **캡션("피치 0"·"내려다봄"·y값)을 지웠다**(지시 3) — 시스템 사정이다.
  // 선과 손잡이만 남는다: 선은 그림의 기준선이고 손잡이는 사용자가 조작하는 것이다.
  ctx2.restore();
}

/**
 * **잠정 그리드 — 소실점이 서기 전의 대기 깊이선**(6차 지시 11-4).
 *
 * 확정은 세 번째 선이 하므로(지시 11) 그전에 **대기가 길어진다.** 그동안 아무것도 안 보이면
 * 사용자는 다음 선을 어디로 그어야 할지 모른다 — 대각선 하나만 있어도 연장하면 소실점이
 * 그 위 어딘가이고, 둘이면 교점 후보가 나온다.
 *
 * **확정 그리드와 구분한다**: 파선이고 더 옅다. **스냅 대상이 아니다 — 표시만이다**(지시 11-4).
 * ⚠ 교점 후보를 그리는 것은 **찍기 경로의 입구이기도 하다**(지시 11-6) — 그 자리를 톡 찍으면
 * `pickVpAt`이 거기로 확정한다. 실획에서 찍기 사용이 0이었던 것은 **보이지 않았기 때문**이다.
 */
function drawPendingVpGuides(ctx2: CanvasRenderingContext2D) {
  const pool = cam.rules.depthLines ?? [];
  if (!pool.length) return;
  const [w, h] = cssSize();
  ctx2.save();
  ctx2.strokeStyle = HORIZON_COLOR;
  ctx2.lineWidth = 1;
  ctx2.setLineDash([4, 6]);
  ctx2.globalAlpha = 0.28;                      // 확정 그리드(0.14)보다 진하되 획보다 훨씬 옅다
  for (const l of pool) {
    const d: Pt2 = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
    const seg = clipToRect(l.a, d, w, h);
    if (!seg) continue;
    ctx2.beginPath();
    ctx2.moveTo(seg[0][0], seg[0][1]); ctx2.lineTo(seg[1][0], seg[1][1]);
    ctx2.stroke();
  }
  // 교점 후보 — **확정된 소실점 표식보다 옅고 작다**(아직 결과가 아니다)
  ctx2.setLineDash([]);
  ctx2.globalAlpha = 0.45;
  ctx2.strokeStyle = HORIZON_COLOR;
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const at = lineIntersect(pool[i].a, pool[i].b, pool[j].a, pool[j].b);
    if (!at || at[0] < 0 || at[0] > w || at[1] < 0 || at[1] > h) continue;
    ctx2.beginPath(); ctx2.arc(at[0], at[1], 4, 0, Math.PI * 2); ctx2.stroke();
  }
  ctx2.restore();
}

function drawGrid(ctx2: CanvasRenderingContext2D) {
  if (!SHOW_GRID.on) return;
  // **돌린 작도 시점에서도 격자가 선다**(14차 항목 6-d) — 배치와 같은 출처(`frame()`)의
  // 시점 소실점·축 방향·렌즈로 같은 함수를 부른다(#17). 격자 계산은 전부 화면·카메라
  // 좌표량이라(`grid.ts`의 `GridCam`) 시점 프레임을 그대로 받는다.
  let lines: ReturnType<typeof gridGuides>;
  if (cam.standing() && !stage.isPinned) {
    const o = viewOverlayCtx();
    if (!o) return;
    lines = gridGuides({ ok: true, f: o.f, principalPoint: o.principal },
                       o.vps, o.imgSize, o.horizonY, o.axisDirs);
  } else {
    const r = cam.acc.solve();
    // **1점에서도 격자가 선다**(지시 5-5) — 무한원 축의 방향(`axisDirs`)을 넘긴다(D-L40)
    lines = gridGuides(r.camera, cam.vps(), cam.imgSize,
                       r.camera.principalPoint ? r.camera.principalPoint[1] : null,
                       cam.ctx()?.axisDirs ?? null);
  }
  ctx2.save();
  for (const l of lines) {
    ctx2.beginPath();
    ctx2.moveTo(l.a[0], l.a[1]); ctx2.lineTo(l.b[0], l.b[1]);
    if (l.kind === "horizon") {
      ctx2.strokeStyle = HORIZON_COLOR; ctx2.lineWidth = 1; ctx2.setLineDash([6, 4]);
      ctx2.globalAlpha = 0.7;
    } else {
      // **아주 연한 무채색**(지시 5-7) — 격자는 보조선보다 한참 아래다
      ctx2.strokeStyle = GROUND_COLOR; ctx2.lineWidth = 1; ctx2.setLineDash([]);
      ctx2.globalAlpha = 0.14;
    }
    ctx2.stroke();
  }
  ctx2.restore();
}

/**
 * 2D 레이어 — **대기 중인 획**. 3D와 **약하게 구분한다**(§9.4): 회전하면 어차피 드러나므로
 * 미리 알리는 편이 낫고, 지나치게 강조하면 결함처럼 보인다.
 *
 * **지금 자세가 그 뷰의 자세일 때만 그린다**(§9.2) — `pts2d`는 그린 뷰의 화면 좌표라서
 * 다른 자세에서는 뜻이 없다. L-B.8 이전에는 "확정 시점일 때만"이었고, 뷰가 여럿이 된
 * 지금은 **뷰가 맞는가**로 판정한다.
 */
/**
 * **획의 세 상태**(10차 항목 1 · 지시 4-1). **저장하지 않고 계산한다** — 차수·확정과 같은
 * 규약이다(D-L53 "상태는 계산이다").
 *
 * ```
 * coord  좌표 확정      seg3d가 있다
 * dir    방향 확정      카메라가 서 있고 축이 정해진다 — 무한직선(좌표 미정). 미배치가
 *                       아니라 **정상 대기**다(§9.1) — 연결이 잡히면 좌표가 정해진다(4-3)
 * none   방향 미정      카메라 전이거나 축 미분류·주석
 * ```
 */
type StrokeState = "coord" | "dir" | "none";
function strokeStateOf(s: SStroke): StrokeState {
  if (s.seg3d) return "coord";
  if (!cam.standing() || !liftable(s) || s.pts2d.length < 2) return "none";
  const ax = s.userAxis ? s.axis : cam.axisOf(s.pts2d).axis;
  return ax === "free" ? "none" : "dir";
}

/**
 * **방향 확정 획의 무한직선**(10차 항목 1 · 지시 4-2) — "소실점부터 화면 끝까지.
 * 그린 구간만 진하게, 연장부는 아주 옅게." 그린 구간은 `drawPending`이 그대로 그리고,
 * 여기는 그 아래에 **전체 직선을 옅게** 깐다. 유한 소실점 축은 소실점을 지나는 직선,
 * 화면 평행 축(무한원)은 그린 방향의 연장이다(이론서 2.2 — c=0의 소실점은 무한원에 있다).
 * 표시만이다 — 스냅 대상이 아니다(잠정 그리드와 같은 규약, 6차 지시 11-4).
 */
function drawDirLines(ctx2: CanvasRenderingContext2D) {
  if (!cam.standing() || !viewIsCurrent()) return;
  const [w, h] = cssSize();
  const vps = cam.vps();
  ctx2.save();
  ctx2.lineWidth = 1;
  ctx2.setLineDash([]);
  for (const s of pending(doc)) {
    if (strokeStateOf(s) !== "dir") continue;
    const rep = representative(s.pts2d);
    if (!rep) continue;
    const ax = s.userAxis ? s.axis : cam.axisOf(s.pts2d).axis;
    const vp = typeof ax === "number" ? vps[ax] : null;
    // 소실점이 있으면 그것을 지나는 직선(시작점 기준 — 앵커가 될 점이다), 없으면 그린 방향
    const origin: Pt2 = vp ?? rep.a;
    const toward: Pt2 = vp ? rep.a : rep.b;
    const d: Pt2 = [toward[0] - origin[0], toward[1] - origin[1]];
    const seg = clipToRect(origin, d, w, h);
    if (!seg) continue;
    const ui = CHANNEL_UI[s.channel] ?? CHANNEL_UI.guide;
    ctx2.strokeStyle = ui.color;
    ctx2.globalAlpha = 0.12;              // 그린 구간(drawPending의 0.35×알파)보다 한참 옅다
    ctx2.beginPath();
    ctx2.moveTo(seg[0][0], seg[0][1]); ctx2.lineTo(seg[1][0], seg[1][1]);
    ctx2.stroke();
  }
  ctx2.restore();
}

/**
 * **연장선 안내선**(13차 항목 3-d) — 무한직선 표현을 재사용한다(옅은 직선 · 여기는 파선 —
 * 라이노가 Extension을 점선으로 낸다, A-3). 커서가 3D 획의 끝점·정점 근처에 있으면 그
 * 끝의 연장부가 옅게 나오고, 그리는 현이 연장선에 발동하면(live.ext) 진해진다.
 */
function drawExtensionHint(ctx2: CanvasRenderingContext2D) {
  if (!OSNAP.kinds.extension || !viewIsCurrent()) return;
  const fr = frame();
  if (!fr) return;
  const src = live?.ext ? live.anchor : hoverSnap;
  if (!src || (src.kind !== "endpoint" && src.kind !== "vertex") || !src.ofId) return;
  const st2 = doc.strokes.find(x => x.id === src.ofId);
  if (!st2?.seg3d) return;
  const A = fr.toV(st2.seg3d[0]), B = fr.toV(st2.seg3d[1]);
  const dA = norm3(sub3(src.at, A)), dB = norm3(sub3(src.at, B));
  const [endV, otherV] = dA <= dB ? [A, B] : [B, A];
  const pE = project(endV, fr.ctx.principal, fr.ctx.f);
  const pO = project(otherV, fr.ctx.principal, fr.ctx.f);
  if (!pE || !pO) return;
  const d: Pt2 = [pE[0] - pO[0], pE[1] - pO[1]];
  const L = Math.hypot(d[0], d[1]);
  if (L < 1e-9) return;
  const [w, h] = cssSize();
  ctx2.save();
  ctx2.strokeStyle = SNAP_COLOR.extension;
  ctx2.setLineDash([6, 6]);
  ctx2.lineWidth = 1;
  ctx2.globalAlpha = live?.ext ? 0.55 : 0.15;   // 발동하면 진해진다(지시 3-d)
  ctx2.beginPath();
  ctx2.moveTo(pE[0], pE[1]);
  ctx2.lineTo(pE[0] + (d[0] / L) * (w + h), pE[1] + (d[1] / L) * (w + h));
  ctx2.stroke();
  ctx2.restore();
}

function drawPending(ctx2: CanvasRenderingContext2D) {
  if (cam.standing() && !viewIsCurrent()) return;
  ctx2.save();
  ctx2.lineWidth = 2; ctx2.lineCap = "round";
  // **채널이 색과 파선을 정한다**(D-1) — 그리고 **미승격 2D는 연하다**(E의 셋째 단계).
  //
  // ⚠ **주석은 3D로 안 올라가므로 언제나 여기 있다**(D-3) — 그것은 "대기"가 아니라
  // **그 뷰의 화면 층**이다. 그래서 카메라가 서도 안 흐려진다(다른 셋과 다르다).
  for (const s of pending(doc)) {
    // 옛 저장본·옛 하네스의 획은 채널이 없을 수 있다 — **보조선으로 본다**(D-1의 기본값)
    const ui = CHANNEL_UI[s.channel] ?? CHANNEL_UI.guide;
    ctx2.strokeStyle = ui.color;
    ctx2.setLineDash(ui.dash);            // **점선을 쓰지 않는다**(지시 5-7) — 채널 정의 그대로
    ctx2.globalAlpha = s.channel === "note" ? ui.alpha
      : (cam.standing() ? 0.35 : 0.65) * ui.alpha;      // **§9.4 — 2D를 약하게 구분한다**(E)
    // **직선으로 그린다**(§1.1) — 시작점과 끝점 둘뿐이다. `pts2d`는 그대로 보존된다
    drawStraight(ctx2, s.pts2d);
  }
  ctx2.restore();
}

// ⛔ **확정 전 미리보기(`drawPreview`)를 지웠다**(지시 1·3) — 확정이 자동이라
// "확정 전인데 카메라가 선" 창이 없어졌고, "지금 확정하면 N 올라감"은 상태 노출이었다.


/** 승격에서 잃은 것의 색. 상태 패널의 문장과 **같은 값을 쓴다** — 갈리면 설명이 안 맞는다. */
const LOSS_COLOR = { dropped: "#e67e22", snap: "#c0392b" };

/**
 * 스냅 표식(§3 "표시"). **종류마다 다른 색과 라벨** — SketchUp의 관행 그대로다(A-3).
 * 표식이 없으면 사용자는 무엇에 붙었는지 모르고, 그러면 **조용히 틀린 배치**가 된다.
 */
/**
 * **종류별 아이콘**(§3 "표시", 사람 지시 — 오스냅). 색만으로는 안 갈린다.
 * 모양 배정은 `snap.ts`의 `SNAP_ICON` 하나가 정한다(#17: 표시 규약도 단일 출처).
 */
function drawSnapIcon(ctx2: CanvasRenderingContext2D, kind: SnapKind, x: number, y: number,
                      r = 6): void {
  ctx2.strokeStyle = SNAP_COLOR[kind];
  ctx2.fillStyle = SNAP_COLOR[kind];
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  switch (SNAP_ICON[kind]) {
    case "square":
      // **정점은 채운 네모, 끝점은 빈 네모** — 같은 모양의 강약이 그 관계를 말한다
      if (kind === "vertex") ctx2.fillRect(x - r + 1, y - r + 1, 2 * r - 2, 2 * r - 2);
      else ctx2.strokeRect(x - r + 1, y - r + 1, 2 * r - 2, 2 * r - 2);
      return;
    case "diamond":
      ctx2.moveTo(x, y - r); ctx2.lineTo(x + r, y); ctx2.lineTo(x, y + r); ctx2.lineTo(x - r, y);
      ctx2.closePath(); break;
    case "cross":
      ctx2.moveTo(x - r, y - r); ctx2.lineTo(x + r, y + r);
      ctx2.moveTo(x + r, y - r); ctx2.lineTo(x - r, y + r); break;
    case "tee":                                  // 수선 발 — 라이노의 ⊥ 표식
      ctx2.moveTo(x - r, y + r); ctx2.lineTo(x + r, y + r);
      ctx2.moveTo(x, y + r); ctx2.lineTo(x, y - r); break;
    case "triangle":
      ctx2.moveTo(x, y - r); ctx2.lineTo(x + r, y + r); ctx2.lineTo(x - r, y + r);
      ctx2.closePath(); break;
    default:                                     // circle — 선 위 근처점
      ctx2.arc(x, y, r - 1, 0, Math.PI * 2); break;
  }
  ctx2.stroke();
}

/** 표식 + **툴팁**(종류와 그것이 무엇을 정하는지). 표식이 없으면 조용히 틀린 배치가 된다.
 *  2D 후보(`Snap2Cand`)도 같은 표식을 쓴다(4차 지시 1 — 표시 규약은 종류가 정하지 좌표계가 아니다). */
function drawSnapMark(ctx2: CanvasRenderingContext2D,
                      cand: { kind: SnapKind; screen: Pt2 } | null = hoverSnap,
                      tip = true) {
  if (!cand) return;
  const [x, y] = cand.screen;
  ctx2.save();
  drawSnapIcon(ctx2, cand.kind, x, y);
  ctx2.globalAlpha = 0.9;
  ctx2.font = "11px system-ui, sans-serif";
  ctx2.fillStyle = SNAP_COLOR[cand.kind];
  ctx2.fillText(SNAP_LABEL[cand.kind], x + 9, y - 8);
  if (tip) {
    // **툴팁** — 라이노가 스냅 이름 옆에 무엇인지 낸다. 옅게 두어 그림을 안 가린다
    ctx2.globalAlpha = 0.55;
    ctx2.font = "10px system-ui, sans-serif";
    ctx2.fillText(SNAP_TIP[cand.kind], x + 9, y + 5);
  }
  ctx2.restore();
}

/**
 * **실시간 미리보기**(L-B.4 · §4 "실시간 색"). 앵커에서 커서까지, **판정된 축의 색**으로.
 * 축이 안 잡히면 회색 점선 — **없는 판정을 색으로 지어내지 않는다**(A-3).
 */
function drawLivePreview(ctx2: CanvasRenderingContext2D) {
  if (!live) return;
  // **지금 시점의 투영으로 되쏜다**(L-B.8) — `live.seg`는 세계 좌표이고
  // 확정 카메라로 쏘면 돌린 뷰에서 엉뚱한 자리에 나온다
  const fr = frame();
  if (!fr) return;
  const c = fr.ctx;
  const a = live.anchor.screen;
  ctx2.save();
  if (live.seg) {
    const b = project(fr.toV(live.seg[1]), c.principal, c.f);
    if (b) {
      // **가장 연하다**(E의 넷째 단계) — 미리보기는 보조선이고 결과물이 아니다.
      // 옛 판은 여기가 가장 진했다(알파 0.85·굵기 3).
      // ⚠ **축이 `null`일 수 있다** — 양 끝 스냅으로 놓이는 획은 세그먼트가 있어도 축이
      // 미분류다(D-L46). 옛 판은 `strokeStyle = undefined`가 조용히 무시됐는데
      // `paler()`는 문자열을 요구하므로 **던졌다**(종단 확인이 `PAGEERROR`로 잡았다).
      ctx2.strokeStyle = paler(live.axis != null ? AXIS_COLOR[live.axis] : "#444444",
                               PREVIEW_INK.gray);
      ctx2.lineWidth = PREVIEW_INK.width; ctx2.globalAlpha = PREVIEW_INK.alpha;
      ctx2.setLineDash([]);
      ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke();
    }
  }
  // 앵커 표식은 항상 — 어디에 못박혔는지가 판정보다 먼저다
  ctx2.globalAlpha = 1; ctx2.setLineDash([]);
  drawSnapIcon(ctx2, live.anchor.kind, a[0], a[1], 5);
  ctx2.restore();
  // **끝점 스냅도 표식을 낸다**(D-L46) — 양 끝이 붙었다는 것이 보여야 두 점 확정을 안다.
  // 툴팁은 앵커 쪽만 낸다(둘 다 내면 그림을 가린다)
  if (live.end) drawSnapMark(ctx2, live.end, false);
}

/**
 * **카메라가 서기 전의 미리보기**(A-2) — 화면 가로·세로로 스냅된 직선.
 *
 * `drawLivePreview`와 갈라 두는 이유는 그것이 3D 앵커를 요구하기 때문이다. 여기서는
 * 화면 좌표 둘뿐이고 3D가 없다 — **없는 판정을 색으로 지어내지 않는다**(A-3):
 * 축 번호가 아직 없으므로 축 색을 안 쓰고 **회색**으로 그린다.
 */
function drawLive2d(ctx2: CanvasRenderingContext2D) {
  if (!live2d) return;
  const { a, b, ortho, start2, end2, vpdir, guides } = live2d;
  ctx2.save();
  // **소실점 방향은 그 축 색으로**(4차 지시 2-c) — 색이 "이 방향이 축이 된다"를 말한다
  const tone = vpdir ? AXIS_COLOR[vpdir.axis] : "#555";
  ctx2.strokeStyle = tone; ctx2.lineWidth = 2.5; ctx2.globalAlpha = 0.55;
  ctx2.setLineDash([]); ctx2.lineCap = "round";
  ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke();
  // **무엇에 붙었는지 보인다**(#7) — 표식이 없으면 조용히 끌려간 것이 된다
  if (ortho || vpdir) {
    ctx2.globalAlpha = 0.8;
    ctx2.font = "11px system-ui, sans-serif"; ctx2.fillStyle = tone;
    const label = vpdir ? `축${vpdir.axis + 1} 방향`
      : ortho!.dir === "h" ? "화면 가로" : "화면 세로";
    const at = vpdir ? vpdir.at : ortho!.at;
    ctx2.fillText(label, at[0] + 8, at[1] - 6);
  }
  ctx2.restore();
  // **2D 오스냅 표식**(4차 지시 1) — 3D 판(`drawLivePreview`)과 같은 규약: 시작은 작은 표식,
  // 끝은 라벨 있는 표식(툴팁은 그림을 가리므로 안 낸다)
  if (start2) {
    ctx2.save(); ctx2.globalAlpha = 1; ctx2.setLineDash([]);
    drawSnapIcon(ctx2, start2.kind, start2.at[0], start2.at[1], 5);
    ctx2.restore();
  }
  if (end2) drawSnapMark(ctx2, { kind: end2.kind, screen: end2.at }, false);
  // **관계 스냅 가이드**(4차 지시 5-c) — 근원점에서 끌린 자리까지 옅게 뻗는다.
  // 색은 정렬 도구 관행(마젠타 계열)이고 그리기 색과 안 겹친다
  for (const g of guides) {
    ctx2.save();
    ctx2.strokeStyle = "#c0409a"; ctx2.fillStyle = "#c0409a";
    ctx2.lineWidth = 1; ctx2.globalAlpha = 0.5; ctx2.setLineDash([4, 3]);
    ctx2.beginPath(); ctx2.moveTo(g.from[0], g.from[1]); ctx2.lineTo(g.to[0], g.to[1]); ctx2.stroke();
    ctx2.setLineDash([]);
    ctx2.beginPath(); ctx2.arc(g.from[0], g.from[1], 2.5, 0, Math.PI * 2); ctx2.fill();
    ctx2.restore();
  }
}

/**
 * 화면 점에서 가장 가까운 획. **2D 대기 획과 3D 획을 함께 본다** —
 * §9.5가 지우려는 것이 "영원히 안 올라가는 획"이지만 지우기는 둘 다에 필요하다.
 *
 * 3D 획은 **지금 시점으로 되쏜 선분**과 비교한다(L-B.8) — 돌린 뷰에서도 눈에 보이는 자리다.
 */
function pickStroke(p: Pt2, rPx?: number): string | null {
  return nearestSeg(p, pickSegs(), rPx ?? PICK_TOL.radius_ratio * Math.hypot(...cssSize()));
}

/** 고를 수 있는 것들의 **화면 선분**. 3D는 지금 시점으로 되쏘고 2D는 그린 좌표 그대로다. */
function pickSegs(): PickSeg[] {
  const fr = frame();
  const out: PickSeg[] = [];
  for (const st of doc.strokes) {
    if (st.seg3d && fr) {
      const a = project(fr.toV(st.seg3d[0]), fr.ctx.principal, fr.ctx.f);
      const b = project(fr.toV(st.seg3d[1]), fr.ctx.principal, fr.ctx.f);
      if (a && b) out.push({ id: st.id, a, b });
    } else if (!st.seg3d && st.pts2d.length >= 2 && (!cam.standing() || viewIsCurrent())) {
      // 2D 대기 획은 **그린 뷰의 화면 좌표**다 — 다른 뷰에서는 안 고른다(§9.2)
      out.push({ id: st.id, a: st.pts2d[0], b: st.pts2d[st.pts2d.length - 1] });
    }
  }
  return out;
}

/** 고른 획을 굵게 그린다 — **무엇에 작용하는지 보이지 않으면 조작이 아니다.** */
function drawPicked(ctx2: CanvasRenderingContext2D) {
  if (!picked) return;
  const st = doc.strokes.find(x => x.id === picked);
  if (!st) return;
  const fr = frame();
  let a: Pt2 | null = null, b: Pt2 | null = null;
  if (st.seg3d && fr) {
    a = project(fr.toV(st.seg3d[0]), fr.ctx.principal, fr.ctx.f);
    b = project(fr.toV(st.seg3d[1]), fr.ctx.principal, fr.ctx.f);
  } else if (!st.seg3d) { a = st.pts2d[0]; b = st.pts2d[st.pts2d.length - 1]; }
  if (!a || !b) return;
  ctx2.save();
  ctx2.strokeStyle = "#0a84ff"; ctx2.lineWidth = 5; ctx2.globalAlpha = 0.55;
  ctx2.lineCap = "round"; ctx2.setLineDash([]);
  ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke();
  ctx2.restore();
}

function drawBelowInk(ctx2: CanvasRenderingContext2D) {
  // **그리드·가이드·소실점 표식은 확정 뷰의 화면 좌표다.** 자유 시점에서 그리면
  // 화면에 붙어 따라다니는 유령이 된다 — 그래서 그 셋만 확정 시점으로 묶는다.
  // **스냅 표식과 미리보기는 지금 시점의 화면 좌표**라 어느 뷰에서든 옳다(L-B.8).
  drawHorizon(ctx2);          // **언제나 깔린다** — 카메라가 서기 전에도(사람 지시 2)
  drawDirLines(ctx2);              // **무한직선**(4-2) — 그린 구간 아래에 옅게 깐다
  drawExtensionHint(ctx2);         // **연장선 안내선**(13차 항목 3-d) — 옅게, 발동하면 진하게
  drawPending(ctx2);
  drawPicked(ctx2);
  // **2D 후보의 표식도 같은 자리에서 낸다**(4차 지시 1) — 3D가 있으면 3D가 이긴다(질의와 같은 순서)
  drawSnapMark(ctx2, hoverSnap ?? (hover2d ? { kind: hover2d.kind, screen: hover2d.at } : null));
  drawLivePreview(ctx2);
  drawLive2d(ctx2);                     // **카메라가 서기 전의 화면 직교·2D 오스냅**(A-2·지시 1)
  // **작도 화면이면 돌린 시점에서도 그린다**(14차 항목 6 — 옛 판은 핀 전용). 모델링
  // 시점(축 비정렬·피치≠0)에서만 숨긴다 — 거기 그리면 화면에 붙은 유령이 된다.
  if (cam.standing() && !stage.isPinned && !draftingNow()) return;
  drawGrid(ctx2);
  if (!cam.standing() || stage.isPinned) {
    // 대기 풀 가이드·물음은 **확정 카메라의 화면 좌표**다 — 돌린 작도 시점에는 안 그린다
    drawPendingVpGuides(ctx2);     // **잠정 그리드**(6차 지시 11-4) — 확정 전 대기 깊이선
    drawAsk(ctx2);
  }
  const [w, h] = cssSize();
  // **소실점은 지금 시점의 값이다**(항목 6-c) — 핀이면 확정 카메라 값과 같다(#17)
  const ovl = viewOverlayCtx();
  const vpsNow = ovl?.vps ?? cam.vps();
  // **무한원 축은 소실점이 없으므로 방향으로 표시한다**(15차 항목 8-e · D-L101).
  // 화면 가장자리에 그 축 색의 짧은 이중 화살촉을 둔다 — 유한 소실점의 가장자리 표시와
  // 같은 자리·같은 색이되 **점이 아니라 방향**이라는 것이 보이게.
  // ⚠ 표식 자리 계산은 `overlayAxisMarks` 하나다(#17) — 종단이 같은 함수를 읽는다.
  if (ovl) {
    for (const m of overlayAxisMarks(ovl.axisVps, [w, h])) {
      if (m.kind !== "infinite") continue;        // 유한 소실점은 아래 루프가 그린다
      ctx2.save();
      ctx2.globalAlpha = 0.5; ctx2.strokeStyle = AXIS_COLOR[m.axis]; ctx2.lineWidth = 2;
      const cx = w / 2, cy = h / 2;
      for (const s2 of [1, -1]) {
        const px = cx + (m.at[0] - cx) * s2, py = cy + (m.at[1] - cy) * s2;
        ctx2.beginPath();
        ctx2.moveTo(px - m.dir[0] * 12 * s2 - m.dir[1] * 6,
                    py - m.dir[1] * 12 * s2 + m.dir[0] * 6);
        ctx2.lineTo(px, py);
        ctx2.lineTo(px - m.dir[0] * 12 * s2 + m.dir[1] * 6,
                    py - m.dir[1] * 12 * s2 - m.dir[0] * 6);
        ctx2.stroke();
      }
      ctx2.restore();
    }
  }
  // ⛔ **거리점 표시를 지웠다**(지시 2) — 거리점 경로 전체가 폐기됐다.
  vpsNow.forEach((v, i) => {
    if (!v) return;
    const inside = v[0] >= 0 && v[0] <= w && v[1] >= 0 && v[1] <= h;
    ctx2.save();
    ctx2.globalAlpha = 0.8; ctx2.fillStyle = AXIS_COLOR[i];
    if (inside) {
      // **표식을 줄였다**(지시 5-6) — 소실점은 참조점이지 그림이 아니다
      ctx2.beginPath(); ctx2.arc(v[0], v[1], 3, 0, Math.PI * 2); ctx2.fill();
    } else {
      // **화면 밖 소실점을 가장자리에 표시한다**(6차 지시 7-e). 화면 밖은 **정상**이고
      // (건축 투시도는 폭의 두세 배가 보통이다) 사용자가 **어디 있는지 알아야 조정할 수 있다.**
      // 축소 뷰 대신 가장자리 화살표를 쓴다 — 축소 뷰는 두 좌표계를 만든다(A-3: 단순한 쪽).
      const cx = w / 2, cy = h / 2;
      const dx = v[0] - cx, dy = v[1] - cy;
      const L = Math.hypot(dx, dy) || 1;
      // 화면 안쪽 여백까지 죈다 — 표식이 잘리지 않게
      const pad = VP_EDGE.padPx;
      const t = Math.min((cx - pad) / Math.abs(dx || 1e-9), (cy - pad) / Math.abs(dy || 1e-9));
      const ex = cx + dx * t, ey = cy + dy * t;
      const ux = dx / L, uy = dy / L, s = VP_EDGE.sizePx;
      ctx2.beginPath();                                    // 바깥을 가리키는 삼각형
      ctx2.moveTo(ex + ux * s, ey + uy * s);
      ctx2.lineTo(ex - uy * s * 0.6 - ux * s * 0.4, ey + ux * s * 0.6 - uy * s * 0.4);
      ctx2.lineTo(ex + uy * s * 0.6 - ux * s * 0.4, ey - ux * s * 0.6 - uy * s * 0.4);
      ctx2.closePath(); ctx2.fill();
      // 얼마나 먼가 — **화면 폭 배수**로 낸다(화각 게이트가 가르는 그 양이다, 지시 7-b)
      ctx2.globalAlpha = 0.6;
      ctx2.font = "11px system-ui, sans-serif";
      ctx2.textAlign = ex > cx ? "right" : "left";
      ctx2.textBaseline = ey > cy ? "bottom" : "top";
      ctx2.fillText(`${(L / w).toFixed(1)}W`,
                    ex - ux * s * 1.6, ey - uy * s * 1.6);
    }
    ctx2.restore();
  });
}

// ---------------------------------------------------------------- 입력

const ink = new InkCanvas(canvas, {
  onBackground: drawBelowInk,
  // **모델링 화면에서는 안 그린다**(14차 항목 6-e — A-3: 축 스냅은 어느 시점에서든 서지만
  // 소실점이 화면 밖 극단이면 무의미해진다. 단순한 쪽 = 그리려면 복귀). 카메라 조작은 그대로다.
  inkAllowed: () => draftingNow(),
  onInkBlocked: () => {
    lastSnapNote = "**모델링 화면**입니다 — 그리려면 「작도 시점으로」 버튼이나 큐브 면 탭으로 복귀하세요";
    refresh();
  },
  // **스냅이 걸린 동안 원시 궤적을 숨긴다**(5차 지시 4) — 스냅된 미리보기 하나만 보인다
  liveHidden: () => !!(live && live.seg) || !!live2d,
  // **입력 장치가 도구를 가른다**(G): 펜·마우스는 잉크, **터치는 언제나 카메라**다.
  // 마우스는 `궤도(마우스)`를 누른 동안만 카메라로 간다(데스크톱 확인용).
  onCamera: (id, phase, p) => gestures.onPointer(id, phase, p),
  cameraMouse: () => tool === "orbit",
  // **휠 — 그리는 중에는 화면 줌**(14차 항목 5 · D-L94: 옛 판은 gestures.onWheel이
  // begin()으로 핀을 풀고 달리를 돌렸다 — "확대하려는데 카메라가 3D에서 움직인다"의
  // 데스크톱 경로). 커서 자리를 고정점으로 종이를 확대한다. 궤도 뒤에는 종전대로 달리다.
  onWheel: (d, at) => {
    if (stage.isPinned || !cam.standing()) {
      // 배율 환산은 three의 휠 규약 그대로다(camGesture.onWheel과 같은 밑 — #17)
      const k = Math.pow(GESTURE_TOL.wheel_base, Math.abs(d) * 0.01);
      stage.setViewZoom(stage.viewZoom * (d < 0 ? 1 / k : k), at);
      refresh();
      return;
    }
    gestures.onWheel(d);
  },
  // **화면 팬**(10차 항목 5) — 종이가 밀리는 것은 그리는 중(핀 또는 카메라 전)뿐이다.
  // 궤도 시점의 표시는 카메라가 정하므로 오프셋이 없다(0). 입력·표시가 같은 훅을 지난다(#17)
  viewOffset: () => ((stage.isPinned || !cam.standing()) ? stage.viewPan : [0, 0]),
  // **화면 줌**(14차 항목 5 · D-L94) — 같은 조건에서 표시 배율. 궤도 시점은 1이다
  viewScale: () => ((stage.isPinned || !cam.standing()) ? stage.viewZoom : 1),
  // **위치로 갈리는 끌기가 생겼다**(D-L45) — 지평선 손잡이 위면 그리기가 아니라 끌기다
  dragMode: (p) => tool === "edit" || tool === "erase_seg" || tool === "erase_part" || horizonGrab(p),
  onDrag: (p, phase) => {
    // **지평선 끌기**(D-L45, QUESTIONS g) — 그리는 도구 안에서 손잡이 위에서만 시작한다.
    // 끄는 동안 카메라 피치가 돌고, 사용자는 **그림의 지평선을 옮긴다**고 인식한다
    if (tool === "draw") {
      if (phase === "down") {
        if (!horizonGrab(p)) return;
        pushUndo();                      // 되돌리기가 지평선을 담는다(`appSnap`의 `rules`)
        horizonDrag = true;
      }
      if (!horizonDrag) return;
      cam.setHorizon(p[1]);
      if (phase === "up") horizonDrag = false;   // ⛔ 안내 문구를 뺐다(지시 3 — 시스템 사정)
      refresh();
      return;
    }
    // **지우개**(지시 I). 조각: 누르거나 스치면 그 조각이 사라진다(SketchUp).
    // 부분: 끌면서 지나간 자리만 — 떼는 순간 확정한다(분할의 특수한 경우)
    if (tool === "erase_seg") {
      if (phase === "down" || phase === "move") eraseSegmentAt(p);
      refresh();
      return;
    }
    if (tool === "erase_part") {
      if (phase === "down") partErase = new Map();
      if (partErase && (phase === "down" || phase === "move")) erasePartSample(p);
      if (phase === "up") erasePartCommit();
      refresh();
      return;
    }
    // **고치기**(L-D.1, §9.5) — 누르는 순간 고른다. 빈 곳이면 선택이 풀린다(A-3: 선례 그대로)
    if (tool === "edit") {
      if (phase !== "down") return;
      const hit = pickStroke(p);
      picked = hit;
      const st = hit ? doc.strokes.find(x => x.id === hit) : null;
      note = st
        ? `고름 — ${st.seg3d ? "3D" : "2D 대기"} 획 · 축 `
          + (typeof st.axis === "number"
             ? `<b style="color:${AXIS_COLOR[st.axis]}">축${st.axis + 1}</b>`
               + (st.userAxis ? " <b>(사용자 지정)</b>" : "")
             : `<span class="warn">${st.axis === "free" ? "미정" : String(st.axis)}</span>`)
          + ` · 펜 <b style="color:${CHANNEL_UI[st.channel].color}">${CHANNEL_UI[st.channel].name}</b>`
          + " <span class=\"dim\">· ← 축1 · → 축2 · ↑ 축3 · 1 보조선 · 2 결과선 · 3 주석 · Delete 삭제</span>"
        : "선택을 풀었습니다";
      refresh();
      return;
    }
  },
  onHover: (p) => {
    const fr = p ? frame() : null;
    const sc = fr ? snapCtx(fr) : null;
    const segs = snapSegs(fr?.toV);
    const next = (sc && tool === "draw") ? appSnapAt(p!, segs, sc, snapStatic(segs, fr!.poseKey)) : null;
    // **2D 대기 획의 표식**(4차 지시 1) — 3D가 없거나(카메라 전) 못 붙을 때만. 3D가 이긴다
    const next2 = (p && tool === "draw" && !next) ? snap2At(p) : null;
    // 값이 안 바뀌면 다시 그리지 않는다 — 포인터마다 전체 재그리기가 돌면 안 된다
    const same = (!next && !hoverSnap)
      || (!!next && !!hoverSnap && next.kind === hoverSnap.kind
          && Math.abs(next.screen[0] - hoverSnap.screen[0]) < 0.5
          && Math.abs(next.screen[1] - hoverSnap.screen[1]) < 0.5);
    const same2 = (!next2 && !hover2d)
      || (!!next2 && !!hover2d && next2.kind === hover2d.kind
          && Math.abs(next2.at[0] - hover2d.at[0]) < 0.5
          && Math.abs(next2.at[1] - hover2d.at[1]) < 0.5);
    hoverSnap = next;
    hover2d = next2;
    if (!same || !same2) refresh();
  },
  onLive: (pts) => {
    // **그리는 중**: 앵커는 첫 점의 스냅, 끝점은 커서. 확정과 **같은 함수**를 쓴다(#17)
    const fr = frame(), sc = snapCtx(fr);
    // **카메라가 서기 전에도 화면 가로·세로는 스냅된다**(A-2) — 추정할 것이 없기 때문이다.
    // 이 갈래가 없으면 **첫 획부터 아무 스냅도 안 돈다**(A-1이 본 증상).
    if (!fr || !sc) {
      live = null;
      // 주석 채널은 2D 판정을 안 지난다(12차 4-c) — 확정과 같은 조건(#17 · §11)
      live2d = (tool === "draw" && pts.length >= 2 && channel !== "note")
        ? (() => {
            // **확정과 같은 함수**(`resolve2d`) — 오스냅 > 방향 > 관계 스냅(#17·§11)
            const r = resolve2d(pts.map(q => [q[0], q[1]] as Pt2));
            return r.engaged
              ? { a: r.a, b: r.b, ortho: r.ortho, start2: r.start2, end2: r.end2,
                  vpdir: r.vpdir, guides: r.guides }
              : null;
          })()
        : null;
      refresh(); return;
    }
    live2d = null;
    if (tool !== "draw" || pts.length < 2) { live = null; refresh(); return; }
    const c = fr.ctx;
    const a0: Pt2 = [pts[0][0], pts[0][1]];
    const b0: Pt2 = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
    const segs = snapSegs(fr.toV);
    // **자격 검사를 미리보기도 지난다**(14차 항목 0-a · #17 — `anchorQualified` 머리말):
    // on_edge·on_face는 확정이 앵커로 안 쓰므로(D-L83) 미리보기도 그 앵커의 3D 축 선을
    // 보이면 안 된다 — 표식(hoverSnap)은 그대로 남는다("표시·미리보기는 그대로"의 표시 몫).
    const cand0 = live?.anchor ?? appSnapAt(a0, segs, sc, snapStatic(segs, fr.poseKey));
    const anchor = cand0 && anchorQualified(cand0.kind as SnapKind) ? cand0 : null;
    if (!anchor) {
      live = null;
      // **무앵커 획도 미리보기가 확정과 같은 판을 보인다**(12차 항목 2 · #17 · §11).
      // 확정 경로(`placeStroke`의 대기 가지)가 이제 2D 판(`resolve2d`)을 지나므로,
      // 미리보기가 같은 함수를 안 부르면 "미리보기는 스냅되고 확정은 안 된다"의
      // 반대 방향(확정은 스냅되는데 미리보기가 안 보인다)이 생긴다.
      // 주석 채널은 여기서도 안 지난다(12차 4-c — 확정과 같은 조건).
      if (channel === "note") { live2d = null; refresh(); return; }
      const r = resolve2d(pts.map(q => [q[0], q[1]] as Pt2));
      live2d = r.engaged
        ? { a: r.a, b: r.b, ortho: r.ortho, start2: r.start2, end2: r.end2,
            vpdir: r.vpdir, guides: r.guides }
        : null;
      refresh(); return;
    }
    // ⚠ **옛 판은 여기서 `Shift`가 잡은 축을 기억했다**(`shiftHeld`) — D-L44로 그 뜻이
    // 바뀌면서 죽은 코드가 됐고 지웠다. 지금 `Shift`는 `freeStroke`이고 `resolveLive`가 본다
    //
    // **끝점도 스냅한다**(오스냅, D-L46) — 붙으면 **축 없이 두 점으로** 확정된다.
    // 미리보기가 그것을 그대로 보이므로 확정과 어긋날 여지가 없다(§11 게이트).
    const end = endSnapAt(fr, anchor.at, b0);
    // **연장선 미리보기 동조**(13차 항목 3 · #17) — 확정(placeLive)과 같은 판정을 지난다
    const extD = !end ? extensionOf(anchor, fr, a0, b0) : null;
    const r = resolveLive(c, anchor.at, anchor.screen, b0, end, extD);
    // **미리보기는 세계 좌표로 낸다** — 3D 층이 세계에서 그리기 때문이다(L-B.8)
    live = { anchor, axis: r.axis, deg: r.deg,
             seg: r.seg ? [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])] : null, locked: r.locked,
             ambiguous: r.ambiguous, tied: r.tied, end,
             ext: (r as { extension?: boolean }).extension === true };
    refresh();
  },
  onStrokeEnd: (stroke) => {
    const raw = stroke.points.map(p => [p[0], p[1]] as Pt2);
    ink.clear();                         // 잉크 버퍼는 문서가 아니다 — 우리가 그린다
    live2d = null;
    // **점 찍기 확정**(4차 지시 4-b) — 톡 찍은 자리가 대기 대각선 위의 점·교차점이면 그것이
    // 첫 소실점이다. "찍기"의 판정은 획 길이 ≤ 고르기 반경(PICK_TOL — 새 임계 없음, #17).
    if (tool === "draw" && raw.length >= 1 && !cam.standing()) {
      const tapLen = Math.hypot(raw[raw.length - 1][0] - raw[0][0],
                                raw[raw.length - 1][1] - raw[0][1]);
      if (tapLen <= PICK_TOL.radius_ratio * Math.hypot(...cssSize())) {
        pushUndo();
        const at = cam.pickVp(raw[0], OSNAP.radiusPx);
        if (at) {
          if (cam.standing()) standCamera();     // P1이면 그 자리에서 선다(feedCamera와 같은 관문)
          lastSnapNote = "소실점을 **찍은 자리**에 확정했습니다 — 지평선이 그 높이에 생깁니다";
          hoverSnap = null; hover2d = null; live = null;
          refresh(); return;
        }
        undoStack.pop();                         // 아무 일도 안 났다 — 스냅샷을 되물린다
      }
    }
    if (raw.length < 2 || tool !== "draw") { refresh(); return; }
    // **2D 오스냅 + 화면 직교 스냅**(A-2·4차 지시 1). 여기(주 경로)는 카메라가 서기 전에만
    // 돈다 — 그 뒤로는 3D 오스냅·축 스냅이 정하고, **3D에 못 붙은 무앵커 획은
    // `placeStroke`의 대기 가지가 같은 2D 판을 다시 지난다**(12차 항목 2 — 그 가지의 주석).
    // 미리보기(`onLive`)와 **같은 함수·같은 순서**를 부르므로 보인 대로 놓인다(§11 게이트).
    //
    // ⚠⚠ **방향 스냅이 걸린 선은 묻지 않고 그 축으로 확정한다**(5차 지시 3) — 축 스냅으로
    // 수평이 된 선은 사용자가 수평을 **의도한** 것이다(스냅이 곧 선언이다). 판정(물음)의
    // 대상은 **스냅이 안 걸린 자유 선뿐**이다(3-b). 4차의 "소실점이 있는 상태의 가로선은
    // 묻는다"(D-L53의 가드)는 하네스 기준이었고 실사용과 안 맞았다 — 그 가드는 자유 선에만
    // 남는다.
    // **주석 채널은 2D 판정을 안 지난다**(12차 지시 4-c — D-3: 주석은 기하가 아니다).
    // 방향·관계 스냅은 기하 선언이므로 주석에 걸면 판정을 탄 흔적(방향 이동·snap2d 기록)이
    // 남는다 — 실획 보고에서 note 획(s52·s53)이 그렇게 판정을 탔다.
    const r2d = (frame() || channel === "note") ? null : resolve2d(raw);
    const pts = r2d ? r2d.pts : raw;
    // ⛔ **`snapForced`를 지웠다**(2026-08-18 7차 지시 1-a). 5차 지시 3의 "스냅이 곧 선언이다"가
    // `stepRule`의 **P1 가드를 우회하고 있었다**: 직교 스냅이 걸린 선이 `forced === "screen"`으로
    // 들어가면 736행의 물음(소실점이 하나라도 서 있으면 묻는다)을 건너뛰고 **조용히 화면 가로축을
    // 선언**한다. P1은 불가역이므로(지시 1) 그 한 획이 그림 전체를 1점에 가둔다.
    // D-L79 ②는 **끝점 오스냅 가지에서만** 이 우회를 뺐고(`resolve2dCore`의 `ortho: null`),
    // 주 경로에는 살아 있었다. 지우는 쪽이 단순한 쪽이다(A-3).
    pushUndo();
    // ⚠⚠ **알림은 이 획의 것이다 — 앞 획의 것을 안 물려받는다**(2026-08-19 15차 항목 2).
    // `note`는 누가 다시 쓸 때까지 남는데, 그 자리에 **"지우고 다시 그으세요"**가 있으면
    // 그다음에 잘 그은 획에도 그 경고가 붙어 보인다 — 종단 실측이 그것을 잡았다
    // (⑧ 팔: 경고 뒤에 정확히 겨냥해 그은 획에서도 같은 문구가 그대로 남았다).
    // `lastSnapNote`는 이미 획마다 비운다(`placeStroke`) — 같은 규약을 여기 맞춘다(#17).
    // 측정 스위치(#30) — `S2S.setNoteClear(false)`가 수리 전 거동(경고가 남는다)이다.
    if (NOTE_CLEAR.on) note = "";
    // **승격 요약은 그 전환의 설명이다** — 획을 더 그리면 설명이 낡는다(AS-C7과 같은 형태).
    // 차수 되돌리기 버튼은 남는다 — 그것이 §6.2의 지속 수단이다
    // **§9.3 — 그리는 자리에서만 뷰가 생긴다.** 돌릴 때마다 만들면 뷰가 넘친다
    doc.currentView = viewForDrawing();
    const s = newSStroke(pts, doc.currentView, channel);
    // **2D 단계에서 걸린 오스냅을 기록한다**(2026-08-18 9차 항목 1 · D-L81).
    //
    // ⚠⚠ **여기가 8차까지 비어 있던 자리다.** `resolve2d`가 좌표를 옮기고 표식까지 그렸는데
    // 문서에는 아무 흔적도 안 남았다 — `applySnapToEnd`의 호출자 둘이 **전부 3D 경로**였고
    // 3D 참조(`Vec3`)에는 2D 단계의 스냅을 넣을 자리가 없었기 때문이다.
    // 새로 판정하는 것은 없다: `snap2Refs`가 `resolve2dCore`의 결과를 **옮겨 적을 뿐**이다
    // (#17 — 하네스가 같은 함수를 부른다. 그래서 `engaged == recorded`는 **보장**이다, #5).
    if (r2d) {
      const ref2 = snap2Refs(r2d);
      s.snap2dStart = ref2.start;
      s.snap2dEnd = ref2.end;
    }
    doc.strokes.push(s);
    // **① 규칙에 넣는다**(사람 지시 1) — 카메라를 세우고(NONE→P1·P2) 승격(P2→P3)하는
    // 유일한 경로다. 그은 선이 곧 제약이다: 화면 가로세로면 축 자체, 깊이면 교점.
    // 카메라가 선 뒤에도 넣는다 — 지지선 세기와 **3점 입구**(기울어진 수직선 물음)가 살아야
    // 하기 때문이다. 확정·승격은 `feedCamera` 안에서 자동으로 난다(지시 1 — 버튼이 없다).
    // **주석은 규칙에도 3D에도 안 들어간다**(D-3). 해칭·지시선·메모는 기하가 아니다 —
    // 그것으로 카메라를 정하면 **조용히 틀린 카메라**가 된다(A-3).
    //
    // ⚠⚠ **순서가 바뀌었다**(7차 지시 1-c): 카메라가 **이미 서 있으면 먼저 놓고 그 다음에**
    // 규칙에 넣는다. `placeStroke`가 확정 방향을 `pts2d`에 되쓰므로(위 `placeLive`),
    // 규칙이 받는 것이 **사용자가 본 그 선**이 된다. 옛 순서는 규칙이 원시 커서 궤적을 받았다.
    // 카메라가 아직 안 섰으면 놓을 수가 없으므로(3D 대상이 없다) 종전대로 규칙이 먼저다 —
    // 그때 규칙이 카메라를 세우면 아래에서 곧바로 놓는다.
    const fr0 = liftable(s) ? frame() : null;
    // **무엇이 이 획의 기하를 정했나** — 연결(양 끝 스냅·연장선)이면 규칙의 거절 알림을
    // 안 낸다(15차 항목 2 · D-L100 · `feedStroke`의 그 자리)
    const path0 = fr0 ? placeStroke(s, fr0) : null;
    // **커서가 이미 가른 것을 규칙에 넘긴다**(8차 지시 2-b) — 애매 구간의 물음은 조작이지
    // 물음이 아니다. ⚠ `forced`가 아니라 `hint`다: **P1 가드에는 안 닿는다**(D-L70을 안 되살린다).
    // 규칙은 `resolve2dCore`가 이미 쓴 그 규칙이다(#17 — 화면 직교 대 소실점 방향).
    const hint2d: "screen" | "depth" | undefined =
      r2d?.ortho ? "screen" : r2d?.vpdir ? "depth" : undefined;
    if (liftable(s)) {
      feedStroke(s, undefined, hint2d,
                 path0 === "two_point" || path0 === "extension");
    }
    // 확정 뒤에는 그 자리에서 푼다 — **승격 연쇄**의 첫 형태다(§9.1).
    // **돌린 시점에서도 돈다**(L-B.8) — `frame()`이 좌표 변환을 들고 있다
    const fr = fr0 ?? (liftable(s) ? frame() : null);
    if (fr) {
      // ⚠ **이미 놓였으면 다시 놓지 않는다**(13차 항목 2 리뷰어 [1]) — 확정 순간의 일괄
      // 풀이·지면 배치가 이 획을 올렸을 수 있고, 그때 다시 놓으면 **자기 끝점에 양 끝
      // 스냅**이 걸려(자기 자신이 snapSegs에 있다) 같은 획이 두 경로로 세어진다
      // (ground_anchor e2e에서 two_point 1 초과로 실측 — placeBy 합=전체가 그것을 잡았다).
      if (!fr0 && !s.seg3d) placeStroke(s, fr);     // 방금 섰다 — 이제 놓을 수 있다
      // **② 못 놓인 것은 일괄 풀이로** — 서로 이어진 2D 획들끼리 풀린다.
      // ⚠ **확정 뷰에서만 돈다** — `liftAll`은 소실점을 쓰고 그 소실점은 확정 카메라의 것이다.
      // 돌린 시점의 2D 획을 그 솔버에 넣으면 **다른 화면 좌표를 같은 카메라로 푸는 것**이다
      // ⚠⚠ **3D가 하나도 없을 때만 돈다**(10차 항목 1 · 지시 4-3/4-4). 일괄 풀이의 스케일은
      // **지면 게이지**(lift.ts — 성분의 최저점을 지면에)라, 확정 순간의 첫 성분(소실점을
      // 만든 선들)에는 그것이 **첫 앵커**지만(4-4), 그 뒤에 생긴 **떠 있는 성분**에는
      // 기존 기하와 무관한 **임의 좌표**다 — dir_state 픽스처에서 실측했다(허공의 깊이선+
      // 가로선 짝이 지면으로 내려가 붙었다). 확정 뒤의 좌표는 **연결이 정한다**(연쇄 ③).
      if (!s.seg3d && fr.pinned && !lifted(doc).length) {
        solveInto(fr.ctx, pending(doc, confirmView().id));
      }
      // **③ 승격 연쇄**(§9.1, L-B.7). ⚠ **조건 없이 돈다**(10차 항목 1 · 4-3 — "나중에 생긴
      // 연결에도 반응한다"): 옛 조건(`if (s.seg3d)`)은 **일괄 풀이가 남을 올린 턴**과
      // **이번 획이 대기 획에 끝으로 이어진 턴**을 놓쳤다 — 연쇄 안에서 대기 목록이 비면
      // 그 자리에서 끝나므로 비용은 자명하다.
      promoteChain(fr);
      syncScene();
    }
    hoverSnap = null; hover2d = null; live = null;
    refresh();
  },
});

/**
 * **획 하나를 그 자리에서 놓는다** — 시작점 스냅 → 끝점 스냅 → 축.
 * `onStrokeEnd`에서 떼어냈다(7차 지시 1-c): 카메라가 이미 서 있으면 **규칙보다 먼저** 돌아야
 * 규칙이 확정 방향을 받는다. 몸통은 옮기기 전과 같다.
 */
function placeStroke(s: SStroke, fr: Frame): PlacePath {
  let path: PlacePath = null;
  {
    {
      const pts = s.pts2d;
      // **① 시작점 스냅**(§3). 붙으면 그 획의 3D가 확정된다.
      const sc = snapCtx(fr);
      const segs0 = snapSegs(fr.toV);
      // **자격 검사를 지난 앵커만 좌표를 정한다**(D-L83 ①) — on_edge·on_face는 표시만
      const cand = sc ? anchorCandAt(pts[0], segs0, sc, snapStatic(segs0, fr.poseKey)) : null;
      lastSnapNote = "";
      if (cand) {
        applySnapToStart(s, cand, fr.fromV(cand.at));
        // **겨냥 거리는 스냅 전 원시 시작점으로 잰다**(7차 항목 2 — aimDistPx 머리말).
        // 옛 판은 `cand.dist`를 적어 on_face가 걸린 획이 전부 0이었다(실획 첫 표본)
        s.snapDistPx = aimDistPx(pts[0], segs0, sc!, snapStatic(segs0, fr.poseKey));
        // **끝점도 붙는가**(오스냅, D-L46) — 붙으면 **축 없이 두 점으로** 확정된다.
        // 미리보기(`onLive`)와 **같은 함수**를 부른다(#17: 미리보기와 확정이 갈릴 여지 없음)
        const endCand = endSnapRecord(s, fr, cand.at, pts[pts.length - 1]);
        if (endCand) applySnapToEnd(s, endCand, fr.fromV(endCand.at));
        {
          const p = placeLive(s, fr, cand.at, endCand);
          path = p || null;
          // 경로 이름으로 센다(#43) — 연장선(13차 항목 3)은 자기 칸이 있다
          if (p) placeBy[p === "axis" ? "start_anchor" : p] += 1;
        }
      } else if (onePointFrame(axisDirs(fr.ctx))
                 && guardedPlaceUnanchored(s, fr)) {
        // **1점 상태면 스냅 없이도 놓인다**(6차 지시 2-3 — "없으면 궤도 중심의 깊이").
        // 그리는 순간 3D에 있다 — **미승격이 없다**(지시 2). 시작점 스냅이 있으면 위
        // 분기가 그 점의 깊이를 쓰므로, 여기는 빈 곳에서 시작한 획만 온다.
        // ⚠ **가드가 켜져 있으면 이 분기는 막힌다**(D-L83 ② — 궤도 중심 깊이는 임의 좌표다).
      } else {
        // **미승격 2D 획도 계속 후보다**(4차 지시 1-b) — 3D 대상에 못 붙으면 **2D 판 전체**
        // (오스냅 > 방향 > 관계 — `resolve2dCore`)를 지난다. 3D가 이긴다(붙으면 그 획의
        // 3D가 확정되므로 정보가 더 많다). 획은 2D로 대기한다 — 나중에 승격 연쇄가 붙인다.
        //
        // ⚠⚠ **12차 항목 2 — 옛 판은 여기서 2D 연결(`snap2At`)만 하고 방향 스냅을 안 했다.**
        // 그래서 확정 카메라 아래의 무앵커 획은 미리보기도 방향 되쓰기도 없이 **원시 커서
        // 궤적**으로 남았고, 분류(`cam.axisOf`)가 완화 임계(angleWiden·rank_margin)로 축을
        // 배정하면 **축은 붙는데 방향은 안 붙었다** — 실획 보고의 Δ0.00~20.80°가 그 실측이다
        // (snapStart 있는 s78만 Δ0.00 — placeLive의 D-L71 되쓰기를 지나서다). 이제 카메라
        // 전과 **같은 함수**(`resolve2d`, #17)를 지나므로 겨냥이 조리개 안이면 방향이
        // 소실점을 정확히 지난다. D-L80 가드(방향 스냅이 depth 판정을 못 뒤집는다)도 그대로다.
        const r2 = resolve2d(s.pts2d, s.id);
        if (r2.engaged) s.pts2d = r2.pts.map(q => [q[0], q[1]] as Pt2);
        // **확정 뒤의 2D 연결도 같은 필드에 적는다**(10차 항목 1 · 4-3) — 이 기록이
        // 연쇄(`refAnchorOf`)의 재료다. 기록 규칙은 `snap2Refs` 하나다(#17 · D-L81).
        const ref2 = snap2Refs(r2);
        if (ref2.start) s.snap2dStart = ref2.start;
        if (ref2.end) s.snap2dEnd = ref2.end;
        if (segs0.length) {
          lastSnapNote = "시작점이 아무 대상에도 안 붙었습니다 — **2D로 대기**합니다";
          // **조리개 밖 겨냥도 기록한다**(지시 K, 리뷰어 [7]) — 스냅된 사건만 적으면 분포가
          // 조리개에서 절단돼 "반경을 넓혀야 하는가"를 영영 못 답한다. 40px(UI 상한) 프로브.
          // 정의는 `aimDistPx` 하나다(#17 — 7차 항목 2: on_face 제외·최근접)
          s.snapDistPx = aimDistPx(pts[0], segs0, sc!, snapStatic(segs0, fr.poseKey));
        } else if (ref2.start || ref2.end) {
          lastSnapNote = "2D 대기 획에 붙었습니다 — **2D로 대기**합니다";
        }
      }
    }
  }
  return path;
}
ink.setFrame("persp");

// ---------------------------------------------------------------- 화면

/**
 * **캔버스 크기가 굳었는가**(AS-C7, PITFALLS #22 — 이 프로젝트에서 세 번 걸렸다).
 * 관찰자를 더 걸지 않고 **쓰는 자리에서 스스로 고친다**.
 */
export const SIZE_HEAL = { count: 0, firstAtMs: null as number | null };

function sizeStale(): boolean {
  const [w, h] = cssSize();
  if (!(w > 2 && h > 2)) return false;
  const [pw, ph] = cam.imgSize;
  return Math.abs(pw - w) > 0.5 || Math.abs(ph - h) > 0.5;
}

function fit() {
  ink.resize();
  cam.resize(cssSize());
  stage.viewport.resize();
}

/**
 * **좌표 규약 진단**(D-C3, PITFALLS #21) — 옛 UI의 `s2s.diag()`가 하던 일을 여기로 옮겼다.
 *
 * 잉크가 dpr배 어긋나 그려지던 버그는 **데스크톱(dpr 1)에서도 Playwright 기본값에서도
 * 안 잡혔다.** 그것을 dpr 1·2·3에서 잠그는 것이 `e2e/coords.spec.ts`이고, 그 스펙이
 * 읽는 것이 이 함수다. **옛 UI를 지우면 이 자리가 없어지므로 먼저 옮긴다.**
 *
 * 갈리는 법(옛 주석 그대로):
 *   · 어긋남이 **원점에서 멀수록 커진다** → **배율**(백버퍼 ↔ CSS 불일치, dpr 이중 적용)
 *   · 어긋남이 **일정하다** → **오프셋**(rect 미적용·스크롤·안전영역)
 *
 * ⚠ **단일 뷰포트라 `view_vs_overlay`의 뜻이 달라졌다**(§10.3). 옛 UI는 2D 캔버스와 3D
 * 오버레이가 **따로** 있어 둘의 상자를 견줬는데, 여기서는 잉크 캔버스 하나가 three 렌더러
 * **위에 겹쳐** 있으므로 견주는 것은 **잉크 CSS 상자 ↔ 렌더러 뷰 크기**다.
 * 이름을 유지하는 이유는 그 스펙이 그 이름으로 잠그고 있기 때문이다(#17: 덮는 범위를 적는다).
 */
function frameDiag() {
  const r = canvas.getBoundingClientRect();
  const fi = ink.frameInfo();
  const vs = stage.viewport.viewSize();
  return {
    dpr: deviceRatio(),
    ink: {
      rect: [+r.left.toFixed(1), +r.top.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
      css: [fi.cssW, fi.cssH], back: [fi.backW, fi.backH], scale: [fi.sx, fi.sy],
      element: [canvas.width, canvas.height],
      /** **백버퍼가 CSS 상자와 안 맞으면 브라우저가 늘려 그린다** — 그것이 배율 어긋남이다. */
      stretch: [+(canvas.width / Math.max(1, r.width)).toFixed(4),
                +(canvas.height / Math.max(1, r.height)).toFixed(4)],
    },
    /** 잉크 캔버스와 three 렌더러가 **같은 CSS 상자**인가. 다르면 그 시점 좌표계가 갈린다. */
    view_vs_overlay: { renderer: vs, overlay: [fi.cssW, fi.cssH],
                       same: Math.abs(vs[0] - fi.cssW) < 0.6 && Math.abs(vs[1] - fi.cssH) < 0.6 },
    cam_img_size: cam.imgSize,
    size_heal: SIZE_HEAL.count,
    visual_viewport: typeof visualViewport !== "undefined" && visualViewport
      ? { offsetLeft: +visualViewport.offsetLeft.toFixed(1),
          offsetTop: +visualViewport.offsetTop.toFixed(1),
          scale: +visualViewport.scale.toFixed(3) }
      : null,
    scroll: [window.scrollX, window.scrollY],
  };
}

let refreshing = false;
function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    if (sizeStale()) {
      SIZE_HEAL.count += 1;
      SIZE_HEAL.firstAtMs ??= Math.round(performance.now());
      fit();
    }
    // ⚠⚠ **화면 글자를 먼저 그리고 잉크를 나중에 그린다.** 순서가 반대면 이렇게 된다:
    // `renderBar()`가 도구 막대의 높이를 바꾸면(렌즈 슬라이더가 붙는 순간이 그렇다)
    // `#frame`이 줄고 캔버스 CSS 크기가 바뀌어 **백버퍼가 새로 잡히면서 방금 그린 잉크가
    // 통째로 지워진다.** 그리고 다음 `refresh()`가 없으면 빈 화면으로 남는다 —
    // `coords.spec`의 "닿은 자리에 잉크가 나온다"가 **0픽셀**로 그것을 잡았다.
    renderBar();
    renderTools();          // 상단 우측 도구 묶음(5차 지시 6)
    renderSide();           // 좌측 지우개 크기 슬라이더(5차 지시 5)
    renderStatus();
    renderViews();
    // 막대가 커졌으면 여기서 크기를 맞춘다(AS-C7의 자가 치유와 같은 자리)
    if (sizeStale()) { SIZE_HEAL.count += 1; SIZE_HEAL.firstAtMs ??= Math.round(performance.now()); fit(); }
    ink.redraw();
    saver?.schedule();          // **자동 저장**(L-D.2). 디바운스가 있어 자주 불려도 한 번 쓴다
  } finally { refreshing = false; }
}

/** 지금 상태 → 저장 문서. **뷰와 뷰별 2D 획이 함께 간다**(§9.2). */
function buildDoc2(): Doc2 {
  return serializeDoc2({
    at: new Date().toISOString(),
    imgSize: cam.imgSize,
    cam: cam.acc.dump(),
    // **규칙 상태가 카메라의 입력이다**(2026-08-16) — 누산기 덤프는 그 귀결이다.
    // ⚠ `locked`·`order`·`lensMm`은 더 이상 저장하지 않는다(지시 1 — 파생 상태는 계산한다)
    rules: cam.dumpRules(),
    askStats: { ...askStats },
    pathStats: { ...pathStats },
    doc,
    seq: docSeq(),
  });
}

/** 저장 문서 → 지금 상태. **다시 풀지 않는다** — `seg3d`가 화면에 있던 그것이다. */
function applyDoc2(d: Doc2) {
  const r = restoreDoc2(d);
  doc = r.doc;
  setDocSeq(r.seq);
  // **규칙 상태를 되살린다** — 그것이 카메라의 입력이다(가이드가 아니다).
  // 옛 저장본(`rules`가 없다)은 규칙이 비어 카메라가 안 선다 — **조용히 틀리게 세우지 않는다**(A-3).
  cam.loadRules(d.rules ?? null);
  // ⚠ 옛 저장본의 `locked`·`order`·`lensMm`은 읽지 않는다 — 전부 `rules`에서 계산된다(지시 1)
  undoStack.length = 0;
  picked = null; ask = null;
  // ⚠⚠ **무대 카메라를 재수립한다**(7차 항목 1 — 실획 표본이 잡은 자리). 옛 판은 규칙만
  // 복원하고 무대를 안 건드려, 새로고침 뒤 three 카메라가 **생성 기본 자세**(viewport.ts의
  // `(3.2, 2.4, 3.6)`)에 비핀으로 남았다. 그 상태에서 frame()·궤도·viewForDrawing이 전부
  // 기본 자세를 읽는다 — 그리드·지평선·2D 층은 숨고, 궤도는 기본 자세에서 출발하고,
  // 그린 획은 유령 뷰로 간다("그릴 때마다 다른 곳"). 현재 뷰의 자세대로 무대를 세운다:
  // 확정 뷰(pose null)면 확정 카메라에 물리고, 저장된 시점이면 그 자세로 돌아간다.
  {
    // ⚠ **캔버스 크기가 굳어 있을 수 있다**(#22 — 복원은 로드 직후라 레이아웃 전일 수 있고,
    // 주점 `[W/2, 지평선 y]`·f가 크기에 딸린다). 쓰는 자리에서 자가 치유한다(refresh와 같은 규약)
    if (sizeStale()) {
      SIZE_HEAL.count += 1;
      SIZE_HEAL.firstAtMs ??= Math.round(performance.now());
      fit();
    }
    const c = cam.ctx();
    const v = doc.views.find(x => x.id === doc.currentView);
    if (c && v && v.pose) stage.setPose(v.pose, orbitTarget());
    else if (c) stage.pinTo(c.principal, c.f);
    else if (stage.isPinned) stage.unpin(null);   // 카메라가 안 서는 문서 — 핀 투영이 낡는다
  }
  syncScene();
  note = "";   // ⛔ 복원 요약을 뺐다(지시 3) — 열린 그림 자체가 보인다
  refresh();
}

function renderBar() {
  // **5차 지시 6-d — 하단바에는 파일·표시 토글(+마우스 전용 카메라·차수 되돌리기)만 남는다.**
  // 도구·채널·실행취소는 상단 우측 묶음(renderTools)으로 옮겼다(프로크리에이트 관행, 6-a·b).
  // ⚠ 버튼의 `data-act`·처리기는 그대로다(#17 — 바뀌는 것은 배치뿐).
  const btn = (id: string, label: string, on = false, dis = false, cls = "") =>
    `<button data-act="${id}"${on || cls ? ` class="${[on ? "on" : "", cls].filter(Boolean).join(" ")}"` : ""}`
    + `${dis ? " disabled" : ""}>${label}</button>`;
  const fold = BAR_MENU.open ? "" : "folded";
  barEl.innerHTML = [
    // ---- 표시·스냅 토글 — **접이식**(4차 6-a). 기본 접힘
    btn("menu", `표시·스냅 ${BAR_MENU.open ? "▴" : "▾"}`, BAR_MENU.open),
    btn("axissnap", `축 스냅 ${AXIS_SNAP.on ? "켬" : "끔"}`, AXIS_SNAP.on, false, fold),
    btn("relsnap", `정렬 ${REL_SNAP.on ? "켬" : "끔"}`, REL_SNAP.on, false, fold),
    btn("showgrid", `격자 ${SHOW_GRID.on ? "켬" : "끔"}`, SHOW_GRID.on, false, fold),
    btn("showguide", `보조선 ${SHOW_GUIDES.on ? "보임" : "숨김"}`, SHOW_GUIDES.on, false, fold),
    btn("osnap", `스냅 ${OSNAP.radiusPx}px`, OSNAP.open, false, fold),
    ...(BAR_MENU.open && OSNAP.open ? [
      `<span class="osnap-panel">반경 <input type="number" min="4" max="40" step="1" `
        + `value="${OSNAP.radiusPx}" data-osnap-radius style="width:3.2em"> px</span>`,
      ...SNAP_ORDER.map(k =>
        `<button data-osnap-kind="${k}"${OSNAP.kinds[k] ? ' class="on"' : ""}`
        + ` title="${SNAP_TIP[k]}">${SNAP_LABEL[k]}</button>`),
    ] : []),
    btn("expguide", `보조선 내보내기 ${EXPORT_GUIDES.on ? "켬" : "끔"}`, EXPORT_GUIDES.on, false, fold),
    btn("viewcube", `뷰 큐브 ${viewCube.on ? "켬" : "끔"}`, viewCube.on, false, fold),
    // ---- 카메라 — **마우스 전용**(4차 6-b). 손가락 장치에서는 CSS가 숨긴다(l.html의 pointer: coarse)
    '<span class="sep mouse-only"></span>',
    `<button data-act="orbit" class="mouse-only${tool === "orbit" ? " on" : ""}"${!cam.standing() ? " disabled" : ""}`
    + ` title="마우스 전용입니다 — 손가락 1개는 궤도, 2개는 팬·줌이라 버튼이 필요 없습니다">궤도(마우스)</button>`,
    // **작도 시점 복귀**(14차 항목 6-f) — 모델링 화면에서만 켜진다(그 켜짐이 상태 표시를
    // 겸한다 — 지시 6-d "전환이 명확해야"). 터치에서도 보인다(복귀 조작이 눈에 띄어야 한다).
    // 옛 "확정 시점으로"(home — 핀 복귀·마우스 전용)는 그대로 둔다: 확정 프레임 정확 복귀는
    // 다른 물음이고 stage.spec의 세계 좌표 팔이 그 경로를 잰다.
    // ⚠ **버튼의 조건은 "이미 정렬된 작도 시점인가"다**(2026-08-19 15차 항목 3 · D-L102).
    // 옛 판은 `draftingNow()`(= 모델링이 아닌가)였는데 D-L102가 모델링을 사실상 없앴다 —
    // 그러면 버튼이 영영 안 켜진다. 피치 조건은 **그리기를 막는 자리에서 물러나** 여기
    // 남는다: 피치가 접혀 있으면 복귀할 곳이 없고, 서 있으면 접을 것이 있다.
    btn("draft", "작도 시점으로", false, !cam.standing() || stage.isPinned || alignedDraftNow()),
    btn("home", "확정 시점으로", false, !cam.standing() || stage.isPinned, "mouse-only"),
    // ---- 파일(오른쪽)
    '<span class="spacer"></span>',
    '<span class="grp">파일</span>',
    btn("json", ".brnl 저장", false, !doc.strokes.length),
    btn("obj", "OBJ", false, !lifted(doc).length),
    btn("gltf", "glTF", false, !lifted(doc).length),
    btn("clear", "비우기"),
  ].join("");
}

/**
 * **상단 우측 도구 묶음**(5차 지시 6-a·b — 프로크리에이트 관행: 우측 상단 도구, 오른손잡이가
 * 그리는 손에 안 가린다 6-e). 도구 네 개 + 채널 세 개 + 실행취소. 처리기는 하단바와 같은
 * 것을 쓴다(#17 — data-act 위임 하나).
 */
function renderTools() {
  const btn = (id: string, label: string, on = false, dis = false) =>
    `<button data-act="${id}"${on ? ' class="on"' : ""}${dis ? " disabled" : ""}>${label}</button>`;
  toolsEl.innerHTML = [
    '<div class="row">',
    btn("draw", "선 그리기", tool === "draw"),
    btn("erase_seg", "지우개(조각)", tool === "erase_seg", !doc.strokes.length),
    btn("erase_part", "지우개(부분)", tool === "erase_part", !lifted(doc).length),
    btn("edit", "선택", tool === "edit", !doc.strokes.length),
    '</div><div class="row">',
    ...(["guide", "result", "note"] as Channel[]).map(k =>
      `<button data-act="ch_${k}"${channel === k ? ' class="on"' : ""}`
      + ` style="border-left:4px solid ${CHANNEL_UI[k].color}"`
      + ` title="${k === "guide" ? "작도의 본체 — 3D로 올라가고 돌리면 흐려집니다"
                 : k === "result" ? "보조선 위를 덧그어 확정합니다 — 내보내기에 포함됩니다"
                 : "해칭·지시선·메모 — 3D로 안 올라가고 그린 뷰에서만 보입니다"}"`
      + `>${CHANNEL_UI[k].name}</button>`),
    btn("undo", "실행취소", false, !undoStack.length),
    '</div>',
  ].join("");
}

/**
 * **좌측 사이드바 — 지우개 크기 슬라이더**(5차 지시 5-c, 프로크리에이트의 크기 사이드바 자리).
 * 지우개 도구일 때만 보인다 — 다른 도구는 조절할 크기가 없다(선 굵기는 D-L62·지시 8의 고정값).
 */
function renderSide() {
  const on = tool === "erase_seg" || tool === "erase_part";
  sideEl.classList.toggle("hidden", !on);
  if (!on) return;
  sideEl.innerHTML =
    `<span class="val">지우개</span>`
    + `<input type="range" min="${ERASER.min}" max="${ERASER.max}" step="1" value="${ERASER.px}"`
    + ` data-eraser-size aria-label="지우개 크기(px)">`
    + `<span class="val" data-eraser-val>${ERASER.px}px</span>`;
}

/**
 * **묻는다**(사람 지시 1: "애매하면 사용자에게 묻는다. 추정하지 않는다").
 *
 * 두 가지만 묻는다:
 *   ① 화면 가로세로인가 깊이인가 — 임계 사이(`screen_axis_deg` ~ `depth_min_deg`)일 때
 *   ② 두 번째 수평축인가 수직축인가 — 선이 가팔라 갈리지 않을 때(3점 구도에서만 난다)
 *
 * ⚠ **답할 때까지 규칙은 안 움직인다.** 그 획은 2D로 대기하고 화면에 보라 점선으로 뜬다.
 */
/**
 * **남는 물음은 하나뿐이다**(2026-08-18 7차 지시 3-e·3-g).
 *
 * "두 번째 수평축입니까, 수직축입니까"가 없어졌다(3-b — 기울어진 선은 항상 깊이선이다).
 * 남은 것은 **화면 축 대 깊이**이고 그것은 차수를 정하는 물음이 아니라 4~8° 애매 구간의
 * 판정이다. **문구를 사용자의 말로 바꾼다**(3-g): "화면 가로세로 축 / 깊이선"은 도구의
 * 어휘이고, 사용자가 아는 것은 **그 선이 화면에 붙어 있는가 안으로 들어가는가**다.
 */
function renderAsk(): string {
  if (!ask) return "";
  const angles = `<span class="dim">수평과 ${ask.toH.toFixed(1)}° · 수직과 ${ask.toV.toFixed(1)}°`
               + ` (화면 축은 ${RULE_TOL.screen_axis_deg}° 이내 · 깊이는 ${RULE_TOL.depth_min_deg}° 밖)</span>`;
  // 어느 쪽에 가까운가로 문구를 고른다 — 가로선이면 "가로", 세로선이면 "세로"다
  const horiz = ask.toH <= ask.toV;
  const rows: string[] = [];
  rows.push('<div class="hdr"><b>이 선은 화면에 나란합니까, 안으로 들어갑니까?</b></div>');
  rows.push(`<div>${angles}</div>`);
  rows.push('<div><button data-act="ask_screen">'
    + (horiz ? "화면에 나란한 가로선" : "화면에 나란한 세로선") + '</button>'
    + ' <button data-act="ask_depth">안으로 들어가는 선</button>'
    + ' <button data-act="ask_skip">모르겠다(2D로 둔다)</button></div>');
  return `<div class="promote">${rows.join("")}</div>`;
}

// ⛔ **`renderPromoteReport`를 지웠다**(7차 지시 3-d) — 승격이 없으므로 요약할 것이 없다.
// `promoteDiff.diffSummary`(순수 모듈)는 남는다.

const md = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

function renderStatus() {
  // ⛔ **상태 패널을 비웠다**(2026-08-17 지시 3). 옛 판이 내던 것 — 차수·후보·소실점 수·
  // f와 출처·다음에 그을 것·슬롯 상태·스냅 반경·그리는 중 판정 — 은 전부 시스템 사정이고,
  // 알리면 "2D를 내보낸다 / 3D로 전환된다"는 인상을 준다. 사용자는 계속 종이에 그린 것이다.
  //
  // 남는 것 셋:
  //   ① **물음**(`renderAsk`) — 사용자가 답해야 진행되는 것(A-3: 추정하지 않는다)
  //   ③ **아무리 그려도 안 돌아갈 때의 최소 안내** — 빈도가 낮아야 한다(지시 3-d 예외).
  //      획을 여덟 이상 그렸는데 3D가 하나도 없을 때만 한 줄 낸다.
  const rows: string[] = [];
  const liftables = doc.strokes.filter(x => liftable(x)).length;
  if (!cam.standing() && liftables >= 8 && !lifted(doc).length && !ask) {
    rows.push('<div class="note">선이 아직 입체를 정하지 않았습니다 — '
      + '**서로 다른 방향의 기울어진 선 둘**(각자의 소실점), 또는 **가로선 하나와 기울어진 선 하나**가 '
      + '입체를 세웁니다</div>');
  }
  if (note) rows.push(`<div class="note">${note}</div>`);
  if (saveNote) rows.push(`<div class="dim">${saveNote}</div>`);
  statusEl.innerHTML = md(renderAsk() + rows.join(""));
}

// ---------------------------------------------------------------- 배선

// **도구 묶음도 같은 처리기를 쓴다**(#17) — data-act 위임 하나
const onActClick = (e: Event) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  // **오스냅 종류 토글**(지시 H) — 라이노처럼 종류마다 켜고 끈다
  const ok = (b as HTMLButtonElement).dataset.osnapKind as SnapKind | undefined;
  if (ok) { OSNAP.kinds[ok] = !OSNAP.kinds[ok]; hoverSnap = null; hover2d = null; refresh(); return; }
  const act = (b as HTMLButtonElement).dataset.act!;
  if (!act) return;
  if (act === "draw" || act === "orbit" || act === "edit"
      || act === "erase_seg" || act === "erase_part") {
    tool = act as Tool;
    if (act !== "edit") picked = null;
    if (act === "edit") {
      note = "**선택** — 획을 눌러 고른 뒤 <b>← 축1 · → 축2 · ↑ 축3</b>으로 지정하거나"
           + " <b>Delete</b>로 지웁니다. <span class=\"dim\">빈 곳을 누르면 선택이 풀립니다</span>";
    }
    // ⛔ **`pointerEvents = "none"` 전환을 지웠다**(G) — 궤도 동안 잉크 캔버스를 통째로
    // 비켜서면 그 사이 스냅·호버·펜이 전부 죽는다. 지금은 **마우스도 제스처층으로 간다**
    // (`cameraMouse()`가 `tool === "orbit"`을 본다). 잉크 캔버스는 언제나 받는다.
    if (act === "orbit" && stage.isPinned) {
      const segs = lifted(doc).map(s => ({ id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis }));
      stage.unpin(stage.centroid(segs));
      note = "";   // ⛔ 좌표계 설명을 뺐다(지시 3)
    }
  }
  else if (act.startsWith("ch_")) {
    channel = act.slice(3) as Channel;
    const ui = CHANNEL_UI[channel];
    note = "";   // 채널은 버튼 강조가 말한다(지시 3-c) — 설명은 버튼 툴팁에 있다
  }
  else if (act === "axissnap") {
    AXIS_SNAP.on = !AXIS_SNAP.on;
    note = `축 스냅 **${AXIS_SNAP.on ? "켬" : "끔"}** — `
         + (AXIS_SNAP.on
            ? "그리는 동안 방향이 축으로 **강제**됩니다(커서를 정확히 따라가지 않습니다). "
              + "<b>Shift</b>를 누르고 그으면 그 획만 자유입니다"
            : "그은 대로 놓입니다. 축이 안 정해지면 **2D로 대기**합니다")
         + " <span class=\"dim\">· <b>F8</b>(라이노 직교 모드)</span>";
    relive();
  }
  else if (act === "draft") {
    // **가장 가까운 작도 시점으로**(14차 항목 6-a·f) — 피치를 접고(2점) 축이 가까우면
    // 그 축으로(1점) 간다. 확정 프레임 정확 복귀는 home(아래)이 따로 한다.
    returnToDraft();
    note = "";
  }
  else if (act === "home") {
    const ctx = cam.ctx();
    if (ctx) { stage.pinTo(ctx.principal, ctx.f); tool = "draw";
               note = ""; }
  } else if (act === "undo") {
    // **문서만 되돌리면 안 된다**(L-C.2) — 승격을 되돌릴 때 소실점이 새 것으로 남으면
    // §6.1이 금지한 **좌표계가 섞인 상태**가 된다. `restoreSnap`이 둘을 함께 되돌린다
    const sn = undoStack.pop();
    if (sn) { restoreSnap(sn); note = ""; }
  }
  else if (act === "obj" || act === "gltf" || act === "json") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const nameOf = (id: string) => doc.views.find(v => v.id === id)?.name ?? id;
    if (act === "json") {
      // **자체 형식** — 뷰 목록과 **2D 레이어까지** 담는 유일한 경로다(OBJ·glTF는 3D만 낸다).
      // 확장자는 `.brnl`(Brunelleschi)이고 **내용은 JSON 그대로다** — 텍스트 편집기로 열리고
      // `git diff`가 되고 디버깅이 쉽다(사람 지시). MIME도 `application/json`으로 둔다.
      // **무결성이 깨진 문서는 내려받지 않는다**(7차 항목 1-c) — 실패를 기록한다
      try {
        download(JSON.stringify(buildDoc2(), null, 2), `brunelleschi-${stamp}.brnl`,
                 "application/json");
        note = `.brnl — 뷰 ${doc.views.length} · 획 ${doc.strokes.length} <span class="dim">(내용은 JSON이다)</span>`;
      } catch (err) {
        note = `<b>.brnl 저장 실패</b> — ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      // **채널이 내보내기를 가른다**(D-3): 결과선만 나가고 보조선은 옵션이다.
      // ⚠ **기본 채널이 보조선**이므로(D-1) 결과선을 한 번도 안 그으면 빈다 —
      // D-6("결과선을 강제하지 않는다")이 어긋나 보이지 않게 **몇 개가 왜 빠졌는지 낸다**(#7)
      const lines = linesFromDoc(doc, nameOf, { withGuides: EXPORT_GUIDES.on });
      const r = act === "obj" ? toObj(lines, { note: "Brunelleschi" })
                              : toGltf(lines, { note: "Brunelleschi" });
      const text = act === "obj" ? (r.data as string) : JSON.stringify(r.data);
      download(text, `brunelleschi-${stamp}.${act}`,
               act === "obj" ? "text/plain" : "model/gltf+json");
      const pend = doc.strokes.length - lifted(doc).length;
      const guides = lifted(doc).filter(x => x.channel === "guide").length;
      const notes = doc.strokes.filter(x => x.channel === "note").length;
      note = `${act.toUpperCase()} — 선 ${r.strokes}개`
           + (!EXPORT_GUIDES.on && guides
              ? ` <span class="warn">(보조선 ${guides}획 제외 — <b>보조선 내보내기</b>로 켭니다)</span>` : "")
           + (notes ? ` <span class="dim">(주석 ${notes}획은 3D가 없습니다)</span>` : "")
           + (pend ? ` <span class="dim">(2D 대기 ${pend - notes}획도 빠집니다)</span>` : "");
    }
  }
  else if (act === "showgrid") {
    SHOW_GRID.on = !SHOW_GRID.on;
    note = "";
  }
  else if (act === "menu") { BAR_MENU.open = !BAR_MENU.open; }
  else if (act === "relsnap") {
    REL_SNAP.on = !REL_SNAP.on;
    note = `정렬 스냅 **${REL_SNAP.on ? "켬" : "끔"}**`;
  }
  else if (act === "osnap") { OSNAP.open = !OSNAP.open; }
  else if (act === "showguide") {
    SHOW_GUIDES.on = !SHOW_GUIDES.on;
    syncScene();
    note = `보조선 **${SHOW_GUIDES.on ? "보임" : "숨김"}**`
         + ' <span class="dim">(표시만 바뀝니다 — 스냅 대상과 내보내기는 그대로입니다.'
         + ' 돌리면 자동으로 흐려지는 것은 이 토글과 별개입니다)</span>';
  }
  else if (act === "expguide") {
    EXPORT_GUIDES.on = !EXPORT_GUIDES.on;
    note = `보조선 내보내기 **${EXPORT_GUIDES.on ? "켬" : "끔"}**`
         + ' <span class="dim">(주석은 3D가 없으므로 어느 쪽이든 안 나갑니다)</span>';
  }
  else if (act === "viewcube") { viewCube.on = !viewCube.on; refresh(); }
  else if (act === "clear") {
    pushUndo();
    doc = newDoc(); cam.reset();
    syncScene(); note = ""; ask = null;
    // **저장본도 지운다** — 안 지우면 새로고침에서 방금 버린 작업이 되살아난다
    void deleteDoc2().catch(() => { /* 저장소가 없어도 화면은 비워졌다 */ });
  }
  refresh();
};
barEl.addEventListener("click", onActClick);
toolsEl.addEventListener("click", onActClick);

// **승격 요약 패널 안의 버튼**(L-C.2). 도구 막대와 같은 규약(`data-act`)을 쓴다 —
// 규약이 둘이 되면 다음 버튼을 어디에 다는지가 매번 판단거리가 된다
statusEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const act = (b as HTMLButtonElement).dataset.act;
  if (act === "ask_screen") answerAsk("screen");
  else if (act === "ask_depth") answerAsk("depth");
  else if (act === "ask_skip") {
    // **모른다고 답하는 것도 답이다** — 그 획은 2D로 남고 규칙은 안 움직인다(A-3)
    askStats.skipped += 1;
    ask = null;
    refresh();
  }
});

// ---- 축 고정(L-B.5, §4). **SketchUp 그대로**(A-3) — 새로 배울 것이 없다.
// 화살표 배정도 SketchUp의 화면 배치 그대로다(왼쪽=축1 · 위=수직축 · 오른쪽=축2).
const ARROW_AXIS: Record<string, 0 | 1 | 2> = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2 };
window.addEventListener("keydown", (e) => {
  // **고치기 모드가 먼저다**(L-D.1) — 같은 키를 쓰지만 대상이 다르다:
  // 그리는 중의 축 고정은 **다음 획**에, 여기는 **고른 획**에 건다
  if (tool === "edit" && picked) {
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deletePicked(); return; }
    const a = ARROW_AXIS[e.key];
    if (a != null) { e.preventDefault(); assignAxis(a); return; }
    // **사후 변경**(D-4) — 고른 획의 채널을 바꾼다. 자동 판정은 하지 않는다
    const ch: Record<string, Channel> = { "1": "guide", "2": "result", "3": "note" };
    if (ch[e.key]) { e.preventDefault(); setPickedChannel(ch[e.key]); return; }
    if (e.key === "Escape") { picked = null; note = ""; refresh(); return; }
  }
  if (e.key === "F8") {                          // **라이노 직교 모드 그대로**(A-3)
    e.preventDefault(); AXIS_SNAP.on = !AXIS_SNAP.on; relive();
    note = `축 스냅 **${AXIS_SNAP.on ? "켬" : "끔"}** <span class="dim">(F8 · 라이노 직교 모드)</span>`;
    return;
  }
  if (!cam.standing()) return;                   // 확정 전에는 잠글 축이 없다
  // **`Shift`는 그 획만 자유**(사람 지시 1) — 토글과 상황이 다르다
  if (e.key === "Shift" && !freeStroke) { freeStroke = true; relive(); return; }
  const ax = ARROW_AXIS[e.key];
  if (ax != null) {
    e.preventDefault();
    axisLock = axisLock === ax ? null : ax;      // 다시 누르면 푼다
    relive();
    return;
  }
  if (e.key === "Escape" && axisLock != null) { axisLock = null; relive(); }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Shift" && freeStroke) { freeStroke = false; relive(); }
});

/** 고정이 바뀌면 **그리는 중이라도** 미리보기를 다시 푼다 — 안 하면 화면이 낡는다(AS-C7과 같은 형태). */
function relive() {
  const c = cam.ctx();
  if (live && c) {
    const b = ink.livePoints();
    const b2: Pt2 = b.length >= 2 ? [b[b.length - 1][0], b[b.length - 1][1]] : live.anchor.screen;
    const r = resolveLive(c, live.anchor.at, live.anchor.screen, b2);
    live = { anchor: live.anchor, axis: r.axis, deg: r.deg, seg: r.seg, locked: r.locked,
             ambiguous: r.ambiguous, tied: r.tied, end: live.end };
  }
  refresh();
}

// **지우개 크기 슬라이더**(5차 지시 5) — 화면 px. 끄는 동안 값 표시만 갱신하고
// 놓을 때 refresh 없이도 즉시 반영된다(ERASER는 읽는 자리가 그때그때 읽는다)
sideEl.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (t?.dataset?.eraserSize === undefined) return;
  const v = Math.max(ERASER.min, Math.min(ERASER.max, Number(t.value) || ERASER.px));
  ERASER.px = v;
  const lab = sideEl.querySelector("[data-eraser-val]");
  if (lab) lab.textContent = `${v}px`;
});

// **오스냅 반경 입력**(지시 H). 4~40px로 죈다 — 0이나 음수는 스냅을 통째로 죽인다
barEl.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t?.dataset?.osnapRadius === undefined) return;
  const v = Math.max(4, Math.min(40, Math.round(Number(t.value) || 0)));
  OSNAP.radiusPx = v;
  hoverSnap = null; hover2d = null;
  refresh();
});

window.addEventListener("resize", () => refresh());
// 숨은 탭에서 열리면 관찰자가 발화하지 않는다(PITFALLS #22) — 보이게 되는 순간 다시 본다
document.addEventListener("visibilitychange", () => refresh());

fit();
// **자동 저장 기동과 복원**(L-D.2). 문서가 비어 있지 않을 때만 연다 —
// 빈 문서를 열면 "비우기" 직후의 새로고침이 아무 일도 안 한 것처럼 보인다.
saver = autosaver2(buildDoc2, 600, (ok, err) => {
  // **무결성 실패는 저장소 실패와 갈라 적는다**(7차 항목 1-c) — 사유가 화면에 남아야
  // "조용히 깨진 파일"이 안 생긴다. `serializeDoc2`가 무결성 위반이면 던진다
  saveNote = ok ? `저장됨 ${new Date().toLocaleTimeString()}`
    : err instanceof Error && err.message.startsWith("저장 무결성")
      ? `<b>저장 실패</b> — ${err.message}` : "저장 실패(브라우저 저장소)";
});
window.addEventListener("pagehide", () => { void saver?.flush(); });
// ⚠ **복원은 비동기라 늦게 도착한다.** 그 사이에 사용자가(또는 하네스가) 이미 그렸으면
// **덮지 않는다** — 덮으면 방금 그린 획이 소리 없이 사라진다. 종단 확인에서 실제로 걸렸다:
// 앞 시험의 저장본이 `setup()` 뒤에 도착해 획 12개를 통째로 갈아 치웠다(배치 0).
getDoc2().then(d => { if (d && d.strokes.length && !doc.strokes.length) applyDoc2(d); })
         .catch(() => { /* 저장소가 없어도 도구는 동작한다 */ });

// **PWA — 오프라인 동작**(L-D.2). 개발 서버에서는 등록하지 않는다(HMR과 충돌한다).
// 경로는 **상대**여야 한다 — Pages의 하위 경로에서 `/sw.js`는 남의 자리를 가리킨다.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* 오프라인 없이도 동작한다 */ });
  });
}

refresh();

// 브라우저 콘솔 진단용. 측정 하네스와 같은 픽스처를 쓰려면 여기서 문서를 꺼낸다.
(window as unknown as Record<string, unknown>).S2S = {
  doc: () => doc, cam, stage, refresh, SIZE_HEAL,
  /** D-C3 좌표 규약 진단(#21) — `e2e/coords.spec.ts`가 dpr 1·2·3에서 이것을 잠근다 */
  diag: frameDiag,
  // L-D.2 저장·내보내기 — **앱 경로 그대로**를 종단 확인이 부른다(#17)
  buildDoc2, applyDoc2, saveNow: () => saver?.flush(), saveNote: () => saveNote,
  exportObj: () => toObj(linesFromDoc(doc, id => doc.views.find(v => v.id === id)?.name ?? id,
                                      { withGuides: EXPORT_GUIDES.on })),
  exportGltf: () => toGltf(linesFromDoc(doc, id => doc.views.find(v => v.id === id)?.name ?? id,
                                        { withGuides: EXPORT_GUIDES.on })),
  // L-B.3 — 종단 확인이 스냅을 앱 경로 그대로 부른다(PITFALLS #17)
  snap: (p: Pt2) => {
    // ⚠ **시점 좌표로 묻는다**(7차 항목 2 — 옛 판은 세계 좌표 segs에 시점 ctx를 섞었다)
    const fr = frame(); const sc = snapCtx(fr);
    if (!fr || !sc) return null;
    const g = snapSegs(fr.toV);
    return appSnapAt(p, g, sc, snapStatic(g, fr.poseKey));
  },
  snapTargets: () => snapSegs().length,
  hoverSnap: () => hoverSnap,
  /** **끝점 스냅**(오스냅, D-L46) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  endSnap: (from: Vec3, p: Pt2) => { const fr = frame(); return fr ? endSnapAt(fr, from, p) : null; },
  /**
   * **끝점 겨냥 거리 프로브**(6차 항목 2-b) — 조리개 밖까지 본 최근접 후보 거리.
   * `null`이면 후보가 없다(반경 문제가 아니다). 원장이 이 셋을 갈라 읽는다.
   */
  endProbe: (from: Vec3, p: Pt2) => { const fr = frame(); return fr ? endSnapProbe(fr, from, p) : null; },
  /** 획별 겨냥 거리 — 시작·끝. 실획 원장이 그대로 읽는다(#17). */
  aimDist: () => doc.strokes.map(x => ({ id: x.id, start: x.snapDistPx ?? null,
                                         end: x.snapEndDistPx ?? null,
                                         startKind: x.snapStart?.kind ?? null,
                                         endKind: x.snapEnd?.kind ?? null })),
  /** 양 끝 스냅으로 놓인 획 — 측정이 "대각선이 놓이는 비"를 읽는다 */
  twoPointStrokes: () => doc.strokes.filter(x => x.snapStart && x.snapEnd && x.seg3d)
                                    .map(x => ({ id: x.id, start: x.snapStart!.kind,
                                                 end: x.snapEnd!.kind, axis: x.axis })),
  live: () => live,
  /** **화면 직교 스냅**(A-2) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  live2d: () => live2d,
  orthoSnap: (a: Pt2, b: Pt2) => screenOrthoSnap(a, b),
  /** **소실점 방향 스냅**(4차 지시 2) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  vpDir: (a: Pt2, b: Pt2) => vpDirSnap(a, b, cam.vps()),
  /**
   * **지금 스냅 가능한 축**(A: "1·2·3점 각각에서 어느 축이 스냅 가능한지 표"). 화면과
   * 측정이 같은 함수를 읽는다(#17) — 표가 코드와 갈리면 표가 틀린다.
   */
  snapAxes: () => snapAxisTable(),
  axisLock: () => ({ mode: axisLock, resolved: lockedAxis() }),
  setAxisLock: (a: 0 | 1 | 2 | null) => { axisLock = a; relive(); },
  // L-B.6 — 뷰 시스템(§9.2~§9.4). **앱 경로 그대로**를 종단 확인이 부른다(#17)
  views: () => doc.views.map(v => ({ id: v.id, name: v.name, seq: v.seq,
                                     isConfirm: isConfirmView(v),
                                     pending: pending(doc, v.id).length })),
  currentView: () => doc.currentView,
  switchView,
  pose: () => stage.pose(),
  /** 궤도를 코드로 돌린다 — Playwright가 마우스로 돌리지 않고도 새 자세를 만든다. */
  orbitTo: (p: ViewPose) => { stage.setPose(p, orbitTarget()); refresh(); },
  // **G — 입력 라우팅.** 하네스는 **실제 포인터 사건을 캔버스에 던지고**(라우터를 지난다)
  // 여기서는 **읽기만** 한다(#17: 측정 경로가 앱 경로를 우회하면 앱을 안 재는 것이다)
  /** 궤도 상태 — 방위각·앙각·거리. 카메라가 움직였는지 이것으로 잰다 */
  camPose: () => {
    const c = stage.viewport.controls;
    // ⚠⚠ **핀 상태의 구면각은 0으로 고정한다**(2026-08-17 지시 6에서 간헐 실패로 드러났다).
    // 핀에서는 카메라가 원점·항등이고 컨트롤이 꺼져 있어 `getAzimuthalAngle()`이 **마지막
    // `update()` 시점의 낡은 내부값**을 낸다 — 생성 직후 값(atan2(3.2, 3.6) = 0.7266)이
    // 프레임 경쟁에 따라 남기도 지워지기도 해서, 핀에서 재는 하네스 기준선이 실행마다
    // 흔들렸다(1.2551 ↔ 1.9817). 핀의 자세는 정의상 항등이므로 0이 맞다.
    const pinned = stage.isPinned;
    return { azimuth: pinned ? 0 : c.getAzimuthalAngle(),
             polar: pinned ? 0 : c.getPolarAngle(), dist: c.getDistance(),
             target: [c.target.x, c.target.y, c.target.z] as [number, number, number],
             pinned };
  },
  /** 팜 리젝션이 몇 번 발동했나(G-2) — 조용한 거부를 관측 가능하게 둔다(#22) */
  palm: () => ({ ...ink.palmStats(), pen_touching: ink.penTouching }),
  /** 지금 제스처 — 손가락 수·모드·활성 */
  gesture: () => ({ fingers: gestures.fingers, mode: gestures.mode, active: gestures.active }),
  gestureTol: () => ({ ...GESTURE_TOL }),
  /** §9.3의 생성 경로. **L-B.8이 열리기 전에는 확정 뷰를 낸다**(#23). */
  viewForDrawing,
  // **차수 = 계산**(지시 1). NONE 0 · P1 1 · P2 2 · P3 3 — 표시도 판정도 이 함수다(#17)
  order: () => cam.order(),
  standing: () => cam.standing(),
  // ⛔ `promoteOrderNow`를 지웠다(7차 지시 3-d) — 부를 승격이 없다.
  /** 확정(들어올리기)의 하네스 입구 — 규칙을 직접 넣으므로 획을 안 긋는다(#17). 앱에서는 자동이다. */
  confirmNow: () => standCamera(),
  // ⛔ `promoteReport`·`orderMarks` 창을 지웠다(7차 지시 3-d).
  /** L-D.3 — **연쇄 회차별** (대기 수 · 놓인 수). 합계만으로는 "여러 회"가 안 보인다 */
  chainTrace: () => chainTrace.map(x => ({ ...x })),
  // L-D.1 — 고치기(§9.5). **앱 경로 그대로**를 종단 확인이 부른다(#17)
  pick: (p: Pt2) => { picked = pickStroke(p); refresh(); return picked; },
  picked: () => picked,
  deletePicked, assignAxis,
  /** 되돌리기가 **카메라까지** 되돌리는지 대조하기 위한 창(L-C.2). `standing`·`order`는 계산값이다. */
  camSnapshot: () => ({ rules: cam.dumpRules(), vps: cam.vps(),
                        standing: cam.standing(), order: cam.order() }),
  // **규칙 경로를 종단 확인이 앱 경로 그대로 부른다**(#17)
  rules: () => cam.dumpRules(),
  // **지평선 끌기**(D-L45). 종단 확인이 손으로 끌지 않고도 같은 경로를 부른다(#17)
  horizon: () => ({ y: cam.rules.horizon, adjustable: cam.canSetHorizon(), dragging: horizonDrag,
                    // **소실점 확정 전에는 지평선이 없다**(4차 지시 4-a) — 표시 조건을 그대로 낸다
                    visible: horizonVisible() }),
  /** **점 찍기 확정**(4차 지시 4-b) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  pickVp: (p: Pt2) => {
    const at = cam.pickVp(p, OSNAP.radiusPx);
    if (at && cam.standing()) standCamera();
    refresh();
    return at;
  },
  setHorizon: (y: number) => { const ok = cam.setHorizon(y); refresh(); return ok; },
  /** 손잡이가 잡히는가 — **화면 좌표로** 묻는다(반경이 `PICK_TOL`이라 크기에 딸린다). */
  horizonGrab: (p: Pt2) => horizonGrab(p),
  /**
   * **하네스 전용 — 축마다 직선 둘을 주면 그 교점을 소실점으로 세운다.**
   *
   * 옛 `S.cam.guides = [...]` 자리를 대신한다. 화면에는 가이드가 없다(D-L37) —
   * 이것은 **알려진 카메라를 만드는 입구**이고 계산은 규칙 ⓑ와 **같은 교점**이다.
   * 직선이 하나뿐이거나 나란하면 그 축은 **비운다**(무한원 — 없는 소실점을 지어내지 않는다).
   */
  setAxisLines: (list: { axis: 0 | 1 | 2; a: Pt2; b: Pt2 }[]) => {
    harnessLines = list.map(g => ({ axis: g.axis, a: [...g.a] as Pt2, b: [...g.b] as Pt2 }));
    const slots = ([0, 1, 2] as const).map(ax => {
      const ls = harnessLines.filter(g => g.axis === ax);
      if (ls.length < 2) return null;
      const at = lineIntersect(ls[0].a, ls[0].b, ls[1].a, ls[1].b);
      return at ? { kind: "vp" as const, at, source: "horizon_x_line" as const,
                    support: ls.length } : null;
    }) as RuleState["slots"];
    // **지평선은 처음부터 있다** — 유한 수평 소실점이 있으면 그 y이고, 없으면 기본값이다
    const h = ([0, 1] as const).map(i => slots[i]).find(x => x && x.kind === "vp");
    cam.loadRules({ slots, horizon: h && h.kind === "vp" ? h.at[1] : cam.imgSize[1] / 2,
                    depthLines: [], verticalLines: [] });
    refresh();
  },
  axisLines: () => harnessLines.map(g => ({ ...g, a: [...g.a] as Pt2, b: [...g.b] as Pt2 })),
  // **하네스도 앱과 같은 관문을 지난다**(#17) — 확정·승격이 자동으로 나는 그 경로다
  feedLine: (a: Pt2, b: Pt2, forced?: "screen" | "depth") => {
    const r = feedCamera({ a, b }, forced);
    refresh();
    return r.event;
  },
  classifyLine: (a: Pt2, b: Pt2) => classifyLine(a, b),
  ask: () => ask && { strokeId: ask.strokeId, question: ask.question, toH: ask.toH, toV: ask.toV },
  /** 물음 카운터(5차 지시 3의 종단 확인이 읽는다 — #17). */
  askStats: () => ({ ...askStats }),
  /** **뷰 큐브**(5차 지시 8) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  cubeSpin: (deltaRad: number, ms = 0) => {
    stage.viewport.userMoved = true;
    stage.spinYaw(deltaRad, orbitTarget(), ms, () => refresh());
  },
  cubeYaw: () => stage.yawOf(),
  viewCube: () => ({ on: viewCube.on }),
  /** **궤도 중심**(6차 지시 1 — 종단 확인이 거리 유지·중심 조준을 잴 때 읽는다, #17). */
  orbitCenter: () => orbitTarget(),
  /** **배치 경로 카운터**(6차 지시 2·3 — 직접/lift/양끝. 실획 측정의 사용 비율 분자·분모). */
  pathStats: () => ({ ...pathStats }),
  /**
   * **D-L83 진단 창** — 가드 상태와 경로별 차단 횟수(9차 4-5′: 한 경로만 세면 0이 부재의
   * 증거로 읽힌다). `rejected`는 두 경로의 합이다(옛 원장 필드명과의 연속성).
   */
  anchorGuard: () => ({ on: ANCHOR_GUARD.on, ...anchorGuardStats,
                        rejected: anchorGuardStats.start_rejected
                                + anchorGuardStats.unanchored_rejected }),
  /** 측정 스위치(#30) — `false`가 옛 거동(가드 이전)이다. 카운터는 안 지운다. */
  setAnchorGuard: (on: boolean) => { ANCHOR_GUARD.on = on; },
  setGroundAnchor: (on: boolean) => { GROUND_ANCHOR.on = on; },
  /**
   * **세 상태**(4-1) — 저장 없이 계산한 상태를 획별로 낸다. 원장이 그대로 읽는다(#17).
   * ⚠ `axis`는 **상태 판정이 실제로 쓴 계산 축**이다(대기 획의 저장 필드 `s.axis`는 배치
   * 때만 갱신되는 낡은 값이라 여기 안 낸다 — 10차 리뷰어 2차 [7]이 그 혼선을 잡았다).
   */
  strokeStates: () => doc.strokes.map(s => ({ id: s.id, state: strokeStateOf(s),
    axis: s.seg3d ? s.axis
        : (s.userAxis ? s.axis
           : (cam.standing() && liftable(s) && s.pts2d.length >= 2
              ? cam.axisOf(s.pts2d).axis : "free")) })),
  /** 연쇄 확장 스위치(#30) — `false`가 옛 연쇄(시작점 오스냅만)다. 카운터는 안 지운다. */
  setChainExt: (on: boolean) => { CHAIN_EXT.on = on; },
  /** **확정 후 재계산 가드**(14차 항목 0) — 분모(attempts)와 함께 낸다(#43). */
  chainDirGuard: () => ({ on: CHAIN_DIR_GUARD.on, ...chainDirGuardStats }),
  /** 측정 스위치(#30) — `false`가 옛 거동(연쇄가 각도 무제한으로 축 되쓰기)이다. */
  setChainDirGuard: (on: boolean) => { CHAIN_DIR_GUARD.on = on; },
  /** **확정 배치 연결 되맞춤**(15차 항목 1 · D-L98) — 분모(attempts)와 함께 낸다(#43). */
  liftAnchor: () => ({ on: LIFT_ANCHOR.on, ...liftAnchorStats }),
  /** 측정 스위치(#30) — `false`가 수리 전 거동(rep 끝점 그대로)이다. */
  setLiftAnchor: (on: boolean) => { LIFT_ANCHOR.on = on; },
  /** 측정 스위치(#30) — `false`가 수리 전 거동(선언 없이 검출 교점만)이다. */
  liftDeclared: () => LIFT_DECLARED.on,
  setLiftDeclared: (on: boolean) => { LIFT_DECLARED.on = on; },
  /** **알림 비우기**(15차 항목 2 · D-L100 (c)) — `false`가 수리 전 거동(경고가 남는다)이다. */
  noteClear: () => NOTE_CLEAR.on,
  setNoteClear: (on: boolean) => { NOTE_CLEAR.on = on; },
  /** **연결 획의 알림 억제**(15차 항목 2 · D-L100 (a)) — `false`가 수리 전 거동이다. */
  connectionQuiet: () => CONNECTION_QUIET.on,
  setConnectionQuiet: (on: boolean) => { CONNECTION_QUIET.on = on; },
  /** **화면 팬**(항목 5) — 표시 오프셋(css px). 문서 좌표에는 절대 안 들어간다. */
  viewPan: () => [stage.viewPan[0], stage.viewPan[1]],
  setViewPan: (p: Pt2) => { stage.setViewPan(p); refresh(); },
  /** **화면 줌**(14차 항목 5 · D-L94) — 표시 배율. 문서 좌표에는 절대 안 들어간다. */
  viewZoom: () => stage.viewZoom,
  setViewZoom: (z: number, center?: Pt2) => { stage.setViewZoom(z, center); refresh(); },
  /** 배율 클램프 값 — 원장이 측정 동작점이 클램프에 닿았는지 판독하는 데 쓴다. */
  viewZoomLim: () => ({ ...Stage.VIEW_ZOOM_LIM }),
  /** **작도/모델링 상태**(14차 항목 6-d) — 저장 없는 계산값. 종단 확인이 그대로 읽는다(#17). */
  viewState: () => draftStateNow(),
  /** 판정의 실측 각(#49 — 피치·요 이탈, 그린 축 기준계). 원장이 각도를 직접 든다(6-R1 [2]). */
  draftJudge: () => {
    const f = draftGazeDrawn();
    return f ? judgeDraftPose(f, ONE_POINT_TOL.hand_deg) : null;
  },
  /** **작도 시점 복귀**(14차 항목 6-a) — 버튼과 같은 함수다(#17). */
  returnToDraft: () => { returnToDraft(); },
  /** 지금 시점의 표시 문맥(소실점·지평선 y) — 원장이 표시 계산의 출처를 대조하는 데 쓴다. */
  draftOverlay: () => viewOverlayCtx(),
  /**
   * **축 표식 목록**(15차 항목 8-c·8-e · D-L101) — 그리는 쪽과 **같은 함수**다(#17).
   * `point`(화면 안) · `edge`(화면 밖 가장자리) · `infinite`(무한원 축의 방향 표시).
   */
  axisMarks: () => {
    const o = viewOverlayCtx();
    return o ? overlayAxisMarks(o.axisVps, [cssSize()[0], cssSize()[1]]) : null;
  },
  /** 마지막 스냅·차단 안내문 — 종단 확인이 차단 안내(항목 6-e)를 그대로 읽는다(#17). */
  snapNote: () => lastSnapNote,
  /** 큐브 기준계 스위치(#30) — `false`가 옛 기준계(세계 축). cube_frame의 대조 팔이 쓴다. */
  setCubeFrame: (on: boolean) => { CUBE_FRAME.on = on; },
  /** **배치 경로 카운터**(4-6) — 합이 배치 전체와 맞는지 원장이 검산한다. */
  placeBy: () => ({ ...placeBy }),
  /** 교차 앵커 분모·사유(#43 — 합=attempts 검산은 원장이 한다). */
  crossStats: () => ({ ...crossStats }),
  /** **시점 저장**(5차 지시 7-1) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  saveViewpoint: () => { saveViewpoint(); },
  /** **지우개 크기**(5차 지시 5) — 종단 확인이 앱 경로 그대로 읽고 쓴다(#17). */
  eraser: () => ({ ...ERASER }),
  setEraser: (px: number) => {
    ERASER.px = Math.max(ERASER.min, Math.min(ERASER.max, px));
    refresh();
  },
  answerAsk: (choice: "screen" | "depth") => { answerAsk(choice); },
  /** **펜 채널**(D) — 앱 경로 그대로를 종단 확인이 부른다(#17). */
  channel: () => channel,
  setChannel: (c: Channel) => { channel = c; refresh(); },
  setPickedChannel,
  exportGuides: () => EXPORT_GUIDES.on,
  showGuides: () => SHOW_GUIDES.on,
  showGrid: () => SHOW_GRID.on,
  setShowGrid: (on: boolean) => { SHOW_GRID.on = on; refresh(); },
  /** **관계 스냅**(4차 지시 5) — 종단 확인이 앱 경로 그대로 읽고 쓴다(#17). */
  relSnap: () => REL_SNAP.on,
  setRelSnap: (on: boolean) => { REL_SNAP.on = on; refresh(); },
  setShowGuides: (on: boolean) => { SHOW_GUIDES.on = on; syncScene(); refresh(); },
  setExportGuides: (on: boolean) => { EXPORT_GUIDES.on = on; refresh(); },
  channels: () => doc.strokes.map(x => ({ id: x.id, channel: x.channel, lifted: !!x.seg3d })),
  // 축 스냅(사람 지시 1) — **앱 경로 그대로**를 종단 확인이 부른다(#17)
  axisSnap: () => ({ on: AXIS_SNAP.on, freeStroke }),
  setAxisSnap: (on: boolean) => { AXIS_SNAP.on = on; relive(); },
  /** **지우개**(지시 I) — 앱 경로 그대로를 종단 확인이 부른다(#17). */
  eraseSegmentAt: (p: Pt2) => { const ok = eraseSegmentAt(p); refresh(); return ok; },
  erasePart: (path: Pt2[]) => {
    partErase = new Map();
    for (const p of path) erasePartSample(p);
    erasePartCommit();
    refresh();
  },
  /** 획의 조각 경계(매개변수) — 분할 판정을 원장이 읽는다. */
  cutsOf: (id: string) => {
    const st = doc.strokes.find(x => x.id === id);
    return st?.seg3d ? cutParams(seg3Of(st), otherSegs(id)) : null;
  },
  /** **오스냅 설정**(지시 H) — 앱 경로 그대로를 종단 확인이 읽고 쓴다(#17). */
  /** **2D 오스냅**(4차 지시 1) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  snap2d: (p: Pt2) => snap2At(p),
  pending2Targets: () => pend2Segs().length,
  hover2d: () => hover2d,
  osnap: () => ({ radiusPx: OSNAP.radiusPx, kinds: { ...OSNAP.kinds } }),
  setOsnap: (o: { radiusPx?: number; kinds?: Partial<Record<SnapKind, boolean>> }) => {
    if (o.radiusPx != null) OSNAP.radiusPx = Math.max(4, Math.min(40, o.radiusPx));
    if (o.kinds) Object.assign(OSNAP.kinds, o.kinds);
    hoverSnap = null; hover2d = null;
    refresh();
  },
};
