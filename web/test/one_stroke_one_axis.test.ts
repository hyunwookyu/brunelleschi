// AS-6 "한 획 = 한 축" — **새 접근의 단위 가정**을 실획으로 잰다.
//
// 리뷰어가 짚었다: W-0 원장(`archive_W/stroke_edge.json`)의 `multi_run_rate 0.858`은
// 실획의 다수가 한 획 안에 직선 런을 여럿 담는다는 뜻이고, 그것은
// 계획서 §4.1의 "획 전체가 하나의 축에 배정된다"를 **반박하는 쪽**이다.
// 그 수치를 W 폐기 근거로만 인용하고 새 전제로 등록하지 않았다.
//
// 여기서 재는 것은 **위반율**이다 — 실획 중 방향 급변이 있어 한 축에 담을 수 없는 비율.
// 이 값이 크면 S-2가 대부분을 미분류로 보내고, 사용자가 매번 축을 지정해야 한다.
//
// **표본 조건을 먼저 말한다**(V-o·V-A): Quick,Draw는 마우스·손가락 **낙서**이고
// 작도 도구로 한 획씩 긋는 상황이 아니다. 계획서의 사용자 전제(투시도 숙련자)와 다르다.
// 따라서 이 값은 **위반율의 상한**으로 읽는다 — 숙련자는 이보다 덜 위반할 것으로
// 예상하나 **미측정**이다. 그 예상을 수치로 대신하지 않는다.
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pt2 } from "../src/s3d/camera.js";
import { loadQuickDraw } from "../src/data/quickdraw.js";
import { maxTurn, representative, AXIS_TOL } from "../src/s3d/axis.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORDS = ["square", "house", "castle", "skyscraper", "door", "triangle"];
const rate = (k: number, n: number) => (n ? +(k / n).toFixed(4) : null);
const med = (a: number[]) => (a.length ? +[...a].sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(3) : null);

interface Tally { n: number; multi: number; bent: number; single: number; turns: number[]; bends: number[]; }

function measure(turnDeg: number, words = WORDS, limit = 120): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const w of words) {
    const t: Tally = { n: 0, multi: 0, bent: 0, single: 0, turns: [], bends: [] };
    for (const cap of loadQuickDraw(ROOT, w, limit)) {
      for (const s of cap.strokes) {
        const pts = s.points.map(p => [p[0], p[1]] as Pt2);
        const rep = representative(pts);
        if (!rep || rep.len < 8) continue;              // 점 수준의 탭은 제외
        t.n += 1;
        const turn = maxTurn(pts, AXIS_TOL.turn_window_ratio);
        t.turns.push(turn); t.bends.push(rep.bend);
        if (turn > turnDeg) t.multi += 1;
        else if (rep.bend > AXIS_TOL.bend_max) t.bent += 1;
        else t.single += 1;
      }
    }
    out[w] = t;
  }
  return out;
}

const sum = (all: Record<string, Tally>) =>
  Object.values(all).reduce((a, t) => ({
    n: a.n + t.n, multi: a.multi + t.multi, bent: a.bent + t.bent, single: a.single + t.single,
    turns: a.turns.concat(t.turns), bends: a.bends.concat(t.bends),
  }), { n: 0, multi: 0, bent: 0, single: 0, turns: [], bends: [] } as Tally);

const view = (t: Tally) => ({
  n: t.n,
  single_axis_rate: rate(t.single, t.n),
  multi_axis_rate: rate(t.multi, t.n),
  too_bent_rate: rate(t.bent, t.n),
  turn_median_deg: med(t.turns),
  bend_median: med(t.bends),
});

describe("AS-6 한 획 = 한 축", () => {
  it("실획에서 위반율을 재고 stage0/out/one_stroke_one_axis.json에 남긴다", () => {
    const base = measure(AXIS_TOL.turn_deg);
    const total = sum(base);

    // 임계 스윕 — 위반율이 임계에 얼마나 민감한지. 한 점만 보고하면 임계가 결론을 만든다.
    const sweep = [25, 35, 45, 60, 80].map(turn_deg => ({
      turn_deg, ...view(sum(measure(turn_deg, WORDS, 60))),
    }));

    const report = {
      spec: "AS-6 '한 획 = 한 축'의 실획 위반율. 방향 급변(maxTurn)으로 검출.",
      why: (
        "계획서 §4.1은 '획 전체가 하나의 축에 배정된다'를 기본 동작으로 두지만 "
        + "그것을 전제로 등록하지 않았다(리뷰어 지적). W-0 원장의 multi_run_rate 0.858은 "
        + "오히려 반대를 시사한다. 그래서 직접 잰다."
      ),
      sample_caveat: [
        "Quick,Draw raw = 마우스·손가락 **낙서**다. 작도 도구로 한 획씩 긋는 상황이 아니다.",
        "계획서의 사용자 전제(투시도 숙련자)와 **다른 표본**이다(assumptions V-o, V-A).",
        "따라서 이 값은 **위반율의 상한**으로 읽는다. 숙련자가 더 낮을 것이라는 예상은 미측정이며,",
        "그 예상을 수치로 대신하지 않는다. 실제 획은 S-10 이후 수집한다.",
      ],
      relation_to_W0: (
        "W-0의 multi_run_rate(0.858, square)는 **직선 런 개수**를 세었고 여기서는 "
        + "**방향 급변**을 센다. 완만히 휜 획은 런이 여럿이어도 축은 하나다 — 다른 양이다. "
        + "두 값을 같은 척도로 비교하면 안 된다(V-p 단위 혼동 유형)."
      ),
      thresholds: { turn_deg: AXIS_TOL.turn_deg, bend_max: AXIS_TOL.bend_max },
      totals: view(total),
      by_word: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, view(v)])),
      turn_deg_sweep: sweep,
    };
    const outDir = resolve(ROOT, "stage0", "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "one_stroke_one_axis.json"), JSON.stringify(report, null, 2), "utf-8");

    expect(total.n).toBeGreaterThan(500);
    // 위반율이 임계에 따라 실제로 움직여야 한다 — 안 움직이면 검출기가 임계를 안 쓰는 것이다
    expect(sweep[0].multi_axis_rate!).toBeGreaterThan(sweep[4].multi_axis_rate!);
  }, 300_000);

  it("반례: 곧은 획은 위반으로 세지 않는다", () => {
    const straight: Pt2[] = Array.from({ length: 40 }, (_, i) => [i * 8, i * 3] as Pt2);
    expect(maxTurn(straight, AXIS_TOL.turn_window_ratio)).toBeLessThan(AXIS_TOL.turn_deg);
  });

  it("반례: 완만히 휜 획도 위반이 아니다 — 축은 하나다", () => {
    const arc: Pt2[] = Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      return [t * 300, Math.sin(Math.PI * t) * 18] as Pt2;
    });
    expect(maxTurn(arc, AXIS_TOL.turn_window_ratio)).toBeLessThan(AXIS_TOL.turn_deg);
  });
});
