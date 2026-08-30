// 원장 쓰기 관문 · vitest 배선의 `node:fs/promises` 쪽 — 근거는 `ledgercore.ts` 머리 하나다.
// ⚠ `export * from 'fs/promises'`의 **접두사 없는** 이름이라 자기 자신으로 안 돈다.

export * from 'fs/promises'

import * as real from 'fs/promises'
import { ledgerOn, isLedgerPath, noteBlocked } from './ledgercore'

type AnyFn = (...a: unknown[]) => unknown

function guard<F extends AnyFn>(name: string, idx: number, fn: F): F {
  return function (this: unknown, ...args: unknown[]): unknown {
    if (!ledgerOn() && isLedgerPath(args[idx])) {
      noteBlocked(`promises.${name}`, args[idx])
      return Promise.resolve(undefined)
    }
    return (fn as AnyFn).apply(this, args)
  } as unknown as F
}

export const writeFile = guard('writeFile', 0, real.writeFile as AnyFn) as typeof real.writeFile
export const appendFile = guard('appendFile', 0, real.appendFile as AnyFn) as typeof real.appendFile
export const unlink = guard('unlink', 0, real.unlink as AnyFn) as typeof real.unlink
export const rm = guard('rm', 0, real.rm as AnyFn) as typeof real.rm
export const truncate = guard('truncate', 0, real.truncate as AnyFn) as typeof real.truncate
export const rename = guard('rename', 1, real.rename as AnyFn) as typeof real.rename
export const copyFile = guard('copyFile', 1, real.copyFile as AnyFn) as typeof real.copyFile

export default { ...real, writeFile, appendFile, unlink, rm, truncate, rename, copyFile }
