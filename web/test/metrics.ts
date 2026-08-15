// **지표 정의의 유일한 집.** 원장 하네스는 형태 오차·축 오차·조용히 틀림을 여기서만 가져온다.
//
// ## 왜 따로 뺐나
//
// `perStrokeError`를 `scene3d.ts`로 옮긴 것만으로는 재발을 못 막았다 —
// L-B.7의 `promote.test.ts`가 **자기 `segErr`를 새로 썼고**, 같은 2416획이
// `axis_live.json`에서 중앙 **0.1222**, `promote.json`에서 **0.1533**으로 나왔다.
// 두 값을 나란히 읽은 문서가 잘못된 비교를 했다(리뷰어 L-B.7 [1]).
//
// 상수 스냅샷(STALE)이 이것을 못 잡는다 — **상수는 같고 정의가 달랐다.**
// 그래서 이 파일은 상수와 같은 방식으로 **정의 해시**를 낸다:
//   `metricsSnapshot()` → 각 지표 함수의 소스 해시 → 산출물의 `metrics` 필드
//   → `selfcheck.py`가 `stage0/out/metrics.json`(현재)과 대조 → 다르면 **STALE(정의)**
//
// ## 게이지(전역 배율)를 명시한다 — 이것이 두 값이 갈린 실제 원인이다
//
// `liftAll`은 깊이 배율을 `gauge_height`로 정규화하므로 **결과 좌표의 절대 배율은
// 자유도**다(이론서 16.2·16.4 — 깊이 스케일의 출처는 `fSource` 하나다).
// 배율을 안 없애고 참값과 빼면 그 차이는 **형태 오차가 아니라 게이지 차이**다.
// 따라서 형태 오차는 반드시 게이지를 정하고 잰다. 정하는 방법이 셋이고 **뜻이 다르다**:
//
// | 게이지 | 뜻 | 쓰는 곳 |
// |---|---|---|
// | `fit`(기본) | 잰 집합 자체에서 최소제곱 적합 | 한 번에 푸는 확정 집합 — L-A/L-B의 `lift_*`·`axis_live` |
// | 고정값 | **다른 집합에서 적합한 배율**을 그대로 쓴다 | **승격** — 회수 획은 이미 확정된 틀에 붙는다 |
// | `1` | 배율 자유도를 없다고 본다 | **틀리다.** 옛 `segErr`가 이것이었다 |
//
// 승격에서 `fit`을 쓰면 **회수 획만 따로 배율을 다시 맞추는 것**이라
// "이미 확정된 배율에 붙는다"는 성질이 지워진다(리뷰어 [1]의 단서).
// 그래서 승격은 **확정 집합에서 적합한 게이지를 고정으로 넘긴다.**
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { norm3, sub3, mul3, dot3, unit3, axisDirection, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { stableHash } from "./constants.js";

export interface TrueSeg { a: Vec3; b: Vec3 }
export type PlacedMap = Map<string, TrueSeg>;

/** `placed`의 키 규약 `s<인덱스>` → `edges`의 인덱스. **한 곳에서만 판다.** */
export const edgeIndexOf = (id: string): number => +id.slice(1);

/** 끝점 뒤집힘을 가려낸다 — 짝지어 잰 거리 합이 작은 쪽. */
function pairEnds(seg: TrueSeg, t: TrueSeg, k: number): [Vec3, Vec3][] {
  const d0 = norm3(sub3(mul3(seg.a, k), t.a)) + norm3(sub3(mul3(seg.b, k), t.b));
  const d1 = norm3(sub3(mul3(seg.a, k), t.b)) + norm3(sub3(mul3(seg.b, k), t.a));
  return d0 <= d1 ? [[seg.a, t.a], [seg.b, t.b]] : [[seg.a, t.b], [seg.b, t.a]];
}

/**
 * **전역 배율 적합** — 2단이다. 거리비로 대충 잡아 끝점 짝을 정하고(k0),
 * 그 짝 위에서 최소제곱 배율을 낸다. 짝을 배율에 의존해 정하므로 순서가 뒤집히면 안 된다.
 *
 * 빈 집합이면 1을 낸다 — **그 경우 형태 오차를 인용하지 않는다**(분모가 0이다).
 */
export function fitGauge(placed: PlacedMap, edges: TrueSeg[]): number {
  let n0 = 0, d0 = 0;
  placed.forEach((seg, id) => {
    const t = edges[edgeIndexOf(id)];
    if (!t) return;
    n0 += norm3(t.a) + norm3(t.b); d0 += norm3(seg.a) + norm3(seg.b);
  });
  const k0 = d0 > 1e-18 ? n0 / d0 : 1;
  let num = 0, den = 0;
  placed.forEach((seg, id) => {
    const t = edges[edgeIndexOf(id)];
    if (!t) return;
    for (const [p, q] of pairEnds(seg, t, k0)) {
      for (let c = 0; c < 3; c++) { num += p[c] * q[c]; den += p[c] * p[c]; }
    }
  });
  return den > 1e-18 ? num / den : 1;
}

/**
 * **한 세그먼트의 형태 오차** — 주어진 게이지에서 두 끝점 오차의 **최댓값**을 구조 대각으로 나눈다.
 * 최댓값이다(평균이 아니다) — 한쪽 끝만 크게 어긋난 배치를 평균이 가린다.
 */
export function segShapeError(seg: TrueSeg, t: TrueSeg, diag: number, gauge: number): number {
  let m = 0;
  for (const [p, q] of pairEnds(seg, t, gauge)) {
    m = Math.max(m, norm3(sub3(mul3(p, gauge), q)) / diag);
  }
  return m;
}

/**
 * **획별 형태 오차(Map)** — `gauge`를 주면 그것을 쓰고, 안 주면 `placed`에서 적합한다.
 * ⚠ 게이지를 생략하는 것은 **"이 집합만으로 배율이 정해진다"는 주장**이다.
 * 승격처럼 배율이 밖에서 오면 반드시 넘긴다.
 */
export function perStrokeErrorMap(
  placed: PlacedMap, edges: TrueSeg[], diag: number, gauge?: number,
): Map<string, number> {
  const k = gauge ?? fitGauge(placed, edges);
  const out = new Map<string, number>();
  placed.forEach((seg, id) => {
    const t = edges[edgeIndexOf(id)];
    if (t) out.set(id, segShapeError(seg, t, diag, k));
  });
  return out;
}

/** 위와 같은 양, 배열로. 요약 통계에 바로 넣는 형태다. */
export function perStrokeError(
  placed: PlacedMap, edges: TrueSeg[], diag: number, gauge?: number,
): number[] {
  return [...perStrokeErrorMap(placed, edges, diag, gauge).values()];
}

/**
 * **축 방향 오차(도)** — 소실점에서 복원한 방향과 참 축 셋 중 가장 가까운 것의 각차.
 * 부호와 축 순서에 무관하다(`|dot|`) — 검출이 축 번호를 바꿔 다는 것은 여기서 재는 양이 아니다.
 * ⚠ 그래서 이 값은 **오배정을 못 본다.** 오배정은 배치 지표가 본다(PITFALLS #27).
 */
export function axisDirErrors(
  vps: readonly (Pt2 | null)[], principal: Pt2, f: number, axes: readonly Vec3[],
): number[] {
  const out: number[] = [];
  for (const v of vps) {
    if (!v) continue;
    const d = unit3(axisDirection(v, principal, f));
    let best = 90;
    for (const t of axes) {
      best = Math.min(best, (Math.acos(Math.min(1, Math.abs(dot3(d, unit3(t))))) * 180) / Math.PI);
    }
    out.push(best);
  }
  return out;
}

/** **절단을 하나 고르지 않는다**(PITFALLS #13). 이 셋이 원장 전체의 공통 절단이다. */
export const SILENT_CUTS = [0.1, 0.2, 0.5] as const;

/**
 * **조용히 틀린 배치** — 놓였는데 형태 오차가 절단을 넘는 것.
 * 분모는 **놓인 것**이고 분자/분모로 적는다(PITFALLS #14).
 */
export function silentWrong(errs: readonly number[]): Record<string, string> {
  const n = errs.length;
  const out: Record<string, string> = {};
  for (const c of SILENT_CUTS) {
    out[`cut_${String(c).replace(".", "_")}`] = `${errs.filter(e => e > c).length}/${n}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 정의 스냅샷 — 상수 스냅샷과 같은 자리, 같은 방식
// ---------------------------------------------------------------------------

/** 이 파일에서 정의된 지표. 목록 자체도 해시에 들어간다 — 지우면 해시가 움직인다. */
export const METRIC_NAMES = [
  "pairEnds", "fitGauge", "segShapeError", "perStrokeErrorMap", "perStrokeError",
  "axisDirErrors", "silentWrong",
] as const;

export interface MetricsSnapshot {
  hash: string;
  names: readonly string[];
  cuts: readonly number[];
  source: "file" | "fallback";
  note: string;
}

/**
 * 산출물에 넣을 **정의 스냅샷**. **이 파일의 소스 텍스트**에서 해시를 낸다 —
 * 사람이 버전을 올려 주기를 기다리지 않는다(그것이 잊히는 것이 애초의 문제다).
 *
 * ⚠ **`Function.prototype.toString()`을 쓰지 않는다.** 첫 판이 그랬는데
 * vitest(esbuild)와 Playwright의 TS 변환이 **같은 코드에 다른 문자열**을 내서
 * 두 러너의 산출물이 서로 STALE로 떴다(`0ef2a685` 대 `ead43fb8`). 그것은
 * **지워지지 않는 거짓 양성**이다 — 다시 돌려도 러너가 다르면 또 갈린다.
 * 소스 파일은 러너와 무관하다.
 *
 * 주석과 공백은 지운다 — 설명을 고쳤다고 모든 원장을 다시 돌릴 이유는 없다.
 * (⚠ 그 대가로 **주석에만 적힌 규약이 바뀌는 것은 안 잡힌다.**)
 */
export function metricsSnapshot(): MetricsSnapshot {
  let text: string | null = null;
  try {
    // 하네스는 전부 Node에서 돈다(vitest·Playwright 러너 모두). 번들되면 실패하고 폴백한다.
    // ⚠ `require`로 받으면 **ESM 러너(Playwright)에서 폴백으로 떨어진다** — 실제로 그랬고
    // 두 러너의 해시가 갈렸다(`d22cafb2` 대 `3761f3df`). 정적 import여야 한다.
    text = readFileSync(fileURLToPath(import.meta.url), "utf-8");
  } catch {
    text = null;
  }
  const norm = text == null ? null
    : text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?<!:)\/\/[^\n]*/g, " ")
          .replace(/\s+/g, " ").trim();
  const body = norm ?? METRIC_NAMES.join(",");
  return {
    hash: stableHash(`${body}|names:${METRIC_NAMES.join(",")}|cuts:${SILENT_CUTS.join(",")}`),
    names: METRIC_NAMES,
    cuts: SILENT_CUTS,
    source: norm == null ? "fallback" : "file",
    note: (
      "이 실행이 쓴 **지표 정의**의 해시(`web/test/metrics.ts`의 소스, 주석·공백 제외). "
      + "`selfcheck.py`가 현재 정의(`stage0/out/metrics.json`)와 대조해 다르면 "
      + "**STALE(정의)**로 표시한다. 상수 스냅샷이 못 잡는 종류다 — "
      + "L-B.7에서 상수는 같고 형태 오차 정의만 갈렸다. "
      + "`source: \"fallback\"`이면 소스를 못 읽은 것이고 그 실행의 해시는 신뢰하지 않는다."
    ),
  };
}
