// web2-19 4부 ③⑤ — **아이콘 path의 정본 대조**(문자열).
// ㉠ 자작·연필: `docs/instrument-icons.md`가 정본 — index.html의 path가 그 원본과 같다.
//    (심 «색»은 대조하지 않는다 — 정본 문면 「심 색의 출처는 MAT 하나다(#54)」. 정본의
//    fill 값은 예시이고, 기하(path d)만이 정본이다.)
// ㉡ Phosphor: 받은 패키지(@phosphor-icons/core light)의 path가 그대로 이식됐다.
// 펜·지우개 둘·면: **이 회차에서 손대지 않았다** — 문자열 스냅샷이 앞으로의 드리프트를
//    지킨다(이 회차의 «diff 없음» 자체는 git diff로 확인해 NOTES에 적었다).
// ⑤ LICENSE에 Phosphor 세트 줄이 있다.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// ⚠ 개행 정규화 — Windows에서 git checkout(autocrlf)이 작업 사본을 CRLF로 다시 쓸 수
// 있고, 그러면 LF 고정 정규식이 조용히 죽는다(web2-20 착수 직후 실측 — 갈래 전환이 계기).
const readLF = (p: string) => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n')
const html = readLF(resolve(__dirname, '../index.html'))
const md = readLF(resolve(__dirname, '../../docs/instrument-icons.md'))
const paperbar = readLF(resolve(__dirname, '../src/app/paperbar.ts'))
const mainTs = readLF(resolve(__dirname, '../src/app/main.ts'))

const phosphor = (name: string): string => {
  const svg = readLF(resolve(__dirname,
    `../node_modules/@phosphor-icons/core/assets/light/${name}-light.svg`))
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

  it('Phosphor light path가 그대로 이식됐다(ruler·arrows-out·eye·eye-slash·compass-tool·grid-four·camera)', () => {
    for (const n of ['ruler', 'arrows-out', 'eye', 'eye-slash', 'compass-tool', 'grid-four']) {
      expect(html.includes(phosphor(n)), n).toBe(true)
    }
    // ⚠ **web2-25 3-a에서 갈렸고 web2-31 4번이 되돌렸다**: 종이 띠의 단추가 「+」→
    //   **셔터(camera)** → **종이 + 갱신 화살표**(자작)가 됐다. 31-3의 돋보기가 들어오면서
    //   카메라와 뜻이 겹쳤기 때문이다(지시 31-4). 그러므로 **Phosphor camera 계열은 더
    //   이상 이식 대상이 아니다** — 아래 「카메라 도형 없음」 절이 그 자리를 잰다.
    expect(paperbar.includes(phosphor('camera')), 'camera는 이제 안 쓴다(31-4)').toBe(false)
    // 그리고 **겹의 「+」는 여전히 plus**다 — 그쪽은 뜻이 맞는다(겹을 하나 더 얹는다)
    const lb = readLF(resolve(__dirname, '../src/app/layerbar.ts'))
    expect(lb.includes(phosphor('plus')), 'plus(겹 「+」)').toBe(true)
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

describe('web2-21 3-a — 손 띠 롤 아이콘의 두 자리(#54 · 3·4부 리뷰 [12])', () => {
  it('index.html 인라인 롤 svg 내용이 layerbar 정본 상수와 같다 — 갈리면 여기서 실패한다', () => {
    // 출처는 layerbar.ts 상수 하나이고 index.html 인라인은 초기 표시용 복제다 — 복제는
    // 자동이 못 잡으므로 이 팔이 두 자리를 못 박는다(내용 비교 — 공백 정규화).
    const layerbarTs = readLF(resolve(__dirname, '../src/app/layerbar.ts'))
    const constOf = (name: string): string => {
      const m = new RegExp(`export const ${name} = '([^']+)'`).exec(layerbarTs)
      expect(m, `${name} 상수`).not.toBeNull()
      return m![1]!
    }
    const inner = (svg: string): string[] =>
      [...svg.matchAll(/<(?:circle|path)[^>]*>/g)].map(x => x[0]!.replace(/\s+/g, ' '))
    // ⚠⚠ **web2-34 6번이 표를 갈랐다**(#75 ㉣). 롤 단추 **둘**이 **롤통 하나 + 줄 둘**이
    // 됐다: 접힌 단추(`#btn-roll`)는 `index.html`에 있고 **트레이싱지 롤 정본**을 쓰며,
    // 통 «안»의 줄 둘은 `main.ts`가 **`layerbar.ts`의 상수에서 바로** 짓는다.
    // 물음(「화면의 롤 그림이 정본과 같은가」)은 그대로이고 **재는 자리가 갈렸다** —
    // 줄 쪽은 상수를 그대로 쓰므로 **구성상** 같고(그것을 아래에서 값으로 못 박는다),
    // 접힌 단추만 마크업 대조가 남는다.
    const foldBlock = /id="btn-roll"[^]*?<\/button>/.exec(html)![0]!
    for (const el of inner(constOf('ROLL_TRACING'))) {
      expect(foldBlock.replace(/\s+/g, ' ').includes(el), `btn-roll: ${el.slice(0, 40)}…`).toBe(true)
    }
    const mainTs = readLF(resolve(__dirname, '../src/app/main.ts'))
    expect(/svg: ROLL_TRACING/.test(mainTs), '통의 트레이싱지 줄이 정본 상수를 그대로 쓴다').toBe(true)
    expect(/svg: ROLL_YELLOW/.test(mainTs), '통의 옐로 줄이 정본 상수를 그대로 쓴다').toBe(true)
    // 옛 자리가 남아 있지 않다 — 두 단추는 사라졌다(#75 ㉣: 표를 고치고 옛 예시를 지운다)
    expect(/id="btn-roll-tracing"/.test(html), '옛 롤 단추가 index.html에 없다').toBe(false)
    expect(/id="btn-roll-yellow"/.test(html), '옛 롤 단추가 index.html에 없다').toBe(false)
    // 정본의 정본 — layerbar 상수 자체가 instrument-icons.md의 롤 블록과 같은가(경로 수정 금지)
    for (const [name, head] of [['ROLL_TRACING', '### 트레이싱지 롤'], ['ROLL_YELLOW', '### 옐로 트레이스 롤']] as const) {
      const block = new RegExp(`${head}[^]*?\`\`\`svg\n([^]*?)\`\`\``).exec(md)![1]!
      for (const el of inner(block)) {
        expect(constOf(name).replace(/\s+/g, ' ').includes(el), `${name} ↔ md: ${el.slice(0, 40)}…`).toBe(true)
      }
    }
  })
})

// ── web2-31 4번 — 종이 아이콘에서 카메라를 뗀다 ────────────────────────────────
// 여기서 재는 것은 **소스 쪽 절반**이다(정본 대조 + 카메라 계열이 소스에 남았는가).
// 게이트 문면은 「**화면에** 카메라 도형이 남아 있지 않다」이므로 **자는 DOM**이고
// 그쪽은 `e2e/papericon31.spec.ts`가 잰다 — 이 팔은 「그 파일에 없다」로 게이트를
// 대신하지 않는다(#71 ㉠ · 지시의 급소 2). 두 자가 갈려 있다는 것을 여기 적는다.
describe('web2-31 4번 — 종이 + 갱신 화살표(자작)로 갈렸다', () => {
  const CANON = /### 종이와 갱신 화살표[\s\S]*?```svg\n([\s\S]*?)```/.exec(md)![1]!

  it('정본의 path 넷이 paperbar.ts의 SHEET_ICON에 그대로 있다', () => {
    const paths = [...CANON.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]!)
    expect(paths.length, '종이 · 접힌 모서리 · 호 · 촉').toBe(4)
    for (const p of paths) expect(paperbar.includes(p), `path: ${p.slice(0, 24)}…`).toBe(true)
    // 급(width/height)은 정본이 아니라 **쓰는 자리**가 얹는다 — 정본 블록에는 없다
    expect(/\s(?:width|height)="/.test(CANON), '정본 블록에 크기 급이 없다').toBe(false)
    expect(/width="16" height="16"/.test(paperbar), '탭 줄에서만 16px을 박는다').toBe(true)
  })

  it('선 문법 — 정본 블록이 fill:none · currentColor · 1.6 · round다', () => {
    expect(CANON).toContain('fill="none"')
    expect(CANON).toContain('stroke="currentColor"')
    expect(CANON).toContain('stroke-width="1.6"')
    expect(CANON).toContain('stroke-linecap="round"')
    expect(CANON).toContain('stroke-linejoin="round"')
    expect(CANON).toContain('viewBox="0 0 32 32"')
  })

  it('카메라 계열 훑기 — Phosphor camera 넷 × 여섯 굵기가 소스 어디에도 없다 (+심어서 반증)', () => {
    const weights = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone']
    const names = ['camera', 'camera-plus', 'camera-rotate', 'camera-slash']
    const needles: string[] = []
    for (const w of weights) {
      for (const n of names) {
        const file = resolve(__dirname, `../node_modules/@phosphor-icons/core/assets/${w}/${n}${w === 'regular' ? '' : `-${w}`}.svg`)
        for (const m of readLF(file).matchAll(/<path[^>]*\sd="([^"]+)"/g)) needles.push(m[1]!)
      }
    }
    // 훑는 자리 — 화면을 짓는 소스 전부(정본 문서 포함). 세어서 값으로 남긴다.
    const files = [
      resolve(__dirname, '../index.html'),
      resolve(__dirname, '../../docs/instrument-icons.md'),
      ...listTs(resolve(__dirname, '../src')),
    ]
    const hits: string[] = []
    for (const f of files) {
      const text = readLF(f)
      for (const nd of needles) if (text.includes(nd)) hits.push(`${f}: ${nd.slice(0, 24)}…`)
    }
    expect(needles.length, '카메라 계열 path 수(넷 × 여섯 굵기 · duotone은 둘)').toBeGreaterThanOrEqual(24)
    expect(files.length, '훑은 파일 수').toBeGreaterThan(20)
    expect(hits, '카메라 계열 path가 소스에 없다').toEqual([])
    // 반증(D-3) — 같은 훑기가 **실제로 걸린다**: 옛 아이콘 그대로의 문자열을 건초더미에 심는다
    const planted = `const OLD = '${needles[0]}'`
    expect(needles.some(nd => planted.includes(nd)), '심은 옛 path는 같은 훑기에 걸린다').toBe(true)
  })
})

/** `.ts` 전수 — 훑기가 「내가 아는 파일」이 아니라 **디렉터리 전부**를 보게 한다 */
function listTs(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name)
    if (e.isDirectory()) out.push(...listTs(p))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}
