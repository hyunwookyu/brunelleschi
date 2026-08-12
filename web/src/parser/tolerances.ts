// tolerance 스칼라 — 참조: python/common/tuned_tol.json (precise), normalize_core DEFAULT_TOL.
export const TUNED_PRECISE = {
  resample_spacing: 5.0,
  dp_epsilon: 20.0,
  min_segment_len: 22.0,
  collinear_merge_deg: 12.0,
  axis_cluster_deg: 35.0,
  ortho_snap_deg: 20.0,
  coincident_dist: 38.0,
  parallel_deg: 8.0,
  perpendicular_deg: 15.0,
  equal_len_ratio: 0.12,
};
export type Tol = typeof TUNED_PRECISE;

// stage1/normalize.py 상수
export const CANON_DIAG = 180.0;
export const LINE_CAP = 14;
export const FIT_MAX = 0.06;
export const CONF_MIN = 0.5;   // tentative hint 경계
