// IR 타입 — 참조: python/ir/schema.py (루트 7필드). 지시서 V-1.
// 두 구현 출력 일치가 검증 기준(§1.3). 어긋나면 TS가 틀린 것.

export type Pt = [number, number];

export interface Volume {
  id: string;
  footprint: Pt[];            // world Z=0
  base: number;
  height: number | null;      // 앵커 없으면 null = 무차원(§3.5)
  height_src: string;
  confidence: number;         // 둘레지지율²·적합도 (stage1/normalize)
  label: string;              // 명명(4단계)
}

export interface Anchor {
  target: string;
  prop: string;               // width|depth|height|...
  value: number;
  tol: number;                // >0 = 완화(범위)
  src: string;
}

export interface View {
  src: string;
  camera: Record<string, unknown>;
  fit_error: number | null;
}

export interface Note { target: string; text: string; }

export const RELATION_TYPES = ["adjacent", "above_below", "penetrate", "separated", "aligned"] as const;
export type RelationType = typeof RELATION_TYPES[number];
export interface Relation { a: string; b: string; type: RelationType; src: string; }

export const OPENING_TYPES = ["window", "door", "opening"] as const;
export type OpeningType = typeof OPENING_TYPES[number];
export interface Opening {
  target: string; type: OpeningType; wall: number;
  pos: number | null; w: number | null; h: number | null; src: string;
}

export interface IR {
  volumes: Volume[];
  anchors: Anchor[];
  views: View[];
  unresolved: string[];
  notes: Note[];
  relations: Relation[];
  openings: Opening[];
}

export const ROOT_FIELDS = [
  "volumes", "anchors", "views", "unresolved", "notes", "relations", "openings",
] as const;
export const MAX_ROOT_FIELDS = 12;

export function emptyIR(): IR {
  return { volumes: [], anchors: [], views: [], unresolved: [], notes: [], relations: [], openings: [] };
}

export function rootFieldCount(): number { return ROOT_FIELDS.length; }

// --- 캡처 포맷 (§4.1 + §5.3 tiltX/Y, seq) ---
export interface Stroke {
  points: number[][];          // [x,y,t,p,(tiltX,tiltY)]
  pen: string;                 // mass|circ|axis|note
  frame?: string;              // plan|persp
  seq?: number;
}
export interface Capture { frame?: string; w?: number; h?: number; strokes: Stroke[]; }
