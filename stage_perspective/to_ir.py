"""투시 → IR 조립 (지시 2.1/2.5). **평면은 입력이 아니라 파생 출력이다.**

기존 §3.8 경로는 "평면 폴리곤 4점 ↔ 투시 4점"을 전제했으나, 사용자는 평면을 그리지 않는다.
입력은 투시뿐이다(1~3점). 따라서 흐름이 뒤집힌다:

    투시 획 → 바닥면 검출 → 카메라 복원(2.2) → Z=0 역투영 → **평면(파생)** → IR.volumes

평면 프레임(§3.2)은 이제 입력을 받지 않고 이 복원 결과를 표시·편집한다.

부족한 자유도는 **추정하지 않는다**(§3.5 확장):
  - 1점 f 미결정 → 깊이 미결정 → unresolved
  - 2점 종횡비 구간이 넓음 → unresolved (1-bis)
  - 축 라벨 모호 → unresolved (1-ter B)
모두 §6 질의 대상이 된다. 1점 투시는 무엇이 부족한지가 기하적으로 특정되므로 질의가 명확하다.
"""
from __future__ import annotations
import sys
from pathlib import Path
from typing import Optional, Sequence
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR, Volume, View
from stage_perspective.camera_unified import recover_camera, vanishing_points_from_quad
from stage_perspective.priors import recover_plane_rightangle
from stage_perspective.uncertainty import (propagate_aspect, unresolved_entry,
                                           axis_unresolved_entry)


def floor_quad_to_volume(quad, img_size, vol_id: str = "v1", grade: str = "medium",
                         mc_samples: int = 80, confidence: float = 0.8) -> dict:
    """투시 이미지의 **바닥면 사각형** → 파생 평면 + Volume + 미결정 항목.

    반환: {"volume": Volume|None, "unresolved": [str], "camera": dict, "aspect": dict}
    """
    q = np.asarray(quad, float)
    vps = vanishing_points_from_quad(q, img_size)
    cam = recover_camera(vps, img_size, quad=q)
    unresolved: list[str] = list(cam.get("unresolved", []))

    # 바닥면 역투영(Z=0) — 이것이 '평면'이다(파생 출력)
    rec = recover_plane_rightangle(q, img_size)
    if not rec.get("ok"):
        unresolved.append(f"{vol_id}: 바닥면 역투영 실패 — 투시 단독으로 평면을 얻지 못했다")
        return {"volume": None, "unresolved": unresolved, "camera": cam, "aspect": None}

    # 종횡비 불확실성 구간(1-bis) — 확정이 아니라 표현
    unc = propagate_aspect(q, img_size, grade=grade, n_samples=mc_samples)
    msg = unresolved_entry(vol_id, unc)
    if msg:
        unresolved.append(msg)

    # 축 라벨 모호(1-ter B)
    axis = rec.get("axis")
    amsg = axis_unresolved_entry(vol_id, axis)
    if amsg:
        unresolved.append(amsg)

    vol = Volume(
        id=vol_id,
        footprint=[[float(x), float(y)] for x, y in np.asarray(rec["recovered_plane"], float)],
        base=0.0,
        height=None,                      # 앵커 없으면 무차원(§3.5)
        height_src="unset",
        confidence=float(confidence),
        axis=axis,
    )
    return {"volume": vol, "unresolved": unresolved, "camera": cam, "aspect": unc}


def build_ir(quads: Sequence, img_size, src: str = "persp",
             grade: str = "medium", mc_samples: int = 80) -> IR:
    """투시 프레임의 바닥면 사각형들 → IR. 평면 입력 없음(지시 2.1)."""
    ir = IR()
    cam_last: Optional[dict] = None
    for i, q in enumerate(quads):
        r = floor_quad_to_volume(q, img_size, vol_id=f"v{i + 1}",
                                 grade=grade, mc_samples=mc_samples)
        if r["volume"] is not None:
            ir.volumes.append(r["volume"])
        ir.unresolved.extend(r["unresolved"])
        cam_last = r["camera"]
    if cam_last is not None:
        ir.views.append(View(src=src, camera={
            "case": cam_last.get("case"), "f": cam_last.get("f"),
            "principal_point": cam_last.get("principal_point"),
            "verdict": cam_last.get("verdict"),
            "direct_scale_axes": cam_last.get("direct_scale_axes"),
            "dof_note": cam_last.get("dof_note"),
            "assumption": cam_last.get("assumption"),
        }, fit_error=None))
    return ir
