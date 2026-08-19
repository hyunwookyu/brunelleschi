// **끝점을 공유한 깊이선 둘로 공간이 선다**(2026-08-19 15차 항목 1 · D-L99).
//
// 사용자 보고 ①: *"깊이선 하나를 긋고, 그 끝점을 소실점 삼아 새 깊이선을 뻗으면 공간이
// 안 선다."* 보고 ②의 닫힌 삼각형(사선 → 수평 → 사선이 첫 점으로 돌아온다)도 같은 형태다 —
// **두 깊이선이 한 점에서 만난다.**
//
// 기전: `poolCandidates`가 그 짝을 **두 문에서** 버렸다.
//   ① 교점이 어느 끝점의 `merge_ratio` 안이면 제외(이어 그린 이음점 방어)
//   ② `beyondSegment` — 교점이 두 선분 **밖**이어야 한다(t < −pad 또는 t > 1+pad)
// 이음점은 정확히 `t = 0`·`t = 1`이라 ②도 못 지난다. 그래서 `resolvePool`이 `null`을 내고
// **카메라가 영영 안 선다.**
//
// 수리: **가로축이 선언된 상태(`unambiguous`)에서만** 두 문을 푼다 — 그때 대기 깊이선은
// 전부 같은 축이고, 나란한 두 직선의 상은 소실점에서만 만나므로 그 교점은 소실점이다.
// **안쪽 교차는 선언 아래서도 막는다**(나란한 직선은 서로의 몸통을 안 가로지른다).
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #17 새 임계를 안 만든다 — `SNAP_TOL.extend_ratio`를 그대로 쓴다
//   #30 `unambiguous = false` 팔이 옛 거동이고 그것이 되살림 팔이다
//   #32 "선언 아래서 전부 통과"로 넓히지 않는다 — 안쪽 교차 반례가 그 자리를 지킨다
//   #40 도달 가능성: 되살림 팔이 실제로 `null`을 낸다
import { describe, it, expect } from "vitest";
import { resolvePool, insideSegment, beyondSegment, type RLine } from "../src/s3d/vpRules.js";

const SZ: [number, number] = [1280, 675];

/** 한 점 `V`에서 뻗어 나가는 깊이선 둘 — 사용자가 "그 끝점을 소실점 삼아" 그은 그것. */
const fanAt = (V: [number, number], p: [number, number], q: [number, number]): RLine[] =>
  [{ a: V, b: p }, { a: V, b: q }];

describe("끝점을 공유한 깊이선 둘 (D-L99)", () => {
  const V: [number, number] = [1050, 250];
  const pool = fanAt(V, [420, 470], [500, 180]);

  it("**되살림 팔** — 선언이 없으면(옛 문) 그 짝이 통째로 버려진다", () => {
    // 선언 없는 판은 짝이 둘뿐이라 대기가 맞다(지시 11-1). 문 자체가 닫혀 있음을 본다
    expect(beyondSegment(pool[0], V)).toBe(false);      // t = 0 — 연장 위가 아니다
    expect(beyondSegment(pool[1], V)).toBe(false);
    expect(resolvePool(pool, SZ, false)).toBeNull();
  });

  it("가로축이 선언되면 그 이음점이 소실점으로 선다", () => {
    const got = resolvePool(pool, SZ, true);
    expect(got).not.toBeNull();
    expect(Math.hypot(got!.at[0] - V[0], got!.at[1] - V[1])).toBeLessThan(1e-6);
    expect(got!.members.sort()).toEqual([0, 1]);
  });

  it("**닫힌 삼각형** — 사선 → 수평 → 사선이 첫 점으로 돌아와도 선다", () => {
    // 수평선은 가로축으로 선언돼 대기 풀에 없다. 남는 것이 사선 둘이고 꼭짓점을 공유한다
    const apex: [number, number] = [330, 290];
    const tri: RLine[] = [{ a: apex, b: [700, 420] }, { a: [1040, 420], b: apex }];
    const got = resolvePool(tri, SZ, true);
    expect(got).not.toBeNull();
    expect(Math.hypot(got!.at[0] - apex[0], got!.at[1] - apex[1])).toBeLessThan(1e-6);
  });

  it("**반례** — 몸통을 가로지르는 교차는 선언 아래서도 소실점이 아니다", () => {
    const cross: RLine[] = [{ a: [300, 200], b: [900, 500] },
                            { a: [300, 500], b: [900, 200] }];
    const at: [number, number] = [600, 350];
    expect(insideSegment(cross[0], at)).toBe(true);
    expect(insideSegment(cross[1], at)).toBe(true);
    expect(resolvePool(cross, SZ, true)).toBeNull();
  });

  it("**반례** — T자 접합(한 선의 몸통에 다른 선의 끝)은 선언 아래서도 소실점이 아니다", () => {
    const tee: RLine[] = [{ a: [300, 400], b: [900, 400] },      // 몸통
                          { a: [600, 400], b: [640, 180] }];     // 끝이 그 몸통에 닿는다
    expect(resolvePool(tee, SZ, true)).toBeNull();
  });

  it("**반례** — 선언 아래서도 나란한 두 선은 소실점을 안 만든다", () => {
    const par: RLine[] = [{ a: [300, 300], b: [900, 400] },
                          { a: [300, 380], b: [900, 480] }];
    expect(resolvePool(par, SZ, true)).toBeNull();
  });

  it("⚠ **완화의 대가** — 선언이 틀리면 서로 다른 축의 모서리 꼭짓점이 소실점이 된다", () => {
    // D-L96의 잔여 위험(DEFERRED 14차 행: 얕은 2점 축이 스냅-선언으로 1점에 갇힌다)이
    // **이 완화와 곱해진다**. 여기서 재는 것은 그 곱의 크기다 — 선언이 틀린 상태에서
    // 2점 상자의 모서리 둘(서로 다른 축)이 꼭짓점을 공유하면 그 꼭짓점이 소실점으로 선다.
    // ⛔ **옛 문(D-L99 이전)은 이것을 막았다** — 그래서 이 팔이 완화의 **대가**다.
    const V: [number, number] = [640, 340];
    const corner: RLine[] = [{ a: V, b: [300, 300] },      // 왼쪽 축으로 뻗는 모서리
                             { a: V, b: [980, 300] }];     // 오른쪽 축으로 뻗는 모서리
    expect(resolvePool(corner, SZ, false)).toBeNull();      // 옛 문: 안 받는다
    const got = resolvePool(corner, SZ, true);              // 완화: 받는다
    expect(got).not.toBeNull();
    expect(Math.hypot(got!.at[0] - V[0], got!.at[1] - V[1])).toBeLessThan(1e-6);
    // ⚠ **이 팔은 수리가 아니라 노출의 기록이다** — 판정은 선언이 옳은가에 달렸고
    // 그것은 D-L96의 물음이다(DEFERRED). 여기서는 **크기가 0이 아님**만 잠근다(#40).
  });

  it("`insideSegment`는 `beyondSegment`의 여집합이 아니다 — 그 사이에 **끝**이 있다", () => {
    const l: RLine = { a: [0, 0], b: [100, 0] };
    for (const t of [-0.5, 1.5]) {
      const at: [number, number] = [100 * t, 0];
      expect(beyondSegment(l, at)).toBe(true);
      expect(insideSegment(l, at)).toBe(false);
    }
    for (const t of [0, 1]) {                            // 끝 — 둘 다 false다
      const at: [number, number] = [100 * t, 0];
      expect(beyondSegment(l, at)).toBe(false);
      expect(insideSegment(l, at)).toBe(false);
    }
    expect(insideSegment(l, [50, 0])).toBe(true);        // 안쪽
    expect(beyondSegment(l, [50, 0])).toBe(false);
  });
});
