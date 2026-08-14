// 엔트리 — W-1 카메라 확정 화면. 계획서 §3.
//
// 잉크 캔버스 하나에 **가이드 → 확정 제스처 → 사용자 획** 순으로 겹쳐 그린다.
// 계산은 전부 `wire/`에 있고 여기는 DOM 배선만 한다.
import { InkCanvas } from "./capture/inkCanvas.js";
import { CameraPanel, type Tool } from "./ui/cameraPanel.js";
import { PRESETS } from "./wire/constraints.js";
import { AXIS_COLOR } from "./wire/grid.js";
import { parseStroke } from "./wire/strokeEdge.js";
import type { Pt2 } from "./wire/camera.js";

const canvas = document.getElementById("ink") as HTMLCanvasElement;
const statusEl = document.getElementById("status")!;
const msgEl = document.getElementById("msg")!;
const lensEl = document.getElementById("lens") as HTMLInputElement;
const lensVal = document.getElementById("lensval")!;

function cssSize(): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [Math.max(1, r.width), Math.max(1, r.height)];
}

const panel = new CameraPanel(cssSize(), () => refresh());

/** 사용자가 그린 획(그리기 도구) — W-2 추론 엔진이 붙기 전까지는 엣지만 잡아 둔다. */
const drawn: { a: Pt2; b: Pt2 }[] = [];

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
  // 잉크 아래에 가이드를 깐다. InkCanvas가 캔버스를 소유하므로 이 훅으로 들어간다.
  onBackground: (ctx) => drawBelowInk(ctx),
  onStrokeEnd: (stroke) => {
    const pts = stroke.points.map(p => [p[0], p[1]] as Pt2);
    if (pts.length < 2) return;
    const a = pts[0], b = pts[pts.length - 1];
    if (panel.tool === "draw") {
      // 획을 직선 런으로 쪼개 둔다(W-0). 배치는 W-3 앵커 체인이 한다.
      for (const r of parseStroke(pts).runs) drawn.push({ a: r.a as Pt2, b: r.b as Pt2 });
    } else {
      panel.handleStroke(a, b);
    }
    refresh();
  },
});
ink.setFrame("persp");

// ---------------------------------------------------------------- 그리기

/** 잉크 아래 층: 투시 가이드 → 확정된 엣지 → 소실점 표식. */
function drawBelowInk(ctx: CanvasRenderingContext2D) {
  const [w, h] = cssSize();
  panel.drawGuides(ctx);
  ctx.save();
  ctx.lineWidth = 2;
  for (const d of drawn) {
    ctx.strokeStyle = "#111"; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(d.a[0], d.a[1]); ctx.lineTo(d.b[0], d.b[1]); ctx.stroke();
  }
  panel.vps().forEach((v, i) => {
    if (!v || v[0] < 0 || v[0] > w || v[1] < 0 || v[1] > h) return;
    ctx.globalAlpha = 1; ctx.fillStyle = AXIS_COLOR[i];
    ctx.beginPath(); ctx.arc(v[0], v[1], 5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function refresh() {
  ink.redraw();
  panel.renderStatus(statusEl);
  const r = panel.acc.solve();
  msgEl.textContent = r.remaining.length ? r.remaining[0].hint : "카메라 확정 — 그리기로 넘어가세요";
}

// ---------------------------------------------------------------- 배선

document.querySelectorAll<HTMLButtonElement>("#tools button").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#tools button").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    panel.tool = b.dataset.t as Tool;
  });
});

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
  panel.reset(); drawn.length = 0; ink.clear(); refresh();
});

window.addEventListener("resize", fit);
fit();
