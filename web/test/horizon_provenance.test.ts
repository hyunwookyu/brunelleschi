// **지평선의 출처 게이트**(2026-08-20 19차 지시 3 · D-L115)와 **작도선 스냅샷**(지시 2 · D-L114).
//
// 사람 보고: *"상단에 그어도 화면 중간 높이에 지평선이 생긴다. 내가 그은 y가 안 쓰인다."*
// 원인은 **18차 이전의 저장본**이었다 — 그때 `newRuleState`가 `horizon: imgSize[1] / 2`
// (화면 중앙)를 **기본값으로** 넣었고, 복원이 그것을 그대로 읽어 `hasHorizon()`이 처음부터
// 참이 되면서 **지평선 단계가 통째로 안 열렸다.**
//
// 여기는 그 게이트의 **단위 팔**이다. 종단(`e2e/procedure_repair.spec.ts`)이 실제 저장소로
// 같은 것을 재고, 여기서는 **경계 넷**을 값으로 잠근다:
//
// ```
// ① 소실점 없는 지평선  →  안 읽는다(옛 기본값과 못 가른다 — A-3 "애매하면 놓지 않는다")
// ② 소실점 있는 지평선  →  지킨다(지우면 확정된 축이 소리 없이 무너진다)
// ③ 되돌리기 경로        →  게이트를 안 지난다(«지평선만 그은 단계»로 돌아갈 수 있어야 한다)
// ④ 작도선 스냅샷        →  왕복하고, 다르면 `snapDiff`가 그 자리를 이름으로 짚는다(#30)
// ```
//
// 착수 시 `PITFALLS.md`를 읽었다(`tail -40`). 걸리는 번호는 `progress.md` 19차 착수 표가 든다.
import { describe, it, expect } from "vitest";
import { CamState } from "../src/ui/camState.js";
import { newRuleState, type RuleState } from "../src/s3d/vpRules.js";
import { takeSnap, applySnap, snapDiff, type SeedLine } from "../src/ui/appSnap.js";
import { newDoc } from "../src/ui/doc.js";

const SZ: [number, number] = [1280, 674];

/** 18차 **이전** 형식 — 그때의 `newRuleState`가 낸 것 그대로(화면 중앙 기본값). */
const legacyRules = (): RuleState =>
  ({ slots: [null, null, { kind: "screen", dir: "v", support: 0 }], horizon: SZ[1] / 2 });

/** 같은 저장본에 **소실점이 얹혀 있는** 판 — 그 지평선은 쓰이고 있다. */
const legacyRulesWithVp = (): RuleState => ({
  slots: [{ kind: "vp", at: [-SZ[0], SZ[1] / 2], source: "two_lines", support: 2 },
          { kind: "vp", at: [SZ[0] * 2, SZ[1] / 2], source: "horizon_x_line", support: 2 },
          { kind: "screen", dir: "v", support: 0 }],
  horizon: SZ[1] / 2,
});

describe("지평선의 출처 — 저장본이 옛 기본값을 되살리지 않는다 (D-L115)", () => {
  it("① 소실점이 얹혀 있지 않은 지평선은 **문서에서 안 읽는다**", () => {
    const cam = new CamState(SZ);
    cam.loadRulesFromDocument(legacyRules());
    // 이 값이 살아 있으면 지평선 단계가 안 열린다 — 그것이 사람이 본 것이다
    expect(cam.rules.horizon).toBeNull();
    expect(cam.hasHorizon()).toBe(false);
    expect(cam.order()).toBe(0);
  });

  it("① 그 뒤 사용자가 그은 y가 **그대로** 쓰인다 (지시 3-d — 상단·중앙·하단)", () => {
    for (const y of [Math.round(SZ[1] * 0.15), Math.round(SZ[1] * 0.5),
                     Math.round(SZ[1] * 0.85)]) {
      const cam = new CamState(SZ);
      cam.loadRulesFromDocument(legacyRules());
      expect(cam.setHorizon(y)).toBe(true);
      expect(cam.rules.horizon).toBe(y);
    }
  });

  it("② 소실점이 얹혀 있으면 **지킨다** — 게이트가 무차별이 아니다(양성 채널 #30)", () => {
    const cam = new CamState(SZ);
    cam.loadRulesFromDocument(legacyRulesWithVp());
    expect(cam.rules.horizon).toBe(SZ[1] / 2);
    expect(cam.hasHorizon()).toBe(true);
    expect(cam.order()).toBe(2);
  });

  it("③ **되돌리기 경로는 게이트를 안 지난다** — «지평선만 그은 단계»로 돌아간다", () => {
    // 실측으로 걸린 자리다: 게이트를 `loadRules`에 두자 undo 세 번째에서 150 → null이 됐다.
    const cam = new CamState(SZ);
    cam.setHorizon(150);
    const snap = takeSnap(newDoc(), cam);
    cam.setHorizon(400);                       // 다른 상태로 옮겼다가
    applySnap(cam, snap);                      // 되돌린다
    expect(cam.rules.horizon).toBe(150);       // 게이트가 걸리면 여기가 null이 된다
    expect(cam.hasHorizon()).toBe(true);
  });

  it("③ 게이트는 **문서 입구에만** 있다 — 같은 상태를 두 함수에 넣어 갈린다", () => {
    const a = new CamState(SZ), b = new CamState(SZ);
    const st: RuleState = { ...newRuleState(SZ), horizon: 150 };
    a.loadRules(st);                 // 되돌리기·하네스 입구
    b.loadRulesFromDocument(st);     // 문서 입구
    expect(a.rules.horizon).toBe(150);
    expect(b.rules.horizon).toBeNull();
  });
});

describe("작도선 스냅샷 — 되돌리기가 함께 되돌린다 (D-L114)", () => {
  const seeds: SeedLine[] = [{ a: [10, 20], b: [30, 40] }, { a: [50, 60], b: [70, 80] }];

  it("④ 왕복한다 — 담은 것이 그대로 나온다", () => {
    const cam = new CamState(SZ);
    const snap = takeSnap(newDoc(), cam, null, seeds);
    expect(snap.seeds).toEqual(seeds);
  });

  it("④ **깊은 사본이다** — 스냅샷이 나중의 작도선에 딸려 움직이지 않는다", () => {
    const cam = new CamState(SZ);
    const live: SeedLine[] = [{ a: [10, 20], b: [30, 40] }];
    const snap = takeSnap(newDoc(), cam, null, live);
    live[0].a[0] = 999;               // 그 뒤 앱이 좌표를 만졌다
    expect(snap.seeds![0].a[0]).toBe(10);
  });

  it("④ `snapDiff`가 **작도선이 다르면 그 자리를 이름으로 짚는다**(#30 양성 채널)", () => {
    const cam = new CamState(SZ);
    const doc = newDoc();
    const same = snapDiff(takeSnap(doc, cam, null, seeds), takeSnap(doc, cam, null, seeds));
    expect(same).toEqual([]);                                   // 같으면 빈다(보장 #5)
    const fewer = snapDiff(takeSnap(doc, cam, null, seeds),
                           takeSnap(doc, cam, null, seeds.slice(0, 1)));
    expect(fewer).toContain("seeds.length");                    // 수가 다르다
    const moved = snapDiff(takeSnap(doc, cam, null, seeds),
                           takeSnap(doc, cam, null,
                                    [{ a: [11, 20], b: [30, 40] }, seeds[1]]));
    expect(moved).toContain("seeds[0]");                        // 좌표가 다르다
  });

  it("④ **옛 스냅샷에는 이 칸이 없다** — 없는 것과 빈 것을 같게 읽는다", () => {
    const cam = new CamState(SZ);
    const doc = newDoc();
    const old = { ...takeSnap(doc, cam, null, []) } as Record<string, unknown>;
    delete old.seeds;
    expect(snapDiff(old as never, takeSnap(doc, cam, null, []))).toEqual([]);
  });
});
