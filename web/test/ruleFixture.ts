// **규칙 상태 픽스처** — 옛 `cam.guides = [...]` 자리를 대신한다(2026-08-16 전면 교체).
//
// 가이드가 없어졌으므로 하네스도 **규칙 상태**로 카메라를 세운다. 앱과 같은 자료구조를
// 쓰고 같은 `loadRules`를 부른다(PITFALLS #17: 측정 경로와 앱 경로가 갈라지지 않는다).
import type { CamState } from "../src/ui/camState.js";
import type { RuleState, Slot } from "../src/s3d/vpRules.js";
import type { Pt2 } from "../src/s3d/camera.js";

/** 유한 소실점 슬롯. `source`는 **깊이선 둘의 교점**으로 둔다(규칙 b). */
export const vpSlot = (at: Pt2, support = 2): Slot =>
  ({ kind: "vp", at: [at[0], at[1]], source: "horizon_x_line", support });

/** 무한원(화면 평행) 슬롯 — 화면 가로/세로 축(규칙 a). */
export const screenSlot = (dir: "h" | "v", support = 1): Slot =>
  ({ kind: "screen", dir, support });

/**
 * 슬롯 셋 → 규칙 상태. **지평선은 첫 유한 수평 소실점이 정한다** —
 * 손으로 넣지 않는다(그 순서가 규칙의 핵심이라 픽스처에서도 지킨다).
 */
export function rulesOf(slots: [Slot | null, Slot | null, Slot | null],
                        imgSize: [number, number] = [960, 672]): RuleState {
  // **지평선은 처음부터 있다**(2026-08-16). 유한 수평 소실점이 있으면 그 y가 지평선이고
  // (규칙이 그 위에만 놓으므로 같은 값이다), 없으면 기본값(피치 0 = 화면 중앙)이다.
  const h = ([0, 1] as const).map(i => slots[i]).find(s => s && s.kind === "vp");
  return {
    slots,
    horizon: h && h.kind === "vp" ? h.at[1] : imgSize[1] / 2,
    verticalLines: [],
  };
}

/** 카메라를 그 슬롯들로 세운다. */
export function setRules(cam: CamState, slots: [Slot | null, Slot | null, Slot | null]): void {
  cam.loadRules(rulesOf(slots));
}
