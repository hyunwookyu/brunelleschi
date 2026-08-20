// three.js 렌더 — 승격된 획을 Line2(화면 고정 굵기)로.
// 사영은 core/camera.ts의 모델과 같아야 한다(불변식 k) — 주점·f를 그대로
// 투영 행렬에 넣는다. 시야각·중심 가정을 따로 만들지 않는다.

import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import type { App } from './state'
import { C } from '../core/constants'

export interface R3D {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  group: THREE.Group
  material: LineMaterial
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
  scene.add(group)
  const material = new LineMaterial({
    color: 0x222222,
    linewidth: C.LINE_W_RESULT, // px — 거리에 따라 안 변한다(원칙 e)
    worldUnits: false,
  })
  material.resolution.set(W, H)
  return { renderer, scene, camera, group, material }
}

/** 승격 기하 갱신 — 문서가 바뀔 때마다 전부 다시 만든다(부분 유지 없음) */
export function syncStrokes(r: R3D, app: App) {
  for (const child of [...r.group.children]) {
    r.group.remove(child)
    ;(child as Line2).geometry?.dispose()
  }
  for (const seg of app.lift.lifted.values()) {
    const g = new LineGeometry()
    g.setPositions([seg.a3.x, seg.a3.y, seg.a3.z, seg.b3.x, seg.b3.y, seg.b3.z])
    r.group.add(new Line2(g, r.material))
  }
}

/** 카메라 동기화 — core 모델(주점 px,py · f · 화면 y 아래)을 투영 행렬로 옮긴다 */
export function syncCamera(r: R3D, app: App) {
  const an = app.lift.an
  const { W, H } = app.doc.frame
  if (!an.principal || an.f === null) return
  const { x: px, y: py } = an.principal
  const f = an.f
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

export function render3d(r: R3D, app: App) {
  syncCamera(r, app)
  r.renderer.render(r.scene, r.camera)
}
