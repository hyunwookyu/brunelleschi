// 서비스 워커 — 오프라인 동작 (계획서 §1.4).
//
// **캐시 우선, 네트워크 폴백.** 스케치 도구는 서버가 줄 새 데이터가 없으므로
// 네트워크를 먼저 기다릴 이유가 없다.
//
// **빌드가 목록을 넣어 준다**(S-9). `__PRECACHE__`는 `vite.config.ts`의 플러그인이
// 실제로 빌드된 파일 목록으로 바꾼다 — 그러지 않으면 첫 방문에서 **HTML만 캐시되고**
// 번들은 그때그때 받아 두는 것에 기대게 된다(그리는 도중 오프라인이 되면 다음 실행이 깨진다).
// 목록에 빌드 해시가 들어가므로 **판본이 바뀌면 캐시 이름도 바뀐다** — 낡은 번들이 안 남는다.
const PRECACHE = self.__PRECACHE__ || ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];
const CACHE = "sketch3d-" + (self.__BUILD__ || "dev");

self.addEventListener("install", (e) => {
  // 하나가 404여도 나머지는 캐시한다 — `addAll`은 하나만 실패해도 전부 버린다.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // 성공한 동일 출처 응답만 캐시에 넣는다. 오류 응답을 캐시하면 오프라인에서 굳는다.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    }),
  );
});
