"""1단계 오버레이 — Top view 정사영, 원본 위 중첩 (§3.9, §3.5).

오버레이는 어떤 압축에서도 제거하지 않는다(§3.9). 이게 없으면 결과가 맞는지 알 수 없다.
원본 매스 획(회색) 위에 복원 폴리곤(실선)을 겹쳐 SVG로 낸다. 좌표계 동일(§3.9 평면).
치수 톤(§3.5): 앵커 없으면 무차원 → 비례전파(파선). 앵커 있으면 실선/~.
어긋남 지표 = 입력점의 복원 엣지까지 수직거리(정규화) vs 등급 baseline(CP-0.6).
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR

GRADE_BASELINE = {"precise": 0.049, "medium": 0.197, "coarse": 0.215}  # CP-0.6


def _pt_seg_dist(p, a, b):
    a = np.asarray(a); b = np.asarray(b); p = np.asarray(p)
    ab = b - a; t = np.dot(p - a, ab) / (np.dot(ab, ab) + 1e-9)
    t = np.clip(t, 0, 1)
    return float(np.hypot(*(p - (a + t * ab))))


def misalignment(capture: dict, ir: IR, grade: str) -> dict:
    """입력 매스 점들의 복원 폴리곤까지 최소 수직거리, bbox 대각으로 정규화."""
    if not ir.volumes:
        return {"status": "no_polygon"}
    fp = ir.volumes[0].footprint
    edges = [(fp[i], fp[(i + 1) % len(fp)]) for i in range(len(fp))]
    pts = [pp[:2] for s in capture["strokes"] if s.get("pen") == "mass" for pp in s["points"]]
    if not pts or not edges:
        return {"status": "empty"}
    arr = np.array(pts, float)
    diag = float(np.hypot(*(arr.max(0) - arr.min(0)))) or 1.0
    devs = [min(_pt_seg_dist(p, a, b) for a, b in edges) / diag for p in pts]
    devs = np.array(devs)
    base = GRADE_BASELINE.get(grade, 0.05)
    med = float(np.median(devs))
    return {"status": "ok", "grade": grade,
            "misalign_median": round(med, 4), "misalign_p90": round(float(np.percentile(devs, 90)), 4),
            "baseline": base, "within_baseline": med <= base,
            "note": "§8 오버레이 어긋남 판정: median ≤ 등급 baseline(CP-0.6)이면 통과."}


def to_svg(capture: dict, ir: IR, meta: dict, path: Path):
    W, H = capture.get("w", 640), capture.get("h", 520)
    has_anchor = bool(ir.anchors)
    stroke_style = "stroke:#111;stroke-width:2;fill:none" if has_anchor else \
                   "stroke:#111;stroke-width:2;stroke-dasharray:7 5;fill:none"  # 무차원→파선(§3.5)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}" font-family="system-ui" font-size="12">',
             f'<rect width="{W}" height="{H}" fill="#fff"/>']
    # 원본 매스 획 (회색)
    for s in capture["strokes"]:
        if s.get("pen") != "mass":
            continue
        d = "M " + " L ".join(f"{p[0]:.1f} {p[1]:.1f}" for p in s["points"])
        parts.append(f'<path d="{d}" stroke="#bbb" stroke-width="1.5" fill="none"/>')
    # 복원 폴리곤
    if ir.volumes:
        fp = ir.volumes[0].footprint
        d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in fp) + " Z"
        parts.append(f'<path d="{d}" style="{stroke_style}"/>')
        for x, y in fp:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#e11"/>')
    # 라벨
    m = meta.get("misalign_median")
    tag = f'grade={meta.get("grade")} · lines={meta.get("n_lines")} · ' \
          f'misalign={m} (base {meta.get("baseline")}) · ' \
          f'{"PASS" if meta.get("within_baseline") else "CHECK"}'
    parts.append(f'<text x="10" y="{H-12}" fill="#333">{tag}</text>')
    parts.append('<text x="10" y="18" fill="#999">gray=원본 획 · dashed=무차원 복원(§3.5) · red=정점</text>')
    parts.append('</svg>')
    path.write_text("\n".join(parts), encoding="utf-8")


def run(capture_path: str):
    from stage1.normalize import normalize_to_ir
    cap = json.loads(Path(capture_path).read_text(encoding="utf-8"))
    ir, nmeta = normalize_to_ir(cap)
    grade = nmeta.get("grade", "precise")
    mis = misalignment(cap, ir, grade)
    meta = {**nmeta, **mis}
    stem = Path(capture_path).stem
    svg = ROOT / "stage1" / f"overlay_{stem}.svg"
    to_svg(cap, ir, meta, svg)
    (ROOT / "stage1" / f"overlay_{stem}.json").write_text(
        json.dumps({"ir_meta": nmeta, "misalign": mis}, ensure_ascii=False, indent=2), encoding="utf-8")
    return ir, meta, svg


def main(argv):
    if len(argv) < 2:
        print("usage: python stage1/overlay.py <capture.json>"); return
    ir, meta, svg = run(argv[1])
    print("grade:", meta.get("grade"), "| lines:", meta.get("n_lines"),
          "| misalign_median:", meta.get("misalign_median"),
          "| baseline:", meta.get("baseline"),
          "| within:", meta.get("within_baseline"))
    print("-> ", svg.relative_to(ROOT))


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    main(sys.argv)
