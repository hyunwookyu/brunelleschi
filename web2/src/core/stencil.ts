// 사람 스텐실(web2-47 47-2) — **기기에 저장한다**(지시: 문서가 아니다 — 사람은 그리는
// 사람에게 붙는다). 그리는 캔버스에는 **가로선이 하나 그어져 있다 — 그것이 눈높이다**:
// 거기 눈을 맞춰 그리면, 놓았을 때 눈이 지평선에 정확히 얹힌다(이 앱의 근본 사실 —
// 카메라가 지면 위 눈높이에 있으므로 지평선 = 눈높이. pointOnGround 머리주석).
//
// 배치 수학(표시 계층이 쓴다): 접지점 g(y=0)와 눈점 e = eyeAbove(g)(camera.ts — 출처 하나)를 각각
// 정확히 사영하고, 화면에서 스텐실을 (발끝 행 ↔ g) · (눈높이 행 ↔ e)로 늘린다 — 세로가
// 정확하고(눈이 지평선에 앉는 것이 구성이 된다) 가로는 화면 평행(빌보드 — 지시 문면).
//
// ⚠ **기본 스텐실은 비어 있다**(지시: 「사용자가 그려서 줄 것이다. 없으면 자리만 잡아
// 두고 보고하라」) — 여기서는 자리(저장 형식·읽고 쓰기)만 세우고 그림을 지어내지 않는다.
// 같은 틀로 가구·나무까지 열어 두되 이번엔 사람만(키 목록이 그 자리다).

export interface Stencil {
  /** 그린 폴리라인들(캔버스 px — 원본 그대로) */
  lines: { x: number; y: number }[][]
  /** 눈높이 행(캔버스 px) — 캔버스에 그어 둔 그 가로선 */
  eyeY: number
  /** 발끝 행(캔버스 px) — 캔버스 바닥(그리기 규약: 바닥에 서 있게 그린다) */
  footY: number
}

const KEY = 'b2-stencil-person'

// node(단위 팔)에는 localStorage가 없다 — 메모리 폴백(같은 표면 · 기기 저장의 대역).
const mem = new Map<string, string>()
const store = {
  get: (k: string): string | null =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (mem.get(k) ?? null),
  set: (k: string, v: string): void => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); else mem.set(k, v)
  },
  del: (k: string): void => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(k); else mem.delete(k)
  },
}

export function loadStencil(): Stencil | null {
  try {
    const raw = store.get(KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    if (!Array.isArray(j.lines) || typeof j.eyeY !== 'number' || typeof j.footY !== 'number') return null
    if (!(j.footY > j.eyeY)) return null              // 발이 눈 아래여야 배치 배율이 선다
    return { lines: j.lines, eyeY: j.eyeY, footY: j.footY }
  } catch { return null }
}

export function saveStencil(s: Stencil): void {
  store.set(KEY, JSON.stringify(s))
}

export function clearStencil(): void {
  store.del(KEY)
}
