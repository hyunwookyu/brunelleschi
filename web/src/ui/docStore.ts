// L-D.2 **저장·복원 v2** — 뷰 목록과 **뷰별 2D 획**을 담는다.
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 걸리는 것: **#36**(비율 계산 없음 — 여기는 개수만
// 센다), **#34**(옛 v1 경로가 같은 DB를 쓰므로 함께 확인한다).
//
// v1(`store.ts`)과 무엇이 다른가:
//   v1은 `Stroke[]` 하나였고 **뷰가 없었다**. L의 문서는 `DocState` — 뷰가 2D 획의 **소유자**다
//   (`docs/line_plan.md` §9.1). 뷰를 안 담으면 **2D 레이어가 통째로 사라진다**: `viewRef`가
//   가리킬 뷰가 없어 어느 시점에서 그린 것인지 잃고, 그 획은 다시 그릴 수도 없다.
//
// **담는 것**: 뷰 목록(자세 포함) · 획 전부(`pts2d` 원본 · `seg3d` · 축 · 사용자 축 · 스냅 출처) ·
// 카메라 제약 **입력 그대로** · 현재 뷰 · id 시퀀스.
// **안 담는 것**: 실행 취소 이력(세션 안의 것) · 파생 기하(3D는 `seg3d`가 이미 결과다).
import type { Pt2 } from "../s3d/camera.js";
import type { Vec3 } from "../s3d/geom3d.js";
import type { Axis } from "../s3d/axis.js";
import type { ViewPose } from "../s3d/viewCamera.js";
import type { AccumulatorDump } from "../s3d/constraints.js";
import type { RuleState } from "../s3d/vpRules.js";
import { DEFAULT_CHANNEL, confirmViewOf } from "./doc.js";
import type { Snap2Ref } from "../s3d/resolve2d.js";
import type { DocState, SStroke, SView, SnapRef, Channel } from "./doc.js";

export const DOC2_FORMAT = "s2s-doc/2";

export interface Doc2 {
  format: typeof DOC2_FORMAT;
  /** ISO 문자열. **호출자가 넣는다** — 저장 코드가 시각을 만들지 않는다(재현성 규칙). */
  at: string;
  /** 저장할 때의 캔버스 크기(px). 열 때 다르면 **좌표를 늘리지 않고 알린다**. */
  imgSize: [number, number];
  /** 카메라 제약 **입력 그대로**(푼 결과가 아니다 — 열어서 이어 조정할 수 있어야 한다). */
  cam: AccumulatorDump | null;
  /**
   * **규칙 상태**(2026-08-16). 카메라의 진짜 입력이다 — 슬롯 셋과 지평선.
   *
   * ⚠ **옛 저장본에는 없다.** 없으면 규칙이 비어 카메라가 안 서고 획이 2D로 남는다 —
   * **조용히 틀린 카메라를 세우는 것보다 낫다**(A-3). `cam`은 남겨 둔다: 그것으로
   * 옛 작업의 소실점을 읽는 스크립트를 나중에 짤 수 있다(D-L29와 같은 자리).
   */
  rules?: RuleState | null;
  /** ⛔ **옛 저장본에서만 온다**(2026-08-17 지시 1·2). 렌즈 경로는 폐기됐고, `locked`·`order`는
   * **파생 상태라 더 이상 저장하지 않는다** — 차수는 `perspectiveOrder(rules)`가 계산한다. */
  lensMm?: number | null;
  locked?: boolean;
  order?: number;
  /** **모호 물음 카운터**(지시 K) — 실획 세션에서 묻는 빈도를 재기 위한 메타다. 선택. */
  askStats?: { asked: number; screen: number; depth: number; vertical: number; skipped: number };
  /** **배치 경로 카운터**(6차 지시 3) — 1점 직접 좌표 경로 사용 비율의 재료다. 선택. */
  pathStats?: { direct: number; lift: number; twoPoint: number };
  views: { id: string; name: string; pose: ViewPose | null; seq: number }[];
  currentView: string;
  strokes: {
    id: string;
    pts2d: number[][];
    viewRef: string;
    seg3d: [number[], number[]] | null;
    axis: Axis;
    userAxis: boolean;
    snapStart: SnapRef | null;
    /** 시작점의 겨냥 거리(px, 지시 K — 40px 프로브라 조리개 절단 없음). 옛 저장본에는 없다. */
    snapDistPx?: number | null;
    /** 끝점의 겨냥 거리(px, 6차 항목 2 — 40px 프로브). 옛 저장본에는 없다. */
    snapEndDistPx?: number | null;
    /** 조각의 출처 획 id(지시 I·K). */
    pieceOf?: string;
    /** **끝점 스냅**(오스냅, D-L46). 옛 저장본에는 없다 — 복원이 `null`로 채운다 */
    snapEnd?: SnapRef | null;
    /**
     * **확정 전(2D 단계)에 걸린 오스냅**(9차 항목 1 · D-L81). `at`이 **화면 좌표**라
     * 3D 참조와 자료형이 다르다. 옛 저장본에는 없다 — 복원이 `null`로 채운다.
     * ⚠ **`.brnl` 실획 표본이 이 필드로 2D 단계 스냅을 처음 보고한다**(항목 1-b).
     */
    snap2dStart?: Snap2Ref | null;
    snap2dEnd?: Snap2Ref | null;
    /**
     * **보조 소실점 이력**(15차 항목 7 · D-L106 — 저장은 2026-08-20 16차). 옛 저장본에는
     * 없다. ⚠ **보조 방향 자체(각도)는 여전히 저장 밖이다**(DEFERRED — 앱 상태) — 이
     * 필드는 «그 문서가 보조를 썼는가»의 판정자다: DEFERRED 그 행의 되살릴 조건이
     * `auxId` 보유 획 수 > 0인데, 16차 전에는 **직렬화가 이 필드를 버려서 그 조건이
     * 구성상 만족 불가였다**(#35의 모양 — 판정자가 관측 불가능했다).
     */
    auxId?: string | null;
    /** **펜 채널**(D). 옛 저장본에는 없다 — 보조선으로 읽는다. */
    channel?: Channel;
    color?: string;
    width?: number;
  }[];
  /** id 시퀀스. 이어받지 않으면 새 획이 불러온 획과 **id가 겹친다**(v1에서 실제로 겪었다). */
  seq: { stroke: number; view: number };
}

export interface Doc2Source {
  at: string;
  imgSize: [number, number];
  cam: AccumulatorDump | null;
  rules?: RuleState | null;
  askStats?: { asked: number; screen: number; depth: number; vertical: number; skipped: number };
  pathStats?: { direct: number; lift: number; twoPoint: number };
  doc: DocState;
  seq: { stroke: number; view: number };
}

/**
 * **저장 무결성 — 뷰 자세**(2026-08-17 7차 항목 1-c). 위반이면 사유를, 정상이면 `null`을 낸다.
 *
 * `pose === null`은 **확정 뷰의 표식**이다(doc.ts — 첫 카메라 자체·자세 항등). 그래서
 * "pose가 null이면 실패"가 아니라, **표식의 전제가 깨진 문서**를 실패로 본다:
 *   ① 확정 뷰가 없거나 둘 이상 — 복원(`restoreDoc2`)의 home 판정과 뷰 전환이 전부 이 표식
 *      위에 있으므로, 깨진 채 저장되면 열 때 조용히 틀린 뷰 배선이 된다
 *   ② 저장된 자세에 유한하지 않은 값 — 열 때 카메라가 NaN으로 선다
 * 어느 쪽도 정상 경로로는 만들어질 수 없다 — 그래서 걸리면 **저장을 실패로 기록**한다
 * (조용히 깨진 파일을 남기는 것보다 낫다, A-3).
 */
export function doc2PoseIntegrity(views: { id: string; pose: ViewPose | null }[]): string | null {
  const confirms = views.filter(v => v.pose === null).length;
  if (confirms !== 1) return `확정 뷰(pose null)가 ${confirms}개다 — 정확히 하나여야 한다`;
  for (const v of views) {
    if (!v.pose) continue;
    const nums = [...v.pose.C, ...v.pose.R[0], ...v.pose.R[1], ...v.pose.R[2]];
    if (!nums.every(Number.isFinite)) return `뷰 ${v.id}의 자세에 유한하지 않은 값이 있다`;
  }
  return null;
}

/** 앱 상태 → 저장 문서. **순수 함수다** — IndexedDB 없이 테스트한다.
 * ⚠ `locked`·`order`·`lensMm`은 **더 이상 쓰지 않는다**(파생 상태 — 지시 1: 저장하지 않고 계산한다).
 * ⚠ 뷰 자세 무결성이 깨져 있으면 **던진다**(7차 항목 1-c) — 자동 저장기는 이것을 잡아
 * 실패로 기록하고(`onDone(false)`), 내보내기 버튼은 실패 사유를 화면에 낸다. */
export function serializeDoc2(s: Doc2Source): Doc2 {
  const bad = doc2PoseIntegrity(s.doc.views);
  if (bad) throw new Error(`저장 무결성: ${bad}`);
  return {
    format: DOC2_FORMAT,
    at: s.at,
    imgSize: [s.imgSize[0], s.imgSize[1]],
    cam: s.cam,
    rules: s.rules ?? null,
    askStats: s.askStats,
    pathStats: s.pathStats,
    views: s.doc.views.map(v => ({
      id: v.id, name: v.name, seq: v.seq,
      pose: v.pose ? { R: v.pose.R.map(r => [...r] as Vec3) as [Vec3, Vec3, Vec3],
                       C: [...v.pose.C] as Vec3 } : null,
    })),
    currentView: s.doc.currentView,
    strokes: s.doc.strokes.map(t => ({
      id: t.id,
      pts2d: t.pts2d.map(p => [p[0], p[1]]),
      viewRef: t.viewRef,
      seg3d: t.seg3d ? [[...t.seg3d[0]], [...t.seg3d[1]]] : null,
      axis: t.axis,
      userAxis: t.userAxis,
      snapStart: t.snapStart ? { ...t.snapStart, at: [...t.snapStart.at] as Vec3 } : null,
      snapDistPx: t.snapDistPx ?? null,
      snapEndDistPx: t.snapEndDistPx ?? null,
      pieceOf: t.pieceOf,
      snapEnd: t.snapEnd ? { ...t.snapEnd, at: [...t.snapEnd.at] as Vec3 } : null,
      // **화면 좌표라 얕은 사본이면 배열이 공유된다**(`cloneRuleState`가 걸렸던 자리)
      snap2dStart: t.snap2dStart ? { ...t.snap2dStart, at: [...t.snap2dStart.at] as Pt2 } : null,
      snap2dEnd: t.snap2dEnd ? { ...t.snap2dEnd, at: [...t.snap2dEnd.at] as Pt2 } : null,
      auxId: t.auxId ?? null,
      channel: t.channel,
      color: t.color,
      width: t.width,
    })),
    seq: { ...s.seq },
  };
}

export interface Restored2 {
  doc: DocState;
  cam: AccumulatorDump | null;
  imgSize: [number, number];
  seq: { stroke: number; view: number };
}

/** 저장 문서 → 앱 상태. **배치를 다시 돌리지 않는다** — `seg3d`가 화면에 있던 그것이다. */
export function restoreDoc2(d: Doc2): Restored2 {
  const views: SView[] = d.views.map(v => ({
    id: v.id, name: v.name, seq: v.seq,
    pose: v.pose ? { R: v.pose.R.map(r => [...r] as Vec3) as [Vec3, Vec3, Vec3],
                     C: [...v.pose.C] as Vec3 } : null,
  }));
  const strokes: SStroke[] = d.strokes.map(t => ({
    id: t.id,
    pts2d: t.pts2d.map(p => [p[0], p[1]] as Pt2),
    viewRef: t.viewRef,
    seg3d: t.seg3d ? [[...t.seg3d[0]] as Vec3, [...t.seg3d[1]] as Vec3] : null,
    axis: t.axis,
    userAxis: !!t.userAxis,
    snapStart: t.snapStart ?? null,
    snapDistPx: t.snapDistPx ?? null,
    snapEndDistPx: t.snapEndDistPx ?? null,
    pieceOf: t.pieceOf,
    // **옛 저장본에는 이 필드가 없다** — 없으면 끝점 스냅이 아니었던 것이다
    snapEnd: t.snapEnd ?? null,
    // **옛 저장본에는 2D 단계 기록이 없다**(9차 항목 1 이전) — `null`이 "안 걸렸다"가
    // 아니라 **"안 적혔다"**임을 실획 원장이 갈라 센다(#32 — 미실행을 반증으로 안 쓴다)
    snap2dStart: t.snap2dStart ?? null,
    snap2dEnd: t.snap2dEnd ?? null,
    // 옛 저장본에는 없다 — null이 «보조를 안 썼다»가 아니라 «안 적혔다»일 수 있다(#32)
    auxId: t.auxId ?? null,
    // **옛 저장본은 채널이 없다** — 보조선으로 읽는다(D-1의 기본값)
    channel: t.channel ?? DEFAULT_CHANNEL,
    color: t.color,
    width: t.width,
  }));
  // **없는 뷰를 가리키는 획을 남기지 않는다** — 그 획은 어디에도 안 그려지고 조용히 사라진다.
  const known = new Set(views.map(v => v.id));
  // **확정 뷰 술어는 `doc.ts` 하나다**(#17) — 옛 판은 같은 식을 여기 따로 적었다
  const home = confirmViewOf({ strokes: [], views, currentView: views[0].id });
  for (const t of strokes) if (!known.has(t.viewRef)) t.viewRef = home.id;
  const current = known.has(d.currentView) ? d.currentView : home.id;

  // **id는 문서의 값과 실제 id 중 큰 쪽**을 따른다(손으로 고친 문서에서도 안 겹치게).
  let sSeq = d.seq?.stroke ?? 0, vSeq = d.seq?.view ?? 0;
  for (const t of strokes) { const m = /^s(\d+)$/.exec(t.id); if (m) sSeq = Math.max(sSeq, +m[1]); }
  for (const v of views) { const m = /^v(\d+)$/.exec(v.id); if (m) vSeq = Math.max(vSeq, +m[1]); }

  // ⚠ 옛 저장본의 `locked`·`order`는 **읽지 않는다** — 파생 상태이고 `rules`에서 계산된다.
  return { doc: { strokes, views, currentView: current },
           cam: d.cam ?? null,
           imgSize: d.imgSize, seq: { stroke: sSeq, view: vSeq } };
}

/** 형식 검사 — 남의 JSON이나 v1 문서를 조용히 열지 않는다. */
export function isDoc2(v: unknown): v is Doc2 {
  const d = v as Doc2 | null;
  return !!d && d.format === DOC2_FORMAT && Array.isArray(d.strokes) && Array.isArray(d.views)
         && d.views.length > 0;
}

// ---------------------------------------------------------------- IndexedDB

const DB_NAME = "sketch2space";
const DB_VERSION = 1;
const STORE = "docs";
/** v2 자동 저장 슬롯. **v1과 키를 나눈다** — 같은 키를 쓰면 옛 앱이 새 문서를 못 읽고 지운다. */
export const CURRENT2 = "current2";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    t.oncomplete = () => db.close();
  }));
}

export const putDoc2 = (doc: Doc2, key = CURRENT2): Promise<unknown> =>
  tx("readwrite", s => s.put(doc, key));
export const getDoc2 = (key = CURRENT2): Promise<Doc2 | null> =>
  tx<Doc2 | undefined>("readonly", s => s.get(key)).then(v => (isDoc2(v) ? v : null));
export const deleteDoc2 = (key = CURRENT2): Promise<unknown> =>
  tx("readwrite", s => s.delete(key));

/**
 * **자동 저장기**. 마지막 변경에서 `delay`ms 쉬면 한 번 쓴다.
 * 저장 실패는 **작업을 막지 않는다**(사파리 프라이빗처럼 IndexedDB가 없는 환경이 있다).
 */
export function autosaver2(build: () => Doc2, delay = 600,
                           onDone?: (ok: boolean, err?: unknown) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false, again = false;
  const flush = async () => {
    if (running) { again = true; return; }
    running = true;
    try { await putDoc2(build()); onDone?.(true); }
    catch (e) { onDone?.(false, e); }
    finally { running = false; if (again) { again = false; void flush(); } }
  };
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void flush(); }, delay);
    },
    flush,
    get pending() { return timer !== null; },
  };
}
