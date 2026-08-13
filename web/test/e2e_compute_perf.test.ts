// V-4 end-to-end 지연(판정 A) — compute 경로 전체를 Node에서 결정론적 측정(브라우저 스로틀 무관).
// 구간: 획 → 증분파서 → IR → 수동앵커 → buildScene → 지오메트리 생성(objectFromSpec).
// 제외: GPU 드로우·rAF 스케줄(브라우저 전용, V-8 Playwright + 아래 §8 계상). three 지오메트리는
// Node에서 생성됨(three_adapter.test와 동일) → GPU 업로드만 빠짐.
import { describe, it, expect } from "vitest";
import type { Stroke } from "../src/parser/types.js";
import { IncrementalParser } from "../src/worker/incremental.js";
import { buildScene } from "../src/scene/sceneBuilder.js";
import { objectFromSpec } from "../src/scene/threeAdapter.js";
import { ManualAnchorStore } from "../src/ui/manualAnchor.js";

function rectStroke(x: number, y: number, w: number, h: number, seq: number): Stroke {
  const pts: number[][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number) => { for (let t = 0; t <= 1; t += 0.04) pts.push([ax + (bx - ax) * t, ay + (by - ay) * t, seq, 0.5]); };
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
  return { points: pts, pen: "mass", frame: "plan", seq };
}
function pct(a: number[], q: number) { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; }

// N번째 획(=N볼륨 시점 증분)의 compute 지연 분포.
function measure(N: number, reps: number): { p50: number; p95: number } {
  const anchors = new ManualAnchorStore();
  const samples: number[] = [];
  // JIT 워밍업
  for (let w = 0; w < 5; w++) { const p = new IncrementalParser(1600, 1000); p.addStroke(rectStroke(40, 40, 240, 180, 0)); buildScene(anchors.apply(p.getIR())).forEach(objectFromSpec); }
  for (let r = 0; r < reps; r++) {
    const parser = new IncrementalParser(1600, 1000);
    for (let i = 0; i < N - 1; i++) { parser.addStroke(rectStroke((i % 4) * 380 + 40, Math.floor(i / 4) * 460 + 40, 240, 180, i)); parser.getIR(); }
    const i = N - 1;
    const t = performance.now();
    parser.addStroke(rectStroke((i % 4) * 380 + 40, Math.floor(i / 4) * 460 + 40, 240, 180, i));
    const ir = anchors.apply(parser.getIR());     // 파서 + 앵커
    const specs = buildScene(ir);                  // 씬 스펙
    specs.forEach((s, k) => objectFromSpec(s, k)); // 지오메트리 생성(GPU 업로드 전)
    samples.push(performance.now() - t);
  }
  return { p50: +pct(samples, 0.5).toFixed(2), p95: +pct(samples, 0.95).toFixed(2) };
}

describe("V-4 end-to-end compute 지연(판정 A, §8)", () => {
  it("1/3/8 볼륨 compute p95 « 150ms (GPU·rAF 제외)", () => {
    const r1 = measure(1, 60), r3 = measure(3, 60), r8 = measure(8, 60);
    // 개별 기록은 progress.md. 여기선 예산 상한만 게이트(회귀 방지).
    expect(r1.p95).toBeLessThan(60);
    expect(r3.p95).toBeLessThan(80);
    expect(r8.p95).toBeLessThan(120);   // §8: 8볼륨 파서 증분 <80 + 씬/지오메트리
    // 스케일 단조 완만: 8볼륨이 1볼륨의 8배를 넘지 않음(증분성)
    expect(r8.p95).toBeLessThan(r1.p95 * 8 + 20);
    console.log(`[V-4 e2e compute] 1vol ${JSON.stringify(r1)}  3vol ${JSON.stringify(r3)}  8vol ${JSON.stringify(r8)}`);
  });
});
