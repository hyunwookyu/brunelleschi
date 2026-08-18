// **검증 비용을 원장에 남긴다**(2026-08-18 9차 지시 c).
// 산출: `stage0/out/test_cost.json`.
//
// ## 왜 이 원장인가
//
// 지시 그대로: *"팔이 늘 때 실행 수가 어떻게 변하는지 원장에 남긴다. 지금은 추가할 때마다
// 총 시간이 곱해지는데 **그것이 안 보인다**."*
//
// 9차 한 세션이 실제로 그렇게 했다 — `order_lock`에 `guard_off` 팔(+600실행),
// `classify_leak`에 제거 실험 6팔, `osnap_two_sided`에 반경 10점, `snap_stage`에 조리개 3점.
// **넷 다 측정 근거가 있었고, 넷 다 비용을 아무 데도 안 적었다.**
//
// 이 원장이 하는 것 셋:
//   ① **파일별 시간과 건수** — 벽시계를 정하는 것이 무엇인지(지배항)
//   ② **단위/측정 갈래별 합계** — 지시 b의 분리가 실제로 무엇을 아끼는지
//   ③ **하네스가 스스로 적은 실행 수**(`population`·`runs`) — 팔이 늘면 이 수가 는다
//
// ⚠ **시간은 기계·부하에 따라 갈린다**(#27 — 대역을 다른 환경에서 안 가져온다).
// 이 원장의 쓸모는 절대 초가 아니라 **비중과 추세**다. 그래서 `share`를 함께 낸다.
// ⚠⚠ **디스크가 차면 이 수는 전부 무의미하다** — 9차에 전량 실행이 121s에서 **1h52m**으로
// 늘었고 원인은 하네스가 아니라 **여유 공간 0**이었다. 그래서 `disk_free_bytes`를 함께 적는다.
import { readFileSync, writeFileSync, mkdirSync, statfsSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./testSplit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const TIMING = resolve(OUT, "_vitest_timing.json");
/**
 * **e2e(Playwright) 갈래**(2026-08-18 11차 항목 5 — 10차 등재 DEFERRED의 이행).
 * 9차 지시 c는 *"팔을 더하면 비용을 원장에 남긴다"*인데 이 원장은 vitest만 덮고 있었고,
 * 10차가 e2e 스펙 넷을 더하면서 그 비용이 원장 밖으로 샜다(리뷰어 5차 [14]).
 *
 * ⚠ **없으면 0으로 안 적는다**(#32) — `e2e: null` + 만드는 법을 적는다.
 */
const E2E_TIMING = resolve(OUT, "_e2e_timing.json");

let raw;
try { raw = JSON.parse(readFileSync(TIMING, "utf8")); } catch {
  console.error(`${TIMING}가 없다. 먼저 돌린다:\n`
    + `  cd web && npx vitest run --reporter=json --outputFile=../stage0/out/_vitest_timing.json`);
  process.exit(1);
}

const { measure, unit } = classify();
// ⚠ `measure.map(basename)`는 안 된다 — `map`이 인덱스를 `suffix`로 넘긴다
const measSet = new Set(measure.map(f => basename(f)));

const files = (raw.testResults ?? []).map(r => ({
  file: basename(r.name ?? ""),
  seconds: +(((r.endTime ?? 0) - (r.startTime ?? 0)) / 1000).toFixed(2),
  tests: (r.assertionResults ?? []).length,
})).sort((a, b) => b.seconds - a.seconds);

/**
 * Playwright JSON 리포터를 **파일별 초·건수**로 접는다. 중첩 스위트를 재귀로 훑고
 * `spec.file`(리포터가 스펙마다 들고 있다)을 파일 이름으로 쓴다. 재시도가 있으면
 * **결과 전부를 더한다** — 벽시계가 그만큼 든다.
 */
function foldE2e(node, acc) {
  for (const sp of node.specs ?? []) {
    const file = basename(sp.file ?? node.file ?? "");
    if (!file) continue;
    const cur = acc.get(file) ?? { ms: 0, tests: 0 };
    for (const t of sp.tests ?? []) {
      cur.tests += 1;
      for (const r of t.results ?? []) cur.ms += r.duration ?? 0;
    }
    acc.set(file, cur);
  }
  for (const child of node.suites ?? []) foldE2e(child, acc);
  return acc;
}

let e2eRaw = null;
try { e2eRaw = JSON.parse(readFileSync(E2E_TIMING, "utf8")); } catch { e2eRaw = null; }
const eFiles = e2eRaw
  ? [...foldE2e({ suites: e2eRaw.suites ?? [] }, new Map())]
      .map(([file, v]) => ({ file, seconds: +(v.ms / 1000).toFixed(2), tests: v.tests }))
      .sort((a, b) => b.seconds - a.seconds)
  : null;

const sum = a => +a.reduce((s, x) => s + x, 0).toFixed(2);
const totalSec = sum(files.map(f => f.seconds));
const mFiles = files.filter(f => measSet.has(f.file));
const uFiles = files.filter(f => !measSet.has(f.file));

/** 하네스가 **스스로 적은** 실행 수 — 팔이 늘면 이 수가 는다(#17: 손으로 안 센다). */
const declared = {};
for (const f of readdirSync(OUT).filter(x => x.endsWith(".json") && !x.startsWith("_"))) {
  let led; try { led = JSON.parse(readFileSync(resolve(OUT, f), "utf8")); } catch { continue; }
  const p = led.population ?? led.conditions ?? null;
  // ⚠ 원장마다 실행 수를 적는 자리가 다르다 — `order_lock`은 `arms.*.headline.runs`다.
  // 못 찾으면 `null`이고 그것도 사실이다(#32 — 미기록을 0으로 안 적는다).
  const armRuns = led.arms ? Object.values(led.arms)
    .map(a => a?.headline?.runs).filter(x => typeof x === "number") : [];
  const n = led.runs ?? p?.runs ?? p?.rows ?? p?.strokes ?? p?.far_ends
          ?? (armRuns.length ? armRuns.reduce((s2, x) => s2 + x, 0) : null);
  const arms = led.arms ? Object.keys(led.arms).length
             : Array.isArray(led.sweep) ? led.sweep.length : null;
  if (n != null || arms != null) declared[f] = { scenarios: n, arms };
}

const out = {
  what: "**검증 비용의 원장**(9차 지시 c) — 파일별 시간·건수, 단위/측정 갈래별 합계, "
      + "하네스가 스스로 적은 실행 수. **팔이 늘면 여기서 보인다.**",
  how: "`npx vitest run --reporter=json --outputFile=../stage0/out/_vitest_timing.json` 뒤 "
     + "`npm run test:cost`. 갈래는 `tools/testSplit.mjs`가 **소스를 읽어** 정한다"
     + "(이름 규약이 아니다 — 사람이 지켜야 하는 규약은 샌다, #19·#38).",
  environment: {
    disk_free_bytes: (() => { try { const s = statfsSync(ROOT); return s.bfree * s.bsize; }
                              catch { return null; } })(),
    disk_free_note: "⚠⚠ **여유가 0이면 아래 시간은 전부 무의미하다.** 9차에 전량 실행이 "
      + "**121s → 1h52m**(59배)로 늘었고 원인은 하네스가 아니라 **디스크가 100% 찬 것**이었다. "
      + "느려졌다는 보고를 받으면 **여기부터 본다**(#7 — 추측 대신 카운터).",
  },
  wall_note: "⚠ **파일 시간의 합은 벽시계가 아니다**(병렬 실행). **벽시계는 최장 파일이 "
    + "바닥**이므로 지배항 하나를 떼는 것이 전체를 줄이는 유일한 길이다.",
  totals: {
    files: files.length, tests: sum(files.map(f => f.tests)),
    file_seconds_sum: totalSec,
    measure: { files: mFiles.length, tests: sum(mFiles.map(f => f.tests)),
               seconds: sum(mFiles.map(f => f.seconds)),
               share: +(sum(mFiles.map(f => f.seconds)) / totalSec).toFixed(4) },
    unit: { files: uFiles.length, tests: sum(uFiles.map(f => f.tests)),
            seconds: sum(uFiles.map(f => f.seconds)),
            share: +(sum(uFiles.map(f => f.seconds)) / totalSec).toFixed(4) },
    /**
     * **e2e 갈래**(11차 항목 5). ⚠ **`share`를 안 낸다** — 분모(`file_seconds_sum`)가
     * vitest 파일시간의 합이라 e2e를 그 위에 얹으면 **다른 실행기의 시간을 한 비율로
     * 합치는 것**이 된다(#11 — 분모가 무엇인가). 두 갈래는 **따로 읽는다**.
     */
    e2e: eFiles
      ? { files: eFiles.length, tests: sum(eFiles.map(f => f.tests)),
          seconds: sum(eFiles.map(f => f.seconds)) }
      : null,
  },
  dominant: files.slice(0, 8).map(f => ({ ...f, share: +(f.seconds / totalSec).toFixed(4),
                                          kind: measSet.has(f.file) ? "measure" : "unit" })),
  by_file: files,
  e2e_by_file: eFiles,
  e2e_note: eFiles
    ? "**Playwright 갈래다**(11차 항목 5 — 10차 DEFERRED 이행). `seconds`는 **테스트 결과 "
      + "시간의 합**이고 재시도가 있으면 함께 더해진다. 별도 실행기라 위 `file_seconds_sum`과 "
      + "**분모가 다르다** — 한 비율로 합치지 않는다(#11). ⚠ 브라우저 기동·dev 서버 대기는 "
      + "테스트 결과 시간 밖이라 벽시계는 이 합보다 크다."
    : "⛔ **안 쟀다**(0이 아니다 — #32). 만드는 법: `cd web && PLAYWRIGHT_JSON_OUTPUT_NAME="
      + "../stage0/out/_e2e_timing.json npx playwright test --reporter=json` 뒤 `npm run test:cost`. "
      + "⚠ 이 컨테이너에서는 `PW_EXECUTABLE`로 사전 설치 크로뮴을 가리켜야 돈다.",
  declared_scenarios: declared,
  declared_note: "원장이 스스로 적은 실행 수·팔 수다. **손으로 세지 않는다**(#17) — "
    + "팔을 더하면 이 수가 늘고, 그 증가가 위 `by_file`의 시간과 짝지어 보인다.",
  constants_absent: "⚠ **`constants`·`metric_defs` 스냅샷을 일부러 안 넣는다**(#40 — 필수 "
    + "필드를 자명한 값으로 채우지 않는다). 이 원장은 **제품이 아니라 검증 스위트 자체**를 "
    + "재므로 `SHARED_CONSTANTS`·`metrics.ts`에 **의존하지 않는다**. 넣으면 무관한 상수가 "
    + "바뀔 때마다 이 원장이 **거짓 STALE**로 뜨고, 그것은 검사를 약화시키는 방향이다(#19). "
    + "selfcheck가 이 둘을 플래그하는 것은 정상이고 **원인이 이 줄이다**.",
  what_this_does_not_say: [
    "**절대 초는 이 기계의 것이다**(#27). 다른 기계·다른 부하에서는 다르다 — 읽을 것은 **비중**이다.",
    "**e2e는 이제 잰다**(11차 항목 5) — 다만 **`_e2e_timing.json`이 있을 때만**이다. 없으면 `totals.e2e`가 `null`이고 그것이 '안 쟀다'의 표시다(0이 아니다). ⚠ **두 갈래의 시간을 한 비율로 합치지 않는다** — 실행기가 다르고 분모가 다르다.",
    "**e2e의 실패 실행도 시간에 든다** — 이 컨테이너에서 `touch_route` dpr 2는 결정적으로 실패하고(DEFERRED) 그 시간이 합에 포함된다. 시간은 '통과의 비용'이 아니라 '실행의 비용'이다.",
    "**단위 쪽이 느려지는 것은 이 갈래가 못 막는다** — 원장을 안 쓰면서 느린 파일은 단위에 남는다. 그때는 위 `dominant`의 `kind`가 `unit`으로 뜬다.",
  ],
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "test_cost.json"), JSON.stringify(out, null, 2), "utf8");
const t = out.totals;
console.log(`파일 ${t.files} · 건수 ${t.tests} · 파일시간합 ${t.file_seconds_sum}s`);
console.log(`  측정 ${t.measure.files}파일 ${t.measure.seconds}s (${(t.measure.share * 100).toFixed(1)}%) · ${t.measure.tests}건`);
console.log(`  단위 ${t.unit.files}파일 ${t.unit.seconds}s (${(t.unit.share * 100).toFixed(1)}%) · ${t.unit.tests}건`);
console.log(`지배항: ${out.dominant.slice(0, 3).map(d => `${d.file} ${d.seconds}s`).join(" · ")}`);
console.log(t.e2e ? `  e2e ${t.e2e.files}파일 ${t.e2e.seconds}s · ${t.e2e.tests}건`
                  : "  e2e 미측정(_e2e_timing.json 없음 — 0이 아니다)");
