// 정해진 값 — 지시서 「정해진 값」 절에서 그대로. 근거가 없는 값은 넣지 않는다.
// 임계는 전부 비(比)다. 예외: 오스냅 반경·지우개(포인터 정밀도 문제라 선례가 절대 px).

export const C = {
  /** 소실점 방향 판정 — 대표 직선에서 소실점까지 수직거리 ÷ 획 길이 */
  VP_DIR_RATIO: 0.06,
  /** 화면 평행 판정 — 수평·수직에서 벗어난 정도(길이 대비) ≈ 2.87° */
  SCREEN_PARALLEL_RATIO: 0.05,
  /** 방향을 믿는 최소 길이 (화면 대각 대비) */
  MIN_DIR_LEN_RATIO: 0.02,
  /** 소실점에 기여하는 최소 길이 = 그 2배 */
  VP_MIN_LEN_RATIO: 0.04,

  /** 오스냅 반경 px (화면 기준, 절대 — 선례 대역 10~15px의 안쪽) */
  OSNAP_RADIUS_PX: 8,
  /** 끝점·중점 병합 (기하 크기 대비) */
  MERGE_RATIO: 0.002,
  /** 선분 밖 허용 (선분 길이 대비) */
  SEG_OVERSHOOT_RATIO: 0.02,
  /** 3D 교차 허용 간격 (기하 크기 대비) */
  INTERSECT_GAP_RATIO: 0.01,

  /** 1점 상태의 f 기본값 (f/W). 깊이 배율 게이지 — 임의값이되 화각 참고 대역(≈60°) 안.
   *  이론서 18.4: f/W ≥ 0.87이면 60° 이하. */
  DEFAULT_F_RATIO: 0.87,

  /** 선 굵기 px — 화면 고정, 거리 무관 */
  LINE_W_RESULT: 1.5,
  LINE_W_GUIDE: 1.3,

  /** 지우개 px */
  ERASER_PX: 12,
  ERASER_MIN: 4,
  ERASER_MAX: 60,
} as const
