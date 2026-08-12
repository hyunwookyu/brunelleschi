"""발화 번역 문법 — 출력은 7개로 닫힘 (§3.6).

입력(발화)은 무한, 출력은 닫혀 있어야 한다. LLM은 발화를 읽고 아래 7개 op의
조합으로만 IR 조각을 낸다. 스키마 검증 실패 시 재시도(§3.6).
LLM 역할 = 어휘 해석이 아니라 미지정 항목 식별(§3.7).
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

OPS = ("set", "range", "min", "relate", "retract", "unresolved", "note")

# 각 op의 인자 스키마 (닫힌 출력 검증용)
OP_SIG: dict[str, list[str]] = {
    "set":        ["id", "prop", "value"],            # set(id, prop, value)
    "range":      ["id", "prop", "min", "max"],       # range(id, prop, min, max)
    "min":        ["id", "prop", "value"],            # min(id, prop, value)
    "relate":     ["a", "b", "type"],                 # relate(a, b, type)
    "retract":    ["target"],                         # retract(target)
    "unresolved": ["id", "prop"],                     # unresolved(id, prop)
    "note":       ["id", "text"],                     # note(id, text)
}

RELATE_TYPES = ("adjacent", "above", "below", "inside", "aligned", "parallel", "orthogonal", "separated")


@dataclass
class Op:
    op: str
    args: dict[str, Any]

    def validate(self) -> list[str]:
        e = []
        if self.op not in OPS:
            return [f"unknown op '{self.op}' (not in 7-grammar)"]
        need = set(OP_SIG[self.op])
        got = set(self.args)
        if got != need:
            miss = need - got
            extra = got - need
            if miss:
                e.append(f"{self.op} missing args {sorted(miss)}")
            if extra:
                e.append(f"{self.op} extra args {sorted(extra)}")
        if self.op == "range" and not e:
            if self.args["min"] > self.args["max"]:
                e.append("range min>max")
        if self.op == "relate" and not e:
            if self.args["type"] not in RELATE_TYPES:
                e.append(f"relate type '{self.args['type']}' unknown")
        return e


def parse_ops(objs: list[dict]) -> tuple[list[Op], list[str]]:
    """LLM 출력(dict 리스트) → 검증된 Op 리스트. 실패 사유도 반환."""
    ops, errs = [], []
    for i, o in enumerate(objs):
        if "op" not in o:
            errs.append(f"[{i}] no 'op' key")
            continue
        args = {k: v for k, v in o.items() if k != "op"}
        op = Op(o["op"], args)
        oe = op.validate()
        if oe:
            errs.extend(f"[{i}] {m}" for m in oe)
        else:
            ops.append(op)
    return ops, errs


# 발화 번역 표시용 (§3.6): "홀 폭이 한 12미터쯤" → range(hall, width, 10.8, 13.2)
def render_op(op: Op) -> str:
    a = op.args
    order = OP_SIG[op.op]
    return f"{op.op}(" + ", ".join(str(a[k]) for k in order) + ")"


if __name__ == "__main__":
    sample = [
        {"op": "range", "id": "hall", "prop": "width", "min": 10.8, "max": 13.2},
        {"op": "set", "id": "hall", "prop": "height", "value": 9.0},
        {"op": "unresolved", "id": "wall_3", "prop": "opening"},
        {"op": "relate", "a": "hall", "b": "deck", "type": "adjacent"},
        {"op": "frobnicate", "id": "x"},                     # invalid → rejected
        {"op": "range", "id": "z", "prop": "width", "min": 5, "max": 2},  # invalid
    ]
    ops, errs = parse_ops(sample)
    for o in ops:
        print("OK  ", render_op(o))
    print("REJECTED:")
    for m in errs:
        print("  -", m)
