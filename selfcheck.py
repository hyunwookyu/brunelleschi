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
# **정확히 0인 오차**는 1e-11보다 더 의심스럽다(자기참조 유형 3). 그런데 near-zero 규칙은
# `0 < abs(val)`이라 **정확한 0을 그냥 지나쳤다** — L-B.1의 두 보장(seg_gap 0 · three_vs_project 0)이
# 원장에 0으로 남았는데 한 건도 안 걸렸다. 검사를 **강화한다**(PITFALLS #19는 약화만 금지한다).
# 보장이면 원장에 그렇게 적고 임계를 걸지 않는다 — 플래그는 "확인했다"의 자리다.
# `"dev_"`이지 `"_dev"`가 아니다 — `service_worker_in_dev`가 오차로 잡혔다(오탐).
ERROR_KEYS = ("gap", "err", "residual", "misfit", "deviation", "dev_", "offset_px", "identity")


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
    # `constants`·`metrics` 스냅샷은 **측정이 아니라 메타데이터**다 — 임계값이나 절단값 자체가
    # 0·1이면 값 규칙이 전부 걸린다(실제로 걸렸다). 대조는 `scan_stale_*`가 따로 한다.
    report = {k: v for k, v in report.items() if k not in ("constants", "metric_defs")}
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
            # **정확한 0**은 near-zero보다 강한 신호인데 위 조건이 놓친다(`0 < 0`이 거짓이다).
            #
            # ⚠ **`leaf`로 본다. `low`(전체 경로)로 보면 안 된다** — 첫 판이 그랬고
            # `…_err.n = 0`(표본 0)이 380건 중 367건을 차지해 **오차값이 아닌 것이 오차 플래그로**
            # 나왔다(리뷰어 지적 [4]). 부모 경로에 `err`가 있다고 자식이 오차인 것은 아니다.
            # 겹쳐 세지도 않는다 — `median`은 아래 규칙이 잡는다.
            if (val == 0 and leaf != STAT_MEDIAN and leaf != "n"
                    and any(k in leaf for k in ERROR_KEYS)):
                flags.append({"path": path, "val": val,
                              "flag": "오차류 지표가 **정확히 0** → 설계 보장인지 확인"
                                      "(보장이면 원장에 그렇게 적고 임계를 걸지 않는다)"})
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
        # `constants.json`·`metrics.json`은 **기준 자체**다 — 자기를 대조하지 않는다.
        if name in ("constants.json", "metrics.json"):
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


def scan_stale_metrics(outdir: Path, reports: dict[str, dict]) -> list[dict]:
    """**정의 낡음 탐지** — 지표를 재는 *식*이 바뀌었는데 안 다시 돌린 산출물을 잡는다.

    `scan_stale_constants`가 못 잡는 종류다. L-B.7에서 상수는 같은 채
    형태 오차의 식만 갈렸고(게이지 유무), 같은 2416획이 `axis_live.json` 0.1222 ·
    `promote.json` 0.1533으로 나왔다. **두 원장을 나란히 읽은 문서가 잘못된 비교를 했고
    STALE은 아무것도 안 짚었다** — 잡을 대상이 상수가 아니었기 때문이다.

    `metrics.json`(현재 정의)과 각 산출물의 `metrics` 스냅샷을 대조한다.
    다르면 **STALE(정의)** — 어느 지표 함수가 다른지 함께 낸다.
    """
    cur_path = outdir / "metrics.json"
    if not cur_path.exists():
        return [{"path": "metrics.json", "val": None,
                 "flag": "현재 지표 정의 스냅샷이 없다 → `npx vitest run test/metrics.test.ts`"}]
    cur = json.loads(cur_path.read_text(encoding="utf-8"))
    flags = []
    if cur.get("source") != "file":
        flags.append({"path": "metrics.json", "val": cur.get("source"),
                      "flag": "기준 정의 스냅샷이 소스에서 안 왔다 → 대조가 무의미하다"})
    for name, rep in sorted(reports.items()):
        if name in ("metrics.json", "constants.json"):
            continue
        snap = rep.get("metric_defs")
        if not isinstance(snap, dict) or "hash" not in snap:
            flags.append({"path": name, "val": None,
                          "flag": "지표 정의 스냅샷 없음 → 낡았는지 판정 불가. "
                                  "하네스에 metric_defs: metricsSnapshot()을 넣는다"})
            continue
        if snap.get("hash") == cur.get("hash"):
            continue
        old_names, cur_names = set(snap.get("names", [])), set(cur.get("names", []))
        diff = sorted((old_names - cur_names) | (cur_names - old_names))
        flags.append({"path": f"{name}@{snap.get('hash')}",
                      "val": ("지표 목록이 다르다: " + ", ".join(diff[:6])) if diff
                             else "(목록은 같다 — 식이나 절단값이 바뀌었다. `git diff web/test/metrics.ts`)",
                      "flag": f"**STALE(정의)** — 현재 지표 정의({cur.get('hash')})와 다른 식으로 "
                              f"측정됐다. 다시 돌리고 이 산출물을 인용한 문서를 전부 고친다"})
    return flags


SCANNED_FIELDS: list[dict] = []
SWEEP_SCANNED: list[dict] = []
COVERAGE: list[dict] = []


def _cover(scan: str, unit: str, targets: int, hits: int, note: str = "") -> list[dict]:
    """**검사가 실제로 덮은 대상 수**를 남기고, 0이면 플래그한다(PITFALLS #32·#35).

    실제로 걸린 것: `scan_gate_reachability`가 원장 39개를 훑고도 **`gate`라는 이름의
    블록이 하나도 없어** 덮는 대상이 0이었다. 플래그 0건이 나왔고 그것이
    **깨끗함으로 읽혔다.** 0건이 "깨끗함"인지 "안 돎"인지 가르는 것은 오직 **덮은 수**다.

    ⚠ 덮는 수가 0일 때 고칠 곳은 **검사가 아니라 기록하는 쪽**이다 —
    하네스가 그 이름으로 적게 한다. 검사의 이름 목록을 넓혀 0을 지우면 #19다
    (설명이 검사를 끄는 것과 같은 방향).
    """
    COVERAGE.append({"scan": scan, "unit": unit, "targets": targets, "hits": hits,
                     "note": note or None})
    if targets:
        return []
    return [{"path": f"selfcheck:{scan}", "val": f"덮는 대상 0 ({unit})",
             "flag": f"**이 검사가 덮는 대상이 0이다** — 단위: {unit}(#32). 플래그 0건이 "
                     f"깨끗함이 아니라 **안 돎**이다. 기록하는 쪽(하네스)이 그 이름으로 적게 고친다"}]


def strip_ts_comments(t: str) -> str:
    """TS 소스에서 주석을 지운다 — `scan_unread_fields`가 **설명을 읽기로 세지 않도록**.

    `://`(URL)는 주석으로 보지 않는다. 아니면 그 줄의 뒷부분이 통째로 사라져 **읽기를 놓친다**
    — 놓치는 쪽이 더 위험하다(플래그가 조용히 사라진다).
    **문자열 리터럴 안의 `.field`는 여전히 읽기로 센다** — 알려진 한계이고 반례 테스트에 적었다.
    """
    import re as _re
    t = _re.sub(r"/\*.*?\*/", " ", t, flags=_re.S)      # 블록 주석·JSDoc
    return _re.sub(r"(?<!:)//[^\n]*", " ", t)           # 줄 주석(`://`는 URL이다)


def scan_unread_fields(root: Path) -> list[dict]:
    """**쓰기만 하고 읽지 않는 필드**를 잡는다(S-8c). 배선 누락의 세 번째 얼굴이다.

    같은 유형이 세 번 나왔다: (1) 4.3 옵션이 앱에서 안 켜짐 (2) 하네스가 앱 옵션을 따로 적음
    (3) **Stroke.color를 아무도 안 읽음** — S-7이 미확정을 그 필드에 적었는데 화면은 축 색만
    그렸다. 앞의 둘은 appPlace.ts + wiring.test.ts가 잡고, 이것이 셋째다.

    판정은 거칠다 — `x.field =`(쓰기)는 있는데 그 밖의 `.field` 등장이 없으면 안 읽는 것이다.
    **의심이지 오류가 아니다**(다른 규칙과 같다).

    **주석은 세지 않는다**(S-9에서 걸렸다). 저장 코드에 "`Stroke.layer`는 담지 않는다"고
    적었더니 그 **문장이 읽기 1건으로 잡혀 플래그가 사라졌다** — 설명이 검사를 껐다.
    자기참조의 한 형태이므로 주석을 지우고 센다. 문자열 안의 `//`(URL)는 앞 글자가 `:`이면
    주석으로 보지 않는다 — 아니면 그 줄의 뒷부분이 통째로 사라져 **읽기를 놓친다**.
    """
    import re as _re
    SCANNED_FIELDS.clear()          # **훑은 필드를 남긴다** — 0건이 "깨끗함"인지 "안 돌았음"인지 갈린다
    src = root / "web" / "src"
    stroke = src / "s3d" / "stroke.ts"
    if not stroke.exists():
        return []
    lines = stroke.read_text(encoding="utf-8").splitlines()
    fields, inside = [], False
    for ln in lines:                       # 인터페이스 블록을 줄 단위로 읽는다(정규식 없이)
        if ln.startswith("export interface Stroke {"):
            inside = True
            continue
        if inside:
            if ln.startswith("}"):
                break
            m = _re.match(r"  (\w+)\??:", ln)
            if m:
                fields.append(m.group(1))
    bodies = [strip_ts_comments(f.read_text(encoding="utf-8")) for f in sorted(src.rglob("*.ts"))]
    flags = []
    for name in fields:
        writes = reads = 0
        for body in bodies:
            for mm in _re.finditer("[.]" + _re.escape(name) + "(?![A-Za-z0-9_])", body):
                tail = body[mm.end():mm.end() + 4]
                if _re.match(r"\s*=(?![=>])", tail):
                    writes += 1
                else:
                    reads += 1
        SCANNED_FIELDS.append({"field": name, "writes": writes, "reads": reads})
        if not reads:            # 읽는 곳이 없다 — 써넣기만 하거나 아예 안 쓰거나
            flags.append({"path": "web/src/s3d/stroke.ts:Stroke." + name,
                          "val": "쓰기 %d · 읽기 0" % writes,
                          "flag": "**쓰기만 하고 읽지 않는 필드** → 배선 누락 의심 "
                                  "(Stroke.color가 실제로 그랬다, S-8c)"})
    return flags


def scan_sweep_coverage(root: Path) -> list[dict]:
    """**전수 훑기가 확장자를 다 덮는지**(PITFALLS #33 자동화, 2026-08-16).

    실제로 걸린 것: 인용 점검을 `.md`만 훑어 **하네스 주석의 인용**을 놓쳤다.
    같은 유형으로 지표 정의 점검이 함수 호출만 찾아 인라인 식을 놓쳤다(`axis_live`).

    `sweeps.json`이 훑기마다 `pattern`·`roots`·`exts`를 선언하고, 여기서 **선언한 확장자
    밖에서도 그 패턴이 나오는지** 본다. 나오면 그 훑기는 덜 덮은 것이다.
    **의심이지 오류가 아니다** — 일부러 뺀 확장자면 `exclude`에 적거나 `exts`에 넣는다.
    """
    import re
    spec_path = root / "sweeps.json"
    if not spec_path.exists():
        return [{"path": "sweeps.json", "val": None,
                 "flag": "전수 훑기 선언 파일이 없다 → #33 자동 검사가 **안 돈다**"}]
    try:
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
    except Exception as ex:
        return [{"path": "sweeps.json", "val": None, "flag": f"파싱 실패: {ex}"}]

    flags = []
    SWEEP_SCANNED.clear()
    for sw in spec.get("sweeps", []):
        pat = re.compile(sw["pattern"])
        exts = set(sw.get("exts", []))
        excl = sw.get("exclude", [])
        found: dict[str, int] = {}
        n_files = 0
        for rt in sw.get("roots", ["."]):
            base = root / rt
            if not base.exists():
                continue
            for f in base.rglob("*"):
                if not f.is_file():
                    continue
                rel = str(f.relative_to(root)).replace("\\", "/")
                if any(x in rel for x in excl):
                    continue
                if f.suffix not in (".md", ".ts", ".py", ".json", ".html", ".js"):
                    continue
                try:
                    txt = f.read_text(encoding="utf-8")
                except Exception:
                    continue
                if f.suffix in exts:
                    n_files += 1
                if pat.search(txt):
                    found[f.suffix] = found.get(f.suffix, 0) + 1
        missing = {k: v for k, v in found.items() if k not in exts}
        SWEEP_SCANNED.append({"sweep": sw["name"], "files_scanned": n_files,
                              "exts_declared": sorted(exts), "hits_by_ext": found})
        if missing:
            flags.append({
                "path": f"sweeps.json:{sw['name']}",
                "val": ", ".join(f"{k}({v})" for k, v in sorted(missing.items())),
                "flag": "**선언 밖 확장자에서 같은 패턴이 나온다** → 그 훑기가 덜 덮었다(#33). "
                        "`exts`에 넣거나 `exclude`로 이유를 밝힌다",
            })
        if not n_files:
            flags.append({"path": f"sweeps.json:{sw['name']}", "val": 0,
                          "flag": "훑은 파일이 0 → 훑기가 **안 돌았다**(경로·확장자 확인)"})
        elif not found:
            # **파일은 훑었는데 패턴이 한 번도 안 맞았다** — 덮는 수는 0이 아닌데
            # 대조한 것이 0이다. #38이 잡는 "덮는 수 0"의 **다음 단계**이고 #40의 형태다.
            flags.append({"path": f"sweeps.json:{sw['name']}", "val": f"파일 {n_files} · 일치 0",
                          "flag": "**패턴이 한 번도 안 맞았다**(#40) — 파일은 훑었는데 대조한 것이 "
                                  "0이다. 훑기가 **공허하다**: 패턴이 낡았는지 본다"})
    # 훑기별 0은 위에서 잡는다. 여기서는 **훑기 자체가 하나도 없는 경우**를 잡는다.
    flags += _cover("scan_sweep_coverage", "훑기", len(SWEEP_SCANNED), len(flags),
                    note="훑기별 파일 수는 `sweeps[]`에 있다")
    return flags



def scan_citation_hashes(root: Path, reports: dict[str, dict]) -> list[dict]:
    """**인용한 해시가 그 원장의 현재 해시와 맞는가**(PITFALLS #33의 값 대조, 2026-08-16).

    `ledger_citation` 훑기는 **확장자 커버리지만** 봤다 — `산출물.json@해시` 꼴이 어느 확장자에
    나오는지는 세면서 **그 해시가 맞는지는 안 봤다.** 그래서 상수 해시가 `46c028d1 → 2fd74e1c`로
    옮길 때 그 문자열만 62곳 고쳤고, **다른 옛 해시(`1671e540`·`0803f3fe`·`272b5143`)로 적힌
    25곳이 그대로 남았다.** 같은 원장을 두 문서가 다른 해시로 인용하는 상태였다.

    ⚠ **해시만 고치면 안 된다.** 해시가 다르다는 것은 그 원장이 **다른 상수로 다시 돌았다**는
    뜻이고, 그러면 인용한 **수치 자체**가 바뀌었을 수 있다. 이 플래그는 "해시를 고쳐라"가 아니라
    **"그 수치를 원장에서 다시 읽어라"**다(CLAUDE.md §5).

    `tests/`와 `docs/archive/`는 뺀다 — 반례 픽스처의 가짜 해시와 폐기 문서의 옛 인용이다.
    """
    import re
    pat = re.compile(r"([A-Za-z_0-9]+\.json)@([0-9a-f]{8})")
    cur = {name: (rep.get("constants") or {}).get("hash")
           for name, rep in reports.items()
           if isinstance(rep.get("constants"), dict)}
    flags, n_cites = [], 0
    unresolved: list[str] = []
    SKIP = ("node_modules", "docs/archive", "stage0/out", "__pycache__", "dist",
            "test-results", "tests/", "tests\\")
    for f in sorted(root.rglob("*")):
        if not f.is_file() or f.suffix not in (".md", ".ts", ".py"):
            continue
        rel = str(f.relative_to(root)).replace("\\", "/")
        if any(x in rel for x in SKIP):
            continue
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        for i, line in enumerate(txt.splitlines(), 1):
            for name, h in pat.findall(line):
                if name not in cur or not cur[name]:
                    # **조용히 건너뛰면 안 된다**(#40) — 없는 원장을 인용하면 값 대조가
                    # 통째로 안 일어나고, 그것이 "인용이 깨끗하다"로 읽힌다.
                    unresolved.append(f"{rel}:{i} {name}")
                    continue
                n_cites += 1
                if h != cur[name]:
                    flags.append({
                        "path": f"{rel}:{i}", "val": f"{name}@{h} ≠ 현재 {cur[name]}",
                        "flag": "**인용 해시가 원장의 현재 해시와 다르다**(#33 값 대조) → 그 원장은 "
                                "다른 상수로 다시 돌았다. **해시만 고치지 말고 수치를 원장에서 "
                                "다시 읽는다**(CLAUDE.md §5)",
                    })
    if unresolved:
        flags.append({"path": "scan_citation_hashes", "val": unresolved[:5],
                      "flag": f"**없는 원장을 인용한다**({len(unresolved)}건, #40) — 그 인용은 "
                              f"값 대조를 **한 번도 안 지난다**. 원장 이름이 낡았거나 오타다"})
    flags += _cover("scan_citation_hashes", "인용", n_cites, len(flags),
                    note=f"`tests/`·`docs/archive/`는 뺀다. 안 풀린 인용 {len(unresolved)}건")
    return flags



def _resolve(root, dotted: str):
    """원장 안 경로(`a/b/c`)를 따라간다. 못 가면 `KeyError`.

    ⚠ **구분자가 `/`다.** 점을 쓰면 `deg_0.25`처럼 **키 이름에 점이 든 것**을 못 가른다 —
    이 저장소의 스윕 키가 실제로 그렇다(`deg_0.25` · `jitter_0.005` · `r2px.45`).
    """
    node = root
    for part in dotted.replace("]", "").replace("[", "/").split("/"):
        if part == "":
            continue
        if isinstance(node, list):
            node = node[int(part)]
        elif isinstance(node, dict):
            if part not in node:
                raise KeyError(dotted)
            node = node[part]
        else:
            raise KeyError(dotted)
    return node


def _gate_value_checks(node: dict, fname: str, path: str, report: dict) -> list[dict]:
    """**도달 가능성이 산문뿐이거나 자명한 값인지 본다**(PITFALLS #40, 2026-08-16 사람 지시).

    실제로 걸린 것: `#35` 검사를 만든 **같은 세션**이 그 필드를 **정보량 0인 항등**으로 채웠다
    (`horizon` 초판의 "참 카메라에서 오차 0"). `camera_gate`는 "`deg_0` 행이 **정의상** 1.0배"라
    적었는데 그 행이 **대역의 출처 자체**다. 둘 다 필드가 비지 않았으므로 검사를 통과했다 —
    **검사를 만들면서 검사를 무력화한 것**이다.

    그래서 산문 대신 **수치 + 출처**를 요구하고 셋을 본다:
      ① 산문뿐인가(`reachability_value`도 `reachability_absent`도 없다)
      ② 값이 **정확히 0 또는 1**인가 — 그 자리의 0/1은 대개 측정이 아니라 **보장**이다(#5)
      ③ `reachability_source`가 이 원장에서 실제로 그 값을 가리키는가(**값 대조**, #33)
    """
    out = []
    keys = {k.lower() for k in node}
    here = f"{fname}:{path}"
    if not ({"reachability", "oracle", "도달"} & keys):
        return out                       # 위에서 이미 플래그했다
    has_val = "reachability_value" in node
    if not has_val and not str(node.get("reachability_absent", "")).strip():
        out.append({"path": here, "val": "산문뿐",
                    "flag": "**도달 가능성이 산문뿐이다**(#40) — `reachability_value` + "
                            "`reachability_source`를 적거나, 오라클이 없으면 "
                            "`reachability_absent`에 그 사실을 적는다. 산문만 두면 "
                            "**항등·자명한 값을 적고도 통과한다**(실제로 그랬다)"})
        return out
    if not has_val:
        return out                       # 오라클 없음을 명시했다 — 그것이 결론이다
    vals = node["reachability_value"]
    vals = vals if isinstance(vals, list) else [vals]
    trivial = [v for v in vals if isinstance(v, (int, float)) and v in (0, 1)]
    if trivial:
        out.append({"path": f"{here}.reachability_value", "val": vals,
                    "flag": "**도달 가능성 값이 정확히 0 또는 1이다**(#40) — 그 자리의 0/1은 "
                            "대개 측정이 아니라 **설계 보장**이다(#5). 항등을 도달 가능성으로 "
                            "쓰면 정보량이 0이다. 다른 팔의 수치를 적는다"})
    src = node.get("reachability_source")
    if src:
        try:
            got = _resolve(report, str(src))
        except Exception:
            out.append({"path": f"{here}.reachability_source", "val": src,
                        "flag": "**출처 경로가 이 원장에서 안 풀린다**(#40) — 값 대조를 못 한다"})
        else:
            gl = got if isinstance(got, list) else [got]
            if [round(x, 6) if isinstance(x, (int, float)) else x for x in gl] !=                [round(x, 6) if isinstance(x, (int, float)) else x for x in vals]:
                out.append({"path": f"{here}.reachability_value", "val": f"적은 값 {vals} ≠ 원장 {gl}",
                            "flag": "**도달 가능성 값이 원장과 다르다**(#40·#33 값 대조) — "
                                    "재측정 뒤 손으로 적은 수치를 안 고친 것이다"})
    return out


def scan_gate_reachability(reports: dict[str, dict]) -> list[dict]:
    """**게이트를 등록할 때 도달 가능성을 함께 박는다**(PITFALLS #35 자동화, 2026-08-16).

    L-C.3이 그 반대 방향으로 실패했다 — 기준(판별력 0.5)을 측정 전에 박긴 했는데
    **그 픽스처에서 도달 가능한지 모르는 채**였다. 기준을 못 넘은 것이 신호의 성질인지
    기준의 성질인지 갈리지 않았다.

    원장에 `gate`(또는 `gates`) 블록이 있으면 **`reachability`가 있어야 한다** — 무엇이 그
    기준을 넘을 수 있는가(오라클 팔·대리 참값·이론 상한). ⚠ 없다고 기준을 낮추지 않는다.
    적기만 한다(#26의 반대편 문을 열지 않는다).
    """
    flags = []
    seen: list[str] = []                 # **덮은 게이트 블록**(0이면 검사가 안 도는 것이다)
    # ⚠ **면제와 검증을 갈라 센다**(리뷰어 지적) — `reachability_absent`는 값 대조를
    # **지난 것이 아니라 면제된 것**이다. 합쳐 세면 "일곱 전부 통과"로 읽힌다(#38·#32).
    verified: list[str] = []
    exempt: list[str] = []
    def walk(node, path, fname):
        if isinstance(node, dict):
            keys = {k.lower() for k in node}
            # **키 이름이 게이트일 때만** 본다. `threshold`가 든 통계 블록까지 세면
            # 97건이 떠서 검사가 소음이 된다(고쳤다) — 우는 검사는 아무도 안 읽는다.
            leaf = path.lower().split(".")[-1].split("[")[0]
            looks_gate = leaf in ("gate", "gates", "게이트", "criterion", "criteria")
            if looks_gate and isinstance(node, dict):
                seen.append(f"{fname}:{path}")
                if not ({"reachability", "oracle", "도달"} & keys):
                    flags.append({"path": f"{fname}:{path}", "val": sorted(keys)[:6],
                                  "flag": "**게이트에 `reachability`가 없다**(#35) — 무엇이 이 기준을 "
                                          "넘을 수 있는지 함께 적는다. ⚠ 없다고 기준을 낮추지 않는다"})
                flags.extend(_gate_value_checks(node, fname, path, reports.get(fname) or {}))
                if "reachability_value" in node:
                    verified.append(f"{fname}:{path}")
                elif str(node.get("reachability_absent", "")).strip():
                    exempt.append(f"{fname}:{path}")
            for k, v in node.items():
                walk(v, f"{path}.{k}" if path else k, fname)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]", fname)
    for fname, rep in reports.items():
        walk(rep, "", fname)
    flags += _cover("scan_gate_reachability", "게이트 블록", len(seen), len(flags),
                    note=f"값 대조를 **지난 것 {len(verified)}** · **면제 {len(exempt)}**"
                         f"(`reachability_absent`) · 원장 {len(reports)}개 훑음. "
                         f"⚠ 면제는 통과가 아니다 — 그 게이트의 도달 가능성은 **미상**이고 "
                         f"근거로 쓰지 않는다. 검증: {', '.join(verified) or '없음'} / "
                         f"면제: {', '.join(exempt) or '없음'}")
    return flags



def scan_zero_denominator(root: Path) -> list[dict]:
    """**분모 0을 1로 바꾸는 나눗셈**을 정적 탐지한다(PITFALLS #36 자동화, 2026-08-16).

    `분자 / Math.max(1, 분모)`는 **없는 관측을 만든다** — L-C.3의 `bestOf`가 빈 층에
    판별력 −0.03과 1을 냈다. 표시용 보호와 관측 생성을 가른다: 관측이면 `rate()`가
    `null`을 내야 한다(`web/test/metrics.ts`).

    **원장을 쓰는 하네스만 본다** — 화면 코드의 나눗셈 보호는 대상이 아니다.
    """
    import re
    pat = re.compile(r"/\s*Math\.max\(\s*1\s*,")
    flags = []
    n_targets = 0                         # **훑은 하네스 수**(0이면 거름이 깨진 것이다)
    base = root / "web" / "test"
    if not base.exists():
        flags += _cover("scan_zero_denominator", "하네스 파일", 0, 0, note="web/test 없음")
        return flags
    for f in sorted(base.rglob("*.ts")):
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        if "stage0" not in txt and "writeFileSync" not in txt:
            continue                      # 원장을 안 쓰는 파일은 대상이 아니다
        n_targets += 1
        hits = [i for i, line in enumerate(txt.splitlines(), 1) if pat.search(line)]
        if hits:
            # **파일당 한 건으로 묶는다.** 70건을 그대로 내면 검사가 소음이 되고
            # 아무도 안 읽는다(#35 자동화에서 같은 실수를 했다).
            flags.append({"path": f"{f.relative_to(root)}", "val": f"{len(hits)}건 (줄 {hits[:5]})",
                          "flag": "**분모 0이 1로 바뀐다**(#36) → 관측이면 `metrics.rate()`로 "
                                  "`null`을 낸다. 표시용 보호면 그렇게 적는다"})
    flags += _cover("scan_zero_denominator", "하네스 파일", n_targets, len(flags),
                    note="원장을 쓰는 `web/test/**.ts`만 본다")
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

    COVERAGE.clear()                                   # **덮은 대상 수**를 이번 실행 것만 남긴다
    stale = scan_stale_constants(outdir, reports)      # 하류 재측정 누락 (재발 유형 자동 탐지)
    flags += stale
    stale_m = scan_stale_metrics(outdir, reports)      # **정의** 낡음 (상수 스냅샷이 못 잡는 종류)
    flags += stale_m
    unread = scan_unread_fields(ROOT)                  # 쓰기만 하고 안 읽는 필드 (배선 누락, S-8c)
    flags += unread

    flags += scan_nondeterministic_seeds(ROOT)      # B-0 d: 비결정 시드 정적 탐지
    flags += scan_roundtrip_metrics(ROOT)          # 자기참조 3: 복원↔역연산 왕복 지표
    flags += scan_sweep_coverage(ROOT)             # #33 자동화: 전수 훑기의 확장자 커버리지
    flags += scan_citation_hashes(ROOT, reports)   # #33 값 대조: 인용 해시 ↔ 원장 현재 해시
    flags += scan_gate_reachability(reports)       # #35 자동화: 게이트에 도달 가능성 필드
    flags += scan_zero_denominator(ROOT)           # #36 자동화: 분모 0을 1로 바꾸는 나눗셈

    out = {"n_flags": len(flags), "flags": flags,
           "n_stale": sum(1 for f in stale if "STALE" in f["flag"]),
           "n_stale_metrics": sum(1 for f in stale_m if "STALE" in f["flag"]),
           "n_unread_fields": len(unread),
           "field_reads": SCANNED_FIELDS,
           "sweeps": SWEEP_SCANNED,
           # **각 자동 검사가 덮은 대상 수.** 0이면 위 flags에 함께 뜬다 —
           # 플래그 0건이 "깨끗함"인지 "안 돎"인지 가르는 것은 이 수뿐이다(#32).
           "coverage": COVERAGE,
           "constants_hash": (reports.get("constants.json") or {}).get("hash"),
           "metrics_hash": (reports.get("metrics.json") or {}).get("hash"),
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
    # **덮는 대상 수를 함께 낸다** — 0건이 깨끗함인지 안 돎인지는 이것으로만 갈린다(#32).
    print("자동 검사가 덮는 대상:")
    for c in COVERAGE:
        print(f"  · {c['scan']}: {c['unit']} {c['targets']}개 · 플래그 {c['hits']}건")


if __name__ == "__main__":
    main()
