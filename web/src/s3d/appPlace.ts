// **앱이 실제로 쓰는 배치 옵션 — 단 하나의 출처**(S-7 0).
//
// 왜 따로 두는가: §4.3 면 위 사선을 S-6 (2)가 측정해 놓고 **앱은 그 경로를 안 켜고 있었다**.
// `settle(drawn, ctx)`가 옵션 없이 불렸고, 아무도 몰랐다. 측정 하네스와 앱이 **각자
// 옵션 객체를 적는** 구조였기 때문이다 — 하나를 고쳐도 다른 쪽이 안 따라간다.
//
// ```
// 측정 하네스 ──┐
//               ├─→ 여기(한 곳) ─→ placeInto/settle
// 앱 main.ts ───┘
// ```
//
// **이것은 STALE과 같은 성격의 문제다.** 사람이 기억해서 잡을 종류가 아니므로
// `test/wiring.test.ts`가 기계로 잠근다 — 새 옵션이 생기면 아래 표에 등록해야 컴파일된다.
import { PLACE_TOL, type PlaceOpts } from "./stroke.js";
import { AXIS_TOL, type AxisCfg } from "./axis.js";

/**
 * **첫 시점**(왼쪽 캔버스)의 배치 옵션.
 *
 * - `farEndCheck` 정합성 검사. **첫 시점에도 켠다**(D-S16) — 틀린 앵커는 가림과 달리
 *   시점에 매이지 않는다. 검사 없이는 놓인 모서리의 12.4%가 크게 틀려 있었다.
 * - `facePlanes` 면 위 사선(§4.3, D-S14). 미분류 사선의 80~84%가 이 경로로 놓인다.
 * - `freeBendMax` 평면 경로는 **곧은 획에만**(D-S17). 두 경로의 검사가 다 끝점 둘만 보므로
 *   굽음은 검증되지 않는다. 판정의 `bend_max`를 그대로 쓴다.
 * - `freeSpan` 자유 곡선 폴백(D-S17). 곧은 획에 한정하면 배치율 0.53 → 0.67이고
 *   더 놓은 10획 중 크게 틀린 것이 없다.
 * - `retryAsFace` **0**(D-S16). 구제 143획 중 46획(32%)이 틀렸다.
 */
export const FIRST_VIEW_OPTS: PlaceOpts = {
  farEndCheck: PLACE_TOL.far_end_check,
  facePlanes: PLACE_TOL.face_far_end,
  freeBendMax: AXIS_TOL.bend_max,
  freeSpan: PLACE_TOL.span_far_end,
  retryAsFace: PLACE_TOL.retry_as_face,
};

/**
 * **돌린 시점**(3D 뷰 위에서 이어 그리기)의 배치 옵션.
 *
 * - `depthEnvelope`를 **더한다** — 가림은 시점에 달린 현상이고(D-S12), 정합성 검사를 못 쓰는
 *   자유단이 돌린 시점에서 38.5%까지 나온다(D-S13).
 * - **평면 경로(`facePlanes`·`freeSpan`·`freeBendMax`)는 뺀다.** 배선 점검에서 "같은 획이
 *   시점에 따라 갈리면 안 된다"는 이유로 켜려 했는데 **측정이 막았다**(D-S19):
 *   궤도 75°·110°에서는 회수가 0.61~0.74에 오차도 작지만(0.2 초과 1~5획),
 *   **궤도 45°에서는 놓인 것의 83%가 0.2를 넘는다**. 가림이 가장 심한 각이고,
 *   깊이 타당성을 평면 경로에 걸어도 안 듣는다(틀린 면도 앵커를 지난다).
 *   **각도에 따라 갈리는 것을 각도 모르고 켤 수 없다** — 돌린 시점의 사선은 `고치기`로 간다.
 */
export const VIEW_OPTS: PlaceOpts = {
  farEndCheck: PLACE_TOL.far_end_check,
  retryAsFace: PLACE_TOL.retry_as_face,
  depthEnvelope: PLACE_TOL.view_depth_envelope,
  requireFarEnd: true,
};

/**
 * **돌린 시점의 판정 임계 덮어쓰기**(S-8b, D-S22). 첫 시점은 건드리지 않는다.
 *
 * 돌린 시점에서 면 위 사선의 **79%가 축으로 오배정**되고 그렇게 놓인 것은 **전부** 크게
 * 틀린다. 원인은 판정이 관대해서가 아니라 **투영의 애매성**이다 — 그 사선들은 축 소실점에
 * **2° 안으로** 맞는다(각도 거부권을 걸어도 안 걸린다). 그 시점의 2D 증거만으로는
 * 축 획과 구분되지 않는다.
 *
 * 그래서 **해결이 아니라 완화**다: 부적합도 임계를 절반으로 조이면 오배정이 20~30% 준다
 * (139 → 111 / 35 → 25 / 36 → 29). 대가는 거의 없다(모서리 배치율 45°·110° 그대로,
 * 75° 0.65 → 0.58). `requireFarEnd`와 함께 쓰면 93 / 7 / 13까지 내려간다.
 */
export const VIEW_AXIS_CFG: AxisCfg = { vp_dist_ratio: 0.03 };

/**
 * **옵션마다 어디서 켜지는가.** 새 옵션이 `PlaceOpts`에 생기면 여기 등록해야 한다 —
 * 안 하면 아래 `_EVERY_OPTION_REGISTERED`가 **컴파일 오류**를 낸다.
 *
 * - `both`   앱의 두 경로 다 켠다
 * - `first`  첫 시점에만 켠다(**측정이 돌린 시점을 막았을 때만**. 원장 인용이 있어야 한다)
 * - `view`   돌린 시점에만 켠다(이유가 시점 의존이어야 한다)
 * - `measure` 측정 대조군 전용 — 앱은 안 켠다. **왜 안 켜는지가 `why`에 있어야 한다**
 * - `arg`    옵션이 아니라 호출부가 채우는 인자
 */
export type Wiring = "both" | "first" | "view" | "measure" | "arg";
export const PLACE_OPT_WIRING: Record<keyof PlaceOpts, { where: Wiring; why: string }> = {
  mode: { where: "arg", why: "떨림 평면. 앱은 기본값 `facing`(D-S8)을 쓴다 — 명시하지 않아도 같다" },
  rep: { where: "arg", why: "대표 직선. `Stroke.rep`가 있으면 그것이 이긴다(측정 편의용 인자)" },
  seedIfEmpty: { where: "arg", why: "씨앗 여부. `settle`이 배치된 획 수로 자동 결정한다" },
  endpointOnly: { where: "measure", why: "몸통 접합을 끈 **대조군**(S-3). 끄면 끝점 오차 2%에서 47%가 앵커를 못 찾는다 — 켤 이유가 없다" },
  nearestSample: { where: "measure", why: "선분 보간 대신 최근접 표본점을 쓰는 **대조군**(S-4). 차이가 없었으므로 보간을 유지한다" },
  depthGuard: { where: "measure", why: "S-5의 깊이 애매성 가드. **D-S13의 검사 둘로 대체됐다** — 측정 재현용으로만 남긴다" },
  farEndCheck: { where: "both", why: "정합성 검사(D-S13·D-S16)" },
  facePlanes: { where: "first", why: "면 위 사선(D-S14). **돌린 시점에는 안 켠다** — 궤도 45°에서 놓인 것의 83%가 0.2를 넘는다(가림. D-S19, `view_plane.json`)" },
  freeBendMax: { where: "first", why: "평면 경로를 곧은 획으로 제한(D-S17). 평면 경로가 첫 시점 전용이므로 이것도 그렇다" },
  freeSpan: { where: "first", why: "자유 곡선 폴백(D-S17). 같은 이유로 첫 시점 전용이다(D-S19)" },
  retryAsFace: { where: "both", why: "축 오배정 되돌리기. **값이 0이라 꺼져 있지만 배선은 되어 있다**(D-S16) — 실획에서 켤 때 배선을 다시 찾을 필요가 없게" },
  requireFarEnd: { where: "view", why: "정합성 검사로 못 고른 앵커를 버린다. **돌린 시점에만** 켠다 — 그 시점의 자유단 경로가 조용히 틀린 배치의 통로다(D-S22, `view_plane.json`)" },
  depthEnvelope: { where: "view", why: "깊이 타당성. **가림이 시점에 달린 현상이라서**다(D-S12·D-S13) — 첫 시점에서는 자유단이 드물다" },
};

/** `PlaceOpts`에 키가 늘었는데 위 표에 안 넣으면 **여기서 컴파일이 깨진다**. */
type _Unregistered = Exclude<keyof PlaceOpts, keyof typeof PLACE_OPT_WIRING>;
const _EVERY_OPTION_REGISTERED: _Unregistered extends never ? true : never = true;
void _EVERY_OPTION_REGISTERED;
