// 배선 — 상태·입력·렌더를 잇는다. 계산은 전부 core에 있다.

import { createApp, commitStroke, undo, redo, resetPose, saveView, gotoView, loadDoc, clearAll, isEraser, isDrawPose, type Tool } from './state'
import { initInput } from './input'
import { createAutoLevel } from './autolevel'
import { isLevel } from '../core/level'
import { resize2d, draw2d, type Draft } from './render2d'
import { initR3D, syncStrokes, render3d, resize3d } from './render3d'
import { serializeBrnl, parseBrnl } from '../core/file'
import { toOBJ, toMTL, toGLTF } from '../core/export'
import { initNotice, notify, status, ask, clearNotice } from './notice'
import { OSNAP_ORDER, type OsnapHit } from '../core/osnap'
import { PENCIL_GRADES, MAT } from '../core/material'
import type { Pt } from '../core/vec'
import { C } from '../core/constants'

const W = window.innerWidth
const H = window.innerHeight
const dpr = window.devicePixelRatio || 1

const ink = document.getElementById('ink') as HTMLCanvasElement
const gl = document.getElementById('gl') as HTMLCanvasElement
initNotice(document.getElementById('notice')!)

const app = createApp(W, H)
let ctx = resize2d(ink, W, H, dpr)
const r3d = initR3D(gl, W, H, dpr)

// 빌드 식별자 — 배포됐는지 화면에서 바로 안다.
// ⚠ 이것 하나가 앱을 죽이면 안 된다 — 설정이 낡은 dev 서버에서 치환이 안 돼
// 여기서 앱 전체가 서지 않은 적이 있다(2026-08-21).
declare const __BUILD_ID__: string
try {
  document.getElementById('buildid')!.textContent = __BUILD_ID__
} catch { /* 치환이 안 됐다 — 화면에만 안 뜬다 */ }

// **탈출구** — `?reset`으로 열면 워커 등록과 캐시를 전부 버리고 새로 받는다.
// 배포 전환(web/ → web2)은 같은 주소에 다른 앱이 오는 것이라 캐시가 꼬일 수 있고,
// 그때 사람이 개발자 도구 없이 스스로 빠져나올 길이 필요하다.
// ⚠ 그림(자동 저장)은 안 건드린다 — 캐시만 버린다.
if (location.search.includes('reset')) {
  void (async () => {
    if ('serviceWorker' in navigator) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
    }
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k)
    }
    location.replace(location.pathname)
  })()
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // updateViaCache: 'none' — 워커 스크립트도 Pages의 max-age=600에 걸린다.
  // 갱신 확인이 HTTP 캐시에서 오면 새 워커를 늦게 본다.
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .catch(() => { /* 오프라인 강화일 뿐 — 실패해도 동작 */ })
}

// 자동 저장 복원 — 문서 프레임이 창과 다르면 화면 배율로 맞춘다(문서 좌표 불변)
const AUTOSAVE_KEY = 'b2-autosave'
function fitViewToFrame() {
  const fw = app.doc.frame.W, fh = app.doc.frame.H
  if (fw === W && fh === H) return
  const s = Math.min(W / fw, H / fh)
  app.view = { s, ox: (W - fw * s) / 2, oy: (H - fh * s) / 2 }
}
try {
  const saved = localStorage.getItem(AUTOSAVE_KEY)
  if (saved) {
    const data = parseBrnl(saved)
    if (data && data.doc.strokes.length > 0) {
      loadDoc(app, data)
      fitViewToFrame()
    }
  }
} catch { /* 저장소가 없으면 그냥 새 문서 */ }

let draft: Draft | null = null
let hover: OsnapHit | null = null
let eraserPos: Pt | null = null
let dirty = true
const invalidate = () => { dirty = true }

let syncedVersion = -1
app.listeners.push(() => {
  if (app.docVersion !== syncedVersion) {
    syncedVersion = app.docVersion
    syncStrokes(r3d, app)
    updateStatus()
  }
  invalidate()
})

// 자동 저장 — 문서·시점이 바뀌면 잠시 뒤 localStorage로
let autosaveTimer: number | undefined
let autosaveWarned = false
app.listeners.push(() => {
  clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => {
    try {
      // 빈 문서는 **지운다** — 비우기 뒤에 늦게 도는 이 타이머가 빈 것을 도로 써 두면
      // 열쇠가 남는다. 새로고침이 안 되살리는 것(복원 조건)과 별개로 자리를 안 남긴다.
      if (app.doc.strokes.length === 0) { localStorage.removeItem(AUTOSAVE_KEY); return }
      localStorage.setItem(AUTOSAVE_KEY, serializeBrnl({
        doc: app.doc, nextId: app.nextId, savedViews: app.savedViews,
      }))
    } catch {
      // 큰 문서로 quota가 넘칠 수 있다 — **조용히 넘어가지 않는다**(한 번만 알린다)
      if (!autosaveWarned) { autosaveWarned = true; notify('자동 저장이 안 된다 — 파일로 저장한다') }
    }
  }, 400)
})

// **기울어 있을 때 무엇이 다른지** — 그리기가 안 된다. 그것이 보여야 한다(지시 「표시」).
// 새 장식을 안 만들고 이미 있는 한 줄을 쓴다(원칙 g: 알림은 최상단 한 줄뿐이다).
const TILTED_MSG = '기울어 있다 — 놓으면 정렬로 돌아온다. 그때 그릴 수 있다'

// **접혔는데 작도가 아직 안 끝난 자리** — 이 회차가 만든 함정이다(web2-04 리뷰어 [8]).
// 접힌 포즈는 «정렬»이라 그릴 수 있는 상태로 보이는데, `analyze()`는 **작도 포즈가 아닌
// 획을 전부 내용으로 돌린다**(궤도 후의 획은 작도가 아니다). 그래서 1점 상태에서 돌려보고
// 접은 뒤 둘째 깊이선을 그으면 **소실점이 안 생기고 그 획이 대기로 남는다**
// (실측: role=content · vps 1→1 · waiting 1). 조용히 틀리지는 않지만(불변식 j) **왜 안
// 되는지가 화면에 없었다.** 규칙을 바꾸지 않고(범위) 그 자리를 한 줄로 말한다.
const UNFINISHED_MSG = '작도가 아직 안 끝났다 — 소실점은 작도 시점에서만 만든다'

function updateStatus() {
  // **상태를 안 띄운다**(4-b). 차수·대기 수·스냅 반경·뷰 이름은 전부 내부 상태이고
  // 그것을 화면에 쓰는 것이 CAD의 방식이다. 남는 것은 딱 하나 —
  // **빈 화면의 첫 안내**다. 이 앱은 첫 획이 특별하고(지평선), 그것을 모르면 시작을 못 한다.
  // 지평선을 그으면 영영 사라진다.
  if (app.lift.an.horizonY === null) status('지평선을 긋는다 — 수평이 강제된다')
  else if (!isLevel(app.pose)) status(TILTED_MSG)
  else if (!isDrawPose(app.pose) && !app.lift.an.constructionDone) status(UNFINISHED_MSG)
  else status('')
}

// 포즈가 «상태 줄이 달라지는 자리»를 넘나들 때만 고친다 — 매 프레임 고치면 오류 알림을 덮어쓴다.
// 그 자리가 둘이라(기울었나 · 작도 시점인가) 둘을 함께 본다.
let lastPoseKey = ''
app.listeners.push(() => {
  const k = `${!isLevel(app.pose)}|${isDrawPose(app.pose)}`
  if (k === lastPoseKey) return
  lastPoseKey = k
  updateStatus()
})

const autolevel = createAutoLevel(app)
// 시작 동기화 — 자동 저장 복원분 포함
syncStrokes(r3d, app)
syncedVersion = app.docVersion
updateStatus()

initInput(ink, app, {
  onDraftChange(d) { draft = d; invalidate() },
  onHover(p) { hover = p; invalidate() },
  onEraserMove(p) { eraserPos = p; invalidate() },
  onCommit(a, b, raw, press) {
    const s = commitStroke(app, a, b, raw, press)
    const an = app.lift.an
    // **알림은 오류가 있을 때만**이다(4-b). 「소실점 N」은 차수이고 「대기한다」는 상태다 —
    // 둘 다 화면이 이미 말하고 있다(소실점 표식 · 대기 획의 점선). 거부 사유만 남긴다.
    const reject = an.rejects.get(s.id)
    if (reject) notify(reject)
  },
}, autolevel)

// ── 도구 넷 — 연필 · 펜 · 지우개 둘 (4-h) ────────────────────────────────
// **선택은 색이 아니라 위치와 크기로 보인다**(4-d) — `.tool.on`이 앞으로 나온다.
const TOOLS: Tool[] = ['pencil', 'pen', 'eraser-pencil', 'eraser-ink']
const toolBtn: Record<Tool, HTMLElement> = {
  'pencil': document.getElementById('btn-pencil')!,
  'pen': document.getElementById('btn-pen')!,
  'eraser-pencil': document.getElementById('btn-eraser-pencil')!,
  'eraser-ink': document.getElementById('btn-eraser-ink')!,
}
const thick = document.getElementById('thick')!
const thickLine = document.getElementById('thick-line')!
const thickDot = document.getElementById('thick-dot')!

function setTool(t: Tool) {
  app.tool = t
  for (const k of TOOLS) toolBtn[k].classList.toggle('on', k === t)
  if (!isEraser(t)) eraserPos = null
  // 굵기 막대는 **펜과 지우개에만** 뜬다. 연필의 굵기는 심이 정하고,
  // 그 조절은 연필 몸통의 창이다(4-e) — 별도 컨트롤을 안 둔다.
  thick.style.display = t === 'pencil' ? 'none' : 'block'
  syncThick()
  invalidate()
}
for (const k of TOOLS) toolBtn[k].addEventListener('click', () => setTool(k))

// ── 굵기는 미리보기다 (4-f) — 숫자가 없다 ────────────────────────────────
// 세로 막대를 위아래로 끌면 **그 자리에** 그 굵기의 선(펜)이나 그 크기의 원(지우개)이 그려진다.
const THICK_H = 86, THICK_PAD = 8
/** 값 → 막대 위 y (위가 가늘다) */
const thickY = (v: number, lo: number, hi: number) =>
  THICK_PAD + (1 - (v - lo) / (hi - lo)) * (THICK_H - 2 * THICK_PAD)
/** 막대 위 y → 값 */
const thickV = (y: number, lo: number, hi: number) => {
  const t = 1 - (y - THICK_PAD) / (THICK_H - 2 * THICK_PAD)
  return lo + Math.min(1, Math.max(0, t)) * (hi - lo)
}
const thickRange = (): [number, number] =>
  app.tool === 'pen' ? [C.NIB_MIN, C.NIB_MAX] : [C.ERASER_MIN, C.ERASER_MAX]

function syncThick() {
  if (app.tool === 'pencil') return
  const pen = app.tool === 'pen'
  const [lo, hi] = thickRange()
  const v = pen ? app.nib : app.eraserRadius
  const y = thickY(v, lo, hi)
  thickLine.style.display = pen ? '' : 'none'
  thickDot.style.display = pen ? 'none' : ''
  if (pen) {
    thickLine.setAttribute('y1', String(y))
    thickLine.setAttribute('y2', String(y))
    thickLine.setAttribute('stroke-width', String(v))
    nibEl.setAttribute('width', String(v))
    nibEl.setAttribute('x', String(13 - v / 2))
  } else {
    // 지우개는 반경이 커서 막대 폭을 넘는다 — 원의 반지름을 막대 안으로 줄여 **비율만** 보인다
    const r = 3 + (v - C.ERASER_MIN) / (C.ERASER_MAX - C.ERASER_MIN) * 8
    thickDot.setAttribute('cy', String(y))
    thickDot.setAttribute('r', String(r))
  }
}
// ⚠ 끄는 동안의 이동은 **창에서 받는다.** `setPointerCapture`/`hasPointerCapture`로
// 갈랐던 초판은 손가락이 막대 밖으로 나가면 값이 멈췄다 — 26px 폭이라 늘 나간다.
let thickDrag = false
thick.addEventListener('pointerdown', (e) => { thickDrag = true; dragThick(e) })
window.addEventListener('pointermove', (e) => { if (thickDrag) dragThick(e) })
window.addEventListener('pointerup', () => { thickDrag = false })
window.addEventListener('pointercancel', () => { thickDrag = false })
function dragThick(e: PointerEvent) {
  const [lo, hi] = thickRange()
  const y = e.clientY - thick.getBoundingClientRect().top
  const v = thickV(y, lo, hi)
  if (app.tool === 'pen') app.nib = Math.round(v * 10) / 10
  else app.eraserRadius = Math.round(v)
  syncThick()
  invalidate()
}

// ── 홀더펜 인디케이터 (4-e) — 연필 몸통의 창이 곧 슬라이더다 ──────────────
// 창에 지금 심이 보이고, 연필을 위아래로 밀면 바뀐다. 별도 컨트롤이 없다.
const leadEl = document.getElementById('lead')!
const leadText = document.getElementById('lead-text')!
const nibEl = document.getElementById('nib')!
const pencilBtn = toolBtn['pencil']
let pencilDrag: { y: number; i: number } | null = null

function syncGrade() {
  leadText.textContent = app.grade
  leadEl.setAttribute('fill', MAT[app.grade].color)
  invalidate()
}
pencilBtn.addEventListener('pointerdown', (e) => {
  pencilDrag = { y: e.clientY, i: PENCIL_GRADES.indexOf(app.grade) }
})
// 이동·뗌은 창에서 받는다 — 연필 폭이 26px이라 미는 손가락이 늘 밖으로 나간다
window.addEventListener('pointermove', (e) => {
  if (!pencilDrag) return
  // 한 칸 = 10px. 아래로 밀면 무른 심(2B 쪽)이다 — 목록이 2H→2B로 무러지는 순서와 같다.
  const step = Math.round((e.clientY - pencilDrag.y) / 10)
  const i = Math.min(PENCIL_GRADES.length - 1, Math.max(0, pencilDrag.i + step))
  const g = PENCIL_GRADES[i]!
  if (g !== app.grade) { app.grade = g; syncGrade() }
})
const endPencilDrag = () => { pencilDrag = null }
window.addEventListener('pointerup', endPencilDrag)
window.addEventListener('pointercancel', endPencilDrag)

setTool('pencil')
syncGrade()

// 오스냅 설정 패널(임시 UI — 7단계에서 세로바로) — 종류별 토글·반경
const osnapPanel = document.getElementById('osnap-kinds')!
const KIND_LABEL: Record<string, string> = {
  vp: '소실점', vertex: '정점', end: '끝점', mid: '중점', int: '교차점',
  perp: '수선 발', ext: '연장선', near: '근처점',
}
for (const kind of OSNAP_ORDER) {
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = app.osnap.kinds[kind]
  box.addEventListener('change', () => { app.osnap.kinds[kind] = box.checked })
  label.append(box, ` ${KIND_LABEL[kind]}`)
  osnapPanel.append(label)
}
const gridBox = document.getElementById('chk-grid') as HTMLInputElement
gridBox.checked = app.grid
gridBox.addEventListener('change', () => { app.grid = gridBox.checked; invalidate() })

const radius = document.getElementById('osnap-radius') as HTMLInputElement
radius.value = String(app.osnap.radius)
radius.addEventListener('input', () => { app.osnap.radius = Number(radius.value) })

// 파일 — 저장·열기·내보내기
function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
document.getElementById('btn-save')!.addEventListener('click', () => {
  download('drawing.brnl', serializeBrnl({
    doc: app.doc, nextId: app.nextId, savedViews: app.savedViews,
  }), 'application/json')
})
const fileOpen = document.getElementById('file-open') as HTMLInputElement
document.getElementById('btn-open')!.addEventListener('click', () => fileOpen.click())
function applyOpen(data: NonNullable<ReturnType<typeof parseBrnl>>) {
  loadDoc(app, data)
  fitViewToFrame()
  syncViewButtons()
}
fileOpen.addEventListener('change', async () => {
  const f = fileOpen.files?.[0]
  fileOpen.value = ''
  if (!f) return
  const data = parseBrnl(await f.text())
  if (!data) { notify('.brnl 파일이 아니거나 손상됐다'); return }
  // 열기도 지금 그림을 통째로 버린다(실행취소 스택까지) — 비우기와 같은 급이므로
  // 같은 확인을 받는다. 빈 화면이면 버릴 것이 없으니 그냥 연다.
  if (app.doc.strokes.length === 0) { applyOpen(data); return }
  ask('지금 그림을 파일로 바꾼다 — 실행취소로 못 돌아온다.', [
    { key: 'yes', label: '연다', onPick: () => applyOpen(data) },
    { key: 'no', label: '취소' },
  ])
})
document.getElementById('btn-obj')!.addEventListener('click', () => {
  if (!hasGeometry()) return
  download('drawing.obj', toOBJ(app.lift), 'text/plain')
  download('drawing.mtl', toMTL(), 'text/plain') // 재료 → 레이어 색상
})
document.getElementById('btn-gltf')!.addEventListener('click', () => {
  if (!hasGeometry()) return
  download('drawing.gltf', toGLTF(app.lift), 'model/gltf+json')
})
/** 내보낼 3D가 있는가 — 없으면 **빈 파일을 조용히 내려주지 않는다** */
function hasGeometry(): boolean {
  if (app.lift.lifted.size > 0) return true
  notify('3D로 올라간 획이 없다 — 내보낼 것이 없다')
  return false
}

// 비우기 — 그림을 전부 지우고 지평선 단계부터 다시. 자동 저장도 함께 지운다.
// 실수로 누르는 것은 **확인 한 번**으로 막는다(밑줄 단어. A-3: 실행취소 확장보다 단순하다).
document.getElementById('btn-clear')!.addEventListener('click', () => {
  if (app.doc.strokes.length === 0) { notify('이미 비어 있다'); return }
  ask('전부 비운다 — 실행취소로 못 돌아온다.', [
    { key: 'yes', label: '비운다', onPick: doClear },
    { key: 'no', label: '취소' },
  ])
})
function doClear() {
  clearAll(app, window.innerWidth, window.innerHeight)
  try { localStorage.removeItem(AUTOSAVE_KEY) } catch { /* 저장소가 없으면 지울 것도 없다 */ }
  draft = null; hover = null; eraserPos = null // 지운 획을 가리키던 표식이 남지 않게
  syncViewButtons()
  invalidate()
}

// 세로바 접기
const sidebar = document.getElementById('sidebar')!
document.getElementById('sidebar-toggle')!.addEventListener('click', () => {
  sidebar.classList.toggle('folded')
})

// 시점 저장·복귀
const viewsEl = document.getElementById('views')!
function addViewButton(i: number) {
  // **이름을 안 쓴다**(4-b의 「뷰 이름」) — 저장한 순서의 숫자 하나면 고를 수 있다
  const btn = document.createElement('button')
  btn.className = 't'
  btn.style.font = '11px system-ui, sans-serif'
  btn.title = `저장한 시점 ${i + 1}`
  btn.textContent = String(i + 1)
  btn.addEventListener('click', () => { gotoView(app, i); autolevel.touch() })
  viewsEl.append(btn)
}
/** 시점 버튼을 지금 상태에 맞춘다 — 열기·비우기가 목록을 갈아치운다 */
function syncViewButtons() {
  viewsEl.textContent = ''
  app.savedViews.forEach((_, i) => addViewButton(i))
}
document.getElementById('btn-save-view')!.addEventListener('click', () => {
  saveView(app)
  addViewButton(app.savedViews.length - 1)
})
syncViewButtons() // 자동 저장에서 복원된 시점들

document.getElementById('btn-undo')!.addEventListener('click', () => undo(app))
document.getElementById('btn-redo')!.addEventListener('click', () => redo(app))
document.getElementById('btn-draw-view')!.addEventListener('click', () => resetPose(app))
window.addEventListener('keydown', (e) => {
  // Esc — 떠 있는 물음을 취소한다(줄이 비면 밑줄 단어가 사라져 못 누른다).
  // 물음이 없을 때는 줄을 비우는 것뿐이고, 다음 문서 변경이 안내를 다시 쓴다.
  if (e.key === 'Escape') { clearNotice(); return }
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(app) }
  else if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); redo(app)
  }
})

// 창 크기 변경 — 캔버스만 따라간다. 문서 프레임(좌표계)은 불변.
window.addEventListener('resize', () => {
  const nw = window.innerWidth, nh = window.innerHeight
  const nd = window.devicePixelRatio || 1
  ctx = resize2d(ink, nw, nh, nd)
  resize3d(r3d, nw, nh, nd)
  app.cubeLayout = { cx: nw - 60, cy: 60, size: 80 }
  invalidate()
})

function frame() {
  autolevel.tick()   // 접힐 때가 됐으면 여기서 포즈가 움직인다(setPose가 다시 그리게 한다)
  if (dirty) {
    dirty = false
    render3d(r3d, app)
    draw2d(ctx, app, draft, hover, eraserPos)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// e2e 진단 통로 — 앱과 같은 함수·같은 상태를 본다(측정 경로와 앱 경로를 가르지 않는다)
import { project, screenAxes, vpMarks, frameAxes } from '../core/camera'
import { forwardOf, yawDir } from '../core/level'

const diag = {
  /** 승격 획 전부의 현재 포즈 재사영 — 불변식 k 확인용 */
  projectAll(): Record<number, { a: Pt; b: Pt } | null> {
    const out: Record<number, { a: Pt; b: Pt } | null> = {}
    for (const [id, seg] of app.lift.lifted) {
      const a = project(app.lift.an, app.pose, seg.a3)
      const b = project(app.lift.an, app.pose, seg.b3)
      out[id] = a && b ? { a, b } : null
    }
    return out
  },
  screenAxes: () => screenAxes(app.lift.an, app.pose),
  /** ✕ 표식이 실제로 그려지는 소실점 — render2d·osnap과 **같은 함수**다(web2-03 지시 1) */
  vpMarks: () => vpMarks(app.lift.an, app.pose),
  /** 그 차수의 정규직교 프레임 — 축은 셋이고 서로 직교한다 */
  frame: () => {
    const fr = frameAxes(app.lift.an)
    if (!fr) return null
    const d = (a: any, b: any) => a.x * b.x + a.y * b.y + a.z * b.z
    return {
      ids: fr.map(a => a.id),
      dots: [d(fr[0]!.dir, fr[1]!.dir), d(fr[0]!.dir, fr[2]!.dir), d(fr[1]!.dir, fr[2]!.dir)],
    }
  },
  /** 접기 진단 — e2e가 자세를 직접 읽는다 */
  level: () => ({
    level: isLevel(app.pose),
    folding: autolevel.folding(),
    fwd: forwardOf(app.pose),
    yaw: yawDir(app.pose),
    eye: app.pose.p.y,
  }),
  summary: () => ({
    horizonY: app.lift.an.horizonY,
    vps: app.lift.an.vps.map(v => ({ x: v.x, y: v.y })),
    f: app.lift.an.f,
    fSource: app.lift.an.fSource,
    lifted: app.lift.lifted.size,
    waiting: app.lift.waiting,
    strokes: app.doc.strokes.length,
    pose: app.pose,
    view: app.view,
  }),
}

declare global { interface Window { __b2?: { app: typeof app; diag: typeof diag } } }
window.__b2 = { app, diag }
