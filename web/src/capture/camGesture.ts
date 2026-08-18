// **터치 제스처 → 카메라**(2026-08-17 사람 지시 G). 계획서 §10.3의 단일 뷰포트에서
// 잉크 캔버스가 three 캔버스를 덮고 있으므로 **터치가 `OrbitControls`까지 안 내려간다**.
//
// 후보 셋 중 **③ 제스처 직접 처리**를 골랐다(측정: `stage0/out/touch_route.json`).
// 다만 **카메라를 직접 계산하지 않는다** — `OrbitControls`의 **공개 API**(`rotateLeft` ·
// `rotateUp` · `pan` · `dollyIn` · `dollyOut`)를 부른다. 그러면
//   · 궤도 중심(`target`) · 감쇠 · 각도 한계 · 구면 좌표가 **한 군데에만 있다**
//   · 우리가 짤 것은 **제스처 해석**뿐이고 카메라 수학은 선례 그대로다(A-3)
// 즉 "직접 처리"는 **이벤트 라우팅**을 직접 하는 것이지 궤도를 다시 짜는 것이 아니다.
//
// ⚠ HANDOFF는 이 후보의 함정으로 "three 최신판은 `rotateLeft` 같은 공개 API가 없다"를
// 적어 뒀는데 **three r185에서는 있다**(`OrbitControls.js`의 `pan`·`dollyIn`·`dollyOut`·
// `rotateLeft`·`rotateUp`). 계획과 실제가 어긋나면 실제를 따른다(#23).
//
// **환산은 three가 쓰는 그것과 같게 둔다** — `_handleTouchMoveRotate`가
// `2π·Δx / element.clientHeight`이고 팬은 픽셀 그대로, 핀치는 `거리비`다.
// 같은 값을 쓰면 손끝의 감이 데스크톱 궤도와 어긋나지 않는다.

/** `OrbitControls`가 내는 공개 API 중 우리가 쓰는 것만. three를 안 들여도 시험할 수 있게 좁혔다. */
export interface OrbitApi {
  rotateLeft(angle: number): void;
  rotateUp(angle: number): void;
  pan(dx: number, dy: number): void;
  dollyIn(scale: number): void;
  dollyOut(scale: number): void;
}

/**
 * **제스처 감도**. `test/constants.ts`(SHARED_CONSTANTS)에 **넣지 않는다** —
 * D-L49가 표시 상수에 준 예외와 같은 자리다: 이 값들은 **조작 감도**이지 측정 임계가 아니고,
 * 어떤 원장의 결론도 이 값에 안 걸린다(`touch_route.json`은 "움직인다/안 움직인다"를 잰다).
 * 대신 **원장이 이 값을 자기 안에 함께 적는다** — 수치를 읽는 사람이 출처를 본다.
 * ⚠ 전역 해시가 하나뿐이라 여기 넣으면 **무관한 원장 40여 개가 전부 STALE**이 된다(DEFERRED).
 */
export const GESTURE_TOL = {
  /** three의 `rotateSpeed` 기본값과 같다. 1 = 화면 높이만큼 끌면 한 바퀴 */
  rotate_speed: 1.0,
  /** three의 `panSpeed` 기본값과 같다(픽셀 그대로) */
  pan_speed: 1.0,
  /** 휠 한 칸의 배율 밑 — three `_getZoomScale`의 0.95 그대로 */
  wheel_base: 0.95,
  /** 이만큼(css px) 이상 움직여야 카메라가 열린다. 톡 누르는 것으로 확정 시점이 풀리면 안 된다 */
  dead_px: 3,
} as const;

const TWO_PI = Math.PI * 2;

/** 제스처가 카메라를 만질 자리. 앱이 준다. */
export interface CamGestureHost {
  /**
   * **카메라를 움직여도 되는가.** 확정 카메라에 물려 있으면 **여기서 푼다**(핀 해제) —
   * `궤도` 버튼이 하던 그 일이고, 손가락이 그 버튼을 대신한다.
   * `false`면 제스처를 통째로 버린다(3D가 아직 없는 동안).
   */
  begin(): boolean;
  /** 지금 조작할 컨트롤. 없으면 제스처를 버린다 */
  controls(): OrbitApi | null;
  /** 회전 환산의 분모 — three와 같은 규약(뷰의 **높이**, css px) */
  height(): number;
  /** 무언가 바뀌었다(다시 그린다) */
  changed(): void;
  /** 손가락이 전부 떨어졌다 */
  ended?(): void;
  /**
   * **화면 팬**(2026-08-18 10차 항목 5) — 두 손가락 이동을 **종이 밀기**로 받겠는가.
   * 참을 돌려 주면 카메라를 **열지 않는다**(핀도 안 푼다 — 공간은 불변이다).
   * 확정 시점(그리는 중)에서 참, 궤도로 풀린 뒤에는 거짓 — 그때는 공간 팬(기존)이다.
   * 선례: 종이 스케치 앱(프로크리에이트)의 두 손가락 = 종이 이동.
   */
  screenPan?(dx: number, dy: number): boolean;
}

export type Phase = "down" | "move" | "up" | "cancel";
export type Mode = "none" | "rotate" | "pan_zoom";

/**
 * **손가락 하나 = 궤도 · 둘 = 팬·줌**(G-3).
 *
 * **선례를 따랐다**(A-3): SketchUp for iPad가 *one finger swipe = orbit · two finger = pan ·
 * pinch = zoom*이고 Shapr3D도 같다. 사람 지시의 목표 동작과도 같다.
 * 손가락 하나를 팬으로 두는 선례(지도 앱)는 **3D 도구에는 없다** — 3D에서 가장 잦은 조작이
 * 궤도이기 때문이다.
 */
export class CamGestures {
  private pts = new Map<number, [number, number]>();
  /** 기준점 — 1손가락은 그 점, 2손가락은 중점과 거리 */
  private ref: [number, number] = [0, 0];
  private refDist = 1;
  /** `begin()`이 통과했는가. 손가락이 다 떨어질 때까지 유지한다 */
  private live = false;
  /** 죽은 구간을 넘었는가(`dead_px`) */
  private moved = false;
  private start: [number, number] = [0, 0];

  constructor(private host: CamGestureHost) {}

  get mode(): Mode {
    return this.pts.size === 0 ? "none" : this.pts.size === 1 ? "rotate" : "pan_zoom";
  }
  get fingers(): number { return this.pts.size; }
  get active(): boolean { return this.live && this.moved; }

  /** 포인터 하나의 사건. 좌표는 **css 픽셀**(`canvasFrame` 단일 출처를 지난 값)이다. */
  onPointer(id: number, phase: Phase, p: [number, number]): void {
    if (phase === "down") {
      // ⚠ **죽은 구간은 첫 손가락에서만 잰다** — 두 번째 손가락에서 다시 재면
      // 핀치가 죽은 구간에 걸리고 1↔2 전환이 매번 처음부터 시작한다(시험이 잡았다).
      const first = this.pts.size === 0;
      this.pts.set(id, p);
      if (first) { this.start = p; this.moved = false; }
      this.resync();
      return;
    }
    if (phase === "up" || phase === "cancel") {
      if (!this.pts.delete(id)) return;
      if (this.pts.size === 0) { this.live = false; this.moved = false; this.host.ended?.(); }
      else this.resync();          // 2 → 1로 줄 때 튀지 않게 기준을 다시 잡는다
      return;
    }
    if (!this.pts.has(id)) return;
    this.pts.set(id, p);
    this.apply();
  }

  /** 휠 — 데스크톱 확인용. 터치와 같은 문(`begin`)을 지난다. */
  onWheel(deltaY: number): void {
    if (!deltaY) return;
    const c = this.open();
    if (!c) return;
    const s = Math.pow(GESTURE_TOL.wheel_base, Math.abs(deltaY * 0.01));
    if (deltaY < 0) c.dollyIn(s); else c.dollyOut(s);
    this.host.changed();
  }

  /** 진행 중인 것을 버린다(펜이 내려왔을 때 등). 카메라는 지금 자리에 그대로 둔다. */
  reset(): void {
    this.pts.clear();
    this.live = false;
    this.moved = false;
  }

  /** 기준을 지금 손가락 배치로 다시 잡는다 — **카메라는 안 움직인다**(1↔2 전환의 튐 방지). */
  private resync(): void {
    const a = [...this.pts.values()];
    if (a.length === 1) { this.ref = a[0]; return; }
    if (a.length >= 2) {
      this.ref = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2];
      this.refDist = Math.max(1e-6, Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]));
    }
  }

  /** 카메라를 열어 준다. 아직 못 열면 `null` */
  private open(): OrbitApi | null {
    if (!this.live) {
      if (!this.host.begin()) return null;
      this.live = true;
    }
    return this.host.controls();
  }

  private apply(): void {
    const a = [...this.pts.values()];
    if (!a.length) return;
    // **죽은 구간** — 톡 누르는 것으로 확정 시점이 풀리면 안 된다(#12: 동작점을 하나 안 고른다).
    // **손가락 둘에는 안 건다** — 둘을 얹는 것 자체가 이미 카메라 조작의 의도이고,
    // 핀치는 작은 이동으로 시작한다.
    if (!this.moved) {
      if (this.pts.size >= 2) this.moved = true;
      else if (Math.hypot(a[0][0] - this.start[0], a[0][1] - this.start[1]) < GESTURE_TOL.dead_px) return;
      else { this.moved = true; this.resync(); return; }   // 죽은 구간만큼은 안 돌린다
    }
    const h = Math.max(1, this.host.height());
    if (a.length === 1) {
      const c = this.open();
      if (!c) return;
      const dx = (a[0][0] - this.ref[0]) * GESTURE_TOL.rotate_speed;
      const dy = (a[0][1] - this.ref[1]) * GESTURE_TOL.rotate_speed;
      c.rotateLeft((TWO_PI * dx) / h);       // three와 같은 규약 — 분모가 **높이**다
      c.rotateUp((TWO_PI * dy) / h);
      this.ref = a[0];
    } else {
      const mid: [number, number] = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2];
      const dist = Math.max(1e-6, Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]));
      // **화면 팬이 먼저 받는다**(항목 5) — 확정 시점(그리는 중)의 두 손가락은 종이를
      // 민다. 카메라(공간)는 안 열리고 핀도 안 풀린다 — 호스트가 거절하면(궤도 뒤)
      // 종전대로 공간 팬·핀치다. ⚠ `open()` 앞이어야 한다 — open이 begin으로 핀을 푼다.
      if (this.host.screenPan?.(mid[0] - this.ref[0], mid[1] - this.ref[1])) {
        this.ref = mid;
        this.refDist = dist;
        return;                              // 다시 그리기는 호스트(refresh)가 했다
      }
      const c = this.open();
      if (!c) return;
      c.pan((mid[0] - this.ref[0]) * GESTURE_TOL.pan_speed,
            (mid[1] - this.ref[1]) * GESTURE_TOL.pan_speed);
      // 벌리면(비 > 1) 가까워진다 — three의 `_handleTouchMoveDolly`와 같은 부호다
      c.dollyOut(dist / this.refDist);
      this.ref = mid;
      this.refDist = dist;
    }
    this.host.changed();
  }
}
