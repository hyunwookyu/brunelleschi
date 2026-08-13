"""프레임 차분 획 추출 2G — 영상 프레임 → 스트로크 (지시서 트랙2 2G).

plan §6이 자막 접근으로 폐기했던 영상 획추출을 투시 기하 때문에 부활.
알고리즘 핵심은 합성 프레임으로 검증 가능(실 영상/ffmpeg 불필요) — 여기서 확정.

프레임차분: 새 잉크 = 직전 프레임 대비 어두워진 픽셀. 프레임순=획순(seq).
연결요소 → 주축 정렬 → 스트로크. 실 영상은 download(format-18) → cv2 프레임 → 여기로.

주의: 실 영상 다운로드는 yt-dlp + (권장)ffmpeg 필요. 본 모듈의 extract_from_frames는
프레임 배열만 받으므로 합성·실 공통. download는 별도(collect.py 배선).
"""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def new_ink_mask(prev: np.ndarray, cur: np.ndarray, thresh=30) -> np.ndarray:
    """직전 대비 어두워진(잉크 추가) 픽셀. grayscale 입력."""
    return (prev.astype(int) - cur.astype(int)) > thresh


def _order_along_axis(ys, xs) -> list:
    """연결요소 픽셀을 주축 투영순으로 정렬 → 폴리라인 점열."""
    p = np.stack([xs, ys], 1).astype(float)
    c = p.mean(0); d = np.linalg.svd(p - c)[2][0]
    order = np.argsort((p - c) @ d)
    return p[order].tolist()


def extract_from_frames(frames: list[np.ndarray], min_pixels=15, resample_step=4) -> list[dict]:
    """프레임 시퀀스 → 스트로크 리스트(seq 순). 각 프레임의 새 잉크를 획으로."""
    import cv2
    strokes = []
    seq = 0
    for t in range(1, len(frames)):
        mask = new_ink_mask(frames[t - 1], frames[t]).astype(np.uint8)
        if mask.sum() < min_pixels:
            continue
        n, labels = cv2.connectedComponents(mask)
        for lab in range(1, n):
            ys, xs = np.where(labels == lab)
            if len(xs) < min_pixels:
                continue
            pts = _order_along_axis(ys, xs)
            pts = pts[::resample_step] if len(pts) > resample_step else pts
            strokes.append({"points": [[float(x), float(y), float(seq), 0.5] for x, y in pts],
                            "pen": "mass", "seq": seq})
            seq += 1
    return strokes


# --- 실 영상 다운로드 경로 (yt-dlp format-18, ffmpeg 불요 pre-muxed) ---
def download_sample(video_id: str, out_dir: Path, seconds=30) -> Path | None:
    """format 18(360p mp4, 오디오+비디오 머지됨 → ffmpeg 불요) 앞 seconds초.
    실행 의존: yt-dlp. ffmpeg 없으면 자르기 제한 → 전체받고 cv2서 앞부분만 읽기."""
    try:
        import yt_dlp
    except Exception:
        return None
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{video_id}.mp4"
    # 전체 format-18(360p, pre-muxed) 받고 cv2서 앞 seconds만 읽음(부분다운로드는 ffmpeg-PATH 필요).
    opts = {"format": "18/worst[ext=mp4]/worst", "outtmpl": str(out), "quiet": True, "noplaylist": True}
    try:
        import os, imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        opts["ffmpeg_location"] = ff
        os.environ["PATH"] = str(Path(ff).parent) + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        pass
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
        return out if out.exists() and out.stat().st_size > 10000 else None
    except Exception as e:
        print("download fail:", str(e)[:150], file=sys.stderr)
        return None


def frames_from_video(path: Path, every=15, max_frames=200) -> list[np.ndarray]:
    """cv2로 비디오 → grayscale 프레임 샘플(every프레임마다). ffmpeg 불요(cv2 내장)."""
    import cv2
    cap = cv2.VideoCapture(str(path))
    frames, i = [], 0
    while len(frames) < max_frames:
        ok, fr = cap.read()
        if not ok:
            break
        if i % every == 0:
            frames.append(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
        i += 1
    cap.release()
    return frames


if __name__ == "__main__":
    # 합성 프레임: 사각형을 변별로 그려나감 → 각 변이 획으로 추출되는지
    import cv2
    H, W = 200, 260
    corners = [(30, 30), (230, 30), (230, 170), (30, 170)]
    frames = [np.full((H, W), 255, np.uint8)]
    canvas = frames[0].copy()
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        cv2.line(canvas, a, b, 0, 2)
        frames.append(canvas.copy())
    strokes = extract_from_frames(frames)
    print(f"프레임 {len(frames)} → 추출 획 {len(strokes)} (기대 4)")
    for s in strokes:
        p = s["points"]; print(f"  seq{s['seq']}: {len(p)}pt {tuple(round(x) for x in p[0][:2])}→{tuple(round(x) for x in p[-1][:2])}")
