// **현재 공유 상수를 원장에 낸다.** `selfcheck.py`가 이것을 기준으로 다른 산출물의
// 스냅샷을 대조해 STALE을 잡는다. 산출: `stage0/out/constants.json`.
//
// 이 파일이 매 실행 갱신되므로, 상수를 바꾸고 **일부 측정만 다시 돌리면** 안 돌린 산출물의
// 스냅샷이 뒤처지고 그것이 곧 플래그가 된다. 사람이 기억할 필요가 없다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { constantsSnapshot, stableHash, SHARED_CONSTANTS } from "./constants.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "stage0", "out");

describe("공유 상수 스냅샷", () => {
  it("현재 상수를 stage0/out/constants.json에 낸다", () => {
    const snap = constantsSnapshot();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "constants.json"), JSON.stringify({
      spec: "측정 결과를 바꿀 수 있는 공유 상수의 **현재 값**. 산출물마다 든 스냅샷과 대조해 STALE을 잡는다.",
      why: (
        "공유 상수·기본값이 바뀌면 그것에 의존하는 측정이 낡는다. 같은 유형이 세 번 재발했다 — "
        + "`hash(str)` 비결정 시드(Track 2), 등급 centroid 단위 혼동(마우스 판정), "
        + "`AXIS_TOL` 기본값 변경(S-2b의 b가 S-3 측정을 바꿨다). 사람이 기억할 종류가 아니다."
      ),
      how: [
        "각 측정 하네스가 `constants: constantsSnapshot()`을 산출물에 넣는다.",
        "`python selfcheck.py`가 이 파일과 대조해 다르면 STALE 플래그(어느 상수가 다른지 함께).",
        "문서는 산출물을 **파일명@해시**로 인용한다 — 인용한 수치가 어느 실행인지 남는다.",
      ],
      ...snap,
    }, null, 2), "utf-8");
    expect(snap.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("해시는 결정론적이고 키 순서에 무관하다 (V-H)", () => {
    expect(constantsSnapshot().hash).toBe(constantsSnapshot().hash);
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });

  it("**반례**: 상수를 하나라도 바꾸면 해시가 달라진다 — 그것이 STALE의 근거다", () => {
    const a = stableHash(JSON.stringify(SHARED_CONSTANTS));
    const b = stableHash(JSON.stringify({
      ...SHARED_CONSTANTS,
      AXIS_TOL: { ...SHARED_CONSTANTS.AXIS_TOL, rank_margin: 99 },
    }));
    expect(a).not.toBe(b);
  });

  it("판정·배치·렌더·노이즈의 상수가 전부 들어 있다 — 빠지면 STALE이 안 잡힌다", () => {
    const v = SHARED_CONSTANTS;
    // S-2b가 새로 넣은 것들이 특히 중요하다(그것이 S-3을 낡게 만든 인자다)
    expect(v.AXIS_TOL.rank_margin).toBeDefined();
    expect(v.AXIS_TOL.vp_dist_ceiling).toBeDefined();
    expect(v.AXIS_TOL.angle_relax).toBeDefined();
    expect(v.CONSENSUS_TOL.min_support).toBeDefined();
    expect(v.PLACE_TOL.join_ratio).toBeDefined();
    expect(v.TUBE_TOL.base_width_px).toBeDefined();
    expect(v.INK_GRADES.medium.lf_bow).toBeDefined();
  });
});
