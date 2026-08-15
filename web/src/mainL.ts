// L-B — 단일 뷰포트 UI 엔트리. 계획서 §10.
//
// **옛 `main.ts`를 고치지 않고 새로 짠다**(§10.1) — 좌우 분할·프레임 탭·"여기서 그리기" 토글·
// 점 찍기·고치기·치수 패널이 전부 폐기 대상이라 남는 것이 거의 없었다.
// `canvasFrame`·잉크 캡처·three 씬·`lift.ts`·`vpDetect.ts`·카메라 수학은 그대로 쓴다(§10.2).
//
// **옛 UI는 L-B 게이트 통과 전까지 지우지 않는다**(A-4). `index.html`이 그것이고 여기는 `l.html`이다.
import { InkCanvas } from "./capture/inkCanvas.js";
import { cssSizeOf } from "./capture/canvasFrame.js";
import { Stage, FREE_FOV_DEG, type StageSeg } from "./ui/stage.js";
import { CamState } from "./ui/camState.js";
import { newDoc, newSStroke, newView, deleteView, lifted, pending, pendingElsewhere,
         type DocState, type SStroke } from "./ui/doc.js";
import { takeSnap, applySnap, type AppSnap } from "./ui/appSnap.js";
import { draftFromDetection, handleAt, moveHandle, guideLineAt, moveGuideBy,
         extendGuide, DRAFT_TOL, type HandleRef } from "./s3d/vpDraft.js";
import { diffPlacement, diffSummary, type PlacementDiff } from "./s3d/promoteDiff.js";
import { SENS_TOL, type AxisSens } from "./s3d/vpSensitivity.js";
import { HOMOG_TOL } from "./s3d/vpHomog.js";
import { liftAll, type LiftStroke } from "./s3d/lift.js";
import { snapAt, staticCandidates, SNAP_TOL, SNAP_LABEL, SNAP_COLOR,
         type SnapCand, type SnapSeg, type SnapCtx, type StaticCand } from "./s3d/snap.js";
import { segmentFromAnchor, nearestAxisOnScreen, LIVE_TOL } from "./s3d/liveLine.js";
import { classifyStroke } from "./s3d/axis.js";
import { promoteOrder, orderOf, type OrderStroke } from "./s3d/promoteOrder.js";
import { AXIS_COLOR, guides as gridGuides, HORIZON_COLOR, GROUND_COLOR } from "./s3d/grid.js";
import { project, axisDirection, groundFrame, type Vec3 } from "./s3d/geom3d.js";
import type { Pt2 } from "./s3d/camera.js";
import type { PlaceCtx } from "./s3d/stroke.js";
import { viewPlaceCtx, toView, fromView, dirToView, type ViewPose } from "./s3d/viewCamera.js";

type Tool = "draw" | "adjust" | "orbit";

const host = document.getElementById("stage")!;
const canvas = document.getElementById("ink") as HTMLCanvasElement;
const barEl = document.getElementById("bar")!;
const statusEl = document.getElementById("status")!;
const viewsEl = document.getElementById("views")!;

const stage = new Stage(host);
let doc: DocState = newDoc();
const cam = new CamState(cssSizeOf(canvas));
let tool: Tool = "draw";
let note = "";
let dragHandle: HandleRef | null = null;
/** **선을 통째로 끄는 중**(L-B.2). 라이노·SketchUp에서 선을 끄는 것과 같다(A-3). */
let dragLine: { index: number; last: Pt2 } | null = null;
/**
 * 민감도. **끄는 동안에는 갱신하지 않는다** — 초당 수십 번 바뀌면 읽을 수 없고,
 * 핸들 수 × 8회의 카메라 해가 매 프레임 돈다.
 *
 * ⚠ **`refresh()`가 부른다.** 처음에는 `소실점 추정`과 끌기 종료에서만 불렀는데, 그러면
 * 가이드가 다른 경로로 바뀔 때(되돌리기·비우기·창 크기·바깥에서 주입) **낡은 값이 남는다** —
 * 종단 확인에서 실제로 걸렸다. 갱신을 **쓰는 자리 하나로** 모은다(AS-C7의 자가 치유와 같은 형태).
 */
let sens: AxisSens[] = [];
/** 떠 있는 커서의 스냅 — **누르기 전에 무엇에 붙을지 보인다**(SketchUp/Rhino 관행, L-B.3). */
let hoverSnap: SnapCand | null = null;
/** 마지막 획이 무엇에 붙었나 — 화면에 사유를 낸다(#7: 추측하지 말고 센다). */
let lastSnapNote = "";
/**
 * **그리는 중의 실시간 판정**(L-B.4, §4). 시작점이 3D에 못박히면 커서 픽셀 하나가
 * 끝점을 정하므로 **확정과 같은 것**을 미리 보여 줄 수 있다 — 계획서 §11 L-B 게이트의
 * "미리보기와 확정의 일치(0)"가 그것을 요구한다.
 */
let live: { anchor: SnapCand; axis: 0 | 1 | 2 | null; deg: number | null;
            seg: [Vec3, Vec3] | null; locked: boolean } | null = null;
/**
 * **축 고정**(L-B.5, §4). SketchUp을 그대로 따른다(A-3) —
 * `Shift`는 **지금 추론된 축**을 누르는 동안 잠그고, 화살표는 특정 축을 토글한다.
 *
 * `null`이면 추론에 맡긴다. `"infer"`는 Shift가 눌린 상태이고, 실제로 잠기는 축은
 * **그때 추론된 것**이다 — 그래서 값이 아니라 표시로 둔다.
 */
let axisLock: 0 | 1 | 2 | "infer" | null = null;
/** Shift가 실제로 잠근 축. 뗄 때까지 유지한다. */
let shiftHeld: 0 | 1 | 2 | null = null;
/**
 * **확정·승격 시점에 잠근 소실점 개수**(L-C.1, §6.1). 차수 승격을 누를 때
 * `cam`은 **이미 새 차수**이므로(사용자가 가이드를 먼저 세운다) 옛 차수를 따로 들어야 한다.
 */
let lockedOrder: number | null = null;
const refreshSens = () => { sens = cam.guides.length ? cam.sensitivity() : []; };

// **스냅샷 자료구조와 대조는 `ui/appSnap.ts` 하나가 정한다**(#17) — 원장이 같은 함수를 부른다.
const undoStack: AppSnap[] = [];
const UNDO_MAX = 200;

const cssSize = (): [number, number] => cssSizeOf(canvas);

const appSnap = (): AppSnap => takeSnap(doc, cam, lockedOrder,
  promoteReport ? { ...promoteReport, snapLost: [...promoteReport.snapLost] } : null);

/** 스냅샷을 그대로 되돌린다. **문서만 되돌리지 않는다**(`appSnap.ts` 머리말). */
function restoreSnap(s: AppSnap) {
  doc = applySnap(cam, s);
  lockedOrder = s.lockedOrder;
  const c = cam.ctx();
  if (c && s.locked) stage.pinTo(c.principal, c.f);
  const rep = s.report as PromoteReport | null;
  promoteReport = rep ? { ...rep, snapLost: [...rep.snapLost] } : null;
  refreshSens();
  syncScene();
}

function pushUndo() {
  undoStack.push(appSnap());
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

// ---------------------------------------------------------------- 차수 되돌리기 (L-C.2, §6.2)

/**
 * **차수를 명시한 되돌리기**(§6.2: "사용자가 즉시 보고 `1점으로 되돌리기`를 누른다").
 *
 * 일반 `실행취소`와 다른 것: 되돌아갈 자리가 **차수로 이름 붙어 있다.** 승격 뒤에 몇 획을
 * 더 그렸어도 "2점으로" 한 번에 간다 — 그것이 §6.2가 "임계를 정교하게 만드는 것보다 싸다"고
 * 적은 수단이다. 승격은 사용자가 **판단할 수 있는 유일한 신호**이므로(§5.3·AS-L6) 되돌리기가 쉬워야 한다.
 *
 * ⚠ **표식을 뜨는 시점은 `차수 승격`을 누를 때가 아니다.** 그때는 사용자가 이미 가이드를
 * 더 세워 놓았으므로 카메라가 **새 차수**다 — 그 상태를 "2점"이라 이름 붙이면 되돌려도
 * 소실점이 셋이다. 뜨는 자리는 **`확정`과 `소실점 다시`** 둘이다: 둘 다 그 차수에서의
 * 마지막 온전한 상태이고, `소실점 다시`는 **카메라를 만지기 직전**이다.
 *
 * 같은 차수의 표식은 **덮어쓴다** — 그 차수에서 마지막으로 본 상태가 사용자가 기억하는 것이다.
 */
const orderMarks: { order: number; snap: AppSnap }[] = [];

function markOrder(order: number, snap: AppSnap) {
  const i = orderMarks.findIndex(m => m.order === order);
  if (i >= 0) orderMarks[i] = { order, snap };
  else { orderMarks.push({ order, snap }); orderMarks.sort((a, b) => a.order - b.order); }
}

/**
 * **승격이 무엇을 바꿨나** — 화면에 눈에 띄게 낸다(§6.2).
 *
 * `null`이면 알릴 것이 없다. 그 다음 획을 그리거나 되돌리면 사라진다 —
 * **낡은 표시를 남겨 두면 지금 상태의 설명으로 읽힌다**(AS-C7과 같은 형태의 함정이다).
 */
interface PromoteReport {
  before: number; after: number;
  diff: PlacementDiff;
  /** 스냅을 **못 살린 획 id**. 그 시작점은 옛 카메라의 상 그대로다 — **조용히 틀린 시작점**이다. */
  snapLost: string[];
  reanchored: number; had: number;
  /** 재연결을 눌렀는가. 누른 뒤에는 결과를 그 자리에 적는다. */
  relinked: { ok: number; tried: number } | null;
}
let promoteReport: PromoteReport | null = null;

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
let snapPre: StaticCand[] | null = null;
const snapStatic = (segs: SnapSeg[]): StaticCand[] => (snapPre ??= staticCandidates(segs));

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
}

const ID = <T>(x: T) => x;

function frame(): Frame | null {
  const c = cam.ctx();
  if (!c || !cam.locked) return null;
  if (stage.isPinned) return { ctx: c, toV: ID, fromV: ID, dirV: ID, pinned: true };
  const pose = stage.pose();
  if (!pose) return null;
  // **세계 축 방향은 첫 카메라가 정한 것 그대로다.** 새로 추정하지 않는다
  const axes = c.vps.map(v => (v ? axisDirection(v, c.principal, c.f) : null));
  return {
    ctx: viewPlaceCtx(pose, axes, cssSize(), FREE_FOV_DEG),
    toV: (p) => toView(pose, p),
    fromV: (p) => fromView(pose, p),
    dirV: (d) => dirToView(pose, d),
    pinned: false,
  };
}

/**
 * 스냅이 도는 조건: **카메라가 확정됐을 때**. 확정 시점이든 돌린 시점이든 돈다(L-B.8).
 *
 * ⚠ **지면은 확정 시점에서만 낸다.** 돌린 시점의 지면 평면은 시점 좌표로 다시 세워야 하는데
 * `groundFrame`은 소실점에서 세우고 그 소실점은 시점마다 다르다 — **없는 것을 지어내지 않는다**(A-3).
 * 지면 스냅의 화면 거리는 정의상 0이라 성공률 측정에도 못 섞는 종류다(`snap.json`).
 */
function snapCtx(fr: Frame | null = frame()): SnapCtx | null {
  if (!fr) return null;
  const { ctx } = fr;
  return { principal: ctx.principal, f: ctx.f, imgSize: ctx.imgSize,
           // 면 생성이 범위 밖이라 지금 있는 면은 지면 하나다(§3 "면 위 점")
           ground: fr.pinned ? groundFrame(ctx.vps[2] ?? null, ctx.principal, ctx.f) : null,
           from: null };
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
  st.pts2d = [[cand.screen[0], cand.screen[1]], ...st.pts2d.slice(1)];
}

/**
 * **승격 연쇄**(§9.1). 새 획이 놓이면 대기 획들의 시작점이 그것에 붙을 수 있다.
 *
 * ⚠ **일괄 재풀이가 아니다.** `promote.json`이 그 경로의 회수율을 **0/1904**로 쟀다 —
 * 대기 사유가 `축이 미분류다`라서 같이 푸나 따로 푸나 같기 때문이다. 회수하는 것은 **앵커**다.
 * **연쇄한다** — 이번에 놓인 것이 다음 획의 대상이 되므로 더 안 늘 때까지 돈다.
 */
function promoteChain(fr: Frame): number {
  let total = 0;
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
      const cand = snapAt(st.pts2d[0], segs, sc, {}, pre);
      if (!cand) continue;
      applySnapToStart(st, cand, fr.fromV(cand.at));
      if (placeLive(st, fr, cand.at)) n += 1;
    }
    total += n;
    if (!n) break;                     // 더 안 는다 — 연쇄가 멎었다
    snapPre = null;                    // 기하가 늘었다
  }
  if (total) lastSnapNote += ` · **승격 연쇄로 ${total}획이 더 올라갔습니다**`;
  return total;
}

/** 축 방향들 — 소실점이 없는 축은 `null`. 실시간 판정과 확정이 **같은 것을 쓴다**(#17). */
const axisDirs = (c: PlaceCtx) =>
  c.vps.map(v => (v ? axisDirection(v, c.principal, c.f) : null));

/**
 * **실시간 판정 = 확정 판정**(L-B.4). 앵커·시작 화면점·끝 화면점만 주면 같은 답이 나온다 —
 * 미리보기와 확정이 어긋날 여지가 **구조적으로 없다**(§11 게이트의 "일치 0").
 */
function resolveLive(c: PlaceCtx, at: Vec3, a2: Pt2, b2: Pt2) {
  const dirs = axisDirs(c);
  const near = nearestAxisOnScreen(at, dirs, a2, b2, c);
  // **고정은 여기 안에 있어야 한다**(#17) — 바깥에서 덮으면 미리보기와 확정이 갈린다
  const forced = lockedAxis();
  const use = forced != null && dirs[forced] ? forced : null;
  if (use == null) {
    if (!near) return { axis: null, deg: null, seg: null, locked: false, why: "축 후보가 없습니다" };
    if (near.deg > LIVE_TOL.axis_deg) {
      return { axis: null, deg: near.deg, seg: null, locked: false,
               why: `축과 ${near.deg.toFixed(1)}° 벌어졌습니다`
                  + `(${LIVE_TOL.axis_deg}° 이내여야 합니다 — Shift로 고정할 수 있습니다)` };
    }
  }
  const ax = (use ?? near!.axis) as 0 | 1 | 2;
  const seg = segmentFromAnchor(at, dirs[ax], b2, c);
  const deg = near && near.axis === ax ? near.deg : null;
  return seg
    ? { axis: ax, deg, seg, locked: use != null, why: "" }
    : { axis: ax, deg, seg: null, locked: use != null, why: "끝점이 정해지지 않습니다" };
}

/**
 * 지금 잠긴 축. `Shift`는 **그때 추론된 축**을 잠그므로 처음 눌릴 때 확정되고
 * 뗄 때까지 유지된다(SketchUp과 같다). 화살표는 축을 직접 고른다.
 */
function lockedAxis(): 0 | 1 | 2 | null {
  if (axisLock === "infer") return shiftHeld;
  return axisLock;
}

/**
 * 스냅된 시작점 + 축 → 그 자리에서 3D 확정(§3 마지막 문단 · §7).
 * 축이 안 정해지면 `false`이고 그 획은 2D로 **대기**한다(§9.1).
 */
function placeLive(st: SStroke, fr: Frame, atV: Vec3): boolean {
  const r = resolveLive(fr.ctx, atV, st.pts2d[0], st.pts2d[st.pts2d.length - 1]);
  if (!r.seg || r.axis == null) {
    lastSnapNote = `${r.why} — **2D로 대기**합니다`;
    return false;
  }
  st.axis = r.axis;
  // **사용자가 고른 축은 재분류가 덮지 않는다**(`doc.ts`의 `userAxis`, §6.1의 "사용자 지정만 유지")
  st.userAxis = r.locked;
  // **시점 좌표로 푼 것을 세계로 되돌린다**(L-B.8). 확정 시점에서는 항등이다
  st.seg3d = [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])];
  lastSnapNote = r.locked
    ? `축${r.axis + 1}로 **고정**해 확정`
    : `축${r.axis + 1}로 확정 (축과 ${r.deg != null ? r.deg.toFixed(1) : "?"}°)`;
  return true;
}

// ---------------------------------------------------------------- 3D 레이어

/** 문서의 3D 레이어를 씬에 반영한다. **여기가 유일한 경로다.** */
function syncScene() {
  snapPre = null;                       // 기하가 바뀌었다 — 스냅 후보를 다시 만든다
  const segs: StageSeg[] = lifted(doc).map(s => ({
    id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis,
  }));
  stage.setSegments(segs);
}

// ---------------------------------------------------------------- 뷰 시스템 (L-B.6, §9.2~§9.4)

/** 확정 뷰 — `pose === null`인 것 하나다(§9.2). 첫 카메라 자체이고 자세가 항등이다. */
const confirmView = () => doc.views.find(v => v.pose === null) ?? doc.views[0];

/** 궤도 중심 — 3D 레이어의 무게중심. 없으면 `null`이고 컨트롤이 원점을 본다. */
const orbitTarget = () => stage.centroid(lifted(doc).map(s =>
  ({ id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis })));

/**
 * **뷰 전환**(§9.2). 확정 뷰면 확정 카메라에 다시 물리고, 아니면 저장된 자세로 돌아간다.
 *
 * 2D 대기 획은 `viewRef`가 소유하므로 **전환만으로 화면의 2D 층이 바뀐다** —
 * 숨기는 이유는 정리가 아니라 **좌표계**다(`doc.ts` 머리말).
 */
function switchView(id: string) {
  const v = doc.views.find(x => x.id === id);
  if (!v) return;
  doc.currentView = id;
  const ctx = cam.ctx();
  if (v.pose === null) {
    if (ctx) stage.pinTo(ctx.principal, ctx.f);
    tool = "draw"; canvas.style.pointerEvents = "auto";
    note = `확정 뷰 — 3D가 잉크와 같은 자리에 그려집니다`;
  } else {
    stage.setPose(v.pose, orbitTarget());
    // **L-B.8이 열렸다** — 돌린 시점에서도 그린다. 그래서 전환 뒤 바로 그리기다.
    // 더 돌리려면 `궤도`를 누른다(SketchUp의 모드 전환과 같다).
    tool = "draw"; canvas.style.pointerEvents = "auto";
    note = `${v.name} — 저장한 각도로 돌아왔습니다. 여기서 바로 그릴 수 있습니다`;
  }
  hoverSnap = null; live = null;
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
  if (v.pose === null) return p === null;          // 확정 뷰는 물려 있을 때만 맞다
  return p !== null && samePose(v.pose, p);
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
    const del = v.pose === null
      ? `<button class="del" disabled title="확정 뷰는 지울 수 없습니다 — 첫 카메라입니다">✕</button>`
      : `<button class="del" data-delview="${v.id}" title="이 뷰와 그 안의 대기 획 ${n}개를 지웁니다">✕</button>`;
    return `<div class="row"><button data-view="${v.id}"${on ? ' class="on"' : ""}>`
         + `${v.name}${n ? ` <span class="n">·2D ${n}</span>` : ""}</button>${del}</div>`;
  });
  viewsEl.innerHTML = `<div class="cap">뷰 ${doc.views.length}</div>` + rows.join("");
}

viewsEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b || (b as HTMLButtonElement).disabled) return;
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
  if (to) switchView(to);
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
    if (st.userAxis) continue;
    const v = classifyStroke(st.pts2d, ctx.vps, ctx.imgSize, {},
                             { principal: ctx.principal, f: ctx.f });
    st.axis = v.axis;
  }
  const input: LiftStroke[] = targets.map(s => ({ id: s.id, pts2d: s.pts2d, axis: s.axis }));
  const r = liftAll(input, { principal: ctx.principal, f: ctx.f, vps: ctx.vps, imgSize: ctx.imgSize });
  let n = 0;
  for (const s of targets) {
    const seg = r.placed.get(s.id);
    s.seg3d = seg ? [seg.a, seg.b] : null;
    if (seg) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------- 차수 승격 (L-C.1, §6.1)

/**
 * **차수 승격 — 소실점이 하나 더 잡히면 전부 다시 푼다**(§6.1).
 * 계획서 §1.2의 **고유한 것 ②**다.
 *
 * ⚠ **자동으로 걸지 않는다.** 사전 등록한 규칙("배치가 안 줄면서 조용히 틀림이 안 는다")에서
 * **배치 조건이 깨졌다**(`order_promote.json`: 같은 획 집합에서 −168). 품질은 나아지는데
 * 개수가 준다 — 그래서 §6.2대로 **사용자가 보고 되돌린다.** `실행취소`가 그 경로다.
 *
 * 화면이 **실제로 움직인다** — §5.3의 "전환 무변화"는 **초기 확정에 한한 이야기**다(§6.2).
 */
function promoteOrderNow(): void {
  const ctx = cam.ctx();
  if (!ctx) { note = "카메라가 정해지지 않았습니다"; refresh(); return; }
  // ⚠ **지금 카메라의 차수는 이미 새 것이다** — 사용자가 가이드를 더 세운 뒤 누르기 때문이다.
  // 그래서 **확정·승격 시점에 잠근 차수**를 따로 들고 있어야 "N점 → M점"을 적을 수 있다
  const before = lockedOrder ?? orderOf(ctx.vps, ctx.imgSize);
  // **승격 전 배치를 id로 찍어 둔다**(#10 — 뺄셈으로 만들지 않는다). 나중에 개수만 있으면
  // "몇 개 잃었다"까지는 적을 수 있어도 **어느 획인지 화면에 표시할 수 없다.**
  const placedBefore = new Map(doc.strokes.map(s => [s.id, s.seg3d != null]));
  pushUndo();
  const input: OrderStroke[] = doc.strokes.map(s => ({
    id: s.id, pts2d: s.pts2d, axis: s.axis, userAxis: s.userAxis, snapStart: s.snapStart,
  }));
  const r = promoteOrder(input, { principal: ctx.principal, f: ctx.f,
                                  vps: ctx.vps, imgSize: ctx.imgSize });
  // **전부 다시 푼 결과로 갈아 끼운다** — 부분 유지는 좌표계가 섞인 상태를 만든다(§6.1)
  const oldScale = geomScaleOf(lifted(doc));
  for (const s of doc.strokes) {
    const seg = r.placed.get(s.id);
    s.seg3d = seg ? [seg.a, seg.b] : null;
  }
  // `promoteOrder`가 옮긴 `pts2d[0]`·`snapStart`를 문서에 되돌려 넣는다
  const byId = new Map(input.map(x => [x.id, x]));
  for (const s of doc.strokes) {
    const x = byId.get(s.id);
    if (x) { s.pts2d = x.pts2d; s.snapStart = x.snapStart; }
  }
  // **뷰 카메라도 함께 갱신한다**(§6.1) — 기하가 새 배율로 풀렸으므로 눈 위치도 같이 옮긴다.
  // 상대적 시점(방향·상대 거리)은 유지된다
  const newScale = geomScaleOf(lifted(doc));
  const k = oldScale > 1e-9 && newScale > 1e-9 ? newScale / oldScale : 1;
  if (Math.abs(k - 1) > 1e-9) {
    for (const v of doc.views) {
      if (v.pose) v.pose = { R: v.pose.R, C: [v.pose.C[0] * k, v.pose.C[1] * k, v.pose.C[2] * k] };
    }
  }
  cam.locked = true;
  stage.pinTo(ctx.principal, ctx.f);
  doc.currentView = confirmView().id;
  syncScene();
  const after = orderOf(ctx.vps, ctx.imgSize);
  lockedOrder = after;
  // **잃은 것을 센다**(L-C.2). 계산은 `promoteDiff.ts` 하나가 하고 원장도 그것을 부른다(#17)
  const placedAfter = new Map(doc.strokes.map(s => [s.id, s.seg3d != null]));
  promoteReport = {
    before, after,
    diff: diffPlacement(placedBefore, placedAfter),
    snapLost: r.snap.lost_ids.slice(),
    reanchored: r.snap.reanchored, had: r.snap.had,
    relinked: null,
  };
  note = "";                     // 요약 패널이 그 자리를 대신한다 — 두 곳에 쓰면 갈린다
  refresh();
}

/**
 * **끊긴 스냅을 다시 붙여 본다**(L-C.2, 사람 지시).
 *
 * ⚠ **자동으로 안 한다.** 옛 대상이 새 카메라에서 안 놓였으므로 **다른 대상에 붙는 것**이고,
 * 그것을 소리 없이 하면 A-3의 "조용히 틀린 배치를 만들지 않는다"를 정면으로 어긴다.
 * D-L25(λ = 3)가 같은 방향이다 — 미배치의 비용이 틀린 배치의 1/3이다.
 * 그래서 **사용자가 누르고, 몇 개가 어디에 붙었는지 되돈다.**
 *
 * 붙일 곳이 없으면 그 획은 표시된 채로 남는다 — **없는 것을 지어내지 않는다.**
 */
function relinkLostSnaps(): void {
  if (!promoteReport?.snapLost.length) return;
  const fr = frame(); const sc = snapCtx(fr);
  if (!fr || !sc) return;
  pushUndo();                                   // **되돌릴 수 있어야 한다** — 기하가 움직인다
  const segs = snapSegs(fr.toV);
  const pre = snapStatic(segs);
  const still: string[] = [];
  const tried = promoteReport.snapLost.length;
  let ok = 0;
  for (const id of promoteReport.snapLost) {
    const s = doc.strokes.find(x => x.id === id);
    // 자기 자신에는 못 붙는다 — 대상 목록에서 뺀다(그리기 경로와 같은 규약)
    const cand = s ? snapAt(s.pts2d[0], segs.filter(g => g.id !== id), sc,
                            {}, pre.filter(c => c.ofId !== id && c.ofId2 !== id)) : null;
    if (!s || !cand) { still.push(id); continue; }
    applySnapToStart(s, cand, fr.fromV(cand.at));
    // **그리기와 같은 경로로 놓는다**(#17·A-3) — 앵커가 생겼으므로 §7의 실시간 경로다.
    // 일괄 솔버를 부르면 안 된다: 돌린 시점에서는 `pts2d`가 다른 화면 좌표다(L-B.8 머리말)
    s.seg3d = null;
    placeLive(s, fr, cand.at);
    ok += 1;                                    // **붙은 개수**다 — 놓인 개수와 다르다(#9)
  }
  promoteReport.snapLost = still;
  promoteReport.relinked = { ok, tried };
  syncScene();
  refresh();
}

/** 차수 표식으로 되돌아간다 — **문서와 카메라를 함께**(§6.2). */
function revertToOrder(order: number): void {
  const m = orderMarks.find(x => x.order === order);
  if (!m) return;
  pushUndo();
  restoreSnap(m.snap);
  note = `**${order}점으로 되돌렸습니다** — 소실점과 기하를 함께 되돌렸습니다`
       + " <span class=\"dim\">(둘 중 하나만 되돌리면 좌표계가 섞입니다, §6.1)</span>";
  refresh();
}

/** 3D 레이어의 크기 — 뷰 눈 위치를 같이 옮기기 위한 배율 기준. */
function geomScaleOf(list: SStroke[]): number {
  let m = 0;
  for (const s of list) for (const p of s.seg3d!) m = Math.max(m, Math.hypot(p[0], p[1], p[2]));
  return m;
}

/**
 * 확정 — 계획서 §1.2의 **고유한 것 ①**. 그때까지의 획이 3D로 올라가고 카메라가 잠긴다.
 *
 * 전환이 **무변화**여야 한다: 3D 레이어를 그리는 카메라가 확정 카메라와 같으므로
 * 올라간 획은 **잉크가 있던 바로 그 픽셀**에 그려진다(`sceneCam` 머리말 — 설계 보장이다).
 */
function confirm() {
  const ctx = cam.ctx();
  if (!ctx) { note = "카메라가 아직 정해지지 않았습니다 — 가이드를 맞추세요"; refresh(); return; }
  pushUndo();
  const targets = pending(doc, doc.views[0].id);
  const n = solveInto(ctx, targets);
  cam.locked = true;
  lockedOrder = orderOf(ctx.vps, ctx.imgSize);
  stage.pinTo(ctx.principal, ctx.f);
  // **이 차수의 표식**(§6.2). `소실점 다시`에서 더 최근 상태로 덮인다
  markOrder(lockedOrder, appSnap());
  // 확정 직후에도 연쇄를 한 번 돈다 — 놓인 것이 생겼으므로 대기 획이 붙을 수 있다
  const chained = n ? promoteChain(frame() ?? { ctx, toV: ID, fromV: ID, dirV: ID, pinned: true }) : 0;
  syncScene();
  note = `확정 — ${n + chained}/${targets.length}획이 3D로 올라갔습니다`
       + (chained ? `(그중 **${chained}획은 승격 연쇄**)` : "")
       + (n + chained < targets.length
          ? `. 나머지 ${targets.length - n - chained}획은 **2D로 대기**합니다(연결되면 올라갑니다)` : "");
  refresh();
}

/** 소실점 초안 — **확정이 아니다**. 사용자가 맞춘다(§5.1·§5.2). */
function makeDraft() {
  if (cam.locked) return;
  const src = pending(doc, doc.views[0].id).map(s => ({ id: s.id, pts2d: s.pts2d }));
  if (src.length < 3) { note = "획이 더 필요합니다 — 방향마다 두어 개씩 그으세요"; refresh(); return; }
  cam.guides = draftFromDetection(src, cssSize());
  // **초안을 캔버스 끝까지 늘린다**(L-B.2). 방향과 소실점은 안 바뀌고 **지렛대만 길어진다** —
  // 핸들 예산이 길이에 반비례하기 때문이다(`vp_homog.json`: 300px 0.63~2.16 → 1250px 2.68~9.03).
  // 검출 지지선 그대로 두면 그림이 길이를 정해 버린다(L-B.1에서 여섯 중 둘이 요구치 미달이었다).
  for (let i = 0; i < cam.guides.length; i++) cam.guides = extendGuide(cam.guides, i, cssSize());
  cam.apply();
  refreshSens();
  tool = "adjust";
  note = "검출은 **초안**입니다 — 끝점을 끌어 그림에 맞추세요";
  refresh();
}

// ---------------------------------------------------------------- 2D 레이어 그리기

function drawGrid(ctx2: CanvasRenderingContext2D) {
  const r = cam.acc.solve();
  const lines = gridGuides(r.camera, cam.vps(), cam.imgSize,
                           r.camera.principalPoint ? r.camera.principalPoint[1] : null);
  ctx2.save();
  for (const l of lines) {
    ctx2.beginPath();
    ctx2.moveTo(l.a[0], l.a[1]); ctx2.lineTo(l.b[0], l.b[1]);
    if (l.kind === "horizon") {
      ctx2.strokeStyle = HORIZON_COLOR; ctx2.lineWidth = 1; ctx2.setLineDash([6, 4]);
      ctx2.globalAlpha = 0.7;
    } else if (l.kind === "ground") {
      ctx2.strokeStyle = GROUND_COLOR; ctx2.lineWidth = 1; ctx2.setLineDash([]);
      ctx2.globalAlpha = 0.22;
    } else {
      ctx2.strokeStyle = AXIS_COLOR[l.axis ?? 0]; ctx2.lineWidth = 1; ctx2.setLineDash([]);
      ctx2.globalAlpha = 0.16;
    }
    ctx2.stroke();
  }
  ctx2.restore();
}

/** 가이드 선과 손잡이(§5.2). 소실점이 대개 화면 밖이라 점을 직접 못 끈다. */
function drawGuideHandles(ctx2: CanvasRenderingContext2D) {
  if (!cam.guides.length) return;
  const r = DRAFT_TOL.handle_ratio * Math.hypot(...cssSize());
  const on = tool === "adjust" && !cam.locked;
  ctx2.save();
  for (const g of cam.guides) {
    const st = cam.guideState.get(g.axis);
    ctx2.strokeStyle = AXIS_COLOR[g.axis];
    // **채운 가이드는 흐리고 다른 파선**이다 — 그림에서 나온 것이 아니라는 표시다
    ctx2.globalAlpha = (on ? 0.85 : 0.3) * (st?.infinite ? 0.5 : 1) * (g.filled ? 0.45 : 1);
    ctx2.setLineDash(st?.infinite ? [2, 3] : (g.filled ? [1, 5] : [5, 4]));
    ctx2.lineWidth = 1.5;
    ctx2.beginPath(); ctx2.moveTo(g.a[0], g.a[1]); ctx2.lineTo(g.b[0], g.b[1]); ctx2.stroke();
    if (!on) continue;
    ctx2.setLineDash([]);
    ctx2.fillStyle = AXIS_COLOR[g.axis];
    for (const p of [g.a, g.b]) {
      ctx2.beginPath(); ctx2.arc(p[0], p[1], r * 0.45, 0, Math.PI * 2); ctx2.fill();
      ctx2.globalAlpha = 0.3;
      ctx2.beginPath(); ctx2.arc(p[0], p[1], r, 0, Math.PI * 2); ctx2.stroke();
      ctx2.globalAlpha = 0.85;
    }
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
function drawPending(ctx2: CanvasRenderingContext2D) {
  if (cam.locked && !viewIsCurrent()) return;
  ctx2.save();
  ctx2.lineWidth = 2; ctx2.lineCap = "round";
  ctx2.strokeStyle = "#111";
  ctx2.globalAlpha = cam.locked ? 0.45 : 0.9;
  ctx2.setLineDash(cam.locked ? [5, 4] : []);
  for (const s of pending(doc)) {
    if (s.pts2d.length < 2) continue;
    ctx2.beginPath();
    s.pts2d.forEach((p, i) => (i === 0 ? ctx2.moveTo(p[0], p[1]) : ctx2.lineTo(p[0], p[1])));
    ctx2.stroke();
  }
  ctx2.restore();
}

/** 확정 전 미리보기 — 카메라가 잡히면 **올라갈 획을 축 색으로** 보인다(§5.2 실시간 피드백). */
function drawPreview(ctx2: CanvasRenderingContext2D) {
  if (cam.locked) return;
  const ctx = cam.ctx();
  if (!ctx) return;
  const probe = pending(doc, doc.views[0].id).map(s => ({ ...s, seg3d: null } as SStroke));
  solveInto(ctx, probe);
  ctx2.save();
  ctx2.lineWidth = 2.5; ctx2.lineCap = "round"; ctx2.globalAlpha = 0.9;
  for (const s of probe) {
    if (!s.seg3d) continue;
    const a = project(s.seg3d[0], ctx.principal, ctx.f);
    const b = project(s.seg3d[1], ctx.principal, ctx.f);
    if (!a || !b) continue;
    ctx2.strokeStyle = typeof s.axis === "number" ? AXIS_COLOR[s.axis] : "#444";
    ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke();
  }
  ctx2.restore();
  previewCount = probe.filter(s => s.seg3d).length;
  previewStuck = probe.length - previewCount;
  // **왜 안 올라가는지** 가른다 — 축이 안 정해진 것과, 축은 있는데 못 이은 것은 다른 문제다
  previewFree = probe.filter(s => !s.seg3d && s.axis === "free").length;
}
let previewCount = 0, previewStuck = 0, previewFree = 0;

/** 승격에서 잃은 것의 색. 상태 패널의 문장과 **같은 값을 쓴다** — 갈리면 설명이 안 맞는다. */
const LOSS_COLOR = { dropped: "#e67e22", snap: "#c0392b" };

/**
 * **승격이 잃은 것을 화면에 표시한다**(L-C.2, 사람 지시).
 *
 * "승격 후 풀린 스냅을 표시하거나 재연결을 시도한다. **조용히 풀리면 사용자가 모른 채
 * 구조가 끊긴다** — A-3 위반이다." 개수를 상태 줄에 적는 것만으로는 부족하다 —
 * 어느 획인지 모르면 되돌릴지 말지를 정할 수 없다.
 *
 * ⚠ **좌표는 CSS 픽셀이다**(D-C3·#21) — `ctx2`에 배율이 이미 걸려 있다.
 * ⚠ 표시는 **확정 시점에서만** 옳다: `pts2d`는 확정 카메라의 화면 좌표라
 * 돌린 뷰에 그리면 화면에 붙어 따라다니는 유령이 된다(`drawBelowInk` 머리말과 같은 이유).
 */
function drawPromoteLoss(ctx2: CanvasRenderingContext2D) {
  if (!promoteReport || !stage.isPinned) return;
  const byId = new Map(doc.strokes.map(s => [s.id, s]));
  ctx2.save();
  // ① 3D에서 내려온 획 — 획 전체를 주황 점선으로 덮는다
  ctx2.strokeStyle = LOSS_COLOR.dropped; ctx2.lineWidth = 3;
  ctx2.setLineDash([7, 5]); ctx2.globalAlpha = 0.95; ctx2.lineCap = "round";
  for (const id of promoteReport.diff.dropped) {
    const s = byId.get(id);
    if (!s || s.pts2d.length < 2) continue;
    ctx2.beginPath();
    s.pts2d.forEach((p, i) => (i === 0 ? ctx2.moveTo(p[0], p[1]) : ctx2.lineTo(p[0], p[1])));
    ctx2.stroke();
  }
  // ② 스냅이 끊긴 획 — **시작점에** ⊘. 끊긴 것은 획이 아니라 그 점이다
  ctx2.setLineDash([]); ctx2.strokeStyle = LOSS_COLOR.snap; ctx2.lineWidth = 2.5;
  for (const id of promoteReport.snapLost) {
    const s = byId.get(id);
    if (!s || !s.pts2d.length) continue;
    const [x, y] = s.pts2d[0];
    ctx2.beginPath(); ctx2.arc(x, y, 7, 0, Math.PI * 2); ctx2.stroke();
    ctx2.beginPath();
    ctx2.moveTo(x - 5, y + 5); ctx2.lineTo(x + 5, y - 5); ctx2.stroke();
  }
  ctx2.restore();
}

/**
 * 스냅 표식(§3 "표시"). **종류마다 다른 색과 라벨** — SketchUp의 관행 그대로다(A-3).
 * 표식이 없으면 사용자는 무엇에 붙었는지 모르고, 그러면 **조용히 틀린 배치**가 된다.
 */
function drawSnapMark(ctx2: CanvasRenderingContext2D) {
  if (!hoverSnap) return;
  const [x, y] = hoverSnap.screen;
  ctx2.save();
  ctx2.strokeStyle = SNAP_COLOR[hoverSnap.kind];
  ctx2.fillStyle = SNAP_COLOR[hoverSnap.kind];
  ctx2.lineWidth = 2;
  // 끝점은 네모, 나머지는 마름모 — 종류가 표식 모양으로도 갈린다
  if (hoverSnap.kind === "endpoint") ctx2.strokeRect(x - 5, y - 5, 10, 10);
  else {
    ctx2.beginPath();
    ctx2.moveTo(x, y - 6); ctx2.lineTo(x + 6, y); ctx2.lineTo(x, y + 6); ctx2.lineTo(x - 6, y);
    ctx2.closePath(); ctx2.stroke();
  }
  ctx2.globalAlpha = 0.9;
  ctx2.font = "11px system-ui, sans-serif";
  ctx2.fillText(SNAP_LABEL[hoverSnap.kind], x + 9, y - 8);
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
      ctx2.strokeStyle = AXIS_COLOR[live.axis!];
      ctx2.lineWidth = 3; ctx2.globalAlpha = 0.85; ctx2.setLineDash([]);
      ctx2.beginPath(); ctx2.moveTo(a[0], a[1]); ctx2.lineTo(b[0], b[1]); ctx2.stroke();
    }
  }
  // 앵커 표식은 항상 — 어디에 못박혔는지가 판정보다 먼저다
  ctx2.globalAlpha = 1; ctx2.setLineDash([]);
  ctx2.strokeStyle = SNAP_COLOR[live.anchor.kind]; ctx2.lineWidth = 2;
  ctx2.strokeRect(a[0] - 5, a[1] - 5, 10, 10);
  ctx2.restore();
}

function drawBelowInk(ctx2: CanvasRenderingContext2D) {
  // **그리드·가이드·소실점 표식은 확정 뷰의 화면 좌표다.** 자유 시점에서 그리면
  // 화면에 붙어 따라다니는 유령이 된다 — 그래서 그 셋만 확정 시점으로 묶는다.
  // **스냅 표식과 미리보기는 지금 시점의 화면 좌표**라 어느 뷰에서든 옳다(L-B.8).
  drawPending(ctx2);
  drawPromoteLoss(ctx2);
  drawSnapMark(ctx2);
  drawLivePreview(ctx2);
  if (cam.locked && !stage.isPinned) return;
  drawGrid(ctx2);
  drawPreview(ctx2);
  drawGuideHandles(ctx2);
  const [w, h] = cssSize();
  cam.vps().forEach((v, i) => {
    if (!v || v[0] < 0 || v[0] > w || v[1] < 0 || v[1] > h) return;
    ctx2.save();
    ctx2.globalAlpha = 1; ctx2.fillStyle = AXIS_COLOR[i];
    ctx2.beginPath(); ctx2.arc(v[0], v[1], 5, 0, Math.PI * 2); ctx2.fill();
    ctx2.restore();
  });
}

// ---------------------------------------------------------------- 입력

const ink = new InkCanvas(canvas, {
  onBackground: drawBelowInk,
  dragMode: () => tool === "adjust" && !cam.locked,
  onDrag: (p, phase) => {
    // **끌면 그리드와 이미 놓인 기하가 따라 움직인다**(§5.2). 자동 검사가 원리적으로 불가능하므로
    // (§5.3) 이것이 유일한 판정 수단이다.
    if (phase === "down") {
      dragHandle = handleAt(cam.guides, p, cssSize());
      // 핸들을 못 잡았으면 **선 자체**를 잡는다 — 선을 옮겨 더 긴 현을 찾을 수 있다
      const li = dragHandle ? null : guideLineAt(cam.guides, p, cssSize());
      dragLine = li == null ? null : { index: li, last: p };
      return;
    }
    if (phase === "up") {
      if (dragHandle || dragLine) refreshSens();     // 놓을 때 한 번만 다시 잰다
      dragHandle = null; dragLine = null; refresh(); return;
    }
    if (dragHandle) cam.guides = moveHandle(cam.guides, dragHandle, p);
    else if (dragLine) {
      cam.guides = moveGuideBy(cam.guides, dragLine.index,
                               p[0] - dragLine.last[0], p[1] - dragLine.last[1]);
      dragLine.last = p;
    } else return;
    cam.apply();
    refresh();
  },
  onHover: (p) => {
    const fr = p ? frame() : null;
    const sc = fr ? snapCtx(fr) : null;
    const segs = snapSegs(fr?.toV);
    const next = (sc && tool === "draw") ? snapAt(p!, segs, sc, {}, snapStatic(segs)) : null;
    // 값이 안 바뀌면 다시 그리지 않는다 — 포인터마다 전체 재그리기가 돌면 안 된다
    const same = (!next && !hoverSnap)
      || (!!next && !!hoverSnap && next.kind === hoverSnap.kind
          && Math.abs(next.screen[0] - hoverSnap.screen[0]) < 0.5
          && Math.abs(next.screen[1] - hoverSnap.screen[1]) < 0.5);
    hoverSnap = next;
    if (!same) refresh();
  },
  onLive: (pts) => {
    // **그리는 중**: 앵커는 첫 점의 스냅, 끝점은 커서. 확정과 **같은 함수**를 쓴다(#17)
    const fr = frame(), sc = snapCtx(fr);
    if (!fr || !sc || tool !== "draw" || pts.length < 2) { live = null; refresh(); return; }
    const c = fr.ctx;
    const a0: Pt2 = [pts[0][0], pts[0][1]];
    const b0: Pt2 = [pts[pts.length - 1][0], pts[pts.length - 1][1]];
    const segs = snapSegs(fr.toV);
    const anchor = live?.anchor ?? snapAt(a0, segs, sc, {}, snapStatic(segs));
    if (!anchor) { live = null; refresh(); return; }
    // Shift가 눌린 상태면 **처음 추론된 축**을 잡아 둔다(SketchUp과 같다)
    if (axisLock === "infer" && shiftHeld == null) {
      const dirs = axisDirs(c);
      const n0 = nearestAxisOnScreen(anchor.at, dirs, anchor.screen, b0, c);
      if (n0 && n0.deg <= LIVE_TOL.axis_deg) shiftHeld = n0.axis;
    }
    const r = resolveLive(c, anchor.at, anchor.screen, b0);
    // **미리보기는 세계 좌표로 낸다** — 3D 층이 세계에서 그리기 때문이다(L-B.8)
    live = { anchor, axis: r.axis, deg: r.deg,
             seg: r.seg ? [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])] : null, locked: r.locked };
    refresh();
  },
  onStrokeEnd: (stroke) => {
    const pts = stroke.points.map(p => [p[0], p[1]] as Pt2);
    ink.clear();                         // 잉크 버퍼는 문서가 아니다 — 우리가 그린다
    if (pts.length < 2 || tool !== "draw") { refresh(); return; }
    pushUndo();
    // **승격 요약은 그 전환의 설명이다** — 획을 더 그리면 설명이 낡는다(AS-C7과 같은 형태).
    // 차수 되돌리기 버튼은 남는다 — 그것이 §6.2의 지속 수단이다
    promoteReport = null;
    // **§9.3 — 그리는 자리에서만 뷰가 생긴다.** 돌릴 때마다 만들면 뷰가 넘친다
    doc.currentView = viewForDrawing();
    const s = newSStroke(pts, doc.currentView);
    doc.strokes.push(s);
    // 확정 뒤에는 그 자리에서 푼다 — **승격 연쇄**의 첫 형태다(§9.1).
    // **돌린 시점에서도 돈다**(L-B.8) — `frame()`이 좌표 변환을 들고 있다
    const fr = frame();
    if (fr) {
      // **① 시작점 스냅**(§3). 붙으면 그 획의 3D가 확정된다.
      const sc = snapCtx(fr);
      const segs0 = snapSegs(fr.toV);
      const cand = sc ? snapAt(pts[0], segs0, sc, {}, snapStatic(segs0)) : null;
      lastSnapNote = "";
      if (cand) {
        applySnapToStart(s, cand, fr.fromV(cand.at));
        placeLive(s, fr, cand.at);
      } else if (segs0.length) {
        lastSnapNote = "시작점이 아무 대상에도 안 붙었습니다 — **2D로 대기**합니다";
      }
      // **② 못 놓인 것은 일괄 풀이로** — 서로 이어진 2D 획들끼리 풀린다.
      // ⚠ **확정 뷰에서만 돈다** — `liftAll`은 소실점을 쓰고 그 소실점은 확정 카메라의 것이다.
      // 돌린 시점의 2D 획을 그 솔버에 넣으면 **다른 화면 좌표를 같은 카메라로 푸는 것**이다
      if (!s.seg3d && fr.pinned) solveInto(fr.ctx, pending(doc, confirmView().id));
      // **③ 승격 연쇄**(§9.1, L-B.7)
      if (s.seg3d) promoteChain(fr);
      syncScene();
    }
    hoverSnap = null; live = null;
    refresh();
  },
});
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
    // 끄는 중이 아니면 민감도를 다시 잰다 — 낡은 값이 남지 않는다
    if (!dragHandle && !dragLine) refreshSens();
    ink.redraw();
    renderBar();
    renderStatus();
    renderViews();
  } finally { refreshing = false; }
}

function renderBar() {
  const btn = (id: string, label: string, on = false, dis = false) =>
    `<button data-act="${id}"${on ? ' class="on"' : ""}${dis ? " disabled" : ""}>${label}</button>`;
  barEl.innerHTML = [
    btn("draw", "그리기", tool === "draw"),
    btn("adjust", "가이드 조정", tool === "adjust", cam.locked || !cam.guides.length),
    btn("orbit", "궤도", tool === "orbit", !cam.locked),
    '<span class="sep"></span>',
    btn("draft", "소실점 추정", false, cam.locked),
    btn("extend", "가이드 늘리기", false, cam.locked || !cam.guides.length),
    btn("confirm", "확정", false, cam.locked || !cam.ctx()),
    btn("home", "확정 시점으로", false, !cam.locked || stage.isPinned),
    // **차수 승격**(§6.1) — 소실점을 더 잡은 뒤 누른다. 자동으로 안 건다(측정이 그렇게 말한다)
    btn("reorder", "차수 승격", false, !cam.locked || !lifted(doc).length),
    btn("unlock", "소실점 다시", cam.locked === false && !!lifted(doc).length, !cam.locked),
    '<span class="sep"></span>',
    btn("undo", "실행취소", false, !undoStack.length),
    // **차수를 명시한 되돌리기**(L-C.2, §6.2). `실행취소`와 다른 것은 **이름이 차수라는 것**이다 —
    // 승격 뒤에 몇 획을 더 그렸어도 한 번에 돌아간다.
    // **지금 차수의 표식은 안 낸다** — 있는 자리로 되돌아가는 버튼은 아무 일도 안 한다
    ...orderMarks.filter(m => m.order !== lockedOrder)
                 .map(m => btn(`revert${m.order}`, `${m.order}점으로 되돌리기`)),
    btn("clear", "비우기"),
  ].join("");
}

/**
 * **승격 요약**(L-C.2, §6.2). 승격은 **품질을 올리고 배치를 줄인다**(L-C.1: 형태 오차 중앙
 * 0.1259 → 0.0913 · 배치 −168, `order_promote.json@46c028d1`). 어느 쪽을 택할지는
 * 그림마다 다르고 **자동 신호가 없으므로**(AS-L6이 §6.2의 재투영 잔차를 반증했다)
 * 사용자가 정한다. 정하려면 **무엇을 잃었는지 보여야 한다.**
 *
 * ⚠ **조용히 풀린 스냅이 여기 나온다.** `order_promote.json`이 그것을 실측했다 —
 * 다시 안 옮겼다면 어긋났을 거리가 **p90 311px · max 639px**다. `promoteOrder`가
 * 대부분을 새 상으로 옮기지만 **대상이 새 카메라에서 안 놓이면 못 살린다.**
 * 그 획들의 시작점은 옛 카메라의 상 그대로여서 **구조가 소리 없이 끊긴 자리**다 — A-3 위반이다.
 */
function renderPromoteReport(): string {
  const p = promoteReport;
  if (!p) return "";
  const rows: string[] = [];
  rows.push(`<div class="hdr"><b>차수 승격 ${p.before}점 → ${p.after}점</b>`
    + ' <span class="dim">— 전부 다시 풀었습니다(§6.1)</span></div>');
  rows.push(`<div>${diffSummary(p.diff, p.snapLost.length)}</div>`);
  if (p.diff.dropped.length) {
    rows.push(`<div class="warn"><b>${p.diff.dropped.length}획이 3D에서 내려왔습니다</b>`
      + ' — 화면에 <span style="color:#e67e22">주황 점선</span>으로 표시됩니다.'
      + ' <span class="dim">실패가 아니라 <b>대기</b>입니다(§9.1) — 이어지는 획이 생기면 다시 올라갑니다</span></div>');
  }
  if (p.snapLost.length) {
    rows.push(`<div class="warn"><b>스냅 ${p.snapLost.length}개가 끊겼습니다</b>`
      + ` <span class="dim">(${p.reanchored}/${p.had}개는 새 상으로 옮겼습니다)</span>`
      + ' — 붙어 있던 대상이 새 카메라에서 안 놓였습니다.'
      + ' 화면에 <span style="color:#c0392b">빨간 ⊘</span>로 표시됩니다.'
      + ' <span class="dim">그 시작점은 <b>옛 카메라의 자리</b>입니다</span></div>');
    rows.push('<div><button data-act="relink">스냅 재연결 시도</button>'
      + ' <span class="dim">다른 대상에 붙습니다 — <b>자동으로 하지 않습니다</b>(A-3)</span></div>');
  } else if (p.had) {
    rows.push(`<div class="dim">스냅 ${p.reanchored}/${p.had}개를 새 상으로 옮겼습니다 — 끊긴 것 없음</div>`);
  }
  if (p.relinked) {
    rows.push(`<div>재연결 — <b>${p.relinked.ok}/${p.relinked.tried}</b>개가 다른 대상에 붙었습니다`
      + (p.snapLost.length ? ` <span class="dim">(${p.snapLost.length}개는 붙을 곳이 없습니다)</span>` : "")
      + ' <span class="dim">· 아니다 싶으면 <b>실행취소</b></span></div>');
  }
  rows.push('<div class="dim"><b>화면이 움직입니다</b> — 되돌리려면 위의'
    + ` <b>${p.before}점으로 되돌리기</b>를 누르세요(소실점과 기하를 함께 되돌립니다)</div>`);
  return `<div class="promote">${rows.join("")}</div>`;
}

/**
 * 상태 줄의 `**굵게**`를 실제 굵게로 바꾼다.
 *
 * ⚠ **화면에 별표가 그대로 나오고 있었다.** 이 파일의 안내문 대부분이 마크다운으로
 * 적혀 있는데(문서·주석과 같은 문체다) 상태 줄은 HTML을 그린다 — `소실점 다시`·
 * `가이드 늘리기`·`확정`의 문장 전부가 그랬다. L-C.2의 승격 요약이 **강조에 기대는 화면**이라
 * 여기서 드러났다. 고치는 자리는 **쓰는 곳 하나**다(문장 30개를 고치지 않는다).
 *
 * `<` 를 만들지 않으므로 새 태그가 생길 여지가 없다 — 넣는 문장은 전부 이 파일 안에 있다.
 */
const md = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

function renderStatus() {
  const r = cam.acc.solve();
  const c = r.camera;
  const caseLabel = { "3pt": "3점 투시", "2pt": "2점 투시", "1pt": "1점 투시",
                      axonometric: "평행(축측)" }[c.case];
  const rows: string[] = [];
  const n3 = lifted(doc).length, n2 = pending(doc).length;
  rows.push(`<div class="hdr"><b>${caseLabel}</b> · 소실점 ${c.nVps}`
    + (cam.locked ? ' <span class="lock">확정</span>' : "") + "</div>");
  rows.push(`<div>3D <b>${n3}</b> · 2D 대기 <b>${n2}</b>`
    + (pendingElsewhere(doc) ? ` <span class="dim">(다른 뷰 ${pendingElsewhere(doc)} 숨김)</span>` : "")
    + (!cam.locked && previewCount ? ` <span class="dim">· 지금 확정하면 ${previewCount} 올라감</span>` : "")
    + "</div>");
  // **어느 획이 왜 안 올라가는지**(L-B.2). 미배치는 실패가 아니라 대기지만(§9.1),
  // 확정 전이라면 가이드를 고쳐 해결할 수 있으므로 **사유를 갈라 보인다**.
  if (!cam.locked && previewStuck) {
    rows.push(`<div class="dim">안 올라가는 ${previewStuck}획 — 축 미정 ${previewFree} ·`
      + ` 축은 있으나 안 이어짐 ${previewStuck - previewFree}`
      + " <span class=\"dim\">(축 미정은 가이드 각도, 안 이어짐은 획이 서로 닿는지의 문제입니다)</span></div>");
  }
  // **깊이 스케일의 출처는 하나이고 화면에 나온다**(CLAUDE.md §1 / 이론서 16.2·16.4)
  if (c.ok && c.f != null) {
    const src = { "orthocenter(6.3)": "수심(3점, 측정)", "two_vps(6.2)": "두 소실점(측정)",
                  "setting(렌즈)": "렌즈 설정" }[c.fSource!];
    rows.push(`<div class="f">f = ${c.f.toFixed(0)}px · 화각 ${c.fovDeg}° <span class="dim">(${src})</span></div>`);
  }
  if (c.assumption) rows.push(`<div class="dim">${c.assumption}</div>`);
  for (const s of cam.snapped()) {
    rows.push(`<div class="warn">축${s.axis + 1} → <b>무한원(화면 평행)</b> · 각차 ${s.sepDeg.toFixed(1)}°`
      + ` <span class="dim">(${HOMOG_TOL.snap_deg}° 미만이면 교점이 정해지지 않습니다 — 벌려서 끄세요)</span></div>`);
  }
  // **핸들 1px이 축을 얼마나 움직이는가**(L-B.2, §5.2). 자동 판정이 불가능하므로 사용자의
  // 눈이 판정 수단인데, **눈은 자기 손이 얼마나 정밀해야 하는지를 못 본다.**
  // 예산이 1px 미만이면 **그 축은 손으로 맞출 수 없다** — 지금까지 원장에만 있던 사실이다.
  if (!cam.locked && sens.some(x => x.degPerPx != null)) {
    const cells = sens.filter(x => x.degPerPx != null).map(x => {
      const tight = (x.budgetPx ?? 0) < SENS_TOL.unusable_px;
      const filled = cam.guides.some(g => g.axis === x.axis && g.filled);
      return `<span style="color:${AXIS_COLOR[x.axis]}">■</span>`
        + `<b${tight ? ' style="color:#c0392b"' : ""}>${x.budgetPx!.toFixed(1)}px</b>`
        + `<span class="dim">(${x.degPerPx!.toFixed(2)}°/px · 선 ${Math.round(x.shortestGuidePx ?? 0)}px`
        + (filled ? " · <b>채움</b>" : "") + ")</span>";
    }).join(" · ");
    rows.push(`<div>핸들 예산 ${cells}</div>`);
    // **채운 축은 그림에서 나온 것이 아니다** — 숫자가 뜨는 것 자체가 오해를 만든다(A-3)
    const filledAxes = [...new Set(cam.guides.filter(g => g.filled).map(g => g.axis))];
    if (filledAxes.length) {
      rows.push(`<div class="warn">축 ${filledAxes.map(a => a + 1).join("·")}는 <b>검출이 아니라`
        + ` 기본 위치로 채운 것</b>입니다 — 그림이 정한 값이 아니므로 <b>반드시 맞춰야</b> 합니다`
        + ` <span class="dim">(채운 가이드는 흐린 점선입니다)</span></div>`);
    }
    const tight = sens.filter(x => x.budgetPx != null && x.budgetPx < SENS_TOL.unusable_px);
    if (tight.length) {
      rows.push(`<div class="warn">축 ${tight.map(x => x.axis + 1).join("·")}는 <b>손으로 맞출 수 없습니다</b>`
        + ` — 1px 움직임이 ${SENS_TOL.budget_deg}° 예산을 넘습니다.`
        + ` <span class="dim">가이드 선을 끌어 <b>더 긴 자리</b>로 옮기거나 두 선의 각차를 벌리세요</span></div>`);
    }
  }
  // **스냅 상태**(§3 표시). 확정 뒤에만 뜬다 — 대상이 3D 레이어이기 때문이다.
  if (snapCtx()) {
    const rpx = Math.round(SNAP_TOL.radius_ratio * Math.hypot(...cssSize()));
    rows.push(`<div>스냅 <b>켜짐</b> <span class="dim">반경 ${rpx}px · 대상 ${snapSegs().length}선</span>`
      + (hoverSnap
        ? ` · <b style="color:${SNAP_COLOR[hoverSnap.kind]}">${SNAP_LABEL[hoverSnap.kind]}</b>`
          + ` <span class="dim">(${hoverSnap.dist.toFixed(0)}px)</span>`
        : ' <span class="dim">(커서 아래 대상 없음)</span>') + "</div>");
    const lk = lockedAxis();
    if (axisLock != null) {
      rows.push(`<div>축 고정 <b>${axisLock === "infer" ? "Shift" : `축${(axisLock as number) + 1}`}</b>`
        + (lk != null ? ` → <b style="color:${AXIS_COLOR[lk]}">축${lk + 1}</b>` : "")
        + ` <span class="dim">(← 축1 · → 축2 · ↑ 축3 · Shift 추론 축 · Esc 해제)</span></div>`);
    }
    if (live) {
      rows.push(`<div>그리는 중 — 시작 <b style="color:${SNAP_COLOR[live.anchor.kind]}">`
        + `${SNAP_LABEL[live.anchor.kind]}</b> · `
        + (live.axis != null
          ? `<b style="color:${AXIS_COLOR[live.axis]}">축${live.axis + 1}</b>`
            + (live.locked ? ' <b>고정</b>'
               : ` <span class="dim">(${live.deg != null ? live.deg.toFixed(1) : "?"}°)</span>`)
          : `<span class="warn">축 미정</span>`
            + (live.deg != null ? ` <span class="dim">(가장 가까운 축과 ${live.deg.toFixed(1)}°)</span>` : ""))
        + "</div>");
    }
    if (lastSnapNote) rows.push(`<div class="dim">마지막 획 — ${lastSnapNote}</div>`);
  }
  for (const w of r.warnings) rows.push(`<div class="${w.level}">${w.text}</div>`);
  if (note) rows.push(`<div class="note">${note}</div>`);
  // **승격 요약은 맨 위에 둔다**(§6.2) — 아래에 있으면 상태 줄에 묻혀 "눈에 띄게"가 안 된다
  statusEl.innerHTML = md(renderPromoteReport() + rows.join(""));
}

// ---------------------------------------------------------------- 배선

barEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const act = (b as HTMLButtonElement).dataset.act!;
  if (act === "draw" || act === "adjust" || act === "orbit") {
    tool = act;
    // 궤도는 **잉크 캔버스를 통과시켜** 밑의 three 캔버스가 받는다(OrbitControls 그대로).
    canvas.style.pointerEvents = act === "orbit" ? "none" : "auto";
    if (act === "orbit" && stage.isPinned) {
      const segs = lifted(doc).map(s => ({ id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis }));
      stage.unpin(stage.centroid(segs));
      note = "궤도 — 다른 뷰의 2D 대기 획은 숨깁니다(그 뷰의 화면 좌표이기 때문입니다). 돌린 뒤 **그리기**를 누르면 그 각도가 새 뷰가 됩니다";
    }
  } else if (act === "draft") makeDraft();
  else if (act === "extend") {
    // **방향과 소실점은 안 바뀐다** — 지렛대만 길어진다. 예산이 길이에 반비례하기 때문이다.
    const before = cam.guides.map(g => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]));
    for (let i = 0; i < cam.guides.length; i++) cam.guides = extendGuide(cam.guides, i, cssSize());
    const after = cam.guides.map(g => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]));
    cam.apply(); refreshSens();
    note = `가이드를 캔버스 끝까지 늘렸습니다 — 가장 짧은 선 `
         + `${Math.round(Math.min(...before))} → ${Math.round(Math.min(...after))}px`
         + " (방향과 소실점은 안 바뀝니다. **정확도는 가장 짧은 선이 정합니다**)";
  }
  else if (act === "confirm") confirm();
  else if (act === "reorder") promoteOrderNow();
  else if (act === "unlock") {
    // **차수 승격의 입구**(§6.1) — 소실점을 하나 더 잡으려면 가이드를 다시 만져야 한다.
    // 확정 기하는 그대로 두고 **가이드만 연다**. 다시 `차수 승격`을 누르면 전부 다시 푼다
    // **카메라를 만지기 직전이 표식의 자리다**(위 `orderMarks` 머리말) —
    // 여기서 안 뜨면 승격을 되돌려도 소실점이 새 차수로 남는다
    if (lockedOrder != null) markOrder(lockedOrder, appSnap());
    cam.locked = false; tool = "adjust";
    note = "소실점을 다시 잡습니다 — 축을 더 세운 뒤 **차수 승격**을 누르세요. "
         + "확정된 3D는 그대로 있고, 승격을 눌러야 다시 풀립니다";
  }
  else if (act === "home") {
    const ctx = cam.ctx();
    if (ctx) { stage.pinTo(ctx.principal, ctx.f); tool = "draw"; canvas.style.pointerEvents = "auto";
               note = "확정 시점 — 3D가 잉크와 같은 자리에 그려집니다"; }
  } else if (act === "undo") {
    // **문서만 되돌리면 안 된다**(L-C.2) — 승격을 되돌릴 때 소실점이 새 것으로 남으면
    // §6.1이 금지한 **좌표계가 섞인 상태**가 된다. `restoreSnap`이 둘을 함께 되돌린다
    const sn = undoStack.pop();
    if (sn) { restoreSnap(sn); note = ""; }
  } else if (act === "relink") relinkLostSnaps();
  else if (act.startsWith("revert")) revertToOrder(Number(act.slice(6)));
  else if (act === "clear") {
    pushUndo();
    doc = newDoc(); cam.guides = []; cam.apply(); cam.locked = false; lockedOrder = null;
    cam.acc.reset(); syncScene(); sens = []; note = "";
    orderMarks.length = 0; promoteReport = null;
  }
  refresh();
});

// **승격 요약 패널 안의 버튼**(L-C.2). 도구 막대와 같은 규약(`data-act`)을 쓴다 —
// 규약이 둘이 되면 다음 버튼을 어디에 다는지가 매번 판단거리가 된다
statusEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  if ((b as HTMLButtonElement).dataset.act === "relink") relinkLostSnaps();
});

// ---- 축 고정(L-B.5, §4). **SketchUp 그대로**(A-3) — 새로 배울 것이 없다.
// 화살표 배정도 SketchUp의 화면 배치 그대로다(왼쪽=축1 · 위=수직축 · 오른쪽=축2).
const ARROW_AXIS: Record<string, 0 | 1 | 2> = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2 };
window.addEventListener("keydown", (e) => {
  if (!cam.locked) return;                       // 확정 전에는 잠글 축이 없다
  if (e.key === "Shift" && axisLock == null) { axisLock = "infer"; shiftHeld = null; refresh(); return; }
  const ax = ARROW_AXIS[e.key];
  if (ax != null) {
    e.preventDefault();
    axisLock = axisLock === ax ? null : ax;      // 다시 누르면 푼다
    shiftHeld = null;
    relive();
    return;
  }
  if (e.key === "Escape" && axisLock != null) { axisLock = null; shiftHeld = null; relive(); }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Shift" && axisLock === "infer") { axisLock = null; shiftHeld = null; relive(); }
});

/** 고정이 바뀌면 **그리는 중이라도** 미리보기를 다시 푼다 — 안 하면 화면이 낡는다(AS-C7과 같은 형태). */
function relive() {
  const c = cam.ctx();
  if (live && c) {
    const b = ink.livePoints();
    const b2: Pt2 = b.length >= 2 ? [b[b.length - 1][0], b[b.length - 1][1]] : live.anchor.screen;
    const r = resolveLive(c, live.anchor.at, live.anchor.screen, b2);
    live = { anchor: live.anchor, axis: r.axis, deg: r.deg, seg: r.seg, locked: r.locked };
  }
  refresh();
}

window.addEventListener("resize", () => refresh());
// 숨은 탭에서 열리면 관찰자가 발화하지 않는다(PITFALLS #22) — 보이게 되는 순간 다시 본다
document.addEventListener("visibilitychange", () => refresh());

fit();
refresh();

// 브라우저 콘솔 진단용. 측정 하네스와 같은 픽스처를 쓰려면 여기서 문서를 꺼낸다.
(window as unknown as Record<string, unknown>).S2S = {
  doc: () => doc, cam, stage, refresh, SIZE_HEAL,
  // L-B.3 — 종단 확인이 스냅을 앱 경로 그대로 부른다(PITFALLS #17)
  snap: (p: Pt2) => {
    const sc = snapCtx(); const g = snapSegs();
    return sc ? snapAt(p, g, sc, {}, snapStatic(g)) : null;
  },
  snapTargets: () => snapSegs().length,
  hoverSnap: () => hoverSnap,
  live: () => live,
  axisLock: () => ({ mode: axisLock, resolved: lockedAxis() }),
  setAxisLock: (a: 0 | 1 | 2 | "infer" | null) => { axisLock = a; shiftHeld = null; relive(); },
  // L-B.6 — 뷰 시스템(§9.2~§9.4). **앱 경로 그대로**를 종단 확인이 부른다(#17)
  views: () => doc.views.map(v => ({ id: v.id, name: v.name, seq: v.seq,
                                     isConfirm: v.pose === null,
                                     pending: pending(doc, v.id).length })),
  currentView: () => doc.currentView,
  switchView,
  pose: () => stage.pose(),
  /** 궤도를 코드로 돌린다 — Playwright가 마우스로 돌리지 않고도 새 자세를 만든다. */
  orbitTo: (p: ViewPose) => { stage.setPose(p, orbitTarget()); refresh(); },
  /** §9.3의 생성 경로. **L-B.8이 열리기 전에는 확정 뷰를 낸다**(#23). */
  viewForDrawing,
  // L-C.1 — 차수 승격(§6.1). **앱 경로 그대로**를 종단 확인이 부른다(#17)
  order: () => { const c = cam.ctx(); return c ? orderOf(c.vps, c.imgSize) : null; },
  promoteOrderNow,
  // L-C.2 — 되돌리기 UI(§6.2). **앱 경로 그대로**를 종단 확인이 부른다(#17)
  promoteReport: () => promoteReport && {
    before: promoteReport.before, after: promoteReport.after,
    dropped: promoteReport.diff.dropped, gained: promoteReport.diff.gained,
    snapLost: promoteReport.snapLost,
    reanchored: promoteReport.reanchored, had: promoteReport.had,
    relinked: promoteReport.relinked,
  },
  orderMarks: () => orderMarks.map(m => m.order),
  revertToOrder,
  relinkLostSnaps,
  /** 되돌리기가 **카메라까지** 되돌리는지 대조하기 위한 창(L-C.2). */
  camSnapshot: () => ({ guides: cam.guides.map(g => [g.axis, g.a[0], g.a[1], g.b[0], g.b[1]]),
                        locked: cam.locked, lockedOrder }),
  unlockGuides: () => {
    document.querySelector<HTMLButtonElement>('#bar button[data-act="unlock"]')?.click();
  },
};
