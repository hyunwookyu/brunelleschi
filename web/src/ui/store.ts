// S-9 **로컬 저장** — 브라우저를 닫아도 작업이 남는다. 저장소는 IndexedDB.
//
// ## 무엇을 담는가 — **재생성되지 않는 것 전부**
//
// 계획서 §5는 `pts2d`가 원본이고 `pts3d`는 파생이라고 적었다(`reprojectAll`이 다시 만든다).
// 그 말은 맞지만 **복원에는 부족하다**. 재생성이 화면과 갈리는 자리가 셋이다:
//
//   1. **사용자 지정 배치**(`고치기`) — 자동 경로가 못 놓은 것을 사람이 판단해서 놓은 것이다.
//      `reprojectAll`은 그 판단을 모른다. 돌린 시점 배치율이 0.25~0.46인 조건에서
//      그 양이 상당하다(D-S22).
//   2. **지운 뒤의 상태** — 지우개는 **자동 배치를 다시 돌리지 않는다**(S-7 3). 재생성하면
//      지운 획에 붙어 있던 획들이 다른 앵커로 옮겨 간다.
//   3. **돌린 시점에서 그린 획** — 그 `pts2d`는 **그 시점의 뷰 좌표**다. 첫 카메라로
//      재생성할 수 없고, 그리려면 그때의 자세(`viewCam`)가 있어야 한다.
//
// 그래서 **`pts3d`를 그대로 담는다.** 얼마나 갈리는지는 재서 원장에 남겼다
// (`stage0/out/persist.json` — 재생성 대조군).
//
// ## 담지 않는 것
// - `Stroke.layer` — 레이어가 미구현이라 값이 언제나 0이다. 담으면 `selfcheck`의
//   **미사용 필드 탐지**(S-8c)가 그 필드를 "읽는 곳이 있다"고 보고 **플래그를 잃는다**.
//   구현되면 그때 담는다. _기계 검사를 저장 코드가 무력화하지 않게 한다._
// - 실행 취소 이력 — 세션 안의 것이다. 되돌릴 것이 없는 상태로 열린다.
import type { Pt2 } from "../s3d/camera.js";
import type { Axis } from "../s3d/axis.js";
import type { Stroke } from "../s3d/stroke.js";
import type { AccumulatorDump } from "../s3d/constraints.js";
import type { Vec3 } from "../s3d/geom3d.js";
import type { ViewPose } from "../s3d/viewCamera.js";

export const DOC_FORMAT = "s2s-doc/1";

/**
 * 돌린 시점의 카메라 자세 — 앱의 `viewCam` 항목 그대로다.
 * **자세(`pose`)와 three 카메라(`pos`·`tgt`)를 함께 담는다**: 앞의 것은 그 시점의 배치·투영에
 * 쓰이고(`sameView`), 뒤의 것은 "그 시점으로" 버튼이 카메라를 되돌리는 데 쓰인다.
 */
export interface DocViewCam {
  pose: ViewPose;
  pos: [number, number, number];
  tgt: [number, number, number];
}

export interface DocStroke {
  id: string;
  /** **원본 화면 좌표**(§5). 손대지 않는다. `fromView`면 **그 시점의 뷰 좌표**다. */
  pts2d: number[][];
  /** 배치 결과. 파생이지만 담는다 — 위 머리말의 세 가지 때문이다. */
  pts3d: number[][];
  axis: Axis;
  rep?: { a: Pt2; b: Pt2 };
  anchorRef: string | null;
  joinShift: number;
  color: string;
  width: number;
  /** 원본 6튜플 `[x,y,t,압력,기울기X,기울기Y]` — 굵기(S-4)와 실획 측정(AS-6·AS-12)이 쓴다. */
  raw?: number[][];
  /** 돌린 시점에서 그린 획인가(`viewOrigin`). */
  fromView?: boolean;
  /** 그 시점의 자세. `fromView`일 때만 있다. */
  viewCam?: DocViewCam;
  /** 깊이 근거가 앵커 하나뿐인 배치(`provisional`). */
  provisional?: boolean;
  /** **사용자가 `고치기`로 놓은 획.** 자동 경로가 재생성하지 못하는 유일한 배치다. */
  userPlaced?: boolean;
}

export interface Doc {
  format: typeof DOC_FORMAT;
  /** ISO 문자열. 호출자가 넣는다(저장 코드에서 시각을 만들지 않는다 — 측정 하네스와 같은 규약). */
  at: string;
  /** 저장할 때의 캔버스 크기(px). 열 때 다르면 **좌표를 늘리지 않고 알린다**(§1.2). */
  imgSize: [number, number];
  /** 카메라 제약 **입력 그대로**. 푼 결과가 아니다. */
  cam: AccumulatorDump;
  locked: boolean;
  lensMm: number;
  /** 마지막으로 나간 획 번호. 이어 받지 않으면 새 획의 id가 불러온 획과 겹친다. */
  seq: number;
  strokes: DocStroke[];
}

export interface DocSource {
  at: string;
  imgSize: [number, number];
  cam: AccumulatorDump;
  locked: boolean;
  lensMm: number;
  seq: number;
  strokes: Stroke[];
  raw: Map<string, number[][]>;
  viewOrigin: Set<string>;
  viewCam: Map<string, DocViewCam>;
  provisional: Set<string>;
  userPlaced: Set<string>;
}

/** 앱 상태 → 저장 문서. **순수 함수다** — IndexedDB 없이 테스트한다. */
export function serializeDoc(s: DocSource): Doc {
  return {
    format: DOC_FORMAT,
    at: s.at,
    imgSize: [s.imgSize[0], s.imgSize[1]],
    cam: s.cam,
    locked: s.locked,
    lensMm: s.lensMm,
    seq: s.seq,
    strokes: s.strokes.map(t => {
      const d: DocStroke = {
        id: t.id,
        pts2d: t.pts2d.map(p => [p[0], p[1]]),
        pts3d: t.pts3d.map(p => [p[0], p[1], p[2]]),
        axis: t.axis,
        anchorRef: t.anchorRef,
        joinShift: t.joinShift,
        color: t.color,
        width: t.width,
      };
      if (t.rep) d.rep = { a: [t.rep.a[0], t.rep.a[1]], b: [t.rep.b[0], t.rep.b[1]] };
      const raw = s.raw.get(t.id);
      if (raw) d.raw = raw.map(p => p.slice());
      if (s.viewOrigin.has(t.id)) d.fromView = true;
      const vc = s.viewCam.get(t.id);
      if (vc) {
        d.viewCam = {
          pose: { R: vc.pose.R.map(r => [...r] as Vec3) as [Vec3, Vec3, Vec3],
                  C: [...vc.pose.C] as Vec3 },
          pos: [...vc.pos], tgt: [...vc.tgt],
        };
      }
      if (s.provisional.has(t.id)) d.provisional = true;
      if (s.userPlaced.has(t.id)) d.userPlaced = true;
      return d;
    }),
  };
}

export interface Restored {
  strokes: Stroke[];
  raw: Map<string, number[][]>;
  viewOrigin: Set<string>;
  viewCam: Map<string, DocViewCam>;
  provisional: Set<string>;
  userPlaced: Set<string>;
  cam: AccumulatorDump;
  locked: boolean;
  lensMm: number;
  seq: number;
  imgSize: [number, number];
}

/**
 * 저장 문서 → 앱 상태. **배치를 다시 돌리지 않는다** — 담아 둔 `pts3d`가 화면에 있던 그것이다.
 *
 * `layer`는 문서에 없으므로 0으로 세운다(위 머리말). `Stroke`가 요구하는 값이라 채운다.
 */
export function restoreDoc(doc: Doc): Restored {
  const strokes: Stroke[] = doc.strokes.map(d => ({
    id: d.id,
    pts2d: d.pts2d.map(p => [p[0], p[1]] as Pt2),
    pts3d: d.pts3d.map(p => [p[0], p[1], p[2]] as Vec3),
    axis: d.axis,
    rep: d.rep,
    anchorRef: d.anchorRef,
    joinShift: d.joinShift,
    layer: 0,
    color: d.color,
    width: d.width,
  }));
  const raw = new Map<string, number[][]>();
  const viewOrigin = new Set<string>();
  const viewCam = new Map<string, DocViewCam>();
  const provisional = new Set<string>();
  const userPlaced = new Set<string>();
  for (const d of doc.strokes) {
    if (d.raw) raw.set(d.id, d.raw.map(p => p.slice()));
    if (d.fromView) viewOrigin.add(d.id);
    if (d.viewCam) viewCam.set(d.id, d.viewCam);
    if (d.provisional) provisional.add(d.id);
    if (d.userPlaced) userPlaced.add(d.id);
  }
  // **번호는 문서의 `seq`와 실제 id 중 큰 쪽을 따른다.** 손으로 고친 문서에서도 안 겹치게.
  let seq = doc.seq ?? 0;
  for (const d of doc.strokes) {
    const m = /^s(\d+)$/.exec(d.id);
    if (m) seq = Math.max(seq, Number(m[1]));
  }
  return { strokes, raw, viewOrigin, viewCam, provisional, userPlaced,
           cam: doc.cam, locked: !!doc.locked, lensMm: doc.lensMm ?? 35, seq,
           imgSize: doc.imgSize };
}

/** 형식 검사 — 남의 JSON이나 낡은 판본을 조용히 열지 않는다. */
export function isDoc(v: unknown): v is Doc {
  const d = v as Doc | null;
  return !!d && d.format === DOC_FORMAT && Array.isArray(d.strokes) && !!d.cam;
}

// ---------------------------------------------------------------- IndexedDB

const DB_NAME = "sketch2space";
const DB_VERSION = 1;
const STORE = "docs";
/** 자동 저장 슬롯. **하나만 쓴다**(A-3: 가장 단순한 것) — 여러 문서는 내보내기로 나눈다. */
export const CURRENT = "current";

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

/** 저장. **구조적 복제로 들어가므로 순수 자료여야 한다** — `Doc`은 그렇게 만들어져 있다. */
export const putDoc = (doc: Doc, key = CURRENT): Promise<unknown> =>
  tx("readwrite", s => s.put(doc, key));

export const getDoc = (key = CURRENT): Promise<Doc | null> =>
  tx<Doc | undefined>("readonly", s => s.get(key)).then(v => (isDoc(v) ? v : null));

export const deleteDoc = (key = CURRENT): Promise<unknown> =>
  tx("readwrite", s => s.delete(key));

/**
 * **자동 저장기**. 그릴 때마다 쓰면 손이 멈추지 않는 동안 계속 디스크를 친다 —
 * 마지막 변경에서 `delay`ms 쉬면 한 번 쓴다. 저장 실패는 **작업을 막지 않는다**
 * (사파리 프라이빗 모드처럼 IndexedDB가 없는 환경이 있다).
 */
export function autosaver(build: () => Doc, delay = 600,
                          onDone?: (ok: boolean, err?: unknown) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false, again = false;
  const flush = async () => {
    if (running) { again = true; return; }
    running = true;
    try {
      await putDoc(build());
      onDone?.(true);
    } catch (e) {
      onDone?.(false, e);
    } finally {
      running = false;
      if (again) { again = false; void flush(); }
    }
  };
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void flush(); }, delay);
    },
    /** 지금 당장 쓴다(창을 닫을 때·초기화할 때). */
    flush,
    get pending() { return timer !== null; },
  };
}
