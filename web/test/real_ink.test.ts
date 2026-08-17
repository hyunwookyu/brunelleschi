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
import { skipReason } from "./dataDeps.js";
import { RULE_TOL } from "../src/s3d/vpRules.js";
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { maxTurn, representative, type Rep } from "../src/s3d/axis.js";
import { strokeLen2d } from "../src/s3d/stroke.js";
import { stat, median } from "./scene3d.js";
import type { Session, SessionStroke } from "../src/ui/sessionExport.js";
import type { Pt2 } from "../src/s3d/camera.js";

import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

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

/**
 * **`.brnl`(Doc2) 세션도 읽는다**(2026-08-17 지시 K). 앱의 현행 내보내기는 `.brnl 저장`이고
 * 옛 `s2s-session/1` 내보내기는 옛 UI의 것이다 — 아이패드에서 받는 실획은 이쪽으로 온다.
 */
interface BrnlDoc {
  format: string;
  imgSize: [number, number];
  rules?: { horizon: number; slots: ({ kind: string; at?: [number, number] } | null)[] } | null;
  askStats?: { asked: number; screen: number; depth: number; vertical: number; skipped: number };
  strokes: { id: string; pts2d: number[][]; seg3d: [number[], number[]] | null;
             axis: number | string; channel?: string; snapDistPx?: number | null }[];
}
function loadBrnl(): BrnlDoc[] {
  if (!existsSync(SESSIONS)) return [];
  return readdirSync(SESSIONS)
    .filter(f => f.endsWith(".brnl") || f.endsWith(".json"))
    .map(f => { try { return JSON.parse(readFileSync(resolve(SESSIONS, f), "utf-8")); }
                catch { return null; } })
    .filter((d): d is BrnlDoc => !!d && d.format === "s2s-doc/2");
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
  // **외부 데이터 의존**(`sessions/`) — 없으면 **대기 원장만 남기고 건너뛴다**.
  // ⚠ 초판은 `expect(true).toBe(true)`로 **통과 처리**했다 — 그것이 #32 그 자체다
  // (측정이 한 번도 안 돌았는데 초록으로 보인다). 이제 vitest가 **skip으로 보고**하고
  // 사유가 이름에 뜬다. `S2S_REQUIRE_DATA=1`이면 그 건너뛰기가 **실패로 바뀐다**.
  // ⚠ **대기 원장은 그대로 쓴다** — 그것이 "수단은 서 있고 표본이 없다"의 기록이고,
  // `quickdraw` 쪽과 달리 **덮을 지난 측정이 없다**(한 번도 안 쟀다).
  const NO_SESSIONS = skipReason("sessions");

  it("sessions/ 의 실획을 재고 원장에 남긴다. 표본이 없으면 대기 상태를 남긴다", ctx => {
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
      metric_defs: metricsSnapshot(),
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

    // ---- **지시 K — `.brnl` 세션의 지표**(2026-08-17). 표본이 있으면 함께 낸다.
    const brnl = loadBrnl();
    const K_DEFS = {
      channel_share: "채널(보조선/결과선/주석)별 획 수 — 지시 D의 사용 비율",
      snap_dist_px: "시작점의 겨냥 거리(px). **40px 프로브라 조리개 절단 없음**(리뷰어 [7]) — 스냅 여부는 snapStart로 가른다. 반경(현 15px)의 실측 근거",
      ask: "모호 물음 횟수(asked/answered/skipped) — AS-L14의 실측",
      stroke_len_ratio: "사람 획 길이 ÷ 캔버스 대각 — min_vp_len_ratio(0.04)의 실측 근거",
      below_min_vp_len: "min_vp_len_ratio 미달 획 수 / 사람 획 수. ⚠ **조각(pieceOf)은 분모에서 뺀다**(#11 — 지우개 산물은 사람 획과 단위가 다르다)",
      vertex_gap_ratio: "서로 다른 획의 3D 끝점 최근접 거리 ÷ 그림 크기. ⚠ **공유점(스냅 보장 0)은 갈라 센다**(#5) — zero_pairs가 그것이고 분포에는 안 섞는다",
      horizon_vp_dy_px: "지평선-수평 소실점 y차. **보장 확인**(#5·이론서 3.1 — 규칙상 0. 0이 아니면 저장 경로 결함)",
    };
    const kMetrics = (() => {
      if (!brnl.length) return { status: "awaiting_samples", n_docs: 0, metrics: K_DEFS,
        what_this_cannot_measure: [
          "AS-L9(지평선 ±120px 창) — 참 지평선이 없다. 대리 재적합 팔 미구현(DEFERRED)",
          "QUESTIONS f(축 스냅 손익분기 배수) — 참 카메라가 없다. AS-L9와 같은 구조(DEFERRED)",
          "QUESTIONS d·e(지평선 수평·롤) — 지평선이 스칼라 y라 자료구조상 항등(QUESTIONS d의 '박혀 있다')",
        ] };
      let n = 0, nPieces = 0, byChannel: Record<string, number> = {}, snapDists: number[] = [],
          asked = 0, answered = 0, skipped = 0, shortShare = 0, zeroPairs = 0;
      const lensR: number[] = [], vertexGaps: number[] = [], horizonDelta: number[] = [];
      for (const d of brnl) {
        const diag = Math.hypot(d.imgSize[0], d.imgSize[1]) || 1;
        const ends: number[][] = [];
        for (const st of d.strokes) {
          // **조각은 사람 획이 아니다**(#11) — 길이·채널 지표의 분모에서 뺀다. 따로 센다
          if ((st as { pieceOf?: string }).pieceOf) { nPieces += 1; continue; }
          n += 1;
          byChannel[st.channel ?? "guide"] = (byChannel[st.channel ?? "guide"] ?? 0) + 1;
          if (st.snapDistPx != null) snapDists.push(st.snapDistPx);
          const pts = st.pts2d;
          if (pts.length >= 2) {
            const L = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
            lensR.push(L / diag);
            if (L < RULE_TOL.min_vp_len_ratio * diag) shortShare += 1;
          }
          if (st.seg3d) ends.push(st.seg3d[0], st.seg3d[1]);
        }
        // **정점 산포**(지시 K) — 서로 다른 획의 3D 끝점 간 최근접 거리(그림 크기 대비)
        const scale = Math.max(1e-9, ...ends.map(p => Math.hypot(p[0], p[1], p[2])));
        for (let i = 0; i < ends.length; i++) {
          let best = Infinity;
          for (let j = 0; j < ends.length; j++) {
            if ((j >> 1) === (i >> 1)) continue;          // 같은 획의 두 끝은 제외
            const dd = Math.hypot(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1], ends[i][2] - ends[j][2]);
            if (dd < best) best = dd;
          }
          // **공유점(스냅이 만든 같은 3D 점)은 보장 0이다**(#5·리뷰어 [6]) — 갈라 센다
          if (Number.isFinite(best)) {
            if (best / scale < 1e-9) zeroPairs += 1;
            else vertexGaps.push(best / scale);
          }
        }
        if (d.askStats) { asked += d.askStats.asked; skipped += d.askStats.skipped;
          answered += d.askStats.screen + d.askStats.depth + d.askStats.vertical; }
        // **AS-L9 대리** — 사용자 지평선 vs 수평 소실점들의 y (규칙상 그 위라 0이면 보장이지
        // 측정이 아니다 — 값이 0이면 그렇게 읽는다, #5)
        const h = d.rules?.horizon;
        if (h != null) for (const sl of d.rules!.slots.slice(0, 2)) {
          if (sl && sl.kind === "vp" && sl.at) horizonDelta.push(Math.abs(sl.at[1] - h));
        }
      }
      return {
        status: "measured", n_docs: brnl.length, n_strokes: n, n_pieces: nPieces,
        metrics: K_DEFS,
        channel_share: byChannel,
        snap_dist_px: stat(snapDists, 2),
        ask: { asked, answered, skipped },
        stroke_len_ratio: stat(lensR, 4),
        below_min_vp_len: `${shortShare}/${n}`,
        vertex_gap_ratio: stat(vertexGaps, 4),
        vertex_zero_pairs: zeroPairs,
        horizon_vp_dy_px: stat(horizonDelta, 2),
        note_horizon: "**보장 확인이다**(#5) — 규칙상 수평 소실점은 지평선 위에 놓이므로 0이어야 하고, "
          + "0이 아니면 저장·복원 경로가 어긋난 것이다. AS-L9(사람이 ±120px 창에 드는가)는 "
          + "**참 지평선이 없어 실획으로 직접 못 잰다** — 대리 재적합 팔은 미구현(DEFERRED)",
      };
    })();

    if (!sessions.length) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(resolve(OUT, "real_ink.json"), JSON.stringify({
        ...base,
        k_metrics: kMetrics,
        status: "awaiting_samples",
        n_sessions: 0, n_strokes: 0,
        note: "**표본 없음.** 수단은 서 있고 측정은 사용자 획이 들어온 뒤다. AS-6·AS-12는 그때까지 잠정.",
      }, null, 2), "utf-8");
      // **통과로 세지 않는다**(#32) — 여기서 끝내면 "측정이 돌았다"로 읽힌다.
      // vitest의 동적 건너뛰기로 **skip으로 보고**한다.
      expect(NO_SESSIONS, "`sessions/`가 비었는데 등록처가 그것을 못 봤다").not.toBeNull();
      ctx.skip();
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
      k_metrics: kMetrics,
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
