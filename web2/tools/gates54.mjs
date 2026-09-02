// web2-54 §1 게이트 원장 생성기 — «측정은 반드시 stage0/out에 JSON으로 남긴다»(§5.1 ·
// 1차 리뷰어 [3]: 게이트 수치가 산문에만 있으면 재검증 불가).
//
//   LEDGER=1 node tools/gates54.mjs g1.json g2.json g3.json night.json full1w.json \
//            <g1s> <g2s> <g3s> <nights> <fulls>
//
// 낸다: stage0/out/gates54_web2.json —
//   · 실행별 칸 수·통과·skip·빨강 목록·벽시계 s · 통과 집합의 sha256
//   · 쌍대조(missing/diff — 게이트 1은 g1↔g2↔g3, 게이트 2는 g⊂full · night↔full)
//   · full 통과 집합 «전체»(정렬된 (프로젝트|파일|제목|결과) 목록 — 재검증의 원자료)
//   · green이 안 도는 칸의 구성(계측 몇 · dpr2 목록 밖 몇 — #89 「초록의 범위」)
//
// ⚠ 원장 관문(#90): LEDGER=1이 아니면 한 바이트도 안 쓴다 — 관문과 같은 규약을 이
// 파일이 스스로 지킨다(이 도구는 playwright 밖이라 ledgerguard 배선이 안 닿는 자리다).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.env.LEDGER !== '1') {
  console.error('[원장 관문] LEDGER=1이 아니므로 안 쓴다 (gates54.mjs)')
  process.exit(2)
}

const HERE = dirname(fileURLToPath(import.meta.url))
// 여섯째 인자(gfinal)는 선택 — 최종 트리(스펙 보강 뒤)의 초록 1회를 함께 봉인한다(2차 [N3])
const [g1, g2, g3, night, full, gfinal, ...walls] = process.argv.slice(2)

function collect(file) {
  const root = JSON.parse(readFileSync(file, 'utf8'))
  const out = new Map()
  const walk = (suite, path) => {
    for (const s of suite.suites ?? []) walk(s, path.concat(s.title))
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        out.set(`${t.projectName}|${spec.file}|${[...path.slice(1), spec.title].join(' › ')}`, t.status)
      }
    }
  }
  for (const s of root.suites ?? []) walk(s, [s.title])
  return out
}

const runs = { green1: g1, green2: g2, green3: g3, night, full1w: full,
  ...(gfinal && !/^\d+$/.test(gfinal) ? { green_final_tree: gfinal } : {}) }
const sets = Object.fromEntries(Object.entries(runs).map(([k, f]) => [k, collect(f)]))
const summary = {}
Object.entries(sets).forEach(([k, m], i) => {
  const c = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 }
  const reds = []
  for (const [id, st] of m) { c[st] = (c[st] ?? 0) + 1; if (st !== 'expected' && st !== 'skipped') reds.push(id) }
  const sorted = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  summary[k] = {
    cells: m.size, ...c, reds,
    wall_s: Number(walls[i] ?? NaN),
    passset_sha256: createHash('sha256').update(JSON.stringify(sorted)).digest('hex'),
  }
})

const cmp = (A, B) => {
  let missing = 0, diff = 0
  const rows = []
  for (const [id, st] of A) {
    if (!B.has(id)) { missing++; rows.push(`MISSING ${id}`) }
    else if (B.get(id) !== st) { diff++; rows.push(`DIFF ${id} A=${st} B=${B.get(id)}`) }
  }
  return { missing, diff, rows }
}

const MEAS = new Set(['cost18.spec.ts', 'cost20.spec.ts', 'cost22.spec.ts', 'brushperf.spec.ts'])
const notInGreen = { measure: 0, dpr2_outside_list: 0 }
for (const id of sets.full1w.keys()) {
  if (sets.green1.has(id)) continue
  if (MEAS.has(id.split('|')[1])) notInGreen.measure++
  else notInGreen.dpr2_outside_list++
}

const out = {
  what: 'web2-54 §1 게이트 실측 원장 — 초록 연속 셋 · 밤 · 워커 1 전량의 통과 집합과 쌍대조. 원자료는 full_passset(정렬 목록)이고 각 실행의 sha256이 그 목록과의 동일성을 봉인한다.',
  note_89: '초록의 범위: green은 full의 부분집합이다(계측 넷 + dpr2 목록 밖은 안 돈다 — not_in_green이 그 구성). CHAIN3 게이트 2의 «통과 집합 동일»은 두 술어로 실현된다 — ① green이 돈 모든 칸의 결과가 워커 1 전량과 같다(부분집합 동일) ② 전량 자체는 night(병렬 4 · 670칸 전부)와 워커 1이 칸별로 같다. ②가 green이 못 보는 123칸의 워커 불변까지 덮는다',
  conditions: {
    tree: '게이트는 73adc34의 트리에서 쟀다(제품 코드 그 상태) — 이후 커밋은 e2e 스펙 보강·도구·문서다',
    workers: { green: 4, night: 4, full1w: 1 }, cpu: 8,
    canonical: 'npm run e2e:green ×3 → npm run e2e:night → npx playwright test --workers=1 (각각 E2E_JSON으로 보고 저장)',
  },
  runs: summary,
  gate1_pairs: {
    g1_g2: (({ missing, diff }) => ({ missing, diff }))(cmp(sets.green1, sets.green2)),
    g2_g3: (({ missing, diff }) => ({ missing, diff }))(cmp(sets.green2, sets.green3)),
    g1_g3: (({ missing, diff }) => ({ missing, diff }))(cmp(sets.green1, sets.green3)),
  },
  gate2: {
    green_subset_of_full: (({ missing, diff }) => ({ missing, diff }))(cmp(sets.green1, sets.full1w)),
    night_vs_full: (({ missing, diff }) => ({ missing, diff }))(cmp(sets.night, sets.full1w)),
  },
  not_in_green: notInGreen,
  // 초록의 범위 «자체»를 원장에(2차 [N11]) — green이 도는 dpr2 스펙 목록(조건의 산출물 ·
  // 정본은 e2e/dpr2list.ts)과 계측 넷. green 통과 집합의 원자료도 함께 — 게이트 2의
  // green 축이 이 파일만으로 재유도된다.
  dpr2_specs: (() => {
    const src = readFileSync(resolve(HERE, '../e2e/dpr2list.ts'), 'utf8')
    const m = src.match(/DPR2_SPECS = \[([\s\S]*?)\]/)
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []
  })(),
  measure_specs: ['cost18', 'cost20', 'cost22', 'brushperf'],
  green_passset: [...sets.green1.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, st]) => `${st === 'expected' ? 'ok' : st}|${id}`),
  // 수리 «전» 판의 실패(D-2의 전 절반 · 2차 [N5]) — ⚠ **원장 밖 사실이다**: 그 실행의
  // 보고 JSON(tmp54/g1.json 초판)은 수리 후 재실행이 같은 이름으로 덮었다. 아래는 세션이
  // 그 시점에 파서로 뜬 값의 옮김이고, 재검증 불가함을 명시한다(#89 — 범위를 적는다).
  before_fix: {
    tree: '6e6e36b (mats52 예산·waitink37 추적자 수리 «전»)',
    run: 'green 1회차 · 547칸 · 543 expected + 1 skip + 3 unexpected',
    reds: [
      'dpr1|mats52.spec.ts|⑤ 브러시 프리셋 — #97 짝 세로 넘침: expected 788 received 801',
      'dpr2|mats52.spec.ts|⑤ 브러시 프리셋 — #97 짝 세로 넘침: expected 788 received 801',
      'dpr2|waitink37.spec.ts|37-2 ③ 정착 전이 — settling 배열이 비었다(toContain 5 vs [])',
    ],
    provenance: 'session-captured (원장 아님 — 재검증 불가)',
  },
  full_passset_note: (() => {
    const n = sets.full1w.size
    const ok = [...sets.full1w.values()].filter(v => v === 'expected').length
    const sk = [...sets.full1w.values()].filter(v => v === 'skipped').length
    return `목록 ${n}줄 = 통과 ${ok} + skip ${sk} (2차 [N6] — 세어서 적는다)`
  })(),
  full_passset: [...sets.full1w.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, st]) => `${st === 'expected' ? 'ok' : st}|${id}`),
}

const dst = resolve(HERE, '../../stage0/out/gates54_web2.json')
mkdirSync(dirname(dst), { recursive: true })
writeFileSync(dst, JSON.stringify(out, null, 1))
console.log(`wrote ${dst} — runs:`, Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, `${v.expected}/${v.cells} reds=${v.reds.length}`])))
