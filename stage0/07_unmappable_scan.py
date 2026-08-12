"""unmappable 집계 실증 — 라벨러 작동 확인 + 승격 상태 보고 (§13, CP-0.5).

파이프라인이 실제로 내는 unresolved/notes를 원장에 모아, '승격 0건'이
라벨러 미작동이 아니라 실집계 결과임을 보인다. 반복 미매핑이 ≥3회면 승격 후보로 뜬다.

출력: ir/unmappable_ledger.json + stage0/out/unmappable_report.json
"""
from __future__ import annotations
import json, sys, importlib.util
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.unmappable import Ledger
from ir.schema import IR
from stage1.normalize import normalize_to_ir
from stage2.translate import translate
from stage2.anchor import apply_ops

_mf = importlib.util.spec_from_file_location("mf", ROOT / "stage1" / "make_fixture.py")
mf = importlib.util.module_from_spec(_mf); _mf.loader.exec_module(mf)

# 실제 발화 예시(§3.7 지시어·관계 다수 — deixis 6.2%가 최다 의미범주)
UTTERANCES = [
    "여기 개구부는 나중에 정할게요",
    "이쪽에도 개구부 하나 둡시다",
    "저기 개구부 위치는 미정입니다",
    "이 방은 저 로비 옆에 붙여주세요",
    "덱은 홀 위에 얹습니다",
    "요 계단은 나중에",
]


def _scribble(seed):
    """파싱 불가 스크리블(§5.3 경계) — 무작위 워크. polygon_unformed 유발용."""
    r = np.random.default_rng(seed)
    p = np.cumsum(r.normal(0, 8, (60, 2)), axis=0) + (200, 200)
    pts = [[float(x), float(y), float(i), 0.5] for i, (x, y) in enumerate(p)]
    return {"frame": "scribble", "w": 640, "h": 520,
            "strokes": [{"points": pts, "pen": "mass", "frame": "scribble"}]}


def main():
    led = Ledger(); led.counts.clear()
    recorded = 0

    # 1) 정규화 경계: 스크리블 → polygon_unformed (§5.3). coarse는 paleo가 파싱함(개선).
    for seed in range(4):
        ir, meta = normalize_to_ir(_scribble(seed))
        if not meta.get("parseable"):
            recorded += led.ingest_ir(ir)

    # 2) 발화 번역 → 각 op을 세션 발생으로 집계(§13 '집계'=발생 횟수, IR내 dedup 아님)
    base, _ = normalize_to_ir(mf.make("rect", "precise", seed=0))
    segs = [{"text": u, "start": float(i), "dur": 1.0} for i, u in enumerate(UTTERANCES)]
    ops, _errs = translate(base, segs, llm=None, verbose=False)
    for op in ops:
        if op.op == "unresolved":
            led.record(op.args.get("prop", "unspecified")); recorded += 1
        elif op.op == "note":
            led.record("relation"); recorded += 1
    apply_ops(base, ops)

    led.save()
    rep = led.report()
    rep["recorded_this_run"] = recorded
    (ROOT / "stage0" / "out" / "unmappable_report.json").write_text(
        json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(rep, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
