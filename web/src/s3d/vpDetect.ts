// L-A **소실점 후보 검출** — 계획서 `docs/line_plan.md` §5.1.
//
// **같은 방향 클러스터의 선 3개 이상이 한 점에서 만나면 확정한다.**
// 두 개면 교점이 반드시 하나 생기므로 정보가 없다. 세 번째가 그 점을 지나면 우연이 아니다.
//
// ```
// 획 → 대표 직선 → 쌍마다 교점(후보) → 후보를 지나는 직선 수(지지) → 최다 지지 채택
//                                    → 지지선으로 최소제곱 재적합 → 지지 재수집 → 제거 후 반복
// ```
//
// **정밀도가 필요한 값이 아니다**(계획서 §5.1) — 이 단계가 정하는 것은 **승격 시점**뿐이고
// 카메라는 최소제곱으로 다시 푼다. 그래서 임계를 넉넉히 잡는다.
//
// **직교성은 여기서 보지 않는다.** 검출은 후보를 제안하고 **카메라가 검증한다** —
// 3점은 예각 조건(6.5), 2점은 주점 반대쪽 조건(6.2)이 f² < 0으로 거른다.
// 검출에 직교 조건을 넣으면 같은 판정을 두 군데서 하게 되고, 어긋나면 원인을 못 가른다.
import { lineIntersect, isFiniteVp, type Pt2 } from "./camera.js";
import { representative, vpMisfit, type Axis, type Rep } from "./axis.js";

/** 검출에 들어가는 대표 직선. `id`는 어느 획에서 왔는지. */
export interface DetLine { id: string; rep: Rep }

export interface VpCandidate {
  vp: Pt2;
  /** 이 소실점을 지나는 직선들의 `id`. **길이가 지지 수다.** */
  support: string[];
  /** 지지선들의 **각도 오차 중앙값(도)**. 작을수록 한 점에 잘 모였다. */
  residual: number;
  /**
   * **유한 소실점이 아니다** — 화면 밖 아주 멀거나, 지지선 방향 산포가 작아
   * **위치가 정해지지 않는다**(화면 평행, c=0. 이론서 2.2).
   * 이 후보의 지지선은 `screen` 축이 된다.
   */
  infinite: boolean;
  /** 지지선 방향의 최대 각차(도). 작으면 교점 위치가 노이즈에 지배된다. */
  spreadDeg: number;
}

export const VP_TOL = {
  /**
   * **지지 판정 ①** — 대표 직선의 방향과 "직선에서 후보 소실점으로 가는 방향" 사이의 **각(도)**.
   *
   * ⚠ 계획서 §5.1은 "산포 임계는 화면 대각 비율"이라 적었는데 **그대로 하지 않았다**(D-L2).
   * 화면 대각 대비 픽셀 거리는 **먼 소실점에서 발산한다** — 각도 오차 θ에서 수직거리는
   * `D·sin θ`이고 `D`가 화면 몇 배면 어떤 임계도 전부 기각한다. 그리고 **화면 밖 소실점이
   * 정상이다**(2점 투시의 기본 구도).
   *
   * 획 길이 대비(`AXIS_TOL.vp_dist_ratio`)도 아니다. 그 양은 `(D/L)·sin θ`라
   * **소실점이 멀수록 같은 각도가 큰 값으로 나온다** — 상자 하나에 잉크 노이즈를 얹으면
   * 참 소실점의 부적합도가 0.061로 임계 0.06을 넘어 **검출이 통째로 실패했다**.
   * 각도로 재면 그 의존이 사라진다(`axis.ts`의 `angle_max_deg`가 같은 이유로 도입됐다).
   *
   * 값 2.5는 스윕으로 정했다(`stage0/out/vp_detect.json`). 최적화 대상은 검출 개수가 아니라
   * **오배정**이다 — 소실점이 둘만 잡히는 것은 실패가 아니라 **2점 투시로 읽고 나중에
   * 승격하는 것**이 설계다(§6). 1.5~6° 스윕에서 오배정은 3.0~3.5%로 거의 평탄하고,
   * 2.5°가 3점 검출(37/40)과 오배정(13/423)에서 함께 낫다.
   */
  support_deg: 2.5,
  /**
   * **지지 판정 ②** — 소실점이 획의 가까운 끝에서 **획 길이의 몇 배** 밖에 있어야 하는가.
   *
   * 이것이 없으면 **상자의 꼭짓점이 소실점으로 잡힌다.** 꼭짓점에는 모서리 셋이 정확히
   * 한 점에서 만나므로 "선 3개가 한 점에서 만난다"(§5.1)를 **완벽하게** 만족한다 —
   * 그리고 노이즈가 있으면 꼭짓점 쪽이 참 소실점보다 **더 잘 맞는다**(꼭짓점의 산포는
   * 끝점 오차 몇 px이고 소실점의 산포는 지렛대로 증폭된다). 실제로 그렇게 실패했다.
   *
   * 계획서가 "**같은 방향 클러스터**의 선 3개"라고 쓴 것이 이 조건이다 — 꼭짓점에서 만나는
   * 모서리 셋은 방향이 서로 거의 직교한다. 방향을 직접 군집화하는 대신 **소실점이 획
   * 바깥 멀리 있는가**로 본다: 같은 방향으로 수렴하는 획들만 그 성질을 갖고,
   * 근·원 소실점 어디서나 같은 식으로 작동한다(A-3: 가장 단순한 것).
   */
  min_reach: 1.0,
  /**
   * **지지 판정 ③ — 소실점이 실제로 어디 있는지 정해지는가**(localizability).
   * 지지선 **방향의 최대 각차**가 `support_deg`의 이 배수 이상이어야 한다.
   *
   * 화면 평행 축(c=0)의 획들은 서로 나란하므로 **노이즈만으로도 어딘가에서 만난다** —
   * 그 교점은 아주 멀고 위치가 노이즈에 완전히 지배된다. 그것을 유한 소실점으로 받으면
   * **2점 투시가 3점으로 읽히고 `fFromThreeVps`가 엉뚱한 f를 낸다.**
   * 실제로 그랬다: 2점 구도에서 수직 4획이 `[245, −9252]`에 모여 지지 4를 만들었다.
   *
   * 교점의 위치 불확실도는 `노이즈 / 방향 산포`에 비례하므로 산포를 임계로 쓴다.
   * 측정(`vp_detect.json`): 참 소실점이 무한원인 다발은 산포 **1.3~3.4°**,
   * 유한인 다발은 **4.2~54.5°**다. 1.5배(=3.75°)가 그 사이에 든다.
   *
   * 걸린 다발은 버리지 않는다 — `infinite: true`로 표시하고 그 획들은 **`screen` 축**이 된다
   * (소실점이 없다는 것이 곧 화면 평행이라는 뜻이다, 이론서 2.2).
   */
  min_spread_mult: 1.5,
  /** **3개 이상**(§5.1). 2는 교점이 반드시 생기므로 정보가 없다. */
  min_support: 3,
  /** 이보다 짧은 획은 방향을 못 믿는다 — 화면 대각 대비(`AXIS_TOL.min_len_ratio`와 같다). */
  min_len_ratio: 0.02,
  /** 최소제곱 재적합 후 지지를 다시 모으는 횟수. 근평행 쌍의 교점이 거칠어 한 번으로 부족하다. */
  refit_passes: 2,
  /** 찾을 소실점의 최대 개수. 3점 투시가 상한이다(자유도 0, 이론서 5.3). */
  max_vps: 3,
  /**
   * **씨앗 후보(쌍) 수 상한.** 쌍마다 교점을 시험하므로 비용이 `O(n³)`이고,
   * 획 300개면 3천만 번이 넘어 **측정 하네스가 멈췄다**(L-A.6에서 실제로 겪었다).
   *
   * 상한을 넘으면 쌍을 **결정론적 보폭**으로 건너뛴다(`Math.random` 금지, AS-C9).
   * 씨앗을 덜 보는 것은 **정확도 손실이 아니다** — 씨앗은 지지를 모으는 출발점일 뿐이고
   * 값은 최소제곱 재적합이 준다(§5.1). 같은 소실점을 가리키는 쌍이 여러 개이므로
   * 일부만 봐도 같은 군집에 닿는다. **다만 덜 본다는 사실을 원장에 적는다**(조용한 절단 금지).
   */
  seed_pairs_max: 6000,
};
export type VpCfg = Partial<typeof VP_TOL>;

export const diagOf = (sz: [number, number]) => Math.hypot(sz[0], sz[1]);

/** 획 점열 → 대표 직선. 짧은 획은 뺀다(방향을 못 믿는다). */
export function linesFromStrokes(
  strokes: { id: string; pts2d: Pt2[] }[], imgSize: [number, number], cfg: VpCfg = {},
): DetLine[] {
  const c = { ...VP_TOL, ...cfg };
  const min = c.min_len_ratio * diagOf(imgSize);
  const out: DetLine[] = [];
  for (const s of strokes) {
    const rep = representative(s.pts2d);
    if (rep && rep.len >= min) out.push({ id: s.id, rep });
  }
  return out;
}

/**
 * 후보 하나의 지지 집합과 **가중 점수**.
 *
 * `score`는 개수가 아니라 `Σ (1 − misfit/tol)`이다. **개수로만 세면 반대로 간다** —
 * 지평선 근처의 모서리는 연장하면 **두 수평 소실점을 거의 다 지나므로**(둘 다 지평선 위에 있다)
 * 엉뚱한 중간 지점이 양쪽 축의 획을 함께 긁어모아 지지 6을 만든다. 참 소실점의 지지 4보다 많다.
 * 실제로 상자 하나에서 그것이 나왔고, 그때 검출은 소실점을 **둘밖에** 못 찾았다.
 * 가중을 주면 부적합도 0짜리 4개(4.00)가 0.039짜리 6개(2.1)를 이긴다.
 *
 * _"개수만 세면 반대로 간다"는 이 프로젝트에서 세 번째다(구 D-S9·D-S19의 구제 경로 둘)._
 */
function supportOf(lines: DetLine[], vp: Pt2, c: typeof VP_TOL)
: { ids: string[]; ms: number[]; score: number } {
  const ids: string[] = [], ms: number[] = [];
  let score = 0;
  for (const L of lines) {
    if (vpReach(L.rep, vp) < c.min_reach) continue;
    const a = vpAngle(L.rep, vp);
    if (a <= c.support_deg) { ids.push(L.id); ms.push(a); score += 1 - a / c.support_deg; }
  }
  return { ids, ms, score };
}

/**
 * 대표 직선의 방향과 "먼 쪽 끝점 → 소실점" 방향 사이의 각 φ(도).
 *
 * **`vpMisfit`은 이미 각도량이다.** 코드가 재는 것은 *중점*에서 「먼 끝점→소실점」 직선까지의
 * 수직거리를 획 길이로 나눈 값이고, 중점은 끝점에서 획 길이의 절반이므로
 * ```
 * vpMisfit = (len/2)·sin φ / len = sin φ / 2      →      φ = asin(2·vpMisfit)
 * ```
 * 상한이 0.5라 소실점이 멀어도 발산하지 않는다.
 *
 * ⚠ `axis.ts`의 `angle_max_deg` 주석은 `misfit = (D/L)·sin θ`라 적었는데 **그 유도는 틀렸다**
 * (수치로 확인했다: 획 (0,0)–(100,0), 소실점 (1000,50)에서 `vpMisfit` 0.02497 =
 * `sin φ / 2`이고 `(D/L)·sin θ`는 0.5다). 그 상수는 기본값이 0(꺼짐)이고
 * 그 경로는 L에서 폐기되므로 여기서 고치지 않는다 — **같은 오해를 반복하지 않으려고 적어 둔다.**
 */
export function vpAngle(rep: Rep, vp: Pt2): number {
  const m = vpMisfit(rep, vp);
  if (!Number.isFinite(m) || rep.len < 1e-9) return 90;
  return (Math.asin(Math.min(1, 2 * m)) * 180) / Math.PI;
}

/** 소실점이 획의 **가까운 끝**에서 몇 획 길이만큼 떨어져 있는가. 꼭짓점이면 0이다. */
export function vpReach(rep: Rep, vp: Pt2): number {
  const da = Math.hypot(vp[0] - rep.a[0], vp[1] - rep.a[1]);
  const db = Math.hypot(vp[0] - rep.b[0], vp[1] - rep.b[1]);
  return rep.len < 1e-9 ? 0 : Math.min(da, db) / rep.len;
}

/** 지지선 **방향**의 최대 각차(도). 방향은 부호 없는 0~180°로 접는다. */
export function dirSpread(reps: Rep[]): number {
  const angs = reps.map(r => {
    let a = Math.atan2(r.b[1] - r.a[1], r.b[0] - r.a[0]);
    if (a < 0) a += Math.PI;
    return (a * 180) / Math.PI;
  });
  let m = 0;
  for (const p of angs) for (const q of angs) {
    let d = Math.abs(p - q);
    if (d > 90) d = 180 - d;
    m = Math.max(m, d);
  }
  return m;
}

const median = (xs: number[]): number => {
  if (!xs.length) return Infinity;
  const s = xs.slice().sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/**
 * **소실점 후보 검출.** 지지가 많은 것부터 하나씩 떼어 낸다.
 *
 * 각 반복에서 남은 직선들의 **쌍마다 교점**을 후보로 두고 지지를 센다. 최다 지지가
 * `min_support` 미만이면 멈춘다 — 그것이 "아직 확정할 수 없다"이다.
 *
 * 채택 후 **최소제곱으로 재적합**한다(§5.1 "카메라는 최소제곱으로 다시 푼다").
 * 근평행 쌍의 교점은 노이즈에 거칠어 그 자체로는 소실점 추정치가 못 된다 —
 * 지지를 모으는 **씨앗**으로만 쓰고 값은 재적합이 준다.
 */
/**
 * 지지선들의 **길이² 가중 최소제곱 교점**.
 *
 * ⚠ D-L5 초판은 "가중을 넣어도 중앙값이 안 움직인다 → f 오차는 입력의 몫"이라고 적었고
 * **그것이 틀렸다.** 그 대조는 구도 **하나**(직육면체 하나)에서 돌았고 12모서리의 화면 길이가
 * 서로 비슷해 길이 가중이 균등 가중과 거의 같아졌다. 구도를 다섯으로 늘려 다시 재니
 * f 상대오차 중앙이 균등 0.0921 → `len` 0.0860 → **`len²` 0.0793**으로 움직인다
 * (`vp_detect.json`). 리뷰어가 그 대안 설명을 정확히 짚었다.
 *
 * 길이²가 자연스러운 가중인 이유: 짧은 획의 방향 오차는 끝점 잡음 ÷ 길이로 커지므로
 * 방향의 분산이 `1/len²`에 비례한다 — 그 역수가 가중이다.
 */
function fitVp(sup: DetLine[]): Pt2 | null {
  let a00 = 0, a01 = 0, a11 = 0, b0 = 0, b1 = 0;
  for (const { rep } of sup) {
    const dx = rep.b[0] - rep.a[0], dy = rep.b[1] - rep.a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const nx = -dy / L, ny = dx / L;                 // 법선
    const c = nx * rep.a[0] + ny * rep.a[1];
    const w = L * L;
    a00 += w * nx * nx; a01 += w * nx * ny; a11 += w * ny * ny;
    b0 += w * nx * c; b1 += w * ny * c;
  }
  const det = a00 * a11 - a01 * a01;
  if (Math.abs(det) < 1e-9) return null;
  const x = (a11 * b0 - a01 * b1) / det, y = (a00 * b1 - a01 * b0) / det;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

export function detectVps(
  lines: DetLine[], imgSize: [number, number], cfg: VpCfg = {},
): VpCandidate[] {
  const c = { ...VP_TOL, ...cfg };
  const out: VpCandidate[] = [];
  let pool = lines.slice();


  for (let k = 0; k < c.max_vps; k++) {
    if (pool.length < c.min_support) break;

    // 쌍마다 교점 → 가중 점수. 동점이면 부적합도 중앙값이 작은 쪽.
    // 쌍이 너무 많으면 **결정론적 보폭**으로 건너뛴다(`seed_pairs_max`).
    const nPairs = (pool.length * (pool.length - 1)) / 2;
    const stride = nPairs > c.seed_pairs_max ? Math.ceil(nPairs / c.seed_pairs_max) : 1;
    let seen = 0;
    let best: { vp: Pt2; ids: string[]; res: number; score: number } | null = null;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (stride > 1 && (seen++ % stride) !== 0) continue;
        const p = lineIntersect(pool[i].rep.a, pool[i].rep.b, pool[j].rep.a, pool[j].rep.b);
        if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        const { ids, ms, score } = supportOf(pool, p, c);
        const res = median(ms);
        if (!best || score > best.score || (score === best.score && res < best.res)) {
          best = { vp: p, ids, res, score };
        }
      }
    }
    if (!best || best.ids.length < c.min_support) break;

    // 최소제곱 재적합 → 지지 재수집. 씨앗 교점의 거칠기를 여기서 턴다.
    let vp = best.vp, ids = best.ids, res = best.res, score = best.score;
    for (let pass = 0; pass < c.refit_passes; pass++) {
      const fit = fitVp(pool.filter(L => ids.includes(L.id)));
      if (!fit) break;
      const got = supportOf(pool, fit, c);
      // 재적합이 점수를 잃으면 되돌린다 — 최소제곱은 이상점 하나에 끌려간다
      if (got.score < score) break;
      vp = fit; ids = got.ids; res = median(got.ms); score = got.score;
    }
    if (ids.length < c.min_support) break;

    const spreadDeg = dirSpread(pool.filter(L => ids.includes(L.id)).map(L => L.rep));
    out.push({
      vp, support: ids, residual: res, spreadDeg,
      infinite: !isFiniteVp(vp, imgSize) || spreadDeg < c.min_spread_mult * c.support_deg,
    });
    pool = pool.filter(L => !ids.includes(L.id));
  }

  return reassign(out, lines, imgSize, c);
}

/**
 * **마지막에 모든 직선을 가장 잘 맞는 소실점으로 다시 배정한다.**
 *
 * 탐욕적으로 하나씩 떼어 내면 먼저 뽑힌 소실점이 **경계에 있는 직선을 데려간다** —
 * 지평선 근처 모서리가 그렇다(위 `supportOf`). 그 직선은 다음 소실점에서 빠지므로
 * 두 번째 군집이 지지 3을 못 채우고 소실점이 하나 사라진다.
 *
 * 순서 의존을 없애는 방법은 간단하다: **전부 찾은 뒤 최소 부적합도로 다시 가른다.**
 * 그 뒤 각 군집으로 한 번 더 최소제곱 재적합한다 — 그것이 §5.1이 말한
 * "카메라는 최소제곱으로 다시 푼다"의 자리다.
 */
function reassign(
  cands: VpCandidate[], lines: DetLine[], imgSize: [number, number], c: typeof VP_TOL,
): VpCandidate[] {
  if (cands.length < 2) return cands;
  const groups: DetLine[][] = cands.map(() => []);
  for (const L of lines) {
    let bi = -1, bm = c.support_deg;
    cands.forEach((cd, i) => {
      if (vpReach(L.rep, cd.vp) < c.min_reach) return;
      const a = vpAngle(L.rep, cd.vp);
      if (a <= bm) { bm = a; bi = i; }
    });
    if (bi >= 0) groups[bi].push(L);
  }
  const out: VpCandidate[] = [];
  cands.forEach((cd, i) => {
    const g = groups[i];
    if (g.length < c.min_support) return;
    const vp = fitVp(g) ?? cd.vp;
    const ms = g.map(L => vpAngle(L.rep, vp));
    const spreadDeg = dirSpread(g.map(L => L.rep));
    out.push({
      vp, support: g.map(L => L.id), residual: median(ms), spreadDeg,
      infinite: !isFiniteVp(vp, imgSize) || spreadDeg < c.min_spread_mult * c.support_deg,
    });
  });
  return out;
}

/**
 * **축 번호 배정.** 관례상 `vps[2]`가 **수직축**이다(화면 상태 표시·`groundFrame`과 같은 순서).
 *
 * 화면에서 가장 세로에 가까운 지지 방향을 가진 후보가 수직이고, 나머지 둘은 화면 x 순서다.
 * **이것은 관례이지 측정이 아니다** — 사용자가 뒤집힌 구도를 그리면 틀린다.
 * 틀려도 좌표계 라벨만 바뀌고 기하는 같으므로 놓아 둔다(A-3: 가장 단순한 것).
 */
export function orderVps(cands: VpCandidate[], lines: DetLine[]): (Pt2 | null)[] {
  const byId = new Map(lines.map(L => [L.id, L.rep]));
  /** 그 후보를 지지하는 직선들의 평균 |dy|/|dx| — 클수록 화면에서 세로다. */
  const verticality = (c: VpCandidate): number => {
    let s = 0, n = 0;
    for (const id of c.support) {
      const r = byId.get(id);
      if (!r) continue;
      const dx = Math.abs(r.b[0] - r.a[0]), dy = Math.abs(r.b[1] - r.a[1]);
      s += dy / (dx + dy + 1e-12); n += 1;
    }
    return n ? s / n : 0;
  };
  const rest = cands.slice();
  const vps: (Pt2 | null)[] = [null, null, null];
  if (!rest.length) return vps;
  rest.sort((a, b) => verticality(b) - verticality(a));
  const up = rest.shift()!;
  vps[2] = up.vp;
  rest.sort((a, b) => a.vp[0] - b.vp[0]);
  if (rest[0]) vps[0] = rest[0].vp;
  if (rest[1]) vps[1] = rest[1].vp;
  return vps;
}

/**
 * **획을 축별로 분류한다**(§5.2의 첫 단계). 검출이 이미 군집을 만들었으므로 다시 판정하지 않는다 —
 * 지지 집합이 곧 축이다.
 *
 * 소실점이 안 잡힌 축은 **화면 평행**이다(c=0, 이론서 2.2). 그런데 그 라벨을 함부로 주면
 * 3점 구도에서 군집에 못 든 획이 우연히 세로에 가깝다는 이유로 `screen`이 된다 —
 * 조용히 틀린 축이다(A-3). 그래서 **개수로 잠근다**: 소실점 `k`개가 잡혔으면
 * 화면 평행 축은 `3 − k`개뿐이고, `k = 3`이면 `screen` 라벨을 아예 주지 않는다(5.3 자유도 회계).
 *
 * 어느 쪽도 아니면 `free`(미분류)다. **미분류는 놓지 않고 화면에 남긴다**(D-C2).
 */
export function classifyByDetection(
  lines: DetLine[], cands: VpCandidate[], vps: (Pt2 | null)[], imgSize: [number, number],
  screenParallel = 0.05,
): Map<string, Axis> {
  const out = new Map<string, Axis>();
  // 지지 집합 → 축 번호. `assignAxes`가 정한 순서와 같은 소실점을 찾아 붙인다
  cands.forEach(cd => {
    const ax = vps.findIndex(v => v && v[0] === cd.vp[0] && v[1] === cd.vp[1]);
    if (ax < 0) return;
    for (const id of cd.support) out.set(id, ax as 0 | 1 | 2);
  });
  // 무한원 다발의 지지선은 곧바로 `screen`이다 — 소실점이 없다는 것이 화면 평행이라는 뜻이다
  for (const cd of cands) {
    if (!cd.infinite) continue;
    for (const id of cd.support) if (!out.has(id)) out.set(id, "screen");
  }
  const nScreen = 3 - cands.filter(c => !c.infinite).length;
  for (const L of lines) {
    if (out.has(L.id)) continue;
    if (nScreen <= 0) { out.set(L.id, "free"); continue; }
    const dx = Math.abs(L.rep.b[0] - L.rep.a[0]) / L.rep.len;
    const dy = Math.abs(L.rep.b[1] - L.rep.a[1]) / L.rep.len;
    out.set(L.id, Math.min(dx, dy) <= screenParallel ? "screen" : "free");
  }
  return out;
}

/**
 * **수직축이 아직 안 잡혔을 때**는 `vps[2]`를 비워 두면 안 된다 —
 * 1점 투시에서 잡힌 소실점 하나는 **깊이축**이고 수직이 아니다.
 *
 * 그래서 개수로 갈린다:
 * - 1개 → `vps[0]`(깊이축). 수직·수평은 화면 평행이다(c=0)
 * - 2개 → `vps[0]`, `vps[1]`(두 수평축). 수직은 화면 평행이다
 * - 3개 → 위 `orderVps`
 *
 * 1·2점에서 수직을 화면 평행으로 두는 것은 **가정이 아니라 정의다** —
 * 소실점이 안 잡혔다는 것이 곧 그 축이 화면에 평행하다는 뜻이다(이론서 2.2).
 */
export function assignAxes(cands: VpCandidate[], lines: DetLine[]): (Pt2 | null)[] {
  // **유한 소실점만 축 번호를 받는다.** 무한원 다발은 `screen`이므로 `vps`에 들어가지 않는다
  const fin = cands.filter(c => !c.infinite);
  if (fin.length >= 3) return orderVps(fin.slice(0, 3), lines);
  const vps: (Pt2 | null)[] = [null, null, null];
  const sorted = fin.slice().sort((a, b) => a.vp[0] - b.vp[0]);
  sorted.forEach((c, i) => { if (i < 2) vps[i] = c.vp; });
  return vps;
}
