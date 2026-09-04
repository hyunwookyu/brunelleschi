// web2-63 — 팁 아틀라스 생성기: web2/tips/src/*.{gih,gbr,png} → src/mypaint/tips/<name>.png(8비트 회색 · 판을 가로로)
// + src/mypaint/tips.gen.ts(판 수·크기·출처·라이선스). 실행: node tools/tips-gen.mjs
//
// 형식: GBR v2(GIMP 단일 브러시 — 28바이트 머리 + 이름 + 회색(1) 또는 RGBA(4)) · GIH(첫 줄 이름 · 둘째 줄
// 머리 · 뒤에 GBR 연속) · PNG(8비트 · 비인터레이스). 마스크 극성: 회색 GBR = 값이 덮임(255 = 칠) · RGBA는
// 알파가 전부 1이면(Krita «미리 정의된 팁»의 관행) 1 − 밝기, 아니면 (1 − 밝기) × 알파.
// 판 하나는 정사각 S×S로 패드·축소(면적 평균) · **원형 창**(반지름 .92·S/2까지 1 · 가장자리 코사인 감쇠 — 전면 텍스처
// 판(rock_pitted 같은 300² 풀블리드)이 «네모 도장»으로 찍히지 않게) · **p95 눈금**(0.02 넘는 값의 95백분위를 1로 · 초과는 1로
// 자름 — 최대값 눈금은 밝은 점 몇 개가 판 전체를 옅게 만들었다: fine-grain 평균 .088 → 연필이 절차 타원의 절반 어둡기) ·
// 판 수는 뒤집기(h·v·hv)로 8까지 늘린다. 눈금·창의 값은 tips.gen.ts(meta)에 실린다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const ROOT = process.env.TIPS_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(ROOT, 'tips', 'src')
const OUT_DIR = join(ROOT, 'src', 'mypaint', 'tips')
const OUT_TS = join(ROOT, 'src', 'mypaint', 'tips.gen.ts')
const S = Number(process.env.TIPS_SIZE ?? 192)
const FRAMES_MAX = 8

// ── PNG 읽기(최소) ────────────────────────────────────────────────────────────
function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 아님')
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('latin1', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`PNG 지원 밖: depth ${depth} interlace ${interlace}`)
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype]
  if (!ch) throw new Error(`PNG 색 유형 ${ctype}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * ch)
  let p = 0
  for (let y = 0; y < h; y++) {
    const f = raw[p++]
    const row = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const x = raw[p++]
      const a = i >= ch ? row[i - ch] : 0, b = prev ? prev[i] : 0, c = prev && i >= ch ? prev[i - ch] : 0
      let v
      if (f === 0) v = x
      else if (f === 1) v = x + a
      else if (f === 2) v = x + b
      else if (f === 3) v = x + ((a + b) >> 1)
      else { const pp = a + b - c; const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) }
      row[i] = v & 255
    }
  }
  return { w, h, ch, data: out }
}

// ── PNG 쓰기(회색 8비트 · 필터 0) ───────────────────────────────────────────────
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
function writePngGray(w, h, gray) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0
  const raw = Buffer.alloc((w + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; gray.copy(raw, y * (w + 1) + 1, y * w, (y + 1) * w) }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ── GBR / GIH ─────────────────────────────────────────────────────────────────
function gbrAt(buf, off) {
  const hs = buf.readUInt32BE(off), ver = buf.readUInt32BE(off + 4), w = buf.readUInt32BE(off + 8), h = buf.readUInt32BE(off + 12), bpp = buf.readUInt32BE(off + 16)
  if (ver < 2 || buf.toString('latin1', off + 20, off + 24) !== 'GIMP') throw new Error(`GBR 머리 이상 @${off}`)
  const dataOff = off + hs, len = w * h * bpp
  return { w, h, bpp, data: buf.subarray(dataOff, dataOff + len), next: dataOff + len }
}
function framesOfGbrGih(buf, isGih) {
  let off = 0
  if (isGih) { const nl = buf.indexOf(10); off = buf.indexOf(10, nl + 1) + 1 }
  const out = []
  while (off < buf.length) { const f = gbrAt(buf, off); out.push(maskOf(f.w, f.h, f.bpp, f.data)); off = f.next; if (!isGih) break }
  return out
}
/** 마스크(0..1 Float32 · w×h) — 극성 규약은 파일 머리 주석 */
function maskOf(w, h, ch, data) {
  const m = new Float32Array(w * h)
  if (ch === 1) { for (let i = 0; i < w * h; i++) m[i] = data[i] / 255; return { w, h, m, mode: 'gray' } }
  if (ch === 2) { for (let i = 0; i < w * h; i++) m[i] = (1 - data[i * 2] / 255) * (data[i * 2 + 1] / 255); return { w, h, m, mode: 'lum×alpha' } }
  let allOpaque = true
  if (ch === 4) for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] !== 255) { allOpaque = false; break }
  for (let i = 0; i < w * h; i++) {
    const L = (data[i * ch] + data[i * ch + 1] + data[i * ch + 2]) / 765
    const a = ch === 4 ? data[i * 4 + 3] / 255 : 1
    m[i] = ch === 4 && !allOpaque ? (1 - L) * a : 1 - L
  }
  return { w, h, m, mode: ch === 4 && !allOpaque ? 'lum×alpha' : 'lum(alpha 전부 1)' }
}

// ── 정사각 S로: 긴 변을 S에 맞춰 면적 평균 축소 · 가운데 패드 · 최대 1 ───────────
function squareResize(fr) {
  const side = Math.max(fr.w, fr.h)
  const k = side / S
  const out = new Float32Array(S * S)
  const ox = (side - fr.w) / 2, oy = (side - fr.h) / 2
  let mx = 0
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const x0 = x * k - ox, x1 = (x + 1) * k - ox, y0 = y * k - oy, y1 = (y + 1) * k - oy
    let sum = 0, n = 0
    for (let yy = Math.floor(y0); yy < y1; yy++) for (let xx = Math.floor(x0); xx < x1; xx++) {
      n++
      if (xx < 0 || yy < 0 || xx >= fr.w || yy >= fr.h) continue
      sum += fr.m[yy * fr.w + xx]
    }
    const v = n ? sum / n : 0
    out[y * S + x] = v; if (v > mx) mx = v
  }
  if (mx > 0) for (let i = 0; i < out.length; i++) out[i] /= mx
  // 원형 창
  const c = (S - 1) / 2, rIn = 0.92 * S / 2, rOut = S / 2
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - c, y - c)
    const wgt = r <= rIn ? 1 : r >= rOut ? 0 : 0.5 * (1 + Math.cos(Math.PI * (r - rIn) / (rOut - rIn)))
    out[y * S + x] *= wgt
  }
  // p95 눈금
  const vals = Array.from(out).filter(v => v > 0.02).sort((a, b) => a - b)
  const p95 = vals.length ? vals[Math.floor(vals.length * 0.95)] : 1
  if (p95 > 0) for (let i = 0; i < out.length; i++) out[i] = Math.min(1, out[i] / p95)
  return out
}
function flip(m, h, v) {
  const o = new Float32Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o[y * S + x] = m[(v ? S - 1 - y : y) * S + (h ? S - 1 - x : x)]
  return o
}

// ── 목록 ─────────────────────────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(join(SRC, 'tips.json'), 'utf8'))
mkdirSync(OUT_DIR, { recursive: true })
const meta = []
for (const t of manifest.tips) {
  const buf = readFileSync(join(SRC, t.file))
  const lower = t.file.toLowerCase()
  let frames
  if (lower.endsWith('.png')) { const p = readPng(buf); frames = [maskOf(p.w, p.h, p.ch, p.data)] }
  else frames = framesOfGbrGih(buf, lower.endsWith('.gih'))
  const srcFrames = frames.length, srcSize = `${frames[0].w}x${frames[0].h}`, mode = frames[0].mode
  let sq = frames.map(squareResize)
  // 뒤집기로 8까지(원본 순서 유지 · h → v → hv)
  const base = sq.slice()
  for (const [fh, fv] of [[true, false], [false, true], [true, true]]) {
    if (sq.length >= FRAMES_MAX) break
    for (const m of base) { if (sq.length >= FRAMES_MAX) break; sq.push(flip(m, fh, fv)) }
  }
  sq = sq.slice(0, FRAMES_MAX)
  const n = sq.length
  const gray = Buffer.alloc(S * n * S)
  let fill = 0, mean = 0
  for (let f = 0; f < n; f++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = sq[f][y * S + x]; gray[y * S * n + f * S + x] = Math.round(v * 255); mean += v; if (v > 0.05) fill++
  }
  mean /= n * S * S; fill /= n * S * S
  const png = writePngGray(S * n, S, gray)
  writeFileSync(join(OUT_DIR, `${t.name}.png`), png)
  meta.push({ name: t.name, frames: n, size: S, src_frames: srcFrames, src_size: srcSize, mask_mode: mode, file: t.file,
    source: t.source, license: t.license, license_check: t.license_check, spacing_hint: t.spacing ?? null, window: 'disk .92 cos', scale: 'p95',
    mean: +mean.toFixed(4), fill: +fill.toFixed(4), png_bytes: png.length })
  console.log(`${t.name}: ${srcFrames}판 ${srcSize} (${mode}) → ${n}판 ${S}² · 평균 ${mean.toFixed(3)} · 채움 ${fill.toFixed(3)} · ${(png.length / 1024).toFixed(0)} KB`)
}
// ── 종이 결(면 고정 높이맵 → 이빨 깊이 몫 0..1 · 1024²) ─────────────────────────
// 변위(높이) PNG의 1·99 백분위를 0..1로 펴고 뒤집는다(골 = 1 = 안료가 못 닿는 자리 → 도장 알파가 더 깎인다).
// 61의 값 잡음(평균 .5)과 같은 자리·같은 뜻이라 GRAIN_DEPTH가 그대로 산다.
const paper = manifest.paper
{
  const p = readPng(readFileSync(join(SRC, paper.file)))
  if (p.ch !== 1) throw new Error('종이 변위 PNG는 회색이어야 한다')
  const N = p.w
  if (p.h !== N) throw new Error('종이 타일은 정사각')
  const hist = new Uint32Array(256); for (let i = 0; i < N * N; i++) hist[p.data[i]]++
  const pct = q => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= q * N * N) return v } return 255 }
  const lo = pct(0.01), hi = pct(0.99)
  const g = Buffer.alloc(N * N); let mean = 0
  for (let i = 0; i < N * N; i++) { const t = Math.min(1, Math.max(0, (p.data[i] - lo) / (hi - lo))); const v = 1 - t; g[i] = Math.round(v * 255); mean += v }
  mean /= N * N
  const png = writePngGray(N, N, g)
  writeFileSync(join(OUT_DIR, `${paper.name}.png`), png)
  meta.push({ name: paper.name, frames: 1, size: N, src_frames: 1, src_size: `${p.w}x${p.h}`, mask_mode: `height→tooth(1−norm · 백분위 ${lo}..${hi})`,
    file: paper.file, source: paper.source, license: paper.license, license_check: paper.license_check, spacing_hint: null,
    mean: +mean.toFixed(4), fill: 1, png_bytes: png.length })
  console.log(`paper ${paper.name}: ${N}² · 백분위 1/99 = ${lo}/${hi} · 평균 ${mean.toFixed(3)} · ${(png.length / 1024).toFixed(0)} KB`)
}
const ts = `// 자동 생성 — tools/tips-gen.mjs (web2-63). 손으로 고치지 않는다. 원본은 tips/src/ · 출처·라이선스는 tips/src/tips.json.
export interface TipMeta { name: string; frames: number; size: number; src_frames: number; src_size: string; mask_mode: string;
  file: string; source: string; license: string; license_check: string; spacing_hint: number | null; window?: string; scale?: string; mean: number; fill: number; png_bytes: number }
export const TIPS: readonly TipMeta[] = ${JSON.stringify(meta, null, 2)} as const
export const TIP_SIZE = ${S}
export const PAPER_NAME = 'paper001'
export const TIP_NAMES = TIPS.filter(t => t.name !== PAPER_NAME).map(t => t.name)
`
writeFileSync(OUT_TS, ts)
console.log(`tips.gen.ts: ${meta.length}개`)
