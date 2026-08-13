// V-2 씬 diff (§2.2) — 오브젝트 풀 대여/반납. 전체 재빌드 금지. 지시서 V-2.
// geometry/material 변경만 교체, id로 매핑. dispose 대상은 removed.
import type { MeshSpec } from "./sceneBuilder.js";

export interface SceneDiff {
  added: MeshSpec[];       // 풀에서 대여 + geometry 생성
  updated: MeshSpec[];     // geometry/material 교체 (dispose 후 재생성)
  removed: string[];       // 풀에 반납 + dispose
  unchanged: string[];
}

function specKey(m: MeshSpec): string {
  // geometry+material 지문 — 변경 감지
  const fp = m.footprint.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(";");
  return `${m.kind}|${m.volumeKind ?? "mass"}|${fp}|${m.height}|${m.material.mode}|${m.material.opacity}|${m.label}`;
}

export function diffScene(prev: MeshSpec[], next: MeshSpec[]): SceneDiff {
  const prevMap = new Map(prev.map(m => [m.id, m]));
  const nextMap = new Map(next.map(m => [m.id, m]));
  const added: MeshSpec[] = [], updated: MeshSpec[] = [], removed: string[] = [], unchanged: string[] = [];
  for (const m of next) {
    const p = prevMap.get(m.id);
    if (!p) added.push(m);
    else if (specKey(p) !== specKey(m)) updated.push(m);
    else unchanged.push(m.id);
  }
  for (const id of prevMap.keys()) if (!nextMap.has(id)) removed.push(id);
  return { added, updated, removed, unchanged };
}
