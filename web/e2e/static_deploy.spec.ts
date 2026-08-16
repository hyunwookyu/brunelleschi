// L-D.2 **정적 배포 확인** — 서버 없이, **하위 경로에서**, 오프라인으로 열리는가.
//
// 착수 시 `PITFALLS.md` 최근 다섯을 읽었다. 걸리는 것: **#32**(미실행을 반증으로 처리하지
// 않는다 — 인앱 브라우저에서 서비스 워커 등록이 막혀서 여기서 다시 잰다).
//
// 재는 것 셋:
//   ① 빌드본이 **하위 경로**(`/SKETCH2SPACE/`)에서 그대로 열린다 — Pages가 그 모양이다
//   ② 서비스 워커가 등록되고 **그 하위 경로를 scope로** 잡는다
//   ③ **오프라인**에서 새로고침해도 열린다(사전 캐시 목록이 실제로 듣는가)
//
// 서버는 이 스펙이 직접 띄운다(`http.server`가 아니라 Node) — 배포는 정적 파일뿐이므로
// 어떤 서버든 같아야 하고, 그것이 이 확인의 요점이다.
import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "dist");
const SUB = "/SKETCH2SPACE";           // Pages의 하위 경로를 흉내 낸다
const PORT = 8901;

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
};

let server: Server;

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, "l.html")),
            "빌드본이 없다 — `npm run build`를 먼저 돌린다(미실행은 반증이 아니다, #32)");
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let p = url.pathname;
    if (!p.startsWith(SUB)) { res.statusCode = 404; res.end("nope"); return; }
    p = p.slice(SUB.length) || "/";
    if (p.endsWith("/")) p += "l.html";
    try {
      const buf = await readFile(join(DIST, p));
      res.setHeader("Content-Type", MIME[extname(p)] ?? "application/octet-stream");
      res.end(buf);
    } catch {
      res.statusCode = 404; res.end("not found");
    }
  });
  await new Promise<void>(r => server.listen(PORT, r));
});

test.afterAll(async () => { await new Promise<void>(r => server?.close(() => r())); });

test("하위 경로에서 열리고, 서비스 워커가 잡히고, 오프라인에서도 뜬다", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  // ① 하위 경로에서 열린다 — `base: "./"`라 리포지토리 이름을 안 박아도 된다
  await page.goto(`http://localhost:${PORT}${SUB}/l.html`);
  await page.waitForFunction(() => !!(window as any).S2S);
  const app = await page.evaluate(() => {
    const s = (window as any).S2S;
    return {
      views: s.views().length,
      bar: [...document.querySelectorAll("#bar button")].map(b => (b as HTMLElement).textContent),
      assets: [...document.querySelectorAll("script[src]")].map(e => e.getAttribute("src")),
    };
  });
  expect(app.views).toBe(1);
  expect(app.bar).toContain("OBJ");
  expect(app.bar).toContain("JSON");
  // 절대 경로가 섞이면 하위 경로에서 404가 난다
  for (const a of app.assets) expect(a?.startsWith("/")).toBe(false);

  // ② 서비스 워커가 **그 하위 경로**를 scope로 잡는다
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toBe(`http://localhost:${PORT}${SUB}/`);

  // 사전 캐시가 채워질 틈을 준다(설치 → 활성). `ready`가 활성까지 기다린다.
  await page.reload();
  await page.waitForFunction(() => !!(window as any).S2S);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  expect(controlled).toBe(true);

  // ③ **오프라인에서도 뜬다** — 서버를 끊고 새로고침한다
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).S2S, undefined, { timeout: 15_000 });
  const offlineViews = await page.evaluate(() => (window as any).S2S.views().length);
  expect(offlineViews).toBe(1);
  await context.setOffline(false);

  expect(errors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
});
