"""unmappable 집계 원장 — IR 필드 승격 규칙의 라벨러 (§13).

§13 승격 규칙: unmappable 집계에서 3회 이상 반복 → 필드 승격, 1~2회 → note,
루트 필드 12 초과 → 멈춤. 그러나 '집계' 자체가 없으면 승격은 영원히 0건이다
(라벨러 미작동). 이 원장이 그 집계를 담당한다.

각 IR의 unresolved/notes 를 정규화 키로 환산해 지속 카운트(ir/unmappable_ledger.json).
report()가 승격 후보(≥3)·note급(1~2)·필드수 점검을 낸다.
"""
from __future__ import annotations
import json, re
from pathlib import Path
from collections import Counter

LEDGER = Path(__file__).resolve().parent / "unmappable_ledger.json"
PROMOTE_MIN = 3          # §13: 3회 이상 → 승격
MAX_ROOT = 12            # §13: 초과 시 멈춤
CURRENT_ROOT = 7         # volumes/anchors/views/unresolved/notes/relations/openings

# 이미 필드로 실현된 카테고리 — 미매핑 집계엔 잡히나 '신규 필드'로 세면 안 됨.
# 관계 유형·개구부 유형은 relations/openings 필드의 값이지 새 루트 키가 아님.
try:
    from ir.schema import RELATION_TYPES as _RT, OPENING_TYPES as _OT
    REALIZED_KEYS = set(_RT) | {"opening"} | {"opening:" + t for t in _OT} | set(_OT)
except Exception:
    REALIZED_KEYS = {"adjacent", "above_below", "penetrate", "separated", "aligned", "opening"}


def _is_realized(k):
    # rel_* → relations 필드, opening_* → openings 필드 (둘 다 실현됨). 값이지 새 키 아님.
    return k in REALIZED_KEYS or k.startswith("opening_") or k.startswith("rel_")


def normalize_key(text: str) -> str:
    """unresolved/note 문자열 → 정규화 키(prop 유형). 'id: prop'→prop, 경계문구→태그."""
    t = text.strip()
    if ":" in t:
        t = t.split(":", 1)[1].strip()
    if "폴리곤 미형성" in t or "polygon" in t.lower():
        return "polygon_unformed"
    if "관계" in t or "relate" in t.lower():
        return "relation"
    # 마지막 명사 토큰(공백 분리) 소문자 슬러그
    tok = re.split(r"\s+", t)[-1] if t else "unknown"
    return re.sub(r"[^\w가-힣]", "", tok).lower() or "unknown"


class Ledger:
    def __init__(self, path: Path = LEDGER):
        self.path = path
        self.counts = Counter()
        if path.exists():
            self.counts = Counter(json.loads(path.read_text(encoding="utf-8")).get("counts", {}))

    def record(self, key: str, k: int = 1):
        self.counts[normalize_key(key)] += k

    def ingest_ir(self, ir) -> int:
        """IR의 unresolved(문자열)·notes(관계/예외) 집계. 반환=이번에 기록한 건수."""
        n = 0
        for u in getattr(ir, "unresolved", []):
            self.record(u); n += 1
        for note in getattr(ir, "notes", []):
            txt = getattr(note, "text", str(note))
            self.record(txt); n += 1
        return n

    def save(self):
        self.path.write_text(json.dumps({"counts": dict(self.counts)}, ensure_ascii=False, indent=2),
                             encoding="utf-8")

    def report(self) -> dict:
        def realized(k):
            return _is_realized(k)
        # 승격 후보 = ≥3 반복 중 아직 필드로 실현 안 된 것만(신규 루트 키 후보)
        pending = {k: c for k, c in self.counts.items() if c >= PROMOTE_MIN and not realized(k)}
        realized_hits = {k: c for k, c in self.counts.items() if c >= PROMOTE_MIN and realized(k)}
        note_lv = {k: c for k, c in self.counts.items() if 1 <= c < PROMOTE_MIN}
        projected = CURRENT_ROOT + len(pending)
        return {
            "total_keys": len(self.counts),
            "total_occurrences": int(sum(self.counts.values())),
            "promotion_candidates(>=3, pending)": pending,   # → 신규 필드 승격 대상(§13)
            "realized_categories(>=3, already field)": realized_hits,  # relations 등 이미 실현
            "note_level(1-2)": note_lv,
            "current_root_fields": CURRENT_ROOT,
            "projected_root_fields": projected,
            "root_field_cap": MAX_ROOT,
            "STOP_if_exceeds": projected > MAX_ROOT,
            "labeler_active": True,
            "note": "rel:* 는 relations 필드의 type 값(이미 실현) → 신규 필드로 안 셈. "
                    "pending만 새 루트 키 후보.",
        }


def main(argv):
    led = Ledger()
    if len(argv) > 1 and argv[1] == "--reset":
        led.counts = Counter(); led.save(); print("ledger reset"); return
    print(json.dumps(led.report(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import sys
    main(sys.argv)
