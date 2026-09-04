#!/usr/bin/env node
// web2-62 — libmypaint의 «빌드 시 생성» 자리(mypaint-brush-settings.c는 brushsettings.json에서
// generate.py가 만든다). 여기서는 그 표(설정 65 · 입력 18 · 상태 44)와 **브러시 196개**를
// TypeScript 상수로 낸다. 손으로 옮겨 적지 않는다(A-3 — 값의 출처는 파일 둘뿐이다):
//
//   web2/brushes/brushsettings.json          libmypaint(ISC)  — 설정·입력·상태의 정본
//   web2/brushes/<group>/<name>.myb          mypaint-brushes(CC0-1.0 — Licenses.dep5 brushes/*)
//
//   node tools/mypaint-gen.mjs   →   src/mypaint/settings.gen.ts · src/mypaint/presets.gen.ts
//
// 프리셋은 **압축**해 싣는다: 기본값과 같은 base_value이고 입력 곡선이 없는 설정은 뺀다
// (엔진이 로드 시 기본값으로 채운다 — libmypaint의 mypaint_brush_from_defaults 뒤 from_string
// 과 같은 결과). 설정 하나의 꼴: [base_value, {input: [[x,y],…]}] — 곡선 점은 원문 그대로.
// ⚠ 알 수 없는 입력(surfacemap_* — 이 libmypaint 판의 18 입력 밖 · MyPaint 2.x 앱 확장)은
//   libmypaint가 경고하고 건너뛰는 것과 같은 자리라 «건너뛴 것»으로 세어 표에 남긴다
//   (게이트 ⑥의 «누락 0»은 설정 65 기준이고, 이 표가 그 예외의 값이다).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const BR = resolve(ROOT, 'brushes')

// brushsettings.json은 JSON 뒤에 꼬리 텍스트가 붙어 있다(원문 그대로) — 첫 객체만 읽는다
const raw = readFileSync(resolve(BR, 'brushsettings.json'), 'utf8')
const end = raw.lastIndexOf('}')
const bs = JSON.parse(raw.slice(0, end + 1))

const inputs = bs.inputs.map(i => ({
  id: i.id, hardMin: i.hard_minimum, softMin: i.soft_minimum, normal: i.normal,
  softMax: i.soft_maximum, hardMax: i.hard_maximum,
}))
const settings = bs.settings.map(s => ({
  id: s.internal_name, constant: !!s.constant, min: s.minimum, def: s.default, max: s.maximum,
  name: s.displayed_name,
}))
const states = bs.states

const num = v => (v === null || v === undefined ? 'null' : String(v))
const upper = s => s.toUpperCase()

let out = `// 자동 생성 — tools/mypaint-gen.mjs (출처: web2/brushes/brushsettings.json · libmypaint ISC)
// 손으로 고치지 않는다. 설정 ${settings.length} · 입력 ${inputs.length} · 상태 ${states.length}.
/* eslint-disable */

export interface SettingInfo { id: string; constant: boolean; min: number; def: number; max: number; name: string }
export interface InputInfo { id: string; hardMin: number | null; softMin: number; normal: number; softMax: number; hardMax: number | null }

export const SETTINGS: readonly SettingInfo[] = [
${settings.map(s => `  { id: ${JSON.stringify(s.id)}, constant: ${s.constant}, min: ${num(s.min)}, def: ${num(s.def)}, max: ${num(s.max)}, name: ${JSON.stringify(s.name)} },`).join('\n')}
]

export const INPUTS: readonly InputInfo[] = [
${inputs.map(i => `  { id: ${JSON.stringify(i.id)}, hardMin: ${num(i.hardMin)}, softMin: ${num(i.softMin)}, normal: ${num(i.normal)}, softMax: ${num(i.softMax)}, hardMax: ${num(i.hardMax)} },`).join('\n')}
]

export const STATES: readonly string[] = [${states.map(s => JSON.stringify(s)).join(', ')}]

/** 설정 색인(MYPAINT_BRUSH_SETTING_*) */
export const S = {
${settings.map((s, i) => `  ${upper(s.id)}: ${i},`).join('\n')}
} as const

/** 입력 색인(MYPAINT_BRUSH_INPUT_*) */
export const I = {
${inputs.map((s, i) => `  ${upper(s.id)}: ${i},`).join('\n')}
} as const

/** 상태 색인(MYPAINT_BRUSH_STATE_*) */
export const ST = {
${states.map((s, i) => `  ${upper(s)}: ${i},`).join('\n')}
} as const

export const SETTINGS_COUNT = ${settings.length}
export const INPUTS_COUNT = ${inputs.length}
export const STATES_COUNT = ${states.length}
`
writeFileSync(resolve(ROOT, 'src/mypaint/settings.gen.ts'), out)

// ── 프리셋 196 ────────────────────────────────────────────────────────────────
const settingIdx = new Map(settings.map((s, i) => [s.id, i]))
const inputIdx = new Map(inputs.map((s, i) => [s.id, i]))

// 분류 차례는 order.conf(저장소 원문 — «Group: X» 머리 + 이름 목록)
const order = readFileSync(resolve(BR, 'order.conf'), 'utf8').split(/\r?\n/)
const groupOrder = []
const groupOf = new Map()
let cur = null
for (const line of order) {
  const m = /^Group:\s*(.+)$/.exec(line.trim())
  if (m) { cur = m[1].trim(); groupOrder.push(cur); continue }
  const t = line.trim()
  if (t && !t.startsWith('#') && cur) groupOf.set(t, cur)
}

const files = []
for (const g of readdirSync(BR)) {
  const p = join(BR, g)
  if (!statSync(p).isDirectory()) continue
  for (const f of readdirSync(p)) if (f.endsWith('.myb')) files.push({ group: g, file: join(p, f), name: `${g}/${basename(f, '.myb')}` })
}
files.sort((a, b) => a.name.localeCompare(b.name))

const presets = []
const skippedInputs = {}
let totalSettings = 0, totalCurves = 0
for (const f of files) {
  const j = JSON.parse(readFileSync(f.file, 'utf8'))
  if (j.version !== 3) throw new Error(`${f.name}: version ${j.version} — 3만 읽는다`)
  const compact = {}
  for (const [key, v] of Object.entries(j.settings)) {
    const si = settingIdx.get(key)
    if (si === undefined) throw new Error(`${f.name}: 모르는 설정 ${key}`)
    totalSettings++
    const base = v.base_value
    const curves = {}
    for (const [ik, pts] of Object.entries(v.inputs ?? {})) {
      if (!inputIdx.has(ik)) { skippedInputs[ik] = (skippedInputs[ik] ?? 0) + 1; continue }
      if (!Array.isArray(pts) || pts.length < 2) continue
      curves[ik] = pts.map(p => [p[0], p[1]])
      totalCurves++
    }
    const isDef = Math.abs(base - settings[si].def) < 1e-12 && Object.keys(curves).length === 0
    if (!isDef) compact[key] = Object.keys(curves).length ? [base, curves] : [base]
  }
  presets.push({
    name: f.name, group: groupOf.get(f.name) ?? f.group, desc: j.description ?? '',
    parent: j.parent_brush_name ?? '', s: compact,
  })
}

const groupsSeen = [...new Set(presets.map(p => p.group))]
const groups = [...groupOrder.filter(g => groupsSeen.includes(g)), ...groupsSeen.filter(g => !groupOrder.includes(g))]

const lines = presets.map(p =>
  `  { name: ${JSON.stringify(p.name)}, group: ${JSON.stringify(p.group)}, desc: ${JSON.stringify(p.desc)}, s: ${JSON.stringify(p.s)} },`)
out = `// 자동 생성 — tools/mypaint-gen.mjs (출처: web2/brushes/<group>/<name>.myb · mypaint-brushes CC0-1.0)
// 손으로 고치지 않는다. 브러시 ${presets.length} · 설정 항목 ${totalSettings} · 입력 곡선 ${totalCurves} ·
// 건너뛴 입력(이 libmypaint 판의 18 입력 밖): ${JSON.stringify(skippedInputs)}.
// 꼴: s[설정] = [base_value] | [base_value, {입력: [[x,y],…]}] — 기본값과 같고 곡선 없는 설정은 뺐다.
/* eslint-disable */

export type PresetCurves = Record<string, number[][]>
export type PresetSetting = [number] | [number, PresetCurves]
export interface Preset { name: string; group: string; desc: string; s: Record<string, PresetSetting> }

export const PRESET_GROUPS: readonly string[] = ${JSON.stringify(groups)}
export const PRESET_SKIPPED_INPUTS: Record<string, number> = ${JSON.stringify(skippedInputs)}

export const PRESETS: readonly Preset[] = [
${lines.join('\n')}
]
`
writeFileSync(resolve(ROOT, 'src/mypaint/presets.gen.ts'), out)
console.log(`settings ${settings.length} inputs ${inputs.length} states ${states.length} · presets ${presets.length} · setting entries ${totalSettings} · curves ${totalCurves} · skipped inputs ${JSON.stringify(skippedInputs)} · groups ${groups.join(',')}`)
