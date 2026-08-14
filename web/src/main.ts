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
import { classifyStroke, type Axis } from "./s3d/axis.js";
import { newStroke, settle, reprojectAll, PLACE_TOL, type Stroke, type PlaceCtx } from "./s3d/stroke.js";
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

const canvas = document.getElementById("ink") as HTMLCanvasElement;
const statusEl = document.getElementById("status")!;
const msgEl = document.getElementById("msg")!;
const lensEl = document.getElementById("lens") as HTMLInputElement;
const lensVal = document.getElementById("lensval")!;
const strokeEl = document.getElementById("strokes")!;
const pickEl = document.getElementById("axispick")!;

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
  reprojectAll(drawn, ctx);
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
    else panel.handleStroke(pts[0], pts[pts.length - 1]);
    refresh();
  },
});
ink.setFrame("persp");

/** 획 하나 — **판정(§4.1) → 앵커 체인(§4.2) → 역투영**. 획은 쪼개지 않는다(§1). */
function addStroke(pts: Pt2[], raw?: number[][]) {
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
  if (ctx) settle(drawn, ctx);
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
  const axes = worldAxes();
  if (!axes.some(Boolean)) { lastNote = "카메라가 아직 확정되지 않았습니다"; return; }
  const pose = viewport.pose();
  const ctxV = viewPlaceCtx(pose, axes, viewport.viewSize(), viewport.camera.fov);

  const v = classifyStroke(pts, ctxV.vps, ctxV.imgSize, {},
                           { principal: ctxV.principal, f: ctxV.f });
  const s = newStroke(pts, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
  drawn.push(s);
  viewOrigin.add(s.id);
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
  settle(inView, ctxV, { mode: "facing",
    farEndCheck: PLACE_TOL.view_far_end_check,
    depthEnvelope: PLACE_TOL.view_depth_envelope });

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
  panel.vps().forEach((v, i) => {
    if (!v || v[0] < 0 || v[0] > w || v[1] < 0 || v[1] > h) return;
    ctx.globalAlpha = 1; ctx.fillStyle = AXIS_COLOR[i];
    ctx.beginPath(); ctx.arc(v[0], v[1], 5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
  panel.drawOffscreenVps(ctx);        // 화면 밖 소실점 (§3.8)
}

/** 획 상태 — 배치된 것과 남은 것. **미배치의 이유를 나눠 보인다**(미분류 / 앵커 없음). */
function renderStrokes() {
  const placed = drawn.filter(s => s.pts3d.length).length;
  const free = drawn.filter(s => s.axis === "free").length;
  const floating = drawn.length - placed - free;
  const rows = [`<div>획 ${drawn.length} · <b>3D ${placed}</b>`
    + (free ? ` · 미분류 ${free}` : "") + (floating ? ` · 안 이어짐 ${floating}` : "") + "</div>"];
  if (lastNote) rows.push(`<div class="hint">${lastNote}</div>`);
  if (floating) rows.push('<div class="hint">이어지지 않은 획은 깊이가 정해지지 않습니다 — 기존 획에 닿게 그으면 놓입니다</div>');
  const hidden = drawn.filter(s => !s.pts3d.length && viewOrigin.has(s.id)).length;
  if (hidden) rows.push(`<div class="hint">그 중 ${hidden}획은 <b>돌린 시점에서 그린 미배치 획</b>이라 여기 안 보입니다 — 그 시점으로 돌아가면 보입니다(S-7에서 손봅니다)</div>`);
  strokeEl.innerHTML = rows.join("");
  pickEl.style.display = free ? "flex" : "none";
}

function refresh() {
  ink.redraw();
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
 * 가장 최근 미분류 획에 적용한다 — 방금 그은 획이 바로 그것이기 때문이다.
 */
for (const [label, axis] of [["축1", 0], ["축2", 1], ["축3", 2], ["화면평행", "screen"]] as [string, Axis][]) {
  const b = document.createElement("button");
  b.textContent = label;
  if (typeof axis === "number") b.style.borderColor = AXIS_COLOR[axis];
  b.addEventListener("click", () => {
    for (let i = drawn.length - 1; i >= 0; i--) {
      if (drawn[i].axis !== "free") continue;
      drawn[i].axis = axis;
      const ctx = placeCtx();
      if (ctx) settle(drawn, ctx);
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
const ink3d = new InkCanvas(ink3dEl, {
  onStrokeEnd: (stroke) => {
    const pts = stroke.points.map(p => [p[0], p[1]] as Pt2);
    if (pts.length >= 2) addStrokeFromView(pts, stroke.points);
    ink3d.clear();                      // 3D가 그 획을 이미 그리므로 잉크는 지운다
    refresh();
  },
});
ink3d.setFrame("persp");

function setViewMode(draw: boolean) {
  ink3dEl.classList.toggle("on", draw);
  viewport.controls.enabled = !draw;
  document.getElementById("vt-orbit")!.classList.toggle("on", !draw);
  document.getElementById("vt-draw")!.classList.toggle("on", draw);
  document.getElementById("viewlabel")!.textContent = draw
    ? "3D — **여기서 그리면 그 시점으로 놓인다**" : "3D — 드래그로 회전";
  refresh();
}
document.getElementById("vt-orbit")!.addEventListener("click", () => setViewMode(false));
document.getElementById("vt-draw")!.addEventListener("click", () => setViewMode(true));

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
  addStrokeFromView, worldAxes, setViewMode,
};
