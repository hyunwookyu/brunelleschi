"""개구부 발화 코퍼스 — opening 승격 판단을 자막으로 (사용자 지시 2026-08-12).

관계 어휘와 같은 방법으로 22자막에서 개구부 발화를 추출. 빈도 + 하위유형(창/문/개방부)
보고. 유형이 갈리면 스키마를 그에 맞춘다(루트 7필드 허용).

원장의 opening 계열 키를 실자막 기반으로 갱신(데모 집계 대체).
출력: stage0/out/opening_corpus.json
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.unmappable import Ledger

YT = ROOT / "data" / "youtube"

# 개구부 하위유형 분류기 (한국어+영어)
OPENING_TYPES = {
    "window(창)": [r"창문", r"창(을|이|가|에|\b)", r"\bwindow"],
    # 문: 한국어 오탐(질문·문제·전문·부문·방문·주문·소문·항문…) 축소 — 건축 문맥으로 제한
    "door(문)": [r"출입문", r"현관문", r"정문", r"대문", r"문짝", r"문틀", r"도어",
                 r"(?<![질주방부전소항주논성세])문(을|이|가|은|도|\s|$)", r"\bdoor\b", r"\bentrance\b"],
    "opening(개구부/개방부)": [r"개구부", r"개방부", r"오프닝", r"뚫(린|어|고)", r"열린\s*(부분|면|공간)?",
                              r"\bopening\b", r"\baperture\b", r"\bpunch(ed)?\b"],
}


def classify_opening(text: str) -> list[str]:
    return [t for t, pats in OPENING_TYPES.items() if any(re.search(p, text, re.I) for p in pats)]


def main():
    led = Ledger()
    for k in list(led.counts):                     # 기존 opening 계열 초기화 후 실자막 기반 재적재
        if k == "opening" or k.startswith("opening_"):
            del led.counts[k]

    files = sorted(YT.glob("*.json"))
    type_cnt = Counter()
    examples = {t: [] for t in OPENING_TYPES}
    n_open = 0
    for fp in files:
        d = json.loads(fp.read_text(encoding="utf-8"))
        for s in d.get("segments", []):
            txt = s.get("text", "").replace("\n", " ").strip()
            if not txt:
                continue
            types = classify_opening(txt)
            if types:
                n_open += 1
                for t in types:
                    type_cnt[t] += 1
                    led.record("opening_" + t.split("(")[0])
                    if len(examples[t]) < 5:
                        examples[t].append(txt[:70])
    led.save()

    distinct = [t for t in OPENING_TYPES if type_cnt[t] > 0]
    total = sum(type_cnt.values())
    # 스키마 판단: 하위유형이 2종 이상 유의미(각 ≥3, §13 승격 임계)면 typed 필요
    meaningful = [t for t in distinct if type_cnt[t] >= 3]
    diverges = len(meaningful) >= 2
    result = {
        "spec": "개구부 발화 코퍼스(유튜브 22자막) → opening 승격·하위유형 판단(§13)",
        "n_opening_segments": n_open, "total_type_hits": total,
        "type_counts": dict(type_cnt.most_common()),
        "distinct_subtypes": len(distinct),
        "meaningful_subtypes(>=3)": meaningful,
        "subtypes_diverge": diverges,
        "examples": {t: examples[t] for t in distinct},
        "schema_decision": (
            "하위유형 2종 이상 유의 → openings를 typed로. 승격 시 루트 7필드 허용. "
            "권고: Volume에 openings:list[{type,pos?}] 중첩 필드(루트 불변) 또는 루트 openings 필드(→7)."
            if diverges else
            "단일/희소 유형 → 지금은 unresolved 유지, 승격 보류. 실세션에서 재판정."),
        "ledger": led.report(),
    }
    (ROOT / "stage0" / "out" / "opening_corpus.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in
                      ("n_opening_segments", "type_counts", "meaningful_subtypes(>=3)",
                       "subtypes_diverge", "schema_decision")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
