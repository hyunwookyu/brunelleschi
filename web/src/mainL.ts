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
import { draftFromDetection, handleAt, moveHandle, DRAFT_TOL,
         type HandleRef } from "./s3d/vpDraft.js";
import { HOMOG_TOL } from "./s3d/vpHomog.js";
import { liftAll, type LiftStroke } from "./s3d/lift.js";
import { classifyStroke } from "./s3d/axis.js";
import { AXIS_COLOR, guides as gridGuides, HORIZON_COLOR, GROUND_COLOR } from "./s3d/grid.js";
import { project } from "./s3d/geom3d.js";
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
const undoStack: DocState[] = [];
const UNDO_MAX = 200;

const cssSize = (): [number, number] => cssSizeOf(canvas);

function pushUndo() {
  undoStack.push(snapshotDoc(doc));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
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
  cam.apply();
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
}
let previewCount = 0;

function drawBelowInk(ctx2: CanvasRenderingContext2D) {
  // **확정 뷰를 벗어나면 2D 층 전체가 뜻을 잃는다** — 그리드도 가이드도 소실점 표식도
  // 확정 뷰의 화면 좌표다. 자유 시점에서 그리면 화면에 붙어 따라다니는 유령이 된다.
  if (cam.locked && !stage.isPinned) return;
  drawGrid(ctx2);
  drawPending(ctx2);
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
    if (phase === "down") { dragHandle = handleAt(cam.guides, p, cssSize()); return; }
    if (!dragHandle) return;
    if (phase === "up") { dragHandle = null; refresh(); return; }
    cam.guides = moveHandle(cam.guides, dragHandle, p);
    cam.apply();
    refresh();
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
      solveInto(ctx, pending(doc, doc.views[0].id));
      syncScene();
    }
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
    cam.acc.reset(); syncScene(); note = "";
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
};
