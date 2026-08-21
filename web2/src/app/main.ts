// 배선 — 상태·입력·렌더를 잇는다. 계산은 전부 core에 있다.

import { createApp, commitStroke, undo, redo, resetPose, saveView, gotoView, loadDoc, clearAll } from './state'
import { initInput } from './input'
import { resize2d, draw2d, type Draft } from './render2d'
import { initR3D, syncStrokes, render3d, resize3d } from './render3d'
import { serializeBrnl, parseBrnl } from '../core/file'
import { toOBJ, toMTL, toGLTF } from '../core/export'
import { initNotice, notify, status, ask, clearNotice } from './notice'
import { OSNAP_ORDER, type OsnapHit } from '../core/osnap'
import { GRADES, MAT } from '../core/material'
import type { Pt } from '../core/vec'

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

function updateStatus() {
  const an = app.lift.an
  // **지평선 다음에는 아무것도 안 띄운다.** 「깊이선을 긋는다」·「(1/2)」는 다음에 무엇을
  // 그으라는 **지시로 읽힌다** — 사람이 「깊이선부터 강제된다」고 읽은 자리가 여기다.
  // 순서 강제는 없다: 수직·수평은 카메라와 무관하게 축이 정해져 있고, 그으면 그 자리에서
  // 축 라벨을 받는다. 소실점 개수는 소실점이 생긴 그 순간에만 알린다(onCommit).
  // 평소에 아무것도 안 띄우는 것이 원칙 g다.
  if (an.horizonY === null) status('지평선을 긋는다 — 수평이 강제된다')
  else status('')
}
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
    const reject = an.rejects.get(s.id)
    if (reject) notify(reject)
    else if (an.roles.get(s.id) === 'vp') {
      // ⚠ 「1/2」은 **다음에 무엇을 그으라는 지시로 읽힌다.** 순서 강제는 없다 —
      // 소실점 하나로도 3D는 선다(f는 깊이 배율 게이지). 개수만 알린다.
      notify(`소실점 ${an.vps.length} — 하나 더 그으면 깊이 배율이 두 소실점에서 나온다`)
    } else if (app.lift.waiting.includes(s.id)) {
      notify('시작점이 3D에 없어 대기한다 — 확정된 점에 이어 그리면 올라간다')
    }
  },
})

// 도구 전환 — 펜 / 연필 지우개(흑연만) / 펜 지우개(잉크만) (임시 UI)
const toolButtons: Record<string, HTMLButtonElement> = {
  'pen': document.getElementById('btn-pen') as HTMLButtonElement,
  'eraser-pencil': document.getElementById('btn-eraser-pencil') as HTMLButtonElement,
  'eraser-ink': document.getElementById('btn-eraser-ink') as HTMLButtonElement,
}
function setTool(t: 'pen' | 'eraser-pencil' | 'eraser-ink') {
  app.tool = t
  for (const [k, b] of Object.entries(toolButtons)) b.style.fontWeight = k === t ? 'bold' : 'normal'
  if (t === 'pen') { eraserPos = null }
  invalidate()
}
for (const k of Object.keys(toolButtons) as ('pen' | 'eraser-pencil' | 'eraser-ink')[]) {
  toolButtons[k]!.addEventListener('click', () => setTool(k))
}
setTool('pen')
const erSize = document.getElementById('eraser-size') as HTMLInputElement
erSize.value = String(app.eraserRadius)
erSize.addEventListener('input', () => { app.eraserRadius = Number(erSize.value) })

// 현재 심 — 경도 슬라이더와 인디케이터
const gradeSlider = document.getElementById('grade-slider') as HTMLInputElement
const gradeLabel = document.getElementById('grade-label')!
const lead = document.getElementById('lead') as HTMLElement
function syncGrade() {
  const g = GRADES[Number(gradeSlider.value)] ?? 'HB'
  app.grade = g
  gradeLabel.textContent = g === 'INK' ? '잉크' : g
  lead.style.background = MAT[g].color
  invalidate()
}
gradeSlider.addEventListener('input', syncGrade)
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
  const btn = document.createElement('button')
  btn.textContent = `시점 ${i + 1}`
  btn.addEventListener('click', () => gotoView(app, i))
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
  if (dirty) {
    dirty = false
    render3d(r3d, app)
    draw2d(ctx, app, draft, hover, eraserPos)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// e2e 진단 통로 — 앱과 같은 함수·같은 상태를 본다(측정 경로와 앱 경로를 가르지 않는다)
import { project, screenAxes } from '../core/camera'

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
