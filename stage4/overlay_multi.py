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
        # §3.5 톤 확장: confidence로 연속 흐림(낮을수록 흐림). conf<0.5=점선(명확히 미확정).
        # 연속화 목적 — 볼륨이 사라져도 거슬리지 않게(보수적 파서보다 나음).
        tentative = v.confidence < 0.5
        dash = "2 4" if tentative else "7 5"
        width = 1.5 if tentative else 2.5
        opacity = round(0.30 + 0.70 * max(0.0, min(1.0, v.confidence)), 2)
        fill_op = round(0.02 + 0.05 * v.confidence, 3)
        parts.append(f'<path d="{d}" stroke="{col}" stroke-width="{width}" '
                     f'stroke-dasharray="{dash}" stroke-opacity="{opacity}" '
                     f'fill="{col}" fill-opacity="{fill_op}"/>')
        c = np.asarray(fp, float).mean(0)
        base = f"{v.id}:{v.label}" if v.label else v.id
        tag = base + ("?" if tentative else "")     # 미확정 표식
        parts.append(f'<text x="{c[0]:.0f}" y="{c[1]:.0f}" fill="{col}" fill-opacity="{opacity}" '
                     f'text-anchor="middle" font-weight="bold">{tag}</text>')
        parts.append(f'<text x="{c[0]:.0f}" y="{c[1]+14:.0f}" fill="{col}" fill-opacity="{opacity*0.7}" '
                     f'text-anchor="middle" font-size="10">conf {v.confidence:.2f}</text>')
    parts.append(f'<text x="10" y="{H-10}" fill="#333">volumes={len(ir.volumes)} · '
                 f'named={sum(1 for v in ir.volumes if v.label)} · '
                 f'점선흐림=미확정(conf&lt;0.5, §3.5확장) · 파선=무차원 확정</text>')
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
