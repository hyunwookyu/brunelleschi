// web2-25 5-b — **저장 좌표 반올림**과 **옐로 rawIn 솎기**의 회귀 팔.
//
// 표가 지목한 둘만 고쳤다(`filesize25_web2.json` components_utf8):
//   ㉠ 점렬 좌표가 가장 큰 몫이다 → **저장할 때만** 소수 1자리로 반올림한다
//   ㉡ 그 다음이 rawIn 이고 그 안에서 tilt·twist 가 press 의 세 배다 → **옐로는 press 만**
//
//   ③ **그림이 안 바뀐다** — 왕복 뒤 좌표 이탈이 0.05px 이하(반올림 반칸)
//   ④ **트레이싱지 획의 rawIn 이 그대로다**(회귀 — 지시 5-b ⛔)
//   ㉢ **문서 px 밖의 값은 안 건드린다** — own3(3D)·포즈·치수(mm)·view.s
//   반증(D-3): `{round:false}`로 저장하면 배정밀도가 그대로 남는가 — **실제로 돌린다**
//
// 화면 몫(그림이 눈으로 안 바뀐다)은 e2e `roundsave.spec`이 픽셀로 잰다.

import { describe, it, expect } from 'vitest'
import { createApp, commitStroke, addLayer, loadDoc, setOwn3d, setPose } from '../src/app/state'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { rng32 } from '../src/core/material'
import type { RawInput } from '../src/core/types'
import { pt, v3, quatAxisAngle, type Pt } from '../src/core/vec'

const W = 1200, H = 800

function hand(seed: number, a: Pt, b: Pt, sag: number, n = 200): Pt[] {
  const r = rng32(seed)
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push({
      x: a.x + (b.x - a.x) * t + (r() * 2 - 1) * 0.6,
      y: a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * sag + (r() * 2 - 1) * 0.6,
    })
  }
  return out
}

const penIn = (n: number): RawInput => ({
  press: Array.from({ length: n + 1 }, (_, i) => 0.4 + 0.3 * Math.sin(Math.PI * i / n)),
  tiltX: Array.from({ length: n + 1 }, () => -11),
  tiltY: Array.from({ length: n + 1 }, () => 24),
  twist: Array.from({ length: n + 1 }, () => 3),
})

/** 작도 + 트레이싱지 손 획 + 옐로 손 획 — 세 갈래가 다 든 문서 */
function doc() {
  const app = createApp(W, H)
  setOwn3d(app, true)
  commitStroke(app, pt(500, 560), pt(760, 495))
  commitStroke(app, pt(500, 560), pt(240, 495))
  commitStroke(app, pt(760, 495), pt(240, 495))
  expect(app.lift.an.constructionDone).toBe(true)
  // 바탕(종이에 직접) 손 획 — 솎지 않는 갈래
  const baseRaw = hand(7, pt(300, 300), pt(700, 320), 18)
  commitStroke(app, baseRaw[0]!, baseRaw[baseRaw.length - 1]!, baseRaw, undefined, penIn(200))
  // 트레이싱지 한 장 + 손 획 하나 — **여기 rawIn 이 그대로여야 한다**(④)
  const tr = addLayer(app, 'tracing', { W, H })!
  const trRaw = hand(11, pt(320, 420), pt(680, 440), 22)
  commitStroke(app, trRaw[0]!, trRaw[trRaw.length - 1]!, trRaw, undefined, penIn(200))
  // 옐로 한 장 + 손 획 셋 — 여기는 press 만
  const ye = addLayer(app, 'yellow', { W, H })!
  for (let k = 0; k < 3; k++) {
    const r = hand(21 + k, pt(200 + k * 30, 600), pt(560 + k * 30, 620), 25)
    commitStroke(app, r[0]!, r[r.length - 1]!, r, undefined, penIn(200))
  }
  return { app, tracing: tr.id, yellow: ye.id }
}

describe('web2-25 5-b — 저장 좌표 반올림 · 옐로 rawIn 솎기', () => {
  it('④ 트레이싱지·바탕 획의 rawIn 이 그대로다 — 옐로만 press 로 준다(회귀 · 지시 ⛔)', () => {
    const { app, tracing, yellow } = doc()
    const tr = app.doc.strokes.find(s => s.layer === tracing)!
    expect(tr.rawIn?.tiltX?.length).toBe(tr.raw!.length)     // 기울기가 실려 있다
    expect(tr.rawIn?.twist?.length).toBe(tr.raw!.length)
    const base = app.doc.strokes.find(s => s.layer === undefined && s.raw)!
    expect(base.rawIn?.tiltX?.length).toBe(base.raw!.length)
    // 옐로는 press 만 — 그리고 press 는 **살아 있다**(렌더가 읽는 유일한 축이다)
    const ys = app.doc.strokes.filter(s => s.layer === yellow)
    expect(ys.length).toBe(3)
    for (const s of ys) {
      expect(s.rawIn?.press?.length).toBe(s.raw!.length)
      expect(s.rawIn?.tiltX).toBeUndefined()
      expect(s.rawIn?.tiltY).toBeUndefined()
      expect(s.rawIn?.twist).toBeUndefined()
    }
  })

  it('③ 그림이 안 바뀐다 — 왕복 뒤 좌표 이탈이 0.05px 이하(반올림 반칸)', () => {
    const { app } = doc()
    const back = parseBrnl(serializeBrnl({ doc: app.doc, nextId: app.nextId }))!
    const app2 = createApp(W, H)
    loadDoc(app2, back)
    expect(app2.doc.strokes.length).toBe(app.doc.strokes.length)
    let dev = 0
    let pts = 0
    for (const s of app.doc.strokes) {
      const t = app2.doc.strokes.find(x => x.id === s.id)!
      // **확정 끝점은 한 자리도 안 깎인다** — 잉크 심판(own3d §7 · OWN3_TOL_PX 0.01px)이
      // 그 자리에 걸려 있다. 깎으면 왕복에서 불변식이 깨진다(초판이 그 자리에서 빨개졌다).
      expect(t.a.x).toBe(s.a.x)
      expect(t.b.y).toBe(s.b.y)
      if (s.raw) {
        expect(t.raw!.length).toBe(s.raw.length)
        for (let i = 0; i < s.raw.length; i++) {
          dev = Math.max(dev, Math.abs(s.raw[i]!.x - t.raw![i]!.x), Math.abs(s.raw[i]!.y - t.raw![i]!.y))
          pts++
        }
      }
    }
    expect(pts).toBeGreaterThan(300)          // 실제로 점을 견줬다(0건 통과 방지)
    expect(dev).toBeLessThanOrEqual(0.05 + 1e-12)
    // **0.05px 는 솎기 임계(0.5px)의 1/10**이다 — 이미 «없는 것으로 친» 대역 안이다
    expect(dev * 10).toBeLessThanOrEqual(0.5)
    // **밑그림은 한 자리도 안 깎인다** — 표가 그것을 안 지목했고(문서의 0.1% 대역)
    // web2-23이 세운 왕복 동일성(underlay.test ④)이 그 자리에 있다.
    const u1 = app.doc.underlays[0], u2 = app2.doc.underlays[0]
    expect(u1 && u2).toBeTruthy()
    expect(u2!.segs).toEqual(u1!.segs)
  })

  it('㉢ 문서 px 밖의 값은 안 건드린다 — own3(3D)·포즈·치수·view.s', () => {
    const { app } = doc()
    // 궤도 포즈에서 한 획 더 — 그 획에 view(포즈)가 실린다
    setPose(app, { p: v3(1.234567890123, 1.6, 2.7182818284), q: quatAxisAngle(v3(0, 1, 0), 0.3141592653) })
    commitStroke(app, pt(400, 300), pt(600, 340))
    const src = app.doc.strokes.find(s => s.own3)
    expect(src).toBeTruthy()                              // own3 이 실제로 실렸다(분해능)
    const txt = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    const back = parseBrnl(txt)!
    const got = back.doc.strokes.find(s => s.id === src!.id)!
    // 3D 는 **한 자리도 안 깎였다** — 1단위가 눈높이 급이라 0.1이 10cm다
    expect(got.own3!.a.x).toBe(src!.own3!.a.x)
    expect(got.own3!.b.z).toBe(src!.own3!.b.z)
    const posed = back.doc.strokes.find(s => s.view)!
    const posedSrc = app.doc.strokes.find(s => s.id === posed.id)!
    expect(posed.view!.p.x).toBe(posedSrc.view!.p.x)      // 포즈도 그대로
    expect(posed.view!.q.y).toBe(posedSrc.view!.q.y)
  })

  it('반증(D-3) — {round:false}면 배정밀도가 그대로 남는다(반올림이 실제로 일한다)', () => {
    const { app } = doc()
    const raw = serializeBrnl({ doc: app.doc, nextId: app.nextId }, { round: false })
    const rnd = serializeBrnl({ doc: app.doc, nextId: app.nextId })
    expect(rnd.length).toBeLessThan(raw.length)           // 실제로 줄었다
    // 소수 둘째 자리를 가진 좌표가 **원본에는 있고 반올림 판에는 없다**
    const longNum = /"x":-?\d+\.\d{3,}/
    expect(longNum.test(raw)).toBe(true)
    const parsed = JSON.parse(rnd)
    const bad: number[] = []
    let seen = 0
    for (const s of parsed.strokes) {
      for (const p of s.raw ?? []) {
        for (const v of [p.x, p.y]) {
          seen++
          if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9) bad.push(v)
        }
      }
    }
    expect(seen).toBeGreaterThan(300)     // 실제로 점을 봤다(0건 통과 방지)
    expect(bad).toEqual([])
    // **메모리의 값은 안 깎였다**(지시 5-b ⚠) — 문서의 점은 여전히 배정밀도다
    const anyRaw = app.doc.strokes.find(s => s.raw)!.raw!
    expect(anyRaw.some(p => Math.abs(p.x * 10 - Math.round(p.x * 10)) > 1e-9)).toBe(true)
  })
})
