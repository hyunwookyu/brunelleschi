// 원장 쓰기 관문 · **e2e 스펙의 fs**(web2-40 · PITFALLS #94) — 규약과 근거는
// `ledgercore.ts` 머리 하나다. 여기 있는 것은 **세 번째 배선**이고, 앞의 둘과 다른 점은
// **원숭이 패치에 안 기댄다**는 것이다.
//
// ⚠⚠ **왜 필요한가**(2026-08-31 실측 · web2-40): `ledgerguard.ts`의 playwright 배선은
// 「스펙이 babel로 CJS가 되어 `fs.writeFileSync`를 **속성 접근**으로 부른다」를 전제로
// CJS exports를 갈아 끼운다. 그 전제가 **지금 playwright(1.62)에서 거짓이다** —
// 스펙이 ESM으로 돌고 `import { writeFileSync } from 'node:fs'`는 **이미 만들어진 ESM
// 파사드의 스냅샷**을 본다. 탐침이 그것을 값으로 냈다:
//
//     LEDGER=1 없이 grain40.spec 실행 → 원장 mtime 1788172101 → **1788172242**
//     스펙 안에서: `named === cjs?` **false** · `ledgerBlocked.length` **0**
//
// 즉 **관문이 통째로 새고 있었다.** 앞 회차가 못 본 까닭도 값으로 설명된다: 판정을
// `git status stage0/out`(= 파일 **내용**)으로 했는데 하네스가 결정론이라 **같은 내용이
// 다시 쓰였다** — PITFALLS #91이 한 회차 전에 이름 붙인 바로 그 함정(「안 바뀌었는가」와
// 「안 썼는가」는 다른 물음이다)에 그 회차 자신이 걸렸다.
//
// 그래서 이 배선은 **부르는 자리에서 판정한다**. import 방식·번들러·런타임과 무관하다.
// 스펙은 `node:fs` 대신 이것을 가져온다 — 바꾸는 것은 **import 줄 하나**뿐이다.

import { createRequire } from 'node:module'
import { ledgerOn, isLedgerPath, noteBlocked } from './ledgercore'

const req = createRequire(import.meta.url)
const fs = req('node:fs') as typeof import('node:fs')

/** 막힌 쓰기는 **조용히 성공한 척한다** — 그 팔들은 원장 «쓰기»가 아니라 «측정»이
 *  본체이므로 빨개지면 안 된다(`ledgercore` 머리주석의 기본 거동 그대로). */
export const writeFileSync: typeof fs.writeFileSync = ((p, data, opts) => {
  if (!ledgerOn() && isLedgerPath(p)) { noteBlocked('writeFileSync', p); return }
  return fs.writeFileSync(p, data, opts)
}) as typeof fs.writeFileSync

export const mkdirSync: typeof fs.mkdirSync = ((p, opts) => {
  if (!ledgerOn() && isLedgerPath(p)) { noteBlocked('mkdirSync', p); return undefined }
  return fs.mkdirSync(p, opts)
}) as typeof fs.mkdirSync

// 읽기는 그대로 통과한다 — 관문이 막는 것은 **쓰기**다(원장을 읽어 합치는 하네스가 있다).
export const readFileSync: typeof fs.readFileSync = fs.readFileSync
export const existsSync: typeof fs.existsSync = fs.existsSync
export const readdirSync: typeof fs.readdirSync = fs.readdirSync
export const statSync: typeof fs.statSync = fs.statSync
