"""0단계 항목 3 — 유튜브 자막 수집 → 발화 유형 분포 (§6.3).

영상을 받지 않는다(§6.3). 자막만 수집한다.
검색 API 키가 없으므로 검색결과 HTML에서 videoId만 추출(ytInitialData) →
자막 API로 전사문 수집 → 발화유형 분류 → 분포/정정표현/예시20/정렬윈도우.

주의: 발화유형 분류 '기준'은 위임 불가(§9). 아래는 1차 분류기이며 checkpoints에서
사용자 확인 대상. 한국어 비중을 높인다(§6.3, §3.7 확인용).

출력: stage0/out/youtube_dist.json  (+ data/youtube/*.json 원자막 캐시)
"""
from __future__ import annotations
import json, re, sys, time
from pathlib import Path
from collections import Counter

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stage0" / "out"
YT = ROOT / "data" / "youtube"
YT.mkdir(parents=True, exist_ok=True)

SEEDS = [   # §12 시드 (한국어 비중 ↑)
    "건축 설계 스케치 과정 설명", "건축 설계 크리틱 녹화", "건축 에스키스 스케치 과정",
    "architecture design process sketch explained",
    "architectural concept sketch walkthrough narrated",
    "建築 エスキス スケッチ 過程",
]
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "ko,en;q=0.9"}
MAX_VIDS_PER_SEED = 12
MAX_TOTAL_FETCH = 40

# --- 1차 발화유형 분류기 (§9 위임불가 → 사용자 확인 대상) --------------------
PATTERNS = {
    "dimension": [r"\d+\s*(m|mm|cm|미터|미리|밀리|층|평|자|척|메타|meter|metre|feet|ft|층고)",
                  r"(몇|얼마)\s*(미터|층|평|미리)", r"\bby\b.*\d", r"\d+\s*(층|floor|storey|story)"],
    "correction": [r"아니(라|고|야|다|)\b", r"말고", r"다시\b", r"정정", r"취소", r"가\s*아니라",
                   r"\bactually\b", r"\bwait\b", r"\bno,?\s", r"\bsorry\b", r"\bi mean\b", r"\brather\b"],
    "relation": [r"위|아래|옆|사이|붙[여이]|연결|평행|직각|수직|수평|맞[춰추]|기준으로|가운데|중심",
                 r"\b(above|below|next to|between|parallel|perpendicular|align|connect|adjacent|beside)\b"],
    "deixis": [r"여기|이쪽|저기|요기|이거|그거|저거\b", r"\b(here|there|this part|that part|this one)\b"],
    "naming": [r"홀|로비|코어|계단|현관|입구|마당|복도|실\b|방\b|테라스|덱|매스|볼륨",
               r"\b(lobby|hall|core|stair|entrance|corridor|room|terrace|deck|mass|volume|atrium)\b"],
    "intent": [r"답답|느낌|싶|했으면|열린|닫힌|편안|개념|컨셉|의도",
               r"\b(feel|want|should|idea|concept|comfortable|open|closed|spacious)\b"],
}
ORDER = ["correction", "dimension", "relation", "deixis", "naming", "intent"]


def classify(text: str) -> tuple[str, list[str]]:
    labels = [t for t in PATTERNS if any(re.search(p, text, re.I) for p in PATTERNS[t])]
    primary = next((t for t in ORDER if t in labels), "other")
    return primary, labels


# --- videoId 추출 (검색결과 HTML) -------------------------------------------
def search_ids(query: str, n: int) -> list[str]:
    url = "https://www.youtube.com/results?search_query=" + requests.utils.quote(query)
    try:
        html = requests.get(url, headers=UA, timeout=20).text
    except Exception as e:
        print(f"  ! search fail {query!r}: {e}", file=sys.stderr)
        return []
    ids = re.findall(r'"videoId":"([\w-]{11})"', html)
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i); out.append(i)
        if len(out) >= n:
            break
    return out


def get_transcript(vid: str):
    cache = YT / f"{vid}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    for langs in (["ko"], ["en"], ["ja"], None):
        try:
            tr = api.fetch(vid, languages=langs) if langs else api.fetch(vid)
            data = [{"text": s.text, "start": s.start, "dur": s.duration} for s in tr]
            lang = langs[0] if langs else "auto"
            payload = {"vid": vid, "lang": lang, "segments": data}
            cache.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            return payload
        except Exception:
            continue
    return None


def main():
    # 수집
    vids, transcripts = [], []
    for q in SEEDS:
        for v in search_ids(q, MAX_VIDS_PER_SEED):
            if v not in vids:
                vids.append(v)
    print(f"videoId 후보: {len(vids)}")
    fetched = 0
    for v in vids:
        if fetched >= MAX_TOTAL_FETCH:
            break
        t = get_transcript(v)
        if t and t["segments"]:
            transcripts.append(t); fetched += 1
            print(f"  {v} [{t['lang']}] {len(t['segments'])} seg")
        time.sleep(0.2)

    if not transcripts:
        result = {"spec": "§6.3", "status": "PENDING",
                  "reason": "자막 확보 0건 (검색차단/자막없음). CP-0.3: 영상 ID목록 또는 API키 필요.",
                  "classifier": {"order": ORDER, "note": "§9 위임불가 — 사용자 확인 대상"}}
        (OUT / "youtube_dist.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print("PENDING: 자막 0건 →", OUT / "youtube_dist.json")
        return

    # 분류 + 통계
    type_cnt, lang_cnt = Counter(), Counter()
    corrections, examples, lags = [], [], []
    total = 0
    for t in transcripts:
        lang_cnt[t["lang"]] += 1
        segs = t["segments"]
        for k, s in enumerate(segs):
            txt = s["text"].replace("\n", " ").strip()
            if not txt:
                continue
            total += 1
            prim, labs = classify(txt)
            type_cnt[prim] += 1
            if k > 0:
                lags.append(round(s["start"] - segs[k - 1]["start"], 2))
            if prim == "correction" and len(corrections) < 40:
                corrections.append({"vid": t["vid"], "t": s["start"], "text": txt[:80]})
            if prim == "dimension" and len(examples) < 20:
                examples.append({"vid": t["vid"], "lang": t["lang"], "t": s["start"], "text": txt[:80]})

    dist = {k: round(type_cnt[k] / total, 4) for k in list(PATTERNS) + ["other"]}
    lags_sorted = sorted(lags)
    p50 = lags_sorted[len(lags_sorted) // 2] if lags_sorted else None
    p90 = lags_sorted[int(len(lags_sorted) * 0.9)] if lags_sorted else None

    result = {
        "spec": "§6.3 유튜브 자막 발화유형 분포",
        "status": "OK",
        "n_videos": len(transcripts), "n_segments": total,
        "lang_counts": dict(lang_cnt),
        "type_distribution": dist,
        "alignment_window_note": "§3.6 기본 ±3초. 자막 세그먼트 간격 p50/p90(초):",
        "segment_gap_p50": p50, "segment_gap_p90": p90,
        "correction_expressions": corrections[:20],
        "translation_examples_20": examples,
        "classifier": {"order": ORDER, "patterns_keys": list(PATTERNS),
                       "caveat": "§9 위임불가: 분류 기준은 사용자 확인 대상(CP-0.3). §3.7 코퍼스 확인용."},
    }
    (OUT / "youtube_dist.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\ntype dist:", dist)
    print("langs:", dict(lang_cnt), " segments:", total)
    print("-> stage0/out/youtube_dist.json")


if __name__ == "__main__":
    main()
