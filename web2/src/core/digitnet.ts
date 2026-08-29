// 번들 숫자 인식 모형(web2-10 지시 8-b ②) — 784→64 ReLU→10 MLP, int8 양자화 ≈68KB.
//
// 왜 이것인가: $P는 제스처 인식기다 — 템플릿 하나에 필체 하나·획 수 민감·분절 불가라
// 숫자 필기에 원리적으로 안 맞는다(지시 문면 — 실기기 관측이 AS-C24를 반증했다).
// 손글씨 숫자 열 개는 가장 잘 풀린 문제이고, 작은 MLP면 오프라인 PWA에 실을 수 있다.
//
// 가중치의 출처와 라이선스(§3 — 라이선스 없는 코드 편입 금지의 자리):
//   이 저장소가 **직접 학습**했다(tools/train_digitnet.py — numpy만. 외부 코드 없음).
//   데이터는 MNIST(NIST SD-19 유래 · 배포처들이 CC BY-SA 3.0으로 표기) — 그래서
//   **가중치 파일(digitnet_weights.json)은 CC BY-SA 3.0**으로 두고 출처를 LICENSE에
//   병기한다. 추론 코드(이 파일)는 저장소 라이선스(MIT) 그대로다.
//   정확도 원장: stage0/out/digitnet_mnist.json (MNIST test 10k · 숫자별 분자/분모 —
//   int8 전체 9678/10000).
//
// 전처리는 MNIST의 구성 그대로다: 긴 변을 20px로 등비 축소 → 28×28 캔버스 →
// **질량 중심을 (14,14)로** 이동. 이것이 다르면 학습 분포와 어긋나 정확도가 그냥 준다.

import type { Pt } from './vec'
import { C } from './constants'
import W from './digitnet_weights.json'

const IN = 28, BOX = 20

const b64i8 = (s: string): Int8Array => {
  const bin = atob(s)
  const a = new Int8Array(bin.length)
  for (let i = 0; i < bin.length; i++) { const v = bin.charCodeAt(i); a[i] = v > 127 ? v - 256 : v }
  return a
}
const w1 = b64i8(W.w1), w2 = b64i8(W.w2)
const H = W.arch[1]!

/** 획 묶음 → 28×28 회색조(0..1) — 선분을 굵기 반경 1.3px로 찍는다(브라우저 캔버스 불요 —
 *  단위 시험과 앱이 같은 함수를 쓴다, #62).
 *
 *  ⚠⚠ **가로세로비 정규화**(web2-32 4번 · `alpha`) — 30-8의 실측이 가리킨 자리다:
 *  자형이 아니라 **비**가 가장 큰 축이었다(비 0.65에서 6/20 ↔ 비 1.00에서 18/20 ·
 *  `glyph30_web2.json`). 원인은 전처리가 **긴 변으로만** 맞춰(비를 그대로 보존해) 좁게 쓴
 *  글자가 28×28의 가로 13px만 채우는 것이다. `alpha`가 그 비를 얼마나 펴는가다:
 *    alpha = 0 → 종전(비 보존) · alpha = 1 → 두 축을 다 채운다(비를 통째로 버린다)
 *  **완전히 버리지 않는다**(지시 문면): 비는 «1»과 «0»을 가르는 데 쓸모가 있고, 지배적이면
 *  안 될 뿐이다. 값의 근거는 `glyph32_web2.json`의 alpha 훑기다. */
export function rasterize(strokes: Pt[][], alpha = 0): Float32Array | null {
  let lox = Infinity, loy = Infinity, hix = -Infinity, hiy = -Infinity
  for (const st of strokes) for (const p of st) {
    lox = Math.min(lox, p.x); loy = Math.min(loy, p.y)
    hix = Math.max(hix, p.x); hiy = Math.max(hiy, p.y)
  }
  if (!(hix >= lox)) return null
  const span = Math.max(hix - lox, hiy - loy, 1e-6)
  // 두 축의 배율 — alpha가 0이면 둘 다 `BOX/span`(종전), 1이면 각 축이 제 변으로 맞는다.
  // ⚠ 아주 좁은 글자(«1»은 폭이 0에 가깝다)를 무한정 늘리지 않게 **바닥**을 둔다.
  const floor = span * C.DIGIT_ASPECT_FLOOR
  const wq = Math.max(hix - lox, floor), hq = Math.max(hiy - loy, floor)
  const sx = BOX / (Math.pow(span, 1 - alpha) * Math.pow(wq, alpha))
  const sy = BOX / (Math.pow(span, 1 - alpha) * Math.pow(hq, alpha))
  const img = new Float32Array(IN * IN)
  const R = 1.3
  const stamp = (x: number, y: number) => {
    for (let iy = Math.max(0, Math.floor(y - R)); iy <= Math.min(IN - 1, Math.ceil(y + R)); iy++)
      for (let ix = Math.max(0, Math.floor(x - R)); ix <= Math.min(IN - 1, Math.ceil(x + R)); ix++) {
        const d = Math.hypot(ix - x, iy - y)
        const v = Math.max(0, 1 - d / R)
        const k = iy * IN + ix
        if (v > img[k]!) img[k] = v
      }
  }
  const ox = (IN - (hix - lox) * sx) / 2, oy = (IN - (hiy - loy) * sy) / 2
  for (const st of strokes) {
    if (st.length === 1) stamp((st[0]!.x - lox) * sx + ox, (st[0]!.y - loy) * sy + oy)
    for (let i = 1; i < st.length; i++) {
      const a = st[i - 1]!, b = st[i]!
      const ax = (a.x - lox) * sx + ox, ay = (a.y - loy) * sy + oy
      const bx = (b.x - lox) * sx + ox, by = (b.y - loy) * sy + oy
      const L = Math.hypot(bx - ax, by - ay)
      const n = Math.max(1, Math.ceil(L / 0.5))
      for (let t = 0; t <= n; t++) stamp(ax + (bx - ax) * t / n, ay + (by - ay) * t / n)
    }
  }
  // 질량 중심을 (14,14)로 — 정수 이동(MNIST의 구성 규약)
  let mx = 0, my = 0, m = 0
  for (let y = 0; y < IN; y++) for (let x = 0; x < IN; x++) {
    const v = img[y * IN + x]!; m += v; mx += v * x; my += v * y
  }
  if (m <= 0) return null
  const dx = Math.round(IN / 2 - mx / m), dy = Math.round(IN / 2 - my / m)
  const out = new Float32Array(IN * IN)
  for (let y = 0; y < IN; y++) for (let x = 0; x < IN; x++) {
    const qx = x - dx, qy = y - dy      // ⚠ 위 배율(sx·sy)과 이름을 안 겹치게 둔다
    if (qx >= 0 && qx < IN && qy >= 0 && qy < IN) out[y * IN + x] = img[qy * IN + qx]!
  }
  return out
}

const K = W.arch[2]!   // 11 — 0~9 + **잡음 클래스 10**(softmax 확신만으로는 거부가 안
                       // 갈렸다: 옳은 최악 0.584 vs 잡음 최선 0.547. 비숫자를 명시적으로 배웠다)

/** 글리프 하나 → { ch, p(softmax 확신) }. 잡음 클래스(10)가 이기면 null(거부).
 *  남은 거부는 부르는 쪽이 임계(NET_REJECT)로 가른다. */
export function classifyGlyph(strokes: Pt[][], alpha = 0): { ch: string; p: number } | null {
  const x = rasterize(strokes, alpha)
  if (!x) return null
  const h = new Float32Array(H)
  for (let j = 0; j < H; j++) {
    let a = W.b1[j]!
    for (let i = 0; i < IN * IN; i++) a += x[i]! * w1[i * H + j]! * W.s1
    h[j] = a > 0 ? a : 0
  }
  const z = new Float32Array(K)
  let zmax = -Infinity
  for (let k = 0; k < K; k++) {
    let a = W.b2[k]!
    for (let j = 0; j < H; j++) a += h[j]! * w2[j * K + k]! * W.s2
    z[k] = a
    if (a > zmax) zmax = a
  }
  let sum = 0
  for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k]! - zmax); sum += z[k]! }
  let best = 0
  for (let k = 1; k < K; k++) if (z[k]! > z[best]!) best = k
  if (best === 10) return null                       // 숫자가 아니다 — 배운 거부
  return { ch: String(best), p: z[best]! / sum }
}
