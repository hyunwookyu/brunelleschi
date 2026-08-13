// V-4 수동 치수 입력 — 볼륨 클릭 → 숫자 → anchor. 발화 앵커와 동일 전파(applyOps, §3.3).
// 근거(2J): 설계세션 치수 발화율 0.73%. 마우스 입력엔 발화가 없을 수 있어 이 경로가
// 유일한 앵커 유입구(가정 V-l). id는 증분 드로잉서 이동 가능(정렬기반 재부여) →
// 앵커를 원본(앵커 전) 볼륨 centroid로 저장하고 재파싱마다 최근접 볼륨에 재매칭.
import type { IR, Pt } from "../parser/types.js";
import { applyOps } from "../parser/anchor.js";
import type { Op } from "../parser/grammar.js";
import { hypot } from "../parser/geometry.js";

export type Prop = "width" | "depth" | "height";

export interface ManualAnchor {
  cx: number; cy: number;         // 앵커 지정 시점의 볼륨 centroid(파서 출력, 앵커 전 = 결정론적 안정)
  prop: Prop; value: number;      // 실치수(m)
}

export function centroid(fp: Pt[]): [number, number] {
  if (fp.length === 0) return [0, 0];
  let x = 0, y = 0;
  for (const p of fp) { x += p[0]; y += p[1]; }
  return [x / fp.length, y / fp.length];
}

// 최근접 볼륨 매칭 — 재파싱으로 id가 바뀌어도 centroid는 파서 출력이라 안정.
// matchTol: 대각 대비 상대 임계(그 볼륨이 사라졌으면 매칭 실패 → 조용히 스킵).
export function matchVolumeId(ir: IR, cx: number, cy: number, matchTol = Infinity): string | null {
  let best: string | null = null, dmin = Infinity;
  for (const v of ir.volumes) {
    const [vx, vy] = centroid(v.footprint);
    const d = hypot(vx - cx, vy - cy);
    if (d < dmin) { dmin = d; best = v.id; }
  }
  return dmin <= matchTol ? best : null;
}

export class ManualAnchorStore {
  private anchors: ManualAnchor[] = [];

  // 볼륨 id + 현재 IR로 앵커 등록(centroid 스냅샷). 같은 볼륨·같은 prop은 덮어씀.
  add(ir: IR, id: string, prop: Prop, value: number): boolean {
    const v = ir.volumes.find(x => x.id === id);
    if (!v) return false;
    const [cx, cy] = centroid(v.footprint);
    const near = this.anchors.find(a => a.prop === prop && hypot(a.cx - cx, a.cy - cy) < 1e-6);
    if (near) near.value = value; else this.anchors.push({ cx, cy, prop, value });
    return true;
  }

  clear() { this.anchors = []; }
  count() { return this.anchors.length; }
  list(): ReadonlyArray<ManualAnchor> { return this.anchors; }

  // 저장 앵커 → 현재 IR 볼륨에 재매칭한 Op 목록(발화 op와 동일 형식).
  resolveOps(ir: IR): Op[] {
    const ops: Op[] = [];
    for (const a of this.anchors) {
      const id = matchVolumeId(ir, a.cx, a.cy);
      if (id) ops.push({ op: "set", args: { id, prop: a.prop, value: a.value } });
    }
    return ops;
  }

  // 재파싱 결과(앵커 전 IR)에 수동 앵커를 얹어 반환(발화 앵커와 동일 로직).
  apply(base: IR): IR {
    const ir: IR = JSON.parse(JSON.stringify(base));
    return applyOps(ir, this.resolveOps(ir));
  }
}
