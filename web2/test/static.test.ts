// 정적 검사 — 소실점·카메라는 core/camera.ts 한 곳에서만 나온다(원칙 a).
// 다른 파일이 주점(W/2)·기본 f·사영(quatConj)을 직접 계산하면 실패한다.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..', 'src')
// 출처 파일(camera.ts)과 원시 정의 파일(vec.ts·constants.ts)만 예외
const ALLOWED = new Set(['core/camera.ts', 'core/vec.ts', 'core/constants.ts'].map(p => p.replace(/\//g, '\\')))

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

  it('camera.ts 밖에서 직접 계산이 없다', () => {
    const violations: string[] = []
    for (const file of files) {
      const rel = file.slice(SRC.length + 1)
      if (ALLOWED.has(rel)) continue
      const text = readFileSync(file, 'utf8')
      for (const f of FORBIDDEN) {
        if (f.re.test(text)) violations.push(`${rel}: ${f.re} — ${f.why}`)
      }
    }
    expect(violations).toEqual([])
  })
})
