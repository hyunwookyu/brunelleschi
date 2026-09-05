// 칠 연필·목탄의 **경도 축**(web2-68 §2) — 필통 칸의 경도 글자 ↔ 프리셋 이름의 사상.
//
// 사람 판정(2026-09-05): 「칠 도구에서 '연필'은 결국 경도별로 있어야 할 텐데 HB~8B까지면
// 되겠다. 목탄도 경도별로.」 값을 짓지 않는다(A-3 · 62): 여섯 자리는 mypaint-brushes(CC0)
// 196에서 꺼낸 것과 **그 두 프리셋 사이의 선형 보간**(brunelleschi/pencil_4B · _6B —
// app/brushes64.ts가 tanda/pencil-2b ↔ 8b의 base_value를 1/3 · 2/3로 섞는다)뿐이다.
//
// **경도 = 프리셋 이름**이다 — 획은 이미 br을 든다(64-1)라 저장 형식 무변(KEY_ORDER 무변이
// 게이트). 옛 문서의 classic/pencil은 HB로 읽힌다(이주 없음). 제도 연필의 등급(2H~2B ·
// material.ts PENCIL_GRADES · app.grade)은 **다른 도구**라 안 건드린다 — 이 표는 칠의 것이다.
//
// 배치의 근거는 원장 `stage0/out/paint68_web2_dpr{1,2}.json`(후보 열다섯의 농도·반최대 폭 표 —
// 단조 판정)이다. 표가 어긋나면 그 자리를 tanda 축 보간으로 채운다(지시 §2 방법 3).
//
// core에 두는 이유: DOM도 엔진도 안 쓰는 순수 표라 단위 시험이 브라우저 없이 전수를 돈다.

/** 칠 연필 경도 여섯 — 사람 값 「HB~8B」. 차례가 «무러지는 차례»다(끌기 몸짓의 축). */
export const PENCIL_GRADES68 = ['HB', 'B', '2B', '4B', '6B', '8B'] as const
export type PencilGrade68 = typeof PENCIL_GRADES68[number]

/** 칠 목탄 경도 셋 — 사람 「목탄도 경도별로」 · 수는 세션이 정했다(실물 목탄이 H/M/S 셋). */
export const CHARCOAL_GRADES68 = ['경', '중', '연'] as const
export type CharcoalGrade68 = typeof CHARCOAL_GRADES68[number]

/** 경도 → 프리셋 이름(연필). 출발 배치(지시 §2 방법 2) → 원장 paint68의 단조 표로 확정.
 *  ⚠ 4B·6B는 앱 프리셋(두 CC0의 사이 — brushes64.ts) · 나머지는 mypaint-brushes 원문 그대로. */
export const PENCIL_PRESET_OF_GRADE: Readonly<Record<PencilGrade68, string>> = {
  HB: 'classic/pencil',
  B: 'ramon/B-pencil',             // 출발 배치(지시 §2 방법 2) — 원장 paint68의 단조 표가 확정한다
  '2B': 'tanda/pencil-2b',
  '4B': 'brunelleschi/pencil_4B',  // tanda 2b↔8b 보간 1/3(출발 배치 — brushes64.ts)
  '6B': 'brunelleschi/pencil_6B',  // tanda 2b↔8b 보간 2/3(출발 배치)
  '8B': 'tanda/pencil-8b',
}

/** 경도 → 프리셋 이름(목탄). 후보 넷(blur1 제외 — «번짐»은 경도 축이 아니다)을 같은 자로 재 앉힌다 — 출발 배치는 hardness·radius 차례, 확정은 원장. */
export const CHARCOAL_PRESET_OF_GRADE: Readonly<Record<CharcoalGrade68, string>> = {
  경: 'tanda/charcoal-01',
  중: 'tanda/charcoal-03',
  연: 'tanda/charcoal-04',
}

export type Grade68 = { kind: 'pencil'; grade: PencilGrade68 } | { kind: 'charcoal'; grade: CharcoalGrade68 }

/** 프리셋 이름 → 경도(경도 축에 있는 프리셋만 · 없으면 null — 그 칸은 경도 글자가 없다). */
export function gradeOfPreset(br: string): Grade68 | null {
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
