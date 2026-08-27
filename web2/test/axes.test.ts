// 축은 셋이다 (web2-03 지시 1)
//
// 사람이 만든 소실점 말고 **하나가 더 생겨** 축 스냅이 거기 걸렸다. 표식이 낸 실측:
//
//   2점(지평선 + 깊이선 둘) — 사람이 만든 소실점 2, 그런데 궤도 시점의 ✕ 표식은 **3개**.
//   여분은 `H`(화면 평행 가로)이고 vp0과 52.2388°, vp1과 142.2388°다 — 둘 다 직교가 아니다.
//   축 스냅은 커서 360°를 5°씩 훑을 때 **72방향 중 10을 H가 가져갔다**.
//
//   1점(지평선 + 깊이선 하나) — 축은 셋인데 vp0·H가 **73.9677°**다. 여기서는 H가 진짜
//   세 축의 하나인데 직교가 깨져 있다. 그래서 1점 상자의 바닥이 탑뷰에서 평행사변형이 된다.
//
// 한 문장으로: **`an.axes`(스냅 후보)가 정규직교 프레임이 아니었다.**
//
// ── D-3 반증 조건 ──────────────────────────────────────────────────────
// 이 파일의 팔은 전부 되살려 확인했다(NOTES의 표). 되살리는 자리는 둘이다:
//   ① `analyze`에서 H를 무조건 넣으면(2점에서도) → 「축은 셋이다」 계열이 빨개진다
//   ② 1점 주점 보정(`principal.x = vps[0].x`)을 지우면 → 직교 계열이 빨개진다
// ⚠ **2점의 `vp0·vp1 = 0`에는 임계를 안 건다** — f² = −u₁u₂로 만든 값이라 언제나 0이고,
//   그것을 재면 항등을 재는 것이다(자기참조 유형 3). 판별력은 **H가 낀 쌍**에 있다.

import { describe, it, expect } from 'vitest'
import { session } from './session'
import { analyze, screenAxes, vpMarks, frameAxes, DRAW_POSE, type Analysis } from '../src/core/camera'
import { snapDir } from '../src/core/snap'
import { quatAxisAngle, type V3 } from '../src/core/vec'

const HZ = [100, 400, 1100, 400] as const
const ORBIT = { p: { x: 3, y: 1.6, z: 3 }, q: quatAxisAngle({ x: 0, y: 1, z: 0 }, 0.4) }

const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const angDeg = (a: V3, b: V3) =>
  Math.acos(Math.max(-1, Math.min(1, dot3(a, b)))) * 180 / Math.PI

/** 지평선 + 깊이선 하나 = 1점 공간 */
function onePoint(vpx = 900) {
  const s = session(1200, 800)
  s.draw(...HZ)
  s.app.doc.strokes.push({ id: 900, a: { x: vpx, y: 400 }, b: { x: vpx, y: 400 } })
  return s
}
/** 지평선 + 깊이선 둘 = 2점 공간 */
function twoPoint() {
  const s = session(1200, 800)
  s.draw(...HZ); s.draw(500, 500, 600, 475); s.draw(500, 500, 400, 475)
  return s
}

describe('1-d — 축은 셋이다', () => {
  it('1점: 소실점 1 · 축 후보 3', () => {
    const an = analyze(onePoint().app.doc)
    expect(an.vps).toHaveLength(1)
    expect(an.axes).toHaveLength(3)
    expect(an.axes.map(a => a.id).sort()).toEqual(['H', 'V', 'vp0'])
  })

  it('2점: 소실점 2 · 축 후보 3 — H는 프레임 밖이라 후보가 아니다', () => {
    const an = analyze(twoPoint().app.doc)
    expect(an.vps).toHaveLength(2)
    expect(an.axes).toHaveLength(3)
    expect(an.axes.map(a => a.id).sort()).toEqual(['V', 'vp0', 'vp1'])
    expect(an.axes.some(a => a.id === 'H')).toBe(false)
  })

  it('소실점 전에는 셋이 아니다 — 0을 억지로 채우지 않는다(web2-17: 빈 문서부터 H·V)', () => {
    const s = session(1200, 800)
    const bare = analyze(s.app.doc)                    // 빈 문서 — 지평선은 상시(H/2)
    expect(bare.axes).toHaveLength(2)                  // 화면 가로·세로만. 깊이가 아직 없다
    expect(bare.axes.map(a => a.id).sort()).toEqual(['H', 'V'])
    expect(frameAxes(bare)).toBeNull()
    s.draw(...HZ)                                      // 지평선 따라긋기(퇴화) — 변화 없다
    const an = analyze(s.app.doc)
    expect(an.axes).toHaveLength(2)
    expect(frameAxes(an)).toBeNull()
  })

  it('축 후보 == 정규직교 프레임 — 목록이 둘로 갈리지 않는다', () => {
    for (const s of [onePoint(), onePoint(300), twoPoint()]) {
      const an = analyze(s.app.doc)
      const fr = frameAxes(an)!
      expect(fr.map(a => a.id).sort()).toEqual(an.axes.map(a => a.id).sort())
    }
  })
})

describe('1-d — 그 셋은 서로 직교한다', () => {
  const pairs = (an: Analysis) => {
    const out: { pair: string; dot: number; deg: number }[] = []
    for (let i = 0; i < an.axes.length; i++) for (let j = i + 1; j < an.axes.length; j++) {
      out.push({
        pair: `${an.axes[i]!.id}·${an.axes[j]!.id}`,
        dot: dot3(an.axes[i]!.dir, an.axes[j]!.dir),
        deg: angDeg(an.axes[i]!.dir, an.axes[j]!.dir),
      })
    }
    return out
  }

  it('1점 — 세 쌍 전부 내적 0 (vp0·H가 73.9677°였다)', () => {
    const rows = pairs(analyze(onePoint().app.doc))
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect(Math.abs(r.dot), r.pair).toBeLessThan(1e-12)
      expect(r.deg, r.pair).toBeCloseTo(90, 9)
    }
  })

  it('2점 — 세 쌍 전부 내적 0 (vp0·H가 52.2388°였다)', () => {
    const rows = pairs(analyze(twoPoint().app.doc))
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(Math.abs(r.dot), r.pair).toBeLessThan(1e-12)
  })

  it('소실점을 화면 어디에 두든 직교다 — 안팎 여덟 자리', () => {
    for (const vpx of [-2000, -300, 150, 400, 600, 900, 1400, 4000]) {
      const an = analyze(onePoint(vpx).app.doc)
      expect(an.vps, `vpx=${vpx}`).toHaveLength(1)
      for (const r of pairs(an)) {
        expect(Math.abs(r.dot), `vpx=${vpx} ${r.pair}`).toBeLessThan(1e-12)
      }
    }
  })

  it('궤도해도 그대로다 — 축은 세계 방향이고 포즈는 보는 자리다', () => {
    const s = onePoint()
    const before = pairs(analyze(s.app.doc))
    s.app.pose = ORBIT
    const after = pairs(analyze(s.app.doc))
    expect(after.map(r => r.dot)).toEqual(before.map(r => r.dot))
  })
})

describe('1-e — 사람이 만든 것만 소실점 표식이 된다', () => {
  /** 그 포즈에서 ✕ 표식이 그려지는 축 — **앱과 같은 함수**를 부른다(render2d·osnap이 이것을 쓴다) */
  const marks = (an: Analysis, pose: typeof DRAW_POSE) => vpMarks(an, pose).map(a => a.id)

  it('작도 시점 — 표식 수 == 사람이 만든 소실점 수', () => {
    expect(marks(analyze(onePoint().app.doc), DRAW_POSE)).toEqual(['vp0'])
    expect(marks(analyze(twoPoint().app.doc), DRAW_POSE).sort()).toEqual(['vp0', 'vp1'])
  })

  it('**궤도 시점에서도** 표식 수 == 사람이 만든 소실점 수 (여기서 여분이 보였다)', () => {
    // 이 팔이 이 항목의 판별자다. 고치기 전 실측:
    //   1점 → vp0(1444,400) **H(-1869,400)** 2개
    //   2점 → vp0(1290,400) vp1(382,400) **H(-316,400)** 3개
    // 사람이 「보조 소실점처럼 보인다」고 한 것이 그 H다.
    // 1점의 H는 **프레임 안에 남는다**(진짜 축이다) — 지운 것은 그 축의 ✕ 표식뿐이다.
    expect(screenAxes(analyze(onePoint().app.doc), ORBIT).find(a => a.id === 'H')?.vp).toBeTruthy()
    expect(marks(analyze(onePoint().app.doc), ORBIT)).toEqual(['vp0'])
    expect(marks(analyze(twoPoint().app.doc), ORBIT).sort()).toEqual(['vp0', 'vp1'])
  })

  it('반례: 화면 평행 축은 원래 표식이 없다 — 무한원이므로', () => {
    // 「표식 수 == vps 수」가 **H를 지워서** 맞는 것이지, 표식 계산이 무너져서가 아니다.
    // 1점의 H는 프레임 안에 남아 있고, 작도 시점에서 무한원이라 표식이 없다.
    const an = analyze(onePoint().app.doc)
    const inf = screenAxes(an, DRAW_POSE).filter(a => !a.vp).map(a => a.id).sort()
    expect(inf).toEqual(['H', 'V'])
  })
})

describe('1-e — 그 방향으로만 선이 그어진다', () => {
  /** 커서 360°를 5°씩 훑어 축 스냅이 무엇을 고르는지 센다 */
  const capture = (an: Analysis) => {
    const start = { x: 500, y: 600 }
    const hit: Record<string, number> = {}
    for (let t = 0; t < 360; t += 5) {
      const c = { x: start.x + 200 * Math.cos(t * Math.PI / 180), y: start.y + 200 * Math.sin(t * Math.PI / 180) }
      const id = snapDir(an, DRAW_POSE, start, c).axis ?? 'free'
      hit[id] = (hit[id] ?? 0) + 1
    }
    return hit
  }

  it('2점 — 포획이 vp0·vp1·V 셋으로만 갈린다 (H가 10/72를 가져갔다)', () => {
    const hit = capture(analyze(twoPoint().app.doc))
    expect(Object.keys(hit).sort()).toEqual(['V', 'vp0', 'vp1'])
    expect(hit.H).toBeUndefined()
    expect(Object.values(hit).reduce((a, b) => a + b, 0)).toBe(72)
  })

  it('1점 — 포획이 vp0·H·V 셋으로만 갈린다', () => {
    const hit = capture(analyze(onePoint().app.doc))
    expect(Object.keys(hit).sort()).toEqual(['H', 'V', 'vp0'])
    expect(Object.values(hit).reduce((a, b) => a + b, 0)).toBe(72)
  })

  it('반례: 자유 방향이 나오지 않는다 — 임계가 없다(web2-01 지시 5-a)', () => {
    for (const an of [analyze(onePoint().app.doc), analyze(twoPoint().app.doc)]) {
      expect(capture(an).free).toBeUndefined()
    }
  })
})
