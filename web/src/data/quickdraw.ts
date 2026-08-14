// Quick,Draw **raw** 로더 — data/quickdraw/*.ndjson ([x],[y],[t], RDP 미적용 원본 좌표).
//
// V-5b의 mouse_* 테스트 안에 있던 헬퍼를 꺼내 둔다(W-A a). 그 테스트들은 평면 파서를
// 재던 것이라 폐기했지만, **실획 자체는 W-0(획→엣지 매핑)의 유일한 실측 재료**다.
//
// 주의: Quick,Draw는 마우스로 그린 것이다. 애플펜슬 획을 대표한다는 보장이 없다
// (assumptions "Quick,Draw 노이즈가 애플펜슬 획을 대표한다" — 미검증 유지).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Capture, Stroke } from "../parser/types.js";

export function loadQuickDraw(root: string, word: string, limit: number): Capture[] {
  const p = resolve(root, "data/quickdraw", `${word}.ndjson`);
  if (!existsSync(p)) return [];
  const out: Capture[] = [];
  for (const ln of readFileSync(p, "utf-8").split("\n")) {
    if (!ln.trim()) continue;
    const d = JSON.parse(ln);
    if (d.recognized === false) continue;
    const strokes: Stroke[] = d.drawing
      .map((s: number[][], i: number) => ({
        points: s[0].map((x: number, k: number) => [x, s[1][k], s[2] ? s[2][k] : k, 0.5]),
        pen: "mass", seq: i,
      }))
      .filter((s: Stroke) => s.points.length >= 2);
    if (!strokes.length) continue;
    out.push({ frame: "persp", w: 320, h: 320, strokes });
    if (out.length >= limit) break;
  }
  return out;
}

export const QUICKDRAW_WORDS = ["square", "house", "castle", "skyscraper", "door", "line", "triangle"];
