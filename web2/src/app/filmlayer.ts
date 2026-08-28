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
// 바탕 종이에는 결이 없다(사람이 정했다 — 겹 둘에만).

import type { App } from './state'
import { fadeRef, isDrawPose, underlayOf } from './state'
import type { Layer, Paper, CamPose, Underlay } from '../core/types'
import { rng32, MAT, gradeOf, widthOf, widthOfMat } from '../core/material'
import { project } from '../core/camera'
import { waitFadeFactor } from '../core/waitfade'
import { C } from '../core/constants'

// ── 막의 색·섬유 매개변수 — 값의 근거는 assumptions(AS-C68·C69) ────────────────
// 곱 합성에서는 «밝기»가 곧 비침이다(흰색 = 투명·어두울수록 짙다) — 별도 불투명도가
// 없다(3-d: 농도 손잡이를 만들지 않는다). 세 장 겹침 하한은 ⑧ 팔이 지킨다.
export const PAPER_STYLE: Record<Paper, {
  tint: [number, number, number]
  fiber: { count: number; lenMin: number; lenMax: number; wMin: number; wMax: number; aMin: number; aMax: number }
}> = {
  yellow: {
    tint: [242, 227, 179],   // 옐로 트레이스 — 이름 자체가 색이다
    fiber: { count: 420, lenMin: 16, lenMax: 44, wMin: 0.7, wMax: 1.6, aMin: 0.025, aMax: 0.07 },
  },
  tracing: {
    tint: [230, 233, 237],   // 벨럼 — 거의 무색·살짝 한색(중성이 아니면 옐로와 섞일 때
    // 채도가 내리지 않는다 — ④ 곡선의 실측이 이 값을 정했다: 난색이면 곱이 채도를 올린다)
    fiber: { count: 170, lenMin: 7, lenMax: 20, wMin: 0.35, wMax: 0.9, aMin: 0.02, aMax: 0.05 },
  },
}

export const TILE_PX = 256   // device px — dpr이 바뀌면 다시 굽는다(dpr 재굽기 팔)

/** D-3 반증 손잡이(3-e ④) — 곱을 알파(source-over)로 바꿔 합성 곡선이 무너지는 것을
 *  e2e가 매 실행 본다. UI 없음 — diag.filmAlphaForTest만 켠다. */
let FILM_ALPHA = false
export const setFilmAlphaForTest = (v: boolean) => { FILM_ALPHA = v }

/** 섬유 타일 — 결정론(rng32(layer.id))·감싸 그리기·90° 회전. 순수 함수에 가깝게:
 *  같은 (id, paper, dpr)이면 같은 픽셀이다(⑥ 저장·복원 뒤 결이 같다의 근거). */
export function bakeFiberTile(id: number, paper: Paper, dpr: number, wrap = true): HTMLCanvasElement {
  // wrap=false는 **반증 전용**(3-e ⑤' — 감싸 그리기를 빼면 이음매 팔이 실패해야 한다)
  const st = PAPER_STYLE[paper]
  const c = document.createElement('canvas')
  c.width = TILE_PX
  c.height = TILE_PX
  const g = c.getContext('2d')!
  const rnd = rng32(id)
  // 바탕 색조 — 곱의 몸체. 결은 그 위에 조금 더 어두운 섬유로.
  g.fillStyle = `rgb(${st.tint[0]},${st.tint[1]},${st.tint[2]})`
  g.fillRect(0, 0, TILE_PX, TILE_PX)
  // 층마다 회전 — 90°의 배수만(이음매를 안 깨는 회전). 방향 우세각도 층마다 다르다.
  const rot = Math.floor(rnd() * 4) * (Math.PI / 2)
  const dominant = rnd() * Math.PI + rot
  const scale = dpr / 2   // 타일은 device px — 섬유 길이는 CSS 감각의 값이라 절반 dpr 보정
  g.lineCap = 'round'
  for (let i = 0; i < st.fiber.count; i++) {
    const x = rnd() * TILE_PX
    const y = rnd() * TILE_PX
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
      if (x - len < 0) xs.push(TILE_PX); else if (x + len > TILE_PX) xs.push(-TILE_PX)
      if (y - len < 0) ys.push(TILE_PX); else if (y + len > TILE_PX) ys.push(-TILE_PX)
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
  if (app.activeLayer === null) return null
  const stack = app.doc.layers.filter(l => l.sheet === app.activeSheet)
  const ai = stack.findIndex(l => l.id === app.activeLayer)
  if (ai < 0) return null
  // ⚠ **above는 포즈 무관**이다 — 궤도로 시점을 벗어나도 위 획은 #layerc가 계속
  // 사영해 그린다(안 그러면 syncStrokes의 제외와 어긋나 획이 사라진다 — 구조가 먼저
  // 말한 함정). **막만 포즈 게이트**(그 종이의 시점에서만 — 3-d).
  const above = new Set(stack.slice(ai).filter(l => l.on).map(l => l.id))
  const films = atSheetPose(app) ? stack.slice(0, ai + 1).filter(l => l.on) : []
  return { films, above }
}

/** 지금 포즈가 활성 종이의 시점인가 — 작도 종이는 DRAW_POSE, 저장 종이는 그 pose.
 *  ⚠ **살아 있는 포즈**로 판정한다(fadeRef 아님). 동결 포즈로 판정하면 궤도 제스처
 *  내내 참으로 남아 ① 막이 도는 장면 위에 계속 곱해지고(3-d 위반 — 시점을 벗어나면
 *  사라져야 한다) ② 그 drawFilms가 궤도 매 프레임 돈다 — cost20 표식이 잡은 31ms/프레임
 *  (D-1: filmCost 몫 분해가 films 쪽을 가리켰다). 떨림 걱정은 없다 — 포즈는 제스처
 *  중 연속으로 움직이므로 경계에서 왕복하지 않는다. */
export function atSheetPose(app: App): boolean {
  const sheet = app.doc.sheets.find(s => s.id === app.activeSheet)
  if (!sheet) return false
  const pose = app.pose
  if (!sheet.pose) return isDrawPose(pose)
  return poseEq(pose, sheet.pose)
}

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

const poseEq = (a: CamPose, b: CamPose): boolean =>
  Math.abs(a.p.x - b.p.x) < 1e-9 && Math.abs(a.p.y - b.p.y) < 1e-9 && Math.abs(a.p.z - b.p.z) < 1e-9 &&
  Math.abs(a.q.x - b.q.x) < 1e-9 && Math.abs(a.q.y - b.q.y) < 1e-9 &&
  Math.abs(a.q.z - b.q.z) < 1e-9 && Math.abs(a.q.w - b.q.w) < 1e-9

export interface FilmLayer {
  /** 매 프레임(dirty) — 막과 위 획(#layerc)을 그린다. 갈림이 없으면 둘 다 숨긴다 */
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
  let cw = W, ch = H, cd = dpr
  const fit = () => {
    for (const c of [film, layerc]) {
      c.width = Math.round(cw * cd)
      c.height = Math.round(ch * cd)
      c.style.width = `${cw}px`
      c.style.height = `${ch}px`
    }
  }
  fit()

  // 타일 캐시 — (layer.id|paper|dpr) → 캔버스. 파생이라 저장 안 함(문서에는 Layer만).
  const tileCache = new Map<string, HTMLCanvasElement>()
  const tileOf = (l: Layer): HTMLCanvasElement => {
    const key = `${l.id}|${l.paper}|${cd}`
    let t = tileCache.get(key)
    if (!t) { t = bakeFiberTile(l.id, l.paper, cd); tileCache.set(key, t) }
    return t
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
  function drawUnderlay(g: CanvasRenderingContext2D, app: App, lay: Layer, u: Underlay) {
    const v = app.view
    g.save()
    g.beginPath()
    g.rect((lay.rect.x * v.s + v.ox) * cd, (lay.rect.y * v.s + v.oy) * cd,
      lay.rect.w * v.s * cd, lay.rect.h * v.s * cd)
    g.clip()
    g.setTransform(cd * v.s, 0, 0, cd * v.s, cd * v.ox, cd * v.oy)   // 문서 좌표
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

  function drawFilms(app: App) {
    const split = filmSplit(app)
    const g = film.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, film.width, film.height)
    if (!split || split.films.length === 0) { film.style.display = 'none'; return }
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
    const v = app.view
    const gl = document.getElementById('gl') as HTMLCanvasElement | null
    const brushc = document.getElementById('brushc') as HTMLCanvasElement | null
    const brushsnap = document.getElementById('brushsnap') as HTMLCanvasElement | null
    g.save()
    g.beginPath()
    for (const lay of split.films) {
      const x = (lay.rect.x * v.s + v.ox) * cd
      const y = (lay.rect.y * v.s + v.oy) * cd
      g.rect(x, y, lay.rect.w * v.s * cd, lay.rect.h * v.s * cd)
    }
    g.clip()
    // ① 막 영역(합집합)에 아래 화면을 재조립 — 종이색 + #gl + 흑연(제스처면 스냅샷)
    g.fillStyle = '#f5f3ee'
    g.fillRect(0, 0, film.width, film.height)
    for (const c of [gl, brushsnap, brushc]) {
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
    for (const lay of split.films) {
      const u = underlayOf(app.doc, lay.id)
      if (u) drawUnderlay(g, app, lay, u)
    }
    // ② 막들을 순서대로 곱한다 — 겹치는 자리는 누적 곱(더 어두워진다 — 3-a)
    for (const lay of split.films) {
      const t = tileOf(lay)
      const pat = g.createPattern(t, 'repeat')!
      // **원점을 문서 좌표에 못 박는다**(3-c ⚠ — rect가 자라도 결이 안 미끄러진다):
      // 패턴 변환 = 뷰 변환 × 층별 위상. 배율은 «타일 1px = 0.5 doc 단위»(k = 0.5·s·dpr —
      // dpr2에서 원해상도·dpr1에서 절반의 고운 결). 줌은 그대로(종이의 성질 — 큰 배율의
      // 뭉개짐 상한은 재서 정한다: assumptions).
      const rnd = rng32(lay.id + 7)                 // 위상 — 결 내용과 다른 흐름
      const phx = rnd() * TILE_PX
      const phy = rnd() * TILE_PX
      const k = 0.5 * v.s * cd
      pat.setTransform(new DOMMatrix().translate(v.ox * cd, v.oy * cd).scale(k).translate(phx, phy))
      g.globalCompositeOperation = FILM_ALPHA ? 'source-over' : 'multiply'
      g.fillStyle = pat
      const x = (lay.rect.x * v.s + v.ox) * cd
      const y = (lay.rect.y * v.s + v.oy) * cd
      g.fillRect(x, y, lay.rect.w * v.s * cd, lay.rect.h * v.s * cd)
      g.globalCompositeOperation = 'source-over'
    }
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
    const v = app.view   // 살아 있는 뷰 — drawFilms와 같은 이유
    // 문서 좌표로 그린다 — 화면 고정 굵기는 ×is(render2d 규약 그대로)
    g.setTransform(cd * v.s, 0, 0, cd * v.s, cd * v.ox, cd * v.oy)
    const is = 1 / v.s
    const waiting = new Set(app.lift.waiting)
    const yset = yellowVisible(app)  // 옐로 2D 획(web2-22 1부 — 그 종이·그 시점만)
    for (const s of app.doc.strokes) {
      if (s.layer === undefined || !split.above.has(s.layer)) continue
      const m = MAT[gradeOf(s)]
      let a2 = s.a, b2 = s.b
      if (yset.has(s.layer)) {
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
      g.strokeStyle = m.color
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
      drawFilms(app)
      const t1 = performance.now()
      drawAbove(app)
      lastCost.films = t1 - t0
      lastCost.above = performance.now() - t1
    },
    resize(W2, H2, d2) { cw = W2; ch = H2; cd = d2; fit(); tileCache.clear() },
    cost: () => ({ ...lastCost }),
  }
}
