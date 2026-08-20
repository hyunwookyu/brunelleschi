// **규칙 기반 카메라 상태**(2026-08-16, 사람 지시로 전면 교체 / 2026-08-17 지시 1로 단순화).
//
// ```
// 획 → classifyLine → 화면 가로세로면 축 자체(무한원) · 깊이면 교점
//                   → 애매하면 **묻는다**(추정하지 않는다)
//    → RuleState(슬롯 셋 + 지평선) → recoverCamera(유한 소실점 개수로 갈린다, 이론서 2.3)
// ```
//
// **상태는 넷뿐이다**(2026-08-17 지시 1): NONE / P1 / P2 / P3.
// **차수를 저장하지 않는다** — `perspectiveOrder(rules)`가 매번 계산하고 표시·판정이 그것을
// 부른다(같은 사실을 두 곳이 알면 어긋난다). ⛔ **`locked` 플래그를 지웠다**(지시 2) —
// "카메라가 섰는가"는 `standing()`이 계산한다. 소실점 잠금은 `stepRule` 자체의 성질이다
// (슬롯이 차면 지지선으로만 센다).
//
// **측정 경로와 앱 경로가 갈라지지 않게** 규칙은 `s3d/vpRules.ts` 하나에 있고 원장 하네스가
// 같은 함수를 부른다(PITFALLS #17). 여기 있는 것은 **그 상태를 앱이 쓰는 모양으로 감싸는 것**뿐이다.
//
// ⚠ **`ConstraintAccumulator`를 계속 쓴다** — 경고(둔각·화각·주점 가정)와 저장 형식이 거기 있고,
// 규칙이 낸 소실점을 `vp_point`로 넣으면 그대로 동작한다. 바뀐 것은 **무엇이 그 점을 정하는가**다.
import { ConstraintAccumulator, type AxisId } from "../s3d/constraints.js";
import {
  newRuleState, cloneRuleState, stepRule, vpsOf, axisDirsOf, hasHorizon,
  horizonAdjustable, withHorizon, perspectiveOrder, axisOfStroke, RULE_TOL,
  type RuleState, type RuleEvent, type RLine, type POrder,
} from "../s3d/vpRules.js";
import type { Pt2 } from "../s3d/camera.js";
import type { Axis } from "../s3d/axis.js";
import type { PlaceCtx } from "../s3d/stroke.js";

/**
 * **P1(1점 확정)의 임의 f — 화면 폭 배수**(2026-08-17 지시 1).
 *
 * "f는 깊이 배율일 뿐이므로 임의값으로 두고 3D를 세운다. 형태는 정확하고 깊이만 무차원.
 * 전역 스케일과 같은 처리." 근거는 `camera.ts`의 `frontalWorld` 게이지다 — 1점에서 화면
 * 평행면의 기하는 f와 무관하고 깊이만 f에 비례한다.
 *
 * ⚠ **임계가 아니라 게이지라 `test/constants.ts`에 안 넣는다**(D-C4의 예외, D-L49·D-L51과
 * 같은 자리): 이 값은 어떤 판정도 가르지 않고(바꾸면 깊이 표시 배율만 변한다), 전역 해시에
 * 넣으면 무관한 원장 40여 개가 STALE이 된다. 값 1.0 = 화각 약 53°(사람 눈에 자연스러운 배율).
 */
export const P1_F_RATIO = 1.0;

export interface RuleFeedback {
  event: RuleEvent;
  /** 그 획이 규칙에 실제로 반영됐는가. `ask`·`rejected`면 아니다. */
  applied: boolean;
}

export class CamState {
  readonly acc: ConstraintAccumulator;
  /** 규칙 상태 — **이것이 카메라의 단일 출처다.** */
  rules: RuleState = newRuleState([960, 672]);

  constructor(imgSize: [number, number]) {
    this.acc = new ConstraintAccumulator(imgSize);
    this.rules = newRuleState(imgSize);
    this.apply();
  }

  get imgSize(): [number, number] { return this.acc.imgSize; }

  resize(s: [number, number]) {
    const oldH = this.imgSize[1];
    this.acc.resize(s);
    // **창이 바뀌면 지평선은 화면 비율을 지킨다.** 소실점이 이미 그 위에 놓였으면 옮기지
    // 않는다 — 그러면 확정된 축이 소리 없이 바뀐다(A-3).
    //
    // ⚠⚠ **레이아웃 전에는 캔버스 높이가 1px일 수 있다**(첫 `fit()` 전). 그 상태의 y는 뜻이
    // 없으므로 비례로 늘리지 않고 **기본값으로 다시 잡는다** — 브라우저에서 실제로 걸렸다:
    // 높이 1에서 `setHorizon(200)`이 1로 잘리고, 그 1이 675로 늘어나 **화면 바닥에 붙었다**.
    // **아직 안 그었으면 아무것도 안 한다**(지시 j — 기본 위치가 없다).
    if (this.rules.horizon != null && horizonAdjustable(this.rules)) {
      const y = this.rules.horizon;
      this.rules = cloneRuleState(this.rules);
      // ⚠⚠ 레이아웃 전에는 높이가 1px일 수 있다 — 그 y는 뜻이 없으므로 **비운다**
      // (옛 판은 기본값으로 되돌렸는데, 기본값이 없어졌다).
      this.rules.horizon = oldH > 2 ? (y * s[1]) / oldH : null;
    }
    this.apply();
  }

  /** 규칙 상태 → 누산기. **교체다**(쌓이면 안 된다). */
  apply(): void {
    const vps = vpsOf(this.rules);
    // **2점 투시에서 지평선은 주점 y다**(2026-08-17 A-4). 피치가 아니다:
    // 수직축이 화면 수직이면 피치는 정의상 0이고, 그때 지평선 y = 주점 y가 **강제된다**
    // (이론서 3.1 + 롤 0). 3점(수직 소실점이 유한)에서는 주점이 **수심**이므로 안 쓰인다.
    if (this.rules.horizon != null) {
      this.acc.add({ kind: "horizon", a: [0, this.rules.horizon], b: [1, this.rules.horizon] });
    }

    for (const ax of [0, 1, 2] as AxisId[]) {
      this.acc.setLines(ax, []);                     // 선 제약은 쓰지 않는다 — 규칙이 점을 준다
      const v = vps[ax];
      if (v) this.acc.setPoint(ax, v);
    }
    // **P1의 f는 임의값이다**(2026-08-17 지시 1) — 깊이 배율일 뿐이고 형태는 정확하다.
    // ⚠ **P1일 때만이다**: 가로선 없이 소실점 하나만 있으면 NONE이고 3D를 안 세운다.
    const p1 = perspectiveOrder(this.rules) === 1 && vps.filter(Boolean).length === 1;
    this.acc.setLens(p1 ? P1_F_RATIO * this.imgSize[0] : null);
  }

  /**
   * **획 하나를 규칙에 넣는다.** 소실점 잠금은 `stepRule`의 성질이다 — 슬롯이 차면
   * 지지선으로만 세고, 카메라를 바꾸는 것은 **전이(NONE→P1·NONE→P2·P2→P3)뿐**이다.
   *
   * `forced`는 사용자가 물음에 답한 것이다.
   */
  feed(line: RLine, forced?: "screen" | "depth",
       hint?: "screen" | "depth"): RuleFeedback {
    // `hint`는 **커서가 이미 가른 것**이고 애매 구간에만 쓰인다(8차 지시 2-b) —
    // P1 가드는 안 건드린다(D-L70의 결함을 안 되살린다).
    const r = stepRule(this.rules, line, this.imgSize, forced, {}, hint);
    const applied = r.event.type !== "ask" && r.event.type !== "rejected";
    if (applied) { this.rules = r.state; this.apply(); }
    return { event: r.event, applied };
  }

  // ⛔ **`pickVp`(점 찍기 확정)를 지웠다**(18차 지시 a) — 대기 풀이 없어 찍을 대상이 없다.

  /**
   * **지평선을 끌 수 있는가**(D-L45). **유한 소실점이 아직 없을 때**만이다.
   */
  canSetHorizon(): boolean { return horizonAdjustable(this.rules); }

  setHorizon(y: number): boolean {
    if (!this.canSetHorizon()) return false;
    const next = withHorizon(this.rules, y, this.imgSize);
    if (next === this.rules || next.horizon === this.rules.horizon) return false;
    this.rules = next;
    this.apply();
    return true;
  }

  vps(): (Pt2 | null)[] { return vpsOf(this.rules); }

  /** **지평선을 그었는가** — 그리기가 열리는 조건이다(지시 l). */
  hasHorizon(): boolean { return hasHorizon(this.rules); }

  /** **차수 = 계산**(지시 1). NONE 0 · P1 1 · P2 2 · P3 3. 표시도 판정도 이것을 부른다. */
  order(): POrder { return perspectiveOrder(this.rules); }

  /** **카메라가 섰는가** — 저장하지 않고 계산한다(옛 `locked` 플래그의 자리). */
  standing(): boolean { return this.ctx() != null; }

  /** 배치 문맥. 카메라가 아직이면 `null` — **애매하면 놓지 않는다**(A-3). */
  ctx(): PlaceCtx | null {
    const cam = this.acc.solve().camera;
    if (!cam.ok || cam.f == null || !cam.principalPoint) return null;
    return {
      principal: cam.principalPoint, f: cam.f, vps: this.vps(), imgSize: this.imgSize,
      // **무한원 축의 방향은 화면 방향 그대로다**(이론서 2.2) — 소실점이 없다고 못 올리던 자리.
      axisDirs: axisDirsOf(this.rules, cam.principalPoint, cam.f),
    };
  }

  /** 획 하나의 축 — 규칙이 이미 정해 둔 축에 붙인다. 추정이 없다. */
  axisOf(pts2d: Pt2[]): { axis: Axis; why: string } { return axisOfStroke(pts2d, this.rules); }

  /** 저장·복원용. **규칙 상태 그대로** 담는다(푼 결과가 아니다 — 열어서 이어 그릴 수 있어야 한다). */
  dumpRules(): RuleState { return cloneRuleState(this.rules); }
  loadRules(s: RuleState | null): void {
    this.rules = s ? cloneRuleState(s) : newRuleState(this.imgSize);
    // **옛 저장본의 지평선은 그대로 읽는다.** 없거나 유한하지 않으면 `null`이다 —
    // 기본값으로 채우지 않는다(지시 j). 그 문서는 «지평선을 아직 안 그은 것»이 된다.
    if (typeof this.rules.horizon !== "number" || !Number.isFinite(this.rules.horizon)) {
      this.rules.horizon = null;
    }
    this.apply();
  }

  reset(): void {
    this.rules = newRuleState(this.imgSize);
    this.acc.reset();
    this.apply();
  }
}

export { RULE_TOL };
