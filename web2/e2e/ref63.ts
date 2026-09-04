// web2-63 — ref63(62 기준 해시)의 공유 몫: 행 정의 · 해시 함수 · 원장 경로. 스펙 둘(ref63.spec · paint63.spec)이 같은
// 정의를 읽는다(#103 — 자를 두 번 대면 같은 행). ⚠ 스펙 파일이 스펙 파일을 import하면 playwright가 전량 실행에서 거부한다
// (밤 1차 실측 — 「test file should not import test file」) → 공유 몫은 이 비-스펙 모듈에 둔다.
import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 기준 원장(dpr1 하나 — 견본 판은 고정 px · dpr 무관(paint62 note_dpr)) */
export const REF63_LEDGER = resolve(HERE, '../../stage0/out/ref63_web2_dpr1.json')

/** 팁을 «안» 받는 프리셋(63의 기본 팁 표 밖 — 잉크·마커·에어브러시·둥근 붓) + 팁을 받는 슬롯 둘(연필·색연필 — 63이 팁 없음으로 되돌려 대조) */
export const REF63_ROWS: { key: string; tool: string; preset?: string; shape: 'line' | 'wave'; w: number }[] = [
  { key: 'liner_line', tool: 'brush', preset: 'deevad/liner', shape: 'line', w: 20 },
  { key: 'liner_wave', tool: 'brush', preset: 'deevad/liner', shape: 'wave', w: 20 },
  { key: 'opaque_marker_line', tool: 'marker', preset: 'ramon/100%_Opaque', shape: 'line', w: 20 },
  { key: 'pen_wave', tool: 'brush', preset: 'classic/pen', shape: 'wave', w: 20 },
  { key: 'airbrush_wave', tool: 'brush', preset: 'deevad/airbrush', shape: 'wave', w: 30 },
  { key: 'round1_wave', tool: 'brush', preset: 'Dieterle/Round#1', shape: 'wave', w: 24 },
  { key: 'pencil_slot_wave', tool: 'pencil', shape: 'wave', w: 20 },
  { key: 'cp_slot_wave', tool: 'cp', shape: 'wave', w: 20 },
]

export async function hashRows(page: Page, rows: typeof REF63_ROWS, ext: Record<string, unknown> = {}) {
  return page.evaluate(([rs, ex]) => {
    const b2 = (window as any).__b2
    const out: Record<string, { hash: number; ink: number }> = {}
    for (const r of rs as typeof REF63_ROWS) {
      b2.diag.markSampleForTest(r.tool, r.shape, r.w, 61, 480, 240, r.preset ? { preset: r.preset, ...(ex as object) } : { ...(ex as object) })
      const v = ((window as any).__m61 as { v: number[] }).v
      let h = 0x811c9dc5, ink = 0
      for (let i = 0; i < v.length; i++) { const q = Math.round(v[i]!); h = Math.imul(h ^ q, 0x01000193) >>> 0; if (q > 8) ink++ }
      out[r.key] = { hash: h, ink }
    }
    return out
  }, [rows, ext] as const)
}

