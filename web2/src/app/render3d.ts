// three.js 렌더 — 승격된 획을 Line2(화면 고정 굵기)로.
// 사영은 core/camera.ts의 모델과 같아야 한다(불변식 k) — 주점·f를 그대로
// 투영 행렬에 넣는다. 시야각·중심 가정을 따로 만들지 않는다.

import { filmSplit } from './filmlayer'
import * as THREE from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import type { App } from './state'
import { viewXf, viewScale, faceSlotsOf } from './state'
import { MAT, gradeOf, widthOf } from '../core/material'
import { C } from '../core/constants'
import { projW } from '../core/camera'
import { hatchSegments, type HatchMode } from '../core/hatch'
import { hatchSpecOf, hatchHexOf, solidHexOf } from '../core/palette'
import { repSegments, repBasis, repVisibleFamilies, isRepId, isMatRepId, type Seg3 } from '../core/matrep'
import { project } from '../core/camera'
import { paintSideAt } from '../core/paint'
import { borderQuads } from '../core/border'
import { vkey } from '../core/joint'
import { norm3, add3, mul3, type V3 } from '../core/vec'
import { uvBoxOf, texLevel, bakeFaceTex, drawDraftOnTex, type UvBox, type RepBake } from '../core/facetex'
import { faceHatchSpacingWorld } from '../core/hatch'
import type { Grade, Stroke, Face } from '../core/types'

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
  /** 재료 표현(web2-49) — 면 고정 실치수 무늬. 해칭과 같은 겹 층위(면 위·선 아래)이고
   *  자리는 sortFaces가 해칭과 같은 규칙(order+1)으로 잡는다. */
  repGroup: THREE.Group
  /** 면 텍스처(web2-50) — 칠·면 고정 해칭이 사는 겹. 면 위 · 무늬(rep) 위 · 선(0) 아래
   *  (52-4의 차례 «톤·무늬가 아래, 손으로 그은 것이 위» — sortFaces가 order+2로 잡는다).
   *  합성은 **곱하기**(MultiplyBlending) — 흰 텍셀이 항등이라 아래 선·면이 언제나 비친다. */
  paintGroup: THREE.Group
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
  const repGroup = new THREE.Group()     // 재료 표현(web2-49) — 해칭과 같은 층위
  scene.add(repGroup)
  const paintGroup = new THREE.Group()   // 면 텍스처(web2-50) — 칠·면 고정 해칭
  scene.add(paintGroup)
  scene.add(group)
  const materials = new Map<string, LineMaterial>()
  // 재질은 **쓰이는 그 자리에서** 만든다(matFor). 경도별로 미리 만들어 두면 굵기 기본값을
  // 여기서도 정하게 되고, 그러면 굵기의 출처가 둘이 된다(PITFALLS #54).
  return { renderer, scene, camera, group, faceGroup, faceMat, hatchGroup, repGroup, paintGroup, materials, W, H }
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
    const face = app.doc.faces.find(x => x.id === f.id)
    const isPainted = painted.has(f.id)
    // web2-55 — 두께: 분류의 t(+ 면 예외)가 앞/뒤 오프셋과 띠를 낸다. **t=0이면 slots가
    // null이라 아래 오프셋 0·띠 없음 — 오늘의 화면 그대로다**(중심 게이트의 코드 자리).
    const slots = faceSlotsOf(app, f)
    const n55 = slots ? norm3(f.normal) : null
    // web2-56 — 접합 이동표(면내 · 접합 모서리 정점만 든다). 정점에 앞/뒤 몫을 더하면
    // 오프셋 면이 상대 표면까지 연장/절단되고, 그 모서리의 띠 사각은 저절로 캡(마이터/
    // 버트 면)이 된다 — 특수 분기 없음(지시: 마이터는 별도 모드가 아니다).
    const jsh = slots ? app.joints?.shifts.get(f.id) : undefined
    const j56 = (v: V3, off: number, slot: 'f' | 'b' | null): V3 => {
      const base = off !== 0 && n55 ? add3(v, mul3(n55, off)) : v
      if (!slot || !jsh) return base
      const sh = jsh.get(vkey(v))
      return sh ? add3(base, sh[slot]) : base
    }
    const matOf55 = () => isPainted
      ? solidMatOf(face?.fill === 2 ? solidHexOf(face) : C.PAPER_HEX)
      : r.faceMat
    const addFaceMesh = (off: number, slot: 'f' | 'b' | null = null) => {
      const pos = new Float32Array(f.tris.length * 3)
      let cx = 0, cy = 0, cz = 0
      f.tris.forEach((p, i) => {
        const q = j56(p, off, slot)
        pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z
        cx += q.x; cy += q.y; cz += q.z
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      // 단색 채움(48-3)이면 그 색, 아니면 종이색이다 — 「칠했다」는 곧 «여기 표면이 있다»라
      // 종이 한 장이 서 있는 것과 같다(칠 자체는 면 텍스처가 그 위에 얹는다).
      const mesh = new THREE.Mesh(g, matOf55())
      mesh.userData.painted = isPainted
      // 깊이 정렬(web2-45 45-1)의 재료 — 자리는 sortFaces가 매 프레임 잡는다(포즈의 함수라
      // 여기(docVersion)서 굳히면 궤도에서 낡는다). 중심은 삼각분할 정점 평균으로 충분하다.
      mesh.userData.centroid = { x: cx / f.tris.length, y: cy / f.tris.length, z: cz / f.tris.length }
      mesh.userData.faceId = f.id
      r.faceGroup.add(mesh)
    }
    if (!slots) {
      addFaceMesh(0)
    } else {
      addFaceMesh(slots.frontW, 'f')
      addFaceMesh(slots.backW, 'b')
      // 띠(테두리 — 셋째 슬롯의 몸): 경계 사각들. 자유단 캡 = 평평(butt).
      // web2-56 — 접합 모서리의 정점은 이동표(j56)가 옮긴다: 그 모서리의 사각이 곧
      // 캡(마이터/버트 면)이 되고, 이웃 사각(위·아래 변)은 같은 정점을 나눠 따라 늘어나
      // 틈이 없다. 접합이 없거나 끊긴 모서리는 이동이 0이라 55 그대로다.
      const { quads, n } = borderQuads(f)
      if (quads.length > 0) {
        const pos = new Float32Array(quads.length * 6 * 3)
        let bx = 0, by = 0, bz = 0, k = 0
        const put = (P: { x: number; y: number; z: number }) => {
          pos[k * 3] = P.x; pos[k * 3 + 1] = P.y; pos[k * 3 + 2] = P.z
          bx += P.x; by += P.y; bz += P.z; k++
        }
        for (const q of quads) {
          const af = j56(q.a, slots.frontW, 'f'), bf = j56(q.b, slots.frontW, 'f')
          const ab = j56(q.a, slots.backW, 'b'), bb = j56(q.b, slots.backW, 'b')
          put(af); put(bf); put(bb)
          put(af); put(bb); put(ab)
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        const mesh = new THREE.Mesh(g, matOf55())
        mesh.userData.painted = isPainted
        mesh.userData.centroid = { x: bx / k, y: by / k, z: bz / k }
        mesh.userData.faceId = f.id
        mesh.userData.slot55 = 'e'
        r.faceGroup.add(mesh)
      }
    }
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
 *  화면의 것이라서다 — 그것이 곧 ⚑의 「무늬가 면 위에서 미끄러진다」다).
 *  ⚠ web2-50: **면 고정 판은 이제 여기가 아니라 면 텍스처에 산다**(지시 「면 고정 판만
 *  텍스처로 옮긴다」 — syncPaintTex). 화면 고정 판은 한 줄도 안 바뀌었다. */
function syncHatch(r: R3D, app: App) {
  const filled = hatchMode === 'face' ? [] : app.doc.faces.filter(f => f.fill === 1)
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

// ── 재료 표현(web2-49) — 면 고정 실치수 무늬 ─────────────────────────────────
// 무늬는 **문서의 함수**다(면 기하 × 재료 × 축척 × 시드) — 시점이 키에 없다.
// 시점이 하는 일은 둘뿐이고 매 프레임 gateRep이 한다: 쪽(48-5)과 밀도 하한(LOD).
let repKey = ''
const repMats: Record<'major' | 'minor', THREE.LineBasicMaterial> = {
  major: new THREE.LineBasicMaterial({
    color: new THREE.Color('#6f6a63'), transparent: true, opacity: C.REP_ALPHA_MAJOR,
    depthTest: false, depthWrite: false,
  }),
  minor: new THREE.LineBasicMaterial({
    color: new THREE.Color('#6f6a63'), transparent: true, opacity: C.REP_ALPHA_MINOR,
    depthTest: false, depthWrite: false,
  }),
}

// web2-52 마감 — 옛 GL 선분 겹(syncRep·gateRep·repLs)을 걷었다(A-4: mats52·rep49
// 게이트가 초록이 된 뒤). 무늬는 면 텍스처(bakeFaceTex의 rep 단계)가 정본이다.
// repGroup은 빈 그룹으로 남는다(diag.rep49().children — 이식 기록의 «빈 배열» 문면 유지).

// ── 면 텍스처(web2-50) — 칠은 텍스처에 그리고, 텍스처를 입은 면이 3D에 놓인다 ───────
//
// 정본은 획 목록(Stroke.paint.uv)이고 텍스처는 파생이다(core/facetex.ts — 원칙 b).
// 굽는 때: ① 문서가 바뀌면(syncPaintTex — docVersion) ② 해상도 단계가 바뀌면
// (gatePaintTex — 화면 투영 크기의 2^n 양자화 · 단계가 같으면 줌이 움직여도 안 굽는다).
// 쪽(48-5)은 매 프레임 gatePaintTex가 visible로 켜고 끈다(gateRep과 같은 자리·같은 술어).
//
// 메시의 형태: 면의 삼각분할(rf.tris — **개구부가 이미 빠져 있다**: 증상 ⑤의 절단이
// 구성에서 나온다) + uv 속성. 재질은 곱하기(MultiplyBlending) — 흰 텍셀이 항등.
// 면 고정 해칭(45의 둘째 판)은 같은 텍스처의 바닥에 깔린다(52-4의 차례를 지금부터).

interface PaintTexEntry {
  canvas: HTMLCanvasElement
  tex: THREE.CanvasTexture
  mesh: THREE.Mesh
  box: UvBox
  faceId: number
  /** ±1 = 칠의 쪽(카메라가 그 쪽일 때만 보임) · 0 = 해칭 전용(양쪽 — 평면 위 무늬는
   *  뒤에서 봐도 같은 세계 자리다 — 옛 LineSegments와 같은 거동) */
  side: 1 | -1 | 0 | 'e'
  level: number
  /** web2-59 — 미리보기 «전»의 굽힌 판(사본). 미리보기 획이 이 텍스처에 얹히는 동안만
   *  산다: 이동마다 base → canvas로 되돌리고 그 위에 draft를 덧그린다(누적 ⛔). 재굽기
   *  (단계·계열)가 canvas를 새로 쓰면 함께 버린다(#100 — 기준 상태는 하나). */
  base: HTMLCanvasElement | null
  /** web2-52 — 마지막 굽기의 무늬 계열 보임(major<<1|minor). 줌이 단계 경계를 안 넘어도
   *  밀도 하한(REP_MIN_PX)이 계열을 갈랐으면 다시 굽는다(49 gateRep의 매 프레임 판정을
   *  굽기 세계로 옮긴 것). */
  famBits: number
}
let paintTexes = new Map<string, PaintTexEntry>()
let paintKey = ''

/** 이 (면, 쪽)의 칠 획들 — 굽기 입력. 차례는 문서 차례(그린 차례 = 쌓인 차례)다. */
function paintStrokesOf(app: App, faceId: number, side: 1 | -1): Stroke[] {
  return app.doc.strokes.filter(s =>
    s.paint !== undefined && s.paint.f === faceId && s.paint.s === side &&
    s.paint.uv !== undefined && s.paint.uv.length >= 4)
}

/** 테두리 슬롯(web2-55)의 칠 획들 — e=1 · uv=(s,u) 세계 단위. */
function borderStrokesOf(app: App, faceId: number): Stroke[] {
  return app.doc.strokes.filter(s =>
    s.paint !== undefined && s.paint.f === faceId && s.paint.e === 1 &&
    s.paint.uv !== undefined && s.paint.uv.length >= 4)
}

/** web2-59 — 미리보기 획이 «확정 획이 하나도 없는 (면,쪽)»에 얹히면 그 텍스처가 서야 한다.
 *  열쇠에는 **그런 자리만** 넣는다(확정 획이 있는 자리는 열쇠가 안 바뀌어 메시가 안 흔들린다). */
function draftOnlyTargets(app: App): string {
  const d = app.paintDraft
  if (!d || d.length === 0) return ''
  const have = new Set<string>()
  for (const s of app.doc.strokes) {
    if (s.paint?.uv === undefined || s.paint.uv.length < 4) continue
    have.add(s.paint.e === 1 ? `${s.paint.f}:e` : `${s.paint.f}:${s.paint.s}`)
  }
  const out: string[] = []
  for (const s of d) {
    if (s.paint?.uv === undefined || s.paint.uv.length < 4) continue
    const k = s.paint.e === 1 ? `${s.paint.f}:e` : `${s.paint.f}:${s.paint.s}`
    if (!have.has(k)) out.push(k)
  }
  return out.sort().join(',')
}

function syncPaintTex(r: R3D, app: App) {
  const key = `${app.docVersion}|${getHatchMode()}|${draftOnlyTargets(app)}`
  if (key === paintKey) return
  paintKey = key
  for (const e of paintTexes.values()) {
    r.paintGroup.remove(e.mesh)
    e.mesh.geometry.dispose()
    ;(e.mesh.material as THREE.Material).dispose()
    e.tex.dispose()
  }
  paintTexes = new Map()
  // 어느 (면, 쪽)에 텍스처가 서는가 — ① 칠 획이 있는 쪽 ② 면 고정 해칭(fill=1 ·
  // hatchMode 'face')은 칠이 있으면 그 쪽 텍스처들에 깔리고, 칠이 없으면 쪽 0 하나.
  const hatchFaceMode = getHatchMode() === 'face'
  const wants = new Map<string, { faceId: number; side: 1 | -1 | 0 | 'e' }>()
  for (const s of [...app.doc.strokes, ...(app.paintDraft ?? [])]) {
    if (s.paint?.uv === undefined || s.paint.uv.length < 4) continue
    if (s.paint.s !== 1 && s.paint.s !== -1) continue
    wants.set(`${s.paint.f}:${s.paint.s}`, { faceId: s.paint.f, side: s.paint.s })
  }
  if (hatchFaceMode) {
    for (const f of app.doc.faces) {
      if (f.fill !== 1) continue
      if (!wants.has(`${f.id}:1`) && !wants.has(`${f.id}:-1`)) {
        wants.set(`${f.id}:0`, { faceId: f.id, side: 0 })
      }
    }
  }
  // web2-52 — 재료 무늬가 붙은 면: 그 쪽의 텍스처가 서야 무늬가 구워진다(칠 유무 무관).
  // 쪽 규약은 49 그대로(rep.s — 보고 있던 쪽에 붙는다). 반대쪽 칠과는 다른 항목이라 공존.
  for (const f of app.doc.faces) {
    if (f.rep === undefined || !isMatRepId(f.rep.m)) continue
    if (f.rep.s !== 1 && f.rep.s !== -1) continue
    wants.set(`${f.id}:${f.rep.s}`, { faceId: f.id, side: f.rep.s })
  }
  // web2-55 — 테두리 슬롯: 띠에 칠 획이 있으면 그 면의 e 텍스처가 선다(두께가 있어야 몸이 있다)
  for (const st of [...app.doc.strokes, ...(app.paintDraft ?? [])]) {
    if (st.paint?.e !== 1 || st.paint.uv === undefined || st.paint.uv.length < 4) continue
    wants.set(`${st.paint.f}:e`, { faceId: st.paint.f, side: 'e' })
  }
  for (const w of wants.values()) {
    const rf = app.faces.find(x => x.id === w.faceId)
    if (!rf || rf.tris.length < 3) continue               // 못 풀린 면 — 칠도 쉰다(면의 규약)
    // web2-55 — 두께: 앞/뒤 텍스처는 그 표면으로 오프셋되고, 'e'는 띠 위에 선다.
    const slots = faceSlotsOf(app, rf)
    // web2-56 — 접합 이동(칠 텍스처 판): 면 메시와 같은 정점 이동을 얹어야 두 겹이
    // 겹친다(안 얹으면 접합 모서리에서 칠막이 몸 밖에 뜬다). UV는 중심선의 자(s·면 평면
    // 좌표) 그대로다 — 칠의 «자리»는 접합이 옮기지 않는다(«칠이 살아 있다» 게이트).
    const jsh56 = slots ? app.joints?.shifts.get(rf.id) : undefined
    const j56 = (v: V3, off: number, slot: 'f' | 'b'): V3 => {
      const base = off !== 0 ? add3(v, mul3(norm3(rf.normal), off)) : v
      const sh = jsh56?.get(vkey(v))
      return sh ? add3(base, sh[slot]) : base
    }
    if (w.side === 'e') {
      if (!slots) continue                                // t=0 — 띠가 없다(칠은 대기)
      const { quads, n: bn, total } = borderQuads(rf)
      if (quads.length === 0 || total <= 0) continue
      const box: UvBox = {
        basis: { origin: rf.outer[0]!, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 } },
        u0: 0, u1: total, v0: 0, v1: slots.frontW - slots.backW,
      } as UvBox
      const pos = new Float32Array(quads.length * 6 * 3)
      const uvA = new Float32Array(quads.length * 6 * 2)
      let cx = 0, cy = 0, cz = 0, k = 0
      const tW = slots.frontW - slots.backW
      const put = (P: { x: number; y: number; z: number }, sVal: number, uVal: number) => {
        pos[k * 3] = P.x; pos[k * 3 + 1] = P.y; pos[k * 3 + 2] = P.z
        uvA[k * 2] = sVal / total
        uvA[k * 2 + 1] = uVal / Math.max(1e-9, tW)
        cx += P.x; cy += P.y; cz += P.z; k++
      }
      for (const q of quads) {
        const af = j56(q.a, slots.frontW, 'f'), bf = j56(q.b, slots.frontW, 'f')
        const ab = j56(q.a, slots.backW, 'b'), bb = j56(q.b, slots.backW, 'b')
        put(af, q.s0, tW); put(bf, q.s0 + q.len, tW); put(bb, q.s0 + q.len, 0)
        put(af, q.s0, tW); put(bb, q.s0 + q.len, 0); put(ab, q.s0, 0)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2))
      const canvas = document.createElement('canvas')
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      const mat = new THREE.MeshBasicMaterial({
        map: tex, premultipliedAlpha: true,
        blending: paintBlendNormalForTest ? THREE.NormalBlending : THREE.MultiplyBlending,
        transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(g, mat)
      mesh.userData.faceId = w.faceId
      mesh.userData.centroid = { x: cx / k, y: cy / k, z: cz / k }
      r.paintGroup.add(mesh)
      paintTexes.set(`${w.faceId}:e`, {
        canvas, tex, mesh, box, faceId: w.faceId, side: 'e', level: 0, base: null, famBits: -1,
      })
      continue
    }
    const off55 = slots ? (w.side === -1 ? slots.backW : w.side === 1 ? slots.frontW : 0) : 0
    const slot56: 'f' | 'b' | null = slots ? (w.side === -1 ? 'b' : w.side === 1 ? 'f' : null) : null
    const box = uvBoxOf(rf)
    const pos = new Float32Array(rf.tris.length * 3)
    const uv = new Float32Array(rf.tris.length * 2)
    const su = Math.max(1e-9, box.u1 - box.u0), sv = Math.max(1e-9, box.v1 - box.v0)
    let cx = 0, cy = 0, cz = 0
    rf.tris.forEach((p, i) => {
      const q = slot56 ? j56(p, off55, slot56) : p
      pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z
      cx += q.x; cy += q.y; cz += q.z
      const dx = p.x - box.basis.origin.x, dy = p.y - box.basis.origin.y, dz = p.z - box.basis.origin.z
      const uu = dx * box.basis.u.x + dy * box.basis.u.y + dz * box.basis.u.z
      const vv = dx * box.basis.v.x + dy * box.basis.v.y + dz * box.basis.v.z
      uv[i * 2] = (uu - box.u0) / su
      uv[i * 2 + 1] = (vv - box.v0) / sv
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const canvas = document.createElement('canvas')     // 화면 밖 — DOM에 안 붙는다(#97)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    // ⚠⚠ three r185: MultiplyBlending은 **premultipliedAlpha: true를 요구한다** — 없으면
    // WebGLState가 blend 상태를 안 세팅하고 조용히 over로 그려진다(콘솔 error 한 줄뿐).
    // 실측으로 잡았다: 곱/보통 스위치가 픽셀에 안 실렸고 벽 패치가 두 모드 다 순백이었다.
    // premultiplied 규약의 곱은 blendFuncSeparate(DST_COLOR, 1-SRC_A, ZERO, ONE) —
    // 불투명 텍셀(a=1)에서 정확히 dst×src이고 알파는 dst 그대로다.
    const mat = new THREE.MeshBasicMaterial({
      map: tex, premultipliedAlpha: true,
      blending: paintBlendNormalForTest ? THREE.NormalBlending : THREE.MultiplyBlending,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(g, mat)
    mesh.userData.faceId = w.faceId
    mesh.userData.centroid = { x: cx / rf.tris.length, y: cy / rf.tris.length, z: cz / rf.tris.length }
    r.paintGroup.add(mesh)
    paintTexes.set(`${w.faceId}:${w.side}`, {
      canvas, tex, mesh, box, faceId: w.faceId, side: w.side, level: 0, base: null, famBits: -1,
    })
  }
}

/** 시점의 몫 — 매 프레임: ① 쪽(48-5) ② 해상도 단계(투영 크기 → 2^n · 바뀌면 재굽기).
 *  판정 내역을 userData.gate에 남긴다(rep의 규약 — 같은 계산의 기록 · #54). */
function gatePaintTex(r: R3D, app: App) {
  if (paintTexes.size === 0) return
  const vs = viewScale(app)
  const dpr = r.renderer.getPixelRatio()
  const hatchFaceMode = getHatchMode() === 'face'
  for (const e of paintTexes.values()) {
    const rf = app.faces.find(x => x.id === e.faceId)
    const face = app.doc.faces.find(f => f.id === e.faceId)
    if (!rf) { e.mesh.visible = false; continue }
    const sideOk = e.side === 0 || e.side === 'e' ? true : paintSideAt(rf, app.pose) === e.side
    // 투영 크기 — 외곽 정점의 화면 bbox(문서 px) × 줌 × dpr. 사영 안 되는 정점은 뺀다.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0
    for (const P of rf.outer) {
      const q = project(app.lift.an, app.pose, P)
      if (!q) continue
      n++
      if (q.x < x0) x0 = q.x
      if (q.y < y0) y0 = q.y
      if (q.x > x1) x1 = q.x
      if (q.y > y1) y1 = q.y
    }
    const screenPx = n >= 2 ? Math.max(x1 - x0, y1 - y0) * vs * dpr : C.FACETEX_MIN_PX
    const lv = texLevel(screenPx)
    // web2-52 — 이 (면, 쪽)의 재료 몫: 쪽이 rep.s와 같을 때만 굽는다(49의 쪽 규약).
    // px/mm은 49 gateRep의 그 자(면 중심에서 0.01 세계단위의 투영)를 그대로 쓴다(#54).
    let rep: RepBake | null = null
    let famBits = -1
    const mm = app.lift.mmPerUnit
    if (e.side !== 'e' && face?.rep && isMatRepId(face.rep.m) && mm && mm > 0 &&
        (e.side === 0 ? true : face.rep.s === e.side)) {
      const c = e.mesh.userData.centroid as { x: number; y: number; z: number }
      const u = repBasis(rf).u
      const p0 = project(app.lift.an, app.pose, c)
      const p1 = project(app.lift.an, app.pose, {
        x: c.x + u.x * 0.01, y: c.y + u.y * 0.01, z: c.z + u.z * 0.01,
      })
      const pxPerMm = p0 && p1 ? (Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.01 * vs) / mm : null
      rep = { m: face.rep.m, seed: face.id, mm, pxPerMm, texelPerPx: lv / Math.max(1, screenPx) }
      if (isRepId(face.rep.m)) {
        // 계열 보임이 갈리면 같은 단계라도 다시 굽는다 — famBits가 굽기 열쇠의 일부다
        const probe = repSegments(rf, face.rep.m, mm, face.id)
        const fams = repVisibleFamilies(probe.majorStepMm, probe.minorStepMm, pxPerMm ?? 0)
        famBits = (fams.major ? 2 : 0) | (fams.minor ? 1 : 0)
      } else famBits = 4                                   // 단색(유리·금속) — 계열 없음
    }
    if (lv !== e.level || famBits !== e.famBits) {
      // web2-55 — 테두리('e')는 띠의 몸만 굽는다: 해칭·무늬는 면의 것이라 띠에 없다.
      const hatch = e.side !== 'e' && hatchFaceMode && face?.fill === 1 && face
        ? { face, spacingWorld: faceHatchSpacingWorld(app.lift.an, rf, hatchSpecOf(face).spacingPx) } : null
      const strokes = e.side === 'e' ? borderStrokesOf(app, e.faceId)
        : e.side === 0 ? [] : paintStrokesOf(app, e.faceId, e.side)
      bakeFaceTex(e.canvas, rf, e.box, lv, strokes, e.side === 0 ? 1 : e.side, hatch, e.side === 'e' ? null : rep)
      e.tex.needsUpdate = true
      e.level = lv
      e.famBits = famBits
      e.base = null                                  // 기준 상태가 새로 섰다(59 — 미리보기 사본 폐기)
    }
    e.mesh.visible = sideOk
    // screenPx(양자화 «전» 값)와 포화 여부를 기록한다(2차 [8] — 상한 포화와 «비슷한
    // 크기»를 팔이 가르는 재료. 같은 계산의 기록이지 두 벌 계산이 아니다 #54).
    e.mesh.userData.gate = { side: sideOk, level: e.level, screenPx: Math.round(screenPx), clamped: screenPx > C.FACETEX_MAX_PX }
  }
}

/** **미리보기 획을 텍스처에**(web2-59 59-1 — 원칙 d). 매 프레임 gatePaintTex 뒤:
 *  · draft가 얹히는 항목마다 — base가 없으면 지금 canvas(확정 굽기)를 사본으로 뜨고,
 *    canvas ← base, 그 위에 draft 획을 **같은 함수·같은 해상도**로 덧그린다.
 *  · draft가 떠난 항목(뗌·다른 면) — canvas ← base, base 폐기.
 *  비용은 이동마다 «사본 복사 + 획 하나 + 텍스처 업로드»다(paint59 ⑥이 값으로 든다).
 *  ⚠ 상한 포화(gate.clamped)는 여기서 읽는다 — «조용히 뭉개지 마라»의 알림은 main이 낸다. */
let draftClampedNow = false
let draftAppliedNow = 0
function applyPaintDraft(r: R3D, app: App) {
  const d = app.paintDraft
  draftClampedNow = false
  draftAppliedNow = 0
  for (const e of paintTexes.values()) {
    const mine = d ? d.filter(s => s.paint !== undefined && s.paint.f === e.faceId &&
      (e.side === 'e' ? s.paint.e === 1 : s.paint.e === undefined && s.paint.s === e.side)) : []
    if (mine.length === 0) {
      if (e.base) {
        const g = e.canvas.getContext('2d')!
        g.setTransform(1, 0, 0, 1, 0, 0)
        g.globalCompositeOperation = 'source-over'
        g.globalAlpha = 1
        g.drawImage(e.base, 0, 0)
        e.base = null
        e.tex.needsUpdate = true
      }
      continue
    }
    const rf = app.faces.find(x => x.id === e.faceId)
    if (!rf || e.level === 0) continue
    if (!e.base) {
      const b = document.createElement('canvas')
      b.width = e.canvas.width; b.height = e.canvas.height
      b.getContext('2d')!.drawImage(e.canvas, 0, 0)
      e.base = b
    }
    const g = e.canvas.getContext('2d')!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.drawImage(e.base, 0, 0)
    draftAppliedNow += drawDraftOnTex(e.canvas, rf, e.box, e.level, mine, e.side === 0 ? 1 : e.side)
    e.tex.needsUpdate = true
    const gate = e.mesh.userData.gate as { clamped?: boolean } | undefined
    if (gate?.clamped) draftClampedNow = true
  }
}
/** 지금 프레임의 미리보기가 상한 포화 텍스처에 얹혔는가 — 알림(main)의 판정자 */
export const paintDraftClamped = (): boolean => draftClampedNow
/** 진단·팔 — 미리보기 상태(사본을 든 항목 수 · 이번 프레임에 덧그린 획 수 · 포화) */
export function paintDraftStats(): { withBase: number; applied: number; clamped: boolean; baseBytes: number } {
  let withBase = 0, baseBytes = 0
  for (const e of paintTexes.values()) if (e.base) { withBase++; baseBytes += e.base.width * e.base.height * 4 }
  return { withBase, applied: draftAppliedNow, clamped: draftClampedNow, baseBytes }
}

/** **반증 스위치**(D-3 · #30) — 곱 합성을 보통(over) 합성으로 되돌린다. 켜면 흰 바탕
 *  텍셀이 아래를 덮어 증상 ①(흰 뜸)·②(블렌드 불가)가 **되살아나야 한다** — e2e가
 *  같은 실행에서 밝기 증가를 실제로 내는 데 쓴다. 제품 경로는 안 부른다. */
let paintBlendNormalForTest = false
export function setPaintBlendForTest(v: boolean) {
  paintBlendNormalForTest = v
  for (const e of paintTexes.values()) {
    const m = e.mesh.material as THREE.MeshBasicMaterial
    m.blending = v ? THREE.NormalBlending : THREE.MultiplyBlending
    m.needsUpdate = true
  }
}

/** 진단·팔용 — 지금 서 있는 텍스처들의 요약(자리·단계·양자화 전 크기·포화·합성). */
export function paintTexStats(): { key: string; faceId: number; side: number | string; level: number; gateSide: boolean | null; w: number; h: number; visible: boolean; blending: number; screenPx: number | null; clamped: boolean; famBits: number }[] {
  const out: ReturnType<typeof paintTexStats> = []
  for (const [k, e] of paintTexes) {
    const gate = e.mesh.userData.gate as { side?: boolean; screenPx?: number; clamped?: boolean } | undefined
    out.push({
      key: k, faceId: e.faceId, side: e.side, level: e.level, gateSide: gate?.side ?? null,
      w: e.canvas.width, h: e.canvas.height, visible: e.mesh.visible,
      blending: (e.mesh.material as THREE.MeshBasicMaterial).blending,
      screenPx: gate?.screenPx ?? null, clamped: gate?.clamped ?? false,
      // web2-52 — 무늬 계열 보임(major<<1|minor · 4=단색 · -1=재료 없음): LOD 판정의 기록
      famBits: e.famBits,
    })
  }
  return out
}

/** 파생 증명 팔용(web2-50 게이트) — 두 단계로 가른다(오염이 **화면에 실제로 보인 뒤**
 *  재굽기가 지우는 것을 재야 반증이 선다 — D-3):
 *  ① corrupt — 텍스처에 검은 사각을 찍는다(단계는 그대로 → 재굽기가 안 돈다 · 오염이 보인다)
 *  ② rebake — 단계를 0으로 → 다음 프레임 gate가 정본(획 목록)에서 다시 굽는다.
 *  제품 경로는 어느 쪽도 안 부른다. */
export function corruptPaintTexForTest(): number {
  let n = 0
  for (const e of paintTexes.values()) {
    const g = e.canvas.getContext('2d')!
    g.fillStyle = '#000000'
    g.fillRect(0, 0, Math.max(8, e.canvas.width >> 2), Math.max(8, e.canvas.height >> 2))
    e.tex.needsUpdate = true
    n++
  }
  return n
}
export function rebakePaintTexForTest(): void {
  for (const e of paintTexes.values()) e.level = 0
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
  // ⚠ web2-50 이전에는 «면이 둘부터»였다 — 칠 텍스처가 오면서 면 «하나»여도 층
  // (면 0 · 해칭/무늬 +1 · 칠 +2)이 서야 한다. 이르게 돌아가면 전부 renderOrder 0이라
  // 곱 합성이 무늬 «아래»에 깔려 픽셀에 안 실린다(paint50 반증 팔이 실제로 잡았다).
  if (kids.length === 0) return
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
  for (const h of r.repGroup.children) {  // 재료 표현(49) — 해칭과 같은 자리(제 면 위)
    const fid = (h.userData as { faceId?: number }).faceId
    h.renderOrder = (fid !== undefined ? orderOf.get(fid) ?? -1000 : -1000) + 1
  }
  for (const h of r.paintGroup.children) { // 면 텍스처(50) — 무늬 위·선 아래(52-4의 차례)
    const fid = (h.userData as { faceId?: number }).faceId
    h.renderOrder = (fid !== undefined ? orderOf.get(fid) ?? -1000 : -1000) + 2
  }
}

/** **면이 지금 드러나는가**(web2-48 48-9) — 「도구가 대상을 비춘다」.
 *  ⚠ **갈래를 여기 적어 둔다**: 지시는 「칠하는 도구를 들었을 때만」인데 **면 도구**도
 *  넣었다. 면 도구의 일이 「탭해서 면을 만들고 없애는 것」이라, 면이 안 보이면 **없애는
 *  쪽이 눈먼 조작**이 된다(있는 면을 못 보고 누른다). 「비추는 도구」의 뜻이 «그 면을
 *  대상으로 삼는 도구»이므로 둘 다 같은 무리다 — 단순한 쪽으로 갔고 갈래였음을 남긴다. */
export const facesRevealed = (app: Pick<App, 'tool'>): boolean =>
  app.tool === 'paint' || app.tool === 'face'

/** 칠 안 한 면의 표시를 도구에 맞춘다(48-9). 칠한 면은 늘 보인다 — 그림이기 때문이다.
 *  ⚠ web2-52 — **재료가 깔린 면도 늘 보인다**(재료는 도면의 것 — 같은 이유). 곱 합성은
 *  밑이 없으면 0이라, 면 메시가 숨으면 무늬 텍스처가 «visible인데 안 보이는» 상태가 된다
 *  (D-2 재현: 연필 도구에서 벽 상자 안료가 rep 전후 정확히 같았다 — 49 무회귀의 그 자리). */
function revealFaces(r: R3D, app: App) {
  const on = facesRevealed(app)
  for (const k of r.faceGroup.children) {
    const fid = (k.userData as { faceId?: number }).faceId
    const hasRep = fid !== undefined && app.doc.faces.find(f => f.id === fid)?.rep !== undefined
    k.visible = (k.userData as { painted?: boolean }).painted === true || hasRep || on
  }
}

export function render3d(r: R3D, app: App) {
  syncCamera(r, app)
  syncHatch(r, app)
  syncPaintTex(r, app) // 면 텍스처(50) — 문서가 바뀌었을 때만 메시를 다시 세운다
  gatePaintTex(r, app) // 시점의 몫 — 쪽 · 해상도 단계(단계가 바뀔 때만 굽는다)
  applyPaintDraft(r, app) // 미리보기 획(59-1) — 굽힌 판 위에 같은 함수로 덧그린다
  revealFaces(r, app)
  sortFaces(r, app)
  r.renderer.render(r.scene, r.camera)
}
