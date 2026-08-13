"""테스트 픽스처 — 합성 프리핸드 평면 스케치(캡처 JSON, §4.1).

실제 Apple Pencil 입력 대신 파이프라인 시연·오버레이 산출용. 등급별 노이즈로
직교 평면(rect/L)을 매스 채널 한 획으로 그린 것처럼 생성.
"""
from __future__ import annotations
import json, sys, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def make(kind="L", grade="precise", seed=2, scale=1.0):
    r = np.random.default_rng(seed)
    W, H = 380 * scale, 300 * scale
    ox, oy = 120, 120
    if kind == "rect":
        v = [(0, 0), (W, 0), (W, H), (0, H)]
    else:  # L
        a, b = 0.55, 0.45
        v = [(0, 0), (W, 0), (W, H * b), (W * a, H * b), (W * a, H), (0, H)]
    poly = np.array(v, float) + (ox, oy)

    # 기준선 재수립(지시 6): 구 jitter_ratio 모델 폐기 → 실획 기반 4성분 모델.
    from common.inknoise import render_for_grade
    stroke = render_for_grade(poly, grade, r)[0]
    pts = []
    t = 0.0
    for q in stroke:
        t += r.uniform(6, 14)
        pts.append([round(float(q[0]), 2), round(float(q[1]), 2), round(t, 1),
                    round(float(r.uniform(0.4, 0.8)), 2)])
    cap = {"frame": "fixture", "w": 640, "h": 520,
           "strokes": [{"points": pts, "pen": "mass", "frame": "fixture"}],
           "_truth_poly": poly.tolist(), "_grade": grade, "_kind": kind}
    return cap


def main(argv):
    kind = argv[1] if len(argv) > 1 else "L"
    grade = argv[2] if len(argv) > 2 else "precise"
    cap = make(kind, grade)
    out = ROOT / "stage1" / f"fixture_{kind}_{grade}.json"
    out.write_text(json.dumps(cap, ensure_ascii=False), encoding="utf-8")
    print("->", out.relative_to(ROOT), "| pts:", len(cap["strokes"][0]["points"]))


if __name__ == "__main__":
    main(sys.argv)
