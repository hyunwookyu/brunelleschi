// V-4 화면 구성 — 분할 레이아웃 + 평면/투시 탭 + 마우스 드로잉 루프 + 수동 치수 + 투시 안내.
// 파이프라인: 잉크(pointerup) → 워커(증분파서) → baseIR → 수동앵커 → 씬 → Three 렌더.
// 지연(판정 A): pointerup(t0) → 파서 → IR → sceneDiff → 렌더완료(rAF). __bench로 1/3/8볼륨 측정.
import type { IR, Stroke } from "../parser/types.js";
import { emptyIR } from "../parser/types.js";
import { buildScene } from "../scene/sceneBuilder.js";
import { Viewer } from "./viewer.js";
import { InkCanvas, type Frame } from "../capture/inkCanvas.js";
import { ManualAnchorStore, type Prop, centroid } from "./manualAnchor.js";
import { needsPlanForPerspective } from "./footprintClass.js";
import { guidanceFor, type CameraSummary, type AspectSummary } from "./guidance.js";
import { applyAxisChoice, hasAmbiguousAxis, previewBothSolutions } from "./axisToggle.js";
import { buildSession, downloadSession, validateSession } from "./sessionExport.js";

const $ = (id: string) => document.getElementById(id)!;

const inkHost = $("ink") as HTMLCanvasElement;
const viewHost = $("view");
const viewer = new Viewer(viewHost);
const anchors = new ManualAnchorStore();

let baseIR: IR = emptyIR();     // 워커 산출(앵커 전). 최신 상태.
let curFrame: Frame = "plan";
let benchPending: { t0: number; resolve: (ms: number) => void } | null = null;   // 벤치 동기 측정

// 워커(증분 파서, §2.3)
const worker = new Worker(new URL("../worker/parserWorker.ts", import.meta.url), { type: "module" });
const size = () => ({ w: inkHost.clientWidth, h: inkHost.clientHeight });
function initWorker() { const { w, h } = size(); worker.postMessage({ type: "init", w, h, frame: "plan" }); }

let readyResolver: (() => void) | null = null;   // 벤치: 워커 유휴 핸드셰이크

// 워커 회신 → 앵커 얹기 → 씬 → 지연 측정
worker.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "ready") { readyResolver?.(); readyResolver = null; return; }
  if (m.type !== "ir") return;
  baseIR = m.ir as IR;
  const ir = currentIR();
  viewer.apply(buildScene(ir));
  updateStatus(ir, m.reparsed);
  updatePerspectiveHint();
  if (benchPending) {
    // 벤치: 씬 적용 직후 동기 렌더+측정(rAF 정지 환경 대비). 파서→씬→GPU 완료 지연.
    const ms = viewer.renderAndMeasureSync(benchPending.t0);
    benchPending.resolve(ms); benchPending = null;
  } else if (typeof m.t0 === "number") {
    // 대화식: rAF 콜백 시점까지 측정(판정 A end-to-end).
    viewer.measureNextRender(m.t0).then(ms => lastLatency(ms));
  }
};

// 잉크 캡처(마우스 1급, 조건부 팜 리젝션)
let inputMode = "마우스/펜";
const ink = new InkCanvas(inkHost, {
  onStrokeEnd: (stroke: Stroke, frame: Frame) => {
    if (frame === "plan") worker.postMessage({ type: "stroke", stroke, t0: performance.now() });
    else updatePerspectiveHint();   // 투시 획: 볼륨 파싱 안 함(V-4), 안내만 갱신
  },
  onInputMode: (penSeen) => { inputMode = penSeen ? "펜(팜 리젝션)" : "마우스/펜"; },
});

// (e §5.2) Wake Lock — 화면 꺼짐 방지. 사용자 제스처(첫 pointerdown)에서 획득, 복귀 시 재획득.
let wakeLock: any = null;
async function acquireWakeLock() {
  try { if ("wakeLock" in navigator && !wakeLock) wakeLock = await (navigator as any).wakeLock.request("screen"); } catch { /* 미지원/거부 */ }
}
inkHost.addEventListener("pointerdown", acquireWakeLock, { once: false });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { wakeLock = null; acquireWakeLock(); } });

// ---- 프레임 탭(§3.2) ----
function setFrame(f: Frame) {
  curFrame = f;
  ink.setFrame(f);
  ($("tab-plan") as HTMLButtonElement).classList.toggle("on", f === "plan");
  ($("tab-persp") as HTMLButtonElement).classList.toggle("on", f === "persp");
  updatePerspectiveHint();
}
($("tab-plan") as HTMLButtonElement).onclick = () => setFrame("plan");
($("tab-persp") as HTMLButtonElement).onclick = () => setFrame("persp");

// B-1 b — 축 뒤바뀜 두 해 중 어느 쪽을 보고 있는가. 기하가 구분하지 못하므로(재투영 오차
// 상대차 정확히 0) 사용자가 보고 고른다. 질의(§6)보다 빠르다.
let useAltAxis = false;
function currentIR(): IR { return applyAxisChoice(anchors.apply(baseIR), useAltAxis); }

// 복원 상태 — 투시 경로가 붙기 전까지는 미정(2.2 Python 경로의 TS 대응은 후속).
let camSummary: CameraSummary = {};
let aspectSummary: AspectSummary | undefined;
let axisAmbiguous = false;

// 투시 정합 힌트(§3.2) + §3.8 개정 안내(지시 2.7).
// 구판은 "평면을 그리거나 치수를 알려주세요"였으나 사용자는 평면을 그리지 않는다(V-v).
// 이제 **무엇이 왜 미확정인지**를 사유별로 말한다.
function updatePerspectiveHint() {
  const ir = currentIR();
  ink.setHints(curFrame === "persp" ? ir.volumes.map(v => v.footprint.map(p => [p[0], p[1]])) : []);
  const el = $("persp-hint");
  if (curFrame !== "persp") { el.style.display = "none"; return; }

  const items = guidanceFor(camSummary, aspectSummary, axisAmbiguous);
  // 복원 결과가 아직 없으면(획만 있는 단계) 형태 기반 잠정 안내로 대체
  if (items.length === 0) {
    const shapeDoubt = ir.volumes.length === 0 || ir.volumes.some(v => needsPlanForPerspective(v.footprint));
    if (!shapeDoubt) { el.style.display = "none"; return; }
    el.textContent = "이 투시만으로는 비례가 확정되지 않습니다. 다른 각도에서 한 장 더 그리거나 치수를 알려주세요.";
    el.style.display = "block";
    return;
  }
  el.textContent = items.map(i => i.text).join("  ");
  el.style.display = "block";
}

// 투시 복원 결과 주입(서버/워커 경로가 붙으면 호출). 테스트·자동화에서도 쓴다.
function setPerspectiveState(cam: CameraSummary, aspect?: AspectSummary, axisAmb = false) {
  camSummary = cam; aspectSummary = aspect; axisAmbiguous = axisAmb;
  updatePerspectiveHint();
}

// ---- 수동 치수 입력(추가 a) ----
let pickedId: string | null = null;
const dimPanel = $("dim-panel");
let downXY: [number, number] | null = null;

viewer.renderer.domElement.addEventListener("pointerdown", (e) => { downXY = [e.clientX, e.clientY]; });
viewer.renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 6) return;           // 드래그(궤도회전) → 픽 아님
  const r = viewHost.getBoundingClientRect();
  const id = viewer.pick(e.clientX - r.left, e.clientY - r.top);
  if (id) openDimPanel(id, e.clientX - r.left, e.clientY - r.top);
  else closeDimPanel();
});

function openDimPanel(id: string, px: number, py: number) {
  pickedId = id;
  const v = currentIR().volumes.find(x => x.id === id);
  dimPanel.style.display = "block";
  dimPanel.style.left = Math.min(px, viewHost.clientWidth - 220) + "px";
  dimPanel.style.top = Math.min(py, viewHost.clientHeight - 120) + "px";
  ($("dim-title")).textContent = `${id}${v?.label ? " (" + v.label + ")" : ""} 치수 입력 (m)`;
  ($("dim-value") as HTMLInputElement).value = "";
  ($("dim-value") as HTMLInputElement).focus();
}
function closeDimPanel() { dimPanel.style.display = "none"; pickedId = null; }

// 볼륨 id + prop + 값 → 앵커 등록 후 발화 앵커와 동일 전파·재빌드.
function applyManualDimension(id: string, prop: Prop, value: number): boolean {
  if (!isFinite(value) || value <= 0) return false;
  if (!anchors.add(baseIR, id, prop, value)) return false;
  const ir = currentIR();                    // 발화 앵커와 동일 로직(applyOps)
  viewer.apply(buildScene(ir));
  updateStatus(ir, 0);
  updatePerspectiveHint();
  return true;
}

($("dim-apply") as HTMLButtonElement).onclick = () => {
  if (!pickedId) return;
  const prop = ($("dim-prop") as HTMLSelectElement).value as Prop;
  applyManualDimension(pickedId, prop, parseFloat(($("dim-value") as HTMLInputElement).value));
  closeDimPanel();
};
($("dim-cancel") as HTMLButtonElement).onclick = closeDimPanel;

// ---- 카메라 버튼(§3.3) ----
($("home") as HTMLButtonElement).onclick = () => viewer.goHome();
($("top") as HTMLButtonElement).onclick = () => viewer.goTop();
// 4.3 — 스트로크+IR 내보내기. 실획을 stage0/10·12 분석 경로로 넘기는 유일한 통로다.
function currentSession() {
  return buildSession({
    strokes: ink.allStrokes(), ir: currentIR(),
    canvas: { w: inkHost.clientWidth, h: inkHost.clientHeight },
    inputMode, penSeen: ink.isPenSession(),
  });
}
($("export") as HTMLButtonElement).onclick = () => downloadSession(currentSession());

($("axis-toggle") as HTMLButtonElement).onclick = () => {
  useAltAxis = !useAltAxis;
  const ir = currentIR();
  viewer.apply(buildScene(ir));
  updateStatus(ir, 0); updatePerspectiveHint();
};

($("clear") as HTMLButtonElement).onclick = () => {
  ink.clear(); anchors.clear(); baseIR = emptyIR();
  worker.postMessage({ type: "reset" });
  viewer.apply([]); updateStatus(baseIR, 0); updatePerspectiveHint();
};

// ---- 분할 드래그(§3.1) ----
(function splitter() {
  const bar = $("split"), root = $("panels");
  let dragging = false;
  bar.addEventListener("pointerdown", (e) => { dragging = true; bar.setPointerCapture((e as PointerEvent).pointerId); });
  bar.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const r = root.getBoundingClientRect();
    const frac = Math.max(0.2, Math.min(0.8, ((e as PointerEvent).clientX - r.left) / r.width));
    root.style.gridTemplateColumns = `${frac * 100}% 6px ${(1 - frac) * 100}%`;
    resizeAll();
  });
  bar.addEventListener("pointerup", () => { dragging = false; });
})();

// ---- 상태/지연 표시 ----
function updateStatus(ir: IR, reparsed: number) {
  const confs = ir.volumes.map(v => v.confidence.toFixed(2)).join("/");
  $("stat").textContent =
    `[${inputMode}]${hasAmbiguousAxis(ir) ? ` [축 ${useAltAxis ? "B" : "A"}]` : ""} 볼륨 ${ir.volumes.length}${confs ? " (" + confs + ")" : ""} · 앵커 ${anchors.count()} · 관계 ${ir.relations.length} · 재파싱 ${reparsed} · obj ${viewer.objectCount()}`;
}
function lastLatency(ms: number) { $("lat").textContent = `지연 ${ms.toFixed(1)}ms`; }

function resizeAll() { ink.resize(); viewer.resize(); }
addEventListener("resize", resizeAll);

// 초기화
initWorker();
ink.resize();
setFrame("plan");
updateStatus(baseIR, 0);

// ================= 지연 벤치(판정 A) =================
// 실제 파이프라인(잉크→워커→앵커→씬→렌더)을 합성 획으로 구동. 볼륨 1/3/8, p50/p95.
function rectStroke(x: number, y: number, w: number, h: number, seq: number): Stroke {
  const pts: number[][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number) => { for (let t = 0; t <= 1; t += 0.04) pts.push([ax + (bx - ax) * t, ay + (by - ay) * t, seq, 0.5]); };
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
  return { points: pts, pen: "mass", frame: "plan", seq };
}
function pct(a: number[], q: number) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; }

// 한 획을 워커로 보내고 (파서→IR→앵커→씬→GPU 렌더 완료) 지연을 반환. 파이프라인 그대로.
function submitAndMeasure(stroke: Stroke): Promise<number> {
  return new Promise<number>(res => {
    benchPending = { t0: performance.now(), resolve: res };
    worker.postMessage({ type: "stroke", stroke, t0: performance.now() });
  });
}

(window as any).__bench = async (volumeCounts = [1, 3, 8], reps = 30) => {
  const W = 1600, H = 1000;
  viewer.forceSize(960, 760);          // 비표시 상태(host 0×0) 대비 고정 렌더 크기
  const out: Record<number, { p50: number; p95: number; n: number }> = {};
  for (const N of volumeCounts) {
    const samples: number[] = [];
    for (let r = 0; r < reps; r++) {
      worker.postMessage({ type: "reset" });
      const ready = new Promise<void>(res => { readyResolver = res; });
      worker.postMessage({ type: "init", w: W, h: H, frame: "plan" });
      await ready;                       // 워커 유휴 확정(setup을 측정에서 분리)
      viewer.apply([]);
      // N개 순차 적재 — N번째(N볼륨 시점 증분)만 측정
      for (let i = 0; i < N; i++) {
        const s = rectStroke((i % 4) * 380 + 40, Math.floor(i / 4) * 460 + 40, 240, 180, i);
        const ms = await submitAndMeasure(s);
        if (i === N - 1) samples.push(ms);
      }
    }
    out[N] = { p50: +pct(samples, 0.5).toFixed(1), p95: +pct(samples, 0.95).toFixed(1), n: samples.length };
  }
  worker.postMessage({ type: "reset" }); initWorker(); viewer.apply([]); anchors.clear(); baseIR = emptyIR();
  resizeAll(); updateStatus(baseIR, 0);
  (window as any).__benchResult = out;
  return out;
};

(window as any).__viewer = viewer;
(window as any).__ink = ink;
// 자동화·검증 훅(V-8 Playwright, 스모크). 내부 상태 읽기 + 대화식 액션 재현.
(window as any).__app = {
  getIR: () => anchors.apply(baseIR),
  volumeCount: () => baseIR.volumes.length,
  setDimension: (id: string, prop: Prop, value: number) => applyManualDimension(id, prop, value),
  pick: (px: number, py: number) => viewer.pick(px, py),
  setFrame,
  anchorCount: () => anchors.count(),
  setPerspectiveState,
  toggleAxis: () => { useAltAxis = !useAltAxis; const ir = currentIR(); viewer.apply(buildScene(ir)); updateStatus(ir, 0); return useAltAxis; },
  axisChoice: () => useAltAxis,
  session: currentSession,
  sessionErrors: () => validateSession(currentSession()),
  axisPreviews: (id: string) => { const v = currentIR().volumes.find(x => x.id === id); return v ? previewBothSolutions(v) : null; },
  guidance: () => guidanceFor(camSummary, aspectSummary, axisAmbiguous),
};
