// **작도 시점 판정과 복귀 방향**(2026-08-19 14차 항목 6 · D-L97).
//
// "작도 화면"은 상태로 저장하지 않는다 — CLAUDE.md §1의 규약("확정됐는가도 계산이다")
// 그대로, **자세에서 매번 계산한다**. 좌표계는 큐브 기준계(그린 축 — D-L87)다:
// three 규약(y 위·z 앞·시선 f)으로 내린 시선 벡터를 받는다. 1점·2점 확정에서는 그린
// 축이 세계 축과 같으므로 세계 기준과 구별이 없고, 3점(기울어진 수직축)에서는 큐브와
// 같은 기준계를 쓴다 — 두 판정이 갈리면 큐브 탭과 복귀 버튼이 다른 곳으로 간다.
//
// 판정 단위는 **각도**다(#49 — 이 결정이 쓰는 양): 피치(시선의 그린-수직 성분)와
// 요의 축 이탈. 임계는 새로 만들지 않고 `ONE_POINT_TOL.hand_deg`(D-L77의 손 정렬 스냅
// 임계)를 재사용한다(#17).

import type { Vec3 } from "./geom3d.js";

export interface DraftJudge {
  /** null = 모델링 시점(작도 아님). */
  kind: "one_point" | "two_point" | null;
  /** 시선의 그린-수직 성분 각(도). 작도 화면의 정의 조건이 |pitch| ≤ hand_deg다(지시 6-d). */
  pitchDeg: number;
  /** 요의 최근접 축 이탈 각(도, 0~45). one_point 판정의 조건이다. */
  yawOffDeg: number;
  /**
   * **가장 가까운 작도 시점의 시선**(같은 큐브 기준계). 피치는 0으로 접고, 요는
   * 축 이탈이 hand_deg 안이면 그 축으로 스냅(1점 — D-L76 재탭과 같은 답), 밖이면
   * 유지한다(2점 — 지시 6-a "피치 0이되 요가 축 사이"). 피치를 접는 것이 항상
   * 최소 회전이므로 "가장 가까운 1점 **또는** 2점"의 답은 이 규칙 하나로 닫힌다.
   */
  returnDir: Vec3;
}

const clamp1 = (v: number): number => Math.max(-1, Math.min(1, v));

/** 시선(큐브 기준계·three 규약) → 작도 판정 + 복귀 방향. */
export function judgeDraftPose(f: Vec3, handDeg: number): DraftJudge {
  const pitchDeg = (Math.asin(clamp1(f[1])) * 180) / Math.PI;
  const yawDeg = (Math.atan2(f[0], -f[2]) * 180) / Math.PI;
  const yawOffDeg = Math.abs(yawDeg - Math.round(yawDeg / 90) * 90);
  const kind: DraftJudge["kind"] =
    Math.abs(pitchDeg) > handDeg ? null
    : yawOffDeg <= handDeg ? "one_point" : "two_point";
  let returnDir: Vec3;
  const hLen = Math.hypot(f[0], f[2]);
  if (hLen < 1e-6) {
    // 수직 응시(위/아래 뷰) — 수평 성분이 없어 "요 유지"가 성립하지 않는다.
    // 결정론적 기본값으로 정면(깊이축)을 준다 — 큐브 재탭(nearestOnePointDir)도
    // 이 특이점에서는 내적이 전부 ~0이라 후보 순서가 답을 정한다(같은 성질).
    returnDir = [0, 0, -1];
  } else if (yawOffDeg <= handDeg) {
    const snapped = (Math.round(yawDeg / 90) * 90 * Math.PI) / 180;
    returnDir = [Math.sin(snapped), 0, -Math.cos(snapped)];
  } else {
    returnDir = [f[0] / hLen, 0, f[2] / hLen];
  }
  return { kind, pitchDeg, yawOffDeg, returnDir };
}
