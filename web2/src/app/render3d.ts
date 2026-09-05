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
import { uvBoxOf, texLevel, bakeFaceTex, drawDraftOnTex, appendMarkOnTex, draftFeedOnTex, draftFinishOnTex, draftCancelOnTex, draftSupported, rebuildStrokesOnTex, type UvBox, type RepBake } from '../core/facetex'
import { paintLayerAlive, releasePaintLayer, type MarkBox } from '../core/paintseam'
import { faceHatchSpacingWorld } from '../core/hatch'
import type { Grade, Stroke, Face } from '../core/types'
import type { ResolvedFace } from '../core/face'

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
  // ── web2-65 — «언제 굽는가»의 상태(굽는 «방법»은 한 줄도 안 바뀐다) ──────────────
  /** 이 텍스처가 **구워 든** 확정 획의 서명(차례 = 굽힌 차례). 다음 목록이 이것의 앞자리
   *  그대로 + 뒤에 더면 «새 것만 얹는다»(누적). 아니면 전량 재굽기다. */
  sigs: string[]
  /** 굽기 **조건**의 서명(단계·계열·해칭·재료·uv 상자). 갈리면 전량 재굽기다.
   *  ⚠ 여기 안 든 것이 굽기를 바꾸면 «낡은 그림»이 남는다 — 게이트 ⑤가 전수로 지킨다. */
  bakeSig: string
  /** 마지막으로 획 목록을 읽은 문서 열쇠(paintKey). 같으면 다시 안 읽는다 — 매 프레임 O(N) 금지 */
  docKey: string
  /** 획 **없는** 바탕(흰 + 재료 + 해칭)의 사본. 누적 얹기가 더티 사각을 여기서 되깐다.
   *  없으면 누적을 못 한다(전량 재굽기로 떨어진다). */
  bg: HTMLCanvasElement | null
  /** ⑤ LRU — 마지막으로 «보인» 프레임 눈금 */
  tick: number
  /** ⑤ 상한에서 버려진 상태(캔버스 0 · 층 놓음). 다시 «보이면» 그때 다시 굽는다 */
  evicted: boolean
}
let paintTexes = new Map<string, PaintTexEntry>()
let paintKey = ''

// ── web2-65 굽기 계수기(D-1 표식) — «언제 몇 획을 다시 굽는가»를 값으로 낸다 ───────────
// 왜 여기인가: 지시 65의 진단이 「N번째 획 = N개 재굽기」이고, 그 주장은 **재굽힌 획 수**로만
// 확인·반증된다(수리 전 판 = pre 원장 · 게이트 ③이 같은 자를 쓴다). 시간(ms)은 기기마다
// 다르므로 «획 수»가 정본이고 ms는 곁값이다(#12 — 동작점 하나로 주장하지 않는다).
export interface PaintBakeStat {
  /** 전량 재굽기 횟수(bakeFaceTex 호출) */ bakes: number
  /** 그 재굽기들이 다시 그린 획의 합 */ bakedStrokes: number
  /** 누적 얹기(65) 횟수 — 수리 전에는 0이다 */ appends: number
  /** 얹기로 그린 획 수 */ appendStrokes: number
  /** web2-66 — 커밋이 초안 세션의 층을 «넘겨받은» 획 수(다시 안 그렸다 — 게이트 ⑤의 짝) */ handoverStrokes: number
  /** 텍스처 업로드 횟수 */ uploads: number
  /** 텍스처 업로드 바이트(전량 = w·h·4 · 부분 = 더티 사각) */ uploadBytes: number
  /** 굽기·얹기에 든 시간(ms — 곁값) */ ms: number
  /** 항목(메시·기하·재질·텍스처)을 버린 횟수 */ drops: number
  /** 항목의 기하를 다시 세운 횟수 */ rebuilds: number
  /** syncPaintTex가 실제로 일한 횟수(열쇠가 갈린 프레임) */ syncs: number
  /** ⑤ 상한에서 «안 보이는 면»을 버린 횟수 */ evicts: number
  /** 캔버스 크기가 바뀌어 GPU 텍스처를 다시 할당시킨 횟수(아래 ⚠⚠ — 0이면 옛 그림이 늘어난다) */ texReallocs: number
}
const zeroBakeStat = (): PaintBakeStat => ({
  bakes: 0, bakedStrokes: 0, appends: 0, appendStrokes: 0, handoverStrokes: 0,
  uploads: 0, uploadBytes: 0, ms: 0, drops: 0, rebuilds: 0, syncs: 0, evicts: 0, texReallocs: 0,
})
let bakeStat: PaintBakeStat = zeroBakeStat()
export function paintBakeStats(): PaintBakeStat & { entries: number; bytes: number; budget: number; accum: boolean; partial: boolean } {
  return {
    ...bakeStat, ms: Math.round(bakeStat.ms * 100) / 100, entries: paintTexes.size,
    bytes: paintTexBytes(), budget: texBudget, accum: !paintAccumOff, partial: !paintPartialOff,
  }
}
export function resetPaintBakeStats(): void { bakeStat = zeroBakeStat() }

// ── web2-65 ⑥ 반증 스위치(D-3 · e2e 전용 — 제품 경로는 안 부른다) ────────────────────
/** 누적을 끈다 → pre의 O(N)이 돌아온다(재굽힌 «획 수»가 그 반증의 값이다) */
let paintAccumOff = false
export function setPaintAccumOffForTest(v: boolean): void {
  paintAccumOff = v
  for (const e of paintTexes.values()) { e.bakeSig = ''; e.level = 0; if (v) e.bg = null; draftCancelOnTex(e.canvas) }
  draftRecs.clear()                              // web2-66 — bg 없이는 세션도 없다(옛 전량 판으로)
}
export const paintAccumOffForTest = (): boolean => paintAccumOff
/** 부분 업로드를 끈다 → 업로드 바이트가 전량으로 돌아간다(픽셀은 같아야 한다 — ④의 반증) */
let paintPartialOff = false
export function setPaintPartialOffForTest(v: boolean): void { paintPartialOff = v }

// ── web2-66 §1 ㉠ — 초안 «얼리기»의 장부와 반증 스위치 ─────────────────────────────────
/** 캔버스별 초안 장부 — 세션이 층에 «완결»로 담은 초안 획들(차례)과 지금 열린 획의 id.
 *  커밋 인계(gatePaintTex)가 이 장부로 «이미 층에 있는 획»을 다시 안 그린다. */
interface DraftRec { done: { id: number; sig: string }[]; openId: number | null }
const draftRecs = new Map<HTMLCanvasElement, DraftRec>()
/** 게이트 ①의 반증(D-3) — 얼리기를 끄면 옛 전량 되그리기 판으로: pre의 이동량이 돌아온다 */
let paintFreezeOff = false
export function setPaintFreezeOffForTest(v: boolean): void {
  paintFreezeOff = v
  for (const e of paintTexes.values()) draftCancelOnTex(e.canvas)
  draftRecs.clear()
}
export const paintFreezeOffForTest = (): boolean => paintFreezeOff

// ── web2-65 ⑤ 메모리 상한과 LRU ──────────────────────────────────────────────────
let texBudget = C.PAINT65_TEX_BUDGET_BYTES
let paintTick = 0
/** 팔 전용 — 상한을 낮춰 축출을 «실제로» 일으킨다(게이트 ⑦) */
export function setPaintTexBudgetForTest(bytes: number): void { texBudget = bytes }
/** 지금 서 있는 칠 텍스처 캔버스의 바이트(표시 캔버스 + 바탕 사본) */
function paintTexBytes(): number {
  let n = 0
  for (const e of paintTexes.values()) {
    n += e.canvas.width * e.canvas.height * 4
    if (e.bg) n += e.bg.width * e.bg.height * 4
  }
  return n
}

// ── web2-65 — 획 하나의 서명(굽기에 드는 것 전부). 값을 «비트»로 센다: 반올림하면 작은
// 편집이 서명에 안 남아 낡은 그림이 산다. 문서가 갈릴 때만 돈다(매 프레임 아니다).
const SIG_F64 = new Float64Array(1)
const SIG_I32 = new Int32Array(SIG_F64.buffer)
function sigHashNum(h: number, v: number): number {
  SIG_F64[0] = v
  h = (Math.imul(h, 0x01000193) ^ SIG_I32[0]!) | 0
  return (Math.imul(h, 0x01000193) ^ SIG_I32[1]!) | 0
}
function sigOfPaintStroke(s: Stroke): string {
  const p = s.paint!
  const uv = p.uv!
  let h = 0x811c9dc5 | 0
  for (let i = 0; i < uv.length; i++) h = sigHashNum(h, uv[i]!)
  if (p.press) for (let i = 0; i < p.press.length; i++) h = sigHashNum(h, p.press[i]!)
  return `${s.id}.${h}.${uv.length}.${p.press?.length ?? -1}.${p.w ?? ''}.${p.c ?? ''}.${p.o ?? ''}.${p.br ?? ''}.${p.i ?? ''}.${s.mat?.grade ?? ''}`
}
/** a가 b의 «앞자리 그대로»인가(누적의 전제 — 앞을 고쳤으면 전량이다) */
function sigsArePrefix(a: string[], b: string[]): boolean {
  if (a.length > b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
const boxSig = (b: UvBox): string =>
  `${b.u0},${b.u1},${b.v0},${b.v1},${b.basis.origin.x},${b.basis.origin.y},${b.basis.origin.z},${b.basis.u.x},${b.basis.u.y},${b.basis.u.z},${b.basis.v.x},${b.basis.v.y},${b.basis.v.z}`
const sameF32 = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** 항목 하나를 **버린다**(없어진 (면,쪽) · 축출) — 메시·기하·재질·텍스처·층까지 */
function dropPaintTex(r: R3D, e: PaintTexEntry): void {
  r.paintGroup.remove(e.mesh)
  e.mesh.geometry.dispose()
  ;(e.mesh.material as THREE.Material).dispose()
  e.tex.dispose()
  draftCancelOnTex(e.canvas)                     // web2-66 — 초안 세션·장부도 함께 버린다
  draftRecs.delete(e.canvas)
  releasePaintLayer(e.canvas)
  bakeStat.drops++
}

/** web2-65 ② — 항목을 세우거나 **그 자리에서 고친다**. 캔버스·텍스처·구운 상태는 산다.
 *  기하(정점·uv)가 갈리면 속성만 갈아 끼우고, uv 상자가 갈리면 굽기 서명을 지워 전량으로 보낸다. */
function putPaintTex(
  r: R3D, key: string, faceId: number, side: 1 | -1 | 0 | 'e',
  pos: Float32Array, uv: Float32Array, box: UvBox, centroid: { x: number; y: number; z: number },
): void {
  const old = paintTexes.get(key)
  if (old) {
    const g0 = old.mesh.geometry
    const ap = g0.getAttribute('position') as THREE.BufferAttribute
    const au = g0.getAttribute('uv') as THREE.BufferAttribute
    if (!sameF32(ap.array as Float32Array, pos) || !sameF32(au.array as Float32Array, uv)) {
      g0.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g0.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      g0.computeBoundingSphere()
      bakeStat.rebuilds++
    }
    old.mesh.userData.centroid = centroid
    if (boxSig(old.box) !== boxSig(box)) { old.box = box; old.bakeSig = ''; old.level = 0 }
    return
  }
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
  mesh.userData.faceId = faceId
  mesh.userData.centroid = centroid
  r.paintGroup.add(mesh)
  paintTexes.set(key, {
    canvas, tex, mesh, box, faceId, side, level: 0, base: null, famBits: -1,
    sigs: [], bakeSig: '', docKey: '', bg: null, tick: 0, evicted: false,
  })
}

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
  bakeStat.syncs++
  // web2-65 ② — **항목을 폐기하지 않는다.** 여기서 하는 일은 «어느 (면,쪽)이 서는가»와
  // 메시의 «형태»뿐이고, 캔버스·텍스처·구운 획은 그대로 산다. 무엇을 다시 구울지는
  // gatePaintTex가 «그 (면,쪽)의 조건과 획 목록»으로 정한다(#110 — docVersion은 무효화
  // 신호이지 캐시 열쇠가 아니다).
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
  // 없어진 (면, 쪽)만 뺀다 — 남는 것은 아래에서 «그 자리에서» 고친다(putPaintTex).
  // 못 풀린 면(tris < 3)도 여기서 빠진다: 아래 만들기 고리가 그 면을 건너뛰기 때문이다.
  const live = new Set<string>()
  for (const [k, w] of wants) {
    const rf0 = app.faces.find(x => x.id === w.faceId)
    if (rf0 && rf0.tris.length >= 3) live.add(k)
  }
  for (const [k, e] of [...paintTexes]) {
    if (live.has(k)) continue
    dropPaintTex(r, e)
    paintTexes.delete(k)
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
      putPaintTex(r, `${w.faceId}:e`, w.faceId, 'e', pos, uvA, box, { x: cx / k, y: cy / k, z: cz / k })
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
    putPaintTex(r, `${w.faceId}:${w.side}`, w.faceId, w.side, pos, uv, box,
      { x: cx / rf.tris.length, y: cy / rf.tris.length, z: cz / rf.tris.length })
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
    // web2-65 ⑤ — 상한에서 «버려진» 항목은 안 보이는 동안 쉰다(다시 보이면 그때 다시 굽는다)
    if (e.evicted && !sideOk) { e.mesh.visible = false; continue }
    e.evicted = false
    if (sideOk) e.tick = ++paintTick
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
    // web2-55 — 테두리('e')는 띠의 몸만 굽는다: 해칭·무늬는 면의 것이라 띠에 없다.
    const hatch = e.side !== 'e' && hatchFaceMode && face?.fill === 1 && face
      ? { face, spacingWorld: faceHatchSpacingWorld(app.lift.an, rf, hatchSpecOf(face).spacingPx) } : null
    // ── web2-65 ① — 굽기 **조건**의 서명. 이 (면, 쪽)이 «실제로 의존하는 것»만 든다
    // (#110 — 문서 전체의 판 번호가 아니다). 여기 안 든 것이 굽기를 바꾸면 낡은 그림이
    // 남으므로, 새 입력을 굽기에 더하는 라운드는 **이 줄도 같이 고친다**(게이트 ⑤가 지킨다).
    // ⚠ rep의 texelPerPx·pxPerMm은 «줌의 연속값»이라 안 넣는다 — 넣으면 매 프레임 재굽기다.
    //   그 둘의 실제 효과(계열 보임)는 famBits가 들고, 굵기 몫은 종전대로 단계에 붙는다(49 규약).
    const hs = hatch && face ? hatchSpecOf(face) : null
    const bakeSig = `${lv}|${famBits}|`
      + (hatch && hs && face ? `${hs.angleDeg}:${hs.cross ? 1 : 0}:${hatchHexOf(face)}:${hatch.spacingWorld.toFixed(9)}` : '')
      + '|' + (e.side !== 'e' && rep ? `${rep.m}:${rep.seed}:${rep.mm}` : '')
      + '|' + boxSig(e.box)
    if (bakeSig !== e.bakeSig || e.docKey !== paintKey) {
      const strokes = e.side === 'e' ? borderStrokesOf(app, e.faceId)
        : e.side === 0 ? [] : paintStrokesOf(app, e.faceId, e.side)
      const sigs = strokes.map(sigOfPaintStroke)
      e.docKey = paintKey
      // ③ 누적 — 굽기 조건이 그대로이고, 획 목록이 «앞자리 그대로 + 뒤에 더»이고,
      // 바탕 사본과 엔진의 층이 살아 있을 때만. 하나라도 어긋나면 전량 재굽기다.
      const canAppend = !paintAccumOff && bakeSig === e.bakeSig && e.bg !== null
        && e.side !== 0 && sigs.length > e.sigs.length && sigsArePrefix(e.sigs, sigs)
        && paintLayerAlive(e.canvas)
      let done = false
      if (canAppend) {
        // 초안 사본이 얹혀 있으면 확정본으로 되돌리고 버린다(59 — 기준 상태는 하나 · #100)
        if (e.base) {
          const gb = e.canvas.getContext('2d')!
          gb.setTransform(1, 0, 0, 1, 0, 0)
          gb.globalCompositeOperation = 'source-over'
          gb.globalAlpha = 1
          gb.drawImage(e.base, 0, 0)
          e.base = null
        }
        const t0 = performance.now()
        let dirty: MarkBox | null = null
        let ok = true
        // web2-66 — **초안 인계**: 그리는 동안 세션이 층에 담은 획은 다시 안 그린다.
        // 완결된 것(rec.done — 캔버스·GPU까지 이미 올라갔다)은 장부만 지우고, 열린 것은
        // draftFinishOnTex가 펜 떼기까지 완결한다(그 층 상태 = 이 획을 얹은 것과 같다 —
        // 이음매 draftFinish 머리주석). 장부와 커밋이 한 자라도 어긋나면 전량 재굽기다.
        const rec = draftRecs.get(e.canvas)
        let recDone = 0
        for (let i = e.sigs.length; i < strokes.length; i++) {
          const s = strokes[i]!
          let b: MarkBox | null
          if (rec && recDone < rec.done.length) {
            if (rec.done[recDone]!.id === s.id && rec.done[recDone]!.sig === sigs[i]) {
              recDone++
              bakeStat.handoverStrokes++
              continue                                   // 이미 층·캔버스·GPU에 있다(초안 프레임이 올렸다)
            }
            ok = false; break
          } else if (rec && rec.openId !== null) {
            if (rec.openId !== s.id) { ok = false; break }
            b = draftFinishOnTex(e.canvas, e.bg!, rf, e.box, lv, s, e.side as 1 | -1 | 'e')
            if (!b) { ok = false; break }
            rec.openId = null
            bakeStat.handoverStrokes++
          } else {
            b = appendMarkOnTex(e.canvas, e.bg!, rf, e.box, lv, s, e.side as 1 | -1 | 'e')
            if (!b) { ok = false; break }
            bakeStat.appendStrokes++
          }
          if (b.x1 >= b.x0) {
            dirty = dirty ? { x0: Math.min(dirty.x0, b.x0), y0: Math.min(dirty.y0, b.y0), x1: Math.max(dirty.x1, b.x1), y1: Math.max(dirty.y1, b.y1) } : b
          }
        }
        // 장부가 정확히 소진됐어야 한다 — 남으면 커밋 안 된 초안이 층에 있다(전량으로)
        if (ok && rec && (recDone !== rec.done.length || rec.openId !== null)) ok = false
        bakeStat.ms += performance.now() - t0
        if (ok) {
          bakeStat.appends++
          e.sigs = sigs
          draftRecs.delete(e.canvas)                     // 인계 끝 — 장부를 접는다
          if (dirty) uploadPaintRect(r, e, dirty)      // ④ 부분 업로드 — 더티 사각만
          done = true
        }
        // ok가 false면 층이 도중에 죽었거나 초안 장부가 어긋난 것이다 — 아래 전량 재굽기가 받는다(조용한 갈림 ⛔)
      }
      if (!done && (bakeSig !== e.bakeSig || !sigsArePrefix(sigs, e.sigs) || sigs.length !== e.sigs.length)) {
        // web2-66 — 전량 재굽기는 층을 새로 세운다: 초안 세션·장부도 여기서 접는다
        draftCancelOnTex(e.canvas)
        draftRecs.delete(e.canvas)
        if (!e.bg && !paintAccumOff) e.bg = document.createElement('canvas')
        if (paintAccumOff) e.bg = null
        const t0 = performance.now()
        const w0 = e.canvas.width, h0 = e.canvas.height
        bakeFaceTex(e.canvas, rf, e.box, lv, strokes, e.side === 0 ? 1 : e.side, hatch, e.side === 'e' ? null : rep, e.bg)
        bakeStat.ms += performance.now() - t0
        // ⚠⚠ **GPU 저장은 «첫 크기»로 굳는다** — three r185는 WebGL2에서 `texStorage2D`로 한 번
        // 할당하고 그 뒤는 `texSubImage2D`로만 올린다(불변 저장). 65가 항목을 살려 쓰면서(②)
        // 텍스처도 살아남았고, **캔버스가 커져도 GPU는 옛 크기 그대로**여서 화면에는 «옛 그림이
        // 늘어난» 것이 나왔다 — CPU 캔버스는 정확했으므로 굽힌 캔버스 해시로는 안 잡힌다.
        // 잡은 것은 무회귀 팔 `thick55 ④`(테두리 띠 t 200→500 · 질량이 t에 비례 · 500/400 1.255)다.
        // 크기가 바뀌면 텍스처를 «놓아» 다시 할당시킨다(dispose → properties 비움 → texStorage2D 재실행).
        if (e.canvas.width !== w0 || e.canvas.height !== h0) { e.tex.dispose(); bakeStat.texReallocs++ }
        bakeStat.bakes++
        bakeStat.bakedStrokes += strokes.length
        bakeStat.uploads++
        bakeStat.uploadBytes += e.canvas.width * e.canvas.height * 4
        e.tex.needsUpdate = true
        e.sigs = sigs
        e.base = null                                // 기준 상태가 새로 섰다(59 — 미리보기 사본 폐기)
      }
      e.bakeSig = bakeSig
      e.level = lv
      e.famBits = famBits
    }
    e.mesh.visible = sideOk
    // screenPx(양자화 «전» 값)와 포화 여부를 기록한다(2차 [8] — 상한 포화와 «비슷한
    // 크기»를 팔이 가르는 재료. 같은 계산의 기록이지 두 벌 계산이 아니다 #54).
    e.mesh.userData.gate = { side: sideOk, level: e.level, screenPx: Math.round(screenPx), clamped: screenPx > C.FACETEX_MAX_PX }
  }
  evictPaintTex(r)
}

// web2-65 ④ — 부분 업로드의 «원본»: 더티 사각만 담는 작은 캔버스와 그것을 감싼 텍스처.
// **재질에 절대 안 쓴다** — three의 copyTextureToTexture가 CPU 경로(texSubImage2D)를 타는
// 조건이 «renderer properties에 없는 원본 텍스처»이기 때문이다.
let partialCv: HTMLCanvasElement | null = null
let partialTex: THREE.CanvasTexture | null = null

/** web2-65 ④ — **부분 업로드**. 더티 사각만 GPU에 올린다(1024² 전체를 매번 안 올린다).
 *
 *  ⚠⚠ **왜 사각을 작은 캔버스에 옮겨 담는가**(D-1 표식이 가른 실측): 큰 캔버스를 그대로
 *  원본으로 주고 `srcRegion`으로 잘라내면 three가 `UNPACK_SKIP_PIXELS/SKIP_ROWS`를 세우는데,
 *  그것이 `UNPACK_FLIP_Y_WEBGL`(CanvasTexture의 flipY = 참)과 **함께 걸릴 때의 자리**가
 *  구현에 따라 갈린다. 실측: 그 길로 올리면 화면 픽셀이 전량 업로드와 달랐다(잉크 7066 vs
 *  7401 — 게이트 ①이 잡았다). 사각을 «그 크기 그대로의» 캔버스에 옮겨 담으면 SKIP은 0이고
 *  FLIP_Y만 남아 자리가 하나로 정해진다 — 끔(partialOff) 판과 화면이 비트로 같아진다.
 *
 *  ⚠ `flipY`가 참이라 전량 업로드에서 캔버스 행 y는 GL 행 H−1−y에 앉는다. 부분도 같은 자리에
 *  앉히려면 도착 y는 `H − (y0 + h)`다(FLIP_Y가 사각 «안»을 다시 뒤집는다).
 *  못 하는 조건(반증 스위치·사각이 전량만 하다·던짐)에서는 전량으로 올린다 — 조용히 안 올리지 않는다. */
function uploadPaintRect(r: R3D, e: PaintTexEntry, b: MarkBox, forDraft = false): void {
  const W = e.canvas.width, H = e.canvas.height
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0)
  const x1 = Math.min(W - 1, b.x1), y1 = Math.min(H - 1, b.y1)
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  // web2-66 — 초안 프레임의 업로드는 제 계수기(draftStat)에 센다: 굽기 계수기(perf65의 자)에
  // 섞이면 커밋 한 번의 값이 그 붓의 «그리는 중» 몫까지 든 것으로 읽힌다(#89 — 초록의 범위).
  const st = forDraft
    ? { up: () => { draftStat.uploads++ }, bytes: (n: number) => { draftStat.uploadBytes += n } }
    : { up: () => { bakeStat.uploads++ }, bytes: (n: number) => { bakeStat.uploadBytes += n } }
  const full = () => {
    e.tex.needsUpdate = true
    st.up()
    st.bytes(W * H * 4)
    if (forDraft) draftStat.fullUploads++
  }
  if (w <= 0 || h <= 0) return
  if (paintPartialOff || W === 0 || H === 0 || w * h >= W * H) { full(); return }
  try {
    if (!partialCv) partialCv = document.createElement('canvas')
    if (partialCv.width !== w || partialCv.height !== h) {
      partialCv.width = w; partialCv.height = h
      partialTex?.dispose()
      partialTex = null
    }
    if (!partialTex) { partialTex = new THREE.CanvasTexture(partialCv); partialTex.colorSpace = THREE.SRGBColorSpace }
    const pg = partialCv.getContext('2d')!
    pg.setTransform(1, 0, 0, 1, 0, 0)
    pg.globalCompositeOperation = 'copy'
    pg.globalAlpha = 1
    pg.drawImage(e.canvas, x0, y0, w, h, 0, 0, w, h)
    r.renderer.copyTextureToTexture(partialTex, e.tex, null, new THREE.Vector2(x0, H - (y0 + h)))
    st.up()
    st.bytes(w * h * 4)
  } catch {
    // 부분 업로드가 안 서는 환경 — 전량으로 떨어진다(값으로 보인다: uploadBytes가 전량이다)
    full()
  }
}

/** web2-65 ⑤ — 상한을 넘으면 **안 보이는 면부터** 버린다(가장 오래 안 보인 것부터).
 *  버린 것은 파생이라 안전하다: 다시 «보이면» 그 프레임에 정본(획 목록)에서 다시 굽는다. */
function evictPaintTex(r: R3D): void {
  let bytes = paintTexBytes()
  if (bytes <= texBudget) return
  const cands = [...paintTexes.values()]
    .filter(e => !e.mesh.visible && !e.evicted && e.canvas.width > 0)
    .sort((a, b) => a.tick - b.tick)
  for (const e of cands) {
    if (bytes <= texBudget) break
    bytes -= e.canvas.width * e.canvas.height * 4 + (e.bg ? e.bg.width * e.bg.height * 4 : 0)
    draftCancelOnTex(e.canvas)                   // web2-66 — 세션·장부는 층과 운명을 같이한다
    draftRecs.delete(e.canvas)
    releasePaintLayer(e.canvas)
    e.canvas.width = 0; e.canvas.height = 0
    e.bg = null
    e.base = null
    e.level = 0
    e.bakeSig = ''
    e.docKey = ''
    e.sigs = []
    e.tex.dispose()
    e.evicted = true
    e.mesh.visible = false
    bakeStat.evicts++
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
// ── web2-66 초안 계수기(D-1 표식 — «그리는 중» 프레임마다 무엇이 얼마나 도는가) ─────────
export interface PaintDraftStat {
  /** draft가 실제로 그려진 프레임 수 */ frames: number
  /** 그 프레임들에 든 시간 합(ms — 곁값 · 정본은 도장 수) */ ms: number
  /** 마지막 프레임의 시간(ms) */ lastMs: number
  /** 덧그린 획 수 합(pre = 매 프레임 전체 획) */ strokes: number
  /** 업로드 횟수 */ uploads: number
  /** 업로드 바이트(pre = 매 프레임 캔버스 전량 w·h·4) */ uploadBytes: number
  /** 전량 업로드 횟수(66 ⑥ — post에서 0이어야 한다) */ fullUploads: number
  /** 세션 재구축 횟수(66 — 얼린 매개변수가 갈릴 때만 · pre에는 개념이 없다 = 0) */ rebuilds: number
}
const zeroDraftStat = (): PaintDraftStat => ({ frames: 0, ms: 0, lastMs: 0, strokes: 0, uploads: 0, uploadBytes: 0, fullUploads: 0, rebuilds: 0 })
let draftStat: PaintDraftStat = zeroDraftStat()
export function paintDraftFrameStats(): PaintDraftStat {
  return { ...draftStat, ms: Math.round(draftStat.ms * 100) / 100, lastMs: Math.round(draftStat.lastMs * 100) / 100 }
}
export function resetPaintDraftFrameStats(): void { draftStat = zeroDraftStat() }
/** 이 (면,쪽)의 확정 칠 획들(굽기 입력과 같은 함수 — 아래 인계·재구축이 쓴다) */
function committedStrokesOf(app: App, e: PaintTexEntry): Stroke[] {
  return e.side === 'e' ? borderStrokesOf(app, e.faceId)
    : e.side === 0 ? [] : paintStrokesOf(app, e.faceId, e.side)
}

/** 옛 전량 되그리기 판(59~65) — **폴백·반증 전용**(paintFreezeOff · 누적 끔 · 세션 불가).
 *  base 사본 ← canvas, canvas ← base, 그 위에 draft 전체를 덧그리고 전량 업로드. */
function applyDraftFullRedraw(e: PaintTexEntry, rf: ResolvedFace, mine: Stroke[]): number {
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
  const applied = drawDraftOnTex(e.canvas, rf, e.box, e.level, mine, e.side === 0 ? 1 : e.side)
  e.tex.needsUpdate = true
  draftStat.uploads++
  draftStat.fullUploads++
  draftStat.uploadBytes += e.canvas.width * e.canvas.height * 4
  return applied
}

function applyPaintDraft(r: R3D, app: App) {
  const d = app.paintDraft
  draftClampedNow = false
  draftAppliedNow = 0
  const t0 = performance.now()
  let drew = false
  for (const e of paintTexes.values()) {
    const mine = d ? d.filter(s => s.paint !== undefined && s.paint.f === e.faceId &&
      (e.side === 'e' ? s.paint.e === 1 : s.paint.e === undefined && s.paint.s === e.side)) : []
    const rf = app.faces.find(x => x.id === e.faceId)
    const side = e.side === 0 ? 1 : e.side
    if (mine.length === 0) {
      // 옛 판의 사본 되돌림(폴백이 얹었을 때 — 59 그대로)
      if (e.base) {
        const g = e.canvas.getContext('2d')!
        g.setTransform(1, 0, 0, 1, 0, 0)
        g.globalCompositeOperation = 'source-over'
        g.globalAlpha = 1
        g.drawImage(e.base, 0, 0)
        e.base = null
        e.tex.needsUpdate = true
      }
      // web2-66 — 세션 고아: 초안이 커밋 없이 떠났다(어긋냄 반증·면 이탈). 층의 미완 도장을
      // 걷고 확정 획만으로 되세운다. (커밋된 초안은 gatePaintTex의 인계가 이미 접었다 —
      // 프레임 안에서 gate가 이 함수보다 먼저 돈다.)
      const rec = draftRecs.get(e.canvas)
      if (rec) {
        draftRecs.delete(e.canvas)
        draftCancelOnTex(e.canvas)
        if (rf && e.bg && e.level > 0 &&
            rebuildStrokesOnTex(e.canvas, e.bg, rf, e.box, e.level, committedStrokesOf(app, e), side)) {
          e.tex.needsUpdate = true
          draftStat.uploads++
          draftStat.fullUploads++
          draftStat.uploadBytes += e.canvas.width * e.canvas.height * 4
          drew = true
        } else { e.bakeSig = ''; e.docKey = '' }         // 다음 게이트가 전량으로 받는다
      }
      continue
    }
    if (!rf || e.level === 0) continue
    // ── 세션 경로(66 ㉠㉡㉢) — 얼린 확정 구간 + 새 도장만 + 부분 업로드 ────────────────
    const useSess = !paintFreezeOff && !paintAccumOff && e.bg !== null && draftSupported()
    if (!useSess) {
      draftAppliedNow += applyDraftFullRedraw(e, rf, mine)
      drew = true
      draftStat.strokes += mine.length
      const gateF = e.mesh.userData.gate as { clamped?: boolean } | undefined
      if (gateF?.clamped) draftClampedNow = true
      continue
    }
    let rec = draftRecs.get(e.canvas)
    if (!rec) { rec = { done: [], openId: null }; draftRecs.set(e.canvas, rec) }
    const finCount = mine.length - 1
    // 장부 검증 — 끝난 초안 획들이 지금 목록의 앞자리 그대로인가(어긋나면 재구축)
    let valid = rec.done.length <= finCount ||
      (rec.done.length === mine.length && rec.openId === null)   // 모두 끝났고 새 점만 기다리는 프레임
    for (let i = 0; valid && i < Math.min(rec.done.length, mine.length); i++) {
      if (rec.done[i]!.id !== mine[i]!.id || rec.done[i]!.sig !== sigOfPaintStroke(mine[i]!)) valid = false
    }
    if (valid && rec.openId !== null &&
        (rec.done.length >= mine.length || rec.openId !== mine[rec.done.length]!.id)) valid = false
    let dirty: MarkBox | null = null
    const addDirty = (b: MarkBox | null) => {
      if (b && b.x1 >= b.x0) {
        dirty = dirty ? { x0: Math.min(dirty.x0, b.x0), y0: Math.min(dirty.y0, b.y0), x1: Math.max(dirty.x1, b.x1), y1: Math.max(dirty.y1, b.y1) } : b
      }
    }
    /** 층을 다시 세우고 초안 전부를 재먹임(얼린 결정이 갈렸을 때 — 드물다: cp 문턱 눈금 이동 등) */
    const rebuildAll = (): boolean => {
      draftCancelOnTex(e.canvas)
      rec!.done = []; rec!.openId = null
      if (!e.bg || !rebuildStrokesOnTex(e.canvas, e.bg, rf, e.box, e.level, committedStrokesOf(app, e), side)) return false
      draftStat.rebuilds++
      for (let i = 0; i < mine.length; i++) {
        const s = mine[i]!
        const fr = draftFeedOnTex(e.canvas, e.bg, rf, e.box, e.level, s, side)
        if (fr === null || fr === 'rebuild') return false
        if (i < mine.length - 1) {
          if (!draftFinishOnTex(e.canvas, e.bg, rf, e.box, e.level, s, side)) return false
          rec!.done.push({ id: s.id, sig: sigOfPaintStroke(s) })
        } else rec!.openId = s.id
      }
      e.tex.needsUpdate = true                             // 층이 통째로 갈렸다 — 전량 업로드
      draftStat.uploads++
      draftStat.fullUploads++
      draftStat.uploadBytes += e.canvas.width * e.canvas.height * 4
      return true
    }
    const step = (): boolean => {
      if (!valid) return rebuildAll()
      // 새로 끝난 획(면을 떠났다 다시 들어온 붓)을 완결한다
      while (rec!.done.length < finCount) {
        const s = mine[rec!.done.length]!
        if (rec!.openId === null) {
          const fr = draftFeedOnTex(e.canvas, e.bg!, rf, e.box, e.level, s, side)
          if (fr === 'rebuild' || fr === null) return rebuildAll()
          addDirty(fr)
        }
        const fb = draftFinishOnTex(e.canvas, e.bg!, rf, e.box, e.level, s, side)
        if (!fb) return rebuildAll()
        addDirty(fb)
        rec!.openId = null
        rec!.done.push({ id: s.id, sig: sigOfPaintStroke(s) })
      }
      // 자라는 획 — 새 점만 먹인다(확정 구간의 도장은 층에 그대로다 — 게이트 ①)
      const cur = mine[mine.length - 1]!
      if (rec!.done.length === mine.length) return true     // 모두 끝났다(다음 run 대기)
      const fr = draftFeedOnTex(e.canvas, e.bg!, rf, e.box, e.level, cur, side)
      if (fr === 'rebuild' || fr === null) return rebuildAll()
      addDirty(fr)
      rec!.openId = cur.id
      return true
    }
    if (step()) {
      if (dirty) { uploadPaintRect(r, e, dirty, true); drew = true }
    } else {
      // 마지막 폴백 — 세션이 못 서는 상태(층·바탕이 죽음): 옛 전량 판으로(조용한 미표시 ⛔)
      draftRecs.delete(e.canvas)
      draftCancelOnTex(e.canvas)
      draftAppliedNow += applyDraftFullRedraw(e, rf, mine)
      drew = true
      draftStat.strokes += mine.length
      const gateF = e.mesh.userData.gate as { clamped?: boolean } | undefined
      if (gateF?.clamped) draftClampedNow = true
      continue
    }
    draftAppliedNow += mine.length
    draftStat.strokes += mine.length
    const gate = e.mesh.userData.gate as { clamped?: boolean } | undefined
    if (gate?.clamped) draftClampedNow = true
  }
  if (drew) {
    const dt = performance.now() - t0
    draftStat.frames++
    draftStat.ms += dt
    draftStat.lastMs = dt
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

/** **굽힌 텍스처의 픽셀 해시**(web2-64 게이트 ① — 「브러시를 바꿔도 옛 획의 픽셀이 같다」의 자).
 *  확정본(굽힌 캔버스 — 초안 되돌림과 무관 · #107)을 텍스처마다 읽어 (면, 쪽) 열쇠별 해시·잉크 픽셀 수를 낸다.
 *  같은 문서·같은 굽기면 같은 해시(캔버스 2D + 엔진 결정론 · paint62 ⑧). 제품 경로는 안 부른다. */
export function paintTexHashForTest(): { key: string; level: number; hash: number; ink: number; w: number; h: number }[] {
  const out: ReturnType<typeof paintTexHashForTest> = []
  for (const [k, e] of paintTexes) {
    if (e.level === 0 || e.canvas.width === 0) continue
    const g = e.canvas.getContext('2d')!
    const d = g.getImageData(0, 0, e.canvas.width, e.canvas.height).data
    let h = 0, ink = 0
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i]! + d[i + 1]! + d[i + 2]!
      if (v < 750) ink++
      h = (Math.imul(h, 31) + v) | 0
    }
    out.push({ key: k, level: e.level, hash: h, ink, w: e.canvas.width, h: e.canvas.height })
  }
  return out.sort((a, b) => a.key < b.key ? -1 : 1)
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
  // web2-65 — 단계뿐 아니라 **굽기 서명**도 지운다. 65부터 재굽기의 판정자가 서명이라
  // level만 0으로 두면 조건이 같다고 읽혀 «안 굽는다»(게이트 ⑤의 그 결함).
  for (const e of paintTexes.values()) { e.level = 0; e.bakeSig = ''; e.docKey = '' }
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
