// **호버에서 잠근 시작점 후보가 확정에서 그대로 쓰인다**(2026-08-19 15차 항목 4 · D-L103).
//
// 종단(`e2e/hover_lock.spec.ts`)이 앱 전체를 도는 팔이고, 여기서는 그 잠금을 받는
// 순수 함수(`resolve2dCore`의 `pinStart`)가 **의도한 것을 하는지**만 본다:
//   ① 잠금이 없으면 조리개 밖 질의점에서 시작점이 안 붙는다 (**반례** — 버그 그 자체)
//   ② 같은 질의점에 잠금을 주면 붙는다
//   ③ 잠금은 **시작점만** 정한다 — 끝점 질의는 그대로 돈다
//   ④ 잠금이 있어도 좌표는 **후보의 자리**로 간다(질의점이 아니다)
import { describe, it, expect } from "vitest";
import { resolve2dCore, OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { static2dCandidates } from "../src/s3d/snap2d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const SEGS = [{ id: "s1", a: [300, 500] as Pt2, b: [500, 470] as Pt2 }];
const CANDS = static2dCandidates(SEGS, 1000);
const CTX = { cands: CANDS, vps: [], radiusPx: OSNAP_RADIUS_PX, relSnap: false, segs: SEGS };

/** `s1`의 끝점 후보(잠금에 넣을 것). */
const tip = CANDS.find(c => c.kind === "endpoint"
                         && Math.hypot(c.at[0] - 500, c.at[1] - 470) < 1e-9)!;

describe("호버 잠금(pinStart)", () => {
  it("① 잠금이 없으면 조리개 밖 착지에서 시작점이 안 붙는다 (반례 — 수리 전 거동)", () => {
    const r = resolve2dCore([[511, 476], [640, 520]], CTX);
    expect(r.start2).toBeNull();
  });

  it("② 같은 착지점에 잠금을 주면 그 후보로 시작한다", () => {
    const r = resolve2dCore([[511, 476], [640, 520]], { ...CTX, pinStart: tip });
    expect(r.start2).not.toBeNull();
    expect(r.start2!.kind).toBe("endpoint");
    expect(r.start2!.ofId).toBe("s1");
  });

  it("③ 잠금은 시작점만 정한다 — 끝점 질의는 그대로 돈다", () => {
    // 끝을 `s1`의 반대쪽 끝점(300,500) 조리개 안으로 보낸다
    const r = resolve2dCore([[511, 476], [302, 501]], { ...CTX, pinStart: tip });
    expect(r.start2!.ofId).toBe("s1");
    expect(r.end2).not.toBeNull();
    expect(r.end2!.kind).toBe("endpoint");
    expect(Math.hypot(r.end2!.at[0] - 300, r.end2!.at[1] - 500)).toBeLessThan(1e-9);
  });

  it("④ 좌표는 후보의 자리로 간다 — 질의점이 아니다", () => {
    const r = resolve2dCore([[511, 476], [640, 520]], { ...CTX, pinStart: tip });
    expect(Math.hypot(r.a[0] - 500, r.a[1] - 470)).toBeLessThan(1e-9);
    // 잠금이 없으면 그 자리에 안 간다(같은 질의점) — 대비를 여기서 낸다
    const off = resolve2dCore([[511, 476], [640, 520]], CTX);
    expect(Math.hypot(off.a[0] - 500, off.a[1] - 470)).toBeGreaterThan(10);
  });

  it("⑤ 잠금 후보가 조리개 안이어도 결과가 같다 — 잠금이 판정을 바꾸지 않는다", () => {
    const raw: Pt2[] = [[503, 472], [640, 520]];
    const a = resolve2dCore(raw, CTX);
    const b = resolve2dCore(raw, { ...CTX, pinStart: tip });
    expect(a.start2!.kind).toBe(b.start2!.kind);
    expect(a.a).toEqual(b.a);
  });
});
