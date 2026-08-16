// **화면 사각형 클리핑** — 범용 2D 유틸.
//
// 원래 `vpDraft.ts`(검출 초안 경로)에 있었고 2026-08-17 지시 2로 그 모듈이 삭제되면서
// 이것만 여기로 옮겼다 — 초안 로직이 아니라 **종단 확인(e2e)이 화면 밖 소실점으로
// 캔버스 안 직선을 만드는 데** 쓰는 순수 기하다(Liang–Barsky).
import type { Pt2 } from "./camera.js";

export function clipToCanvas(
  a: Pt2, b: Pt2, imgSize: [number, number], margin: number,
): [Pt2, Pt2] | null {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lo = [margin, margin], hi = [imgSize[0] - margin, imgSize[1] - margin];
  for (const k of [0, 1]) {
    const d = k === 0 ? dx : dy, p0 = a[k];
    for (const [p, q] of [[-d, p0 - lo[k]], [d, hi[k] - p0]] as [number, number][]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
}
