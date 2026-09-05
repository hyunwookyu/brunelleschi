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

import type { Preset } from '../mypaint/presets.gen'

export const APP_GROUP = 'Brunelleschi'

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
]
