"""6단계 질의 루프 본체 — 분기 영향도 기반 질의 선택 (§7 6단계, §1).

핵심(§1): 시스템이 채운 값 중 사용자가 뒤집은 비율을 낮춘다. 무엇을 물을지는
**분기 영향도**로 결정한다 — 미결정 항목을 두 값으로 각각 풀어 산출물 차이를 계산
(결정론적). 차이가 크면 가정이 결과를 크게 바꾸므로 묻는다. 작으면 조용히 채운다.

실세션 불필요(분기 영향도는 결정론적). 실사용이 필요한 것은 임계 하나
("차이가 얼마 이상일 때 물을 것인가")뿐 → 잠정값 ASK_THRESHOLD, §14 로깅 조정 대상.
"""
from __future__ import annotations
import sys, copy
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR

ASK_THRESHOLD = 0.15   # 잠정(§8 공란): 산출물 상대변화 ≥15%면 질의. §14 로깅 튜닝 대상.


def _poly_area(fp) -> float:
    p = np.asarray(fp, float)
    if len(p) < 3:
        return 0.0
    x, y = p[:, 0], p[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def _diag(ir) -> float:
    if not ir.volumes:
        return 1.0
    allp = np.concatenate([np.asarray(v.footprint, float) for v in ir.volumes])
    return float(np.hypot(*(allp.max(0) - allp.min(0)))) or 1.0


def output_signature(ir: IR) -> float:
    """결정론적 산출물 스칼라 = 총 부피 proxy(절대 면적×높이). diag 정규화 안 함
    (스케일 스윙이 산출물을 실제로 바꾸도록 — 앵커 없으면 절대치수 미결정, §3.3).
    높이 미정=특성길이(√면적) 대체."""
    tot = 0.0
    for v in ir.volumes:
        area = _poly_area(v.footprint)
        ref = area ** 0.5
        h = v.height if v.height is not None else ref
        tot += area * h
    for o in ir.openings:                     # 개구부 = 벽 뚫림(음의 기여)
        if o.w and o.h:
            tot -= o.w * o.h * 0.1
    return tot


def shape_signature(ir: IR) -> float:
    """형태 서명 — 세계 X방향 폭의 합. **90° 축 뒤바뀜에 민감**하다.
    부피 서명(output_signature)은 면적×높이라 축이 뒤바뀌어도 불변이므로 축 라벨 모호를
    영향도 0으로 보는 맹점이 있었다(지시 1-ter B에서 발견. plane_iou 둔감성과 같은 종류)."""
    tot = 0.0
    for v in ir.volumes:
        xs = [p[0] for p in v.footprint]
        tot += (max(xs) - min(xs)) if xs else 0.0
    return tot


def candidates(ir: IR) -> list[dict]:
    """미결정 항목 + 두 후보값(lo/hi). 분기 영향도 계산 대상."""
    items = []
    if not ir.anchors and ir.volumes:          # 앵커 없음 → 전체 스케일 미결정(§3.3)
        items.append({"kind": "scale", "target": "(global)", "lo": 0.5, "hi": 2.0,
                      "question": "전체 절대 치수(앵커) — 예: 홀 폭 몇 m?"})
    for v in ir.volumes:
        if v.height is None:                   # 무차원 높이(§3.5)
            items.append({"kind": "height", "target": v.id, "lo": 0.4, "hi": 1.6,
                          "question": f"{v.label or v.id} 높이?"})
    for v in ir.volumes:
        # 축 라벨 모호(지시 1-ter B): 투시 복원은 폭/깊이를 역수까지만 정한다.
        # 기하가 결정 못 하므로 추정 금지 → 질의 대상. lo/hi = 원해/뒤바꾼 해.
        if isinstance(v.axis, dict) and v.axis.get("ambiguous"):
            items.append({"kind": "axis", "target": v.id, "lo": 0.0, "hi": 1.0,
                          "question": f"{v.label or v.id}: 폭과 깊이 중 어느 쪽이 긴 변입니까?"})
    for i, o in enumerate(ir.openings):
        for prop in o.unresolved_props():      # 개구부 pos/w/h 미정(§3.7)
            lo, hi = (0.1, 0.9) if prop == "pos" else (0.05, 0.25)
            items.append({"kind": f"opening_{prop}", "target": o.target, "idx": i,
                          "lo": lo, "hi": hi, "question": f"{o.target} {o.type} {prop}?"})
    return items


def _apply(ir: IR, item: dict, val: float) -> IR:
    j = copy.deepcopy(ir)
    if item["kind"] == "scale":
        for v in j.volumes:
            v.footprint = [[x * val, y * val] for x, y in v.footprint]
    elif item["kind"] == "height":
        for v in j.volumes:
            if v.id == item["target"]:
                v.height = val * (_poly_area(v.footprint) ** 0.5)  # 특성길이 배수
    elif item["kind"] == "axis":
        # hi(=1.0)면 축을 뒤바꾼 해(footprint x/y 교환), lo(=0.0)면 그대로.
        if val >= 0.5:
            for v in j.volumes:
                if v.id == item["target"]:
                    v.footprint = [[y, x] for x, y in v.footprint]
    elif item["kind"].startswith("opening_"):
        prop = item["kind"].split("_", 1)[1]
        setattr(j.openings[item["idx"]], prop, val)
    return j


def branch_impact(ir: IR, item: dict) -> float:
    """항목을 lo/hi로 풀어 산출물 상대차. 결정론적.
    **부피 서명과 형태 서명 중 큰 쪽**을 쓴다 — 부피만 보면 축 뒤바뀜(면적 불변)을
    영향도 0으로 놓치기 때문이다(지시 1-ter B)."""
    lo_ir = _apply(ir, item, item["lo"])
    hi_ir = _apply(ir, item, item["hi"])
    mid_ir = _apply(ir, item, 0.5 * (item["lo"] + item["hi"]))
    out = 0.0
    for sig in (output_signature, shape_signature):
        slo, shi, smid = sig(lo_ir), sig(hi_ir), sig(mid_ir)
        out = max(out, abs(shi - slo) / (abs(smid) + 1e-9))
    return out


def plan_queries(ir: IR, threshold: float = ASK_THRESHOLD) -> dict:
    """미결정 항목을 분기 영향도로 랭크. 임계 이상만 질의, 미만은 조용히 채움(§1)."""
    items = candidates(ir)
    scored = []
    for it in items:
        imp = branch_impact(ir, it)
        scored.append({**{k: it[k] for k in it if k not in ("lo", "hi")},
                       "impact": round(float(imp), 4), "ask": bool(imp >= threshold)})
    scored.sort(key=lambda x: -x["impact"])
    return {"threshold": threshold, "n_unresolved": len(items),
            "n_to_ask": sum(1 for s in scored if s["ask"]),
            "queries": scored,
            "note": "impact = 두 값 산출물 상대차(결정론적). ask=impact≥임계. "
                    "임계는 잠정(§8) — §14 로깅으로 '뒤집힌 비율' 보고 튜닝."}


def main(argv):
    import json
    from stage4.multiplex import multiplex
    from stage4.naming import extract_naming, assign_names
    from ir.schema import Opening
    if len(argv) >= 2:
        cap = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        ir, _ = multiplex(cap)
        assign_names(ir, extract_naming(cap.get("_naming_utterances", []), cap.get("_stroke_ctx")))
    else:
        ir, _ = multiplex(json.loads((ROOT / "stage4" / "fixture_multi_0.json").read_text(encoding="utf-8")))
    # 미정 개구부 하나 부착(데모)
    if ir.volumes:
        ir.openings.append(Opening(target=ir.volumes[0].id, type="window"))
    plan = plan_queries(ir)
    print(f"미결정 {plan['n_unresolved']}건 중 질의 {plan['n_to_ask']}건 (임계 {plan['threshold']}):")
    for q in plan["queries"]:
        mark = "❓물음" if q["ask"] else "· 조용히채움"
        print(f"  [{q['impact']:.3f}] {mark}  {q['kind']}/{q['target']}: {q.get('question','')}")


if __name__ == "__main__":
    main(sys.argv)
