// **확정 규칙에 획을 먹이는 경로** — `rule_camera`와 `rule_gate`가 함께 쓴다.
//
// 왜 따로 뺐는가: 2026-08-17 8차 지시가 **중단 조건 게이트의 사정거리**를 지적했다 —
// `camera_gate`는 소실점을 **직접 주고** `recoverCamera`만 부르므로 확정 규칙
// (`stepRule`·`resolve2dCore`)의 변경이 그 원장을 **한 자리도 안 움직인다.**
// 그 경로 전체를 재는 게이트(`rule_gate`)를 새로 두려면 이 먹이기가 두 하네스에 필요하다.
// **복사하지 않고 옮겼다** — 복사본이 갈라지면 두 원장이 다른 것을 재게 된다(PITFALLS #17·#27).
//
// ⚠ 옮기기는 **동작 불변**이어야 한다. `rule_camera.json`을 재실행해 이동 전후가
// 같은 값인지 확인한다(그 확인 자체가 이 파일이 옳게 옮겨졌다는 증거다).
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { representative } from "../src/s3d/axis.js";
import {
  newRuleState, stepRule, vpsOf, perspectiveOrder, sepDeg,
  type RuleState, type RLine,
} from "../src/s3d/vpRules.js";
// **스냅 팔**(5차 이월-2) — 앱이 확정 전에 쓰는 2D 판정 그 함수다(#17: mainL과 같은 출처)
import { resolve2dCore, OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import type { Scene, DrawnEdge } from "./scene3d.js";

/** 규칙 먹이기의 입력 — 참 장면과 그 위에 그은 획들. */
export interface RuleFx { sc: Scene; drawn: DrawnEdge[] }

export interface RuleRun {
  st: RuleState;
  /** 물음이 몇 번 났는가 — **참 축으로 답했다**(오라클). 사용자가 몇 번 개입해야 하는지의 척도다. */
  asks: number;
  /** 규칙이 안 받은 획 수. */
  rejected: number;
  /** 첫 소실점을 만든 두 선의 각차(도). **교점의 조건수**이고 오차의 지렛대다. */
  firstSep: number | null;
  /** 스냅/위약 팔에서 **실제로 끝점이 움직인 획 수**(#38 분자). 원시 팔은 0. */
  snapEngaged: number;
  /** 2D 판정을 지난 획 수(#38 **분모** — 리뷰어 [22]. 확정 후 획은 앱에서도 안 지난다). */
  snapQueried: number;
  /** 끝점 오스냅 현의 vpdir 강제 발동 수(7차 D-L69 ② — 3·4-R [5]). */
  osnapVpdirForced: number;
  /** 첫 소실점(two_lines)을 만든 두 선 중 **끝점이 움직였던 것의 수**(0~2, 리뷰어 [22]).
   * two_lines가 안 났거나 원시 팔이면 null. */
  firstPairMoved: number | null;
  /** 최종 상태의 화면 축 슬롯 수 — 직교 스냅이 축을 무한원으로 편 것을 세는 재료(리뷰어 [23]②). */
  screenAxes: number;
}

export type RunMode = "raw" | "snap" | "placebo";
export type Order = "drawn" | "grouped" | "wide_pair";

/**
 * **획을 차례로 규칙에 넣는다** — 앱의 `feedStroke`와 같은 경로다(#17).
 *
 * `mode`(5차 이월-2 + 리뷰어 대응):
 *   `raw`     — 원시 선(4차까지의 하네스 조건).
 *   `snap`    — 확정(order≥1) 전 획을 앱의 2D 판정(`resolve2dCore`)에 통과시킨다.
 *   `placebo` — **같은 획에서 스냅이 옮겼을 크기만큼 임의 방향으로** 끝점을 옮긴다(#39,
 *               리뷰어 [20]) — 나빠짐이 "스냅의 방향" 때문인지 "그 크기의 이동 일반" 때문인지 가른다.
 */
export function runRules(fx: RuleFx, order: Order, SZ: [number, number],
                         mode: RunMode = "raw",
                         radiusPx = OSNAP_RADIUS_PX, rr?: () => number,
                         opts: { noOrthoForce?: boolean } = {}): RuleRun {
  const list = orderStrokes(fx, order, SZ);
  let st = newRuleState();
  let asks = 0, rejected = 0, snapEngaged = 0, snapQueried = 0;
  /** **끝점 오스냅 현의 vpdir 강제 발동 수**(7차 D-L69 ② — 3·4-R [5]: 발동 0과 효과 0을
   *  가른다 #32·#7). resolve2dCore가 end2와 vpdir를 함께 낸 경우다. */
  let osnapVpdirForced = 0;
  let firstSep: number | null = null;
  let firstPairMoved: number | null = null;
  let prevWaiting: RLine | null = null;
  /**
   * **스냅 팔의 대기 획** — 앱의 `pend2Segs()` 자리. 여기 들어가는 것은 규칙에 먹인 최종
   * 선이다(앱이 스냅된 `pts2d`를 문서에 남기는 것과 같다).
   * ⚠ 근사 하나: 앱에서는 카메라가 서면 획이 3D로 올라가 3D 오스냅 대상이 되는데,
   * §4.5 보장(승격이 화면 자리를 안 옮긴다)으로 화면 좌표가 같으므로 2D 목록으로 근사한다.
   */
  const fedSegs: Snap2Seg[] = [];
  /** 먹인 선 좌표 → 끝점이 움직였는가(첫 짝 대조용 — 리뷰어 [22]). */
  const movedByKey = new Map<string, boolean>();
  const keyOf = (l: RLine) => `${l.a[0]},${l.a[1]},${l.b[0]},${l.b[1]}`;
  const diag = Math.hypot(SZ[0], SZ[1]);
  for (const e of list) {
    let pts = e.pts2d;
    let moved = false;
    /** **방향 스냅이 걸리면 그 축으로 강제한다**(5차 지시 3 — 앱과 같은 배선). 스냅 팔만. */
    let forcedBySnap: "screen" | "depth" | undefined;
    // **앱과 같은 조건**: 2D 판정(오스냅·직교·vp_dir·정렬)은 **카메라 확정 전**에만 돈다
    // (`mainL`: `frame() ? raw : resolve2d(raw)` — standing ⟺ order ≥ 1). 확정 후의 규칙
    // 입력은 앱에서도 원시 선이다(`feedStroke`가 3D 스냅보다 먼저 돈다).
    if (mode !== "raw" && perspectiveOrder(st) === 0) {
      snapQueried += 1;
      const cands = fedSegs.length ? static2dCandidates(fedSegs, diag) : [];
      const r2 = resolve2dCore(pts, { cands, vps: vpsOf(st), radiusPx, relSnap: true });
      const a0 = pts[0], b0 = pts[pts.length - 1];
      const a2 = r2.pts[0], b2 = r2.pts[r2.pts.length - 1];
      const dA = Math.hypot(a2[0] - a0[0], a2[1] - a0[1]);
      const dB = Math.hypot(b2[0] - b0[0], b2[1] - b0[1]);
      if (mode === "snap") {
        pts = r2.pts;
        moved = dA > 1e-9 || dB > 1e-9;
        // **스냅이 곧 선언이다**(5차 지시 3-a·b) — 직교면 화면 축, 소실점 방향이면 깊이.
        // 물음(판정)의 대상은 스냅이 안 걸린 자유 선뿐이다
        // **반사실 팔**(8차 `rule_gate`): `noOrthoForce`면 화면 직교 스냅이 축을 **선언하지
        // 않는다** — `stepRule`의 P1 가드(`forced !== "screen" && finiteHorizontals > 0`이면
        // 묻는다)가 그대로 선다. 앱 동작점은 `false`이고(mainL 2110과 같다, #17) 이 팔은
        // **그 우회가 원인인지**를 가르는 대조다(#39: 원인을 지목하려면 끄고 재 본다).
        forcedBySnap = (r2.ortho && !opts.noOrthoForce) ? "screen"
                     : r2.vpdir ? "depth" : undefined;
        if (r2.end2 && r2.vpdir) osnapVpdirForced += 1;
      } else {
        // **위약**: 같은 크기, 임의 방향(#39). 스냅이 안 움직였으면 위약도 안 움직인다
        if ((dA > 1e-9 || dB > 1e-9) && rr) {
          const th1 = 2 * Math.PI * rr(), th2 = 2 * Math.PI * rr();
          const ap: Pt2 = [a0[0] + dA * Math.cos(th1), a0[1] + dA * Math.sin(th1)];
          const bp: Pt2 = [b0[0] + dB * Math.cos(th2), b0[1] + dB * Math.sin(th2)];
          pts = [ap, bp];
          moved = true;
        }
      }
      if (moved) snapEngaged += 1;
    }
    const rep = representative(pts);
    if (!rep) continue;
    const line: RLine = { a: rep.a, b: rep.b };
    movedByKey.set(keyOf(line), moved);
    fedSegs.push({ id: `f${fedSegs.length}`, a: line.a, b: line.b });
    let r = stepRule(st, line, SZ, forcedBySnap);
    if (r.event.type === "ask") {
      asks += 1;
      // **참 축으로 답한다**(오라클). 답한 횟수를 남긴다 — 사람이 개입해야 하는 횟수다
      const truth: "screen" | "depth" | "vertical" =
        e.axis === 2 && !isFiniteVp(fx.sc.vps[2], SZ) ? "screen"
        : e.axis === 2 ? "vertical"
        : isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
      r = stepRule(st, line, SZ, truth);
    }
    if (r.event.type === "rejected") { rejected += 1; continue; }
    if (r.event.type === "vp_fixed" && r.event.source === "two_lines") {
      if (prevWaiting) firstSep = sepDeg(prevWaiting, line);
      if (mode !== "raw") {
        const partner = r.event.paired ? movedByKey.get(keyOf(r.event.paired)) : undefined;
        firstPairMoved = (moved ? 1 : 0) + (partner ? 1 : 0);
      }
    }
    prevWaiting = r.event.type === "waiting" ? line : prevWaiting;
    st = r.state;
  }
  const screenAxes = st.slots.filter(sl => sl && sl.kind === "screen").length;
  return { st, asks, rejected, firstSep, snapEngaged, snapQueried, osnapVpdirForced,
           firstPairMoved, screenAxes };
}

/** 대표 직선의 각차 — 순서를 고를 때 쓴다(측정용이고 규칙에는 안 들어간다). */
function repLine(e: DrawnEdge): RLine | null {
  const r = representative(e.pts2d);
  return r ? { a: r.a, b: r.b } : null;
}

/**
 * **그리는 순서**. 규칙 b가 "깊이선 **두 개**의 교점"이므로 어느 둘이 먼저 오는지가
 * 결과를 정한다 — 그래서 세 순서를 다 낸다.
 *
 * ⚠ `grouped`·`wide_pair`는 **참 축 라벨을 쓰는 순서 오라클**이다. 그 사실이 결론에 붙는다(#2).
 */
export function orderStrokes(fx: RuleFx, order: Order, SZ: [number, number]): DrawnEdge[] {
  if (order === "drawn") {
    // **축을 번갈아 긋는다** — 픽스처의 `boxLattice`가 이미 축별로 몰아 내므로
    // 그대로 쓰면 `grouped`와 **같은 순서가 되어 두 팔이 한 팔이 된다**(초판이 그랬다).
    // 모서리를 따라가며 그리는 사람에 가까운 순서다
    const byAxis: DrawnEdge[][] = [[], [], []];
    for (const e of fx.drawn) byAxis[e.axis].push(e);
    const out: DrawnEdge[] = [];
    for (let i = 0; ; i++) {
      let any = false;
      for (const ax of [0, 1, 2] as const) if (byAxis[ax][i]) { out.push(byAxis[ax][i]); any = true; }
      if (!any) break;
    }
    return out;
  }
  const grouped = [...fx.drawn].sort((a, b) => a.axis - b.axis);
  if (order === "grouped") return grouped;
  // wide_pair — **각차가 가장 큰 두 선을 먼저 긋는다.** 사용자가 벌어진 두 선을 고르는 경우이고,
  // 이 방식이 **얼마나 잘할 수 있는가**의 팔이다(#35 도달 가능성). 추정이 아니라 **순서 선택**이다
  const first = grouped.find(e => isFiniteVp(fx.sc.vps[e.axis], SZ) && e.axis !== 2);
  if (!first) return grouped;
  const same = grouped.filter(e => e.axis === first.axis);
  let best: [DrawnEdge, DrawnEdge] | null = null, bestSep = -1;
  for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) {
    const a = repLine(same[i]), b = repLine(same[j]);
    if (!a || !b) continue;
    const sp = sepDeg(a, b);
    if (sp > bestSep) { bestSep = sp; best = [same[i], same[j]]; }
  }
  if (!best) return grouped;
  const rest = grouped.filter(e => e !== best![0] && e !== best![1]);
  return [best[0], best[1], ...rest];
}
