// 소형 선형대수 — OpenCV 없이 카메라 정합용 (§1.5). Jacobi 대칭 고유분해 + 3x3 SVD.
export type Mat = number[][];

export function matmul(A: Mat, B: Mat): Mat {
  const n = A.length, m = B[0].length, k = B.length;
  const C: Mat = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i][p]; for (let j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
  return C;
}
export const transpose = (A: Mat): Mat => A[0].map((_, j) => A.map(r => r[j]));

// 대칭행렬 고유분해 (Jacobi). 반환 {values, vectors(열=고유벡터)}. 오름차순 정렬 안 함.
export function jacobiEigenSym(Ain: Mat, sweeps = 100, tol = 1e-14): { values: number[]; vectors: Mat } {
  const n = Ain.length;
  const A = Ain.map(r => r.slice());
  const V: Mat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < tol) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const app = A[p][p], aqq = A[q][q], apq = A[p][q];
      const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
      const c = Math.cos(phi), s = Math.sin(phi);
      for (let i = 0; i < n; i++) {
        const aip = A[i][p], aiq = A[i][q];
        A[i][p] = c * aip - s * aiq; A[i][q] = s * aip + c * aiq;
      }
      for (let i = 0; i < n; i++) {
        const api = A[p][i], aqi = A[q][i];
        A[p][i] = c * api - s * aqi; A[q][i] = s * api + c * aqi;
      }
      for (let i = 0; i < n; i++) {
        const vip = V[i][p], viq = V[i][q];
        V[i][p] = c * vip - s * viq; V[i][q] = s * vip + c * viq;
      }
    }
  }
  const values = A.map((r, i) => r[i]);
  return { values, vectors: V };
}

// A(m x n)의 최소특이값 오른쪽특이벡터 = A^T A 최소고유값 고유벡터. 호모그래피 DLT 영공간.
export function smallestSingularVector(A: Mat): number[] {
  const AtA = matmul(transpose(A), A);
  const { values, vectors } = jacobiEigenSym(AtA);
  let mi = 0; for (let i = 1; i < values.length; i++) if (values[i] < values[mi]) mi = i;
  return vectors.map(r => r[mi]);
}

// 3x3 회전 정규직교화: R ← U V^T (SVD via R^T R 고유분해)
export function orthonormalize3(R: Mat): Mat {
  const RtR = matmul(transpose(R), R);
  const { values, vectors: Vv } = jacobiEigenSym(RtR);
  const idx = [0, 1, 2].sort((a, b) => values[b] - values[a]);
  const V: Mat = [0, 1, 2].map(i => idx.map(j => Vv[i][j]));   // 열정렬(내림차순)
  const sv = idx.map(j => Math.sqrt(Math.max(values[j], 1e-12)));
  const RV = matmul(R, V);
  const U: Mat = [0, 1, 2].map(i => [0, 1, 2].map(j => RV[i][j] / sv[j]));
  let Rr = matmul(U, transpose(V));
  if (det3(Rr) < 0) { for (let i = 0; i < 3; i++) U[i][2] = -U[i][2]; Rr = matmul(U, transpose(V)); }
  return Rr;
}
export function det3(m: Mat): number {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
       - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
       + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
export function matvec(A: Mat, v: number[]): number[] { return A.map(r => r.reduce((s, x, i) => s + x * v[i], 0)); }
export function inv3(m: Mat): Mat {
  const d = det3(m); const c: Mat = [
    [(m[1][1] * m[2][2] - m[1][2] * m[2][1]), -(m[0][1] * m[2][2] - m[0][2] * m[2][1]), (m[0][1] * m[1][2] - m[0][2] * m[1][1])],
    [-(m[1][0] * m[2][2] - m[1][2] * m[2][0]), (m[0][0] * m[2][2] - m[0][2] * m[2][0]), -(m[0][0] * m[1][2] - m[0][2] * m[1][0])],
    [(m[1][0] * m[2][1] - m[1][1] * m[2][0]), -(m[0][0] * m[2][1] - m[0][1] * m[2][0]), (m[0][0] * m[1][1] - m[0][1] * m[1][0])],
  ];
  return c.map(r => r.map(x => x / d));
}
