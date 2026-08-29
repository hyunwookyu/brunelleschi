// web2-27 3번 — **파일 크기**의 게이트와 측정.
//
// ⚠⚠ **D-4 — 지시의 전제가 낡았다.** 지시: 「옐로 100획이 **488KB**. 상한의 18.6%.
//   지금 전 자릿수를 그대로 쓰고 있으면 대부분이 무의미한 소수다.」
//   그 수는 **web2-25 이전의 값**이다(`yellowraw_web2.json` 재생성 전). web2-25 5부가
//   이미 ① 옐로 `rawIn`을 press만 싣고 ② 저장 좌표를 **소수 1자리**로 반올림해
//   **487,768 B → 236,634 B**로 줄였다(AS-C92·AS-C93). 즉 지시가 요구한 두 손잡이 중
//   「좌표 자릿수」는 **이미 걸려 있고, 지시가 준 값(2자리)보다 더 촘촘하다**.
//
// ⚠⚠ **#75 ㉡ — 깎기 전에 그 좌표에 걸린 불변식을 센다.** 지시 「3D 좌표: 소수 3자리」는
//   **못 건드린다**: `own3`에는 **잉크 심판**(`OWN3_TOL_PX` 0.01 **px**)이 걸려 있고
//   3D 1mm는 이 장면 대역에서 그보다 훨씬 큰 화면 어긋남을 낸다. 이 파일이 그것을
//   **값으로** 낸다(③) — 「안 깎는다」가 취향이 아니라 측정이라는 것이 이 팔의 몫이다.
//
// 그래서 이 회차가 실제로 바꾼 것은 **솎기 임계를 선폭에 묶은 것** 하나다(지시 2).

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, commitStroke, addLayer, setActiveLayer, loadDoc } from '../src/app/state'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { rdpIndices } from '../src/core/freehand'
import { widthOfMat, rng32 } from '../src/core/material'
import { own3Deviation, OWN3_TOL_PX } from '../src/core/own3d'
import { C } from '../src/core/constants'
import { session } from './session'
import type { Pt } from '../src/core/vec'

const HERE = dirname(fileURLToPath(import.meta.url))
const W = 1200, H = 800
const BASELINE_BYTES = 487768        // 지시가 든 「488KB」의 정본(web2-25 재생성 전 실측)

/** 프리핸드 한 획 — 결정론(rng32 · Math.random ⛔ #14). `yellowraw_measure`와 같은 모양. */
function freehand(seed: number, n = 241): Pt[] {
  const r = rng32(seed)
  const pts: Pt[] = []
  let x = 200 + r() * 200, y = 200 + r() * 200
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    x += 2.2 + (r() - 0.5) * 1.6
    y += Math.sin(t * 6.2) * 2.4 + (r() - 0.5) * 1.6
    pts.push({ x, y })
  }
  return pts
}

/** 옐로 100획 문서 — 앱 경로로 만든다(`commitStroke`가 솎는다) */
function yellowDoc100() {
  const s = session(W, H)
  s.draw(280, 560, 700, 560)          // 겹은 그림 위에 얹는다 — 빈 문서에는 못 얹는다
  s.draw(500, 560, 800, 480)
  const app = s.app
  const lay = addLayer(app, 'yellow', { W, H })!
  setActiveLayer(app, lay.id)
  for (let i = 0; i < 100; i++) {
    const pts = freehand(3 + i * 17)
    commitStroke(app, pts[0]!, pts[pts.length - 1]!, pts)
  }
  return app
}

const bytes = (app: ReturnType<typeof createApp>) =>
  new TextEncoder().encode(serializeBrnl({ doc: app.doc, nextId: app.nextId })).length

describe('27-3 ① 옐로 100획의 크기 — 지시 기준선의 절반 이하', () => {
  it('앱 경로로 만든 문서의 실제 바이트 (원장에 남긴다)', () => {
    const app = yellowDoc100()
    const b = bytes(app)
    const pts = app.doc.strokes.reduce((n, s) => n + (s.raw?.length ?? 0), 0)
    console.log(`[27-3 ①] 옐로 100획 — ${b} B (${(b / BASELINE_BYTES * 100).toFixed(1)}% of ${BASELINE_BYTES}) · raw 점 ${pts}`)
    expect(b, `지시 기준선 ${BASELINE_BYTES}B의 절반 이하`).toBeLessThan(BASELINE_BYTES / 2)
    // 분해능(#69 ㉣) — 0이 아니고 기준선보다 «훨씬» 작지도 않아야 이 게이트가 무언가를 잰다
    expect(b).toBeGreaterThan(50_000)
  })
})

describe('27-3 ② 단순화의 최대 편차 — 화면 선폭의 0.25배 미만', () => {
  it('전 등급에서 임계가 선폭에 묶이고, 실측 편차가 그 아래다 (+반증: 임계를 키우면 넘는다)', () => {
    const rows: { grade: string; width: number; tol: number; devMax: number; kept: number; n: number }[] = []
    for (const grade of ['2H', 'HB', '2B'] as const) {
      const width = widthOfMat({ grade })
      const tol = Math.min(C.RAW_SIMPLIFY_PX, C.RAW_SIMPLIFY_WIDTH_RATIO * width)
      let devMax = 0, kept = 0, n = 0
      for (const seed of [3, 20, 37, 54, 71]) {
        const pts = freehand(seed)
        const keep = rdpIndices(pts, tol)
        kept += keep.length; n += pts.length
        devMax = Math.max(devMax, maxDev(pts, keep))
      }
      rows.push({ grade, width, tol, devMax, kept, n })
      console.log(`[27-3 ②] ${grade.padStart(2)} — 선폭 ${width} · 임계 ${tol.toFixed(3)} · 실측 최대 편차 ${devMax.toFixed(4)} · 마디 ${kept}/${n}`)
    }
    for (const r of rows) {
      expect(r.tol, `${r.grade} 임계가 선폭의 0.25배 이하`).toBeLessThanOrEqual(r.width * 0.25 + 1e-12)
      expect(r.devMax, `${r.grade} 실측 편차`).toBeLessThan(r.width * 0.25)
      expect(r.kept, `${r.grade} 솎기가 실제로 돈다`).toBeLessThan(r.n)   // 분해능
    }
    // 반증(D-3) — 임계를 5px로 키우면 편차가 **선폭의 0.25배를 넘는다**(그 게이트가 실패 가능하다)
    let devBig = 0
    for (const seed of [3, 20, 37, 54, 71]) {
      const pts = freehand(seed)
      devBig = Math.max(devBig, maxDev(pts, rdpIndices(pts, 5)))
    }
    console.log(`[27-3 ②-반증] 임계 5px — 최대 편차 ${devBig.toFixed(3)}`)
    expect(devBig).toBeGreaterThan(widthOfMat({ grade: '2B' }) * 0.25)
  })
})

/** 솎은 마디로 다시 그린 폴리라인과 원본의 최대 이탈(수직거리) */
function maxDev(pts: Pt[], keep: number[]): number {
  let worst = 0
  for (let k = 0; k + 1 < keep.length; k++) {
    const a = pts[keep[k]!]!, b = pts[keep[k + 1]!]!
    for (let i = keep[k]! + 1; i < keep[k + 1]!; i++) worst = Math.max(worst, distToSeg(pts[i]!, a, b))
  }
  return worst
}
function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

describe('27-3 ③ D-4 · #75 ㉡ — 3D 좌표를 깎기 전에 **불변식을 센다**', () => {
  it('구도 넷 스윕 — 지시가 준 3자리(1mm)는 좁은 화각에서 잉크 심판을 깬다', () => {
    // 지시 1: 「3D 좌표: 소수 3자리(= mm). 제도 정밀도보다 이미 아래다.」
    // #75 ㉡: **깎기 전에 그 좌표에 걸린 불변식을 센다.** `own3`에는 **잉크 심판**이
    // 걸려 있다 — 「그 3D를 지금 카메라로 다시 사영하면 획의 끝점에 떨어진다」를
    // `OWN3_TOL_PX`(0.01 **px**)로. 3D를 mm로 깎으면 그 화면 어긋남이 얼마인가는
    // **구도가 정한다**(f와 |z|) — 한 장면으로는 못 판정한다(D-5).
    const scenes: { name: string; build: (s: ReturnType<typeof session>) => void }[] = [
      { name: '기본', build: s => { s.draw(280, 560, 700, 560); s.draw(500, 560, 800, 480); s.draw(500, 560, 500, 660); s.draw(560, 560, 560, 640) } },
      { name: '넓은 화각', build: s => { s.draw(100, 400, 1100, 400); s.draw(650, 400, 650, 400); s.draw(400, 400, 400, 400); s.draw(500, 500, 660, 460); s.draw(580, 480, 580, 380); s.draw(580, 420, 640, 416) } },
      { name: '좁은 화각', build: s => { s.draw(100, 400, 1100, 400); s.draw(3100, 400, 3100, 400); s.draw(-2500, 400, -2500, 400); s.draw(500, 500, 660, 460); s.draw(580, 480, 580, 380) } },
      { name: '먼 장면', build: s => { s.draw(280, 420, 700, 420); s.draw(500, 420, 900, 410); s.draw(500, 420, 500, 440) } },
    ]
    const rows: { name: string; f: number | null; zmax: number; now: number; mm: number; tenth: number }[] = []
    for (const sc of scenes) {
      const s = session(W, H)
      sc.build(s)
      const an = s.app.lift.an
      const owned = s.app.doc.strokes.filter(x => x.own3)
      if (owned.length === 0) continue
      const devAt = (d: number) => Math.max(...owned.map(x => {
        const q = (v: number) => Math.round(v * d) / d
        return own3Deviation(an, { ...x, own3: {
          a: { x: q(x.own3!.a.x), y: q(x.own3!.a.y), z: q(x.own3!.a.z) },
          b: { x: q(x.own3!.b.x), y: q(x.own3!.b.y), z: q(x.own3!.b.z) }, axis: x.own3!.axis } })!
      }))
      rows.push({
        name: sc.name, f: an.f, now: Math.max(...owned.map(x => own3Deviation(an, x)!)),
        zmax: Math.max(...owned.flatMap(x => [Math.abs(x.own3!.a.z), Math.abs(x.own3!.b.z)])),
        mm: devAt(1000), tenth: devAt(10000),
      })
    }
    for (const r of rows) {
      console.log(`[27-3 ③] ${r.name.padEnd(6)} f ${(r.f ?? 0).toFixed(0).padStart(5)} · |z|max ${r.zmax.toFixed(1).padStart(6)} · 지금 ${r.now.toExponential(1)} · **1mm ${r.mm.toFixed(5)}** · 0.1mm ${r.tenth.toFixed(6)} (허용 ${OWN3_TOL_PX})`)
    }
    expect(rows.length, '스윕이 실제로 여러 구도를 덮는다').toBeGreaterThanOrEqual(4)
    // 지금은 전부 통과한다(안 깎으므로)
    for (const r of rows) expect(r.now, `${r.name} 지금`).toBeLessThanOrEqual(OWN3_TOL_PX)
    // **지시가 준 값(1mm)은 어떤 구도에서 깨진다** — 그것이 「안 깎는다」의 근거다
    expect(Math.max(...rows.map(r => r.mm)), '1mm 양자화는 어떤 구도에서 심판을 넘는다')
      .toBeGreaterThan(OWN3_TOL_PX)
    // 그리고 **0.1mm면 넷 다 안전하다** — 즉 「못 깎는다」가 아니라 「그 값으로는 못 깎는다」다.
    // 그래도 안 깎는 이유는 #75 ㉡의 둘째 절이다: **표가 안 지목한 자리는 안 건드린다.**
    // 크기의 몫은 `raw`가 73.6%이고(`filesize25_web2.components_utf8`), 이 회차의 게이트
    // 문서(옐로 100획)에는 `own3`가 **하나도 없다** — 얻을 것이 0인데 불변식만 건드린다.
    for (const r of rows) expect(r.tenth, `${r.name} 0.1mm`).toBeLessThan(OWN3_TOL_PX)
    // 그리고 게이트 문서에서 `own3`의 몫은 **무시할 수 있다**: 100획 중 굳힘은 카메라를
    // 세운 밑그림 둘뿐이고 나머지 100획은 옐로(2D)라 3D가 없다.
    const yellow = yellowDoc100()
    const ownCount = yellow.doc.strokes.filter(x => x.own3).length
    console.log(`[27-3 ③] 게이트 문서 — 획 ${yellow.doc.strokes.length} 중 own3 ${ownCount}`)
    expect(ownCount / yellow.doc.strokes.length, 'own3의 몫이 무시할 수 있다').toBeLessThan(0.05)
  })
})

describe('27-3 ④ 세대 손실 없음 — 저장 → 열기 → 저장 5회', () => {
  it('크기와 좌표가 더 이상 안 변한다 (+양성 대조: 한 번 더 솎으면 실제로 준다)', () => {
    const app = yellowDoc100()
    const sizes: number[] = [bytes(app)]
    let cur = app
    const gens: ReturnType<typeof createApp>[] = []
    for (let i = 0; i < 5; i++) {
      const json = serializeBrnl({ doc: cur.doc, nextId: cur.nextId })
      const back = parseBrnl(json)!
      const next = createApp(W, H)
      loadDoc(next, back)
      sizes.push(bytes(next))
      gens.push(next)
      cur = next
    }
    console.log(`[27-3 ④] 세대 바이트 ${sizes.join(' → ')}`)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBe(sizes[0])
    // 좌표까지 — **첫 복원부터** 마지막까지 raw가 완전히 같다.
    // ⚠ 비교의 시작이 «메모리의 생 문서»가 아니라 «첫 복원»이다: 저장이 0.1px로
    //   반올림하므로(AS-C92) 생 문서와 복원본은 한 번 갈리는 것이 **설계**다. 그것을
    //   세대 손실로 세면 «그리는 경로의 차»를 재는 것이 된다(#75 ㉢의 형태).
    const gen1 = gens[0]!.doc.strokes.map(s => s.raw?.map(p => [p.x, p.y]) ?? null)
    const gen5 = cur.doc.strokes.map(s => s.raw?.map(p => [p.x, p.y]) ?? null)
    expect(gen5).toEqual(gen1)
    // 양성 대조(#69 ㉣) — 「안 줄어든다」가 «척도가 0»이 아니라는 것.
    // ⚠ **같은 임계로 다시 솎으면 안 준다** — RDP는 그 임계에서 멱등이고, 그것이 곧
    //   「세대 손실이 없다」의 기전이다(임계를 못 박아 두면 두 번째 솎기가 할 일이 없다).
    //   그래서 양성 대조는 **더 넓은 임계**로 한다: 척도가 실제로 움직인다는 것을 보인다.
    const kept = app.doc.strokes.reduce((n, s) => n + (s.raw?.length ?? 0), 0)
    const same = app.doc.strokes.reduce((n, s) => n + (s.raw
      ? rdpIndices(s.raw, C.RAW_SIMPLIFY_WIDTH_RATIO * widthOfMat({ grade: 'HB' })).length : 0), 0)
    const wider = app.doc.strokes.reduce((n, s) => n + (s.raw ? rdpIndices(s.raw, 2).length : 0), 0)
    console.log(`[27-3 ④ 양성대조] 지금 마디 ${kept} · 같은 임계 ${same}(멱등) · 넓은 임계(2px) ${wider}`)
    expect(same, '같은 임계에서는 멱등 — 그것이 세대 손실 없음의 기전이다').toBe(kept)
    expect(wider, '척도가 실제로 움직인다').toBeLessThan(kept)
  })
})

describe('27-3 ⑤ 종이·트레이싱지 획은 단순화되지 않는다', () => {
  it('겹이 아닌 획과 트레이싱지 획은 raw가 통째로 남는다', () => {
    const s0 = session(W, H)
    s0.draw(280, 560, 700, 560)
    s0.draw(500, 560, 800, 480)
    const app = s0.app
    const pts = freehand(11)
    // 종이에 직접
    const onPaperStroke = commitStroke(app, pts[0]!, pts[pts.length - 1]!, pts)
    expect(onPaperStroke.raw!.length, '종이 획은 안 솎는다').toBe(pts.length)
    // 트레이싱지
    const tra = addLayer(app, 'tracing', { W, H })!
    setActiveLayer(app, tra.id)
    const onTracing = commitStroke(app, pts[0]!, pts[pts.length - 1]!, pts)
    expect(onTracing.raw!.length, '트레이싱지 획도 안 솎는다').toBe(pts.length)
    // 대조 — 옐로만 솎인다
    const yel = addLayer(app, 'yellow', { W, H })!
    setActiveLayer(app, yel.id)
    const onYellow = commitStroke(app, pts[0]!, pts[pts.length - 1]!, pts)
    expect(onYellow.raw!.length).toBeLessThan(pts.length)
    console.log(`[27-3 ⑤] 원본 ${pts.length} — 종이 ${onPaperStroke.raw!.length} · 트레이싱 ${onTracing.raw!.length} · 옐로 ${onYellow.raw!.length}`)

    const out = resolve(HERE, '../../stage0/out/filesize27_web2.json')
    mkdirSync(dirname(out), { recursive: true })
    const doc = yellowDoc100()
    writeFileSync(out, JSON.stringify({
      what: 'web2-27 3번 — 파일 크기. filesize27_measure.test.ts가 쓴다. 판정은 그 파일의 expect가 정본.',
      conditions: {
        fixture: '옐로 100획(프리핸드 241점 · rng32 결정론 · Math.random ⛔ #14) · 1200x800',
        command: 'npx vitest run test/filesize27_measure.test.ts',
        baseline: `지시가 든 「488KB」 = ${BASELINE_BYTES} B — web2-25 재생성 **전**의 yellowraw_web2 값이다`,
      },
      constants: {
        RAW_SIMPLIFY_PX: C.RAW_SIMPLIFY_PX,
        RAW_SIMPLIFY_WIDTH_RATIO: C.RAW_SIMPLIFY_WIDTH_RATIO,
        OWN3_TOL_PX,
      },
      flags_explained: {
        '세대 바이트가 완전 불변': '**설계 보장이다**(솎기는 커밋 시점 한 번 — 원칙 a). 임계를 안 건다: 「0」이 아니라 「같다」이고, 그것이 값을 재는지는 같은 팔의 **양성 대조**(한 번 더 솎으면 준다)가 낸다(#69 ㉣ · §5.1 유형 3).',
        '3D 좌표를 안 깎았다': '지시 1의 「3D 좌표: 소수 3자리」는 **불변식이 막았다** — 잉크 심판(OWN3_TOL_PX 0.01px). ③이 그 사실을 값으로 낸다(#75 ㉡: 깎기 전에 그 좌표에 걸린 불변식을 센다).',
      },
      size: { bytes_utf8: bytes(doc), baseline_bytes: BASELINE_BYTES, pct_of_baseline: bytes(doc) / BASELINE_BYTES * 100 },
      not_simplified: { paper: onPaperStroke.raw!.length, tracing: onTracing.raw!.length, yellow: onYellow.raw!.length, source: pts.length },
    }, null, 2))
  })
})
