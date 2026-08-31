// web2-25 5-c ③ — **그림이 안 바뀐다**(반올림 전후 픽셀 대조).
//
// 5-b가 저장 좌표를 소수 1자리로 반올림한다. 0.1px 는 눈에 안 보인다 — 그것을 **말이
// 아니라 픽셀로** 못 박는다: 옐로 프리핸드를 그리고 **자동 저장 → 새로 고침(복원)** 뒤의
// 화면이 그리기 직후의 화면과 같은가.
//
// ⚠ 왕복은 **앱의 실제 경로**다(localStorage 자동 저장 → 부팅 시 복원) — 팔이 만든
//   사본이 아니다(#71 ㉠: 재는 조건이 실사용과 같아야 한다).
// ⚠⚠ 절대 밝기 임계를 안 쓴다(#74 ㉡) — **두 화면의 차**로만 판정한다.

import { test, expect, type Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from '../tools/ledgerfs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

const settle = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))

async function drawLine(page: Page, ax: number, ay: number, bx: number, by: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8)
  await page.mouse.up()
  await settle(page)
}

/** 손 획 — 굽은 궤적을 여러 점으로(프리핸드 raw가 실린다) */
async function handStroke(page: Page, ax: number, ay: number, bx: number, by: number, sag: number) {
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  for (let i = 1; i <= 40; i++) {
    const t = i / 40
    await page.mouse.move(
      ax + (bx - ax) * t + (t * 7919 % 1) * 0.6,
      ay + (by - ay) * t + Math.sin(Math.PI * t) * sag)
  }
  await page.mouse.up()
  await settle(page)
}

/** 그린 것이 사는 캔버스들의 픽셀 — 알파·밝기를 **그대로** 담는다(임계 ⛔) */
const shot = (page: Page) => page.evaluate(() => {
  const out: Record<string, number[]> = {}
  for (const id of ['brushc', 'ink', 'layerc']) {
    const c = document.getElementById(id) as HTMLCanvasElement | null
    if (!c || c.width === 0) { out[id] = []; continue }
    const t = document.createElement('canvas')
    t.width = c.width; t.height = c.height
    t.getContext('2d')!.drawImage(c, 0, 0)
    const d = t.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    // 8px 격자로 훑는다 — 전량은 e2e 전송이 무겁고, 격자만으로도 0.1px 이동은 안 잡힌다
    const arr: number[] = []
    for (let y = 0; y < c.height; y += 4) {
      for (let x = 0; x < c.width; x += 4) {
        const i = (y * c.width + x) * 4
        arr.push(d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!)
      }
    }
    out[id] = arr
  }
  return out
})

/** 저장된 payload 안 **점렬(raw) 좌표**가 소수 1자리인가.
 *  ⚠ `"x":` 만 훑으면 3D·포즈·rect 가 섞이고, **확정 끝점 a·b 도 안 깎는 것이 설계다**
 *  (잉크 심판 OWN3_TOL_PX 0.01px — file.ts 머리주석). 표현용 점렬만 골라 본다. */
function strokeCoordsRounded(text: string): boolean {
  const d = JSON.parse(text)
  let seen = 0
  for (const s of d.strokes ?? []) {
    for (const p of s.raw ?? []) {
      for (const v of [p.x, p.y]) {
        seen++
        if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9) return false
      }
    }
  }
  return seen > 0
}

test('③ 그림이 안 바뀐다 — 반올림 있는 문서와 없는 문서가 같은 화면을 낸다(픽셀)', async ({ page }) => {
  test.setTimeout(180_000)   // 두 갈래 × 새로 고침 넷 — 기본 60s를 넘는다
  // ⚠⚠ **D-1(표식 먼저)**: 초판은 「그리기 직후 화면 ↔ 복원한 화면」을 견줬고 0.2%가 달랐다.
  //   그런데 그 둘은 **그리는 경로가 다르다**(생 draft ↔ 문서에서 다시 그리기) — 그 차가
  //   반올림 몫인지 재그리기 몫인지 이 팔은 못 가른다. 그래서 **양쪽을 다 복원 화면으로**
  //   두고 저장 형식만 갈랐다: 반올림 **없이** 저장한 문서를 복원한 화면 ↔ 반올림 **하고**
  //   저장한 문서를 복원한 화면. 이제 남는 차가 곧 반올림 몫이다.
  //   (초판의 0.2%는 그 뒤 «복원↔복원»이 0.000%인 것으로 재그리기 몫임이 드러났다.)
  const draw = async () => {
    await drawLine(page, 280, 560, 700, 560)
    await drawLine(page, 500, 560, 800, 480)
    expect(await page.evaluate(() => (window as any).__b2.app.lift.an.constructionDone)).toBe(true)
    await page.click('#btn-roll'); await page.click('#btn-roll-yellow'); await settle(page)
    for (let k = 0; k < 4; k++) {
      await handStroke(page, 200 + k * 40, 300 + k * 30, 620 + k * 40, 330 + k * 30, 26 + k * 6)
    }
    // ⚠ 자동 저장은 **디바운스**(400ms)라 마지막 획이 payload에 들어갈 때까지 기다린다 —
    //   안 그러면 복원한 문서가 한 획 모자라고 팔이 «사라졌다»로 오독한다(#71 ㉤의 형태).
    await page.waitForFunction(() => {
      const t = localStorage.getItem('b2-autosave2') ?? localStorage.getItem('b2-autosave')
      if (!t) return false
      try { return (JSON.parse(t).strokes ?? []).length >= 6 } catch { return false }
    }, undefined, { timeout: 8000 })
  }
  /** ⚠⚠ **복원 뒤에 저장 형식을 다시 못 박는다.** `saveRound(false)`는 그 페이지의
   *  런타임 손잡이라 `reload()`에 리셋된다 — 그대로 두면 복원 직후의 자동 저장이
   *  **반올림 판**을 덮어써서 다음 복원이 다른 문서를 연다. 그러면 「잡음 바닥」이
   *  잡음이 아니라 **반올림 몫**을 재게 된다(실측: 둘 다 0.067%로 정확히 같았다 —
   *  값이 같다는 것 자체가 그 오염의 증거다). 재실행 사이의 짧은 시간 차이로
   *  0이 되기도 했으므로 **경주였고**, 형식을 다시 박아 경주 자체를 없앤다. */
  const reloadShot = async (round?: boolean, payload?: string) => {
    // ⚠⚠ **같은 바이트를 다시 넣고** 연다 — 그래야 「잡음 바닥」이 잡음만 잰다.
    //   복원 직후의 자동 저장이 저장소를 덮어쓰므로(그 판은 반올림된 것이다) 손잡이를
    //   다시 박는 것만으로는 **경주가 남는다**(dpr2에서 실제로 0.035%가 났다).
    if (payload) {
      await page.evaluate(([k, v]) => { try { localStorage.setItem(k, v) } catch { /* 없음 */ } },
        ['b2-autosave2', payload] as const)
    }
    await page.reload()
    await page.waitForFunction(() => (window as any).__b2)
    if (round !== undefined) await page.evaluate((r) => (window as any).__b2.diag.saveRound(r), round)
    await page.waitForFunction(() => (window as any).__b2.app.doc.strokes.length >= 6, undefined, { timeout: 5000 })
    await settle(page); await settle(page)
    return shot(page)
  }

  // ── 갈래 ㉠: **반올림 없이** 저장한다(web2-24까지의 형식 — 반증 손잡이) ──────────
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => (window as any).__b2.diag.saveRound(false))
  await draw()
  // 프리핸드가 실제로 실렸는가(0건 통과 방지) — raw 점이 있어야 반올림이 닿을 자리가 있다
  const rawPts = await page.evaluate(() =>
    (window as any).__b2.app.doc.strokes.reduce((n: number, s: any) => n + (s.raw?.length ?? 0), 0))
  expect(rawPts).toBeGreaterThan(40)
  // 저장된 것이 **실제로 배정밀도**인가(손잡이가 일했다는 증거 — 실패 가능한 격자)
  const savedRaw = await page.evaluate(() =>
    localStorage.getItem('b2-autosave2') ?? localStorage.getItem('b2-autosave') ?? '')
  expect(strokeCoordsRounded(savedRaw), '반올림 **없이** 저장됐다').toBe(false)
  const shotLive = await shot(page)        // **생으로 그린** 화면 — 아래 «재그리기 몫»의 기준
  const shotNoRound = await reloadShot(false, savedRaw)   // **같은 바이트**로 연다
  const shotNoRound2 = await reloadShot(false, savedRaw)  // 잡음 바닥 — 같은 바이트를 두 번

  // ── 갈래 ㉡: **반올림하고** 저장한다(지금 앱의 형식) ─────────────────────────────
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await page.evaluate(() => { try { localStorage.clear() } catch { /* 저장소 없음 */ } })
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__b2)
  await draw()
  const savedRound = await page.evaluate(() =>
    localStorage.getItem('b2-autosave2') ?? localStorage.getItem('b2-autosave') ?? '')
  expect(strokeCoordsRounded(savedRound), '반올림하고 저장됐다').toBe(true)
  expect(savedRound.length).toBeLessThan(savedRaw.length)     // 실제로 줄었다
  const shotRound = await reloadShot()

  const chan = (a: number[], b: number[]) => {
    let n = 0, mx = 0, sum = 0
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i]! - b[i]!)
      if (d > 0) n++
      if (d > mx) mx = d
      sum += d
    }
    return { frac: a.length === 0 ? 0 : n / a.length, max: mx, mean: a.length === 0 ? 0 : sum / a.length }
  }
  // 세 캔버스를 **이어 붙여 한 번에** 견준다 — 빈 캔버스(ink·layerc)를 따로 판정하면
  // 「차가 0이라 통과」가 되어 아무것도 안 재는 칸이 생긴다(#69 ㉣).
  const cat = (o: Record<string, number[]>) => [...o.brushc!, ...o.ink!, ...o.layerc!]
  const A = cat(shotNoRound), B = cat(shotRound), A2 = cat(shotNoRound2), L = cat(shotLive)
  expect(B.length, '픽셀 수').toBe(A.length)
  expect(L.length, '픽셀 수').toBe(A.length)
  const eff = chan(A, B)        // **반올림 몫**(좌표만 갈렸다)
  const noise = chan(A, A2)     // 같은 형식 두 복원 = 잡음 바닥
  const redraw = chan(L, A)     // **재그리기 몫**(좌표는 하나도 안 바뀌었다)
  console.log(`[측정] roundsave — 반올림 ${(eff.frac * 100).toFixed(3)}%(평균 ${eff.mean.toFixed(4)} · 최대 ${eff.max})`
    + ` / 재그리기 ${(redraw.frac * 100).toFixed(3)}%(평균 ${redraw.mean.toFixed(4)})`
    + ` / 잡음 ${(noise.frac * 100).toFixed(3)}%`)

  // ⚠⚠ **판정은 «둘의 차»가 아니라 «두 차의 비교»다**(#74 ㉡의 확장): 0.05px 이동은
  //   가장자리 안티에일리어싱을 아주 조금 민다 — 그것을 0으로 요구하면 임계를 헐겁게
  //   잡는 반대편 잘못으로 간다. 대신 **이미 있는 기준**과 나란히 놓는다:
  //   ㉠ 잡음 바닥(같은 문서 두 복원 — 0이어야 한다)
  //   ㉡ **재그리기 몫**: 좌표를 하나도 안 바꾸고 «생 draft ↔ 문서에서 다시 그리기»로만
  //      갈린 차. 사람은 이것을 **매 복원마다 이미 보고 있다**.
  //   반올림이 ㉡보다 그림을 덜 바꾸면 「그림이 안 바뀐다」가 값으로 선다.
  expect(redraw.frac, '재그리기 몫이 실제로 잡혔다(기준이 0이면 비교가 무의미하다)').toBeGreaterThan(0)
  expect(noise.frac, '잡음 바닥 — 같은 문서를 두 번 복원하면 픽셀이 같다').toBe(0)
  expect(eff.frac, `반올림 ${eff.frac} vs 재그리기 ${redraw.frac}(최대 차 ${eff.max} · 평균 ${eff.mean})`)
    .toBeLessThanOrEqual(redraw.frac)
  // 그리고 **평균 채널 차가 1/255 아래**다 — 한 눈금도 안 된다
  expect(eff.mean, '평균 채널 차').toBeLessThan(1)

  // ── 원장(CLAUDE.md §5 — **측정은 반드시 stage0/out에 JSON으로 남긴다**) ──────────
  // ⚠ `LEDGER=1`에서만 쓴다(#71 ㉠ — 전량 실행의 병렬 판이 못 덮는다).
  //   정본 명령: LEDGER=1 npx playwright test e2e/roundsave.spec.ts --workers=1
  if (process.env.LEDGER === '1') {
    const dpr = test.info().project.name
    const suffix = dpr === 'dpr1' ? '' : `_${dpr}`
    const dir = resolve(HERE, '../../stage0/out')
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, `roundsave25_web2${suffix}.json`), JSON.stringify({
      what: 'web2-25 5-c ③ — 저장 좌표 반올림이 그림을 바꾸는가(픽셀). '
        + '정본 명령: LEDGER=1 npx playwright test e2e/roundsave.spec.ts --workers=1',
      run: {
        date: '2026-08-28',
        project: dpr,
        conditions: '같은 그림(작도 2획 + 옐로 4획 프리핸드)을 **저장 형식만 갈라** 두 번 '
          + '복원하고 픽셀을 견준다. ㉠ diag.saveRound(false)로 배정밀도 저장 → 복원 '
          + '㉡ 기본(반올림) 저장 → 복원. **양쪽 다 «문서에서 다시 그린 화면»**이라 '
          + '«생 draft ↔ 재그리기»의 차가 안 섞인다(초판이 그것을 섞어 0.2%를 반올림 몫으로 '
          + '오독했다 — D-1). 캔버스 셋(brushc·ink·layerc)을 이어 붙여 4px 격자로 훑는다.',
        method: '판정은 **절대 비율이 아니라 두 차의 비교**다(#74 ㉡의 확장): 반올림 몫이 '
          + '**재그리기 몫**(좌표를 하나도 안 바꾸고 생 draft ↔ 복원으로만 갈린 차 — 사람이 '
          + '매 복원마다 이미 보고 있는 차)보다 작으면 「그림이 안 바뀐다」가 값으로 선다.',
      },
      rounding_share: eff,     // 반올림 몫(좌표만 갈렸다)
      redraw_share: redraw,    // 재그리기 몫(좌표는 그대로)
      noise_floor: noise,      // 같은 형식 두 복원 — 0이어야 한다
      channels_sampled: A.length,
      verdict: eff.frac <= redraw.frac,
      note: 'frac = 값이 다른 채널의 비율 · mean = 채널당 평균 차(0~255) · max = 최대 차. '
        + '⚠ max가 255여도 이상하지 않다 — 가장자리 안티에일리어싱 한 픽셀이 0↔255로 갈릴 수 '
        + '있다. 그래서 판정은 max가 아니라 frac·mean과 **기준선과의 비교**로 한다.',
      flags_explained: {
        'noise_floor.frac = 0': '0 고정이 아니라 **판정의 근거**다 — 같은 문서를 두 번 복원하면 '
          + '픽셀이 같다는 것이 이 팔의 전제이고, 그것이 깨지면 위의 비교가 뜻을 잃는다. '
          + '같은 실행의 redraw_share(0이 아니다)가 양성 대조다(#69 ㉣)',
        'constants/metric_defs 스냅샷 없음': 'web2 라인 원장은 상수 스냅샷 등록부 밖(공통 형태)',
      },
    }, null, 2))
  }
})
