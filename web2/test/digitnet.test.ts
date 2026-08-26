// 번들 숫자 모형(web2-10 지시 8-b ②) — 정확도·거부·분절을 재고 **원장에 남긴다**(§5:
// 원장 밖 측정은 규칙이 있어도 안 걸린다 — web2 라인의 첫 stage0/out 쓰기).
//
// 표본의 성격을 가른다(D-5·AS-C24):
// - 합성 표본(아래): $P 템플릿을 흔든 것 — **$P에 구성상 유리하다**(자기 템플릿).
//   두 인식기를 같은 획 자료로 비교할 유일한 픽스처라 그대로 쓰되, 이 편향을 원장에 적는다.
// - 실필기 대역: digitnet은 MNIST test 10k(stage0/out/digitnet_mnist.json — int8
//   9678/10000). $P는 획 자료가 아니면 못 돌므로 **그 비교 자체가 구조적으로 불가**하다 —
//   「나아졌다」의 수는 ① 합성(동률이면 충분) ② MNIST(실필기 일반화 — $P는 0 표본) 둘로 든다.

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { recognizeGlyph, recognizeDigits } from '../src/core/digits'
import { classifyGlyph, rasterize } from '../src/core/digitnet'
import { recognizeDigitsNet, NET_REJECT } from '../src/core/handwriting'
import { rng32 } from '../src/core/material'
import type { Pt } from '../src/core/vec'

function jitterGlyph(
  strokes: Pt[][], seed: number,
  opt: { x: number; y: number; s: number; rot?: number; noise?: number },
): Pt[][] {
  const rnd = rng32(seed)
  const rot = opt.rot ?? 0
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const noise = opt.noise ?? 0
  return strokes.map(st => {
    const dense: Pt[] = []
    for (let i = 1; i < st.length; i++) {
      for (let t = 0; t < 6; t++) {
        const u = t / 6
        dense.push({ x: st[i - 1]!.x + (st[i]!.x - st[i - 1]!.x) * u, y: st[i - 1]!.y + (st[i]!.y - st[i - 1]!.y) * u })
      }
    }
    dense.push(st[st.length - 1]!)
    return dense.map(p => {
      const cx = p.x - 0.5, cy = p.y - 0.5
      return {
        x: opt.x + (cx * cos - cy * sin) * opt.s + (rnd() - 0.5) * noise,
        y: opt.y + (cx * sin + cy * cos) * opt.s + (rnd() - 0.5) * noise,
      }
    })
  })
}

const SHAPES: Record<string, Pt[][]> = {
  '0': [[{ x: .5, y: 0 }, { x: .18, y: .12 }, { x: .05, y: .5 }, { x: .18, y: .88 }, { x: .5, y: 1 }, { x: .82, y: .88 }, { x: .95, y: .5 }, { x: .82, y: .12 }, { x: .5, y: 0 }]],
  '1': [[{ x: .5, y: 0 }, { x: .5, y: 1 }]],
  '2': [[{ x: .12, y: .28 }, { x: .22, y: .06 }, { x: .5, y: 0 }, { x: .78, y: .08 }, { x: .88, y: .3 }, { x: .62, y: .56 }, { x: .32, y: .76 }, { x: .1, y: 1 }, { x: .9, y: 1 }]],
  '3': [[{ x: .15, y: .1 }, { x: .5, y: 0 }, { x: .85, y: .15 }, { x: .82, y: .36 }, { x: .5, y: .48 }, { x: .85, y: .62 }, { x: .85, y: .85 }, { x: .5, y: 1 }, { x: .15, y: .9 }]],
  '4': [[{ x: .68, y: 0 }, { x: .12, y: .62 }, { x: .92, y: .62 }], [{ x: .68, y: .3 }, { x: .68, y: 1 }]],
  '5': [[{ x: .85, y: 0 }, { x: .22, y: 0 }, { x: .18, y: .42 }, { x: .55, y: .38 }, { x: .85, y: .58 }, { x: .82, y: .84 }, { x: .5, y: 1 }, { x: .15, y: .9 }]],
  '6': [[{ x: .72, y: .04 }, { x: .38, y: .28 }, { x: .18, y: .6 }, { x: .24, y: .86 }, { x: .52, y: 1 }, { x: .78, y: .84 }, { x: .72, y: .58 }, { x: .42, y: .54 }, { x: .2, y: .66 }]],
  '7': [[{ x: .1, y: 0 }, { x: .9, y: 0 }, { x: .45, y: 1 }]],
  '8': [[{ x: .5, y: .48 }, { x: .2, y: .26 }, { x: .5, y: 0 }, { x: .8, y: .26 }, { x: .5, y: .48 }, { x: .18, y: .76 }, { x: .5, y: 1 }, { x: .82, y: .76 }, { x: .5, y: .48 }]],
  '9': [[{ x: .8, y: .12 }, { x: .5, y: 0 }, { x: .2, y: .14 }, { x: .18, y: .38 }, { x: .5, y: .5 }, { x: .78, y: .38 }, { x: .8, y: .12 }], [{ x: .8, y: .16 }, { x: .74, y: 1 }]],
}

const VARIANTS = [
  { x: 40, y: 40, s: 50, noise: 2 },
  { x: 120, y: 45, s: 64, rot: 0.1, noise: 2.5 },
  { x: 60, y: 38, s: 44, rot: -0.1, noise: 2 },
  { x: 90, y: 50, s: 70, noise: 3 },
]

const GARBAGE: Record<string, Pt[][]> = {
  가로선: [[{ x: 0, y: 40 }, { x: 100, y: 40 }]],
  W지그재그: [[{ x: 0, y: 0 }, { x: 20, y: 60 }, { x: 40, y: 0 }, { x: 60, y: 60 }, { x: 80, y: 0 }]],
  N지그재그: [[{ x: 0, y: 60 }, { x: 0, y: 0 }, { x: 40, y: 60 }, { x: 40, y: 0 }]],
  X표: [[{ x: 0, y: 0 }, { x: 50, y: 70 }], [{ x: 50, y: 0 }, { x: 0, y: 70 }]],
  ㄷ자: [[{ x: 50, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 70 }, { x: 50, y: 70 }]],
  체크표: [[{ x: 0, y: 40 }, { x: 20, y: 65 }, { x: 60, y: 0 }]],
  대각선: [[{ x: 0, y: 0 }, { x: 60, y: 70 }]],
  삼각형: [[{ x: 30, y: 0 }, { x: 60, y: 70 }, { x: 0, y: 70 }, { x: 30, y: 0 }]],
}

describe('digitnet — 합성 표본과 원장', () => {
  it('숫자별 정확도(합성 40) — $P와 나란히 재서 원장에 남긴다', () => {
    /** 한 시드에서 합성 40 + 잡음 8을 훑는다 — 시드 스윕(2차 [12])이 같은 함수를 돈다 */
    const sweep = (seed0: number) => {
      const per: Record<string, { p$: { correct: number; total: number }; net: { correct: number; total: number } }> = {}
      const failures: { ch: string; got: string }[] = []
      let seed = seed0
      let netWorstP = 1, netCorrect = 0, lowConfAbstain = 0
      for (const [ch, shape] of Object.entries(SHAPES)) {
        per[ch] = { p$: { correct: 0, total: 0 }, net: { correct: 0, total: 0 } }
        for (const v of VARIANTS) {
          const g = jitterGlyph(shape, seed++, v)
          per[ch]!.p$.total++
          per[ch]!.net.total++
          if (recognizeGlyph(g)?.ch === ch) per[ch]!.p$.correct++
          const r = classifyGlyph(g)
          if (r?.ch === ch) {
            // ⚠ netCorrect는 **원시 분류** 수다(임계 미적용 — 모형의 성질). 런타임은 임계
            // 아래 옳은 답을 «?»로 기권시킨다 — 그 수는 lowConfAbstain이 따로 센다.
            per[ch]!.net.correct++
            netCorrect++
            if (r.p < netWorstP) netWorstP = r.p
            if (r.p < NET_REJECT) lowConfAbstain++
          } else {
            // 오독인가 기권인가(2차 [3] — AS-C32의 되돌릴 조건이 재는 양)
            failures.push({ ch, got: r === null ? '?(잡음 클래스)' : r.p < NET_REJECT ? `?(확신 ${r.p.toFixed(3)})` : r.ch })
          }
        }
      }
      let noiseBestP = 0, noiseBest = '', classRejected = 0, noiseAccepted = 0
      for (const [k, st] of Object.entries(GARBAGE)) {
        const r = classifyGlyph(st)
        if (!r) { classRejected++; continue }
        if (r.p >= NET_REJECT) noiseAccepted++          // 잡음이 숫자로 «수용»되면 조용한 오류다
        if (r.p > noiseBestP) { noiseBestP = r.p; noiseBest = `${k}→${r.ch}` }
      }
      const wrongDigit = failures.filter(f => !f.got.startsWith('?')).length
      return { per, failures, netWorstP, netCorrect, lowConfAbstain, noiseBestP, noiseBest, classRejected, noiseAccepted, wrongDigit }
    }

    const m = sweep(7)
    const { per, failures, netWorstP, netCorrect, noiseBestP, noiseBest, classRejected } = m
    console.log(`[측정] 합성 40 — net ${netCorrect}/40(실패 ${JSON.stringify(failures)}) · 옳은 최악 확신 ${netWorstP.toFixed(3)} · 잡음: 클래스 거부 ${classRejected}/8 · 남은 최선 확신 ${noiseBestP.toFixed(3)}(${noiseBest}) · NET_REJECT ${NET_REJECT}`)
    // 시드 스윕(2차 [12] — §5 「유효 자릿수 2자리」의 확인): 다른 뽑기에서도 부호가 유지되는가
    const seeds = [101, 202, 303]
    const sweeps = seeds.map(s0 => ({ s0, ...sweep(s0) }))
    for (const s of sweeps)
      console.log(`[측정] 시드 ${s.s0} — net ${s.netCorrect}/40(런타임 기권 +${s.lowConfAbstain}) · 옳은 최악 ${s.netWorstP.toFixed(3)} · 잡음 최선 ${s.noiseBestP.toFixed(3)} · 오독 ${s.wrongDigit} · 잡음 수용 ${s.noiseAccepted}`)

    // 원장(§5) — web2의 첫 stage0/out 산출물. MNIST 원장의 수·가중치 해시를 **그 자리에서
    // 읽어** 잇는다(2차 [1] — 손으로 박은 인용이 재학습 뒤 낡았던 자리. 이제 안 낡는다).
    const mnistLedger = JSON.parse(readFileSync(resolve(__dirname, '../../stage0/out/digitnet_mnist.json'), 'utf8'))
    const weightsHash = createHash('sha256')
      .update(readFileSync(resolve(__dirname, '../src/core/digitnet_weights.json')))
      .digest('hex').slice(0, 12)
    expect(weightsHash).toBe(mnistLedger.weights_sha256_12)  // 두 원장이 같은 가중치의 수다
    const out = resolve(__dirname, '../../stage0/out/digit_accuracy_web2.json')
    mkdirSync(resolve(__dirname, '../../stage0/out'), { recursive: true })
    writeFileSync(out, JSON.stringify({
      what: '치수 필기 인식 비교(web2-10 지시 8-b) — 합성 표본(=$P 템플릿 흔들기 40) 숫자별 분자/분모',
      weights_sha256_12: weightsHash,
      bias: `⚠ 이 표본은 $P의 자기 템플릿이라 $P에 구성상 유리하다(AS-C24 — 인식률이 아니다). 실필기 대역은 digitnet_mnist.json(int8 ${mnistLedger.int8_overall.correct}/${mnistLedger.int8_overall.total} · 임계 적용 후 맞음 ${mnistLedger.int8_with_reject.ok}·기권 ${mnistLedger.int8_with_reject.abstain}·오독 ${mnistLedger.int8_with_reject.wrong})이 들고, $P는 획 자료가 없어 그 비교가 구조적으로 불가하다.`,
      seed: 7,
      seed_sweep: {
        note: 'netCorrect는 원시 분류(임계 미적용) — 런타임은 임계 아래 옳은 답을 «?»로 기권(lowConfAbstain). ⚠ «옳은 최악 > 잡음 최선» 분리 부호는 시드 101에서 뒤집혔다(0.452 < 0.497) — 임계는 잡음 차단이 아니라 불확신 기권 손잡이이고 잡음 차단은 잡음 클래스가 진다. 불변은 오독 0·잡음 수용 0.',
        seeds: sweeps.map(s => ({ seed: s.s0, net_correct: s.netCorrect, low_conf_abstain: s.lowConfAbstain, correct_worst: s.netWorstP, noise_best: s.noiseBestP, wrong_digit: s.wrongDigit, noise_accepted: s.noiseAccepted })),
      },
      per_digit: per,
      failures,
      net_confidence: {
        correct_worst: netWorstP, noise_class_rejected: `${classRejected}/8`,
        noise_best_after_class: noiseBestP, reject: NET_REJECT,
        note: '거부 두 겹 — 잡음 클래스(11번째) + 확신 임계. 임계 여유 ±0.023(얇다 — 표본이 커지면 다시 놓는다)',
      },
      rejected_alternatives: {
        note: '기각 기록(2차 [8]) — 폐기된 10클래스 가중치의 수라 재실행 불가. 그 실측: softmax 확신 단독은 옳은 최악 0.584 vs 잡음 최선 0.547(여유 0.019 — 8표본 밖 일반화 근거 없음), 로그마진(top1/top2)은 잡음 0.963 > 옳음 0.810로 역전.',
      },
      mnist_ledger: 'stage0/out/digitnet_mnist.json',
    }, null, 1))

    // 판정 — **비용 비대칭의 불변 둘**이 정본이다(2차 [5][6][12]가 이것을 세웠다):
    //   ① 오독 0 — 틀린 «숫자»를 내지 않는다(기권 «?»는 허용 — 다시 쓰기가 싸다)
    //   ② 잡음 수용 0 — 비숫자가 숫자로 확정되지 않는다
    // ⚠ «옳은 최악 > 잡음 최선»의 분리 부호는 시드에 따라 **뒤집힌다**(101에서 0.452 <
    // 0.497 — 실측). 임계는 잡음 차단 손잡이가 아니라 **불확신 기권** 손잡이이고,
    // 잡음 차단은 잡음 클래스(933/1000)가 진다. seed 7의 끼움 단언은 회귀 앵커로만 남긴다.
    expect(netCorrect).toBeGreaterThanOrEqual(36)
    expect(netWorstP).toBeGreaterThan(NET_REJECT)       // seed 7 앵커(가중치·임계가 바뀌면 움직인다)
    expect(noiseBestP).toBeLessThan(NET_REJECT)
    for (const s of [{ s0: 7, ...m }, ...sweeps]) {
      expect(s.netCorrect, `시드 ${s.s0}`).toBeGreaterThanOrEqual(36)
      expect(s.wrongDigit, `시드 ${s.s0} 오독`).toBe(0)
      expect(s.noiseAccepted, `시드 ${s.s0} 잡음 수용`).toBe(0)
    }
  })

  it('잡음 8종 — 전부 «?»(거부 — 조용히 틀린 치수를 안 만든다)', () => {
    for (const [k, st] of Object.entries(GARBAGE)) {
      expect(recognizeDigitsNet(st), k).toBe('?')
    }
  })

  it('여러 자리 «2500» — 분절은 $P와 같은 함수(splitGlyphs)를 탄다', () => {
    const strokes: Pt[][] = []
    const digits = ['2', '5', '0', '0']
    digits.forEach((ch, i) => {
      for (const st of jitterGlyph(SHAPES[ch]!, 100 + i, { x: 40 + i * 60, y: 40, s: 46, noise: 1.5 }))
        strokes.push(st)
    })
    expect(recognizeDigitsNet(strokes)).toBe('2500')
    expect(recognizeDigits(strokes)).toBe('2500')     // $P도 같은 답 — 분절 규칙이 하나다
  })

  it('rasterize — 질량 중심이 (14,14)±1 (MNIST 구성 규약 — 전처리가 다르면 정확도가 그냥 준다)', () => {
    const img = rasterize(jitterGlyph(SHAPES['3']!, 5, { x: 40, y: 40, s: 50, noise: 2 }))!
    let mx = 0, my = 0, m = 0
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      const v = img[y * 28 + x]!; m += v; mx += v * x; my += v * y
    }
    expect(Math.abs(mx / m - 14)).toBeLessThanOrEqual(1)
    expect(Math.abs(my / m - 14)).toBeLessThanOrEqual(1)
  })
})
