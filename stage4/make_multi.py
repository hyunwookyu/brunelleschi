"""다중 볼륨 테스트 픽스처 — 분리된 직교 폴리곤 N개 + 명명 발화 (§7 4단계)."""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def _noisy_poly(poly, gp, rng):
    """기준선 재수립(지시 6): 구 jitter_ratio 모델 폐기 → 실획 기반 4성분 모델.
    gp는 등급명 문자열을 받는다(구 시그니처의 dict는 더 이상 쓰지 않는다)."""
    from common.inknoise import render_for_grade
    grade = gp if isinstance(gp, str) else "precise"
    stroke = render_for_grade(np.asarray(poly, float), grade, rng)[0]
    pts, t = [], 0.0
    for q in stroke:
        t += rng.uniform(6, 14)
        pts.append([round(float(q[0]), 2), round(float(q[1]), 2), round(t, 1), 0.6])
    return pts


def make(seed=0, grade="precise"):
    gp = grade      # 등급명 문자열(실획 기반 모델)
    rng = np.random.default_rng(seed)
    # 3개 볼륨: 분리된 위치 + 라벨
    specs = [   # 분명한 간격(>100)으로 분리 배치
        {"origin": (50, 50), "wh": (200, 150), "kind": "rect", "label_ko": "홀"},
        {"origin": (430, 50), "wh": (150, 150), "kind": "rect", "label_ko": "로비"},
        {"origin": (60, 350), "wh": (240, 130), "kind": "L", "label_ko": "계단"},
    ]
    strokes, utterances, stroke_ctx = [], [], {}
    for i, sp in enumerate(specs):
        ox, oy = sp["origin"]; W, H = sp["wh"]
        if sp["kind"] == "rect":
            v = [(0, 0), (W, 0), (W, H), (0, H)]
        else:
            a, b = 0.55, 0.45
            v = [(0, 0), (W, 0), (W, H * b), (W * a, H * b), (W * a, H), (0, H)]
        poly = np.array(v, float) + (ox, oy)
        pts = _noisy_poly(poly, gp, rng)
        strokes.append({"points": pts, "pen": "mass", "frame": "multi"})
        # 명명 발화 + 그 시점 획 위치(deixis) = 볼륨 중심 근처
        cen = poly.mean(0)
        t = float(i)
        utterances.append({"text": f"이건 {sp['label_ko']}", "start": t, "dur": 1.0})
        stroke_ctx[t] = [[float(cen[0]), float(cen[1])]]
    return {"frame": "multi", "w": 640, "h": 520, "strokes": strokes,
            "_naming_utterances": utterances, "_stroke_ctx": stroke_ctx,
            "_n_volumes": len(specs)}


def main(argv):
    seed = int(argv[1]) if len(argv) > 1 else 0
    cap = make(seed)
    out = ROOT / "stage4" / f"fixture_multi_{seed}.json"
    out.write_text(json.dumps(cap, ensure_ascii=False), encoding="utf-8")
    print("->", out.relative_to(ROOT), "| strokes:", len(cap["strokes"]))


if __name__ == "__main__":
    main(sys.argv)
