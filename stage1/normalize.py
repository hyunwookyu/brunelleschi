"""1단계 정규화 — 잉크 → 직교 스냅 → 폴리곤 → IR (§7 1단계, §5.3).

캡처 JSON(§4.1 포맷)에서 매스 채널(§4.3 검정=윤곽) 획만 취해 register 등급을 판정하고
(§5.3 첫 몇 획 통계), 등급별 tuned tolerance로 normalize_core 파싱 → 폴리곤 → IR volumes.
발화·투시 없음, IR은 폴리곤 리스트(§7 1단계).
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common.normalize_core import parse_strokes, stroke_straightness, DEFAULT_TOL
from ir.schema import IR, Volume

# Quick,Draw 등급 centroid(직진성 중앙값, §6.1 CP-0.6)
GRADE_CENTROID = {"precise": 0.049, "medium": 0.197, "coarse": 0.215}


def load_tuned() -> dict:
    p = ROOT / "common" / "tuned_tol.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def strokes_of_channel(capture: dict, channel="mass") -> list[np.ndarray]:
    out = []
    for s in capture["strokes"]:
        if s.get("pen", "mass") != channel:
            continue
        pts = np.array([[p[0], p[1]] for p in s["points"]], float)
        if len(pts) >= 2:
            out.append(pts)
    return out


def detect_grade(strokes: list[np.ndarray], win=12, step=6) -> tuple[str, float]:
    """register 판정(§5.3): 국소 창(window) 직진성 중앙값 → 최근접 등급 centroid.
    전체 획(폐곡선) 직진성은 형태에 좌우되므로 국소 창으로 '떨림'만 측정한다."""
    vals = []
    for s in strokes[:8]:                        # 첫 몇 획
        for i in range(0, max(1, len(s) - win), step):
            seg = s[i:i + win]
            v = stroke_straightness(seg[:, 0], seg[:, 1])
            if v is not None:
                vals.append(v)
    if not vals:
        return "precise", 0.0
    med = float(np.median(vals))
    grade = min(GRADE_CENTROID, key=lambda g: abs(GRADE_CENTROID[g] - med))
    return grade, med


CANON_DIAG = 180.0   # tuned tol이 학습된 정준 스케일 (§6.4). 입력을 여기 맞춰 스케일불변 파싱.
LINE_CAP = 14        # 이보다 많은 라인 = 직교폴리곤 미형성 → 파싱 경계(§5.3)
FIT_MAX = 0.06       # 입력점-복원폴리곤 적합 잔차 상한(정준대각 대비). 초과=스크리블/비직교(§5.3)


def _fit_residual(scaled_strokes, verts) -> float:
    """스케일 공간에서 입력점의 복원 폴리곤 엣지까지 중앙 수직거리 / CANON_DIAG.
    paleo가 스크리블도 폴리곤화하므로 §5.3 경계 판정에 적합도 게이트가 필요."""
    if len(verts) < 3:
        return 1.0
    edges = [(verts[i], verts[(i + 1) % len(verts)]) for i in range(len(verts))]
    pts = np.concatenate([s for s in scaled_strokes])
    def d(p, a, b):
        a = np.asarray(a); b = np.asarray(b); ab = b - a
        t = np.clip(np.dot(p - a, ab) / (np.dot(ab, ab) + 1e-9), 0, 1)
        return np.hypot(*(p - (a + t * ab)))
    dev = [min(d(p, a, b) for a, b in edges) for p in pts]
    return float(np.median(dev)) / CANON_DIAG


def normalize_to_ir(capture: dict, vol_id="v1", method="paleo") -> tuple[IR, dict]:
    mass = strokes_of_channel(capture, "mass")
    if not mass:
        return IR(unresolved=["매스(검정) 채널 획 없음"]), {"grade": None}
    grade, med = detect_grade(mass)                 # 정보용 (등급은 실측 세션에서 재보정, §6.6)
    # 스케일 정규화 → 정준 스케일에서 파싱 → 결과 역스케일
    allp = np.concatenate(mass); c = allp.min(0)
    diag = float(np.hypot(*(allp.max(0) - allp.min(0)))) or 1.0
    s = CANON_DIAG / diag
    scaled = [(m - c) * s for m in mass]
    tuned = load_tuned()
    tol = tuned.get("precise", DEFAULT_TOL)         # precise tol만 비퇴화(§6.4) → 기본
    g = parse_strokes(scaled, tol, method=method)   # §5.1 PaleoSketch 기본

    # 폴리곤 정점 = 라인 체인 정점, 원 좌표계로 역변환
    verts = []
    for ln in g.lines:
        if not verts:
            verts.append(list(ln.p0))
        verts.append(list(ln.p1))
    verts = [[v[0] / s + c[0], v[1] / s + c[1]] for v in verts]

    scaled_verts = np.array([[x, y] for x, y in
                             ([[l.p0[0], l.p0[1]] for l in g.lines[:1]] +
                              [[l.p1[0], l.p1[1]] for l in g.lines])], float) if g.lines else np.empty((0, 2))
    resid = _fit_residual(scaled, scaled_verts) if len(g.lines) >= 3 else 1.0
    parseable = (3 <= len(g.lines) <= LINE_CAP) and resid <= FIT_MAX
    meta = {"grade": grade, "straightness_med": round(med, 4), "scale": round(s, 4),
            "n_lines": len(g.lines), "n_constraints": len(g.constraints),
            "fit_residual": round(resid, 4), "parseable": parseable}
    if not parseable:
        # §5.3 경계: 기하 불가 → 관계만/미해결. 정상 동작(실패 아님).
        if len(g.lines) < 3:
            why = "라인<3"
        elif len(g.lines) > LINE_CAP:
            why = f"라인 {len(g.lines)}>{LINE_CAP}"
        else:
            why = f"적합잔차 {resid:.3f}>{FIT_MAX} (비직교/스크리블)"
        ir = IR(unresolved=[f"폴리곤 미형성({why}, grade≈{grade}) — 관계만 수용(§5.3)"])
        return ir, meta
    vol = Volume(id=vol_id, footprint=[[round(x, 2), round(y, 2)] for x, y in verts],
                 base=0.0, height=None, height_src="unset", confidence=0.9)  # 무차원(§3.5)
    return IR(volumes=[vol]), meta


def main(argv):
    if len(argv) < 2:
        print("usage: python stage1/normalize.py <capture.json> [out_ir.json]"); return
    cap = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    ir, meta = normalize_to_ir(cap)
    errs = ir.validate()
    print("grade:", meta.get("grade"), "| lines:", meta.get("n_lines"),
          "| parseable:", meta.get("parseable"))
    print("IR errors:", errs)
    out = argv[2] if len(argv) > 2 else "stage1/out_ir.json"
    Path(ROOT / out).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / out).write_text(ir.to_json(indent=2), encoding="utf-8")
    print("->", out)


if __name__ == "__main__":
    main(sys.argv)
