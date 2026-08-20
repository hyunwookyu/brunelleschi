// 내보내기 — 승격된 선분을 OBJ·glTF로.
// 좌표계는 세계(작도 카메라 프레임) 그대로 — y 위, z 카메라 뒤가 음수.
// 재료→레이어 대응은 6단계에서 얹는다.

import type { LiftResult } from './lift'

/** OBJ — 정점 + l(폴리라인) 요소 */
export function toOBJ(lift: LiftResult): string {
  const lines: string[] = ['# brunelleschi web2', 'o strokes']
  let vi = 1
  const elems: string[] = []
  for (const [id, seg] of lift.lifted) {
    lines.push(
      `v ${seg.a3.x} ${seg.a3.y} ${seg.a3.z}`,
      `v ${seg.b3.x} ${seg.b3.y} ${seg.b3.z}`,
    )
    elems.push(`l ${vi} ${vi + 1} # stroke ${id}`)
    vi += 2
  }
  return lines.concat(elems).join('\n') + '\n'
}

/** glTF 2.0 — LINES 프리미티브, 버퍼는 data URI 내장 */
export function toGLTF(lift: LiftResult): string {
  const segs = [...lift.lifted.values()]
  const n = segs.length
  const floats = new Float32Array(n * 6)
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  segs.forEach((seg, i) => {
    const vals = [seg.a3.x, seg.a3.y, seg.a3.z, seg.b3.x, seg.b3.y, seg.b3.z]
    floats.set(vals, i * 6)
    for (let k = 0; k < 6; k++) {
      const c = k % 3
      mn[c] = Math.min(mn[c]!, vals[k]!)
      mx[c] = Math.max(mx[c]!, vals[k]!)
    }
  })
  if (n === 0) { mn = [0, 0, 0]; mx = [0, 0, 0] }
  const bytes = new Uint8Array(floats.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bytes).toString('base64')
  const gltf = {
    asset: { version: '2.0', generator: 'brunelleschi-web2' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'strokes' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 1 }] }], // 1 = LINES
    accessors: [{
      bufferView: 0, componentType: 5126, count: n * 2, type: 'VEC3',
      min: mn, max: mx,
    }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.length }],
    buffers: [{
      byteLength: bytes.length,
      uri: `data:application/octet-stream;base64,${b64}`,
    }],
  }
  return JSON.stringify(gltf)
}
