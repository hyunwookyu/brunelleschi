// L-C.2 — **승격이 무엇을 잃었나**. 계획서 §6.2("되돌리기가 주 수단")의 앞쪽 절반이다.
//
// 되돌리기 버튼이 있어도 **무엇이 달라졌는지 안 보이면 누를 이유를 모른다.**
// L-C.1이 그 필요를 측정으로 뒷받침했다 — 승격은 형태 오차를 낮추면서(중앙 0.1259 → 0.0913)
// **배치를 −168 줄인다**(`order_promote.json@2fd74e1c`). 즉 **품질과 개수가 맞바뀐다.**
// 어느 쪽을 택할지는 그림마다 다르므로 **사용자가 정해야 하고, 정하려면 봐야 한다.**
//
// ---------------------------------------------------------------- 왜 여기 있나
//
// UI 안에서 세면 **하네스가 다른 것을 잰다**(#17). 앱이 화면에 쓰는 수와 원장의 수가
// 같은 함수에서 나와야 한다. 그래서 순수 함수 하나로 두고 둘이 같이 부른다.
//
// ⚠ **집합을 뺄셈으로 만들지 않는다**(#10). `dropped`는 "전 − 후"가 아니라
// **전에 있고 후에 없는 id를 직접 모은 것**이다. 뺄셈은 개수만 맞고 **어느 획인지**를 잃는다 —
// 그리고 화면에 표시하려면 바로 그 id가 필요하다.

/** 획 하나의 배치 상태. `true`면 3D에 있다. */
export type PlacedMap = ReadonlyMap<string, boolean>;

export interface PlacementDiff {
  /** **3D였다가 2D 대기로 내려간 획.** 사용자가 잃은 것이다(§9.1: 실패가 아니라 대기다). */
  dropped: string[];
  /** 2D 대기였다가 3D로 올라간 획. 승격이 벌어 준 것이다. */
  gained: string[];
  /** 양쪽에서 3D인 획. **다시 풀렸으므로 기하는 달라졌다** — 자리가 같다는 뜻이 아니다. */
  kept: string[];
  /** 양쪽에서 2D인 획. */
  pending: string[];
}

/**
 * 승격 전후의 배치를 짝지어 가른다.
 *
 * 한쪽에만 있는 id는 **문서가 바뀐 것**이므로 여기서는 무시하지 않고 그쪽에 넣는다 —
 * 앱에서는 승격 중에 획이 생기거나 사라지지 않으므로 실제로는 안 생기는 경우이고,
 * 그런데도 조용히 버리면 **분모가 달라진 것을 아무도 못 본다**(#11).
 */
export function diffPlacement(before: PlacedMap, after: PlacedMap): PlacementDiff {
  const d: PlacementDiff = { dropped: [], gained: [], kept: [], pending: [] };
  const ids = new Set<string>([...before.keys(), ...after.keys()]);
  for (const id of ids) {
    const b = before.get(id) ?? false;
    const a = after.get(id) ?? false;
    if (b && !a) d.dropped.push(id);
    else if (!b && a) d.gained.push(id);
    else if (b && a) d.kept.push(id);
    else d.pending.push(id);
  }
  return d;
}

/** 사람이 읽는 한 줄. 앱의 알림과 원장이 **같은 문장을 쓴다**(#17). */
export function diffSummary(d: PlacementDiff, snapLost: number): string {
  const parts = [`3D ${d.kept.length + d.gained.length}획`];
  if (d.gained.length) parts.push(`올라감 +${d.gained.length}`);
  if (d.dropped.length) parts.push(`**내려감 −${d.dropped.length}**`);
  if (snapLost) parts.push(`**스냅 끊김 ${snapLost}**`);
  return parts.join(" · ");
}
