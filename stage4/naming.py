"""4단계 명명 — 볼륨에 라벨 결합 (§7 4단계, §3.7).

§3.7: 명명은 어휘 해석이 아니라 식별. 7문법(§3.6) 밖의 IR 조립 메타데이터로 다룬다
(기하 제약 아님). 명명 신호 = 발화의 실명 명사("이건 홀") + 그 시점 획 위치(deixis, §3.6 ±3초)
또는 초록 주석 채널 위치(§4.3). 위치→최근접 볼륨에 라벨 결합.

명명 텍스트는 발화에서, 대상 볼륨은 공간 근접에서. OCR 없음(§4.3).
"""
from __future__ import annotations
import re, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR

# 건축 실명 명사(§3.7 — 추상→건축 번역 불필요, 실명만)
NAMING_NOUNS = {
    "홀": "hall", "로비": "lobby", "코어": "core", "계단": "stair", "현관": "entrance",
    "입구": "entrance", "방": "room", "실": "room", "테라스": "terrace", "덱": "deck",
    "마당": "court", "복도": "corridor", "화장실": "toilet", "주방": "kitchen",
    "hall": "hall", "lobby": "lobby", "core": "core", "stair": "stair", "room": "room",
    "atrium": "atrium", "deck": "deck", "terrace": "terrace", "corridor": "corridor",
}


def _centroid(footprint) -> np.ndarray:
    return np.asarray(footprint, float).mean(0)


def extract_naming(segments: list[dict], stroke_ctx: dict | None = None) -> list[dict]:
    """명명 발화 추출 → [{label, pos|None, raw}]. pos = 발화 시점 획 위치(deixis)."""
    hints = []
    for seg in segments:
        text = seg.get("text", "")
        label = None
        for noun, canon in NAMING_NOUNS.items():
            if re.search(noun, text, re.I):
                label = canon; break
        if not label:
            continue
        pos = None
        if stroke_ctx:
            pts = stroke_ctx.get(round(seg.get("start", -1), 1)) or stroke_ctx.get(seg.get("start"))
            if pts:
                pos = list(np.asarray([p[:2] for p in pts], float).mean(0))
        hints.append({"label": label, "pos": pos, "raw": text})
    return hints


def assign_names(ir: IR, hints: list[dict]) -> IR:
    """힌트를 볼륨에 결합. 위치 있는 힌트 → 최근접 볼륨, 없는 힌트 → 순서대로 미명명 볼륨."""
    if not ir.volumes:
        return ir
    cents = [_centroid(v.footprint) for v in ir.volumes]
    used = set()
    # 1) 위치 기반: 최근접 볼륨(중복 방지)
    for h in [x for x in hints if x["pos"] is not None]:
        p = np.asarray(h["pos"], float)
        order = sorted(range(len(ir.volumes)), key=lambda i: np.hypot(*(cents[i] - p)))
        tgt = next((i for i in order if i not in used), None)
        if tgt is not None:
            ir.volumes[tgt].label = h["label"]; used.add(tgt)
    # 2) 위치 없는 힌트 → 남은 미명명 볼륨에 순서대로
    free = [i for i in range(len(ir.volumes)) if i not in used and not ir.volumes[i].label]
    for h, i in zip([x for x in hints if x["pos"] is None], free):
        ir.volumes[i].label = h["label"]; used.add(i)
    # 미명명 볼륨은 unresolved에 명명 대기로 남긴다(§3.7 미지정 식별)
    for v in ir.volumes:
        if not v.label:
            ir.unresolved.append(f"{v.id}: 명명 미정")
    return ir


def main(argv):
    import json
    if len(argv) < 2:
        print("usage: python stage4/naming.py <capture.json>"); return
    from stage4.multiplex import multiplex
    cap = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    ir, _ = multiplex(cap)
    segs = cap.get("_naming_utterances", [])
    hints = extract_naming(segs, cap.get("_stroke_ctx"))
    assign_names(ir, hints)
    for v in ir.volumes:
        print(f"  {v.id}: label={v.label!r}")
    print("unresolved:", ir.unresolved)


if __name__ == "__main__":
    main(sys.argv)
