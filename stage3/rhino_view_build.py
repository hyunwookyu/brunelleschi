import rhinoscriptsyntax as rs
view = rs.CurrentView() if 'Perspective' not in rs.ViewNames() else 'Perspective'
cam_pt = rs.CreatePoint(-6.0, 8.0, 5.0)
tgt_pt = rs.CreatePoint(0.732, 1.268, 1.94)
rs.ViewCameraTarget(view, cam_pt, tgt_pt)
rs.ViewCameraLens(view, 36.0)
rs.ViewProjection(view, 2)
add_rhino_object_metadata(rs.AddPoint(cam_pt), 'stage3_Perspective_cam', 'recovered camera src=sk_demo fit_error=1.4561792860887973e-16')