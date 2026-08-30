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
//
// ⚙️ **web2-25 1부가 여기에 `indoor` 한 블록을 더했다** — 근평면 잘라내기가 붙어서
//    실내 시점(좌우 벽·바닥의 꼭짓점이 카메라 뒤)에서 **면이 처음으로 계산에 들어온다**.
//    그만큼 일감이 늘므로 그 몫을 잰다: 같은 장면을 `nearClip` on/off 로 나란히 돌려
//    ㉠ 빠지는 면 수(off 에서 전부 빠진다) ㉡ 그때의 벽시계를 함께 남긴다.
//    바깥 시점 격자(위)는 **손대지 않았다** — 전/후 비교의 기준선이라 조건을 안 바꾼다(#71 ㉠).

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
import { C } from '../src/core/constants'
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
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null, scaleId: null, dimGeom: new Map() }
}

/** 장면 — 면 M개(카메라 앞 여러 깊이의 벽) + 그 사이를 지나는 획 N개.
 *  획은 **화면에서 면과 실제로 겹치게** 놓는다(안 겹치면 클리핑이 안 돌아 비용이 0에
 *  수렴한다 — 실패 불가능한 격자가 된다 #69 ㉣). 시드 고정(rng32 — Math.random ⛔). */
function scene(nStrokes: number, nFaces: number, seed = 20260828) {
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
  const r = rng32(seed)
  for (let i = 0; i < nStrokes; i++) {
    const z = -(3 + r() * 12)
    const y = 0.1 + r() * 3
    const x = -3 + r() * 6
    segs.push({ id: id++, a3: v3(x, y, z), b3: v3(x + (r() * 4 - 2), y + (r() * 1.4 - 0.7), z - r() * 3) })
  }
  const lift = synthLift(segs)
  return { lift, resolved: resolveFaces(lift, faces) }
}

/** 실내용 합성 lift — 꼭짓점이 카메라 뒤일 수 있으므로 **화면 좌표는 되는 것만** 넣는다.
 *  ⚠ 위 `synthLift`(바깥 시점 격자용)는 사영이 안 되는 선분을 `lifted`에서도 빼는데,
 *  실내에서는 그것이 곧 «면이 안 풀린다»가 된다. 바깥 격자는 전부 카메라 앞이라 두 함수가
 *  같은 결과를 내므로 **기준선의 조건은 안 바뀐다**(#71 ㉠). */
function indoorLift(segs: { id: number; a3: V3; b3: V3 }[]): LiftResult {
  const an = analyze(constructedDoc().doc)
  const lifted = new Map<number, LiftedSeg>()
  const strokes = new Map<number, Stroke>()
  for (const s of segs) {
    lifted.set(s.id, { a3: s.a3, b3: s.b3, axis: null })
    const a = project(an, DRAW_POSE, s.a3), b = project(an, DRAW_POSE, s.b3)
    if (a && b) strokes.set(s.id, { id: s.id, a, b })
  }
  return { an, lifted, waiting: [], waitWhy: new Map(), anchorId: null, strokes, mmPerUnit: null, scaleId: null, dimGeom: new Map() }
}

/** **실내** 장면(web2-25 1부) — 카메라가 방 안이라 면의 꼭짓점이 카메라 뒤로 넘어간다.
 *  면 M개는 서로 다른 x 의 «옆 벽»이고 z 는 +2(등 뒤) ~ −8 이다. 그래서 잘라내기가
 *  없으면 **전부** 빠지고(web2-23의 동작) 붙으면 전부 든다. */
function indoorScene(nStrokes: number, nFaces: number, seed = 20260828) {
  const segs: { id: number; a3: V3; b3: V3 }[] = []
  const faces: Face[] = []
  let id = 1
  for (let i = 0; i < nFaces; i++) {
    const x = -3 + (i % 8) * 0.8 + Math.floor(i / 8) * 0.09
    const ids = [id, id + 1, id + 2, id + 3]
    const P = [v3(x, 0.2, 2), v3(x, 0.2, -8), v3(x, 2.8, -8), v3(x, 2.8, 2)]
    for (let k = 0; k < 4; k++) segs.push({ id: id++, a3: P[k]!, b3: P[(k + 1) % 4]! })
    faces.push({ id: 2000 + i, loops: [{ edges: ids.map(s => ({ kind: 'stroke' as const, s })) }] })
  }
  const r = rng32(seed)
  for (let i = 0; i < nStrokes; i++) {
    const z = -(1 + r() * 10)
    const y = 0.1 + r() * 3
    const x = -4 + r() * 8
    segs.push({ id: id++, a3: v3(x, y, z), b3: v3(x + (r() * 4 - 2), y + (r() * 1.4 - 0.7), z - r() * 3) })
  }
  const lift = indoorLift(segs)
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

function measure(nStrokes: number, nFaces: number, seed = 20260828): Row {
  const { lift, resolved } = scene(nStrokes, nFaces, seed)
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
    // ⚠⚠ **격자 전체를 한 번 돌고 버린다**(web2-32 — GitHub 러너가 그 값을 냈다):
    //   400×40 세 번만 예열하면 **다른 크기의 장면**은 여전히 차갑다. CI에서 그 자국이
    //   그대로 나왔다 — 「50획×40면 9.91 · 100획 4.3 · 200획 6.57 · 400획 9.69」로
    //   **그 열의 첫 칸만 부풀고 나머지는 단조**였고, 아래 분해능 단언(400 > 50)이 그
    //   한 칸 때문에 빨개졌다(같은 자국으로 web2-28·web2-32의 Pages 실행이 죽었다).
    //   임계를 무르지 않고 **재는 순서**를 고친다 — 축의 주장은 그대로다.
    for (const n of NS) for (const m of MS) measure(n, m)
    const rows: Row[] = []
    for (const n of NS) for (const m of MS) rows.push(measure(n, m))
    const at = (n: number, m: number) => rows.find(r => r.strokes === n && r.faces === m)!
    const worst = rows.reduce((a, b) => (b.med_ms > a.med_ms ? b : a))

    // ── 배치 시드 둘째(#14 — 시드 변동폭) ─────────────────────────────────
    // 반복 11회는 **같은 배치**의 시간 잡음만 가른다. 「동인은 면 수」가 배치 하나의
    // 관측이면 그것은 결론이 아니라 일화다 — 세 모서리 칸을 다른 시드로 다시 잰다.
    const seedB = [
      measure(400, 40, 771103), measure(400, 5, 771103), measure(50, 40, 771103),
    ]
    const ratioOf = (rs: Row[]) => ({
      face: Number((rs[0]!.med_ms / rs[1]!.med_ms).toFixed(2)),
      stroke: Number((rs[0]!.med_ms / rs[2]!.med_ms).toFixed(2)),
    })
    // 고정 몫의 대역 — 가장 작은 칸이 그 하한이다(기계가 느릴수록 크다). 비가 왜
    // 기계마다 무너지는지를 이 값이 말한다(위 단언의 근거).
    const axis_gains = {
      face_5_to_40_at_400: Number((at(400, 40).med_ms - at(400, 5).med_ms).toFixed(2)),
      stroke_50_to_400_at_5: Number((at(400, 5).med_ms - at(50, 5).med_ms).toFixed(2)),
      smallest_cell_ms: at(50, 5).med_ms,
      note: '러너(GitHub Actions)에서는 smallest_cell_ms가 3~4ms 대역이라 **비**가 1.98까지 내려간다 — 그래서 판정은 차로 한다(web2-32 · PITFALLS #81).',
    }
    const seedA_ratios = { face: Number((at(400, 40).med_ms / at(400, 5).med_ms).toFixed(2)),
      stroke: Number((at(400, 40).med_ms / at(50, 40).med_ms).toFixed(2)) }
    const seedB_ratios = ratioOf(seedB)

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
    // 22 3부의 % — 자동 저장 가정(AS-C80) 대비. 지시 2-b ⑦의 「22 3부의 %와 함께」
    const pctOf = (n: number) => Number(((n / C.AUTOSAVE_LIMIT_BYTES) * 100).toFixed(3))
    // **저장 단위는 `segs`(이어 붙인 폴리라인 마디)이지 `pieces`(자른 조각)가 아니다** —
    // 같은 깃발끼리 이어지므로 저장에 들어가는 수가 훨씬 적다. 실사용 외삽은 이 수로 한다.
    const worstSegs = at(400, 40).segs
    const projected = {
      segs: worstSegs,
      bytes_utf8: Math.round(worstSegs * perSeg),
      pct_of_autosave_utf8: pctOf(worstSegs * perSeg),
      note: '최악 칸의 **segs**(pieces 아님 — 저장은 이어 붙인 뒤의 마디 수다)로 외삽한 '
        + '밑그림 하나의 크기. ⚠ pieces로 외삽하면 8배 넘게 부푼다(첫 판이 그 오류였고 '
        + '리뷰 [3]이 잡았다). ⚠ 바이트/마디는 **좌표 문자열의 길이**에 달렸다 — 아래 '
        + 'autosave_serialize_ms의 worst_doc_bytes_utf8은 짧은 좌표로 만든 합성 밑그림이라 '
        + '이 외삽보다 작다. 두 값을 다 남긴다(실사용은 그 사이).',
    }
    // ── ⚠ 「한 번 도는 비용」이 덮지 못하는 자리: **자동 저장은 획마다 돈다** ─────
    // 밑그림이 Doc에 들어간 뒤로 자동 저장의 직렬화가 매번 밑그림 전체를 다시 쓴다.
    // 굽기가 싸다는 것과 별개의 물음이라 따로 잰다(리뷰 [4]).
    const serMs = (n: number): number => {
      const ts: number[] = []
      for (let k = 0; k < 11; k++) {
        const t0 = performance.now()
        serializeBrnl({ doc: app.doc, nextId: app.nextId })
        ts.push(performance.now() - t0)
      }
      void n
      return Number(median(ts).toFixed(3))
    }
    const serWithUnderlay = serMs(1)
    const kept = app.doc.underlays
    app.doc.underlays = []
    const serWithout = serMs(0)
    app.doc.underlays = kept
    // 최악 칸 크기의 밑그림을 실제로 얹어 본다(외삽이 아니라 측정)
    app.doc.underlays = [{ layer: lay.id, segs: Array.from({ length: worstSegs }, (_, i) => ({
      a: { x: i * 0.37, y: i * 0.11 }, b: { x: i * 0.37 + 12.5, y: i * 0.11 + 7.25 }, hidden: i % 3 === 0,
    })) }]
    const serWorst = serMs(2)
    const worstBytes = Buffer.byteLength(serializeBrnl({ doc: app.doc, nextId: app.nextId }), 'utf8')
    // 마디당 바이트를 **큰 표본에서도** 낸다 — 셋짜리 델타에는 밑그림 열쇠·배열 괄호의
    // 고정 비용이 통째로 실려 있다(2차 리뷰 [5]). 두 값의 차가 곧 그 고정 비용 + 좌표
    // 문자열 길이의 몫이다.
    const perSegLarge = (worstBytes - bytes.before_utf8) / worstSegs
    app.doc.underlays = kept

    // ── web2-25 1부 — **실내 시점의 몫**(근평면 잘라내기가 붙어서 든 일감) ──────
    // 같은 장면을 nearClip on/off 로 나란히 돌린다. off 가 web2-23의 동작이다.
    interface IndoorRow {
      strokes: number; faces: number
      faces_used: number; dropped: number; pieces: number; med_ms: number
      faces_used_noclip: number; dropped_noclip: number; pieces_noclip: number; med_ms_noclip: number
    }
    const measureIndoor = (n: number, m: number): IndoorRow => {
      const { lift, resolved } = indoorScene(n, m)
      const run = (nearClip: boolean) => {
        const ts: number[] = []
        let last = bakeUnderlay(lift, resolved, DRAW_POSE, { nearClip })
        for (let k = 0; k < REPEATS; k++) {
          const t0 = performance.now()
          last = bakeUnderlay(lift, resolved, DRAW_POSE, { nearClip })
          ts.push(performance.now() - t0)
        }
        return { last, med: Number(median(ts).toFixed(2)) }
      }
      const on = run(true), off = run(false)
      return {
        strokes: n, faces: m,
        faces_used: on.last.faces, dropped: on.last.dropped, pieces: on.last.pieces, med_ms: on.med,
        faces_used_noclip: off.last.faces, dropped_noclip: off.last.dropped,
        pieces_noclip: off.last.pieces, med_ms_noclip: off.med,
      }
    }
    for (let k = 0; k < 2; k++) measureIndoor(400, 40)        // 예열
    const indoorRows: IndoorRow[] = [
      measureIndoor(50, 5), measureIndoor(50, 40),
      measureIndoor(400, 5), measureIndoor(400, 40),
    ]
    const indoorWorst = indoorRows.reduce((a, b) => (b.med_ms > a.med_ms ? b : a))

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
        budget_ms: C.BAKE_BUDGET_MS,
        threshold: `초안 상한 ${C.BAKE_BUDGET_MS}ms(상수 C.BAKE_BUDGET_MS — 지시 1-b). `
          + '넘으면 진행 표시를 띄운다. 프레임 예산과 안 견준다. ⚠ 산문이 아니라 위 '
          + 'budget_ms가 정본이다 — 상수를 바꾸면 이 수도 따라간다(2차 리뷰 [13]).',
        estimate_vs_measured: 'D-4 — 지시 1-b의 「수십 ms로 예상된다」는 **짐작**이었다. 실측은 '
          + '격자의 최악 칸(획 400×면 40 = 대상 선분 560·조각 5024)에서 한 자릿수 ms다 — '
          + '상한의 1% 대역. 진행 표시는 **안 만들었다**(발화 조건이 없다 — 범위를 넓히지 않는다). '
          + '되돌릴 조건: 실기기에서 굽는 동안 멈춤이 관측되거나 이 원장의 최악 칸이 500ms에 '
          + '가까워지면 그때 만든다(DEFERRED web2-23).',
      },
      grid: { strokes: NS, faces: MS },
      rows,
      worst: { strokes: worst.strokes, faces: worst.faces, med_ms: worst.med_ms, max_ms: worst.max_ms },
      axis_gains,
      over_budget: rows.filter(r => r.med_ms > C.BAKE_BUDGET_MS).map(r => `${r.strokes}획×${r.faces}면 ${r.med_ms}ms`),
      resolution: {
        note: '#71 ㉢ — 두 축이 실제로 값을 가르는가. 하네스가 둘 다 단언한다: '
          + '① 획 축(면 40 고정): 400획 med > 50획 med ② 면 축(획 400 고정): 40면 med > 5면 med×2. '
          + '⚠ 두 축의 무게가 다르다 — **동인은 면 수**다(배수는 아래 열들이 값으로 낸다). '
          + '⚠⚠ **차수 예측이 실측에 진다**(D-4의 형태 — 리뷰 [2-b]): 「조각마다 면 전부를 '
          + '훑으니 O(N·M²)」이면 M 8배에 64배를 예상해야 하는데 실측은 face_axis_ratio 대역이고 '
          + '**pieces와 거의 같은 배수**다(pieces_face_axis_ratio와 나란히 읽는다). 조기 반환'
          + '(첫 가림에서 true)과 포함 판정의 빠른 기각이 M 항을 접는다 — **비용은 조각 수에 '
          + '거의 선형**으로 읽는 것이 이 원장이 실제로 지지하는 문장이다. 그래서 500ms 도달 '
          + '대역의 외삽도 pieces로 한다(면 수 자체가 아니라).',
        face_axis_ratio: Number((at(400, 40).med_ms / at(400, 5).med_ms).toFixed(2)),
        stroke_axis_ratio: Number((at(400, 40).med_ms / at(50, 40).med_ms).toFixed(2)),
        pieces_face_axis_ratio: Number((at(400, 40).pieces / at(400, 5).pieces).toFixed(2)),
        stroke_axis: { low_med: at(50, 40).med_ms, high_med: at(400, 40).med_ms },
        face_axis: { low_med: at(400, 5).med_ms, high_med: at(400, 40).med_ms },
        max_overlap: at(50, 40).max_ms > at(400, 40).med_ms,
        max_overlap_note: '참이면 그 두 행의 **최대값 대역이 겹친다** — 한 번의 굽기로는 '
          + '획 축을 못 가른다는 뜻이고, 그래서 판정은 중앙값으로 한다(잡음의 실측 기록)',
        seed_check: {
          seedA: seedA_ratios, seedB: seedB_ratios,
          note: '#14 — 배치 시드 둘째(771103)로 세 모서리 칸을 다시 잰다. 「동인은 면 수」가 '
            + '배치 하나의 일화가 아님을 보인다(하네스가 두 시드 모두에서 face > stroke를 단언). '
            + '⚠ 유효 자릿수는 두 자리로 읽는다(시드·GC 변동폭 — CLAUDE.md §5).',
          rows_seedB: seedB,
        },
      },
      bytes_2b: {
        ...bytes,
        bytes_per_seg_utf8: Number(perSeg.toFixed(1)),
        pct_of_autosave_utf8: pctOf(bytes.after_utf8),
        pct_of_autosave_utf16: pctOf(bytes.after_utf16),
        note: '⑦ — 옐로 한 장을 얹기 전/후의 .brnl. 늘어난 몫이 곧 밑그림이다(마디마다 점 둘 + 깃발). '
          + 'utf8은 앱의 자동 저장 게이지(Blob)와 같은 셈이고 utf16은 localStorage 관례 상한의 셈이다(#28). '
          + '⚠⚠ **저장 단위는 `segs`이지 `pieces`가 아니다** — 같은 깃발끼리 이어 붙인 뒤의 마디 '
          + '수다. 실사용 외삽은 아래 projected_worst가 그 수로 한다(pieces로 외삽하면 8배 넘게 '
          + '부푼다 — 첫 판이 그 오류였고 리뷰 [3]이 잡았다).',
        projected_worst: projected,
        autosave_serialize_ms: {
          with_underlay_min_scene: serWithUnderlay,
          without_underlay: serWithout,
          with_worst_size_underlay: serWorst,
          worst_doc_bytes_utf8: worstBytes,
          worst_doc_pct_of_autosave: pctOf(worstBytes),
          bytes_per_seg_utf8_large_sample: Number(perSegLarge.toFixed(1)),
          bytes_per_seg_note: '2차 리뷰 [5] — 위 bytes_per_seg_utf8(148)은 **마디 셋**의 델타라 '
            + '밑그림 열쇠·배열 괄호의 고정 비용이 그 셋에 나뉘어 실려 있다. 이 값은 마디 '
            + String(worstSegs) + '개 표본의 마디당 바이트다(합성 좌표라 문자열이 짧다). '
            + '실사용은 두 값 사이이고, projected_worst는 **큰 쪽**(148)으로 잡은 보수적 외삽이다.',
          note: '리뷰 [4] — 굽기가 「한 번 도는 비용」인 것과 별개로 **자동 저장은 획마다 돈다**. '
            + '밑그림이 Doc에 들어간 뒤로 그 직렬화가 매번 밑그림 전체를 다시 쓴다. 최악 칸 '
            + '크기의 밑그림(segs ' + String(worstSegs) + ')을 실제로 얹고 serializeBrnl 11회 '
            + '중앙값을 잰 값이다(외삽 아님). 프레임 예산(16ms)과 견주는 것이 여기서는 옳다 — '
            + '이것은 그리는 동안 도는 비용이다. ⚠ 합성 밑그림의 좌표 문자열이 짧아 '
            + 'worst_doc_bytes_utf8은 projected_worst.bytes_utf8보다 작다(직렬화 시간은 '
            + '문자 수에 비례하므로 실사용은 이 값보다 크다 — 두 마디당 바이트의 비만큼, 곧 두 배 '
            + '대역까지).',
        },
      },
      indoor_near_clip: {
        note: 'web2-25 1부 — **근평면 잘라내기**가 붙은 뒤의 실내 시점 몫. 장면은 카메라를 '
          + '방 안에 둔 «옆 벽» M개(z = +2(등 뒤) ~ −8)라 꼭짓점이 카메라 뒤로 넘어간다. '
          + 'nearClip:false 가 web2-23의 동작이고 그때 면이 **전부 빠진다**(dropped_noclip = M · '
          + 'faces_used_noclip = 0) — 그것이 이 회차가 고친 결함이다. on 에서는 dropped 0. '
          + '⚠ 값을 나란히 두는 까닭: 잘라내기는 «면을 되살리는» 수리라 **비용이 는다**. '
          + '늘어난 몫이 상한(budget_ms) 대비 어디인지가 이 블록이 답하는 물음이다.',
        conditions: '위 grid 와 같은 조건(단독 실행·합성 lift·rng32 20260828·예열 뒤 11회 중앙값). '
          + '실내 예열은 (400,40) 두 번. ⚠⚠ **grid(rows)와 이 블록은 같은 실행의 값이다**'
          + '(#71 ㉠ — 한 하네스가 한 번 돌며 둘 다 쓴다: rows 를 「web2-23 때의 값」으로 읽으면 '
          + '안 된다. 재실행마다 함께 다시 난다). 그러므로 두 최악 칸(바깥·실내)의 ms 는 '
          + '**나란히 견줄 수 있다**.',
        rows: indoorRows,
        worst: {
          strokes: indoorWorst.strokes, faces: indoorWorst.faces,
          med_ms: indoorWorst.med_ms, med_ms_noclip: indoorWorst.med_ms_noclip,
          pieces: indoorWorst.pieces, pieces_noclip: indoorWorst.pieces_noclip,
        },
        over_budget: indoorRows.filter(r => r.med_ms > C.BAKE_BUDGET_MS)
          .map(r => `${r.strokes}획×${r.faces}면 ${r.med_ms}ms`),
      },
      flags_explained: {
        'constants/metric_defs 스냅샷 없음': 'web2 라인의 원장은 상수 스냅샷 등록부 밖(공통 형태)',
        'indoor_near_clip.rows[*].dropped = 0': '0 고정 카운터(#5)가 아니라 **이 회차의 판정자**다 — '
          + '잘라내기가 붙으면 빠지는 면이 없다. 그 0이 «집계가 안 돈다»가 아님은 같은 행의 '
          + 'dropped_noclip(= faces)이 보인다(양성 대조 — 한 실행에서 둘 다 낸다)',
        'indoor_near_clip.rows[*].faces_used_noclip = 0': '같은 짝의 반대쪽 — 잘라내기 없이는 '
          + '실내 시점의 면이 **하나도** 안 든다(web2-23의 동작). 그 0이 곧 결함의 크기다',
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
    // ⚠⚠ **면 축은 «비»가 아니라 «차»로 묻는다**(web2-32 — CI가 그 이유를 냈다):
    //   러너에는 한 번의 굽기마다 **고정 몫**이 3~4ms 있다. 이 컨테이너의 (400,5)는
    //   1.01ms인데 러너는 **4.92ms**였다 — 같은 셈에서 (400,40)은 6.29 ↔ 9.73이다.
    //   그러면 비는 6.2배 ↔ **1.98배**로 무너지고, 옛 단언(×2)은 그 고정 몫 때문에
    //   0.02 차이로 빨개진다. 고정 몫은 **차를 빼면 사라진다** — 그래서 같은 주장
    //   (「동인은 면 수다」)을 차로 다시 쓴다: **면을 5→40으로 늘리는 값이 획을
    //   50→400으로 늘리는 값보다 크다.** 이 컨테이너 5.28 > 0.86 · 러너 4.81 > 1.4 대역.
    //   ⛔ 임계를 낮추는 것이 아니다 — 같은 축을 **고정 몫에 안 물리는 형태로** 묻는다.
    const faceGain = at(400, 40).med_ms - at(400, 5).med_ms
    const strokeGain = at(400, 5).med_ms - at(50, 5).med_ms
    expect(faceGain).toBeGreaterThan(strokeGain)
    expect(at(400, 40).med_ms).toBeGreaterThan(0.05)                // 시계 분해능 위
    // ⑦ — 밑그림이 실제로 파일을 늘렸다
    expect(bytes.after_utf8).toBeGreaterThan(bytes.before_utf8)
    // 저장 단위가 segs임을 값으로 못 박는다(리뷰 [3] — pieces와 갈린다)
    expect(bytes.underlay_segs).toBe(u.segs.length)
    expect(at(400, 40).segs).toBeLessThan(at(400, 40).pieces)
    // 시드 둘 다에서 «면 축이 획 축보다 무겁다»(#14 — 배치 하나의 일화가 아니다)
    expect(seedA_ratios.face).toBeGreaterThan(seedA_ratios.stroke)
    expect(seedB_ratios.face).toBeGreaterThan(seedB_ratios.stroke)
    // 상한은 상수에서 읽는다(D-C4 — 원장 밖 임계는 낡음이 안 잡힌다)
    expect(C.BAKE_BUDGET_MS).toBe(500)
    // ── web2-25 1부 — 실내 블록이 실제로 그 국면을 덮는가(#69 ㉣ · #71 ㉢) ────────
    for (const r of indoorRows) {
      expect(r.dropped_noclip).toBe(r.faces)      // 잘라내기 없이는 **전부** 빠진다
      expect(r.faces_used_noclip).toBe(0)
      expect(r.dropped).toBe(0)                   // 붙으면 하나도 안 빠진다
      expect(r.faces_used).toBe(r.faces)
      expect(r.pieces).toBeGreaterThan(r.pieces_noclip)   // 일감이 실제로 늘었다
      expect(r.med_ms).toBeGreaterThan(0)
    }
    // 실내 최악 칸도 상한 안이다 — 이 회차가 비용을 상한 밖으로 밀지 않았다
    expect(indoorWorst.med_ms).toBeLessThan(C.BAKE_BUDGET_MS)
  })
})
