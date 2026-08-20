// **렌즈 — 초점거리의 세 표현**(2026-08-20 18차 지시 r-2 · D-L111).
//
// 같은 하나를 세 가지로 말한다. **하나를 바꾸면 나머지가 따라온다** — 저장하는 것은
// 화소 초점거리 `f` 하나이고 나머지는 **계산이다**(#54: 같은 사실을 두 곳에 안 둔다).
//
// ```
// f(px)      투영이 실제로 쓰는 값.  project = principal + f·x/z
// 화각(°)    가로 화각.             2·atan(W / 2f)
// 35mm 환산  사진의 관용 단위.       36mm · f / W       (풀프레임 가로 36mm)
// ```
//
// ⚠ **가로 화각이다.** 세로가 아니다 — `FREE_FOV_DEG`(three의 `fov`)는 **세로**이고 그것과
// 다른 양이다. 사람이 "얼마나 담기나"를 말할 때 쓰는 것은 가로이고(지시 r-2의 «수평 화각»),
// 35mm 환산도 가로 36mm를 기준으로 하므로 **둘이 같은 축을 본다**.
//
// ⚠ **이것은 카메라 조작이지 형상이 아니다**(r-3) — 그린 선의 3D 좌표는 안 움직인다.

/** 풀프레임(35mm 판) 가로 폭(mm) — 환산의 기준이다. */
export const FULL_FRAME_MM = 36;

/** 화소 초점거리 → **가로** 화각(도). */
export const fovDegFromF = (f: number, widthPx: number): number =>
  (2 * Math.atan(widthPx / (2 * f)) * 180) / Math.PI;

/** **가로** 화각(도) → 화소 초점거리. */
export const fFromFovDeg = (deg: number, widthPx: number): number =>
  widthPx / (2 * Math.tan((deg * Math.PI) / 360));

/** 화소 초점거리 → 35mm 환산 초점거리(mm). */
export const mm35FromF = (f: number, widthPx: number): number =>
  (FULL_FRAME_MM * f) / widthPx;

/** 35mm 환산 초점거리(mm) → 화소 초점거리. */
export const fFromMm35 = (mm: number, widthPx: number): number =>
  (mm * widthPx) / FULL_FRAME_MM;

/**
 * **조절 범위**(표시 상수 — 판정 임계가 아니다. D-L49 계열이라 `test/constants.ts`에 안 넣는다).
 * 초광각 14mm ~ 망원 200mm. 그 밖은 «담을 것»의 문제가 아니라 다른 도구의 일이다.
 */
export const LENS_MM = { min: 14, max: 200 } as const;

/** 범위 안으로 죈다. */
export const clampMm = (mm: number): number =>
  Math.min(LENS_MM.max, Math.max(LENS_MM.min, mm));
