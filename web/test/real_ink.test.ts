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
import { RULE_TOL, beyondSegment } from "../src/s3d/vpRules.js";
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
import { OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SESSIONS = resolve(ROOT, "sessions");

/** AS-6과 같은 임계를 쓴다 — 두 수치를 비교하려면 같은 자로 재야 한다. */
const TURN_DEG = 45;
const TURN_WINDOW = 0.12;
/**
 * **`vp_dir_err_deg_fov_ok` 분포의 층화 절단**(분석 기준 — 앱 판정 아님).
 * ⛔ 옛 출처는 `FOV_GATE.reject_fov_deg`(120 — 12차 상한)였고 14차 지시 1(D-L93)이 그
 * 상한을 앱에서 제거했다. 이 분포의 정의("극단 카메라 문서를 뺀 Δ")는 유지할 가치가
 * 있으므로(지렛대 증폭 층화 — 13차 리뷰어 2차 [14]) 값을 그대로 분석 상수로 남긴다.
 * 이론서 18.4의 참고 기준 연장이고, 확정 여부와 무관하다.
 */
const STABLE_FOV_CUTOFF_DEG = 120;

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
             snapStart?: { kind: string } | null; snapEnd?: { kind: string } | null;
             /** **2D 단계 오스냅 기록**(9차 항목 1 · D-L81). 옛 저장본에는 없다 */
             snap2dStart?: { kind: string; at: [number, number]; distPx: number } | null;
             snap2dEnd?: { kind: string; at: [number, number]; distPx: number } | null }[];
}
function loadBrnl(): { file: string; doc: BrnlDoc }[] {
  if (!existsSync(SESSIONS)) return [];
  return readdirSync(SESSIONS)
    .filter(f => f.endsWith(".brnl") || f.endsWith(".json"))
    .map(f => { try { return { file: f, doc: JSON.parse(readFileSync(resolve(SESSIONS, f), "utf-8")) }; }
                catch { return null; } })
    .filter((e): e is { file: string; doc: BrnlDoc } => !!e && e.doc?.format === "s2s-doc/2");
}

const xy = (s: SessionStroke): Pt2[] => s.raw.map(p => [p[0], p[1]] as Pt2);

/**
 * **소실점 방향 오차(°)**(7차) — 정의는 `vpDirErr.ts` 하나다(#17 — 12차에 옮겼다:
 * 회귀 팔 `vp_dir_consistency.test.ts`가 하네스 파일을 import하지 않고 같은 함수를
 * 쓰기 위해서다). 집계와 반례 테스트가 같은 함수를 쓴다.
 */
import { vpDirErrDeg } from "./vpDirErr.js";
export { vpDirErrDeg };

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
 * **반경 8 되돌림 판**(지시 0-c — 사전등록 조건, 11차 리뷰어 [9] · #12):
 * `snap_dist_px.p10 > 조리개`면 다시 연다. 분포가 비면 판정 불가(null).
 * 집계와 반례 테스트가 같은 함수를 쓴다(#17).
 *
 * ⚠⚠ **15차 D-L103(호버 잠금) 이후 표본에는 그대로 못 쓴다** — 잠금으로 붙은 획은
 * 이 거리가 조리개보다 클 수 있다(전제가 깨졌다). 원장의 `radius8_revert_condition`
 * 산문이 그 유보를 든다. 지금 표본은 전부 15차 이전이다.
 */
export const radius8Reopen = (p10: number | null, aperturePx: number): boolean | null =>
  p10 == null ? null : p10 > aperturePx;

/**
 * **주점 가정의 f/W·화각**(지시 0-f — 이론서 6.2 f² = |PV₁||PV₂|).
 * ⚠ 가정은 **주점 = [W/2, 지평선 y]**(롤 0 · 피치 성분을 지평선이 담는다)이다 — 이것이
 * **앱의 확정 카메라(`CamState.ctx`)와 같은 규약**이고(재구성에서 principal이 [W/2, 지평선 y]로
 * 나오는 것을 확인했다 — `first_anchor.json`), 그래서 f² = −(v₁ₓ−pₓ)(v₂ₓ−pₓ)에 y항이 없다.
 * ⚠⚠ **`fovGate`(D-L68 · confirm_rules)의 규약과 다르다** — 그쪽은 주점 [W/2, H/2]에
 * −h²(지평선-주점 y차) 항을 더한다. 같은 파일의 f/W·화각이 두 원장에서 다른 것은
 * **규약 차이**이지 오류가 아니다(13차 리뷰어 [9]) — 게이트 판정 인용은 confirm_rules,
 * 앱 카메라 인용은 이 필드를 쓴다. 주점이 두 소실점 사이에 없으면(f² ≤ 0) null.
 */
export function assumedFov(v1x: number, v2x: number, W: number): { f_over_w: number; fov_deg: number } | null {
  const px = W / 2;
  const f2 = -(v1x - px) * (v2x - px);
  if (f2 <= 0) return null;
  const f = Math.sqrt(f2);
  return { f_over_w: +(f / W).toFixed(4),
           fov_deg: +((2 * Math.atan(W / 2 / f) * 180) / Math.PI).toFixed(2) };
}

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
      /**
       * **12차 두 표본의 사람 보고 등재**(2026-08-18 12차 지시 · 항목 5).
       * ⚠⚠ **측정이 아니다** — 파일이 이번에도 저장소에 도착하지 않았다(b4f2d9b 선례:
       * 지시문 수치는 사람 보고로만 기록). 파일이 오면 이 하네스가 같은 K 지표를
       * 실좌표로 내고 이 블록은 대조 기록이 된다. 값은 원장 밖 검증 불가(#25의 자리 —
       * 그래서 `human_reported: true`를 모든 판에 박고 어떤 임계·게이트도 안 건다).
       */
      reported_samples_12: {
        human_reported: true,
        /**
         * **파일이 도착해 대조 기록이 됐다**(2026-08-19 지시 0-a). 실측은 `k_metrics`
         * (문서별은 `k_metrics.per_doc`)가 같은 지표를 실좌표로 낸다 — 인용은 그쪽을 쓴다.
         */
        superseded_by_measurement: "k_metrics.per_doc (2026-08-19 — sessions/에 세 파일)",
        source: "12차 지시문(2026-08-18) — brunelleschi-2026-08-18T15-16-18(파일1 · 13획) · "
              + "…T15-18-25_brnl_2(파일2 · 11획). 당시 파일은 sessions/에 없었다 — 2026-08-19에 도착",
        k_reported: {
          snap2d_fired: { file1: "0/13", file2: "6/11",
                          note: "파일2에서 endpoint·vertex·intersection 전부 발화 — #18 닫힘(보고)",
                          discrepancy_2026_08_19: "⚠ 실측과 **어긋난다**(13차 리뷰어 [4]): 2D 시작 발화는 "
                            + "`per_doc[15-18-25].snap2d.start`(3)다. 보고의 6은 2D·3D·시작·끝을 합친 "
                            + "**스냅 기록 보유 획 수**로 읽으면 실측과 맞는다 — `snapped_any_ids`가 그 집합이다" },
          asked: { file1: "3/13", file2: "3/11", note: "이전 보고 6/5에서 감소. ⚠ D-L89(12차 "
                 + "항목 4)가 애매 물음을 지웠으므로 다음 표본의 이 수는 다른 규칙 아래 값이다" },
          placed_3d: { file1: "0/13", file2: "6/11",
                       note: "파일2 스냅 6 = seg3d 6 — D-L83이 의도대로(보고). 파일1은 스냅 0으로 전량 대기",
                       discrepancy_2026_08_19: "⚠⚠ **등식이 집합으로는 깨진다**(13차 리뷰어 [4]): 6 = 6은 "
                         + "수만 같고 `snapped_any_ids` ≠ `lifted_ids`다 — 스냅인데 미배치인 획과 "
                         + "**시작점 앵커 없이 배치된 획**(`lifted_no_snapstart_ids`)이 둘 다 있다. "
                         + "후자의 경로(일괄 풀이/twoPoint/direct)는 저장본이 획별로 안 적어 못 가른다"
                         + "(DEFERRED — 획별 placeBy 저장). 'D-L83이 의도대로'를 이 등식으로 인용하지 않는다" },
          f_over_w: { file1: 0.431, file2: 0.074,
                      note: "지시 표기 'd/W'의 d는 시거리(= f) — 판독 근거는 confirm_rules.json의 "
                          + "real_ink_reported_12.source. 파일2는 화각 163° — ⛔ 12차 상한의 "
                          + "거부 대역이었으나 14차 지시 1(D-L93)로 상한이 제거돼 확정이 서는 "
                          + "것이 현행 명세다(층화 절단은 vp_dir_err_deg_fov_ok_cutoff)" },
          vp_dir_err_deg_reported: {
            file1: [["s42", 0, 1.33], ["s41", 0, 12.81], ["s44", 1, 10.32]],
            file2: [["s78", 1, 0.0], ["s65", 0, 20.8], ["s66", 1, 16.59]],
            note: "[획 id, 축, Δ°]. (12차 보고 시점 산문 — **연혁이다**, 13차 리뷰어 2차 [6]: "
                + "아래 caveat가 현행 판정이다) s78만 snapStart 보유 — 항목 2가 그 상관(앵커 유무 = "
                + "방향 정착 유무)을 원인으로 확인했다고 적었다. 이전 표본 보고 Δ0.0~1.7과 대푯값이 "
                + "갈리고, 무엇이 갈랐는지는 표본이 와야 분해된다(RULE_TOL.concurrent_deg의 근거 주석)",
            caveat_2026_08_19: "⚠⚠ 실측에서 s78의 Δ는 **정확히 0 = 보장**으로 갈린다(#5 — "
              + "`per_doc[*].vp_dir_err_strokes`의 guaranteed 표식. 자기 소실점의 항등이든 되쓰기의 "
              + "항등이든 구조 산물이다). **그 0을 '무앵커가 Δ를 키운다'(후보 ②)의 증거로 쓰지 "
              + "않는다**(13차 리뷰어 [1]) — 위 note의 인과 문장은 그래서 연혁으로 내린다. "
              + "'스냅 획만 Δ≈0'도 성립하지 않는다: 08-17 파일의 on_face 스냅 획들이 Δ≠0인데, "
              + "⚠ 그 기록 자체가 옛 on_face 자동 부착(핀 상태에서 항상 걸림 — legacy 오염, "
              + "K_DEFS.snap_dist_px)의 것이라 **방향 스냅의 반례가 아니라 '자동 on_face는 방향을 "
              + "정착시키지 않는다'까지만** 말한다(리뷰어 2차 [7] — 철회의 주 근거는 #5 하나로 선다)" },
          note_channel_leak: { strokes: ["s52", "s53"],
                               note: "note 채널인데 축 판정을 탔다(보고) — 12차 항목 4-c가 배선을 "
                                   + "바꿨다(그리기·미리보기의 판정 제외 + 주석 전환 시 axis 소거). "
                                   + "⚠ **수리 주장이지 관측이 아니다**(3차 리뷰어 [13]) — 전용 회귀 "
                                   + "팔이 없고 파일 부재로 실측 불가. 파일이 오면 이 획들이 대조다",
                               checked_2026_08_19: "파일 대조 결과(13차 리뷰어 [6]) — **저장본으로는 확인 "
                                 + "불가다**: s52·s53은 axis \"free\"·seg3d null로 저장돼 있어 '판정을 "
                                 + "탔다'(물음이 떴다·축이 붙었다)의 흔적이 필드에 안 남는 형태다. "
                                 + "획별 물음 기록이 없고(askStats는 세션 합계) 이 표본은 수리 이전 "
                                 + "저장본이라 수리의 회귀 검증도 아니다. 확인 불가로 남긴다 — 전용 "
                                 + "회귀 팔은 DEFERRED 그대로" },
        },
      },
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
      snap_dist_px: "시작점의 겨냥 거리(px) — **7차 항목 2가 정의를 수리했다**(#23 정의 갱신 — ⚠ 이 정의들은 metric_defs 해시(metrics.ts 함수 집합) **밖**이라 정의 변경을 STALE이 못 잡는다(#33 — 부르는 하네스만 덮는다). 사람이 본다): 스냅 성패와 무관하게, 스냅 전 원시 시작점에서 40px 프로브 안 **최근접** 정밀 대상(on_face 제외)까지의 거리(aimDistPx 하나 — 없으면 null). 반경(`OSNAP_RADIUS_PX` — D-L85로 기본 **8px**, 설정 4~40px 가변)의 실측 근거. ⚠ **분포는 40px에서 절단된다**(#13 — 3·4-R [2]) — 그 밖은 null로 사라지므로 **null 건수와 분모를 `snap_dist_null`로 함께 낸다**(#11). null의 뜻은 셋이 섞여 있다(40px 밖 겨냥 · 3D 대상 없음 · 확정 전 획) — 기록 시점 갈래 필드는 다음 개정(DEFERRED). 40px 프로브·반경(정의 시점 15px — D-L85가 8px로 줄였다)·프로브 규약은 표본 전에 박힌 **동작점**이다(#12 — 반경 판정은 null 몫을 보고 한다). ⚠ **7차 이전 저장본은 이 정의가 아니다** — 스냅이 걸리면 cand.dist를 적었고 핀 상태에서 on_face가 항상 걸려 **전부 0으로 오염**됐다(실획 첫 표본의 사람 보고가 그랬다 — 원장 밖·미검증). `snapStart.kind === on_face && snapDistPx === 0`인 표본은 분포에서 갈라 센다(#11)",
      snap_dist_legacy_zero: "7차 이전 저장본의 snapDistPx 0 오염 건수(on_face 시작 + 정확히 0 — isLegacySnapZero, D-L79). 분포(snap_dist_px)에 안 섞는 몫의 크기다",
      snap_dist_null: "snapDistPx가 null인 획 수 / 사람 획 수 — 40px 프로브 **밖**(절단 #13) 또는 3D 대상 없음·확정 전. 반경 판정은 이 몫과 함께 읽는다(#11 — 분모가 전부인가)",
      ask: "모호 물음 횟수(asked/answered/skipped) — AS-L14의 실측. **내역(screen·depth·vertical)과 `unaccounted`(= asked − answered − skipped)를 함께 낸다**(9차 항목 1 · 9-R′ [R6]) — 첫 표본에서 asked 6 · answered 4로 **2가 어느 칸에도 안 잡혔고**, 그것이 취소인지 카운터 누락인지 원장이 답할 수 있어야 한다",
      img_size: "문서의 캔버스 크기(px) 목록 — `stroke_len_ratio`·`below_min_vp_len`의 분모이고, 문서가 그 값을 인용할 때 원장에 있어야 한다(9-R′ [R7])",
      snap2d_use: "**확정 전(2D 단계) 오스냅 기록**(9차 항목 1 · D-L81): 시작·끝 각각 기록된 획 수 / 사람 획 수, 그리고 `field_present` — **획에 `snap2dStart`/`snap2dEnd` 키가 존재하는 획 수다(값이 null이어도 센다)**. D-L81 이후 저장 형식은 안 걸린 획에도 키를 null로 쓰므로 키 존재가 형식의 서명이고, 그래서 발화 0과 미기록이 갈린다(13차 리뷰어 [7]로 정의를 명확화 — '필드가 있는 문서'라는 옛 문구는 키 존재를 뜻했다). ⚠⚠ **`field_present`가 0이면 그 표본은 D-L81 이전 저장본**이라 `0/n`이 '안 걸렸다'가 아니라 **'안 적혔다'**다(#32 — 미실행을 반증으로 처리하지 않는다). 8차가 `snapEnd` 0/5에서 한 오독이 그 자리다",
      stroke_len_ratio: "사람 획 길이 ÷ 캔버스 대각 — min_vp_len_ratio(0.04)의 실측 근거",
      below_min_vp_len: "min_vp_len_ratio 미달 획 수 / 사람 획 수. ⚠ **조각(pieceOf)은 분모에서 뺀다**(#11 — 지우개 산물은 사람 획과 단위가 다르다)",
      vertex_gap_ratio: "서로 다른 획의 3D 끝점 최근접 거리 ÷ 그림 크기. ⚠ **공유점(스냅 보장 0)은 갈라 센다**(#5) — zero_pairs가 그것이고 분포에는 안 섞는다",
      horizon_vp_dy_px: "지평선-수평 소실점 y차. **보장 확인**(#5·이론서 3.1 — 규칙상 0. 0이 아니면 저장 경로 결함)",
      n_pieces: "조각(pieceOf 있는 획) 수 — 사람 획과 단위가 다르므로(#11) 갈라 세는 분모 재료다(4차 재검 [8]로 정의 등재)",
      vertex_zero_pairs: "정점 산포에서 갈라 센 공유점(<1e-9) 쌍 수 — 스냅 보장 0의 몫(#5. 원장 필드명, 4차 재검 [8]로 등재)",
      vp_confirm_source: "소실점 확정 경로 분포(6차 지시 3 — rules.slots[*].source): picked_point=찍기 · two_lines=교점 · 그 외. 이월-3의 합성 대조(찍기 pick_0 축 오차 2.67° 대 two_lines 31.61°, pick_vp.json)가 동기다 — **실사용에서 어느 쪽을 쓰는지**가 여기서 나온다",
      path_use: "배치 경로 분포(6차 지시 3 — pathStats): direct=1점 직접 좌표 · lift=카메라 투영 · twoPoint=양 끝 스냅. **지시 2(1점 직접)가 실제로 쓰이는지**의 분자·분모다. ⚠ 카운터는 저장 시점의 세션 것이다(불러오기로 이어지지 않는다 — askStats와 같은 규약)",
      snap_use: "스냅 사용 분포(7차 지시 항목 2·4 — 실획 첫 표본의 결함 지표): snapStart 종류별 획 수 · snapEnd 있는 획 수 / 3D 획 수. **끝점 스냅이 실제로 걸리는지**가 여기서 나온다. ⚠ 첫 표본의 **사람 보고**(파일 미도착 — 원장 밖·미검증, AS-C1 7차 주석)는 끝점 스냅 0/획 5이었다 — 보고이지 기준선이 아니다(3·4-R [8]). 파일이 오면 이 지표가 실측한다",
      per_doc: "**파일별 분해**(2026-08-19 지시 0 — 표본 셋 도착): 합산은 D-L81 이전/이후 저장본을 한 분모에 섞으므로(#11) 문서 단위로 낸다. `vp_dir_err_strokes`는 [획 id, 축, Δ°, 스냅 표식(snap3d:종류·snap2d:종류·no_snap)(, \"guaranteed\")(, \"near_vp_degenerate\")] — 4번째 이후는 있을 때만 붙는 표식이다(리뷰어 4-R [B-9]로 정의를 행 꼴에 맞춤). 앞 셋은 `reported_samples_12.k_reported.vp_dir_err_deg_reported`와 같은 꼴이라 행 단위 대조가 선다. `camera_assumed_principal_center`는 주점=화면 중앙 **가정**(이론서 16.2·AS-C5)의 유도값(f/W·화각)이다. ⚠ 이 표본들은 **12차 수리(화각 상한·무앵커 방향 스냅·교차 앵커·D-L89) 이전에 그려졌다** — 파일이 재현하는 것은 12차 이전 상태이고, 수리가 같은 기하를 어떻게 바꾸는지는 재구성 픽스처가 대조한다(지시 0-e)",
      radius8_revert_condition: "사전등록 조건(11차 리뷰어 [9] · #12)의 평가 — `snap_dist_px.p10 > OSNAP_RADIUS_PX`면 반경 8(D-L85)을 다시 연다. 같은 실행의 값으로 원장이 스스로 판을 낸다(#47). ⚠⚠ **이 조건은 15차 D-L103(호버 잠금) 이후에 그려진 표본에는 그대로 못 쓴다**: 잠금으로 붙은 획은 `snapDistPx`(= 스냅 전 원시 시작점에서 잰 겨냥 거리)가 **조리개보다 클 수 있다** — «붙은 획은 조리개 이하»라는 전제가 깨졌다(`hover_lock.json@f351839a`의 `summary.recovered_land_gap_px`가 그 실측이다). 지금 표본은 전부 15차 **이전**이라 조건이 성립하지만, 새 표본이 오면 잠금으로 붙은 획을 갈라야 한다 — `DEFERRED`",
      vp_dir_err_deg: "수평축(0·1) 배정 획의 **2D 현 방향**과 시작점→그 축 소실점 방향의 각차(°) — 사람이 소실점을 향해 얼마나 정확히 긋는가의 화면 오차. 첫 표본의 사람 보고(원장 밖·미검증) Δ0.0~1.7°를 하네스가 재현하는 자리다. ⚠⚠ **합성의 축 오차(rule_camera deg_median — 3D 축 방향 오차)와는 다른 양·다른 프레임이다**(3·4-R [1]): 화면 오차는 3D 각으로 증폭된다(AS-L8 — 먼 소실점 100px ≈ 2~3°). 실획의 3D 축 오차는 참 축이 없어 못 잰다(what_this_cannot_measure). ⚠ **선택 절단이 있다**(#5): 축 배정 자체가 같은 각류 판정(vpMisfit ≤ 0.06)을 지나므로 분포가 배정 허용치 안에 갇힌다 — 배정 밖(미분류) 획의 겨냥 오차는 이 지표에 안 나온다. 축 배정은 정답 라벨도 아니다(caveat와 같은 유보)",
      near_vp_degenerate: "**행 표식**(13차 항목 4 — 리뷰어 4-R [B-9]로 정의 등재): 시작점→배정 소실점 거리(dVp) < 현 길이(lenChord)면 붙는다. ⚠⚠ 이 조건은 기전량(지렛대각 atan(off/dVp))의 **대리이고, 과잉 표식이 실측됐다**(2차 [5] · #49 — 단위가 다르다): `near_vp_lever`(세 파일 전부)에서 지렛대가 Δ를 지배하는 행(s65 18.75↔20.80 · s66 14.84↔16.59 · 15-16-18 s41 11.28↔12.81)과 **지렛대가 Δ를 설명하지 못하는 표식 행**(15-16-18 s44 0.16↔10.32 · s45 0.21↔7.11 — 긴 획이라 dVp<len일 뿐, Δ는 실제 방향 이탈)이 갈린다. 후자의 Δ는 퇴화 산물이 아니므로 **이 표식의 배제는 보수적 방향이 아니다** — 표식을 기전량 단위로 다시 긋는 일은 DEFERRED(그 전까지 배제 판정은 near_vp_lever와 함께 읽는다). 뜻: Δ의 분모(지렛대)가 획 길이보다 짧아 **원시 시작점의 손떨림 이탈이 지렛대비로 증폭된 값**이 Δ를 지배한다(delta_conflict.per_stroke의 start_off_fit_px÷vp_dist_px ≈ Δ 실측 — jitter_lever_deg). ⚠⚠ **극단 카메라 전용이 아니다**([B-2] 정정 — 초판 서술이 틀렸다): 화각 98° 파일들의 행에도 붙는다(dVp가 작은 것은 소실점 근접의 문제이고, 그것은 그린 위치↔소실점의 상대 관계라 카메라 화각만으로 정해지지 않는다). 표식 행의 Δ는 겨냥 오차로 읽지 않는다 — **어느 결론에도 겨냥의 증거로 쓰지 않는다**(사거리 논의 포함)",
      vp_dir_err_deg_stable: "vp_dir_err_deg에서 near_vp_degenerate 행(과 보장 0)을 뺀 분포([B-9]로 정의 등재). **절단값은 dVp ≥ 1×lenChord**이고 그 선택이 분모를 정하므로(#13) 절단 감도(0.5×·2×)를 `vp_dir_err_stable_cutoff` 필드가 함께 낸다. AS-L26 논의는 이 분포(및 no_snap 부분집합)를 쓴다",
      vp_dir_err_deg_stable_no_snap: "위 stable에서 **스냅 표식이 no_snap인 행만**([B-5] — 앵커·스냅된 획의 잔여 Δ는 무앵커 기전(②)의 몫이 아니므로 갈라 센다). ②(무앵커 무스냅 겨냥)의 논의는 이 분포가 모집단이다",
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
          asked = 0, answered = 0, skipped = 0, shortShare = 0, zeroPairs = 0,
          ansScreen = 0, ansDepth = 0, ansVertical = 0;
    /** 캔버스 크기(문서마다 다를 수 있다 — 목록으로 남긴다). `stroke_len_ratio`의 분모다. */
    const imgSizes: string[] = [];
    /** 2D 단계 스냅 기록(9차 항목 1 · D-L81). **옛 저장본에는 필드가 아예 없다.** */
    let snap2dStartN = 0, snap2dEndN = 0, snap2dFieldPresent = 0;
      let legacyZero = 0, nLifted = 0, nSnapEnd = 0, snapDistNull = 0;
      const snapStartKinds: Record<string, number> = {};
      const vpDirErrs: number[] = [];
      const vpDirErrsStable: number[] = [];
      const vpDirErrsStableNoSnap: number[] = [];
      const vpDirErrsStableHalf: number[] = [];
      const vpDirErrsStableTwo: number[] = [];
      const vpDirErrsFovOk: number[] = [];
      let vpDirGuaranteed = 0;
      const vpSource: Record<string, number> = {};
      const pathUse = { direct: 0, lift: 0, twoPoint: 0 };
      const lensR: number[] = [], vertexGaps: number[] = [], horizonDelta: number[] = [];
      /**
       * **파일별 분해**(2026-08-19 지시 0-a·0-d — 표본 셋이 실제로 도착했다). 합산만 두면
       * D-L81 **이전** 저장본(첫 표본)과 이후 저장본이 한 분모에 섞여 `snap2d` 판정이
       * 흐려진다(#11 — 분모가 무엇인가). 판정 대상은 **필드가 있는 문서**이고 그 경계는
       * 파일이다 — 문서별로 낸다. `vp_dir_err_strokes`는 `reported_samples_12`의
       * 획별 보고([id, 축, Δ°])와 같은 꼴이라 실측↔보고 대조가 행 단위로 선다.
       */
      const perDoc: Record<string, unknown>[] = [];
      for (const { file, doc: d } of brnl) {
        const D = { n: 0, lifted: 0, s2dStart: 0, s2dEnd: 0, s2dPresent: 0, snapEnd: 0,
                    legacyZero: 0, distNull: 0, dists: [] as number[],
                    vpErrs: [] as (string | number)[][],
                    // **획 집합 셋**(13차 리뷰어 [4] — "스냅 n = 배치 n" 같은 등식은 수가 아니라
                    // 집합으로 확인한다): 스냅 기록이 하나라도 있는 획 · 3D 획 · 3D인데
                    // 시작점 앵커(snapStart)가 없는 획
                    snappedIds: [] as string[], liftedIds: [] as string[],
                    liftedNoSnapStart: [] as string[],
                    s2dFired: [] as (string | number)[][],
                    nearVpBeyond: [] as (string | boolean)[][],
                    nearVpLever: [] as (string | number | null)[][] };
        const diag = Math.hypot(d.imgSize[0], d.imgSize[1]) || 1;
        const ends: number[][] = [];
        for (const st of d.strokes) {
          // **조각은 사람 획이 아니다**(#11) — 길이·채널 지표의 분모에서 뺀다. 따로 센다
          if ((st as { pieceOf?: string }).pieceOf) { nPieces += 1; continue; }
          n += 1;
          D.n += 1;
          byChannel[st.channel ?? "guide"] = (byChannel[st.channel ?? "guide"] ?? 0) + 1;
          // **7차 이전 저장본의 on_face 0 오염을 가른다**(#11 — K_DEFS.snap_dist_px)
          if (st.snapDistPx != null) {
            if (isLegacySnapZero(st)) { legacyZero += 1; D.legacyZero += 1; }
            else { snapDists.push(st.snapDistPx); D.dists.push(st.snapDistPx); }
          } else { snapDistNull += 1; D.distNull += 1; } // 40px 밖·대상 없음·확정 전 — 절단의 몫(#13·#11)
          // **스냅 사용 분포**(7차 — 첫 표본의 결함 지표)
          if (st.snapStart) snapStartKinds[st.snapStart.kind] = (snapStartKinds[st.snapStart.kind] ?? 0) + 1;
          // **2D 단계 기록**(9차 항목 1 · D-L81). 필드 자체의 유무를 함께 센다(#32)
          {
            const t = st as { snap2dStart?: { kind: string; distPx: number } | null;
                              snap2dEnd?: { kind: string; distPx: number } | null };
            if ("snap2dStart" in t || "snap2dEnd" in t) { snap2dFieldPresent += 1; D.s2dPresent += 1; }
            if (t.snap2dStart) {
              snap2dStartN += 1; D.s2dStart += 1;
              // 발화 상세(13차 리뷰어 2차 [5] — 종류·거리를 산문이 아니라 필드가 든다)
              D.s2dFired.push([st.id, "start", t.snap2dStart.kind, +t.snap2dStart.distPx.toFixed(2)]);
            }
            if (t.snap2dEnd) {
              snap2dEndN += 1; D.s2dEnd += 1;
              D.s2dFired.push([st.id, "end", t.snap2dEnd.kind, +t.snap2dEnd.distPx.toFixed(2)]);
            }
          }
          if (st.seg3d) { nLifted += 1; D.lifted += 1; if (st.snapEnd) { nSnapEnd += 1; D.snapEnd += 1; } }
          {
            const t = st as { snap2dStart?: unknown; snap2dEnd?: unknown };
            if (st.snapStart || st.snapEnd || t.snap2dStart || t.snap2dEnd) D.snappedIds.push(st.id);
            if (st.seg3d) {
              D.liftedIds.push(st.id);
              if (!st.snapStart) D.liftedNoSnapStart.push(st.id);
            }
          }
          // **소실점 방향 오차**(7차) — 수평축 배정 획의 현 방향 vs 시작점→소실점 방향
          if (typeof st.axis === "number" && st.axis <= 1 && st.pts2d.length >= 2) {
            const sl = d.rules?.slots?.[st.axis];
            if (sl && sl.kind === "vp" && sl.at) {
              const a0: Pt2 = [st.pts2d[0][0], st.pts2d[0][1]];
              const b0: Pt2 = [st.pts2d[st.pts2d.length - 1][0], st.pts2d[st.pts2d.length - 1][1]];
              const e = vpDirErrDeg(a0, b0, sl.at);
              // **근접 퇴화 판정**(13차 항목 4 — delta_conflict가 가른 기전): 시작점→소실점
              // 거리(지렛대 분모)가 현 길이보다 짧으면 Δ는 원시 시작점의 손떨림 이탈이
              // 지렛대비(atan(off/dVp))로 증폭된 값이 지배한다 — 15-18-25의 Δ20.8·16.6이
              // 그 실측이다(delta_conflict.per_stroke.jitter_lever_deg ≈ Δ).
              // ⚠⚠ 이 표식은 **극단 카메라 전용이 아니다**(리뷰어 4-R [B-2]로 초판 서술
              // 정정) — 화각 98° 파일의 행에도 붙는다. 정의·읽기 규약은 K_DEFS가 든다.
              const lenChord = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
              const dVp = Math.hypot(sl.at[0] - a0[0], sl.at[1] - a0[1]);
              const nearVp = dVp < lenChord;
              // ⚠⚠ **소실점을 만든 획은 보장이지 측정이 아니다**(#5 · 2026-08-18 9-R [M10]).
              // `horizon_x_line`은 그 획과 지평선의 **교점**을 소실점으로 두므로 그 획의
              // 겨냥 오차는 **정의상 0**이고, 첫 실획 표본에서 실제로 정확히 0이 나왔다.
              // 갈라 세지 않으면 **분포의 4분의 1이 항등**이라 중앙값이 아래로 끌린다.
              // ⚠ `two_lines`는 **대표 직선**(`representative`)의 교점이라 원시 끝점 기준의
              // 이 지표는 0이 아니다 — 그래서 **정확히 0인 것만** 보장으로 뺀다(관측된 성질).
              if (e != null) {
                const snapTag = st.snapStart ? `snap3d:${st.snapStart.kind}`
                              : (st as { snap2dStart?: { kind: string } | null }).snap2dStart
                                ? `snap2d:${(st as { snap2dStart?: { kind: string } }).snap2dStart!.kind}`
                                : "no_snap";
                if (e < 1e-9) vpDirGuaranteed += 1; else vpDirErrs.push(e);
                if (e >= 1e-9 && !nearVp) {
                  vpDirErrsStable.push(e);
                  // **no_snap 부분집합**([B-5]) — 앵커·스냅 행의 잔여는 ②의 몫이 아니다
                  if (snapTag === "no_snap") vpDirErrsStableNoSnap.push(e);
                }
                // **절단 감도**([B-9] · #13 — 절단값 1×이 분모를 정하므로 0.5×·2×도 센다)
                if (e >= 1e-9 && dVp >= 0.5 * lenChord) vpDirErrsStableHalf.push(e);
                if (e >= 1e-9 && dVp >= 2 * lenChord) vpDirErrsStableTwo.push(e);
                // 획별 행(0-f — 보고 대조): [id, 축, Δ°, 스냅 표식, (보장이면) "guaranteed"].
                // ⚠ 스냅 표식을 함께 낸다(13차 리뷰어 [2] — "스냅과 Δ의 상관"을 원장 밖에서
                // 주장하지 않게 획별로 기록한다). ⚠⚠ **정확히 0은 보장이지 측정이 아니다**(#5) —
                // 자기 소실점을 만든 획의 항등이거나 되쓰기의 항등이고, 어느 쪽이어도
                // **기전 판정의 증거로 쓰지 않는다**(13차 리뷰어 [1]).
                const row: (string | number)[] = e < 1e-9
                  ? [st.id, st.axis, 0, snapTag, "guaranteed"]
                  : [st.id, st.axis, +e.toFixed(4), snapTag];
                if (nearVp) {
                  row.push("near_vp_degenerate");
                  // **AS-L28 대조 재료**(리뷰어 4-R [B-10]): dVp < lenChord가 곧 "소실점이
                  // 그린 구간 안"은 아니다 — 검출 규칙의 그 판정(`beyondSegment` — 투영
                  // 매개변수가 [−pad, 1+pad] 밖)을 같은 현에 그대로 물어 불리언으로 남긴다.
                  D.nearVpBeyond.push([st.id, beyondSegment({ a: a0, b: b0 }, sl.at)]);
                  // **기전량을 세 파일 전부에서 낸다**(2차 리뷰어 [5]·[9] — 지렛대 값이
                  // 15-18-25에만 있어 표식의 배제 근거가 대리 조건(dVp<len)뿐이었고,
                  // 결론 6의 파일 간 비교도 재료가 없었다): 원시 시작점의 대표 직선 수직
                  // 이탈(off) · 소실점 거리(dVp) · 지렛대각 atan(off/dVp) · Δ.
                  const rp = representative(st.pts2d.map(p => [p[0], p[1]] as Pt2));
                  if (rp) {
                    const ux = (rp.b[0] - rp.a[0]) / rp.len, uy = (rp.b[1] - rp.a[1]) / rp.len;
                    const off = Math.abs((a0[0] - rp.a[0]) * -uy + (a0[1] - rp.a[1]) * ux);
                    const lever = dVp > 1e-9 ? (Math.atan(off / dVp) * 180) / Math.PI : null;
                    D.nearVpLever.push([st.id, +off.toFixed(2), +dVp.toFixed(1),
                                        lever == null ? null : +lever.toFixed(4),
                                        +e.toFixed(4)]);
                  }
                }
                D.vpErrs.push(row);
              }
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
          answered += d.askStats.screen + d.askStats.depth + d.askStats.vertical;
          // **답의 내역을 갈라 센다**(9-R′ [R6]) — `answered` 합만 두면 "6 중 4"의
          // 나머지 2가 무엇인지 문서가 원장 밖에서 추측하게 된다
          ansScreen += d.askStats.screen; ansDepth += d.askStats.depth;
          ansVertical += d.askStats.vertical; }
        imgSizes.push(`${d.imgSize[0]}x${d.imgSize[1]}`);
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
        // **파일별 카메라 유도값**(0-f — Δ 대푯값 충돌의 후보 ①이 화각이므로 파일마다 낸다).
        // 주점 = 화면 중앙 **가정**(이론서 16.2 · AS-C5) 아래 f² = −(v₁ₓ−pₓ)(v₂ₓ−pₓ)
        // (두 소실점이 같은 지평선 위라 y항 0). 가정이므로 값 이름에 `assumed`를 남긴다.
        const hs = (d.rules?.slots ?? []).slice(0, 2);
        const fovAssumed = (hs.length === 2 && hs.every(s => s && s.kind === "vp" && s.at))
          ? assumedFov(hs[0]!.at![0], hs[1]!.at![0], d.imgSize[0]) : null;
        // **극단 화각 제외 분포의 재료**(리뷰어 2차 [14] — "163° 파일을 빼도"를 원장 밖에서
        // 세지 않게): 화각이 분석 절단(아래 STABLE_FOV_CUTOFF_DEG) 안인 문서의 Δ만 모은다
        // (보장 0 제외 규약은 위와 같다). ⛔ 옛 조건은 `FOV_GATE.reject_fov_deg`(앱 게이트)
        // 였는데 14차 지시 1(D-L93)이 그 상한을 **앱에서 제거**했다 — 이 절단은 앱 판정이
        // 아니라 **분석의 층화 기준**으로만 남는다(이론서 18.4 참고 기준의 연장. 지렛대
        // 증폭이 지배하는 극단 카메라 문서를 갈라 보는 용도 — 값은 옛 상한을 유지해
        // 분포 정의의 연속성을 지킨다).
        if (fovAssumed && fovAssumed.fov_deg < STABLE_FOV_CUTOFF_DEG) {
          for (const row of D.vpErrs) {
            if (row[row.length - 1] !== "guaranteed") vpDirErrsFovOk.push(row[2] as number);
          }
        }
        perDoc.push({
          file,
          n_strokes: D.n,
          lifted_3d: `${D.lifted}/${D.n}`,
          snap2d: { start: `${D.s2dStart}/${D.n}`, end: `${D.s2dEnd}/${D.n}`,
                    field_present: `${D.s2dPresent}/${D.n}`,
                    /** 발화 상세 [id, start|end, kind, distPx] — 리뷰어 2차 [5] */
                    fired: D.s2dFired },
          snap3d: { end_snapped: `${D.snapEnd}/${D.lifted}` },
          /** 집합 대조(리뷰어 [4]) — 스냅 획 집합과 3D 획 집합은 **다를 수 있다**. */
          snapped_any_ids: D.snappedIds,
          lifted_ids: D.liftedIds,
          /**
           * 3D인데 시작점 앵커(snapStart) 기록이 없는 획 — 후보 경로는 일괄 풀이(스냅 기록을
           * 안 남긴다)·twoPoint·direct이고, **저장본은 획별 배치 경로를 안 적어 못 가른다**
           * (pathStats는 세션 합계뿐 — 획별 placeBy 저장은 DEFERRED). D-L83 반증인지 미상.
           */
          lifted_no_snapstart_ids: D.liftedNoSnapStart,
          snap_dist_px: stat(D.dists, 2),
          snap_dist_legacy_zero: D.legacyZero,
          snap_dist_null: `${D.distNull}/${D.n}`,
          ask: d.askStats ?? null,
          vp_dir_err_strokes: D.vpErrs,
          /**
           * near_vp_degenerate 행의 `beyondSegment` 판([B-10] — AS-L28 대조): [id, bool].
           * true = 검출 규칙 기준으로도 소실점이 그린 구간(±extend_ratio) **밖** —
           * dVp < lenChord(표식 조건)와 "구간 안"은 다른 판정이다.
           */
          near_vp_beyond_segment: D.nearVpBeyond,
          /**
           * 표식 행의 기전량(2차 [5]·[9]): [id, start_off_px, vp_dist_px, jitter_lever_deg,
           * Δ°]. ⚠ 표식 조건(dVp < 현 길이)은 이 양의 **대리**다(#49 — 단위가 다르다.
           * 표식이 붙었는데 lever가 작은 행이 있을 수 있고 s75가 실례) — 배제 판정의
           * 기전 근거는 이 행이 든다.
           */
          near_vp_lever: D.nearVpLever,
          camera_assumed_principal_center: fovAssumed,
        });
      }
      const distStat = stat(snapDists, 2);
      return {
        status: "measured", n_docs: brnl.length, n_strokes: n, n_pieces: nPieces,
        metrics: K_DEFS,
        per_doc: perDoc,
        /**
         * **반경 8 되돌림 조건의 평가**(지시 0-c). 조건은 표본 **전에** 등록됐다
         * (11차 리뷰어 [9] · #12 — HANDOFF 머리): `snap_dist_px.p10 > 조리개`면 다시 연다.
         * 여기서 그 판을 원장이 스스로 낸다 — 산문 옮겨 적기가 아니라 같은 실행의 값이다.
         */
        radius8_revert_condition: {
          preregistered: "p10 > 조리개(OSNAP_RADIUS_PX)면 반경 8(D-L85)을 다시 연다 — 11차 리뷰어 [9] 사전등록(#12)",
          aperture_px: OSNAP_RADIUS_PX,
          p10: distStat.p10,
          reopen: radius8Reopen(distStat.n > 0 ? distStat.p10 : null, OSNAP_RADIUS_PX),
          /** 분포에서 1e-9 미만(사실상 0)인 값의 수 — 아래 reachability의 판단 재료다. */
          near_zero_in_dist: snapDists.filter(v => v < 1e-9).length,
          /**
           * **이 표본에서 조건이 도달 가능한가**(13차 리뷰어 [3] · #35·#40 ② — 게이트가 아닌
           * 이름으로 적힌 판정에도 도달 가능성을 함께 적는다): 분포 n이 10 이하면 p10은
           * 최솟값에 앉으므로, **정확히 0인 값이 하나라도 있으면 p10 = 0으로 고정**되고
           * 이 조건은 발화할 수 없다. 그 0이 겨냥의 측정인지 **스냅 뒤 좌표의 구조 0**인지
           * 저장본은 못 가른다(aimDistPx의 기록 시점 갈래 필드가 없다 — DEFERRED. 기록 시점의
           * 조리개도 저장본에 없다 — DEFERRED). 그러므로 reopen=false는 "조건 불충족"이지
           * "반경이 맞다"가 아니고, **n이 이 자릿수인 동안 이 판은 정보량이 0에 가깝다.**
           */
          reachability: `near_zero_in_dist > 0이면 n ≤ 10에서 p10이 0으로 고정된다 — 이번 실행 near_zero ${snapDists.filter(v => v < 1e-9).length}/${snapDists.length}. 구조 0 의심(#5)은 갈래 필드 부재로 미해소(DEFERRED). ⚠ 분위수 선택의 몫(5·6·7-R [3] · #35): n=4에서 p10은 사실상 최솟값이라 조건은 '전부 초과'를 요구한다 — 다음 표본에서도 n이 한 자릿수면 판정 통계를 p10 대신 중앙(또는 초과 건수/전체)으로 읽는 쪽이 사전등록 의도('반경이 겨냥 분포를 자른다')에 맞다. 어느 쪽으로 읽어도 이번 값에서는 reopen=false`,
          caveat: "⚠ 분포는 40px 프로브에서 절단되고(#13 — 그 밖은 snap_dist_null) n이 한 자릿수다(#14). "
                + "판은 '열지 않는다'까지다 — '측정이 8을 지지한다'로 읽지 않는다(D-L85 근거는 모순 지표)",
        },
        channel_share: byChannel,
        snap_dist_px: distStat,
        snap_dist_legacy_zero: legacyZero,
        snap_dist_null: `${snapDistNull}/${n}`,
        snap_use: { start_kinds: snapStartKinds, end_snapped: `${nSnapEnd}/${nLifted}` },
        vp_dir_err_deg: stat(vpDirErrs, 2),
        /**
         * **근접 퇴화 행을 뺀 분포**(13차 항목 4 — `delta_conflict.json`이 가른 기전):
         * 시작점→소실점 거리 < 현 길이면 Δ는 손떨림 이탈의 지렛대 증폭이 지배한다
         * (jitter_lever_deg ≈ Δ — delta_conflict.per_stroke). ⚠⚠ **극단 카메라 전용이
         * 아니다**(리뷰어 4-R [B-2]로 초판 '극단 카메라에서만' 정정 — 화각 98° 파일 행에도
         * 붙는다). 겨냥 정확도 논의(AS-L26)는 이 분포(무앵커 기전은 아래 no_snap 부분집합)를
         * 쓰고, 퇴화 행은 `per_doc[*].vp_dir_err_strokes`의 `near_vp_degenerate` 표식이 든다 —
         * **표식 행의 Δ는 어느 결론에도 겨냥 증거로 쓰지 않는다**(K_DEFS).
         */
        vp_dir_err_deg_stable: stat(vpDirErrsStable, 2),
        /** stable 중 **무스냅 행만**([B-5]) — ②(무앵커 무스냅 겨냥) 논의의 모집단이다 */
        vp_dir_err_deg_stable_no_snap: stat(vpDirErrsStableNoSnap, 2),
        /**
         * **절단 감도**([B-9] · #13 — dVp ≥ k×lenChord의 k가 stable의 분모를 정한다):
         * k = 0.5 · 1(본 분포) · 2 각각의 분포. n이 k에 민감하면 절단이 결론을 정하는
         * 자리이므로 결론은 그만큼 유보한다.
         */
        vp_dir_err_stable_cutoff: {
          half: stat(vpDirErrsStableHalf, 2),
          one_is_main: "vp_dir_err_deg_stable",
          two: stat(vpDirErrsStableTwo, 2),
        },
        /**
         * 화각 절단(STABLE_FOV_CUTOFF_DEG — **분석 층화 기준**. ⛔ 옛 앱 상한
         * reject_fov_deg는 14차 지시 1·D-L93으로 제거됐다) **안** 문서만의 Δ 분포
         * (리뷰어 2차 [14]) — "극단 카메라 파일을 빼도 분포가 넓은가"의 강건성 판을
         * 원장이 스스로 낸다. 주점 가정·보장 0 제외 규약은 `vp_dir_err_deg`와 같다.
         */
        vp_dir_err_deg_fov_ok: stat(vpDirErrsFovOk, 2),
        /**
         * 위 분포의 절단 정의(1-R [8] — 절단값이 원장 밖이면 #13·#25).
         * ⚠ 이름의 `ok`는 화각 대역 `ok`(f/W ≥ 0.87)와 **다른 뜻**이다 — 이 절단은
         * "분석 층화로 극단 카메라 문서를 뺐다"이고 98° severe 문서도 안에 든다.
         * 이름은 AS-L26 등 기존 인용의 연속성 때문에 유지하고 이 필드가 뜻을 못 박는다.
         */
        vp_dir_err_deg_fov_ok_cutoff: {
          cutoff_deg: STABLE_FOV_CUTOFF_DEG,
          meaning: "camera_assumed_principal_center.fov_deg < cutoff인 문서만의 Δ — 분석 층화"
                 + "(지렛대 증폭 문서 제외). ⛔ 앱 게이트 아님(14차 D-L93으로 상한 제거 — "
                 + "옛 FOV_GATE.reject_fov_deg의 값을 층화 상수로만 승계)",
        },
        // **보장으로 갈라 센 몫**(#5) — 소실점을 만든 획이라 정의상 0이다
        vp_dir_guaranteed_zero: `${vpDirGuaranteed}/${vpDirGuaranteed + vpDirErrs.length}`,
        ask: { asked, answered, skipped,
               // **내역**(9-R′ [R6]) — asked − answered − skipped가 **미상**의 크기다
               screen: ansScreen, depth: ansDepth, vertical: ansVertical,
               unaccounted: asked - answered - skipped },
        /** 캔버스 크기(9-R′ [R7]) — `stroke_len_ratio`·`below_min_vp_len`의 분모다. */
        img_size: imgSizes,
        /**
         * **2D 단계 스냅 기록**(9차 항목 1 · D-L81). ⚠⚠ **`0/n`의 뜻이 둘이다**(#32):
         * `field_present`가 0이면 **필드 이전에 저장된 문서**라 "안 걸렸다"가 아니라
         * **"안 적혔다"**이다. 그 둘을 갈라 세지 않으면 8차가 `snapEnd` 0/5에서 한 오독이
         * 그대로 재발한다.
         */
        snap2d_use: { start: `${snap2dStartN}/${n}`, end: `${snap2dEndN}/${n}`,
                      field_present: `${snap2dFieldPresent}/${n}` },
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

    /**
     * **판정 대기 표**(2026-08-18 11차 항목 4-c·4-d). 지시가 재수집 표본으로 **판정할 것**
     * 여덟을 이름으로 들었다. 그 각각이 **지금 표본으로 답할 수 있는가**를 원장이 스스로
     * 낸다 — 산문으로만 두면 다음 세션이 "값이 있으니 답이 있다"로 읽는다(#32의 자리).
     *
     * ⚠ **막힘의 사유는 필드 이름으로 적는다**(#47) — 수를 여기 안 박고, 무엇을 읽으면
     * 막힘이 풀렸는지 알 수 있게 한다.
     */
    const pendingJudgements = (() => {
      const k = kMetrics as Record<string, unknown>;
      if (k.status !== "measured") return null;
      const g = (path: string): unknown =>
        path.split(".").reduce<unknown>((o, key) =>
          (o && typeof o === "object") ? (o as Record<string, unknown>)[key] : undefined, k);
      /** `"a/b"` 꼴에서 분자를 읽는다(없으면 null). */
      const num = (v: unknown): number | null =>
        typeof v === "string" && /^\d+\/\d+$/.test(v) ? +v.split("/")[0] : null;
      const n = (v: unknown): number | null =>
        (v && typeof v === "object" && typeof (v as { n?: unknown }).n === "number")
          ? (v as { n: number }).n : null;
      const rows: {
        id: string; what: string; field: string; ok: boolean;
        blocked_by: string; opens: boolean; caveat?: string;
      }[] = [
        { id: "end_snap_engages", opens: true,
          what: "끝점 스냅이 실제로 걸리는지 — 단계별로 갈려 기록되는가(2D 단계 ↔ 3D)",
          field: "snap2d_use.field_present",
          ok: (num(g("snap2d_use.field_present")) ?? 0) > 0,
          blocked_by: "필드 이전 저장본이면 `0/n`이 '안 걸렸다'가 아니라 '안 적혔다'다(#32 · D-L81)",
          caveat: "⚠ 합산 분모는 D-L81 이전 저장본(첫 표본)을 섞는다 — 판정은 `per_doc`의 필드 있는 문서로 한다(#11)" },
        { id: "vp_dir_axis_snap_holds", opens: false,
          what: "소실점 방향 축 스냅이 확정에서도 유지되는지",
          field: "vp_dir_err_deg.n",
          // ⛔ **11차 리뷰어 [7]로 내렸다**: 이 지표는 축 배정을 **통과한 획**만 담는다 —
          // 같은 각류 판정(`vpMisfit`)을 지나므로 분포가 허용치 안에 갇힌다(#5 선택 절단).
          // "유지되는가"를 유지된 것만으로 재는 것은 순환이다.
          ok: false,
          blocked_by: "**선택 절단으로 순환이다**(#5) — 이 원장의 정의가 스스로 적는다: 축 배정이 같은 각류 판정을 지나므로 분포가 배정 허용치 안에 갇힌다. 유지 실패는 이 필드에 **안 나타난다**. 배정에서 떨어진 획의 각차를 함께 세는 필드가 선행이다",
          caveat: "표본이 와도 이 필드로는 못 답한다 — 하네스를 먼저 고친다" },
        { id: "ask_volume", opens: false,
          what: "물음이 얼마나 뜨는지",
          field: "ask.unaccounted",
          ok: g("ask.unaccounted") === 0,
          blocked_by: "`asked − answered − skipped`가 0이 아니면 그 몫이 취소인지 카운터 누락인지 미상이다(#11)",
          caveat: "⚠ **새 표본이 와도 같은 모호함이 다시 난다** — 물음 UI가 닫기·바깥 탭을 `skipped`로 세는지 확인하는 것이 선행이고 그것은 미이행 등재 상태다(DEFERRED)" },
        { id: "snap_radius_width", opens: true,
          what: "스냅 반경이 좁은지 넓은지 — 겨냥 분포 중앙이 조리개의 어디인가",
          field: "snap_dist_px.n",
          ok: (n(g("snap_dist_px")) ?? 0) > 0,
          blocked_by: "`snap_dist_legacy_zero`가 분모를 다 먹으면 분포가 비어 있다(D-L79 이전 저장본)",
          caveat: "⚠ **분포는 40px 프로브에서 절단된다**(#13) — 그 밖 겨냥은 `snap_dist_null`로 사라진다. 중앙값은 **절단된 분포의 중앙**이다. 사전등록된 반경 판은 `radius8_revert_condition`이 같은 실행에서 낸다(#12)" },
        { id: "as6_one_stroke_one_axis", opens: false,
          what: "AS-6 — 한 획에 방향이 둘 이상인 비율",
          field: "status",
          ok: false,
          blocked_by: "`k_metrics`(`.brnl`)는 이 지표를 안 낸다 — `as6_multi_axis_rate`는 옛 `s2s-session/1` 형식 전용이다. **형식이 아니라 하네스의 한계다**" },
        { id: "vp_dir_error", opens: true,
          what: "소실점 방향 오차의 분포",
          field: "vp_dir_err_deg.n",
          ok: (n(g("vp_dir_err_deg")) ?? 0) > 0,
          blocked_by: "표본에 소실점 방향 획이 없으면 분포가 안 선다",
          caveat: "⚠ **n이 한 자릿수다**(#12·#14) · 보장 몫(`vp_dir_guaranteed_zero` — 자기 소실점을 만든 획)은 갈라 센 뒤의 수다(#5) · 축 배정을 통과한 획만 담는다(위 항목과 같은 절단 — 여기서는 **분포를 보는 것**이라 절단을 명시하고 쓴다)" },
        { id: "confirm_path_share", opens: true,
          what: "확정 경로 분포(찍기 ↔ 두 선의 교점)",
          field: "vp_confirm_source",
          ok: !!g("vp_confirm_source") && Object.keys(g("vp_confirm_source") as object).length > 0,
          blocked_by: "확정을 지난 문서가 없으면 빈 분포다",
          caveat: "⚠ **현 표본의 합이 한 자릿수이고 `picked_point`가 0이다**(#12) — 동기였던 '실사용에서 어느 쪽을 쓰는가'는 이 크기로는 못 답한다" },
        { id: "midpoint_wrong_connection", opens: true,
          what: "작은 조리개의 잘못된 연결을 중점 후보가 만든다(11차 D-L88)가 실획에서 확인되는가(13차 지시 5-d)",
          field: "per_doc[*].snap2d.fired",
          // 발화 상세에 midpoint가 하나라도 있어야 판정이 선다 — 현 표본은 endpoint·vertex·
          // intersection뿐이라(그 목록은 per_doc이 든다) 중점 연결 자체가 관측되지 않았다.
          ok: (k as { per_doc?: { snap2d?: { fired?: unknown[][] } }[] }).per_doc
                ?.some(p => p.snap2d?.fired?.some(row => row[2] === "midpoint")) ?? false,
          blocked_by: "**중점 발화가 0이다**(⚠ 분모 규약 — 5·6·7-R [1]·#11: 관측 가능한 분모는 field_present 있는 두 파일 24획 · 그 2D 발화 3건(endpoint·vertex·intersection)이고, field_present 0인 첫 파일은 '안 적혔다'라 분모가 아니다. 세는 단위는 **발화 3건 중 midpoint 0**이다 — #48) — 잘못된 연결이든 옳은 연결이든 중점 스냅 자체가 이 표본에 없어 D-L88의 실획 확인이 성립 불가다(#32 — 미발화를 반증으로 안 읽는다). ⚠⚠ **다음 표본으로 열리려면 셋이 더 필요하다**(5·6·7-R [3]): ① 중점을 겨냥한 손짓 ② 그 표본의 기록 시점 조리개·종류 토글 스냅샷(저장 형식에 없다 — DEFERRED 그 행. 없으면 D-L88의 'r8 동작점' 귀속이 안 선다) ③ '잘못됨'의 대리 신호(되돌리기 직후 재획 등 — 계측기 없음, DEFERRED 8차). opens=true는 ①의 도착 가능성까지이고 ②③ 없이는 판정이 약하다" },
        { id: "as_l24_l25_synthetic_bias", opens: false,
          what: "AS-L24·L25 — 합성이 이 설계에 편향됐다는 것이 실획으로 지지되는가(4-d)",
          field: "(없다)",
          ok: false,
          blocked_by: "**대응량이 원장에 없다.** `rule_camera`가 재는 것은 **3D 축 방향 오차**(참값 대조)인데 실획에는 참값이 없다(`caveat`). 실획에서 잴 수 있는 것은 겨냥 각차(`vp_dir_err_deg`)뿐이고 **프레임이 다르다**(#24 — AS-L26이 걸렸던 그 자리). 대리 지표를 먼저 정해야 한다" },
      ];
      return {
        note: "**지시 4-c·4-d가 든 판정 여덟 + 13차 지시 5-d의 중점 행.** `answerable`이 false면 그 판정은 "
            + "**이 표본으로는 못 한다** — 값이 있어도 다른 것을 재고 있다는 뜻이다. "
            + "막힘이 풀렸는지는 `field`가 가리키는 자리를 그 자리에서 읽어 확인한다(#47).",
        answerable: rows.filter(r => r.ok).map(r => r.id),
        blocked: rows.filter(r => !r.ok).map(r => r.id),
        /**
         * ⚙️ **새 표본 하나가 실제로 여는 것**(11차 리뷰어 [1]) — 막힌 것 전부가 표본으로
         * 열리는 것이 아니다. 하네스의 한계(`as6`)·대리 지표 부재(`as_l24_l25`)·순환
         * (`vp_dir_axis_snap_holds`)·UI 카운터 미수리(`ask_volume`)는 **표본과 무관하다.**
         * 사람에게 요청할 때 이 목록의 크기로 말한다.
         */
        opens_with_new_sample: rows.filter(r => !r.ok && r.opens).map(r => r.id),
        blocked_regardless_of_sample: rows.filter(r => !r.ok && !r.opens).map(r => r.id),
        /**
         * **파일이 도착했다**(2026-08-19 지시 0 — `sessions/`에 세 `.brnl`). 12차의 미개봉
         * 판정 둘(`end_snap_engages`·`snap_radius_width`)이 열렸다 — 값은 이 원장의
         * `snap2d_use`(문서별은 `per_doc`)·`radius8_revert_condition`이 든다(#47).
         * `reported_samples_12`는 이제 **대조 기록**이다(그 블록의 예고대로).
         */
        note_12: "파일 도착(2026-08-19) — 12차 미개봉 둘이 열렸다. 보고 블록은 대조 기록이 됐다",
        rows: rows.map(r => ({ id: r.id, what: r.what, field: r.field,
                               answerable: r.ok, opens_with_new_sample: r.ok ? null : r.opens,
                               blocked_by: r.ok ? null : r.blocked_by,
                               caveat: r.caveat ?? null })),
      };
    })();

    if (!sessions.length) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(resolve(OUT, "real_ink.json"), JSON.stringify({
        ...base,
        k_metrics: kMetrics,
        pending_judgements: pendingJudgements,
        // ⚠ **`s2s-session/1`이 없다**는 뜻이고, `.brnl`(Doc2)은 `k_metrics`가 따로 잰다.
        // 갈라 적는다(#11 — 분모가 무엇인지). 위 상태만 보고 "표본 0"으로 읽으면
        // 실제로 있는 Doc2 측정을 놓친다.
        status: kMetrics.status === "measured" ? "brnl_only" : "awaiting_samples",
        n_sessions: 0, n_strokes: 0,
        note: kMetrics.status === "measured"
          ? "**옛 `s2s-session/1` 표본은 없고 `.brnl`(Doc2)이 있다** — 측정은 `k_metrics`에 있다. "
            + "AS-6·AS-12(이 절의 지표)는 그 형식으로는 아직 못 잰다."
          : "**표본 없음.** 수단은 서 있고 측정은 사용자 획이 들어온 뒤다. AS-6·AS-12는 그때까지 잠정.",
      }, null, 2), "utf-8");
      // **통과로 세지 않는다**(#32) — 여기서 끝내면 "측정이 돌았다"로 읽힌다.
      // vitest의 동적 건너뛰기로 **skip으로 보고**한다.
      // ⚠⚠ **`.brnl`(Doc2)만 있는 경우를 가른다**(2026-08-18 9차 — 첫 실획 표본이 도착해
      // 실제로 걸렸다). 옛 판은 `s2s-session/1`이 비면 무조건 여기로 왔고, 그러면
      // **`sessions/`에 파일이 있는데** `skipReason`이 null을 내서 이 단언이 **실패**했다.
      // `k_metrics`는 그 위에서 이미 `.brnl`을 재고 있었으므로 **측정은 돌았는데 테스트가
      // 깨지는** 모양이었다(#32의 반대편 — 돌았는데 안 돈 것으로 보고된다).
      if (kMetrics.status === "measured") {
        expect(kMetrics.n_strokes).toBeGreaterThan(0);
        // **판정 대기 표가 여덟을 전부 든다**(11차 항목 4) — 빠지면 그 판정은 조용히
        // 사라진다. 막힌 행은 사유를 반드시 갖는다(빈 사유 = 왜 못 하는지 모른다).
        expect(pendingJudgements).not.toBeNull();
        expect(pendingJudgements!.rows.length).toBe(9);
        for (const r of pendingJudgements!.rows)
          if (!r.answerable) expect(r.blocked_by, r.id).toBeTruthy();
        return;
      }
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
      pending_judgements: pendingJudgements,
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

  it("radius8Reopen — p10이 조리개 위면 연다, 아래면 안 연다, 분포가 비면 판정 불가 (반례)", () => {
    expect(radius8Reopen(8.01, 8)).toBe(true);   // 가장 잘 겨냥한 10%조차 조리개 밖 — 다시 연다
    expect(radius8Reopen(7.99, 8)).toBe(false);
    expect(radius8Reopen(0, 8)).toBe(false);     // 경계: 0은 조리개 안이다
    expect(radius8Reopen(null, 8)).toBeNull();   // 분포 없음 = 판정 불가(#32 — 미측정≠통과)
  });

  it("assumedFov — 대칭 소실점 ±W/2에서 f=W/2·화각 90°, 같은 쪽이면 카메라 없음 (반례)", () => {
    // 주점(W/2=500)에서 좌우 500px씩 — f² = 500² → f/W = 0.5, 화각 = 2·atan(1) = 90°
    const sym = assumedFov(0, 1000, 1000)!;
    expect(sym.f_over_w).toBeCloseTo(0.5, 9);
    expect(sym.fov_deg).toBeCloseTo(90, 9);
    // 두 소실점이 주점의 같은 쪽 — f² ≤ 0, 대응 카메라가 없다(이론서 6.5)
    expect(assumedFov(600, 700, 1000)).toBeNull();
    // 실측 방향 확인: 소실점 사이가 좁을수록 화각이 넓다(지시 4-b의 163° 카메라가 이 자리)
    const wide = assumedFov(450, 550, 1000)!;
    expect(wide.fov_deg).toBeGreaterThan(160);
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
