// 실획 측정 — **표본이 들어오면 자동으로 돈다. 없으면 대기 상태를 원장에 남긴다.**
//
// 왜 미리 만드는가: 이 프로젝트의 가장 큰 위험 둘이 **표본 문제**다(AS-13).
// AS-6(한 획 = 한 축 위반율 0.699)과 AS-12(끝점 겨냥 오차)는 모두 Quick,Draw 낙서에서
// 나온 값이고 대상 사용자(스타일러스·투시도 숙련자)를 대표하지 않는다.
// **그 수치로 설계 결정을 하지 않기로 했으므로**, 대신 재측정 수단을 미리 세워 둔다.
//
// 쓰는 법: 앱에서 "획 내보내기" → 받은 JSON을 저장소의 `sessions/`에 넣는다 → 테스트를 돌린다.
// 산출: `stage0/out/real_ink.json`.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { maxTurn, representative, type Rep } from "../src/s3d/axis.js";
import { strokeLen2d } from "../src/s3d/stroke.js";
import { stat, median } from "./scene3d.js";
import type { Session, SessionStroke } from "../src/ui/sessionExport.js";
import type { Pt2 } from "../src/s3d/camera.js";

import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SESSIONS = resolve(ROOT, "sessions");

/** AS-6과 같은 임계를 쓴다 — 두 수치를 비교하려면 같은 자로 재야 한다. */
const TURN_DEG = 45;
const TURN_WINDOW = 0.12;

function loadSessions(): Session[] {
  if (!existsSync(SESSIONS)) return [];
  return readdirSync(SESSIONS)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(readFileSync(resolve(SESSIONS, f), "utf-8")) as Session)
    .filter(s => s.format === "s2s-session/1");
}

const xy = (s: SessionStroke): Pt2[] => s.raw.map(p => [p[0], p[1]] as Pt2);

/** 한 획에 방향이 둘 이상인가 — AS-6과 같은 정의(방향 급변). */
const multiAxis = (pts: Pt2[]) => maxTurn(pts, TURN_WINDOW) > TURN_DEG;

/**
 * **끝점 겨냥 오차**(AS-12) — 실획에서는 참 모서리를 모르므로 대용으로 잰다:
 * 서로 다른 획의 끝점 중 **가장 가까운 짝**까지의 거리 ÷ 그림 대각.
 * 두 획이 같은 모서리를 겨냥했다면 그 거리가 곧 겨냥 오차의 합이다.
 * (AS-8 스윕이 쓴 `closure_gap`은 *자기 시작점*으로 돌아오는 오차라 **다른 양**이었다 —
 * 그것이 상한이라는 근거가 없어 여기서 직접 잰다.)
 */
function endpointAimErrors(strokes: SessionStroke[], diag: number, maxRatio = 0.08): number[] {
  const ends: Pt2[][] = strokes.map(s => {
    const p = xy(s);
    return p.length >= 2 ? [p[0], p[p.length - 1]] : [];
  });
  const out: number[] = [];
  for (let i = 0; i < ends.length; i++) {
    for (const a of ends[i]) {
      let best = Infinity;
      for (let j = 0; j < ends.length; j++) {
        if (i === j) continue;
        for (const b of ends[j]) best = Math.min(best, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
      const r = best / diag;
      // 아무 획과도 만나려 하지 않은 끝점은 대상이 아니다(자유단). 상한으로 거른다.
      if (Number.isFinite(r) && r <= maxRatio) out.push(r);
    }
  }
  return out;
}

describe("실획 측정 (AS-6·AS-12 재측정 — S-10)", () => {
  it("sessions/ 의 실획을 재고 원장에 남긴다. 표본이 없으면 대기 상태를 남긴다", () => {
    const sessions = loadSessions();
    const metrics = {
      one_stroke_one_axis: "한 획에 방향이 둘 이상인 비율(AS-6). 합성/낙서 대비 기준: Quick,Draw 0.699",
      endpoint_aim_error: "다른 획 끝점까지의 최소 거리 ÷ 그림 대각(AS-12). 성립 구간 기준: ~0.01",
      unplaced_rate: "그린 획 중 3D에 안 놓인 비율. 합성 기준: 끝점 오차 1%에서 0.125",
      axis_accuracy: "판정률과 미분류 사유 분포. **정답이 없으므로 정확도는 못 낸다** — 분포만 본다",
      deviation_vs_field_angle: "부적합도 ↔ 화각. **S-2b(체계적 왜곡)의 근거 확인** — 바깥에서 커지는가",
    };
    const base = {
      spec: "실획 측정. 앱의 '획 내보내기'로 받은 세션을 sessions/ 에 넣으면 여기서 잰다.",
      constants: constantsSnapshot(),
      why: (
        "AS-6·AS-12는 Quick,Draw 낙서에서 나온 수치이고 대상 사용자를 대표하지 않는다(AS-13). "
        + "**그 수치로 설계 결정을 하지 않기로 했으므로** 재측정 수단을 먼저 세운다. "
        + "여기 값이 채워지기 전까지 두 전제는 잠정이다."
      ),
      metrics,
      how_to: [
        "1. 앱을 연다(개발 서버 또는 iPad — README 참조).",
        "2. 소실점을 확정하고 평소대로 그린다. 고쳐 그리지 말고 **평소 손대로** 긋는다.",
        "3. 하단 '획 내보내기'를 누른다.",
        "4. 받은 JSON을 저장소의 `sessions/`에 넣고 `npx vitest run test/real_ink.test.ts`.",
      ],
    };

    if (!sessions.length) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(resolve(OUT, "real_ink.json"), JSON.stringify({
        ...base,
        status: "awaiting_samples",
        n_sessions: 0, n_strokes: 0,
        note: "**표본 없음.** 수단은 서 있고 측정은 사용자 획이 들어온 뒤다. AS-6·AS-12는 그때까지 잠정.",
      }, null, 2), "utf-8");
      expect(true).toBe(true);
      return;
    }

    // ---- 표본이 있다: 잰다 ----
    let nStrokes = 0, nMulti = 0, nPlaced = 0, nFree = 0;
    const byReason: Record<string, number> = {};
    const aimErrors: number[] = [];
    const misfitByAngle = new Map<number, number[]>();
    const lens: number[] = [];

    for (const S of sessions) {
      const pts = S.strokes.map(xy);
      const xs = pts.flat().map(p => p[0]), ys = pts.flat().map(p => p[1]);
      if (!xs.length) continue;
      const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
      aimErrors.push(...endpointAimErrors(S.strokes, diag));

      S.strokes.forEach((s, i) => {
        nStrokes += 1;
        byReason[s.reason] = (byReason[s.reason] ?? 0) + 1;
        if (s.placed) nPlaced += 1;
        if (s.axis === "free") nFree += 1;
        if (pts[i].length >= 2) {
          if (multiAxis(pts[i])) nMulti += 1;
          lens.push(strokeLen2d(pts[i]) / diag);
        }
        // S-2b 근거 확인 — 부적합도가 화각 바깥에서 커지는가
        const P = S.camera.principal, f = S.camera.f;
        const rep: Rep | null = s.rep ? { a: s.rep.a, b: s.rep.b, len: s.rep.len, bend: s.rep.bend }
                                     : representative(pts[i]);
        if (P && f && rep && s.misfit != null) {
          const t = Math.hypot((rep.a[0] + rep.b[0]) / 2 - P[0], (rep.a[1] + rep.b[1]) / 2 - P[1]) / f;
          const bin = Math.min(4, Math.floor(t / 0.25));
          if (!misfitByAngle.has(bin)) misfitByAngle.set(bin, []);
          misfitByAngle.get(bin)!.push(s.misfit);
        }
      });
    }

    const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);
    const report = {
      ...base,
      status: "measured",
      n_sessions: sessions.length,
      n_strokes: nStrokes,
      as6_multi_axis_rate: rate(nMulti, nStrokes),
      as6_reference_quickdraw: 0.699,
      as12_endpoint_aim_error: stat(aimErrors, 4),
      as12_reference_operating_range: 0.01,
      unplaced_rate: rate(nStrokes - nPlaced, nStrokes),
      unclassified_rate: rate(nFree, nStrokes),
      by_reason: byReason,
      stroke_len_ratio: stat(lens, 4),
      misfit_by_field_angle: Object.fromEntries(
        [...misfitByAngle.keys()].sort((a, b) => a - b).map(b => [
          `tan_${(b * 0.25).toFixed(2)}~${((b + 1) * 0.25).toFixed(2)}`,
          stat(misfitByAngle.get(b)!, 4),
        ])),
      caveat: (
        "**정답이 없다.** 실획에는 '이 획이 어느 축이어야 하는가'라는 라벨이 없으므로 "
        + "정확도·조용히 틀림은 낼 수 없고 **분포만** 낸다. 합성 측정을 대체하는 것이 아니라 "
        + "합성이 대표하는지를 확인하는 것이다(V-o)."
      ),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "real_ink.json"), JSON.stringify(report, null, 2), "utf-8");
    expect(nStrokes).toBeGreaterThan(0);
    expect(median(aimErrors)).not.toBeNull();
  });
});
