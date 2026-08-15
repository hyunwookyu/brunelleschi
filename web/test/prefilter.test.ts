// **거름을 선택 전에 걸면 경쟁자가 죽어 상대 판정이 거저 통과한다** — 반복 유형 19.
//
// S-8b에서 실제로 걸렸다: 각도 거부권을 후보의 부적합도를 `Infinity`로 만들어 걸었더니
// 오배정이 79% → **90%로 늘었다**. 경쟁자를 죽이면 상대 순위(`rank_margin`)가 거저 통과한다.
// 지시가 "일반 원칙이므로 다른 필터에도 적용되는지 점검 대상에 넣으라"고 했고, 그 점검이 이 파일이다.
//
// **찾은 것**: `classifyStroke`가 `screen`(화면평행) 후보를 **선택 전에** 거른다 —
// `m: sm <= screen_parallel ? sm : Infinity`. 그 결과 유한한 후보가 하나뿐이면
// `runnerUp`이 `null`이 되고, 애매성 판정이 `runnerUp == null`로 **무조건 통과**한다.
//
// 아래는 그 기전이 **존재한다**는 반례이고, **얼마나 자주 일어나는지는 안 쟀다**
// (구도에 달렸고 소실점 셋이 다 유한하면 거의 안 일어난다). 고치려면 `screen`의 실제
// 부적합도를 순위에 남기고 거름을 **선택 뒤에** 걸어야 하는데, 그것은 판정 규칙 변경이라
// **모든 배치 원장을 다시 돌려야 한다**(STALE). 실획 재조정과 함께 하는 것이 맞다.
import { describe, it, expect } from "vitest";
import { classifyStroke, AXIS_TOL, representative } from "../src/s3d/axis.js";
import type { Pt2 } from "../src/s3d/camera.js";

const IMG: [number, number] = [960, 672];

/** 두 점을 잇는 곧은 획(점 여럿). 판정은 대표 직선으로 하므로 표본 수는 중요하지 않다. */
const line = (a: Pt2, b: Pt2, n = 12): Pt2[] =>
  Array.from({ length: n + 1 }, (_, i) =>
    [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt2);

describe("선택 전 거름 — 경쟁자를 죽이면 판정이 거저 통과한다(반복 유형 19)", () => {
  it("`screen`이 걸러지면 2등이 사라지고 **미분류가 됐어야 할 획이 축으로 배정된다**", () => {
    // 소실점 **하나만** 유한한 구도(2점 투시에서 한 축이 무한원인 흔한 경우).
    const vps: (Pt2 | null)[] = [[3000, 220], null, null];
    // 거의 수평인 획 — `screen`의 부적합도가 임계 **바로 위**라 걸러진다.
    const pts = line([300, 300], [700, 322]);
    const rep = representative(pts)!;
    const sm = Math.min(Math.abs(rep.b[0] - rep.a[0]), Math.abs(rep.b[1] - rep.a[1])) / rep.len;
    expect(sm).toBeGreaterThan(AXIS_TOL.screen_parallel);      // 0.0549 > 0.05 → 걸러진다

    const v = classifyStroke(pts, vps, IMG);
    expect(v.axis).toBe(0);                                    // 축으로 배정됐다
    expect(v.runnerUp).toBeNull();                             // **2등이 없다**(거른 탓이다)

    // `screen`의 실제 부적합도가 순위에 남아 있었다면 애매성 판정이 걸렸을 것이다:
    const best = v.misfit!;                                    // 0.0422
    expect(sm).toBeLessThanOrEqual(best * AXIS_TOL.ambiguity_margin);   // 0.0549 ≤ 0.0633
    // → `separated`가 false가 되어 **미분류(ambiguous)**로 갔어야 한다.
    // **기전이 존재한다.** 빈도는 안 쟀다 — 구도에 달렸고, 소실점 셋이 다 유한하면 안 생긴다.
  });

  it("같은 획도 소실점이 잘 맞으면 배정이 옳다 — 위 반례는 **경계 구도**의 것이다", () => {
    // 소실점이 획 방향과 잘 맞으면(부적합도가 작으면) `screen`이 2등이어도 애매하지 않다.
    const v = classifyStroke(line([300, 300], [700, 322]), [[3000, 430], null, null], IMG);
    expect(v.axis).toBe(0);
    expect(v.misfit!).toBeLessThan(0.01);
  });

  it("대조: 소실점이 둘 이상 유한하면 2등이 남으므로 이 기전이 안 생긴다", () => {
    const vps: (Pt2 | null)[] = [[3000, 300], [-2400, 340], null];
    const v = classifyStroke(line([300, 300], [700, 322]), vps, IMG);
    expect(v.runnerUp).not.toBeNull();          // 다른 축이 2등을 채운다
  });

  it("`screen`이 임계 안이면 그대로 순위에 남는다(거름이 안 걸린 경우)", () => {
    const vps: (Pt2 | null)[] = [[3000, 300], null, null];
    // 기울기 8/400 = 0.02 < 0.05 — 걸러지지 않는다
    const v = classifyStroke(line([300, 300], [700, 308]), vps, IMG);
    expect(v.scores?.some(s => s.axis === "screen" && Number.isFinite(s.m))).toBe(true);
  });
});
