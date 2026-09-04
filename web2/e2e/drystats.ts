// 마른 매체 자국의 통계 자(web2-63 paint63 ①의 그 자 — web2-64가 공유 모듈로 뺐다: ③ 색연필 갈림 · ⑤ 농도 일치가 같은 자를 쓴다).
// ⚠ 스펙이 스펙을 import하면 전량 실행이 거부된다 — 공유 몫은 비-스펙 모듈(ref63.ts의 그 규약).
// 값의 뜻: 몸통 띠(열별 위/아래 가장자리 중앙값 안쪽 3px)의 roughness(가장자리 − 9열 이동평균의 sd) · empty_share(어둡기 < 8 몫) ·
// mean · p95(어둡기/255). paint63.spec의 STATS_FN과 글자까지 같다(63 원장의 값과 비교 가능해야 한다 — #103).

export const STATS_FN = `(function(v, W, H){
  const X0 = 80, X1 = W - 80, TH = 16
  const tops = [], bots = []
  for (let x = X0; x < X1; x++) {
    let t = -1, b = -1
    for (let y = 0; y < H; y++) { const q = v[y * W + x]; if (q > TH) { if (t < 0) t = y; b = y } }
    tops.push(t); bots.push(b)
  }
  const valid = tops.map((t, i) => t >= 0 && bots[i] >= 0)
  const nValid = valid.filter(Boolean).length
  if (nValid < 40) return { ok: false, n: nValid }
  const rough = (arr) => {
    const res = []
    for (let i = 4; i < arr.length - 4; i++) {
      if (!valid[i]) continue
      let s = 0, n = 0
      for (let k = -4; k <= 4; k++) if (valid[i + k]) { s += arr[i + k]; n++ }
      res.push(arr[i] - s / n)
    }
    const m = res.reduce((a, b) => a + b, 0) / res.length
    return Math.sqrt(res.reduce((a, b) => a + (b - m) * (b - m), 0) / res.length)
  }
  const roughness = (rough(tops) + rough(bots)) / 2
  const med = (a) => { const s = a.filter((_, i) => valid[i]).slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)] }
  const yT = med(tops) + 3, yB = med(bots) - 3
  let n = 0, empty = 0, sum = 0
  const vals = []
  for (let y = yT; y <= yB; y++) for (let x = X0; x < X1; x++) { const q = v[y * W + x]; n++; if (q < 8) empty++; sum += q; vals.push(q) }
  vals.sort((p, q) => p - q)
  return { ok: true, roughness: +roughness.toFixed(3), empty_share: +(empty / n).toFixed(4), mean: +(sum / n / 255).toFixed(4),
    p95: +(vals[Math.floor(vals.length * 0.95)] / 255).toFixed(4), body_h: yB - yT + 1, n }
})`

export type Stat = { ok: boolean; roughness: number; empty_share: number; mean: number; p95: number; body_h: number }

/** 두 통계의 «갈림» — 특징 넷의 상대 차를 내림차순으로: rel = **둘째**(특징 둘이 함께 갈려야) · by = 그 둘. 63 그대로. */
export function distinct(a: Stat, b: Stat, floors: Record<string, number>): { rel: number; by: string; top: number } {
  const ds = (['roughness', 'empty_share', 'mean', 'p95'] as const).map(k => ({
    k, d: Math.abs(a[k] - b[k]) / Math.max(Math.abs(a[k]), Math.abs(b[k]), floors[k] ?? 1e-9),
  })).sort((p, q) => q.d - p.d)
  return { rel: +ds[1]!.d.toFixed(3), by: `${ds[0]!.k}+${ds[1]!.k}`, top: +ds[0]!.d.toFixed(3) }
}
export const FLOORS = { roughness: 0.5, empty_share: 0.05, mean: 0.03, p95: 0.05 }
