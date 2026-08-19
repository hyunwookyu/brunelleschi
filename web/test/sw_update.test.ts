// **갱신 감지와 빌드 식별자**(2026-08-19 17차 지시 0-1·0-3) — 단위.
//
// 원장을 쓰지 않는다 → `npm run test:unit` 갈래다(`tools/testSplit.mjs`는 이름이 아니라
// **`stage0/out`에 쓰는지**로 가른다). 브라우저 없이 도는 부분만 여기서 잡고,
// 실제 워커·캐시·재배포는 `e2e/static_deploy.spec.ts`가 잰다.
//
// **반례가 이 파일의 요점이다**(A-4): 갱신 감지는 *"뜬다"*보다 *"안 떠야 할 때 안 뜬다"*가
// 어렵다. 첫 방문자는 컨트롤러가 없다가 `clients.claim()`으로 생기고, 그때도
// `controllerchange`가 발화한다 — 그것을 갱신으로 읽으면 **모든 첫 방문자**에게 알림이 뜬다.
import { describe, it, expect } from "vitest";
import { watchUpdates, applyUpdate, pollUpdates, SW_UPDATE_POLL_MS,
         type ContainerLike, type RegistrationLike, type WorkerLike } from "../src/ui/swUpdate.js";
import { BUILD, buildLabel, buildTitle, shortTime } from "../src/ui/buildInfo.js";

/** 최소 가짜 워커 — 상태를 바깥에서 밀어 넣는다. */
function fakeWorker(state = "installing") {
  const fns: (() => void)[] = [];
  const w: WorkerLike & { set(s: string): void; posted: unknown[] } = {
    state,
    posted: [],
    addEventListener: (_t, f) => { fns.push(f); },
    postMessage: (m) => { w.posted.push(m); },
    set(s: string) { w.state = s; for (const f of fns.slice()) f(); },
  };
  return w;
}

function fakeContainer(opts: { controller: unknown; reg?: Partial<RegistrationLike> } ) {
  const updFns: (() => void)[] = [];
  const ctlFns: (() => void)[] = [];
  let updateCalls = 0;
  const reg: RegistrationLike = {
    waiting: null, installing: null,
    addEventListener: (_t, f) => { updFns.push(f); },
    update: () => { updateCalls += 1; return Promise.resolve(); },
    ...opts.reg,
  };
  const sw: ContainerLike = {
    controller: opts.controller,
    register: () => Promise.resolve(reg),
    addEventListener: (_t, f) => { ctlFns.push(f); },
  };
  return {
    sw, reg,
    fireUpdateFound: () => { for (const f of updFns.slice()) f(); },
    fireControllerChange: () => { for (const f of ctlFns.slice()) f(); },
    updateCalls: () => updateCalls,
  };
}

describe("watchUpdates — 새 판을 알린다", () => {
  it("**반례: 첫 방문(컨트롤러 없음)에서는 알리지 않는다**", async () => {
    const f = fakeContainer({ controller: null });
    let n = 0;
    await watchUpdates(f.sw, "./sw.js", () => { n += 1; });
    // `clients.claim()`이 잡는 순간 — 첫 방문에서도 이것이 뜬다
    f.fireControllerChange();
    const w = fakeWorker();
    f.reg.installing = w;
    f.fireUpdateFound();
    w.set("installed");
    expect(n).toBe(0);
  });

  it("컨트롤러가 있던 탭에서 컨트롤러가 바뀌면 알린다(skipWaiting 경로)", async () => {
    const f = fakeContainer({ controller: {} });
    let n = 0;
    await watchUpdates(f.sw, "./sw.js", () => { n += 1; });
    f.fireControllerChange();
    expect(n).toBe(1);
  });

  it("`installed`로 넘어가도 알린다(skipWaiting을 안 쓰는 판으로 되돌려도 동작한다)", async () => {
    const f = fakeContainer({ controller: {} });
    let n = 0;
    await watchUpdates(f.sw, "./sw.js", () => { n += 1; });
    const w = fakeWorker();
    f.reg.installing = w;
    f.fireUpdateFound();
    w.set("installed");
    expect(n).toBe(1);
  });

  it("이미 `waiting`이 있으면 등록 직후에 알린다", async () => {
    const w = fakeWorker("installed");
    const f = fakeContainer({ controller: {}, reg: { waiting: w } });
    let n = 0;
    await watchUpdates(f.sw, "./sw.js", () => { n += 1; });
    expect(n).toBe(1);
  });

  it("**두 신호가 겹쳐도 한 번만 알린다** — 알림이 두 번 뜨면 사용자는 고장으로 읽는다", async () => {
    const w = fakeWorker();
    const f = fakeContainer({ controller: {} });
    let n = 0;
    await watchUpdates(f.sw, "./sw.js", () => { n += 1; });
    f.reg.installing = w;
    f.fireUpdateFound();
    w.set("installed");        // ① updatefound → installed
    w.set("activated");        // ② activated
    f.fireControllerChange();  // ③ controllerchange — 실제 워커에서 셋이 다 뜬다
    expect(n).toBe(1);
  });

  it("등록이 실패해도 던지지 않는다 — 오프라인 없이도 도구는 동작한다", async () => {
    const sw: ContainerLike = {
      controller: {},
      register: () => Promise.reject(new Error("no sw")),
      addEventListener: () => {},
    };
    const r = await watchUpdates(sw, "./sw.js", () => { throw new Error("불려선 안 된다"); });
    expect(r.reg).toBe(null);
    expect(r.hadController).toBe(true);
  });
});

describe("pollUpdates — 보이는 동안에만 묻는다", () => {
  const fakeDoc = (visibilityState: string) => {
    const fns: (() => void)[] = [];
    return {
      visibilityState,
      addEventListener: (_t: "visibilitychange", f: () => void) => { fns.push(f); },
      fire: () => { for (const f of fns.slice()) f(); },
    };
  };

  it("보일 때 `update()`를 부른다", () => {
    const f = fakeContainer({ controller: {} });
    const doc = fakeDoc("visible");
    const stop = pollUpdates(f.reg, 10_000, doc);
    doc.fire();
    stop();
    expect(f.updateCalls()).toBe(1);
  });

  it("**반례: 숨은 탭에서는 안 묻는다**", () => {
    const f = fakeContainer({ controller: {} });
    const doc = fakeDoc("hidden");
    const stop = pollUpdates(f.reg, 10_000, doc);
    doc.fire();
    stop();
    expect(f.updateCalls()).toBe(0);
  });

  it("주기는 분 단위다 — 화면 동작이라 원장에 안 들어간다(`UNHASHED_THRESHOLDS`)", () => {
    expect(SW_UPDATE_POLL_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe("applyUpdate — 눌렀을 때", () => {
  it("대기 중인 워커에 SKIP_WAITING을 보내고 다시 로드한다", () => {
    const w = fakeWorker("installed");
    let reloaded = 0;
    applyUpdate({ waiting: w, installing: null, addEventListener: () => {},
                  update: () => Promise.resolve() }, () => { reloaded += 1; });
    expect(w.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reloaded).toBe(1);
  });

  it("**대기 중인 워커가 없어도 다시 로드한다** — `sw.js`가 이미 skipWaiting을 부르는 경로", () => {
    let reloaded = 0;
    applyUpdate(null, () => { reloaded += 1; });
    expect(reloaded).toBe(1);
  });
});

describe("buildInfo — 화면에 찍는 값", () => {
  it("커밋 해시는 7자(+ 커밋 안 된 변경이면 `+`)이거나 `unknown`이다", () => {
    expect(BUILD.commit).toMatch(/^([0-9a-f]{7}\+?|unknown)$/);
  });

  it("라벨은 `커밋 · MM-DD HH:mm`", () => {
    expect(buildLabel({ commit: "abc1234", time: "2026-08-19T04:05:00.000Z" }))
      .toMatch(/^abc1234 · \d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("빌드 시각이 없으면 커밋만 — **빈칸으로 위장하지 않는다**(#32)", () => {
    expect(buildLabel({ commit: "abc1234", time: "" })).toBe("abc1234");
    expect(buildTitle({ commit: "abc1234", time: "" })).toContain("빌드 시각 없음");
  });

  it("**반례: 못 읽는 시각은 줄이지 않고 원문을 낸다**", () => {
    expect(shortTime("어제")).toBe("어제");
  });

  it("툴팁은 ISO 전문을 든다 — 배포 확인 절차가 이것을 커밋과 대조한다", () => {
    expect(buildTitle({ commit: "abc1234", time: "2026-08-19T04:05:00.000Z" }))
      .toContain("2026-08-19T04:05:00.000Z");
  });
});
