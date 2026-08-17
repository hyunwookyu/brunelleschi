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
// 지평선 높이는 **카메라 피치다**(이론서 3.1). ⚠ **2026-08-16 3차 지시로 사용자가 끈다**(D-L45) —
// 옛 판은 "궤도로만 바뀐다"였고 그 귀결이 **초기 스케치가 1점·2점뿐**인 것이었다(피치 0 →
// 수심 유도 `null`). 끄는 것은 **피치를 주는 것**이고 새 자유도가 아니다. **소실점이 서면 잠긴다**
// (`horizonAdjustable`) — 그 뒤에 옮기면 소실점이 자기 지지선에서 떨어진다(D-L32가 그 자리다).
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
import { lineIntersect, lsIntersection, isFiniteVp, type Pt2 } from "./camera.js";
import { representative, vpMisfit, AXIS_TOL, type Axis, type Rep } from "./axis.js";
// **끝점 병합 반경**(4차 지시 3) — 교점이 어느 선의 끝점 자리면 그것은 모서리 이음이지
// 소실점이 아니다. 판정 반경은 2D 오스냅의 병합과 같은 값·같은 프레임이다(#17, D-L57).
import { SNAP_TOL } from "./snap.js";
// ⚠ `vpVerticalFromOrthocenter`는 **더 이상 안 부른다**(2026-08-17 A-4) — 그 유도가
// 지평선 높이만으로 3점을 만들던 자리다. 함수는 `horizon.ts`에 남는다(D-L32·D-L43의 판정
// 근거를 `horizon.test.ts`가 계속 재현한다 — CLAUDE.md의 폐기 코드 규칙).
import { vpOnHorizon, HORIZON_TOL } from "./horizon.js";

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
  /**
   * **소실점에 기여하는 획의 최소 길이**(화면 대각 대비, 2026-08-17 사람 지시 A-5).
   *
   * 실수로 그은 작은 선이 두 번째 소실점을 정의해 버리는 것을 막는다. 그 아래 획은
   * **규칙에 안 들어간다** — 획 자체는 문서에 남고 카메라만 안 건드린다.
   *
   * ⚠⚠ **초판은 절대 px(40)였고 리뷰어가 둘을 짚었다**:
   *   ① "대체할 기존 값이 없다"가 **틀렸다** — `AXIS_TOL.min_len_ratio`(0.02)와
   *      `VP_TOL.min_len_ratio`(0.02)가 이미 있다.
   *   ② 이 저장소의 임계는 전부 **비**인데 그것만 절대 px였다. 캔버스 크기 굳음이 세 번(AS-C7·#22),
   *      dpr 규약 버그가 한 번(#21) 걸린 곳이고 **이번 지시의 출처가 아이패드**다.
   * 그래서 **비로 바꾸고 기존 값의 배수로 적는다**: `AXIS_TOL.min_len_ratio`의 **2배**다.
   *
   * **왜 그 값을 그대로 안 쓰는가**: 그것은 "그 획에서 **방향을 낼 수 있는가**"의 하한이고
   * (`representative`가 그 아래를 버린다), 여기는 "그 획이 **소실점을 정할 만큼 의도적인가**"다.
   * 둘은 다른 물음이고 후자가 더 엄해야 한다 — 방향은 나오지만 실수인 획이 그 사이에 있다.
   *
   * ⚠ **배수 2는 잠정이고 스윕을 안 돌렸다**(#12 동작점 하나). 실획 표본이 가르는 자리이고
   * `real_ink.test.ts`가 그것을 낸다(K — "최소 길이 임계 — 실수 획과 의도 획이 갈리는 지점").
   * ⚠ **이 임계가 몇 획을 걸렀는지 세는 곳이 아직 없다**(#38 덮는 대상 미상) — `DEFERRED.md`.
   */
  min_vp_len_ratio: 0.04,
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
  /** ⚠ **2026-08-17 A-4로 더 이상 만들지 않는다** — 옛 저장본을 열기 위해 남긴다. */
  | "orthocenter"
  /**
   * **사용자가 "수직축"이라 답한 기울어진 선 × (x = 이미지 중심)**(2026-08-17 A-4).
   * 3점 투시의 유일한 입구이고 **측정**이다(옛 `orthocenter`는 가정의 귀결이었다).
   */
  | "tilted_vertical";

export interface RuleState {
  slots: [Slot | null, Slot | null, Slot | null];
  /**
   * 지평선 높이(화면 y). ⚠⚠ **뜻이 바뀌었다**(2026-08-17 4차 지시 3 — 2차의 "지평선이
   * 먼저 있다"를 되돌린다): **첫 유한 소실점이 서기 전에는 소실점 확정에 안 쓰인다.**
   * 첫 소실점은 **그린 두 깊이선의 실제 교점**이고(`two_lines`), 그 순간 이 값이 그 y로
   * 맞춰진다(롤 0 — 소실점이 지평선을 정한다. 순서만 바뀌고 롤 0은 유지된다, 지시 4-c).
   * 두 번째 수평 소실점부터는 종전대로 이 지평선 위에 놓인다(지시 4-d).
   * 초기값은 화면 중앙이고 소실점 전까지 끌 수 있다(D-L45) — 그 조작은 이제 소실점을
   * 만들지 않는다. ⚠ `null`은 **옛 저장본**에서만 온다 — `loadRules`가 기본값으로 채운다.
   */
  horizon: number;
  /**
   * **아직 소실점을 못 만든 깊이선들**(4차 지시 3). 첫 유한 수평 소실점이 없는 동안
   * 깊이선이 여기 쌓이고, 새 깊이선과 **유한한 교점**을 내는 짝이 생기면 그 교점이
   * 첫 소실점이다(짝이 여럿이면 각차가 가장 큰 — 조건수가 가장 좋은 — 짝).
   * 확정되면 비운다. 옛 저장본에는 없다 — 기본 `[]`.
   */
  depthLines: RLine[];
  /** 사용자가 "수직축"이라 답한 획들의 대표선 — 유도된 V₃의 지지선으로 센다. */
  verticalLines: RLine[];
  // ⛔ **`distance`(거리점 f)를 지웠다**(2026-08-17 사람 지시 2). 대각선은 거리점인지
  // 2점 승격인지 기하로 구분 불가다. 1점의 f는 **임의값**이다 — 깊이 배율일 뿐이고
  // 형태는 정확하다(camera.ts `frontalWorld`의 게이지). 옛 저장본의 `distance`는 무시된다.
}

/** **피치 0의 지평선** — 화면 중앙. 1점 투시에서 소실점이 주점이라는 것과 같은 자리다(5.3). */
export const defaultHorizon = (imgSize: [number, number]): number => imgSize[1] / 2;

/**
 * **지평선을 아직 옮길 수 있는가**(D-L45).
 *
 * 유한 수평 소실점이 **하나라도 서면 잠긴다.** 그 소실점은 지평선 **위에서** 정해진 것이라
 * (규칙 c: 깊이선 × 지평선), 지평선만 옮기면 소실점이 자기 지지선에서 떨어진다 —
 * **D-L32가 실패한 자리가 정확히 그것이다**(사후 사영: 배치 2049 → 792).
 * 그러므로 조작은 **소실점이 서기 전**에만 열린다. 그 뒤로는 궤도가 지평선을 바꾼다.
 */
export const horizonAdjustable = (st: RuleState): boolean =>
  !st.slots.some(s => s != null && s.kind === "vp");

/**
 * **지평선을 옮긴 새 상태**(사람이 끈다 = 카메라 피치를 준다, 이론서 3.1의 역방향).
 *
 * 못 옮기는 상태면 **입력을 그대로 낸다** — 조용히 옮기지 않는다(A-3). 부르는 쪽이
 * `horizonAdjustable`로 먼저 갈라 화면에 표시하고, 여기는 마지막 방어다.
 *
 * 화면 밖으로는 안 나간다 — 끄는 손잡이가 화면에 있어야 하기 때문이다.
 * **새 임계를 만들지 않는다**(#17): 경계는 캔버스 자체다.
 */
export function withHorizon(st0: RuleState, y: number, imgSize: [number, number]): RuleState {
  if (!horizonAdjustable(st0) || !Number.isFinite(y)) return st0;
  const st = cloneRuleState(st0);
  st.horizon = Math.min(imgSize[1], Math.max(0, y));
  return st;
}

/**
 * **수직축은 처음부터 화면 수직이다**(2026-08-17 사람 지시 A-2·A-4).
 *
 * 옛 판은 슬롯 셋이 전부 `null`이었고, 수직축은 ① 사용자가 화면 세로선을 그어 선언하거나
 * ② 수평 소실점 둘이 서면 **수심으로 유도**되어 채워졌다. 둘 다 틀렸다:
 *
 *   ① **화면에 평행한 방향은 카메라와 무관하다**(이론서 2.2, c=0). 롤이 0이므로 화면 수직은
 *      **어떤 카메라를 나중에 세우든** 수직축이다 — 추정할 것이 없는데 선언을 기다렸다.
 *      그래서 **첫 획부터 세로선이 안 그어졌다**(A-1: "위아래 축으로 스냅이 안 걸린다").
 *   ② 유도는 **피치 판정**이다. 지평선을 중앙에서 떼면 수심 유도가 값을 내고 그것이
 *      **3점 투시**다 — 사용자는 2점을 그리고 있는데 도구가 "내려다보는 뷰"라고 정해 버렸다
 *      (A-4). 2점 투시에서 피치 판정은 **필요 없다**: 수직축이 화면 수직이고
 *      내려다본다/올려다본다는 **3점의 영역**이다.
 *
 * 그러므로 초기 상태의 슬롯 2는 **화면 수직**이고, 3점은 사용자가 **기울어진 수직선을
 * 수직축이라고 답할 때만** 선다(`wantsTiltedVertical`). 지평선 끌기(D-L45)는 남지만
 * 그 뜻이 바뀐다 — **2점에서는 주점 y**이고(피치 0에서 지평선 = 주점 y가 강제된다)
 * 피치를 주는 것이 아니다.
 */
const screenVerticalSlot = (): Slot => ({ kind: "screen", dir: "v", support: 0 });

export function newRuleState(imgSize: [number, number] = [960, 672]): RuleState {
  return { slots: [null, null, screenVerticalSlot()],
           horizon: defaultHorizon(imgSize), depthLines: [], verticalLines: [] };
}

export function cloneRuleState(s: RuleState): RuleState {
  return {
    // ⚠ **깊은 사본이어야 한다.** `{...x}`만 하면 `at` 배열이 **공유되고**, 그러면
    // 되돌리기 스냅샷이 나중의 편집에 딸려 움직인다(`promoteDiff.test.ts`가 잡았다).
    slots: s.slots.map(x =>
      (x ? (x.kind === "vp" ? { ...x, at: [x.at[0], x.at[1]] as Pt2 } : { ...x }) : null),
    ) as RuleState["slots"],
    horizon: s.horizon,
    // 옛 저장본에는 없다(4차 지시 3) — 기본 `[]`
    depthLines: (s.depthLines ?? []).map(l => ({ a: [...l.a] as Pt2, b: [...l.b] as Pt2 })),
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
  // ⚠ **`promoted`(수평 축의 1점 → 2점 승격)를 뺐다**(2026-08-17 B). 화면 가로선을 그은 것은
  // **1점 투시를 선언한 것**이고 그것을 되돌리지 않는다 — 잘못 그었으면 처음부터 다시 그린다.
  // 남는 차수 승격은 **2점 → 3점**(`derived_vertical`) 하나다.
  /** 수직 소실점이 수심 조건으로 **유도됐다**(측정이 아니다). */
  | { type: "derived_vertical"; at: Pt2 }
  /** 첫 깊이선이 쌓였다 — 하나 더 그으면 소실점이다. */
  | { type: "waiting"; have: number }
  /** 이미 있는 축을 향한 선이다. 소실점은 **잠겨 있다** — 지지 수만 는다. */
  | { type: "support"; axis: 0 | 1 | 2 }
  // ⛔ `distance_point` 사건을 지웠다(2026-08-17 지시 2) — 거리점 경로 전체가 폐기됐다
  /** 사용자에게 묻는다. */
  | { type: "ask"; question: "screen_or_depth" | "second_horizontal_or_vertical"; verdict: LineVerdict }
  /** 쓸 수 없다. `why`가 사유다. */
  | { type: "rejected"; why: string };

export interface StepResult { state: RuleState; event: RuleEvent }

// ---------------------------------------------------------------- 상태 = 계산 (2026-08-17 지시 1)

/**
 * **상태는 넷뿐이고 저장하지 않는다** — `order = f(소실점 집합, 가로선 유무)`.
 * 표시도 판정도 이 함수를 부른다. **어긋날 자리가 없다**(같은 사실을 두 곳이 알면 어긋난다).
 *
 * ```
 * 0 (NONE)  축 부족. 화면 가로·세로만 스냅. 3D 안 섬 — 수평 소실점 0~1개, 가로선 없음
 * 1 (P1)    가로선이 그어졌다 → 1점 확정. 가로·세로 무한원 + 깊이 소실점 하나.
 *           f는 깊이 배율일 뿐이므로 **임의값**으로 두고 3D를 세운다(전역 스케일과 같은 처리)
 * 2 (P2)    수평 소실점 둘 → f² = |PV₁|·|PV₂| (이론서 6.2)
 * 3 (P3)    소실점 셋 → 주점 = 수심, f (6.3)
 * ```
 *
 * 전이: NONE→P1(가로선) · NONE→P2(깊이선 둘이 서로 다른 소실점으로) · P2→P3(기울어진 수직선).
 * **P1에서는 되돌릴 수 없다** — 가로선이 있으면 1점 확정이고 이후 깊이선은 기존 소실점을
 * 향해야 한다. **후보 개념이 없다. 확정이거나 아니거나다.**
 *
 * 근거: **가로축이 화면에 평행하다는 것이 1점 투시의 정의다**(이론서 2.3 — 분기가 아니라
 * 무한원으로 간 축의 개수). 화면 세로선은 아무것도 안 정한다 — 수직축은 1·2점 모두 화면 수직이다.
 */
export type POrder = 0 | 1 | 2 | 3;

export function perspectiveOrder(st: RuleState): POrder {
  const hasH = ([0, 1] as const).some(i => {
    const s = st.slots[i];
    return s != null && s.kind === "screen" && s.dir === "h";
  });
  if (hasH) return 1;
  const nH = ([0, 1] as const).filter(i => st.slots[i]?.kind === "vp").length;
  if (nH >= 2) return st.slots[2]?.kind === "vp" ? 3 : 2;
  return 0;
}

/**
 * 유한 소실점이 들어갈 **빈** 수평 슬롯.
 *
 * ⚠⚠ **`screen` 슬롯을 대체하지 않는다**(2026-08-17 B). 옛 판은 두 번째 수평 소실점이
 * 화면 가로축 선언을 **밀어내는 차수 승격**(1점 → 2점)을 했다. 지시문이 그것을 없앴다:
 * **"되돌리기를 만들지 않는다. 잘못 그었으면 처음부터 다시 그린다."** 화면 가로선을
 * 그은 것은 **1점 투시를 선언한 것**이고, 그 뒤의 대각선은 전부 그 하나뿐인 깊이축이다.
 *
 * 남는 차수 승격은 **2점 → 3점** 하나다(기울어진 수직선을 수직축이라 답하는 것, A-4).
 */
function horizontalTarget(st: RuleState): { index: 0 | 1 } | null {
  for (const i of [0, 1] as const) if (!st.slots[i]) return { index: i };
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

  // 사용자가 "수직축"이라 답했다 — 유도될 V₃의 지지선으로만 센다(선에서 소실점을 만들지 않는다).
  //
  // ⚠ **그 선이 화면 수직이 아니면 그것이 3점 선언이다**(2026-08-17 A-4). 수심 유도는
  // 이제 **여기서만** 열린다 — 지평선 높이가 혼자 3점을 만들던 경로를 뺐다.
  if (forced === "vertical") {
    st.verticalLines.push(line);
    const s2 = st.slots[2];
    // **이미 다른 출처로 정해진 수직 소실점은 안 건드린다** — 지지선으로만 센다(§1의 잠금).
    // ⚠ `tilted_vertical`은 예외다: 그 값은 **이 선들이 만든 것**이므로 선이 하나 더 오면
    // **다시 푼다**. 소실점 하나를 지지선 여럿의 최소제곱 교점으로 푸는 것과 같은 자리다.
    if (s2 && s2.kind === "vp" && s2.source !== "tilted_vertical") {
      s2.support += 1;
      return { state: st, event: { type: "support", axis: 2 } };
    }
    const prev = s2 && s2.kind === "vp" ? s2 : null;
    if (prev) st.slots[2] = screenVerticalSlot();                     // 다시 풀 자리를 연다
    const st2 = deriveVertical(st, imgSize);
    const now = st2.slots[2];
    if (now && now.kind === "vp") return { state: st2, event: { type: "derived_vertical", at: now.at } };
    // **다시 풀기가 실패하면 옛 값을 되돌린다.** 지지선을 하나 더 그었다고 이미 선 수직
    // 소실점이 사라지면 안 된다 — 그것은 **사용자가 시키지 않은 되돌리기**다(A-3).
    if (prev) { st2.slots[2] = { ...prev, support: prev.support + 1 }; }
    return { state: st2, event: { type: "support", axis: 2 } };
  }
  // **너무 짧은 획은 소실점에 기여하지 않는다**(A-5). 획 자체는 부르는 쪽에 남는다 —
  // 여기서는 **카메라를 안 건드리는 것**만 한다. 실수로 그은 작은 선이 두 번째 소실점을
  // 정의해 버리던 자리다.
  {
    const L = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]);
    const min = c.min_vp_len_ratio * Math.hypot(imgSize[0], imgSize[1]);
    if (L < min) {
      return { state: st0, event: { type: "rejected",
        why: `획이 ${Math.round(L)}px로 짧아 소실점에 안 넣습니다`
           + ` (최소 ${Math.round(min)}px = 화면 대각의 ${c.min_vp_len_ratio}) — 획은 그대로 남습니다` } };
    }
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
    // ⚠⚠ **P2가 확정된 뒤에는 가로선이 축이 아니다**(2026-08-17 지시 1 — P2 → P1 전이는 없다).
    //
    // 수평 소실점이 **둘 다** 서면 2점 확정이고, 그 상태에서 화면 수평선을 축으로 받으면
    // 한 획이 그림 전체를 1점으로 되돌린다 — 되돌리기는 없으므로 거절한다.
    // (3점 구도의 깊이 모서리 중 화면 수평에 가까운 것이 그림을 되돌리던 자리 —
    // `horizon_pitch.json`에서 차수 3이 141/144 → 21로 무너졌던 그 문이다.)
    //
    // ⚠ **소실점이 하나뿐이면 받는다**(지시 1이 옛 "2점 후보 거절"을 좁혔다): 깊이선을 먼저
    // 긋고 가로선을 그으면 NONE → P1이고, 그 소실점이 P1의 깊이축이 된다. 후보 개념이
    // 없어졌으므로 확정 전 상태에서 가로선을 거절할 근거가 없다.
    if (perspectiveOrder(st) >= 2) {
      return { state: st0, event: { type: "rejected",
        why: "**2점이 확정됐습니다** — 수평 소실점이 이미 둘이므로 화면 수평선은 축이 아닙니다."
           + " 1점으로 그리려면 처음부터 다시 그으세요" } };
    }
    // ⚠⚠ **소실점이 하나라도 서 있으면 조용히 선언하지 않고 묻는다**(A-3 — 애매하면 놓지 않는다).
    //
    // P1 확정은 **불가역**이므로(전이표에 P1을 떠나는 길이 없다), 손 오차로 얕아진 깊이
    // 모서리(≤ 4°)가 조용히 가로선으로 읽히면 **한 획이 그림 전체를 1점에 가둔다.**
    // 측정이 그 회귀를 실제로 잡았다(2026-08-17 3차): 이 물음 없이 받게 하자 몰아 긋기
    // 축 오차 중앙이 10.1° → **31.6°**로 무너졌다(`axis_snap.json` — D-L48의 141/144 → 21과
    // 같은 기전). 소실점이 없는 초기 상태에서는 그대로 받는다 — 첫 가로선은 의도가 분명하다.
    if (forced !== "screen" && finiteHorizontals(st).length > 0) {
      return { state: st0, event: { type: "ask", question: "screen_or_depth", verdict: v } };
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
  const order = perspectiveOrder(st);

  // b. **첫 소실점은 그린 두 깊이선의 실제 교점이다**(2026-08-17 4차 지시 3 — 2차의
  //    "지평선이 먼저 있다"를 되돌린다). 소실점은 그린 선의 교점이어야 하고 그린 선은 안
  //    움직여야 한다 — 격자가 그린 선을 따라야지 반대가 아니다. 확정 순간 지평선이 그 y로
  //    맞춰진다(롤 0 유지 — 순서만 바뀐다, 지시 4-c).
  // c. **두 번째 수평 소실점부터는 그 지평선 위에 놓인다**(지시 4-d — 이건 그대로).
  //    교점의 한 쪽(지평선)이 정확하므로 "두 선이 나란해져 교점이 날아가는" 실패가 없다.
  {
    const rep: Rep = { a: line.a, b: line.b,
                       len: Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]), bend: 0 };
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
    // **두 번째 수평축인가 수직축인가** — 선만 보고 안 갈리면 묻는다.
    //
    // ⚠ 조건이 셋 바뀌었다(2026-08-17):
    //   ① `!st.slots[2]` → **유한 소실점이 아닌 동안**. 슬롯 2는 이제 처음부터 화면 수직이라
    //      옛 검사는 항상 거짓이다. 기울어진 수직선이 3점 선언이 될 수 있으므로 물어야 한다(A-4)
    //   ② **P1에서는 안 묻는다**. 화면 가로가 선언된 순간 3점은 불가능하고
    //      (1점의 정의가 가로축 무한원이다) 남은 축은 깊이 하나뿐이라 **모호가 없다**
    //   ③ ⚠⚠ **`!target` 거절보다 앞에 둔다.** 옛 자리(뒤)에서는 **수평 소실점이 둘 다 서면
    //      가파른 선이 물음도 없이 거절**됐고, 그러면 **3점으로 갈 입구가 아예 없다** —
    //      `horizon_pitch.json`에서 차수 3이 141/144 → **0**으로 무너진 것이 그 자리다.
    //      2점이 선 뒤에 세로 모서리를 긋는 것이 **정상적인 3점 작도 순서**다.
    if (forced !== "depth" && order !== 1
        && v.toV < c.vertical_ask_deg && st.slots[2]?.kind !== "vp") {
      return { state: st0, event: { type: "ask", question: "second_horizontal_or_vertical", verdict: v } };
    }
    if (!target) {
      // ⛔ **거리점 획득을 지웠다**(2026-08-17 지시 2) — 대각선이 거리점인지 2점 승격인지
      // 기하로 구분 불가다. P1의 f는 임의값이다(`perspectiveOrder` 머리말).
      // 축을 안 향하는 깊이선은 카메라에 안 들어간다 — 획 자체는 문서에 남는다.
      return { state: st0, event: { type: "rejected",
        why: order === 1
          ? "기존 소실점을 향하지 않는 깊이선입니다 — 1점 확정 뒤의 깊이선은 그 소실점을 향해야 합니다"
          : "수평 소실점이 이미 둘입니다 — 소실점은 확정 후 잠깁니다(CLAUDE.md §1)" } };
    }

    // ---- b. 첫 유한 수평 소실점이 아직 없다 — **그린 선끼리의 교점**으로만 선다(지시 3-a).
    if (finiteHorizontals(st).length === 0) {
      const pool = st.depthLines ?? (st.depthLines = []);
      // ⚠⚠ **끝점을 공유한 이음은 소실점이 아니다.** 이어 그린 두 선(ㄱ자 모서리·T자 접합)의
      // 직선 교점은 정확히 그 이음점이다 — 그것을 소실점으로 받으면 **모든 꼭짓점이 소실점이
      // 된다**(2D 오스냅으로 잇는 것이 기본 동작이라 즉시 걸린다). 교점이 어느 선의 끝점
      // 반경(스냅 병합과 같은 값, #17) 안이면 짝에서 뺀다 — 소실점은 **가로지르는** 교차나
      // 연장선의 수렴에서만 나온다(종이 위 투시 작도가 그렇다).
      const mergePx = SNAP_TOL.merge_ratio * Math.hypot(imgSize[0], imgSize[1]);
      const atEndpoint = (at: Pt2, q: RLine): boolean =>
        [q.a, q.b, line.a, line.b].some(e => Math.hypot(e[0] - at[0], e[1] - at[1]) <= mergePx);
      let best: { at: Pt2; sep: number; idx: number } | null = null;
      for (let k = 0; k < pool.length; k++) {
        const q = pool[k];
        const at = lineIntersect(q.a, q.b, line.a, line.b);
        // 거의 나란한 짝은 교점이 발산한다 — 유한 판정만 걸고 새 임계를 안 만든다(#17).
        // 짝이 여럿이면 **각차가 가장 큰**(조건수가 가장 좋은) 짝이다(`sepDeg` — 기존 수단).
        if (!at || !isFiniteVp(at, imgSize) || atEndpoint(at, q)) continue;
        const sep = sepDeg(q, line);
        if (!best || sep > best.sep) best = { at, sep, idx: k };
      }
      if (!best) {
        pool.push({ a: [line.a[0], line.a[1]], b: [line.b[0], line.b[1]] });
        return { state: st, event: { type: "waiting", have: pool.length } };
      }
      // **교점이 소실점이다** — 두 선 다 정확히 그 점을 지난다(교점의 정의). 그린 선은 안 움직인다.
      st.slots[target.index] = { kind: "vp", at: best.at, source: "two_lines", support: 2 };
      // **소실점이 지평선을 정한다**(롤 0 — y가 지평선이다). 옛 판(지평선이 소실점을 정함)의 역이다.
      st.horizon = best.at[1];
      // 짝이 안 된 나머지 대기 선: 그 소실점을 향하면 지지선으로 세고, 아니면 카메라 역할 없이
      // 문서에만 남는다(획은 어디서도 안 지운다)
      let extra = 0;
      for (let k = 0; k < pool.length; k++) {
        if (k === best.idx) continue;
        const q = pool[k];
        const qr: Rep = { a: q.a, b: q.b,
                          len: Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]), bend: 0 };
        if (vpMisfit(qr, best.at) <= AXIS_TOL.vp_dist_ratio) extra += 1;
      }
      (st.slots[target.index] as { support: number }).support += extra;
      st.depthLines = [];
      const st2 = deriveVertical(st, imgSize);
      return { state: st2,
               event: { type: "vp_fixed", axis: target.index, at: best.at,
                        source: "two_lines", horizonSet: true } };
    }

    // ---- c. 둘째 수평 소실점 — 지평선(= 첫 소실점의 y) × 선. 선 하나면 된다(지시 4-d 유지).
    const p = vpOnHorizon(rep, st.horizon);
    if (!p) {
      return { state: st0, event: { type: "rejected",
        why: `지평선과 ${HORIZON_TOL.min_slope_deg}° 안이라 교점이 발산합니다` } };
    }
    if (!isFiniteVp(p, imgSize)) {
      return { state: st0, event: { type: "rejected", why: "교점이 사실상 무한원입니다(화면 평행)" } };
    }
    st.slots[target.index] = { kind: "vp", at: p, source: "horizon_x_line", support: 1 };
    const st2 = deriveVertical(st, imgSize);
    return { state: st2,
             event: { type: "vp_fixed", axis: target.index, at: p,
                      source: "horizon_x_line", horizonSet: false } };
  }

}

/**
 * **사용자가 기울어진 수직선을 수직축이라고 답했는가** — 그것이 **유일한 3점 입구다**(A-4).
 *
 * ⚠ **새 필드를 만들지 않는다**(#18: 안 읽는 필드를 늘리지 않는다). `verticalLines`에
 * 이미 그 선이 들어 있고, 화면 수직인지는 `classifyLine`이 **같은 임계로** 판정한다(#17).
 * 그러므로 옛 저장본도 그대로 열린다 — 저장된 선을 다시 판정하면 같은 답이 나온다.
 */
/**
 * ⚠⚠ **`!== "screen_v"`가 아니라 `=== "depth"`다.** 초판이 전자였고 측정이 잡았다:
 * 손으로 그은 세로선은 4~8°(애매 구간)로 흔히 떨어지는데, 그것을 "기울었다"로 읽으면
 * **손 오차가 3점 투시를 만든다**. `horizon_pitch.json`에서 중앙 지평선의 차수 3 비율이
 * 0 → **0.63**으로 뛴 것이 그 자리다. 애매 구간은 **화면 수직 쪽**으로 둔다 —
 * 3점 선언은 **의도가 분명한 기울기**(≥ `depth_min_deg`)만 받는다(A-3: 애매하면 놓지 않는다).
 */
export const tiltedVerticals = (st: RuleState, cfg: RuleCfg = {}): RLine[] =>
  st.verticalLines.filter(l => classifyLine(l.a, l.b, cfg).kind !== "screen_v");

/** 기울기가 **의심의 여지 없이** 크다 — 선 하나로 3점을 선언해도 되는 조건. */
const clearlyTilted = (l: RLine, cfg: RuleCfg = {}): boolean =>
  classifyLine(l.a, l.b, cfg).kind === "depth";

export const wantsTiltedVertical = (st: RuleState, cfg: RuleCfg = {}): boolean =>
  tiltedVerticals(st, cfg).length > 0;

/**
 * **수직 소실점 — 사용자가 그은 기울어진 수직선에서 읽는다**(2026-08-17 A-4로 교체).
 *
 * ⚠⚠ **옛 판은 수심 유도였다**(이론서 6.3): 수평 소실점 둘과 주점(= 이미지 중심 가정)이
 * 있으면 V₃가 일의적으로 정해진다. 그것을 **뺐다** — 그 식은 `dy = P_y − 지평선`으로 나누므로
 * **지평선 높이가 곧 3점 여부**가 됐고, 그러면 **사용자가 2점을 그리는 동안 도구가 피치를
 * 정한다**(A-4가 지적한 그 자리). 2점 투시에서 피치 판정은 필요 없다.
 *
 * 지금은 **정보의 출처가 사용자의 선**이다:
 * ```
 * V₃ = (그은 기울어진 수직선) ∩ (x = W/2)      ← 주점 x = 이미지 중심 가정(16.2)만 쓴다
 * ```
 * 선이 여럿이면 그 교점들의 **y 평균**이다(전부 같은 축의 지지선이므로).
 * 그러면 주점은 소실점 삼각형의 **수심**으로 다시 나오고(6.3) f도 거기서 나온다 —
 * 즉 **가정의 귀결이 아니라 측정**이다(PITFALLS #5 자기참조 유형 3이 해소된다).
 *
 * ⚠ 여전히 남는 가정: **주점 x = 이미지 중심**(16.2, AS-C5). 롤 0이면 수직 소실점은
 * 주점과 같은 x에 있다 — 그것이 이 식의 근거이고 옛 수심 식의 출력 형태(`[P_x, y₃]`)와 같다.
 */
export function deriveVertical(st0: RuleState, imgSize: [number, number],
                               cfg: RuleCfg = {}): RuleState {
  const st = cloneRuleState(st0);
  if (st.slots[2]?.kind === "vp") return st;          // 이미 유한 소실점이다
  // **P1에서는 3점이 불가능하다.** 가로축이 화면에 평행하다는 것이 1점의 정의이고
  // (이론서 2.3), 그 상태에서 수직축까지 유한 소실점이면 **무한원 축 하나 + 유한 둘**이라
  // 사용자가 그리고 있는 그림이 아니다. **애매하면 놓지 않는다**(A-3).
  if (perspectiveOrder(st) === 1) return st;
  const lines = tiltedVerticals(st, cfg);
  if (!lines.length) return st;                       // 화면 수직이 옳다 — 1점·2점이다
  const cx = imgSize[0] / 2;
  // ⚠⚠ **선이 둘 이상이면 최소제곱 교점이다**(`lsIntersection`) — 초판은 언제나
  // `∩ (x = W/2)`를 쓰고 그 y들을 평균했고, 측정이 그것을 **조건수 때문에** 기각했다:
  // 수직 소실점은 화면에서 아주 멀리 있으므로 획을 x = W/2까지 **외삽**하면 각 오차가
  // 크게 증폭된다(`horizon_pitch.json`의 축별 몰아 긋기에서 축 오차 중앙 **37.7°**).
  // 소실점을 지지선 여럿의 교점으로 푸는 것은 이 저장소의 기존 수단이다(#17: `camera.ts`).
  // 선이 하나뿐일 때만 **주점 x = 이미지 중심**(16.2)을 써서 자유도를 메운다.
  let v3: Pt2 | null = null;
  if (lines.length >= 2) {
    v3 = lsIntersection(lines.map(l => ({ p: l.a,
      d: [l.b[0] - l.a[0], l.b[1] - l.a[1]] as Pt2 })));
    // **거의 나란하면 교점이 발산한다** — 그때는 아래 한 선 경로로 내려간다(A-3: 못 내면 안 낸다)
    if (v3 && !isFiniteVp(v3, imgSize)) v3 = null;
  }
  // **선이 하나뿐일 때는 기울기가 분명해야 한다.** 손으로 그은 세로선은 4~8°(애매 구간)로
  // 흔히 떨어지는데, 그 하나를 x = W/2까지 **외삽**하면 각 오차가 크게 증폭된다 —
  // 그러면 **손 오차가 3점 투시를 만든다**(초판이 그랬고 `horizon_pitch.json`이 잡았다).
  if (!v3 && lines.length === 1 && clearlyTilted(lines[0], cfg)) {
    const p = lineIntersect(lines[0].a, lines[0].b, [cx, 0], [cx, 1]);
    v3 = p && Number.isFinite(p[1]) ? [cx, p[1]] : null;
  }
  if (!v3) return st;
  if (!isFiniteVp(v3, imgSize)) return st;            // 사실상 무한원 — 화면 수직으로 둔다
  st.slots[2] = { kind: "vp", at: v3, source: "tilted_vertical", support: lines.length };
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

// ⛔ **`distancePoints`·`settledAxes`·`orderOfState`를 지웠다**(2026-08-17 지시 1·2·3).
// 거리점 경로는 폐기됐고, 차수는 `perspectiveOrder` 하나가 계산한다 — 표시도 판정도 그것을 부른다.

// ---------------------------------------------------------------- 스냅 표 (2026-08-17 A)

/**
 * **무엇이 그 축을 스냅해 주는가.**
 *
 * - `screen_ortho` — 화면 직교 스냅(`axisSnap.screenOrthoSnap`). **카메라가 없어도 돈다**(A-2).
 * - `axis_snap`    — 라이노 직교 모드(`axisSnap.snapToAxis`). 3D 앵커와 f가 필요하다.
 * - `vp_dir`       — 소실점 방향 스냅(`axisSnap.vpDirSnap`, 4차 지시 2). **카메라가 안 서도**
 *                    소실점만 있으면 그 방향으로 끌린다 — 화면 작도라 f가 필요 없다.
 * - `null`         — 지금은 그 축으로 못 긋는다.
 */
export type SnapVia = "screen_ortho" | "axis_snap" | "vp_dir" | null;
export interface AxisSnapRow {
  axis: 0 | 1 | 2;
  /** 그 축이 무엇으로 정해져 있나. `null`이면 아직 미정이다. */
  kind: "screen_h" | "screen_v" | "vp" | null;
  via: SnapVia;
}

/**
 * **1·2·3점 각각에서 어느 축이 스냅 가능한가**(사람 지시 A 마지막 줄: "표로 정리하고
 * 테스트로 잠근다"). **화면·앱·테스트가 이 함수 하나를 읽는다**(#17) — 표를 문서에만
 * 적으면 코드와 갈리고, 갈리면 **표가 틀린다**.
 *
 * | 상태 | 축1 | 축2 | 축3(수직) |
 * |---|---|---|---|
 * | 초기(카메라 없음) | — | — | **화면 세로**(직교 스냅) |
 * | 화면 가로 선언(1점 후보) | **화면 가로**(직교) | — | **화면 세로**(직교) |
 * | 1점 확정 | 화면 가로(축) | 소실점 | 화면 세로(축) |
 * | 2점 확정 | 소실점 | 소실점 | 화면 세로(축) |
 * | 3점 확정 | 소실점 | 소실점 | 소실점 |
 *
 * ⚠ **카메라가 안 서도 소실점 방향은 스냅된다**(4차 지시 2 — 옛 계약을 뒤집었다):
 * 3D 축 방향 `(V−P, f)`는 f가 필요하지만, **화면에서 소실점을 지나는 직선**은 f 없이
 * 성립한다(이론서 2장) — 그 방향으로 끄는 것이 `vp_dir`(`axisSnap.vpDirSnap`)이다.
 */
export function snapAxisTable(st: RuleState, cameraStanding: boolean): AxisSnapRow[] {
  return ([0, 1, 2] as const).map(i => {
    const s = st.slots[i];
    const kind: AxisSnapRow["kind"] =
      !s ? null : s.kind === "vp" ? "vp" : s.dir === "h" ? "screen_h" : "screen_v";
    const via: SnapVia =
      kind == null ? null
      : cameraStanding ? "axis_snap"
      : kind === "vp" ? "vp_dir"             // 소실점이 있으면 화면 작도로 그 방향이 선다(지시 2)
      : "screen_ortho";
    return { axis: i, kind, via };
  });
}

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
