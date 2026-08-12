// P3 파리티 — TS 관계추론이 Python(shapely)과 일치하는지. L/凹/계단형. 지시서 Track 1.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { IR, Volume, Pt } from "../src/parser/types.js";
import { emptyIR } from "../src/parser/types.js";
import { inferGeometric } from "../src/parser/relate.js";

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, "reference_relate.json"), "utf-8"));

function vol(id: string, fp: Pt[]): Volume {
  return { id, footprint: fp, base: 0, height: null, height_src: "unset", confidence: 0.9, label: "" };
}

describe("P3 관계추론 폴리곤 파리티 (shapely 대조)", () => {
  for (const c of cases) {
    it(`${c.name}: TS 유형 = shapely 유형`, () => {
      const ir: IR = emptyIR();
      ir.volumes.push(vol("v1", c.fpa), vol("v2", c.fpb));
      const rels = inferGeometric(ir);
      const types = [...new Set(rels.map(r => r.type))].sort();
      expect(types).toEqual(c.expect_types);
    });
  }
});
