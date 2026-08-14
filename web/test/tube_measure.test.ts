// S-4 측정 — 튜브 메쉬의 규모·비용과 **3D 물체다움**. 산출: `stage0/out/tube_render.json`.
//
// **재지 않는 것**: "그린 카메라에서 튜브의 화면 폭이 그은 굵기와 같은가".
// `worldRadius`가 `깊이/f`로 환산한 값을 같은 `깊이/f`로 되재는 것이라 **설계 보장**이고
// 측정이 아니다(§4.5와 같은 유형, selfcheck 자기참조 3). 불변식 테스트로만 잠갔다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTube, widthProfile, worldRadius, TUBE_TOL } from "../src/s3d/tube.js";
import { newStroke, settle, resetStrokeIds, type PlaceCtx, type Stroke } from "../src/s3d/stroke.js";
import { classifyStroke } from "../src/s3d/axis.js";
import { project, norm3, sub3, type Vec3 } from "../src/s3d/geom3d.js";
import { rng32 } from "../src/s3d/synthInk.js";
import { scene, groundPoint, boxEdges, drawEdges, rotateAbout, stat, round } from "./scene3d.js";
import type { Pt2 } from "../src/s3d/camera.js";
import { constantsSnapshot } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SC = scene(35, 15);
const CTX: PlaceCtx = { principal: SC.principal, f: SC.f, vps: SC.vps, imgSize: SC.imgSize };

/** 상자 하나를 그려 배치까지 끝낸 획들을 준다. */
function placedBox(r: () => number): Stroke[] {
  const O = groundPoint(SC, [340 + r() * 200, 430 + r() * 80]);
  if (!O) return [];
  const edges = boxEdges(SC, O, 0.8 + r() * 0.7, 0.8 + r() * 0.7, 0.6 + r() * 0.6);
  const drawn = drawEdges(SC, edges, "medium", r, 0.12, 0.01);
  if (!drawn) return [];
  resetStrokeIds();
  const list = drawn.map(d => {
    const v = classifyStroke(d.pts2d, SC.vps, SC.imgSize, {}, { principal: SC.principal, f: SC.f });
    return newStroke(d.pts2d, v.axis, v.rep ? { a: v.rep.a, b: v.rep.b } : undefined);
  });
  settle(list, CTX, { mode: "facing" });
  return list.filter(s => s.pts3d.length >= 2);
}

/**
 * 한 링의 **실제 메쉬 실루엣 반폭**(화면 px) ÷ 이상적인 반폭(r·f/z).
 *
 * 단면을 `radial_segments`각형으로 근사하므로 실루엣이 원보다 좁다. 그 좁아짐이 얼마인지가
 * 분할 수를 정당화한다 — 정n각형의 내접 반경 비는 위상에 따라 cos(π/n) ~ 1 사이를 오간다.
 * (회전 후 화면 폭이 1/깊이를 따르는 것은 **구성의 귀결**이라 재지 않는다: 세계 반지름이
 * 상수이고 회전이 강체변환이므로 투영이 그렇게 만든다. 측정이 아니라 설계다.)
 */
function silhouetteRatio(mesh: { positions: Float32Array }, ring: number, seg: number,
                         centre: Vec3, radius: number): number | null {
  const c = project(centre, SC.principal, SC.f);
  if (!c || radius <= 0) return null;
  let maxHalf = 0;
  for (let j = 0; j < seg; j++) {
    const o = (ring * seg + j) * 3;
    const p = project([mesh.positions[o], mesh.positions[o + 1], mesh.positions[o + 2]],
                      SC.principal, SC.f);
    if (!p) return null;
    maxHalf = Math.max(maxHalf, Math.hypot(p[0] - c[0], p[1] - c[1]));
  }
  return maxHalf / ((radius * SC.f) / centre[2]);
}

describe("S-4 측정", () => {
  it("메쉬 규모·비용과 회전 거동을 원장에 남긴다", () => {
    const r = rng32(9100);
    const perStroke: number[] = [], ringsPer: number[] = [];
    const twist: number[] = [];
    const widthRange: number[] = [];
    let totalV = 0, totalT = 0, nStrokes = 0, failed = 0;

    const t0 = performance.now();
    for (let it = 0; it < 40; it++) {
      for (const s of placedBox(r)) {
        const px = widthProfile(undefined, s.pts3d.length);
        const radii = s.pts3d.map((p, i) => worldRadius(px[i], p[2], SC.f));
        const m = buildTube(s.pts3d, radii);
        if (!m) { failed += 1; continue; }
        nStrokes += 1;
        totalV += m.counts.vertices; totalT += m.counts.triangles;
        perStroke.push(m.counts.triangles); ringsPer.push(m.counts.rings);

        // 꼬임 — 이웃 링의 대응 정점 거리에서 중심선 간격을 뺀 나머지. 프레임이 돌면 커진다.
        const seg = TUBE_TOL.radial_segments;
        const at = (i: number, j: number): Vec3 => {
          const o = (i * seg + j) * 3;
          return [m.positions[o], m.positions[o + 1], m.positions[o + 2]];
        };
        let worst = 0, rMax = Math.max(...radii);
        for (let i = 1; i < m.counts.rings; i++) {
          const step = norm3(sub3(s.pts3d[i], s.pts3d[i - 1]));
          for (let j = 0; j < seg; j++) worst = Math.max(worst, norm3(sub3(at(i, j), at(i - 1, j))) - step);
        }
        twist.push(worst / (rMax || 1));       // 반지름 대비 — 1을 넘으면 한 칸 돈 것이다
      }
    }
    const buildMs = performance.now() - t0;

    // **평행 이송 대조군** — 매 점에서 프레임을 새로 고르면 실제로 꼬이는가.
    // (S-4가 선분 보간의 "≈4px" 추정을 대조군으로 반증했다. 같은 유형이 여기 또 있었다.)
    const twistNaive: number[] = [];
    {
      const r2 = rng32(9100);
      for (let it = 0; it < 40; it++) {
        for (const s of placedBox(r2)) {
          const px = widthProfile(undefined, s.pts3d.length);
          const radii = s.pts3d.map((p, i) => worldRadius(px[i], p[2], SC.f));
          const m = buildTube(s.pts3d, radii, { naiveFrame: true });
          if (!m) continue;
          const seg = TUBE_TOL.radial_segments;
          const at = (i: number, j: number): Vec3 => {
            const o = (i * seg + j) * 3;
            return [m.positions[o], m.positions[o + 1], m.positions[o + 2]];
          };
          let worst = 0; const rMax = Math.max(...radii);
          for (let i = 1; i < m.counts.rings; i++) {
            const step = norm3(sub3(s.pts3d[i], s.pts3d[i - 1]));
            for (let j = 0; j < seg; j++) worst = Math.max(worst, norm3(sub3(at(i, j), at(i - 1, j))) - step);
          }
          twistNaive.push(worst / (rMax || 1));
        }
      }
    }

    // **분할 수 정당화** — 실제 메쉬 실루엣이 이상적인 원보다 얼마나 좁은가.
    // **회전한 시점에서도 잰다**(리뷰어 지적): 6각형 근사는 시선 방향에 의존하므로
    // "그린 시점"에서만 재면 최악 위상을 못 건드린다.
    const silRot: number[] = [];
    const sil: number[] = [];
    for (const s of placedBox(rng32(9200))) {
      const px = widthProfile(undefined, s.pts3d.length);
      const radii = s.pts3d.map((p, i) => worldRadius(px[i], p[2], SC.f));
      const m = buildTube(s.pts3d, radii);
      if (!m) continue;
      for (let i = 0; i < m.counts.rings; i += 5) {
        const v = silhouetteRatio(m, i, TUBE_TOL.radial_segments, s.pts3d[i], radii[i]);
        if (v != null) sil.push(v);
      }
      // 같은 메쉬를 궤도 90° 돌려 다시 본다(강체 회전이므로 메쉬 자체는 그대로다)
      const all = s.pts3d;
      const centre: Vec3 = [0, 1, 2].map(k => all.reduce((a, p) => a + p[k], 0) / all.length) as Vec3;
      const rotM = { positions: new Float32Array(m.positions.length) };
      for (let k = 0; k < m.positions.length; k += 3) {
        const q = rotateAbout([m.positions[k], m.positions[k + 1], m.positions[k + 2]],
                              centre, SC.axes[2], 90);
        rotM.positions[k] = q[0]; rotM.positions[k + 1] = q[1]; rotM.positions[k + 2] = q[2];
      }
      for (let i = 0; i < m.counts.rings; i += 5) {
        const rc = rotateAbout(s.pts3d[i], centre, SC.axes[2], 90);
        const v = silhouetteRatio(rotM, i, TUBE_TOL.radial_segments, rc, radii[i]);
        if (v != null) silRot.push(v);
      }
    }

    const report = {
      spec: "S-4 튜브 메쉬. 규모·비용·꼬임·회전 거동을 잰다.",
      not_measured: (
        "**'그린 카메라에서 화면 폭 = 그은 굵기'는 재지 않는다.** `worldRadius`가 깊이/f로 "
        + "환산한 것을 같은 깊이/f로 되재는 것이라 **설계 보장**이지 측정이 아니다"
        + "(§4.5와 같은 유형. selfcheck 자기참조 3이 잡는 형태다). 불변식 테스트로만 잠갔다."
      ),
      why_not_TubeGeometry: (
        "three.js `TubeGeometry`는 **반지름이 상수**다. §S-4가 요구하는 속도 기반 굵기는 "
        + "점마다 다른 반지름이므로 직접 짠다. 표준 기하이고 참조 저장소는 보지 않았다(§3)."
      ),
      constants: constantsSnapshot(),
      condition: { grade: "medium", skew: 0.12, end_jitter: 0.01, boxes: 40, seed: 9100,
                   radial_segments: TUBE_TOL.radial_segments, base_width_px: TUBE_TOL.base_width_px },
      scale: {
        strokes: nStrokes, build_failed: failed,
        vertices_total: totalV, triangles_total: totalT,
        rings_per_stroke: stat(ringsPer, 1),
        triangles_per_stroke: stat(perStroke, 1),
        build_ms_total: round(buildMs, 1),
        build_ms_per_stroke: round(buildMs / Math.max(1, nStrokes), 4),
      },
      scale_note: (
        "지연 예산(P1/P4/V-n) 확인용이다. 획 하나가 삼각형 수백 개 규모이고 생성이 "
        + "밀리초 이하이면 **온디맨드 렌더로 충분**하다 — 매 프레임 도는 루프가 필요 없다."
      ),
      twist_ratio: stat(twist, 3),
      twist_ratio_naive_frame: stat(twistNaive, 3),
      twist_control_note: (
        "**대조군을 뒀다**(리뷰어 지적). `naive_frame`은 매 점에서 프레임을 새로 고르는 구현이다 — "
        + "평행 이송이 실제로 필요한지 재기 위해서다. 추정으로 두지 않는다."
      ),
      twist_note: (
        "이웃 링의 대응 정점 거리에서 중심선 간격을 뺀 값 ÷ 최대 반지름. **평행 이송**이 아니라 "
        + "매 점에서 프레임을 새로 고르면 접선이 기준축과 나란해지는 곳에서 1을 크게 넘는다. "
        + "**단 이 지표는 급격히 꺾이는 곳에서 프레임 회전과 진짜 기하 변위를 가르지 못한다** — "
        + "최댓값이 1을 넘는 표본이 있는데 그것은 꼬임이 아니라 곡률이다. p90으로 읽는다."
      ),
      silhouette_ratio: stat(sil, 3),
      silhouette_ratio_rotated_90: stat(silRot, 3),
      silhouette_rotated_note: (
        "**회전한 시점에서도 잰다.** 6각형 근사는 시선 방향에 의존하므로 그린 시점에서만 재면 "
        + "최악 위상을 못 건드린다 — 회전 조건에서 하한(cos π/6 = 0.866)에 더 가까워지는지 본다."
      ),
      silhouette_note: (
        `실제 메쉬 실루엣 반폭 ÷ 이상적인 원의 반폭. 단면을 ${TUBE_TOL.radial_segments}각형으로 `
        + `근사하므로 위상에 따라 cos(π/${TUBE_TOL.radial_segments})=`
        + `${Math.cos(Math.PI / TUBE_TOL.radial_segments).toFixed(3)} ~ 1 사이를 오간다. `
        + "**이것이 분할 수를 정당화하는 값**이다 — 굵기 오차가 이 폭 안에 있다. "
        + "1을 조금 넘는 값이 나오는 것은 정상이다: 링이 시선에 기울어 있으면 가까운 쪽 정점이 "
        + "중심보다 얕은 깊이에 있어 더 바깥으로 투영된다(원근 그 자체이지 오차가 아니다)."
      ),
      not_measured_2: (
        "**회전 후 화면 폭이 1/깊이를 따르는 것은 구성의 귀결이라 재지 않는다.** "
        + "세계 반지름이 상수이고 회전이 강체변환이므로 투영이 그렇게 만든다 — 측정이 아니라 설계다. "
        + "_처음에는 이것을 '3D 물체다움' 지표로 넣었다가 자기참조임을 알고 뺐다._ "
        + "재는 대신 **화면 굵기를 고정하지 않았다는 사실**을 불변식 테스트로 잠갔다(`worldRadius`)."
      ),
      width_profile_spec: {
        gamma: TUBE_TOL.speed_gamma, clamp: [TUBE_TOL.width_min, TUBE_TOL.width_max],
        smooth_window: TUBE_TOL.smooth_window,
        note: (
          "속도 → 굵기는 **자기 획의 중앙 속도로 정규화**한다(절대 속도 금지, V-s). "
          + "합성 획에는 시간이 없어 일정 굵기로 떨어지므로 **이 표의 수치는 굵기 변화를 포함하지 않는다** — "
          + "속도 기반 굵기의 실제 분포는 실획이 들어와야 잰다(`sessions/`)."
        ),
      },
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "tube_render.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(nStrokes).toBeGreaterThan(100);
    expect(failed).toBe(0);
    // 꼬이지 않는다 — 반지름의 절반을 넘지 않아야 한다
    expect(stat(twist, 3).p90!).toBeLessThan(0.5);
    // 실루엣이 이상적인 원의 cos(π/n) 아래로 내려가지 않는다 — 분할이 모자라지 않다
    expect(stat(sil, 3).min!).toBeGreaterThan(Math.cos(Math.PI / TUBE_TOL.radial_segments) - 0.02);
    // 1을 조금 넘는 것은 링의 기울기에서 오는 원근이다(위 주석). 크게 넘으면 반지름이 틀린 것이다.
    expect(stat(sil, 3).max!).toBeLessThan(1.15);
  }, 120_000);
});
