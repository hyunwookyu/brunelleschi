# selfcheck의 정적 검사에 **반례를 건다**(S-10).
#
# 왜: S-9에서 `store.ts` 머리말에 "`Stroke.layer`는 담지 않는다"고 적었더니 **그 문장이
# 읽기 1건으로 잡혀 미사용 필드 플래그가 사라졌다.** 설명이 검사를 껐다 — 자기참조의 한 얼굴이다.
# 고친 뒤 "플래그가 되돌아왔다"만 확인했는데, 그것은 **줄 주석 하나만** 시험한 것이다.
# 블록 주석·JSDoc·URL을 함께 잠근다(리뷰어 지적).
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from selfcheck import strip_ts_comments  # noqa: E402


def test_line_comment_is_not_a_read():
    """S-9에서 실제로 걸린 형태 — 설명이 필드를 '읽는' 것으로 세면 안 된다."""
    assert ".layer" not in strip_ts_comments("// `Stroke.layer`는 담지 않는다\nconst a = 1;")


def test_block_comment_and_jsdoc_are_not_reads():
    """줄 주석만 지우면 JSDoc이 그대로 남는다 — 이 저장소는 설명을 JSDoc으로 쓴다."""
    assert ".layer" not in strip_ts_comments("/** `Stroke.layer`를 읽지 않는다 */\nconst a = 1;")
    assert ".layer" not in strip_ts_comments("/*\n * s.layer\n */\nconst a = 1;")


def test_url_is_not_treated_as_a_comment():
    """`://` 뒤를 주석으로 지우면 **그 줄의 코드가 통째로 사라져 읽기를 놓친다** — 더 위험한 방향이다."""
    out = strip_ts_comments('const u = "https://example.com"; const w = s.width;')
    assert ".width" in out


def test_code_after_a_real_line_comment_on_next_line_survives():
    assert ".axis" in strip_ts_comments("// 설명\nconst a = s.axis;")


def test_known_limit_string_literal_still_counts_as_a_read():
    """**알려진 한계**를 명시적으로 잠근다 — 문자열 안의 필드명은 여전히 읽기로 센다.

    고치려면 문자열 파싱이 필요하고(따옴표·템플릿·이스케이프), 그 복잡도는 지금 이득보다 크다.
    한계가 바뀌면 이 테스트가 깨져서 알려 준다.
    """
    assert ".layer" in strip_ts_comments('const msg = "s.layer";')
