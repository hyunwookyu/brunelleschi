import { it } from 'vitest'
import { fullDocPlus } from './roundtrip43.test'
import { serializeBrnl, parseBrnl } from '../src/core/file'
import { createApp, loadDoc } from '../src/app/state'

it('dbg', () => {
  const app = fullDocPlus()
  const first = serializeBrnl({ doc: app.doc, nextId: app.nextId, drawView: app.drawView })
  const back = parseBrnl(first)!
  const app2 = createApp(1200, 800)
  loadDoc(app2, back)
  const second = serializeBrnl({ doc: app2.doc, nextId: app2.nextId, drawView: app2.drawView })
  const A = JSON.parse(first), B = JSON.parse(second)
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const sa = JSON.stringify(A[k]), sb = JSON.stringify(B[k])
    if (sa !== sb) console.log('TOPDIFF', k, (sa||'').length, (sb||'').length)
  }
  for (let i = 0; i < Math.max(A.strokes.length, B.strokes.length); i++) {
    const a = A.strokes[i], b = B.strokes[i]
    const ka = a ? Object.keys(a).join(',') : '-'
    const kb = b ? Object.keys(b).join(',') : '-'
    if (ka !== kb) console.log('STROKE', i, 'A:', ka, '| B:', kb)
  }
  console.log('topA', Object.keys(A).join(','))
  console.log('topB', Object.keys(B).join(','))
})
