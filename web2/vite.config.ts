// web2 빌드 — base는 상대 경로(하위 경로 배포 대응, web/과 같은 이유)
//
// 빌드 식별자: 커밋 해시 + 빌드 시각. 화면에 표시된다 — 없으면 배포됐는지
// 확인하려고 저장소를 뒤져야 한다.
// 서비스 워커: 문서는 network-first, 캐시 이름에 빌드 식별자가 들어가
// 빌드마다 바뀐다 — 새 빌드가 한 번에 나간다.
import { defineConfig } from 'vitest/config'
import { execSync } from 'node:child_process'

function buildId(): string {
  let hash = 'nogit'
  try { hash = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* 없으면 nogit */ }
  const t = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return `${hash} ${t}`
}

function swSource(id: string): string {
  return `// 자동 생성 — 빌드마다 캐시 이름이 바뀐다
const CACHE = 'b2-${id.replace(/[^a-zA-Z0-9]/g, '_')}'
const PREFIX = 'b2-'
self.addEventListener('install', () => self.skipWaiting())
// **인계**(2026-08-21 web/ → web2 전환) — 같은 주소에 **다른 앱**이 온다.
// 옛 워커(web/)는 문서까지 캐시 우선이라, 지우지 않으면 열린 창이 옛 앱에 묶인다.
// 여기서 ① 내 것이 아닌 캐시를 **전부** 지우고 ② 옛 앱 캐시가 있었으면
// 그 창을 한 번 다시 부른다(그 창은 아직 옛 문서를 그리고 있다).
// ②는 옛 캐시가 있을 때만 돌고 그 캐시는 방금 지웠으므로 **되풀이되지 않는다**.
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys()
  const stale = keys.filter(k => k !== CACHE)
  await Promise.all(stale.map(k => caches.delete(k)))
  await self.clients.claim()
  if (!stale.some(k => k.indexOf(PREFIX) !== 0)) return
  const ws = await self.clients.matchAll({ type: 'window' })
  // ⚠ navigate를 **기다리면 안 된다** — 그 이동을 처리할 워커가 지금 활성화 중인
  // 자신이므로 waitUntil이 안 풀리고 서로 막힌다(교착. 전환 e2e가 이걸로 멎었다).
  for (const c of ws) { try { c.navigate(c.url).catch(function () {}) } catch (_) {} }
})()))
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  if (req.mode === 'navigate') {
    // 문서는 network-first — 새 빌드가 한 번에 나가야 한다
    e.respondWith(
      fetch(req).then(r => {
        const c = r.clone()
        caches.open(CACHE).then(x => x.put(req, c))
        return r
      }).catch(() => caches.match(req).then(hit => hit || Response.error()))
    )
    return
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      const c = r.clone()
      caches.open(CACHE).then(x => x.put(req, c))
      return r
    }))
  )
})
`
}

const id = buildId()

export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(id),
  },
  plugins: [{
    name: 'b2-sw',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(id) })
    },
  }],
  test: {
    include: ['test/**/*.test.ts'], // e2e는 playwright가 돈다
  },
})
