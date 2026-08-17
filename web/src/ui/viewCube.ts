// **뷰 큐브**(5차 지시 8) — CAD 뷰 큐브의 축소판.
//
// ```
// 면 클릭   좌/우 1/3 = 왼쪽/오른쪽 면으로 90° 스냅(애니메이션) ·
//           가운데 = 가장 가까운 90° 정렬로 스냅(8-a의 단순화 — 위/아래 면은 없다:
//           회전 축이 수직축 고정이라 피치를 바꾸는 면은 정의상 못 둔다, 8-b)
// 드래그    연속 요 회전(가로 이동 ∝ 각)
// 방향 표시  큐브가 카메라를 따라 돈다(8-e) — 정면(F)이 어디를 보는지 알려 준다
// 토글      기본 켬(8-d) — 하단바 접이식 메뉴
// ```
//
// 회전은 전부 `stage.spinYaw`(수직축 고정 · 중심 = 경계 상자 중심의 시선 투영 — 항목 2·8-c)를
// 지난다(#17 — 카메라 수학은 stage 하나).
import type { Vec3 } from "../s3d/geom3d.js";

export interface CubeHost {
  /** 지금 요(rad). */
  yaw(): number;
  /** 요 회전 — delta(rad), 애니메이션 ms(0이면 즉시). */
  spin(delta: number, ms: number): void;
  /** 큐브를 보일 것인가(카메라가 서고 3D가 있을 때). */
  visible(): boolean;
}

const TWO_PI = Math.PI * 2;
/** 각을 (−π, π]로 접는다. */
const wrap = (a: number): number => ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

export class ViewCube {
  /** 토글(8-d — 기본 켬). */
  on = true;
  private dragging = false;
  private moved = false;
  private lastX = 0;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement, private host: CubeHost) {
    canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true; this.moved = false; this.lastX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      if (!this.moved && Math.abs(dx) < 3) return;         // 클릭과 가르는 죽은 구간
      this.moved = true;
      this.lastX = e.clientX;
      // **드래그 = 연속 회전**(8-a). 부호: 오른쪽으로 끌면 장면이 오른쪽으로 돈다
      this.host.spin(-dx * 0.012, 0);
    });
    const up = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.moved) return;
      // **클릭 = 90° 스냅**(8-a). 좌/우 1/3 = 그 방향 면, 가운데 = 가장 가까운 90° 정렬
      const r = this.canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const yaw = this.host.yaw();
      let delta: number;
      if (fx < 1 / 3) delta = -Math.PI / 2;
      else if (fx > 2 / 3) delta = Math.PI / 2;
      else delta = wrap(Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) - yaw);
      if (Math.abs(delta) > 1e-6) this.host.spin(delta, 280);
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** 방향 표시(8-e) — 위에서 내려다본 정사각형이 요를 따라 돌고, F(정면)가 시선 반대쪽에 있다. */
  private draw(): void {
    const show = this.on && this.host.visible();
    this.canvas.classList.toggle("hidden", !show);
    if (!show) return;
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width, h = this.canvas.height;
    const cx = w / 2, cy = h / 2, r = w * 0.3;
    ctx.clearRect(0, 0, w, h);
    const yaw = this.host.yaw();
    // 위에서 본 정사각형(수직축 회전만 있으므로 평면 표시로 충분하다 — 피치는 안 바뀐다)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-yaw);
    ctx.strokeStyle = "#666"; ctx.lineWidth = 1.5;
    ctx.strokeRect(-r, -r, 2 * r, 2 * r);
    ctx.fillStyle = "#1a99aa";
    ctx.beginPath();                                   // 정면(F) 표식 — 남쪽 변 중앙
    ctx.arc(0, r, 4, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
    // 좌·우 화살표(클릭 영역 안내)
    ctx.fillStyle = "#999"; ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "left"; ctx.fillText("◀", 4, cy + 4);
    ctx.textAlign = "right"; ctx.fillText("▶", w - 4, cy + 4);
  }

  dispose(): void { cancelAnimationFrame(this.raf); }
}
