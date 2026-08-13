// V-3 파서 Web Worker (§2.3) — 메인스레드 차단 방지. 획 Transferable, IR 구조적복제 회신.
// 로직은 IncrementalParser(하드게이트 검증됨). 워커는 얇은 어댑터.
import type { Stroke } from "../parser/types.js";
import { IncrementalParser } from "./incremental.js";

let parser: IncrementalParser | null = null;

type Msg =
  | { type: "init"; w: number; h: number; frame?: string }   // 처리 후 {type:"ready"} 회신
  | { type: "stroke"; stroke: Stroke; t0: number }   // t0 = 획 종료 시각(지연 계측)
  | { type: "reset" };

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === "init") { parser = new IncrementalParser(m.w, m.h, 0.05, m.frame ?? ""); (self as any).postMessage({ type: "ready" }); return; }
  if (m.type === "reset") { parser = parser ? new IncrementalParser((parser as any).w, (parser as any).h) : null; return; }
  if (m.type === "stroke" && parser) {
    parser.addStroke(m.stroke);
    const ir = parser.getIR();
    // 지연 = 획 종료 → IR 산출 (렌더 제외; 획→3D 총지연은 메인에서 렌더 후 합산)
    (self as any).postMessage({ type: "ir", ir, reparsed: parser.reparsedGroups(), t0: m.t0, tParse: performance.now() });
  }
};
export {};
