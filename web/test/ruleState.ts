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
