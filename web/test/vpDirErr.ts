// **소실점 방향 오차(°)의 단일 정의**(#17) — `real_ink.test.ts`(K 지표 집계·반례)와
// `vp_dir_consistency.test.ts`(12차 항목 2 회귀 팔)가 같은 함수를 쓴다.
// 12차에 여기로 옮겼다 — 회귀 팔이 `real_ink.test.ts`를 import하면 그 파일의 테스트
// (측정 하네스 — `stage0/out` 쓰기)까지 단위 갈래에서 돌아 갈래 규약이 깨지기 때문이다.
import type { Pt2 } from "../src/s3d/camera.js";

/**
 * 획 현(a→b)과 시작점→소실점 방향의 각차(°). 방향 부호는 무시한다(축은 부호가 없다).
 * 퇴화(길이 0·시작점=소실점)는 null.
 */
export function vpDirErrDeg(a0: Pt2, b0: Pt2, vp: Pt2): number | null {
  const u: Pt2 = [b0[0] - a0[0], b0[1] - a0[1]];
  const v: Pt2 = [vp[0] - a0[0], vp[1] - a0[1]];
  const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
  if (lu < 1e-9 || lv < 1e-9) return null;
  const c = Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]) / (lu * lv));
  return (Math.acos(c) * 180) / Math.PI;
}
