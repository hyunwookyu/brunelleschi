// web2-54 §1㉡ — **dpr2 목록의 감시**. `e2e/dpr2list.ts`의 조건(DPR2_NEED_RE)이 정본이고
// 목록(DPR2_SPECS)은 산출물이다 — 이 시험이 조건을 e2e 전 스펙에 다시 돌려 목록과
// 대조한다. 갈리면 **목록이 아니라 조건 쪽을 본다**(지시 ㉡: 조건과 결과가 갈리면
// 조건을 고친다 — 다만 새 스펙이 픽셀을 읽기 시작한 경우는 목록에 더하는 것이 맞다.
// 어느 쪽이든 이 시험이 빨개져서 사람 판단을 강제한다 — 목록 갱신을 기억에 안 맡긴다).
//
// D-3 반증: 조건을 만족하는 스펙 하나를 목록에서 빼면 이 시험이 실제로 실패한다 —
// 「반증」 it이 그 갈래를 매 실행 돌린다(빈 대조로 초록이 나는 시험이 아니다).

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DPR2_NEED_RE, DPR2_SPECS, MEASURE_SPECS } from '../e2e/dpr2list'

const HERE = dirname(fileURLToPath(import.meta.url))
const E2E = resolve(HERE, '../e2e')

function grepList(): string[] {
  return readdirSync(E2E)
    .filter(f => f.endsWith('.spec.ts'))
    .filter(f => DPR2_NEED_RE.test(readFileSync(resolve(E2E, f), 'utf8')))
    .map(f => f.replace(/\.spec\.ts$/, ''))
    .sort()
}

describe('web2-54 §1㉡ — dpr2 목록은 조건의 산출물이다', () => {
  it('조건이 지금 낸 목록 == 등재된 목록 (갈리면 조건·목록 중 무엇이 틀렸는지 사람이 본다)', () => {
    expect([...DPR2_SPECS].sort()).toEqual(grepList())
  })

  it('계측 넷은 실재하는 스펙이고 dpr2 목록과 겹치지 않는다 (계측은 초록에서 통째로 빠진다)', () => {
    const files = readdirSync(E2E)
    for (const m of MEASURE_SPECS) expect(files).toContain(`${m}.spec.ts`)
    for (const m of MEASURE_SPECS) expect(DPR2_SPECS as readonly string[]).not.toContain(m)
  })

  it('반증(D-3) — 목록에서 하나를 빼면 대조가 실제로 실패한다', () => {
    const truncated = [...DPR2_SPECS].sort().slice(1)
    expect(truncated).not.toEqual(grepList())
  })
})
