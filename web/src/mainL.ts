// L-B — 단일 뷰포트 UI 엔트리. 계획서 §10.
//
// **옛 `main.ts`를 고치지 않고 새로 짠다**(§10.1) — 좌우 분할·프레임 탭·"여기서 그리기" 토글·
// 점 찍기·고치기·치수 패널이 전부 폐기 대상이라 남는 것이 거의 없었다.
// `canvasFrame`·잉크 캡처·three 씬·`lift.ts`·`vpDetect.ts`·카메라 수학은 그대로 쓴다(§10.2).
//
// **옛 UI는 L-B 게이트 통과 전까지 지우지 않는다**(A-4). `index.html`이 그것이고 여기는 `l.html`이다.
import { InkCanvas } from "./capture/inkCanvas.js";
import { cssSizeOf } from "./capture/canvasFrame.js";
import { Stage, type StageSeg } from "./ui/stage.js";
import { CamState } from "./ui/camState.js";
import { newDoc, newSStroke, lifted, pending, pendingElsewhere, snapshotDoc,
         type DocState, type SStroke } from "./ui/doc.js";
import { draftFromDetection, handleAt, moveHandle, guideLineAt, moveGuideBy,
         extendGuide, DRAFT_TOL, type HandleRef } from "./s3d/vpDraft.js";
import { SENS_TOL, type AxisSens } from "./s3d/vpSensitivity.js";
import { HOMOG_TOL } from "./s3d/vpHomog.js";
import { liftAll, type LiftStroke } from "./s3d/lift.js";
import { snapAt, SNAP_TOL, SNAP_LABEL, SNAP_COLOR,
         type SnapCand, type SnapSeg, type SnapCtx } from "./s3d/snap.js";
import { segmentFromAnchor, nearestAxisOnScreen, LIVE_TOL } from "./s3d/liveLine.js";
import { classifyStroke } from "./s3d/axis.js";
import { AXIS_COLOR, guides as gridGuides, HORIZON_COLOR, GROUND_COLOR } from "./s3d/grid.js";
import { project, axisDirection, groundFrame, type Vec3 } from "./s3d/geom3d.js";
import type { Pt2 } from "./s3d/camera.js";
import type { PlaceCtx } from "./s3d/stroke.js";

type Tool = "draw" | "adjust" | "orbit";

const host = document.getElementById("stage")!;
const canvas = document.getElementById("ink") as HTMLCanvasElement;
const barEl = document.getElementById("bar")!;
const statusEl = document.getElementById("status")!;

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
const refreshSens = () => { sens = cam.guides.length ? cam.sensitivity() : []; };
const undoStack: DocState[] = [];
const UNDO_MAX = 200;

const cssSize = (): [number, number] => cssSizeOf(canvas);

function pushUndo() {
  undoStack.push(snapshotDoc(doc));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

// ---------------------------------------------------------------- 스냅 (§3)

/** 스냅 대상 = **3D 레이어 그대로**. 2D 대기 획은 아직 공간에 없으므로 대상이 아니다(§9.1). */
const snapSegs = (): SnapSeg[] =>
  lifted(doc).map(s => ({ id: s.id, a: s.seg3d![0], b: s.seg3d![1] }));

/**
 * 스냅이 도는 조건: **카메라가 확정됐고 확정 시점에 있을 때**.
 * 궤도로 돌린 뒤에는 `stage`의 자유 카메라와 `cam.ctx()`가 달라 화면 좌표의 뜻이 다르다 —
 * 그 경로는 L-B.8(궤도 후 계속 그리기)에서 연다. **없는 스냅을 지어내지 않는다**(A-3).
 */
function snapCtx(): SnapCtx | null {
  const c = cam.ctx();
  if (!c || !cam.locked || !stage.isPinned) return null;
  return { principal: c.principal, f: c.f, imgSize: c.imgSize,
           // 면 생성이 범위 밖이라 지금 있는 면은 지면 하나다(§3 "면 위 점")
           ground: groundFrame(c.vps[2] ?? null, c.principal, c.f),
           from: null };
}

/**
 * **화면에서 시작점을 대상의 상으로 옮기는 것이 곧 3D 확정이다.**
 *
 * 올라간 기하는 되쏘면 정확히 그 화면 점으로 돌아오므로(`lift.ts`의 `segGap = 0` 보장)
 * "3D 대상에 붙인다"와 "그 대상의 상으로 화면 점을 옮긴다"가 **같은 연산**이다.
 * 그래서 솔버를 바꾸지 않고 `pts2d[0]`만 옮기면 된다 — 새로 설계한 것이 없다(A-3).
 */
function applySnapToStart(st: SStroke, cand: SnapCand): void {
  st.snapStart = { kind: cand.kind, at: cand.at, ofId: cand.ofId };
  st.pts2d = [[cand.screen[0], cand.screen[1]], ...st.pts2d.slice(1)];
}

/**
 * 스냅된 시작점 + 축 → 그 자리에서 3D 확정(§3 마지막 문단 · §7).
 * 축이 안 정해지면 `false`이고 그 획은 2D로 **대기**한다(§9.1).
 */
function placeLive(st: SStroke, c: PlaceCtx, at: Vec3): boolean {
  const dirs = c.vps.map(v => (v ? axisDirection(v, c.principal, c.f) : null));
  const a2 = st.pts2d[0], b2 = st.pts2d[st.pts2d.length - 1];
  const near = nearestAxisOnScreen(at, dirs, a2, b2, c);
  if (!near || near.deg > LIVE_TOL.axis_deg) {
    lastSnapNote = near
      ? `축과 ${near.deg.toFixed(1)}° 벌어져 **2D로 대기**합니다(${LIVE_TOL.axis_deg}° 이내여야 합니다)`
      : "축 후보가 없어 **2D로 대기**합니다";
    return false;
  }
  const seg = segmentFromAnchor(at, dirs[near.axis], b2, c);
  if (!seg) { lastSnapNote = "끝점이 정해지지 않아 **2D로 대기**합니다"; return false; }
  st.axis = near.axis;
  st.seg3d = seg;
  lastSnapNote = `축${near.axis + 1}로 확정 (축과 ${near.deg.toFixed(1)}°)`;
  return true;
}

// ---------------------------------------------------------------- 3D 레이어

/** 문서의 3D 레이어를 씬에 반영한다. **여기가 유일한 경로다.** */
function syncScene() {
  const segs: StageSeg[] = lifted(doc).map(s => ({
    id: s.id, a: s.seg3d![0], b: s.seg3d![1], axis: s.axis,
  }));
  stage.setSegments(segs);
}

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
  stage.pinTo(ctx.principal, ctx.f);
  syncScene();
  note = `확정 — ${n}/${targets.length}획이 3D로 올라갔습니다`
       + (n < targets.length ? `. 나머지 ${targets.length - n}획은 **2D로 대기**합니다(연결되면 올라갑니다)` : "");
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
    ctx2.globalAlpha = (on ? 0.85 : 0.3) * (st?.infinite ? 0.5 : 1);
    ctx2.setLineDash(st?.infinite ? [2, 3] : [5, 4]);
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
 * 확정 카메라를 벗어난 자유 시점에서는 **그리지 않는다** — `pts2d`가 확정 뷰의 화면 좌표라서
 * 다른 자세에서는 뜻이 없다(§9.2가 말하는 "다른 뷰에서는 숨는다"의 첫 사례).
 */
function drawPending(ctx2: CanvasRenderingContext2D) {
  if (cam.locked && !stage.isPinned) return;
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

function drawBelowInk(ctx2: CanvasRenderingContext2D) {
  // **확정 뷰를 벗어나면 2D 층 전체가 뜻을 잃는다** — 그리드도 가이드도 소실점 표식도
  // 확정 뷰의 화면 좌표다. 자유 시점에서 그리면 화면에 붙어 따라다니는 유령이 된다.
  if (cam.locked && !stage.isPinned) return;
  drawGrid(ctx2);
  drawPending(ctx2);
  drawPreview(ctx2);
  drawGuideHandles(ctx2);
  drawSnapMark(ctx2);
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
    const sc = p ? snapCtx() : null;
    const next = (sc && tool === "draw") ? snapAt(p!, snapSegs(), sc) : null;
    // 값이 안 바뀌면 다시 그리지 않는다 — 포인터마다 전체 재그리기가 돌면 안 된다
    const same = (!next && !hoverSnap)
      || (!!next && !!hoverSnap && next.kind === hoverSnap.kind
          && Math.abs(next.screen[0] - hoverSnap.screen[0]) < 0.5
          && Math.abs(next.screen[1] - hoverSnap.screen[1]) < 0.5);
    hoverSnap = next;
    if (!same) refresh();
  },
  onStrokeEnd: (stroke) => {
    const pts = stroke.points.map(p => [p[0], p[1]] as Pt2);
    ink.clear();                         // 잉크 버퍼는 문서가 아니다 — 우리가 그린다
    if (pts.length < 2 || tool !== "draw") { refresh(); return; }
    pushUndo();
    const s = newSStroke(pts, doc.currentView);
    doc.strokes.push(s);
    // 확정 뒤에는 그 자리에서 푼다 — **승격 연쇄**의 첫 형태다(§9.1). L-B.7에서 넓힌다.
    const ctx = cam.ctx();
    if (cam.locked && ctx && stage.isPinned) {
      // **① 시작점 스냅**(§3). 붙으면 그 획의 3D가 확정된다.
      const sc = snapCtx();
      const cand = sc ? snapAt(pts[0], snapSegs(), sc) : null;
      lastSnapNote = "";
      if (cand) {
        applySnapToStart(s, cand);
        placeLive(s, ctx, cand.at);
      } else if (snapSegs().length) {
        lastSnapNote = "시작점이 아무 대상에도 안 붙었습니다 — **2D로 대기**합니다";
      }
      // **② 못 놓인 것은 일괄 풀이로** — 서로 이어진 2D 획들끼리 풀린다(L-B.7에서 넓힌다)
      if (!s.seg3d) solveInto(ctx, pending(doc, doc.views[0].id));
      syncScene();
    }
    hoverSnap = null;
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
    '<span class="sep"></span>',
    btn("undo", "실행취소", false, !undoStack.length),
    btn("clear", "비우기"),
  ].join("");
}

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
      return `<span style="color:${AXIS_COLOR[x.axis]}">■</span>`
        + `<b${tight ? ' style="color:#c0392b"' : ""}>${x.budgetPx!.toFixed(1)}px</b>`
        + `<span class="dim">(${x.degPerPx!.toFixed(2)}°/px · 선 ${Math.round(x.shortestGuidePx ?? 0)}px)</span>`;
    }).join(" · ");
    rows.push(`<div>핸들 예산 ${cells}</div>`);
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
    if (lastSnapNote) rows.push(`<div class="dim">마지막 획 — ${lastSnapNote}</div>`);
  }
  for (const w of r.warnings) rows.push(`<div class="${w.level}">${w.text}</div>`);
  if (note) rows.push(`<div class="note">${note}</div>`);
  statusEl.innerHTML = rows.join("");
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
      note = "궤도 — 확정 뷰의 2D 대기 획은 숨깁니다(그 뷰의 화면 좌표이기 때문입니다)";
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
  else if (act === "home") {
    const ctx = cam.ctx();
    if (ctx) { stage.pinTo(ctx.principal, ctx.f); tool = "draw"; canvas.style.pointerEvents = "auto";
               note = "확정 시점 — 3D가 잉크와 같은 자리에 그려집니다"; }
  } else if (act === "undo") {
    const sn = undoStack.pop();
    if (sn) { doc = sn; syncScene(); note = ""; }
  } else if (act === "clear") {
    pushUndo();
    doc = newDoc(); cam.guides = []; cam.apply(); cam.locked = false;
    cam.acc.reset(); syncScene(); sens = []; note = "";
  }
  refresh();
});

window.addEventListener("resize", () => refresh());
// 숨은 탭에서 열리면 관찰자가 발화하지 않는다(PITFALLS #22) — 보이게 되는 순간 다시 본다
document.addEventListener("visibilitychange", () => refresh());

fit();
refresh();

// 브라우저 콘솔 진단용. 측정 하네스와 같은 픽스처를 쓰려면 여기서 문서를 꺼낸다.
(window as unknown as Record<string, unknown>).S2S = {
  doc: () => doc, cam, stage, refresh, SIZE_HEAL,
  // L-B.3 — 종단 확인이 스냅을 앱 경로 그대로 부른다(PITFALLS #17)
  snap: (p: Pt2) => { const sc = snapCtx(); return sc ? snapAt(p, snapSegs(), sc) : null; },
  snapTargets: () => snapSegs().length,
  hoverSnap: () => hoverSnap,
};
