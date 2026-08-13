// V-2 씬 빌더 (브라우저 독립 코어) — IR → 메시 스펙 + confidence 재질(§3.5). 지시서 V-2.
// 실제 Three.js Mesh 생성은 얇은 어댑터(V-8 브라우저)에서. 여기는 순수 데이터 → 테스트 가능.
import type { IR, Pt, Volume } from "../parser/types.js";
import type { Hint } from "../parser/tentative.js";
import { hypot } from "../parser/geometry.js";

export type MatMode = "opaque" | "semi" | "wire" | "hint";
export interface Material { mode: MatMode; opacity: number; dashed: boolean; }

// §3.5 confidence 표시 표: ≥0.8 불투명 / 0.5~0.8 반투명 / <0.5 면없음·파선와이어
export function confidenceMaterial(conf: number): Material {
  if (conf >= 0.8) return { mode: "opaque", opacity: 1.0, dashed: false };
  if (conf >= 0.5) return { mode: "semi", opacity: 0.5, dashed: false };
  return { mode: "wire", opacity: Math.max(0.3, 0.3 + 0.7 * conf), dashed: true };
}

function bboxDiag(fp: Pt[]): number {
  const xs = fp.map(p => p[0]), ys = fp.map(p => p[1]);
  return hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

export interface MeshSpec {
  id: string; kind: "volume" | "hint";
  volumeKind?: "mass" | "room";        // 지시 3.4 — room은 안쪽 면으로 렌더
  footprint: Pt[]; base: number; height: number;   // 무차원 null → vizHeight
  dimensionless: boolean;                            // height 미확정(앵커 부재, §3.5)
  material: Material; label: string;
}

export function volumeMesh(v: Volume): MeshSpec {
  const dimensionless = v.height == null;
  const height = v.height ?? +(0.6 * bboxDiag(v.footprint)).toFixed(2);   // extrude.py viz_height
  return {
    id: v.id, kind: "volume", volumeKind: v.kind ?? "mass",
    footprint: v.footprint, base: v.base, height,
    dimensionless, material: confidenceMaterial(v.confidence), label: v.label,
  };
}

export function hintMesh(h: Hint): MeshSpec {
  return {
    id: h.id, kind: "hint", footprint: h.bbox, base: 0,
    height: +(0.6 * bboxDiag(h.bbox)).toFixed(2), dimensionless: true,
    material: { mode: "hint", opacity: 0.4, dashed: true }, label: "",
  };
}

// IR(정식 볼륨) + hints(표시전용) → 씬 스펙. hint는 IR 밖(판정 D).
export function buildScene(ir: IR, hints: Hint[] = []): MeshSpec[] {
  return [...ir.volumes.map(volumeMesh), ...hints.map(hintMesh)];
}
