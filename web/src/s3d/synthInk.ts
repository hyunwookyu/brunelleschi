// 정답이 알려진 합성 잉크 — **반례 테스트용**(§13 규칙 3). 실획 측정을 대체하지 않는다.
//
// 왜 필요한가: Quick,Draw 실획에는 "이 획이 몇 개의 엣지여야 하는가"라는 라벨이 없다.
// 실획으로는 **분포**만 잴 수 있고, 검출기가 **맞는가**는 정답이 있어야 잰다.
// 그래서 코너 수를 아는 폴리라인에 실측 잉크 노이즈를 얹어 검출기를 시험한다.
//
// 노이즈 파라미터는 임의값이 아니라 실획 측정값이다
// (`stage0/out/archive_pre_W/ink_noise_model.json`, Quick,Draw n=2000):
//   저주파 활(lf_bow)  precise 0.0315 / medium 0.0558 / coarse 0.0937  ← 변 길이 대비
//   고주파(hf_sigma)   0.031 전후 (등급 무관에 가깝다)
// 이 값을 코드에 박아 두는 이유는 폐기된 파이프라인의 JSON에 런타임 의존을 만들지 않기 위해서다.
// 값의 출처는 위 경로이며 바뀌면 여기도 바꾼다.
import type { Pt } from "../parser/types.js";
import { hypot } from "../parser/geometry.js";

export const INK_GRADES = {
  precise: { lf_bow: 0.0315, hf_sigma: 0.0310, overshoot: 0.1229, spacing: 0.0134 },
  medium: { lf_bow: 0.0558, hf_sigma: 0.0336, overshoot: 0.1134, spacing: 0.0148 },
  coarse: { lf_bow: 0.0937, hf_sigma: 0.0314, overshoot: 0.1623, spacing: 0.0163 },
} as const;
export type InkGrade = keyof typeof INK_GRADES;

/** mulberry32 — 결정론적 시드. `Math.random`을 쓰면 재실행마다 값이 달라진다(V-H). */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(r: () => number): number {
  const u = Math.max(1e-12, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 폴리라인 정점열 → 잉크 획. 각 변마다 저주파 활 한 번 + 점마다 고주파.
 * canonDiag = 도형 대각(픽셀). 노이즈는 전부 이 값에 비례한다(절대 픽셀 금지 — V-s).
 */
export function renderInk(verts: Pt[], grade: InkGrade, r: () => number, canonDiag?: number,
                          skew = 0.5): Pt[] {
  const g = INK_GRADES[grade];
  const xs = verts.map(p => p[0]), ys = verts.map(p => p[1]);
  const diag = canonDiag ?? hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const step = Math.max(1.5, g.spacing * diag);
  const out: Pt[] = [];
  for (let k = 1; k < verts.length; k++) {
    const a = verts[k - 1], b = verts[k];
    const L = hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;   // 접선
    const nx = -uy, ny = ux;                                  // 법선
    const bow = gauss(r) * g.lf_bow * L;                      // 변 하나당 활 한 번
    const m = Math.max(2, Math.round(L / step));
    for (let i = (k === 1 ? 0 : 1); i <= m; i++) {
      const t = i / m;
      // 활의 마루 위치. **0.5(대칭)가 기본이지만 그것이 특수한 경우다** —
      // 대칭 활은 최소제곱 주축이 참 방향과 **정확히** 나란해져(편차가 상쇄된다)
      // 방향 판정이 공짜로 맞는다. 실제 손 획은 한쪽으로 치우친다.
      // skew를 0.5에서 옮기면 그 자기확인이 깨진다(S-2에서 실제로 걸렸다).
      const u = skew <= 0 || skew >= 1 ? t
        : (t < skew ? 0.5 * (t / skew) : 0.5 + 0.5 * ((t - skew) / (1 - skew)));
      const arc = Math.sin(Math.PI * u) * bow;                 // 양끝 고정, 마루가 가장 휜다
      const hf = gauss(r) * g.hf_sigma * step;
      out.push([a[0] + ux * L * t + nx * (arc + hf), a[1] + uy * L * t + ny * (arc + hf)]);
    }
  }
  return out;
}

/** 덧그림 합성 — 원 경로를 되짚되 일부만 덮고 옆으로 조금 밀린다. */
export function retrace(path: Pt[], r: () => number, coverage = 0.8, offsetRatio = 0.02): Pt[] {
  const n = path.length;
  const span = Math.max(2, Math.round(n * coverage));
  const start = Math.floor(r() * (n - span));
  const sub = path.slice(start, start + span);
  const xs = path.map(p => p[0]), ys = path.map(p => p[1]);
  const diag = hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  const off = (r() * 2 - 1) * offsetRatio * diag;
  const back = r() < 0.5;
  const seq = back ? sub.slice().reverse() : sub;
  return seq.map(([x, y], i) => {
    const j = Math.min(seq.length - 1, i + 1);
    const dx = seq[j][0] - x, dy = seq[j][1] - y;
    const L = hypot(dx, dy) || 1;
    return [x - (dy / L) * off, y + (dx / L) * off] as Pt;
  });
}
