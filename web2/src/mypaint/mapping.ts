// libmypaint mypaint-mapping.c의 이식(web2-62 · ISC) — 설정 하나의 «입력 → 값» 사상.
// base_value + 입력마다 조각선형 곡선(제어점 ≤ 64)의 합. 분기·보간식은 C 원문 그대로다
// (특히 «x0 == x1 || y0 == y1 이면 y0» — 정리하지 않는다).

import { INPUTS_COUNT } from './settings.gen'

interface ControlPoints { xs: number[]; ys: number[] }

export class Mapping {
  baseValue = 0
  private readonly points: (ControlPoints | null)[]
  private inputsUsed = 0

  constructor(readonly inputs: number = INPUTS_COUNT) {
    this.points = new Array<ControlPoints | null>(inputs).fill(null)
  }

  /** 제어점 수를 정한다(0 = 곡선 없음). n == 1은 C의 assert 그대로 거부한다. */
  setN(input: number, n: number): void {
    if (input < 0 || input >= this.inputs) throw new Error(`mapping: 입력 색인 ${input}`)
    if (n < 0 || n > 64 || n === 1) throw new Error(`mapping: 제어점 수 ${n}`)
    const p = this.points[input]
    if (n !== 0 && !p) this.inputsUsed++
    if (n === 0 && p) this.inputsUsed--
    this.points[input] = n === 0 ? null : { xs: new Array<number>(n).fill(0), ys: new Array<number>(n).fill(0) }
  }

  getN(input: number): number { return this.points[input]?.xs.length ?? 0 }

  setPoint(input: number, index: number, x: number, y: number): void {
    const p = this.points[input]
    if (!p || index < 0 || index >= p.xs.length) throw new Error(`mapping: 점 ${input}/${index}`)
    if (index > 0 && x < p.xs[index - 1]!) throw new Error(`mapping: x가 감소한다(${input}/${index})`)
    p.xs[index] = x; p.ys[index] = y
  }

  getPoint(input: number, index: number): [number, number] {
    const p = this.points[input]!
    return [p.xs[index]!, p.ys[index]!]
  }

  isConstant(): boolean { return this.inputsUsed === 0 }
  getInputsUsedN(): number { return this.inputsUsed }

  calculate(data: ArrayLike<number>): number {
    let result = this.baseValue
    if (this.inputsUsed === 0) return result
    for (let j = 0; j < this.inputs; j++) {
      const p = this.points[j]
      if (!p) continue
      const x = data[j]!
      let x0 = p.xs[0]!, y0 = p.ys[0]!, x1 = p.xs[1]!, y1 = p.ys[1]!
      for (let i = 2; i < p.xs.length && x > x1; i++) {
        x0 = x1; y0 = y1; x1 = p.xs[i]!; y1 = p.ys[i]!
      }
      let y: number
      if (x0 === x1 || y0 === y1) y = y0
      else y = (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0)
      result += y
    }
    return result
  }
}
