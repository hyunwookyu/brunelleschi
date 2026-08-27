// three.js 렌더 — 승격된 획을 Line2(화면 고정 굵기)로.
// 사영은 core/camera.ts의 모델과 같아야 한다(불변식 k) — 주점·f를 그대로
// 투영 행렬에 넣는다. 시야각·중심 가정을 따로 만들지 않는다.

import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import type { App } from './state'
import { MAT, gradeOf, widthOf } from '../core/material'
import type { Grade } from '../core/types'

export interface R3D {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  group: THREE.Group
  /** 면 — 선보다 **먼저** 그린다(renderOrder −1). 깊이를 안 쓰므로 선을 가리지 않는다:
   *  이 도구는 선 그림이고 면은 그 위에 얹은 옅은 채색이다(6-h 「선 우선순위」). */
  faceGroup: THREE.Group
  faceMat: THREE.MeshBasicMaterial
  /** 재질 — 화면 고정 굵기(worldUnits=false), 경도별 색·투명도.
   *  키가 `경도:굵기`인 이유는 제도펜 니브다(4-f) — 같은 잉크라도 굵기가 다르면 다른 재질이다.
   *  경도 기본 굵기는 처음부터 넣어 둔다(옛 문서·연필은 그 자리에서 맞는다). */
  materials: Map<string, LineMaterial>
  /** 캔버스 CSS 크기 — NDC 매핑 기준 (문서 프레임과 다를 수 있다) */
  W: number
  H: number
}

export function initR3D(canvas: HTMLCanvasElement, W: number, H: number, dpr: number): R3D {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true,
    preserveDrawingBuffer: true, // e2e 픽셀 판독용
  })
  renderer.setPixelRatio(dpr)
  renderer.setSize(W, H)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  camera.matrixAutoUpdate = false
  const group = new THREE.Group()
  const faceGroup = new THREE.Group()
  faceGroup.renderOrder = -1
  // 무채색 — **상시 표시**라 색을 안 준다(4-c의 갈래: 상시는 무채색, 순간은 색).
  // 종이(#f5f3ee)보다 어둡되 2H(가장 옅은 심, alpha .50)보다 옅게 둔다 —
  // 면이 그 위의 선보다 눈에 띄면 안 된다.
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0x8d8880, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  })
  scene.add(faceGroup)
  scene.add(group)
  const materials = new Map<string, LineMaterial>()
  // 재질은 **쓰이는 그 자리에서** 만든다(matFor). 경도별로 미리 만들어 두면 굵기 기본값을
  // 여기서도 정하게 되고, 그러면 굵기의 출처가 둘이 된다(PITFALLS #54).
  return { renderer, scene, camera, group, faceGroup, faceMat, materials, W, H }
}

const matKey = (g: Grade, w: number) => `${g}:${w.toFixed(3)}`

/** 경도·굵기 짝의 재질 — 없으면 만든다. 화면 크기는 만든 그 자리에서 맞춘다. */
function matFor(r: R3D, g: Grade, w: number): LineMaterial {
  const key = matKey(g, w)
  const hit = r.materials.get(key)
  if (hit) return hit
  const m = MAT[g]
  const lm = new LineMaterial({
    color: m.colorNum,
    linewidth: w, // px — 거리에 따라 안 변한다(원칙 e)
    worldUnits: false,
    transparent: m.alpha < 1,
    opacity: m.alpha,
  })
  lm.resolution.set(r.W, r.H)
  r.materials.set(key, lm)
  return lm
}

export function resize3d(r: R3D, W: number, H: number, dpr: number) {
  r.W = W; r.H = H
  r.renderer.setPixelRatio(dpr)
  r.renderer.setSize(W, H)
  for (const m of r.materials.values()) m.resolution.set(W, H)
}

/** **비용 표식**(web2-18 0부 ②) — `syncStrokes` 한 번의 ms. 문서가 바뀔 때마다 돈다
 *  (궤도 중에는 안 돈다 — 포즈는 docVersion을 안 올린다. 그 사실 자체가 0부의 답 하나다).
 *  `lastMs`는 마지막 한 번 · `totalMs`/`calls`는 누산 — 진단 패널과 원장이 같이 읽는다. */
export const syncCost = { calls: 0, lastMs: 0, totalMs: 0 }
export function resetSyncCost(): void { syncCost.calls = 0; syncCost.lastMs = 0; syncCost.totalMs = 0 }

/** 승격 기하 갱신 — 문서가 바뀔 때마다 전부 다시 만든다(부분 유지 없음).
 *  재료가 재질을 정한다 — 필압은 흑연 투명도에 얹는다. */
export function syncStrokes(r: R3D, app: App) {
  const t0 = performance.now()
  for (const child of [...r.group.children]) {
    r.group.remove(child)
    ;(child as Line2).geometry?.dispose()
  }
  for (const child of [...r.faceGroup.children]) {
    r.faceGroup.remove(child)
    ;(child as THREE.Mesh).geometry?.dispose()
  }
  for (const f of app.faces) {
    if (f.tris.length < 3) continue
    const pos = new Float32Array(f.tris.length * 3)
    f.tris.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    r.faceGroup.add(new THREE.Mesh(g, r.faceMat))
  }
  for (const [id, seg] of app.lift.lifted) {
    const stroke = app.lift.strokes.get(id)
    const grade = stroke ? gradeOf(stroke) : 'HB'
    // ── 잉크 확정선은 여기 안 산다(web2-18 1부) ────────────────────────────
    // 겹 순서가 «#gl(1) < #brushc(1, DOM 나중) < #ink(2)»인데 #brushc가 **연필 흑연**을
    // 그리므로, 잉크 몸체가 #gl에 있으면 연필이 잉크를 덮는다(사람 관측: 「펜이 연필선에
    // 먹혀 거의 안 보인다」). 잉크는 균일선이라 Canvas 2D가 같은 것을 그린다 —
    // **몸체를 #ink로 옮기면 아무것도 안 바뀌고 겹만 바뀐다**(render2d의 「잉크 확정선
    // 몸체」 절이 정본. 기각한 두 길 ⓐ·ⓑ는 DECISIONS.md).
    // ⚠ **렌더러 모드와 무관하다** — classic에서도 잉크는 위여야 한다(질감 겹이 없어도
    // 2D 오버레이의 대기 획·입자가 여전히 #gl 위다).
    if (grade === 'INK') continue
    const w = widthOf(stroke)   // 획이 없으면 재료 기본값 — 분기도 출처도 하나다
    const g = new LineGeometry()
    g.setPositions([seg.a3.x, seg.a3.y, seg.a3.z, seg.b3.x, seg.b3.y, seg.b3.z])
    r.group.add(new Line2(g, matFor(r, grade, w)))
  }
  syncCost.calls++
  syncCost.lastMs = performance.now() - t0
  syncCost.totalMs += syncCost.lastMs
}

/** 카메라 동기화 — core 모델(주점 px,py · f · 화면 y 아래)을 투영 행렬로 옮긴다.
 *  뷰 오프셋(화면 팬·줌)은 f·주점의 화면 변환으로 정확히 얹힌다:
 *  s·(px + f·X/−Z) + ox = (s·px+ox) + (s·f)·X/−Z */
export function syncCamera(r: R3D, app: App) {
  const an = app.lift.an
  const { W, H } = r // NDC는 캔버스 크기 기준 — 주점·f는 문서 좌표에서 뷰 변환으로
  if (!an.principal || an.f === null) return
  const v = app.view
  const px = an.principal.x * v.s + v.ox
  const py = an.principal.y * v.s + v.oy
  const f = an.f * v.s
  const near = 1, far = 1e6
  r.camera.projectionMatrix.set(
    2 * f / W, 0, 1 - 2 * px / W, 0,
    0, 2 * f / H, 2 * py / H - 1, 0,
    0, 0, -(far + near) / (far - near), -2 * far * near / (far - near),
    0, 0, -1, 0,
  )
  r.camera.projectionMatrixInverse.copy(r.camera.projectionMatrix).invert()

  const p = app.pose.p, q = app.pose.q
  r.camera.position.set(p.x, p.y, p.z)
  r.camera.quaternion.set(q.x, q.y, q.z, q.w)
  r.camera.updateMatrix()
  r.camera.matrixWorld.copy(r.camera.matrix)
  r.camera.matrixWorldInverse.copy(r.camera.matrixWorld).invert()
}

// ── draft 몸체(web2-12 2번) — 진행 중인 획의 몸체를 **Line2 그 자체**로 그린다 ─────
// 확정 몸체가 Line2이므로, draft 몸체를 2D 캔버스 벡터로 그리면 반투명 합성의
// 파이프라인 차(채널 17~32 대역 — dpr2 실측)가 뗌 순간에 보인다. 같은 재질(matFor 캐시
// 공유)·같은 셰이더가 같은 픽셀을 내는 것이 구성적 답이다. 화면 끝점을 카메라 역사영으로
// 광선 위 점에 놓는다 — worldUnits=false(화면 고정 굵기)라 깊이는 픽셀에 안 실린다.
let draftLine: Line2 | null = null
export function setDraftLine(r: R3D, app: App,
  d: { a: Pt2; b: Pt2; grade: Grade; w: number } | null) {
  if (!d) {
    if (draftLine) draftLine.visible = false
    return
  }
  syncCamera(r, app)  // 역사영 전에 행렬을 현재 포즈로
  const un = (p: Pt2) => {
    const v = app.view
    const sx = p.x * v.s + v.ox, sy = p.y * v.s + v.oy   // 문서 → 화면(CSS)
    const nd = new THREE.Vector3((2 * sx) / r.W - 1, 1 - (2 * sy) / r.H, 0)
    return nd.unproject(r.camera)
  }
  const a = un(d.a), b = un(d.b)
  if (!draftLine) {
    // ⚠ r.group이 아니라 scene에 직접 — syncStrokes가 group을 통째로 비우며 geometry를
    // dispose하므로(문서가 바뀔 때마다) 거기 두면 draft 기하가 산 채로 버려진다.
    draftLine = new Line2(new LineGeometry(), matFor(r, d.grade, d.w))
    r.scene.add(draftLine)
  }
  draftLine.material = matFor(r, d.grade, d.w)
  draftLine.geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z])
  draftLine.visible = true
}

interface Pt2 { x: number; y: number }

export function render3d(r: R3D, app: App) {
  syncCamera(r, app)
  r.renderer.render(r.scene, r.camera)
}
