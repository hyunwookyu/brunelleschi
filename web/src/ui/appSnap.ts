// L-C.2 — **되돌리기 스냅샷**. 계획서 §6.2("사용자가 즉시 보고 되돌린다")의 뒤쪽 절반이다.
//
// ---------------------------------------------------------------- 왜 문서만으로는 안 되는가
//
// 초판의 `실행취소`는 **문서만** 되돌렸다. 그리기·지우기에서는 그것으로 충분했다 —
// 카메라가 안 움직이는 조작이기 때문이다. **차수 승격은 다르다**: 소실점 집합이 바뀌고
// 기하가 그 집합으로 다시 풀린다(§6.1). 문서만 되돌리면
//
//     기하 = 옛 카메라의 해   ·   소실점 = 새 것
//
// 이 되고 이것이 §6.1이 "부분 유지는 좌표계가 섞인 상태를 만든다"고 금지한 바로 그 상태다.
// ⚠ **화면은 그럴듯하다** — 3D는 어차피 그려지고 잉크는 제자리다. 그래서 아무도 못 본다.
//
// ---------------------------------------------------------------- 왜 여기 있는가
//
// UI 안에 두면 **하네스가 앱과 다른 것을 잰다**(#17). 되돌리기가 무엇을 담는지는
// 이 파일 하나가 정하고, 앱과 원장이 같은 함수를 부른다.
//
// ⚠ **왕복 대조는 측정이 아니라 설계 보장이다**(CLAUDE.md §5.1 자기참조 유형 3) —
// 스냅샷을 되돌리고 그 스냅샷과 비교하는 것이기 때문이다. 원장에 **보장이라고 적고
// 임계를 걸지 않는다.** 대신 `snapDiff`가 **다른 상태에서는 다르다고 말하는지**를 함께 낸다(#30).
import { snapshotDoc, type DocState } from "./doc.js";
import type { CamState } from "./camState.js";
import { cloneRuleState, type RuleState } from "../s3d/vpRules.js";

export interface AppSnap {
  doc: DocState;
  /**
   * 카메라의 상태는 **이것이 전부다** — 누산기는 `apply()`가 다시 만들고, 차수와
   * "확정됐는가"는 **파생 상태라 계산한다**(2026-08-17 지시 1 — 옛 `locked`·`lockedOrder`를 뺐다).
   * **가이드가 아니라 규칙 상태다**(2026-08-16 전면 교체) — 그은 선이 만든 슬롯 셋과 지평선.
   */
  rules: RuleState;
  /** 승격 요약(불투명). 재연결을 되돌리면 표시가 **다시 나와야** 한다. */
  report: unknown | null;
}

/** 규칙 상태 깊은 사본 — 스냅샷이 나중의 획에 딸려 움직이면 안 된다. */
export const copyRules = (r: RuleState): RuleState => cloneRuleState(r);

export function takeSnap(
  doc: DocState, cam: CamState, report: unknown | null = null,
): AppSnap {
  return { doc: snapshotDoc(doc), rules: copyRules(cam.rules), report };
}

/**
 * 스냅샷을 카메라에 되돌리고 **되돌릴 문서를 낸다**. 호출자가 자기 `doc`에 꽂는다.
 *
 * 씬·자세 갱신은 여기서 안 한다 — 그것은 three와 DOM이고 이 파일은 순수해야
 * 하네스가 같은 경로를 부를 수 있다(#17).
 */
export function applySnap(cam: CamState, s: AppSnap): DocState {
  cam.loadRules(s.rules);
  return s.doc;
}

/**
 * 두 스냅샷이 어디에서 갈리는가. **비어 있으면 같다.**
 *
 * 왕복에서는 비는 것이 **설계 보장**이므로 그 자체가 측정이 아니다(#5).
 * 이 함수의 값은 **양성 채널**에 있다(#30) — 다른 상태를 넣으면 그 자리를 **이름으로** 짚는다.
 * 안 짚으면 대조가 눈뜬 것이 아니고, 그러면 왕복 통과도 아무 뜻이 없다.
 */
export function snapDiff(a: AppSnap, b: AppSnap): string[] {
  const w: string[] = [];
  if (a.doc.currentView !== b.doc.currentView) w.push("currentView");
  if (a.rules.horizon !== b.rules.horizon) w.push("rules.horizon");
  for (let i = 0; i < 3; i++) {
    const p = a.rules.slots[i], q = b.rules.slots[i];
    if (!p !== !q) { w.push(`rules.slots[${i}].presence`); continue; }
    if (!p || !q) continue;
    if (p.kind !== q.kind) { w.push(`rules.slots[${i}].kind`); continue; }
    if (p.kind === "screen" && q.kind === "screen" && p.dir !== q.dir) w.push(`rules.slots[${i}].dir`);
    if (p.kind === "vp" && q.kind === "vp"
        && (p.at[0] !== q.at[0] || p.at[1] !== q.at[1] || p.source !== q.source)) {
      w.push(`rules.slots[${i}].vp`);
    }
  }

  if (a.doc.views.length !== b.doc.views.length) w.push("views.length");
  if (a.doc.strokes.length !== b.doc.strokes.length) w.push("strokes.length");
  else for (let i = 0; i < a.doc.strokes.length; i++) {
    const p = a.doc.strokes[i], q = b.doc.strokes[i];
    if (p.id !== q.id) { w.push(`strokes[${i}].id`); continue; }
    if (p.axis !== q.axis) w.push(`strokes[${i}].axis`);
    // ⚠ **`pts2d`를 반드시 본다**(#34). 승격이 스냅된 시작점을 **새 상으로 옮기므로**
    // 되돌리기가 그것을 안 되돌리면 시작점만 새 카메라 자리에 남는다 —
    // L-C.1이 그 어긋남을 p90 **311px**로 실측했다. 좌표를 안 보면 그 재발을 못 잡는다
    if (p.pts2d.length !== q.pts2d.length) w.push(`strokes[${i}].pts2d.length`);
    else for (let k = 0; k < p.pts2d.length; k++) {
      if (p.pts2d[k][0] !== q.pts2d[k][0] || p.pts2d[k][1] !== q.pts2d[k][1]) {
        w.push(`strokes[${i}].pts2d[${k}]`); break;
      }
    }
    const ps = p.seg3d, qs = q.seg3d;
    if (!ps !== !qs) w.push(`strokes[${i}].seg3d.presence`);
    else if (ps && qs) {
      for (let e = 0; e < 2; e++) for (let c = 0; c < 3; c++) {
        if (ps[e][c] !== qs[e][c]) { w.push(`strokes[${i}].seg3d`); e = 2; break; }
      }
    }
    const pn = p.snapStart, qn = q.snapStart;
    if (!pn !== !qn) w.push(`strokes[${i}].snapStart.presence`);
    else if (pn && qn && (pn.ofId !== qn.ofId || pn.kind !== qn.kind)) {
      w.push(`strokes[${i}].snapStart`);
    }
  }
  return w;
}
