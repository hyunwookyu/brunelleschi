// V-1 발화규칙 + 앵커 (§3.3, S2). 브라우저 규칙폴백 동작 확인(△).
import { describe, it, expect } from "vitest";
import type { IR, Volume } from "../src/parser/types.js";
import { emptyIR } from "../src/parser/types.js";
import { ruleOp, translate, renderOp } from "../src/parser/grammar.js";
import { applyOps } from "../src/parser/anchor.js";
import { ptp } from "../src/parser/geometry.js";

function irWithVol(): IR {
  const ir = emptyIR();
  const v: Volume = { id: "v1", footprint: [[0, 0], [100, 0], [100, 60], [0, 60]], base: 0, height: null, height_src: "unset", confidence: 0.9, label: "hall" };
  ir.volumes.push(v);
  return ir;
}

describe("V-1 발화규칙 → 앵커", () => {
  it('"한 12미터쯤" → range(width) → bbox 폭 ≈ 12 (S2)', () => {
    const ir = irWithVol();
    const op = ruleOp("홀 폭이 한 12미터쯤", ir)!;
    expect(op.op).toBe("range");
    expect(op.args.min).toBeCloseTo(10.8, 3);
    applyOps(ir, [op]);
    expect(ptp(ir.volumes[0].footprint.map(p => p[0]))).toBeCloseTo(12, 3);
    expect(ir.anchors.length).toBe(1);
  });

  it('"정확히 8미터 깊이" → set(depth) → bbox 깊이 = 8', () => {
    const ir = irWithVol();
    const op = ruleOp("정확히 8미터로 깊이를 잡을게요", ir)!;
    expect(op.op).toBe("set");
    expect(op.args.prop).toBe("depth");
    applyOps(ir, [op]);
    expect(ptp(ir.volumes[0].footprint.map(p => p[1]))).toBeCloseTo(8, 3);
  });

  it("지시어 → unresolved, 정정 → retract", () => {
    const ir = irWithVol();
    expect(ruleOp("여기 개구부는 나중에", ir)!.op).toBe("unresolved");
    ir.anchors.push({ target: "v1", prop: "width", value: 12, tol: 0, src: "x" });
    applyOps(ir, [{ op: "retract", args: { target: "v1" } }]);
    expect(ir.anchors.length).toBe(0);
  });

  it("앵커 하나로 전체 확정 — 무단위 footprint가 절대치수로", () => {
    const ir = irWithVol();
    applyOps(ir, translate(ir, [{ text: "폭 20미터" }]));
    expect(ptp(ir.volumes[0].footprint.map(p => p[0]))).toBeCloseTo(20, 3);
  });
});
