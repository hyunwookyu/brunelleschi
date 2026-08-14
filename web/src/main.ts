// 엔트리 — W 전환 후 최소 셸. 카메라 확정 UI·추론 엔진은 W-1 이후 여기에 붙는다.
// 구 화면(footprint 압출 + 프레임 탭 + 치수 앵커 패널)은 W-A a에서 제거됐다.
import { InkCanvas } from "./capture/inkCanvas.js";

const canvas = document.getElementById("ink") as HTMLCanvasElement;
const stat = document.getElementById("stat")!;

function fit() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit();
window.addEventListener("resize", fit);

let n = 0;
const ink = new InkCanvas(canvas, {
  onStrokeEnd: () => { n += 1; stat.textContent = `획 ${n} — W-1 대기(카메라 미확정)`; },
});
ink.setFrame("persp");

document.getElementById("clear")!.addEventListener("click", () => {
  ink.clear(); n = 0; stat.textContent = "W-1 대기 — 카메라 확정 UI 미구현";
});
