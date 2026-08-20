// 내보내기 — 승격된 선분을 OBJ·glTF로. **재료가 레이어가 된다** — 색상 대응.
// 좌표계는 세계(작도 카메라 프레임) 그대로 — y 위, z 카메라 뒤가 음수.

import type { Grade } from './types'
import type { LiftResult, LiftedSeg } from './lift'
import { GRADES, MAT, gradeOf } from './material'

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

/** OBJ — 재료별 g(그룹)·usemtl, 동봉 MTL은 toMTL() */
export function toOBJ(lift: LiftResult): string {
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
  return lines.join('\n') + '\n'
}

/** MTL — 재료 색상 대응 */
export function toMTL(): string {
  const lines: string[] = ['# brunelleschi web2 materials']
  for (const g of GRADES) {
    const [r, gg, b] = MAT[g].rgb
    lines.push(`newmtl ${g}`, `Kd ${r} ${gg} ${b}`, `d ${MAT[g].alpha}`)
  }
  return lines.join('\n') + '\n'
}

/** glTF 2.0 — 재료별 LINES 프리미티브 + 색 재질, 버퍼 내장 data URI */
export function toGLTF(lift: LiftResult): string {
  const groups = byGrade(lift)
  const used = GRADES.filter(g => (groups.get(g)?.length ?? 0) > 0)
  const total = used.reduce((n, g) => n + groups.get(g)!.length, 0)
  const floats = new Float32Array(total * 6)
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
