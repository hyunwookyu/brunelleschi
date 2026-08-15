# L-B.1 — **정확히 0인 오차**를 잡는 규칙에 반례를 건다(A-4: 새 지표엔 반례 테스트).
#
# 왜: `near-zero` 규칙이 `0 < abs(val) < 1e-10`이라 **정확한 0을 그냥 지나쳤다.**
# 1e-11은 걸리고 0은 안 걸린다 — 의심의 방향과 반대다. L-B.1의 두 보장이
# 원장에 0으로 남았는데 한 건도 안 걸린 것이 그 증거다.
#
# 반례가 확인하는 것 셋:
#   ① 규칙이 실제로 발화하는가 (버그를 되살려 잡히는지 — PITFALLS #21의 규칙)
#   ② 오차류가 아닌 0(카운터·좌표 등)까지 쓸어 담지 않는가
#   ③ `median`을 이중으로 세지 않는가 (겹쳐 세면 신호가 잡음에 묻힌다)
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from selfcheck import check  # noqa: E402

EXACT_ZERO = "정확히 0**"


def _flags(report):
    return [f for f in check(report) if EXACT_ZERO in f["flag"]]


def test_exact_zero_error_is_flagged():
    """L-B.1이 실제로 낸 형태 — 보장을 원장에 0으로 적으면 확인이 강제된다."""
    got = _flags({"guarantees": {"seg_gap_px_max": 0}})
    assert len(got) == 1
    assert got[0]["path"] == "guarantees.seg_gap_px_max"


def test_tiny_but_nonzero_still_flagged_by_near_zero():
    """기존 규칙이 죽지 않았는지 — 강화가 무언가를 끄면 안 된다(PITFALLS #19)."""
    got = [f for f in check({"a": {"seg_gap_px_max": 1e-11}}) if "near-zero" in f["flag"]]
    assert len(got) == 1


def test_non_error_zero_is_not_swept_in():
    """오차류가 아닌 0까지 잡으면 1783건이 수천 건이 되고 신호가 묻힌다."""
    assert _flags({"a": {"placed_strokes": 0, "origin_x": 0, "seed": 0}}) == []


def test_median_is_not_double_counted():
    """`median = 0`은 기존 규칙이 이미 잡는다 — 두 번 세지 않는다."""
    rep = {"a": {"axis_dir_err_deg": {"median": 0}}}
    assert _flags(rep) == []
    assert any("통계 대표값" in f["flag"] for f in check(rep))


def test_distribution_tails_are_not_counted():
    """꼬리(min·p10·p90·max)는 반올림의 산물이라 개별로 보지 않는다 — 기존 규약 그대로."""
    assert _flags({"a": {"err_px": {"min": 0, "p10": 0, "p90": 0, "max": 0}}}) == []


def test_parent_path_error_word_does_not_leak_to_children():
    """전체 경로로 보면 `…_err.n = 0`(표본 0)이 오차 0으로 잡힌다 — 380건 중 367건이 그랬다."""
    assert _flags({"a": {"f_rel_err": {"n": 0, "median": 0.3}}}) == []


def test_dev_suffix_is_not_an_error_metric():
    """`service_worker_in_dev = 0`이 오차로 잡혔다 — `dev`는 접미사일 때 오차가 아니다."""
    assert _flags({"a": {"service_worker_in_dev": 0}}) == []
    assert len(_flags({"a": {"max_dev_ratio_px": 0}})) == 1
