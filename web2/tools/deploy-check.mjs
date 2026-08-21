#!/usr/bin/env node
// 배포 판정자 — 사람이 «확인했다»고 적는 대신 **명령이 판정한다** (지시 7-d · PITFALLS #58)
//
// 왜 있는가: 두 세션 연속으로 보고에 「원격 main = 내 커밋 · Pages success · 화면 식별자
// 일치」라고 적혔는데, 거기 적힌 커밋(2af3bd6 · 9d8f6f5)은 **로컬에도 원격에도 없었다**
// (GitHub API가 둘 다 422). 값이 어느 명령의 출력에서도 나올 수 없는 것이었다.
// 규약이 있어도 사람이 그 자리를 채워 넣으면 안 걸린다 — 그래서 **검사가 값을 만든다.**
//
//   node tools/deploy-check.mjs            로컬 HEAD 기준
//   node tools/deploy-check.mjs <sha>      특정 커밋 기준
//
// 판정 순서 (앞에서 틀리면 뒤는 안 본다):
//   ① 원격 main 해시 == 내 커밋 해시     ← **이것이 판정자다**
//   ② 배포된 화면의 빌드 식별자 == 그 해시  ← 그 뒤에 온다(전파 지연·캐시가 섞인다)
//
// ⚠ Pages run success는 판정자가 **아니다** — 작업 갈래에서 돌면 배포되는 것은 main의
// 상태다. 「success」가 「내 커밋이 나갔다」를 뜻하지 않는다(7-e).

import { execSync } from 'node:child_process'

const SITE = process.env.DEPLOY_URL ?? 'https://hyunwookyu.github.io/brunelleschi/'
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim()

const lines = []
const say = (s) => { lines.push(s); console.log(s) }
let failed = false
const fail = (s) => { failed = true; say(`✗ ${s}`) }

// ── ① 원격 main ────────────────────────────────────────────────────────────
const want = sh(`git rev-parse ${process.argv[2] ?? 'HEAD'}`)
const raw = sh('git ls-remote origin main')          // 출력을 그대로 보고에 붙인다
say('$ git ls-remote origin main')
say(raw)
const remote = raw.split(/\s+/)[0] ?? ''

say(`내 커밋   ${want}`)
say(`원격 main ${remote}`)

if (!/^[0-9a-f]{40}$/.test(remote)) fail('원격 main 해시를 못 읽었다')
else if (remote !== want) {
  fail('원격 main ≠ 내 커밋 — **아직 배포 안 됐다.** main에 병합하고 푸시한다.')
  try {
    const ahead = sh(`git rev-list --count ${remote}..${want}`)
    const behind = sh(`git rev-list --count ${want}..${remote}`)
    say(`  (내 쪽이 ${ahead} 앞 · ${behind} 뒤)`)
  } catch { say('  (원격 커밋이 로컬에 없다 — git fetch 먼저)') }
} else say('✓ 원격 main == 내 커밋')

// ── ② 화면 빌드 식별자 ─────────────────────────────────────────────────────
// 서비스 워커의 캐시 이름에 빌드 식별자가 박혀 있다(vite.config.ts). HTTP 캐시를 피해 읽는다.
if (!failed) {
  const url = new URL('sw.js', SITE).href + `?t=${want.slice(0, 8)}`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const text = await res.text()
    const m = text.match(/const CACHE = 'b2-([0-9a-f]+)_/)
    say(`$ curl ${url}`)
    if (!m) fail(`sw.js에서 빌드 식별자를 못 찾았다 (HTTP ${res.status})`)
    else {
      say(`화면 빌드 식별자 ${m[1]}`)
      if (!want.startsWith(m[1])) {
        fail(`화면 식별자 ≠ 배포 커밋 — 아직 안 퍼졌거나(몇 분) 캐시에 묶였다. ?reset이 둘을 가른다.`)
      } else say('✓ 화면 빌드 식별자 == 배포 커밋')
    }
  } catch (e) {
    fail(`배포된 화면을 못 읽었다: ${e.message}`)
  }
}

say(failed ? '\n결과: 배포 안 됨 — 완료로 보고하지 않는다' : '\n결과: 배포됨')
process.exit(failed ? 1 : 0)
