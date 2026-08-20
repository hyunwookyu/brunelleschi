// 정적 검사 — 소실점·카메라는 core/camera.ts 한 곳에서만 나온다(원칙 a).
// 다른 파일이 주점(W/2)·기본 f·사영(quatConj)을 직접 계산하면 실패한다.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const SRC = join(__dirname, '..', 'src')
// 출처 파일(camera.ts)과 원시 정의 파일(vec.ts·constants.ts)만 예외
// ⚠ 구분자를 박지 않는다 — 초판이 `\`로 박아 **리눅스 CI에서만** camera.ts 자신이
// 위반으로 잡혔다(2026-08-21). 아래 「예외가 실제로 맞았는가」가 그 재발을 막는다.
const ALLOWED = new Set(['core/camera.ts', 'core/vec.ts', 'core/constants.ts'])
const relOf = (file: string) => file.slice(SRC.length + 1).split(sep).join('/')

const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\bW\s*\/\s*2\b/, why: '주점 직접 계산 — an.principal을 읽어라' },
  { re: /DEFAULT_F_RATIO/, why: 'f 직접 계산 — an.f를 읽어라' },
  { re: /quatConj/, why: '사영 직접 계산 — project()/screenAxes()를 써라' },
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

describe('원칙 a — 단일 출처의 정적 검사', () => {
  const files = walk(SRC)

  it('검사가 실제로 도는가 — 덮는 파일 수를 센다 (0이면 그 자체가 플래그)', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it('금지 패턴이 camera.ts 안에는 실제로 있다 — 정규식이 살아 있다는 증거', () => {
    const cam = readFileSync(join(SRC, 'core', 'camera.ts'), 'utf8')
    for (const f of FORBIDDEN) {
      expect(f.re.test(cam), `${f.re} not found in camera.ts`).toBe(true)
    }
  })

  it('예외 목록이 실제로 그 파일들에 맞는다 (0건 통과를 막는다)', () => {
    // 구분자가 안 맞으면 예외가 하나도 안 걸리고, 그러면 camera.ts가 위반으로 잡힌다.
    // 반대로 예외가 과하게 걸려도 여기서 드러난다 — 수가 정확히 맞아야 한다.
    const matched = files.map(relOf).filter(r => ALLOWED.has(r))
    expect(matched.sort()).toEqual([...ALLOWED].sort())
  })

  it('camera.ts 밖에서 직접 계산이 없다', () => {
    const violations: string[] = []
    let skipped = 0
    for (const file of files) {
      const rel = relOf(file)
      if (ALLOWED.has(rel)) { skipped++; continue }
      const text = readFileSync(file, 'utf8')
      for (const f of FORBIDDEN) {
        if (f.re.test(text)) violations.push(`${rel}: ${f.re} — ${f.why}`)
      }
    }
    expect(skipped).toBe(ALLOWED.size) // 검사가 실제로 예외를 거쳤는가
    expect(violations).toEqual([])
  })
})
