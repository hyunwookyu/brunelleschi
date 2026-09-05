// 칠 연필·목탄의 **경도 축**(web2-68 §2) — 필통 칸의 경도 글자 ↔ 프리셋 이름의 사상.
//
// 사람 판정(2026-09-05): 「칠 도구에서 '연필'은 결국 경도별로 있어야 할 텐데 HB~8B까지면
// 되겠다. 목탄도 경도별로.」 **§2 개정**(web2-68-amend.md — 사람 판정 2026-09-05): 196 안에 경도 가족은
// 없다(paint68 1차 표) → 경도 축은 **한 뿌리 프리셋의 매개 가족**이다(classic/pencil · classic/charcoal —
// opaque는 목표 농도에 되먹임 · 반지름 등비 · hardness 등차 · 작가를 가로지르지 않는다 — app/brushes64.ts).
//
// **경도 = 프리셋 이름**이다 — 획은 이미 br을 든다(64-1)라 저장 형식 무변(KEY_ORDER 무변이
// 게이트). 옛 문서의 classic/pencil은 HB로 읽힌다(이주 없음). 제도 연필의 등급(2H~2B ·
// material.ts PENCIL_GRADES · app.grade)은 **다른 도구**라 안 건드린다 — 이 표는 칠의 것이다.
//
// 값의 근거는 원장 `stage0/out/paint68_web2_dpr{1,2}.json`(fit 절 — 목표·도달·opaque · 가족 표 — 단조 판정)이다.
//
// core에 두는 이유: DOM도 엔진도 안 쓰는 순수 표라 단위 시험이 브라우저 없이 전수를 돈다.

/** 칠 연필 경도 여섯 — 사람 값 「HB~8B」. 차례가 «무러지는 차례»다(끌기 몸짓의 축). */
export const PENCIL_GRADES68 = ['HB', 'B', '2B', '4B', '6B', '8B'] as const
export type PencilGrade68 = typeof PENCIL_GRADES68[number]

/** 칠 목탄 경도 셋 — 사람 「목탄도 경도별로」 · 수는 세션이 정했다(실물 목탄이 H/M/S 셋). */
export const CHARCOAL_GRADES68 = ['경', '중', '연'] as const
export type CharcoalGrade68 = typeof CHARCOAL_GRADES68[number]

/** 경도 → 프리셋 이름(연필) — **한 뿌리(classic/pencil)의 매개 가족**(web2-68 §2 개정 · app/brushes64 PENCIL_FAMILY).
 *  HB도 등재한다(이름이 곧 경도) · 옛 획의 classic/pencil은 HB로 «읽힌다»(gradeOfPreset이 뿌리를 HB로 본다 · 이주 없음). */
export const PENCIL_PRESET_OF_GRADE: Readonly<Record<PencilGrade68, string>> = {
  HB: 'brunelleschi/pencil_HB',
  B: 'brunelleschi/pencil_B',
  '2B': 'brunelleschi/pencil_2B',
  '4B': 'brunelleschi/pencil_4B',
  '6B': 'brunelleschi/pencil_6B',
  '8B': 'brunelleschi/pencil_8B',
}

/** 경도 → 프리셋 이름(목탄) — 뿌리 classic/charcoal의 매개 가족(중 = 뿌리 그대로 · 경/연 = 개정 문면의 매개). */
export const CHARCOAL_PRESET_OF_GRADE: Readonly<Record<CharcoalGrade68, string>> = {
  경: 'brunelleschi/charcoal_H',
  중: 'brunelleschi/charcoal_M',
  연: 'brunelleschi/charcoal_S',
}

export type Grade68 = { kind: 'pencil'; grade: PencilGrade68 } | { kind: 'charcoal'; grade: CharcoalGrade68 }

/** 옛 문서·옛 칸의 뿌리 이름 → 경도(이주 없이 «읽는다»): classic/pencil = HB · classic/charcoal = 중 */
const ROOT_GRADE: Readonly<Record<string, Grade68>> = {
  'classic/pencil': { kind: 'pencil', grade: 'HB' },
  'classic/charcoal': { kind: 'charcoal', grade: '중' },
}

/** 프리셋 이름 → 경도(경도 축에 있는 프리셋만 · 없으면 null — 그 칸은 경도 글자가 없다). */
export function gradeOfPreset(br: string): Grade68 | null {
  const root = ROOT_GRADE[br]
  if (root) return root
  for (const g of PENCIL_GRADES68) if (PENCIL_PRESET_OF_GRADE[g] === br) return { kind: 'pencil', grade: g }
  for (const g of CHARCOAL_GRADES68) if (CHARCOAL_PRESET_OF_GRADE[g] === br) return { kind: 'charcoal', grade: g }
  return null
}

/** 경도를 n칸 옮긴 프리셋(끌기 몸짓 — 제도 연필 pencilDrag와 같은 감각: 아래로 밀면 무른 쪽).
 *  축 밖 프리셋이면 그대로 돌려준다(경도가 없으니 끌 것이 없다). */
export function shiftGrade(br: string, step: number): string {
  const g = gradeOfPreset(br)
  if (!g) return br
  if (g.kind === 'pencil') {
    const i = Math.min(PENCIL_GRADES68.length - 1, Math.max(0, PENCIL_GRADES68.indexOf(g.grade) + step))
    return PENCIL_PRESET_OF_GRADE[PENCIL_GRADES68[i]!]
  }
  const i = Math.min(CHARCOAL_GRADES68.length - 1, Math.max(0, CHARCOAL_GRADES68.indexOf(g.grade) + step))
  return CHARCOAL_PRESET_OF_GRADE[CHARCOAL_GRADES68[i]!]
}

/** 경도 축의 프리셋 전수(연필 여섯 + 목탄 셋) — 라벨·존재 검증·사진이 돈다. */
export const GRADE_PRESETS68: readonly string[] = [
  ...PENCIL_GRADES68.map(g => PENCIL_PRESET_OF_GRADE[g]),
  ...CHARCOAL_GRADES68.map(g => CHARCOAL_PRESET_OF_GRADE[g]),
]
