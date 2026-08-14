"""TS 카메라 이식의 정합 기준값 생성 — Python이 기준 구현이다(W-1).

`web/test/camera_ref.json`을 만든다. TS 테스트가 이것과 대조한다.
값이 갈리면 **TS가 틀린 것**으로 본다(구 V-1에서 쓰던 규칙과 같다).

    python web/test/gen_camera_ref.py
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
from stage_perspective.viewdist import (line_intersect, f_from_two_vps, f_from_three_vps, gate)
from stage_perspective.camera_unified import recover_camera, direct_scale_axes

SZ = (800.0, 600.0)


def _cam(vps, **kw):
    r = recover_camera([None if v is None else np.array(v, float) for v in vps], SZ, **kw)
    return {k: (list(v) if isinstance(v, (list, tuple, np.ndarray)) else v)
            for k, v in r.items() if k in
            ("case", "n_vps", "ok", "f", "principal_point", "residual", "verdict",
             "ratio", "fov_deg", "direct_scale_axes")}


def main():
    cases = {
        "line_intersect": {
            "input": [[0, 0], [10, 5], [0, 10], [10, 6]],
            "out": line_intersect([0, 0], [10, 5], [0, 10], [10, 6]).tolist(),
        },
        "line_intersect_parallel": {
            "input": [[0, 0], [10, 0], [0, 5], [10, 5]],
            "out": None,
        },
        # 2점: 주점(400,300) 양쪽에 대칭으로 놓으면 f² = |PV₁||PV₂|
        "f_two_vps": {
            "vps": [[-200.0, 300.0], [1400.0, 300.0]],
            "out": f_from_two_vps([-200.0, 300.0], [1400.0, 300.0], SZ),
        },
        "f_two_vps_same_side": {
            "vps": [[900.0, 300.0], [1400.0, 300.0]],
            "out": f_from_two_vps([900.0, 300.0], [1400.0, 300.0], SZ),
        },
        # 3점: 예각 삼각형 → 수심이 안쪽
        "f_three_vps_acute": {
            "vps": [[-600.0, 200.0], [1400.0, 200.0], [400.0, 2200.0]],
            "out": f_from_three_vps([-600.0, 200.0], [1400.0, 200.0], [400.0, 2200.0]),
        },
        # 3점: 둔각 → f²<0 (6.5)
        "f_three_vps_obtuse": {
            "vps": [[0.0, 0.0], [100.0, 0.0], [3000.0, 40.0]],
            "out": f_from_three_vps([0.0, 0.0], [100.0, 0.0], [3000.0, 40.0]),
        },
        "gate": {
            "samples": [{"f": f, "out": gate(f, SZ[0])}
                        for f in (200.0, 500.0, 700.0, 900.0, 4000.0)],
        },
        "direct_scale_axes": {n: direct_scale_axes(n) for n in (0, 1, 2, 3)},
        "recover_3pt": {"out": _cam([[-600, 200], [1400, 200], [400, 2200]])},
        "recover_2pt": {"out": _cam([[-200, 300], [1400, 300], None])},
        "recover_1pt_unset": {"out": _cam([[400, 300], None, None])},
        "recover_1pt_setting": {"out": _cam([[400, 300], None, None], f_setting=900.0)},
        "recover_0pt": {"out": _cam([None, None, None])},
    }
    # numpy → JSON
    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(x) for x in o]
        if isinstance(o, (np.floating, np.integer)):
            return o.item()
        return o
    out = {"spec": "W-1 카메라 수학 TS 이식 정합 기준(Python이 기준 구현).",
           "img_size": list(SZ), "cases": clean(cases)}
    p = Path(__file__).resolve().parent / "camera_ref.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {p}")


if __name__ == "__main__":
    main()
