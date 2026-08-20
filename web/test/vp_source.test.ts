// **표시와 스냅이 같은 소실점을 읽는가** — 규칙 하나(`ui/vpSource.screenVps`)의 단위 팔.
//
// 이 파일이 재는 것과 안 재는 것을 갈라 둔다:
//   · 잰다   — 출처 규칙 자체(핀·비핀·미확정 · 되살림 스위치).
//   · 안 잰다 — **앱의 소비자들이 실제로 이 함수를 지나는가**. 그것은 앱 배선이라
//     종단(`e2e/vp_source.spec.ts`)이 든다 — 되살림 스위치로 어긋남을 되살려 잡는다.
import { describe, it, expect } from "vitest";
import { screenVps } from "../src/ui/vpSource.js";
import type { Pt2 } from "../src/s3d/camera.js";

const CAM: (Pt2 | null)[] = [[100, 50], [900, 50], null];
const VIEW: (Pt2 | null)[] = [[-300, 700], [1200, 20], [640, -4000]];

describe("screenVps — 화면 소실점의 단일 출처", () => {
  it("핀(확정 시점)이면 규칙의 값이다 — 자세가 항등이라 시점 값과 같은 자리다", () => {
    expect(screenVps({ camVps: CAM, viewVps: VIEW, pinned: true })).toBe(CAM);
  });

  it("카메라가 아직 안 섰으면(시점 문맥 없음) 규칙의 값이다", () => {
    expect(screenVps({ camVps: CAM, viewVps: null, pinned: false })).toBe(CAM);
  });

  it("돌린 시점이면 **그 시점의 투영**이다 — 규칙의 값은 확정 시점의 것이라 낡았다", () => {
    expect(screenVps({ camVps: CAM, viewVps: VIEW, pinned: false })).toBe(VIEW);
  });

  // **반례** — 되살림 스위치가 실제로 옛 배선을 낸다(#30). 이것이 안 갈리면 종단의
  // 되살림 팔도 아무것도 안 되살린다.
  it("되살림(legacy)이면 돌린 시점에서도 규칙의 값이다 — 수리 전 거동", () => {
    expect(screenVps({ camVps: CAM, viewVps: VIEW, pinned: false }, true)).toBe(CAM);
    // 그 거동이 실제로 **다른 점**을 가리킨다(0이 아니다 — 눈뜬 반례인가)
    const a = screenVps({ camVps: CAM, viewVps: VIEW, pinned: false })[0]!;
    const b = screenVps({ camVps: CAM, viewVps: VIEW, pinned: false }, true)[0]!;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(1);
  });

  it("핀에서는 되살림이 아무것도 안 바꾼다 — 두 출처가 정의상 같은 자리다", () => {
    expect(screenVps({ camVps: CAM, viewVps: VIEW, pinned: true }, true)).toBe(CAM);
  });
});
