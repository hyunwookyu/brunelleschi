"""파리티 참조 생성 — Python normalize_to_ir 출력을 web/test/reference.json으로 (지시서 V-1 §9).
TS 파서가 이 참조와 일치하는지 vitest가 검증. 어긋나면 TS가 틀린 것(§1.3)."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from stage1.normalize import normalize_to_ir

FIXTURES = ["fixture_rect_precise", "fixture_L_precise", "fixture_L_coarse"]


def main():
    cases = []
    for name in FIXTURES:
        cap = json.loads((ROOT / "stage1" / f"{name}.json").read_text(encoding="utf-8"))
        # _truth 등 보조필드 제거(순수 캡처만 TS에 전달)
        capture = {"frame": cap.get("frame", ""), "w": cap.get("w", 640), "h": cap.get("h", 520),
                   "strokes": [{"points": s["points"], "pen": s.get("pen", "mass")} for s in cap["strokes"]]}
        ir, meta = normalize_to_ir(cap)
        cases.append({
            "name": name, "capture": capture,
            "expect": {
                "n_volumes": len(ir.volumes),
                "footprint": ir.volumes[0].footprint if ir.volumes else None,
                "confidence": ir.volumes[0].confidence if ir.volumes else None,
                "n_lines": meta.get("n_lines"), "parseable": meta.get("parseable"),
                "fit_residual": meta.get("fit_residual"), "edge_coverage": meta.get("edge_coverage"),
            },
        })
    out = Path(__file__).resolve().parent / "reference.json"
    out.write_text(json.dumps(cases, ensure_ascii=False, indent=2), encoding="utf-8")
    print("->", out, f"({len(cases)} cases)")
    for c in cases:
        e = c["expect"]
        print(f"  {c['name']}: vols={e['n_volumes']} lines={e['n_lines']} conf={e['confidence']} parseable={e['parseable']}")

    # 다중화 + 관계 참조
    import importlib.util
    mm = importlib.util.spec_from_file_location("mm", ROOT / "stage4" / "make_multi.py")
    mmod = importlib.util.module_from_spec(mm); mm.loader.exec_module(mmod)
    from stage4.multiplex import multiplex
    from stage5.relate import infer_relations
    mcap = mmod.make(seed=0)
    capture = {"frame": "multi", "w": mcap["w"], "h": mcap["h"],
               "strokes": [{"points": s["points"], "pen": s.get("pen", "mass")} for s in mcap["strokes"]]}
    mir, _ = multiplex(mcap); infer_relations(mir)
    multi = {"capture": capture,
             "expect": {"n_volumes": len(mir.volumes), "ids": [v.id for v in mir.volumes],
                        "relation_types": sorted({r.type for r in mir.relations})}}

    # tentative (부분획) 참조
    from stage1.tentative import resolve
    lcap = json.loads((ROOT / "stage1" / "fixture_L_precise.json").read_text(encoding="utf-8"))
    pts = lcap["strokes"][0]["points"]
    partials = []
    for frac in (0.30, 1.0):
        k = max(2, int(len(pts) * frac))
        pc = {"frame": "", "w": 640, "h": 520, "strokes": [{"points": pts[:k], "pen": "mass"}]}
        vols, hints = resolve(pc)
        partials.append({"frac": frac, "capture": pc,
                         "expect": {"n_volumes": len(vols), "n_hints": len(hints)}})

    # 카메라 정합 참조 (무노이즈 → fit_error≈0, DLT 정확 → TS도 0. §1.5 파리티)
    from stage3.synth import build_synthetic, default_world_quad_irregular
    from stage3.camera import fit_camera
    import numpy as np
    w4, i4, sz, _ = build_synthetic(world4=default_world_quad_irregular())
    res = fit_camera(w4, i4, sz)
    camera = {"world4": [[float(x), float(y)] for x, y in w4],
              "image4": [[float(x), float(y)] for x, y in i4],
              "img_size": [float(sz[0]), float(sz[1])],
              "expect": {"fit_error": float(res.fit_error)}}

    out2 = Path(__file__).resolve().parent / "reference_multi.json"
    out2.write_text(json.dumps({"multi": multi, "partials": partials, "camera": camera},
                               ensure_ascii=False, indent=2), encoding="utf-8")
    print("->", out2, f"| camera fit_error={camera['expect']['fit_error']:.2e}")
    print(f"  multi: vols={multi['expect']['n_volumes']} ids={multi['expect']['ids']} rels={multi['expect']['relation_types']}")
    for p in partials:
        print(f"  partial {int(p['frac']*100)}%: vols={p['expect']['n_volumes']} hints={p['expect']['n_hints']}")


if __name__ == "__main__":
    main()
