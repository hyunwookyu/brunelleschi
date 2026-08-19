/// <reference types="vitest" />
// 지시 4.1~4.2 — iPad 실기 접근용 설정.
//   4.1 LAN 노출(--host) + LAN IP 출력
//   4.2 HTTPS — Wake Lock(§5.2)과 getUserMedia(V-6)가 **secure context**를 요구한다.
//       localhost는 예외로 secure지만 **LAN IP는 아니므로** iPad에서 열려면 HTTPS가 필요하다.
//
// 실행:
//   npm run dev        LAN + HTTPS (기본, iPad용)
//   npm run dev:http    LAN + HTTP  (인증서 신뢰가 막힐 때 폴백 — Wake Lock은 동작하지 않는다)
import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { networkInterfaces } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * **빌드 식별자**(2026-08-19 17차 지시 0-1). 화면에 이것을 찍어야
 * *"업데이트가 안 된다"*를 **확인할 수 있다** — 지금까지는 화면만 보고 알 방법이 없었다.
 *
 * `package.json`의 `version`은 **손으로 올리는 값이라 안 맞는다.** 그래서 빌드 시각에
 * `git rev-parse --short=7 HEAD`를 읽어 상수로 박는다(지시 0-1 문면 그대로).
 *
 * ⚠ **빌드 시각이 들어가므로 같은 커밋을 다시 빌드해도 판본이 바뀐다.** 그것이 목적이다 —
 * 옛 판은 판본을 **파일 이름 목록**에서만 만들었고(`sha256(list)`), `l.html`처럼
 * **이름이 안 바뀌는 파일만 고친 빌드**는 `sw.js`가 바이트까지 같아져 브라우저가
 * *"새 워커 없음"*으로 읽었다. 그 상태에서는 cache-first가 옛 문서를 **영구히** 준다.
 */
function buildStamp() {
  const git = (args: string[]) => {
    try { return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return ""; }
  };
  // git이 없거나 저장소가 아니면 `unknown` — **0으로 위장하지 않는다**(#32: 미실행은 반증이 아니다)
  const head = git(["rev-parse", "--short=7", "HEAD"]) || "unknown";
  // 커밋되지 않은 변경이 섞인 빌드는 그 사실을 라벨이 말한다 — 해시만 보면 맞는 것처럼 보인다
  const dirty = head !== "unknown" && git(["status", "--porcelain"]) !== "";
  return {
    commit: dirty ? head + "+" : head,
    // 재현 빌드를 위한 문(비어 있으면 지금 시각). 값 자체는 표시용이다
    time: process.env.S2S_BUILD_TIME || new Date().toISOString(),
  };
}

const STAMP = buildStamp();

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

// 주소를 눈에 띄게 찍는다 — iPad에서 손으로 입력해야 하므로.
function printLanUrls(https: boolean, fallbackPort: number) {
  return {
    name: "print-lan-urls",
    configureServer(server: any) {
      server.httpServer?.once("listening", () => {
        const scheme = https ? "https" : "http";
        // --port로 덮어쓸 수 있으므로 **실제 바인딩된 포트**를 읽는다(하드코딩하면 어긋난다).
        const addr = server.httpServer?.address();
        const port = (addr && typeof addr === "object" && addr.port) || fallbackPort;
        const addrs = lanAddresses();
        const lines = [
          "",
          "  iPad에서 열 주소 (같은 Wi-Fi):",
          ...(addrs.length ? addrs.map(a => `    ${scheme}://${a}:${port}`)
                           : ["    (LAN 인터페이스를 찾지 못했습니다)"]),
        ];
        if (https) {
          lines.push(
            "  ※ 자체 서명 인증서입니다. iPad에서 경고가 뜨면 '고급 → 이 웹사이트 계속' 을 누르세요.",
            "     그래도 막히면 npm run dev:http 로 폴백하세요(단 Wake Lock은 동작하지 않습니다).");
        } else {
          lines.push("  ※ HTTP 모드 — secure context가 아니라 Wake Lock·마이크가 동작하지 않습니다.");
        }
        console.log(lines.join("\n") + "\n");
      });
    },
  };
}

/**
 * **서비스 워커에 빌드 목록을 넣는다**(S-9). `public/sw.js`는 그대로 복사되므로 빌드 결과를
 * 모른다 — 그대로 두면 첫 방문에서 HTML만 캐시되고 번들은 "언젠가 받아 둔 것"에 기댄다.
 *
 * 여기서 실제 산출 파일 이름을 넣어 주면 설치 시점에 전부 캐시되고, 이름에 빌드 해시가
 * 들어가므로 **판본이 바뀌면 캐시 이름도 바뀐다**(낡은 번들이 안 남는다).
 */
function swPrecache() {
  return {
    name: "sw-precache",
    apply: "build" as const,
    writeBundle(opts: { dir?: string }, bundle: Record<string, unknown>) {
      const dir = opts.dir ?? "dist";
      const sw = join(dir, "sw.js");
      if (!existsSync(sw)) return;
      const files = Object.keys(bundle)
        .filter(f => f !== "sw.js" && !f.endsWith(".map"))
        .map(f => "./" + f.replace(/\\/g, "/"));
      const list = ["./", "./manifest.webmanifest", "./icon.svg",
                    "./icon-192.png", "./icon-512.png", ...files];
      // ⚠⚠ **판본을 목록만으로 만들지 않는다**(2026-08-19 17차 지시 0-2c).
      // 옛 판은 `sha256(list)`였고 주석에 *"내용이 같으면 같은 이름이라 재설치가 안 일어난다"*고
      // 적혀 있었다 — 그런데 `l.html`은 **이름이 안 바뀌는 파일**이다. 그 파일만 고친 빌드는
      // 목록이 그대로라 `sw.js`가 **바이트까지 같아지고**, 브라우저는 "새 워커 없음"으로 읽는다.
      // 그러면 cache-first가 옛 문서를 영구히 준다 — 사람이 캐시를 지워야 했던 그 상태다.
      // **커밋과 빌드 시각을 판본에 넣어** 빌드마다 캐시 이름이 바뀌게 한다(지시 0-2c 문면).
      const build = createHash("sha256")
        .update([...list, STAMP.commit, STAMP.time].join("|")).digest("hex").slice(0, 8);
      writeFileSync(sw,
        `self.__PRECACHE__ = ${JSON.stringify([...new Set(list)])};\n`
        + `self.__BUILD__ = ${JSON.stringify(build)};\n`
        // 화면 표시(`buildInfo.ts`)와 **같은 값**을 워커도 든다 — 진단이 둘로 갈리지 않는다(#17)
        + `self.__COMMIT__ = ${JSON.stringify(STAMP.commit)};\n`
        + `self.__BUILD_TIME__ = ${JSON.stringify(STAMP.time)};\n`
        + readFileSync(sw, "utf-8"), "utf-8");
      console.log(`  sw.js — 사전 캐시 ${list.length}개 · 판본 ${build} · 커밋 ${STAMP.commit}`);
    },
  };
}

const useHttps = process.env.S2S_HTTP !== "1";
const PORT = 5173;

/**
 * **정적 배포의 base 경로**(L-D.2). GitHub Pages는 `https://<user>.github.io/<repo>/`처럼
 * **하위 경로**에 올라가므로 `/assets/...` 절대 경로가 404가 된다. 빌드할 때
 * `S2S_BASE=/SKETCH2SPACE/`를 주면 그 경로가 붙는다.
 *
 * 기본은 `"./"`(상대 경로)다 — **어느 하위 경로에 올려도 열리고** `file://`로도 열린다.
 * 상대 경로가 안 되는 것은 서비스 워커의 `scope`뿐인데, 그것은 등록할 때 현재 경로를 쓴다.
 */
const BASE = process.env.S2S_BASE ?? "./";

export default defineConfig({
  root: ".",
  base: BASE,
  // host: true → 0.0.0.0 바인딩(LAN 노출). 기존 127.0.0.1 고정을 대체한다.
  server: { host: true, port: PORT, strictPort: true },
  plugins: [...(useHttps ? [basicSsl()] : []), printLanUrls(useHttps, PORT), swPrecache()],
  /**
   * **빌드 식별자를 상수로 박는다**(지시 0-1). `src/ui/buildInfo.ts`가 이 둘을 읽고
   * 하단바 구석에 찍는다. 개발 서버에서도 정의되므로 `dev`에서도 같은 자리에 뜬다.
   * ⚠ vitest도 이 설정을 쓰므로 단위 테스트에서도 정의된다 — `buildInfo.ts`의 `typeof` 방어는
   * 그 밖(순수 `tsc`·다른 번들러)에서의 안전장치다.
   */
  define: {
    __S2S_COMMIT__: JSON.stringify(STAMP.commit),
    __S2S_BUILD_TIME__: JSON.stringify(STAMP.time),
  },
  // **화면은 `l.html` 하나다** — L-D.3 종단 검증을 통과한 뒤 옛 UI(`index.html`·`main.ts`·
  // `cameraPanel.ts`)를 지웠다(2026-08-16, A-4: 폐기 코드를 지우기 전에 게이트를 통과시킨다).
  // 루트로 들어온 사람은 `public/index.html`(리다이렉트 한 장)이 `l.html`로 보낸다.
  build: {
    target: "es2022",
    rollupOptions: { input: { l: "l.html" } },
  },
  // **vitest는 `test/`만 본다** — `e2e/`는 Playwright 것이라 vitest가 집으면
  // `test.describe.configure()`에서 터진다(실제로 걸렸다. 두 러너가 같은 확장자를 쓴다).
  test: { include: ["test/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**", "dist/**"] },
});
