// **공유 상수 스냅샷** — 하류 재측정 누락을 자동으로 잡기 위한 것.
//
// 같은 유형이 세 번 재발했다.
//   1. `hash(str)` 비결정 시드 → Track 2 전체가 낡음
//   2. 등급 centroid 단위 혼동 → 마우스 판정이 낡음
//   3. `AXIS_TOL` 기본값 변경(S-2b의 b) → **S-3 측정 전체가 낡음**
//
// 셋 다 "공유 상수·기본값이 바뀌면 그것에 의존하는 측정이 낡는다"는 하나의 원인이고,
// **사람이 기억해서 잡을 수 있는 종류가 아니다.** 그래서 기계가 잡게 한다.
//
// ```
// 측정 산출물마다 그 실행의 상수 스냅샷을 함께 기록한다   (여기)
//   → selfcheck가 현재 상수와 대조해 다르면 STALE 플래그   (selfcheck.py)
//   → 문서는 산출물을 파일명@해시로 인용한다              (CLAUDE.md §5)
// ```
import { AXIS_TOL } from "../src/s3d/axis.js";
import { CONSENSUS_TOL } from "../src/s3d/consensus.js";
import { PLACE_TOL } from "../src/s3d/stroke.js";
import { TUBE_TOL } from "../src/s3d/tube.js";
import { EYE_HEIGHT } from "../src/s3d/geom3d.js";
import { VP_INFINITE_RATIO } from "../src/s3d/camera.js";
import { VP_TOL } from "../src/s3d/vpDetect.js";
import { LIFT_TOL } from "../src/s3d/lift.js";
import { HOMOG_TOL } from "../src/s3d/vpHomog.js";
import { SNAP_TOL } from "../src/s3d/snap.js";
import { HORIZON_TOL } from "../src/s3d/horizon.js";
import { RULE_TOL } from "../src/s3d/vpRules.js";
import { SNAP_TOL_AXIS } from "../src/s3d/axisSnap.js";
import { LIVE_TOL } from "../src/s3d/liveLine.js";
import { PICK_TOL } from "../src/ui/pick.js";
import { INK_GRADES } from "../src/s3d/synthInk.js";

/**
 * **측정 결과를 바꿀 수 있는 모든 공유 상수.** 여기 빠진 것이 바뀌면 STALE이 안 잡힌다 —
 * 새 임계를 만들 때 반드시 여기 넣는다.
 */
export const SHARED_CONSTANTS = {
  AXIS_TOL,
  // L-D.1 §9.5 — 고르기 반경. 하네스(`e2e/stage.spec.ts`의 `l_d1`)가 읽는다
  PICK_TOL,
  VP_TOL,
  LIFT_TOL,
  HOMOG_TOL,
  // L-D.0 — 롤 0 제약(지평선 수평 고정). 하네스 `test/horizon.test.ts`가 읽는다
  HORIZON_TOL,
  // **규칙 기반 소실점 확정**(2026-08-16 전면 교체). 하네스 `test/rule_camera.test.ts`가 읽는다
  RULE_TOL,
  // **축 스냅 — 라이노 직교 모드**(2026-08-16 2차 지시). 하네스 `test/axis_snap_measure.test.ts`
  SNAP_TOL_AXIS,
  // ⛔ **`vpDraft.ts`·`vpSensitivity.ts`는 2026-08-17 지시 2로 삭제됐다**(검출 초안 경로).
  // 값을 **동결 리터럴로 남기는 이유는 해시 안정성 하나다**: 전역 해시가 하나뿐이라
  // (DEFERRED "의존 집합별 해시") 키를 빼면 이 상수에 의존한 적 없는 원장 40여 개가
  // 전부 STALE이 된다 — D-L51이 `GESTURE_TOL`을 안 넣은 것과 같은 자리의 결정이다.
  // 어떤 코드도 이 값을 더는 읽지 않는다. 의존 집합별 해시가 서면 그때 뺀다.
  DRAFT_TOL: { handle_ratio: 0.018, margin_ratio: 0.03, min_guide_ratio: 0.45,
               support_pick: "len_x_sep", fill_missing_axes: true },
  SENS_TOL: { probe_px: 1, probe_dirs: 8, budget_deg: 0.5, unusable_px: 1.0 },
  SNAP_TOL,
  LIVE_TOL,
  CONSENSUS_TOL,
  PLACE_TOL,
  TUBE_TOL,
  EYE_HEIGHT,
  VP_INFINITE_RATIO,
  INK_GRADES,
} as const;

/** 키 순서에 무관한 정준 문자열. 객체 리터럴 순서가 바뀌어도 해시가 안 흔들린다. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

/** FNV-1a 32bit — **결정론적**이어야 한다(V-H: `hash(str)`·`Math.random` 금지). */
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface ConstantsSnapshot {
  hash: string;
  values: typeof SHARED_CONSTANTS;
  note: string;
}

/** 산출물에 넣을 스냅샷. **모든 측정 하네스가 이것을 `constants` 필드로 낸다.** */
export function constantsSnapshot(): ConstantsSnapshot {
  const text = canonical(SHARED_CONSTANTS);
  return {
    hash: stableHash(text),
    values: SHARED_CONSTANTS,
    note: (
      "이 실행이 쓴 공유 상수. `selfcheck.py`가 현재 값(`stage0/out/constants.json`)과 대조해 "
      + "다르면 **STALE**로 표시한다 — 그 산출물은 낡았고 그것을 인용한 문서도 낡았다는 뜻이다."
    ),
  };
}
