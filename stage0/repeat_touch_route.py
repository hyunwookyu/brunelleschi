"""**`touch_route` dpr 2의 실패율을 원장에 남긴다**(2026-08-18 8차 2차 지시 항목 3).

## 왜 별도 드라이버인가

그 판정(`|az − dpr1_az| < 1e-6`)은 **실행마다 갈린다** — 7차가 "이 세션에서 통과한 실행도
실패한 실행도 있다"고 적었고, 지시문이 "base 커밋에서도 재현되는 **환경 밴드**다. 임계를
안 넓힌 판단이 맞다"고 했다. **그런데 그 빈도를 아무도 안 셌다**(`DEFERRED` 등재).

한 번의 Playwright 실행은 원장을 **덮어쓰므로** 분포가 안 남는다. 이 드라이버가 같은 스펙을
N회 돌리고 매 실행의 `dpr2.rotate` 값을 모아 `stage0/out/touch_route_repeat.json`에 쓴다.

## 이 원장이 말하지 않는 것

· **한 환경의 값이다**(#27 — 대역을 다른 환경에서 가져오지 않는다). 7차 컨테이너와
  이 Windows 머신은 **다른 밴드**일 수 있고, 그것이 바로 원 지적의 내용이었다.
· **코드 변경 전후 비교가 아니다** — 같은 커밋을 N회 돌린 것이다. "환경 밴드"라는 주장의
  근거는 **분산이 있다는 것**이지 원인이 환경이라는 것이 아니다(#32 — 원인은 안 갈랐다).
· 파일 전체를 돌린다(`-g`로 그것만 돌리면 dpr 1 팔이 없어 `test.skip`이 걸린다).
"""
import json, subprocess, sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "stage0" / "out"
LED = OUT / "touch_route.json"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 8
# **스펙의 판정 임계 그대로**(#17 — 새 임계를 만들지 않는다).
# ⚠⚠ 2026-08-18 **9차 항목 3**에서 스펙이 `1e-6` → **`1e-11`**로 바뀌었다(밴드 상단의 17.5배).
# 옛 값 `1e-6`은 이 기계 밴드(6.95e-14~5.72e-13)의 **175만 배**라 0/12로 아무것도 안 갈랐다.
# 여기 값이 스펙과 어긋나면 이 원장의 `within_tol`이 **스펙이 아닌 다른 판정**을 세게 된다.
TOL = 1e-11

rows = []
for i in range(N):
    r = subprocess.run(["npx", "playwright", "test", "e2e/touch_route.spec.ts"],
                       cwd=ROOT / "web", capture_output=True, text=True,
                       encoding="utf-8", errors="replace", shell=(os.name == "nt"))
    led = json.loads(LED.read_text(encoding="utf-8"))
    d = (led.get("dpr2") or {}).get("rotate") or {}
    az, one = d.get("azimuth_delta"), d.get("dpr1_azimuth_delta")
    diff = abs(az - one) if (az is not None and one is not None) else None
    rows.append({"run": i + 1, "azimuth_delta": az, "dpr1_azimuth_delta": one,
                 "abs_diff": diff, "within_tol": (diff is not None and diff < TOL),
                 "process_exit": r.returncode})
    print(f"  {i+1}/{N}  diff={diff}  exit={r.returncode}", flush=True)

diffs = [x["abs_diff"] for x in rows if x["abs_diff"] is not None]
fails = [x for x in rows if not x["within_tol"]]
diffs_s = sorted(diffs)
out = {
    # ⚠ 임계를 산문에 안 박는다(#47 — 16차 2차 리뷰어 [11]: 옛 판이 «< 1e-6»을 박아 뒀고
    # 9차의 임계 변경 뒤 원장 안에서 자기 threshold 필드와 여섯 자릿수 어긋났다)
    "what": "`touch_route` dpr 2 회전 판정(임계는 `threshold.az_tol_rad` — 스펙 그대로)을 "
            "같은 커밋에서 N회 돌려 **실패 빈도와 차의 분포**를 남긴다(8차 2차 지시 항목 3). "
            "7차가 '실행마다 갈린다'를 적고 **빈도를 안 남겼다**(DEFERRED).",
    "how": f"`npx playwright test e2e/touch_route.spec.ts`를 **{N}회** 돌리고 매 실행의 "
           f"`touch_route.json`의 `dpr2.rotate`를 읽는다. 파일 전체를 돌린다 — `-g`로 "
           f"dpr 2만 돌리면 dpr 1 팔이 없어 `test.skip`이 걸린다.",
    "threshold": {"az_tol_rad": TOL,
                  "source": "`touch_route.spec.ts`의 판정 그대로(#17 — 새 임계를 만들지 않는다)"},
    "runs": N,
    "fail_count": len(fails),
    "fail_rate": (len(fails) / N) if N else None,
    # **0이 무엇을 뜻하는지 갈라 적는다**(#40 ② — 그 자리의 0은 대개 보장이다. 여기서는
    # 측정이지만 **N이 작아 약하다**): 참 실패율이 10%여도 8회에서 0회일 확률이 43%다.
    "fail_rate_note": f"N={N}. **분자/분모로 읽는다** — 0/{N}은 '실패율 0'이 아니라 "
                      f"'{N}회에서 안 났다'이다(#14 · #38). 참 실패율 10%도 이 표본에서 "
                      f"0회일 확률이 상당하다.",
    # ⚠⚠ **여기가 이 원장의 실제 내용이다**: 옛 임계(정밀도 12 = 5e-13)로 세면 몇 번 실패하는가.
    # 현행 1e-6은 이 머신의 밴드에서 다섯 자리 밖이라 **판별력이 없다**(전부 통과).
    # 옛 임계는 **이 머신의 밴드 안**을 지나므로 그 수가 "실행마다 갈린다"의 크기를 잰다.
    # **여러 임계에서 함께 센다**(#12 — 동작점을 하나 고르지 않는다. 9차 항목 3에서 신설).
    # 옛 5e-13은 밴드 **안**을 지나 간헐 실패를 만들고, 옛 1e-6은 밴드의 175만 배라
    # **아무것도 안 가른다**. 현행 1e-11이 그 사이 어디인지가 이 표다.
    "by_tol": [
        {"tol": t, "fail": f"{sum(1 for x in diffs if x >= t)}/{len(diffs)}",
         "ratio_to_band_max": (t / max(diffs)) if diffs else None}
        for t in (5e-13, 1e-12, 5e-12, 1e-11, 1e-10, 1e-8, 1e-6)
    ],
    "by_tol_note": "**임계가 밴드의 몇 배인가**(`ratio_to_band_max`)가 이 표의 읽는 축이다. "
                   "1보다 작으면 밴드 안이라 간헐 실패가 나고, 수만 배 위면 아무것도 안 잰다. "
                   "분모는 **이번 실행의 max**(`abs_diff.max`) 하나다 — ⚠ 옛 판은 산문이 "
                   "8차 2차의 밴드로 딴 분모(17.5배)를 함께 박아 한 파일에 분모가 둘이었다"
                   "(#47 · 16차 2차 [11]). 현행 임계의 배수는 `by_tol`의 해당 행이 든다. "
                   "⚠ N이 작아 밴드 상단은 **과소추정**이다(#14).",
    "would_fail_at_old_tol_5e_13": {
        "tol": 5e-13,
        "count": sum(1 for x in diffs if x >= 5e-13),
        "denominator": len(diffs),
        "note": "옛 판정(`toBeCloseTo` 정밀도 12)의 임계다. **8차 2차 시점의 옛 임계 1e-6은 "
                "이 머신의 밴드(1e-13대)에서 다섯 자리 밖이라 아무것도 안 갈랐다** — 그때 0/N이 그래서 나왔다. "
                "갈리는 것을 보려면 옛 임계로 센다. 그 수가 0이 아니면 **'실행마다 갈린다'는 "
                "이 머신에서도 참이고, 갈리게 만든 것은 임계이지 코드가 아니다**(#24 — "
                "단위·임계를 바꾸는 것과 판정을 바꾸는 것은 다르다). "
                "⚠ **9차 항목 3이 스펙 임계를 1e-11로 내렸다** — 위 `by_tol`이 그 자리를 낸다.",
    },
    "abs_diff": {
        "min": (diffs_s[0] if diffs_s else None),
        "median": (diffs_s[len(diffs_s) // 2] if diffs_s else None),
        "max": (diffs_s[-1] if diffs_s else None),
        "note": "**분자/분모로 읽는다**(CLAUDE §5) — 실패 수 / 실행 수. "
                "N이 작으면 비율의 유효 자릿수가 1자리다(#14).",
    },
    "rows": rows,
    "what_this_does_not_say": [
        "**원인이 환경이라는 것을 안 잰다**(#32) — 이 원장이 내는 것은 **분산이 있다는 것**뿐이다. "
        "7차 컨테이너와 이 머신이 다른 밴드라는 주장은 **두 환경의 값을 나란히 놓아야** 서고, "
        "여기에는 한 환경의 값만 있다(#27).",
        "**코드 전후 비교가 아니다** — 같은 커밋을 N회 돌린 것이다.",
        "**임계를 넓히자는 근거가 아니다** — 지시문이 '임계를 안 넓힌 판단이 맞다. 그대로 둔다'고 "
        "명시했다. 이 원장은 **그 판단의 대가를 수치로 적는 것**이다(#26 — 판정을 사후에 안 바꾼다).",
        "**dpr 2의 다른 팔(양성 채널·팬)은 안 센다** — 갈리는 것은 회전 판정 하나다.",
        "**현행 임계(1e-6)로는 판별력이 0이다** — 이 머신의 차가 1e-13대라 다섯 자리 밖이다. "
        "그러므로 `fail_rate` 0은 '안정하다'가 아니라 **'이 임계가 이 밴드를 안 건드린다'**이다"
        "(#32 · #38 — 덮는 대상이 사실상 0인 판정). 정보를 가진 것은 `abs_diff` 분포와 "
        "`would_fail_at_old_tol_5e_13`이다.",
    ],
}
led = json.loads(LED.read_text(encoding="utf-8"))
out["constants"] = led.get("constants")        # STALE 탐지가 걸리도록 같은 스냅샷을 싣는다
(OUT / "touch_route_repeat.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n실패 {len(fails)}/{N} · abs_diff min {out['abs_diff']['min']} "
      f"중앙 {out['abs_diff']['median']} max {out['abs_diff']['max']}")
