// V-1 파리티 — TS 파서 출력이 Python 참조와 일치하는지(§1.3, §9). 어긋나면 TS가 틀림.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeToIR } from "../src/parser/normalize.js";
import { rootFieldCount } from "../src/parser/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, "reference.json"), "utf-8"));

describe("V-1 파서 Python 파리티", () => {
  it("루트 필드 7개(스키마 일치)", () => {
    expect(rootFieldCount()).toBe(7);
  });

  for (const c of cases) {
    it(`${c.name}: 볼륨·라인·footprint·confidence 일치`, () => {
      const { ir, meta } = normalizeToIR(c.capture);
      const e = c.expect;
      expect(ir.volumes.length).toBe(e.n_volumes);
      expect(meta.parseable).toBe(e.parseable);
      // 라인 수 ±1 허용(부동소수 경계)
      expect(Math.abs(meta.n_lines - e.n_lines)).toBeLessThanOrEqual(1);
      if (e.n_volumes > 0) {
        // confidence 근접(0.05)
        expect(Math.abs(ir.volumes[0].confidence - e.confidence)).toBeLessThan(0.05);
        // footprint 정점 위치 근접 — 같은 정점 수 & 각 정점 최근접거리 작음
        const got = ir.volumes[0].footprint, exp = e.footprint;
        expect(Math.abs(got.length - exp.length)).toBeLessThanOrEqual(1);
        // 각 참조 정점에 대해 가장 가까운 복원 정점까지 거리 < bbox의 3%
        const xs = exp.map((p: number[]) => p[0]), ys = exp.map((p: number[]) => p[1]);
        const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        for (const ep of exp) {
          const dmin = Math.min(...got.map(gp => Math.hypot(gp[0] - ep[0], gp[1] - ep[1])));
          expect(dmin).toBeLessThan(0.03 * diag);
        }
      }
    });
  }
});
