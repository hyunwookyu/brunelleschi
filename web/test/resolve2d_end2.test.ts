// **7차 항목 2-c — 끝점 오스냅 분기의 방향 판정**(실획 첫 표본: 물음 6회/획 5).
//
// 옛 판의 `resolve2dCore`는 끝점 2D 오스냅이 걸리면 방향 판정(③)을 건너뛰고 반환했다 —
// 기존 깊이선 위에 정확히 얹힌 획도 `vpdir`가 비어 `snapForced`가 없고, 분류가 모호 구간
// (화면축 4°~깊이 8° 사이)이면 물음으로 갔다. 고친 판은 **점은 옮기지 않되** 오스냅으로
// 정해진 현(弦)의 방향 판정(`dirSnap2dCore` — 같은 임계)을 함께 낸다.
//
// 착수 시 `PITFALLS.md`를 읽었다. 걸리는 번호: **#21**(버그를 되살려 실패를 먼저 확인 —
// 이 파일의 양성 단언 둘은 수정 전 코드에서 실제로 실패한다: vpdir·ortho가 null이었다) ·
// **#17**(판정 임계는 새로 만들지 않는다 — dirSnap2dCore 그대로) · **#3**(오스냅과 방향
// 판정을 섞지 않는다 — 점 불변 단언이 그것).
// 측정이 아니라 **반례 테스트**다(수치 분포 없음) — 원장은 내지 않는다(#25의 "측정"이 아님).
import { describe, it, expect } from "vitest";
import { resolve2dCore } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import type { Pt2 } from "../src/s3d/camera.js";

const DIAG = Math.hypot(1440, 900);

/** 대기 깊이선 하나 — 끝점 후보의 출처. */
function candsOf(a: Pt2, b: Pt2) {
  const segs: Snap2Seg[] = [{ id: "p1", a, b }];
  return static2dCandidates(segs, DIAG);
}

describe("7차 항목 2-c — 끝점 오스냅이 걸려도 방향 판정이 나온다", () => {
  it("기존 깊이선 위에 얹힌 획(양 끝 오스냅) → vpdir가 그 축을 낸다 · 점은 안 옮긴다", () => {
    const A: Pt2 = [100, 300], B: Pt2 = [400, 250];
    // 소실점은 그 선의 연장 위 — 이 현은 정확히 축 방향이다(vpMisfit 0)
    const VP: Pt2 = [100 + 6 * 300, 300 + 6 * -50];
    const raw: Pt2[] = [[104, 303], [396, 252]];          // 양 끝이 A·B의 15px 안
    const r = resolve2dCore(raw, { cands: candsOf(A, B), vps: [VP, null, null],
                                   radiusPx: 15, relSnap: true });
    expect(r.start2).not.toBeNull();
    expect(r.end2).not.toBeNull();
    // **수정의 본체** — 옛 판은 여기서 vpdir가 null이라 물음으로 갔다(#21: 수정 전 실패)
    expect(r.vpdir).not.toBeNull();
    expect(r.vpdir!.axis).toBe(0);
    // **점은 오스냅이 정한 그대로다** — 방향 판정이 기하를 움직이면 안 된다(#3)
    expect(r.pts).toEqual([r.start2!.at, r.end2!.at]);
    expect(r.b).toEqual(r.end2!.at);
    // 표식 좌표도 끝점을 가리킨다(다른 자리를 가리키면 화면이 거짓말한다)
    expect(r.vpdir!.at).toEqual(r.end2!.at);
  });

  it("수평 대기선 위에 얹힌 획 → ortho(화면 가로)가 나온다", () => {
    const A: Pt2 = [100, 300], B: Pt2 = [400, 300];
    const raw: Pt2[] = [[103, 302], [397, 299]];
    const r = resolve2dCore(raw, { cands: candsOf(A, B), vps: [null, null, null],
                                   radiusPx: 15, relSnap: true });
    expect(r.end2).not.toBeNull();
    expect(r.ortho).not.toBeNull();                       // #21: 수정 전 실패
    expect(r.ortho!.dir).toBe("h");
    expect(r.pts).toEqual([r.start2!.at, r.end2!.at]);
  });

  it("반례 — 어느 방향도 아닌 대각 현이면 판정을 지어내지 않는다(물음은 남는다)", () => {
    const A: Pt2 = [100, 300], B: Pt2 = [380, 120];       // 수평과 ≈33° — 임계 밖
    const VP: Pt2 = [1300, 850];                          // 현에서 먼 소실점
    const raw: Pt2[] = [[103, 297], [377, 123]];
    const r = resolve2dCore(raw, { cands: candsOf(A, B), vps: [VP, null, null],
                                   radiusPx: 15, relSnap: true });
    expect(r.end2).not.toBeNull();
    expect(r.ortho).toBeNull();
    expect(r.vpdir).toBeNull();
  });
});
