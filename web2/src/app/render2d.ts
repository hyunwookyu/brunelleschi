// 2D 오버레이 — 작도선·대기 획·미리보기·표식·뷰 큐브.
// dpr 규약의 단일 출처는 resize2d() 하나다: 기록 좌표는 CSS px,
// 백버퍼는 CSS×dpr, ctx 변환으로 CSS px 그대로 그린다. (dpr 1과 2 모두 e2e로 확인)
// 뷰 오프셋(화면 팬·줌)은 그리기 변환으로만 얹는다 — 문서 좌표는 안 바뀐다.
// 선 굵기·표식 크기는 화면 고정(배율로 나눈다).

import type { App, ViewOffset } from './state'
import { isDrawPose, isEraser, activeGrade, draftBrushed, fadeRef, fadeRefView, yellowActive, dimLabelPos, viewXf, inkMix } from './state'
import { vpMarks, project, projectSeg, groundAxes, horizonScreenY } from '../core/camera'
import { cubeGeom, cubeArrows, viewName } from '../core/viewcube'
import { C } from '../core/constants'
import { MAT, gradeOf, rng32, widthOf, widthOfMat } from '../core/material'
import { overshootEnds } from '../core/overshoot'
import { waitFadeFactor, atOwnPose, bodyHex } from '../core/waitfade'
import type { OsnapHit } from '../core/osnap'
import { dist2, type Pt, type V3 } from '../core/vec'
import { filmSplit } from './filmlayer'
import { formatMm, formatUnits, dimSkew, skewOff } from '../core/dim'
import { measurePoint3, measureMm, measureUnits } from '../core/measure'

/** D-3 반증 손잡이(web2-19 1부) — e2e만 켠다(diag.forceConstructing). 본문 주석 참조. */
let FORCE_CONSTRUCTING = false
export const setForceConstructing = (v: boolean) => { FORCE_CONSTRUCTING = v }

export interface Draft {
  start: Pt
  end: Pt
  raw: Pt[]
  /** 미리보기 라벨 — 'vp' | 축id | null(자유). 'horizon'은 web2-17에서 없어졌다. */
  label: string | null
  /** 이 획이 만들 소실점 자리(label 'vp'일 때 — web2-19 1-b). 파선 ✕ 예고가 읽는다.
   *  출처는 resolveEnd(= classifyNext)가 낸 값 하나다 — 여기서 다시 계산하지 않는다. */
  vp?: Pt
  startSnap: OsnapHit | null
  startP3: V3 | null
  endSnap: OsnapHit | null
  /** 지금 그리는 선의 실척 길이 mm — 리본 패널이 읽는다(지시 4-5). 무스케일이면 null */
  lenMm: number | null
  /** 잠정 id(web2-12 2번) — 획이 시작될 때 `app.nextId`를 읽어 고정한다. 확정 시
   *  `commitStroke`가 같은 값을 실제 id로 쓰므로(그 사이 다른 확정이 없다 — 포인터가
   *  잡혀 있다) 브러시 시드가 미리보기→확정에서 안 바뀐다. 프레임마다 새로 뽑으면
   *  입자가 반짝인다(지시의 함정 — D-3 반증을 실제로 돌려 확인했다). */
  nid: number
  /** 점별 필압(양자화 0..C.PRESS_Q · raw와 나란) — 펜만. 미리보기 브러시가 읽는다.
   *  양자화 식은 확정(quantIn)과 같다 — 달라지면 뗄 때 입자가 튄다(2번 게이트). */
  press?: number[]
  /** **머무름이 성립했다**(web2-22 2부 — 옐로 전용): 미리보기가 반듯해진 상태.
   *  표식(무채색·순간 피드백)이 이것을 읽고, 확정은 이 상태의 end를 그대로 받는다. */
  held?: boolean
}

/** **«그 소실점이 화면 안인가»** — 지평선 자동 숨김(web2-17 5부)과 ✕ 표식 컬링이
 *  같은 함수를 쓴다(원칙 a — 두 자리에 다른 식을 두지 않는다). 문서 좌표의 점을
 *  뷰 오프셋으로 화면에 놓고 뷰포트 사각형과 견준다. 자동 숨김은 여백 0(지시 5-b),
 *  ✕ 컬링은 기호 반경 몫의 여백(50)을 쓴다 — 여백만 다르고 식은 하나다. */
export function vpOnScreen(view: ViewOffset, vp: Pt, w: number, h: number, marginPx = 0): boolean {
  const sx = vp.x * view.s + view.ox
  const sy = vp.y * view.s + view.oy
  return sx >= -marginPx && sx <= w + marginPx && sy >= -marginPx && sy <= h + marginPx
}

/** **지평선이 보이는가**(web2-17 5부) — 표시(draw2d)와 체크박스(main)가 같은 함수를 읽는다.
 *  사람이 정했으면(`horizonPref`) 그것, 아니면 자동: 소실점이 하나 이상 있고 **첫
 *  소실점이 화면 안**이면 숨는다(사람 문면 — 「숨겨져 있더라도 대각선 그려서 교점으로
 *  찾아내면 되니까」: 소실점이 보일 때는 그것이 눈높이를 말한다).
 *  제스처(궤도·팬·줌) 중에는 포즈·뷰가 동결돼(fadeRef·fadeRefView) 깜빡이지 않는다.
 *  ⚠ 기울면 horizonScreenY가 null이라 보임 판정이 참이어도 안 그려진다 — 표현의
 *  한계이지 선언의 변화가 아니다(체크박스는 판정을 비춘다). */
export function horizonVisible(app: App, w: number, h: number): boolean {
  if (app.horizonPref !== null) return app.horizonPref
  const an = app.lift.an
  if (an.vps.length === 0) return true
  const first = vpMarks(an, fadeRef(app)).find(m => m.id === 'vp0')
  if (!first) return true                       // 그 포즈에서 소실점이 안 보인다 — 지평선이 말한다
  return !vpOnScreen(fadeRefView(app), first.vp, w, h, 0)
}

export function resize2d(canvas: HTMLCanvasElement, W: number, H: number, dpr: number) {
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

// ── 색 규칙 정본 (web2-10 지시 7 — 색 빼기 세 번째에서 근거를 한 곳에 모았다) ──
// **색을 갖는 것은 «그리는 중의 상태 예고» 둘뿐이다**:
//   ① 작도 안내 파랑(preview) — 이 획이 카메라를 만든다는 예고(지평선·소실점 작도 중).
//   ② 면 미리보기 — 탭하면 만든다(초록 snap) / 없앤다(파랑 preview)의 예고.
// 나머지는 전부 무채색이다:
//   상시 표시 — 지평선(2H)·소실점 ✕(웜 그레이)·격자·작도선·대기 획(재료색).
//   순간 피드백 — 오스냅 기호(2H 급·알파 0.5) · **축 스냅 안내(#555 파선 — mark 참조)**.
// **진하기 대역도 정보다** — 순간 피드백끼리 같은 대역이면 「축에 붙었다」와 「점에
// 붙었다」가 안 갈린다(web2-08이 COL.snap에서 한 실수): 2H(알파 0.5) = 오스냅 ↔
// #555(불투명) = 축 안내. 두 대역을 합치지 않는다.
// 색 빼기의 역사: 소실점 ✕(web2-02·상시라서) → 오스냅(web2-08·형태가 가르므로) →
// **축 넷(web2-10 지시 7·사람이 실기기에서 뒤집었다 — PITFALLS #65)**.
// ⚙️ **획의 재료색·알파(web2-11 2부)**: brush 렌더러가 켜져 있으면 획 «몸체»의 색은
// 이 파일이 아니라 `brushmap.ts`의 `strokeColor()`(MAT 색·알파의 종이색 혼합)가 정한다 —
// 갈라진 것이 아니라 **출처가 MAT 하나**인 것은 같고 표현 계층만 둘이다(classic: 여기의
// globalAlpha / brush: 혼합색). 여기 COL 표의 규칙(작도·표식·안내 색)은 두 모드 공통이다.
// ⚠ web2-08의 「축 색 넷은 남는다 — 그쪽은 형태가 없어 색이 유일한 정보다」는 **뒤집혔다.**
//   대체 채널은 파선 안내다(axisGuide — 붙으면 양끝 너머로 파선이 뻗는다. SketchUp
//   추론선의 무채색판). 축마다 파선 패턴이 다르다(AXIS_DASH) — 상대 구분은 패턴이 내고,
//   절대 식별이 실제로 되는지는 실기기 몫이다(DEFERRED).
const COL = {
  grid: 'rgba(120,116,110,0.18)',
  // 지평선(web2-12 7번) — 작도 대역으로 이관(재료가 아니다 — 위 지평선 블록 주석이 정본).
  // 격자(0.18)보다는 서고(작도의 뼈대) 종전 2H(알파 0.5)보다 옅다. 토글이 하한을 푼다.
  horizon: 'rgba(150,147,141,0.32)',
  construction: '#8a7f6a',
  // ⚙️ **대기 획의 몸체 색은 여기 없다** — `core/waitfade.ts`의 `WAIT_INK`(논포토 블루)가
  // 그 자리다(web2-37 2번). 세 겹(#brushc·#ink·#layerc)이 다 읽어야 하는데 이 객체는
  // render2d 안에만 있고 filmlayer가 못 읽는다(순환) — 그래서 core로 갔다.
  // 종전의 `waiting: '#555'`·`waitingDim`은 **한 번도 안 쓰였다**(죽은 항목이라 걷었다):
  // 대기 몸체는 web2-16 3-a부터 재료색이었고 이제 상태색이다.
  preview: '#1a6ac2',
  // ⚠ 붉은색이었다 — 화면에 **상시** 떠 있는 표식이라 그림보다 눈에 띄었다(지시 3-c 대조표).
  // 소실점은 지평선과 같은 급의 작도 표식이므로 같은 색으로 물러난다.
  vpMark: '#8a7f6a',
  // 축 스냅 안내 — 무채색 파선(web2-10 지시 7). 선 자체는 재료색이고 «축에 붙었다»는
  // 이 파선이 말한다. 오스냅(2H·0.5)과 다른 대역(불투명 #555)이어야 한다 — 위 정본.
  axisGuide: '#555',
  // ⚠ 강조색(#1a6ac2)으로 합치려다 되돌렸다 — 옛 vp1 축 색(#1a7fc2)과 사실상 같은 파랑이라
  // 「축에 붙었다」와 「점에 붙었다」가 화면에서 안 갈린다. 순간 피드백끼리는 갈려야 한다.
  // **면 미리보기(«만든다»의 초록)에만 남는다** — 오스냅 기호는 mark()의 2H(무채색)다.
  snap: '#1a9c50',
  // 오스냅 기호 — 무채색이고 **2H 급**이다(web2-10 지시 6 — 「HB 대역이라 진하다」는
  // 실기기 관측으로 내렸다). 값은 경도표를 그대로 읽는다(MAT['2H'] — 지평선과 같은 방식,
  // 숫자를 새로 짓지 않는다). mark()가 색·알파를 MAT에서 직접 읽으므로 여기 항목이 없다.
  // 하한 근거: 2H는 경도표의 가장 옅은 급이다 — 그 아래로는 「그린 선보다 옅은 값」이
  // 경도표에 없다. 굵기 1.5px는 유지한다(7px급 기호가 1.1px·알파 0.5로는 사라질 위험 —
  // AS-C23의 되돌릴 조건이 굵기를 가시성 손잡이로 지정한 그대로다).
  // ⚠ 획 «위»에서의 대비는 색이 아니라 형태(□◆△… — 획과 다른 기하)가 가른다(AS-C23).
  cubeFace: 'rgba(252,251,248,0.80)',
  cubeEdge: '#b0a99c',
}

// ── 잉크 번짐(web2-12 9번) — **획에 내재한 것만**: 머무름(체류) · 내림·뗌 · 가장자리 ──
// D-1 확인(NOTES): rotring 브러시가 이미 내는 것은 **대기 잉크 몸체의 가장자리 질감**뿐이다
// (승격 잉크는 Line2 균일선 — 아무 질감도 없다). 그래서:
//   · 머무름·내림뗌 — 잉크 획 전부(rotring에 그 개념이 없다)
//   · 가장자리 퍼짐 — **승격 잉크에만**(대기는 rotring 질감 위에 덧그리면 두 번 번진다)
// 체류는 저장된 점렬(raw)의 밀집에서 읽는다 — 120Hz 스트림에서 같은 자리 점의 수가 곧
// 시간이다(타임스탬프를 새 필드로 만들지 않는다 — Stroke 불변). 위치는 원래 a–b 위의
// 비율(t)로 사상해 **어느 포즈의 사영에도** 같은 자리에 얹는다. 크기는 전부 화면 고정
// (원칙 e — ×is) · 시드는 획 id(rng32 — 프레임마다 같은 자국).
function inkFlow(
  ctx: CanvasRenderingContext2D,
  id: number, docA: Pt, docB: Pt, raw: Pt[] | undefined,
  a: Pt, b: Pt, w: number, is: number, edge: boolean,
) {
  const ink = MAT.INK
  ctx.fillStyle = ink.color
  const along = (t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const dot = (p: Pt, r: number, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill()
  }
  // 내림·뗌 — 대는 자리·떼는 자리가 미세하게 진하고 굵다(니브의 0.75배 원)
  dot(a, w * 0.75 * is, 0.95)
  dot(b, w * 0.7 * is, 0.9)
  // 머무름 — raw에서 «제자리 점 묶음»(이동 < 1.2 doc px)을 세어 고임을 얹는다
  if (raw && raw.length > 3) {
    const abx = docB.x - docA.x, aby = docB.y - docA.y
    const L2 = abx * abx + aby * aby
    if (L2 > 1e-9) {
      let runStart = 0
      for (let i = 1; i <= raw.length; i++) {
        const moved = i === raw.length ||
          Math.hypot(raw[i]!.x - raw[i - 1]!.x, raw[i]!.y - raw[i - 1]!.y) > 1.2
        if (moved) {
          const k = i - runStart
          if (k >= 5) {                       // 묶음 다섯(≈40ms@120Hz)부터 고임으로 본다
            const p = raw[runStart + Math.floor(k / 2)]!
            const t = Math.max(0, Math.min(1,
              ((p.x - docA.x) * abx + (p.y - docA.y) * aby) / L2))
            dot(along(t), Math.min(w * (0.6 + 0.05 * k), w * 1.6) * is, 0.85)
          }
          runStart = i
        }
      }
    }
  }
  // 가장자리 퍼짐 — 섬유를 타는 잔점(승격 잉크만 — 위 머리주석). 시드 = 획 id.
  if (edge) {
    const rng = rng32(id)
    const Lscr = Math.hypot(b.x - a.x, b.y - a.y) / is   // 화면 px 길이
    const n = Math.floor(Lscr / 9)
    const nx = -(b.y - a.y), ny = b.x - a.x
    const nl = Math.hypot(nx, ny) || 1
    for (let i = 0; i < n; i++) {
      const t = rng()
      const side = rng() < 0.5 ? -1 : 1
      const off = (w * 0.5 + 0.4 + rng() * 1.1) * is * side
      const p = along(t)
      dot({ x: p.x + (nx / nl) * off, y: p.y + (ny / nl) * off },
        (0.3 + rng() * 0.4) * is, 0.45)
    }
  }
  ctx.globalAlpha = 1
}

export function draw2d(
  ctx: CanvasRenderingContext2D, app: App,
  draft: Draft | null, hover: OsnapHit | null, eraser: Pt | null,
  facePrev?: { poly: Pt[]; mode: 'add' | 'remove' } | null,
  /** 쓰는 중의 손글씨 한 획(web2-29 1단계) — 아직 `app.dimInk`에 안 들어간 것 */
  dimInk?: Pt[] | null,
) {
  const an = app.lift.an
  const dpr = window.devicePixelRatio || 1
  const v = viewXf(app)   // **보기 렌즈가 합성된 변환**(web2-31 2번) — 손대지 않았으면 app.view 그대로
  const is = 1 / v.s // 화면 고정 크기 보정
  const cw = ctx.canvas.width / dpr, ch = ctx.canvas.height / dpr

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy)

  // 보이는 문서 영역 (캔버스 기준)
  const x0 = -v.ox * is, x1 = (cw - v.ox) * is
  const y0 = -v.oy * is, y1 = (ch - v.oy) * is

  const atDraw = isDrawPose(app.pose)
  const now = performance.now()   // 정착 전이(web2-37 2번) — 한 프레임 안에서 한 시각

  // 지면 격자 — **공간의 정사각형을 투영한 것**이다(이론서 9.5). 화면 각도 균등 분할이 아니다.
  // 아주 연하게, 무채색 — 사용자가 그린 선이 가장 눈에 띄어야 한다(6-h 「선 우선순위」).
  if (app.grid) {
    const ga = groundAxes(an)
    if (ga) {
      const [u, v] = ga
      const step = C.GRID_STEP, n = C.GRID_HALF, span = step * n
      ctx.strokeStyle = COL.grid
      ctx.lineWidth = 1 * is
      ctx.beginPath()
      for (let k = -n; k <= n; k++) {
        for (const [d, e] of [[u, v], [v, u]] as const) {
          const o = { x: e.x * k * step, y: 0, z: e.z * k * step }
          const seg = projectSeg(an, app.pose,
            { x: o.x - d.x * span, y: 0, z: o.z - d.z * span },
            { x: o.x + d.x * span, y: 0, z: o.z + d.z * span })
          if (!seg) continue
          ctx.moveTo(seg[0].x, seg[0].y); ctx.lineTo(seg[1].x, seg[1].y)
        }
      }
      ctx.stroke()
    }
  }

  // 작도선 — **지평선뿐이다.** 이제 획이 아니라 프레임의 상수(H/2 — web2-17)라
  // **빈 문서에서도 그려진다**(카메라가 상시이므로 horizonScreenY가 늘 값을 낸다).
  // 깊이선은 작도선이 아니다 — 소실점을 정의하면서 동시에 그은 3D 선이고,
  // 승격됐으면 three.js가, 아직이면 아래 「대기 획」이 그린다. 여기서 또 그리면 두 번 그려진다.
  //
  // **정렬된 포즈면 전부 긋는다**(web2-06 지시 3) — 작도 포즈만이 아니다. 접힌 포즈도
  // 피치 0이라 지평선이 그대로 화면 수평선인데 안 그려서, 접은 뒤 **눈높이를 화면에서
  // 못 읽었다**(web2-05가 픽셀로 발견). 어디에 긋는가는 `camera.ts`가 답한다 —
  // 여기서 `principal.y`를 직접 쓰면 판정과 표시가 두 자리로 갈린다(#54).
  //
  // **진하기 — 작도선 대역이다(web2-12 7번 — «경도표의 2H를 읽는다»는 web2-09의 결정을
  // 뒤집었다·#65 규약대로 여기 고쳐 적는다)**: 지평선은 재료가 아니라 작도 보조이므로
  // 진하기의 출처도 경도표(MAT — 재료의 정본)가 아니라 COL(작도·표식 색의 정본)이 맞다.
  // web2-09의 하한 논리(「너무 옅으면 안 보인다」)는 **토글이 풀었다** — 이제 안 보이는 게
  // 싫으면 켜면 되므로 더 내렸다(잉크량 실측은 level.spec 「지평선이 옅다」의 대역 주석).
  // web2-17 5부: 표시 여부는 horizonVisible 하나가 정한다(자동 숨김 — 위 머리주석).
  // 입자는 안 얹는다 — 작도선이지 재료가 아니다.
  const hzY = horizonVisible(app, cw, ch) ? horizonScreenY(an, app.pose) : null
  if (hzY !== null) {
    ctx.strokeStyle = COL.horizon
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.moveTo(x0, hzY); ctx.lineTo(x1, hzY)
    ctx.stroke()
  }

  // 대기 획 — 사라지지 않는다(불변식 j). 자기 포즈가 아니면 흐리게. 색은 재료.
  // ⚠ 여기의 `own`은 **계속 `atDraw`다**(지시 3에서 함께 봤다 · `DEFERRED.md`가 든 자리).
  // 지평선과 **다른 물음**이라 다른 술어다: 지평선은 세계의 것이라 정렬이면 어느 포즈에서든
  // 같은 자리이고, 대기 획은 **그 포즈에서만 뜻이 있는 2D 좌표**다 — 접힌 포즈는 작도 포즈가
  // 아니므로 작도 포즈의 대기 획은 흐린 것이 맞다. 같은 술어로 묶었으면 그것이 #54다.
  // web2-13 3-a: 감쇠 켜짐(기본)이면 자기 시점에서 벗어난 각도로 흐려지다
  // `WAIT_FADE_DEG` 밖에서 0 — «그 시점의 트레이싱지 위 잉크»(초안 §5).
  // 끄면 아래 종전 식 **그대로**다(A-4 — 옛 동작으로 가는 길. NOTES 「구조 결정」의
  // 「항상 그리되 포즈가 다르면 흐리게」 타협은 이 관측으로 되돌릴 조건이 발동했다).
  for (const id of app.lift.waiting) {
    const s = app.lift.strokes.get(id)
    if (!s) continue
    // 감쇠 판정 포즈는 fadeRef다(web2-14 3번) — 제스처(궤도·팬) 중에는 동결값이라
    // 돌리는 동안 표시가 안 변한다. 옛 동작(끔)은 종전 식 그대로(A-4 — app.pose·atDraw).
    // ⚠ waitFadeFactor는 web2-16 3-b부터 **이진**(창 안 1 · 밖 0)이다 — 페이드 폐지.
    const own = app.waitFade ? atOwnPose(fadeRef(app), s.view) : (s.view ? !atDraw : atDraw)
    const factor = app.waitFade ? waitFadeFactor(fadeRef(app), s.view) : (own ? 1 : 0.3)
    if (factor <= 0) continue
    const m = MAT[gradeOf(s)]
    // 몸체(web2-16 3-a): 기본 경로(brush 렌더러 + 감쇠 판정)에서는 **흑연 파선**을
    // #brushc가 긋는다(brushlayer.drawWaitingDashed — 질감이 확정 획과 같다). 그때
    // 여기의 벡터 점선은 안 긋는다 — 두 몸체가 겹치면 진하기가 이중이 된다.
    // classic 렌더러·감쇠 끔(A-4)에서는 종전 벡터 점선 그대로다(패턴 상수는 한 곳 —
    // C.WAIT_DASH_* — brushlayer와 같은 값을 읽는다).
    const brushBody = app.renderer === 'brush' && app.waitFade
    if (!brushBody) {
      // 색상 = 상태(web2-37 2번 · 논포토 블루) · 알파·굵기 = 재료 그대로.
      // 등급 축과 상태 축이 직교한다 — 「농도만으로 하면 2H 확정선과 2B 대기선이 섞인다」.
      ctx.strokeStyle = bodyHex(gradeOf(s), inkMix(app, true, s.id, now))
      ctx.globalAlpha = m.alpha * factor
      ctx.lineWidth = widthOf(s) * is
      ctx.setLineDash([C.WAIT_DASH_ON_PX * is, C.WAIT_DASH_OFF_PX * is])
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
    // grain은 classic 렌더러의 질감이다 — brush 렌더러가 켜져 있으면 질감은 #brushc 겹이
    // 그린다(web2-11 2-e: **끄되 지우지 않는다** — 되돌리기(2-b)의 절반이 이 분기다).
    // 질감은 정확히 자기 시점에서만(중간 감쇠에 얹으면 몸체보다 질감이 진한 역전 — waitfade.ts).
    if (app.renderer === 'classic' && m.grain > 0 && own) grain(ctx, s.id, s.a, s.b, m.grain, m.alpha, s.mat?.press, is)
    // 잉크 번짐(web2-12 9번) — 대기 잉크는 머무름·내림뗌만(가장자리는 rotring 몫 — inkFlow 머리주석)
    if (gradeOf(s) === 'INK' && own) inkFlow(ctx, s.id, s.a, s.b, s.raw, s.a, s.b, widthOf(s), is, false)
  }

  // 질감 — 흑연 입자. 자로 그은(승격된) 선에도 재료가 보인다.
  // 획별 시드 고정(rng32) — 프레임마다 같은 입자, Math.random 없음.
  // (brush 렌더러가 켜져 있으면 이 루프는 안 돈다 — 질감은 #brushc가 그린다. 2-e)
  for (const [id, seg] of app.renderer === 'classic' ? app.lift.lifted : new Map<number, { a3: V3; b3: V3 }>()) {
    const s = app.lift.strokes.get(id)
    if (!s) continue
    const m = MAT[gradeOf(s)]
    if (m.grain <= 0) continue // 잉크는 균일하고 선명하다
    const a = project(an, app.pose, seg.a3)
    const b = project(an, app.pose, seg.b3)
    if (!a || !b) continue
    grain(ctx, s.id, a, b, m.grain, m.alpha, s.mat?.press, is)
  }

  // ── 잉크 확정선의 **몸체**(web2-18 1부) — 여기가 그 자리다 ──────────────────
  // 종전에는 Line2(#gl)가 그렸는데, #brushc(연필 흑연)가 #gl **위**라 연필 위에 그은
  // 잉크가 흑연에 덮였다(사람 관측). 잉크는 균일선이므로 Canvas 2D가 정확히 같은 것을
  // 그린다 — 색·알파는 `MAT.INK`, 굵기는 **`widthOf(stroke)` 하나**(#54: 니브 굵기의
  // 출처는 그 함수다). 화면 고정 굵기라 `is = 1/view.s`를 곱한다(이 파일의 규약).
  // ⚠ **렌더러 모드와 무관**하다(classic에서도 잉크는 위여야 한다 — render3d의 같은 분기).
  // ⚠ 순서: 이 몸체가 먼저이고 **넘김 꼬리·번짐이 그 위**다(아래 두 절) — 종전 #gl 시절과
  //   같은 위아래다(꼬리·번짐은 그때도 #ink였다). 옮긴 것은 몸체 하나뿐이다.
  for (const [id, seg] of app.lift.lifted) {
    const s = app.lift.strokes.get(id)
    if (!s || gradeOf(s) !== 'INK') continue
    const a = project(an, app.pose, seg.a3)
    const b = project(an, app.pose, seg.b3)
    if (!a || !b) continue
    const m = MAT.INK
    // 정착 전이(web2-37 2번) — 창 밖이면 `inkMix`가 0이고 `bodyHex(_, 0)`은 `m.color`
    // **그 문자열**이라 평소 픽셀이 안 움직인다.
    ctx.strokeStyle = bodyHex('INK', inkMix(app, false, id, now))
    ctx.globalAlpha = m.alpha
    ctx.lineWidth = widthOf(s) * is
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    ctx.globalAlpha = 1
  }

  // 모서리 넘김(web2-12 8번) — **표현만**: 승격 획의 «다른 획과 만나는 끝»에 화면 고정
  // 길이(C.OVERSHOOT_PX)의 꼬리를 재료색·재료 굵기로 잇는다. a·b(기하)는 안 움직인다 —
  // 판정은 core/overshoot.ts(3D 일치·캐시), 오스냅·조각·면·lift는 이 꼬리를 모른다
  // (그리기만 읽는다 — e2e가 꼬리 끝에서 오스냅이 안 잡히는 것까지 잰다).
  // 두 렌더러 공통(잉크 겹 벡터 꼬리) — 질감 없는 짧은 빠짐이 손 제도의 넘김 모양이다.
  {
    const meets = overshootEnds(app.lift)
    for (const [id, seg] of app.lift.lifted) {
      const m = meets.get(id)
      if (!m || (!m.a && !m.b)) continue
      const s = app.lift.strokes.get(id)
      if (!s) continue
      const a = project(an, app.pose, seg.a3)
      const b = project(an, app.pose, seg.b3)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const L = Math.hypot(dx, dy)
      if (L < 1e-9) continue
      const mm = MAT[gradeOf(s)]
      const os = C.OVERSHOOT_PX * is          // 화면 고정 — 문서 좌표로 환산
      ctx.strokeStyle = mm.color
      ctx.globalAlpha = mm.alpha
      ctx.lineWidth = widthOf(s) * is
      ctx.beginPath()
      if (m.a) { ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - (dx / L) * os, a.y - (dy / L) * os) }
      if (m.b) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + (dx / L) * os, b.y + (dy / L) * os) }
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  // 잉크 번짐(web2-12 9번) — 승격 잉크(Line2 균일선)에 머무름·내림뗌·가장자리를 얹는다.
  // 위치는 원래 a–b의 비율로 사상하므로 어느 포즈에서도 같은 자리다(inkFlow 머리주석).
  for (const [id, seg] of app.lift.lifted) {
    const s = app.lift.strokes.get(id)
    if (!s || gradeOf(s) !== 'INK') continue
    const a = project(an, app.pose, seg.a3)
    const b = project(an, app.pose, seg.b3)
    if (!a || !b) continue
    inkFlow(ctx, s.id, s.a, s.b, s.raw, a, b, widthOf(s), is, true)
  }

  // 소실점 표식 — 현재 포즈 기준(불변식 i: 표시=스냅=그리드가 같은 출처).
  // 컬링은 자동 숨김과 같은 함수(vpOnScreen — 여백 50만 다르다. 원칙 a).
  for (const ax of vpMarks(an, app.pose)) {
    if (!vpOnScreen(v, ax.vp, cw, ch, 50)) continue
    ctx.strokeStyle = COL.vpMark
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.moveTo(ax.vp.x - 6 * is, ax.vp.y - 6 * is); ctx.lineTo(ax.vp.x + 6 * is, ax.vp.y + 6 * is)
    ctx.moveTo(ax.vp.x - 6 * is, ax.vp.y + 6 * is); ctx.lineTo(ax.vp.x + 6 * is, ax.vp.y - 6 * is)
    ctx.stroke()
  }

  // ── 종이(겹)의 가장자리(web2-24 4-d) — **테두리 선은 없다.** ─────────────────
  // web2-20 3-d(옅은 둘레 선·활성만 진하게)를 사람이 뒤집었다: 「현실감이 확 떨어진다」.
  // 실제 트레이싱지에는 1px 윤곽선이 없고 **색조가 끝나는 자리**(막의 tint 경계 —
  // filmlayer)가 곧 가장자리다. 인셋(짧은 변 5%)·층별 흔들림이 겹 수를 이미 읽게 한다.
  // 활성 표시는 종속 탭(layerbar)이 한다 — 테두리로 하던 일을 탭이 이미 하고 있었다.
  // 남는 것은 **rect 끌기의 손잡이 하나**다: 포인터가 가장자리 가까이 갔을 때만
  // (input.rectEdgesAt — 끌기와 같은 판정) 그 변을 옅게 띄운다. 순간 피드백이라 색
  // 규칙의 순간 대역(COL.snap)을 쓴다 — 상시 무채색(vpMark)이 아니다.
  {
    const split = filmSplit(app)
    if (split && app.rectHover) {
      const lay = split.films.find(f => f.id === app.rectHover!.id)
      if (lay) {
        const { l, r, t, b } = app.rectHover.edges
        const R = lay.rect
        ctx.strokeStyle = COL.snap
        ctx.globalAlpha = 0.5
        ctx.lineWidth = 1.2 * is
        ctx.beginPath()
        if (l) { ctx.moveTo(R.x, R.y); ctx.lineTo(R.x, R.y + R.h) }
        if (r) { ctx.moveTo(R.x + R.w, R.y); ctx.lineTo(R.x + R.w, R.y + R.h) }
        if (t) { ctx.moveTo(R.x, R.y); ctx.lineTo(R.x + R.w, R.y) }
        if (b) { ctx.moveTo(R.x, R.y + R.h); ctx.lineTo(R.x + R.w, R.y + R.h) }
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }

  // ── 획득된 연장선의 표식(web2-18 2-b) — **획득한 것이 손에 보여야 한다** ─────────
  // 안 보이면 또 조용한 동작이다(이 회차가 고치는 것이 바로 그 형태다: 「정확히 어떤
  // 오스냅 때문인지 모르겠지만 뭔가에 끌린다」). 무채색이다 — **상시 표시**의 규약(4-c:
  // 상시는 무채색, 순간은 색)이고, 소실점 ✕와 같은 작도 표식 대역(COL.vpMark)을 쓴다.
  // 모양은 **십자(+)** — ✕(소실점)와도 □(끝점 오스냅)와도 안 겹친다.
  for (const acq of app.extAcq.acquired) {
    const seg = app.lift.lifted.get(acq.id)
    if (!seg) continue                       // 그 사이 지워졌다 — 표식도 없다
    const p = project(an, app.pose, acq.end === 0 ? seg.a3 : seg.b3)
    if (!p) continue
    const r = 5 * is
    ctx.strokeStyle = COL.vpMark
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y)
    ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r)
    ctx.stroke()
  }

  // 미리보기 — 붙은 좌표가 그대로 확정된다(원칙 d). **몸체는 언제나 재료색이다**
  // (web2-19 1부). «카메라를 건드리는 획»의 안내 파랑(constructing 갈래)은 없앴다 —
  // web2-17이 그 규칙을 낡게 만들었다: 'horizon'은 없어졌고 남은 'vp'는 진짜 모서리다
  // (방 실루엣의 후퇴선은 벽 모서리이면서 소실점을 만든다). 「소실점을 만든다」는
  // 몸체의 색이 아니라 **생길 자리의 파선 ✕**가 말한다(아래 — 파선 = 아직/숨은).
  if (draft) {
    const g = activeGrade(app)
    const m = MAT[g]
    // 미리보기 굵기도 **확정과 같은 함수**에서 나온다(원칙 d: 붙은 것이 그대로 확정된다)
    const drawW = widthOfMat({ grade: g, w: g === 'INK' ? app.nib : undefined })
    // D-3 반증 손잡이(web2-19 1부) — 없앤 안내 파랑을 이 draft 하나에 되살린다.
    // e2e graphite.spec ①-반증이 «파랑 계수 격자가 실패 가능함»을 매 실행 증명하는
    // 전용 통로다(diag.forceConstructing — UI에서 못 켠다). 앱 경로에서는 언제나 false.
    const forced = FORCE_CONSTRUCTING && draft.label === 'vp'
    // 축에 붙어도 선은 **재료색**이다(web2-10 지시 7 — 축 색 넷을 뺐다. 확정될 모습
    // 그대로가 원칙 d와도 맞다). «붙었다»는 아래 파선 안내가 말한다.
    // 몸체(web2-12 2번) — brush 겹이 이 draft를 그리고 있으면 여기서 몸체를 **긋지 않는다**
    // (`draftBrushed` — 겹 순서 역전을 막는다, state.ts 그 술어의 머리주석이 정본).
    // 그 밖(classic·INK)은 종전 벡터 미리보기 그대로다.
    if (forced || !draftBrushed(app)) {
      ctx.strokeStyle = forced ? COL.preview : m.color
      // 몸체 알파도 확정과 같게 — 확정 몸체(Line2)는 MAT.alpha로 그려지는데 미리보기가
      // 불투명이면 긋는 동안이 더 진하다(「검은 벡터선」 관측의 절반이 이것이다).
      // 떼는 순간 무변화 게이트(draftgate.spec)가 이 정합을 잰다.
      ctx.globalAlpha = forced ? 1 : m.alpha
      ctx.lineWidth = (forced ? C.LINE_W_RESULT : drawW) * is
      ctx.beginPath()
      // 옐로 프리핸드(web2-24 4-b) — 미리보기도 **손이 지나간 점렬**을 따른다(확정이
      // raw 정본이므로 원칙 d: 보이는 그대로 확정된다). 머무름(held)이 서면 반듯
      // 미리보기(start→end 직선)로 갈아탄다 — 22 2부의 어법 그대로.
      if (yellowActive(app) && !draft.held && draft.raw.length > 1) {
        ctx.moveTo(draft.raw[0]!.x, draft.raw[0]!.y)
        for (let i = 1; i < draft.raw.length; i++) ctx.lineTo(draft.raw[i]!.x, draft.raw[i]!.y)
        ctx.lineTo(draft.end.x, draft.end.y)
      } else {
        ctx.moveTo(draft.start.x, draft.start.y); ctx.lineTo(draft.end.x, draft.end.y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      // 잉크 번짐(9번) — 그리는 중에도 같은 함수·같은 시드(잠정 id)·같은 점렬이라
      // 떼는 순간 자국이 그대로 이어진다(뗌 게이트가 잰다). edge는 승격 결과와 맞춘다.
      if (g === 'INK') {
        inkFlow(ctx, draft.nid, draft.start, draft.end, draft.raw,
          draft.start, draft.end, drawW, is, true)
      }
    }
    // 파선 ✕ — 「이 획이 소실점을 만든다」의 예고(web2-19 1-b). 형태·색은 확정 ✕와
    // 같다(6px 팔 · COL.vpMark). 파선 = 아직/숨은(web2-16 3-a의 어법 그대로 — 값도
    // 대기 획의 WAIT_DASH를 재사용한다: 숫자를 새로 짓지 않는다 #54).
    // 컬링도 확정 ✕와 같은 함수·같은 여백이다(vpOnScreen 50 — 원칙 a).
    if (draft.vp && vpOnScreen(v, draft.vp, cw, ch, 50)) {
      ctx.strokeStyle = COL.vpMark
      ctx.lineWidth = 1 * is
      ctx.setLineDash([C.WAIT_DASH_ON_PX * is, C.WAIT_DASH_OFF_PX * is])
      ctx.beginPath()
      ctx.moveTo(draft.vp.x - 6 * is, draft.vp.y - 6 * is); ctx.lineTo(draft.vp.x + 6 * is, draft.vp.y + 6 * is)
      ctx.moveTo(draft.vp.x - 6 * is, draft.vp.y + 6 * is); ctx.lineTo(draft.vp.x + 6 * is, draft.vp.y - 6 * is)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // 축 파선 안내 — 축에 붙었을 때만. 'vp'는 축이 아니다(자유 방향 — 예고는 위 파선 ✕).
    // 후행 확정 표식(web2-22 2부) — 머무름이 성립해 반듯해진 순간, 끝점에 무채색 고리
    // 하나(순간 피드백 대역 — 색을 안 쓴다. 오스냅 기호와 다른 형태: 이건 «곧 이렇게
    // 확정된다»의 예고다). 손에 보여야 한다(지시 2-a 문면).
    if (draft.held) {
      ctx.strokeStyle = COL.construction
      ctx.lineWidth = 1.2 * is
      ctx.beginPath()
      ctx.arc(draft.end.x, draft.end.y, 7 * is, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (draft.label && draft.label !== 'vp') axisGuide(ctx, draft, is)
    if (draft.startSnap) mark(ctx, draft.startSnap, is)
    if (draft.endSnap) mark(ctx, draft.endSnap, is)
    // 축이 사영으로 이겼다(2-a) — 기호는 겨눈 특징점에, 끝은 축선 위에 있다. 둘이
    // 갈라지면 그 사이를 가는 실선으로 잇는다(수선의 발 표시 — 제도의 어법 그대로).
    // 이것이 없으면 «축이 이겼는데 점이 이긴 줄 아는» 조용한 오해가 남는다(지시 2-a ⚠).
    if (draft.endSnap && dist2(draft.endSnap.p, draft.end) > 0.5 * is) {
      ctx.strokeStyle = COL.axisGuide   // «축에 붙었다»의 채널 그대로 — 축이 이긴 표시다
      ctx.lineWidth = 0.8 * is
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.moveTo(draft.endSnap.p.x, draft.endSnap.p.y)
      ctx.lineTo(draft.end.x, draft.end.y)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  } else if (hover) {
    mark(ctx, hover, is)
  }

  // 면 일괄 후보(web2-21 4부) — **테두리만**(4-d: 후보 스물을 다 채우면 화면이 회색
  // 판이 된다 AS-C20). 「아직 물어보는 중」과 「정해졌다(채움)」가 형태로 갈린다.
  // 순간 피드백 채널이라 색을 쓴다(facePrev와 같은 갈래 — 상시 표시가 아니다).
  if (app.faceCandidates) {
    ctx.strokeStyle = COL.snap
    ctx.lineWidth = 1.6 * is
    ctx.setLineDash([6 * is, 4 * is])
    for (const c of app.faceCandidates) {
      if (c.poly.length < 3) continue
      ctx.beginPath()
      c.poly.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
      ctx.closePath()
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // 면 미리보기 — 지금 탭하면 **무엇이 될지**. 그리는 중에만 뜨므로 색을 쓴다(4-c의 갈래).
  // 만들면 초록(스냅과 같은 «붙었다»의 색), 없애면 안내색 — 되돌리는 몸짓이라 갈라야 한다.
  if (facePrev && facePrev.poly.length >= 3) {
    ctx.strokeStyle = facePrev.mode === 'add' ? COL.snap : COL.preview
    ctx.fillStyle = facePrev.mode === 'add' ? COL.snap : COL.preview
    ctx.lineWidth = 2 * is
    ctx.globalAlpha = 0.12
    ctx.beginPath()
    facePrev.poly.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.stroke()
  }

  // ── 손글씨 치수(web2-29 1단계) ────────────────────────────────────────────
  // ⚠⚠ **치수는 지금까지 화면에 한 번도 안 그려졌다** — `Stroke.dim`은 리프팅의 입력이고
  //    보이는 자리가 없었다. 이 절이 그 «보이는 자리»다. 만드는 자리(`setDimension`)와
  //    같은 술어(`s.dim !== undefined` + 그 획이 지금 3D로 보인다)를 읽는다(#75 ㉠).
  //    소유는 **26-1 그대로**다: 치수는 그 획의 것이므로 획이 안 보이면 치수도 안 보인다
  //    (겹의 치수가 아래 종이에 안 나타나는 것이 그 귀결이다 — 새 규칙 ⛔).
  // **글씨를 받는 선**(web2-39 4번)은 치수선 **밑에** 깐다 — 강조이지 덮개가 아니다.
  drawWriteTarget(ctx, app, is)
  drawDimensions(ctx, app, is)

  // ── 재기(web2-32 6번) ─────────────────────────────────────────────────────
  // **기본값(패널에 표시만)은 여기서 아무것도 그리지 않는다** — 도면에 남는 것은
  // «잰 것을 도면에 남긴다»를 켜고 잰 것뿐이다(`doc.measures`). 짚는 중의 표시는
  // 도면이 아니라 손의 상태라 여기 있어도 문서가 안 는다.
  drawMeasures(ctx, app, is)

  // 쓰고 있는 손글씨 — 확정 전이라 문서에 없다. 대상 표시(고른 선)도 여기서.
  if (app.dimPick !== null) {
    const seg = app.lift.lifted.get(app.dimPick)
    if (seg) {
      const a = project(an, app.pose, seg.a3), b = project(an, app.pose, seg.b3)
      if (a && b) {
        ctx.strokeStyle = COL.snap
        ctx.lineWidth = 2 * is
        ctx.globalAlpha = 0.45
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }
  const inkAll = dimInk ? [...app.dimInk, dimInk] : app.dimInk
  if (inkAll.length > 0) {
    ctx.strokeStyle = MAT.HB.color
    ctx.globalAlpha = MAT.HB.alpha
    ctx.lineWidth = widthOfMat({ grade: 'HB' }) * is
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const st of inkAll) {
      if (st.length < 2) continue
      ctx.beginPath()
      st.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // 지우개 커서 — 반경은 화면 px.
  // `tipErase`도 센다(web2-15 2-b) — 펜의 지우개 끝은 도구를 안 바꾸므로 도구만 보면
  // 커서가 안 뜬다. ⚠ 끝은 **닿아야** 뜬다(호버에 신호가 없다 — 실기기 관측).
  if (eraser && (isEraser(app.tool) || app.tipErase)) {
    ctx.strokeStyle = COL.construction
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.arc(eraser.x, eraser.y, app.eraserRadius * is, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 뷰 큐브 — 화면 공간 (그리기와 판정이 같은 cubeGeom)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const geom = cubeGeom(an, app.pose, app.cubeLayout)
  if (geom) {
    for (const f of geom.faces) {
      if (!f.visible) continue
      ctx.fillStyle = COL.cubeFace
      ctx.strokeStyle = COL.cubeEdge
      ctx.lineWidth = 1
      ctx.beginPath()
      f.poly.forEach((i, k) => {
        const p = geom.corners[i]!.p
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    // 90° 화살표 넷(web2-31 1번) — 판정(`arrowHit`)과 같은 출처(`cubeArrows`).
    // 큐브가 있을 때만 있다: 축 틀이 없으면 돌 곳도 없다(`cubeGeom`이 이미 그 문이다).
    for (const a of cubeArrows(app.cubeLayout)) {
      ctx.fillStyle = COL.cubeFace
      ctx.strokeStyle = COL.cubeEdge
      ctx.lineWidth = 1
      ctx.beginPath()
      a.poly.forEach((p, k) => { if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    // ── **지금 무엇을 보고 있는가**(web2-42 1번) — 큐브 아래에 이름 하나 ────────
    // 「도면」이라고 안 쓴다(지시 문면 — 도면은 잘라내고 주기까지 붙은 것이다).
    // 자리는 **화살표 밖**이다(아래 화살표 끝이 `0.90·size`) — 겹치면 둘 다 안 읽힌다.
    // 이름의 출처는 `viewName` 하나다(#54: 진단·팔·화면이 같은 함수를 읽는다).
    ctx.fillStyle = COL.axisGuide
    ctx.font = `${C.DIM_TEXT_PX}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(viewName(an, app.pose), app.cubeLayout.cx, app.cubeLayout.cy + app.cubeLayout.size * 0.98)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
}

/** 흑연 입자 — 종이 결에 걸리는 알갱이. 필압이 밀도·진하기에 얹힌다. */
function grain(
  ctx: CanvasRenderingContext2D, seed: number, a: Pt, b: Pt,
  amount: number, alpha: number, press: number | undefined, is: number,
) {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy)
  if (L < 2) return
  const px = -dy / L, py = dx / L
  const p = press ?? 0.5
  const rnd = rng32(seed * 2654435761)
  const n = Math.min(400, Math.round(L * amount * (0.5 + p)))
  ctx.fillStyle = '#404040'
  ctx.globalAlpha = alpha * 0.28 * (0.5 + p)
  for (let i = 0; i < n; i++) {
    const t = rnd()
    const off = (rnd() + rnd() - 1) * 1.6 * is // 결 폭
    const r = (0.4 + rnd() * 0.7) * is
    ctx.fillRect(a.x + dx * t + px * off, a.y + dy * t + py * off, r, r)
  }
  ctx.globalAlpha = 1
}

/** 축별 파선 패턴 — 네 축의 상대 구분(web2-10 지시 7). 방향 자체도 채널이므로(수직 V·
 *  수평 H는 방향이 먼저 가른다) 패턴은 보조다. 절대 식별은 실기기 미검증(DEFERRED). */
const AXIS_DASH: Record<string, number[]> = {
  vp0: [8, 4], vp1: [3, 3], H: [12, 3, 2, 3], V: [1, 3],
}

/** 축 스냅 안내 — 붙은 축 방향으로 **양끝 너머**에 무채색 파선이 뻗는다(SketchUp 추론선의
 *  무채색판 — 색 대신 «획이 아닌 기하»가 붙음을 말한다). 미리보기 선 자체는 재료색. */
function axisGuide(ctx: CanvasRenderingContext2D, draft: Draft, is: number) {
  const dx = draft.end.x - draft.start.x, dy = draft.end.y - draft.start.y
  const L = Math.hypot(dx, dy)
  if (L < 1e-6) return
  const ux = dx / L, uy = dy / L
  const ext = 34 * is
  ctx.strokeStyle = COL.axisGuide
  ctx.lineWidth = 1 * is
  ctx.setLineDash((AXIS_DASH[draft.label!] ?? [6, 4]).map(v => v * is))
  ctx.beginPath()
  ctx.moveTo(draft.end.x, draft.end.y); ctx.lineTo(draft.end.x + ux * ext, draft.end.y + uy * ext)
  ctx.moveTo(draft.start.x, draft.start.y); ctx.lineTo(draft.start.x - ux * ext, draft.start.y - uy * ext)
  ctx.stroke()
  ctx.setLineDash([])
}

/** 오스냅 표식 — Rhino 관행의 형태 구분: 끝 □ · 정점 ◆ · 중 △ · 교차 ✕ · 겉보기 교차 ⊠(파선) ·
 *  수선 ⊥ · 연장 ▫ · 근처 ○.
 *  **무채색이다**(web2-08 지시 2) — 종류는 형태가 가르므로 색은 정보가 아니었다.
 *  진하기는 **2H 급**(web2-10 지시 6) — 색·알파를 경도표에서 그대로 읽는다. */
function mark(ctx: CanvasRenderingContext2D, h: OsnapHit, is: number) {
  const { x, y } = h.p
  const r = 4 * is, r5 = 5 * is
  // ⚠ 알파를 바꾸므로 switch의 이른 return이 있는 이 함수를 try/finally로 감싼다 —
  // 안 되돌리면 0.5가 이후 그리기(대기 획·큐브)로 샌다.
  const om = MAT['2H']
  ctx.strokeStyle = om.color
  ctx.globalAlpha = om.alpha
  ctx.lineWidth = 1.5 * is
  ctx.setLineDash([])
  try {
  ctx.beginPath()
  switch (h.kind) {
    // **소실점** — 이 자리가 비어 있었다(web2-05). 스냅 판정은 돌았는데 `switch`에
    // `'vp'`가 없어 **빈 경로에 stroke**가 되어 아무것도 안 그려졌고, 상시 떠 있는 ✕만
    // 남아 「붙었다」와 「안 붙었다」가 화면에서 구별되지 않았다(실측: 커서를 올려도
    // 소실점 둘레 픽셀이 **80 → 80**. 같은 조건에서 끝점은 10 → 72).
    // 형태는 **✕에 겹치는 원**이다 — ✕가 이미 그 자리를 쓰므로 둘레를 두르는 것이
    // 다른 표식과 안 겹치고(원은 근처점이지만 그쪽은 반경 4이고 이것은 7이다) 색이 가른다.
    case 'vp':
      ctx.arc(x, y, 7 * is, 0, Math.PI * 2); break
    case 'end':
      ctx.strokeRect(x - r, y - r, r * 2, r * 2); return
    case 'vertex':
      ctx.moveTo(x, y - r5); ctx.lineTo(x + r5, y); ctx.lineTo(x, y + r5); ctx.lineTo(x - r5, y); ctx.closePath(); break
    case 'mid':
      ctx.moveTo(x, y - r5); ctx.lineTo(x + r5, y + r); ctx.lineTo(x - r5, y + r); ctx.closePath(); break
    case 'int':
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r)
      ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); break
    // **겉보기 교차**(web2-15) — ✕에 **파선 네모**를 두른다. ✕는 교차의 형태이고
    // 파선 테두리가 «실제로는 안 만난다»를 말한다(연장 ▫의 파선과 같은 어법 — 파선 =
    // 「지금 거기 잉크가 있는 것은 아니다」). 무채색 유지(web2-08 — 형태가 가른다).
    case 'xint':
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r)
      ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r)
      ctx.stroke()
      ctx.beginPath(); ctx.setLineDash([2 * is, 2 * is])
      ctx.strokeRect(x - r5 - 1 * is, y - r5 - 1 * is, (r5 + 1 * is) * 2, (r5 + 1 * is) * 2)
      ctx.setLineDash([]); return
    case 'perp':
      ctx.moveTo(x - r, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r)
      ctx.moveTo(x - r, y); ctx.lineTo(x + 1 * is, y); break
    case 'ext':
      ctx.setLineDash([2 * is, 2 * is]); ctx.strokeRect(x - r, y - r, r * 2, r * 2); ctx.setLineDash([]); return
    case 'near':
      ctx.arc(x, y, r, 0, Math.PI * 2); break
    default: {
      // **종류를 더했는데 표식을 안 더하면 여기서 타입이 깨진다**(web2-05).
      // 그것이 실제로 났다 — `OSNAP_ORDER`에 `'vp'`가 있는데 이 `switch`에 자리가 없어
      // 빈 경로에 stroke가 되고 **아무것도 안 그려졌다.** 목록(`osnap.ts`)과 표시(여기)가
      // 다른 파일이라 한쪽만 늘었고, 컴파일러가 안 걸었다. 이제 건다 — 사람이 안 세도 걸린다.
      const never: never = h.kind
      void never
    }
  }
  ctx.stroke()
  } finally { ctx.globalAlpha = 1 }
}

// ── 글씨 상태의 «고른 선»(web2-39 4번) ───────────────────────────────────────
// 피드백은 **거의 공짜로 있다**: 작도 상태에서는 획이 축에 붙는데 글씨 상태에서는 안
// 붙는다 — 「1」을 그었는데 곧게 안 펴지고 손으로 그은 그대로 남으면 그 순간 상태가 읽힌다.
// 여기 더하는 것은 **고른 선 강조 하나**뿐이다.
// ⛔ **새 상태 표시를 안 짓는다**(지시문): 새 색을 지으면 37-2의 청색(대기/확정)과 뜻이
//    겹쳐 헷갈린다. 그래서 **이미 뜻이 있는 채널**을 쓴다 — `COL.snap`은 「지금 짚은 것」이고
//    사후 수정으로 고른 치수(`app.dimEdit`)가 쓰는 바로 그 색이다. 같은 뜻이므로 같은 색이다.
function drawWriteTarget(ctx: CanvasRenderingContext2D, app: App, is: number) {
  const w = app.write
  if (!w) return
  const seg = app.lift.lifted.get(w.target)
  if (!seg) return
  const a = project(app.lift.an, app.pose, seg.a3)
  const b = project(app.lift.an, app.pose, seg.b3)
  if (!a || !b) return
  ctx.save()
  ctx.strokeStyle = COL.snap
  ctx.lineWidth = C.WRITE_TARGET_PX * is
  ctx.lineCap = 'round'
  ctx.globalAlpha = C.WRITE_TARGET_ALPHA
  ctx.beginPath()
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.restore()
}

// ── 치수선(web2-29 1단계) ─────────────────────────────────────────────────────
// 제도의 치수선 어법 그대로: 선에 나란한 **오프셋 선** + 양 끝의 **짧은 끝표시** + 값.
// ⛔ 새 색을 안 짓는다 — 작도 대역(`COL.construction`)이다: 치수는 그림이 아니라 작도의 말이다.
// 값은 `formatMm`이 낸다(단위·표기의 출처 하나 — #54).
function drawDimensions(ctx: CanvasRenderingContext2D, app: App, is: number) {
  const an = app.lift.an
  const off = C.DIM_OFFSET_PX * is
  const tick = C.DIM_TICK_PX * is
  for (const s of app.doc.strokes) {
    if (s.dim === undefined) continue
    const seg = app.lift.lifted.get(s.id)          // 안 보이는 겹의 획은 lifted에 없다(26-1)
    if (!seg) continue
    const a = project(an, app.pose, seg.a3)
    const b = project(an, app.pose, seg.b3)
    if (!a || !b) continue
    const dx = b.x - a.x, dy = b.y - a.y
    const L = Math.hypot(dx, dy)
    if (L < 1e-6) continue
    const nx = -dy / L, ny = dx / L                // 화면 수직(오프셋 방향)
    const a2 = { x: a.x + nx * off, y: a.y + ny * off }
    const b2 = { x: b.x + nx * off, y: b.y + ny * off }
    // 사후 수정(web2-32 2번)으로 고른 치수는 **강조된다** — 무엇을 고치는 중인지 화면이
    // 말한다(새 색 ⛔ — 스냅 색을 쓴다: 「지금 짚은 것」이라는 같은 뜻이다).
    const editing = app.dimEdit === s.id
    ctx.strokeStyle = editing ? COL.snap : COL.construction
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y)                     // 치수선
    ctx.moveTo(a.x, a.y); ctx.lineTo(a2.x + nx * tick, a2.y + ny * tick) // 치수 보조선
    ctx.moveTo(b.x, b.y); ctx.lineTo(b2.x + nx * tick, b2.y + ny * tick)
    ctx.stroke()
    // 값 — 치수선 가운데 위. 화면 고정 크기(줌에 안 커진다 — 원칙 e의 계열).
    // ⚠ 자리는 **`state.dimLabelPos`가 정한다**(#54) — 누르는 자리(pickDimLabel)와 같은
    //   함수여야 「보이는 데 안 눌린다」가 구성상 불가능하다.
    const mid = dimLabelPos(app, s.id) ?? { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 }
    ctx.save()
    ctx.translate(mid.x, mid.y)
    ctx.scale(is, is)
    ctx.fillStyle = editing ? COL.snap : COL.construction
    ctx.font = `${C.DIM_TEXT_PX}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    // **어긋남**(web2-32 7번) — 적은 값 옆에 «≠» 하나. 값을 **안 고친다**: 사람이 적은
    // 것은 틀린 것이 아니라 «다른 것»이다(#61). 무엇이 다른지는 패널 줄이 말한다.
    const skewed = skewOff(dimSkew(app.lift, s.id))
    ctx.fillText(formatMm(s.dim, app.doc.unit, app.dimExact) + (skewed ? ' ≠' : ''), 0, -2)
    ctx.restore()
  }
}

// ── 재기(web2-32 6번) — 도면에 남긴 것 + 짚는 중의 표시 ──────────────────────
// ⛔ 새 색을 안 짓는다: 남긴 재기는 치수선과 같은 작도 대역(`COL.construction`),
//    짚는 중은 «지금 짚은 것»이라 스냅 색(`COL.snap`) — 둘 다 이미 있는 뜻이다.
function drawMeasures(ctx: CanvasRenderingContext2D, app: App, is: number) {
  const an = app.lift.an
  const dot = C.DIM_TICK_PX * is
  const label = (p: Pt, text: string, col: string) => {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.scale(is, is)
    ctx.fillStyle = col
    ctx.font = `${C.DIM_TEXT_PX}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(text, 0, -4)
    ctx.restore()
  }
  // 도면에 남긴 것 — 값은 **매번 계산**이다(저장된 숫자가 아니다 · 원칙 b)
  for (const m of app.doc.measures ?? []) {
    const p3 = measurePoint3(app.lift, m.a), q3 = measurePoint3(app.lift, m.b)
    if (!p3 || !q3) continue                 // 안 풀린 것은 대기다 — 안 그리고 안 버린다
    const a = project(an, app.pose, p3), b = project(an, app.pose, q3)
    if (!a || !b) continue
    ctx.strokeStyle = COL.construction
    ctx.lineWidth = 1 * is
    ctx.beginPath()
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
    ctx.moveTo(a.x - dot, a.y - dot); ctx.lineTo(a.x + dot, a.y + dot)
    ctx.moveTo(b.x - dot, b.y - dot); ctx.lineTo(b.x + dot, b.y + dot)
    ctx.stroke()
    const mm = measureMm(app.lift, m)
    const u = measureUnits(app.lift, m)
    const text = mm !== null ? formatMm(mm, app.doc.unit, app.dimExact)
      : u !== null ? formatUnits(u) : ''
    if (text) label({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text, COL.construction)
  }
  // 짚는 중 — 첫 점 하나. 문서에 아무것도 안 들어간다.
  if (app.measureFrom) {
    const p3 = measurePoint3(app.lift, app.measureFrom)
    const a = p3 && project(an, app.pose, p3)
    if (a) {
      ctx.strokeStyle = COL.snap
      ctx.lineWidth = 1.4 * is
      ctx.beginPath()
      ctx.moveTo(a.x - dot, a.y - dot); ctx.lineTo(a.x + dot, a.y + dot)
      ctx.moveTo(a.x - dot, a.y + dot); ctx.lineTo(a.x + dot, a.y - dot)
      ctx.stroke()
    }
  }
}
