// **게이트 블록을 한 모양으로 낸다** — PITFALLS #35 자동화의 *기록하는 쪽*.
//
// `selfcheck.scan_gate_reachability`는 원장에서 **`gate`라는 이름의 블록**을 찾아
// `reachability`가 있는지 본다. 그런데 그 이름으로 적는 하네스가 하나도 없어서
// **원장 39개를 훑고도 덮는 대상이 0이었다** — 플래그 0건이 나왔고 그것이 "깨끗함"으로
// 읽혔다(#32의 상황). 검사의 이름 목록을 넓혀 0을 지우는 것은 #19(검사 약화)이므로,
// **기록하는 쪽을 고친다.** 그 자리가 여기다.
//
// 두 필드가 짝이다:
//   `registered`   — 무엇을 통과라고 **측정 전에** 박았는가(#26)
//   `reachability` — 무엇이 그 기준을 **넘을 수 있는가**(#35: 오라클 팔·대리 참값·이론 상한)
// ⚠ `reachability`가 못 넘는다고 나와도 **기준을 낮추지 않는다.** 적기만 한다
//   (#26의 반대편 문을 여는 것이다).
// ⚠ 오라클을 "상한"이라 부르지 않는다 — **한 대리 참값의 성능**이지 도달 가능성의 증명이 아니다.
// ⚠⚠ **오라클의 지표부터 의심한다** — L-C.3의 첫 오라클(0.4979)은 자기 게이지였고,
//   최소제곱이 전역 배율을 적합해 **사용자가 보는 성분을 지운 뒤**의 수였다.
export type Gate = {
  /** 사전 등록한 통과 기준. 측정 전에 박는다(#26) */
  registered: string;
  /** 무엇이 그 기준을 넘을 수 있는가(#35). 못 넘어도 기준을 낮추지 않는다 */
  reachability: string;
  /**
   * **도달 가능성의 수치**(PITFALLS #40, 2026-08-16 사람 지시).
   *
   * 산문만으로는 **항등이나 자명한 값**을 적어 놓고도 검사를 통과한다 — 실제로 그랬다:
   * `horizon`의 초판이 "참 카메라에서 오차 0"(항등, 정보량 0)을 이 자리에 적었고,
   * `camera_gate`는 "`deg_0` 행이 **정의상** 1.0배"라 적었는데 그 행이 **대역의 출처 자체**다.
   * **자동 검사를 만들면서 그 검사를 무력화한 것**이고, 그래서 수치를 함께 요구한다.
   *
   * 값은 **기준과 같은 지표**여야 하고 `reachability_source`가 그것이 원장 어디에 있는지 적는다.
   * ⚠ **정확히 0이나 1이면 selfcheck가 항등을 의심한다** — 그 값은 대개 측정이 아니라 보장이다(#5).
   */
  reachability_value?: number | number[];
  /** 위 값이 이 원장 안 어디에 있는가. 점 경로(`a.b.c`). selfcheck가 **값 대조**한다(#33) */
  reachability_source?: string;
  /**
   * **값의 크기가 픽스처 상수에서 온다는 표시**(#46 ⚙️ — cube_frame 선례). selfcheck가
   * 이 필드를 읽어 "픽스처가 정한 값" 갈래로 센다 — 산문에만 적으면 검사에는 정보 있는
   * 값으로 세어진다(13차 1·2 리뷰어 2차 [5]).
   */
  reachability_value_fixture_determined?: boolean;
  /**
   * **오라클 팔이 없다면 그 사실을 명시한다.** 산문 속에 묻히지 않게 별도 필드로 받는다 —
   * "없다"는 것도 결론이고, 그러면 #35대로 *기준을 못 넘은 것이 신호의 성질인지 기준의
   * 성질인지 갈리지 않는다*는 상태임이 원장에 남는다. ⚠ 기준을 낮추는 근거가 아니다.
   */
  reachability_absent?: string;
  /** 이번 실행의 결과(있으면) */
  result?: unknown;
  /** 이 게이트가 살아 있는가 — 은퇴했으면 사유를 적는다 */
  status?: string;
  note?: string;
};

/** 두 필드를 **비워 둘 수 없게** 강제한다. 비면 던진다 — 조용히 빈 게이트가 원장에 남지 않게. */
export function gate(g: Gate): Gate {
  if (!g.registered?.trim())
    throw new Error("gate.registered가 비었다 — 통과 기준은 측정 전에 박는다(PITFALLS #26)");
  if (!g.reachability?.trim())
    throw new Error("gate.reachability가 비었다 — 무엇이 이 기준을 넘을 수 있는지 함께 적는다(PITFALLS #35)");
  // **산문만으로는 안 된다**(#40) — 수치 + 출처, 아니면 "오라클이 없다"는 명시.
  const hasValue = g.reachability_value !== undefined;
  if (hasValue && !g.reachability_source?.trim())
    throw new Error("gate.reachability_value가 있는데 `reachability_source`가 없다 — "
                    + "그 수치가 원장 어디에서 왔는지 적는다(값 대조, PITFALLS #33)");
  if (!hasValue && !g.reachability_absent?.trim())
    throw new Error("gate의 도달 가능성이 **산문뿐이다**(PITFALLS #40) — "
                    + "`reachability_value` + `reachability_source`를 적거나, "
                    + "오라클 팔이 없으면 `reachability_absent`에 그 사실을 적는다. "
                    + "산문만 두면 항등·자명한 값을 적고도 검사를 통과한다(실제로 그랬다)");
  return g;
}
