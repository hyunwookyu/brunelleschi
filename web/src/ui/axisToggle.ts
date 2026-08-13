// B-1 b/c — 축 뒤바뀜 두 해를 모두 유지하고 3D 뷰에서 토글한다.
//
// 측정 근거(stage0/out/axis_probe.json):
//  - 두 해의 재투영 오차 상대차가 **정확히 0**(median=p90=max=0.0, 100%가 1% 미만).
//    기하가 구분하지 못한다 — 노이즈로 흐려진 근사 동점이 아니라 **정확한 동점**이다.
//  - 선택률 0.507 = 동전 던지기. 선택 규칙 개선의 여지가 없다.
//  - 투시 종류와 무관(1점 0.295 / 중간 0.320 / 2점 0.335) — 8way가 화면평행 정보를 버린다.
//  - 뒤바뀜 시 평면 IoU 0.53(정상 0.85), 발생률 ~0.3 → 최대 식별 오차원.
//
// → 질의(§6)보다 **보여주고 고르게** 하는 편이 빠르다. 사용자는 보면 즉시 판별한다.
import type { IR, Pt, Volume } from "../parser/types.js";

// footprint x/y 교환 = 축 뒤바꾼 대안 해.
export function swapAxes(fp: Pt[]): Pt[] {
  return fp.map(([x, y]) => [y, x] as Pt);
}

export function isAxisAmbiguous(v: Volume): boolean {
  return !!v.axis && v.axis.ambiguous === true;
}

export function hasAmbiguousAxis(ir: IR): boolean {
  return ir.volumes.some(isAxisAmbiguous);
}

// 축 모호 볼륨만 대안 해로 바꾼 IR. 모호하지 않은 볼륨은 건드리지 않는다.
export function applyAxisChoice(ir: IR, useAlternate: boolean): IR {
  if (!useAlternate) return ir;
  return {
    ...ir,
    volumes: ir.volumes.map(v => {
      if (!isAxisAmbiguous(v)) return v;
      const ax = v.axis!;
      return {
        ...v,
        footprint: swapAxes(v.footprint),
        axis: { ...ax, aspect: ax.aspect_alt, aspect_alt: ax.aspect },
      };
    }),
  };
}

// B-1 c — 치수 입력이 어느 축을 가리키는지 확정되기 전에는 **두 해에 각각 적용해 보여준다**.
export interface AxisPreview {
  label: string;          // 사람이 읽을 설명
  widthDepth: [number, number];
}

function extent(fp: Pt[], axis: 0 | 1): number {
  const v = fp.map(p => p[axis]);
  return Math.max(...v) - Math.min(...v);
}

// 볼륨 하나에 대해 두 해가 각각 어떤 폭/깊이가 되는지. 사용자가 고르는 화면에 쓴다.
export function previewBothSolutions(v: Volume): AxisPreview[] {
  const a: [number, number] = [extent(v.footprint, 0), extent(v.footprint, 1)];
  const swapped = swapAxes(v.footprint);
  const b: [number, number] = [extent(swapped, 0), extent(swapped, 1)];
  const fmt = (t: [number, number]) => `폭 ${t[0].toFixed(1)} × 깊이 ${t[1].toFixed(1)}`;
  return [{ label: `해 A — ${fmt(a)}`, widthDepth: a },
          { label: `해 B — ${fmt(b)}`, widthDepth: b }];
}

// B-1 d — 투시 종류별 축 모호 정도(실측). 문서·안내에서 참조한다.
// **측정 결과 투시 종류가 모호도를 줄이지 않는다**: 1점 0.295 / 중간 0.320 / 2점 0.335.
// 1점에서는 한 방향이 화면 평행이라 원리적으로는 구별 가능하나, 현행 8way 대응 탐색이
// 그 정보를 쓰지 않는다. 2점은 두 방향 모두 소실점을 가져 원리적으로도 구별 불가.
// 높이는 어느 경우에도 화면 수직이라 축 모호가 없다(이론서 7.7).
export const AXIS_AMBIGUITY_BY_VIEW: Record<string, { flipRate: number; note: string }> = {
  "1pt": { flipRate: 0.295, note: "원리적으로는 화면평행 방향이 구별되나 현행 8way가 그 정보를 버림" },
  "mid": { flipRate: 0.320, note: "중간 방위각" },
  "2pt": { flipRate: 0.335, note: "두 방향 모두 소실점 → 원리적으로 구별 불가" },
};

export const HEIGHT_HAS_NO_AXIS_AMBIGUITY = true;   // 이론서 7.7 — 화면 수직
