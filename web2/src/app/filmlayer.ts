// 종이의 표현(web2-20 3부) — **막(film)과 섬유질**. 이 회차의 본체.
//
// ── 곱 합성(3-a) — 알파가 아니다 ─────────────────────────────────────────────
// 종이는 빛을 빼앗는 감산이다: 겹칠수록 어두워지고 짙어진다. 알파로 얹으면 겹칠수록
// 막 색으로 수렴한다(실물과 반대). 구현: #film 캔버스(흰 바탕 = 곱의 항등원)에 막들을
// `multiply`로 겹쳐 그리고, 캔버스 요소 자체를 **CSS `mix-blend-mode: multiply`**로
// 아래 겹 전부(#gl 몸체·#brushc 질감·종이 바탕)에 곱한다. 흰 자리는 무변화 —
// 막 밖·막 없음이 공짜로 «없음»이 된다. 비용은 알파와 같다(합성 한 번).
//
// ── 겹 순서(3-b — 세션이 재고 정했다) ──────────────────────────────────────────
// 지시의 ⓐ(#brushc 분할)만으로는 부족했다: 활성 겹 획의 **Line2 몸체가 #gl**에 있어
// 질감만 갈라서는 몸체가 막에 물든다(⑨ 위반 — 실측 전에 구조가 말한다). 그래서:
//   아래 = #gl + #brushsnap + #brushc  (종이 직접 획 + 활성 아래 겹의 획 — 전부)
//   막   = #film (mix-blend multiply — ON이고 활성 이하인 겹의 막)
//   위   = #layerc (활성 겹과 그 위 겹의 획 — 몸체 2D + 질감은 아틀라스 타일 붙임)
//   표식 = #ink (가장자리 포함 — 언제나 맨 위)
// 위/아래의 판정은 filmSplit() 하나다(#54). **막이 없으면 갈림도 없다** — 그 종이의
// 시점이 아니거나(막은 그 시점에서만 — 3-d) 활성 겹이 없으면 전부 종전 경로 그대로라
// 겹을 안 쓰는 문서의 비용이 web2-18과 같다(3-b 비용 회계의 전제 — 원장이 잰다).
//
// ── 섬유질(3-c) — 노이즈가 아니라 섬유 ────────────────────────────────────────
// 타일(256×256 device px)에 짧은 섬유 수백 개를 옅게 긋는다: 길이·방향·굵기·알파가
// 흔들리되 방향에 약한 우세 + 큰 산포(펠트 분포). **시드는 rng32(layer.id)** — 새로
// 꺼낼 때마다 다르고(id는 nextId에서), 문서에 저장되니 다시 열어도 같은 결이다.
// 이음매: 섬유를 타일 경계 너머로 **감싸 그린다**(±타일 오프셋) — 빼면 격자가 보인다.
// 층마다 타일의 위상(패턴 원점 이동)과 **회전(90°의 배수 — 이음매를 안 깨는 회전)**도
// 어긋낸다. 종이 둘의 차이는 색만이 아니라 섬유 매개변수다(옐로 = 길고 굵고 많게 /
// 트레이싱지 = 짧고 가늘고 적게). ⛔ 외부 텍스처 이미지 금지(지시 3-c — 기각 사유 셋).
// ⚠⚠ **web2-30 9번이 그 조항을 뒤집었다.** 종전에는 「바탕 종이에는 결이 없다(겹 둘에만)」
// 였는데, 실기기에서 **그 차등 자체가 결함으로 읽혔다** — 「옐로·트레이싱지는 결이 보이고
// 종이만 안 보인다」. 지금은 셋 다 결이 있고 **같은 함수 하나**(`bakeFiberTile`)가 굽는다.
//
// ⚠ **바탕 종이는 #film에 «안» 태운다** — 지시가 준 후보(「#film에 종이를 안 태운 것으로
// 보인다」)는 **원인 진단으로는 맞고 처방으로는 틀리다**(D-4). #film의 일은 «아래에 있는
// 것에 곱하기»이고 그러려면 아래 겹을 사본으로 재조립해야 하는데(#73 ㉠), **바탕 종이
// 아래에는 아무것도 없다**. 그리고 #film은 `atSheetPose`와 «겹이 있는가»에 걸려 있는데
// 바탕 종이는 **언제나 있다**. 그래서 맨 아래에 자기 판(#paperfilm)을 두고 거기서 곱한다 —
// 아무것도 안 가리므로 곱과 보통 그리기가 같은 결과이고, 재조립 비용이 0이다.

import type { App } from './state'
import { atSheetPose, fadeRef, underlayOf, viewXf, inkMix, slideAwayOf } from './state'
import { isFlat2d, type Layer, type Paper, type Surface, type CamPose, type Underlay } from '../core/types'
import { rng32, MAT, gradeOf, widthOf, widthOfMat } from '../core/material'
import { project } from '../core/camera'
import { waitFadeFactor, bodyHex } from '../core/waitfade'
import { slideCurl } from '../core/slide'
import { C } from '../core/constants'

// ── 막의 색·섬유 매개변수 — 값의 근거는 assumptions(AS-C68·C69) ────────────────
// 곱 합성에서는 «밝기»가 곧 비침이다(흰색 = 투명·어두울수록 짙다) — 별도 불투명도가
// 없다(3-d: 농도 손잡이를 만들지 않는다). 세 장 겹침 하한은 ⑧ 팔이 지킨다.
// ⚠⚠ **섬유의 길이·굵기는 CSS px다**(web2-26 2번). 종전에는 «타일 px»이었고 타일이
// device px에 묶여 있어서 **결의 물리 크기가 dpr을 따라 갈렸다**: dpr1에서 굵기가
// 0.175 CSS px(= 한 기기 픽셀의 6분의 1)이라 안티에일리어싱이 결을 통째로 삼켰고,
// dpr3에서는 세 배 굵어졌다. 실측(D-1 표식 · `paper_grain26_web2.json`)이
// **막 sd 0.134 ↔ 1.361 — 열 배**를 냈다. 지금 값은 전부 CSS px이고 `bakeFiberTile`이
// dpr을 곱해 굽는다 — 「주기는 CSS 픽셀(≈물리 길이) 기준, 진폭은 실제 DPR에서」.
// ── 겹의 결을 «얼마나 곱게» — web2-40 1번 ─────────────────────────────────────
// 사람: 「롤 텍스쳐가 너무 크다.」 34-1이 내린 것은 **바탕 종이의 진폭**이고 이번 지적은
// **겹의 주기**다(무늬가 굵게 읽힌다). 그래서 갈린 축은 **섬유 길이 하나**다:
//
//   길이 ×K · 개수 ÷K · **굵기·알파는 안 건드린다**
//
// ⚠ **굵기를 안 건드리는 것이 «바닥»이다**(지시문 ⚠ · web2-26 2번): 26-2에서 결이 안
//   보였던 원인은 굵기가 dpr1에서 «한 기기 픽셀보다 가늘어» 안티에일리어싱에 먹힌
//   것이었다. 주기를 굵기로 줄이면 그 상태로 되돌아간다 — 길이는 dpr1에서도 4.8 CSS px가
//   남으므로 그 바닥에 안 닿는다.
// ⚠ **개수를 ÷K로 올리는 것은 진폭 보존이다**: 면적 밀도 ∝ 개수 × 길이 × 굵기이므로
//   길이를 K배 줄이고 개수를 1/K배 올리면 밀도가 그대로다. 그래야 26-2의 지각 문턱
//   게이트(> 2.1계조)와 34-1의 「바탕 < 겹」이 같이 선다 — 실측은 `paper_grain40_web2.json`
//   (화면 sd가 **3.914 → 3.913**으로 사실상 안 움직였다: 보정이 실제로 듣는다).
// ⚠⚠ **주기의 비는 K가 아니다**(실측이 그것을 냈다): 굵기를 안 건드렸으므로 자기상관의
//   «어깨»(미세 구조)는 그대로 남고 줄어드는 것은 **꼬리**뿐이다 — 상관 길이의 비가
//   **0.743~0.827**(세 dpr × 겹 둘)이지 0.5가 아니다. 그래서 K를 더 내리는 것은
//   «주기»에 대한 지렛대가 생각보다 짧다 — 더 내리려면 굵기를 건드려야 하고 그것이
//   **26-2의 바닥**이다. 그 교환은 실기기 눈이 판정한다(DEVICE-CHECK G4).
// ⚠ **K는 «측정이 고른 값»이 아니라 사람 눈이 판정할 값이다**(지시 게이트 넷째):
//   여기서 값으로 잴 수 있는 것은 ①실제로 주기가 줄었는가 ②줄이면서 26-2·34-1이 살아
//   있는가 둘뿐이고, 「곱다/굵다」는 사람 눈이 판정한다.
//   **0.5를 고른 방법**: 헤드리스에서 타일을 384×256으로 깔아 pre-40과 나란히 보고
//   골랐다(0.6과 0.5 둘을 나란히 냈다). 0.6은 pre-40의 «긴 힘줄»을 절반쯤만 걷어
//   차이가 옅었고, 0.5는 겹 둘 다 결이 분명히 잘아지면서 **아직 섬유로 읽힌다**
//   (그보다 내리면 옐로의 짧은 쪽 길이가 굵기의 두 배 아래로 내려가 «점»이 된다:
//    K=0.5에서 옐로 4~11 CSS px · 굵기 1.5~2.8 · 트레이싱 1.75~5 · 굵기 1~2).
//   실기기 확인이 오면 그 답으로 다시 고른다(DEVICE-CHECK G4).
const OVERLAY_LEN_K = 0.5

/** **web2-34까지의 겹 섬유**(길이·개수만) — 아래 값의 **출처**이자 D-3 반증 손잡이의 값이다.
 *  ⚠ 두 자리에 손으로 옮겨 적지 않는다(PITFALLS #88): 지금 값이 이 표에서 **유도되므로**
 *  「반증판과 지금 판이 길이 축 하나만 다르다」가 코드에 보인다. */
const OVERLAY_FIBER_PRE40 = {
  yellow: { count: 420, lenMin: 8, lenMax: 22 },
  tracing: { count: 560, lenMin: 3.5, lenMax: 10 },
} as const

/** 그 배수를 먹인 값 — 개수는 10 단위로 끊는다(시드 변동폭이 그보다 크다 — CLAUDE.md §5). */
function fineFiberK(p: 'yellow' | 'tracing', k: number): { count: number; lenMin: number; lenMax: number } {
  const o = OVERLAY_FIBER_PRE40[p]
  return {
    count: Math.round(o.count / k / 10) * 10,
    lenMin: Number((o.lenMin * k).toFixed(2)),
    lenMax: Number((o.lenMax * k).toFixed(2)),
  }
}
const fineFiber = (p: 'yellow' | 'tracing') => fineFiberK(p, OVERLAY_LEN_K)

/** 팔 전용 — **K를 갈아 끼운다**(#12: 동작점 하나로 안 정한다). null이면 제품 값.
 *  같은 유도식(`fineFiberK`)을 쓰므로 갈린 축이 여전히 **길이 하나**다.
 *  `web2-40`이 이것으로 K 훑기를 내고 「어디가 바닥인가」를 값으로 적는다. */
let LEN_K_OVERRIDE: number | null = null
export const setOverlayLenKForTest = (k: number | null) => { LEN_K_OVERRIDE = k }

export const PAPER_STYLE: Record<Surface, {
  tint: [number, number, number]
  /** 전부 **CSS px**(alpha 제외) — count는 타일 한 장(TILE_CSS×TILE_CSS CSS px)당 개수 */
  fiber: { count: number; lenMin: number; lenMax: number; wMin: number; wMax: number; aMin: number; aMax: number }
}> = {
  yellow: {
    tint: [242, 227, 179],   // 옐로 트레이스 — 이름 자체가 색이다
    // 굵기·알파는 web2-26 2번이 정한 값 그대로다: 굵기는 dpr1에서 «한 기기 픽셀보다
    // 가늘다»를 벗어나야 dpr 사이에서 같은 결이 되고(아래 dpr 비 게이트), 알파는
    // 진폭이 지각 문턱 아래였다(㉢ — 실측 sd 0.77/255).
    // ⚠⚠ **web2-40 1번이 «길이»와 «개수»만 갈았다**(주기 — 진폭이 아니다) —
    //     값은 `fineFiber`가 `OVERLAY_FIBER_PRE40`에서 유도한다(위 절이 근거다).
    fiber: { ...fineFiber('yellow'), wMin: 1.5, wMax: 2.8, aMin: 0.075, aMax: 0.18 },
  },
  tracing: {
    tint: [230, 233, 237],   // 벨럼 — 거의 무색·살짝 한색(중성이 아니면 옐로와 섞일 때
    // 채도가 내리지 않는다 — ④ 곡선의 실측이 이 값을 정했다: 난색이면 곱이 채도를 올린다)
    // ⚠ **web2-30 9번이 개수·알파를 옐로 대역으로 올렸다**(count 170 → 300 · a 0.06~0.145
    // → 0.072~0.172). 30-9의 게이트가 「셋의 진폭이 서로 20% 이내」라 옛 값으로는 못 선다
    // (실측이 그 차를 냈다 — NOTES의 표). **길이·굵기는 안 건드렸다** — 그쪽이 벨럼과
    // 옐로를 «다른 종이»로 만드는 채널이고, 사람이 바꾸라 한 것은 «보이느냐»다.
    // ⚠⚠ **web2-40 1번이 «길이»와 «개수»만 갈았다** — 옐로와 **같은 배수**다(둘이
    // 같은 롤에서 나오는 «결의 곱기»이므로 축을 하나로 둔다). 값은 `fineFiber` 유도.
    fiber: { ...fineFiber('tracing'), wMin: 1.0, wMax: 2.0, aMin: 0.115, aMax: 0.277 },
  },
  /** **바탕 종이**(web2-30 9번) — 제도지. tint는 화면의 종이색(`--paper` #f5f3ee)과 같은
   *  값이어야 한다: 이 판이 **곧 종이**이므로 색이 갈리면 결이 아니라 «판»이 보인다.
   *  섬유는 옐로보다 짧고 촘촘하다(제도지의 결은 트레이싱지보다 곱고 옐로보다 잘다). */
  paper: {
    tint: [245, 243, 238],
    // ⚠⚠ **web2-34 1번이 알파만 내렸다**(30-9의 0.078~0.186 → 여기). 값이 틀렸던 것이
    // 아니라 **자리가 다르다**(화면 규칙 R8): 겹은 사람이 «한 장 얹은» 것이라 잠깐 있고
    // 바탕 종이는 **화면 전체를 늘 덮는다**. 같은 진폭이 두 자리에서 같게 안 읽힌다 —
    // 실측이 그것을 수치로 냈다(30-9 뒤 dpr1 종이 3.973 > 트레이싱 3.920 > 옐로 3.914 ·
    // dpr2 종이 4.837 > 4.416 > 4.179 — **두 dpr 모두에서 늘 보이는 쪽이 최댓값**).
    // **개수·길이·굵기는 안 건드린다** — 그쪽은 «제도지의 결»이라는 종이의 정체이고
    // 사람이 과하다고 한 것은 «세기»다(30-9가 트레이싱지에서 한 판단과 같은 가름).
    // 하한은 web2-26 2번의 지각 문턱(웨버 1% ≈ 2.1계조)이고 상한은 겹의 최소값 ÷ 1.2다
    // (`C.PAPER_GRAIN_RATIO`) — dpr1에서 그 창이 (2.1, 2.86]이라 가운데를 겨눴다.
    fiber: { count: 470, lenMin: 6, lenMax: 17, wMin: 1.5, wMax: 2.8, aMin: 0.044, aMax: 0.106 },
  },
}

/** 반증 전용(D-3 · web2-34 1번) — **30-9의 바탕 알파**. 이걸 켜면 「바탕이 겹보다
 *  뚜렷하게 약하다」가 **같은 실행에서 실제로 실패해야 한다**. 안 실패하면 그 조항은
 *  아무것도 안 잰다(#69 ㉣). 알파 말고는 전부 지금 값 그대로다 — 갈린 축이 하나뿐이어야
 *  그 실패가 «알파를 내린 덕»이라고 읽힌다. */
const PAPER_FIBER_309 = { aMin: 0.078, aMax: 0.186 }

/** 타일 한 장이 덮는 **CSS px**(= 결의 반복 주기). 화면에서의 크기는 dpr과 무관하다.
 *  종전 값(타일 256 device px × 패턴 배율 0.5)과 같은 128을 그대로 쓴다 — 주기는
 *  사람이 확인한 자리가 아니므로 안 바꾼다(A-3: 안 건드리는 쪽). */
export const TILE_CSS = 128
/** 그 타일의 device px 크기 — dpr을 따라간다(타일 1px = 기기 1px, 재표본 없음) */
export const tilePxFor = (dpr: number): number =>
  FIBER_LEGACY ? 256 : Math.max(1, Math.round(TILE_CSS * dpr))

/** D-3 반증 손잡이(3-e ④) — 곱을 알파(source-over)로 바꿔 합성 곡선이 무너지는 것을
 *  e2e가 매 실행 본다. UI 없음 — diag.filmAlphaForTest만 켠다. */
let FILM_ALPHA = false
export const setFilmAlphaForTest = (v: boolean) => { FILM_ALPHA = v }

/** **바탕 종이의 결 켬/끔** — 끄면 그 판이 종이색 단색이 된다(web2-20 3부의 옛 상태).
 *  ⚠ web2-30 9번에서는 e2e 전용 반증 손잡이였는데 **web2-34 1번이 화면의 손잡이로
 *  승격시켰다**(설정 서랍의 `#chk-grain` · 기본 켜짐). 반증으로서의 쓰임은 그대로다 —
 *  끄면 「셋 다 지각 대역 위」가 같은 실행에서 실패한다. **손잡이는 하나다**(#54):
 *  `diag.paperFiberForTest`도 화면 체크상자도 이 함수 하나를 부른다. */
let PAPER_FIBER = true
export const setPaperFiber = (v: boolean) => { PAPER_FIBER = v }

/** D-3 반증 손잡이(web2-34 1번) — 바탕 종이의 알파를 **30-9 값으로 되돌린다**.
 *  UI 없음 — `diag.paperGrain309ForTest`만. */
let PAPER_309 = false
export const setPaperGrain309ForTest = (v: boolean) => { PAPER_309 = v }

/** D-3 반증 손잡이(web2-40 1번) — 겹의 결을 **web2-34까지의 주기로 되돌린다**
 *  (`OVERLAY_FIBER_PRE40` — 길이·개수만. 굵기·알파·색조는 지금 값 그대로라 **갈린 축이
 *  하나**다). 이걸 켜면 「겹의 결 주기가 pre-40보다 짧다」가 **같은 실행에서 실제로
 *  실패해야 한다** — 안 실패하면 그 게이트는 아무것도 안 잰다(#69 ㉣ · D-3).
 *  UI 없음 — `diag.grainPre40ForTest`만. */
let GRAIN_PRE40 = false
export const setGrainPre40ForTest = (v: boolean) => { GRAIN_PRE40 = v }

/** D-3 반증 손잡이(web2-26 2번) — **결을 dpr에 도로 묶는다**(타일 256 device px 고정 +
 *  섬유 배율 dpr/2 + 패턴 배율 0.5·s·dpr). 이걸 켜면 「dpr 1과 3의 결 표준편차 비가
 *  1.0 ± 0.15」 게이트가 **실제로 실패해야 한다** — 안 실패하면 그 게이트는 아무것도
 *  안 잰다(#69 ㉣ · D-3). `FILM_ALPHA`와 같은 급의 e2e 전용 손잡이다(UI 없음). */
let FIBER_LEGACY = false
export const setFiberLegacyForTest = (v: boolean) => { FIBER_LEGACY = v }
/** 종전(web2-20) 섬유 매개변수 — **타일 px** 단위. 반증 손잡이에서만 읽는다. */
const LEGACY_FIBER: Record<Surface, { count: number; lenMin: number; lenMax: number; wMin: number; wMax: number; aMin: number; aMax: number }> = {
  yellow: { count: 420, lenMin: 16, lenMax: 44, wMin: 0.7, wMax: 1.6, aMin: 0.025, aMax: 0.07 },
  tracing: { count: 170, lenMin: 7, lenMax: 20, wMin: 0.35, wMax: 0.9, aMin: 0.02, aMax: 0.05 },
  // 바탕 종이는 옛 규칙에 **없던** 면이다(그때는 결이 아예 없었다) — 반증 손잡이가
  // 「dpr에 묶인 옛 규칙」을 재현할 때 쓸 값이 필요해 트레이싱지 계열로 둔다.
  paper: { count: 380, lenMin: 8, lenMax: 24, wMin: 0.4, wMax: 1.0, aMin: 0.02, aMax: 0.055 },
}

/** 섬유 타일 — 결정론(rng32(layer.id))·감싸 그리기·90° 회전. 순수 함수에 가깝게:
 *  같은 (id, paper, dpr)이면 같은 픽셀이다(⑥ 저장·복원 뒤 결이 같다의 근거). */
export function bakeFiberTile(id: number, paper: Surface, dpr: number, wrap = true): HTMLCanvasElement {
  // wrap=false는 **반증 전용**(3-e ⑤' — 감싸 그리기를 빼면 이음매 팔이 실패해야 한다)
  const base = FIBER_LEGACY ? LEGACY_FIBER[paper] : PAPER_STYLE[paper].fiber
  // 반증(web2-34 1번) — 바탕 종이일 때만, 알파만 30-9 값으로. 다른 면은 안 건드린다.
  // 반증(web2-40 1번) — 겹일 때만, **길이·개수만** pre-40으로. 옛 규칙(FIBER_LEGACY)이
  // 켜져 있으면 그쪽이 이미 다른 단위의 표라 안 겹친다.
  const pre40 = GRAIN_PRE40 && !FIBER_LEGACY && paper !== 'paper' ? OVERLAY_FIBER_PRE40[paper] : null
  // K 훑기(팔 전용) — pre-40이 켜져 있으면 그쪽이 이긴다(둘을 같이 켜지 않는다)
  const kOver = !pre40 && LEN_K_OVERRIDE !== null && !FIBER_LEGACY && paper !== 'paper'
    ? fineFiberK(paper, LEN_K_OVERRIDE) : null
  const st = {
    ...PAPER_STYLE[paper],
    fiber: {
      ...base,
      ...(PAPER_309 && paper === 'paper' && !FIBER_LEGACY ? PAPER_FIBER_309 : {}),
      ...(pre40 ?? {}),
      ...(kOver ?? {}),
    },
  }
  const TP = tilePxFor(dpr)
  const c = document.createElement('canvas')
  c.width = TP
  c.height = TP
  const g = c.getContext('2d')!
  const rnd = rng32(id)
  // 바탕 색조 — 곱의 몸체. 결은 그 위에 조금 더 어두운 섬유로.
  g.fillStyle = `rgb(${st.tint[0]},${st.tint[1]},${st.tint[2]})`
  g.fillRect(0, 0, TP, TP)
  // 층마다 회전 — 90°의 배수만(이음매를 안 깨는 회전). 방향 우세각도 층마다 다르다.
  const rot = Math.floor(rnd() * 4) * (Math.PI / 2)
  const dominant = rnd() * Math.PI + rot
  // **CSS px → 타일 px**. 타일 1px = 기기 1px이므로 배율이 곧 dpr이다(web2-26 2번).
  // 종전 `dpr/2`는 타일이 늘 256 device px이던 시절의 보정이었고, 그 시절 패턴 배율
  // (0.5·s·dpr)과 곱해지면 dpr이 두 번 실려 결의 물리 크기가 dpr에 비례했다.
  const scale = FIBER_LEGACY ? dpr / 2 : dpr
  g.lineCap = 'round'
  for (let i = 0; i < st.fiber.count; i++) {
    const x = rnd() * TP
    const y = rnd() * TP
    const len = (st.fiber.lenMin + rnd() * (st.fiber.lenMax - st.fiber.lenMin)) * scale
    // 펠트 분포 — 우세 방향 ± 큰 산포(가우스 흉내: 셋 평균)
    const ang = dominant + ((rnd() + rnd() + rnd()) / 3 - 0.5) * Math.PI * 1.15
    const w = (st.fiber.wMin + rnd() * (st.fiber.wMax - st.fiber.wMin)) * scale
    const alpha = st.fiber.aMin + rnd() * (st.fiber.aMax - st.fiber.aMin)
    const dx = Math.cos(ang) * len / 2
    const dy = Math.sin(ang) * len / 2
    g.lineWidth = w
    // 섬유는 종이보다 조금 어둡다 — 색이 아니라 결이 정보다(같은 색조의 어두운 판)
    g.strokeStyle = `rgba(${Math.round(st.tint[0] * 0.82)},${Math.round(st.tint[1] * 0.82)},${Math.round(st.tint[2] * 0.8)},${alpha})`
    // 감싸 그리기 — 경계 근처 섬유를 ±타일만큼 옮겨 다시 긋는다(끊김 없는 반복).
    // 아홉 자리 전부는 낭비다 — 걸치는 축만 옮기면 된다.
    const xs = [0]
    const ys = [0]
    if (wrap) {
      if (x - len < 0) xs.push(TP); else if (x + len > TP) xs.push(-TP)
      if (y - len < 0) ys.push(TP); else if (y + len > TP) ys.push(-TP)
    }
    for (const ox of xs) for (const oy of ys) {
      g.beginPath()
      g.moveTo(x + ox - dx, y + oy - dy)
      g.lineTo(x + ox + dx, y + oy + dy)
      g.stroke()
    }
  }
  return c
}

/** 위/아래 갈림의 단일 출처(#54) — null이면 갈림 없음(전부 종전 경로).
 *  films: 그릴 막(ON·활성 이하·활성 종이) — 배열 순서 = 쌓인 순서.
 *  above: #layerc가 그릴 획의 겹 id 집합(활성과 그 위 — ON만).
 *  ⚠ 막은 **그 종이의 시점에서만**(3-d) — 다른 포즈로 가면 갈림째 사라진다(막도 위 획
 *  분리도). 겹 자체는 3D에서 산다(4부) — 사라지는 것은 막뿐이다. */
export function filmSplit(app: App): { films: Layer[]; above: Set<number> } | null {
  const stack = app.doc.layers.filter(l => l.sheet === app.activeSheet)
  // **겹이 없으면 갈림도 없다** — 겹을 안 쓰는 문서의 비용이 web2-18과 같다(3-b 회계의 전제).
  // ⚠⚠ 종전에는 이 문이 «활성 겹이 없으면»이었다. 그러면 **켜져 있는 겹이 안 보인다**:
  //    눈으로 겹을 껐다 켜면 `on`은 참으로 돌아오는데 활성은 `null`이라(끄면서 내려간다)
  //    막이 통째로 접힌 채 남았다 — 「다시 켜면 그대로 돌아온다」가 깨진 자리다(web2-27 2번).
  //    표시의 술어를 **`on` 하나로** 합친다(#75 ㉠: 만드는 자리와 보이는 자리가 같은 술어).
  if (stack.length === 0) return null
  if (app.activeLayer === null) {
    // 종이가 활성 — **모든 켜진 겹이 막이다**(위/아래 갈림이 없다: 나눌 기준이 없다).
    // 그 겹들의 획은 막 «아래»로 간다(#layerc 몫이 아니다) — 종이에서 올려다보는 그림이다.
    return { films: atSheetPose(app) ? stack.filter(l => l.on) : [], above: new Set() }
  }
  const ai = stack.findIndex(l => l.id === app.activeLayer)
  if (ai < 0) return null
  // ⚠ **above는 포즈 무관**이다 — 궤도로 시점을 벗어나도 위 획은 #layerc가 계속
  // 사영해 그린다(안 그러면 syncStrokes의 제외와 어긋나 획이 사라진다 — 구조가 먼저
  // 말한 함정). **막만 포즈 게이트**(그 종이의 시점에서만 — 3-d).
  const above = new Set(stack.slice(ai).filter(l => l.on).map(l => l.id))
  const films = atSheetPose(app) ? stack.slice(0, ai + 1).filter(l => l.on) : []
  return { films, above }
}

// ⚙️ `atSheetPose`는 **`state.ts`로 옮겼다**(web2-25 2부) — 「지금 포즈가 활성 종이의
//    시점인가」가 표시 게이트이자 **롤이 시점을 굳히는 판정**이 됐으므로 화면 계층 밖에서도
//    읽혀야 한다. 출처는 하나다(#54) — 여기서는 그것을 가져다 쓴다.

/** **지금 보이는 옐로 겹**(web2-22 1부) — 이 겹들의 획은 2D로 그려진다(그 종이·그 시점·
 *  켬). 옐로 획은 3D가 없으므로 «위 획은 포즈 무관» 규칙을 못 탄다 — 포즈를 벗어나면
 *  붙일 자리가 없어 막과 같은 게이트로 사라진다(살아 있는 포즈 — #73 ㉡).
 *  이것이 1-d의 「그 종이에서만 보인다」의 구현이다(다른 종이 = sheet 다름 → 빈 집합). */
export function yellowVisible(app: App): Set<number> {
  if (!atSheetPose(app)) return new Set()
  return new Set(app.doc.layers
    .filter(l => l.paper === 'yellow' && l.on && l.sheet === app.activeSheet)
    .map(l => l.id))
}

export interface FilmLayer {
  /** 매 프레임(dirty) — 바탕 종이의 결 · 막 · 위 획(#layerc). 갈림이 없으면 뒤 둘은 숨긴다 */
  draw: (app: App) => void
  /** dpr·창 크기 변경 */
  resize: (W: number, H: number, dpr: number) => void
  /** ⑩ 비용 표식 — 마지막 draw의 두 몫(막·위 획) ms. 진단·cost20 전용 */
  cost: () => { films: number; above: number }
}

export function initFilmLayer(W: number, H: number, dpr: number): FilmLayer {
  const lastCost = { films: 0, above: 0 }
  const film = document.createElement('canvas')
  film.id = 'film'
  // z-index 1 · #brushc **뒤에**(위로) — CSS mix-blend-mode: multiply는 index.html의
  // #film 규칙에 있다(상태 규칙을 원래 자리에서 — #72 ①). #ink(z2) 아래.
  const brushc = document.getElementById('brushc')!
  brushc.parentElement!.insertBefore(film, brushc.nextSibling)
  // #layerc — **활성 겹과 그 위 겹의 획**(막 위에 산다 — 3-b). 몸체는 2D 사영선
  // (재료색·화면 고정 굵기 — render2d의 확정 몸체 규칙과 같은 값). ⚠ 질감(브러시 입자)은
  // 이 판에서 **안 얹는다** — 아틀라스 재사용이 회차 예산 밖이라 몸체만이다. 알려진
  // 강등으로 기록한다(NOTES·DEFERRED — 실기기에서 「활성 겹 획이 밋밋하다」가 트리거).
  const layerc = document.createElement('canvas')
  layerc.id = 'layerc'
  film.parentElement!.insertBefore(layerc, film.nextSibling)
  // #paperfilm — **바탕 종이의 결**(web2-30 9번). 맨 아래(#gl 앞)에 둔다: 이 판이 곧
  // 종이이므로 아무것도 안 가리고, 그래서 «곱»과 «보통 그리기»가 같은 결과다(재조립 비용 0).
  const paperfilm = document.createElement('canvas')
  paperfilm.id = 'paperfilm'
  const glEl = document.getElementById('gl')!
  glEl.parentElement!.insertBefore(paperfilm, glEl)
  let cw = W, ch = H, cd = dpr
  const fit = () => {
    for (const c of [film, layerc, paperfilm]) {
      c.width = Math.round(cw * cd)
      c.height = Math.round(ch * cd)
      c.style.width = `${cw}px`
      c.style.height = `${ch}px`
    }
  }
  fit()

  // 타일 캐시 — (layer.id|paper|dpr) → 캔버스. 파생이라 저장 안 함(문서에는 Layer만).
  const tileCache = new Map<string, HTMLCanvasElement>()
  const tileFor = (id: number, surface: Surface): HTMLCanvasElement => {
    const key = `${id}|${surface}|${cd}|${FIBER_LEGACY ? 'L' : 'N'}|${PAPER_309 ? '9' : '-'}|${GRAIN_PRE40 ? '4' : '-'}|${LEN_K_OVERRIDE ?? '-'}`
    let t = tileCache.get(key)
    if (!t) { t = bakeFiberTile(id, surface, cd); tileCache.set(key, t) }
    return t
  }
  const tileOf = (l: Layer): HTMLCanvasElement => tileFor(l.id, l.paper)

  /** **패턴의 원점을 문서 좌표에 못 박는다** — 막·바탕이 같은 규칙을 쓴다(#54).
   *  배율은 뷰 줌 `v.s`뿐이다(타일 1px = 기기 1px — web2-26 2번). 위상은 씨앗별로 다르다. */
  function fiberPattern(g: CanvasRenderingContext2D, tile: HTMLCanvasElement, seed: number, v: { s: number; ox: number; oy: number }, dx = 0) {
    const pat = g.createPattern(tile, 'repeat')!
    const rnd = rng32(seed + 7)                   // 위상 — 결 내용과 다른 흐름
    const TP = tilePxFor(cd)
    const phx = rnd() * TP
    const phy = rnd() * TP
    const k = FIBER_LEGACY ? 0.5 * v.s * cd : v.s
    // `dx`는 깔고 치우는 동작의 밀림(web2-40 2번 · 기기 px). **결이 종이와 함께 움직인다** —
    // 섬유는 그 종이의 것이므로 종이가 밀려 들어오는데 결만 제자리면 종이가 «창»이 된다.
    pat.setTransform(new DOMMatrix().translate(v.ox * cd + dx, v.oy * cd).scale(k).translate(phx, phy))
    return pat
  }

  /** **바탕 종이의 결**(web2-30 9번) — 화면 전체. 겹의 막과 **같은 함수가 구운 타일**을
   *  같은 원점 규칙으로 깐다. 씨앗은 **그 종이의 id**다: 종이를 바꾸면 결도 바뀐다
   *  (겹이 `layer.id`로 갈리는 것과 같은 규약). 다시 그리는 조건은 (뷰·종이·dpr) 뿐이라
   *  프레임마다 도는 비용이 아니다 — 궤도 중에도 값이 안 바뀌면 캐시가 그대로 산다. */
  let paperKey = ''
  function drawPaperFilm(app: App) {
    const v = viewXf(app)
    const key = `${app.activeSheet}|${v.s}|${v.ox}|${v.oy}|${cd}|${cw}x${ch}|${FIBER_LEGACY ? 'L' : 'N'}|${PAPER_FIBER ? 'F' : '-'}|${PAPER_309 ? '9' : '-'}|${GRAIN_PRE40 ? '4' : '-'}|${LEN_K_OVERRIDE ?? '-'}`
    if (key === paperKey) return
    paperKey = key
    const g = paperfilm.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    const st = PAPER_STYLE.paper
    g.fillStyle = `rgb(${st.tint[0]},${st.tint[1]},${st.tint[2]})`
    g.fillRect(0, 0, paperfilm.width, paperfilm.height)
    if (!PAPER_FIBER) return                       // 반증 손잡이 — 결 없는 옛 상태
    g.fillStyle = fiberPattern(g, tileFor(app.activeSheet + 1, 'paper'), app.activeSheet + 1, v)
    // ⚠ 여기서는 `multiply`를 **안 쓴다** — 바로 앞 줄이 종이색을 깔았고 그 위에 곱하면
    //   타일의 tint(같은 색)가 한 번 더 곱해져 판이 어두워진다. 타일 자체가 이미
    //   «종이색 + 조금 더 어두운 섬유»라 그대로 덮는 것이 곧 그 종이다.
    g.fillRect(0, 0, paperfilm.width, paperfilm.height)
  }

  /** 밑그림 한 장 — 그 겹의 rect 안에서만. **경도만이 가름이다**(web2-23 2-a):
   *  보이는 선 F · 가린 선 H. ⛔ 파선을 안 쓴다 — 이 앱에서 파선은 이미 「대기」의
   *  채널이고(web2-16 3-a) 채널이 겹치면 둘 다 안 읽힌다. ⛔ 새 색·새 굵기를 만들지
   *  않는다(#54 — `MAT`·`widthOfMat` 그대로).
   *
   *  ⚠⚠ **덮는 것은 «자기가 대체하는 선 자리»뿐이다**(web2-23 2부 — 리뷰 뒤 정정).
   *  초판은 겹의 rect **전체**를 종이색으로 덮었는데, 그러면 「치환」은 서지만 그 종이
   *  안의 **다른 모든 것**(대기 획·아래 겹의 획)이 함께 사라진다 — web2-20 3부의 게이트
   *  ⑧(「세 장을 겹쳐도 아래 획이 읽힌다」)이 그것을 **전량 e2e에서 빨갛게** 잡았다
   *  (paper.spec ⑦⑧⑨ — 대비 0.0002. #71 ㉤의 형태 그대로다: 겹에 한 단계를 끼우면
   *  그 겹을 읽던 팔이 «사라졌다»로 읽는다).
   *  그래서 **선 자리 도려내기**로 바꿨다: 조각마다 그 선을 종이색으로 한 번 지우고
   *  (그 자리의 3D 획이 곧 밑그림이 대체하는 대상이다) 그 위에 F·H를 긋는다.
   *  「가린 선 빼기」에서도 **지우기는 한다** — 안 그러면 원래 획이 그대로 남아 옵션이
   *  아무 일도 안 한다. 지우는 굵기는 «그 자리에 있을 수 있는 가장 굵은 선»
   *  (`C.NIB_MAX`)이다 — 새 숫자를 안 짓는다(#54). */
  function drawUnderlay(g: CanvasRenderingContext2D, app: App, lay: Layer, u: Underlay, dx = 0) {
    const v = viewXf(app)
    g.save()
    g.beginPath()
    g.rect((lay.rect.x * v.s + v.ox) * cd + dx, (lay.rect.y * v.s + v.oy) * cd,
      lay.rect.w * v.s * cd, lay.rect.h * v.s * cd)
    g.clip()
    // 밑그림도 종이와 함께 밀린다(web2-40 2번) — 종이에 눌러 놓은 그림이므로 따로 못 논다
    g.setTransform(cd * v.s, 0, 0, cd * v.s, cd * v.ox + dx, cd * v.oy)   // 문서 좌표
    const is = 1 / v.s           // 화면 고정 굵기(render2d 규약 그대로)
    g.lineCap = 'round'
    g.setLineDash([])            // 파선 아님 — 명시한다(위 ⛔)
    const path = () => {
      g.beginPath()
      for (const seg of u.segs) { g.moveTo(seg.a.x, seg.a.y); g.lineTo(seg.b.x, seg.b.y) }
    }
    // ① 선 자리 도려내기 — 밑그림이 대체하는 3D 획을 그 자리에서만 지운다
    g.strokeStyle = '#f5f3ee'
    g.lineWidth = C.NIB_MAX * is
    path()
    g.stroke()
    // ② 경도로 다시 긋는다 — 보이는 선 F · 가린 선 H
    for (const seg of u.segs) {
      if (seg.hidden && !app.showHidden) continue     // 「가린 선 빼기」 옵션(2-a)
      const grade = seg.hidden ? 'H' : 'F'
      const m = MAT[grade]
      g.strokeStyle = m.color
      g.globalAlpha = m.alpha
      g.lineWidth = widthOfMat({ grade }) * is
      g.beginPath()
      g.moveTo(seg.a.x, seg.a.y)
      g.lineTo(seg.b.x, seg.b.y)
      g.stroke()
    }
    g.globalAlpha = 1
    g.restore()
  }

  /** 그리는 막 한 장 — 겹이거나 «치우는 중인 유령»이다(web2-40 2번). 유령은 문서에
   *  없으므로 밑그림을 함께 들고 온다(`underlayOf`가 못 찾는다). */
  interface FilmItem { lay: Layer; underlay: Underlay | null }

  /** 그 막의 **밀림**(기기 px) — 왼쪽 밖으로. 제자리면 0이고, 0이면 아래 셈이 전부
   *  종전 경로와 **비트 단위로 같다**(게이트 ②: 동작이 끝난 화면이 동작 없이 얹은 화면과
   *  픽셀로 같다 — 곱하는 값이 아니라 **더하는 0**이라 반올림도 안 생긴다). */
  function slideDx(app: App, lay: Layer, now: number, x: number, w: number): number {
    const away = slideAwayOf(app, lay.id, now)
    if (away === 0) return 0
    // 다 갔을 때 오른쪽 변이 화면 왼쪽 밖 — 말린 그림자 폭까지 더 밀어야 그것도 안 남는다.
    // `Math.max(…, w)`: 이미 화면 왼쪽 밖에 있는 종이는 자기 폭만큼만 더 가면 된다.
    const span = Math.max(x + w, w) + C.LAY_CURL_PX * cd
    return -away * span
  }

  function drawFilms(app: App) {
    const split = filmSplit(app)
    const now = performance.now()
    const items: FilmItem[] = (split?.films ?? []).map(lay => ({ lay, underlay: underlayOf(app.doc, lay.id) }))
    // 치우는 중인 유령 — **맨 위**다(마지막에 얹은 것이 걷히는 것이 보통이고, 물러나는
    // 종이가 남은 종이 아래로 파고들면 «치운다»로 안 읽힌다). 막과 같은 포즈 게이트를 쓴다.
    if (atSheetPose(app)) {
      for (const gh of app.slideGhosts) {
        if (gh.layer.sheet === app.activeSheet) items.push({ lay: gh.layer, underlay: gh.underlay })
      }
    }
    const g = film.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, film.width, film.height)
    if (items.length === 0) { film.style.display = 'none'; return }
    film.style.display = ''
    // ── 곱의 자리(3-a) — **캔버스 안에서 곱한다** ─────────────────────────────
    // 초판은 CSS `mix-blend-mode: multiply`였는데 **이 앱의 합성 트리에서 발화하지
    // 않았다**(헤드리스 실측: 순수 페이지에서는 곱이 서고(위생 검사 [0,0,0]), 앱 안에서는
    // 막이 불투명 덮개로 찍혔다 — 곱이면 [232,216,167]일 자리가 막 원색 [242,227,179].
    // WebGL 형제 겹이 낀 합성 트리에서 blend가 죽는 조합이다). 그래서 곱을 우리가 읽을
    // 수 있는 자리로 내렸다: 막 영역에 ①종이색을 깔고 ②아래 캔버스들(#gl·흑연)을
    // **사본으로 얹은 뒤** ③그 위에 in-canvas multiply로 결 패턴을 곱한다. 결과는 그
    // 영역의 «물든 아래 화면» 자체라 보통 합성으로 얹혀도 정확하다.
    // 사본 판독의 근거: captureThumb(web2-12)가 같은 drawImage 경로로 이미 산다.
    // ⚠ 잉크 몸체(#ink — 막 위 겹)는 사본에 없어 **안 물든다** — 잉크는 거의 검정이라
    // 곱의 차가 지각 아래다(알려진 강등 — NOTES·assumptions).
    // 뷰는 **살아 있는 값**이다 — 아래 캔버스(#brushc)가 live app.view로 그린다
    // (brushlayer.ts의 캐시 키가 app.view다). 동결 뷰로 자리 잡으면 팬 중에 rect가 처진다.
    const v = viewXf(app)
    const gl = document.getElementById('gl') as HTMLCanvasElement | null
    const brushc = document.getElementById('brushc') as HTMLCanvasElement | null
    const brushsnap = document.getElementById('brushsnap') as HTMLCanvasElement | null
    // 자리를 **한 번만** 센다 — 클립·재조립·곱·말린 가장자리가 같은 수를 읽는다(#54).
    const boxes = items.map(({ lay }) => {
      const x = (lay.rect.x * v.s + v.ox) * cd
      const y = (lay.rect.y * v.s + v.oy) * cd
      const w = lay.rect.w * v.s * cd
      const h = lay.rect.h * v.s * cd
      return { x, y, w, h, dx: slideDx(app, lay, now, x, w) }
    })
    g.save()
    g.beginPath()
    for (const b of boxes) g.rect(b.x + b.dx, b.y, b.w, b.h)
    g.clip()
    // ① 막 영역(합집합)에 아래 화면을 재조립 — 종이색 + #gl + 흑연(제스처면 스냅샷)
    g.fillStyle = '#f5f3ee'
    g.fillRect(0, 0, film.width, film.height)
    // ⚠ **바탕 결(#paperfilm)이 목록의 맨 앞이다**(web2-30 9번) — 막 영역 안에서도
    //    종이의 결이 살아 있어야 한다. 안 넣으면 겹 아래에서만 종이가 밋밋해진다.
    for (const c of [paperfilm, gl, brushsnap, brushc]) {
      if (!c || c.width === 0) continue
      if (c.style.visibility === 'hidden' || c.style.display === 'none') continue
      g.drawImage(c, 0, 0, film.width, film.height)
    }
    // ①′ **밑그림**(web2-23 2부) — 밑그림이 있는 겹의 종이 안에서 **자기가 대체하는 선
    // 자리를 도려내고** 구운 선이 대신 선다. 그것이 「눌러놓은 선」의 뜻이다: 비쳐 보이는
    // 와이어프레임이 아니라 **그 순간의 그림**이고, 그래서 가린 선을 H로 바꾸거나 빼는
    // 것이 화면에 실제로 나타난다(안 도려내면 원래 획이 그대로 비쳐 2-a의 옵션이 아무
    // 일도 안 한다). **그 선 자리 밖은 종전대로 비친다** — 대기 획도 아래 겹의 획도
    // 남는다(web2-20 3부 게이트 ⑧). 곱(②)은 이 위에 얹힌다 — 밑그림도 결에 물든다.
    items.forEach(({ lay, underlay: u }, i) => {
      if (u) drawUnderlay(g, app, lay, u, boxes[i]!.dx)
    })
    // ② 막들을 순서대로 곱한다 — 겹치는 자리는 누적 곱(더 어두워진다 — 3-a)
    items.forEach(({ lay }, i) => {
      const b = boxes[i]!
      const pat = fiberPattern(g, tileOf(lay), lay.id, v, b.dx)
      // **원점을 문서 좌표에 못 박는다**(3-c ⚠ — rect가 자라도 결이 안 미끄러진다):
      // 패턴 변환 = 뷰 변환 × 층별 위상. 배율은 «타일 1px = 0.5 doc 단위»(k = 0.5·s·dpr —
      // dpr2에서 원해상도·dpr1에서 절반의 고운 결). 줌은 그대로(종이의 성질 — 큰 배율의
      // 뭉개짐 상한은 재서 정한다: assumptions).
      g.globalCompositeOperation = FILM_ALPHA ? 'source-over' : 'multiply'
      g.fillStyle = pat
      g.fillRect(b.x + b.dx, b.y, b.w, b.h)
      // ②′ **말린 앞 가장자리**(web2-40 2번) — 전자책에서 가져오는 것은 이것 하나다:
      //    앞선 변에 지는 짧은 그늘이 종이의 «두께»를 읽히게 한다. 앞 가장자리는
      //    **오른쪽 변**이다(들어올 때 앞섰던 변이고 물러날 때도 같은 변 — 종이의
      //    성질이지 진행 방향의 성질이 아니다: `SLIDE_FROM`이 왼쪽이므로).
      //    ⚠ **제자리에서는 알파가 정확히 0이라 이 블록이 통째로 안 돈다**(게이트 ②).
      const curl = slideCurl(slideAwayOf(app, lay.id, now))
      if (curl > 0) {
        const cwp = C.LAY_CURL_PX * cd
        const x1 = b.x + b.dx + b.w
        const grad = g.createLinearGradient(x1 - cwp, 0, x1, 0)
        grad.addColorStop(0, 'rgba(0,0,0,0)')
        grad.addColorStop(1, `rgba(0,0,0,${C.LAY_CURL_ALPHA * curl})`)
        g.fillStyle = grad
        g.fillRect(x1 - cwp, b.y, cwp, b.h)
      }
      g.globalCompositeOperation = 'source-over'
    })
    g.restore()
  }

  /** 위 획 — 사영 몸체를 매 프레임 그린다(render2d와 같은 «현재 포즈 사영» 흐름) */
  function drawAbove(app: App) {
    const split = filmSplit(app)
    const g = layerc.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, layerc.width, layerc.height)
    if (!split || split.above.size === 0) { layerc.style.display = 'none'; return }
    layerc.style.display = ''
    const v = viewXf(app)   // 살아 있는 뷰 — drawFilms와 같은 이유(렌즈 합성은 viewXf가 진다)
    // 문서 좌표로 그린다 — 화면 고정 굵기는 ×is(render2d 규약 그대로)
    g.setTransform(cd * v.s, 0, 0, cd * v.s, cd * v.ox, cd * v.oy)
    const is = 1 / v.s
    const waiting = new Set(app.lift.waiting)
    const nowMs = performance.now()  // 정착 전이(web2-37 2번) — 한 프레임 안에서 한 시각
    const yset = yellowVisible(app)  // 옐로 2D 획(web2-22 1부 — 그 종이·그 시점만)
    for (const s of app.doc.strokes) {
      if (s.layer === undefined || !split.above.has(s.layer)) continue
      const m = MAT[gradeOf(s)]
      let a2 = s.a, b2 = s.b
      if (isFlat2d(s, yset)) {
        // 옐로 획 — 2D: 문서 좌표 그대로. **정본 기하는 raw 점렬이다**(web2-24 4-b —
        // 프리핸드): 점렬이 있으면 폴리라인으로 긋는다(머무름 갈음·직선 손 획은 두 점).
        if (s.raw && s.raw.length > 2) {
          g.strokeStyle = m.color
          g.globalAlpha = m.alpha
          g.lineWidth = widthOf(s) * is
          g.lineCap = 'round'
          g.lineJoin = 'round'
          g.beginPath()
          g.moveTo(s.raw[0]!.x, s.raw[0]!.y)
          for (let i = 1; i < s.raw.length; i++) g.lineTo(s.raw[i]!.x, s.raw[i]!.y)
          g.stroke()
          g.globalAlpha = 1
          continue
        }
      } else if (!waiting.has(s.id)) {
        const seg = app.lift.lifted.get(s.id)
        if (!seg) continue
        const pa = project(app.lift.an, app.pose, seg.a3)
        const pb = project(app.lift.an, app.pose, seg.b3)
        if (!pa || !pb) continue
        a2 = pa; b2 = pb
      } else if (app.waitFade && waitFadeFactor(fadeRef(app), s.view) <= 0) continue
      // 색상 = 상태(web2-37 2번 · 논포토 블루) · 알파·굵기 = 재료. 세 겹이 같은 함수를
      // 읽는다(#54) — 위 겹의 대기선만 흑연으로 남으면 그 결함은 조용하다.
      g.strokeStyle = bodyHex(gradeOf(s), inkMix(app, waiting.has(s.id), s.id, nowMs))
      g.globalAlpha = m.alpha
      g.lineWidth = widthOf(s) * is
      g.lineCap = 'round'
      if (waiting.has(s.id) && app.waitFade) g.setLineDash([5 * is, 4 * is])
      g.beginPath()
      g.moveTo(a2.x, a2.y)
      g.lineTo(b2.x, b2.y)
      g.stroke()
      g.setLineDash([])
      g.globalAlpha = 1
    }
  }

  return {
    draw(app: App) {
      const t0 = performance.now()
      drawPaperFilm(app)
      drawFilms(app)
      const t1 = performance.now()
      drawAbove(app)
      lastCost.films = t1 - t0
      lastCost.above = performance.now() - t1
    },
    resize(W2, H2, d2) { cw = W2; ch = H2; cd = d2; fit(); tileCache.clear(); paperKey = '' },
    cost: () => ({ ...lastCost }),
  }
}
