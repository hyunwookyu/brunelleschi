"""투시 영상 상시 수집 하네스 2D — 구조 (지시서 트랙2 2D).

일회성 아닌 상시 운영: cron 주1회, processed.db로 중복 회피, 자기강화 루프,
자동 판정, §14 통합, 디스크 정책(30초 샘플→판정→통과분만 전체→추출→원본삭제).

**실행 의존**: 영상 다운로드는 yt-dlp + 디스크 필요(미설치·장시간) → 실제 수집은 후속.
본 모듈은 구조·스키마·판정 로직을 확정한다(획 추출은 프레임차분·세선화, plan §6이
자막 접근으로 폐기했던 경로를 투시 기하 때문에 부활 — 별도 실행 트랙).
"""
from __future__ import annotations
import sys, sqlite3, csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "perspective" / "processed.db"
SKIPPED = ROOT / "data" / "perspective" / "skipped.csv"
QPERF = ROOT / "data" / "perspective" / "queries_perf.csv"


def init_db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.executescript("""
    CREATE TABLE IF NOT EXISTS processed (
      video_id TEXT PRIMARY KEY, query TEXT, track TEXT,      -- 2A|2B
      grade TEXT,                                             -- L1|L2|L3
      passed INTEGER, reason TEXT, ts TEXT);
    CREATE TABLE IF NOT EXISTS strokes (
      video_id TEXT, seq INTEGER, points_json TEXT);          -- 추출 스트로크(익명화)
    CREATE TABLE IF NOT EXISTS gt (                            -- 2A 정답(카메라·평면)
      video_id TEXT PRIMARY KEY, plan4_json TEXT, persp4_json TEXT, camera_json TEXT);
    """)
    con.commit(); con.close()


def already_processed(video_id: str) -> bool:
    if not DB.exists():
        return False
    con = sqlite3.connect(DB)
    r = con.execute("SELECT 1 FROM processed WHERE video_id=?", (video_id,)).fetchone()
    con.close(); return r is not None


# --- 자동 판정 (기존 조건 + 투시 전용). 실 프레임 입력 필요분은 시그니처만 확정. ---
def auto_judge(features: dict) -> dict:
    """features: {timelapse, camera_stable, canvas_frontal, longline_ratio,
                  vp_detectable, plane_present}. 반환 {passed, track, grade, reason}."""
    if features.get("timelapse") or not features.get("camera_stable") or not features.get("canvas_frontal"):
        return {"passed": False, "reason": "타임랩스/카메라불안정/캔버스비정면"}
    track = "2A" if features.get("plane_present") else "2B"
    ll = features.get("longline_ratio", 0.0)
    vp = features.get("vp_detectable", False)
    if ll >= 0.4 and vp:
        grade = "L1"
    elif ll >= 0.15 or vp:
        grade = "L2"
    else:
        grade = "L3"
    passed = vp or track == "2A"          # VP 없고 2B면 복원 근거 부족
    return {"passed": passed, "track": track, "grade": grade,
            "reason": f"track={track} grade={grade} longline={ll:.2f} vp={vp}"}


def record(video_id, query, judged: dict):
    init_db()
    con = sqlite3.connect(DB)
    con.execute("INSERT OR REPLACE INTO processed VALUES (?,?,?,?,?,?,datetime('now'))",
                (video_id, query, judged.get("track"), judged.get("grade"),
                 int(judged.get("passed", False)), judged.get("reason")))
    con.commit(); con.close()
    if not judged.get("passed"):
        _append_csv(SKIPPED, ["video_id", "query", "reason"], [video_id, query, judged.get("reason")])


def _append_csv(path: Path, header, row):
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(header)
        w.writerow(row)


def s14_integration_note():
    """§14 통합: 코퍼스 증분 → 노이즈/tolerance 재추정 → 고정 홀드아웃 회귀 → 하락시 롤백.
    수집분을 홀드아웃(SketchGraphs+OpenSketch)에 섞지 않는다(§14.4)."""
    return {"hooks": ["corpus_merge", "retune_tolerance", "holdout_regress_check", "rollback_on_drop"],
            "holdout_frozen": True, "no_leak_into_holdout": True}


DISK_POLICY = {"sample_seconds": 30, "download_full_only_if_pass": True,
               "delete_source_after_extract": True, "keep": ["strokes_json", "stats"]}


if __name__ == "__main__":
    init_db()
    # 판정 로직 자체검증(합성 features)
    demos = [
        {"timelapse": False, "camera_stable": True, "canvas_frontal": True, "longline_ratio": 0.5, "vp_detectable": True, "plane_present": True},
        {"timelapse": False, "camera_stable": True, "canvas_frontal": True, "longline_ratio": 0.2, "vp_detectable": True, "plane_present": False},
        {"timelapse": False, "camera_stable": True, "canvas_frontal": True, "longline_ratio": 0.05, "vp_detectable": False, "plane_present": False},
        {"timelapse": True, "camera_stable": True, "canvas_frontal": True},
    ]
    for f in demos:
        print(auto_judge(f))
    print("§14:", s14_integration_note())
    print("disk:", DISK_POLICY)
    print("DB 초기화:", DB.exists())
