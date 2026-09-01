// web2-43 1번 — **저장 왕복 검증** ⚠ 이 라운드의 최우선.
//
// 지시문의 무서운 사실: 「저장하고 다시 여는 왕복을 지금까지 한 번도 검증하지 않았는데,
// 그동안 저장 형식을 건드린 라운드가 넷이다.」 그린 것이 안 열리면 나머지가 다 무의미하다.
//
// 게이트 넷이 이 파일에 있다(#94의 짝: **실제 저장소**에서의 왕복은 e2e `files43.spec`이
// 잰다 — 여기는 «직렬화 ↔ 파싱»이라는 순수 함수 층이다. 두 층을 안 섞는다):
//   ① **바이트 동일성** — 전 데이터 종류가 든 문서의 저장 → 로드 → 재저장이 바이트로 같다
//   ② **종류 전수** — 픽스처가 `types.ts`의 필드를 **하나도 안 빠뜨렸다**(기억으로 안 센다)
//   ③ **세대** — 5회 반복에서 크기·좌표 불변(27-3 무회귀)
//   ④ **하위 호환** — v1·v2·v4·v5·v6 옛 저장물이 열린다(옛 판마다 하나씩)
//
// D-3 **반증 조건**은 게이트마다 짝으로 있다(각 it의 「반증」 절):
//   ①의 반증 = 한 획의 좌표를 0.2px 옮기면 그 대조가 **실제로 실패한다**
//   ②의 반증 = 인터페이스를 실제로 긁었는지(0건 통과 금지) + 없는 열쇠는 없다고 나온다
//   ④의 반증 = 옛 저장물의 판을 한 글자 바꾸면 그 팔이 잡는다

import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createApp, commitStroke, addLayer, addSheet, loadDoc, setOwn3d, setDimension, findAllFaces } from '../src/app/state'
import { serializeBrnl, parseBrnl, readBrnl, reportNotice } from '../src/core/file'
import { rng32 } from '../src/core/material'
import { emptyDoc, type Stroke } from '../src/core/types'
import { pt, type Pt } from '../src/core/vec'
import { serializeV1, serializeV2, serializeV4, serializeV5, serializeV6 } from './legacy_serialize'

const W = 1200, H = 800
const FIX = join(__dirname, 'fixtures')

/** 손 획 하나 — 결정론(rng32 · `Math.random` 금지 §5) */
function hand(seed: number, a: Pt, b: Pt, sag: number, n = 60): Pt[] {
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

const penIn = (n: number) => ({
  press: Array.from({ length: n + 1 }, (_, i) => 0.4 + 0.3 * Math.sin(Math.PI * i / n)),
  tiltX: Array.from({ length: n + 1 }, () => -11),
  tiltY: Array.from({ length: n + 1 }, () => 24),
  twist: Array.from({ length: n + 1 }, () => 3),
})

/** **전 데이터 종류가 든 문서** — 목록은 기억이 아니라 `types.ts` 전수다(게이트 ②가 지킨다).
 *  획은 앱의 실제 경로(`commitStroke`)로 만든다 — 손으로 밀어넣으면 앱이 만드는 기하를
 *  안 재게 된다(`test/session.ts` 머리주석의 그 규율). */
export function fullDoc() {
  const app = createApp(W, H)
  setOwn3d(app, true)
  // 작도 — 지평선은 상수(H/2)이고 깊이선 둘이 카메라를 닫는다
  commitStroke(app, pt(500, 560), pt(760, 495))
  commitStroke(app, pt(500, 560), pt(240, 495))
  commitStroke(app, pt(760, 495), pt(240, 495))
  // 종이에 직접 그린 손 획 — raw + rawIn 전부(펜)
  const base = hand(7, pt(300, 300), pt(700, 320), 18)
  const s1 = commitStroke(app, base[0]!, base[base.length - 1]!, base, undefined, penIn(60))
  // 상자 — 면(채움)과 구멍의 경계가 될 획들
  commitStroke(app, pt(500, 560), pt(500, 380))
  commitStroke(app, pt(760, 495), pt(760, 315))
  commitStroke(app, pt(240, 495), pt(240, 315))
  commitStroke(app, pt(500, 380), pt(760, 315))
  commitStroke(app, pt(500, 380), pt(240, 315))
  // 트레이싱지 겹 + 손 획(rawIn 전부 유지되는 갈래)
  addLayer(app, 'tracing', { W, H })
  const trRaw = hand(11, pt(320, 420), pt(680, 440), 22)
  commitStroke(app, trRaw[0]!, trRaw[trRaw.length - 1]!, trRaw, undefined, penIn(60))
  // 옐로 겹 + 손 획(2D · press만 남는 갈래) — 겹의 씨앗은 layer.id다
  addLayer(app, 'yellow', { W, H })
  const yeRaw = hand(21, pt(200, 600), pt(560, 620), 25)
  commitStroke(app, yeRaw[0]!, yeRaw[yeRaw.length - 1]!, yeRaw, undefined, penIn(60))
  // 치수(적은 값) + 축척 기준 — **3D로 올라간 획**에만 걸린다(대기 획은 못 받는다).
  // 그래서 손 획(s1)이 아니라 상자의 세로 모서리에 준다.
  void s1
  const vertical = app.doc.strokes.find(s => s.a.x === 500 && s.a.y === 560 && s.b.y === 380)
  if (vertical) setDimension(app, vertical.id, 2500)
  // 면 — 일괄로 찾는다(채움). 구멍은 아래에서 직접 얹는다(loops[1] = 개구부)
  findAllFaces(app)
  // 종이(장면) — 시점 저장 + 썸네일
  addSheet(app, 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==')
  return app
}

/** 헤드리스 경로가 없는 종류는 **문서에 직접** 얹는다(앱의 그 자리는 화면 조작이다):
 *  구멍(loops[1]) · 잰 값(measures) · 필압 보정(press) · 글씨 획(text) ·
 *  평행 사영(view.proj) · 밑그림(underlays). 모양은 `types.ts`가 정본이다. */
export function fullDocPlus() {
  const app = fullDoc()
  const d = app.doc
  const ids = d.strokes.slice(0, 3).map(s => s.id)
  // 구멍 — 바깥 루프 + 개구부. 경계의 «정체»만 담긴다(획 id)
  d.faces.push({
    id: app.nextId++,
    loops: [{ edges: ids.map(s => ({ kind: 'stroke' as const, s })) },
            { edges: ids.map(s => ({ kind: 'stroke' as const, s })) }],
  })
  // 잰 값 — 숫자가 아니라 «어느 두 점을 재는가»
  d.measures = [{ id: app.nextId++, a: { s: ids[0]!, t: 0 }, b: { s: ids[1]!, t: 0.5 } }]
  // 필압 보정(문서에 붙는다 — 기기가 아니다)
  d.press = { on: true, p0: 0.08, p1: 0.86, gamma: 1.4 }
  // 글씨 획 — 옐로와 같은 규격의 2D 획
  const wr = hand(31, pt(820, 640), pt(900, 660), 4)
  const text: Stroke = {
    id: app.nextId++, a: wr[0]!, b: wr[wr.length - 1]!, raw: wr, text: 1,
    rawIn: { press: penIn(60).press },
  }
  d.strokes.push(text)
  // 잠금(web2-44) — text와 같은 규격(값 1 하나). 게이트 ②가 이 줄이 없으면 빨개진다 —
  // 그것이 43-1이 세운 그 기계다(새 필드는 픽스처·KEY_ORDER에 같이 적는다).
  d.strokes[0]!.lock = 1
  // 칠 획·분류 정정·채움(web2-45) — 같은 기계가 그대로 잡았다(paint.f · cls · fill).
  const pw = hand(37, pt(700, 500), pt(760, 520), 5)
  d.strokes.push({
    id: app.nextId++, a: pw[0]!, b: pw[pw.length - 1]!, raw: pw,
    paint: { f: d.faces[0]!.id }, mat: { grade: 'HB' },
  })
  d.faces[0]!.cls = 'wall'
  d.faces[0]!.fill = 1
  // 재료 칠·면 재료(web2-46) — 같은 기계가 Stroke.m·Stroke.i를 빨강으로 잡았다(실측 —
  // 이 두 줄이 그 대응이다). 마커 칠 획 하나 + 면 재료 하나가 픽스처 대역에 든다.
  // ⚠ **web2-48**: 칠의 열쇠가 셋 바뀌었다 — `s`(면의 쪽 · 48-5) · `c`(색 hex · 48-7) ·
  // `w`(자국 굵기 · 48-2). 46의 (m,t)는 **상태에도 저장에도 안 남는다**(파서가 열 때
  // 색으로 옮겨 받는다 — #54). 그래서 이 픽스처도 새 열쇠로 적는다 — 게이트 ②가
  // 이 줄이 낙으면 빨개진다(그것이 43-1이 세운 기계다).
  const mw = hand(41, pt(640, 470), pt(710, 495), 5)
  d.strokes.push({
    id: app.nextId++, a: mw[0]!, b: mw[mw.length - 1]!, raw: mw,
    paint: { f: d.faces[0]!.id, s: -1, c: '#c07a5b', i: 1, w: 10 }, mat: { grade: 'HB' },
  })
  d.faces[0]!.mat = 'conc'
  // 단색 채움(web2-48 48-3) — `fill`이 1·2 둘을 다 밟게 두번째 면에 2를 준다.
  if (d.faces[1]) d.faces[1]!.fill = 2
  // 재료 표현(web2-49) — 같은 기계가 이 줄이 없을 때 실제로 빨개졌다(Face.rep — 이 회차
  // 실측). m + s(면의 쪽 · 48-5의 규약) 둘이 같이 산다 — 하나가 빠지면 파서가 통째 버린다.
  d.faces[0]!.rep = { m: 'brick', s: 1 }
  // 놓은 사람(web2-47) — 같은 기계가 Doc.persons·Person.g를 빨강으로 잡았다(실측).
  d.persons = [{ id: app.nextId++, g: { x: 1.25, y: 0, z: -6.5 } }]
  // 평행 사영이 실린 포즈로 그린 획(web2-42) — `view.proj` · 잉크 니브 굵기
  const par: Stroke = {
    id: app.nextId++, a: pt(960, 300), b: pt(1040, 340),
    view: { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 }, proj: { w: 1, D: 812.5 } },
    // ⚠ `mat.w`는 **화면 px**다(mm 아님 — `NIB_PX_PER_MM`). 0.35mm 촉 = 1.5px.
    // 초판이 0.35를 넣어 `NIB_MIN`(0.4)에 걸렸고 **파서가 문서를 통째로 거부했다** —
    // 픽스처가 그 자리에서 거부 규약을 실제로 밟은 것이다(D-5: 대역을 안 넘겼는지 본다).
    mat: { grade: 'INK', w: 1.5, press: 0.6 },
  }
  d.strokes.push(par)
  // 밑그림 — 옐로 겹을 얹는 순간 앱이 이미 구웠다(`addLayer`). **겹당 하나뿐**이므로
  // 여기서 또 밀면 파서가 뒤엣것을 버린다(초판이 그렇게 해서 왕복이 143바이트 어긋났고,
  // 그것은 제품 결함이 아니라 픽스처의 잘못이었다 — D-4의 형태). 있는 것에 «가려진 조각»을
  // 하나 더한다: `hidden: true` 대역을 픽스처가 실제로 밟게 하는 것이 목적이다.
  const yellow = d.layers.find(l => l.paper === 'yellow')!
  const u = d.underlays.find(x => x.layer === yellow.id)
  if (u) u.segs.push({ a: pt(556, 618), b: pt(400, 500), hidden: true })
  else d.underlays.push({ layer: yellow.id, segs: [{ a: pt(556, 618), b: pt(400, 500), hidden: true }] })
  return app
}

const ser = (app: ReturnType<typeof fullDocPlus>) =>
  serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView })

describe('43-1 ① 바이트 동일성 — 저장 → 로드 → 재저장', () => {
  it('전 데이터 종류가 든 문서의 두 직렬화가 **바이트로 같다**', () => {
    const app = fullDocPlus()
    const first = ser(app)
    const back = parseBrnl(first)
    expect(back, '자기가 쓴 것을 자기가 못 읽으면 그 뒤는 전부 무의미하다').not.toBeNull()
    const app2 = createApp(W, H)
    loadDoc(app2, back!)
    const second = serializeBrnl({ doc: app2.doc, nextId: app2.nextId, drawView: app2.drawView })
    expect(second).toBe(first)
    // 실제로 무언가를 담았다(빈 문서가 통과하는 형태를 막는다 — #69)
    expect(first.length).toBeGreaterThan(4000)
    expect(app2.doc.strokes.length).toBe(app.doc.strokes.length)
  })

  it('반증(D-3) — 한 획의 좌표를 0.2px 옮기면 이 대조가 **실제로 실패한다**', () => {
    const app = fullDocPlus()
    const first = ser(app)
    const back = parseBrnl(first)!
    back.doc.strokes[3]!.a.x += 0.2
    const app2 = createApp(W, H)
    loadDoc(app2, back)
    expect(serializeBrnl({ doc: app2.doc, nextId: app2.nextId, drawView: app2.drawView })).not.toBe(first)
  })
})

// ── 게이트 2 종류 전수 — **기억으로 나열하지 마라**(지시 문면) ────────────────
// `types.ts`(+ measure.ts · press.ts)의 인터페이스에서 **필드 이름을 소스로 긁어내** 픽스처의
// 직렬화 문자열과 대조한다. 새 회차가 필드를 더하면 이 팔이 **자동으로 빨개진다** —
// 그것이 「왕복에서 조용히 사라지는 후보」의 탐지기다(D-5의 픽스처 대역 물음의 자동판).
const SRC = ['types.ts', 'measure.ts', 'press.ts'] as const

/** `types.ts`가 자료형을 들여오는데 **위 목록에 없는** 파일 — 그 까닭이 여기 적혀 있어야 한다.
 *  ⚠ 왜 필요한가(리뷰어 [12]): 목록이 손으로 박혀 있으면 **네 번째 파일이 생기는 날 전수가
 *  조용히 좁아진다**. 아래 팔이 `types.ts`의 import를 읽어 이 표와 대조하므로, 새 파일에
 *  자료형을 두면 «여기에 까닭을 적거나 SRC에 넣거나» 둘 중 하나를 하게 된다. */
const SRC_OUTSIDE: Record<string, string> = {
  'vec.ts': 'Pt·V3·Quat는 좌표 원시형이고 그 필드(x·y·z·w)는 SRC 셋의 인터페이스 안에서 이미 요구된다',
  'dim.ts': 'Unit(문자열 리터럴)만 들여온다 — DimSkew는 저장물이 아니라 화면 계산이다',
}

/** 소스에서 인터페이스 필드 이름을 긁는다.
 *  ⚠ **중괄호를 세서** 몸통을 잡는다 — `/\{[\s\S]*?\n\}/`로 잡던 초판은 한 줄짜리
 *  인터페이스(`RawInput` · `ViewOffset`)에서 **다음 인터페이스를 통째로 삼켰다**
 *  (그래서 `Stroke`가 목록에서 사라졌다 — 이 팔이 아무것도 안 재던 자리다 · #69).
 *  중첩 모양(`frame: { W; H }` · `proj?: { w; D }`)의 안쪽 이름도 같이 긁는다:
 *  저장물에는 그 이름이 그대로 열쇠로 실리므로 그것이 옳은 요구다. */
function declaredFields(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const f of SRC) {
    const src = readFileSync(join(__dirname, '../src/core', f), 'utf8')
    const re = /export interface (\w+)\s*\{/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      let depth = 0
      let end = -1
      for (let i = m.index + m[0].length - 1; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
      }
      if (end < 0) continue
      const body = src.slice(m.index + m[0].length, end)
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      const names = body.split(/[;\n]/)
        .map(x => /^\s*(\w+)\??\s*:/.exec(x)?.[1])
        .filter((x): x is string => !!x)
      if (names.length > 0) out.set(m[1]!, names)
    }
  }
  return out
}

/** 직렬화 문자열에 실제로 실린 열쇠 전부 */
function keysIn(json: string): Set<string> {
  const seen = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) { seen.add(k); walk(x) }
    }
  }
  walk(JSON.parse(json))
  return seen
}

/** 저장에 **일부러 안 싣는** 필드 — 까닭이 여기 적혀 있어야 통과한다(#54: 예외도 한 자리) */
const NOT_SAVED: Record<string, string> = {}

describe('43-1 ② 종류 전수 — 픽스처가 types.ts의 필드를 안 빠뜨렸다', () => {
  it('선언된 필드가 전부 픽스처의 저장물에 실려 있다', () => {
    const app = fullDocPlus()
    const json = ser(app)
    const have = keysIn(json)
    const decl = declaredFields()
    // 인터페이스가 실제로 긁혔다(정규식이 0건을 내면 이 팔은 아무것도 안 잰다 — #69)
    expect(decl.get('Stroke')?.length ?? 0).toBeGreaterThan(8)
    expect(decl.size).toBeGreaterThan(8)
    const missing: string[] = []
    for (const [iface, names] of decl) {
      for (const n of names) {
        if (have.has(n) || NOT_SAVED[n]) continue
        missing.push(`${iface}.${n}`)
      }
    }
    expect(missing, '이 필드는 픽스처에 없다 — 왕복에서 조용히 사라지는 후보다').toEqual([])
  })

  it('반증(D-3) — 없는 열쇠는 없다고 나온다(대조가 무조건 참이 아니다)', () => {
    const have = keysIn(ser(fullDocPlus()))
    expect(have.has('그런열쇠는없다')).toBe(false)
  })

  it('SRC 목록이 types.ts의 의존을 다 덮는다 — **네 번째 파일이 생기면 여기서 빨개진다**', () => {
    const src = readFileSync(join(__dirname, '../src/core/types.ts'), 'utf8')
    const deps = [...src.matchAll(/from '\.\/(\w+)'/g)].map(m => `${m[1]}.ts`)
    expect(deps.length, 'import를 실제로 읽었다').toBeGreaterThan(2)
    const uncovered = [...new Set(deps)].filter(f => !SRC.includes(f as never) && !SRC_OUTSIDE[f])
    expect(uncovered, '이 파일의 자료형이 전수 대조 밖에 있다 — SRC에 넣거나 SRC_OUTSIDE에 까닭을 적어라')
      .toEqual([])
    // 반증(D-3) — 이 거르개가 **실제로 무엇을 잡는다**: 모르는 파일을 끼우면 걸린다
    const probe = [...deps, 'zzz.ts'].filter(f => !SRC.includes(f as never) && !SRC_OUTSIDE[f])
    expect(probe).toEqual(['zzz.ts'])
  })
})

describe('43-1 ③ 세대 — 저장 → 열기 → 저장 5회에서 크기·좌표가 안 변한다', () => {
  it('27-3 무회귀 — raw 단순화는 커밋 시 한 번뿐이다(세대 손실 금지)', () => {
    const app = fullDocPlus()
    const sizes: number[] = []
    const coords: string[] = []
    let cur = { doc: app.doc, nextId: app.nextId, drawView: app.drawView }
    for (let g = 0; g < 6; g++) {
      const json = serializeBrnl(cur)
      sizes.push(json.length)
      const back = parseBrnl(json)!
      const next = createApp(W, H)
      loadDoc(next, back)
      coords.push(JSON.stringify(next.doc.strokes.map(s => s.raw ?? [s.a, s.b])))
      cur = { doc: next.doc, nextId: next.nextId, drawView: next.drawView }
    }
    // 첫 저장(메모리의 생 문서 → 0.1px 반올림)만 갈리는 것이 설계다(AS-C92) —
    // 그래서 **첫 복원부터** 견준다(27-3 ④의 그 규율 그대로).
    for (let i = 2; i < sizes.length; i++) expect(sizes[i], `세대 ${i}`).toBe(sizes[1])
    for (let i = 1; i < coords.length; i++) expect(coords[i], `세대 ${i}`).toBe(coords[0])
    // **양성 대조**(#69 ㉣ · 리뷰어 [13]) — 「불변」이 «척도가 0»이 아님을 보인다.
    // 같은 문서를 **반올림 없이** 저장하면 바이트가 실제로 달라진다: 이 자가 움직인다.
    const rawBytes = serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView },
      { round: false }).length
    expect(rawBytes, '반올림을 끄면 크기가 달라진다 — 이 자는 실제로 움직인다').not.toBe(sizes[1])
    expect(rawBytes).toBeGreaterThan(sizes[1]!)
  })
})

// ── 게이트 4 하위 호환 — 옛 판의 저장물이 열린다 ───────────────────────────────
// 픽스처는 `test/fixtures/brnl_v*.json`이고 **옛 판의 직렬화 함수가 낸 값**이다
// (`test/legacy_serialize.ts` — git 이력에서 그대로 떠 온 것). 이 팔이 **없으면 만든다**:
// 처음 한 번 굳히고 그 뒤로는 대조만 한다(사람이 고치면 빨개진다).
function legacyDoc(): any {
  const d: any = emptyDoc(W, H)
  d.strokes = [
    { id: 1, a: { x: 100, y: 400 }, b: { x: 1100, y: 400 } },   // v1의 첫 획 = 지평선
    { id: 2, a: { x: 500, y: 500 }, b: { x: 600, y: 475 } },
    { id: 3, a: { x: 500, y: 500 }, b: { x: 400, y: 475 } },
    { id: 4, a: { x: 500, y: 500 }, b: { x: 500, y: 380 },
      raw: [{ x: 500, y: 500 }, { x: 500.4, y: 440 }, { x: 500, y: 380 }] },
  ]
  return d
}

const VERSIONS: { v: number; commit: string; make: (d: any) => string }[] = [
  { v: 1, commit: 'babdfa1', make: serializeV1 },
  { v: 2, commit: 'c9db963', make: serializeV2 },
  { v: 4, commit: '6f38dee', make: serializeV4 },
  { v: 5, commit: '56ef42f', make: serializeV5 },
  { v: 6, commit: 'a4ca2c5', make: serializeV6 },
]

describe('43-1 ④ 하위 호환 — 형식 변경 지점마다 픽스처 하나', () => {
  for (const { v, commit, make } of VERSIONS) {
    it(`v${v}(${commit})의 저장물이 열린다`, () => {
      const base = legacyDoc()
      const d: any = { doc: base, nextId: 5, savedViews: [], drawView: null }
      if (v >= 4) {
        // v4부터 savedViews가 sheets가 됐다 — 배열 0이 작도 종이
        base.sheets = [{ id: 0, name: '작도' },
          { id: 10, name: '종이 2', pose: { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, view: { s: 1, ox: 0, oy: 0 } }]
        d.nextId = 11
      } else {
        d.savedViews = [{ pose: { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, view: { s: 1, ox: 0, oy: 0 } }]
      }
      if (v >= 5) base.layers = [{ id: 12, sheet: 0, paper: 'tracing', rect: { x: 10, y: 10, w: 300, h: 200 }, on: true, locked: false }]
      if (v >= 6) base.underlays = [{ layer: 12, segs: [{ a: { x: 12, y: 14 }, b: { x: 200, y: 180 }, hidden: false }] }]
      const path = join(FIX, `brnl_v${v}.json`)
      const text = make(d)
      if (!existsSync(path)) writeFileSync(path, text)
      const frozen = readFileSync(path, 'utf8')
      expect(frozen, '픽스처는 굳은 것이다 — 갈리면 옛 판의 저장물이 아니게 된다').toBe(text)

      const got = parseBrnl(frozen)
      expect(got, `v${v} 저장물이 안 열린다`).not.toBeNull()
      // v1은 지평선 획을 버리고 평행이동한다(web2-17) — 나머지는 획 수가 그대로다
      expect(got!.doc.strokes.length).toBe(v === 1 ? 3 : 4)
      // 실린 것이 실제로 살아 돌아왔다
      if (v >= 4) expect(got!.doc.sheets.length).toBe(2)
      if (v >= 5) expect(got!.doc.layers.length).toBe(1)
      if (v >= 6) expect(got!.doc.underlays.length).toBe(1)
      // 열린 문서는 **지금 판**으로 다시 나간다(옛 판으로 되쓰지 않는다)
      const again = serializeBrnl({ doc: got!.doc, nextId: got!.nextId, drawView: got!.drawView })
      expect(JSON.parse(again).version).toBe(6)
      // 그리고 그 뒤로는 왕복이 바이트로 닫힌다
      const twice = parseBrnl(again)!
      expect(serializeBrnl({ doc: twice.doc, nextId: twice.nextId, drawView: twice.drawView })).toBe(again)
    })
  }

  it('반증(D-3) — 픽스처의 판을 한 글자 바꾸면 그 팔이 잡는다', () => {
    const frozen = readFileSync(join(FIX, 'brnl_v6.json'), 'utf8')
    const broken = frozen.replace('"version":6', '"version":9')
    expect(parseBrnl(broken), '판이 미래면 거부한다 — 전방 호환을 흉내내지 않는다').toBeNull()
    expect(readBrnl(broken).report.ok).toBe(false)
  })
})

// ── 게이트 ⑤ 깨진 파일 — 「읽은 데까지 + 알림」 ────────────────────────────────
// 지시문: 「저장물이 잘렸거나 필드가 빠졌을 때 **조용히 빈 문서를 열지 마라.** 읽을 수
// 있는 데까지 읽고, 무엇을 못 읽었는지 알린다. **전부 버리는 것과 조용히 일부만 여는 것
// 둘 다 금지**다.」 판정자는 `readBrnl`의 보고이고 화면 문구는 `reportNotice`다.
describe('43-1 ⑤ 깨진 파일 — 읽은 데까지 읽고 못 읽은 것을 말한다', () => {
  it('성한 파일은 «건짐»이 아니다(반증 D-3 — 이 보고가 늘 「손상」이면 아무것도 안 잰다)', () => {
    const r = readBrnl(ser(fullDocPlus()))
    expect(r.data).not.toBeNull()
    expect(r.report.ok).toBe(true)
    expect(r.report.salvaged).toBe(false)
    expect(reportNotice(r.report), '성한 파일에는 알림이 없다 — 알림은 오류만(4-b)').toBeNull()
  })

  it('**잘린 저장물** — 온전한 획까지 읽고 잘렸다고 말한다(빈 문서 ⛔)', () => {
    const full = ser(fullDocPlus())
    const whole = parseBrnl(full)!.doc.strokes.length
    const cut = full.slice(0, Math.floor(full.length * 0.55))
    expect(parseBrnl(cut), '엄격 파서는 잘린 파일을 못 읽는다 — 그래서 이 층이 있다').toBeNull()
    const r = readBrnl(cut)
    expect(r.data, '전부 버리지 않는다').not.toBeNull()
    expect(r.report.truncated).toBe(true)
    expect(r.report.salvaged).toBe(true)
    expect(r.report.keptStrokes).toBeGreaterThan(0)
    expect(r.report.keptStrokes).toBeLessThan(whole)      // 조용히 «다 읽었다»고 하지 않는다
    expect(r.data!.doc.strokes.length).toBe(r.report.keptStrokes)
    const notice = reportNotice(r.report)
    expect(notice).toContain('잘렸다')
    expect(notice).toContain(String(r.report.keptStrokes))
    // 살아 돌아온 것은 **온전한 획**이다 — 반쯤 쓰인 획을 지어내지 않는다
    for (const s of r.data!.doc.strokes) {
      expect(Number.isFinite(s.a.x) && Number.isFinite(s.b.y)).toBe(true)
    }
  })

  it('**필드가 깨진 획** — 그 획만 버리고 나머지를 연다(문서를 안 버린다)', () => {
    const app = fullDocPlus()
    const raw = JSON.parse(ser(app))
    const whole = raw.strokes.length
    raw.strokes[2].mat = { grade: 'HB', w: 99 }          // 대역 밖 니브 — 엄격 규약은 «거부»다
    const text = JSON.stringify(raw)
    expect(parseBrnl(text), '엄격 파서는 문서를 통째로 거부한다(그 규약은 안 바꾼다)').toBeNull()
    const r = readBrnl(text)
    expect(r.report.ok).toBe(true)
    expect(r.report.truncated).toBe(false)
    expect(r.report.droppedStrokes).toBe(1)
    expect(r.report.keptStrokes).toBe(whole - 1)
    expect(reportNotice(r.report)).toContain('획 1')
  })

  it('**통째로 못 읽는 항목**은 그것만 버린다 — 획은 산다', () => {
    const raw = JSON.parse(ser(fullDocPlus()))
    const whole = raw.strokes.length
    raw.measures = [{ id: 'x' }]                          // 재기 모양이 깨졌다
    const r = readBrnl(JSON.stringify(raw))
    expect(r.report.ok).toBe(true)
    expect(r.report.keptStrokes).toBe(whole)
    expect(r.report.droppedKeys).toContain('measures')
    expect(reportNotice(r.report)).toContain('measures')
  })

  it('아무것도 못 건지면 **빈 문서를 열지 않는다** — 못 열었다고 말한다', () => {
    for (const bad of ['', 'not json', '{}', '{"format":"png"}']) {
      const r = readBrnl(bad)
      expect(r.data, bad).toBeNull()
      expect(r.report.ok, bad).toBe(false)
      expect(reportNotice(r.report), bad).toBeTruthy()
    }
  })
})
