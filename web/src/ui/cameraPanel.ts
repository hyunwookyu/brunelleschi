// W-1 카메라 확정 화면 — 계획서 §3.2 상태 표시 / §3.4 실시간 유효성 / §3.7 프리셋.
//
// 이론서 5.3의 자유도 회계 표가 그대로 화면에 나온다. 부족하면 **무엇이 부족한지**
// 보이고, 채우는 방법이 여럿임을 보인다(점 찍기든 선 긋기든 지평선이든 같은 자리에 닿는다).
//
// DOM만 만진다. 계산은 전부 `constraints.ts`에 있고 여기서는 **표시**만 한다.
import { ConstraintAccumulator, PRESETS, fPixelsFrom35mm, type AxisId } from "../s3d/constraints.js";
import { guides, AXIS_COLOR, HORIZON_COLOR, GROUND_COLOR } from "../s3d/grid.js";
import type { Pt2 } from "../s3d/camera.js";

export type Tool = "draw" | "edit" | "vp0" | "vp1" | "vp2" | "horizon";

const AXIS_NAME = ["축 1 (가로)", "축 2 (안쪽)", "축 3 (수직)"];

export class CameraPanel {
  readonly acc: ConstraintAccumulator;
  tool: Tool = "vp0";
  locked = false;                       // 소프트 락 (§3.5)
  private lensMm = 35;
  private onChange: () => void;

  constructor(imgSize: [number, number], onChange: () => void) {
    this.acc = new ConstraintAccumulator(imgSize);
    this.onChange = onChange;
  }

  get imgSize(): [number, number] { return this.acc.imgSize; }

  /** 캔버스에서 온 제스처 하나. 도구에 따라 무엇으로 셀지 정해진다. */
  handleStroke(a: Pt2, b: Pt2): boolean {
    if (this.locked) return false;
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    switch (this.tool) {
      case "horizon":
        this.acc.add({ kind: "horizon", a, b }); break;
      case "vp0": case "vp1": case "vp2": {
        const axis = Number(this.tool.slice(2)) as AxisId;
        // 짧으면 점 찍기(소실점 확정), 길면 선 긋기(그 위에 있다는 제약)
        if (dist < 12) this.acc.add({ kind: "vp_point", axis, at: a });
        else this.acc.add({ kind: "vp_line", axis, a, b });
        break;
      }
      default: return false;
    }
    this.onChange();
    return true;
  }

  setLens(mm: number) {
    this.lensMm = mm;
    this.acc.add({ kind: "lens", f: fPixelsFrom35mm(mm, this.imgSize[0]) });
    this.onChange();
  }
  get lens() { return this.lensMm; }

  applyPreset(id: string) {
    const p = PRESETS.find(x => x.id === id);
    if (!p) return;
    this.setLens(p.mm);
  }

  reset() { this.acc.reset(); this.locked = false; this.onChange(); }
  toggleLock() { this.locked = !this.locked; this.onChange(); }

  vps(): (Pt2 | null)[] {
    const s = this.acc.solve().axes;
    return ([0, 1, 2] as AxisId[]).map(a => (s[a].status === "fixed" ? (s[a] as any).vp as Pt2 : null));
  }

  /** 캔버스에 가이드를 깐다 (§3.8). 잉크보다 **아래**에 그린다. */
  drawGuides(ctx: CanvasRenderingContext2D) {
    const r = this.acc.solve();
    const lines = guides(r.camera, this.vps(), this.imgSize,
      r.camera.principalPoint ? r.camera.principalPoint[1] : null);
    ctx.save();
    for (const l of lines) {
      ctx.beginPath();
      ctx.moveTo(l.a[0], l.a[1]); ctx.lineTo(l.b[0], l.b[1]);
      if (l.kind === "horizon") {
        ctx.strokeStyle = HORIZON_COLOR; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
        ctx.globalAlpha = 0.7;
      } else if (l.kind === "ground") {
        ctx.strokeStyle = GROUND_COLOR; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.globalAlpha = 0.22;
      } else {
        ctx.strokeStyle = AXIS_COLOR[l.axis ?? 0]; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.globalAlpha = 0.16;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 화면 밖 소실점을 가장자리 화살표로 알린다 (§3.8).
   * 2점 투시에서 흔한 상황이라 "안 보이니까 없다"고 읽히면 안 된다.
   * 선을 두 개 그으면 교점이 화면 밖이어도 확정되므로 별도 좌표계는 필요 없다.
   */
  drawOffscreenVps(ctx: CanvasRenderingContext2D) {
    const [w, h] = this.imgSize;
    this.vps().forEach((v, i) => {
      if (!v) return;
      if (v[0] >= 0 && v[0] <= w && v[1] >= 0 && v[1] <= h) return;
      const cx = w / 2, cy = h / 2;
      const dx = v[0] - cx, dy = v[1] - cy;
      const L = Math.hypot(dx, dy) || 1;
      const m = 22;
      const t = Math.min((cx - m) / Math.abs(dx || 1e-9), (cy - m) / Math.abs(dy || 1e-9));
      const px = cx + (dx / L) * L * t, py = cy + (dy / L) * L * t;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(px, py); ctx.rotate(ang);
      ctx.fillStyle = AXIS_COLOR[i]; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(-6, 6); ctx.lineTo(-6, -6); ctx.closePath();
      ctx.fill();
      ctx.restore();
      // 얼마나 멀리 있는지 — 화면 폭 대비
      ctx.save();
      ctx.fillStyle = AXIS_COLOR[i]; ctx.globalAlpha = 0.85;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${(Math.hypot(dx, dy) / w).toFixed(1)}W`, px - (dx / L) * 18, py - (dy / L) * 18 + 4);
      ctx.restore();
    });
  }

  /** §3.2 상태 표시 = 이론서 5.3 자유도 회계 표. */
  renderStatus(el: HTMLElement) {
    const r = this.acc.solve();
    const c = r.camera;
    const caseLabel = { "3pt": "3점 투시", "2pt": "2점 투시", "1pt": "1점 투시", axonometric: "평행(축측)" }[c.case];
    const rows: string[] = [];

    rows.push(`<div class="hdr"><b>${caseLabel}</b> · 소실점 ${c.nVps}개`
      + (this.locked ? ' <span class="lock">잠김</span>' : "") + "</div>");

    // 축별 상태 — 무엇이 정해졌고 어떻게 정해졌는지
    for (const a of [0, 1, 2] as AxisId[]) {
      const s = r.axes[a];
      const dot = `<i style="background:${AXIS_COLOR[a]}"></i>`;
      let txt: string;
      if (s.status === "fixed") {
        const src = { point: "점", lines: `선 ${s.nLines}개`, "horizon×line": "지평선×선" }[s.source];
        const res = s.residual != null && s.residual > 0.002 ? ` · 어긋남 ${(s.residual * 100).toFixed(1)}%` : "";
        txt = `<b>확정</b> <span class="dim">(${src}${res})</span>`;
      } else if (s.status === "on_line") {
        txt = `<span class="need">선 위 — 자유도 1</span>`;
      } else {
        txt = `<span class="need">미정</span>`;
      }
      rows.push(`<div class="ax">${dot}${AXIS_NAME[a]} ${txt}</div>`);
    }

    // f와 그 출처 — provenance를 숨기지 않는다
    if (c.ok && c.f != null) {
      const src = { "orthocenter(6.3)": "수심(3점, 측정)", "two_vps(6.2)": "두 소실점(측정)", "setting(렌즈)": "렌즈 설정" }[c.fSource!];
      rows.push(`<div class="f">f = ${c.f.toFixed(0)}px · 화각 ${c.fovDeg}° <span class="dim">(${src})</span></div>`);
    } else if (c.case === "1pt") {
      rows.push(`<div class="f need">f 미설정 — 깊이 미결정</div>`);
    }

    // 실척으로 바로 읽히는 축 (7.7)
    if (c.directScaleAxes.length) {
      const ko = { width: "폭", height: "높이", depth: "깊이" } as Record<string, string>;
      rows.push(`<div class="dim">실척 비례로 바로 읽히는 방향: ${c.directScaleAxes.map(x => ko[x]).join("·")}</div>`);
    }
    if (c.assumption) rows.push(`<div class="dim assume">${c.assumption}</div>`);

    for (const w of r.warnings) {
      rows.push(`<div class="${w.level}">${w.level === "error" ? "✕" : "!"} ${w.text}</div>`);
    }
    for (const rem of r.remaining) {
      rows.push(`<div class="hint">· ${rem.hint}</div>`);
    }
    el.innerHTML = rows.join("");
  }
}
