"""지속 수집 로깅 스키마 (§14). 구현은 7단계 — 지금은 스키마 확정 + 기록만.

원칙(§14.2): 옵트인 기본꺼짐 / 기하 익명화(좌표 정규화·라벨 해시) / 로컬 우선 /
발화는 별도 동의. 학습 파이프라인은 만들지 않는다(§14.5). 순수 append-only JSONL.

레코드 공통 필드:
  {v, ts, session, type, payload}
type ∈ {stroke, ir_snapshot, correction, utterance, unmappable, metric}
좌표는 항상 익명화(centroid 제거 + bbox 대각 정규화) → 절대 치수·위치 미보존.
id/label은 해시. 발화(utterance)는 speech_consent True일 때만 기록.
"""
from __future__ import annotations
import json, time, hashlib
from pathlib import Path
from dataclasses import asdict, is_dataclass
import numpy as np

SCHEMA_VERSION = "log-1.0"
LOG_DIR = Path(__file__).resolve().parent / "logs"
CORRECTION_KINDS = ("misread", "design_change")   # §14.1 오독 vs 설계변경
TYPES = ("stroke", "ir_snapshot", "correction", "utterance", "unmappable", "metric")


def hash_label(s: str) -> str:
    return "h:" + hashlib.sha1(str(s).encode("utf-8")).hexdigest()[:10]


def anon_coords(pts) -> list:
    """centroid 제거 + bbox 대각 정규화 → 스케일·이동 불변(§14.2 익명화)."""
    a = np.asarray(pts, float)
    if a.ndim != 2 or len(a) == 0:
        return []
    xy = a[:, :2]
    c = xy.mean(0)
    diag = float(np.hypot(*(xy.max(0) - xy.min(0)))) or 1.0
    z = (xy - c) / diag
    return [[round(float(x), 4), round(float(y), 4)] for x, y in z]


class Collector:
    """세션 수집기. enabled=False(기본)면 전부 no-op(부작용 없음)."""

    def __init__(self, session: str = "local", enabled: bool = False,
                 speech_consent: bool = False, log_dir: Path = LOG_DIR):
        self.session = session
        self.enabled = enabled              # §14.2 옵트인 기본꺼짐
        self.speech_consent = speech_consent  # §14.2 발화 별도 동의
        self.log_dir = log_dir
        self._path = None

    def _write(self, type_: str, payload: dict):
        if not self.enabled:
            return
        self.log_dir.mkdir(parents=True, exist_ok=True)
        if self._path is None:
            self._path = self.log_dir / (self.session + ".jsonl")
        rec = {"v": SCHEMA_VERSION, "ts": round(time.time(), 3),
               "session": self.session, "type": type_, "payload": payload}
        with self._path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # --- §14.1 항목별 ---
    def log_stroke(self, strokes, frame="", pen="mass"):
        for s in strokes:
            pts = s["points"] if isinstance(s, dict) else s
            self._write("stroke", {"frame": hash_label(frame), "pen": pen,
                                   "n_pts": len(pts), "xy_norm": anon_coords(
                                       [p[:2] for p in pts])})

    def log_ir(self, tag: str, ir):
        """IR before/after 스냅샷 — footprint 익명화, id 해시."""
        vols = []
        for v in getattr(ir, "volumes", []):
            vols.append({"id": hash_label(v.id), "footprint_norm": anon_coords(v.footprint),
                         "height_claimed": v.height})
        anchors = [{"target": hash_label(a.target), "prop": a.prop, "has_tol": a.tol > 0}
                   for a in getattr(ir, "anchors", [])]
        self._write("ir_snapshot", {"tag": tag, "n_vol": len(vols), "volumes": vols,
                                    "anchors": anchors,
                                    "n_unresolved": len(getattr(ir, "unresolved", [])),
                                    "root_fields": ir.root_field_count() if hasattr(ir, "root_field_count") else None})

    def log_correction(self, kind: str, target: str, before, after, prop: str = ""):
        assert kind in CORRECTION_KINDS, kind      # 오독 vs 설계변경(§14.1)
        self._write("correction", {"kind": kind, "target": hash_label(target),
                                   "prop": prop, "before": before, "after": after})

    def log_utterance(self, raw: str, ops=None, correction: str = ""):
        if not self.speech_consent:                # §14.2 발화 별도 동의 게이트
            return
        rendered = []
        if ops:
            from common.grammar import render_op
            rendered = [render_op(o) for o in ops]
        self._write("utterance", {"raw": raw, "ops": rendered, "correction": correction})

    def log_unmappable(self, key: str, count: int = 1):
        self._write("unmappable", {"key": key, "count": count})

    def log_metric(self, name: str, value):
        self._write("metric", {"name": name, "value": value})


# 전역 기본 수집기 — 기본 꺼짐(§14.2). 스테이지들이 참조하되 부작용 없음.
collector = Collector(enabled=False)


def enable(session="local", speech_consent=False):
    """옵트인 활성화(명시 호출 시에만). 기본 꺼짐 원칙 유지."""
    global collector
    collector = Collector(session=session, enabled=True, speech_consent=speech_consent)
    return collector
