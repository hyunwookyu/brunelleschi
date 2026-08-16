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

  /**
   * **⚠ 이 검사의 대상이 L 전환에서 사라졌다**(2026-08-16, 옛 UI 삭제 절차).
   *
   * 원래 잡던 결함: 옛 UI(`main.ts`)가 `settle(drawn, ctx)`를 **옵션 없이** 불러
   * S-6이 측정해 둔 면 위 사선 경로가 앱에서 안 켜져 있었다(§4.3).
   * 새 UI(`mainL.ts`)는 **그 계층을 아예 안 쓴다** — `liftAll`·`placeLive`·`solveInto`가
   * 그 자리이고 그것이 L 전환의 내용이다. 그러므로 `main.ts`를 읽던 줄은 대상이 없다.
   *
   * **지우지 않고 방향을 뒤집는다**(PITFALLS: 대상이 사라진 항목은 그렇게 표시한다).
   * 이제 확인하는 것은 **새 UI가 폐기된 배치 계층으로 돌아가지 않았는가**다 —
   * `settle`이 다시 불리면 두 계층이 섞인 상태이고, 그것은 L 전환이 없앤 결함의 재발이다.
   *
   * ⚠⚠ **"원래 보호가 `stage.spec`으로 옮겨졌다"는 초판 서술을 철회한다**(리뷰어).
   * `stage.spec`은 앱 함수를 부르지만 **참값 대조를 안 한다** — 그 원장이 스스로
   * "배치 정확도는 안 잰다, **측정 경로와 앱 경로를 섞는 일이다**(#17)"라고 적는다.
   * 즉 그것은 **앱 경로를 지나는 것**이지 *하네스와 앱이 같은 출처를 쓰는지*의 확인이 아니다.
   * **그러므로 지금 그 확인은 없다.** 옛 결함(측정해 둔 경로를 앱이 안 켜는 것)이 L에서
   * 재발할 자리는 `liftAll`·`placeLive`·`solveInto`의 **옵션 인자**이고, 그것을 하네스와
   * 앱이 같은 출처에서 받는지 **아무도 안 본다**. `DEFERRED.md`에 적었다.
   */
  it("**새 UI가 폐기된 배치 계층으로 안 돌아간다** — `settle`을 안 부른다", () => {
    const mainL = readFileSync(resolve(SRC, "mainL.ts"), "utf-8");
    const calls = mainL.match(/settle\(/g) ?? [];
    expect(calls, `mainL.ts가 폐기된 settle을 부른다(${calls.length}회)`).toEqual([]);
    // 그리고 **L의 배치 경로가 실제로 거기 있다** — 없으면 위 단언이 공허하다(#32)
    for (const fn of ["liftAll", "placeLive", "solveInto"]) {
      expect(mainL, `mainL.ts에 ${fn}이 없다 — 그러면 "settle을 안 부른다"가 공허하다`)
        .toContain(fn);
    }
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
        "⚠ **`main.ts`를 읽던 줄은 대상이 사라졌다**(L 전환에서 옛 UI가 삭제됐다) — "
          + "이제 **새 UI가 `settle`로 돌아가지 않았는지**를 본다(재발 방지 방향)",
        "⚠⚠ **원래 보호는 어디로도 안 옮겨졌다**(리뷰어가 초판 서술을 철회시켰다) — "
          + "`stage.spec`은 앱 함수를 부르지만 **참값 대조를 안 한다**(그 원장이 스스로 "
          + "'측정 경로와 앱 경로를 섞는 일이다'라고 적는다). **L의 배치 옵션(`liftAll`·"
          + "`placeLive`·`solveInto`)을 하네스와 앱이 같은 출처에서 받는지 지금 아무도 안 본다** — "
          + "`DEFERRED.md`에 적었다. 이 표가 덮는 것은 **S·G 하네스**뿐이고 앱이 아니다",
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
