// web2-13 3-b — 「잘못 찍힌 점」 문(isStray)의 단위 팔.
//
// 반증 조건(D-3): 문 바로 위(경계값 = STRAY_MIN_PX)의 획이 정상으로 만들어져야 한다 —
// 아래 경계 팔이 그것이고, e2e(waitfade.spec의 3-b 팔)가 실제 그리기로 같은 경계를
// 양쪽에서 확인한다(아래면 획 0·카운터 +1, 위면 획 1).

import { describe, it, expect } from 'vitest'
import { isStray } from '../src/core/draft'
import { C } from '../src/core/constants'

describe('isStray — 탭 위 · STRAY_MIN_PX 아래만 버린다', () => {
  it('탭 대역(끝점 이동 ≤ TAP_MAX_PX)은 안 걸린다 — 소실점 찍기 경로 불변', () => {
    expect(isStray(C.TAP_MAX_PX, 0)).toBe(false)
    expect(isStray(0, 0)).toBe(false)
    expect(isStray(C.TAP_MAX_PX, C.TAP_MAX_PX)).toBe(false)
  })
  it('탭 위·문 아래 = 버린다(허공의 조그만 대기를 애초에 안 만든다)', () => {
    expect(isStray(C.TAP_MAX_PX + 0.5, C.TAP_MAX_PX + 0.5)).toBe(true)
    expect(isStray(4, 4)).toBe(true)
    expect(isStray(5, C.STRAY_MIN_PX - 0.01)).toBe(true)
  })
  it('경계(bbox = STRAY_MIN_PX)부터는 정상 획 — 반증: 문 바로 위가 억울하지 않다', () => {
    expect(isStray(C.STRAY_MIN_PX, C.STRAY_MIN_PX)).toBe(false)
    expect(isStray(100, 100)).toBe(false)
  })
  it('닫힌 한 붓(끝점은 제자리·bbox는 크다)은 안 걸린다 — 척도가 bbox인 이유', () => {
    // 끝점 이동 3px(탭 아님)인데 bbox 대각 200px — 사각형을 한 붓에 두른 손이다.
    expect(isStray(3, 200)).toBe(false)
  })
  it('문이 탭 문보다 위에 서 있다 — 상수 관계(둘이 뒤집히면 대역이 사라진다)', () => {
    expect(C.STRAY_MIN_PX).toBeGreaterThan(C.TAP_MAX_PX)
  })
})
