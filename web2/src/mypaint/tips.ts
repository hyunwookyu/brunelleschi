// 팁 아틀라스·종이 높이맵(web2-63) — tools/tips-gen.mjs가 낸 회색 PNG(src/mypaint/tips/*.png)를 부팅에서
// 한 번 풀어 Float32 마스크로 든다. 엔진(surface.renderTipMask)은 이 표를 «읽기만» 한다.
//
// 로드는 비동기(PNG 디코드 — Image → canvas → ImageData)라 «준비 전» 도장은 절차 타원(62 경로)으로 떨어진다.
// 그 상태는 값으로 보인다(tipsReady · tipStats.missing) — #105(조용한 폴백 금지): 팔은 준비를 기다리고 나서 잰다
// (diag.tipsReadyForTest) · 제품은 로드 뒤 굽기 텍스처를 한 번 다시 굽는다(main).
//
// 자산의 출처·라이선스는 tips/src/tips.json → tips.gen.ts(TIPS[].source/license/license_check)에 값으로 있다.

import { TIPS, TIP_SIZE, PAPER_NAME, type TipMeta } from './tips.gen'

export interface TipAtlas {
  name: string
  /** 판 수 */
  n: number
  /** 판 한 변(px) — 정사각 */
  size: number
  /** 마스크 0..1 · data[f·size² + y·size + x] */
  data: Float32Array
  meta: TipMeta
}

const urls = import.meta.glob('./tips/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const atlases = new Map<string, TipAtlas>()
let paperTile: { data: Float32Array; n: number } | null = null
let loading: Promise<void> | null = null
let loadError: string | null = null

function urlOf(name: string): string | null {
  for (const [k, v] of Object.entries(urls)) if (k.endsWith(`/${name}.png`)) return v
  return null
}

function decodeGray(url: string): Promise<{ w: number; h: number; g: Float32Array }> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => {
      const c = document.createElement('canvas')
      c.width = im.naturalWidth; c.height = im.naturalHeight
      const g2 = c.getContext('2d', { willReadFrequently: true })!
      g2.drawImage(im, 0, 0)
      const d = g2.getImageData(0, 0, c.width, c.height).data
      const g = new Float32Array(c.width * c.height)
      for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i]! / 255      // 회색 PNG — R = 값
      res({ w: c.width, h: c.height, g })
    }
    im.onerror = () => rej(new Error(`팁 PNG 로드 실패: ${url}`))
    im.src = url
  })
}

/** 부팅에서 한 번 — 아틀라스 전부 + 종이. 두 번 불러도 한 번만 돈다. Image가 없는 환경(단위 시험)은 즉시 끝난다. */
export function loadTipAssets(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return
    for (const t of TIPS) {
      const url = urlOf(t.name)
      if (!url) { loadError = `아틀라스 없음: ${t.name}`; continue }
      try {
        const { w, h, g } = await decodeGray(url)
        if (t.name === PAPER_NAME) {
          if (w !== h) throw new Error(`종이 타일이 정사각이 아니다 ${w}×${h}`)
          paperTile = { data: g, n: w }
          continue
        }
        if (h !== t.size || w !== t.size * t.frames) throw new Error(`아틀라스 크기 불일치 ${t.name}: ${w}×${h} (기대 ${t.size * t.frames}×${t.size})`)
        // 가로 이어 붙인 판을 판별 연속 배열로
        const data = new Float32Array(t.frames * t.size * t.size)
        for (let f = 0; f < t.frames; f++)
          for (let y = 0; y < t.size; y++)
            for (let x = 0; x < t.size; x++)
              data[f * t.size * t.size + y * t.size + x] = g[y * w + f * t.size + x]!
        atlases.set(t.name, { name: t.name, n: t.frames, size: t.size, data, meta: t })
      } catch (e) {
        loadError = (e as Error).message
      }
    }
  })()
  return loading
}

/** 팁 이름 목록(종이 제외) — 고르개·진단 */
export const TIP_CHOICES: readonly string[] = TIPS.filter(t => t.name !== PAPER_NAME).map(t => t.name)
export const tipAtlas = (name: string): TipAtlas | null => atlases.get(name) ?? null
export const paperHeightTile = (): { data: Float32Array; n: number } | null => paperTile
/** 전부 준비됐는가(값 — 팔은 이것을 기다린다) */
export const tipsReady = (): boolean => atlases.size === TIP_CHOICES.length && paperTile !== null
export const tipsLoadError = (): string | null => loadError
/** 진단·사진 — 아틀라스 전부(엔진이 읽는 그 값 · 판별 연속) */
export const tipAtlasesForTest = (): { name: string; n: number; size: number; data: number[] }[] =>
  TIP_CHOICES.map(n => atlases.get(n)).filter((a): a is TipAtlas => !!a).map(a => ({ name: a.name, n: a.n, size: a.size, data: Array.from(a.data) }))
export { TIP_SIZE }
