// three.js 렌더 — 승격된 획을 Line2(화면 고정 굵기)로.
// 사영은 core/camera.ts의 모델과 같아야 한다(불변식 k) — 주점·f를 그대로
// 투영 행렬에 넣는다. 시야각·중심 가정을 따로 만들지 않는다.

import { filmSplit } from './filmlayer'
import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import type { App } from './state'
import { viewXf, viewScale } from './state'
import { MAT, gradeOf, widthOf } from '../core/material'
import { C } from '../core/constants'
import { projW } from '../core/camera'
import { hatchSegments, type HatchMode } from '../core/hatch'
import { hatchSpecOf, hatchHexOf, solidHexOf } from '../core/palette'
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
  hatchGroup: THREE.Group
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
  // ⚠⚠ **web2-48 48-9 — 면은 평소에 안 보인다.** 「제도에서 면은 칠하기 전까지 존재하지
  // 않는다 — 선이 둘러싼 빈 종이일 뿐이다」(지시). 이 회색은 「여기 면이 있다」는 **UI
  // 표시**지 그림이 아니고, 늘 떠 있을 이유가 없었다. 이제 셋으로 갈린다:
  //   · 안 칠한 면 + 칠 도구를 안 들었다  →  **안 그린다**(종이 그대로)
  //   · 안 칠한 면 + 칠 도구를 들었다      →  이 옅은 회색(도구가 대상을 비춘다)
  //   · 칠한 면                            →  `solidMatOf` — **불투명**하고 뒤를 가린다
  // 옅기를 0.22 → `C.FACE_HINT_ALPHA`로 내린 이유: 이제 상시가 아니라 **도구를 든 동안만**
  // 뜨므로 「여기가 대상이다」만 말하면 된다(R8 — 늘 보이는 것은 잠깐 얹히는 것보다 약하다.
  // 여기서는 반대로 잠깐 얹히는 것이라 더 약해도 읽힌다).
  const faceMat = new THREE.MeshBasicMaterial({
    color: 0x8d8880, transparent: true, opacity: C.FACE_HINT_ALPHA,
    side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  })
  scene.add(faceGroup)
  // 해칭(web2-45 45-4) — 면과 선 «사이» 겹이다(톤은 선 아래 — 지시: 선이 위에 얹힌다).
  // 자리는 sortFaces가 제 면 바로 위(order+1)로 잡는다.
  const hatchGroup = new THREE.Group()
  scene.add(hatchGroup)
  scene.add(group)
  const materials = new Map<string, LineMaterial>()
  // 재질은 **쓰이는 그 자리에서** 만든다(matFor). 경도별로 미리 만들어 두면 굵기 기본값을
  // 여기서도 정하게 되고, 그러면 굵기의 출처가 둘이 된다(PITFALLS #54).
  return { renderer, scene, camera, group, faceGroup, faceMat, hatchGroup, materials, W, H }
}

const matKey = (g: Grade, w: number) => `${g}:${w.toFixed(3)}`

// ── **칠한 면의 불투명 재질**(web2-48 48-9) — 뒤를 가린다 ─────────────────────
// 「칠한 면은 불투명하다 — 뒤를 가린다. 칠했다는 것은 「여기 실체가 있다」는 선언이다.
//  안 칠한 면은 안 가린다(작도를 계속해야 하므로)」(지시).
// 가리는 기제는 **깊이 버퍼**다(renderOrder가 아니다): 이 재질만 `depthWrite`를 켜고,
// 면은 renderOrder 음수 대역이라 선(0)보다 먼저 그려지므로 **그 뒤의 선이 깊이 검사에
// 걸린다**. 앞의 선은 그대로 그려진다. 안 칠한 면(`faceMat`)은 종전대로 깊이를 안 써서
// 아무것도 안 가린다 — 45-1이 세운 「면이 선을 안 가린다」가 그쪽에서는 불변이다.
// ⚠ 딸린 값(지시): 이제 **깊이 정렬이 틀리면 즉시 드러난다**(45-1의 `orderByDepth`를
//   이 회차가 다시 확인한다 — `e2e/paint48.spec.ts` ⑤).
// 색마다 하나 — 캐시라 dispose 불요(hatchMats의 선례 그대로).
const solidMats = new Map<string, THREE.MeshBasicMaterial>()
function solidMatOf(hex: string): THREE.MeshBasicMaterial {
  let m = solidMats.get(hex)
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex), side: THREE.DoubleSide,
      transparent: false, depthTest: true, depthWrite: true,
    })
    solidMats.set(hex, m)
  }
  return m
}

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
  const split = filmSplit(app)
  for (const child of [...r.group.children]) {
    r.group.remove(child)
    ;(child as Line2).geometry?.dispose()
  }
  for (const child of [...r.faceGroup.children]) {
    r.faceGroup.remove(child)
    ;(child as THREE.Mesh).geometry?.dispose()
  }
  // **칠한 면**(48-9) — 「칠했다」의 뜻은 ① 채움을 줬거나(해칭·단색) ② 그 면에 칠 획이
  // 하나라도 얹혔다는 것이다. 둘 다 사람이 「여기 실체가 있다」고 선언한 자리다.
  // ⚠ 48-5의 «쪽»은 여기서 **안 본다**: 벽의 안쪽만 칠했어도 벽은 벽이다(실체의 선언은
  // 면의 것이고 칠의 것이 아니다). 그래서 이 집합은 포즈의 함수가 아니고 여기(docVersion)
  // 서 굳혀도 궤도에서 안 낡는다 — 「무엇을 어디서 굳히는가」의 규율(sortFaces 주석)대로다.
  const painted = new Set<number>()
  for (const s of app.doc.strokes) if (s.paint !== undefined) painted.add(s.paint.f)
  for (const f of app.doc.faces) if (f.fill === 1 || f.fill === 2) painted.add(f.id)
  for (const f of app.faces) {
    if (f.tris.length < 3) continue
    const pos = new Float32Array(f.tris.length * 3)
    let cx = 0, cy = 0, cz = 0
    f.tris.forEach((p, i) => {
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z
      cx += p.x; cy += p.y; cz += p.z
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const face = app.doc.faces.find(x => x.id === f.id)
    const isPainted = painted.has(f.id)
    // 단색 채움(48-3)이면 그 색, 아니면 종이색이다 — 「칠했다」는 곧 «여기 표면이 있다»라
    // 종이 한 장이 서 있는 것과 같다(칠 자체는 #brushc가 그 위에 그린다).
    const mesh = new THREE.Mesh(g, isPainted
      ? solidMatOf(face?.fill === 2 ? solidHexOf(face) : C.PAPER_HEX)
      : r.faceMat)
    mesh.userData.painted = isPainted
    // 깊이 정렬(web2-45 45-1)의 재료 — 자리는 sortFaces가 매 프레임 잡는다(포즈의 함수라
    // 여기(docVersion)서 굳히면 궤도에서 낡는다). 중심은 삼각분할 정점 평균으로 충분하다 —
    // 겹치는 면들은 서로 다른 평면이라 중심 깊이가 순서를 가른다(같은 평면 겹침은 없다:
    // planesOf가 한 평면의 순환을 서로 소로 낸다).
    mesh.userData.centroid = { x: cx / f.tris.length, y: cy / f.tris.length, z: cz / f.tris.length }
    mesh.userData.faceId = f.id
    r.faceGroup.add(mesh)
  }
  hatchKey = ''   // 문서가 바뀌었다 — 해칭도 다시 짓는다(syncHatch가 다음 렌더에서)
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
    // 활성 겹과 그 위 겹의 획(web2-20 3부) — 몸체가 #layerc(막 위)에 산다. 여기(#gl —
    // 막 아래) 두면 막에 물든다(⑨). 판정은 filmSplit 하나(#54 — 포즈 무관 above).
    if (split && stroke?.layer !== undefined && split.above.has(stroke.layer)) continue
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
  // **보기 렌즈는 여기서 갈래를 안 만든다**(web2-31 2번): `viewXf`가 「주점 고정 배율 k」를
  // 합성해 오므로 아래 식이 그대로 `px` 제자리 · `f = viewF·s`를 낸다(주점이 고정점이다).
  const v = viewXf(app)
  const px = an.principal.x * v.s + v.ox
  const py = an.principal.y * v.s + v.oy
  const f = an.f * v.s
  const near = C.RENDER_NEAR_UNITS, far = 1e6   // 근평면의 출처는 `C` 하나다 — 돋보기가 같은 값을 읽는다(#54)
  // ── 평행 사영(web2-42 2번) — **`core/camera.ts`의 den 식을 그대로 행렬에 옮긴다** ──
  //
  // 그 파일이 화면 좌표를 `주점 + f·(x,−y)/den`으로 내고 `den = (1−w)(−z) + wD`이므로,
  // 클립 좌표의 w 성분을 **den으로 두면** 나머지 행이 종전 식 그대로 따라온다:
  //
  //     w_clip = −(1−w)·z + w·D·1        ← 마지막 행
  //     x_clip = (2f/W)·x + (1−2px/W)·w_clip
  //     y_clip = (2f/H)·y + (2py/H−1)·w_clip
  //
  // (나누면 ndc = 2·화면/크기 ∓ 1이 된다 — 옛 행렬이 하던 그 계산이다.)
  // **w=0이면 계수가 문자 그대로 옛 값**이라 원근 경로가 한 톨도 안 바뀐다(불변식 k 유지).
  //
  // ⚠ 깊이 행은 **따로 섞는다**: 원근의 (far+near) 식을 평행에 그대로 쓰면 pivot 뒤의
  //   기하가 `|ndc_z| > 1`로 **잘려 나간다**. 평행 갈래는 근평면을 눈 뒤 `far`에 두는
  //   대칭 정투상(`ndc_z = −z/far`)이고, 그래서 정투상 뷰에서 **눈 뒤도 안 잘린다** —
  //   `project`의 「평행에서는 den ≡ D > 0이라 아무것도 안 잘린다」와 같은 규약이다.
  const w = projW(app.pose)
  const D = w > 0 ? app.pose.proj!.D : 0
  const kz = 1 - w                                  // z 계수의 몫
  const A = kz * (-(far + near) / (far - near)) + w * (-D / far)
  const B = kz * (-2 * far * near / (far - near))
  r.camera.projectionMatrix.set(
    2 * f / W, 0, (1 - 2 * px / W) * kz, (2 * px / W - 1) * w * D,
    0, 2 * f / H, (2 * py / H - 1) * kz, (1 - 2 * py / H) * w * D,
    0, 0, A, B,
    0, 0, -kz, w * D,
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
    const v = viewXf(app)
    const sx = p.x * v.s + v.ox, sy = p.y * v.s + v.oy   // 문서 → 화면(CSS · 렌즈 합성)
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

// ── 해칭(web2-45 45-4) — 두 판(⚑ — 사람이 눈으로 고른다) ────────────────────────
// 모드의 출처는 이 모듈 하나다(#54) — 표시 계층의 «보는 방식»이라 localStorage 몫은
// main이 진다(renderer 토글의 규약 그대로).
let hatchMode: HatchMode = 'screen'
export const getHatchMode = (): HatchMode => hatchMode
export function setHatchMode(m: HatchMode) { hatchMode = m; hatchKey = '' }
let hatchKey = ''
// 해칭 선 재질 — 색마다 하나(web2-46: 재료가 색을 정한다 — `palette.hatchHexOf`).
// 재료 없는 면은 45의 회갈색 그대로다(HATCH_DEFAULT_HEX — 무회귀). 캐시라 dispose 불요.
const hatchMats = new Map<string, THREE.LineBasicMaterial>()
function hatchMatOf(hex: string): THREE.LineBasicMaterial {
  let m = hatchMats.get(hex)
  if (!m) {
    m = new THREE.LineBasicMaterial({
      color: new THREE.Color(hex), transparent: true, opacity: C.HATCH_ALPHA,
      depthTest: false, depthWrite: false,
    })
    hatchMats.set(hex, m)
  }
  return m
}

/** 해칭 다시 짓기 — 문서·모드가 바뀌면, 그리고 **화면 판은 시점·줌이 바뀌면**(정의가
 *  화면의 것이라서다 — 그것이 곧 ⚑의 「무늬가 면 위에서 미끄러진다」다). */
function syncHatch(r: R3D, app: App) {
  const filled = app.doc.faces.filter(f => f.fill === 1)
  const p = app.pose.p, q = app.pose.q
  const poseSig = hatchMode === 'screen'
    ? `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)},${q.x.toFixed(5)},${q.y.toFixed(5)},${q.z.toFixed(5)},${viewScale(app).toFixed(4)}`
    : ''
  const key = `${app.docVersion}|${hatchMode}|${filled.length}|${poseSig}`
  if (key === hatchKey) return
  hatchKey = key
  for (const child of [...r.hatchGroup.children]) {
    r.hatchGroup.remove(child)
    ;(child as THREE.LineSegments).geometry?.dispose()
  }
  for (const face of filled) {
    const rf = app.faces.find(x => x.id === face.id)
    if (!rf) continue                                  // 못 풀린 면 — 채움도 쉰다(면의 규약)
    // 재료(web2-46) — 무늬·색의 출처는 palette 하나다(#54). 없으면 45의 기본 그대로.
    const spec = hatchSpecOf(face)
    const spacing = hatchMode === 'screen'
      ? spec.spacingPx / viewScale(app)                // 화면 px 정의 — 줌을 되돌려 문서 px로
      : spec.spacingPx
    const segs = hatchSegments(app.lift.an, app.pose, rf, hatchMode, spacing, spec.angleDeg)
    // 교차 한 벌 더(콘크리트) — 같은 생성기를 각도+90°로 한 번 더 부른다(기제 불변 — 45의
    // 생성기·짝수-홀수 절단이 그대로 돌고 호출이 하나 는 것뿐이다).
    if (spec.cross) segs.push(...hatchSegments(app.lift.an, app.pose, rf, hatchMode, spacing, spec.angleDeg + 90))
    if (segs.length === 0) continue
    const pos = new Float32Array(segs.length * 6)
    segs.forEach((s, i) => {
      pos[i * 6] = s.a.x; pos[i * 6 + 1] = s.a.y; pos[i * 6 + 2] = s.a.z
      pos[i * 6 + 3] = s.b.x; pos[i * 6 + 4] = s.b.y; pos[i * 6 + 5] = s.b.z
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const ls = new THREE.LineSegments(g, hatchMatOf(hatchHexOf(face)))
    ls.userData.faceId = face.id
    r.hatchGroup.add(ls)
  }
}

/** **면 깊이 정렬**(web2-45 45-1) — 겹친 화면 자리에서 **앞 면이 위에** 그려진다.
 *  기준선 실측(faces45_web2.json scene_depth): 배열 순서 렌더는 지정 순서가 나쁘면
 *  뒤집힘 33/33이었다. depthTest가 없으므로(선을 가리지 않는 설계) 순서가 전부다 —
 *  중심의 시선 방향 깊이로 renderOrder를 매 프레임 배정한다(먼 것 먼저 · 화가 알고리즘).
 *  전부 **음수 대역**이라 선(0)은 여전히 면 위다(6-h 「선 우선순위」 불변). */
/** **깊이 순위의 규칙 그 자체** — 순수 함수로 뽑아 둔 이유는 팔이 **같은 함수**를 재게
 *  하기 위해서다(#54 · 45 리뷰어 [3] — «후»를 다른 하네스에서 재면 대역이 안 맞는다).
 *  반환: id → 그리는 차례(0 = 가장 먼저 = 가장 멀다). 나중 = 위. */
export function orderByDepth(
  rows: { id: number; centroid: { x: number; y: number; z: number } }[],
  pose: { p: { x: number; y: number; z: number }; q: { x: number; y: number; z: number; w: number } },
): Map<number, number> {
  const p = pose.p, q = pose.q
  // 시선 방향(앞) — quatRotate(q, (0,0,−1))을 손으로 편다(식은 camera.ts와 같다)
  const fx = -2 * (q.x * q.z + q.w * q.y)
  const fy = -2 * (q.y * q.z - q.w * q.x)
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y))
  const ranked = rows.map(r => ({
    id: r.id,
    d: (r.centroid.x - p.x) * fx + (r.centroid.y - p.y) * fy + (r.centroid.z - p.z) * fz,
  }))
  ranked.sort((a, b) => b.d - a.d)               // 먼 것 먼저
  return new Map(ranked.map((r, i) => [r.id, i]))
}

// D-3 반증 손잡이(45 리뷰어 [4]) — 끄면 배열 순서 그대로다(수리 전 상태 재현 · #30).
let faceSortOn = true
export function setFaceSortForTest(v: boolean) { faceSortOn = v }

function sortFaces(r: R3D, app: App) {
  const kids = r.faceGroup.children
  if (kids.length < 2) return
  const rows = kids.map((k, i) => {
    const u = k.userData as { centroid?: { x: number; y: number; z: number }; faceId?: number }
    return { k, id: u.faceId ?? -i - 1, centroid: u.centroid ?? { x: 0, y: 0, z: 0 } }
  })
  const rank = faceSortOn
    ? orderByDepth(rows, app.pose)
    : new Map(rows.map((r, i) => [r.id, i]))     // 끔 = 배열 순서(수리 전)
  // 면은 짝수 자리, 그 면의 해칭은 바로 위 홀수 자리 — 해칭이 «자기 면» 위·«앞 면» 아래에
  // 선다(뒤 면의 해칭이 앞 면 채움을 뚫고 나오면 깊이 정렬이 무의미해진다).
  const orderOf = new Map<number, number>()
  for (const row of rows) {
    const i = rank.get(row.id) ?? 0
    row.k.renderOrder = -1000 + 2 * i
    orderOf.set(row.id, -1000 + 2 * i)
  }
  for (const h of r.hatchGroup.children) {
    const fid = (h.userData as { faceId?: number }).faceId
    h.renderOrder = (fid !== undefined ? orderOf.get(fid) ?? -1000 : -1000) + 1
  }
}

/** **면이 지금 드러나는가**(web2-48 48-9) — 「도구가 대상을 비춘다」.
 *  ⚠ **갈래를 여기 적어 둔다**: 지시는 「칠하는 도구를 들었을 때만」인데 **면 도구**도
 *  넣었다. 면 도구의 일이 「탭해서 면을 만들고 없애는 것」이라, 면이 안 보이면 **없애는
 *  쪽이 눈먼 조작**이 된다(있는 면을 못 보고 누른다). 「비추는 도구」의 뜻이 «그 면을
 *  대상으로 삼는 도구»이므로 둘 다 같은 무리다 — 단순한 쪽으로 갔고 갈래였음을 남긴다. */
export const facesRevealed = (app: Pick<App, 'tool'>): boolean =>
  app.tool === 'paint' || app.tool === 'face'

/** 칠 안 한 면의 표시를 도구에 맞춘다(48-9). 칠한 면은 늘 보인다 — 그림이기 때문이다. */
function revealFaces(r: R3D, app: App) {
  const on = facesRevealed(app)
  for (const k of r.faceGroup.children) {
    k.visible = (k.userData as { painted?: boolean }).painted === true || on
  }
}

export function render3d(r: R3D, app: App) {
  syncCamera(r, app)
  syncHatch(r, app)
  revealFaces(r, app)
  sortFaces(r, app)
  r.renderer.render(r.scene, r.camera)
}
