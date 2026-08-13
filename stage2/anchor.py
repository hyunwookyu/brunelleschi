"""스케일 앵커 적용 — 발화 op → 절대 기하 (§3.3 채널권한, §3.4 충돌, §3.5 표시).

평면은 비례만 준다(§3.3 "평면은 비례만 준다. 절대값이 없으므로 앵커 하나가 들어오면
전체가 확정된다"). Stage1의 footprint는 무차원 좌표(픽셀 스케일)이므로, width 또는
depth에 절대/범위 앵커가 하나 들어오면 그 볼륨 폴리곤 전체를 균일 스케일해 절대
치수로 확정한다.

충돌(§3.4): 우선순위는 채널 표 순서 — 확정 발화(firm: set/min) > 완화 발화
(soft: range). 완화는 **자기 범위 안에서 먼저 조정**하고, 범위를 벗어날 때만
충돌로 note에 보고한다. 확정치가 이미 있으면 완화 발화는 그 범위 안에 들 때만
조용히 수용하고, 벗어나면 확정치를 지키며 note로 남긴다.

relate/note/retract/unresolved는 §3.2상 IR 스코프(볼륨/앵커/뷰/미해결/노트) 안에서
표현한다 — relations 필드는 1차 범위 제외이므로 relate는 note로 기록한다.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Volume, Anchor, Note
from common.grammar import Op, parse_ops

DIM_PROPS = ("width", "depth")   # 폴리곤 스케일에 관여하는 속성 (§3.3)
# width = footprint bbox의 x-extent, depth = y-extent로 해석한다.
# (§3.2/§3.5에 축 대응이 명시돼 있지 않아 이 파일에서 확정 — 정규직교 스냅
#  폴리곤을 전제하는 stage1 산출물과 일관된다.)


def _bbox_extent(footprint: list[list[float]], prop: str) -> float:
    xs = [p[0] for p in footprint]; ys = [p[1] for p in footprint]
    return (max(xs) - min(xs)) if prop == "width" else (max(ys) - min(ys))


def _scale_footprint(footprint: list[list[float]], prop: str, factor: float) -> list[list[float]]:
    """bbox의 최소 모서리(min-corner)를 고정점으로 균일 스케일한다. 앵커 기준점은
    사양에 없어 여기서 확정: 폭/깊이 중 하나로 스케일해도 다른 축도 같은 factor로
    비례 유지(§3.3 "비례만 준다" → 전체가 한 번에 확정)."""
    xs = [p[0] for p in footprint]; ys = [p[1] for p in footprint]
    ox, oy = min(xs), min(ys)
    return [[ox + (x - ox) * factor, oy + (y - oy) * factor] for x, y in footprint]


def _find_anchor(ir: IR, target: str, prop: str) -> Optional[Anchor]:
    return next((a for a in ir.anchors if a.target == target and a.prop == prop), None)


def _find_volume(ir: IR, target: str) -> Optional[Volume]:
    return next((v for v in ir.volumes if v.id == target), None)


def _apply_dimension(ir: IR, target: str, prop: str, value: float, tol: float,
                      src: str, firm: bool) -> None:
    """set/range/min이 공유하는 치수 확정 경로. §3.4 충돌 처리 포함."""
    vol = _find_volume(ir, target)
    if vol is None:
        ir.unresolved.append(f"{target}: 알 수 없는 volume (anchor {prop}={value})")
        return
    # 축 라벨 모호(지시 1-ter B): 투시 복원 볼륨은 폭/깊이를 역수까지만 정한다.
    # "폭 12미터"의 폭이 어느 축인지 시스템이 모르므로 **추정하지 않고 기록**한다.
    # height는 축 모호가 없다(화면 수직, 7.7절) → 예외.
    if prop in DIM_PROPS and isinstance(vol.axis, dict) and vol.axis.get("ambiguous"):
        from stage_perspective.uncertainty import axis_unresolved_entry
        msg = axis_unresolved_entry(target, vol.axis, vol.label)
        note = f"{target}: '{prop} {value}' 적용 — 축 라벨 미확정 상태에서 잠정 축 사용. 확인 필요"
        if msg and msg not in ir.unresolved:
            ir.unresolved.append(msg)
        ir.notes.append(Note(target=target, text=note))
    existing = _find_anchor(ir, target, prop)

    def commit(v: float, t: float) -> None:
        if prop in DIM_PROPS:
            extent = _bbox_extent(vol.footprint, prop)
            if extent <= 0:
                return
            vol.footprint = _scale_footprint(vol.footprint, prop, v / extent)
        elif prop == "height":
            vol.height = v
            vol.height_src = "utterance"
        # area/length/radius: 기하 반영 없이 앵커만 기록(1차 범위 밖 — footprint 압출 외 형상 없음)
        if existing:
            existing.value, existing.tol, existing.src = v, t, src
        else:
            ir.anchors.append(Anchor(target, prop, v, t, src))

    if existing is None:
        commit(value, tol)
        return

    if existing.tol > 0:                                # 기존 = 완화(soft) → 범위 내 우선 조정
        lo, hi = existing.value - existing.tol, existing.value + existing.tol
        if lo <= value <= hi:
            commit(value, 0.0 if firm else tol)          # 확정 발화가 범위 안을 짚으면 값이 고정된다
        else:
            commit(value, tol)                            # 범위 밖 → 최신 발화 채택하되 충돌 보고
            ir.notes.append(Note(target,
                f"충돌: {prop} 기존 {existing.value}±{existing.tol} vs 신규 {value} "
                f"(범위 밖, {'확정' if firm else '완화'} 발화 반영, src={src})"))
    else:                                                 # 기존 = 확정(firm)
        if firm:
            if value != existing.value:
                ir.notes.append(Note(target, f"{prop} 확정치 갱신: {existing.value} → {value} (src={src})"))
            commit(value, tol)
        elif abs(value - existing.value) > tol:           # 신규 완화가 확정치 범위 밖 → 확정치 우선(§3.4)
            ir.notes.append(Note(target,
                f"충돌: 완화발화 {prop} {value}±{tol}가 기존 확정치 {existing.value}와 불일치 "
                f"— 확정치 유지(§3.4 우선순위, src={src})"))
        # 범위 안이면 확정치를 유지한 채 조용히 넘어간다(충돌 아님)


def apply_ops(ir: IR, ops: list[Op]) -> IR:
    """ops를 순서대로 ir에 반영하고 ir을 반환한다(제자리 변형).
    §3.5 "앵커 없으면 단위 없이" — 여기서 없는 속성에 기본값을 채우는 코드는 없다."""
    from collect.logschema import collector             # §14 기록(기본 꺼짐, no-op)
    collector.log_ir("anchor_before", ir)
    for op in ops:
        a = op.args
        if op.op == "set":
            _apply_dimension(ir, a["id"], a["prop"], float(a["value"]), 0.0,
                              "utterance_firm", firm=True)

        elif op.op == "range":
            mid = (a["min"] + a["max"]) / 2.0
            tol = (a["max"] - a["min"]) / 2.0
            _apply_dimension(ir, a["id"], a["prop"], mid, tol,
                              "utterance_soft", firm=False)

        elif op.op == "min":                              # 하한만 설정 — 이미 만족하면 개입 않음
            vol = _find_volume(ir, a["id"])
            if vol is None:
                ir.unresolved.append(f"{a['id']}: 알 수 없는 volume (min {a['prop']})")
                continue
            current = _bbox_extent(vol.footprint, a["prop"]) if a["prop"] in DIM_PROPS \
                else (vol.height or 0.0)
            if current < a["value"]:
                _apply_dimension(ir, a["id"], a["prop"], float(a["value"]), 0.0,
                                  "utterance_firm:min", firm=True)

        elif op.op == "relate":                           # relations는 IR 1차 범위 밖(§3.2) → note 보존
            ir.notes.append(Note(a["a"], f"relate({a['a']}, {a['b']}, {a['type']})"))

        elif op.op == "retract":
            before = len(ir.anchors)
            ir.anchors = [x for x in ir.anchors if x.target != a["target"]]
            if len(ir.anchors) == before:
                ir.notes.append(Note(a["target"], "retract: 대상 anchor 없음"))

        elif op.op == "unresolved":
            item = f"{a['id']}: {a['prop']}"
            if item not in ir.unresolved:
                ir.unresolved.append(item)

        elif op.op == "note":
            ir.notes.append(Note(a["id"], a["text"]))
    collector.log_ir("anchor_after", ir)               # §14 before/after 쌍
    return ir


if __name__ == "__main__":
    from stage2.translate import translate

    ir = IR.from_dict(json.loads((ROOT / "stage1" / "out_ir_L.json").read_text(encoding="utf-8")))
    xs0 = [p[0] for p in ir.volumes[0].footprint]
    print("적용 전 bbox width(무차원):", round(max(xs0) - min(xs0), 2))

    segments = [
        {"text": "v1 폭이 한 12미터쯤 됩니다", "start": 10.0, "dur": 2.0},
        {"text": "높이는 9미터입니다", "start": 20.0, "dur": 2.0},
        {"text": "v1은 deck 옆에 붙여주세요", "start": 30.0, "dur": 2.0},
        {"text": "아니, 그거 말고 다시 잴게요", "start": 40.0, "dur": 1.5},
    ]
    ops, errs = translate(ir, segments)
    print()
    ir = apply_ops(ir, ops)

    xs1 = [p[0] for p in ir.volumes[0].footprint]
    print("\n적용 후 bbox width(m):", round(max(xs1) - min(xs1), 3))
    print("height:", ir.volumes[0].height)
    print("anchors:", [(a.target, a.prop, a.value, a.tol) for a in ir.anchors])
    print("notes:", [(n.target, n.text) for n in ir.notes])
    print("unresolved:", ir.unresolved)
    print("root fields:", ir.root_field_count(), "| validate:", ir.validate())
