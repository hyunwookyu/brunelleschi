// web2-62 — 사진 산출물 옮기기: stage0/out/shots63/*.png → web2/shots/. (61의 도구와 같은 두 단계 — #104:
// 스펙은 e2e가 «도는 동안» 저장소 루트에 쓰고, 실행이 끝난 뒤 이 도구가 web2/shots/로 옮긴다.)
//
//   node tools/shots63-copy.mjs

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../../stage0/out/shots63')
const DST = resolve(HERE, '../shots')

mkdirSync(DST, { recursive: true })
const files = readdirSync(SRC).filter(f => f.endsWith('.png'))
if (files.length === 0) {
  console.error('stage0/out/shots63에 PNG가 없다 — 먼저 e2e/shots63.spec.ts를 돌려라(LEDGER=1)')
  process.exit(1)
}
for (const f of files) {
  copyFileSync(join(SRC, f), join(DST, f))
  console.log(`복사: ${f} → web2/shots/`)
}
