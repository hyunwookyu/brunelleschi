// 원장 쓰기 관문 · **playwright 배선**(RUN.md §1) — 규약과 근거는 `ledgercore.ts` 머리 하나다.
//
// 스펙 파일은 babel로 CJS가 되어 `fs.writeFileSync`를 **속성 접근**으로 부르므로,
// `node:fs`의 CJS exports 객체를 갈아 끼우면 이미 import된 스펙에도 걸린다.
// ⚠ vitest에서는 이 길이 **안 듣는다**(실측) — 그쪽은 `test.alias`가 답이다(`fsledger.ts`).

import { createRequire } from 'node:module'
import { ledgerOn, isLedgerPath, noteBlocked, ARG0_FNS, ARG1_FNS, WRITE_FLAG } from './ledgercore'

let installed = false

/** 관문을 건다 — 여러 번 불러도 한 번만 건다(설정 파일이 두 번 로드될 수 있다). */
export function installLedgerGuard(): void {
  if (installed) return
  installed = true
  const req = createRequire(import.meta.url)
  const fs = req('node:fs') as Record<string, unknown>
  const fsp = req('node:fs/promises') as Record<string, unknown>
  const { Writable } = req('node:stream') as { Writable: new (o: unknown) => unknown }
  const sink = () => new Writable({ write(_c: unknown, _e: unknown, cb: () => void) { cb() } })

  const wrap = (mod: Record<string, unknown>, name: string, idx: number, isPromise: boolean) => {
    const orig = mod[name]
    if (typeof orig !== 'function') return
    const fn = orig as (...a: unknown[]) => unknown
    mod[name] = function (this: unknown, ...args: unknown[]): unknown {
      if (!ledgerOn() && isLedgerPath(args[idx])) {
        const isOpen = name === 'openSync' || name === 'open'
        if (!isOpen || WRITE_FLAG.test(String(args[1] ?? 'r'))) {
          noteBlocked(name, args[idx])
          // 「성공한 척」한다 — 팔은 그대로 돈다.
          if (isPromise) return Promise.resolve(undefined)
          if (name === 'createWriteStream') return sink()
          if (name === 'openSync') return -1
          const cb = args[args.length - 1]
          if (typeof cb === 'function') { (cb as (e: null) => void)(null); return undefined }
          return undefined
        }
      }
      return fn.apply(this, args)
    }
  }

  for (const n of ARG0_FNS) { wrap(fs, n, 0, false); if (n in fsp) wrap(fsp, n, 0, true) }
  for (const n of ARG1_FNS) { wrap(fs, n, 1, false); if (n in fsp) wrap(fsp, n, 1, true) }
  const nested = (fs as { promises?: Record<string, unknown> }).promises
  if (nested && nested !== fsp) {
    for (const n of ARG0_FNS) if (n in nested) wrap(nested, n, 0, true)
    for (const n of ARG1_FNS) if (n in nested) wrap(nested, n, 1, true)
  }
}

installLedgerGuard()
