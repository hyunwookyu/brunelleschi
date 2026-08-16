// **입력 라우팅**(2026-08-17 사람 지시 G) — 제스처 해석과 팜 리젝션을 잠근다.
//
// 잠그는 것:
//   G-3  손가락 1 = 궤도 · 2 = 팬·줌 (SketchUp for iPad · Shapr3D 선례)
//   G-2  펜이 닿아 있는 동안 터치를 버린다 — **동작점 둘**(#12):
//        ① 펜 접촉 중 시작한 터치 ② **펜을 뗀 뒤에도 남아 있는 터치**
//   튐    1↔2 손가락 전환에서 카메라가 안 튄다
//   죽은 구간  톡 누르는 것으로 확정 시점이 안 풀린다
//
// ⚠ **대조군을 함께 둔다**(#6) — "터치가 카메라를 안 움직였다"는 팜 리젝션의 증거가 아니다.
// **펜 없이 같은 입력을 넣으면 움직인다**를 같은 파일에서 낸다. 그것이 없으면
// "터치가 원래 안 먹는 것"과 구분이 안 된다.
import { describe, it, expect } from "vitest";
import { CamGestures, GESTURE_TOL, type OrbitApi } from "../src/capture/camGesture.js";
import { PalmGate } from "../src/capture/palmGate.js";

const H = 800;   // 뷰 높이(회전 환산의 분모 — three와 같은 규약)

/** 부른 것을 그대로 적는 가짜 컨트롤. 카메라 수학은 three의 것이고 여기서 안 잰다. */
function spy() {
  const log: { op: string; a: number; b?: number }[] = [];
  const api: OrbitApi = {
    rotateLeft: (a) => log.push({ op: "rotateLeft", a }),
    rotateUp: (a) => log.push({ op: "rotateUp", a }),
    pan: (a, b) => log.push({ op: "pan", a, b }),
    dollyIn: (a) => log.push({ op: "dollyIn", a }),
    dollyOut: (a) => log.push({ op: "dollyOut", a }),
  };
  return { log, api, sum: (op: string) => log.filter(l => l.op === op).reduce((s, l) => s + l.a, 0) };
}

function rig(canBegin = true) {
  const s = spy();
  let begins = 0, changes = 0, ends = 0;
  const g = new CamGestures({
    begin: () => { begins++; return canBegin; },
    controls: () => s.api,
    height: () => H,
    changed: () => { changes++; },
    ended: () => { ends++; },
  });
  return { g, s, stat: () => ({ begins, changes, ends }) };
}

/** 죽은 구간을 넘긴 뒤 관심 있는 이동을 준다 — 매 시험이 같은 준비를 지난다. */
const D = GESTURE_TOL.dead_px + 1;

describe("제스처 → 카메라 (G-3)", () => {
  it("손가락 하나는 **궤도**다 — 팬도 줌도 안 부른다", () => {
    const { g, s } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(1, "move", [100 + D, 100]);          // 죽은 구간 통과(기준 재설정)
    g.onPointer(1, "move", [100 + D + 80, 100 + 40]);
    expect(g.mode).toBe("rotate");
    expect(s.sum("rotateLeft")).toBeCloseTo((2 * Math.PI * 80) / H, 12);
    expect(s.sum("rotateUp")).toBeCloseTo((2 * Math.PI * 40) / H, 12);
    expect(s.log.some(l => l.op === "pan" || l.op.startsWith("dolly"))).toBe(false);
  });

  it("손가락 둘은 **팬과 줌**이다 — 궤도를 안 부른다", () => {
    const { g, s } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(2, "down", [200, 100]);               // 중점 [150,100] · 거리 100
    g.onPointer(1, "move", [110, 110]);
    g.onPointer(2, "move", [230, 110]);               // 중점 [170,110] · 거리 120
    expect(g.mode).toBe("pan_zoom");
    // 이동이 여러 사건으로 쪼개지므로 **팬은 합**, **줌은 곱**이 불변량이다
    const pan = s.log.filter(l => l.op === "pan");
    expect(pan.reduce((t, l) => t + l.a, 0)).toBeCloseTo(20, 12);    // 중점이 오른쪽으로 20
    expect(pan.reduce((t, l) => t + (l.b ?? 0), 0)).toBeCloseTo(10, 12);
    const zoom = s.log.filter(l => l.op === "dollyOut").reduce((t, l) => t * l.a, 1);
    expect(zoom).toBeCloseTo(120 / 100, 12);          // 벌리면 가까워진다
    expect(s.log.some(l => l.op.startsWith("rotate"))).toBe(false);
  });

  it("**두 손가락에는 죽은 구간이 없다** — 첫 이동부터 팬·줌이다", () => {
    // 이유: 손가락 둘을 얹는 것 자체가 이미 의도이고, 핀치는 작은 이동으로 시작한다
    const { g, s } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(2, "down", [200, 100]);
    g.onPointer(1, "move", [101, 100]);
    expect(s.log.length).toBeGreaterThan(0);
  });

  it("1↔2 전환에서 **카메라가 안 튄다** — 기준을 다시 잡는다", () => {
    const { g, s } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(1, "move", [100 + D, 100]);
    s.log.length = 0;
    g.onPointer(2, "down", [500, 400]);               // 중점이 멀리 뛴다
    expect(s.log.length).toBe(0);                     // ⚠ 얹는 것만으로는 아무 일도 없다
    g.onPointer(1, "move", [100 + D + 10, 100]);      // 중점은 5만 움직인다
    const pan = s.log.filter(l => l.op === "pan");
    expect(pan[0].a).toBeCloseTo(5, 12);
    // 반례: 기준을 안 다시 잡으면 여기서 수백 px 팬이 나온다
    expect(Math.abs(pan[0].a)).toBeLessThan(50);
  });

  it("손가락 하나를 떼면 **남은 하나로 궤도**가 이어진다(튀지 않는다)", () => {
    const { g, s } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(2, "down", [200, 100]);
    g.onPointer(1, "move", [110, 100]);
    s.log.length = 0;
    g.onPointer(2, "up", [200, 100]);
    expect(s.log.length).toBe(0);
    g.onPointer(1, "move", [130, 100]);               // 20px만 돈다
    expect(s.sum("rotateLeft")).toBeCloseTo((2 * Math.PI * 20) / H, 12);
  });

  it("**죽은 구간** — 톡 누르는 것으로는 카메라가 안 열린다", () => {
    const { g, s, stat } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(1, "move", [100 + GESTURE_TOL.dead_px - 1, 100]);
    g.onPointer(1, "up", [100 + GESTURE_TOL.dead_px - 1, 100]);
    expect(stat().begins).toBe(0);                    // 확정 시점이 안 풀린다
    expect(s.log.length).toBe(0);
    // 양성 채널(#30): 같은 하네스에서 죽은 구간을 넘기면 열린다
    const b = rig();
    b.g.onPointer(1, "down", [100, 100]);
    b.g.onPointer(1, "move", [100 + D, 100]);
    b.g.onPointer(1, "move", [100 + D + 10, 100]);
    expect(b.stat().begins).toBe(1);
    expect(b.s.log.length).toBeGreaterThan(0);
  });

  it("`begin()`이 거부하면 **카메라를 한 번도 안 만진다**(3D가 없을 때)", () => {
    const { g, s, stat } = rig(false);
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(1, "move", [100 + D, 100]);
    g.onPointer(1, "move", [300, 300]);
    expect(s.log.length).toBe(0);
    expect(stat().begins).toBeGreaterThan(0);         // 물어보긴 했다(미실행이 아니다, #32)
  });

  it("휠은 방향대로 준다 — 위로 굴리면 가까워진다", () => {
    const { g, s } = rig();
    g.onWheel(-100);
    g.onWheel(100);
    expect(s.log.map(l => l.op)).toEqual(["dollyIn", "dollyOut"]);
    expect(s.log[0].a).toBeCloseTo(Math.pow(GESTURE_TOL.wheel_base, 1), 12);
  });

  it("`reset()`은 진행 중인 것을 버린다 — 펜이 내려왔을 때", () => {
    const { g, s } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(1, "move", [100 + D, 100]);
    g.reset();
    s.log.length = 0;
    g.onPointer(1, "move", [300, 300]);               // 버려진 포인터의 이동
    expect(s.log.length).toBe(0);
    expect(g.fingers).toBe(0);
  });

  it("손가락이 다 떨어지면 `ended()`가 한 번 온다", () => {
    const { g, stat } = rig();
    g.onPointer(1, "down", [100, 100]);
    g.onPointer(2, "down", [200, 100]);
    g.onPointer(1, "up", [100, 100]);
    expect(stat().ends).toBe(0);
    g.onPointer(2, "up", [200, 100]);
    expect(stat().ends).toBe(1);
  });
});

describe("팜 리젝션 — 카메라 쪽 (G-2)", () => {
  it("**동작점 ①** 펜이 닿아 있는 동안 시작한 터치를 버린다", () => {
    const p = new PalmGate();
    p.penDown(1);
    expect(p.touch(10, "down")).toBe("drop");
    expect(p.touch(10, "move")).toBe("drop");
    expect(p.stats().rejected_down).toBe(1);
  });

  it("**대조군**(#6) — 펜이 없으면 같은 터치가 카메라로 간다", () => {
    const p = new PalmGate();
    expect(p.touch(10, "down")).toBe("forward");
    expect(p.touch(10, "move")).toBe("forward");
    expect(p.stats().forwarded_down).toBe(1);
  });

  it("**동작점 ②** 펜을 뗀 뒤에도 남아 있는 터치는 계속 버린다", () => {
    const p = new PalmGate();
    p.penDown(1);
    p.touch(10, "down");
    p.penUp(1);
    // ⚠ 여기서 풀어 주면 **쉬고 있던 손바닥이 펜을 떼는 순간 궤도가 된다**
    expect(p.touch(10, "move")).toBe("drop");
    expect(p.touch(10, "up")).toBe("drop");
    expect(p.stats().held_after_pen_up).toBe(1);
    // 그 손바닥이 떨어진 뒤 **새 터치는 통과한다** — 막힘이 영구적이지 않다
    expect(p.touch(11, "down")).toBe("forward");
  });

  it("펜이 **나중에** 내려오면 진행 중인 제스처를 취소한다 — 펜이 이긴다", () => {
    const p = new PalmGate();
    p.touch(10, "down");
    p.touch(11, "down");
    expect(p.liveTouches).toBe(2);
    expect(p.penDown(1).sort()).toEqual([10, 11]);    // 호출자가 이 목록을 제스처에 알린다
    expect(p.liveTouches).toBe(0);
    expect(p.touch(10, "move")).toBe("drop");
    expect(p.stats().cancelled_by_pen).toBe(2);
  });

  it("펜이 여럿이어도(멀티펜) 마지막 하나가 떨어져야 풀린다", () => {
    const p = new PalmGate();
    p.penDown(1); p.penDown(2);
    p.penUp(1);
    expect(p.penTouching).toBe(true);
    expect(p.touch(10, "down")).toBe("drop");
    p.penUp(2);
    expect(p.penTouching).toBe(false);
    expect(p.touch(11, "down")).toBe("forward");
  });
});
