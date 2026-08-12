// V-1 카메라 파리티 (§1.5) — 무노이즈 DLT는 정확 → fit_error≈0, Python과 <1e-6.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fitCamera } from "../src/parser/camera.js";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, "reference_multi.json"), "utf-8")).camera;

describe("V-1 카메라 정합 (자체 SVD)", () => {
  it("무노이즈 fit_error ≈ 0 (Python과 <1e-6)", () => {
    const res = fitCamera(ref.world4, ref.image4, ref.img_size);
    expect(res.ok).toBe(true);
    expect(res.fit_error).toBeLessThan(1e-6);
    // Python도 1.5e-16 → 둘 다 사실상 0 (§1.5 파리티)
    expect(Math.abs(res.fit_error - ref.expect.fit_error)).toBeLessThan(1e-6);
  });

  it("8-way 대응: 회전·반전 순서에도 fit_error≈0", () => {
    // image 순서를 회전시켜도 최적 대응을 찾아 fit_error 낮음
    const rotated = [ref.image4[2], ref.image4[3], ref.image4[0], ref.image4[1]];
    const res = fitCamera(ref.world4, rotated, ref.img_size);
    expect(res.fit_error).toBeLessThan(1e-6);
  });
});
