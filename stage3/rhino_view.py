"""3단계 Rhino 뷰포트 세팅 — 복원 카메라 → 원본 투시 스케치 위 중첩 확인 (§3.9).

"투시 — Rhino 뷰포트를 추정 카메라로 세팅, 모델을 원본 스케치 위에 반투명 중첩"(§3.9).
Rhino MCP execute_rhino_code 는 Rhino7 / IronPython2.7 — f-string 금지, 컴프리헨션 제약
(stage1/rhino_out.py와 동일 제약). 본 모듈은 실행할 코드 문자열만 생성한다. Rhino 미연결
상태이므로 실행하지 않고 stage3/rhino_view_build.py 로 저장만 한다.

좌표계(§3.9 "두 뷰가 같은 IR을 본다"): camera.py의 world4/R/tvec 는 stage1 footprint와
동일한 원좌표(x,y, y는 아래로 증가하는 스케치 관례, §3.2). rhino_out.py와 동일하게
Rhino 방출 시점에만 y를 뒤집는다(Rhino y = -sketch_y) — world IR 자체는 뒤집지 않는다.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR, View


def _camera_world_pose(camera: dict, target_dist: float = 10.0):
    """camera dict(K,rvec/R,tvec) → world 카메라 원점 C, 주시점 target (원좌표, y down).

    OpenCV 관례: P_cam = R @ P_world + t, 카메라는 자신의 +Z축을 바라봄.
    C = -R^T t (카메라 원점의 world 좌표). target = C + R^T[0,0,1]*target_dist.
    """
    R = np.array(camera["R"], dtype=float)
    t = np.array(camera["tvec"], dtype=float).reshape(3, 1)
    C = (-R.T @ t).reshape(3)
    forward = (R.T @ np.array([0.0, 0.0, 1.0])).reshape(3)
    target = C + forward * target_dist
    return C, target


def _lens_mm(K: list[list[float]], img_w: float, sensor_mm: float = 36.0) -> float:
    """fx(px) → 35mm 환산 렌즈 길이(mm). rs.ViewCameraLens 는 35mm 필름 기준(§ Rhino 관례)."""
    fx = float(K[0][0])
    return round(fx * sensor_mm / float(img_w), 2)


def gen_view_camera_code(view: View, img_size: tuple[float, float],
                          view_name: str = "Perspective", target_dist: float = 10.0) -> str:
    """View.camera(정상 or 근사) → IronPython 코드 문자열. 좌표는 방출 시 y 반전(rhino_out.py 관례)."""
    lines = ["import rhinoscriptsyntax as rs"]
    cam = view.camera or {}
    if cam.get("mode") == "approximate":
        # §3.8 우회: 정확한 포즈가 없다 — 기본 정면-근사 카메라만 코멘트로 남기고 스킵.
        lines.append("# approximate mode (%s) -- no recovered pose; camera left as-is" %
                      cam.get("reason", cam.get("hint", "")))
        lines.append("# view: %s" % view_name)
        return "\n".join(lines)

    C, target = _camera_world_pose(cam, target_dist=target_dist)
    lens = _lens_mm(cam["K"], img_size[0])

    # y 반전(rhino_out.py와 동일 관례) — world(x,y,z) -> rhino(x,-y,z)
    cx, cy, cz = round(float(C[0]), 3), round(-float(C[1]), 3), round(float(C[2]), 3)
    tx, ty, tz = round(float(target[0]), 3), round(-float(target[1]), 3), round(float(target[2]), 3)

    lines.append("view = rs.CurrentView() if '%s' not in rs.ViewNames() else '%s'" % (view_name, view_name))
    lines.append("cam_pt = rs.CreatePoint(%s, %s, %s)" % (cx, cy, cz))
    lines.append("tgt_pt = rs.CreatePoint(%s, %s, %s)" % (tx, ty, tz))
    lines.append("rs.ViewCameraTarget(view, cam_pt, tgt_pt)")
    lines.append("rs.ViewCameraLens(view, %s)" % lens)
    lines.append("rs.ViewProjection(view, 2)")   # 2 = perspective (rhinoscriptsyntax 관례)
    lines.append("add_rhino_object_metadata(rs.AddPoint(cam_pt), 'stage3_%s_cam', "
                 "'recovered camera src=%s fit_error=%s')" % (view_name, view.src, view.fit_error))
    return "\n".join(lines)


def main(argv):
    ir_path = argv[1] if len(argv) > 1 else "stage3/out_ir.json"
    w = float(argv[2]) if len(argv) > 2 else 800.0
    h = float(argv[3]) if len(argv) > 3 else 600.0
    ir = IR.from_dict(json.loads((ROOT / ir_path).read_text(encoding="utf-8")))
    if not ir.views:
        print("no views in IR -- nothing to generate")
        return
    code = gen_view_camera_code(ir.views[0], (w, h))
    out = ROOT / "stage3" / "rhino_view_build.py"
    out.write_text(code, encoding="utf-8")
    print(code)
    print("\n-> stage3/rhino_view_build.py (Rhino 연결 시 MCP execute_rhino_code 로 실행)")


if __name__ == "__main__":
    main(sys.argv)
