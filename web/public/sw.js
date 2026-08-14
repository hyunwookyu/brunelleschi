// 서비스 워커 — 오프라인 동작 (계획서 §1.4).
//
// **캐시 우선, 네트워크 폴백.** 스케치 도구는 서버가 줄 새 데이터가 없으므로
// 네트워크를 먼저 기다릴 이유가 없다. 새 판본은 `CACHE` 이름을 바꿔 배포한다.
const CACHE = "sketch3d-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
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
