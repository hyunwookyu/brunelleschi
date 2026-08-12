// 카메라 정합 — 호모그래피 DLT + 포즈 분해, OpenCV 없이 (§1.5). 참조: python/stage3/camera.py.
import type { Pt } from "./types.js";
import { smallestSingularVector, inv3, matvec, orthonormalize3, det3, type Mat } from "./linalg.js";
import { hypot } from "./geometry.js";

export const FIT_ERROR_FAIL = 0.10;

function Kmat(w: number, h: number): Mat {
  const f = Math.max(w, h);
  return [[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]];
}

// 순환 4 × 반전 2 = 8 대응 순열 (image 쪽에 적용). python _correspondences.
function perms(): number[][] {
  const idx = [0, 1, 2, 3], out: number[][] = [];
  for (let r = 0; r < 4; r++) { const rot = idx.slice(r).concat(idx.slice(0, r)); out.push(rot); out.push(rot.slice().reverse()); }
  return out;
}

// 4점 호모그래피 (world XY → image). DLT 영공간.
function homography(world: Pt[], img: Pt[]): Mat {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = world[i], [u, v] = img[i];
    A.push([-X, -Y, -1, 0, 0, 0, u * X, u * Y, u]);
    A.push([0, 0, 0, -X, -Y, -1, v * X, v * Y, v]);
  }
  const h = smallestSingularVector(A);
  return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], h[8]]];
}

// H + K → (R, t). Zhang 평면 포즈.
function poseFromH(H: Mat, K: Mat): { R: Mat; t: number[] } {
  const Kinv = inv3(K);
  const B = [0, 1, 2].map(i => [0, 1, 2].map(j => Kinv[i].reduce((s, x, k) => s + x * H[k][j], 0)));
  const b1 = [B[0][0], B[1][0], B[2][0]], b2 = [B[0][1], B[1][1], B[2][1]], b3 = [B[0][2], B[1][2], B[2][2]];
  const n1 = hypot3(b1), n2 = hypot3(b2);
  let lam = 2 / (n1 + n2);
  let r1 = b1.map(x => x * lam), r2 = b2.map(x => x * lam);
  let t = b3.map(x => x * lam);
  if (t[2] < 0) { r1 = r1.map(x => -x); r2 = r2.map(x => -x); t = t.map(x => -x); }
  const r3 = cross(r1, r2);
  let R: Mat = [[r1[0], r2[0], r3[0]], [r1[1], r2[1], r3[1]], [r1[2], r2[2], r3[2]]];
  R = orthonormalize3(R);
  if (det3(R) < 0) R = R.map(row => [row[0], row[1], -row[2]]);
  return { R, t };
}

function project(R: Mat, t: number[], K: Mat, X: number, Y: number): Pt {
  const cam = [R[0][0] * X + R[0][1] * Y + t[0], R[1][0] * X + R[1][1] * Y + t[1], R[2][0] * X + R[2][1] * Y + t[2]];
  const p = matvec(K, cam);
  return [p[0] / p[2], p[1] / p[2]];
}

export interface FitResult { ok: boolean; fit_error: number; perm: number[]; approximate: boolean; R?: Mat; t?: number[]; K?: Mat; }

export function fitCamera(world4: Pt[], image4: Pt[], imgSize: [number, number]): FitResult {
  if (world4.length !== 4 || image4.length !== 4) return { ok: false, fit_error: Infinity, perm: [], approximate: true };
  const K = Kmat(imgSize[0], imgSize[1]);
  const diag = hypot(imgSize[0], imgSize[1]);
  let best: FitResult | null = null;
  for (const perm of perms()) {
    const img = perm.map(i => image4[i]);
    let H: Mat, pose: { R: Mat; t: number[] };
    try { H = homography(world4, img); pose = poseFromH(H, K); }
    catch { continue; }
    let sse = 0;
    for (let i = 0; i < 4; i++) {
      const [px, py] = project(pose.R, pose.t, K, world4[i][0], world4[i][1]);
      sse += (px - img[i][0]) ** 2 + (py - img[i][1]) ** 2;
    }
    const err = Math.sqrt(sse / 4) / diag;
    if (!best || err < best.fit_error) best = { ok: true, fit_error: err, perm, approximate: false, R: pose.R, t: pose.t, K };
  }
  if (!best) return { ok: false, fit_error: Infinity, perm: [], approximate: true };
  if (best.fit_error > FIT_ERROR_FAIL) best.approximate = true;
  return best;
}

const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const hypot3 = (v: number[]) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
