// web2-11 1-c — 점별 입력의 **저장 비용**을 실측해 원장에 남긴다(stage0/out).
//
// 「같은 그림」의 수리 전/후: 같은 raw 점들을 가진 문서를 ① rawIn 없이(수리 전 형식)
// ② rawIn 실어서(수리 후, 펜 획) 직렬화해 바이트를 잰다. coalesced로 raw 자체가 몇 배가
// 되는지는 기기 의존이라(120Hz 화면 · 펜 표본율) 헤드리스에서 못 정한다 — 점당 바이트를
// 함께 남겨 실기기 계수(진단 패널의 coalesced 줄)와 곱해 읽게 한다.
//
// 반증(D-3): 이 측정이 재는 것은 «rawIn이 크기를 늘린다»이므로, rawIn을 뺀 직렬화와
// 넣은 직렬화가 **같으면** 측정이 죽은 것이다 — 마지막 단언이 그것을 실제로 가른다.

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { constructedDoc } from './fixtures'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import type { RawInput } from '../src/core/types'

/** 실사용 크기의 합성 그림 — 획 40 × 점 96(120Hz에서 0.8초 획) */
function drawing(withIn: boolean) {
  const b = constructedDoc()
  const rnd = rng32(20260826)
  for (let k = 0; k < 40; k++) {
    const ax = 100 + rnd() * 900, ay = 150 + rnd() * 500
    const bx = 100 + rnd() * 900, by = 150 + rnd() * 500
    b.add(ax, ay, bx, by)
    const s = b.doc.strokes[b.doc.strokes.length - 1]!
    const n = 96
    s.raw = Array.from({ length: n }, (_, i) => ({
      x: ax + (bx - ax) * i / (n - 1) + (rnd() - 0.5) * 2,
      y: ay + (by - ay) * i / (n - 1) + (rnd() - 0.5) * 2,
    }))
    if (withIn) {
      const ri: RawInput = {
        press: Array.from({ length: n }, () => Math.round(rnd() * C.PRESS_Q)),
        tiltX: Array.from({ length: n }, () => Math.round(30 + rnd() * 10)),
        tiltY: Array.from({ length: n }, () => Math.round(-15 + rnd() * 6)),
      }
      s.rawIn = ri
    }
  }
  return { doc: b.doc, nextId: 999, savedViews: [] }
}

describe('점별 입력 저장 비용(1-c 원장)', () => {
  it('수리 전/후 바이트를 재고 원장에 남긴다', () => {
    const before = serializeBrnl(drawing(false))
    const after = serializeBrnl(drawing(true))
    // 양자화 왕복 — 정수 그대로 돌아온다(무손실 저장). 필압 «값»의 양자화 오차 상한은
    // 1/(2·PRESS_Q) — 저장 전 반올림에서만 난다(여기서 재는 것은 직렬화 왕복).
    const back = parseBrnl(after)!
    expect(back).not.toBeNull()
    expect(back.doc.strokes[back.doc.strokes.length - 1]!.rawIn)
      .toEqual(drawing(true).doc.strokes[back.doc.strokes.length - 1]!.rawIn)

    const bytesBefore = new TextEncoder().encode(before).length
    const bytesAfter = new TextEncoder().encode(after).length
    const points = 40 * 96
    const perPoint = (bytesAfter - bytesBefore) / points
    console.log(`[측정] .brnl 40획×96점 — 수리 전 ${bytesBefore} B → 후 ${bytesAfter} B (rawIn 점당 +${perPoint.toFixed(2)} B)`)

    // 「판정·렌더는 raw를 안 읽는다」의 수(2차 리뷰어 [7] — 산문 grep을 원장 칸으로).
    // file.ts(직렬화)·types.ts(정의)를 뺀 src/core 전체에서 raw/rawIn 참조를 센다.
    const coreDir = resolve(__dirname, '../src/core')
    let coreRawRefs = 0
    for (const f of readdirSync(coreDir)) {
      if (f === 'file.ts' || f === 'types.ts' || !f.endsWith('.ts')) continue
      coreRawRefs += (readFileSync(resolve(coreDir, f), 'utf8').match(/\.raw\b|rawIn/g) ?? []).length
    }
    expect(coreRawRefs).toBe(0)

    // 옛 파서 스냅샷의 정규화 해시 — 스냅샷 파일이 수정되면 이 값이 원장에서 갈린다.
    // b6980c9 원본과의 동일성은 2026-08-26에 `git show b6980c9:web2/src/core/file.ts`
    // 정규화 비교(주석 제거·공백 접기)로 1회 확인했다(web2-11 1차 [11]).
    const snap = readFileSync(resolve(__dirname, 'legacy_web2_10.ts'), 'utf8')
    const body = snap.slice(snap.indexOf('export function parseBrnlLegacy'))
      .replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim()
    const snapshotHash = createHash('sha256').update(body).digest('hex').slice(0, 12)

    // localStorage 관용 «5MB» — 셈 축이 둘이라(십진/이진 × 바이트/UTF-16 코드 단위) 네 값
    // 전부 적는다(#28 · 2차 [6]). .brnl은 ASCII라 문자 수 == 바이트 수.
    const perStroke = bytesAfter / 40
    const quota = {
      per_stroke_bytes: Number(perStroke.toFixed(0)),
      decimal_5e6_bytes: Math.round(5e6 / perStroke),
      decimal_5e6_utf16: Math.round(5e6 / 2 / perStroke),
      binary_5mib_bytes: Math.round(5 * 1024 * 1024 / perStroke),
      binary_5mib_utf16: Math.round(5 * 1024 * 1024 / 2 / perStroke),
    }

    const out = resolve(__dirname, '../../stage0/out/stroke_payload_web2.json')
    mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-11 1-c — 점별 입력(rawIn)의 저장 비용. 같은 그림(획 40×점 96, 시드 고정)을 rawIn 없이/실어서 직렬화한 바이트.',
      fixture: { strokes: 40, points_per_stroke: 96, seed: 20260826, note: 'press+tiltX+tiltY 세 배열(twist 없음 — 관측된 축만 싣는 규칙과 같음)' },
      bytes_before: bytesBefore,
      bytes_after: bytesAfter,
      rawin_bytes_per_point: Number(perPoint.toFixed(2)),
      quantization: {
        press: `round(pressure×${C.PRESS_Q}) — 오차 ≤ ${(1 / (2 * C.PRESS_Q)).toExponential(2)} (Pro Pen 3 선언 8192단계와 같은 분해능)`,
        tilt: '정수 도(-90..90) — Pointer Events 명세가 long이라 무손실',
        twist: '정수 도(0..359)',
      },
      press_q: C.PRESS_Q,
      press_q_note: 'C.PRESS_Q를 바꾸면 이 원장을 재실행하고 AS-C33·DEFERRED web2-11 표의 인용을 고친다(상수 스냅샷 등록부 밖이라 STALE이 자동으로 안 잡힌다 — web2 구조적).',
      core_raw_refs: coreRawRefs,
      core_raw_refs_note: 'src/core(file.ts·types.ts 제외)의 .raw/rawIn 참조 수 — 0이면 획 판정·리프팅이 coalesced 점을 안 읽는다(설계 보장의 수. 팔이 0을 강제한다).',
      legacy_snapshot_sha256_12: snapshotHash,
      legacy_snapshot_note: 'test/legacy_web2_10.ts parseBrnlLegacy 본문의 정규화 해시(주석 제거·공백 접기) — 스냅샷이 수정되면 재실행에서 이 값이 갈린다. b6980c9 원본과의 동일성은 2026-08-26 git show 정규화 비교 1회로 확인.',
      strokes_per_quota: quota,
      strokes_per_quota_note: 'localStorage 관용 «5MB»의 셈 축 둘(십진 5e6/이진 5MiB × 바이트/UTF-16 코드 단위)을 다 적었다(#28 — 어느 셈인지 실측 없음). ⚠ 전부 **이 밀도(획당 96점·press+tiltX+tiltY·twist 없음)의 값**이지 일반 상한이 아니다 — 획이 짧으면 획 수가 늘고, coalesced·twist가 raw·rawIn을 늘리면 준다(2차 [10]). .brnl은 ASCII라 문자 수 == 바이트 수.',
      falsification: 'rawIn을 빼면 bytes_after == bytes_before가 되어 아래 단언이 실패한다(이 파일의 마지막 expect)',
    }, null, 1))

    // D-3 — 측정이 실제로 무언가를 갈랐는가
    expect(bytesAfter).toBeGreaterThan(bytesBefore)
  })
})
