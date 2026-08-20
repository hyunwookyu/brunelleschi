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
   * ⚠⚠ **그 대푯값이 12차 보고로 흔들렸다**(2026-08-18 12차 항목 5): 두 표본 보고의 같은
   * 지표가 **Δ0.00~20.80°**로 퍼졌다(`real_ink.json`의 `reported_samples_12` — 사람 보고).
   * 갈랐을 후보는 셋이고 전부 12차가 손댄 자리다 — ① 화각 163° 카메라의
   * angleWiden 폭발(항목 1 상한이 거부) ② 무앵커 무스냅 경로(항목 2가 배선) ③ rank_margin
   * 완화 배정(불변).
   * ⛔ **2026-08-19 파일 도착 — 충돌이 분해됐다**(13차 항목 4 · `delta_conflict.json@f351839a`):
   * ① angleWiden과 ③ rank_margin은 **실측으로 기각** — 163° 파일에서 widen을 꺼도(angle_relax
   * 0 개입 팔) 배정이 같고 relative 배정도 0이다(도달 가능성은 `widen_positive_arm`이 증명).
   * 최상위 꼬리의 실제 기전은 **지표의 근접 퇴화(지렛대 증폭)**다: 원시 시작점의 손떨림
   * 이탈 ÷ 소실점 거리의 지렛대각이 Δ를 지배한다(`per_stroke`의 `start_off_fit_px`·
   * `jitter_lever_deg` ≈ `vp_dir_err_deg` — 값은 그 원장 행이 든다 #47).
   * real_ink의 `near_vp_degenerate` 표식·`vp_dir_err_deg_stable`이 그 행을 가른다 —
   * ⚠ 표식은 **극단 카메라 전용이 아니고**(13차 4-R [B-2] 정정 — 98° 파일 행에도 붙는다)
   * 표식 행의 Δ는 어느 결론에도 겨냥 증거로 안 쓴다. 두 표본의 차이는 카메라 품질(소실점
   * 근접 → 지렛대 증폭)로 설명되고(지시 4-c), ②(무앵커 무스냅) 겨냥의 실측 모집단은
   * `vp_dir_err_deg_stable_no_snap`(현재 n=1 — 사거리 밖 겨냥의 실증은 표본 부족 미결.
   * 4-R [B-4]로 초판의 "잔여 Δ 7~12.8 = 사거리 밖 몫" 철회 — 그 행들은 표식·스냅 행이다).
   * "Δ0.0~1.7"은 애초에 선택 인용이었다.
   * 이 값(3)은 그 실측으로도 조정하지 않는다(#12·#26: 스윕 없이 임계를 안 움직인다).
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
 * 그 외         전부 유효 — 대역(ok/warn/severe)은 **참고 진단**이고 판정이 아니다
 * ```
 *
 * ⛔⛔ **화각 상한(`reject_fov_deg` 120°)은 2026-08-19 14차 지시 1로 제거됐다**(D-L93 —
 * 12차 지시 1-c를 지시가 스스로 되돌렸다): 상한은 임의 기준이었고 근거가 없다. **거부는
 * f² ≤ 0만이다** — 수학적으로 카메라가 존재하지 않는 경우, 물리적 한계이고 그 위로는
 * 전부 유효하다. 극단적으로 넓게 그리는 것은 결함이 아니라 선택이다(광각 실내·어안 느낌은
 * 건축 드로잉의 상용 수단). 화각 **경고 표시도 함께 제거됐다**(지시 1-b — 결과는 돌려보면
 * 즉시 보이고, 상태 표시를 없앤 결정과 일관) — 아래 대역은 원장·진단이 읽는 **참고**로만
 * 남는다(지시 1-d — 이론서 18.4의 기준은 판정이 아니라 참고다).
 *
 * ⚠ **3점에도 같은 게이트가 든다** — 3점의 수평 소실점 둘은 이 문을 이미 지나서 섰다
 * (수직 소실점은 그 뒤에 `deriveVertical`이 얹는다). 예각 조건(6.5, f²<0)은 `recoverCamera`가
 * 별개로 본다 — **화각과 다른 양이다**(지시 7-d).
 */
export const FOV_GATE = {
  /**
   * **참고 대역**(판정 아님 — 위 머리말): f/W가 이 배수 미만이면 화각 90° 초과(severe).
   * `2·atan((W/2)/f) = 90°` ⟺ `f = 0.5·W`(이론서 18.4).
   */
  severe_f_ratio: 0.50,
  /** **참고 대역**: 이 배수 이상이면 화각 60° 이하(ok). `f = 0.866·W`. */
  ok_f_ratio: 0.87,
} as const;

export type FovBand = "ok" | "warn" | "severe" | "reject";

export interface FovVerdict {
  band: FovBand;
  /** 두 소실점 사이 화면 거리(px). */
  d: number;
  /** `d / W` — 대역을 가르는 양. */
  dOverW: number;
  /**
   * 6.2의 f(= 시거리). `null`이면 f² ≤ 0(주점이 사이에 없다).
   * ⚠ **`reject`여도 f가 있을 수 있다**(12차 지시 1-c) — 화각 상한 거부는 f² > 0에서 난다.
   */
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
  const [W] = imgSize;
  const d = Math.hypot(v1[0] - v0[0], v1[1] - v0[1]);
  const dOverW = W > 0 ? d / W : 0;
  // **주점 = [W/2, 지평선 y]**(2026-08-19 14차 지시 2-a·2-b · D-L95).
  //
  // ⛔ 옛 판은 주점을 화면 중앙 [W/2, H/2]로 놓고 지평선과의 세로 어긋남을
  // `f² = −Δx₁Δx₂ − h²`의 h²로 벌점화했다 — 그래서 **지평선이 화면 중앙에서 멀면
  // 거부됐고**, 안내문이 "지평선이 화면 중앙에서 너무 멀지 않게"를 조건으로 말했다.
  // 둘 다 틀렸다: **2점 투시는 피치 0이고 주점은 지평선 위에 있다** — 주점 y는 지평선이
  // 준다(이론서 3.1 — 지평선 높이는 시선 높이다. 낮거나 높은 시점을 그리면 지평선이
  // 화면 중앙에서 벗어나는 것이 당연하고, 그것은 구도 선택이지 제약이 아니다).
  // **앱의 실제 카메라가 이미 이 규약이다**(#17): `ConstraintAccumulator.solve`가
  // 주점을 [W/2, 지평선 y]로 세우고, `real_ink`의 per_doc 유도도 같다 — 이 게이트만
  // 다른 규약이라 판정과 카메라가 어긋났다(delta_conflict의 principal_convention이
  // 그 어긋남을 병기하고 있었다 — 이 수리로 규약이 하나가 된다).
  // 두 소실점은 롤 0으로 같은 지평선 위이므로 h = 0이고 `f² = (pₓ−lo)(hi−pₓ)`다.
  // 주점 **x = W/2는 남는 가정**이다(이론서 16.2 · AS-C5 — 2점의 자유도 1을 그렇게
  // 소진한다. 새 가정이 아니라 이 저장소의 2점 경로 전부가 쓰는 그 가정이다).
  const px = W / 2;
  const lo = Math.min(v0[0], v1[0]), hi = Math.max(v0[0], v1[0]);
  const f2 = (px - lo) * (hi - px);
  if (!(f2 > 0)) {
    // **안내는 기하의 사실만 말한다**(지시 2-d) — 화면 중앙도 지평선 위치도 조건으로
    // 말하지 않는다. f² ≤ 0 = 두 소실점이 (가정된) 시선의 같은 쪽에 있다 = 서로 직교하는
    // 두 가로 축이 아니다.
    return { band: "reject", d, dOverW, f: null, fOverW: null, fovDeg: null,
             why: "**서 있을 수 없는 시점입니다** — 두 소실점이 시선의 같은 쪽에 모여"
                + " 있습니다(f² ≤ 0, 이론서 6.2). 직교하는 두 가로 축의 소실점은 서로"
                + " 반대쪽으로 물러나야 합니다 — 한 축의 깊이선 기울기를 반대쪽으로"
                + " 트세요" };
  }
  const f = Math.sqrt(f2);
  const fOverW = W > 0 ? f / W : 0;
  const fovDeg = (2 * Math.atan((W / 2) / f) * 180) / Math.PI;
  // **대역은 참고 진단이다**(14차 지시 1 · D-L93) — 확정도 표시도 안 가른다. `why`는
  // 전부 빈 문자열이다: 화각 경고는 지시 1-b로 제거됐다(넓은 화각은 의도일 수 있다).
  const band: FovBand = fOverW < c.severe_f_ratio ? "severe"
                      : fOverW < c.ok_f_ratio ? "warn" : "ok";
  return { band, d, dOverW, f, fOverW, fovDeg, why: "" };
}

export interface RLine { a: Pt2; b: Pt2 }

/** 축 슬롯 하나. 0·1은 수평(지평선 위), 2는 수직 — `PlaceCtx.vps`의 관례와 같다. */
export type Slot =
  /** 화면 평행 축 — 소실점이 무한원이다(c=0). `dir`이 화면에서의 방향이다. */
  | { kind: "screen"; dir: "h" | "v"; support: number;
      /**
       * **의도 선언이었는가**(2026-08-19 14차 항목 3 · D-L96 — D-L89의 연장): 직교
       * 스냅이 잡았거나(hint "screen" — 사용자가 스냅을 보고 받아들였다) 물음에
       * "화면"이라 답한(forced) 가로축만 true다. 얕은 참-깊이선의 **우연 분류**(≤4°,
       * 무스냅 하네스 경로)는 undefined로 남는다 — 그 구분이 unambiguous(깊이선 둘
       * 확정)의 문이다: 우연 분류에 그 문을 열면 2점을 그리려던 것이 1점으로 굳는다
       * (무잡음 합성에서 31.6° 붕괴로 실측). 옛 저장본에는 이 키가 없다(= 미선언).
       */
      declared?: boolean;
      /**
       * **1점 확정이 자동으로 채운 축인가**(2026-08-20 18차 지시 3 · D-L109).
       *
       * 첫 깊이선이 소실점을 만들면 남는 수평축은 정의상 **화면 평행**이다(1점).
       * 그 슬롯을 여기서 채워 두어야 `axisDirsOf`가 방향을 내고 **화면 가로선이 올라간다**.
       * 그런데 그것은 **사용자의 선언이 아니다** — 두 번째 깊이선이 오면 밀어낸다(2점 승격).
       * `declared`(사용자가 스냅으로 그은 가로선)는 **안 밀어낸다**: 그 구분이 D-L53이
       * 막았던 «조용히 1점에 가둔다»를 그대로 막는다.
       */
      implicit?: boolean }
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
   * **지평선 높이(화면 y) — 사용자가 긋는다.**(2026-08-20 18차 지시 · D-L109)
   *
   * ⚠⚠ **`null`은 "아직 안 그었다"이고 그것이 첫 상태다.** 옛 판은 화면 중앙을 기본값으로
   * 두고 «계산으로» 냈다(`defaultHorizon`). 새 절차에서는 **긋는 것이 첫 동작**이고
   * 기본 위치를 두지 않는다(지시 j) — 손으로 투시도를 그릴 때도 시선 높이를 먼저 정한다.
   *
   * 그 뒤 **깊이선 하나가 소실점 하나를 만든다**: 소실점 = 그 선 × 이 지평선(지시 2·3).
   * **판정이 아니라 계산이다** — 대기도, "둘이 같은 축인가"도 없다(11-1·11-2·11-3 폐기).
   *
   * 롤은 0이다 — 지평선을 화면 수평으로 강제하므로(지시 j) y 하나로 표현된다.
   * 확정 후에는 잠긴다(D-L45) — `horizonAdjustable`.
   */
  horizon: number | null;
}

// ⛔ **`defaultHorizon`을 지웠다**(2026-08-20 18차 지시 j — "기본 위치를 두지 않는다").
// 지평선은 **사용자가 긋는 것**이고, 긋기 전에는 `null`이다. 기본값을 두면 «이미 있는 것»이
// 되어 첫 동작이 사라진다.

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

/** **지평선을 그었는가** — 그리기가 열리는 조건이다(지시 l). 계산이지 상태가 아니다. */
export const hasHorizon = (st: RuleState): boolean => typeof st.horizon === "number";

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

export function newRuleState(_imgSize: [number, number] = [960, 672]): RuleState {
  // **지평선은 아직 없다**(지시 j) — 사용자가 긋는 것이 첫 동작이다.
  return { slots: [null, null, screenVerticalSlot()], horizon: null };
}

export function cloneRuleState(s: RuleState): RuleState {
  return {
    // ⚠ **깊은 사본이어야 한다.** `{...x}`만 하면 `at` 배열이 **공유되고**, 그러면
    // 되돌리기 스냅샷이 나중의 편집에 딸려 움직인다(`promoteDiff.test.ts`가 잡았다).
    slots: s.slots.map(x =>
      (x ? (x.kind === "vp" ? { ...x, at: [x.at[0], x.at[1]] as Pt2 } : { ...x }) : null),
    ) as RuleState["slots"],
    horizon: s.horizon,
  };
}

/** 유한 수평 소실점만 — 인덱스와 자리. */
const finiteHorizontals = (st: RuleState): { i: 0 | 1; at: Pt2 }[] =>
  ([0, 1] as const).flatMap(i => {
    const s = st.slots[i];
    return s && s.kind === "vp" ? [{ i, at: s.at }] : [];
  });

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
       *   `ambiguous` — ⛔ **2026-08-18 12차 지시 4-a(D-L89)로 더는 안 난다** — 애매 구간
       *                 (4~8°)은 묻지 않고 **깊이선으로 확정**한다(스냅 없이 나온 대각선은
       *                 깊이선이다). 값은 옛 저장 사건·유형 구분을 위해 남긴다.
       *   `p1_guard`  — 소실점이 이미 선 상태의 화면 수평선. 애매해서가 아니라
       *                 **불가역 전이를 조용히 통과시키지 않으려고** 묻는다(D-L53).
       *                 ⚠ D-L89로 **스냅이 잡은 가로선(hint "screen")은 통과**한다 —
       *                 남는 물음은 스냅이 안 걸린 가로선뿐이다.
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

// ⛔⛔ **대기 규칙 전체를 지웠다**(2026-08-20 18차 지시 a·b·c — 새 절차).
//
// 사라진 것: `PoolPick` · `poolCandidates` · `resolvePool` · `PoolVerdict` ·
// `resolveDeclaredPool` · `beyondSegment` · `insideSegment` · `convergeDeg` ·
// `horizontalTargetAfter` · `RuleState.depthLines`.
//
// **왜 통째로 없어지나**: 그 기계 전부가 «대각선 둘의 교점을 소실점으로 읽어도 되는가»를
// 푸는 것이었다 — 어느 둘이 같은 축인지 모르므로 셋째 선을 기다리고(11-1), 이음점을
// 소실점으로 오독하지 않으려 문을 달고(11-2), 셋이 다 다르면 각차 최소로 짝을 골랐다(11-3).
// **지평선을 먼저 그으면 그 물음이 아예 없다**: 소실점 = 그 선 × 지평선이고 **선 하나가
// 소실점 하나를 만든다.** 판정이 아니라 계산이다.
//
// ⚠ 그 규칙들이 없던 것이 되는 것은 아니다 — **왜 있었는지가 근거다**(PITFALLS 머리말).
// 폐기 사유는 `DECISIONS.md`의 D-L109가 든다. 옛 판의 실측(각차 최소 vs 거리 최대 —
// D-L72의 `confirm_rules.json@angle_vs_far`)도 그 결정에 매여 함께 은퇴한다.

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
    // **커서가 이미 갈랐으면 그것을 쓴다**(8차 지시 2-b) — 모호 판정은 **조작**이지 물음이 아니다.
    //
    // ⛔⛔ **물음(site "ambiguous")을 지웠다**(2026-08-18 12차 지시 4-a — D-L89).
    // "화면에 나란합니까 안으로 들어갑니까"는 성립하지 않는 물음이다:
    //   · 화면에 나란한 선은 **스냅이 잡는다**(직교 스냅 ≤ screen_axis_deg → hint "screen") —
    //     붙은 것은 묻지 않는다.
    //   · 2D로 두려면 **주석 채널**로 그린다 — 채널이 이미 그 역할이다(D-3).
    //   · 그러므로 **스냅 없이 나온 대각선은 깊이선이다.** 7차의 "기울어진 선은 항상
    //     깊이선이다"(D-L74)를 4~8° 애매 구간까지 넓힌 것이다.
    // 실측 배경(사람 보고): 물음이 문구만 바뀌고 남아 asked 3/13·3/11이었다.
    kind = hint ? (hint === "screen" ? (v.toH <= v.toV ? "screen_h" : "screen_v") : "depth")
                : "depth";
  }

  // ---- a. 화면 가로세로 선은 축 자체다 (무한원, 이론서 2.2)
  const screenIntent = forced === "screen" || hint === "screen";
  if (kind === "screen_h") {
    for (const i of [0, 1] as const) {
      const s = st.slots[i];
      if (s && s.kind === "screen" && s.dir === "h") {
        s.support += 1;
        if (screenIntent && !s.declared) s.declared = true;
        return { state: st, event: { type: "support", axis: i } };
      }
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
    // ⛔⛔ **P1 가드 물음(`screen_or_depth`)을 지웠다**(2026-08-20 18차 지시 d).
    //
    // 그 물음은 «이 선이 화면 가로축인가 깊이선인가»를 사람에게 넘긴 것이고, 그것이
    // 필요했던 이유는 **깊이선의 뜻이 선 하나로 안 정해졌기 때문**이다(교점을 만들 짝이
    // 있어야 했다). 새 절차에서는 **지평선이 그 답을 든다**: 지평선과 만나면 깊이선이고
    // 안 만나면(화면 평행) 축 자체다(지시 d·n). 물어볼 것이 남지 않는다.
    // ⚠ D-L53의 «P1은 불가역»도 여기서 끝난다 — 아래 c 가지가 **1점 → 2점 승격**을 연다.
    const free = ([0, 1] as const).find(i => !st.slots[i]);
    if (free === undefined) {
      return { state: st0, event: { type: "rejected",
        why: "수평 축이 이미 둘 다 정해졌습니다 — 이 선은 축이 아니라 그 축들 중 하나의 지지선입니다" } };
    }
    st.slots[free] = { kind: "screen", dir: "h", support: 1,
                       ...(screenIntent ? { declared: true } : {}) };
    // ⛔ **D-L96(확정 조건 완화)의 재해결을 지웠다**(지시 e) — 대기 풀 자체가 없다.
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

  // ---- **깊이선** — 지평선과의 교점이 소실점이다(새 절차, 지시 2·3).
  {
    const rep: Rep = { a: line.a, b: line.b,
                       len: Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]), bend: 0 };

    // ---- **깊이선 = 지평선과 만나는 선.** 소실점 = 그 교점이다(2026-08-20 18차 지시 2·3).
    //
    // **선 하나가 소실점 하나를 만든다. 판정이 아니라 계산이다.**
    // 지평선이 없으면 아무것도 못 한다 — 그리기 자체가 안 열리므로(지시 l) 여기는 마지막 방어다.
    if (st.horizon == null) {
      return { state: st0, event: { type: "rejected",
        why: "지평선을 먼저 그으세요" } };
    }
    const p = vpOnHorizon(rep, st.horizon);
    // **지평선과 안 만나면 화면 평행 축이다**(지시 n) — 없는 소실점을 지어내지 않는다.
    if (!p || !isFiniteVp(p, imgSize)) {
      return { state: st0, event: { type: "rejected",
        why: "지평선과 나란해 소실점이 안 생깁니다" } };
    }

    // ---- **이 선이 만든 점이 이미 있는 소실점인가** — **같은 단위로 잰다**(#49).
    //
    // ⚠⚠ 옛 판은 `vpMisfit`(수직거리 ÷ 길이)로 «기존 소실점을 향하는가»를 물었다.
    // 그런데 새 절차에서 소실점을 **정하는** 양은 `선 × 지평선`이다 — 판정을 정하는 양과
    // 다른 단위로 조건을 걸면 조여도 느슨해도 엉뚱한 곳을 자른다(#49의 그 형태).
    // 그래서 **그 선이 만든 점과 이미 있는 점의 거리**로 가른다. 임계는 새로 만들지 않고
    // 오스냅의 «두 점이 같은 점인가»(`SNAP_TOL.merge_ratio`)를 그대로 쓴다(#17).
    const mergePx = SNAP_TOL.merge_ratio * Math.hypot(imgSize[0], imgSize[1]);
    for (const { i, at } of finiteHorizontals(st)) {
      if (Math.hypot(p[0] - at[0], p[1] - at[1]) <= mergePx) {
        (st.slots[i] as { support: number }).support += 1;
        return { state: st, event: { type: "support", axis: i } };
      }
    }
    // **수직축이 유한 소실점이면 그쪽도 본다**(15차 항목 2 · D-L100의 나머지 절반).
    // 그 축은 지평선 위에 없으므로 위 거리 판정이 못 잡는다 — 각으로 잰다(그 축을 정하는 양).
    {
      const s2 = st.slots[2];
      if (s2 && s2.kind === "vp" && vpMisfit(rep, s2.at) <= AXIS_TOL.vp_dist_ratio) {
        s2.support += 1;
        return { state: st, event: { type: "support", axis: 2 } };
      }
    }

    // ---- **빈 수평 슬롯에 넣는다.**
    //
    // ⚠⚠ **1점 → 2점 승격이 여기서 열린다**(지시 3 — D-L53의 «P1 불가역»을 대체한다).
    // 첫 깊이선이 서면 슬롯 하나가 소실점이고 나머지 수평축은 **화면 평행**(1점)이다.
    // 두 번째 깊이선이 오면 그 화면 가로축을 **밀어내고** 소실점이 된다 — 2점이다.
    // 옛 판이 이 밀어내기를 막은 이유는 «손 오차로 얕아진 깊이 모서리가 조용히 가로선으로
    // 읽혀 그림을 1점에 가둔다»였는데(D-L53), 새 절차에서 그 화면 가로축은 **사용자가
    // 선언한 것이 아니라 1점 확정이 자동으로 채운 것**이다(`implicit`). 선언된 가로축
    // (`declared` — 사용자가 스냅으로 그은 것)은 **그대로 안 밀어낸다.**
    const target = horizontalTarget(st);
    let index: 0 | 1;
    if (target) {
      index = target.index;
    } else {
      const implicitH = ([0, 1] as const).find(i => {
        const sl = st.slots[i];
        return sl != null && sl.kind === "screen" && sl.dir === "h" && sl.implicit === true;
      });
      if (implicitH === undefined) {
        // **셋째 방향이다** — 수평 축은 둘뿐이다. 이 선은 카메라에 안 들어간다.
        // ⚠ 문구는 **한 줄**이다(지시 i) — 동작은 알림 막대가 붙인다(지시 f).
        return { state: st0, event: { type: "rejected",
          why: "이 선이 두 소실점 어디도 향하지 않습니다", notify: true } };
      }
      index = implicitH;
    }

    // ---- **화각 게이트**(이론서 18.4). 막는 것은 `f² ≤ 0` 하나다(D-L93).
    const other = finiteHorizontals(st)[0];
    if (other) {
      const fov = fovGate(other.at, p, imgSize);
      if (fov.band === "reject") {
        return { state: st0, event: { type: "rejected", why: fov.why, fov, notify: true } };
      }
      st.slots[index] = { kind: "vp", at: p, source: "horizon_x_line", support: 1 };
      return { state: st, event: { type: "vp_fixed", axis: index, at: p,
                                   source: "horizon_x_line", horizonSet: false, fov } };
    }
    // **첫 소실점이다 — 1점이 선다.** 남는 수평축은 화면 평행이고, 그것을 여기서 채운다.
    // 채우지 않으면 `axisDirsOf`가 그 축을 `null`로 내어 **화면 가로선을 못 올린다**.
    st.slots[index] = { kind: "vp", at: p, source: "horizon_x_line", support: 1 };
    const rest = (index === 0 ? 1 : 0) as 0 | 1;
    if (!st.slots[rest]) {
      st.slots[rest] = { kind: "screen", dir: "h", support: 0, implicit: true };
    }
    return { state: st, event: { type: "vp_fixed", axis: index, at: p,
                                 source: "horizon_x_line", horizonSet: false } };
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

// ⛔ **`pickVpAt`(점 찍기 확정)을 지웠다**(2026-08-20 18차 지시 a — 대기 풀 폐기의 귀결).
//
// 그 경로는 «대기 깊이선 위의 점을 찍어 소실점을 정한다»였고, 대기 풀이 그 재료였다.
// 새 절차에서는 **선 하나가 곧 소실점**이라 찍을 대상이 없다 — 사용자는 지평선을 긋고
// 깊이선을 긋는다. `Slot.source`의 `"picked_point"`는 **옛 저장본을 여는 데 남긴다**.

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
