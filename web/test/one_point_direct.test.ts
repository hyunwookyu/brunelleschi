// **1점 직접 좌표 ↔ lift 경로 동등성**(6차 지시 2-5) — 원장 `one_point_direct.json`.
//
// 지시문: "직접 좌표 경로와 기존 lift 경로의 결과가 같은지 확인한다. 같아야 한다 —
// 다만 직접 경로가 더 빠르고 오차가 없다. 반례 — 일부러 카메라 투영을 거치게 하고
// 결과가 같은지."
//
// 판정 구조(#5 — 보장과 판정을 가른다):
//   같음 자체는 **같은 사영의 두 표현**이라 보장에 가깝다 — 커서가 축의 화면 직선 **위**에
//   있을 때 두 경로는 같은 교점을 낸다. 여기서 재는 것은 그 **배선**(공식이 실제로 그
//   교점을 내는가)이고, **판정력은 음성 대조가 진다**(#39): 카메라를 2° 틀면(1점 전제 붕괴)
//   직접 공식은 lift와 갈라진다 — 그 크기가 원장에 남는다(전제 판정 onePointFrame이
//   왜 정확 정렬만 통과시키는지의 정량 근거).
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { onePointFrame, directSegment, planeAnchor, ONE_POINT_TOL } from "../src/s3d/onePoint.js";
import { segmentFromAnchor } from "../src/s3d/liveLine.js";
import { project, sub3, norm3, type Vec3 } from "../src/s3d/geom3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { constantsSnapshot } from "./constants.js";
import { metricsSnapshot } from "./metrics.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");
const CTX = { principal: [640, 360] as Pt2, f: 700 };

/** 정확 1점 프레임(항등 — P1 확정 뷰의 그것). */
const ID_DIRS: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** 우측면 입면 꼴 — 세계 X가 깊이로, 세계 Z가 화면 가로로 온 순열(부호 섞음). */
const RIGHT_DIRS: Vec3[] = [[0, 0, -1], [0, 1, 0], [1, 0, 0]];

/** y축 둘레 회전(도) — 음성 대조가 1점 전제를 무너뜨리는 데 쓴다. */
const rotY = (v: Vec3, deg: number): Vec3 => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

interface Sample { axis: 0 | 1 | 2; diff: number }

/**
 * 한 프레임에서 축·앵커·끝점 격자를 돌며 직접↔lift 차의 최대를 잰다.
 * 끝 커서는 **참 3D 끝점의 상**이다 — "일부러 카메라 투영을 거치게 하고"(2-5 반례)의
 * 구현이 이것이다: 3D 점 → project → 두 경로에 같은 화면점을 먹인다.
 */
function sweep(dirs: Vec3[], liftDirs: Vec3[] = dirs): { n: number; max: number; samples: Sample[] } {
  const opf = onePointFrame(dirs)!;
  expect(opf).toBeTruthy();
  const samples: Sample[] = [];
  let max = 0, n = 0;
  const anchors: Vec3[] = [];
  for (const x of [-1.2, 0.4]) for (const y of [-0.8, 0.6]) for (const z of [3, 6])
    anchors.push([x, y, z]);
  for (const axis of [0, 1, 2] as const) {
    for (const anchor of anchors) {
      for (const t of [-0.9, 0.7, 1.6]) {
        const d = dirs[axis];
        const end3: Vec3 = [anchor[0] + d[0] * t, anchor[1] + d[1] * t, anchor[2] + d[2] * t];
        const b2 = project(end3, CTX.principal, CTX.f);
        if (!b2) continue;                            // 카메라 뒤 — 두 경로 다 대상 밖
        const direct = directSegment(opf, axis, anchor, b2, CTX);
        const lift = segmentFromAnchor(anchor, liftDirs[axis], b2, CTX);
        if (!direct || !lift) continue;
        const diff = Math.max(norm3(sub3(direct[0], lift[0])), norm3(sub3(direct[1], lift[1])));
        samples.push({ axis, diff });
        if (diff > max) max = diff;
        n += 1;
      }
    }
  }
  return { n, max, samples };
}

describe("1점 직접 좌표 — lift 경로와의 동등성 (6차 지시 2-5)", () => {
  it("측정을 원장에 남긴다", () => {
    // ---- ① 동등성: 확정 뷰 꼴(항등)과 입면 꼴(순열) 두 프레임
    const eqId = sweep(ID_DIRS);
    const eqRight = sweep(RIGHT_DIRS);
    expect(eqId.n).toBeGreaterThan(50);              // 표본이 실제로 돌았다(#38 — 분모)
    expect(eqRight.n).toBeGreaterThan(50);
    expect(eqId.max).toBeLessThan(1e-9);
    expect(eqRight.max).toBeLessThan(1e-9);

    // ---- ② 음성 대조(#39): 카메라를 2° 틀면 직접 공식(항등 가정)은 lift(참 방향)와 갈라진다
    const tilted = ID_DIRS.map(d => rotY(d, 2));
    const neg = sweep(ID_DIRS, tilted);
    expect(neg.max).toBeGreaterThan(0.01);           // 전제가 무너지면 갈라진다 — 판정력의 근거

    // ---- ③ 전제 판정: 0.5° 튼 방향 셋은 1점이 아니다(정확 정렬만 통과)
    expect(onePointFrame(ID_DIRS.map(d => rotY(d, 0.5)))).toBeNull();
    expect(onePointFrame(RIGHT_DIRS)).toBeTruthy();
    expect(onePointFrame([ID_DIRS[0], ID_DIRS[0], ID_DIRS[2]])).toBeNull();  // 퇴화(순열 아님)

    // ---- ④ 무스냅 앵커(2-3): 평면 역투영의 왕복이 항등이다(보장 — 임계 없음, #5)
    const pa = planeAnchor([500, 300], 4, CTX)!;
    const back = project(pa, CTX.principal, CTX.f)!;
    const paGap = Math.hypot(back[0] - 500, back[1] - 300);

    // ---- ⑤ 깊이축 퇴화: 주점 위 앵커의 깊이선은 점으로 투영된다 — 놓지 않는다
    const opf = onePointFrame(ID_DIRS)!;
    expect(directSegment(opf, 2, [0, 0, 4], [700, 360], CTX)).toBeNull();

    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "one_point_direct.json"), JSON.stringify({
      spec: "6차 지시 2-5 — 1점 직접 좌표(directSegment)와 lift 경로(segmentFromAnchor)의 동등성. "
        + "끝 커서는 참 3D 끝점을 카메라 투영으로 되돌린 상('일부러 투영을 거치게') — 축 3 × 앵커 8 × 끝점 3, "
        + "확정 뷰 꼴(항등)과 우측면 입면 꼴(순열·부호) 두 프레임. 음성 대조: 2° 튼 카메라에서 갈라짐",
      what_this_does_not_say: [
        "**동등성 자체는 같은 사영의 두 표현이라 보장에 가깝다**(#5) — 이 팔이 재는 것은 배선(공식이 그 교점을 실제로 내는가)이고, 판정력은 음성 대조(negative)가 진다(#39)",
        "커서가 축의 화면 직선 **위**에 있는 표본이다 — 스냅된 획의 잉크가 그렇다(직교·소실점 방향 스냅이 획을 축 방향으로 편다). 선 밖 커서에서는 두 경로가 2차 소량으로 갈라진다(직접 = 화면 성분 읽기 · lift = 광선-직선 최근점) — 그 동작점은 이 원장 밖이다(#12)",
        "앱 경로(resolveLive 안의 분기)는 여기 없다 — 종단은 elevation_flow(입면 흐름 e2e)가 잰다",
        "ONE_POINT_TOL은 test/constants.ts 밖이다(D-L49·D-L51의 예외와 같은 자리 — 전역 해시 동결. 픽스처가 정확 정렬이라 어느 값도 align_eps에 의존하지 않는다) — 값은 algo_constants 필드",
        "hand_deg(손 정렬 자동 스냅)의 동작은 이 하네스 밖이다(카메라·감쇠가 필요한 e2e 영역 — elevation_flow의 자동 정렬 팔)",
        "planeAnchor 왕복(pa_roundtrip_px)은 **역함수의 정의 확인**이라 항등이다 — 임계를 걸지 않는다(#5·§5 유형 3)",
      ],
      thresholds: { eq_max: 1e-9, neg_min: 0.01, samples_min: 50 },
      algo_constants: { ONE_POINT_TOL },
      equality_identity: { n: eqId.n, max_diff: eqId.max },
      equality_right_elevation: { n: eqRight.n, max_diff: eqRight.max },
      negative_tilt2deg: { n: neg.n, max_diff: neg.max,
        note: "직접 공식(항등 프레임 가정)에 참 방향이 2° 튼 lift를 대조 — 전제 붕괴 시 갈라지는 크기" },
      frame_judgment: { tilt_half_deg_is_null: true, permutation_ok: true, degenerate_null: true },
      pa_roundtrip_px: paGap,
      gate: {
        registered: "동등성 두 프레임 max_diff < 1e-9(표본 각 ≥50) · 음성 대조(2° 틀림) max_diff > 0.01 · "
          + "0.5° 튼 프레임 판정 null · 깊이 퇴화 null. ⚠ **이 항목이 등록한 게이트다** — CLAUDE.md §2의 중단 조건이 아니다(#41)",
        reachability: "음성 대조가 오라클이다 — 전제가 무너진 카메라에서 직접↔lift가 갈라지는 크기가 "
          + "eq_max(1e-9)의 일곱 자리 위에 있어, 동등성 통과가 '어떤 입력에도 같다'는 자명이 아님을 가른다",
        reachability_value: neg.max,
        reachability_source: "negative_tilt2deg/max_diff",
      },
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    }, null, 1));
  });
});
