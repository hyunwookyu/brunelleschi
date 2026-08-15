# S-9 PWA 아이콘 PNG 생성 — `icon.svg`와 **같은 그림**을 래스터로 낸다.
#
# 왜 PNG가 필요한가: 홈 화면에 추가(iOS)는 `apple-touch-icon`을 보고 **SVG를 읽지 않는다**.
# 이 도구의 실사용 경로가 iPad이므로(README) SVG만으로는 아이콘이 안 뜬다.
#
# 왜 손으로 짜는가: 의존성을 늘리지 않기 위해서다(Pillow 없음). 필요한 것은
# 둥근 사각형 하나와 굵은 폴리라인 셋이고, 4배 과표본으로 계단을 없애면 충분하다.
# **결정론적이다** — 난수가 없으므로 같은 입력에 같은 바이트가 나온다(재현성 규칙).
#
#   python web/tools/make_icons.py   (산출은 web/public/)
import struct, zlib
from pathlib import Path

BG = (0x1A, 0x99, 0xAA)
FG = (0xFF, 0xFF, 0xFF)
VIEW = 192.0
RADIUS = 40.0
STROKE = 7.0
PATHS = [
    [(40, 128), (96, 148), (152, 118)],
    [(40, 128), (44, 74), (98, 56), (152, 70), (152, 118)],
    [(98, 56), (96, 148)],
]
SS = 4  # 과표본 배수


def _seg_dist(px, py, ax, ay, bx, by):
    ex, ey = bx - ax, by - ay
    L2 = ex * ex + ey * ey
    t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((px - ax) * ex + (py - ay) * ey) / L2))
    dx, dy = ax + ex * t - px, ay + ey * t - py
    return (dx * dx + dy * dy) ** 0.5


def _inside_round_rect(x, y, w, h, r):
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r or (r <= x <= w - r) or (r <= y <= h - r)


def render(size):
    """RGBA 픽셀. 알파는 둥근 사각형 밖에서 0이다(maskable에서도 모서리가 산다)."""
    n = size * SS
    s = size / VIEW
    half = STROKE * s / 2.0
    r = RADIUS * s
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    if not _inside_round_rect(x, y, size, size, r):
                        continue
                    col = BG
                    for path in PATHS:
                        hit = False
                        for i in range(1, len(path)):
                            ax, ay = path[i - 1][0] * s, path[i - 1][1] * s
                            bx, by = path[i][0] * s, path[i][1] * s
                            if _seg_dist(x, y, ax, ay, bx, by) <= half:
                                hit = True
                                break
                        if hit:
                            col = FG
                            break
                    acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += 255.0
            k = SS * SS
            row += bytes(int(round(v / k)) for v in acc)
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + r for r in rows)          # 필터 0(None)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    Path(path).write_bytes(png)
    return len(png)


if __name__ == "__main__":
    here = Path(__file__).parent.parent / "public"   # 산출은 public/ 에 둔다
    for size in (192, 512):
        n = write_png(here / f"icon-{size}.png", render(size), size)
        print(f"icon-{size}.png  {n} bytes")
