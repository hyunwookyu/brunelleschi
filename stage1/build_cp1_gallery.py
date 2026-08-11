"""CP-1 오버레이 갤러리 — 1단계 결과 확인용(§12 개입지점 ②, §3.9).

3개 픽스처 오버레이 SVG를 한 페이지에 인라인 + 지표 + 판정을 붙인다.
사용자가 원본(회색) 위 복원(파선)을 눈으로 확인하고 tolerance를 판정한다.
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from stage1.overlay import run

CASES = [
    ("fixture_rect_precise", "직사각 평면 · precise 노이즈", "PASS 기대"),
    ("fixture_L_precise", "L형 평면 · precise 노이즈", "PASS 기대"),
    ("fixture_L_coarse", "L형 평면 · coarse 노이즈", "경계(관계만) 기대 — §5.3"),
]

def main():
    cards = []
    for stem, title, expect in CASES:
        cap_path = ROOT / "stage1" / (stem + ".json")
        ir, meta, svg = run(str(cap_path))
        svg_txt = Path(svg).read_text(encoding="utf-8")
        mis = meta.get("misalign_median")
        verdict = ("관계만(경계)" if not meta.get("parseable")
                   else ("PASS" if meta.get("within_baseline") else "CHECK"))
        cards.append(
            '<div class="card"><h3>%s</h3>'
            '<div class="meta">grade≈%s · 라인 %s · 어긋남(중앙값) %s · baseline %s · <b>%s</b><br>'
            '<span class="exp">%s</span></div>%s</div>'
            % (title, meta.get("grade"), meta.get("n_lines"), mis, meta.get("baseline"),
               verdict, expect, svg_txt))

    html = """<!doctype html><meta charset=utf-8><title>CP-1 1단계 오버레이</title>
<style>
body{font:14px system-ui;margin:0;padding:24px;background:#f6f6f6;color:#111}
h1{font-size:20px} h3{margin:0 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}
.card{background:#fff;border:1px solid #e2e2e2;border-radius:10px;padding:14px}
.card svg{width:100%;height:auto;border:1px solid #eee;border-radius:6px;margin-top:8px}
.meta{color:#444;font-size:12.5px} .exp{color:#999}
.note{background:#fff;border:1px solid #e2e2e2;border-radius:10px;padding:14px;margin-top:18px}
b{color:#0a7} code{background:#f0f0f0;padding:1px 4px;border-radius:4px}
</style>
<h1>1단계 오버레이 — 원본 스케치 위 복원 폴리곤 (§3.9)</h1>
<p>회색 = 원본 매스 획 · <b>파선</b> = 무차원 복원(앵커 없음, §3.5) · 빨강 = 정점.
어긋남 = 입력점의 복원 엣지까지 수직거리 중앙값 / bbox 대각. baseline = 등급별 직선편차 중앙값(CP-0.6).</p>
<div class="grid">GRID</div>
<div class="note">
<h3>확인 요청 (CP-1)</h3>
<ul>
<li>precise 등급은 클린 직교폴리곤 복원(라인 6, 어긋남 ~2%) &rarr; <b>PASS</b>.</li>
<li>coarse 등급은 폴리곤 미형성 &rarr; <code>관계만</code> 선언(§5.3 파싱 경계, 실패 아님).</li>
<li>알려진 흠: 단일 연속 획의 직교스냅 체인 오차가 폐곡선 마지막 정점에 누적(좌하단 드리프트). 실측 세션에서 tolerance 판정 필요.</li>
<li>등급 자동판정(register)은 합성 데이터에서 분리 안 됨 &rarr; 정보용으로만. 실측 다등급 세션으로 재보정 예정(§6.6).</li>
</ul>
</div>""".replace("GRID", "\n".join(cards))
    out = ROOT / "stage1" / "cp1_overlays.html"
    out.write_text(html, encoding="utf-8")
    print("->", out.relative_to(ROOT))

if __name__ == "__main__":
    main()
