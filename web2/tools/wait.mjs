// web2-75 §0 ㉠ — **상한을 자기가 든 대기**. 맨손 `while … sleep` · 맨손 `wait` 금지의 «도구» 쪽 답이다.
//
// 73 §0 ㉡이 PITFALLS에 「대기는 동시에 하나 · 20분 상한」을 박았는데 74에서 또 났다(「Wait for ledger rerun」
// 둘이 각각 10시간 8분 · 9시간 58분). 문서로는 안 막힌다 — 대기 명령이 상한을 **스스로** 들어야 한다.
//
//   node tools/wait.mjs --cap <초> --file <경로> --grep <정규식> [--every <초>]   파일에 그 글이 뜰 때까지
//   node tools/wait.mjs --cap <초> --pid <n>                                     그 프로세스가 끝날 때까지
//   node tools/wait.mjs --cap <초> -- <명령 …>                                    명령을 돌리되 상한에 걸리면 죽인다
//
// 규칙(값으로 강제한다):
//   · `--cap`이 없으면 안 돈다. 1..1200초(20분 — CLOSING 「대기는 동시에 하나 · 상한 20분」).
//   · 상한에 걸리면 **종료 코드 124**(coreutils `timeout`과 같다) + 파일 모드면 마지막 스무 줄을 찍는다 — «기다리지
//     말고 로그를 직접 읽어라»의 그 자리.
//   · 대기 하나마다 `stage0/out/waits_web2.jsonl`에 한 줄을 남긴다({t, mode, what, cap_s, elapsed_s, exit}) —
//     마감의 「이 라운드의 대기 전부에 상한이 붙어 있다」가 이 파일을 값으로 든다(selfcheck `scan_round_waits`).
//     ⚠ 측정 원장이 아니라 **대기의 기록**이다 — LEDGER 관문(측정 원장 덮어쓰기 방지 #90)의 대상이 아니다.
//   ⚠ 이 파일에는 `sleep` 고리가 있다 — 하지만 상한이 있다(selfcheck `scan_unbounded_wait`의 ② 조건: 「timeout」·「상한」이 든 파일은 통과).

import { spawn } from 'node:child_process'
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOG = resolve(HERE, '../../stage0/out/waits_web2.jsonl')
const CAP_MAX_S = 1200

const argv = process.argv.slice(2)
const dash = argv.indexOf('--')
const opts = {}
const head = dash >= 0 ? argv.slice(0, dash) : argv
for (let i = 0; i < head.length; i++) {
  const a = head[i]
  if (!a.startsWith('--')) { console.error(`모르는 인자: ${a}`); process.exit(2) }
  opts[a.slice(2)] = head[i + 1]; i++
}
const cmd = dash >= 0 ? argv.slice(dash + 1) : null

const cap = Number(opts.cap)
if (!Number.isFinite(cap) || cap < 1 || cap > CAP_MAX_S) {
  console.error(`--cap <초>는 1..${CAP_MAX_S}이어야 한다(20분 상한 — CLOSING) — 받은 값: ${opts.cap ?? '(없음)'}`)
  process.exit(2)
}
const every = Math.max(1, Number(opts.every ?? 5))
const t0 = Date.now()
const elapsed = () => Math.round((Date.now() - t0) / 100) / 10

function log(mode, what, exit) {
  try {
    mkdirSync(dirname(LOG), { recursive: true })
    appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), mode, what, cap_s: cap, elapsed_s: elapsed(), exit }) + '\n')
  } catch { /* 기록을 못 남겨도 대기는 대기다 */ }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function tail20(path) {
  try { return readFileSync(path, 'utf8').split(/\r?\n/).slice(-20).join('\n') } catch { return '(파일 없음)' }
}

async function waitFile(path, re) {
  const rx = new RegExp(re)
  while (elapsed() < cap) {                                   // ← 상한(cap)이 이 고리의 조건이다
    if (existsSync(path) && rx.test(readFileSync(path, 'utf8'))) {
      console.log(`wait: ${path} ~ /${re}/ · ${elapsed()}s`)
      log('file', `${path} ~ /${re}/`, 0); return 0
    }
    await sleep(every * 1000)
  }
  console.error(`wait: 상한 ${cap}s에 걸렸다 — ${path} ~ /${re}/ 미출현. 마지막 스무 줄:\n${tail20(path)}`)
  log('file', `${path} ~ /${re}/`, 124); return 124
}

function alive(pid) { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
async function waitPid(pid) {
  while (elapsed() < cap) {
    if (!alive(pid)) { console.log(`wait: pid ${pid} 끝남 · ${elapsed()}s`); log('pid', String(pid), 0); return 0 }
    await sleep(every * 1000)
  }
  console.error(`wait: 상한 ${cap}s에 걸렸다 — pid ${pid}가 아직 산다`)
  log('pid', String(pid), 124); return 124
}

function runCapped(parts) {
  return new Promise((res) => {
    const child = spawn(parts.join(' '), { stdio: 'inherit', shell: true })
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      console.error(`wait: 상한 ${cap}s에 걸렸다 — 명령을 죽인다: ${parts.join(' ')}`)
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
      else child.kill('SIGKILL')
      done = true
      log('cmd', parts.join(' '), 124)
      res(124)
    }, cap * 1000)
    child.on('exit', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      console.log(`wait: 명령 끝 exit ${code} · ${elapsed()}s`)
      log('cmd', parts.join(' '), code ?? 1)
      res(code ?? 1)
    })
  })
}

let code = 2
if (cmd && cmd.length > 0) code = await runCapped(cmd)
else if (opts.file && opts.grep) code = await waitFile(opts.file, opts.grep)
else if (opts.pid) code = await waitPid(Number(opts.pid))
else { console.error('무엇을 기다릴지 없다 — --file/--grep · --pid · -- <명령> 중 하나'); code = 2 }
process.exit(code)
