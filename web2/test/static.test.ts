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

// 굵기의 단일 출처 — `material.ts`의 `widthOf()` 하나(지시 4-f · PITFALLS #54).
// 2D 오버레이와 three.js가 각각 굵기를 정하면 니브를 바꿨을 때 두 계층이 갈린다.
// **이 검사가 없으면 「한 함수에서만 계산한다」는 구성상 보장이 아니라 그냥 관행이다.**
const WIDTH_ALLOWED = new Set(['core/material.ts', 'core/constants.ts'])
const WIDTH_RE = /MAT\[[^\]]+\]\.width|MAT\.\w+\.width/
const relOf = (file: string) => file.slice(SRC.length + 1).split(sep).join('/')

const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\bW\s*\/\s*2\b/, why: '주점 직접 계산 — an.principal을 읽어라' },
  { re: /DEFAULT_F_RATIO/, why: 'f 직접 계산 — an.f를 읽어라' },
  { re: /quatConj/, why: '사영 직접 계산 — project()/screenAxes()를 써라' },
  { re: /EYE_HEIGHT/, why: '눈높이 직접 참조 — DRAW_POSE.p / pointOnGround()를 써라' },
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

  // 카메라 **이동**의 단일 출처 — `app/state.ts`(궤도·줌·팬). 원칙 a의 입력판이고,
  // 근거는 「입력과 시험이 같은 함수를 부른다」다(web2-06 지시 5). 줌 계산이 `input.ts`
  // 안에 있던 동안 **시험이 앱의 줌을 못 불렀고**, 그래서 「돌려보다 줌한 거리가 접으면
  // 사라진다」가 한 번도 안 재졌다. 옮긴 뒤 그것을 막는다 — 사람이 안 세도 걸린다.
  it('입력(app/input.ts)이 카메라 산술을 직접 안 한다 — state.ts의 함수를 부른다', () => {
    const src = readFileSync(join(SRC, 'app', 'input.ts'), 'utf8')
    for (const re of [/\badd3\b/, /\bsub3\b/, /\bmul3\b/, /\bdot3\b/, /\bquatRotate\b/]) {
      expect(re.test(src), `${re} in app/input.ts — 카메라 산술은 state.ts에 둔다`).toBe(false)
    }
    // **그 산술이 state.ts에는 실제로 있다** — 0건 통과를 막는다(검사가 살아 있다는 증거)
    const st = readFileSync(join(SRC, 'app', 'state.ts'), 'utf8')
    for (const re of [/\badd3\b/, /\bmul3\b/, /\bquatRotate\b/]) expect(re.test(st)).toBe(true)
  })

  it('굵기는 widthOf() 밖에서 안 나온다 — MAT[...].width 직접 참조 금지', () => {
    const violations: string[] = []
    let seen = 0
    for (const file of files) {
      const rel = relOf(file)
      if (WIDTH_ALLOWED.has(rel)) { seen++; continue }
      if (WIDTH_RE.test(readFileSync(file, 'utf8'))) {
        violations.push(`${rel}: MAT[...].width — widthOf(stroke)를 써라`)
      }
    }
    expect(seen).toBe(WIDTH_ALLOWED.size)   // 예외가 실제로 걸렸는가
    expect(violations).toEqual([])
  })

  it('금지 패턴이 material.ts 안에는 실제로 있다 — 정규식이 살아 있다는 증거', () => {
    expect(WIDTH_RE.test(readFileSync(join(SRC, 'core', 'material.ts'), 'utf8'))).toBe(true)
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

// ── web2-25 2부 ④ — **셔터와 롤이 같은 함수를 부른다**(정적 검사) ────────────────
//
// 지시 2-b: 「새 종이의 이름은 「종이 N」. 3부의 셔터가 만드는 것과 **같은 경로**를
// 부른다(출처 하나).」 팔로 재기 어려운 종류의 요구다(둘 다 같은 결과를 내면 팔은
// 통과한다 — 경로가 갈라져도) — 그래서 **문면이 아니라 구조**를 검사한다.
describe('web2-25 2부 — 종이를 만드는 경로가 하나다', () => {
  const files = walk(SRC)
  const app = (f: string) => readFileSync(join(SRC, 'app', f), 'utf8')

  it('`addSheet(` 호출은 app/ 안에서 **한 자리**뿐이다 — main.ts의 captureSheet', () => {
    const hits: string[] = []
    for (const file of files) {
      const rel = relOf(file)
      if (rel === 'app/state.ts') continue          // 정의가 있는 자리
      const n = (readFileSync(file, 'utf8').match(/addSheet\(/g) ?? []).length
      if (n > 0) hits.push(`${rel}×${n}`)
    }
    expect(hits).toEqual(['app/main.ts×1'])
    // 그 한 자리가 captureSheet 안이다(셔터·롤·시점 갱신이 다 그것을 부른다)
    expect(/function captureSheet\(\)[\s\S]{0,200}?addSheet\(app, captureThumb\(\)\)/.test(app('main.ts'))).toBe(true)
  })

  it('셔터(종이 띠 「+」)는 자기 손으로 안 만든다 — 훅 하나를 부른다', () => {
    const pb = app('paperbar.ts')
    expect(/hooks\.capture\(\)/.test(pb)).toBe(true)
    expect(/addSheet/.test(pb)).toBe(false)         // 옛 경로가 남아 있지 않다
  })

  it('겹을 얹는 두 자리가 **같은 앞처리**를 부른다 — 롤과 종속 탭 「+」', () => {
    const m = app('main.ts')
    // 롤(손 띠)의 처리 안에 beforeAddLayer가 있다
    expect(/btn-roll-tracing[\s\S]{0,900}?beforeAddLayer\(\)/.test(m)).toBe(true)
    // 종속 탭 「+」는 layerbar의 훅으로 같은 함수를 받는다
    expect(/beforeAdd: beforeAddLayer/.test(m)).toBe(true)
    expect(/hooks\.beforeAdd\?\.\(\)/.test(app('layerbar.ts'))).toBe(true)
    // 그리고 **굳히는 판정은 하나**다 — freezePoseForLayer 호출도 한 자리
    const calls = files
      .filter(f => relOf(f) !== 'app/state.ts')
      .reduce((n, f) => n + (readFileSync(f, 'utf8').match(/freezePoseForLayer\(/g) ?? []).length, 0)
    expect(calls).toBe(1)
  })
})
