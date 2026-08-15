// L-B.7 **승격 연쇄** — 계획서 §9.1.
//
// > 새 획이 3D 기하에 붙으면, 그 획과 만나던 2D 획들도 함께 결정된다.
// > §5.4의 일괄 풀이를 재사용한다 — 2D 획 집합과 기존 3D 기하를 함께 놓고 한 번에 푼다.
//
// **미배치는 실패가 아니라 대기 상태다.** 조건이 갖춰지면 승격하고, 승격은 연쇄한다.
//
// ---------------------------------------------------------------- 왜 배율만 맞추면 되는가
//
// `liftAll`이 내는 것은 **전역 배율 하나를 뺀 형태**다(동차계 `A s = 0`). 그러니 2D 대기 획과
// 이미 놓인 획을 **함께** 풀면 그 해는 기존 기하와 **같은 형태**이고 배율만 다르다.
// 배율은 이미 놓인 획들이 정해 준다 — 최소제곱으로 하나 고르면 끝이다.
//
// ```
// 함께 푼다 → 이미 놓인 것들이 정답을 알고 있으므로 그것으로 배율 k를 맞춘다
//           → **새로 놓인 것만** k배 해서 채택한다
// ```
//
// **기존 기하는 안 움직인다.** 다시 푼 값으로 덮지 않는다 — 이미 확정된 것을 매번 흔들면
// 사용자가 그린 것이 계속 미끄러지고, 그것은 승격이 아니라 재계산이다(그쪽은 차수 승격,
// 계획서 §6.1의 일이다). **여기서 바뀌는 것은 대기 획뿐이다.**
//
// ---------------------------------------------------------------- 떨어진 덩어리는 안 올린다
//
// 배율은 **이미 놓인 획과 이어져 있을 때만** 전달된다. 대기 획끼리만 이어진 덩어리는
// 자기들끼리 형태가 정해질 뿐 **크기가 정해지지 않는다** — 그것을 임의 배율로 놓으면
// 조용히 틀린 배치다. 그래서 **확정 성분과 같은 연결 성분에 있는 것만** 승격한다(A-3).
import { liftAll, findJoints, components, frameOf, LIFT_TOL,
         type LiftStroke, type LiftCtx, type LiftCfg, type LiftSeg, type Frame } from "./lift.js";
import { mul3, dot3, norm3, sub3, type Vec3 } from "./geom3d.js";

export interface PromoteResult {
  /** 새로 놓인 획만. **기존 기하는 여기 없다.** */
  promoted: Map<string, LiftSeg>;
  /** 기존 기하에 맞춘 전역 배율. */
  scale: number;
  /** 왜 안 올라갔는가 — **추측하지 말고 센다**(#7). */
  reasons: Record<string, number>;
  /** 배율을 정하는 데 쓴 기준 획 수. 적으면 배율이 흔들린다. */
  anchorCount: number;
}

const empty = (): PromoteResult =>
  ({ promoted: new Map(), scale: 1, reasons: {}, anchorCount: 0 });

/**
 * **대기 획을 기존 3D 기하에 붙여 올린다.**
 *
 * `pending`은 아직 2D인 획, `placed`는 이미 확정된 3D(획 id → 세그먼트),
 * `placedInput`은 그 확정 획들의 `pts2d`·`axis`(다시 풀 때 필요하다).
 *
 * 아무것도 못 올리면 빈 결과다 — **실패가 아니라 여전히 대기**다(§9.1).
 */
export function promote(
  pending: LiftStroke[],
  placedInput: LiftStroke[],
  placed: Map<string, LiftSeg>,
  ctx: LiftCtx,
  cfg: LiftCfg = {},
): PromoteResult {
  const out = empty();
  if (!pending.length || !placed.size) {
    if (pending.length) out.reasons.no_committed_geometry = pending.length;
    return out;
  }
  const anchors = placedInput.filter(s => placed.has(s.id));
  if (anchors.length < 1) { out.reasons.no_committed_geometry = pending.length; return out; }

  // ---- 함께 푼다. **같은 `liftAll`이다** — 승격 전용 솔버를 따로 만들지 않는다(#17)
  const union = [...anchors, ...pending];
  const r = liftAll(union, ctx, cfg);
  if (!r.placed.size) {
    out.reasons.union_solve_failed = pending.length;
    return out;
  }

  // ---- 배율: 이미 놓인 것들이 정답을 안다. 최소제곱으로 하나 고른다
  let num = 0, den = 0, used = 0;
  for (const a of anchors) {
    const got = r.placed.get(a.id), want = placed.get(a.id);
    if (!got || !want) continue;
    used += 1;
    for (const [p, q] of [[got.a, want.a], [got.b, want.b]] as [Vec3, Vec3][]) {
      num += dot3(p, q); den += dot3(p, p);
    }
  }
  if (!used || !(den > 1e-18)) { out.reasons.scale_undetermined = pending.length; return out; }
  const k = num / den;
  out.scale = k; out.anchorCount = used;

  // ---- **확정 성분과 이어진 것만** 승격한다. 떨어진 덩어리는 배율이 안 전달된다
  const anchorIds = new Set(anchors.map(a => a.id));
  const live = new Set(r.component);
  const connected = r.component.length && r.component.some(id => anchorIds.has(id));

  for (const s of pending) {
    const got = r.placed.get(s.id);
    if (!got) {
      const why = r.unplaced.find(u => u.id === s.id)?.reason ?? "union_solve_dropped";
      out.reasons[why] = (out.reasons[why] ?? 0) + 1;
      continue;
    }
    if (!live.has(s.id) || !connected) {
      out.reasons.not_connected_to_committed = (out.reasons.not_connected_to_committed ?? 0) + 1;
      continue;
    }
    out.promoted.set(s.id, { a: mul3(got.a, k), b: mul3(got.b, k) });
  }
  return out;
}

/**
 * **승격이 기존 기하를 움직였는가**(사전 등록 판정 ③).
 *
 * 0이어야 한다 — 여기서 바뀌는 것은 대기 획뿐이다. 0이 아니면 그것은 승격이 아니라
 * 재계산이고, 사용자가 그린 것이 매번 미끄러진다.
 *
 * ⚠ **이것은 항등이 아니다.** `promote`가 `placed`를 **읽기만 하고 안 쓰는 것**을 검사하지만,
 * 잘못 구현하면(다시 푼 값으로 덮으면) 실제로 0이 아니게 된다 — 되살릴 수 있는 검사다.
 */
export function committedDrift(
  before: Map<string, LiftSeg>, after: Map<string, LiftSeg>,
): number {
  let m = 0;
  for (const [id, b] of before) {
    const a = after.get(id);
    if (!a) { m = Infinity; continue; }
    m = Math.max(m, norm3(sub3(a.a, b.a)), norm3(sub3(a.b, b.b)));
  }
  return m;
}

/**
 * **승격의 두 번째 기전 — 앵커로 올린다**(L-B.7이 측정으로 찾았다).
 *
 * `promote`(일괄 재풀이)는 **회수율이 0이었다.** 사유가 `축이 미분류다`(지배항)와
 * `구조에 이어지지 않았다`인데 둘 다 **획 하나의 성질**이라 문맥을 더 준다고 안 바뀐다.
 * §9.1의 "§5.4의 일괄 풀이를 재사용한다"는 **이 구현에서 아무것도 회수하지 못한다.**
 *
 * 실제로 회수하는 것은 **§3·§7의 실시간 경로**다 — 대기 획의 **시작점이 새로 놓인 기하에
 * 붙으면** 그 획은 앵커를 얻고, 앵커가 있으면 축 판정이 **다른 문제가 된다**(L-B.4가 쟀다:
 * 확정 시점 0.56 대 앵커 0.79). 즉 **승격은 "다시 푸는 것"이 아니라 "앵커가 생기는 것"이다.**
 *
 * 호출자가 스냅과 축 판정을 주입한다 — `snap.ts`·`liveLine.ts`를 여기서 import하면
 * 기하 계층이 UI 계층을 알게 된다. **앱과 하네스가 같은 주입을 쓴다**(#17).
 */
export function promoteByAnchor(
  pending: LiftStroke[],
  resolveOne: (s: LiftStroke) => { seg: [Vec3, Vec3] | null; why: string },
): { promoted: Map<string, LiftSeg>; reasons: Record<string, number> } {
  const promoted = new Map<string, LiftSeg>();
  const reasons: Record<string, number> = {};
  for (const s of pending) {
    const r = resolveOne(s);
    if (r.seg) promoted.set(s.id, { a: r.seg[0], b: r.seg[1] });
    else reasons[r.why] = (reasons[r.why] ?? 0) + 1;
  }
  return { promoted, reasons };
}

export { LIFT_TOL, findJoints, components, frameOf };
export type { Frame };
