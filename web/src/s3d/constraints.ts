// W-1 제약 누산기 — 계획서 §3.1. **입력 방식을 고정하지 않는다.**
//
// 점 찍기 / 선 긋기 / 지평선 긋기 / 렌즈 슬라이더가 전부 같은 누산기로 들어온다.
// "찾아내기"와 "정의하기"의 구분이 없다 — 깊이선 두 개의 교점도 소실점이고,
// 손으로 찍은 점도 소실점이다. 자유도만 같으면 같은 것으로 센다.
//
// 이론서 5.3의 자유도 회계가 그대로 자료구조가 된다.
//
//   제스처        기여 제약                     자유도 감소
//   점 찍기       소실점 확정                    2
//   선 하나       소실점이 이 직선 위             1
//   선 두 개+     교점 클러스터 → 소실점          2
//   지평선        수평 VP들이 이 위 + 주점 y      1
//   렌즈 슬라이더  f                             1
//   이후 엣지     자기 축 VP에 투표               누적
import {
  lineIntersect, lsIntersection, recoverCamera, gate,
  type Pt2, type CameraSolution,
} from "./camera.js";

/** 축 번호. 0·1은 수평(지평선 위), 2는 수직. 라벨일 뿐 세계 방위를 뜻하지 않는다. */
export type AxisId = 0 | 1 | 2;
export const HORIZONTAL_AXES: AxisId[] = [0, 1];

export type Gesture =
  | { kind: "vp_point"; axis: AxisId; at: Pt2 }
  | { kind: "vp_line"; axis: AxisId; a: Pt2; b: Pt2 }
  | { kind: "horizon"; a: Pt2; b: Pt2 }
  | { kind: "lens"; f: number }
  | { kind: "edge_vote"; axis: AxisId; a: Pt2; b: Pt2 };

/** 축 하나가 어떻게 정해졌는지. 표시에 그대로 쓴다(§3.2 "무엇이 부족한지 보인다"). */
export type AxisState =
  | { status: "unknown"; nLines: 0 }
  | { status: "on_line"; nLines: 1; line: { a: Pt2; b: Pt2 } }   // 자유도 1 남음
  | { status: "fixed"; nLines: number; vp: Pt2; source: "point" | "lines" | "horizon×line"; residual: number | null };

/**
 * **저장·복원용 원시 입력**(S-9). 푼 결과가 아니라 **사용자가 넣은 것 그대로**다 —
 * 그래야 열었을 때 같은 상태에서 이어 그릴 수 있다(선을 더 그으면 잔차가 이어진다).
 */
export interface AccumulatorDump {
  lines: Record<AxisId, { a: Pt2; b: Pt2 }[]>;
  points: Partial<Record<AxisId, Pt2>>;
  horizon: { a: Pt2; b: Pt2 } | null;
  lensF: number | null;
}

export interface AccumulatorState {
  axes: Record<AxisId, AxisState>;
  horizon: { a: Pt2; b: Pt2 } | null;
  lensF: number | null;
}

export interface SolveResult {
  camera: CameraSolution;
  axes: Record<AxisId, AxisState>;
  /** 남은 자유도와 **그것을 없애는 방법**. 부족하면 무엇이 부족한지 보인다(§3.2). */
  remaining: { dof: number; hint: string }[];
  /** 실시간 유효성 (§3.4). 오류가 아니라 정보다 — 어느 입력이 어긋났는지 알려준다. */
  warnings: { level: "error" | "warn"; text: string }[];
  /** 과잉 결정 시 최소제곱 잔차(이미지 대각 대비). null이면 과잉 결정이 아니다. */
  residual: number | null;
}

export class ConstraintAccumulator {
  private lines: Record<AxisId, { a: Pt2; b: Pt2 }[]> = { 0: [], 1: [], 2: [] };
  private points: Partial<Record<AxisId, Pt2>> = {};
  private horizon: { a: Pt2; b: Pt2 } | null = null;
  private lensF: number | null = null;

  imgSize: [number, number];
  constructor(imgSize: [number, number]) { this.imgSize = imgSize; }

  /** 창 크기가 바뀌면 화각·무한원 판정의 기준이 바뀐다. 제스처는 그대로 둔다. */
  resize(imgSize: [number, number]): this { this.imgSize = imgSize; return this; }

  add(g: Gesture): this {
    switch (g.kind) {
      case "vp_point": this.points[g.axis] = g.at; break;
      case "vp_line":
      case "edge_vote": this.lines[g.axis].push({ a: g.a, b: g.b }); break;
      case "horizon": this.horizon = { a: g.a, b: g.b }; break;
      case "lens": this.lensF = g.f; break;
    }
    return this;
  }

  /** 마지막 제스처 되돌리기용 — 축의 선 하나를 뺀다. 전체 상태는 W-7에서 다룬다. */
  popLine(axis: AxisId): this { this.lines[axis].pop(); return this; }

  /**
   * **축의 가이드 선을 통째로 바꾼다**(L-A.5, 계획서 §5.4). 끌 때마다 쌓이면 안 되므로
   * `add`가 아니라 교체다. **점 제약도 지운다** — 점이 있으면 `solveAxis`가 선을 무시한다.
   */
  setLines(axis: AxisId, ls: { a: Pt2; b: Pt2 }[]): this {
    this.lines[axis] = ls.map(l => ({ a: [...l.a] as Pt2, b: [...l.b] as Pt2 }));
    delete this.points[axis];
    return this;
  }

  /**
   * **축의 소실점을 통째로 바꾼다**(2026-08-16 규칙 경로). `null`이면 지운다 —
   * 그 축은 **무한원이거나 미정**이고, 어느 쪽인지는 `vpRules`의 슬롯이 안다
   * (카메라 수학에는 차이가 없다: 둘 다 유한 소실점이 아니다).
   *
   * `setLines`와 같은 이유로 `add`가 아니라 교체다 — 획마다 쌓이면 안 된다.
   */
  setPoint(axis: AxisId, at: Pt2 | null): this {
    if (at) this.points[axis] = [at[0], at[1]];
    else delete this.points[axis];
    return this;
  }

  /** 렌즈 설정(1점 투시의 f). `null`이면 비운다. **측정이 아니라 설정이다**(provenance). */
  setLens(f: number | null): this {
    this.lensF = f != null && f > 0 ? f : null;
    return this;
  }

  reset(): this {
    this.lines = { 0: [], 1: [], 2: [] };
    this.points = {}; this.horizon = null; this.lensF = null;
    return this;
  }

  state(): AccumulatorState {
    return { axes: this.solve().axes, horizon: this.horizon, lensF: this.lensF };
  }

  /**
   * **저장용 원시 상태**(S-9). `state()`는 푼 결과(`axes`)를 주는데 그것으로는 복원이 안 된다 —
   * 소실점이 선 두 개로 정해졌는지 점 하나로 정해졌는지가 사라지고, 그러면 사용자가 다시
   * 선을 그었을 때의 잔차·과잉 결정 표시가 달라진다. **입력 그대로**를 담는다.
   *
   * `imgSize`는 담지 않는다 — 창 크기는 열 때의 것이고 `resize`가 정한다(제스처는 그대로다).
   */
  dump(): AccumulatorDump {
    return {
      lines: { 0: this.lines[0].map(l => ({ a: [...l.a] as Pt2, b: [...l.b] as Pt2 })),
               1: this.lines[1].map(l => ({ a: [...l.a] as Pt2, b: [...l.b] as Pt2 })),
               2: this.lines[2].map(l => ({ a: [...l.a] as Pt2, b: [...l.b] as Pt2 })) },
      points: ([0, 1, 2] as AxisId[]).reduce((o, a) => {
        if (this.points[a]) o[a] = [...this.points[a]!] as Pt2;
        return o;
      }, {} as Partial<Record<AxisId, Pt2>>),
      horizon: this.horizon ? { a: [...this.horizon.a] as Pt2, b: [...this.horizon.b] as Pt2 } : null,
      lensF: this.lensF,
    };
  }

  /** `dump()`의 역. **깊은 복사로 받는다** — 저장된 객체를 그대로 물면 나중 편집이 새 나간다. */
  load(d: AccumulatorDump): this {
    this.reset();
    for (const a of [0, 1, 2] as AxisId[]) {
      for (const l of d.lines?.[a] ?? []) this.add({ kind: "vp_line", axis: a, a: l.a, b: l.b });
      const p = d.points?.[a];
      if (p) this.add({ kind: "vp_point", axis: a, at: p });
    }
    if (d.horizon) this.add({ kind: "horizon", a: d.horizon.a, b: d.horizon.b });
    if (d.lensF != null) this.add({ kind: "lens", f: d.lensF });
    return this;
  }

  private diag(): number { return Math.hypot(this.imgSize[0], this.imgSize[1]); }

  /** 점에서 직선까지의 수직거리. 과잉 결정 잔차의 재료. */
  private static ptLineDist(p: Pt2, a: Pt2, b: Pt2): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    if (L < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
  }

  private solveAxis(axis: AxisId): AxisState {
    const ls = this.lines[axis];
    const pt = this.points[axis];
    if (pt) {
      // 점을 찍었으면 그것이 소실점이다. 선이 함께 있으면 잔차로 어긋남을 보여 준다.
      const res = ls.length
        ? ls.reduce((m, l) => Math.max(m, ConstraintAccumulator.ptLineDist(pt, l.a, l.b)), 0) / this.diag()
        : null;
      return { status: "fixed", nLines: ls.length, vp: pt, source: "point", residual: res };
    }
    if (ls.length >= 2) {
      const vp = lsIntersection(ls.map(l => ({ p: l.a, d: [l.b[0] - l.a[0], l.b[1] - l.a[1]] as Pt2 })));
      if (!vp) return { status: "on_line", nLines: 1, line: ls[0] };   // 전부 평행 → 무한원
      const res = ls.length > 2
        ? Math.sqrt(ls.reduce((s, l) => s + ConstraintAccumulator.ptLineDist(vp, l.a, l.b) ** 2, 0) / ls.length)
          / this.diag()
        : 0;
      return { status: "fixed", nLines: ls.length, vp, source: "lines", residual: res };
    }
    if (ls.length === 1) {
      // 선 하나 + 지평선 → 교점이 소실점이다. 서로 다른 제스처가 **같은 누산기에서 만난다**.
      if (this.horizon && HORIZONTAL_AXES.includes(axis)) {
        const vp = lineIntersect(ls[0].a, ls[0].b, this.horizon.a, this.horizon.b);
        if (vp) return { status: "fixed", nLines: 1, vp, source: "horizon×line", residual: 0 };
      }
      return { status: "on_line", nLines: 1, line: ls[0] };
    }
    return { status: "unknown", nLines: 0 };
  }

  solve(): SolveResult {
    const axes = { 0: this.solveAxis(0), 1: this.solveAxis(1), 2: this.solveAxis(2) } as
      Record<AxisId, AxisState>;
    const vps: (Pt2 | null)[] = ([0, 1, 2] as AxisId[])
      .map(a => (axes[a].status === "fixed" ? (axes[a] as any).vp as Pt2 : null));

    // 주점 y: 지평선이 있으면 그 높이다(§3.1). 2점 경로에서 자유도 1을 여기서 쓸 수 있다.
    let principal: Pt2 | undefined;
    if (this.horizon) {
      const [W] = this.imgSize;
      const t = lineIntersect(this.horizon.a, this.horizon.b, [W / 2, 0], [W / 2, 1]);
      if (t) principal = [W / 2, t[1]];
    }

    const camera = recoverCamera(vps, this.imgSize, {
      principal, fSetting: this.lensF ?? undefined,
    });

    const warnings: SolveResult["warnings"] = [];
    // 6.5 예각 조건 — 둔각이면 f²<0. 점을 끄는 동안 즉시 보여야 한다(§3.4).
    if (camera.case === "3pt" && !camera.ok) {
      warnings.push({
        level: "error",
        text: "소실점 삼각형이 둔각입니다 — 이 배치에 맞는 카메라가 없습니다(예각이어야 함, 이론서 6.5)",
      });
    }
    if (camera.case === "2pt" && !camera.ok) {
      warnings.push({
        level: "error",
        text: "두 소실점이 화면 중심의 같은 쪽에 있습니다 — 직교하는 두 방향이 아닙니다(6.2)",
      });
    }
    // 18.4 화각
    const g = gate(camera.f, this.imgSize[0], camera.ok);
    if (camera.ok && g.verdict === "unreliable") {
      warnings.push({
        level: "warn",
        text: `화각 ${g.fovDeg}° — 90°를 넘습니다. 소실점을 더 벌리거나 렌즈를 좁히세요(18.4)`,
      });
    } else if (camera.ok && g.verdict === "warn") {
      warnings.push({ level: "warn", text: `화각 ${g.fovDeg}° — 다소 넓습니다(권장 60° 이하, 18.4)` });
    }

    // 과잉 결정 잔차 — 오류가 아니라 **어느 입력이 어긋났는지**를 알려주는 정보다(§3.3)
    const resid = ([0, 1, 2] as AxisId[])
      .map(a => (axes[a].status === "fixed" ? (axes[a] as any).residual as number | null : null))
      .filter((x): x is number => x != null && x > 0);
    const residual = resid.length ? Math.max(...resid) : null;
    if (residual != null && residual > 0.01) {
      warnings.push({
        level: "warn",
        text: `입력이 서로 ${(residual * 100).toFixed(1)}% 어긋납니다 — 어느 선이 튀는지 확인하세요`,
      });
    }

    return { camera, axes, remaining: this.remaining(axes, camera), warnings, residual };
  }

  /** 남은 자유도와 없애는 방법 (5.3). 부족한 것을 **보여 주는** 것이 UI의 일이다(§3.2). */
  private remaining(axes: Record<AxisId, AxisState>, cam: CameraSolution): { dof: number; hint: string }[] {
    const out: { dof: number; hint: string }[] = [];
    for (const a of [0, 1, 2] as AxisId[]) {
      const s = axes[a];
      if (s.status === "unknown") {
        out.push({ dof: 2, hint: `축 ${a + 1}: 소실점 미정 — 점을 찍거나 그 방향 선을 두 개 그으세요` });
      } else if (s.status === "on_line") {
        out.push({
          dof: 1,
          hint: HORIZONTAL_AXES.includes(a)
            ? `축 ${a + 1}: 선이 하나뿐 — 하나 더 긋거나 **지평선**을 그으면 교점으로 정해집니다`
            : `축 ${a + 1}: 선이 하나뿐 — 하나 더 그으세요`,
        });
      }
    }
    if (cam.case === "1pt" && !cam.ok) {
      out.push({ dof: 1, hint: "f 미정 — 렌즈를 고르면 깊이가 채워집니다. 폭·높이는 지금도 실척 비례입니다(7.7)" });
    }
    if (cam.case === "axonometric") {
      out.push({ dof: 3, hint: "소실점이 없습니다 — 평행투영 상태입니다. 깊이가 정해지지 않습니다" });
    }
    return out;
  }
}

// ---------------------------------------------------------------- 프리셋 (§3.7)

/** 35mm 환산 초점거리 → 픽셀 f. 세션 시작 마찰을 없애는 기본값일 뿐 측정이 아니다. */
export function fPixelsFrom35mm(mm: number, imgWidth: number): number {
  return (mm / 36.0) * imgWidth;      // 35mm 판 가로 36mm
}

export interface Preset { id: string; label: string; mm: number; vps: 1 | 2 | 3; note: string; }
export const PRESETS: Preset[] = [
  { id: "in1", label: "실내 1점 24mm", mm: 24, vps: 1, note: "좁은 방 정면 — 넓게 담긴다" },
  { id: "in2", label: "실내 2점 35mm", mm: 35, vps: 2, note: "방 모서리에서 본 구도" },
  { id: "out2", label: "외부 2점 50mm", mm: 50, vps: 2, note: "건물 모서리 — 왜곡이 가장 적다" },
  { id: "out3", label: "외부 3점 앙각", mm: 35, vps: 3, note: "올려다보는 구도 — 수직선도 모인다" },
];
