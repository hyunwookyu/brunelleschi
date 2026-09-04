// p5.brush standalone(dist/brush.esm.js)의 타입 — 패키지에 .d.ts가 없어 우리가 쓰는
// 표면만 선언한다. 시그니처의 근거는 docs/standalone.md와 dist 소스의 export 목록
// (web2-11 2부 — NOTES에 실측 기록).
declare module 'p5.brush/standalone' {
  export function createCanvas(w: number, h: number, opts?: {
    parent?: string | HTMLElement; pixelDensity?: number; id?: string
  }): HTMLCanvasElement
  export function load(canvas: HTMLCanvasElement): void
  export function scaleBrushes(s: number): void
  /** 내부 RNG 시드 — 결정론(계약 3). 획 id로 고정한다. */
  export function seed(n: number): void
  export function noiseSeed(n: number): void
  export function box(): string[]
  export function add(name: string, params: Record<string, unknown>): void
  export function set(name: string, color: string, weight?: number): void
  export function pick(name: string): void
  export function stroke(color: string): void
  export function strokeWeight(w: number): void
  export function noStroke(): void
  export function line(x1: number, y1: number, x2: number, y2: number): void
  /** 점별 필압 폴리라인 — [[x, y, pressure], ...] · curvature 0이면 직선 세그먼트 */
  export function spline(pts: [number, number, number][], curvature?: number): unknown
  export function push(): void
  export function pop(): void
  export function translate(x: number, y: number): void
  export function scale(x: number, y?: number): void
  export function clear(color?: string): void
  /** 합성 플러시 — 프레임마다 한 번 */
  export function render(): void
}

// **칠 전용 두 번째 사본**(web2-61 — vite.config resolve.alias가 같은 파일을 다른 모듈 id로
// 싣는다: 모듈 싱글턴 상태를 선 겹과 나누지 않기 위해서다. 표면은 위와 동일).
declare module 'p5.brush-paint' {
  export * from 'p5.brush/standalone'
}
