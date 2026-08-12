// 앵커 적용 — 비례→절대 (§3.3 앵커 하나로 전체 확정). 참조: python/stage2/anchor.py.
import type { IR, Pt, Anchor } from "./types.js";
import { ptp } from "./geometry.js";
import type { Op } from "./grammar.js";

function bboxExtent(fp: Pt[], axis: 0 | 1): number { return ptp(fp.map(p => p[axis])); }

function scaleVolume(ir: IR, id: string, prop: string, target: number, tol: number, src: string, firm: boolean) {
  const v = ir.volumes.find(x => x.id === id);
  if (!v) { ir.unresolved.push(`${id}: 알 수 없는 volume (${prop})`); return; }
  if (prop === "height") { v.height = target; v.height_src = "utterance"; ir.anchors.push({ target: id, prop, value: target, tol, src }); return; }
  const axis: 0 | 1 = prop === "depth" ? 1 : 0;   // width=x, depth=y
  const cur = bboxExtent(v.footprint, axis);
  if (cur < 1e-9) return;
  const s = target / cur;
  const minc: Pt = [Math.min(...v.footprint.map(p => p[0])), Math.min(...v.footprint.map(p => p[1]))];
  v.footprint = v.footprint.map(([x, y]) => [minc[0] + (x - minc[0]) * s, minc[1] + (y - minc[1]) * s]);
  ir.anchors.push({ target: id, prop, value: target, tol, src });
}

export function applyOps(ir: IR, ops: Op[]): IR {
  for (const op of ops) {
    const a = op.args;
    if (op.op === "set") scaleVolume(ir, a.id, a.prop, +a.value, 0, "utterance_firm", true);
    else if (op.op === "range") scaleVolume(ir, a.id, a.prop, (a.min + a.max) / 2, (a.max - a.min) / 2, "utterance_soft", false);
    else if (op.op === "min") { const v = ir.volumes.find(x => x.id === a.id); if (v) { const axis = a.prop === "depth" ? 1 : 0; if (ptp(v.footprint.map(p => p[axis])) < a.value) scaleVolume(ir, a.id, a.prop, +a.value, 0, "utterance_firm", true); } }
    else if (op.op === "retract") ir.anchors = ir.anchors.filter(x => x.target !== a.target);
    else if (op.op === "unresolved") ir.unresolved.push(`${a.id}: ${a.prop}`);
    else if (op.op === "note") ir.notes.push({ target: a.id, text: a.text });
    else if (op.op === "relate") ir.notes.push({ target: a.a, text: `relate ${a.a}-${a.b} ${a.type}` });
  }
  return ir;
}
