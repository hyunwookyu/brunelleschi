// web2-73 — 원장의 값을 막대로 그리는 도우미(사진용 · 새 의존 없음 · 값은 인용일 뿐 #47).
// 스펙이 스펙을 import하면 전량 실행이 거부되므로(#104 ④) 비-스펙 모듈로 둔다.
import { type Page } from '@playwright/test'

export interface BarGroup { label: string; bars: { name: string; v: number; color: string }[]; unit: string }

export async function barChart(page: Page, title: string, note: string, groups: BarGroup[]): Promise<Buffer> {
  await page.goto('/?reset')
  await page.waitForFunction(() => !location.search.includes('reset'), null, { timeout: 20_000 })
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  const b64 = await page.evaluate(([t, n, gs]) => {
    const G = gs as BarGroup[]
    const W = 980
    const H = 76 + G.reduce((a, g) => a + 24 + g.bars.length * 26, 0)
    const cv = document.createElement('canvas')
    cv.width = W * 2; cv.height = H * 2
    const g = cv.getContext('2d')!
    g.scale(2, 2)
    g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, W, H)
    g.fillStyle = '#3c3831'; g.font = '600 17px system-ui'; g.fillText(t as string, 20, 30)
    g.fillStyle = '#6b655c'; g.font = '12px system-ui'; g.fillText(n as string, 20, 50)
    let y0 = 76
    for (const grp of G) {
      g.fillStyle = '#3c3831'; g.font = '600 13px system-ui'; g.fillText(grp.label, 20, y0 + 4)
      const max = Math.max(...grp.bars.map(b => b.v), 1e-9)
      grp.bars.forEach((b, k) => {
        const y = y0 + 16 + k * 26
        const w = Math.max(2, (b.v / max) * 520)
        g.fillStyle = b.color; g.fillRect(190, y, w, 18)
        g.fillStyle = '#6b655c'; g.font = '12px system-ui'
        g.textAlign = 'right'; g.fillText(b.name, 182, y + 13); g.textAlign = 'left'
        g.fillStyle = '#3c3831'; g.font = '600 12px system-ui'
        g.fillText(`${b.v.toLocaleString()} ${grp.unit}`, 190 + w + 8, y + 13)
      })
      y0 += 24 + grp.bars.length * 26
    }
    return cv.toDataURL('image/png').split(',')[1]!
  }, [title, note, groups] as unknown[])
  return Buffer.from(b64, 'base64')
}
