import { test } from '@playwright/test'
const settle = (page: any) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
async function shot(page: any, x: number, y: number) {
  const buf = await page.screenshot({ clip: { x, y, width: 10, height: 10 } })
  return page.evaluate(async (b64: string) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
    const g = cv.getContext('2d')!; g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, 4, 4).data
    return [d[0], d[1], d[2]]
  }, buf.toString('base64'))
}
test('bisect in app', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => {
    const app = document.getElementById('app')!
    const red = document.createElement('div')
    red.style.cssText = 'position:absolute;left:300px;top:80px;width:120px;height:60px;background:#ff0000;z-index:1'
    app.append(red)
    const green = document.createElement('div')
    green.id = 'g1'
    green.style.cssText = 'position:absolute;left:300px;top:80px;width:60px;height:60px;background:#00ff00;mix-blend-mode:multiply;z-index:1'
    app.append(green)
  })
  await settle(page)
  console.log('[b] div-in-app=' + JSON.stringify(await shot(page, 320, 100)))
  // film 캔버스를 같은 자리로 — 초록으로 칠해 대조
  await page.evaluate(() => {
    const f = document.getElementById('film') as HTMLCanvasElement
    f.style.display = ''
    const g = f.getContext('2d')!
    g.setTransform(1,0,0,1,0,0)
    g.fillStyle = '#00ff00'; g.fillRect(380, 80, 60, 60)
  })
  console.log('[b] film-over-red=' + JSON.stringify(await shot(page, 400, 100)))
})
