"""P3 파리티 참조 — L자·凹자·계단형 볼륨쌍의 관계를 Python(shapely) infer_geometric로.
TS(bbox 근사 → 폴리곤 기반) 출력과 대조해 불일치율 측정. 지시서 Track 1.

bbox가 발산하는 핵심 케이스: 오목 노치가 마주보아 폴리곤은 분리인데 bbox는 겹침.
"""
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Volume
from stage5.relate import infer_geometric


def L(w=100, h=100, a=0.5, b=0.5):
    return [[0, 0], [w, 0], [w, h * b], [w * a, h * b], [w * a, h], [0, h]]


def U(w=120, h=100, a=0.3, b=0.5):   # 凹
    return [[0, 0], [w, 0], [w, h], [w * (1 - a), h], [w * (1 - a), h * b],
            [w * a, h * b], [w * a, h], [0, h]]


def stair(w=120, h=90, n=3):
    pts = [[0, 0], [w, 0]]
    sx, sy = w, 0
    for i in range(n):
        sy += h / n; pts.append([sx, sy])
        sx -= w / n; pts.append([sx, sy])
    pts.append([0, h])
    return pts


def shift(fp, dx, dy):
    return [[x + dx, y + dy] for x, y in fp]


def rot180(fp):
    a = np.array(fp, float); c = a.mean(0)
    return [[2 * c[0] - x, 2 * c[1] - y] for x, y in a.tolist()]


def build_configs():
    cfgs = []
    # 1) 두 L을 노치가 마주보게 배치 — 폴리곤 분리, bbox 겹침 유발
    cfgs.append(("L_notch_facing_separated",
                 L(100, 100, 0.5, 0.5), shift(rot180(L(100, 100, 0.5, 0.5)), 60, 60)))
    # 2) 두 L 확실히 분리
    cfgs.append(("L_far_separated", L(100, 100), shift(L(100, 100), 400, 0)))
    # 3) 凹 안에 작은 사각 — 폴리곤 인접/분리, bbox 포함
    cfgs.append(("U_with_inside_rect", U(140, 120, 0.3, 0.5),
                 [[50, 10], [90, 10], [90, 45], [50, 45]]))
    # 4) 계단형 두 개 맞물림
    cfgs.append(("stair_interlock", stair(120, 90, 3), shift(rot180(stair(120, 90, 3)), 40, 40)))
    # 5) L 인접(변 접촉)
    cfgs.append(("L_edge_adjacent", L(100, 100), shift(L(100, 100), 101, 0)))
    # 6) 사각 겹침(penetrate)
    cfgs.append(("rect_overlap", [[0, 0], [100, 0], [100, 100], [0, 100]],
                 [[50, 50], [150, 50], [150, 150], [50, 150]]))
    # 7) 凹 두 개 등 맞댐 분리
    cfgs.append(("U_back_to_back", U(120, 100), shift(rot180(U(120, 100)), 0, 130)))
    # 8) L 대각 배치(bbox 겹치나 폴리곤 멀다)
    cfgs.append(("L_diagonal", L(120, 120, 0.4, 0.4), shift(L(120, 120, 0.4, 0.4), 80, 80)))
    return cfgs


def main():
    cases = []
    for name, fpa, fpb in build_configs():
        ir = IR(volumes=[Volume("v1", fpa, confidence=0.9), Volume("v2", fpb, confidence=0.9)])
        rels = infer_geometric(ir)
        types = sorted({r.type for r in rels})
        cases.append({"name": name, "fpa": fpa, "fpb": fpb, "expect_types": types})
    out = Path(__file__).resolve().parent / "reference_relate.json"
    out.write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")
    print("->", out, f"({len(cases)} configs)")
    for c in cases:
        print(f"  {c['name']:28s} shapely → {c['expect_types']}")


if __name__ == "__main__":
    main()
