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
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
))
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
