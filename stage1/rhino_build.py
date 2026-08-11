import rhinoscriptsyntax as rs
import Rhino
if not rs.IsLayer('s2s_stage1'): rs.AddLayer('s2s_stage1')
rs.CurrentLayer('s2s_stage1')
pts = [[120.04, -125.0, 0.0], [517.06, -122.03, 0.0], [492.91, -248.65, 0.0], [318.75, -274.74, 0.0], [310.99, -455.69, 0.0], [58.37, -408.59, 0.0], [120.04, -125.0, 0.0]]
crv = rs.AddPolyline([rs.CreatePoint(p[0],p[1],p[2]) for p in pts])
path = rs.AddLine(rs.CreatePoint(0,0,0), rs.CreatePoint(0,0,340.33))
srf = rs.ExtrudeCurve(crv, path)
add_rhino_object_metadata(crv, 'v1_plan', 'stage1 footprint (unitless)')
if srf: add_rhino_object_metadata(srf, 'v1_mass', 'stage1 extrusion viz_h=340.33 (dimensionless)')
rs.CurrentView().SetProjection(Rhino.Display.DefinedViewportProjection.Top) if hasattr(rs.CurrentView(),'SetProjection') else None
rs.Command('_Top')
rs.ZoomExtents()