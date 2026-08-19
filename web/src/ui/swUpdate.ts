// **서비스 워커 갱신 감지와 알림**(2026-08-19 17차 지시 0-2d·0-3).
//
// ## 문제
//
// 옛 판은 `navigator.serviceWorker.register("./sw.js")` 한 줄이 전부였다. 워커가 바뀌어도
// **화면은 아무 말도 안 했고**, 사용자는 새로고침을 반복하다 캐시를 지웠다.
//
// ## 하는 것 둘
//
// 1. **새 판이 잡혔는지 본다** — `updatefound → installed` 와 `controllerchange` 둘 다 본다.
//    `sw.js`가 `install`에서 `skipWaiting()`을 부르므로 `registration.waiting`은 **거의 안 보인다**
//    (대기 없이 바로 활성). 그래서 `waiting`만 보는 표준 예제는 이 앱에서 **한 번도 안 뜬다** —
//    `controllerchange`가 실제로 발화하는 신호다. 셋을 다 보되 `onUpdate`는 **한 번만** 부른다.
// 2. **주기적으로 다시 묻는다** — 브라우저는 탐색할 때만 `sw.js`를 다시 받는다. 앱은 한 번 열면
//    며칠 열려 있을 수 있어 그 사이 배포를 못 본다. 보이는 동안 주기적으로 `update()`를 부른다.
//
// ## 첫 방문을 갱신으로 읽지 않는다 (**반례**)
//
// 처음 여는 사람은 컨트롤러가 없다가 `clients.claim()`으로 생긴다 — 그때도 `controllerchange`가
// 뜬다. 그것을 갱신으로 읽으면 **모든 첫 방문자에게 "새 버전이 있습니다"가 뜬다.**
// 그래서 **등록 시점에 컨트롤러가 있었는가**(`hadController`)를 기준으로 삼는다.
// `test/sw_update.test.ts`가 이 반례를 잡는다.

/** 갱신 확인 주기. 보이는 동안에만 돈다(숨은 탭에서는 건너뛴다). D-C4: `test/constants.ts`에 등록. */
export const SW_UPDATE_POLL_MS = 60_000;

/** `ServiceWorker` 중 이 모듈이 쓰는 만큼만. 단위 테스트가 가짜를 넣을 수 있게 좁힌다(#17: 같은 함수). */
export interface WorkerLike {
  state: string;
  addEventListener(type: "statechange", fn: () => void): void;
  postMessage(msg: unknown): void;
}

export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: "updatefound", fn: () => void): void;
  update(): Promise<unknown>;
}

export interface ContainerLike {
  controller: unknown;
  register(url: string): Promise<RegistrationLike>;
  addEventListener(type: "controllerchange", fn: () => void): void;
}

export interface WatchResult {
  reg: RegistrationLike | null;
  /** 등록 시점에 이미 컨트롤러가 있었는가 — 첫 방문과 갱신을 가르는 값 */
  hadController: boolean;
}

/**
 * 등록하고, **새 판이 잡히면 `onUpdate`를 한 번 부른다.**
 * 등록 자체가 실패해도 앱은 동작한다(오프라인이 없을 뿐) — 던지지 않는다.
 */
export async function watchUpdates(
  sw: ContainerLike, url: string, onUpdate: () => void,
): Promise<WatchResult> {
  const hadController = !!sw.controller;
  let told = false;
  const tell = () => { if (hadController && !told) { told = true; onUpdate(); } };

  // 컨트롤러 교체 — `skipWaiting()` + `clients.claim()` 경로에서 실제로 뜨는 신호
  sw.addEventListener("controllerchange", tell);

  let reg: RegistrationLike | null = null;
  try { reg = await sw.register(url); } catch { return { reg: null, hadController }; }

  // 이미 대기 중인 판이 있다(= `skipWaiting`을 안 부르는 워커로 되돌린 경우에도 동작한다)
  if (reg.waiting) tell();
  reg.addEventListener("updatefound", () => {
    const w = reg?.installing;
    if (!w) return;
    const check = () => { if (w.state === "installed" || w.state === "activated") tell(); };
    w.addEventListener("statechange", check);
    check();   // 이미 넘어간 뒤에 붙었을 수 있다
  });
  return { reg, hadController };
}

/**
 * 보이는 동안 주기적으로 다시 묻는다. 반환값은 멈추는 함수(테스트가 끈다).
 * ⚠ 숨은 탭에서는 건너뛴다 — 백그라운드 탭 수십 개가 같은 요청을 반복할 이유가 없다.
 */
export function pollUpdates(
  reg: RegistrationLike, ms: number = SW_UPDATE_POLL_MS,
  doc: { visibilityState: string; addEventListener(t: "visibilitychange", f: () => void): void }
    = document,
): () => void {
  const ask = () => { if (doc.visibilityState === "visible") void reg.update().catch(() => {}); };
  const id = setInterval(ask, ms);
  doc.addEventListener("visibilitychange", ask);
  return () => clearInterval(id);
}

/**
 * 사용자가 "새로고침"을 눌렀을 때. 대기 중인 워커가 있으면 인계를 재촉하고 **다시 로드한다.**
 * `sw.js`가 이미 `skipWaiting()`을 부르므로 보통은 `waiting`이 비어 있고 새로고침만 남는다.
 */
export function applyUpdate(reg: RegistrationLike | null, reload: () => void): void {
  try { reg?.waiting?.postMessage({ type: "SKIP_WAITING" }); } catch { /* 없으면 그냥 새로고침 */ }
  reload();
}
