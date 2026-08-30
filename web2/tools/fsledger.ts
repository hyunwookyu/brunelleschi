// 원장 쓰기 관문 · **vitest 배선**(RUN.md §1) — 규약과 근거는 `ledgercore.ts` 머리 하나다.
//
// `vite.config.ts`의 `test.alias`가 `node:fs`를 이 파일로 돌린다. 하네스는 종전처럼
// `import { writeFileSync } from 'node:fs'`를 쓰고, 그 이름이 여기서 관문을 통과한다.
//
// ⚠ `export * from 'fs'`의 **접두사 없는** 이름을 쓰는 것이 핵심이다 — 별칭은
// `node:fs`에만 걸리므로 이 줄은 자기 자신으로 안 돈다(순환 없음).
// ⚠ 별칭이 안 걸린 자리(`createRequire('node:fs')` 등)는 `ledgerguard.ts`의 패치가 받는다.

export * from 'fs'

import * as real from 'fs'
import { ledgerOn, isLedgerPath, noteBlocked, WRITE_FLAG } from './ledgercore'
import { Writable } from 'stream'

const sink = () => new Writable({ write(_c, _e, cb) { cb() } }) as unknown as real.WriteStream

type AnyFn = (...a: unknown[]) => unknown

/** 대상이 원장이고 관문이 닫혀 있으면 «성공한 척»한다. 아니면 진짜를 부른다. */
function guard<F extends AnyFn>(name: string, idx: number, fn: F, faked: () => unknown): F {
  return function (this: unknown, ...args: unknown[]): unknown {
    if (!ledgerOn() && isLedgerPath(args[idx])) {
      noteBlocked(name, args[idx])
      const cb = args[args.length - 1]
      if (typeof cb === 'function') { (cb as (e: null) => void)(null); return undefined }
      return faked()
    }
    return (fn as AnyFn).apply(this, args)
  } as unknown as F
}

const none = () => undefined

// 쓰기(대상은 0번 인자)
export const writeFileSync = guard('writeFileSync', 0, real.writeFileSync, none)
export const appendFileSync = guard('appendFileSync', 0, real.appendFileSync, none)
export const truncateSync = guard('truncateSync', 0, real.truncateSync, none)
export const unlinkSync = guard('unlinkSync', 0, real.unlinkSync, none)
export const rmSync = guard('rmSync', 0, real.rmSync, none)
export const writeFile = guard('writeFile', 0, real.writeFile, none)
export const appendFile = guard('appendFile', 0, real.appendFile, none)
export const unlink = guard('unlink', 0, real.unlink, none)
export const rm = guard('rm', 0, real.rm, none)
export const createWriteStream = guard('createWriteStream', 0, real.createWriteStream, sink)
// 이름 바꾸기·복사(도착지는 1번 인자)
export const renameSync = guard('renameSync', 1, real.renameSync, none)
export const copyFileSync = guard('copyFileSync', 1, real.copyFileSync, none)
export const rename = guard('rename', 1, real.rename, none)
export const copyFile = guard('copyFile', 1, real.copyFile, none)

/** `openSync`는 **읽기로 여는 것을 막지 않는다** — 원장을 읽는 팔이 있다. */
export const openSync: typeof real.openSync = function (p: unknown, ...rest: unknown[]): number {
  if (!ledgerOn() && isLedgerPath(p) && WRITE_FLAG.test(String(rest[0] ?? 'r'))) {
    noteBlocked('openSync', p); return -1
  }
  return (real.openSync as AnyFn).call(real, p, ...rest) as number
} as typeof real.openSync

/** `node:fs/promises`는 별칭이 따로 걸린다(`fsledgerp.ts`) — 여기 것은 `fs.promises` 접근용이다. */
export const promises: typeof real.promises = {
  ...real.promises,
  writeFile: guard('promises.writeFile', 0, real.promises.writeFile as AnyFn,
    () => Promise.resolve(undefined)) as typeof real.promises.writeFile,
  appendFile: guard('promises.appendFile', 0, real.promises.appendFile as AnyFn,
    () => Promise.resolve(undefined)) as typeof real.promises.appendFile,
  unlink: guard('promises.unlink', 0, real.promises.unlink as AnyFn,
    () => Promise.resolve(undefined)) as typeof real.promises.unlink,
  rm: guard('promises.rm', 0, real.promises.rm as AnyFn,
    () => Promise.resolve(undefined)) as typeof real.promises.rm,
}

/** 기본 가져오기(`import fs from 'node:fs'`)도 같은 관문을 지난다. */
export default {
  ...real,
  writeFileSync, appendFileSync, truncateSync, unlinkSync, rmSync,
  writeFile, appendFile, unlink, rm, createWriteStream,
  renameSync, copyFileSync, rename, copyFile, openSync, promises,
}
