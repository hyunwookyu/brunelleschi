// V-1 파리티 (다중화·관계·tentative) — Python 참조 일치.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { multiplex } from "../src/parser/multiplex.js";
import { inferRelations } from "../src/parser/relate.js";
import { resolve } from "../src/parser/tentative.js";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, "reference_multi.json"), "utf-8"));

describe("V-1 다중화·관계 파리티", () => {
  it("multiplex 볼륨 수·id 일치", () => {
    const { ir } = multiplex(ref.multi.capture);
    expect(ir.volumes.length).toBe(ref.multi.expect.n_volumes);
    expect(ir.volumes.map(v => v.id)).toEqual(ref.multi.expect.ids);
  });

  it("관계 유형 일치(분리 배치 → separated/aligned)", () => {
    const { ir } = multiplex(ref.multi.capture);
    inferRelations(ir);
    const types = [...new Set(ir.relations.map(r => r.type))].sort();
    expect(types).toEqual(ref.multi.expect.relation_types);
  });
});

describe("V-1 tentative(판정 D) 파리티", () => {
  for (const p of ref.partials) {
    it(`${Math.round(p.frac * 100)}% → 볼륨 ${p.expect.n_volumes} · hint ${p.expect.n_hints}`, () => {
      const { volumes, hints } = resolve(p.capture);
      expect(volumes.length).toBe(p.expect.n_volumes);
      expect(hints.length).toBe(p.expect.n_hints);
    });
  }
});
