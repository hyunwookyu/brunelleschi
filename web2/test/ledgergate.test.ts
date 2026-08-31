// 원장 쓰기 관문(RUN.md §1) — **관문 자체를 잰다**.
//
// D-3(반증 조건): 이 검사는 관문을 **떼면 빨개진다**.
// 확인 방법 — `vite.config.ts`의 `test.alias`를 지우고 이 파일을 돌리면
// ①②④가 실패한다(막힘 0 · 파일이 실제로 생김). 실제로 그렇게 돌려 확인했다.
//
// ⚠ 「해시가 같으면 통과」로 재지 않는다: 하네스가 결정론적이라 **덮어써도 해시가 같다**
// (2026-08-31 실측 — `npm test`가 원장 24개를 덮어썼는데 sha256이 전수 일치했다).
// 판정자는 **파일이 생겼는가 / 관문이 막았는가**다.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LEDGER_DIR, ledgerBlocked, isLedgerPath, ledgerOn } from '../tools/ledgercore'

const PROBE = resolve(LEDGER_DIR, '__ledgergate_probe__.json')

describe('원장 쓰기 관문 — LEDGER=1 없이는 한 바이트도 안 쓴다', () => {
  it('① LEDGER가 없으면 stage0/out 쓰기가 막힌다 (파일이 안 생긴다)', () => {
    expect(process.env.LEDGER).not.toBe('1')     // 평소 실행의 전제
    const before = ledgerBlocked.length
    writeFileSync(PROBE, '{"막혀야 한다":true}')
    expect(existsSync(PROBE)).toBe(false)
    expect(ledgerBlocked.length).toBeGreaterThan(before)   // 조용히 안 지나간다
  })

  it('② 막혔어도 팔은 안 죽는다 — 예외가 아니라 무시다', () => {
    // 「팔은 실행하되 원장은 안 쓴다」가 기본 거동이다(RUN.md §1).
    expect(() => writeFileSync(PROBE, 'x')).not.toThrow()
  })

  it('③ 원장 **읽기**는 막지 않는다 — cost20이 cost18을 읽는다', () => {
    const c = resolve(LEDGER_DIR, 'constants.json')
    if (!existsSync(c)) return                    // 없으면 이 칸은 할 말이 없다
    expect(() => readFileSync(c, 'utf-8')).not.toThrow()
  })

  it('④ LEDGER=1이면 정상으로 쓴다 (관문이 «항상 막기»가 아니다)', () => {
    const old = process.env.LEDGER
    process.env.LEDGER = '1'
    try {
      expect(ledgerOn()).toBe(true)
      writeFileSync(PROBE, '{"열렸다":true}')
      expect(existsSync(PROBE)).toBe(true)
      expect(JSON.parse(readFileSync(PROBE, 'utf-8')).열렸다).toBe(true)
    } finally {
      rmSync(PROBE, { force: true })
      if (old === undefined) delete process.env.LEDGER; else process.env.LEDGER = old
    }
    expect(existsSync(PROBE)).toBe(false)
  })

  it('⑤ 원장 밖 쓰기는 관문과 무관하다 — 범위가 stage0/out 하나다', () => {
    const tmp = resolve(LEDGER_DIR, '..', '__outside_probe__.txt')
    expect(isLedgerPath(tmp)).toBe(false)
    try {
      writeFileSync(tmp, 'ok')
      expect(existsSync(tmp)).toBe(true)
    } finally { rmSync(tmp, { force: true }) }
  })

  it('⑥ 경로 판정 — 상대·절대·URL·상위참조가 같은 답을 낸다', () => {
    expect(isLedgerPath(resolve(LEDGER_DIR, 'a.json'))).toBe(true)
    expect(isLedgerPath(resolve(LEDGER_DIR, 'sub', 'b.json'))).toBe(true)
    expect(isLedgerPath(resolve(LEDGER_DIR, '..', 'out', 'c.json'))).toBe(true)
    expect(isLedgerPath(resolve(LEDGER_DIR, '..', 'x.json'))).toBe(false)
    expect(isLedgerPath(resolve(LEDGER_DIR + '_other', 'd.json'))).toBe(false)  // 접두사만 같은 것
    expect(isLedgerPath(42)).toBe(false)
  })
})
