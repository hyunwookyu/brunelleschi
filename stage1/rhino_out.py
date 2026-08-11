"""1단계 Rhino 출력 — IR → Rhino MCP 압출 (§7 1단계, §5.1 기존 자산).

IR 볼륨을 Rhino에 폴리곤 커브 + 압출 서페이스로 생성한다. 좌표계는 평면과 동일(§3.9).
Rhino MCP execute_rhino_code 는 Rhino7 / IronPython2.7 — f-string 금지, 컴프리헨션 제약.
본 모듈은 실행할 IronPython 코드 문자열을 생성한다(코드 리뷰 후 MCP로 실행).

주: 스케치 이미지 y축은 아래로 증가 → Rhino y = -sketch_y 로 뒤집어 세운다.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ir.schema import IR
from stage1.extrude import build_spec


def gen_rhino_code(ir: IR, layer="s2s_stage1") -> str:
    specs = build_spec(ir)
    lines = [
        "import rhinoscriptsyntax as rs",
        "import Rhino",
        "if not rs.IsLayer('%s'): rs.AddLayer('%s')" % (layer, layer),
        "rs.CurrentLayer('%s')" % layer,
    ]
    for sp in specs:
        # y 뒤집기 + base z
        pts = [[round(x, 3), round(-y, 3), sp["base"]] for x, y in sp["footprint"]]
        if pts and pts[0] != pts[-1]:
            pts.append(pts[0])                       # 닫기
        lines.append("pts = %s" % json.dumps(pts))
        lines.append("crv = rs.AddPolyline([rs.CreatePoint(p[0],p[1],p[2]) for p in pts])")
        lines.append("path = rs.AddLine(rs.CreatePoint(0,0,0), rs.CreatePoint(0,0,%s))" % sp["viz_height"])
        lines.append("srf = rs.ExtrudeCurve(crv, path)")
        lines.append("add_rhino_object_metadata(crv, '%s_plan', 'stage1 footprint (unitless)')" % sp["id"])
        lines.append("if srf: add_rhino_object_metadata(srf, '%s_mass', 'stage1 extrusion viz_h=%s (dimensionless)')"
                     % (sp["id"], sp["viz_height"]))
    lines.append("rs.CurrentView().SetProjection(Rhino.Display.DefinedViewportProjection.Top) if hasattr(rs.CurrentView(),'SetProjection') else None")
    lines.append("rs.Command('_Top')")
    lines.append("rs.ZoomExtents()")
    return "\n".join(lines)


def main(argv):
    import sys
    from pathlib import Path
    ROOT = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(ROOT))
    ir_path = argv[1] if len(argv) > 1 else "stage1/out_ir.json"
    ir = IR.from_dict(json.loads((ROOT / ir_path).read_text(encoding="utf-8")))
    code = gen_rhino_code(ir)
    out = ROOT / "stage1" / "rhino_build.py"
    out.write_text(code, encoding="utf-8")
    print(code)
    print("\n-> stage1/rhino_build.py (Rhino 연결 시 MCP execute_rhino_code 로 실행)")


if __name__ == "__main__":
    import sys
    main(sys.argv)
