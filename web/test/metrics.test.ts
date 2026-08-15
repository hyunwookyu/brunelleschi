// **현재 지표 정의를 원장에 낸다.** 산출: `stage0/out/metrics.json`.
// `selfcheck.py`가 이것을 기준으로 다른 산출물의 `metrics` 스냅샷을 대조해 **STALE(정의)**를 잡는다.
//
// 상수 스냅샷과 같은 자리이되 잡는 것이 다르다:
//
// ```
// 상수 스냅샷  →  임계값이 바뀌었는데 안 다시 돌린 산출물
// 정의 스냅샷  →  **지표를 재는 식**이 바뀌었는데 안 다시 돌린 산출물   ← 여기
// ```
//
// L-B.7에서 후자가 새어 나갔다 — 상수는 같았고 `promote.segErr`가 게이지를 안 없애서
// 같은 2416획이 `axis_live.json` 0.1222 대 `promote.json` 0.1533이었다.
// 두 원장을 나란히 읽은 문서가 잘못된 비교를 했고 STALE은 아무것도 안 짚었다(리뷰어 [1]).
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호: #1(문서가 원장보다 뒤처진다) ·
// #3(지표가 정의의 귀결) · #13(절단) · #14(분자/분모) · #17(단일 출처) · #25(원장 밖 측정).
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  metricsSnapshot, fitGauge, perStrokeError, perStrokeErrorMap, segShapeError, axisDirErrors, silentWrong,
  SILENT_CUTS, type PlacedMap,
} from "./metrics.js";
import type { Vec3 } from "../src/s3d/geom3d.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

const seg = (a: Vec3, b: Vec3) => ({ a, b });

describe("지표 정의 스냅샷", () => {
  it("현재 정의를 stage0/out/metrics.json에 낸다", () => {
    const snap = metricsSnapshot();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "metrics.json"), JSON.stringify({
      spec: "형태 오차·축 오차·조용히 틀림의 **현재 정의**. 산출물마다 든 스냅샷과 대조해 STALE을 잡는다.",
      why: (
        "상수 스냅샷은 **임계값**만 본다. L-B.7에서 상수는 같은 채 형태 오차의 **식**이 갈렸고"
        + "(게이지 유무), 같은 2416획이 두 원장에서 0.1222와 0.1533으로 나왔다. "
        + "STALE이 아무것도 안 짚었다 — 잡을 대상이 상수가 아니었기 때문이다."
      ),
      how: [
        "지표 함수는 `web/test/metrics.ts` 한 곳에만 있다. 하네스가 지역 사본을 만들지 않는다.",
        "각 측정 하네스가 `metric_defs: metricsSnapshot()`을 산출물에 넣는다.",
        "`python selfcheck.py`가 이 파일과 대조해 다르면 **STALE(정의)** — 어느 지표가 다른지 함께 낸다.",
      ],
      gauge_policy: (
        "`liftAll`이 깊이를 `gauge_height`로 정규화하므로 **절대 배율은 자유도**다. "
        + "형태 오차는 게이지를 정하고 잰다. 한 번에 푸는 집합은 그 집합에서 적합하고(`fit`), "
        + "**승격 회수 획은 확정 집합의 게이지를 고정으로 받는다** — 회수 획만 다시 적합하면 "
        + "'이미 확정된 틀에 붙는다'는 성질이 지워진다."
      ),
      ...snap,
    }, null, 2), "utf-8");
    expect(snap.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("해시는 결정론적이고 **소스에서** 온다 — 트랜스파일러에 안 흔들린다", () => {
    expect(metricsSnapshot().hash).toBe(metricsSnapshot().hash);
    expect(metricsSnapshot().names.length).toBeGreaterThanOrEqual(7);
    // `fallback`이면 소스를 못 읽은 것이고 그 실행의 해시는 대조에 못 쓴다
    expect(metricsSnapshot().source).toBe("file");
  });
});

describe("형태 오차 — 게이지가 무엇을 하는가", () => {
  const edges = [seg([0, 0, 0], [1, 0, 0]), seg([0, 0, 0], [0, 1, 0]), seg([0, 0, 0], [0, 0, 1])];
  const diag = Math.sqrt(3);

  it("완벽한 배치는 오차 0이다", () => {
    const placed: PlacedMap = new Map(edges.map((e, i) => [`s${i}`, e]));
    expect(Math.max(...perStrokeError(placed, edges, diag))).toBeLessThan(1e-12);
  });

  it("**전역 배율만 다른 배치는 오차 0이다** — 그것이 게이지를 없앤다는 뜻이다", () => {
    const k = 3.7;
    const placed: PlacedMap = new Map(edges.map((e, i) =>
      [`s${i}`, seg([e.a[0] * k, e.a[1] * k, e.a[2] * k], [e.b[0] * k, e.b[1] * k, e.b[2] * k])]));
    expect(Math.max(...perStrokeError(placed, edges, diag))).toBeLessThan(1e-9);
    expect(fitGauge(placed, edges)).toBeCloseTo(1 / k, 9);
  });

  it("**반례**: 게이지를 1로 고정하면 같은 배치가 0이 아니다 — 옛 `segErr`가 이것이었다", () => {
    const k = 3.7;
    const placed: PlacedMap = new Map(edges.map((e, i) =>
      [`s${i}`, seg([e.a[0] * k, e.a[1] * k, e.a[2] * k], [e.b[0] * k, e.b[1] * k, e.b[2] * k])]));
    const withOne = perStrokeError(placed, edges, diag, 1);
    expect(Math.max(...withOne)).toBeGreaterThan(1);   // 배율 차이가 통째로 '형태 오차'로 샌다
  });

  it("**반례**: 한 획이 어긋나면 그 획이 가장 크다 — 게이지가 그것을 못 지운다", () => {
    const placed: PlacedMap = new Map(edges.map((e, i) => [`s${i}`, e]));
    placed.set("s1", seg([0, 0, 0], [0, 0.2, 0.8]));
    const m = perStrokeErrorMap(placed, edges, diag);
    expect(m.get("s1")!).toBeGreaterThan(0.2);
    expect(m.get("s1")!).toBeGreaterThan(m.get("s0")!);
    expect(m.get("s1")!).toBeGreaterThan(m.get("s2")!);
  });

  it("⚠ **적합 게이지는 한 획의 오차를 나머지에 번지게 한다** — 승격이 고정 게이지를 쓰는 이유다", () => {
    // 맞는 획 셋 + 어긋난 획 하나. 적합 게이지는 넷을 함께 맞추므로 **맞는 셋도 0이 아니다**
    const placed: PlacedMap = new Map(edges.map((e, i) => [`s${i}`, e]));
    placed.set("s1", seg([0, 0, 0], [0, 0.2, 0.8]));
    const fitted = perStrokeErrorMap(placed, edges, diag);
    expect(fitted.get("s0")!).toBeGreaterThan(1e-6);          // 번졌다
    // 게이지를 밖에서 고정하면 맞는 획은 정확히 0이다
    const fixed = perStrokeErrorMap(placed, edges, diag, 1);
    expect(fixed.get("s0")!).toBeLessThan(1e-12);
    expect(fixed.get("s1")!).toBeGreaterThan(0.2);
  });

  it("끝점 뒤집힘은 오차가 아니다", () => {
    const placed: PlacedMap = new Map([["s0", seg([1, 0, 0], [0, 0, 0])]]);
    expect(perStrokeError(placed, edges, diag)[0]).toBeLessThan(1e-9);
  });

  it("**고정 게이지는 밖에서 온 배율을 그대로 쓴다** — 승격이 쓰는 형태다", () => {
    // 확정 집합이 배율 2로 놓였다 → 게이지 0.5. 회수 획도 배율 2면 오차 0이어야 한다
    const confirmed: PlacedMap = new Map([
      ["s0", seg([0, 0, 0], [2, 0, 0])], ["s1", seg([0, 0, 0], [0, 2, 0])],
    ]);
    const k = fitGauge(confirmed, edges);
    expect(k).toBeCloseTo(0.5, 9);
    expect(segShapeError(seg([0, 0, 0], [0, 0, 2]), edges[2], diag, k)).toBeLessThan(1e-9);
    // 회수 획이 **다른 배율**로 놓이면 고정 게이지가 그것을 잡아낸다
    expect(segShapeError(seg([0, 0, 0], [0, 0, 3]), edges[2], diag, k)).toBeGreaterThan(0.2);
  });
});

describe("축 방향 오차", () => {
  const principal: [number, number] = [480, 336];
  const f = 1000;
  const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  it("주점의 소실점은 z축이고 오차 0이다", () => {
    expect(axisDirErrors([principal], principal, f, axes)[0]).toBeLessThan(1e-9);
  });

  it("**반례**: 소실점을 옮기면 오차가 커진다 — 안 움직이면 지표가 아니다(#5·#30)", () => {
    const off: [number, number] = [principal[0] + 100, principal[1]];
    expect(axisDirErrors([off], principal, f, axes)[0]).toBeGreaterThan(3);
  });

  it("null 소실점은 분모에서 빠진다(#11)", () => {
    expect(axisDirErrors([null, principal, null], principal, f, axes).length).toBe(1);
  });
});

describe("조용히 틀림", () => {
  it("절단 셋을 다 낸다(#13) — 분자/분모로 적는다(#14)", () => {
    const r = silentWrong([0.05, 0.15, 0.3, 0.9]);
    expect(SILENT_CUTS).toEqual([0.1, 0.2, 0.5]);
    expect(r.cut_0_1).toBe("3/4");
    expect(r.cut_0_2).toBe("2/4");
    expect(r.cut_0_5).toBe("1/4");
  });
});
