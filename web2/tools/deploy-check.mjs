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

// ── ①' **권위 있는 값** — 그 커밋의 Pages 실행이 살아 있는가 ────────────────
// ⚠⚠ web2-32에서 **세 시간을 기다린 자리**다: 화면 식별자만 긁고 있었는데 그 커밋의
// 실행이 **npm test에서 죽어 deploy가 skipped**였다. 화면은 영원히 옛 해시를 낸다 —
// 기다림에 끝나는 조건이 없었다. 화면 긁기는 «퍼졌는가»를 말할 뿐 «나갈 수 있는가»를
// 못 말한다. 그것을 아는 곳은 **API**다(PITFALLS #81).
// 인증 없이 읽는다(공개 저장소 · 시간당 60회) — 못 읽으면 조용히 넘어간다(판정을 막지 않는다).
if (!failed) {
  try {
    const url = sh('git remote get-url origin')
    const m = url.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/)
    if (m) {
      const api = `https://api.github.com/repos/${m[1]}/${m[2]}/actions/runs?per_page=20`
      const json = JSON.parse(sh(`curl -sS --max-time 20 -H "Accept: application/vnd.github+json" "${api}"`))
      const runs = (json.workflow_runs ?? []).filter((r) => r.head_sha === want)
      say(`$ actions/runs?head_sha=${want.slice(0, 7)}`)
      if (runs.length === 0) {
        say(`⚠ 그 커밋의 실행이 목록에 없다 — 아직 큐에 안 들어갔거나(몇 초) 최근 20건 밖이다`)
      } else {
        const r = runs[0]
        say(`Pages 실행 ${r.status} / ${r.conclusion ?? '진행 중'} (attempt ${r.run_attempt}) ${r.html_url}`)
        if (r.status === 'completed' && r.conclusion !== 'success') {
          fail(`그 커밋의 Pages 실행이 **${r.conclusion}** — 기다려도 안 나간다. 실패 원인을 고치고 다시 푸시하거나 재실행한다`)
        }
      }
    }
  } catch (e) {
    say(`⚠ 실행 상태를 못 읽었다(무시하고 화면으로 간다): ${String(e.message).slice(0, 80)}`)
  }
}

// ── ② 화면 빌드 식별자 ─────────────────────────────────────────────────────
// 서비스 워커의 캐시 이름에 빌드 식별자가 박혀 있다(vite.config.ts). HTTP 캐시를 피해 읽는다.
if (!failed) {
  const url = new URL('sw.js', SITE).href + `?t=${want.slice(0, 8)}`
  try {
    // ⚠ 전역 `fetch`(undici)를 안 쓴다 — 윈도우에서 종료 시 libuv가
    // `!(handle->flags & UV_HANDLE_CLOSING)`로 뻗고 **종료 코드가 127로 덮인다.**
    // 판정자의 종료 코드가 못 믿을 값이 되면 검사를 둔 의미가 없다. curl로 읽는다.
    const text = sh(`curl -sS --max-time 20 -H "Cache-Control: no-cache" "${url}"`)
    const m = text.match(/const CACHE = 'b2-([0-9a-f]+)_/)
    say(`$ curl ${url}`)
    if (!m) fail('sw.js에서 빌드 식별자를 못 찾았다')
    else {
      say(`화면 빌드 식별자 ${m[1]}`)
      if (!want.startsWith(m[1])) {
        fail('화면 식별자 ≠ 배포 커밋 — 아직 안 퍼졌거나(몇 분) 캐시에 묶였다. ?reset이 둘을 가른다.\n'
          + '  ⚠ **3분을 넘기면 기다리지 말고 위 ①\'의 실행 상태를 본다** — 실행이 죽었으면 화면은 영원히 안 바뀐다(#81).')
      } else say('✓ 화면 빌드 식별자 == 배포 커밋')
    }
  } catch (e) {
    fail(`배포된 화면을 못 읽었다: ${e.message}`)
  }
}

say(failed ? '\n결과: 배포 안 됨 — 완료로 보고하지 않는다' : '\n결과: 배포됨')
process.exit(failed ? 1 : 0)
