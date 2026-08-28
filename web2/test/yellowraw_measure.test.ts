// **web2-24 4부 원장** — 옐로 raw 정본화의 값들(지시 4-e ⑧⑨ + 반증 ㉯).
//
//   ⑧ RDP 솎기 전/후 점 수와 최대 이탈(임계 C.RAW_SIMPLIFY_PX = 0.5px 화면)
//   ㉯ 반증(D-3 — 「실제로 돌린다」): 임계를 5px로 키우면 이탈이 눈에 보이는가 —
//      같은 손 획을 5px로 솎아 원본 대비 최대 이탈을 나란히 낸다.
//   ⑨ 옐로 100획 문서의 .brnl 바이트와 자동 저장 가정(AS-C80 5MB) 대비 % —
//      web2-22 3부의 70% 경고가 실제로 걸리는 대역인지.
//
// 원장: stage0/out/yellowraw_web2.json — 결정론(rng32 고정 시드·시간 없음).
//   정본 명령: npx vitest run test/yellowraw_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, commitStroke, addLayer, type App } from '../src/app/state'
import { serializeBrnl } from '../src/core/file'
import { rdpIndices, distToPolyline } from '../src/core/freehand'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import { pt, type Pt } from '../src/core/vec'

const W = 1200, H = 800
const outDir = resolve(__dirname, '../../stage0/out')

function yellowApp(): App {
  const app = createApp(W, H)
  commitStroke(app, pt(500, 500), pt(600, 475))
  commitStroke(app, pt(500, 500), pt(400, 475))
  const lay = addLayer(app, 'yellow', { W, H })
  expect(lay).not.toBeNull()
  return app
}

/** 손 획 하나 — 굽은 기본 궤적(원호) 위에 손 떨림(±0.6px 대역)을 얹은 n점.
 *  coalesced 수집(120Hz × 묶음)의 실측 대역이 획당 수백 점이라 n 기본 240. */
function handStroke(seed: number, a: Pt, b: Pt, sag: number, n = 240): Pt[] {
  const r = rng32(seed)
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push({
      x: a.x + (b.x - a.x) * t + (r() * 2 - 1) * 0.6,
      y: a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * sag + (r() * 2 - 1) * 0.6,
    })
  }
  return pts
}

const maxDevFrom = (orig: Pt[], simp: Pt[]): number => {
  let d = 0
  for (const p of orig) d = Math.max(d, distToPolyline(p, simp))
  return d
}

describe('web2-24 4부 — 솎기·바이트 원장', () => {
  it('⑧ 전/후 점 수·이탈 + ㉯ 5px 반증 + ⑨ 100획 바이트', () => {
    // ── ⑧·㉯: 손 획 12종(시드×형태) — 0.5px(정본)과 5px(반증 변이)을 나란히 ──
    type Row = {
      seed: number; n_in: number
      n_kept_05: number; dev_05: number
      n_kept_5: number; dev_5: number
    }
    const rows: Row[] = []
    for (let k = 0; k < 12; k++) {
      const raw = handStroke(k * 17 + 3, pt(200 + k * 10, 300), pt(700 + k * 10, 320 + k * 5), 20 + (k % 4) * 15)
      const k05 = rdpIndices(raw, C.RAW_SIMPLIFY_PX)
      const k5 = rdpIndices(raw, 5)
      rows.push({
        seed: k * 17 + 3, n_in: raw.length,
        n_kept_05: k05.length, dev_05: Math.round(maxDevFrom(raw, k05.map(i => raw[i]!)) * 1000) / 1000,
        n_kept_5: k5.length, dev_5: Math.round(maxDevFrom(raw, k5.map(i => raw[i]!)) * 1000) / 1000,
      })
    }
    const agg = {
      n_in: rows.map(r => r.n_in)[0],
      kept_05: { min: Math.min(...rows.map(r => r.n_kept_05)), max: Math.max(...rows.map(r => r.n_kept_05)) },
      dev_05_max: Math.max(...rows.map(r => r.dev_05)),
      kept_5: { min: Math.min(...rows.map(r => r.n_kept_5)), max: Math.max(...rows.map(r => r.n_kept_5)) },
      dev_5_max: Math.max(...rows.map(r => r.dev_5)),
      dev_5_min: Math.min(...rows.map(r => r.dev_5)),
    }

    // ── ⑨: 옐로 100획 문서 — 앱 경로(commitStroke — 솎기 포함)로 만들고 직렬화 ──
    const app = yellowApp()
    let keptSum = 0
    for (let k = 0; k < 100; k++) {
      const raw = handStroke(k + 1000, pt(100 + (k % 10) * 100, 150 + Math.floor(k / 10) * 60),
        pt(180 + (k % 10) * 100, 170 + Math.floor(k / 10) * 60), 12 + (k % 5) * 8, 240)
      const s = commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw)
      keptSum += s.raw!.length
    }
    const brnl = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    // 두 셈 관례를 **둘 다** 적는다(#28 — 3차 [6]: NOTES 4820의 선례 그대로. 앱의 자동 저장
    // 게이지(main.ts brnlBytes)는 Blob(UTF-8 바이트)이고, localStorage의 실제 상한은 대개
    // UTF-16 코드 유닛이다 — JSON이 ASCII 지배라 여기서는 거의 같지만 관례를 명기한다).
    const bytesUtf8 = Buffer.byteLength(brnl, 'utf8')
    const bytesUtf16 = brnl.length * 2
    const bytes = bytesUtf8
    const pct = Math.round((bytesUtf8 / C.AUTOSAVE_LIMIT_BYTES) * 1000) / 10
    const pctUtf16 = Math.round((bytesUtf16 / C.AUTOSAVE_LIMIT_BYTES) * 1000) / 10
    // 대조: 같은 100획이 직선(트레이싱지 규약 — raw 없이 {a,b})이었다면의 바이트
    const appLine = yellowApp()
    for (let k = 0; k < 100; k++) {
      commitStroke(appLine, pt(100 + (k % 10) * 100, 150 + Math.floor(k / 10) * 60),
        pt(180 + (k % 10) * 100, 170 + Math.floor(k / 10) * 60), [pt(0, 0), pt(1, 1)])
    }
    const bytesLine = serializeBrnl({ doc: appLine.doc, nextId: appLine.nextId }).length

    const ledger = {
      run: {
        note: 'web2-24 4부 — 옐로 raw 정본화의 솎기·바이트 원장. 정본 명령: '
          + 'npx vitest run test/yellowraw_measure.test.ts',
        date: '2026-08-28',
        fixture: '손 획 = 원호(sag 12~65px) + 떨림 ±0.6px · 240점/획(coalesced 대역) · '
          + 'rng32 고정 시드 — 결정론(전량 실행이 다시 써도 같은 바이트)',
        conditions: {
          view_s: 1,
          px_frame: '이 원장의 px는 전부 문서 px이고 view.s=1이라 화면 px와 같다(#71 ㉠ — 3차 [3]). '
            + '앱의 솎기 임계는 **화면 px**에 걸린다(commitStroke가 RAW_SIMPLIFY_PX/view.s로 문서 '
            + '임계를 만든다) — 확대해 그리면 문서 임계가 그만큼 준다(«눈에 안 보이는»은 화면의 '
            + '성질이라 그것이 설계다). dpr 무관(기하 계산 — 픽셀 판독 아님).',
          doc100_fixture: '작도 2획(바탕) + 옐로 겹 1 + 옐로 손 획 100(길이 ~82px·sag 12~44px·240점). '
            + '직렬화는 serializeBrnl(앱 저장과 같은 함수). ⚠ 획당 솎기 후 점 수(~101)가 simplify '
            + '표(~96)보다 높은 것은 픽스처 차다 — doc100의 획이 짧아(82px vs 400px) 곡률 밀도가 '
            + '높고 RDP가 더 많이 남긴다.',
        },
        constants: { RAW_SIMPLIFY_PX: C.RAW_SIMPLIFY_PX, AUTOSAVE_LIMIT_BYTES: C.AUTOSAVE_LIMIT_BYTES },
      },
      simplify: {
        rows,
        aggregate: agg,
        refute_5px: '반증 ㉯(지시 4-e — 실제 실행): 임계 5px에서 남는 점이 '
          + `${agg.kept_5.min}~${agg.kept_5.max}개로 줄고 원본 대비 최대 이탈이 `
          + `${agg.dev_5_min}~${agg.dev_5_max}px — 1px(눈 대역)를 훌쩍 넘어 그림이 바뀐다. `
          + '0.5px 임계의 이탈은 전부 0.5px 아래(솎기 임계의 정의 그대로 — RDP 보장이지만 '
          + '«임계가 실제로 이탈을 가른다»는 두 변이의 차가 보인다)',
      },
      doc100: {
        strokes: 100,
        raw_pts_total_after_simplify: keptSum,
        brnl_bytes_utf8: bytes,
        brnl_code_units_x2_utf16: bytesUtf16,
        pct_of_autosave_assumption_utf8: pct,
        pct_of_autosave_assumption_utf16: pctUtf16,
        straight_control_bytes: bytesLine,
        note: '⑨ — 옐로 100획(프리핸드) 문서의 .brnl 크기와 AS-C80(5MB) 대비 %(두 관례 — utf8은 '
          + '앱 게이지(Blob)와 같은 셈·utf16은 localStorage 관례 상한: 경고 대역이 관례로 2배 갈린다 '
          + '#28). straight_control은 같은 수의 직선 획 문서(솎은 뒤 2점 → raw 안 실림) — 점렬 몫의 '
          + '크기를 가른다. 70% 경고 발동 대역인지가 물음이다(수백 획 실사용은 실기기 표)',
      },
      flags_explained: {
        'constants/metric_defs 스냅샷 없음': 'web2 라인 원장은 상수 스냅샷 등록부 밖(공통 형태)',
        'dev_05가 임계(0.5) 근처로 몰림': 'RDP의 정의다 — 임계 바로 아래까지 솎는 것이 최적 동작. '
          + '보장이지 측정이 아니므로 임계를 안 건다(자기참조 유형 3) — 값의 쓸모는 5px 변이와의 대비다',
      },
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'yellowraw_web2.json'), JSON.stringify(ledger, null, 2))
    console.log(`[측정] yellowraw — 240점 → 0.5px ${agg.kept_05.min}~${agg.kept_05.max}점(이탈≤${agg.dev_05_max})`
      + ` · 5px ${agg.kept_5.min}~${agg.kept_5.max}점(이탈 ${agg.dev_5_min}~${agg.dev_5_max})`
      + ` · 100획 utf8 ${bytes}B=${pct}% · utf16 ${bytesUtf16}=${pctUtf16}% (직선 대조 ${bytesLine}B)`)

    // 판정선(#26 — 등록: 하네스 유효성·반증)
    // 0.5px 솎기의 표현 오차는 임계 아래(정의 확인 — 깨지면 rdp가 틀린 것)
    expect(agg.dev_05_max).toBeLessThanOrEqual(C.RAW_SIMPLIFY_PX)
    // 반증 ㉯ — 5px이면 이탈이 눈 대역(1px)을 넘는다: 임계가 실제로 그림을 가른다
    expect(agg.dev_5_min).toBeGreaterThan(1)
    // 솎기가 실제로 줄인다(240 → 수십)
    expect(agg.kept_05.max).toBeLessThan(240)
    // 100획 문서가 실제로 raw를 실었다(직선 대조보다 크다)
    expect(bytes).toBeGreaterThan(bytesLine)
  })
})
