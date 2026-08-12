"""IR 스키마 — 단일 소스 (§3.2). 버전 v1.0 (0단계 잠정).

원칙(§3.1): LLM은 IR만, 기하는 결정론적 솔버. 스키마는 CLAUDE.md 문서와 동기(§10).
필드 계수 규칙(§13): "필드" = 루트 최상위 키 수. 12 초과 시 멈춤.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any
import json

SCHEMA_VERSION = "1.0"

# 루트 최상위 키 — §13 12개 초과 시 멈춤 판정 대상
ROOT_FIELDS = ["volumes", "anchors", "views", "unresolved", "notes", "relations"]
MAX_ROOT_FIELDS = 12

# 관계 유형(5종) — 유튜브 코퍼스 실측(§stage5). 계획의 4종(인접·상하·관입·이격)에
# aligned(정렬)를 데이터 근거로 추가(13회). above_below는 방향 미분화(기하는 Z 필요).
RELATION_TYPES = ("adjacent", "above_below", "penetrate", "separated", "aligned")
# 발화 문법(grammar.RELATE_TYPES) → 5종 정준 매핑
GRAMMAR_TO_CANON = {
    "adjacent": "adjacent", "beside": "adjacent",
    "above": "above_below", "below": "above_below",
    "inside": "penetrate",
    "aligned": "aligned", "parallel": "aligned", "orthogonal": "aligned",
    "separated": "separated",
}

# 채널 권한 (§3.3) — 무엇을 주장할 자격이 있는가
CHANNEL_RIGHTS = {
    "handwritten_number": {"absolute": True,  "ratio": False, "relation": False, "view": False},
    "utterance_firm":     {"absolute": True,  "ratio": False, "relation": True,  "view": False},
    "utterance_soft":     {"absolute": "range","ratio": False, "relation": True,  "view": False},
    "plan":               {"absolute": False, "ratio": True,  "relation": True,  "view": False},
    "perspective":        {"absolute": False, "ratio": "weak","relation": True,  "view": True},
    "diagram":            {"absolute": False, "ratio": False, "relation": True,  "view": False},
}
# 충돌 우선순위 (§3.4) — 높을수록 우선
CHANNEL_PRIORITY = ["handwritten_number", "utterance_firm", "utterance_soft",
                    "plan", "perspective", "diagram"]

# 치수 표시 톤 (§3.5)
DIM_TONE = {"explicit": "solid+num", "range_fixed": "solid+~", "ratio_prop": "dashed"}


@dataclass
class Volume:
    id: str
    footprint: list[list[float]]          # [[x,y],...] world, Z=0
    base: float = 0.0
    height: float | None = None           # 앵커 없으면 None = 무차원(§3.5)
    height_src: str = "unset"             # utterance | handwritten | vertical_stroke | unset
    confidence: float = 1.0
    label: str = ""                       # 명명(§7 4단계). 중첩 필드 — 루트 키 수 불변(§13)

    def validate(self) -> list[str]:
        e = []
        if not self.id:
            e.append("volume.id empty")
        if len(self.footprint) < 3:
            e.append(f"volume[{self.id}] footprint <3 pts")
        for p in self.footprint:
            if len(p) != 2:
                e.append(f"volume[{self.id}] point not [x,y]: {p}")
        if not (0.0 <= self.confidence <= 1.0):
            e.append(f"volume[{self.id}] confidence out of [0,1]")
        return e


@dataclass
class Anchor:
    target: str
    prop: str                             # width | depth | height | area ...
    value: float
    tol: float = 0.0                      # 완화 발화 = tol>0 → 범위
    src: str = ""                         # 예: utterance:t=142.3

    def validate(self) -> list[str]:
        e = []
        if not self.target:
            e.append("anchor.target empty")
        if self.prop not in ("width", "depth", "height", "area", "length", "radius"):
            e.append(f"anchor prop unknown: {self.prop}")
        if self.tol < 0:
            e.append(f"anchor[{self.target}.{self.prop}] negative tol")
        return e


@dataclass
class View:
    src: str
    camera: dict[str, Any] = field(default_factory=dict)   # solvePnP 결과
    fit_error: float | None = None                          # 재투영 오차 (§6.5)

    def validate(self) -> list[str]:
        return [] if self.src else ["view.src empty"]


@dataclass
class Note:
    target: str
    text: str


@dataclass
class Relation:
    """볼륨 간 관계 (§5단계). type ∈ RELATION_TYPES(5종). src=geometry|utterance."""
    a: str
    b: str
    type: str
    src: str = "geometry"

    def validate(self) -> list[str]:
        e = []
        if self.type not in RELATION_TYPES:
            e.append(f"relation type unknown: {self.type}")
        if self.a == self.b:
            e.append(f"relation self-loop: {self.a}")
        return e


@dataclass
class IR:
    """루트. unresolved가 핵심 필드(§3.2). relations는 1차 제외."""
    volumes: list[Volume] = field(default_factory=list)
    anchors: list[Anchor] = field(default_factory=list)
    views: list[View] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)     # 추정 않고 남기는 항목
    notes: list[Note] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)  # 5단계. 루트 6키(≤12, §13)

    def root_field_count(self) -> int:
        return len([f for f in self.__dataclass_fields__])

    def validate(self) -> list[str]:
        e = []
        n = self.root_field_count()
        if n > MAX_ROOT_FIELDS:
            e.append(f"STOP: root fields {n} > {MAX_ROOT_FIELDS} (§13)")
        ids = [v.id for v in self.volumes]
        if len(ids) != len(set(ids)):
            e.append("duplicate volume ids")
        for v in self.volumes:
            e += v.validate()
        for a in self.anchors:
            e += a.validate()
            if a.target not in ids:
                e.append(f"anchor target '{a.target}' not a volume id")
        for vw in self.views:
            e += vw.validate()
        for r in self.relations:
            e += r.validate()
            for t in (r.a, r.b):
                if t not in ids:
                    e.append(f"relation target '{t}' not a volume id")
        return e

    # 시간 단조성(§6.5): IR(t+1) ⊇ IR(t)  — 볼륨/앵커 집합이 줄지 않아야
    def superset_of(self, prev: "IR") -> bool:
        pv = {v.id for v in prev.volumes}
        cv = {v.id for v in self.volumes}
        if not pv.issubset(cv):
            return False
        pa = {(a.target, a.prop) for a in prev.anchors}
        ca = {(a.target, a.prop) for a in self.anchors}
        return pa.issubset(ca)

    def to_json(self, **kw) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, **kw)

    @staticmethod
    def from_dict(d: dict) -> "IR":
        return IR(
            volumes=[Volume(**v) for v in d.get("volumes", [])],
            anchors=[Anchor(**a) for a in d.get("anchors", [])],
            views=[View(**v) for v in d.get("views", [])],
            unresolved=list(d.get("unresolved", [])),
            notes=[Note(**n) for n in d.get("notes", [])],
            relations=[Relation(**r) for r in d.get("relations", [])],
        )


if __name__ == "__main__":
    ir = IR(
        volumes=[Volume("hall", [[0, 0], [12, 0], [12, 8], [0, 8]],
                        height=9.0, height_src="utterance", confidence=0.8)],
        anchors=[Anchor("hall", "width", 12.0, 1.2, "utterance:t=142.3")],
        views=[View("sk_03", {}, 0.06)],
        unresolved=["deck 높이", "lobby 개구부 위치"],
        notes=[Note("hall", "example")],
    )
    errs = ir.validate()
    print("root fields:", ir.root_field_count(), ROOT_FIELDS)
    print("errors:", errs)
    print(ir.to_json(indent=2))
