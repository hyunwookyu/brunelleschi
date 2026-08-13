// V-3 하드게이트 — 증분 갱신 == 전체 재파싱 (assumptions V-b). 어긋나면 멈춤.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Stroke, Capture, IR } from "../src/parser/types.js";
import { multiplex } from "../src/parser/multiplex.js";
import { inferRelations } from "../src/parser/relate.js";
import { IncrementalParser } from "../src/worker/incremental.js";

const here = dirname(fileURLToPath(import.meta.url));
const refMulti = JSON.parse(readFileSync(join(here, "reference_multi.json"), "utf-8"));

function fullIR(cap: Capture): IR { const { ir } = multiplex(cap); inferRelations(ir); return ir; }
function incrIR(cap: Capture): IR {
  const p = new IncrementalParser(cap.w ?? 1000, cap.h ?? 1000, 0.05, cap.frame ?? "");
  for (const s of cap.strokes) p.addStroke(s);
  return p.getIR();
}

// 부동소수까지 동일해야(같은 입력→같은 계산). footprint·confidence·relations 비교.
function irKey(ir: IR): string {
  return JSON.stringify({
    vols: ir.volumes.map(v => ({ id: v.id, fp: v.footprint, conf: v.confidence, h: v.height })),
    rels: [...ir.relations].map(r => `${r.type}:${[r.a, r.b].sort().join(",")}`).sort(),
  });
}

function rectStroke(x: number, y: number, w: number, h: number, seq = 0): Stroke {
  const pts: number[][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number) => { for (let t = 0; t <= 1; t += 0.05) pts.push([ax + (bx - ax) * t, ay + (by - ay) * t, seq, 0.5]); };
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
  return { points: pts, pen: "mass", seq };
}

describe("V-3 증분 == 전체 재파싱 (하드게이트)", () => {
  it("다중 볼륨 픽스처: 증분 최종 IR == multiplex", () => {
    const cap: Capture = refMulti.multi.capture;
    expect(irKey(incrIR(cap))).toBe(irKey(fullIR(cap)));
  });

  it("획 순서 무관(역순·셔플): 같은 최종 IR", () => {
    const cap: Capture = refMulti.multi.capture;
    const base = irKey(fullIR(cap));
    const rev: Capture = { ...cap, strokes: [...cap.strokes].reverse() };
    expect(irKey(incrIR(rev))).toBe(base);
  });

  it("분리 3사각형(합성): 증분 == 전체", () => {
    const cap: Capture = { frame: "", w: 800, h: 600, strokes: [rectStroke(20, 20, 120, 90, 0), rectStroke(400, 20, 120, 90, 1), rectStroke(20, 350, 120, 90, 2)] };
    expect(incrIR(cap).volumes.length).toBe(fullIR(cap).volumes.length);
    expect(irKey(incrIR(cap))).toBe(irKey(fullIR(cap)));
  });

  it("브리징 병합: 두 사각형을 잇는 획 → 한 그룹, 증분 == 전체", () => {
    // 두 사각형 + 사이를 잇는 얇은 획(양쪽에 근접) → union-find 병합
    const bridge: Stroke = { points: (() => { const p: number[][] = []; for (let t = 0; t <= 1; t += 0.02) p.push([140 + t * 80, 60, 3, 0.5]); return p; })(), pen: "mass", seq: 3 };
    const cap: Capture = { frame: "", w: 800, h: 600, strokes: [rectStroke(20, 20, 120, 90, 0), rectStroke(220, 20, 120, 90, 1), bridge] };
    // 병합되어 volume 수가 전체와 동일(둘 다 같은 그룹핑)
    expect(incrIR(cap).volumes.length).toBe(fullIR(cap).volumes.length);
    expect(irKey(incrIR(cap))).toBe(irKey(fullIR(cap)));
  });

  it("증분성: 기존 그룹에 획 추가 시 그 그룹만 무효화(전체 재빌드 아님)", () => {
    const p = new IncrementalParser(800, 600, 0.05);
    p.addStroke(rectStroke(20, 20, 120, 90, 0));
    p.addStroke(rectStroke(400, 20, 120, 90, 1));
    p.getIR();                          // 둘 다 파싱→캐시
    expect(p.reparsedGroups()).toBe(0);
    p.addStroke(rectStroke(30, 30, 100, 70, 2));   // 첫 그룹 근처 → 그 그룹만 무효화
    expect(p.reparsedGroups()).toBe(1);            // 하나만 재파싱 대상
  });
});
