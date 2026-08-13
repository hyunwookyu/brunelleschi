// 4.3 — 세션 내보내기 포맷. Python 분석 경로(stage0/10·12)가 이 JSON을 그대로 받는다.
import { describe, it, expect } from "vitest";
import { emptyIR } from "../src/parser/types.js";
import type { Stroke } from "../src/parser/types.js";
import { buildSession, validateSession, toJSON, SESSION_FORMAT_VERSION } from "../src/ui/sessionExport.js";

function stroke(seq: number, frame: "plan" | "persp" = "plan"): Stroke {
  return { points: [[0, 0, 0, 0.5, 0, 0], [10, 0, 5, 0.5, 3, -2], [10, 8, 9, 0.5, 0, 0]],
           pen: "mass", frame, seq };
}
const base = { strokes: [stroke(0), stroke(1, "persp")], ir: emptyIR(),
               canvas: { w: 800, h: 600 }, inputMode: "마우스/펜", penSeen: false,
               now: new Date("2026-08-14T00:00:00Z") };

describe("4.3 세션 내보내기", () => {
  it("유효한 세션은 오류 0", () => {
    expect(validateSession(buildSession(base))).toEqual([]);
  });

  it("§5.3 6튜플과 seq를 보존한다", () => {
    const s = buildSession(base);
    expect(s.strokes[0].points[1]).toEqual([10, 0, 5, 0.5, 3, -2]);   // tilt 포함
    expect(s.strokes.map(x => x.seq)).toEqual([0, 1]);
  });

  it("펜/마우스 구분을 반드시 담는다(4.4 노이즈 모델 분리 판단 근거)", () => {
    const s = buildSession({ ...base, penSeen: true });
    expect(s.input.penSeen).toBe(true);
    const broken: any = { ...s, input: undefined };
    expect(validateSession(broken).some(e => e.includes("penSeen"))).toBe(true);
  });

  it("두 프레임 획이 모두 들어가고 frame으로 구분된다", () => {
    const s = buildSession(base);
    expect(s.strokes.map(x => x.frame)).toEqual(["plan", "persp"]);
  });

  it("결함 있는 세션을 잡는다", () => {
    const s = buildSession(base);
    expect(validateSession({ ...s, strokes: [{ points: [[0, 0]], pen: "mass", seq: 0 }] as any }).length)
      .toBeGreaterThan(0);
    expect(validateSession({ ...s, canvas: { w: 0, h: 0 } }).some(e => e.includes("canvas"))).toBe(true);
  });

  it("JSON 왕복이 안전하다", () => {
    const s = buildSession(base);
    const back = JSON.parse(toJSON(s));
    expect(back.version).toBe(SESSION_FORMAT_VERSION);
    expect(validateSession(back)).toEqual([]);
  });
});
