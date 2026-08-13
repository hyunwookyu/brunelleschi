// V-3 지연 예산 (§8) — 증분 파서 파트. 단일<30ms, 8볼륨 증분<80ms. p95.
import { describe, it, expect } from "vitest";
import type { Stroke, Capture } from "../src/parser/types.js";
import { IncrementalParser } from "../src/worker/incremental.js";

function rectStroke(x: number, y: number, w: number, h: number, seq: number): Stroke {
  const pts: number[][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number) => { for (let t = 0; t <= 1; t += 0.04) pts.push([ax + (bx - ax) * t, ay + (by - ay) * t, seq, 0.5]); };
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
  return { points: pts, pen: "mass", seq };
}
function p(arr: number[], q: number) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * q)]; }

describe("V-3 증분 파서 지연(§8 예산)", () => {
  it("단일 볼륨 획 추가 파싱 p95 < 30ms", () => {
    const times: number[] = [];
    for (let r = 0; r < 30; r++) {
      const parser = new IncrementalParser(800, 600);
      const t = performance.now();
      parser.addStroke(rectStroke(20, 20, 140, 100, 0)); parser.getIR();
      times.push(performance.now() - t);
    }
    expect(p(times, 0.95)).toBeLessThan(30);
  });

  it("8볼륨 증분(마지막 획 추가) p95 < 80ms", () => {
    const times: number[] = [];
    for (let r = 0; r < 20; r++) {
      const parser = new IncrementalParser(1600, 1000);
      for (let i = 0; i < 7; i++) { parser.addStroke(rectStroke((i % 4) * 220 + 20, Math.floor(i / 4) * 250 + 20, 140, 100, i)); }
      parser.getIR();                       // 7개 파싱·캐시
      const t = performance.now();
      parser.addStroke(rectStroke(3 * 220 + 20, 250 + 20, 140, 100, 7));   // 8번째(신규 그룹)
      parser.getIR();                       // 증분: 새 그룹만 파싱
      times.push(performance.now() - t);
    }
    expect(p(times, 0.95)).toBeLessThan(80);
    // 증분성: 마지막 추가로 재파싱 대상은 1(신규 그룹)뿐
  });
});
