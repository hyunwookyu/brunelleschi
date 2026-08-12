// 발화 번역 7문법 (규칙 폴백만, §1.4 △). 참조: python/common/grammar.py, stage2/translate.py.
// LLM 정밀화는 서버. 브라우저는 치수 앵커 즉시 반영(§4.2)용 1차 번역.
import type { IR } from "./types.js";

export const OPS = ["set", "range", "min", "relate", "retract", "unresolved", "note"] as const;
export type OpName = typeof OPS[number];
export interface Op { op: OpName; args: Record<string, any>; }

// Korean 유닛 뒤엔 \b가 안 먹음(한글은 \w 아님) → 유닛 나열 + 영문경계 lookahead
const NUM_UNIT = /(\d+(?:\.\d+)?)\s*(미터|메타|meter|metre|m)(?![A-Za-z])/i;
const HEDGE = /(한|쯤|정도|약|about|around|대략)/i;
const MIN_RE = /(최소|적어도|least|minimum)/i;
const REL: [RegExp, string][] = [
  [/옆|붙[여이]|인접|next to|beside|adjacent/i, "adjacent"],
  [/위에|위쪽|above|on top/i, "above"],
  [/아래|밑|below|under/i, "below"],
  [/안에|속에|inside/i, "inside"],
  [/맞춰|정렬|align|평행|parallel/i, "aligned"],
  [/사이|떨어|간격|이격|apart/i, "separated"],
];
const DEIXIS = /여기|이쪽|저기|요기|here|there/i;
const CORRECTION = /아니|말고|취소|다시|actually|wait/i;
const PROP: [RegExp, string][] = [[/폭|너비|width/i, "width"], [/깊이|depth/i, "depth"], [/높이|height/i, "height"]];

function findProp(t: string): string { for (const [re, p] of PROP) if (re.test(t)) return p; return "width"; }
function firstVolId(ir: IR): string | null { return ir.volumes[0]?.id ?? null; }

// 한 발화 → op (또는 null). 세션후 일괄이 원칙이나 프로토타입은 치수만 즉시(§4.2).
export function ruleOp(text: string, ir: IR): Op | null {
  const id = firstVolId(ir);
  if (CORRECTION.test(text) && !NUM_UNIT.test(text)) return id ? { op: "retract", args: { target: id } } : null;
  const m = text.match(NUM_UNIT);
  if (m && id) {
    const val = parseFloat(m[1]); const prop = findProp(text);
    if (MIN_RE.test(text)) return { op: "min", args: { id, prop, value: val } };
    if (HEDGE.test(text)) return { op: "range", args: { id, prop, min: +(val * 0.9).toFixed(3), max: +(val * 1.1).toFixed(3) } };
    return { op: "set", args: { id, prop, value: val } };
  }
  for (const [re, type] of REL) if (re.test(text)) {
    const ids = ir.volumes.filter(v => v.label && text.includes(v.label)).map(v => v.id);
    if (ids.length >= 2) return { op: "relate", args: { a: ids[0], b: ids[1], type } };
    return { op: "note", args: { id: ids[0] ?? "unspecified", text: `관계 언급: ${text}` } };
  }
  if (DEIXIS.test(text) && id) return { op: "unresolved", args: { id, prop: /개구부|opening/i.test(text) ? "opening" : "unspecified" } };
  return null;
}

export function translate(ir: IR, segments: { text: string }[]): Op[] {
  const ops: Op[] = [];
  for (const s of segments) { const o = ruleOp(s.text, ir); if (o) ops.push(o); }
  return ops;
}

export function renderOp(op: Op): string {
  const sig: Record<OpName, string[]> = {
    set: ["id", "prop", "value"], range: ["id", "prop", "min", "max"], min: ["id", "prop", "value"],
    relate: ["a", "b", "type"], retract: ["target"], unresolved: ["id", "prop"], note: ["id", "text"],
  };
  return `${op.op}(${sig[op.op].map(k => op.args[k]).join(", ")})`;
}
