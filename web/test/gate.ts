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
  return g;
}
