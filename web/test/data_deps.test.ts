// **외부 데이터 의존 등록처의 반례**(2026-08-16).
//
// 이 파일이 있는 이유: CI가 `data/quickdraw` 없이 돌다 죽었고, 고치는 방향이
// **"없으면 건너뛴다"**인데 그것은 **잘못 쓰면 #32 그 자체**다 —
// 건너뛰기가 조용하면 "측정이 한 번도 안 돌았다"가 초록으로 보인다.
//
// 그래서 **건너뛰기 기전 자체에 반례를 건다**: 없을 때 실제로 사유를 내는가,
// 있을 때 조용한가, `S2S_REQUIRE_DATA=1`에서 **실패로 바뀌는가**.
// (`tests/test_selfcheck_new_scans.py`가 selfcheck 검사에 대해 하는 일과 같은 자리다.)
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DATA_DEPS, depPresent, skipReason, REQUIRE_DATA } from "./dataDeps.js";

describe("외부 데이터 의존 — 건너뛰기가 조용하지 않은가(#32)", () => {
  it("**등록이 비지 않았다** — 셋이 있고 각각 사유·쓰는 곳·채우는 법을 적는다", () => {
    expect(DATA_DEPS.length).toBeGreaterThan(0);
    for (const d of DATA_DEPS) {
      expect(d.path, `${d.name}: path`).toBeTruthy();
      expect(d.why.length, `${d.name}: **왜 저장소에 없는지**를 적는다`).toBeGreaterThan(10);
      expect(d.used_by.length, `${d.name}: 쓰는 하네스가 없으면 등록이 죽은 것이다`).toBeGreaterThan(0);
      expect(d.how.length, `${d.name}: **채우는 법**이 없으면 다음 사람이 못 채운다`).toBeGreaterThan(10);
    }
  });

  it("**빈 디렉토리는 없는 것으로 본다** — 0건은 표본이 아니다", () => {
    const base = mkdtempSync(resolve(tmpdir(), "s2s-dep-"));
    const empty = resolve(base, "empty");
    mkdirSync(empty);
    expect(depPresent({ name: "t", path: empty, why: "x", used_by: ["y"], how: "z" })).toBe(false);
    // `README.md`와 점 파일만 있는 것도 **비어 있는 것**이다(안내문은 표본이 아니다)
    writeFileSync(resolve(empty, "README.md"), "설명");
    writeFileSync(resolve(empty, ".gitkeep"), "");
    expect(depPresent({ name: "t", path: empty, why: "x", used_by: ["y"], how: "z" })).toBe(false);
    // 실제 파일이 들어오면 있는 것이다
    writeFileSync(resolve(empty, "square.ndjson"), "{}\n");
    expect(depPresent({ name: "t", path: empty, why: "x", used_by: ["y"], how: "z" })).toBe(true);
  });

  it("없는 의존은 **사유 문자열**을 낸다 — 그 문자열이 건너뛴 이름에 붙는다", () => {
    const r = skipReason("sessions");
    // ⚠ **이 저장소에는 `sessions/`가 아직 비어 있다**(AS-C1: 실획 표본 0).
    // 그러므로 여기서는 사유가 나와야 한다 — 나중에 실획이 들어오면 `null`이 된다.
    if (r === null) {
      // 실획이 생겼다는 뜻이다. 그때는 이 단언 대신 "있으면 조용하다"를 확인한다.
      expect(skipReason("sessions")).toBeNull();
    } else {
      expect(r).toContain("외부 데이터 없음");
      expect(r).toContain("sessions");
      expect(r, "**채우는 법**이 사유에 들어 있어야 한다").toContain("획 내보내기");
    }
  });

  it("**등록 안 된 이름은 던진다** — 조용히 건너뛰는 길을 만들지 않는다", () => {
    expect(() => skipReason("아무거나")).toThrow(/등록 안 된 외부 데이터 의존/);
  });

  it("`S2S_REQUIRE_DATA=1`이면 **건너뛰기가 실패로 바뀐다**", () => {
    // 그 모드에서 이 파일이 돌고 있다면, 없는 의존은 이미 위에서 던졌어야 한다.
    // 여기서는 **플래그가 실제로 읽히는지**만 잠근다(환경을 바꿔 다시 부를 수 없다).
    expect(REQUIRE_DATA).toBe(process.env.S2S_REQUIRE_DATA === "1");
    if (REQUIRE_DATA) {
      // 이 모드에서는 `sessions`가 비어 있으면 위 테스트가 이미 던졌다는 뜻이다
      expect(() => skipReason("sessions")).toThrow(/S2S_REQUIRE_DATA/);
    }
  });
});

/**
 * **전수 확인 — 등록 안 된 외부 의존이 있는가**(b, 2026-08-16).
 *
 * `sweeps.json`의 `external_data` 훑기는 **읽기 호출이 있는 파일**만 센다(#33: 문법으로만
 * 찾는다). 여기서는 그보다 강하게 본다 — **`web/` 밖으로 나가는 경로를 만드는 파일**을 찾아
 * 그것이 `DATA_DEPS[].used_by`에 있는지 대조한다. 값 대조이지 문법 대조가 아니다.
 *
 * ⚠ **알려진 한계**: 경로를 변수로 조립하면 못 본다. 그때는 `used_by`에 손으로 넣는다.
 */
describe("전수 확인 — `web/` 밖을 읽는 하네스가 전부 등록됐는가", () => {
  it("등록 안 된 외부 읽기가 없다", () => {
    const roots = [resolve(import.meta.dirname ?? ".", "..", "test"),
                   resolve(import.meta.dirname ?? ".", "..", "e2e")];
    const registered = new Set(DATA_DEPS.flatMap(d => d.used_by));
    const offenders: string[] = [];
    const examined: string[] = [];      // **공허하지 않은지 센다**(#32)
    for (const root of roots) {
      for (const name of readdirSync(root)) {
        if (!name.endsWith(".ts")) continue;
        const rel = `${root.endsWith("e2e") ? "e2e" : "test"}/${name}`;
        const src = readFileSync(resolve(root, name), "utf-8");
        if (rel === "test/dataDeps.ts" || rel === "test/data_deps.test.ts") continue;
        // **직접 읽는 것만 세면 놓친다** — `bend_share`·`one_stroke_one_axis`는
        // `loadQuickDraw`를 거치므로 `readFileSync`가 그 파일에 없다.
        // ⚠ **첫 판이 실제로 그 둘을 놓쳤고 아래 `examined` 단언이 그것을 잡았다**(#33).
        // 그래서 셋 중 하나면 외부 의존으로 본다:
        //   ① 저장소 루트 밖을 **직접 읽는다**  ② **데이터 로더를 가져온다**(간접 읽기)
        //   ③ 이미 **건너뛰기 기전을 쓴다**(`skipReason` · `test.skip(!existsSync`)
        const goesUp = /"\.\.",\s*"\.\."/.test(src) || /\.\.\/\.\./.test(src);
        const readsDirect = goesUp
          && /\b(existsSync|readdirSync|readFileSync)\s*\(/.test(src)
          && /(data\/|sessions|dist)/.test(src);
        const importsLoader = /from "\.\.\/src\/data\//.test(src);
        const usesSkip = /skipReason\(/.test(src) || /test\.skip\(!existsSync/.test(src);
        if (!readsDirect && !importsLoader && !usesSkip) continue;
        examined.push(rel);
        if (!registered.has(rel)) offenders.push(rel);
      }
    }
    expect(offenders,
      `외부 데이터를 읽는데 \`dataDeps.ts\`에 등록 안 된 하네스: ${offenders.join(", ")}\n`
      + "→ `DATA_DEPS`에 넣고 `skipReason()`으로 건너뛰게 한다. 안 하면 CI에서 조용히 0건이 된다(#32).")
      .toEqual([]);
    // ⚠ **거른 결과가 0이면 이 확인은 아무 말도 안 한다**(#32) — 등록된 셋이 실제로
    // 걸러져 나오는지 본다. 안 나오면 거름이 너무 좁아진 것이고 그때 이 테스트가 죽는다.
    expect(examined.sort(), "거름이 아무것도 못 잡았다 — 이 확인이 공허하다")
      .toEqual(["e2e/static_deploy.spec.ts", "test/bend_share.test.ts",
                "test/one_stroke_one_axis.test.ts", "test/real_ink.test.ts"].sort());
  });
});
