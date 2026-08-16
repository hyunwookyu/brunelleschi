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
  newRuleState, cloneRuleState, stepRule, vpsOf, axisDirsOf, defaultHorizon,
  horizonAdjustable, withHorizon, orderOfState, axisOfStroke, RULE_TOL,
  type RuleState, type RuleEvent, type RLine,
} from "../s3d/vpRules.js";
import type { Pt2 } from "../s3d/camera.js";
import type { Axis } from "../s3d/axis.js";
import type { PlaceCtx } from "../s3d/stroke.js";

/**
 * ⛔ **렌즈를 3D 정의 경로에서 뺐다**(2026-08-17 사람 지시 C-1).
 *
 * 지시문: **"건축가는 투시도를 그릴 때 렌즈를 고려하지 않는다. 소실점 위치가 곧 렌즈이므로
 * 이미 정하고 있다."** 1점 투시의 f는 이제 **그린 사각형의 대각선**에서 나온다
 * (거리점, 이론서 7.4 · `RuleState.distance`). 렌즈 슬라이더는 화면에서 사라졌다.
 *
 * 이 상수는 **옛 저장본을 여는 경로에만** 남는다(`Doc2.lensMm`). 값이 있어도
 * **f의 출처로 쓰지 않는다** — 그러면 "임의값을 넣지 않는다"(C-3)를 어긴다.
 * ⚠ D-L39를 뒤집은 것이다: 그 결정은 "1점의 f를 기본 렌즈로 채운다"였다.
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
  rules: RuleState = newRuleState([960, 672]);
  /** 확정됐는가(§1.2의 "카메라 확정"). 확정 뒤에는 획이 소실점을 바꾸지 않는다. */
  locked = false;
  /**
   * ⛔ **더 이상 f의 출처가 아니다**(C-1). 옛 저장본에서 읽어 두기만 한다 —
   * 값이 있어도 `apply()`가 안 쓴다. 1점의 f는 `rules.distance`(거리점)에서 온다.
   */
  lensMm: number | null = null;

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
    // ⚠ 옛 판은 **기본값일 때만** 따라갔다. 사용자가 끌 수 있게 되면서(D-L45) 그것으로는
    // 부족하다 — 끌어 둔 지평선이 창이 줄 때 화면 밖으로 나간다. 비례로 옮기면 기본값
    // (중앙 = H/2)도 **같은 식으로 중앙에 남으므로** 갈래가 하나로 준다(#17).
    //
    // ⚠⚠ **레이아웃 전에는 캔버스 높이가 1px일 수 있다**(첫 `fit()` 전). 그 상태의 y는 뜻이
    // 없으므로 비례로 늘리지 않고 **기본값으로 다시 잡는다** — 브라우저에서 실제로 걸렸다:
    // 높이 1에서 `setHorizon(200)`이 1로 잘리고, 그 1이 675로 늘어나 **화면 바닥에 붙었다**.
    if (horizonAdjustable(this.rules)) {
      this.rules = cloneRuleState(this.rules);
      this.rules.horizon = oldH > 2 ? (this.rules.horizon * s[1]) / oldH : defaultHorizon(s);
    }
    // ⚠⚠ **수심 유도값을 다시 내던 갈래를 뺐다**(2026-08-17 A-4). 그 갈래는 "창이 커지면
    // 주점 = 이미지 중심 전제가 움직이므로 유도값을 다시 낸다"였는데, **유도를 없앴으므로
    // 다시 낼 수단이 없다** — 남겨 두면 슬롯을 비우기만 하고 **수직 소실점이 조용히 사라진다**
    // (종단 확인이 실제로 잡았다: 창을 줄였다 되돌리면 3점이 2점이 되고 3D가 화면 밖으로 갔다).
    // 지금 `slots[2]`의 유한 소실점은 **사용자가 그은 선에서 나온 값**이므로 창 크기와 무관하다.
    this.apply();
  }

  /** 규칙 상태 → 누산기. **교체다**(쌓이면 안 된다). */
  apply(): void {
    const vps = vpsOf(this.rules);
    // **2점 투시에서 지평선은 주점 y다**(2026-08-17 A-4). 피치가 아니다:
    // 수직축이 화면 수직이면 피치는 정의상 0이고, 그때 지평선 y = 주점 y가 **강제된다**
    // (이론서 3.1 + 롤 0). 지평선을 화면 아래쪽에 두는 건축 투시는 **피치가 아니라
    // 주점이 내려간 것**(시프트 렌즈와 같은 자리)이다.
    //
    // ⚠ 옛 판은 이 자리를 안 세웠고 주점이 언제나 이미지 중심이었다 — 그래서 지평선을
    // 끌면 f² = −(V₁−P)·(V₂−P)에 `(h − c_y)²`가 얹혀 f가 **작아졌다**(화각이 넓어졌다).
    // 3점(수직 소실점이 유한)에서는 주점이 **수심**이므로 이 값이 안 쓰인다(`recoverCamera`).
    this.acc.add({ kind: "horizon", a: [0, this.rules.horizon], b: [1, this.rules.horizon] });

    for (const ax of [0, 1, 2] as AxisId[]) {
      this.acc.setLines(ax, []);                     // 선 제약은 쓰지 않는다 — 규칙이 점을 준다
      const v = vps[ax];
      if (v) this.acc.setPoint(ax, v);
    }
    // **1점 투시의 f는 거리점에서 온다**(C-2, 이론서 7.4). 2·3점에서는 소실점이 정한다(6.2·6.3).
    // ⚠ **렌즈 설정을 안 쓴다**(C-1). 없으면 **f가 미정이고 카메라가 안 선다** — 그것이 옳다:
    // 깊이가 안 정해진 상태에 **임의값을 넣지 않는다**(C-3).
    const nFinite = vps.filter(Boolean).length;
    this.acc.setLens(nFinite === 1 ? this.rules.distance : null);
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

  /**
   * **지평선을 끌 수 있는가**(D-L45). 확정 전이고 **유한 소실점이 아직 없을 때**만이다.
   * 화면이 이 값으로 손잡이를 낼지 정하고, `setHorizon`이 마지막 방어다.
   */
  canSetHorizon(): boolean { return !this.locked && horizonAdjustable(this.rules); }

  /**
   * **지평선을 옮긴다 = 카메라 피치를 준다**(이론서 3.1의 역방향).
   *
   * 사용자는 **그림의 지평선을 올리내리는 것**으로 인식하고 그동안 카메라가 돈다 —
   * 그것이 "3점 투시를 처음부터 그릴 수 있어야 한다"의 답이다(QUESTIONS g).
   * 못 옮기는 상태면 `false`를 내고 **아무것도 안 바꾼다**.
   */
  setHorizon(y: number): boolean {
    if (!this.canSetHorizon()) return false;
    const next = withHorizon(this.rules, y, this.imgSize);
    if (next === this.rules || next.horizon === this.rules.horizon) return false;
    this.rules = next;
    this.apply();
    return true;
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
    this.rules = s ? cloneRuleState(s) : newRuleState(this.imgSize);
    // **옛 저장본은 지평선이 `null`이거나 없다** — 기본값(피치 0 = 화면 중앙)으로 채운다.
    // 지평선은 이제 **처음부터 있는 것**이라 없는 상태가 존재하지 않는다.
    if (typeof this.rules.horizon !== "number" || !Number.isFinite(this.rules.horizon)) {
      this.rules.horizon = defaultHorizon(this.imgSize);
    }
    this.apply();
  }

  reset(): void {
    this.rules = newRuleState(this.imgSize);
    this.acc.reset();
    this.lensMm = null;
    this.locked = false;
    this.apply();
  }
}

export { RULE_TOL };
