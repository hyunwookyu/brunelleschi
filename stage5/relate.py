"""5단계 관계 추론 — 볼륨 간 관계를 IR.relations로 (§7 5단계, §3.2 relations).

관계 유형 5종(RELATION_TYPES): adjacent, above_below, penetrate, separated, aligned
(유튜브 코퍼스 실측으로 4→5 확장, stage5/relation_corpus). 두 소스:
  - 기하: 폴리곤 footprint에서 adjacent/separated/aligned/penetrate(XY). above_below는
    Z(base/height)가 필요 → 현재 무차원이라 발화로만.
  - 발화: stage2 relate op → 5종 정준 매핑(GRAMMAR_TO_CANON).

**부분 획 대비(§task1 발견)**: 미완성 볼륨에 관계를 걸면 '그리는 도중 인접 판정'이
흔들린다(단조성 위반 ~18%). 따라서 confidence 임계 이상(확정) 볼륨에만 관계를 건다.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Relation, GRAMMAR_TO_CANON, RELATION_TYPES

MIN_CONFIDENCE = 0.5     # 이 미만 볼륨엔 관계 안 검(부분 획 방어)


def _edges(poly):
    p = np.asarray(poly, float)
    return [(p[i], p[(i + 1) % len(p)]) for i in range(len(p))]


def _scene_scale(ir) -> float:
    allp = np.concatenate([np.asarray(v.footprint, float) for v in ir.volumes])
    return float(np.hypot(*(allp.max(0) - allp.min(0)))) or 1.0


def _aligned(Pi, Pj, scale, ang_tol=5.0, off_tol=0.03) -> bool:
    """두 폴리곤에 평행+공선(무한직선 근접) 변쌍이 있으면 정렬."""
    for a0, a1 in _edges(Pi):
        va = a1 - a0; na = np.hypot(*va)
        if na < 1e-6:
            continue
        for b0, b1 in _edges(Pj):
            vb = b1 - b0; nb = np.hypot(*vb)
            if nb < 1e-6:
                continue
            d = abs(np.degrees(np.arctan2(va[1], va[0]) - np.arctan2(vb[1], vb[0]))) % 180
            if min(d, 180 - d) > ang_tol:
                continue
            # a-변 무한직선까지 b0의 수직거리
            n = np.array([-va[1], va[0]]) / na
            off = abs(np.dot(b0 - a0, n))
            if off / scale <= off_tol:
                return True
    return False


def infer_geometric(ir: IR, adj_ratio=0.06, sep_ratio=0.25) -> list[Relation]:
    from shapely.geometry import Polygon
    vols = [v for v in ir.volumes if v.confidence >= MIN_CONFIDENCE]
    if len(vols) < 2:
        return []
    scale = _scene_scale(ir)
    polys = {v.id: Polygon(v.footprint).buffer(0) for v in vols}
    rels = []
    for i in range(len(vols)):
        for j in range(i + 1, len(vols)):
            a, b = vols[i].id, vols[j].id
            Pi, Pj = polys[a], polys[b]
            if Pi.is_empty or Pj.is_empty:
                continue
            inter = Pi.intersection(Pj).area
            if inter / max(1e-9, min(Pi.area, Pj.area)) > 0.1:
                rels.append(Relation(a, b, "penetrate", "geometry"))
            else:
                dist = Pi.distance(Pj)
                if dist <= adj_ratio * scale:
                    rels.append(Relation(a, b, "adjacent", "geometry"))
                elif dist >= sep_ratio * scale:
                    rels.append(Relation(a, b, "separated", "geometry"))
            if _aligned(np.asarray(vols[i].footprint, float),
                        np.asarray(vols[j].footprint, float), scale):
                rels.append(Relation(a, b, "aligned", "geometry"))
    return rels


def relations_from_ops(ir: IR, ops) -> list[Relation]:
    ids = {v.id for v in ir.volumes}
    out = []
    for op in ops or []:
        if getattr(op, "op", None) != "relate":
            continue
        a, b = op.args.get("a"), op.args.get("b")
        canon = GRAMMAR_TO_CANON.get(op.args.get("type"), None)
        if a in ids and b in ids and canon in RELATION_TYPES:
            out.append(Relation(a, b, canon, "utterance"))
    return out


def _dedup(rels) -> list[Relation]:
    seen, out = set(), []
    for r in rels:
        # 무방향 유형은 정렬, above_below(방향성)는 순서 보존
        key = (r.type, tuple(sorted((r.a, r.b))) if r.type != "above_below" else (r.a, r.b))
        if key not in seen:
            seen.add(key); out.append(r)
    return out


def infer_relations(ir: IR, ops=None) -> IR:
    """기하 + 발화 관계를 ir.relations에 채운다(확정 볼륨 한정, 중복 제거)."""
    rels = infer_geometric(ir) + relations_from_ops(ir, ops)
    # 발화 우선(중복 시 utterance src 유지)
    rels.sort(key=lambda r: 0 if r.src == "utterance" else 1)
    ir.relations = _dedup(rels)
    return ir


def main(argv):
    import json, importlib.util
    from stage4.multiplex import multiplex
    from stage4.naming import extract_naming, assign_names
    if len(argv) < 2:
        print("usage: python stage5/relate.py <multi_capture.json>"); return
    cap = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    ir, _ = multiplex(cap)
    assign_names(ir, extract_naming(cap.get("_naming_utterances", []), cap.get("_stroke_ctx")))
    infer_relations(ir)
    print("volumes:", [(v.id, v.label) for v in ir.volumes])
    for r in ir.relations:
        print(f"  {r.a}--{r.b}: {r.type} ({r.src})")
    print("IR errors:", ir.validate(), "| root fields:", ir.root_field_count())


if __name__ == "__main__":
    main(sys.argv)
