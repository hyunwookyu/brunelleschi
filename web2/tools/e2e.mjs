// web2-54 §1 — e2e 실행 모드 셋의 입구. 모드는 환경변수(E2E_MODE)로 설정에 들어가고,
// 이 파일이 그 변수를 놓는 유일한 자리다(크로스 플랫폼 — Windows 셸에 env 인라인이 없다).
//
//   node tools/e2e.mjs green  [추가 인자…]     병렬 4 · 계측 넷 제외 · dpr2는 목록만
//   node tools/e2e.mjs night  [추가 인자…]     전량 · dpr2 전부 · 계측 포함 · 병렬 4
//   node tools/e2e.mjs ledger e2e/x.spec.ts    LEDGER=1 · 워커 1 · **스펙 하나씩**(#99)
//
// ⚠ ledger 모드는 스펙 인자가 정확히 하나여야 돈다 — #99(워커 재시작이 원장 누산기를
// 끊는다 · 파일 단위가 정본)를 명령이 스스로 지키게 했다. 여럿을 주면 여기서 멈춘다.
// ⚠ 원장 정본 명령(`LEDGER=1 npx playwright test e2e/x.spec.ts --workers=1`)도 그대로
// 산다 — 이 래퍼는 그 규약의 표기일 뿐 규약을 바꾸지 않는다.

import { spawnSync } from 'node:child_process'

const [mode, ...rest] = process.argv.slice(2)
const env = { ...process.env }
const args = ['playwright', 'test']

if (mode === 'green' || mode === 'night') {
  env.E2E_MODE = mode
  args.push(...rest)
} else if (mode === 'ledger') {
  const specs = rest.filter(a => /\.spec\.ts$/.test(a))
  if (specs.length !== 1) {
    console.error(`원장 실행은 스펙 하나씩이다(#99) — 받은 스펙 ${specs.length}개: ${specs.join(' ') || '(없음)'}`)
    console.error('예: node tools/e2e.mjs ledger e2e/cost18.spec.ts [--project=dpr1]')
    process.exit(2)
  }
  env.LEDGER = '1'
  args.push('--workers=1', ...rest)
} else {
  console.error(`모르는 모드: ${mode ?? '(없음)'} — green | night | ledger`)
  process.exit(2)
}

const r = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
process.exit(r.status ?? 1)
