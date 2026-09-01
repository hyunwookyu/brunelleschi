import { it, expect } from 'vitest'
import { session } from './session'
import { toggleFaceAt } from '../src/app/state'
import { findRooms } from '../src/core/room'
it('app-path 4-wall room v4', () => {
  const s = session(1200, 800)
  s.draw(100, 400, 1100, 400)
  s.draw(500, 500, 600, 475)     // d1
  s.draw(500, 500, 400, 475)     // d2
  s.draw(600, 475, 520, 458)     // g3
  s.draw(400, 475, 520, 458)     // g4
  console.log('floor', toggleFaceAt(s.app, { x: 465, y: 477 }))
  s.draw(600, 475, 600, 385)     // colB
  s.draw(520, 458, 520, 368)     // colD
  s.draw(600, 385, 520, 368)     // top4
  console.log('wall4', toggleFaceAt(s.app, { x: 558, y: 412 }))
  s.draw(500, 500, 500, 380)     // colA
  s.draw(600, 385, 500, 380)     // top1
  console.log('wall1', toggleFaceAt(s.app, { x: 508, y: 430 }))
  s.draw(400, 475, 400, 390)     // colC
  s.draw(500, 380, 400, 390)     // top2
  console.log('wall2', toggleFaceAt(s.app, { x: 430, y: 455 }))
  s.draw(400, 390, 520, 368)     // top3
  console.log('wall3', toggleFaceAt(s.app, { x: 508, y: 375 }))
  console.log('faces', JSON.stringify(s.app.faces.map(f => ({ id: f.id, ny: +f.normal.y.toFixed(2) }))))
  const g = findRooms(s.app.faces, s.app.doc.faces)
  console.log('rooms', g.rooms.length, JSON.stringify(g.rooms.map(r => +r.areaU2.toFixed(4))), 'links', g.links.length)
  expect(true).toBe(true)
})
