"""발화 → IR 조각 번역 (§3.6). 세션 후 일괄 번역 — 실시간 파싱하지 않는다.

translate(ir, segments, llm=None):
  - llm 있으면: llm(prompt) -> list[dict] 그대로 common.grammar.parse_ops로 검증.
    프롬프트는 build_prompt()가 구성한다(§3.6: 현재 IR 전체 + 발화시점 ±3초 획 +
    직전 몇 턴). 이 경로가 §3.6 본 사양이다 — "조사·어미 사전을 만들지 않는다"는
    LLM이 어휘를 직접 읽는다는 뜻.
  - llm 없으면: 결정론적 규칙 기반 한국어/영어 패턴 매칭으로 대체한다. 이 환경에는
    보장된 LLM API 키가 없으므로 이 대체 경로가 실제로 테스트되는 부분이다(과제
    지시). 조사·어미 "사전"이 아니라 최소 키워드 매칭이며, §3.7 "note는 예외
    처리" 원칙대로 애매하면 note/unresolved로 떨어뜨리고 무리하게 추정하지 않는다.

출력은 어느 경로든 7-op 문법(§3.6)을 통과한 Op만 반환한다. 번역 결과는 발화별로
`"발화" → op(...)` 형태로 표시한다(§3.6 예시) — 틀린 줄만 나중에 고칠 수 있도록.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from typing import Any, Callable, Optional

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from ir.schema import IR
from common.grammar import Op, OPS, parse_ops, render_op

# ---- 규칙 경로 어휘 (최소 키워드 매칭, §3.7 "사전을 만들지 않는다"의 LLM 원칙을
# 대체 경로에서는 완전히 지킬 수 없다 — 최소한으로 제한하고 테스트로 정직성 확인) --

UNIT_SCALE = {  # → meter
    "m": 1.0, "meter": 1.0, "meters": 1.0, "metre": 1.0,
    "미터": 1.0,
    "cm": 0.01, "센티": 0.01, "센치": 0.01, "센티미터": 0.01,
    "mm": 0.001, "밀리": 0.001, "미리": 0.001, "밀리미터": 0.001,
}
# 숫자+단위. 영문 단위는 뒤에 단어경계(\b)가 필요하지만(공백/구두점으로 끊김),
# 한글 단위는 조사가 바로 붙으므로(예: "미터쯤","미터야") 경계를 요구하지 않는다.
NUM_UNIT_RE = re.compile(
    r'(\d+(?:\.\d+)?)\s*(?:'
    r'(mm|cm|meters?|metre|m)\b'
    r'|(밀리미터|밀리|미리|센티미터|센티|센치|미터)'
    r')', re.I)

PROP_WORDS = [  # (regex, prop) — 순서 무관(서로 겹치지 않음)
    (r'너비|가로\s*폭|폭|width', "width"),
    (r'안길이|세로\s*깊이|깊이|depth', "depth"),
    (r'층고|높이|height', "height"),
]
HEDGE_RE = re.compile(r'한\s|쯤|정도|about|around|roughly|approx', re.I)
MIN_RE = re.compile(r'최소|적어도|이상|least|minimum', re.I)
CORRECTION_RE = re.compile(r'아니[요야고라]?\b|말고|취소|정정|actually|i mean|no,\s|correction', re.I)
RELATE_PATTERNS = [  # (regex, RELATE_TYPES 값)
    (r'옆|붙[여이]|인접|next to|beside|adjacent', "adjacent"),
    (r'위에|위쪽|맨\s*위|above', "above"),
    (r'아래|밑|below|under', "below"),
    (r'안에|속에|inside', "inside"),
    (r'나란히|평행|parallel', "parallel"),
    (r'직각|수직|perpendicular|orthogonal', "orthogonal"),
    (r'맞춰|정렬|align', "aligned"),
]
DEIXIS_RE = re.compile(r'여기|이쪽|저기|요기|이거|그거|저거|here|there|this (?:part|spot)', re.I)
UNRESOLVED_NOUNS = [  # 지시어와 함께 오는 미지정 속성(§3.7 "개구부" 예)
    (r'개구부|창문?|문\b|opening|window|door', "opening"),
    (r'위치|자리|position|location', "position"),
    (r'크기|사이즈|size', "size"),
]


def _find_target(text: str, ir: IR) -> Optional[str]:
    """IR에 이미 있는 volume id가 문면에 그대로 등장하면 그것. 볼륨이 하나뿐이면
    그 하나로 귀속(세션 초기 1볼륨 상황 상정). 그 외엔 미확정."""
    for v in ir.volumes:
        if v.id and v.id in text:
            return v.id
    if len(ir.volumes) == 1:
        return ir.volumes[0].id
    return None


def _find_prop(text: str) -> Optional[str]:
    for pat, prop in PROP_WORDS:
        if re.search(pat, text, re.I):
            return prop
    return None


def _rule_op_for(text: str, ir: IR, state: dict) -> Optional[dict]:
    """발화 1개 → op dict 0/1개. state['last_target']로 대명사·정정 문맥을 세션
    내에서 이어간다(§3.6 "그것보다 조금 크게"류를 규칙으로는 완전히 못 풀지만
    직전 대상 최소한은 이어받는다)."""
    has_correction = bool(CORRECTION_RE.search(text))
    m = NUM_UNIT_RE.search(text)

    if has_correction and not m:                       # 값 재진술 없는 순수 정정 → 되돌림
        target = _find_target(text, ir) or state.get("last_target")
        return {"op": "retract", "target": target} if target else None

    if m:                                               # 치수 언급 (정정+재진술도 여기로)
        unit = (m.group(2) or m.group(3)).lower()
        val = float(m.group(1)) * UNIT_SCALE[unit]
        target = _find_target(text, ir) or state.get("last_target") or "unspecified"
        prop = _find_prop(text) or "width"
        state["last_target"] = target
        if MIN_RE.search(text):
            return {"op": "min", "id": target, "prop": prop, "value": round(val, 3)}
        if HEDGE_RE.search(text):
            return {"op": "range", "id": target, "prop": prop,
                    "min": round(val * 0.9, 3), "max": round(val * 1.1, 3)}
        return {"op": "set", "id": target, "prop": prop, "value": round(val, 3)}

    for pat, rtype in RELATE_PATTERNS:                  # 관계
        if re.search(pat, text, re.I):
            ids = [v.id for v in ir.volumes if v.id and v.id in text]
            if len(ids) >= 2:
                return {"op": "relate", "a": ids[0], "b": ids[1], "type": rtype}
            # 대상 하나뿐/미확정 — 관계는 확실하나 짝을 특정 못함 → 로그(note)만
            return {"op": "note", "id": ids[0] if ids else "unspecified",
                    "text": f"관계 언급, 대상 2개 미확정: {text.strip()}"}

    if DEIXIS_RE.search(text):                          # 지시어 → 미지정 항목 식별(§3.7)
        target = _find_target(text, ir) or "unspecified"
        for pat, prop in UNRESOLVED_NOUNS:
            if re.search(pat, text, re.I):
                return {"op": "unresolved", "id": target, "prop": prop}
        return {"op": "unresolved", "id": target, "prop": "unspecified"}

    return None                                          # 나머지(명명/의도 등)는 무시 — §6.3 상 82%가 'other'


def build_prompt(ir: IR, segments: list[dict], stroke_ctx: Optional[dict] = None) -> str:
    """§3.6 프롬프트 입력: 현재 IR 전체 + 발화시점 ±3초 획 + 직전 몇 턴. LLM 경로용."""
    return json.dumps({
        "ir": json.loads(ir.to_json()),
        "segments": segments,
        "stroke_context": stroke_ctx or {},
        "closed_vocab": list(OPS),
        "instruction": "각 발화를 7-op 문법으로만 번역해 JSON 객체 리스트로 답하라. "
                        "미지정 항목은 unresolved로 남기고 추정하지 마라(§3.7).",
    }, ensure_ascii=False)


def translate(ir: IR, segments: list[dict], llm: Optional[Callable[[str], list[dict]]] = None,
              stroke_ctx: Optional[dict] = None, verbose: bool = True) -> tuple[list[Op], list[str]]:
    """(current IR, transcript segments, optional llm) -> (검증된 Op 리스트, 에러 리스트).
    llm=None이면 규칙 기반 대체 경로(§3.6 "세션 후 일괄 번역" — segments 전체를 순서대로
    한 번에 처리, 실시간 아님)."""
    pairs: list[tuple[Optional[str], dict]] = []
    if llm is not None:
        raw = llm(build_prompt(ir, segments, stroke_ctx))
        pairs = [(None, d) for d in raw]
    else:
        state: dict[str, Any] = {}
        for seg in segments:
            text = seg.get("text", "")
            d = _rule_op_for(text, ir, state)
            if d:
                pairs.append((text, d))

    ops: list[Op] = []
    errs: list[str] = []
    for i, (text, d) in enumerate(pairs):
        o, e = parse_ops([d])
        if o:
            ops.extend(o)
            if verbose:
                label = f'"{text}"' if text is not None else "<llm>"
                print(f'{label}  →  {render_op(o[0])}')
        else:
            errs.extend(f"[{i}] {m}" for m in e)
            if verbose:
                label = f'"{text}"' if text is not None else "<llm>"
                print(f'{label}  →  REJECTED: {e}')
    return ops, errs


if __name__ == "__main__":
    ir = IR.from_dict(json.loads((ROOT / "stage1" / "out_ir_L.json").read_text(encoding="utf-8")))
    demo_segments = [
        {"text": "홀 폭이 한 12미터쯤 됩니다", "start": 12.4, "dur": 2.1},
        {"text": "높이는 최소 9미터는 되어야 해요", "start": 30.0, "dur": 2.3},
        {"text": "정확히 8미터로 깊이를 잡을게요", "start": 44.2, "dur": 2.0},
        {"text": "여기 개구부는 나중에 정할게요", "start": 61.0, "dur": 1.8},
        {"text": "아니, 그거 말고 다시 잴게요", "start": 70.5, "dur": 1.5},
        {"text": "이 방은 저 로비 옆에 붙여주세요", "start": 80.0, "dur": 2.0},
        {"text": "hall width is about 12 meters", "start": 95.0, "dur": 2.0},
    ]
    print(f"IR volumes: {[v.id for v in ir.volumes]}\n")
    ops, errs = translate(ir, demo_segments)
    print(f"\n{len(ops)} ops OK, {len(errs)} rejected.")
    if errs:
        print("errors:", errs)
