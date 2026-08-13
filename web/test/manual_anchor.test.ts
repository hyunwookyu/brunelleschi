// V-4 수동 치수 입력 — 발화 앵커와 동일 전파(§3.3), id 이동 시 centroid 재매칭.
import { describe, it, expect } from "vitest";
import { emptyIR } from "../src/parser/types.js";
import type { IR, Volume } from "../src/parser/types.js";
import { applyOps } from "../src/parser/anchor.js";
import { ManualAnchorStore, matchVolumeId, centroid } from "../src/ui/manualAnchor.js";

function vol(id: string, x: number, y: number, w: number, h: number): Volume {
  return { id, footprint: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], base: 0, height: null, height_src: "unset", confidence: 0.9, label: "" };
}
function irWith(...vs: Volume[]): IR { return { ...emptyIR(), volumes: vs }; }
const widthOf = (v: Volume) => Math.max(...v.footprint.map(p => p[0])) - Math.min(...v.footprint.map(p => p[0]));

describe("V-4 수동 치수 앵커", () => {
  it("수동 set == 발화 set (동일 applyOps 결과)", () => {
    // 발화 경로
    const irSpeech = irWith(vol("v1", 0, 0, 40, 30));
    applyOps(irSpeech, [{ op: "set", args: { id: "v1", prop: "width", value: 12 } }]);
    // 수동 경로
    const store = new ManualAnchorStore();
    const base = irWith(vol("v1", 0, 0, 40, 30));
    store.add(base, "v1", "width", 12);
    const irManual = store.apply(base);
    expect(widthOf(irManual.volumes[0])).toBeCloseTo(12, 6);
    expect(irManual.volumes[0].footprint).toEqual(irSpeech.volumes[0].footprint);
    expect(irManual.anchors.length).toBe(1);
  });

  it("height 앵커도 발화와 동일", () => {
    const store = new ManualAnchorStore();
    const base = irWith(vol("v1", 0, 0, 40, 30));
    store.add(base, "v1", "height", 9);
    const ir = store.apply(base);
    expect(ir.volumes[0].height).toBe(9);
    expect(ir.volumes[0].height_src).toBe("utterance");
  });

  it("centroid 재매칭 — id가 바뀌어도 같은 볼륨에 적용(증분 id 이동 방어)", () => {
    const store = new ManualAnchorStore();
    // 처음: v1=왼쪽 볼륨에 앵커
    const t0 = irWith(vol("v1", 0, 0, 40, 30));
    store.add(t0, "v1", "width", 12);
    // 나중: 위쪽에 새 볼륨이 추가되며 정렬로 id가 v1↔v2 뒤바뀜(같은 기하가 이제 v2)
    const later = irWith(vol("v1", 0, -200, 40, 30), vol("v2", 0, 0, 40, 30));
    const cWant = centroid([[0, 0], [40, 0], [40, 30], [0, 30]]);
    expect(matchVolumeId(later, cWant[0], cWant[1])).toBe("v2");   // 이동 추적
    const ir = store.apply(later);
    const applied = ir.volumes.find(v => v.id === "v2")!;
    expect(widthOf(applied)).toBeCloseTo(12, 6);                   // 원래 볼륨에 적용
    const untouched = ir.volumes.find(v => v.id === "v1")!;
    expect(widthOf(untouched)).toBeCloseTo(40, 6);                 // 새 볼륨 무영향
  });

  it("같은 볼륨·prop 재입력은 덮어씀(중복 앵커 없음)", () => {
    const store = new ManualAnchorStore();
    const base = irWith(vol("v1", 0, 0, 40, 30));
    store.add(base, "v1", "width", 12);
    store.add(base, "v1", "width", 15);
    expect(store.count()).toBe(1);
    expect(widthOf(store.apply(base).volumes[0])).toBeCloseTo(15, 6);
  });
});
