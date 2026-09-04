// web2-62 — 게이트 ⑥ «설정 65개가 전부 사상된다»의 «사상» 쪽(1차 리뷰어 [M11]): 프리셋이 65 안에 있다(③)만이 아니라
// **엔진이 65개를 전부 읽는가**를 소스에서 센다 — 상태기계(brush.ts)와 표면(surface.ts)이 S.<이름>으로 참조하는 설정의 집합.
// 반증: 참조하지 않는 설정이 있으면 그 이름이 목록으로 남는다(0이어야). 원문(mypaint-brush.c·brushmodes.c)도 65개를 전부 읽는다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SETTINGS } from '../src/mypaint/settings.gen'
import { ENGINE_SETTINGS_READ } from '../src/app/mypaintpaint'

describe('62 ⑥ 사상 — 엔진이 읽는 설정', () => {
  it('brush.ts + surface.ts가 참조하는 S.<설정>이 65개 전부다(안 읽는 설정 0)', () => {
    const src = readFileSync(resolve(__dirname, '../src/mypaint/brush.ts'), 'utf8') + readFileSync(resolve(__dirname, '../src/mypaint/surface.ts'), 'utf8')
    const used = new Set<string>()
    for (const m of src.matchAll(/\bS\.([A-Z0-9_]+)\b/g)) used.add(m[1]!)
    const all = SETTINGS.map(s => s.id.toUpperCase())
    const unread = all.filter(n => !used.has(n))
    expect(all.length).toBe(65)
    // 원문 실측: mypaint-brush.c·brushmodes.c가 RESTORE_COLOR를 한 번도 안 읽는다(grep 0) — 「Save color」는 앱(획 뒤 색 되돌리기)의
    // 설정이지 엔진의 것이 아니다. 엔진이 읽는 것은 64/65이고, 그 하나는 원문과 같은 자리다(값으로 남긴다).
    expect(unread, '엔진이 참조하지 않는 설정 — 원문도 안 읽는 restore_color 하나뿐').toEqual(['RESTORE_COLOR'])
    expect(used.size, '엔진이 읽는 설정 수').toBe(64)
    expect(ENGINE_SETTINGS_READ, '원장에 실리는 상수(probe.mapping.engine_reads)가 소스 실측과 같다').toBe(used.size)
  })
})
