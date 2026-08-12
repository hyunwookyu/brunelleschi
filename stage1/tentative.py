"""표시층 tentative hint — 판정 D 교체 (지시서 V 정정, 2026-08-13).

배경(실측): 파서는 결정론적이라 30% 완성 시점엔 볼륨이 아예 없다(parseable 0.017).
저confidence 볼륨조차 없어 §3.5 confidence 표시만으론 판정 D를 만족 못 한다.

해법: **미폐합 획 뭉치**에서 축 정렬 bbox(또는 볼록 껍질)를 뽑아 파선 상자로 표시한다.
- IR에 들어가지 않는다(화면에만 존재). 파서는 결정론적으로 유지.
- 획이 닫혀 정식 볼륨이 되면 hint를 제거하고 볼륨으로 매끄럽게 교체.

새 판정 D: "30% 완성 시점에 tentative hint가 표시되고, 폐합 시 정식 볼륨으로 전환된다."
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage4.multiplex import group_strokes
from stage1.normalize import normalize_to_ir

CONF_MIN = 0.5     # 이 이상 confidence 볼륨 = 정식(볼륨). 미만/미형성 = tentative hint.


def _aabb(pts: np.ndarray):
    lo, hi = pts.min(0), pts.max(0)
    return [[float(lo[0]), float(lo[1])], [float(hi[0]), float(lo[1])],
            [float(hi[0]), float(hi[1])], [float(lo[0]), float(hi[1])]]


def _hull(pts: np.ndarray):
    if len(pts) < 3:
        return _aabb(pts)
    try:
        from scipy.spatial import ConvexHull
        h = ConvexHull(pts)
        return [[float(pts[i, 0]), float(pts[i, 1])] for i in h.vertices]
    except Exception:
        return _aabb(pts)


def resolve(capture: dict, method="paleo"):
    """획 뭉치별로 정식 볼륨 vs tentative hint 판정.
    반환: (volumes: list[Volume], hints: list[dict]). hints는 IR 밖 화면 전용."""
    groups = group_strokes(capture)
    volumes, hints = [], []
    for k, g in enumerate(groups, 1):
        sub = {"frame": capture.get("frame", ""), "w": capture.get("w", 1000),
               "h": capture.get("h", 1000), "strokes": g}
        ir, meta = normalize_to_ir(sub, vol_id=f"v{k}", method=method)
        conf = meta.get("confidence", 0.0)
        if ir.volumes and conf >= CONF_MIN:
            volumes.append(ir.volumes[0])                 # 폐합·확정 → 정식 볼륨
        else:
            pts = np.concatenate([np.asarray([p[:2] for p in s["points"]], float) for s in g])
            hints.append({"id": f"hint_{k}", "bbox": _aabb(pts), "hull": _hull(pts),
                          "n_strokes": len(g), "n_pts": int(len(pts)),
                          "confidence": conf, "parseable": bool(meta.get("parseable")),
                          "reason": "미폐합/저confidence — 표시 전용 파선 상자(IR 밖)"})
    return volumes, hints


def main(argv):
    import json
    if len(argv) < 2:
        print("usage: python stage1/tentative.py <capture.json>"); return
    cap = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    vols, hints = resolve(cap)
    print(f"정식 볼륨 {len(vols)}개 · tentative hint {len(hints)}개")
    for h in hints:
        print(f"  {h['id']}: bbox {len(h['bbox'])}pt, hull {len(h['hull'])}pt, conf {h['confidence']} — {h['reason']}")


if __name__ == "__main__":
    main(sys.argv)
