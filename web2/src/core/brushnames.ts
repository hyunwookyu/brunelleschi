// 브러시 이름의 **사람 쪽 사상**(web2-65 §2 ③) — `ramon/100%_Opaque` 같은 mypaint 원
// 이름이 화면에 그대로 나오던 것을 사람이 읽는 이름으로 옮긴다.
//
// 규칙 셋:
//   ① **원 이름은 안 없앤다.** 도움말(title)과 목록의 부제에 그대로 남는다 — 브러시를
//      원문(mypaint-brushes · CC0)과 대조할 사람이 있고, 우리가 지은 이름은 «표시»일 뿐이다.
//   ② **정확 표가 먼저다.** 앱이 슬롯 기본·필통 기본·팁 기본으로 실제로 쓰는 이름은 손으로 짓는다.
//   ③ 나머지는 **낱말 사상**으로 옮기고, 아는 낱말이 하나도 없으면 **원 이름을 정돈해서 쓴다**
//      (없는 뜻을 지어내지 않는다 — A-3 · 짓는 것보다 두는 것이 낫다).
//
// core에 두는 이유: DOM도 엔진도 안 쓰는 순수 표라 단위 시험이 브라우저 없이 전수를 돈다.

/** 원 이름 정돈 — `group/name` 중 name만, 밑줄·하이픈을 띄어쓰기로. 사상이 없을 때의 바닥이다. */
export const brushRawShort = (br: string): string =>
  (br.split('/')[1] ?? br).replace(/[_-]+/g, ' ').trim()

/** 분류(group) — `deevad` · `ramon` · `classic` · `brunelleschi`(앱) … */
export const brushGroup = (br: string): string => br.split('/')[0] ?? ''

/** ② 정확 표 — 앱이 «실제로 앉히는» 이름들. 슬롯 기본(core/paintseam DEFAULT_BRUSH) ·
 *  필통 기본 일곱(68) · 팁 기본 표(app/mypaintpaint TIP_EXACT)에 드는 것 전부가 여기 있다. */
export const BRUSH_LABEL_EXACT: Readonly<Record<string, string>> = {
  'classic/pencil': '연필',
  'classic/charcoal': '목탄',
  'classic/dry_brush': '마른 붓',
  'deevad/4H_pencil': '4H 연필',
  'deevad/2B_pencil': '2B 연필',
  'deevad/liner': '제도 라이너',
  'deevad/chalk': '분필',
  'ramon/100%_Opaque': '불투명 마커',
  'ramon/B-pencil': 'B 연필',
  'ramon/Pastel_1': '파스텔',
  'tanda/marker-01': '마커 01',
  'tanda/charcoal-01': '목탄 01',
  'tanda/charcoal-03': '목탄 03',
  'tanda/charcoal-04': '목탄 04',
  'deevad/watercolor_expressive': '수채',
  'brunelleschi/colored_pencil': '색연필',
  'brunelleschi/marker': '마커',              // web2-66 §2 — 납작한 촉(타원 도장 · 고정 각)의 앱 프리셋 · 새 기본
  // web2-68 §2 개정 — 경도 축(필통 칸의 경도 글자와 같은 이름 · core/grades68이 정본 · 뿌리의 매개 가족)
  'brunelleschi/pencil_HB': '연필 HB', 'brunelleschi/pencil_B': '연필 B', 'brunelleschi/pencil_2B': '연필 2B',
  'brunelleschi/pencil_4B': '연필 4B', 'brunelleschi/pencil_6B': '연필 6B', 'brunelleschi/pencil_8B': '연필 8B',
  'brunelleschi/charcoal_H': '목탄 경', 'brunelleschi/charcoal_M': '목탄 중', 'brunelleschi/charcoal_S': '목탄 연',
}

/** ③ 낱말 사상 — 긴 것부터 문다(watercolor가 water·color로 쪼개지지 않게). */
const WORDS: readonly (readonly [RegExp, string])[] = ([
  ['watercolour|watercolor', '수채'], ['calligraphy', '캘리그래피'], ['airbrush', '에어브러시'],
  ['charcoal', '목탄'], ['drybrush', '마른붓'], ['impasto', '임파스토'], ['acrylic', '아크릴'],
  ['gouache', '과슈'], ['splatter', '튀김'], ['bristle', '강모'], ['texture', '결'],
  ['pastel', '파스텔'], ['crayon', '크레용'], ['smudge', '번짐'], ['eraser', '지우개'],
  ['marker', '마커'], ['pencil', '연필'], ['opaque', '불투명'], ['chisel', '끌'],
  ['sponge', '스펀지'], ['bucket', '통'], ['blend', '섞기'], ['brush', '붓'],
  ['chalk', '분필'], ['knife', '나이프'], ['spray', '스프레이'], ['paint', '물감'],
  ['liner', '라이너'], ['glaze', '글레이즈'], ['grain', '결'], ['noise', '잡티'],
  ['round', '둥근'], ['flat', '납작'], ['hard', '딱딱한'], ['soft', '부드러운'],
  ['coarse', '거친'], ['blending', '섞기'], ['expressive', '표현'], ['simple', '단순'],
  ['rough', '거친'], ['fine', '고운'], ['thin', '가는'], ['thick', '굵은'],
  ['dry', '마른'], ['wet', '젖은'], ['ink', '잉크'], ['pen', '펜'], ['oil', '유화'],
  ['bulk', '덩어리'], ['detail', '세밀'], ['wash', '워시'], ['fill', '채움'],
  ['edge', '가장자리'], ['blur', '흐림'], ['felt', '펠트'], ['fur', '털'],
  ['big', '큰'], ['small', '작은'], ['basic', '기본'], ['classic', '기본'],
  ['sketch', '스케치'], ['line', '선'], ['dots|dot', '점'], ['star', '별'],
  ['grass', '풀'], ['leaf|leaves', '잎'], ['tree', '나무'], ['cloud', '구름'],
  ['hair', '머리카락'], ['tapered|taper', '뾰족'], ['square', '네모'],
] as const).map(([p, k]) => [new RegExp(`^(?:${p})$`, 'i'), k] as const)

/** 낱말 하나 → 사람 쪽 낱말(모르면 null) */
function wordOf(t: string): string | null {
  for (const [re, k] of WORDS) if (re.test(t)) return k
  return null
}

/** **사람이 읽는 이름**. 원 이름은 안 없어진다(도움말·부제가 든다 — 규칙 ①). */
export function brushLabel(br: string): string {
  const exact = BRUSH_LABEL_EXACT[br]
  if (exact) return exact
  const raw = brushRawShort(br)
  const toks = raw.split(/\s+/).filter(t => t.length > 0)
  const out: string[] = []
  let known = 0
  for (const t of toks) {
    // 숫자·백분율·등급 표기(2B · 4H · 01 · 100%)는 그대로 둔다 — 사람이 그대로 읽는다
    if (/^[0-9]+%?$/.test(t) || /^[0-9]*[HB]$/i.test(t)) { out.push(t.toUpperCase()); continue }
    const k = wordOf(t)
    if (k) { out.push(k); known++ } else out.push(t)
  }
  // 아는 낱말이 하나도 없으면 지어내지 않는다 — 정돈한 원 이름 그대로다(규칙 ③)
  return known === 0 ? raw : out.join(' ')
}

/** **원 이름 그대로**(정돈 ⛔) — `group/name`의 name. 부제·도움말이 쓰는 것은 이쪽이다:
 *  사람이 mypaint-brushes 원문과 대조할 때 «정돈된» 이름은 못 쓴다(규칙 ①). */
export const brushRawExact = (br: string): string => br.split('/')[1] ?? br

/** 화면의 부제가 쓰는 «원 이름» 한 줄 — `분류 · 원-이름`(원 이름은 한 글자도 안 고친다) */
export const brushOrigin = (br: string): string => `${brushGroup(br)} · ${brushRawExact(br)}`
