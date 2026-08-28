// **web2-25 5부 원장** — 파일 크기: 어디가 큰지 **먼저 재고** 표가 지목한 것만 고친다.
//
// 왜: web2-24가 잰 것은 「옐로 100획 = 488KB」 하나였다. 산술로 약 380획에서 경고(70%),
// 약 540획에서 저장 실패다 — 자유 스케치에서 500획은 적은 수다(나무 한 그루가 50획,
// 인물 몇이 또 50획). **한 장 그리다 상한에 닿는다.** 그리고 web2-23이 **밑그림까지**
// 저장하기 시작했다.
//
//   5-a **구성 요소별로 쪼갠다** — 획 좌표 / rawIn / own3 / 밑그림 / 나머지
//   5-b **표가 지목한 것만 고친다** — 지금 판: 좌표 반올림(소수 1자리 · 저장할 때만)
//   5-c ⑤ 새 산술로 몇 획에서 경고·실패인가
//
// 재는 법: 같은 문서를 **열쇠 하나씩 빼고** 직렬화해 그 차이를 그 몫으로 읽는다.
// (합이 전체와 정확히 같지는 않다 — JSON 구분자·열쇠 이름이 겹친다. 그 잔차도 낸다.)
//
// 원장: stage0/out/filesize25_web2.json — 결정론(rng32 고정 시드·시간 없음).
//   정본 명령: npx vitest run test/filesize25_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { addLayer, commitStroke, createApp, findAllFaces, commitCandidates, setOwn3d, type App } from '../src/app/state'
import { serializeBrnl } from '../src/core/file'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import type { Doc, RawInput } from '../src/core/types'
import { pt, type Pt } from '../src/core/vec'

const W = 1200, H = 800
const outDir = resolve(__dirname, '../../stage0/out')
const u8 = (s: string) => Buffer.byteLength(s, 'utf8')

/** 손 획 하나 — `yellowraw_measure`의 픽스처와 **같은 형태**(원호 + 떨림 ±0.6px · 240점).
 *  두 원장이 같은 장면을 재야 값이 서로 대조된다(#71 ㉠). */
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

/** 펜 입력 — 점마다 필압·기울기·회전(web2-11 1-c의 형태). 마우스에는 안 실린다. */
function penInput(seed: number, n: number): RawInput {
  const r = rng32(seed + 5)
  const press: number[] = [], tiltX: number[] = [], tiltY: number[] = [], twist: number[] = []
  for (let i = 0; i <= n; i++) {
    press.push(Math.round((0.35 + 0.4 * Math.sin(Math.PI * i / n) + r() * 0.05) * 1000) / 1000)
    tiltX.push(Math.round((-12 + r() * 4) * 100) / 100)
    tiltY.push(Math.round((23 + r() * 4) * 100) / 100)
    twist.push(Math.round((r() * 6) * 100) / 100)
  }
  return { press, tiltX, tiltY, twist }
}

/** **실제 그림 하나**(5-a 문면): 작도 + 면 + 옐로 100획(펜 입력) + 밑그림.
 *  전부 **앱 경로**다 — 손으로 doc에 밀어 넣지 않는다. */
function realDoc(): App {
  const app = createApp(W, H)
  setOwn3d(app, true)                                   // own3 몫을 실제로 싣는다
  // ── 작도: 지면 사각(면이 서게) + 세로 넷 ──────────────────────────────────
  commitStroke(app, pt(500, 560), pt(760, 495))
  commitStroke(app, pt(500, 560), pt(240, 495))
  commitStroke(app, pt(760, 495), pt(240, 495))
  commitStroke(app, pt(500, 560), pt(500, 380))
  commitStroke(app, pt(760, 495), pt(760, 330))
  commitStroke(app, pt(240, 495), pt(240, 330))
  commitStroke(app, pt(500, 380), pt(760, 330))
  commitStroke(app, pt(500, 380), pt(240, 330))
  expect(app.lift.an.constructionDone).toBe(true)
  // ── 면: 일괄로 찾아 전부 세운다(web2-21 4부 — 앱과 같은 함수) ─────────────
  findAllFaces(app)
  commitCandidates(app)
  // ── 옐로 한 장 + 손 획 100(펜 입력) ───────────────────────────────────────
  const lay = addLayer(app, 'yellow', { W, H })
  expect(lay).not.toBeNull()
  for (let k = 0; k < 100; k++) {
    const raw = handStroke(k + 1000, pt(100 + (k % 10) * 100, 150 + Math.floor(k / 10) * 60),
      pt(180 + (k % 10) * 100, 170 + Math.floor(k / 10) * 60), 12 + (k % 5) * 8, 240)
    commitStroke(app, raw[0]!, raw[raw.length - 1]!, raw, undefined, penInput(k + 1000, 240))
  }
  return app
}

/** 문서의 깊은 사본 — 열쇠를 빼도 원본이 안 다친다 */
const clone = (doc: Doc): Doc => JSON.parse(JSON.stringify(doc))

describe('web2-25 5부 — 파일 크기 원장(filesize25)', () => {
  it('5-a 구성 요소별 바이트 + 5-b 반올림 전/후 + 5-c 새 산술', () => {
    const app = realDoc()
    const nextId = app.nextId
    const ser = (doc: Doc, round = true) => serializeBrnl({ doc, nextId }, { round })
    // ── **web2-24까지의 저장 형식**을 되살린다 — 전/후를 같은 문서에서 재기 위해서다.
    //    ㉠ 반올림 없음(`round:false`) ㉡ 옐로 rawIn 에 tilt·twist 가 실림(5-b가 뺀 것).
    const withTilt = clone(app.doc)
    for (const st of withTilt.strokes) {
      if (!st.rawIn?.press) continue
      const n = st.rawIn.press.length
      const r = rng32(st.id + 77)
      st.rawIn.tiltX = Array.from({ length: n }, () => Math.round(-12 + r() * 4))
      st.rawIn.tiltY = Array.from({ length: n }, () => Math.round(23 + r() * 4))
      st.rawIn.twist = Array.from({ length: n }, () => Math.round(r() * 6))
    }
    const full = ser(withTilt, false)         // **전** — web2-24까지의 저장 형식
    const fullBytes = u8(full)

    // ── 5-a: 열쇠 하나씩 빼고 재서 그 몫을 읽는다 ─────────────────────────────
    const without = (mut: (d: Doc) => void): number => {
      const d = clone(withTilt)
      mut(d)
      return u8(ser(d, false))
    }
    const parts = {
      raw_points: fullBytes - without(d => { for (const s of d.strokes) delete s.raw }),
      raw_input: fullBytes - without(d => { for (const s of d.strokes) delete s.rawIn }),
      own3: fullBytes - without(d => { for (const s of d.strokes) delete s.own3 }),
      underlays: fullBytes - without(d => { d.underlays = [] }),
      stroke_endpoints_and_meta: 0,   // 아래에서 채운다
      rest: 0,
    }
    // rawIn 안의 갈림 — press 만 남기면 얼마가 주는가(5-b의 둘째 후보를 표가 지목한다)
    const rawInTiltTwist = fullBytes - without(d => {
      for (const st of d.strokes) {
        if (st.rawIn) { delete st.rawIn.tiltX; delete st.rawIn.tiltY; delete st.rawIn.twist }
      }
    })
    const rawInPressOnly = parts.raw_input - rawInTiltTwist
    // 획에서 raw·rawIn·own3을 다 빼고 남은 몫(끝점 둘 + id + mat + layer …)
    const strokesBare = without(d => {
      for (const s of d.strokes) { delete s.raw; delete s.rawIn; delete s.own3 }
    })
    const noStrokes = without(d => {
      d.strokes = []; d.faces = []; d.underlays = []
    })
    parts.stroke_endpoints_and_meta = strokesBare - noStrokes
    parts.rest = noStrokes
    const sum = parts.raw_points + parts.raw_input + parts.own3 + parts.underlays
      + parts.stroke_endpoints_and_meta + parts.rest
    const residual = fullBytes - sum

    // ── 5-b: 고친 뒤 — ㉠ 옐로 rawIn press 만 ㉡ 좌표 반올림(저장할 때만) ─────────
    const slimSer = ser(app.doc, false)           // tilt·twist 뺀 판(반올림 전)
    const slimOnly = u8(slimSer)
    const u16Slim = slimSer.length * 2
    const rounded = ser(app.doc, true)            // **지금 앱이 쓰는 형식**(둘 다 적용)
    const roundedBytes = u8(rounded)
    const gainSlim = fullBytes - slimOnly
    const gainRound = slimOnly - roundedBytes
    const roundGain = fullBytes - roundedBytes

    // ── 5-c: 새 산술 — 몇 획에서 경고(70%)·실패인가 ────────────────────────────
    // 옐로 획 하나의 몫 = (문서 − 옐로 0획 문서) / 100. 앱 경로로 잰 값이다.
    const noYellowTilt = clone(withTilt)
    const noYellow = clone(app.doc)
    const yellowIds = new Set(noYellow.layers.filter(l => l.paper === 'yellow').map(l => l.id))
    noYellow.strokes = noYellow.strokes.filter(s => s.layer === undefined || !yellowIds.has(s.layer))
    const yIds = new Set(noYellowTilt.layers.filter(l => l.paper === 'yellow').map(l => l.id))
    noYellowTilt.strokes = noYellowTilt.strokes.filter(
      st => st.layer === undefined || !yIds.has(st.layer))
    const baseBefore = u8(ser(noYellowTilt, false)), baseAfter = u8(ser(noYellow, true))
    const perStrokeBefore = (fullBytes - baseBefore) / 100
    const perStrokeAfter = (roundedBytes - baseAfter) / 100
    const limit = C.AUTOSAVE_LIMIT_BYTES
    const capacity = (base: number, per: number, frac: number) => Math.floor((limit * frac - base) / per)
    const arith = {
      per_yellow_stroke_utf8_before: Math.round(perStrokeBefore * 10) / 10,
      per_yellow_stroke_utf8_after: Math.round(perStrokeAfter * 10) / 10,
      base_bytes_before: baseBefore,
      base_bytes_after: baseAfter,
      warn_at_strokes_before: capacity(baseBefore, perStrokeBefore, 0.7),
      warn_at_strokes_after: capacity(baseAfter, perStrokeAfter, 0.7),
      fail_at_strokes_before: capacity(baseBefore, perStrokeBefore, 1.0),
      fail_at_strokes_after: capacity(baseAfter, perStrokeAfter, 1.0),
      note: '⑤ — 5MB 가정(AS-C80) · 경고 70%. **utf8 셈**이다(앱의 자동 저장 게이지가 Blob '
        + '바이트라 그 셈이 정본이고, utf16 관례는 아래 pct에 병기한다 #28). 「획」은 이 '
        + '픽스처의 옐로 손 획(240점 → 솎은 뒤 ~100점 · 펜 입력 실림)이다 — 짧은 획이면 '
        + '더 많이 들어간다(외삽이지 상한이 아니다).',
    }

    const ledger = {
      run: {
        note: 'web2-25 5부 — 파일 크기의 구성 요소별 분해와 저장 좌표 반올림의 효과. '
          + '정본 명령: npx vitest run test/filesize25_measure.test.ts',
        date: '2026-08-28',
        fixture: '**실제 그림 하나**(앱 경로): 작도 8획(지면 사각+세로 넷) + 면 일괄 + 옐로 겹 1 '
          + '+ 옐로 손 획 100(원호+떨림 240점 · rng32 고정 시드 · **펜 입력**(press·tiltX·tiltY·'
          + 'twist) 실림) + 밑그림(옐로를 얹는 순간 구운 것). own3 깃발 켬.',
        conditions: {
          view_s: 1,
          method: '**열쇠 하나씩 빼고 직렬화해 그 차이를 그 몫으로 읽는다.** 합이 전체와 정확히 '
            + '같지 않다(JSON 구분자·열쇠 이름의 겹침) — 잔차를 residual_bytes로 낸다.',
          round_handle: 'serializeBrnl(d, {round:false})가 **web2-24까지의 저장 형식**이다 '
            + '(배정밀도 그대로). 기본값 true가 지금 앱이 쓰는 형식이다.',
        },
        constants: { AUTOSAVE_LIMIT_BYTES: C.AUTOSAVE_LIMIT_BYTES, RAW_SIMPLIFY_PX: C.RAW_SIMPLIFY_PX },
      },
      doc: {
        strokes_total: app.doc.strokes.length,
        yellow_strokes: 100,
        faces: app.doc.faces.length,
        underlay_segs: app.doc.underlays.reduce((n, u) => n + u.segs.length, 0),
        raw_points_total: app.doc.strokes.reduce((n, s) => n + (s.raw?.length ?? 0), 0),
        own3_strokes: app.doc.strokes.filter(s => s.own3).length,
      },
      components_utf8: {
        ...parts,
        total_bytes: fullBytes,
        residual_bytes: residual,
        raw_input_tilt_twist: rawInTiltTwist,
        raw_input_press_only: rawInPressOnly,
        pct: Object.fromEntries(Object.entries(parts)
          .map(([k, v]) => [k, Math.round((v / fullBytes) * 1000) / 10])),
        note: '5-a — **어디가 큰지 모르고 줄이면 헛수고다**(지시). raw_points = 솎은 점렬의 '
          + '좌표 · raw_input = 그 점렬에 나란한 press/tiltX/tiltY/twist · own3 = 자립 3D · '
          + 'underlays = web2-23의 밑그림 · stroke_endpoints_and_meta = 끝점 둘+id+mat+layer · '
          + 'rest = 프레임·종이·겹·면·nextId 등 나머지.',
      },
      fixes_5b: {
        before_utf8: fullBytes,
        after_slim_only_utf8: slimOnly,
        after_slim_and_round_utf8: roundedBytes,
        saved_by_slim_utf8: gainSlim,
        saved_by_round_utf8: gainRound,
        saved_by_slim_pct: Math.round((gainSlim / fullBytes) * 1000) / 10,
        saved_by_round_pct: Math.round((gainRound / fullBytes) * 1000) / 10,
        note: '5-b — **표가 지목한 둘만** 고쳤다. ㉠ **옐로 rawIn 은 press 만**(tilt·twist 를 '
          + '안 싣는다 — 읽는 자리가 렌더에 없다: brushmap 의 rawIn.press 하나뿐이고 grep 으로 '
          + '확인했다. ⚠ 지시의 「트레이싱지·바탕에서는 기울기가 표현에 쓰인다」는 **지금은 '
          + '참이 아니다**(D-4) — 그래도 그쪽은 안 건드렸다: 지시의 ⛔이고, 솎지 않는 원본을 '
          + '남겨 두는 것이 그 회차의 결정이었다). ㉡ **좌표 반올림**(아래 rounding).',
      },
      rounding_5b: {
        // ⚠ **분모가 위 fixes_5b 와 다르다**: 여기 before 는 «㉠(rawIn 솎기)까지 한 판»이고
        //   fixes_5b 의 saved_by_round_pct 는 «전(642,544B)» 대비다. 두 수가 다른 것은
        //   같은 값의 두 셈이다 — 어느 쪽인지 헷갈리지 않게 분모를 필드로 낸다.
        denominator_note: 'before_utf8 = 옐로 rawIn 솎기까지 한 판(㉠ 적용·반올림 전). '
          + 'fixes_5b.saved_by_round_pct 는 «전(수리 전)» 대비이고 이 saved_pct 는 그 판 대비다.',
        before_utf8: slimOnly,
        after_utf8: roundedBytes,
        saved_utf8: gainRound,
        saved_pct: Math.round((gainRound / slimOnly) * 1000) / 10,
        before_utf16: u16Slim,
        after_utf16: rounded.length * 2,
        pct_of_autosave_before_utf8: Math.round((slimOnly / limit) * 1000) / 10,
        pct_of_autosave_after_utf8: Math.round((roundedBytes / limit) * 1000) / 10,
        pct_of_autosave_after_utf16: Math.round((rounded.length * 2 / limit) * 1000) / 10,
        pct_of_autosave_original_utf8: Math.round((fullBytes / limit) * 1000) / 10,
        original_utf16: full.length * 2,
        note: '5-b — **저장할 때만** 소수 1자리로 반올림한다(메모리의 값은 안 깎는다). '
          + '0.1px는 눈에 안 보이고 솎기 임계(0.5px · AS-C82)보다도 촘촘하다. ⚠ 문서 px '
          + '좌표에만 건다(획 a·b·raw · 밑그림 마디) — 3D(own3)·포즈·view.s·치수(mm)는 단위가 '
          + '달라 0.1이 «안 보이는 대역»이 아니다. 그림이 안 바뀐다는 것은 e2e가 픽셀로 잰다.',
      },
      arithmetic_5c: arith,
      flags_explained: {
        'constants/metric_defs 스냅샷 없음': 'web2 라인 원장은 상수 스냅샷 등록부 밖(공통 형태)',
      },
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'filesize25_web2.json'), JSON.stringify(ledger, null, 2))
    console.log(`[측정] filesize25 — 전체 ${fullBytes}B · 점렬 ${parts.raw_points}B(${ledger.components_utf8.pct.raw_points}%)`
      + ` · rawIn ${parts.raw_input}B(${ledger.components_utf8.pct.raw_input}%)`
      + ` · own3 ${parts.own3}B · 밑그림 ${parts.underlays}B`
      + ` → 고친 뒤 ${roundedBytes}B(솎기 −${ledger.fixes_5b.saved_by_slim_pct}% · 반올림 −${ledger.fixes_5b.saved_by_round_pct}%)`
      + ` · 경고 ${arith.warn_at_strokes_before}획 → ${arith.warn_at_strokes_after}획`)

    // ── 판정선 — 하네스가 실제로 무언가를 쟀는가(0건 통과 방지) ──────────────
    expect(app.doc.strokes.length).toBe(108)
    // **분해능**(#71 ㉢) — 두 수리가 각각 실제로 줄이는가(합만 보면 하나가 0이어도 통과한다)
    expect(gainSlim).toBeGreaterThan(0)
    expect(gainRound).toBeGreaterThan(0)
    // 그리고 **옐로 획에는 tilt·twist 가 안 실린다**(수리가 실제로 들었다)
    expect(app.doc.strokes.some(st => st.rawIn?.press)).toBe(true)
    expect(app.doc.strokes.every(st => !st.rawIn?.tiltX && !st.rawIn?.twist)).toBe(true)
    expect(ledger.doc.faces).toBeGreaterThan(0)
    expect(ledger.doc.underlay_segs).toBeGreaterThan(0)
    expect(ledger.doc.own3_strokes).toBeGreaterThan(0)
    expect(ledger.doc.raw_points_total).toBeGreaterThan(1000)
    // 분해가 전체를 거의 덮는가(잔차가 전체의 1% 아래) — 아니면 표가 못 지목한 몫이 크다
    expect(Math.abs(residual)).toBeLessThan(fullBytes * 0.01)
    // 반올림이 **실제로** 줄인다(#69 ㉣ — 0을 적기 전에 확인한다)
    expect(roundGain).toBeGreaterThan(0)
    expect(arith.warn_at_strokes_after).toBeGreaterThan(arith.warn_at_strokes_before)
    // 상한은 상수에서 읽는다(D-C4)
    expect(C.AUTOSAVE_LIMIT_BYTES).toBe(5 * 1024 * 1024)
    // 두 셈이 **같은 값의 두 표현**임을 하네스가 단언한다(분모만 다르다)
    expect(ledger.fixes_5b.saved_by_round_utf8).toBe(ledger.rounding_5b.saved_utf8)
    expect(ledger.rounding_5b.before_utf8 - ledger.rounding_5b.after_utf8)
      .toBe(ledger.rounding_5b.saved_utf8)
    expect(ledger.fixes_5b.before_utf8 - ledger.fixes_5b.after_slim_only_utf8)
      .toBe(ledger.fixes_5b.saved_by_slim_utf8)
  })
})
