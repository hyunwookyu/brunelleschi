// **방향·관계 스냅은 `depth` 판정을 뒤집지 못한다**(D-L80 — 2026-08-18 9차 항목 0-d).
//
// ## 왜 이 테스트인가 (#21 — 회귀 테스트는 버그를 되살려 실제로 잡는지 확인한다)
//
// D-L70이 지운 것은 `snapForced`(스냅이 곧 **선언**이다)인데, **좌표 이동 자체가 선언이었다**:
// `screenOrthoSnap`·`alignAxes`가 획을 정확히 0°/90°로 옮겨 놓으면 `classifyLine`은
// **반드시** 화면 축을 낸다. 그러면 규칙이 판정한 것이 아니라 스냅이 판정한 것이다.
//
// 그래서 **가드를 끈 팔을 함께 돌린다**(`kindFlipGuard: false`) — 그 팔에서 실제로
// `screen_h`가 나와야 이 테스트가 무엇을 잡는지 증명된다. 그 단언이 없으면 이 파일은
// "가드가 켜져 있다"만 확인하고 **버그가 되살아나도 통과**한다(#32).
import { describe, it, expect } from "vitest";
import { resolve2dCore } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import { classifyLine, RULE_TOL } from "../src/s3d/vpRules.js";
import { representative } from "../src/s3d/axis.js";
import type { Pt2 } from "../src/s3d/camera.js";

const DIAG = Math.hypot(960, 672);

const kindOf = (pts: Pt2[]) => {
  const r = representative(pts);
  expect(r).not.toBeNull();
  return classifyLine(r!.a, r!.b);
};

/**
 * **관계 스냅이 시작점의 y를 끌어와 얕게 만드는 구도.**
 *
 * 원본은 `(100,100) → (200,115)`이고 화면 수평과 **8.53°** — `depth_min_deg`(8°) 밖이라
 * `classifyLine`이 `depth`를 낸다. 후보 선분의 y가 109라서 `alignAxes`가 시작점을
 * `(100,109)`로 끌면 남은 각이 **3.43°**가 되고, 그러면 `screenOrthoSnap`(4°)이 끝점을
 * 축 위로 옮겨 **정확히 수평**이 된다.
 */
const RAW: Pt2[] = [[100, 100], [200, 115]];
const CAND_SEGS: Snap2Seg[] = [{ id: "c0", a: [20, 109], b: [60, 109] }];

describe("D-L80 — 스냅은 판정을 뒤집지 못한다", () => {
  it("원본이 `depth`인지부터 확인한다 (동작점)", () => {
    const v = kindOf(RAW);
    expect(v.kind).toBe("depth");
    expect(v.toH).toBeGreaterThan(RULE_TOL.depth_min_deg);
  });

  it("⛔ 가드를 끄면 **버그가 되살아난다** — 깊이 획이 화면 수평이 된다", () => {
    const r = resolve2dCore(RAW, {
      cands: static2dCandidates(CAND_SEGS, DIAG), vps: [],
      radiusPx: 15, relSnap: true, kindFlipGuard: false,
    });
    const v = kindOf(r.pts as Pt2[]);
    // **이 단언이 이 파일의 존재 이유다**(#21) — 되살린 버그를 실제로 낸다
    expect(v.kind).toBe("screen_h");
    expect(v.toH).toBeLessThan(1e-9);
  });

  it("✅ 가드가 켜져 있으면 `depth`로 남는다", () => {
    const r = resolve2dCore(RAW, {
      cands: static2dCandidates(CAND_SEGS, DIAG), vps: [],
      radiusPx: 15, relSnap: true,           // 기본 = 가드 켬
    });
    const v = kindOf(r.pts as Pt2[]);
    expect(v.kind).toBe("depth");
    expect(r.ortho).toBeNull();
    expect(r.guides.length).toBe(0);
  });

  it("반례 — **화면 획은 그대로 스냅된다**(가드가 직교 스냅을 죽이지 않는다)", () => {
    // 1.72° — `screen_axis_deg`(4°) 안이므로 원본이 이미 `screen_h`다. 가드는 안 걸린다.
    const raw: Pt2[] = [[100, 100], [200, 103]];
    expect(kindOf(raw).kind).toBe("screen_h");
    const r = resolve2dCore(raw, { cands: [], vps: [], radiusPx: 15, relSnap: true });
    expect(r.ortho).not.toBeNull();
    expect(r.b[1]).toBe(100);                // 정확히 수평으로 옮겨졌다
    expect(kindOf(r.pts as Pt2[]).kind).toBe("screen_h");
  });

  it("반례 — **소실점 방향 스냅은 살아 있다**(판정과 같은 편이므로 안 막는다)", () => {
    // 소실점을 향해 그은 깊이 획. 가드가 켜져도 `vpdir`가 붙어야 한다.
    const vp: Pt2 = [700, 200];
    const raw: Pt2[] = [[100, 500], [340, 400]];
    expect(kindOf(raw).kind).toBe("depth");
    const r = resolve2dCore(raw, { cands: [], vps: [vp], radiusPx: 15, relSnap: true });
    expect(r.vpdir).not.toBeNull();
    expect(kindOf(r.pts as Pt2[]).kind).toBe("depth");
  });

  it("애매(4~8°)는 가드 밖이다 — 스냅이 모호를 가르는 것은 8차 지시 2-b 그대로다", () => {
    // 5.7° — `ambiguous`. 가드는 `depth`에만 걸리므로 관계 스냅이 그대로 돈다.
    const raw: Pt2[] = [[100, 100], [200, 110]];
    expect(kindOf(raw).kind).toBe("ambiguous");
    const r = resolve2dCore(raw, {
      cands: static2dCandidates(CAND_SEGS, DIAG), vps: [], radiusPx: 15, relSnap: true,
    });
    expect(r.guides.length).toBeGreaterThan(0);
  });
});
