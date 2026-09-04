// web2-61 — 사진 산출물 옮기기: stage0/out/shots61/*.png → web2/shots/.
//
// 왜 두 단계인가(#104): shots61.spec은 e2e가 «도는 동안» PNG를 쓴다 — web2/ 아래에 쓰면
// vite 개발 서버가 전체 새로고침을 보내 시험 페이지가 죽는다. 그래서 스펙은 저장소 루트
// (stage0/out — vite 감시 밖 · 원장 관문 #90 안)에 쓰고, 실행이 끝난 뒤 이 도구가
// web2/shots/로 옮긴다(마감 절차의 한 줄 — 비상주).
//
//   node tools/shots61-copy.mjs

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../../stage0/out/shots61')
const DST = resolve(HERE, '../shots')

mkdirSync(DST, { recursive: true })
const files = readdirSync(SRC).filter(f => f.endsWith('.png'))
if (files.length === 0) {
  console.error('stage0/out/shots61에 PNG가 없다 — 먼저 e2e/shots61.spec.ts를 돌려라(LEDGER=1)')
  process.exit(1)
}
for (const f of files) {
  copyFileSync(join(SRC, f), join(DST, f))
  console.log(`복사: ${f} → web2/shots/`)
}
