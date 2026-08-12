"""4단계 다중 볼륨 오버레이 — 명명 라벨 포함 (§3.9 확장)."""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage4.multiplex import multiplex
from stage4.naming import extract_naming, assign_names

PALETTE = ["#1a7", "#e11", "#16c", "#e80", "#909", "#0aa"]


def build(capture_path: str):
    cap = json.loads(Path(capture_path).read_text(encoding="utf-8"))
    ir, metas = multiplex(cap)
    hints = extract_naming(cap.get("_naming_utterances", []), cap.get("_stroke_ctx"))
    assign_names(ir, hints)
    W, H = cap.get("w", 640), cap.get("h", 520)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}" font-family="system-ui" font-size="13">',
             f'<rect width="{W}" height="{H}" fill="#fff"/>']
    for s in cap["strokes"]:
        if s.get("pen", "mass") != "mass":
            continue
        d = "M " + " L ".join(f"{p[0]:.1f} {p[1]:.1f}" for p in s["points"])
        parts.append(f'<path d="{d}" stroke="#ccc" stroke-width="1.3" fill="none"/>')
    for k, v in enumerate(ir.volumes):
        col = PALETTE[k % len(PALETTE)]
        fp = v.footprint
        d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in fp) + " Z"
        parts.append(f'<path d="{d}" stroke="{col}" stroke-width="2.5" '
                     f'stroke-dasharray="7 5" fill="{col}" fill-opacity="0.06"/>')
        c = np.asarray(fp, float).mean(0)
        tag = f"{v.id}:{v.label}" if v.label else v.id
        parts.append(f'<text x="{c[0]:.0f}" y="{c[1]:.0f}" fill="{col}" '
                     f'text-anchor="middle" font-weight="bold">{tag}</text>')
    parts.append(f'<text x="10" y="{H-10}" fill="#333">volumes={len(ir.volumes)} · '
                 f'named={sum(1 for v in ir.volumes if v.label)} · 파선=무차원 복원(§3.5)</text>')
    parts.append('</svg>')
    out = ROOT / "stage4" / f"overlay_{Path(capture_path).stem}.svg"
    out.write_text("\n".join(parts), encoding="utf-8")
    return ir, out


def main(argv):
    if len(argv) < 2:
        print("usage: python stage4/overlay_multi.py <capture.json>"); return
    ir, out = build(argv[1])
    print("volumes:", [(v.id, v.label) for v in ir.volumes])
    print("->", out.relative_to(ROOT))


if __name__ == "__main__":
    main(sys.argv)
