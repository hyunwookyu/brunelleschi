// S-7 (0) **측정 경로와 앱 경로가 갈라지지 않는지 기계로 잠근다** —
// 산출: `stage0/out/wiring.json`.
//
// **실제로 갈라져 있었다.** §4.3 면 위 사선을 S-6 (2)가 측정해 놓고 앱은 그 경로를 안 켜고
// 있었다(`settle(drawn, ctx)`가 옵션 없이 불렸다). 측정만 되고 배선이 안 된 상태로 두 단계가
// 지나갔다. **STALE과 같은 성격의 문제다** — 사람이 기억해서 잡을 종류가 아니다.
//
// 이 테스트가 잠그는 것 셋:
//   1. `PlaceOpts`의 모든 키가 **배선 표에 등록**돼 있다(등록 누락은 `appPlace.ts`가 컴파일
//      단계에서 잡는다. 여기서는 런타임으로 한 번 더 본다).
//   2. `both`로 등록한 옵션은 **앱의 두 경로에 실제로 들어 있다**.
//   3. `measure`로 등록한 옵션은 **왜 앱이 안 켜는지**가 적혀 있다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FIRST_VIEW_OPTS, VIEW_OPTS, PLACE_OPT_WIRING } from "../src/s3d/appPlace.js";
import { PLACE_TOL } from "../src/s3d/stroke.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SRC = resolve(ROOT, "web", "src");

const keys = Object.keys(PLACE_OPT_WIRING) as (keyof typeof PLACE_OPT_WIRING)[];

describe("S-7 (0) 측정-앱 경로 배선", () => {
  it("`both`로 등록한 옵션은 앱의 **두 경로에 다 들어 있다**", () => {
    for (const k of keys) {
      if (PLACE_OPT_WIRING[k].where !== "both") continue;
      expect(FIRST_VIEW_OPTS, `첫 시점에 ${k}가 없다`).toHaveProperty(k);
      expect(VIEW_OPTS, `돌린 시점에 ${k}가 없다`).toHaveProperty(k);
    }
  });

  it("`first`로 등록한 옵션은 첫 시점에만 있다 — **원장 인용이 있어야 한다**", () => {
    for (const k of keys) {
      if (PLACE_OPT_WIRING[k].where !== "first") continue;
      expect(FIRST_VIEW_OPTS).toHaveProperty(k);
      expect(VIEW_OPTS[k], `${k}가 돌린 시점에도 켜져 있다`).toBeUndefined();
      // 첫 시점 전용은 **측정이 막았을 때만** 허용한다 — 근거 원장을 적게 강제한다
      expect(PLACE_OPT_WIRING[k].why, `${k}: 첫 시점 전용의 근거 원장이 없다`).toMatch(/\.json|D-S\d+/);
    }
  });

  it("`view`로 등록한 옵션은 돌린 시점에만 있다 — 그리고 **이유가 시점 의존이어야 한다**", () => {
    for (const k of keys) {
      if (PLACE_OPT_WIRING[k].where !== "view") continue;
      expect(VIEW_OPTS).toHaveProperty(k);
      expect(FIRST_VIEW_OPTS[k], `${k}가 첫 시점에도 켜져 있다 — 시점 의존이 아니면 both다`).toBeUndefined();
      expect(PLACE_OPT_WIRING[k].why).toMatch(/시점/);
    }
  });

  it("`measure`로 등록한 옵션은 앱에 없고 **왜 안 켜는지**가 적혀 있다", () => {
    for (const k of keys) {
      if (PLACE_OPT_WIRING[k].where !== "measure") continue;
      expect(FIRST_VIEW_OPTS[k]).toBeUndefined();
      expect(VIEW_OPTS[k]).toBeUndefined();
      expect(PLACE_OPT_WIRING[k].why.length, `${k}의 이유가 비어 있다`).toBeGreaterThan(20);
    }
  });

  it("두 경로의 차이는 **표에 등록된 것뿐**이다 — 그 밖의 차이는 배선 누락이다", () => {
    const diff = [...new Set([...Object.keys(FIRST_VIEW_OPTS), ...Object.keys(VIEW_OPTS)])]
      .filter(k => FIRST_VIEW_OPTS[k as keyof typeof FIRST_VIEW_OPTS]
                !== VIEW_OPTS[k as keyof typeof VIEW_OPTS]);
    const allowed = keys.filter(k => PLACE_OPT_WIRING[k].where === "view"
                                  || PLACE_OPT_WIRING[k].where === "first");
    expect(diff.sort()).toEqual([...allowed].sort());
  });

  it("**앱이 옵션 객체를 직접 적지 않는다** — `appPlace.ts`에서 가져온다", () => {
    const main = readFileSync(resolve(SRC, "main.ts"), "utf-8");
    // 옵션 없는 `settle(x, y)` 호출이 남아 있으면 그것이 §4.3에서 실제로 일어난 결함이다
    const bare = main.match(/settle\([^)]*\)/g)?.filter(c => c.split(",").length < 3) ?? [];
    expect(bare, `옵션 없이 부른 settle이 있다: ${bare.join(" / ")}`).toEqual([]);
    expect(main).toContain("FIRST_VIEW_OPTS");
    expect(main).toContain("VIEW_OPTS");
  });

  it("원장에 배선 표를 남긴다", () => {
    const report = {
      spec: "S-7 (0) 측정 경로와 앱 경로의 배선. **측정했다고 앱이 쓰는 것은 아니다.**",
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
      why: (
        "§4.3 면 위 사선을 S-6 (2)가 측정해 놓고 **앱은 그 경로를 안 켜고 있었다** — "
        + "`settle(drawn, ctx)`가 옵션 없이 불렸고 두 단계가 그대로 지나갔다. "
        + "측정 하네스와 앱이 **각자 옵션 객체를 적는** 구조였기 때문이다. "
        + "이제 `src/s3d/appPlace.ts` 하나에서 가져오고, 이 테스트가 어긋남을 잡는다."
      ),
      how_locked: [
        "`appPlace.ts`의 `_EVERY_OPTION_REGISTERED`가 **컴파일 단계**에서 미등록 옵션을 잡는다",
        "이 테스트가 `both`/`view`/`measure` 약속을 런타임으로 확인한다",
        "`main.ts`에 옵션 없는 `settle` 호출이 남아 있으면 실패한다",
      ],
      first_view: FIRST_VIEW_OPTS,
      view: VIEW_OPTS,
      wiring: PLACE_OPT_WIRING,
      /** 앱이 켠 값이 상수와 같은지 — 상수만 바꾸고 앱이 안 따라가는 것도 같은 유형이다. */
      values_from_constants: {
        far_end_check: PLACE_TOL.far_end_check,
        face_far_end: PLACE_TOL.face_far_end,
        span_far_end: PLACE_TOL.span_far_end,
        retry_as_face: PLACE_TOL.retry_as_face,
        view_depth_envelope: PLACE_TOL.view_depth_envelope,
      },
      counts: {
        n_options: keys.length,
        both: keys.filter(k => PLACE_OPT_WIRING[k].where === "both").length,
        first_only: keys.filter(k => PLACE_OPT_WIRING[k].where === "first").length,
        view_only: keys.filter(k => PLACE_OPT_WIRING[k].where === "view").length,
        measure_only: keys.filter(k => PLACE_OPT_WIRING[k].where === "measure").length,
        call_arg: keys.filter(k => PLACE_OPT_WIRING[k].where === "arg").length,
      },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "wiring.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(report.counts.n_options).toBeGreaterThan(8);
  });
});
