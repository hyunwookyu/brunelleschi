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
  rules?: { horizon: number; slots: ({ kind: string; at?: [number, number]; source?: string } | null)[] } | null;
  askStats?: { asked: number; screen: number; depth: number; vertical: number; skipped: number };
  pathStats?: { direct: number; lift: number; twoPoint: number };
  strokes: { id: string; pts2d: number[][]; seg3d: [number[], number[]] | null;
             axis: number | string; channel?: string; snapDistPx?: number | null;
             snapStart?: { kind: string } | null; snapEnd?: { kind: string } | null }[];
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

/**
 * **소실점 방향 오차(°)**(7차) — 획 현(a→b)과 시작점→소실점 방향의 각차. 방향 부호는
 * 무시한다(축은 부호가 없다). 퇴화(길이 0·시작점=소실점)는 null.
 * 집계와 반례 테스트가 **같은 함수**를 쓴다(#17).
 */
export function vpDirErrDeg(a0: Pt2, b0: Pt2, vp: Pt2): number | null {
  const u: Pt2 = [b0[0] - a0[0], b0[1] - a0[1]];
  const v: Pt2 = [vp[0] - a0[0], vp[1] - a0[1]];
  const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
  if (lu < 1e-9 || lv < 1e-9) return null;
  const c = Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]) / (lu * lv));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * **7차 이전 저장본의 snapDistPx 0 오염인가** — 옛 정의는 스냅이 걸리면 `cand.dist`를
 * 적었고 핀 상태에서 on_face가 항상 걸려 전부 0이 됐다(실획 첫 표본). 새 정의(aimDistPx)는
 * on_face를 빼고 최근접 정밀 대상을 재므로, on_face 시작 + 정확히 0은 옛 정의의 서명이다.
 * 두 정의를 한 분포에 섞지 않는다(#11).
 */
export const isLegacySnapZero = (st: { snapDistPx?: number | null; snapStart?: { kind: string } | null }): boolean =>
  st.snapStart?.kind === "on_face" && st.snapDistPx === 0;

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
      snap_dist_px: "시작점의 겨냥 거리(px) — **7차 항목 2가 정의를 수리했다**(#23 정의 갱신 — ⚠ 이 정의들은 metric_defs 해시(metrics.ts 함수 집합) **밖**이라 정의 변경을 STALE이 못 잡는다(#33 — 부르는 하네스만 덮는다). 사람이 본다): 스냅 성패와 무관하게, 스냅 전 원시 시작점에서 40px 프로브 안 **최근접** 정밀 대상(on_face 제외)까지의 거리(aimDistPx 하나 — 없으면 null). 반경(현 15px)의 실측 근거. ⚠ **분포는 40px에서 절단된다**(#13 — 3·4-R [2]) — 그 밖은 null로 사라지므로 **null 건수와 분모를 `snap_dist_null`로 함께 낸다**(#11). null의 뜻은 셋이 섞여 있다(40px 밖 겨냥 · 3D 대상 없음 · 확정 전 획) — 기록 시점 갈래 필드는 다음 개정(DEFERRED). 40px·15px·프로브 규약은 표본 전에 박힌 **동작점**이다(#12 — 반경 판정은 null 몫을 보고 한다). ⚠ **7차 이전 저장본은 이 정의가 아니다** — 스냅이 걸리면 cand.dist를 적었고 핀 상태에서 on_face가 항상 걸려 **전부 0으로 오염**됐다(실획 첫 표본의 사람 보고가 그랬다 — 원장 밖·미검증). `snapStart.kind === on_face && snapDistPx === 0`인 표본은 분포에서 갈라 센다(#11)",
      snap_dist_legacy_zero: "7차 이전 저장본의 snapDistPx 0 오염 건수(on_face 시작 + 정확히 0 — isLegacySnapZero, D-L79). 분포(snap_dist_px)에 안 섞는 몫의 크기다",
      snap_dist_null: "snapDistPx가 null인 획 수 / 사람 획 수 — 40px 프로브 **밖**(절단 #13) 또는 3D 대상 없음·확정 전. 반경 판정은 이 몫과 함께 읽는다(#11 — 분모가 전부인가)",
      ask: "모호 물음 횟수(asked/answered/skipped) — AS-L14의 실측",
      stroke_len_ratio: "사람 획 길이 ÷ 캔버스 대각 — min_vp_len_ratio(0.04)의 실측 근거",
      below_min_vp_len: "min_vp_len_ratio 미달 획 수 / 사람 획 수. ⚠ **조각(pieceOf)은 분모에서 뺀다**(#11 — 지우개 산물은 사람 획과 단위가 다르다)",
      vertex_gap_ratio: "서로 다른 획의 3D 끝점 최근접 거리 ÷ 그림 크기. ⚠ **공유점(스냅 보장 0)은 갈라 센다**(#5) — zero_pairs가 그것이고 분포에는 안 섞는다",
      horizon_vp_dy_px: "지평선-수평 소실점 y차. **보장 확인**(#5·이론서 3.1 — 규칙상 0. 0이 아니면 저장 경로 결함)",
      n_pieces: "조각(pieceOf 있는 획) 수 — 사람 획과 단위가 다르므로(#11) 갈라 세는 분모 재료다(4차 재검 [8]로 정의 등재)",
      vertex_zero_pairs: "정점 산포에서 갈라 센 공유점(<1e-9) 쌍 수 — 스냅 보장 0의 몫(#5. 원장 필드명, 4차 재검 [8]로 등재)",
      vp_confirm_source: "소실점 확정 경로 분포(6차 지시 3 — rules.slots[*].source): picked_point=찍기 · two_lines=교점 · 그 외. 이월-3의 합성 대조(찍기 pick_0 축 오차 2.67° 대 two_lines 31.61°, pick_vp.json)가 동기다 — **실사용에서 어느 쪽을 쓰는지**가 여기서 나온다",
      path_use: "배치 경로 분포(6차 지시 3 — pathStats): direct=1점 직접 좌표 · lift=카메라 투영 · twoPoint=양 끝 스냅. **지시 2(1점 직접)가 실제로 쓰이는지**의 분자·분모다. ⚠ 카운터는 저장 시점의 세션 것이다(불러오기로 이어지지 않는다 — askStats와 같은 규약)",
      snap_use: "스냅 사용 분포(7차 지시 항목 2·4 — 실획 첫 표본의 결함 지표): snapStart 종류별 획 수 · snapEnd 있는 획 수 / 3D 획 수. **끝점 스냅이 실제로 걸리는지**가 여기서 나온다. ⚠ 첫 표본의 **사람 보고**(파일 미도착 — 원장 밖·미검증, AS-C1 7차 주석)는 끝점 스냅 0/획 5이었다 — 보고이지 기준선이 아니다(3·4-R [8]). 파일이 오면 이 지표가 실측한다",
      vp_dir_err_deg: "수평축(0·1) 배정 획의 **2D 현 방향**과 시작점→그 축 소실점 방향의 각차(°) — 사람이 소실점을 향해 얼마나 정확히 긋는가의 화면 오차. 첫 표본의 사람 보고(원장 밖·미검증) Δ0.0~1.7°를 하네스가 재현하는 자리다. ⚠⚠ **합성의 축 오차(rule_camera deg_median — 3D 축 방향 오차)와는 다른 양·다른 프레임이다**(3·4-R [1]): 화면 오차는 3D 각으로 증폭된다(AS-L8 — 먼 소실점 100px ≈ 2~3°). 실획의 3D 축 오차는 참 축이 없어 못 잰다(what_this_cannot_measure). ⚠ **선택 절단이 있다**(#5): 축 배정 자체가 같은 각류 판정(vpMisfit ≤ 0.06)을 지나므로 분포가 배정 허용치 안에 갇힌다 — 배정 밖(미분류) 획의 겨냥 오차는 이 지표에 안 나온다. 축 배정은 정답 라벨도 아니다(caveat와 같은 유보)",
    };
    const kMetrics = (() => {
      if (!brnl.length) return { status: "awaiting_samples", n_docs: 0, metrics: K_DEFS,
        what_this_cannot_measure: [
          "AS-L9(지평선 ±120px 창) — 참 지평선이 없다. 대리 재적합 팔 미구현(DEFERRED)",
          "QUESTIONS f(축 스냅 손익분기 배수) — 참 카메라가 없다. AS-L9와 같은 구조(DEFERRED)",
          "QUESTIONS d·e(지평선 수평·롤) — 지평선이 스칼라 y라 자료구조상 항등(QUESTIONS d의 '박혀 있다')",
          "**확정 전(2D 오스냅) 겨냥**(4차 재검 [5]) — snap_dist_px의 표본이 3D 오스냅뿐이라 보조선 단계(작도의 본체)의 겨냥 분포는 이 계기로 안 잡힌다(D-L56 덮는 범위 축소 · DEFERRED '2D 오스냅의 겨냥 거리 기록')",
          "**실획의 3D 축 방향 오차**(3·4-R [1]) — 참 축이 없다. vp_dir_err_deg는 화면(2D) 오차이고 합성의 deg_median(3D)과 비교 불가",
        ] };
      let n = 0, nPieces = 0, byChannel: Record<string, number> = {}, snapDists: number[] = [],
          asked = 0, answered = 0, skipped = 0, shortShare = 0, zeroPairs = 0;
      let legacyZero = 0, nLifted = 0, nSnapEnd = 0, snapDistNull = 0;
      const snapStartKinds: Record<string, number> = {};
      const vpDirErrs: number[] = [];
      const vpSource: Record<string, number> = {};
      const pathUse = { direct: 0, lift: 0, twoPoint: 0 };
      const lensR: number[] = [], vertexGaps: number[] = [], horizonDelta: number[] = [];
      for (const d of brnl) {
        const diag = Math.hypot(d.imgSize[0], d.imgSize[1]) || 1;
        const ends: number[][] = [];
        for (const st of d.strokes) {
          // **조각은 사람 획이 아니다**(#11) — 길이·채널 지표의 분모에서 뺀다. 따로 센다
          if ((st as { pieceOf?: string }).pieceOf) { nPieces += 1; continue; }
          n += 1;
          byChannel[st.channel ?? "guide"] = (byChannel[st.channel ?? "guide"] ?? 0) + 1;
          // **7차 이전 저장본의 on_face 0 오염을 가른다**(#11 — K_DEFS.snap_dist_px)
          if (st.snapDistPx != null) {
            if (isLegacySnapZero(st)) legacyZero += 1;
            else snapDists.push(st.snapDistPx);
          } else snapDistNull += 1;         // 40px 밖·대상 없음·확정 전 — 절단의 몫(#13·#11)
          // **스냅 사용 분포**(7차 — 첫 표본의 결함 지표)
          if (st.snapStart) snapStartKinds[st.snapStart.kind] = (snapStartKinds[st.snapStart.kind] ?? 0) + 1;
          if (st.seg3d) { nLifted += 1; if (st.snapEnd) nSnapEnd += 1; }
          // **소실점 방향 오차**(7차) — 수평축 배정 획의 현 방향 vs 시작점→소실점 방향
          if (typeof st.axis === "number" && st.axis <= 1 && st.pts2d.length >= 2) {
            const sl = d.rules?.slots?.[st.axis];
            if (sl && sl.kind === "vp" && sl.at) {
              const a0: Pt2 = [st.pts2d[0][0], st.pts2d[0][1]];
              const b0: Pt2 = [st.pts2d[st.pts2d.length - 1][0], st.pts2d[st.pts2d.length - 1][1]];
              const e = vpDirErrDeg(a0, b0, sl.at);
              if (e != null) vpDirErrs.push(e);
            }
          }
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
        if (d.pathStats) { pathUse.direct += d.pathStats.direct;
          pathUse.lift += d.pathStats.lift; pathUse.twoPoint += d.pathStats.twoPoint; }
        for (const sl of d.rules?.slots ?? []) {
          if (sl && sl.kind === "vp") vpSource[sl.source ?? "unknown"] = (vpSource[sl.source ?? "unknown"] ?? 0) + 1;
        }
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
        snap_dist_legacy_zero: legacyZero,
        snap_dist_null: `${snapDistNull}/${n}`,
        snap_use: { start_kinds: snapStartKinds, end_snapped: `${nSnapEnd}/${nLifted}` },
        vp_dir_err_deg: stat(vpDirErrs, 2),
        ask: { asked, answered, skipped },
        vp_confirm_source: vpSource,
        path_use: pathUse,
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

  // **새 지표의 반례 테스트**(A-4 — 지표가 의도한 것을 재는지. 표본 없이도 돈다)
  it("vp_dir_err_deg — 정확히 향하면 0, 5° 틀면 ≈5, 퇴화는 null (반례)", () => {
    const a: Pt2 = [100, 300], vp: Pt2 = [1100, 200];
    // 정확히 소실점을 향한 현
    expect(vpDirErrDeg(a, [600, 250], vp)!).toBeLessThan(1e-9);
    // 5° 튼 현 — 지표가 실제로 움직인다(#5의 판별법: 틀린 입력에 지표가 반응하는가)
    const th = Math.atan2(200 - 300, 1100 - 100) + (5 * Math.PI) / 180;
    const b5: Pt2 = [a[0] + 500 * Math.cos(th), a[1] + 500 * Math.sin(th)];
    expect(Math.abs(vpDirErrDeg(a, b5, vp)! - 5)).toBeLessThan(1e-6);
    // 반대 방향으로 그어도 같다 — 축은 부호가 없다
    const bRev: Pt2 = [a[0] - 500 * Math.cos(th), a[1] - 500 * Math.sin(th)];
    expect(Math.abs(vpDirErrDeg(a, bRev, vp)! - 5)).toBeLessThan(1e-6);
    // 퇴화 — 길이 0 · 시작점이 소실점 위(방향이 없다)
    expect(vpDirErrDeg(a, a, vp)).toBeNull();
    expect(vpDirErrDeg(vp, [1200, 180], vp)).toBeNull();
  });

  it("snap_dist_legacy_zero — 옛 정의(on_face·0)만 갈라지고 새 정의 값은 분포에 남는다 (반례)", () => {
    expect(isLegacySnapZero({ snapDistPx: 0, snapStart: { kind: "on_face" } })).toBe(true);
    // 새 정의의 정당한 값들은 안 갈린다
    expect(isLegacySnapZero({ snapDistPx: 12.4, snapStart: { kind: "on_face" } })).toBe(false);
    expect(isLegacySnapZero({ snapDistPx: 0, snapStart: { kind: "endpoint" } })).toBe(false);
    expect(isLegacySnapZero({ snapDistPx: null, snapStart: { kind: "on_face" } })).toBe(false);
    expect(isLegacySnapZero({ snapDistPx: 0, snapStart: null })).toBe(false);
  });
});
