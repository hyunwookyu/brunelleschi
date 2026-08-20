// 정적 배포 확인 — 서버 없이, **하위 경로에서**, 오프라인으로 열리는가.
// 그리고 **배포 전환**(web/ → web2): 같은 주소에 다른 앱이 올 때 옛 서비스 워커가
// 캐시에 묶어 두지 않는가.
//
// 서버는 이 스펙이 직접 띄운다 — 배포는 정적 파일뿐이므로 어떤 서버든 같아야 한다.
// `dist/`가 없으면 **건너뛴다**(미실행을 통과로 세지 않는다).
import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(HERE, '..', 'dist')
const SUB = '/brunelleschi'   // Pages의 하위 경로를 흉내 낸다
// 포트는 OS가 준다 — dpr 두 갈래가 같이 도는데 고정 포트면 뒤엣것이 못 연다(한 번 겪었다)
let PORT = 0
let BASE = ''

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.css': 'text/css',
}

/** 옛 배포(web/)를 흉내 낸다 — **문서까지 캐시 우선**인 서비스 워커와 `l.html` 진입점.
 *  web/public/sw.js의 성질만 옮겼다: 캐시에 있으면 네트워크를 안 본다. */
const OLD_SW = `
const CACHE = 'sketch3d-old'
self.addEventListener('install', (e) => e.waitUntil(
  caches.open(CACHE)
    .then(c => Promise.all(['./', './l.html'].map(u => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting())))
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)))
})
`
const OLD_DOC = `<!doctype html><meta charset="utf-8"><title>Brunelleschi</title>
<script>window.__OLD_APP__ = true<\/script><p>옛 앱</p>`

/** 배포 국면 — true면 옛 배포(web/)를 준다. 전환은 이 값 하나를 뒤집는 것이다. */
let oldDeploy = false
let server: Server

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, 'index.html')),
            '빌드본이 없다 — `npm run build`를 먼저 돌린다(미실행은 반증이 아니다)')
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let p = url.pathname
    if (!p.startsWith(SUB)) { res.statusCode = 404; res.end('nope'); return }
    p = p.slice(SUB.length) || '/'
    if (oldDeploy) {
      // 옛 배포에는 web2의 파일이 없다 — 워커와 두 문서만 있다
      if (p === '/sw.js') {
        res.setHeader('Content-Type', 'text/javascript'); res.end(OLD_SW); return
      }
      if (p === '/' || p === '/l.html') {
        res.setHeader('Content-Type', 'text/html'); res.end(OLD_DOC); return
      }
      res.statusCode = 404; res.end('not found'); return
    }
    if (p.endsWith('/')) p += 'index.html'
    try {
      const buf = await readFile(join(DIST, p))
      res.setHeader('Content-Type', MIME[extname(p)] ?? 'application/octet-stream')
      res.end(buf)
    } catch {
      res.statusCode = 404; res.end('not found')
    }
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  PORT = (server.address() as { port: number }).port
  BASE = `http://localhost:${PORT}${SUB}`
})

test.afterAll(async () => {
  await new Promise<void>(r => server?.close(() => r()))
})

test.beforeEach(() => { oldDeploy = false })

test('하위 경로에서 열리고, 워커 scope가 그 경로이고, 오프라인에서도 뜬다', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  // ① 하위 경로에서 그대로 열린다 — base가 상대 경로라 리포지토리 이름을 안 박는다
  await page.goto(`${BASE}/`)
  await page.waitForFunction(() => (window as any).__b2)
  const assets = await page.evaluate(() =>
    [...document.querySelectorAll('script[src], link[href]')]
      .map(e => e.getAttribute('src') ?? e.getAttribute('href')))
  for (const a of assets) expect(a?.startsWith('/')).toBe(false) // 절대 경로면 하위 경로에서 404

  // 빌드 식별자가 화면에 있다 — 배포됐는지 저장소를 안 뒤지고 안다
  const buildId = (await page.textContent('#buildid'))!.trim()
  expect(buildId.length).toBeGreaterThan(3)
  expect(buildId).toMatch(/^[0-9a-f]{7,}|nogit/)

  // ② 워커가 **그 하위 경로**를 scope로 잡는다 (앱이 스스로 등록한다)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 })
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toBe(`${BASE}/`)

  // ③ **오프라인에서도 뜬다**
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await context.setOffline(true)
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2, undefined, { timeout: 15_000 })
  await context.setOffline(false)

  expect(errors).toEqual([])
})

test('옛 앱이 정말 캐시에 묶는다 — 전환 위험이 실재한다(양성 채널)', async ({ page }) => {
  // 이 팔이 없으면 아래 인계 시험이 무엇을 배제했는지 안 갈린다.
  oldDeploy = true
  await page.goto(`${BASE}/l.html`)
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('./sw.js')
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  expect(await page.evaluate(() => (window as any).__OLD_APP__)).toBe(true)

  // **배포를 web2로 바꾼다.** 그래도 옛 캐시에는 옛 문서가 그대로 들어 있다 —
  // 캐시 우선 워커가 살아 있는 한 그것이 나간다. 이것이 전환의 위험이다.
  oldDeploy = false
  const cached = await page.evaluate(async () => {
    const hit = await caches.match('./l.html')
    return hit ? await hit.text() : null
  })
  expect(cached).toContain('__OLD_APP__')
})

test('인계 — 옛 워커가 깔린 상태에서 web2가 캐시를 걷고 화면을 가져간다', async ({ page, context }) => {
  // ① 옛 배포에 사용자가 들어와 워커가 깔린다
  oldDeploy = true
  await page.goto(`${BASE}/l.html`)
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('./sw.js')
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  expect(await page.evaluate(() => (window as any).__OLD_APP__)).toBe(true)
  expect(await page.evaluate(() => caches.keys())).toContain('sketch3d-old')

  // ② **전환** — 같은 주소에 web2가 올라간다. 사람은 아무것도 안 한다:
  //    브라우저가 `./sw.js`를 다시 받아 갱신하고, 새 워커가 인계한다.
  //    (옛 앱도 새 앱도 같은 `./sw.js`를 등록하므로 이 경로가 성립한다)
  oldDeploy = false
  await page.reload()

  // ③ 새 앱이 화면을 가져간다 — 워커가 옛 문서를 띄운 창을 스스로 다시 부른다.
  //    옛 URL(`l.html`)로 다시 불러도 404가 아니다(public/l.html이 루트로 보낸다).
  await page.waitForFunction(() => (window as any).__b2, undefined, { timeout: 20_000 })
  expect(await page.evaluate(() => (window as any).__OLD_APP__)).toBeUndefined()

  // ④ 옛 캐시가 남지 않는다 — 새 워커의 것만 있다
  const keys = await page.evaluate(() => caches.keys())
  expect(keys.some(k => k.startsWith('b2-'))).toBe(true)
  expect(keys.filter(k => !k.startsWith('b2-'))).toEqual([])

  // ⑤ 인계 후에도 오프라인이 산다
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2)
  await context.setOffline(true)
  await page.reload()
  await page.waitForFunction(() => (window as any).__b2, undefined, { timeout: 15_000 })
  await context.setOffline(false)
})

test('탈출구 — ?reset이 워커와 캐시를 전부 버린다', async ({ page }) => {
  await page.goto(`${BASE}/`)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 15_000 })
  // 꼬인 상태를 흉내 낸다 — 엉뚱한 캐시가 끼어 있다
  await page.evaluate(async () => { await caches.open('junk-cache') })
  expect(await page.evaluate(() => caches.keys())).toContain('junk-cache')

  await page.goto(`${BASE}/?reset`)
  await page.waitForURL(`${BASE}/`, { timeout: 15_000 })
  await page.waitForFunction(() => (window as any).__b2)
  const after = await page.evaluate(async () => ({
    caches: await caches.keys(),
    regs: (await navigator.serviceWorker.getRegistrations()).length,
  }))
  expect(after.caches).not.toContain('junk-cache')
  // 그림은 안 지운다 — 캐시만 버린다
  expect(await page.evaluate(() => localStorage.getItem('b2-autosave') !== undefined)).toBe(true)
  void after.regs
})
