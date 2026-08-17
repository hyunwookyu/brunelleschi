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
   * ⛔ **읽는 자리가 없다**(2026-08-18 7차 지시 3-b로 그 물음이 사라졌다 — D-L74).
   *
   * 옛 뜻: 두 번째 수평 소실점을 만들려는 깊이선이 화면 수직에 이보다 가까우면 **묻는다**
   * (두 번째 수평축인지 수직축인지 선만 보고는 갈리지 않기 때문). 그 물음이 없어졌다.
   *
   * **값을 동결 리터럴로 남기는 이유는 해시 안정성 하나다** — `SHARED_CONSTANTS`의 전역 해시가
   * 하나뿐이라(DEFERRED "의존 집합별 해시") 키를 빼면 이 값에 의존한 적 없는 원장 40여 개가
   * 전부 STALE이 된다. `DRAFT_TOL`(D-L54로 삭제된 검출 초안 경로)이 같은 자리의 결정이다.
   * 의존 집합별 해시가 서면 그때 뺀다. ⚠ 7-R 리뷰어 [6-A]가 이 잔존을 짚었고, 지우지 않고
   * **왜 남겼는지를 적는** 쪽을 골랐다(#18의 "설명이 검사를 끈다"와 다른 자리다 — 여기서는
   * 검사를 약화시키는 것이 아니라 검사 대상 밖임을 명시하는 것이다).
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
  /**
   * **그 선이 이 점으로 모이는가**(2026-08-18 6차 지시 11 — "교점 쪽"의 판정).
   *
   * 선의 방향과 **선의 중점에서 그 점을 향하는 방향** 사이의 각(도). 이보다 작으면 그 선은
   * 그 점으로 모인다.
   *
   * ⚠⚠ **`AXIS_TOL.vp_dist_ratio`를 쓰면 안 된다**(실제로 걸렸다). 그것은 **수직거리 ÷ 획
   * 길이**라, 소실점이 멀 때만 각의 대용이 된다. 짧은 획과 **가까운** 교점에서는 같은 비가
   * 훨씬 큰 각을 뜻하고, 그래서 **다른 축의 세 선이 한 점으로 모인 것처럼 읽혔다**
   * (초판 구현이 그랬고 `vp_rules.test.ts`의 "2점이 한 번에" 시험이 잡았다 — 세 선의
   * 지지 수가 3으로 나와 1점으로 굳었다). 여기서는 **각을 직접 잰다.**
   *
   * 값의 근거는 **실획**이다(6차 지시 머리말): 첫 표본에서 획의 2D 방향과 소실점 방향의 차가
   * **Δ0.0~1.7°**였다. 그 상한의 약 두 배로 둔다 — 손 오차를 담되 다른 축을 안 삼키는 폭이다.
   * ⚠ **동작점 하나이고 스윕을 안 돌렸다**(#12). 실획 표본이 `sessions/`에 들어오면
   * `real_ink`가 이 값을 가르는 분포를 낸다.
   */
  concurrent_deg: 3,
} as const;
export type RuleCfg = Partial<typeof RULE_TOL>;

/**
 * **2점 확정의 화각 게이트**(2026-08-18 6차 지시 7 · 이론서 18.4).
 *
 * ---------------------------------------------------------------- 문제는 화면 밖이 아니다
 *
 * **소실점이 화면 밖으로 나가는 것은 정상이다.** 건축 투시도는 두 소실점이 화면 폭의
 * 두세 배 떨어져 있는 것이 보통이고, **둘 다 화면 안에 있으면 화각이 극단적으로 넓다.**
 * 화면 밖 좌표는 그대로 계산에 들어간다 — `isFiniteVp`의 문턱은 대각의 **50배**라
 * (`VP_INFINITE_RATIO`) 클램프가 아니고, 실획 표본의 VP1(x = −231)도 그 안이다.
 *
 * 문제는 **너무 가까운 것**이다. 두 소실점 사이 거리 `d`가 짧으면 f가 작아지고
 * (6.2: f² = |PV₁||PV₂|, P가 그 사이에 있을 때 최대 f = d/2) 화각이 넓어진다.
 *
 * ```
 * f² ≤ 0        주점이 두 소실점 **사이에 없다** — 대응하는 카메라가 없다 → **거부**
 * d < 0.50·W    화각이 90°를 크게 넘는다(그 대역의 상한 f = d/2 < W/4) → **경고**(심함)
 * d < 0.87·W    아직 넓다 → **경고**
 * d ≥ 0.87·W    정상
 * ```
 *
 * ⚠ **경고는 확정을 막지 않는다**(지시 7-b "경고하고 확정하되 표시"). 막는 것은 f² ≤ 0
 * 하나뿐이다 — 그때만 **서 있을 수 없는 카메라**이기 때문이다. 넓은 화각은 이상하지만
 * 존재하는 시점이고, 이 도구는 **공간과 투시를 이해하는 사용자를 전제한다**(CLAUDE.md).
 *
 * ⚠ **3점에도 같은 게이트가 든다** — 3점의 수평 소실점 둘은 이 문을 이미 지나서 섰다
 * (수직 소실점은 그 뒤에 `deriveVertical`이 얹는다). 예각 조건(6.5, f²<0)은 `recoverCamera`가
 * 별개로 본다 — **화각과 다른 양이다**(지시 7-d).
 */
export const FOV_GATE = {
  /**
   * **시거리 f가 화면 폭의 이 배수 미만이면 심한 경고** — 화각 90° 초과.
   * `2·atan((W/2)/f) = 90°` ⟺ `f = 0.5·W`(이론서 18.4).
   */
  severe_f_ratio: 0.50,
  /** **이 배수 이상이면 정상** — 화각 60° 이하. `2·atan((W/2)/f) = 60°` ⟺ `f = 0.866·W`. */
  ok_f_ratio: 0.87,
} as const;

export type FovBand = "ok" | "warn" | "severe" | "reject";

export interface FovVerdict {
  band: FovBand;
  /** 두 소실점 사이 화면 거리(px). */
  d: number;
  /** `d / W` — 대역을 가르는 양. */
  dOverW: number;
  /** 6.2의 f(= 시거리). `null`이면 f² ≤ 0(주점이 사이에 없다). */
  f: number | null;
  /**
   * **`f / W` — 대역을 가르는 양**(이론서 18.4의 시거리 기준).
   *
   * ⚠⚠ **`d / W`가 아니다**(6차 리뷰어 [5]·[4·5]). 초판이 지시문의 표기를 그대로 옮겨
   * 소실점 사이 거리에 0.5·0.87을 걸었는데, 이론서 18.4의 그 값은 **시거리** 기준이다:
   * `2·atan((W/2)/f)`가 90°·60°가 되는 자리가 `f = 0.5W`·`f = 0.866W`다.
   * 주점이 정중앙일 때 `f = d/2`이므로 d에 걸면 **실효 임계가 정확히 두 배 느슨해진다** —
   * 초판 쓸기의 `d/W = 0.87` 행이 화각 **97.95°인데 `ok`**였다(원장이 스스로 모순을 들었다).
   * 그리고 f는 `|PV₁||PV₂|`라 **비대칭 배치도 담는다** — d/W는 못 담는다.
   * 지시 7-b의 뜻("화각 90° 초과")을 그대로 살리려면 여기에 걸어야 한다.
   */
  fOverW: number | null;
  /** 가로 화각(도). f가 없으면 `null`. */
  fovDeg: number | null;
  /** 사람이 읽는 사유. `ok`면 빈 문자열. */
  why: string;
}

/**
 * **두 수평 소실점이 서 있을 수 있는 카메라를 내는가**(지시 7-b).
 *
 * 주점 x는 **이미지 중심 가정**(16.2, AS-C5)이고 이 저장소가 2점 경로에서 이미 쓰는 것이다 —
 * 새 가정을 들이지 않는다. 두 소실점은 롤 0이므로 같은 지평선 위에 있고, 그래서 f²의 부호는
 * **주점 x가 둘 사이에 있는가** 하나로 갈린다.
 */
export function fovGate(
  v0: Pt2, v1: Pt2, imgSize: [number, number], cfg: Partial<typeof FOV_GATE> = {},
): FovVerdict {
  const c = { ...FOV_GATE, ...cfg };
  const [W, Himg] = imgSize;
  const px = W / 2, py = Himg / 2;                    // 주점 = 이미지 중심(16.2, AS-C5)
  const d = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]);
  const dOverW = W > 0 ? d / W : 0;
  // ⚠⚠ **주점이 지평선 위에 있다고 가정하면 안 된다**(6차 리뷰어). 이론서 6.2의
  // `f² = |PV₁||PV₂|`는 **주점도 지평선 위**일 때의 꼴이다(y 성분이 전부 같다). 일반형은
  // `(V₁ − P)·(V₂ − P) = −f²`이고, 두 소실점이 같은 지평선 위(롤 0)이면 그 세로 어긋남
  // `h = 주점 y − 지평선 y`가 **양쪽에 공통**이라 `f² = −Δx₁Δx₂ − h²`가 된다.
  // h를 빼먹으면 f가 과대평가되고(실획 보고 행에서 506.11 대 474.2 — 6.7%)
  // **거부 조건도 좁아진다**: h가 크면 주점 x가 둘 사이에 있어도 f² ≤ 0이 될 수 있다.
  const lo = Math.min(v0[0], v1[0]), hi = Math.max(v0[0], v1[0]);
  const h = py - (v0[1] + v1[1]) / 2;
  const f2 = (px - lo) * (hi - px) - h * h;
  if (!(f2 > 0)) {
    return { band: "reject", d, dOverW, f: null, fOverW: null, fovDeg: null,
             why: "**서 있을 수 없는 시점입니다** — 대응하는 카메라가 없습니다"
                + "(f² ≤ 0, 이론서 6.2·6.5). 두 소실점이 화면 중심을 넉넉히 사이에 두도록,"
                + " 그리고 지평선이 화면 중앙에서 너무 멀지 않게 그으세요" };
  }
  const f = Math.sqrt(f2);
  const fOverW = W > 0 ? f / W : 0;
  const fovDeg = (2 * Math.atan((W / 2) / f) * 180) / Math.PI;
  const tail = `<span class="dim">(소실점 사이 ${Math.round(d)}px = 화면 폭의 `
             + `${dOverW.toFixed(2)}배 · 시거리 ${Math.round(f)}px)</span>`;
  if (fOverW < c.severe_f_ratio) {
    return { band: "severe", d, dOverW, f, fOverW, fovDeg,
             why: `**소실점이 너무 가깝습니다** — 화각 ${fovDeg.toFixed(0)}°로 서기 어려운 `
                + `시점입니다. 깊이선의 기울기를 줄여 소실점을 더 벌리세요 ${tail}` };
  }
  if (fOverW < c.ok_f_ratio) {
    return { band: "warn", d, dOverW, f, fOverW, fovDeg,
             why: `화각이 ${fovDeg.toFixed(0)}°로 넓습니다 ${tail}` };
  }
  return { band: "ok", d, dOverW, f, fOverW, fovDeg, why: "" };
}

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
  | "tilted_vertical"
  /** **대기 깊이선 위의 점을 사용자가 찍어 확정**(4차 지시 4-b — `pickVpAt`). 측정이다. */
  | "picked_point";

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
  | { type: "vp_fixed"; axis: 0 | 1 | 2; at: Pt2; source: VpSource; horizonSet: boolean;
      /** two_lines일 때 짝이 된 대기 선(측정용 — 5차 이월-2 리뷰어 [22]). 앱 동작에는 안 쓰인다. */
      paired?: RLine;
      /**
       * **잠정 화면 가로축을 밀어내고 2점이 섰다**(8차 지시 1-d). 사용자가 가로선이라 그은
       * 획이 실제로는 **얕은 깊이 모서리**였다는 뜻이므로 **알린다**(A-3: 조용히 바꾸지 않는다).
       */
      displacedScreenH?: boolean;
      /**
       * **화각 게이트의 판정**(6차 지시 7-b). 2점이 서는 순간에만 채워진다 —
       * `ok`가 아니면 화면에 그대로 낸다(**확정은 됐고 시점이 이상하다**는 알림이다).
       */
      fov?: FovVerdict }
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
  | { type: "ask"; question: "screen_or_depth" | "second_horizontal_or_vertical";
      /**
       * **물음이 어디서 났는가**(2026-08-18 8차 지시 2-a). `question`만으로는 남은 물음이
       * 전부 `screen_or_depth` 한 덩어리로 보여 **무엇을 없앨 수 있는지 못 가른다.**
       * 두 자리는 성질이 다르다:
       *   `ambiguous` — 화면 축과 깊이 사이 **애매 구간**(4~8°). **진짜 모호 판정**이고
       *                 지시 2-b대로 **커서 위치로 가를 것**이지 물어볼 것이 아니다.
       *   `p1_guard`  — 소실점이 이미 선 상태의 화면 수평선. 애매해서가 아니라
       *                 **불가역 전이를 조용히 통과시키지 않으려고** 묻는다(D-L53).
       *                 이것은 **없앨 대상이 아니다**.
       */
      site: "ambiguous" | "p1_guard";
      verdict: LineVerdict }
  /** 쓸 수 없다. `why`가 사유다. */
  | { type: "rejected"; why: string;
      /** **화각 게이트가 막았다**(6차 지시 7-c) — 판정 값을 함께 낸다(원장이 읽는다). */
      fov?: FovVerdict;
      /**
       * **사용자에게 알릴 거절인가**(6차 지시 7-c·11-3). 참이면 `why`를 화면에 그대로 낸다.
       * 나머지 거절(짧은 획·잠긴 슬롯·발산하는 교점)은 **시스템 사정이라 안 낸다**(지시 3) —
       * 알릴 것은 **사용자가 무엇을 다시 그어야 하는지**가 있는 둘뿐이다.
       */
      notify?: boolean };

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
  const nH = ([0, 1] as const).filter(i => st.slots[i]?.kind === "vp").length;
  if (nH >= 2) return st.slots[2]?.kind === "vp" ? 3 : 2;
  // ⚠⚠ **화면 수평축만으로는 1점이 아니다**(2026-08-18 8차 지시 1-a·1-b).
  //
  // 옛 판은 `hasH`면 곧바로 1을 냈다 — **수평축이 존재한다는 것과 카메라가 섰다는 것을
  // 같은 것으로 읽은 것**이다. 그 둘은 다르다: 1점 투시는 화면 평행 수평축 **하나와
  // 깊이 소실점 하나**로 정의되고(이론서 2.3 — 무한원으로 간 축의 개수), 깊이 소실점이
  // 없으면 **깊이 방향이 미정**이라 카메라가 설 수 없다.
  //
  // 그 오독의 대가가 실측으로 지배항이었다: `order_lock.json`의 `first_declaration.screen_h`가
  // **497/600**(잡음 0 층 120/120)이고 **`snapForced` 우회를 지워도 안 움직였다**(D-L70).
  // 손 오차로 얕아진 깊이 모서리(≤ 4°)가 화면 수평선으로 읽히면 그 한 획이 수평 슬롯을
  // 차지하고, 슬롯이 둘뿐이라 **두 번째 깊이 소실점이 영영 못 들어와 P2가 도달 불가**가 됐다.
  // 요인 분해가 같은 방향을 가리켰다 — 축 라벨만 참으로 바꾸면 형태 오차가 안 움직이고
  // (1.3329 → 1.3511) **소실점만 참으로 바꾸면 크게 움직인다**(→ 0.2452).
  //
  // **차수는 카메라 상태의 함수다**(지시 1-b): 1점 = 시선이 세계 축과 정렬·피치 0 ·
  // 2점 = 시선이 축과 어긋남·피치 0 · 3점 = 피치 ≠ 0. 슬롯 집합은 그 상태의 **관측**이고
  // 아래 대응이 그 정의와 일치한다 — 화면 수평축 + 깊이 소실점 하나면 시선이 그 축에
  // 정렬돼 있고 피치가 0이다(수직축이 화면 수직이므로).
  const hasH = ([0, 1] as const).some(i => {
    const s = st.slots[i];
    return s != null && s.kind === "screen" && s.dir === "h";
  });
  if (hasH && nH >= 1) return 1;
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

/**
 * `used`를 채운 **뒤에** 남는 빈 수평 슬롯(6차 지시 11 — 2점이 한 번에 서는 경로).
 * `st`는 아직 `used`를 안 채운 상태로 들어오므로 그 자리를 빼고 본다.
 */
function horizontalTargetAfter(st: RuleState, used: 0 | 1): 0 | 1 | null {
  for (const i of [0, 1] as const) if (i !== used && !st.slots[i]) return i;
  return null;
}

// ---------------------------------------------------------------- 소실점 확정 (6차 지시 11)

/**
 * **다른 축의 두 선이 만나는 것은 공간의 한 점이지 소실점이 아니다**(6차 지시 11).
 *
 * 옛 규칙(4차 지시 3)은 **대각선 둘의 교점을 곧바로 첫 소실점으로** 받았다. 그것이
 * 실사용에서 정면으로 걸렸다: **빈 캔버스에서 서로 다른 방향의 대각선 둘을 그으면
 * 2점을 그리려던 것인데 1점으로 확정된다** — 그리고 P1은 불가역이라(지시 1) 그림 전체가
 * 갇힌다. 같은 축의 두 선이 만나야 소실점이다.
 *
 * ```
 * 대각선 1개          축 하나. 대기
 * 대각선 2개          같은 축인지 다른 축인지 **미정**. 대기 — 교점을 소실점으로 읽지 않는다
 * + 교점 쪽 선(셋 한 축)   교점이 소실점                      → 첫 소실점 하나
 * + 반대쪽 선(둘이 갈림)   가까운 둘이 한 축 · 나머지가 다른 축 → **2점이 한 번에 선다**
 * ```
 *
 * ⚠ **"교점 쪽"은 각으로 잰다**(지시 11-1) — 세 번째 선을 연장했을 때 그 교점 근처를
 * 지나는가. 실획에서 손 오차가 Δ0.0~1.7°였으므로 각 기준이 안정적이다. 판정은
 * `axis.ts`의 부적합도(수직거리 ÷ 길이)를 그대로 쓴다(#17: 새 임계를 만들지 않는다).
 */
interface PoolPick {
  at: Pt2;
  /** 그 점으로 모이는 대기 선의 index. 길이가 곧 지지 수다. */
  members: number[];
  /** 짝의 각차(도) — 교점의 조건수. 동점일 때 가른다. */
  sep: number;
  /**
   * **대기 선 무리의 중심에서 그 교점까지의 거리(px)**(6차 지시 11의 근거 그대로).
   *
   * "**다른 축의 두 선이 만나는 것은 공간의 한 점이지 소실점이 아니다**" — 그 한 점은
   * 대개 **그림 안**에 있고, 진짜 소실점은 **그림 밖 멀리** 있다(같은 축의 선들은 거의
   * 나란하므로 교점이 멀다). 그래서 **먼 쪽이 소실점이다.** 새 임계가 아니라 **순서**다.
   */
  far: number;
}

const repOfLine = (l: RLine): Rep =>
  ({ a: l.a, b: l.b, len: Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), bend: 0 });

/**
 * **그 선이 그 점으로 모이는 각(도)**. 선의 방향과 **중점 → 그 점** 방향의 각차다(0~90).
 * 중점을 쓰는 이유: 끝점을 쓰면 그 끝이 점에 가까울 때 각이 무의미하게 커진다.
 * 그 점이 선 위(중점 근처)면 방향이 정해지지 않으므로 0으로 본다.
 */
/**
 * **그 점이 선분의 연장 위에 있는가**(6차 지시 11).
 *
 * ⚠⚠ **이것이 없으면 각 판정이 무너진다**(실측: 합성 120구도에서 15구도가 틀렸다).
 * `convergeDeg`는 **각**이라, 점이 선분 **가까이**에 있으면 어느 선에 대해서도 각이 작다 —
 * 그림 한복판의 교차점이 세 선 모두에 "모이는" 것으로 읽혔고, 그것이 곧 지시 11이 지목한
 * **"공간의 한 점을 소실점으로 읽는"** 그 오류다.
 *
 * 종이 위 작도가 답을 준다: **소실점은 선을 연장해서 찾는다.** 그린 구간 안에서 가로지르는
 * 자리는 모서리이지 소실점이 아니다. 그래서 교점은 **두 선 다의 밖**에 있어야 한다.
 * 여유(`extend_ratio`)는 스냅의 그것을 그대로 쓴다(#17 — 새 임계를 안 만든다).
 */
export function beyondSegment(l: RLine, at: Pt2): boolean {
  const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1];
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return false;
  const t = ((at[0] - l.a[0]) * dx + (at[1] - l.a[1]) * dy) / L2;
  const pad = SNAP_TOL.extend_ratio;
  return t < -pad || t > 1 + pad;
}

export function convergeDeg(l: RLine, at: Pt2): number {
  const m: Pt2 = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
  const to: RLine = { a: m, b: at };
  if (Math.hypot(at[0] - m[0], at[1] - m[1]) < 1e-9) return 0;
  return sepDeg(l, to);
}

/**
 * 대기 선 짝마다의 교점 후보. **끝점을 공유한 이음은 뺀다** — 이어 그린 두 선(ㄱ자 모서리·
 * T자 접합)의 교점은 정확히 그 이음점이고, 그것을 소실점으로 받으면 **모든 꼭짓점이
 * 소실점이 된다**(4차 지시 3의 판정 그대로, #17).
 */
function poolCandidates(pool: RLine[], imgSize: [number, number],
                       cfg: RuleCfg = {}): PoolPick[] {
  const c = { ...RULE_TOL, ...cfg };
  const mergePx = SNAP_TOL.merge_ratio * Math.hypot(imgSize[0], imgSize[1]);
  const out: PoolPick[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const at = lineIntersect(pool[i].a, pool[i].b, pool[j].a, pool[j].b);
      if (!at || !isFiniteVp(at, imgSize)) continue;
      const ends = [pool[i].a, pool[i].b, pool[j].a, pool[j].b];
      if (ends.some(e => Math.hypot(e[0] - at[0], e[1] - at[1]) <= mergePx)) continue;
      // **소실점은 두 선의 연장에서 만난다** — 그린 구간 안의 교차는 모서리다
      if (!beyondSegment(pool[i], at) || !beyondSegment(pool[j], at)) continue;
      const members = [i, j];
      for (let k = 0; k < pool.length; k++) {
        if (k === i || k === j) continue;
        if (beyondSegment(pool[k], at) && convergeDeg(pool[k], at) <= c.concurrent_deg) {
          members.push(k);
        }
      }
      const cx = pool.reduce((t, l) => t + (l.a[0] + l.b[0]) / 2, 0) / pool.length;
      const cy = pool.reduce((t, l) => t + (l.a[1] + l.b[1]) / 2, 0) / pool.length;
      out.push({ at, members, sep: sepDeg(pool[i], pool[j]),
                 far: Math.hypot(at[0] - cx, at[1] - cy) });
    }
  }
  return out;
}

export interface PoolVerdict {
  /** 첫 소실점. */
  at: Pt2;
  /** 그 점으로 모인 대기 선 수. */
  support: number;
  /** 그 점으로 모인 대기 선의 index. 앞 둘이 교점을 만든 짝이다(측정용 `paired`의 출처). */
  members: number[];
  /** 그 점에 안 모인 대기 선의 index — **두 번째 축의 후보다**(지시 11-1 넷째 줄). */
  rest: number[];
}

/**
 * **대기 선 묶음에서 소실점을 읽는다.** 못 읽으면 `null`(= 계속 대기).
 *
 * `unambiguous`는 **깊이축이 하나뿐임이 이미 선언된 상태**다(화면 가로축이 서 있는 P1).
 * 그때는 모든 깊이선이 같은 축이므로 **두 선으로 충분하다** — 셋을 기다리는 이유(어느 둘이
 * 같은 축인가)가 애초에 없다. 두 슬롯이 다 비어 있을 때만 셋째 선을 기다린다.
 */
export function resolvePool(
  pool: RLine[], imgSize: [number, number], unambiguous: boolean, cfg: RuleCfg = {},
): PoolVerdict | null {
  const cands = poolCandidates(pool, imgSize, cfg);
  if (!cands.length) return null;
  const restOf = (c: PoolPick) =>
    pool.map((_, k) => k).filter(k => !c.members.includes(k));

  // ① **셋 이상이 한 점으로 모인다** — 그것이 소실점이다(지시 11-1 셋째 줄).
  const concurrent = cands.filter(c => c.members.length >= 3)
    .sort((a, b) => b.members.length - a.members.length || b.far - a.far);
  if (concurrent.length) {
    const c = concurrent[0];
    return { at: c.at, support: c.members.length, members: c.members, rest: restOf(c) };
  }
  // ② **깊이축이 하나뿐인 것이 이미 선언됐다** — 두 선이면 정해진다.
  if (unambiguous) {
    const c = [...cands].sort((a, b) => b.far - a.far)[0];
    return { at: c.at, support: c.members.length, members: c.members, rest: restOf(c) };
  }
  // ③ **두 선뿐이면 대기한다** — 같은 축인지 다른 축인지 갈리지 않는다(지시 11-1 둘째 줄).
  //    이것이 이번 변경의 핵심이다: 옛 판은 여기서 확정했고 그래서 2점이 1점이 됐다.
  if (pool.length < 3) return null;
  // ④ **셋이 안 모인다 → 어느 둘이 같은 축인가**(지시 11-2 · 7차 지시 2-2).
  //
  // ⚠⚠ **2026-08-18 7차에 기준이 바뀌었다 — 측정이 지시문 쪽이었다.**
  // 6차 판은 `far`(교점까지의 거리) 최대를 썼고 그 근거로 "합성 400구도에서 각차 399 ·
  // 거리 400"을 인용했는데, **그 수는 어느 원장에도 없었다**(7-R 리뷰어 [①-a] · #25).
  // 실제로 돌려 보니 반대다(`confirm_rules.json`의 `angle_vs_far`, 240구도·같은 잡음·같은 시드):
  // **각차 최소 0/240 · 거리 최대 31/240.** 지시문이 적은 "각도 유사도"가 맞다.
  //
  // 기전: `far`는 각차뿐 아니라 **두 선 사이의 간격**에도 비례한다(간격 ÷ sinΔθ) — 같은 각차라도
  // 멀리 떨어져 그은 짝이 이긴다(7-R [①-c] · #24: 단위를 바꾸는 것과 판정을 바꾸는 것은 다르다).
  // "소실점은 멀다"(11 머리말)는 성질은 `beyondSegment`와 `isFiniteVp`가 이미 지킨다.
  //
  // ⚠⚠ **이 정렬 자체는 그 픽스처에서 아무것도 안 바꿨다** — 두 정렬 모두 구현 틀림이
  // **7/120 · 대조 24/120**으로 같다(직접 확인했다). 남은 격차의 출처는 ④가 아니라
  // **후보 문**이다: 참 짝이 `beyondSegment`에 4/120 걸린다(`angle_vs_far.true_pair_gate`).
  // 그럼에도 이 기준으로 두는 이유는 ① 지시문이 명시한 양이고 ② 독립 선택자 비교에서
  // 각차 0/240 · 거리 14/240이며 ③ `far`가 간격에 오염된 양이기 때문이다(#24).
  // 후보 문을 무르는 것은 AS-L28(무잡음 15 → 3)을 되돌리는 일이라 안 한다 — `DEFERRED`.
  // 나머지는 `rest`로 나가 **두 번째 소실점**이 된다.
  const c = [...cands].sort((a, b) => a.sep - b.sep || b.far - a.far)[0];
  return { at: c.at, support: c.members.length, members: c.members, rest: restOf(c) };
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
/**
 * @param forced 사용자가 **물음에 답한 것**. 모든 판정을 건너뛴다.
 * @param hint   **커서가 이미 가른 것**(2026-08-18 8차 지시 2-b). `forced`와 다르다 —
 *   **애매 구간(`ambiguous`) 한 자리에만** 쓰이고 **`p1_guard`는 안 건드린다.**
 *
 *   지시 2-b: "모호 판정은 두 축이 화면에서 겹칠 때만이고, 그것도 **커서 위치로 가르므로
 *   물음이 아니라 조작이다.**" 앱의 2D 경로(`resolve2dCore`)가 이미 그 규칙을 갖고 있다 —
 *   화면 직교와 소실점 방향 중 **끝점 이동량이 작은 쪽**이 이긴다. 그 답을 여기 넘긴다.
 *
 *   ⚠⚠ **`snapForced`(D-L70)의 부활이 아니다.** 그것이 위험했던 이유는 `stepRule`의
 *   **P1 가드를 건너뛰어** 불가역 전이를 조용히 통과시킨 것이고(축 오차 10.1° → 31.6° 붕괴),
 *   `hint`는 **가드에 안 닿는다** — 애매 구간에서만 읽히고 가드는 그대로 묻는다.
 *   그 분리가 가능해진 것은 물음에 `site`가 붙었기 때문이다(지시 2-a).
 */
export function stepRule(
  st0: RuleState, line: RLine, imgSize: [number, number],
  forced?: "screen" | "depth", cfg: RuleCfg = {},
  hint?: "screen" | "depth",
): StepResult {
  const c = { ...RULE_TOL, ...cfg };
  const st = cloneRuleState(st0);
  const v = classifyLine(line.a, line.b, cfg);
  if (v.kind === "degenerate") return { state: st0, event: { type: "rejected", why: "선이 한 점이다" } };

  // ⛔ **`forced === "vertical"` 분기를 지웠다**(2026-08-18 7차 지시 3-b).
  //
  // **3점은 시점의 성질이지 그리는 선의 종류가 아니다**(지시 3 머리말). 3점 투시는 2점이
  // 서 있는 상태에서 **카메라를 기울여야** 나오고, 그 기울인 시점에서는 `viewPlaceCtx`가
  // 세 축의 방향을 전부 들고 있으므로 **축 스냅의 후보가 하나 늘 뿐 기전이 같다**(지시 3-b).
  // 그래서 "이 선이 수직축입니까"라고 물을 이유가 없다 — **기울어진 선은 항상 깊이선이다.**
  // 함께 사라진 것: `RuleState.verticalLines` · `tiltedVerticals` · `wantsTiltedVertical` ·
  // `deriveVertical`(수심 유도의 마지막 잔재) · P2 → P3 승격(지시 3-d).
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
    // **커서가 이미 갈랐으면 묻지 않는다**(8차 지시 2-b) — 모호 판정은 **조작**이지 물음이 아니다.
    // ⚠ 이 가지에만 쓰인다. 아래 P1 가드는 `hint`를 안 본다(D-L70의 결함을 안 되살린다).
    if (hint) kind = hint === "screen" ? (v.toH <= v.toV ? "screen_h" : "screen_v") : "depth";
    else {
      return { state: st0, event: { type: "ask", question: "screen_or_depth",
                                    site: "ambiguous", verdict: v } };
    }
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
      return { state: st0, event: { type: "ask", question: "screen_or_depth",
                                    site: "p1_guard", verdict: v } };
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
    // ⛔ **"두 번째 수평축입니까, 수직축입니까" 물음을 지웠다**(7차 지시 3-b).
    // **기울어진 선은 항상 깊이선이다.** 3점 시점의 수직축은 카메라를 기울였을 때 생기고
    // 그때는 축 스냅이 알아서 고른다(위 `forced === "vertical"` 자리의 설명).
    // 남는 물음은 화면 가로세로 대 깊이(`screen_or_depth`) 하나뿐이다 — 그것은 **차수를
    // 정하는 물음이 아니라** 4~8° 애매 구간의 판정이다.
    if (!target) {
      // ⛔ **거리점 획득을 지웠다**(2026-08-17 지시 2) — 대각선이 거리점인지 2점 승격인지
      // 기하로 구분 불가다. P1의 f는 임의값이다(`perspectiveOrder` 머리말).
      // 축을 안 향하는 깊이선은 카메라에 안 들어간다 — 획 자체는 문서에 남는다.
      // ⚠ **세 번째 방향은 잘못 그은 것이다**(6차 지시 11-3): 투시도에서 수평 축은 둘뿐이고,
      // 셋째 방향이 나오면 하나가 의도와 다르게 나간 것이다. **대기시키지 말고 알린다** —
      // 셋을 다 살려 두면 어느 것이 틀렸는지 모른 채 계속 쌓인다.
      return { state: st0, event: { type: "rejected",
        why: order === 1
          ? "기존 소실점을 향하지 않는 깊이선입니다 — 1점 확정 뒤의 깊이선은 그 소실점을 향해야 합니다"
          : "**이 선이 어긋납니다** — 두 소실점 어느 쪽도 향하지 않습니다."
            + " 지우고 다시 그으세요 <span class=\"dim\">(수평 축은 둘뿐입니다)</span>",
        notify: order !== 1 } };
    }

    // ---- b. 첫 유한 수평 소실점이 아직 없다 — **그린 선끼리의 교점**으로만 선다(지시 3-a).
    //
    // ⚠⚠ **확정은 세 번째 선이 한다**(2026-08-18 6차 지시 11 — `resolvePool` 머리말).
    // 옛 판은 대각선 둘의 교점을 곧바로 받았고, 그래서 **2점을 그리려던 것이 1점으로 굳었다.**
    if (finiteHorizontals(st).length === 0) {
      const pool = st.depthLines ?? (st.depthLines = []);
      pool.push({ a: [line.a[0], line.a[1]], b: [line.b[0], line.b[1]] });
      // ⚠⚠ **8차 항목 1-a가 이 조건을 죽였다.** 옛 판은 `order === 1`이면 두 선으로 정했고
      // ("화면 가로축이 이미 서 있으면 깊이축은 하나뿐이다"), P1이 **가로선만으로** 섰으므로
      // 그 지름길이 실제로 자주 열렸다. 이제 P1은 **깊이 소실점이 있어야** 서므로
      // (`perspectiveOrder`) **유한 수평 소실점이 0인 이 가지에서 order는 1일 수 없다.**
      // 그래서 **언제나 세 번째 선을 기다린다** — 화면 가로선이 기록돼 있어도 마찬가지다.
      // 그것이 지시 1-a의 "깊이 소실점이 없으면 축만 기록하고 대기"다(D-L69의 기본 경로).
      const unambiguous = false;
      const got = resolvePool(pool, imgSize, unambiguous, cfg);
      if (!got) return { state: st, event: { type: "waiting", have: pool.length } };
      st.slots[target.index] = { kind: "vp", at: got.at, source: "two_lines",
                                 support: got.support };
      // **소실점이 지평선을 정한다**(롤 0 — y가 지평선이다, D-L59 ②)
      st.horizon = got.at[1];
      // **모이지 않은 나머지가 두 번째 축이다**(지시 11-1 넷째 줄) — 그 선과 지평선의 교점.
      // 각차가 가장 큰 것을 고른다(교점의 조건수가 가장 좋다 — `sepDeg`, 기존 수단 #17).
      let second: { i: 0 | 1; at: Pt2; fov: FovVerdict } | null = null;
      // **두 번째 축이 화각 게이트에 걸린 것도 알린다**(7차 지시 2-3·4-c) — 옛 판은 조용히
      // 1점으로 남겼고, 그러면 사용자는 **2점을 그렸는데 1점이 됐다**는 것을 모른다.
      let secondRejected: FovVerdict | null = null;
      // **모이지 않은 나머지가 두 번째 축이면 잠정 가로축을 밀어낸다**(8차 지시 1-d).
      //
      // 빈 슬롯이 없고 남은 하나가 **화면 가로축 기록**이면, 그 기록은 카메라가 서기 전에
      // 적힌 **잠정**이다(지시 1-a: "깊이 소실점이 없으면 축만 기록하고 대기"). 여기서
      // 두 축이 한 번에 정해지면 그 잠정은 **틀린 읽기였던 것**이므로 밀어낸다 —
      // 밀어내지 않으면 슬롯이 차서 **P2가 도달 불가**가 되고, 그것이 `screen_h` 497/600의
      // 두 번째 층이었다. ⚠ **P1이 이미 선 뒤에는 여기 안 온다**(그때는 유한 수평 소실점이
      // 있어 위 `finiteHorizontals(st).length === 0` 가지에 못 들어온다) — **P1은 여전히
      // 불가역이다**(D-L53). 밀어낸 사실은 사건에 실어 **알린다**(A-3: 조용히 바꾸지 않는다).
      const emptyOther = horizontalTargetAfter(st, target.index);
      const tentativeH = ([0, 1] as const).find(
        i => i !== target.index && st.slots[i]?.kind === "screen");
      const other = emptyOther ?? tentativeH ?? null;
      const displacedScreenH = emptyOther == null && tentativeH != null;
      if (other != null && got.rest.length) {
        const cand = got.rest
          .map(k => ({ k, at: vpOnHorizon(repOfLine(pool[k]), st.horizon) }))
          .filter((x): x is { k: number; at: Pt2 } => !!x.at && isFiniteVp(x.at, imgSize))
          .sort((a, b) => sepDeg(pool[b.k], pool[a.k]) - 0)[0];
        if (cand) {
          const fov = fovGate(got.at, cand.at, imgSize);
          if (fov.band !== "reject") {
            st.slots[other] = { kind: "vp", at: cand.at, source: "horizon_x_line", support: 1 };
            second = { i: other, at: cand.at, fov };
          } else {
            secondRejected = fov;
          }
        }
      }
      st.depthLines = [];
      return { state: st,
               event: second
                 ? { type: "vp_fixed", axis: second.i, at: second.at,
                     source: "horizon_x_line", horizonSet: true, fov: second.fov,
                     ...(displacedScreenH ? { displacedScreenH: true } : {}) }
                 : { type: "vp_fixed", axis: target.index, at: got.at,
                     source: "two_lines", horizonSet: true,
                     // 두 번째 축이 화각에 걸렸으면 그 판정을 실어 보낸다 — 부르는 쪽이 알린다
                     ...(secondRejected ? { fov: secondRejected } : {}),
                     paired: { a: [pool[got.members[0]].a[0], pool[got.members[0]].a[1]],
                               b: [pool[got.members[0]].b[0], pool[got.members[0]].b[1]] } } };
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
    // ---- **화각 게이트**(6차 지시 7-b, 이론서 18.4). 여기가 **2점이 서는 유일한 자리**다 —
    // 첫 소실점(b·찍기)만으로는 f가 없으므로 잴 것이 없고, 3점의 수직 소실점은 이 문을 지난
    // 두 수평 소실점 위에 얹힌다. **막는 것은 f² ≤ 0 하나뿐이다**(서 있을 수 없는 카메라).
    const other = finiteHorizontals(st)[0];
    const fov = fovGate(other.at, p, imgSize);
    if (fov.band === "reject") {
      return { state: st0, event: { type: "rejected", why: fov.why, fov, notify: true } };
    }
    st.slots[target.index] = { kind: "vp", at: p, source: "horizon_x_line", support: 1 };
    return { state: st,
             event: { type: "vp_fixed", axis: target.index, at: p,
                      source: "horizon_x_line", horizonSet: false, fov } };
  }

}

// ⛔ **`tiltedVerticals`·`clearlyTilted`·`wantsTiltedVertical`·`deriveVertical`을 지웠다**
// (2026-08-18 7차 지시 3-b·3-c).
//
// 세 세대가 이 자리에 겹쳐 있었다: ① 수심 유도(이론서 6.3 — 지평선 높이가 곧 3점 여부가 되어
// **도구가 피치를 정했다**) ② A-4의 "기울어진 수직선을 사용자가 선언한다"(물음이 생겼다)
// ③ **지금 — 아무것도 안 한다.** 3점은 **카메라를 기울인 시점의 성질**이고, 그 시점에서
// `viewCamera.viewPlaceCtx`가 세 축 방향을 전부 낸다. 확정 카메라의 수직축은 화면 수직으로
// 남고(롤 0 · 피치 0), 기울인 시점에서 수직축의 소실점이 화면 안으로 들어온다.
// 지시 3-c: "세 번째 소실점을 수심으로 유도할 필요가 없다. 카메라가 이미 있으므로
// 피치에서 계산된다."
//
// ⚠ `Slot.source`의 `"tilted_vertical"`·`"orthocenter"`는 **옛 저장본을 여는 데 남긴다** —
// 그 값으로 저장된 슬롯은 그대로 읽히고 `perspectiveOrder`가 3을 낸다(아래 머리말).

// ---------------------------------------------------------------- 점 찍기 확정 (4차 지시 4-b)

/**
 * **대각선 하나 위의 한 점을 찍어 소실점을 확정한다**(4차 지시 4-b의 둘째 경로).
 *
 * 대기 깊이선(`depthLines`) 위의 점(근처점) 또는 대기 깊이선끼리의 교차점을 사용자가
 * 톡 찍으면 **그 자리가 첫 소실점**이다 — 두 선의 교점 경로(D-L59)와 달리 선 하나로도
 * 확정할 수 있고, 어느 자리인지를 사용자가 정한다(옛 누산기의 "점 찍기 = 소실점 확정"
 * 제스처와 같은 자유도 회계 — 이론서 5.3, 점 하나가 자유도 2를 먹는다).
 *
 * ```
 * 후보   ① 대기 선끼리의 교차점(우선 — 정확한 것이 앞선다, SNAP_ORDER의 순서 그대로)
 *        ② 대기 선 위로의 수직 투영(근처점)
 * 반경   `tolPx`(앱 오스냅 조리개를 그대로 넘긴다, #17)
 * 귀결   소실점 = 그 점 · 지평선 = 그 y(롤 0) · 대기 선 중 그 점을 향하는 것은 지지선
 * ```
 *
 * 첫 유한 수평 소실점이 이미 있으면 아무것도 안 한다(`null`) — 소실점은 확정 후 잠긴다(§1).
 */
export function pickVpAt(
  st0: RuleState, p: Pt2, imgSize: [number, number], tolPx: number,
): { state: RuleState; at: Pt2 } | null {
  if (finiteHorizontals(st0).length > 0) return null;
  const pool = st0.depthLines ?? [];
  if (!pool.length) return null;
  const pad = 0.02;                                     // 선분 밖 여유 — snap.ts extend_ratio와 같은 값(#17)
  // ① 교차점 — 대기 선끼리 화면에서 가로지르는 자리(끝점 이음 제외는 stepRule과 같은 규약)
  let best: { at: Pt2; d: number; rank: 0 | 1 } | null = null;
  const consider = (at: Pt2, rank: 0 | 1) => {
    const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
    if (d > tolPx) return;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { at, d, rank };
  };
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const at = lineIntersect(pool[i].a, pool[i].b, pool[j].a, pool[j].b);
      if (at && isFiniteVp(at, imgSize)) consider(at, 0);
    }
    // ② 근처점 — 그 선 위로의 수직 투영(연장 여유는 선분 길이 대비)
    const q = pool[i];
    const dx = q.b[0] - q.a[0], dy = q.b[1] - q.a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) continue;
    const t = ((p[0] - q.a[0]) * dx + (p[1] - q.a[1]) * dy) / L2;
    if (t < -pad || t > 1 + pad) continue;
    consider([q.a[0] + t * dx, q.a[1] + t * dy], 1);
  }
  if (!best) return null;
  const at = (best as { at: Pt2 }).at;
  if (!isFiniteVp(at, imgSize)) return null;
  const st = cloneRuleState(st0);
  const target = horizontalTarget(st);
  if (!target) return null;
  st.slots[target.index] = { kind: "vp", at: [at[0], at[1]], source: "picked_point", support: 0 };
  // **소실점이 지평선을 정한다**(롤 0 — D-L59 ②와 같은 자리)
  st.horizon = at[1];
  // 그 점을 향하는 대기 선은 지지선이다 — 찍은 자리가 그 선 위면 정의상 지지한다
  let sup = 0;
  for (const q of st.depthLines ?? []) {
    const len = Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
    if (len < 1e-9) continue;
    if (vpMisfit({ a: q.a, b: q.b, len, bend: 0 }, at) <= AXIS_TOL.vp_dist_ratio) sup += 1;
  }
  (st.slots[target.index] as { support: number }).support = Math.max(1, sup);
  st.depthLines = [];
  return { state: st, at };
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
