// **web2-24 1부 원장** — 관통선 + 선따기 경로 재현. ⚠⚠ 재기만 한다(지시 문면 —
// 갈래 판정은 세션이 수로 한다. 이 파일의 단언은 하네스 유효성뿐이다).
//
// 왜 이 경로인가(지시 0절): 제도에서 창은 띄우지 않는다 — 벽의 좌우 수직에 **양 끝이
// 닿는** 인방선(위)·창대선(아래)을 긋고 그 사이에 수직 둘을 그은 뒤, 바깥 토막을
// 지운다(선따기). web2-21 1-a의 «떠 있는 창» 0/4는 정확하지만 그 픽스처가 실제 작도의
// 경로가 아니다 — 이 원장이 실제 경로를 잰다.
//
// 재는 것 넷(지시 1-b): ① 관통선 둘 3D ② 수직 둘 3D ③ 선따기 후 네 변 3D 유지(핵심 —
// 조각 own3 승계) ④ **개구부 면**: 벽 면이 창을 «구멍으로» 갖는가(1차 리뷰 [2] — 창
// 사각 자체의 면이 아니라 벽 면의 holes가 판정자다. 그것이 23이 필요로 하는 것이다).
//
// D-1(코드 표식 선행): eraseAt의 조각 own3 승계는 state.ts에 **이미 있다**(web2-13
// 4차 [46] — 부모 직선에 광선을 내려 조각 구간으로 자름). 그래서 ③은 «승계 유무»가
// 아니라 «승계 좌표가 옳은가»까지 잰다: 길이 비(ownSpanRatio)에 **기대값을 나란히**
// 내고(1차 [3] — 기대 = 수직 교점 사이의 3D 파라미터 구간), 구간의 **위치**는 조각
// 끝 3D ↔ 수직 끝 3D 거리로 잰다(1차 [4] — 길이만 맞고 자리가 밀리는 오배치를 가른다).
//
// #69 ㉣(반대 결과의 실증 — 같은 실행 안): ㉮ 떠 있는 창(21 재실행 — «안 선다» 가능)
// ㉯ 닿는 창(«선다» 가능) ㉰ **own3 끔 + 수직까지 지움**(1차 [5] — ③·④가 이 격자에서
// 실패«할 수 있음»을 실행으로 보인다: 승계 없이 근거를 지우면 조각이 대기로 떨어진다).
// #68: 손 오차 — 21과 같은 격자(시드 7종 × 위치 2 · ±3px rng32) · 실린 몫은 carriedJitter.
//
// 원장: stage0/out/passthru24_web2.json — 결정론(고정 시드·시간 없음): 전량 실행이
// 다시 써도 같은 바이트다(#71 ㉠ 유보가 안 걸린다 — opening21과 같은 형태).
//   정본 명령: npx vitest run test/passthru24_measure.test.ts

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { session, type Session } from './session'
import { beginErase, eraseAt, endErase, toggleFaceAt, setOwn3d } from '../src/app/state'
import { rng32 } from '../src/core/material'
import { C } from '../src/core/constants'
import { sub3, len3, dot3, type Pt, type V3 } from '../src/core/vec'

const W = 1200, H = 800
const outDir = resolve(__dirname, '../../stage0/out')
/** 선따기 국면의 확대 배율(#71 ㉠ — **실행 조건**: 지우개 반경은 화면 12px이고 문서
 *  반경은 12/s다. s=2로 지운다 = 실물 선따기의 «확대해서 딴다» 몸짓. 원반경 12로 지우면
 *  지터가 기울인 벽 윗변-인방 틈(최소 7px 실측)에서 이웃이 같이 지워졌다 — NOTES 1부). */
const ERASE_ZOOM_S = 2

/** vp0=(900,400)을 지나는 직선 위의 y — probe21과 같은 픽스처 산술 */
const vpY = (x: number, x0: number, y0: number): number =>
  400 + ((y0 - 400) / (x0 - 900)) * (x - 900)

/** 작도 완료 + 벽 사각 — **probe21의 wallScene에서 지평선 따라긋기 획 하나를 뺀 것**
 *  (1차 리뷰 [7] — «그대로»가 아니다). 그 획은 web2-17부터 퇴화(아무것도 선언하지
 *  않는다 — 지평선은 프레임 상수)인데, y=400에 실물 획으로 남아 ① 인방 오른 토막
 *  (y 392~396)을 지울 때 반경 안에서 같이 지워지고 ② 수직 위 끝이 인방 대신 그 획에
 *  스냅된다(표식 실측 — NOTES 1부). 유/무 두 판의 카메라·벽 대조는 **원장 fixture_probe
 *  블록**이 싣는다(1차 [8] — 원장 밖 측정 금지 #25). 지터×위치 격자는 21 그대로다. */
function wallScene(jit: () => number, withHorizonStroke = false) {
  const s = session(W, H)
  const j = (v: number) => v + jit()
  if (withHorizonStroke) s.draw(100, 400, 1100, 400)   // fixture_probe 전용(21의 원형)
  // ⚠ 21과 두 번째로 다른 자리: **지면 모서리 자체가 vp0 선언이다**(실제 작도의 형태 —
  // 방 실루엣의 후퇴선이 소실점을 만든다, web2-19 1부의 문면 그대로). 21처럼 짧은 vp0
  // 선언 획을 따로 긋고 그 위에 지면 모서리를 겹쳐 그으면 **공선 겹침의 T-마디**가
  // 지면 모서리를 두 조각으로 갈라, 벽 면의 외곽 루프에 같은 획의 인접 두 변(공선)이
  // 생기고 loopPoints가 교점을 못 내 면이 안 풀린다(표식 실측 — cornerOf 평행 거부.
  // NOTES 1부 · 낮은 지터 시드 0·51·77에서만 발화하던 것이 이것이다). 앱 코드는 그대로다.
  const wall: (ReturnType<Session['draw']>)[] = []
  wall.push(s.draw(j(500), j(500), j(800), j(vpY(800, 500, 500))))   // 지면 모서리 → vp0 선언 겸
  s.draw(500, 500, 400, 475)          // → vp1 (100,400) — 카메라 닫힘(벽 밖 짧은 깊이선)
  wall.push(s.draw(j(500), j(500), j(500), j(340)))                  // 왼 세로
  wall.push(s.draw(j(800), j(vpY(800, 500, 500)), j(800), j(vpY(800, 500, 340))))  // 오른 세로
  wall.push(s.draw(j(500), j(340), j(800), j(vpY(800, 500, 340))))   // 윗변 → vp0
  return { s, wall }
}

const mkRng = (seed: number) =>
  seed === 0 ? () => 0 : (() => { const r = rng32(seed); return () => (r() * 2 - 1) * 3 })()

/** 점 → 화면 선분 거리(하네스 전용 — 지우기 여유 실측) */
const dSeg = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

describe('web2-24 1부 — 관통선 + 선따기 (재기만 한다)', () => {
  it('인방·창대(벽 관통) + 수직 둘 + 바깥 토막 지우기 — 21 격자와 같은 시드×위치', () => {
    const seeds = [0, 7, 12, 33, 51, 77, 104]
    const positions = [
      { name: 'mid', xL: 580, xR: 700, yBot: 455, yTop: 385 },
      { name: 'low', xL: 570, xR: 680, yBot: 462, yTop: 412 },
    ]
    type SideM = {
      role: 'lintel' | 'sill' | 'v1' | 'v2'
      lifted: boolean
      why: string
      own3: boolean
      /** 조각 3D 길이 ÷ 부모 3D 길이(관통선 조각만) — expectedSpan과 나란히 읽는다 */
      ownSpanRatio: number | null
      /** 기대 구간(수직 두 교점 사이의 부모 파라미터 폭 — 지우기 전 실측) */
      expectedSpan: number | null
      /** 구간의 **위치**(1차 [4]): 조각 끝 3D ↔ 대응 수직 끝 3D 거리의 최댓값(3D 단위) */
      endGap3d: number | null
    }
    type Cell = {
      seed: number; jitter: 'none' | 'rng32'; pos: string
      wallLifted: number
      /** 관통선 시작점의 실린 지터(#68 — 명목 (500,y) 대비. x는 벽 세로 오스냅이 되돌리므로
       *  y 몫이 실효다 — 1차 [12]) */
      carriedJitter: { sill: { dx: number; dy: number }; lintel: { dx: number; dy: number } }
      preErase: { lintel: boolean; sill: boolean; v1: boolean; v2: boolean }
      /** 지우기 네 점 각각에서 **표적 아닌** 획까지의 최소 화면 거리(px) — 부수 삭제 여유
       *  (1차 [11]). 실효 지우개 반경(12/ERASE_ZOOM_S)보다 커야 깨끗한 지우기다. */
      eraseClearancePx: number
      strokeCount: { before: number; after: number }
      postErase: SideM[]
      /** ④ 개구부: **벽 면**(창 밖 벽 위 점)이 창을 구멍으로 갖는가(1차 [2]) */
      wallFace: { result: string; outer: number | null; holes: number | null; holeEdges: number[] }
    }

    const cells: Cell[] = []
    const runCell = (seed: number, pos: (typeof positions)[number], own3dOn: boolean) => {
      const rng = mkRng(seed)
      const j = (v: number) => v + rng()
      const { s, wall } = wallScene(rng)
      if (!own3dOn) setOwn3d(s.app, false)   // 반증 칸(㉰)만 — 본 스윕은 기본(켜짐)이다
      expect(wall.every(w => w !== null), `벽 획 확정(seed ${seed}·${pos.name})`).toBe(true)
      const wallLifted = wall.filter(w => w && s.app.lift.lifted.has(w.id)).length

      const sill = s.draw(j(500), j(pos.yBot), j(800), j(vpY(800, 500, pos.yBot)))
      const lintel = s.draw(j(500), j(pos.yTop), j(800), j(vpY(800, 500, pos.yTop)))
      expect(sill !== null && lintel !== null, `관통선 확정(seed ${seed}·${pos.name})`).toBe(true)
      const yAt = (st: { a: Pt; b: Pt }, x: number): number =>
        st.a.y + (x - st.a.x) * (st.b.y - st.a.y) / (st.b.x - st.a.x)
      const v1 = s.draw(j(pos.xL), j(yAt(sill!, pos.xL)), j(pos.xL), j(yAt(lintel!, pos.xL)))
      const v2 = s.draw(j(pos.xR), j(yAt(sill!, pos.xR)), j(pos.xR), j(yAt(lintel!, pos.xR)))
      expect(v1 !== null && v2 !== null, `수직 확정(seed ${seed}·${pos.name})`).toBe(true)

      const preErase = {
        lintel: s.app.lift.lifted.has(lintel!.id),
        sill: s.app.lift.lifted.has(sill!.id),
        v1: s.app.lift.lifted.has(v1!.id),
        v2: s.app.lift.lifted.has(v2!.id),
      }
      // 기대 구간·기대 끝 3D — **지우기 전** 승격 기하에서(수직의 두 끝은 관통선 위 점이다)
      const seg3 = (id: number) => s.app.lift.lifted.get(id) ?? null
      const spanOf = (parentId: number, e1: V3 | undefined, e2: V3 | undefined): number | null => {
        const g = seg3(parentId)
        if (!g || !e1 || !e2) return null
        const d = sub3(g.b3, g.a3); const L2 = dot3(d, d)
        if (L2 < 1e-18) return null
        const t1 = dot3(sub3(e1, g.a3), d) / L2
        const t2 = dot3(sub3(e2, g.a3), d) / L2
        return Math.abs(t2 - t1)
      }
      // v1·v2의 «아래 끝»은 창대 위, «위 끝»은 인방 위(그리기 순서 — 아래→위)
      const v1g = seg3(v1!.id), v2g = seg3(v2!.id)
      const expected = {
        sill: spanOf(sill!.id, v1g?.a3, v2g?.a3),
        lintel: spanOf(lintel!.id, v1g?.b3, v2g?.b3),
      }
      const parentLen = {
        sill: seg3(sill!.id) ? len3(sub3(seg3(sill!.id)!.b3, seg3(sill!.id)!.a3)) : null,
        lintel: seg3(lintel!.id) ? len3(sub3(seg3(lintel!.id)!.b3, seg3(lintel!.id)!.a3)) : null,
      }

      // ④ 바깥 토막 넷 — 확대해서 딴다(ERASE_ZOOM_S — 파일 머리 상수·원장 run.conditions)
      const idsBefore = new Set(s.app.doc.strokes.map(x => x.id))
      const nBefore = s.app.doc.strokes.length
      const eraseOnce = (x: number, y: number) => {
        beginErase(s.app); eraseAt(s.app, { x, y }); endErase(s.app)
      }
      // 지우기 여유(1차 [11]) — 각 지우기 점에서 표적(그 관통선) 아닌 획까지 최소 거리.
      // ⚠ 네 점 전부 **지우기 전에** 잰다 — 지우면 표적이 새 id의 조각이 되어 «표적 제외»가
      // 깨진다(초판이 0px를 낸 원인 — 계측 버그였다).
      let clearance = Infinity
      const erasePts: { p: Pt; id: number }[] = []
      for (const st of [sill!, lintel!]) {
        const xLm = (500 + pos.xL) / 2, xRm = (pos.xR + 800) / 2
        for (const xm of [xLm, xRm]) erasePts.push({ p: { x: xm, y: yAt(st, xm) }, id: st.id })
      }
      for (const { p, id } of erasePts) {
        for (const st of s.app.doc.strokes) {
          if (st.id === id) continue
          clearance = Math.min(clearance, dSeg(p, st.a, st.b))
        }
      }
      s.app.view = { s: ERASE_ZOOM_S, ox: 0, oy: 0 }
      for (const { p } of erasePts) eraseOnce(p.x, p.y)
      // 반증 칸(㉰)은 수직 둘까지 지운다 — 조각의 연결 근거가 사라진다
      if (!own3dOn) {
        for (const v of [v1!, v2!]) {
          const mx = (v.a.x + v.b.x) / 2, my = (v.a.y + v.b.y) / 2
          eraseOnce(mx, my)
        }
      }
      s.app.view = { s: 1, ox: 0, oy: 0 }
      const nAfter = s.app.doc.strokes.length

      const newStrokes = s.app.doc.strokes.filter(x => !idsBefore.has(x.id))
      const midOf = (parentAxisY: number) =>
        newStrokes.find(x => {
          const cx = (x.a.x + x.b.x) / 2, cy = (x.a.y + x.b.y) / 2
          return cx > pos.xL - 20 && cx < pos.xR + 20 && Math.abs(cy - vpY(cx, 500, parentAxisY)) < 20
        })
      const sillMid = midOf(pos.yBot), lintelMid = midOf(pos.yTop)
      const sideM = (role: SideM['role'], st: { id: number; own3?: unknown } | undefined,
        parent: number | null, exp: number | null, ends: (V3 | undefined)[]): SideM => {
        if (!st) return { role, lifted: false, why: 'gone', own3: false, ownSpanRatio: null, expectedSpan: exp, endGap3d: null }
        const lifted = s.app.lift.lifted.has(st.id)
        const why = s.app.lift.waitWhy.get(st.id) ?? (lifted ? 'lifted' : 'none')
        const o3 = (st as { own3?: { a: V3; b: V3 } }).own3
        let ratio: number | null = null, endGap: number | null = null
        const g = s.app.lift.lifted.get(st.id)
        if (g && parent) {
          ratio = Math.round((len3(sub3(g.b3, g.a3)) / parent) * 1000) / 1000
          // 구간의 위치(1차 [4]) — 조각의 두 끝이 수직의 대응 끝과 같은 3D 점인가
          const [e1, e2] = ends
          if (e1 && e2) {
            const d1 = Math.min(len3(sub3(g.a3, e1)), len3(sub3(g.a3, e2)))
            const d2 = Math.min(len3(sub3(g.b3, e1)), len3(sub3(g.b3, e2)))
            endGap = Math.max(d1, d2)
          }
        }
        // endGap3d는 날값(반올림 없음) — 1e-12 대역이 나와야 정상이고 그 해명은 flags_explained
        return { role, lifted, why, own3: !!o3, ownSpanRatio: ratio, expectedSpan: exp === null ? null : Math.round(exp * 1000) / 1000, endGap3d: endGap }
      }
      const postErase = [
        sideM('lintel', lintelMid, parentLen.lintel, expected.lintel, [v1g?.b3, v2g?.b3]),
        sideM('sill', sillMid, parentLen.sill, expected.sill, [v1g?.a3, v2g?.a3]),
        sideM('v1', v1!, null, null, []),
        sideM('v2', v2!, null, null, []),
      ]

      // ④ 개구부 — **벽 위·창 밖** 점에 면을 지정한다: 벽 면이 창을 구멍으로 가져야 한다
      const wx = (500 + pos.xL) / 2
      const wy = (vpY(wx, 500, 340) + vpY(wx, 500, 500)) / 2
      const faceResult = toggleFaceAt(s.app, { x: wx, y: wy })
      const face = faceResult === 'added' ? s.app.faces[s.app.faces.length - 1]! : null
      return {
        seed, jitter: seed === 0 ? 'none' as const : 'rng32' as const, pos: pos.name,
        wallLifted,
        carriedJitter: {
          sill: { dx: Math.round((sill!.a.x - 500) * 100) / 100, dy: Math.round((sill!.a.y - pos.yBot) * 100) / 100 },
          lintel: { dx: Math.round((lintel!.a.x - 500) * 100) / 100, dy: Math.round((lintel!.a.y - pos.yTop) * 100) / 100 },
        },
        preErase,
        eraseClearancePx: Math.round(clearance * 10) / 10,
        strokeCount: { before: nBefore, after: nAfter },
        postErase,
        wallFace: {
          result: faceResult,
          outer: face ? face.outer.length : null,
          holes: face ? face.holes.length : null,
          holeEdges: face ? face.holes.map(h => h.length) : [],
        },
      }
    }
    for (const pos of positions) for (const seed of seeds) cells.push(runCell(seed, pos, true))

    // ── 대조(#69 ㉣ — 반대 결과의 실증. 21의 두 극단을 **두 위치 × 시드 [0,7]**로 재실행
    // (1차 [10] — low 포함·시드 기록) + ㉰ 반증 칸(1차 [5]) ──
    type Ctl = { name: string; seed: number; jitter: string; winLifted: number; face: string }
    const controls: Ctl[] = []
    for (const pos of positions) {
      for (const seed of [0, 7]) {
        for (const touch of [false, true]) {
          const rng = mkRng(seed)
          const j = (v: number) => v + rng()
          const { s } = wallScene(rng)
          const xL = touch ? 500 : pos.xL
          const win = [
            s.draw(j(xL), j(pos.yBot), j(pos.xR), j(vpY(pos.xR, xL, pos.yBot))),
            s.draw(j(xL), j(pos.yBot), j(xL), j(pos.yTop)),
            s.draw(j(pos.xR), j(vpY(pos.xR, xL, pos.yBot)), j(pos.xR), j(vpY(pos.xR, xL, pos.yTop))),
            s.draw(j(xL), j(pos.yTop), j(pos.xR), j(vpY(pos.xR, xL, pos.yTop))),
          ]
          const winLifted = win.filter(w => w && s.app.lift.lifted.has(w.id)).length
          const cx = (xL + pos.xR) / 2
          const cy = (vpY(cx, xL, pos.yBot) + vpY(cx, xL, pos.yTop)) / 2
          controls.push({
            name: `${touch ? 'touching' : 'floating'}-${pos.name}`, seed,
            jitter: seed === 0 ? 'none' : 'rng32',
            winLifted, face: toggleFaceAt(s.app, { x: cx, y: cy }),
          })
        }
      }
    }
    // ㉰ 반증 칸 — own3 끔 + 수직까지 지움: ③(유지)·④(면)가 실패할 수 있는 격자임을 실행으로
    const refute = runCell(0, positions[0]!, false)

    // ── fixture_probe(1차 [8] — #25): 지평선 따라긋기 획 유/무의 카메라·벽 대조 ──
    const probeOf = (withH: boolean) => {
      const { s, wall } = wallScene(() => 0, withH)
      const an = s.app.lift.an
      return {
        f: an.f, vp0: an.vps[0] ?? null, vp1: an.vps[1] ?? null,
        wallLifted: wall.filter(w => w && s.app.lift.lifted.has(w.id)).length,
      }
    }
    const fixtureProbe = { with_horizon_stroke: probeOf(true), without: probeOf(false) }

    // ── 집계 ──
    const agg = {
      cells: cells.length,
      pre_lintel_sill: cells.filter(c => c.preErase.lintel && c.preErase.sill).length,
      pre_verticals: cells.filter(c => c.preErase.v1 && c.preErase.v2).length,
      post_all4: cells.filter(c => c.postErase.every(p => p.lifted)).length,
      wallface_with_hole: cells.filter(c => c.wallFace.result === 'added' && c.wallFace.holes === 1).length,
      spanRatios: [...new Set(cells.flatMap(c => c.postErase.filter(p => p.ownSpanRatio !== null).map(p => p.ownSpanRatio)))].sort(),
      expectedSpans: [...new Set(cells.flatMap(c => c.postErase.filter(p => p.expectedSpan !== null).map(p => p.expectedSpan)))].sort(),
      endGap3dMax: Math.max(...cells.flatMap(c => c.postErase.filter(p => p.endGap3d !== null).map(p => p.endGap3d!))),
      eraseClearanceMinPx: Math.min(...cells.map(c => c.eraseClearancePx)),
    }

    const ledger = {
      run: {
        note: 'web2-24 1부 — 관통선+선따기 경로에서 창 네 변과 개구부(벽 면의 구멍)가 서는가. '
          + '재기만 한다(갈래 판정은 세션 — 지시 1-c). 정본 명령: npx vitest run test/passthru24_measure.test.ts',
        date: '2026-08-28',
        fixture: '벽=probe21 wallScene에서 **지평선 따라긋기 획 하나를 뺀 것**(빼는 근거·유무 대조는 '
          + 'fixture_probe — 그 획은 y=400의 퇴화 획이라 인방 오른 토막 지우기에 같이 지워지고 수직 '
          + '끝 스냅을 가로챘다) · 인방·창대=벽 좌우 수직에 양 끝 닿는 vp0 선 · 수직 둘=관통선 사이 '
          + '(겨눔은 명목이 아니라 **확정된 관통선의 실제 자리** — 사람은 보이는 선을 겨눈다) · '
          + '지우기=바깥 토막 넷(각 토막 중앙·실제 선 위) · 지터 ±3px(rng32) × 21과 같은 시드 7종 × 위치 2',
        conditions: {
          erase_zoom_view_s: ERASE_ZOOM_S,
          eraser_screen_px: C.ERASER_PX,
          eraser_doc_px_effective: C.ERASER_PX / ERASE_ZOOM_S,
          note: '#71 ㉠ — 실행 조건이 값의 절반이다: 선따기는 view.s=2로 확대해서 지운다(실물의 '
            + '몸짓 — 문서 실효 반경 6px). 원반경(문서 12px)로 지우면 지터가 기울인 벽 윗변-인방 '
            + '틈에서 이웃이 같이 지워졌다(부수 삭제 여유는 cells[*].eraseClearancePx가 실측).',
        },
        strokes_of_scene: {
          construction_vp1: 1, wall: 4, passthrough: 2, verticals: 2, total_before: 9,
          note: '1차 [9] — before의 구성. 21의 11과 다른 둘: ① 지평선 따라긋기 획을 뺐다'
            + '(fixture_probe) ② vp0 선언 획을 따로 안 긋는다 — 지면 모서리가 선언을 겸한다'
            + '(공선 겹침 T-마디가 벽 면 외곽을 갈라 면이 안 풀리는 발판 오염 — run.fixture ⚠)',
        },
        determinism: '결정론(고정 시드·시간 필드 없음) — 전량 실행이 다시 써도 같은 바이트(#71 ㉠ 유보 밖)',
        constants: { OSNAP_RADIUS_PX: C.OSNAP_RADIUS_PX, ERASER_PX: C.ERASER_PX, MERGE_RATIO: C.MERGE_RATIO },
      },
      gate: {
        for: 'web2-23 은선 — 0부 게이트(재판정 — 픽스처를 실제 작도 경로로 바꿔 21의 opening21 게이트를 대체한다)',
        verdict: 'VERDICT_PLACEHOLDER',
        replaces: '⚠ opening21_web2.json의 등록 기준(winLifted>0 — 떠 있는 창)은 **여전히 미충족**이다'
          + '(이 실행의 controls floating-* 전 칸 0/4가 그 재확인). 이 게이트는 기준을 낮춘 것이 아니라 '
          + '**픽스처를 실제 작도의 경로(관통선+선따기)로 바꾼 것**이다 — 근거는 지시 0절·DECISIONS web2-24 절. '
          + '떠 있는 고리는 알려진 한계로 DEFERRED에 남는다(1차 [16])',
        registered: {
          pass_needs: '갈래 ㉠ = 재는 것 넷 전부: preErase 4변 · postErase 4변 · 벽 면 개구부(holes=1) — 전 칸',
        },
        reachability_value: 4,
        reachability_source: '/controls의 touching-* winLifted=4(승격 도달) · 실패 가능성 셋: floating-* 0/4'
          + '(«안 선다») · /refute_no_own3d(③ 유지·④ 면이 실패하는 실행 — own3 끔+수직 지움에서 조각이 '
          + '대기로 떨어진다) — 등록 기준의 세 항 각각에 반대 결과가 이 실행 안에 있다(1차 [5][6] · #69 ㉣)',
      },
      aggregate: agg,
      cells,
      controls,
      refute_no_own3d: refute,
      fixture_probe: fixtureProbe,
      flags_explained: {
        '값이 전 칸 동일이면': '동일이 곧 결론이다(경로의 결정 거동) — 변별력은 controls·refute가 진다',
        'constants/metric_defs 스냅샷 없음': 'web2 라인 원장은 상수 스냅샷 등록부 밖(공통 형태 — opening21과 같다)',
        'selfcheck 「게이트에 reachability가 없다」': '산문 키 대신 reachability_value/source 짝으로 실었다 — '
          + 'opening21_web2.json의 게이트와 같은 형식·같은 플래그(공통 형태·해명 규약)다',
        'ownSpanRatio ≈ 0.19~0.27': '**기대값과 일치한다** — expectedSpan(수직 두 교점 사이의 부모 3D 파라미터 '
          + '구간, 지우기 전 실측)이 나란히 있고 두 값이 칸마다 같다. 화면 x 비율(120/300=0.4)이 아니라 '
          + '**3D 구간**이 기준이다: vp0로 수렴하는 선에서 화면 등간격은 3D에서 원근 압축돼 mid ≈0.25·low '
          + '≈0.19~0.21이 옳은 값이다. 초판의 «0.3~0.5 대역» 산문은 이 산술을 안 거친 틀린 기대였다(1차 [3]) — '
          + '구간의 **위치**는 endGap3d(조각 끝 ↔ 수직 끝 3D 거리, 전 칸 ~0)가 가른다(1차 [4])',
        'lintel과 sill의 spanRatio가 칸 안에서 같은 것': '구성상 귀결이다 — 같은 vp로 수렴하는 두 선을 같은 '
          + 'x의 수직 둘이 자르면 파라미터 구간이 사영 기하적으로 같다(수직이 정확히 수직일 때). '
          + '실린 손 오차는 carriedJitter(관통선 시작 y)와 expectedSpan의 칸별 흔들림이 보인다',
        'endGap3d가 1e-12 대역(또는 0)': '설계 보장이 아니라 **두 독립 계산의 잔차**다 — 한쪽은 지우기 전 '
          + '3D 교차 분할점(intersections3), 다른쪽은 조각 own3 승계(화면 끝점 광선을 부모 직선에 재사영 — '
          + 'closestOnLineToRay)로 얻은 승격 끝점. 같은 값이 나오는 것이 «구간 위치가 옳다»의 내용이고 '
          + '부동소수 왕복이라 1e-12 대역이 정상이다. 임계를 안 건다(자기참조 유형 3의 규약 — 값으로만 남긴다)',
        'refute_no_own3d의 0들(seed·carriedJitter·holes)': '반증 칸은 무오차 판(seed 0 — jitter none)이라 '
          + 'carriedJitter가 구성상 0이고, holes 0이 곧 반증의 결론(개구부가 안 선다)이다',
        'touching 대조의 face=none': '이 대조는 승격 도달성(#69 ㉣) 판정용이다. 면이 안 서는 이유는 '
          + '표식으로 확인했다(loopAt=null — NOTES 1부): 창 왼 변이 벽 세로와 **같은 선 위**(공선 겹침)라 '
          + '3D 교차 마디가 없어 루프 그래프가 안 닫힌다. 관통선 경로는 수직이 벽 안쪽이라 이 국면을 '
          + '안 만든다(본 스윕 wallface_with_hole이 그 증거) — 공선 겹침의 면은 알려진 한계로 DEFERRED',
      },
    }
    let verdictOk = agg.pre_lintel_sill === agg.cells && agg.pre_verticals === agg.cells
      && agg.post_all4 === agg.cells && agg.wallface_with_hole === agg.cells
    ledger.gate.verdict = verdictOk
      ? '통과 — 갈래 ㉠(관통선 경로에서 재는 것 넷 전부 전 칸 성립 — ④는 벽 면 holes=1로 판정)'
      : `미통과 후보 — pre(관통 ${agg.pre_lintel_sill}·수직 ${agg.pre_verticals})/`
      + `post ${agg.post_all4}/개구부 ${agg.wallface_with_hole} of ${agg.cells} — 갈래는 세션 판정`
    mkdirSync(outDir, { recursive: true })
    writeFileSync(resolve(outDir, 'passthru24_web2.json'), JSON.stringify(ledger, null, 2))
    console.log(`[측정] passthru24 — pre관통 ${agg.pre_lintel_sill}/${agg.cells} · pre수직 ${agg.pre_verticals}/${agg.cells}`
      + ` · post4변 ${agg.post_all4}/${agg.cells} · 벽면구멍 ${agg.wallface_with_hole}/${agg.cells}`
      + ` · span(실측/기대) ${agg.spanRatios.join(',')} / ${agg.expectedSpans.join(',')}`
      + ` · endGap3dMax ${agg.endGap3dMax} · 지우기여유min ${agg.eraseClearanceMinPx}px`
      + ` · 대조 ${controls.map(c => `${c.name}#${c.seed}:${c.winLifted}`).join(' ')}`
      + ` · 반증㉰ post ${refute.postErase.filter(p => p.lifted).length}/4·면 ${refute.wallFace.result}`)

    // ── 판정선(하네스 유효성만 — 본 스윕은 데이터. #26: 측정 전 등록한 문장 그대로) ──
    for (const c of cells) expect(c.wallLifted, `벽 4획(seed ${c.seed}·${c.pos})`).toBe(4)
    // #69 ㉣ — 반대 결과의 실증 셋(등록 기준의 세 항 각각)
    for (const c of controls.filter(x => x.name.startsWith('floating'))) {
      expect(c.winLifted, `떠 있는 창은 안 올라간다(${c.name}#${c.seed} — 21 결론 재확인)`).toBe(0)
    }
    for (const c of controls.filter(x => x.name.startsWith('touching'))) {
      expect(c.winLifted, `닿는 창은 올라간다(${c.name}#${c.seed} — 21 결론 재확인)`).toBe(4)
    }
    expect(refute.postErase.filter(p => p.lifted).length, '반증 ㉰ — own3 없이 근거를 지우면 조각이 떨어진다(③이 실패할 수 있는 격자)').toBeLessThan(4)
    // 벽 면 자체는 경계가 멀쩡하니 선다 — 실패하는 것은 **구멍**(개구부)이다: holes ≠ 1
    expect(refute.wallFace.holes ?? 0, '반증 ㉰ — 그때 벽 면에 개구부가 없다(④의 실패 가능성)').not.toBe(1)
    // 지우기 회계 — 관통선 하나당 «원본 제거 + 가운데 조각 추가»라 획 수 불변.
    // 수가 늘거나 줄면 부수 삭제다 — 초판이 이것으로 지평선 획 동반 삭제를 잡았다(NOTES).
    for (const c of cells) {
      expect(c.strokeCount.after, `지우기 회계(seed ${c.seed}·${c.pos})`).toBe(c.strokeCount.before)
    }
    // 지우기 여유 — 실효 반경보다 커야 부수 삭제가 없다(위 회계와 짝)
    expect(agg.eraseClearanceMinPx).toBeGreaterThan(C.ERASER_PX / ERASE_ZOOM_S)
    // 지평선 획 유/무 — 카메라·벽 동일(원장 fixture_probe가 값 — 1차 [8])
    expect(fixtureProbe.with_horizon_stroke.f).toBe(fixtureProbe.without.f)
    // 좌표만 대조 — strokeId는 획 수가 다르니 당연히 민다(선언 획이 몇 번째냐일 뿐)
    const xy = (v: { x: number; y: number } | null) => v ? { x: v.x, y: v.y } : null
    expect(xy(fixtureProbe.with_horizon_stroke.vp0)).toEqual(xy(fixtureProbe.without.vp0))
    expect(fixtureProbe.with_horizon_stroke.wallLifted).toBe(fixtureProbe.without.wallLifted)
  })
})
