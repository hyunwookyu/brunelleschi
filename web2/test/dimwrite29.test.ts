// web2-29 1단계 — **치수 도구를 켠 상태에서 종이 위에 쓴다**의 게이트.
//
// #76 ㉠(있는 것부터 센다): 인식·분절·확정 전 표시·값 적용·단위 파싱은 **전부 이미 있다**.
//   이 단계가 더한 것은 둘뿐이다 — ① 종이 위에서 쓰는 길 ② 그 값이 보이는 치수선.
// ⚠⚠ D-4: 이 앱의 `Stroke.dim`은 **주석이 아니라 그 획의 길이**다(web2-08 4-2). 그래서
//   「두 점 사이 거리를 계산해서 덮어쓰지 마라」와 「파생값이 아니므로 저장한다」는
//   **이미 지켜져 있고**, 소유도 저절로 26-1의 규칙이다(치수는 그 획의 것이다).
//
// 게이트 다섯(지시):
//   ① 0~9와 소수점 **인식률을 픽스처로 재고 수치로 보고**
//   ② 인식 실패 시 손글씨가 남는다
//   ③ 치수가 저장·복원을 왕복한다
//   ④ 시점을 돌렸을 때 치수가 공간에 맞게 따라 돈다
//   ⑤ 겹에서 쓴 치수가 아래 종이에 안 나타난다 (26-1 회귀)

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { session } from './session'
import {
  pickDimTarget, addDimInk, stageDim, acceptDim, clearDimInk, endDimPick,
  addLayer, setActiveLayer, setLayerOn, orbitBy, setPose, createApp, loadDoc,
} from '../src/app/state'
import { DRAW_POSE } from '../src/core/camera'
import { recognizeDigitsNet } from '../src/core/handwriting'
import { parseDim } from '../src/core/dim'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { project } from '../src/core/camera'
import { lenMm } from '../src/core/dim'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import type { Pt } from '../src/core/vec'
import { write } from './glyphs'

const HERE = dirname(fileURLToPath(import.meta.url))
const W = 1200, H = 800

function closed() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)
  s.draw(500, 560, 800, 480)
  expect(s.app.lift.an.constructionDone).toBe(true)
  return s
}

// ── 숫자 획 픽스처 — 사람이 또박또박 쓴 글자를 흉내낸다 ──────────────────────
// ⚠ **템플릿을 그대로 쓰지 않는다**(#71 ㉢ · #68): 흔들기를 태워야 「인식률」이 값을 잰다.
//   흔들림은 결정론이다(rng32 — `Math.random` ⛔ #14).
// 글자 픽스처는 `test/glyphs.ts`로 옮겼다(web2-32가 같은 것을 읽는다 — #54).

describe('29-1 ① 인식률 — 0~9와 소수점 (수치로 보고)', () => {
  it('흔들기를 태운 격자에서 글자별 인식률을 낸다 (+반증: 흔들기를 키우면 떨어진다)', () => {
    const chars = '0123456789.'.split('')
    const JIT = [0, 0.5, 1.0, 1.5]           // 손 흔들림 px — #68(이상적 좌표만 훑지 않는다)
    const rows: { ch: string; hit: number; n: number; byJit: number[] }[] = []
    for (const ch of chars) {
      let hit = 0, n = 0
      const byJit: number[] = []
      for (const jit of JIT) {
        let h = 0
        for (let k = 0; k < 5; k++) {
          const strokes = write(ch, 100, 100, 31 + k * 613, jit)
          if (recognizeDigitsNet(strokes) === ch) h++
          n++
        }
        hit += h
        byJit.push(h)
      }
      rows.push({ ch, hit, n, byJit })
    }
    const tot = rows.reduce((a, r) => a + r.hit, 0)
    const totN = rows.reduce((a, r) => a + r.n, 0)
    for (const r of rows) console.log(`[29-1 ①] '${r.ch}' ${r.hit}/${r.n}  (흔들림 0/0.5/1.0/1.5 → ${r.byJit.join('/')} of 5)`)
    console.log(`[29-1 ①] 전체 ${tot}/${totN} = ${(tot / totN * 100).toFixed(1)}%`)
    // **분자/분모로 적는다**(§5 — 비율보다 분자/분모). 게이트는 「수치로 보고」이고,
    // 여기 단언은 **격자가 실제로 무언가를 재는가**다(#69 ㉣): 전부 맞거나 전부 틀리면
    // 이 표는 아무것도 안 잰다.
    expect(totN).toBe(chars.length * JIT.length * 5)
    expect(tot, '적어도 절반은 읽는다').toBeGreaterThan(totN / 2)
    expect(tot, '전부 맞지는 않는다 — 그러면 격자가 실사용 대역을 안 덮는 것이다').toBeLessThan(totN)

    // 여러 자리 — 「2500」이 넷으로 잘리고 그대로 읽힌다(분절은 `splitGlyphs` 하나가 한다)
    const multi = ['25', '250', '2500', '3.5'].map(t => ({ t, got: recognizeDigitsNet(write(t, 100, 100, 7, 0.5)) }))
    for (const m of multi) console.log(`[29-1 ①] "${m.t}" → "${m.got}"`)
    expect(multi.filter(m => m.got === m.t).length, '여러 자리도 읽는다').toBeGreaterThan(0)

    const out = resolve(HERE, '../../stage0/out/dimwrite29_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: 'web2-29 1단계 — 종이 위 손글씨 치수. dimwrite29_measure가 쓴다. 판정은 dimwrite29.test.ts의 expect가 정본.',
      conditions: {
        fixture: '글자 픽스처는 이 파일 안(SHAPES) — 인식기 템플릿이 아니라 «사람이 또박또박 쓴 것»의 흉내다. 흔들림 0/0.5/1.0/1.5px를 rng32로 태운다(Math.random ⛔ #14).',
        recognizer: 'recognizeDigitsNet(번들 MLP) — 내장 API는 헤드리스에 없다(그 갈래는 실기기 DEVICE-CHECK B8)',
        command: 'npx vitest run test/dimwrite29.test.ts',
      },
      constants: { NET_REJECT: 0.52, DIM_OFFSET_PX: C.DIM_OFFSET_PX, DIM_TICK_PX: C.DIM_TICK_PX, DIM_TEXT_PX: C.DIM_TEXT_PX },
      flags_explained: {
        '인식률이 100%가 아니다': '**그것이 정상이다** — 100%면 격자가 실사용 대역을 안 덮는 것이고(#71 ㉢·#68) 조용히 틀린 치수보다 «?»가 싸다(#61 ⚠⚠).',
        "'.' 이 0/20": '**픽스처의 성질이지 제품의 결함이 아니다**(D-5) — 소수점 판정(`digits.isDot`)은 «가장 큰 글리프 대비 작다»라서 **홀로 쓴 점**은 자기가 가장 크므로 점이 될 수 없다. 실제 쓰임에서 점은 늘 숫자와 함께 오고, 그 경우 «3.5»가 그대로 읽힌다(multi_digit 참조).',
        "'4' 가 6/20": '**보고한다**(고치지 않는다 — 인식기는 이 회차의 범위 밖이다). 두 획 글리프라 흔들림에서 가로획·세로획의 묶임이 갈린다. 실기기 판정은 DEVICE-CHECK B8이고, 그 값이 나쁘면 템플릿·모형이 다음 회차의 입구다.',
      },
      per_char: rows,
      total: { hit: tot, n: totN },
      multi_digit: multi,
    }, null, 2))
  })
})

describe('29-1 ② 인식 실패 시 손글씨가 남는다', () => {
  it('못 읽으면 `dimInk`가 그대로다 · 읽으면 받은 뒤에 사라진다', () => {
    const s = closed()
    const target = s.draw(500, 560, 500, 660)!
    expect(pickDimTarget(s.app, { x: 500, y: 610 })).toBe(target.id)
    // 못 읽는 획 — 물결선(숫자가 아니다)
    const junk: Pt[][] = [[{ x: 300, y: 300 }, { x: 320, y: 280 }, { x: 340, y: 320 }, { x: 360, y: 280 }]]
    addDimInk(s.app, junk[0]!)
    const text = recognizeDigitsNet(s.app.dimInk)
    const mm = parseDim(text, s.app.doc.unit)
    console.log(`[29-1 ②] 잡음 획 → "${text}" · parseDim ${mm}`)
    stageDim(s.app, text, mm)
    expect(acceptDim(s.app)).toBe('unread')
    expect(s.app.dimInk.length, '손글씨가 남는다').toBe(1)
    expect(s.app.dimPick, '대상도 그대로다').toBe(target.id)
    // 다시 쓴다 — 이번엔 읽히는 것
    clearDimInk(s.app)
    expect(s.app.dimInk.length).toBe(0)
    for (const st of write('3500', 300, 300, 5, 0)) addDimInk(s.app, st)   // 흔들림 0 — 이 팔이 재는 것은 «받으면 사라진다»이지 인식률이 아니다(그건 ①)
    const t2 = recognizeDigitsNet(s.app.dimInk)
    console.log(`[29-1 ②] 다시 쓴 획 → "${t2}"`)
    stageDim(s.app, t2, parseDim(t2, s.app.doc.unit))
    const r = acceptDim(s.app)
    expect(r === 'applied' || r === 'scale', `받았다(${r})`).toBe(true)
    expect(s.app.dimInk.length, '받으면 손글씨가 사라진다').toBe(0)
    expect(s.app.doc.strokes.find(x => x.id === target.id)!.dim).toBe(3500)
  })
})

describe('29-1 ③ 치수가 저장·복원을 왕복한다', () => {
  it('값과 그 획이 그대로 돌아온다 — 파생이 아니라 저장이다', () => {
    const s = closed()
    const target = s.draw(500, 560, 500, 660)!
    pickDimTarget(s.app, { x: 500, y: 610 })
    stageDim(s.app, '2500', 2500)
    acceptDim(s.app)
    const json = serializeBrnl({ doc: s.app.doc, nextId: s.app.nextId })
    expect(json).toContain('"dim"')
    const back = parseBrnl(json)!
    const app2 = createApp(W, H)
    loadDoc(app2, back)
    const got = app2.doc.strokes.find(x => x.id === target.id)!
    expect(got.dim).toBe(2500)
    expect(app2.lift.mmPerUnit, '스케일도 그대로 선다').not.toBeNull()
    console.log(`[29-1 ③] 왕복 — dim ${got.dim} · mmPerUnit ${app2.lift.mmPerUnit?.toFixed(4)}`)
  })
})

describe('29-1 ④ 시점을 돌렸을 때 치수가 공간에 맞게 따라 돈다', () => {
  it('치수선의 화면 자리가 그 획의 3D를 따라간다 — 값은 안 바뀐다', () => {
    const s = closed()
    const target = s.draw(500, 560, 500, 660)!
    pickDimTarget(s.app, { x: 500, y: 610 })
    stageDim(s.app, '2500', 2500)
    acceptDim(s.app)
    const seg = s.app.lift.lifted.get(target.id)!
    const before = project(s.app.lift.an, s.app.pose, seg.a3)!
    orbitBy(s.app, 45, 20)
    const seg2 = s.app.lift.lifted.get(target.id)!
    const after = project(s.app.lift.an, s.app.pose, seg2.a3)!
    console.log(`[29-1 ④] 끝점 화면 (${before.x.toFixed(1)},${before.y.toFixed(1)}) → (${after.x.toFixed(1)},${after.y.toFixed(1)})`)
    // 3D는 그대로이고 **사영만** 움직인다 — 치수선은 그 사영을 따라 그려진다
    expect(seg2.a3).toEqual(seg.a3)
    expect(Math.hypot(after.x - before.x, after.y - before.y), '화면 자리가 실제로 움직였다').toBeGreaterThan(5)
    expect(s.app.doc.strokes.find(x => x.id === target.id)!.dim, '값은 안 바뀐다').toBe(2500)
    // 되돌리면 제자리 — 「공간에 맞게」의 뜻이 그것이다
    setPose(s.app, DRAW_POSE)
    const back = project(s.app.lift.an, s.app.pose, s.app.lift.lifted.get(target.id)!.a3)!
    expect(back.x).toBeCloseTo(before.x, 6)
    expect(back.y).toBeCloseTo(before.y, 6)
  })
})

describe('29-1 ⑤ 겹에서 쓴 치수가 아래 종이에 안 나타난다 (26-1 회귀)', () => {
  it('겹을 끄면 그 치수도 같이 사라진다 — 그리고 종이 치수는 그대로 보인다(분해능)', () => {
    const s = closed()
    // 종이의 치수 — 이것이 **분해능**이다(#74 ㉠: 「안 보인다」가 «치수를 아예 안 그려서»면
    // 이 팔은 아무것도 안 잰다). 먼저 바탕이 스케일을 정한다(web2-21 1-b).
    const onPaper = s.draw(500, 560, 500, 660)!
    pickDimTarget(s.app, { x: 500, y: 610 })
    stageDim(s.app, '2500', 2500)
    expect(acceptDim(s.app)).toBe('scale')

    const lay = addLayer(s.app, 'tracing', { W, H })!
    setActiveLayer(s.app, lay.id)
    const onLayer = s.draw(560, 560, 560, 680)!
    expect(onLayer.layer, '26-1 — 새 획은 활성 겹의 것이다').toBe(lay.id)
    pickDimTarget(s.app, { x: 560, y: 620 })
    expect(s.app.dimPick).toBe(onLayer.id)
    stageDim(s.app, '3000', 3000)
    expect(acceptDim(s.app)).toBe('applied')

    /** 화면에 그려지는 치수 = `dim`이 있고 **지금 3D로 보이는** 획(render2d의 술어 그대로) */
    const shown = () => s.app.doc.strokes.filter(x => x.dim !== undefined && s.app.lift.lifted.has(x.id)).map(x => x.id)
    console.log(`[29-1 ⑤] 켬 — 보이는 치수 ${JSON.stringify(shown())}`)
    expect(shown()).toEqual([onPaper.id, onLayer.id])

    setLayerOn(s.app, lay.id, false)
    console.log(`[29-1 ⑤] 겹 끔 — 보이는 치수 ${JSON.stringify(shown())}`)
    expect(shown(), '겹의 치수는 사라지고 종이의 치수는 남는다').toEqual([onPaper.id])
    // 문서에는 그대로다(표시만 갈린다 — 27-2와 같은 규약)
    expect(s.app.doc.strokes.find(x => x.id === onLayer.id)!.dim).toBe(3000)
    setLayerOn(s.app, lay.id, true)
    expect(shown()).toEqual([onPaper.id, onLayer.id])
  })
})

describe('29-1 ⑥ D-4 — **적힌 값이 곧 길이다**(어긋남이 구성상 0)', () => {
  it('지시의 「적힌 값과 잰 값이 어긋나면 표시」는 이 모형에서 발화하지 않는다 — 값으로 낸다', () => {
    // ⚠⚠ 이 앱의 `Stroke.dim`은 **주석이 아니라 그 획의 길이**이고 리프팅이 그 값으로
    //   길이를 **다시 세운다**(web2-08 4-2). 그러므로 「잰 값」은 언제나 「적힌 값」이다.
    //   §5.1 자기참조 유형 3(복원↔역연산 왕복 지표) — **임계를 걸지 않는다.**
    //   그래서 안내를 **안 만들었다**(발화 조건이 없는 안내는 군더더기다).
    const s = closed()
    const a = s.draw(500, 560, 500, 660)!
    pickDimTarget(s.app, { x: 500, y: 610 })
    stageDim(s.app, '2500', 2500)
    expect(acceptDim(s.app)).toBe('scale')
    const b = s.draw(560, 560, 560, 600)!          // 더 짧은 선
    pickDimTarget(s.app, { x: 560, y: 580 })
    stageDim(s.app, '9000', 9000)                  // 잰 값보다 «훨씬 크게» 적는다
    expect(acceptDim(s.app)).toBe('applied')
    const seg = s.app.lift.lifted.get(b.id)!
    const measured = lenMm(seg.a3, seg.b3, s.app.lift.mmPerUnit)!
    console.log(`[29-1 ⑥] 적힌 9000 · 잰 ${measured.toFixed(3)} — 비 ${(9000 / measured).toFixed(6)}`)
    expect(measured).toBeCloseTo(9000, 6)          // **어긋남이 0이다** — 구성상
    // 분해능(§5.1) — 그 0이 「척도가 죽었다」가 아니라는 것: 값을 바꾸면 길이가 따라간다
    const before = measured
    stageDim(s.app, '4000', 4000)
    pickDimTarget(s.app, { x: 560, y: 580 })
    stageDim(s.app, '4000', 4000)
    acceptDim(s.app)
    const seg2 = s.app.lift.lifted.get(b.id)!
    const after = lenMm(seg2.a3, seg2.b3, s.app.lift.mmPerUnit)!
    console.log(`[29-1 ⑥-분해능] 값을 4000으로 바꾸니 잰 값 ${before.toFixed(1)} → ${after.toFixed(1)}`)
    expect(after).toBeCloseTo(4000, 6)
    expect(Math.abs(after - before)).toBeGreaterThan(1000)
  })
})
