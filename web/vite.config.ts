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

const useHttps = process.env.S2S_HTTP !== "1";
const PORT = 5173;

export default defineConfig({
  root: ".",
  // host: true → 0.0.0.0 바인딩(LAN 노출). 기존 127.0.0.1 고정을 대체한다.
  server: { host: true, port: PORT, strictPort: true },
  plugins: [...(useHttps ? [basicSsl()] : []), printLanUrls(useHttps, PORT)],
  build: { target: "es2022" },
});
