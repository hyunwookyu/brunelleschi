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
    return flags



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
    def walk(node, path, fname):
        if isinstance(node, dict):
            keys = {k.lower() for k in node}
            # **키 이름이 게이트일 때만** 본다. `threshold`가 든 통계 블록까지 세면
            # 97건이 떠서 검사가 소음이 된다(고쳤다) — 우는 검사는 아무도 안 읽는다.
            leaf = path.lower().split(".")[-1].split("[")[0]
            looks_gate = leaf in ("gate", "gates", "게이트", "criterion", "criteria")
            if looks_gate and isinstance(node, dict):
                if not ({"reachability", "oracle", "도달"} & keys):
                    flags.append({"path": f"{fname}:{path}", "val": sorted(keys)[:6],
                                  "flag": "**게이트에 `reachability`가 없다**(#35) — 무엇이 이 기준을 "
                                          "넘을 수 있는지 함께 적는다. ⚠ 없다고 기준을 낮추지 않는다"})
            for k, v in node.items():
                walk(v, f"{path}.{k}" if path else k, fname)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]", fname)
    for fname, rep in reports.items():
        walk(rep, "", fname)
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
    base = root / "web" / "test"
    if not base.exists():
        return flags
    for f in sorted(base.rglob("*.ts")):
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        if "stage0" not in txt and "writeFileSync" not in txt:
            continue                      # 원장을 안 쓰는 파일은 대상이 아니다
        hits = [i for i, line in enumerate(txt.splitlines(), 1) if pat.search(line)]
        if hits:
            # **파일당 한 건으로 묶는다.** 70건을 그대로 내면 검사가 소음이 되고
            # 아무도 안 읽는다(#35 자동화에서 같은 실수를 했다).
            flags.append({"path": f"{f.relative_to(root)}", "val": f"{len(hits)}건 (줄 {hits[:5]})",
                          "flag": "**분모 0이 1로 바뀐다**(#36) → 관측이면 `metrics.rate()`로 "
                                  "`null`을 낸다. 표시용 보호면 그렇게 적는다"})
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
    stale_m = scan_stale_metrics(outdir, reports)      # **정의** 낡음 (상수 스냅샷이 못 잡는 종류)
    flags += stale_m
    unread = scan_unread_fields(ROOT)                  # 쓰기만 하고 안 읽는 필드 (배선 누락, S-8c)
    flags += unread

    flags += scan_nondeterministic_seeds(ROOT)      # B-0 d: 비결정 시드 정적 탐지
    flags += scan_roundtrip_metrics(ROOT)          # 자기참조 3: 복원↔역연산 왕복 지표
    flags += scan_sweep_coverage(ROOT)             # #33 자동화: 전수 훑기의 확장자 커버리지
    flags += scan_gate_reachability(reports)       # #35 자동화: 게이트에 도달 가능성 필드
    flags += scan_zero_denominator(ROOT)           # #36 자동화: 분모 0을 1로 바꾸는 나눗셈

    out = {"n_flags": len(flags), "flags": flags,
           "n_stale": sum(1 for f in stale if "STALE" in f["flag"]),
           "n_stale_metrics": sum(1 for f in stale_m if "STALE" in f["flag"]),
           "n_unread_fields": len(unread),
           "field_reads": SCANNED_FIELDS,
           "sweeps": SWEEP_SCANNED,
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


if __name__ == "__main__":
    main()
