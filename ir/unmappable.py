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
CURRENT_ROOT = 5         # volumes/anchors/views/unresolved/notes


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
        promote = {k: c for k, c in self.counts.items() if c >= PROMOTE_MIN}
        note_lv = {k: c for k, c in self.counts.items() if 1 <= c < PROMOTE_MIN}
        projected = CURRENT_ROOT + len(promote)
        return {
            "total_keys": len(self.counts),
            "total_occurrences": int(sum(self.counts.values())),
            "promotion_candidates(>=3)": promote,       # → 필드 승격 대상(§13)
            "note_level(1-2)": note_lv,                 # → note 처리, 목록 보존
            "projected_root_fields": projected,
            "root_field_cap": MAX_ROOT,
            "STOP_if_exceeds": projected > MAX_ROOT,
            "labeler_active": True,
            "note": "승격 0건이 정상인지(정말 반복 미매핑 없음) vs 라벨러 미작동인지 구분됨. "
                    "이 원장이 집계 중이므로 이제 전자.",
        }


def main(argv):
    led = Ledger()
    if len(argv) > 1 and argv[1] == "--reset":
        led.counts = Counter(); led.save(); print("ledger reset"); return
    print(json.dumps(led.report(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import sys
    main(sys.argv)
