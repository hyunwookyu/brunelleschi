// 배선 — 상태·입력·렌더를 잇는다. 계산은 전부 core에 있다.

import { createApp, commitStroke, undo, redo, resetPose, saveView, gotoView } from './state'
import { initInput } from './input'
import { resize2d, draw2d, type Draft } from './render2d'
import { initR3D, syncStrokes, render3d } from './render3d'
import { initNotice, notify, status } from './notice'
import { OSNAP_ORDER, type OsnapHit } from '../core/osnap'
import type { Pt } from '../core/vec'

const W = window.innerWidth
const H = window.innerHeight
const dpr = window.devicePixelRatio || 1

const ink = document.getElementById('ink') as HTMLCanvasElement
const gl = document.getElementById('gl') as HTMLCanvasElement
initNotice(document.getElementById('notice')!)

const app = createApp(W, H)
const ctx = resize2d(ink, W, H, dpr)
const r3d = initR3D(gl, W, H, dpr)

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

function updateStatus() {
  const an = app.lift.an
  if (an.horizonY === null) status('지평선을 긋는다 — 수평이 강제된다')
  else if (an.vps.length === 0) status('깊이선을 긋는다 — 지평선과의 교점이 소실점이다')
  else if (an.vps.length === 1) status('다른 방향 깊이선을 그으면 두 번째 소실점 (1/2)')
  else status('') // 작도 끝 — 평소에는 아무것도 안 띄운다(원칙 g)
}
updateStatus()

initInput(ink, app, {
  onDraftChange(d) { draft = d; invalidate() },
  onHover(p) { hover = p; invalidate() },
  onEraserMove(p) { eraserPos = p; invalidate() },
  onCommit(a, b, raw) {
    const s = commitStroke(app, a, b, raw)
    const an = app.lift.an
    const reject = an.rejects.get(s.id)
    if (reject) notify(reject)
    else if (an.roles.get(s.id) === 'vp') {
      notify(an.constructionDone ? '소실점 2/2 — 작도 끝. 이제 그리면 3D다' : '소실점 1/2')
    } else if (app.lift.waiting.includes(s.id)) {
      notify('시작점이 3D에 없어 대기한다 — 확정된 점에 이어 그리면 올라간다')
    }
  },
})

// 도구 전환 — 펜 / 지우개 (임시 UI)
const btnPen = document.getElementById('btn-pen') as HTMLButtonElement
const btnEraser = document.getElementById('btn-eraser') as HTMLButtonElement
function setTool(t: 'pen' | 'eraser') {
  app.tool = t
  btnPen.style.fontWeight = t === 'pen' ? 'bold' : 'normal'
  btnEraser.style.fontWeight = t === 'eraser' ? 'bold' : 'normal'
  if (t !== 'eraser') { eraserPos = null; invalidate() }
}
btnPen.addEventListener('click', () => setTool('pen'))
btnEraser.addEventListener('click', () => setTool('eraser'))
setTool('pen')
const erSize = document.getElementById('eraser-size') as HTMLInputElement
erSize.value = String(app.eraserRadius)
erSize.addEventListener('input', () => { app.eraserRadius = Number(erSize.value) })

// 오스냅 설정 패널(임시 UI — 7단계에서 세로바로) — 종류별 토글·반경
const osnapPanel = document.getElementById('osnap-kinds')!
const KIND_LABEL: Record<string, string> = {
  vertex: '정점', end: '끝점', mid: '중점', int: '교차점',
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

// 시점 저장·복귀
const viewsEl = document.getElementById('views')!
document.getElementById('btn-save-view')!.addEventListener('click', () => {
  saveView(app)
  const i = app.savedViews.length - 1
  const btn = document.createElement('button')
  btn.textContent = `시점 ${i + 1}`
  btn.addEventListener('click', () => gotoView(app, i))
  viewsEl.append(btn)
})

document.getElementById('btn-undo')!.addEventListener('click', () => undo(app))
document.getElementById('btn-redo')!.addEventListener('click', () => redo(app))
document.getElementById('btn-draw-view')!.addEventListener('click', () => resetPose(app))
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(app) }
  else if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); redo(app)
  }
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
