// L-B — 단일 뷰포트 UI 엔트리. 계획서 §10.
//
// **옛 `main.ts`를 고치지 않고 새로 짠다**(§10.1) — 좌우 분할·프레임 탭·"여기서 그리기" 토글·
// 점 찍기·고치기·치수 패널이 전부 폐기 대상이라 남는 것이 거의 없었다.
// `canvasFrame`·잉크 캡처·three 씬·`lift.ts`·`vpDetect.ts`·카메라 수학은 그대로 쓴다(§10.2).
//
// **옛 UI는 L-B 게이트 통과 전까지 지우지 않는다**(A-4). `index.html`이 그것이고 여기는 `l.html`이다.
import { InkCanvas } from "./capture/inkCanvas.js";
// **터치 제스처 → 카메라**(2026-08-17 G). 라우팅은 `InkCanvas`가, 해석은 여기가 한다
import { CamGestures, GESTURE_TOL } from "./capture/camGesture.js";
import { cssSizeOf, deviceRatio } from "./capture/canvasFrame.js";
import { Stage, FREE_FOV_DEG, type StageSeg } from "./ui/stage.js";
import { CamState } from "./ui/camState.js";
import { newDoc, newSStroke, newView, deleteView, lifted, pending, pendingElsewhere, liftable,
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
import { liftAll, LIFT_TOL, type LiftStroke } from "./s3d/lift.js";
import { snapCandidates, staticCandidates, SNAP_ORDER, SNAP_LABEL, SNAP_COLOR, SNAP_ICON, SNAP_TIP,
         type SnapCand, type SnapKind, type SnapSeg, type SnapCtx,
         type StaticCand } from "./s3d/snap.js";
// **2D 오스냅**(4차 지시 1) — 카메라 확정 전·미승격 2D 획의 화면 스냅. 후보 규칙은 snap2d.ts 하나다
import { static2dCandidates, snap2dAt, alignAxes, type Snap2Cand, type Snap2Seg,
         type AlignHit } from "./s3d/snap2d.js";
import { segmentFromAnchor, nearestAxisOnScreen, LIVE_TOL } from "./s3d/liveLine.js";
import { representative, AXIS_TOL } from "./s3d/axis.js";
// **자동 분할**(지시 I) — 교차·접촉 절단점과 조각. SketchUp 선례. 순수 기하는 split.ts 하나다(#17)
import { cutParams, piecesFromCuts, subtractIntervals, reanchorId, pointAt,
         type Seg3 } from "./s3d/split.js";
import { promoteOrder, type OrderStroke } from "./s3d/promoteOrder.js";
import { AXIS_COLOR, guides as gridGuides, HORIZON_COLOR, GROUND_COLOR } from "./s3d/grid.js";
import { project, axisDirection, groundFrame, sub3, angleBetween,
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
            end: SnapCand | null } | null = null;
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
function snapped2d(raw: Pt2[]): Pt2[] { return resolve2d(raw).pts; }

/** `resolve2d`의 결과 — 미리보기(onLive)와 확정(onStrokeEnd)이 **같은 값**을 본다(#17·§11). */
interface Resolve2d {
  a: Pt2; b: Pt2;
  ortho: ScreenOrtho | null; vpdir: VpDirSnap | null;
  start2: Snap2Cand | null; end2: Snap2Cand | null;
  /** 관계 스냅 가이드(4차 지시 5-c). */
  guides: { from: Pt2; to: Pt2 }[];
  /** 확정 시 문서에 남길 점열. */
  pts: Pt2[];
  /** 무엇이든 걸렸는가 — 미리보기 표시 여부. */
  engaged: boolean;
}

/**
 * **카메라 확정 전의 2D 판정 전부**(4차 지시 1·2·5 통합) — 우선순위는
 * **오스냅 > 방향(화면 직교·소실점) > 관계 스냅(정렬)**이다(지시 5-d — 오스냅이 이긴다).
 * 관계 스냅은 방향 스냅과 **성분으로 결합**한다: 직교 세로선이면 y만, 가로선이면 x만,
 * 소실점 방향이면 그 직선 위에서 미끄러져 교점으로 — 방향을 깨지 않고 정렬한다.
 */
function resolve2d(raw: Pt2[]): Resolve2d {
  const a0 = raw[0], b0 = raw[raw.length - 1];
  const guides: { from: Pt2; to: Pt2 }[] = [];
  const tol = OSNAP.radiusPx;
  const alignCands = (): Snap2Cand[] => {
    const segs = pend2Segs();
    return segs.length ? static2dCandidates(segs, Math.hypot(...cssSize())) : [];
  };
  // ① 시작점 — 오스냅이 이기고, 안 붙으면 정렬(끝점·중점의 x·y)
  const start2 = snap2At(a0);
  let a: Pt2 = start2 ? start2.at : [a0[0], a0[1]];
  if (!start2 && REL_SNAP.on) {
    const h = alignAxes(a, alignCands(), tol);
    if (h.x) a = [h.x.v, a[1]];
    if (h.y) a = [a[0], h.y.v];
    if (h.x) guides.push({ from: h.x.from, to: [a[0], a[1]] });
    if (h.y) guides.push({ from: h.y.from, to: [a[0], a[1]] });
  }
  // ② 끝점 — 오스냅(굽음 규약은 3D 양 끝 스냅 그대로, #34)
  const rep0 = representative(raw);
  const end2 = (rep0 && rep0.bend <= AXIS_TOL.bend_max) ? snap2At(b0) : null;
  if (end2) {
    return { a, b: end2.at, ortho: null, vpdir: null, start2, end2, guides,
             pts: [a, end2.at], engaged: true };
  }
  // ③ 방향 — 화면 직교·소실점 방향(이동량이 작은 쪽, D-L58)
  const d = dirSnap2d(a, b0);
  let b: Pt2 = [d.at[0], d.at[1]];
  // ④ 관계 스냅 — 방향과 성분으로 결합한다
  if (REL_SNAP.on) {
    const h = alignAxes(b, alignCands(), tol);
    const push = (hit: AlignHit) => guides.push({ from: hit.from, to: [b[0], b[1]] });
    if (d.ortho) {
      // 직교 스냅은 한 성분이 이미 앵커에 잠겨 있다 — 남은 성분만 정렬한다
      if (d.ortho.dir === "v" && h.y) { b = [b[0], h.y.v]; push(h.y); }
      if (d.ortho.dir === "h" && h.x) { b = [h.x.v, b[1]]; push(h.x); }
    } else if (d.vpdir) {
      // 방향선 위에서 미끄러져 정렬 — 가이드(x=cx·y=cy)와 방향선의 교점 중 이동이 작은 쪽
      const u: Pt2 = [d.vpdir.vp[0] - a[0], d.vpdir.vp[1] - a[1]];
      let best: { q: Pt2; hit: AlignHit; move: number } | null = null;
      if (h.x && Math.abs(u[0]) > 1e-6) {
        const t = (h.x.v - a[0]) / u[0];
        const q: Pt2 = [h.x.v, a[1] + t * u[1]];
        const move = Math.hypot(q[0] - b[0], q[1] - b[1]);
        if (move <= tol) best = { q, hit: h.x, move };
      }
      if (h.y && Math.abs(u[1]) > 1e-6) {
        const t = (h.y.v - a[1]) / u[1];
        const q: Pt2 = [a[0] + t * u[0], h.y.v];
        const move = Math.hypot(q[0] - b[0], q[1] - b[1]);
        if (move <= tol && (!best || move < best.move)) best = { q, hit: h.y, move };
      }
      if (best) { b = best.q; guides.push({ from: best.hit.from, to: [b[0], b[1]] }); }
    } else {
      if (h.x) b = [h.x.v, b[1]];
      if (h.y) b = [b[0], h.y.v];
      if (h.x) push(h.x);
      if (h.y) push(h.y);
    }
  }
  const startMoved = a[0] !== a0[0] || a[1] !== a0[1];
  const endMoved = !!d.ortho || !!d.vpdir || b[0] !== b0[0] || b[1] !== b0[1];
  const pts: Pt2[] = endMoved ? [a, b] : startMoved ? [a, ...raw.slice(1)] : raw;
  return { a, b, ortho: d.ortho, vpdir: d.vpdir, start2, end2: null, guides, pts,
           engaged: !!start2 || endMoved || guides.length > 0 };
}

/**
 * **카메라 확정 전 끝점의 방향 스냅**(4차 지시 2) — 소실점 방향(`vpDirSnap`)과 화면
 * 직교(`screenOrthoSnap`) 중 **끝점 이동량이 작은 쪽**이 이긴다(`chooseAxis`의 커서 규칙과
 * 같은 갈래 — 각으로 못 가르는 자리를 커서가 가른다). 소실점이 없으면 직교뿐이다.
 * 둘 다 임계 밖이면 그대로 둔다 — 임계 밖까지 끌면 두 번째 소실점을 만들 대각선을 못 긋는다.
 */
function dirSnap2d(a: Pt2, b: Pt2): { at: Pt2; ortho: ScreenOrtho | null; vpdir: VpDirSnap | null } {
  const dir = vpDirSnap(a, b, cam.vps());
  const o = screenOrthoSnap(a, b);
  if (dir && o) {
    const mv = Math.hypot(dir.at[0] - b[0], dir.at[1] - b[1]);
    const mo = Math.hypot(o.at[0] - b[0], o.at[1] - b[1]);
    return mv <= mo ? { at: dir.at, ortho: null, vpdir: dir } : { at: o.at, ortho: o, vpdir: null };
  }
  if (dir) return { at: dir.at, ortho: null, vpdir: dir };
  if (o) return { at: o.at, ortho: o, vpdir: null };
  return { at: b, ortho: null, vpdir: null };
}
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
  radiusPx: 15,
  kinds: { vertex: true, endpoint: true, midpoint: true, intersection: true,
           perpendicular: true, on_edge: true, on_face: true } as Record<SnapKind, boolean>,
  open: false,                       // 설정 패널이 열려 있는가
};
/** 앱 조리개(px) → 하네스 규약(대각 비). **한 군데서만 환산한다**(#17). */
const osnapCfg = () => ({ radius_ratio: OSNAP.radiusPx / Math.hypot(...cssSize()) });
/** **종류 필터를 지난 최선 후보** — 앱의 모든 스냅 질의가 이것을 지난다(#17). */
function appSnapAt(p: Pt2, segs: SnapSeg[], sc: SnapCtx, pre: StaticCand[]): SnapCand | null {
  return snapCandidates(p, segs, sc, osnapCfg(), pre).find(c => OSNAP.kinds[c.kind]) ?? null;
}

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

const appSnap = (): AppSnap => takeSnap(doc, cam,
  promoteReport ? { ...promoteReport, snapLost: [...promoteReport.snapLost] } : null);

/** 스냅샷을 그대로 되돌린다. **문서만 되돌리지 않는다**(`appSnap.ts` 머리말). */
function restoreSnap(s: AppSnap) {
  doc = applySnap(cam, s);
  const c = cam.ctx();
  if (c) stage.pinTo(c.principal, c.f);
  const rep = s.report as PromoteReport | null;
  promoteReport = rep ? { ...rep, snapLost: [...rep.snapLost] } : null;
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
let snapPre: StaticCand[] | null = null;
const snapStatic = (segs: SnapSeg[]): StaticCand[] => (snapPre ??= staticCandidates(segs));

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
}

const ID = <T>(x: T) => x;

function frame(): Frame | null {
  // **"확정됐는가"는 계산이다**(지시 1) — 카메라가 서면 그 순간부터 확정이다(옛 `locked` 플래그 폐기).
  const c = cam.ctx();
  if (!c) return null;
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
function endSnapAt(fr: Frame, anchorAt: Vec3, p: Pt2): SnapCand | null {
  const sc = snapCtx(fr, anchorAt);
  if (!sc) return null;
  const segs = snapSegs(fr.toV);
  // ⚠⚠ **끝점 스냅은 "정확한" 대상만 쓴다**(라이노 기본값 그대로, A-3).
  // 라이노에서 **Near(근처점)는 기본이 꺼져 있다** — 선 근처 어디서나 걸려 너무 잘 잡히기
  // 때문이다. 여기서도 같은 일이 실제로 났다: 모서리를 따라 그으면 `on_edge`가 **언제나**
  // 걸려 모든 획이 두 점 배치가 됐다(종단 확인이 잡았다). 시작점 스냅은 종전대로 전부 쓴다 —
  // 그 경로의 측정(`snap.json`)이 그 목록 위에 있다.
  const cand = snapCandidates(p, segs, sc, osnapCfg(), snapStatic(segs))
    .find(c => OSNAP.kinds[c.kind] && c.kind !== "on_edge" && c.kind !== "on_face") ?? null;
  // **앵커 자신에 붙는 것은 선분이 아니다** — 길이 0을 만들지 않는다
  if (!cand) return null;
  const d = Math.hypot(cand.at[0] - anchorAt[0], cand.at[1] - anchorAt[1], cand.at[2] - anchorAt[2]);
  return d > 1e-9 ? cand : null;
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
  // **겨냥 거리(px)를 남긴다**(지시 K) — 스냅 반경의 실측 근거. 스냅 후에는 못 잰다
  st.snapDistPx = cand.dist;
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
      const cand = appSnapAt(st.pts2d[0], segs, sc, pre);
      if (!cand) continue;
      applySnapToStart(st, cand, fr.fromV(cand.at));
      // **대기 획도 양 끝 스냅으로 올라갈 수 있다**(D-L46) — 축이 없어도 두 점이면 놓인다
      const endCand = endSnapAt(fr, cand.at, st.pts2d[st.pts2d.length - 1]);
      if (endCand) applySnapToEnd(st, endCand, fr.fromV(endCand.at));
      if (placeLive(st, fr, cand.at, endCand)) n += 1;
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
function resolveLive(c: PlaceCtx, at: Vec3, a2: Pt2, b2: Pt2, end: SnapCand | null = null) {
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
  // **고정 축은 후보 밖일 수 있다** — 그때는 그 축으로 직접 푼다(같은 함수다)
  const seg = cand && cand.axis === ax ? cand.seg : segmentFromAnchor(at, dirs[ax], b2, c);
  const deg = cand && cand.axis === ax ? cand.deg : null;
  const tied = ch.tied.map((t: AxisCand) => t.axis);
  return seg
    ? { axis: ax, deg, seg, locked: use != null, ambiguous: ch.ambiguous && use == null,
        tied, twoPoint: false, why: "" }
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
 * 스냅된 시작점 + 축 → 그 자리에서 3D 확정(§3 마지막 문단 · §7).
 * 축이 안 정해지면 `false`이고 그 획은 2D로 **대기**한다(§9.1).
 */
function placeLive(st: SStroke, fr: Frame, atV: Vec3, end: SnapCand | null = null): boolean {
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
  const r = resolveLive(fr.ctx, atV, st.pts2d[0], st.pts2d[st.pts2d.length - 1], end);
  if (!r.seg || (r.axis == null && !r.twoPoint)) {
    lastSnapNote = `${r.why} — **2D로 대기**합니다`;
    return false;
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
  if (r.twoPoint) {
    const lab = r.axis ?? "free";
    st.axis = lab;
    st.userAxis = false;
    st.seg3d = [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])];
    lastSnapNote = `**양 끝 스냅**으로 확정(축 ${typeof lab === "number" ? lab + 1 : "미분류"})`
                 + ` — ${SNAP_LABEL[st.snapStart!.kind as SnapKind]}`
                 + ` → ${SNAP_LABEL[(end?.kind ?? "endpoint") as SnapKind]}`
                 + (r.deg != null ? ` <span class="dim">(가장 가까운 축과 ${r.deg.toFixed(1)}°)</span>` : "");
    return true;
  }
  st.axis = r.axis as 0 | 1 | 2;
  // **사용자가 고른 축은 재분류가 덮지 않는다**(`doc.ts`의 `userAxis`, §6.1의 "사용자 지정만 유지")
  st.userAxis = r.locked;
  // **시점 좌표로 푼 것을 세계로 되돌린다**(L-B.8). 확정 시점에서는 항등이다
  st.seg3d = [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])];
  lastSnapNote = r.locked
    ? `축${(r.axis as number) + 1}로 **고정**해 확정`
    : `축${(r.axis as number) + 1}로 확정 (축과 ${r.deg != null ? r.deg.toFixed(1) : "?"}°)`;
  return true;
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

/** 확정 뷰 — `pose === null`인 것 하나다(§9.2). 첫 카메라 자체이고 자세가 항등이다. */
const confirmView = () => doc.views.find(v => v.pose === null) ?? doc.views[0];

/** 궤도 중심 — 3D 레이어의 무게중심. 없으면 `null`이고 컨트롤이 원점을 본다. */
const orbitTarget = () => stage.centroid(lifted(doc).map(s =>
  ({ id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis })));

/**
 * **손가락이 카메라를 움직인다**(2026-08-17 G). 잉크 캔버스가 라우터이고(`onCamera`)
 * 여기서 `OrbitControls`의 **공개 API**로 내려간다 — 궤도 수학을 다시 짜지 않는다(A-3).
 *
 * `begin()`이 **확정 카메라를 푼다** — `궤도` 버튼이 하던 그 일이고, 손가락이 그것을 대신한다.
 * ⚠ **도구는 안 바꾼다**: 펜은 계속 그리는 도구다(그것이 지시문의 목표 동작이다).
 */
const gestures = new CamGestures({
  begin: () => {
    if (!cam.standing() || !lifted(doc).length) return false;   // 아직 돌릴 3D가 없다
    if (stage.isPinned) {
      stage.unpin(orbitTarget());
      refresh();   // ⛔ "돌리는 중" 안내를 뺐다(지시 3) — 돌릴 수 있는지는 손가락이 안다
    }
    stage.viewport.userMoved = true;   // 자동 맞춤이 시점을 빼앗지 않는다
    return true;
  },
  controls: () => stage.viewport.controls,
  height: () => stage.size()[1],
  changed: () => stage.viewport.invalidate(),
  ended: () => refresh(),
});

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
    tool = "draw";
    note = "";
  } else {
    stage.setPose(v.pose, orbitTarget());
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
    if (!liftable(st)) continue;                 // **주석은 3D로 안 간다**(D-3)
    if (st.userAxis) continue;
    // **규칙이 이미 축을 정해 뒀다** — 검출 판정(`classifyStroke`)을 안 부른다(사람 지시 1).
    st.axis = cam.axisOf(st.pts2d).axis;
  }
  const input: LiftStroke[] = targets.filter(liftable)
    .map(s => ({ id: s.id, pts2d: s.pts2d, axis: s.axis }));
  const r = liftAll(input, { principal: ctx.principal, f: ctx.f, vps: ctx.vps,
                             imgSize: ctx.imgSize, axisDirs: ctx.axisDirs });
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
 * **자동으로 건다**(2026-08-17 지시 1 — 전이 P2 → P3이 곧 승격이고 버튼이 없다).
 * 사용자가 기울어진 세로 모서리를 "수직축"이라 답하는 순간 규칙이 V₃를 세우고 여기가 돈다.
 * 화면이 **실제로 움직이므로 알린다**(지시 3-d의 예외 둘 중 하나) — `promoteReport`가 그것이다.
 * 아니다 싶으면 `실행취소`·`N점으로 되돌리기`가 §6.2의 경로다.
 *
 * `before`는 **전이 직전의 차수**다 — 부르는 쪽(`advanceCamera`)이 feed 전에 재 둔다.
 */
function autoPromoteOrder(before: number): void {
  const ctx = cam.ctx();
  if (!ctx) return;
  // **승격 전 배치를 id로 찍어 둔다**(#10 — 뺄셈으로 만들지 않는다). 나중에 개수만 있으면
  // "몇 개 잃었다"까지는 적을 수 있어도 **어느 획인지 화면에 표시할 수 없다.**
  const placedBefore = new Map(doc.strokes.map(s => [s.id, s.seg3d != null]));
  // ⚠ **여기서 `pushUndo`를 안 한다** — 승격을 일으킨 획의 `onStrokeEnd`가 이미 쌓았고,
  // 옛 차수의 표식은 `feedCamera`가 **feed 직전 스냅샷**으로 남겼다(여기서 뜨면 이미 새 차수다).
  const input: OrderStroke[] = doc.strokes.map(s => ({
    id: s.id, pts2d: s.pts2d, axis: s.axis, userAxis: s.userAxis, snapStart: s.snapStart,
    // **양 끝 스냅은 승격에서도 두 점으로 다시 풀린다**(D-L46) — 하나라도 못 살리면 안 놓는다
    snapEnd: s.snapEnd,
  }));
  const r = promoteOrder(input, { principal: ctx.principal, f: ctx.f, vps: ctx.vps,
                                  imgSize: ctx.imgSize, axisDirs: ctx.axisDirs },
                         {}, (pts) => cam.axisOf(pts).axis);
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
    if (x) { s.pts2d = x.pts2d; s.snapStart = x.snapStart; s.snapEnd = x.snapEnd ?? null; }
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
  stage.pinTo(ctx.principal, ctx.f);
  doc.currentView = confirmView().id;
  syncScene();
  const after = cam.order();
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
    const cand = s ? appSnapAt(s.pts2d[0], segs.filter(g => g.id !== id), sc,
                               pre.filter(c => c.ofId !== id && c.ofId2 !== id)) : null;
    if (!s || !cand) { still.push(id); continue; }
    applySnapToStart(s, cand, fr.fromV(cand.at));
    // **양 끝 스냅이었으면 끝점도 다시 붙여야 한다**(D-L46) — 시작점만 살리면 그 획은
    // **반쪽만 옛 카메라의 자리**에 남는다(조용히 틀린 자리다, A-3).
    // 못 붙이면 `snapEnd`를 지우고 축 경로로 되돌린다 — **없는 스냅을 들고 있지 않는다**
    let endCand: SnapCand | null = null;
    if (s.snapEnd) {
      endCand = endSnapAt(fr, cand.at, s.pts2d[s.pts2d.length - 1]);
      if (endCand) applySnapToEnd(s, endCand, fr.fromV(endCand.at));
      else s.snapEnd = null;
    }
    // **그리기와 같은 경로로 놓는다**(#17·A-3) — 앵커가 생겼으므로 §7의 실시간 경로다.
    // 일괄 솔버를 부르면 안 된다: 돌린 시점에서는 `pts2d`가 다른 화면 좌표다(L-B.8 머리말)
    s.seg3d = null;
    placeLive(s, fr, cand.at, endCand);
    ok += 1;                                    // **붙은 개수**다 — 놓인 개수와 다르다(#9)
  }
  promoteReport.snapLost = still;
  promoteReport.relinked = { ok, tried };
  syncScene();
  refresh();
}

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
  const hit = pickStroke(p);
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
  const rPx = PICK_TOL.radius_ratio * Math.hypot(...cssSize());
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
  if (next === "note") { st.seg3d = null; placed = false; }
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
  const targets = pending(doc, doc.views[0].id);
  const n = solveInto(ctx, targets);
  stage.pinTo(ctx.principal, ctx.f);
  // 확정 직후에도 연쇄를 한 번 돈다 — 놓인 것이 생겼으므로 대기 획이 붙을 수 있다
  if (n) promoteChain(frame() ?? { ctx, toV: ID, fromV: ID, dirV: ID, pinned: true });
  // **이 차수의 표식**(§6.2) — `N점으로 되돌리기`의 자리다.
  // ⚠ **연쇄 뒤에 뜬다.** 앞에 뜨면 표식이 연쇄 전 절반만 든 상태가 된다 — 옛 판은
  // `소실점 다시`가 표식을 덮어써 이 순서 결함이 가려져 있었고, 그 버튼이 없어지자
  // 종단 확인(되돌리기 ids3d 대조)이 실제로 잡았다(2026-08-17 3차).
  markOrder(cam.order(), appSnap());
  syncScene();
  refresh();
}

/**
 * **획 하나가 카메라를 어디로 보내는가** — 전이(NONE→P1 · NONE→P2 · P2→P3)의 단일 관문.
 *
 * `cam.feed` 앞뒤로 차수를 재서 ① 처음 서면 조용히 확정(`standCamera` — 무변화 전환)
 * ② 차수가 오르면 **자동 승격**(`autoPromoteOrder` — 형태가 움직이므로 알린다, 지시 3-d).
 * 승격 직전 상태는 `markOrder`가 표식으로 남긴다(§6.2 되돌리기).
 */
function feedCamera(line: RLine, forced?: "screen" | "depth" | "vertical") {
  const before = cam.order();
  const wasStanding = cam.standing();
  // 승격은 **수직축 답**에서만 난다(P2 → P3) — 그때만 직전 상태를 떠 둔다(스냅샷 비용)
  const preSnap = wasStanding && forced === "vertical" ? appSnap() : null;
  const r = cam.feed(line, forced);
  if (r.applied && cam.standing()) {
    if (!wasStanding) standCamera();
    else if (cam.order() !== before && preSnap) {
      markOrder(before, preSnap);
      autoPromoteOrder(before);
    }
  }
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
function feedStroke(st: SStroke, forced?: "screen" | "depth" | "vertical"): void {
  const rep = representative(st.pts2d);
  if (!rep) return;
  const line: RLine = { a: rep.a, b: rep.b };
  const r = feedCamera(line, forced);
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
function answerAsk(choice: "screen" | "depth" | "vertical"): void {
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
// 차수 승격 알림(`renderPromoteReport` — 형태가 실제로 움직인다).

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

function horizonGrab(p: Pt2): boolean {
  // ⚠ 4차 지시 4로 **보이지 않는 지평선은 잡히지 않는다** — 확정 전에는 지평선이 없다.
  // 확정 후에는 잠긴다(D-L45의 잠금 그대로) — 지시 4-e(확정 후 피치 끌기)는 전부 다시
  // 풀기(승격 규약)가 필요해 DEFERRED로 미뤘다(D-L60).
  if (!horizonVisible()) return false;
  if (tool !== "draw" || !cam.canSetHorizon()) return false;
  if (cam.standing() && !stage.isPinned) return false;      // 돌린 뷰의 화면 좌표가 아니다
  return Math.abs(p[1] - cam.rules.horizon) <= PICK_TOL.radius_ratio * Math.hypot(...cssSize());
}

function drawHorizon(ctx2: CanvasRenderingContext2D) {
  // **소실점 확정 전에는 지평선이 없다**(4차 지시 4-a — 빈 종이). 결과이지 전제가 아니다
  if (!horizonVisible()) return;
  // ⚠ **확정 시점에서만 그린다** — 지평선은 **확정 카메라의 화면 좌표**다(그리드·가이드와 같다).
  // 돌린 뷰에 그리면 화면에 붙어 따라다니는 유령이 된다(`drawBelowInk` 머리말).
  if (cam.standing() && !stage.isPinned) return;
  const [w] = cssSize();
  const y = cam.rules.horizon;
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

function drawGrid(ctx2: CanvasRenderingContext2D) {
  if (!SHOW_GRID.on) return;
  const r = cam.acc.solve();
  // **1점에서도 격자가 선다**(지시 5-5) — 무한원 축의 방향(`axisDirs`)을 넘긴다(D-L40)
  const lines = gridGuides(r.camera, cam.vps(), cam.imgSize,
                           r.camera.principalPoint ? r.camera.principalPoint[1] : null,
                           cam.ctx()?.axisDirs ?? null);
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
    if (s) drawStraight(ctx2, s.pts2d);           // **직선**(§1.1)
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
function pickStroke(p: Pt2): string | null {
  return nearestSeg(p, pickSegs(), PICK_TOL.radius_ratio * Math.hypot(...cssSize()));
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
  drawPending(ctx2);
  drawPicked(ctx2);
  drawPromoteLoss(ctx2);
  // **2D 후보의 표식도 같은 자리에서 낸다**(4차 지시 1) — 3D가 있으면 3D가 이긴다(질의와 같은 순서)
  drawSnapMark(ctx2, hoverSnap ?? (hover2d ? { kind: hover2d.kind, screen: hover2d.at } : null));
  drawLivePreview(ctx2);
  drawLive2d(ctx2);                     // **카메라가 서기 전의 화면 직교·2D 오스냅**(A-2·지시 1)
  if (cam.standing() && !stage.isPinned) return;
  drawGrid(ctx2);
  drawAsk(ctx2);
  const [w, h] = cssSize();
  // ⛔ **거리점 표시를 지웠다**(지시 2) — 거리점 경로 전체가 폐기됐다.
  cam.vps().forEach((v, i) => {
    if (!v || v[0] < 0 || v[0] > w || v[1] < 0 || v[1] > h) return;
    ctx2.save();
    // **표식을 줄였다**(지시 5-6) — 소실점은 참조점이지 그림이 아니다
    ctx2.globalAlpha = 0.8; ctx2.fillStyle = AXIS_COLOR[i];
    ctx2.beginPath(); ctx2.arc(v[0], v[1], 3, 0, Math.PI * 2); ctx2.fill();
    ctx2.restore();
  });
}

// ---------------------------------------------------------------- 입력

const ink = new InkCanvas(canvas, {
  onBackground: drawBelowInk,
  // **입력 장치가 도구를 가른다**(G): 펜·마우스는 잉크, **터치는 언제나 카메라**다.
  // 마우스는 `궤도(마우스)`를 누른 동안만 카메라로 간다(데스크톱 확인용).
  onCamera: (id, phase, p) => gestures.onPointer(id, phase, p),
  cameraMouse: () => tool === "orbit",
  onWheel: (d) => gestures.onWheel(d),
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
    const next = (sc && tool === "draw") ? appSnapAt(p!, segs, sc, snapStatic(segs)) : null;
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
      live2d = (tool === "draw" && pts.length >= 2)
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
    const anchor = live?.anchor ?? appSnapAt(a0, segs, sc, snapStatic(segs));
    if (!anchor) { live = null; refresh(); return; }
    // ⚠ **옛 판은 여기서 `Shift`가 잡은 축을 기억했다**(`shiftHeld`) — D-L44로 그 뜻이
    // 바뀌면서 죽은 코드가 됐고 지웠다. 지금 `Shift`는 `freeStroke`이고 `resolveLive`가 본다
    //
    // **끝점도 스냅한다**(오스냅, D-L46) — 붙으면 **축 없이 두 점으로** 확정된다.
    // 미리보기가 그것을 그대로 보이므로 확정과 어긋날 여지가 없다(§11 게이트).
    const end = endSnapAt(fr, anchor.at, b0);
    const r = resolveLive(c, anchor.at, anchor.screen, b0, end);
    // **미리보기는 세계 좌표로 낸다** — 3D 층이 세계에서 그리기 때문이다(L-B.8)
    live = { anchor, axis: r.axis, deg: r.deg,
             seg: r.seg ? [fr.fromV(r.seg[0]), fr.fromV(r.seg[1])] : null, locked: r.locked,
             ambiguous: r.ambiguous, tied: r.tied, end };
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
    // **2D 오스냅 + 화면 직교 스냅**(A-2·4차 지시 1). 카메라가 서기 전에만 돈다 —
    // 그 뒤로는 3D 오스냅·축 스냅이 정한다. 미리보기(`onLive`)와 **같은 함수·같은 순서**를
    // 부르므로 보인 대로 놓인다(§11 게이트).
    const pts = frame() ? raw : snapped2d(raw);
    pushUndo();
    // **승격 요약은 그 전환의 설명이다** — 획을 더 그리면 설명이 낡는다(AS-C7과 같은 형태).
    // 차수 되돌리기 버튼은 남는다 — 그것이 §6.2의 지속 수단이다
    promoteReport = null;
    // **§9.3 — 그리는 자리에서만 뷰가 생긴다.** 돌릴 때마다 만들면 뷰가 넘친다
    doc.currentView = viewForDrawing();
    const s = newSStroke(pts, doc.currentView, channel);
    doc.strokes.push(s);
    // **① 규칙에 넣는다**(사람 지시 1) — 카메라를 세우고(NONE→P1·P2) 승격(P2→P3)하는
    // 유일한 경로다. 그은 선이 곧 제약이다: 화면 가로세로면 축 자체, 깊이면 교점.
    // 카메라가 선 뒤에도 넣는다 — 지지선 세기와 **3점 입구**(기울어진 수직선 물음)가 살아야
    // 하기 때문이다. 확정·승격은 `feedCamera` 안에서 자동으로 난다(지시 1 — 버튼이 없다).
    // **주석은 규칙에도 3D에도 안 들어간다**(D-3). 해칭·지시선·메모는 기하가 아니다 —
    // 그것으로 카메라를 정하면 **조용히 틀린 카메라**가 된다(A-3).
    if (liftable(s)) feedStroke(s);
    // 확정 뒤에는 그 자리에서 푼다 — **승격 연쇄**의 첫 형태다(§9.1).
    // **돌린 시점에서도 돈다**(L-B.8) — `frame()`이 좌표 변환을 들고 있다
    const fr = liftable(s) ? frame() : null;
    if (fr) {
      // **① 시작점 스냅**(§3). 붙으면 그 획의 3D가 확정된다.
      const sc = snapCtx(fr);
      const segs0 = snapSegs(fr.toV);
      const cand = sc ? appSnapAt(pts[0], segs0, sc, snapStatic(segs0)) : null;
      lastSnapNote = "";
      if (cand) {
        applySnapToStart(s, cand, fr.fromV(cand.at));
        // **끝점도 붙는가**(오스냅, D-L46) — 붙으면 **축 없이 두 점으로** 확정된다.
        // 미리보기(`onLive`)와 **같은 함수**를 부른다(#17: 미리보기와 확정이 갈릴 여지 없음)
        const endCand = endSnapAt(fr, cand.at, pts[pts.length - 1]);
        if (endCand) applySnapToEnd(s, endCand, fr.fromV(endCand.at));
        placeLive(s, fr, cand.at, endCand);
      } else {
        // **미승격 2D 획도 계속 후보다**(4차 지시 1-b) — 3D 대상에 못 붙으면 화면 좌표로
        // 다른 대기 획에 잇는다. 3D가 이긴다(붙으면 그 획의 3D가 확정되므로 정보가 더 많다).
        // 여기서 옮기는 것은 `pts2d`뿐이고 획은 2D로 대기한다 — 나중에 승격 연쇄가 붙인다.
        const c2 = snap2At(s.pts2d[0], s.id);
        if (c2) s.pts2d = [c2.at, ...s.pts2d.slice(1)];
        const rep2 = representative(s.pts2d);
        const e2c = (rep2 && rep2.bend <= AXIS_TOL.bend_max)
          ? snap2At(s.pts2d[s.pts2d.length - 1], s.id) : null;
        if (e2c) s.pts2d = [s.pts2d[0], e2c.at];
        if (segs0.length) {
          lastSnapNote = "시작점이 아무 대상에도 안 붙었습니다 — **2D로 대기**합니다";
          // **조리개 밖 겨냥도 기록한다**(지시 K, 리뷰어 [7]) — 스냅된 사건만 적으면 분포가
          // 조리개에서 절단돼 "반경을 넓혀야 하는가"를 영영 못 답한다. 40px(UI 상한) 프로브.
          // ⚠ 프로브에서 **on_face를 뺀다**(재검 [7]) — 지면 스냅의 화면 거리는 정의상 0이라
          // 앞을 막으면 "스냅 실패"가 안 생겨 프로브가 영영 발화하지 않는다(#3·#5)
          const probe = snapCandidates(pts[0], segs0, sc!, { radius_ratio: 40 / Math.hypot(...cssSize()) },
                                       snapStatic(segs0))
            .find(c => OSNAP.kinds[c.kind] && c.kind !== "on_face");
          s.snapDistPx = probe ? probe.dist : null;
        } else if (c2 || e2c) {
          lastSnapNote = "2D 대기 획에 붙었습니다 — **2D로 대기**합니다";
        }
      }
      // **② 못 놓인 것은 일괄 풀이로** — 서로 이어진 2D 획들끼리 풀린다.
      // ⚠ **확정 뷰에서만 돈다** — `liftAll`은 소실점을 쓰고 그 소실점은 확정 카메라의 것이다.
      // 돌린 시점의 2D 획을 그 솔버에 넣으면 **다른 화면 좌표를 같은 카메라로 푸는 것**이다
      if (!s.seg3d && fr.pinned) solveInto(fr.ctx, pending(doc, confirmView().id));
      // **③ 승격 연쇄**(§9.1, L-B.7)
      if (s.seg3d) promoteChain(fr);
      syncScene();
    }
    hoverSnap = null; hover2d = null; live = null;
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
  undoStack.length = 0; orderMarks.length = 0; promoteReport = null;
  picked = null; ask = null;
  syncScene();
  note = "";   // ⛔ 복원 요약을 뺐다(지시 3) — 열린 그림 자체가 보인다
  refresh();
}

function renderBar() {
  // **4차 지시 6 — 성격별 재배치**: 도구·채널(왼쪽) · 표시·스냅 토글(접이식) ·
  // 카메라(마우스 전용 — 아이패드는 손가락이 한다, 6-b) · 파일(오른쪽) · 편집.
  // ⚠ 버튼의 `data-act`·처리기는 그대로다(#17 — 바뀌는 것은 배치뿐). 접힌 버튼도 DOM에는
  // 남는다(#32 — 다만 display:none이라 클릭은 펼친 뒤에만 된다. e2e가 누르는 여섯 버튼
  // (draw·edit·orbit·home·undo·clear)은 전부 접이식 밖이다 — 착수 표에서 확인).
  const btn = (id: string, label: string, on = false, dis = false, cls = "") =>
    `<button data-act="${id}"${on || cls ? ` class="${[on ? "on" : "", cls].filter(Boolean).join(" ")}"` : ""}`
    + `${dis ? " disabled" : ""}>${label}</button>`;
  const fold = BAR_MENU.open ? "" : "folded";
  barEl.innerHTML = [
    // ---- 도구(왼쪽) — **현재 도구가 .on으로 보인다**(6-c)
    '<span class="grp">도구</span>',
    btn("draw", "선 그리기", tool === "draw"),
    btn("edit", "선택", tool === "edit", !doc.strokes.length),
    btn("erase_seg", "지우개(조각)", tool === "erase_seg", !doc.strokes.length),
    btn("erase_part", "지우개(부분)", tool === "erase_part", !lifted(doc).length),
    '<span class="sep"></span>',
    // ---- 채널 — **현재 채널이 .on + 왼쪽 색띠로 보인다**(D-5·6-c)
    '<span class="grp">채널</span>',
    ...(["guide", "result", "note"] as Channel[]).map(k =>
      `<button data-act="ch_${k}"${channel === k ? ' class="on"' : ""}`
      + ` style="border-left:4px solid ${CHANNEL_UI[k].color}"`
      + ` title="${k === "guide" ? "작도의 본체 — 3D로 올라가고 돌리면 흐려집니다"
                 : k === "result" ? "보조선 위를 덧그어 확정합니다 — 내보내기에 포함됩니다"
                 : "해칭·지시선·메모 — 3D로 안 올라가고 그린 뷰에서만 보입니다"}"`
      + `>${CHANNEL_UI[k].name}</button>`),
    '<span class="sep"></span>',
    // ---- 편집
    btn("undo", "실행취소", false, !undoStack.length),
    ...orderMarks.filter(m => m.order !== cam.order())
                 .map(m => btn(`revert${m.order}`, `${m.order}점으로 되돌리기`)),
    '<span class="sep"></span>',
    // ---- 표시·스냅 토글 — **접이식**(6-a). 기본 접힘
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
    // ---- 카메라 — **마우스 전용**(6-b). 손가락 장치에서는 CSS가 숨긴다(l.html의 pointer: coarse)
    '<span class="sep mouse-only"></span>',
    `<button data-act="orbit" class="mouse-only${tool === "orbit" ? " on" : ""}"${!cam.standing() ? " disabled" : ""}`
    + ` title="마우스 전용입니다 — 손가락 1개는 궤도, 2개는 팬·줌이라 버튼이 필요 없습니다">궤도(마우스)</button>`,
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
 * **묻는다**(사람 지시 1: "애매하면 사용자에게 묻는다. 추정하지 않는다").
 *
 * 두 가지만 묻는다:
 *   ① 화면 가로세로인가 깊이인가 — 임계 사이(`screen_axis_deg` ~ `depth_min_deg`)일 때
 *   ② 두 번째 수평축인가 수직축인가 — 선이 가팔라 갈리지 않을 때(3점 구도에서만 난다)
 *
 * ⚠ **답할 때까지 규칙은 안 움직인다.** 그 획은 2D로 대기하고 화면에 보라 점선으로 뜬다.
 */
function renderAsk(): string {
  if (!ask) return "";
  const angles = `<span class="dim">수평과 ${ask.toH.toFixed(1)}° · 수직과 ${ask.toV.toFixed(1)}°`
               + ` (화면 축은 ${RULE_TOL.screen_axis_deg}° 이내 · 깊이는 ${RULE_TOL.depth_min_deg}° 밖)</span>`;
  const rows: string[] = [];
  if (ask.question === "screen_or_depth") {
    rows.push('<div class="hdr"><b>이 선은 무엇입니까?</b>'
      + ' <span class="dim">— 임계 사이라 갈리지 않습니다</span></div>');
    rows.push(`<div>${angles}</div>`);
    rows.push('<div><button data-act="ask_screen">화면 가로세로 축</button>'
      + ' <button data-act="ask_depth">깊이선</button>'
      + ' <button data-act="ask_skip">모르겠다(2D로 둔다)</button></div>');
  } else {
    rows.push('<div class="hdr"><b>이 선은 두 번째 수평축입니까, 수직축입니까?</b></div>');
    rows.push(`<div>${angles}</div>`);
    rows.push('<div class="dim">수직축이면 소실점을 그리지 않습니다 —'
      + ' 수직축이면 그 선(들)에서 수직 소실점을 읽습니다 — 그것이 3점의 유일한 입구입니다</div>');
    rows.push('<div><button data-act="ask_depth">두 번째 수평축</button>'
      + ' <button data-act="ask_vertical">수직축</button>'
      + ' <button data-act="ask_skip">모르겠다(2D로 둔다)</button></div>');
  }
  return `<div class="promote">${rows.join("")}</div>`;
}

/**
 * **승격 요약**(L-C.2, §6.2). 승격은 **품질을 올리고 배치를 줄인다**(L-C.1: 형태 오차 중앙
 * 0.1259 → 0.0913 · 배치 −168, `order_promote.json@509615a1`). 어느 쪽을 택할지는
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
  // ⛔ **상태 패널을 비웠다**(2026-08-17 지시 3). 옛 판이 내던 것 — 차수·후보·소실점 수·
  // f와 출처·다음에 그을 것·슬롯 상태·스냅 반경·그리는 중 판정 — 은 전부 시스템 사정이고,
  // 알리면 "2D를 내보낸다 / 3D로 전환된다"는 인상을 준다. 사용자는 계속 종이에 그린 것이다.
  //
  // 남는 것 셋:
  //   ① **물음**(`renderAsk`) — 사용자가 답해야 진행되는 것(A-3: 추정하지 않는다)
  //   ② **차수 승격 알림**(`renderPromoteReport`) — 형태가 실제로 움직인다(지시 3-d 예외)
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
  statusEl.innerHTML = md(renderAsk() + renderPromoteReport() + rows.join(""));
}

// ---------------------------------------------------------------- 배선

barEl.addEventListener("click", (e) => {
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
  else if (act === "home") {
    const ctx = cam.ctx();
    if (ctx) { stage.pinTo(ctx.principal, ctx.f); tool = "draw";
               note = ""; }
  } else if (act === "undo") {
    // **문서만 되돌리면 안 된다**(L-C.2) — 승격을 되돌릴 때 소실점이 새 것으로 남으면
    // §6.1이 금지한 **좌표계가 섞인 상태**가 된다. `restoreSnap`이 둘을 함께 되돌린다
    const sn = undoStack.pop();
    if (sn) { restoreSnap(sn); note = ""; }
  } else if (act === "relink") relinkLostSnaps();
  else if (act.startsWith("revert")) revertToOrder(Number(act.slice(6)));
  else if (act === "obj" || act === "gltf" || act === "json") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const nameOf = (id: string) => doc.views.find(v => v.id === id)?.name ?? id;
    if (act === "json") {
      // **자체 형식** — 뷰 목록과 **2D 레이어까지** 담는 유일한 경로다(OBJ·glTF는 3D만 낸다).
      // 확장자는 `.brnl`(Brunelleschi)이고 **내용은 JSON 그대로다** — 텍스트 편집기로 열리고
      // `git diff`가 되고 디버깅이 쉽다(사람 지시). MIME도 `application/json`으로 둔다.
      download(JSON.stringify(buildDoc2(), null, 2), `brunelleschi-${stamp}.brnl`,
               "application/json");
      note = `.brnl — 뷰 ${doc.views.length} · 획 ${doc.strokes.length} <span class="dim">(내용은 JSON이다)</span>`;
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
  else if (act === "clear") {
    pushUndo();
    doc = newDoc(); cam.reset();
    syncScene(); note = ""; ask = null;
    orderMarks.length = 0; promoteReport = null;
    // **저장본도 지운다** — 안 지우면 새로고침에서 방금 버린 작업이 되살아난다
    void deleteDoc2().catch(() => { /* 저장소가 없어도 화면은 비워졌다 */ });
  }
  refresh();
});

// **승격 요약 패널 안의 버튼**(L-C.2). 도구 막대와 같은 규약(`data-act`)을 쓴다 —
// 규약이 둘이 되면 다음 버튼을 어디에 다는지가 매번 판단거리가 된다
statusEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  const act = (b as HTMLButtonElement).dataset.act;
  if (act === "relink") relinkLostSnaps();
  else if (act === "ask_screen") answerAsk("screen");
  else if (act === "ask_depth") answerAsk("depth");
  else if (act === "ask_vertical") answerAsk("vertical");
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
saver = autosaver2(buildDoc2, 600, (ok) => {
  saveNote = ok ? `저장됨 ${new Date().toLocaleTimeString()}` : "저장 실패(브라우저 저장소)";
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
    const sc = snapCtx(); const g = snapSegs();
    return sc ? appSnapAt(p, g, sc, snapStatic(g)) : null;
  },
  snapTargets: () => snapSegs().length,
  hoverSnap: () => hoverSnap,
  /** **끝점 스냅**(오스냅, D-L46) — 종단 확인이 앱 경로 그대로 부른다(#17). */
  endSnap: (from: Vec3, p: Pt2) => { const fr = frame(); return fr ? endSnapAt(fr, from, p) : null; },
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
                                     isConfirm: v.pose === null,
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
  /** 승격 재풀이의 하네스 입구 — 규칙을 직접 넣은 뒤 부른다(앱에서는 전이가 자동으로 부른다).
   * 여기서는 `pushUndo`를 직접 쌓는다 — 앱 경로에서는 승격을 일으킨 획의 스냅샷이 그 역할이다. */
  promoteOrderNow: (before?: number) => { pushUndo(); autoPromoteOrder(before ?? cam.order()); },
  /** 확정(들어올리기)의 하네스 입구 — 규칙을 직접 넣으므로 획을 안 긋는다(#17). 앱에서는 자동이다. */
  confirmNow: () => standCamera(),
  // L-C.2 — 되돌리기 UI(§6.2). **앱 경로 그대로**를 종단 확인이 부른다(#17)
  promoteReport: () => promoteReport && {
    before: promoteReport.before, after: promoteReport.after,
    dropped: promoteReport.diff.dropped, gained: promoteReport.diff.gained,
    snapLost: promoteReport.snapLost,
    reanchored: promoteReport.reanchored, had: promoteReport.had,
    relinked: promoteReport.relinked,
  },
  orderMarks: () => orderMarks.map(m => m.order),
  /** L-D.3 — **연쇄 회차별** (대기 수 · 놓인 수). 합계만으로는 "여러 회"가 안 보인다 */
  chainTrace: () => chainTrace.map(x => ({ ...x })),
  // L-D.1 — 고치기(§9.5). **앱 경로 그대로**를 종단 확인이 부른다(#17)
  pick: (p: Pt2) => { picked = pickStroke(p); refresh(); return picked; },
  picked: () => picked,
  deletePicked, assignAxis,
  revertToOrder,
  relinkLostSnaps,
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
  feedLine: (a: Pt2, b: Pt2, forced?: "screen" | "depth" | "vertical") => {
    const r = feedCamera({ a, b }, forced);
    refresh();
    return r.event;
  },
  classifyLine: (a: Pt2, b: Pt2) => classifyLine(a, b),
  ask: () => ask && { strokeId: ask.strokeId, question: ask.question, toH: ask.toH, toV: ask.toV },
  answerAsk: (choice: "screen" | "depth" | "vertical") => { answerAsk(choice); },
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
