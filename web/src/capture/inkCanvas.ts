// V-5 잉크 캡처 — Pointer Events, 마우스 1급. 조건부 팜 리젝션 + coalesced(pen) + tilt/seq.
// 측정(mouse_noise): 마우스는 precise 등급·단일 tolerance로 IoU≥0.97 → 마우스 전용 tol 불필요.
import type { Stroke } from "../parser/types.js";
import { ensureFit, toLocal, type Frame as CanvasFrame } from "./canvasFrame.js";
import { PalmGate } from "./palmGate.js";

export type Frame = "plan" | "persp";

export interface InkOptions {
  onStrokeEnd: (stroke: Stroke, frame: Frame) => void;   // pointerup 시 완성 획
  color?: string;
  onInputMode?: (penSeen: boolean) => void;              // 펜 감지 시 팜 리젝션 정책 알림
  // 잉크 아래 층(투시 가이드·소실점 등, W-1). redraw가 캔버스를 지우므로 여기서 다시 깐다.
  // 좌표는 **CSS 픽셀**로 그린다 — ctx에 배율이 이미 걸려 있다(`canvasFrame`).
  onBackground?: (ctx: CanvasRenderingContext2D) => void;
  /**
   * **끌기 모드**(L-A.5, 계획서 §5.4). `true`면 포인터가 잉크가 아니라 `onDrag`로 간다 —
   * 소실점 가이드 핸들을 끄는 데 쓴다.
   *
   * 왜 여기에 두는가: 좌표 변환(`local`)이 **`canvasFrame` 단일 출처**를 타야 하기 때문이다
   * (D-C3·PITFALLS #21). 바깥에서 `clientX`를 직접 읽으면 dpr 규약이 둘이 되고,
   * 그 버그는 dpr 1인 데스크톱에서 안 보인다.
   *
   * ⚠ **누른 자리를 함께 준다**(2026-08-16, D-L45) — 지평선 손잡이처럼 **위치로 갈리는**
   * 끌기가 생겼기 때문이다. 좌표는 여기서 `local()`로 만든 것이라 규약이 하나로 남는다.
   */
  dragMode?: (p: [number, number]) => boolean;
  onDrag?: (p: [number, number], phase: "down" | "move" | "up") => void;
  /**
   * **떠 있는 커서**(L-B.3 스냅 표시). 그리지도 끌지도 않는 동안의 포인터 위치다.
   * SketchUp/Rhino가 스냅 표식을 이때 보인다 — 눌러 보기 전에 무엇에 붙을지 알아야 한다.
   *
   * `onDrag`와 같은 이유로 여기에 둔다: 좌표 변환이 `canvasFrame` 단일 출처를 타야 한다
   * (D-C3·PITFALLS #21). 바깥에서 `clientX`를 직접 읽으면 dpr 규약이 둘이 된다.
   */
  onHover?: (p: [number, number] | null) => void;
  /**
   * **그리는 중**(L-B.4 실시간 색·미리보기). 마지막 점이 커서다.
   *
   * 이것이 오면 `drawLive`(증분 그리기) 대신 **전체 다시 그리기**를 한다 —
   * 미리보기 선이 커서를 따라와야 하는데 증분 그리기는 지우지 않기 때문이다.
   * 진행 중인 획은 `redraw()`가 함께 그린다(아래 `livePoints`).
   */
  onLive?: (pts: number[][]) => void;
  /**
   * **진행 중 획의 원시 직선을 숨길 것인가**(5차 지시 4). 스냅 미리보기가 걸려 있으면
   * 참을 돌려 준다 — 그러면 화면에는 **스냅된 선 하나**만 보인다. 자유 선(스냅 없음)일 때만
   * 원시 직선이 그대로 미리보기다.
   */
  liveHidden?: () => boolean;
  /**
   * **카메라로 가는 포인터**(2026-08-17 G). 잉크가 아닌 포인터를 여기로 넘긴다 —
   * 터치는 언제나, 마우스는 `cameraMouse()`가 참일 때(궤도 모드).
   *
   * **왜 여기가 라우터인가**: 잉크 캔버스가 three 캔버스를 덮고 있어 터치가
   * `OrbitControls`까지 안 내려간다. 옛 판은 `궤도` 버튼이 `pointer-events: none`을 걸어
   * **캔버스를 통째로 비켜서** 해결했는데, 그러면 그 동안 잉크·스냅·호버가 전부 죽는다.
   * 펜·마우스·터치를 **가르는 자리는 이미 여기**(`inkable`)이므로 라우터도 여기 둔다 —
   * 좌표 변환(`local`)이 `canvasFrame` 단일 출처를 지나는 것도 같은 이유다(#21).
   *
   * 팜 리젝션(G-2)은 `PalmGate`가 하고 **여기서 지난다** — 잉크 쪽만 막으면
   * 손바닥이 카메라를 돌린다.
   */
  onCamera?: (id: number, phase: "down" | "move" | "up" | "cancel",
              p: [number, number]) => void;
  /** 마우스가 카메라로 가는가(궤도 모드). 없으면 마우스는 언제나 잉크다 */
  cameraMouse?: () => boolean;
  /**
   * **화면 팬 오프셋**(2026-08-18 10차 항목 5, css px) — 표시 = 문서 좌표 + 오프셋.
   * 입력(`local`)은 **빼서** 문서 좌표를 만들고, 그리기(`redraw`)는 **더해서** 표시한다 —
   * 두 방향이 이 한 훅을 지나므로 어긋날 수 없다(#17). 없으면 [0,0](종전과 같다).
   * ⚠ 문서(`pts2d`)에는 오프셋이 **절대 안 들어간다** — 표시 상태일 뿐이다(§6.1의
   * 좌표계 단일성이 이 규약에 달렸다).
   */
  viewOffset?: () => [number, number];
  /**
   * **화면 줌 배율**(2026-08-19 14차 항목 5 — D-L94, 표시 = 문서 좌표 × 배율 + 오프셋).
   * `viewOffset`과 같은 규약: 입력은 (표시 − 오프셋) ÷ 배율로 문서 좌표를 만들고,
   * 그리기는 배율·오프셋을 걸어 표시한다 — 두 방향이 한 훅을 지난다(#17).
   * 문서(`pts2d`)에는 절대 안 들어간다(§6.1). 없으면 1(종전과 같다).
   * ⚠ 선 굵기도 함께 확대된다(종이 확대 — 프로크리에이트 선례. 3D 층의 화면 굵기는
   * 불변이라 배율≠1에서 두 층의 굵기가 갈린다 — 알려진 표시 한계, D-L94).
   */
  viewScale?: () => number;
  /** 휠 — 데스크톱 확인용 줌. `at`은 커서의 **표시 좌표**(팬·줌 미적용 로컬)다. */
  onWheel?: (deltaY: number, at: [number, number]) => void;
  /**
   * **잉크 입력을 받는가**(2026-08-19 14차 항목 6-e — 모델링 화면에서는 안 그린다).
   * false면 잉크 라우팅 자체를 막는다(그리기·끌기·호버 표식) — 카메라 라우팅(`onCamera`)은
   * 그대로다. 없으면 항상 받는다(종전과 같다).
   */
  inkAllowed?: () => boolean;
  /** 위 게이트가 막은 순간의 알림 — 사용자에게 복귀 안내를 낼 자리다. */
  onInkBlocked?: () => void;
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
  /** 마지막으로 맞춘 프레임. `null`이면 아직 안 맞춘 것이다(`frameNow`가 맞춘다). */
  private frame_: CanvasFrame | null = null;

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
    canvas.addEventListener("pointerleave", () => this.opts.onHover?.(null));
    // (e) iOS 확대 제스처·더블탭 줌 차단
    canvas.addEventListener("gesturestart", (ev) => ev.preventDefault());
    canvas.addEventListener("dblclick", (ev) => ev.preventDefault());
    // 휠 — 데스크톱 확인용 줌. 잉크 캔버스가 위에 있어 three 캔버스에 안 닿는다(G)
    canvas.addEventListener("wheel", (ev) => {
      if (!this.opts.onWheel) return;
      ev.preventDefault();
      // **표시 좌표**를 함께 넘긴다(항목 5) — 화면 줌은 커서 자리를 고정점으로 돈다
      const fr = this.frameNow();
      this.opts.onWheel(ev.deltaY,
                        toLocal(canvas.getBoundingClientRect(), fr, ev.clientX, ev.clientY));
    }, { passive: false });
  }

  isPenSession() { return this.penSeen; }
  /** 팜 리젝션이 실제로 몇 번 발동했나(#22: 조용한 거부는 관측 불가를 만든다) */
  palmStats() { return this.palm.stats(); }
  /** 펜이 지금 화면에 닿아 있는가(G-2) */
  get penTouching(): boolean { return this.palm.penTouching; }

  private palm = new PalmGate();

  // (a) 마우스·펜 1급. 터치는 제스처(잉크 제외). 펜 감지 세션에선 터치=팜 → 확정 배제.
  private inkable(e: PointerEvent): boolean {
    if (e.pointerType === "pen") { if (!this.penSeen) { this.penSeen = true; this.opts.onInputMode?.(true); } return true; }
    if (e.pointerType === "mouse") return !this.opts.cameraMouse?.();
    return false;   // touch: 잉크 아님(펜 세션=팜 리젝션, 비펜 세션=제스처 예약)
  }

  /**
   * **잉크가 아닌 포인터를 카메라로 보낸다**(G). 보냈으면 `true` — 호출자는 거기서 멈춘다.
   *
   * 터치는 `PalmGate`를 지난다(G-2). 마우스는 궤도 모드일 때만 온다.
   * 펜은 여기서 **접촉 상태만 갱신**하고(팜 리젝션의 입력) 잉크로 내려간다.
   */
  private routeCamera(e: PointerEvent, phase: "down" | "move" | "up" | "cancel"): boolean {
    if (e.pointerType === "pen") {
      if (phase === "down") {
        // 펜이 이긴다 — 진행 중인 제스처를 취소하고 그 손가락들을 계속 막는다
        for (const t of this.palm.penDown(e.pointerId))
          this.opts.onCamera?.(t, "cancel", [0, 0]);
      } else if (phase === "up" || phase === "cancel") this.palm.penUp(e.pointerId);
      return false;
    }
    if (e.pointerType === "touch") {
      const go = this.palm.touch(e.pointerId, phase);
      if (go === "forward" && this.opts.onCamera) {
        e.preventDefault();
        this.opts.onCamera(e.pointerId, phase, this.localRaw(e));
      }
      return true;                       // 터치는 **어느 쪽이든 잉크가 아니다**
    }
    if (e.pointerType === "mouse" && this.opts.cameraMouse?.() && this.opts.onCamera) {
      e.preventDefault();
      this.opts.onCamera(e.pointerId, phase, this.localRaw(e));
      return true;
    }
    return false;
  }

  // (b) coalesced events — pen/touch만 유효(고주파). 마우스는 이벤트율 낮아 무의미 → 단일 이벤트.
  private movePoints(e: PointerEvent): PointerEvent[] {
    if (e.pointerType === "mouse") return [e];
    const co = e.getCoalescedEvents?.();
    return co && co.length ? co : [e];
  }

  size() { const f = this.frameNow(); return { w: f.cssW, h: f.cssH }; }

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

  /**
   * 포인터 → **CSS 픽셀 로컬 좌표**. 변환은 `canvasFrame` 한 군데에 있다.
   * **여기서 dpr을 곱하지 않는다** — 그리기 변환이 이미 그 일을 한다(이 버그의 원인이었다).
   */
  private local(e: PointerEvent): [number, number] {
    const frame: CanvasFrame = this.frameNow();
    const p = toLocal(this.canvas.getBoundingClientRect(), frame, e.clientX, e.clientY);
    // **화면 팬을 되돌려 문서 좌표로**(항목 5) — 표시는 redraw가 같은 훅으로 더한다.
    // ⚠ 카메라 경로는 `localRaw`를 쓴다 — 제스처는 표시 공간의 이동량이고, 여기서 빼면
    // 팬이 쌓일수록 보고 좌표가 뒤로 밀리는 **되먹임**이 생긴다(view_pan 팔이 잡았다)
    const off = this.opts.viewOffset?.() ?? [0, 0];
    const s = this.opts.viewScale?.() ?? 1;
    return [(p[0] - off[0]) / s, (p[1] - off[1]) / s];
  }

  /** 포인터 → 표시 좌표(팬 미적용) — 카메라 제스처 전용. */
  private localRaw(e: PointerEvent): [number, number] {
    const frame: CanvasFrame = this.frameNow();
    return toLocal(this.canvas.getBoundingClientRect(), frame, e.clientX, e.clientY);
  }

  /** 지금 프레임. 크기가 바뀌었으면 **그 자리에서 다시 맞춘다**(입력도 그리기도 같은 값을 본다). */
  private frameNow(): CanvasFrame {
    const r = ensureFit(this.canvas, this.frame_);
    if (r.changed) this.frame_ = r.frame;
    return this.frame_ ?? r.frame;
  }

  // 점 = [x, y, t, pressure, tiltX, tiltY] (§5.3). 마우스는 pressure 상수·tilt 0(파서 무관).
  private sample(e: PointerEvent, t: number): number[] {
    const [x, y] = this.local(e);
    return [x, y, t, e.pressure || 0.5, e.tiltX || 0, e.tiltY || 0];
  }

  private dragging = false;

  private onDown = (e: PointerEvent) => {
    // **라우팅이 먼저다**(G) — 잉크가 진행 중이어도 터치는 카메라 문(`PalmGate`)을 지나야 한다.
    // 여기서 걸러야 손바닥이 카메라를 돌리는 것을 막을 수 있다(G-2).
    if (this.routeCamera(e, "down")) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      return;
    }
    if (this.drawing || this.dragging) return; // 멀티터치/멀티펜 방어: 한 번에 하나
    if (!this.inkable(e)) return;
    // **모델링 화면에서는 잉크가 막힌다**(14차 항목 6-e) — 획이 아예 시작되지 않는다
    if (this.opts.inkAllowed && !this.opts.inkAllowed()) {
      this.opts.onInkBlocked?.();
      return;
    }
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    if (this.opts.dragMode?.(this.local(e))) {
      this.dragging = true; this.activeId = e.pointerId;
      this.opts.onDrag?.(this.local(e), "down");
      return;
    }
    this.drawing = true;
    this.activeId = e.pointerId;
    this.t0 = performance.now();
    this.pts = [this.sample(e, 0)];
  };

  private onMove = (e: PointerEvent) => {
    if (this.routeCamera(e, "move")) return;
    if (this.dragging && e.pointerId === this.activeId) {
      e.preventDefault();
      this.opts.onDrag?.(this.local(e), "move");
      return;
    }
    if (!this.drawing) {
      // 떠 있는 커서 — 스냅 표식을 미리 보인다(L-B.3). 잉크가 막힌 화면에서는 표식도 없다
      if (this.opts.onHover && this.inkable(e)
          && (this.opts.inkAllowed ? this.opts.inkAllowed() : true)) {
        this.opts.onHover(this.local(e));
      }
      return;
    }
    if (e.pointerId !== this.activeId || !this.inkable(e)) return;
    e.preventDefault();
    const from = this.pts.length - 1;   // 이번 move의 이어그릴 시작점
    for (const c of this.movePoints(e)) this.pts.push(this.sample(c, performance.now() - this.t0));
    if (this.opts.onLive) this.opts.onLive(this.pts);      // 호출자가 `redraw()`를 부른다
    else this.drawLive(Math.max(0, from));
  };

  private onUp = (e: PointerEvent) => {
    if (this.routeCamera(e, e.type === "pointercancel" ? "cancel" : "up")) return;
    if (this.dragging && e.pointerId === this.activeId) {
      this.dragging = false; this.activeId = null;
      this.opts.onDrag?.(this.local(e), "up");
      return;
    }
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

  /**
   * 라이브 미리보기 — **시작점에서 지금 커서까지의 직선**(계획서 §1.1).
   *
   * ⚠ 옛 판은 `from..끝` 구간만 이어 그렸다(증분). **직선은 증분으로 그릴 수 없다** —
   * 커서가 움직이면 앞서 그린 직선을 지워야 하므로 **전체를 다시 그린다.**
   * (`onLive`를 준 호출자는 어차피 `redraw()`를 부르므로 이 경로를 안 탄다.)
   */
  private drawLive(_from: number) {
    if (this.pts.length < 2) return;
    this.redraw();
  }

  /**
   * **획 하나가 그리는 직선** — 시작점과 끝점 둘뿐이다(계획서 §1.1: 손떨림은 버린다).
   * `pts2d`는 계속 보존하므로 나중에 프리핸드로 돌아갈 때 여기만 되돌리면 된다.
   */
  private strokeLine(p: number[][]) {
    if (p.length < 2) return;
    const a = p[0], b = p[p.length - 1];
    this.ctx.beginPath();
    this.ctx.moveTo(a[0], a[1]);
    this.ctx.lineTo(b[0], b[1]);
    this.ctx.stroke();
  }

  /** 백버퍼·변환을 지금 크기에 맞춘다. 실제 배율은 `canvasFrame`이 정한다. */
  resize() {
    const r = ensureFit(this.canvas, null);
    this.frame_ = r.frame;
    this.redraw();
  }

  /** 진행 중인 획(L-B.4). 비어 있으면 그리는 중이 아니다. */
  livePoints(): number[][] { return this.drawing ? this.pts : []; }

  /** 지금 프레임(진단용). */
  frameInfo(): CanvasFrame { return this.frameNow(); }

  /**
   * **전부 CSS 픽셀로 그린다.** 배율은 `canvasFrame`의 변환 하나뿐이다 —
   * 여기서 `* dpr`을 하면 **두 번 곱해져 잉크가 dpr배 어긋난다**(이 파일의 옛 버그).
   */
  redraw() {
    const frame = this.frameNow();
    this.ctx.clearRect(0, 0, frame.cssW, frame.cssH);   // 변환이 걸려 있으므로 CSS 크기다
    // **화면 팬**(항목 5) — 문서 좌표로 그려진 모든 것(배경 층·힌트·잉크)이 함께 밀린다.
    // 카메라 쪽은 stage가 같은 오프셋으로 주점을 옮긴다(setViewPan) — 두 층이 같이 간다
    const off = this.opts.viewOffset?.() ?? [0, 0];
    const zs = this.opts.viewScale?.() ?? 1;
    this.ctx.save();
    this.ctx.translate(off[0], off[1]);
    this.ctx.scale(zs, zs);                             // **화면 줌**(항목 5) — 종이 확대
    if (this.opts.onBackground) {
      this.ctx.save();
      this.opts.onBackground(this.ctx);
      this.ctx.restore();
    }
    // 투시 정합 힌트: 평면 폴리곤을 옅게(§3.2)
    if (this.frame === "persp") {
      this.ctx.strokeStyle = "rgba(30,120,170,0.28)";
      this.ctx.setLineDash([6, 4]);
      this.ctx.lineWidth = 1.5;
      for (const fp of this.hintFootprints) {
        if (fp.length < 2) continue;
        this.ctx.beginPath();
        fp.forEach(([x, y], i) => (i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y)));
        this.ctx.closePath();
        this.ctx.stroke();
      }
      this.ctx.setLineDash([]);
    }
    // 프레임 확정 획 + **진행 중인 획**(전체 다시 그리기 경로에서 사라지면 안 된다)
    this.ctx.strokeStyle = this.opts.color ?? "#111";
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    // **그리는 도중에도 직선이 보인다** — 시작점에서 커서까지(§1.1 · 사람 지시 2-a·d).
    // 놓으면 그 직선이 그대로 확정되므로 **미리보기와 결과가 어긋날 여지가 없다.**
    // ⚠ **스냅 미리보기가 걸려 있으면 원시 직선은 숨긴다**(5차 지시 4) — 두 선이 보이면
    // 어느 것이 확정될지 헷갈린다. 스냅된 선만 보이고, 자유 선일 때만 궤적이 미리보기다
    if (this.drawing && !this.opts.liveHidden?.()) this.strokeLine(this.pts);
    for (const s of this.strokes[this.frame]) this.strokeLine(s.points);
    this.ctx.restore();                                 // 화면 팬 변환 해제(항목 5)
  }
}
