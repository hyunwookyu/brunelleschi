// **단위 테스트와 측정 하네스를 갈라 돌린다**(2026-08-18 9차 지시 b·c).
//
// ## 왜 이것이 필요한가
//
// 전량 vitest의 벽시계는 **한 파일이 정한다** — `camera_gate.test.ts` 하나가 **108.7s**이고
// 나머지 79파일은 그 아래에서 병렬로 끝난다(하위 68파일 합계 14.1s). 그런데 **단위 테스트
// 37파일 382건은 다 합쳐 0.5초**다. 즉 A-4의 *"기존 테스트가 깨진 채로 다음 항목에
// 가지 않는다"*는 **0.5초짜리 확인**인데, 지금은 그것을 하려면 2분(디스크가 차면 두 시간)을
// 기다려야 한다. 그 구조가 A-4를 실행 불가능하게 만든다(지시 d).
//
// ## 가르는 기준 — **이름이 아니라 행동이다**
//
// 파일명 규약(`*.measure.test.ts`)으로 가르면 **사람이 규약을 지켜야 하고**, 이 저장소는
// 그 방식이 반복해서 실패했다(#19·#38·#42 — 사람이 기억해야 하는 검사는 샌다).
// 그래서 **소스에서 `stage0/out`에 쓰는지를 직접 본다**: 원장을 쓰면 측정 하네스이고,
// 안 쓰면 단위 테스트다. **새 하네스를 추가하면 자동으로 분류된다** — 목록을 손으로
// 갱신할 일이 없다.
//
// ⚠ **한계**: 원장을 안 쓰면서 느린 파일은 단위 쪽에 남는다. 그런 파일이 생기면
// `npm run test:cost`가 그것을 표로 낸다(그 원장이 이 갈래의 감시자다).
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(HERE, "..", "test");

/** 원장을 쓰는가 — `stage0/out`으로의 경로 조립을 본다(#17: 한 규약). */
const WRITES_LEDGER = /["']stage0["']\s*,\s*["']out["']|stage0\/out/;

export function classify() {
  const files = readdirSync(TEST_DIR).filter(f => f.endsWith(".test.ts"));
  const measure = [], unit = [];
  for (const f of files) {
    const src = readFileSync(resolve(TEST_DIR, f), "utf8");
    (WRITES_LEDGER.test(src) ? measure : unit).push(`test/${f}`);
  }
  return { measure: measure.sort(), unit: unit.sort() };
}

// **직접 실행할 때만 CLI가 돈다** — `testCost.mjs`가 `classify()`를 import하므로
// 이 가드가 없으면 import만으로 사용법이 찍히고 종료한다(실제로 그랬다).
const RUN_DIRECT = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const mode = RUN_DIRECT ? process.argv[2] : null;
if (RUN_DIRECT) {
if (mode === "list") {
  const { measure, unit } = classify();
  console.log(`측정 하네스 ${measure.length}파일:\n  ${measure.map(f => basename(f)).join(" ")}`);
  console.log(`\n단위 테스트 ${unit.length}파일:\n  ${unit.map(f => basename(f)).join(" ")}`);
} else if (mode === "unit" || mode === "measure") {
  const list = classify()[mode];
  if (!list.length) { console.error(`${mode} 대상이 없다 — 분류 규칙을 확인한다`); process.exit(1); }
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(npx, ["vitest", "run", ...list, ...process.argv.slice(3)],
                      { stdio: "inherit", cwd: resolve(HERE, ".."), shell: process.platform === "win32" });
  process.exit(r.status ?? 1);
} else {
  console.error("사용: node tools/testSplit.mjs <unit|measure|list> [vitest 인자...]");
  process.exit(2);
}
}
