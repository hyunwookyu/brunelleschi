// 입력 원시 타입 — 잉크 캡처 포맷과 좌표. 참조: docs/wireframe_plan.md §5.1.
//
// **IR(volumes/anchors/openings/…)은 W 전환에서 폐기됐다**(§2.3 footprint 압출·축 클러스터링).
// 3D 자료구조는 Vertex/Edge/Face/Camera로 대체되며 W-3에서 `wire/model.ts`에 정의한다.
// 여기 남는 것은 그보다 앞단, 즉 **화면에서 들어온 것**뿐이다.

export type Pt = [number, number];

// --- 캡처 포맷 (§4.1 + §5.3 tiltX/Y, seq) ---
export interface Stroke {
  points: number[][];          // [x,y,t,p,(tiltX,tiltY)]
  pen: string;                 // mass|circ|axis|note
  frame?: string;              // plan|persp
  seq?: number;
}
export interface Capture { frame?: string; w?: number; h?: number; strokes: Stroke[]; }
