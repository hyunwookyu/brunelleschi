// V-4 안내 배너 — §3.8 전면 개정 반영 (지시 2.7).
// 구판은 "평면을 그리거나 치수를 알려주세요"였으나 **사용자는 평면을 그리지 않는다**(V-v).
// 안내는 이제 **무엇이 왜 미확정인지**를 사유별로 말한다. 기하가 특정해 주므로 질의가 명확하다.
//
// 근거(전부 실측):
//  - 1점은 자유도 f가 남아 깊이가 미결정(이론서 5.3). 폭·높이는 실척 직접(7.7).
//  - 시거리 게이트는 1점 형태가정 경로 전용. 하한 0.5W(광각) + 상한 3W(원거리, 프로젝트 휴리스틱).
//    실측 precision ≈0.998 — 걸리면 실제로 가정이 틀린 것이므로 단정적으로 말해도 된다.
//  - 2점 종횡비는 90% 구간 상대폭 중앙 0.894로 사실상 미확정(1-bis). 게이트 불가 → 표현.
//  - 축 라벨(폭/깊이)은 기하가 정하지 못한다. 뒤바뀜 28.75%, 그 경우 IoU 0.527(1-ter B).

export type GuidanceKind =
  | "depth_unresolved"      // 1점: f 미결정 → 안쪽 깊이
  | "fov_too_wide"          // 게이트 하한
  | "viewpoint_too_far"     // 게이트 상한
  | "aspect_unresolved"     // 2점 구간 넓음
  | "axis_ambiguous"        // 폭/깊이 라벨 모호
  | "camera_invalid";       // 3점 둔각 등 물리적으로 불가능

export interface Guidance {
  kind: GuidanceKind;
  severity: "info" | "warn" | "error";
  text: string;
}

const MESSAGES: Record<GuidanceKind, { severity: Guidance["severity"]; text: string }> = {
  depth_unresolved: { severity: "warn", text: "안쪽 깊이를 알려주세요. 이 구도에서는 폭과 높이만 정해집니다." },
  fov_too_wide: { severity: "warn", text: "이 구도는 화각이 극단적입니다." },
  viewpoint_too_far: { severity: "warn", text: "이 구도는 시점이 지나치게 멀리 있습니다." },
  aspect_unresolved: { severity: "warn", text: "비례가 확정되지 않습니다. 다른 각도에서 한 장 더 그리거나 치수를 알려주세요." },
  axis_ambiguous: { severity: "info", text: "폭과 깊이 중 어느 쪽이 그 치수입니까?" },
  camera_invalid: { severity: "error", text: "이 소실점 배치는 어떤 시점에서도 재현되지 않습니다(소실점 삼각형이 둔각)." },
};

// 카메라 복원 결과 요약 — Python `camera_unified.recover_camera` 출력의 부분집합.
export interface CameraSummary {
  case?: string;            // 1pt | 2pt | 3pt | axonometric
  ok?: boolean;
  f?: number | null;
  verdict?: string;         // trust | warn | unreliable | invalid | unresolved_f | no_perspective
  ratio?: number | null;    // f / W
}

export interface AspectSummary {
  relWidth?: number | null;   // 90% 구간 상대폭
  unresolved?: boolean;
}

export const UPPER_RATIO = 3.0;   // 상한 게이트(화각 19° 미만) — 프로젝트 휴리스틱

// 상태 → 안내 목록. 해당하는 것만, 심각도 높은 순.
export function guidanceFor(cam: CameraSummary, aspect?: AspectSummary,
                            axisAmbiguous = false): Guidance[] {
  const out: Guidance[] = [];
  if (cam.verdict === "invalid") out.push({ kind: "camera_invalid", ...MESSAGES.camera_invalid });

  // 게이트 — 1점 형태가정 경로에서만 의미가 있다(2점 f는 형태 가정과 무관).
  if (cam.case === "1pt" && cam.ratio != null) {
    if (cam.ratio < 0.5) out.push({ kind: "fov_too_wide", ...MESSAGES.fov_too_wide });
    else if (cam.ratio > UPPER_RATIO) out.push({ kind: "viewpoint_too_far", ...MESSAGES.viewpoint_too_far });
  }
  // 1점에서 f를 못 정하면 깊이가 미결정(5.3). 폭·높이는 실척 직접이므로 그렇게 말한다(7.7).
  if (cam.case === "1pt" && (cam.f == null || cam.verdict === "unresolved_f")) {
    out.push({ kind: "depth_unresolved", ...MESSAGES.depth_unresolved });
  }
  if (aspect?.unresolved) out.push({ kind: "aspect_unresolved", ...MESSAGES.aspect_unresolved });
  if (axisAmbiguous) out.push({ kind: "axis_ambiguous", ...MESSAGES.axis_ambiguous });

  const rank = { error: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// 축 질의 문구 — 치수 값이 있으면 그 값을 넣어 묻는다(지시 2.7).
export function axisQuestion(value?: number, unit = "미터"): string {
  return value == null
    ? MESSAGES.axis_ambiguous.text
    : `폭과 깊이 중 어느 쪽이 ${value}${unit}입니까?`;
}
