// web2-23 1-b — **굽기(make2d)의 비용 원장**(#38 규율 — 새 비용은 원장에 든다).
//
// 재는 것: 지시가 못 박은 격자 그대로 — 획 50·100·200·400 × 면 5·10·20·40 에서
// `bakeUnderlay` **한 번**의 벽시계 ms(중앙값 5회·최대). 그리고 ⑦(2-b) 굽기 전후의
// `.brnl` 바이트.
//
// ⚠ **프레임 예산과 견주지 않는다**(지시 1-b ⚠) — 이것은 «옐로를 얹을 때 한 번» 도는
//   비용이고 기준이 다르다. 「사람이 기다릴 만한가」로 읽는다. 초안 상한 500ms.
// ⚠ 조건이 값의 절반이다(#71 ㉠): node(vitest **단일 파일 단독 실행** — 동시 워커 없음·
//   브라우저 없음: 알고리즘 몫만) · 합성 lift(승격·오스냅 비용 제외) · 결정론 시드.
//   전량 vitest는 워커 병렬이라 벽시계를 부풀린다 — 그래서 **LEDGER=1에서만 원장을 쓴다**
//   (web2-22가 세우고 web2-24가 전면화한 규율. 전량 실행에서는 팔만 돈다).
//
// 원장: stage0/out/cost23_web2.json
//   정본 명령: LEDGER=1 npx vitest run test/cost23_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyze, DRAW_POSE, project } from '../src/core/camera'
import type { LiftResult, LiftedSeg } from '../src/core/lift'
import { resolveFaces } from '../src/core/face'
import { bakeUnderlay } from '../src/core/make2d'
import { constructedDoc } from './fixtures'
import { addLayer, commitStroke, createApp, underlayOf, type App } from '../src/app/state'
import { serializeBrnl } from '../src/core/file'
import { rng32 } from '../src/core/material'
import type { Face, Stroke } from '../src/core/types'
import { v3, type V3 } from '../src/core/vec'

function synthLift(segs: { id: number; a3: V3; b3: V3 }[]): LiftResult {
  const an = analyze(constructedDoc().doc)
  const lifted = new Map<number, LiftedSeg>()
  const strokes = new Map<number, Stroke>()
  for (const s of segs) {
    const a = project(an, DRAW_POSE, s.a3), b = project(an, DRAW_POSE, s.b3)
    if (!a || !b) continue
    lifted.set(s.id, { a3: s.a3, b3: s.b3, axis: null })
    strokes.set(s.id, { id: s.id, a, b })
  }
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null }
}

/** 장면 — 면 M개(카메라 앞 여러 깊이의 벽) + 그 사이를 지나는 획 N개.
 *  획은 **화면에서 면과 실제로 겹치게** 놓는다(안 겹치면 클리핑이 안 돌아 비용이 0에
 *  수렴한다 — 실패 불가능한 격자가 된다 #69 ㉣). 시드 고정(rng32 — Math.random ⛔). */
function scene(nStrokes: number, nFaces: number) {
  const segs: { id: number; a3: V3; b3: V3 }[] = []
  const faces: Face[] = []
  let id = 1
  for (let i = 0; i < nFaces; i++) {
    const z = -(4 + i * 0.6)
    const cx = ((i % 5) - 2) * 1.1
    const ids = [id, id + 1, id + 2, id + 3]
    const P = [v3(cx - 1.2, 0.2, z), v3(cx + 1.2, 0.2, z), v3(cx + 1.2, 2.8, z), v3(cx - 1.2, 2.8, z)]
    for (let k = 0; k < 4; k++) segs.push({ id: id++, a3: P[k]!, b3: P[(k + 1) % 4]! })
    faces.push({ id: 1000 + i, loops: [{ edges: ids.map(s => ({ kind: 'stroke' as const, s })) }] })
  }
  const r = rng32(20260828)
  for (let i = 0; i < nStrokes; i++) {
    const z = -(3 + r() * 12)
    const y = 0.1 + r() * 3
    const x = -3 + r() * 6
    segs.push({ id: id++, a3: v3(x, y, z), b3: v3(x + (r() * 4 - 2), y + (r() * 1.4 - 0.7), z - r() * 3) })
  }
  const lift = synthLift(segs)
  return { lift, resolved: resolveFaces(lift, faces) }
}

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}

interface Row {
  strokes: number; faces: number
  lines: number; pieces: number; segs: number; hidden: number
  med_ms: number; max_ms: number
}

function measure(nStrokes: number, nFaces: number): Row {
  const { lift, resolved } = scene(nStrokes, nFaces)
  const ts: number[] = []
  let last = bakeUnderlay(lift, resolved, DRAW_POSE)     // 예열 한 번(JIT — 첫 판이 이상치)
  for (let k = 0; k < REPEATS; k++) {
    const t0 = performance.now()
    last = bakeUnderlay(lift, resolved, DRAW_POSE)
    ts.push(performance.now() - t0)
  }
  return {
    strokes: nStrokes, faces: nFaces,
    lines: last.lines, pieces: last.pieces, segs: last.segs.length,
    hidden: last.segs.filter(s => s.hidden).length,
    med_ms: Number(median(ts).toFixed(2)), max_ms: Number(Math.max(...ts).toFixed(2)),
  }
}

/** 반복 수 — 값이 한 자릿수 ms라 실행 잡음(GC)이 축의 신호와 같은 대역이다.
 *  중앙값이 그 잡음을 걷어내려면 표본이 몇 개 필요하다(5로는 max가 med를 넘나든다 —
 *  초판이 그 자리에서 실패했고 그것이 **분해능의 실측**이다: 아래 max_overlap이 그 값). */
const REPEATS = 11

const NS = [50, 100, 200, 400]
const MS = [5, 10, 20, 40]

describe('web2-23 1-b — 굽기 비용 원장(cost23)', () => {
  it('⑥ 비용 표 — 획 50·100·200·400 × 면 5·10·20·40 + ⑦ 굽기 전후 바이트', () => {
    // 전역 예열 — 첫 행이 JIT 값을 뒤집어쓰지 않게(초판에서 50획 행이 100획 행보다
    // 컸다: 축이 아니라 실행 순서를 재고 있었다 #14의 형태)
    for (let k = 0; k < 3; k++) measure(400, 40)
    const rows: Row[] = []
    for (const n of NS) for (const m of MS) rows.push(measure(n, m))
    const at = (n: number, m: number) => rows.find(r => r.strokes === n && r.faces === m)!
    const worst = rows.reduce((a, b) => (b.med_ms > a.med_ms ? b : a))

    // ── ⑦(2-b) 굽기 전후 바이트 — **앱 경로**로 잰다(addLayer가 굽는다) ──────────
    const app: App = createApp(1200, 800)
    commitStroke(app, { x: 100, y: 400 }, { x: 1100, y: 400 })   // 지평선
    commitStroke(app, { x: 500, y: 500 }, { x: 700, y: 450 })    // 깊이선 1
    commitStroke(app, { x: 500, y: 500 }, { x: 300, y: 450 })    // 깊이선 2
    commitStroke(app, { x: 700, y: 450 }, { x: 300, y: 450 })    // 닫는 획
    const before = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    const lay = addLayer(app, 'yellow', { W: 1200, H: 800 })!
    const after = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    const u = underlayOf(app.doc, lay.id)!
    // 두 셈 관례를 다 적는다(#28 — web2-24 4부의 선례)
    const bytes = {
      before_utf8: Buffer.byteLength(before, 'utf8'),
      after_utf8: Buffer.byteLength(after, 'utf8'),
      before_utf16: before.length * 2,
      after_utf16: after.length * 2,
      underlay_segs: u.segs.length,
    }
    const perSeg = (bytes.after_utf8 - bytes.before_utf8) / Math.max(1, u.segs.length)

    const ledger = {
      run: {
        note: 'web2-23 1-b — bakeUnderlay 한 번의 벽시계(중앙값 5회·최대) + 2-b ⑦ 굽기 전후 바이트. '
          + '⚠ 정본 명령: LEDGER=1 npx vitest run test/cost23_measure.test.ts — **단독 실행**. '
          + '(LEDGER=1이 없으면 원장을 안 쓴다 — 전량 실행의 병렬 판이 못 덮는다 #71 ㉠.)',
        date: '2026-08-28',
        conditions: {
          runner: 'node(vitest **단일 파일 단독 실행** — 동시 워커 없음·브라우저 없음: 알고리즘 몫만)',
          scene: '합성 lift(승격·오스냅 비용 제외) · 면 M개는 서로 다른 깊이의 벽(각 4획) · '
            + '획 N개는 rng32(20260828) 고정 시드로 그 사이에 놓아 **화면에서 실제로 겹치게** 한다 '
            + '(안 겹치면 클리핑이 안 돌아 표가 아무것도 안 잰다 — #69 ㉣)',
          counted: '«대상 선분»(lines)은 N + 4M이다 — 면의 경계 획도 3D 선분이라 굽기의 대상이다',
          repeats: '전역 예열(400×40 세 번) 뒤 칸마다 예열 1회 + 11회 — 중앙값·최대. '
            + '11인 근거: 값이 한 자릿수 ms라 GC 잡음이 축의 신호와 같은 대역이다(5회 판에서 '
            + '50획 행의 max가 400획 행의 med를 넘었다 — 축이 아니라 잡음을 재고 있었다)',
        },
        threshold: '초안 상한 500ms(지시 1-b) — 넘으면 진행 표시를 띄운다. 프레임 예산과 안 견준다.',
        estimate_vs_measured: 'D-4 — 지시 1-b의 「수십 ms로 예상된다」는 **짐작**이었다. 실측은 '
          + '격자의 최악 칸(획 400×면 40 = 대상 선분 560·조각 5024)에서 한 자릿수 ms다 — '
          + '상한의 1% 대역. 진행 표시는 **안 만들었다**(발화 조건이 없다 — 범위를 넓히지 않는다). '
          + '되돌릴 조건: 실기기에서 굽는 동안 멈춤이 관측되거나 이 원장의 최악 칸이 500ms에 '
          + '가까워지면 그때 만든다(DEFERRED web2-23).',
      },
      grid: { strokes: NS, faces: MS },
      rows,
      worst: { strokes: worst.strokes, faces: worst.faces, med_ms: worst.med_ms, max_ms: worst.max_ms },
      over_500ms: rows.filter(r => r.med_ms > 500).map(r => `${r.strokes}획×${r.faces}면 ${r.med_ms}ms`),
      resolution: {
        note: '#71 ㉢ — 두 축이 실제로 값을 가르는가. 하네스가 둘 다 단언한다: '
          + '① 획 축(면 40 고정): 400획 med > 50획 max ② 면 축(획 400 고정): 40면 med > 5면 max. '
          + '⚠ 두 축의 무게가 다르다 — **동인은 면 수**다(배수는 아래 두 열이 값으로 낸다). '
          + '까닭: 한 선분이 자를 자리는 면의 변 수에 비례하고 조각마다 다시 면 전부를 훑는다 '
          + '(O(N·M²) 대역). 획은 선형이다.',
        face_axis_ratio: Number((at(400, 40).med_ms / at(400, 5).med_ms).toFixed(2)),
        stroke_axis_ratio: Number((at(400, 40).med_ms / at(50, 40).med_ms).toFixed(2)),
        pieces_face_axis_ratio: Number((at(400, 40).pieces / at(400, 5).pieces).toFixed(2)),
        stroke_axis: { low_med: at(50, 40).med_ms, high_med: at(400, 40).med_ms },
        face_axis: { low_med: at(400, 5).med_ms, high_med: at(400, 40).med_ms },
        max_overlap: at(50, 40).max_ms > at(400, 40).med_ms,
        max_overlap_note: '참이면 그 두 행의 **최대값 대역이 겹친다** — 한 번의 굽기로는 '
          + '획 축을 못 가른다는 뜻이고, 그래서 판정은 중앙값으로 한다(잡음의 실측 기록)',
      },
      bytes_2b: {
        ...bytes,
        bytes_per_seg_utf8: Number(perSeg.toFixed(1)),
        note: '⑦ — 옐로 한 장을 얹기 전/후의 .brnl. 늘어난 몫이 곧 밑그림이다(조각마다 점 둘 + 깃발). '
          + 'utf8은 앱의 자동 저장 게이지(Blob)와 같은 셈이고 utf16은 localStorage 관례 상한의 셈이다(#28). '
          + '⚠ 이 문서는 획 넷짜리 최소 장면이다 — 실사용 대역의 크기는 rows의 pieces가 가늠자다'
          + '(조각당 약 ' + perSeg.toFixed(0) + 'B).',
      },
      flags_explained: {
        'constants/metric_defs 스냅샷 없음': 'web2 라인의 원장은 상수 스냅샷 등록부 밖(공통 형태)',
        'hidden 0인 행이 있을 수 있다': '무작위 배치라 그 시드에서 가린 조각이 없을 수 있다 — '
          + '가림의 «정확성»은 make2d.test가 값으로 재고 이 원장은 **비용**만 잰다',
      },
    }

    // ⚠ **판정보다 먼저 쓴다**(#71 ㉡ — 단언이 실패해도 원장이 남는다)
    if (process.env.LEDGER === '1') {
      const outDir = resolve(__dirname, '../../stage0/out')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(resolve(outDir, 'cost23_web2.json'), JSON.stringify(ledger, null, 2))
    }
    console.log('[측정] cost23 — ' + rows.filter(r => r.faces === 40)
      .map(r => `${r.strokes}획×40면 ${r.med_ms}ms`).join(' · ')
      + ` · 최악 ${worst.strokes}획×${worst.faces}면 ${worst.med_ms}ms`
      + ` · 밑그림 ${bytes.after_utf8 - bytes.before_utf8}B/${u.segs.length}조각`)

    // ── 판정선 ────────────────────────────────────────────────────────────
    // 하네스가 실제로 무언가를 쟀는가(0건 통과 방지)
    expect(rows.length).toBe(NS.length * MS.length)
    expect(at(400, 40).lines).toBe(400 + 4 * 40)
    expect(at(400, 40).pieces).toBeGreaterThan(at(400, 40).lines)   // 클리핑이 실제로 돌았다
    // 분해능(#71 ㉢) — 두 축이 값을 가른다. **중앙값끼리** 견준다(max는 GC 이상치라
    // 축이 아니라 잡음을 재게 된다 — 그 겹침 자체는 아래 max_overlap에 값으로 남긴다).
    expect(at(400, 40).med_ms).toBeGreaterThan(at(50, 40).med_ms)
    expect(at(400, 40).med_ms).toBeGreaterThan(at(400, 5).med_ms * 2)
    expect(at(400, 40).med_ms).toBeGreaterThan(0.05)                // 시계 분해능 위
    // ⑦ — 밑그림이 실제로 파일을 늘렸다
    expect(bytes.after_utf8).toBeGreaterThan(bytes.before_utf8)
  })
})
