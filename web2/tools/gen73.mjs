// web2-73 — **보고의 표를 원장에서 «생성»한다**(리뷰어 [M1] · #47 · #42 ⑥).
// 손으로 옮겨 적다가 세 자리에서 낡은 값이 남았다(RTX 두 행 · g2 문면 · CLOSING의 ③ p95). 그래서 표를 짓지 않고 낸다.
//
//   node tools/gen73.mjs            → 마크다운 조각을 stdout으로(보고에 그대로 붙인다)
//
// 값은 여기서 다시 계산하지 않는다 — 원장의 필드를 옮기기만 한다(계산은 스펙 안에서 끝났다).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../stage0/out')
const L = (n) => JSON.parse(readFileSync(resolve(OUT, `${n}.json`), 'utf8'))
const has = (n) => existsSync(resolve(OUT, `${n}.json`))
const ARMS = ['①빈', '②선만', '③면까지', '④칠까지']
const STEPS = ['syncCamera', 'syncHatch', 'syncPaintTex', 'gatePaintTex', 'applyPaintDraft', 'revealFaces', 'sortFaces', 'render']
const f1 = (x) => Number(x).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const f0 = (x) => Math.round(Number(x)).toLocaleString('en-US')

const MACHINES = [
  ['가 헤드리스 · dpr2', 'perf73_web2_dpr2'],
  ['나 헤드리스 · dpr1', 'perf73_web2_dpr1'],
  ['다 머리 있는 Edge · dpr2', 'perf73_web2_dpr2_headed'],
  ['라 Edge 헤드리스 · dpr2', 'perf73_web2_dpr2_edge_headless'],
  ['마 Edge 헤드리스 · **캡 없음** · dpr2', 'perf73_web2_dpr2_edge_novsync'],
].filter(([, n]) => has(n))

function armsTable(label, n) {
  const d = L(n)
  const out = [`**${label}** — GPU \`${d.gl.renderer}\` · software ${d.gl.software} · 원장 \`${n}.json@A_arms\``, '',
    '| 팔 | 획/칠/면 | 돈 각 | fps | p50 | **p95** | 최장 차단 | 걸음 여덟의 합(119프레임 · ms) | 걸음 p95 | 삼각형·호출(참고 · 마지막 프레임) |',
    '|---|---|---|---|---|---|---|---|---|---|']
  for (const a of ARMS) {
    const v = d.A_arms[a], st = v.steps_ms
    const sums = STEPS.map(k => `${f1(st[k].sum)}`).join(' / ')
    out.push(`| ${a}${v.discarded ? ' ⚠버림' : ''} | ${v.docStrokes}/${v.paintStrokes}/${v.faces} | ${v.totalDeg}° | ${v.fps} | ${v.p50} | **${v.p95}** | ${v.longestBlockMs} | ${sums} = **${f1(st.total.sum)}** | ${st.total.p95} | ${v.triangles} · ${v.drawCalls} |`)
  }
  const o = d.A_owner
  out.push('', `상한(60Hz 16.67ms)에 네 팔 다 붙었나: **${o.vsync_capped_all_arms}** · 팔 차(ms) 선 ${o.deltas_ms.lines} · 면 ${o.deltas_ms.faces} · 칠 ${o.deltas_ms.paint} · `
    + `④ p95의 몫: 상한 초과(기계) **${o.share_pct_of_paint_p95.over_vsync_machine}%** · JS 걸음(바탕 렌더러) **${o.share_pct_of_paint_p95.js_steps_renderer}%** · vsync 바닥 ${o.share_pct_of_paint_p95.vsync_floor}%`)
  return out.join('\n')
}

function machineTable() {
  const out = ['| 판 | GPU 이름 | ① p95 | ② p95 | ③ p95 | ④ p95 | ④ fps | ④ 최장 차단 | ④ JS 걸음 p95 | 상한에 붙음 | 원장 |', '|---|---|---|---|---|---|---|---|---|---|---|']
  for (const [label, n] of MACHINES) {
    const d = L(n), A = d.A_arms, o = d.A_owner
    out.push(`| ${label} | \`${d.gl.renderer}\` | ${A['①빈'].p95} | ${A['②선만'].p95} | ${A['③면까지'].p95} | **${A['④칠까지'].p95}** | ${A['④칠까지'].fps} | ${A['④칠까지'].longestBlockMs} | ${o.js_steps_p95_ms.paint} | ${o.vsync_capped_all_arms} | \`${n}.json\` |`)
  }
  return out.join('\n')
}

function worstTable() {
  const out = ['| 판 | 팔 | 최악 프레임 합 | r3 / **흑연 겹(bs)** / 2D | 제스처 타일 굽기 ms(판) |', '|---|---|---|---|---|']
  for (const [label, n] of MACHINES) {
    const d = L(n)
    for (const a of ARMS.slice(1)) {
      const v = d.A_arms[a], w = (v.frameCost || {}).worst || {}, t = v.tiles || {}
      out.push(`| ${label} | ${a} | ${f1(w.total ?? 0)} | ${f1(w.r3 ?? 0)} / **${f1(w.bs ?? 0)}** / ${f1(w.d2 ?? 0)} | ${t.bakeMs ?? '—'}(${t.bakePasses ?? '—'}) |`)
    }
  }
  return out.join('\n')
}

function openTable() {
  const out = ['| 판 | 텍스처 단계 | 칠 전부(중앙 · 셋) | 굽기 CPU | 업로드 | **분할 대기**(뺄셈) | 그 밖(뺄셈) | 프레임(칠만) | 논 시간/프레임 | 첫 상호작용(셋) | 최장 차단 | 독립 자 ①/② |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
  for (const [label, n] of MACHINES) {
    const d = L(n), B = d.B_open, P = B.parts, R = d.B_repeats
    const lv = Object.entries(d.fixture.levels).map(([k, v]) => `${k}×${v}`).join(' ')
    const alls = R.now.map(x => f0(x.allPaintMs)).join('/'), fis = R.now.map(x => f0(x.firstInteractiveMs)).join('/')
    out.push(`| ${label} | ${lv} | **${f0(R.now_median.allPaintMs)}**(${alls}) | ${f0(P.bake_ms)} (${P.pct.bake}%) | ${f0(P.upload_ms)} (${P.pct.upload}%) | **${f0(P.wait_ms)} (${P.pct.wait}%)** | ${f0(P.other_ms)} (${P.pct.other}% — 부팅 ${f0(P.other_boot_ms)} + 프레임 안 ${f0(P.other_frame_ms)}) | ${B.loop.frames}(${B.loop.bakeFrames}) | ${(B.loop.gapMs / Math.max(1, B.loop.frames)).toFixed(1)}ms | **${f0(R.now_median.firstInteractiveMs)}**(${fis}) | ${R.now_median.longestBlockMs} | ${B.check.steps_over_work} / ${B.check.bake_plus_upload_over_work} |`)
  }
  return out.join('\n')
}

function sweepTable() {
  const keys = ['4', 'now_1', 'now_2', 'now_3', '24_1', '24_2', '24_3', '32', '50', '100', '1000']
  const ds = MACHINES.map(([lab, n]) => [lab, L(n).B_idle_sweep])
  const out = ['| 예산 · 실행 | ' + ds.map(([lab]) => `${lab}: 칠 전부 / 첫 상호작용 / 최장 차단`).join(' | ') + ' |', '|---|' + '---|'.repeat(ds.length)]
  for (const k of keys) {
    const cells = ds.map(([, S]) => { const v = S[k]; return `${f0(v.allPaintMs)} / ${f0(v.firstInteractiveMs)} / ${v.longestBlockMs}` })
    out.push(`| ${ds[0][1][k].idleMs}ms${k.startsWith('now') ? '(지금)' : ''} \`${k}\` | ${cells.join(' | ')} |`)
  }
  return out.join('\n')
}

function overheadTable() {
  const out = ['| 판 | ④ 팔 계측 **켬** p50 / p95 / fps | ④ 팔 계측 **끔** p50 / p95 / fps | 차(ms) p50 / p95 | p95의 몫 |', '|---|---|---|---|---|']
  for (const [label, n] of MACHINES) {
    const d = L(n), m = d.A_metrics_overhead
    if (!m) continue
    out.push(`| ${label} | ${m.on.p50} / ${m.on.p95} / ${m.on.fps} | ${m.off.p50} / ${m.off.p95} / ${m.off.fps} | ${m.delta_ms.p50} / ${m.delta_ms.p95} | ${m.overhead_pct_of_p95}% |`)
  }
  return out.length > 2 ? out.join('\n') : '(아직 없음 — perf73를 다시 돌린다)'
}

function gatesTable() {
  const ds = [['dpr2', 'gates73_web2_dpr2'], ['dpr1', 'gates73_web2_dpr1']].filter(([, n]) => has(n)).map(([lab, n]) => [lab, L(n)])
  const out = ['| 게이트 | ' + ds.map(([lab]) => lab).join(' | ') + ' |', '|---|' + '---|'.repeat(ds.length)]
  const row = (name, fn) => out.push(`| ${name} | ${ds.map(([, d]) => fn(d)).join(' | ')} |`)
  row('**g0**(게이트) 사람의 끌기 돈 각 — 초록', d => `${d.g0_probe.human.totalDeg}°`)
  row('**g0 빨강** — 72의 프로브(3°×120 = 360° 요청)가 실제로 돈 각', d => `**${d.g0_probe.red_orbitByForTest.totalDeg}°**`)
  row('g1(기록 · 항등) 프레임 / 걸음합−전체(ms/프레임) / 리셋 직후', d => `${d.g1_walk.frames} / ${d.g1_walk.per_frame_gap_ms} / ${d.g1_walk.red_frames_after_reset}`)
  row('g2(존재 대조) 깃발 없음→있음 · 눌림 · 글자 px', d => `${d.g2_hud.hud_without_flag}→${d.g2_hud.hud_with_flag} · ${d.g2_hud.hud.pressable} · ${d.g2_hud.hud.fontPx}`)
  row('g2 HUD 문면(그 실행의 값)', d => `「${String(d.g2_hud.hud.text).replace(/\n/g, ' / ')}」`)
  row('**g3**(게이트) 첫 상호작용 — 지금', d => f0(d.g3_open.now.firstInteractiveMs))
  row('**g3 빨강** — 수리 전 거동(legacy72)', d => `**${f0(d.g3_open.red_legacy72.firstInteractiveMs)}**`)
  row('g3 독립 자 ① 걸음합÷일한시간 · ② (굽기+업로드)÷일한시간', d => `${d.g3_open.now.check.steps_over_work} · ${d.g3_open.now.check.bake_plus_upload_over_work}`)
  row('g3 픽스처(면 / 칠 획)', d => d.g3_fixture ? `${d.g3_fixture.faces} / ${d.g3_fixture.paintStrokes}` : '—')
  return out.join('\n')
}

const P = []
P.push('### 1-1 네 팔 × 여덟 걸음\n')
for (const [label, n] of MACHINES) { P.push(armsTable(label, n)); P.push('') }
P.push('### 1-2 기계인지 가른다\n'); P.push(machineTable()); P.push('')
P.push('### 궤도 «시작»의 최장 차단 — 최악 프레임의 분해(곁값)\n'); P.push(worstTable()); P.push('')
P.push('### [L2] 관찰자(계측)의 몫\n'); P.push(overheadTable()); P.push('')
P.push('### §2 열기 분해\n'); P.push(openTable()); P.push('')
P.push('### §2 쉬는 중 예산 훑기\n'); P.push(sweepTable()); P.push('')
P.push('### §3 게이트와 «수리 전 빨강»\n'); P.push(gatesTable())
console.log(P.join('\n'))
