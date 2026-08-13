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


def wilson(k, n, z=1.96):
    """이항 비율 Wilson 95% 신뢰구간 — 얇은 표본 대비."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return (round(max(0, c - h), 4), round(min(1, c + h), 4))


def main():
    files = sorted(YT.glob("*.json"))
    per_all, per_20 = [], []
    for fp in files:
        d = json.loads(fp.read_text(encoding="utf-8"))
        n, tot = dim_rate(d.get("segments", []))
        row = {"vid": d.get("vid", fp.stem), "lang": d.get("lang"), "n_dim": n, "n_seg": tot,
               "rate": round(n / tot, 4) if tot else 0.0}
        if tot > 0:
            per_all.append(row)
            if tot >= 20:
                per_20.append(row)

    def block(per, label):
        td = sum(p["n_dim"] for p in per); ts = sum(p["n_seg"] for p in per)
        with_any = sum(1 for p in per if p["n_dim"] > 0)
        return {"label": label, "n_videos": len(per),
                "total_dim_seg": td, "total_seg": ts,
                "overall_rate": round(td / max(1, ts), 4),
                "overall_rate_wilson95": wilson(td, ts),
                "videos_with_any_dim": with_any,
                "videos_with_any_dim_frac": round(with_any / max(1, len(per)), 3),
                "videos_with_any_wilson95": wilson(with_any, len(per)),
                "per_video_rate_median": round(float(np.median([p["rate"] for p in per])), 4),
                "per_video_rate_max": round(max(p["rate"] for p in per), 4)}

    full = block(per_all, "설계/스케치 자막 전체(22중 세그>0)")
    sub = block(per_20, "≥20세그 부분집합(구 2J)")
    result = {
        "spec": "2J 재측정 — 설계/스케치 자막 치수 발화율 + Wilson CI + 20건-캡 규명",
        "corpus_clarification": (
            "현 22자막은 **전부 설계/스케치 설명·크리틱** 유형(작도 교육 영상 아님). "
            "구 2J의 '12편'은 22의 ≥20세그 부분집합이지 별개 코퍼스가 아님. "
            "**작도 교육(2A) 영상은 미수집(2G 대기)** → 설계 vs 작도 분리 측정은 2G 후에만 가능."),
        "reconcile_20_examples": (
            "앞선 '치수 예시 20건'은 수집기 하드캡(translation_examples_20, max=20)이지 높은 비율 근거가 아님. "
            f"실제 치수 세그 총수 ≈{full['total_dim_seg']} (0.73%×3424) → 20건 캡과 정합. **모순 아님.**"),
        "design_corpus": full,
        "ge20_subset": sub,
        "finding": (
            f"설계 자막 치수 발화율 {full['overall_rate']*100:.2f}% (Wilson95 "
            f"{full['overall_rate_wilson95'][0]*100:.2f}~{full['overall_rate_wilson95'][1]*100:.2f}%), "
            f"영상 {full['videos_with_any_dim']}/{full['n_videos']}만 치수 있음(frac95 "
            f"{full['videos_with_any_wilson95'][0]:.2f}~{full['videos_with_any_wilson95'][1]:.2f}). "
            "→ **설계 세션에서도 치수 발화 드묾**. §3.3 '앵커 핵심 경로'는 명시적 치수화 세션 한정. "
            "표본 얇아(4/12) CI 넓음 — 작도 영상(2G) 확보 후 분리 대조 필요. "
            "**결론 무관하게 V-4 수동 치수 입력 유지**(발화 의존 완화)."),
    }
    (ROOT / "stage0" / "out" / "dimension_rate.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("corpus_clarification", "reconcile_20_examples",
                                             "design_corpus", "ge20_subset", "finding")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
