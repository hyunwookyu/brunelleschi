// **뷰 큐브**(6차 지시 1) — 평면 위젯이 아니라 **3D 큐브**다. 카메라를 따라 돌아
// 어디를 보는지가 큐브 자세로 보인다(CAD 뷰 큐브 관행 — A-3 선례).
//
// ```
// 면 6      정면·배면·좌·우 = **1점 투시 시점**(피치 0) · 위/아래 = 탑뷰·저면
//           (있되 손이 잘 안 감 — 면 중앙을 정확히 눌러야 간다, 아래 CUBE_TOL.top_center)
// 모서리 12  2점 투시 시점 (수평 모서리 = 요 45° · 상하 모서리 = 피치 ±45°)
// 꼭짓점 8   3점 투시 시점 (요 45° + 피치 ±35.26°)
// 화살표    상대 90°(지금 시점에서 90° — CAD 큐브 주변 작은 화살표. 절대 정렬이 우선이다)
// 드래그    연속 회전 (수직축 고정 — 요만 돈다)
// 빈 곳 탭  **가장 가까운 1점**(지시 1-3) — 가장 가까운 세계 축(±X·±Z) 정렬 + 피치 0
// ```
//
// 누르면 그 방향으로 스냅(비행 280ms — 시점 복귀와 같은 경로). 절대 스냅은 전부
// `stage.snapToDir`(궤도 중심을 향하고 거리 유지), 상대 회전은 `stage.spinYaw` 하나를
// 지난다(#17 — 카메라 수학은 stage 하나).
//
// 좌표계: 이 파일 안은 전부 **three 세계 축**이다(스테이지 `basisOf`가 그렇게 준다 — #24).
// 면 이름: +z 정면 · −z 배면 · +x 우 · −x 좌 · +y 위 · −y 아래
// (확정 카메라가 three −z를 보므로, 그때 마주 보이는 면이 +z = 정면이다.)
import type { Vec3 } from "../s3d/geom3d.js";

/**
 * **큐브 히트 판정 상수.** 조작 감도라 `test/constants.ts`에 안 넣는다(D-L49·D-L51의
 * 예외와 같은 자리 — 전역 해시를 동결한다). 값은 `view_cube.json`의 `ui_constants`로
 * 원장에 남는다.
 *
 * - `feature`: 히트점 좌표가 이보다 크면 그 축이 "걸린" 것 — 둘 걸리면 모서리,
 *   셋이면 꼭짓점(CAD 뷰 큐브의 관행적 밴드).
 * - `top_center`: 위/아래 면은 히트점이 면 중앙(이 반경 안)일 때만 탑뷰/저면이다 —
 *   바깥 고리는 가장 가까운 수평 면으로 보낸다(지시 1-1 "있되 손이 잘 안 감" ·
 *   1-3 "탭하면 ±X·±Z" — 굵은 탭이 실수로 탑뷰에 가지 않는다).
 * - `arrow_px`: 좌우 상대 90° 화살표의 히트 폭(px).
 */
export const CUBE_TOL = {
  feature: 0.62, top_center: 0.5, arrow_px: 20,
  /**
   * **재탭 = 가장 가까운 1점**(지시 1-3): 히트한 특징이 지금 보는 방향과 이 각(cos) 안이면
   * 그 특징으로의 스냅은 사실상 무이동이므로, 대신 가장 가까운 1점으로 간다. 면에서는 두
   * 동작의 목표가 같아 무손실이고, 2점·3점 시점에서는 탭 한 번이 1점 복귀가 된다 —
   * "이것이 가장 자주 쓰일 것이다". 인접 특징 간 최소 각이 35.26°(꼭짓점↔모서리)라
   * 30°는 다른 특징 클릭을 침범하지 않는다.
   */
  retap_cos: Math.cos((30 * Math.PI) / 180),
} as const;

/** 히트 결과 — `dir`는 큐브 바깥쪽 방향(단위, three 축). 시선은 그 반대다. */
export interface CubeFeature {
  kind: "face" | "edge" | "vertex";
  dir: Vec3;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * **큐브 광선 히트**(순수 — vitest 대상). 캔버스 픽셀 → 카메라 기저의 직교 광선 →
 * 단위 큐브 [−1,1]³ 슬랩 교차 → 면/모서리/꼭짓점 분류. 빗나가면 `null`
 * (호출자는 **가장 가까운 1점**으로 간다 — 지시 1-3).
 *
 * `scalePx`는 큐브 반변 길이(px), `(cx, cy)`는 캔버스 중심.
 */
export function cubeHit(
  px: number, py: number, cx: number, cy: number, scalePx: number,
  basis: { r: Vec3; u: Vec3; f: Vec3 },
): CubeFeature | null {
  const xv = (px - cx) / scalePx;
  const yv = (cy - py) / scalePx;                    // 캔버스 y 아래 → 뷰 y 위
  // 직교 광선: 원점은 화면점을 뷰 평면에 놓고 시선 반대로 물린 곳, 방향은 시선
  const o: Vec3 = [
    xv * basis.r[0] + yv * basis.u[0] - 3 * basis.f[0],
    xv * basis.r[1] + yv * basis.u[1] - 3 * basis.f[1],
    xv * basis.r[2] + yv * basis.u[2] - 3 * basis.f[2],
  ];
  const d = basis.f;
  // 슬랩 교차 — [−1,1]³
  let t0 = -Infinity, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (Math.abs(o[k]) > 1) return null;
      continue;
    }
    const a = (-1 - o[k]) / d[k], b = (1 - o[k]) / d[k];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t0 > t1) return null;
  const h: Vec3 = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0];
  const a = h.map(Math.abs) as Vec3;
  // 히트한 면(좌표 절댓값 최대 축)과, 밴드를 넘은 다른 축들
  let face = 0;
  for (let k = 1; k < 3; k++) if (a[k] > a[face]) face = k;
  const hot = [0, 1, 2].filter(k => k === face || a[k] > CUBE_TOL.feature);
  if (hot.length === 3) {
    return { kind: "vertex", dir: norm([Math.sign(h[0]), Math.sign(h[1]), Math.sign(h[2])]) };
  }
  if (hot.length === 2) {
    const dir: Vec3 = [0, 0, 0];
    for (const k of hot) dir[k] = Math.sign(h[k]);
    return { kind: "edge", dir: norm(dir) };
  }
  // 면 — 위/아래 면은 중앙일 때만(그 밖의 고리는 수평 면으로 — "손이 잘 안 감")
  if (face === 1) {
    const gx = Math.abs(h[0]), gz = Math.abs(h[2]);
    if (Math.max(gx, gz) > CUBE_TOL.top_center) {
      const k = gx >= gz ? 0 : 2;
      const dir: Vec3 = [0, 0, 0];
      dir[k] = Math.sign(h[k]);
      return { kind: "face", dir };
    }
  }
  const dir: Vec3 = [0, 0, 0];
  dir[face] = Math.sign(h[face]);
  return { kind: "face", dir };
}

/**
 * **가장 가까운 1점 시점**(지시 1-3 — 순수). 지금 시선에서 가장 가까운 세계 축
 * (±x·±z — 수직축은 후보가 아니다) 정렬 시선을 준다. 피치는 0이 된다 —
 * 1점 투시는 시선이 수평이어야 수직축이 화면 수직이다.
 */
export function nearestOnePointDir(f: Vec3): Vec3 {
  const cands: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  let best = cands[0], bd = -Infinity;
  for (const c of cands) {
    const dot = f[0] * c[0] + f[2] * c[2];
    if (dot > bd) { bd = dot; best = c; }
  }
  return best;
}

export interface CubeHost {
  /** 카메라의 세계 기저(three) — 큐브 자세와 히트 광선이 이것으로 선다. */
  basis(): { r: Vec3; u: Vec3; f: Vec3 };
  /** 상대 요 회전 — delta(rad), 애니메이션 ms(0이면 즉시). 드래그·화살표가 쓴다. */
  spin(delta: number, ms: number): void;
  /** 절대 시점 스냅 — 시선 방향(three). 궤도 중심을 향하고 거리 유지(stage.snapToDir). */
  snap(fwd: Vec3): void;
  /** 큐브를 보일 것인가(카메라가 서고 3D가 있을 때). */
  visible(): boolean;
}

/** 면 정의 — 법선(three)·이름. 꼭짓점 번호는 비트(x=1·y=2·z=4, +가 1)다. */
const FACES: { n: Vec3; label: string; corners: [number, number, number, number] }[] = [
  { n: [0, 0, 1], label: "정면", corners: [4, 5, 7, 6] },
  { n: [0, 0, -1], label: "배면", corners: [0, 1, 3, 2] },
  { n: [1, 0, 0], label: "우", corners: [1, 5, 7, 3] },
  { n: [-1, 0, 0], label: "좌", corners: [0, 2, 6, 4] },
  { n: [0, 1, 0], label: "위", corners: [2, 3, 7, 6] },
  { n: [0, -1, 0], label: "아래", corners: [0, 1, 5, 4] },
];

export class ViewCube {
  /** 토글(기본 켬). */
  on = true;
  private dragging = false;
  private moved = false;
  private lastX = 0;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement, private host: CubeHost) {
    canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true; this.moved = false; this.lastX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      if (!this.moved && Math.abs(dx) < 3) return;         // 클릭과 가르는 죽은 구간
      this.moved = true;
      this.lastX = e.clientX;
      // **드래그 = 연속 회전, 수직축 고정**(지시 1-1). 오른쪽으로 끌면 장면이 오른쪽으로
      this.host.spin(-dx * 0.012, 0);
    });
    const up = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.moved) return;
      const r = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.canvas.width;
      const py = ((e.clientY - r.top) / r.height) * this.canvas.height;
      const w = this.canvas.width, h = this.canvas.height;
      // ① 상대 90° 화살표(지시 1-2 — 선택 기능, 절대 정렬이 우선)
      if (Math.abs(py - h / 2) < 24) {
        if (px < CUBE_TOL.arrow_px) { this.host.spin(-Math.PI / 2, 280); return; }
        if (px > w - CUBE_TOL.arrow_px) { this.host.spin(Math.PI / 2, 280); return; }
      }
      // ② 큐브 히트 — 면/모서리/꼭짓점이면 그 방향으로 절대 스냅(시선 = −법선).
      //    단, **지금 보고 있는 특징의 재탭이면 가장 가까운 1점**(지시 1-3 — CUBE_TOL.retap_cos)
      const basis = this.host.basis();
      const hit = cubeHit(px, py, w / 2, h / 2, this.scale(), basis);
      if (hit) {
        const facing = -(hit.dir[0] * basis.f[0] + hit.dir[1] * basis.f[1] + hit.dir[2] * basis.f[2]);
        if (facing < CUBE_TOL.retap_cos) {
          this.host.snap([-hit.dir[0], -hit.dir[1], -hit.dir[2]]);
          return;
        }
      }
      // ③ 빗나감 또는 재탭 = **가장 가까운 1점**(지시 1-3)
      this.host.snap(nearestOnePointDir(basis.f));
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** 큐브 반변 길이(px) — 실루엣 대각(√3)이 화살표 띠를 안 덮는 크기다. */
  private scale(): number { return this.canvas.width * 0.22; }

  /** 3D 큐브를 직교 투영으로 그린다 — 카메라 기저를 따라 돈다. */
  private draw(): void {
    const show = this.on && this.host.visible();
    this.canvas.classList.toggle("hidden", !show);
    if (!show) return;
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width, h = this.canvas.height;
    const cx = w / 2, cy = h / 2, s = this.scale();
    ctx.clearRect(0, 0, w, h);
    const { r, u, f } = this.host.basis();
    // 꼭짓점 8: 비트 → ±1. 화면 = (·r, −·u)·s
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const c: Vec3 = [(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1];
      pts.push([
        cx + (c[0] * r[0] + c[1] * r[1] + c[2] * r[2]) * s,
        cy - (c[0] * u[0] + c[1] * u[1] + c[2] * u[2]) * s,
      ]);
    }
    // 앞을 보는 면만(볼록체라 서로 안 겹친다 — 정렬 불필요)
    for (const face of FACES) {
      const facing = -(face.n[0] * f[0] + face.n[1] * f[1] + face.n[2] * f[2]);
      if (facing < 0.02) continue;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const p = pts[face.corners[i]];
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      const shade = Math.round(232 + 20 * facing);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fill();
      ctx.strokeStyle = "#8a8a8a"; ctx.lineWidth = 1;
      ctx.stroke();
      if (facing > 0.4) {
        const fc = face.corners.reduce((acc, i) => [acc[0] + pts[i][0] / 4, acc[1] + pts[i][1] / 4], [0, 0]);
        ctx.fillStyle = face.label === "정면" ? "#1a99aa" : "#555";
        ctx.font = `${face.label.length > 1 ? 11 : 13}px system-ui, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(face.label, fc[0], fc[1]);
      }
    }
    // 좌·우 상대 90° 화살표(지시 1-2)
    ctx.fillStyle = "#999"; ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left"; ctx.fillText("◀", 3, cy);
    ctx.textAlign = "right"; ctx.fillText("▶", w - 3, cy);
  }

  dispose(): void { cancelAnimationFrame(this.raf); }
}
