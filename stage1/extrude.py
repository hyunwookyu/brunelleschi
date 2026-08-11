"""1단계 압출 — 폴리곤 → 볼륨 (§7 1단계).

기하 생성은 압출 수준(§2). 앵커 없으면 IR height=None(무차원, §3.5) 유지하고,
Rhino 시각화용 height만 별도 산출(무차원 플레이스홀더, CP-0.4). IR은 치수를 주장하지 않는다.
"""
from __future__ import annotations
import numpy as np
from ir.schema import IR


def viz_height(ir: IR, ratio=0.6) -> float:
    """시각화 전용 높이(무차원). 폴리곤 bbox 대각의 ratio. IR엔 저장 안 함."""
    if not ir.volumes:
        return 0.0
    fp = np.array(ir.volumes[0].footprint, float)
    diag = float(np.hypot(*(fp.max(0) - fp.min(0))))
    return round(diag * ratio, 2)


def build_spec(ir: IR) -> list[dict]:
    """Rhino 빌드 스펙: 각 볼륨의 footprint + viz_height. height_src=placeholder 명시."""
    h = viz_height(ir)
    specs = []
    for v in ir.volumes:
        specs.append({"id": v.id, "footprint": v.footprint, "base": v.base,
                      "viz_height": h,
                      "height_claimed": v.height,          # None = 무차원(치수 주장 없음)
                      "height_src": "placeholder(viz-only)" if v.height is None else v.height_src})
    return specs
