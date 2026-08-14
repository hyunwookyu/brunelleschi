// V-5 잉크 캡처 — Pointer Events, 마우스 1급. 조건부 팜 리젝션 + coalesced(pen) + tilt/seq.
// 측정(mouse_noise): 마우스는 precise 등급·단일 tolerance로 IoU≥0.97 → 마우스 전용 tol 불필요.
import type { Stroke } from "../parser/types.js";

export type Frame = "plan" | "persp";

export interface InkOptions {
  onStrokeEnd: (stroke: Stroke, frame: Frame) => void;   // pointerup 시 완성 획
  color?: string;
  onInputMode?: (penSeen: boolean) => void;              // 펜 감지 시 팜 리젝션 정책 알림
  // 잉크 아래 층(투시 가이드·소실점 등, W-1). redraw가 캔버스를 지우므로 여기서 다시 깐다.
  // 좌표는 **CSS 픽셀**로 그린다 — ctx는 dpr 스케일이 걸린 상태로 넘어온다.
  onBackground?: (ctx: CanvasRenderingContext2D) => void;
}

// 프레임별 획 버퍼 + 라이브 잉크 렌더. 프레임 전환은 setFrame으로.
export class InkCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frame: Frame = "plan";
  private seq = 0;
  private drawing = false;
  private activeId: number | null = null;   // 현재 잉크 포인터(멀티터치 방어)
  private pts: number[][] = [];      // [x,y,t,p,tiltX,tiltY] (§5.3)
  private strokes: Record<Frame, Stroke[]> = { plan: [], persp: [] };
  private t0 = 0;
  private opts: InkOptions;
  private hintFootprints: number[][][] = [];   // 투시 정합 힌트(평면 폴리곤 투영)
  private penSeen = false;                       // (a) 조건부 팜 리젝션: 펜 감지 시 펜 우선

  constructor(canvas: HTMLCanvasElement, opts: InkOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.ctx = canvas.getContext("2d")!;
    canvas.style.touchAction = "none";       // (e) 더블탭/제스처 차단
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onUp);
    // (e) iOS 확대 제스처·더블탭 줌 차단
    canvas.addEventListener("gesturestart", (ev) => ev.preventDefault());
    canvas.addEventListener("dblclick", (ev) => ev.preventDefault());
  }

  isPenSession() { return this.penSeen; }

  // (a) 마우스·펜 1급. 터치는 제스처(잉크 제외). 펜 감지 세션에선 터치=팜 → 확정 배제.
  private inkable(e: PointerEvent): boolean {
    if (e.pointerType === "pen") { if (!this.penSeen) { this.penSeen = true; this.opts.onInputMode?.(true); } return true; }
    if (e.pointerType === "mouse") return true;
    return false;   // touch: 잉크 아님(펜 세션=팜 리젝션, 비펜 세션=제스처 예약)
  }

  // (b) coalesced events — pen/touch만 유효(고주파). 마우스는 이벤트율 낮아 무의미 → 단일 이벤트.
  private movePoints(e: PointerEvent): PointerEvent[] {
    if (e.pointerType === "mouse") return [e];
    const co = e.getCoalescedEvents?.();
    return co && co.length ? co : [e];
  }

  size() { return { w: this.canvas.clientWidth, h: this.canvas.clientHeight }; }

  setFrame(f: Frame) { this.frame = f; this.redraw(); }
  getFrame() { return this.frame; }
  frameStrokes(f: Frame = this.frame) { return this.strokes[f]; }
  allStrokes(): Stroke[] { return [...this.strokes.plan, ...this.strokes.persp]; }   // 4.3 내보내기
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

  // 점 = [x, y, t, pressure, tiltX, tiltY] (§5.3). 마우스는 pressure 상수·tilt 0(파서 무관).
  private sample(e: PointerEvent, t: number): number[] {
    const [x, y] = this.local(e);
    return [x, y, t, e.pressure || 0.5, e.tiltX || 0, e.tiltY || 0];
  }

  private onDown = (e: PointerEvent) => {
    if (this.drawing) return;                 // 멀티터치/멀티펜 방어: 한 번에 한 획
    if (!this.inkable(e)) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    this.drawing = true;
    this.activeId = e.pointerId;
    this.t0 = performance.now();
    this.pts = [this.sample(e, 0)];
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drawing || e.pointerId !== this.activeId || !this.inkable(e)) return;
    e.preventDefault();
    const from = this.pts.length - 1;   // 이번 move의 이어그릴 시작점
    for (const c of this.movePoints(e)) this.pts.push(this.sample(c, performance.now() - this.t0));
    this.drawLive(Math.max(0, from));
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drawing || e.pointerId !== this.activeId) return;
    this.drawing = false;
    this.activeId = null;
    if (this.pts.length >= 2) {
      const stroke: Stroke = { points: this.pts, pen: "mass", frame: this.frame, seq: this.seq++ };
      this.strokes[this.frame].push(stroke);
      this.opts.onStrokeEnd(stroke, this.frame);
    }
    this.pts = [];
  };

  // 라이브: from..끝 세그먼트만 그림(전체 재그리기 회피). coalesced 다중점 대응.
  private drawLive(from: number) {
    const n = this.pts.length;
    if (n < 2) return;
    const dpr = this.dpr();
    this.ctx.strokeStyle = this.opts.color ?? "#111";
    this.ctx.lineWidth = 2 * dpr;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(this.pts[from][0] * dpr, this.pts[from][1] * dpr);
    for (let i = from + 1; i < n; i++) this.ctx.lineTo(this.pts[i][0] * dpr, this.pts[i][1] * dpr);
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
    if (this.opts.onBackground) {
      this.ctx.save();
      this.ctx.scale(dpr, dpr);            // 배경은 CSS 픽셀 좌표로 그린다
      this.opts.onBackground(this.ctx);
      this.ctx.restore();
    }
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
