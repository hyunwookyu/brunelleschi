"""selfcheck.py — §13 자기검증 규칙 1 (의심스러운 수치 자동 점검).

각 단계 완료 시 실행. 멈추지 말고 원인 확인 후 progress.md에 보고한다.
플래그: 1e-10 미만 오차 / 정확히 1.0·0.0 비율 / 이전 대비 완전 불변 / 0 고정 카운터 /
분포 전체가 한 값 / **복원↔역연산 왕복 지표**(자기참조 유형 3) /
**STALE 산출물**(공유 상수가 바뀌었는데 다시 안 돌린 것 — 하류 재측정 누락).

의심 ≠ 오류. 각 플래그는 원인(자기참조·무노이즈·측정범위·미작동)을 사람이 확인할 대상.
"""
from __future__ import annotations
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NEAR_ZERO = 1e-10
RATIO_KEYS = ("rate", "ratio", "f1", "iou", "precision", "recall", "coverage")
# 통계 요약 블록의 **대표값이 정확히 0·1**이거나 **분포 전체가 한 값**이면 같은 의심 대상이다.
# **키 이름 규칙이 놓친 실제 사례**(S-3): `identity_check_px`(전 표본 0 = 항등)와
# `rotated_difference.screen`(미리보기 평면과 같은 평면이라 항등)이 둘 다 안 걸렸다.
# DEFERRED "selfcheck가 정확히 1.0을 못 잡는다"가 이 규칙을 요구하고 있었다.
#
# **꼬리(min·p10)는 개별로 보지 않는다** — 반올림된 작은 값이 0으로 찍히는 것뿐이라
# 그것까지 세면 신호가 잡음에 묻힌다(넓힌 첫 판에서 89 → 345건으로 터졌다).
STAT_MEDIAN = "median"
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


def _constant_stats(obj, path="") -> list[dict]:
    """요약 통계 블록의 **분포 전체가 한 값(0 또는 1)** 인 경우 — 사실상 항등이다."""
    flags = []
    if isinstance(obj, dict):
        lo, hi = obj.get("min"), obj.get("max")
        if lo is not None and lo == hi and lo in (0.0, 1.0) and obj.get("n"):
            flags.append({"path": path, "val": lo,
                          "flag": f"분포 전체가 {lo}(n={obj['n']}) → 항등/측정 미작동 확인"})
        for k, v in obj.items():
            flags += _constant_stats(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            flags += _constant_stats(v, f"{path}[{i}]")
    return flags


def check(report: dict, prev: dict | None = None) -> list[dict]:
    # `constants` 스냅샷은 **측정이 아니라 메타데이터**다 — 임계값 자체가 0·1이면
    # 값 규칙이 전부 걸린다(실제로 걸렸다). 대조는 `scan_stale_constants`가 따로 한다.
    report = {k: v for k, v in report.items() if k != "constants"}
    flags = _degenerate_distributions(report) + _constant_stats(report)
    prev_flat = dict(_walk(prev)) if prev else {}
    for path, val in _walk(report):
        low = path.lower()
        leaf = path.rsplit(".", 1)[-1].lower()
        # 분포의 꼬리(min·p10·p90·max)는 개별로 보지 않는다. `*_ratio.min = 0`은 반올림의 산물이지
        # 자기참조가 아니다 — 이걸 세면 신호가 잡음에 묻힌다(실제로 89 → 345건이 됐다).
        # 항등은 `_constant_stats`(분포 전체가 한 값)와 median 규칙이 잡는다.
        if leaf in ("min", "p10", "p90", "max"):
            continue
        if isinstance(val, (int, float)) and not isinstance(val, bool):
            if 0 < abs(val) < NEAR_ZERO:
                flags.append({"path": path, "val": val,
                              "flag": "near-zero(<1e-10) → 무노이즈/자기참조 검증 의심"})
            if any(k in low for k in RATIO_KEYS) and val in (1.0, 0.0):
                flags.append({"path": path, "val": val,
                              "flag": f"정확히 {val} 비율 → 측정 대상/자기참조 확인"})
            elif path.rsplit(".", 1)[-1].lower() == STAT_MEDIAN and val in (1.0, 0.0):
                flags.append({"path": path, "val": val,
                              "flag": f"통계 대표값이 정확히 {val} → 항등/자기참조 확인"})
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


# 자기참조 유형 3 — **복원한 값을 그 복원에 쓴 연산으로 되검사하는 것**.
# 유형 1(무노이즈 잔차)·2(노이즈 모델의 성질을 재기)에 이어 세 번째다.
# 실제 사례: S-3의 "재투영 화면 좌표차" — 각 점을 자기 광선 위에 놓고 나서 그 광선으로
# 다시 투영해 차이를 쟀다. 0이 나올 수밖에 없다(설계 보장이지 측정이 아니다).
# 같은 유형: 3D→2D 투영으로 복원한 점을 다시 투영, 호모그래피로 편 것을 그 호모그래피로 검사,
# 최소제곱 적합의 잔차를 그 적합의 성능이라 부르기.
# 지표 이름과, 그 지표가 스스로 수행하면 자기참조가 되는 연산.
METRIC_WORDS = ("gap", "err", "error", "diff", "residual", "mismatch", "fidelity", "roundtrip")
TRANSFORM_CALLS = ("project(", "rayplane(", "raythrough(", "unproject(", "backproject(",
                   "homography(", "warp(", "inverse(")


def scan_roundtrip_metrics(root: Path) -> list[dict]:
    """**복원한 값을 그 복원에 쓴 연산으로 되검사하는 지표**를 정적 탐지한다(자기참조 유형 3).

    실제 사례: S-3의 `reprojectionGap` — 각 점을 자기 광선 위에 놓고 나서 **그 광선으로 다시
    투영해** 차이를 쟀다. 0이 나올 수밖에 없다. 그 자체는 설계 보장이라 유용하지만,
    **게이트로 쓰면 원리적으로 발동하지 않는다**(D-S6이 실제로 그렇게 걸렸다).

    탐지 규칙: 함수 이름이 오차·차이류인데 **본문이 스스로 변환을 수행**하면 의심한다.
    의심 ≠ 오류다. 사람이 "이것은 보장인가 측정인가"를 판정해 원장에 적고,
    보장이면 그 지표에 임계를 걸지 않는다.
    """
    import re
    flags = []
    fn_head = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?(?:function|def)\s+(\w+)"
                         r"|^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:\(|function)")
    for src in sorted(list(root.rglob("*.ts")) + list(root.rglob("*.py"))):
        sp = str(src).replace("\\", "/")
        if "node_modules" in sp or "__pycache__" in sp or src.name == "selfcheck.py":
            continue
        try:
            lines = src.read_text(encoding="utf-8").splitlines()
        except Exception:
            continue
        cur, ln, buf = None, 0, []

        def flush(name, at, body):
            if not name or not any(w in name.lower() for w in METRIC_WORDS):
                return
            low = " ".join(body).lower().replace(" ", "")
            hit = [c for c in TRANSFORM_CALLS if c in low]
            if hit:
                flags.append({"path": f"{src.relative_to(root)}:{at}:{name}", "val": ",".join(hit),
                              "flag": "오차 지표가 스스로 변환을 수행한다 → 설계 보장을 측정으로 "
                                      "오인하는지 확인(자기참조 3). 보장이면 임계를 걸지 않는다"})

        for i, line in enumerate(lines, 1):
            m = fn_head.match(line)
            if m:
                flush(cur, ln, buf)
                cur, ln, buf = (m.group(1) or m.group(2)), i, []
            elif cur:
                buf.append(line)
        flush(cur, ln, buf)
    return flags


def _flatten(obj, path="") -> dict:
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(_flatten(v, f"{path}.{k}" if path else k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.update(_flatten(v, f"{path}[{i}]"))
    else:
        out[path] = obj
    return out


def scan_stale_constants(outdir: Path, reports: dict[str, dict]) -> list[dict]:
    """**하류 재측정 누락 탐지** — 공유 상수가 바뀌었는데 안 다시 돌린 산출물을 잡는다.

    같은 유형이 세 번 재발했다: `hash(str)` 비결정 시드(Track 2 전체),
    등급 centroid 단위 혼동(마우스 판정), **`AXIS_TOL` 기본값 변경(S-2b의 b → S-3 측정)**.
    셋 다 "공유 상수가 바뀌면 그것에 의존하는 측정이 낡는다"는 하나의 원인이고,
    사람이 기억해서 잡을 수 있는 종류가 아니다.

    `constants.json`(현재 값)과 각 산출물의 `constants` 스냅샷을 대조한다.
    다르면 **STALE** — 그 산출물도, 그것을 인용한 문서도 낡았다.
    """
    cur_path = outdir / "constants.json"
    if not cur_path.exists():
        return [{"path": "constants.json", "val": None,
                 "flag": "현재 상수 스냅샷이 없다 → `npx vitest run test/constants.test.ts`"}]
    cur = json.loads(cur_path.read_text(encoding="utf-8"))
    cur_flat = _flatten(cur.get("values", {}))
    flags = []
    for name, rep in sorted(reports.items()):
        if name == "constants.json":
            continue
        snap = rep.get("constants")
        if not isinstance(snap, dict) or "hash" not in snap:
            flags.append({"path": name, "val": None,
                          "flag": "상수 스냅샷 없음 → 낡았는지 판정 불가. 하네스에 constantsSnapshot()을 넣는다"})
            continue
        if snap.get("hash") == cur.get("hash"):
            continue
        diff = []
        old = _flatten(snap.get("values", {}))
        for k in sorted(set(old) | set(cur_flat)):
            if old.get(k) != cur_flat.get(k):
                diff.append(f"{k}: {old.get(k)} → {cur_flat.get(k)}")
        flags.append({"path": f"{name}@{snap.get('hash')}", "val": "; ".join(diff[:6]) or "(값 동일, 해시만 다름)",
                      "flag": f"**STALE** — 현재 상수({cur.get('hash')})와 다른 상수로 측정됐다. "
                              f"다시 돌리고 이 산출물을 인용한 문서를 전부 고친다"})
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
    prev_path = outdir / "score_prev.json"
    prev = json.loads(prev_path.read_text(encoding="utf-8")) if prev_path.exists() else None

    # 보존용 아카이브(폐기 접근의 측정 기록, `archive_pre_W/`)는 하위 디렉토리라 glob에 안 걸린다.
    # 살아있는 측정만 본다 — W 전환 이후 산출물.
    skip = {"score_prev.json", "selfcheck.json", "score_baseline_deprecated.json"}
    flags = []
    reports: dict[str, dict] = {}
    for p in sorted(outdir.glob("*.json")):
        if p.name in skip:
            continue
        try:
            report = json.loads(p.read_text(encoding="utf-8"))
        except Exception as ex:
            flags.append({"path": p.name, "val": None, "flag": f"JSON 파싱 실패: {ex}"}); continue
        reports[p.name] = report
        for f in check(report, prev if p.name == "score.json" else None):
            f["path"] = f"{p.name}:{f['path']}"
            flags.append(f)

    stale = scan_stale_constants(outdir, reports)      # 하류 재측정 누락 (재발 유형 자동 탐지)
    flags += stale

    flags += scan_nondeterministic_seeds(ROOT)      # B-0 d: 비결정 시드 정적 탐지
    flags += scan_roundtrip_metrics(ROOT)          # 자기참조 3: 복원↔역연산 왕복 지표

    out = {"n_flags": len(flags), "flags": flags,
           "n_stale": sum(1 for f in stale if "STALE" in f["flag"]),
           "constants_hash": (reports.get("constants.json") or {}).get("hash"),
           "scanned": [p.name for p in sorted(outdir.glob("*.json")) if p.name not in skip],
           "note": "의심≠오류. 각 항목 원인 확인 후 progress.md 보고(§13 자기검증 1)."}
    (ROOT / "stage0" / "out" / "selfcheck.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    try:                                    # 콘솔 코드페이지가 cp949여도 죽지 않게
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print(f"자기검증 플래그 {len(flags)}건 (스캔 {len(out['scanned'])}개 산출물):")
    for f in flags:
        print(f"  ! {f['path']} = {f['val']}  - {f['flag']}")


if __name__ == "__main__":
    main()
