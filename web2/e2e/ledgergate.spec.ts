// 원장 쓰기 관문이 **playwright 런타임에서 실제로 막는가**(web2-40 · PITFALLS #94).
//
// ⚠⚠ **왜 이 팔이 필요한가**: 관문에는 이미 검사가 둘 있었는데 **둘 다 새는 것을 못 봤다** —
//   · `selfcheck.py`의 `scan_ledger_guard` ..... **문면**을 본다(배선 줄이 있는가)
//   · `test/ledgergate.test.ts` .............. **vitest 런타임**에서 판정부를 본다
//   빠진 물음이 「**그 런타임에서 실제로 쓰기가 막히는가**」였고, 실측이 **안 막혔다**를 냈다
//   (`tools/ledgerfs.ts` 머리주석에 그 수치가 있다). #91의 형태 그대로다: 금지한 것이
//   **행위**(쓰지 마라)인데 검사는 **상태**(문면·판정부)를 보고 있었다.
//
// 판정자는 **쓰기 사건**이다 — 파일 내용이 아니라 `mtime`과 관문이 스스로 센 「막은 횟수」.
// (내용으로 재면 결정론 하네스가 «같은 값»을 다시 써도 안 걸린다 — #91.)
//
// **D-3 반증**: 같은 파일이 `LEDGER=1`에서는 **실제로 써진다**. 그 갈래도 여기서 돈다 —
// 관문이 «늘 막는다»면 원장을 갱신할 길이 없다는 뜻이고 그것도 결함이다.

import { test, expect } from '@playwright/test'
import { statSync, existsSync } from 'node:fs'          // ⚠ 판정자는 관문 **밖**의 fs다
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { LEDGER_DIR, ledgerOn, ledgerBlocked } from '../tools/ledgercore'

const PROBE = resolve(LEDGER_DIR, '_ledgergate_probe.json')

test('관문 — LEDGER 없이는 원장에 한 바이트도 안 쓴다 (판정자는 mtime과 막은 횟수)', async () => {
  const before = ledgerBlocked.length
  if (existsSync(PROBE)) rmSync(PROBE)
  mkdirSync(LEDGER_DIR, { recursive: true })
  writeFileSync(PROBE, JSON.stringify({ probe: true }))

  if (ledgerOn()) {
    // 반증 갈래 — 관문이 열려 있으면 **써져야 한다**(늘 막으면 원장을 갱신할 길이 없다)
    expect(existsSync(PROBE), 'LEDGER=1에서는 써진다').toBe(true)
    rmSync(PROBE)
    return
  }
  // 본문 — 쓰기가 **일어나지 않았다**(파일이 생기지도 않았다)
  expect(existsSync(PROBE), 'LEDGER 없이는 원장 파일이 생기지 않는다').toBe(false)
  // 그리고 관문이 **스스로 셌다** — 「조용히 성공한 척」이므로 이 계수가 유일한 관측량이다
  expect(ledgerBlocked.length, '관문이 막았다고 적었다').toBeGreaterThan(before)
})

test('관문 — 이미 있는 원장의 mtime이 안 움직인다 (같은 값으로 덮어쓰기도 «쓰기»다 — #91)', async () => {
  test.skip(ledgerOn(), 'LEDGER=1 실행에서는 쓰는 것이 정상이다')
  // 아무 원장 하나를 고른다 — 이 저장소에 늘 있는 것
  const target = resolve(LEDGER_DIR, 'paper_grain40_web2.json')
  test.skip(!existsSync(target), '그 원장이 아직 없다(첫 실행)')
  const t0 = statSync(target).mtimeMs
  writeFileSync(target, '{"clobbered":true}')     // 관문이 없으면 여기서 원장이 날아간다
  expect(statSync(target).mtimeMs, 'mtime이 안 움직였다').toBe(t0)
})
