// V-2 씬 빌더/diff 테스트 (브라우저 독립). §3.5 confidence, §2.2 diff, V-c hint→볼륨 전환.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { emptyIR } from "../src/parser/types.js";
import type { Volume } from "../src/parser/types.js";
import { confidenceMaterial, buildScene, volumeMesh } from "../src/scene/sceneBuilder.js";
import { diffScene } from "../src/scene/sceneDiff.js";
import { resolve } from "../src/parser/tentative.js";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, "reference_multi.json"), "utf-8"));

function vol(id: string, conf: number, h: number | null = null): Volume {
  return { id, footprint: [[0, 0], [100, 0], [100, 60], [0, 60]], base: 0, height: h, height_src: "unset", confidence: conf, label: "" };
}

describe("V-2 confidence 재질 (§3.5)", () => {
  it("≥0.8 불투명 / 0.5~0.8 반투명 / <0.5 파선와이어", () => {
    expect(confidenceMaterial(0.9).mode).toBe("opaque");
    expect(confidenceMaterial(0.65).mode).toBe("semi");
    expect(confidenceMaterial(0.65).opacity).toBe(0.5);
    const w = confidenceMaterial(0.3);
    expect(w.mode).toBe("wire"); expect(w.dashed).toBe(true);
  });
  it("무단위 높이 → viz_height, dimensionless 플래그", () => {
    const m = volumeMesh(vol("v1", 0.9, null));
    expect(m.dimensionless).toBe(true); expect(m.height).toBeGreaterThan(0);
    expect(volumeMesh(vol("v1", 0.9, 9)).dimensionless).toBe(false);
  });
});

describe("V-2 씬 diff (§2.2 오브젝트 풀)", () => {
  it("추가/변경/삭제 분류", () => {
    const s1 = buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9), vol("v2", 0.9)] });
    const s2 = buildScene({ ...emptyIR(), volumes: [vol("v1", 0.6), vol("v3", 0.9)] });   // v1 conf변경, v2삭제, v3추가
    const d = diffScene(s1, s2);
    expect(d.added.map(m => m.id)).toEqual(["v3"]);
    expect(d.updated.map(m => m.id)).toEqual(["v1"]);      // confidence 재질 변경
    expect(d.removed).toEqual(["v2"]);
  });
  it("불변 볼륨은 재빌드 안 함", () => {
    const s = buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9)] });
    const d = diffScene(s, buildScene({ ...emptyIR(), volumes: [vol("v1", 0.9)] }));
    expect(d.unchanged).toEqual(["v1"]); expect(d.added.length + d.updated.length + d.removed.length).toBe(0);
  });
});

describe("V-2 tentative hint → 볼륨 전환 (V-c, 씬 레벨)", () => {
  it("30%: hint 스펙, 100%: 볼륨 스펙, diff가 hint 제거+볼륨 추가", () => {
    const p30 = ref.partials.find((p: any) => Math.round(p.frac * 100) === 30);
    const p100 = ref.partials.find((p: any) => Math.round(p.frac * 100) === 100);
    const r30 = resolve(p30.capture), r100 = resolve(p100.capture);
    const s30 = buildScene({ ...emptyIR(), volumes: r30.volumes }, r30.hints);
    const s100 = buildScene({ ...emptyIR(), volumes: r100.volumes }, r100.hints);
    expect(s30.some(m => m.kind === "hint")).toBe(true);
    expect(s30.some(m => m.kind === "volume")).toBe(false);
    expect(s100.some(m => m.kind === "volume")).toBe(true);
    expect(s100.some(m => m.kind === "hint")).toBe(false);
    const d = diffScene(s30, s100);
    expect(d.removed.length).toBeGreaterThanOrEqual(1);   // hint 제거
    expect(d.added.some(m => m.kind === "volume")).toBe(true);   // 볼륨 추가
  });
});
