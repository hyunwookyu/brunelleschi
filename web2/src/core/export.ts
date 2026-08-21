// 내보내기 — 승격된 선분을 OBJ·glTF로. **재료가 레이어가 된다** — 색상 대응.
// 좌표계는 세계(작도 카메라 프레임) 그대로 — y 위, z 카메라 뒤가 음수.

import type { Grade } from './types'
import type { LiftResult, LiftedSeg } from './lift'
import { GRADES, MAT, gradeOf } from './material'
import type { ResolvedFace } from './face'

// **개구부는 형식이 직접 지원하지 않는다**(지시 「내보내기 형식이 그것을 지원하는지」의 답):
//   OBJ  — `f`는 **단순 다각형만**이다. 구멍은 다리(bridge)를 놓거나 삼각형으로 쪼개야 한다.
//   glTF — 삼각형(mode 4)뿐이라 다각형 자체가 없다.
// 그래서 **둘 다 삼각형으로 내보낸다.** 이미 화면에 그 삼각형을 쓰고 있으므로
// (`ResolvedFace.tris`) 내보내기와 화면이 **같은 기하**다 — 갈릴 자리를 안 만든다.
// 되돌릴 조건: 다각형과 구멍을 그대로 담는 형식(예: STEP·DXF의 HATCH)이 필요해지면
// 그때 `tris` 대신 `outer`/`holes`를 쓰는 갈래가 하나 는다.
const FACE_MTL = 'FACE'

function byGrade(lift: LiftResult): Map<Grade, { id: number; seg: LiftedSeg }[]> {
  const out = new Map<Grade, { id: number; seg: LiftedSeg }[]>()
  for (const [id, seg] of lift.lifted) {
    const s = lift.strokes.get(id)
    const g = s ? gradeOf(s) : 'HB'
    const arr = out.get(g) ?? []
    arr.push({ id, seg })
    out.set(g, arr)
  }
  return out
}

/** OBJ — 재료별 g(그룹)·usemtl, 동봉 MTL은 toMTL(). 면은 `FACE` 그룹의 삼각형이다. */
export function toOBJ(lift: LiftResult, faces: ResolvedFace[] = []): string {
  const lines: string[] = ['# brunelleschi web2', 'mtllib drawing.mtl']
  let vi = 1
  const groups = byGrade(lift)
  for (const g of GRADES) {
    const items = groups.get(g)
    if (!items || items.length === 0) continue
    lines.push(`g ${g}`, `usemtl ${g}`)
    for (const { id, seg } of items) {
      lines.push(
        `v ${seg.a3.x} ${seg.a3.y} ${seg.a3.z}`,
        `v ${seg.b3.x} ${seg.b3.y} ${seg.b3.z}`,
        `l ${vi} ${vi + 1} # stroke ${id}`,
      )
      vi += 2
    }
  }
  if (vi === 1) lines.push('g strokes')
  // 면 — 삼각형으로 낸다(위 머리말: `f`는 구멍을 못 담는다)
  if (faces.length > 0) {
    lines.push(`g ${FACE_MTL}`, `usemtl ${FACE_MTL}`)
    for (const f of faces) {
      for (let i = 0; i + 2 < f.tris.length; i += 3) {
        for (const p of [f.tris[i]!, f.tris[i + 1]!, f.tris[i + 2]!]) {
          lines.push(`v ${p.x} ${p.y} ${p.z}`)
        }
        lines.push(`f ${vi} ${vi + 1} ${vi + 2} # face ${f.id}`)
        vi += 3
      }
    }
  }
  return lines.join('\n') + '\n'
}

/** MTL — 재료 색상 대응 */
export function toMTL(): string {
  const lines: string[] = ['# brunelleschi web2 materials']
  for (const g of GRADES) {
    const [r, gg, b] = MAT[g].rgb
    lines.push(`newmtl ${g}`, `Kd ${r} ${gg} ${b}`, `d ${MAT[g].alpha}`)
  }
  // 면 — 화면의 옅은 채색과 같은 색·같은 투명도(`render3d.ts`의 `faceMat`)
  lines.push(`newmtl ${FACE_MTL}`, 'Kd 0.553 0.533 0.502', 'd 0.22')
  return lines.join('\n') + '\n'
}

/** glTF 2.0 — 재료별 LINES 프리미티브 + 색 재질, 버퍼 내장 data URI */
export function toGLTF(lift: LiftResult, faces: ResolvedFace[] = []): string {
  const groups = byGrade(lift)
  const used = GRADES.filter(g => (groups.get(g)?.length ?? 0) > 0)
  const total = used.reduce((n, g) => n + groups.get(g)!.length, 0)
  const faceVerts = faces.reduce((n, f) => n + f.tris.length, 0)
  const floats = new Float32Array(total * 6 + faceVerts * 3)
  const accessors: object[] = []
  const bufferViews: object[] = []
  const primitives: object[] = []
  const materials: object[] = []
  let vOff = 0
  used.forEach((g, gi) => {
    const items = groups.get(g)!
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
    items.forEach(({ seg }, i) => {
      const vals = [seg.a3.x, seg.a3.y, seg.a3.z, seg.b3.x, seg.b3.y, seg.b3.z]
      floats.set(vals, (vOff + i * 2) * 3)
      for (let k = 0; k < 6; k++) {
        const c = k % 3
        mn[c] = Math.min(mn[c]!, vals[k]!)
        mx[c] = Math.max(mx[c]!, vals[k]!)
      }
    })
    bufferViews.push({ buffer: 0, byteOffset: vOff * 12, byteLength: items.length * 24 })
    accessors.push({
      bufferView: gi, componentType: 5126, count: items.length * 2, type: 'VEC3', min: mn, max: mx,
    })
    const [r, gg, b] = MAT[g].rgb
    materials.push({
      name: g,
      pbrMetallicRoughness: { baseColorFactor: [r, gg, b, MAT[g].alpha], metallicFactor: 0, roughnessFactor: 1 },
    })
    primitives.push({ attributes: { POSITION: gi }, mode: 1, material: gi }) // 1 = LINES
    vOff += items.length * 2
  })
  if (faceVerts > 0) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
    let k = 0
    for (const f of faces) for (const p of f.tris) {
      floats.set([p.x, p.y, p.z], (vOff + k) * 3)
      mn[0] = Math.min(mn[0]!, p.x); mx[0] = Math.max(mx[0]!, p.x)
      mn[1] = Math.min(mn[1]!, p.y); mx[1] = Math.max(mx[1]!, p.y)
      mn[2] = Math.min(mn[2]!, p.z); mx[2] = Math.max(mx[2]!, p.z)
      k++
    }
    const gi = used.length
    bufferViews.push({ buffer: 0, byteOffset: vOff * 12, byteLength: faceVerts * 12 })
    accessors.push({ bufferView: gi, componentType: 5126, count: faceVerts, type: 'VEC3', min: mn, max: mx })
    materials.push({
      name: FACE_MTL,
      doubleSided: true,
      alphaMode: 'BLEND',
      pbrMetallicRoughness: {
        baseColorFactor: [0.553, 0.533, 0.502, 0.22], metallicFactor: 0, roughnessFactor: 1,
      },
    })
    primitives.push({ attributes: { POSITION: gi }, mode: 4, material: gi }) // 4 = TRIANGLES
    vOff += faceVerts
  }
  const bytes = new Uint8Array(floats.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bytes).toString('base64')
  const gltf = {
    asset: { version: '2.0', generator: 'brunelleschi-web2' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'strokes' }],
    meshes: [{
      primitives: primitives.length > 0 ? primitives : [{ attributes: {}, mode: 1 }],
    }],
    accessors,
    bufferViews,
    materials,
    buffers: [{
      byteLength: bytes.length,
      uri: `data:application/octet-stream;base64,${b64}`,
    }],
  }
  return JSON.stringify(gltf)
}
