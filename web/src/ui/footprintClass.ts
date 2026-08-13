// V-4 투시 신뢰 불가 판정 — §3.8 개정안. 투시 프레임에서 비직사각/복잡 footprint면
// "이 투시만으로 비례 미확정 → 평면/치수 필요" 안내(가정 V-g/V-i/V-k: 종횡비 모호는 내재적).
// 근거: 2F 직사각=투시단독 IoU 0.85~0.96 / 비직교 0.62 붕괴, 2H L자=L1만.
import type { Pt } from "../parser/types.js";
import { hypot } from "../parser/geometry.js";

export type FootprintClass = "rectangle" | "L" | "complex";

// footprintFromLines는 닫힌 링(첫=끝 중복)을 반환 → 고유 코너만 남김.
// 연속 중복(파서 잔여)도 함께 제거. 직사각=4, L=6 코너로 정규화.
export function uniqueCorners(fp: Pt[], eps = 1e-6): Pt[] {
  const out: Pt[] = [];
  for (const p of fp) {
    const last = out[out.length - 1];
    if (!last || hypot(p[0] - last[0], p[1] - last[1]) > eps) out.push(p);
  }
  // 링 닫힘 중복(마지막==첫)
  while (out.length > 1 && hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out;
}

function interiorAngle(a: Pt, b: Pt, c: Pt): number {
  // b에서의 내각(도). a-b-c
  const v1x = a[0] - b[0], v1y = a[1] - b[1], v2x = c[0] - b[0], v2y = c[1] - b[1];
  const n1 = hypot(v1x, v1y), n2 = hypot(v2x, v2y);
  if (n1 < 1e-9 || n2 < 1e-9) return 180;
  let cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

// 모든 코너가 직각(±angTol)인가.
function allRightAngles(fp: Pt[], angTol: number): boolean {
  const n = fp.length;
  for (let i = 0; i < n; i++) {
    const ang = interiorAngle(fp[(i - 1 + n) % n], fp[i], fp[(i + 1) % n]);
    if (Math.abs(ang - 90) > angTol) return false;
  }
  return true;
}

// 직교(모든 코너 90°) 4정점=직사각, 6정점=L자, 그 외/비직교=complex.
// 입력은 닫힌 링일 수 있음 → 고유 코너로 정규화 후 판정.
export function classifyFootprint(fp: Pt[], angTol = 12): FootprintClass {
  const c = uniqueCorners(fp);
  if (c.length < 4) return "complex";
  if (!allRightAngles(c, angTol)) return "complex";   // 비직교 = 종횡비 붕괴(2F 0.62)
  if (c.length === 4) return "rectangle";              // 투시 단독 가능(2F)
  if (c.length === 6) return "L";                      // L1만 (2H)
  return "complex";                                    // 凹·계단 = 평면/앵커 필요
}

// 투시 프레임에서 신뢰 불가(평면/치수 요구) 여부 — §3.8: 비직사각·L2 이하는 평면/앵커.
// rectangle만 투시 단독 신뢰. L·complex는 안내.
export function needsPlanForPerspective(fp: Pt[]): boolean {
  return classifyFootprint(fp) !== "rectangle";
}
