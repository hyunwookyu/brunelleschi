// 엔트리 — 계획서 §3(카메라 확정) + §4(획 → 3D).
//
// 잉크 캔버스 하나에 **가이드 → 확정 제스처 → 사용자 획** 순으로 겹쳐 그리고,
// 확정된 획은 오른쪽 3D 뷰포트에 쌓인다. 계산은 전부 `s3d/`에 있고 여기는 DOM 배선만 한다.
import { InkCanvas } from "./capture/inkCanvas.js";
import { Viewport } from "./s3d/viewport.js";
import { StrokeView } from "./s3d/strokeView.js";
import { CameraPanel, type Tool } from "./ui/cameraPanel.js";
import { PRESETS } from "./s3d/constraints.js";
import { AXIS_COLOR } from "./s3d/grid.js";
import { classifyStroke, AXIS_TOL, type Axis } from "./s3d/axis.js";
import { newStroke, settle, reprojectAll, PLACE_TOL, anchorCandidates, placeByUser,
         placeAtDepth, depthRange, diagOf,
         type Stroke, type PlaceCtx, type PlaceOpts } from "./s3d/stroke.js";
import { FIRST_VIEW_OPTS, VIEW_OPTS } from "./s3d/appPlace.js";
import { buildSession, downloadSession } from "./ui/sessionExport.js";
import { viewPlaceCtx, toView, fromView, projectInView } from "./s3d/viewCamera.js";
import { axisDirection, project, type Vec3 } from "./s3d/geom3d.js";
import type { AxisVerdict } from "./s3d/axis.js";
import type { Pt2 } from "./s3d/camera.js";

/** 실획 수집용 원본 6튜플과 판정 결과. `Stroke`는 [x,y]만 들고 있으므로 여기 따로 남긴다.
 *  **S-4의 속도 기반 굵기도 이것을 쓴다** — 자료구조를 늘리지 않기 위해서다(A-3). */
const rawPoints = new Map<string, number[][]>();
const verdicts = new Map<string, AxisVerdict>();
/**
 * **돌린 시점에서 그린 획의 id.** 그 획의 `pts2d`는 **뷰 캔버스 좌표**라서 왼쪽 캔버스에
 * 그대로 그리면 엉뚱한 자리에 나온다(S-6에서 발견). 배치된 획은 `pts3d`를 첫 카메라로
 * 투영해 그리고, 미배치 view 획은 왼쪽에 그리지 않는다 — 그린 시점에서만 의미가 있다.
 * `Stroke`를 늘리지 않으려고 여기 둔다(`rawPoints`와 같은 방식).
 */
const viewOrigin = new Set<string>();
/**
 * **돌린 시점에서 그린 획의 카메라 자세**(S-7). 그 획의 `pts2d`는 **그 시점의 뷰 캔버스
 * 좌표**이므로, 시점이 달라지면 같은 자리에 그릴 수 없다(D-S15 a). 자세를 함께 들고 있다가
 * **같은 시점일 때만 겹쳐 그리고**, 다르면 "그 시점으로" 버튼을 준다.
 * `Stroke`를 늘리지 않는다 — `rawPoints`·`viewOrigin`과 같은 방식이다.
 */
const viewCam = new Map<string, { pose: ReturnType<Viewport["pose"]>;
                                  pos: [number, number, number]; tgt: [number, number, number] }>();

const canvas = document.getElementById("ink") as HTMLCanvasElement;
const statusEl = document.getElementById("status")!;
const msgEl = document.getElementById("msg")!;
const lensEl = document.getElementById("lens") as HTMLInputElement;
const lensVal = document.getElementById("lensval")!;
const strokeEl = document.getElementById("strokes")!;
const pickEl = document.getElementById("axispick")!;
const fixEl = document.getElementById("fix")!;

// ---------------------------------------------------------------- S-7 미배치 고치기 (D-S15 b~d)

/**
 * **놓지 않되 버리지 않는다**(D-S15)의 구현. 자동 경로가 놓지 못한 획과 **일관되게 틀리게
 * 놓인 획**(S-6 1의 잔여 한계)을 사용자가 직접 붙인다.
 *
 * 상태는 앱에만 둔다 — `Stroke`를 늘리지 않는다(`rawPoints`·`viewOrigin`과 같은 방식).
 * `provisional`은 **깊이 근거가 앵커 하나뿐인 배치**다(사용자가 깊이를 직접 준 것 포함).
 */
let selId: string | null = null;
const picks: { a?: Vec3; b?: Vec3 } = {};
const provisional = new Set<string>();
/** 지금 보이는 후보 점(화면 좌표) — 클릭 판정과 그리기가 같은 목록을 쓴다. */
let candDots: { at: Pt2; pos: Vec3; end: 0 | 1 }[] = [];
/**
 * **돌린 시점의 후보 점**(S-7 4). 좌표계가 다르므로 목록을 따로 둔다 —
 * `at`은 3D 캔버스 좌표이고 `pos`는 **그 시점의 뷰 좌표**다(세계 좌표가 아니다).
 * D-S19가 돌린 시점의 자동 평면 경로를 막았으므로 **거기서 그은 사선은 이 경로가 유일하다**.
 */
let candDots3d: { at: Pt2; pos: Vec3; end: 0 | 1 }[] = [];
/**
 * 3D 뷰의 모드 셋. `fix`가 S-7 (4) — 돌린 시점에서 못 놓은 획을 붙인다.
 * **여기서 선언한다** — 3D 잉크 캔버스의 배경 콜백이 이것을 읽는데, 그 캔버스는 아래에서
 * 만들어지고 **만들면서 한 번 그린다**. 선언이 그보다 뒤면 TDZ로 터진다(브라우저 확인에서 걸렸다).
 */
type ViewMode = "orbit" | "draw" | "fix";
let viewMode: ViewMode = "orbit";

const selected = () => drawn.find(s => s.id === selId) ?? null;

// ---------------------------------------------------------------- S-7 실행 취소

/**
 * **스냅샷 방식**(S-7). 되돌릴 것이 `drawn` 하나가 아니라 **앱이 들고 있는 곁가지 상태
 * 전부**이기 때문이다 — 어느 시점에서 그렸는지(`viewOrigin`), 깊이가 미확정인지
 * (`provisional`), 그리고 배치 결과(`pts3d`)가 모두 함께 움직인다.
 * 명령 단위로 되돌리려면 그 다섯을 각각 역연산해야 하고, 그것은 새 배치 경로가 생길 때마다
 * 깨진다. **스냅샷은 경로가 늘어도 안 깨진다**(A-3: 가장 단순한 것).
 *
 * `pts2d`는 **복사하지 않는다** — 그린 뒤로 절대 안 바뀌는 원본이다(§5).
 * `rawPoints`·`verdicts`·`viewCam`도 안 되돌린다: id로 색인되고 id는 재사용되지 않으므로
 * 남아 있어도 무해하다.
 */
interface Snap { strokes: Stroke[]; viewOrigin: string[]; provisional: string[]; sel: string | null; }
const undoStack: Snap[] = [];
const redoStack: Snap[] = [];
const UNDO_MAX = 200;

const snapshot = (): Snap => ({
  strokes: drawn.map(s => ({ ...s, pts3d: s.pts3d.slice() })),
  viewOrigin: [...viewOrigin], provisional: [...provisional], sel: selId,
});

/** **바꾸기 직전에** 부른다. 새 동작이 생기면 다시 할 것(redo)은 버린다. */
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
}

function restore(sn: Snap) {
  drawn.length = 0;
  drawn.push(...sn.strokes);
  viewOrigin.clear(); sn.viewOrigin.forEach(x => viewOrigin.add(x));
  provisional.clear(); sn.provisional.forEach(x => provisional.add(x));
  selId = sn.sel && drawn.some(s => s.id === sn.sel) ? sn.sel : null;
  delete picks.a; delete picks.b;
  refreshCandidates(); refreshCandidates3d();
  strokeView.sync(drawn, placeCtx()?.f);
  refresh();
}

function undo() {
  const sn = undoStack.pop();
  if (!sn) { lastNote = "되돌릴 것이 없습니다"; refresh(); return; }
  redoStack.push(snapshot());
  restore(sn);
}
function redo() {
  const sn = redoStack.pop();
  if (!sn) { lastNote = "다시 실행할 것이 없습니다"; refresh(); return; }
  undoStack.push(snapshot());
  restore(sn);
}

/** 획 하나를 지운다. **자동 배치는 다시 안 돌린다** — 지운 것에 붙어 있던 획을 조용히
 *  옮기면 사용자가 예상하지 못한 변화가 된다(그 획은 `anchorRef`가 가리키는 대상을 잃지만
 *  이미 놓인 3D는 그대로다). 다시 붙이고 싶으면 `고치기`가 있다. */
function eraseAt(at: Pt2) {
  let best: { id: string; d: number } | null = null;
  for (const s of drawn) {
    const pts = screenPts(s);
    if (!pts) continue;
    for (let i = 1; i < pts.length; i++) {
      const d = segDist(at, pts[i - 1], pts[i]);
      if (!best || d < best.d) best = { id: s.id, d };
    }
  }
  if (!best || best.d > 18) { lastNote = "지울 획을 못 찾았습니다"; return; }
  pushUndo();
  const i = drawn.findIndex(s => s.id === best!.id);
  drawn.splice(i, 1);
  viewOrigin.delete(best.id); provisional.delete(best.id);
  if (selId === best.id) { selId = null; candDots = []; }
  strokeView.sync(drawn, placeCtx()?.f);
  lastNote = "지웠습니다.";
}

/** 선택된 획의 양 끝 앵커 후보를 **첫 카메라 화면 좌표로** 모은다. */
function refreshCandidates() {
  candDots = [];
  const ctx = placeCtx(), s = selected();
  if (!ctx || !s || viewOrigin.has(s.id)) return;      // view 획은 좌표계가 달라 여기 못 그린다
  const radius = PLACE_TOL.join_ratio * diagOf(ctx.imgSize) * 3;   // 고를 수 있게 넉넉히
  const others = drawn.filter(t => t.id !== s.id && t.pts3d.length);
  for (const end of [0, 1] as const) {
    const at = end === 0 ? s.pts2d[0] : s.pts2d[s.pts2d.length - 1];
    for (const c of anchorCandidates(others, at, radius)) {
      const p = project(c.pos, ctx.principal, ctx.f);
      if (p) candDots.push({ at: p, pos: c.pos, end });
    }
  }
}

/** 클릭 한 번 — 후보 점을 골랐으면 붙이고, 아니면 가장 가까운 획을 선택한다. */
function editClick(at: Pt2) {
  const ctx = placeCtx();
  if (!ctx) return;
  const hit = candDots.find(d => Math.hypot(d.at[0] - at[0], d.at[1] - at[1]) < 11);
  if (hit && selId) {
    picks[hit.end === 0 ? "a" : "b"] = hit.pos;
    applyPicks();
    return;
  }
  // 가장 가까운 획을 고른다 — **놓인 것도 고를 수 있다**(D-S15 d: 일관되게 틀린 배치를 되돌린다)
  let best: { id: string; d: number } | null = null;
  for (const s of drawn) {
    const pts = screenPts(s);
    if (!pts) continue;
    for (let i = 1; i < pts.length; i++) {
      const d = segDist(at, pts[i - 1], pts[i]);
      if (!best || d < best.d) best = { id: s.id, d };
    }
  }
  selId = best && best.d < 18 ? best.id : null;
  delete picks.a; delete picks.b;
  refreshCandidates(); refreshCandidates3d();
}

/**
 * **돌린 시점의 앵커 후보**(S-7 4). 기존 획을 그 시점 좌표로 옮기고 거기서 후보를 찾는다 —
 * `addStrokeFromView`가 배치할 때 하는 것과 같은 변환이다.
 * **그 시점일 때만** 뜻이 있다(선택된 획의 `pts2d`가 그 시점 좌표다).
 */
function refreshCandidates3d() {
  candDots3d = [];
  const s = selected();
  if (!s || !viewOrigin.has(s.id) || !sameView(s.id)) return;
  const axes = worldAxes();
  if (!axes.some(Boolean)) return;
  const pose = viewport.pose();
  const ctxV = viewPlaceCtx(pose, axes, viewport.viewSize(), viewport.camera.fov);
  const radius = PLACE_TOL.join_ratio * diagOf(ctxV.imgSize) * 3;
  const others: Stroke[] = [];
  for (const t of drawn) {
    if (t.id === s.id || !t.pts3d.length) continue;
    const p3 = t.pts3d.map(p => toView(pose, p));
    const p2 = t.pts3d.map(p => projectInView(pose, p, ctxV.principal, ctxV.f));
    if (p2.every(Boolean)) others.push({ ...t, pts3d: p3, pts2d: p2 as Pt2[] });
  }
  for (const end of [0, 1] as const) {
    const at = end === 0 ? s.pts2d[0] : s.pts2d[s.pts2d.length - 1];
    for (const c of anchorCandidates(others, at, radius)) {
      const p = projectInView({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], C: [0, 0, 0] },
                              c.pos, ctxV.principal, ctxV.f);
      if (p) candDots3d.push({ at: p, pos: c.pos, end });
    }
  }
}

/** 3D 캔버스에서의 고치기 클릭. 좌표계만 다르고 흐름은 `editClick`과 같다. */
function editClick3d(at: Pt2) {
  const s = selected();
  if (!s) return;
  const hit = candDots3d.find(d => Math.hypot(d.at[0] - at[0], d.at[1] - at[1]) < 11);
  if (!hit) return;
  picks[hit.end === 0 ? "a" : "b"] = hit.pos;
  applyPicksInView();
}

/**
 * 뷰 좌표에서 놓고 **세계 좌표로 되돌린다**. 배치 자체는 `placeByUser`가 하고
 * 여기서는 좌표계만 오간다 — `addStrokeFromView`와 같은 구조다.
 */
function applyPicksInView() {
  const s = selected();
  const axes = worldAxes();
  if (!s || !axes.some(Boolean)) return;
  const pose = viewport.pose();
  const ctxV = viewPlaceCtx(pose, axes, viewport.viewSize(), viewport.camera.fov);
  const r = placeByUser(s, ctxV, picks);
  if (!r) { lastNote = "그 앵커로는 놓이지 않습니다 — 다른 점을 골라 보세요"; refresh(); return; }
  pushUndo();
  s.pts3d = r.pts3d.map(p => fromView(pose, p));       // **세계 좌표로 되돌린다**
  s.joinShift = 0;
  if (r.provisional) provisional.add(s.id); else provisional.delete(s.id);
  markProvisional(s);
  lastNote = r.provisional
    ? "붙였습니다 — **깊이는 미확정**입니다(반대쪽 끝도 지정하면 확정됩니다)"
    : "붙였습니다.";
  strokeView.sync(drawn, placeCtx()?.f);
  refresh();
}

/** 고른 앵커로 놓는다. 검사하지 않는다 — **사용자가 판단했다**. */
function applyPicks() {
  const ctx = placeCtx(), s = selected();
  if (!ctx || !s) return;
  const r = placeByUser(s, ctx, picks);
  if (!r) { lastNote = "그 앵커로는 놓이지 않습니다 — 다른 점을 골라 보세요"; return; }
  pushUndo();
  s.pts3d = r.pts3d;
  s.joinShift = 0;
  if (r.provisional) provisional.add(s.id); else provisional.delete(s.id);
  markProvisional(s);
  lastNote = r.provisional
    ? "붙였습니다 — **깊이는 미확정**입니다(반대쪽 끝도 지정하면 확정됩니다)"
    : "붙였습니다.";
  strokeView.sync(drawn, ctx.f);
}

/** 미확정 배치는 **색으로 구분한다** — `Stroke.color`가 이미 있으므로 자료구조를 늘리지 않는다. */
function markProvisional(s: Stroke) {
  s.color = provisional.has(s.id) ? "#b9770e" : "#111";
}

/** 점과 선분의 거리. 획 선택에 쓴다. */
function segDist(p: Pt2, a: Pt2, b: Pt2): number {
  const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey;
  const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2));
  return Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]);
}

/** 획을 **첫 카메라 화면 좌표**로 낸다. 배치된 것은 3D에서 투영, 미배치는 `pts2d` 그대로. */
function screenPts(s: Stroke): Pt2[] | null {
  const cam = placeCtx();
  if (s.pts3d.length && cam) {
    const pj = s.pts3d.map(p => project(p, cam.principal, cam.f));
    return pj.every(Boolean) ? (pj as Pt2[]) : null;
  }
  return viewOrigin.has(s.id) ? null : s.pts2d;
}

const viewport = new Viewport(document.getElementById("view")!);
// 굵기는 **이미 앱에 있는 6튜플**을 조회해서 쓴다 — `Stroke`를 늘리지 않는다(A-3).
// 맵은 획 확정 시점에 채워지고 3D 렌더는 그 뒤에 돌므로 **조회 시점에 항상 있다**
// (구워 넣을 필요가 없다. 카메라 재조정으로 다시 그릴 때도 그대로 있다).
const strokeView = new StrokeView(viewport, (id) => rawPoints.get(id));

function cssSize(): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [Math.max(1, r.width), Math.max(1, r.height)];
}

const panel = new CameraPanel(cssSize(), () => { replace(); refresh(); });

/** 사용자가 그린 획 — **원본 점열 그대로** 보관한다(§5). 3D는 여기서 파생된다. */
const drawn: Stroke[] = [];

/** 지금 카메라로 배치 문맥을 만든다. 카메라가 아직이면 `null`(배치하지 않는다). */
function placeCtx(): PlaceCtx | null {
  const cam = panel.acc.solve().camera;
  if (!cam.ok || cam.f == null || !cam.principalPoint) return null;
  return { principal: cam.principalPoint, f: cam.f, vps: panel.vps(), imgSize: panel.imgSize };
}

/** 카메라가 움직이면 **전부 다시 만든다**(§5 "pts2d를 반드시 보존한다"). */
function replace() {
  const ctx = placeCtx();
  if (!ctx || !drawn.length) return;
  reprojectAll(drawn, ctx, FIRST_VIEW_OPTS);
  strokeView.sync(drawn, ctx.f);
}

function fit() {
  const [w, h] = cssSize();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
  panel.acc.resize([w, h]);                  // 화각·무한원 판정 기준이 창 크기에 달려 있다
  refresh();
}

const ink = new InkCanvas(canvas, {
  onBackground: (ctx) => drawBelowInk(ctx),
  onStrokeEnd: (stroke) => {
    const pts = stroke.points.map(p => [p[0], p[1]] as Pt2);
    if (pts.length < 2) return;
    if (panel.tool === "draw") addStroke(pts, stroke.points);
    else if (panel.tool === "edit") editClick(pts[0]);
    else if (panel.tool === "erase") eraseAt(pts[0]);
    else panel.handleStroke(pts[0], pts[pts.length - 1]);
    refresh();
  },
});
ink.setFrame("persp");

/** 획 하나 — **판정(§4.1) → 앵커 체인(§4.2) → 역투영**. 획은 쪼개지 않는다(§1). */
function addStroke(pts: Pt2[], raw?: number[][]) {
  pushUndo();
  const ctx = placeCtx();
  // **카메라를 함께 넘긴다**(S-2b a·b). 화각 60°(이론서 18.4)를 넘는 자리에서는 사람이 수렴을
  // 완화해 그리므로 허용 범위를 넓히고, 왜곡이 후보 전체를 밀어 올려도 **순위**로 판정한다.
  // (c) 획 간 일관성은 **꺼 둔다** — 구제 29건 중 8건이 틀렸다(D-S9).
  const v = ctx
    ? classifyStroke(pts, ctx.vps, ctx.imgSize, {}, { principal: ctx.principal, f: ctx.f })
    : { axis: "free" as Axis, note: "카메라가 아직 확정되지 않았습니다", rep: null };
  const s = newStroke(pts, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
  drawn.push(s);
  if (raw) rawPoints.set(s.id, raw);
  verdicts.set(s.id, v as AxisVerdict);
  if (ctx) settle(drawn, ctx, FIRST_VIEW_OPTS);
  strokeView.sync(drawn, ctx?.f);
  lastNote = v.note;
}
let lastNote = "";

// ---------------------------------------------------------------- S-5 돌린 시점에서 이어 그리기

/**
 * **세계 축 방향 셋.** 첫 카메라가 정한 것이고 **시점이 바뀌어도 변하지 않는다** —
 * 돌린 뒤에 다시 계산되는 것은 소실점뿐이다(§S-5). 소실점이 아직 없으면 그 축은 `null`.
 */
function worldAxes(): (Vec3 | null)[] {
  const ctx = placeCtx();
  if (!ctx) return [null, null, null];
  return ctx.vps.map(v => (v ? axisDirection(v, ctx.principal, ctx.f) : null));
}

/**
 * 돌린 시점에서 그린 획 하나. **소실점을 다시 찍지 않는다** — 뷰포트 자세가 곧 카메라다.
 *
 * 배치는 **새 시점의 좌표계에서** 한다(앵커를 화면에서 찾으므로 기존 획도 그 좌표계로 옮긴다).
 * 결과만 세계 좌표로 되돌린다 — `Stroke`가 드는 것은 언제나 세계 좌표다.
 */
function addStrokeFromView(pts: Pt2[], raw?: number[][]) {
  pushUndo();
  const axes = worldAxes();
  if (!axes.some(Boolean)) { lastNote = "카메라가 아직 확정되지 않았습니다"; return; }
  const pose = viewport.pose();
  const ctxV = viewPlaceCtx(pose, axes, viewport.viewSize(), viewport.camera.fov);
  const camNow = () => ({
    pose,       // **배치에 쓴 자세 그대로** — 화면 대조는 이것으로 한다
    pos: [viewport.camera.position.x, viewport.camera.position.y, viewport.camera.position.z] as [number, number, number],
    tgt: [viewport.controls.target.x, viewport.controls.target.y, viewport.controls.target.z] as [number, number, number],
  });

  const v = classifyStroke(pts, ctxV.vps, ctxV.imgSize, {},
                           { principal: ctxV.principal, f: ctxV.f });
  const s = newStroke(pts, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
  drawn.push(s);
  viewOrigin.add(s.id);
  viewCam.set(s.id, camNow());
  if (raw) rawPoints.set(s.id, raw);
  verdicts.set(s.id, v as AxisVerdict);
  lastNote = v.note;

  // 기존 획을 새 시점 좌표로 옮긴 사본에 붙인다. 원본은 건드리지 않는다.
  const inView = drawn.map((t, i) => {
    if (t.id === s.id) return t;
    if (!t.pts3d.length) return { ...t, pts3d: [] };
    const p3 = t.pts3d.map(p => toView(pose, p));
    const p2 = t.pts3d.map(p => projectInView(pose, p, ctxV.principal, ctxV.f));
    return p2.every(Boolean)
      ? { ...t, pts3d: p3, pts2d: p2 as Pt2[] }
      : { ...t, pts3d: [] };            // 새 시점에서 안 보이는 획은 앵커 후보가 아니다
  });
  // **앵커 검사 둘을 켠다**(S-6). 돌린 시점에서는 앞뒤 획이 화면에서 겹쳐(가림) 화면 거리만으로
  // 고르면 조용히 틀린 깊이에 놓인다. 획 자신의 축 제약으로 반대쪽 끝점을 검사하고(정합성),
  // 그걸 못 쓰는 자유단은 깊이 타당성으로 막는다. p90 0.87 → 0.05.
  settle(inView, ctxV, VIEW_OPTS);

  const placed = inView.find(t => t.id === s.id);
  if (placed?.pts3d.length) {
    s.pts3d = placed.pts3d.map(p => fromView(pose, p));   // **세계 좌표로 되돌린다**
    s.anchorRef = placed.anchorRef;
    s.joinShift = placed.joinShift;
    // 카메라를 잠근다 — 시점이 여럿이 되면 첫 카메라 재조정이 어느 시점의 `pts2d`인지
    // 알 수 없다(§3.7 소프트 락이 그 자리다). 자료구조를 늘리지 않기 위한 선택이다.
    if (!panel.locked) { panel.toggleLock(); lockBtn.textContent = "잠금 해제"; }
  }
  strokeView.sync(drawn, placeCtx()?.f);
}

// ---------------------------------------------------------------- 그리기

/** 잉크 아래 층: 투시 가이드 → 그린 획(축 색) → 소실점 표식. */
function drawBelowInk(ctx: CanvasRenderingContext2D) {
  const [w, h] = cssSize();
  panel.drawGuides(ctx);
  ctx.save();
  ctx.lineWidth = 2;
  const cam0 = placeCtx();
  for (const s of drawn) {
    const placed = s.pts3d.length > 0;
    // **어느 좌표계의 점을 그리는지 가린다.** 배치된 획은 3D에서 첫 카메라로 투영하고(시점과
    // 무관하게 맞다), 미배치 획은 그린 화면의 `pts2d`뿐이다 — 그것이 뷰 좌표면 여기 못 그린다.
    let pts: Pt2[] | null = null;
    if (placed && cam0) {
      const pj = s.pts3d.map(p => project(p, cam0.principal, cam0.f));
      pts = pj.every(Boolean) ? (pj as Pt2[]) : null;      // 첫 카메라 뒤로 간 획은 안 보인다
    } else if (!viewOrigin.has(s.id)) {
      pts = s.pts2d;
    }
    if (!pts || pts.length < 2) continue;
    ctx.strokeStyle = typeof s.axis === "number" ? AXIS_COLOR[s.axis] : "#9aa4ab";
    ctx.setLineDash(placed ? [] : [5, 4]);
    ctx.globalAlpha = placed ? 0.9 : 0.55;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // **S-7 고치기** — 선택한 획을 굵게, 앵커 후보를 점으로. 고른 것은 채워서 구분한다.
  const sel = selected();
  if (sel) {
    const pts = screenPts(sel);
    if (pts && pts.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#b9770e"; ctx.lineWidth = 4; ctx.globalAlpha = 0.55;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    for (const d of candDots) {
      const taken = d.end === 0 ? picks.a : picks.b;
      const isTaken = !!taken && taken[0] === d.pos[0] && taken[1] === d.pos[1] && taken[2] === d.pos[2];
      ctx.beginPath();
      ctx.arc(d.at[0], d.at[1], isTaken ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = d.end === 0 ? "#b9770e" : "#2471a3";
      ctx.globalAlpha = isTaken ? 1 : 0.5;
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff"; ctx.stroke();
    }
    ctx.restore();
  }
  panel.vps().forEach((v, i) => {
    if (!v || v[0] < 0 || v[0] > w || v[1] < 0 || v[1] > h) return;
    ctx.globalAlpha = 1; ctx.fillStyle = AXIS_COLOR[i];
    ctx.beginPath(); ctx.arc(v[0], v[1], 5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
  panel.drawOffscreenVps(ctx);        // 화면 밖 소실점 (§3.8)
}

/**
 * 획 상태 — 배치된 것과 남은 것. **미배치의 이유를 나눠 보인다**(미분류 / 앵커 없음).
 *
 * **세는 기준은 배치 여부다.** 미분류(`free`)를 미배치와 같은 것으로 세면 안 된다 —
 * §4.3 면 위 사선이 켜진 뒤로 미분류도 놓이기 때문이다(그 전에는 둘이 같았다).
 * 빼기로 세다가 "안 이어짐 −2"가 나왔다.
 */
function renderStrokes() {
  const placed = drawn.filter(s => s.pts3d.length).length;
  const free = drawn.filter(s => s.axis === "free").length;
  const unplaced = drawn.filter(s => !s.pts3d.length);
  const floating = unplaced.filter(s => s.axis !== "free").length;   // 축은 정해졌는데 못 이었다
  const freeUnplaced = unplaced.length - floating;
  const rows = [`<div>획 ${drawn.length} · <b>3D ${placed}</b>`
    + (free ? ` · 미분류 ${free}` : "")
    + (freeUnplaced ? ` (놓지 못한 것 ${freeUnplaced})` : "")
    + (floating ? ` · 안 이어짐 ${floating}` : "") + "</div>"];
  if (lastNote) rows.push(`<div class="hint">${lastNote}</div>`);
  if (floating) rows.push('<div class="hint">이어지지 않은 획은 깊이가 정해지지 않습니다 — 기존 획에 닿게 그으면 놓입니다</div>');
  const hidden = drawn.filter(s => !s.pts3d.length && viewOrigin.has(s.id)).length;
  if (hidden) rows.push(`<div class="hint">그 중 ${hidden}획은 <b>돌린 시점에서 그린 미배치 획</b>입니다 — `
    + "그 시점으로 돌아가면 3D 위에 파선으로 보이고, 거기서 <b>고치기</b>로 붙일 수 있습니다</div>");
  strokeEl.innerHTML = rows.join("");
  renderFix(unplaced);
  // **놓지 못한 미분류에만 축 선택을 띄운다.** 면 위 사선으로 이미 놓인 미분류 획에
  // 축 지정을 권하면 맞게 놓인 것을 축으로 옮기게 된다(A-3: 조용히 틀린 축을 만들지 않는다).
  pickEl.style.display = freeUnplaced ? "flex" : "none";
}

/**
 * **미배치 획을 화면에 남기고 사용자가 지정하게 한다**(D-S15 b~d).
 * 목록에서 고르면 캔버스에 후보 점이 뜨고, 점을 누르면 붙는다.
 * 후보가 없거나 깊이를 직접 주고 싶으면 슬라이더를 쓴다 — **그 배치는 미확정으로 표시된다**.
 */
function renderFix(unplaced: Stroke[]) {
  const ctx = placeCtx();
  const sel = selected();
  if (!ctx || (!unplaced.length && !sel)) { fixEl.innerHTML = ""; return; }
  const rows: string[] = [];
  if (panel.tool !== "edit") {
    rows.push('<div class="hint">놓이지 않은 획은 <b>고치기</b>로 직접 붙일 수 있습니다</div>');
  }
  if (unplaced.length) {
    rows.push('<div class="row" style="flex-wrap:wrap">놓지 못한 획: '
      + unplaced.map(s => `<button data-fix="${s.id}"${s.id === selId ? ' class="on"' : ''}>`
        + `${s.id}${viewOrigin.has(s.id) ? " (돌린 시점)" : ""}</button>`).join(" ")
      + "</div>");
  }
  if (sel) {
    const zr = depthRange(drawn.filter(t => t.id !== sel.id));
    const nA = candDots.filter(d => d.end === 0).length, nB = candDots.length - nA;
    rows.push(`<div class="row"><b>${sel.id}</b> 선택됨 — 후보 시작 ${nA} · 끝 ${nB}`
      + (provisional.has(sel.id) ? ' · <span style="color:#b9770e">깊이 미확정</span>' : "")
      + "</div>");
    if (viewOrigin.has(sel.id)) {
      rows.push('<div class="hint">돌린 시점에서 그린 획입니다 — '
        + (sameView(sel.id) ? "<b>지금 그 시점이라 3D 위에 파선으로 보입니다</b>"
                            : "그 시점으로 돌아가면 3D 위에 보입니다")
        + (viewCam.has(sel.id) ? ' <button id="goview">그 시점으로</button>' : "") + "</div>");
      rows.push('<div class="hint">'
        + (sameView(sel.id)
            ? `3D 뷰의 <b>고치기</b>를 누르면 후보 점 ${candDots3d.length}개가 뜹니다 — 거기서 붙입니다`
            : "붙이려면 먼저 그 시점으로 돌아가세요")
        + " (돌린 시점의 사선은 자동으로 안 놓입니다 — D-S19)</div>");
    } else if (candDots.length) {
      rows.push('<div class="hint">캔버스의 점을 누르면 그 자리에 붙습니다'
        + '(<span style="color:#b9770e">●</span> 시작 · <span style="color:#2471a3">●</span> 끝). '
        + '한쪽만 고르면 깊이는 미확정입니다</div>');
    } else {
      rows.push('<div class="hint">닿는 기존 획이 없습니다 — 깊이를 직접 주세요(미확정으로 남습니다)</div>');
    }
    if (zr) {
      rows.push(`<div class="row">깊이 <input id="depth" type="range" min="${(zr[0] * 0.5).toFixed(3)}"`
        + ` max="${(zr[1] * 1.5).toFixed(3)}" step="${((zr[1] - zr[0]) / 200 || 0.01).toFixed(4)}"`
        + ` value="${(sel.pts3d.length ? sel.pts3d[0][2] : (zr[0] + zr[1]) / 2).toFixed(3)}">`
        + '<button id="clearsel">선택 해제</button></div>');
    }
  }
  fixEl.innerHTML = rows.join("");
  fixEl.querySelectorAll<HTMLButtonElement>("button[data-fix]").forEach(b => {
    b.addEventListener("click", () => {
      selId = b.dataset.fix!;
      delete picks.a; delete picks.b;
      refreshCandidates();
      refresh();
    });
  });
  const dep = fixEl.querySelector<HTMLInputElement>("#depth");
  // 끌기 **시작**에 한 번만 스냅샷을 남긴다 — `input`마다 쌓으면 한 번 끌 때 수십 개가 된다
  dep?.addEventListener("pointerdown", () => pushUndo());
  dep?.addEventListener("input", () => {
    const s2 = selected(), c2 = placeCtx();
    if (!s2 || !c2) return;
    const got = placeAtDepth(s2.pts2d, Number(dep.value), c2);
    if (!got) return;
    s2.pts3d = got;
    provisional.add(s2.id);                    // **깊이를 손으로 준 배치는 언제나 미확정이다**
    markProvisional(s2);
    strokeView.sync(drawn, c2.f);
    ink.redraw();
  });
  // 끌고 있는 동안은 기하만 갱신하고(패널을 다시 그리면 슬라이더가 끊긴다),
  // 놓을 때 개수·안내를 함께 맞춘다.
  dep?.addEventListener("change", () => refresh());
  fixEl.querySelector("#goview")?.addEventListener("click", () => {
    const c = viewCam.get(selId!);
    if (!c) return;
    viewport.camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    viewport.controls.target.set(c.tgt[0], c.tgt[1], c.tgt[2]);
    viewport.controls.update();
    ink3d.redraw();
    refresh();
  });
  fixEl.querySelector("#clearsel")?.addEventListener("click", () => {
    selId = null; delete picks.a; delete picks.b; candDots = []; refresh();
  });
}

function refresh() {
  ink.redraw();
  ink3d.redraw();          // 돌린 시점의 미배치 파선이 선택·시점에 따라 바뀐다
  panel.renderStatus(statusEl);
  renderStrokes();
  const r = panel.acc.solve();
  msgEl.textContent = r.remaining.length ? r.remaining[0].hint
    : (panel.tool === "draw" ? "그리세요 — 확정된 획은 오른쪽 3D에 쌓입니다"
                             : "카메라 확정 — 그리기로 넘어가세요");
}

// ---------------------------------------------------------------- 배선

document.querySelectorAll<HTMLButtonElement>("#tools button").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#tools button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    panel.tool = b.dataset.t as Tool;
    refresh();
  });
});

/**
 * 미분류 획의 축을 사용자가 고른다(§4.1 "애매하면 미분류로 두고 사용자 지정에 맡긴다").
 * 가장 최근 **미배치** 미분류 획에 적용한다 — 방금 그은 획이 바로 그것이고,
 * **이미 놓인 미분류는 건드리지 않는다**(면 위 사선으로 맞게 놓였을 수 있다).
 */
for (const [label, axis] of [["축1", 0], ["축2", 1], ["축3", 2], ["화면평행", "screen"]] as [string, Axis][]) {
  const b = document.createElement("button");
  b.textContent = label;
  if (typeof axis === "number") b.style.borderColor = AXIS_COLOR[axis];
  b.addEventListener("click", () => {
    for (let i = drawn.length - 1; i >= 0; i--) {
      if (drawn[i].axis !== "free" || drawn[i].pts3d.length) continue;
      pushUndo();
      drawn[i].axis = axis;
      const ctx = placeCtx();
      if (ctx) settle(drawn, ctx, FIRST_VIEW_OPTS);
      strokeView.sync(drawn, ctx?.f);
      lastNote = "";
      break;
    }
    refresh();
  });
  pickEl.appendChild(b);
}

lensEl.addEventListener("input", () => {
  const mm = Number(lensEl.value);
  lensVal.textContent = `${mm}mm`;
  panel.setLens(mm);
});

const presetsEl = document.getElementById("presets")!;
for (const p of PRESETS) {
  const b = document.createElement("button");
  b.innerHTML = `${p.label}<small>${p.note}</small>`;
  b.addEventListener("click", () => {
    lensEl.value = String(p.mm);
    lensVal.textContent = `${p.mm}mm`;
    panel.applyPreset(p.id);
  });
  presetsEl.appendChild(b);
}

const lockBtn = document.getElementById("lock") as HTMLButtonElement;
lockBtn.addEventListener("click", () => {
  panel.toggleLock();                        // 소프트 락 (§3.5)
  lockBtn.textContent = panel.locked ? "잠금 해제" : "카메라 잠금";
});
document.getElementById("reset")!.addEventListener("click", () => {
  panel.reset(); drawn.length = 0; rawPoints.clear(); verdicts.clear(); viewOrigin.clear();
  lastNote = ""; strokeView.reset(); ink.clear(); refresh();
});

/**
 * 실획 내보내기 — **S-10 재측정의 유일한 입력 경로**다(AS-13).
 * 받은 파일을 저장소의 `sessions/`에 넣으면 `real_ink.test.ts`가 집어 간다.
 */
function exportSession() {
  return buildSession({
    at: new Date().toISOString(),
    imgSize: panel.imgSize,
    cam: panel.acc.solve().camera,
    vps: panel.vps(),
    strokes: drawn, raw: rawPoints, verdicts,
  });
}
document.getElementById("export")!.addEventListener("click", () => {
  if (!drawn.length) { msgEl.textContent = "내보낼 획이 없습니다"; return; }
  downloadSession(exportSession());
  msgEl.textContent = `획 ${drawn.length}개를 내보냈습니다 — 저장소의 sessions/ 에 넣어 주세요`;
});

// ---- S-5 3D 뷰 위에서 그리기 ----
const ink3dEl = document.getElementById("ink3d") as HTMLCanvasElement;
/**
 * 지금 시점이 그 획을 그린 시점과 **같은가**. 판정을 **화면에서** 한다 —
 * 재는 것이 "그 획의 `pts2d`를 지금 그려도 제자리인가"이기 때문이다.
 *
 * _처음에는 카메라 위치·타깃을 1e-3으로 비교했는데 **한 번도 같지 않았다**:
 * `OrbitControls`의 damping이 놓은 뒤에도 계속 카메라를 미세하게 옮긴다.
 * 3D 좌표로 재면 그 흔들림이 그대로 잡히지만 **화면에서는 1px도 안 움직인다**._
 */
function sameView(id: string): boolean {
  const c = viewCam.get(id);
  if (!c) return false;
  const axes = worldAxes();
  if (!axes.some(Boolean)) return false;
  const now = viewport.pose(), size = viewport.viewSize(), fov = viewport.camera.fov;
  const ctxN = viewPlaceCtx(now, axes, size, fov);
  const ctxT = viewPlaceCtx(c.pose, axes, size, fov);
  // 기존 기하의 점 몇 개가 두 시점에서 같은 화면 자리에 오는가
  let worst = 0, n = 0;
  for (const t of drawn) {
    if (!t.pts3d.length) continue;
    for (const p of [t.pts3d[0], t.pts3d[t.pts3d.length - 1]]) {
      const a = projectInView(now, p, ctxN.principal, ctxN.f);
      const b = projectInView(c.pose, p, ctxT.principal, ctxT.f);
      if (!a || !b) return false;
      worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
      n += 1;
      if (worst > SAME_VIEW_PX) return false;
    }
    if (n >= 8) break;
  }
  return n > 0;
}
/** 같은 시점으로 볼 화면 이동 한계(px). 파선이 제자리로 보이면 되므로 몇 px이면 된다. */
const SAME_VIEW_PX = 2;

const ink3d = new InkCanvas(ink3dEl, {
  /**
   * **돌린 시점의 미배치 획을 그 시점에 겹쳐 그린다**(D-S15 b). 그 획의 `pts2d`가 곧
   * 이 캔버스의 좌표다 — **단 같은 시점일 때만**이다. 시점이 달라지면 그 좌표가 가리키는
   * 자리가 달라지므로 안 그린다(그리면 S-6에서 고친 것과 같은 종류의 거짓말이 된다).
   */
  onBackground: (ctx) => {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    for (const s of drawn) {
      if (s.pts3d.length || !viewOrigin.has(s.id) || !sameView(s.id)) continue;
      ctx.strokeStyle = s.id === selId ? "#b9770e" : "#9aa4ab";
      ctx.globalAlpha = s.id === selId ? 0.9 : 0.6;
      ctx.beginPath();
      s.pts2d.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
      ctx.stroke();
    }
    // **고치기 모드의 앵커 후보**(S-7 4). 첫 캔버스와 같은 색 규약이다.
    if (viewMode === "fix") {
      ctx.setLineDash([]);
      for (const d of candDots3d) {
        const taken = d.end === 0 ? picks.a : picks.b;
        const isTaken = !!taken && taken[0] === d.pos[0] && taken[1] === d.pos[1] && taken[2] === d.pos[2];
        ctx.beginPath();
        ctx.arc(d.at[0], d.at[1], isTaken ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = d.end === 0 ? "#b9770e" : "#2471a3";
        ctx.globalAlpha = isTaken ? 1 : 0.55;
        ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff"; ctx.stroke();
      }
    }
    ctx.restore();
  },
  onStrokeEnd: (stroke) => {
    const pts = stroke.points.map(p => [p[0], p[1]] as Pt2);
    if (viewMode === "fix") { if (pts.length) editClick3d(pts[0]); }
    else if (pts.length >= 2) addStrokeFromView(pts, stroke.points);
    ink3d.clear();                      // 3D가 그 획을 이미 그리므로 잉크는 지운다
    refresh();
  },
});
ink3d.setFrame("persp");

function setViewMode(draw: boolean) { setView3dMode(draw ? "draw" : "orbit"); }

function setView3dMode(m: ViewMode) {
  viewMode = m;
  const draw = m === "draw";
  ink3dEl.classList.toggle("on", m !== "orbit");
  ink3d.redraw();
  viewport.controls.enabled = m === "orbit";
  document.getElementById("vt-orbit")!.classList.toggle("on", m === "orbit");
  document.getElementById("vt-draw")!.classList.toggle("on", draw);
  document.getElementById("vt-fix")!.classList.toggle("on", m === "fix");
  document.getElementById("viewlabel")!.textContent =
    m === "draw" ? "3D — **여기서 그리면 그 시점으로 놓인다**"
    : m === "fix" ? "3D — **못 놓은 획을 골라 점을 누른다**"
    : "3D — 드래그로 회전";
  refreshCandidates3d();
  refresh();
}
// 돌리는 동안 미배치 파선이 시점과 함께 나타나고 사라진다(`sameView`).
viewport.controls.addEventListener("change", () => { refreshCandidates3d(); ink3d.redraw(); });
document.getElementById("undo")!.addEventListener("click", () => undo());
document.getElementById("redo")!.addEventListener("click", () => redo());
window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  e.preventDefault();
  (e.shiftKey ? redo : undo)();
});
document.getElementById("vt-orbit")!.addEventListener("click", () => setView3dMode("orbit"));
document.getElementById("vt-draw")!.addEventListener("click", () => setView3dMode("draw"));
document.getElementById("vt-fix")!.addEventListener("click", () => setView3dMode("fix"));

function fit3d() {
  const [w, h] = viewport.viewSize();
  const dpr = window.devicePixelRatio || 1;
  ink3dEl.width = Math.round(w * dpr);
  ink3dEl.height = Math.round(h * dpr);
  ink3dEl.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", () => { fit(); viewport.resize(); fit3d(); });

// **생성 시점에는 레이아웃이 아직 안 잡혀 있다.** S-0에서 3D 캔버스가 1×24로 굳었던 것과
// 같은 자리인데 잉크 캔버스에는 적용하지 않았다 — 창 resize만 듣고 있으면 회복되지 않고,
// 그 크기가 화각·무한원 판정(`isFiniteVp`)의 기준이라 **소실점 셋이 둘로 읽힌다**.
// S-3 브라우저 확인에서 실제로 그렇게 나왔다.
//
// **`ResizeObserver`만으로는 부족하다**(S-4 브라우저 확인에서 또 걸렸다). 이 환경에서는
// 관찰 직후 콜백이 오지 않아 초기 크기를 영영 못 받는다 — 200ms를 기다려도 0회였다.
// `Viewport`가 처음부터 하던 대로 **다음 프레임에 한 번 더** 맞춘다. 둘 다 건다.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => fit()).observe(canvas.parentElement ?? canvas);
}
fit();
fit3d();
requestAnimationFrame(() => { fit(); fit3d(); });

// PWA — 오프라인 동작(§1.4). dev 서버에서는 등록하지 않는다(HMR과 충돌한다).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* 오프라인 없이도 동작한다 */ });
  });
}

// 브라우저 확인용 — 콘솔에서 배치 상태를 그대로 읽을 수 있게 한다(S-3 검증).
(window as unknown as { s2s: unknown }).s2s = {
  strokes: drawn, panel, addStroke, placeCtx, refresh, viewport, strokeView, exportSession,
  undo, redo, eraseAt, undoDepth: () => undoStack.length, redoDepth: () => redoStack.length,
  addStrokeFromView, worldAxes, setViewMode,
  // **S-7 고치기** — 스크립트 확인과 S-10 Playwright가 쓴다(후보 점 좌표가 없으면 클릭을 못 만든다).
  editClick, editClick3d, provisional, select: (id: string | null) => {
    selId = id; delete picks.a; delete picks.b;
    refreshCandidates(); refreshCandidates3d(); refresh();
  },
  candidates: () => candDots.map(d => ({ at: d.at, end: d.end })),
  candidates3d: () => candDots3d.map(d => ({ at: d.at, end: d.end })),
  sameView, viewCamHas: (id: string) => viewCam.has(id),
  sameViewDebug: (id: string) => {
    const c = viewCam.get(id); if (!c) return { err: "no cam" };
    const axes = worldAxes();
    const now = viewport.pose(), size = viewport.viewSize(), fov = viewport.camera.fov;
    const ctxN = viewPlaceCtx(now, axes, size, fov);
    const ctxT = viewPlaceCtx(c.pose, axes, size, fov);
    let worst = 0, n = 0, nullHit = 0;
    for (const t of drawn) {
      if (!t.pts3d.length) continue;
      for (const p of [t.pts3d[0], t.pts3d[t.pts3d.length - 1]]) {
        const a = projectInView(now, p, ctxN.principal, ctxN.f);
        const b = projectInView(c.pose, p, ctxT.principal, ctxT.f);
        if (!a || !b) { nullHit += 1; continue; }
        worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1])); n += 1;
      }
    }
    return { worst: +worst.toFixed(3), n, nullHit, fN: +ctxN.f.toFixed(2), fT: +ctxT.f.toFixed(2),
             dC: c.pose.C.map((v: number, i: number) => +(v - now.C[i]).toFixed(5)) };
  },
  setView3dMode,
};
