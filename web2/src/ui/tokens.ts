// web2-70 §1 — 캔버스 그림(render2d의 작도 표식 · 견본 판 바탕 · 치수 필기)이 읽는 토큰.
// CSS 변수는 tokens.css 하나가 정본이고, 캔버스는 그 값을 **한 번 읽어 캐시**한다(#111 — 프레임마다
// getComputedStyle을 부르지 않는다). 열쇠는 테마 하나(#110 — 문서 버전과 무관): data-theme이 바뀌면 비운다.
import './tokens.css'
import raw from './tokens.css?raw'

/** 밝은 판의 값(폴백 — 문서가 없거나(단위 시험) 아직 안 붙었을 때). tokens.css의 :root 블록을 읽는다 — 정본은 그 파일 하나. */
const FALLBACK: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  const root = raw.split('[data-theme=dark]')[0] ?? ''
  for (const m of root.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
})()

const cache = new Map<string, string>()
let cacheTheme: string | null = null
let reads = 0   // getComputedStyle을 실제로 부른 횟수(진단 — 프레임당 0이 값)

const themeKey = (): string => (typeof document === 'undefined' ? '' : document.documentElement.getAttribute('data-theme') ?? '')

/** `--name`의 현재 값. 문서가 없으면(단위 시험) tokens.css의 밝은 판 값. */
export function tok(name: string): string {
  const fallback = FALLBACK[name] ?? ''
  if (typeof document === 'undefined') return fallback
  const t = themeKey()
  if (t !== cacheTheme) { cache.clear(); cacheTheme = t }
  const hit = cache.get(name)
  if (hit !== undefined) return hit
  reads++
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const out = v || fallback
  cache.set(name, out)
  return out
}

/** rgba(...) 문자열 — 토큰 색에 알파를 얹는다(캔버스 표식의 옅은 판). 16진수 6자리만 받는다. */
export function tokAlpha(name: string, alpha: number): string {
  const hex = tok(name)
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return hex
  return `rgba(${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)},${alpha})`
}

/** 테마를 바꾼다(사진 둘 · 사람 판정용). 캐시는 다음 tok()에서 스스로 비운다. */
export function setTheme(theme: 'light' | 'dark'): void {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
}

/** 진단 — 캐시가 프레임마다 다시 읽지 않는다는 값(getComputedStyle 호출 수). */
export const tokensForTest = { cacheSize: () => cache.size, theme: themeKey, fallback: () => ({ ...FALLBACK }), reads: () => reads }
