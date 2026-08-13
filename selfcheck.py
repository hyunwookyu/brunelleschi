"""selfcheck.py — §13 자기검증 규칙 1 (의심스러운 수치 자동 점검).

각 단계 완료 시 실행. 멈추지 말고 원인 확인 후 progress.md에 보고한다.
플래그: 1e-10 미만 오차 / 정확히 1.0·0.0 비율 / 이전 대비 완전 불변 / 0 고정 카운터.

의심 ≠ 오류. 각 플래그는 원인(자기참조·무노이즈·측정범위·미작동)을 사람이 확인할 대상.
"""
from __future__ import annotations
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NEAR_ZERO = 1e-10
RATIO_KEYS = ("rate", "ratio", "f1", "iou", "precision", "recall", "coverage")
COUNT_KEYS = ("n_", "count", "_n", "crashes", "violations")


def _walk(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk(v, f"{path}[{i}]")
    else:
        yield path, obj


def _degenerate_distributions(obj, path="") -> list[dict]:
    """축약된 분포(모든 표본이 한 범주) 탐지 — V-5b 교훈.
    {"precise": 120} 같은 카운트 사전은 비율 키가 아니라 기존 규칙에 안 걸렸다.
    전 표본 단일 범주 = 측정이 변별하지 못하는 중(단위 불일치·자기참조) 신호."""
    flags = []
    if isinstance(obj, dict):
        vals = list(obj.values())
        if (len(obj) == 1 and vals and isinstance(vals[0], (int, float))
                and not isinstance(vals[0], bool) and vals[0] >= 10
                and all(isinstance(k, str) for k in obj)):
            flags.append({"path": path, "val": obj,
                          "flag": f"단일 범주 분포(n={vals[0]}) → 변별력 없음/단위 불일치 의심"})
        for k, v in obj.items():
            flags += _degenerate_distributions(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            flags += _degenerate_distributions(v, f"{path}[{i}]")
    return flags


def check(report: dict, prev: dict | None = None) -> list[dict]:
    flags = _degenerate_distributions(report)
    prev_flat = dict(_walk(prev)) if prev else {}
    for path, val in _walk(report):
        low = path.lower()
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            if 0 < abs(val) < NEAR_ZERO:
                flags.append({"path": path, "val": val,
                              "flag": "near-zero(<1e-10) → 무노이즈/자기참조 검증 의심"})
            if any(k in low for k in RATIO_KEYS) and val in (1.0, 0.0):
                flags.append({"path": path, "val": val,
                              "flag": f"정확히 {val} 비율 → 측정 대상/자기참조 확인"})
            if any(k in low for k in COUNT_KEYS) and val == 0 and "violation" not in low and "crash" not in low:
                flags.append({"path": path, "val": val,
                              "flag": "카운터 0 → 집계 로직 미작동 의심(또는 정상)"})
            if path in prev_flat and prev_flat[path] == val and isinstance(val, float):
                flags.append({"path": path, "val": val,
                              "flag": "이전 단계 대비 완전 불변 → 측정 범위 불일치 의심"})
    return flags


def rerun_determinism(cmds: list[str] | None = None) -> list[dict]:
    """§13 자기검증 4(B-0 d 추가) — **동일 입력 재실행 시 지표가 변하면 비결정 시드 의심**.

    실제로 걸렸던 결함: `np.random.default_rng(seed + hash(kind+grade) % 9999)`의
    `hash(str)`가 PYTHONHASHSEED 무작위화로 실행마다 달라, 같은 설정 재실행에
    2F IoU가 0.877↔0.885로 표류했다. 4자리 보고가 과잉 정밀이었던 원인.

    호출자는 (모듈, 함수, 인자)를 주고 두 번 실행해 결과가 같은지 본다.
    """
    import importlib, subprocess
    flags = []
    for cmd in (cmds or []):
        outs = []
        for _ in range(2):
            r = subprocess.run([sys.executable, "-c", cmd], capture_output=True, text=True)
            outs.append(r.stdout.strip())
        if outs[0] != outs[1]:
            flags.append({"path": cmd[:80], "val": None,
                          "flag": "재실행 결과 불일치 → 비결정 시드 의심(hash(str)/시각 의존)"})
    return flags


def scan_nondeterministic_seeds(root: Path) -> list[dict]:
    """소스에서 비결정 시드 패턴을 정적 탐지(B-0 d). hash(str)를 시드에 쓰면 안 된다."""
    import re
    pat = re.compile(r"default_rng\([^)]*hash\(|np\.random\.seed\([^)]*hash\(")
    flags = []
    for py in sorted(root.rglob("*.py")):
        if "__pycache__" in str(py) or py.name == "selfcheck.py":
            continue
        try:
            txt = py.read_text(encoding="utf-8")
        except Exception:
            continue
        for i, line in enumerate(txt.splitlines(), 1):
            if pat.search(line):
                flags.append({"path": f"{py.relative_to(root)}:{i}", "val": line.strip()[:80],
                              "flag": "시드에 hash(str) 사용 → PYTHONHASHSEED로 실행마다 달라짐. stable_seed로 교체"})
    return flags


def main():
    """stage0/out의 **모든 측정 산출물**을 스캔한다.
    V-5b 교훈: 구판은 score.json만 봤다. 마우스 노이즈 측정(parseable 1.0, 전 조건 precise)은
    vitest에만 있어 원장 밖 → 규칙이 있어도 걸릴 수 없었다. 측정은 원장에 남겨야 검증된다."""
    outdir = ROOT / "stage0" / "out"
    sp = outdir / "score.json"
    if not sp.exists():
        print("score.json 없음 — score.py 먼저 실행"); return
    prev_path = outdir / "score_prev.json"
    prev = json.loads(prev_path.read_text(encoding="utf-8")) if prev_path.exists() else None

    # 보존용 아카이브(폐기 기준선)는 스캔 대상이 아니다 — 살아있는 측정만 본다.
    skip = {"score_prev.json", "selfcheck.json", "score_baseline_deprecated.json"}
    flags = []
    for p in sorted(outdir.glob("*.json")):
        if p.name in skip:
            continue
        try:
            report = json.loads(p.read_text(encoding="utf-8"))
        except Exception as ex:
            flags.append({"path": p.name, "val": None, "flag": f"JSON 파싱 실패: {ex}"}); continue
        for f in check(report, prev if p.name == "score.json" else None):
            f["path"] = f"{p.name}:{f['path']}"
            flags.append(f)

    flags += scan_nondeterministic_seeds(ROOT)      # B-0 d: 비결정 시드 정적 탐지

    out = {"n_flags": len(flags), "flags": flags,
           "scanned": [p.name for p in sorted(outdir.glob("*.json")) if p.name not in skip],
           "note": "의심≠오류. 각 항목 원인 확인 후 progress.md 보고(§13 자기검증 1)."}
    (ROOT / "stage0" / "out" / "selfcheck.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"자기검증 플래그 {len(flags)}건:")
    for f in flags:
        print(f"  ⚠ {f['path']} = {f['val']}  — {f['flag']}")


if __name__ == "__main__":
    main()
