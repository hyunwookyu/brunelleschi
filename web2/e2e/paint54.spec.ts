// web2-54 §2 — **칠의 자리**. 사용자 판정 둘이 근거다:
//   「내가 칠하려는 면과 상관없이 다른 면도 의도치않게 자꾸 같이 칠해진다」
//   「면 정면으로 날아가는 버튼이 있어야 하고, 특정 면만 선택해서 칠할 수 있어야 한다」
//
// 재는 것(지시 게이트 그대로 · D-3 반증 포함):
//   ① D-2 재현 + D-3 반증 — 판정(paintOwnGate)을 끄면 옛 거동(한 붓이 여러 면에
//      얹힘)이 실제로 돌아온다. 그 «몇 개의 면»이 착수 전 상태의 값이다(재현 보고).
//   ② 고름 없음 — 세 면을 가로지르는 붓이 «시작한 면»에만 남고 나머지 둘은 0
//      (문서 획 수와 픽셀 둘 다 — 픽셀은 각 면 안 상자의 어두운 잉크 증가분)
//   ③ 고름 하나 — 획이 그 면 밖으로 나가면 밖은 0
//   ④ 고름 둘 — 두 면에 걸친 획이 둘 다에 남고 셋째 면은 0 (**연속해서 칠하기**)
//      + 고름은 도구를 바꿔도 산다(핀셋(꾹 누름)으로 고르고 칠 도구를 들었다)
//   ⑤ 정면 — 누른 뒤 그 면의 법선이 카메라 축과 평행(값) · 다시 누르면 직전 포즈 복귀(값)
//   ⑥ 34-0 몫(#96) — 새 손잡이(btn-paint-front)의 툴팁이 «쓸 수 있는 상태에서» 뜬다 ·
//      막힌 상태는 이유를 말한다 · 통이 화면 안이다(34-6 자리)
//
// 저장 필드는 늘지 않는다(faceSel은 세션 상태) — KEY_ORDER 무변은 test/roundtrip43 게이트
// ②가 지킨다(이 파일은 그 무변을 «다시» 재지 않는다 — 판정자는 하나 #54).
//
// 원장: stage0/out/paint54_web2_dpr{1,2}.json (LEDGER=1 — #90 · 병합-쓰기 #99)

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT: Record<string, unknown> = {
  what: 'web2-54 §2 — 칠의 자리: 주인 면(시작한 면)·고름 집합·정면 왕복의 실측',
  note_92: '판정자는 «면별 문서 획 수»와 «면 안 상자의 어두운 픽셀 증가분»이다 — 「필터를 달았다」는 이름표라 안 센다',
  note_d3: 'D-3 — paintOwnGate 스위치가 반증이다: 끄면 옛 거동(여러 면 동시 칠)이 같은 장면·같은 붓에서 실제로 돌아온다(①이 그 값을 낸다)',
}

// #99의 근본 수리 그대로(paint50의 그 블록) — 팔마다 병합-쓰기 + 읽기 실패 시 안 쓰기
const LEDGER_OF = (projectName: string) =>
  resolve(HERE, `../../stage0/out/paint54_web2_dpr${projectName === 'dpr2' ? 2 : 1}.json`)
test.afterEach(async ({}, info) => {
  const f = LEDGER_OF(info.project.name)
  let prev: Record<string, unknown> = {}
  let readFailed = false
  try { prev = JSON.parse(readFileSync(f, 'utf8')) } catch { readFailed = true }
  if (readFailed) {
    try { if (readFileSync(f, 'utf8').length > 0) return } catch { /* 진짜 첫 실행 */ }
  }
  mkdirSync(resolve(HERE, '../../stage0/out'), { recursive: true })
  writeFileSync(f, JSON.stringify({ ...prev, ...OUT }, null, 2))
})

async function drawLine(page: Page, x0: number, y0: number, x1: number, y1: number) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 })
  await page.mouse.move(x1, y1, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** 꾹 누름(잡기 = 고르기) — grip44의 holdAt 그대로(#88: 시간은 앱에서 읽는다) */
async function holdAt(page: Page, x: number, y: number) {
  const ms = await page.evaluate(() => (window as any).__b2.app.writeHoldMs as number)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms + 300)
  await page.mouse.up()
  await page.waitForTimeout(60)
}

/** **면 셋이 붙은 장면**(paint45 room + 벽 샛기둥) — 바닥 + 벽 두 판.
 *  바닥 (500,500)(600,475)(500,460)(400,475) · 벽 (500,500)(600,475)(600,385)(500,380)을
 *  세로선(550,487→550,383)으로 갈라 판 둘. **이음매를 가진 인접면**이 사용자 불만의 그
 *  장면이다(「다른 면도 의도치않게 같이 칠해진다」 — 붓이 이음매를 넘는 순간).
 *  ⚠ 왼벽(근처 모서리에 세우는 판)은 못 쓴다 — 화면에서 바닥을 통째로 가린다(faceAt의
 *  앞면 판정이 맞게 작동한 결과 — 초판이 실측으로 확인했다). */
async function room3(page: Page) {
  await page.goto('/?reset')
  await page.waitForFunction(() => !!(window as never as { __b2?: unknown }).__b2)
  await drawLine(page, 100, 400, 1100, 400)
  await drawLine(page, 500, 500, 600, 475)
  await drawLine(page, 500, 500, 400, 475)
  await drawLine(page, 600, 475, 500, 460)
  await drawLine(page, 400, 475, 500, 460)
  await drawLine(page, 500, 500, 500, 380)
  await drawLine(page, 600, 475, 600, 385)
  await drawLine(page, 600, 385, 500, 380)
  await drawLine(page, 550, 487, 550, 383)                          // 샛기둥 — 벽을 판 둘로
  await page.click('#btn-face')
  await page.mouse.click(468, 478); await page.waitForTimeout(60)   // 바닥(벽보다 먼저 — 가림)
  await page.mouse.click(525, 430); await page.waitForTimeout(60)   // 벽 왼판
  await page.mouse.click(575, 430); await page.waitForTimeout(60)   // 벽 오른판
  const n = await page.evaluate(() => (window as any).__b2.app.faces.length)
  expect(n, '면 셋이 섰다').toBe(3)
  await page.click('#btn-pencil'); await page.click('#btn-pencil')  // 도구 연필 · 통 접기
}

/** 각 영역의 면 id — 그 자리에 아주 짧은 칠을 얹어 paint.f를 읽는다(주인 면 판정과
 *  같은 함수 frontFaceAt이 답한다 — 판정자는 하나 #54). 표본 획은 그대로 남되, 게이트는
 *  전부 «이후에 더해진 획»만 세므로 안 섞인다. */
async function probeFaceIds(page: Page): Promise<{ floor: number; wallA: number; wallB: number }> {
  await page.click('#btn-paint')
  const probe = async (x: number, y: number) => {
    await drawLine(page, x, y, x + 6, y + 2)
    return page.evaluate(() => {
      const ss = (window as any).__b2.app.doc.strokes
      const last = ss[ss.length - 1]
      return last?.paint?.f as number
    })
  }
  const floor = await probe(470, 480)
  const wallA = await probe(520, 415)
  const wallB = await probe(580, 415)
  expect(new Set([floor, wallA, wallB]).size, '세 영역이 세 면이다').toBe(3)
  return { floor, wallA, wallB }
}

/** 이 id 집합 «이후»에 더해진 칠 획의 면별 수 */
const paintByFaceSince = (page: Page, sinceCount: number) =>
  page.evaluate((n0) => {
    const ss = (window as any).__b2.app.doc.strokes
    const out: Record<number, number> = {}
    for (const s of ss.slice(n0)) if (s.paint) out[s.paint.f] = (out[s.paint.f] ?? 0) + 1
    return out
  }, sinceCount)

const strokeCount = (page: Page) => page.evaluate(() => (window as any).__b2.app.doc.strokes.length)

/** #gl 상자 안 «어두운 잉크» 수 — paint45의 glDark 그대로(칠은 #gl의 면 텍스처다 · web2-50) */
const glDark = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(([x0, y0, ww, hh]) => {
    const src = document.getElementById('gl') as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const t = document.createElement('canvas')
    t.width = Math.max(1, Math.round(ww! * dpr))
    t.height = Math.max(1, Math.round(hh! * dpr))
    const g = t.getContext('2d')!
    g.drawImage(src, Math.round(x0! * dpr), Math.round(y0! * dpr), t.width, t.height, 0, 0, t.width, t.height)
    const d = g.getImageData(0, 0, t.width, t.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3]! / 255
      if (a < 0.06) continue
      const lum = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) * a + 255 * (1 - a)
      if (lum < 200) n++
    }
    return n
  }, [x, y, w, h])

// 각 면 안(경계·표본 획에서 떨어진) 픽셀 상자 — 가로지르는 붓의 경로 위에 있다
const BOX = {
  floor: [442, 466, 20, 10] as const,
  wallA: [512, 438, 22, 16] as const,
  wallB: [566, 428, 22, 16] as const,
}

/** 세 면을 가로지르는 한 붓 — **바닥에서 «시작»**해 벽 왼판 → 이음매 → 벽 오른판으로 */
async function strokeAcross(page: Page) {
  await page.mouse.move(435, 470)
  await page.mouse.down()
  await page.mouse.move(470, 468, { steps: 5 })
  await page.mouse.move(520, 448, { steps: 6 })
  await page.mouse.move(575, 432, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}

test('① D-2 재현 + D-3 반증 — 판정을 끄면 한 붓이 여러 면에 얹힌다(옛 거동 · 그 «면 수»가 착수 전 값)', async ({ page }) => {
  await room3(page)
  const ids = await probeFaceIds(page)
  await page.evaluate(() => { (window as any).__b2.app.paintOwnGate = false })
  const n0 = await strokeCount(page)
  await strokeAcross(page)
  const by = await paintByFaceSince(page, n0)
  const facesPainted = Object.keys(by).length
  OUT.repro_gate_off = {
    def: 'D-2 재현: paintOwnGate=false(옛 거동)에서 세 면을 가로지르는 한 붓이 몇 개의 면에 획을 남기는가 — 착수 전 결함의 값. 반증(D-3)의 절반: 스위치가 실제로 옛 거동을 되살린다',
    faces_painted: facesPainted, by_face: by, ids,
  }
  // 옛 거동 = 지나간 면마다 얹힌다(45의 설계 문면) — 셋 다 얹혀야 «재현»이다
  expect(facesPainted, '옛 거동 — 세 면 전부에 얹힌다(재현)').toBe(3)
})

test('② 고름 없음 — 시작한 면에만 남고 나머지 둘은 0 (문서 획 + 픽셀)', async ({ page }) => {
  await room3(page)
  const ids = await probeFaceIds(page)
  const before = {
    floor: await glDark(page, ...BOX.floor), wallA: await glDark(page, ...BOX.wallA),
    wallB: await glDark(page, ...BOX.wallB),
  }
  const n0 = await strokeCount(page)
  await strokeAcross(page)                                    // 바닥에서 시작한다
  const by = await paintByFaceSince(page, n0)
  const after = {
    floor: await glDark(page, ...BOX.floor), wallA: await glDark(page, ...BOX.wallA),
    wallB: await glDark(page, ...BOX.wallB),
  }
  OUT.owner_only = {
    def: '고름 없음: 획이 시작한 면(바닥)이 주인이다 — 문서 획은 바닥에만, 벽 두 판 상자의 어두운 픽셀 증가분 0',
    by_face: by, ids, px_delta: {
      floor: after.floor - before.floor, wallA: after.wallA - before.wallA, wallB: after.wallB - before.wallB,
    },
  }
  expect(by[ids.floor] ?? 0, '시작한 면(바닥)에 남았다').toBeGreaterThan(0)
  expect(by[ids.wallA] ?? 0, '벽 왼판 0').toBe(0)
  expect(by[ids.wallB] ?? 0, '벽 오른판 0').toBe(0)
  expect(after.wallA - before.wallA, '벽 왼판 픽셀 증가 0').toBe(0)
  expect(after.wallB - before.wallB, '벽 오른판 픽셀 증가 0').toBe(0)
  expect(after.floor - before.floor, '바닥에는 픽셀이 실제로 늘었다').toBeGreaterThan(0)
})

test('③ 고름 하나 — 획이 그 면 밖으로 나가면 밖은 0', async ({ page }) => {
  await room3(page)
  const ids = await probeFaceIds(page)
  await page.click('#btn-pencil')                             // 잡기는 연필로(48-4의 그 문)
  await holdAt(page, 522, 435)                                // 벽 왼판을 고른다
  expect(await page.evaluate(() => (window as any).__b2.app.faceSel.length), '고름 1').toBe(1)
  await page.click('#btn-paint')                              // 도구를 바꿔도 고름이 산다
  expect(await page.evaluate(() => (window as any).__b2.app.faceSel.length), '칠로 바꿔도 그대로').toBe(1)
  const before = { floor: await glDark(page, ...BOX.floor), wallA: await glDark(page, ...BOX.wallA), wallB: await glDark(page, ...BOX.wallB) }
  const n0 = await strokeCount(page)
  await strokeAcross(page)                                    // 바닥 시작 — 고른 면은 벽 왼판
  const by = await paintByFaceSince(page, n0)
  const after = { floor: await glDark(page, ...BOX.floor), wallA: await glDark(page, ...BOX.wallA), wallB: await glDark(page, ...BOX.wallB) }
  OUT.sel_one = {
    def: '고름 하나(벽 왼판): 세 면을 가로지르는 붓이 그 판에만 남는다 — 시작한 면(바닥)도 밖이다(고름이 주인 규칙을 이긴다). px_delta = 밖 두 면 상자의 어두운 픽셀 증가분(«한 픽셀도 안 남는다»의 값 — 리뷰어 [12])',
    by_face: by, ids, px_delta: { wallA: after.wallA - before.wallA, floor: after.floor - before.floor, wallB: after.wallB - before.wallB },
  }
  expect(by[ids.wallA] ?? 0, '고른 면(벽 왼판)에 남았다').toBeGreaterThan(0)
  expect(by[ids.floor] ?? 0, '바닥(고름 밖) 0').toBe(0)
  expect(by[ids.wallB] ?? 0, '벽 오른판(고름 밖) 0').toBe(0)
  expect(after.floor - before.floor, '바닥 픽셀 증가 0(한 픽셀도)').toBe(0)
  expect(after.wallB - before.wallB, '벽 오른판 픽셀 증가 0(한 픽셀도)').toBe(0)
  expect(after.wallA - before.wallA, '고른 면(안)에는 픽셀이 실제로 늘었다 — «밖 0»의 자가 살았다(2차 [N1])').toBeGreaterThan(0)
})

test('④ 고름 둘 — 두 면에 걸친 획이 둘 다에 남고 셋째는 0 (연속해서 칠하기)', async ({ page }) => {
  await room3(page)
  const ids = await probeFaceIds(page)
  await page.click('#btn-pencil')
  await holdAt(page, 522, 435)                                // 벽 왼판
  await holdAt(page, 578, 435)                                // + 벽 오른판 (잡은 채 또 잡으면 더해진다)
  expect(await page.evaluate(() => (window as any).__b2.app.faceSel.length), '고름 2').toBe(2)
  await page.click('#btn-paint')
  const before = { floor: await glDark(page, ...BOX.floor), wallA: await glDark(page, ...BOX.wallA), wallB: await glDark(page, ...BOX.wallB) }
  const n0 = await strokeCount(page)
  await strokeAcross(page)
  const by = await paintByFaceSince(page, n0)
  const after = { floor: await glDark(page, ...BOX.floor), wallA: await glDark(page, ...BOX.wallA), wallB: await glDark(page, ...BOX.wallB) }
  OUT.sel_two = {
    def: '고름 둘(벽 두 판): 이음매를 넘는 붓이 둘 다에 남고 바닥(셋째)은 0 — «연속해서 칠하기»의 실측(사용자 문면의 그 장면)',
    by_face: by, ids, px_delta: { wallA: after.wallA - before.wallA, wallB: after.wallB - before.wallB, floor: after.floor - before.floor },
  }
  expect(by[ids.wallA] ?? 0, '벽 왼판에 남았다').toBeGreaterThan(0)
  expect(by[ids.wallB] ?? 0, '벽 오른판에 남았다').toBeGreaterThan(0)
  expect(by[ids.floor] ?? 0, '바닥 0').toBe(0)
  expect(after.floor - before.floor, '바닥 픽셀 증가 0(한 픽셀도)').toBe(0)
  expect(after.wallA - before.wallA, '벽 왼판(안) 픽셀 양성').toBeGreaterThan(0)
  expect(after.wallB - before.wallB, '벽 오른판(안) 픽셀 양성').toBeGreaterThan(0)
})

/** 포즈가 멈출 때까지(보간 종료) — 상한 3s(#95: 상한 + 걸리면 마지막 포즈를 본다) */
async function waitPoseSettled(page: Page) {
  let prev = ''
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100)
    const cur = await page.evaluate(() => JSON.stringify((window as any).__b2.app.pose))
    if (cur === prev) return
    prev = cur
  }
}

test('⑤ 정면 — 법선이 카메라 축과 평행(값) · 다시 누르면 직전 포즈로 복귀(값)', async ({ page }) => {
  await room3(page)
  await page.click('#btn-pencil')
  await holdAt(page, 578, 435)                                // 벽 오른판을 고른다
  const pose0 = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__b2.app.pose)))
  await page.click('#btn-paint')                              // 칠 도구
  await page.click('#btn-paint')                              // 재누름 — 칠통
  await page.click('#btn-paint-front')                        // 날아간다
  await waitPoseSettled(page)
  const m = await page.evaluate(() => {
    const app = (window as any).__b2.app
    const fid = app.faceSel[app.faceSel.length - 1]
    const f = app.faces.find((x: any) => x.id === fid)
    const q = app.pose.q
    // 카메라 앞축 = q로 돌린 (0,0,-1) — 쿼터니언 회전 공식 그대로
    const rot = (v: number[]) => {
      const { x, y, z, w } = q
      const ux = y * v[2]! - z * v[1]!, uy = z * v[0]! - x * v[2]!, uz = x * v[1]! - y * v[0]!
      const uux = y * uz - z * uy, uuy = z * ux - x * uz, uuz = x * uy - y * ux
      return [v[0]! + 2 * (w * ux + uux), v[1]! + 2 * (w * uy + uuy), v[2]! + 2 * (w * uz + uuz)]
    }
    const fwd = rot([0, 0, -1])
    const cosTo = (n: any) => {
      const nl = Math.hypot(n.x, n.y, n.z), fl = Math.hypot(fwd[0]!, fwd[1]!, fwd[2]!)
      return Math.abs((n.x * fwd[0]! + n.y * fwd[1]! + n.z * fwd[2]!) / (nl * fl))
    }
    // 반증 값(D-3 · 리뷰어 [13]) — «다른» 면의 법선과의 |cos|.
    // 배선이 그 면으로 틀렸다면 dot이 이 값이 됐다 — 1과 갈라야 판별력이 선다.
    const other = app.faces.find((x: any) => x.id !== fid)
    return { dot: cosTo(f.normal), otherDot: other ? cosTo(other.normal) : null,
      proj: app.pose.proj ? 'parallel' : 'persp' }
  })
  OUT.front = { def: '정면 뒤 |cos(법선, 카메라 앞축)| — 1이면 평행. 복귀는 직전 포즈와의 p·q 최대 성분 차. ⚠ 정확한 1.0·0.0은 구성상 보장이다(faceFrontPose가 법선 정면을 «정확히» 낳고 glide가 목표에 «정확히» 끝난다 — 자기참조 유형 3): 이 팔이 재는 것은 측정 오차가 아니라 **배선**(어느 면·어느 발판으로 갔는가)이고, 배선이 틀리면 값이 크게 갈린다. other_dot(다른 면 법선과의 |cos|)이 그 반증 값이다 — 리뷰어 [13]', dot: +m.dot.toFixed(6), other_dot: m.otherDot === null ? null : +m.otherDot.toFixed(6), proj: m.proj }
  expect(m.dot, '법선이 카메라 축과 평행하다').toBeGreaterThan(0.9999)
  expect(m.otherDot ?? 0, '반증 — 다른 면의 법선과는 평행이 아니다(배선 판별력)').toBeLessThan(0.9999)
  await page.click('#btn-paint-front')                        // 다시 누르면 직전 시점으로
  await waitPoseSettled(page)
  const back = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__b2.app.pose)))
  const diff = Math.max(
    Math.abs(back.p.x - pose0.p.x), Math.abs(back.p.y - pose0.p.y), Math.abs(back.p.z - pose0.p.z),
    Math.abs(back.q.x - pose0.q.x), Math.abs(back.q.y - pose0.q.y),
    Math.abs(back.q.z - pose0.q.z), Math.abs(back.q.w - pose0.q.w))
  ;(OUT.front as Record<string, unknown>).return_diff = +diff.toExponential(3)
  expect(diff, '직전 포즈로 돌아왔다').toBeLessThan(1e-6)
  // ── 반증 «실행»(D-3 · 2차 [N9]) — other_dot(직교 구성값)만으로는 «실패시켜 본» 것이
  // 아니다. **실제로 다른 면(바닥)의 정면으로 날고**, 그 포즈에서 원래 대상(벽 오른판)의
  // 법선과의 |cos|를 잰다 — 배선이 바닥으로 틀렸다면 dot이 이 값이 됐다. 부등식(>0.9999)을
  // 이 실측이 실제로 깬다(픽스처 직교의 «귀결»이 아니라 다른 비행의 «실측»이다).
  // ⚠ 바닥 고름은 상태로 놓는다 — 꾹 누름 경로는 ③④⑦이 이미 행위로 재고, 이 방(바닥
  // 다이아 40px 폭)은 어디를 눌러도 선 반경(16px) 안이라 면 잡기가 안 선다(초판 실측 —
  // 이 팔의 대상은 «비행 배선»이지 잡기가 아니다).
  const wallTarget = await page.evaluate(() => {
    const app = (window as any).__b2.app
    return app.faceSel[app.faceSel.length - 1]
  })
  await page.evaluate(() => {
    const app = (window as any).__b2.app
    const floor = app.faces.find((f: any) => Math.abs(f.normal.y) > 0.5)
    app.faceSel = app.faceSel.filter((x: number) => x !== floor.id)
    app.faceSel.push(floor.id)                                // 마지막 고름 = 바닥
  })
  await page.click('#btn-paint-front')                        // 바닥 정면으로 실제로 난다
  await waitPoseSettled(page)
  const cross = await page.evaluate((wallId) => {
    const app = (window as any).__b2.app
    const f = app.faces.find((x: any) => x.id === wallId)
    const q = app.pose.q
    const rot = (v: number[]) => {
      const { x, y, z, w } = q
      const ux = y * v[2]! - z * v[1]!, uy = z * v[0]! - x * v[2]!, uz = x * v[1]! - y * v[0]!
      const uux = y * uz - z * uy, uuy = z * ux - x * uz, uuz = x * uy - y * ux
      return [v[0]! + 2 * (w * ux + uux), v[1]! + 2 * (w * uy + uuy), v[2]! + 2 * (w * uz + uuz)]
    }
    const fwd = rot([0, 0, -1])
    const n = f.normal
    const nl = Math.hypot(n.x, n.y, n.z), fl = Math.hypot(fwd[0]!, fwd[1]!, fwd[2]!)
    return Math.abs((n.x * fwd[0]! + n.y * fwd[1]! + n.z * fwd[2]!) / (nl * fl))
  }, wallTarget)
  ;(OUT.front as Record<string, unknown>).falsify_cross_dot = +cross.toFixed(6)
  expect(cross, '반증 실행 — 다른 면의 정면에서는 원래 대상의 술어가 실제로 깨진다').toBeLessThan(0.9999)
})

test('⑥ 34-0 몫(#96) — 정면 줄의 툴팁·막힘 사유·고름 수 표시 · 통이 화면 안(34-6)', async ({ page }) => {
  await room3(page)
  // 고름 없음 — 막힌 상태: 이유가 말이 된다(«못 쓸 때만 설명»의 뒤집힘 ⛔ — 둘 다 뜬다)
  await page.click('#btn-paint'); await page.click('#btn-paint')
  const blocked = await page.evaluate(() => {
    const b = document.getElementById('btn-paint-front')!
    return { title: b.title, disabled: b.classList.contains('disabled') }
  })
  expect(blocked.disabled, '고름 없음 — 막혀 있다').toBe(true)
  expect(blocked.title.length, '막힘 사유가 있다').toBeGreaterThan(5)
  expect(blocked.title, '사유가 «고르는 법»을 말한다').toContain('꾹')
  // 고름 둘 — 쓸 수 있는 상태: 툴팁이 뜨고(48-10) 고름 수가 화면에 있다(R6)
  await page.click('#btn-pencil')
  await holdAt(page, 522, 435)
  await holdAt(page, 578, 435)
  await page.click('#btn-paint'); await page.click('#btn-paint')
  const ok = await page.evaluate(() => {
    const b = document.getElementById('btn-paint-front')!
    const lbl = document.getElementById('paint-front-lbl')!
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    const tray = document.getElementById('painttray')!
    return {
      title: b.title, disabled: b.classList.contains('disabled'), label: lbl.textContent,
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      clickable: b === el || b.contains(el),
      overflow: { sw: tray.scrollWidth, cw: tray.clientWidth, sh: tray.scrollHeight, ch: tray.clientHeight },
      inView: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    }
  })
  OUT.ui34 = {
    def: '#96/#97/34-6 — 툴팁 두 상태 · R6 고름 수 · 정면 줄 rect(화면 안 — 값) · elementFromPoint(가로채는 겹 없음 — 행위 #94) · 칠통 넘침(scrollWH==clientWH — mats52 ⑤와 같은 자 · 리뷰어 [10])',
    blocked_title: blocked.title, ok_title: ok.title, label: ok.label,
    rect: ok.rect, viewport: ok.viewport, clickable: ok.clickable, overflow: ok.overflow,
  }
  expect(ok.disabled, '고름이 있으면 쓸 수 있다').toBe(false)
  expect(ok.title, '쓸 수 있는 상태에서도 툴팁이 뜬다(#96)').toContain('정면')
  expect(ok.label, '몇 장이 골라졌는지 화면이 말한다(R6)').toContain('2장')
  expect(ok.inView, '정면 줄이 화면 안이다(34-6 — rect 값이 원장에)').toBe(true)
  expect(ok.clickable, '정면 줄의 중심이 실제로 눌린다(#97 — elementFromPoint)').toBe(true)
  expect(ok.overflow.sh, '칠통 세로 넘침 0(#97 짝)').toBe(ok.overflow.ch)
  expect(ok.overflow.sw, '칠통 가로 넘침 0(#97 짝)').toBe(ok.overflow.cw)
})

test('⑦ 빈 곳 꾹 누름 — 고름이 풀린다(R7의 어법) · 화면 강조도 걷힌다', async ({ page }) => {
  await room3(page)
  await page.click('#btn-pencil')
  await holdAt(page, 522, 435)
  await holdAt(page, 578, 435)
  expect(await page.evaluate(() => (window as any).__b2.app.faceSel.length), '고름 2').toBe(2)
  await holdAt(page, 900, 200)                                // 빈 곳(면·선 밖)
  expect(await page.evaluate(() => (window as any).__b2.app.faceSel.length), '풀렸다').toBe(0)
})
