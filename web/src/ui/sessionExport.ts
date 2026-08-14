// 실획 수집 — **측정을 위한 최소 내보내기**. S-10의 재측정이 여기 달려 있다.
//
// 왜 지금인가: S-3이 브라우저에서 끝까지 도니 실제 획을 받을 수 있다. 그런데 이 프로젝트의
// **가장 큰 위험 둘이 표본 문제**다 — AS-6(한 획 = 한 축)과 AS-12(끝점 겨냥 오차)는 모두
// Quick,Draw 낙서에서 나온 수치이고, 대상 사용자(스타일러스·투시도 숙련자)를 대표하지 않는다
// (AS-13). 수단을 먼저 만들어 두고, 측정은 사용자 획이 들어온 뒤에 한다.
//
// **담는 것**: 원본 6튜플(`[x, y, t, pressure, tiltX, tiltY]`) + 판정 결과 + 배치 결과 + 카메라.
// 판정과 배치를 함께 담아야 "무엇을 어떻게 판정했고 그래서 놓였는가"를 되짚을 수 있다.
//
// **담지 않는 것**: 사용자 식별 정보. 좌표는 화면 좌표 그대로이고 그림 내용 외에는 없다.
import type { Stroke } from "../s3d/stroke.js";
import type { AxisVerdict } from "../s3d/axis.js";
import type { CameraSolution, Pt2 } from "../s3d/camera.js";

export const SESSION_FORMAT = "s2s-session/1";

export interface SessionStroke {
  id: string;
  /** 원본 포인터 표본 `[x, y, t, pressure, tiltX, tiltY]`. **캡처한 그대로 담는다.** */
  raw: number[][];
  axis: Stroke["axis"];
  reason: AxisVerdict["reason"];
  /** 순위 기준으로만 채택했는가(S-2b b). 판정의 근거를 구분해 둔다. */
  relative?: boolean;
  misfit: number | null;
  runnerUp: number | null;
  /** 대표 직선 — 위치 의존성(S-2b) 분석의 좌표가 된다. */
  rep: { a: Pt2; b: Pt2; len: number; bend: number } | null;
  placed: boolean;
  anchorRef: string | null;
  joinShift: number;
  /** 배치된 3D 점열. 없으면 미배치. */
  pts3d: number[][];
}

export interface Session {
  format: typeof SESSION_FORMAT;
  /** ISO 문자열. 호출자가 넣는다(측정 코드에서 시각을 만들지 않기 위해). */
  at: string;
  imgSize: [number, number];
  camera: {
    case: CameraSolution["case"]; ok: boolean; f: number | null;
    principal: Pt2 | null; fSource?: string; fovDeg: number | null; vps: (Pt2 | null)[];
  };
  strokes: SessionStroke[];
  note?: string;
}

export function buildSession(args: {
  at: string;
  imgSize: [number, number];
  cam: CameraSolution;
  vps: (Pt2 | null)[];
  strokes: Stroke[];
  raw: Map<string, number[][]>;
  verdicts: Map<string, AxisVerdict>;
  note?: string;
}): Session {
  return {
    format: SESSION_FORMAT,
    at: args.at,
    imgSize: args.imgSize,
    camera: {
      case: args.cam.case, ok: args.cam.ok, f: args.cam.f,
      principal: args.cam.principalPoint, fSource: args.cam.fSource,
      fovDeg: args.cam.fovDeg, vps: args.vps,
    },
    strokes: args.strokes.map(s => {
      const v = args.verdicts.get(s.id);
      return {
        id: s.id,
        raw: args.raw.get(s.id) ?? s.pts2d.map(p => [p[0], p[1]]),
        axis: s.axis,
        reason: v?.reason ?? "no_camera",
        relative: v?.relative,
        misfit: v?.misfit ?? null,
        runnerUp: v?.runnerUp ?? null,
        rep: v?.rep ? { a: v.rep.a, b: v.rep.b, len: v.rep.len, bend: v.rep.bend } : null,
        placed: s.pts3d.length > 0,
        anchorRef: s.anchorRef,
        joinShift: s.joinShift,
        pts3d: s.pts3d.map(p => [p[0], p[1], p[2]]),
      };
    }),
    note: args.note,
  };
}

/** 파일로 내려받는다. 받은 파일을 저장소의 `sessions/`에 넣으면 측정이 집어 간다. */
export function downloadSession(session: Session, name?: string) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name ?? `s2s-session-${session.at.replace(/[:.]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
