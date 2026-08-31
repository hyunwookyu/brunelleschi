// **옛 판의 `serializeBrnl` 스냅샷** — 수정 금지.
//
// 왜 있는가(web2-43 §0-5): 하위 호환을 재려면 **옛 형식의 저장물**이 있어야 하는데
// 저장소에 하나도 없었다(있던 둘은 옛 **파서** 스냅샷과 3D 오라클이라 저장물이 아니다).
// 지시문: 「없으면 git 이력에서 각 형식 변경 직전 커밋의 저장물을 만들어 픽스처로 굳혀라
// — 이후 라운드가 계속 쓸 재산이다.」
//
// 아래 다섯은 `git show <커밋>:web2/src/core/file.ts`의 `serializeBrnl` **본문 그대로**다
// (주석만 줄였다 — 열쇠 이름과 **차례**가 형식이므로 그것을 안 건드린다).
// 판 올림 커밋은 이력이 값으로 냈다:
//
//     v1 babdfa1 (web2 5단계)      v2 c9db963 (web2-17)     v3 = 쓰인 적 없음
//     v4 6f38dee (web2-19)         v5 56ef42f (web2-20)     v6 a4ca2c5 (web2-23)
//
// `legacy_web2_10.ts`의 선례 그대로다(§3의 복사 금지는 참조 저장소 얘기이고 이
// 저장소 자신의 옛 코드는 대상이 아니다).

/** v1 — babdfa1. 면·단위·종이·겹이 아직 없다. 첫 획이 **구성상 지평선**이다. */
export const serializeV1 = (d: any): string => JSON.stringify({
  format: 'brnl',
  version: 1,
  frame: d.doc.frame,
  strokes: d.doc.strokes,
  nextId: d.nextId,
  savedViews: d.savedViews,
})

/** v2 — c9db963. 지평선이 상수(H/2)가 되고 면·단위·scaleRef·drawView가 실린다. */
export const serializeV2 = (d: any): string => JSON.stringify({
  format: 'brnl',
  version: 2,
  frame: d.doc.frame,
  strokes: d.doc.strokes,
  faces: d.doc.faces,
  unit: d.doc.unit,
  scaleRef: d.doc.scaleRef,
  nextId: d.nextId,
  savedViews: d.savedViews,
  ...(d.drawView ? { drawView: d.drawView } : {}),
})

/** v4 — 6f38dee. `savedViews`가 **종이**(sheets)가 됐다. */
export const serializeV4 = (d: any): string => JSON.stringify({
  format: 'brnl',
  version: 4,
  frame: d.doc.frame,
  strokes: d.doc.strokes,
  faces: d.doc.faces,
  unit: d.doc.unit,
  scaleRef: d.doc.scaleRef,
  nextId: d.nextId,
  sheets: d.doc.sheets,
  ...(d.drawView ? { drawView: d.drawView } : {}),
})

/** v5 — 56ef42f. 겹(layers)이 실린다(없으면 열쇠 자체가 없다). */
export const serializeV5 = (d: any): string => JSON.stringify({
  format: 'brnl',
  version: 5,
  frame: d.doc.frame,
  strokes: d.doc.strokes,
  faces: d.doc.faces,
  unit: d.doc.unit,
  scaleRef: d.doc.scaleRef,
  nextId: d.nextId,
  sheets: d.doc.sheets,
  ...(d.doc.layers.length > 0 ? { layers: d.doc.layers } : {}),
  ...(d.drawView ? { drawView: d.drawView } : {}),
})

/** v6 — a4ca2c5. 밑그림(underlays)이 실린다. **필압 보정·재기·글씨·평행 사영은 아직 없다**
 *  (그 넷은 판을 안 올리고 나중에 붙은 열쇠라 이 판의 저장물에는 없다 — 그 «없음»이
 *  하위 호환의 실제 대역이다). */
export const serializeV6 = (d: any): string => JSON.stringify({
  format: 'brnl',
  version: 6,
  frame: d.doc.frame,
  strokes: d.doc.strokes,
  faces: d.doc.faces,
  unit: d.doc.unit,
  scaleRef: d.doc.scaleRef,
  nextId: d.nextId,
  sheets: d.doc.sheets,
  ...(d.doc.layers.length > 0 ? { layers: d.doc.layers } : {}),
  ...(d.doc.underlays.length > 0 ? { underlays: d.doc.underlays } : {}),
  ...(d.drawView ? { drawView: d.drawView } : {}),
})
