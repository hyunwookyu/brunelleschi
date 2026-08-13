// 지시 4.3 — 스트로크 + IR 내보내기 (V-7 중 이것만 선행).
// 목적은 저장 기능이 아니라 **실획을 분석 경로로 넘기는 것**이다:
// `stage0/10_ink_noise_model.py`(잉크 노이즈 4성분)와 `stage0/12_corner_error.py`(코너 오차)가
// 이 JSON을 그대로 입력으로 받는다(4.4).
//
// 포맷은 §4.1 + §5.3 확장 그대로: {points:[[x,y,t,p,tiltX,tiltY]], pen, frame, seq}
import type { IR, Stroke } from "../parser/types.js";

export const SESSION_FORMAT_VERSION = 1;

export interface SessionExport {
  format: "sketch2space.session";
  version: number;
  created: string;                 // ISO8601
  canvas: { w: number; h: number };
  input: { mode: string; penSeen: boolean };   // 마우스/펜 — 노이즈 모델 분리 판단에 필요(4.4)
  strokes: Stroke[];               // 프레임 구분은 stroke.frame
  ir: IR;
}

export function buildSession(opts: {
  strokes: Stroke[]; ir: IR; canvas: { w: number; h: number };
  inputMode: string; penSeen: boolean; now?: Date;
}): SessionExport {
  return {
    format: "sketch2space.session",
    version: SESSION_FORMAT_VERSION,
    created: (opts.now ?? new Date()).toISOString(),
    canvas: opts.canvas,
    input: { mode: opts.inputMode, penSeen: opts.penSeen },
    strokes: opts.strokes,
    ir: opts.ir,
  };
}

// 내보낸 세션이 분석 스크립트가 요구하는 형태인지 자체 점검.
// **애플펜슬 획인지 마우스 획인지**가 노이즈 모델 분리 판단의 핵심이므로 input을 필수로 본다(4.4).
export function validateSession(s: SessionExport): string[] {
  const e: string[] = [];
  if (s.format !== "sketch2space.session") e.push("format 불일치");
  if (!Number.isInteger(s.version)) e.push("version 없음");
  if (!s.canvas || !(s.canvas.w > 0) || !(s.canvas.h > 0)) e.push("canvas 크기 없음");
  if (!s.input || typeof s.input.penSeen !== "boolean") e.push("input.penSeen 없음(펜/마우스 구분 불가)");
  if (!Array.isArray(s.strokes)) { e.push("strokes 없음"); return e; }
  s.strokes.forEach((st, i) => {
    if (!Array.isArray(st.points) || st.points.length < 2) e.push(`stroke[${i}] points<2`);
    else {
      const p = st.points[0];
      // §5.3 6튜플 [x,y,t,p,tiltX,tiltY]. 마우스는 tilt가 0이지만 **자리는 있어야** 한다.
      if (p.length < 4) e.push(`stroke[${i}] point 차원 ${p.length}<4`);
    }
    if (typeof st.seq !== "number") e.push(`stroke[${i}] seq 없음(시간 순서 검증 불가)`);
  });
  return e;
}

export function toJSON(s: SessionExport): string {
  return JSON.stringify(s, null, 2);
}

// 브라우저 다운로드. 파일명에 프레임·획수를 넣어 나중에 구분되게 한다.
export function downloadSession(s: SessionExport, filename?: string): void {
  const name = filename ?? `s2s_${s.created.replace(/[:.]/g, "-")}_${s.strokes.length}strokes.json`;
  const blob = new Blob([toJSON(s)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
