// **차수가 P1에 갇히는가 — 그리고 그것이 배치에 무엇을 하는가**(2026-08-18 7차 지시 1).
// 산출: `stage0/out/order_lock.json`.
//
// ## 왜 새 하네스인가 — 구멍이 정확히 이 크기였다
//
// `rule_camera`는 **축 방향 오차**를 적었지만 **배치 귀결이 없었다**(그 하네스는 획을 3D로
// 안 올린다). `camera_gate`는 배치를 재지만 **소실점을 직접 받아** 규칙 경로를 안 지난다
// (HANDOFF의 "사정거리 밖"). 그래서 "차수가 P1에 갇힌다 → 조용히 틀린 배치"라는 연결이
// 두 원장 **사이로 샜다.** 여기가 그 자리다: **규칙이 세운 카메라로 그 획들을 올린다.**
//
// 착수 시 `PITFALLS.md`를 읽었다. 이 항목에 걸리는 번호:
//   #5   **무잡음 행은 항등에 가깝다** — 두 깊이선의 교점이 정의상 참 소실점이다.
//        그래도 여기서는 **뺄 수 없다**: 지시 1이 "끝점 지터 0인 가장 깨끗한 층에서 P1 60/60"을
//        문제로 지목했다. 그 층이 곧 관측 대상이므로 **층을 따로 낸다**(`by_jitter`)
//   #11  분모가 전부인가 — **카메라가 안 서는 실행도 센다**. 배치 분모는 **그은 획 전부**다
//   #12  동작점을 하나 고르지 않는다 — 잡음 5수준 × 등급 2 × 순서 2
//   #13  절단을 하나 고르지 않는다 — 0.1·0.2·0.5를 다 낸다(`silentWrong`)
//   #14  시드 여섯. 비율보다 **분자/분모**
//   #17  앱과 같은 함수 — `CamState.feed`·`CamState.axisOf`·`liftAll`. 규칙을 다시 안 짠다
//   #26  게이트 수치를 측정 전에 박는다(아래 `REGISTERED`)
//   #30  **양성 채널** — 우회를 되살린 팔(`bypass`)이 함께 돈다. 안 갈리면 이 하네스가 둔한 것이다
//   #32  미실행을 반증으로 처리하지 않는다 — `lift_calls`·`camera_ok`를 함께 남긴다
//   #35·#40 도달 가능성: **참 소실점 + 참 축 라벨** 오라클 팔(`oracle`)이 같은 픽스처를 돈다
//   #41  이것은 **이 항목이 등록한 게이트**이고 CLAUDE.md §2의 중단 조건이 아니다
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CamState } from "../src/ui/camState.js";
import { liftAll, type LiftStroke, type LiftCtx } from "../src/s3d/lift.js";
import { representative, type Axis } from "../src/s3d/axis.js";
import { isFiniteVp, type Pt2 } from "../src/s3d/camera.js";
import { onePointFrame } from "../src/s3d/onePoint.js";
import { perspectiveOrder, vpsOf, classifyLine, type RLine } from "../src/s3d/vpRules.js";
import { resolve2dCore, OSNAP_RADIUS_PX } from "../src/s3d/resolve2d.js";
import { static2dCandidates, type Snap2Seg } from "../src/s3d/snap2d.js";
import { rng32, type InkGrade } from "../src/s3d/synthInk.js";
import { norm3, sub3 } from "../src/s3d/geom3d.js";
import { scene, boxLattice, drawEdges, groundPoint, round, median,
         type Scene, type DrawnEdge, type TrueEdge } from "./scene3d.js";
import { perStrokeError, silentWrong, rate, fraction, metricsSnapshot } from "./metrics.js";
import { constantsSnapshot } from "./constants.js";
import { gate } from "./gate.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = resolve(ROOT, "stage0", "out");
const SZ: [number, number] = [960, 672];

/** `rule_camera`·`camera_gate`와 **같은 다섯 구도**다(#27 — 대역을 다른 픽스처에서 안 가져온다). */
const COMPOSITIONS = [
  { name: "3pt_yaw35_pitch15", yaw: 35, pitch: 15, origin: [420, 470] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "3pt_yaw20_pitch25", yaw: 20, pitch: 25, origin: [400, 500] as Pt2, box: [1.0, 1.2, 0.9] },
  { name: "3pt_yaw50_pitch8", yaw: 50, pitch: 8, origin: [450, 520] as Pt2, box: [1.2, 0.8, 1.0] },
  { name: "2pt_yaw35_pitch0", yaw: 35, pitch: 0, origin: [420, 500] as Pt2, box: [1.1, 0.9, 0.8] },
  { name: "1pt_yaw0_pitch0", yaw: 0, pitch: 0, origin: [230, 500] as Pt2, box: [1.1, 1.8, 0.8] },
];
const JITTERS = [0, 0.005, 0.01, 0.03, 0.05];
const GRADES: InkGrade[] = ["precise", "medium"];
const SEEDS = [1, 2, 3, 4, 5, 6];

/**
 * **사전 등록**(#26). ⚠ 이 게이트는 **이 항목이 등록한 것**이고 CLAUDE.md §2의 중단 조건
 * (L-A.7 실측 축 오차 0.5°)이 **아니다**(#41 — 같은 말로 부르지 않는다).
 *
 * 지시 1-b가 정한 통과선 그대로다: *"바닥을 벗어나는 조건을 만든다. 차수가 풀린 뒤 다시 재면
 * 0이 아닌 값이 나와야 한다. 안 나오면 다른 원인이 남은 것이다."*
 *
 * 1. **차수가 풀린다** — `fixed` 팔의 P1 실행 수가 `bypass` 팔보다 **적다**.
 * 2. **바닥을 벗어난다** — `fixed` 팔의 **절단 0.2 안에 든 배치가 0이 아니다**
 *    (= `silent_wrong.cut_0_2`의 분자 < 분모). 지시 1-b가 지목한 바닥이 그 1.0이다.
 */
const REGISTERED =
  "① 차수가 풀린다: `fixed`(우회 제거) 팔의 P1 실행 수 < `bypass`(우회 살림, 양성 채널 #30) 팔의 P1 실행 수. "
  + "② 바닥을 벗어난다: `fixed` 팔의 **절단 0.2 안에 든 배치가 0이 아니다** "
  + "(`arms.fixed.headline.silent_wrong.cut_0_2`의 분자 < 분모). 지시 1-b의 '바닥'이 그 1.0이다. "
  + "모집단은 5구도 × 6시드 × 등급 2 × 잡음 {0,0.005,0.01,0.03,0.05} × 순서 2 = 600실행이고 "
  + "**카메라가 안 서는 실행도 분모에 든다**(#11). 배치 분모는 **그은 획 전부**다(놓인 것만 세면 "
  + "안 놓인 것이 공짜로 사라진다 — #10·#11). "
  + "**[8차 지시 1-d 추가 등록]** ③ **양쪽을 함께 잰다**: `fixed` 팔의 절단 0.2 안 배치"
  + "(`within_cut_0_2`)가 `bypass`보다 **안 줄고**, 절단 0.5 밖 파국(`beyond_cut_0_5`)이 "
  + "**안 는다**. ①·②가 각각 한쪽만 봐서 **'중앙은 2.33배 좋아지고 잘 놓인 것은 176 → 46으로 "
  + "주는' 개입을 통과시켰기** 때문이다. ⚠⚠ 셋 다 **팔 사이**(fixed ↔ bypass) 비교라 "
  + "**커밋 사이**의 변화는 여전히 못 잡는다 — 그 값은 이전 커밋의 원장에서 읽는다. "
  + "**[9차 항목 1 추가 등록]** ④ **가드의 대조는 `bypass`가 아니라 `guard_off`다**(9-R′ [R2]): "
  + "`fixed` ↔ `guard_off`에서도 ③과 같은 두 지표를 낸다 — `within_cut_0_2`가 안 줄고 "
  + "`beyond_cut_0_5`가 안 는다. ⚠⚠ **이 조항은 실패해 왔다** — 값은 result의 "
  + "`beyond_cut_0_5_fixed` ↔ `_guard_off`를 그 자리에서 읽는다(연혁: 9차 1923 → 1965 · "
  + "10차 D-L85(반경 8) 후 2110 → 2115). "
  + "**실패를 적고 기준을 안 낮춘다**(#26·#35) — D-L80을 되돌리는 근거가 아니라 "
  + "**그 개입의 대가가 등록된 형태로 원장에 남는다**는 뜻이다. "
  + "⚠ 이것은 이 항목이 등록한 게이트이고 CLAUDE.md §2의 중단 조건이 아니다(#41).";

// ---------------------------------------------------------------- 픽스처

interface Fx { sc: Scene; edges: TrueEdge[]; drawn: DrawnEdge[]; diag: number }

/**
 * **상자 둘 픽스처**(2026-08-18 8차 2차 지시 1-d). 지시가 물은 것: *"합성 하네스가 이
 * 구간을 만들어내는 조건이 실사용과 같은지 확인한다. 실획에서는 사용자가 계속 그으므로
 * 결국 확정될 수 있다."*
 *
 * ⚠⚠ **세분(`k=2`)으로 획을 늘리면 안 된다** — `boxLattice`의 `step = a/k`라 늘어난 획이
 * **1/k 길이**가 되고, 그러면 `min_vp_len_ratio`에 더 걸려 **반대 방향으로 간다**
 * (`DEFERRED`의 "지렛대가 긴 획으로 획 수 늘리기" 리뷰어 [10]이 그 자리다).
 * 그래서 **같은 크기의 상자를 하나 더** 놓는다 — 획 길이는 그대로이고 수만 두 배다.
 * 이것이 "사용자가 계속 그었다"의 가장 단순한 합성판이다(A-3).
 */
const SECOND_BOX_OFFSET: Pt2 = [170, -25];

function fixture(ci: number, jit: number, grade: InkGrade, seed: number,
                 boxes: 1 | 2 = 1): Fx | null {
  const C = COMPOSITIONS[ci];
  const sc = scene(C.yaw, C.pitch, 1000, SZ);
  const O = groundPoint(sc, C.origin);
  if (!O) return null;
  let edges = boxLattice(sc, O, C.box[0], C.box[1], C.box[2], 1);
  if (boxes === 2) {
    const O2 = groundPoint(sc, [C.origin[0] + SECOND_BOX_OFFSET[0],
                                C.origin[1] + SECOND_BOX_OFFSET[1]]);
    if (!O2) return null;
    edges = [...edges, ...boxLattice(sc, O2, C.box[0], C.box[1], C.box[2], 1)];
  }
  const drawn = drawEdges(sc, edges, grade, rng32(seed * 7919 + ci * 131 + 1), 0.12, jit, 0);
  if (!drawn) return null;
  const ps = edges.flatMap(e => [e.a, e.b]);
  let diag = 0;
  for (const p of ps) for (const q of ps) diag = Math.max(diag, norm3(sub3(p, q)));
  return { sc, edges, drawn, diag };
}

/** 그리는 순서 둘(#12 — 동작점을 하나 고르지 않는다). `rule_camera`와 같은 정의다. */
type Order = "alternating" | "grouped";
function orderStrokes(fx: Fx, order: Order): DrawnEdge[] {
  if (order === "grouped") return [...fx.drawn].sort((a, b) => a.axis - b.axis);
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

// ---------------------------------------------------------------- 팔

/**
 * **팔은 요인 둘의 곱이다**(7-R 리뷰어 [6] — 옛 `oracle`은 소실점·축 라벨·규칙 사용을 한꺼번에
 * 바꿔서 배치 격차를 어디에도 귀속시킬 수 없었다). 이제 단일 요인 팔이 사이에 있다:
 *
 * | 팔 | 소실점 | 축 라벨 | 우회 |
 * |---|---|---|---|
 * | `bypass` | 규칙 | 규칙 | **살림**(양성 채널 #30 — 7차 지시 1-a가 지운 그것) |
 * | `fixed` | 규칙 | 규칙 | 없음(현행) |
 * | `rule_vp_true_axis` | 규칙 | **참** | 없음 — **오배정만** 뺀다 |
 * | `true_vp_rule_axis` | **참** | 규칙 | 없음 — **카메라 오차만** 뺀다 |
 * | `oracle` | **참** | **참** | — (도달 가능성 #35·#40) |
 */
type Arm = "bypass" | "fixed" | "rule_vp_true_axis" | "true_vp_rule_axis" | "oracle"
         | "fixed_true_f" | "fixed_f_half" | "fixed_f_double" | "guard_off";
const ARM_SPEC: Record<Arm, { bypass: boolean; vp: "rule" | "true"; axis: "rule" | "true";
                              trueF?: boolean; fMul?: number; guardOff?: boolean }> = {
  bypass:            { bypass: true,  vp: "rule", axis: "rule" },
  fixed:             { bypass: false, vp: "rule", axis: "rule" },
  rule_vp_true_axis: { bypass: false, vp: "rule", axis: "true" },
  true_vp_rule_axis: { bypass: false, vp: "true", axis: "rule" },
  oracle:            { bypass: false, vp: "true", axis: "true" },
  /**
   * **f만 참으로 바꾼다**(2026-08-18 8차 2차 지시 2-b). 소실점도 축 라벨도 규칙 그대로이고
   * **깊이 배율 하나만** 참값으로 준다.
   *
   * 왜 필요한가: P1의 f는 **임의값**이다(`P1_F_RATIO` — "깊이 배율일 뿐"이라는 D-L53의
   * 판단). 지시 2-b가 물은 것은 *"축 방향은 맞고 깊이 배율만 임의라면 형태 비례가 틀린다"*이고,
   * 그 물음은 **f 하나만 바꾼 팔**로만 답할 수 있다(#39 — 요인을 하나씩 뺀다).
   * ⚠ P2·P3에서는 f가 소실점에서 나오므로 이 팔이 그 차수에서는 거의 무변화여야 한다 —
   * **그 무변화가 이 팔의 위약 대조다**(#30: 안 움직여야 하는 곳이 안 움직이는가).
   */
  fixed_true_f:      { bypass: false, vp: "rule", axis: "rule", trueF: true },
  /**
   * **양성 채널 — f를 크게 흔든다**(2026-08-18 8-2R″ [2][12] · #30·#39).
   *
   * ⚠⚠ **`fixed_true_f`만으로는 아무것도 못 말한다**: 이 픽스처의 참 f는 **1000**이고
   * P1의 임의 f는 `P1_F_RATIO(1.0) × 960 = 960`이라 **개입이 4%뿐**이다. 무효과가
   * "f는 원인이 아니다"인지 **"f를 거의 안 옮겼다"**인지 갈리지 않는다(#32 —
   * 미실행을 반증으로 처리하지 않는다).
   *
   * → **×0.5 · ×2로 흔든다.** 그때도 형태 오차가 안 움직이면 **지표가 f에 둔감한 것**이고
   * (`perStrokeError`가 `fitGauge`로 전역 배율을 적합한다 — #35가 실증한 그 자리),
   * 움직이면 **4%가 작았을 뿐**이다. 둘은 정반대의 결론이다.
   */
  fixed_f_half:      { bypass: false, vp: "rule", axis: "rule", fMul: 0.5 },
  fixed_f_double:    { bypass: false, vp: "rule", axis: "rule", fMul: 2 },
  /**
   * **양성 채널 — 판정 뒤집기 가드를 끈다**(2026-08-18 9차 항목 0 · D-L80 · 9-R [H3]).
   *
   * ⚠⚠ **이 팔이 없으면 D-L80의 귀결이 커밋 사이 비교뿐이다.** 이 원장의 등록 게이트가
   * 스스로 "셋 다 **팔 사이** 비교라 **커밋 사이의 변화는 못 잡는다**"고 적는데,
   * 초판은 P0 140 → 122를 **이전 커밋의 원장**과 비교해 놓고 그것을 양성 채널이라 불렀다
   * (#30 위반 — 리뷰어가 잡았다). 여기서는 **같은 실행 안에서** 갈린다:
   * `fixed`(가드 켬) ↔ `guard_off`(가드 끔)이고 나머지는 전부 같다.
   */
  guard_off:         { bypass: false, vp: "rule", axis: "rule", guardOff: true },
};

const trueAxis = (sc: Scene, i: 0 | 1 | 2): Axis => (isFiniteVp(sc.vps[i], SZ) ? i : "screen");
const trueVps = (sc: Scene): (Pt2 | null)[] =>
  [0, 1, 2].map(i => (isFiniteVp(sc.vps[i as 0 | 1 | 2], SZ) ? sc.vps[i as 0 | 1 | 2] : null));

interface RunOut {
  order: number;
  cameraOk: boolean;
  /** 그은 획 수(배치 분모 — #11). */
  drawnN: number;
  placedN: number;
  errs: number[];
  asks: number;
  /** 규칙에 실제로 먹인 획 수(#32 — 입력이 0이면 그 실행은 기전에 대한 정보가 0이다). */
  fed: number;
  /**
   * **무엇이 먼저 선언됐는가**(#7 — "왜 안 되는지 추측하지 말고 카운터를 넣는다").
   * `screen_h`가 먼저면 그 순간 P1이 굳고 되돌릴 길이 없다(지시 1: P1은 불가역).
   */
  firstDecl: "screen_h" | "screen_v" | "vp" | "none";
  /** **물음 종류별 내역**(7-R [4-F] · #7) — "남는 물음이 전부 screen_or_depth"를 세서 확인한다. */
  askKinds: Record<string, number>;
  /**
   * **왜 카메라가 안 섰는가**(2026-08-18 8차 2차 지시 1-a·1-b). `order === 0`일 때만 채운다.
   *
   * 항목 1이 P1 잠김을 열자 `p0`가 **7 → 140실행**으로 늘었고 그 실행들은 **획을 긋고
   * 하나도 안 놓는다**. "카메라가 안 선다"를 한 덩어리로 두면 무엇을 고쳐야 하는지
   * 안 갈린다 — 지시 1-a가 물은 셋(깊이선이 하나뿐인가 · 둘인데 안 갈리는가 ·
   * 화면 수평만 있는가)을 **상태에서 직접 읽어** 센다(#7 — 추측하지 말고 카운터).
   */
  p0?: {
    /** 유한 수평 소실점 슬롯 수(0 또는 1 — 2 이상이면 P2라 여기 안 온다). */
    nH: 0 | 1;
    /** 화면 가로축 슬롯이 섰는가. */
    screenH: boolean;
    /** **아직 소실점을 못 만든 깊이선** 수(`RuleState.depthLines`). */
    pending: number;
    /** 대기 깊이선들 사이 **최대 각차**(도). 작으면 "둘인데 같은 축"이다. */
    pendingMaxSepDeg: number | null;
    reason: string;
  };
  /**
   * **몇 번째 획에서 카메라가 섰는가**(1-based, 규칙에 넣은 순서). 끝까지 안 서면 `null`.
   * **지시 1-d의 판정자다**: 이 분포가 획 예산(상자 하나 = 12획)의 **끝에 몰려 있으면**
   * P0의 일부는 **하네스가 획을 그만 준 것**이지 규칙이 못 세운 것이 아니다(#32).
   */
  stoodAt: number | null;
  /** **1점 직접 좌표 경로가 열리는가**(지시 2-a) — 앱은 이때 `directSegment`로 간다. */
  opfFires: boolean;
  /** **이 실행이 실제로 쓴 f와 참 f**(#39 — 개입의 크기를 기록한다). */
  fUsed: number | null;
  fTrue: number | null;
  /** **어디서 멈췄는가**(지시 1-b) — 거절 사유별 횟수. `why` 문자열을 안정 키로 접는다. */
  rejects: Record<string, number>;
  /** **획 하나가 어떤 사건이 됐는가**(지시 1-b) — `waiting`이 몇 개인지가 대기 깊이선의 출처다. */
  events: Record<string, number>;
  /**
   * **참 축이 깊이인 획이 무엇이 됐는가**(지시 1-a). `events`만으로는 "깊이선이 하나뿐"의
   * 원인이 안 갈린다 — 깊이 획이 애초에 적은 것인지, 있는데 다른 사건이 된 것인지.
   * 키는 `` `${depth|screen}/${event}` ``이고 분모는 **규칙에 넣은 획 전부**다.
   */
  truthEvents: Record<string, number>;
}

/**
 * 거절 사유(`why`는 사람이 읽는 산문이다)를 **안정 키**로 접는다.
 * ⚠ 산문을 그대로 키로 쓰면 문구를 고칠 때 원장이 소리 없이 갈라진다(#23과 같은 자리).
 */
function rejectKey(why: string): string {
  if (why.includes("한 점")) return "degenerate";
  if (why.includes("짧아")) return "too_short";
  if (why.includes("2점이 확정")) return "p2_fixed_no_screen_h";
  if (why.includes("수평 축이 이미 둘")) return "both_h_slots_taken";
  if (why.includes("수직축은 이미 유한")) return "v_is_finite_vp";
  if (why.includes("기존 소실점을 향하지")) return "off_axis_p1";
  if (why.includes("어긋납니다")) return "off_axis_p2";
  if (why.includes("발산")) return "horizon_parallel";
  if (why.includes("무한원")) return "second_vp_at_infinity";
  return "fov_or_other";
}

function runOne(fx: Fx, order: Order, arm: Arm): RunOut {
  const spec = ARM_SPEC[arm];
  const list = orderStrokes(fx, order);
  const diag = Math.hypot(SZ[0], SZ[1]);
  const cam = new CamState(SZ);
  let asks = 0, fed = 0;
  let firstDecl: RunOut["firstDecl"] = "none";
  const askKinds: Record<string, number> = {};
  const rejects: Record<string, number> = {};
  const events: Record<string, number> = {};
  const truthEvents: Record<string, number> = {};
  let stoodAt: number | null = null, fedIdx = 0;
  let fUsed: number | null = null, fTrue: number | null = null;
  /** 앱의 `pend2Segs()` 자리 — 확정 전 2D 오스냅 대상. `rule_camera`와 같은 근사다. */
  const fedSegs: Snap2Seg[] = [];
  /** 규칙에 먹인 최종 점열(= 앱의 `pts2d`). 배치도 이것으로 한다 — 앱이 그렇게 한다(#17). */
  const finalPts: Pt2[][] = [];

  // **참 소실점 팔도 규칙을 돌린다** — 축 라벨이 규칙에서 와야 하고(`true_vp_rule_axis`),
  // 차수 카운터도 같은 조건에서 나와야 비교가 된다. `oracle`만 규칙을 안 쓴다.
  if (arm === "oracle") {
    for (const e of list) finalPts.push(e.pts2d as Pt2[]);
  } else {
    for (const e of list) {
      let pts = e.pts2d as Pt2[];
      let forced: "screen" | "depth" | undefined;
      // **앱과 같은 조건**: 확정 전(order 0)에만 2D 판정이 돈다(`mainL.onStrokeEnd`)
      if (perspectiveOrder(cam.rules) === 0) {
        const cands = fedSegs.length ? static2dCandidates(fedSegs, diag) : [];
        const r2 = resolve2dCore(pts, { cands, vps: vpsOf(cam.rules),
                                        radiusPx: OSNAP_RADIUS_PX, relSnap: true,
                                        // **D-L80의 양성 채널**(#30) — 이 팔만 옛 거동이다
                                        kindFlipGuard: !spec.guardOff });
        pts = r2.pts;
        // ⚠ **여기가 갈리는 유일한 지점이다** — 우회를 살릴 것인가.
        if (spec.bypass) forced = r2.ortho ? "screen" : r2.vpdir ? "depth" : undefined;
      }
      const rep = representative(pts);
      if (!rep) { events.no_representative = (events.no_representative ?? 0) + 1; continue; }
      const line: RLine = { a: rep.a, b: rep.b };
      fedSegs.push({ id: `f${fedSegs.length}`, a: line.a, b: line.b });
      finalPts.push(pts);
      let r = cam.feed(line, forced);
      if (r.event.type === "ask") {
        asks += 1;
        // **자리까지 센다**(2026-08-18 8차 지시 2-a) — `question`만으로는 남은 물음이
        // `screen_or_depth` 한 덩어리로 보여 **무엇을 없앨 수 있는지 못 가른다.**
        // `ambiguous`는 지시 2-b가 커서로 가르라는 **진짜 모호**이고,
        // `p1_guard`는 불가역 전이의 안전 물음이라 **없앨 대상이 아니다**.
        const key = `${r.event.question}/${r.event.site}`;
        askKinds[key] = (askKinds[key] ?? 0) + 1;
        // **참 축으로 답한다**(오라클) — `rule_camera`와 같은 규약이다
        const truth: "screen" | "depth" =
          // ⛔ **"vertical" 답을 지웠다**(7차 지시 3-b) — 기울어진 선은 항상 깊이선이다.
          // 유한 소실점을 가진 축이면 깊이, 화면 평행이면 화면 축이다
          isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
        r = cam.feed(line, truth);
      }
      if (r.applied) fed += 1;
      if (r.event.type === "rejected") {
        const k = rejectKey(r.event.why);
        rejects[k] = (rejects[k] ?? 0) + 1;
      }
      // **획 하나당 사건 하나**(물음에 답한 뒤의 최종 사건). 분모는 규칙에 넣은 획 수다.
      events[r.event.type] = (events[r.event.type] ?? 0) + 1;
      // **참 축과 함께 센다** — 깊이 획이 `support`·`rejected`로 새는지 여기서 보인다
      const truth = isFiniteVp(fx.sc.vps[e.axis], SZ) ? "depth" : "screen";
      const tk = `${truth}/${r.event.type}`;
      truthEvents[tk] = (truthEvents[tk] ?? 0) + 1;
      fedIdx += 1;
      if (stoodAt == null && perspectiveOrder(cam.rules) >= 1) stoodAt = fedIdx;
      if (firstDecl === "none") {
        if (r.event.type === "screen_axis") firstDecl = r.event.dir === "h" ? "screen_h" : "screen_v";
        else if (r.event.type === "vp_fixed") firstDecl = "vp";
      }
    }
  }

  const ord = arm === "oracle" ? 0 : cam.order();
  // **P0의 사유를 상태에서 직접 읽는다**(지시 1-a). `oracle` 팔은 규칙을 안 돌므로 뺀다.
  const p0 = (ord === 0 && arm !== "oracle") ? p0Diag(cam) : undefined;
  // ---- 배치. **여기가 이 하네스의 존재 이유다**(rule_camera에 없던 귀결)
  let ctx: LiftCtx | null = null;
  if (spec.vp === "true") {
    ctx = { principal: fx.sc.principal, f: fx.sc.f, vps: trueVps(fx.sc), imgSize: SZ };
  } else {
    const c = cam.ctx();
    ctx = c ? { principal: c.principal, f: c.f, vps: c.vps, imgSize: SZ, axisDirs: c.axisDirs } : null;
    // **f만 참으로**(지시 2-b) — 소실점·축 라벨은 규칙 그대로다
    if (ctx && spec.trueF) ctx = { ...ctx, f: fx.sc.f };
    // **f를 배수로 흔든다**(양성 채널 · 8-2R″ [2][12])
    if (ctx && spec.fMul) ctx = { ...ctx, f: ctx.f * spec.fMul };
    // **개입의 크기를 기록한다**(#39의 나머지 절반) — 안 적으면 무효과가
    // "원인이 아니다"인지 "안 옮겼다"인지 갈리지 않는다
    if (ctx) { fUsed = ctx.f; fTrue = fx.sc.f; }
  }
  // **앱의 1점 직접 좌표 경로가 이 상태에서 열리는가**(지시 2-a).
  //
  // ⚠⚠ **이 하네스는 `liftAll`만 부른다.** 앱(`mainL`)은 1점 시점에서 `onePointFrame`이
  // 서면 `directSegment`로 간다(D-L77). 그 갈림이 실재하면 **이 하네스의 P1 중앙 1.69는
  // 앱을 서술하지 않는다**(#17 — 측정 경로와 앱 경로가 갈라진다). 그래서 **판정만 세어
  // 둔다** — 직접 경로를 여기서 돌리지는 않는다(그것은 앱 배선을 하네스에 복제하는 일이라
  // #17을 반대 방향으로 어긴다).
  const opfFires = ctx?.axisDirs ? onePointFrame(ctx.axisDirs) != null : false;
  const axes: Axis[] = spec.axis === "true"
    ? list.map(e => trueAxis(fx.sc, e.axis))
    : finalPts.map(p => cam.axisOf(p).axis);
  if (!ctx) return { order: ord, cameraOk: false, drawnN: list.length, placedN: 0, errs: [],
                     asks, fed, firstDecl, askKinds, p0, rejects, events, truthEvents, stoodAt,
                     opfFires: false, fUsed: null, fTrue: null };
  const strokes: LiftStroke[] = finalPts.map((pts, i) => ({
    // ⚠ **키 규약**: `metrics.edgeIndexOf`가 `s<인덱스>`를 참 모서리 인덱스로 읽는다.
    // `list`는 순서를 바꾼 것이므로 **원래 인덱스**를 붙여야 참값과 짝이 맞는다
    id: `s${fx.drawn.indexOf(list[i])}`, pts2d: pts, axis: axes[i],
  }));
  const r = liftAll(strokes, ctx);
  const errs = perStrokeError(r.placed, fx.edges, fx.diag);
  return { order: ord, cameraOk: true, drawnN: list.length, placedN: r.placed.size, errs,
           asks, fed, firstDecl, askKinds, p0, rejects, events, truthEvents, stoodAt,
           opfFires, fUsed, fTrue };
}

/**
 * **P0의 사유**(지시 1-a). 상태에서 직접 읽으므로 추정이 없다(#7).
 *
 * `perspectiveOrder`가 0을 내는 조건은 둘뿐이다 — 유한 수평 소실점이 **둘 미만**이고,
 * (**가로선 + 소실점 하나**)도 아니다. 그 안을 넷으로 가른다:
 *
 * | 사유 | 상태 | 지시 1-a의 물음 |
 * |---|---|---|
 * | `vp_but_no_screen_h` | 소실점 1 · 가로선 없음 | — (P1에 한 걸음 모자라다) |
 * | `one_depth_line` | 소실점 0 · 대기 깊이선 1 | "깊이선이 하나뿐인가" |
 * | `depth_lines_no_vp` | 소실점 0 · 대기 ≥2 | "둘인데 같은 축인지 안 갈리는가" |
 * | `screen_h_only` | 소실점 0 · 대기 0 · 가로선 있음 | "화면 수평만 있는가" |
 * | `nothing` | 아무것도 안 섰다 | — |
 *
 * `pendingMaxSepDeg`가 `depth_lines_no_vp`를 다시 가른다: **작으면 같은 축**(평행이라
 * 교점이 무한원), 크면 각차는 충분한데 다른 이유로 못 세운 것이다.
 */
function p0Diag(cam: CamState): NonNullable<RunOut["p0"]> {
  const st = cam.rules;
  const nH = ([0, 1] as const).filter(i => st.slots[i]?.kind === "vp").length as 0 | 1 | 2;
  const screenH = ([0, 1] as const).some(i => {
    const s = st.slots[i];
    return s != null && s.kind === "screen" && s.dir === "h";
  });
  const pend = st.depthLines;
  let maxSep: number | null = null;
  if (pend.length >= 2) {
    maxSep = 0;
    const ang = (l: RLine) => Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]);
    for (let i = 0; i < pend.length; i++) {
      for (let j = i + 1; j < pend.length; j++) {
        let d = Math.abs(ang(pend[i]) - ang(pend[j])) * 180 / Math.PI;
        d = d % 180; if (d > 90) d = 180 - d;      // 선의 각차는 [0, 90]
        maxSep = Math.max(maxSep, d);
      }
    }
    maxSep = round(maxSep, 4);
  }
  // ⚠ `depth_lines_no_vp`를 **둘로 가른다**(지시 1-a "둘인데 갈리는가"의 답이 여기서 갈린다):
  //   · `pending_2_awaiting_third` — 대기가 **정확히 둘**이다. `resolvePool` ③이
  //     "둘뿐이면 대기"라 **설계대로** 안 세운다(셋째 선 요구 — 6차 지시 11).
  //   · `pending_3plus_no_candidate` — 셋 이상인데도 못 세운다. 그때는 **후보 문**
  //     (`beyondSegment`·이음점 병합·무한원)이 짝을 전부 걸렀다는 뜻이라 성질이 다르다.
  const reason =
    nH >= 1 ? "vp_but_no_screen_h"
    : pend.length === 2 ? "pending_2_awaiting_third"
    : pend.length >= 3 ? "pending_3plus_no_candidate"
    : pend.length === 1 ? "one_depth_line"
    : screenH ? "screen_h_only"
    : "nothing";
  return { nH: (nH >= 1 ? 1 : 0), screenH, pending: pend.length,
           pendingMaxSepDeg: maxSep, reason };
}

// ---------------------------------------------------------------- 집계

interface Bag {
  runs: number; cameraOk: number;
  orders: Record<string, number>;
  drawnN: number; placedN: number; errs: number[];
  asks: number; fed: number;
  firstDecl: Record<string, number>;
  askKinds: Record<string, number>;
  /**
   * **차수별 분해**(2026-08-18 8차 지시 1-a). 항목 1이 P1 잠김을 풀자 **중앙 형태 오차는
   * 2.33배 좋아졌는데 절단 0.2 안에 든 배치가 176 → 46으로 줄었다.** 집계만 보면 그
   * 130이 어디로 갔는지 알 수 없다 — P1에서는 틀리더라도 놓였고 P2에서는 안 놓이는가,
   * 아니면 P0(카메라가 안 섬)으로 빠졌는가. **층 내 개선과 층 구성 변화를 가른다**(#9).
   */
  byOrder: Record<string, { runs: number; drawnN: number; placedN: number; errs: number[];
                            runsWithinCut: number }>;
  /**
   * **P0 실행의 사유별 분해**(2026-08-18 8차 2차 지시 1-a). 분모는 **그 팔의 P0 실행 전부**이고,
   * `drawnN`을 함께 세어 "몇 획을 긋고 0을 놓는가"를 사유별로도 낸다(#11 — 분모가 전부다).
   */
  p0: Record<string, { runs: number; drawnN: number; pending: number[]; maxSep: number[];
                       rejects: Record<string, number>; events: Record<string, number>;
                       truthEvents: Record<string, number> }>;
  /** **거절 사유별 횟수**(지시 1-b) — 어디서 멈추는가. */
  rejects: Record<string, number>;
  /** **사건 종류별 횟수**(지시 1-b). */
  events: Record<string, number>;
  /** **카메라가 선 획 번호**(지시 1-d). `null`(끝까지 안 섬)은 따로 센다. */
  stoodAt: number[];
  neverStood: number;
  /** **1점 직접 좌표 경로가 열린 실행 수**(지시 2-a). */
  opfFires: number;
  /** **f 개입의 크기**(#39) — 이 팔이 쓴 f / 참 f. */
  fRatios: number[];
}
const orderBag = () => ({ runs: 0, drawnN: 0, placedN: 0, errs: [] as number[],
                          /** **실행 단위 성공 수**(2026-08-18 11차 리뷰어 [3] · #11):
                           *  한 실행의 획들은 **같은 카메라**를 공유하므로 배치는 독립 시행이
                           *  아니다. 절단 0.2 안이 하나라도 난 **실행 수**를 따로 센다 —
                           *  포아송 검정의 단위가 이것이다. */
                          runsWithinCut: 0 });
const bag = (): Bag => ({ runs: 0, cameraOk: 0, orders: { p0: 0, p1: 0, p2: 0, p3: 0 },
                          drawnN: 0, placedN: 0, errs: [], asks: 0, fed: 0,
                          firstDecl: { screen_h: 0, screen_v: 0, vp: 0, none: 0 },
                          askKinds: {},
                          byOrder: { p0: orderBag(), p1: orderBag(),
                                     p2: orderBag(), p3: orderBag() },
                          p0: {}, rejects: {}, events: {}, stoodAt: [], neverStood: 0, opfFires: 0, fRatios: [] });

function add(b: Bag, r: RunOut) {
  b.runs += 1;
  if (r.cameraOk) b.cameraOk += 1;
  b.orders[`p${r.order}`] += 1;
  b.drawnN += r.drawnN; b.placedN += r.placedN;
  for (const e of r.errs) b.errs.push(e);
  b.asks += r.asks; b.fed += r.fed;
  b.firstDecl[r.firstDecl] += 1;
  for (const [k, n] of Object.entries(r.askKinds)) b.askKinds[k] = (b.askKinds[k] ?? 0) + n;
  // **차수별로도 같은 것을 센다**(8차 지시 1-a) — 분모는 그 차수의 **그은 획 전부**다(#11)
  const o = b.byOrder[`p${r.order}`];
  o.runs += 1; o.drawnN += r.drawnN; o.placedN += r.placedN;
  for (const e of r.errs) o.errs.push(e);
  if (r.errs.some(e => e <= 0.2)) o.runsWithinCut += 1;
  // **P0 사유별**(지시 1-a) · **거절 사유별**(1-b)
  if (r.p0) {
    const q = (b.p0[r.p0.reason] ??= { runs: 0, drawnN: 0, pending: [], maxSep: [],
                                       rejects: {}, events: {}, truthEvents: {} });
    q.runs += 1; q.drawnN += r.drawnN; q.pending.push(r.p0.pending);
    if (r.p0.pendingMaxSepDeg != null) q.maxSep.push(r.p0.pendingMaxSepDeg);
    // **그 사유의 실행 안에서만** 거절·사건을 센다(지시 1-b) — 전체 집계는 P2 실행에
    // 지배되므로 "P0에서 어디서 멈추는가"를 못 낸다(#9 층 구성).
    for (const [k, n] of Object.entries(r.rejects)) q.rejects[k] = (q.rejects[k] ?? 0) + n;
    for (const [k, n] of Object.entries(r.events)) q.events[k] = (q.events[k] ?? 0) + n;
    for (const [k, n] of Object.entries(r.truthEvents)) q.truthEvents[k] = (q.truthEvents[k] ?? 0) + n;
  }
  for (const [k, n] of Object.entries(r.rejects)) b.rejects[k] = (b.rejects[k] ?? 0) + n;
  for (const [k, n] of Object.entries(r.events)) b.events[k] = (b.events[k] ?? 0) + n;
  if (r.stoodAt == null) b.neverStood += 1; else b.stoodAt.push(r.stoodAt);
  if (r.opfFires) b.opfFires += 1;
  if (r.fUsed != null && r.fTrue) b.fRatios.push(r.fUsed / r.fTrue);
}

function summarize(b: Bag) {
  return {
    runs: b.runs,
    camera_ok: fraction(b.cameraOk, b.runs),
    camera_ok_rate: rate(b.cameraOk, b.runs),
    order_counts: b.orders,
    /** **놓인 것 / 그은 것**(#11 — 분모는 전부다). */
    placement: fraction(b.placedN, b.drawnN),
    placement_rate: rate(b.placedN, b.drawnN),
    /** **조용히 틀린 배치** — 분모는 놓인 것(정의상). 절단 셋(#13). */
    silent_wrong: silentWrong(b.errs),
    /** 같은 값의 비율 판(#40 값 대조가 점 경로로 읽는 자리 — 분자/분모는 위에 그대로 있다). */
    silent_wrong_rate: Object.fromEntries(Object.entries(silentWrong(b.errs)).map(
      ([k, v]) => [k, rate(Number(v.split("/")[0]), Number(v.split("/")[1]))])),
    shape_err_median: round(median(b.errs), 4),
    /** **규칙에 실제로 먹인 획 수**(#32) — 0이면 그 팔의 결과는 기전에 대한 정보가 0이다. */
    fed_strokes: b.fed,
    asks_total: b.asks,
    /** **물음 종류별**(7-R [4-F]) — 3점 물음이 지워졌으므로 `screen_or_depth`만 남아야 한다. */
    ask_kinds: b.askKinds,
    /** **획당 물음**(7-R [4-E] · #11·#24) — 지시 3-f가 보고한 자릿수는 6/5획 = **1.2회/획**이다.
     *  이 하네스의 값과 자릿수가 다르면 "0에 가까워졌는가"를 이 하네스로 판정할 수 없다. */
    asks_per_stroke: rate(b.asks, b.drawnN),
    /** **무엇이 먼저 선언됐는가**(#7). ⚠ **8차 항목 1로 뜻이 바뀌었다** — `screen_h`가 먼저
     *  나도 **그 순간 P1로 굳지 않는다**(깊이 소실점이 있어야 P1이다). 이 카운터는 **선언
     *  사건**을 세지 **차수**를 안 센다. 7차가 둘을 같게 읽었고 8차가 갈랐다. */
    first_declaration: b.firstDecl,
    /**
     * **두 쪽을 함께 낸다**(2026-08-18 8차 지시 1-c·1-d). 비율만 보면 분모가 줄 때 자동으로
     * 오르므로, **절대 개수**를 나란히 둔다:
     *   `within_cut_0_2`  — 잘 놓인 것(절단 0.2 안). **정확 감소**를 잡는다.
     *   `beyond_cut_0_5`  — 파국(절단 0.5 밖). **파국 감소**를 잡는다.
     * 항목 1이 중앙을 2.33배 좋게 하면서 `within`을 176 → 46으로 줄인 것이 **한 지표로는
     * 안 보였다**(집계 중앙만 봤다). 이 둘이 그 자리를 덮는다.
     */
    within_cut_0_2: b.errs.filter(e => e <= 0.2).length,
    beyond_cut_0_5: b.errs.filter(e => e > 0.5).length,
    /**
     * **P0의 사유별 분해**(2026-08-18 8차 2차 지시 1-a·1-b). `by_order.p0`는 "140실행이
     * 1680획을 긋고 0을 놓는다"까지만 말하고 **왜 안 서는지는 안 말한다.**
     *
     * ⚠ **`placement`을 여기 안 낸다** — P0의 배치는 **정의상 0**이다(카메라가 없으면
     * `liftAll`을 못 부른다). 그 0을 사유별로 적으면 측정이 아니라 보장이다(#5·#40 ②).
     * 대신 **몇 획이 그 상태에 묶여 있는가**(`strokes`)를 낸다 — 그것이 항목 5-1이
     * "방향 확정 · 좌표 미정"으로 흡수해야 할 몫의 크기다.
     */
    p0_reasons: Object.fromEntries(Object.entries(b.p0).map(([k, q]) => [k, {
      runs: q.runs,
      /** 그 사유로 묶인 **획 수** — 항목 5-1이 흡수할 몫. */
      strokes: q.drawnN,
      pending_median: q.pending.length ? round(median(q.pending), 4) : null,
      pending_max: q.pending.length ? Math.max(...q.pending) : null,
      /** 대기 깊이선 사이 **최대 각차**(도). 작으면 "둘인데 같은 축"이다. */
      pending_sep_deg_median: q.maxSep.length ? round(median(q.maxSep), 4) : null,
      pending_sep_deg_min: q.maxSep.length ? round(Math.min(...q.maxSep), 4) : null,
      pending_sep_deg_max: q.maxSep.length ? round(Math.max(...q.maxSep), 4) : null,
      /** 각차가 `concurrent_deg`(3°) **미만**인 실행 — 사실상 같은 축이다. */
      sep_below_concurrent: q.maxSep.filter(d => d < 3).length,
      /** **그 사유의 실행 안에서** 획이 무엇이 됐는가(지시 1-b). 분모는 `strokes`다. */
      events: q.events,
      rejects: q.rejects,
      /** **참 축 × 사건**(지시 1-a) — 깊이 획이 어디로 새는가. */
      truth_events: q.truthEvents,
    }])),
    /**
     * **P0 전체의 누수**(2026-08-18 9차 항목 0-c의 양성 채널).
     *
     * `p0_reasons.*.truth_events`를 사유 전체로 합친다 — 8차 2차가 이 값을 **손으로**
     * 더해 `progress.md`에 "351/772 (45.5%)"로 적었고, 그러면 원장을 다시 돌릴 때마다
     * 문서가 낡는다(#1). **원장이 스스로 낸다.**
     *
     * `leak` = 참 축이 깊이인데 **화면 축으로 읽힌 것**(`support` + `screen_axis`).
     * ⚠ **`support`가 전부 화면 축은 아니다** — 소실점이 선 실행(`vp_but_no_screen_h`)에서는
     * 깊이축의 지지일 수 있다. 그래서 그 사유는 **따로도** 낸다(#11 — 분모가 무엇인가).
     */
    p0_leak: (() => {
      const sum = (pick: (t: Record<string, number>) => number) =>
        Object.values(b.p0).reduce((n, q) => n + pick(q.truthEvents), 0);
      const g = (t: Record<string, number>, k: string) => t[k] ?? 0;
      const depthAll = sum(t => g(t, "depth/waiting") + g(t, "depth/support")
                              + g(t, "depth/screen_axis") + g(t, "depth/rejected")
                              + g(t, "depth/vp_fixed") + g(t, "depth/ask"));
      const leak = sum(t => g(t, "depth/support") + g(t, "depth/screen_axis"));
      const byReason = Object.fromEntries(Object.entries(b.p0).map(([k, q]) => {
        const t = q.truthEvents;
        const d = g(t, "depth/waiting") + g(t, "depth/support") + g(t, "depth/screen_axis")
                + g(t, "depth/rejected") + g(t, "depth/vp_fixed") + g(t, "depth/ask");
        return [k, { depth_truth: d, leak: fraction(g(t, "depth/support") + g(t, "depth/screen_axis"), d),
                     leak_rate: rate(g(t, "depth/support") + g(t, "depth/screen_axis"), d),
                     too_short: fraction(g(t, "depth/rejected"), d) }];
      }));
      return {
        what: "참 축이 깊이인 P0 획 중 **화면 축으로 읽힌** 것(`support` + `screen_axis`). "
            + "분모는 **P0 실행 안의 깊이 획 전부**이고 사유마다 다르다(#11).",
        leak: fraction(leak, depthAll), leak_rate: rate(leak, depthAll),
        too_short: fraction(sum(t => g(t, "depth/rejected")), depthAll),
        in_pool: fraction(sum(t => g(t, "depth/waiting")), depthAll),
        by_reason: byReason,
      };
    })(),
    /** **어디서 멈췄는가**(지시 1-b) — 거절 사유별 횟수. 분모는 `fed_strokes`가 아니라
     *  `placement`의 분모(그은 획 전부)다. 한 획이 여러 번 거절되지는 않는다. */
    rejects: b.rejects,
    /** **사건 종류별**(지시 1-b) — 분모는 규칙에 넣은 획이다(`placement`의 분모와 같다). */
    events: b.events,
    /**
     * **몇 번째 획에서 카메라가 섰는가**(지시 1-d). `never`는 그 실행이 P0으로 끝난 것이다.
     * ⚠ **`p90`이 획 예산에 붙어 있으면 P0의 일부는 하네스가 획을 그만 준 것이다**(#32) —
     * 그때 "카메라가 안 선다"는 규칙의 성질이 아니라 **픽스처의 성질**이다.
     */
    /**
     * **1점 직접 좌표 경로가 열린 실행 수**(2026-08-18 8차 2차 지시 2-a).
     *
     * ⚠⚠ **이 하네스는 그 경로를 안 돌린다** — `liftAll`만 부른다. 앱은 1점 시점에서
     * `onePointFrame`이 서면 `directSegment`로 간다(D-L77). 이 수가 **0이 아니면**
     * 그만큼 **이 원장의 P1 수치가 앱을 서술하지 않는다**(#17). 0이면 갈림이 없다.
     */
    one_point_direct_open: b.opfFires,
    /**
     * **f 개입의 크기**(#39의 나머지 절반 · 8-2R″ [2]) — 이 팔이 쓴 f ÷ 참 f.
     * **1에 가까우면 그 팔은 f를 거의 안 옮긴 것**이고, 그때의 무효과는
     * "f는 원인이 아니다"가 아니라 **"안 옮겼다"**다(#32).
     * ⚠ 이 픽스처의 참 f는 **1000**이고 P1의 임의 f는 `P1_F_RATIO(1.0) × 960 = 960`이라
     * `fixed`의 비가 **0.96**이다 — `fixed_true_f`의 개입은 **4%뿐**이다.
     */
    f_intervention: {
      ratio_median: b.fRatios.length ? round(median(b.fRatios), 4) : null,
      ratio_min: b.fRatios.length ? round(Math.min(...b.fRatios), 4) : null,
      ratio_max: b.fRatios.length ? round(Math.max(...b.fRatios), 4) : null,
      n: b.fRatios.length,
    },
    /**
     * **형태 오차의 게이지**(#35 · 8-2R″ [12]). `perStrokeError`에 `gauge`를 안 넘기므로
     * **자기 게이지**(`fitGauge` — 놓인 것과 참값 사이 전역 배율을 최소제곱으로 적합)다.
     * ⚠⚠ **그것이 이 항목에서 결정적이다**: 자기 게이지는 **전역 배율을 나눠 버리므로**
     * 깊이 배율 오차의 등방 성분을 지운다(#35가 실증한 그 자리 — "사용자가 보는 성분을
     * 지웠다"). 그러므로 **f 팔의 무효과를 읽을 때 이 사실을 함께 읽어야 한다.**
     */
    shape_err_gauge: "fit (fitGauge — 자기 게이지)",
    stood_at: {
      never: b.neverStood,
      stood: b.stoodAt.length,
      median: b.stoodAt.length ? round(median(b.stoodAt), 4) : null,
      p90: b.stoodAt.length
        ? [...b.stoodAt].sort((x, y) => x - y)[Math.min(b.stoodAt.length - 1,
            Math.floor(0.9 * b.stoodAt.length))]
        : null,
      max: b.stoodAt.length ? Math.max(...b.stoodAt) : null,
    },
    /** **차수별 분해**(지시 1-a) — 줄어든 배치가 어느 차수로 옮겨 갔는지 가른다(#9). */
    by_order: Object.fromEntries(Object.entries(b.byOrder).map(([k, o]) => [k, {
      runs: o.runs,
      placement: fraction(o.placedN, o.drawnN),
      placement_rate: rate(o.placedN, o.drawnN),
      within_cut_0_2: o.errs.filter(e => e <= 0.2).length,
      /** 절단 0.2 안이 **하나라도** 난 실행 수(독립 단위 — 리뷰어 [3]). */
      runs_within_cut_0_2: o.runsWithinCut,
      beyond_cut_0_5: o.errs.filter(e => e > 0.5).length,
      silent_wrong: silentWrong(o.errs),
      shape_err_median: o.errs.length ? round(median(o.errs), 4) : null,
    }])),
  };
}

// ---------------------------------------------------------------- 측정

describe("차수가 P1에 갇히는가 — 그리고 배치가 따라오는가 (7차 지시 1)", () => {
  it("우회 살림/제거/오라클 세 팔을 같은 픽스처에서 함께 낸다", () => {
    const ARMS = Object.keys(ARM_SPEC) as Arm[];
    const newBags = (): Record<Arm, Bag> =>
      Object.fromEntries(ARMS.map(a => [a, bag()])) as Record<Arm, Bag>;
    const head: Record<Arm, Bag> = newBags();
    const byJit: Record<string, Record<Arm, Bag>> = {};
    const byOrder: Record<string, Record<Arm, Bag>> = {};
    const byComp: Record<string, Record<Arm, Bag>> = {};
    /** **시드 층**(7-R 리뷰어 [3] · #14) — P1 −20이 시드 폭 안인지 밖인지 가른다. */
    const bySeed: Record<string, Record<Arm, Bag>> = {};
    /** **동작점**(7-R 리뷰어 [7] · #12·#13) — 화면 수평에서 몇 도 안에 든 획이 구도마다 몇 개인가. */
    const nearH: Record<string, { strokes: number; runs_with_any: number }> =
      { deg_2: { strokes: 0, runs_with_any: 0 }, deg_4: { strokes: 0, runs_with_any: 0 },
        deg_8: { strokes: 0, runs_with_any: 0 } };
    let nearHRuns = 0, nearHTotal = 0;

    const slot = (m: Record<string, Record<Arm, Bag>>, k: string) => (m[k] ??= newBags());

    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) {
        for (const grade of GRADES) {
          for (const seed of SEEDS) {
            const fx = fixture(ci, jit, grade, seed);
            if (!fx) continue;
            for (const ord of ["alternating", "grouped"] as Order[]) {
              // **4° 안 획이 몇 개인가**(#7 카운터 — "반드시 하나는 있다"의 근거)
              nearHRuns += 1; nearHTotal += fx.drawn.length;
              for (const t of [2, 4, 8]) {
                let k = 0;
                for (const e of fx.drawn) {
                  const r = representative(e.pts2d as Pt2[]);
                  if (r && classifyLine(r.a, r.b).toH <= t) k += 1;
                }
                nearH[`deg_${t}`].strokes += k;
                if (k > 0) nearH[`deg_${t}`].runs_with_any += 1;
              }
              for (const arm of ARMS) {
                const r = runOne(fx, ord, arm);
                add(head[arm], r);
                add(slot(byJit, `jit_${jit}`)[arm], r);
                add(slot(byOrder, ord)[arm], r);
                add(slot(byComp, COMPOSITIONS[ci].name)[arm], r);
                add(slot(bySeed, `seed_${seed}`)[arm], r);
              }
            }
          }
        }
      }
    }

    // ---- **획 예산 팔**(2026-08-18 8차 2차 지시 1-d) — 같은 구도·같은 시드에서
    //      **상자를 하나 더** 놓아 획을 12 → 24로 늘린다. 획 길이는 그대로다(세분이 아니다).
    //      ⚠ **`fixed` 팔만** 돌린다 — 묻는 것은 "획이 더 오면 서는가" 하나이고,
    //      다섯 팔을 다 돌리면 실행 시간만 다섯 배다(A-3: 범위를 넓히지 않는다).
    const twoBox = bag();
    const oneBoxPaired = bag();     // **짝지은 대조**(#9) — 두 상자가 도는 픽스처만 센다
    for (let ci = 0; ci < COMPOSITIONS.length; ci++) {
      for (const jit of JITTERS) {
        for (const grade of GRADES) {
          for (const seed of SEEDS) {
            const fx2 = fixture(ci, jit, grade, seed, 2);
            const fx1 = fixture(ci, jit, grade, seed, 1);
            if (!fx2 || !fx1) continue;
            for (const ord of ["alternating", "grouped"] as Order[]) {
              add(twoBox, runOne(fx2, ord, "fixed"));
              add(oneBoxPaired, runOne(fx1, ord, "fixed"));
            }
          }
        }
      }
    }

    const armsOut = Object.fromEntries(ARMS.map(a => [a, { headline: summarize(head[a]) }]));
    const layer = (m: Record<string, Record<Arm, Bag>>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) =>
        [k, Object.fromEntries(ARMS.map(a => [a, summarize(v[a])]))]));

    // ---- 게이트 판정 (#26 — 등록문 그대로 읽는다)
    const p1Bypass = head.bypass.orders.p1, p1Fixed = head.fixed.orders.p1;
    const cut02 = silentWrong(head.fixed.errs).cut_0_2;                // "분자/분모"
    const [wrong, placed] = cut02.split("/").map(Number);
    const passOrder = p1Fixed < p1Bypass;
    const passFloor = placed > 0 && wrong < placed;

    const out = {
      what: "규칙이 세운 카메라로 그 획들을 실제로 올린다 — `rule_camera`(축 오차만)와 "
          + "`camera_gate`(소실점을 직접 받음) 사이로 새던 연결이다(7차 지시 1-a·1-b).",
      arms: armsOut,
      by_jitter: layer(byJit),
      by_order: layer(byOrder),
      by_composition: layer(byComp),
      by_seed: layer(bySeed),
      /**
       * **`screen_h` 동작점**(7-R 리뷰어 [7]) — `RULE_TOL.screen_axis_deg = 4`가 결론을 지탱하므로
       * 그 임계를 흔들어 본다. 규칙을 다시 돌리는 스윕이 아니라 **입력 쪽 카운터**다:
       * 화면 수평에서 t° 안에 든 획이 구도마다 몇 개인가. `runs_with_any`가 실행 수와 같으면
       * "3점 구도에도 그런 모서리가 반드시 하나는 있다"가 관측이 된다(추측이 아니라 카운터, #7).
       */
      screen_h_operating_point: { runs: nearHRuns, strokes_total: nearHTotal, by_deg: nearH },
      gate: gate({
        registered: REGISTERED,
        reachability:
          "`oracle` 팔 — **참 소실점 + 참 축 라벨**로 같은 획을 올린다. 규칙을 안 쓰므로 "
          + "'규칙이 정한 차수'가 배치에 무엇을 하는지의 대조선이고, **자명한 값이 아니다**"
          + "(참값을 줘도 합성 잉크 잡음이 남아 조용히 틀림이 0이 아니다 — #40 ②). "
          + "⚠ 오라클을 상한이라 부르지 않는다 — 한 대리 참값의 성능이다.",
        reachability_value: summarize(head.oracle).silent_wrong_rate.cut_0_2 as number,
        reachability_source: "arms/oracle/headline/silent_wrong_rate/cut_0_2",
        result: {
          pass_order: passOrder, p1_bypass: p1Bypass, p1_fixed: p1Fixed,
          p3_bypass: head.bypass.orders.p3, p3_fixed: head.fixed.orders.p3,
          /** ⚠ **P1이 줄어든 몫이 전부 차수 상승은 아니다**(7-R [4]) — 아래 셋을 함께 읽는다. */
          p0_bypass: head.bypass.orders.p0, p0_fixed: head.fixed.orders.p0,
          camera_ok_bypass: fraction(head.bypass.cameraOk, head.bypass.runs),
          camera_ok_fixed: fraction(head.fixed.cameraOk, head.fixed.runs),
          pass_floor: passFloor, fixed_cut_0_2: cut02,
          /** ⚠⚠ **게이트 ②는 개입에 대한 정보가 0이다**(7-R [2]) — 대조 팔이 같은 수를 낸다. */
          bypass_cut_0_2: silentWrong(head.bypass.errs).cut_0_2,
          within_cut_0_2_fixed: placed - wrong,
          within_cut_0_2_bypass: Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
                                - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0]),
          floor_gate_discriminates: (placed - wrong)
            !== (Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
               - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0])),
          oracle_cut_0_2: silentWrong(head.oracle.errs).cut_0_2,
          // ---- ③ **양쪽을 함께 잰다**(2026-08-18 8차 지시 1-d)
          //
          // ①·②는 **한쪽만** 봤다: ①은 P1 개수, ②는 조용히 틀림의 바닥. 그래서 항목 1이
          // **중앙을 2.33배 좋게 하면서 잘 놓인 것을 176 → 46으로 줄인 것**을 둘 다 못 잡았고
          // 게이트는 통과로 떴다. 이제 **정확(within)과 파국(beyond)을 나란히** 낸다.
          //
          // ⚠⚠ **한계를 그대로 적는다**: 이 셋은 전부 **팔 사이**(fixed ↔ bypass) 비교다.
          // 176 → 46은 **커밋 사이** 변화라 어느 팔 비교로도 안 나온다 — 그것은
          // `git show <이전 커밋>:stage0/out/order_lock.json`으로 읽어야 한다.
          // 즉 **이 게이트는 여전히 그 대가를 못 잡는다.** 잡는 것은 다음 개입이
          // 같은 두 수를 어느 방향으로 옮기는가다.
          within_cut_0_2_delta: (placed - wrong)
            - (Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
             - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0])),
          beyond_cut_0_5_fixed: head.fixed.errs.filter(e => e > 0.5).length,
          beyond_cut_0_5_bypass: head.bypass.errs.filter(e => e > 0.5).length,
          pass_two_sided: (placed - wrong)
              >= (Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
                - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0]))
            && head.fixed.errs.filter(e => e > 0.5).length
              <= head.bypass.errs.filter(e => e > 0.5).length,
          two_sided_note: "③ **정확이 안 줄고 파국이 안 는다**(지시 1-d). ⚠ 팔 사이 비교라 "
            + "커밋 사이의 176 → 46은 못 잡는다 — 그 값은 이전 커밋의 원장에서 읽는다.",
          // ---- ④ **가드의 대조는 `guard_off`다**(9차 항목 1 · 9-R′ [R2])
          // ⚠⚠ ③이 `bypass`를 대조로 쓰는데 그 팔은 **D-L80과 무관한 개입**(`snapForced` 우회)이다.
          // 그러니 ③의 통과는 가드에 대해 아무 말도 안 한다 — 초판이 그것을 통과 근거로 인용했다.
          within_cut_0_2_guard_off:
            Number(silentWrong(head.guard_off.errs).cut_0_2.split("/")[1])
            - Number(silentWrong(head.guard_off.errs).cut_0_2.split("/")[0]),
          beyond_cut_0_5_guard_off: head.guard_off.errs.filter(e => e > 0.5).length,
          pass_two_sided_vs_guard_off: (placed - wrong)
              >= (Number(silentWrong(head.guard_off.errs).cut_0_2.split("/")[1])
                - Number(silentWrong(head.guard_off.errs).cut_0_2.split("/")[0]))
            && head.fixed.errs.filter(e => e > 0.5).length
              <= head.guard_off.errs.filter(e => e > 0.5).length,
          guard_off_note: "④ **가드의 두 방향**(`fixed` ↔ `guard_off`). ⚠⚠ **이 조항은 실패한다** — "
            + "정확·파국의 현행 값은 같은 result 블록의 `within_cut_0_2_*`·`beyond_cut_0_5_*`를 "
            + "읽는다(산문에 수를 안 박는다 — 8차 리뷰어 [2]. 연혁: 9차 46→52·1923→1965, "
            + "10차 D-L85 후 68→85·2110→2115). **실패를 적고 기준을 안 낮춘다**(#26·#35). D-L80을 되돌리는 근거가 아니라 "
            + "**그 개입의 대가가 등록된 형태로 원장에 남는다**는 뜻이다 — 그 결정문이 같은 대가를 "
            + "적고 있다(#15·#16).",
        },
        note: "⚠ 이 게이트는 이 항목이 등록한 것이고 CLAUDE.md §2의 중단 조건이 아니다(#41).",
      }),
      /**
       * **요인 분해**(7-R [6]) — 옛 판은 `oracle`이 소실점·축 라벨·규칙 사용을 한꺼번에 바꿔서
       * 배치 격차를 어디에도 못 돌렸다. 단일 요인 팔 둘이 그것을 가른다.
       */
      factor_split: {
        // ⛔⛔ **옛 결론문을 지웠다**(2026-08-18 8차 2차 지시 항목 0 · 8-2R [3]).
        // 옛 note: "축 라벨만 참으로 바꾸면 형태 오차가 **안 움직이고**(1.3329 → 1.3511),
        // 소실점만 참으로 바꾸면 **크게 움직인다**(→ 0.2452)". **8차 항목 1이 그 값을 뒤집었고**
        // 아무도 이 산문을 다시 안 읽었다(그 세 수는 현행 원장에 **없다**).
        note: "**중앙값으로 읽으면 방향이 갈리지 않는다**(8차 항목 1 이후 재측정): "
            + "축 라벨만 참으로(rule_vp_true_axis) → 중앙이 **나빠지고**, "
            + "소실점만 참으로(true_vp_rule_axis) → 중앙이 **조금 좋아진다**. "
            + "⚠⚠ **중앙은 이 비교에 못 쓴다** — 두 팔의 **놓인 수가 크게 다르기 때문**이다"
            + "(#9·#15: 층 구성이 바뀌면 층 내 개선과 안 갈린다). 참 축 라벨 팔은 훨씬 많이 놓고"
            + "(그 여분이 나쁜 것들이다) 참 소실점 팔은 훨씬 적게 놓는다. "
            + "**분모가 같은 절대 개수로 읽어야 한다**: `within_cut_0_2`(분모는 그은 획 7200으로 "
            + "모든 팔이 같다)에서 fixed **대** rule_vp_true_axis **대** true_vp_rule_axis가 "
            + "갈리고, 거기서는 **소실점 쪽이 압도적이다.** 즉 **'틀린 것은 축 배정이 아니라 "
            + "카메라다'라는 결론 자체는 유지되고, 그 근거가 중앙에서 절대 개수로 바뀐다** "
            + "(#28: 지표를 사유 없이 바꾸지 않는다 — 사유는 중앙의 분모가 팔마다 다르다는 것이고, "
            + "옛 판이 그것을 안 본 채 중앙을 비교했다). "
            + "⚠⚠⚠ **시드 폭을 함께 읽는다**(#14 · 8-2R′ [2]): `by_seed`에서 `fixed`의 "
            + "`within_cut_0_2`는 **0 · 0 · 0 · 15 · 16 · 15**로 **시드 절반이 0**이고, "
            + "`rule_vp_true_axis`는 **1 · 1 · 0 · 8 · 2 · 1**이라 **시드 셋(1·2·3)에서는 "
            + "축 라벨 참 팔이 fixed와 같거나 오히려 낫다** — 즉 **'축 라벨을 참으로 주면 "
            + "나빠진다'는 시드 폭을 못 넘는다.** 반면 `true_vp_rule_axis`는 "
            + "**158 · 127 · 170 · 149 · 155 · 149**로 **여섯 시드 전부에서 fixed의 열 배 위**다. "
            + "**그러므로 이 원장이 시드 폭을 견디는 결론은 하나뿐이다: 소실점이 지배한다.** "
            + "축 라벨의 방향(나빠지는가)은 **여기서 못 세운다.** "
            + "⚠ **같은 양이 팔 조합에 따라 판별력이 다르다**(8-2R′ [11]): 이 원장의 "
            + "`what_this_does_not_say`가 적듯 `bypass` ↔ `fixed`에서는 `within_cut_0_2`가 "
            + "**같은 값이라 정보가 0**이다. 요인 팔 사이에서만 가른다 — "
            + "**한 지표가 어디서나 판별력을 갖는다고 읽지 않는다.** "
            + "⛔⛔ **제자리 정정(9차 항목 1 · 9-R′ [R4])**: 이 자리에 적혀 있던 **'46 대 46'과 "
            + "'46 대 908'은 낡았다** — 9차 항목 0이 `guard_off` 팔을 넣고 원장을 다시 돌렸다. "
            + "**수를 여기 다시 박지 않는다**(#1 — 손으로 적은 수는 재실행마다 낡는다): "
            + "값은 바로 아래 `within_cut_0_2` 표를 **그 자리에서 읽는다**. "
            + "⛔ **제자리 정정(11차 리뷰어 [6] · #47)**: 그 정정문 자체가 낡아 있었다 — "
            + "*‘46은 이제 `guard_off`의 값’*이라 적었는데 그 뒤 D-L85(반경 8)로 "
            + "`within_cut_0_2_guard_off`가 다시 움직였다. **수를 문장에 안 박는다는 규칙을 "
            + "세운 문장 자체가 수를 박고 있었다.** 어느 팔이 어느 값인지는 "
            + "`gate.result`의 `within_cut_0_2_{fixed,bypass,guard_off}`를 **팔 이름과 함께** "
            + "그 자리에서 읽는다(#42 ⑨ — 팔 이름 없는 인용은 세로로 오독된다).",
        shape_err_median: Object.fromEntries(ARMS.map(a =>
          [a, round(median(head[a].errs), 4)])),
        /** **분모가 팔마다 같은 유일한 지표**(8-2R [3]) — 판정은 이것으로 한다. */
        within_cut_0_2: Object.fromEntries(ARMS.map(a =>
          [a, head[a].errs.filter(e => e <= 0.2).length])),
        /** 분모(그은 획)는 모든 팔에서 같다 — 위 개수가 비교 가능한 이유다. */
        within_cut_0_2_denominator: head.fixed.drawnN,
        placement: Object.fromEntries(ARMS.map(a =>
          [a, fraction(head[a].placedN, head[a].drawnN)])),
        silent_wrong_cut_0_2: Object.fromEntries(ARMS.map(a =>
          [a, silentWrong(head[a].errs).cut_0_2])),
      },
      what_this_does_not_say: [
        "⚠⚠ **`stroke_budget`(상자 하나 ↔ 둘)은 '획만 두 배'가 아니다**(8-2R″ [5]) — "
          + "둘째 상자가 다른 자리에 서므로 **지지선의 배치(정보량)도 늘 수 있다**. 실측은 "
          + "`stroke_budget.*.p0_reasons.pending_2_awaiting_third`의 `pending_sep_deg_*`를 "
          + "**그 자리에서 읽는다**(⚠ 수치를 여기 박지 않는다 — 리뷰어 5차 [6]: 8차 시점 값"
          + "(중앙 19.88 → 43.96)을 박아 둔 초판 산문이 D-L85 재실행 값(중앙 거의 불변·최소만 상승)에 "
          + "반박당했다. 증거의 자리가 실행마다 옮겨 다닌다 — AS-L37이 그 이동을 든다). "
          + "**P0의 감소를 획 수에만 귀속할 수 없다.** 정보를 안 늘리는 획 증가(같은 상자에 "
          + "덧그리기)가 위약인데 **그 팔이 없다**(#39).",
        "⚠⚠ **`fixed_true_f`는 개입이 거의 없는 팔이다**(8-2R″ [2]) — 이 픽스처의 참 f는 1000, "
          + "P1의 임의 f는 960이라 P1에서 **4%**이고 `f_intervention.ratio_median`이 **1.0021**이다. "
          + "그 팔의 무효과는 **'f는 원인이 아니다'가 아니라 '안 옮겼다'**다(#32). 판별력을 가진 것은 "
          + "**`fixed_f_half`·`fixed_f_double`**(양성 채널 — ×0.5에서 P1 중앙 1.6914 → 2.0866).",
        "⚠⚠ **`one_point_direct_open`은 규칙 팔에서 P1 실행 수와 항등이다**(8-2R″ [8] · #40 ②) — "
          + "규칙 P1은 화면 가로축 슬롯이 무한원이라 **정의상** 정확히 정렬된다. 그 필드가 나르는 것은 "
          + "'규칙 P1 ⟹ 직접 경로가 열린다'는 **구조의 서술**이지 새 측정이 아니다. **그리고 앱이 같은 "
          + "술어를 쓴다는 것은 이 원장에 근거가 없다**(#17 — 배선 시험도 필드도 없다).",
        "⚠ **`p0_reasons.strokes`와 `events` 합이 다를 수 있다**(8-2R″ [11]) — `representative()`가 "
          + "방향을 못 내는 획은 규칙에 **안 들어가므로** 사건이 없다. 그 수를 `events.no_representative`로 "
          + "센다. **비를 낼 때 분모를 무엇으로 잡았는지 함께 적는다**(#11).",
        "⚠ **형태 오차의 게이지는 자기 게이지다**(`shape_err_gauge` — `fitGauge`, #35). 전역 배율을 "
          + "적합해 나누므로 **등방 배율 오차는 지워진다**. f 오차는 깊이축에만 걸리는 비등방 오차라 "
          + "남지만, 그 사실을 모르고 읽으면 안 된다.",
        "**합성이다.** 실획은 `sessions/`에 표본이 오면 `real_ink`가 잰다(항목 9) — "
          + "AS-L24·L25가 '합성이 이 설계에 구조적으로 불리하다'를 열어 두었다",
        "**축 라벨은 규칙이 붙인다**(`CamState.axisOf`) — 오배정이 배치 오차에 섞여 들어온다. "
          + "그것이 의도다(#27: 축 오차만 재면 오배정이 안 보인다). 갈라 보려면 `oracle` 팔과 견준다",
        "**물음에는 참 축으로 답한다**(오라클) — 사람이 틀리게 답하는 몫은 안 잰다",
        "⚠⚠ **이 팔은 지시 1-c·1-d에 대한 정보가 0이다**(7-R 리뷰어 [5], #32·#17). "
          + "시작점 스냅(3D 오스냅)이 없고 `liftAll` 일괄 풀이만 쓰므로 앱의 `placeStroke` 경로를 "
          + "**안 탄다**. 게다가 `liftAll`은 방향을 축과 앵커에서 **다시 세우므로** 1-c의 `pts2d` "
          + "되쓰기는 이 팔에서 **구조적으로 항등**이다. 즉 여기서 '배치가 안 좋아졌다'가 말하는 것은 "
          + "**1-a(우회 제거)에 대한 것뿐**이다. 1-c·1-d의 판정자는 `confirm_dir.json`이다",
        "⚠ **게이트 ②(바닥 탈출)는 개입에 대한 정보가 0이다**(7-R [2]) — 절단 0.2 안에 든 배치가 "
          + `\`fixed\` ${placed - wrong} · \`bypass\` ${Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[1])
              - Number(silentWrong(head.bypass.errs).cut_0_2.split("/")[0])}로 같다. 그 게이트가 말하는 것은 `
          + "'이 하네스가 바닥에 붙어 있지 않다'는 **하네스의 성질**이지 1-a의 성질이 아니다. "
          + "`gate.result.floor_gate_discriminates`가 그 사실을 낸다(#40의 자매 유형: 값이 0·1이 "
          + "아니어도 대조 팔에서 같으면 자명하다)",
        "⚠ **P1이 줄어든 몫에 손실이 섞여 있다**(7-R [4]·#15·#16) — 이 실행의 내역: "
          + `P1 ${p1Bypass} → ${p1Fixed} · P2 ${head.bypass.orders.p2} → ${head.fixed.orders.p2} · `
          + `P3 ${head.bypass.orders.p3} → ${head.fixed.orders.p3} · **P0 ${head.bypass.orders.p0} → ${head.fixed.orders.p0}** · `
          + `카메라가 선 실행 ${head.bypass.cameraOk} → ${head.fixed.cameraOk}. `
          + "P0은 차수가 풀린 것이 아니라 카메라가 아예 안 선 것이다 — "
          + "'차수가 풀린다'를 P1 개수만으로 읽으면 그 손실이 안 보인다",
        "**조용히 틀림의 분모가 팔마다 다르다**(#11) — "
          + ARMS.map(a => `\`${a}\` ${head[a].placedN}`).join(" · ")
          + ". 행 간 비율 비교는 **같은 양의 비교가 아니다**. 그래서 분자/분모를 그대로 낸다",
        "⚠⚠ **3점 세 구도에서 조용히 틀림이 정확히 1.000이다**(7-R [4-A] · #40 ②) — "
          + "`by_composition`을 그 자리에서 읽는다. 집계 형태 오차가 좋아지는 것은 **층 구성**이 "
          + "바뀐 것일 수 있다(카메라가 선 실행이 늘면 저오차 층인 1pt 구도의 비중이 는다, #9). "
          + "층 내 개선과 층 구성 변화를 이 원장은 **안 가른다**",
        "**위약 팔이 없다**(#39) — `bypass`는 양성 채널(옛 배선)이지 위약이 아니다. "
          + "다만 이번 개입은 '해를 얼마나 옮기는가'가 아니라 **배선 제거**라 위약의 대상이 애매하다",
        "**#12·#13**: 절단 셋·잡음 다섯·등급 둘·순서 둘·시드 여섯(`by_seed`)을 다 냈지만 "
          + `**조리개(${OSNAP_RADIUS_PX}px)와 \`RULE_TOL.screen_axis_deg\`(4°)는 동작점 하나다**.`
          + " 4°가 결론을 지탱하므로 "
          + "`screen_h_operating_point`가 **입력 쪽 카운터**를 2°·4°·8°로 낸다 — 규칙을 다시 돌리는 "
          + "스윕은 아니다(7-R [7])",
      ],
      /**
       * **획 예산이 P0를 만드는가**(2026-08-18 8차 2차 지시 1-d).
       *
       * 지시: *"합성 하네스가 이 구간을 만들어내는 조건이 실사용과 같은지 확인한다.
       * 실획에서는 사용자가 계속 그으므로 결국 확정될 수 있다."*
       *
       * `one_box`는 현행 픽스처(상자 하나 = 12획), `two_box`는 **같은 크기의 상자를 하나 더**
       * 놓은 것(24획)이다. **획 길이는 같다** — 세분(`k=2`)으로 늘리면 획이 1/k로 짧아져
       * `min_vp_len_ratio`에 더 걸리고 반대 방향으로 간다(`DEFERRED` 리뷰어 [10]).
       *
       * ⚠ **이것은 실사용의 모형이지 실사용이 아니다**(#32) — 사람은 상자를 하나 더 그리는
       * 대신 같은 상자에 선을 덧그을 수도 있고, 그 경우 획 수는 늘되 **새 정보는 안 는다**.
       * 실획이 판정자다(`real_ink`, 표본 0).
       */
      stroke_budget: {
        one_box: summarize(oneBoxPaired),
        two_box: summarize(twoBox),
        /**
         * **AS-L35의 희소성 논증을 원장이 스스로 검정한다**(2026-08-18 11차 항목 5).
         *
         * 8-2R″ [3]이 세운 논증은 *"`one_box`의 P1 절단 안 0은 **표본이 작아서**다"*였다.
         * 그 논증은 **두 팔의 P1이 같은 모집단**이라고 전제한다 — 그러면 `two_box`의 율로
         * `one_box`의 기대 건수를 계산할 수 있고, 그 기대가 작으면 0이 자연스럽다.
         *
         * **여기서 그 전제를 검정한다**: λ = one_box P1 배치 수 × two_box P1 절단 안 율.
         * 포아송 P(0) = e^(−λ)가 작으면 **전제가 깨진 것**이고(#9 — 모집단이 다르면
         * 비교가 아니다), 그러면 희소성 논증은 **못 쓴다.**
         *
         * ⚠ **이것은 성능 지표가 아니다** — 두 팔을 한 모집단으로 볼 수 있는가의 검정이고,
         * 답이 "아니오"면 **두 팔 사이의 어떤 율 비교도** 근거가 안 된다(배수 포함).
         * ⚠ 수를 산문에 안 박는다(**#47**) — 값은 이 블록의 필드가 든다.
         */
        p1_cross_arm: (() => {
          type P1Row = { runs: number; placement: string;
                         within_cut_0_2: number; runs_within_cut_0_2: number };
          const one = summarize(oneBoxPaired).by_order.p1 as P1Row | undefined;
          const two = summarize(twoBox).by_order.p1 as P1Row | undefined;
          if (!one || !two) return null;
          const nOne = +String(one.placement).split("/")[0];
          const nTwo = +String(two.placement).split("/")[0];
          const pTwo = nTwo ? two.within_cut_0_2 / nTwo : 0;
          const lambda = nOne * pTwo;
          // **실행 단위 검정**(리뷰어 [3]) — 한 실행의 획은 같은 카메라를 공유하므로
          // 배치 단위 포아송은 표본 크기를 부풀린다. 성공을 **실행 수**로 세어 다시 낸다.
          const rTwo = two.runs ? two.runs_within_cut_0_2 / two.runs : 0;
          const lambdaRuns = one.runs * rTwo;
          const pZeroRuns = Math.pow(1 - rTwo, one.runs);      // 이항 P(성공 0회)
          return {
            one_box_p1_runs: one.runs,
            one_box_p1_placed: nOne,
            one_box_p1_within_cut_0_2: one.within_cut_0_2,
            one_box_p1_runs_within_cut_0_2: one.runs_within_cut_0_2,
            two_box_p1_runs: two.runs,
            two_box_p1_placed: nTwo,
            two_box_p1_within_cut_0_2: two.within_cut_0_2,
            two_box_p1_runs_within_cut_0_2: two.runs_within_cut_0_2,
            two_box_rate: round(pTwo, 6),
            expected_in_one_box: round(lambda, 4),
            poisson_p_zero: round(Math.exp(-lambda), 6),
            /** ⚙️ **판정은 이 줄이 한다** — 배치 단위(위 둘)는 독립이 아니다. */
            two_box_run_rate: round(rTwo, 6),
            expected_runs_in_one_box: round(lambdaRuns, 4),
            binomial_p_zero_runs: round(pZeroRuns, 6),
            alpha: 0.05,
            /**
             * ⛔⛔ **이 검정이 이 표본에서 기각을 낼 수 있는가**(11차 리뷰어 2차 [3] · #35·#40 ②).
             * 기각 방향의 **유일한 관측은 0**이고 그때 p = `binomial_p_zero_runs`다.
             * 그 값이 이미 알파보다 크면 **어떤 관측으로도 기각이 안 난다** — 그때
             * `not_rejected`는 자료의 값이 아니라 **표본 크기의 귀결**이다.
             * 그래서 ① 이 표본에서 **도달 가능한 최소 p** ② 알파를 넘으려면 필요한 실행 수
             * ③ 필요한 상대 팔 실행율을 함께 낸다.
             */
            min_attainable_p: round(pZeroRuns, 6),
            runs_needed_for_alpha: rTwo > 0 && rTwo < 1
              ? Math.ceil(Math.log(0.05) / Math.log(1 - rTwo)) : null,
            run_rate_needed_at_this_n: one.runs > 0
              ? round(1 - Math.pow(0.05, 1 / one.runs), 6) : null,
            test_can_reject: pZeroRuns < 0.05,
            verdict: !(pZeroRuns < 0.05)
              ? "underpowered"                       // 관측이 무엇이든 기각선을 못 넘는다
              : (one.runs_within_cut_0_2 === 0 ? "same_population_rejected" : "not_rejected"),
            note: "`same_population_rejected`면 **희소성 논증을 쓸 수 없다**(#9) — "
                + "`one_box`의 0은 '표본이 작아서'로 설명되지 않는다. AS-L35의 반증"
                + "(`two_box`의 절단 안이 0이 아니다)은 그 논증과 **무관하게** 선다. "
                + "⚠⚠ **판정의 단위는 실행이다**(11차 리뷰어 [3]): 한 실행의 획들은 같은 "
                + "카메라를 공유하므로 배치 단위 포아송은 표본을 부풀린다 — `binomial_p_zero_runs`가 "
                + "판정하고 배치 단위 둘은 **연혁·대조용**이다. "
                + "⚠⚠ **기각의 귀속은 이 원장이 못 가른다**(11차 리뷰어 [10] · #24): "
                + "`within_cut_0_2`는 **자기 게이지**(`fitGauge`) 정규화 뒤의 양이고 그 적합이 "
                + "실행 단위인데 두 팔의 획 수가 12 ↔ 24로 다르다 — 그러므로 기각은 "
                + "'P1 배치 품질이 다르다'일 수도 **'두 팔의 절단 0.2가 같은 양이 아니다'**일 수도 "
                + "있다. **어느 쪽이든 두 팔 사이의 율 비교는 못 쓴다**는 결론은 같다. "
                + "⚠ 시드 폭 미측정(#14) — 관측이 0에서 1로만 바뀌어도 판정이 뒤집힐 수 있다. "
                + "⚙️ **편향의 방향은 기각 쪽이다**(그래서 `not_rejected`가 강건하다): "
                + "`two_box`의 한 실행은 획이 **두 배**라 실행 단위 성공 확률이 `one_box`보다 "
                + "구조적으로 높다 — 그 율을 그대로 쓰면 `one_box`의 기대가 **과대**해지고 "
                + "P(0)는 과소해진다. 그렇게 부풀린 값에서도 안 기각된다. "
                + "⚠ 반대 우려(실행 단위가 정보를 버린다)는 이 물음에는 안 걸린다 — 묻는 것이 "
                + "**'성공 실행이 하나도 없는 것이 놀라운가'**이므로 단위가 실행인 것이 맞다. "
                + "⛔⛔ **`verdict`가 `underpowered`면 이 검정으로 아무 판정도 하지 않는다**"
                + "(11차 리뷰어 2차 [3]): 기각 방향의 유일한 관측(0)에서 이미 p > 알파라 "
                + "**어떤 관측도 기각선을 못 넘는다** — `not_rejected`를 '희소성 논증이 산다'로 "
                + "읽으면 표본 크기를 증거로 쓰는 것이다(#35·#40 ②). 필요한 실행 수는 "
                + "`runs_needed_for_alpha`가 든다. **두 단위의 p가 알파를 사이에 두고 갈리는 것**도 "
                + "그래서 결론이 못 된다(#13 — 절단값이 결론을 정하면 그 결론은 없다). "
                + "⚠ **분모는 배치(`placement`의 분자)이지 시도가 아니다** — AS-L34가 쓰는 "
                + "분모 780(= P1 실행 × 획)과 **다른 양**이고, 이 율은 '배치까지 간 획'에 "
                + "조건부다(배치율이 팔마다 다르다 — 리뷰어 2차 [12]).",
          };
        })(),
      },
      constants: constantsSnapshot(),
      metric_defs: metricsSnapshot(),
    };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(resolve(OUT, "order_lock.json"), JSON.stringify(out, null, 2));

    // 실행이 실제로 돌았는가(#32) — 입력 0이면 결과는 기전에 대한 정보가 0이다
    expect(head.fixed.runs).toBeGreaterThan(0);
    expect(head.fixed.fed).toBeGreaterThan(0);
  });
});
