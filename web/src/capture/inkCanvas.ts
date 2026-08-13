// V-4 잉크 캡처 — Pointer Events, 마우스 1급(pointerType 'mouse'). 프레임별 획 저장.
// 팜 리젝션/coalesced/tilt/seq는 V-5에서 보강. 여기선 마우스·펜 드로잉 + pointerup→Stroke.
import type { Stroke } from "../parser/types.js";

export type Frame = "plan" | "persp";

export interface InkOptions {
  onStrokeEnd: (stroke: Stroke, frame: Frame) => void;   // pointerup 시 완성 획
  color?: string;
}

// 프레임별 획 버퍼 + 라이브 잉크 렌더. 프레임 전환은 setFrame으로.
export class InkCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frame: Frame = "plan";
  private seq = 0;
  private drawing = false;
  private pts: number[][] = [];      // [x,y,t,p]
  private strokes: Record<Frame, Stroke[]> = { plan: [], persp: [] };
  private t0 = 0;
  private opts: InkOptions;
  private hintFootprints: number[][][] = [];   // 투시 정합 힌트(평면 폴리곤 투영)

  constructor(canvas: HTMLCanvasElement, opts: InkOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.ctx = canvas.getContext("2d")!;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onUp);
  }

  // 마우스 1급. 펜 허용. 터치는 잉크 제외(V-5 팜 리젝션·제스처).
  private inkable(e: PointerEvent): boolean {
    return e.pointerType === "mouse" || e.pointerType === "pen";
  }

  size() { return { w: this.canvas.clientWidth, h: this.canvas.clientHeight }; }

  setFrame(f: Frame) { this.frame = f; this.redraw(); }
  getFrame() { return this.frame; }
  frameStrokes(f: Frame = this.frame) { return this.strokes[f]; }
  setHints(fps: number[][][]) { this.hintFootprints = fps; if (this.frame === "persp") this.redraw(); }

  clear() {
    this.strokes = { plan: [], persp: [] };
    this.seq = 0;
    this.redraw();
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private onDown = (e: PointerEvent) => {
    if (!this.inkable(e)) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    this.drawing = true;
    this.t0 = performance.now();
    const [x, y] = this.local(e);
    this.pts = [[x, y, 0, e.pressure || 0.5]];
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drawing || !this.inkable(e)) return;
    e.preventDefault();
    const [x, y] = this.local(e);
    this.pts.push([x, y, performance.now() - this.t0, e.pressure || 0.5]);
    this.drawLive();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.pts.length >= 2) {
      const stroke: Stroke = { points: this.pts, pen: "mass", frame: this.frame, seq: this.seq++ };
      this.strokes[this.frame].push(stroke);
      this.opts.onStrokeEnd(stroke, this.frame);
    }
    this.pts = [];
  };

  // 라이브: 방금 세그먼트만 그림(전체 재그리기 회피).
  private drawLive() {
    const n = this.pts.length;
    if (n < 2) return;
    const dpr = this.dpr();
    this.ctx.strokeStyle = this.opts.color ?? "#111";
    this.ctx.lineWidth = 2 * dpr;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(this.pts[n - 2][0] * dpr, this.pts[n - 2][1] * dpr);
    this.ctx.lineTo(this.pts[n - 1][0] * dpr, this.pts[n - 1][1] * dpr);
    this.ctx.stroke();
  }

  private dpr() { return window.devicePixelRatio || 1; }

  // 캔버스 백버퍼 크기 = CSS크기×dpr. resize·프레임전환 시 전체 재그리기.
  resize() {
    const dpr = this.dpr();
    const { w, h } = this.size();
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.redraw();
  }

  redraw() {
    const dpr = this.dpr();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // 투시 정합 힌트: 평면 폴리곤을 옅게(§3.2)
    if (this.frame === "persp") {
      this.ctx.strokeStyle = "rgba(30,120,170,0.28)";
      this.ctx.setLineDash([6 * dpr, 4 * dpr]);
      this.ctx.lineWidth = 1.5 * dpr;
      for (const fp of this.hintFootprints) {
        if (fp.length < 2) continue;
        this.ctx.beginPath();
        fp.forEach(([x, y], i) => (i === 0 ? this.ctx.moveTo(x * dpr, y * dpr) : this.ctx.lineTo(x * dpr, y * dpr)));
        this.ctx.closePath();
        this.ctx.stroke();
      }
      this.ctx.setLineDash([]);
    }
    // 프레임 확정 획
    this.ctx.strokeStyle = this.opts.color ?? "#111";
    this.ctx.lineWidth = 2 * dpr;
    this.ctx.lineCap = "round";
    for (const s of this.strokes[this.frame]) {
      const p = s.points;
      if (p.length < 2) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(p[0][0] * dpr, p[0][1] * dpr);
      for (let i = 1; i < p.length; i++) this.ctx.lineTo(p[i][0] * dpr, p[i][1] * dpr);
      this.ctx.stroke();
    }
  }
}
