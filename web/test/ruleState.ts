// **시험이 쓰는 «지평선을 그은 뒤의 첫 상태»**(2026-08-20 18차 지시 j·l · D-L109).
//
// 새 절차에서 **그리기는 지평선을 그은 뒤에 열린다.** `newRuleState`는 그보다 앞선 상태
// (`horizon: null`)라, 깊이선을 바로 먹이면 정의상 거절된다 — 시험이 그 상태에서 시작하면
// 앱이 도달할 수 없는 자리를 재는 것이다(#40).
//
// ⚠ **여기서 규칙을 다시 쓰지 않는다**(#52) — 앱과 같은 `withHorizon`을 부를 뿐이다.
import { newRuleState, withHorizon, type RuleState } from "../src/s3d/vpRules.js";

/** 지평선을 `y`에 그은 상태. 기본은 화면 중앙이지만 **기본 위치가 있다는 뜻이 아니다** —
 *  시험이 한 값을 골랐을 뿐이다(앱에는 기본 위치가 없다, 지시 j). */
export function drawnHorizon(sz: [number, number], y = sz[1] / 2): RuleState {
  return withHorizon(newRuleState(sz), y, sz);
}

/**
 * **픽스처의 «참 지평선»에서 시작한다**(2026-08-20 18차 · D-L109).
 *
 * 새 절차에서 규칙은 **지평선이 있어야** 깊이선을 소실점으로 바꾼다. 측정 하네스가
 * `newRuleState`(지평선 `null`)에서 시작하면 **모든 선이 거절돼** 원장이 통째로 0이 된다
 * (실제로 `rule_camera`·`axis_snap_measure`가 그렇게 깨졌다).
 *
 * 참 지평선은 **유한 수평 소실점의 y**다(롤 0이면 둘이 같은 y다 — 이론서 2.2·15.1).
 * 둘 다 무한원이면 화면 중앙으로 둔다(그 구도에서는 지평선이 화면 중앙 높이다).
 *
 * ⚠⚠ **이 지평선에는 손 오차가 없다.** 사람이 긋는 선에는 오차가 있으므로 이 값은
 * **낙관 쪽**이다 — 하네스가 재는 것은 «지평선을 정확히 그었을 때 규칙이 무엇을 내는가»다.
 * 지평선의 손 오차는 **안 쟀다**(#32: 안 잰 것이지 «영향이 없다»가 아니다).
 */
export function trueHorizonY(vps: readonly (readonly number[] | null)[],
                             sz: [number, number]): number {
  for (const i of [0, 1]) {
    const v = vps[i];
    if (v && Number.isFinite(v[1]) && Math.abs(v[0]) < 1e7) return v[1];
  }
  return sz[1] / 2;
}
