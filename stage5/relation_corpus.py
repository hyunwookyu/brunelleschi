"""관계 발화 코퍼스 분석 — 유튜브 자막으로 unmappable 원장 채우기 (5단계 전제).

22개 자막(실제 건축가 발화)에서 관계 발화를 추출·유형 분류해 원장에 넣는다. 실세션은
아니나 데모보다 낫다. 관계 어휘가 몇 종으로 나오는지 보고:
  4종(인접·상하·관입·이격) 안이면 예정대로, 넘으면 스키마를 그에 맞춘다(사용자 지시).

정렬(평행·직각·맞춤)은 위 4종 밖 → 나오면 5번째로 보고.
출력: stage0/out/relation_corpus.json + 원장(ir/unmappable_ledger.json) 관계 항목.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.unmappable import Ledger

YT = ROOT / "data" / "youtube"

# 관계 유형 분류기 (한국어+영어). 사용자 4종 + 정렬(밖).
REL_TYPES = {
    "adjacent(인접)": [r"옆[에]?", r"붙[여이인]", r"접(해|하|한)", r"맞닿", r"나란",
                       r"\b(next to|beside|adjacent|abut|touch(ing)?|attach)\b"],
    "above_below(상하)": [r"위[에층]?\b", r"아래[층]?", r"밑[에]?", r"얹", r"올려[놓]?",
                          r"\b(above|below|under(neath)?|on top|over|stack)\b"],
    "penetrate(관입)": [r"관통", r"뚫", r"파고", r"박[히힌혀]", r"꽂", r"안으로", r"속으?로",
                        r"\b(through|penetrat|pierce|insert(ed)? into|into the)\b"],
    "separated(이격)": [r"사이[에]?", r"떨어[뜨져진]", r"간격", r"이격", r"벌[려어린]", r"띄[워어운]",
                        r"\b(apart|spaced|gap between|separate)\b"],
    "aligned(정렬·밖)": [r"맞[춰추춘]", r"정렬", r"평행", r"직각", r"수직으로", r"수평으로", r"기준선",
                        r"\b(align|parallel|perpendicular|flush|line up)\b"],
}
CANON4 = ("adjacent(인접)", "above_below(상하)", "penetrate(관입)", "separated(이격)")


def classify_relation(text: str) -> list[str]:
    return [t for t, pats in REL_TYPES.items() if any(re.search(p, text, re.I) for p in pats)]


def main():
    led = Ledger()
    # 원장에서 기존 relation 계열 제거 후 재집계(코퍼스 기반으로 갱신)
    for k in list(led.counts):
        if k.startswith("rel_"):
            del led.counts[k]

    files = sorted(YT.glob("*.json"))
    type_cnt = Counter()
    examples = {t: [] for t in REL_TYPES}
    n_seg = n_rel = 0
    for fp in files:
        d = json.loads(fp.read_text(encoding="utf-8"))
        for s in d.get("segments", []):
            txt = s.get("text", "").replace("\n", " ").strip()
            if not txt:
                continue
            n_seg += 1
            types = classify_relation(txt)
            if types:
                n_rel += 1
                for t in types:
                    type_cnt[t] += 1
                    led.record("rel_" + t.split("(")[0])   # 원장 키: rel:adjacent 등
                    if len(examples[t]) < 5:
                        examples[t].append(txt[:70])
    led.save()

    distinct = [t for t in REL_TYPES if type_cnt[t] > 0]
    beyond4 = [t for t in distinct if t not in CANON4]
    result = {
        "spec": "관계 발화 코퍼스(유튜브 22자막) → 원장. 관계 어휘 종수 판정(§13 스키마).",
        "n_transcripts": len(files), "n_segments": n_seg, "n_relation_segments": n_rel,
        "type_counts": dict(type_cnt.most_common()),
        "distinct_relation_types": len(distinct),
        "within_planned_4types": len(beyond4) == 0,
        "beyond_4_types": beyond4,
        "examples": {t: examples[t] for t in distinct},
        "verdict": ("4종(인접·상하·관입·이격) 이내 → 예정대로 relations 스키마"
                    if not beyond4 else
                    f"4종 초과({beyond4}) → 스키마를 그에 맞춘다: relations.type 도메인 확장"),
        "ledger_report": led.report(),
    }
    (ROOT / "stage0" / "out" / "relation_corpus.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in
                      ("n_relation_segments", "type_counts", "distinct_relation_types",
                       "within_planned_4types", "beyond_4_types", "verdict")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
