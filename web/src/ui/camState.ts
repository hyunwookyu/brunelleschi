// **규칙 기반 카메라 상태**(2026-08-16, 사람 지시로 전면 교체).
//
// 옛 판은 **검출 초안 → 가이드 여섯 → 사용자가 끌기**였다. 그 경로를 통째로 뺐다:
// 프리셋도 가이드도 두지 않고, **선만 그으면 카메라가 선다**(`vpRules.ts`).
//
// ```
// 획 → classifyLine → 화면 가로세로면 축 자체(무한원) · 깊이면 교점
//                   → 애매하면 **묻는다**(추정하지 않는다)
//    → RuleState(슬롯 셋 + 지평선) → recoverCamera(유한 소실점 개수로 갈린다, 이론서 2.3)
// ```
//
// **측정 경로와 앱 경로가 갈라지지 않게** 규칙은 `s3d/vpRules.ts` 하나에 있고 원장 하네스가
// 같은 함수를 부른다(PITFALLS #17). 여기 있는 것은 **그 상태를 앱이 쓰는 모양으로 감싸는 것**뿐이다.
//
// ⚠ **`ConstraintAccumulator`를 계속 쓴다** — 경고(둔각·화각·주점 가정)와 저장 형식이 거기 있고,
// 규칙이 낸 소실점을 `vp_point`로 넣으면 그대로 동작한다. 바뀐 것은 **무엇이 그 점을 정하는가**다.
import { ConstraintAccumulator, type AxisId } from "../s3d/constraints.js";
import {
  newRuleState, cloneRuleState, stepRule, deriveVertical, vpsOf, axisDirsOf,
  orderOfState, axisOfStroke, RULE_TOL,
  type RuleState, type RuleEvent, type RLine,
} from "../s3d/vpRules.js";
import { fPixelsFrom35mm } from "../s3d/constraints.js";
import type { Pt2 } from "../s3d/camera.js";
import type { Axis } from "../s3d/axis.js";
import type { PlaceCtx } from "../s3d/stroke.js";

/**
 * **1점 투시의 f는 설정값이다**(이론서 5.3 자유도 회계 · CLAUDE.md §1).
 *
 * 소실점 하나면 자유도가 하나 남고 그것이 f다. 측정으로 채울 수 없으므로 **설정으로 채우고
 * 출처를 화면에 낸다**(`fSource = "setting(렌즈)"`). 기본값 35mm 환산은 흔한 스케치 화각이다.
 *
 * ⚠ **이 값이 없으면 1점 투시에서 카메라가 서지 않는다** — `recoverCamera`가 `ok:false`를 내고
 * `ctx()`가 `null`이 되어 **무엇을 그려도 대기**가 된다. 규칙 b("깊이선 둘 → 1점 투시 확정")가
 * 실제로 확정이 되려면 이 자리가 채워져 있어야 한다.
 */
export const DEFAULT_LENS_MM = 35;

export interface RuleFeedback {
  event: RuleEvent;
  /** 그 획이 규칙에 실제로 반영됐는가. `ask`·`rejected`면 아니다. */
  applied: boolean;
}

export class CamState {
  readonly acc: ConstraintAccumulator;
  /** 규칙 상태 — **이것이 카메라의 단일 출처다.** */
  rules: RuleState = newRuleState();
  /** 확정됐는가(§1.2의 "카메라 확정"). 확정 뒤에는 획이 소실점을 바꾸지 않는다. */
  locked = false;
  /** 1점 투시에서 쓸 렌즈(35mm 환산 mm). `null`이면 f가 안 채워진다. */
  lensMm: number | null = DEFAULT_LENS_MM;

  constructor(imgSize: [number, number]) {
    this.acc = new ConstraintAccumulator(imgSize);
    this.apply();
  }

  get imgSize(): [number, number] { return this.acc.imgSize; }

  resize(s: [number, number]) {
    this.acc.resize(s);
    // 창이 커지면 **유도된 수직 소실점의 전제(주점 = 이미지 중심)가 움직인다** —
    // 유도값은 다시 낸다. 그은 선에서 나온 소실점은 그대로 둔다(그것은 그림이 정한 값이다).
    if (this.rules.slots[2]?.kind === "vp" && this.rules.slots[2].source === "orthocenter") {
      this.rules = cloneRuleState(this.rules);
      this.rules.slots[2] = null;
      this.rules = deriveVertical(this.rules, s);
    }
    this.apply();
  }

  /** 규칙 상태 → 누산기. **교체다**(쌓이면 안 된다). */
  apply(): void {
    const vps = vpsOf(this.rules);
    for (const ax of [0, 1, 2] as AxisId[]) {
      this.acc.setLines(ax, []);                     // 선 제약은 쓰지 않는다 — 규칙이 점을 준다
      const v = vps[ax];
      if (v) this.acc.setPoint(ax, v);
    }
    // **1점 투시에서만 f를 설정으로 채운다.** 2·3점에서는 측정이 이긴다(`recoverCamera`).
    const nFinite = vps.filter(Boolean).length;
    this.acc.setLens(nFinite === 1 && this.lensMm != null
      ? fPixelsFrom35mm(this.lensMm, this.imgSize[0]) : null);
  }

  /**
   * **획 하나를 규칙에 넣는다.** 확정 뒤에는 아무것도 안 한다 — 소실점은 잠긴다(CLAUDE.md §1).
   *
   * `forced`는 사용자가 물음에 답한 것이다.
   */
  feed(line: RLine, forced?: "screen" | "depth" | "vertical"): RuleFeedback {
    if (this.locked) return { event: { type: "rejected", why: "소실점이 확정돼 잠겼습니다" }, applied: false };
    const r = stepRule(this.rules, line, this.imgSize, forced);
    const applied = r.event.type !== "ask" && r.event.type !== "rejected";
    if (applied) { this.rules = r.state; this.apply(); }
    return { event: r.event, applied };
  }

  vps(): (Pt2 | null)[] { return vpsOf(this.rules); }

  /** 유한 소실점 수 = 투시 차수(이론서 2.3 — 분기가 아니라 개수다). */
  order(): number { return orderOfState(this.rules); }

  /** 배치 문맥. 카메라가 아직이면 `null` — **애매하면 놓지 않는다**(A-3). */
  ctx(): PlaceCtx | null {
    const cam = this.acc.solve().camera;
    if (!cam.ok || cam.f == null || !cam.principalPoint) return null;
    return {
      principal: cam.principalPoint, f: cam.f, vps: this.vps(), imgSize: this.imgSize,
      // **무한원 축의 방향은 화면 방향 그대로다**(이론서 2.2) — 소실점이 없다고 못 올리던 자리.
      // 1점 투시의 화면 가로·세로 획이 여기서 살아난다.
      axisDirs: axisDirsOf(this.rules, cam.principalPoint, cam.f),
    };
  }

  /** 획 하나의 축 — 규칙이 이미 정해 둔 축에 붙인다. 추정이 없다. */
  axisOf(pts2d: Pt2[]): { axis: Axis; why: string } { return axisOfStroke(pts2d, this.rules); }

  /** 저장·복원용. **규칙 상태 그대로** 담는다(푼 결과가 아니다 — 열어서 이어 그릴 수 있어야 한다). */
  dumpRules(): RuleState { return cloneRuleState(this.rules); }
  loadRules(s: RuleState | null): void {
    this.rules = s ? cloneRuleState(s) : newRuleState();
    this.apply();
  }

  reset(): void {
    this.rules = newRuleState();
    this.acc.reset();
    this.lensMm = DEFAULT_LENS_MM;
    this.locked = false;
    this.apply();
  }
}

export { RULE_TOL };
