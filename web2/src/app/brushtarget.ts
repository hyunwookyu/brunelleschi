// p5.brush 대상 소유(web2-61) — 표준 빌드는 **모듈 전역 싱글턴**이라 활성 대상이 하나다.
// 소비자가 둘이 됐다: 화면 획 겹(brushlayer — #brushc)과 칠 굽기(p5paint — 오프스크린).
// 각자 그리기 직전에 claim()을 부른다 — 같은 대상이면 no-op, 다르면 brush.load(대상).
//
// ⚠ 전환 비용은 0이 아니다: load()가 Renderer를 새로 만들고 gl이 바뀌면 GL 자원(셰이더·
// 버퍼·텍스처 캐시)을 지우고 다시 만든다(gl_draw.isReady — needsContextRefresh).
// 전환의 실측은 원장(bake61)의 switch 행이다 — 그리는 중(미리보기)에는 전환이 없도록
// 호출 구조가 짜여 있다(brushlayer는 문서·뷰가 바뀔 때만 다시 그린다).

import * as brush from 'p5.brush/standalone'

let current: HTMLCanvasElement | null = null
let switches = 0

/** 그리기 직전에 부른다 — 대상이 다르면 갈아탄다(brush.load). */
export function claimBrushTarget(c: HTMLCanvasElement): void {
  if (current === c) return
  brush.load(c)
  current = c
  switches++
}

/** createCanvas 직후 — 그 호출이 이미 대상을 실었다(load 불요 · 전환으로 안 센다). */
export function noteBrushTargetCreated(c: HTMLCanvasElement): void {
  current = c
}

/** 전환 횟수(진단 — 「그리는 중 전환 0」을 수로 잰다) */
export const brushTargetSwitches = (): number => switches
