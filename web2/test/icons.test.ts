// web2-19 4부 ③⑤ — **아이콘 path의 정본 대조**(문자열).
// ㉠ 자작·연필: `docs/instrument-icons.md`가 정본 — index.html의 path가 그 원본과 같다.
//    (심 «색»은 대조하지 않는다 — 정본 문면 「심 색의 출처는 MAT 하나다(#54)」. 정본의
//    fill 값은 예시이고, 기하(path d)만이 정본이다.)
// ㉡ Phosphor: 받은 패키지(@phosphor-icons/core light)의 path가 그대로 이식됐다.
// 펜·지우개 둘·면: **이 회차에서 손대지 않았다** — 문자열 스냅샷이 앞으로의 드리프트를
//    지킨다(이 회차의 «diff 없음» 자체는 git diff로 확인해 NOTES에 적었다).
// ⑤ LICENSE에 Phosphor 세트 줄이 있다.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')
const md = readFileSync(resolve(__dirname, '../../docs/instrument-icons.md'), 'utf-8')
const paperbar = readFileSync(resolve(__dirname, '../src/app/paperbar.ts'), 'utf-8')
const mainTs = readFileSync(resolve(__dirname, '../src/app/main.ts'), 'utf-8')

const phosphor = (name: string): string => {
  const svg = readFileSync(resolve(__dirname,
    `../node_modules/@phosphor-icons/core/assets/light/${name}-light.svg`), 'utf-8')
  return /<path d="([^"]+)"/.exec(svg)![1]!
}

describe('web2-19 4부 ③ — path 문자열 대조', () => {
  it('삼각자(축 스냅)가 정본과 같다', () => {
    // 정본의 「삼각자」 블록에서 path d 셋을 뽑아 index.html에 전부 있는지 본다
    const block = /### 삼각자[\s\S]*?```svg\n([\s\S]*?)```/.exec(md)![1]!
    const paths = [...block.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]!)
    expect(paths.length).toBe(3)
    for (const p of paths) expect(html.includes(p), `삼각자 path: ${p.slice(0, 30)}…`).toBe(true)
  })

  it('접힌 연필이 정본과 같다(기하 — 몸통·각인 상자·원뿔·심)', () => {
    const block = /### 접힌 연필[\s\S]*?```svg\n([\s\S]*?)```/.exec(md)![1]!
    const paths = [...block.matchAll(/d="([^"]+)"/g)].map(m => m[1]!)
    expect(paths.length).toBeGreaterThanOrEqual(5)
    for (const p of paths) expect(html.includes(p), `접힌 연필 path: ${p.slice(0, 30)}…`).toBe(true)
  })

  it('연필통 줄의 원뿔 끝이 정본과 같다(main.ts pencilRowSvg)', () => {
    const block = /### 펼친 연필통 줄[\s\S]*?```svg\n([\s\S]*?)```/.exec(md)![1]!
    const cone = /<path d="(M51 3[^"]+)"/.exec(block)![1]!
    const tip = /<path d="(M59\.4[^"]+)"/.exec(block)![1]!
    expect(mainTs.includes(cone), '원뿔').toBe(true)
    expect(mainTs.includes(tip), '노출된 심').toBe(true)
  })

  it('접힌 펜이 정본(「지금 것 그대로」)과 같다', () => {
    const block = /### 접힌 펜[\s\S]*?```svg\n([\s\S]*?)```/.exec(md)![1]!
    const paths = [...block.matchAll(/d="([^"]+)"/g)].map(m => m[1]!)
    for (const p of paths) expect(html.includes(p), `접힌 펜 path: ${p.slice(0, 30)}…`).toBe(true)
  })

  it('Phosphor light path가 그대로 이식됐다(ruler·arrows-out·eye·eye-slash·compass-tool·grid-four·plus)', () => {
    for (const n of ['ruler', 'arrows-out', 'eye', 'eye-slash', 'compass-tool', 'grid-four']) {
      expect(html.includes(phosphor(n)), n).toBe(true)
    }
    expect(paperbar.includes(phosphor('plus')), 'plus(종이 「+」)').toBe(true)
  })

  it('펜·지우개 둘·면은 손대지 않았다 — 스냅샷(앞으로의 드리프트 방지)', () => {
    // 지우개 둘·면·(옛)펜의 식별 path — web2-19 4부 시점의 index.html 그대로
    for (const p of [
      'M6 20 13 6h7l-7 14z',            // 연필 지우개
      'M9.4 41h7.2l-3.6 8z',            // 펜 몸통 끝(접힌 펜·옛 펜 공통)
    ]) expect(html.includes(p), p).toBe(true)
    // 면(평행사변형)은 btn-face 안의 polygon/path — 버튼이 있고 hidden이 아니다
    expect(/id="btn-face"[\s\S]{0,600}svg/.test(html)).toBe(true)
  })
})

describe('web2-19 4부 ⑤ — LICENSE', () => {
  it('Phosphor 세트 줄이 있다(받은 패키지의 LICENSE를 읽고 적었다 — MIT)', () => {
    const lic = readFileSync(resolve(__dirname, '../../LICENSE'), 'utf-8')
    expect(lic).toContain('Phosphor')
    expect(lic).toContain('@phosphor-icons/core')
  })
})
