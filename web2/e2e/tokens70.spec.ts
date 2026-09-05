// web2-70 — 시각 시스템의 게이트(§1 토큰 · §2 강조색과 상태 셋 · §3 아이콘 한 세트 · §4 판과 글자) · 반증(D-3)을 실제로 돌린다.
// 원장: stage0/out/tokens70_web2_dpr{1,2}.json (LEDGER=1 · 워커 1 · #99). 픽셀을 읽지 않는다(dpr2 목록 밖 — 값은 DOM·계산·파일).
//
// 착수 표 대조(NOTES 70): #109(옛 자리·새 자리 둘 다 살면 못 센다 — 인라인 16진수 0 · Phosphor 잔존 0이 그 처방) ·
// #108(단언 판과 반증 판이 같은 값이면 자를 의심 — 반증 넷을 값으로) · #107(«전부 0»은 자를 먼저 — 정규식 자 검증) · #42 · #12 · #54.
import { test, expect, type Page } from '@playwright/test'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { execSync } from 'node:child_process'
import { C } from '../src/core/constants'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = (project: string) => resolve(HERE, `../../stage0/out/tokens70_web2_${project === 'dpr2' ? 'dpr2' : 'dpr1'}.json`)
const TREE = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() } catch { return '?' } })()
const read = (p: string) => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n')
const listTs = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? listTs(p) : /\.ts$/.test(f) ? [p] : [] })

// ── §1 자: 16진수 색 리터럴 — `#face-pop` 같은 id는 안 센다(뒤에 글자·하이픈이 오면 색이 아니다 · #107 자 검증) ──
// 3·4자리는 CSS 값 자리(앞 `: = " ' 공백` · 뒤 `; " ' 공백 , }`)에서만 — `(#108)` 같은 PITFALLS 번호는 색이 아니다
export const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![\w-])|(?<=[:="'\s])#[0-9a-fA-F]{3,4}(?=[;"'\s,}])/g
const stripComments = (s: string, html: boolean) => html
  ? s.replace(/<!--[^]*?-->/g, '').replace(/\/\*[^]*?\*\//g, '')
  : s.replace(/\/\*[^]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
/** 토큰이 아닌 색이 사는 예외 파일(값으로 남긴다 · NOTES 70 D-4): 그림 재료·논리·진단 상수 */
export const HEX_EXCEPTIONS: Record<string, string> = {
  'src/core/constants.ts': 'PAPER_HEX(캔버스 종이 — tokens.css --paper와 같은 값 · 아래 단언) · WHITE/BLACK(곱의 항등·해시 판) · TEST_INK_*(진단 견본 잉크 — 원장 비교 값 유지)',
  'src/core/material.ts': '연필 경도의 심 색(재료 — 그림)',
  'src/core/palette.ts': '면 재료의 톤(벽돌·콘크리트… — 그림)',
  'src/core/waitfade.ts': '대기 획의 잉크색(획의 상태색 — 그림)',
  'src/core/colorwheel.ts': '마커 잉크의 흑/백 판정(논리)',
  'src/ui/tokens.css': '토큰 파일 자체(정본)',
}

function hexCensus() {
  const files = [resolve(ROOT, 'index.html'), ...listTs(resolve(ROOT, 'src'))]
  const rows: { file: string; n: number; n_with_comments: number; exception: string | null; sample: string[] }[] = []
  for (const f of files) {
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/')
    const raw = read(f)
    const s = stripComments(raw, rel.endsWith('.html')).replace(/<meta name="theme-color"[^>]*>/, '')   // 설치 표시줄 색(매니페스트 규약 — 아래 단언: --paper와 같은 값)
    const hits = [...s.matchAll(HEX_RE)].map(m => m[0])
    const all = [...raw.matchAll(HEX_RE)].map(m => m[0])
    if (hits.length || all.length) rows.push({ file: rel, n: hits.length, n_with_comments: all.length, exception: HEX_EXCEPTIONS[rel] ?? null, sample: hits.slice(0, 6) })
  }
  const tokensCss = read(resolve(ROOT, 'src/ui/tokens.css')).replace(/\/\*[^]*?\*\//g, '')   // 주석을 뺀다(머리 주석이 [data-theme=dark]를 말한다)
  const rootBlock = tokensCss.split('\n[data-theme=dark]')[0]!
  const darkBlock = tokensCss.split('\n[data-theme=dark]')[1] ?? ''
  const tokens = [...rootBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => ({ name: m[1]!, value: m[2]!.trim() }))
  const dark = [...darkBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => m[1]!)
  const colorTokens = tokens.filter(t => /^#|^rgba?\(/.test(t.value)).map(t => t.name)
  // 어두운 판이 덮어야 하는 색 토큰: 판·잉크·선·강조·선택·경고 + 그림의 창(색 차로 뜨는 것). 종이·흰/검·재료 그림 색은 «같이 쓴다»(값으로 적는다)
  const MUST_DARK = ['--panel', '--panel-2', '--panel-down', '--ink', '--ink-2', '--line', '--accent', '--select', '--warn', '--pic-window']
  const shared = colorTokens.filter(n => !dark.includes(n))
  return { rows, tokens, token_count: tokens.length, color_tokens: colorTokens.length, dark_overrides: dark, must_dark_missing: MUST_DARK.filter(n => !dark.includes(n)), shared_light_dark: shared, offenders: rows.filter(r => !r.exception && r.n > 0) }
}

// ── WCAG 대비 비 ──
const lum = (hex: string) => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())!; const c = [m[1], m[2], m[3]].map(h => { const v = parseInt(h!, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]! }
export const contrast = (a: string, b: string) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1! + 0.05) / (l2! + 0.05) }
const rgbToHex = (s: string) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m ? '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : s }

async function boot(page: Page, q = '/?reset') {
  await page.goto(q)
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await page.waitForFunction(() => (window as any).__b2.diag.tipsReadyForTest().ready, null, { timeout: 20_000 })
  await page.waitForTimeout(200)
}

const OUTV: Record<string, unknown> = {}
const RUN_ID = `${TREE}-${process.env.TEST_WORKER_INDEX ?? '0'}-${Date.now().toString(36).slice(0, 6)}`
// 원장은 시험마다 쓴다 — Playwright는 실패한 시험 뒤 워커를 새로 띄우므로 afterAll 한 번은 앞 시험의 값을 잃는다(68 [H1]·69 실측).
// 같은 «실행»(run_id — 트리 + 시작 시각)의 앞 값만 합친다 · 다른 실행의 잔재는 안 합친다(68 [H1]의 «낡은 키» 사고 방지).
test.afterEach(({ }, info) => {
  const f = OUT(info.project.name)
  mkdirSync(dirname(f), { recursive: true })
  let prev: Record<string, unknown> = {}
  try { const j = JSON.parse(readFileSync(f, 'utf-8')); if (j.run_id && String(j.run_id).startsWith(TREE)) prev = j } catch { prev = {} }
  const head = { conditions: { project: info.project.name, workers: 1, tree: TREE, canonical: 'LEDGER=1 node tools/e2e.mjs ledger e2e/tokens70.spec.ts (#99)' }, run_id: prev.run_id ?? RUN_ID, what: 'web2-70 시각 시스템 게이트 — §1 토큰(16진수 0 · 토큰 수 · dark 덮음) · §2 강조색 대비(값) · 상태 셋(클래스만 · 못 누름 .35 실측) · §3 아이콘(이모지 0 · 글자만인 도구 단추 0 · 선 굵기 하나 · 세트 잔존 0 · 라이선스) · §4 판(둥글기 1종 · 여백 8의 배수 · 글자 크기 3종) · 반증 넷', tree: TREE, pitfall_citations: [109, 108, 107, 42, 12, 54], constants_used: { TOKENS70_CONTRAST_TEXT_MIN: C.TOKENS70_CONTRAST_TEXT_MIN, TOKENS70_CONTRAST_ICON_MIN: C.TOKENS70_CONTRAST_ICON_MIN, TOKENS70_MUTED: C.TOKENS70_MUTED, TOKENS70_ICON_STROKE: C.TOKENS70_ICON_STROKE, TOKENS70_FONT_SIZES: C.TOKENS70_FONT_SIZES, TOKENS70_RADIUS_PX: C.TOKENS70_RADIUS_PX, TOKENS70_GAP_PX: C.TOKENS70_GAP_PX, ACCENT_CAND_YELLOW_HEX: C.ACCENT_CAND_YELLOW_HEX, ACCENT_CAND_BLUE_HEX: C.ACCENT_CAND_BLUE_HEX } }
  const { conditions: _c, run_id: _r, what: _w, tree: _t, pitfall_citations: _p, constants_used: _u, ...prevVals } = prev as Record<string, unknown>
  writeFileSync(f, JSON.stringify({ ...head, ...prevVals, ...OUTV }, null, 2))
})

test('§1 토큰 하나 — tokens.css 밖 16진수 0(예외 목록은 값) · 토큰 수 · dark 변형이 색 토큰을 덮는다 · 반증(자 검증 + 되살리면 1)', async () => {
  const c = hexCensus()
  // 반증 ① — 자(정규식)가 id를 색으로 안 센다 · 색은 센다(#107: «전부 0»은 자를 먼저)
  const probe = (s: string) => [...s.matchAll(HEX_RE)].length
  const falsify = { id_not_counted: probe('#face-pop #dim #ink #abc-def (#108) #105)') === 0, color_counted: probe("color: #3c3831; fill=\"#fff\" rgba") === 2, revived_one: probe(read(resolve(ROOT, 'index.html')).replace('</style>', 'x{color:#123456}</style>')) >= 1 }
  const paper = C.PAPER_HEX
  const paperTok = c.tokens.find(t => t.name === '--paper')?.value
  const themeMeta = /<meta name="theme-color" content="([^"]+)"/.exec(read(resolve(ROOT, 'index.html')))?.[1]
  OUTV.s1_tokens = { def: '16진수 색 리터럴 = HEX_RE(뒤에 글자·하이픈이 오면 id — 안 센다) · 주석은 뺀 셈(n)과 든 셈(n_with_comments)을 갈라 적는다 · 예외 파일은 HEX_EXCEPTIONS(그림 재료·논리·진단 상수)', files_scanned: listTs(resolve(ROOT, 'src')).length + 1, rows: c.rows, offenders: c.offenders.map(r => `${r.file} ${r.n}`), token_count: c.token_count, color_tokens: c.color_tokens, dark_overrides: c.dark_overrides.length, must_dark_missing: c.must_dark_missing, shared_light_dark: c.shared_light_dark, paper_const_eq_token: paper === paperTok, theme_color_meta: themeMeta, theme_color_eq_paper: themeMeta === paperTok, falsify }
  expect(c.offenders, '예외 밖 파일의 16진수 0').toEqual([])
  expect(c.must_dark_missing, 'dark가 덮어야 할 색 토큰이 빠지지 않았다').toEqual([])
  expect(paperTok, 'PAPER_HEX == --paper(정본 하나)').toBe(paper)
  expect(themeMeta, 'theme-color 메타 == --paper(예외의 조건)').toBe(paperTok)
  expect(falsify.id_not_counted && falsify.color_counted && falsify.revived_one, '반증 ① — 자가 id를 안 세고 색을 세며 하나를 되살리면 1').toBe(true)
  expect(c.token_count).toBeGreaterThan(20)
})

test('§2 강조색 하나 — 후보 둘의 대비(값) · 판정 · 상태 셋은 클래스만(인라인 style 0) · 되돌리기 못 누름 .35 실측 · 반증(강조색 = 판이면 비 1.0)', async ({ page }) => {
  await boot(page)
  const live = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { accent: cs.getPropertyValue('--accent').trim(), panel: cs.getPropertyValue('--panel').trim(), ink: cs.getPropertyValue('--ink').trim(), paper: cs.getPropertyValue('--paper').trim(), muted: cs.getPropertyValue('--muted').trim() } })
  const cand = { yellow: C.ACCENT_CAND_YELLOW_HEX, blue: C.ACCENT_CAND_BLUE_HEX }
  const ratio = { yellow: contrast(cand.yellow, live.panel), blue: contrast(cand.blue, live.panel), accent_live: contrast(live.accent, live.panel), ink_on_panel: contrast(live.ink, live.panel), accent_on_paper: contrast(live.accent, live.paper) }
  const passes = (r: number) => ({ text: r >= C.TOKENS70_CONTRAST_TEXT_MIN, icon: r >= C.TOKENS70_CONTRAST_ICON_MIN })
  const judge = { yellow: passes(ratio.yellow), blue: passes(ratio.blue) }
  const verdict = judge.yellow.text && judge.yellow.icon && judge.blue.text && judge.blue.icon ? 'yellow(둘 다 넘으면 노랑 — 제도판)' : judge.blue.text && judge.blue.icon ? 'blue' : judge.yellow.text && judge.yellow.icon ? 'yellow' : 'none'
  // 상태 셋 — 클래스/속성으로만: 누를 것에 인라인 style로 opacity/background/color를 박은 것 0
  const inline = await page.evaluate(() => Array.from(document.querySelectorAll('button, .rrow, .favbtn, .t, .ptab, .lsum')).filter(e => /opacity|background|color/.test(e.getAttribute('style') || '')).map(e => e.id || e.className))
  // 못 누름 — 새 문서의 되돌리기(획 0)와 렌즈(카메라 없음)
  const muted = await page.evaluate(() => { const g = (id: string) => { const e = document.getElementById(id) as HTMLButtonElement; return { disabled: e.disabled || e.classList.contains('disabled'), opacity: Number(getComputedStyle(e).opacity) } }; return { undo: g('btn-undo'), redo: g('btn-redo'), lens: g('btn-lens'), roll: g('btn-roll') } })
  const pressedRule = await page.evaluate(() => Array.from(document.styleSheets).flatMap(s => { try { return Array.from(s.cssRules) } catch { return [] } }).some(r => (r as CSSStyleRule).selectorText?.includes(':active') && /panel-down/.test((r as CSSStyleRule).style?.background || (r as CSSStyleRule).cssText)))
  const selected = await page.evaluate(() => { const b = document.getElementById('btn-pencil')!; const on = b.classList.contains('on'); const col = getComputedStyle(b).color; return { on, color: col } })
  OUTV.s2_accent = { def: 'WCAG 대비 비(상대 휘도) — 판(--panel) 위 글자 ≥ 4.5 · 아이콘 ≥ 3(constants) · 둘 다 넘으면 노랑 · 하나만 넘으면 그것', candidates: cand, ratio, judge, verdict, live, falsify_same_color_ratio: contrast(live.panel, live.panel), inline_style_state_count: inline.length, inline_style_state: inline, muted, muted_expected: C.TOKENS70_MUTED, pressed_rule_present: pressedRule, selected_pencil: { on: selected.on, color: rgbToHex(selected.color), is_accent: rgbToHex(selected.color) === live.accent } }
  expect(Math.abs(contrast(live.panel, live.panel) - 1), '반증 — 같은 색끼리는 비 1.0(임계에 «실패»한다)').toBeLessThan(1e-9)
  expect(verdict === 'blue' ? live.accent : cand.yellow, '살아 있는 --accent가 판정과 같다').toBe(live.accent)
  expect(ratio.accent_live, '강조색은 판 위 글자 4.5:1을 넘는다').toBeGreaterThanOrEqual(C.TOKENS70_CONTRAST_TEXT_MIN)
  expect(inline, '상태는 클래스로만 — 인라인 style 0').toEqual([])
  expect(muted.lens.disabled, '새 문서의 렌즈는 못 누름').toBe(true)
  expect(Math.abs(muted.lens.opacity - C.TOKENS70_MUTED), '못 누름 = .35 실측(렌즈)').toBeLessThan(0.01)
  if (muted.undo.disabled) expect(Math.abs(muted.undo.opacity - C.TOKENS70_MUTED), '못 누름 = .35 실측(되돌리기)').toBeLessThan(0.01)
  expect(selected.on && rgbToHex(selected.color) === live.accent, '선택된 도구(연필) 아이콘 색 = --accent').toBe(true)
  expect(pressedRule, '눌림 규칙(:active → --panel-down)이 CSS에 있다').toBe(true)
})

test('§3 아이콘 한 세트 — 이모지 0 · 글자만인 도구 단추 0(예외 목록은 값) · 선 굵기 실측 하나 · 세트 잔존 0 · 라이선스 파일 · 뗀 라벨 수', async ({ page }) => {
  await boot(page)
  const html = read(resolve(ROOT, 'index.html'))
  const srcAll = listTs(resolve(ROOT, 'src')).map(read).join('\n')
  const bodyNoComments = html.slice(html.indexOf('</style>')).replace(/<!--[^]*?-->/g, '')
  const domText = await page.evaluate(() => Array.from(document.querySelectorAll('button, label, summary, .head, span, u, b')).map(e => e.textContent || '').join(' '))
  const emoji = [...(bodyNoComments + domText).matchAll(/\p{Emoji_Presentation}/gu)].map(m => m[0])
  const pictoInSrc = [...srcAll.matchAll(/\p{Emoji_Presentation}/gu)].map(m => m[0])
  const lic = existsSync(resolve(ROOT, 'vendor/lucide/LICENSE')) ? read(resolve(ROOT, 'vendor/lucide/LICENSE')) : ''
  const pkgJson = JSON.parse(read(resolve(ROOT, 'package.json'))) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  const pkg = JSON.stringify(pkgJson.dependencies ?? {})   // 출하 의존만 — 옛 세트(Phosphor)는 e2e 반증 견본(옛 채운 그림)으로 devDependencies에만 남는다(번들 밖 · 값)
  const dom = await page.evaluate(() => {
    const bs = Array.from(document.querySelectorAll('button'))
    const textOnly = bs.filter(b => !b.querySelector('svg, canvas, img') && (b.textContent || '').trim()).map(b => `${b.id || '(' + (b.className || b.tagName.toLowerCase()) + ')'}:${(b.textContent || '').trim().slice(0, 10)}`)
    const toolTextOnly = Array.from(document.querySelectorAll('#sidebar button, #tray button, #pentray button, #etray button')).filter(b => !b.querySelector('svg') && (b.textContent || '').trim()).map(b => b.id)
    const withIcon = bs.filter(b => b.querySelector('svg'))
    const iconAndText = withIcon.filter(b => (b.textContent || '').trim()).map(b => `${b.id}:${(b.textContent || '').trim().slice(0, 10)}`)
    const aria = bs.filter(b => b.querySelector('svg') && !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.title).map(b => b.id)
    const ico = Array.from(document.querySelectorAll('svg.ico'))
    const sw = new Set<string>()
    for (const s of ico) { const p = s.querySelector('path, circle, rect, line, polyline, polygon'); if (p) sw.add(getComputedStyle(p).strokeWidth) }
    const swAttr = new Set(Array.from(document.querySelectorAll('svg.ico [stroke-width]')).map(e => e.getAttribute('stroke-width')!))
    const sizes = new Set(ico.map(s => { const r = s.getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)}` }))
    const lucide = Array.from(document.querySelectorAll('svg[class*="lucide-"]')).length
    const phosphorLike = Array.from(document.querySelectorAll('svg[viewBox="0 0 256 256"]')).length
    return { buttons: bs.length, textOnly, toolTextOnly, iconAndText, missingAria: aria, ico: ico.length, lucide, phosphor_256_grid: phosphorLike, strokeWidths: [...sw], strokeWidthAttrs: [...swAttr], sizes: [...sizes] }
  })
  // 글자만인 단추의 예외(값): 숫자판(치수 숫자 — 글자 단추 예외) · 종이 탭(이름) · 경도 글자(제도판) · 개발 작업대(R-D)
  const exceptionRe = /^\(|^paint-erase-soft|^tunelab-|^rec-del/
  const textOnlyOffenders = dom.textOnly.filter(s => !exceptionRe.test(s))
  const numericRe = /^[\d.]+(px|mm|%)?( · \d+%)?$|^[0-9A-Z]{1,2}$|^HB|^\d/
  const iconTextOffenders = dom.iconAndText.filter(s => !numericRe.test(s.split(':')[1] || ''))
  const stripped = [...html.matchAll(/aria-label="([^"]+)"/g)].length
  OUTV.s3_icons = { def: '이모지 = \\p{Extended_Pictographic} 전수(index.html + src) · 글자만인 단추 = svg/canvas/img 없는 button(예외: 숫자판·종이 탭·경도 글자·개발 작업대 — 값) · 선 굵기 = svg.ico 첫 도형의 computed stroke-width(non-scaling-stroke) · 세트 = lucide-* 클래스 수 · 256격자(옛 세트) 0', emoji_count: emoji.length, emoji, emoji_in_src_strings: pictoInSrc.length, buttons: dom.buttons, text_only: dom.textOnly, text_only_offenders: textOnlyOffenders, tool_text_only: dom.toolTextOnly, icon_and_text: dom.iconAndText, icon_and_text_offenders: iconTextOffenders, missing_aria: dom.missingAria, ico_count: dom.ico, lucide_count: dom.lucide, phosphor_256_grid: dom.phosphor_256_grid, stroke_widths_computed: dom.strokeWidths, stroke_width_attrs_on_ico: dom.strokeWidthAttrs, icon_sizes: dom.sizes, license: { file: 'web2/vendor/lucide/LICENSE', isc: /ISC/.test(lic), source: 'lucide-static 1.41.0 (npm) · https://lucide.dev' }, phosphor_in_dependencies: /phosphor/i.test(pkg), phosphor_in_devDependencies: /phosphor/i.test(JSON.stringify(pkgJson.devDependencies ?? {})), phosphor_dev_reason: 'e2e/icons.spec·papericon31.spec의 반증 견본(옛 채운 카메라·톱니 — 번들 밖)', aria_labels_in_html: stripped, stripped_labels_expected: 35 }
  expect(emoji, '이모지 0').toEqual([])
  expect(dom.toolTextOnly, '글자만인 도구 단추 0').toEqual([])
  expect(textOnlyOffenders, '글자만인 단추 = 예외 목록뿐').toEqual([])
  expect(iconTextOffenders, '아이콘이 있는 단추의 글자 라벨은 뗐다(숫자 라벨 예외)').toEqual([])
  expect(dom.missingAria, '뗀 라벨은 aria-label로 남았다').toEqual([])
  expect(dom.strokeWidths, '아이콘 선 굵기 실측 하나').toEqual([`${C.TOKENS70_ICON_STROKE}px`])
  expect(dom.strokeWidthAttrs, 'svg.ico 안 stroke-width 속성 0(CSS 하나가 정한다)').toEqual([])
  expect(dom.phosphor_256_grid, '옛 세트(256격자) 잔존 0').toBe(0)
  expect(/phosphor/i.test(pkg), '출하 의존(dependencies)에서 옛 세트를 뺐다(#109 지운 것 · dev 견본은 값으로)').toBe(false)
  expect(/ISC/.test(lic), '라이선스 파일이 저장소에 있다').toBe(true)
  expect(dom.lucide).toBeGreaterThanOrEqual(30)
})

test('§4 판과 글자 — 둥글기 1종 · 여백 8의 배수(4는 아이콘 안) · 글자 크기 3종 · 그림자 0 · 판 테두리 0 · 반투명 판 0 · 반증(하나 바꾸면 2종)', async ({ page }) => {
  await boot(page)
  const css = read(resolve(ROOT, 'index.html'))
  const style = stripComments(css.slice(css.indexOf('<style>'), css.indexOf('</style>')), true)
  const radiusPx = [...style.matchAll(/border-radius:\s*([^;]+);/g)].map(m => m[1]!.trim())
  const radiusKinds = [...new Set(radiusPx.map(v => v === '0' ? '0' : v))]
  const spacingPx = [...style.matchAll(/\b(?:padding|margin|gap|padding-[a-z]+|margin-[a-z]+|row-gap|column-gap):\s*([^;{}]+);/g)].flatMap(m => m[1]!.split(/\s+/)).filter(t => /px$/.test(t))
  const fontPx = [...style.matchAll(/font(?:-size)?:\s*[^;]*?(\d+(?:\.\d+)?)px/g)].map(m => m[1]!)
  const shadows = [...style.matchAll(/box-shadow:\s*([^;]+);/g)].map(m => m[1]!).filter(v => v !== 'none')
  const rgbaPanels = [...style.matchAll(/rgba\([^)]*\)/g)].map(m => m[0])
  // 살아 있는 값(computed) — 판마다 실측: 둥글기 · 바탕 불투명 · 글자 크기 집합
  await page.evaluate(() => { document.getElementById('btn-paint')!.click(); (document.getElementById('pane-settings') as HTMLDetailsElement).open = true; document.getElementById('dim-toggle')!.click() })
  await page.waitForTimeout(300)
  const live = await page.evaluate(() => {
    const panels = ['#painttray', 'details#pane-settings > div', '#dimpanel', '#display-pop', '#lens-pop', '#snap-pop', '#views-pop', '#stencil-box'].map(sel => { const e = document.querySelector(sel) as HTMLElement | null; if (!e) return null; const cs = getComputedStyle(e); return { sel, radius: cs.borderRadius, bg: cs.backgroundColor, shadow: cs.boxShadow, border: cs.borderWidth } }).filter(Boolean)
    const all = Array.from(document.querySelectorAll('#sidebar *, #eyebar *, #topleft *, #painttray *, details.pane *, #dimpanel *')).filter(e => (e.textContent || '').trim() && e.children.length === 0)
    const engraved = all.filter(e => e instanceof SVGElement).map(e => `${(e as SVGElement).id || e.className.baseVal}:${getComputedStyle(e).fontSize}`)   // 실물 도구 그림의 각인(경도 글자 — SVG text · 그림의 것 · 값)
    const els = all.filter(e => !(e instanceof SVGElement))
    const fs = new Set(els.map(e => getComputedStyle(e).fontSize))
    const bold = els.filter(e => Number(getComputedStyle(e).fontWeight) >= 600).map(e => (e as HTMLElement).id || e.className || e.tagName)
    return { panels, fontSizes: [...fs], engraved, boldCount: bold.length, boldSample: bold.slice(0, 8) }
  })
  const allowedSpacing = new Set([C.TOKENS70_GAP_PX / 2, ...[1, 2, 3, 4, 5, 6].map(k => k * C.TOKENS70_GAP_PX)].map(v => `${v}px`))
  const spacingOffenders = spacingPx.filter(v => !allowedSpacing.has(v) && v !== '0px')
  const fontKinds = [...new Set(live.fontSizes)]
  const fontOffenders = fontKinds.filter(v => !C.TOKENS70_FONT_SIZES.map(n => `${n}px`).includes(v))
  const radiusLive = [...new Set(live.panels.map(p => p!.radius))]
  const translucent = live.panels.filter(p => /rgba\(.*,\s*0?\.\d+\)$/.test(p!.bg))
  const shadowed = live.panels.filter(p => p!.shadow !== 'none')
  const bordered = live.panels.filter(p => p!.border !== '0px')
  const falsify = { radius_two_kinds: [...new Set([...radiusPx, '3px'])].filter(v => v !== '0' && v !== '50%').length >= 2, spacing_offender_if_added: [...spacingPx, '7px'].filter(v => !allowedSpacing.has(v) && v !== '0px').length >= 1 }
  OUTV.s4_panels = { def: '둥글기 = <style>의 border-radius 값 종류(0과 50%는 «없음/원» — 판의 값이 아니다) + 판 8종의 computed · 여백 = padding/margin/gap의 px 리터럴(토큰이면 0개) + 허용 집합 {4, 8k} · 글자 = 판 안 글자 노드의 computed font-size 집합', radius_css_kinds: radiusKinds, radius_live: radiusLive, spacing_px_literals: spacingPx, spacing_offenders: spacingOffenders, font_px_literals: [...new Set(fontPx)], font_sizes_live: fontKinds, font_offenders: fontOffenders, svg_engraved_text: live.engraved, bold_count: live.boldCount, bold_sample: live.boldSample, shadows_css: shadows, panels_live: live.panels, translucent_panels: translucent.map(p => p!.sel), shadowed_panels: shadowed.map(p => p!.sel), bordered_panels: bordered.map(p => p!.sel), rgba_in_css: rgbaPanels, falsify }
  expect(radiusKinds.filter(v => v !== '0' && v !== '50%'), '둥글기 값 종류 1(var(--radius))').toEqual(['var(--radius)'])
  expect(radiusLive.filter(v => v !== '0px'), '판의 실측 둥글기 하나').toEqual([`${C.TOKENS70_RADIUS_PX}px`])
  expect(spacingOffenders, '여백 px 리터럴은 8의 배수(또는 4)뿐').toEqual([])
  expect(fontOffenders, '글자 크기 3종').toEqual([])
  expect(shadows, '그림자 0').toEqual([])
  expect(translucent.map(p => p!.sel), '반투명 판 0').toEqual([])
  expect(shadowed.map(p => p!.sel), '판 그림자 0(실측)').toEqual([])
  expect(bordered.map(p => p!.sel), '판 테두리 0(실측)').toEqual([])
  expect(falsify.radius_two_kinds && falsify.spacing_offender_if_added, '반증 — 값 하나를 더하면 종류가 는다/걸린다').toBe(true)
})
