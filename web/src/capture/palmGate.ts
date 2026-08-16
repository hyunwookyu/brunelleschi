// **팜 리젝션을 카메라 쪽에도 건다**(2026-08-17 사람 지시 G-2).
//
// `InkCanvas.inkable()`이 터치를 **잉크에서** 이미 거부하고 있었다(펜 세션의 손바닥).
// 그런데 G에서 **터치가 카메라를 움직이게** 되므로, 막지 않으면 그림을 그리는 동안
// 손바닥이 화면에 닿아 **뷰가 돌아간다**. 잉크 쪽 거부는 그것을 안 막는다.
//
// **동작점이 둘이다**(#12 — 하나만 고르면 나머지가 새는 자리):
//   ① **펜이 닿아 있는 동안** 시작한 터치 → 버린다
//   ② **펜을 뗀 뒤에도 남아 있는 터치** → 그 터치가 떨어질 때까지 계속 버린다
// ②가 없으면 **쉬고 있던 손바닥이 펜을 떼는 순간 궤도가 된다.**
//
// 그리고 펜이 **터치보다 늦게** 내려올 수도 있다(손가락으로 돌리다가 그리기 시작).
// 그때는 진행 중인 제스처를 **취소**하고 그 손가락들을 ②로 넘긴다 — 펜이 이긴다.
//
// ⚠ **자가 치유·조용한 거부는 관측 불가를 만든다**(#22의 교훈) — 그래서 **센다**(`stats`).

export type TouchPhase = "down" | "move" | "up" | "cancel";

export interface PalmStats {
  /** 펜이 닿아 있어서 시작부터 거부된 터치 수 */
  rejected_down: number;
  /** 펜이 내려와서 취소된 진행 중 터치 수 */
  cancelled_by_pen: number;
  /** 펜을 뗀 뒤에도 남아 있어 계속 거부된 터치 수(동작점 ②가 실제로 발동한 횟수) */
  held_after_pen_up: number;
  /** 카메라로 흘러간 터치 수 */
  forwarded_down: number;
}

/** 펜 접촉과 터치를 가르는 문. 상태만 들고 있고 DOM을 모른다(그래서 node에서 잰다). */
export class PalmGate {
  private pens = new Set<number>();
  private live = new Set<number>();      // 카메라로 흘러가는 중인 터치
  private blocked = new Set<number>();   // 거부된 채 아직 안 떨어진 터치
  private s: PalmStats = { rejected_down: 0, cancelled_by_pen: 0,
                           held_after_pen_up: 0, forwarded_down: 0 };

  get penTouching(): boolean { return this.pens.size > 0; }
  get liveTouches(): number { return this.live.size; }
  stats(): PalmStats { return { ...this.s }; }

  /**
   * 펜이 닿았다. **취소해야 할 터치 id 목록**을 낸다 — 호출자가 제스처에 그것을 알린다.
   * 그 손가락들은 떨어질 때까지 ②로 막힌다.
   */
  penDown(id: number): number[] {
    this.pens.add(id);
    const cancel = [...this.live];
    for (const t of cancel) { this.live.delete(t); this.blocked.add(t); }
    this.s.cancelled_by_pen += cancel.length;
    return cancel;
  }

  /** 펜이 떨어졌다. **막힌 터치는 안 풀어 준다**(동작점 ②). */
  penUp(id: number): void { this.pens.delete(id); }

  /** 이 터치를 카메라로 보낼 것인가. */
  touch(id: number, phase: TouchPhase): "forward" | "drop" {
    if (phase === "down") {
      if (this.penTouching) { this.blocked.add(id); this.s.rejected_down++; return "drop"; }
      this.live.add(id); this.s.forwarded_down++; return "forward";
    }
    if (phase === "up" || phase === "cancel") {
      const wasBlocked = this.blocked.delete(id);
      // 펜이 이미 떨어졌는데도 막혀 있던 것 = 동작점 ②가 실제로 한 일
      if (wasBlocked && !this.penTouching) this.s.held_after_pen_up++;
      return this.live.delete(id) ? "forward" : "drop";
    }
    return this.live.has(id) ? "forward" : "drop";
  }
}
