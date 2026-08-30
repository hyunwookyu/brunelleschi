// ── 원장 쓰기 관문 · 판정부(RUN.md §1 · 2026-08-31) ────────────────────────────
//
// **`LEDGER=1`이 없으면 `stage0/out`에 한 바이트도 안 쓴다.** 경고가 아니라 차단이다.
// 기본 거동은 「팔은 그대로 돌고 원장만 안 쓴다」 — 막힌 쓰기는 조용히 성공한 척한다
// (그 팔들은 원장 «쓰기»가 아니라 «측정»이 본체다. 빨개지면 안 된다).
//
// ⚠⚠ **왜 파일마다 `if (process.env.LEDGER === '1')`으로 안 하는가**(#54):
// 그것이 지금까지의 방식이었고 **샜다**. 실측(2026-08-31 · 이 관문 이전):
//   · `npm test`(vitest · LEDGER 없음) → 원장 **24개**를 덮어썼다
//   · web2-31 전량 e2e(두 실행 모두) → 원장 **아홉**을 덮어썼다(RUN.md §1)
// 문면이 흩어져 있으면 **새 하네스가 그 문면을 안 옮겨 적는 것이 기본값**이 된다.
// 관문이 한 자리에 있으면 새 하네스는 아무것도 안 해도 자동으로 막힌다.
//
// ⚠ **해시 대조만으로는 이 결함이 안 잡힌다**(2026-08-31 실측): 덮어쓴 24개의 sha256이
// 전수 «같았다» — 하네스가 결정론적이라 같은 내용이 다시 쓰였을 뿐이다. 규칙은
// 「같은 값을 쓰라」가 아니라 「쓰지 마라」이므로 판정자는 **mtime**과 **막은 횟수**다.
//
// 배선이 둘인 이유(런타임이 둘이고 `node:fs`가 도달하는 길이 다르다 — 실측):
//   · **vitest**  → `vite.config.ts`의 `test.alias`로 `node:fs`를 `fsledger.ts`로 돌린다.
//     ⚠ 여기서 원숭이 패치는 **안 듣는다**: vitest가 이미 `node:fs`의 ESM 파사드를
//     만든 뒤라 CJS exports를 갈아 끼워도 이름 가져오기(`import { writeFileSync }`)가
//     옛 것을 본다(2026-08-31 실측 — `named same as cjs? false`).
//   · **playwright** → `playwright.config.ts` 최상단 `import './tools/ledgerguard'`.
//     스펙은 babel로 CJS가 되어 `fs.writeFileSync` **속성 접근**으로 부르므로 패치가 듣는다.
//     (설정 파일은 워커 프로세스에서도 로드된다 — 그래서 한 줄이 스펙 전부에 걸린다.)
// `selfcheck.py`의 `scan_ledger_guard`가 그 둘과 「우회 쓰기 없음」을 지킨다.
//
// 정본 명령(원장을 실제로 갱신할 때): `LEDGER=1 npm test` · `LEDGER=1 npx playwright test …`

import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 원장 디렉토리(절대) — `web2/tools/` 기준 두 단계 위의 `stage0/out` */
export const LEDGER_DIR = resolve(fileURLToPath(import.meta.url), '../../../stage0/out')

/** 관문이 열려 있는가. **호출 시점에 읽는다** — 검사가 env를 갈아 끼워 반증할 수 있게. */
export const ledgerOn = (): boolean => process.env.LEDGER === '1'

/** 막은 쓰기의 기록 — 「몇 번 막았는가」가 이 관문의 유일한 관측량이다(위 ⚠). */
export const ledgerBlocked: { fn: string; path: string }[] = []

/** 이 경로가 원장인가 — 문자열·Buffer·URL 무엇이 와도 답이 하나다.
 *  fd(숫자)는 경로를 모르므로 «원장 아님»이다: 원장은 전부 경로로 열린다. */
export function isLedgerPath(p: unknown): boolean {
  let s: string
  if (typeof p === 'string') s = p
  else if (p instanceof URL) s = fileURLToPath(p)
  else if (p instanceof Uint8Array) s = Buffer.from(p).toString()
  else return false
  try {
    const abs = resolve(s)
    return abs === LEDGER_DIR || abs.startsWith(LEDGER_DIR + sep)
  } catch { return false }
}

const seen = new Set<string>()

/** 막았다고 적는다 — 같은 자리는 한 번만 알린다. 조용히 막으면 사람이
 *  「왜 원장이 안 갱신되나」를 못 푼다. */
export function noteBlocked(fn: string, p: unknown): void {
  const path = typeof p === 'string' ? p : String(p)
  ledgerBlocked.push({ fn, path })
  const key = `${fn}:${path}`
  if (seen.has(key)) return
  seen.add(key)
  console.log(`[원장 관문] LEDGER=1이 아니므로 막았다: ${fn} ${path}`)
}

/** 대상 경로가 몇 번째 인자인가 — 이 표가 관문의 전부다.
 *  쓰기·지우기는 0번(대상) · 이름 바꾸기·복사는 1번(도착지). */
export const ARG0_FNS = ['writeFileSync', 'appendFileSync', 'truncateSync', 'unlinkSync',
  'rmSync', 'writeFile', 'appendFile', 'truncate', 'unlink', 'rm', 'createWriteStream',
  'openSync', 'open'] as const
export const ARG1_FNS = ['renameSync', 'copyFileSync', 'rename', 'copyFile'] as const

/** `openSync`의 쓰기 플래그(`w` · `a` · `r+` · `as+` …).
 *  **읽기로 여는 것은 막지 않는다** — 원장을 읽는 팔이 있다(cost20이 cost18을 읽는다). */
export const WRITE_FLAG = /[waR+]/
