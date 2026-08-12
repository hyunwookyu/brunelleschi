"""4단계 볼륨 다중화 — 다중 매스 영역 → 다중 IR 볼륨 (§7 4단계).

1단계는 매스 획 전체를 한 폴리곤으로 합쳤다. 4단계는 공간적으로 분리된 매스
영역들을 각각의 볼륨으로 분해한다. 획을 bbox 근접으로 그룹핑(union-find) →
그룹별로 stage1 정규화 파이프라인(스케일정규화+PaleoSketch) 재사용 → v1..vn.

스키마 변경 없음(루트 5키). Volume.label(중첩)만 명명(naming.py)에서 채운다.
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Volume
from stage1.normalize import normalize_to_ir


def _bbox(stroke):
    a = np.asarray([p[:2] for p in stroke["points"]], float)
    return a.min(0), a.max(0)


def _bbox_gap(b1, b2) -> float:
    (lo1, hi1), (lo2, hi2) = b1, b2
    dx = max(0.0, max(lo1[0] - hi2[0], lo2[0] - hi1[0]))
    dy = max(0.0, max(lo1[1] - hi2[1], lo2[1] - hi1[1]))
    return float(np.hypot(dx, dy))


def group_strokes(capture: dict, gap_ratio=0.05) -> list[list[dict]]:
    """매스 획을 bbox 근접으로 그룹핑(union-find). gap < gap_ratio×시트대각 → 동일 볼륨.
    같은 볼륨 획은 겹치거나 끝점 공유(gap~0), 다른 볼륨은 뚜렷한 간격 → 작은 임계."""
    mass = [s for s in capture["strokes"] if s.get("pen", "mass") == "mass" and len(s["points"]) >= 2]
    if not mass:
        return []
    diag = float(np.hypot(capture.get("w", 1000), capture.get("h", 1000)))
    gap = gap_ratio * diag
    boxes = [_bbox(s) for s in mass]
    parent = list(range(len(mass)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i in range(len(mass)):
        for j in range(i + 1, len(mass)):
            if _bbox_gap(boxes[i], boxes[j]) <= gap:
                parent[find(i)] = find(j)
    groups: dict[int, list] = {}
    for i, s in enumerate(mass):
        groups.setdefault(find(i), []).append(s)
    # 좌상단 순서로 정렬(안정적 id 부여)
    def key(g):
        lo = np.min([_bbox(s)[0] for s in g], axis=0)
        return (round(lo[1], -1), lo[0])
    return [g for _, g in sorted(groups.items(), key=lambda kv: key(kv[1]))]


def multiplex(capture: dict) -> tuple[IR, list[dict]]:
    """다중 볼륨 IR. 각 그룹을 stage1 정규화로 폴리곤화 → v1..vn."""
    groups = group_strokes(capture)
    volumes, metas = [], []
    for k, g in enumerate(groups, 1):
        sub = {"frame": capture.get("frame", ""), "w": capture.get("w", 1000),
               "h": capture.get("h", 1000), "strokes": g}
        ir, meta = normalize_to_ir(sub, vol_id=f"v{k}")
        meta["group_index"] = k - 1
        metas.append(meta)
        if ir.volumes:
            volumes.append(ir.volumes[0])
    out = IR(volumes=volumes)
    if not volumes:
        out.unresolved.append(f"다중화 실패: 파싱 가능한 매스 영역 없음(그룹 {len(groups)}개)")
    return out, metas


def main(argv):
    import json
    if len(argv) < 2:
        print("usage: python stage4/multiplex.py <capture.json>"); return
    cap = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    ir, metas = multiplex(cap)
    print("volumes:", [v.id for v in ir.volumes], "| groups:", len(metas))
    for v, m in zip(ir.volumes, metas):
        print(f"  {v.id}: {len(v.footprint)}pts parseable={m.get('parseable')} lines={m.get('n_lines')}")
    print("IR errors:", ir.validate())


if __name__ == "__main__":
    main(sys.argv)
