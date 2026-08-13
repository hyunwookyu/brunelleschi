"""2J — 치수 발화율 분리 측정 (지시서 트랙2 2J).

§3.3에서 스케일 앵커가 핵심 경로인데 코퍼스 실측 0.73%. 코퍼스 성격 차이인지 확인.
현 22자막(설계/스케치 혼합)의 치수 발화율을 영상별로 분리 측정 → 분포.
작도 교육 영상 분리는 2G 실영상 수집 후(현재 코퍼스에 미분류).
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
YT = ROOT / "data" / "youtube"

DIM = [r"\d+\s*(m|mm|cm|미터|미리|밀리|층|평|자|척|메타|meter|metre|feet|ft|층고)",
       r"(몇|얼마)\s*(미터|층|평|미리)", r"\d+\s*(층|floor|storey|story)"]


def dim_rate(segments):
    n = tot = 0
    for s in segments:
        t = s.get("text", "")
        if not t.strip():
            continue
        tot += 1
        if any(re.search(p, t, re.I) for p in DIM):
            n += 1
    return n, tot


def main():
    files = sorted(YT.glob("*.json"))
    per = []
    for fp in files:
        d = json.loads(fp.read_text(encoding="utf-8"))
        n, tot = dim_rate(d.get("segments", []))
        if tot >= 20:
            per.append({"vid": d.get("vid", fp.stem), "lang": d.get("lang"), "n_dim": n, "n_seg": tot,
                        "rate": round(n / tot, 4)})
    rates = [p["rate"] for p in per]
    total_dim = sum(p["n_dim"] for p in per); total_seg = sum(p["n_seg"] for p in per)
    hi = sorted(per, key=lambda x: -x["rate"])[:3]
    result = {
        "spec": "2J 치수 발화율 — 현 코퍼스(설계/스케치 혼합, 22자막) 영상별 분포",
        "n_videos": len(per),
        "overall_rate": round(total_dim / max(1, total_seg), 4),
        "per_video_rate_median": round(float(np.median(rates)), 4),
        "per_video_rate_p90": round(float(np.percentile(rates, 90)), 4),
        "per_video_rate_max": round(max(rates), 4),
        "n_videos_with_any_dim": sum(1 for p in per if p["n_dim"] > 0),
        "top3_dim_videos": [{k: h[k] for k in ("vid", "rate", "n_dim", "n_seg")} for h in hi],
        "finding": ("치수 발화 극히 드묾(중앙 %.2f%%). 소수 영상에 집중(상위 영상 %.1f%%). "
                    "→ §3.3 '앵커가 핵심 경로'는 **명시적 치수화 세션에 한정** 유효. 설명·크리틱 나열형은 "
                    "치수 거의 없음 → 그런 세션은 무차원 유지·비례전파(§3.5)가 주. "
                    "작도 교육 영상 분리 측정은 2G 후.")
                    % (float(np.median(rates)) * 100, max(rates) * 100),
    }
    (ROOT / "stage0" / "out" / "dimension_rate.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("n_videos", "overall_rate", "per_video_rate_median",
                                             "per_video_rate_max", "n_videos_with_any_dim", "finding")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
