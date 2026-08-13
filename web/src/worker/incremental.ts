// V-3 증분 파서 — 획 단위 갱신, 영향 그룹만 재파싱. 참조: stage_v_spec §2.1. 지시서 V-3.
// 하드게이트(V-b): 증분 최종 IR == 전체 재파싱(multiplex). 개별 획 근접으로 판정해야
// multiplex union-find와 동일 연결요소(그룹 union bbox 판정은 발산).
import type { Stroke, IR, Volume } from "../parser/types.js";
import { emptyIR } from "../parser/types.js";
import { hypot } from "../parser/geometry.js";
import { normalizeToIR } from "../parser/normalize.js";
import { inferRelations } from "../parser/relate.js";

type BB = [number, number, number, number];   // minx,miny,maxx,maxy
function strokeBBox(s: Stroke): BB {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of s.points) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; }
  return [a, b, c, d];
}
function bbGap(A: BB, B: BB): number {
  const dx = Math.max(0, Math.max(A[0] - B[2], B[0] - A[2]));
  const dy = Math.max(0, Math.max(A[1] - B[3], B[1] - A[3]));
  return hypot(dx, dy);
}

interface Item { s: Stroke; bb: BB; ord: number; }
interface Grp { items: Item[]; loKey: [number, number]; volCache: Volume | null | undefined; }

export class IncrementalParser {
  private groups: Grp[] = [];
  private frame: string;
  private counter = 0;   // 원본 획 순서(multiplex 그룹내 순서 일치용)
  constructor(private w: number, private h: number, private gapRatio = 0.05, frame = "") { this.frame = frame; }
  private gap() { return this.gapRatio * hypot(this.w, this.h); }

  // multiplex 정렬키: (round(minY/10)*10, minX) — 그룹 최소코너
  private updateKey(g: Grp) {
    let mx = Infinity, my = Infinity;
    for (const it of g.items) { if (it.bb[0] < mx) mx = it.bb[0]; if (it.bb[1] < my) my = it.bb[1]; }
    g.loKey = [Math.round(my / 10) * 10, mx];
  }

  addStroke(s: Stroke): void {
    if ((s.pen ?? "mass") !== "mass" || s.points.length < 2) return;
    const item: Item = { s, bb: strokeBBox(s), ord: this.counter++ };
    const g0 = this.gap();
    const hits: number[] = [];
    for (let i = 0; i < this.groups.length; i++) {
      if (this.groups[i].items.some(it => bbGap(item.bb, it.bb) <= g0)) hits.push(i);
    }
    if (hits.length === 0) {
      const g: Grp = { items: [item], loKey: [0, 0], volCache: undefined };
      this.updateKey(g); this.groups.push(g);
    } else if (hits.length === 1) {
      const g = this.groups[hits[0]];
      g.items.push(item); g.volCache = undefined; this.updateKey(g);
    } else {
      const merged: Grp = { items: [item], loKey: [0, 0], volCache: undefined };
      hits.sort((a, b) => b - a);
      for (const i of hits) { merged.items.push(...this.groups[i].items); this.groups.splice(i, 1); }
      this.updateKey(merged); this.groups.push(merged);
    }
  }

  getIR(): IR {
    const sorted = [...this.groups].sort((a, b) => a.loKey[0] - b.loKey[0] || a.loKey[1] - b.loKey[1]);
    const ir = emptyIR();
    sorted.forEach((g, k) => {
      if (g.volCache === undefined) {
        // 원본 획 순서로 정렬 → multiplex 그룹내 순서와 동일(merge_polyline 순서 의존)
        const strokes = [...g.items].sort((a, b) => a.ord - b.ord).map(it => it.s);
        const { ir: sir } = normalizeToIR({ frame: this.frame, w: this.w, h: this.h, strokes }, `v${k + 1}`);
        g.volCache = sir.volumes[0] ?? null;
      }
      if (g.volCache) ir.volumes.push({ ...g.volCache, id: `v${k + 1}` });
    });
    inferRelations(ir);
    return ir;
  }

  // 증분 통계(누수/성능): 재파싱 대상(무효화된 그룹) 수.
  reparsedGroups(): number { return this.groups.filter(g => g.volCache === undefined).length; }
  groupCount(): number { return this.groups.length; }
  strokeCount(): number { return this.groups.reduce((n, g) => n + g.items.length, 0); }
}
