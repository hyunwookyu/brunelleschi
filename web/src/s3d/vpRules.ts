// **규칙 기반 소실점 확정** — 추정 경로를 전면 교체한다(2026-08-16, 사람 지시).
//
// 옛 경로는 **검출 초안 → 사용자가 가이드를 끌어 확정**이었다. 그것이 안 선 이유는
// 정확도가 아니라 **입구**였다: 검출이 초안을 못 내면(획이 모자라거나 클러스터가 안 서면)
// 가이드가 안 생기고, 가이드가 없으면 카메라가 없고, 카메라가 없으면 **무엇을 그려도 대기**다.
//
// 여기서는 **추정하지 않는다.** 그은 선이 곧 제약이다.
//
// ```
// a. 화면 가로·세로 선  → 그 축 자체다. 소실점이 무한원이고 계산할 것이 없다(이론서 2.2, c=0)
// b. 깊이선 **하나**    → 그 선과 **지평선**의 교점이 소실점이다. 1점 투시 확정
// c. 다른 방향 깊이선   → 같은 지평선 위에서 두 번째 소실점. 2점 투시
// d. 세 번째(수직)      → 수심 조건으로 **유도한다**(이론서 6.3). 그리는 것이 아니다
// ```
//
// ⚠⚠ **지평선은 처음부터 있다**(2026-08-16 2차 지시). 옛 판은 "첫 소실점이 지평선을
// 정의한다"였고 그래서 **첫 소실점만 두 선의 교점**이었다 — 그 둘이 나란해지면 교점이 날아가고,
// 그것이 번갈아 긋기에서 축 오차 32.57°가 나온 자리로 의심됐다(`rule_camera.json`).
// 지금은 **지평선이 먼저 있고 모든 수평 소실점이 그 위에 놓인다.** 교점 계산에서 한 쪽이
// **오차 없이 정확**하므로 그 실패 모드가 통째로 사라진다. 옵션으로 끄지 않는다.
// 지평선 높이는 **카메라 피치가 정하고** 사용자가 직접 조절하지 않는다(궤도로 바뀐다).
//
// **유일한 판단은 그은 선이 깊이인지 화면 가로세로인지다.** 임계 하나로 갈리고,
// 그 사이(애매)면 **사용자에게 묻는다**(A-3: 애매하면 놓지 않는다).
//
// ⚠ **d는 측정이 아니라 유도다.** 두 수평 소실점과 주점(= 이미지 중심 가정, 이론서 16.2)이
// 주어지면 수직 소실점은 수심 관계로 **일의적으로 정해진다** — 그러므로 그 값은 새 정보가
// 아니라 **그 가정의 귀결**이다(PITFALLS #5 자기참조 유형 3 · #40). `source`에 그렇게 적고
// 화면에도 그렇게 낸다. 카메라의 `fSource`는 여전히 두 소실점(6.2)이다.
//
// ⚠ **소실점은 확정 후 잠긴다**(CLAUDE.md §1). 뒤에 오는 획은 소실점을 갱신하지 않는다 —
// 그것이 "추정"으로 되돌아가는 문이다. 뒤에 온 깊이선은 **지지선**으로 세기만 한다.
import { lineIntersect, isFiniteVp, type Pt2 } from "./camera.js";
import { representative, vpMisfit, AXIS_TOL, type Axis, type Rep } from "./axis.js";
import { vpOnHorizon, vpVerticalFromOrthocenter, HORIZON_TOL } from "./horizon.js";

/** 규칙의 임계. **`test/constants.ts`에 등록한다**(D-C4) — 빠지면 STALE이 안 잡힌다. */
export const RULE_TOL = {
  /**
   * 화면 수평·수직에서 이 각(도) 안이면 **그 축 자체**로 본다(무한원 소실점).
   *
   * 근거는 `AXIS_TOL.screen_parallel`(0.05 = 길이 대비 편차)과 같은 자리다 —
   * `asin(0.05) = 2.87°`. 손으로 그은 수평선의 기울기를 담아야 하므로 조금 넉넉히 4°로 둔다.
   * ⚠ **이 값이 결론을 정하는 자리가 아니다**: 넘으면 깊이가 아니라 **애매**로 가고,
   * 애매는 묻는다. 즉 이 임계가 틀려도 **조용히 틀린 배치가 되지 않는다**.
   */
  screen_axis_deg: 4,
  /**
   * 이 각(도) 밖이면 **깊이선**으로 본다. `screen_axis_deg`와 이 값 사이는 **애매**이고
   * 사용자에게 묻는다. 두 임계를 벌려 두는 것이 요점이다 — 하나로 두면 경계에서
   * 조용히 한쪽으로 떨어진다(A-3).
   */
  depth_min_deg: 8,
  /**
   * 두 번째 **수평** 소실점을 만들려는 깊이선이 화면 수직에 이보다 가까우면(도)
   * **묻는다** — 두 번째 수평축인지 수직축인지 선만 보고는 갈리지 않기 때문이다.
   *
   * ⚠ 이 값은 **묻는 방아쇠**이지 판정이 아니다. 넉넉히 잡아 헛되이 묻는 쪽이
   * 조용히 틀리는 것보다 낫다(A-3). 3점 구도에서만 실제로 발화한다 —
   * 2점·1점에서는 수직축이 화면 수직으로 이미 선언돼 있다.
   */
  vertical_ask_deg: 45,
} as const;
export type RuleCfg = Partial<typeof RULE_TOL>;

export interface RLine { a: Pt2; b: Pt2 }

/** 축 슬롯 하나. 0·1은 수평(지평선 위), 2는 수직 — `PlaceCtx.vps`의 관례와 같다. */
export type Slot =
  /** 화면 평행 축 — 소실점이 무한원이다(c=0). `dir`이 화면에서의 방향이다. */
  | { kind: "screen"; dir: "h" | "v"; support: number }
  /** 유한 소실점. `source`가 **어떻게 정해졌는지**이고 화면에 그대로 낸다. */
  | { kind: "vp"; at: Pt2; source: VpSource; support: number };

export type VpSource =
  /** 깊이선 두 개의 교점(규칙 b). */
  | "two_lines"
  /** 깊이선 하나 × 지평선(규칙 c). */
  | "horizon_x_line"
  /** 수심 조건 유도(규칙 d, 이론서 6.3). **측정이 아니라 가정의 귀결이다.** */
  | "orthocenter";

export interface RuleState {
  slots: [Slot | null, Slot | null, Slot | null];
  /**
   * 지평선 높이(화면 y). **처음부터 있다** — 소실점이 정하는 것이 아니라 **카메라 피치**가
   * 정한다(이론서 3.1 + 롤 0). 초기값은 화면 중앙(피치 0)이고 궤도로만 바뀐다.
   * ⚠ `null`은 **옛 저장본**에서만 온다 — `loadRules`가 기본값으로 채운다.
   */
  horizon: number;
  /** 사용자가 "수직축"이라 답한 획들의 대표선 — 유도된 V₃의 지지선으로 센다. */
  verticalLines: RLine[];
}

/** **피치 0의 지평선** — 화면 중앙. 1점 투시에서 소실점이 주점이라는 것과 같은 자리다(5.3). */
export const defaultHorizon = (imgSize: [number, number]): number => imgSize[1] / 2;

export function newRuleState(imgSize: [number, number] = [960, 672]): RuleState {
  return { slots: [null, null, null], horizon: defaultHorizon(imgSize), verticalLines: [] };
}

export function cloneRuleState(s: RuleState): RuleState {
  return {
    // ⚠ **깊은 사본이어야 한다.** `{...x}`만 하면 `at` 배열이 **공유되고**, 그러면
    // 되돌리기 스냅샷이 나중의 편집에 딸려 움직인다(`promoteDiff.test.ts`가 잡았다).
    slots: s.slots.map(x =>
      (x ? (x.kind === "vp" ? { ...x, at: [x.at[0], x.at[1]] as Pt2 } : { ...x }) : null),
    ) as RuleState["slots"],
    horizon: s.horizon,
    verticalLines: s.verticalLines.map(l => ({ a: [...l.a] as Pt2, b: [...l.b] as Pt2 })),
  };
}

// ---------------------------------------------------------------- 한 줄 판정 (유일한 판단)

export type LineKind = "screen_h" | "screen_v" | "depth" | "ambiguous" | "degenerate";

export interface LineVerdict {
  kind: LineKind;
  /** 화면 **수평**과의 각(도). 0이 완전 수평. */
  toH: number;
  /** 화면 **수직**과의 각(도). 0이 완전 수직. */
  toV: number;
}

/**
 * **그은 선이 깊이인가 화면 가로세로인가** — 이 도구가 하는 유일한 판단이다.
 *
 * 임계 하나로 갈리고, 그 언저리는 **애매**로 두어 사용자에게 묻는다.
 * 추정하지 않는다: 클러스터도, 산포도, 지지 가중합도 여기에 없다.
 */
export function classifyLine(a: Pt2, b: Pt2, cfg: RuleCfg = {}): LineVerdict {
  const c = { ...RULE_TOL, ...cfg };
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return { kind: "degenerate", toH: 0, toV: 90 };
  const toH = (Math.asin(Math.min(1, Math.abs(dy) / L)) * 180) / Math.PI;
  const toV = 90 - toH;
  const near = Math.min(toH, toV);
  if (near <= c.screen_axis_deg) return { kind: toH <= toV ? "screen_h" : "screen_v", toH, toV };
  if (near >= c.depth_min_deg) return { kind: "depth", toH, toV };
  return { kind: "ambiguous", toH, toV };
}

/** 두 선의 각차(도, 0~90). 교점의 조건수를 정한다. */
export function sepDeg(p: RLine, q: RLine): number {
  const a = Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
  const b = Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]);
  let d = Math.abs(((a - b) * 180) / Math.PI) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

// ---------------------------------------------------------------- 상태 전이

export type RuleEvent =
  /** 축이 선언됐다(무한원). */
  | { type: "screen_axis"; axis: 0 | 1 | 2; dir: "h" | "v" }
  /** 소실점이 확정됐다. */
  | { type: "vp_fixed"; axis: 0 | 1 | 2; at: Pt2; source: VpSource; horizonSet: boolean }
  /** 두 번째 수평 소실점이 **화면 가로축 선언을 대체했다** — 차수 승격이다. */
  | { type: "promoted"; axis: 0 | 1 | 2; at: Pt2; source: VpSource }
  /** 수직 소실점이 수심 조건으로 **유도됐다**(측정이 아니다). */
  | { type: "derived_vertical"; at: Pt2 }
  /** 첫 깊이선이 쌓였다 — 하나 더 그으면 소실점이다. */
  | { type: "waiting"; have: number }
  /** 이미 있는 축을 향한 선이다. 소실점은 **잠겨 있다** — 지지 수만 는다. */
  | { type: "support"; axis: 0 | 1 | 2 }
  /** 사용자에게 묻는다. */
  | { type: "ask"; question: "screen_or_depth" | "second_horizontal_or_vertical"; verdict: LineVerdict }
  /** 쓸 수 없다. `why`가 사유다. */
  | { type: "rejected"; why: string };

export interface StepResult { state: RuleState; event: RuleEvent }

/** 자유로운 수평 슬롯 — 유한 소실점이 들어갈 자리. `screen`은 대체 대상이다(차수 승격). */
function horizontalTarget(st: RuleState): { index: 0 | 1; replaces: boolean } | null {
  for (const i of [0, 1] as const) if (!st.slots[i]) return { index: i, replaces: false };
  for (const i of [0, 1] as const) {
    if (st.slots[i]!.kind === "screen") return { index: i, replaces: true };
  }
  return null;
}

const finiteHorizontals = (st: RuleState): { i: 0 | 1; at: Pt2 }[] =>
  ([0, 1] as const).flatMap(i => {
    const s = st.slots[i];
    return s && s.kind === "vp" ? [{ i, at: s.at }] : [];
  });

/**
 * **획 하나를 규칙에 넣는다.** 상태는 **바꾸지 않고 새로 낸다**(되돌리기가 스냅샷이므로).
 *
 * `forced`는 사용자가 애매에 답한 것이다 — 그때만 판정을 건너뛴다.
 */
export function stepRule(
  st0: RuleState, line: RLine, imgSize: [number, number],
  forced?: "screen" | "depth" | "vertical", cfg: RuleCfg = {},
): StepResult {
  const c = { ...RULE_TOL, ...cfg };
  const st = cloneRuleState(st0);
  const v = classifyLine(line.a, line.b, cfg);
  if (v.kind === "degenerate") return { state: st0, event: { type: "rejected", why: "선이 한 점이다" } };

  // 사용자가 "수직축"이라 답했다 — 유도될 V₃의 지지선으로만 센다(선에서 소실점을 만들지 않는다)
  if (forced === "vertical") {
    st.verticalLines.push(line);
    const s2 = st.slots[2];
    if (s2 && s2.kind === "vp") s2.support += 1;
    return { state: st, event: { type: "support", axis: 2 } };
  }

  let kind: LineKind = v.kind;
  if (forced === "screen") kind = v.toH <= v.toV ? "screen_h" : "screen_v";
  else if (forced === "depth") kind = "depth";
  else if (kind === "ambiguous") {
    return { state: st0, event: { type: "ask", question: "screen_or_depth", verdict: v } };
  }

  // ---- a. 화면 가로세로 선은 축 자체다 (무한원, 이론서 2.2)
  if (kind === "screen_h") {
    for (const i of [0, 1] as const) {
      const s = st.slots[i];
      if (s && s.kind === "screen" && s.dir === "h") { s.support += 1; return { state: st, event: { type: "support", axis: i } }; }
    }
    const free = ([0, 1] as const).find(i => !st.slots[i]);
    if (free === undefined) {
      return { state: st0, event: { type: "rejected",
        why: "수평 축이 이미 둘 다 정해졌습니다 — 이 선은 축이 아니라 그 축들 중 하나의 지지선입니다" } };
    }
    st.slots[free] = { kind: "screen", dir: "h", support: 1 };
    return { state: st, event: { type: "screen_axis", axis: free, dir: "h" } };
  }
  if (kind === "screen_v") {
    const s2 = st.slots[2];
    if (s2 && s2.kind === "screen") { s2.support += 1; return { state: st, event: { type: "support", axis: 2 } }; }
    if (s2 && s2.kind === "vp") {
      return { state: st0, event: { type: "rejected",
        why: "수직축은 이미 유한 소실점입니다(3점 투시) — 화면 수직선은 그 축이 아닙니다" } };
    }
    st.slots[2] = { kind: "screen", dir: "v", support: 1 };
    return { state: st, event: { type: "screen_axis", axis: 2, dir: "v" } };
  }

  // ---- b·c. 깊이선
  const target = horizontalTarget(st);

  // b·c. **지평선은 언제나 있다** — 깊이선 하나면 소실점이 정해진다.
  // 교점의 한 쪽(지평선)이 **오차 없이 정확**하므로 "두 선이 나란해져 교점이 날아가는" 실패가 없다.
  {
    const rep: Rep = { a: line.a, b: line.b,
                       len: Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]), bend: 0 };
    const p = vpOnHorizon(rep, st.horizon);
    if (!p) {
      return { state: st0, event: { type: "rejected",
        why: `지평선과 ${HORIZON_TOL.min_slope_deg}° 안이라 교점이 발산합니다` } };
    }
    // 이미 있는 소실점을 향한 선인가 — **기하가 가른다**(추정이 아니다).
    //
    // ⚠ **지평선 위의 거리로 재면 안 된다.** 초판이 그랬고 실측에서 걸렸다: 소실점이 멀수록
    // 같은 각도 오차가 큰 x 차이로 나오므로, 첫 축을 향해 그은 지지선이 **새 소실점으로
    // 오인된다**(그리고 진짜 두 번째 축의 선은 "슬롯이 찼다"고 거절된다 — 조용히 틀린다).
    // 각으로 재면 그 의존이 사라진다 — `axis.ts`의 부적합도(수직거리 ÷ 길이)를 그대로 쓴다
    // (#17: 새 임계를 만들지 않는다. #24: 단위를 고치는 것이지 임계를 무르는 것이 아니다).
    for (const { i, at } of finiteHorizontals(st)) {
      if (vpMisfit(rep, at) <= AXIS_TOL.vp_dist_ratio) {
        (st.slots[i] as { support: number }).support += 1;
        return { state: st, event: { type: "support", axis: i } };
      }
    }
    if (!target) {
      return { state: st0, event: { type: "rejected",
        why: "수평 소실점이 이미 둘입니다 — 소실점은 확정 후 잠깁니다(CLAUDE.md §1)" } };
    }
    // **두 번째 수평축인가 수직축인가** — 선만 보고 안 갈리면 묻는다
    if (forced !== "depth" && v.toV < c.vertical_ask_deg && !st.slots[2]) {
      return { state: st0, event: { type: "ask", question: "second_horizontal_or_vertical", verdict: v } };
    }
    if (!isFiniteVp(p, imgSize)) {
      return { state: st0, event: { type: "rejected", why: "교점이 사실상 무한원입니다(화면 평행)" } };
    }
    st.slots[target.index] = { kind: "vp", at: p, source: "horizon_x_line", support: 1 };
    const st2 = deriveVertical(st, imgSize);
    return { state: st2,
             event: target.replaces
               ? { type: "promoted", axis: target.index, at: p, source: "horizon_x_line" }
               : { type: "vp_fixed", axis: target.index, at: p, source: "horizon_x_line", horizonSet: false } };
  }

}

/**
 * **수직 소실점을 수심 조건으로 유도한다**(규칙 d, 이론서 6.3).
 *
 * ⚠ **새 정보가 아니다.** 두 수평 소실점과 주점(이미지 중심 가정)이 있으면 수심 관계가
 * V₃를 일의적으로 정한다 — 즉 이 값은 **그 가정의 귀결**이고, 이것으로 f를 다시 내면
 * 2점 해와 **항등으로 같은 값**이 나온다(이론서 6.4). 그래서
 *   ① `source`를 `"orthocenter"`로 적어 화면이 갈라 보이게 하고,
 *   ② **카메라의 f는 여전히 두 소실점(6.2)에서 낸다** — `CamState`가 유한 소실점을
 *      `recoverCamera`에 몇 개 넣는지로 그것을 지킨다.
 * (PITFALLS #5 자기참조 유형 3 · #37 이론서를 먼저 본다.)
 *
 * **화면 수직축이 선언돼 있으면 유도하지 않는다** — 그때 수직축은 무한원이 옳다(2점 투시).
 */
export function deriveVertical(st0: RuleState, imgSize: [number, number]): RuleState {
  const st = cloneRuleState(st0);
  if (st.slots[2]) return st;                       // 선언됐거나 이미 유도됐다
  const h = finiteHorizontals(st);
  if (h.length < 2 || st.horizon === null) return st;
  const principal: Pt2 = [imgSize[0] / 2, imgSize[1] / 2];   // 이론서 16.2 가정
  const diag = Math.hypot(imgSize[0], imgSize[1]);
  const v3 = vpVerticalFromOrthocenter(h[0].at, h[1].at, principal, diag);
  if (v3 && isFiniteVp(v3, imgSize)) {
    st.slots[2] = { kind: "vp", at: v3, source: "orthocenter", support: st.verticalLines.length };
  }
  return st;
}

// ---------------------------------------------------------------- 상태 → 카메라 입력

/** 유한 소실점만. 무한원·미정은 `null`이다 — `recoverCamera`가 개수로 갈린다(이론서 2.3). */
export function vpsOf(st: RuleState): (Pt2 | null)[] {
  return st.slots.map(s => (s && s.kind === "vp" ? s.at : null));
}

/**
 * 축 방향(카메라 좌표계). 무한원 축은 **화면 방향 그대로**다(z = 0, 이론서 2.2).
 * 이것이 있으면 1점 투시에서 화면 가로·세로 획이 **정확한 방향으로** 올라간다 —
 * 소실점이 없다고 못 올리던 자리다.
 */
export function axisDirsOf(st: RuleState, principal: Pt2, f: number): ([number, number, number] | null)[] {
  return st.slots.map(s => {
    if (!s) return null;
    if (s.kind === "screen") return s.dir === "h" ? [1, 0, 0] : [0, 1, 0];
    const d: [number, number, number] = [s.at[0] - principal[0], s.at[1] - principal[1], f];
    const L = Math.hypot(d[0], d[1], d[2]);
    return L < 1e-12 ? null : [d[0] / L, d[1] / L, d[2] / L];
  }) as ([number, number, number] | null)[];
}

/** 정해진 축 수(무한원 포함). 화면 표시가 "무엇이 부족한지"를 이것으로 낸다. */
export const settledAxes = (st: RuleState): number => st.slots.filter(Boolean).length;

/** 유한 소실점 수 = 투시 차수(1·2·3점). 이론서 2.3 — 분기가 아니라 개수다. */
export const orderOfState = (st: RuleState): number => vpsOf(st).filter(Boolean).length;

// ---------------------------------------------------------------- 획 → 축

/**
 * **획 하나의 축**. 규칙이 이미 축을 다 정해 놓았으므로 여기서 추정할 것이 없다 —
 * 화면 축이면 각으로, 깊이면 **어느 소실점을 향하는가**로 갈린다.
 *
 * 깊이선의 배정은 `axis.ts`의 부적합도(점-직선 거리 ÷ 길이)를 그대로 쓴다(#17: 임계를
 * 새로 만들지 않는다). 1등이 2등보다 `ambiguity_margin`만큼 낫지 않으면 **미분류**다.
 */
export function axisOfStroke(
  pts2d: Pt2[], st: RuleState, cfg: RuleCfg = {},
): { axis: Axis; why: string } {
  const rep = representative(pts2d);
  if (!rep) return { axis: "free", why: "대표 직선이 없다(너무 짧다)" };
  const v = classifyLine(rep.a, rep.b, cfg);
  if (v.kind === "screen_h" || v.kind === "screen_v") {
    const want: "h" | "v" = v.kind === "screen_h" ? "h" : "v";
    for (const i of [0, 1, 2] as const) {
      const s = st.slots[i];
      if (s && s.kind === "screen" && s.dir === want) return { axis: i, why: `화면 ${want === "h" ? "가로" : "세로"}축` };
    }
    // 그 방향의 무한원 축이 선언돼 있지 않다 — 유한 소실점 쪽으로 떨어질 수 있다(아래로 간다)
  }
  const cand: { i: 0 | 1 | 2; m: number }[] = [];
  for (const i of [0, 1, 2] as const) {
    const s = st.slots[i];
    if (s && s.kind === "vp") cand.push({ i, m: vpMisfit(rep, s.at) });
  }
  cand.sort((a, b) => a.m - b.m);
  if (!cand.length) return { axis: "free", why: "향할 소실점이 없다" };
  const best = cand[0];
  if (best.m > AXIS_TOL.vp_dist_ratio) return { axis: "free", why: `가장 가까운 축과도 ${best.m.toFixed(3)} 어긋난다` };
  const second = cand[1];
  if (second && second.m < best.m * AXIS_TOL.ambiguity_margin && second.m - best.m < AXIS_TOL.ambiguity_floor) {
    return { axis: "free", why: "두 축 중 어느 것인지 갈리지 않는다" };
  }
  return { axis: best.i, why: `축${best.i + 1}(부적합도 ${best.m.toFixed(3)})` };
}
