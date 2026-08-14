// W-1 카메라 수학 이식 정합 — **Python이 기준 구현**이다. 갈리면 TS가 틀린 것으로 본다.
// 기준값은 `gen_camera_ref.py`가 만든 `camera_ref.json`(같은 입력, 같은 기대값).
//
// 이론서 어느 절을 구현했는지 케이스마다 적는다. 수치가 맞아도 **다른 절을 구현했으면**
// 틀린 것이다 — 이 프로젝트에서 8.8이 2I 결론을 뒤집은 적이 있다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  lineIntersect, lsIntersection, fFromTwoVps, fFromThreeVps, gate,
  directScaleAxes, recoverCamera, frontalWorld, depthFromForeshortening, type Pt2,
} from "../src/wire/camera.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(resolve(HERE, "camera_ref.json"), "utf-8"));
const SZ = REF.img_size as [number, number];
const C = REF.cases;
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("W-1 카메라 수학 — Python 정합", () => {
  it("소실점 = 두 직선의 교점, 평행이면 무한원(2.2 c=0)", () => {
    const [p1, p2, p3, p4] = C.line_intersect.input as Pt2[];
    const got = lineIntersect(p1, p2, p3, p4)!;
    near(got[0], C.line_intersect.out[0]); near(got[1], C.line_intersect.out[1]);
    const [q1, q2, q3, q4] = C.line_intersect_parallel.input as Pt2[];
    expect(lineIntersect(q1, q2, q3, q4)).toBe(C.line_intersect_parallel.out);
  });

  it("2점: f² = |PV₁||PV₂| (6.2), 주점은 이미지 중심 가정 (16.2)", () => {
    const [v1, v2] = C.f_two_vps.vps as Pt2[];
    const r = fFromTwoVps(v1, v2, SZ);
    expect(r.ok).toBe(true);
    near(r.f!, C.f_two_vps.out.f, 1e-9);
    expect(r.principalPoint).toEqual(C.f_two_vps.out.principal_point);
  });

  it("2점: 두 소실점이 주점 같은 쪽이면 f²<0 — 직교 방향쌍이 아니다", () => {
    const [v1, v2] = C.f_two_vps_same_side.vps as Pt2[];
    const r = fFromTwoVps(v1, v2, SZ);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(C.f_two_vps_same_side.out.reason);
    near(r.f2!, C.f_two_vps_same_side.out.f2, 1e-6);
  });

  it("3점: 주점 = 소실점 삼각형의 수심 (6.3), 자유도 0이라 잔차 ≈ 0 (5.3)", () => {
    const [v1, v2, v3] = C.f_three_vps_acute.vps as Pt2[];
    const r = fFromThreeVps(v1, v2, v3);
    expect(r.ok).toBe(true);
    near(r.f!, C.f_three_vps_acute.out.f, 1e-9);
    near(r.principalPoint![0], C.f_three_vps_acute.out.principal_point[0], 1e-6);
    near(r.principalPoint![1], C.f_three_vps_acute.out.principal_point[1], 1e-6);
    expect(r.residual!).toBeLessThan(1e-12);
  });

  it("3점: 둔각이면 f²<0 — 대응하는 직육면체가 존재하지 않는다 (6.5)", () => {
    const [v1, v2, v3] = C.f_three_vps_obtuse.vps as Pt2[];
    const r = fFromThreeVps(v1, v2, v3);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("obtuse_triangle_f2_negative");
    expect(r.f2!).toBeLessThan(0);
  });

  it("화각 게이트 (18.4) — 하한만 있다. 좁은 화각은 경고 대상이 아니다", () => {
    for (const s of C.gate.samples as { f: number; out: any }[]) {
      const g = gate(s.f, SZ[0]);
      expect(g.verdict).toBe(s.out.verdict);
      near(g.ratio!, s.out.ratio, 1e-9);
      near(g.fovDeg!, s.out.fov_deg, 1e-9);
    }
    // 폐기된 상한(d>3W, assumptions V-E)이 되살아나지 않았는지 잠근다
    expect(gate(SZ[0] * 5, SZ[0]).verdict).toBe("trust");
  });

  it("실척으로 직접 읽히는 축 (7.7) — 소실점이 적을수록 많다", () => {
    for (const n of [0, 1, 2, 3]) {
      expect(directScaleAxes(n)).toEqual(C.direct_scale_axes[String(n)]);
    }
  });

  it("recoverCamera가 소실점 개수로 갈린다 (2.3 / 5.3)", () => {
    const cmp = (got: any, ref: any, name: string) => {
      expect(`${name}:${got.case}`).toBe(`${name}:${ref.case}`);
      expect(got.ok).toBe(ref.ok);
      expect(got.verdict).toBe(ref.verdict);
      expect(got.directScaleAxes).toEqual(ref.direct_scale_axes);
      if (ref.f == null) expect(got.f).toBeNull(); else near(got.f, ref.f, 1e-9);
      if (ref.ratio == null) expect(got.ratio).toBeNull(); else near(got.ratio, ref.ratio, 1e-9);
    };
    cmp(recoverCamera([[-600, 200], [1400, 200], [400, 2200]], SZ), C.recover_3pt.out, "3pt");
    cmp(recoverCamera([[-200, 300], [1400, 300], null], SZ), C.recover_2pt.out, "2pt");
    cmp(recoverCamera([[400, 300], null, null], SZ), C.recover_1pt_unset.out, "1pt_unset");
    cmp(recoverCamera([[400, 300], null, null], SZ, { fSetting: 900 }), C.recover_1pt_setting.out, "1pt_set");
    cmp(recoverCamera([null, null, null], SZ), C.recover_0pt.out, "0pt");
  });

  // --- 반례 테스트 (§13 규칙 3) ---

  it("반례: 1점에서 f는 형태 가정으로 역산되지 않는다 — 설정이 없으면 미결정으로 남는다", () => {
    // 폐기된 8.7/8.8 경로가 TS로 새어 들어오지 않았는지. 사각형을 줘도 f가 생기면 안 된다.
    const r = recoverCamera([[400, 300], null, null], SZ);
    expect(r.ok).toBe(false);
    expect(r.f).toBeNull();
    expect(r.verdict).toBe("unresolved_f");
    expect(r.unresolved[0]).toContain("f 미설정");
    // 설정을 주면 채워지고, 출처가 측정이 아님이 남는다
    const s = recoverCamera([[400, 300], null, null], SZ, { fSetting: 900 });
    expect(s.fSource).toBe("setting(렌즈)");
  });

  it("반례: 최소제곱 교점이 정확 교점과 일치하고, 어긋난 선은 그 사이로 간다", () => {
    // 정확히 한 점에서 만나는 세 직선 → 그 점
    const V: Pt2 = [900, 250];
    const rays = [[100, 400], [120, 500], [200, 320]].map(p => ({
      p: p as Pt2, d: [V[0] - p[0], V[1] - p[1]] as Pt2,
    }));
    const got = lsIntersection(rays)!;
    near(got[0], V[0], 1e-6); near(got[1], V[1], 1e-6);
    // 한 직선을 틀면 해가 움직이되 그 방향으로만 움직인다(자명한 상수가 아님을 확인)
    const bent = [...rays];
    bent[0] = { p: [100, 400], d: [V[0] - 100, V[1] - 400 + 260] };
    const got2 = lsIntersection(bent)!;
    expect(Math.hypot(got2[0] - V[0], got2[1] - V[1])).toBeGreaterThan(1);
  });

  it("반례: 소실점이 아주 멀면 무한원으로 세어 자유도 회계가 바뀐다 (2.2)", () => {
    const far: Pt2 = [1e7, 300];
    const r = recoverCamera([[-200, 300], far, null], SZ);
    expect(r.nVps).toBe(1);                       // 두 개를 줬지만 하나만 유한
    expect(r.directScaleAxes).toEqual(["width", "height"]);
  });
});

describe("W-1 부분 확정 — f 전에 그린 것이 그대로 남는가 (§3.2)", () => {
  it("화면 평행면 기하는 f와 무관하다 — 렌즈를 바꿔도 폭·높이가 움직이지 않는다", () => {
    const p: Pt2 = [400, 300];
    const corners: Pt2[] = [[250, 200], [550, 200], [550, 420], [250, 420]];
    const w1 = corners.map(c => frontalWorld(c, p));
    // 게이지가 f를 쓰지 않으므로 f를 넣을 자리가 없다 — 그것이 이 함수의 요지다
    const w2 = corners.map(c => frontalWorld(c, p));
    expect(w2).toEqual(w1);
    // 폭:높이 비가 화면 비와 같다(7.7 — 화면 평행 방향은 축소되지 않는다)
    const wid = w1[1][0] - w1[0][0], hei = w1[3][1] - w1[0][1];
    expect(wid / hei).toBeCloseTo(300 / 220, 9);
  });

  it("깊이는 f에 비례한다 — 렌즈를 바꾸면 안쪽만 늘어난다", () => {
    const s = 0.5;                                  // 절반으로 축소돼 보이는 점
    const d1 = depthFromForeshortening(900, s);
    const d2 = depthFromForeshortening(1800, s);
    expect(d2 / d1).toBeCloseTo(2, 12);
    // 반례: 축소가 없으면(s=1) 깊이가 씨앗 평면(z₀=f)에 그대로 있다
    expect(depthFromForeshortening(900, 1)).toBeCloseTo(900, 12);
  });
});
