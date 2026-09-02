// web2-54 §1 게이트 1·2 — **통과 집합 대조**. playwright JSON 보고에서 시험 하나하나의
// (프로젝트 · 파일 · 제목 · 결과)를 뽑아 두 실행을 «집합»으로 비교한다.
//
//   node tools/passset.mjs list a.json                 집합 요약(통과·실패·건너뜀 수)
//   node tools/passset.mjs compare a.json b.json       A의 모든 시험이 B에서 같은 결과인가
//
// compare의 방향(게이트 2): A = 초록 실행(부분집합), B = 워커 1 전량. A가 돈 시험마다
// B에 같은 시험이 있고 결과가 같아야 한다 — 빠진 시험·뒤집힌 결과를 전부 낸다.
// 게이트 1은 같은 집합끼리 세 번 대조한다(A↔B가 서로 부분집합 = 동일).
//
// «결과»는 playwright의 기대 판정(expected/unexpected/flaky/skipped)이다 — 재시도로
// 살아난 flaky도 «통과 집합이 같다»로 안 쳐 준다(불안정 0이 게이트 1의 문면).

import { readFileSync } from 'node:fs'

function collect(file) {
  const root = JSON.parse(readFileSync(file, 'utf8'))
  const out = new Map() // id -> status
  const walk = (suite, path) => {
    for (const s of suite.suites ?? []) walk(s, path.concat(s.title))
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const id = `${t.projectName}|${spec.file}|${[...path.slice(1), spec.title].join(' › ')}`
        out.set(id, t.status)
      }
    }
  }
  for (const s of root.suites ?? []) walk(s, [s.title])
  return out
}

const [cmd, a, b] = process.argv.slice(2)
if (cmd === 'list') {
  const m = collect(a)
  const c = {}
  for (const v of m.values()) c[v] = (c[v] ?? 0) + 1
  console.log(`${a}: ${m.size} tests`, c)
} else if (cmd === 'compare') {
  const A = collect(a), B = collect(b)
  let missing = 0, diff = 0
  for (const [id, st] of A) {
    if (!B.has(id)) { missing++; console.log(`MISSING in B: ${id}`) }
    else if (B.get(id) !== st) { diff++; console.log(`DIFF: ${id} — A=${st} B=${B.get(id)}`) }
  }
  console.log(`A=${A.size} tests · B=${B.size} tests · missing=${missing} · diff=${diff}`)
  process.exit(missing || diff ? 1 : 0)
} else {
  console.error('사용: passset.mjs list <a.json> | compare <a.json> <b.json>')
  process.exit(2)
}
