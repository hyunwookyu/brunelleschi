// 앱 프리셋(web2-64) — mypaint-brushes 196(CC0)에 «없는» 성질을 **같은 형식(Preset)**으로 짓는다.
//
// 지시 64-2: 「cp = ramon/B-pencil이다. 그것은 색연필이 아니라 연필이다. 196개에서 색연필에 맞는 것을 다시 고르고,
// 없으면 색연필의 성질로 만들어라 — 안료가 종이 봉우리에만 얹히고(구멍), 압력이 알파가 아니라 문턱을 내리고(버니싱),
// 한 번 지나가면 옅다.」 196의 이름을 훑은 값: pencil 계열 여덟(classic/pencil · deevad/2B·4H · ramon/2B·B · tanda/pencil-2b·8b ·
// Dieterle/8B·Pencil-_Left_Handed · experimental/subtle_pencil)은 전부 흑연(hardness ≤ .6 · smudge 있음 · 회색 색값)이고
// «색연필»이라 부를 것이 없다 — 그래서 짓는다(값을 짓지 않는다는 62의 규칙은 «mypaint 브러시의 값»에 대한 것이고, 이 프리셋은
// 이 앱의 것이라 이름 앞자리가 brunelleschi/다 · 라이선스 물음 없음).
//
// 성질 → 설정(엔진은 안 건드린다 — 전부 libmypaint 설정의 뜻 그대로):
//   · 봉우리에만 얹힌다     → 슬롯 cp의 종이 결 깊이(TOOL_PAPER cp 1 → mypaintpaint의 cpPaperK 1.6 · 결이 «구멍»을 판다) +
//                            팁 scratches2(63의 색연필 팁 — 빗금 이빨) · hardness .78(경계가 선다 — 흑연의 .56보다 딱딱)
//   · 압력이 문턱을 내린다   → opaque_multiply의 압력 곡선을 «느리게»(저압 .15 → 고압 1) · radius는 압력에 거의 안 는다(+.25)
//                            (흑연 B-pencil은 radius_logarithmic이 압력으로 −.65까지 움직인다 — 그것이 «연필»의 표다)
//                            + mypaintpaint의 cp 버니싱: 획 평균 압력이 높을수록 결 깊이를 «얕게» 매핑한다(64-2 문면 · 60의 cpBurnish 자리)
//   · 한 번 지나가면 옅다   → opaque .55 · opaque_linearize .35 · 도구 캡(PAINT_CP_ALPHA .7 — 46 계약 그대로)
//   · 색                   → 색값은 획의 hex(color_h/s/v는 렌더러가 덮는다 — 프리셋의 회색은 안 쓰인다)
//   · 결정론                → radius_by_random .18 · offset_by_random .12(도장 산포는 획 시드 — Math.random ⛔)
//
// 갈림의 판정은 paint64 ③(cp vs classic/pencil의 빈 픽셀 몫·가장자리 거칠기 — 63 ①의 자 그대로) · 사진 64-cp.png.

// ── web2-68 §2 — 경도 축의 «사이» 프리셋(연필 4B · 6B). 값을 짓지 않는다(A-3 · 62): 두 CC0 프리셋
// (tanda/pencil-2b ↔ tanda/pencil-8b — mypaint-brushes CC0-1.0)의 base_value를 **선형 보간**하고 곡선은
// 2b 것을 쓴다(지시 §2 방법 2 문면). 설정 키는 두 원본의 합집합에서만 나오고(모르는 키 생성 ⛔ — #108 ·
// SETTINGS로 존재 검증 · 한쪽에만 있는 키는 libmypaint 기본값(settings.gen def)과 섞는다). 보간 위치(t)는
// 원장 paint68(농도·반최대 폭 단조 표)이 정한다 — 아래 상수가 그 값이다.
// 라이선스: 두 CC0의 사이 — 새 저작물의 «값»은 원본에서 왔고 이름(brunelleschi/…)만 앱의 것이다.

import { PRESETS as MYPAINT_PRESETS, type Preset, type PresetSetting } from '../mypaint/presets.gen'
import { SETTINGS } from '../mypaint/settings.gen'

export const APP_GROUP = 'Brunelleschi'

const PRESET_OF = new Map(MYPAINT_PRESETS.map(p => [p.name, p]))
const SETTING_DEF = new Map(SETTINGS.map(s => [s.id, s.def]))

/** 두 프리셋의 «사이» — base_value 선형 보간(t: 0 = a · 1 = b) · 곡선은 a의 것. */
export function lerpPreset(name: string, aName: string, bName: string, t: number, desc: string): Preset {
  const a = PRESET_OF.get(aName), b = PRESET_OF.get(bName)
  if (!a || !b) throw new Error(`lerpPreset: 원본이 없다 — ${aName} · ${bName}`)
  const s: Record<string, PresetSetting> = {}
  for (const k of new Set([...Object.keys(a.s), ...Object.keys(b.s)])) {
    const def = SETTING_DEF.get(k)
    if (def === undefined) throw new Error(`lerpPreset: 모르는 설정 키 ${k}(#108)`)
    const av = a.s[k]?.[0] ?? def, bv = b.s[k]?.[0] ?? def
    const base = +(av + (bv - av) * t).toFixed(6)
    const curves = a.s[k]?.[1]
    s[k] = curves ? [base, curves] : [base]
  }
  return { name, group: APP_GROUP, desc, s }
}

/** (68 초판의 보간 위치 — 원장 paint68 1차가 «같은 값»(≤ .0015)으로 반증했다 · lerpPreset은 단위 시험·기록으로 남는다) */
export const PENCIL_LERP_T = { pencil_4B: 1 / 3, pencil_6B: 2 / 3 } as const

// ── web2-68 §2 개정(docs/instructions/web2-68-amend.md) — **경도 축은 한 뿌리 프리셋의 매개 가족이다.** 196 안에 경도 가족은
// 없다(paint68 1차 표가 보였다 — classic .130 > tanda 축 .027~.066 · 보간 셋은 같은 값). 64-2(색연필)·66-2(마커)의 선례대로
// 앱 프리셋(brunelleschi/)으로 등재하고 **뿌리와 매개를 값으로** 적는다. 매개는 셋만 움직인다 · 다른 설정은 뿌리 그대로(곡선 포함):
//   opaque              농도 축 — «목표 농도»에 되먹임(이분법 · ≤ 8회 · 결정론)으로 맞춘 값을 상수로 굳힌다(런타임에 안 잰다)
//   radius_logarithmic  폭 축   — 연필 HB 1.0 → 8B 2.0 등비(한 단 2^(1/5) → +ln2/5) · 목탄 ×.85 / 1 / ×1.2
//   hardness            경계    — 연필 HB 뿌리 → 8B 뿌리 × .7 등차 · 목탄 ×1.15 / 1 / ×.8
// 목표(같은 자 — 직선 · 압력 0.3→0.7→0.3 · 12px · 제품 보정 · 흰 판): HB .130(뿌리 그대로) · B .19 · 2B .25 · 4B .32 · 6B .39 · 8B .45
// (8B 상한의 근거 = 196에서 가장 짙게 실측된 흑연 experimental/subtle_pencil .429 부근) · 목탄 중 = 뿌리 실측 · 경 = ×.75 · 연 = ×1.3.
// 되먹임의 표(목표 · 도달 · opaque · 폭)는 원장 paint68_web2_dpr{1,2}.json(fit 절)이 정본이고 아래 상수가 그 도달값이다.
// 라이선스: classic/pencil · classic/charcoal(mypaint-brushes CC0-1.0)의 파생 — 이름만 앱의 것.

/** 뿌리 프리셋의 매개 셋을 바꾼 사본(곡선은 뿌리 그대로) */
export function familyPreset(name: string, rootName: string, m: { opaque: number; radiusAdd: number; hardnessK: number }, desc: string): Preset {
  const root = PRESET_OF.get(rootName)
  if (!root) throw new Error(`familyPreset: 뿌리가 없다 — ${rootName}`)
  const s: Record<string, PresetSetting> = {}
  for (const [k, v] of Object.entries(root.s)) s[k] = v[1] ? [v[0], v[1]] : [v[0]]
  const set = (k: string, base: number) => { const cur = s[k]; s[k] = cur && cur[1] ? [+base.toFixed(6), cur[1]] : [+base.toFixed(6)] }
  const def = (k: string) => SETTING_DEF.get(k)!
  set('opaque', m.opaque)
  set('radius_logarithmic', (s.radius_logarithmic?.[0] ?? def('radius_logarithmic')) + m.radiusAdd)
  set('hardness', (s.hardness?.[0] ?? def('hardness')) * m.hardnessK)
  return { name, group: APP_GROUP, desc, s }
}

/** 연필 여섯의 매개 — opaque는 되먹임 도달값(원장 fit 절) · 폭·경계는 개정 문면의 등비·등차 */
export const PENCIL_FAMILY = {
  root: 'classic/pencil',
  target: { HB: 0.13, B: 0.19, '2B': 0.25, '4B': 0.32, '6B': 0.39, '8B': 0.45 } as Readonly<Record<string, number>>,
  /** 되먹임 도달 opaque(paint68 fit — HB는 뿌리 .7 그대로) — ⚠ 값은 원장이 정본 · 여기는 굳힌 상수 */
  opaque: { HB: 0.7, B: 0.9481, '2B': 1.1338, '4B': 1.3503, '6B': 1.4586, '8B': 1.505 } as Readonly<Record<string, number>>,
  /** 폭 축의 끝값(8B의 크기 배수) — 되먹임 도달값: 반지름 배수 2.0에서 반최대 폭 비가 2.33(hill 24px 제품)으로 «넓게» 나왔다
   *  (무른 hardness가 반최대 띠를 더 벌린다) → 측정 폭 비 2.0이 되도록 배수를 낮춘다(원장 paint68 width_fit). 사이는 등비. */
  sizeK8B: 1.714,
  radiusAdd: (k: number) => Math.log(1.714) * k / 5,    // HB(k=0) 1.0 → 8B(k=5) sizeK8B 등비(측정 폭 비 2.0의 되먹임)
  hardnessK: (k: number) => 1 - 0.3 * k / 5,            // HB 1 → 8B .7 등차
} as const
export const PENCIL_FAMILY_GRADES = ['HB', 'B', '2B', '4B', '6B', '8B'] as const

/** 목탄 셋의 매개 — 중은 뿌리 그대로 · 경/연은 개정 문면 */
export const CHARCOAL_FAMILY = {
  root: 'classic/charcoal',
  targetK: { H: 0.75, M: 1, S: 1.3 } as Readonly<Record<string, number>>,
  opaque: { H: 0.2056, M: 0.4, S: 0.7625 } as Readonly<Record<string, number>>,   // 되먹임 도달값(원장 fit 절) — 중은 뿌리 .4
  radiusK: { H: 0.85, M: 1, S: 1.2 } as Readonly<Record<string, number>>,
  hardnessK: { H: 1.15, M: 1, S: 0.8 } as Readonly<Record<string, number>>,
} as const
export const CHARCOAL_FAMILY_GRADES = ['H', 'M', 'S'] as const

/** **가족의 폭 축은 크기 배수다**(web2-68 §2 개정 · D-4 실측): 이 앱은 자국의 반지름을 프리셋의 radius_logarithmic가 아니라
 *  «요청 폭»(크기 슬라이더 · 58 크기 정직성 — radiusLogFor)에서 정한다. 그래서 가족 프리셋의 radius 차이는 그대로 두면 화면에
 *  **아무 일도 안 한다**(paint68 fit 1차 실측 — 여섯의 폭 전부 같음 · 8B/HB 비 1.0). 개정의 뜻(무른 심은 넓다 — 8B = HB × 2)을
 *  «요청 폭에 곱하는 배수»로 싣는다: 반지름 = radiusFor(요청 폭 × 배수). 배수 = exp(radius_logarithmic − 뿌리의 것) — 프리셋 데이터
 *  하나가 두 자리(설정 · 배수)를 정한다(#54). 뿌리·다른 프리셋은 배수 1(58 정직성 무변 — 정직성은 뿌리에 대해 서고 가족은 배수를
 *  «선언»한다 · DECISIONS 68). mypaintpaint.configureMark가 읽는다. */
export const FAMILY_SIZE_K: ReadonlyMap<string, number> = new Map<string, number>([
  ...PENCIL_FAMILY_GRADES.map((g, k) => [`brunelleschi/pencil_${g}`, +Math.exp(PENCIL_FAMILY.radiusAdd(k)).toFixed(4)] as [string, number]),
  ...CHARCOAL_FAMILY_GRADES.map(g => [`brunelleschi/charcoal_${g}`, CHARCOAL_FAMILY.radiusK[g]!] as [string, number]),
])
export const familySizeK = (preset: string): number => FAMILY_SIZE_K.get(preset) ?? 1

export const APP_PRESETS: readonly Preset[] = [
  {
    name: 'brunelleschi/colored_pencil', group: APP_GROUP,
    desc: '색연필(web2-64) — 종이 봉우리에만 얹히고 압력이 문턱을 내린다. 한 번 지나가면 옅고 겹치면 쌓인다',
    s: {
      anti_aliasing: [0.6],
      dabs_per_actual_radius: [4.2],
      dabs_per_basic_radius: [4.0],
      hardness: [0.78],
      offset_by_random: [0.12],
      radius_by_random: [0.18],
      opaque: [0.55],
      opaque_linearize: [0.35],
      opaque_multiply: [0, { pressure: [[0, 0.15], [0.35, 0.42], [0.7, 0.85], [1, 1]] }],
      radius_logarithmic: [0.9, { pressure: [[0, -0.1], [1, 0.25]] }],
      smudge: [0],
      speed1_slowness: [0.04],
    },
  },
  // ── 마커(web2-66 §2) — 사람 판정: 「마커의 단면은 원형이 아니다. 보통은(넓게 칠할 때)
  // 직사각형에 가까운 형태이다.」 도구는 이미 있다(지시 문면 — libmypaint elliptical_dab_ratio·
  // angle · 62가 이식했다): 종전 기본(ramon/100%_Opaque — 원형)의 값 위에 **납작한 타원 도장**을
  // 얹는다. ⚠ 각도는 «획 방향»이 아니라 «손»을 따른다(지시 — 방향 입력에 매면 서예가 된다):
  // 고정값 72°(오른손이 촉을 쥔 각의 근사 — 가로로 넓게 칠할 때 넓고, 세로로 그으면 좁다).
  // ramon/Classic_Paint의 direction 곡선(elliptical_dab_angle ← direction)은 **일부러 안 쓴다**.
  // 간격: 납작해진 짧은 축이 도장 사이 골을 만들므로 dabs_per_actual_radius를 2.2 → 4.6으로
  // 올린다(빨라 보이게 하는 조정이 아니라 단면 변경의 짝 — 게이트 ②의 자는 pre 마커가 아니라
  // 이 프리셋 자체로 잰다). 크기는 자가 보정(radiusFor)이 «가로 획 반최대 폭»으로 잡는다.
  {
    name: 'brunelleschi/marker', group: APP_GROUP,
    desc: '마커(web2-66) — 납작한 촉(타원 도장 · 고정 각 72°). 가로로 넓게, 세로로 좁게 — 실물 마커의 단면',
    s: {
      dabs_per_actual_radius: [4.6],
      dabs_per_basic_radius: [4.56],
      elliptical_dab_ratio: [3.4],
      elliptical_dab_angle: [72],
      hardness: [0.95],
      opaque_linearize: [0],
      opaque_multiply: [0, { pressure: [[0, 0], [0.015, 0], [0.025, 1], [1, 1]] }],
      radius_logarithmic: [3.01],
      slow_tracking: [0.65],
      slow_tracking_per_dab: [0.8],
      speed1_gamma: [2.87],
      stroke_duration_logarithmic: [1.18],
      stroke_holdtime: [10],
    },
  },
  // ── 경도 가족(web2-68 §2 개정) — 연필 여섯(뿌리 classic/pencil) · 목탄 셋(뿌리 classic/charcoal). 매개·목표는 위 주석.
  ...PENCIL_FAMILY_GRADES.map((g, k) => familyPreset(`brunelleschi/pencil_${g}`, PENCIL_FAMILY.root,
    { opaque: PENCIL_FAMILY.opaque[g]!, radiusAdd: PENCIL_FAMILY.radiusAdd(k), hardnessK: PENCIL_FAMILY.hardnessK(k) },
    `연필 ${g}(web2-68 §2 개정) — 뿌리 classic/pencil(CC0)의 매개 가족: opaque ${PENCIL_FAMILY.opaque[g]}(되먹임 · 목표 농도 ${PENCIL_FAMILY.target[g]}) · 반지름 ×${(2 ** (k / 5)).toFixed(3)} · hardness ×${PENCIL_FAMILY.hardnessK(k).toFixed(2)}`)),
  ...CHARCOAL_FAMILY_GRADES.map(g => familyPreset(`brunelleschi/charcoal_${g}`, CHARCOAL_FAMILY.root,
    { opaque: CHARCOAL_FAMILY.opaque[g]!, radiusAdd: Math.log(CHARCOAL_FAMILY.radiusK[g]!), hardnessK: CHARCOAL_FAMILY.hardnessK[g]! },
    `목탄 ${g === 'H' ? '경' : g === 'M' ? '중' : '연'}(web2-68 §2 개정) — 뿌리 classic/charcoal(CC0)의 매개 가족: opaque ${CHARCOAL_FAMILY.opaque[g]}(되먹임 · 목표 = 중 농도 × ${CHARCOAL_FAMILY.targetK[g]}) · 반지름 ×${CHARCOAL_FAMILY.radiusK[g]} · hardness ×${CHARCOAL_FAMILY.hardnessK[g]}`)),
]
